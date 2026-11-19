"""Local CTC sequence adaptation with training-only 9/4 and tail supervision."""
import argparse
import base64
import copy
import hashlib
import json
from pathlib import Path
import random
import shutil
import subprocess
import sys
import time

from train_cpu import SOURCE_REVISION, eligible, load_rows, score, sha, summarize, write_json
from analyze_preprocessing import BrowserBridge
from ctc_alignment import aligned_character_frames, focused_positions
from augment_handwriting import PROFILES, varied_handwriting


def configure_trainable(model, visual_tail=False):
    names = []
    prefixes = ("head.ctc_encoder.", "head.ctc_head.fc.")
    if visual_tail:
        prefixes += ("backbone.blocks6.",)
    for name, parameter in model.named_parameters():
        allowed = (name.startswith(prefixes)
                   and not name.endswith(("._mean", "._variance")))
        parameter.stop_gradient = not allowed
        if allowed:
            names.append(name)
    return names


def cached_visual_features(model, image, visual_tail):
    if not visual_tail:
        return model.backbone(image)
    x = model.backbone.conv1(image)
    for name in ('blocks2', 'blocks3', 'blocks4', 'blocks5'):
        x = getattr(model.backbone, name)(x)
    return x


def sequence_logits(model, features, visual_tail):
    if visual_tail:
        import paddle.nn.functional as F
        features = F.avg_pool2d(model.backbone.blocks6(features), [3, 2])
    return model.head.ctc_head.fc(model.head.ctc_encoder(features))


def original_views_only(features, base_keys, augmentation_keys):
    """Reuse verified original views without admitting unknown or held-out keys."""
    if set(features) not in (base_keys, base_keys | augmentation_keys):
        raise ValueError("Unexpected cached feature keys")
    return {k: features[k] for k in sorted(base_keys)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for key in ("dataset", "paddleocr", "audit", "prior-run", "run-dir", "node"):
        parser.add_argument("--" + key, required=True, type=Path)
    parser.add_argument("--reuse-cache", type=Path)
    parser.add_argument("--seed", type=int, default=20261121)
    parser.add_argument("--focus-weight", type=float, choices=[0.0, 0.05, 0.2], default=0.05)
    parser.add_argument("--epochs", type=int, choices=range(1, 7), default=6)
    parser.add_argument("--learning-rate-scale", type=float, choices=[0.5, 1.0], default=1.0)
    parser.add_argument("--patience", type=int, choices=[0, 1, 2, 3], default=0,
                        help="Stop after this many epochs without an eligible improvement; zero disables")
    parser.add_argument("--augment", action="store_true", help="Add fixed small width/slant variations to training only")
    parser.add_argument("--visual-tail", action="store_true", help="Also adapt only the last visual block group")
    args = parser.parse_args()
    root, source, audit_dir, prior, out = [p.resolve() for p in
                                         (args.dataset, args.paddleocr, args.audit, args.prior_run, args.run_dir)]
    repo = Path(__file__).resolve().parents[2]
    assert not out.is_relative_to(repo)
    audit = json.loads((audit_dir / "audit.json").read_text(encoding="utf-8"))
    prior_result = json.loads((prior / "result.json").read_text(encoding="utf-8"))
    initial = Path(prior_result["selected_checkpoint"])
    assert sha(initial) == prior_result["selected_sha256"]
    assert sha(root / "dataset-freeze.v1.json") == audit["dataset_manifest_sha256"]
    for name, digest in json.loads((root / "dataset-freeze.v1.json").read_text(encoding="utf-8"))["files"].items():
        assert sha(root / name) == digest
    assert subprocess.check_output(["git", "-C", str(source), "rev-parse", "HEAD"], text=True).strip() == SOURCE_REVISION
    assert not subprocess.check_output(["git", "-C", str(source), "status", "--porcelain"], text=True).strip()
    rows = [{**r, "split": split} for split in ("train", "validation") for r in load_rows(root, split)]
    lookup = {r["image"]: r for r in audit["records"]}
    assert len(lookup) == len(rows)
    repaired = json.loads((audit_dir / "training-crop-repairs.json").read_text(encoding="utf-8"))
    repair_map = {r["image"]: r for r in repaired["changes"]}
    for row in rows:
        expected = lookup[row["image"]]
        assert row["split"] == expected["split"] and row["label"] == expected["label"]
        if row["image"] in repair_map:
            assert row["split"] == "train"
            row["path"] = Path(repair_map[row["image"]]["derived_image"])
        elif row["field"] == "steel":
            row["path"] = audit_dir / "derived-crops" / row["path"].name
        assert sha(row["path"]) == expected["input_sha256"]
    assert {Path(r["image"]).name[:3] for r in rows} == {"P01", "P02", "P03"}
    for name, digest in audit["core_hashes"].items():
        assert sha(repo / "DS-CYLINDER-REGISTRATION-DEMO" / name) == digest
    assert sha(Path(__file__).with_name("browser_bridge.cjs")) == audit["bridge_sha256"]
    sys.path.insert(0, str(source))
    import numpy as np
    import paddle
    import paddle.nn.functional as F
    import yaml
    from PIL import Image
    from ppocr.modeling.architectures import build_model
    paddle.set_device("cpu")
    paddle.seed(args.seed)
    np.random.seed(args.seed)
    rng = random.Random(args.seed)
    config_path = source / "configs/rec/PP-OCRv5/multi_language/en_PP-OCRv5_mobile_rec.yaml"
    config = yaml.safe_load(config_path.read_text(encoding="utf-8"))
    chars = audit["characters"]
    char_ids = {c: i for i, c in enumerate(chars)}
    config["Architecture"]["Head"]["out_channels_list"] = {"CTCLabelDecode": len(chars), "NRTRLabelDecode": len(chars) + 3}
    model = build_model(copy.deepcopy(config["Architecture"]))
    state = paddle.load(str(initial))
    assert set(state) == set(model.state_dict())
    assert all(list(state[k].shape) == list(v.shape) for k, v in model.state_dict().items())
    model.set_state_dict(state)
    model.eval()  # Keep batch statistics and dropout fixed; gradients still train the selected weights.
    if args.visual_tail:
        # Official use_guide detaches visual input. Change gradient flow only, not inference math.
        model.head.ctc_encoder.encoder.use_guide = False
    trainable_names = configure_trainable(model, args.visual_tail)
    assert trainable_names and any(k.startswith("head.ctc_encoder.") for k in trainable_names)
    frozen_hashes = {k: hashlib.sha256(v.numpy().tobytes()).hexdigest() for k, v in state.items() if k not in trainable_names}
    out.mkdir(parents=True, exist_ok=False)
    tracked = [Path(__file__), *[Path(__file__).with_name(n) for n in
               ("ctc_alignment.py", "augment_handwriting.py", "train_cpu.py", "analyze_preprocessing.py", "browser_bridge.cjs")],
               *[repo / "DS-CYLINDER-REGISTRATION-DEMO" / n for n in ("handwriting-core.js", "rules.js")]]
    hashes = {str(p.relative_to(repo)): sha(p) for p in tracked}
    snapshot = out / "source-snapshot"
    snapshot.mkdir()
    for p in tracked:
        shutil.copy2(p, snapshot / p.name)
    run = {"profile": "ctc-sequence-focus-v5", "seed": args.seed, "epochs": args.epochs,
           "learning_rate_encoder": 0.000002 * args.learning_rate_scale,
           "learning_rate_classifier": 0.00001 * args.learning_rate_scale,
           "learning_rate_scale": args.learning_rate_scale,
           "early_stop_patience": args.patience,
           "gradient_accumulation": 4, "ctc_loss": "normalized by label length",
           "focused_ce_weight": args.focus_weight, "focused_targets": "training 9/4 occurrences and final character",
           "alignment": "fixed legal CTC Viterbi path from initial model and P01/P02 labels only",
           "teacher_kl_weight": 0.15, "teacher_temperature": 2,
           "backbone": "blocks6 only" if args.visual_tail else "frozen",
           "learning_rate_visual_tail": 0.000001 * args.learning_rate_scale if args.visual_tail else 0,
           "feature_stage": "blocks5" if args.visual_tail else "pooled_backbone",
           "training_augmentation": list(map(list, PROFILES)) if args.augment else [],
           "batch_statistics_and_dropout": "eval mode; no width padding between encoder samples",
           "trainable_names": trainable_names, "source_hashes": hashes, "source_revision": SOURCE_REVISION,
           "audit_sha256": sha(audit_dir / "audit.json"), "initial_sha256": sha(initial),
           "prior_result_sha256": sha(prior / "result.json"), "holdout_used": False, "exported": False,
           "selection": "P03 steel exact, CTN exact, CER; neither field regresses and all previously correct strings preserved"}
    write_json(out / "run-config.json", run)
    bridge = BrowserBridge(args.node)
    started, updates = time.time(), 0
    def logits(features):
        return sequence_logits(model, features, args.visual_tail)
    def progress(value):
        result = {**value, "seconds": time.time() - started, "updates": updates}
        write_json(out / "status.json", result)
        print(json.dumps(result), flush=True)
    try:
        features = {}
        if args.reuse_cache:
            cache_dir = args.reuse_cache.resolve()
            manifest = json.loads((cache_dir / "backbone-cache.json").read_text(encoding="utf-8"))
            assert manifest["initial_sha256"] == sha(initial) and manifest["audit_sha256"] == run["audit_sha256"]
            assert manifest["cache_sha256"] == sha(cache_dir / "backbone.npz")
            assert manifest["source_revision"] == SOURCE_REVISION
            assert manifest.get('feature_stage', 'pooled_backbone') == run['feature_stage']
            features = dict(np.load(cache_dir / "backbone.npz", allow_pickle=False))
            write_json(out / "reused-cache.json", {"path": str(cache_dir), "manifest_sha256": sha(cache_dir / "backbone-cache.json")})
        else:
            with paddle.no_grad():
                for index, row in enumerate(rows):
                    with Image.open(row["path"]) as photo:
                        rgb = photo.convert("RGB")
                        prepared = bridge.call({"type": "prepare", "width": rgb.width, "height": rgb.height,
                                                "rgb": base64.b64encode(rgb.tobytes()).decode("ascii")})
                    for vi, view in enumerate(prepared["views"]):
                        key = f"{index:03d}-{vi}"
                        x = paddle.to_tensor(np.frombuffer(base64.b64decode(view["data"]), dtype="<f4").reshape(view["dims"]).copy())
                        feature = cached_visual_features(model, x, args.visual_tail)
                        features[key] = feature.numpy()
                        if index < 2 or index == len(rows) - 1:
                            np.testing.assert_allclose(F.softmax(logits(feature), axis=-1).numpy(), model(x).numpy(), rtol=1e-6, atol=1e-6)
                    if (index + 1) % 16 == 0:
                        progress({"state": "preparing_features", "completed": index + 1, "total": len(rows)})
            np.savez_compressed(out / "backbone.npz", **features)
            write_json(out / "backbone-cache.json", {"cache_sha256": sha(out / "backbone.npz"),
                       "initial_sha256": sha(initial), "audit_sha256": run["audit_sha256"],
                       "source_revision": SOURCE_REVISION, "source_hashes": hashes,
                       "feature_stage": run['feature_stage'], "holdout_used": False})
        base_keys = {f"{i:03d}-{v}" for i in range(len(rows)) for v in (0, 1)}
        known_augmentation_keys = {f"{i:03d}-aug{a}-{v}" for i, row in enumerate(rows) if row['split'] == 'train'
                                   for a in range(len(PROFILES)) for v in (0, 1)}
        augmentation_keys = known_augmentation_keys if args.augment else set()
        if args.reuse_cache:
            for p in tracked:
                if p.name in ('browser_bridge.cjs', 'handwriting-core.js', 'rules.js'):
                    assert manifest['source_hashes'][str(p.relative_to(repo))] == sha(p)
            if not args.augment:
                total_cached = len(features)
                features = original_views_only(features, base_keys, known_augmentation_keys)
                write_json(out / 'cache-subset.json', {'available_views': total_cached,
                           'used_original_views': len(features), 'augmented_views_used': False})
            with paddle.no_grad():
                for index in (0, 1, len(rows) - 1):
                    with Image.open(rows[index]['path']) as photo:
                        rgb = photo.convert('RGB')
                        prepared = bridge.call({'type': 'prepare', 'width': rgb.width, 'height': rgb.height,
                                                'rgb': base64.b64encode(rgb.tobytes()).decode('ascii')})
                    for vi, view in enumerate(prepared['views']):
                        x = paddle.to_tensor(np.frombuffer(base64.b64decode(view['data']), dtype='<f4').reshape(view['dims']).copy())
                        feature = paddle.to_tensor(features[f'{index:03d}-{vi}'])
                        np.testing.assert_allclose(feature.numpy(), cached_visual_features(model, x, args.visual_tail).numpy(), rtol=1e-6, atol=1e-6)
                        np.testing.assert_allclose(F.softmax(logits(feature), axis=-1).numpy(), model(x).numpy(), rtol=1e-6, atol=1e-6)
        if args.augment and not augmentation_keys.issubset(features):
            assert set(features) == base_keys
            augmented_rows = [(i, row) for i, row in enumerate(rows) if row['split'] == 'train']
            with paddle.no_grad():
                for done, (index, row) in enumerate(augmented_rows, 1):
                    assert Path(row['image']).name[:3] in {'P01', 'P02'}
                    with Image.open(row['path']) as photo:
                        for a, (scale, shear) in enumerate(PROFILES):
                            rgb = varied_handwriting(photo, scale, shear)
                            prepared = bridge.call({'type': 'prepare', 'width': rgb.width, 'height': rgb.height,
                                                    'rgb': base64.b64encode(rgb.tobytes()).decode('ascii')})
                            for vi, view in enumerate(prepared['views']):
                                x = paddle.to_tensor(np.frombuffer(base64.b64decode(view['data']), dtype='<f4').reshape(view['dims']).copy())
                                features[f'{index:03d}-aug{a}-{vi}'] = cached_visual_features(model, x, args.visual_tail).numpy()
                            if done <= 2:
                                rgb.save(out / f'augmentation-preview-{done}-{a}.png')
                    if done % 16 == 0:
                        progress({'state': 'preparing_training_variations', 'completed': done, 'total': len(augmented_rows)})
            np.savez_compressed(out / 'backbone.npz', **features)
            write_json(out / 'backbone-cache.json', {'cache_sha256': sha(out / 'backbone.npz'),
                       'initial_sha256': sha(initial), 'audit_sha256': run['audit_sha256'],
                       'source_revision': SOURCE_REVISION, 'source_hashes': hashes, 'feature_stage': run['feature_stage'],
                       'augmentation_profiles': list(map(list, PROFILES)), 'holdout_used': False})
        elif args.augment:
            assert manifest['augmentation_profiles'] == list(map(list, PROFILES))
            assert manifest['source_hashes'][str(Path(__file__).with_name('augment_handwriting.py').relative_to(repo))] == sha(Path(__file__).with_name('augment_handwriting.py'))
        assert set(features) == base_keys | augmentation_keys
        assert all(np.isfinite(f).all() and f.ndim == 4 and f.shape[0] == 1 for f in features.values())
        for i, row in enumerate(rows):
            row["keys"] = [f"{i:03d}-{v}" for v in (0, 1)]
            if args.augment and row['split'] == 'train':
                row['keys'] += [f'{i:03d}-aug{a}-{v}' for a in range(len(PROFILES)) for v in (0, 1)]
        train = [r for r in rows if r["split"] == "train"]
        validation = [r for r in rows if r["split"] == "validation"]
        def evaluate(name, targets=validation):
            predictions = []
            probabilities = {}
            with paddle.no_grad():
                for row in targets:
                    outputs = []
                    for key in row["keys"]:
                        output = F.softmax(logits(paddle.to_tensor(features[key])), axis=-1).numpy()
                        probabilities[key] = output
                        outputs.append({"dims": list(output.shape), "data": base64.b64encode(output.astype("<f4").tobytes()).decode("ascii")})
                    decoded = bridge.call({"type": "decode", "outputs": outputs, "characters": chars, "field": row["field"]})
                    picked = decoded["aspect_views_rules"]
                    predictions.append({"image": row["image"], "field": row["field"], "label": row["label"],
                                        "prediction": "".join(picked["text"].upper().split()), "raw": picked["text"],
                                        "confidence": picked["score"], "raw_view": decoded["aspect_raw"]["text"],
                                        "ink_view": decoded["aspect_ink"]["text"]})
            result = {"metrics": summarize(predictions), "predictions": predictions,
                      "view_metrics": {v: summarize([{**p, "raw": p[v], "prediction": "".join(p[v].upper().split())}
                                                    for p in predictions]) for v in ("raw_view", "ink_view")}}
            write_json(out / (name + ".json"), result)
            np.savez_compressed(out / (name + "-probabilities.npz"), **probabilities)
            return result
        baseline_result = evaluate("validation-baseline")
        prior_predictions = json.loads((prior / f"validation-epoch-{prior_result['selected_epoch']}.json").read_text(encoding="utf-8"))["predictions"]
        assert [p["prediction"] for p in baseline_result["predictions"]] == [p["prediction"] for p in prior_predictions]
        baseline = best = baseline_result["metrics"]
        protected = {p["image"] for p in baseline_result["predictions"] if p["prediction"] == p["label"]}
        progress({"state": "baseline_complete", "metrics": baseline})
        training = []
        alignment_records = []
        with paddle.no_grad():
            for row in train:
                assert Path(row["image"]).name[:3] in {"P01", "P02"}
                label = [char_ids[c] for c in row["label"]]
                for key in row["keys"]:
                    initial_logits = logits(paddle.to_tensor(features[key]))
                    log_prob = F.log_softmax(initial_logits, axis=-1).numpy()[0]
                    frames = aligned_character_frames(log_prob, label)
                    positions = focused_positions(row["label"])
                    training.append({"key": key, "label": label, "frames": [frames[j] for j in positions],
                                     "focus_labels": [label[j] for j in positions],
                                     "teacher": F.softmax(initial_logits / 2.0, axis=-1).numpy()})
                    alignment_records.append({"image": row["image"], "key": key, "label": row["label"],
                                              "frames": frames, "focused_positions": positions})
        write_json(out / "training-alignments.json", {"records": alignment_records, "validation_labels_used": False})
        loss_ctc = paddle.nn.CTCLoss(blank=0, reduction="none")
        parameter_groups = [
            {"params": [p for p in model.head.ctc_encoder.parameters() if not p.stop_gradient], "learning_rate": 0.2},
            {"params": [p for p in model.head.ctc_head.parameters() if not p.stop_gradient]}]
        if args.visual_tail:
            parameter_groups.append({'params': [p for p in model.backbone.blocks6.parameters() if not p.stop_gradient], 'learning_rate': 0.1})
        optimizer = paddle.optimizer.Adam(learning_rate=run["learning_rate_classifier"], parameters=parameter_groups,
                                          grad_clip=paddle.nn.ClipGradByGlobalNorm(1.0))
        history, best_epoch, stale_epochs = [], 0, 0
        for epoch in range(1, run["epochs"] + 1):
            order = list(training)
            rng.shuffle(order)
            losses = []
            for offset in range(0, len(order), run["gradient_accumulation"]):
                batch = order[offset:offset + run["gradient_accumulation"]]
                for item in batch:
                    output = logits(paddle.to_tensor(features[item["key"]]))
                    label = paddle.to_tensor([item["label"]], dtype="int32")
                    ctc = loss_ctc(output.transpose([1, 0, 2]), label,
                                   paddle.to_tensor([output.shape[1]], dtype="int64"),
                                   paddle.to_tensor([len(item["label"])], dtype="int64")).mean() / len(item["label"])
                    selected_frames = paddle.index_select(output[0], paddle.to_tensor(item["frames"], dtype="int64"), axis=0)
                    focus = F.cross_entropy(selected_frames, paddle.to_tensor(item["focus_labels"], dtype="int64"))
                    kl = F.kl_div(F.log_softmax(output / 2.0, axis=-1), paddle.to_tensor(item["teacher"]), reduction="none").sum(axis=-1).mean() * 4
                    loss = ctc + args.focus_weight * focus + run["teacher_kl_weight"] * kl
                    assert bool(paddle.isfinite(loss))
                    (loss / len(batch)).backward()
                    losses.append([float(ctc), float(focus), float(kl)])
                assert all(p.grad is not None and bool(paddle.isfinite(p.grad).all()) for p in model.parameters() if not p.stop_gradient)
                assert all(p.grad is None for p in model.parameters() if p.stop_gradient)
                optimizer.step()
                optimizer.clear_grad()
                updates += 1
                if updates % 20 == 0:
                    progress({"state": "training", "epoch": epoch, "views_completed": offset + len(batch),
                              "views_total": len(order), "mean_losses_ctc_focus_kl": np.mean(losses, axis=0).tolist()})
            result = evaluate(f"validation-epoch-{epoch}")
            metrics = result["metrics"]
            lost = [p["image"] for p in result["predictions"] if p["image"] in protected and p["prediction"] != p["label"]]
            improved = eligible(metrics, baseline) and not lost and score(metrics) > score(best)
            if improved:
                best, best_epoch = metrics, epoch
                paddle.save(model.state_dict(), str(out / "best.pdparams"))
            stale_epochs = 0 if improved else stale_epochs + 1
            paddle.save(model.state_dict(), str(out / "latest.pdparams"))
            event = {"epoch": epoch, "metrics": metrics, "previously_correct_lost": lost, "selected": improved,
                     "mean_losses_ctc_focus_kl": np.mean(losses, axis=0).tolist(), "updates": updates}
            history.append(event)
            write_json(out / "history.json", history)
            progress({"state": "epoch_complete", **event})
            if args.patience and stale_epochs >= args.patience:
                break
        selected = out / "best.pdparams" if best_epoch else initial
        final_state = model.state_dict()
        selected_state = paddle.load(str(selected))
        assert all(hashlib.sha256(final_state[k].numpy().tobytes()).hexdigest() == h and
                   hashlib.sha256(selected_state[k].numpy().tobytes()).hexdigest() == h for k, h in frozen_hashes.items())
        assert hashes == {str(p.relative_to(repo)): sha(p) for p in tracked}
        result = {"state": "completed", "epochs": len(history), "updates": updates, "baseline": baseline, "best": best,
                  "selected_epoch": best_epoch, "selected_checkpoint": str(selected), "selected_sha256": sha(selected),
                  "new_weights_selected": bool(best_epoch), "frozen_tensors_verified": len(frozen_hashes),
                  "training_records": len(train), "validation_records": len(validation),
                  "training_views": len(training), "training_augmentation": run['training_augmentation'],
                  "planned_epochs": run['epochs'], "early_stopped": len(history) < run['epochs'],
                  "holdout_used": False, "exported": False, "deployed": False, "seconds": time.time() - started}
        write_json(out / "result.json", result)
        progress(result)
    except Exception as exc:
        progress({"state": "failed", "error": str(exc)})
        raise
    finally:
        bridge.close()


if __name__ == "__main__":
    main()

"""Two-epoch local continuation using the browser's raw/ink preprocessing."""
import argparse
import base64
import copy
import json
from pathlib import Path
import random
import subprocess
import sys
import time

from train_cpu import SOURCE_REVISION, eligible, load_rows, score, sha, summarize, write_json
from analyze_preprocessing import BrowserBridge, derive_crops


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for option in ("dataset", "paddleocr", "pilot-run", "run-dir", "node"):
        parser.add_argument("--" + option, type=Path, required=True)
    args = parser.parse_args()
    root, source, pilot, out = [p.resolve() for p in (args.dataset, args.paddleocr, args.pilot_run, args.run_dir)]
    repo = Path(__file__).resolve().parents[2]
    assert not out.is_relative_to(repo), "Keep private output outside the repository"
    assert subprocess.check_output(["git", "-C", str(source), "rev-parse", "HEAD"], text=True).strip() == SOURCE_REVISION
    assert not subprocess.check_output(["git", "-C", str(source), "status", "--porcelain"], text=True).strip()
    frozen = json.loads((pilot / "candidate-frozen.json").read_text(encoding="utf-8"))
    manifest = root / "dataset-freeze.v1.json"
    assert sha(manifest) == frozen["dataset_manifest_sha256"]
    for rel, digest in json.loads(manifest.read_text(encoding="utf-8"))["files"].items():
        assert sha(root / rel) == digest
    initial = pilot / "best.pdparams"
    assert sha(initial) == frozen["checkpoint_sha256"]
    train = load_rows(root, "train")
    validation = load_rows(root, "validation")  # P04 is never loaded or inferred.
    out.mkdir(parents=True, exist_ok=False)
    tracked = [Path(__file__), Path(__file__).with_name("train_cpu.py"),
               Path(__file__).with_name("analyze_preprocessing.py"), Path(__file__).with_name("browser_bridge.cjs"),
               repo / "DS-CYLINDER-REGISTRATION-DEMO/handwriting-core.js", repo / "DS-CYLINDER-REGISTRATION-DEMO/rules.js"]
    source_hashes = {str(p.relative_to(repo)): sha(p) for p in tracked}
    snapshot = out / "source-snapshot"
    snapshot.mkdir()
    for p in tracked:
        (snapshot / p.name).write_bytes(p.read_bytes())
    crop_changes = derive_crops(root, train + validation, 48, out)
    sys.path.insert(0, str(source))
    import numpy as np
    import paddle
    import yaml
    from PIL import Image
    from ppocr.data import create_operators, transform
    from ppocr.losses import build_loss
    from ppocr.modeling.architectures import build_model
    from ppocr.postprocess import build_post_process

    seed = 20261119
    random.seed(seed)
    np.random.seed(seed)
    paddle.seed(seed)
    paddle.set_device("cpu")
    config_path = source / "configs/rec/PP-OCRv5/multi_language/en_PP-OCRv5_mobile_rec.yaml"
    config = yaml.safe_load(config_path.read_text(encoding="utf-8"))
    config["Global"].update(use_gpu=False, distributed=False)
    dictionary = source / config["Global"]["character_dict_path"]
    config["Global"]["character_dict_path"] = str(dictionary)
    decoder = build_post_process(config["PostProcess"], config["Global"])
    chars = list(decoder.character)
    chars[0] = ""
    config["Architecture"]["Head"]["out_channels_list"] = {"CTCLabelDecode": len(chars), "NRTRLabelDecode": len(chars) + 3}
    model = build_model(copy.deepcopy(config["Architecture"]))
    state = paddle.load(str(initial))
    expected = model.state_dict()
    assert set(state) == set(expected) and all(list(state[k].shape) == list(expected[k].shape) for k in state)
    model.set_state_dict(state)
    del state, expected
    label_ops = create_operators([{"MultiLabelEncode": {"gtc_encode": "NRTRLabelEncode"}}], config["Global"])
    run = {"profile": "browser-matched-continuation-v2", "epochs_max": 2, "batch_size": 2,
           "learning_rate": 0.0000025, "seed": seed, "device": "cpu", "paddle_version": paddle.__version__,
           "initial_checkpoint_sha256": sha(initial), "dataset_manifest_sha256": sha(manifest),
           "source_revision": SOURCE_REVISION, "dictionary_sha256": sha(dictionary),
           "source_config_sha256": sha(config_path), "source_hashes": source_hashes,
           "steel_left_margin": 48, "derived_crops": len(crop_changes), "train_fields": len(train),
           "validation_fields": len(validation), "holdout_used": False, "deployed": False,
           "training_views": "Each sample alternates raw/blue-ink between the two epochs; no cropping augmentation",
           "evaluation": "Both aspect-preserving browser views, evidence-based positional alternatives, single V5",
           "selection": "P03 steel exact, CTN exact, steel CER, total CER; neither field may regress from initial model",
           "limitations": "Shared copy targets across writers; no unseen-identifier or automatic alignment evaluation"}
    write_json(out / "run-config.json", run)
    bridge = BrowserBridge(args.node)
    started = time.time()
    updates = 0
    try:
        prepared = {}
        for index, row in enumerate(train + validation):
            with Image.open(row["path"]) as picture:
                rgb = picture.convert("RGB")
                views = bridge.call({"type": "prepare", "width": rgb.width, "height": rgb.height,
                                     "rgb": base64.b64encode(rgb.tobytes()).decode("ascii")})
            tensors = [np.frombuffer(base64.b64decode(v["data"]), dtype="<f4").reshape(v["dims"])[0].copy()
                       for v in views["views"]]
            labels = transform({"image": None, "label": row["label"]}, label_ops)
            assert labels is not None and all(np.isfinite(v).all() for v in tensors)
            prepared[row["image"]] = {"views": tensors, "labels": labels, "parity": index % 2}

        def evaluate(name):
            model.eval()
            predictions = []
            raw_predictions = []
            with paddle.no_grad():
                for index, row in enumerate(validation, 1):
                    outputs = []
                    for array in prepared[row["image"]]["views"]:
                        output = model(paddle.to_tensor(array[None])).numpy()
                        assert np.isfinite(output).all()
                        outputs.append({"dims": list(output.shape),
                                        "data": base64.b64encode(output.astype("<f4").tobytes()).decode("ascii")})
                    decoded = bridge.call({"type": "decode", "outputs": outputs, "characters": chars, "field": row["field"]})
                    for target, key in [(predictions, "aspect_views_rules"), (raw_predictions, "aspect_raw")]:
                        text = decoded[key]["text"]
                        target.append({"image": row["image"], "field": row["field"], "label": row["label"],
                                       "raw": text, "prediction": "".join(text.upper().split()),
                                       "confidence": decoded[key]["score"], "glyph_review": decoded[key].get("glyphReview", False)})
                    if index % 16 == 0:
                        status = {"state": "evaluating", "stage": name, "completed_fields": index,
                                  "total_fields": len(validation), "optimizer_updates": updates, "updated_at": time.time()}
                        write_json(out / "status.json", status)
                        print(json.dumps(status), flush=True)
            metrics = summarize(predictions)
            write_json(out / (name + ".json"), {"metrics": metrics, "predictions": predictions,
                       "raw_view_metrics": summarize(raw_predictions), "raw_view_predictions": raw_predictions})
            print(json.dumps({"event": name, "metrics": metrics}), flush=True)
            return metrics

        baseline = evaluate("validation-baseline")
        best, best_epoch = baseline, 0
        loss_fn = build_loss(copy.deepcopy(config["Loss"]))
        optimizer = paddle.optimizer.Adam(learning_rate=run["learning_rate"], parameters=model.parameters(),
                    weight_decay=0.00003, grad_clip=paddle.nn.ClipGradByGlobalNorm(1.0))
        history = []
        for epoch in range(1, 3):
            model.train()
            for layer in model.sublayers():
                if isinstance(layer, paddle.nn.BatchNorm2D):
                    layer.eval()
            order = list(train)
            random.shuffle(order)
            losses = []
            for offset in range(0, len(order), 2):
                part = [prepared[row["image"]] for row in order[offset:offset + 2]]
                arrays = [p["views"][(p["parity"] + epoch - 1) % 2] for p in part]
                width = max(a.shape[-1] for a in arrays)
                images = np.stack([np.pad(a, ((0, 0), (0, 0), (0, width - a.shape[-1]))) for a in arrays])
                batch = [paddle.to_tensor(images)] + [paddle.to_tensor(np.stack([p["labels"][key] for p in part]))
                                                     for key in ["label_ctc", "label_gtc", "length"]]
                batch.append(paddle.to_tensor(np.asarray([a.shape[-1] / width for a in arrays], dtype="float32")))
                loss = loss_fn(model(batch[0], data=batch[1:]), batch)["loss"]
                assert bool(paddle.isfinite(loss).all()), "Non-finite loss"
                loss.backward()
                assert all(bool(paddle.isfinite(p.grad).all()) for p in model.parameters() if p.grad is not None)
                optimizer.step()
                optimizer.clear_grad()
                losses.append(float(loss))
                updates += 1
                if len(losses) == 1 or len(losses) % 10 == 0:
                    status = {"state": "training", "epoch": epoch, "batch": len(losses), "batches": (len(train) + 1) // 2,
                              "optimizer_updates": updates, "mean_loss": sum(losses) / len(losses),
                              "elapsed_seconds": time.time() - started, "updated_at": time.time()}
                    write_json(out / "status.json", status)
                    print(json.dumps(status), flush=True)
            metrics = evaluate("validation-epoch-" + str(epoch))
            improved = eligible(metrics, baseline) and score(metrics) > score(best)
            paddle.save(model.state_dict(), str(out / "latest.pdparams"))
            paddle.save(optimizer.state_dict(), str(out / "latest.pdopt"))
            if improved:
                best, best_epoch = metrics, epoch
                paddle.save(model.state_dict(), str(out / "best.pdparams"))
            history.append({"epoch": epoch, "mean_loss": sum(losses) / len(losses), "metrics": metrics, "selected": improved})
            write_json(out / "history.json", history)
        assert source_hashes == {str(p.relative_to(repo)): sha(p) for p in tracked}, "Source changed during training"
        candidate = out / "best.pdparams" if best_epoch else initial
        write_json(out / "candidate-frozen.json", {"checkpoint_sha256": sha(candidate), "selected_epoch": best_epoch,
                   "checkpoint_from_initial_pilot": not bool(best_epoch), "source_hashes": source_hashes,
                   "dataset_manifest_sha256": sha(manifest), "derivation_sha256": sha(out / "crop-derivation.json"),
                   "run_config_sha256": sha(out / "run-config.json"), "selection_metrics": best, "frozen_at": time.time()})
        result = {"state": "completed", "epochs_completed": len(history), "optimizer_updates": updates,
                  "baseline_validation": baseline, "best_validation": best, "selected_epoch": best_epoch,
                  "new_weights_selected": bool(best_epoch), "holdout_used": False, "deployed": False,
                  "elapsed_seconds": time.time() - started}
        write_json(out / "result.json", result)
        write_json(out / "status.json", result)
        print(json.dumps(result), flush=True)
    except Exception as exc:
        write_json(out / "status.json", {"state": "failed", "error": str(exc), "optimizer_updates": updates, "holdout_used": False})
        raise
    finally:
        bridge.close()


if __name__ == "__main__":
    main()

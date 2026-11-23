"""Local-only, writer-separated PaddleOCR CPU fine-tuning pilot.

Run with the isolated Paddle environment, not the website runtime. Dataset,
checkpoints and predictions must be outside the public repository.
"""
import argparse
import copy
import hashlib
import json
import os
from pathlib import Path
import random
import re
import subprocess
import sys
import time

os.environ.setdefault("NO_ALBUMENTATIONS_UPDATE", "1")
os.environ.setdefault("OMP_NUM_THREADS", "2")

SOURCE_REVISION = "dab3fe35379033fdcb2d0e9572fac0b36c9a9ebf"
WEIGHT_SHA256 = "e25c9536f39791dfbd2f005f7e0fbbc2652d35b79bae999740059d93fec8e950"
FORMATS = {"ctn": r"[A-Z]{2}[0-9]{2}[A-Z]{2}[A-Z0-9]", "steel": r"[0-9]{2}[A-Z][0-9]*"}


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def write_json(path, value):
    path = Path(path)
    pending = path.with_suffix(path.suffix + ".tmp")
    pending.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    pending.replace(path)


def edit_distance(a, b):
    row = list(range(len(b) + 1))
    for i, ac in enumerate(a, 1):
        new = [i]
        for j, bc in enumerate(b, 1):
            new.append(min(new[-1] + 1, row[j] + 1, row[j - 1] + (ac != bc)))
        row = new
    return row[-1]


def summarize(predictions):
    result = {}
    for field in ("steel", "ctn", "all"):
        rows = [r for r in predictions if field == "all" or r["field"] == field]
        count = len(rows)
        errors = sum(edit_distance(r["prediction"], r["label"]) for r in rows)
        correct = sum(r["prediction"] == r["label"] for r in rows)
        result[field] = {"count": count, "correct": correct, "accuracy": correct / count if count else 0,
                         "cer": errors / max(1, sum(len(r["label"]) for r in rows)),
                         "raw_correct": sum(r["raw"] == r["label"] for r in rows),
                         "valid_format": sum(bool(re.fullmatch(FORMATS[r["field"]], r["prediction"])) for r in rows)}
        if field == "ctn":
            result[field]["last_character_correct"] = sum(
                len(r["prediction"]) == 7 and r["prediction"][-1] == r["label"][-1] for r in rows)
    return result


def score(metrics):
    return (metrics["steel"]["correct"], metrics["ctn"]["correct"],
            -metrics["steel"]["cer"], -metrics["all"]["cer"])


def eligible(metrics, baseline):
    return all(metrics[f]["correct"] >= baseline[f]["correct"] for f in ("steel", "ctn"))


def load_rows(root, split):
    permitted = {"train": {"P01", "P02"}, "validation": {"P03"}, "test": {"P04"}}[split]
    rows = []
    seen = set()
    annotations = {r["image"]: r for r in map(json.loads, (root / "annotations.v1.jsonl").read_text(encoding="utf-8").splitlines())}
    for line in (root / "splits-v1" / (split + "-all.txt")).read_text(encoding="utf-8").splitlines():
        rel, label = line.split("\t")
        path = (root / rel).resolve()
        if not path.is_relative_to(root) or rel in seen:
            raise ValueError("Unsafe or duplicated dataset image")
        seen.add(rel)
        annotation = annotations[rel]
        field = annotation["field"]
        assert annotation["writer_code"] in permitted, "Writer leakage"
        ready_key = "training_ready" if split == "train" else "evaluation_ready"
        assert annotation["label"] == label and annotation[ready_key], "Unconfirmed/ineligible label"
        assert sha(path) == annotation["image_sha256"], "Crop changed"
        assert re.fullmatch(FORMATS[field], label) and len(label) <= 25, "Label format is incompatible"
        rows.append({"image": rel, "path": path, "label": label, "field": field})
    assert rows and {r["field"] for r in rows} == {"ctn", "steel"}
    return rows


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=["train", "holdout"])
    parser.add_argument("--dataset", type=Path, required=True)
    parser.add_argument("--paddleocr", type=Path, required=True)
    parser.add_argument("--weights", type=Path, required=True)
    parser.add_argument("--run-dir", type=Path, required=True)
    args = parser.parse_args()
    root, source, weights, out = [p.resolve() for p in (args.dataset, args.paddleocr, args.weights, args.run_dir)]
    repository = Path(__file__).resolve().parents[2]
    assert not out.is_relative_to(repository), "Keep private output outside the public repository"
    assert sha(weights) == WEIGHT_SHA256, "Unexpected pretrained weights"
    revision = subprocess.check_output(["git", "-C", str(source), "rev-parse", "HEAD"], text=True).strip()
    assert revision == SOURCE_REVISION, "Unexpected PaddleOCR revision"
    assert not subprocess.check_output(["git", "-C", str(source), "status", "--porcelain"], text=True).strip(), "Modified upstream source"
    manifest = root / "dataset-freeze.v1.json"
    for rel, digest in json.loads(manifest.read_text(encoding="utf-8"))["files"].items():
        assert sha(root / rel) == digest, "Frozen dataset changed: " + rel
    sys.path.insert(0, str(source))
    import numpy as np
    import paddle
    import yaml
    from ppocr.data import create_operators, transform
    from ppocr.losses import build_loss
    from ppocr.modeling.architectures import build_model
    from ppocr.postprocess import build_post_process

    seed = 20261119
    random.seed(seed)
    np.random.seed(seed)
    paddle.seed(seed)
    paddle.set_device("cpu")
    config_file = source / "configs/rec/PP-OCRv5/multi_language/en_PP-OCRv5_mobile_rec.yaml"
    config = yaml.safe_load(config_file.read_text(encoding="utf-8"))
    config["Global"].update(use_gpu=False, distributed=False)
    dictionary = source / config["Global"]["character_dict_path"]
    config["Global"]["character_dict_path"] = str(dictionary)
    decoder = build_post_process(config["PostProcess"], config["Global"])
    classes = len(decoder.character)
    config["Architecture"]["Head"]["out_channels_list"] = {"CTCLabelDecode": classes, "NRTRLabelDecode": classes + 3}
    model = build_model(copy.deepcopy(config["Architecture"]))

    def load_weights(path):
        state = paddle.load(str(path))
        expected = model.state_dict()
        assert set(state) == set(expected)
        assert all(list(state[k].shape) == list(expected[k].shape) for k in state)
        model.set_state_dict(state)

    eval_ops = create_operators(copy.deepcopy(config["Eval"]["dataset"]["transforms"]), config["Global"])
    train_transforms = copy.deepcopy(config["Eval"]["dataset"]["transforms"])
    train_transforms.insert(1, {"RecAug": {"tia_prob": 0.1, "crop_prob": 0.0, "reverse_prob": 0.0,
                                        "noise_prob": 0.05, "jitter_prob": 0.1, "blur_prob": 0.1, "hsv_aug_prob": 0.1}})
    train_ops = create_operators(train_transforms, config["Global"])

    def make_batch(rows, ops):
        prepared = [transform({"image": r["path"].read_bytes(), "label": r["label"]}, ops) for r in rows]
        assert all(x is not None for x in prepared), "Preprocessing rejected a sample"
        return [paddle.to_tensor(np.stack(values)) for values in zip(*prepared)]

    def evaluate(rows, name):
        model.eval()
        predictions = []
        with paddle.no_grad():
            for offset in range(0, len(rows), 2):
                part = rows[offset:offset + 2]
                output = model(make_batch(part, eval_ops)[0])
                assert bool(paddle.isfinite(output).all())
                for row, (text, confidence) in zip(part, decoder(output)):
                    predictions.append({"image": row["image"], "field": row["field"], "label": row["label"],
                                        "raw": text, "prediction": "".join(text.upper().split()), "confidence": float(confidence)})
        metrics = summarize(predictions)
        write_json(out / (name + ".json"), {"metrics": metrics, "predictions": predictions,
                                            "normalization": "uppercase and whitespace removal only; no positional substitutions"})
        print(json.dumps({"event": name, "metrics": metrics}), flush=True)
        return metrics

    if args.mode == "holdout":
        frozen = json.loads((out / "candidate-frozen.json").read_text(encoding="utf-8"))
        assert frozen["dataset_manifest_sha256"] == sha(manifest)
        assert frozen["runner_sha256"] == sha(__file__)
        candidate = out / "best.pdparams"
        assert frozen["checkpoint_sha256"] == sha(candidate)
        # Exclusive marker prevents accidental repeated test-set selection.
        with (out / "holdout-started.json").open("x", encoding="utf-8") as handle:
            json.dump({"candidate_sha256": sha(candidate), "started_at": time.time()}, handle)
        test = load_rows(root, "test")
        load_weights(weights)
        baseline = evaluate(test, "holdout-baseline")
        load_weights(candidate)
        trained = evaluate(test, "holdout-trained")
        write_json(out / "holdout-result.json", {"baseline": baseline, "trained": trained,
                                                "candidate_sha256": sha(candidate), "deployed": False})
        return

    out.mkdir(parents=True, exist_ok=False)
    run = {"seed": seed, "epochs_max": 6, "patience": 3, "batch_size": 2, "learning_rate": 0.00001,
           "optimizer": "Adam", "weight_decay": 0.00003, "gradient_clip_norm": 1.0,
           "batch_norm": "freeze running statistics for the small dataset; train affine parameters",
           "source_revision": revision, "source_config_sha256": sha(config_file), "dictionary_sha256": sha(dictionary),
           "pretrained_sha256": sha(weights), "runner_sha256": sha(__file__), "dataset_manifest_sha256": sha(manifest),
           "train_augmentation": train_transforms[1], "device": "cpu", "paddle_version": paddle.__version__,
           "selection": "P03 only; steel exact, CTN exact, steel CER, total CER; neither field exact may regress",
           "limitations": "Writer-held-out shared template; not a test of unseen identifiers or automatic table alignment"}
    write_json(out / "run-config.json", run)
    train = load_rows(root, "train")
    validation = load_rows(root, "validation")
    load_weights(weights)
    baseline = evaluate(validation, "validation-baseline")
    loss_fn = build_loss(copy.deepcopy(config["Loss"]))
    optimizer = paddle.optimizer.Adam(learning_rate=run["learning_rate"], parameters=model.parameters(),
                                      weight_decay=run["weight_decay"], grad_clip=paddle.nn.ClipGradByGlobalNorm(1.0))
    best = baseline
    best_epoch = 0
    stale = 0
    updates = 0
    started = time.time()
    history = []
    for epoch in range(1, run["epochs_max"] + 1):
        model.train()
        for layer in model.sublayers():
            if isinstance(layer, paddle.nn.BatchNorm2D):
                layer.eval()
        order = list(train)
        random.shuffle(order)
        losses = []
        epoch_start = time.time()
        for offset in range(0, len(order), run["batch_size"]):
            batch = make_batch(order[offset:offset + run["batch_size"]], train_ops)
            predictions = model(batch[0], data=batch[1:])
            loss = loss_fn(predictions, batch)["loss"]
            assert bool(paddle.isfinite(loss).all()), "Non-finite loss"
            loss.backward()
            assert all(bool(paddle.isfinite(p.grad).all()) for p in model.parameters() if p.grad is not None)
            optimizer.step()
            optimizer.clear_grad()
            updates += 1
            losses.append(float(loss))
            if len(losses) == 1 or len(losses) % 10 == 0:
                progress = {"state": "training", "epoch": epoch, "batch": len(losses), "batches": (len(train) + 1) // 2,
                            "optimizer_updates": updates, "mean_loss": sum(losses) / len(losses),
                            "elapsed_seconds": time.time() - started, "updated_at": time.time()}
                write_json(out / "status.json", progress)
                print(json.dumps(progress), flush=True)
        metrics = evaluate(validation, "validation-epoch-" + str(epoch))
        paddle.save(model.state_dict(), str(out / "latest.pdparams"))
        paddle.save(optimizer.state_dict(), str(out / "latest.pdopt"))
        improved = eligible(metrics, baseline) and score(metrics) > score(best)
        if improved:
            best, best_epoch, stale = metrics, epoch, 0
            paddle.save(model.state_dict(), str(out / "best.pdparams"))
        else:
            stale += 1
        history.append({"epoch": epoch, "loss": sum(losses) / len(losses), "validation": metrics,
                        "seconds": time.time() - epoch_start, "selected": improved})
        write_json(out / "history.json", history)
        write_json(out / "latest-state.json", {"epoch": epoch, "optimizer_updates": updates, "best_epoch": best_epoch})
        if stale >= run["patience"]:
            break
    result = {"state": "completed", "epochs_completed": len(history), "optimizer_updates": updates,
              "baseline_validation": baseline, "best_validation": best, "best_epoch": best_epoch,
              "candidate_available": best_epoch > 0, "holdout_used": False, "deployed": False,
              "elapsed_seconds": time.time() - started}
    if best_epoch:
        write_json(out / "candidate-frozen.json", {"checkpoint_sha256": sha(out / "best.pdparams"),
                   "dataset_manifest_sha256": sha(manifest), "runner_sha256": sha(__file__),
                   "selected_epoch": best_epoch, "selection_metrics": best, "frozen_at": time.time()})
    write_json(out / "result.json", result)
    write_json(out / "status.json", result)
    print(json.dumps(result), flush=True)


if __name__ == "__main__":
    main()

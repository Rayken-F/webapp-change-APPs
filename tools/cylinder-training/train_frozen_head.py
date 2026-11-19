"""Conservative local continuation: train the CTC classifier on frozen features."""
import argparse
import base64
import json
from pathlib import Path
import random
import shutil
import time

from train_cpu import eligible, load_rows, score, sha, summarize, write_json
from analyze_preprocessing import BrowserBridge


def check_partition(records, expected):
    assert len(records) == len(expected) and len({r["image"] for r in records}) == len(records)
    lookup = {r["image"]: r for r in expected}
    for row in records:
        original = lookup[row["image"]]
        assert row["label"] == original["label"] and row["field"] == original["field"]
        assert row["writer"] in ({"P01", "P02"} if row["split"] == "train" else {"P03"})
        assert len(row["features"]) == 2


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for key in ("dataset", "audit", "pilot-run", "run-dir", "node"):
        parser.add_argument("--" + key, required=True, type=Path)
    parser.add_argument("--seed", type=int, default=20261119)
    args = parser.parse_args()
    root, audit_dir, pilot, out = [p.resolve() for p in (args.dataset, args.audit, args.pilot_run, args.run_dir)]
    repo = Path(__file__).resolve().parents[2]
    assert not out.is_relative_to(repo)
    audit = json.loads((audit_dir / "audit.json").read_text(encoding="utf-8"))
    assert audit["state"] == "completed" and audit["holdout_used"] is False
    assert sha(audit_dir / "features.npz") == audit["features_sha256"]
    assert sha(pilot / "best.pdparams") == audit["checkpoint_sha256"]
    assert sha(root / "dataset-freeze.v1.json") == audit["dataset_manifest_sha256"]
    for name, digest in json.loads((root / "dataset-freeze.v1.json").read_text(encoding="utf-8"))["files"].items():
        assert sha(root / name) == digest
    for name, digest in audit["core_hashes"].items():
        assert sha(repo / "DS-CYLINDER-REGISTRATION-DEMO" / name) == digest
    assert sha(Path(__file__).with_name("browser_bridge.cjs")) == audit["bridge_sha256"]
    train = [r for r in audit["records"] if r["split"] == "train"]
    validation = [r for r in audit["records"] if r["split"] == "validation"]
    assert len(train) + len(validation) == len(audit["records"])
    check_partition(train, load_rows(root, "train"))
    check_partition(validation, load_rows(root, "validation"))
    assert not {r["features"][v] for r in train for v in (0, 1)} & {r["features"][v] for r in validation for v in (0, 1)}
    import numpy as np
    import paddle
    import paddle.nn.functional as F
    paddle.set_device("cpu")
    paddle.seed(args.seed)
    np.random.seed(args.seed)
    rng = random.Random(args.seed)
    cache = dict(np.load(audit_dir / "features.npz", allow_pickle=False))
    keys = [key for r in audit["records"] for key in r["features"]]
    assert len(keys) == len(set(keys)) and set(keys) == set(cache)
    assert all(v.ndim == 2 and v.shape[1] == 120 and np.isfinite(v).all() for v in cache.values())
    chars = audit["characters"]
    char_to_id = {c: i for i, c in enumerate(chars)}
    state = paddle.load(str(pilot / "best.pdparams"))
    head_keys = ["head.ctc_head.fc.weight", "head.ctc_head.fc.bias"]
    head = paddle.nn.Linear(120, len(chars))
    head.set_state_dict({"weight": state[head_keys[0]], "bias": state[head_keys[1]]})
    teacher = paddle.nn.Linear(120, len(chars))
    teacher.set_state_dict(head.state_dict())
    for parameter in teacher.parameters():
        parameter.stop_gradient = True
    out.mkdir(parents=True, exist_ok=False)
    source_names = ["train_frozen_head.py", "train_cpu.py", "analyze_preprocessing.py", "browser_bridge.cjs"]
    snapshot = out / "source-snapshot"
    snapshot.mkdir()
    source_hashes = {}
    for name in source_names:
        path = Path(__file__).with_name(name)
        shutil.copy2(path, snapshot / name)
        source_hashes[name] = sha(path)
    config = {"seed": args.seed, "epochs": 6, "batch_size": 8, "learning_rate": 0.00005,
              "loss": "CTC per label length + 0.25 * teacher KL at temperature 2, masked by real feature lengths",
              "trainable": head_keys, "training_views": "both raw and ink for every eligible P01/P02 sample",
              "audit_sha256": sha(audit_dir / "audit.json"), "features_sha256": audit["features_sha256"],
              "initial_checkpoint_sha256": audit["checkpoint_sha256"], "source_hashes": source_hashes,
              "selection": "P03 only; neither field exact may regress; steel exact, CTN exact, steel CER, all CER",
              "holdout_used": False, "exported": False, "deployed": False}
    write_json(out / "run-config.json", config)
    bridge = BrowserBridge(args.node)
    started, history, updates = time.time(), [], 0

    def evaluate(rows, name):
        predictions = []
        with paddle.no_grad():
            for row in rows:
                outputs = []
                for key in row["features"]:
                    output = F.softmax(head(paddle.to_tensor(cache[key][None])), axis=-1).numpy()
                    outputs.append({"dims": list(output.shape), "data": base64.b64encode(output.astype("<f4").tobytes()).decode("ascii")})
                decoded = bridge.call({"type": "decode", "outputs": outputs, "characters": chars, "field": row["field"]})
                picked = decoded["aspect_views_rules"]
                predictions.append({"image": row["image"], "field": row["field"], "label": row["label"],
                                    "prediction": "".join(picked["text"].upper().split()), "raw": picked["text"],
                                    "confidence": picked["score"], "raw_view": decoded["aspect_raw"]["text"],
                                    "ink_view": decoded["aspect_ink"]["text"]})
        result = {"metrics": summarize(predictions), "predictions": predictions,
                  "view_metrics": {v: summarize([{**r, "raw": r[v], "prediction": "".join(r[v].upper().split())}
                                                for r in predictions]) for v in ("raw_view", "ink_view")}}
        write_json(out / (name + ".json"), result)
        return result

    def save_checkpoint(name):
        combined = dict(state)
        combined[head_keys[0]], combined[head_keys[1]] = head.weight, head.bias
        paddle.save(combined, str(out / name))

    try:
        baseline_result = evaluate(validation, "validation-baseline")
        assert [r["prediction"] for r in baseline_result["predictions"]] == [r["prediction"] for r in validation]
        baseline = best = baseline_result["metrics"]
        best_epoch = 0
        loss_ctc = paddle.nn.CTCLoss(blank=0, reduction="none")
        optimizer = paddle.optimizer.Adam(learning_rate=config["learning_rate"], parameters=head.parameters(),
                                          grad_clip=paddle.nn.ClipGradByGlobalNorm(1.0))
        train_views = [(r, k) for r in train for k in r["features"]]
        for epoch in range(1, config["epochs"] + 1):
            rng.shuffle(train_views)
            losses = []
            for offset in range(0, len(train_views), config["batch_size"]):
                batch = train_views[offset:offset + config["batch_size"]]
                lens = np.array([len(cache[k]) for r, k in batch], dtype="int64")
                label_lens = np.array([len(r["label"]) for r, k in batch], dtype="int64")
                features = np.zeros((len(batch), max(lens), 120), dtype="float32")
                labels = np.zeros((len(batch), max(label_lens)), dtype="int32")
                for i, (row, key) in enumerate(batch):
                    features[i, :lens[i]] = cache[key]
                    labels[i, :label_lens[i]] = [char_to_id[c] for c in row["label"]]
                x = paddle.to_tensor(features)
                logits = head(x)
                ctc = (loss_ctc(logits.transpose([1, 0, 2]), paddle.to_tensor(labels),
                                paddle.to_tensor(lens), paddle.to_tensor(label_lens)) / paddle.to_tensor(label_lens, dtype="float32")).mean()
                with paddle.no_grad():
                    reference = F.softmax(teacher(x) / 2.0, axis=-1)
                mask = paddle.to_tensor((np.arange(max(lens))[None] < lens[:, None]).astype("float32"))
                kl = (F.kl_div(F.log_softmax(logits / 2.0, axis=-1), reference, reduction="none").sum(axis=-1) * mask).sum() / mask.sum() * 4
                loss = ctc + 0.25 * kl
                assert bool(paddle.isfinite(loss))
                loss.backward()
                assert all(p.grad is not None and bool(paddle.isfinite(p.grad).all()) for p in head.parameters())
                optimizer.step()
                optimizer.clear_grad()
                updates += 1
                losses.append(float(loss))
            result = evaluate(validation, f"validation-epoch-{epoch}")
            metrics = result["metrics"]
            improved = eligible(metrics, baseline) and score(metrics) > score(best)
            if improved:
                best, best_epoch = metrics, epoch
                save_checkpoint("best.pdparams")
            save_checkpoint("latest.pdparams")
            event = {"epoch": epoch, "updates": updates, "loss": float(np.mean(losses)), "metrics": metrics,
                     "selected": improved, "seconds": time.time() - started}
            history.append(event)
            write_json(out / "history.json", history)
            write_json(out / "status.json", {"state": "training", **event})
            print(json.dumps(event), flush=True)
        train_result = evaluate(train, "training-final")
        selected = out / "best.pdparams" if best_epoch else pilot / "best.pdparams"
        check = paddle.load(str(selected))
        assert set(check) == set(state)
        unchanged = [k for k in state if k not in head_keys]
        assert all(bool(paddle.equal_all(state[k], check[k])) for k in unchanged)
        assert all(sha(Path(__file__).with_name(name)) == digest for name, digest in source_hashes.items())
        result = {"state": "completed", "epochs": config["epochs"], "updates": updates, "baseline": baseline,
                  "best": best, "selected_epoch": best_epoch, "new_weights_selected": bool(best_epoch),
                  "selected_checkpoint": str(selected), "selected_sha256": sha(selected), "training_final": train_result["metrics"],
                  "frozen_tensors_verified": len(unchanged), "holdout_used": False, "exported": False, "deployed": False,
                  "seconds": time.time() - started}
        write_json(out / "result.json", result)
        write_json(out / "status.json", result)
        print(json.dumps(result), flush=True)
    finally:
        bridge.close()


if __name__ == "__main__":
    main()

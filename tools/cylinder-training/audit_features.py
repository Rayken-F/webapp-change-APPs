"""Audit local P01-P03 predictions and cache frozen visual features, never P04."""
import argparse
import base64
import copy
import json
from pathlib import Path
import subprocess
import sys
import time

from train_cpu import SOURCE_REVISION, load_rows, sha, summarize, write_json
from analyze_preprocessing import BrowserBridge, derive_crops


def repair_training_crops(root, rows, plan_path, out):
    """Extend reviewed clipped training crops from source pixels, never labels."""
    import numpy as np
    from PIL import Image
    plan = json.loads(plan_path.read_text(encoding="utf-8"))
    geometry = {f["image"]: (r["sheet_id"], f["table_box"]) for r in
                json.loads((root / "labels.pending.json").read_text(encoding="utf-8"))["rows"]
                for f in r["fields"].values()}
    photos = {p["sheet_id"]: p for p in json.loads((root / "intake-manifest.json").read_text(encoding="utf-8"))["photos"]}
    lookup = {r["image"]: r for r in rows}
    changes = []
    assert len({p["image"] for p in plan["repairs"]}) == len(plan["repairs"])
    for repair in plan["repairs"]:
        row = lookup[repair["image"]]
        sheet, box = geometry[row["image"]]
        assert row["split"] == "train" and sheet[:3] in {"P01", "P02"}
        assert sha(root / row["image"]) == repair["original_sha256"]
        extra = repair["extra_bottom"]
        assert box[3] == 2560 and isinstance(extra, int) and 0 < extra <= 160
        photo = photos[sheet]
        source_path = root / "images" / (Path(photo["source"]).stem + ".png")
        assert sha(source_path) == repair["source_sha256"]
        with Image.open(source_path) as source:
            source = source.convert("RGB")
            src = [(x * source.width / 1000, y * source.width / 1000) for x, y in photo["manual_quad_preview"]]
            dst = [(48, 0), (2248, 0), (2248, 2560), (48, 2560)]
            a, b = [], []
            for (x, y), (u, v) in zip(dst, src):
                a.extend([[x,y,1,0,0,0,-u*x,-u*y], [0,0,0,x,y,1,-v*x,-v*y]])
                b.extend([u, v])
            coeffs = np.linalg.solve(a, b).tolist()
            wide = source.transform((2248, 2560 + extra), Image.Transform.PERSPECTIVE, coeffs, Image.Resampling.BICUBIC)
            x0 = box[0] - (48 if row["field"] == "steel" else 0)
            revised = [x0 + 48, box[1], box[2] + 48, box[3] + extra]
            crop = wide.crop(revised)
            # Coordinate extension preserves the existing overlapping source pixels.
            with Image.open(row["path"]) as previous:
                assert np.max(np.abs(np.asarray(crop.crop((0, 0, previous.width, previous.height))).astype(int)
                                     - np.asarray(previous.convert("RGB")).astype(int))) <= 1
            target = out / "derived-crops" / (Path(row["image"]).stem + "-complete.png")
            crop.save(target)
        changes.append({**repair, "derived_sha256": sha(target), "derived_image": str(target),
                        "rectified_box": revised, "label_changed": False})
        row["path"] = target
    write_json(out / "training-crop-repairs.json", {"plan_sha256": sha(plan_path), "changes": changes, "holdout_used": False})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for key in ("dataset", "paddleocr", "pilot-run", "output", "node"):
        parser.add_argument("--" + key, required=True, type=Path)
    parser.add_argument("--training-crop-plan", type=Path)
    args = parser.parse_args()
    root, source, pilot, out = [p.resolve() for p in (args.dataset, args.paddleocr, args.pilot_run, args.output)]
    repo = Path(__file__).resolve().parents[2]
    assert not out.is_relative_to(repo)
    assert subprocess.check_output(["git", "-C", str(source), "rev-parse", "HEAD"], text=True).strip() == SOURCE_REVISION
    assert not subprocess.check_output(["git", "-C", str(source), "status", "--porcelain"], text=True).strip()
    frozen = json.loads((pilot / "candidate-frozen.json").read_text(encoding="utf-8"))
    weights = pilot / "best.pdparams"
    manifest = root / "dataset-freeze.v1.json"
    assert sha(weights) == frozen["checkpoint_sha256"] and sha(manifest) == frozen["dataset_manifest_sha256"]
    for name, digest in json.loads(manifest.read_text(encoding="utf-8"))["files"].items():
        assert sha(root / name) == digest
    rows = []
    for split in ("train", "validation"):
        rows += [{**r, "split": split} for r in load_rows(root, split)]
    out.mkdir(parents=True, exist_ok=False)
    derive_crops(root, rows, 48, out)
    if args.training_crop_plan:
        repair_training_crops(root, rows, args.training_crop_plan.resolve(), out)
    runner_hash = sha(__file__)
    bridge_hash = sha(Path(__file__).with_name("browser_bridge.cjs"))
    sys.path.insert(0, str(source))
    import numpy as np
    import paddle
    import yaml
    from PIL import Image
    from ppocr.modeling.architectures import build_model
    from ppocr.postprocess import build_post_process
    paddle.set_device("cpu")
    config_path = source / "configs/rec/PP-OCRv5/multi_language/en_PP-OCRv5_mobile_rec.yaml"
    config = yaml.safe_load(config_path.read_text(encoding="utf-8"))
    config["Global"]["character_dict_path"] = str(source / config["Global"]["character_dict_path"])
    decoder = build_post_process(config["PostProcess"], config["Global"])
    chars = list(decoder.character)
    chars[0] = ""
    config["Architecture"]["Head"]["out_channels_list"] = {"CTCLabelDecode": len(chars), "NRTRLabelDecode": len(chars) + 3}
    model = build_model(copy.deepcopy(config["Architecture"]))
    state = paddle.load(str(weights))
    assert set(state) == set(model.state_dict())
    assert all(list(state[k].shape) == list(v.shape) for k, v in model.state_dict().items())
    model.set_state_dict(state)
    model.eval()
    assert not model.use_transform and not model.use_neck
    assert model.head.ctc_head.mid_channels is None and not model.head.ctc_head.use_guide
    bridge = BrowserBridge(args.node)
    features, records = {}, []
    started = time.time()
    try:
        with paddle.no_grad():
            for index, row in enumerate(rows):
                with Image.open(row["path"]) as picture:
                    rgb = picture.convert("RGB")
                    inputs = bridge.call({"type": "prepare", "width": rgb.width, "height": rgb.height,
                                          "rgb": base64.b64encode(rgb.tobytes()).decode("ascii"),
                                          "includeImages": row["split"] == "validation"})
                outputs, keys = [], []
                for view_index, view in enumerate(inputs["views"]):
                    array = np.frombuffer(base64.b64decode(view["data"]), dtype="<f4").reshape(view["dims"]).copy()
                    image_tensor = paddle.to_tensor(array)
                    feature = model.head.ctc_encoder(model.backbone(image_tensor))
                    output = model.head.ctc_head(feature).numpy()
                    assert np.isfinite(output).all() and bool(paddle.isfinite(feature).all())
                    if index < 2 or index == len(rows) - 1:
                        np.testing.assert_allclose(output, model(image_tensor).numpy(), rtol=1e-6, atol=1e-6)
                    key = f"sample_{index:03d}_view_{view_index}"
                    keys.append(key)
                    features[key] = feature.numpy()[0]
                    outputs.append({"dims": list(output.shape), "data": base64.b64encode(output.astype("<f4").tobytes()).decode("ascii")})
                decoded = bridge.call({"type": "decode", "outputs": outputs, "characters": chars, "field": row["field"]})
                final = decoded["aspect_views_rules"]
                record = {"image": row["image"], "field": row["field"], "split": row["split"],
                          "writer": Path(row["image"]).name.split("-")[0], "label": row["label"],
                          "input_sha256": sha(row["path"]), "features": keys, "views": decoded,
                          "raw": final["text"], "prediction": "".join(final["text"].upper().split()), "confidence": final["score"]}
                if row["split"] == "validation" and record["label"] != record["prediction"]:
                    for vi, view in enumerate(inputs["views"]):
                        im = view["image"]
                        Image.frombytes("RGB", (im["width"], im["height"]), base64.b64decode(im["rgb"])).save(out / f"{Path(row['image']).stem}-view-{vi}.png")
                records.append(record)
                if (index + 1) % 16 == 0:
                    status = {"state": "auditing", "completed": index + 1, "total": len(rows), "seconds": time.time() - started}
                    write_json(out / "status.json", status)
                    print(json.dumps(status), flush=True)
        np.savez_compressed(out / "features.npz", **features)
        result = {"state": "completed", "records": records, "characters": chars,
                  "metrics": {s: summarize([r for r in records if r["split"] == s]) for s in ("train", "validation")},
                  "checkpoint_sha256": sha(weights), "dataset_manifest_sha256": sha(manifest),
                  "features_sha256": sha(out / "features.npz"), "derivation_sha256": sha(out / "crop-derivation.json"),
                  "runner_sha256": runner_hash, "bridge_sha256": bridge_hash,
                  "core_hashes": {name: sha(repo / "DS-CYLINDER-REGISTRATION-DEMO" / name) for name in ("handwriting-core.js", "rules.js")},
                  "source_revision": SOURCE_REVISION, "holdout_used": False, "seconds": time.time() - started}
        assert sha(__file__) == runner_hash and sha(Path(__file__).with_name("browser_bridge.cjs")) == bridge_hash
        write_json(out / "audit.json", result)
        write_json(out / "status.json", {k: result[k] for k in ("state", "metrics", "holdout_used", "seconds")})
        print(json.dumps({"metrics": result["metrics"], "seconds": result["seconds"]}), flush=True)
    finally:
        bridge.close()


if __name__ == "__main__":
    main()

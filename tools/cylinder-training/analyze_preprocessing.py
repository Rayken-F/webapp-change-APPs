"""Compare frozen P03 models using the actual local browser preprocessing code."""
import argparse
import base64
import copy
import json
from pathlib import Path
import subprocess
import sys
import time

from train_cpu import SOURCE_REVISION, WEIGHT_SHA256, load_rows, sha, summarize, write_json


class BrowserBridge:
    def __init__(self, node):
        self.process = subprocess.Popen([str(node), str(Path(__file__).with_name("browser_bridge.cjs"))],
                                        stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, encoding="utf-8")

    def call(self, value):
        self.process.stdin.write(json.dumps(value) + "\n")
        self.process.stdin.flush()
        line = self.process.stdout.readline()
        if not line:
            raise RuntimeError("Local preprocessing bridge stopped")
        response = json.loads(line)
        if not response["ok"]:
            raise RuntimeError(response["error"])
        return response["result"]

    def close(self):
        self.process.stdin.close()
        self.process.wait(timeout=10)


def derive_crops(root, rows, margin, out):
    """Preserve labels/splits; recover source pixels with a uniform steel margin."""
    from PIL import Image
    assert margin in (0, 48)
    if not margin:
        return []
    geometry_file = root / "labels.pending.json"
    geometry = {f["image"]: (r["sheet_id"], f["table_box"]) for r in
                json.loads(geometry_file.read_text(encoding="utf-8"))["rows"] for f in r["fields"].values()}
    crop_dir = out / "derived-crops"
    crop_dir.mkdir()
    changes = []
    for row in rows:
        if row["field"] != "steel":
            continue
        sheet_id, box = geometry[row["image"]]
        assert sheet_id.split("-")[0] in {"P01", "P02", "P03"}, "Holdout crops must remain unopened"
        table_path = root / "tables" / (sheet_id + ".png")
        target = crop_dir / row["path"].name
        with Image.open(table_path) as table, Image.open(row["path"]) as old:
            assert table.crop(box).convert("RGB").tobytes() == old.convert("RGB").tobytes(), "Crop geometry mismatch"
            new_box = [max(0, box[0] - margin), *box[1:]]
            table.crop(new_box).save(target)
        changes.append({"image": row["image"], "source_sha256": sha(table_path),
                        "original_sha256": sha(row["path"]), "original_box": box,
                        "derived_box": new_box, "derived_sha256": sha(target)})
        row["path"] = target
    write_json(out / "crop-derivation.json", {"margin": margin, "geometry_sha256": sha(geometry_file),
               "changes": changes, "labels_changed": False, "holdout_used": False})
    return changes


def main():
    runner_digest = sha(__file__)
    bridge_digest = sha(Path(__file__).with_name("browser_bridge.cjs"))
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", type=Path, required=True)
    parser.add_argument("--paddleocr", type=Path, required=True)
    parser.add_argument("--weights", type=Path, required=True)
    parser.add_argument("--pilot-run", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--node", type=Path, required=True)
    parser.add_argument("--steel-left-margin", type=int, choices=[0, 48], default=0,
                        help="Compare a uniform 48-pixel steel margin; never overwrite frozen v1 crops")
    args = parser.parse_args()
    root, source, original, pilot, out = [p.resolve() for p in
                                        (args.dataset, args.paddleocr, args.weights, args.pilot_run, args.output)]
    assert not out.is_relative_to(Path(__file__).resolve().parents[2]), "Private output must stay outside the repository"
    assert sha(original) == WEIGHT_SHA256
    assert subprocess.check_output(["git", "-C", str(source), "rev-parse", "HEAD"], text=True).strip() == SOURCE_REVISION
    assert not subprocess.check_output(["git", "-C", str(source), "status", "--porcelain"], text=True).strip()
    frozen = json.loads((pilot / "candidate-frozen.json").read_text(encoding="utf-8"))
    assert sha(pilot / "best.pdparams") == frozen["checkpoint_sha256"]
    manifest = root / "dataset-freeze.v1.json"
    assert sha(manifest) == frozen["dataset_manifest_sha256"]
    for rel, digest in json.loads(manifest.read_text(encoding="utf-8"))["files"].items():
        assert sha(root / rel) == digest
    rows = load_rows(root, "validation")  # P03 only; never instantiate the test split.
    sys.path.insert(0, str(source))
    import numpy as np
    import paddle
    import yaml
    from PIL import Image
    from rapidfuzz.distance import Levenshtein
    from ppocr.modeling.architectures import build_model
    from ppocr.postprocess import build_post_process

    out.mkdir(parents=True, exist_ok=False)
    crop_changes = derive_crops(root, rows, args.steel_left_margin, out)
    paddle.set_device("cpu")
    config = yaml.safe_load((source / "configs/rec/PP-OCRv5/multi_language/en_PP-OCRv5_mobile_rec.yaml").read_text(encoding="utf-8"))
    config["Global"]["character_dict_path"] = str(source / config["Global"]["character_dict_path"])
    decoder = build_post_process(config["PostProcess"], config["Global"])
    chars = list(decoder.character)
    # The browser represents the CTC blank as an empty string.
    chars[0] = ""
    config["Architecture"]["Head"]["out_channels_list"] = {"CTCLabelDecode": len(chars), "NRTRLabelDecode": len(chars) + 3}
    model = build_model(copy.deepcopy(config["Architecture"]))
    bridge = BrowserBridge(args.node)
    started = time.time()
    results = {}
    try:
        prepared = []
        for row in rows:
            with Image.open(row["path"]) as image:
                rgb = image.convert("RGB")
                prepared.append(bridge.call({"type": "prepare", "width": rgb.width, "height": rgb.height,
                                             "rgb": base64.b64encode(rgb.tobytes()).decode("ascii")}))
        for name, path in [("pretrained", original), ("pilot_v1_epoch4", pilot / "best.pdparams")]:
            state = paddle.load(str(path))
            expected = model.state_dict()
            assert set(state) == set(expected) and all(list(state[k].shape) == list(expected[k].shape) for k in state)
            model.set_state_dict(state)
            model.eval()
            predictions = {view: [] for view in ["aspect_raw", "aspect_ink", "aspect_views", "aspect_views_rules"]}
            with paddle.no_grad():
                for index, (row, inputs) in enumerate(zip(rows, prepared), 1):
                    outputs = []
                    for view in inputs["views"]:
                        array = np.frombuffer(base64.b64decode(view["data"]), dtype="<f4").reshape(view["dims"]).copy()
                        output = model(paddle.to_tensor(array)).numpy()
                        assert np.isfinite(output).all()
                        outputs.append({"dims": list(output.shape), "data": base64.b64encode(output.astype("<f4").tobytes()).decode("ascii")})
                    decoded = bridge.call({"type": "decode", "outputs": outputs, "characters": chars, "field": row["field"]})
                    for view, result in decoded.items():
                        text = result["text"]
                        predictions[view].append({"image": row["image"], "field": row["field"], "label": row["label"],
                                                  "raw": text, "prediction": "".join(text.upper().split()), "confidence": result["score"],
                                                  "glyph_review": result.get("glyphReview", False), "ink_found": inputs["inkFound"]})
                    if index % 8 == 0:
                        progress = {"model": name, "completed_fields": index, "total_fields": len(rows), "seconds": time.time() - started}
                        write_json(out / "status.json", progress)
                        print(json.dumps(progress), flush=True)
            summary = {view: summarize(values) for view, values in predictions.items()}
            results[name] = summary
            write_json(out / (name + ".json"), {"metrics": summary, "predictions": predictions})
            print(json.dumps({"model": name, "metrics": summary}), flush=True)
    finally:
        bridge.close()
    prior = json.loads((pilot / "validation-epoch-4.json").read_text(encoding="utf-8"))["predictions"]
    edits = {"insert": 0, "delete": 0, "replace": 0}
    for row in prior:
        if row["field"] == "steel":
            for edit in Levenshtein.editops(row["label"], row["prediction"]):
                edits[edit.tag] += 1
    core = Path(__file__).resolve().parents[2] / "DS-CYLINDER-REGISTRATION-DEMO"
    report = {"state": "completed", "split": "P03 validation only", "holdout_used": False, "weights_updated": False,
              "models": results, "pilot_v1_steel_errors": edits, "seconds": time.time() - started,
              "steel_left_margin": args.steel_left_margin, "crop_changes": len(crop_changes),
              "dataset_manifest_sha256": sha(manifest), "runner_sha256": runner_digest,
              "bridge_sha256": bridge_digest,
              "model_hashes": {"pretrained": sha(original), "pilot_v1_epoch4": sha(pilot / "best.pdparams")},
              "browser_code_hashes": {file: sha(core / file) for file in ["handwriting-core.js", "rules.js"]},
              "note": "Single V5 model ablation, not the deployed V5+V6 ensemble. Rules only select evidenced CTC alternatives; never insert missing characters."}
    write_json(out / "result.json", report)
    write_json(out / "status.json", {"state": "completed", "holdout_used": False, "seconds": report["seconds"]})


if __name__ == "__main__":
    main()

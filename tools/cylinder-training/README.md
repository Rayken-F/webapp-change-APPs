# Windows CPU handwriting pilot

This local-only tool fine-tunes the pinned PaddleOCR English recognition model.
It does not change the website, deploy a model, upload photographs, or disable
Windows protection. Run using the prepared PaddlePaddle 3.3.0 environment.

Required inputs are the private frozen v1 dataset, the pinned PaddleOCR source,
and the verified official pretrained `.pdparams`. Pass their absolute paths:

```text
python train_cpu.py train --dataset DATASET --paddleocr PADDLEOCR --weights WEIGHTS --run-dir PRIVATE_NEW_RUN_DIRECTORY
python train_cpu.py holdout --dataset DATASET --paddleocr PADDLEOCR --weights WEIGHTS --run-dir SAME_RUN_DIRECTORY
```

The first command checks dataset/crop hashes, writer splits, format eligibility,
source revision, dictionary and weight compatibility. It measures P03 before
training, trains only P01/P02, and checks P03 after each epoch. The pilot uses
batch size 2, up to 6 epochs, a conservative learning rate, frozen batch-normalizer
statistics, mild image augmentation and early stopping. It retains the baseline
when no eligible checkpoint improves. Check `status.json`, `history.json`, and
`result.json`; checkpoints and private predictions remain in the run directory.

The holdout command requires a frozen, hashed candidate. It evaluates the original
and selected model on P04 once, under identical preprocessing. An exclusive
marker prevents repeated use for parameter selection. A failed/interrupted holdout
must be investigated before any manual retry; do not silently remove its marker.

Metrics report CTN and steel separately, including exact-string accuracy and CER.
Scoring normalizes case and whitespace only; it never substitutes characters to
match the expected answer. CTN position rules and the steel third-letter rule
validate labels; they are not used to silently repair predictions.

This is a small pilot with two training writers. Copy targets repeat across
writers, so its results only measure unseen handwriting on a shared template.
They do not establish performance on unseen identifiers, new forms, or automatic
photograph alignment. The real application still requires model export and
integration validation before any deployment.

Do not commit photographs, labels, dataset manifests, predictions, weights,
checkpoints, or private paths to this public repository.

## Preprocessing audit and matched continuation

The original pilot used fixed-width evaluation. The application instead keeps
aspect ratio, reads both the original and blue-ink views, and ranks evidenced CTC
alternatives with the field format. `analyze_preprocessing.py` measures those
differences on P03 using the actual application JavaScript through a local Node
stdio bridge. No photographs leave the computer.

```text
python analyze_preprocessing.py --dataset DATASET --paddleocr PADDLEOCR --weights WEIGHTS --pilot-run FIRST_PILOT --output PRIVATE_NEW_AUDIT --node NODE_EXECUTABLE
```

Optionally add `--steel-left-margin 48` to compare a uniform extra margin from
the rectified source tables. The tool verifies historical crop geometry against
the frozen image pixels first. New images and their derivation hashes go only
to the new output directory; original crops, labels, exclusions, and writer
splits remain unchanged. This correction does not test automatic table detection.

The audit runs both the original pretrained weights and the frozen pilot candidate
through four paths: raw, ink, both views, and both views with evidenced positional
alternatives. It uses one V5 model, not the deployed V5+V6 ensemble. The positional
decoder never inserts missing characters or substitutes from the answer labels.

```text
python train_matched.py --dataset DATASET --paddleocr PADDLEOCR --pilot-run FIRST_PILOT --run-dir PRIVATE_NEW_RUN --node NODE_EXECUTABLE
```

This second experiment starts from the frozen first-pilot candidate. It uniformly
extends the steel crop 48 pixels left for P01-P03 and checks the starting model on
these same revised validation inputs before any updates. Each training sample
alternates raw/ink views across exactly two epochs, with aspect-preserving inputs,
batch size 2, learning rate 0.0000025, and frozen batch-normalizer statistics.
It adds no crop augmentation. Validation uses the same dual-view browser code.

Selection prioritizes steel exact-string accuracy and requires neither steel nor
CTN accuracy to fall below the starting-model result. If no checkpoint improves,
the original candidate is retained and `new_weights_selected` is false. Outputs
record source snapshots/hashes, crop provenance, the baseline, each epoch, raw-view
and final-decoder metrics, and the selected checkpoint hash. They do not deploy
or export a browser model. P04 images are never opened by either new tool.

The v1 `holdout` command is not valid for this new profile: a future held-out check
must freeze and use the same crop/preprocessing/decoder protocol for all compared
models. Keep P04 untouched until that candidate and protocol are finalized.

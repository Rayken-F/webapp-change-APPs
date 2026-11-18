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

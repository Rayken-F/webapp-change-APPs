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

## Label/crop audit and conservative continuation

`audit_features.py` reads only P01/P02 training and P03 validation records, checks
the frozen labels and crops, and records both view predictions, CTC alternatives,
and frozen visual features. It verifies cached-feature inference against full
model inference. `--training-crop-plan PRIVATE_PLAN` optionally restores reviewed
bottom-clipped training crops from the original photograph using the recorded
perspective transform. Each repair requires source and original-crop hashes;
overlapping pixels must match the previous crop (at most one intensity level).
No frozen crop, label, exclusion, or validation input is overwritten.

```text
python audit_features.py --dataset DATASET --paddleocr PADDLEOCR --pilot-run FIRST_PILOT --output PRIVATE_NEW_AUDIT --node NODE_EXECUTABLE --training-crop-plan PRIVATE_PLAN
python train_frozen_head.py --dataset DATASET --audit PRIVATE_NEW_AUDIT --pilot-run FIRST_PILOT --run-dir PRIVATE_NEW_RUN --node NODE_EXECUTABLE
python -m unittest discover -s tools/cylinder-training -p test_frozen_head.py
```

The head-only experiment freezes the backbone and sequence encoder. It trains
only the final CTC linear weight and bias, using both views of each P01/P02 field
in six epochs, batch size 8, learning rate 0.00005, true sequence lengths, and a
small teacher KL penalty to limit drift. P03 is used only for validation/selection;
its labels never participate in gradient updates. The best checkpoint must meet
the same per-field no-regression gate. All other model tensors are verified equal
to the starting checkpoint. Source snapshots, every epoch's predictions, original
view metrics, final decoder metrics, and hashes are retained privately.

A checkpoint is an intermediate training save, not an exported or ready model.
Export and P04 evaluation are deferred until recognition is sufficiently stable.
High CTC scores can accompany wrong strings. An ambiguous handwritten final
`0`/`O` cannot be guaranteed correct by CTN format because both are allowed there.
Retain disputed labels with an explicit review note rather than changing them
to agree with the model or the copy template.

## Sequence adaptation for confusions and missing characters

`train_sequence.py` starts from a verified prior classifier-only candidate and
the corrected audit inputs. The visual backbone stays frozen; the CTC sequence
encoder and classifier may learn. Its six-epoch protocol uses encoder/classifier
learning rates 0.000002/0.00001, four-view gradient accumulation, fixed batch
statistics and dropout, normalized CTC loss, and teacher KL regularization.
Each view keeps its own width throughout the sequence encoder.

```text
python train_sequence.py --dataset DATASET --paddleocr PADDLEOCR --audit CORRECTED_AUDIT --prior-run HEAD_ONLY_RUN --run-dir PRIVATE_NEW_RUN --node NODE_EXECUTABLE
python -m unittest discover -s tools/cylinder-training -p test_ctc_alignment.py
python -m unittest discover -s tools/cylinder-training -p test_sequence_freeze.py
python -m unittest discover -s tools/cylinder-training -p test_augmentation.py
```

A legal CTC forced alignment is computed only for P01/P02 labels, using the
initial model. An auxiliary cross-entropy term supervises real training `9`/`4`
occurrences and the final character. Repeated characters must have separate
frames. `ctc_alignment.py` is a training loss helper: it is not used to supply
answers, change predicted digits, or align validation/test labels for training.
Validation uses the unchanged browser raw/ink/rules path.

The default focused-loss weight is 0.05. `--focus-weight 0` is an explicit
controlled comparison with the same CTC/teacher objective and no focus term.
`--reuse-cache PRIVATE_PREVIOUS_RUN` can reuse hashed, frozen backbone features
only when the initial checkpoint, corrected input audit and PaddleOCR revision
match. It does not resume optimizer updates. Runs preserve source snapshots,
training-only alignments, per-view predictions, checkpoints and progress locally.

`--augment` adds two fixed width/slant variations (0.9/-0.1 and 1.1/0.1) to each
training field before the normal browser preprocessing. It expands the canvas
to retain edge strokes, adds no characters, and never transforms validation
images. The original two views remain in training. Augmented feature caches also
require matching augmentation profiles and helper source hashes. These variations
increase training views, not the number of real writers or independent samples.

`--visual-tail` also adapts only the backbone's final `blocks6` group at learning
rate 0.000001. Earlier visual layers and all running batch statistics stay fixed.
It caches the output of `blocks5` rather than the pooled backbone output; caches
from those stages cannot be mixed. The official sequence encoder's input detach
is disabled only to allow gradients to reach that group, without changing forward
values. Cached inference is again compared with the complete model, every selected
parameter must receive finite gradients, and every frozen tensor must stay equal.

Selection additionally rejects a checkpoint if any previously correct P03 string
becomes wrong. All frozen weights and batch statistics are verified unchanged.
Better training loss is not evidence of better recognition: report exact-string
counts, character errors, additions/omissions and regression cases separately.
Keep P04 and export deferred. Repeated tuning on the small P03 set cannot establish
performance on new handwriting or replace a later independent acceptance test.

`compare_training_runs.py` compares completed runs with the same baseline labels,
reports each field's exact counts, additions, omissions and 9/4 substitutions,
and retains per-epoch changes locally. Edit counts use a minimum-distance
alignment with explicit tie handling; this audit does not alter predictions.

```text
python compare_training_runs.py --baseline PRIVATE_BASELINE_JSON --run PRIVATE_COMPLETED_RUN --output PRIVATE_COMPARISON_JSON
python -m unittest discover -s tools/cylinder-training -p test_error_audit.py
```

## Continuing from a retained sequence checkpoint

`--prior-run` also accepts a completed sequence run with a selected checkpoint.
Its checksum and original validation outputs must match before training starts.
New runs use a new private directory and never overwrite the prior checkpoint.
`--epochs` permits one to six epochs, `--learning-rate-scale 0.5` halves all three
learning rates, and `--focus-weight 0.2` strengthens the same training-only 9/4
and final-character objective. These are explicit experiments, not recommended
settings or a claim of improved accuracy. Record the chosen protocol before the
run, including its seed, augmentation and fixed baseline. Selection still rejects
any loss of a previously correct validation string.

`--patience 2` ends a run after two consecutive epochs without an eligible
improvement; zero (the default) keeps the full planned protocol. The result
records planned/completed epochs and whether it stopped early. It never changes
the baseline or accepts a regressed checkpoint. A manually interrupted run is
not a completed experiment: preserve its last progress, completed validation
epochs and interruption reason separately, and discard unsaved partial updates.

An original-view comparison may reuse a verified augmented cache from the same
initial weights and input audit. Only the exact original training/validation
keys are retained; unknown or missing keys are rejected. Reused preprocessing
hashes are checked, and six cached views are compared with fresh full-model
inference. Different numbers of augmented views and optimizer updates must be
reported; matching epoch counts alone does not make an equal-budget comparison.

Validation now saves per-view probabilities beside each prediction file, including
the initial baseline. These private arrays allow lossless diagnosis of decoding
without rerunning or exporting a model. `audit_sequence_scores.py` compares the
existing result with raw-symbol prefix-beam candidates and exact CTC path-sum
likelihoods. It does not select or install a new application decoder. Blank frames
and repeated symbols are included in the likelihood; greedy emitted-character
averages are not full sequence probabilities. See the original
[CTC paper](https://www.cs.toronto.edu/~graves/icml_2006.pdf).

```text
python audit_sequence_scores.py --predictions PRIVATE_VALIDATION_JSON --probabilities PRIVATE_VALIDATION_NPZ --audit CORRECTED_AUDIT --output PRIVATE_NEW_REPORT_JSON
python -m unittest discover -s tools/cylinder-training -p test_ctc_beam.py
```

The diagnostic beam has width eight and considers eight leading symbols per
frame, plus blank and the previous symbol. Pruning is approximate. It uses no
answer labels, identifier lexicon, length bonus, or digit substitution to generate
candidates. Label likelihoods are reported only after candidate generation as an
error diagnostic. Cross-view likelihoods and the raw/ink views' confidence are not
automatically calibrated probabilities. Do not choose the longest candidate or
replace 4 with 9 solely to improve a known validation example. Keep unresolved
view disagreements visible and preserve the independent final holdout.

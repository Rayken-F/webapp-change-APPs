# IQC Honeywell OCR RC v15 — Hybrid Second Reader Plan

Date: 2026-08-23
Status: RC design / external AI upload disabled until explicit approval

## Decision

Local Tesseract OCR is no longer accepted as the primary IQC recognition engine.
Field evidence on the same fixed 3-photo batch remained about 2/5 successful after v14, despite recognition accuracy being correct when the engine completed successfully.

Therefore:

- Local OCR = offline/weak-network preview only.
- Cloud OCR/vision = second reader for failed/incomplete photos.
- DS validation rules = final authority.
- Human review = mandatory before formal IQC write during RC.

## Required flow

1. Photos are compressed and saved to IndexedDB first.
2. Local OCR runs at most one controlled pass per photo/batch.
3. If local result is complete and DS rules pass, mark `LOCAL_VERIFIED`.
4. If local OCR crashes, times out, returns no RT, or count does not reconcile, mark only the affected photo/group `AI_PENDING`.
5. Do not re-run the full local batch repeatedly.
6. When network is available and external AI endpoint is enabled, upload only `AI_PENDING` photos.
7. AI returns structured JSON only: RT, status, plant, expected_count, CTN candidates, confidence, continuation hints.
8. Merge Local + AI candidates conservatively.
9. DS validation checks:
   - RT exists in RT Master.
   - CTN matches 7-character format.
   - CTN uniqueness within batch and against current IQC data.
   - RT + status + plant grouping.
   - expected_count equals unique CTN count before PASS.
   - no candidate may be invented just to satisfy expected_count.
10. Human confirms before RC IQC write.

## Cross-page continuation

A photo that contains CTNs but no RT header may be attached to the immediately preceding group only when ALL conditions are true:

- previous photo/group is incomplete;
- current photo has no conflicting RT/status/plant header;
- all candidate CTNs are valid and unique;
- number of orphan CTNs does not exceed the previous group's remaining expected count;
- photo sequence is contiguous;
- otherwise keep as `UNASSIGNED` for review.

## Weak-network behavior

- Image capture never waits for network.
- Full photo blob stays in IndexedDB.
- AI upload queue is resumable and idempotent per `photo_id`.
- Network loss changes only sync timing; it must not require re-taking photos.
- User can continue field work while `AI_PENDING` remains queued.

## Memory rules

- Never keep all full-size photo blobs in UI state.
- Decode only the active photo.
- Release Worker/Bitmap/Canvas/ObjectURL after each active operation.
- On panel close, module switch, app background, new batch, or exception: call memory cleanup.
- IndexedDB retention is storage, not RAM; keep pending photos until successful server receipt/confirmation.

## Acceptance criteria

Recognition correctness:
- No false CTN may be promoted to PASS.
- Same RT + status + plant across photos must merge into one logical group.
- Missing header continuation must never be guessed unless strict continuation rules pass.

Reliability:
- The Hybrid path should not depend on repeated local OCR attempts.
- External second-reader success target: >= 48/50 complete batch runs under test conditions before production promotion.

## Security / privacy gate

External image upload remains disabled until the user explicitly approves sending Honeywell IQC photos to the selected cloud OCR/AI provider.
API credentials must never be embedded in GitHub Pages/client JavaScript; credentials live server-side only (Apps Script Properties / server secret store).

## Rollback

Remove the v15 queue/orchestrator script from the RC index and fall back to v14 local OCR-only behavior. No production DS/IQC code is touched by this plan.

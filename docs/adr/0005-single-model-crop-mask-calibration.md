# ADR 0005: One model with a crop mask, and calibrated confidence

- Status: accepted
- Scope: `services/ai-service`, `docs/api/ai-predict.md`

## Context

The app diagnoses plant diseases for four crops (potato, tomato, maize, wheat). The farmer chooses the crop
before taking the photo. Two questions had to be settled:

1. One model for all crops, or one per crop?
2. What does "confidence" mean to the user? The raw softmax of a network trained on mixed sources is far too
   sure of itself on field photos.

## Decision

**One model with a crop mask.**

- One EfficientNet-B0 (224×224, ImageNet weights) predicts all classes of all crops, plus the class `unknown`.
  The head, the masks, the dataset folders and the tests are built from `classes.yaml`
  ([classes.md](../ai/classes.md)).
- The request carries the crop. The answer is chosen among the classes of that crop plus `unknown`; `top3` is
  always inside the requested crop and never contains `unknown`.
- If the unmasked prediction points to another crop with confidence ≥ 0.70, the status is `crop_mismatch`.
  It is checked first and wins over `unknown`.
- The service returns codes only; names and treatment come from the backend. Clients rely on `status`, not on
  thresholds.

**Temperature scaling.**

- The probabilities are divided by a temperature `T` before the softmax. `T` is read from `model_card.json`
  (`temperature`); for `effnet-b0-v1` (run A5-E001) it is `3.79`. Without it the service logs a warning, uses the raw softmax, and never answers `ok` or `crop_mismatch`
  (the health endpoint reports the model as not calibrated).
- `T` is fitted only on the field photos of `val` (1 688 photos) by minimising the log-loss of the answer as the
  service gives it. `test` and the independent `bench` are used only to check it.

**Thresholds** (configuration of the service, not of clients):

| Setting | Value | Meaning |
| --- | --- | --- |
| `AI_OK_THRESHOLD` | 0.70 | best class ≥ 0.70 → `ok` |
| `AI_LOW_THRESHOLD` | 0.25 | best class below it → "not recognized"; between 0.25 and 0.70 → `low_confidence` |
| `AI_UNKNOWN_THRESHOLD` | 0.5 | p(`unknown`) ≥ 0.5 → `unknown` |
| `AI_CROP_MISMATCH_THRESHOLD` | 0.70 | unmasked top class of another crop at ≥ 0.70 → `crop_mismatch` |

`low` was chosen on `val` and only confirmed on `test` and `bench`. The rule behind it: calling an ordinary
crop photo "not recognized" is worse than showing `low_confidence` with the three best candidates.

## Evidence (A5-E001, field photos; details in [evaluation.md](../ai/evaluation.md))

- Without `T` the model says 79–83 % while being right 46–56 % of the time. With `T = 3.79` the calibration
  error (ECE) falls from 0.331 to 0.067 on `val`, from 0.320 to 0.071 on `test`, and from 0.269 to 0.087 on
  `bench`, which was not used for the fit. Accuracy does not change.
- With `T` and the thresholds above, `ok` covers 15–18 % of field photos and is right 80–98 % of the time. The
  share of right answers stays at 43–53 % of all photos; they are now sorted into honest statuses.
- Without `T` the service would say `ok` for 49–66 % of field photos and be wrong for 27–32 % of those answers;
  with `T` false `crop_mismatch` drops from 5.5 % to 0.1 % on `bench`.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| One model per crop | Four artifacts to train, version and deploy; the `unknown` class and the crop-mismatch check would need a separate model anyway |
| One model without a mask | The farmer's crop choice is free information; ignoring it lets a tomato photo be answered with a potato disease |
| Raw softmax as confidence | Overconfident by 0.27–0.33 on field photos (ECE above); `ok` would be wrong for about a third of answers |
| Calibrate on `bench` | `bench` is the independent check; fitting on it would leave nothing to test calibration against |
| A10-E001 (more field data, `T = 1.38`) | Calibrated on its own sources, but overconfident on independent `bench` (ECE 0.305 → 0.243) and its crop-masked macro-F1 on `bench` is lower than A5-E001 (−0.034, interval excludes 0) |

## Consequences

- Calibration is tied to one model version. A new model needs its own `T` and a re-check of the thresholds
  before `model_version` changes; the model card must carry `temperature`.
- `T` fitted on field photos of the training sources does not make a model trustworthy on other sources
  (A10-E001). The independent `bench` stays the judge.
- The set of own field photos (`own`) is not collected yet, so quality on real farmers' photos is not
  measured; this is an open item of the A6/A7/A8 work.
- Weak classes (wheat, `tomato__bacterial_spot`) remain; they are visible in the per-class table of
  [evaluation.md](../ai/evaluation.md).
- API contract: [ai-predict.md](../api/ai-predict.md).

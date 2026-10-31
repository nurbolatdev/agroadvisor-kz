"""Markdown tables for ``docs/ai/evaluation.md``, built from ``results.json`` of finished runs.

Numbers are copied from the artifacts, never typed by hand::

    python -m ml.eval_report ml/runs/A5-E001 ml/runs/A10-E001 --key bench@v2
"""

import argparse
import json
from pathlib import Path

CROPS = ("tomato", "potato", "corn", "wheat")
MAIN = "crop_masked_product_macro_f1"


def _interval(ci95: dict, name: str) -> str:
    low_high = ci95.get(name)
    return "n/a" if not low_high else f"{low_high[0]:.3f}–{low_high[1]:.3f}"


def _with_interval(value: float | None, ci95: dict, name: str) -> str:
    point = "n/a" if value is None else f"{value:.3f}"
    return f"{point} ({_interval(ci95, name)})"


def _headline(scores: dict[str, dict]) -> list[str]:
    lines = [
        "| Run | Photos | Left out | Accuracy | Top-3 | Crop-masked accuracy "
        "| Crop-masked macro-F1 (95 % CI) | Field macro-F1 (95 % CI) |",
        "| --- | ---: | ---: | ---: | ---: | ---: | --- | --- |",
    ]
    for run_id, m in scores.items():
        ci95 = m.get("ci95", {})
        field = m.get("crop_masked_product_by_domain", {}).get("field", {})
        lines.append(
            f"| {run_id} | {m['evaluated_photos']} | {m['excluded_train_overlap']} "
            f"| {m['acc']:.3f} | {m['top3_acc']:.3f} | {m['crop_masked_product_acc']:.3f} "
            f"| {_with_interval(m[MAIN], ci95, MAIN)} "
            f"| {_with_interval(field.get('macro_f1'), ci95, MAIN + '_field')} |"
        )
    return lines


def _by_crop(scores: dict[str, dict]) -> list[str]:
    lines = [
        "| Run | Crop | Field photos | Accuracy | Macro-F1 (95 % CI) |",
        "| --- | --- | ---: | ---: | --- |",
    ]
    for run_id, m in scores.items():
        ci95 = m.get("ci95", {})
        by_crop = m.get("crop_masked_product_field_by_crop", {})
        for crop in CROPS:
            if crop in by_crop:
                row = by_crop[crop]
                lines.append(
                    f"| {run_id} | {crop} | {row['n']} | {row['acc']:.3f} "
                    f"| {_with_interval(row['macro_f1'], ci95, f'{MAIN}_field_{crop}')} |"
                )
    return lines


def _per_class(run_id: str, m: dict) -> list[str]:
    lines = [
        f"#### {run_id}",
        "",
        "| Class | Precision | Recall | F1 | Photos |",
        "| --- | ---: | ---: | ---: | ---: |",
    ]
    for code, row in m.get("per_class", {}).items():
        lines.append(
            f"| {code} | {row['precision']:.3f} | {row['recall']:.3f} | {row['f1']:.3f} "
            f"| {row['support']} |"
        )
    return lines


def render(scores: dict[str, dict], key: str) -> str:
    """Tables for the scores stored under ``key`` (``val``, ``test@v2``, ``bench@v2`` ...)."""
    out = [f"### Scores on `{key}`", "", *_headline(scores), ""]
    out += ["Field photos by crop:", "", *_by_crop(scores), ""]
    for run_id, m in scores.items():
        unknown = m.get("unknown")
        if unknown:
            out.append(
                f"`unknown` in {run_id}: precision {unknown['precision']:.3f}, "
                f"recall {unknown['recall']:.3f}. The class was trained on other plants and "
                "objects; the model does not recognize unknown diseases."
            )
    out += ["", "Per class:", ""]
    for run_id, m in scores.items():
        out += [*_per_class(run_id, m), ""]
    return "\n".join(out)


def render_runs(run_dirs: list[Path], key: str) -> str:
    scores: dict[str, dict] = {}
    for run_dir in run_dirs:
        run_dir = Path(run_dir)
        run_id = json.loads((run_dir / "config.json").read_text(encoding="utf-8"))["id"]
        results = json.loads((run_dir / "results.json").read_text(encoding="utf-8"))
        if key not in results:
            raise KeyError(f"{key!r} has not been scored for {run_id}; run ml.evaluate first")
        scores[run_id] = results[key]
    return render(scores, key)


def main() -> None:
    parser = argparse.ArgumentParser(description="Markdown tables from the results of runs")
    parser.add_argument("run_dirs", type=Path, nargs="+")
    parser.add_argument("--key", required=True, help="results key, e.g. val, test@v2, bench@v2")
    parser.add_argument("--out", type=Path, help="write to a file instead of stdout")
    args = parser.parse_args()
    text = render_runs(args.run_dirs, args.key)
    if args.out:
        args.out.write_text(text + "\n", encoding="utf-8")
    else:
        print(text)


if __name__ == "__main__":
    main()

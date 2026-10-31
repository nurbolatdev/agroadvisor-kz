import json

from ml.eval_report import render, render_runs


def scores(acc: float, with_ci: bool = True) -> dict:
    result = {
        "n": 100,
        "acc": acc,
        "macro_f1": acc - 0.01,
        "top3_acc": 0.9,
        "crop_masked_product_acc": acc - 0.02,
        "crop_masked_product_macro_f1": acc - 0.03,
        "evaluated_photos": 90,
        "excluded_train_overlap": 10,
        "crop_masked_product_by_domain": {
            "lab": {"acc": 0.0, "macro_f1": 0.0, "n": 0},
            "field": {"acc": 0.55, "macro_f1": 0.5, "n": 90},
        },
        "crop_masked_product_field_by_crop": {
            "tomato": {"acc": 0.5, "macro_f1": 0.45, "n": 40},
            "wheat": {"acc": 0.8, "macro_f1": 0.75, "n": 50},
        },
        "unknown": {"precision": 0.1, "recall": 0.2},
        "per_class": {
            "tomato__healthy": {"precision": 0.5, "recall": 0.25, "f1": 0.33, "support": 20},
            "wheat__healthy": {"precision": 1.0, "recall": 1.0, "f1": 1.0, "support": 0},
        },
    }
    if with_ci:
        result["ci95"] = {
            "crop_masked_product_macro_f1": [acc - 0.05, acc],
            "crop_masked_product_macro_f1_field": [0.4, 0.6],
            "crop_masked_product_macro_f1_field_tomato": [0.3, 0.6],
            "crop_masked_product_macro_f1_field_wheat": [0.7, 0.8],
        }
    return result


def test_headline_table_shows_the_numbers_with_their_intervals():
    text = render({"A10-E001": scores(0.9)}, "bench@v2")

    row = next(line for line in text.splitlines() if line.startswith("| A10-E001 | 90 |"))
    cells = [c.strip() for c in row.strip("|").split("|")]
    assert cells == [
        "A10-E001", "90", "10", "0.900", "0.900", "0.880",
        "0.870 (0.850–0.900)",  # crop-masked product macro-F1 with its 95 % interval
        "0.500 (0.400–0.600)",  # the same on field photos
    ]  # fmt: skip


def test_the_top_three_the_app_shows_is_reported_for_all_and_for_field_photos():
    scored = scores(0.9)
    scored["crop_masked_product_top3_acc"] = 0.97
    scored["crop_masked_product_top3_acc_field"] = 0.91

    text = render({"A10-E001": scored}, "bench@v2")

    row = next(line for line in text.splitlines() if line.startswith("| A10-E001 | 0.970 |"))
    assert row == "| A10-E001 | 0.970 | 0.910 |"


def test_a_run_scored_before_that_metric_existed_shows_n_a():
    text = render({"A5-E002": scores(0.8)}, "val")

    assert "| A5-E002 | n/a | n/a |" in text


def test_a_run_without_intervals_says_so_instead_of_inventing_them():
    text = render({"A5-E002": scores(0.8, with_ci=False)}, "val")

    row = next(line for line in text.splitlines() if line.startswith("| A5-E002 | 90 |"))
    assert row.rstrip().endswith("| 0.770 (n/a) | 0.500 (n/a) |")


def test_field_by_crop_table_has_the_sample_sizes():
    text = render({"A10-E001": scores(0.9)}, "bench@v2")

    assert "tomato" in text and "wheat" in text
    assert "0.300–0.600" in text  # the interval of the tomato field F1
    assert "| 40 |" in text


def test_per_class_table_lists_every_class_with_its_support():
    text = render({"A10-E001": scores(0.9)}, "bench@v2")

    assert "| tomato__healthy | 0.500 | 0.250 | 0.330 | 20 |" in text


def test_a_class_without_photos_shows_a_dash_not_a_zero():
    text = render({"A10-E001": scores(0.9)}, "bench@v2")

    # the stored precision cannot tell "never predicted" from "always wrong" when there are no
    # photos, so nothing is shown; the row stays because the gap is itself a finding
    assert "| wheat__healthy | — | — | — | 0 |" in text


def test_unknown_is_reported_with_the_honest_caveat():
    scored = scores(0.9)
    scored["per_class"]["unknown"] = {"precision": 0.1, "recall": 0.2, "f1": 0.13, "support": 30}

    text = render({"A10-E001": scored}, "bench@v2")

    assert "`unknown` in A10-E001: precision 0.100, recall 0.200" in text
    assert "does not recognize unknown diseases" in text


def test_unknown_without_photos_in_the_split_is_not_reported_as_zero():
    scored = scores(0.9)
    scored["per_class"]["unknown"] = {"precision": 0.0, "recall": 0.0, "f1": 0.0, "support": 0}

    text = render({"A10-E001": scored}, "bench@v2")

    assert "`unknown` in A10-E001: no photos of this class in the split" in text
    assert "precision 0.000" not in text


def test_reads_the_results_of_run_folders(tmp_path):
    for run_id, acc in (("A5-E001", 0.7), ("A10-E001", 0.9)):
        run = tmp_path / run_id
        run.mkdir()
        (run / "results.json").write_text(json.dumps({"bench@v2": scores(acc)}), encoding="utf-8")
        (run / "config.json").write_text(json.dumps({"id": run_id}), encoding="utf-8")

    text = render_runs([tmp_path / "A5-E001", tmp_path / "A10-E001"], "bench@v2")

    assert text.index("A5-E001") < text.index("A10-E001")
    assert "0.700" in text and "0.900" in text


def test_a_missing_score_is_a_clear_error(tmp_path):
    run = tmp_path / "A5-E001"
    run.mkdir()
    (run / "results.json").write_text(json.dumps({"val": scores(0.7)}), encoding="utf-8")
    (run / "config.json").write_text(json.dumps({"id": "A5-E001"}), encoding="utf-8")

    try:
        render_runs([run], "bench@v2")
    except KeyError as error:
        assert "bench@v2" in str(error) and "A5-E001" in str(error)
    else:
        raise AssertionError("expected a KeyError")

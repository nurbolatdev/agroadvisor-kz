import numpy as np
import pytest

from ml.evaluate import compute_metrics
from ml.registry import load_registry

REGISTRY = load_registry()
CLASSES = [c.code for c in REGISTRY.active()]
INDEX = {code: i for i, code in enumerate(CLASSES)}


def ranked(*codes: str) -> np.ndarray:
    """Logits that rank the given classes first, second, third ... and everything else last."""
    logits = np.zeros(len(CLASSES))
    for rank, code in enumerate(codes):
        logits[INDEX[code]] = 10.0 - rank
    return logits


def score(rows: list[tuple[str, np.ndarray, str]]) -> dict:
    """``rows``: (true class, logits, domain); every photo is of the crop of its true class."""
    targets = np.array([INDEX[true] for true, _, _ in rows])
    logits = np.stack([row[1] for row in rows])
    crops = [REGISTRY.get(true).crop for true, _, _ in rows]
    kinds = [row[2] for row in rows]
    return compute_metrics(logits, targets, CLASSES, crops, kinds, REGISTRY)


def test_the_second_answer_inside_the_crop_counts_for_the_top_three():
    # the model puts the right class second among the tomato classes
    m = score([
        ("tomato__late_blight", ranked("tomato__early_blight", "tomato__late_blight"), "field"),
    ])  # fmt: skip

    assert m["crop_masked_product_acc"] == 0.0
    assert m["crop_masked_product_top3_acc"] == 1.0


def test_answers_of_another_crop_do_not_fill_the_top_three():
    # plain top-3 is spent on corn classes; inside tomato the right class is far down the list
    logits = ranked("corn__common_rust", "corn__gray_leaf_spot", "corn__northern_leaf_blight",
                    "tomato__late_blight")  # fmt: skip
    m = score([("tomato__late_blight", logits, "field")])

    assert m["top3_acc"] == 0.0
    assert m["crop_masked_product_top3_acc"] == 1.0  # corn is masked out, tomato is the only crop


def test_unknown_may_take_a_place_as_the_product_does():
    # inside tomato + unknown the right class is fourth: out of the top three
    logits = ranked("unknown", "tomato__early_blight", "tomato__septoria_leaf_spot",
                    "tomato__late_blight")  # fmt: skip
    m = score([("tomato__late_blight", logits, "field")])

    assert m["crop_masked_product_top3_acc"] == 0.0


def test_field_photos_get_their_own_number():
    hit = ranked("tomato__late_blight")
    miss = ranked("unknown", "tomato__early_blight", "tomato__septoria_leaf_spot",
                  "tomato__late_blight")  # fmt: skip
    m = score([
        ("tomato__late_blight", hit, "lab"),
        ("tomato__late_blight", miss, "field"),
    ])

    assert m["crop_masked_product_top3_acc"] == pytest.approx(0.5)
    assert m["crop_masked_product_top3_acc_field"] == 0.0


def test_photos_without_a_crop_are_left_out_and_nothing_is_reported_as_zero():
    m = score([("unknown", ranked("unknown"), "other")])

    assert m["crop_masked_product_top3_acc"] is None  # nothing to score, not "0 % right"
    assert m["crop_masked_product_top3_acc_field"] is None
    assert m["diseased_called_healthy"]["rate"] is None
    assert m["crop_masked_n"] == 0


def test_top_three_is_also_given_per_crop_for_field_photos():
    m = score([
        ("tomato__late_blight", ranked("tomato__late_blight"), "field"),
        ("potato__late_blight", ranked("potato__healthy", "unknown", "potato__early_blight",
                                       "potato__late_blight"), "field"),
    ])  # fmt: skip

    by_crop = m["crop_masked_product_field_by_crop"]
    assert by_crop["tomato"]["top3_acc"] == 1.0
    assert by_crop["potato"]["top3_acc"] == 0.0  # right class fourth among 3 classes + unknown
    assert by_crop["wheat"]["top3_acc"] is None  # no wheat photos


def test_a_diseased_leaf_called_healthy_is_counted():
    m = score([
        ("tomato__late_blight", ranked("tomato__healthy"), "field"),  # missed disease
        ("tomato__late_blight", ranked("tomato__late_blight"), "field"),
        ("potato__early_blight", ranked("potato__late_blight"), "lab"),  # wrong, not healthy
        ("tomato__healthy", ranked("tomato__healthy"), "field"),  # healthy: not counted
    ])  # fmt: skip

    missed = m["diseased_called_healthy"]
    assert (missed["photos"], missed["called_healthy"]) == (3, 1)
    assert missed["rate"] == pytest.approx(1 / 3)
    assert (missed["field_photos"], missed["field_called_healthy"]) == (2, 1)
    assert missed["field_rate"] == pytest.approx(0.5)


def test_the_crop_mask_decides_what_counts_as_healthy():
    # the raw winner is another crop's healthy class; inside tomato the answer is a disease
    logits = ranked("corn__healthy", "tomato__late_blight")
    m = score([("tomato__late_blight", logits, "field")])

    assert m["diseased_called_healthy"]["called_healthy"] == 0

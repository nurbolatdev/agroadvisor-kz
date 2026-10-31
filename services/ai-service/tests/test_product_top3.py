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


def test_photos_without_a_crop_are_left_out():
    m = score([("unknown", ranked("unknown"), "other")])

    assert m["crop_masked_product_top3_acc"] == 0.0  # nothing to score
    assert m["crop_masked_n"] == 0

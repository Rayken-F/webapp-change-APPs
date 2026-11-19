"""Synthetic checks for writer/label isolation and variable-length CTC batches."""
import unittest

from train_frozen_head import check_partition


class PartitionTests(unittest.TestCase):
    def setUp(self):
        self.row = {"image": "crops/P01-example.png", "label": "AB00CD1", "field": "ctn",
                    "split": "train", "writer": "P01", "features": ["raw", "ink"]}

    def test_matching_partition(self):
        check_partition([self.row], [self.row])

    def test_holdout_cannot_enter_training(self):
        with self.assertRaises(AssertionError):
            check_partition([{**self.row, "writer": "P04"}], [self.row])

    def test_labels_cannot_change(self):
        with self.assertRaises(AssertionError):
            check_partition([{**self.row, "label": "AB00CD2"}], [self.row])

    def test_duplicate_records_rejected(self):
        with self.assertRaises(AssertionError):
            check_partition([self.row, self.row], [self.row, self.row])

    def test_missing_view_rejected(self):
        with self.assertRaises(AssertionError):
            check_partition([{**self.row, "features": ["raw"]}], [self.row])


class CTCTests(unittest.TestCase):
    def test_padding_does_not_change_loss_or_receive_gradient(self):
        import numpy as np
        import paddle
        paddle.set_device("cpu")
        paddle.seed(4)
        logits = paddle.randn([7, 2, 5])
        logits.stop_gradient = False
        labels = paddle.to_tensor([[1, 2], [2, 3]], dtype="int32")
        lengths = paddle.to_tensor([5, 7], dtype="int64")
        label_lengths = paddle.to_tensor([2, 2], dtype="int64")
        loss = paddle.nn.CTCLoss(blank=0, reduction="none")
        batched = loss(logits, labels, lengths, label_lengths)
        for i, length in enumerate([5, 7]):
            single = loss(logits[:length, i:i+1], labels[i:i+1], lengths[i:i+1], label_lengths[i:i+1])
            np.testing.assert_allclose(batched.numpy()[i], single.numpy()[0], rtol=1e-6, atol=1e-6)
        batched.sum().backward()
        np.testing.assert_array_equal(logits.grad.numpy()[5:, 0], 0)
        self.assertTrue(np.isfinite(logits.grad.numpy()).all())


if __name__ == "__main__":
    unittest.main()

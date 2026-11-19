import unittest

import numpy as np
import paddle

from train_sequence import configure_trainable


class FreezeTests(unittest.TestCase):
    def test_visual_tail_excludes_early_layers_and_all_batch_statistics(self):
        model = paddle.nn.Layer()
        model.backbone = paddle.nn.Layer()
        model.backbone.blocks5 = paddle.nn.Linear(4, 4)
        model.backbone.blocks6 = paddle.nn.Sequential(paddle.nn.BatchNorm1D(4), paddle.nn.Linear(4, 3))
        model.eval()
        names = configure_trainable(model, visual_tail=True)
        self.assertTrue(names)
        self.assertTrue(all(n.startswith('backbone.blocks6.') for n in names))
        self.assertFalse(any(n.endswith(('._mean', '._variance')) for n in names))
        model.backbone.blocks6(model.backbone.blocks5(paddle.ones([2, 4]))).sum().backward()
        self.assertTrue(all(p.grad is not None for p in model.parameters() if not p.stop_gradient))
        self.assertTrue(all(p.grad is None for p in model.parameters() if p.stop_gradient))

    def test_optimizer_updates_weights_without_batch_statistics_or_backbone(self):
        model = paddle.nn.Layer()
        model.backbone = paddle.nn.Linear(4, 4)
        model.head = paddle.nn.Layer()
        model.head.ctc_encoder = paddle.nn.Sequential(paddle.nn.BatchNorm1D(4), paddle.nn.Linear(4, 4))
        model.head.ctc_head = paddle.nn.Layer()
        model.head.ctc_head.fc = paddle.nn.Linear(4, 3)
        model.eval()
        names = configure_trainable(model)
        self.assertTrue(any('ctc_encoder' in n for n in names))
        self.assertFalse(any(n.endswith(('._mean', '._variance')) for n in names))
        before = {k: v.numpy().copy() for k, v in model.state_dict().items()}
        optimizer = paddle.optimizer.Adam(learning_rate=0.001,
                                         parameters=[p for p in model.parameters() if not p.stop_gradient])
        x = model.backbone(paddle.ones([3, 4]))
        loss = model.head.ctc_head.fc(model.head.ctc_encoder(x)).square().mean()
        loss.backward()
        self.assertTrue(all(p.grad is not None for p in model.parameters() if not p.stop_gradient))
        self.assertTrue(all(p.grad is None for p in model.parameters() if p.stop_gradient))
        optimizer.step()
        after = model.state_dict()
        for k in before:
            if k not in names:
                np.testing.assert_array_equal(before[k], after[k].numpy())
        self.assertTrue(any(not np.array_equal(before[k], after[k].numpy()) for k in names))


if __name__ == '__main__':
    unittest.main()

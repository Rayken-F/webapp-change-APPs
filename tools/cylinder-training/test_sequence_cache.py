import unittest

from train_sequence import original_views_only


class CacheSubsetTests(unittest.TestCase):
    def test_original_views_are_retained_without_augmentation(self):
        base, extra = {'0-raw', '0-ink'}, {'0-aug-raw', '0-aug-ink'}
        features = {k: object() for k in base | extra}
        result = original_views_only(features, base, extra)
        self.assertEqual(set(result), base)
        self.assertTrue(all(result[k] is features[k] for k in base))
        self.assertEqual(set(features), base | extra)

    def test_rejects_unknown_and_missing_views(self):
        base, extra = {'0-raw', '0-ink'}, {'0-aug-raw'}
        for keys in (base | {'holdout'}, {'0-raw'}, base | extra | {'unknown'}):
            with self.assertRaises(ValueError):
                original_views_only(dict.fromkeys(keys), base, extra)


if __name__ == '__main__':
    unittest.main()

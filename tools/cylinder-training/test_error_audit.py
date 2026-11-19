import unittest

from compare_training_runs import edit_operations, error_counts


class ErrorAuditTests(unittest.TestCase):
    def test_missing_tail_and_confusion_are_distinct(self):
        self.assertEqual(edit_operations('AA009', 'AA00'), [{'kind': 'omission', 'expected': '9', 'predicted': ''}])
        self.assertEqual(edit_operations('AA009', 'AA004'), [{'kind': 'substitution', 'expected': '9', 'predicted': '4'}])

    def test_addition_and_field_counts(self):
        self.assertEqual(edit_operations('12A000', '12A0000'), [{'kind': 'addition', 'expected': '', 'predicted': '0'}])
        counts = error_counts([{'field': 'steel', 'label': '12A009', 'prediction': '12A004'},
                               {'field': 'ctn', 'label': 'AB12CD9', 'prediction': 'AB12CD'}])
        self.assertEqual(counts['steel']['nine_to_four'], 1)
        self.assertEqual(counts['steel']['omissions'], 0)
        self.assertEqual(counts['ctn']['omissions'], 1)


if __name__ == '__main__':
    unittest.main()

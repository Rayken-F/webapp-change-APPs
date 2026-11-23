"""Audit additions, omissions and confusions without changing training or labels."""
import argparse
import json
from pathlib import Path

from train_cpu import write_json


def edit_operations(expected, predicted):
    costs = [[0] * (len(predicted) + 1) for _ in range(len(expected) + 1)]
    for i in range(len(expected) + 1):
        costs[i][0] = i
    for j in range(len(predicted) + 1):
        costs[0][j] = j
    for i, a in enumerate(expected, 1):
        for j, b in enumerate(predicted, 1):
            costs[i][j] = min(costs[i - 1][j - 1] + (a != b), costs[i - 1][j] + 1, costs[i][j - 1] + 1)
    i, j, operations = len(expected), len(predicted), []
    while i or j:
        if i and j and costs[i][j] == costs[i - 1][j - 1] + (expected[i - 1] != predicted[j - 1]):
            if expected[i - 1] != predicted[j - 1]:
                operations.append({'kind': 'substitution', 'expected': expected[i - 1], 'predicted': predicted[j - 1]})
            i, j = i - 1, j - 1
        elif i and costs[i][j] == costs[i - 1][j] + 1:
            operations.append({'kind': 'omission', 'expected': expected[i - 1], 'predicted': ''})
            i -= 1
        else:
            operations.append({'kind': 'addition', 'expected': '', 'predicted': predicted[j - 1]})
            j -= 1
    return list(reversed(operations))


def error_counts(rows, key='prediction'):
    result = {}
    for field in ('steel', 'ctn'):
        selected = [r for r in rows if r['field'] == field]
        operations = [op for r in selected for op in edit_operations(r['label'], ''.join(r[key].upper().split()))]
        result[field] = {'count': len(selected),
                         'correct': sum(''.join(r[key].upper().split()) == r['label'] for r in selected),
                         'substitutions': sum(op['kind'] == 'substitution' for op in operations),
                         'omissions': sum(op['kind'] == 'omission' for op in operations),
                         'additions': sum(op['kind'] == 'addition' for op in operations),
                         'nine_to_four': sum(op['expected'] == '9' and op['predicted'] == '4' for op in operations),
                         'four_to_nine': sum(op['expected'] == '4' and op['predicted'] == '9' for op in operations)}
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--baseline', required=True, type=Path)
    parser.add_argument('--run', required=True, action='append', type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    assert not args.output.resolve().is_relative_to(Path(__file__).resolve().parents[2])
    baseline = json.loads(args.baseline.read_text(encoding='utf-8'))['predictions']
    reference = {r['image']: r for r in baseline}
    report = {'baseline': error_counts(baseline), 'runs': [],
              'note': 'Edit counts use one minimum-distance alignment; ambiguous ties prefer substitution. No training or label edits.'}
    for directory in args.run:
        result = json.loads((directory / 'result.json').read_text(encoding='utf-8'))
        assert result['state'] == 'completed' and not result['holdout_used'] and not result['exported']
        epochs = []
        for epoch in range(1, result['epochs'] + 1):
            rows = json.loads((directory / f'validation-epoch-{epoch}.json').read_text(encoding='utf-8'))['predictions']
            assert len(rows) == len(reference) and len({r['image'] for r in rows}) == len(reference)
            assert all(r['label'] == reference[r['image']]['label'] and r['field'] == reference[r['image']]['field'] for r in rows)
            epochs.append({'epoch': epoch, 'counts': error_counts(rows),
                           'views': {v: error_counts(rows, v) for v in ('raw_view', 'ink_view')},
                           'changes': [{**r, 'before': reference[r['image']]['prediction']} for r in rows
                                       if r['prediction'] != reference[r['image']]['prediction']]})
        report['runs'].append({'run': str(directory), 'selected_epoch': result['selected_epoch'],
                               'new_weights_selected': result['new_weights_selected'], 'epochs': epochs})
    write_json(args.output, report)
    print(json.dumps({'baseline': report['baseline'], 'runs': [
        {'run': r['run'], 'selected_epoch': r['selected_epoch'],
         'last_epoch': r['epochs'][-1]['counts']} for r in report['runs']]}))


if __name__ == '__main__':
    main()

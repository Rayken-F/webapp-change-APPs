"""Diagnose private saved validation probabilities without selecting a decoder.

Labels are used only for error reporting and diagnostic likelihoods, never to
generate candidates. This command does not read photographs, train, or export.
"""
import argparse
import json
from pathlib import Path

import numpy as np

from ctc_beam import log_probability, prefix_beam
from train_cpu import sha, summarize, write_json


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--predictions', type=Path, required=True)
    parser.add_argument('--probabilities', type=Path, required=True)
    parser.add_argument('--audit', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    repo = Path(__file__).resolve().parents[2]
    assert not args.output.resolve().is_relative_to(repo)
    assert not args.output.exists()
    audited = json.loads((args.audit / 'audit.json').read_text(encoding='utf-8'))
    chars = audited['characters']
    ids = {c: i for i, c in enumerate(chars)}
    data = json.loads(args.predictions.read_text(encoding='utf-8'))
    arrays = dict(np.load(args.probabilities, allow_pickle=False))
    records, raw_predictions, ink_predictions = [], [], []
    lookup = {r['image']: i for i, r in enumerate(audited['records'])}
    normalize = lambda s: ''.join(s.upper().split())
    for row in data['predictions']:
        i = lookup[row['image']]
        original = audited['records'][i]
        assert original['split'] == 'validation' and original['writer'] == 'P03'
        assert original['label'] == row['label']
        views = []
        for v in (0, 1):
            p = arrays.pop(f'{i:03d}-{v}')[0]
            path = p.argmax(axis=1)
            greedy = tuple(int(c) for t, c in enumerate(path) if c and (not t or c != path[t - 1]))
            greedy_text = ''.join(chars[c] for c in greedy)
            expected_view = row['raw_view' if v == 0 else 'ink_view']
            assert normalize(greedy_text) == normalize(expected_view)
            beam = prefix_beam(p)
            candidates = [{'text': ''.join(chars[c] for c in target),
                           'pruned_log_probability': mass,
                           'exact_log_probability': log_probability(p, target)}
                          for target, mass in beam[:5]]
            views.append({'view': 'raw' if v == 0 else 'ink', 'frames': len(p),
                          'greedy': greedy_text, 'greedy_log_probability': log_probability(p, greedy),
                          'label_log_probability_diagnostic_only': log_probability(p, tuple(ids[c] for c in row['label'])),
                          'beam_candidates': candidates})
            (raw_predictions if v == 0 else ink_predictions).append(
                {**row, 'raw': candidates[0]['text'], 'prediction': normalize(candidates[0]['text'])})
        records.append({**row, 'views': views,
                        'view_length_disagreement': len(normalize(row['raw_view'])) != len(normalize(row['ink_view']))})
    assert not arrays, 'Unexpected inputs: only the recorded P03 validation views are permitted'
    write_json(args.output, {'state': 'diagnostic_only', 'prediction_sha256': sha(args.predictions),
               'probability_sha256': sha(args.probabilities), 'audit_sha256': sha(args.audit / 'audit.json'),
               'helper_sha256': sha(Path(__file__).with_name('ctc_beam.py')), 'runner_sha256': sha(__file__),
               'protocol': 'raw-symbol prefix beam width 8, top 8 symbols/frame; exact CTC score for returned paths',
               'baseline_metrics': data['metrics'], 'raw_beam_metrics': summarize(raw_predictions),
               'ink_beam_metrics': summarize(ink_predictions), 'records': records,
               'new_decoder_selected': False, 'labels_used_for_candidate_generation': False,
               'holdout_used': False, 'exported': False})
    print(json.dumps({'records': len(records), 'length_disagreements': sum(r['view_length_disagreement'] for r in records),
                      'raw_beam_metrics': summarize(raw_predictions), 'ink_beam_metrics': summarize(ink_predictions)}))


if __name__ == '__main__':
    main()

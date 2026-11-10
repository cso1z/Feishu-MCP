import test from 'node:test';
import assert from 'node:assert/strict';
import { planUpsert, requirePreview } from './upsert.js';

test('upsert preserves unspecified fields and matches returned rich-text keys', () => {
  const existing = [
    {
      id: 'rec1',
      fields: {
        Order: [{ type: 'text', text: '001' }],
        Count: 1,
        Keep: 'untouched',
      },
    },
    { id: 'rec2', fields: { Order: '2', Count: 0 } },
  ];
  const plan = planUpsert(
    existing,
    [
      { Order: '001', Count: 3 },
      { Order: 2, Count: 0 },
      { Order: '003', Count: 5 },
    ],
    'Order',
    'target',
  );
  assert.deepEqual(plan.updates, [
    { record_id: 'rec1', fields: { Count: 3 }, before: { Count: 1 } },
  ]);
  assert.equal(plan.unchanged, 1);
  assert.equal(plan.creates.length, 1);
  assert.doesNotThrow(() =>
    requirePreview(plan.previewToken, plan.previewToken),
  );
});
test('blank or duplicate keys stop planning instead of picking a record', () => {
  assert.throws(
    () => planUpsert([], [{ Key: '' }], 'Key', 'target'),
    /nonempty/,
  );
  assert.throws(
    () => planUpsert([], [{ Key: '001' }, { Key: '001' }], 'Key', 'target'),
    /Duplicate incoming/,
  );
  assert.throws(
    () =>
      planUpsert(
        [
          { id: 'a', fields: { Key: '1' } },
          { id: 'b', fields: { Key: '1' } },
        ],
        [{ Key: '1' }],
        'Key',
        'target',
      ),
    /Duplicate existing/,
  );
});
test('preview token binds to target, incoming changes and current data', () => {
  const rows = [{ id: 'a', fields: { Key: '1', Value: 1 } }];
  const incoming = [{ Key: '1', Value: 2 }];
  const token = planUpsert(rows, incoming, 'Key', 'a').previewToken;
  for (const plan of [
    planUpsert(rows, incoming, 'Key', 'b'),
    planUpsert(rows, [{ Key: '1', Value: 3 }], 'Key', 'a'),
    planUpsert(
      [{ id: 'a', fields: { Key: '1', Value: 4 } }],
      incoming,
      'Key',
      'a',
    ),
  ]) {
    assert.throws(
      () => requirePreview(plan.previewToken, token),
      /Preview again/,
    );
  }
  const reordered = planUpsert(
    [{ id: 'a', fields: { Value: 1, Key: '1' } }],
    [{ Value: 2, Key: '1' }],
    'Key',
    'a',
  );
  assert.equal(reordered.previewToken, token);
});

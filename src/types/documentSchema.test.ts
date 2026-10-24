import test from 'node:test';
import assert from 'node:assert/strict';
import { TableCreateSchema } from './documentSchema.js';

const validBase = { columnSize: 3, rowSize: 2 };

test('TableCreateSchema accepts valid columnWidth', () => {
  const result = TableCreateSchema.safeParse({
    ...validBase,
    columnWidth: [180, 250, 380],
  });
  assert.ok(result.success);
});

test('TableCreateSchema leaves columnWidth validation to the BlockFactory', () => {
  const result = TableCreateSchema.safeParse({ ...validBase, columnWidth: [100, 200] });
  assert.ok(result.success);
});

test('TableCreateSchema leaves positive-integer columnWidth validation to the BlockFactory', () => {
  assert.ok(TableCreateSchema.safeParse({ ...validBase, columnWidth: [-1, 0, 999] }).success);
  assert.ok(TableCreateSchema.safeParse({ ...validBase, columnWidth: [100.5, 200, 300] }).success);
});

test('TableCreateSchema rejects fractional columnSize or rowSize', () => {
  assert.ok(!TableCreateSchema.safeParse({ columnSize: 2.5, rowSize: 1 }).success);
  assert.ok(!TableCreateSchema.safeParse({ columnSize: 2, rowSize: 1.5 }).success);
});

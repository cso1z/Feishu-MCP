import test from 'node:test';
import assert from 'node:assert/strict';
import { BlockFactory } from './blockFactory.js';

test('createTableBlock omits column_width by default', () => {
  const factory = BlockFactory.getInstance();
  const result = factory.createTableBlock({ columnSize: 2, rowSize: 1 });
  const tableBlock = result.descendants[0];
  assert.equal(tableBlock.block_type, 31);
  assert.equal(tableBlock.table.property.column_width, undefined);
});

test('createTableBlock passes column_width through when provided', () => {
  const factory = BlockFactory.getInstance();
  const result = factory.createTableBlock({
    columnSize: 3,
    rowSize: 1,
    columnWidth: [180, 250, 380],
  });
  const tableBlock = result.descendants[0];
  assert.deepEqual(tableBlock.table.property.column_width, [180, 250, 380]);
});

test('createTableBlock ignores columnWidth whose length mismatches columnSize', () => {
  const factory = BlockFactory.getInstance();
  const result = factory.createTableBlock({
    columnSize: 3,
    rowSize: 1,
    columnWidth: [100, 200],
  });
  const tableBlock = result.descendants[0];
  assert.equal(tableBlock.table.property.column_width, undefined);
});

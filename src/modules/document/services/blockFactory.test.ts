import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AUTO_FIT_MIN_COLUMN_WIDTH,
  AUTO_FIT_TOTAL_WIDTH,
  BlockFactory,
} from './blockFactory.js';

function textBlock(content: string) {
  return { block_type: 2, text: { elements: [{ text_run: { content } }] } };
}

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

test('createTableBlock auto-fits column widths from cell content', () => {
  const factory = BlockFactory.getInstance();
  const cells = [
    { coordinate: { row: 0, column: 0 }, content: textBlock('模块') },
    { coordinate: { row: 0, column: 1 }, content: textBlock('batch_create_feishu_blocks') },
    { coordinate: { row: 0, column: 2 }, content: textBlock('批量创建文本、标题、列表、代码块') },
    { coordinate: { row: 1, column: 0 }, content: textBlock('CI') },
    { coordinate: { row: 1, column: 1 }, content: textBlock('CodeQL') },
    { coordinate: { row: 1, column: 2 }, content: textBlock('仓库仅有安全扫描 workflow') },
  ];
  const result = factory.createTableBlock({ columnSize: 3, rowSize: 2, cells });
  const tableBlock = result.descendants[0];
  const widths = tableBlock.table.property.column_width;
  assert.ok(Array.isArray(widths));
  assert.equal(widths.length, 3);
  // 三列宽度之和等于固定总宽
  assert.equal(widths.reduce((sum: number, w: number) => sum + w, 0), AUTO_FIT_TOTAL_WIDTH);
  // 中文按 2 计权，说明列应为最宽
  assert.equal(widths[2], Math.max(...widths));
  assert.ok(widths[0] >= AUTO_FIT_MIN_COLUMN_WIDTH);
});

test('createTableBlock keeps server default when cells have no content', () => {
  const factory = BlockFactory.getInstance();
  const result = factory.createTableBlock({
    columnSize: 3,
    rowSize: 1,
    cells: [
      { coordinate: { row: 0, column: 0 }, content: textBlock('') },
      { coordinate: { row: 0, column: 1 }, content: textBlock('') },
      { coordinate: { row: 0, column: 2 }, content: textBlock('') },
    ],
  });
  const tableBlock = result.descendants[0];
  assert.equal(tableBlock.table.property.column_width, undefined);
});

test('autoFitColumnWidth is deterministic', () => {
  const cells = [
    { coordinate: { row: 0, column: 0 }, content: textBlock('模块') },
    { coordinate: { row: 0, column: 1 }, content: textBlock('功能列') },
    { coordinate: { row: 0, column: 2 }, content: textBlock('很长的说明文字'.repeat(3)) },
  ];
  assert.deepEqual(
    BlockFactory.autoFitColumnWidth(cells, 3),
    BlockFactory.autoFitColumnWidth(cells, 3),
  );
});

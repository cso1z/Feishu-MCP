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

function codeBlock(code: string) {
  return {
    block_type: 14,
    code: { elements: [{ text_run: { content: code } }], style: { language: 30, wrap: true } },
  };
}

function equationBlock(content: string) {
  return { block_type: 2, text: { elements: [{ equation: { content } }] } };
}

function mermaidBlock(code: string) {
  return {
    block_type: 40,
    add_ons: {
      component_id: '',
      component_type_id: 'blk_631fefbbae02400430b8f9f4',
      record: JSON.stringify({ data: code }),
    },
  };
}

function singleRowCells(contents: unknown[]) {
  return contents.map((content, column) => ({ coordinate: { row: 0, column }, content }));
}

function assertValidWidths(widths: unknown, columnSize: number, expectedTotal: number) {
  assert.ok(Array.isArray(widths));
  assert.equal(widths.length, columnSize);
  for (const w of widths) {
    assert.ok(
      typeof w === 'number' && Number.isInteger(w) && w > 0,
      `width ${w} must be a positive integer`
    );
  }
  assert.equal(widths.reduce((sum: number, w: number) => sum + w, 0), expectedTotal);
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

test('createTableBlock rejects columnWidth whose length mismatches columnSize', () => {
  const factory = BlockFactory.getInstance();
  assert.throws(
    () => factory.createTableBlock({ columnSize: 3, rowSize: 1, columnWidth: [100, 200] }),
    /columnWidth 长度 \(2\) 必须等于 columnSize \(3\)/,
  );
});

test('createTableBlock rejects columnWidth with non-positive or non-integer values', () => {
  const factory = BlockFactory.getInstance();
  assert.throws(
    () => factory.createTableBlock({ columnSize: 3, rowSize: 1, columnWidth: [-1, 0, 999] }),
    /正整数/
  );
  assert.throws(
    () => factory.createTableBlock({ columnSize: 2, rowSize: 1, columnWidth: [100.5, 200] }),
    /正整数/
  );
});

test('createTableBlock rejects invalid table dimensions', () => {
  const factory = BlockFactory.getInstance();
  assert.throws(
    () => factory.createTableBlock({ columnSize: 2.5, rowSize: 1 }),
    /columnSize 必须为正整数/,
  );
  assert.throws(
    () => factory.createTableBlock({ columnSize: 2, rowSize: 0 }),
    /rowSize 必须为正整数/,
  );
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

test('autoFitColumnWidth keeps minimum widths for 10 equal columns', () => {
  // 10 列 × 90px 最小宽度 > 810px 默认总宽：总宽放大到 900，不再产生 0/负数列宽
  const cells = singleRowCells(Array.from({ length: 10 }, () => textBlock('列')));
  const widths = BlockFactory.autoFitColumnWidth(cells, 10);
  assertValidWidths(widths, 10, 10 * AUTO_FIT_MIN_COLUMN_WIDTH);
});

test('autoFitColumnWidth never yields non-positive width with uneven 8-column content', () => {
  const cells = [
    { coordinate: { row: 0, column: 0 }, content: textBlock('这是一段非常长的说明文字用来撑大列宽'.repeat(4)) },
    { coordinate: { row: 0, column: 1 }, content: textBlock('另一段不短的长文本内容'.repeat(4)) },
    ...[2, 3, 4, 5, 6, 7].map(column => ({
      coordinate: { row: 0, column },
      content: textBlock('短'),
    })),
  ];
  const widths = BlockFactory.autoFitColumnWidth(cells, 8);
  assert.ok(widths);
  assertValidWidths(widths, 8, AUTO_FIT_TOTAL_WIDTH);
  // 两个长文本列应分得最大的两份宽度
  const sorted = [...widths].sort((a, b) => b - a);
  assert.equal(sorted[0], widths[0]);
  assert.equal(sorted[1], widths[1]);
});

test('autoFitColumnWidth counts code block content', () => {
  const cells = singleRowCells([
    textBlock('ID'),
    codeBlock('console.log("hello world from a fairly long line of code")'),
  ]);
  const widths = BlockFactory.autoFitColumnWidth(cells, 2);
  assert.ok(widths);
  assertValidWidths(widths, 2, AUTO_FIT_TOTAL_WIDTH);
  assert.ok(widths[1] > widths[0]);
});

test('autoFitColumnWidth does not fall back when only code cells have content', () => {
  const cells = [{ coordinate: { row: 0, column: 0 }, content: codeBlock('const x = 1;') }];
  assert.ok(BlockFactory.autoFitColumnWidth(cells, 1));
});

test('autoFitColumnWidth counts equation and mermaid content', () => {
  const equationCells = singleRowCells([
    equationBlock('E = mc^2 plus some extra formula text'),
    textBlock('备注'),
  ]);
  const equationWidths = BlockFactory.autoFitColumnWidth(equationCells, 2);
  assert.ok(equationWidths);
  assert.ok(equationWidths[0] > equationWidths[1]);

  const mermaidCells = singleRowCells([
    textBlock('图'),
    mermaidBlock('graph TD; A-->B; B-->C; C-->D; D-->E;'),
  ]);
  const mermaidWidths = BlockFactory.autoFitColumnWidth(mermaidCells, 2);
  assert.ok(mermaidWidths);
  assert.ok(mermaidWidths[1] > mermaidWidths[0]);
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

test('autoFitColumnWidth returns undefined for fractional columnSize', () => {
  const cells = singleRowCells([textBlock('a'), textBlock('b'), textBlock('c')]);
  assert.equal(BlockFactory.autoFitColumnWidth(cells, 2.5), undefined);
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

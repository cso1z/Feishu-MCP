import { z } from 'zod';
import { tableTool } from '../tableTools.js';
import { SpreadsheetSchema, RangeSchema, ValueRangeSchema } from './schemas.js';

export const DimensionSchema = z
  .object({
    sheetId: z.string().regex(/^[A-Za-z0-9_-]+$/),
    majorDimension: z.enum(['ROWS', 'COLUMNS']),
    startIndex: z.number().int().min(0),
    endIndex: z.number().int().min(1),
  })
  .refine(
    (v) => v.endIndex > v.startIndex,
    'endIndex is exclusive and must exceed startIndex.',
  );
const spreadsheet = { spreadsheet: SpreadsheetSchema };
const sheet = { ...spreadsheet, sheetId: z.string().regex(/^[A-Za-z0-9_-]+$/) };
const condition = z.object({
  filter_type: z.string().min(1),
  compare_type: z.string().optional(),
  expected: z.array(z.string()).optional(),
});
export const sheetsManagementTools = [
  tableTool(
    'update_feishu_sheet',
    'Rename, reorder, hide, or freeze a worksheet. Counts of zero unfreeze. Inspect the sheet before changing layout.',
    {
      ...sheet,
      properties: z
        .object({
          title: z.string().min(1).optional(),
          index: z.number().int().min(0).optional(),
          hidden: z.boolean().optional(),
          frozenRowCount: z.number().int().min(0).optional(),
          frozenColCount: z.number().int().min(0).optional(),
        })
        .refine((v) => Object.keys(v).length > 0, 'Supply a property change.'),
    },
    false,
    (p, a) => a.updateSheet(p.spreadsheet, p.sheetId, p.properties),
  ),
  tableTool(
    'edit_feishu_sheet_dimensions',
    'Insert/delete rows or columns, or resize them in pixels. Indices are zero-based, endIndex exclusive. Read affected data/formulas before structural edits; deletion needs an explicit request.',
    {
      ...spreadsheet,
      dimension: DimensionSchema,
      operation: z.discriminatedUnion('action', [
        z.object({
          action: z.literal('insert'),
          inheritStyle: z.enum(['BEFORE', 'AFTER']).default('AFTER'),
        }),
        z.object({ action: z.literal('delete') }),
        z.object({
          action: z.literal('resize'),
          pixelSize: z.number().int().min(1).max(1000),
        }),
      ]),
    },
    false,
    (p, a) => a.editSheetDimensions(p.spreadsheet, p.dimension, p.operation),
  ),
  tableTool(
    'merge_feishu_sheet_cells',
    'Merge/unmerge a bounded range. Read cells first: merging discards non-anchor values. Only merge with explicit user intent.',
    {
      ...spreadsheet,
      range: RangeSchema,
      mergeType: z
        .enum(['MERGE_ALL', 'MERGE_ROWS', 'MERGE_COLUMNS', 'UNMERGE'])
        .default('MERGE_ALL'),
    },
    false,
    (p, a) => a.mergeSheetCells(p.spreadsheet, p.range, p.mergeType),
  ),
  tableTool(
    'style_feishu_sheet_cells',
    'Apply styles to explicit ranges. Alignment: hAlign=0 left/1 center/2 right, vAlign=0 top/1 middle/2 bottom. Font size is a number from 9 to 36.',
    {
      ...spreadsheet,
      ranges: z.array(RangeSchema).min(1).max(100),
      style: z
        .object({
          font: z
            .object({
              bold: z.boolean().optional(),
              italic: z.boolean().optional(),
              fontSize: z.number().min(9).max(36).optional(),
            })
            .optional(),
          foreColor: z
            .string()
            .regex(/^#[0-9a-fA-F]{6}$/)
            .optional(),
          backColor: z
            .string()
            .regex(/^#[0-9a-fA-F]{6}$/)
            .optional(),
          hAlign: z.number().int().min(0).max(2).optional(),
          vAlign: z.number().int().min(0).max(2).optional(),
          formatter: z.string().optional(),
          textDecoration: z.number().int().min(0).max(3).optional(),
        })
        .refine((v) => Object.keys(v).length > 0, 'Supply a style.'),
    },
    false,
    (p, a) => a.styleSheetCells(p.spreadsheet, p.ranges, p.style),
  ),
  tableTool(
    'get_feishu_sheet_filter',
    'Inspect a worksheet filter and its conditions.',
    sheet,
    true,
    (p, a) => a.getSheetFilter(p.spreadsheet, p.sheetId),
  ),
  tableTool(
    'set_feishu_sheet_filter',
    'Create, update, or remove a worksheet filter. col uses a column letter. Follow Feishu filter_type/compare_type values.',
    {
      ...sheet,
      operation: z.discriminatedUnion('action', [
        z.object({
          action: z.literal('create'),
          range: RangeSchema,
          col: z.string().regex(/^[A-Z]+$/),
          condition,
        }),
        z.object({
          action: z.literal('update'),
          col: z.string().regex(/^[A-Z]+$/),
          condition,
        }),
        z.object({ action: z.literal('delete') }),
      ]),
    },
    false,
    (p, a) => a.setSheetFilter(p.spreadsheet, p.sheetId, p.operation),
  ),
  tableTool(
    'upsert_feishu_sheet_rows',
    'Match rows by a unique header within a bounded range whose first row is the header. Preview by default, then repeat with apply=true and previewToken. Appends use empty rows inside that range. Other columns remain untouched. No transaction: coordinate concurrent edits.',
    {
      ...spreadsheet,
      range: RangeSchema,
      keyField: z.string().min(1),
      records: z
        .array(z.record(ValueRangeSchema.shape.values.element.element))
        .min(1)
        .max(5000),
      apply: z.boolean().default(false),
      previewToken: z.string().optional(),
    },
    false,
    (p, a) =>
      a.upsertSheetRows(
        p.spreadsheet,
        p.range,
        p.keyField,
        p.records,
        p.apply,
        p.previewToken,
      ),
  ),
];

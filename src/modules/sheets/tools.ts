import { z } from 'zod';
import { tableTool } from '../tableTools.js';
import { sheetsManagementTools } from './managementTools.js';
import { RangeSchema, SpreadsheetSchema, ValueRangeSchema } from './schemas.js';

export const sheetsTools = [
  ...sheetsManagementTools,
  tableTool(
    'create_feishu_spreadsheet',
    'Create an independent Feishu spreadsheet, optionally in a Drive folder.',
    {
      title: z.string().trim().min(1),
      folderToken: z.string().min(1).optional(),
    },
    false,
    (p, api) => api.createSpreadsheet(p.title, p.folderToken),
  ),

  tableTool(
    'list_feishu_sheets',
    'List worksheets and their sheet_id, title, and dimensions. Use sheet_id in A1 ranges.',
    {
      spreadsheet: SpreadsheetSchema,
    },
    true,
    (p, api) => api.listSheets(p.spreadsheet),
  ),

  tableTool(
    'read_feishu_sheet_cells',
    'Read a bounded A1 range. Select Formula to inspect formulas or UnformattedValue for raw values. Split large reads into ranges.',
    {
      spreadsheet: SpreadsheetSchema,
      range: RangeSchema,
      valueRenderOption: z
        .enum(['ToString', 'FormattedValue', 'Formula', 'UnformattedValue'])
        .default('ToString'),
      dateTimeRenderOption: z
        .enum(['FormattedString', 'SerialNumber'])
        .default('FormattedString'),
    },
    true,
    (p, api) =>
      api.readSheetCells(
        p.spreadsheet,
        p.range,
        p.valueRenderOption,
        p.dateTimeRenderOption,
      ),
  ),

  tableTool(
    'write_feishu_sheet_cells',
    'Write one or more explicit A1 ranges. Existing cells in those ranges are overwritten. Read the target range before editing. Values are row arrays; formula cells use {"type":"formula","text":"=SUM(A1:A3)"}.',
    {
      spreadsheet: SpreadsheetSchema,
      valueRanges: z.array(ValueRangeSchema).min(1).max(100),
    },
    false,
    (p, api) => api.writeSheetCells(p.spreadsheet, p.valueRanges),
  ),

  tableTool(
    'append_feishu_sheet_rows',
    'Append rows after the existing data in the specified worksheet range. This creates new rows of data; repeat only if the previous request is known to have failed.',
    {
      spreadsheet: SpreadsheetSchema,
      valueRange: ValueRangeSchema,
    },
    false,
    (p, api) => api.appendSheetRows(p.spreadsheet, p.valueRange),
  ),

  tableTool(
    'add_feishu_sheet',
    'Add a worksheet to an existing spreadsheet and return its sheet_id.',
    {
      spreadsheet: SpreadsheetSchema,
      title: z.string().trim().min(1),
    },
    false,
    (p, api) => api.addSheet(p.spreadsheet, p.title),
  ),
];

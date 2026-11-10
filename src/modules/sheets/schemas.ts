import { z } from 'zod';

export const SpreadsheetSchema = z
  .string()
  .trim()
  .min(1)
  .describe('Spreadsheet token, /sheets/ URL, or Wiki URL containing a spreadsheet.');
export const RangeSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]+![A-Z]+[1-9]\d*(?::[A-Z]+[1-9]\d*)?$/)
  .describe('A1 range including sheet_id, for example abc123!A1:C20.');
export const ValueRangeSchema = z.object({
  range: RangeSchema,
  values: z
    .array(
      z.array(
        z.union([
          z.string(),
          z.number(),
          z.null(),
          z.object({ type: z.literal('formula'), text: z.string().startsWith('=') }),
        ]),
      ),
    )
    .min(1)
    .max(5000)
    .describe(
      'Rows of cell values. Formula cells use {"type":"formula","text":"=SUM(A1:A3)"}. Use an empty string to clear a cell.',
    ),
});

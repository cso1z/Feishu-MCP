import { z } from 'zod';

export const BaseSchema = z
  .string()
  .trim()
  .min(1)
  .describe('Base app_token, /base/ URL, or Wiki URL containing a Base.');
export const TableIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]+$/)
  .describe('Data table table_id returned by list_feishu_bitable_tables.');
export const FieldsSchema = z
  .record(z.unknown())
  .refine((fields) => Object.keys(fields).length > 0, 'Provide at least one field.')
  .describe(
    'Map field names to Feishu field values. Read the field schema first. Dates are millisecond timestamps; users and links use Feishu object arrays.',
  );
export const PaginationShape = {
  pageSize: z.number().int().min(1).max(100).default(100),
  pageToken: z
    .string()
    .min(1)
    .optional()
    .describe('Use the returned page_token while has_more is true.'),
};
export const SearchFilterSchema = z.object({
  conjunction: z.enum(['and', 'or']),
  conditions: z
    .array(
      z.object({
        field_name: z.string().min(1),
        operator: z.enum([
          'is',
          'isNot',
          'contains',
          'doesNotContain',
          'isEmpty',
          'isNotEmpty',
          'isGreater',
          'isGreaterEqual',
          'isLess',
          'isLessEqual',
          'like',
          'in',
        ]),
        value: z.array(z.string()).optional(),
      }),
    )
    .min(1)
    .max(50),
});
export const SearchShape = {
  viewId: z.string().min(1).optional(),
  fieldNames: z.array(z.string().min(1)).optional(),
  filter: SearchFilterSchema.optional(),
  sort: z
    .array(z.object({ field_name: z.string().min(1), desc: z.boolean().default(false) }))
    .optional(),
  automaticFields: z.boolean().default(false),
  ...PaginationShape,
};
export const NewFieldSchema = z.object({
  field_name: z.string().min(1),
  type: z
    .number()
    .int()
    .positive()
    .describe('Feishu field type, e.g. 1=text, 2=number, 3=single select, 5=date.'),
  property: z.record(z.unknown()).optional(),
});

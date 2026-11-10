import { z } from 'zod';
import { tableTool } from '../tableTools.js';
import {
  BaseSchema,
  TableIdSchema,
  NewFieldSchema,
  FieldsSchema,
  PaginationShape,
} from './schemas.js';

const table = { base: BaseSchema, tableId: TableIdSchema };
const view = { ...table, viewId: z.string().regex(/^vew[A-Za-z0-9]+$/) };
const field = { ...table, fieldId: z.string().regex(/^fld[A-Za-z0-9]+$/) };
export const bitableManagementTools = [
  tableTool(
    'create_feishu_bitable_field',
    'Add a field. Types include text=1, number=2, single-select=3, multi-select=4, date=5. Select options go in property.options.',
    { ...table, field: NewFieldSchema },
    false,
    (p, a) => a.createBitableField(p.base, p.tableId, p.field),
  ),
  tableTool(
    'update_feishu_bitable_field',
    'Replace field definition. Read the current definition first and preserve select option IDs. Type changes can transform existing data.',
    { ...field, field: NewFieldSchema },
    false,
    (p, a) => a.updateBitableField(p.base, p.tableId, p.fieldId, p.field),
  ),
  tableTool(
    'delete_feishu_bitable_field',
    'Delete the specified field and its cell data, only on explicit request.',
    field,
    false,
    (p, a) => a.deleteBitableField(p.base, p.tableId, p.fieldId),
  ),
  tableTool(
    'list_feishu_bitable_views',
    'List views; follow page_token while has_more is true.',
    { ...table, ...PaginationShape },
    true,
    (p, a) => a.listBitableViews(p.base, p.tableId, p.pageSize, p.pageToken),
  ),
  tableTool(
    'get_feishu_bitable_view',
    'Read a view including filters and hidden fields before editing.',
    view,
    true,
    (p, a) => a.getBitableView(p.base, p.tableId, p.viewId),
  ),
  tableTool(
    'create_feishu_bitable_view',
    'Create a grid, kanban, gallery, gantt, or form view.',
    {
      ...table,
      name: z.string().min(1),
      type: z
        .enum(['grid', 'kanban', 'gallery', 'gantt', 'form'])
        .default('grid'),
    },
    false,
    (p, a) => a.createBitableView(p.base, p.tableId, p.name, p.type),
  ),
  tableTool(
    'update_feishu_bitable_view',
    'Update view name, filters, hidden fields, or hierarchy. View filters use field IDs and JSON-encoded string values, unlike record search filters.',
    {
      ...view,
      view: z
        .object({
          view_name: z.string().min(1).optional(),
          property: z
            .object({
              filter_info: z
                .object({
                  conjunction: z.enum(['and', 'or']),
                  conditions: z.array(
                    z.object({
                      field_id: z.string().min(1),
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
                      ]),
                      value: z.string().optional(),
                    }),
                  ),
                })
                .optional(),
              hidden_fields: z.array(z.string().min(1)).optional(),
              hierarchy_config: z
                .object({ field_id: z.string().optional() })
                .optional(),
            })
            .optional(),
        })
        .refine((v) => Object.keys(v).length > 0, 'Supply a view change.'),
    },
    false,
    (p, a) => a.updateBitableView(p.base, p.tableId, p.viewId, p.view),
  ),
  tableTool(
    'delete_feishu_bitable_view',
    'Delete the selected view, only on explicit request. Records are retained.',
    view,
    false,
    (p, a) => a.deleteBitableView(p.base, p.tableId, p.viewId),
  ),
  tableTool(
    'upsert_feishu_bitable_records',
    'Match nonempty text/number keys; preview creates and changed fields by default. After review, repeat the same input with apply=true and the returned previewToken. Duplicate keys or changed target data stop the write. This is not a transaction; concurrent edits require coordination.',
    {
      ...table,
      keyField: z.string().min(1),
      records: z.array(FieldsSchema).min(1).max(5000),
      apply: z.boolean().default(false),
      previewToken: z.string().optional(),
    },
    false,
    (p, a) =>
      a.upsertBitableRecords(
        p.base,
        p.tableId,
        p.keyField,
        p.records,
        p.apply,
        p.previewToken,
      ),
  ),
];

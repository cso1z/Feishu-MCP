import { z } from 'zod';
import { tableTool } from '../tableTools.js';
import { bitableManagementTools } from './managementTools.js';
import {
  BaseSchema,
  FieldsSchema,
  NewFieldSchema,
  PaginationShape,
  SearchShape,
  TableIdSchema,
} from './schemas.js';

const tableShape = { base: BaseSchema, tableId: TableIdSchema };

export const bitableTools = [
  ...bitableManagementTools,
  tableTool(
    'create_feishu_bitable',
    'Create a new Feishu Base, optionally in a Drive folder.',
    {
      name: z.string().trim().min(1),
      folderToken: z.string().min(1).optional(),
    },
    false,
    (p, api) => api.createBitable(p.name, p.folderToken),
  ),

  tableTool(
    'list_feishu_bitable_tables',
    'List data tables in a Base. Follow page_token while has_more is true.',
    {
      base: BaseSchema,
      ...PaginationShape,
    },
    true,
    (p, api) => api.listBitableTables(p.base, p.pageSize, p.pageToken),
  ),

  tableTool(
    'create_feishu_bitable_table',
    'Create a data table in a Base, optionally defining its fields. The first field is the primary field and must use a supported primary-field type.',
    {
      base: BaseSchema,
      name: z.string().trim().min(1),
      fields: z.array(NewFieldSchema).min(1).optional(),
    },
    false,
    (p, api) => api.createBitableTable(p.base, p.name, p.fields),
  ),

  tableTool(
    'list_feishu_bitable_fields',
    'Inspect field names, types, options, and properties before reading or writing records. Formula and lookup fields are computed. Follow page_token while has_more is true.',
    {
      ...tableShape,
      ...PaginationShape,
    },
    true,
    (p, api) =>
      api.listBitableFields(p.base, p.tableId, p.pageSize, p.pageToken),
  ),

  tableTool(
    'search_feishu_bitable_records',
    'Query a page of Base records with optional filter, sort, view, and selected fields. Returns record_id and fields. Follow page_token while has_more is true.',
    {
      ...tableShape,
      ...SearchShape,
    },
    true,
    ({ base, tableId, ...options }, api) =>
      api.searchBitableRecords(base, tableId, options),
  ),

  tableTool(
    'create_feishu_bitable_records',
    'Create up to 500 records in one request. Field keys are field names. Read the field schema first. Repeating a successful request creates additional records.',
    {
      ...tableShape,
      records: z
        .array(z.object({ fields: FieldsSchema }))
        .min(1)
        .max(500),
    },
    false,
    (p, api) => api.createBitableRecords(p.base, p.tableId, p.records),
  ),

  tableTool(
    'update_feishu_bitable_records',
    'Update up to 500 records by record_id. Only supplied fields are updated. Query records and inspect field types first.',
    {
      ...tableShape,
      records: z
        .array(z.object({ record_id: z.string().min(1), fields: FieldsSchema }))
        .min(1)
        .max(500),
    },
    false,
    (p, api) => api.updateBitableRecords(p.base, p.tableId, p.records),
  ),

  tableTool(
    'delete_feishu_bitable_records',
    'Delete the explicitly selected records from a data table. Requires an explicit user request to delete these records. Query and verify their record_id values first.',
    {
      ...tableShape,
      recordIds: z.array(z.string().min(1)).min(1).max(500),
    },
    false,
    (p, api) => api.deleteBitableRecords(p.base, p.tableId, p.recordIds),
  ),
];

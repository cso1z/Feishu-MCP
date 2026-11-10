import { z } from 'zod';
import { tableTool } from '../tableTools.js';
const kind = z.enum(['sheet', 'bitable']);
export const transferTools = [
  tableTool(
    'import_feishu_table_file',
    'Import a local CSV/XLSX/XLS file inside FEISHU_FILE_ROOT as a NEW spreadsheet or Base. Uses native conversion. Returns an asynchronous ticket; query status until job_status=0. Do not repeat an import while it is running.',
    {
      localPath: z.string().min(1),
      type: kind,
      folderToken: z.string().default(''),
      title: z.string().min(1).optional(),
    },
    false,
    (p, a) => a.importTableFile(p.localPath, p.type, p.folderToken, p.title),
  ),
  tableTool(
    'export_feishu_table_file',
    'Start a native CSV/XLSX export. subId is the worksheet ID for CSV or the data table ID for Base. Query status, then download using the returned ticket and token.',
    {
      table: z.string().min(1),
      type: kind,
      format: z.enum(['csv', 'xlsx']),
      subId: z.string().min(1).optional(),
    },
    false,
    (p, a) => a.exportTableFile(p.table, p.type, p.format, p.subId),
  ),
  tableTool(
    'get_feishu_table_transfer_status',
    'Read an import/export job. job_status=0 means success, 1/2 waiting/running, others failure. Imports return the new token and URL. Exports require the source token.',
    {
      direction: z.enum(['import', 'export']),
      ticket: z.string().min(1),
      token: z.string().min(1).optional(),
    },
    true,
    (p, a) => a.getTableTransferStatus(p.direction, p.ticket, p.token),
  ),
  tableTool(
    'download_feishu_table_export',
    'Save a completed export inside FEISHU_FILE_ROOT. fileName has no directories and must match the export extension. Preserve existing files unless overwrite=true is explicitly requested.',
    {
      ticket: z.string().min(1),
      token: z.string().min(1),
      fileName: z.string().min(1),
      overwrite: z.boolean().default(false),
    },
    false,
    (p, a) => a.downloadTableExport(p.ticket, p.token, p.fileName, p.overwrite),
  ),
];

import {
  mkdir,
  readFile,
  realpath,
  stat,
  writeFile,
  lstat,
} from 'node:fs/promises';
import path from 'node:path';
import FormData from 'form-data';
import { FeishuBaseApiService } from '../../services/feishu/FeishuBaseApiService.js';
import { resolveTableToken } from '../../utils/tableReference.js';

export async function fileRoot(): Promise<string> {
  const root = path.resolve(process.env.FEISHU_FILE_ROOT || 'feishu-files');
  await mkdir(root, { recursive: true, mode: 0o700 });
  return realpath(root);
}
export async function importPath(localPath: string): Promise<string> {
  const root = await fileRoot();
  const resolved = await realpath(path.resolve(root, localPath));
  const relative = path.relative(root, resolved);
  if (
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  )
    throw new Error('File must be inside FEISHU_FILE_ROOT.');
  return resolved;
}
export class FeishuTransferService extends FeishuBaseApiService {
  async importTable(
    localPath: string,
    type: 'sheet' | 'bitable',
    folderToken: string,
    title?: string,
  ): Promise<unknown> {
    const source = await importPath(localPath);
    const extension = path.extname(source).slice(1).toLowerCase();
    if (!['csv', 'xlsx', 'xls'].includes(extension))
      throw new Error('Import supports .csv, .xlsx, or .xls.');
    const info = await stat(source);
    if (!info.isFile() || info.size > 20 * 1024 * 1024)
      throw new Error('Import requires a file no larger than 20 MB.');
    const buffer = await readFile(source);
    const upload = await this.post<{ file_token: string }>(
      '/drive/v1/medias/upload_all',
      () => {
        const form = new FormData();
        form.append('file', buffer, {
          filename: path.basename(source),
          knownLength: buffer.length,
        });
        form.append('file_name', path.basename(source));
        form.append('parent_type', 'ccm_import_open');
        form.append('parent_node', folderToken || '/');
        form.append('size', String(buffer.length));
        form.append(
          'extra',
          JSON.stringify({ obj_type: type, file_extension: extension }),
        );
        return form;
      },
    );
    const task = await this.post<{ ticket: string }>('/drive/v1/import_tasks', {
      file_extension: extension,
      file_token: upload.file_token,
      type,
      file_name: title || path.basename(source, path.extname(source)),
      point: { mount_type: 1, mount_key: folderToken },
    });
    return { ...task, type, next: 'get_feishu_table_transfer_status' };
  }
  async exportTable(
    table: string,
    type: 'sheet' | 'bitable',
    format: 'csv' | 'xlsx',
    subId?: string,
  ): Promise<unknown> {
    if ((type === 'bitable' || format === 'csv') && !subId)
      throw new Error(
        'subId is required for a Base data table or CSV worksheet export.',
      );
    const token = await resolveTableToken(table, type, (token) =>
      this.get('/wiki/v2/spaces/get_node', { token }),
    );
    const task = await this.post<{ ticket: string }>('/drive/v1/export_tasks', {
      token,
      type,
      file_extension: format,
      sub_id: subId,
    });
    return {
      ...task,
      token,
      type,
      format,
      next: 'get_feishu_table_transfer_status',
    };
  }
  async transferStatus(
    direction: 'import' | 'export',
    ticket: string,
    token?: string,
  ): Promise<{
    result: {
      job_status?: number;
      job_error_msg?: string;
      file_token?: string;
      file_extension?: string;
    };
  }> {
    if (direction === 'export' && !token)
      throw new Error(
        'Export status requires the source token returned by export_feishu_table_file.',
      );
    return this.get(
      `/drive/v1/${direction}_tasks/${encodeURIComponent(ticket)}`,
      direction === 'export' ? { token } : undefined,
    );
  }
  async downloadExport(
    ticket: string,
    token: string,
    fileName: string,
    overwrite: boolean,
  ): Promise<unknown> {
    if (
      fileName !== path.basename(fileName) ||
      /[\\/:]/.test(fileName) ||
      fileName === '.' ||
      fileName === '..'
    )
      throw new Error('fileName must be a filename without directories.');
    const result = (await this.transferStatus('export', ticket, token)).result;
    if (result.job_status !== 0 || !result.file_token)
      throw new Error(
        `Export is not ready: ${result.job_status}, ${result.job_error_msg || 'check transfer status'}`,
      );
    if (path.extname(fileName).toLowerCase() !== `.${result.file_extension}`)
      throw new Error(`fileName must end in .${result.file_extension}`);
    const destination = path.join(await fileRoot(), fileName);
    if (overwrite) {
      try {
        if ((await lstat(destination)).isSymbolicLink())
          throw new Error('Cannot overwrite a symlink.');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
    const buffer = Buffer.from(
      await this.request<ArrayBuffer>(
        `/drive/v1/export_tasks/file/${encodeURIComponent(result.file_token)}/download`,
        'GET',
        undefined,
        true,
        {},
        'arraybuffer',
      ),
    );
    await writeFile(destination, buffer, {
      flag: overwrite ? 'w' : 'wx',
      mode: 0o600,
    });
    return {
      localPath: destination,
      bytes: buffer.length,
      format: result.file_extension,
    };
  }
}

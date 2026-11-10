import { FeishuBaseApiService } from '../../services/feishu/FeishuBaseApiService.js';
import { resolveTableToken } from '../../utils/tableReference.js';
import type { z } from 'zod';
import type { NewFieldSchema, SearchShape } from './schemas.js';
import {
  planUpsert,
  requirePreview,
  type ExistingRecord,
} from '../../utils/upsert.js';
import { formatErrorMessage } from '../../utils/error.js';

type SearchOptions = z.output<z.ZodObject<typeof SearchShape>>;
type RecordFields = Record<string, unknown>;

export class FeishuBitableService extends FeishuBaseApiService {
  async createField(
    base: string,
    tableId: string,
    field: z.infer<typeof NewFieldSchema>,
  ): Promise<unknown> {
    return this.post(`${await this.path(base, tableId)}/fields`, field);
  }

  async updateField(
    base: string,
    tableId: string,
    fieldId: string,
    field: z.infer<typeof NewFieldSchema>,
  ): Promise<unknown> {
    return this.put(
      `${await this.path(base, tableId)}/fields/${encodeURIComponent(fieldId)}`,
      field,
    );
  }

  async deleteField(
    base: string,
    tableId: string,
    fieldId: string,
  ): Promise<unknown> {
    return this.delete(
      `${await this.path(base, tableId)}/fields/${encodeURIComponent(fieldId)}`,
    );
  }

  async listViews(
    base: string,
    tableId: string,
    pageSize: number,
    pageToken?: string,
  ): Promise<unknown> {
    return this.get(`${await this.path(base, tableId)}/views`, {
      page_size: pageSize,
      page_token: pageToken,
    });
  }

  async getView(
    base: string,
    tableId: string,
    viewId: string,
  ): Promise<unknown> {
    return this.get(
      `${await this.path(base, tableId)}/views/${encodeURIComponent(viewId)}`,
    );
  }

  async createView(
    base: string,
    tableId: string,
    viewName: string,
    viewType: string,
  ): Promise<unknown> {
    return this.post(`${await this.path(base, tableId)}/views`, {
      view_name: viewName,
      view_type: viewType,
    });
  }

  async updateView(
    base: string,
    tableId: string,
    viewId: string,
    view: Record<string, unknown>,
  ): Promise<unknown> {
    return this.patch(
      `${await this.path(base, tableId)}/views/${encodeURIComponent(viewId)}`,
      view,
    );
  }

  async deleteView(
    base: string,
    tableId: string,
    viewId: string,
  ): Promise<unknown> {
    return this.delete(
      `${await this.path(base, tableId)}/views/${encodeURIComponent(viewId)}`,
    );
  }

  async upsertRecords(
    base: string,
    tableId: string,
    keyField: string,
    records: RecordFields[],
    apply: boolean,
    previewToken?: string,
  ): Promise<unknown> {
    const existing: ExistingRecord[] = [];
    let pageToken: string | undefined;
    do {
      const page = (await this.searchRecords(base, tableId, {
        pageSize: 100,
        pageToken,
        automaticFields: false,
      })) as {
        items: { record_id: string; fields: RecordFields }[];
        has_more: boolean;
        page_token?: string;
      };
      existing.push(
        ...page.items.map((record) => ({
          id: record.record_id,
          fields: record.fields,
        })),
      );
      if (page.has_more && (!page.page_token || page.page_token === pageToken))
        throw new Error(
          'Incomplete record pagination; no changes were written.',
        );
      pageToken = page.has_more ? page.page_token : undefined;
    } while (pageToken);
    const plan = planUpsert(existing, records, keyField, { base, tableId });
    if (!apply) return { applied: false, ...plan };
    requirePreview(plan.previewToken, previewToken);
    // Each completed batch is reported if a later API call fails; do not retry creates blindly.
    const completed = { created: 0, updated: 0 };
    try {
      for (let i = 0; i < plan.updates.length; i += 500) {
        const batch = plan.updates
          .slice(i, i + 500)
          .map(({ record_id, fields }) => ({ record_id, fields }));
        await this.updateRecords(base, tableId, batch);
        completed.updated += batch.length;
      }
      for (let i = 0; i < plan.creates.length; i += 500) {
        const batch = plan.creates.slice(i, i + 500);
        await this.createRecords(base, tableId, batch);
        completed.created += batch.length;
      }
    } catch (error) {
      throw new Error(
        `Upsert stopped after ${JSON.stringify(completed)}. Read the table and preview again before retrying. ${formatErrorMessage(error)}`,
      );
    }
    return { applied: true, ...completed, unchanged: plan.unchanged };
  }
  private async path(base: string, tableId?: string): Promise<string> {
    const token = await resolveTableToken(base, 'bitable', (token) =>
      this.get('/wiki/v2/spaces/get_node', { token }),
    );
    const root = `/bitable/v1/apps/${token}/tables`;
    return tableId ? `${root}/${encodeURIComponent(tableId)}` : root;
  }

  createBase(name: string, folderToken?: string): Promise<unknown> {
    return this.post('/bitable/v1/apps', { name, folder_token: folderToken });
  }

  async listTables(
    base: string,
    pageSize: number,
    pageToken?: string,
  ): Promise<unknown> {
    return this.get(await this.path(base), {
      page_size: pageSize,
      page_token: pageToken,
    });
  }

  async createTable(
    base: string,
    name: string,
    fields?: z.infer<typeof NewFieldSchema>[],
  ): Promise<unknown> {
    return this.post(await this.path(base), { table: { name, fields } });
  }

  async listFields(
    base: string,
    tableId: string,
    pageSize: number,
    pageToken?: string,
  ): Promise<unknown> {
    return this.get(`${await this.path(base, tableId)}/fields`, {
      page_size: pageSize,
      page_token: pageToken,
    });
  }

  async searchRecords(
    base: string,
    tableId: string,
    options: SearchOptions,
  ): Promise<unknown> {
    const {
      pageSize,
      pageToken,
      viewId,
      fieldNames,
      filter,
      sort,
      automaticFields,
    } = options;
    const query = new URLSearchParams({
      page_size: String(pageSize),
      user_id_type: 'open_id',
    });
    if (pageToken) query.set('page_token', pageToken);
    return this.post(
      `${await this.path(base, tableId)}/records/search?${query}`,
      {
        view_id: viewId,
        field_names: fieldNames,
        filter,
        sort,
        automatic_fields: automaticFields,
      },
    );
  }

  async createRecords(
    base: string,
    tableId: string,
    records: { fields: RecordFields }[],
  ): Promise<unknown> {
    return this.post(
      `${await this.path(base, tableId)}/records/batch_create?user_id_type=open_id`,
      { records },
    );
  }

  async updateRecords(
    base: string,
    tableId: string,
    records: { record_id: string; fields: RecordFields }[],
  ): Promise<unknown> {
    return this.post(
      `${await this.path(base, tableId)}/records/batch_update?user_id_type=open_id`,
      { records },
    );
  }

  async deleteRecords(
    base: string,
    tableId: string,
    records: string[],
  ): Promise<unknown> {
    return this.post(`${await this.path(base, tableId)}/records/batch_delete`, {
      records,
    });
  }
}

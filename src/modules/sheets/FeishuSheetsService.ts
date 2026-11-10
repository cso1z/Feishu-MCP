import { FeishuBaseApiService } from '../../services/feishu/FeishuBaseApiService.js';
import { resolveTableToken } from '../../utils/tableReference.js';
import type { z } from 'zod';
import type { ValueRangeSchema } from './schemas.js';
import type { DimensionSchema } from './managementTools.js';
import { planUpsert, requirePreview, type Fields } from '../../utils/upsert.js';
import { formatErrorMessage } from '../../utils/error.js';

export class FeishuSheetsService extends FeishuBaseApiService {
  async updateSheet(
    spreadsheet: string,
    sheetId: string,
    properties: Record<string, unknown>,
  ): Promise<unknown> {
    const token = await this.token(spreadsheet);
    return this.post(`/sheets/v2/spreadsheets/${token}/sheets_batch_update`, {
      requests: [{ updateSheet: { properties: { sheetId, ...properties } } }],
    });
  }

  async editDimensions(
    spreadsheet: string,
    dimension: z.infer<typeof DimensionSchema>,
    operation: { action: string; inheritStyle?: string; pixelSize?: number },
  ): Promise<unknown> {
    const token = await this.token(spreadsheet);
    const root = `/sheets/v2/spreadsheets/${token}`;
    if (operation.action === 'insert')
      return this.post(`${root}/insert_dimension_range`, {
        dimension,
        inheritStyle: operation.inheritStyle,
      });
    // Insert uses zero-based/exclusive indices; resize/delete use one-based/inclusive indices.
    const inclusiveDimension = {
      ...dimension,
      startIndex: dimension.startIndex + 1,
    };
    if (operation.action === 'delete')
      return this.delete(`${root}/dimension_range`, {
        dimension: inclusiveDimension,
      });
    return this.put(`${root}/dimension_range`, {
      dimension: inclusiveDimension,
      dimensionProperties: { fixedSize: operation.pixelSize },
    });
  }

  async mergeCells(
    spreadsheet: string,
    range: string,
    mergeType: string,
  ): Promise<unknown> {
    const token = await this.token(spreadsheet);
    const endpoint = `/sheets/v2/spreadsheets/${token}/${mergeType === 'UNMERGE' ? 'unmerge_cells' : 'merge_cells'}`;
    return this.post(
      endpoint,
      mergeType === 'UNMERGE' ? { range } : { range, mergeType },
    );
  }

  async styleCells(
    spreadsheet: string,
    ranges: string[],
    style: Record<string, unknown>,
  ): Promise<unknown> {
    const token = await this.token(spreadsheet);
    const font = style.font as { fontSize?: number } | undefined;
    const apiStyle =
      font?.fontSize === undefined
        ? style
        : {
            ...style,
            font: { ...font, fontSize: `${font.fontSize}pt/1.5` },
          };
    return this.put(`/sheets/v2/spreadsheets/${token}/styles_batch_update`, {
      data: [{ ranges, style: apiStyle }],
    });
  }

  async getFilter(spreadsheet: string, sheetId: string): Promise<unknown> {
    return this.get(
      `/sheets/v3/spreadsheets/${await this.token(spreadsheet)}/sheets/${sheetId}/filter`,
    );
  }

  async setFilter(
    spreadsheet: string,
    sheetId: string,
    operation: {
      action: string;
      range?: string;
      col?: string;
      condition?: Record<string, unknown>;
    },
  ): Promise<unknown> {
    const endpoint = `/sheets/v3/spreadsheets/${await this.token(spreadsheet)}/sheets/${sheetId}/filter`;
    const { action, ...body } = operation;
    if (body.range && !body.range.startsWith(`${sheetId}!`))
      throw new Error('Filter range must belong to sheetId.');
    if (action === 'delete') return this.delete(endpoint);
    if (action === 'update') return this.put(endpoint, body);
    return this.post(endpoint, body);
  }

  async upsertRows(
    spreadsheet: string,
    range: string,
    keyField: string,
    records: Fields[],
    apply: boolean,
    previewToken?: string,
  ): Promise<unknown> {
    const match = /^([^!]+)!([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/.exec(range)!;
    const [, sheet, startCol, startRow, endCol = startCol, endRow = startRow] =
      match;
    const columnIndex = (letters: string) =>
      [...letters].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
    const columnName = (index: number): string =>
      index < 26
        ? String.fromCharCode(65 + index)
        : columnName(Math.floor(index / 26) - 1) +
          String.fromCharCode(65 + (index % 26));
    const width = columnIndex(endCol) - columnIndex(startCol) + 1;
    const height = Number(endRow) - Number(startRow) + 1;
    if (width < 1 || height < 2 || height > 5000)
      throw new Error(
        'Use an ordered range of 2–5000 rows, including the header.',
      );
    const result = (await this.readCells(
      spreadsheet,
      range,
      'Formula',
      'FormattedString',
    )) as { valueRange: { values: unknown[][] } };
    const values = result.valueRange.values;
    const headers = values[0]?.map((value) => String(value ?? '')) ?? [];
    if (!headers.includes(keyField))
      throw new Error(`Key header not found: ${keyField}`);
    const supplied = new Set(records.flatMap((record) => Object.keys(record)));
    for (const name of supplied)
      if (!name || headers.filter((h) => h === name).length !== 1)
        throw new Error(`Missing or ambiguous header: ${name}`);
    let lastRow = 0;
    const existing = values.slice(1).flatMap((row, i) => {
      if (
        row.every(
          (value) => value === null || value === undefined || value === '',
        )
      )
        return [];
      lastRow = i + 1;
      return [
        {
          id: String(Number(startRow) + i + 1),
          fields: Object.fromEntries(
            headers
              .filter(Boolean)
              .map((name) => [name, row[headers.indexOf(name)] ?? null]),
          ),
        },
      ];
    });
    const plan = planUpsert(existing, records, keyField, {
      spreadsheet,
      range,
    });
    if (lastRow + plan.creates.length >= height)
      throw new Error(
        'Not enough empty rows in the bounded range. Expand the range and preview again.',
      );
    const writes = [
      ...plan.updates.map((update) => ({
        row: Number(update.record_id),
        fields: update.fields,
      })),
      ...plan.creates.map((record, i) => ({
        row: Number(startRow) + lastRow + i + 1,
        fields: record.fields,
      })),
    ].flatMap(({ row, fields }) =>
      Object.entries(fields).map(([name, value]) => {
        const cell = `${columnName(columnIndex(startCol) + headers.indexOf(name))}${row}`;
        return { range: `${sheet}!${cell}:${cell}`, values: [[value]] };
      }),
    );
    if (!apply)
      return {
        applied: false,
        ...plan,
        ranges: writes.map((write) => write.range),
      };
    requirePreview(plan.previewToken, previewToken);
    let completedCells = 0;
    try {
      for (let i = 0; i < writes.length; i += 100) {
        const batch = writes.slice(i, i + 100) as z.infer<
          typeof ValueRangeSchema
        >[];
        await this.writeCells(spreadsheet, batch);
        completedCells += batch.length;
      }
    } catch (error) {
      throw new Error(
        `Upsert stopped after ${completedCells} confirmed cells. Read the range and preview again before retrying. ${formatErrorMessage(error)}`,
      );
    }
    return {
      applied: true,
      created: plan.creates.length,
      updated: plan.updates.length,
      unchanged: plan.unchanged,
    };
  }
  private token(spreadsheet: string): Promise<string> {
    return resolveTableToken(spreadsheet, 'sheet', (token) =>
      this.get('/wiki/v2/spaces/get_node', { token }),
    );
  }

  createSpreadsheet(title: string, folderToken?: string): Promise<unknown> {
    return this.post('/sheets/v3/spreadsheets', {
      title,
      folder_token: folderToken,
    });
  }

  async listSheets(spreadsheet: string): Promise<unknown> {
    const token = await this.token(spreadsheet);
    return this.get(`/sheets/v3/spreadsheets/${token}/sheets/query`);
  }

  async readCells(
    spreadsheet: string,
    range: string,
    valueRenderOption: string,
    dateTimeRenderOption: string,
  ): Promise<unknown> {
    const token = await this.token(spreadsheet);
    return this.get(
      `/sheets/v2/spreadsheets/${token}/values/${encodeURIComponent(range)}`,
      {
        valueRenderOption,
        dateTimeRenderOption:
          dateTimeRenderOption === 'SerialNumber'
            ? undefined
            : dateTimeRenderOption,
      },
    );
  }

  async writeCells(
    spreadsheet: string,
    valueRanges: z.infer<typeof ValueRangeSchema>[],
  ): Promise<unknown> {
    const token = await this.token(spreadsheet);
    return this.post(`/sheets/v2/spreadsheets/${token}/values_batch_update`, {
      valueRanges,
    });
  }

  async appendRows(
    spreadsheet: string,
    valueRange: z.infer<typeof ValueRangeSchema>,
  ): Promise<unknown> {
    const token = await this.token(spreadsheet);
    return this.post(`/sheets/v2/spreadsheets/${token}/values_append`, {
      valueRange,
    });
  }

  async addSheet(spreadsheet: string, title: string): Promise<unknown> {
    const token = await this.token(spreadsheet);
    return this.post(`/sheets/v2/spreadsheets/${token}/sheets_batch_update`, {
      requests: [{ addSheet: { properties: { title } } }],
    });
  }
}

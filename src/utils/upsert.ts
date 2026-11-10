import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

export type Fields = Record<string, unknown>;
export interface ExistingRecord {
  id: string;
  fields: Fields;
}

function scalar(value: unknown): unknown {
  if (
    Array.isArray(value) &&
    value.every((v) => v && typeof v.text === 'string')
  ) {
    return value.map((v) => v.text).join('');
  }
  return value ?? null;
}

function key(value: unknown): string {
  const result = scalar(value);
  if (
    (typeof result !== 'string' && typeof result !== 'number') ||
    String(result).trim() === ''
  ) {
    throw new Error('Unique keys must be nonempty text or numbers.');
  }
  return String(result);
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canonical(v)]),
    );
  }
  return value;
}

/** Plan all changes before writing; ambiguous keys never select an arbitrary record. */
export function planUpsert(
  existing: ExistingRecord[],
  incoming: Fields[],
  keyField: string,
  target: unknown,
) {
  const index = new Map<string, ExistingRecord>();
  for (const record of existing) {
    const value = scalar(record.fields[keyField]);
    if (value === undefined || value === null || value === '') continue;
    const id = key(value);
    if (index.has(id)) throw new Error(`Duplicate existing key: ${id}`);
    index.set(id, record);
  }
  const seen = new Set<string>();
  const creates: { fields: Fields }[] = [];
  const updates: { record_id: string; fields: Fields; before: Fields }[] = [];
  let unchanged = 0;
  for (const fields of incoming) {
    const id = key(fields[keyField]);
    if (seen.has(id)) throw new Error(`Duplicate incoming key: ${id}`);
    seen.add(id);
    const previous = index.get(id);
    if (!previous) {
      creates.push({ fields });
      continue;
    }
    const changed = Object.fromEntries(
      Object.entries(fields).filter(
        ([name, value]) =>
          name !== keyField &&
          !isDeepStrictEqual(scalar(previous.fields[name]), scalar(value)),
      ),
    );
    if (Object.keys(changed).length) {
      updates.push({
        record_id: previous.id,
        fields: changed,
        before: Object.fromEntries(
          Object.keys(changed).map((name) => [
            name,
            previous.fields[name] ?? null,
          ]),
        ),
      });
    } else unchanged++;
  }
  const previewToken = createHash('sha256')
    .update(JSON.stringify(canonical({ target, existing, incoming, keyField })))
    .digest('hex');
  return { previewToken, creates, updates, unchanged };
}

export function requirePreview(actual: string, supplied?: string): void {
  if (actual !== supplied)
    throw new Error(
      'A matching previewToken is required. Preview again: input or target data changed.',
    );
}

export const MARKDOWN_IMPORT_MAX_RETRIES = 10;

export const MARKDOWN_IMPORT_RETRY_INTERVALS_MS = [
  1000, 2000, 3000, 5000, 5000, 5000, 5000, 5000, 5000,
] as const;

export function getMarkdownImportRetryDelayMs(attempt: number): number {
  if (!Number.isInteger(attempt) || attempt < 0) {
    throw new Error('Retry attempt must be a non-negative integer.');
  }

  const index = Math.min(
    attempt,
    MARKDOWN_IMPORT_RETRY_INTERVALS_MS.length - 1,
  );
  return MARKDOWN_IMPORT_RETRY_INTERVALS_MS[index];
}

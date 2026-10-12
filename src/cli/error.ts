import { formatErrorMessage } from '../utils/error.js';

export interface CliErrorResponse {
  error: string;
  recovery?: Record<string, unknown>;
}

/**
 * Builds a machine-readable CLI error response while preserving recovery data.
 */
export function buildCliErrorResponse(error: unknown): CliErrorResponse {
  const response: CliErrorResponse = { error: formatErrorMessage(error) };
  const recovery = getRecoveryInfo(error);

  if (recovery) response.recovery = recovery;

  return response;
}

function getRecoveryInfo(error: unknown): Record<string, unknown> | undefined {
  if (!error || typeof error !== 'object' || !('recovery' in error)) {
    return undefined;
  }

  const recovery = (error as { recovery?: unknown }).recovery;
  return recovery && typeof recovery === 'object'
    ? (recovery as Record<string, unknown>)
    : undefined;
}

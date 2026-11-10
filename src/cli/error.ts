import { formatErrorMessage } from '../utils/error.js';

export interface CliErrorResponse {
  error: string;
  recovery?: Record<string, unknown>;
}

export function hasPartialToolFailure(toolName: string, result: unknown): boolean {
  if (toolName === 'create_feishu_task' || toolName === 'delete_feishu_task') {
    return (result as { errors: unknown[] }).errors.length > 0;
  }
  if (toolName === 'fill_whiteboard_with_plantuml') {
    return (result as { failed: number }).failed > 0;
  }
  if (toolName === 'upload_and_bind_image_to_block') {
    return (result as { error?: string }[]).some(item => Boolean(item.error));
  }
  return false;
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

import type { FlashErrorEnvelope, FlashErrorReason } from '@/types/firmware';

const KNOWN_REASONS: ReadonlySet<FlashErrorReason> = new Set<FlashErrorReason>([
  'invalid_body',
  'job_already_running',
  'no_controllers',
  'variant_mismatch',
  'variant_unknown',
  'release_not_found',
  'asset_not_found',
  'no_upload',
  'release_lookup_failed',
  'source_resolution_failed',
  'controllers_lookup_failed',
  'subscriber_attach_failed',
  'protocol_violation',
  'streamer_unknown_error',
  'internal_server_error',
  'network_error',
]);

function isAxiosLikeError(value: unknown): value is { response?: { data?: unknown } } {
  return typeof value === 'object' && value !== null && 'response' in value;
}

/**
 * Map an axios-style error thrown by `apiService.post(FIRMWARE_FLASH, ...)`
 * onto a `FlashErrorEnvelope` the UI can render via i18n keys.
 *
 * No-response → `network_error`. Response with an unrecognized `error` field
 * → `internal_server_error`. Server's `currentJobId` is preserved for the
 * 409 case so the banner can mention which job is in flight.
 */
export function mapHttpErrorToFlashEnvelope(error: unknown): FlashErrorEnvelope {
  if (!isAxiosLikeError(error) || error.response === undefined) {
    return { reason: 'network_error' };
  }
  const body = error.response.data;
  if (typeof body !== 'object' || body === null) {
    return { reason: 'internal_server_error' };
  }
  const reasonRaw = (body as { error?: unknown }).error;
  const detailRaw = (body as { detail?: unknown }).detail;
  const currentJobIdRaw = (body as { currentJobId?: unknown }).currentJobId;

  const reason: FlashErrorReason = (
    typeof reasonRaw === 'string' && KNOWN_REASONS.has(reasonRaw as FlashErrorReason)
      ? reasonRaw
      : 'internal_server_error'
  ) as FlashErrorReason;

  const envelope: FlashErrorEnvelope = { reason };
  if (typeof detailRaw === 'string') envelope.detail = detailRaw;
  if (typeof currentJobIdRaw === 'string') envelope.currentJobId = currentJobIdRaw;
  return envelope;
}

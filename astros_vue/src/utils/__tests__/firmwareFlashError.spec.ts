import { describe, it, expect } from 'vitest';
import { mapHttpErrorToFlashEnvelope } from '../firmwareFlashError';

describe('mapHttpErrorToFlashEnvelope', () => {
  it("returns network_error when the error has no response (axios 'no response received')", () => {
    expect(mapHttpErrorToFlashEnvelope({ message: 'Network Error' })).toEqual({
      reason: 'network_error',
    });
  });

  it('returns network_error for arbitrary non-axios shapes', () => {
    expect(mapHttpErrorToFlashEnvelope('boom')).toEqual({ reason: 'network_error' });
    expect(mapHttpErrorToFlashEnvelope(null)).toEqual({ reason: 'network_error' });
    expect(mapHttpErrorToFlashEnvelope(undefined)).toEqual({ reason: 'network_error' });
  });

  it('returns internal_server_error when response.data is not an object', () => {
    expect(mapHttpErrorToFlashEnvelope({ response: { data: 'oops' } })).toEqual({
      reason: 'internal_server_error',
    });
  });

  it('maps recognized server `error` strings onto FlashErrorReason', () => {
    expect(
      mapHttpErrorToFlashEnvelope({ response: { data: { error: 'release_not_found' } } }),
    ).toEqual({ reason: 'release_not_found' });
  });

  it('preserves detail and currentJobId when present', () => {
    expect(
      mapHttpErrorToFlashEnvelope({
        response: { data: { error: 'job_already_running', currentJobId: 'job-42' } },
      }),
    ).toEqual({ reason: 'job_already_running', currentJobId: 'job-42' });

    expect(
      mapHttpErrorToFlashEnvelope({
        response: { data: { error: 'no_controllers', detail: 'targets list was empty' } },
      }),
    ).toEqual({ reason: 'no_controllers', detail: 'targets list was empty' });
  });

  it('falls back to internal_server_error for unknown `error` strings', () => {
    // Mutation guard: a future server adding a new reason would land here
    // until the client type list is updated. The fallback prevents render
    // crashes (missing i18n key) but is loud enough to debug.
    expect(mapHttpErrorToFlashEnvelope({ response: { data: { error: 'meteor_strike' } } })).toEqual(
      { reason: 'internal_server_error' },
    );
  });
});

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import type { AxiosError } from 'axios';

const { responseUse, toastWarning } = vi.hoisted(() => ({
  responseUse: vi.fn(),
  toastWarning: vi.fn(),
}));
vi.mock('@/api/apiService', () => ({
  default: { get: vi.fn() },
  apiClient: { interceptors: { response: { use: responseUse } } },
}));
vi.mock('@/composables/useToast', () => ({
  useToast: () => ({ warning: toastWarning }),
}));

import { installReadOnlyInterceptor } from '../readOnlyInterceptor';
import { useSystemStatusStore } from '@/stores/systemStatus';

type Rejected = (error: AxiosError) => Promise<never>;

function installAndCaptureRejected(): Rejected {
  installReadOnlyInterceptor();
  return responseUse.mock.calls[0]![1] as Rejected;
}

function error503(reasonCode: string): AxiosError {
  return { response: { status: 503, data: { reasonCode } } } as unknown as AxiosError;
}

describe('readOnlyInterceptor', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    responseUse.mockReset();
    toastWarning.mockReset();
  });

  it.each([
    'STARTUP_OPEN_FAILED',
    'BACKUP_FAILED',
    'MIGRATION_FAILED_NO_BACKUP',
    'MIGRATION_FAILED_RESTORED',
    'MIGRATION_FAILED_RESTORE_FAILED',
  ])('a read-only 503 with %s updates the store and toasts', async (code) => {
    const rejected = installAndCaptureRejected();
    const err = error503(code);

    await expect(rejected(err)).rejects.toBe(err);

    expect(useSystemStatusStore().reasonCode).toBe(code);
    expect(toastWarning).toHaveBeenCalledTimes(1);
  });

  it('a DB_NEWER_THAN_SERVER 503 updates the store without a toast', async () => {
    // Every call but GET /system/status 503s with this code; the notice page
    // already explains it.
    const rejected = installAndCaptureRejected();
    const err = error503('DB_NEWER_THAN_SERVER');

    await expect(rejected(err)).rejects.toBe(err);

    expect(useSystemStatusStore().dbIncompatible).toBe(true);
    expect(toastWarning).not.toHaveBeenCalled();
  });

  it('a DB_NEWER_THAN_SERVER 503 still toasts when the store could not be updated', async () => {
    // No notice will show, so the toast is the only thing the user sees.
    const rejected = installAndCaptureRejected();
    setActivePinia(undefined as never);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const err = error503('DB_NEWER_THAN_SERVER');

    try {
      await expect(rejected(err)).rejects.toBe(err);
    } finally {
      warn.mockRestore();
    }

    expect(toastWarning).toHaveBeenCalledTimes(1);
  });
});

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

vi.mock('@/api/apiService', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

import apiService from '@/api/apiService';
import { useRemoteCommands } from '../useRemoteCommands';
import { SCRIPTS_RUN, PLAYLISTS_RUN, PANIC_STOP } from '@/api/endpoints';

const apiGet = apiService.get as ReturnType<typeof vi.fn>;
const apiPost = apiService.post as ReturnType<typeof vi.fn>;

describe('useRemoteCommands', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    apiGet.mockReset();
    apiPost.mockReset();
    apiGet.mockResolvedValue(undefined);
    apiPost.mockResolvedValue(undefined);
  });

  it('runScript runs the given script id', async () => {
    const { runScript } = useRemoteCommands();
    const result = await runScript('s-123');
    expect(apiGet).toHaveBeenCalledWith(SCRIPTS_RUN, { id: 's-123' });
    expect(result).toEqual({ success: true });
  });

  it('runPlaylist runs the given playlist id', async () => {
    const { runPlaylist } = useRemoteCommands();
    const result = await runPlaylist('p-9');
    expect(apiGet).toHaveBeenCalledWith(PLAYLISTS_RUN, { id: 'p-9' });
    expect(result).toEqual({ success: true });
  });

  it('panicStop POSTs the panic endpoint', async () => {
    const { panicStop } = useRemoteCommands();
    const result = await panicStop();
    expect(apiPost).toHaveBeenCalledWith(PANIC_STOP, {});
    expect(result).toEqual({ success: true });
  });

  it('panicStop returns failure when the request throws', async () => {
    apiPost.mockRejectedValueOnce(new Error('boom'));
    const { panicStop } = useRemoteCommands();
    const result = await panicStop();
    expect(result.success).toBe(false);
  });

  it('runScript returns a failure result (with an error) when the request throws', async () => {
    apiGet.mockRejectedValueOnce(new Error('boom'));
    const { runScript } = useRemoteCommands();
    const result = await runScript('s-1');
    expect(result.success).toBe(false);
    // Discriminated union: a failure always carries a reason string.
    if (!result.success) expect(typeof result.error).toBe('string');
  });

  it('runPlaylist returns a failure result when the request throws', async () => {
    apiGet.mockRejectedValueOnce(new Error('boom'));
    const { runPlaylist } = useRemoteCommands();
    const result = await runPlaylist('p-1');
    expect(result.success).toBe(false);
  });
});

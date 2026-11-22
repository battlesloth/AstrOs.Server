import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

vi.mock('@/api/apiService', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

import apiService from '@/api/apiService';
import { useScriptsStore } from '../scripts';
import type { Script } from '@/models';

const apiGet = apiService.get as ReturnType<typeof vi.fn>;
const apiPost = apiService.post as ReturnType<typeof vi.fn>;

// A fresh object per call: the store's reactive proxy writes through to the
// object it is seeded with, so seeding and asserting with one object would hide
// a change the store makes to it.
function makeOriginal(): Script {
  return {
    id: 's1788696QAq',
    scriptName: 'Wave',
    description: 'arm wave',
    lastSaved: new Date('2026-11-01T12:00:00.000Z'),
    durationDS: 15,
    playlistCount: 1,
    deploymentStatus: {},
    scriptChannels: [],
  };
}

// The copy as it arrives over HTTP: the fields ScriptRepository.copyScript
// returns, with lastSaved as the ISO string JSON makes of it (the store converts
// nothing).
function makeCopyResponse() {
  return {
    id: 's1795309ahZ',
    scriptName: 'Wave (Copy)',
    description: 'arm wave',
    lastSaved: '2026-11-21T12:00:00.000Z',
    durationDS: 15,
    playlistCount: 0,
    deploymentStatus: {},
    scriptChannels: [],
  };
}

describe('scripts store copyScript', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    apiGet.mockReset();
    apiPost.mockReset();
  });

  // The API serves copy only as POST with the id in the body (see
  // registerScriptRoutes). The path is a literal, so a drifted SCRIPTS_COPY fails.
  it('copyScript posts the id and adds the copy', async () => {
    apiPost.mockResolvedValue(makeCopyResponse());
    const store = useScriptsStore();
    store.scripts = [makeOriginal()];

    const result = await store.copyScript('s1788696QAq');

    expect(apiPost.mock.calls).toEqual([['api/scripts/copy', { id: 's1788696QAq' }]]);
    expect(apiGet).not.toHaveBeenCalled();
    expect(store.scripts).toEqual([makeOriginal(), makeCopyResponse()]);
    expect(result).toEqual({ success: true, data: makeCopyResponse() });
  });

  it('a failed copy leaves the list unchanged', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    apiPost.mockRejectedValue(new Error('Request failed with status code 503'));
    const store = useScriptsStore();
    store.scripts = [makeOriginal()];

    const result = await store.copyScript('s1788696QAq');

    expect(result).toEqual({ success: false, error: 'Request failed with status code 503' });
    expect(store.scripts).toEqual([makeOriginal()]);
    expect(consoleError).toHaveBeenCalledWith('Failed to copy script:', expect.any(Error));
  });
});

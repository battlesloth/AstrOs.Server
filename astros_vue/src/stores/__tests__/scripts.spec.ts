import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

vi.mock('@/api/apiService', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

import apiService from '@/api/apiService';
import { SCRIPTS_COPY } from '@/api/endpoints';
import { useScriptsStore } from '../scripts';
import type { Script } from '@/models';

const apiGet = apiService.get as ReturnType<typeof vi.fn>;
const apiPost = apiService.post as ReturnType<typeof vi.fn>;

const ORIGINAL: Script = {
  id: 's1',
  scriptName: 'Wave',
  description: 'arm wave',
  lastSaved: new Date('2026-11-01T12:00:00.000Z'),
  durationDS: 15,
  playlistCount: 1,
  deploymentStatus: {},
  scriptChannels: [],
};

// The fields ScriptRepository.copyScript returns: a new id, the "(Copy)"
// name, no playlists, no deployments and no channels.
const COPY: Script = {
  id: 's2',
  scriptName: 'Wave (Copy)',
  description: 'arm wave',
  lastSaved: new Date('2026-11-21T12:00:00.000Z'),
  durationDS: 15,
  playlistCount: 0,
  deploymentStatus: {},
  scriptChannels: [],
};

describe('scripts store copyScript', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    apiGet.mockReset();
    apiPost.mockReset();
  });

  // The API serves copy only as POST with the id in the body; the GET this
  // store used to send answered 404 for every script.
  it('copyScript posts the id and adds the copy', async () => {
    apiPost.mockResolvedValue(COPY);
    const store = useScriptsStore();
    store.scripts = [ORIGINAL];

    const result = await store.copyScript('s1');

    expect(apiPost.mock.calls).toEqual([[SCRIPTS_COPY, { id: 's1' }]]);
    expect(apiGet).not.toHaveBeenCalled();
    expect(store.scripts).toEqual([ORIGINAL, COPY]);
    expect(result).toEqual({ success: true, data: COPY });
  });

  it('a failed copy leaves the list unchanged', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    apiPost.mockRejectedValue(new Error('Request failed with status code 503'));
    const store = useScriptsStore();
    store.scripts = [ORIGINAL];

    const result = await store.copyScript('s1');

    expect(result).toEqual({ success: false, error: 'Request failed with status code 503' });
    expect(store.scripts).toEqual([ORIGINAL]);
  });
});

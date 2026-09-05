import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

vi.mock('@/api/apiService', () => ({
  default: {
    get: vi.fn(),
    put: vi.fn(),
    post: vi.fn(),
  },
}));

import apiService from '@/api/apiService';
import { useScripterStore } from '../scripter';
import { Location, UploadStatus } from '@/enums';
import type { Script } from '@/models';

const apiPut = apiService.put as ReturnType<typeof vi.fn>;

const PRIOR_DEPLOY_DATE = new Date('2026-05-31T17:38:58.000Z');

function makeScript(deploymentStatus: Script['deploymentStatus']): Script {
  return {
    id: 's1',
    scriptName: 'Servo Test',
    description: '',
    lastSaved: PRIOR_DEPLOY_DATE,
    durationDS: 8,
    playlistCount: 0,
    deploymentStatus,
    scriptChannels: [],
  };
}

describe('scripter store markUploading', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    apiPut.mockReset();
  });

  it('marks the given locations UPLOADING and keeps their prior deployment date', () => {
    const store = useScripterStore();
    store.script = makeScript({
      [Location.BODY]: { value: UploadStatus.UPLOADED, date: PRIOR_DEPLOY_DATE },
      [Location.CORE]: { value: UploadStatus.UPLOADED, date: PRIOR_DEPLOY_DATE },
    });

    store.markUploading([Location.BODY, Location.CORE]);

    expect(store.script?.deploymentStatus[Location.BODY]).toEqual({
      value: UploadStatus.UPLOADING,
      date: PRIOR_DEPLOY_DATE,
    });
    expect(store.script?.deploymentStatus[Location.CORE]).toEqual({
      value: UploadStatus.UPLOADING,
      date: PRIOR_DEPLOY_DATE,
    });
  });

  it('adds an UPLOADING entry for a location that had none, and leaves other locations untouched', () => {
    const store = useScripterStore();
    store.script = makeScript({
      [Location.DOME]: { value: UploadStatus.UPLOADED, date: PRIOR_DEPLOY_DATE },
    });

    store.markUploading([Location.BODY]);

    expect(store.script?.deploymentStatus[Location.BODY]).toEqual({
      value: UploadStatus.UPLOADING,
      date: undefined,
    });
    expect(store.script?.deploymentStatus[Location.DOME]).toEqual({
      value: UploadStatus.UPLOADED,
      date: PRIOR_DEPLOY_DATE,
    });
  });

  it('leaves the map untouched for an empty location list', () => {
    const store = useScripterStore();
    store.script = makeScript({
      [Location.BODY]: { value: UploadStatus.UPLOADED, date: PRIOR_DEPLOY_DATE },
    });
    const before = store.script?.deploymentStatus;

    store.markUploading([]);

    expect(store.script?.deploymentStatus).toBe(before);
  });

  it('warns and does nothing when no script is loaded', () => {
    const store = useScripterStore();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(() => store.markUploading([Location.BODY])).not.toThrow();

    expect(store.script).toBeNull();
    expect(warn).toHaveBeenCalledWith('markUploading: no script loaded');
  });

  it('does not dirty a freshly saved script', async () => {
    const store = useScripterStore();
    store.script = makeScript({
      [Location.BODY]: { value: UploadStatus.UPLOADED, date: PRIOR_DEPLOY_DATE },
    });
    apiPut.mockResolvedValue({ message: 'success' });
    await store.saveScript(); // takes the dirty-tracking snapshot
    expect(store.isDirty).toBe(false);

    store.markUploading([Location.BODY, Location.CORE]);

    expect(store.isDirty).toBe(false);
  });
});

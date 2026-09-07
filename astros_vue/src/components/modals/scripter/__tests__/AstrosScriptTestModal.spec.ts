import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import enUS from '@/locales/enUS.json';

vi.mock('@/api/apiService', () => ({
  default: {
    get: vi.fn(),
    put: vi.fn(),
    post: vi.fn(),
  },
}));

import apiService from '@/api/apiService';
import AstrosScriptTestModal from '../AstrosScriptTestModal.vue';
import { useScripterStore } from '@/stores/scripter';
import { useLocationStore } from '@/stores/location';
import { Location, UploadStatus } from '@/enums';
import { TransmissionStatus } from '@/enums/transmissionStatus';
import { SCRIPTS_UPLOAD } from '@/api/endpoints';
import { WebsocketMessageType } from '@/enums/WebsocketMessageType';
import type { ControllerLocation, Script, ScriptStatus } from '@/models';
import type { GpioModule } from '@/models/controllers/modules/gpio/gpioModule';

const apiGet = apiService.get as ReturnType<typeof vi.fn>;

function createTestI18n() {
  return createI18n({
    legacy: false,
    locale: 'enUS',
    fallbackLocale: 'enUS',
    messages: { enUS },
  });
}

const SCRIPT_ID = 's1';
const PRIOR_DEPLOY_DATE = new Date('2026-05-31T17:38:58.000Z');

function makeScript(deploymentStatus: Script['deploymentStatus']): Script {
  return {
    id: SCRIPT_ID,
    scriptName: 'Servo Test',
    description: '',
    lastSaved: PRIOR_DEPLOY_DATE,
    durationDS: 8,
    playlistCount: 0,
    deploymentStatus,
    scriptChannels: [],
  };
}

// A location with a controller address counts as "assigned" to the modal.
function makeLocation(name: Location, address: string): ControllerLocation {
  return {
    id: `${name}-location-id`,
    locationName: name,
    description: '',
    configFingerprint: '',
    controller: { id: `${name}-controller`, name: `${name} controller`, address, fingerprint: '' },
    // The modal reads only controller.address; the module trees are never touched.
    gpioModule: undefined as unknown as GpioModule,
    i2cModules: [],
    uartModules: [],
  };
}

// What the HTTP payload carries for a script that was uploaded on an earlier occasion.
function priorUpload() {
  return { value: UploadStatus.UPLOADED, date: PRIOR_DEPLOY_DATE };
}

// The map createNewScript() seeds: a NOT_UPLOADED entry for every Location member.
function newScriptMap(): Script['deploymentStatus'] {
  return {
    [Location.BODY]: { value: UploadStatus.NOT_UPLOADED, date: undefined },
    [Location.CORE]: { value: UploadStatus.NOT_UPLOADED, date: undefined },
    [Location.DOME]: { value: UploadStatus.NOT_UPLOADED, date: undefined },
    [Location.UNKNOWN]: { value: UploadStatus.NOT_UPLOADED, date: undefined },
  };
}

// Simulate the WS ScriptStatus message the server sends when a controller acks
// an upload. On the wire `status` carries the API's TransmissionStatus number
// (pinned contract, see T-002), so mirror that rather than an UploadStatus.
// `date` is a Date here; on the wire it is an ISO string, which nothing in the
// modal reads.
function ack(
  store: ReturnType<typeof useScripterStore>,
  location: Location,
  status: TransmissionStatus = TransmissionStatus.SUCCESS,
) {
  store.updateScriptStatus({
    type: WebsocketMessageType.SCRIPT,
    success: true,
    message: '',
    scriptId: SCRIPT_ID,
    locationId: location,
    status: status as unknown as UploadStatus,
    date: new Date(),
  } satisfies ScriptStatus);
}

describe('AstrosScriptTestModal', () => {
  let pinia: Pinia;
  let scripterStore: ReturnType<typeof useScripterStore>;
  let locationStore: ReturnType<typeof useLocationStore>;

  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
    apiGet.mockReset();
    apiGet.mockResolvedValue(undefined);

    scripterStore = useScripterStore();
    locationStore = useLocationStore();
    locationStore.bodyLocation = makeLocation(Location.BODY, '00:11:22:33:44:01');
    locationStore.coreLocation = makeLocation(Location.CORE, '00:11:22:33:44:02');
    // dome intentionally left unassigned (no controller)
  });

  function mountModal() {
    return mount(AstrosScriptTestModal, {
      props: { scriptId: SCRIPT_ID },
      global: { plugins: [createTestI18n(), pinia] },
    });
  }

  it('mounts when the loaded script already carries deployment entries', async () => {
    scripterStore.script = makeScript({
      [Location.BODY]: priorUpload(),
      [Location.CORE]: priorUpload(),
    });

    const wrapper = mountModal();
    await flushPromises();

    expect(wrapper.text()).toContain('Script Test');
  });

  it('keeps Run disabled until every assigned location acks, ignoring prior deployment entries', async () => {
    scripterStore.script = makeScript({
      [Location.BODY]: priorUpload(),
      [Location.CORE]: priorUpload(),
    });

    const wrapper = mountModal();
    await flushPromises();
    const runButton = () => wrapper.get('[data-testid="run-button"]');

    expect(runButton().attributes('disabled')).toBeDefined();
    expect(wrapper.text()).toContain('Body: Uploading');
    expect(wrapper.text()).toContain('Core: Uploading');

    ack(scripterStore, Location.BODY);
    await flushPromises();

    expect(wrapper.text()).toContain('Body: Success');
    expect(wrapper.text()).toContain('Core: Uploading');
    expect(runButton().attributes('disabled')).toBeDefined();

    ack(scripterStore, Location.CORE);
    await flushPromises();

    expect(wrapper.text()).toContain('Upload Complete.');
    expect(runButton().attributes('disabled')).toBeUndefined();
  });

  it('marks the assigned locations UPLOADING in the scripter store before requesting the upload', async () => {
    scripterStore.script = makeScript({
      [Location.BODY]: priorUpload(),
      [Location.CORE]: priorUpload(),
    });
    let statusAtUpload: Script['deploymentStatus'] | undefined;
    apiGet.mockImplementation(async () => {
      statusAtUpload = JSON.parse(JSON.stringify(scripterStore.script?.deploymentStatus));
    });

    mountModal();
    await flushPromises();

    expect(apiGet).toHaveBeenCalledWith(SCRIPTS_UPLOAD, { id: SCRIPT_ID });
    expect(statusAtUpload?.[Location.BODY]?.value).toBe(UploadStatus.UPLOADING);
    expect(statusAtUpload?.[Location.CORE]?.value).toBe(UploadStatus.UPLOADING);
    expect(statusAtUpload?.[Location.DOME]).toBeUndefined();
  });

  it('shows Not Assigned for a location without a controller and does not wait for it', async () => {
    scripterStore.script = makeScript({});

    const wrapper = mountModal();
    await flushPromises();

    expect(wrapper.text()).toContain('Dome: Not Assigned');

    ack(scripterStore, Location.BODY);
    ack(scripterStore, Location.CORE);
    await flushPromises();

    expect(wrapper.text()).toContain('Upload Complete.');
    expect(wrapper.get('[data-testid="run-button"]').attributes('disabled')).toBeUndefined();
  });

  it('starts gated when every location carries an entry (new script map)', async () => {
    scripterStore.script = makeScript(newScriptMap());

    const wrapper = mountModal();
    await flushPromises();

    expect(wrapper.text()).toContain('Uploading script...');
    expect(wrapper.text()).not.toContain('Upload Complete.');
    expect(wrapper.text()).toContain('Body: Uploading');
    expect(wrapper.text()).toContain('Core: Uploading');
    expect(wrapper.text()).toContain('Dome: Not Assigned');
    expect(wrapper.get('[data-testid="run-button"]').attributes('disabled')).toBeDefined();
  });

  it('starts gated when all three locations were uploaded before and dome is unassigned', async () => {
    scripterStore.script = makeScript({
      [Location.BODY]: priorUpload(),
      [Location.CORE]: priorUpload(),
      [Location.DOME]: priorUpload(),
    });

    const wrapper = mountModal();
    await flushPromises();

    expect(wrapper.text()).toContain('Uploading script...');
    expect(wrapper.text()).toContain('Dome: Not Assigned');
    expect(wrapper.get('[data-testid="run-button"]').attributes('disabled')).toBeDefined();
  });

  it('waits for all three acks when dome is assigned too', async () => {
    locationStore.domeLocation = makeLocation(Location.DOME, '00:11:22:33:44:03');
    scripterStore.script = makeScript({
      [Location.BODY]: priorUpload(),
      [Location.CORE]: priorUpload(),
      [Location.DOME]: priorUpload(),
    });

    const wrapper = mountModal();
    await flushPromises();
    const runButton = () => wrapper.get('[data-testid="run-button"]');

    expect(runButton().attributes('disabled')).toBeDefined();
    expect(wrapper.text()).toContain('Dome: Uploading');

    ack(scripterStore, Location.BODY);
    ack(scripterStore, Location.CORE);
    await flushPromises();

    expect(wrapper.text()).toContain('Dome: Uploading');
    expect(runButton().attributes('disabled')).toBeDefined();

    ack(scripterStore, Location.DOME);
    await flushPromises();

    expect(wrapper.text()).toContain('Upload Complete.');
    expect(runButton().attributes('disabled')).toBeUndefined();
  });

  it('shows Failed for a location whose ack reports failure', async () => {
    scripterStore.script = makeScript({});

    const wrapper = mountModal();
    await flushPromises();

    ack(scripterStore, Location.BODY, TransmissionStatus.FAILED);
    await flushPromises();

    expect(wrapper.text()).toContain('Body: Failed');
  });

  it.todo(
    'keeps Run disabled when an assigned location fails (Backlog: sum-based completion check)',
  );

  it('reports Failed and requests no upload when no scriptId is given', async () => {
    scripterStore.script = makeScript({});

    const wrapper = mount(AstrosScriptTestModal, {
      props: { scriptId: undefined },
      global: { plugins: [createTestI18n(), pinia] },
    });
    await flushPromises();

    expect(wrapper.text()).toContain('Failed');
    expect(wrapper.text()).not.toContain('Uploading script...');
    expect(apiGet).not.toHaveBeenCalled();
  });

  it('starts gated again on a second Test of the same script', async () => {
    scripterStore.script = makeScript({});

    const first = mountModal();
    await flushPromises();
    ack(scripterStore, Location.BODY);
    ack(scripterStore, Location.CORE);
    await flushPromises();
    expect(first.get('[data-testid="run-button"]').attributes('disabled')).toBeUndefined();
    first.unmount();

    const second = mountModal();
    await flushPromises();

    expect(second.text()).toContain('Uploading script...');
    expect(second.text()).toContain('Body: Uploading');
    expect(second.text()).toContain('Core: Uploading');
    expect(second.get('[data-testid="run-button"]').attributes('disabled')).toBeDefined();
    expect(apiGet).toHaveBeenCalledTimes(2);
  });
});

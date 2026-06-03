import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import enUS from '@/locales/enUS.json';
import AstrosFirmwareControllersPanel from '../AstrosFirmwareControllersPanel.vue';
import AstrosFirmwareControllerRow from '../../firmwareControllerRow/AstrosFirmwareControllerRow.vue';
import { useControllerStore } from '@/stores/controller';
import { useFirmwareStore } from '@/stores/firmware';
import { ControllerStatus } from '@/enums';

function createTestI18n() {
  return createI18n({
    legacy: false,
    locale: 'enUS',
    fallbackLocale: 'enUS',
    messages: { enUS },
  });
}

function seedFleet() {
  const store = useControllerStore();
  store.bodyStatus = ControllerStatus.UP;
  store.coreStatus = ControllerStatus.UP;
  store.domeStatus = ControllerStatus.UP;
  store.bodyFirmware = 'v1.4.0';
  store.coreFirmware = 'v1.4.0';
  store.domeFirmware = 'v1.4.0';
}

function mountPanel(props: Record<string, unknown>) {
  return mount(AstrosFirmwareControllersPanel, {
    props: props as never,
    global: {
      plugins: [createTestI18n()],
      stubs: {
        // Stub the row + button so we can focus on the result-bar template.
        AstrosFirmwareControllerRow: { template: '<div />' },
        AstrosFirmwareButton: { template: '<button><slot /></button>' },
      },
    },
  });
}

describe('AstrosFirmwareControllersPanel failed-result-bar predicate', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    seedFleet();
  });

  it('renders singular copy when failedCount === 1 with both label and stage', async () => {
    const wrapper = mountPanel({
      phase: 'failed',
      progressByControllerId: {},
      failedControllerLabel: 'Core',
      failedStage: 'transfer',
      failedCount: 1,
    });
    await wrapper.vm.$nextTick();

    const text = wrapper.text();
    // Singular: "⚠ {label} failed during {stage}"
    expect(text).toContain('Core');
    expect(text).toContain('Transfer'); // localized from `firmware_view.stages.transfer.label`
  });

  it('renders multi copy when failedCount === 2, dropping stage attribution (controllers may have failed at different stages)', async () => {
    const wrapper = mountPanel({
      phase: 'failed',
      progressByControllerId: {},
      failedControllerLabel: 'Body, Core',
      failedStage: 'transfer',
      failedCount: 2,
    });
    await wrapper.vm.$nextTick();

    const text = wrapper.text();
    expect(text).toContain('Body, Core');
    expect(text).toContain('failed during the flash'); // multi key copy
    // The singular "failed during {stage}" copy must NOT render — its
    // {stage} placeholder would lie about all entries sharing transfer.
    expect(text).not.toMatch(/failed during Transfer/);
  });

  it('defaults to singular copy when failedCount is omitted (?? 1 fallback)', async () => {
    // I12: pin the `(failedCount ?? 1) !== 1` predicate's default path.
    // A regression that changed `?? 1` to `?? 0` would render the multi
    // copy when the parent forgets to pass failedCount.
    const wrapper = mountPanel({
      phase: 'failed',
      progressByControllerId: {},
      failedControllerLabel: 'Core',
      failedStage: 'transfer',
      // No failedCount prop — should fall through to singular via `?? 1`.
    });
    await wrapper.vm.$nextTick();
    const text = wrapper.text();
    expect(text).toContain('Core');
    expect(text).toContain('Transfer');
    expect(text).not.toMatch(/failed during the flash/);
  });

  it('routes failedCount === 0 (pre-streamer abort) to the multi copy, not singular with — fallback', async () => {
    // A pre-streamer abort has no per-controller failure record. The
    // singular key would render "⚠ — failed during —". The multi key
    // with empty labels renders "⚠ — failed during the flash" — less
    // misleading.
    const wrapper = mountPanel({
      phase: 'failed',
      progressByControllerId: {},
      failedCount: 0,
    });
    await wrapper.vm.$nextTick();

    const text = wrapper.text();
    expect(text).toContain('failed during the flash');
    expect(text).not.toMatch(/failed during —/);
  });
});

describe('AstrosFirmwareControllersPanel allow-downgrade toggle', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('does NOT render the toggle in pure-upgrade flows (anyFleetDowngrade=false)', async () => {
    // Contextual-reveal contract: when no controller in the fleet would be
    // downgraded by the target, the toggle stays hidden so the routine path
    // is uncluttered. A regression that always-rendered the toggle would
    // teach operators to ignore it.
    const cs = useControllerStore();
    cs.bodyStatus = ControllerStatus.UP;
    cs.coreStatus = ControllerStatus.UP;
    cs.domeStatus = ControllerStatus.UP;
    cs.bodyFirmware = 'v1.3.0';
    cs.coreFirmware = 'v1.3.0';
    cs.domeFirmware = 'v1.3.0';
    const fw = useFirmwareStore();
    fw.sourceMode = 'github';
    fw.selectedReleaseTag = 'v1.4.2'; // upgrade for all

    const wrapper = mountPanel({ phase: 'select', progressByControllerId: {} });
    await wrapper.vm.$nextTick();

    expect(wrapper.find('input[type="checkbox"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="allow-downgrade-toggle"]').exists()).toBe(false);
  });

  it('renders the toggle when at least one fleet member would be downgraded', async () => {
    const cs = useControllerStore();
    cs.bodyStatus = ControllerStatus.UP;
    cs.coreStatus = ControllerStatus.UP;
    cs.domeStatus = ControllerStatus.UP;
    cs.bodyFirmware = 'v1.3.0';
    cs.coreFirmware = 'v1.4.0'; // would downgrade to v1.3.5
    cs.domeFirmware = 'v1.3.0';
    const fw = useFirmwareStore();
    fw.sourceMode = 'github';
    fw.selectedReleaseTag = 'v1.3.5';

    const wrapper = mountPanel({ phase: 'select', progressByControllerId: {} });
    await wrapper.vm.$nextTick();

    expect(wrapper.find('input[type="checkbox"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="allow-downgrade-toggle"]').exists()).toBe(true);
  });

  it("flips firmware.allowDowngrade on @change so the store's policy gate clears", async () => {
    // Pin the binding direction: a regression that read the store ref but
    // forgot to write it on change would render the checkbox state correctly
    // for one render but the click would no-op. This test catches that
    // exact mutation.
    const cs = useControllerStore();
    cs.bodyStatus = ControllerStatus.UP;
    cs.coreStatus = ControllerStatus.UP;
    cs.domeStatus = ControllerStatus.UP;
    cs.bodyFirmware = 'v1.4.0';
    cs.coreFirmware = 'v1.4.0';
    cs.domeFirmware = 'v1.4.0';
    const fw = useFirmwareStore();
    fw.sourceMode = 'github';
    fw.selectedReleaseTag = 'v1.3.5'; // all downgrades

    const wrapper = mountPanel({ phase: 'select', progressByControllerId: {} });
    await wrapper.vm.$nextTick();
    expect(fw.allowDowngrade).toBe(false);

    await wrapper.find('input[type="checkbox"]').setValue(true);
    expect(fw.allowDowngrade).toBe(true);
  });

  it('propagates firmware.allowDowngrade down as the row :allow-downgrade prop', async () => {
    // Integration: the row stub elsewhere in this file masks the actual
    // binding. Mount with the real row, flip the store ref, and assert the
    // child receives the updated prop. A regression that dropped or renamed
    // :allow-downgrade on the row would silently pass every other test.
    const cs = useControllerStore();
    cs.bodyStatus = ControllerStatus.UP;
    cs.coreStatus = ControllerStatus.UP;
    cs.domeStatus = ControllerStatus.UP;
    cs.bodyFirmware = 'v1.4.0';
    cs.coreFirmware = 'v1.4.0';
    cs.domeFirmware = 'v1.4.0';
    const fw = useFirmwareStore();
    fw.sourceMode = 'github';
    fw.selectedReleaseTag = 'v1.3.5'; // all downgrades

    const wrapper = mount(AstrosFirmwareControllersPanel, {
      props: { phase: 'select', progressByControllerId: {} } as never,
      global: {
        plugins: [createTestI18n()],
        // No row stub — render the real row so we can read its props.
        stubs: { AstrosFirmwareButton: { template: '<button><slot /></button>' } },
      },
    });
    await wrapper.vm.$nextTick();

    const rows = wrapper.findAllComponents(AstrosFirmwareControllerRow);
    const firstRow = rows[0];
    expect(firstRow).toBeDefined();
    if (firstRow === undefined) return;
    expect(firstRow.props('allowDowngrade')).toBe(false);

    fw.allowDowngrade = true;
    await wrapper.vm.$nextTick();
    expect(firstRow.props('allowDowngrade')).toBe(true);
  });

  it('does NOT render the toggle in non-select phases (flashing/done/failed)', async () => {
    // The `phase === 'select'` gate around header-actions hides the whole
    // group during a live flash; the toggle inherits that hiding. Pin so a
    // refactor that lifts the toggle out of the gate doesn't leak it into
    // the live-flash header.
    const cs = useControllerStore();
    cs.bodyStatus = ControllerStatus.UP;
    cs.coreStatus = ControllerStatus.UP;
    cs.domeStatus = ControllerStatus.UP;
    cs.bodyFirmware = 'v1.4.0';
    cs.coreFirmware = 'v1.4.0';
    cs.domeFirmware = 'v1.4.0';
    const fw = useFirmwareStore();
    fw.sourceMode = 'github';
    fw.selectedReleaseTag = 'v1.3.5';

    const wrapper = mountPanel({ phase: 'flashing', progressByControllerId: {} });
    await wrapper.vm.$nextTick();

    expect(wrapper.find('[data-test="allow-downgrade-toggle"]').exists()).toBe(false);
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import enUS from '@/locales/enUS.json';
import AstrosFirmwareControllersPanel from '../AstrosFirmwareControllersPanel.vue';
import { useControllerStore } from '@/stores/controller';
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

describe('AstrosFirmwareControllersPanel failed-result-bar predicate (I-test-2)', () => {
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
    // I2 + I-test-2: a pre-streamer abort has no per-controller failure
    // record. The singular key would render "⚠ — failed during —". The
    // multi key with empty labels renders "⚠ — failed during the flash"
    // which is less misleading.
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

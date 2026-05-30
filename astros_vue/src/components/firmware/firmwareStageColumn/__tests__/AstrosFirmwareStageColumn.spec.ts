import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import enUS from '@/locales/enUS.json';
import AstrosFirmwareStageColumn from '../AstrosFirmwareStageColumn.vue';
import { controllerStageColumn } from '@/utils/firmwareStageBoard';
import type { ControllerFlashStateBySlot, FirmwareControllerView } from '@/types/firmware';

function i18n() {
  return createI18n({ legacy: false, locale: 'enUS', fallbackLocale: 'enUS', messages: { enUS } });
}
const padawan: Pick<FirmwareControllerView, 'id' | 'label' | 'glyph' | 'isMaster'> = {
  id: 'core',
  label: 'Core',
  glyph: 'C',
  isMaster: false,
};

function mountCol(state: ControllerFlashStateBySlot | undefined, opts = {}) {
  return mount(AstrosFirmwareStageColumn, {
    global: { plugins: [i18n()] },
    props: { column: controllerStageColumn(padawan, state, opts) },
  });
}

describe('AstrosFirmwareStageColumn', () => {
  it('renders the padawan Download row as "Master only" with a dash bullet', () => {
    const wrapper = mountCol(undefined);
    const naRow = wrapper.find('.astros-firmware-stage-column__row--na');
    expect(naRow.exists()).toBe(true);
    expect(naRow.text()).toContain('Master only');
    expect(naRow.find('.astros-firmware-stage-column__bullet--na').text()).toBe('—');
  });

  it('shows the live percent on the current Receive row', () => {
    const wrapper = mountCol({
      controllerId: 'core',
      stage: 'SENDING',
      bytesSent: 54,
      totalBytes: 100,
    });
    const current = wrapper.find('.astros-firmware-stage-column__row--current');
    expect(current.text()).toContain('Receive');
    expect(current.find('.astros-firmware-stage-column__progress--current').text()).toBe('54%');
  });

  it('labels a not-in-update column as NOT IN UPDATE', () => {
    const wrapper = mountCol(undefined);
    expect(wrapper.text()).toContain('NOT IN UPDATE');
    expect(wrapper.find('.astros-firmware-stage-column--idle').exists()).toBe(true);
  });

  it('does NOT apply the dimmed --idle modifier to a participating column', () => {
    // Guards the inverse of the not-in-update case: a controller with a live
    // state must render at full opacity (no --idle), even when it's a padawan.
    const wrapper = mountCol({
      controllerId: 'core',
      stage: 'SENDING',
      bytesSent: 54,
      totalBytes: 100,
    });
    expect(wrapper.find('.astros-firmware-stage-column--idle').exists()).toBe(false);
  });
});

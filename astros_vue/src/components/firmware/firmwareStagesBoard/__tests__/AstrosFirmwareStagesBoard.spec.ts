import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import enUS from '@/locales/enUS.json';
import AstrosFirmwareStagesBoard from '../AstrosFirmwareStagesBoard.vue';
import { controllerStageColumn } from '@/utils/firmwareStageBoard';

function i18n() {
  return createI18n({ legacy: false, locale: 'enUS', fallbackLocale: 'enUS', messages: { enUS } });
}

describe('AstrosFirmwareStagesBoard', () => {
  it('renders one column per supplied model', () => {
    const columns = [
      controllerStageColumn(
        { id: 'body', label: 'Body', glyph: 'B', isMaster: true },
        { controllerId: 'body', stage: 'SENDING', bytesSent: 0, totalBytes: 100 },
      ),
      controllerStageColumn(
        { id: 'core', label: 'Core', glyph: 'C', isMaster: false },
        { controllerId: 'core', stage: 'SENDING', bytesSent: 54, totalBytes: 100 },
      ),
      controllerStageColumn({ id: 'dome', label: 'Dome', glyph: 'D', isMaster: false }, undefined),
    ];
    const wrapper = mount(AstrosFirmwareStagesBoard, {
      global: { plugins: [i18n()] },
      props: { columns },
    });
    expect(wrapper.findAll('.astros-firmware-stage-column')).toHaveLength(3);
    expect(wrapper.text()).toContain('STAGES');
  });
});

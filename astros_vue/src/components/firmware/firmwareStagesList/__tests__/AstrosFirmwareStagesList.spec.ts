import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import enUS from '@/locales/enUS.json';
import AstrosFirmwareStagesList from '../AstrosFirmwareStagesList.vue';

function createTestI18n() {
  return createI18n({
    legacy: false,
    locale: 'enUS',
    fallbackLocale: 'enUS',
    messages: { enUS },
  });
}

function mountList(props: {
  phase: 'flashing' | 'done' | 'failed';
  currentStage: 'download' | 'transfer' | 'flash' | 'verify' | 'reboot' | null;
  failedStage?: 'download' | 'transfer' | 'flash' | 'verify' | 'reboot' | null;
  downloadPercent?: number | null;
}) {
  return mount(AstrosFirmwareStagesList, {
    global: { plugins: [createTestI18n()] },
    props,
  });
}

describe('AstrosFirmwareStagesList — download percentage', () => {
  it('renders the percentage on the download row when current and a number is provided', () => {
    const wrapper = mountList({
      phase: 'flashing',
      currentStage: 'download',
      downloadPercent: 42,
    });
    const inProgress = wrapper.find('.astros-firmware-stages-list__in-progress');
    expect(inProgress.exists()).toBe(true);
    expect(inProgress.text()).toBe('42%');
  });

  it('falls back to the generic in-progress label when downloadPercent is null', () => {
    const wrapper = mountList({
      phase: 'flashing',
      currentStage: 'download',
      downloadPercent: null,
    });
    const inProgress = wrapper.find('.astros-firmware-stages-list__in-progress');
    // Locale string from firmware_view.stages.in_progress — exact text isn't
    // important, only that it's *not* the "%"-suffixed percentage form.
    expect(inProgress.exists()).toBe(true);
    expect(inProgress.text()).not.toMatch(/\d+%/);
  });

  it('falls back to the generic label when downloadPercent prop is omitted', () => {
    const wrapper = mountList({ phase: 'flashing', currentStage: 'download' });
    const inProgress = wrapper.find('.astros-firmware-stages-list__in-progress');
    expect(inProgress.exists()).toBe(true);
    expect(inProgress.text()).not.toMatch(/\d+%/);
  });

  it('does NOT render the percentage on a non-download current row', () => {
    // Even with downloadPercent populated, the % must only attach to the
    // download row — when the active stage is transfer/verify/etc., the
    // in-progress badge on that row is the generic label.
    const wrapper = mountList({
      phase: 'flashing',
      currentStage: 'transfer',
      downloadPercent: 42,
    });
    const inProgress = wrapper.find('.astros-firmware-stages-list__in-progress');
    expect(inProgress.exists()).toBe(true);
    expect(inProgress.text()).not.toMatch(/\d+%/);
  });

  it('renders 0% (not blank or fallback) when the download has just begun', () => {
    // bytesSent / totalBytes = 0 / N is a real state — first ack hasn't
    // landed. Operator sees "0%" rather than the generic in-progress text.
    const wrapper = mountList({
      phase: 'flashing',
      currentStage: 'download',
      downloadPercent: 0,
    });
    const inProgress = wrapper.find('.astros-firmware-stages-list__in-progress');
    expect(inProgress.text()).toBe('0%');
  });
});

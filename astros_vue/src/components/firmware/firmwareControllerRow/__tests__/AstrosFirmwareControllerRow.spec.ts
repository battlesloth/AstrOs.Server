import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import enUS from '@/locales/enUS.json';
import AstrosFirmwareControllerRow from '../AstrosFirmwareControllerRow.vue';
import type { FirmwareControllerView } from '@/types/firmware';

function createTestI18n() {
  return createI18n({
    legacy: false,
    locale: 'enUS',
    fallbackLocale: 'enUS',
    messages: { enUS },
  });
}

function mountRow(props: Record<string, unknown>) {
  return mount(AstrosFirmwareControllerRow, {
    props: props as never,
    global: { plugins: [createTestI18n()] },
  });
}

const upgradeController: FirmwareControllerView = {
  id: 'body',
  label: 'Body',
  glyph: 'B',
  isMaster: true,
  current: 'v1.3.0',
  status: 'up',
};

const downgradeController: FirmwareControllerView = {
  id: 'core',
  label: 'Core',
  glyph: 'C',
  isMaster: false,
  current: 'v1.4.0',
  status: 'up',
};

const offlineController: FirmwareControllerView = {
  id: 'dome',
  label: 'Dome',
  glyph: 'D',
  isMaster: false,
  current: 'v1.3.0',
  status: 'down',
};

describe('AstrosFirmwareControllerRow allow-downgrade interaction', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('disables the checkbox on downgrade when allowDowngrade is false (or omitted)', () => {
    const wrapper = mountRow({
      controller: downgradeController,
      target: 'v1.3.5', // downgrade
      mode: 'select',
      selected: false,
      // allowDowngrade omitted — defaults to falsy
    });
    const checkbox = wrapper.find('input[type="checkbox"]');
    expect(checkbox.attributes('disabled')).toBeDefined();
  });

  it('enables the checkbox on downgrade when allowDowngrade is true', () => {
    // Pin the opt-in: a regression that hard-coded `pillKind === 'downgrade'`
    // back into `blocked` (ignoring the prop) would re-disable the row.
    const wrapper = mountRow({
      controller: downgradeController,
      target: 'v1.3.5',
      mode: 'select',
      selected: false,
      allowDowngrade: true,
    });
    const checkbox = wrapper.find('input[type="checkbox"]');
    expect(checkbox.attributes('disabled')).toBeUndefined();
  });

  it('keeps the checkbox disabled on offline rows even when allowDowngrade is true', () => {
    // Hard-block (status === 'down') is reality, not policy; the toggle
    // must NOT override it. Pinning so a future "always selectable when
    // toggle on" mutation doesn't accidentally let operators try to flash
    // an unreachable controller.
    const wrapper = mountRow({
      controller: offlineController,
      target: 'v1.4.2',
      mode: 'select',
      selected: false,
      allowDowngrade: true,
    });
    const checkbox = wrapper.find('input[type="checkbox"]');
    expect(checkbox.attributes('disabled')).toBeDefined();
  });

  it('leaves the checkbox enabled on plain upgrade rows regardless of allowDowngrade', () => {
    const wrapper = mountRow({
      controller: upgradeController,
      target: 'v1.4.2',
      mode: 'select',
      selected: false,
      allowDowngrade: false,
    });
    const checkbox = wrapper.find('input[type="checkbox"]');
    expect(checkbox.attributes('disabled')).toBeUndefined();
  });
});

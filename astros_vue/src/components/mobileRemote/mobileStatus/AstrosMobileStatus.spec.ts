import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import AstrosMobileStatus from './AstrosMobileStatus.vue';
import { ControllerStatus } from '@/enums';
import enUS from '@/locales/enUS.json';

const i18n = createI18n({ legacy: false, locale: 'en-US', messages: { 'en-US': enUS } });

function render(props: {
  domeStatus: ControllerStatus;
  coreStatus: ControllerStatus;
  bodyStatus: ControllerStatus;
}) {
  return mount(AstrosMobileStatus, { props, global: { plugins: [i18n] } });
}

describe('AstrosMobileStatus', () => {
  it('renders a legend row per location with the localized status text', () => {
    const wrapper = render({
      domeStatus: ControllerStatus.UP,
      coreStatus: ControllerStatus.NEEDS_SYNCED,
      bodyStatus: ControllerStatus.DOWN,
    });
    const statuses = wrapper.findAll('.astros-mobile-status__legend-status').map((n) => n.text());
    // Order is dome, core, body (top-to-bottom of the droid).
    expect(statuses).toEqual(['Online', 'Needs sync', 'Offline']);
  });

  it('uses the firmware-incompatible label', () => {
    const wrapper = render({
      domeStatus: ControllerStatus.FIRMWARE_INCOMPATIBLE,
      coreStatus: ControllerStatus.UP,
      bodyStatus: ControllerStatus.UP,
    });
    expect(wrapper.find('.astros-mobile-status__legend-status').text()).toBe(
      'Firmware out of date',
    );
  });

  it('colors each legend dot by status (UP → green)', () => {
    const wrapper = render({
      domeStatus: ControllerStatus.UP,
      coreStatus: ControllerStatus.UP,
      bodyStatus: ControllerStatus.UP,
    });
    const dot = wrapper.find('.astros-mobile-status__legend-dot');
    // jsdom normalizes the #3aa676 hex to rgb. A missing STATUS_COLOR entry
    // would leave no background — this pins the map is exhaustive for UP.
    expect(dot.attributes('style')).toContain('rgb(58, 166, 118)');
  });

  it('emits logout when the logout button is clicked', async () => {
    const wrapper = render({
      domeStatus: ControllerStatus.UP,
      coreStatus: ControllerStatus.UP,
      bodyStatus: ControllerStatus.UP,
    });
    await wrapper.find('.astros-mobile-status__logout').trigger('click');
    expect(wrapper.emitted('logout')).toHaveLength(1);
  });
});

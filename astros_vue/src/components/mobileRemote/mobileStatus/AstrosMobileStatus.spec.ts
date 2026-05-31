import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import AstrosMobileStatus from './AstrosMobileStatus.vue';
import AstrosStatus from '@/components/status/AstrosStatus.vue';
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
  it('renders the droid status image with the per-location statuses', () => {
    const wrapper = render({
      domeStatus: ControllerStatus.UP,
      coreStatus: ControllerStatus.NEEDS_SYNCED,
      bodyStatus: ControllerStatus.DOWN,
    });
    const droid = wrapper.findComponent(AstrosStatus);
    expect(droid.exists()).toBe(true);
    expect(droid.props()).toMatchObject({
      domeStatus: ControllerStatus.UP,
      coreStatus: ControllerStatus.NEEDS_SYNCED,
      bodyStatus: ControllerStatus.DOWN,
    });
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

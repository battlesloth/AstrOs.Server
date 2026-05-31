import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import AstrosMobileTopBar from './AstrosMobileTopBar.vue';
import type { MobileScreen } from './types';
import enUS from '@/locales/enUS.json';

const i18n = createI18n({ legacy: false, locale: 'en-US', messages: { 'en-US': enUS } });

function render(props: { connected: boolean; screen: MobileScreen }) {
  return mount(AstrosMobileTopBar, { props, global: { plugins: [i18n] } });
}

describe('AstrosMobileTopBar', () => {
  it('shows the connection status and green styling when connected on the remote screen', () => {
    const wrapper = render({ connected: true, screen: 'remote' });
    const btn = wrapper.find('.astros-mobile-top-bar__toggle');
    expect(btn.text()).toContain('Connected');
    expect(btn.classes()).toContain('astros-mobile-top-bar__toggle--connected');
  });

  it('shows offline + red styling when disconnected on the remote screen', () => {
    const wrapper = render({ connected: false, screen: 'remote' });
    const btn = wrapper.find('.astros-mobile-top-bar__toggle');
    expect(btn.text()).toContain('Offline');
    expect(btn.classes()).toContain('astros-mobile-top-bar__toggle--offline');
  });

  it('reads "Remote" on the status screen but keeps the connection color', () => {
    const wrapper = render({ connected: true, screen: 'status' });
    const btn = wrapper.find('.astros-mobile-top-bar__toggle');
    expect(btn.text()).toContain('Remote');
    // Color still reflects connection, not the screen.
    expect(btn.classes()).toContain('astros-mobile-top-bar__toggle--connected');
  });

  it('emits toggle when tapped', async () => {
    const wrapper = render({ connected: true, screen: 'remote' });
    await wrapper.find('.astros-mobile-top-bar__toggle').trigger('click');
    expect(wrapper.emitted('toggle')).toHaveLength(1);
  });
});

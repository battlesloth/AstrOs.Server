import { describe, it, expect } from 'vitest';
import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach } from 'vitest';
import { createI18n } from 'vue-i18n';
import enUS from '@/locales/enUS.json';
import AstrosIncompatibleDatabaseNotice from '@/components/common/incompatibleDatabase/AstrosIncompatibleDatabaseNotice.vue';

enableAutoUnmount(afterEach);

function mountNotice() {
  return mount(AstrosIncompatibleDatabaseNotice, {
    attachTo: document.body,
    global: {
      plugins: [
        createI18n({ legacy: false, locale: 'enUS', fallbackLocale: 'enUS', messages: { enUS } }),
      ],
    },
  });
}

describe('AstrosIncompatibleDatabaseNotice', () => {
  it('renders a main landmark with one heading, the message as an alert, and the action line', () => {
    const wrapper = mountNotice();
    const copy = enUS.systemStatus.incompatibleDatabase;

    expect(wrapper.findAll('main')).toHaveLength(1);
    const headings = wrapper.findAll('h1');
    expect(headings).toHaveLength(1);
    expect(headings[0]!.text()).toBe(copy.title);
    expect(wrapper.get('[role="alert"]').text()).toBe(copy.message);
    expect(wrapper.text()).toContain(copy.action);
  });

  it('offers no navigation or controls', () => {
    // Every API route but GET /system/status answers 503: there is nothing
    // to do from this page.
    const wrapper = mountNotice();

    expect(wrapper.findAll('nav, a, button, input, select, textarea')).toHaveLength(0);
    const tabbable = wrapper
      .findAll('[tabindex]')
      .filter((el) => Number(el.attributes('tabindex')) >= 0);
    expect(tabbable).toHaveLength(0);
  });

  it('moves focus to the heading when it appears', () => {
    // It always replaces content after the first paint (the status fetch, a
    // 503 or the WS push), so focus would otherwise stay on the old page.
    const wrapper = mountNotice();

    expect(document.activeElement).toBe(wrapper.get('h1').element);
  });
});

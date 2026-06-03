import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import AstrosFirmwareVersionDelta from '../AstrosFirmwareVersionDelta.vue';

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: {
    'en-US': {
      firmware_view: {
        controllers: {
          up_to_date_suffix: '· up to date',
          downgrade_pill: 'DOWNGRADE',
        },
      },
    },
  },
});

function render(current: string, target: string | null) {
  return mount(AstrosFirmwareVersionDelta, {
    props: { current, target },
    global: { plugins: [i18n] },
  });
}

describe('AstrosFirmwareVersionDelta', () => {
  it('renders the up-to-date suffix when target is null', () => {
    const w = render('v1.4.0', null);
    expect(w.text()).toContain('v1.4.0');
    expect(w.text()).toContain('up to date');
    expect(w.text()).not.toContain('→');
  });

  it('renders the up-to-date suffix when current equals target', () => {
    const w = render('v1.4.2', 'v1.4.2');
    expect(w.text()).toContain('up to date');
    expect(w.text()).not.toContain('→');
  });

  it('renders a from → to arrow on upgrade with no downgrade pill', () => {
    const w = render('v1.3.0', 'v1.4.2');
    expect(w.text()).toContain('v1.3.0');
    expect(w.text()).toContain('v1.4.2');
    expect(w.text()).toContain('→');
    expect(w.text()).not.toContain('DOWNGRADE');
    expect(w.classes()).not.toContain('is-downgrade');
  });

  it('renders the downgrade pill and is-downgrade class on downgrade', () => {
    const w = render('v1.4.2', 'v1.3.0');
    expect(w.text()).toContain('DOWNGRADE');
    expect(w.classes()).toContain('is-downgrade');
  });

  it('renders neither downgrade pill nor up-to-date suffix when current is malformed', () => {
    // NaN guard: compareTags returns NaN; we must NOT silently classify as
    // upgrade or downgrade. The component shows the bare from → to.
    const w = render('not-a-version', 'v1.4.2');
    expect(w.text()).toContain('not-a-version');
    expect(w.text()).toContain('v1.4.2');
    expect(w.text()).toContain('→');
    expect(w.text()).not.toContain('DOWNGRADE');
    expect(w.classes()).not.toContain('is-downgrade');
  });
});

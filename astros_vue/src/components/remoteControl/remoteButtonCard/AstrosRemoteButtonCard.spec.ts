import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import AstrosRemoteButtonCard from './AstrosRemoteButtonCard.vue';
import type { PageButton } from '@/models/remoteControl/pageButton';
import enUS from '@/locales/enUS.json';

// Use the real enUS.json so any missing key surfaces as a test failure.
const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: { 'en-US': enUS },
});

function mkNone(): PageButton {
  return { id: '0', name: 'None', type: 'none' };
}
function mkScript(): PageButton {
  return { id: 's1', name: 'Wave Hello', type: 'script' };
}
function mkPlaylist(): PageButton {
  return { id: 'p1', name: 'Morning Routine', type: 'playlist' };
}

function mountCard(value: PageButton) {
  return mount(AstrosRemoteButtonCard, {
    global: { plugins: [i18n] },
    props: { value },
  });
}

describe('AstrosRemoteButtonCard — display state', () => {
  it('shows a Configure button when value.type is none', () => {
    const wrapper = mountCard(mkNone());
    expect(wrapper.find('[data-testid="card-configure"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="card-edit"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="card-clear"]').exists()).toBe(false);
  });

  it('shows assigned name and Edit/Clear buttons when value is a script', () => {
    const wrapper = mountCard(mkScript());
    expect(wrapper.text()).toContain('Wave Hello');
    expect(wrapper.find('[data-testid="card-edit"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="card-clear"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="card-configure"]').exists()).toBe(false);
  });

  it('renders a SCRIPT type chip on a script-typed value', () => {
    const wrapper = mountCard(mkScript());
    const chip = wrapper.find('[data-testid="card-type-chip"]');
    expect(chip.exists()).toBe(true);
    expect(chip.text()).toMatch(/SCRIPT/i);
  });

  it('renders a PLAYLIST type chip on a playlist-typed value', () => {
    const wrapper = mountCard(mkPlaylist());
    const chip = wrapper.find('[data-testid="card-type-chip"]');
    expect(chip.text()).toMatch(/PLAYLIST/i);
  });

  it('reactively switches from unassigned to assigned display when value prop changes', async () => {
    const wrapper = mountCard(mkNone());
    // Pre-assert both the Configure-visible AND chip-absent baseline so a
    // regression that renders the chip unconditionally would surface here.
    expect(wrapper.find('[data-testid="card-configure"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="card-type-chip"]').exists()).toBe(false);

    await wrapper.setProps({ value: mkScript() });

    expect(wrapper.find('[data-testid="card-configure"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="card-edit"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="card-type-chip"]').text()).toMatch(/SCRIPT/i);
    expect(wrapper.text()).toContain('Wave Hello');
  });
});

describe('AstrosRemoteButtonCard — emits (editor is a view-owned modal)', () => {
  it('emits edit (no change) when Configure is clicked on an unassigned card', async () => {
    const wrapper = mountCard(mkNone());
    await wrapper.get('[data-testid="card-configure"]').trigger('click');

    expect(wrapper.emitted('edit')).toHaveLength(1);
    expect(wrapper.emitted('change')).toBeUndefined();
  });

  it('emits edit when Edit is clicked on an assigned card', async () => {
    const wrapper = mountCard(mkScript());
    await wrapper.get('[data-testid="card-edit"]').trigger('click');

    expect(wrapper.emitted('edit')).toHaveLength(1);
  });

  it('Clear emits change with the none sentinel and does NOT emit edit', async () => {
    const wrapper = mountCard(mkScript());
    await wrapper.get('[data-testid="card-clear"]').trigger('click');

    expect(wrapper.emitted('change')![0]![0]).toEqual({ id: '0', name: 'None', type: 'none' });
    expect(wrapper.emitted('edit')).toBeUndefined();
  });

  it('Clear emits a FRESH none-button object on each click (no shared identity across clicks)', async () => {
    // Anti-regression for the shared-NONE_BUTTON-sentinel hazard. If both
    // emits returned the same module-level const, an in-place mutation by
    // any downstream consumer (`page.button1.name = 'X'` — a documented
    // pattern in the store spec) would poison every other slot whose value
    // came from the same sentinel.
    const wrapper = mountCard(mkScript());

    await wrapper.get('[data-testid="card-clear"]').trigger('click');
    await wrapper.setProps({ value: mkPlaylist() });
    await wrapper.get('[data-testid="card-clear"]').trigger('click');

    const events = wrapper.emitted('change');
    expect(events).toHaveLength(2);
    const first = events![0]![0];
    const second = events![1]![0];
    expect(first).toEqual(second);
    expect(first).not.toBe(second);
  });
});

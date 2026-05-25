import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import AstrosRemoteLivePreview from './AstrosRemoteLivePreview.vue';
import type { RemoteControlPage } from '@/models/remoteControl/remoteControlPage';
import { makeNoneButton } from '@/models/remoteControl/pageButton';
import enUS from '@/locales/enUS.json';

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: { 'en-US': enUS },
});

function mkPage(id: string, name: string): RemoteControlPage {
  return {
    id,
    name,
    button1: makeNoneButton(),
    button2: makeNoneButton(),
    button3: makeNoneButton(),
    button4: makeNoneButton(),
    button5: makeNoneButton(),
    button6: makeNoneButton(),
    button7: makeNoneButton(),
    button8: makeNoneButton(),
    button9: makeNoneButton(),
  };
}

const PAGES_3 = [mkPage('a', 'Quick Actions'), mkPage('b', 'Performance'), mkPage('c', 'Songs')];

function mountPreview(props: { pages: RemoteControlPage[]; selectedIdx: number }) {
  return mount(AstrosRemoteLivePreview, {
    global: { plugins: [i18n], stubs: { 'v-icon': true } },
    props,
  });
}

describe('AstrosRemoteLivePreview — bezel + mobile remote embedding', () => {
  it('renders the bezel container with the labelled region', () => {
    const wrapper = mountPreview({ pages: PAGES_3, selectedIdx: 0 });
    const bezel = wrapper.get('[data-testid="preview-bezel"]');
    expect(bezel.attributes('aria-label')).toBe('Live preview');
  });

  it('embeds the AstrosMobileRemote component with the passed pages and selectedIdx', () => {
    const wrapper = mountPreview({ pages: PAGES_3, selectedIdx: 1 });
    const remote = wrapper.findComponent({ name: 'AstrosMobileRemote' });
    expect(remote.exists()).toBe(true);
    expect(remote.props('pages')).toEqual(PAGES_3);
    expect(remote.props('initialIdx')).toBe(1);
  });

  it('passes compact=true so the embedded remote renders in the smaller layout', () => {
    const wrapper = mountPreview({ pages: PAGES_3, selectedIdx: 0 });
    const remote = wrapper.findComponent({ name: 'AstrosMobileRemote' });
    expect(remote.props('compact')).toBe(true);
  });

  it('passes connected=true so the editor preview always shows the Connected chip', () => {
    // Decision: the editor preview is decorative; live WS state is Phase 4 (mobile route).
    const wrapper = mountPreview({ pages: PAGES_3, selectedIdx: 0 });
    const remote = wrapper.findComponent({ name: 'AstrosMobileRemote' });
    expect(remote.props('connected')).toBe(true);
  });

  it('passes navigable=false so the preview cannot drift off selectedIdx', () => {
    // The embedded remote's pagination + swipe handlers would otherwise let
    // a user navigate the preview independently of the editor's page list,
    // making the right rail show a different page from the selected row.
    const wrapper = mountPreview({ pages: PAGES_3, selectedIdx: 0 });
    const remote = wrapper.findComponent({ name: 'AstrosMobileRemote' });
    expect(remote.props('navigable')).toBe(false);
  });

  it('reseats the embedded remote when selectedIdx prop changes', async () => {
    const wrapper = mountPreview({ pages: PAGES_3, selectedIdx: 0 });
    await wrapper.setProps({ selectedIdx: 2 });
    const remote = wrapper.findComponent({ name: 'AstrosMobileRemote' });
    expect(remote.props('initialIdx')).toBe(2);
  });

  it('does not forward press events out (Decision 1: read-only)', async () => {
    const wrapper = mountPreview({ pages: PAGES_3, selectedIdx: 0 });
    const remote = wrapper.findComponent({ name: 'AstrosMobileRemote' });
    // Emit a press from the child; assert the wrapper does not re-emit.
    await remote.vm.$emit('press', { id: 's1', name: 'Wave', type: 'script' });
    expect(wrapper.emitted()).toEqual({});
  });

  it('does not forward panic events out (Decision 1: read-only)', async () => {
    const wrapper = mountPreview({ pages: PAGES_3, selectedIdx: 0 });
    const remote = wrapper.findComponent({ name: 'AstrosMobileRemote' });
    await remote.vm.$emit('panic');
    expect(wrapper.emitted()).toEqual({});
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import AstrosMobileRemote from './AstrosMobileRemote.vue';
import type { AstrosMobileRemotePressEvent } from './types';
import type { RemoteControlPage } from '@/models/remoteControl/remoteControlPage';
import type { PageButton } from '@/models/remoteControl/pageButton';
import enUS from '@/locales/enUS.json';

// The component drives press-flash, press-toast, panic-toast, and the
// useHoldGesture arm/cooldown timers via setTimeout. Drive time
// deterministically so the assertions don't depend on real-time variance.
beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// Use the real enUS.json so a future locale-key rename (and any matching
// component template miss) surfaces as a test failure instead of silently
// passing on a duplicated copy.
const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: { 'en-US': enUS },
});

function emptyButton(): PageButton {
  return { id: '0', name: 'None', type: 'none' };
}

function scriptButton(id: string, name: string): PageButton {
  return { id, name, type: 'script' };
}

function pageWith(id: string, name: string, button1: PageButton): RemoteControlPage {
  return {
    id,
    name,
    button1,
    button2: emptyButton(),
    button3: emptyButton(),
    button4: emptyButton(),
    button5: emptyButton(),
    button6: emptyButton(),
    button7: emptyButton(),
    button8: emptyButton(),
    button9: emptyButton(),
  };
}

function render(props: {
  pages: RemoteControlPage[];
  initialIdx?: number;
  compact?: boolean;
  connected?: boolean;
}) {
  return mount(AstrosMobileRemote, {
    props,
    global: {
      plugins: [i18n],
      // oh-vue-icons is registered in main.ts; tests don't bootstrap it,
      // so stub <v-icon> to a marker span. The icon itself is decorative
      // (aria-hidden) so the stub has no behavioral impact.
      stubs: { 'v-icon': { template: '<span data-stub="v-icon"></span>' } },
    },
  });
}

describe('AstrosMobileRemote', () => {
  it('suppresses button presses while the panic gesture is in the active lockout', async () => {
    // Safety contract: once STOP ALL fires, normal button presses must NOT
    // emit during the 2.2s cooldown. A regression that flips the guard
    // (e.g., to `=== 'arming'`) or drops it would let an operator fire
    // scripts during the panic lockout — exactly what the lockout exists
    // to prevent.
    const wrapper = render({
      pages: [pageWith('p1', 'Greetings', scriptButton('script-wave', 'Wave Hello'))],
    });

    const panic = wrapper.find('.astros-mobile-remote__panic');
    await panic.trigger('mousedown');
    vi.advanceTimersByTime(600);
    await flushPromises();
    // Now in 'active' state.

    await wrapper.find('.astros-mobile-remote__slot--filled').trigger('click');
    expect(wrapper.emitted('press')).toBeUndefined();
  });

  it('press-path timers are cleared on unmount before they fire', async () => {
    // Vacuous-fix guard — verified mechanically by reverting each clearX()
    // call in onBeforeUnmount and confirming this test fails. Vue 3 does
    // NOT warn on post-unmount ref writes (the ref persists in closure),
    // so a console.warn assertion would be vacuous. Instead count pending
    // fake timers directly: after unmount with all clears in place, the
    // pre-unmount-pending press-path timers must be gone.
    //
    // This test fails under either mutation:
    //   (a) Drop clearPressTimer() from onBeforeUnmount → pressClearTimer
    //       (220ms) is still pending at unmount → count >= 1.
    //   (b) Drop clearToast() from onBeforeUnmount → the showToast-owned
    //       toast timer (1600ms) is still pending at unmount → count >= 1.
    const wrapper = render({
      pages: [pageWith('p1', 'Greetings', scriptButton('script-wave', 'Wave Hello'))],
    });
    // Snapshot baseline so future watchers / debounces in the mount path
    // don't silently inflate the delta and mask a real leak.
    const baseline = vi.getTimerCount();
    await wrapper.find('.astros-mobile-remote__slot--filled').trigger('click');
    await flushPromises();
    // Both press timers are scheduled and not yet fired (pressClearTimer
    // would fire at T=220ms, toastClearTimer at T=1600ms).
    expect(vi.getTimerCount() - baseline).toBe(2);

    wrapper.unmount();
    expect(vi.getTimerCount()).toBe(baseline);
  });

  it('panic-path timers are cleared on unmount before they fire', async () => {
    // Companion to the press-path test. Drives the panic gesture into the
    // 'active' state so the showToast-owned toast timer (1.8s) and the
    // composable's cooldownTimer (2.2s) are both pending at unmount.
    //
    // This test fails under the mutation:
    //   (c) Drop clearToast() from onBeforeUnmount → the showToast-owned
    //       toast timer (set to 1800ms by panic onFire) still pending
    //       after unmount → count >= 1.
    //   It also re-verifies useHoldGesture.onScopeDispose: dropping the
    //   onScopeDispose hook in the composable leaves cooldownTimer
    //   pending → count >= 1.
    const wrapper = render({
      pages: [pageWith('p1', 'Greetings', scriptButton('script-wave', 'Wave Hello'))],
    });
    const baseline = vi.getTimerCount();
    await wrapper.find('.astros-mobile-remote__panic').trigger('mousedown');
    vi.advanceTimersByTime(600);
    await flushPromises();
    // Now active: toast timer (1800ms remaining) + cooldownTimer
    // (2200ms remaining) are pending.
    expect(vi.getTimerCount() - baseline).toBe(2);

    wrapper.unmount();
    expect(vi.getTimerCount()).toBe(baseline);
  });

  it('panic onFire cancels the in-flight press toast so it does not clear the panic toast early', async () => {
    // The press toast (1.6s lifetime) and panic toast (1.8s lifetime) share
    // one DOM slot. If the press timer is not cancelled when panic fires,
    // the press-toast clear at T=1600ms nulls the panic toast 1000ms early.
    const wrapper = render({
      pages: [pageWith('p1', 'Greetings', scriptButton('script-wave', 'Wave Hello'))],
    });

    // T=0: press.
    await wrapper.find('.astros-mobile-remote__slot--filled').trigger('click');
    await flushPromises();
    expect(wrapper.find('.astros-mobile-remote__toast').text()).toBe('Sent: Wave Hello');

    // T=200ms: begin panic arming.
    vi.advanceTimersByTime(200);
    await wrapper.find('.astros-mobile-remote__panic').trigger('mousedown');

    // T=800ms: panic fires; onFire calls showToast which implicitly cancels
    // the in-flight press-toast timer and schedules the panic-toast clear
    // 1800ms out. Press toast WOULD have cleared at T=1600ms.
    vi.advanceTimersByTime(600);
    await flushPromises();
    expect(wrapper.find('.astros-mobile-remote__toast').text()).toBe('STOP ALL — sending…');

    // T=1601ms (past the press toast's original clear time). Without
    // showToast's implicit cancel of the in-flight press timer, the panic
    // toast would now be null.
    vi.advanceTimersByTime(801);
    await flushPromises();
    expect(wrapper.find('.astros-mobile-remote__toast').text()).toBe('STOP ALL — sending…');
  });

  it('emit("press") narrows to FilledPageButton — never includes type: "none"', async () => {
    // Pins the emit-shape contract that Phase 4 will switch on. A
    // regression that weakens the !isFilledPageButton early-return in
    // handlePress would let an empty slot leak into the emit payload.
    const wrapper = render({
      pages: [pageWith('p1', 'Greetings', scriptButton('script-wave', 'Wave Hello'))],
    });

    // Click the filled button.
    await wrapper.find('.astros-mobile-remote__slot--filled').trigger('click');
    await flushPromises();

    const emitted = wrapper.emitted('press');
    expect(emitted).toHaveLength(1);
    const payload = emitted![0]![0] as AstrosMobileRemotePressEvent;
    expect(payload.type).not.toBe('none');
    expect(payload).toMatchObject({
      id: 'script-wave',
      name: 'Wave Hello',
      type: 'script',
    });

    // Empty slots are disabled at the button level, so a click on one
    // can't even reach handlePress — but verify the disabled attribute
    // is set so a future template change doesn't quietly enable them.
    const emptyButtons = wrapper.findAll(
      '.astros-mobile-remote__slot:not(.astros-mobile-remote__slot--filled)',
    );
    expect(emptyButtons.length).toBeGreaterThan(0);
    for (const b of emptyButtons) {
      expect(b.attributes('disabled')).toBeDefined();
    }
  });

  it('clamps an out-of-range initialIdx at mount so pagination UI does not lie', async () => {
    // Without the init-time clamp, the pagination header would render
    // "11 / 3" and the next button would be enabled-but-no-op when a
    // parent passes initialIdx beyond pages.length-1.
    const pages = [
      pageWith('p1', 'Greetings', scriptButton('a', 'A')),
      pageWith('p2', 'Performance', scriptButton('b', 'B')),
      pageWith('p3', 'Idle', scriptButton('c', 'C')),
    ];
    const wrapper = render({ pages, initialIdx: 10 });
    await flushPromises();

    // Pagination header reads "3 / 3" (clamped to last valid index).
    expect(wrapper.find('.astros-mobile-remote__page-pagination').text()).toBe('3 / 3');

    // Next button disabled (at last page), prev enabled.
    const navs = wrapper.findAll('.astros-mobile-remote__page-nav');
    expect(navs).toHaveLength(2);
    expect(navs[0]!.attributes('disabled')).toBeUndefined();
    expect(navs[1]!.attributes('disabled')).toBeDefined();

    // The displayed page is the last one in the array.
    expect(wrapper.find('.astros-mobile-remote__page-name').text()).toBe('Idle');
  });

  it('reseats the displayed page when the parent updates initialIdx after mount', async () => {
    // Vacuous-fix guard: removing the `watch(() => props.initialIdx, ...)`
    // block makes this test fail. The read-time currentIdx clamp does NOT
    // mask the regression here because clampIdx only fires when idx.value
    // itself changes — without the watcher, an in-range initialIdx update
    // is silently ignored.
    const pages = [
      pageWith('p1', 'Greetings', scriptButton('a', 'A')),
      pageWith('p2', 'Performance', scriptButton('b', 'B')),
      pageWith('p3', 'Idle', scriptButton('c', 'C')),
    ];
    const wrapper = render({ pages, initialIdx: 0 });
    await flushPromises();
    expect(wrapper.find('.astros-mobile-remote__page-name').text()).toBe('Greetings');

    await wrapper.setProps({ initialIdx: 2 });
    await flushPromises();
    expect(wrapper.find('.astros-mobile-remote__page-name').text()).toBe('Idle');
    expect(wrapper.find('.astros-mobile-remote__page-pagination').text()).toBe('3 / 3');
  });

  it('settles idx after a shrink so a subsequent grow-back does not teleport the user to a stale page', async () => {
    // Vacuous-fix guard for the pages.length watcher. The read-time
    // currentIdx clamp masks the shrink itself (rendering looks fine
    // either way), but the watcher's load-bearing job is to mutate
    // idx.value so a later grow-back doesn't reveal the stale raw
    // index. Without the watcher, the shrink-then-grow sequence below
    // jumps the user back to page 3 (idx stayed at 2) instead of
    // staying on page 1 (idx settled to 0 by the watcher).
    const all = [
      pageWith('p1', 'Greetings', scriptButton('a', 'A')),
      pageWith('p2', 'Performance', scriptButton('b', 'B')),
      pageWith('p3', 'Idle', scriptButton('c', 'C')),
    ];
    const wrapper = render({ pages: all, initialIdx: 2 });
    await flushPromises();
    expect(wrapper.find('.astros-mobile-remote__page-name').text()).toBe('Idle');

    // Shrink: only the first page remains.
    await wrapper.setProps({ pages: all.slice(0, 1) });
    await flushPromises();
    expect(wrapper.find('.astros-mobile-remote__page-name').text()).toBe('Greetings');

    // Grow back to all three. With the watcher, idx is now 0 (settled
    // during the shrink), so the user stays on the first page. Without
    // the watcher, idx is still 2 and we teleport back to "Idle".
    await wrapper.setProps({ pages: all });
    await flushPromises();
    expect(wrapper.find('.astros-mobile-remote__page-name').text()).toBe('Greetings');
    expect(wrapper.find('.astros-mobile-remote__page-pagination').text()).toBe('1 / 3');
  });
});

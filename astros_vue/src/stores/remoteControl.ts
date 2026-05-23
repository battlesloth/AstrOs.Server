import apiService from '@/api/apiService';
import { REMOTE_CONFIG } from '@/api/endpoints';
import type { RemoteControlPage } from '@/models';
import { BUTTON_KEYS, type ButtonKey } from '@/models/remoteControl/remoteControlPage';
import type { PageButton, PageButtonType } from '@/models/remoteControl/pageButton';
import { defineStore } from 'pinia';
import { ref } from 'vue';

function defaultButton(name: string): PageButton {
  return { id: '0', name, type: 'none' };
}

function defaultPageName(idx: number): string {
  return `Page ${idx + 1}`;
}

export function createDefaultPage(idx: number): RemoteControlPage {
  return {
    id: crypto.randomUUID(),
    name: defaultPageName(idx),
    button1: defaultButton('Button 1'),
    button2: defaultButton('Button 2'),
    button3: defaultButton('Button 3'),
    button4: defaultButton('Button 4'),
    button5: defaultButton('Button 5'),
    button6: defaultButton('Button 6'),
    button7: defaultButton('Button 7'),
    button8: defaultButton('Button 8'),
    button9: defaultButton('Button 9'),
  };
}

function isPageButtonType(type: unknown): type is PageButtonType {
  return type === 'none' || type === 'script' || type === 'playlist';
}

function migrateButton(
  btn: Pick<PageButton, 'id' | 'name'> & { type?: PageButtonType },
): PageButton {
  if (isPageButtonType(btn.type)) return btn as PageButton;
  const type: PageButtonType = btn.id === '0' ? 'none' : 'script';
  return { ...btn, type };
}

function isPageButtonShape(raw: unknown): raw is Pick<PageButton, 'id' | 'name'> {
  // `Partial<RemoteControlPage>` is a TypeScript fiction here — the value comes
  // from JSON.parse of stored config and could be anything. Validate per-slot
  // before letting it reach migrateButton, which spreads `{...btn, type}` — a
  // string slot would otherwise produce `{0:'a',1:'b',..., type:'script'}` and
  // a no-`name` slot would surface `undefined` to remote consumers — dropped
  // by JSON.stringify on the wire, breaking the {name, command} sync contract.
  if (typeof raw !== 'object' || raw === null) return false;
  const candidate = raw as Partial<PageButton>;
  return typeof candidate.id === 'string' && typeof candidate.name === 'string';
}

export function migratePage(page: Partial<RemoteControlPage>, idx: number): RemoteControlPage {
  const migrated = {
    id: typeof page.id === 'string' ? page.id : crypto.randomUUID(),
    name: typeof page.name === 'string' ? page.name : defaultPageName(idx),
  } as RemoteControlPage;
  for (const key of BUTTON_KEYS) {
    const raw = page[key];
    if (isPageButtonShape(raw)) {
      migrated[key] = migrateButton(raw);
    } else {
      // Surface the substitution so a user-reported "my Page N slot reset
      // itself" complaint has a DevTools breadcrumb. The user-facing behavior
      // stays silent-degrade (no toast); this is for diagnosis only.
      console.warn(
        `[remoteControl] migratePage: page ${idx + 1} slot "${key}" had malformed shape; replaced with default. raw:`,
        raw,
      );
      migrated[key] = defaultButton('None');
    }
  }
  return migrated;
}

export const useRemoteControlStore = defineStore('remoteControl', () => {
  const remoteControlPages = ref<RemoteControlPage[]>([]);
  const isLoading = ref(false);
  const isDirty = ref(false);
  const selectedIdx = ref(0);

  async function loadRemoteControl() {
    isLoading.value = true;
    try {
      const response = (await apiService.get(REMOTE_CONFIG)) as string;

      const result = JSON.parse(response) as Partial<RemoteControlPage>[];

      if (!Array.isArray(result)) {
        isLoading.value = false;
        throw new Error('No remote control configuration found');
      }

      const isFreshSeed = result.length === 0;
      remoteControlPages.value = isFreshSeed
        ? [createDefaultPage(0)]
        : result.map((page, idx) => migratePage(page, idx));
      // When we seed a default page because the server had nothing stored, the
      // seeded page is NOT yet persisted — flag it dirty so the Save button
      // lights up and the user explicitly opts in. Before the all-empty save
      // filter was removed, this case was protected by the filter dropping the
      // seeded default on save; without that filter, clicking Save without
      // dirtying first would have silently written a random-UUID page the user
      // never authored.
      isDirty.value = isFreshSeed;
      selectedIdx.value = 0;
      isLoading.value = false;
      return { success: true, data: result };
    } catch (error) {
      console.error('Failed to load remote control configuration:', error);
      isLoading.value = false;
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  function selectPage(idx: number) {
    if (!Number.isInteger(idx)) {
      // NaN, fractional, or Infinity — typically a UI bug computing idx from
      // a stale/missing ref. Clamp to 0 so the store stays in a valid state
      // (otherwise selectedIdx becomes NaN and pages[selectedIdx] is always
      // undefined for the rest of the session).
      selectedIdx.value = 0;
      return;
    }
    if (remoteControlPages.value.length === 0) {
      selectedIdx.value = 0;
      return;
    }
    const lastIdx = remoteControlPages.value.length - 1;
    selectedIdx.value = Math.min(Math.max(idx, 0), lastIdx);
  }

  function addPage() {
    const newIdx = remoteControlPages.value.length;
    remoteControlPages.value.push(createDefaultPage(newIdx));
    selectedIdx.value = newIdx;
    isDirty.value = true;
  }

  function renamePage(idx: number, name: string): boolean {
    if (!Number.isInteger(idx)) {
      console.warn(
        `[remoteControl] renamePage: idx ${idx} is not a valid integer (pages: ${remoteControlPages.value.length})`,
      );
      return false;
    }
    const target = remoteControlPages.value[idx];
    if (!target) {
      console.warn(
        `[remoteControl] renamePage: idx ${idx} out of range (pages: ${remoteControlPages.value.length})`,
      );
      return false;
    }
    const trimmed = name.trim();
    if (trimmed.length === 0) return false;
    target.name = trimmed;
    isDirty.value = true;
    return true;
  }

  function deletePage(idx: number) {
    if (remoteControlPages.value.length <= 1) return;
    if (!Number.isInteger(idx) || idx < 0 || idx >= remoteControlPages.value.length) {
      // The Number.isInteger check covers NaN and fractional idx — both slip
      // past the comparison-based guard (NaN comparisons all return false,
      // fractional idx truncates inside splice and would silently delete the
      // wrong page).
      console.warn(
        `[remoteControl] deletePage: idx ${idx} out of range (pages: ${remoteControlPages.value.length})`,
      );
      return;
    }
    remoteControlPages.value.splice(idx, 1);
    if (selectedIdx.value > idx) {
      selectedIdx.value -= 1;
    } else if (selectedIdx.value === idx) {
      // The selected page itself was deleted — move back to the previous
      // sibling so the user's mental position is preserved. Stays at 0 when
      // there's nothing further back.
      selectedIdx.value = Math.max(idx - 1, 0);
    }
    isDirty.value = true;
  }

  function duplicatePage(idx: number) {
    if (!Number.isInteger(idx)) {
      console.warn(
        `[remoteControl] duplicatePage: idx ${idx} is not a valid integer (pages: ${remoteControlPages.value.length})`,
      );
      return;
    }
    const src = remoteControlPages.value[idx];
    if (!src) {
      console.warn(
        `[remoteControl] duplicatePage: idx ${idx} out of range (pages: ${remoteControlPages.value.length})`,
      );
      return;
    }
    const copy: RemoteControlPage = {
      ...src,
      id: crypto.randomUUID(),
      name: `${src.name} (copy)`,
    };
    for (const key of BUTTON_KEYS) {
      copy[key] = { ...src[key] };
    }
    remoteControlPages.value.splice(idx + 1, 0, copy);
    selectedIdx.value = idx + 1;
    isDirty.value = true;
  }

  function setButton(slotIdx: number, buttonKey: ButtonKey, value: PageButton) {
    // Wraps the slot write + isDirty flip so consumers can't forget the
    // dirty mark on direct page mutations. Originally the spec deferred this
    // method on the rationale that there'd be a single consumer; surfaced
    // during PR review as a forget-prone protocol regardless of consumer
    // count, so we collapse the two writes into one entry point.
    if (!Number.isInteger(slotIdx)) {
      console.warn(
        `[remoteControl] setButton: slotIdx ${slotIdx} is not a valid integer (pages: ${remoteControlPages.value.length})`,
      );
      return;
    }
    const page = remoteControlPages.value[slotIdx];
    if (!page) {
      console.warn(
        `[remoteControl] setButton: slotIdx ${slotIdx} out of range (pages: ${remoteControlPages.value.length})`,
      );
      return;
    }
    page[buttonKey] = value;
    isDirty.value = true;
  }

  async function saveRemoteControl() {
    const payload = JSON.stringify(remoteControlPages.value);

    try {
      await apiService.put(REMOTE_CONFIG, { config: payload });
      isDirty.value = false;
      return { success: true };
    } catch (error) {
      console.error('Failed to save remote control configuration:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  return {
    remoteControlPages,
    isLoading,
    isDirty,
    selectedIdx,
    loadRemoteControl,
    saveRemoteControl,
    selectPage,
    addPage,
    duplicatePage,
    deletePage,
    renamePage,
    setButton,
  };
});

# Remote Control: Script + Playlist Button Configuration

## Context

The Remote Control page lets users configure M5StickC buttons to trigger scripts on the droid. Currently only scripts can be assigned. This feature adds playlist support so buttons can trigger either a script or a playlist. Also fixes a bug where the save button doesn't actually save.

## Design decisions (from playground)

- **Tabbed Dropdown** — each button card has Script/Playlist tab toggle that filters the dropdown
- **Searchable** — using Headless UI Combobox (already installed in project)
- **Type badge** — SCR/PL badge shown below dropdown when a value is selected
- **No color-coding** — keep borders default

## Tasks

### Model changes
- [x] Add `type` field to `PageButton` (`astros_vue/src/models/remoteControl/pageButton.ts`) — `'script' | 'playlist' | 'none'`
- [x] Update `createEmptyButton()` in AstrosRemoteControl.vue — set type to `'none'`
- [x] Update remoteControl store — load playlists alongside scripts, handle type field in save/load

### Component changes
- [x] Rewrite `AstrosRemoteButton.vue` — replace native `<select>` with:
  - Script/Playlist tab toggle (two buttons)
  - Headless UI Combobox with search input
  - Type badge (SCR/PL) shown when value is selected
  - Props: `currentValue: PageButton`, `scripts: SelectionItem[]`, `playlists: SelectionItem[]`
  - Emit: `@changed(value: PageButton)`
- [x] Update `AstrosRemoteControl.vue`:
  - Load playlists from playlist store on mount
  - Pass both scripts and playlists arrays to each AstrosRemoteButton
  - Update `selectionChange()` to handle both types
  - Simplify the 9 individual `currentButtonNScript` refs → use the page data directly
  - Fix save bug: call `remoteControlStore.saveRemoteControl()` in `saveConfig()`

### API changes
- [x] Update `syncRemoteConfig` in `remote_config_controller.ts` — the `command` field sent to M5 device already uses the button ID, which now includes the 's'/'p' prefix. No change needed if the M5 device dispatches via the `/remotecontrol` endpoint (which already routes by prefix).

### i18n
- [x] Add locale keys for: tab labels (Script/Playlist), search placeholder, type badges

## Key files

- `astros_vue/src/models/remoteControl/pageButton.ts` — add type field
- `astros_vue/src/components/remoteControl/AstrosRemoteButton.vue` — full rewrite
- `astros_vue/src/components/remoteControl/AstrosRemoteControl.vue` — load playlists, fix save, simplify state
- `astros_vue/src/stores/remoteControl.ts` — no changes needed (stores/loads JSON as-is, new type field persists naturally)
- `astros_vue/src/stores/playlists.ts` — use existing `loadPlaylists()` function
- `astros_api/src/controllers/remote_config_controller.ts` — verify syncRemoteConfig handles playlist IDs

## Verification

- Manual QA: open Remote Control page, verify scripts and playlists appear in tabbed dropdown, search works, save persists, page navigation preserves selections
- Run Vue unit tests: `cd astros_vue && npm run test:unit`
- Run API tests: `cd astros_api && npx vitest run`

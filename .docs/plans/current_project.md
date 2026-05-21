# Current Project: Remote Control Redesign + Mobile Remote Web App

**Started:** 2026-05-19
**Owner:** Jeff Rector
**Status:** active

## Goal

Replace the single-pane Remote Control Configuration view with the "Pages + Live Preview"
three-pane editor (Direction B), and add a phone/tablet-friendly web operator remote that
fires the configured actions. M5Stack hardware remote continues to work in parallel.

## Phases

- [x] **Phase 0 — Tracking convention bootstrap**: Add the `current_project.md` template,
      this file, and the CLAUDE.md amendment. — completed 2026-05-19
- [x] **Phase 1 — Page id/name data model**: Add `id` + `name` to RemoteControlPage and
      M5Page, migrate existing data on load/save, hold M5Stack-compatible JSON shape. —
      shipped 2026-05-21 via PR #90 (merge `9b52df5`), M5 bench-verified before merge.
- [ ] **Phase 2 — Direction B editor port**: Rebuild RemoteControlConfig view as a 3-pane
      layout (page list + 3×3 grid + live preview), inline button editor, inline page CRUD.
- [ ] **Phase 3 — Shared `AstrosMobileRemote` component**: Build the handheld UI in Vue;
      consume it from Phase 2's preview rail in compact mode.
- [ ] **Phase 4 — Mobile operator route**: New `/m` route, full-bleed phone layout, wires
      button presses to existing `/scripts/run` & `/playlists/run` endpoints, Stop All via
      WebSocket PANIC, connection chip from WS state.
- [ ] **Phase 5 — Page drag-reorder**: Install `vuedraggable` (or `vue-draggable-plus`),
      wire row reorder, persist new order on save.
- [x] **Phase 6 — Backend M5 → Remote rename + DB key migration**: Rename `M5Page` /
      `M5Button` / `M5ScriptList` backend types to `RemotePage` / `RemoteButton` /
      `RemoteScriptList` (frontend already uses generic names). Migrate the
      `remote_config.type` DB string from `astrOsScreen` → `remoteConfig` via a new
      reversible migration. Sequence: AFTER Phase 1 ships and bench-passes, so the M5
      contract Phase 1 verifies isn't perturbed by the rename. Light plan tier. —
      shipped 2026-05-21 via PR #91 (merge `983d104`), wire shape pinned by new
      `remote_config_controller.test.ts`.

**Sequencing note added 2026-05-21:** Phase 3 ships ahead of Phase 2. Phase 2's
live-preview rail imports the `AstrosMobileRemote` component built in Phase 3; doing
them in original order would force a stub-then-replace cycle. See Phase 3 plan for
rationale.

## Notes & Decisions

- Convention reference: see [`.docs/templates/current_project.md`](../templates/current_project.md)
  for the template this file was generated from, and the **Multi-phase projects** subsection
  in `CLAUDE.md` (under **Planning (MANDATORY)**) for the lifecycle rules.
- M5Stack stays supported. JSON additions must be ignorable (no rename/restructure of
  existing fields). Test by syncing to a real M5 device before closing Phase 1.
- Mobile auth uses existing JWT `/login` flow; no device-pairing in v1.
- Save model stays manual ("Save" button in header) — no auto-save.
- **Battery glyph dropped from the design.** The handoff shows one in the mobile top bar,
  but there's no data source for it and the OS status bar already shows phone battery.
  Top bar = wordmark + Connected chip only.
- **PWA deferred indefinitely.** Considered for the mobile route (installable, Wake Lock
  to prevent screen sleep, fullscreen). Code effort ~1 day, but **service workers require
  HTTPS** and AstrOs deploys to a Raspberry Pi over plain HTTP on a LAN IP. Revisit only
  if/when an HTTPS path exists (mkcert, Tailscale, real domain). Until then the mobile
  route is a regular responsive web page tuned for touch.
- Master plan with full phase sketches lives outside the repo at
  `~/.claude/plans/take-a-look-at-optimized-blossom.md`. Each phase from 1 onward will
  produce its own timestamped plan file in `.docs/plans/` when work on it begins.
- **Phase 6 added 2026-05-19 (post-approval).** The master plan only covered Phases 0–5;
  Phase 6 is the backend M5 → Remote type/DB rename. M5Stack stopped being the only
  consumer of the remote-config endpoint (the upcoming mobile remote in Phase 4 also
  consumes it), so the `M5*` prefix is a leftover from when M5Stack was the only target.
  Decisions: prefix is `Remote*`, DB key migrates from `astrOsScreen` → `remoteConfig`,
  sequenced after Phase 1's M5 bench verification.

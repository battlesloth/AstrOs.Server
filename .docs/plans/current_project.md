# Current Project: Remote Control Redesign + Mobile Remote Web App

**Started:** 2026-05-19
**Owner:** Jeff Rector
**Status:** active

## Goal

Replace the single-pane Remote Control Configuration view with the "Pages + Live Preview"
three-pane editor (Direction B), and add a phone/tablet-friendly web operator remote that
fires the configured actions. M5Stack hardware remote continues to work in parallel.

## Phases

- [ ] **Phase 0 — Tracking convention bootstrap**: Add the `current_project.md` template,
      this file, and the CLAUDE.md amendment.
- [ ] **Phase 1 — Page id/name data model**: Add `id` + `name` to RemoteControlPage and
      M5Page, migrate existing data on load/save, hold M5Stack-compatible JSON shape.
- [ ] **Phase 2 — Direction B editor port**: Rebuild RemoteControlConfig view as a 3-pane
      layout (page list + 3×3 grid + live preview), inline button editor, inline page CRUD.
- [ ] **Phase 3 — Shared `AstrosMobileRemote` component**: Build the handheld UI in Vue;
      consume it from Phase 2's preview rail in compact mode.
- [ ] **Phase 4 — Mobile operator route**: New `/m` route, full-bleed phone layout, wires
      button presses to existing `/scripts/run` & `/playlists/run` endpoints, Stop All via
      WebSocket PANIC, connection chip from WS state.
- [ ] **Phase 5 — Page drag-reorder**: Install `vuedraggable` (or `vue-draggable-plus`),
      wire row reorder, persist new order on save.

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

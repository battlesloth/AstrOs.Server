# d.1 — Firmware page chrome + nav

## Context

First PR of the **phase d** roadmap (`./20260507-2153-firmware-ota-d-vue-firmware-view.md`). Lands the empty `/firmware` route + nav entry + page chrome + design tokens + i18n keys. The page renders only the header + subtitle + empty content area in this PR — actual content (SourceStrip, Topology, Controllers panel) lands in d.2–d.5.

Risk surface is tiny: no business logic, no WS, no HTTP. Reviewers sign off on visual fidelity to `ModulesView` chrome and the design handoff header spec.

## Tasks

- [ ] Add `/firmware` route to `astros_vue/src/router/index.ts` — auth-guarded by default (no `meta.public`), positioned consistently with Modules.
- [ ] Add nav entry in `astros_vue/src/components/common/layout/AstrosLayout.vue` between Modules and Utility — text from `nav.firmware` i18n key.
- [ ] Add i18n keys to `astros_vue/src/locales/enUS.json`: `nav.firmware`, `firmware_view.title`, `firmware_view.subtitle.select`, `firmware_view.subtitle.flashing`, `firmware_view.subtitle.done`, `firmware_view.subtitle.failed`. Copy verbatim from design handoff §Subtitle.
- [ ] Add design-handoff CSS vars to `astros_vue/src/assets/styles.css`: state extras (idle/queued/updating/done/failed × bg/fg/dot per design handoff §State extras) under a `.firmware-view` selector or as scoped CSS custom properties.
- [ ] Scope Inter font to firmware view via `@fontsource/inter` (add to `astros_vue/package.json`); import only inside `FirmwareView.vue` so the rest of the app keeps the existing system stack.
- [ ] Create `astros_vue/src/views/FirmwareView.vue` — page shell mirroring `ModulesView` chrome:
  - Header with `r2XLight` background, 14×20 padding, 1px bottom border, page title at 22px / 700.
  - Subtitle line at 13px / `inkSoft` driven by a local `phase` ref (default `'select'`); the subtitle text comes from `firmware_view.subtitle.{phase}`.
  - Content area uses `base200` background, `padding: 20px 24px`, `max-width: 1100px`, centered, vertical gap 16px.
  - In this PR the content area is empty (placeholder comment for d.2–d.5).
  - Wraps everything in a `.firmware-view` class for the Inter font scoping.
- [ ] Verify Lighthouse a11y ≥ 95 on `/firmware` (manual check via Chrome devtools).
- [ ] `npm run prettier:write` then `npm run lint:fix` then `npm run build` then `npm run test:unit` — all green.
- [ ] Run `superpowers:requesting-code-review` on the diff against `develop`.

## Acceptance criteria

- `/firmware` reachable, auth-guarded; redirects to login if not authenticated.
- Nav link appears between Modules and Utility.
- Header chrome matches `ModulesView` pixel-for-pixel.
- Subtitle copy matches design handoff §Subtitle for `select` phase.
- No console errors / warnings.
- Lighthouse a11y ≥ 95 on the empty page.

## Out of scope (lands in later PRs)

- SourceStrip, Topology, Controllers panel, StagesList — d.2–d.5.
- WS dispatcher, firmwareStore, lock-aware integration — d.6.
- Storybook stories — d.1 is just chrome; d.2+ adds component stories.
- Real subtitle phase machine — d.5 wires this to the firmwareStore; in d.1 the local `phase` ref is hardcoded to `'select'`.

## Files touched

- `astros_vue/src/views/FirmwareView.vue` (new)
- `astros_vue/src/router/index.ts` (modified)
- `astros_vue/src/components/common/layout/AstrosLayout.vue` (modified)
- `astros_vue/src/locales/enUS.json` (modified)
- `astros_vue/src/assets/styles.css` (modified)
- `astros_vue/package.json` (modified — `@fontsource/inter` dependency)
- `astros_vue/package-lock.json` (regenerated)

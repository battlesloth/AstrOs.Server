# d.3 — `AstrosFirmwareTopology` SVG component

Phase d, PR 3 of 6. Builds the topology SVG card per the design handoff (Direction C). Pure presentational + Storybook; **not** mounted in `FirmwareView` this PR — that's deferred to d.5 (page assembly), when the controllers panel and real controllers data land.

Roadmap reference: `20260507-2153-firmware-ota-d-vue-firmware-view.md`. Design source: `.docs/design_handoff_firmware_update/README.md:124-148` ("Component: `Topology`") + `firmwareDirectionC.jsx:123-222`.

## Scope

- New presentational component `AstrosFirmwareTopology` rendering a ~360×260 SVG with master + two padawan nodes, source-tag rect, and connecting lines.
- State-driven stroke colors keyed off `phase` and per-controller `selectedIds`.
- CSS keyframe animation for the dashed-line "data flow" effect during `phase === 'flashing'` — **not** SVG SMIL `<animate>`. Design handoff is explicit: keyframes against `stroke-dashoffset`, no JS frame loop.
- Local minimal `TopologyController` type (`id`, `label` only) wrapped in a `TopologyFleet` shape (`{ master, padawans }`) — does **not** import the existing `Controller` type from `stores/controller`. d.5/d.6 will map real controllers → this shape when wiring up. Encoding the master/padawan split in the type makes a missing master unrepresentable.
- Storybook stories covering all four phases (6 stories: idle + all-selected for `select`, then `flashing`, `done`, `failed-core`, `failed-master`).
- i18n keys for chrome strings ("UPDATE TOPOLOGY" eyebrow, hint, MASTER/PADAWAN role labels).
- Barrel export in `components/firmware/index.ts`.
- Unit-test the `strokeFor` mapping (7 return paths) — extracted to a sibling pure module so it's testable in isolation.

## Out of scope

- Mounting into `FirmwareView` — deferred to d.5 (needs controllers data).
- `firmwareStore` changes — Topology is fully prop-driven; no store reads.
- SVG-layout / animation tests — CLAUDE.md TDD exception for UI layout work applies; Storybook + `prefers-reduced-motion` manual check are the feedback loop.

## Tasks

- [x] Add i18n keys under `firmware_view.topology.*` in `enUS.json` (`eyebrow_title`, `hint`, `role_master`, `role_padawan`, `figure_aria_label`, `node_title`).
- [x] Create `astros_vue/src/components/firmware/firmwareTopology/types.ts` exporting `TopologyController`, `TopologyFleet`, `TopologyPhase`, `TopologyProps`.
- [x] Extract `strokeFor` to a pure sibling module `strokeFor.ts` and unit-test all 7 return paths in `__tests__/strokeFor.spec.ts`.
- [x] Implement `astros_vue/src/components/firmware/firmwareTopology/AstrosFirmwareTopology.vue` with the SVG layout, `strokeFor` / `padawanLineStroke` / `nodeFill` / `sourceLineStroke` helpers, dev-mode `watchEffect` invariant warnings, and CSS `@keyframes` for `stroke-dashoffset`.
- [x] Add Storybook stories `AstrosFirmwareTopology.stories.ts` for: `SelectIdle`, `SelectAllSelected`, `Flashing`, `Done`, `FailedCore`, `FailedMaster`.
- [x] Export from `components/firmware/index.ts`; verify build + Storybook render manually.
- [x] Pre-commit: prettier, lint, build, vitest run, pre-push toolkit pass, then commit.

## Implementation notes

### Component shape

```ts
// firmwareTopology/types.ts
export type TopologyPhase = 'select' | 'flashing' | 'done' | 'failed';

export interface TopologyController {
  id: string;
  label: string;
}

export interface TopologyFleet {
  master: TopologyController;
  padawans: readonly TopologyController[];
}

export interface TopologyProps {
  fleet: TopologyFleet;
  selectedIds: ReadonlySet<string>;
  target: string | null;
  phase: TopologyPhase;
  failedControllerId?: string;
}
```

`failedControllerId` parameterizes the prototype's hardcoded `'core'` (per design handoff §"Topology stroke colors"). In d.6 this comes from the orchestrator's per-controller terminal state.

Per-controller `current` / `status` fields are intentionally omitted — the topology doesn't read them. d.5 will define a richer `Controller` shape for the controllers panel that fans out into a minimal `TopologyController` for this component.

The `{ master, padawans }` split (rather than a flat `controllers[]` + `masterControllerId` index) makes the master invariant unrepresentable-when-absent and eliminates the silent-drop behavior that a flat list would need. `selectedIds: ReadonlySet<string>` aligns with the planned firmwareStore shape (master plan line 67) so callers don't need an adapter.

### Stroke-color rules (mirror of the prototype's `dotFor` in `firmwareDirectionC.jsx:139`, implemented here as `strokeFor` in `strokeFor.ts`)

| Condition | Color |
|---|---|
| Not selected | `#cbd5dd` |
| `phase === 'done'` (selected) | `#3aa676` (successGreen) |
| `phase === 'failed'` and `c.id === failedControllerId` | `#cf4242` |
| `phase === 'failed'` (other selected) | `#3aa676` |
| `phase === 'flashing'` and master | `#e5a93a` (warnYellow) |
| `phase === 'flashing'` (other selected) | `#7d92b8` |
| default selected | `#2a5a97` (ASTROS.primary) |

### Line animation

The JSX uses `<animate attributeName="stroke-dashoffset" from="0" to="-16" dur="0.8s" repeatCount="indefinite" />` — SMIL. The design handoff explicitly calls for CSS keyframes instead:

```css
@keyframes astros-firmware-topology-flow {
  to { stroke-dashoffset: -16; }
}

.astros-firmware-topology__line--flow-fast {
  animation: astros-firmware-topology-flow 0.8s linear infinite;
}

.astros-firmware-topology__line--flow-slow {
  animation: astros-firmware-topology-flow 1.2s linear infinite;
}
```

- Source→master segment uses 0.8s (fast).
- Master→padawan segments use 1.2s (slow).
- `stroke-dasharray="4 4"` is bound inline in the template (only when active), not in the class — so non-flashing selected lines remain solid even if the animation class is ever applied unconditionally.

`prefers-reduced-motion`: wrap the animation in a `@media (prefers-reduced-motion: no-preference)` guard so motion-sensitive users get a static dashed line (still visually distinguishable as "active" because of the dash pattern).

### Accessibility

- Outer `<div>` has `role="figure"` and an `aria-label` describing the topology purpose.
- Each node circle gets an `<title>` element (SVG-native tooltip) with the controller name + role.
- The `!` failure glyph is decorative — the failure state is already conveyed by stroke color + the parent component's status pill; add `aria-hidden="true"` so screen readers don't read "exclamation mark".

### Coordinates

Final coords (departed from prototype during d.3 sizing tweaks to enlarge the diagram after role labels and hint were dropped):

- viewBox `0 0 360 260`.
- `NODE_RADIUS = 30` (was 22 in prototype).
- Source rect: `x=130 y=8 w=100 h=26 rx=4`, text centered `x=180 y=26`, font 12.
- Master node center: `(180, 95)`, radius `NODE_RADIUS`. (Master sits low enough that the failure `!` glyph at `master.y - NODE_RADIUS - 8 = 57` clears the source rect bottom at y=34.)
- Padawan node centers: `(75, 205)` and `(285, 205)`, radius `NODE_RADIUS`.
- Source→master line: `(180, 34) → (180, 65)` (`MASTER_POS.y - NODE_RADIUS`), stroke-width 2.5.
- Master→padawan lines: `(180, 125)` (`MASTER_POS.y + NODE_RADIUS`) `→ (pX, pY - NODE_RADIUS)`, stroke-width 2.5.
- ESP-NOW label: midpoint of the master→padawan segment, 6px above the line, font 10.
- Failure `!` glyph: `(nodeX, nodeY - NODE_RADIUS - 8)`, font 14.
- Node label text: `(nodeX, nodeY + 5)`, font 14.

## Verification

1. `npm run build` (type-check).
2. `npx vitest run` — `strokeFor.spec.ts` exercises all 8 branches; rest of the suite must keep passing.
3. `npm run storybook` and visually confirm all 6 stories render:
   - `SelectIdle` — all nodes light gray, no animation.
   - `SelectAllSelected` — three blue rings, no animation.
   - `Flashing` — master yellow ring, padawans muted blue, lines dashed-flowing.
   - `Done` — all selected nodes green.
   - `FailedCore` — Core red with `!` above, Dome green, Body green.
   - `FailedMaster` — Body red with `!` above, Core/Dome green.
4. Verify `prefers-reduced-motion: reduce` halts the animation (DevTools → Rendering → Emulate CSS media).
5. Pre-push: run `/pr-review-toolkit:review-pr` (5 agents) on the full diff vs `develop`; address Critical/Important findings before push.

## Risks

- **SVG fill/stroke vs. CSS class targeting.** Vue scoped-CSS rewrites `[data-v-hash]` attributes onto SVG children just like HTML children, so `.astros-firmware-topology__line--flow-*` matches `<line>` elements inside `<svg>` without `:deep`. Confirmed during d.3 implementation.
- **autoprefixer / Safari `-webkit-animation`.** Roadmap §"Risks/open questions" #5 flags this. Vite/Tailwind do not run autoprefixer over `<style scoped>` blocks automatically; modern evergreen Safari has unprefixed `animation` support, so the manual `-webkit-` prefix is unlikely to be necessary — but if a target browser shows static lines during `flashing`, add the prefix manually.

# d.3 — `AstrosFirmwareTopology` SVG component

Phase d, PR 3 of 6. Builds the topology SVG card per the design handoff (Direction C). Pure presentational + Storybook; **not** mounted in `FirmwareView` this PR — that's deferred to d.5 (page assembly), when the controllers panel and real controllers data land.

Roadmap reference: `20260507-2153-firmware-ota-d-vue-firmware-view.md`. Design source: `.docs/design_handoff_firmware_update/README.md:124-148` ("Component: `Topology`") + `firmwareDirectionC.jsx:123-222`.

## Scope

- New presentational component `AstrosFirmwareTopology` rendering a ~360×260 SVG with master + two padawan nodes, source-tag rect, and connecting lines.
- State-driven stroke colors keyed off `phase` and per-controller `selectedIds`.
- CSS keyframe animation for the dashed-line "data flow" effect during `phase === 'flashing'` — **not** SVG SMIL `<animate>`. Design handoff is explicit: keyframes against `stroke-dashoffset`, no JS frame loop.
- Local `TopologyController` type (id, label, current, status) — does **not** import the existing `Controller` type from `stores/controller`. d.6 will map real controllers → this shape when wiring up.
- Storybook stories covering all four phases.
- i18n keys for chrome strings ("UPDATE TOPOLOGY" eyebrow, hint, MASTER/PADAWAN role labels).
- Barrel export in `components/firmware/index.ts`.

## Out of scope

- Mounting into `FirmwareView` — deferred to d.5 (needs controllers data).
- `firmwareStore` changes — Topology is fully prop-driven; no store reads.
- Unit tests beyond visual Storybook coverage — SVG layout is mechanical translation of fixed coords, and animation is browser-native (CLAUDE.md TDD exception for UI layout work applies).

## Tasks

- [ ] Add i18n keys under `firmware_view.topology.*` in `enUS.json` (`eyebrow_title`, `hint`, `role_master`, `role_padawan`, `node_aria_label`).
- [ ] Create `astros_vue/src/components/firmware/firmwareTopology/types.ts` exporting `TopologyController`, `TopologyPhase`, `TopologyProps`.
- [ ] Implement `astros_vue/src/components/firmware/firmwareTopology/AstrosFirmwareTopology.vue` with the SVG layout, `dotFor`/`lineColorFor` computeds, and CSS `@keyframes` for `stroke-dashoffset`.
- [ ] Add Storybook stories `AstrosFirmwareTopology.stories.ts` for: `SelectIdle` (no selection), `SelectAllSelected`, `Flashing`, `Done`, `FailedCore`.
- [ ] Export from `components/firmware/index.ts`; verify build + Storybook render manually.
- [ ] Pre-commit: prettier, lint, build, vitest run, `superpowers:requesting-code-review`, then commit.

## Implementation notes

### Component shape

```ts
// firmwareTopology/types.ts
export type TopologyPhase = 'select' | 'flashing' | 'done' | 'failed';
export type ControllerStatus = 'up' | 'down' | 'needs_synced';

export interface TopologyController {
  id: string;          // 'body' | 'core' | 'dome' (string for forward-compat)
  label: string;       // 'Body', 'Core', 'Dome'
  current: string;     // semver tag, e.g. 'v1.4.0'
  status: ControllerStatus;
}

export interface TopologyProps {
  controllers: TopologyController[];   // [body, core, dome]; body is master by convention
  selectedIds: Record<string, boolean>;
  target: string | null;               // tag rendered in the source rect; '—' when null
  phase: TopologyPhase;
  failedControllerId?: string | null;  // which node shows the red '!' glyph when phase === 'failed'
}
```

`failedControllerId` parameterizes the prototype's hardcoded `'core'` (per design handoff §"Topology stroke colors"). In d.6 this comes from the orchestrator's per-controller terminal state.

### Stroke-color rules (mirror of `dotFor` in `firmwareDirectionC.jsx:139`)

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

.astros-firmware-topology__line--flowing-fast {
  stroke-dasharray: 4 4;
  animation: astros-firmware-topology-flow 0.8s linear infinite;
}

.astros-firmware-topology__line--flowing-slow {
  stroke-dasharray: 4 4;
  animation: astros-firmware-topology-flow 1.2s linear infinite;
}
```

- Source→master segment uses 0.8s (fast).
- Master→padawan segments use 1.2s (slow).

`prefers-reduced-motion`: wrap the animation in a `@media (prefers-reduced-motion: no-preference)` guard so motion-sensitive users get a static dashed line (still visually distinguishable as "active" because of the dash pattern).

### Accessibility

- Outer `<div>` has `role="figure"` and an `aria-label` describing the topology purpose.
- Each node circle gets an `<title>` element (SVG-native tooltip) with the controller name + role.
- The `!` failure glyph is decorative — the failure state is already conveyed by stroke color + the parent component's status pill; add `aria-hidden="true"` so screen readers don't read "exclamation mark".

### Coordinates (copy from prototype, do not re-derive)

- viewBox `0 0 360 260`.
- Source rect: `x=140 y=6 w=80 h=22 rx=4`, text centered `x=180 y=21`.
- Master node center: `(180, 70)`, radius 22. Role label below: `y = 70 + 38 = 108`.
- Padawan node centers: `(90, 200)` and `(270, 200)`, radius 22.
- Source→master line: `(180, 28) → (180, 48)` (master top edge).
- Master→padawan lines: `(180, 94) → (pX, pY - 22)`.
- ESP-NOW label: midpoint of the master→padawan segment, 4px above the line.

## Verification

1. `npm run build` (type-check).
2. `npx vitest run` (no new tests but ensure no regressions).
3. `npm run storybook` and visually confirm all 5 stories render:
   - `SelectIdle` — all nodes light gray, no animation.
   - `SelectAllSelected` — three blue rings, no animation.
   - `Flashing` — master yellow ring, padawans muted blue, lines dashed-flowing.
   - `Done` — all selected nodes green.
   - `FailedCore` — Core red with `!` above, Dome green, Body green.
4. Verify `prefers-reduced-motion: reduce` halts the animation (DevTools → Rendering → Emulate CSS media).
5. Code review via `superpowers:requesting-code-review` against `HEAD` before commit.

## Risks

- **SVG fill/stroke vs. CSS class targeting.** Vue scoped-CSS doesn't reach SVG child selectors the same way it reaches HTML — verify the `.astros-firmware-topology__line--flowing-*` classes actually paint when applied to `<line>` elements inside `<svg>`. Mitigation: test in Storybook before committing.
- **autoprefixer / Safari `-webkit-animation`.** Roadmap §"Risks/open questions" #5 calls this out. Vite + `@tailwindcss/vite` should handle prefixing automatically; if not, add a `-webkit-` prefix manually before push.

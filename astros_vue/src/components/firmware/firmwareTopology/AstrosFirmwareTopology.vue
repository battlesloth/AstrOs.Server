<script setup lang="ts">
import { computed, watchEffect } from 'vue';
import { useI18n } from 'vue-i18n';
import type { TopologyController, TopologyProps } from './types';
import { strokeFor as computeStroke, TOPOLOGY_STROKE_COLORS } from './strokeFor';
import { isPadawanLineActive } from './padawanLineActive';

const props = defineProps<TopologyProps>();

const { t } = useI18n();

const VIEW_W = 360;
const VIEW_H = 260;
const NODE_RADIUS = 30;

const MASTER_POS = { x: 180, y: 95 };
const PADAWAN_POSITIONS = [
  { x: 75, y: 205 },
  { x: 285, y: 205 },
] as const;
const PADAWAN_SLOT_COUNT = PADAWAN_POSITIONS.length;

const COLOR = {
  lineActive: '#e5a93a',
  lineSelected: '#9bb1bd',
  lineUnselected: '#e3edf2',
  nodeFillSelected: '#eef3fa',
  nodeFillUnselected: '#f2f7fa',
  sourceRectFill: '#f6f9fb',
  failure: TOPOLOGY_STROKE_COLORS.failure,
  inkSoft: '#4b5b73',
  ink: '#0e1726',
  border: '#d6e0e6',
};

// Dev-only invariant warnings. Vite tree-shakes this block in production builds —
// invariants are documented on TopologyProps; this surfaces violations during local
// dev / Storybook without imposing console noise on end users.
if (import.meta.env.DEV) {
  watchEffect(() => {
    if (props.fleet.padawans.length > PADAWAN_SLOT_COUNT) {
      const dropped = props.fleet.padawans
        .slice(PADAWAN_SLOT_COUNT)
        .map((c) => c.id)
        .join(', ');
      console.warn(
        `[AstrosFirmwareTopology] ${props.fleet.padawans.length} padawans passed; ` +
          `only ${PADAWAN_SLOT_COUNT} slots render. Dropped: ${dropped}.`,
      );
    }
    if (props.phase !== 'select' && props.target == null) {
      console.warn(
        `[AstrosFirmwareTopology] target is null during phase="${props.phase}"; ` +
          `parent must pass a target whenever phase !== 'select'.`,
      );
    }
    if (props.failedControllerIds !== undefined) {
      const fleetIds = new Set(
        [props.fleet.master, ...props.fleet.padawans].map((c) => c.id),
      );
      const unknown = [...props.failedControllerIds].filter((id) => !fleetIds.has(id));
      if (unknown.length > 0) {
        console.warn(
          `[AstrosFirmwareTopology] failedControllerIds contains entries not in the fleet: ` +
            `[${unknown.join(', ')}].`,
        );
      }
    }
  });
}

const padawanLayouts = computed(() =>
  // Safe: slice cap (PADAWAN_SLOT_COUNT === PADAWAN_POSITIONS.length) bounds i within array length.
  props.fleet.padawans.slice(0, PADAWAN_SLOT_COUNT).map((controller, i) => ({
    controller,
    position: PADAWAN_POSITIONS[i] as { x: number; y: number },
  })),
);

const selectedSet = computed(() => new Set(props.selectedIds));

const isFlashing = computed(() => props.phase === 'flashing');

function isSelected(c: TopologyController): boolean {
  return selectedSet.value.has(c.id);
}

function strokeFor(c: TopologyController, isMaster: boolean): string {
  return computeStroke({
    controllerId: c.id,
    isSelected: isSelected(c),
    isMaster,
    phase: props.phase,
    failedControllerIds: props.failedControllerIds,
  });
}

function nodeFill(c: TopologyController): string {
  return isSelected(c) ? COLOR.nodeFillSelected : COLOR.nodeFillUnselected;
}

const sourceLineStroke = computed(() => (isFlashing.value ? COLOR.lineActive : COLOR.lineSelected));
const sourceLineDash = computed(() => (isFlashing.value ? '4 4' : '0'));

function padawanLineStroke(c: TopologyController): string {
  if (isFlashing.value && isSelected(c)) return COLOR.lineActive;
  if (isSelected(c)) return COLOR.lineSelected;
  return COLOR.lineUnselected;
}

// `isPadawanLineActive` encodes the serial-upload vs. deploy distinction
// (see its docstring for the stage mapping). Selection is layered on here
// because an unselected padawan never animates regardless of sub-phase.
const padawanLineActive = computed(() =>
  isPadawanLineActive(props.phase, props.currentStage),
);

function padawanLineDash(c: TopologyController): string {
  return padawanLineActive.value && isSelected(c) ? '4 4' : '0';
}

function padawanLineFlowing(c: TopologyController): boolean {
  return padawanLineActive.value && isSelected(c);
}

function nodeTitle(c: TopologyController, role: 'master' | 'padawan'): string {
  return t('firmware_view.topology.node_title', {
    label: c.label,
    role:
      role === 'master'
        ? t('firmware_view.topology.role_master')
        : t('firmware_view.topology.role_padawan'),
  });
}
</script>

<template>
  <div
    class="astros-firmware-topology"
    role="figure"
    :aria-label="$t('firmware_view.topology.figure_aria_label')"
  >
    <div class="astros-firmware-topology__header">
      <span class="astros-firmware-topology__eyebrow">{{
        $t('firmware_view.topology.eyebrow_title')
      }}</span>
    </div>

    <svg
      :viewBox="`0 0 ${VIEW_W} ${VIEW_H}`"
      class="astros-firmware-topology__svg"
      role="presentation"
    >
      <rect
        x="130"
        y="8"
        width="100"
        height="26"
        rx="4"
        :fill="COLOR.sourceRectFill"
        :stroke="COLOR.border"
      />
      <text
        x="180"
        y="26"
        text-anchor="middle"
        font-size="12"
        font-weight="700"
        :fill="COLOR.inkSoft"
        font-family="ui-monospace, 'SF Mono', monospace"
      >
        {{ target ?? '—' }}
      </text>

      <line
        x1="180"
        y1="34"
        :x2="MASTER_POS.x"
        :y2="MASTER_POS.y - NODE_RADIUS"
        :stroke="sourceLineStroke"
        stroke-width="2.5"
        :stroke-dasharray="sourceLineDash"
        :class="{ 'astros-firmware-topology__line--flow-fast': isFlashing }"
      />

      <g>
        <title>{{ nodeTitle(fleet.master, 'master') }}</title>
        <circle
          :cx="MASTER_POS.x"
          :cy="MASTER_POS.y"
          :r="NODE_RADIUS"
          :fill="nodeFill(fleet.master)"
          :stroke="strokeFor(fleet.master, true)"
          stroke-width="3"
        />
        <text
          :x="MASTER_POS.x"
          :y="MASTER_POS.y + 5"
          text-anchor="middle"
          font-size="14"
          font-weight="700"
          :fill="COLOR.ink"
        >
          {{ fleet.master.label.toUpperCase() }}
        </text>
        <text
          v-if="phase === 'failed' && failedControllerIds?.has(fleet.master.id)"
          :x="MASTER_POS.x"
          :y="MASTER_POS.y - NODE_RADIUS - 8"
          text-anchor="middle"
          font-size="14"
          font-weight="700"
          :fill="COLOR.failure"
          aria-hidden="true"
        >
          !
        </text>
      </g>

      <g
        v-for="layout in padawanLayouts"
        :key="`line-${layout.controller.id}`"
      >
        <line
          :x1="MASTER_POS.x"
          :y1="MASTER_POS.y + NODE_RADIUS"
          :x2="layout.position.x"
          :y2="layout.position.y - NODE_RADIUS"
          :stroke="padawanLineStroke(layout.controller)"
          stroke-width="2.5"
          :stroke-dasharray="padawanLineDash(layout.controller)"
          :class="{
            'astros-firmware-topology__line--flow-slow': padawanLineFlowing(layout.controller),
          }"
        />
        <text
          :x="(MASTER_POS.x + layout.position.x) / 2"
          :y="(MASTER_POS.y + NODE_RADIUS + layout.position.y - NODE_RADIUS) / 2 - 6"
          text-anchor="middle"
          font-size="10"
          font-weight="700"
          letter-spacing="0.05em"
          :fill="COLOR.inkSoft"
        >
          ESP-NOW
        </text>
      </g>

      <g
        v-for="layout in padawanLayouts"
        :key="`node-${layout.controller.id}`"
      >
        <title>{{ nodeTitle(layout.controller, 'padawan') }}</title>
        <circle
          :cx="layout.position.x"
          :cy="layout.position.y"
          :r="NODE_RADIUS"
          :fill="nodeFill(layout.controller)"
          :stroke="strokeFor(layout.controller, false)"
          stroke-width="3"
        />
        <text
          :x="layout.position.x"
          :y="layout.position.y + 5"
          text-anchor="middle"
          font-size="14"
          font-weight="700"
          :fill="COLOR.ink"
        >
          {{ layout.controller.label.toUpperCase() }}
        </text>
        <text
          v-if="phase === 'failed' && failedControllerIds?.has(layout.controller.id)"
          :x="layout.position.x"
          :y="layout.position.y - NODE_RADIUS - 8"
          text-anchor="middle"
          font-size="14"
          font-weight="700"
          :fill="COLOR.failure"
          aria-hidden="true"
        >
          !
        </text>
      </g>
    </svg>
  </div>
</template>

<style scoped>
.astros-firmware-topology {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px;
  background: #ffffff;
  border: 1px solid #d6e0e6;
  border-radius: 6px;
  font-family: 'Inter', system-ui, sans-serif;
}

.astros-firmware-topology__header {
  text-align: center;
}

.astros-firmware-topology__eyebrow {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #4b5b73;
}

.astros-firmware-topology__svg {
  width: 100%;
  height: auto;
}

@keyframes astros-firmware-topology-flow {
  to {
    stroke-dashoffset: -16;
  }
}

@media (prefers-reduced-motion: no-preference) {
  .astros-firmware-topology__line--flow-fast {
    animation: astros-firmware-topology-flow 0.8s linear infinite;
  }

  .astros-firmware-topology__line--flow-slow {
    animation: astros-firmware-topology-flow 1.2s linear infinite;
  }
}
</style>

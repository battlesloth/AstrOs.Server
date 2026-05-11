<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { TopologyController, TopologyProps } from './types';

const props = withDefaults(defineProps<TopologyProps>(), {
  failedControllerId: null,
  masterControllerId: 'body',
});

const { t } = useI18n();

const VIEW_W = 360;
const VIEW_H = 260;

const MASTER_POS = { x: 180, y: 70 };
const PADAWAN_POSITIONS = [
  { x: 90, y: 200 },
  { x: 270, y: 200 },
] as const;
const PADAWAN_SLOT_COUNT = PADAWAN_POSITIONS.length;

const COLOR = {
  unselected: '#cbd5dd',
  success: '#3aa676',
  failure: '#cf4242',
  masterFlashing: '#e5a93a',
  padawanFlashing: '#7d92b8',
  selectedDefault: '#2a5a97',
  lineActive: '#e5a93a',
  lineSelected: '#9bb1bd',
  lineUnselected: '#e3edf2',
  nodeFillSelected: '#eef3fa',
  nodeFillUnselected: '#f2f7fa',
  sourceRectFill: '#f6f9fb',
  inkSoft: '#4b5b73',
  ink: '#0e1726',
  border: '#d6e0e6',
};

const master = computed<TopologyController | undefined>(() =>
  props.controllers.find((c) => c.id === props.masterControllerId),
);

interface PadawanLayout {
  controller: TopologyController;
  position: { x: number; y: number };
}

const padawanLayouts = computed<PadawanLayout[]>(() => {
  const others = props.controllers.filter((c) => c.id !== props.masterControllerId);
  const layouts: PadawanLayout[] = [];
  for (let i = 0; i < PADAWAN_SLOT_COUNT; i++) {
    const controller = others[i];
    const position = PADAWAN_POSITIONS[i];
    if (controller && position) {
      layouts.push({ controller, position });
    }
  }
  return layouts;
});

const isFlashing = computed(() => props.phase === 'flashing');

function isSelected(c: TopologyController): boolean {
  return Boolean(props.selectedIds[c.id]);
}

function strokeFor(c: TopologyController | undefined): string {
  if (!c) return COLOR.unselected;
  if (!isSelected(c)) return COLOR.unselected;
  if (props.phase === 'done') return COLOR.success;
  if (props.phase === 'failed') {
    return c.id === props.failedControllerId ? COLOR.failure : COLOR.success;
  }
  if (isFlashing.value && c.id === props.masterControllerId) return COLOR.masterFlashing;
  if (isFlashing.value) return COLOR.padawanFlashing;
  return COLOR.selectedDefault;
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

function padawanLineDash(c: TopologyController): string {
  return isFlashing.value && isSelected(c) ? '4 4' : '0';
}

function padawanLineFlowing(c: TopologyController): boolean {
  return isFlashing.value && isSelected(c);
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
      <span class="astros-firmware-topology__hint">{{ $t('firmware_view.topology.hint') }}</span>
    </div>

    <svg
      :viewBox="`0 0 ${VIEW_W} ${VIEW_H}`"
      class="astros-firmware-topology__svg"
      role="presentation"
    >
      <!-- Source rect at top -->
      <rect
        x="140"
        y="6"
        width="80"
        height="22"
        rx="4"
        :fill="COLOR.sourceRectFill"
        :stroke="COLOR.border"
      />
      <text
        x="180"
        y="21"
        text-anchor="middle"
        font-size="10"
        font-weight="700"
        :fill="COLOR.inkSoft"
        font-family="ui-monospace, 'SF Mono', monospace"
      >
        {{ target ?? '—' }}
      </text>

      <!-- Source -> master line -->
      <line
        x1="180"
        y1="28"
        :x2="MASTER_POS.x"
        :y2="MASTER_POS.y - 22"
        :stroke="sourceLineStroke"
        stroke-width="2"
        :stroke-dasharray="sourceLineDash"
        :class="{ 'astros-firmware-topology__line--flow-fast': isFlashing }"
      />

      <!-- Master node -->
      <g v-if="master">
        <title>{{ nodeTitle(master, 'master') }}</title>
        <circle
          :cx="MASTER_POS.x"
          :cy="MASTER_POS.y"
          r="22"
          :fill="nodeFill(master)"
          :stroke="strokeFor(master)"
          stroke-width="2.5"
        />
        <text
          :x="MASTER_POS.x"
          :y="MASTER_POS.y + 4"
          text-anchor="middle"
          font-size="11"
          font-weight="700"
          :fill="COLOR.ink"
        >
          {{ master.label.toUpperCase() }}
        </text>
        <text
          :x="MASTER_POS.x"
          :y="MASTER_POS.y + 38"
          text-anchor="middle"
          font-size="9"
          font-weight="700"
          letter-spacing="0.08em"
          :fill="COLOR.inkSoft"
        >
          {{ $t('firmware_view.topology.role_master') }}
        </text>
        <text
          v-if="phase === 'failed' && master.id === failedControllerId"
          :x="MASTER_POS.x"
          :y="MASTER_POS.y - 30"
          text-anchor="middle"
          font-size="11"
          font-weight="700"
          :fill="COLOR.failure"
          aria-hidden="true"
        >
          !
        </text>
      </g>

      <!-- Master -> padawan lines + ESP-NOW labels -->
      <g
        v-for="layout in padawanLayouts"
        :key="`line-${layout.controller.id}`"
      >
        <line
          :x1="MASTER_POS.x"
          :y1="MASTER_POS.y + 24"
          :x2="layout.position.x"
          :y2="layout.position.y - 22"
          :stroke="padawanLineStroke(layout.controller)"
          stroke-width="2"
          :stroke-dasharray="padawanLineDash(layout.controller)"
          :class="{
            'astros-firmware-topology__line--flow-slow': padawanLineFlowing(layout.controller),
          }"
        />
        <text
          :x="(MASTER_POS.x + layout.position.x) / 2"
          :y="(MASTER_POS.y + 24 + layout.position.y - 22) / 2 - 4"
          text-anchor="middle"
          font-size="8"
          font-weight="700"
          letter-spacing="0.05em"
          :fill="COLOR.inkSoft"
        >
          ESP-NOW
        </text>
      </g>

      <!-- Padawan nodes -->
      <g
        v-for="layout in padawanLayouts"
        :key="`node-${layout.controller.id}`"
      >
        <title>{{ nodeTitle(layout.controller, 'padawan') }}</title>
        <circle
          :cx="layout.position.x"
          :cy="layout.position.y"
          r="22"
          :fill="nodeFill(layout.controller)"
          :stroke="strokeFor(layout.controller)"
          stroke-width="2.5"
        />
        <text
          :x="layout.position.x"
          :y="layout.position.y + 4"
          text-anchor="middle"
          font-size="11"
          font-weight="700"
          :fill="COLOR.ink"
        >
          {{ layout.controller.label.toUpperCase() }}
        </text>
        <text
          :x="layout.position.x"
          :y="layout.position.y + 38"
          text-anchor="middle"
          font-size="9"
          font-weight="700"
          letter-spacing="0.08em"
          :fill="COLOR.inkSoft"
        >
          {{ $t('firmware_view.topology.role_padawan') }}
        </text>
        <text
          v-if="phase === 'failed' && layout.controller.id === failedControllerId"
          :x="layout.position.x"
          :y="layout.position.y - 30"
          text-anchor="middle"
          font-size="11"
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
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.astros-firmware-topology__eyebrow {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #4b5b73;
}

.astros-firmware-topology__hint {
  font-size: 10px;
  color: #4b5b73;
  font-style: italic;
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

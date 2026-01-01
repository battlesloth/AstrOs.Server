import { ref, computed } from 'vue';

// Zoom level configuration
export interface ZoomLevelConfig {
  majorTickInterval: number; // seconds per major tick
  minorTickInterval: number; // seconds per minor tick
  scaleMultiplier: number; // timeline scale factor
  label: string; // human-readable label
}

export const ZOOM_LEVELS: ZoomLevelConfig[] = [
  { majorTickInterval: 5, minorTickInterval: 1, scaleMultiplier: 0.5, label: '5s' },
  { majorTickInterval: 10, minorTickInterval: 2, scaleMultiplier: 1, label: '10s' },
  { majorTickInterval: 15, minorTickInterval: 3, scaleMultiplier: 1.5, label: '15s' },
  { majorTickInterval: 20, minorTickInterval: 4, scaleMultiplier: 2, label: '20s' },
  { majorTickInterval: 30, minorTickInterval: 5, scaleMultiplier: 3, label: '30s' },
  { majorTickInterval: 40, minorTickInterval: 5, scaleMultiplier: 4, label: '40s' },
  { majorTickInterval: 50, minorTickInterval: 10, scaleMultiplier: 5, label: '50s' },
  { majorTickInterval: 60, minorTickInterval: 10, scaleMultiplier: 6, label: '1min' },
  { majorTickInterval: 75, minorTickInterval: 15, scaleMultiplier: 7.5, label: '1:15' },
  { majorTickInterval: 90, minorTickInterval: 15, scaleMultiplier: 9, label: '1:30' },
  { majorTickInterval: 105, minorTickInterval: 15, scaleMultiplier: 10.5, label: '1:45' },
  { majorTickInterval: 120, minorTickInterval: 20, scaleMultiplier: 12, label: '2min' },
];

export function useZoomState(pixelsPerSecond: number, timelineDurationSeconds: number) {
  const zoomLevel = ref(0);
  const zoomScrollAccumulator = ref(0);
  const TIMELINE_WIDTH = ref(
    (pixelsPerSecond * timelineDurationSeconds) / ZOOM_LEVELS[0]!.scaleMultiplier,
  );

  const canZoomIn = computed(() => zoomLevel.value > 0);
  const canZoomOut = computed(() => zoomLevel.value < ZOOM_LEVELS.length - 1);
  const currentZoomConfig = computed(() => ZOOM_LEVELS[zoomLevel.value]!);

  return {
    zoomLevel,
    zoomScrollAccumulator,
    TIMELINE_WIDTH,
    canZoomIn,
    canZoomOut,
    currentZoomConfig,
    ZOOM_LEVELS,
  };
}

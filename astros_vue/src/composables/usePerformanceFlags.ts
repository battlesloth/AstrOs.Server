import { ref, computed } from 'vue';

export interface PerformanceFlags {
  eventBoxPositionsDirty: boolean;
  rowBackgroundsDirty: boolean;
  lastTimelineWidth: number;
}

export function usePerformanceFlags(initialTimelineWidth: number) {
  const performanceFlags = ref<PerformanceFlags>({
    eventBoxPositionsDirty: false,
    rowBackgroundsDirty: false,
    lastTimelineWidth: initialTimelineWidth,
  });

  // Computed refs for backward compatibility
  const eventBoxPositionsDirty = computed({
    get: () => performanceFlags.value.eventBoxPositionsDirty,
    set: (val) => {
      performanceFlags.value.eventBoxPositionsDirty = val;
    },
  });

  const rowBackgroundsDirty = computed({
    get: () => performanceFlags.value.rowBackgroundsDirty,
    set: (val) => {
      performanceFlags.value.rowBackgroundsDirty = val;
    },
  });

  const lastTimelineWidth = computed({
    get: () => performanceFlags.value.lastTimelineWidth,
    set: (val) => {
      performanceFlags.value.lastTimelineWidth = val;
    },
  });

  return {
    performanceFlags,
    eventBoxPositionsDirty,
    rowBackgroundsDirty,
    lastTimelineWidth,
  };
}

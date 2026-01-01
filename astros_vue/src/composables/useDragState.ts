import { ref } from 'vue';

export function useDragState() {
  const isDraggingTimeline = ref(false);
  const dragStartX = ref(0);
  const dragStartY = ref(0);
  const dragStartWorldX = ref(0);
  const dragStartWorldY = ref(0);
  const hasDragged = ref(false);

  return {
    isDraggingTimeline,
    dragStartX,
    dragStartY,
    dragStartWorldX,
    dragStartWorldY,
    hasDragged,
  };
}

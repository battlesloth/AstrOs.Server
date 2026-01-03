import { ref, type Ref } from 'vue';
import { Container, FederatedPointerEvent } from 'pixi.js';
import { PixiChannelEvent } from '@/pixiComponents/pixiChannelEvent';
import type { ScriptEvent } from '@/models';


/**
 * Composable for managing event boxes on the timeline
 */
export function useEventBoxes(
  TIMELINE_WIDTH: Ref<number>,
  TIMELINE_DURATION_SECONDS: number,
  rowHeight: number,
  onEditEvent: (event: any) => void,
) {
  const channelEventBoxes = ref<Map<string, PixiChannelEvent[]>>(new Map());
  const isDraggingEventBox = ref(false);
  const draggedEventBox = ref<PixiChannelEvent | null>(null);
  const eventBoxDragStartX = ref(0);
  const eventBoxStartTime = ref(0);
  const hasEventBoxDragged = ref(false);

  /**
   * Creates a new event box at the specified time
   */
  function addEventBox(
    rowContainer: Container,
    channelId: string,
    scriptEvent: ScriptEvent,
    app: Ref<any>,
    isDraggingTimeline: Ref<boolean>,
  ) {


    const onEventPointerTap = (event: FederatedPointerEvent, scriptEvent: ScriptEvent) => {
      event.stopPropagation(); // Always stop propagation to prevent row click
      if (hasEventBoxDragged.value) {
        hasEventBoxDragged.value = false;
        return;
      }
      onEditEvent(scriptEvent);
    }

    const onEventPointerDown = (event: FederatedPointerEvent, eventBox: PixiChannelEvent) => {
      console.log('Event box pointerdown', { isDraggingTimeline: isDraggingTimeline.value });
      if (isDraggingTimeline.value) return;

      isDraggingEventBox.value = true;
      draggedEventBox.value = eventBox;
      eventBoxDragStartX.value = event.global.x;
      eventBoxStartTime.value = eventBox.deciseconds;
      hasEventBoxDragged.value = false; // Reset at start
      eventBox.cursor = 'grabbing';
      console.log('Set isDraggingEventBox to true', {
        eventBoxDragStartX: eventBoxDragStartX.value,
      });

      // Enable global move tracking
      if (app.value?.stage) {
        app.value.stage.eventMode = 'static';
      }

      event.stopPropagation();
    }

    const options = {
      channelId,
      deciseconds: scriptEvent.time,
      scriptEvent,
      rowHeight,
      timelineWidth: TIMELINE_WIDTH.value,
      timelineDurationSeconds: TIMELINE_DURATION_SECONDS,
      onPointerTap: onEventPointerTap,
      onPointerDown: onEventPointerDown,
    };

    const eventBox = new PixiChannelEvent(options);
    rowContainer.addChild(eventBox);

    // Store the event box in the map for tracking
    if (!channelEventBoxes.value.has(channelId)) {
      channelEventBoxes.value.set(channelId, []);
    }
    channelEventBoxes.value.get(channelId)!.push(eventBox);

    /*const timeInSeconds = scriptEvent.time;
    const boxWidth = 60;
    const boxHeight = rowHeight - 10;
    const boxY = 5;

    // Calculate pixel position from time in seconds (this will be the center of the box)
    const pixelPosition = (timeInSeconds / TIMELINE_DURATION_SECONDS) * TIMELINE_WIDTH.value;

    const eventBox = new Graphics();
    eventBox.rect(0, 0, boxWidth, boxHeight).fill(0xff0000);

    eventBox.rect(0, 0, boxWidth, boxHeight).stroke({ width: 2, color: 0xaa0000 });

    // Set pivot to center of the box so it's centered on the time position
    eventBox.pivot.set(boxWidth / 2, 0);

    // Position the box (x is now the center thanks to pivot)
    eventBox.x = pixelPosition;
    eventBox.y = boxY;

    // Make event box interactive
    eventBox.eventMode = 'static';
    eventBox.cursor = 'grab';

    // Store the event data with graphics reference
    const eventBoxData: EventBox = { channelId, timeInSeconds, graphics: eventBox, scriptEvent };

    if (!channelEventBoxes.value.has(channelId)) {
      channelEventBoxes.value.set(channelId, []);
    }
    channelEventBoxes.value.get(channelId)!.push(eventBoxData);

    //Add click handler for editing
    eventBox.on('pointertap', (event) => {
      event.stopPropagation(); // Always stop propagation to prevent row click
      if (hasEventBoxDragged.value) {
        hasEventBoxDragged.value = false;
        return;
      }
      onEditEvent(scriptEvent);
    });

    // Add drag handlers
    eventBox.on('pointerdown', (event) => {
      console.log('Event box pointerdown', { isDraggingTimeline: isDraggingTimeline.value });
      if (isDraggingTimeline.value) return;

      isDraggingEventBox.value = true;
      draggedEventBox.value = eventBoxData;
      eventBoxDragStartX.value = event.global.x;
      eventBoxStartTime.value = eventBoxData.timeInSeconds;
      hasEventBoxDragged.value = false; // Reset at start
      eventBox.cursor = 'grabbing';
      console.log('Set isDraggingEventBox to true', {
        eventBoxDragStartX: eventBoxDragStartX.value,
      });

      // Enable global move tracking
      if (app.value?.stage) {
        app.value.stage.eventMode = 'static';
      }

      event.stopPropagation();
    });
*/

  }





  /**
   * Updates positions of event boxes for a specific channel
   */
  function updateEventBoxPositions(channelId: string) {
    const events = channelEventBoxes.value.get(channelId) || [];

    // Update positions of all event boxes based on current timeline width
    // Position is the center of the box (thanks to pivot)
    events.forEach((event) => {
      const pixelPosition =
        (event.deciseconds / TIMELINE_DURATION_SECONDS) * TIMELINE_WIDTH.value;
      event.x = pixelPosition;
    });
  }

  /**
   * Updates positions of all event boxes across all channels
   */
  function updateAllEventBoxPositions() {
    channelEventBoxes.value.forEach((events, channelId) => {
      updateEventBoxPositions(channelId);
    });
  }

  /**
   * Handles drag movement for event boxes
   */
  function handleEventBoxDrag(globalX: number) {
    if (!isDraggingEventBox.value || !draggedEventBox.value) return;

    const deltaX = globalX - eventBoxDragStartX.value;

    // Mark as dragged if moved more than a small threshold
    if (Math.abs(deltaX) > 2) {
      hasEventBoxDragged.value = true;
    }

    const deltaTimeSeconds = (deltaX / TIMELINE_WIDTH.value) * TIMELINE_DURATION_SECONDS;
    let newTime = Math.max(
      0,
      Math.min(TIMELINE_DURATION_SECONDS, eventBoxStartTime.value + deltaTimeSeconds),
    );

    // Round to 0.1 second precision
    newTime = Math.round(newTime * 10) / 10;

    // Update the event box time and position
    draggedEventBox.value.deciseconds = newTime;
    draggedEventBox.value.scriptEvent.time = newTime;
    const pixelPosition = (newTime / TIMELINE_DURATION_SECONDS) * TIMELINE_WIDTH.value;
    draggedEventBox.value.x = pixelPosition;
  }

  /**
   * Ends event box drag operation
   */
  function endEventBoxDrag() {
    if (isDraggingEventBox.value && draggedEventBox.value) {
      isDraggingEventBox.value = false;
      draggedEventBox.value.cursor = 'grab';
      draggedEventBox.value = null;
    }
  }

  return {
    // State
    channelEventBoxes,
    isDraggingEventBox,
    draggedEventBox,
    hasEventBoxDragged,

    // Methods
    addEventBox,
    updateEventBoxPositions,
    updateAllEventBoxPositions,
    handleEventBoxDrag,
    endEventBoxDrag,
  };
}

import { describe, it, expect, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useModuleManagement } from '@/composables/useModuleManagement';
import { useLocationStore } from '@/stores/location';
import { Location, ModuleSubType, ModuleType } from '@/enums';
import type { ControllerLocation, MaestroModule } from '@/models';

describe('useModuleManagement', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    useLocationStore().setLocation(Location.DOME, {
      id: 'dome-id',
      locationName: Location.DOME,
      uartModules: [],
      i2cModules: [],
    } as unknown as ControllerLocation);
  });

  // The firmware's release floor before per-channel release times; a new
  // channel must start at it.
  it('gives every channel of a new Maestro module a 5000 ms release time', () => {
    useModuleManagement().addModule(Location.DOME, ModuleType.UART, ModuleSubType.MAESTRO);

    const [mod] = useLocationStore().getLocation(Location.DOME)!.uartModules;
    const channels = (mod!.subModule as MaestroModule).boards[0]!.channels;
    expect(channels).toHaveLength(24);
    expect(new Set(channels.map((c) => c.releaseMs))).toEqual(new Set([5000]));
  });
});

import { ModuleSubType, TransmissionType } from '@api/models/enums.js';
import type { ConfigSync } from '@api/models/config/config_sync.js';
import type { ControllerConfig } from '@api/models/config/controller_config.js';
import type { ControlModule } from '@api/models/control_module/control_module.js';
import { GpioChannel } from '@api/models/control_module/gpio/gpio_channel.js';
import { MaestroChannel } from '@api/models/control_module/uart/sub_modules/maestro/maestro_channel.js';
import type { MaestroModule } from '@api/models/control_module/uart/sub_modules/maestro/maestro_module.js';
import { UartModule } from '@api/models/control_module/uart/uart_module.js';

// Fixed bench wiring. Edit these when the rig changes.
export const BENCH = {
  masterAddress: '00:00:00:00:00:00',
  masterName: 'bench-master',
  padawanName: 'bench-padawan',
  locationId: 'bench',

  // Master: one Pololu Maestro on UART 2, servos on channels 1–6.
  maestroIdx: 0,
  maestroUartChannel: 2,
  maestroBaud: 9600,
  maestroServoChannels: [1, 2, 3, 4, 5, 6] as const,

  // HCR on master UART 2 — not part of DEPLOY_CONFIG (firmware config covers
  // GPIO + Maestro only). Recorded here so future scenarios can address it.
  hcrUartChannel: 2,
  hcrBaud: 9600,

  // Padawan: GPIO 1 → relay → LED. Four GPIO slots reported to firmware.
  padawanGpioRelayChannel: 1,
  padawanGpioSlots: 4,

  // Padawan generic serial on ch 1 (placeholder for future hardware).
  padawanGenericSerialUartChannel: 1,
  padawanGenericSerialBaud: 9600,

  // Servo pulse bounds in microseconds. Override once real servos are mounted.
  servoMinPos: 500,
  servoMaxPos: 2500,
  servoHomePos: 1500,
} as const;

export interface BenchConfigOverrides {
  padawanAddress?: string;
  padawanName?: string;
  servoMinPos?: number;
  servoMaxPos?: number;
  servoHomePos?: number;
}

export function buildMasterControlModule(): ControlModule {
  return { id: 'bench-master', name: BENCH.masterName, address: BENCH.masterAddress };
}

export function buildPadawanControlModule(address: string, name = BENCH.padawanName): ControlModule {
  return { id: 'bench-padawan', name, address };
}

function buildMasterMaestro(minPos: number, maxPos: number, homePos: number): UartModule {
  const module = new UartModule(
    BENCH.maestroIdx,
    'bench-master-maestro',
    'bench-master-maestro',
    BENCH.locationId,
    ModuleSubType.maestro,
    BENCH.maestroUartChannel,
    BENCH.maestroBaud,
  );

  const sub: MaestroModule = {
    boards: [
      {
        id: 'bench-master-maestro-board-0',
        parentId: module.id,
        boardId: 0,
        name: 'board-0',
        channelCount: 24,
        channels: BENCH.maestroServoChannels.map(
          (ch) =>
            new MaestroChannel(
              `bench-master-maestro-ch-${ch}`,
              module.id,
              `servo ${ch}`,
              true,
              ch,
              true,
              minPos,
              maxPos,
              homePos,
              false,
            ),
        ),
      },
    ],
  };

  module.subModule = sub;
  return module;
}

function buildPadawanGpio(): GpioChannel[] {
  const channels: GpioChannel[] = [];
  for (let i = 1; i <= BENCH.padawanGpioSlots; i++) {
    const enabled = i === BENCH.padawanGpioRelayChannel;
    channels.push(
      new GpioChannel(
        `bench-padawan-gpio-${i}`,
        'bench-padawan',
        i,
        enabled,
        enabled ? 'relay-led' : `gpio-${i}`,
        false,
      ),
    );
  }
  return channels;
}

export function buildBenchConfigSync(overrides: BenchConfigOverrides = {}): ConfigSync {
  const padawanAddress = overrides.padawanAddress ?? '';
  const padawanName = overrides.padawanName ?? BENCH.padawanName;
  const minPos = overrides.servoMinPos ?? BENCH.servoMinPos;
  const maxPos = overrides.servoMaxPos ?? BENCH.servoMaxPos;
  const homePos = overrides.servoHomePos ?? BENCH.servoHomePos;

  const master: ControllerConfig = {
    id: 'bench-master',
    location: BENCH.locationId,
    name: BENCH.masterName,
    address: BENCH.masterAddress,
    gpioChannels: [],
    maestroModules: [buildMasterMaestro(minPos, maxPos, homePos)],
  };

  const padawan: ControllerConfig = {
    id: 'bench-padawan',
    location: BENCH.locationId,
    name: padawanName,
    address: padawanAddress,
    gpioChannels: buildPadawanGpio(),
    maestroModules: [],
  };

  return {
    type: TransmissionType.sync,
    configs: [master, padawan],
  };
}

export function benchControllers(sync: ConfigSync): ControlModule[] {
  return sync.configs.map((c) => ({ id: c.id, name: c.name, address: c.address }));
}

export function isMasterConfig(c: ControllerConfig): boolean {
  return c.address === BENCH.masterAddress;
}

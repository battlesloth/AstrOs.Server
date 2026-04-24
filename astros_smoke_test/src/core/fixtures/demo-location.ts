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
  maestroBaud: 115200,

  maestroServoChannels: [
    { ch: 1, minPos: 500, maxPos: 2500, homePos: 1588 },
    { ch: 2, minPos: 1105, maxPos: 2300, homePos: 2150 },
    { ch: 3, minPos: 1100, maxPos: 2370, homePos: 2167 },
    { ch: 4, minPos: 500, maxPos: 2500, homePos: 1471 },
  ] as ServoConfig[],

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
} as const;

export interface ServoConfig {
  ch: number;
  minPos: number;
  maxPos: number;
  homePos: number;
}

export function getServoConfig(ch: number, overrides?: ServoConfig[]): ServoConfig {
  const source = overrides ?? BENCH.maestroServoChannels;
  const cfg = source.find((c) => c.ch === ch);
  if (!cfg) {
    throw new Error(
      `No servo config for channel ${ch}. Configured channels: ${source.map((c) => c.ch).join(', ')}`,
    );
  }
  return cfg;
}

export interface BenchConfigOverrides {
  padawanAddress?: string;
  padawanName?: string;
  servoConfigs?: ServoConfig[];
}

export function buildMasterControlModule(): ControlModule {
  return { id: 'bench-master', name: BENCH.masterName, address: BENCH.masterAddress };
}

export function buildPadawanControlModule(
  address: string,
  name = BENCH.padawanName,
): ControlModule {
  return { id: 'bench-padawan', name, address };
}

function buildMasterMaestro(servoConfig: ServoConfig[]): UartModule {
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
        channels: servoConfig.map(
          (ch) =>
            new MaestroChannel(
              `bench-master-maestro-ch-${ch.ch}`,
              module.id,
              `servo ${ch.ch}`,
              true,
              ch.ch,
              true,
              ch.minPos,
              ch.maxPos,
              ch.homePos,
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
  const servoConfigs = overrides.servoConfigs ?? BENCH.maestroServoChannels;

  const master: ControllerConfig = {
    id: 'bench-master',
    location: BENCH.locationId,
    name: BENCH.masterName,
    address: BENCH.masterAddress,
    gpioChannels: [],
    maestroModules: [buildMasterMaestro(servoConfigs)],
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

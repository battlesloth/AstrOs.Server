import { describe, it, expect } from 'vitest';
import { TransmissionType } from '@api/models/enums.js';
import {
  buildScriptConfigs,
  buildScriptRun,
  buildScriptUpload,
  joinEvents,
  makeBuffer,
  makeGpioToggle,
  makeServoPulse,
} from './helpers.js';
import { BENCH, buildBenchConfigSync } from './demo-location.js';
import { getScriptFixture, scriptFixtures } from './index.js';

describe('event string helpers', () => {
  it('emits maestro command strings in the frozen wire format', () => {
    const s = makeServoPulse({ channel: 1, position: 1500, timeTillMs: 250 });
    expect(s).toBe('1|250|0|1|1500|0|0');
  });

  it('emits a GPIO toggle as high-with-delay then low-immediate', () => {
    const s = makeGpioToggle({ channel: 1, durMs: 500 });
    expect(s).toBe('5|500|1|1;5|0|1|0');
  });

  it('emits a buffer event with cmdType 0', () => {
    expect(makeBuffer(1000)).toBe('0|1000|0');
  });

  it('joinEvents drops empty strings and semicolon-separates the rest', () => {
    expect(joinEvents(['a', '', 'b'])).toBe('a;b');
  });
});

describe('buildBenchConfigSync', () => {
  it('produces master + padawan configs with bench constants', () => {
    const sync = buildBenchConfigSync();
    expect(sync.type).toBe(TransmissionType.sync);
    expect(sync.configs).toHaveLength(2);

    const [master, padawan] = sync.configs;
    expect(master.address).toBe(BENCH.masterAddress);
    // Production seeds 10 channels per controller in astros_api migration_0;
    // the fixture models the same shape so DEPLOY_CONFIG wire format matches.
    expect(master.gpioChannels).toHaveLength(BENCH.gpioSlotsPerController);
    expect(master.gpioChannels.every((ch) => !ch.enabled)).toBe(true);
    expect(master.gpioChannels.map((ch) => ch.channelNumber)).toEqual(
      Array.from({ length: BENCH.gpioSlotsPerController }, (_, i) => i),
    );
    expect(master.maestroModules).toHaveLength(1);
    expect(master.maestroModules[0].uartChannel).toBe(BENCH.maestroUartChannel);

    expect(padawan.address).toBe('');
    expect(padawan.maestroModules).toHaveLength(0);
    expect(padawan.gpioChannels).toHaveLength(BENCH.gpioSlotsPerController);
    const relay = padawan.gpioChannels.find(
      (ch) => ch.channelNumber === BENCH.padawanGpioRelayChannel,
    );
    expect(relay?.enabled).toBe(true);
    expect(padawan.gpioChannels.filter((ch) => ch.enabled)).toHaveLength(1);
  });

  it('accepts overrides for padawan address and per-channel servo configs', () => {
    const sync = buildBenchConfigSync({
      padawanAddress: 'aa:bb:cc:dd:ee:ff',
      servoConfigs: [{ ch: 1, minPos: 700, maxPos: 2300, homePos: 1500 }],
    });
    expect(sync.configs[1].address).toBe('aa:bb:cc:dd:ee:ff');

    const servoCh = sync.configs[0].maestroModules[0].subModule as {
      boards: { channels: { minPos: number; maxPos: number }[] }[];
    };
    expect(servoCh.boards[0].channels[0].minPos).toBe(700);
    expect(servoCh.boards[0].channels[0].maxPos).toBe(2300);
    expect(servoCh.boards[0].channels).toHaveLength(1);
  });
});

describe('buildScriptConfigs', () => {
  it('routes the master script to the master address and padawan script to the padawan', () => {
    const sync = buildBenchConfigSync({ padawanAddress: 'aa:bb' });
    const configs = buildScriptConfigs(sync, {
      master: 'MASTER_SCRIPT',
      padawan: 'PADAWAN_SCRIPT',
    });

    expect(configs).toHaveLength(2);
    const byAddr = Object.fromEntries(configs.map((c) => [c.address, c.script]));
    expect(byAddr[BENCH.masterAddress]).toBe('MASTER_SCRIPT');
    expect(byAddr['aa:bb']).toBe('PADAWAN_SCRIPT');
  });
});

describe('buildScriptUpload / buildScriptRun', () => {
  it('builds an upload with a provided scriptId and empty run configs', () => {
    const sync = buildBenchConfigSync({ padawanAddress: 'aa' });
    const upload = buildScriptUpload(sync, { master: 'M', padawan: 'P' }, 'script-1');
    expect(upload.scriptId).toBe('script-1');
    expect(upload.type).toBe(TransmissionType.script);

    const run = buildScriptRun(sync, 'script-1');
    expect(run.scriptId).toBe('script-1');
    expect(run.type).toBe(TransmissionType.run);
    expect(run.configs.every((c) => c.script === '')).toBe(true);
  });
});

describe('script fixture registry', () => {
  it('resolves known fixtures by id', () => {
    const fixture = getScriptFixture('wave-hello');
    expect(fixture.id).toBe('wave-hello');

    const sync = buildBenchConfigSync({ padawanAddress: 'aa' });
    const upload = fixture.build(sync, 'my-id');
    expect(upload.scriptId).toBe('my-id');
    expect(upload.configs).toHaveLength(2);
    // Master's script uses maestro cmdType 1; padawan is buffer-only (cmdType 0).
    const master = upload.configs.find((c) => c.address === BENCH.masterAddress);
    expect(master?.script.startsWith('1|')).toBe(true);
    const padawan = upload.configs.find((c) => c.address === 'aa');
    expect(padawan?.script.startsWith('0|')).toBe(true);
  });

  it('throws on an unknown fixture id', () => {
    expect(() => getScriptFixture('nope')).toThrow(/Unknown script fixture/);
  });

  it('registers all three plan fixtures', () => {
    expect(Object.keys(scriptFixtures).sort()).toEqual(
      ['long-runner', 'multi-channel', 'wave-hello'].sort(),
    );
  });
});

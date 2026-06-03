import type { Scenario } from '../runner.js';
import { directCommand } from '../operations/directCommand.js';
import { BENCH } from '../fixtures/demo-location.js';
import { waitStep, type ScenarioFactory, type SessionContext } from './_shared.js';

// GPIO toggle direct-command uses the same wire format as a script gpio event:
// `5|timeTill|channel|value` — cmdType 5 = gpio, per ScriptConverter.
function gpio(channel: number, value: 0 | 1): string {
  return `5|0|${channel}|${value}`;
}

export const directCommandSweep: ScenarioFactory = (session: SessionContext): Scenario => {
  const ch = BENCH.padawanGpioRelayChannel;
  const target = session.padawan;

  return {
    id: 'direct-command-sweep',
    description: 'Four RUN_COMMAND messages blinking the padawan relay LED.',
    act: [
      directCommand({ controller: target, command: gpio(ch, 1) }),
      waitStep(300, 'hold-on-1'),
      directCommand({ controller: target, command: gpio(ch, 0) }),
      waitStep(300, 'hold-off-1'),
      directCommand({ controller: target, command: gpio(ch, 1) }),
      waitStep(300, 'hold-on-2'),
      directCommand({ controller: target, command: gpio(ch, 0) }),
    ],
  };
};

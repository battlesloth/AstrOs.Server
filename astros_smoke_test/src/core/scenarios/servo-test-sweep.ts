import { ModuleSubType } from '@api/models/enums.js';
import type { ServoTest } from '@api/models/servo_test.js';
import type { Scenario } from '../runner.js';
import { servoTest } from '../operations/servoTest.js';
import { BENCH } from '../fixtures/demo-location.js';
import { waitStep, type ScenarioFactory, type SessionContext } from './_shared.js';

export const servoTestSweep: ScenarioFactory = (session: SessionContext): Scenario => {
  const pulse = (ms: number): ServoTest => ({
    controllerAddress: session.master.address,
    controllerName: session.master.name,
    moduleSubType: ModuleSubType.maestro,
    moduleIdx: BENCH.maestroIdx,
    channelNumber: 1,
    msValue: ms,
  });

  return {
    id: 'servo-test-sweep',
    description: 'Master maestro ch 1: min → max → home via SERVO_TEST messages.',
    requiresConfirmation: true,
    act: [
      servoTest(pulse(BENCH.servoMinPos)),
      waitStep(600, 'hold-min'),
      servoTest(pulse(BENCH.servoMaxPos)),
      waitStep(600, 'hold-max'),
      servoTest(pulse(BENCH.servoHomePos)),
    ],
  };
};

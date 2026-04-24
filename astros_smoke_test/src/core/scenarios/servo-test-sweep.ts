import { ModuleSubType } from '@api/models/enums.js';
import type { ServoTest } from '@api/models/servo_test.js';
import type { Scenario } from '../runner.js';
import { servoTest } from '../operations/servoTest.js';
import { BENCH, getServoConfig } from '../fixtures/demo-location.js';
import { waitStep, type ScenarioFactory, type SessionContext } from './_shared.js';

export const servoTestSweep: ScenarioFactory = (session: SessionContext): Scenario => {
  const servo = getServoConfig(1);
  const pulse = (ms: number): ServoTest => ({
    controllerAddress: session.master.address,
    controllerName: session.master.name,
    moduleSubType: ModuleSubType.maestro,
    moduleIdx: BENCH.maestroIdx,
    channelNumber: servo.ch,
    msValue: ms,
  });

  return {
    id: 'servo-test-sweep',
    description: `Master maestro ch ${servo.ch}: min → max → home via SERVO_TEST messages.`,
    requiresConfirmation: true,
    act: [
      servoTest(pulse(servo.minPos)),
      waitStep(600, 'hold-min'),
      servoTest(pulse(servo.maxPos)),
      waitStep(600, 'hold-max'),
      servoTest(pulse(servo.homePos)),
    ],
  };
};

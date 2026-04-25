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
    severity: 'caution',
    // Hold windows give the servo time to physically traverse to the target
    // pulse width. SERVO_TEST is fire-and-forget on the wire (returns in <10ms),
    // so without an explicit pause the next pulse arrives before the previous
    // motion completes and the servo barely moves.
    act: [
      servoTest(pulse(servo.minPos)),
      waitStep(1500, 'hold-min'),
      servoTest(pulse(servo.maxPos)),
      waitStep(1500, 'hold-max'),
      servoTest(pulse(servo.homePos)),
    ],
  };
};

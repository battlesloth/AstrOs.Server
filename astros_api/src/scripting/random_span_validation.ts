import { RandomGpioEvent, RandomMaestroEvent } from '../models/index.js';

const MIN_GAP_MS = 20;
const MIN_SERVO_GAP_MS = 100;
// speed and acceleration share the Maestro's 0–255 range
const MAX_MOTION = 255;

function isMaestroPayload(
  payload: RandomGpioEvent | RandomMaestroEvent,
): payload is RandomMaestroEvent {
  return 'channel' in payload;
}

/**
 * The rules of .docs/protocol.md § C a random span breaks, one message per
 * rule, or [] when the controller would accept it. The time fields must
 * already be rounded to whole ms. Pass isServo false for a GPIO span and for
 * a digital Maestro span: their six servo fields are sent as 0, so the
 * payload's copies are not checked. The UART idx and the GPIO channel number
 * are not in the payload; the converter checks those.
 */
export function randomSpanProblems(
  spanMs: number,
  payload: RandomGpioEvent | RandomMaestroEvent,
  isServo: boolean,
): string[] {
  const problems: string[] = [];
  const { minGapMs, maxGapMs } = payload;
  // isServo means a Maestro payload; a caller that passes it with a payload
  // lacking the Maestro fields gets their problems, not a silent pass
  const maestro =
    isServo || isMaestroPayload(payload) ? (payload as RandomMaestroEvent) : undefined;
  const servo = isServo ? maestro : undefined;

  const sent: Record<string, unknown> = { spanMs, minGapMs, maxGapMs };
  if (maestro !== undefined) {
    sent.channel = maestro.channel;
  }
  if (servo !== undefined) {
    const { minPos, maxPos, minMove, maxMove, speed, acceleration } = servo;
    Object.assign(sent, { minPos, maxPos, minMove, speed, acceleration });
    // A missing maxMove is read like null: no max, sent as 0.
    if (maxMove != null) {
      sent.maxMove = maxMove;
    }
  }
  for (const [field, value] of Object.entries(sent)) {
    if (!Number.isInteger(value)) {
      problems.push(`${field} ${value} is not an integer`);
    }
  }

  // Comparisons are negated so a NaN or missing value fails them too.
  if (maestro !== undefined && !(maestro.channel >= 0)) {
    problems.push(`channel ${maestro.channel} is below 0`);
  }
  if (!(spanMs >= minGapMs)) {
    problems.push(`spanMs ${spanMs} is shorter than minGapMs ${minGapMs}`);
  }
  if (!(maxGapMs >= minGapMs)) {
    problems.push(`maxGapMs ${maxGapMs} is below minGapMs ${minGapMs}`);
  }
  if (!(minGapMs >= MIN_GAP_MS)) {
    problems.push(`minGapMs ${minGapMs} is below ${MIN_GAP_MS}`);
  }

  if (servo === undefined) {
    return problems;
  }

  const { minPos, maxPos, minMove, maxMove, speed, acceleration } = servo;
  const range = maxPos - minPos;

  if (!(minGapMs >= MIN_SERVO_GAP_MS)) {
    problems.push(`minGapMs ${minGapMs} is below ${MIN_SERVO_GAP_MS} for a servo span`);
  }
  if (!(minPos >= 0 && minPos < maxPos && maxPos <= 100)) {
    problems.push(`minPos ${minPos} and maxPos ${maxPos} break 0 ≤ minPos < maxPos ≤ 100`);
  }
  if (!(minMove >= 1 && minMove <= range / 2)) {
    problems.push(`minMove ${minMove} is not between 1 and half the range (${range / 2})`);
  }
  if (maxMove != null && !(maxMove >= minMove && maxMove <= range)) {
    problems.push(`maxMove ${maxMove} is not between minMove ${minMove} and the range ${range}`);
  }
  for (const [field, value] of Object.entries({ speed, acceleration })) {
    if (!(value >= 0 && value <= MAX_MOTION)) {
      problems.push(`${field} ${value} is not between 0 and ${MAX_MOTION}`);
    }
  }

  return problems;
}

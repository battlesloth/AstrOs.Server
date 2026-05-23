import { describe, it, expect } from 'vitest';
import { isPadawanLineActive } from '../padawanLineActive';
import type { TopologyPhase, TopologyStage } from '../types';

const NON_FLASHING_PHASES: TopologyPhase[] = ['idle', 'select', 'done', 'failed'];
const POST_DOWNLOAD_STAGES: TopologyStage[] = ['transfer', 'flash', 'verify', 'reboot'];

describe('isPadawanLineActive', () => {
  it('returns false outside the flashing phase regardless of stage', () => {
    for (const phase of NON_FLASHING_PHASES) {
      expect(isPadawanLineActive(phase, null)).toBe(false);
      expect(isPadawanLineActive(phase, 'download')).toBe(false);
      expect(isPadawanLineActive(phase, 'transfer')).toBe(false);
      expect(isPadawanLineActive(phase, 'reboot')).toBe(false);
    }
  });

  it("returns false during 'flashing' before the first stage update lands", () => {
    expect(isPadawanLineActive('flashing', null)).toBe(false);
    expect(isPadawanLineActive('flashing', undefined)).toBe(false);
  });

  it("returns false during the serial-upload sub-phase ('download')", () => {
    // Regression: previously the padawan lines animated as soon as
    // phase=='flashing', falsely implying ESP-NOW traffic during what
    // is actually a UART server→master transfer.
    expect(isPadawanLineActive('flashing', 'download')).toBe(false);
  });

  it('returns true once the orchestrator has advanced past the serial upload', () => {
    for (const stage of POST_DOWNLOAD_STAGES) {
      expect(isPadawanLineActive('flashing', stage)).toBe(true);
    }
  });
});

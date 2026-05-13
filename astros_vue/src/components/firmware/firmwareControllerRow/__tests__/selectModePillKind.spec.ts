import { describe, it, expect } from 'vitest';
import { selectModePillKind } from '../selectModePillKind';
import { Location } from '@/enums';
import type { FirmwareControllerView } from '@/types/firmware';

function ctrl(overrides: Partial<FirmwareControllerView> = {}): FirmwareControllerView {
  return {
    id: Location.CORE,
    label: 'Core',
    glyph: 'C',
    current: 'v1.4.0',
    status: 'up',
    isMaster: false,
    ...overrides,
  };
}

describe('selectModePillKind', () => {
  it('returns offline when status is down, regardless of target', () => {
    expect(selectModePillKind({ controller: ctrl({ status: 'down' }), target: null })).toBe(
      'offline',
    );
    expect(selectModePillKind({ controller: ctrl({ status: 'down' }), target: 'v1.4.2' })).toBe(
      'offline',
    );
  });

  it('returns offline even when current === target (offline wins over upToDate)', () => {
    // Mutation guard: if the priority order were inverted (upToDate first),
    // an offline controller whose current happens to equal target would
    // render as upToDate, hiding the connectivity issue.
    expect(
      selectModePillKind({
        controller: ctrl({ status: 'down', current: 'v1.4.2' }),
        target: 'v1.4.2',
      }),
    ).toBe('offline');
  });

  it('returns offline even on a would-be downgrade (offline wins over downgrade)', () => {
    expect(
      selectModePillKind({
        controller: ctrl({ status: 'down', current: 'v1.5.0' }),
        target: 'v1.4.2',
      }),
    ).toBe('offline');
  });

  it('returns downgrade when online and current > target', () => {
    expect(selectModePillKind({ controller: ctrl({ current: 'v1.5.0' }), target: 'v1.4.2' })).toBe(
      'downgrade',
    );
  });

  it('returns upToDate when online and current === target', () => {
    expect(selectModePillKind({ controller: ctrl({ current: 'v1.4.2' }), target: 'v1.4.2' })).toBe(
      'upToDate',
    );
  });

  it('returns null when online and target is null (no target chosen yet)', () => {
    expect(selectModePillKind({ controller: ctrl(), target: null })).toBeNull();
  });

  it('returns null when online and current < target (typical upgrade-waiting-to-flash)', () => {
    expect(
      selectModePillKind({ controller: ctrl({ current: 'v1.3.0' }), target: 'v1.4.2' }),
    ).toBeNull();
  });

  it('returns null for needsSynced + upgrade (only `down` triggers offline)', () => {
    expect(
      selectModePillKind({
        controller: ctrl({ status: 'needsSynced', current: 'v1.3.0' }),
        target: 'v1.4.2',
      }),
    ).toBeNull();
  });

  it('treats malformed current as not a downgrade (NaN > 0 is false)', () => {
    expect(
      selectModePillKind({ controller: ctrl({ current: 'not-a-version' }), target: 'v1.4.2' }),
    ).toBeNull();
  });
});

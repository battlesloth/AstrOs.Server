import { describe, it, expect } from 'vitest';
import { FwStage } from '../models/firmware/firmware_messages.js';
import type { FlashJobState } from '../models/firmware/flash_job_state.js';
import { MASTER_POLL_ADDRESS, decidePostDeployHeartbeat } from './post_deploy_heartbeat.js';

function makeJob(version: string): FlashJobState {
  return {
    jobId: 'job-1',
    source: {
      kind: 'github',
      version,
      sha256: 'a'.repeat(64),
      sizeBytes: 1_000,
      displayName: `astros-esp ${version}`,
    },
    controllers: [
      {
        controllerId: '00:00:00:00:00:00',
        stage: FwStage.VersionConfirmed,
        bytesSent: 1_000,
        totalBytes: 1_000,
        detail: '',
        finalVersion: version,
      },
    ],
    startedAt: '2026-05-03T12:00:00Z',
  };
}

describe('decidePostDeployHeartbeat', () => {
  it('no_active_job when currentJob is null (common steady-state)', () => {
    const decision = decidePostDeployHeartbeat(MASTER_POLL_ADDRESS, '1.4.0', null);
    expect(decision).toEqual({ kind: 'no_active_job' });
  });

  it('not_master when POLL came from a padawan MAC during an active flash', () => {
    // Bug-fix pin: a padawan POLL_ACK carrying the same target version
    // must NOT fire the heartbeat. Pre-fix, this returned the fire path.
    const padawanMac = '0a:1b:2c:3d:4e:5f';
    const decision = decidePostDeployHeartbeat(padawanMac, '1.4.0', makeJob('1.4.0'));
    expect(decision).toEqual({ kind: 'not_master', from: padawanMac });
  });

  it('not_master is silent for the typical "padawan polling during flash" case even with mismatched version', () => {
    const padawanMac = 'aa:bb:cc:dd:ee:ff';
    const decision = decidePostDeployHeartbeat(padawanMac, '1.3.0', makeJob('1.4.0'));
    expect(decision).toEqual({ kind: 'not_master', from: padawanMac });
  });

  it('empty_version_during_flash when master POLLs without a firmwareVersion field', () => {
    // Older firmware that hasn't picked up the 1.2.0+ version reporting,
    // or a regression that drops the field. Operator-facing log so the
    // diagnostic gap is visible (otherwise we'd silently rely on the
    // 15s timer fallback).
    const decision = decidePostDeployHeartbeat(MASTER_POLL_ADDRESS, undefined, makeJob('1.4.0'));
    expect(decision).toEqual({
      kind: 'empty_version_during_flash',
      from: MASTER_POLL_ADDRESS,
      jobId: 'job-1',
    });
  });

  it('empty_version_during_flash when master POLL carries an empty firmwareVersion string', () => {
    const decision = decidePostDeployHeartbeat(MASTER_POLL_ADDRESS, '', makeJob('1.4.0'));
    expect(decision.kind).toBe('empty_version_during_flash');
  });

  it('version_mismatch when master POLLs with a different version (stale or wrong-boot)', () => {
    const decision = decidePostDeployHeartbeat(MASTER_POLL_ADDRESS, '1.3.0', makeJob('1.4.0'));
    expect(decision).toEqual({
      kind: 'version_mismatch',
      from: MASTER_POLL_ADDRESS,
      jobId: 'job-1',
      expected: '1.4.0',
      reported: '1.3.0',
    });
  });

  it('fire when master POLLs with the matching target version', () => {
    const decision = decidePostDeployHeartbeat(MASTER_POLL_ADDRESS, '1.4.0', makeJob('1.4.0'));
    expect(decision).toEqual({ kind: 'fire', version: '1.4.0' });
  });

  it('precedence: no_active_job beats every other branch', () => {
    // Even a master POLL with a perfectly-matching version is silent
    // when no flash is in flight.
    const decision = decidePostDeployHeartbeat(MASTER_POLL_ADDRESS, '1.4.0', null);
    expect(decision.kind).toBe('no_active_job');
  });

  it('precedence: not_master beats empty/mismatch/fire', () => {
    // A padawan POLL during flash is quietly ignored regardless of what
    // version field they carry.
    const padawanMac = 'aa:aa:aa:aa:aa:aa';
    expect(decidePostDeployHeartbeat(padawanMac, undefined, makeJob('1.4.0')).kind).toBe(
      'not_master',
    );
    expect(decidePostDeployHeartbeat(padawanMac, '', makeJob('1.4.0')).kind).toBe('not_master');
    expect(decidePostDeployHeartbeat(padawanMac, '1.4.0', makeJob('1.4.0')).kind).toBe(
      'not_master',
    );
  });
});

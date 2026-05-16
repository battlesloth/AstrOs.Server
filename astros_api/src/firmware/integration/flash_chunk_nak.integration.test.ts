// Integration test: chunk NAK + Go-Back-N retransmit.
//
// Validates the chunk_streamer's NAK handling end-to-end against a
// real serial wire. The stub master is configured with autoAckUpload({
// failAtSeq: 2 }), which NAKs FW_CHUNK seq=2 exactly once with
// lastGoodSeq=1, reasonCode='CRC' before resuming normal ACKing — so the
// streamer must rewind to seq=2 and retransmit for the upload to complete.
//
// Sequence covered:
//   1. Pre-populate variantCache via stub POLL_ACK
//   2. Pre-populate upload store with a 20KB firmware blob (5 chunks @ 4096B)
//   3. autoAckUpload({ failAtSeq: 2 }) on stub
//   4. POST /api/firmware/flash kind=upload (JWT-authenticated)
//   5. Observe flashJobStarted
//   6. Observe flashJobDone — only fires if streamer recovered from NAK
//   7. Verify retransmit happened: count FW_CHUNK frames with seq=2 ≥ 2
//   8. Heartbeat → lock release within ~1-2s (well before 15s timer fallback)
//   9. workerErrors empty
//
// The orchestrator's onChunkNak handler is log-only (no WS event), so the
// NAK assertion lives on the stub-side wire-frame buffer rather than on
// WS events. The flashJobDone assertion is the load-bearing proof that the
// streamer's retry logic works.

import { describe, it, expect, afterEach } from 'vitest';
import {
  bootIntegrationHarness,
  type IntegrationHarness,
} from '../../test_harness/integration_harness.js';
import { TransmissionType } from '../../models/enums.js';
import { SerialMessageType } from '../../serial/serial_message.js';
import { MessageHelper } from '../../serial/message_helper.js';

const skipIfNotLinux = process.platform !== 'linux' ? it.skip : it;

// Master's sentinel MAC per project_master_esp_sentinel_mac convention.
// decidePostDeployHeartbeat filters on this exact string so the test must
// match it bit-for-bit.
const MASTER_SENTINEL_MAC = '00:00:00:00:00:00';
const MASTER_VARIANT = 'astros-controller-v1';
const PRE_FLASH_FW = '1.0.0';
const POST_FLASH_FW = '1.5.0';
// 5 chunks of 4096 bytes each — needed so failAtSeq: 2 actually fires.
// The streamer's default chunkSizeBytes=4096 (chunk_streamer.ts:63), so a
// 4096-byte blob would be exactly 1 chunk; we need ≥3 to NAK seq=2.
const BLOB_SIZE = 5 * 4096;

// FW_CHUNK payload (5 US-separated fields per generateFwChunk):
//   transferId<US>seq<US>payloadLen<US>base64Bytes<US>crc16Hex
// Returns the seq number for FW_CHUNK frames; null for malformed payloads.
function chunkSeq(payload: string): number | null {
  const parts = payload.split(MessageHelper.US);
  if (parts.length < 2) return null;
  const n = parseInt(parts[1], 10);
  return Number.isNaN(n) ? null : n;
}

describe('integration: chunk NAK + Go-Back-N recovery', () => {
  let harness: IntegrationHarness | undefined;

  afterEach(async () => {
    await harness?.dispose();
    harness = undefined;
  });

  skipIfNotLinux(
    'autoAckUpload({failAtSeq:2}) → seq=2 NAK once → streamer retransmits → flashJobDone',
    async () => {
      // 1. Boot harness configured for the master only.
      harness = await bootIntegrationHarness({
        masterFirmwareVersion: PRE_FLASH_FW,
        masterVariant: MASTER_VARIANT,
        masterMac: MASTER_SENTINEL_MAC,
      });

      // 2. Pre-populate the controllerVariantCache via stub POLL_ACK.
      harness.stub.writePollAck();
      await harness.waitForVariantCachePopulated(MASTER_SENTINEL_MAC, MASTER_VARIANT);

      // 3. Pre-populate the upload store with a 20KB firmware blob —
      //    5 chunks @ 4096B so failAtSeq:2 has a seq=2 to fire on.
      const binBytes = Buffer.alloc(BLOB_SIZE, 0x42);
      await harness.populateUpload({
        binBytes,
        originalFilename: 'astros-esp-1.5.0.bin',
        version: POST_FLASH_FW,
      });

      // 4. Configure stub: autoAckUpload({failAtSeq:2}) NAKs seq=2 once
      //    with lastGoodSeq=1, reasonCode='CRC' then resumes ACKing.
      //    scriptDeploy: happy single-controller OK so the deploy phase
      //    completes after the upload recovers.
      harness.stub.autoAckUpload({ failAtSeq: 2 });
      harness.stub.scriptDeploy({
        controllers: [
          {
            id: MASTER_SENTINEL_MAC,
            outcome: 'OK',
            finalVersion: POST_FLASH_FW,
            error: '',
          },
        ],
      });

      // 5. POST /api/firmware/flash.
      const flashRes = await fetch(`${harness.httpBaseUrl}/api/firmware/flash`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${harness.authToken}`,
        },
        body: JSON.stringify({
          source: { kind: 'upload' },
          controllers: [MASTER_SENTINEL_MAC],
        }),
      });
      expect(flashRes.status).toBe(200);
      const flashBody = (await flashRes.json()) as { jobId: string };
      expect(flashBody.jobId).toBeTruthy();

      // 6. flashJobStarted.
      const startedEvent = await harness.waitForWsMessage<{
        type: number;
        data: { jobId: string };
      }>((m) => (m as { type?: unknown }).type === TransmissionType.flashJobStarted, 5000);
      expect(startedEvent.data.jobId).toBe(flashBody.jobId);

      // 7. flashJobDone — proves the streamer recovered from the NAK.
      //    Allow 15s headroom for: 5 chunks + retransmit (Go-Back-N from
      //    seq=2) + deploy walk on slow CI.
      const doneEvent = await harness.waitForWsMessage<{
        type: number;
        data: { jobId: string };
      }>((m) => (m as { type?: unknown }).type === TransmissionType.flashJobDone, 15_000);
      expect(doneEvent.data.jobId).toBe(flashBody.jobId);

      // 8. Verify the retransmit actually happened: seq=2 chunk should
      //    appear at least twice in stub.receivedFrames() — once
      //    originally, at least once after the NAK as the streamer
      //    rewinds and retransmits per Go-Back-N. We assert >=2 (not
      //    ==2) because the streamer may retransmit additional times if
      //    timing/window state warrants; the load-bearing claim is that
      //    a retransmit happened at all.
      const seq2Chunks = harness.stub
        .receivedFrames()
        .filter((f) => f.type === SerialMessageType.FW_CHUNK && chunkSeq(f.payload) === 2);
      expect(seq2Chunks.length).toBeGreaterThanOrEqual(2);

      // 9. Stub master emits POLL_ACK with the post-flash firmwareVersion.
      //    decidePostDeployHeartbeat → 'fire' → lock release WELL BEFORE
      //    the 15-sec reboot-timer fallback. Snapshot WS buffer length
      //    BEFORE emitting so the wait below only sees the heartbeat-driven
      //    release, not the connect-time lockStateChanged{locked:false}
      //    snapshot the server sent on WS open.
      const snapshot = harness.receivedWsMessages.length;
      harness.stub.writePollAck({ firmwareVersion: POST_FLASH_FW });

      // 10. lockStateChanged{locked:false} within 5s — if it takes 15+
      //     seconds, the heartbeat path is broken and the timer fallback
      //     is releasing instead.
      const lockReleased = await harness.waitForWsMessage<{
        type: number;
        locked: boolean;
      }>(
        (m) => {
          const msg = m as { type?: unknown; locked?: unknown };
          return msg.type === TransmissionType.lockStateChanged && msg.locked === false;
        },
        5000,
        snapshot,
      );
      expect(lockReleased.locked).toBe(false);

      // 11. Final assertion: the Worker stayed healthy through the whole
      //     run. Placed LAST so a Worker that died midway is caught even
      //     if other assertions happened to pass (stale message replay
      //     could mask earlier breakage).
      expect(harness.workerErrors).toEqual([]);
      // Diagnostic surfaces — empty in the happy path. Non-empty means
      // wire-format drift between MessageGenerator and the stub's parsers
      // (parsingErrors) or socat dying mid-test (unexpectedExits). Either
      // way the test failure points at the actual cause instead of a
      // mysterious downstream timeout.
      expect(harness.stub.parsingErrors()).toEqual([]);
      expect(harness.pty.unexpectedExits).toEqual([]);
    },
    60_000, // generous: includes potential first-time `npm run build` + WS round-trips
  );
});

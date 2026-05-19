import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  FIRMWARE_UPLOAD_SIZE_LIMIT_BYTES,
  firmwareUploadLimitHandler,
  handleFirmwareUpload,
} from './firmware_upload_controller.js';
import {
  FirmwareUploadValidationError,
  type FirmwareUploadStore,
} from '../firmware/firmware_upload_store.js';
import type { StoredUpload } from '../models/firmware/upload.js';
import { logger } from '../logger.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mockRes(): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

interface FakeStore {
  store: ReturnType<typeof vi.fn>;
}

function fakeStore(): FakeStore {
  return { store: vi.fn() };
}

// Build a fake UploadedFile whose .mv() resolves successfully — matches the
// express-fileupload shape the controller reads. Tests that need .mv() to
// fail wire that path explicitly with mockImplementation.
function fakeFile(name = 'firmware.bin'): {
  name: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mv: any;
} {
  return {
    name,
    mv: vi.fn((_path: string, cb: (err: Error | null) => void) => cb(null)),
  };
}

const sampleStored: StoredUpload = {
  path: '/var/lib/astros/firmware/upload-abc.bin',
  sha256: 'a'.repeat(64),
  sizeBytes: 1_200_000,
  meta: {
    uploadId: 'abc-uuid',
    originalFilename: 'firmware.bin',
    projectName: 'AstrOs.ESP',
    version: '1.4.2',
    uploadedAt: '2026-05-16T08:00:00Z',
    sizeBytes: 1_200_000,
  },
};

describe('Firmware Upload Controller — POST /api/firmware/upload', () => {
  let store: FakeStore;

  beforeEach(() => {
    store = fakeStore();
  });

  it('returns 200 + StoredUpload projection on happy path; calls store() with tempPath + original filename', async () => {
    store.store.mockResolvedValueOnce(sampleStored);
    const file = fakeFile('astros-esp-1.4.2-lolin_d32_pro-app.bin');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const req: any = { files: { file } };
    const res = mockRes();

    await handleFirmwareUpload(store as unknown as FirmwareUploadStore, req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      sha256: sampleStored.sha256,
      sizeBytes: sampleStored.sizeBytes,
      meta: sampleStored.meta,
    });
    expect(store.store).toHaveBeenCalledTimes(1);
    // First arg is the tempPath (absolute, ends with .bin); second is the
    // operator-supplied filename verbatim.
    const [tempPath, originalFilename] = store.store.mock.calls[0];
    expect(typeof tempPath).toBe('string');
    expect(tempPath).toMatch(/astros-firmware-upload-.*\.bin$/);
    expect(originalFilename).toBe('astros-esp-1.4.2-lolin_d32_pro-app.bin');
  });

  it('omits the server-internal `path` field from the response', async () => {
    // Pin the response-shape contract — leaking the on-disk path would expose
    // an absolute server filesystem location to clients. The test asserts on
    // the EXACT keys to catch a future regression that spreads `...stored`.
    store.store.mockResolvedValueOnce(sampleStored);
    const req = { files: { file: fakeFile() } };
    const res = mockRes();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await handleFirmwareUpload(store as unknown as FirmwareUploadStore, req as any, res);

    const body = res.json.mock.calls[0][0];
    expect(Object.keys(body).sort()).toEqual(['meta', 'sha256', 'sizeBytes']);
    expect(body).not.toHaveProperty('path');
  });

  it('returns 400 invalid_body when req.files is missing', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const req: any = {};
    const res = mockRes();

    await handleFirmwareUpload(store as unknown as FirmwareUploadStore, req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'invalid_body',
      detail: expect.stringMatching(/file/i),
    });
    expect(store.store).not.toHaveBeenCalled();
  });

  it('returns 400 invalid_body when req.files.file is missing', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const req: any = { files: {} };
    const res = mockRes();

    await handleFirmwareUpload(store as unknown as FirmwareUploadStore, req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(store.store).not.toHaveBeenCalled();
  });

  it('returns 500 upload_io_failed when file.mv() rejects', async () => {
    const file = fakeFile();
    file.mv = vi.fn((_path: string, cb: (err: Error | null) => void) => cb(new Error('disk full')));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const req: any = { files: { file } };
    const res = mockRes();

    await handleFirmwareUpload(store as unknown as FirmwareUploadStore, req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: 'upload_io_failed',
      detail: expect.stringContaining('disk full'),
    });
    expect(store.store).not.toHaveBeenCalled();
  });

  it('returns 400 invalid_firmware when store() throws FirmwareUploadValidationError (project mismatch)', async () => {
    // Controller routes 400 vs 500 by `instanceof`, not message text.
    store.store.mockRejectedValueOnce(
      new FirmwareUploadValidationError(
        'project_mismatch',
        'firmware upload project name mismatch: got "Other", expected "AstrOs.ESP"',
      ),
    );
    const req = { files: { file: fakeFile() } };
    const res = mockRes();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await handleFirmwareUpload(store as unknown as FirmwareUploadStore, req as any, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'invalid_firmware',
      detail: expect.stringMatching(/project name mismatch/),
    });
  });

  it('returns 400 invalid_firmware on unparseable_version, too_short, and invalid_header codes', async () => {
    const cases: {
      code: 'unparseable_version' | 'too_short' | 'invalid_header';
      detail: string;
    }[] = [
      {
        code: 'unparseable_version',
        detail: 'firmware upload version unparseable: "not-a-version"',
      },
      { code: 'too_short', detail: 'firmware upload too short: read 100 bytes, need at least 304' },
      {
        code: 'invalid_header',
        detail: 'esp_app_desc magic word mismatch: got 0x0, expected 0xabcd5432',
      },
    ];
    for (const { code, detail } of cases) {
      store.store.mockRejectedValueOnce(new FirmwareUploadValidationError(code, detail));
      const req = { files: { file: fakeFile() } };
      const res = mockRes();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await handleFirmwareUpload(store as unknown as FirmwareUploadStore, req as any, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].error).toBe('invalid_firmware');
      expect(res.json.mock.calls[0][0].detail).toBe(detail);
    }
  });

  it('returns 500 upload_persist_failed on an unknown store() error', async () => {
    // Unrecognized error message → 500 bucket. Pin so a future operator-
    // diagnostic message change doesn't accidentally promote to 400 (which
    // would imply "you can fix the file"; an unknown error means "server
    // problem, retry").
    store.store.mockRejectedValueOnce(new Error('mkdir EACCES /var/lib/astros'));
    const req = { files: { file: fakeFile() } };
    const res = mockRes();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await handleFirmwareUpload(store as unknown as FirmwareUploadStore, req as any, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: 'upload_persist_failed',
      detail: expect.stringContaining('EACCES'),
    });
  });
});

describe('firmwareUploadLimitHandler — oversize multipart body', () => {
  it('emits 413 with JSON error=payload_too_large so the Vue mapper recognizes it', () => {
    // Mutation guard: if a regression switches back to `responseOnLimit`
    // with a plain string, `mapHttpErrorToFlashEnvelope` falls through to
    // `internal_server_error` and the operator loses the actionable copy.
    // This pins the wire shape (JSON, typed error code, integer status).
    const res = mockRes();
    // Minimum shape express-fileupload's RequestHandler signature
    // requires: `headers` is always present on a real Request (Express
    // populates it; the cast just satisfies the type-check). `ip` is
    // optional in the production code via `?? 'unknown'`, so omit here.
    const req = {
      headers: { 'content-length': '52428801' },
      ip: '127.0.0.1',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    firmwareUploadLimitHandler(req, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(413);
    expect(res.json).toHaveBeenCalledTimes(1);
    const body = res.json.mock.calls[0][0];
    expect(body.error).toBe('payload_too_large');
    // Detail names the limit so the operator can size their file correctly
    // without reading server logs or source code.
    expect(body.detail).toMatch(/\d+\s*MB/);
  });

  it('logs a server-side breadcrumb with ip + content-length when emitting 413', () => {
    // The 413 JSON body is the operator's signal; the server log line is
    // the admin's signal. Without this log, "my upload keeps failing"
    // tickets have no server-side trace to grep for. Pin the breadcrumb
    // shape so a future regression that drops the log (or strips the
    // content-length / ip context) fails this test.
    const loggerWarnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    try {
      const res = mockRes();
      const req = {
        headers: { 'content-length': '99999999' },
        ip: '203.0.113.7',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any;
      firmwareUploadLimitHandler(req, res, vi.fn());
      const warnCalls = loggerWarnSpy.mock.calls.flat().join(' ');
      expect(warnCalls).toContain('payload_too_large');
      expect(warnCalls).toContain('203.0.113.7');
      expect(warnCalls).toContain('99999999');
    } finally {
      loggerWarnSpy.mockRestore();
    }
  });

  it('is idempotent: a second call after the first response is sent returns silently (no double-send throw)', () => {
    // express-fileupload calls `limitHandler` once per oversize file. A
    // hostile multi-file POST would invoke this twice; the second call
    // hitting `res.status().json()` on an already-sent response throws
    // "Cannot set headers after they are sent" — surfacing as a 500 on
    // top of the operator's 413. The `headersSent` guard makes the
    // second call a no-op.
    const loggerWarnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    try {
      const res = mockRes();
      const req = {
        headers: { 'content-length': '99999999' },
        ip: '127.0.0.1',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any;

      // First call: full path runs (status + json + log).
      firmwareUploadLimitHandler(req, res, vi.fn());
      expect(res.status).toHaveBeenCalledTimes(1);
      expect(res.json).toHaveBeenCalledTimes(1);
      const firstLogCount = loggerWarnSpy.mock.calls.length;
      expect(firstLogCount).toBeGreaterThan(0);

      // Simulate Express's post-send state.
      res.headersSent = true;

      // Second call: must early-return without touching res or logger.
      firmwareUploadLimitHandler(req, res, vi.fn());
      expect(res.status).toHaveBeenCalledTimes(1);
      expect(res.json).toHaveBeenCalledTimes(1);
      // The warn log doesn't fire on the second pass either — the
      // breadcrumb is already in the server log from the first call.
      expect(loggerWarnSpy.mock.calls.length).toBe(firstLogCount);
    } finally {
      loggerWarnSpy.mockRestore();
    }
  });

  it('exports the size limit so api_server can wire it onto fileUpload({limits})', () => {
    // The constant lives with the handler that produces the matching error
    // body. Pinning the value here would force a churn on every limit bump;
    // pinning it's a positive integer is the right granularity.
    expect(Number.isInteger(FIRMWARE_UPLOAD_SIZE_LIMIT_BYTES)).toBe(true);
    expect(FIRMWARE_UPLOAD_SIZE_LIMIT_BYTES).toBeGreaterThan(0);
  });
});

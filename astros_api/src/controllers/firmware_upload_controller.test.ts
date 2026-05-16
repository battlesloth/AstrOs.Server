import { describe, it, expect, beforeEach, vi } from 'vitest';
import { handleFirmwareUpload } from './firmware_upload_controller.js';
import type { FirmwareUploadStore } from '../firmware/firmware_upload_store.js';
import type { StoredUpload } from '../models/firmware/upload.js';

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

  it('returns 400 invalid_firmware when store() throws a validation error (project mismatch)', async () => {
    // The store's actual throw messages drive the controller's 400-vs-500
    // routing. Pin both well-known validation paths so a regression that
    // swallows the "project name mismatch" wording would silently 500.
    store.store.mockRejectedValueOnce(
      new Error('firmware upload project name mismatch: got "Other", expected "AstrOs.ESP"'),
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

  it('returns 400 invalid_firmware when store() throws "version unparseable"', async () => {
    store.store.mockRejectedValueOnce(
      new Error('firmware upload version unparseable: "not-a-version"'),
    );
    const req = { files: { file: fakeFile() } };
    const res = mockRes();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await handleFirmwareUpload(store as unknown as FirmwareUploadStore, req as any, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error).toBe('invalid_firmware');
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

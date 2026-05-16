import { Router } from 'express';
import { UploadedFile } from 'express-fileupload';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { v4 as uuid_v4 } from 'uuid';
import { logger } from '../logger.js';
import type { FirmwareUploadStore } from '../firmware/firmware_upload_store.js';

const route = '/firmware/upload';

// `FirmwareUploadStore.store()`'s public contract:
//   - tempPath is unconditionally consumed (renamed on success, unlinked on
//     any failure including validation throws).
//   - Throws on bad esp_app_desc header, project-name mismatch, unparseable
//     version, hash/persist failures.
//   - Concurrent calls serialize via the store's internal in-flight chain.
//
// This controller is a thin adapter: write the multipart payload to a tmp
// path, hand it off, surface the result. The store owns cleanup, locking,
// and atomic-promote semantics — do NOT layer additional bookkeeping here.

export function registerFirmwareUploadRoutes(
  router: Router,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authHandler: any,
  uploadStore: FirmwareUploadStore,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  router.post(route, authHandler, (req: any, res: any) =>
    handleFirmwareUpload(uploadStore, req, res),
  );
}

export async function handleFirmwareUpload(
  uploadStore: FirmwareUploadStore,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  req: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  res: any,
): Promise<void> {
  if (!req.files || !req.files.file) {
    res.status(400).json({ error: 'invalid_body', detail: 'multipart `file` field is required' });
    return;
  }

  const file = req.files.file as UploadedFile;
  // Random suffix in the temp filename so two concurrent uploads from
  // different operators don't collide on the same tmp path. The store's
  // serialization prevents racing the destination slot, but two .mv()s
  // to the same tmp path would clobber each other before store() ever
  // sees them.
  const tempPath = join(tmpdir(), `astros-firmware-upload-${uuid_v4()}.bin`);

  try {
    await new Promise<void>((resolve, reject) => {
      file.mv(tempPath, (err) => (err ? reject(err) : resolve()));
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    logger.error(err, 'firmware upload: failed to stage temp file');
    res.status(500).json({ error: 'upload_io_failed', detail });
    return;
  }

  try {
    const stored = await uploadStore.store(tempPath, file.name);
    // Operator-facing response strips `path` (server-internal location)
    // and keeps only the fields the UI needs to surface "server accepted
    // this binary, here's what it parsed."
    res.status(200).json({
      sha256: stored.sha256,
      sizeBytes: stored.sizeBytes,
      meta: stored.meta,
    });
  } catch (err) {
    // store() throws Error on validation (project mismatch, unparseable
    // version, header parse) AND on IO failures (mkdir, rename, fs read).
    // The two are operator-distinguishable today only by message text;
    // route validation failures to 400 and treat the unknown bucket as
    // 500. The store has already unlinked tempPath on its way out.
    const detail = err instanceof Error ? err.message : String(err);
    const isValidation =
      /project name mismatch|unparseable|too short|esp_app_desc/i.test(detail);
    if (isValidation) {
      logger.warn(`firmware upload rejected: ${detail}`);
      res.status(400).json({ error: 'invalid_firmware', detail });
      return;
    }
    logger.error(err, 'firmware upload: store() failed');
    res.status(500).json({ error: 'upload_persist_failed', detail });
  }
}

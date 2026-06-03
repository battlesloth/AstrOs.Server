import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Kysely } from 'kysely';
import { Database } from '../types.js';
import { createKyselyConnection, migrateToLatest } from '../database.js';
import { AudioFileRepository } from './audio_file_repository.js';

describe('AudioFileRepository', () => {
  let db: Kysely<Database>;

  beforeEach(async () => {
    db = createKyselyConnection().db;
    await migrateToLatest(db);
  });

  afterEach(async () => {
    await db.destroy();
  });

  it('should insert and retrieve audio files', async () => {
    const repo = new AudioFileRepository(db);

    await repo.insertFile('file-1', 'laser.wav');
    await repo.insertFile('file-2', 'beep.wav');

    const files = await repo.getAudioFiles();

    expect(files).toHaveLength(2);
    expect(files.map((f) => f.fileName)).toContain('laser.wav');
    expect(files.map((f) => f.fileName)).toContain('beep.wav');
  });

  it('should return empty array when no files exist', async () => {
    const repo = new AudioFileRepository(db);

    const files = await repo.getAudioFiles();

    expect(files).toHaveLength(0);
  });

  it('should find files needing duration', async () => {
    const repo = new AudioFileRepository(db);

    await repo.insertFile('file-1', 'laser.wav');
    await repo.insertFile('file-2', 'beep.wav');

    // Both have duration 0 after insert
    const needsDuration = await repo.filesNeedingDuration();
    expect(needsDuration).toHaveLength(2);

    // Update one
    await repo.updateFileDuration('file-1', 5000);

    const needsDurationAfter = await repo.filesNeedingDuration();
    expect(needsDurationAfter).toHaveLength(1);
    expect(needsDurationAfter[0]).toBe('file-2');
  });

  it('should update file duration', async () => {
    const repo = new AudioFileRepository(db);

    await repo.insertFile('file-1', 'laser.wav');
    const updated = await repo.updateFileDuration('file-1', 3500);

    expect(updated).toBe(true);

    const files = await repo.getAudioFiles();
    expect(files[0].duration).toBe(3500);
  });

  it('should delete a file', async () => {
    const repo = new AudioFileRepository(db);

    await repo.insertFile('file-1', 'laser.wav');
    const deleted = await repo.deleteFile('file-1');

    expect(deleted).toBe(true);

    const files = await repo.getAudioFiles();
    expect(files).toHaveLength(0);
  });

  it('should return false when deleting nonexistent file', async () => {
    const repo = new AudioFileRepository(db);

    const deleted = await repo.deleteFile('nonexistent');

    expect(deleted).toBe(false);
  });
});

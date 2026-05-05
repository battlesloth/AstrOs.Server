import { describe, it, expect } from 'vitest';
import { existsSync } from 'fs';
import { createPtyPair } from './pty_pair.js';

const skipIfNotLinux = process.platform !== 'linux' ? it.skip : it;

describe('createPtyPair', () => {
  skipIfNotLinux('emits two distinct PTY paths under /dev/pts/', async () => {
    const pty = await createPtyPair();
    try {
      expect(pty.serverPath).toMatch(/^\/dev\/pts\/\d+$/);
      expect(pty.masterPath).toMatch(/^\/dev\/pts\/\d+$/);
      expect(pty.serverPath).not.toBe(pty.masterPath);
      expect(existsSync(pty.serverPath)).toBe(true);
      expect(existsSync(pty.masterPath)).toBe(true);
    } finally {
      await pty.dispose();
    }
  });

  skipIfNotLinux('dispose() releases the socat process and PTY paths', async () => {
    const pty = await createPtyPair();
    const path = pty.serverPath;
    await pty.dispose();
    // After dispose, the PTY device should be gone (kernel reaps when socat exits).
    // Allow brief grace for the kernel close.
    await new Promise((r) => setTimeout(r, 100));
    expect(existsSync(path)).toBe(false);
  });
});

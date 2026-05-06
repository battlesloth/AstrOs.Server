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
    // After dispose, the PTY device should be gone (kernel reaps when socat
    // exits). Cleanup is kernel-async — usually completes in <50ms but can
    // exceed 100ms on a loaded CI runner. Poll instead of sleeping a fixed
    // duration so the test's wall-clock cost stays minimal on a quiet
    // machine while tolerating slow runners up to the 2s ceiling.
    const deadline = Date.now() + 2000;
    while (existsSync(path) && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 25));
    }
    expect(existsSync(path)).toBe(false);
  });
});

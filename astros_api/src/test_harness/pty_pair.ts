import { spawn } from 'child_process';

export interface PtyPair {
  serverPath: string; // /dev/pts/N — server-side ApiServer opens this
  masterPath: string; // /dev/pts/M — stub master opens this
  dispose(): Promise<void>;
}

const PTY_LINE_REGEX = /N PTY is (\/dev\/pts\/\d+)/;
const SOCAT_STARTUP_TIMEOUT_MS = 5000;

export async function createPtyPair(): Promise<PtyPair> {
  // Linux-only: PTY_LINE_REGEX matches the `/dev/pts/N` paths Linux's socat
  // emits. macOS socat produces `/dev/ttysNNN`-style paths, so the regex
  // would silently miss matches and the timeout would fire 5s later. Rather
  // than maintain a per-platform regex matrix for a developer convenience
  // we don't have hardware to test on, gate the whole helper to Linux.
  if (process.platform !== 'linux') {
    throw new Error(
      `PtyPair: socat-based PTYs are only supported on Linux (got ${process.platform})`,
    );
  }

  const child = spawn('socat', ['-d', '-d', 'pty,raw,echo=0', 'pty,raw,echo=0'], {
    stdio: ['ignore', 'ignore', 'pipe'],
  });

  let serverPath: string | undefined;
  let masterPath: string | undefined;

  const ready = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`socat did not emit PTY paths within ${SOCAT_STARTUP_TIMEOUT_MS}ms`));
    }, SOCAT_STARTUP_TIMEOUT_MS);

    const stderr = child.stderr;
    if (!stderr) {
      clearTimeout(timer);
      reject(new Error('socat process has no stderr stream (unexpected)'));
      return;
    }

    // Node stream chunks are not guaranteed to align to newlines, so a
    // PTY line like `... N PTY is /dev/pts/3` can split across two 'data'
    // events. Splitting each chunk in isolation would miss the line in
    // both halves and the helper would flap on SOCAT_STARTUP_TIMEOUT_MS.
    // Buffer text across chunks; pop the trailing element back into the
    // buffer because it may be a partial line (or empty if the chunk
    // ended on '\n').
    //
    // Once both PTY paths are captured we detach the listener and clear
    // the buffer. socat run with `-d -d` keeps logging through the
    // harness lifetime (data-transfer-loop notices, etc.); leaving the
    // listener attached would accumulate that output indefinitely.
    let stderrBuffer = '';
    const onStderrData = (chunk: Buffer): void => {
      stderrBuffer += chunk.toString('utf8');
      const lines = stderrBuffer.split('\n');
      stderrBuffer = lines.pop() ?? '';
      for (const line of lines) {
        const match = line.match(PTY_LINE_REGEX);
        if (!match) continue;
        if (serverPath === undefined) {
          serverPath = match[1];
        } else if (masterPath === undefined) {
          masterPath = match[1];
          clearTimeout(timer);
          stderr.off('data', onStderrData);
          stderrBuffer = '';
          resolve();
        }
      }
    };
    stderr.on('data', onStderrData);

    child.on('exit', (code, signal) => {
      if (serverPath === undefined || masterPath === undefined) {
        clearTimeout(timer);
        reject(
          new Error(`socat exited before emitting both PTY paths (code=${code}, signal=${signal})`),
        );
      }
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(
        new Error(
          `socat spawn failed: ${err.message}. Is socat installed? Try \`apt-get install socat\` or \`brew install socat\`.`,
        ),
      );
    });
  });

  await ready;

  const dispose = async (): Promise<void> => {
    if (child.exitCode !== null) return;
    child.kill('SIGTERM');
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        resolve();
      }, 1000);
      child.on('exit', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  };

  // Both paths are guaranteed set by the time `ready` resolves.
  // The conditional guard satisfies TypeScript without non-null assertions.
  if (serverPath === undefined || masterPath === undefined) {
    throw new Error('socat PTY paths were not captured (internal error)');
  }

  return { serverPath, masterPath, dispose };
}

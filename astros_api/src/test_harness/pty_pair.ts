import { spawn } from 'child_process';

export interface PtyPair {
  serverPath: string; // /dev/pts/N — server-side ApiServer opens this
  masterPath: string; // /dev/pts/M — stub master opens this
  dispose(): Promise<void>;
}

const PTY_LINE_REGEX = /N PTY is (\/dev\/pts\/\d+)/;
const SOCAT_STARTUP_TIMEOUT_MS = 5000;

export async function createPtyPair(): Promise<PtyPair> {
  if (process.platform === 'win32') {
    throw new Error('PtyPair: socat-based PTYs are not supported on Windows');
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

    if (!child.stderr) {
      clearTimeout(timer);
      reject(new Error('socat process has no stderr stream (unexpected)'));
      return;
    }

    child.stderr.on('data', (chunk: Buffer) => {
      for (const line of chunk.toString('utf8').split('\n')) {
        const match = line.match(PTY_LINE_REGEX);
        if (!match) continue;
        if (serverPath === undefined) {
          serverPath = match[1];
        } else if (masterPath === undefined) {
          masterPath = match[1];
          clearTimeout(timer);
          resolve();
        }
      }
    });

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

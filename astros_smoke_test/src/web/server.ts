import express from 'express';
import { SerialPort } from 'serialport';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import { v4 as uuidv4 } from 'uuid';
import {
  AlreadyConnectedError,
  NotConnectedError,
  PortInUseError,
  connect,
  disconnect,
  getState,
  getTransport,
} from './state.js';
import { addSubscriber, removeSubscriber } from './sse.js';
import { panicStop } from '../core/operations/panicStop.js';
import { buildBenchConfigSync } from '../core/fixtures/demo-location.js';
import { buildScriptRun } from '../core/fixtures/helpers.js';

const PORT = 5174;
const HOST = '127.0.0.1';
const isDev = process.env.NODE_ENV !== 'production';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(__dirname, '..', '..');
const distWebPath = join(packageRoot, 'dist', 'web');
const viteConfigPath = join(packageRoot, 'vite.web.config.ts');

async function main(): Promise<void> {
  const app = express();
  app.use(express.json());

  app.get('/api/state', (_req, res) => {
    res.json(getState());
  });

  app.get('/api/ports', async (_req, res) => {
    try {
      const ports = await SerialPort.list();
      res.json({ ports });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ message });
    }
  });

  app.post('/api/connect', async (req, res) => {
    const body = req.body as { port?: string; baud?: number };
    if (!body.port || !body.baud) {
      res.status(400).json({ message: 'port and baud are required' });
      return;
    }
    try {
      const state = await connect(body.port, body.baud);
      res.json(state);
    } catch (err) {
      if (err instanceof PortInUseError) {
        res.status(409).json({ message: err.message });
      } else if (err instanceof AlreadyConnectedError) {
        res.status(409).json({ message: err.message });
      } else {
        const message = err instanceof Error ? err.message : String(err);
        res.status(500).json({ message });
      }
    }
  });

  app.post('/api/disconnect', async (_req, res) => {
    try {
      await disconnect();
      res.json({ ok: true });
    } catch (err) {
      if (err instanceof NotConnectedError) {
        res.status(409).json({ message: err.message });
      } else {
        const message = err instanceof Error ? err.message : String(err);
        res.status(500).json({ message });
      }
    }
  });

  app.post('/api/panic', async (_req, res) => {
    const t = getTransport();
    if (!t) {
      res.status(409).json({ message: 'Not connected' });
      return;
    }
    const state = getState();
    const sync = buildBenchConfigSync({ padawanAddress: state.padawan?.address ?? '' });
    const run = buildScriptRun(sync, `cockpit-panic-${uuidv4().slice(0, 8)}`);
    const result = await panicStop(run).run({ transport: t });
    res.json({ ok: result.ok, durationMs: result.durationMs });
  });

  app.get('/api/events', (req, res) => {
    addSubscriber(res);
    req.on('close', () => removeSubscriber(res));
  });

  if (isDev) {
    const { createServer } = await import('vite');
    const vite = await createServer({
      configFile: viteConfigPath,
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    if (!existsSync(distWebPath)) {
      console.error(
        `[smoke-cockpit] No build found at ${distWebPath}. Run 'npm run web:build' first.`,
      );
      process.exit(1);
    }
    app.use(express.static(distWebPath));
    app.get('*', (_req, res) => {
      res.sendFile(join(distWebPath, 'index.html'));
    });
  }

  app.listen(PORT, HOST, () => {
    console.log(`[smoke-cockpit] http://localhost:${PORT}  (${isDev ? 'dev' : 'prod'})`);
  });
}

main().catch((err) => {
  console.error('[smoke-cockpit] failed to start:', err);
  process.exit(1);
});

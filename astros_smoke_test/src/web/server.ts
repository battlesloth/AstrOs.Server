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
  clearActiveRun,
  connect,
  disconnect,
  getState,
  getTransport,
  setActiveRun,
} from './state.js';
import { addSubscriber, broadcast, removeSubscriber } from './sse.js';
import { panicStop } from '../core/operations/panicStop.js';
import {
  buildBenchConfigSync,
  buildMasterControlModule,
  buildPadawanControlModule,
} from '../core/fixtures/demo-location.js';
import { buildScriptRun } from '../core/fixtures/helpers.js';
import { ScenarioRunner, type RunnerEvent } from '../core/runner.js';
import { listScenarioIds, scenarios, type SessionContext } from '../core/scenarios/index.js';
import { createLogger } from '../core/log.js';

const log = createLogger('server');

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
    log.debug('POST /api/connect', { port: body.port, baud: body.baud });
    if (!body.port || !body.baud) {
      res.status(400).json({ message: 'port and baud are required' });
      return;
    }
    try {
      const state = await connect(body.port, body.baud);
      res.json(state);
    } catch (err) {
      if (err instanceof PortInUseError) {
        log.warn('connect refused: port in use', { port: body.port });
        res.status(409).json({ message: err.message });
      } else if (err instanceof AlreadyConnectedError) {
        log.warn('connect refused: already connected');
        res.status(409).json({ message: err.message });
      } else {
        log.error('connect failed', err instanceof Error ? err : { err: String(err) });
        const message = err instanceof Error ? err.message : String(err);
        res.status(500).json({ message });
      }
    }
  });

  app.post('/api/disconnect', async (_req, res) => {
    log.debug('POST /api/disconnect');
    try {
      await disconnect();
      res.json({ ok: true });
    } catch (err) {
      if (err instanceof NotConnectedError) {
        log.warn('disconnect refused: not connected');
        res.status(409).json({ message: err.message });
      } else {
        log.error('disconnect failed', err instanceof Error ? err : { err: String(err) });
        const message = err instanceof Error ? err.message : String(err);
        res.status(500).json({ message });
      }
    }
  });

  app.post('/api/panic', async (_req, res) => {
    log.debug('POST /api/panic');
    const t = getTransport();
    if (!t) {
      res.status(409).json({ message: 'Not connected' });
      return;
    }
    const state = getState();
    const sync = buildBenchConfigSync({ padawanAddress: state.padawan?.address ?? '' });
    const run = buildScriptRun(sync, `cockpit-panic-${uuidv4().slice(0, 8)}`);
    const result = await panicStop(run).run({ transport: t });
    log.info('panic stop fired', { ok: result.ok, durationMs: result.durationMs });
    res.json({ ok: result.ok, durationMs: result.durationMs });
  });

  app.get('/api/scenarios', (_req, res) => {
    // Build a fake session purely so factories can produce metadata for the list.
    // The transport is never touched — these scenarios are only inspected, not run.
    const fakeSession: SessionContext = {
      transport: {
        open: async () => undefined,
        close: async () => undefined,
        write: async () => undefined,
        on() {
          return this;
        },
        off() {
          return this;
        },
      } as never,
      configSync: buildBenchConfigSync(),
      master: buildMasterControlModule(),
      padawan: buildPadawanControlModule(''),
    };
    const list = listScenarioIds().map((id) => {
      const sc = scenarios[id](fakeSession);
      return {
        id: sc.id,
        description: sc.description,
        requiresConfirmation: sc.requiresConfirmation === true,
      };
    });
    res.json({ scenarios: list });
  });

  app.post('/api/run/:id', async (req, res) => {
    const id = req.params.id;
    log.debug('POST /api/run/:id', { id });
    const factory = scenarios[id];
    if (!factory) {
      log.warn('run refused: unknown scenario', { id });
      res.status(404).json({ message: `Unknown scenario: ${id}` });
      return;
    }

    const t = getTransport();
    if (!t) {
      log.warn('run refused: not connected', { id });
      res.status(409).json({ message: 'Not connected' });
      return;
    }

    if (getState().activeRunId !== null) {
      log.warn('run refused: another run in progress', { id });
      res.status(409).json({ message: 'Another run is in progress' });
      return;
    }

    const padawanAddr = getState().padawan?.address ?? '';
    const session: SessionContext = {
      transport: t,
      configSync: buildBenchConfigSync({ padawanAddress: padawanAddr }),
      master: buildMasterControlModule(),
      padawan: buildPadawanControlModule(padawanAddr),
    };
    const scenario = factory(session);

    const body = (req.body ?? {}) as { confirm?: boolean };
    if (scenario.requiresConfirmation && !body.confirm) {
      res.status(409).json({
        message: `Scenario '${id}' is destructive — re-send with { "confirm": true }.`,
      });
      return;
    }

    const runId = uuidv4();
    setActiveRun(runId);
    log.info('scenario started', { id, runId });
    broadcast({ kind: 'runStarted', runId, scenarioId: id, description: scenario.description });

    res.json({ runId });

    const runner = new ScenarioRunner(t);
    const onEvent = (ev: RunnerEvent) => {
      // state.ts already broadcasts tx/rx events tagged with the active runId.
      // Skip duplicates from the runner's own event channel here.
      if (ev.kind === 'txBytes' || ev.kind === 'rxBytes') return;
      broadcast({ ...ev, runId } as never);
    };
    runner.on('event', onEvent);

    try {
      await runner.run(scenario);
      log.info('scenario finished', { id, runId });
    } catch (err) {
      log.error('scenario threw', err instanceof Error ? err : { err: String(err) });
      const message = err instanceof Error ? err.message : String(err);
      broadcast({ kind: 'error', message, runId });
      broadcast({ kind: 'scenarioDone', runId, ok: false });
    } finally {
      runner.off('event', onEvent);
      runner.detach();
      clearActiveRun();
    }
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
      log.error('no build found; run "npm run web:build" first', { path: distWebPath });
      process.exit(1);
    }
    app.use(express.static(distWebPath));
    app.get('*', (_req, res) => {
      res.sendFile(join(distWebPath, 'index.html'));
    });
  }

  app.listen(PORT, HOST, () => {
    log.info('cockpit listening', {
      url: `http://localhost:${PORT}`,
      mode: isDev ? 'dev' : 'prod',
    });
  });
}

main().catch((err) => {
  log.error('failed to start', err instanceof Error ? err : { err: String(err) });
  process.exit(1);
});

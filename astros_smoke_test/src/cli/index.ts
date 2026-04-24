import { fileURLToPath } from 'node:url';
import { FakeTransport, SerialTransport } from '../core/transport.js';
import { ScenarioRunner, type RunnerEvent } from '../core/runner.js';
import {
  BENCH,
  buildBenchConfigSync,
  buildMasterControlModule,
  buildPadawanControlModule,
} from '../core/fixtures/demo-location.js';
import { scenarios, listScenarioIds, type SessionContext } from '../core/scenarios/index.js';
import { parseArgv, USAGE } from './argv.js';
import { discover } from './discovery.js';
import { formatJsonLine, formatPlainLine } from './output.js';

const DEFAULT_PORT = process.env.SMOKE_SERIAL_PORT ?? '/dev/ttyUSB0';
const DEFAULT_BAUD = Number.parseInt(process.env.SMOKE_SERIAL_BAUD ?? '115200', 10);

async function listCommand(json: boolean): Promise<number> {
  // Fake transport suffices — listCommand only reads scenario metadata.
  const session: SessionContext = {
    transport: new FakeTransport(),
    configSync: buildBenchConfigSync(),
    master: buildMasterControlModule(),
    padawan: buildPadawanControlModule(''),
  };

  const items = listScenarioIds().map((id) => {
    const sc = scenarios[id](session);
    return {
      id: sc.id,
      description: sc.description,
      requiresConfirmation: sc.requiresConfirmation === true,
    };
  });

  if (json) {
    process.stdout.write(JSON.stringify(items, null, 2) + '\n');
  } else {
    for (const it of items) {
      const tag = it.requiresConfirmation ? ' [destructive]' : '';
      process.stdout.write(`${it.id}${tag}\n    ${it.description}\n`);
    }
  }
  return 0;
}

async function scenarioCommand(opts: {
  id: string;
  port: string;
  baud: number;
  confirm: boolean;
  json: boolean;
}): Promise<number> {
  const factory = scenarios[opts.id];
  if (!factory) {
    process.stderr.write(`Unknown scenario: ${opts.id}\n`);
    process.stderr.write(`Available: ${listScenarioIds().join(', ')}\n`);
    return 2;
  }

  const transport = new SerialTransport({ path: opts.port, baudRate: opts.baud });

  const emit = (ev: RunnerEvent) => {
    const line = opts.json ? formatJsonLine(ev) : formatPlainLine(ev);
    if (line !== null) process.stdout.write(line + '\n');
  };

  const sigintHandler = async () => {
    process.stderr.write('\n[SIGINT] attempting PANIC_STOP before exit...\n');
    try {
      const { panicStop } = await import('../core/operations/panicStop.js');
      const { buildScriptRun } = await import('../core/fixtures/helpers.js');
      const emptyRun = buildScriptRun(buildBenchConfigSync(), 'interrupt');
      await panicStop(emptyRun).run({ transport });
    } catch {
      /* best effort */
    }
    await transport.close().catch(() => undefined);
    process.exit(130);
  };
  process.once('SIGINT', sigintHandler);

  try {
    await transport.open();
  } catch (err) {
    process.stderr.write(
      `Failed to open ${opts.port} @ ${opts.baud}: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return 1;
  }

  try {
    process.stderr.write(`[discover] registration sync on ${opts.port} @ ${opts.baud}...\n`);
    const disc = await discover(transport);
    if (!disc.ok) {
      process.stderr.write(`[discover] FAILED: ${disc.detail}\n`);
      return 1;
    }
    const padawanAddr = disc.padawan?.address ?? '';
    process.stderr.write(
      `[discover] master=${BENCH.masterAddress} padawan=${padawanAddr || '(none)'} (${disc.durationMs}ms)\n`,
    );

    const configSync = buildBenchConfigSync({ padawanAddress: padawanAddr });
    const session: SessionContext = {
      transport,
      configSync,
      master: buildMasterControlModule(),
      padawan: buildPadawanControlModule(padawanAddr),
    };

    const scenario = factory(session);
    if (scenario.requiresConfirmation && !opts.confirm) {
      process.stderr.write(
        `Scenario '${scenario.id}' is destructive. Re-run with --confirm to proceed.\n`,
      );
      return 2;
    }

    const runner = new ScenarioRunner(transport);
    runner.on('event', emit);

    const result = await runner.run(scenario);
    runner.detach();
    return result.ok ? 0 : 1;
  } finally {
    process.off('SIGINT', sigintHandler);
    await transport.close().catch(() => undefined);
  }
}

export async function main(argv: readonly string[]): Promise<number> {
  const parsed = parseArgv(argv);

  if (parsed.errors.length > 0) {
    for (const e of parsed.errors) process.stderr.write(`error: ${e}\n`);
    process.stderr.write(USAGE);
    return 2;
  }

  if (parsed.command === 'help') {
    process.stdout.write(USAGE);
    return 0;
  }
  if (parsed.command === 'list') {
    return listCommand(parsed.json);
  }
  if (!parsed.scenarioId) {
    process.stderr.write('Missing scenario id\n');
    process.stderr.write(USAGE);
    return 2;
  }
  return scenarioCommand({
    id: parsed.scenarioId,
    port: parsed.port ?? DEFAULT_PORT,
    baud: parsed.baud ?? DEFAULT_BAUD,
    confirm: parsed.confirm,
    json: parsed.json,
  });
}

// Invoked directly via `tsx src/cli/index.ts`
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((err) => {
      process.stderr.write(
        `fatal: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`,
      );
      process.exit(1);
    });
}

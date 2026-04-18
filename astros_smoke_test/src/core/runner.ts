import { EventEmitter } from 'node:events';
import type { Transport } from './transport.js';

export type Phase = 'setup' | 'arrange' | 'act' | 'verify' | 'teardown';

export const PHASE_ORDER: Phase[] = ['setup', 'arrange', 'act', 'verify', 'teardown'];

export interface StepResult {
  ok: boolean;
  timedOut?: boolean;
  detail?: string;
  messageId?: string;
  ackType?: number;
  durationMs: number;
  rawResponse?: string;
}

export interface StepContext {
  transport: Transport;
}

export interface Step {
  name: string;
  run: (ctx: StepContext) => Promise<StepResult>;
}

export interface Scenario {
  id: string;
  description: string;
  requiresConfirmation?: boolean;
  setup?: Step[];
  arrange?: Step[];
  act?: Step[];
  verify?: Step[];
  teardown?: Step[];
}

export type RunnerEvent =
  | { kind: 'stepStart'; phase: Phase; step: string }
  | { kind: 'stepOk'; phase: Phase; step: string; result: StepResult }
  | { kind: 'stepFail'; phase: Phase; step: string; result: StepResult }
  | { kind: 'stepTimeout'; phase: Phase; step: string; result: StepResult }
  | { kind: 'txBytes'; bytes: string }
  | { kind: 'rxBytes'; bytes: string }
  | { kind: 'scenarioDone'; ok: boolean };

export interface RunResult {
  ok: boolean;
}

export class ScenarioRunner extends EventEmitter {
  private readonly transport: Transport;
  private readonly onTx = (bytes: string) => this.emit('event', { kind: 'txBytes', bytes });
  private readonly onRx = (line: string) => this.emit('event', { kind: 'rxBytes', bytes: line });

  constructor(transport: Transport) {
    super();
    this.transport = transport;
    transport.on('tx', this.onTx);
    transport.on('line', this.onRx);
  }

  detach(): void {
    this.transport.off('tx', this.onTx);
    this.transport.off('line', this.onRx);
  }

  async run(scenario: Scenario): Promise<RunResult> {
    let failed = false;

    for (const phase of PHASE_ORDER) {
      if (failed && phase !== 'teardown') continue;

      const steps = scenario[phase] ?? [];
      for (const step of steps) {
        this.emit('event', { kind: 'stepStart', phase, step: step.name });

        const started = Date.now();
        let result: StepResult;
        try {
          result = await step.run({ transport: this.transport });
        } catch (e) {
          result = {
            ok: false,
            detail: e instanceof Error ? e.message : String(e),
            durationMs: Date.now() - started,
          };
        }

        if (result.ok) {
          this.emit('event', { kind: 'stepOk', phase, step: step.name, result });
        } else if (result.timedOut) {
          this.emit('event', { kind: 'stepTimeout', phase, step: step.name, result });
          failed = true;
        } else {
          this.emit('event', { kind: 'stepFail', phase, step: step.name, result });
          failed = true;
        }

        if (failed && phase !== 'teardown') break;
      }
    }

    this.emit('event', { kind: 'scenarioDone', ok: !failed });
    return { ok: !failed };
  }
}

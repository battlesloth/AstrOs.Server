import type { RunnerEvent } from '../core/runner.js';

export function formatPlainLine(ev: RunnerEvent): string | null {
  switch (ev.kind) {
    case 'stepOk':
    case 'stepFail':
    case 'stepTimeout': {
      const status = ev.kind === 'stepOk' ? 'ok' : ev.kind === 'stepTimeout' ? 'timeout' : 'fail';
      const phase = `[${ev.phase}]`.padEnd(12);
      const step = ev.step.padEnd(22);
      const msg = ev.result.messageId ? `msg=${ev.result.messageId.slice(0, 8)}` : 'msg=-';
      const dur = `${ev.result.durationMs}ms`;
      const detail = ev.kind === 'stepOk' ? '' : `  ${ev.result.detail ?? ''}`.trimEnd();
      return `${phase} ${step} ${status.padEnd(8)} ${msg.padEnd(14)} ${dur}${detail}`;
    }
    case 'scenarioDone':
      return `-- scenario ${ev.ok ? 'OK' : 'FAIL'} --`;
    default:
      // stepStart / txBytes / rxBytes: suppressed in plain mode
      return null;
  }
}

export function formatJsonLine(ev: RunnerEvent): string {
  return JSON.stringify(ev);
}

export interface ParsedArgs {
  command: 'list' | 'scenario' | 'help';
  scenarioId?: string;
  confirm: boolean;
  json: boolean;
  port?: string;
  baud?: number;
  errors: string[];
}

export function parseArgv(argv: readonly string[]): ParsedArgs {
  const errors: string[] = [];
  const result: ParsedArgs = {
    command: 'help',
    confirm: false,
    json: false,
    errors,
  };

  if (argv.length === 0) {
    result.command = 'help';
    return result;
  }

  const first = argv[0];
  if (first === '-h' || first === '--help') {
    result.command = 'help';
    return result;
  }

  if (first === 'list') {
    result.command = 'list';
  } else {
    result.command = 'scenario';
    result.scenarioId = first;
  }

  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--confirm':
        result.confirm = true;
        break;
      case '--json':
        result.json = true;
        break;
      case '--port': {
        const v = argv[++i];
        if (!v) errors.push('--port requires a value');
        else result.port = v;
        break;
      }
      case '--baud': {
        const v = argv[++i];
        const n = v ? Number.parseInt(v, 10) : NaN;
        if (!Number.isFinite(n) || n <= 0) errors.push(`--baud requires a positive integer, got: ${v ?? '(missing)'}`);
        else result.baud = n;
        break;
      }
      default:
        errors.push(`Unknown argument: ${arg}`);
    }
  }

  return result;
}

export const USAGE = `Usage:
  smoke list
  smoke <scenario> [--port <path>] [--baud <n>] [--confirm] [--json]

Flags:
  --port <path>   Serial port (default: /dev/ttyUSB0 or $SMOKE_SERIAL_PORT)
  --baud <n>      Baud rate (default: 9600 or $SMOKE_SERIAL_BAUD)
  --confirm       Required for scenarios that wipe SD or move hardware
  --json          Emit one JSON object per runner event (otherwise pretty-print)
`;

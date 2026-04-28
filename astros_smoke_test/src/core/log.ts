import pino, { type Logger as PinoLogger } from 'pino';

export interface Logger {
  debug(msg: string, data?: Record<string, unknown>): void;
  info(msg: string, data?: Record<string, unknown>): void;
  warn(msg: string, data?: Record<string, unknown>): void;
  error(msg: string, data?: Record<string, unknown> | Error): void;
}

const isProd = process.env.NODE_ENV === 'production';

const root: PinoLogger = pino(
  { level: 'debug' },
  isProd
    ? pino.destination(2)
    : pino.transport({
        target: 'pino-pretty',
        options: {
          destination: 2,
          colorize: true,
          translateTime: 'HH:MM:ss.l',
          ignore: 'pid,hostname,ns',
          messageFormat: '({ns}) {msg}',
        },
      }),
);

const debugEnabled = parseDebugEnabled(process.env.SMOKE_LOG);

export function parseDebugEnabled(raw: string | undefined): (ns: string) => boolean {
  if (!raw || !raw.trim()) return () => false;
  const items = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (items.includes('*')) return () => true;
  const set = new Set(items);
  return (ns) => set.has(ns);
}

export function createLogger(namespace: string): Logger {
  const child = root.child({ ns: namespace });
  const debugOn = debugEnabled(namespace);
  return {
    debug(msg, data) {
      if (!debugOn) return;
      if (data) child.debug(data, msg);
      else child.debug(msg);
    },
    info(msg, data) {
      if (data) child.info(data, msg);
      else child.info(msg);
    },
    warn(msg, data) {
      if (data) child.warn(data, msg);
      else child.warn(msg);
    },
    error(msg, data) {
      if (data instanceof Error) child.error({ err: data }, msg);
      else if (data) child.error(data, msg);
      else child.error(msg);
    },
  };
}

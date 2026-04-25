import { EventEmitter } from 'node:events';
import { SerialPort } from 'serialport';
import { DelimiterParser } from '@serialport/parser-delimiter';
import { createLogger } from './log.js';

const log = createLogger('transport');

export interface TransportEvents {
  line: (line: string) => void;
  tx: (bytes: string) => void;
  error: (err: Error) => void;
  close: () => void;
}

export interface Transport {
  open(): Promise<void>;
  close(): Promise<void>;
  write(msg: string): Promise<void>;
  on<E extends keyof TransportEvents>(event: E, listener: TransportEvents[E]): this;
  off<E extends keyof TransportEvents>(event: E, listener: TransportEvents[E]): this;
}

export interface SerialTransportOptions {
  path: string;
  baudRate: number;
}

export class SerialTransport extends EventEmitter implements Transport {
  private readonly path: string;
  private readonly baudRate: number;
  private port: SerialPort | null = null;

  constructor(opts: SerialTransportOptions) {
    super();
    this.path = opts.path;
    this.baudRate = opts.baudRate;
  }

  open(): Promise<void> {
    return new Promise((resolve, reject) => {
      const port = new SerialPort(
        { path: this.path, baudRate: this.baudRate, autoOpen: false },
        (err) => {
          if (err) reject(err);
        },
      );

      port.open((err) => {
        if (err) {
          log.error('open failed', err);
          reject(err);
          return;
        }

        port.on('error', (e: Error) => {
          log.error('port error', e);
          this.emit('error', e);
        });
        port.on('close', () => {
          log.debug('port closed');
          this.emit('close');
        });

        port.pipe(new DelimiterParser({ delimiter: '\n' })).on('data', (chunk: Buffer) => {
          const line = chunk.toString('utf8');
          // Drop empty / NUL-only lines (UART startup artifacts before the real
          // first message arrives — otherwise MessageHandler logs them as errors).
          if (line.replace(/\0/g, '').trim().length === 0) return;
          log.debug('rx line', { bytes: line.length });
          this.emit('line', line);
        });

        this.port = port;
        log.debug('port opened', { path: this.path, baud: this.baudRate });
        resolve();
      });
    });
  }

  close(): Promise<void> {
    const port = this.port;
    if (!port || !port.isOpen) return Promise.resolve();
    return new Promise((resolve, reject) => {
      port.close((err) => (err ? reject(err) : resolve()));
    });
  }

  write(msg: string): Promise<void> {
    const port = this.port;
    if (!port) return Promise.reject(new Error('Transport not open'));
    return new Promise((resolve, reject) => {
      port.write(msg, (err) => {
        if (err) {
          log.error('write failed', err);
          reject(err);
          return;
        }
        port.drain((drainErr) => {
          if (drainErr) {
            log.error('drain failed', drainErr);
            reject(drainErr);
            return;
          }
          log.debug('tx', { bytes: msg.length });
          this.emit('tx', msg);
          resolve();
        });
      });
    });
  }
}

export class FakeTransport extends EventEmitter implements Transport {
  public readonly sent: string[] = [];
  public opened = false;

  open(): Promise<void> {
    this.opened = true;
    return Promise.resolve();
  }

  close(): Promise<void> {
    this.opened = false;
    return Promise.resolve();
  }

  write(msg: string): Promise<void> {
    this.sent.push(msg);
    this.emit('tx', msg);
    return Promise.resolve();
  }

  emitLine(line: string): void {
    this.emit('line', line);
  }
}

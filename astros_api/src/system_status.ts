import { logger } from './logger.js';

export interface SystemStatusState {
  readOnly: boolean;
  reason?: string;
  enteredAt?: string;
}

export type SystemStatusSubscriber = (state: SystemStatusState) => void;

export class SystemStatus {
  private readOnly = false;
  private reason: string | undefined;
  private enteredAt: string | undefined;
  private subscribers = new Set<SystemStatusSubscriber>();

  isReadOnly(): boolean {
    return this.readOnly;
  }

  getState(): SystemStatusState {
    if (!this.readOnly) return { readOnly: false };
    return { readOnly: true, reason: this.reason, enteredAt: this.enteredAt };
  }

  enterReadOnly(reason: string): void {
    if (this.readOnly) return;
    this.readOnly = true;
    this.reason = reason;
    this.enteredAt = new Date().toISOString();
    logger.error(`Entering read-only mode: ${reason}`);

    const snapshot = this.getState();
    for (const cb of this.subscribers) {
      try {
        cb(snapshot);
      } catch (err) {
        logger.error(`SystemStatus subscriber threw: ${err}`);
      }
    }
  }

  subscribe(cb: SystemStatusSubscriber): () => void {
    this.subscribers.add(cb);
    return () => {
      this.subscribers.delete(cb);
    };
  }
}

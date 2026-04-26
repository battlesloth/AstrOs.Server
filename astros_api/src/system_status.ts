import { logger } from './logger.js';

export type ReadOnlyReasonCode =
  | 'BACKUP_FAILED'
  | 'MIGRATION_FAILED_NO_BACKUP'
  | 'MIGRATION_FAILED_RESTORE_FAILED';

export interface SystemStatusState {
  readOnly: boolean;
  reasonCode?: ReadOnlyReasonCode;
  enteredAt?: string;
}

export type SystemStatusSubscriber = (state: SystemStatusState) => void;

export class SystemStatus {
  private readOnly = false;
  private reasonCode: ReadOnlyReasonCode | undefined;
  private enteredAt: string | undefined;
  private subscribers = new Set<SystemStatusSubscriber>();

  isReadOnly(): boolean {
    return this.readOnly;
  }

  getState(): SystemStatusState {
    if (!this.readOnly) return { readOnly: false };
    return { readOnly: true, reasonCode: this.reasonCode, enteredAt: this.enteredAt };
  }

  // detail (full error message, paths, stack) is logged server-side only.
  // The public state exposes only the structured code.
  enterReadOnly(code: ReadOnlyReasonCode, detail?: unknown): void {
    if (this.readOnly) return;
    this.readOnly = true;
    this.reasonCode = code;
    this.enteredAt = new Date().toISOString();

    const detailText = detail instanceof Error ? detail.stack ?? detail.message : String(detail);
    logger.error(`Entering read-only mode (${code}): ${detailText}`);

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

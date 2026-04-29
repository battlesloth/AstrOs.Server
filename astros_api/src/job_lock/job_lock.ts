import { logger } from '../logger.js';
import type { LockState } from '../models/networking/lock_responses.js';

type Listener = (state: LockState) => void;

export class JobLock {
  private locked = false;
  private owner: string | null = null;
  private since: string | null = null;
  private listeners = new Set<Listener>();

  isLocked(): boolean {
    return this.locked;
  }

  getOwner(): string | null {
    return this.owner;
  }

  getSince(): string | null {
    return this.since;
  }

  getState(): LockState {
    return { locked: this.locked, owner: this.owner, since: this.since };
  }

  acquire(owner: string): boolean {
    if (this.locked) return false;
    this.locked = true;
    this.owner = owner;
    this.since = new Date().toISOString();
    this.notify();
    return true;
  }

  release(owner: string): boolean {
    if (!this.locked || this.owner !== owner) return false;
    this.locked = false;
    this.owner = null;
    this.since = null;
    this.notify();
    return true;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    const state = this.getState();
    for (const fn of this.listeners) {
      try {
        fn(state);
      } catch (error) {
        logger.error('Error in listener:', error);
      }
    }
  }
}

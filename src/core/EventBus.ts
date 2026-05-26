import type { IEventBus, ArmamentEvent } from './interfaces/IEventBus.js';
import { logWarn } from './FileLogger.js';

interface HistoryEntry {
  event: ArmamentEvent;
  args: any[];
  timestamp: number;
}

/** Central pub/sub event system with wildcard listeners, history, and waitFor. */
export class EventBus implements IEventBus {
  private wildcardListeners: Array<(event: ArmamentEvent, ...args: any[]) => void>;
  private history: HistoryEntry[];
  private listeners: Map<ArmamentEvent, Array<{ fn: (...args: any[]) => void; once: boolean }>>;
  private readonly maxHistory = 1000;

  constructor() {
    this.wildcardListeners = [];
    this.history = [];
    this.listeners = new Map();
  }

  /**
   * On.
   */
  on(event: ArmamentEvent, handler: (...args: any[]) => void): void {
    const list = this.listeners.get(event) ?? [];
    list.push({ fn: handler, once: false });
    this.listeners.set(event, list);
  }

  /**
   * Off.
   */
  off(event: ArmamentEvent, handler: (...args: any[]) => void): void {
    const list = this.listeners.get(event);
    if (!list) return;
    const idx = list.findIndex(l => l.fn === handler);
    if (idx !== -1) list.splice(idx, 1);
  }

  /**
   * Once.
   */
  once(event: ArmamentEvent, handler: (...args: any[]) => void): void {
    const list = this.listeners.get(event) ?? [];
    list.push({ fn: handler, once: true });
    this.listeners.set(event, list);
  }

  /**
   * Emit.
   */
  emit(event: ArmamentEvent, ...args: any[]): void {
    this.history.push({ event, args, timestamp: Date.now() });
    if (this.history.length > this.maxHistory) {
      this.history = this.history.slice(-Math.floor(this.maxHistory * 0.75));
    }

    const list = this.listeners.get(event);
    if (list) {
      const snapshot = [...list];
      for (const entry of snapshot) {
        if (entry.once) {
          const idx = list.indexOf(entry);
          if (idx !== -1) list.splice(idx, 1);
        }
        try {
          entry.fn(...args);
        } catch (err) {
          logWarn('EventBus', `Listener threw on event "${event}"`, err);
        }
      }
    }

    for (const wl of this.wildcardListeners) {
      try {
        wl(event, ...args);
      } catch (err) {
        logWarn('EventBus', `Wildcard listener threw on event "${event}"`, err);
      }
    }
  }

  /**
   * Remove all listeners.
   */
  removeAllListeners(event?: ArmamentEvent): void {
    if (event !== undefined) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
      this.wildcardListeners = [];
    }
  }

  /**
   * Listener count.
   */
  listenerCount(event: ArmamentEvent): number {
    return this.listeners.get(event)?.length ?? 0;
  }

  /**
   * On any.
   */
  onAny(handler: (event: ArmamentEvent, ...args: any[]) => void): () => void {
    this.wildcardListeners.push(handler);
    return () => {
      const idx = this.wildcardListeners.indexOf(handler);
      if (idx !== -1) {
        this.wildcardListeners.splice(idx, 1);
      }
    };
  }

  /**
   * Wait for.
   */
  waitFor(event: ArmamentEvent, timeout?: number): Promise<any[]> {
    return new Promise<any[]>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined;

      const handler = (...args: any[]) => {
        if (timer !== undefined) {
          clearTimeout(timer);
        }
        resolve(args);
      };

      this.once(event, handler);

      if (timeout !== undefined) {
        timer = setTimeout(() => {
          this.off(event, handler);
          reject(new Error(`waitFor('${event}') timed out after ${timeout}ms`));
        }, timeout);
      }
    });
  }

  /**
   * Gets the event history.
   */
  getEventHistory(event?: ArmamentEvent, limit?: number): HistoryEntry[] {
    let filtered = event
      ? this.history.filter(h => h.event === event)
      : [...this.history];

    if (limit !== undefined && filtered.length > limit) {
      filtered = filtered.slice(filtered.length - limit);
    }

    return filtered;
  }
}

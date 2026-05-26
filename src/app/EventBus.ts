/** Type definition for EventHandler. */
export type EventHandler = (event: any) => void;
/** Class representing EventBus. */
export class EventBus {
  private handlers: Set<EventHandler> = new Set();
  /**
   * On.
   */
  on(handler: EventHandler): () => void {
    this.handlers.add(handler);
    return () => { this.handlers.delete(handler); };
  }
  /**
   * Emit.
   */
  emit(event: any): void {
    for (const h of this.handlers) {
      try { h(event); } catch {}
    }
  }
}
const KEY = '__armamentEventBus';
/** Get or create the global singleton EventBus instance. */
export function getGlobalEventBus(): EventBus {
  const g = globalThis as any;
  if (!g[KEY]) g[KEY] = new EventBus();
  return g[KEY];
}
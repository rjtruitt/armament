/** Type union for ArmamentEvent: token, thinking. */
export type ArmamentEvent =
  | 'token'
  | 'thinking'
  | 'stream:start'
  | 'stream:end'
  | 'tool:start'
  | 'tool:result'
  | 'tool:aborted'
  | 'permission:request'
  | 'permission:granted'
  | 'permission:denied'
  | 'spinner:start'
  | 'spinner:stop'
  | 'spinner:frame'
  | 'progress:clear'
  | 'elapsed'
  | 'step'
  | 'step:display'
  | 'state:change'
  | 'plugin:activated'
  | 'error:display'
  | 'retry'
  | 'message:sent'
  | 'context:warning'
  | 'context:compacted'
  | 'tokens:streamed'
  | 'ratelimit:warning'
  | 'ratelimit:waiting'
  | 'ratelimit:adjusted'
  | 'budget:warning'
  | 'provider:fallback'
  | 'auth:required'
  | 'auth:device-code'
  | 'auth:refreshed'
  | 'session:saved'
  | 'config:unsaved'
  | 'background:complete'
  | 'plan:step:executed'
  | 'file:read'
  | 'file:write'
  | 'file:edit'
  | 'close';

/** Event bus system for pub-sub communication — supports typed events with on/off/once/emit. */
export interface IEventBus {
  on(event: ArmamentEvent, handler: (...args: any[]) => void): void;
  off(event: ArmamentEvent, handler: (...args: any[]) => void): void;
  once(event: ArmamentEvent, handler: (...args: any[]) => void): void;
  emit(event: ArmamentEvent, ...args: any[]): void;
  removeAllListeners(event?: ArmamentEvent): void;
  listenerCount(event: ArmamentEvent): number;
}

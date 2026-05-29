/** Type definition for HookPoint. */
export type HookPoint =
  | 'pre:message'
  | 'post:message'
  | 'pre:tool'
  | 'post:tool'
  | 'pre:tool:fail'
  | 'pre:send'
  | 'post:receive'
  | 'on:spawn'
  | 'on:kill'
  | 'on:switch'
  | 'on:join'
  | 'on:part'
  | 'on:connect'
  | 'on:disconnect'
  | 'on:error'
  | 'on:ratelimit'
  | 'on:budget'
  | 'on:context-full'
  | 'session:start'
  | 'session:end'
  | 'git:commit'
  | 'git:push'
  | 'git:branch'
  | 'git:conflict'
  | 'view:mode-change'
  | 'view:focus-change'
  | 'view:mute-change'
  | 'view:sidebar-toggle'
  | 'view:sidebar-select'
  | 'view:notification'
  | 'view:layout-change'
  | 'view:priority-change'
  | 'view:group-change';
/** A registered hook with name, execution point, priority, and handler. */
export interface IHook {
  name: string;
  point: HookPoint;
  priority: number;
  handler: (context: IHookContext) => Promise<IHookResult>;
  description?: string;
  script?: string;
}
/** Context data passed to a hook handler during execution. */
export interface IHookContext {
  point: HookPoint;
  data: Record<string, unknown>;
  channel?: string;
  agent?: string;
  abort: () => void;
  modify: (key: string, value: unknown) => void;
}
/** Result returned by a hook handler indicating if aborted and any modifications. */
export interface IHookResult {
  aborted: boolean;
  modified: Record<string, unknown>;
  output?: string;
}
/** Hook system for lifecycle events — plugins and scripts can register hooks at specific points. */
export interface IHookSystem {
  register(hook: IHook): void;
  unregister(name: string): void;
  getAll(): IHook[];
  getByPoint(point: HookPoint): IHook[];
  execute(point: HookPoint, context: Partial<IHookContext>): Promise<IHookResult>;
  enable(name: string): void;
  disable(name: string): void;
  isEnabled(name: string): boolean;
}
/**
 * Pre/post hook execution system for all armament operations.
 *
 * Hooks are registered per hook-point with priority ordering.
 * During execution, hooks can abort the operation or modify context
 * data visible to subsequent hooks in the chain.
 */

import type {
  IHookSystem,
  IHook,
  HookPoint,
  IHookContext,
  IHookResult,
} from './interfaces/IHookSystem.js';

interface InternalHook extends IHook {
  enabled: boolean;
  registrationOrder: number;
}

/** Class representing HookSystem. */
export class HookSystem implements IHookSystem {
  private hooks: Map<HookPoint, InternalHook[]>;
  private hooksByName: Map<string, InternalHook>;
  private registrationCounter: number;

  constructor(_ctx?: {
    eventBus?: any;
    scriptEngine?: any;
  }) {
    this.hooks = new Map();
    this.hooksByName = new Map();
    this.registrationCounter = 0;
  }

  /**
   * Register.
   */
  register(hook: IHook): void {
    if (this.hooksByName.has(hook.name)) {
      this.unregister(hook.name);
    }

    const internal: InternalHook = {
      ...hook,
      enabled: true,
      registrationOrder: this.registrationCounter++,
    };

    this.hooksByName.set(hook.name, internal);

    if (!this.hooks.has(hook.point)) {
      this.hooks.set(hook.point, []);
    }
    const list = this.hooks.get(hook.point)!;
    list.push(internal);
    list.sort((a, b) => a.priority - b.priority || a.registrationOrder - b.registrationOrder);
  }

  /**
   * Unregister.
   */
  unregister(name: string): void {
    const hook = this.hooksByName.get(name);
    if (!hook) return;

    this.hooksByName.delete(name);
    const list = this.hooks.get(hook.point);
    if (list) {
      const idx = list.findIndex(h => h.name === name);
      if (idx !== -1) {
        list.splice(idx, 1);
      }
    }
  }

  /**
   * Gets the all.
   */
  getAll(): IHook[] {
    return Array.from(this.hooksByName.values()).map(h => ({
      name: h.name,
      point: h.point,
      priority: h.priority,
      handler: h.handler,
      description: h.description,
      script: h.script,
    }));
  }

  /**
   * Gets the by point.
   */
  getByPoint(point: HookPoint): IHook[] {
    const list = this.hooks.get(point);
    if (!list) return [];
    return list.map(h => ({
      name: h.name,
      point: h.point,
      priority: h.priority,
      handler: h.handler,
      description: h.description,
      script: h.script,
    }));
  }

  /**
   * Execute.
   */
  async execute(point: HookPoint, context: Partial<IHookContext>): Promise<IHookResult> {
    const list = this.hooks.get(point) || [];
    const accumulated: Record<string, any> = {};
    let aborted = false;
    let output: string | undefined;

    const data: Record<string, any> = { ...(context.data || {}) };

    for (const hook of list) {
      if (!hook.enabled) continue;
      if (aborted) break;

      let hookAborted = false;
      const modifications: Record<string, any> = {};

      const fullContext: IHookContext = {
        point,
        data,
        channel: context.channel,
        agent: context.agent,
        abort: () => { hookAborted = true; },
        modify: (key: string, value: any) => {
          modifications[key] = value;
          data[key] = value; // immediately visible to subsequent hooks
        },
      };

      try {
        const result = await hook.handler(fullContext);
        if (result && result.modified) {
          Object.assign(accumulated, result.modified);
        }
        Object.assign(accumulated, modifications);

        if (hookAborted || (result && result.aborted)) {
          aborted = true;
          if (result && result.output) {
            output = result.output;
          }
        }
      } catch {
      }
    }

    return { aborted, modified: accumulated, output };
  }

  /**
   * Enable.
   */
  enable(name: string): void {
    const hook = this.hooksByName.get(name);
    if (hook) {
      hook.enabled = true;
    }
  }

  /**
   * Disable.
   */
  disable(name: string): void {
    const hook = this.hooksByName.get(name);
    if (hook) {
      hook.enabled = false;
    }
  }

  /**
   * Checks whether enabled.
   */
  isEnabled(name: string): boolean {
    const hook = this.hooksByName.get(name);
    return hook ? hook.enabled : false;
  }
}

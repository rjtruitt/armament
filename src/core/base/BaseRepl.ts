import { IRepl } from '../interfaces/IRepl.js';
import { IReplConfig } from '../interfaces/IReplConfig.js';
import { ISession } from '../interfaces/ISession.js';
import { ICommandRegistry } from '../interfaces/ICommandRegistry.js';
import { IEventBus, ArmamentEvent } from '../interfaces/IEventBus.js';
import { IRenderer } from '../interfaces/IRenderer.js';
import { IStreamHandler } from '../interfaces/IStreamHandler.js';

/** Class representing BaseRepl. */
export abstract class BaseRepl implements IRepl {
  protected config: IReplConfig;
  protected session: ISession | null = null;
  protected commandRegistry: ICommandRegistry | null = null;
  protected eventBus: IEventBus | null = null;
  protected renderer: IRenderer | null = null;
  protected streamHandler: IStreamHandler | null = null;
  protected running = false;
  protected processing = false;
  protected interrupted = false;

  constructor(config: Partial<IReplConfig>) {
    this.config = this.mergeDefaults(config);
  }

  /**
   * Start.
   */
  abstract start(): Promise<void>;
  /**
   * Stop.
   */
  abstract stop(): void;
  /**
   * Handle input.
   */
  abstract handleInput(input: string): Promise<void>;

  /**
   * Checks whether running.
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Gets the config.
   */
  getConfig(): IReplConfig {
    return this.config;
  }

  /**
   * Gets the session.
   */
  getSession(): ISession {
    if (!this.session) {
      throw new Error('No session initialized');
    }
    return this.session;
  }

  /**
   * Gets the command registry.
   */
  getCommandRegistry(): ICommandRegistry {
    if (!this.commandRegistry) {
      throw new Error('No command registry initialized');
    }
    return this.commandRegistry;
  }

  /**
   * Interrupt.
   */
  interrupt(): void {
    this.interrupted = true;
  }

  /**
   * Was interrupted.
   */
  wasInterrupted(): boolean {
    return this.interrupted;
  }

  /**
   * On.
   */
  on(event: ArmamentEvent, handler: (...args: any[]) => void): void {
    this.eventBus?.on(event, handler);
  }

  /**
   * Emit.
   */
  emit(event: ArmamentEvent, ...args: any[]): void {
    this.eventBus?.emit(event, ...args);
  }

  protected mergeDefaults(partial: Partial<IReplConfig>): IReplConfig {
    return {
      agentName: partial.agentName ?? 'armament',
      showThinking: partial.showThinking ?? true,
      showToolCalls: partial.showToolCalls ?? true,
      compact: partial.compact ?? false,
      verbose: partial.verbose ?? false,
      streaming: partial.streaming ?? true,
      maxTurns: partial.maxTurns ?? Infinity,
      maxRetries: partial.maxRetries ?? 3,
      noColor: partial.noColor ?? false,
      outputFormat: partial.outputFormat ?? 'text',
      promptCaching: partial.promptCaching ?? false,
      autoSave: partial.autoSave ?? false,
      hotReload: partial.hotReload ?? false,
      theme: partial.theme ?? 'acid',
      providers: partial.providers ?? [],
      fallbackChain: partial.fallbackChain ?? [],
      modelConfig: {
        temperature: partial.modelConfig?.temperature ?? 0.7,
        maxTokens: partial.modelConfig?.maxTokens ?? 16384,
        topP: partial.modelConfig?.topP ?? 1.0,
        stop: partial.modelConfig?.stop ?? [],
      },
      toolPermissions: partial.toolPermissions ?? {},
      ...partial,
    };
  }
}

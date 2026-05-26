import { IReplConfig } from './IReplConfig.js';
import { ISession } from './ISession.js';
import { ICommandRegistry } from './ICommandRegistry.js';

/** Main REPL loop interface for interactive sessions. */
export interface IRepl {
  start(): Promise<void>;
  stop(): void;
  isRunning(): boolean;
  getConfig(): IReplConfig;
  getSession(): ISession;
  getCommandRegistry(): ICommandRegistry;
  handleInput(input: string): Promise<void>;
  interrupt(): void;
}

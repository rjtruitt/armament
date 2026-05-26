/** A single command definition with name, aliases, and execution handler. */
export interface ICommand {
  name: string;
  aliases: string[];
  description: string;
  usage?: string;
  execute(args: string[], context: ICommandContext): ICommandResult;
}

/** Context passed to command handlers containing repl, session, and config references. */
export interface ICommandContext {
  repl: unknown;
  session: unknown;
  config: unknown;
}

/** Result returned by a command execution. */
export interface ICommandResult {
  handled: boolean;
  output?: string;
  shouldExit?: boolean;
  error?: string;
}

/** Registry for managing and executing commands by name. */
export interface ICommandRegistry {
  register(command: ICommand): void;
  unregister(name: string): void;
  get(name: string): ICommand | undefined;
  getAll(): ICommand[];
  execute(input: string, context: ICommandContext): ICommandResult;
  getCompletions(partial: string): string[];
}

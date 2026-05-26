import { ICommand, ICommandContext, ICommandResult } from '../interfaces/ICommandRegistry.js';

/** Class representing BaseCommand. */
export abstract class BaseCommand implements ICommand {
  /**
   * name property.
   */
  abstract name: string;
  /**
   * aliases property.
   */
  abstract aliases: string[];
  /**
   * description property.
   */
  abstract description: string;
  /**
   * usage property.
   */
  usage?: string;

  /**
   * Execute.
   */
  abstract execute(args: string[], context: ICommandContext): ICommandResult;

  /**
   * Matches.
   */
  matches(input: string): boolean {
    const cmd = input.startsWith('/') ? input.slice(1).split(' ')[0] : '';
    return cmd === this.name || this.aliases.includes(cmd);
  }

  protected success(output?: string): ICommandResult {
    return { handled: true, output };
  }

  protected error(message: string): ICommandResult {
    return { handled: true, error: message };
  }

  protected exit(): ICommandResult {
    return { handled: true, shouldExit: true };
  }
}

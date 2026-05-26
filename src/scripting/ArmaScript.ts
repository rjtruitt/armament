import type { ScriptContext, ScriptEvent, ScriptCommand, ScriptAST, FontConfig, DisplayConfig } from './ArmaScriptTypes.js';
import { VALID_COMMANDS } from './ArmaScriptTypes.js';
import { ArmaScriptParser } from './ArmaScriptParser.js';
import { ArmaScriptExecutor } from './ArmaScriptExecutor.js';

export type { ScriptContext, ScriptEvent, ScriptCommand, ScriptAST, FontConfig, DisplayConfig };

/** Class representing ArmaScript. */
export class ArmaScript {
  private parser: ArmaScriptParser;
  private executor: ArmaScriptExecutor;

  constructor(ctx: ScriptContext) {
    this.parser = new ArmaScriptParser();
    this.executor = new ArmaScriptExecutor(ctx, this.parser);
    const sessionId = Math.random().toString(36).slice(2, 10);
    this.executor.setVariable('$channel', 'main');
    this.executor.setVariable('$agent', 'default');
    this.executor.setVariable('$model', '');
    this.executor.setVariable('$turn', 0);
    this.executor.setVariable('$session', sessionId);
  }

  /**
   * Parse.
   */
  parse(scriptText: string): ScriptAST {
    return this.parser.parse(scriptText);
  }

  /**
   * Run.
   */
  async run(scriptText: string): Promise<void> {
    await this.executor.run(scriptText);
  }

  /**
   * Execute.
   */
  async execute(ast: ScriptAST): Promise<void> {
    await this.executor.execute(ast);
  }

  /**
   * Gets the display.
   */
  getDisplay(): DisplayConfig {
    return this.executor.getDisplay();
  }

  /**
   * Gets the font size.
   */
  getFontSize(): number {
    return this.executor.getFontSize();
  }

  /**
   * Sets the font size.
   */
  setFontSize(size: number): void {
    this.executor.setFontSize(size);
  }

  /**
   * Gets the font family.
   */
  getFontFamily(): string {
    return this.executor.getFontFamily();
  }

  /**
   * Sets the font family.
   */
  setFontFamily(family: string): void {
    this.executor.setFontFamily(family);
  }

  /**
   * Zoom in.
   */
  zoomIn(step: number = 2): void {
    this.executor.zoomIn(step);
  }

  /**
   * Zoom out.
   */
  zoomOut(step: number = 2): void {
    this.executor.zoomOut(step);
  }

  /**
   * Reset font.
   */
  resetFont(): void {
    this.executor.resetFont();
  }

  /**
   * Gets the event handlers.
   */
  getEventHandlers(event: string): Array<{ body: string[]; once: boolean }> {
    return this.executor.getEventHandlers(event);
  }

  /**
   * Emit.
   */
  async emit(event: { type: string; data?: any; timestamp?: number }): Promise<void> {
    await this.executor.emit(event);
  }

  /**
   * Gets the macros.
   */
  getMacros(): string[] {
    return this.executor.getMacros();
  }

  /**
   * Sets the max iterations.
   */
  setMaxIterations(max: number): void {
    this.executor.setMaxIterations(max);
  }

  /**
   * Sets the file loader.
   */
  setFileLoader(loader: (path: string) => Promise<string>): void {
    this.executor.setFileLoader(loader);
  }

  /**
   * Validate.
   */
  validate(scriptText: string): string[] {
    const errors: string[] = [];
    try {
      this.parser.parse(scriptText);
    } catch (err: unknown) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
    return errors;
  }

  /**
   * Gets the commands.
   */
  getCommands(): string[] {
    return [...VALID_COMMANDS];
  }

  /**
   * Gets the variable.
   */
  getVariable(name: string): any {
    return this.executor.getVariable(name);
  }

  /**
   * Sets the variable.
   */
  setVariable(name: string, value: any): void {
    this.executor.setVariable(name, value);
  }

  /**
   * Dispose.
   */
  dispose(): void {
    this.executor.dispose();
  }
}

import type { FlowAST, FlowTrigger, FlowCommand, CompletionSchema, CompletionField } from './ArmaFlowTypes.js';
import { FLOW_COMMANDS } from './ArmaFlowTypes.js';

/** Stateless parser for .armaflow files — produces ASTs from flow text. */
export class ArmaFlowParser {

  /** Parses flow text into an AST, validating command syntax. */
  parse(flowText: string): FlowAST {
    const lines = flowText.split('\n');
    const commands: FlowCommand[] = [];
    let name = '';
    let description: string | undefined;
    let trigger: FlowTrigger | undefined;

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      const trimmed = raw.trim();

      if (!trimmed || trimmed.startsWith('#')) continue;

      // Indented block lines (complete: declarations) are consumed by the parent command parser
      if (!trimmed.startsWith('/') && !trimmed.includes(':')) {
        throw new Error(`Line ${i + 1}: Expected command starting with /, got: ${trimmed}`);
      }
      if (!trimmed.startsWith('/')) continue; // skip block content lines (parsed below)

      const indent = raw.length - raw.trimStart().length;
      const parsed = this.parseLine(trimmed, i + 1, indent);

      if (!FLOW_COMMANDS.has(parsed.command)) {
        throw new Error(`Line ${i + 1}: Unknown flow command /${parsed.command}`);
      }

      if (parsed.command === 'name') name = parsed.args.join(' ');
      else if (parsed.command === 'description') description = parsed.args.join(' ');
      else if (parsed.command === 'trigger') {
        trigger = { type: parsed.args[0] as FlowTrigger['type'], event: parsed.args[1], cron: parsed.args[1] };
      }

      // Parse /complete block: next indented lines define fields
      if (parsed.command === 'complete') {
        const schema = this.parseCompletionBlock(lines, i, indent);
        parsed.completionSchema = schema;
      }

      commands.push(parsed);
    }

    return { name, description, trigger, commands, blocks: [] };
  }

  /**
   * Parses a /complete block with inline flags and indented /field declarations.
   * Syntax:
   *   /complete --purpose "..." --sticky --sticky_description "..." --pipe ./script.py
   *     /field findings string[] required "Each distinct issue found"
   *     /field severity enum(low,medium,high) required "Overall severity rating"
   *     /field affected_files string[] "File paths affected"
   */
  parseCompletionBlock(lines: string[], startIdx: number, baseIndent: number): CompletionSchema {
    const startLine = lines[startIdx].trim();
    const tokens = this.tokenize(startLine.slice(1)); // strip leading /
    tokens.shift(); // remove 'complete'

    const flags = this.parseFlags(tokens);
    const schema: CompletionSchema = {
      fields: [],
      purpose: flags.purpose,
      sticky: flags.sticky !== undefined ? flags.sticky !== 'false' : true,
      stickyDescription: flags.sticky_description,
      pipe: flags.pipe,
    };

    // Scan subsequent indented /field lines
    for (let j = startIdx + 1; j < lines.length; j++) {
      const raw = lines[j];
      const trimmed = raw.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const lineIndent = raw.length - raw.trimStart().length;
      if (lineIndent <= baseIndent) break; // back to parent indent level

      if (trimmed.startsWith('/field')) {
        const fieldTokens = this.tokenize(trimmed.slice(1));
        fieldTokens.shift(); // remove 'field'
        const field = this.parseFieldDeclaration(fieldTokens);
        if (field) schema.fields.push(field);
      }
    }

    return schema;
  }

  /** Parses a field declaration: name type [required] "description" */
  parseFieldDeclaration(tokens: string[]): CompletionField | null {
    if (tokens.length < 2) return null;
    const name = tokens[0];
    const rawType = tokens[1];
    let type: CompletionField['type'] = 'string';
    let enumValues: string[] | undefined;

    if (rawType === 'string[]') type = 'string[]';
    else if (rawType === 'number') type = 'number';
    else if (rawType === 'boolean') type = 'boolean';
    else if (rawType.startsWith('enum(')) {
      type = 'enum';
      enumValues = rawType.slice(5, -1).split(',').map(v => v.trim());
    } else {
      type = 'string';
    }

    let required = false;
    let description = '';
    for (let i = 2; i < tokens.length; i++) {
      if (tokens[i] === 'required') required = true;
      else description += (description ? ' ' : '') + tokens[i];
    }

    return { name, type, required, description, enumValues };
  }

  /**
   * Parse flags.
   */
  parseFlags(args: string[]): Record<string, any> {
    const result: Record<string, any> = {};
    for (let i = 0; i < args.length; i++) {
      if (args[i].startsWith('--')) {
        const key = args[i].slice(2);
        const next = args[i + 1];
        if (next && !next.startsWith('--')) {
          result[key] = next;
          i++;
        } else {
          result[key] = 'true';
        }
      }
    }
    return result;
  }

  /**
   * Extract positional.
   */
  extractPositional(args: string[]): string[] {
    const result: string[] = [];
    for (let i = 0; i < args.length; i++) {
      if (args[i].startsWith('--')) { i++; continue; }
      result.push(args[i]);
    }
    return result;
  }

  /**
   * Parse line.
   */
  parseLine(line: string, lineNumber: number, indent: number): FlowCommand {
    const withoutSlash = line.slice(1);
    const args = this.tokenize(withoutSlash);
    const command = args.shift() || '';
    return { command, args, lineNumber, indent };
  }

  /**
   * Tokenize.
   */
  tokenize(input: string): string[] {
    const tokens: string[] = [];
    let current = '';
    let inQuote: string | null = null;
    let escaped = false;

    for (let i = 0; i < input.length; i++) {
      const ch = input[i];
      if (escaped) { current += ch; escaped = false; continue; }
      if (ch === '\\') { escaped = true; continue; }
      if (inQuote) {
        if (ch === inQuote) inQuote = null;
        else current += ch;
        continue;
      }
      if (ch === '"' || ch === "'") { inQuote = ch; continue; }
      if (ch === ' ' || ch === '\t') {
        if (current) { tokens.push(current); current = ''; }
        continue;
      }
      current += ch;
    }
    if (current) tokens.push(current);
    return tokens;
  }
}

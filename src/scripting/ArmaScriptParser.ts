import type { ScriptCommand, ScriptAST } from './ArmaScriptTypes.js';
import { VALID_COMMANDS } from './ArmaScriptTypes.js';

/** Class representing ArmaScriptParser. */
export class ArmaScriptParser {
  /**
   * Parse.
   */
  parse(scriptText: string): ScriptAST {
    const joinedText = scriptText.replace(/\\\n/g, '');
    const lines = joinedText.split('\n');
    const commands: ScriptCommand[] = [];
    let metaLines: string[] = [];
    let inMetaBlock = true;

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      const trimmed = raw.trim();

      if (!trimmed) {
        if (inMetaBlock && metaLines.length > 0) inMetaBlock = false;
        continue;
      }

      if (trimmed.startsWith('#')) {
        if (inMetaBlock) {
          metaLines.push(trimmed.slice(1).trim());
        }
        continue;
      }

      inMetaBlock = false;

      if (!trimmed.startsWith('/')) {
        throw new Error(`Line ${i + 1}: Expected command starting with /, got: ${trimmed}`);
      }

      const stripped = this.stripInlineComment(trimmed);
      const parsed = this.parseLine(stripped, i + 1);
      if (!VALID_COMMANDS.has(parsed.command)) {
        throw new Error(`Line ${i + 1}: Unknown command /${parsed.command}`);
      }
      commands.push(parsed);
    }

    const metadata = metaLines.length > 0
      ? { description: metaLines.join('\n') }
      : undefined;

    this.validateBlocks(commands);

    return { commands, metadata };
  }

  private validateBlocks(commands: ScriptCommand[]): void {
    const stack: { type: string; line: number }[] = [];
    for (const cmd of commands) {
      switch (cmd.command) {
        case 'on':
        case 'once':
          stack.push({ type: 'on', line: cmd.lineNumber });
          break;
        case 'endon':
          if (stack.length === 0 || stack[stack.length - 1].type !== 'on') {
            throw new Error(`Line ${cmd.lineNumber}: /endon without matching /on`);
          }
          stack.pop();
          break;
        case 'foreach':
          stack.push({ type: 'foreach', line: cmd.lineNumber });
          break;
        case 'endfor':
        case 'endforeach':
          if (stack.length === 0 || stack[stack.length - 1].type !== 'foreach') {
            throw new Error(`Line ${cmd.lineNumber}: /endfor without matching /foreach`);
          }
          stack.pop();
          break;
        case 'repeat':
          stack.push({ type: 'repeat', line: cmd.lineNumber });
          break;
        case 'endrepeat':
          if (stack.length === 0 || stack[stack.length - 1].type !== 'repeat') {
            throw new Error(`Line ${cmd.lineNumber}: /endrepeat without matching /repeat`);
          }
          stack.pop();
          break;
        case 'while':
          stack.push({ type: 'while', line: cmd.lineNumber });
          break;
        case 'endwhile':
          if (stack.length === 0 || stack[stack.length - 1].type !== 'while') {
            throw new Error(`Line ${cmd.lineNumber}: /endwhile without matching /while`);
          }
          stack.pop();
          break;
        case 'define':
          stack.push({ type: 'define', line: cmd.lineNumber });
          break;
        case 'enddefine':
          if (stack.length === 0 || stack[stack.length - 1].type !== 'define') {
            throw new Error(`Line ${cmd.lineNumber}: /enddefine without matching /define`);
          }
          stack.pop();
          break;
        case 'if':
          stack.push({ type: 'if', line: cmd.lineNumber });
          break;
        case 'endif':
          if (stack.length === 0 || stack[stack.length - 1].type !== 'if') {
            throw new Error(`Line ${cmd.lineNumber}: /endif without matching /if`);
          }
          stack.pop();
          break;
        case 'try':
          stack.push({ type: 'try', line: cmd.lineNumber });
          break;
        case 'endtry':
          if (stack.length === 0 || stack[stack.length - 1].type !== 'try') {
            throw new Error(`Line ${cmd.lineNumber}: /endtry without matching /try`);
          }
          stack.pop();
          break;
      }
    }
    if (stack.length > 0) {
      const unclosed = stack[stack.length - 1];
      const typeMap: Record<string, string> = { on: '/endon', foreach: '/endfor', repeat: '/endrepeat', while: '/endwhile', define: '/enddefine', if: '/endif', try: '/endtry' };
      throw new Error(`Line ${unclosed.line}: /${unclosed.type} without matching ${typeMap[unclosed.type]}`);
    }
  }

  /**
   * Parse line.
   */
  parseLine(line: string, lineNumber: number): ScriptCommand {
    const withoutSlash = line.slice(1);
    const args = this.tokenize(withoutSlash);
    const command = args.shift() || '';
    return { command, args, lineNumber, raw: line };
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

      if (escaped) {
        if (ch === 'n') current += '\n';
        else if (ch === '\n') { /* line continuation */ }
        else if (ch === '$') current += '\x00ESCAPED_DOLLAR\x00';
        else current += ch;
        escaped = false;
        continue;
      }

      if (ch === '\\') {
        escaped = true;
        continue;
      }

      if (inQuote) {
        if (ch === inQuote) {
          inQuote = null;
        } else {
          current += ch;
        }
        continue;
      }

      if (ch === '"' || ch === "'") {
        if (i === input.length - 1 || (input.indexOf(ch, i + 1) === -1)) {
          throw new Error(`Unclosed quote at position ${i}`);
        }
        inQuote = ch;
        continue;
      }

      if (ch === ' ' || ch === '\t') {
        if (current) {
          tokens.push(current);
          current = '';
        }
        continue;
      }

      current += ch;
    }

    if (inQuote) throw new Error('Unclosed quote');
    if (current) tokens.push(current);
    return tokens;
  }

  /**
   * Strip inline comment.
   */
  stripInlineComment(line: string): string {
    let inQuote: string | null = null;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '\\') { i++; continue; }
      if (ch === '"' || ch === "'") {
        if (inQuote === ch) inQuote = null;
        else if (!inQuote) inQuote = ch;
      }
      if (!inQuote && ch === '#' && i > 0 && line[i - 1] === ' ' && (i + 1 >= line.length || line[i + 1] === ' ')) {
        return line.slice(0, i).trimEnd();
      }
    }
    return line;
  }
}

/** Markdown to ANSI terminal renderer. */
import { BOLD, DIM, ITALIC, RESET, UNDERLINE, fgRgb, bgRgb } from '../rendering/index.js';
/** Color theme configuration for Markdown-to-ANSI rendering. */
export interface MarkdownTheme {
  heading: string;
  code: string;
  codeBg: string;
  blockBorder: string;
  blockBg: string;
  keyword: string;
  string: string;
  number: string;
  comment: string;
  punctuation: string;
  bullet: string;
}
const DEFAULT_THEME: MarkdownTheme = {
  heading: fgRgb(180, 140, 255),
  code: fgRgb(220, 170, 100),
  codeBg: bgRgb(40, 40, 40),
  blockBorder: fgRgb(80, 80, 80),
  blockBg: bgRgb(30, 30, 30),
  keyword: fgRgb(200, 120, 220),
  string: fgRgb(140, 200, 120),
  number: fgRgb(180, 160, 255),
  comment: fgRgb(100, 100, 100),
  punctuation: fgRgb(180, 180, 180),
  bullet: fgRgb(120, 180, 255),
};
const RE_HEADING = /^(#{1,6})\s+(.+)$/;
const RE_HR = /^(-{3,}|\*{3,}|_{3,})\s*$/;
const RE_UL = /^(\s*)([-*+])\s+(.+)$/;
const RE_OL = /^(\s*)(\d+)\.\s+(.+)$/;
/** Render Markdown text to ANSI-formatted terminal output. */
export function renderMarkdown(text: string, opts?: { theme?: Partial<MarkdownTheme>; noColor?: boolean }): string {
  if (opts?.noColor) return text;
  const theme = { ...DEFAULT_THEME, ...opts?.theme };
  const lines = text.split('\n');
  const output: string[] = [];
  let inCodeBlock = false;
  let codeLang = '';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trimStart().startsWith('```')) {
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeLang = line.trimStart().slice(3).trim();
        output.push(`${theme.blockBorder}┌─${codeLang ? ` ${codeLang} ` : ''}${'─'.repeat(Math.max(0, 40 - codeLang.length))}${RESET}`);
      } else {
        inCodeBlock = false;
        codeLang = '';
        output.push(`${theme.blockBorder}└${'─'.repeat(42)}${RESET}`);
      }
      continue;
    }
    if (inCodeBlock) {
      const highlighted = highlightCode(line, codeLang, theme);
      output.push(`${theme.blockBorder}│${RESET} ${theme.blockBg}${highlighted}${RESET}`);
      continue;
    }
    const headingMatch = line.match(RE_HEADING);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const content = headingMatch[2];
      const prefix = level <= 2 ? BOLD : '';
      const underline = level === 1 ? UNDERLINE : '';
      output.push(`${prefix}${underline}${theme.heading}${content}${RESET}`);
      continue;
    }
    if (RE_HR.test(line)) {
      output.push(`${DIM}${'─'.repeat(40)}${RESET}`);
      continue;
    }
    const ulMatch = line.match(RE_UL);
    if (ulMatch) {
      const indent = ulMatch[1];
      const content = renderInline(ulMatch[3], theme);
      output.push(`${indent}${theme.bullet}•${RESET} ${content}`);
      continue;
    }
    const olMatch = line.match(RE_OL);
    if (olMatch) {
      const indent = olMatch[1];
      const num = olMatch[2];
      const content = renderInline(olMatch[3], theme);
      output.push(`${indent}${theme.bullet}${num}.${RESET} ${content}`);
      continue;
    }
    output.push(renderInline(line, theme));
  }
  if (inCodeBlock) {
    output.push(`${theme.blockBorder}└${'─'.repeat(42)}${RESET}`);
  }
  return output.join('\n');
}
const RE_BOLD_ITALIC = /(\*\*\*|___)(.+?)\1/g;
const RE_BOLD = /(\*\*|__)(.+?)\1/g;
const RE_ITALIC_STAR = /(?<!\w)\*([^*]+)\*(?!\w)/g;
const RE_ITALIC_UNDER = /(?<!\w)_([^_]+)_(?!\w)/g;
const RE_INLINE_CODE = /`([^`]+)`/g;
const RE_STRIKETHROUGH = /~~(.+?)~~/g;
function renderInline(text: string, theme: MarkdownTheme): string {
  let result = text;
  result = result.replace(RE_BOLD_ITALIC, `${BOLD}${ITALIC}$2${RESET}`);
  result = result.replace(RE_BOLD, `${BOLD}$2${RESET}`);
  result = result.replace(RE_ITALIC_STAR, `${ITALIC}$1${RESET}`);
  result = result.replace(RE_ITALIC_UNDER, `${ITALIC}$1${RESET}`);
  result = result.replace(RE_INLINE_CODE, `${theme.codeBg}${theme.code} $1 ${RESET}`);
  result = result.replace(RE_STRIKETHROUGH, `${DIM}$1${RESET}`);
  return result;
}
const RE_COMMENT = /^(\s*)(\/\/.*|#.*)$/;
const RE_STRINGS = /(["'])(?:(?!\1|\\).|\\.)*\1/g;
const RE_BACKTICK_STRINGS = /`(?:[^`\\]|\\.)*`/g;
const RE_NUMBERS = /\b(\d+\.?\d*)\b/g;
const RE_KEYWORDS = /\b(const|let|var|function|async|await|return|import|export|from|if|else|for|while|class|new|this|type|interface|extends|implements|enum|readonly|private|public|protected|static|void|null|undefined|true|false|try|catch|throw|finally|switch|case|break|continue|default|yield|of|in|as|is)\b/g;
function highlightCode(line: string, lang: string, theme: MarkdownTheme): string {
  let result = line;
  const commentMatch = result.match(RE_COMMENT);
  if (commentMatch) {
    return `${commentMatch[1]}${theme.comment}${commentMatch[2]}${RESET}`;
  }
  const tokens: Array<{ start: number; end: number; color: string }> = [];
  RE_STRINGS.lastIndex = 0;
  for (const m of result.matchAll(RE_STRINGS)) {
    tokens.push({ start: m.index!, end: m.index! + m[0].length, color: theme.string });
  }
  RE_BACKTICK_STRINGS.lastIndex = 0;
  for (const m of result.matchAll(RE_BACKTICK_STRINGS)) {
    tokens.push({ start: m.index!, end: m.index! + m[0].length, color: theme.string });
  }
  RE_NUMBERS.lastIndex = 0;
  for (const m of result.matchAll(RE_NUMBERS)) {
    if (!isInsideToken(m.index!, tokens)) {
      tokens.push({ start: m.index!, end: m.index! + m[0].length, color: theme.number });
    }
  }
  RE_KEYWORDS.lastIndex = 0;
  for (const m of result.matchAll(RE_KEYWORDS)) {
    if (!isInsideToken(m.index!, tokens)) {
      tokens.push({ start: m.index!, end: m.index! + m[0].length, color: theme.keyword });
    }
  }
  tokens.sort((a, b) => b.start - a.start);
  for (const tok of tokens) {
    const before = result.slice(0, tok.start);
    const content = result.slice(tok.start, tok.end);
    const after = result.slice(tok.end);
    result = `${before}${tok.color}${content}${RESET}${after}`;
  }
  return result;
}
function isInsideToken(pos: number, tokens: Array<{ start: number; end: number }>): boolean {
  return tokens.some(t => pos >= t.start && pos < t.end);
}
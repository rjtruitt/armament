import { fg256, RESET } from '../ansi/colors.js';

/** Ansi theme.
 * @param {fg256(17} darkest - Description of darkest.
 */
export const AnsiTheme = {
  name: 'ansi',

  primary: {
    darkest: fg256(17),
    dark: fg256(19),
    mid: fg256(27),
    bright: fg256(39),
    lightest: fg256(51),
  },

  agent: {
    text: fg256(252),
    thinking: fg256(243),
    code: fg256(115),
    emphasis: fg256(231),
  },

  user: {
    prompt: `${fg256(51)}\x1b[1m`,
    text: fg256(15),
    input: fg256(255),
  },

  status: {
    success: fg256(46),
    error: fg256(196),
    warn: fg256(214),
    info: fg256(39),
    dim: fg256(240),
  },

  tool: {
    name: fg256(141),
    arg: fg256(183),
    result: fg256(115),
    error: fg256(196),
    duration: fg256(240),
  },

  chrome: {
    border: fg256(24),
    accent: fg256(33),
    shadow: fg256(236),
    highlight: fg256(45),
  },

  diff: {
    added: fg256(46),
    removed: fg256(196),
    context: fg256(252),
    hunk: fg256(39),
    meta: fg256(240),
  },

  markdown: {
    heading: fg256(39),
    bold: '\x1b[1m',
    italic: '\x1b[3m',
    code: fg256(115),
    link: '\x1b[4m' + fg256(39),
    blockquote: fg256(240),
    listBullet: fg256(45),
  },

  progress: {
    filled: fg256(39),
    empty: fg256(236),
    text: fg256(240),
  },

  reset: RESET,
} as const;

/** Type definition for ThemeColors. */
export type ThemeColors = typeof AnsiTheme;

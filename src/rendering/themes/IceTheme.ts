import { fg256, RESET } from '../ansi/colors.js';

/** Ice theme.
 * @param {fg256(16} darkest - Description of darkest.
 */
export const IceTheme = {
  name: 'ice',

  primary: {
    darkest: fg256(16),
    dark: fg256(17),
    mid: fg256(24),
    bright: fg256(44),
    lightest: fg256(159),
  },

  agent: {
    text: fg256(195),
    thinking: fg256(60),
    code: fg256(123),
    emphasis: fg256(231),
  },

  user: {
    prompt: `${fg256(159)}\x1b[1m`,
    text: fg256(15),
    input: fg256(255),
  },

  status: {
    success: fg256(48),
    error: fg256(197),
    warn: fg256(221),
    info: fg256(81),
    dim: fg256(60),
  },

  tool: {
    name: fg256(117),
    arg: fg256(153),
    result: fg256(123),
    error: fg256(197),
    duration: fg256(60),
  },

  chrome: {
    border: fg256(17),
    accent: fg256(24),
    shadow: fg256(16),
    highlight: fg256(51),
  },

  diff: {
    added: fg256(48),
    removed: fg256(197),
    context: fg256(195),
    hunk: fg256(81),
    meta: fg256(60),
  },

  markdown: {
    heading: fg256(81),
    bold: '\x1b[1m',
    italic: '\x1b[3m',
    code: fg256(123),
    link: '\x1b[4m' + fg256(81),
    blockquote: fg256(60),
    listBullet: fg256(51),
  },

  progress: {
    filled: fg256(51),
    empty: fg256(16),
    text: fg256(60),
  },

  reset: RESET,
} as const;

import { fg256, RESET } from '../ansi/colors.js';

/** Fire theme.
 * @param {fg256(52} darkest - Description of darkest.
 */
export const FireTheme = {
  name: 'fire',

  primary: {
    darkest: fg256(52),
    dark: fg256(88),
    mid: fg256(160),
    bright: fg256(208),
    lightest: fg256(226),
  },

  agent: {
    text: fg256(230),
    thinking: fg256(137),
    code: fg256(222),
    emphasis: fg256(231),
  },

  user: {
    prompt: `${fg256(214)}\x1b[1m`,
    text: fg256(15),
    input: fg256(255),
  },

  status: {
    success: fg256(46),
    error: fg256(196),
    warn: fg256(226),
    info: fg256(208),
    dim: fg256(137),
  },

  tool: {
    name: fg256(214),
    arg: fg256(222),
    result: fg256(46),
    error: fg256(196),
    duration: fg256(137),
  },

  chrome: {
    border: fg256(88),
    accent: fg256(160),
    shadow: fg256(52),
    highlight: fg256(208),
  },

  diff: {
    added: fg256(46),
    removed: fg256(196),
    context: fg256(230),
    hunk: fg256(208),
    meta: fg256(137),
  },

  markdown: {
    heading: fg256(208),
    bold: '\x1b[1m',
    italic: '\x1b[3m',
    code: fg256(222),
    link: '\x1b[4m' + fg256(208),
    blockquote: fg256(137),
    listBullet: fg256(214),
  },

  progress: {
    filled: fg256(196),
    empty: fg256(52),
    text: fg256(137),
  },

  reset: RESET,
} as const;

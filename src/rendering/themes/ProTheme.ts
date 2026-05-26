import { fg256, RESET } from '../ansi/colors.js';

/** Pro theme.
 * @param {fg256(236} darkest - Description of darkest.
 */
export const ProTheme = {
  name: 'pro',

  primary: {
    darkest: fg256(236),
    dark: fg256(240),
    mid: fg256(245),
    bright: fg256(250),
    lightest: fg256(254),
  },

  agent: {
    text: fg256(252),
    thinking: fg256(245),
    code: fg256(253),
    emphasis: fg256(255),
  },

  user: {
    prompt: `${fg256(252)}\x1b[1m`,
    text: fg256(254),
    input: fg256(255),
  },

  status: {
    success: fg256(108),
    error: fg256(167),
    warn: fg256(179),
    info: fg256(110),
    dim: fg256(242),
  },

  tool: {
    name: fg256(110),
    arg: fg256(250),
    result: fg256(108),
    error: fg256(167),
    duration: fg256(242),
  },

  chrome: {
    border: fg256(239),
    accent: fg256(245),
    shadow: fg256(236),
    highlight: fg256(252),
  },

  diff: {
    added: fg256(108),
    removed: fg256(167),
    context: fg256(250),
    hunk: fg256(110),
    meta: fg256(242),
  },

  markdown: {
    heading: fg256(252),
    bold: '\x1b[1m',
    italic: '\x1b[3m',
    code: fg256(250),
    link: '\x1b[4m' + fg256(110),
    blockquote: fg256(245),
    listBullet: fg256(247),
  },

  progress: {
    filled: fg256(245),
    empty: fg256(237),
    text: fg256(242),
  },

  reset: RESET,
} as const;

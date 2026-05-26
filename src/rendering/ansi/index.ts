/**
 * @module ansi
 * Standalone ANSI terminal rendering library.
 *
 * Provides low-level color/style primitives (colors), preset gradients,
 * unicode drawing characters, and high-level themed banner/loading screen rendering.
 */

export {
  RESET,
  BOLD,
  DIM,
  ITALIC,
  UNDERLINE,
  BLINK,
  INVERSE,
  HIDDEN,
  STRIKETHROUGH,
  fg256,
  bg256,
  fgRgb,
  bgRgb,
  ARMAMENT_GRADIENT,
  FIRE_GRADIENT,
  ICE_GRADIENT,
  BLOCK,
  BOX,
  stripAnsi,
} from './colors.js';

export {
  renderBanner,
  renderMiniBanner,
  renderLoadingScreen,
  renderExitSummary,
  renderSeparator,
  renderLoadingFrame,
  renderStartupSequence,
  getFlavorText,
  animateLoadingScreen,
  LOGO,
  BANNER_ART,
  FLAVOR_TEXTS,
  THEMES,
  LOADING_FRAMES,
} from './banner.js';

export type { RGB } from './bannerThemes.js';

export type {
  ThemeColors,
  LoadingStep,
  LoadingContext,
  AnimationSpeed,
  AnimatedLoadingOptions,
  SessionSummaryData,
} from './banner.js';

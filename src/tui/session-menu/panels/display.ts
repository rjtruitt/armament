/**
 * Panel definitions for display and theme configuration.
 */

import type { MenuPanel, SessionMenuConfig } from '../types.js';

/** Registers display-related panels into the given map. */
export function registerDisplayPanels(panels: Map<string, MenuPanel>, config: SessionMenuConfig): void {
  panels.set('display', {
    id: 'display',
    title: 'Display',
    parent: 'root',
    items: [
      {
        id: 'display.theme', label: 'Theme', type: 'choice', value: config.theme,
        choices: [
          { id: 'random', label: 'random', description: 'Random on each launch' },
          { id: 'red', label: 'red', description: 'Default crimson' },
          { id: 'fire', label: 'fire', description: 'Warm amber' },
          { id: 'ice', label: 'ice', description: 'Cool blue' },
          { id: 'green', label: 'green', description: 'Matrix' },
          { id: 'purple', label: 'purple', description: 'Neon violet' },
          { id: 'synthwave', label: 'synthwave', description: 'Retro gradient' },
          { id: 'midnight', label: 'midnight', description: 'Deep blue' },
        ],
      },
      { id: 'display.font', label: 'Font', description: 'Size, family, accessibility', type: 'submenu' },
      { id: 'display.showThinking', label: 'Show thinking', description: 'Display model reasoning', type: 'toggle', value: true },
      { id: 'display.showToolCalls', label: 'Show tool calls', description: 'Display tool invocations', type: 'toggle', value: true },
      { id: 'display.compact', label: 'Compact mode', description: 'Reduce spacing', type: 'toggle', value: false },
      { id: 'display.verbose', label: 'Verbose', description: 'Extra debug output', type: 'toggle', value: false },
      { id: 'display.timestamps', label: 'Timestamps', description: 'Show message timestamps', type: 'toggle', value: false },
      { id: 'display.syntaxHighlighting', label: 'Syntax highlighting', description: 'Highlight code blocks', type: 'toggle', value: true },
      { id: 'display.maxOutputLines', label: 'Max output lines', description: 'Truncate after N lines', type: 'text', value: '500' },
      { id: 'display.renderInterval', label: 'Render interval (ms)', description: '16=60fps, 33=30fps, 50=20fps', type: 'text', value: '33' },
      {
        id: 'display.colorDepth', label: 'Color depth', type: 'choice', value: 'truecolor',
        choices: [
          { id: '256', label: '256', description: '256-color mode' },
          { id: 'truecolor', label: 'truecolor', description: '24-bit RGB' },
          { id: 'none', label: 'none', description: 'No color' },
        ],
      },
    ],
  });

  panels.set('display.font', {
    id: 'display.font',
    title: 'Font & Accessibility',
    parent: 'display',
    items: [
      { id: 'display.font.size', label: 'Font size', description: '8-48 (default: 13)', type: 'text', value: '13' },
      { id: 'display.font.family', label: 'Font family', description: 'Monospace recommended', type: 'text', value: 'monospace' },
      {
        id: 'display.font.weight', label: 'Font weight', type: 'choice', value: 'normal',
        choices: [
          { id: 'light', label: 'light', description: 'Thin strokes' },
          { id: 'normal', label: 'normal', description: 'Standard weight' },
          { id: 'bold', label: 'bold', description: 'Heavier strokes' },
        ],
      },
      { id: 'display.font.lineHeight', label: 'Line height', description: '1.0-2.5 (default: 1.5)', type: 'text', value: '1.5' },
      { id: 'display.font.zoomStep', label: 'Zoom step', description: 'Ctrl+/- increment', type: 'text', value: '2' },
      { id: 'display.font.minSize', label: 'Min size', description: 'Zoom floor', type: 'text', value: '8' },
      { id: 'display.font.maxSize', label: 'Max size', description: 'Zoom ceiling', type: 'text', value: '48' },
      { id: 'display.font.ligatures', label: 'Ligatures', description: 'Code ligatures', type: 'toggle', value: true },
    ],
  });
}

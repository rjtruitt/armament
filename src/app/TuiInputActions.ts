/**
 * Individual action implementations for TuiInputHandler.
 * Contains handlers for approval keys, pane keys, F-keys, command palette,
 * sidebar navigation, and clipboard paste completion.
 */

import { InputBar, CommandPalette, Sidebar, FocusManager, LayoutManager, ApprovalWidget } from '../tui/index.js';
import { THEMES } from '../rendering/index.js';
import type { TuiRendererOptions } from './TuiTypes.js';
import type { InputHandlerDelegate } from './TuiInputHandler.js';

/** Shared deps for action handlers, matching TuiInputHandler's internal state. */
export interface ActionDeps {
  opts: TuiRendererOptions;
  inputBar: InputBar;
  commandPalette: CommandPalette;
  sidebar: Sidebar;
  focusManager: FocusManager;
  layout: LayoutManager;
  approvalWidget: ApprovalWidget;
  delegate: InputHandlerDelegate;
  approvalFocused: boolean;
  processKey(seq: string): void;
}

/** Handle key events when the approval modal has focus. Returns true if consumed. */
export function handleApprovalKey(deps: ActionDeps, seq: string): boolean {
  if (seq === '\t' || seq === '\x1b[Z') {
    deps.approvalFocused = false;
    deps.focusManager.focusInput();
    deps.delegate.render();
    return true;
  }

  let widgetKey: string | null = null;
  if (seq === '\x1b[A') widgetKey = 'up';
  else if (seq === '\x1b[B') widgetKey = 'down';
  else if (seq === '\x1b[C') widgetKey = 'right';
  else if (seq === '\x1b[D') widgetKey = 'left';
  else if (seq === '\r' || seq === '\n') widgetKey = 'enter';
  else if (seq === ' ') widgetKey = 'space';
  else if (seq === '\x1b') widgetKey = 'escape';
  else if (seq === '\x7f' || seq === '\x08') widgetKey = 'backspace';
  else if (seq.length === 1 && seq.charCodeAt(0) >= 32) widgetKey = seq;

  if (!widgetKey) return false;

  if (widgetKey === 'escape') {
    if (deps.approvalWidget.isInFreeform()) {
      deps.approvalWidget.handleKey('escape');
      deps.delegate.render();
      return true;
    }
    deps.approvalWidget.cancel();
    if (deps.approvalWidget.isEmpty) deps.approvalFocused = false;
    deps.delegate.render();
    return true;
  }
  const handled = deps.approvalWidget.handleKey(widgetKey);
  if (handled) {
    if (deps.approvalWidget.isEmpty) deps.approvalFocused = false;
    deps.delegate.render();
    return true;
  }
  return false;
}

/** Handle key events when an inline config pane has focus. Returns true if consumed. */
export function handlePaneKey(deps: ActionDeps, seq: string): boolean {
  const activeChannel = deps.delegate.getActiveChannel();
  const paneId = activeChannel.slice(1);
  const pane = deps.delegate.getConfigPane(paneId);

  if (seq === '\x1b' || seq === '\x1b[D') {
    const handled = pane.handleKey('back');
    if (handled && pane.currentPanelId !== paneId) {
      deps.delegate.setActiveChannel('@' + pane.currentPanelId);
    }
    deps.delegate.render();
    return true;
  }
  if (seq === '\t') { deps.focusManager.focusNext(); deps.delegate.render(); return true; }
  if (seq === '\x1b[Z') { deps.focusManager.focusPrev(); deps.delegate.render(); return true; }

  const keyMap: Record<string, string> = {
    '\x1b[A': 'up',
    '\x1b[B': 'down',
    '\r': 'enter',
    '\n': 'enter',
    '\x7f': 'backspace',
    '\x08': 'backspace',
  };
  const mapped = keyMap[seq];
  if (mapped) {
    pane.handleKey(mapped);
    deps.delegate.render();
    return true;
  }

  if (seq.length === 1 && seq.charCodeAt(0) >= 32) {
    pane.handleKey(seq);
    deps.delegate.render();
    return true;
  }

  if (seq.startsWith('\x1b')) return true;
  return true;
}

/** Handle F-key sequences. Returns true if consumed. */
export function handleFKey(deps: ActionDeps, seq: string): boolean {
  if (seq === '\x1bOP' || seq === '\x1b[11~') {
    deps.delegate.writeToMain('─── Help ───');
    deps.delegate.writeToMain('Tab: navigate │ /: commands │ Esc: back │ Ctrl+C: exit');
    deps.delegate.writeToMain('F1: Help │ F2: Config │ F3: MCP │ F4: Agents │ F5: Theme │ F10: Quit');
    deps.delegate.writeToMain('');
    return true;
  }
  if (seq === '\x1bOQ' || seq === '\x1b[12~') { deps.delegate.setActiveChannel('@config'); deps.delegate.render(); return true; }
  if (seq === '\x1bOR' || seq === '\x1b[13~') {
    if (deps.opts.onMcpShow) {
      deps.opts.onMcpShow();
    } else {
      deps.delegate.setActiveChannel('@mcp');
      deps.delegate.render();
    }
    return true;
  }
  if (seq === '\x1bOS' || seq === '\x1b[14~') {
    deps.delegate.writeToMain('─── Agents ───');
    deps.delegate.writeToMain('[agent list placeholder]');
    return true;
  }
  if (seq === '\x1b[15~') {
    const themeNames = [...Object.keys(THEMES), 'random'];
    const currentTheme = deps.opts.theme ?? 'red';
    const currentIdx = themeNames.indexOf(currentTheme);
    const nextIdx = (currentIdx + 1) % themeNames.length;
    const picked = themeNames[nextIdx];
    if (picked === 'random') {
      const realThemes = Object.keys(THEMES);
      deps.opts.theme = realThemes[Math.floor(Math.random() * realThemes.length)];
    } else {
      deps.opts.theme = picked;
    }
    deps.delegate.render();
    return true;
  }
  if (seq === '\x1b[21~') { deps.opts.onExit(); return true; }
  return false;
}

/** Handle key events when the command palette is visible. */
export function handlePaletteKey(deps: ActionDeps, seq: string): void {
  if (seq === '\x1b[A') { deps.commandPalette.moveUp(); deps.delegate.render(); return; }
  if (seq === '\x1b[B') { deps.commandPalette.moveDown(); deps.delegate.render(); return; }
  if (seq === '\r' || seq === '\n') {
    const currentText = deps.inputBar.getText();
    if (currentText.includes(' ')) {
      deps.commandPalette.hide();
      deps.focusManager.setRegionVisible('palette', false);
      deps.focusManager.unlockFocus();
      deps.inputBar.handleKey('enter');
      deps.delegate.render();
      return;
    }
    const selected = deps.commandPalette.select();
    if (selected && deps.delegate.handlePaletteCommand?.(selected)) {
      deps.inputBar.handleKey('ctrl+u');
      deps.commandPalette.hide();
      deps.focusManager.setRegionVisible('palette', false);
      deps.focusManager.unlockFocus();
      deps.delegate.render();
      return;
    }
    if (selected) {
      deps.inputBar.handleKey('ctrl+u');
      for (const ch of selected) deps.inputBar.handleKey(ch);
    }
    deps.commandPalette.hide();
    deps.focusManager.setRegionVisible('palette', false);
    deps.focusManager.unlockFocus();
    deps.delegate.render();
    return;
  }
  if (seq === '\x7f' || seq === '\x08') {
    deps.inputBar.handleKey('backspace');
    checkPaletteState(deps);
    deps.delegate.render();
    return;
  }
  if (seq.startsWith('\x1b')) return;
  for (const char of seq) {
    if (char.charCodeAt(0) >= 32 && char.charCodeAt(0) < 127) {
      deps.inputBar.handleKey(char);
    }
  }
  updatePaletteFilter(deps);
  deps.delegate.render();
}

/** Handle key events when the sidebar has focus. Returns true if consumed. */
export function handleSidebarKey(deps: ActionDeps, seq: string): boolean {
  if (seq === '\x1b[1;5D') { deps.layout.setSidebarWidth(deps.layout.getSidebarWidth() - 2); deps.delegate.render(); return true; }
  if (seq === '\x1b[1;5C') { deps.layout.setSidebarWidth(deps.layout.getSidebarWidth() + 2); deps.delegate.render(); return true; }
  if (seq === '\x1b[A' || seq === '\x1b[B') {
    const target = seq === '\x1b[A' ? deps.sidebar.navigateUp() : deps.sidebar.navigateDown();
    if (target) deps.delegate.setActiveChannel(target);
    deps.delegate.render();
    return true;
  }
  if (seq === '\r' || seq === '\n' || seq === '\x1b[C') {
    const highlighted = deps.sidebar.getHighlightedItem?.() ?? deps.delegate.getActiveChannel();
    if (highlighted === '+new-channel') {
      deps.delegate.createNewChannel();
    }
    deps.focusManager.focusInput();
    deps.delegate.render();
    return true;
  }
  if (seq === '\x1b') { deps.focusManager.focusInput(); deps.delegate.render(); return true; }
  return false;
}

/** Map F-key bar column to the corresponding F-key sequence for click handling. */
export function handleFKeyBarClick(deps: ActionDeps, col: number): void {
  if (col >= 1 && col <= 7) { deps.processKey('\x1bOP'); }
  else if (col >= 9 && col <= 17) { deps.processKey('\x1bOQ'); }
  else if (col >= 19 && col <= 27) { deps.processKey('\x1bOR'); }
  else if (col >= 29 && col <= 38) { deps.processKey('\x1bOS'); }
  else if (col >= 40 && col <= 49) { deps.processKey('\x1b[15~'); }
  else if (col >= 51 && col <= 59) { deps.processKey('\x1b[21~'); }
}

/** Show or hide the command palette based on current input bar text. */
export function checkPaletteState(deps: ActionDeps): void {
  const text = deps.inputBar.getText();
  if (text.startsWith('/') && text.length >= 1) {
    if (!deps.commandPalette.isVisible()) {
      deps.commandPalette.show();
      deps.focusManager.setRegionVisible('palette', true);
      deps.focusManager.lockFocus('input');
    }
    updatePaletteFilter(deps);
  } else {
    if (deps.commandPalette.isVisible() && !deps.commandPalette.isCustomPicker()) {
      deps.commandPalette.hide();
      deps.focusManager.setRegionVisible('palette', false);
      deps.focusManager.unlockFocus();
    }
  }
}

function updatePaletteFilter(deps: ActionDeps): void {
  const text = deps.inputBar.getText();
  if (deps.commandPalette.isCustomPicker()) {
    deps.commandPalette.setFilter(text);
  } else if (text.startsWith('/')) {
    deps.commandPalette.setFilter(text.slice(1));
  }
}

/** Handle completion of a bracketed paste. */
export function completePaste(deps: ActionDeps, text: string): void {
  // If a ConfigPane detail or menu edit is active, route paste there instead of InputBar
  if (deps.delegate.getActiveChannel().startsWith('@')) {
    const paneId = deps.delegate.getActiveChannel().slice(1);
    const pane = deps.delegate.getConfigPane(paneId);
    const p = pane as any;
    if (p.detailEditing || p.editing) {
      for (const ch of text) {
        if (ch.charCodeAt(0) >= 32) {
          pane.handleKey(ch);
        }
      }
      deps.delegate.render();
      return;
    }
  }
  deps.inputBar.paste(text);
  checkPaletteState(deps);
  deps.delegate.render();
}

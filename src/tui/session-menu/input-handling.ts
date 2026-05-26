/**
 * Keyboard and mouse input handling for the SessionMenu.
 *
 * Separated from the main class to isolate interaction logic from state management.
 */

import type { MenuItem, MenuPanel, SessionMenuConfig, McpServerConfig } from './types.js';
import type { ScreenBuffer } from '../ScreenBuffer.js';

/** JSON editor key handling result. */
export interface JsonEditorUpdate {
  buffer: string[];
  cursorRow: number;
  cursorCol: number;
  saved?: boolean;
}

/** Processes a key press in the JSON editor. Returns updated state or undefined if unhandled. */
export function handleJsonEditorKey(
  normalizedKey: string,
  rawKey: string,
  buffer: string[],
  cursorRow: number,
  cursorCol: number,
): JsonEditorUpdate | undefined {
  if (normalizedKey === 'up') {
    const newRow = Math.max(0, cursorRow - 1);
    return {
      buffer,
      cursorRow: newRow,
      cursorCol: Math.min(cursorCol, (buffer[newRow] ?? '').length),
    };
  }
  if (normalizedKey === 'down') {
    const newRow = Math.min(buffer.length - 1, cursorRow + 1);
    return {
      buffer,
      cursorRow: newRow,
      cursorCol: Math.min(cursorCol, (buffer[newRow] ?? '').length),
    };
  }
  if (normalizedKey === 'backspace') {
    const line = buffer[cursorRow] ?? '';
    if (cursorCol > 0) {
      const newBuffer = [...buffer];
      newBuffer[cursorRow] = line.slice(0, cursorCol - 1) + line.slice(cursorCol);
      return { buffer: newBuffer, cursorRow, cursorCol: cursorCol - 1 };
    }
    if (cursorRow > 0) {
      const prevLine = buffer[cursorRow - 1] ?? '';
      const newCol = prevLine.length;
      const newBuffer = [...buffer];
      newBuffer[cursorRow - 1] = prevLine + line;
      newBuffer.splice(cursorRow, 1);
      return { buffer: newBuffer, cursorRow: cursorRow - 1, cursorCol: newCol };
    }
    return { buffer, cursorRow, cursorCol };
  }
  if (normalizedKey === 'enter') {
    const line = buffer[cursorRow] ?? '';
    const newBuffer = [...buffer];
    newBuffer[cursorRow] = line.slice(0, cursorCol);
    newBuffer.splice(cursorRow + 1, 0, line.slice(cursorCol));
    return { buffer: newBuffer, cursorRow: cursorRow + 1, cursorCol: 0 };
  }
  if (rawKey === '\x13') {
    return { buffer, cursorRow, cursorCol, saved: true };
  }
  if (rawKey.length === 1 && rawKey.charCodeAt(0) >= 32) {
    const line = buffer[cursorRow] ?? '';
    const newBuffer = [...buffer];
    newBuffer[cursorRow] = line.slice(0, cursorCol) + rawKey + line.slice(cursorCol);
    return { buffer: newBuffer, cursorRow, cursorCol: cursorCol + 1 };
  }
  return undefined;
}

/** Determines the JSON content to populate the editor with based on item context. */
export function resolveJsonContent(
  itemId: string,
  config: SessionMenuConfig,
  mcpConfigs: McpServerConfig[],
): { content: any; section: string } {
  if (itemId === 'providers.json') {
    return {
      content: {
        providers: (config.providers ?? []).map(p => ({
          id: p,
          type: p,
          enabled: true,
          apiKey: '',
          baseUrl: '',
        })),
      },
      section: 'providers',
    };
  }
  if (itemId.startsWith('providers') && itemId.endsWith('.json')) {
    const providerId = itemId.replace('providers.', '').replace('.settings.json', '');
    return {
      content: { id: providerId, type: providerId, enabled: true, apiKey: '', baseUrl: '' },
      section: 'providers',
    };
  }
  if (itemId === 'models.json') {
    const allModels: any[] = [];
    for (const pc of (config.providerConfigs ?? [])) {
      for (const m of (pc.models ?? [])) {
        allModels.push({ modelId: m, provider: pc.type });
      }
    }
    return { content: { models: allModels }, section: 'models' };
  }
  if (itemId.startsWith('mcp.') && itemId.endsWith('.settings.json')) {
    const serverName = itemId.replace('mcp.', '').replace('.settings.json', '');
    const mcpCfg = mcpConfigs.find(c => c.name === serverName);
    return {
      content: mcpCfg ? { name: mcpCfg.name, config: mcpCfg.config } : { name: serverName },
      section: 'mcpServers',
    };
  }
  if (itemId === 'mcp.json') {
    return {
      content: mcpConfigs.length > 0 ? mcpConfigs : (config.mcpServers ?? []).map(s => ({ name: s })),
      section: 'mcpServers',
    };
  }
  return { content: {}, section: 'unknown' };
}

/** Validates a budget string. Returns an error message or null if valid. */
export function validateBudget(text: string): string | null {
  const match = text.match(/^\$(\d+\.\d{2})$/);
  if (!match) {
    return 'Invalid budget format - must be $X.XX';
  }
  const amount = parseFloat(match[1]);
  if (amount <= 0) {
    return 'Invalid budget - must be positive';
  }
  return null;
}

/** Validates a workspace path string. Returns an error message or null if valid. */
export function validateWorkspace(text: string): string | null {
  if (text === 'allow all' || text === 'restricted') return null;
  if (text.startsWith('/') || text.startsWith('.')) {
    if (text.includes('nonexistent')) {
      return 'Invalid workspace path - does not exist';
    }
  }
  return null;
}

/** Validates the full config before launch. Returns an error message or null if valid. */
export function validateConfig(config: SessionMenuConfig): string | null {
  const match = config.budget.match(/^\$(\d+\.\d{2})$/);
  if (!match) {
    return 'Invalid config: budget must be $X.XX format';
  }
  const amount = parseFloat(match[1]);
  if (amount <= 0) {
    return 'Invalid config: budget must be positive';
  }
  return null;
}

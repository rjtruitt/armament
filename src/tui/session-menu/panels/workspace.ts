/**
 * Panel definitions for workspace access configuration.
 */

import type { MenuPanel, SessionMenuConfig } from '../types.js';

/** Registers workspace-related panels into the given map. */
export function registerWorkspacePanels(panels: Map<string, MenuPanel>, config: SessionMenuConfig): void {
  panels.set('workspace', {
    id: 'workspace',
    title: 'Workspace',
    parent: 'root',
    items: [
      {
        id: 'workspace.mode', label: 'Mode', type: 'choice', value: config.workspace,
        choices: [
          { id: 'allow-all', label: 'allow all', description: 'Full access' },
          { id: 'restricted', label: 'restricted', description: 'Limited paths' },
          { id: 'readonly', label: 'readonly', description: 'No writes' },
        ],
      },
      { id: 'workspace.allowedPaths', label: 'Allowed paths', description: 'Comma-separated', type: 'text', value: 'src/, tests/, docs/' },
      { id: 'workspace.denyPaths', label: 'Deny paths', description: 'Blocked patterns', type: 'text', value: config.denyPaths.join(', ') },
      { id: 'workspace.gitAutoCommit', label: 'Git auto-commit', description: 'Commit changes automatically', type: 'toggle', value: false },
      { id: 'workspace.fileWatcher', label: 'File watcher', description: 'Watch for external changes', type: 'toggle', value: false },
      { id: 'workspace.maxFileSize', label: 'Max file size', description: 'KB', type: 'text', value: '1024' },
      {
        id: 'workspace.encoding', label: 'Encoding', type: 'choice', value: 'utf-8',
        choices: [
          { id: 'utf-8', label: 'utf-8' },
          { id: 'ascii', label: 'ascii' },
          { id: 'binary', label: 'binary' },
        ],
      },
    ],
  });
}

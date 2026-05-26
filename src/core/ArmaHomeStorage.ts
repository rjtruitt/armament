/**
 * Memory and session storage for ArmaHome.
 *
 * Provides the ArmaHomeBase class with memory entry CRUD and session
 * history persistence. ArmaHome extends this to add settings, MCP,
 * scripts, themes, and credentials.
 */

import * as path from 'path';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import { logWarn } from './FileLogger.js';


/** Injectable filesystem abstraction for testability. */
export interface FileSystem {
  readFileSync(path: string): string;
  writeFileSync(path: string, data: string): void;
  existsSync(path: string): boolean;
  mkdirSync(path: string, opts?: { recursive: boolean }): void;
  readdirSync(path: string): string[];
  unlinkSync(path: string): void;
  readFile?(path: string): Promise<string>;
  writeFile?(path: string, data: string): Promise<void>;
}


/**
 * defaultFs constant.
 */
export const defaultFs: FileSystem = {
  readFileSync: (p: string) => fs.readFileSync(p, 'utf-8'),
  writeFileSync: (p: string, data: string) => fs.writeFileSync(p, data, 'utf-8'),
  existsSync: (p: string) => fs.existsSync(p),
  mkdirSync: (p: string, opts?: { recursive: boolean }) => { fs.mkdirSync(p, opts); },
  readdirSync: (p: string) => fs.readdirSync(p) as string[],
  unlinkSync: (p: string) => fs.unlinkSync(p),
  readFile: (p: string) => fsp.readFile(p, 'utf-8'),
  writeFile: (p: string, data: string) => fsp.writeFile(p, data, 'utf-8'),
};


/** A single markdown-with-frontmatter memory file entry. */
export interface MemoryEntry {
  id: string;
  type: 'user' | 'feedback' | 'project' | 'reference';
  name: string;
  description: string;
  content: string;
  created: string;
  updated: string;
}

/** Historical session metadata persisted to ~/.armament/history/. */
export interface SessionRecord {
  id: string;
  timestamp: string;
  duration: number;
  cost: number;
  agents: number;
  prompts: number;
  commits: string[];
  workspace: string;
  summary: string;
}


/**
 * Generate id function.
 */
export function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function parseMemoryFrontmatter(raw: string): { meta: Record<string, string>; content: string } {
  const lines = raw.split('\n');
  if (lines[0] !== '---') {
    return { meta: {}, content: raw };
  }
  const endIdx = lines.indexOf('---', 1);
  if (endIdx === -1) {
    return { meta: {}, content: raw };
  }
  const frontmatterLines = lines.slice(1, endIdx);
  const meta: Record<string, string> = {};
  for (const line of frontmatterLines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx > 0) {
      const key = line.slice(0, colonIdx).trim();
      const value = line.slice(colonIdx + 1).trim();
      meta[key] = value;
    }
  }
  const content = lines.slice(endIdx + 1).join('\n').trim();
  return { meta, content };
}

function buildMemoryMarkdown(entry: MemoryEntry): string {
  const lines = [
    '---',
    `id: ${entry.id}`,
    `type: ${entry.type}`,
    `name: ${entry.name}`,
    `description: ${entry.description}`,
    `created: ${entry.created}`,
    `updated: ${entry.updated}`,
    '---',
    '',
    entry.content,
  ];
  return lines.join('\n');
}


/** Base class providing memory and session storage for ArmaHome. */
export class ArmaHomeBase {
  protected homeDir: string;
  protected fs: FileSystem;

  constructor(homeDir: string, fileSystem: FileSystem) {
    this.homeDir = homeDir;
    this.fs = fileSystem;
  }


  /**
   * List memories.
   */
  listMemories(): MemoryEntry[] {
    const memoryDir = path.join(this.homeDir, 'memory');
    if (!this.fs.existsSync(memoryDir)) {
      return [];
    }
    const files = this.fs.readdirSync(memoryDir).filter(f => f.endsWith('.md') && f !== 'MEMORY.md');
    const entries: MemoryEntry[] = [];
    for (const file of files) {
      const filePath = path.join(memoryDir, file);
      try {
        const raw = this.fs.readFileSync(filePath);
        const { meta, content } = parseMemoryFrontmatter(raw);
        entries.push({
          id: meta.id || file.replace('.md', ''),
          type: (meta.type as MemoryEntry['type']) || 'user',
          name: meta.name || file.replace('.md', ''),
          description: meta.description || '',
          content,
          created: meta.created || '',
          updated: meta.updated || '',
        });
      } catch (err) {
        logWarn('ArmaHome', `Failed to read memory file: ${file}`, err);
      }
    }
    return entries;
  }

  /**
   * Gets the memory.
   */
  getMemory(id: string): MemoryEntry {
    const memoryDir = path.join(this.homeDir, 'memory');
    const filePath = path.join(memoryDir, `${id}.md`);
    if (!this.fs.existsSync(filePath)) {
      throw new Error(`Memory entry not found: ${id}`);
    }
    const raw = this.fs.readFileSync(filePath);
    const { meta, content } = parseMemoryFrontmatter(raw);
    return {
      id: meta.id || id,
      type: (meta.type as MemoryEntry['type']) || 'user',
      name: meta.name || id,
      description: meta.description || '',
      content,
      created: meta.created || '',
      updated: meta.updated || '',
    };
  }

  /**
   * Save memory.
   */
  saveMemory(entry: Omit<MemoryEntry, 'id' | 'created' | 'updated'>): string {
    const memoryDir = path.join(this.homeDir, 'memory');
    if (!this.fs.existsSync(memoryDir)) {
      this.fs.mkdirSync(memoryDir, { recursive: true });
    }
    const id = generateId();
    const now = new Date().toISOString();
    const fullEntry: MemoryEntry = {
      ...entry,
      id,
      created: now,
      updated: now,
    };
    const filePath = path.join(memoryDir, `${id}.md`);
    this.fs.writeFileSync(filePath, buildMemoryMarkdown(fullEntry));
    this.updateMemoryIndex();
    return id;
  }

  /**
   * Update memory.
   */
  updateMemory(id: string, content: Partial<MemoryEntry>): void {
    const memoryDir = path.join(this.homeDir, 'memory');
    const filePath = path.join(memoryDir, `${id}.md`);
    if (!this.fs.existsSync(filePath)) {
      throw new Error(`Memory entry not found: ${id}`);
    }
    const existing = this.getMemory(id);
    const updated: MemoryEntry = {
      ...existing,
      ...content,
      id, // id cannot be changed
      updated: new Date().toISOString(),
    };
    this.fs.writeFileSync(filePath, buildMemoryMarkdown(updated));
    this.updateMemoryIndex();
  }

  /**
   * Delete memory.
   */
  deleteMemory(id: string): void {
    const memoryDir = path.join(this.homeDir, 'memory');
    const filePath = path.join(memoryDir, `${id}.md`);
    if (this.fs.existsSync(filePath)) {
      this.fs.unlinkSync(filePath);
    }
    this.updateMemoryIndex();
  }

  /**
   * Search memories.
   */
  searchMemories(query: string): MemoryEntry[] {
    const all = this.listMemories();
    const lowerQuery = query.toLowerCase();
    return all.filter(
      entry =>
        entry.name.toLowerCase().includes(lowerQuery) ||
        entry.content.toLowerCase().includes(lowerQuery) ||
        entry.description.toLowerCase().includes(lowerQuery),
    );
  }

  private updateMemoryIndex(): void {
    const memoryDir = path.join(this.homeDir, 'memory');
    const indexPath = path.join(memoryDir, 'MEMORY.md');
    const entries = this.listMemories();
    const lines = ['# Memory Index', ''];
    for (const entry of entries) {
      lines.push(`- [${entry.name}](${entry.id}.md) — ${entry.description}`);
    }
    lines.push('');
    const data = lines.join('\n');
    if (this.fs.writeFile) {
      this.fs.writeFile(indexPath, data).catch(() => {});
    } else {
      this.fs.writeFileSync(indexPath, data);
    }
  }


  /**
   * List sessions.
   */
  listSessions(limit?: number): SessionRecord[] {
    const historyDir = path.join(this.homeDir, 'history');
    if (!this.fs.existsSync(historyDir)) {
      return [];
    }
    const files = this.fs.readdirSync(historyDir).filter(f => f.endsWith('.json'));
    const sessions: SessionRecord[] = [];
    for (const file of files) {
      const filePath = path.join(historyDir, file);
      try {
        const raw = this.fs.readFileSync(filePath);
        sessions.push(JSON.parse(raw) as SessionRecord);
      } catch (err) {
        logWarn('ArmaHome', `Failed to read session file: ${file}`, err);
      }
    }
    sessions.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    if (limit !== undefined && limit > 0) {
      return sessions.slice(0, limit);
    }
    return sessions;
  }

  /**
   * Gets the session.
   */
  getSession(id: string): SessionRecord {
    const historyDir = path.join(this.homeDir, 'history');
    const filePath = path.join(historyDir, `${id}.json`);
    if (this.fs.existsSync(filePath)) {
      const raw = this.fs.readFileSync(filePath);
      return JSON.parse(raw) as SessionRecord;
    }
    const files = this.fs.readdirSync(historyDir).filter(f => f.endsWith('.json'));
    for (const file of files) {
      const fp = path.join(historyDir, file);
      try {
        const raw = this.fs.readFileSync(fp);
        const record = JSON.parse(raw) as SessionRecord;
        if (record.id === id) return record;
      } catch (err) {
        logWarn('ArmaHome', `Failed to read session file during search: ${file}`, err);
      }
    }
    throw new Error(`Session not found: ${id}`);
  }

  /**
   * Save session.
   */
  saveSession(record: Omit<SessionRecord, 'id'>): string {
    const historyDir = path.join(this.homeDir, 'history');
    if (!this.fs.existsSync(historyDir)) {
      this.fs.mkdirSync(historyDir, { recursive: true });
    }
    const id = generateId();
    const fullRecord: SessionRecord = { ...record, id };
    const filePath = path.join(historyDir, `${id}.json`);
    const data = JSON.stringify(fullRecord, null, 2);
    if (this.fs.writeFile) {
      this.fs.writeFile(filePath, data).catch(() => {});
    } else {
      this.fs.writeFileSync(filePath, data);
    }
    return id;
  }

  /**
   * Gets the sessions by workspace.
   */
  getSessionsByWorkspace(workspace: string): SessionRecord[] {
    const all = this.listSessions();
    return all.filter(s => s.workspace === workspace);
  }
}

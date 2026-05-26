/** Virtual filesystem mock with read, write, list, and exists operations. */
import { SEED_DIRS, SEED_FILES } from './fs-seed-data.js';
/** A virtual file entry with content, size, and permissions. */
/** A virtual file entry with content, size, and permissions. */
export interface FileEntry {
  type: 'file';
  content: string;
  size: number;
  modified: number;
  permissions: string;
}
/** A virtual directory entry. */
/** A virtual directory entry. */
export interface DirEntry {
  type: 'directory';
  modified: number;
  permissions: string;
}
/** Type definition for FsEntry. */
/** Union type for any filesystem entry. */
/** Union type for any filesystem entry. */
export type FsEntry = FileEntry | DirEntry;
/** Result of listing a directory. */
export interface DirListing {
  path: string;
  entries: Array<{
    name: string;
    type: 'file' | 'directory';
    size?: number;
    modified: number;
  }>;
}
/** Configuration for the FileSystemMock server. */
/** Configuration for the FileSystemMock server. */
export interface FileSystemMockConfig {
  seed?: number;
  latencyMs?: number;
  projectRoot?: string;
}
/**
 * Mock server that simulates a virtual filesystem with read, write, list, exists, and delete operations.
 */
/**
 * Mock server that simulates a virtual filesystem with read, write, list, exists, and delete operations.
 */
/**
 * Mock server that simulates a virtual filesystem with read, write, list, exists, and delete operations.
 */
export class FileSystemMock {
  private config: Required<FileSystemMockConfig>;
  private fs: Map<string, FsEntry> = new Map();
  constructor(config?: FileSystemMockConfig) {
    this.config = {
      seed: config?.seed ?? 42,
      latencyMs: config?.latencyMs ?? 0,
      projectRoot: config?.projectRoot ?? '/app',
    };
    this.initializeFileSystem();
  }
  /**
   * Read file.
   */
/**
   * Read the contents of a file.
   * @param path - File path to read
   * @returns File content and size
   * @throws If file does not exist
   */
/**
   * Read the contents of a file.
   * @param path - File path to read
   * @returns File content and size
   * @throws If file does not exist
   */
  async readFile(path: string): Promise<{ content: string; size: number }> {
    if (this.config.latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.config.latencyMs));
    }
    const resolved = this.resolvePath(path);
    const entry = this.fs.get(resolved);
    if (!entry) {
      throw new Error(`ENOENT: no such file or directory, open '${resolved}'`);
    }
    if (entry.type !== 'file') {
      throw new Error(`EISDIR: illegal operation on a directory, read '${resolved}'`);
    }
    return { content: entry.content, size: entry.size };
  }
  /**
   * Write file.
   */
/**
   * Write content to a file (creates or overwrites).
   * @param path - File path to write
   * @param content - Content to write
   * @returns Resolved path and size
   */
/**
   * Write content to a file (creates or overwrites).
   * @param path - File path to write
   * @param content - Content to write
   * @returns Resolved path and size
   */
  async writeFile(path: string, content: string): Promise<{ path: string; size: number }> {
    if (this.config.latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.config.latencyMs));
    }
    const resolved = this.resolvePath(path);
    const parent = resolved.substring(0, resolved.lastIndexOf('/'));
    if (parent && !this.fs.has(parent)) {
      this.mkdirp(parent);
    }
    const entry: FileEntry = {
      type: 'file',
      content,
      size: Buffer.byteLength(content, 'utf8'),
      modified: Date.now(),
      permissions: '-rw-r--r--',
    };
    this.fs.set(resolved, entry);
    return { path: resolved, size: entry.size };
  }
  /**
   * List dir.
   */
/**
   * List contents of a directory.
   * @param path - Directory path to list
   * @returns Sorted directory listing
   * @throws If path is not a directory
   */
/**
   * List contents of a directory.
   * @param path - Directory path to list
   * @returns Sorted directory listing
   * @throws If path is not a directory
   */
  async listDir(path: string): Promise<DirListing> {
    if (this.config.latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.config.latencyMs));
    }
    const resolved = this.resolvePath(path);
    const entry = this.fs.get(resolved);
    if (entry && entry.type !== 'directory') {
      throw new Error(`ENOTDIR: not a directory '${resolved}'`);
    }
    const prefix = resolved === '/' ? '/' : `${resolved}/`;
    const entries: DirListing['entries'] = [];
    const seen = new Set<string>();
    for (const [fullPath, fsEntry] of this.fs) {
      if (fullPath === resolved) continue;
      if (!fullPath.startsWith(prefix)) continue;
      const relative = fullPath.substring(prefix.length);
      const firstSegment = relative.split('/')[0];
      if (seen.has(firstSegment)) continue;
      seen.add(firstSegment);
      const childPath = `${prefix}${firstSegment}`;
      const childEntry = this.fs.get(childPath);
      if (childEntry) {
        entries.push({
          name: firstSegment,
          type: childEntry.type,
          size: childEntry.type === 'file' ? childEntry.size : undefined,
          modified: childEntry.modified,
        });
      } else {
        entries.push({
          name: firstSegment,
          type: 'directory',
          modified: Date.now(),
        });
      }
    }
    entries.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return { path: resolved, entries };
  }
  /**
   * Exists.
   */
/**
   * Check if a file or directory exists.
   * @param path - Path to check
   * @returns Whether exists and type
   */
/**
   * Check if a file or directory exists.
   * @param path - Path to check
   * @returns Whether exists and type
   */
  async exists(path: string): Promise<{ exists: boolean; type?: 'file' | 'directory' }> {
    if (this.config.latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.config.latencyMs));
    }
    const resolved = this.resolvePath(path);
    const entry = this.fs.get(resolved);
    if (entry) {
      return { exists: true, type: entry.type };
    }
    const prefix = resolved === '/' ? '/' : `${resolved}/`;
    for (const key of this.fs.keys()) {
      if (key.startsWith(prefix)) {
        return { exists: true, type: 'directory' };
      }
    }
    return { exists: false };
  }
  /**
   * Delete file.
   */
/**
   * Delete a file or empty directory.
   * @param path - Path to delete
   * @returns Whether deletion succeeded
   * @throws If not found or directory not empty
   */
/**
   * Delete a file or empty directory.
   * @param path - Path to delete
   * @returns Whether deletion succeeded
   * @throws If not found or directory not empty
   */
  async deleteFile(path: string): Promise<{ deleted: boolean }> {
    if (this.config.latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.config.latencyMs));
    }
    const resolved = this.resolvePath(path);
    const entry = this.fs.get(resolved);
    if (!entry) {
      throw new Error(`ENOENT: no such file or directory '${resolved}'`);
    }
    if (entry.type === 'directory') {
      const prefix = `${resolved}/`;
      for (const key of this.fs.keys()) {
        if (key.startsWith(prefix)) {
          throw new Error(`ENOTEMPTY: directory not empty '${resolved}'`);
        }
      }
    }
    this.fs.delete(resolved);
    return { deleted: true };
  }
  /**
   * Gets the tools.
   */
/**
   * Return the list of MCP tool definitions.
   * @returns Array of tool descriptors
   */
/**
   * Return the list of MCP tool definitions.
   * @returns Array of tool descriptors
   */
/**
   * Return the list of MCP tool definitions.
   * @returns Array of tool descriptors
   */
  getTools() {
    return [
      {
        name: 'fs_read_file',
        description: 'Read the contents of a file',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'File path to read' },
          },
          required: ['path'],
        },
      },
      {
        name: 'fs_write_file',
        description: 'Write content to a file (creates or overwrites)',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'File path to write' },
            content: { type: 'string', description: 'Content to write' },
          },
          required: ['path', 'content'],
        },
      },
      {
        name: 'fs_list_dir',
        description: 'List contents of a directory',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Directory path to list' },
          },
          required: ['path'],
        },
      },
      {
        name: 'fs_exists',
        description: 'Check if a file or directory exists',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Path to check' },
          },
          required: ['path'],
        },
      },
      {
        name: 'fs_delete',
        description: 'Delete a file or empty directory',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Path to delete' },
          },
          required: ['path'],
        },
      },
    ];
  }
  /**
   * Call tool.
   */
/**
   * Route a tool call to the appropriate handler.
   * @param name - Tool name
   * @param args - Tool arguments
   * @returns Tool result
   */
/**
   * Route a tool call to the appropriate handler.
   * @param name - Tool name
   * @param args - Tool arguments
   * @returns Tool result
   */
  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    switch (name) {
      case 'fs_read_file':
        return this.readFile(args.path as string);
      case 'fs_write_file':
        return this.writeFile(args.path as string, args.content as string);
      case 'fs_list_dir':
        return this.listDir(args.path as string);
      case 'fs_exists':
        return this.exists(args.path as string);
      case 'fs_delete':
        return this.deleteFile(args.path as string);
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }
  private resolvePath(path: string): string {
    if (path.startsWith('/')) return path;
    return `${this.config.projectRoot}/${path}`;
  }
  private mkdirp(path: string): void {
    const parts = path.split('/').filter(Boolean);
    let current = '';
    for (const part of parts) {
      current += `/${part}`;
      if (!this.fs.has(current)) {
        this.fs.set(current, {
          type: 'directory',
          modified: Date.now(),
          permissions: 'drwxr-xr-x',
        });
      }
    }
  }
  private addFile(path: string, content: string): void {
    const fullPath = `${this.config.projectRoot}${path}`;
    this.fs.set(fullPath, {
      type: 'file',
      content,
      size: Buffer.byteLength(content, 'utf8'),
      modified: Date.now() - Math.floor(Math.random() * 86400000 * 30),
      permissions: '-rw-r--r--',
    });
  }
  private addDir(path: string): void {
    const fullPath = `${this.config.projectRoot}${path}`;
    this.fs.set(fullPath, {
      type: 'directory',
      modified: Date.now() - Math.floor(Math.random() * 86400000 * 30),
      permissions: 'drwxr-xr-x',
    });
  }
  private initializeFileSystem(): void {
    for (const dir of SEED_DIRS) {
      this.addDir(dir.path);
    }
    for (const file of SEED_FILES) {
      this.addFile(file.path, file.content);
    }
  }
}
/**
 * Create a new FileSystemMock server instance.
 * @param config - Optional configuration
 * @returns A new FileSystemMock instance
 */
/** Create a new FileSystemMock instance with optional config. */
/**
 * Create a new FileSystemMock server instance.
 * @param config - Optional configuration
 * @returns A new FileSystemMock instance
 */
/**
 * Create a new FileSystemMock server instance.
 * @param config - Optional configuration
 * @returns A new FileSystemMock instance
 */
export function createMockServer(config?: FileSystemMockConfig): FileSystemMock {
  return new FileSystemMock(config);
}
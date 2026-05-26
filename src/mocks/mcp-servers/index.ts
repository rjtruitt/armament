/** Mock MCP servers simulation layer with factory functions for test registries. */
export { NmapMock, createMockServer as createNmapMock } from './pentest/NmapMock.js';
export type { NmapConfig, NmapResult, NmapPort } from './pentest/NmapMock.js';
export { NucleiMock, createMockServer as createNucleiMock } from './pentest/NucleiMock.js';
export type { NucleiConfig, NucleiResult, NucleiFinding, Severity } from './pentest/NucleiMock.js';
export { BurpSuiteMock, createMockServer as createBurpSuiteMock } from './pentest/BurpSuiteMock.js';
export type { BurpSuiteConfig, ActiveScanResult, PassiveScanResult, BurpIssue } from './pentest/BurpSuiteMock.js';
export { SqlmapMock, createMockServer as createSqlmapMock } from './pentest/SqlmapMock.js';
export type { SqlmapConfig, SqlmapTestResult, SqlmapDumpResult } from './pentest/SqlmapMock.js';
export { GobusterMock, createMockServer as createGobusterMock } from './pentest/GobusterMock.js';
export type { GobusterConfig, GobusterDirResult, GobusterDnsResult } from './pentest/GobusterMock.js';
export { MetasploitMock, createMockServer as createMetasploitMock } from './pentest/MetasploitMock.js';
export type { MetasploitConfig, MsfModule, MsfSession, MsfExploitResult } from './pentest/MetasploitMock.js';
export { BashMock, createMockServer as createBashMock } from './terminal/BashMock.js';
export type { BashMockConfig, BashExecResult } from './terminal/BashMock.js';
export { ProcessMock, createMockServer as createProcessMock } from './terminal/ProcessMock.js';
export type { ProcessMockConfig, ProcessInfo, SpawnResult } from './terminal/ProcessMock.js';
export { GitMock, createMockServer as createGitMock } from './git/GitMock.js';
export type { GitMockConfig, GitCommit, GitBranch, GitStatusResult, GitDiffResult } from './git/GitMock.js';
export { FileSystemMock, createMockServer as createFileSystemMock } from './editor/FileSystemMock.js';
export type { FileSystemMockConfig, DirListing } from './editor/FileSystemMock.js';
export { DiffMock, createMockServer as createDiffMock } from './editor/DiffMock.js';
export type { DiffMockConfig, UnifiedDiff, PatchResult, MergeResult } from './editor/DiffMock.js';
export { JiraMock, createMockServer as createJiraMock } from './services/JiraMock.js';
export type { JiraMockConfig, JiraIssue, JiraSprint, JiraSearchResult } from './services/JiraMock.js';
export { SlackMock, createMockServer as createSlackMock } from './services/SlackMock.js';
export type { SlackMockConfig, SlackMessage, SlackChannel, SlackUser } from './services/SlackMock.js';
export { MockMCPRegistry, createMockRegistry } from './MockMCPRegistry.js';
export type { MockMCPServer, MockServerEntry, ToolCallResult, RegistryConfig, HistoryEntry } from './MockMCPRegistry.js';
import { NmapMock } from './pentest/NmapMock.js';
import { NucleiMock } from './pentest/NucleiMock.js';
import { BurpSuiteMock } from './pentest/BurpSuiteMock.js';
import { SqlmapMock } from './pentest/SqlmapMock.js';
import { GobusterMock } from './pentest/GobusterMock.js';
import { MetasploitMock } from './pentest/MetasploitMock.js';
import { BashMock } from './terminal/BashMock.js';
import { ProcessMock } from './terminal/ProcessMock.js';
import { GitMock } from './git/GitMock.js';
import { FileSystemMock } from './editor/FileSystemMock.js';
import { DiffMock } from './editor/DiffMock.js';
import { JiraMock } from './services/JiraMock.js';
import { SlackMock } from './services/SlackMock.js';
import { MockMCPRegistry } from './MockMCPRegistry.js';
import type { MockMCPServer } from './MockMCPRegistry.js';
/**
 * MockServerType type definition.
 */
/** Mock server type identifiers. */
/** Mock server type identifiers. */
export type MockServerType =
  | 'nmap'
  | 'nuclei'
  | 'burpsuite'
  | 'sqlmap'
  | 'gobuster'
  | 'metasploit'
  | 'bash'
  | 'process'
  | 'git'
  | 'filesystem'
  | 'diff'
  | 'jira'
  | 'slack';
/**
 * MockServerCategory type definition.
 */
/** Category labels for grouping mock server types. */
/** Category labels for grouping mock server types. */
export type MockServerCategory = 'pentest' | 'terminal' | 'git' | 'editor' | 'services';
const SERVER_CATEGORIES: Record<MockServerType, MockServerCategory> = {
  nmap: 'pentest',
  nuclei: 'pentest',
  burpsuite: 'pentest',
  sqlmap: 'pentest',
  gobuster: 'pentest',
  metasploit: 'pentest',
  bash: 'terminal',
  process: 'terminal',
  git: 'git',
  filesystem: 'editor',
  diff: 'editor',
  jira: 'services',
  slack: 'services',
};
/** Create a single mock MCP server by type. */
export function createMockMCPServer(type: MockServerType, config?: Record<string, unknown>): MockMCPServer {
  switch (type) {
    case 'nmap': return new NmapMock(config);
    case 'nuclei': return new NucleiMock(config);
    case 'burpsuite': return new BurpSuiteMock(config);
    case 'sqlmap': return new SqlmapMock(config);
    case 'gobuster': return new GobusterMock(config);
    case 'metasploit': return new MetasploitMock(config);
    case 'bash': return new BashMock(config);
    case 'process': return new ProcessMock(config);
    case 'git': return new GitMock(config);
    case 'filesystem': return new FileSystemMock(config);
    case 'diff': return new DiffMock(config);
    case 'jira': return new JiraMock(config);
    case 'slack': return new SlackMock(config);
    default:
      throw new Error(`Unknown mock server type: ${type}`);
  }
}
/** Create a fully configured MockMCPRegistry with all servers for demo mode. */
export function createFullMockRegistry(config?: {
  seed?: number;
  latencyMs?: number;
  servers?: MockServerType[];
}): MockMCPRegistry {
  const registry = new MockMCPRegistry({ enableHistory: true });
  const seed = config?.seed ?? 42;
  const latencyMs = config?.latencyMs ?? 0;
  const serversToCreate = config?.servers ?? (Object.keys(SERVER_CATEGORIES) as MockServerType[]);
  for (const serverType of serversToCreate) {
    const category = SERVER_CATEGORIES[serverType];
    const serverConfig = { seed, latencyMs };
    const instance = createMockMCPServer(serverType, serverConfig);
    registry.register(serverType, category, instance);
  }
  return registry;
}
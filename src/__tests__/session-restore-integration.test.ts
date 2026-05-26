/**
 * Integration test: Session persistence → restore → resume cycle.
 *
 * Exercises SessionBridge + SessionPersistence + ResumeController
 * using a real filesystem (tmp dir) and fake ChannelAgent stubs.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { SessionPersistence } from '../session/persistence/SessionPersistence.js';
import { SessionBridge } from '../session/persistence/SessionBridge.js';
import { ResumeController } from '../session/persistence/ResumeController.js';
import type { IChannelStateFile, ISessionManifest } from '../session/interfaces/ISessionPersistence.js';

function createFakeAgent(overrides: Partial<{
  model: string;
  providerType: string;
  turnCount: number;
  totalTokens: number;
  status: string;
  messages: Array<{ role: string; content: string }>;
  runningSummary: string;
}> = {}) {
  const messages = overrides.messages ?? [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'Hello' },
    { role: 'assistant', content: 'Hi there!' },
  ];
  let importedState: any = null;

  return {
    model: overrides.model ?? 'claude-sonnet-4-6-20250514',
    providerType: overrides.providerType ?? 'anthropic',
    turnCount: overrides.turnCount ?? 2,
    totalTokens: overrides.totalTokens ?? 1500,
    status: overrides.status ?? 'idle',
    exportSession() {
      return {
        messages,
        runningSummary: overrides.runningSummary ?? '',
        snapshots: [],
        config: {},
        compactionHistory: [],
      };
    },
    importSession(state: any) {
      importedState = state;
    },
    getImportedState() {
      return importedState;
    },
  };
}

describe('Session Restore Integration', () => {
  let tmpDir: string;
  let persistence: SessionPersistence;
  let resume: ResumeController;
  let bridge: SessionBridge;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arma-session-test-'));
    persistence = new SessionPersistence({ enabled: true, saveTrigger: 'every-context-update', sessionDir: tmpDir });
    await persistence.initialize(tmpDir);
    resume = new ResumeController();
    bridge = new SessionBridge(persistence, resume);
  });

  afterEach(() => {
    persistence.shutdown();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should save a single channel and manifest to disk', async () => {
    const agent = createFakeAgent();
    bridge.registerAgent('#general', agent as any);
    bridge.setActiveChannel('#general');

    await bridge.saveAll();

    // Wait for debounce
    await new Promise(r => setTimeout(r, 600));

    const manifest = await persistence.loadManifest();
    expect(manifest).not.toBeNull();
    expect(manifest!.channels).toHaveLength(1);
    expect(manifest!.channels[0].name).toBe('#general');
    expect(manifest!.activeChannel).toBe('#general');
  });

  it('should save and restore channel state with warm resume', async () => {
    const agent = createFakeAgent({
      messages: [
        { role: 'system', content: 'System prompt' },
        { role: 'user', content: 'What is 2+2?' },
        { role: 'assistant', content: '4' },
      ],
      turnCount: 3,
      totalTokens: 2000,
    });
    bridge.registerAgent('#math', agent as any);
    bridge.setActiveChannel('#math');

    await bridge.saveAll();
    await new Promise(r => setTimeout(r, 600));

    // Create fresh agents for restore
    const freshAgent = createFakeAgent({ messages: [] });
    const freshBridge = new SessionBridge(persistence, resume);
    freshBridge.registerAgent('#math', freshAgent as any);

    const results = await freshBridge.restoreAll('warm');

    expect(results.size).toBe(1);
    expect(results.get('#math')?.restored).toBe(true);

    const imported = freshAgent.getImportedState();
    expect(imported).not.toBeNull();
    expect(imported.messages).toHaveLength(3);
    expect(imported.messages[1].content).toBe('What is 2+2?');
  });

  it('should restore with cold resume using summary', async () => {
    const agent = createFakeAgent({
      runningSummary: 'User asked math questions. We discussed algebra.',
      messages: [
        { role: 'user', content: 'Explain quadratics' },
        { role: 'assistant', content: 'A quadratic is ax^2+bx+c...' },
      ],
    });
    bridge.registerAgent('#math', agent as any);
    await bridge.saveAll();
    await new Promise(r => setTimeout(r, 600));

    const freshAgent = createFakeAgent({ messages: [] });
    const freshBridge = new SessionBridge(persistence, resume);
    freshBridge.registerAgent('#math', freshAgent as any);

    await freshBridge.restoreAll('cold');

    const imported = freshAgent.getImportedState();
    expect(imported).not.toBeNull();
    expect(imported.messages).toHaveLength(1);
    expect(imported.messages[0].role).toBe('system');
    expect(imported.messages[0].content).toContain('math questions');
    expect(imported.runningSummary).toBe('User asked math questions. We discussed algebra.');
  });

  it('should handle multiple channels', async () => {
    const agent1 = createFakeAgent({ model: 'claude-sonnet-4-6-20250514' });
    const agent2 = createFakeAgent({ model: 'gpt-4o', providerType: 'openai' });

    bridge.registerAgent('#frontend', agent1 as any);
    bridge.registerAgent('#backend', agent2 as any);
    bridge.setActiveChannel('#frontend');

    await bridge.saveAll();
    await new Promise(r => setTimeout(r, 600));

    const manifest = await persistence.loadManifest();
    expect(manifest!.channels).toHaveLength(2);

    const names = manifest!.channels.map(c => c.name);
    expect(names).toContain('#frontend');
    expect(names).toContain('#backend');
  });

  it('should preserve active channel across reload', async () => {
    const agent = createFakeAgent();
    bridge.registerAgent('#code', agent as any);
    bridge.setActiveChannel('#code');

    await bridge.saveAll();
    await new Promise(r => setTimeout(r, 600));

    const freshAgent = createFakeAgent({ messages: [] });
    const freshBridge = new SessionBridge(persistence, resume);
    freshBridge.registerAgent('#code', freshAgent as any);
    await freshBridge.restoreAll('warm');

    const manifest = await persistence.loadManifest();
    expect(manifest!.activeChannel).toBe('#code');
  });

  it('should skip channels with no matching agent on restore', async () => {
    const agent = createFakeAgent();
    bridge.registerAgent('#work', agent as any);
    await bridge.saveAll();
    await new Promise(r => setTimeout(r, 600));

    // Restore with no agents registered
    const emptyBridge = new SessionBridge(persistence, resume);
    const results = await emptyBridge.restoreAll('warm');

    expect(results.size).toBe(0);
  });

  it('should handle missing channel state file gracefully', async () => {
    const agent = createFakeAgent();
    bridge.registerAgent('#test', agent as any);
    await bridge.saveAll();
    await new Promise(r => setTimeout(r, 600));

    // Delete the channel state file
    const files = fs.readdirSync(path.join(tmpDir, 'channels'));
    for (const f of files) {
      fs.unlinkSync(path.join(tmpDir, 'channels', f));
    }

    const freshAgent = createFakeAgent({ messages: [] });
    const freshBridge = new SessionBridge(persistence, resume);
    freshBridge.registerAgent('#test', freshAgent as any);

    const results = await freshBridge.restoreAll('warm');
    expect(results.get('#test')?.restored).toBe(false);
  });

  it('should unregister agent and exclude from next save', async () => {
    const agent1 = createFakeAgent();
    const agent2 = createFakeAgent();
    bridge.registerAgent('#a', agent1 as any);
    bridge.registerAgent('#b', agent2 as any);

    bridge.unregisterAgent('#b');
    await bridge.saveAll();
    await new Promise(r => setTimeout(r, 600));

    const manifest = await persistence.loadManifest();
    expect(manifest!.channels).toHaveLength(1);
    expect(manifest!.channels[0].name).toBe('#a');
  });

  it('should save individual channel without affecting others', async () => {
    const agent1 = createFakeAgent({ messages: [{ role: 'user', content: 'first' }] });
    const agent2 = createFakeAgent({ messages: [{ role: 'user', content: 'second' }] });
    bridge.registerAgent('#one', agent1 as any);
    bridge.registerAgent('#two', agent2 as any);

    await bridge.saveChannel('#one');
    await new Promise(r => setTimeout(r, 600));

    const state = await persistence.loadChannelState('#one');
    expect(state).not.toBeNull();
    expect(state!.messages[0].content).toBe('first');

    // #two should not have been saved yet
    const state2 = await persistence.loadChannelState('#two');
    expect(state2).toBeNull();
  });
});

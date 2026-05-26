import { existsSync, readFileSync, writeFileSync, mkdirSync, appendFileSync, accessSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { CommandRegistration } from '../CommandDispatch.js';
import type { DriftManager } from '../../drift/DriftManager.js';
import { getArmaPath, getChannelRoot, setChannelRoot, channelBaseDir, armaDataDir, ARMAWS_DIR } from '../ChannelPaths.js';

/** Path to core template files. */
const CORE_DIR = armaDataDir();

/** Expand ~ to the user's home directory. */
function expandPath(p: string): string {
  if (p.startsWith('~')) return join(homedir(), p.slice(1));
  return p;
}

/**
 * Generate fresh scaffold files from core templates.
 * Only creates files that don't already exist at the target.
 */
function scaffoldFresh(targetArma: string): string[] {
  const created: string[] = [];

  // notes.md from core-notes.md template
  const notesDst = join(targetArma, 'notes.md');
  if (!existsSync(notesDst)) {
    const src = join(CORE_DIR, 'core-notes.md');
    if (existsSync(src)) {
      mkdirSync(targetArma, { recursive: true });
      writeFileSync(notesDst, readFileSync(src, 'utf-8'));
      created.push(notesDst);
    }
  }

  // architecture/ from core templates
  const archDir = join(targetArma, 'architecture');
  const indexDst = join(archDir, 'index.md');
  if (!existsSync(indexDst)) {
    const src = join(CORE_DIR, 'core-architecture-index.md');
    if (existsSync(src)) {
      mkdirSync(archDir, { recursive: true });
      writeFileSync(indexDst, readFileSync(src, 'utf-8'));
      created.push(indexDst);
    }
  }
  const driftDst = join(archDir, 'drift.md');
  if (!existsSync(driftDst)) {
    const src = join(CORE_DIR, 'core-architecture-drift.md');
    if (existsSync(src)) {
      mkdirSync(archDir, { recursive: true });
      writeFileSync(driftDst, readFileSync(src, 'utf-8'));
      created.push(driftDst);
    }
  }

  return created;
}

/** Get setroot command.
 * @param {DriftManager} driftManager - Description of drift manager.
 */
export function getSetrootCommand(driftManager: DriftManager): CommandRegistration[] {
  return [
    {
      name: 'setroot',
      description: `Set custom root directory for this channel. Creates fresh ${ARMAWS_DIR}/ scaffold from core templates if target is new. Leaves existing ${ARMAWS_DIR}/ alone.`,
      usage: '/setroot <path>',
      handler: (args, ctx) => {
        const input = args.join(' ');
        const channel = ctx.activeChannel;
        if (!channel) {
          return { handled: true, output: 'No active channel.' };
        }

        // Reset to default
        if (!input || input.trim() === '') {
          const bare = channel.startsWith('#') ? channel.slice(1) : channel;
          const armaroot = join(channelBaseDir(channel), '.armaroot');
          if (existsSync(armaroot)) unlinkSync(armaroot);
          // Clear agent workspace to default
          const agent = ctx.channelAgents.get(channel);
          if (agent) {
            const armaPath = getArmaPath(channel);
            agent.setWorkspace(getChannelRoot(channel) + ':/tmp:/dev');
          }
          return { handled: true, output: 'Root reset to default. Workspace updated.' };
        }

        const target = expandPath(input.trim());

        // Validate target exists
        try {
          accessSync(target);
        } catch {
          return { handled: true, output: `Path does not exist: ${input.trim()}` };
        }

        try {
          // Write .armaroot pointer via shared helper
          setChannelRoot(channel, target);

          const targetArma = join(target, ARMAWS_DIR);

          // Generate fresh scaffold from templates (never copy from current channel)
          const created = scaffoldFresh(targetArma);

          // If target is a git repo, add .arma/ to .gitignore
          const gitDir = join(target, '.git');
          if (existsSync(gitDir)) {
            const gitignorePath = join(target, '.gitignore');
            let gitignore = '';
            try {
              gitignore = readFileSync(gitignorePath, 'utf-8');
            } catch {}
            if (!gitignore.includes(ARMAWS_DIR + '/')) {
              const entry = gitignore.endsWith('\n') ? ARMAWS_DIR + '/\n' : '\n' + ARMAWS_DIR + '/\n';
              appendFileSync(gitignorePath, entry);
            }
          }

          // Immediately update agent workspace so it takes effect now
          const agent = ctx.channelAgents.get(channel);
          if (agent) {
            const root = getChannelRoot(channel);
            agent.setWorkspace(root + ':/tmp:/dev');
          }

          return {
            handled: true,
            output: `Root set to ${target}.\n${ARMAWS_DIR}/ scaffold at ${targetArma}\nCreated ${created.length} file(s): ${created.join(', ')}\nWorkspace updated.`,
          };
        } catch (e: any) {
          return { handled: true, output: `Error: ${e.message}` };
        }
      },
    },
  ];
}

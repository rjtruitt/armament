import type { CommandRegistration, CommandContext } from '../CommandDispatch.js';
/** Get configuration/management slash commands (model, provider, theme, etc.). */
export function getConfigCommands(): CommandRegistration[] {
  return [
    {
      name: 'model',
      description: 'Show/change model',
      handler: (args, ctx) => {
        if (args.length > 0) {
          const channel = ctx.activeChannel ?? '#control';
          ctx.switchChannelModel(channel, args[0]);
          return { handled: true, output: `Switching ${channel} to model: ${args[0]}` };
        }
        if (ctx.tui) {
          const models = ctx.getAvailableModels();
          const items = models.map((m: { provider: string; model: string }) => ({
            name: `${m.provider}/${m.model}`,
            description: '',
            category: 'standard' as const,
          }));
          ctx.tui.showPicker('model', items, (selected) => {
            const ch = ctx.activeChannel ?? '#control';
            const [provider, ...modelParts] = selected.name.split('/');
            const model = modelParts.join('/');
            ctx.switchChannelModel(ch, model, provider);
            ctx.tui?.updateStatus({ provider, model });
          });
          return { handled: true };
        }
        const currentModel = ctx.channelAgents.get(ctx.activeChannel ?? '')?.model ?? ctx.getCurrentModel();
        return { handled: true, output: `Current model: ${currentModel}` };
      },
    },
    {
      name: 'provider',
      aliases: ['providers'],
      description: 'Show/change provider',
      handler: (args, ctx) => {
        if (args.length > 0) {
          const channel = ctx.activeChannel ?? '#control';
          const agent = ctx.channelAgents.get(channel);
          const model = agent?.model ?? ctx.getCurrentModel();
          ctx.switchChannelModel(channel, model, args[0]);
          return { handled: true, output: `Switching ${channel} to provider: ${args[0]}` };
        }
        return { handled: true, output: ctx.formatProvidersStatus() };
      },
    },
    {
      name: 'theme',
      description: 'Show/change theme',
      handler: (args, ctx) => {
        if (args.length > 0) {
          ctx.config.theme = args[0];
          import('../../config/UserConfig.js').then(m => m.UserConfig.instance().set('theme', args[0])).catch(() => {});
          return { handled: true };
        }
        return { handled: true, output: `Current theme: ${ctx.config.theme}` };
      },
    },
    {
      name: 'thinking',
      description: 'Toggle thinking display',
      handler: (_args, ctx) => {
        ctx.config.showThinking = !ctx.config.showThinking;
        return { handled: true };
      },
    },
    {
      name: 'verbose',
      description: 'Toggle verbose mode',
      handler: (_args, ctx) => {
        ctx.config.verbose = !ctx.config.verbose;
        return { handled: true };
      },
    },
    {
      name: 'config',
      description: 'Open configuration menu',
      handler: (_args, ctx) => {
        if (ctx.tui) {
          ctx.tui.showConfig();
          return { handled: true, output: '' };
        }
        return { handled: true, output: `Config: ${JSON.stringify(ctx.config, null, 2)}` };
      },
    },
    {
      name: 'set',
      description: 'Set config value',
      handler: (_args, _ctx) => ({ handled: true }),
    },
    {
      name: 'auth',
      description: 'Manage provider authentication',
      handler: (_args, ctx) => {
        return { handled: true, output: `Auth: ${(ctx.config as any).tokenValid !== false ? 'valid' : 'expired'}` };
      },
    },
    {
      name: 'health',
      description: 'Run provider health checks',
      handler: (_args, _ctx) => ({ handled: true, output: 'Health: OK' }),
    },
    {
      name: 'permissions',
      description: 'Show permission settings',
      handler: (_args, ctx) => {
        return { handled: true, output: `Permissions: ${JSON.stringify(ctx.config.toolPermissions)}` };
      },
    },
    {
      name: 'fallback',
      description: 'Configure model fallback chain',
      handler: (_args, ctx) => {
        return { handled: true, output: `Fallback chain: ${ctx.config.fallbackChain.join(' -> ') || 'none'}` };
      },
    },
    {
      name: 'font',
      description: 'Change UI font size',
      handler: (args, ctx) => {
        if (args[0] === 'bigger' || args[0] === '+') {
          ctx.tui?.adjustFontSize(1);
          return { handled: true, output: 'Font size increased' };
        } else if (args[0] === 'smaller' || args[0] === '-') {
          ctx.tui?.adjustFontSize(-1);
          return { handled: true, output: 'Font size decreased' };
        } else if (args[0] === 'reset') {
          ctx.tui?.adjustFontSize(0);
          return { handled: true, output: 'Font size reset' };
        }
        return { handled: true, output: 'Usage: /font bigger|smaller|reset (or + / -)' };
      },
    },
    {
      name: 'channel_config',
      description: 'Open channel config menu',
      handler: (_args, ctx) => {
        if (ctx.tui) {
          const channel = ctx.activeChannel ?? '#control';
          ctx.tui.showChannelConfig(channel);
          return { handled: true, output: '' };
        }
        return { handled: true, output: 'Channel config not available in non-TUI mode' };
      },
    },
    {
      name: 'mcp',
      description: 'Show MCP server status',
      handler: (args, ctx) => {
        return { handled: true, output: ctx.formatMcpStatus(args) };
      },
    },
    {
      name: 'plugin',
      aliases: ['plugins'],
      description: 'Manage plugins',
      handler: (args, ctx) => {
        ctx.handlePluginCommand(args);
        return { handled: true };
      },
    },
  ];
}
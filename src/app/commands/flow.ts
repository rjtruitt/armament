import type { CommandRegistration, CommandContext } from '../CommandDispatch.js';
import type { FlowRuntime } from '../FlowRuntime.js';

/** Get the /flow command registrations (flow, flow run, flow test).
 * @param {FlowRuntime} flowRuntime - The FlowRuntime instance for executing and testing workflows.
 */
export function getFlowCommands(flowRuntime: FlowRuntime): CommandRegistration[] {
  return [
    {
      name: 'flow',
      description: 'Run a workflow (opens picker)',
      usage: '/flow [run|test] [name]',
      category: 'standard',
      picker: {
        title: 'flows',
        getItems: () => flowRuntime.getFlowNames().map(name => ({
          name,
          description: `Run flow: ${name}`,
          category: 'standard' as const,
        })),
        onSelect: (item) => flowRuntime.run(item.name),
      },
      handler: (args, ctx) => {
        const sub = args[0]?.toLowerCase();
        if (sub === 'run' && args[1]) {
          flowRuntime.run(args[1]);
        } else if ((sub === 'test' || sub === 'dry-run') && args[1]) {
          const output = flowRuntime.test(args[1]);
          ctx.tui?.writeMessage('system', '*', output, ctx.activeChannel);
        } else if (sub === 'test' || sub === 'dry-run') {
          showPicker(ctx, flowRuntime, true);
        } else {
          showPicker(ctx, flowRuntime, false);
        }
        return { handled: true };
      },
    },
    {
      name: 'flow run',
      description: 'Run a workflow (opens picker if no name given)',
      usage: '/flow run [name]',
      category: 'standard',
      handler: (args, ctx) => {
        if (args[0]) {
          flowRuntime.run(args[0]);
        } else {
          showPicker(ctx, flowRuntime, false);
        }
        return { handled: true };
      },
    },
    {
      name: 'flow test',
      description: 'Dry-run a workflow (validate + show steps)',
      usage: '/flow test [name]',
      category: 'standard',
      handler: (args, ctx) => {
        if (args[0]) {
          const output = flowRuntime.test(args[0]);
          ctx.tui?.writeMessage('system', '*', output, ctx.activeChannel);
        } else {
          showPicker(ctx, flowRuntime, true);
        }
        return { handled: true };
      },
    },
  ];
}

function showPicker(ctx: CommandContext, flowRuntime: FlowRuntime, testMode: boolean): void {
  const names = flowRuntime.getFlowNames();
  if (names.length === 0) {
    ctx.tui?.writeMessage('system', '*', 'No .armaflow files found. Create .arma/flows/', ctx.activeChannel);
    return;
  }
  const items = names.map(name => ({
    name,
    description: testMode ? `Test flow: ${name}` : `Run flow: ${name}`,
    category: 'standard' as const,
  }));
  ctx.tui?.showPicker(testMode ? 'flow test' : 'flows', items, (selected) => {
    if (testMode) {
      const output = flowRuntime.test(selected.name);
      ctx.tui?.writeMessage('system', '*', output, ctx.activeChannel);
    } else {
      flowRuntime.run(selected.name);
    }
  });
}

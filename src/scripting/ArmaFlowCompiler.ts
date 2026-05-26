/**
 * Compiles flat FlowCommand[] arrays into FlowNode + FlowEdge graphs
 * matching the FlowDefinition / React Flow format.
 */
import type { FlowCommand, FlowNode, FlowEdge, CompletionSchema } from './ArmaFlowTypes.js';

/** Compile flat FlowCommand[] arrays into FlowNode + FlowEdge graph format. */
export function compileCommandsToGraph(commands: FlowCommand[]): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const nodes: FlowNode[] = [];
  const edges: FlowEdge[] = [];
  let nodeIdx = 0;

  function nextId(prefix = 'n'): string { return `${prefix}-${nodeIdx++}`; }

  let lastNodeId: string | null = null;
  let i = 0;
  const parallelStack: { startId: string; childIds: string[] }[] = [];
  let pendingChainSource: string | null = null;
  let lastAgentName: string | null = null;
  const agentNodes: Map<string, string> = new Map(); // name → nodeId

  function addNode(type: FlowNode['type'], config: Record<string, any> = {}, extra: Partial<FlowNode> = {}): string {
    const id = extra.id || nextId(type);
    nodes.push({ id, type, config, ...extra });
    return id;
  }

  function addEdge(from: string, to: string, label?: string) {
    if (from && to) edges.push({ from, to, label });
  }

  function addSeqEdge(to: string, label?: string) {
    if (lastNodeId && to) addEdge(lastNodeId, to, parallelStack.length === 0 ? (label || 'chain') : undefined);
    lastNodeId = to;
  }

  while (i < commands.length) {
    const cmd = commands[i];
    const cc = cmd.command.replace(/-/g, '_');

    if (cc === 'spawn' || cc === 'worker') {
      const name = cc === 'worker' ? (cmd.args[1] || cmd.args[0]) : (cmd.args[0] || `agent-${nodeIdx}`);
      const parent = cc === 'worker' ? cmd.args[0] : undefined;
      const task = cmd.args.slice(cc === 'worker' ? 2 : 1).join(' ') || undefined;
      const id = nextId(name);
      addNode('spawn', { agentName: name, task }, { id });
      if (parent) {
        const parentId = agentNodes.get(parent);
        if (parentId) addEdge(parentId, id, 'child');
        // Mark this as a worker
        (nodes[nodes.length - 1].config as any).role = 'worker';
        // Mark parent as orchestrator
        const parentNode = nodes.find(n => n.id === parentId);
        if (parentNode) (parentNode.config as any).role = 'orchestrator';
      }
      addSeqEdge(id);
      agentNodes.set(name, id);
      lastAgentName = name;
    } else if (cc === 'chain') {
      const full = cmd.args.join(' ');
      if (full.includes('->')) {
        const parts = full.split('->').map(s => s.trim());
        for (const part of parts) {
          const name = part.split(' ')[0] || part;
          const id = nextId(name);
          addNode('spawn', { agentName: name }, { id });
          addSeqEdge(id);
          agentNodes.set(name, id);
          lastAgentName = name;
        }
      } else {
        const name = cmd.args[0] || `agent-${nodeIdx}`;
        const task = cmd.args.slice(1).join(' ') || undefined;
        const id = nextId(name);
        addNode('spawn', { agentName: name, task }, { id });
        addSeqEdge(id);
        agentNodes.set(name, id);
        lastAgentName = name;
      }
      if (cmd.completionSchema) {
        const lastNode = nodes[nodes.length - 1];
        if (lastNode) (lastNode.config as any).completionSchema = cmd.completionSchema;
      }
    } else if (cc === 'join') {
      const id = nextId('join');
      addNode('join', { agentNames: cmd.args }, { id });
      for (const name of cmd.args) {
        const aid = agentNodes.get(name);
        if (aid) addEdge(aid, id, 'join');
      }
      // Don't addSeqEdge — join edges ARE the connections
      lastNodeId = id;
    } else if (cc === 'collect') {
      const arrowIdx = cmd.args.indexOf('->');
      const sources = arrowIdx >= 0 ? cmd.args.slice(0, arrowIdx) : cmd.args;
      const target = arrowIdx >= 0 ? cmd.args.slice(arrowIdx + 1).join(' ') : '';
      const id = nextId('collect');
      addNode('join', { agentNames: sources, collectTarget: target }, { id });
      for (const name of sources) {
        const aid = agentNodes.get(name);
        if (aid)       addEdge(aid, id, 'collect');
      }
      // Don't addSeqEdge — collect edges ARE the connections
      lastNodeId = id;
    } else if (cc === 'parallel') {
      const startId = nextId('parallel');
      addNode('parallel', {}, { id: startId });
      addSeqEdge(startId);
      parallelStack.push({ startId, childIds: [] });
    } else if (cc === 'end') {
      const block = parallelStack.pop();
      if (block) {
        const endId = nextId('end');
        addNode('end', {}, { id: endId });
        for (const childId of block.childIds) {
          addEdge(block.startId, childId);
          addEdge(childId, endId);
        }
        // Connect end to whatever comes next
        addSeqEdge(endId);
      }
    } else if (cc === 'approve' || cc === 'gate') {
      const prompt = cmd.args.join(' ') || '';
      const id = nextId('approval');
      addNode('approval', { prompt, gateType: cc === 'gate' ? (cmd.args[0] || 'confirm') : 'confirm' }, { id });
      addSeqEdge(id);
    } else if (cc === 'wait') {
      const id = nextId('wait');
      addNode('wait', { agentName: cmd.args[0], timeout: cmd.args[2] }, { id });
      const aid = agentNodes.get(cmd.args[0]);
      if (aid) {
        addEdge(aid, id, 'wait');
        // Don't addSeqEdge — the wait edge IS the connection
        lastNodeId = id;
      } else {
        addSeqEdge(id);
      }
    } else if (cc === 'sleep') {
      const id = nextId('sleep');
      addNode('task', { task: 'sleep', duration: cmd.args[0] }, { id });
      addSeqEdge(id);
    } else if (cc === 'kill') {
      const id = nextId('end');
      addNode('end', { action: 'kill', agentName: cmd.args[0] }, { id });
      addSeqEdge(id);
    } else if (cc === 'msg') {
      const id = nextId('task');
      addNode('task', { action: 'msg', target: cmd.args[0], message: cmd.args.slice(1).join(' ') }, { id });
      addSeqEdge(id);
    } else if (cc === 'set') {
      const id = nextId('task');
      addNode('task', { action: 'set', variable: cmd.args[0], value: cmd.args.slice(1).join(' ') }, { id });
      addSeqEdge(id);
    } else if (cc === 'log' || cc === 'emit') {
      const id = nextId('task');
      addNode('task', { action: cc, message: cmd.args.join(' ') }, { id });
      addSeqEdge(id);
    } else if (cc === 'allow') {
      const id = nextId('task');
      addNode('task', { action: 'allow', paths: cmd.args }, { id });
      addSeqEdge(id);
    } else if (cc === 'pipe') {
      const full = cmd.args.join(' ');
      const arrow1 = full.indexOf('->');
      const arrow2 = full.lastIndexOf('->');
      const src = arrow1 >= 0 ? full.slice(0, arrow1).trim() : full;
      const script = (arrow1 >= 0 && arrow2 > arrow1) ? full.slice(arrow1 + 2, arrow2).trim() : '';
      const tgt = arrow2 > arrow1 ? full.slice(arrow2 + 2).trim() : '';
      const id = nextId('task');
      addNode('task', { action: 'pipe', source: src, script, target: tgt }, { id });
      addSeqEdge(id);
    } else if (cc === 'seed') {
      const target = cmd.args[0];
      const role = cmd.args[1] || 'system';
      const content = cmd.args.slice(2).join(' ') || '';
      const targetId = agentNodes.get(target);
      const id = nextId(target || 'seed');
      addNode('task', { action: 'seed', target, role, content }, { id });
      const prevSeeds = nodes.filter(n => n.config?.action === 'seed' && n.config?.target === target && n.id !== id);
      if (prevSeeds.length > 0) {
        // Chain from previous seed
        addEdge(prevSeeds[prevSeeds.length - 1].id, id, 'seed');
        // Remove previous seed's direct edge to agent — only last in chain connects
        const prevEdgeIdx = edges.findIndex(e => e.from === prevSeeds[prevSeeds.length - 1].id && e.to === targetId && e.label === 'seed');
        if (prevEdgeIdx >= 0) edges.splice(prevEdgeIdx, 1);
      }
      if (targetId) addEdge(id, targetId, 'seed');
      // No addSeqEdge — injector nodes only have outgoing edges to their target
    } else if (cc === 'allow') {
      const id = nextId('allow');
      addNode('task', { action: 'allow', paths: cmd.args }, { id });
      // No addSeqEdge — allow nodes are standalone injectors
    } else if (cc === 'pipe') {
      const full = cmd.args.join(' ');
      const arrow1 = full.indexOf('->');
      const arrow2 = full.lastIndexOf('->');
      const src = arrow1 >= 0 ? full.slice(0, arrow1).trim() : full;
      const script = (arrow1 >= 0 && arrow2 > arrow1) ? full.slice(arrow1 + 2, arrow2).trim() : '';
      const tgt = arrow2 > arrow1 ? full.slice(arrow2 + 2).trim() : '';
      const srcId = agentNodes.get(src);
      const tgtId = agentNodes.get(tgt);
      const id = nextId('pipe');
      addNode('task', { action: 'pipe', source: src, script, target: tgt }, { id });
      if (srcId) addEdge(srcId, id, 'pipe');
      if (tgtId) addEdge(id, tgtId, 'pipe');
      // No addSeqEdge — pipe is a side connection between agents
    } else if (cc === 'msg') {
      const target = cmd.args[0];
      const message = cmd.args.slice(1).join(' ') || '';
      const targetId = agentNodes.get(target);
      const id = nextId('msg');
      addNode('task', { action: 'msg', target, message }, { id });
      if (targetId) addEdge(id, targetId, 'msg');
      // No addSeqEdge — msg nodes are injectors
    } else if (cc === 'log' || cc === 'emit') {
      const id = nextId('log');
      addNode('task', { action: cc, message: cmd.args.join(' ') }, { id });
      addSeqEdge(id);
    } else if (cc === 'complete') {
      if (cmd.completionSchema) {
        for (let j = nodes.length - 1; j >= 0; j--) {
          if (nodes[j].type === 'spawn') {
            (nodes[j].config as any).completionSchema = cmd.completionSchema;
            break;
          }
        }
      }
    }

    // Track children in parallel blocks
    if (parallelStack.length > 0 && cc !== 'end' && cc !== 'field' && cc !== 'complete') {
      const lastId = nodes[nodes.length - 1]?.id;
      if (lastId) parallelStack[parallelStack.length - 1].childIds.push(lastId);
    }

    i++;
  }

  return { nodes, edges };
}

/** Decompile FlowNode[] + FlowEdge[] back to FlowCommand[] for execution. */
export function decompileGraphToCommands(
  nodes: FlowNode[], edges: FlowEdge[], meta: { name: string; description?: string; trigger?: string; budget?: string }
): FlowCommand[] {
  const commands: FlowCommand[] = [];
  let idx = 1;

  function cmd(command: string, ...args: string[]): FlowCommand {
    return { command, args, lineNumber: idx++, indent: 0 };
  }

  if (meta.name) commands.push(cmd('name', meta.name));
  if (meta.description) commands.push(cmd('description', meta.description));
  if (meta.trigger) commands.push(cmd('trigger', meta.trigger));
  if (meta.budget) commands.push(cmd('budget', meta.budget));

  // Build adjacency and topological order
  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();
  for (const e of edges) {
    if (!outgoing.has(e.from)) outgoing.set(e.from, []);
    outgoing.get(e.from)!.push(e.to);
    if (!incoming.has(e.to)) incoming.set(e.to, []);
    incoming.get(e.to)!.push(e.from);
  }

  const visited = new Set<string>();
  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  function visit(id: string) {
    if (visited.has(id)) return;
    visited.add(id);
    const node = nodeMap.get(id);
    if (!node) return;

    const c = node.config || {};

    switch (node.type) {
      case 'spawn':
        if (c.agentName && c.task) commands.push(cmd('spawn', c.agentName, c.task));
        else if (c.agentName) commands.push(cmd('spawn', c.agentName));
        break;
      case 'parallel':
        commands.push(cmd('parallel'));
        // Visit children in the block
        const children = outgoing.get(id) || [];
        const endNode = children[children.length - 1];
        for (const childId of children) {
          if (nodeMap.get(childId)?.type !== 'end') visit(childId);
        }
        commands.push(cmd('end'));
        // Don't visit end node separately
        if (endNode) visited.add(endNode);
        break;
      case 'end':
        // no-op (handled by parallel)
        break;
      case 'join':
        if (c.agentNames) commands.push(cmd('join', ...c.agentNames));
        if (c.collectTarget) commands.push(cmd('collect', ...(c.agentNames || []), '->', c.collectTarget));
        break;
      case 'approval':
        if (c.gateType && c.gateType !== 'confirm') commands.push(cmd('gate', c.gateType, c.prompt || ''));
        else commands.push(cmd('approve', c.prompt || ''));
        break;
      case 'wait':
        if (c.timeout) commands.push(cmd('wait', c.agentName || '', '', c.timeout));
        else commands.push(cmd('wait', c.agentName || ''));
        break;
      case 'task':
        if (c.action === 'sleep') commands.push(cmd('sleep', c.duration || '1000'));
        else if (c.action === 'kill') commands.push(cmd('kill', c.agentName || ''));
        else if (c.action === 'msg') commands.push(cmd('msg', c.target || '', c.message || ''));
        else if (c.action === 'set') commands.push(cmd('set', c.variable || '', c.value || ''));
        else if (c.action === 'log') commands.push(cmd('log', c.message || ''));
        else if (c.action === 'emit') commands.push(cmd('emit', c.message || ''));
        else if (c.action === 'allow') commands.push(cmd('allow', ...(c.paths || [])));
        else if (c.action === 'pipe') commands.push(cmd('pipe', `${c.source || ''} -> ${c.script || ''} -> ${c.target || ''}`));
        else if (c.action === 'seed') commands.push(cmd('seed', c.target || '', c.role || '', c.content || ''));
        break;
      default:
        commands.push(cmd(node.type, ...Object.values(c).map(String)));
    }

    // Visit next nodes in sequence
    for (const nextId of outgoing.get(id) || []) {
      const nextNode = nodeMap.get(nextId);
      if (nextNode && nextNode.type !== 'end') {
        const incomingEdges = incoming.get(nextId) || [];
        const allDone = incomingEdges.every(i => visited.has(i));
        if (allDone) visit(nextId);
      }
    }
  }

  // Start with nodes that have no incoming edges
  const startNodes = nodes.filter(n => !incoming.has(n.id) || incoming.get(n.id)!.length === 0);
  for (const n of startNodes) visit(n.id);

  return commands;
}

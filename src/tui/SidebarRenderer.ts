import { ScreenBuffer } from './ScreenBuffer.js';
import { fgRgb, RESET } from '../rendering/index.js';
import type {
  SidebarRegion,
  SidebarTheme,
  ChannelInfo,
  ProviderEntry,
} from './SidebarTypes.js';

type RGB = [number, number, number];

/** Interface for SidebarRenderState.
 * @property {SidebarRegion} region - Description of region.
 * @property {ChannelInfo} channels - Description of channels.
 * @property {ChannelInfo} allChannelsForRender - Description of allChannelsForRender.
 * @property {ProviderEntry} providers - Description of providers.
 * @property {Map<string, ChannelInfo>} systemChannels - Description of systemChannels.
 * @property {Map<string, { name: string; status?: string }>} nodes - Description of nodes.
 * @property {Set<string>} collapsedSections - Description of collapsedSections.
 * @property {string} sections - Description of sections.
 * @property ... and 6 more properties.
 */
export interface SidebarRenderState {
  region: SidebarRegion;
  channels: ChannelInfo[];
  allChannelsForRender: ChannelInfo[];
  providers: ProviderEntry[];
  systemChannels: Map<string, ChannelInfo>;
  nodes: Map<string, { name: string; status?: string }>;
  collapsedSections: Set<string>;
  sections: string[];
  scrollOffset: number;
  theme: string;
  focusedSection: number;
  selectedItem: number;
  activeChildId: string | null;
  activeItem: string | null;
}

function interpolateStops(stops: RGB[], t: number): RGB {
  if (stops.length === 1 || t <= 0) return stops[0];
  if (t >= 1) return stops[stops.length - 1];
  const seg = Math.min(Math.floor(t * (stops.length - 1)), stops.length - 2);
  const lt = (t * (stops.length - 1)) - seg;
  const [r1, g1, b1] = stops[seg], [r2, g2, b2] = stops[seg + 1];
  return [Math.round(r1 + (r2 - r1) * lt), Math.round(g1 + (g2 - g1) * lt), Math.round(b1 + (b2 - b1) * lt)];
}

function formatTokens(n: number): string {
  return n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(1)}k` : `${n}`;
}

function getAccentAnsi(theme: string): string {
  const accentColors: Record<string, string> = {
    red: '\x1b[38;2;255;80;40m',
    ice: '\x1b[38;2;0;150;200m',
    green: '\x1b[38;2;0;150;50m',
    purple: '\x1b[38;2;150;50;200m',
    synthwave: '\x1b[38;2;100;0;200m',
  };
  return accentColors[theme] ?? accentColors.red;
}

function getSectionHeaderAnsi(state: SidebarRenderState, sectionIndex: number): string {
  return state.focusedSection === sectionIndex ? getAccentAnsi(state.theme) : '\x1b[38;2;160;160;160m';
}

function getItemAnsi(state: SidebarRenderState, sectionIndex: number, itemIndex: number, isActive: boolean): string {
  if (state.focusedSection === sectionIndex && state.selectedItem === itemIndex) return '\x1b[7m';
  return isActive ? '\x1b[1m' : '';
}

/** Build visible lines.
 * @param {SidebarRenderState} state - Description of state.
 * @param {string; ansi?: string }[] {} text - Description of text.
 */
export function buildVisibleLines(state: SidebarRenderState): { text: string; ansi?: string }[] {
  const lines: { text: string; ansi?: string }[] = [];
  const { sections, collapsedSections } = state;

  const chIdx = sections.indexOf('channels');
  const chCollapsed = collapsedSections.has('channels');
  lines.push({ text: ` ${chCollapsed ? '▶' : '▼'} channels`, ansi: getSectionHeaderAnsi(state, chIdx) });
  if (!chCollapsed) {
    const allChannels = state.allChannelsForRender;
    allChannels.forEach((ch, i) => {
      const indicator = ch.active ? '●' : '○';
      const badge = ch.unread >= 1000 ? ' 99+' : ch.unread > 0 ? ` ${ch.unread}` : '';
      const prefix = `  ${indicator} `;
      const maxName = state.region.width - prefix.length - badge.length;
      const name = maxName >= ch.name.length ? ch.name : ch.name.slice(0, Math.max(maxName, ch.name.length));
      lines.push({ text: `${prefix}${name}${badge}`, ansi: getItemAnsi(state, chIdx, i, ch.active) });

      if (ch.children && ch.children.length > 0) {
        for (let ci = 0; ci < ch.children.length; ci++) {
          const child = ch.children[ci];
          const isLast = ci === ch.children.length - 1;
          const connector = isLast ? '└' : '├';
          const cst = child.status ?? 'idle';
          const cIsWorking = cst === 'thinking' || cst === 'tool_use' || (cst !== 'idle' && cst !== 'done' && cst !== 'error');
          const statusIcon = cst === 'thinking' ? '◉' : cst === 'tool_use' ? '⚙' : cst === 'done' ? '✓' : cst === 'error' ? '✗' : cIsWorking ? '◉' : '○';
          const isActiveChild = state.activeChildId === child.id;
          const childLine = `    ${connector} ${statusIcon} ${child.label}`;
          const childAnsi =
            isActiveChild ? '\x1b[1m' :
            cIsWorking ? '\x1b[38;2;80;220;100m' :
            cst === 'error' ? '\x1b[38;2;220;60;60m' :
            cst === 'idle' ? '\x1b[38;2;220;200;60m' :
            '\x1b[38;2;120;120;120m';
          lines.push({ text: childLine, ansi: childAnsi });
        }
      }
    });
  }

  if (state.providers.length > 0) {
    const provIdx = sections.indexOf('providers');
    const provCollapsed = collapsedSections.has('providers');
    lines.push({ text: ` ${provCollapsed ? '▶' : '▼'} providers`, ansi: getSectionHeaderAnsi(state, provIdx) });
    if (!provCollapsed) {
      // Group providers by type
      const byType = new Map<string, typeof state.providers>();
      for (const prov of state.providers) {
        const t = prov.type || prov.name;
        if (!byType.has(t)) byType.set(t, []);
        byType.get(t)!.push(prov);
      }
      let pi = 0;
      for (const [typeName, typeProviders] of byType) {
        const typeLabel = typeName === typeProviders[0]?.name && typeProviders.length === 1
          ? typeName // single provider — just show name directly
          : typeName; // multiple — show type as category header
        for (let tpi = 0; tpi < typeProviders.length; tpi++) {
          const prov = typeProviders[tpi];
          const connIcon = prov.connected ? '●' : '○';
          const prefix = typeProviders.length > 1 ? '  └ ' : '  ';
          lines.push({ text: `${prefix}${connIcon} ${prov.name}`, ansi: getItemAnsi(state, provIdx, pi, false) });
          pi++;
          for (const [modelName, stats] of prov.models) {
            lines.push({ text: `    └ ${modelName}`, ansi: '\x1b[38;2;140;140;140m' });
            lines.push({ text: `      tokens: ${formatTokens(stats.tokens)}`, ansi: '\x1b[38;2;100;100;100m' });
            lines.push({ text: `      cache: ${formatTokens(stats.cacheRead)}r / ${formatTokens(stats.cacheWrite)}w`, ansi: '\x1b[38;2;100;100;100m' });
            lines.push({ text: `      agents: ${stats.agents}${stats.cost > 0 ? `  cost: ${stats.cost.toFixed(4)}` : ''}`, ansi: '\x1b[38;2;100;100;100m' });
          }
        }
      }
      // Show total session cost
      const totalCost = Array.from(state.providers).reduce((sum, p) => {
        return sum + Array.from(p.models).reduce((msum, [, s]) => msum + (s.cost || 0), 0);
      }, 0);
      if (totalCost > 0) {
        lines.push({ text: `  total cost: ${totalCost.toFixed(2)}`, ansi: '\x1b[38;2;180;180;100m' });
      }
    }
  }

  const configIdx = sections.indexOf('config');
  const configCollapsed = collapsedSections.has('config');
  lines.push({ text: ` ${configCollapsed ? '▶' : '▼'} config`, ansi: getSectionHeaderAnsi(state, configIdx) });
  if (!configCollapsed) {
    let ci = 0;
    lines.push({ text: `  ○ settings`, ansi: getItemAnsi(state, configIdx, ci++, false) });
    lines.push({ text: `  ○ scheduler`, ansi: getItemAnsi(state, configIdx, ci++, false) });
    lines.push({ text: `    ○ workflows`, ansi: '\x1b[38;2;120;120;120m' });
    lines.push({ text: `    ○ triggers`, ansi: '\x1b[38;2;120;120;120m' });
    lines.push({ text: `    ○ defaults`, ansi: '\x1b[38;2;120;120;120m' });
    lines.push({ text: `    ○ history`, ansi: '\x1b[38;2;120;120;120m' });
    lines.push({ text: `  ○ mcp`, ansi: getItemAnsi(state, configIdx, ci++, false) });
    lines.push({ text: `  ○ providers`, ansi: getItemAnsi(state, configIdx, ci++, false) });
    lines.push({ text: `  ○ models`, ansi: getItemAnsi(state, configIdx, ci++, false) });
  }

  const logsIdx = sections.indexOf('logs');
  const logsCollapsed = collapsedSections.has('logs');
  lines.push({ text: ` ${logsCollapsed ? '▶' : '▼'} logs`, ansi: getSectionHeaderAnsi(state, logsIdx) });
  if (!logsCollapsed) {
    const logItems = [{ id: '#logs', label: 'system' }, { id: '#errors', label: 'errors' }];
    logItems.forEach((lc, i) => {
      const ch = state.systemChannels.get(lc.id);
      const indicator = ch?.active ? '●' : '○';
      lines.push({ text: `  ${indicator} ${lc.label}`, ansi: getItemAnsi(state, logsIdx, i, ch?.active ?? false) });
    });
  }

  if (state.nodes.size > 0) {
    const nodesIdx = sections.indexOf('nodes');
    const nodesCollapsed = collapsedSections.has('nodes');
    lines.push({ text: ` ${nodesCollapsed ? '▶' : '▼'} nodes`, ansi: getSectionHeaderAnsi(state, nodesIdx) });
    if (!nodesCollapsed) {
      let i = 0;
      for (const node of state.nodes.values()) {
        const indicator = node.status === 'active' ? '●' : '○';
        lines.push({ text: `  ${indicator} ${node.name}`, ansi: getItemAnsi(state, nodesIdx, i, false) });
        i++;
      }
    }
  }

  return lines;
}

/** Render basic.
 * @param {ScreenBuffer} screen - Description of screen.
 * @param {SidebarRenderState} state - Description of state.
 */
export function renderBasic(screen: ScreenBuffer, state: SidebarRenderState): void {
  const { region: { width: w, height: h, x, y: startY }, scrollOffset } = state;
  if (w <= 0) return;
  const lines = buildVisibleLines(state);
  const visible = lines.slice(scrollOffset, scrollOffset + h);
  for (let i = 0; i < h; i++) {
    if (i < visible.length) {
      const { text, ansi } = visible[i];
      screen.writeAt(startY + i, x, `${ansi ?? ''}${text.slice(0, w).padEnd(w)}\x1b[0m`);
    } else {
      screen.writeAt(startY + i, x, ' '.repeat(w));
    }
  }
  if (w >= 3) {
    if (scrollOffset > 0) screen.writeAt(startY, x + w - 2, '↑');
    if (lines.length > scrollOffset + h) screen.writeAt(startY + h - 1, x + w - 2, '↓');
  }
}

/** Render themed.
 * @param {ScreenBuffer} screen - Description of screen.
 * @param {SidebarRenderState} state - Description of state.
 * @param {SidebarTheme} theme - Description of theme.
 */
export function renderThemed(
  screen: ScreenBuffer,
  state: SidebarRenderState,
  theme: SidebarTheme,
): (string | null)[] {
  const { accent, noColor, focused, activeChannel } = theme;
  const r = noColor ? '' : RESET;
  const w = state.region.width;
  const h = state.region.height;
  const col = state.region.x;
  const rowMap: (string | null)[] = [];

  const accentDim: RGB = [Math.round(accent[0] * 0.6), Math.round(accent[1] * 0.6), Math.round(accent[2] * 0.6)];
  const activeGlow: RGB = [Math.round(accent[0] * 0.4), Math.round(accent[1] * 0.4), Math.round(accent[2] * 0.4)];
  const inactiveDim: RGB = [160, 160, 160];
  const inactiveBright: RGB = [200, 200, 200];
  const sectionStops: RGB[] = [accentDim, accent, accentDim];

  const gradLabel = (label: string): string => {
    if (noColor) return ` ${label}`;
    let s = ' ';
    for (let i = 0; i < label.length; i++) {
      const t = label.length > 1 ? i / (label.length - 1) : 0.5;
      const [cr, cg, cb] = interpolateStops(sectionStops, t);
      s += `${fgRgb(cr, cg, cb)}${label[i]}`;
    }
    return s + r;
  };

  const activeLine = (name: string): string => {
    if (noColor) return `  ● ${name}`;
    const bg = `\x1b[48;2;${activeGlow[0]};${activeGlow[1]};${activeGlow[2]}m`;
    const dot = fgRgb(accent[0], accent[1], accent[2]);
    const nameStops: RGB[] = [accent, [Math.round(accent[0] * 0.7 + 255 * 0.3), Math.round(accent[1] * 0.7 + 255 * 0.3), Math.round(accent[2] * 0.7 + 255 * 0.3)]];
    let grad = '';
    for (let i = 0; i < name.length; i++) {
      const t = name.length > 1 ? i / (name.length - 1) : 0;
      const [cr, cg, cb] = interpolateStops(nameStops, t);
      grad += `${fgRgb(cr, cg, cb)}${name[i]}`;
    }
    return `${bg}  ${dot}●${r}${bg} ${grad}${r}`;
  };

  const inactiveLine = (name: string): string => {
    if (noColor) return `  ○ ${name}`;
    let grad = '';
    for (let i = 0; i < name.length; i++) {
      const t = name.length > 1 ? i / (name.length - 1) : 0;
      const [cr, cg, cb] = interpolateStops([inactiveDim, inactiveBright], t);
      grad += `${fgRgb(cr, cg, cb)}${name[i]}`;
    }
    return `  ${fgRgb(inactiveDim[0], inactiveDim[1], inactiveDim[2])}○${r} ${grad}${r}`;
  };

  const pad = (plainLen: number) => ' '.repeat(Math.max(0, w - plainLen));
  let row = state.region.y;

  const writeRow = (text: string, mapValue: string | null = null) => {
    if (row >= state.region.y + h) return;
    screen.writeAt(row, col, text);
    rowMap[row] = mapValue;
    row++;
  };

  writeRow(' '.repeat(w));
  const controlActive = activeChannel === '#control';
  if (controlActive) {
    const bg = `\x1b[48;2;${activeGlow[0]};${activeGlow[1]};${activeGlow[2]}m`;
    writeRow(' ' + bg + gradLabel('#control') + r + pad(10), '#control');
  } else {
    writeRow(' ' + gradLabel('#control') + pad(10), '#control');
  }
  writeRow(' '.repeat(w));

  writeRow(' ' + gradLabel('channels') + pad(10));

  const channels = state.channels;
  const allChannels = channels.length > 0 ? channels.filter(ch => ch.name !== '#control') : [];
  for (const ch of allChannels) {
    if (row >= state.region.y + h) break;
    const hasActiveChild = state.activeChildId && ch.children?.some(c => c.id === state.activeChildId);
    const sidebarFocusedElsewhere = focused && state.activeItem && state.activeItem !== ch.name && !ch.children?.some(c => c.id === state.activeItem);
    const isActive = !hasActiveChild && !sidebarFocusedElsewhere && (ch.name === activeChannel || ch.active);
    const line = isActive ? activeLine(ch.name) : inactiveLine(ch.name);
    writeRow('  ' + line + pad(6 + ch.name.length), ch.name);

    if (ch.children) {
      for (let ci = 0; ci < ch.children.length; ci++) {
        if (row >= state.region.y + h) break;
        const child = ch.children[ci];
        const isLast = ci === ch.children.length - 1;
        const connector = isLast ? '└' : '├';
        const st = child.status ?? 'idle';
        const isWorking = st === 'thinking' || st === 'tool_use' || (st !== 'idle' && st !== 'done' && st !== 'error');
        const statusIcon = st === 'thinking' ? '◉' : st === 'tool_use' ? '⚙' : st === 'done' ? '✓' : st === 'error' ? '✗' : isWorking ? '◉' : '○';
        const isChildActive = state.activeChildId === child.id;
        const childColor = noColor ? '' :
          isChildActive ? fgRgb(accent[0], accent[1], accent[2]) + '\x1b[1m' :
          isWorking ? fgRgb(80, 220, 100) :
          st === 'error' ? fgRgb(220, 60, 60) :
          st === 'idle' ? fgRgb(220, 200, 60) :
          fgRgb(120, 120, 120);
        const indicator = isChildActive ? '▸' : connector;
        const childText = `${childColor}      ${indicator} ${statusIcon} ${child.label}${r}`;
        writeRow(childText + pad(10 + child.label.length), child.id);
      }
    }
  }

  if (row < state.region.y + h) {
    const plusHighlighted = focused && state.activeItem === '+new-channel';
    if (plusHighlighted) {
      writeRow('  ' + activeLine('+ new channel') + pad(15), '+new-channel');
    } else {
      const plusColor = noColor ? '' : fgRgb(120, 120, 120);
      writeRow(`  ${plusColor}+ new channel${r}` + pad(15), '+new-channel');
    }
  }

  if (state.providers.length > 0) {
    writeRow(' '.repeat(w));
    writeRow(' ' + gradLabel('providers') + pad(11));
    const mColor = noColor ? '' : fgRgb(140, 140, 140);
    const sColor = noColor ? '' : fgRgb(100, 100, 100);
    // Group providers by type
    const byType = new Map<string, typeof state.providers>();
    for (const prov of state.providers) {
      const t = prov.type || prov.name;
      if (!byType.has(t)) byType.set(t, []);
      byType.get(t)!.push(prov);
    }
    for (const [, typeProviders] of byType) {
      for (const prov of typeProviders) {
        if (row >= state.region.y + h) break;
        const provColor = noColor ? '' : fgRgb(180, 180, 180);
        const prefix = typeProviders.length > 1 ? '    ' : '    ';
        writeRow(`${prefix}${provColor}${prov.connected ? '●' : '○'} ${prov.name}${r}` + pad(8 + prov.name.length), prov.name);
      for (const [mn, ms] of prov.models) {
        if (row >= state.region.y + h) break;
        writeRow(`      └ ${mColor}${mn}${r}` + pad(8 + mn.length));
        const tokLine = `tokens: ${formatTokens(ms.tokens)}`;
        if (row < state.region.y + h) writeRow(`        ${sColor}${tokLine}${r}` + pad(8 + tokLine.length));
        const cacheLine = `cache: ${formatTokens(ms.cacheRead)}r / ${formatTokens(ms.cacheWrite)}w`;
        if (row < state.region.y + h) writeRow(`        ${sColor}${cacheLine}${r}` + pad(8 + cacheLine.length));
        const agLine = `agents: ${ms.agents}${ms.cost > 0 ? `  cost: $${ms.cost.toFixed(4)}` : ''}`;
        if (row < state.region.y + h) writeRow(`        ${sColor}${agLine}${r}` + pad(8 + agLine.length));
      }
    }
  }
  // Total session cost
  const totalCost = Array.from(state.providers).reduce((sum, p) => {
    return sum + Array.from(p.models).reduce((msum, [, s]) => msum + (s.cost || 0), 0);
  }, 0);
  if (totalCost > 0) {
    const tcLine = `total cost: ${totalCost.toFixed(2)}`;
    if (row < state.region.y + h) writeRow(`  ${sColor}${tcLine}${r}` + pad(8 + tcLine.length));
  }
  }

  writeRow(' '.repeat(w));
  writeRow(' ' + gradLabel('config') + pad(8), '@config');

  const stats = theme.stats;

  const settingsActive = activeChannel === '@settings' || activeChannel?.startsWith('@session') || activeChannel === '@context' || activeChannel === '@workspace' || activeChannel?.startsWith('@agents') || activeChannel?.startsWith('@display') || activeChannel?.startsWith('@outputs') || activeChannel?.startsWith('@history');
  const settingsLine = settingsActive ? activeLine('settings') : inactiveLine('settings');
  if (row < state.region.y + h) writeRow('  ' + settingsLine + pad(6 + 'settings'.length), '@settings');

  const writeSubs = (subs: { id: string; label: string }[]) => {
    for (const sub of subs) {
      if (row >= state.region.y + h) break;
      const subActive = activeChannel === sub.id;
      const subColor = subActive ? fgRgb(accent[0], accent[1], accent[2]) : (noColor ? '' : fgRgb(120, 120, 120));
      writeRow(`      ${subColor}${subActive ? '●' : '○'} ${sub.label}${r}` + pad(8 + sub.label.length), sub.id);
    }
  };

  const schedActive = activeChannel === '@scheduler';
  writeRow('  ' + (schedActive ? activeLine('scheduler') : inactiveLine('scheduler')) + pad(6 + 'scheduler'.length), '@scheduler');
  writeSubs([{ id: '@scheduler.workflows', label: 'workflows' }, { id: '@scheduler.triggers', label: 'triggers' }, { id: '@scheduler.defaults', label: 'defaults' }, { id: '@scheduler.history', label: 'history' }]);

  const mcpActive = activeChannel === '@mcp';
  const mcpLine = mcpActive ? activeLine('mcp') : inactiveLine('mcp');
  writeRow('  ' + mcpLine + pad(6 + 'mcp'.length), '@mcp');

  if (stats?.mcpServers?.length) {
    for (const srv of stats.mcpServers) {
      if (row >= state.region.y + h) break;
      const isAuthing = srv.status === 'auth_pending';
      const icon = srv.status === 'connected' ? '●' : (srv.status === 'needs_auth' || isAuthing) ? '○' : '◌';
      let sColor: string;
      if (isAuthing && !noColor) {
        const t = (Date.now() % 1500) / 1500;
        const shimmer = interpolateStops([[200, 160, 60], [100, 220, 140], [200, 160, 60]], t);
        sColor = fgRgb(shimmer[0], shimmer[1], shimmer[2]);
      } else {
        sColor = srv.status === 'connected' ? (noColor ? '' : fgRgb(100, 180, 100))
          : srv.status === 'needs_auth' ? (noColor ? '' : fgRgb(200, 160, 60))
          : (noColor ? '' : fgRgb(120, 120, 120));
      }
      const label = isAuthing ? `${srv.name}...` : srv.name;
      writeRow(`      ${sColor}${icon} ${label}${r}` + pad(8 + label.length), `mcp:${srv.name}`);
    }
  }

  if (row < state.region.y + h) writeRow('  ' + (activeChannel === '@providers' ? activeLine('providers') : inactiveLine('providers')) + pad(6 + 'providers'.length), '@providers');

  writeRow(' '.repeat(w));
  writeRow(' ' + gradLabel('logs') + pad(6));
  const logChannels = [{ id: '#logs', label: 'system' }, { id: '#errors', label: 'errors' }];
  for (const lc of logChannels) {
    if (row >= state.region.y + h) break;
    const ch = state.systemChannels.get(lc.id);
    const isActive = ch?.active || activeChannel === lc.id;
    const line = isActive ? activeLine(lc.label) : inactiveLine(lc.label);
    writeRow('  ' + line + pad(6 + lc.label.length), lc.id);
  }

  while (row < state.region.y + h) {
    screen.writeAt(row, col, ' '.repeat(w));
    row++;
  }

  return rowMap;
}

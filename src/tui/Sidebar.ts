/** Collapsible sidebar with channels, agents, providers, and status sections. */

import { ScreenBuffer } from './ScreenBuffer.js';
import {
  buildVisibleLines,
  renderBasic,
  renderThemed as renderThemedImpl,
  type SidebarRenderState,
} from './SidebarRenderer.js';
import type {
  SidebarStats,
  SidebarTheme,
  SidebarRegion,
  ChannelInfo,
  ChannelChild,
  ModelStats,
  ProviderEntry,
  ScheduledJobEntry,
} from './SidebarTypes.js';

export type {
  SidebarStats,
  SidebarTheme,
  SidebarRegion,
  ChannelInfo,
  ChannelChild,
  ModelStats,
  ProviderEntry,
  ScheduledJobEntry,
};

/**
 * Multi-section sidebar displaying channels, providers, system status, and nodes.
 * Supports collapsible sections, keyboard navigation, and themed rendering.
 */
export class Sidebar {
  private screen: ScreenBuffer;
  private _region: SidebarRegion;
  private _channels: Map<string, ChannelInfo> = new Map();
  private _agents: Map<string, ChannelInfo> = new Map();
  private _systemChannels: Map<string, ChannelInfo> = new Map();
  private _nodes: Map<string, { name: string; status?: string }> = new Map();
  private _providers: Map<string, ProviderEntry> = new Map();
  private _scheduledJobs: Map<string, ScheduledJobEntry> = new Map();
  private _collapsedSections: Set<string> = new Set();
  private _scrollOffset = 0;
  private _theme = 'red';
  private _focusedSection = -1;
  private _selectedItem = -1;
  private listeners: Map<string, Array<(...args: any[]) => void>> = new Map();

  private _activeItem: string | null = null;
  private _activeChildId: string | null = null;
  private _defaultChannel = '#control';
  private _rowMap: (string | null)[] = [];

  constructor(screen: ScreenBuffer, region: SidebarRegion) {
    if (!screen) throw new Error('Buffer is required');
    if (!region) throw new Error('Region is required');
    this.screen = screen;
    this._region = { ...region };
    this._systemChannels.set('#logs', { name: '#logs', active: false, unread: 0, section: 'system' });
    this._systemChannels.set('#cost', { name: '#cost', active: false, unread: 0, section: 'system' });
  }

  /**
   * Gets the active id.
   */
  get activeId(): string | undefined {
    return this.getActive() ?? undefined;
  }

  /**
   * Gets the highlighted item.
   */
  getHighlightedItem(): string | null {
    return this._activeItem;
  }

  /**
   * Gets the region.
   */
  getRegion(): SidebarRegion { return { ...this._region }; }
  /**
   * Sets the region.
   */
  setRegion(region: SidebarRegion): void { this._region = { ...region }; }
  /**
   * Sets the theme.
   */
  setTheme(theme: string): void { this._theme = theme; }

  /**
   * Gets the focused section.
   */
  get focusedSection(): number { return this._focusedSection; }
  /**
   * Sets the focused section.
   */
  set focusedSection(idx: number) { this._focusedSection = idx; }

  /**
   * Gets the selected item.
   */
  get selectedItem(): number { return this._selectedItem; }
  /**
   * Sets the selected item.
   */
  set selectedItem(idx: number) { this._selectedItem = idx; }

  /**
   * Gets the focused section name.
   */
  getFocusedSectionName(): string | null {
    const sections = this.getSections();
    if (this._focusedSection < 0 || this._focusedSection >= sections.length) return null;
    return sections[this._focusedSection];
  }

  /**
   * Handle key.
   */
  handleKey(key: string): boolean {
    const sections = this.getSections();
    if (sections.length === 0) return false;

    if (key === 'tab' || key === 'shift+tab') {
      const dir = key === 'tab' ? 1 : -1;
      if (this._focusedSection < 0) {
        this._focusedSection = dir === 1 ? 0 : sections.length - 1;
      } else {
        this._focusedSection = (this._focusedSection + dir + sections.length) % sections.length;
      }
      this._selectedItem = -1;
      this.emit('section:focus', { section: sections[this._focusedSection] });
      return true;
    }

    if (key === 'up' || key === 'down') {
      if (this._focusedSection < 0) return false;
      const sectionName = sections[this._focusedSection];
      const items = this.getItemsForSection(sectionName);
      if (items.length === 0) return true;
      if (key === 'down') {
        this._selectedItem = this._selectedItem < items.length - 1 ? this._selectedItem + 1 : 0;
      } else {
        this._selectedItem = this._selectedItem <= 0 ? items.length - 1 : this._selectedItem - 1;
      }
      this.emit('item:select', { section: sectionName, index: this._selectedItem, name: items[this._selectedItem] });
      return true;
    }

    if (key === 'enter') {
      if (this._focusedSection < 0 || this._selectedItem < 0) return false;
      const sectionName = sections[this._focusedSection];
      const items = this.getItemsForSection(sectionName);
      if (this._selectedItem >= 0 && this._selectedItem < items.length) {
        const itemName = items[this._selectedItem];
        this.setActive(itemName);
        this.emit('item:activate', { section: sectionName, index: this._selectedItem, name: itemName });
        return true;
      }
      return false;
    }

    return false;
  }

  /**
   * Gets the items for section.
   */
  getItemsForSection(sectionName: string): string[] {
    switch (sectionName) {
      case 'channels':
        return [...this.getAllChannelsForRender().filter(ch => ch.name !== '#control').map(ch => ch.name), '+new-channel'];
      case 'agents':
        return [...this._agents.keys()];
      case 'providers':
        return [...this._providers.keys()];
      case 'config':
        return ['@scheduler', '@scheduler.workflows', '@scheduler.triggers', '@scheduler.defaults', '@scheduler.history', '@mcp', '@providers'];
      case 'logs':
        return ['#logs', '#errors'];
      case 'nodes':
        return [...this._nodes.keys()];
      default:
        return [];
    }
  }

  /**
   * Gets the sections.
   */
  getSections(): string[] {
    const s = ['channels'];
    if (this._providers.size > 0) s.push('providers');
    s.push('config', 'logs');
    if (this._nodes.size > 0) s.push('nodes');
    return s;
  }

  /**
   * Gets the channels.
   */
  getChannels(): ChannelInfo[] { return [...this._channels.values()].sort((a, b) => a.name.localeCompare(b.name)); }
  /**
   * Gets the agents.
   */
  getAgents(): ChannelInfo[] { return [...this._agents.values()]; }
  /**
   * Gets the channel.
   */
  getChannel(name: string): ChannelInfo { return this.findChannel(name)!; }
  /**
   * Checks whether channel exists.
   */
  hasChannel(name: string): boolean { return this._channels.has(name); }
  /**
   * Checks whether agent exists.
   */
  hasAgent(name: string): boolean { return this._agents.has(name); }

  /**
   * Gets the active.
   */
  getActive(): string | null {
    for (const [n, ch] of this._channels) if (ch.active) return n;
    for (const [n, ch] of this._agents) if (ch.active) return n;
    for (const [n, ch] of this._systemChannels) if (ch.active) return n;
    return null;
  }
  /**
   * Gets the scroll offset.
   */
  getScrollOffset(): number { return this._scrollOffset; }

  /**
   * Add channel.
   */
  addChannel(name: string, opts?: { active?: boolean; unread?: number }): void {
    const existing = this._channels.get(name);
    if (existing) { if (opts?.active !== undefined) existing.active = opts.active; if (opts?.unread !== undefined) existing.unread = opts.unread; return; }
    this._channels.set(name, { name, active: opts?.active ?? false, unread: opts?.unread ?? 0, section: 'channels' });
    this.emit('channel:add', { channel: name });
  }

  /**
   * Remove channel.
   */
  removeChannel(name: string): void { this._channels.delete(name); this.emit('channel:remove', { channel: name }); }

  /**
   * Update channel.
   */
  updateChannel(name: string, opts: Partial<{ active: boolean; unread: number }>): void {
    const ch = this.findChannel(name);
    if (!ch) return;
    if (opts.active !== undefined) ch.active = opts.active;
    if (opts.unread !== undefined) ch.unread = opts.unread;
    this.emit('channel:update', { channel: name, ...opts });
  }

  /**
   * Add agent.
   */
  addAgent(name: string, opts?: { active?: boolean; unread?: number; model?: string; status?: string; provider?: string }): void {
    if (this._agents.has(name)) return;
    this._agents.set(name, { name, active: opts?.active ?? false, unread: opts?.unread ?? 0, model: opts?.model, status: opts?.status, provider: opts?.provider, section: 'agents' });
  }

  /**
   * Remove agent.
   */
  removeAgent(name: string): void { this._agents.delete(name); }

  /**
   * Add system channel.
   */
  addSystemChannel(name: string, opts?: { active?: boolean }): void {
    if (this._systemChannels.has(name)) return;
    this._systemChannels.set(name, { name, active: opts?.active ?? false, unread: 0, section: 'system' });
  }

  /**
   * Add node.
   */
  addNode(name: string, opts?: { status?: string }): void { this._nodes.set(name, { name, status: opts?.status }); }

  /**
   * Add scheduled job.
   */
  addScheduledJob(name: string, entry: Omit<ScheduledJobEntry, 'name'>): void { this._scheduledJobs.set(name, { name, ...entry }); }

  /**
   * Update scheduled job.
   */
  updateScheduledJob(name: string, updates: Partial<Omit<ScheduledJobEntry, 'name'>>): void {
    const existing = this._scheduledJobs.get(name);
    if (existing) Object.assign(existing, updates);
  }

  /**
   * Remove scheduled job.
   */
  removeScheduledJob(name: string): void { this._scheduledJobs.delete(name); }
  /**
   * Gets the scheduled jobs.
   */
  getScheduledJobs(): ScheduledJobEntry[] { return [...this._scheduledJobs.values()]; }

  /**
   * Update provider.
   */
  updateProvider(providerName: string, connected: boolean, model: string, stats: Partial<ModelStats>, type?: string): void {
    let entry = this._providers.get(providerName);
    if (!entry) { entry = { name: providerName, type, connected, models: new Map() }; this._providers.set(providerName, entry); }
    entry.type = type ?? entry.type;
    entry.connected = connected;
    const m = entry.models.get(model) ?? { tokens: 0, cost: 0, cacheRead: 0, cacheWrite: 0, agents: 0 };
    if (stats.tokens !== undefined) m.tokens = stats.tokens;
    if (stats.cost !== undefined) m.cost = stats.cost;
    if (stats.cacheRead !== undefined) m.cacheRead = stats.cacheRead;
    if (stats.cacheWrite !== undefined) m.cacheWrite = stats.cacheWrite;
    if (stats.agents !== undefined) m.agents = stats.agents;
    entry.models.set(model, m);
  }

  /**
   * Remove provider.
   */
  removeProvider(name: string): void { this._providers.delete(name); }
  /**
   * Clear providers.
   */
  clearProviders(): void { this._providers.clear(); }
  /**
   * Gets the providers.
   */
  getProviders(): ProviderEntry[] { return [...this._providers.values()]; }

  /**
   * Add child.
   */
  addChild(channelName: string, child: ChannelChild): void {
    const ch = this._channels.get(channelName);
    if (!ch) return;
    if (!ch.children) ch.children = [];
    const existing = ch.children.findIndex(c => c.id === child.id);
    if (existing >= 0) {
      ch.children[existing] = child;
    } else {
      ch.children.push(child);
    }
  }

  /**
   * Remove child.
   */
  removeChild(channelName: string, childId: string): void {
    const ch = this._channels.get(channelName);
    if (ch?.children) ch.children = ch.children.filter(c => c.id !== childId);
  }

  /**
   * Update child.
   */
  updateChild(channelName: string, childId: string, updates: Partial<ChannelChild>): void {
    const child = this._channels.get(channelName)?.children?.find(c => c.id === childId);
    if (child) Object.assign(child, updates);
  }

  /**
   * Sets the active.
   */
  setActive(name: string): void {
    for (const ch of this._channels.values()) ch.active = false;
    for (const ch of this._agents.values()) ch.active = false;
    for (const ch of this._systemChannels.values()) ch.active = false;
    this._activeChildId = null;
    const target = this.findChannel(name);
    if (target) { target.active = true; target.unread = 0; }
    else {
      for (const ch of this._channels.values()) {
        if (ch.children?.some(c => c.id === name)) {
          ch.active = true; ch.unread = 0; this._activeChildId = name; break;
        }
      }
    }
    this.emit('active:change', { channel: name });
  }

  /**
   * Increment unread.
   */
  incrementUnread(name: string): void { const ch = this.findChannel(name); if (ch) ch.unread++; }
  /**
   * Clear unread.
   */
  clearUnread(name: string): void { const ch = this.findChannel(name); if (ch) ch.unread = 0; }

  /**
   * Clear.
   */
  clear(): void { this._channels.clear(); this._agents.clear(); this._systemChannels.clear(); this._nodes.clear(); }

  /**
   * Collapse section.
   */
  collapseSection(s: string): void { this._collapsedSections.add(s); }
  /**
   * Expand section.
   */
  expandSection(s: string): void { this._collapsedSections.delete(s); }
  /**
   * Toggle section.
   */
  toggleSection(s: string): void { this._collapsedSections.has(s) ? this._collapsedSections.delete(s) : this._collapsedSections.add(s); }
  /**
   * Checks whether section collapsed.
   */
  isSectionCollapsed(s: string): boolean { return this._collapsedSections.has(s); }

  /**
   * Needs scroll.
   */
  needsScroll(): boolean { return this.getAllVisibleLines().length > this._region.height; }

  /**
   * Scroll down.
   */
  scrollDown(): void {
    const total = this.getAllVisibleLines().length;
    if (total > this._region.height) this._scrollOffset = Math.min(this._scrollOffset + 1, total - this._region.height);
  }

  /**
   * Scroll up.
   */
  scrollUp(): void { this._scrollOffset = Math.max(0, this._scrollOffset - 1); }

  /**
   * Navigate up.
   */
  navigateUp(): string | null { return this.navigate(-1); }
  /**
   * Navigate down.
   */
  navigateDown(): string | null { return this.navigate(1); }

  private navigate(dir: 1 | -1): string | null {
    const items = this.getAllNavigableItems();
    if (items.length === 0) return null;
    const currentIdx = items.indexOf(this._activeItem ?? this.getActive() ?? '');
    const nextIdx = dir === 1
      ? (currentIdx >= items.length - 1 ? 0 : currentIdx + 1)
      : (currentIdx <= 0 ? items.length - 1 : currentIdx - 1);
    this._activeItem = items[nextIdx];
    const target = this._channels.get(this._activeItem) ?? this._agents.get(this._activeItem) ?? this._systemChannels.get(this._activeItem);
    if (target) this.setActive(this._activeItem);
    return this._activeItem;
  }

  /**
   * Handle click.
   */
  handleClick(_x: number, y: number): string | null {
    const row = y - this._region.y + this._scrollOffset;
    const lines = this.getAllVisibleLines();
    if (row < 0 || row >= lines.length) return null;
    const match = lines[row].text.match(/^\s+[●○◉✓]\s+(.+?)(\s+\[.*\])?(\s+\d+)?$/);
    if (!match) return null;
    const name = match[1].trim();
    this.setActive(name);
    return name;
  }

  /**
   * Render.
   */
  render(): void { renderBasic(this.screen, this.getRenderState()); }

  /**
   * Render themed.
   */
  renderThemed(theme: SidebarTheme): string[] {
    this._rowMap = renderThemedImpl(this.screen, this.getRenderState(), theme);
    return this._rowMap.filter((v): v is string => v !== null);
  }

  /**
   * Gets the row map.
   */
  getRowMap(): (string | null)[] { return this._rowMap ?? []; }
  /**
   * Gets the content.
   */
  getContent(): string { return this.getAllVisibleLines().map(l => l.text).join('\n'); }

  /**
   * On.
   */
  on(event: string, handler: (...args: any[]) => void): void {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event)!.push(handler);
  }

  private findChannel(name: string): ChannelInfo | undefined {
    return this._channels.get(name) ?? this._agents.get(name) ?? this._systemChannels.get(name);
  }

  private emit(event: string, data: any): void {
    const handlers = this.listeners.get(event) ?? [];
    for (const h of handlers) h(data);
  }

  private getRenderState(): SidebarRenderState {
    return {
      region: this._region,
      channels: this.getChannels(),
      allChannelsForRender: this.getAllChannelsForRender(),
      providers: this.getProviders(),
      systemChannels: this._systemChannels,
      nodes: this._nodes,
      collapsedSections: this._collapsedSections,
      sections: this.getSections(),
      scrollOffset: this._scrollOffset,
      theme: this._theme,
      focusedSection: this._focusedSection,
      selectedItem: this._selectedItem,
      activeChildId: this._activeChildId,
      activeItem: this._activeItem,
    };
  }

  private getAllVisibleLines(): { text: string; ansi?: string }[] {
    return buildVisibleLines(this.getRenderState());
  }

  private getAllChannelsForRender(): ChannelInfo[] {
    const chs = [...this._channels.values()].sort((a, b) => a.name.localeCompare(b.name));
    if (!this._channels.has(this._defaultChannel)) return [{ name: this._defaultChannel, active: false, unread: 0, section: 'channels' }, ...chs];
    return chs;
  }

  private getAllNavigableItems(): string[] {
    const items: string[] = ['#control'];
    if (!this._collapsedSections.has('channels')) {
      for (const ch of this.getChannels()) {
        if (ch.name === '#control') continue;
        items.push(ch.name);
        if (ch.children) {
          for (const child of ch.children) items.push(child.id);
        }
      }
      items.push('+new-channel');
    }
    if (!this._collapsedSections.has('config')) {
      items.push('@settings');
      items.push('@scheduler', '@scheduler.workflows', '@scheduler.triggers', '@scheduler.defaults', '@scheduler.history');
      items.push('@mcp');
      items.push('@providers');
    }
    if (!this._collapsedSections.has('logs')) {
      items.push('#logs', '#errors');
    }
    return items;
  }
}

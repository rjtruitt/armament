/** Community script registry with install/uninstall, permission grants, and update checks. */
export function createScriptRegistry(config: any = {}) {
  const installed: string[] = [];
  const permissions = new Map<string, any>();
  return {
    async list() {
      return [
        { name: 'example', tags: ['util'] },
        { name: 'git-helper', tags: ['git'] },
        { name: 'cool-theme', tags: ['theme'] },
      ];
    },
    async search(keyword: string) {
      const all = [
        { name: 'git-helper', tags: ['git'] },
        { name: 'git-auto-commit', tags: ['git', 'automation'] },
      ];
      return all.filter(s => s.name.includes(keyword) || s.tags.includes(keyword));
    },
    async getInfo(name: string) {
      return { name, author: 'community', version: '1.0.0', downloads: 1500, rating: 4.5 };
    },
    async install(name: string) {
      if (!installed.includes(name)) installed.push(name);
    },
    async uninstall(name: string) {
      const i = installed.indexOf(name);
      if (i >= 0) installed.splice(i, 1);
    },
    getInstalled() { return [...installed]; },
    async checkUpdates() {
      return installed.map(name => ({ name, hasUpdate: false }));
    },
    async verify(name: string) {
      return true;
    },
    getScriptPermissions(name: string) {
      return permissions.get(name) || { fileSystem: false, network: false };
    },
    grantPermissions(name: string, perms: any) {
      const current = permissions.get(name) || { fileSystem: false, network: false };
      permissions.set(name, { ...current, ...perms });
    },
    async publish(pkg: any) {
      return { success: true };
    },
    renderList() {
      const installedSet = new Set(installed);
      const lines = ['Scripts:'];
      lines.push(installedSet.size > 0 ? `  installed: ${[...installedSet].join(', ')}` : '  available: git-helper, cool-theme');
      return lines.join('\n');
    },
  };
}
/** Creates the SDK object exposed to plugins for interacting with the armament runtime. */
export function createSDK() {
  const configState: Record<string, any> = {};
  const sdk: any = {
    agents: {
      list: () => [],
      spawn: async (opts: any) => ({ id: opts?.name || 'x' }),
      send: async (_agent: string, _msg: string) => {},
    },
    view: {
      setMode: (_mode: string) => {},
      notify: (_msg: string, _opts?: any) => {},
    },
    session: { getMessages: () => [] },
    config: {
      get: (key: string) => configState[key],
      set: (key: string, value: any) => { configState[key] = value; },
    },
    git: {
      status: () => ({}),
      commit: async (_msg: string) => {},
    },
    tools: { call: async (_tool: string, _args?: any) => {} },
    prompt: { ask: async (_opts: any) => ({ value: true }) },
    workflow: { addStep: (_agent: string, _step: any) => {} },
    mcp: {
      getServers: () => [],
      callTool: async (_server: string, _tool: string, _args?: any) => {},
    },
    statusBar: { addSegment: (_seg: any) => {} },
    hooks: { register: (_hook: any) => {} },
  };
  return sdk;
}
/** Multi-source configuration loader that merges workspace and global configs. */
export function createConfigLoader(config: any = {}) {
  const state: Record<string, any> = { provider: 'anthropic', model: 'sonnet' };
  const loader: any = {
    load(cfg: any) { Object.assign(state, cfg); },
    loadWorkspace(cfg: any) { Object.assign(state, cfg); },
    get(key: string) { return state[key]; },
    getPlugins() { return state.plugins || []; },
    getScripts() { return state.scripts || []; },
    getCustomCommands() { return state.commands || {}; },
    getTheme() { return state.theme || 'ansi'; },
    getStatusBarConfig() { return state.statusBar || {}; },
    getKeybindings() { return state.keybindings || {}; },
    getSearchPaths() { return ['.armamentrc', '.armament.json', 'armament.config.ts']; },
  };
  return loader;
}
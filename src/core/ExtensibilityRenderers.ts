/** Creates the renderer/extension type subsystem used by createPluginSystem. */
export function createRendererSubsystem(baseThemeColors: any) {
  const sidebarWidgets = new Map<string, any>();
  const chatRenderers = new Map<string, any>();
  const notificationRenderers = new Map<string, any>();
  const stepTypes = new Map<string, any>();
  const outputProcessors = new Map<string, any>();
  const agentTypes = new Map<string, any>();
  const themes = new Map<string, any>();
  let activeTheme = 'ansi';
  return {
    sidebarWidgets,
    registerSidebarWidget(widget: any) {
      sidebarWidgets.set(widget.name, widget);
    },
    getSidebarWidgets() {
      return [...sidebarWidgets.keys()];
    },
    renderSidebar(width: number, height: number) {
      const lines: string[] = [];
      for (const [, widget] of sidebarWidgets.entries()) {
        if (widget.position === 'top') {
          lines.push(...widget.render(width, height));
        }
      }
      for (const [, widget] of sidebarWidgets.entries()) {
        if (widget.position === 'bottom' || !widget.position) {
          lines.push(...widget.render(width, height));
        }
      }
      return lines;
    },
    registerChatRenderer(renderer: any) {
      chatRenderers.set(renderer.type, renderer);
    },
    renderChatLine(msg: any, width: number) {
      const renderer = chatRenderers.get(msg.type);
      if (renderer) return renderer.render(msg.data, width);
      return [];
    },
    registerNotificationRenderer(renderer: any) {
      notificationRenderers.set(renderer.type, renderer);
    },
    renderNotification(notification: any) {
      const renderer = notificationRenderers.get(notification.type);
      if (renderer) return renderer.render(notification.data);
      return '';
    },
    registerStepType(step: any) {
      stepTypes.set(step.name, step);
    },
    getStepTypes() {
      return [...stepTypes.keys()];
    },
    getStepTypeChoices() {
      return [...stepTypes.entries()].map(([key, step]) => ({
        key,
        label: step.description || key,
      }));
    },
    getStepConfigSchema(name: string) {
      const step = stepTypes.get(name);
      return step?.configSchema || {};
    },
    async executeStep(name: string, args: any) {
      const step = stepTypes.get(name);
      if (step && step.execute) return step.execute(args);
    },
    registerOutputProcessor(proc: any) {
      outputProcessors.set(proc.name, proc);
    },
    getOutputProcessors() {
      return [...outputProcessors.keys()];
    },
    registerAgentType(agentType: any) {
      agentTypes.set(agentType.name, agentType);
    },
    getAgentTypes() {
      return [...agentTypes.keys()];
    },
    async spawnAgent(typeName: string, opts: any) {
      const agentType = agentTypes.get(typeName);
      return {
        id: opts.name || 'x',
        type: typeName,
        workflow: agentType?.defaultWorkflow || [],
        ...opts,
      };
    },
    getSpawnChoices() {
      return [...agentTypes.entries()].map(([key]) => ({ key, label: key }));
    },
    getAgentTypeVisual(typeName: string) {
      const agentType = agentTypes.get(typeName);
      return agentType?.visual || {};
    },
    registerTheme(theme: any) {
      themes.set(theme.name, theme);
    },
    getThemes() {
      return [...themes.keys()];
    },
    getTheme(name: string) {
      return themes.get(name) || {};
    },
    getThemeColors(name: string) {
      const theme = themes.get(name);
      if (!theme) return {};
      if (theme.extends) {
        return { ...baseThemeColors, ...theme.colors };
      }
      return theme.colors || {};
    },
    setTheme(name: string) {
      activeTheme = name;
    },
    getActiveTheme() {
      return activeTheme;
    },
  };
}
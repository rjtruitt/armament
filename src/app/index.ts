/** Application layer: main app, REPL, commands, channels, flows, and session state. */
export { ArmamentApp, ArmamentRepl } from './ArmamentApp.js';
export { createAppServices } from './createAppServices.js';
export type { AppHost, AppServices } from './createAppServices.js';
export { CommandDispatch } from './CommandDispatch.js';
export type { CommandContext, CommandResult, CommandHandler } from './CommandDispatch.js';
export { buildCommandContext } from './CommandContextBuilder.js';
export type { CommandContextHost } from './CommandContextBuilder.js';
export { ChannelLifecycle } from './ChannelLifecycle.js';
export { FlowRuntime } from './FlowRuntime.js';
export type { FlowRuntimeDeps } from './FlowRuntime.js';
export { buildCompletionTool } from './FlowCompletionTool.js';
export { StreamRouter } from './StreamRouter.js';
export type { OutputTarget, StreamRouterDeps } from './StreamRouter.js';
export { SessionState } from './SessionState.js';
export type { ISessionState } from './SessionState.js';

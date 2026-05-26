/** Handles session resume logic: warm (full replay) and cold (summary-based). */

import type { ResumeMode, IChannelStateFile, ISessionManifest, IResumeController } from '../interfaces/ISessionPersistence.js';

/** Determines resume strategy and prepares state for agent re-initialization. */
export class ResumeController implements IResumeController {
  private _onPrompt?: (channelName: string) => Promise<ResumeMode>;

  constructor(onPrompt?: (channelName: string) => Promise<ResumeMode>) {
    this._onPrompt = onPrompt;
  }

  /**
   * Detect session.
   */
  async detectSession(): Promise<ISessionManifest | null> {
    return null;
  }

  /**
   * Prompt resume mode.
   */
  async promptResumeMode(channelName: string): Promise<ResumeMode> {
    if (this._onPrompt) {
      return this._onPrompt(channelName);
    }
    return 'warm';
  }

  /**
   * Resume warm.
   */
  resumeWarm(channelName: string, state: IChannelStateFile): { messages: IChannelStateFile['messages']; config: IChannelStateFile['agentConfig'] } {
    return {
      messages: state.messages,
      config: state.agentConfig,
    };
  }

  /**
   * Resume cold.
   */
  resumeCold(channelName: string, state: IChannelStateFile, summary: string): { catchUpMessage: string; config: IChannelStateFile['agentConfig'] } {
    return {
      catchUpMessage: `[Session restored — previous context summary]\n\n${summary}\n\n[End of previous session. Continue from here.]`,
      config: state.agentConfig,
    };
  }

  /**
   * Cascade to children.
   */
  cascadeToChildren(channelName: string, mode: ResumeMode, state: IChannelStateFile): Array<{ id: string; mode: ResumeMode }> {
    if (!state.children) return [];
    return state.children.map(child => ({
      id: child.id,
      mode, // cascade same mode to children
    }));
  }
}

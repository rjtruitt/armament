import type { ProviderPool, AskUserHandler } from '../providers/index.js';
import type { TuiRenderer } from './TuiRenderer.js';

/** Dependencies injected into AuthManager for provider pool access and user interaction.
 * @property {ProviderPool} providerPool - Pool of available provider instances.
 * @property {AskUserHandler} askUserHandler - Handler for prompting the user with authentication choices.
 */
export interface AuthManagerDeps {
  providerPool: ProviderPool;
  getTui: () => TuiRenderer | null;
  askUserHandler: AskUserHandler;
  getActiveProvider: () => string;
}

/** Class representing AuthManager. */
export class AuthManager {
  private deps: AuthManagerDeps;
  private _tokenValid = true;
  /** Deduplication: one in-flight auth flow per provider key. */
  private _authInProgress: Map<string, Promise<void>> = new Map();

  constructor(deps: AuthManagerDeps) {
    this.deps = deps;
  }

  /**
   * Gets the token valid.
   */
  get tokenValid(): boolean {
    return this._tokenValid;
  }

  /**
   * Sets the token valid.
   */
  set tokenValid(v: boolean) {
    this._tokenValid = v;
  }

  /**
   * Checks whether auth error.
   */
  isAuthError(err: any): boolean {
    const msg = (err.message || '').toLowerCase();
    return msg.includes('sso token') || msg.includes('authentication required') ||
      msg.includes('expired token') || msg.includes('credentials') ||
      msg.includes('not authorized') || msg.includes('access denied') ||
      err.code === 'CredentialsProviderError' || err.code === 'ExpiredTokenException';
  }

  /**
   * Build a dedup key for a provider agent — includes both type and name/profile
   * so different AWS profiles get separate auth flows.
   */
  private authKey(agent: any): string {
    const provType = agent.providerType || 'unknown';
    const provName = agent.providerName || '';
    return provName ? `${provType}:${provName}` : provType;
  }

  /**
   * Handle auth error with deduplication.
   * If auth is already in progress for the same provider, subsequent callers
   * silently wait instead of spawning duplicate prompts.
   */
  handleAuthError(channel: string, agent: any, _err: any): void {
    const key = this.authKey(agent);
    const provType = agent.providerType || 'unknown';

    // Already handling auth for this provider — subsequent callers join silently
    if (this._authInProgress.has(key)) {
      this.deps.getTui()?.writeMessage('system', 'auth',
        `${provType} authentication already in progress — waiting...`, channel);
      this._authInProgress.get(key)!.then(() => {
        this.deps.getTui()?.writeMessage('system', 'auth',
          `${provType} authentication complete. Retry your message.`, channel);
      });
      return;
    }

    // First auth error for this provider — start the flow
    const promise = new Promise<void>((resolve) => {
      this.deps.askUserHandler.ask(
        `${provType} authentication expired.\nHow would you like to re-authenticate?`,
        ['Run aws sso login', 'I\'ll handle it manually', 'Cancel'],
        channel,
        'radio',
      ).then((choice) => {
        if (choice === 'Run aws sso login') {
          import('node:child_process').then(({ exec }) => {
            exec('aws sso login', (loginErr) => {
              if (loginErr) {
                this.deps.getTui()?.writeMessage('system', 'auth',
                  `SSO login failed: ${loginErr.message}`, channel);
              } else {
                this.deps.getTui()?.writeMessage('system', 'auth',
                  `SSO login complete. Retry your message.`, channel);
              }
              resolve();
            });
          });
          this.deps.getTui()?.writeMessage('system', 'auth',
            `Opening SSO login flow...`, channel);
        } else if (choice === 'I\'ll handle it manually') {
          this.deps.getTui()?.writeMessage('system', 'auth',
            `Run: aws sso login --profile <your-profile>\nThen retry your message.`, channel);
          resolve();
        } else {
          resolve();
        }
      });
    }).finally(() => {
      this._authInProgress.delete(key);
    });

    this._authInProgress.set(key, promise);
  }

  /**
   * Handle o auth flow event.
   */
  handleOAuthFlowEvent(provider: string, url: string): Promise<string> {
    return this.deps.askUserHandler.ask(
      `Authorize ${provider}?\n${url}`,
      ['Open browser & authorize', 'Copy URL only', 'Skip'],
      '#control',
      'radio',
    );
  }

  /**
   * Authenticate.
   */
  async authenticate(): Promise<any> {
    this._tokenValid = true;
    return { success: true, provider: this.deps.getActiveProvider() };
  }

  /**
   * Simulate token expiring.
   */
  simulateTokenExpiring(): void {
    this._tokenValid = false;
  }
}

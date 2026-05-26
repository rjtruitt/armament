import type { ProviderPool, AskUserHandler } from '../providers/index.js';
import type { TuiRenderer } from './TuiRenderer.js';

/** Interface for AuthManagerDeps.
 * @property {ProviderPool} providerPool - Description of providerPool.
 * @property {AskUserHandler} askUserHandler - Description of askUserHandler.
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
   * Handle auth error.
   */
  handleAuthError(channel: string, agent: any, _err: any): void {
    const provType = agent.providerType || 'unknown';
    this.deps.askUserHandler.ask(
      `${provType} authentication expired.\nHow would you like to re-authenticate?`,
      ['Run aws sso login', 'I\'ll handle it manually', 'Cancel'],
      channel,
      'radio',
    ).then((choice) => {
      if (choice === 'Run aws sso login') {
        import('node:child_process').then(cp => {
          cp.exec('aws sso login', (loginErr) => {
            if (loginErr) {
              this.deps.getTui()?.writeMessage('system', 'auth',
                `SSO login failed: ${loginErr.message}`, channel);
            } else {
              this.deps.getTui()?.writeMessage('system', 'auth',
                `SSO login complete. Retry your message.`, channel);
            }
          });
        });
        this.deps.getTui()?.writeMessage('system', 'auth',
          `Opening SSO login flow...`, channel);
      } else if (choice === 'I\'ll handle it manually') {
        this.deps.getTui()?.writeMessage('system', 'auth',
          `Run: aws sso login --profile <your-profile>\nThen retry your message.`, channel);
      }
    });
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

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as http from 'node:http';
import * as crypto from 'node:crypto';
import { homedir } from 'node:os';
import open from 'open';
import { UserConfig } from '../config/index.js';
import type { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';
import type { OAuthClientMetadata, OAuthClientInformationMixed, OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js';

/**
 * Mcp o auth provider options interface.
 */
export interface McpOAuthProviderOptions {
  serverName: string;
  serverUrl: string;
  clientName?: string;
  scopes?: string[];
  onMessage?: (msg: string) => void;
}

/**
 * Mcp o auth provider class.
 */
export class McpOAuthProvider implements OAuthClientProvider {
  private _serverName: string;
  private _serverUrl: string;
  private _clientName: string;
  private _scopes: string[];
  private _onMessage: (msg: string) => void;
  private _codeVerifier: string = '';
  private _callbackServer: http.Server | null = null;
  private _redirectPort: number = 0;

  constructor(opts: McpOAuthProviderOptions) {
    this._serverName = opts.serverName;
    this._serverUrl = opts.serverUrl;
    this._clientName = opts.clientName || 'Armament';
    this._scopes = opts.scopes || [];
    this._onMessage = opts.onMessage || (() => {});
  }

  /**
   * Gets the redirect url.
   */
  get redirectUrl(): string | undefined {
    if (this._redirectPort === 0) return undefined;
    return `http://localhost:${this._redirectPort}/callback`;
  }

  /**
   * Gets the client metadata.
   */
  get clientMetadata(): OAuthClientMetadata {
    const redirectUri = this._redirectPort > 0
      ? `http://localhost:${this._redirectPort}/callback`
      : `http://localhost:3333/callback`;
    return {
      redirect_uris: [redirectUri],
      client_name: this._clientName,
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      scope: this._scopes.join(' '),
    };
  }

  /**
   * State.
   */
  async state(): Promise<string> {
    const buf = crypto.randomBytes(32);
    return buf.toString('base64url');
  }

  /**
   * Client information.
   */
  async clientInformation(): Promise<OAuthClientInformationMixed | undefined> {
    const config = this.loadServerConfig();
    if (config?.auth?.clientId) {
      return { client_id: config.auth.clientId };
    }
    return undefined;
  }

  /**
   * Save client information.
   */
  async saveClientInformation(info: OAuthClientInformationMixed): Promise<void> {
    this.persistClientId(info.client_id);
    this._onMessage(`Registered: ${info.client_id}`);
  }

  /**
   * Tokens.
   */
  async tokens(): Promise<OAuthTokens | undefined> {
    const config = this.loadServerConfig();
    const auth = config?.auth;
    if (auth?.accessToken) {
      return {
        access_token: auth.accessToken,
        token_type: 'bearer',
        refresh_token: auth.refreshToken,
        expires_in: auth.expiresAt ? Math.floor((auth.expiresAt - Date.now()) / 1000) : undefined,
      };
    }
    return undefined;
  }

  /**
   * Save tokens.
   */
  async saveTokens(tokens: OAuthTokens): Promise<void> {
    if (UserConfig.instance().getNoPersist()) return;
    const file = this.mcpJsonPath();
    try {
      const configs = this.loadAllConfigs();
      const entry = configs.find((c: any) => c.name === this._serverName);
      if (entry) {
        if (!entry.config.auth) entry.config.auth = {};
        entry.config.auth.accessToken = tokens.access_token;
        if (tokens.refresh_token) entry.config.auth.refreshToken = tokens.refresh_token;
        if (tokens.expires_in) entry.config.auth.expiresAt = Date.now() + tokens.expires_in * 1000;
        fs.writeFileSync(file, JSON.stringify(configs, null, 2), 'utf8');
        this._onMessage(`✓ ${this._serverName} authenticated`);
      }
    } catch {}
  }

  /**
   * Redirect to authorization.
   */
  async redirectToAuthorization(authorizationUrl: URL): Promise<void> {
    this._onMessage(`┌─ OAuth — ${this._serverName} ─────────────────────`);
    this._onMessage(`│ Opening browser for authorization...`);
    this._onMessage(`│ If it doesn't open, use this link:`);
    this._onMessage(`│ ${authorizationUrl.toString()}`);
    this._onMessage(`└─ Waiting for callback...`);

    await open(authorizationUrl.toString());
  }

  /**
   * Save code verifier.
   */
  async saveCodeVerifier(codeVerifier: string): Promise<void> {
    this._codeVerifier = codeVerifier;
  }

  /**
   * Code verifier.
   */
  async codeVerifier(): Promise<string> {
    return this._codeVerifier;
  }

  private _codeResolve?: (code: string) => void;
  private _codeReject?: (err: Error) => void;
  private _bufferedCode?: string;

  /**
   * Discover scopes from the authorization server metadata if not configured.
   */
  async discoverScopes(): Promise<void> {
    if (this._scopes.length > 0) return;
    try {
      const prmRes = await fetch(`${new URL(this._serverUrl).origin}/.well-known/oauth-protected-resource`);
      if (!prmRes.ok) return;
      const prm = await prmRes.json() as { authorization_servers?: string[] };
      const asUrl = prm.authorization_servers?.[0];
      if (!asUrl) return;
      const asRes = await fetch(`${new URL(asUrl).origin}/.well-known/oauth-authorization-server`);
      if (!asRes.ok) return;
      const asMeta = await asRes.json() as { scopes_supported?: string[] };
      if (Array.isArray(asMeta.scopes_supported) && asMeta.scopes_supported.length > 0) {
        this._scopes = asMeta.scopes_supported;
      }
    } catch {}
  }

  /**
   * Start callback server and wait for port assignment.
   * Call this before initiating the OAuth flow so redirectUrl has a real port.
   */
  async ensureCallbackReady(): Promise<void> {
    if (this._redirectPort > 0) return;
    await this.discoverScopes();
    await new Promise<void>((resolve) => {
      this._callbackServer = http.createServer((req, res) => {
        if (!req.url?.startsWith('/callback')) {
          res.writeHead(404);
          res.end();
          return;
        }
        const cbUrl = new URL(req.url, `http://localhost`);
        const code = cbUrl.searchParams.get('code');
        const error = cbUrl.searchParams.get('error');

        if (error) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end(`<h1>Auth failed: ${error}</h1><p>You can close this window.</p>`);
          this._callbackServer?.close();
          this._codeReject?.(new Error(`OAuth error: ${error}`));
          return;
        }
        if (!code) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end('<h1>No code received</h1>');
          this._callbackServer?.close();
          this._codeReject?.(new Error('No auth code'));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<h1>Authorized!</h1><p>Return to Armament.</p>');
        this._callbackServer?.close();
        if (this._codeResolve) {
          this._codeResolve(code);
        } else {
          this._bufferedCode = code;
        }
      });

      this._callbackServer.listen(0, () => {
        const addr = this._callbackServer!.address();
        this._redirectPort = typeof addr === 'object' && addr ? addr.port : 0;
        resolve();
      });

      setTimeout(() => {
        this._callbackServer?.close();
        this._codeReject?.(new Error('Auth timed out (5 min)'));
      }, 300_000);
    });
  }

  /**
   * Wait for the callback to receive the auth code.
   * Call after ensureCallbackReady + initiating the auth flow.
   */
  waitForAuthCode(): Promise<string> {
    if (this._bufferedCode) {
      const code = this._bufferedCode;
      this._bufferedCode = undefined;
      return Promise.resolve(code);
    }
    return new Promise((resolve, reject) => {
      this._codeResolve = resolve;
      this._codeReject = reject;
    });
  }

  private persistClientId(clientId: string): void {
    if (UserConfig.instance().getNoPersist()) return;
    const file = this.mcpJsonPath();
    try {
      const configs = this.loadAllConfigs();
      const entry = configs.find((c: any) => c.name === this._serverName);
      if (entry) {
        if (!entry.config.auth) entry.config.auth = {};
        entry.config.auth.clientId = clientId;
        fs.writeFileSync(file, JSON.stringify(configs, null, 2), 'utf8');
      }
    } catch {}
  }

  private mcpJsonPath(): string {
    return path.join(homedir(), '.armament', 'mcp.json');
  }

  private loadAllConfigs(): any[] {
    try {
      const raw = fs.readFileSync(this.mcpJsonPath(), 'utf8');
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }

  private loadServerConfig(): any | undefined {
    const configs = this.loadAllConfigs();
    return configs.find((c: any) => c.name === this._serverName)?.config;
  }
}

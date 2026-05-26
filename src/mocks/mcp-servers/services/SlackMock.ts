/** A Slack user with profile and presence info. */
export interface SlackUser {
  id: string;
  name: string;
  real_name: string;
  display_name: string;
  email: string;
  is_bot: boolean;
  status_text?: string;
  status_emoji?: string;
  timezone: string;
  is_online: boolean;
}
/** Interface for SlackChannel.
 * @property ... and 1 more properties.
 */
/** A Slack channel with metadata and membership. */
/** A Slack channel with metadata and membership. */
export interface SlackChannel {
  id: string;
  name: string;
  is_private: boolean;
  topic: string;
  purpose: string;
  members: string[];
  created: number;
  creator: string;
  is_archived: boolean;
}
/** A message in a Slack channel. */
/** A message in a Slack channel. */
export interface SlackMessage {
  ts: string;
  user: string;
  text: string;
  channel: string;
  thread_ts?: string;
  reactions?: Array<{ name: string; users: string[]; count: number }>;
  attachments?: SlackAttachment[];
  edited?: { user: string; ts: string };
}
/** A message attachment with fields and formatting. */
/** A message attachment with fields and formatting. */
export interface SlackAttachment {
  title?: string;
  text?: string;
  color?: string;
  fields?: Array<{ title: string; value: string; short: boolean }>;
}
/** Result of posting a message to Slack. */
/** Result of posting a message to Slack. */
export interface PostMessageResult {
  ok: boolean;
  channel: string;
  ts: string;
  message: SlackMessage;
}
/** Configuration for the SlackMock server. */
/** Configuration for the SlackMock server. */
export interface SlackMockConfig {
  seed?: number;
  latencyMs?: number;
  botName?: string;
}
class SeededRandom {
  private seed: number;
  constructor(seed: number) { this.seed = seed; }
  next(): number {
    this.seed = (this.seed * 1664525 + 1013904223) & 0xffffffff;
    return (this.seed >>> 0) / 0xffffffff;
  }
  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }
  pick<T>(arr: T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }
}
/**
 * Mock server that simulates Slack API with channels, messages, and users.
 * Provides tools: slack_post_message, slack_get_messages, slack_get_channels,
 *   slack_get_users, slack_search, slack_add_reaction.
 */
/**
 * Mock server that simulates Slack API with channels, messages, and users.
 * Provides tools: slack_post_message, slack_get_messages, slack_get_channels,
 *   slack_get_users, slack_search, slack_add_reaction.
 */
export class SlackMock {
  private config: Required<SlackMockConfig>;
  private rng: SeededRandom;
  private channels: Map<string, SlackChannel> = new Map();
  private messages: Map<string, SlackMessage[]> = new Map(); // channel_id -> messages
  private users: Map<string, SlackUser> = new Map();
  private tsCounter = 1716000000;
  constructor(config?: SlackMockConfig) {
    this.config = {
      seed: config?.seed ?? 42,
      latencyMs: config?.latencyMs ?? 0,
      botName: config?.botName ?? 'armament-bot',
    };
    this.rng = new SeededRandom(this.config.seed);
    this.initializeData();
  }
  /**
   * Post message.
   */
/**
   * Post a message to a Slack channel.
   * @param channel - Channel name or ID
   * @param text - Message text
   * @param opts - Optional: thread_ts, attachments
   * @returns Post result with timestamp
   */
/**
   * Post a message to a Slack channel.
   * @param channel - Channel name or ID
   * @param text - Message text
   * @param opts - Optional: thread_ts, attachments
   * @returns Post result with timestamp
   */
  async postMessage(channel: string, text: string, opts?: {
    thread_ts?: string;
    attachments?: SlackAttachment[];
  }): Promise<PostMessageResult> {
    if (this.config.latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.config.latencyMs));
    }
    const channelObj = this.findChannel(channel);
    if (!channelObj) {
      throw new Error(`channel_not_found: ${channel}`);
    }
    const ts = this.generateTs();
    const message: SlackMessage = {
      ts,
      user: 'U_BOT',
      text,
      channel: channelObj.id,
      thread_ts: opts?.thread_ts,
      attachments: opts?.attachments,
    };
    const channelMessages = this.messages.get(channelObj.id) ?? [];
    channelMessages.push(message);
    this.messages.set(channelObj.id, channelMessages);
    return {
      ok: true,
      channel: channelObj.id,
      ts,
      message,
    };
  }
  /**
   * Gets the messages.
   */
/**
   * Get messages from a Slack channel.
   * @param channel - Channel name or ID
   * @param opts - Optional: since, limit, inclusive
   * @returns Array of messages
   */
/**
   * Get messages from a Slack channel.
   * @param channel - Channel name or ID
   * @param opts - Optional: since, limit, inclusive
   * @returns Array of messages
   */
  async getMessages(channel: string, opts?: {
    since?: string;
    limit?: number;
    inclusive?: boolean;
  }): Promise<{ ok: boolean; messages: SlackMessage[] }> {
    if (this.config.latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.config.latencyMs));
    }
    const channelObj = this.findChannel(channel);
    if (!channelObj) {
      throw new Error(`channel_not_found: ${channel}`);
    }
    let messages = this.messages.get(channelObj.id) ?? [];
    if (opts?.since) {
      const sinceTs = parseFloat(opts.since);
      messages = messages.filter((m) => {
        const msgTs = parseFloat(m.ts);
        return opts.inclusive ? msgTs >= sinceTs : msgTs > sinceTs;
      });
    }
    if (opts?.limit) {
      messages = messages.slice(-opts.limit);
    }
    return { ok: true, messages };
  }
  /**
   * Gets the channels.
   */
/**
   * List all non-archived Slack channels.
   * @returns Array of channels
   */
/**
   * List all non-archived Slack channels.
   * @returns Array of channels
   */
  async getChannels(): Promise<{ ok: boolean; channels: SlackChannel[] }> {
    if (this.config.latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.config.latencyMs));
    }
    return {
      ok: true,
      channels: Array.from(this.channels.values()).filter((c) => !c.is_archived),
    };
  }
  /**
   * Gets the users.
   */
/**
   * List all Slack users.
   * @returns Array of users
   */
/**
   * List all Slack users.
   * @returns Array of users
   */
  async getUsers(): Promise<{ ok: boolean; members: SlackUser[] }> {
    if (this.config.latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.config.latencyMs));
    }
    return {
      ok: true,
      members: Array.from(this.users.values()),
    };
  }
  /**
   * Gets the channel.
   */
/**
   * Get a specific Slack channel by name or ID.
   * @param channel - Channel name or ID
   * @returns Channel info
   */
/**
   * Get a specific Slack channel by name or ID.
   * @param channel - Channel name or ID
   * @returns Channel info
   */
  async getChannel(channel: string): Promise<{ ok: boolean; channel: SlackChannel }> {
    if (this.config.latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.config.latencyMs));
    }
    const channelObj = this.findChannel(channel);
    if (!channelObj) {
      throw new Error(`channel_not_found: ${channel}`);
    }
    return { ok: true, channel: channelObj };
  }
  /**
   * Add reaction.
   */
/**
   * Add a reaction emoji to a message.
   * @param channel - Channel name or ID
   * @param timestamp - Message timestamp
   * @param emoji - Emoji name
   * @returns Success indicator
   */
/**
   * Add a reaction emoji to a message.
   * @param channel - Channel name or ID
   * @param timestamp - Message timestamp
   * @param emoji - Emoji name
   * @returns Success indicator
   */
  async addReaction(channel: string, timestamp: string, emoji: string): Promise<{ ok: boolean }> {
    if (this.config.latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.config.latencyMs));
    }
    const channelObj = this.findChannel(channel);
    if (!channelObj) {
      throw new Error(`channel_not_found: ${channel}`);
    }
    const messages = this.messages.get(channelObj.id) ?? [];
    const message = messages.find((m) => m.ts === timestamp);
    if (!message) {
      throw new Error(`message_not_found: ${timestamp}`);
    }
    if (!message.reactions) message.reactions = [];
    const existing = message.reactions.find((r) => r.name === emoji);
    if (existing) {
      existing.users.push('U_BOT');
      existing.count++;
    } else {
      message.reactions.push({ name: emoji, users: ['U_BOT'], count: 1 });
    }
    return { ok: true };
  }
  /**
   * Search messages.
   */
/**
   * Search messages across all channels.
   * @param query - Search query string
   * @returns Matching messages
   */
/**
   * Search messages across all channels.
   * @param query - Search query string
   * @returns Matching messages
   */
  async searchMessages(query: string): Promise<{ ok: boolean; messages: { matches: SlackMessage[] } }> {
    if (this.config.latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.config.latencyMs));
    }
    const allMessages: SlackMessage[] = [];
    for (const msgs of this.messages.values()) {
      allMessages.push(...msgs);
    }
    const matches = allMessages.filter((m) =>
      m.text.toLowerCase().includes(query.toLowerCase())
    );
    return { ok: true, messages: { matches } };
  }
  /**
   * Gets the tools.
   */
/**
   * Return the list of MCP tool definitions.
   * @returns Array of tool descriptors
   */
/**
   * Return the list of MCP tool definitions.
   * @returns Array of tool descriptors
   */
/**
   * Return the list of MCP tool definitions.
   * @returns Array of tool descriptors
   */
  getTools() {
    return [
      {
        name: 'slack_post_message',
        description: 'Post a message to a Slack channel',
        inputSchema: {
          type: 'object',
          properties: {
            channel: { type: 'string', description: 'Channel name or ID' },
            text: { type: 'string', description: 'Message text' },
            thread_ts: { type: 'string', description: 'Thread timestamp to reply to' },
            attachments: { type: 'array', description: 'Message attachments' },
          },
          required: ['channel', 'text'],
        },
      },
      {
        name: 'slack_get_messages',
        description: 'Get messages from a Slack channel',
        inputSchema: {
          type: 'object',
          properties: {
            channel: { type: 'string', description: 'Channel name or ID' },
            since: { type: 'string', description: 'Oldest message timestamp' },
            limit: { type: 'number', description: 'Max messages to return' },
          },
          required: ['channel'],
        },
      },
      {
        name: 'slack_get_channels',
        description: 'List all Slack channels',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'slack_get_users',
        description: 'List all Slack users',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'slack_search',
        description: 'Search messages across all channels',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query' },
          },
          required: ['query'],
        },
      },
      {
        name: 'slack_add_reaction',
        description: 'Add a reaction emoji to a message',
        inputSchema: {
          type: 'object',
          properties: {
            channel: { type: 'string' },
            timestamp: { type: 'string' },
            emoji: { type: 'string' },
          },
          required: ['channel', 'timestamp', 'emoji'],
        },
      },
    ];
  }
  /**
   * Call tool.
   */
/**
   * Route a tool call to the appropriate handler.
   * @param name - Tool name
   * @param args - Tool arguments
   * @returns Tool result
   */
/**
   * Route a tool call to the appropriate handler.
   * @param name - Tool name
   * @param args - Tool arguments
   * @returns Tool result
   */
  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    switch (name) {
      case 'slack_post_message':
        return this.postMessage(
          args.channel as string,
          args.text as string,
          { thread_ts: args.thread_ts as string | undefined, attachments: args.attachments as SlackAttachment[] | undefined }
        );
      case 'slack_get_messages':
        return this.getMessages(args.channel as string, {
          since: args.since as string | undefined,
          limit: args.limit as number | undefined,
        });
      case 'slack_get_channels':
        return this.getChannels();
      case 'slack_get_users':
        return this.getUsers();
      case 'slack_search':
        return this.searchMessages(args.query as string);
      case 'slack_add_reaction':
        return this.addReaction(args.channel as string, args.timestamp as string, args.emoji as string);
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }
  private findChannel(nameOrId: string): SlackChannel | undefined {
    const byId = this.channels.get(nameOrId);
    if (byId) return byId;
    for (const ch of this.channels.values()) {
      if (ch.name === nameOrId || `#${ch.name}` === nameOrId) return ch;
    }
    return undefined;
  }
  private generateTs(): string {
    this.tsCounter += this.rng.int(1, 60);
    return `${this.tsCounter}.${String(this.rng.int(100000, 999999))}`;
  }
  private initializeData(): void {
    const userData: Omit<SlackUser, 'is_online'>[] = [
      { id: 'U001', name: 'alex.r', real_name: 'Alex Rivera', display_name: 'Alex', email: 'alex@pentest.co', is_bot: false, status_text: 'Hacking the planet', status_emoji: ':computer:', timezone: 'America/New_York' },
      { id: 'U002', name: 'sam.c', real_name: 'Sam Chen', display_name: 'Sam', email: 'sam@pentest.co', is_bot: false, status_text: 'In a meeting', status_emoji: ':calendar:', timezone: 'America/Los_Angeles' },
      { id: 'U003', name: 'jordan.t', real_name: 'Jordan Taylor', display_name: 'Jordan', email: 'jordan@pentest.co', is_bot: false, timezone: 'Europe/London' },
      { id: 'U004', name: 'morgan.l', real_name: 'Morgan Lee', display_name: 'Morgan (Client)', email: 'morgan@client.com', is_bot: false, timezone: 'America/Chicago' },
      { id: 'U_BOT', name: this.config.botName, real_name: 'Armament Bot', display_name: 'Armament', email: 'bot@armament.dev', is_bot: true, timezone: 'UTC' },
    ];
    for (const u of userData) {
      this.users.set(u.id, { ...u, is_online: this.rng.next() > 0.3 });
    }
    const channelData: Omit<SlackChannel, 'created' | 'is_archived'>[] = [
      { id: 'C001', name: 'general', is_private: false, topic: 'Company-wide announcements', purpose: 'General discussion', members: ['U001', 'U002', 'U003', 'U004', 'U_BOT'], creator: 'U001' },
      { id: 'C002', name: 'sec-ops', is_private: true, topic: 'Security operations and findings', purpose: 'Internal security team coordination', members: ['U001', 'U002', 'U003', 'U_BOT'], creator: 'U001' },
      { id: 'C003', name: 'pentest-target-alpha', is_private: true, topic: 'Engagement: Target Alpha assessment', purpose: 'Active pentest coordination for Target Alpha', members: ['U001', 'U002', 'U003', 'U_BOT'], creator: 'U001' },
      { id: 'C004', name: 'client-comms', is_private: true, topic: 'Client communication channel', purpose: 'External client coordination', members: ['U001', 'U004', 'U_BOT'], creator: 'U001' },
      { id: 'C005', name: 'tooling', is_private: false, topic: 'Tools, scripts, and automation', purpose: 'Share useful tools and techniques', members: ['U001', 'U002', 'U003', 'U_BOT'], creator: 'U002' },
      { id: 'C006', name: 'alerts', is_private: false, topic: 'Automated alerts and notifications', purpose: 'Bot notifications from scanners and monitors', members: ['U001', 'U002', 'U003', 'U_BOT'], creator: 'U_BOT' },
    ];
    for (const ch of channelData) {
      this.channels.set(ch.id, {
        ...ch,
        created: Math.floor(Date.now() / 1000) - this.rng.int(86400 * 30, 86400 * 365),
        is_archived: false,
      });
      this.messages.set(ch.id, []);
    }
    this.seedMessages();
  }
  private seedMessages(): void {
    this.addSeedMessage('C002', 'U001', 'Finished initial recon on target.example.com. Found 15 open ports. Sharing nmap results in thread.');
    this.addSeedMessage('C002', 'U002', 'Nuclei scan complete. 3 critical findings, 5 high. Summary:\n- SQL injection in /api/users\n- Exposed .env file\n- CORS misconfiguration\n- JWT hardcoded secret\n- Default admin credentials');
    this.addSeedMessage('C002', 'U003', 'Gobuster found some interesting paths: /admin, /api-docs, /actuator/env. Should we dig deeper into the Spring Boot actuator?');
    this.addSeedMessage('C002', 'U001', 'Yes, definitely check the actuator endpoints. Also, I got a shell via the SQL injection. Going to try privilege escalation next.');
    this.addSeedMessage('C003', 'U001', ':rotating_light: *CRITICAL*: Got database access via SQLi. Full dump of users table available. Includes password hashes and API keys.');
    this.addSeedMessage('C003', 'U002', 'Nice find. What DBMS? We should check if we can escalate from there.');
    this.addSeedMessage('C003', 'U001', 'MySQL 8.0. The app user has SELECT on all databases. Found `api_keys` table with production keys.');
    this.addSeedMessage('C003', 'U003', 'I confirmed the .env exposure. It has the JWT secret: `my-jwt-secret-key-change-in-production`. We can forge any token.');
    this.addSeedMessage('C003', 'U001', 'Great. Let\'s document everything and update the Jira board. @Sam can you draft the timeline for the report?');
    this.addSeedMessage('C003', 'U002', 'On it. Will have the timeline ready by EOD.');
    this.addSeedMessage('C004', 'U001', 'Hi Morgan, just a quick update - we\'ve completed the initial assessment phase. Found several high-priority issues that we\'ll discuss in our Thursday call.');
    this.addSeedMessage('C004', 'U004', 'Thanks Alex. Is there anything critical we should address immediately?');
    this.addSeedMessage('C004', 'U001', 'Yes - there\'s an exposed configuration file on your production server that contains database credentials. I\'d recommend removing or restricting access to /.env immediately. I\'ll send details via encrypted email.');
    this.addSeedMessage('C004', 'U004', 'Got it, escalating this to our devops team right now. Thanks for the heads up.');
    this.addSeedMessage('C006', 'U_BOT', ':warning: *Scan Complete*: Nuclei scan of target.example.com finished.\nResults: 3 critical | 5 high | 8 medium | 12 low | 15 info');
    this.addSeedMessage('C006', 'U_BOT', ':white_check_mark: *Port Scan*: nmap scan of 10.10.10.0/24 complete. 23 hosts up, 156 open ports identified.');
    this.addSeedMessage('C006', 'U_BOT', ':rotating_light: *Alert*: New critical finding detected - CVE-2024-3094 (XZ Utils Backdoor) potentially affecting target SSH service.');
    this.addSeedMessage('C005', 'U003', 'FYI - updated our sqlmap wrapper to auto-dump when injectable params found. PR is up.');
    this.addSeedMessage('C005', 'U002', 'Nice. Also check out this nuclei template I wrote for detecting hardcoded JWT secrets: https://github.com/our-org/nuclei-templates/jwt-hardcoded.yaml');
    this.addSeedMessage('C005', 'U001', 'Reminder: make sure to use `--random-agent` flag with sqlmap. Some WAFs are blocking our default UA string.');
  }
  private addSeedMessage(channelId: string, userId: string, text: string): void {
    const ts = this.generateTs();
    const messages = this.messages.get(channelId) ?? [];
    messages.push({
      ts,
      user: userId,
      text,
      channel: channelId,
    });
    this.messages.set(channelId, messages);
  }
}
/**
 * Create a new SlackMock server instance.
 * @param config - Optional configuration
 * @returns A new SlackMock instance
 */
/**
 * Create a new SlackMock server instance.
 * @param config - Optional configuration
 * @returns A new SlackMock instance
 */
export function createMockServer(config?: SlackMockConfig): SlackMock {
  return new SlackMock(config);
}
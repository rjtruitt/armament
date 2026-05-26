/** Simulates Jira API with CRUD, transitions, JQL, and sprint management. */
export type {
  IssueType,
  Priority,
  IssueStatus,
  JiraUser,
  JiraComment,
  JiraTransition,
  JiraIssue,
  JiraSprint,
  JiraSearchResult,
  CreateIssueInput,
  JiraMockConfig,
} from './jira-types.js';
import type {
  IssueStatus,
  Priority,
  JiraUser,
  JiraComment,
  JiraTransition,
  JiraIssue,
  JiraSprint,
  JiraSearchResult,
  CreateIssueInput,
  JiraMockConfig,
} from './jira-types.js';
import { TRANSITIONS } from './jira-types.js';
import { SEED_USERS, SEED_SPRINTS, SEED_ISSUES, COMMENT_TEMPLATES } from './jira-seed-data.js';
import { applyJql } from './jira-jql.js';
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
 * Mock server that simulates Jira API with CRUD, transitions, JQL search, and sprint management.
 * Provides tools: jira_get_issue, jira_create_issue, jira_update_issue, jira_transition_issue,
 *   jira_get_transitions, jira_add_comment, jira_search, jira_get_sprints.
 */
/**
 * Mock server that simulates Jira API with CRUD, transitions, JQL search, and sprint management.
 * Provides tools: jira_get_issue, jira_create_issue, jira_update_issue, jira_transition_issue,
 *   jira_get_transitions, jira_add_comment, jira_search, jira_get_sprints.
 */
export class JiraMock {
  private config: Required<JiraMockConfig>;
  private rng: SeededRandom;
  private issues: Map<string, JiraIssue> = new Map();
  private sprints: Map<number, JiraSprint> = new Map();
  private users: Map<string, JiraUser> = new Map();
  private nextIssueNum = 1;
  private nextCommentId = 1000;
  constructor(config?: JiraMockConfig) {
    this.config = {
      seed: config?.seed ?? 42,
      latencyMs: config?.latencyMs ?? 0,
      projectKey: config?.projectKey ?? 'SEC',
      projectName: config?.projectName ?? 'Security Assessment',
    };
    this.rng = new SeededRandom(this.config.seed);
    this.initializeData();
  }
  /**
   * Gets the issue.
   */
/**
   * Get a Jira issue by its key.
   * @param key - Issue key (e.g. "SEC-1")
   * @returns The issue data
   */
/**
   * Get a Jira issue by its key.
   * @param key - Issue key (e.g. "SEC-1")
   * @returns The issue data
   */
  async getIssue(key: string): Promise<JiraIssue> {
    if (this.config.latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.config.latencyMs));
    }
    const issue = this.issues.get(key);
    if (!issue) {
      throw new Error(`Issue not found: ${key}`);
    }
    return { ...issue };
  }
  /**
   * Create issue.
   */
/**
   * Create a new Jira issue.
   * @param input - Issue creation parameters
   * @returns The newly created issue
   */
/**
   * Create a new Jira issue.
   * @param input - Issue creation parameters
   * @returns The newly created issue
   */
  async createIssue(input: CreateIssueInput): Promise<JiraIssue> {
    if (this.config.latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.config.latencyMs));
    }
    const key = `${this.config.projectKey}-${this.nextIssueNum++}`;
    const now = new Date().toISOString();
    const reporter = Array.from(this.users.values())[0];
    const issue: JiraIssue = {
      key,
      id: String(10000 + this.nextIssueNum),
      fields: {
        summary: input.summary,
        description: input.description ?? '',
        issuetype: { name: input.issuetype },
        priority: { name: input.priority ?? 'Medium' },
        status: { name: 'To Do' },
        assignee: input.assignee ? (this.users.get(input.assignee) ?? null) : null,
        reporter,
        labels: input.labels ?? [],
        created: now,
        updated: now,
        story_points: input.story_points,
        comments: [],
        parent: input.parent ? { key: input.parent } : undefined,
      },
    };
    if (input.sprint) {
      const sprint = this.sprints.get(input.sprint);
      if (sprint) {
        issue.fields.sprint = sprint;
      }
    }
    this.issues.set(key, issue);
    return { ...issue };
  }
  /**
   * Update issue.
   */
/**
   * Update fields on an existing Jira issue.
   * @param key - Issue key
   * @param fields - Fields to update
   * @returns The updated issue
   */
/**
   * Update fields on an existing Jira issue.
   * @param key - Issue key
   * @param fields - Fields to update
   * @returns The updated issue
   */
  async updateIssue(key: string, fields: Partial<{
    summary: string;
    description: string;
    priority: Priority;
    assignee: string | null;
    labels: string[];
    story_points: number;
    duedate: string;
  }>): Promise<JiraIssue> {
    if (this.config.latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.config.latencyMs));
    }
    const issue = this.issues.get(key);
    if (!issue) {
      throw new Error(`Issue not found: ${key}`);
    }
    if (fields.summary !== undefined) issue.fields.summary = fields.summary;
    if (fields.description !== undefined) issue.fields.description = fields.description;
    if (fields.priority !== undefined) issue.fields.priority = { name: fields.priority };
    if (fields.labels !== undefined) issue.fields.labels = fields.labels;
    if (fields.story_points !== undefined) issue.fields.story_points = fields.story_points;
    if (fields.duedate !== undefined) issue.fields.duedate = fields.duedate;
    if (fields.assignee !== undefined) {
      issue.fields.assignee = fields.assignee ? (this.users.get(fields.assignee) ?? null) : null;
    }
    issue.fields.updated = new Date().toISOString();
    return { ...issue };
  }
  /**
   * Transition issue.
   */
/**
   * Transition a Jira issue to a new status.
   * @param key - Issue key
   * @param transitionId - Transition ID
   * @returns The updated issue
   */
/**
   * Transition a Jira issue to a new status.
   * @param key - Issue key
   * @param transitionId - Transition ID
   * @returns The updated issue
   */
  async transitionIssue(key: string, transitionId: string): Promise<JiraIssue> {
    if (this.config.latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.config.latencyMs));
    }
    const issue = this.issues.get(key);
    if (!issue) {
      throw new Error(`Issue not found: ${key}`);
    }
    const currentStatus = issue.fields.status.name;
    const availableTransitions = TRANSITIONS[currentStatus] ?? [];
    const transition = availableTransitions.find((t) => t.id === transitionId);
    if (!transition) {
      throw new Error(`Invalid transition ${transitionId} from status "${currentStatus}". Available: ${availableTransitions.map((t) => `${t.id}(${t.name})`).join(', ')}`);
    }
    issue.fields.status = { name: transition.to };
    issue.fields.updated = new Date().toISOString();
    return { ...issue };
  }
  /**
   * Gets the transitions.
   */
/**
   * Get available transitions for a Jira issue.
   * @param key - Issue key
   * @returns Array of valid transitions
   */
/**
   * Get available transitions for a Jira issue.
   * @param key - Issue key
   * @returns Array of valid transitions
   */
  async getTransitions(key: string): Promise<JiraTransition[]> {
    if (this.config.latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.config.latencyMs));
    }
    const issue = this.issues.get(key);
    if (!issue) {
      throw new Error(`Issue not found: ${key}`);
    }
    return TRANSITIONS[issue.fields.status.name] ?? [];
  }
  /**
   * Add comment.
   */
/**
   * Add a comment to a Jira issue.
   * @param key - Issue key
   * @param body - Comment body text
   * @returns The created comment
   */
/**
   * Add a comment to a Jira issue.
   * @param key - Issue key
   * @param body - Comment body text
   * @returns The created comment
   */
  async addComment(key: string, body: string): Promise<JiraComment> {
    if (this.config.latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.config.latencyMs));
    }
    const issue = this.issues.get(key);
    if (!issue) {
      throw new Error(`Issue not found: ${key}`);
    }
    const author = Array.from(this.users.values())[0];
    const now = new Date().toISOString();
    const comment: JiraComment = {
      id: String(this.nextCommentId++),
      author,
      body,
      created: now,
      updated: now,
    };
    issue.fields.comments.push(comment);
    issue.fields.updated = now;
    return comment;
  }
  /**
   * Search.
   */
/**
   * Search for Jira issues using JQL.
   * @param jql - JQL query string
   * @param maxResults - Maximum results to return
   * @param startAt - Offset for pagination
   * @returns Search result with matching issues
   */
/**
   * Search for Jira issues using JQL.
   * @param jql - JQL query string
   * @param maxResults - Maximum results to return
   * @param startAt - Offset for pagination
   * @returns Search result with matching issues
   */
  async search(jql: string, maxResults?: number, startAt?: number): Promise<JiraSearchResult> {
    if (this.config.latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.config.latencyMs));
    }
    const all = Array.from(this.issues.values());
    let filtered = applyJql(all, jql);
    const total = filtered.length;
    const start = startAt ?? 0;
    const max = maxResults ?? 50;
    filtered = filtered.slice(start, start + max);
    return {
      issues: filtered.map((i) => ({ ...i })),
      total,
      maxResults: max,
      startAt: start,
    };
  }
  /**
   * Gets the sprints.
   */
/**
   * Get all sprints for the project.
   * @returns Array of sprints
   */
/**
   * Get all sprints for the project.
   * @returns Array of sprints
   */
  async getSprints(): Promise<JiraSprint[]> {
    if (this.config.latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.config.latencyMs));
    }
    return Array.from(this.sprints.values());
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
      { name: 'jira_get_issue', description: 'Get a Jira issue by key', inputSchema: { type: 'object', properties: { key: { type: 'string', description: 'Issue key (e.g., SEC-1)' } }, required: ['key'] } },
      { name: 'jira_create_issue', description: 'Create a new Jira issue', inputSchema: { type: 'object', properties: { summary: { type: 'string' }, description: { type: 'string' }, issuetype: { type: 'string', enum: ['Bug', 'Story', 'Task', 'Epic', 'Sub-task'] }, priority: { type: 'string', enum: ['Highest', 'High', 'Medium', 'Low', 'Lowest'] }, assignee: { type: 'string', description: 'User account ID' }, labels: { type: 'array', items: { type: 'string' } }, sprint: { type: 'number' }, story_points: { type: 'number' }, parent: { type: 'string', description: 'Parent issue key (for sub-tasks)' } }, required: ['summary', 'issuetype'] } },
      { name: 'jira_update_issue', description: 'Update fields on a Jira issue', inputSchema: { type: 'object', properties: { key: { type: 'string' }, fields: { type: 'object', description: 'Fields to update' } }, required: ['key', 'fields'] } },
      { name: 'jira_transition_issue', description: 'Transition a Jira issue to a new status', inputSchema: { type: 'object', properties: { key: { type: 'string' }, transitionId: { type: 'string' } }, required: ['key', 'transitionId'] } },
      { name: 'jira_get_transitions', description: 'Get available transitions for a Jira issue', inputSchema: { type: 'object', properties: { key: { type: 'string' } }, required: ['key'] } },
      { name: 'jira_add_comment', description: 'Add a comment to a Jira issue', inputSchema: { type: 'object', properties: { key: { type: 'string' }, body: { type: 'string' } }, required: ['key', 'body'] } },
      { name: 'jira_search', description: 'Search for Jira issues using JQL', inputSchema: { type: 'object', properties: { jql: { type: 'string', description: 'JQL query string' }, maxResults: { type: 'number' }, startAt: { type: 'number' } }, required: ['jql'] } },
      { name: 'jira_get_sprints', description: 'Get all sprints for the project', inputSchema: { type: 'object', properties: {} } },
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
      case 'jira_get_issue':
        return this.getIssue(args.key as string);
      case 'jira_create_issue':
        return this.createIssue(args as unknown as CreateIssueInput);
      case 'jira_update_issue':
        return this.updateIssue(args.key as string, args.fields as Record<string, unknown>);
      case 'jira_transition_issue':
        return this.transitionIssue(args.key as string, args.transitionId as string);
      case 'jira_get_transitions':
        return this.getTransitions(args.key as string);
      case 'jira_add_comment':
        return this.addComment(args.key as string, args.body as string);
      case 'jira_search':
        return this.search(args.jql as string, args.maxResults as number | undefined, args.startAt as number | undefined);
      case 'jira_get_sprints':
        return this.getSprints();
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }
  private initializeData(): void {
    for (const u of SEED_USERS) {
      this.users.set(u.accountId, u);
    }
    for (const s of SEED_SPRINTS) {
      this.sprints.set(s.id, s);
    }
    for (const data of SEED_ISSUES) {
      const key = `${this.config.projectKey}-${this.nextIssueNum++}`;
      const daysAgo = this.rng.int(1, 20);
      const created = new Date(Date.now() - daysAgo * 86400000).toISOString();
      const issue: JiraIssue = {
        key,
        id: String(10000 + this.nextIssueNum),
        fields: {
          summary: data.summary,
          description: data.description,
          issuetype: { name: data.type },
          priority: { name: data.priority },
          status: { name: data.status },
          assignee: this.users.get(data.assignee) ?? null,
          reporter: this.rng.pick(Array.from(this.users.values())),
          labels: data.labels,
          created,
          updated: new Date(Date.now() - this.rng.int(0, daysAgo) * 86400000).toISOString(),
          sprint: this.sprints.get(data.sprint),
          story_points: data.points,
          comments: [],
        },
      };
      if (this.rng.next() > 0.5) {
        issue.fields.comments.push({
          id: String(this.nextCommentId++),
          author: this.rng.pick(Array.from(this.users.values())),
          body: this.rng.pick(COMMENT_TEMPLATES),
          created: new Date(Date.now() - this.rng.int(0, 5) * 86400000).toISOString(),
          updated: new Date(Date.now() - this.rng.int(0, 5) * 86400000).toISOString(),
        });
      }
      this.issues.set(key, issue);
    }
  }
}
/**
 * Create a new JiraMock server instance.
 * @param config - Optional configuration
 * @returns A new JiraMock instance
 */
/**
 * Create a new JiraMock server instance.
 * @param config - Optional configuration
 * @returns A new JiraMock instance
 */
export function createMockServer(config?: JiraMockConfig): JiraMock {
  return new JiraMock(config);
}
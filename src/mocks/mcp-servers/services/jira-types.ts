/** Type of Jira issue. */
export type IssueType = 'Bug' | 'Story' | 'Task' | 'Epic' | 'Sub-task';
/** Priority level for a Jira issue. */
/** Priority level for a Jira issue. */
export type Priority = 'Highest' | 'High' | 'Medium' | 'Low' | 'Lowest';
/** Status of a Jira issue in its workflow. */
/** Status of a Jira issue in its workflow. */
export type IssueStatus = 'To Do' | 'In Progress' | 'In Review' | 'Done' | 'Blocked';
/** A Jira user with account and profile info. */
/** A Jira user with account and profile info. */
export interface JiraUser {
  accountId: string;
  displayName: string;
  emailAddress: string;
  avatarUrl?: string;
}
/** A comment on a Jira issue. */
/** A comment on a Jira issue. */
export interface JiraComment {
  id: string;
  author: JiraUser;
  body: string;
  created: string;
  updated: string;
}
/** A valid transition between issue statuses. */
/** A valid transition between issue statuses. */
export interface JiraTransition {
  id: string;
  name: string;
  to: IssueStatus;
}
/** Interface for JiraIssue.
 * @property ... and 5 more properties.
 */
/** A Jira issue with all its fields. */
/** A Jira issue with all its fields. */
export interface JiraIssue {
  key: string;
  id: string;
  fields: {
    summary: string;
    description: string;
    issuetype: { name: IssueType };
    priority: { name: Priority };
    status: { name: IssueStatus };
    assignee: JiraUser | null;
    reporter: JiraUser;
    labels: string[];
    created: string;
    updated: string;
    duedate?: string;
    sprint?: JiraSprint;
    story_points?: number;
    comments: JiraComment[];
    parent?: { key: string };
    subtasks?: { key: string; summary: string; status: IssueStatus }[];
  };
}
/** A Jira sprint with dates and goal. */
/** A Jira sprint with dates and goal. */
export interface JiraSprint {
  id: number;
  name: string;
  state: 'active' | 'closed' | 'future';
  startDate?: string;
  endDate?: string;
  goal?: string;
}
/** Result of a Jira issue search query. */
/** Result of a Jira issue search query. */
export interface JiraSearchResult {
  issues: JiraIssue[];
  total: number;
  maxResults: number;
  startAt: number;
}
/** Interface for CreateIssueInput.
 * @property ... and 1 more properties.
 */
/** Input parameters for creating a new Jira issue. */
/** Input parameters for creating a new Jira issue. */
export interface CreateIssueInput {
  summary: string;
  description?: string;
  issuetype: IssueType;
  priority?: Priority;
  assignee?: string;
  labels?: string[];
  sprint?: number;
  story_points?: number;
  parent?: string;
}
/** Configuration for the JiraMock server. */
/** Configuration for the JiraMock server. */
export interface JiraMockConfig {
  seed?: number;
  latencyMs?: number;
  projectKey?: string;
  projectName?: string;
}
/** Transitions.
 */
/** Valid issue status transitions for the Jira mock workflow. */
/** Valid issue status transitions for the Jira mock workflow. */
export const TRANSITIONS: Record<IssueStatus, JiraTransition[]> = {
  'To Do': [
    { id: '21', name: 'Start Progress', to: 'In Progress' },
    { id: '31', name: 'Block', to: 'Blocked' },
  ],
  'In Progress': [
    { id: '22', name: 'Submit for Review', to: 'In Review' },
    { id: '31', name: 'Block', to: 'Blocked' },
    { id: '11', name: 'Back to To Do', to: 'To Do' },
  ],
  'In Review': [
    { id: '23', name: 'Approve', to: 'Done' },
    { id: '24', name: 'Request Changes', to: 'In Progress' },
    { id: '31', name: 'Block', to: 'Blocked' },
  ],
  'Done': [
    { id: '25', name: 'Reopen', to: 'To Do' },
  ],
  'Blocked': [
    { id: '32', name: 'Unblock', to: 'In Progress' },
    { id: '11', name: 'Back to To Do', to: 'To Do' },
  ],
};
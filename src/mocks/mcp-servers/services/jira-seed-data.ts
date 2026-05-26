/** Seed data for the Jira mock: users, sprints, and issues. */
import type {
  IssueType,
  Priority,
  IssueStatus,
  JiraUser,
  JiraSprint,
} from './jira-types.js';
/** Seed users.
 */
/** Pre-seeded Jira users for the mock. */
/** Pre-seeded Jira users for the mock. */
export const SEED_USERS: JiraUser[] = [
  { accountId: 'user-001', displayName: 'Alex Rivera', emailAddress: 'alex@pentest.co' },
  { accountId: 'user-002', displayName: 'Sam Chen', emailAddress: 'sam@pentest.co' },
  { accountId: 'user-003', displayName: 'Jordan Taylor', emailAddress: 'jordan@pentest.co' },
  { accountId: 'user-004', displayName: 'Morgan Lee', emailAddress: 'morgan@client.com' },
];
/** Seed sprints.
 */
/** Pre-seeded Jira sprints for the mock. */
/** Pre-seeded Jira sprints for the mock. */
export const SEED_SPRINTS: JiraSprint[] = [
  {
    id: 1,
    name: 'Sprint 23 - Initial Assessment',
    state: 'closed',
    startDate: '2026-04-28T00:00:00Z',
    endDate: '2026-05-11T00:00:00Z',
    goal: 'Complete initial recon and vulnerability assessment',
  },
  {
    id: 2,
    name: 'Sprint 24 - Exploitation & Reporting',
    state: 'active',
    startDate: '2026-05-12T00:00:00Z',
    endDate: '2026-05-25T00:00:00Z',
    goal: 'Exploit identified vulnerabilities and draft report',
  },
  {
    id: 3,
    name: 'Sprint 25 - Remediation Verification',
    state: 'future',
    startDate: '2026-05-26T00:00:00Z',
    endDate: '2026-06-08T00:00:00Z',
  },
];
/** Interface for SeedIssue.
 * @property ... and 1 more properties.
 */
/** A seed issue definition for populating the Jira mock. */
/** A seed issue definition for populating the Jira mock. */
export interface SeedIssue {
  summary: string;
  description: string;
  type: IssueType;
  priority: Priority;
  status: IssueStatus;
  assignee: string;
  labels: string[];
  sprint: number;
  points?: number;
}
/** Seed issues.
 */
/** Pre-seeded Jira issues for the mock. */
/** Pre-seeded Jira issues for the mock. */
export const SEED_ISSUES: SeedIssue[] = [
  {
    summary: 'SQL Injection in user lookup endpoint',
    description: 'The /api/users endpoint is vulnerable to SQL injection via the username parameter. Parameterized queries are not used.',
    type: 'Bug', priority: 'Highest', status: 'In Progress', assignee: 'user-001',
    labels: ['vulnerability', 'critical', 'sqli'], sprint: 2, points: 5,
  },
  {
    summary: 'Exposed .env file on production server',
    description: 'The .env file containing database credentials and JWT secret is publicly accessible at https://target.example.com/.env',
    type: 'Bug', priority: 'Highest', status: 'Done', assignee: 'user-002',
    labels: ['vulnerability', 'critical', 'config'], sprint: 1, points: 3,
  },
  {
    summary: 'CORS misconfiguration allows credential theft',
    description: 'The API reflects arbitrary Origins in ACAO header with credentials: true, enabling cross-origin credential theft.',
    type: 'Bug', priority: 'High', status: 'In Review', assignee: 'user-001',
    labels: ['vulnerability', 'high', 'cors'], sprint: 2, points: 3,
  },
  {
    summary: 'Missing rate limiting on login endpoint',
    description: 'No rate limiting on /auth/login allows brute force attacks.',
    type: 'Bug', priority: 'High', status: 'To Do', assignee: 'user-003',
    labels: ['vulnerability', 'high', 'auth'], sprint: 2, points: 2,
  },
  {
    summary: 'Conduct port scan of target network',
    description: 'Run comprehensive nmap scan of 10.10.10.0/24 to identify all services.',
    type: 'Task', priority: 'Medium', status: 'Done', assignee: 'user-001',
    labels: ['recon', 'network'], sprint: 1, points: 2,
  },
  {
    summary: 'Web application vulnerability assessment',
    description: 'Run automated scanners (Nuclei, Burp) against https://target.example.com',
    type: 'Task', priority: 'Medium', status: 'Done', assignee: 'user-002',
    labels: ['recon', 'webapp'], sprint: 1, points: 5,
  },
  {
    summary: 'IDOR vulnerability in /api/users/:id',
    description: 'Any authenticated user can access other users\' data by changing the ID parameter. No authorization checks beyond authentication.',
    type: 'Bug', priority: 'Medium', status: 'To Do', assignee: 'user-002',
    labels: ['vulnerability', 'medium', 'idor'], sprint: 2, points: 3,
  },
  {
    summary: 'JWT secret is hardcoded default value',
    description: 'The JWT_SECRET in production falls back to "default-secret-change-me" from source code, allowing token forgery.',
    type: 'Bug', priority: 'Highest', status: 'In Progress', assignee: 'user-003',
    labels: ['vulnerability', 'critical', 'auth'], sprint: 2, points: 2,
  },
  {
    summary: 'Draft penetration test report',
    description: 'Compile findings into formal penetration test report for client delivery.',
    type: 'Story', priority: 'High', status: 'To Do', assignee: 'user-001',
    labels: ['report', 'deliverable'], sprint: 2, points: 8,
  },
  {
    summary: 'Subdomain enumeration of target.example.com',
    description: 'Use DNS brute forcing to discover all subdomains of the target domain.',
    type: 'Task', priority: 'Low', status: 'Done', assignee: 'user-003',
    labels: ['recon', 'dns'], sprint: 1, points: 1,
  },
];
/** Comment templates.
 */
/** Pre-defined comment templates for seeding issue comments. */
/** Pre-defined comment templates for seeding issue comments. */
export const COMMENT_TEMPLATES = [
  'Confirmed this vulnerability. Impact is severe.',
  'Attached PoC script. See exploit.py in shared drive.',
  'Client has been notified. Awaiting their patch timeline.',
  'Reproduced successfully. Adding to report.',
  'Fixed in latest deploy. Needs verification.',
];
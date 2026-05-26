/** JQL query parser for the Jira mock. */
import type { JiraIssue } from './jira-types.js';
/** Apply jql.
 */
/**
 * Apply a JQL query string to filter and sort an array of Jira issues.
 * Supports project, status, assignee, issuetype, priority, labels, text, and ORDER BY.
 * @param issues - Array of Jira issues to filter
 * @param jql - JQL query string
 * @returns Filtered/sorted array of matching issues
 */
/**
 * Apply a JQL query string to filter and sort an array of Jira issues.
 * Supports project, status, assignee, issuetype, priority, labels, text, and ORDER BY.
 * @param issues - Array of Jira issues to filter
 * @param jql - JQL query string
 * @returns Filtered/sorted array of matching issues
 */
export function applyJql(issues: JiraIssue[], jql: string): JiraIssue[] {
  const lower = jql.toLowerCase();
  let result = issues;
  const projectMatch = lower.match(/project\s*=\s*["']?(\w+)["']?/);
  if (projectMatch) {
    const proj = projectMatch[1].toUpperCase();
    result = result.filter((i) => i.key.startsWith(`${proj}-`));
  }
  const statusMatch = lower.match(/status\s*=\s*["']([^"']+)["']/);
  if (statusMatch) {
    const status = statusMatch[1];
    result = result.filter((i) => i.fields.status.name.toLowerCase() === status.toLowerCase());
  }
  const statusInMatch = lower.match(/status\s+in\s*\(([^)]+)\)/);
  if (statusInMatch) {
    const statuses = statusInMatch[1].split(',').map((s) => s.trim().replace(/["']/g, '').toLowerCase());
    result = result.filter((i) => statuses.includes(i.fields.status.name.toLowerCase()));
  }
  const assigneeMatch = lower.match(/assignee\s*=\s*["']?([^"'\s]+)["']?/);
  if (assigneeMatch) {
    const assignee = assigneeMatch[1];
    if (assignee === 'currentuser()' || assignee === 'currentuser') {
      result = result.filter((i) => i.fields.assignee !== null);
    } else {
      result = result.filter((i) => i.fields.assignee?.accountId === assignee || i.fields.assignee?.displayName.toLowerCase().includes(assignee));
    }
  }
  const typeMatch = lower.match(/issuetype\s*=\s*["']?(\w+)["']?/);
  if (typeMatch) {
    result = result.filter((i) => i.fields.issuetype.name.toLowerCase() === typeMatch[1].toLowerCase());
  }
  const priorityMatch = lower.match(/priority\s*=\s*["']?(\w+)["']?/);
  if (priorityMatch) {
    result = result.filter((i) => i.fields.priority.name.toLowerCase() === priorityMatch[1].toLowerCase());
  }
  const labelMatch = lower.match(/labels\s*=\s*["']?(\w+)["']?/);
  if (labelMatch) {
    result = result.filter((i) => i.fields.labels.some((l) => l.toLowerCase() === labelMatch[1].toLowerCase()));
  }
  const textMatch = lower.match(/text\s*~\s*["']([^"']+)["']/);
  if (textMatch) {
    const searchTerm = textMatch[1].toLowerCase();
    result = result.filter((i) =>
      i.fields.summary.toLowerCase().includes(searchTerm) ||
      i.fields.description.toLowerCase().includes(searchTerm)
    );
  }
  const orderMatch = lower.match(/order\s+by\s+(\w+)\s*(asc|desc)?/);
  if (orderMatch) {
    const field = orderMatch[1];
    const desc = orderMatch[2] !== 'asc';
    result.sort((a, b) => {
      let valA: string | number = '';
      let valB: string | number = '';
      if (field === 'created') { valA = a.fields.created; valB = b.fields.created; }
      if (field === 'updated') { valA = a.fields.updated; valB = b.fields.updated; }
      if (field === 'priority') { valA = a.fields.priority.name; valB = b.fields.priority.name; }
      if (field === 'key') { valA = a.key; valB = b.key; }
      const cmp = valA < valB ? -1 : valA > valB ? 1 : 0;
      return desc ? -cmp : cmp;
    });
  }
  return result;
}
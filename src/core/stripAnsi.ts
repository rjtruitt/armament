/** Strip all ANSI escape sequences from a string, returning raw visible text. */
export function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

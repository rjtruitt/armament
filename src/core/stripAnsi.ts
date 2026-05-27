/** Strip SGR ANSI color/style codes (`\x1b[0m`, `\x1b[31;1m`, etc.) from a string.
 * Safe for width measurement — leaves cursor movement, OSC, and other non-SGR
 * sequences intact since they don't affect visible character width.
 */
export function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

/**
 * Aggressive ANSI strip — removes ALL terminal escape sequences, not just SGR.
 * Catches CSI (`\x1b[...`), OSC (`\x1b]...`), DCS, SOS, PM, APC, and orphan ESC bytes.
 * Use this on content going to/from the LLM (state file messages, tool results).
 */
export function stripAllAnsi(str: string): string {
  return str
    // OSC strings: ESC ] ... (terminated by ST \x1b\\ or BEL \x07)
    .replace(/\x1b\].*?(?:\x07|\x1b\\)/gs, '')
    // DCS, SOS, PM, APC: ESC P/X/^/_ ... terminated by ST
    .replace(/\x1b[PX^_].*?(?:\x07|\x1b\\)/gs, '')
    // CSI sequences: ESC [ params? intermediate? final_byte
    .replace(/\x1b\[[\x30-\x3F]*[\x20-\x2F]*[\x40-\x7E]/g, '')
    // All other standard escape sequences: ESC intermediate* final_byte
    .replace(/\x1b[\x20-\x2F]*[\x30-\x7E]/g, '')
    // Final catch: any orphan ESC bytes
    .replace(/\x1b/g, '');
}

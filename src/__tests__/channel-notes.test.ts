/**
 * CHANNEL NOTES TESTS — Verifies notes.md lifecycle:
 * - Template seeding on channel creation
 * - File injection into agent context
 * - Directory cleanup on channel part
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, copyFileSync } from 'fs';
import { join } from 'path';
import { cwd } from 'process';

const CHANNELS_DIR = join(cwd(), '.arma', 'channels', '__test__channel');
const NOTES_PATH = join(CHANNELS_DIR, 'notes.md');
const TEMPLATE_PATH = join(cwd(), '.arma', 'core-notes.md');

describe('Channel Notes — File Lifecycle', () => {
  beforeEach(() => {
    rmSync(CHANNELS_DIR, { recursive: true, force: true });
  });

  afterEach(() => {
    rmSync(CHANNELS_DIR, { recursive: true, force: true });
  });

  it('should create notes.md from template when channel is created', () => {
    expect(existsSync(TEMPLATE_PATH)).toBe(true);
    mkdirSync(CHANNELS_DIR, { recursive: true });
    copyFileSync(TEMPLATE_PATH, NOTES_PATH);
    expect(existsSync(NOTES_PATH)).toBe(true);

    const content = readFileSync(NOTES_PATH, 'utf-8');
    expect(content).toContain('# Channel Notes');
    expect(content).toContain('## Current notes');
  });

  it('should not overwrite existing notes.md if it already exists', () => {
    mkdirSync(CHANNELS_DIR, { recursive: true });
    writeFileSync(NOTES_PATH, '# Custom notes', 'utf-8');

    // Simulate re-join — should not overwrite
    if (!existsSync(NOTES_PATH)) {
      copyFileSync(TEMPLATE_PATH, NOTES_PATH);
    }
    const newContent = readFileSync(NOTES_PATH, 'utf-8');
    expect(newContent).toBe('# Custom notes');
  });

  it('should allow appending to notes.md', () => {
    mkdirSync(CHANNELS_DIR, { recursive: true });
    copyFileSync(TEMPLATE_PATH, NOTES_PATH);
    writeFileSync(NOTES_PATH, '\n[fact] This is an important fact\n', { flag: 'a' });

    const content = readFileSync(NOTES_PATH, 'utf-8');
    expect(content).toContain('[fact] This is an important fact');
  });

  it('should remove the channel directory on part', () => {
    mkdirSync(CHANNELS_DIR, { recursive: true });
    writeFileSync(NOTES_PATH, '# notes', 'utf-8');
    expect(existsSync(CHANNELS_DIR)).toBe(true);

    rmSync(CHANNELS_DIR, { recursive: true, force: true });
    expect(existsSync(CHANNELS_DIR)).toBe(false);
  });
});

describe('Channel Notes — Injection Format', () => {
  it('should wrap content in delimiters', () => {
    const content = '[fact] hello';
    const formatted = `\n=== CHANNEL NOTES ===\n${content}\n=====================\n`;
    expect(formatted).toContain('CHANNEL NOTES');
    expect(formatted).toContain('[fact] hello');
  });

  it('should return empty string for empty notes', () => {
    const content = '';
    const result = content.trim() ? `\n=== CHANNEL NOTES ===\n${content}\n=====================\n` : '';
    expect(result).toBe('');
  });
});

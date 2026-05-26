/** A commit message and its affected files. */
export interface CommitSeed {
  msg: string;
  files: string[];
}
/** An author name and email pair. */
/** An author name and email pair. */
export interface AuthorSeed {
  name: string;
  email: string;
}
/** Commit messages.
 */
/** Pre-defined commit messages for seeding Git history. */
/** Pre-defined commit messages for seeding Git history. */
export const COMMIT_MESSAGES: CommitSeed[] = [
  { msg: 'feat: add user authentication endpoints', files: ['src/auth/login.ts', 'src/auth/register.ts', 'src/auth/middleware.ts'] },
  { msg: 'fix: resolve SQL injection in user lookup', files: ['src/services/user.service.ts', 'src/db/queries.ts'] },
  { msg: 'chore: update dependencies', files: ['package.json', 'package-lock.json'] },
  { msg: 'feat: implement rate limiting', files: ['src/middleware/rateLimit.ts', 'src/config/limits.ts'] },
  { msg: 'docs: update API documentation', files: ['docs/api.md', 'docs/auth.md'] },
  { msg: 'fix: patch CORS configuration', files: ['src/config/cors.ts'] },
  { msg: 'feat: add health check endpoint', files: ['src/routes/health.ts'] },
  { msg: 'refactor: extract database connection pool', files: ['src/db/pool.ts', 'src/db/index.ts'] },
  { msg: 'test: add integration tests for auth flow', files: ['tests/auth.test.ts', 'tests/fixtures/users.ts'] },
  { msg: 'feat: implement JWT refresh tokens', files: ['src/auth/refresh.ts', 'src/auth/tokens.ts'] },
  { msg: 'fix: prevent XSS in user profile rendering', files: ['src/views/profile.ts', 'src/utils/sanitize.ts'] },
  { msg: 'chore: configure CI/CD pipeline', files: ['.github/workflows/ci.yml', '.github/workflows/deploy.yml'] },
  { msg: 'feat: add logging middleware', files: ['src/middleware/logger.ts', 'src/config/logging.ts'] },
  { msg: 'fix: handle null pointer in order processing', files: ['src/services/order.service.ts'] },
  { msg: 'initial commit', files: ['package.json', 'tsconfig.json', 'src/index.ts', 'README.md'] },
];
/** Get authors.
 */
/**
 * Generate a list of authors including the current user.
 * @param userName - The operator name
 * @param userEmail - The operator email
 * @returns Array of author seeds
 */
/** Get seeded author identities including the current user. */
/**
 * Generate a list of authors including the current user.
 * @param userName - The operator name
 * @param userEmail - The operator email
 * @returns Array of author seeds
 */
/**
 * Generate a list of authors including the current user.
 * @param userName - The operator name
 * @param userEmail - The operator email
 * @returns Array of author seeds
 */
export function getAuthors(userName: string, userEmail: string): AuthorSeed[] {
  return [
    { name: 'Alice Chen', email: 'alice@example.com' },
    { name: 'Bob Martinez', email: 'bob@example.com' },
    { name: 'Charlie Kim', email: 'charlie@example.com' },
    { name: userName, email: userEmail },
  ];
}
/** A working tree change present at initialization time. */
/** A working tree change present at initialization time. */
export interface InitialWorkingChange {
  file: string;
  status: 'modified' | 'untracked';
}
/** Initial working changes.
 */
/** Initial uncommitted changes simulating a dirty working tree. */
/** Initial uncommitted changes simulating a dirty working tree. */
export const INITIAL_WORKING_CHANGES: InitialWorkingChange[] = [
  { file: 'src/services/user.service.ts', status: 'modified' },
  { file: 'src/config/database.ts', status: 'modified' },
  { file: 'notes/findings.md', status: 'untracked' },
];
/** Code line templates for diff generation. */
/** Code line templates for "old" side of diff (insecure patterns). */
/** Code line templates for "old" side of diff (insecure patterns). */
export const OLD_CODE_LINES = [
  'const result = db.query(sql);',
  'return user.password === input;',
  'res.setHeader("Access-Control-Allow-Origin", "*");',
  'console.log(user.token);',
];
/** New code lines.
 */
/** Code line templates for "new" side of diff (secure patterns). */
/** Code line templates for "new" side of diff (secure patterns). */
export const NEW_CODE_LINES = [
  'const result = await db.query(sql, params);',
  'return await bcrypt.compare(input, user.passwordHash);',
  'res.setHeader("Access-Control-Allow-Origin", allowedOrigin);',
  'logger.debug("Auth token validated");',
];
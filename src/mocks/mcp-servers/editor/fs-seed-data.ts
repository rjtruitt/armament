/** A seed file entry for the virtual filesystem. */
export interface FsSeedFile {
  path: string;
  content: string;
}
/** A seed directory entry for the virtual filesystem. */
/** A seed directory entry for the virtual filesystem. */
export interface FsSeedDir {
  path: string;
}
/** Seed dirs.
 */
/** Pre-populated directories for the virtual filesystem mock. */
/** Pre-populated directories for the virtual filesystem mock. */
export const SEED_DIRS: FsSeedDir[] = [
  { path: '' },
  { path: '/src' },
  { path: '/src/auth' },
  { path: '/src/services' },
  { path: '/src/middleware' },
  { path: '/src/routes' },
  { path: '/src/db' },
  { path: '/src/config' },
  { path: '/src/utils' },
  { path: '/tests' },
  { path: '/docs' },
  { path: '/scripts' },
  { path: '/.github' },
  { path: '/.github/workflows' },
];
/** Seed files.
 */
/** Pre-populated files for the virtual filesystem mock. */
/** Pre-populated files for the virtual filesystem mock. */
export const SEED_FILES: FsSeedFile[] = [
  {
    path: '/package.json',
    content: JSON.stringify({
      name: 'target-webapp',
      version: '1.2.0',
      description: 'Target web application for testing',
      main: 'dist/index.js',
      scripts: {
        start: 'node dist/index.js',
        dev: 'ts-node src/index.ts',
        build: 'tsc',
        test: 'jest',
        lint: 'eslint src/**/*.ts',
      },
      dependencies: {
        express: '^4.18.2',
        'jsonwebtoken': '^9.0.1',
        bcrypt: '^5.1.0',
        mysql2: '^3.6.0',
        cors: '^2.8.5',
        helmet: '^7.0.0',
        'express-rate-limit': '^6.9.0',
        winston: '^3.10.0',
      },
      devDependencies: {
        typescript: '^5.2.2',
        '@types/express': '^4.17.17',
        '@types/node': '^20.5.0',
        jest: '^29.6.4',
        '@types/jest': '^29.5.3',
        'ts-jest': '^29.1.1',
        eslint: '^8.47.0',
      },
    }, null, 2),
  },
  {
    path: '/tsconfig.json',
    content: JSON.stringify({
      compilerOptions: {
        target: 'ES2020',
        module: 'commonjs',
        outDir: './dist',
        rootDir: './src',
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
      },
      include: ['src/**/*'],
      exclude: ['node_modules', 'dist'],
    }, null, 2),
  },
  {
    path: '/src/index.ts',
    content: `import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { authRouter } from './auth/routes';
import { apiRouter } from './routes/api';
import { errorHandler } from './middleware/error';
import { logger } from './config/logging';
import { connectDB } from './db';
const app = express();
const PORT = process.env.PORT || 3000;
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json());
app.use('/auth', authRouter);
app.use('/api', apiRouter);
app.use(errorHandler);
async function start() {
  await connectDB();
  app.listen(PORT, () => {
    logger.info(\`Server running on port \${PORT}\`);
  });
}
start().catch((err) => {
  logger.error('Failed to start server:', err);
  process.exit(1);
});
export default app;
`,
  },
  {
    path: '/src/auth/routes.ts',
    content: `import { Router } from 'express';
import { login, register, refreshToken } from './handlers';
import { validateBody } from '../middleware/validation';
/** Auth router.
 */
export const authRouter = Router();
authRouter.post('/login', validateBody(['username', 'password']), login);
authRouter.post('/register', validateBody(['username', 'email', 'password']), register);
authRouter.post('/refresh', validateBody(['refreshToken']), refreshToken);
`,
  },
  {
    path: '/src/auth/handlers.ts',
    content: `import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { findUserByUsername, createUser } from '../services/user.service';
const JWT_SECRET = process.env.JWT_SECRET || 'default-secret-change-me';
/** Login.
 */
export async function login(req: Request, res: Response) {
  const { username, password } = req.body;
  const user = await findUserByUsername(username);
  if (!user || !await bcrypt.compare(password, user.passwordHash)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: '1h' });
  const refreshToken = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, refreshToken, user: { id: user.id, username: user.username, role: user.role } });
}
/** Register.
 */
export async function register(req: Request, res: Response) {
  const { username, email, password } = req.body;
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await createUser({ username, email, passwordHash });
  res.status(201).json({ id: user.id, username: user.username });
}
/** Refresh token.
 */
export async function refreshToken(req: Request, res: Response) {
  const { refreshToken: token } = req.body;
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: number };
    const newToken = jwt.sign({ userId: payload.userId }, JWT_SECRET, { expiresIn: '1h' });
    res.json({ token: newToken });
  } catch {
    res.status(401).json({ error: 'Invalid refresh token' });
  }
}
`,
  },
  {
    path: '/src/services/user.service.ts',
    content: `import { pool } from '../db';
export interface User {
  id: number;
  username: string;
  email: string;
  passwordHash: string;
  role: string;
  createdAt: Date;
}
/** Find user by username.
 * @returns {Promise<User | null>} - Description of return value.
 */
export async function findUserByUsername(username: string): Promise<User | null> {
  // VULNERABLE: SQL injection possible here
  const [rows] = await pool.query(
    \`SELECT * FROM users WHERE username = '\${username}'\`
  );
  return (rows as User[])[0] ?? null;
}
/** Find user by id.
 * @returns {Promise<User | null>} - Description of return value.
 */
export async function findUserById(id: number): Promise<User | null> {
  const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [id]);
  return (rows as User[])[0] ?? null;
}
export async function createUser(data: { username: string; email: string; passwordHash: string }): Promise<User> {
  const [result] = await pool.query(
    'INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)',
    [data.username, data.email, data.passwordHash, 'user']
  );
  return { id: (result as any).insertId, ...data, role: 'user', createdAt: new Date() } as User;
}
`,
  },
  {
    path: '/src/db/index.ts',
    content: `import mysql from 'mysql2/promise';
/** Pool.
 */
export const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'password',
  database: process.env.DB_NAME || 'webapp_db',
  waitForConnections: true,
  connectionLimit: 10,
});
/** Connect db.
 * @returns {Promise<void>} - Description of return value.
 */
export async function connectDB(): Promise<void> {
  const conn = await pool.getConnection();
  await conn.ping();
  conn.release();
}
`,
  },
  {
    path: '/src/config/cors.ts',
    content: `export const corsConfig = {
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
};
`,
  },
  {
    path: '/src/middleware/auth.ts',
    content: `import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
const JWT_SECRET = process.env.JWT_SECRET || 'default-secret-change-me';
/** Require auth.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  try {
    const token = authHeader.substring(7);
    const payload = jwt.verify(token, JWT_SECRET);
    (req as any).user = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}
/** Require role.
 */
export function requireRole(role: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if ((req as any).user?.role !== role) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}
`,
  },
  {
    path: '/src/routes/api.ts',
    content: `import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { pool } from '../db';
/** Api router.
 */
export const apiRouter = Router();
// VULNERABLE: IDOR - no ownership check
apiRouter.get('/users/:id', requireAuth, async (req, res) => {
  const [rows] = await pool.query('SELECT id, username, email, role FROM users WHERE id = ?', [req.params.id]);
  res.json((rows as any[])[0] ?? null);
});
apiRouter.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
`,
  },
  {
    path: '/.env',
    content: `DB_HOST=localhost
DB_PORT=3306
DB_USER=webapp_user
DB_PASSWORD=Sup3rS3cret!
DB_NAME=webapp_db
JWT_SECRET=my-jwt-secret-key-change-in-production
CORS_ORIGIN=*
PORT=3000
NODE_ENV=development
`,
  },
  {
    path: '/.env.example',
    content: `DB_HOST=localhost
DB_PORT=3306
DB_USER=
DB_PASSWORD=
DB_NAME=webapp_db
JWT_SECRET=
CORS_ORIGIN=http://localhost:3000
PORT=3000
NODE_ENV=development
`,
  },
  {
    path: '/.gitignore',
    content: `node_modules/
dist/
.env
*.log
coverage/
.DS_Store
`,
  },
  {
    path: '/docs/api.md',
    content: `# API Documentation
## Authentication
### POST /auth/login
Login with username and password.
### POST /auth/register
Register a new user account.
## Users
### GET /api/users/:id
Get user by ID (requires authentication).
`,
  },
  {
    path: '/.github/workflows/ci.yml',
    content: `name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm test
      - run: npm run lint
`,
  },
  {
    path: '/tests/auth.test.ts',
    content: `import request from 'supertest';
import app from '../src';
describe('Authentication', () => {
  it('should login with valid credentials', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ username: 'admin', password: 'admin123' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
  });
  it('should reject invalid credentials', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ username: 'admin', password: 'wrong' });
    expect(res.status).toBe(401);
  });
});
`,
  },
  {
    path: '/scripts/seed-db.sql',
    content: `-- Seed database with test data
INSERT INTO users (username, email, password_hash, role) VALUES
  ('admin', 'admin@example.com', '$2b$12$LJ3m4rv5Oe3JKGq7Hf8Z4OzQFHKNBxqx8VJmZdKsO7X9sB5tXMbCm', 'admin'),
  ('testuser', 'test@example.com', '$2b$12$9f8x7gH3kL2mN4pQ5rS6tUvW8xY0zA1bC2dE3fG4hI5jK6lM7nO8p', 'user');
`,
  },
];
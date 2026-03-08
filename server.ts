import express from 'express';
import { createServer as createViteServer } from 'vite';
import cookieParser from 'cookie-parser';
import { db, initDb } from './src/db.ts';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { TOTP, NobleCryptoPlugin, ScureBase32Plugin } from 'otplib';
import qrcode from 'qrcode';
import path from 'path';
import { fileURLToPath } from 'url';

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-change-in-prod';

const totp = new TOTP({
  issuer: 'Secure Issue Forums',
  crypto: new NobleCryptoPlugin(),
  base32: new ScureBase32Plugin(),
});

async function startServer() {
  await initDb();
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));
  app.use(cookieParser());

  // Global BigInt serializer for JSON responses
  (BigInt.prototype as any).toJSON = function () {
    return this.toString();
  };

  // --- Auth Middleware ---
  const authenticate = (req: any, res: any, next: any) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = decoded;
      next();
    } catch (err) {
      res.status(401).json({ error: 'Invalid token' });
    }
  };

  // --- API Routes ---

  // Auth: Register
  app.post('/api/auth/register', async (req, res) => {
    const { email, username, password, profile_picture } = req.body;
    if (!email || !username || !password) {
      return res.status(400).json({ error: 'Missing fields' });
    }
    try {
      const hash = bcrypt.hashSync(password, 10);
      const secret = totp.generateSecret();
      const pic = profile_picture || `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`;
      
      const stmt = await db.execute({
        sql: 'INSERT INTO users (email, username, password_hash, profile_picture, two_factor_secret) VALUES (?, ?, ?, ?, ?)',
        args: [email, username, hash, pic, secret]
      });
      
      const otpauth = totp.toURI({ label: email, secret });
      const qrCodeUrl = await qrcode.toDataURL(otpauth);
      
      res.json({ id: stmt.lastInsertRowid?.toString(), qrCode: qrCodeUrl, secret });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // Auth: Login
  app.post('/api/auth/login', async (req, res) => {
    const { email, password, code } = req.body;
    if (!email || !password || !code) {
      return res.status(400).json({ error: 'Missing fields. 2FA code required.' });
    }
    const userResult = await db.execute({
      sql: 'SELECT * FROM users WHERE email = ?',
      args: [email]
    });
    const user = userResult.rows[0] as any;
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Verify 2FA
    const result = await totp.verify(code, { secret: user.two_factor_secret });
    if (!result.valid) {
      return res.status(401).json({ error: 'Invalid 2FA code' });
    }

    const token = jwt.sign({ id: user.id, email: user.email, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
    res.cookie('token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' });
    res.json({ id: user.id, email: user.email, username: user.username, profile_picture: user.profile_picture });
  });

  app.post('/api/auth/logout', (req, res) => {
    res.clearCookie('token');
    res.json({ success: true });
  });

  app.get('/api/auth/me', authenticate, async (req: any, res) => {
    const userResult = await db.execute({
      sql: 'SELECT id, email, username, profile_picture FROM users WHERE id = ?',
      args: [req.user.id]
    });
    res.json(userResult.rows[0]);
  });

  // Forums: List
  app.get('/api/forums', authenticate, async (req: any, res) => {
    const forumsResult = await db.execute({
      sql: `
      SELECT DISTINCT f.*, u.username as creator_username,
        (SELECT COUNT(*) FROM mentions m WHERE m.forum_id = f.id AND m.user_id = ? AND m.is_read = 0) as unread_mentions
      FROM forums f
      JOIN users u ON f.creator_id = u.id
      LEFT JOIN forum_invites fi ON f.id = fi.forum_id
      WHERE f.creator_id = ? OR fi.user_id = ?
      ORDER BY f.created_at DESC
    `,
      args: [req.user.id, req.user.id, req.user.id]
    });
    res.json(forumsResult.rows);
  });

  // Forums: Create
  app.post('/api/forums', authenticate, async (req: any, res) => {
    const { title, description } = req.body;
    if (!title) return res.status(400).json({ error: 'Title required' });
    try {
      const stmt = await db.execute({
        sql: 'INSERT INTO forums (title, description, creator_id) VALUES (?, ?, ?)',
        args: [title, description || null, req.user.id]
      });
      res.json({ id: stmt.lastInsertRowid?.toString() });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // Forums: Get single
  app.get('/api/forums/:id', authenticate, async (req: any, res) => {
    const forumId = req.params.id;
    const accessResult = await db.execute({
      sql: 'SELECT 1 FROM forums f LEFT JOIN forum_invites fi ON f.id = fi.forum_id WHERE f.id = ? AND (f.creator_id = ? OR fi.user_id = ?)',
      args: [forumId, req.user.id, req.user.id]
    });
    if (accessResult.rows.length === 0) return res.status(403).json({ error: 'Access denied' });

    const forumResult = await db.execute({
      sql: 'SELECT f.*, u.username as creator_username FROM forums f JOIN users u ON f.creator_id = u.id WHERE f.id = ?',
      args: [forumId]
    });
    res.json(forumResult.rows[0]);
  });

  // Forums: Invite user
  app.post('/api/forums/:id/invite', authenticate, async (req: any, res) => {
    const forumId = req.params.id;
    const { email } = req.body;
    const forumResult = await db.execute({
      sql: 'SELECT creator_id FROM forums WHERE id = ?',
      args: [forumId]
    });
    const forum = forumResult.rows[0] as any;
    if (!forum || forum.creator_id !== req.user.id) {
      return res.status(403).json({ error: 'Only creator can invite' });
    }
    const userToInviteResult = await db.execute({
      sql: 'SELECT id FROM users WHERE email = ?',
      args: [email]
    });
    const userToInvite = userToInviteResult.rows[0] as any;
    if (!userToInvite) return res.status(404).json({ error: 'User not found' });

    try {
      await db.execute({
        sql: 'INSERT INTO forum_invites (forum_id, user_id) VALUES (?, ?)',
        args: [forumId, userToInvite.id]
      });
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ error: 'User already invited' });
    }
  });

  // Messages: List for forum
  app.get('/api/forums/:id/messages', authenticate, async (req: any, res) => {
    const forumId = req.params.id;
    const accessResult = await db.execute({
      sql: 'SELECT 1 FROM forums f LEFT JOIN forum_invites fi ON f.id = fi.forum_id WHERE f.id = ? AND (f.creator_id = ? OR fi.user_id = ?)',
      args: [forumId, req.user.id, req.user.id]
    });
    if (accessResult.rows.length === 0) return res.status(403).json({ error: 'Access denied' });

    const messagesResult = await db.execute({
      sql: `
      SELECT m.*, u.username, u.email, u.profile_picture 
      FROM messages m 
      JOIN users u ON m.user_id = u.id 
      WHERE m.forum_id = ? 
      ORDER BY m.created_at ASC
    `,
      args: [forumId]
    });
    res.json(messagesResult.rows);
  });

  // Messages: Create
  app.post('/api/forums/:id/messages', authenticate, async (req: any, res) => {
    const forumId = req.params.id;
    const { content, parent_id } = req.body;
    if (!content) return res.status(400).json({ error: 'Content required' });

    const accessResult = await db.execute({
      sql: 'SELECT 1 FROM forums f LEFT JOIN forum_invites fi ON f.id = fi.forum_id WHERE f.id = ? AND (f.creator_id = ? OR fi.user_id = ?)',
      args: [forumId, req.user.id, req.user.id]
    });
    if (accessResult.rows.length === 0) return res.status(403).json({ error: 'Access denied' });

    const stmt = await db.execute({
      sql: 'INSERT INTO messages (forum_id, user_id, content, parent_id) VALUES (?, ?, ?, ?)',
      args: [forumId, req.user.id, content, parent_id || null]
    });
    const messageId = stmt.lastInsertRowid;

    const mentionRegex = /@([a-zA-Z0-9_]+)/g;
    const matches = [...content.matchAll(mentionRegex)];
    const mentionedUsernames = [...new Set(matches.map(m => m[1]))];

    for (const username of mentionedUsernames) {
      const mentionedUserResult = await db.execute({
        sql: 'SELECT id FROM users WHERE username = ?',
        args: [username]
      });
      const mentionedUser = mentionedUserResult.rows[0] as any;
      if (mentionedUser) {
        const hasAccessResult = await db.execute({
          sql: 'SELECT 1 FROM forums f LEFT JOIN forum_invites fi ON f.id = fi.forum_id WHERE f.id = ? AND (f.creator_id = ? OR fi.user_id = ?)',
          args: [forumId, mentionedUser.id, mentionedUser.id]
        });
        if (hasAccessResult.rows.length > 0) {
          await db.execute({
            sql: 'INSERT INTO mentions (message_id, user_id, forum_id) VALUES (?, ?, ?)',
            args: [messageId, mentionedUser.id, forumId]
          });
        }
      }
    }

    res.json({ id: messageId?.toString() });
  });

  // Mentions: Mark as read
  app.post('/api/forums/:id/mentions/read', authenticate, async (req: any, res) => {
    const forumId = req.params.id;
    await db.execute({
      sql: 'UPDATE mentions SET is_read = 1 WHERE forum_id = ? AND user_id = ?',
      args: [forumId, req.user.id]
    });
    res.json({ success: true });
  });

  // Users: Search
  app.get('/api/users/search', authenticate, async (req: any, res) => {
    const q = req.query.q;
    if (!q) return res.json([]);
    const usersResult = await db.execute({
      sql: 'SELECT id, username, email, profile_picture FROM users WHERE username LIKE ? OR email LIKE ? LIMIT 10',
      args: [`%${q}%`, `%${q}%`]
    });
    res.json(usersResult.rows);
  });

  // Users: Update Profile
  app.put('/api/users/me', authenticate, async (req: any, res) => {
    const { username, profile_picture } = req.body;
    if (!username) return res.status(400).json({ error: 'Username required' });
    try {
      await db.execute({
        sql: 'UPDATE users SET username = ?, profile_picture = ? WHERE id = ?',
        args: [username, profile_picture, req.user.id]
      });
      
      const userResult = await db.execute({
        sql: 'SELECT * FROM users WHERE id = ?',
        args: [req.user.id]
      });
      const user = userResult.rows[0] as any;
      const token = jwt.sign({ id: user.id, email: user.email, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
      res.cookie('token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' });
      
      res.json({ id: user.id, email: user.email, username: user.username, profile_picture: user.profile_picture });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

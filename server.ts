import express from 'express';
import { createServer as createViteServer } from 'vite';
import cookieParser from 'cookie-parser';
import { db } from './src/db.ts';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { authenticator } from 'otplib';
import qrcode from 'qrcode';

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-change-in-prod';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());
  app.use(cookieParser());

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
      const secret = authenticator.generateSecret();
      const pic = profile_picture || `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`;
      
      const stmt = db.prepare('INSERT INTO users (email, username, password_hash, profile_picture, two_factor_secret) VALUES (?, ?, ?, ?, ?)');
      const info = stmt.run(email, username, hash, pic, secret);
      
      const otpauth = authenticator.keyuri(email, 'Secure Issue Forums', secret);
      const qrCodeUrl = await qrcode.toDataURL(otpauth);
      
      res.json({ id: info.lastInsertRowid, qrCode: qrCodeUrl, secret });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // Auth: Login
  app.post('/api/auth/login', (req, res) => {
    const { email, password, code } = req.body;
    if (!email || !password || !code) {
      return res.status(400).json({ error: 'Missing fields. 2FA code required.' });
    }
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as any;
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Verify 2FA
    const isValid = authenticator.check(code, user.two_factor_secret);
    if (!isValid) {
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

  app.get('/api/auth/me', authenticate, (req: any, res) => {
    const user = db.prepare('SELECT id, email, username, profile_picture FROM users WHERE id = ?').get(req.user.id);
    res.json(user);
  });

  // Forums: List
  app.get('/api/forums', authenticate, (req: any, res) => {
    const forums = db.prepare(`
      SELECT DISTINCT f.*, u.username as creator_username,
        (SELECT COUNT(*) FROM mentions m WHERE m.forum_id = f.id AND m.user_id = ? AND m.is_read = 0) as unread_mentions
      FROM forums f
      JOIN users u ON f.creator_id = u.id
      LEFT JOIN forum_invites fi ON f.id = fi.forum_id
      WHERE f.creator_id = ? OR fi.user_id = ?
      ORDER BY f.created_at DESC
    `).all(req.user.id, req.user.id, req.user.id);
    res.json(forums);
  });

  // Forums: Create
  app.post('/api/forums', authenticate, (req: any, res) => {
    const { title, description } = req.body;
    if (!title) return res.status(400).json({ error: 'Title required' });
    try {
      const stmt = db.prepare('INSERT INTO forums (title, description, creator_id) VALUES (?, ?, ?)');
      const info = stmt.run(title, description || null, req.user.id);
      res.json({ id: info.lastInsertRowid });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // Forums: Get single
  app.get('/api/forums/:id', authenticate, (req: any, res) => {
    const forumId = req.params.id;
    const access = db.prepare('SELECT 1 FROM forums f LEFT JOIN forum_invites fi ON f.id = fi.forum_id WHERE f.id = ? AND (f.creator_id = ? OR fi.user_id = ?)').get(forumId, req.user.id, req.user.id);
    if (!access) return res.status(403).json({ error: 'Access denied' });

    const forum = db.prepare('SELECT f.*, u.username as creator_username FROM forums f JOIN users u ON f.creator_id = u.id WHERE f.id = ?').get(forumId);
    res.json(forum);
  });

  // Forums: Invite user
  app.post('/api/forums/:id/invite', authenticate, (req: any, res) => {
    const forumId = req.params.id;
    const { email } = req.body;
    const forum = db.prepare('SELECT creator_id FROM forums WHERE id = ?').get(forumId) as any;
    if (!forum || forum.creator_id !== req.user.id) {
      return res.status(403).json({ error: 'Only creator can invite' });
    }
    const userToInvite = db.prepare('SELECT id FROM users WHERE email = ?').get(email) as any;
    if (!userToInvite) return res.status(404).json({ error: 'User not found' });

    try {
      db.prepare('INSERT INTO forum_invites (forum_id, user_id) VALUES (?, ?)').run(forumId, userToInvite.id);
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ error: 'User already invited' });
    }
  });

  // Messages: List for forum
  app.get('/api/forums/:id/messages', authenticate, (req: any, res) => {
    const forumId = req.params.id;
    const access = db.prepare('SELECT 1 FROM forums f LEFT JOIN forum_invites fi ON f.id = fi.forum_id WHERE f.id = ? AND (f.creator_id = ? OR fi.user_id = ?)').get(forumId, req.user.id, req.user.id);
    if (!access) return res.status(403).json({ error: 'Access denied' });

    const messages = db.prepare(`
      SELECT m.*, u.username, u.email, u.profile_picture 
      FROM messages m 
      JOIN users u ON m.user_id = u.id 
      WHERE m.forum_id = ? 
      ORDER BY m.created_at ASC
    `).all(forumId);
    res.json(messages);
  });

  // Messages: Create
  app.post('/api/forums/:id/messages', authenticate, (req: any, res) => {
    const forumId = req.params.id;
    const { content, parent_id } = req.body;
    if (!content) return res.status(400).json({ error: 'Content required' });

    const access = db.prepare('SELECT 1 FROM forums f LEFT JOIN forum_invites fi ON f.id = fi.forum_id WHERE f.id = ? AND (f.creator_id = ? OR fi.user_id = ?)').get(forumId, req.user.id, req.user.id);
    if (!access) return res.status(403).json({ error: 'Access denied' });

    const stmt = db.prepare('INSERT INTO messages (forum_id, user_id, content, parent_id) VALUES (?, ?, ?, ?)');
    const info = stmt.run(forumId, req.user.id, content, parent_id || null);
    const messageId = info.lastInsertRowid;

    const mentionRegex = /@([a-zA-Z0-9_]+)/g;
    const matches = [...content.matchAll(mentionRegex)];
    const mentionedUsernames = [...new Set(matches.map(m => m[1]))];

    for (const username of mentionedUsernames) {
      const mentionedUser = db.prepare('SELECT id FROM users WHERE username = ?').get(username) as any;
      if (mentionedUser) {
        const hasAccess = db.prepare('SELECT 1 FROM forums f LEFT JOIN forum_invites fi ON f.id = fi.forum_id WHERE f.id = ? AND (f.creator_id = ? OR fi.user_id = ?)').get(forumId, mentionedUser.id, mentionedUser.id);
        if (hasAccess) {
          db.prepare('INSERT INTO mentions (message_id, user_id, forum_id) VALUES (?, ?, ?)').run(messageId, mentionedUser.id, forumId);
        }
      }
    }

    res.json({ id: messageId });
  });

  // Mentions: Mark as read
  app.post('/api/forums/:id/mentions/read', authenticate, (req: any, res) => {
    const forumId = req.params.id;
    db.prepare('UPDATE mentions SET is_read = 1 WHERE forum_id = ? AND user_id = ?').run(forumId, req.user.id);
    res.json({ success: true });
  });

  // Users: Search
  app.get('/api/users/search', authenticate, (req: any, res) => {
    const q = req.query.q;
    if (!q) return res.json([]);
    const users = db.prepare('SELECT id, username, email, profile_picture FROM users WHERE username LIKE ? OR email LIKE ? LIMIT 10').all(`%${q}%`, `%${q}%`);
    res.json(users);
  });

  // Users: Update Profile
  app.put('/api/users/me', authenticate, (req: any, res) => {
    const { username, profile_picture } = req.body;
    if (!username) return res.status(400).json({ error: 'Username required' });
    try {
      db.prepare('UPDATE users SET username = ?, profile_picture = ? WHERE id = ?').run(username, profile_picture, req.user.id);
      
      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id) as any;
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
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

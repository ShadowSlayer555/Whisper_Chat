import express from 'express';
import { createServer as createViteServer } from 'vite';
import cookieParser from 'cookie-parser';
import { db, initDb } from './src/db.ts';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import emailjs from '@emailjs/nodejs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-change-in-prod';

// Initialize Gemini
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

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

  // Auth: Register (Step 1: Create unverified account and send email)
  app.post('/api/auth/register', async (req, res) => {
    const { email, username, password, profile_picture } = req.body;
    if (!email || !username || !password) {
      return res.status(400).json({ error: 'Missing fields' });
    }
    try {
      const existingUserResult = await db.execute({
        sql: 'SELECT * FROM users WHERE email = ? OR username = ?',
        args: [email, username]
      });
      const existingUser = existingUserResult.rows[0] as any;

      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const hash = bcrypt.hashSync(password, 10);
      const pic = profile_picture || `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`;

      if (existingUser) {
        if (existingUser.is_verified) {
          return res.status(400).json({ error: 'Username or email already exists' });
        } else {
          // Check 10 minute cooldown
          if (existingUser.last_email_sent_at) {
            const lastSent = new Date(existingUser.last_email_sent_at + 'Z').getTime();
            const now = Date.now();
            if (now - lastSent < 10 * 60 * 1000) {
              const minutesLeft = Math.ceil((10 * 60 * 1000 - (now - lastSent)) / 60000);
              return res.status(429).json({ error: `Please wait ${minutesLeft} minutes before requesting a new code.` });
            }
          }
          // Update unverified user
          await db.execute({
            sql: 'UPDATE users SET username = ?, password_hash = ?, profile_picture = ?, two_factor_secret = ?, last_email_sent_at = CURRENT_TIMESTAMP WHERE email = ?',
            args: [username, hash, pic, code, email]
          });
        }
      } else {
        // Insert new unverified user
        await db.execute({
          sql: 'INSERT INTO users (email, username, password_hash, profile_picture, two_factor_secret, is_verified, last_email_sent_at) VALUES (?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP)',
          args: [email, username, hash, pic, code]
        });
      }

      // Send email
      try {
        if (process.env.EMAILJS_SERVICE_ID && process.env.EMAILJS_TEMPLATE_ID && process.env.EMAILJS_PUBLIC_KEY && process.env.EMAILJS_PRIVATE_KEY) {
          await emailjs.send(
            process.env.EMAILJS_SERVICE_ID,
            process.env.EMAILJS_TEMPLATE_ID,
            { to_email: email, code: code },
            { publicKey: process.env.EMAILJS_PUBLIC_KEY, privateKey: process.env.EMAILJS_PRIVATE_KEY }
          );
        } else {
          console.log(`[DEV MODE] Verification Code for ${email}: ${code}`);
        }
      } catch (err) {
        console.error('Failed to send email via EmailJS:', err);
      }

      res.json({ requireVerification: true, email });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // Auth: Resend Verification Email
  app.post('/api/auth/resend-verification', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });

    try {
      const userResult = await db.execute({
        sql: 'SELECT * FROM users WHERE email = ?',
        args: [email]
      });
      const user = userResult.rows[0] as any;
      
      if (!user) return res.status(404).json({ error: 'User not found' });
      if (user.is_verified) return res.status(400).json({ error: 'User is already verified' });

      if (user.last_email_sent_at) {
        const lastSent = new Date(user.last_email_sent_at + 'Z').getTime();
        const now = Date.now();
        if (now - lastSent < 10 * 60 * 1000) {
          const minutesLeft = Math.ceil((10 * 60 * 1000 - (now - lastSent)) / 60000);
          return res.status(429).json({ error: `Please wait ${minutesLeft} minutes before requesting a new code.` });
        }
      }

      const code = Math.floor(100000 + Math.random() * 900000).toString();
      await db.execute({
        sql: 'UPDATE users SET two_factor_secret = ?, last_email_sent_at = CURRENT_TIMESTAMP WHERE email = ?',
        args: [code, email]
      });

      try {
        if (process.env.EMAILJS_SERVICE_ID && process.env.EMAILJS_TEMPLATE_ID && process.env.EMAILJS_PUBLIC_KEY && process.env.EMAILJS_PRIVATE_KEY) {
          await emailjs.send(
            process.env.EMAILJS_SERVICE_ID,
            process.env.EMAILJS_TEMPLATE_ID,
            { to_email: email, code: code },
            { publicKey: process.env.EMAILJS_PUBLIC_KEY, privateKey: process.env.EMAILJS_PRIVATE_KEY }
          );
        } else {
          console.log(`[DEV MODE] Verification Code for ${email}: ${code}`);
        }
      } catch (err) {
        console.error('Failed to send email via EmailJS:', err);
      }

      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // Auth: Login (Direct login, no 2FA)
  app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Missing fields.' });
    }
    const userResult = await db.execute({
      sql: 'SELECT * FROM users WHERE email = ?',
      args: [email]
    });
    const user = userResult.rows[0] as any;
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    if (!user.is_verified) {
      return res.status(403).json({ error: 'Please verify your email first. Switch to Register to resend the code.' });
    }

    const token = jwt.sign({ id: user.id, email: user.email, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
    res.cookie('token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' });
    res.json({ id: user.id, email: user.email, username: user.username, profile_picture: user.profile_picture });
  });

  // Auth: Verify Email (Step 2 of Registration)
  app.post('/api/auth/verify-email', async (req, res) => {
    const { email, code } = req.body;
    if (!email || !code) {
      return res.status(400).json({ error: 'Missing fields.' });
    }
    
    const userResult = await db.execute({
      sql: 'SELECT * FROM users WHERE email = ?',
      args: [email]
    });
    const user = userResult.rows[0] as any;
    
    if (!user || user.two_factor_secret !== code) {
      return res.status(401).json({ error: 'Invalid verification code' });
    }

    // Mark as verified and clear the code
    await db.execute({
      sql: 'UPDATE users SET is_verified = 1, two_factor_secret = NULL WHERE id = ?',
      args: [user.id]
    });

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

  // Forums: AI Summary
  app.get('/api/forums/:id/summary', authenticate, async (req: any, res) => {
    const forumId = req.params.id;
    
    // Check access
    const accessResult = await db.execute({
      sql: 'SELECT 1 FROM forums f LEFT JOIN forum_invites fi ON f.id = fi.forum_id WHERE f.id = ? AND (f.creator_id = ? OR fi.user_id = ?)',
      args: [forumId, req.user.id, req.user.id]
    });
    if (accessResult.rows.length === 0) return res.status(403).json({ error: 'Access denied' });

    // Fetch forum details
    const forumResult = await db.execute({
      sql: 'SELECT title, description FROM forums WHERE id = ?',
      args: [forumId]
    });
    const forum = forumResult.rows[0] as any;

    // Fetch all messages
    const messagesResult = await db.execute({
      sql: `
      SELECT m.content, u.username, m.created_at
      FROM messages m 
      JOIN users u ON m.user_id = u.id 
      WHERE m.forum_id = ? 
      ORDER BY m.created_at ASC
    `,
      args: [forumId]
    });

    if (messagesResult.rows.length === 0) {
      return res.json({ summary: "No messages in this forum yet to summarize." });
    }

    let transcript = `Forum Title: ${forum.title}\nDescription: ${forum.description || 'N/A'}\n\nMessages:\n`;
    messagesResult.rows.forEach((m: any) => {
      transcript += `[${new Date(m.created_at).toLocaleString()}] ${m.username}: ${m.content}\n`;
    });

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: \`Analyze the following forum transcript and provide a comprehensive summary. Include who thinks what, the major issues discussed, and the different sides taken. Keep it concise but informative.\\n\\nTranscript:\\n\${transcript}\`,
      });
      res.json({ summary: response.text });
    } catch (err: any) {
      console.error("AI Summary Error:", err);
      res.status(500).json({ error: "Failed to generate summary." });
    }
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

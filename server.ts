import express from 'express';
import 'express-async-errors';
import { createServer as createViteServer } from 'vite';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cookieParser from 'cookie-parser';
import { db, initDb } from './src/db.ts';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import emailjs from '@emailjs/nodejs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-change-in-prod';

let ai: GoogleGenAI | null = null;
function getAi() {
  if (!ai) {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not set");
    }
    ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return ai;
}

async function startServer() {
  await initDb();
  const app = express();
  const server = createServer(app);
  const io = new Server(server, { cors: { origin: '*' } });
  const PORT = 3000;

  // WebRTC Signaling
  io.on('connection', (socket) => {
    socket.on('join-call', ({ forumId, userId, userDetails, type }) => {
      const room = `call-${forumId}`;
      socket.join(room);
      socket.to(room).emit('user-joined', { userId, socketId: socket.id, userDetails, type });

      socket.on('signal', ({ to, signal }) => {
        io.to(to).emit('signal', { from: socket.id, signal, userId, userDetails });
      });

      socket.on('disconnect', () => {
        socket.to(room).emit('user-left', { userId, socketId: socket.id });
      });
    });
  });

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

  async function checkForumAccess(forumId: string | number, userId: string | number) {
    const forumResult = await db.execute({
      sql: 'SELECT office_id, creator_id FROM forums WHERE id = ?',
      args: [forumId]
    });
    if (forumResult.rows.length === 0) return { hasAccess: false };
    const forum = forumResult.rows[0] as any;

    if (forum.office_id) {
      const officeResult = await db.execute({
        sql: 'SELECT status, creator_id FROM offices WHERE id = ?',
        args: [forum.office_id]
      });
      const office = officeResult.rows[0] as any;

      const accessResult = await db.execute({
        sql: 'SELECT role, kicked_at FROM office_members WHERE office_id = ? AND user_id = ?',
        args: [forum.office_id, userId]
      });
      if (accessResult.rows.length > 0) {
        const role = accessResult.rows[0].role;
        if (role === 'kicked') return { hasAccess: false };
        
        if (office.status === 'archived' && office.creator_id !== userId) {
          return { hasAccess: false };
        }

        return { 
          hasAccess: true, 
          role: role, 
          kicked_at: accessResult.rows[0].kicked_at 
        };
      }
      return { hasAccess: false };
    } else {
      const accessResult = await db.execute({
        sql: 'SELECT 1 FROM forums f LEFT JOIN forum_invites fi ON f.id = fi.forum_id WHERE f.id = ? AND (f.creator_id = ? OR fi.user_id = ?)',
        args: [forumId, userId, userId]
      });
      return { hasAccess: accessResult.rows.length > 0 };
    }
  }

  // Offices: Create
  app.post('/api/offices', authenticate, async (req: any, res) => {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });

    const stmt = await db.execute({
      sql: 'INSERT INTO offices (name, description, creator_id) VALUES (?, ?, ?)',
      args: [name, description, req.user.id]
    });
    const officeId = stmt.lastInsertRowid;

    await db.execute({
      sql: 'INSERT INTO office_members (office_id, user_id, role) VALUES (?, ?, ?)',
      args: [officeId, req.user.id, 'creator']
    });

    res.json({ id: officeId?.toString() });
  });

  // Offices: List
  app.get('/api/offices', authenticate, async (req: any, res) => {
    const result = await db.execute({
      sql: `
        SELECT o.*, om.role 
        FROM offices o
        JOIN office_members om ON o.id = om.office_id
        WHERE om.user_id = ? AND om.role != 'kicked' AND (o.status = 'active' OR (o.status = 'archived' AND o.creator_id = ?))
        ORDER BY o.created_at DESC
      `,
      args: [req.user.id, req.user.id]
    });
    res.json(result.rows);
  });

  // Offices: Get details (forums and members)
  app.get('/api/offices/:id', authenticate, async (req: any, res) => {
    const officeId = req.params.id;
    
    const accessResult = await db.execute({
      sql: 'SELECT role, kick_requested_by FROM office_members WHERE office_id = ? AND user_id = ?',
      args: [officeId, req.user.id]
    });
    if (accessResult.rows.length === 0 || accessResult.rows[0].role === 'kicked') return res.status(403).json({ error: 'Access denied' });
    const userRole = accessResult.rows[0].role;
    const kickRequestedBy = accessResult.rows[0].kick_requested_by;

    const officeResult = await db.execute({
      sql: 'SELECT * FROM offices WHERE id = ?',
      args: [officeId]
    });
    const office = officeResult.rows[0] as any;

    if (office.status === 'archived' && office.creator_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const forumsResult = await db.execute({
      sql: `
        SELECT f.*, 
               (SELECT COUNT(*) FROM messages m WHERE m.forum_id = f.id AND m.created_at > COALESCE((SELECT last_read_at FROM forum_read_states frs WHERE frs.forum_id = f.id AND frs.user_id = ?), '1970-01-01')) as unread_count
        FROM forums f 
        WHERE f.office_id = ? 
        ORDER BY f.created_at DESC
      `,
      args: [req.user.id, officeId]
    });

    const membersResult = await db.execute({
      sql: `
        SELECT u.id, u.username, u.email, u.profile_picture, om.role, om.kick_requested_by,
               (SELECT username FROM users WHERE id = om.kick_requested_by) as kick_requester_name
        FROM users u
        JOIN office_members om ON u.id = om.user_id
        WHERE om.office_id = ? AND om.role != 'kicked'
      `,
      args: [officeId]
    });

    res.json({
      ...office,
      userRole,
      kickRequestedBy,
      forums: forumsResult.rows,
      members: membersResult.rows
    });
  });

  // Offices: Invite member
  app.post('/api/offices/:id/invite', authenticate, async (req: any, res) => {
    const officeId = req.params.id;
    const { email } = req.body;

    const accessResult = await db.execute({
      sql: 'SELECT role FROM office_members WHERE office_id = ? AND user_id = ?',
      args: [officeId, req.user.id]
    });
    if (accessResult.rows.length === 0 || (accessResult.rows[0].role !== 'creator' && accessResult.rows[0].role !== 'admin')) {
      return res.status(403).json({ error: 'Only admins can invite members' });
    }

    const emails = email.split(' ').filter((e: string) => e.trim() !== '');
    let invitedCount = 0;

    for (const e of emails) {
      const userResult = await db.execute({
        sql: 'SELECT id FROM users WHERE email = ?',
        args: [e.trim()]
      });
      if (userResult.rows.length > 0) {
        const targetUserId = userResult.rows[0].id;
        
        const existingResult = await db.execute({
          sql: 'SELECT role FROM office_members WHERE office_id = ? AND user_id = ?',
          args: [officeId, targetUserId]
        });

        if (existingResult.rows.length > 0) {
          if (existingResult.rows[0].role === 'kicked') {
            await db.execute({
              sql: "UPDATE office_members SET role = 'member', kicked_at = NULL WHERE office_id = ? AND user_id = ?",
              args: [officeId, targetUserId]
            });
            invitedCount++;
          }
        } else {
          try {
            await db.execute({
              sql: 'INSERT INTO office_members (office_id, user_id, role) VALUES (?, ?, ?)',
              args: [officeId, targetUserId, 'member']
            });
            invitedCount++;
          } catch (err) {}
        }
      }
    }

    if (invitedCount > 0) {
      res.json({ success: true, count: invitedCount });
    } else {
      res.status(400).json({ error: 'No valid users found or already in office' });
    }
  });

  // Offices: Promote to admin
  app.post('/api/offices/:id/members/:userId/admin', authenticate, async (req: any, res) => {
    const officeId = req.params.id;
    const targetUserId = req.params.userId;

    const accessResult = await db.execute({
      sql: 'SELECT role FROM office_members WHERE office_id = ? AND user_id = ?',
      args: [officeId, req.user.id]
    });
    if (accessResult.rows.length === 0 || (accessResult.rows[0].role !== 'creator' && accessResult.rows[0].role !== 'admin')) {
      return res.status(403).json({ error: 'Only admins can promote members' });
    }

    await db.execute({
      sql: "UPDATE office_members SET role = 'admin' WHERE office_id = ? AND user_id = ? AND role = 'member'",
      args: [officeId, targetUserId]
    });

    res.json({ success: true });
  });

  // Offices: Demote admin
  app.post('/api/offices/:id/members/:userId/demote', authenticate, async (req: any, res) => {
    const officeId = req.params.id;
    const targetUserId = req.params.userId;

    const accessResult = await db.execute({
      sql: 'SELECT role FROM office_members WHERE office_id = ? AND user_id = ?',
      args: [officeId, req.user.id]
    });
    if (accessResult.rows.length === 0 || (accessResult.rows[0].role !== 'creator' && accessResult.rows[0].role !== 'admin')) {
      return res.status(403).json({ error: 'Only admins can demote members' });
    }

    await db.execute({
      sql: "UPDATE office_members SET role = 'member' WHERE office_id = ? AND user_id = ? AND role = 'admin'",
      args: [officeId, targetUserId]
    });

    res.json({ success: true });
  });

  // Offices: Kick member
  app.post('/api/offices/:id/members/:userId/kick', authenticate, async (req: any, res) => {
    const officeId = req.params.id;
    const targetUserId = req.params.userId;

    const accessResult = await db.execute({
      sql: 'SELECT role FROM office_members WHERE office_id = ? AND user_id = ?',
      args: [officeId, req.user.id]
    });
    if (accessResult.rows.length === 0 || (accessResult.rows[0].role !== 'creator' && accessResult.rows[0].role !== 'admin')) {
      return res.status(403).json({ error: 'Only admins can kick members' });
    }

    const targetAccessResult = await db.execute({
      sql: 'SELECT role FROM office_members WHERE office_id = ? AND user_id = ?',
      args: [officeId, targetUserId]
    });
    if (targetAccessResult.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    
    const targetRole = targetAccessResult.rows[0].role;
    if (targetRole === 'admin' || targetRole === 'creator') {
      await db.execute({
        sql: "UPDATE office_members SET kick_requested_by = ? WHERE office_id = ? AND user_id = ?",
        args: [req.user.id, officeId, targetUserId]
      });
      return res.json({ success: true, requested: true });
    }

    const targetUserResult = await db.execute({
      sql: 'SELECT username FROM users WHERE id = ?',
      args: [targetUserId]
    });
    const targetUsername = targetUserResult.rows[0]?.username;

    await db.execute({
      sql: "UPDATE office_members SET role = 'kicked', kicked_at = CURRENT_TIMESTAMP WHERE office_id = ? AND user_id = ?",
      args: [officeId, targetUserId]
    });

    const forumsResult = await db.execute({
      sql: 'SELECT id FROM forums WHERE office_id = ?',
      args: [officeId]
    });
    for (const forum of forumsResult.rows) {
      await db.execute({
        sql: "INSERT INTO messages (forum_id, user_id, content, type) VALUES (?, ?, ?, 'system_kick')",
        args: [forum.id, targetUserId, `${targetUsername} has been kicked from the office.`]
      });
    }

    res.json({ success: true });
  });

  // Offices: Respond to kick request
  app.post('/api/offices/:id/kick-response', authenticate, async (req: any, res) => {
    const officeId = req.params.id;
    const { action } = req.body; // 'resign' | 'reject'

    if (action === 'resign') {
      await db.execute({
        sql: "UPDATE office_members SET role = 'kicked', kick_requested_by = NULL, kicked_at = CURRENT_TIMESTAMP WHERE office_id = ? AND user_id = ?",
        args: [officeId, req.user.id]
      });

      const targetUserResult = await db.execute({
        sql: 'SELECT username FROM users WHERE id = ?',
        args: [req.user.id]
      });
      const targetUsername = targetUserResult.rows[0]?.username;

      const forumsResult = await db.execute({
        sql: 'SELECT id FROM forums WHERE office_id = ?',
        args: [officeId]
      });
      for (const forum of forumsResult.rows) {
        await db.execute({
          sql: "INSERT INTO messages (forum_id, user_id, content, type) VALUES (?, ?, ?, 'system_kick')",
          args: [forum.id, req.user.id, `${targetUsername} has resigned from the office.`]
        });
      }
    } else if (action === 'reject') {
      await db.execute({
        sql: "UPDATE office_members SET kick_requested_by = NULL WHERE office_id = ? AND user_id = ?",
        args: [officeId, req.user.id]
      });
    }

    res.json({ success: true });
  });

  // Offices: Resign
  app.post('/api/offices/:id/resign', authenticate, async (req: any, res) => {
    const officeId = req.params.id;
    await db.execute({
      sql: "UPDATE office_members SET role = 'kicked', kick_requested_by = NULL, kicked_at = CURRENT_TIMESTAMP WHERE office_id = ? AND user_id = ?",
      args: [officeId, req.user.id]
    });

    const targetUserResult = await db.execute({
      sql: 'SELECT username FROM users WHERE id = ?',
      args: [req.user.id]
    });
    const targetUsername = targetUserResult.rows[0]?.username;

    const forumsResult = await db.execute({
      sql: 'SELECT id FROM forums WHERE office_id = ?',
      args: [officeId]
    });
    for (const forum of forumsResult.rows) {
      await db.execute({
        sql: "INSERT INTO messages (forum_id, user_id, content, type) VALUES (?, ?, ?, 'system_kick')",
        args: [forum.id, req.user.id, `${targetUsername} has resigned from the office.`]
      });
    }

    res.json({ success: true });
  });

  // Offices: Get deletion status
  app.get('/api/offices/:id/deletion-status', authenticate, async (req: any, res) => {
    const officeId = req.params.id;
    
    const adminsResult = await db.execute({
      sql: "SELECT u.id, u.username FROM users u JOIN office_members om ON u.id = om.user_id WHERE om.office_id = ? AND om.role IN ('admin', 'creator')",
      args: [officeId]
    });
    
    const approvalsResult = await db.execute({
      sql: "SELECT user_id FROM office_deletion_approvals WHERE office_id = ?",
      args: [officeId]
    });
    
    const approvedUserIds = approvalsResult.rows.map((r: any) => r.user_id);
    
    res.json({
      admins: adminsResult.rows,
      approvedUserIds
    });
  });

  // Offices: Approve deletion
  app.post('/api/offices/:id/delete-approve', authenticate, async (req: any, res) => {
    const officeId = req.params.id;
    
    await db.execute({
      sql: "INSERT OR IGNORE INTO office_deletion_approvals (office_id, user_id) VALUES (?, ?)",
      args: [officeId, req.user.id]
    });
    
    const adminsResult = await db.execute({
      sql: "SELECT user_id FROM office_members WHERE office_id = ? AND role IN ('admin', 'creator')",
      args: [officeId]
    });
    
    const approvalsResult = await db.execute({
      sql: "SELECT user_id FROM office_deletion_approvals WHERE office_id = ?",
      args: [officeId]
    });
    
    const adminIds = adminsResult.rows.map((r: any) => r.user_id);
    const approvedIds = approvalsResult.rows.map((r: any) => r.user_id);
    
    const allApproved = adminIds.every(id => approvedIds.includes(id));
    
    if (allApproved) {
      await db.execute({
        sql: "UPDATE offices SET status = 'archived' WHERE id = ?",
        args: [officeId]
      });
    }
    
    res.json({ success: true, archived: allApproved });
  });

  // Offices: Reactivate
  app.post('/api/offices/:id/reactivate', authenticate, async (req: any, res) => {
    const officeId = req.params.id;
    const { email } = req.body;
    
    const officeResult = await db.execute({
      sql: "SELECT creator_id FROM offices WHERE id = ?",
      args: [officeId]
    });
    
    if (officeResult.rows[0].creator_id !== req.user.id) {
      return res.status(403).json({ error: 'Only creator can reactivate' });
    }
    
    if (!email) {
      return res.status(400).json({ error: 'Must invite at least one member' });
    }
    
    const emails = email.split(' ').filter((e: string) => e.trim() !== '');
    let invitedCount = 0;

    for (const e of emails) {
      const userResult = await db.execute({
        sql: 'SELECT id FROM users WHERE email = ?',
        args: [e.trim()]
      });
      if (userResult.rows.length > 0) {
        const targetUserId = userResult.rows[0].id;
        
        const existingResult = await db.execute({
          sql: 'SELECT role FROM office_members WHERE office_id = ? AND user_id = ?',
          args: [officeId, targetUserId]
        });

        if (existingResult.rows.length > 0) {
          if (existingResult.rows[0].role === 'kicked') {
            await db.execute({
              sql: "UPDATE office_members SET role = 'member', kicked_at = NULL WHERE office_id = ? AND user_id = ?",
              args: [officeId, targetUserId]
            });
            invitedCount++;
          }
        } else {
          try {
            await db.execute({
              sql: 'INSERT INTO office_members (office_id, user_id, role) VALUES (?, ?, ?)',
              args: [officeId, targetUserId, 'member']
            });
            invitedCount++;
          } catch (err) {}
        }
      }
    }
    
    if (invitedCount > 0) {
      await db.execute({
        sql: "UPDATE offices SET status = 'active' WHERE id = ?",
        args: [officeId]
      });
      await db.execute({
        sql: "DELETE FROM office_deletion_approvals WHERE office_id = ?",
        args: [officeId]
      });
      res.json({ success: true });
    } else {
      res.status(400).json({ error: 'No valid users found to invite' });
    }
  });

  // Offices: Create Forum
  app.post('/api/offices/:id/forums', authenticate, async (req: any, res) => {
    const officeId = req.params.id;
    const { title, description } = req.body;

    const accessResult = await db.execute({
      sql: 'SELECT role FROM office_members WHERE office_id = ? AND user_id = ?',
      args: [officeId, req.user.id]
    });
    if (accessResult.rows.length === 0 || (accessResult.rows[0].role !== 'creator' && accessResult.rows[0].role !== 'admin')) {
      return res.status(403).json({ error: 'Only admins can create forums' });
    }

    const stmt = await db.execute({
      sql: 'INSERT INTO forums (title, description, creator_id, office_id) VALUES (?, ?, ?, ?)',
      args: [title, description, req.user.id, officeId]
    });

    res.json({ id: stmt.lastInsertRowid?.toString() });
  });

  // Forums: List (Legacy, maybe keep for backwards compatibility)
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
    const access = await checkForumAccess(forumId, req.user.id);
    if (!access.hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const forumResult = await db.execute({
      sql: 'SELECT f.*, u.username as creator_username FROM forums f JOIN users u ON f.creator_id = u.id WHERE f.id = ?',
      args: [forumId]
    });
    
    let userRole = 'member';
    if (forumResult.rows[0].office_id) {
      const roleResult = await db.execute({
        sql: 'SELECT role FROM office_members WHERE office_id = ? AND user_id = ?',
        args: [forumResult.rows[0].office_id, req.user.id]
      });
      if (roleResult.rows.length > 0) {
        userRole = roleResult.rows[0].role as string;
      }
    } else if (forumResult.rows[0].creator_id === req.user.id) {
      userRole = 'creator';
    }

    res.json({ ...forumResult.rows[0], userRole });
  });

  // Forums: Mark as read
  app.post('/api/forums/:id/read', authenticate, async (req: any, res) => {
    try {
      await db.execute({
        sql: `
          INSERT INTO forum_read_states (user_id, forum_id, last_read_at)
          VALUES (?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(user_id, forum_id) DO UPDATE SET last_read_at = CURRENT_TIMESTAMP
        `,
        args: [req.user.id, req.params.id]
      });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to update read state' });
    }
  });

  // Forums: Mark solution
  app.post('/api/forums/:id/solution', authenticate, async (req: any, res) => {
    const { messageId } = req.body;
    const forumId = req.params.id;

    const forumRes = await db.execute({ sql: 'SELECT office_id, creator_id FROM forums WHERE id = ?', args: [forumId] });
    if (forumRes.rows.length === 0) return res.status(404).json({error: 'Not found'});
    const forum = forumRes.rows[0];
    
    let canManage = false;
    if (forum.office_id) {
      const accessRes = await db.execute({ sql: 'SELECT role FROM office_members WHERE office_id = ? AND user_id = ?', args: [forum.office_id, req.user.id] });
      if (accessRes.rows.length > 0 && (accessRes.rows[0].role === 'admin' || accessRes.rows[0].role === 'creator')) {
        canManage = true;
      }
    } else if (forum.creator_id === req.user.id) {
      canManage = true;
    }

    if (!canManage) {
      return res.status(403).json({error: 'Only admins can mark solutions'});
    }

    await db.execute({
      sql: 'UPDATE forums SET solution_message_id = ? WHERE id = ?',
      args: [messageId, forumId]
    });
    res.json({ success: true });
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
    const access = await checkForumAccess(forumId, req.user.id);
    if (!access.hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    let sql = `
      SELECT m.*, u.username, u.email, u.profile_picture 
      FROM messages m 
      JOIN users u ON m.user_id = u.id 
      WHERE m.forum_id = ? 
    `;
    const args: any[] = [forumId];

    if (access.role === 'kicked' && access.kicked_at) {
      sql += ` AND m.created_at <= ?`;
      args.push(access.kicked_at);
    }

    sql += ` ORDER BY m.created_at ASC`;

    const messagesResult = await db.execute({ sql, args });
    res.json(messagesResult.rows);
  });

  // Messages: Create
  app.post('/api/forums/:id/messages', authenticate, async (req: any, res) => {
    const forumId = req.params.id;
    const { content, parent_id } = req.body;
    if (!content) return res.status(400).json({ error: 'Content required' });

    const access = await checkForumAccess(forumId, req.user.id);
    if (!access.hasAccess || access.role === 'kicked') {
      return res.status(403).json({ error: 'Access denied' });
    }

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
        const access = await checkForumAccess(forumId, mentionedUser.id);
        if (access.hasAccess && access.role !== 'kicked') {
          await db.execute({
            sql: 'INSERT INTO mentions (message_id, user_id, forum_id) VALUES (?, ?, ?)',
            args: [messageId, mentionedUser.id, forumId]
          });
        }
      }
    }

    res.json({ id: messageId?.toString() });
  });

  // Messages: AI Counselor Filter
  app.post('/api/analyze-message', authenticate, async (req: any, res) => {
    const { content, forumId } = req.body;
    if (!content || content.trim().length < 5) return res.json({ warning: null });

    try {
      const historyResult = await db.execute({
        sql: "SELECT content FROM messages WHERE forum_id = ? AND user_id = ? AND type = 'user' ORDER BY created_at DESC LIMIT 5",
        args: [forumId, req.user.id]
      });
      const history = historyResult.rows.map((r: any) => r.content).reverse().join('\n');

      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      const prompt = `You are a built-in counselor for a private chat forum.
Your job is to read the user's drafted message and their recent history, and warn them if the drafted message is harmful, not nice, could be perceived as bad, or isn't a coherent sentence.
If it's fine, return an empty string.
If it needs a warning, return a short, helpful warning and a suggestion.
Example: "That might be taken the wrong way! Try this: [suggestion]" or "Are you sure that's a coherent sentence? Try this: [suggestion]"

Recent history:
${history}

Drafted message:
${content}

Return ONLY the warning text, or nothing if it's fine.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
      });

      const warning = response.text?.trim() || null;
      res.json({ warning: warning === '' ? null : warning });
    } catch (err) {
      console.error('AI Filter error:', err);
      res.json({ warning: null });
    }
  });

  // Forums: AI Summary
  app.get('/api/forums/:id/summary', authenticate, async (req: any, res) => {
    const forumId = req.params.id;
    
    // Check access
    const access = await checkForumAccess(forumId, req.user.id);
    if (!access.hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Fetch forum details
    const forumResult = await db.execute({
      sql: 'SELECT title, description FROM forums WHERE id = ?',
      args: [forumId]
    });
    const forum = forumResult.rows[0] as any;

    // Fetch all messages
    let sql = `
      SELECT m.content, u.username, m.created_at
      FROM messages m 
      JOIN users u ON m.user_id = u.id 
      WHERE m.forum_id = ? 
    `;
    const args: any[] = [forumId];

    if (access.role === 'kicked' && access.kicked_at) {
      sql += ` AND m.created_at <= ?`;
      args.push(access.kicked_at);
    }

    sql += ` ORDER BY m.created_at ASC`;

    const messagesResult = await db.execute({ sql, args });

    if (messagesResult.rows.length === 0) {
      return res.json({ summary: "No messages in this forum yet to summarize." });
    }

    let transcript = `Forum Title: ${forum.title}\nDescription: ${forum.description || 'N/A'}\n\nMessages:\n`;
    messagesResult.rows.forEach((m: any) => {
      transcript += `[${new Date(m.created_at).toLocaleString()}] ${m.username}: ${m.content}\n`;
    });

    try {
      const aiClient = getAi();
      const response = await aiClient.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Analyze the following forum transcript and provide a comprehensive summary. Include who thinks what, the major issues discussed, and the different sides taken. Keep it concise but informative.\n\nTranscript:\n${transcript}`,
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

  // Forums: Start/End Call
  app.post('/api/forums/:id/call', authenticate, async (req: any, res) => {
    const forumId = req.params.id;
    const { type } = req.body; // 'video', 'voice', or null to end

    const access = await checkForumAccess(forumId, req.user.id);
    if (!access.hasAccess) return res.status(403).json({ error: 'Access denied' });

    await db.execute({
      sql: 'UPDATE forums SET active_call_type = ? WHERE id = ?',
      args: [type, forumId]
    });
    res.json({ success: true, type });
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

  app.use((err: any, req: any, res: any, next: any) => {
    console.error('Unhandled error:', err);
    if (res.headersSent) {
      return next(err);
    }
    res.status(500).json({ error: 'Internal server error' });
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

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

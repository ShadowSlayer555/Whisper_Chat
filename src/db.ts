import { createClient } from '@libsql/client';

const url = process.env.TURSO_DATABASE_URL || 'file:database.sqlite';
const authToken = process.env.TURSO_AUTH_TOKEN;

export const db = createClient({
  url,
  authToken,
});

// Initialize schema
export const initDb = async () => {
  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      profile_picture TEXT,
      two_factor_secret TEXT,
      is_verified BOOLEAN DEFAULT 0,
      last_email_sent_at DATETIME,
      notifications_enabled BOOLEAN DEFAULT 0,
      ringtone_enabled BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS offices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      creator_id INTEGER NOT NULL,
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (creator_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS office_members (
      office_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      role TEXT DEFAULT 'member',
      kicked_at DATETIME,
      kick_requested_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (office_id, user_id),
      FOREIGN KEY (office_id) REFERENCES offices(id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (kick_requested_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS forums (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      creator_id INTEGER NOT NULL,
      office_id INTEGER,
      active_call_type TEXT,
      solution_message_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (creator_id) REFERENCES users(id),
      FOREIGN KEY (office_id) REFERENCES offices(id),
      FOREIGN KEY (solution_message_id) REFERENCES messages(id)
    );

    CREATE TABLE IF NOT EXISTS forum_invites (
      forum_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      PRIMARY KEY (forum_id, user_id),
      FOREIGN KEY (forum_id) REFERENCES forums(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      forum_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      parent_id INTEGER,
      type TEXT DEFAULT 'user',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (forum_id) REFERENCES forums(id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (parent_id) REFERENCES messages(id)
    );

    CREATE TABLE IF NOT EXISTS mentions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      forum_id INTEGER NOT NULL,
      is_read BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (message_id) REFERENCES messages(id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (forum_id) REFERENCES forums(id)
    );

    CREATE INDEX IF NOT EXISTS idx_messages_forum_id_created_at ON messages(forum_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages(user_id);
    CREATE INDEX IF NOT EXISTS idx_office_members_user_id_role ON office_members(user_id, role);
    CREATE INDEX IF NOT EXISTS idx_office_members_office_id_role ON office_members(office_id, role);
    CREATE INDEX IF NOT EXISTS idx_forums_office_id ON forums(office_id);
    CREATE INDEX IF NOT EXISTS idx_forums_creator_id ON forums(creator_id);
    CREATE INDEX IF NOT EXISTS idx_mentions_forum_user_read ON mentions(forum_id, user_id, is_read);
    CREATE INDEX IF NOT EXISTS idx_forum_invites_user_id ON forum_invites(user_id);
  `);

  // Migrations for existing database
  try { await db.execute('ALTER TABLE users ADD COLUMN is_verified BOOLEAN DEFAULT 1'); } catch (e) {}
  try { await db.execute('ALTER TABLE users ADD COLUMN last_email_sent_at DATETIME'); } catch (e) {}
  try { await db.execute('ALTER TABLE forums ADD COLUMN office_id INTEGER REFERENCES offices(id)'); } catch (e) {}
  try { await db.execute('ALTER TABLE office_members ADD COLUMN kicked_at DATETIME'); } catch (e) {}
  try { await db.execute("ALTER TABLE messages ADD COLUMN type TEXT DEFAULT 'user'"); } catch (e) {}
  try { await db.execute("ALTER TABLE offices ADD COLUMN status TEXT DEFAULT 'active'"); } catch (e) {}
  try { await db.execute("ALTER TABLE office_members ADD COLUMN kick_requested_by INTEGER REFERENCES users(id)"); } catch (e) {}
  try { await db.execute("ALTER TABLE forums ADD COLUMN solution_message_id INTEGER REFERENCES messages(id)"); } catch (e) {}
  try { await db.execute("ALTER TABLE forums ADD COLUMN active_call_type TEXT"); } catch (e) {}
  try { await db.execute("ALTER TABLE users ADD COLUMN notifications_enabled BOOLEAN DEFAULT 0"); } catch (e) {}
  try { await db.execute("ALTER TABLE users ADD COLUMN ringtone_enabled BOOLEAN DEFAULT 1"); } catch (e) {}
  try { await db.execute("UPDATE users SET ringtone_enabled = 1 WHERE ringtone_enabled IS NULL"); } catch (e) {}
  try { 
    await db.execute(`
      CREATE TABLE IF NOT EXISTS office_deletion_approvals (
        office_id INTEGER REFERENCES offices(id),
        user_id INTEGER REFERENCES users(id),
        PRIMARY KEY (office_id, user_id)
      )
    `);
  } catch (e) {}
  try {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS forum_read_states (
        user_id INTEGER REFERENCES users(id),
        forum_id INTEGER REFERENCES forums(id),
        last_read_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, forum_id)
      )
    `);
  } catch (e) {}
};

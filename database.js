
const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const dbPath = path.resolve(
  process.env.DB_PATH || "./data/interndrcare.db"
);

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

function tableExists(table) {
  return Boolean(
    db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type = 'table' AND name = ?
    `).get(table)
  );
}

function columns(table) {
  if (!tableExists(table)) return [];

  return db.prepare(`PRAGMA table_info("${table}")`)
    .all()
    .map(column => column.name);
}

function addColumnIfMissing(table, name, definition) {
  if (!columns(table).includes(name)) {
    db.exec(`ALTER TABLE "${table}" ADD COLUMN "${name}" ${definition}`);
    console.log(`Added ${table}.${name}`);
  }
}

function initializeDatabase() {
  // Create tables first. Do not create indexes yet.
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('SENIOR', 'INTERN')),
      hospital TEXT NOT NULL DEFAULT 'Unspecified Hospital',
      department TEXT DEFAULT '',
      specialization TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS connections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      senior_id INTEGER NOT NULL REFERENCES users(id),
      intern_id INTEGER NOT NULL REFERENCES users(id),
      status TEXT NOT NULL DEFAULT 'PENDING',
      requested_by INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(senior_id, intern_id)
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      connection_id INTEGER REFERENCES connections(id),
      assigned_by INTEGER NOT NULL REFERENCES users(id),
      assigned_to INTEGER NOT NULL REFERENCES users(id),
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      due_at TEXT DEFAULT NULL,
      status TEXT NOT NULL DEFAULT 'OPEN',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS cases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_by INTEGER NOT NULL REFERENCES users(id),
      assigned_to INTEGER REFERENCES users(id),
      title TEXT NOT NULL,
      summary TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'OPEN',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      category TEXT NOT NULL DEFAULT 'GENERAL',
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      data TEXT NOT NULL DEFAULT '{}',
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Migrate users without deleting accounts.
  addColumnIfMissing(
    "users", "hospital",
    "TEXT NOT NULL DEFAULT 'Unspecified Hospital'"
  );
  addColumnIfMissing("users", "department", "TEXT DEFAULT ''");
  addColumnIfMissing("users", "specialization", "TEXT DEFAULT ''");
  addColumnIfMissing("users", "phone", "TEXT DEFAULT ''");
  addColumnIfMissing(
    "users", "created_at",
    "TEXT DEFAULT ''"
  );

  // Migrate older task tables before indexing them.
  addColumnIfMissing("tasks", "connection_id", "INTEGER");
  addColumnIfMissing("tasks", "assigned_by", "INTEGER");
  addColumnIfMissing("tasks", "assigned_to", "INTEGER");
  addColumnIfMissing("tasks", "title", "TEXT DEFAULT ''");
  addColumnIfMissing("tasks", "description", "TEXT DEFAULT ''");
  addColumnIfMissing("tasks", "due_at", "TEXT");
  addColumnIfMissing("tasks", "status", "TEXT DEFAULT 'OPEN'");
  addColumnIfMissing(
    "tasks", "created_at",
    "TEXT DEFAULT ''"
  );
  addColumnIfMissing(
    "tasks", "updated_at",
    "TEXT DEFAULT ''"
  );

  // Migrate older case tables before indexing them.
  addColumnIfMissing("cases", "created_by", "INTEGER");
  addColumnIfMissing("cases", "assigned_to", "INTEGER");
  addColumnIfMissing("cases", "title", "TEXT DEFAULT ''");
  addColumnIfMissing("cases", "summary", "TEXT DEFAULT ''");
  addColumnIfMissing("cases", "status", "TEXT DEFAULT 'OPEN'");
  addColumnIfMissing(
    "cases", "created_at",
    "TEXT DEFAULT ''"
  );
  addColumnIfMissing(
    "cases", "updated_at",
    "TEXT DEFAULT ''"
  );

  // Migrate older connection tables.
  addColumnIfMissing("connections", "status", "TEXT DEFAULT 'PENDING'");
  addColumnIfMissing("connections", "requested_by", "INTEGER");
  addColumnIfMissing(
    "connections", "created_at",
    "TEXT DEFAULT ''"
  );
  addColumnIfMissing(
    "connections", "updated_at",
    "TEXT DEFAULT ''"
  );

  // Create indexes only after checking the relevant columns.
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_users_hospital_role
      ON users(hospital, role);

    CREATE INDEX IF NOT EXISTS idx_connections_senior
      ON connections(senior_id, status);

    CREATE INDEX IF NOT EXISTS idx_connections_intern
      ON connections(intern_id, status);

    CREATE INDEX IF NOT EXISTS idx_notifications_user
      ON notifications(user_id, is_read);
  `);

  if (
    columns("tasks").includes("assigned_to") &&
    columns("tasks").includes("status")
  ) {
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to
      ON tasks(assigned_to, status);
    `);
  }

  console.log("Database initialization completed.");
}

module.exports = {
  db,
  initializeDatabase
};

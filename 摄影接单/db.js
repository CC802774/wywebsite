// 数据库：使用 Node 22+ 内置的 node:sqlite（无需原生编译）
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'app.db'));
db.exec('PRAGMA journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL,
    title TEXT,
    description TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
  );
  CREATE TABLE IF NOT EXISTS availability (
    sunday_date TEXT PRIMARY KEY,
    is_open INTEGER NOT NULL DEFAULT 1,
    note TEXT,
    updated_at TEXT DEFAULT (datetime('now', 'localtime'))
  );
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sunday_date TEXT NOT NULL,
    customer_name TEXT,
    phone TEXT NOT NULL,
    wechat TEXT NOT NULL,
    note TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
  );
`);

module.exports = db;

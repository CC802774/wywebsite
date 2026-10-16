// 摄影接单网站后端（使用 Node 22+ 内置 sqlite，零原生依赖）
const fs = require('fs');
const path = require('path');

// 最简 .env 解析（避免引入 dotenv 依赖）
(function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    if (process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
  }
})();

const express = require('express');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const crypto = require('crypto');
const db = require('./db');

const PORT = parseInt(process.env.PORT || '3000', 10);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const SESSION_SECRET = process.env.SESSION_SECRET || 'please-change-me';

const app = express();
const UPLOADS_DIR = path.join(__dirname, 'uploads', 'photos');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// 中间件
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser(SESSION_SECRET));
app.use('/uploads', express.static(UPLOADS_DIR, { maxAge: '7d' }));
app.use(express.static(path.join(__dirname, 'public')));

// Multer 配置：照片上传
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    const id = crypto.randomBytes(8).toString('hex');
    cb(null, `${Date.now()}-${id}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
  fileFilter: (req, file, cb) => {
    if (!/^image\/(jpe?g|png|webp|gif|avif)$/i.test(file.mimetype)) {
      return cb(new Error('只支持图片格式'));
    }
    cb(null, true);
  }
});

// 管理员鉴权：基于 cookie 的简单 token（HMAC）
function sign(value) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(value).digest('hex');
}
function isAdmin(req) {
  const v = req.signedCookies?.admin;
  return v && sign('ok') === v;
}
function requireAdmin(req, res, next) {
  if (isAdmin(req)) return next();
  return res.status(401).json({ error: '未登录或登录已过期' });
}

// 工具：未来所有周日，直到 endDate（默认 2027-12-31，即 2027 年最后一个周日 2027-12-26）
function upcomingSundays(endDate) {
  // 默认到 2027 年最后一个周日（2027-12-26）。可传入自定义 endDate 字符串 YYYY-MM-DD
  const DEFAULT_END = '2027-12-31';
  const out = [];
  const now = new Date();
  const day = now.getDay(); // 0=Sun
  const offsetToSunday = (7 - day) % 7;
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() + offsetToSunday);
  const end = new Date((endDate || DEFAULT_END) + 'T00:00:00');
  const d = new Date(start);
  while (d <= end) {
    out.push(toISODate(d));
    d.setDate(d.getDate() + 7);
  }
  return out;
}
function toISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// === 公共 API ===

// 公开：作品列表
app.get('/api/photos', (req, res) => {
  const rows = db.prepare('SELECT id, filename, title, description FROM photos ORDER BY sort_order ASC, id ASC').all();
  res.json(rows.map(r => ({ ...r, url: `/uploads/photos/${r.filename}` })));
});

// 公开：未来周日的可接单状态（合并 availability + 已有订单）
app.get('/api/sundays', (req, res) => {
  const dates = upcomingSundays();
  const availRows = db.prepare('SELECT sunday_date, is_open, note FROM availability WHERE sunday_date IN (' + dates.map(() => '?').join(',') + ')').all(...dates);
const orderRows = db.prepare('SELECT sunday_date FROM orders WHERE status IN (\'pending\',\'confirmed\') AND sunday_date IN (' + dates.map(() => '?').join(',') + ')').all(...dates);
  const availMap = Object.fromEntries(availRows.map(r => [r.sunday_date, r]));
  const takenSet = new Set(orderRows.map(r => r.sunday_date));
  const list = dates.map(d => {
    const a = availMap[d];
    const isOpen = a ? a.is_open === 1 : true; // 默认开放
    return {
      date: d,
      is_open: isOpen,
      taken: takenSet.has(d),
      note: a?.note || ''
    };
  });
  res.json(list);
});

// 公开：下单
app.post('/api/orders', (req, res) => {
  const { sunday_date, customer_name, phone, wechat, note } = req.body || {};
  if (!sunday_date || !phone || !wechat) {
    return res.status(400).json({ error: '请填写接单日期、手机号和微信号' });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sunday_date)) {
    return res.status(400).json({ error: '日期格式不正确' });
  }
  if (!/^[\d\s\-+()]{7,20}$/.test(String(phone).trim())) {
    return res.status(400).json({ error: '手机号格式不正确' });
  }
  if (String(wechat).trim().length < 3) {
    return res.status(400).json({ error: '请填写有效的微信号' });
  }
  // 检查是否周日
  const d = new Date(sunday_date + 'T00:00:00');
  if (d.getDay() !== 0) return res.status(400).json({ error: '只能选择周日接单' });

  // 检查是否可接单
  const av = db.prepare('SELECT is_open FROM availability WHERE sunday_date = ?').get(sunday_date);
  const isOpen = av ? av.is_open === 1 : true;
  if (!isOpen) return res.status(400).json({ error: '该日期摄影师已设置为休息' });

  // 检查是否已被预约
const existing = db.prepare('SELECT id FROM orders WHERE sunday_date = ? AND status IN (\'pending\',\'confirmed\')').get(sunday_date);
  if (existing) return res.status(409).json({ error: '该周日已被预约，请选择其他周日' });

  const info = db.prepare(
    'INSERT INTO orders (sunday_date, customer_name, phone, wechat, note) VALUES (?, ?, ?, ?, ?)'
  ).run(sunday_date, (customer_name || '').trim(), String(phone).trim(), String(wechat).trim(), (note || '').trim());

  res.json({ ok: true, id: info.lastInsertRowid });
});

// === 后台 API ===

// 后台登录
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body || {};
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: '密码错误' });
  }
  res.cookie('admin', sign('ok'), { signed: true, httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000 });
  res.json({ ok: true });
});

app.post('/api/admin/logout', (req, res) => {
  res.clearCookie('admin');
  res.json({ ok: true });
});

app.get('/api/admin/me', (req, res) => {
  res.json({ logged_in: isAdmin(req) });
});

// 后台上传照片
app.post('/api/admin/photos', requireAdmin, upload.single('photo'), (req, res) => {
  const { title = '', description = '' } = req.body || {};
  if (!req.file) return res.status(400).json({ error: '未收到文件' });
  const maxSort = db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM photos').get().m;
  const info = db.prepare('INSERT INTO photos (filename, title, description, sort_order) VALUES (?, ?, ?, ?)').run(
    req.file.filename,
    title,
    description,
    maxSort + 1
  );
  res.json({ ok: true, id: info.lastInsertRowid, filename: req.file.filename });
});

// 后台更新照片信息（标题、描述、排序）
app.put('/api/admin/photos/:id', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { title, description, sort_order } = req.body || {};
  const photo = db.prepare('SELECT * FROM photos WHERE id = ?').get(id);
  if (!photo) return res.status(404).json({ error: '照片不存在' });
  db.prepare('UPDATE photos SET title = COALESCE(?, title), description = COALESCE(?, description), sort_order = COALESCE(?, sort_order) WHERE id = ?')
    .run(title ?? null, description ?? null, sort_order ?? null, id);
  res.json({ ok: true });
});

// 后台删除照片
app.delete('/api/admin/photos/:id', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const photo = db.prepare('SELECT * FROM photos WHERE id = ?').get(id);
  if (!photo) return res.status(404).json({ error: '照片不存在' });
  const filepath = path.join(UPLOADS_DIR, photo.filename);
  db.prepare('DELETE FROM photos WHERE id = ?').run(id);
  if (fs.existsSync(filepath)) {
    try { fs.unlinkSync(filepath); } catch (e) {}
  }
  res.json({ ok: true });
});

// 后台获取排期
app.get('/api/admin/availability', requireAdmin, (req, res) => {
  const dates = upcomingSundays();
  const rows = db.prepare('SELECT sunday_date, is_open, note FROM availability WHERE sunday_date IN (' + dates.map(() => '?').join(',') + ')').all(...dates);
  const map = Object.fromEntries(rows.map(r => [r.sunday_date, r]));
  const list = dates.map(d => ({
    date: d,
    is_open: map[d] ? map[d].is_open === 1 : true,
    note: map[d]?.note || ''
  }));
  res.json(list);
});

// 后台更新某个周日的排期
app.put('/api/admin/availability/:date', requireAdmin, (req, res) => {
  const date = req.params.date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: '日期格式不正确' });
  const d = new Date(date + 'T00:00:00');
  if (d.getDay() !== 0) return res.status(400).json({ error: '只能设置周日' });
  const { is_open, note } = req.body || {};
  db.prepare(`
    INSERT INTO availability (sunday_date, is_open, note, updated_at)
    VALUES (?, ?, ?, datetime('now', 'localtime'))
    ON CONFLICT(sunday_date) DO UPDATE SET
      is_open = excluded.is_open,
      note = excluded.note,
      updated_at = excluded.updated_at
  `).run(date, is_open === false ? 0 : 1, (note || '').trim());
  res.json({ ok: true });
});

// 后台查看订单
app.get('/api/admin/orders', requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT id, sunday_date, customer_name, phone, wechat, note, status, created_at FROM orders ORDER BY id DESC').all();
  res.json(rows);
});

// 后台更新订单状态
app.put('/api/admin/orders/:id', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { status } = req.body || {};
  if (!['pending', 'confirmed', 'done', 'cancelled'].includes(status)) {
    return res.status(400).json({ error: '状态值不正确' });
  }
  const r = db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, id);
  if (r.changes === 0) return res.status(404).json({ error: '订单不存在' });
  res.json({ ok: true });
});

// 后台删除订单
app.delete('/api/admin/orders/:id', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const r = db.prepare('DELETE FROM orders WHERE id = ?').run(id);
  if (r.changes === 0) return res.status(404).json({ error: '订单不存在' });
  res.json({ ok: true });
});

// 全局错误处理
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || '服务器错误' });
});

app.listen(PORT, () => {
  console.log(`\n  摄影接单网站已启动`);
  console.log(`  访问地址: http://localhost:${PORT}`);
  console.log(`  后台入口: http://localhost:${PORT}/admin.html`);

});

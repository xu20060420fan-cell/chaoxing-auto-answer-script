/**
 * 题库沉淀采集器
 * ----------------
 * 用途：把刷课脚本运行中遇到的题目 + 正确答案回写到本地题库，长期积累。
 * 用法：
 *   1. 脚本端答题成功后 POST 到本服务：
 *      POST /api/collect
 *      {
 *        "question": "题目原文",
 *        "options":   ["选项A文本", "选项B文本", "选项C文本"],
 *        "type":      "单选题",          // 单选题/多选题/判断题/填空题/简答题
 *        "answer":    ["答案A文本"],    // 存文本答案，不存字母
 *        "source":    "计算机网络"       // 课程名/来源
 *      }
 *   2. 启动：node tools/log2tiku.js
 *
 * 注意：本工具只做"自己数据的沉淀"，不破解第三方题库。
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const POOL_FILE = path.join(DATA_DIR, 'pool.json');

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(POOL_FILE)) fs.writeFileSync(POOL_FILE, '[]');
}

function loadPool() {
  ensureDir();
  try { return JSON.parse(fs.readFileSync(POOL_FILE, 'utf-8')); }
  catch { return []; }
}

function savePool(pool) {
  fs.writeFileSync(POOL_FILE, JSON.stringify(pool, null, 2));
}

function normalize(text) {
  return String(text || '')
    .replace(/[\s　]+/g, ' ')
    .replace(/[，,。；;：:！!？?“”‘’""'']/g, '')
    .trim()
    .toLowerCase();
}

function hashQuestion(q, t) {
  return normalize(q + (t || ''));
}

function add(pool, item) {
  const q = String(item.question || '').trim();
  const type = String(item.type || '单选题').trim();
  if (!q) return { ok: false, msg: 'question empty' };

  const options = (item.options || []).map(o => String(o).trim()).filter(Boolean);
  const answer = (item.answer || []).map(a => String(a).trim()).filter(Boolean);

  const key = hashQuestion(q, type);
  const idx = pool.findIndex(p => hashQuestion(p.question, p.type) === key);

  const entry = {
    id: idx >= 0 ? pool[idx].id : Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    question: q,
    type,
    options,
    answer,
    source: item.source || '',
    updatedAt: Date.now()
  };

  if (idx >= 0) {
    // 合并答案：保留更多答案来源
    const old = pool[idx];
    const merged = new Set([...old.answer, ...answer]);
    entry.answer = Array.from(merged);
    pool[idx] = entry;
    return { ok: true, action: 'update', id: entry.id };
  }
  pool.push(entry);
  return { ok: true, action: 'add', id: entry.id };
}

function exportToTikuCSV(pool, outPath) {
  // 导出为 server.js 可导入的 CSV 格式
  const lines = pool.map(p => {
    const typeMap = { '单选题': 'single', '多选题': 'multi', '判断题': 'judge', '填空题': 'fill', '简答题': 'fill' };
    const t = typeMap[p.type] || 'single';
    return `${p.question}\t${p.options.join(',')}\t${p.answer.join('|')}\t${t}\t${p.source}`;
  });
  fs.writeFileSync(outPath, `question\toptions\tanswer\ttype\tsource\n` + lines.join('\n'));
}

// 如果直接运行，起一个 HTTP 服务
if (require.main === module) {
  const http = require('http');
  const PORT = process.env.TIKU_LOG_PORT || 8092;

  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    if (req.url === '/api/collect' && req.method === 'POST') {
      let body = '';
      req.on('data', d => body += d);
      req.on('end', () => {
        try {
          const item = JSON.parse(body);
          const pool = loadPool();
          const r = add(pool, item);
          savePool(pool);
          res.end(JSON.stringify(r));
        } catch (e) {
          res.statusCode = 400;
          res.end(JSON.stringify({ ok: false, msg: e.message }));
        }
      });
    } else if (req.url === '/api/pool' && req.method === 'GET') {
      res.end(JSON.stringify({ total: loadPool().length }));
    } else {
      res.statusCode = 404;
      res.end(JSON.stringify({ ok: false }));
    }
  });

  server.listen(PORT, () => {
    console.log(`[log2tiku] 题库采集服务已启动: http://localhost:${PORT}`);
  });
}

module.exports = { add, loadPool, savePool, exportToTikuCSV };

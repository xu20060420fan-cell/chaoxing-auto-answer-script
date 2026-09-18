'use strict';

/**
 * 刷课脚本 · 远程题库服务（多源聚合版）
 * ----------------------------------------------------------------
 * 对外协议（兼容脚本 querySingleTiku 的 tikuAdapter 约定）：
 *   POST /tiku            body: { question, options:[...], type }
 *                         -> 命中: { code:1, answer:{ allAnswer:[...] } }
 *                         -> 未命中: { code:0, msg:'not found' }
 *
 *   allAnswer 形状（脚本 extractAnswerFromTiku 支持）：
 *     单选  ['A']
 *     多选  ['A','B']
 *     判断  ['正确'] / ['错误']
 *     填空  ['答案文字']
 *
 * 新增能力：
 *   - 本地题库优先匹配
 *   - 未命中时并发查询配置的远程题库源
 *   - 仍无命中且题型为填空/简答/论述时 fallback 到 LLM
 *   - 远程源管理接口 /api/sources
 *
 * 管理接口（写操作可用环境变量 TIKU_ADMIN_KEY 做简单鉴权）：
 *   GET  /api/health /api/stats /api/search?q= /api/q
 *   POST /api/add  /api/bulk  /api/collect
 *   PUT  /api/q/:id   DELETE /api/q/:id
 *   GET  /             -> 管理后台
 * ----------------------------------------------------------------
 */

const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');

const { TikuStore } = require('./lib/store');
const { similarity, lettersOf, normalize, typeKey, compatible, remapAnswerByText } = require('./lib/matcher');
const { importFile } = require('./lib/importer');
const { queryAllRemote, loadRemoteSources, saveRemoteSources } = require('./lib/adapters');

const PORT = Number(process.env.PORT || 8091);
const HOST = process.env.HOST || '0.0.0.0';
const ADMIN_KEY = process.env.TIKU_ADMIN_KEY || '';
// 命中阈值：低于该相似度视为"不确定"，返回未命中，让脚本回退到 AI，避免给错答案
const MIN_SCORE = Number(process.env.MIN_SCORE || 0.55);
const AMBIGUITY_GAP = Number(process.env.AMBIGUITY_GAP || 0.03);

const store = new TikuStore();

// ---------- 首次启动自动导入 seed 目录 ----------
function autoSeed() {
  if (store.count() > 0) return 0;
  const seedDir = path.join(__dirname, 'seed');
  if (!fs.existsSync(seedDir)) return 0;
  let n = 0;
  for (const f of fs.readdirSync(seedDir)) {
    if (/\.(csv|tsv|txt|json)$/i.test(f)) {
      try {
        const r = importFile(store, path.join(seedDir, f), null, path.basename(f));
        n += r.added + r.merged;
        console.log(`[tiku] 自动导入种子题库 ${f}: +${r.added} 合并${r.merged}`);
      } catch (e) {
        console.error(`[tiku] 导入 ${f} 失败:`, e.message);
      }
    }
  }
  if (n > 0) store.save();
  return n;
}

// ---------- 远程源示例配置模板 ----------
function ensureRemoteSourcesExample() {
  const file = path.join(__dirname, 'data', 'remote-sources.example.json');
  if (fs.existsSync(file)) return;
  const example = {
    "_说明": "把本文件复制为 remote-sources.json 并填入真实地址后生效；server 重启时自动加载",
    "tikuA": {
      "enabled": true,
      "protocol": "tikuAdapter",
      "url": "https://example.com/tiku",
      "timeout": 5000,
      "headers": {},
      "note": "通用 tikuAdapter 协议"
    },
    "enncy": {
      "enabled": false,
      "protocol": "enncy",
      "url": "https://example.com/api",
      "token": "YOUR_TOKEN",
      "timeout": 5000,
      "note": "enncy 协议"
    }
  };
  fs.writeFileSync(file, JSON.stringify(example, null, 2));
}

// ---------- LLM fallback（填空/简答/论述） ----------
const LLM_CFG = {
  apiKey: process.env.OPENAI_API_KEY || '',
  baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com',
  model: process.env.LLM_MODEL || 'gpt-4o-mini',
  enabled: process.env.LLM_ENABLED === '1' || process.env.LLM_ENABLED === 'true'
};

async function llmFallback(question, type) {
  if (!LLM_CFG.enabled || !LLM_CFG.apiKey) return null;
  const prompt = `请直接给出下列网课题目的答案，只输出答案本身，不要解释。\n题型：${type}\n题目：${question}\n答案：`;
  try {
    const https = require('https');
    const url = new URL('/v1/chat/completions', LLM_CFG.baseURL);
    const body = JSON.stringify({
      model: LLM_CFG.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0
    });
    const res = await new Promise((resolve, reject) => {
      const req = https.request(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${LLM_CFG.apiKey}`
        }
      }, (r) => {
        let d = '';
        r.on('data', c => d += c);
        r.on('end', () => {
          try { resolve(JSON.parse(d)); }
          catch (e) { resolve({ error: d }); }
        });
      });
      req.on('error', reject);
      req.setTimeout(10000, () => req.destroy());
      req.write(body);
      req.end();
    });
    const text = res.choices && res.choices[0] && res.choices[0].message && res.choices[0].message.content;
    if (!text) return null;
    const ans = text.trim().replace(/^(答案[：:]\s*)/, '');
    if (!ans) return null;
    return { allAnswer: [ans], score: 0.5, source: `LLM:${LLM_CFG.model}` };
  } catch (e) {
    return null;
  }
}

// ---------- 匹配 ----------
function buildAllAnswer(entry, queryType, queryOptions) {
  const type = queryType || entry.type || '';
  const ans = entry.answer || '';
  const letters = lettersOf(ans);
  const tkey = typeKey(type);

  if (tkey === 'judge') {
    return [ans === '错' ? '错误' : '正确'];
  }
  if (tkey === 'fill') {
    return [ans];
  }
  if (letters && letters.length) {
    // 关键：把题库答案按「选项文字」重映射到真实题面的选项顺序，
    // 避免"题库选项顺序 vs 题面选项顺序不一致"时字母错位给错答案。
    const remapped = remapAnswerByText(ans, entry.options, queryOptions);
    if (remapped && remapped.length) {
      const optCount = Array.isArray(queryOptions) && queryOptions.length
        ? queryOptions.length
        : (entry.options && entry.options.length ? entry.options.length : null);
      let out = remapped;
      if (optCount != null && optCount > 0) {
        const max = optCount - 1;
        out = remapped.filter(L => (L.charCodeAt(0) - 65) <= max);
        if (!out.length) out = remapped; // 兜底：交由脚本侧容错
      }
      return out;
    }
    // 无选项信息时保持原字母
    return letters;
  }
  return [ans];
}

// 返回 { allAnswer, score, id, source } 或 null
function searchTiku(question, options, type) {
  if (!question || !String(question).trim()) return null;
  const qKey = normalize(question);
  const qt = typeKey(type);

  const candidates = [];
  const exact = store.findExact(qKey);

  const consider = (e, isExact) => {
    const et = typeKey(e.type);
    const comp = compatible(qt, et);
    if (comp === 'reject') return; // 判断/填空 ↔ 选择题，禁止跨界
    let s;
    if (isExact) {
      s = 1;
    } else {
      s = similarity(question, e.question);
      if (s <= 0) return;
      if (comp === 'penalty') s *= 0.55;
      else if (qt && et === qt) s += 0.02;
      s = Math.min(s, 1);
    }
    candidates.push({ e, score: s, sameType: !!(qt && et === qt) });
  };

  if (exact.length) {
    for (const e of exact) consider(e, true);
  }
  // 精确命中全被拒绝（题型不兼容）时，退回全量模糊匹配兜底
  if (!candidates.length) {
    for (const e of store.all()) consider(e, false);
  }

  candidates.sort((a, b) => b.score - a.score);

  // 同题型优先：只要存在同题型候选，就只在其内部挑选，避免跨题型抢答
  const same = candidates.filter(c => c.sameType);
  const pool = same.length ? same : candidates;

  let top = null;
  let topScore = 0;
  let topAnswer = null;
  let rivalScore = 0;
  let rivalAnswer = null;

  for (const c of pool) {
    if (c.score < MIN_SCORE) break;
    const ans = buildAllAnswer(c.e, type, options);
    if (!ans || !ans.length) continue;
    const ansKey = ans.join('');
    if (!top) { top = c; topScore = c.score; topAnswer = ansKey; continue; }
    if (ansKey === topAnswer) continue;
    if (!rivalAnswer) { rivalScore = c.score; rivalAnswer = ansKey; }
    break;
  }

  if (!top) return null;
  // 最优/次优答案分差过小 → 题干区分度不足，判定歧义，宁可弃答
  if (rivalAnswer && rivalAnswer !== topAnswer && (topScore - rivalScore) < AMBIGUITY_GAP) {
    return null;
  }

  const allAnswer = buildAllAnswer(top.e, type, options);
  if (!allAnswer || !allAnswer.length) return null;

  top.e.count = (top.e.count || 0) + 1;
  return { allAnswer, score: Math.round(topScore * 1000) / 1000, id: top.e.id, source: top.e.source || '' };
}

// 聚合查询：本地 -> 远程源 -> LLM fallback
async function queryTiku(question, options, type) {
  // 1) 本地题库
  let r = searchTiku(question, options, type);
  if (r) return { code: 1, answer: { allAnswer: r.allAnswer }, score: r.score, source: r.source };

  // 2) 远程题库源
  r = await queryAllRemote({ question, options, type });
  if (r) return { code: 1, answer: { allAnswer: r.allAnswer }, score: r.score, source: r.source };

  // 3) LLM fallback（仅主观题）
  const tkey = typeKey(type);
  if (tkey === 'fill') {
    r = await llmFallback(question, type);
    if (r) return { code: 1, answer: { allAnswer: r.allAnswer }, score: r.score, source: r.source };
  }

  return { code: 0, msg: 'not found' };
}

// ---------- HTTP ----------
const app = express();
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.text({ type: ['text/plain', 'application/x-www-form-urlencoded'] }));

function adminAuthorized(req, res) {
  if (!ADMIN_KEY) return true;
  const key = req.get('x-admin-key') || req.query.adminKey || '';
  if (key === ADMIN_KEY) return true;
  res.status(401).json({ code: 0, msg: 'unauthorized' });
  return false;
}

// 解析请求参数：优先 JSON body，其次 query string（支持 options 传 JSON 数组字符串）
function parseQueryInput(req) {
  let body = req.body;
  if (body && typeof body === 'object' && !Array.isArray(body) && ('question' in body || 'options' in body || 'type' in body)) {
    // JSON body 原样
  } else {
    body = req.query || {};
  }
  let options = body.options;
  if (typeof options === 'string' && options.trim().startsWith('[')) {
    try { options = JSON.parse(options); } catch (e) { options = String(options).split('\n'); }
  }
  if (typeof options === 'string') options = String(options).split('\n').map(s => s.trim()).filter(Boolean);
  if (!Array.isArray(options)) options = [];
  return {
    question: String(body.question || body.title || '').trim(),
    options: options.map(o => (o && typeof o === 'object' ? (o.text || o.value || '') : String(o))).filter(Boolean),
    type: String(body.type || '')
  };
}

// 核心答题接口（兼容脚本在 URL 后追加的 wannengDisable=1 等参数，忽略即可）
async function handleTiku(req, res) {
  const { question, options, type } = parseQueryInput(req);
  const result = await queryTiku(question, options, type);
  res.json(result);
}
app.post('/tiku', handleTiku);
app.post('/api/tiku', handleTiku);
app.get('/tiku', handleTiku);
app.get('/api/tiku', handleTiku);

// 远程源代理：POST /proxy/:name
app.post('/proxy/:name', async (req, res) => {
  const sources = loadRemoteSources();
  const name = req.params.name;
  if (!sources[name]) return res.status(404).json({ code: 0, msg: 'source not found' });
  const { callRemote } = require('./lib/adapters');
  const { question, options, type } = parseQueryInput(req);
  try {
    const r = await callRemote(name, { question, options, type });
    if (!r) return res.json({ code: 0, msg: 'not found' });
    res.json({ code: 1, answer: { allAnswer: r.allAnswer }, source: r.source });
  } catch (e) {
    res.status(500).json({ code: 0, msg: e.message });
  }
});

// 远程源管理
app.get('/api/sources', (req, res) => {
  res.json({ code: 1, items: loadRemoteSources() });
});

app.post('/api/sources', (req, res) => {
  if (!adminAuthorized(req, res)) return;
  const b = req.body || {};
  const name = String(b.name || '').trim();
  if (!name) return res.status(400).json({ code: 0, msg: 'name required' });
  if (!b.url) return res.status(400).json({ code: 0, msg: 'url required' });
  const sources = loadRemoteSources();
  sources[name] = {
    enabled: b.enabled !== false,
    protocol: b.protocol || 'tikuAdapter',
    url: b.url,
    timeout: Number(b.timeout || 5000),
    headers: b.headers || {},
    token: b.token || '',
    extractor: b.extractor || '',
    note: b.note || ''
  };
  saveRemoteSources(sources);
  res.json({ code: 1, name, item: sources[name] });
});

app.delete('/api/sources/:name', (req, res) => {
  if (!adminAuthorized(req, res)) return;
  const sources = loadRemoteSources();
  delete sources[req.params.name];
  saveRemoteSources(sources);
  res.json({ code: 1 });
});

app.get('/api/health', (req, res) => {
  res.json({ code: 1, ok: true, total: store.count(), uptime: process.uptime() });
});

app.get('/api/stats', (req, res) => {
  const byType = {};
  let withAnswer = 0;
  for (const q of store.all()) {
    const k = typeKey(q.type) || 'unknown';
    byType[k] = (byType[k] || 0) + 1;
    if (q.answer) withAnswer++;
  }
  const sources = Object.keys(loadRemoteSources()).length;
  res.json({
    code: 1,
    total: store.count(),
    withAnswer,
    byType,
    remoteSources: sources,
    llmEnabled: LLM_CFG.enabled && !!LLM_CFG.apiKey,
    updatedAt: store.data.meta && store.data.meta.updatedAt,
    minScore: MIN_SCORE
  });
});

// 管理后台：模糊搜索预览（不设阈值，返回带分数排序）
app.get('/api/search', (req, res) => {
  const q = String(req.query.q || '').trim();
  const limit = Math.min(Number(req.query.limit || 20), 200);
  if (!q) return res.json({ code: 1, items: [] });
  const qKey = normalize(q);
  const list = [];
  const exact = store.findExact(qKey);
  for (const e of exact) list.push({ ...e, score: 1 });
  for (const e of store.all()) {
    if (list.some(x => x.id === e.id)) continue;
    const s = similarity(q, e.question);
    if (s > 0.3) list.push({ ...e, score: Math.round(s * 1000) / 1000 });
  }
  list.sort((a, b) => b.score - a.score);
  res.json({ code: 1, items: list.slice(0, limit) });
});

// 分页列表
app.get('/api/q', (req, res) => {
  const page = Math.max(Number(req.query.page || 1), 1);
  const pageSize = Math.min(Number(req.query.pageSize || 50), 500);
  let list = store.all();
  const kw = String(req.query.q || '').trim();
  if (kw) {
    const k = normalize(kw);
    list = list.filter(q => normalize(q.question).includes(k));
  }
  const total = list.length;
  const start = (page - 1) * pageSize;
  res.json({ code: 1, total, page, pageSize, items: list.slice(start, start + pageSize) });
});

app.post('/api/add', (req, res) => {
  if (!adminAuthorized(req, res)) return;
  const b = req.body || {};
  const question = String(b.question || '').trim();
  const answer = String(b.answer || '').trim();
  if (!question || !answer) return res.status(400).json({ code: 0, msg: 'question/answer 必填' });
  let options = b.options;
  if (typeof options === 'string') options = (require('./lib/importer').parseOptions)(options);
  const r = store.upsert({ question, type: b.type || '', options: options || null, answer, source: b.source || 'admin' });
  store.save();
  res.json({ code: 1, ...r });
});

// 批量导入：接受 {items:[...]} 或 {text:'...'} 或 {format, text} / 原始 JSON 数组
app.post('/api/bulk', (req, res) => {
  if (!adminAuthorized(req, res)) return;
  const b = req.body || {};
  const { parseTSV, parseJSON, parsePlainText } = require('./lib/importer');
  let entries = [];
  const bodyIsText = typeof req.body === 'string';
  if (Array.isArray(b) && !Array.isArray(req.body)) {
    // req.body 是数组（JSON 数组直接 POST）
    entries = parseJSON(JSON.stringify(req.body));
  } else if (Array.isArray(b.items)) {
    entries = parseJSON(JSON.stringify(b.items));
  } else if (bodyIsText || typeof b.text === 'string') {
    const txt = bodyIsText ? req.body : b.text;
    const fmt = b.format || 'auto';
    if (fmt === 'json') entries = parseJSON(txt);
    else if (fmt === 'text') entries = parsePlainText(txt);
    else if (txt.trim().startsWith('[') || txt.trim().startsWith('{')) entries = parseJSON(txt);
    else if (/^题型[\t,]/m.test(txt)) entries = parseTSV(txt);
    else entries = parsePlainText(txt);
  } else {
    return res.status(400).json({ code: 0, msg: '请提供 items 数组或 text 字段' });
  }
  let added = 0, merged = 0;
  for (const e of entries) {
    const r = store.upsert({
      question: e.question,
      type: e.type || '',
      options: e.options || null,
      answer: e.answer,
      source: e.source || 'bulk'
    });
    if (r.action === 'added') added++; else if (r.action === 'merged') merged++;
  }
  store.save();
  res.json({ code: 1, added, merged, total: store.count() });
});

// 答题成功后回写题目（沉淀池）
app.post('/api/collect', (req, res) => {
  const b = req.body || {};
  const question = String(b.question || '').trim();
  const answer = String(b.answer || '').trim();
  if (!question || !answer) return res.status(400).json({ code: 0, msg: 'question/answer 必填' });
  let options = b.options;
  if (typeof options === 'string') options = (require('./lib/importer').parseOptions)(options);
  const r = store.upsert({
    question,
    type: b.type || '',
    options: options || null,
    answer,
    source: b.source || 'collect'
  });
  store.save();
  res.json({ code: 1, ...r });
});

app.put('/api/q/:id', (req, res) => {
  if (!adminAuthorized(req, res)) return;
  const b = req.body || {};
  const ok = store.update(req.params.id, {
    question: b.question,
    type: b.type,
    options: b.options,
    answer: b.answer,
    source: b.source
  });
  if (!ok) return res.status(404).json({ code: 0, msg: 'not found' });
  store.save();
  res.json({ code: 1 });
});

app.delete('/api/q/:id', (req, res) => {
  if (!adminAuthorized(req, res)) return;
  const ok = store.remove(req.params.id);
  if (!ok) return res.status(404).json({ code: 0, msg: 'not found' });
  store.save();
  res.json({ code: 1 });
});

// 管理后台页面
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

// ---------- 启动 ----------
autoSeed();
ensureRemoteSourcesExample();

app.listen(PORT, HOST, () => {
  const remoteCount = Object.values(loadRemoteSources()).filter(s => s.enabled).length;
  console.log('====================================================');
  console.log('  刷课题库聚合服务已启动');
  console.log(`  地址:        http://localhost:${PORT}`);
  console.log(`  答题接口:    POST http://localhost:${PORT}/tiku`);
  console.log(`  管理后台:    http://localhost:${PORT}/`);
  console.log(`  题库总量:    ${store.count()}`);
  console.log(`  远程源:      ${remoteCount} 个启用`);
  console.log(`  LLM fallback: ${LLM_CFG.enabled && !!LLM_CFG.apiKey ? '已启用' : '未启用（需 OPENAI_API_KEY）'}`);
  console.log('====================================================');
});

// 多源远程题库适配器
// 支持 tikuAdapter、enncy、通用 JSON 等常见协议
// 用法：const { callRemote } = require('./lib/adapters');
//        const result = await callRemote('mySource', { question, options, type });

const http = require('http');
const https = require('https');
const url = require('url');

// 读取持久化的远程源配置
function loadRemoteSources() {
  try {
    const fs = require('fs');
    const path = require('path');
    const file = path.join(__dirname, '..', 'data', 'remote-sources.json');
    if (!fs.existsSync(file)) return {};
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch (e) {
    return {};
  }
}

function saveRemoteSources(sources) {
  const fs = require('fs');
  const path = require('path');
  const file = path.join(__dirname, '..', 'data', 'remote-sources.json');
  fs.writeFileSync(file, JSON.stringify(sources, null, 2));
}

// 通用 HTTP 请求封装
function request(targetUrl, options = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(targetUrl);
    const client = parsed.protocol === 'https:' ? https : http;
    const req = client.request(parsed, { method: options.method || 'GET', headers: options.headers || {} }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: data ? JSON.parse(data) : null }); }
        catch (e) { resolve({ status: res.statusCode, data: data }); }
      });
    });
    req.on('error', reject);
    req.setTimeout(options.timeout || 5000, () => { req.destroy(); reject(new Error('timeout')); });
    if (options.body) req.write(options.body);
    req.end();
  });
}

// 标准化题型：把脚本传的中文题型统一成内部 key
function normalizeType(type) {
  if (!type) return 'single';
  const t = String(type).toLowerCase();
  if (/多选/.test(t)) return 'multi';
  if (/判断|对|错/.test(t)) return 'judge';
  if (/填|简答|论述/.test(t)) return 'fill';
  return 'single';
}

// 内置适配器
const BUILTIN = {
  // tikuAdapter 协议：POST ?wannengDisable=1  body={question,options,type}
  tikuAdapter(source, payload) {
    const q = new URLSearchParams();
    q.append('wannengDisable', '1');
    const body = JSON.stringify({
      question: payload.question,
      options: payload.options || [],
      type: payload.type
    });
    return request(source.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(source.headers || {}) },
      body,
      timeout: source.timeout || 5000
    });
  },

  // enncy 协议：GET ?question=...
  enncy(source, payload) {
    const q = new URLSearchParams();
    q.append('question', payload.question);
    if (source.token) q.append('token', source.token);
    return request(`${source.url}?${q.toString()}`, {
      method: 'GET',
      headers: source.headers || {},
      timeout: source.timeout || 5000
    });
  },

  // 通用 JSON 协议：body 按 source.data 模板渲染
  json(source, payload) {
    const bodyTpl = source.data || { question: '${question}', type: '${type}' };
    const ctx = { question: payload.question, options: payload.options || [], type: payload.type };
    const body = JSON.parse(JSON.stringify(bodyTpl).replace(/\$\{(\w+)\}/g, (_, k) => ctx[k] ?? ''));
    return request(source.url, {
      method: source.method || 'POST',
      headers: { 'Content-Type': 'application/json', ...(source.headers || {}) },
      body: JSON.stringify(body),
      timeout: source.timeout || 5000
    });
  }
};

// 从响应里提取答案，适配多种返回格式
function extractAnswer(source, raw) {
  if (!raw || typeof raw !== 'object') return null;
  // 1. 标准格式 { answer: { allAnswer: [...] } }
  if (raw.answer && Array.isArray(raw.answer.allAnswer) && raw.answer.allAnswer.length) {
    return raw.answer;
  }
  // 2. tikuAdapter 直接返回 { allAnswer:[...] }
  if (Array.isArray(raw.allAnswer) && raw.allAnswer.length) {
    return { allAnswer: raw.allAnswer };
  }
  // 3. enncy { code:1, data:{ answer:'A' } }
  if (raw.data && raw.data.answer) {
    return { allAnswer: [raw.data.answer] };
  }
  // 4. 自定义 extractor
  if (source.extractor && typeof source.extractor === 'string') {
    try {
      // eslint-disable-next-line no-new-func
      const fn = new Function('raw', source.extractor);
      const res = fn(raw);
      if (res) return { allAnswer: Array.isArray(res) ? res : [res] };
    } catch (e) {}
  }
  return null;
}

// 调用单个远程源
async function callRemote(name, payload) {
  const sources = loadRemoteSources();
  const source = sources[name];
  if (!source) throw new Error(`source not found: ${name}`);
  if (!source.enabled) return null;

  const adapter = BUILTIN[source.protocol] || BUILTIN.json;
  const res = await adapter(source, payload);
  if (!res || res.status >= 400) return null;

  const answer = extractAnswer(source, res.data);
  if (!answer) return null;

  return {
    source: name,
    allAnswer: answer.allAnswer,
    raw: res.data,
    _protocol: source.protocol
  };
}

// 并发调用所有启用的远程源，返回第一个有效答案
async function queryAllRemote(payload) {
  const sources = loadRemoteSources();
  const names = Object.keys(sources).filter(n => sources[n].enabled);
  if (!names.length) return null;

  const tasks = names.map(name =>
    callRemote(name, payload)
      .then(r => ({ status: 'fulfilled', name, value: r }))
      .catch(e => ({ status: 'rejected', name, reason: e.message }))
  );

  const results = await Promise.all(tasks);
  const first = results.find(r => r.status === 'fulfilled' && r.value);
  if (first) {
    return {
      allAnswer: first.value.allAnswer,
      score: 1,
      source: first.value.source,
      _raw: first.value.raw
    };
  }
  return null;
}

module.exports = {
  loadRemoteSources,
  saveRemoteSources,
  callRemote,
  queryAllRemote,
  extractAnswer,
  BUILTIN
};

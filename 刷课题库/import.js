'use strict';

/**
 * 命令行导入工具
 * ----------------------------------------------------------------
 * 用法：
 *   node import.js <文件或目录> [format] [sourceName]
 *   node import.js seed/计算机网络.csv
 *   node import.js 题库.json json
 *   node import.js 题目.txt text
 *
 * 支持格式：tsv/csv（默认）、json、text（纯文本）。目录会递归扫描。
 * 导入是「去重合并」的：同题干已有答案则不覆盖，只补空缺字段。
 *
 * 远程模式（推荐：直接进服务器上的公共题库，不用手传文件）：
 *   node import.js 题库.json json --remote https://xspirt.online/tiku-api --key <管理口令>
 *   （管理口令也可以用环境变量 TIKU_ADMIN_KEY 传，不落在命令行里）
 * ----------------------------------------------------------------
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { TikuStore } = require('./lib/store');
const { importFile } = require('./lib/importer');

const args = process.argv.slice(2);
if (!args.length) {
  console.log('用法: node import.js <文件或目录> [tsv|json|text] [sourceName] [--remote <baseUrl> --key <adminKey>]');
  process.exit(1);
}

function flag(name, dflt) {
  const i = args.indexOf(name);
  return i > -1 && args[i + 1] ? args[i + 1] : dflt;
}

const target = path.resolve(args[0]);
const formatHint = args[1] && !args[1].startsWith('--') ? args[1] : null;
const sourceName = args[2] && !args[2].startsWith('--') ? args[2] : null;
const REMOTE = flag('--remote', '');
const ADMIN_KEY = flag('--key', process.env.TIKU_ADMIN_KEY || '');

const store = new TikuStore();

function collectFiles(p) {
  const st = fs.statSync(p);
  if (st.isFile()) return [p];
  if (st.isDirectory()) {
    const out = [];
    for (const f of fs.readdirSync(p)) {
      const full = path.join(p, f);
      if (/\.(csv|tsv|txt|json)$/i.test(f)) out.push(full);
    }
    return out;
  }
  return [];
}

let files = [];
try {
  files = collectFiles(target);
} catch (e) {
  console.error('无法访问路径:', target, e.message);
  process.exit(1);
}
if (!files.length) {
  console.error('没有找到可导入的文件（.csv/.tsv/.txt/.json）');
  process.exit(1);
}

/* ---------- 远程模式：直接推进服务器上的公共题库 ---------- */
function postJson(url, payload, key) {
  return new Promise((resolve, reject) => {
    let u;
    try { u = new URL(url); } catch (e) { reject(new Error('地址不合法: ' + url)); return; }
    const lib = u.protocol === 'https:' ? https : http;
    const body = JSON.stringify(payload);
    const req = lib.request(u, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'x-admin-key': key || ''
      }
    }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(d || '{}') }); }
        catch (e) { resolve({ status: res.statusCode, body: { raw: d } }); }
      });
    });
    req.on('error', reject);
    req.setTimeout(120000, () => req.destroy(new Error('请求超时')));
    req.write(body);
    req.end();
  });
}

if (REMOTE) {
  if (!ADMIN_KEY) {
    console.error('远程模式需要管理口令：用 --key <口令>，或设置环境变量 TIKU_ADMIN_KEY（不落在命令行里）');
    process.exit(1);
  }
  const base = REMOTE.replace(/\/+$/, '');
  (async () => {
    let added = 0, merged = 0, failed = 0;
    for (const f of files) {
      try {
        const content = fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, '');
        const r = await postJson(base + '/api/bulk', {
          text: content,
          format: formatHint || 'auto',
          source: sourceName || path.basename(f)
        }, ADMIN_KEY);
        if (r.status !== 200 || !r.body || r.body.code !== 1) {
          failed++;
          console.error(`[失败] ${path.basename(f)}: HTTP ${r.status} ${(r.body && (r.body.msg || r.body.message)) || ''}`);
          continue;
        }
        added += r.body.added || 0;
        merged += r.body.merged || 0;
        console.log(`[远程导入] ${path.basename(f)}  新增 ${r.body.added}  合并 ${r.body.merged}  (服务器题库共 ${r.body.total})`);
      } catch (e) {
        failed++;
        console.error(`[失败] ${f}:`, e.message);
      }
    }
    console.log('----------------------------------------');
    console.log(`远程导入完成：新增 ${added}，合并 ${merged}${failed ? '，失败 ' + failed : ''}`);
    process.exit(failed ? 1 : 0);
  })();
} else {
  let totalAdded = 0, totalMerged = 0, totalSkipped = 0, totalRead = 0;
  for (const f of files) {
    try {
      const r = importFile(store, f, formatHint, sourceName || path.basename(f));
      totalAdded += r.added;
      totalMerged += r.merged;
      totalSkipped += r.skipped;
      totalRead += r.total;
      console.log(`[导入] ${path.basename(f)}  新增 ${r.added}  合并 ${r.merged}  跳过 ${r.skipped}  (解析 ${r.total})`);
    } catch (e) {
      console.error(`[失败] ${f}:`, e.message);
    }
  }

  store.save();
  console.log('----------------------------------------');
  console.log(`完成：新增 ${totalAdded}，合并 ${totalMerged}，跳过 ${totalSkipped}`);
  console.log(`题库当前总量：${store.count()}`);
}

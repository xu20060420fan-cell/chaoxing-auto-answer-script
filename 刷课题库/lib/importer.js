'use strict';

/**
 * 题库导入解析器
 * ----------------------------------------------------------------
 * 支持三种格式（按文件扩展名自动识别，也支持手动指定 format）：
 *
 * 1) TSV / CSV（推荐，seed 目录即此格式，UTF-8，制表符分隔）
 *    表头：题型  题目  选项  答案
 *    - 题型：单选题 / 多选题 / 判断题 / 填空题
 *    - 选项：A.xxx || B.xxx || C.xxx || D.xxx  （判断题/填空题留空）
 *    - 答案：单选 C；多选 ABD；判断 对/错；填空 文本（多空用 # 分隔）
 *
 * 2) JSON
 *    - 数组：[{question, type, options:[{letter,text}], answer}]
 *    - 对象：{questions:[...]}
 *
 * 3) 纯文本（多题可混合，空行或"数字."题号分隔）
 *    1. 题干
 *    A. 选项
 *    B. 选项
 *    ...
 *    答案：C
 *    或
 *    题干
 *    正确答案：对
 * ----------------------------------------------------------------
 */

const fs = require('fs');
const path = require('path');
const { normalizeAnswer, lettersOf } = require('./matcher');

// 解析 "A.xxx" / "A、xxx" / "A)xxx" / "A xxx" 为 {letter, text}
function parseOption(raw) {
  const s = String(raw || '').trim();
  const m = s.match(/^([A-Fa-f])[\s\.、\)）:：]+(.+)$/);
  if (m) return { letter: m[1].toUpperCase(), text: m[2].trim() };
  return null;
}

// 把一段选项文本（|| 分隔）解析为选项数组
function parseOptions(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  const parts = s.split(/\s*\|\|\s*|\s*\n\s*/).map(x => x.trim()).filter(Boolean);
  const opts = [];
  for (const p of parts) {
    const o = parseOption(p);
    if (o) opts.push(o);
  }
  return opts.length ? opts : null;
}

function parseTSV(text) {
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n').filter(l => l.trim());
  const entries = [];
  let header = null;
  for (const line of lines) {
    const cols = line.split('\t');
    // CSV 兜底：用逗号拆（题目里不要出现未加引号的逗号）
    const c = cols.length >= 4 ? cols : line.split(',');
    if (!header) {
      // 跳过表头行
      header = c;
      continue;
    }
    const type = (c[0] || '').trim();
    const question = (c[1] || '').trim();
    const options = parseOptions(c[2]);
    const answer = (c[3] || '').trim();
    if (!question || !answer) continue;
    entries.push({ question, type, options, answer: normalizeAnswer(answer, type), source: 'import' });
  }
  return entries;
}

function parseJSON(text) {
  // ⚠ 去 BOM：Windows 记事本 / PowerShell Set-Content -Encoding UTF8 写出的文件会带
//   UTF-8 BOM（\uFEFF），JSON.parse 直接抛 "Unexpected token" → 整个请求 500。
//   2026-10-23 实测踩过：远程导入带 BOM 的导出文件直接失败。
const data = JSON.parse(String(text || '').replace(/^\uFEFF/, ''));
  const arr = Array.isArray(data) ? data : (Array.isArray(data.questions) ? data.questions : []);
  const entries = [];
  for (const it of arr) {
    const question = String(it.question || it.title || '').trim();
    const type = String(it.type || '').trim();
    let options = it.options;
    if (typeof options === 'string') options = parseOptions(options);
    if (Array.isArray(options)) {
      options = options.map(o => {
        if (typeof o === 'string') return parseOption(o) || { letter: '', text: o };
        return { letter: String(o.letter || '').toUpperCase(), text: String(o.text || o.value || '').trim() };
      }).filter(o => o.text);
    }
    const answer = normalizeAnswer(it.answer != null ? it.answer : (it.answers || ''), type);
    if (!question || !answer) continue;
    entries.push({ question, type, options: options && options.length ? options : null, answer, source: it.source || 'import' });
  }
  return entries;
}

function parsePlainText(text) {
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
  const entries = [];
  let cur = null;
  const flush = () => {
    if (cur && cur.question && cur.answer) {
      entries.push({
        question: cur.question,
        type: cur.type || '',
        options: cur.options && cur.options.length ? cur.options : null,
        answer: normalizeAnswer(cur.answer, cur.type || ''),
        source: 'import'
      });
    }
    cur = null;
  };
  for (let line of lines) {
    const s = line.trim();
    if (!s) { flush(); continue; }
    // 答案行
    const ansMatch = s.match(/^(?:正确)?答案[:：]?\s*(.+)$/i) && !/^[A-Fa-f][\.、\)）\s]/.test(s);
    if (/^(答案|正确答案|参考答案)[:：]/.test(s)) {
      const a = s.replace(/^(答案|正确答案|参考答案)[:：]\s*/, '').trim();
      if (cur) { cur.answer = a; }
      else { cur = { question: '', answer: a }; }
      flush();
      continue;
    }
    // 题干行（以题号开头）
    const qMatch = s.match(/^\d+[\s\.、)）]+(.+)$/);
    if (qMatch) {
      flush();
      cur = { question: qMatch[1].trim(), options: [], answer: '' };
      continue;
    }
    // 选项行
    const opt = parseOption(s);
    if (opt && cur) { cur.options = cur.options || []; cur.options.push(opt); continue; }
    // 题型标记行（可选）：【判断题】/ （单选题）
    const tm = s.match(/^[【(（](单选题|多选题|判断题|填空题)[】)）]/);
    if (tm && cur) { cur.type = tm[1]; continue; }
    // 其余文本：若当前无题干则当题干
    if (cur && !cur.question) cur.question = s;
    else if (cur && !cur.answer && !cur.options.length) cur.question = (cur.question ? cur.question + ' ' : '') + s;
  }
  flush();
  return entries;
}

function detectFormat(file, formatHint) {
  if (formatHint) return formatHint;
  const ext = path.extname(file).toLowerCase();
  if (ext === '.json') return 'json';
  if (ext === '.txt') return 'text';
  return 'tsv';
}

// 从文件导入，返回 {added, merged, skipped, total}
function importFile(store, file, formatHint, sourceName) {
  const format = detectFormat(file, formatHint);
  const text = fs.readFileSync(file, 'utf-8');
  let entries;
  if (format === 'json') entries = parseJSON(text);
  else if (format === 'text') entries = parsePlainText(text);
  else entries = parseTSV(text);

  const src = sourceName || path.basename(file);
  let added = 0, merged = 0, skipped = 0;
  for (const e of entries) {
    if (!e.question || !e.answer) { skipped++; continue; }
    e.source = src;
    const r = store.upsert(e);
    if (r.action === 'add') added++;
    else if (r.action === 'merge') merged++;
    else skipped++;
  }
  return { added, merged, skipped, total: entries.length };
}

module.exports = { importFile, parseTSV, parseJSON, parsePlainText, parseOptions, detectFormat };

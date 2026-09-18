'use strict';

/**
 * 题库存储层
 * ----------------------------------------------------------------
 * 数据持久化到 data/tiku.json（与 ahut_backend_server 的 data/*.json 同风格）。
 * 内存中维护：
 *   - questions 数组（原始顺序，便于管理后台分页展示）
 *   - exactIndex：归一化题干 -> 条目数组（O(1) 精确命中）
 *
 * 写入采用「临时文件 + rename」原子落盘，并保留 .bak 备份，避免进程中断写坏数据。
 * ----------------------------------------------------------------
 */

const fs = require('fs');
const path = require('path');
const { normalize } = require('./matcher');

const DATA_DIR = path.join(__dirname, '..', 'data');
const TIKU_FILE = path.join(DATA_DIR, 'tiku.json');
const TIKU_BAK = path.join(DATA_DIR, 'tiku.json.bak');

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

class TikuStore {
  constructor(file) {
    this.file = file || TIKU_FILE;
    this.bak = this.file + '.bak';
    this.data = { meta: { createdAt: Date.now(), updatedAt: Date.now(), total: 0 }, questions: [] };
    this.exactIndex = new Map();
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(this.file)) {
        const raw = JSON.parse(fs.readFileSync(this.file, 'utf-8'));
        this.data = raw && Array.isArray(raw.questions) ? raw : { meta: {}, questions: [] };
        if (!this.data.meta) this.data.meta = {};
      }
    } catch (e) {
      console.error('[tiku] 读取题库失败，使用空题库:', e.message);
      this.data = { meta: {}, questions: [] };
    }
    this.data.questions = Array.isArray(this.data.questions) ? this.data.questions : [];
    this.rebuildIndex();
  }

  rebuildIndex() {
    this.exactIndex = new Map();
    for (const q of this.data.questions) {
      const key = normalize(q.question);
      if (!this.exactIndex.has(key)) this.exactIndex.set(key, []);
      this.exactIndex.get(key).push(q);
    }
  }

  save() {
    ensureDir();
    this.data.meta = this.data.meta || {};
    this.data.meta.total = this.data.questions.length;
    this.data.meta.updatedAt = Date.now();
    // 先备份旧文件
    try {
      if (fs.existsSync(this.file)) fs.copyFileSync(this.file, this.bak);
    } catch (e) {}
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf-8');
    fs.renameSync(tmp, this.file);
  }

  // 精确命中（已归一化）
  findExact(normalizedQuestion) {
    return this.exactIndex.get(normalizedQuestion) || [];
  }

  // 遍历全部题目（模糊匹配用）
  all() {
    return this.data.questions;
  }

  count() {
    return this.data.questions.length;
  }

  // 新增/覆盖单题。options = [{letter,text}] 或 null
  upsert(entry) {
    const key = normalize(entry.question);
    const existing = this.exactIndex.get(key);
    if (existing && existing.length) {
      // 已存在同题干：只补空缺字段，不覆盖已有答案（避免脏数据覆盖好答案）
      const target = existing[0];
      if (!target.answer && entry.answer) target.answer = entry.answer;
      if (!target.type && entry.type) target.type = entry.type;
      if ((!target.options || !target.options.length) && entry.options && entry.options.length) {
        target.options = entry.options;
      }
      if (entry.source && !(target.sources || []).includes(entry.source)) {
        target.sources = target.sources || [];
        target.sources.push(entry.source);
      }
      target.updatedAt = Date.now();
      return { action: 'merge', id: target.id };
    }
    const id = 'q_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    const q = {
      id,
      question: entry.question,
      type: entry.type || '',
      options: entry.options || null,
      answer: entry.answer || '',
      source: entry.source || '',
      sources: entry.source ? [entry.source] : [],
      count: 0,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    this.data.questions.push(q);
    if (!this.exactIndex.has(key)) this.exactIndex.set(key, []);
    this.exactIndex.get(key).push(q);
    return { action: 'add', id };
  }

  remove(id) {
    const before = this.data.questions.length;
    this.data.questions = this.data.questions.filter(q => q.id !== id);
    const removed = this.data.questions.length < before;
    if (removed) this.rebuildIndex();
    return removed;
  }

  get(id) {
    return this.data.questions.find(q => q.id === id);
  }
}

module.exports = { TikuStore, TIKU_FILE, DATA_DIR };

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
 * ----------------------------------------------------------------
 */

const fs = require('fs');
const path = require('path');
const { TikuStore } = require('./lib/store');
const { importFile } = require('./lib/importer');

const args = process.argv.slice(2);
if (!args.length) {
  console.log('用法: node import.js <文件或目录> [tsv|json|text] [sourceName]');
  process.exit(1);
}

const target = path.resolve(args[0]);
const formatHint = args[1] || null;
const sourceName = args[2] || null;

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

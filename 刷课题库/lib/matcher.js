'use strict';

/**
 * 题目归一化 + 模糊匹配 + 答案标准化
 * ----------------------------------------------------------------
 * 纯函数集合，无副作用，供 store / server / importer 复用。
 *
 * 匹配策略（按可信度从高到低）：
 *   1. 归一化后整串相等            -> 1.0
 *   2. 归一化后包含（短串是长串子串）-> 0.85 ~ 1.0
 *   3. 字符 bigram Dice 系数        -> 0 ~ 1
 * 中文用「字符二元组」比较，对"同题不同标点/换行/选项乱序"都有不错的鲁棒性。
 * ----------------------------------------------------------------
 */

// 仅保留中日韩文字 + 字母数字，其余（空白、标点、HTML 标签/实体）全部剔除并转小写
function normalize(s) {
  if (s == null) return '';
  return String(s)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[a-z0-9#]+;/gi, ' ')
    .replace(/[\s\u00a0\u3000·,，。.、;；:：!！?？\-—_－—()（）[\]【】《》<>{}~～|｜/\\+=*&^%$#@`""“”‘’]+/g, '')
    .toLowerCase();
}

// 字符 bigram 集合（中文匹配的关键）
function bigrams(s) {
  const set = new Set();
  if (s.length === 1) { set.add(s); return set; }
  for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
  return set;
}

// Dice 系数：2*|A∩B| / (|A|+|B|)，取值 0~1
function dice(a, b) {
  const A = bigrams(a);
  const B = bigrams(b);
  if (!A.size && !B.size) return a === b ? 1 : 0;
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const g of A) if (B.has(g)) inter++;
  return (2 * inter) / (A.size + B.size);
}

// 整体相似度（0~1）
function similarity(a, b) {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const short = na.length <= nb.length ? na : nb;
  const long = na.length <= nb.length ? nb : na;
  // 包含关系：短串足够长时才认定，避免"TCP"误配"TCP/IP协议栈"这类过短串
  if (short.length >= 4 && long.includes(short)) {
    return 0.85 + 0.15 * (short.length / long.length);
  }
  return dice(na, nb);
}

// 从答案字符串提取字母集合（多选/单选答案）。非纯字母（文字答案）返回 null
function lettersOf(answer) {
  if (answer == null) return null;
  const s = String(answer).trim().toUpperCase();
  if (!/^[A-F]+$/.test(s)) return null;
  return Array.from(new Set(s.split(''))).sort();
}

// 题型归一化：中文题型 -> 单字代号，方便比较与过滤
//   单选题->single 多选题->multi 判断题->judge 填空题->fill 其他->''
function typeKey(type) {
  const t = String(type || '');
  if (t.includes('多选')) return 'multi';
  if (t.includes('判断')) return 'judge';
  if (t.includes('填空') || t.includes('简答') || t.includes('问答') || t.includes('计算')) return 'fill';
  if (t.includes('单选')) return 'single';
  if (/^(single|multi|judge|fill)$/i.test(t)) return t.toLowerCase();
  return '';
}

// 题型兼容性判定（保证准确率的核心规则）：
//   - 'ok'      同题型 / 题型未知，正常匹配
//   - 'penalty' 单选↔多选 跨界，可匹配但相似度打折
//   - 'reject'  判断/填空 与 选择题 之间语义不同（文字答案 vs 字母答案），禁止跨界
function compatible(qt, et) {
  if (!qt || !et || qt === et) return 'ok';
  if (qt === 'fill' || qt === 'judge' || et === 'fill' || et === 'judge') return 'reject';
  return 'penalty';
}

// 将题库里的答案（可能是字母，也可能是原始选项文字）
// 按当前题目给出的 options 顺序映射为字母答案
function mapAnswerToLetters(answer, queryOptions, entryOptions) {
  // 1. 如果答案本身就是字母，先转成集合
  const letters = lettersOf(answer);
  if (letters) return letters;

  if (!Array.isArray(queryOptions) || !queryOptions.length) return null;

  // 2. 答案可能由多个选项文字组成（多选），用常见分隔符拆分
  const answerTexts = String(answer)
    .split(/[,，;；|/#]/)
    .map(s => normalize(s))
    .filter(Boolean);

  // 3. 在 queryOptions 中按顺序匹配每个答案文字 -> 得到对应字母
  const result = [];
  for (const ansText of answerTexts) {
    // 先精确归一化匹配 queryOptions
    let idx = queryOptions.findIndex(o => normalize(o) === ansText);
    if (idx < 0 && entryOptions && entryOptions.length) {
      // 退而求其次，用 entryOptions 中的顺序定位后再查文字
      // 若答案文字恰好和 entryOptions[i] 归一化相同，则记录位置 i
      idx = entryOptions.findIndex(o => normalize(o) === ansText);
      if (idx >= 0 && idx < queryOptions.length) {
        // 同一个字母位置在 queryOptions 中也对应这个位置
        result.push(String.fromCharCode(65 + idx));
        continue;
      }
    }
    if (idx >= 0) {
      result.push(String.fromCharCode(65 + idx));
    }
  }

  if (result.length) return result;
  // 4. 兜底：把整个答案文字当做一个整体去找最相似的选项
  const best = bestOptionIndex(answer, queryOptions);
  if (best >= 0) return [String.fromCharCode(65 + best)];
  return null;
}

// 按「选项文字」重映射答案字母，解决"题库选项顺序 vs 真实题面选项顺序不一致"的问题：
//   answer       题库里的答案（如 "C" 或 "AB"）
//   entryOptions 题库里存的选项 [{letter,text}]
//   queryOptions 真实题面的选项文字（字符串数组，按显示顺序 A/B/C/D...）
// 返回重映射后的字母数组（去重、升序），无法可靠映射时回退原字母。
function remapAnswerByText(answer, entryOptions, queryOptions) {
  const letters = lettersOf(answer);
  if (!letters || !letters.length) return null;
  if (!Array.isArray(entryOptions) || !entryOptions.length) return letters; // 无选项信息，保持原字母
  if (!Array.isArray(queryOptions) || !queryOptions.length) return letters;

  const qNorm = queryOptions.map((o) => normalize(typeof o === 'string' ? o : (o && o.text) || ''));
  const result = [];
  for (const L of letters) {
    const i = L.charCodeAt(0) - 65;
    const raw = entryOptions[i];
    // entryOptions 可能是 [{letter,text}]，也可能是纯字符串数组 —— 两种都要认。
    // 2026-10-21 修：原来只认对象型，字符串型会取到 undefined → entryText 为空 →
    // 直接回落原字母 → 与 8090 端（xxtTiku.js）行为**相反**，同一输入两端给出不同答案。
    const entryText = typeof raw === 'string' ? raw : (raw && raw.text) || '';
    if (!entryText) { result.push(L); continue; }
    const target = normalize(entryText);
    let idx = qNorm.findIndex(t => t && t === target);
    if (idx < 0) idx = bestOptionIndex(entryText, queryOptions); // 归一化不相等时用相似度兜底
    result.push(idx >= 0 ? String.fromCharCode(65 + idx) : L);
  }
  return Array.from(new Set(result)).sort();
}

// 答案文字与哪个选项最相似
// options 可能是字符串数组，也可能是 [{letter,text}] —— 统一先取文字再比。
function optionTextOf(o) {
  if (typeof o === 'string') return o;
  if (o && typeof o === 'object') return o.text || o.label || o.content || '';
  return '';
}

function bestOptionIndex(answer, options) {
  let best = -1;
  let bestScore = 0.45;
  const ansNorm = normalize(answer);
  options.forEach((o, i) => {
    const s = similarity(answer, optionTextOf(o));
    if (s > bestScore) { bestScore = s; best = i; }
  });
  // 兜底：答案文本是某个选项的子串，也认
  if (best < 0 && ansNorm) {
    options.forEach((o, i) => {
      const t = normalize(optionTextOf(o));
      if (t && (t.includes(ansNorm) || ansNorm.includes(t))) {
        best = i;
      }
    });
  }
  return best;
}

// 答案标准化（入库前统一，便于去重/合并/响应）
//   - 单选/多选字母   -> 大写排序拼接（如 "AB"）
//   - 判断题          -> "对" / "错"
//   - 填空/文字       -> 原样去首尾空白（多空保留 # 分隔）
//   - 如果原始答案看起来是选项文字（非字母且题干是选择）-> 保留原始文字（让 mapAnswerToLetters 负责映射）
function normalizeAnswer(answer, type) {
  const s = String(answer == null ? '' : answer).trim();
  if (!s) return '';
  const t = type || '';
  const letters = lettersOf(s);
  if (letters && letters.length) return letters.join('');
  if (typeKey(t) === 'judge') {
    if (/错|错误|false|×|x|否|no|f/i.test(s) && !/对|正确|true|√|是|yes|t/i.test(s)) return '错';
    return '对';
  }
  // 选择题但答案非纯字母 -> 保留原始文字供后续选项映射
  return s;
}

// 为前端展示：把标准化后的答案尽量还原为可读文字
function displayAnswer(entry) {
  if (!entry || !entry.answer) return '';
  const letters = lettersOf(entry.answer);
  if (!letters || !letters.length) return entry.answer;
  const opts = Array.isArray(entry.options) ? entry.options : [];
  return letters.map(L => {
    const i = L.charCodeAt(0) - 65;
    return opts[i] ? `${L}.${opts[i]}` : L;
  }).join('、');
}

module.exports = {
  normalize,
  normalizeAnswer,
  similarity,
  lettersOf,
  typeKey,
  compatible,
  mapAnswerToLetters,
  remapAnswerByText,
  bestOptionIndex,
  displayAnswer
};

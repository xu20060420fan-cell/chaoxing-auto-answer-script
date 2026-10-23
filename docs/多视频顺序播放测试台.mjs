/**
 * 学习通「多视频轮流播放 / 漏视频」问题 —— 决策逻辑复现 + 修复验证测试台
 *
 * 做法：
 *   · 修复后的函数：从 我的脚本.txt 里**原样抽取**（不重写）
 *   · 修复前的函数：在本文件里**原样保留一份旧实现**用于对照
 *   · DOM 模型：复刻真实学习通结构（2026-10-21 真机抓包）
 *       学习页 studentstudy
 *         └ iframe#frame_content → /mooc-ans/knowledge/cards
 *              └ N 个任务点卡片 iframe.ans-attach-online.ans-insertvideo-online
 *                   └ div#video.video-js > video#video_html5_api
 *              knowledge/cards 窗口上有全局 attachments[]
 *   · 关键行为：平台每完成一个任务点就**重建整章卡片 DOM**（视频元素被换掉，地址不变）
 *
 * 用法： node media_logic_test.mjs old | new
 */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// 脚本源文件定位：仓库内（docs/ 的上一级）或本地工作副本
const SCRIPT_CANDIDATES = [
    path.join(__dirname, '..', '超新学习通答题脚本.js'),
    'D:/校园项目/schedule/脚本/我的脚本.txt'
];
const SCRIPT = SCRIPT_CANDIDATES.find(p => fs.existsSync(p));
if (!SCRIPT) {
    console.error('找不到脚本源文件，尝试过：\n  ' + SCRIPT_CANDIDATES.join('\n  '));
    process.exit(1);
}
const src = fs.readFileSync(SCRIPT, 'utf8').replace(/^﻿/, '');
console.log('脚本源文件：' + SCRIPT);

function extractFn(name) {
    const i = src.indexOf('function ' + name + '(');
    if (i < 0) throw new Error('找不到函数: ' + name);
    let depth = 0, started = false;
    for (let j = i; j < src.length; j++) {
        const c = src[j];
        if (c === '{') { depth++; started = true; }
        else if (c === '}') { depth--; if (started && depth === 0) return src.slice(i, j + 1); }
    }
    throw new Error('函数括号不匹配: ' + name);
}

const FN_NAMES = [
    'findAllVideos', 'isVisibleMedia', 'hasVideoSource', 'mediaSig', 'sameMediaList',
    'pickMediaToPlay', 'readCardJobId', 'isVideoTaskDone',
    'iframeJobDoneStatus', 'getChaoxingAttachments', 'anyOtherMediaPlaying',
    'attachmentsMediaState', 'ensureMediaSeq', 'advanceMediaSeq',
    'markTargetMedia', 'isTargetMedia', 'attachmentForMedia'
];
const fnSrc = FN_NAMES.map(n => {
    try { return extractFn(n); } catch (e) { return `/* ${n}: ${e.message} */`; }
}).join('\n\n');

// ---------- 修复前的旧实现（原样保留，用于对照） ----------
const OLD_PICK = `
function oldPickMediaToPlay(videos) {
    for (const v of videos) {
        if (isVideoTaskDone(v) === true) continue;
        if (v.ended || !v.paused) continue;
        if (!hasVideoSource(v)) continue;
        return { media: v, reason: 'order' };
    }
    return null;
}`;

// ---------- 迷你 DOM ----------
function makeDoc() { return { querySelectorAll: () => [], defaultView: null }; }
let LOG = [];
function log(s) { LOG.push(s); console.log(s); }
let SCEN = null, PAUSE_HANDLER = null;

function matchSel(el, sel) {
    for (const s of sel.split(',').map(x => x.trim())) {
        if (!s) continue;
        if (s.startsWith('.')) { if (el._attrs.class && el._attrs.class.split(/\s+/).includes(s.slice(1))) return true; }
        else if (s === 'iframe') { if (el.tagName === 'IFRAME') return true; }
        else if (s === 'video' || s === 'audio') { if (el.tagName === s.toUpperCase()) return true; }
        else if (s.includes('[src]')) { if (el.hasAttribute('src')) return true; }
        else if (el.tagName === s.toUpperCase()) return true;
    }
    return false;
}

function makeEl(tag, attrs = {}) {
    const el = {
        tagName: tag.toUpperCase(), _attrs: { ...attrs }, children: [], parentNode: null,
        ownerDocument: null, textContent: '',
        getAttribute(k) { return k in this._attrs ? this._attrs[k] : null; },
        setAttribute(k, v) { this._attrs[k] = String(v); },
        hasAttribute(k) { return k in this._attrs; },
        appendChild(c) { c.parentNode = this; this.children.push(c); return c; },
        querySelectorAll(sel) {
            const out = []; const walk = (n) => { for (const c of n.children) { if (matchSel(c, sel)) out.push(c); walk(c); } };
            walk(this); return out;
        },
        closest() { return null; },
        getBoundingClientRect() { return { x: 0, y: 0, width: 844, height: 474, top: 0, left: 0, right: 844, bottom: 474 }; },
        get src() { return this._attrs.src || ''; }, set src(v) { this._attrs.src = v; },
        get currentSrc() { return this._attrs.src || ''; },
        get paused() { return !!this._attrs.paused; }, set paused(v) { this._attrs.paused = !!v; },
        get ended() { return !!this._attrs.ended; }, set ended(v) { this._attrs.ended = !!v; },
        get readyState() { return 4; },
        get playbackRate() { return 1; }, set playbackRate(v) { },
        play() { this._attrs.paused = false; log(`       [${this._label}] 调用 play()`); return Promise.resolve(); },
        pause() { this._attrs.paused = true; log(`       [${this._label}] 调用 pause()`); if (PAUSE_HANDLER) PAUSE_HANDLER(this); }
    };
    return el;
}

// ---------- 场景 ----------
function makeScenario({ videoCount = 6, withDataAttr = false, finished = 0 }) {
    const topWin = { document: makeDoc(), top: null };
    const cardsWin = { document: makeDoc(), top: topWin };
    topWin.top = topWin; cardsWin.top = topWin;

    const oids = [];
    for (let i = 0; i < videoCount; i++) oids.push(String(i).padStart(2, '0') + 'ca' + 'a'.repeat(26));

    const attachments = [];
    for (let i = 0; i < videoCount; i++) {
        attachments.push({
            jobid: String(9000 + i),
            job: i < finished ? undefined : true,
            isPassed: i < finished ? true : undefined,
            property: { module: 'insertvideo', objectid: oids[i] }
        });
    }
    cardsWin.attachments = attachments;

    const sc = { topWin, cardsWin, videoEls: [], frameEls: [], oids, withDataAttr, attachments, state: {} };

    sc.rebuild = () => {
        sc.videoEls = []; sc.frameEls = [];
        for (let i = 0; i < videoCount; i++) {
            const cardFrame = makeEl('iframe', { class: 'ans-attach-online ans-insertvideo-online', src: '/ananas/modules/video/index.html?v=2026-0920-1154' });
            if (withDataAttr) cardFrame.setAttribute('data', JSON.stringify({ jobid: 9000 + i, module: 'insertvideo' }));
            const playerWin = { document: makeDoc(), top: topWin, frameElement: cardFrame };
            cardFrame.contentWindow = playerWin;
            const st = sc.state[oids[i]] || { paused: true, ended: false };
            const v = makeEl('video', {
                id: 'video_html5_api', class: 'vjs-tech',
                src: `https://s2.cldisk.com/sv-w2/video/03/f7/ca/${oids[i]}/sd.mp4`,
                paused: st.paused, ended: st.ended
            });
            v.ownerDocument = playerWin.document; v._win = playerWin; v._label = 'video#' + i; v._idx = i;
            playerWin.document.querySelectorAll = (sel) => {
                if (sel === 'video' || sel === 'audio') return v.tagName === sel.toUpperCase() ? [v] : [];
                if (sel === '.vjs-tech') return [v];
                return [];
            };
            playerWin.document.defaultView = playerWin;
            sc.videoEls.push(v); sc.frameEls.push(cardFrame);
        }
        cardsWin.document.querySelectorAll = (sel) => {
            if (sel === 'iframe') return sc.frameEls;
            if (sel === 'video' || sel === 'audio') return [];
            return [];
        };
        cardsWin.document.defaultView = cardsWin;
        const cardsFrame = makeEl('iframe', { id: 'iframe', src: '/mooc-ans/knowledge/cards?knowledgeid=1' });
        cardsFrame.contentWindow = cardsWin;
        topWin.document.querySelectorAll = (sel) => {
            if (sel === 'iframe') return [cardsFrame];
            if (sel === 'video' || sel === 'audio') return [];
            return [];
        };
        topWin.document.defaultView = topWin;
    };
    sc.rebuild();
    return sc;
}

function makeSandbox(sc) {
    const ctx = {
        console: { log: () => {}, warn: () => {}, error: () => {} },
        setTimeout, clearTimeout, setInterval, clearInterval,
        Promise, Math, JSON, Date, String, Number, Array, Object, Boolean, RegExp, Error,
        WeakSet, WeakMap, Set, Map, URLSearchParams,
        location: { pathname: '/mycourse/studentstudy', href: 'https://mooc1.chaoxing.com/mycourse/studentstudy?chapterId=1', search: '?chapterId=1', hostname: 'mooc1.chaoxing.com' },
        document: sc.topWin.document, unsafeWindow: sc.topWin,
        addLog: () => {}, showToast: () => {},
        _STUDY: { running: true, userPickedJobid: null, userPickedAt: 0, mediaSeq: [], mediaSeqIndex: 0, lastPlayedMedia: null, targetMedia: null },
        state: { settings: { studyRate: 1, studyVolume: 0, studyAutoUnpause: true } },
        GM_xmlhttpRequest: () => {}, GM_addStyle: () => {}, GM_getValue: () => undefined, GM_setValue: () => {}
    };
    ctx.window = ctx; ctx.globalThis = ctx; ctx.top = sc.topWin;
    vm.createContext(ctx);
    vm.runInContext(fnSrc + '\n' + OLD_PICK + `
;globalThis.__api = {
    findAllVideos: typeof findAllVideos !== 'undefined' ? findAllVideos : null,
    pickMediaToPlay: typeof pickMediaToPlay !== 'undefined' ? pickMediaToPlay : null,
    oldPickMediaToPlay: typeof oldPickMediaToPlay !== 'undefined' ? oldPickMediaToPlay : null,
    anyOtherMediaPlaying: typeof anyOtherMediaPlaying !== 'undefined' ? anyOtherMediaPlaying : null,
    isVideoTaskDone: typeof isVideoTaskDone !== 'undefined' ? isVideoTaskDone : null,
    ensureMediaSeq: typeof ensureMediaSeq !== 'undefined' ? ensureMediaSeq : null,
    advanceMediaSeq: typeof advanceMediaSeq !== 'undefined' ? advanceMediaSeq : null,
    markTargetMedia: typeof markTargetMedia !== 'undefined' ? markTargetMedia : null,
    isTargetMedia: typeof isTargetMedia !== 'undefined' ? isTargetMedia : null
};`, ctx);
    return { ctx, api: ctx.__api };
}

// ---------- 时序模拟 ----------
function run({ label, mode }) {
    console.log('\n============================================================');
    console.log(label);
    console.log('============================================================');
    LOG = [];
    const sc = makeScenario({ videoCount: 6, withDataAttr: false, finished: 0 });
    SCEN = sc;
    // 模拟脚本里 worker 的初始化：顶层还没选定目标前，谁都不享受保护
    if (mode === 'new') sc.topWin.__aa_targetMedia = false;
    const { api } = makeSandbox(sc);

    // 脚本侧 pause 事件恢复（等价于 attachVideoPauseRecovery 的判定链）
    PAUSE_HANDLER = (v) => {
        if (v.ended) return;
        if (mode === 'new' && api.isTargetMedia && !api.isTargetMedia(v)) {
            log(`       脚本不干预 ${v._label}（不是目标视频）→ 平台可正常切换`);
            return;
        }
        const others = api.anyOtherMediaPlaying(v._win);
        if (others) { log(`       另有视频在播 → 不抢`); return; }
        if (!v.paused) return;
        log(`       脚本把 ${v._label} 拉回来继续播  ← 抢播`);
        v.paused = false;
    };

    const N = 6;
    let t = 0;
    const playOrder = [];
    const playCount = new Array(N).fill(0);
    let completed = 0;

    const step = () => {
        t++;
        const videosNow = () => sc.videoEls;

        // —— 平台：反鼠标检测 / 切任务点时把正在播的视频暂停掉 ——
        if (t % 2 === 0) {
            for (const o of videosNow()) {
                if (!o.paused && !o.ended) { log(`t=${t}s 平台暂停 ${o._label}（切任务点/鼠标检测）`); o.pause(); }
            }
        }
        // —— 平台：正在播的视频看够时长 → 标记该任务点完成，并重建整章卡片 DOM ——
        const cur = videosNow().find(x => !x.paused && !x.ended);
        if (cur && completed < N - 1 && t % 3 === 0) {
            cur.ended = true; cur.paused = true;
            sc.state[sc.oids[cur._idx]] = { paused: true, ended: true };
            const att = sc.attachments[cur._idx];
            att.job = undefined; att.isPassed = true;      // 平台侧：任务点完成，job 消失
            completed++;
            log(`t=${t}s ★ 平台标记 ${cur._label} 任务点完成（attachments 里 job 消失）`);
            sc.rebuild();                                   // 平台重建整章卡片 DOM
            log(`t=${t}s ★ 平台重建卡片 DOM（视频元素全部换新）`);
        }

        // —— 各播放器 iframe 里的 worker（每个都跑一遍防暂停逻辑）——
        for (const v of videosNow()) {
            if (v.ended || !v.paused) continue;
            if (!v.currentSrc) continue;
            // 旧：每个 worker 都想把自己的视频拉回来（只看"有没有别的媒体在播"）
            // 新：只有顶层选定的目标视频才享受保护
            if (mode === 'new' && !api.isTargetMedia(v)) continue;
            if (api.anyOtherMediaPlaying(v._win)) continue;
            log(`t=${t}s worker#${v._idx} 拉起 ${v._label}`);
            v.paused = false;
            playOrder.push(v._label); playCount[v._idx]++;
        }

        // —— 顶层主循环 ——
        const videos = api.findAllVideos();
        const playing = videos.filter(v => !v.paused && !v.ended);
        if (playing.length) {
            log(`t=${t}s 在播: ${playing.map(v => v._label).join(',')} → 脚本等待`);
        } else {
            if (mode === 'new' && api.advanceMediaSeq) api.advanceMediaSeq();
            const pick = mode === 'new' ? api.pickMediaToPlay(videos) : api.oldPickMediaToPlay(videos);
            if (pick) {
                log(`t=${t}s ▶ 顶层脚本选择播放 ${pick.media._label}`);
                pick.media.paused = false;
                sc.state[sc.oids[pick.media._idx]] = { paused: false, ended: false };
                playOrder.push(pick.media._label); playCount[pick.media._idx]++;
                if (mode === 'new' && api.markTargetMedia) api.markTargetMedia(pick.media);
            } else {
                log(`t=${t}s 脚本没找到可播的视频`);
            }
        }
    };
    for (let i = 0; i < 16; i++) step();
    PAUSE_HANDLER = null;

    console.log('──────── 播放顺序 ────────');
    console.log('  ' + (playOrder.join(' → ') || '(空)'));
    console.log('──────── 各视频被拉起次数 ────────');
    console.log('  ' + playCount.map((c, i) => `video#${i}:${c}`).join('  '));
    const played = new Set(playOrder).size;
    const dup = playCount.filter(c => c > 1).length;
    console.log(`──────── 覆盖 ${played}/${N} 个视频；重复播放的视频数: ${dup} ────────`);
    return LOG;
}

const mode = process.argv[2] || 'old';
if (mode === 'old') run({ label: '【修复前】旧选片逻辑（每轮挑第一个 paused 的视频）', mode: 'old' });
else run({ label: '【修复后】队列指针 + 目标互斥 + objectid 任务匹配', mode: 'new' });

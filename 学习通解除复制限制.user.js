// ==UserScript==
// @name         学习通解除复制限制
// @namespace    local.chaoxing.unlock
// @version      1.1
// @description  解除学习通网页端（作业/考试/资料）的复制、选中、右键、快捷键限制，支持 iframe、遮罩层与剪贴板兜底
// @author       xu20060420fan-cell
// @match        *://*.chaoxing.com/*
// @match        *://*.chaoxing.cn/*
// @match        *://*.edu.cn/*
// @run-at       document-start
// @grant        none
// @all-frames   true
// ==/UserScript==

(function () {
    'use strict';

    /* ---------- 1. 放开 CSS 选中限制 ---------- */
    const CSS = `*,*::before,*::after{
        user-select:text!important;
        -webkit-user-select:text!important;
        -moz-user-select:text!important;
        -webkit-touch-callout:default!important;
    }`;
    function injectCSS(doc) {
        try {
            const s = doc.createElement('style');
            s.textContent = CSS;
            (doc.head || doc.documentElement).appendChild(s);
        } catch (e) {}
    }

    /* ---------- 2. 清掉内联事件处理器 ---------- */
    const H = ['oncopy', 'oncut', 'onpaste', 'oncontextmenu', 'onselectstart',
               'ondragstart', 'onbeforecopy', 'onbeforecut', 'onmousedown', 'onmouseup'];
    function clearInline(doc) {
        try {
            H.forEach(h => {
                if (doc[h]) doc[h] = null;
                if (doc.documentElement) doc.documentElement[h] = null;
                if (doc.body) doc.body[h] = null;
            });
            doc.querySelectorAll('*').forEach(el => H.forEach(h => { if (el[h]) el[h] = null; }));
        } catch (e) {}
    }

    /* ---------- 3. 捕获阶段截断页面监听 ---------- */
    function blockEvents(win) {
        ['copy', 'cut', 'paste', 'contextmenu', 'selectstart', 'dragstart'].forEach(t => {
            win.addEventListener(t, e => e.stopImmediatePropagation(), true);
        });

        // Ctrl/Cmd + C：自己写剪贴板，绕开页面拦截
        win.addEventListener('keydown', e => {
            const k = (e.key || '').toLowerCase();
            if ((e.ctrlKey || e.metaKey) && k === 'c') {
                const sel = String(win.getSelection() || '');
                if (sel.trim()) {
                    e.stopImmediatePropagation();
                    e.preventDefault();
                    writeClipboard(sel);
                }
            }
            if ((e.ctrlKey || e.metaKey) && ['a', 'x'].includes(k)) {
                e.stopImmediatePropagation();
            }
        }, true);
    }

    function writeClipboard(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
        } else {
            fallbackCopy(text);
        }
    }
    function fallbackCopy(text) {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); } catch (e) {}
        ta.remove();
    }

    /* ---------- 4. 干掉「禁止复制」遮罩层 ---------- */
    function killMask(doc) {
        try {
            doc.querySelectorAll('.maskDiv,.maskTipDiv,.mask-no-bg,.maskBg').forEach(el => {
                el.style.display = 'none';
                el.style.pointerEvents = 'none';
            });
        } catch (e) {}
    }

    /* ---------- 5. iframe 递归（题目常在 iframe 里）---------- */
    function handleFrames(doc) {
        try {
            doc.querySelectorAll('iframe,frame').forEach(f => {
                try {
                    const d = f.contentDocument;
                    if (d) apply(d);
                } catch (e) {}
            });
        } catch (e) {}
    }

    /* ---------- 6. 动态节点监听 ---------- */
    function observe(doc) {
        try {
            new MutationObserver(muts => {
                for (const m of muts) {
                    for (const n of m.addedNodes) {
                        if (n.nodeType === 1) {
                            H.forEach(h => { if (n[h]) n[h] = null; });
                            if (n.tagName === 'IFRAME') handleFrames(doc);
                        }
                    }
                }
            }).observe(doc.documentElement, { childList: true, subtree: true });
        } catch (e) {}
    }

    function apply(doc) {
        injectCSS(doc);
        clearInline(doc);
        killMask(doc);
        handleFrames(doc);
        if (!doc.__cxUnlockObserved) {
            doc.__cxUnlockObserved = true;
            observe(doc);
        }
    }

    /* ---------- 7. 悬浮按钮：一键复制整页文字 ---------- */
    function addButton(doc) {
        if (doc.getElementById('__cx_copy_all__')) return;
        const btn = doc.createElement('div');
        btn.id = '__cx_copy_all__';
        btn.textContent = '复制全文';
        Object.assign(btn.style, {
            position: 'fixed', right: '18px', bottom: '18px', zIndex: '2147483647',
            padding: '10px 16px', background: '#2563eb', color: '#fff',
            borderRadius: '8px', fontSize: '14px', cursor: 'pointer',
            boxShadow: '0 4px 14px rgba(0,0,0,.25)', userSelect: 'none'
        });
        btn.onclick = () => {
            const sel = String(window.getSelection() || '');
            const txt = sel.trim() || doc.body.innerText.replace(/\n{3,}/g, '\n\n').trim();
            writeClipboard(txt);
            btn.textContent = '已复制 ' + txt.length + ' 字';
            setTimeout(() => { btn.textContent = '复制全文'; }, 1500);
        };
        (doc.body || doc.documentElement).appendChild(btn);
    }

    /* ---------- 启动 ---------- */
    blockEvents(window);
    apply(document);

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            apply(document);
            addButton(document);
        });
    } else {
        addButton(document);
    }

    let n = 0;
    const timer = setInterval(() => {
        apply(document);
        if (document.body && !document.getElementById('__cx_copy_all__')) addButton(document);
        if (++n > 60) clearInterval(timer);
    }, 1000);

    console.log('[学习通] 复制限制已解除');
})();

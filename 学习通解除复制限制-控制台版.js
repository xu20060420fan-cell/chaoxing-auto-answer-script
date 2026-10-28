// ===== 学习通 解除复制限制（Console 版）=====
// 用法：F12 → Console → 粘贴 → 回车
(function () {
    const doc = document;

    // 1. 放开选中
    const st = doc.createElement('style');
    st.textContent = `*,*::before,*::after{
        user-select:text!important;
        -webkit-user-select:text!important;
        -moz-user-select:text!important;
        -webkit-touch-callout:default!important;
    }`;
    doc.head.appendChild(st);

    // 2. 清内联事件
    const H = ['oncopy', 'oncut', 'onpaste', 'oncontextmenu', 'onselectstart',
               'ondragstart', 'onbeforecopy', 'onbeforecut', 'onmousedown', 'onmouseup'];
    const clear = (root) => {
        try {
            H.forEach(h => {
                if (root[h]) root[h] = null;
                if (root.documentElement) root.documentElement[h] = null;
                if (root.body) root.body[h] = null;
            });
            root.querySelectorAll('*').forEach(el => H.forEach(h => { if (el[h]) el[h] = null; }));
        } catch (e) {}
    };

    // 3. 捕获阶段截断页面监听
    ['copy', 'cut', 'paste', 'contextmenu', 'selectstart', 'dragstart'].forEach(t => {
        window.addEventListener(t, e => e.stopImmediatePropagation(), true);
    });

    // 4. Ctrl/Cmd + C 自己写剪贴板，绕开页面拦截
    window.addEventListener('keydown', e => {
        const k = (e.key || '').toLowerCase();
        if ((e.ctrlKey || e.metaKey) && k === 'c') {
            const sel = String(window.getSelection() || '');
            if (sel.trim()) {
                e.stopImmediatePropagation();
                e.preventDefault();
                navigator.clipboard.writeText(sel).catch(() => {
                    const ta = doc.createElement('textarea');
                    ta.value = sel; doc.body.appendChild(ta); ta.select();
                    doc.execCommand('copy'); ta.remove();
                });
            }
        }
        if ((e.ctrlKey || e.metaKey) && ['a', 'x'].includes(k)) {
            e.stopImmediatePropagation();
        }
    }, true);

    // 5. 干掉遮罩层
    const killMask = () => {
        doc.querySelectorAll('.maskDiv,.maskTipDiv,.mask-no-bg,.maskBg').forEach(el => {
            el.style.display = 'none';
            el.style.pointerEvents = 'none';
        });
    };

    // 6. iframe 递归
    const frames = (d) => {
        try {
            d.querySelectorAll('iframe,frame').forEach(f => {
                try {
                    const dd = f.contentDocument;
                    if (dd) { clear(dd); frames(dd); }
                } catch (e) {}
            });
        } catch (e) {}
    };

    clear(doc); frames(doc); killMask();
    setInterval(() => { clear(doc); killMask(); frames(doc); }, 800);

    // 7. 悬浮按钮：一键复制整页文字
    const btn = doc.createElement('div');
    btn.textContent = '复制全文';
    Object.assign(btn.style, {
        position: 'fixed', right: '18px', bottom: '18px', zIndex: 2147483647,
        padding: '10px 16px', background: '#2563eb', color: '#fff',
        borderRadius: '8px', fontSize: '14px', cursor: 'pointer',
        boxShadow: '0 4px 14px rgba(0,0,0,.25)', userSelect: 'none'
    });
    btn.onclick = () => {
        const sel = String(window.getSelection() || '');
        const txt = sel.trim() || doc.body.innerText.replace(/\n{3,}/g, '\n\n').trim();
        navigator.clipboard.writeText(txt).then(
            () => { btn.textContent = '已复制 ' + txt.length + ' 字'; setTimeout(() => btn.textContent = '复制全文', 1500); },
            () => alert('复制失败，请手动选中后按 Ctrl+C')
        );
    };
    doc.body.appendChild(btn);

    console.log('%c[学习通] 复制限制已解除', 'color:#16a34a;font-weight:bold');
})();

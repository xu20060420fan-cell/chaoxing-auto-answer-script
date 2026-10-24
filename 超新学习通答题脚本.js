// ==UserScript==
// @name         智能自动答题助手
// @namespace    http://tampermonkey.net/
// @version      2.10
// @description  全自动网课答题助手，支持多网课平台、多题库融合、图片题目识别（2026-10-23 实机复核版：修复一章多视频时在多个视频之间轮流重播 / 漏视频 —— 改为播放队列只进不退 + 目标视频互斥 + 按视频地址精确匹配任务点；AI 模型列表对齐 13 家官方最新版；修复自定义 API 刷新后全部 400、AI 请求无超时挂死、跨域图片题 100% 跳过、双 API 答案缓存写穿、思考型模型参数被拒）
// @author       xu20060420fan-cell
// @homepage     https://github.com/xu20060420fan-cell/chaoxing-auto-answer-script
// @supportURL   https://github.com/xu20060420fan-cell/chaoxing-auto-answer-script/issues
// @match        *://*/*
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @connect      *
// @connect      api.openai.com
// @connect      api.anthropic.com
// @connect      qianfan.baidubce.com
// @connect      dashscope.aliyuncs.com
// @connect      api.moonshot.cn
// @connect      open.bigmodel.cn
// @connect      api.deepseek.com
// @connect      api.minimaxi.com
// @connect      api.minimax.com
// @connect      token.sensenova.cn
// @connect      api.xiaomimimo.com
// @connect      generativelanguage.googleapis.com
// @connect      www.google.com
// @connect      www.bing.com
// @connect      www.baidu.com
// @connect      cn.bing.com
// @connect      ark.cn-beijing.volces.com
// @connect      volcengine.com
// @license      MIT
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    // 顶层窗口跑完整脚本（UI/答题/刷课调度）；
    // iframe 内默认什么都不做——但学习平台的视频常嵌在跨域 iframe 里（如智慧树），
    // 顶层根本摸不到播放器。参考超新/OCS 的做法，脚本也注入 iframe，
    // 由文件末尾的 setupStudyFrameWorker() 判断是否启动轻量刷课 worker
    const IS_TOP_FRAME = (window.top === window.self);

    // ==================== 模型配置 ====================
    // 2026-10-21 更新：模型名与端点重新对照各家官方文档 / 公开模型目录核实。
    //   OpenAI    : gpt-6.1-sol / gpt-6-astra / gpt-6-sol / gpt-6-luna / gpt-5.6-sol / gpt-5.6-terra
    //   Anthropic : claude-opus-5-5 / claude-sonnet-5-5 / claude-haiku-5-5 / claude-fable-5-1
    //   Gemini    : gemini-4-argon / gemini-3.8-flash / gemini-3.7-flash
    //   千帆      : ernie-5.1 / ernie-5.0 / ernie-x1-turbo / ernie-4.5-turbo-128k
    //   百炼      : qwen3.8-max / qwen3.8-flash / qwen3.8-omni-flash
    //   Kimi      : kimi-k3 / kimi-k2.6
    //   智谱      : glm-5.3 / glm-5.3-flash / glm-5.2
    //   DeepSeek  : deepseek-v4.1-flash / deepseek-v4-pro / deepseek-v4-flash
    //   MiniMax   : MiniMax-M3.1-Flash / MiniMax-M3 / MiniMax-M2.7 / MiniMax-M2.7-highspeed
    //   日日新    : sensenova-6.7-flash-lite
    //   MiMo      : mimo-v2.6-pro / mimo-v2.6-flash / mimo-v2.5-pro / mimo-v2.5
    //   火山方舟  : doubao-seed-2.0-pro / doubao-seed-2.0-mini / doubao-seed-2.0-lite / doubao-seed-1.6
    // supportsImages: 该 API 是否支持图片题目（多模态）；isOpenAI: OpenAI 官方接口需用 max_completion_tokens
    // isReasoning: 思考型模型 —— 不下发 temperature，且 max_tokens 留足（思维链也计入）
    //   （2026-10 实锤：MiMo 思考模式固定 temperature=1.0 / top_p=0.95；DeepSeek-V4-Pro 官方卡推荐 temperature=1.0）
    const AI_MODELS = {
        openai: {
            name: 'OpenAI GPT',
            baseURL: 'https://api.openai.com/v1/chat/completions',
            models: ['gpt-6.1-sol', 'gpt-6-astra', 'gpt-6-sol', 'gpt-6-luna', 'gpt-5.6-sol', 'gpt-5.6-terra'],
            defaultModel: 'gpt-6.1-sol',
            apiKey: '',
            enabled: false,
            supportsImages: true,
            isOpenAI: true,
            isReasoning: true
        },
        anthropic: {
            name: 'Anthropic Claude',
            baseURL: 'https://api.anthropic.com/v1/messages',
            models: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-fable-5-1'],
            defaultModel: 'claude-sonnet-5-5',
            apiKey: '',
            enabled: false,
            isAnthropic: true,
            supportsImages: true,
            isReasoning: true
        },
        google: {
            name: 'Google Gemini',
            baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
            models: ['gemini-4-argon', 'gemini-3.8-flash', 'gemini-3.7-flash'],
            defaultModel: 'gemini-4-argon',
            apiKey: '',
            enabled: false,
            supportsImages: true
        },
        baidu: {
            name: '百度文心（千帆v2）',
            baseURL: 'https://qianfan.baidubce.com/v2/chat/completions',
            models: ['ernie-5.1', 'ernie-5.0', 'ernie-x1-turbo', 'ernie-4.5-turbo-128k'],
            defaultModel: 'ernie-5.1',
            apiKey: '',
            enabled: false,
            supportsImages: false
        },
        aliyun: {
            name: '阿里通义千问',
            baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
            models: ['qwen3.8-max', 'qwen3.8-flash', 'qwen3.8-omni-flash'],
            defaultModel: 'qwen3.8-max',
            apiKey: '',
            enabled: false,
            supportsImages: true
        },
        moonshot: {
            name: '月之暗面 Kimi',
            baseURL: 'https://api.moonshot.cn/v1/chat/completions',
            models: ['kimi-k3', 'kimi-k2.6'],
            defaultModel: 'kimi-k3',
            apiKey: '',
            enabled: false,
            supportsImages: true,
            isReasoning: true
        },
        zhipu: {
            name: '智谱 GLM',
            baseURL: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
            models: ['glm-5.3', 'glm-5.3-flash', 'glm-5.2'],
            defaultModel: 'glm-5.3',
            apiKey: '',
            enabled: false,
            supportsImages: true,
            isReasoning: true
        },
        deepseek: {
            name: 'DeepSeek',
            baseURL: 'https://api.deepseek.com/v1/chat/completions',
            models: ['deepseek-v4.1-flash', 'deepseek-v4-pro', 'deepseek-v4-flash'],
            defaultModel: 'deepseek-v4.1-flash',
            apiKey: '',
            enabled: false,
            supportsImages: false,
            isReasoning: true
        },
        minimax: {
            name: 'MiniMax',
            baseURL: 'https://api.minimaxi.com/v1/chat/completions',
            models: ['MiniMax-M3.1-Flash', 'MiniMax-M3', 'MiniMax-M2.7', 'MiniMax-M2.7-highspeed'],
            defaultModel: 'MiniMax-M3',
            apiKey: '',
            enabled: false,
            supportsImages: true
        },
        sensenova: {
            name: '商汤日日新',
            baseURL: 'https://token.sensenova.cn/v1/chat/completions',
            models: ['sensenova-6.7-flash-lite'],
            defaultModel: 'sensenova-6.7-flash-lite',
            apiKey: '',
            enabled: false,
            supportsImages: true
        },
        xiaomi: {
            name: '小米 MiMo',
            baseURL: 'https://api.xiaomimimo.com/v1/chat/completions',
            models: ['mimo-v2.6-pro', 'mimo-v2.6-flash', 'mimo-v2.5-pro', 'mimo-v2.5'],
            defaultModel: 'mimo-v2.6-pro',
            apiKey: '',
            enabled: false,
            supportsImages: true,
            isReasoning: true
        },
        doubao: {
            name: '字节豆包',
            baseURL: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
            models: ['doubao-seed-2.0-pro', 'doubao-seed-2.0-mini', 'doubao-seed-2.0-lite', 'doubao-seed-1.6'],
            defaultModel: 'doubao-seed-2.0-pro',
            apiKey: '',
            enabled: false,
            supportsImages: true,
            isReasoning: true
        },
        custom: {
            name: '自定义 API',
            baseURL: '',
            models: [],
            defaultModel: '',
            apiKey: '',
            enabled: false,
            isCustom: true
        }
    };

    // ==================== UI 样式：参考校园助手玻璃拟态风格 ====================
    if (IS_TOP_FRAME) {
        GM_addStyle(`
        :root {
            --aa-primary: #00A8FF;
            --aa-primary-dark: #0095E0;
            --aa-primary-soft: rgba(0,168,255,0.10);
            --aa-primary-soft-hover: rgba(0,168,255,0.16);
            --aa-bg-page: #F0F2F5;
            --aa-bg-card: rgba(255,255,255,0.80);
            --aa-bg-press: rgba(229,231,235,0.72);
            --aa-glass: rgba(255,255,255,0.62);
            --aa-glass-strong: rgba(255,255,255,0.78);
            --aa-glass-light: rgba(255,255,255,0.38);
            --aa-glass-border: rgba(255,255,255,0.50);
            --aa-glass-border-strong: rgba(255,255,255,0.65);
            --aa-glass-border-subtle: rgba(255,255,255,0.28);
            --aa-glass-shadow: rgba(27,38,59,0.06);
            --aa-glass-shadow-deep: rgba(27,38,59,0.12);
            --aa-text-title: #1B263B;
            --aa-text-body: #4A5568;
            --aa-text-helper: #8B95A5;
            --aa-text-placeholder: #B0B8C5;
            --aa-border: rgba(203,208,216,0.7);
            --aa-border-light: rgba(226,229,233,0.6);
            --aa-divider: rgba(226,229,233,0.8);
            --aa-success: #4CAF7A;
            --aa-success-soft: rgba(76,175,122,0.10);
            --aa-success-text: #388E5C;
            --aa-danger: #D65A5A;
            --aa-danger-soft: rgba(214,90,90,0.10);
            --aa-danger-text: #C0392B;
            --aa-warning: #D9A441;
            --aa-warning-soft: rgba(217,164,65,0.10);
            --aa-warning-text: #B8860B;
            --aa-shadow-soft-sm: 0 1px 2px var(--aa-glass-shadow), 0 2px 6px rgba(27,38,59,0.04);
            --aa-shadow-soft-md: 0 2px 4px var(--aa-glass-shadow), 0 4px 12px rgba(27,38,59,0.05), 0 8px 24px var(--aa-glass-shadow-deep);
            --aa-shadow-soft-lg: 0 4px 8px var(--aa-glass-shadow), 0 8px 20px rgba(27,38,59,0.06), 0 16px 40px var(--aa-glass-shadow-deep);
            --aa-shadow-button: 0 4px 14px rgba(0,168,255,0.28), inset 0 1px 0 rgba(255,255,255,0.35);
            --aa-radius-xs: 10px;
            --aa-radius-sm: 14px;
            --aa-radius-card: 22px;
            --aa-radius-lg: 28px;
            --aa-radius-button: 28px;
            --aa-radius-input: 16px;
            --aa-radius-pill: 999px;
            --aa-transition-fast: 0.12s ease;
            --aa-transition-base: 0.20s ease;
        }

        #answer-assistant-panel {
            position: fixed; top: 20px; right: 20px; width: 460px; max-height: 88vh;
            background: #fff;
            border: 1px solid var(--aa-border);
            border-radius: 10px;
            box-shadow: 0 0 24px -12px rgba(63,63,63,0.5);
            z-index: 999999;
            font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, 'Microsoft YaHei', sans-serif;
            overflow: hidden; color: #636363;
        }

        .panel-header {
            padding: 18px 20px 14px;
            display: flex; justify-content: space-between; align-items: center; cursor: move;
            user-select: none; background: transparent;
        }

        .panel-title {
            display: flex; align-items: center; gap: 10px;
            font-size: 18px; font-weight: 800; color: #333; margin: 0;
            letter-spacing: -0.3px;
        }

        .panel-actions { display: flex; gap: 8px; }

        .icon-btn {
            width: 32px; height: 32px; border: none; border-radius: 6px;
            background: transparent;
            border: 1px solid var(--aa-border-light);
            cursor: pointer; display: flex; align-items: center;
            justify-content: center; color: #636363; font-size: 16px;
            transition: all var(--aa-transition-base);
        }

        .icon-btn:hover { background: #f3f3f3; color: #333; }

        /* 标签导航 */
        .tab-nav {
            display: flex; background: #f7f8fa;
            padding: 4px; margin: 0 14px 14px; gap: 2px;
            border-radius: 6px;
            border: 1px solid var(--aa-border-light);
        }

        .tab-item {
            flex: 1; padding: 9px 4px; border: none; background: transparent;
            cursor: pointer; font-size: 12px; font-weight: 500; color: #636363;
            border-radius: 5px; transition: all var(--aa-transition-base);
        }

        .tab-item:hover { color: #333; }

        .tab-item.active {
            color: var(--aa-primary); background: rgba(0,168,255,0.08);
            border: 1px solid rgba(0,168,255,0.25);
            font-weight: 700;
        }

        /* 内容区域 */
        .panel-body { padding: 0 18px 18px; overflow-y: auto; max-height: calc(88vh - 150px); }

        .tab-pane { display: none; animation: fadeIn 0.28s ease-out; }

        .tab-pane.active { display: block; }

        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }

        /* 卡片 */
        .aa-card {
            background: #fff;
            border: 1px solid var(--aa-border-light);
            border-radius: 8px;
            padding: 14px;
            margin-bottom: 12px;
        }

        .tab-pane .aa-card:last-child { margin-bottom: 0; }

        .aa-card-title {
            font-size: 14px; font-weight: 700; color: #333;
            margin-bottom: 10px; letter-spacing: -0.1px;
        }

        /* 表单控件 */
        .form-field { margin-bottom: 14px; }

        .form-field:last-child { margin-bottom: 0; }

        .field-label {
            display: block; margin-bottom: 6px; font-size: 13px; font-weight: 600;
            color: #333;
        }

        .field-input, .field-select {
            width: 100%; height: 38px; padding: 0 10px;
            border: 1px solid var(--aa-border-light); border-radius: 4px;
            font-size: 14px; outline: none; transition: all var(--aa-transition-base);
            background: #eef2f7;
            color: #333; box-sizing: border-box;
        }

        .field-input:focus, .field-select:focus {
            border-color: var(--aa-primary);
            box-shadow: 0 0 4px rgba(0,168,255,0.20);
            background: #fff;
        }

        .field-input::placeholder { color: var(--aa-text-placeholder); }

        textarea.field-input { height: auto; padding: 12px 14px; line-height: 1.5; }

        /* 按钮 - OCS 描边风格 */
        .btn {
            height: 40px; padding: 0 18px; border: 1px solid var(--aa-border);
            border-radius: 6px;
            font-size: 14px; font-weight: 600; cursor: pointer;
            transition: all var(--aa-transition-base);
            display: inline-flex; align-items: center; justify-content: center; gap: 6px;
            background: #fff; color: var(--aa-text-body);
        }

        .btn::after { display: none; }

        .btn-primary {
            border-color: var(--aa-primary); color: var(--aa-primary);
            background: #fff;
        }

        .btn-primary:hover:not(:disabled) { background: rgba(0,168,255,0.06); }

        .btn-success {
            border-color: var(--aa-success); color: var(--aa-success-text);
            background: #fff;
        }

        .btn-success:hover:not(:disabled) { background: rgba(76,175,122,0.06); }

        .btn-warning {
            border-color: var(--aa-warning); color: var(--aa-warning-text);
            background: #fff;
        }

        .btn-warning:hover:not(:disabled) { background: rgba(217,164,65,0.06); }

        .btn-warning-outline {
            border-color: var(--aa-warning); color: var(--aa-warning-text);
            background: #fff;
        }

        .btn-warning-outline:hover:not(:disabled) { background: rgba(217,164,65,0.06); }

        .btn-danger {
            border-color: var(--aa-danger); color: var(--aa-danger-text);
            background: #fff;
        }

        .btn-danger:hover:not(:disabled) { background: rgba(214,90,90,0.06); }

        .btn-outline {
            border-color: var(--aa-border-light); color: var(--aa-text-body);
            background: #fff;
        }

        .btn-outline:hover:not(:disabled) { background: #f7f8fa; }

        .btn-delete {
            background: var(--aa-danger); color: #fff; border: none;
            width: 24px; height: 24px; border-radius: 50%;
            font-size: 14px; line-height: 20px;
            cursor: pointer; opacity: 0.85;
            transition: all var(--aa-transition-base); margin-left: 8px;
        }

        .btn-delete:hover { opacity: 1; }

        .btn:disabled { opacity: 0.55; cursor: not-allowed; transform: none !important; }

        .btn-block { width: 100%; }

        .btn-row { display: flex; gap: 10px; margin-top: 12px; }

        .btn-row .btn { flex: 1; }

        /* API卡片 */
        .api-card {
            background: #fff; border: 1px solid var(--aa-border-light);
            border-radius: 8px; padding: 12px; margin-bottom: 10px;
            transition: all var(--aa-transition-base);
        }

        .api-card:hover { border-color: var(--aa-border); }

        .api-card.selected { border-color: var(--aa-primary); background: rgba(0,168,255,0.04); }

        .api-card-header {
            display: flex; justify-content: space-between; align-items: center;
            cursor: pointer;
        }

        .api-name { font-weight: 600; font-size: 14px; color: #333; }

        .api-badge {
            font-size: 11px; padding: 3px 10px; border-radius: var(--aa-radius-pill); font-weight: 600;
        }

        .badge-ready { background: var(--aa-success-soft); color: var(--aa-success-text); }

        .badge-empty { background: var(--aa-danger-soft); color: var(--aa-danger-text); }

        .badge-checking { background: var(--aa-warning-soft); color: var(--aa-warning-text); animation: pulse 1.5s infinite; }

        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }

        .api-body { display: none; margin-top: 12px; }

        .api-body.show { display: block; animation: slideDown 0.25s ease; }

        @keyframes slideDown { from{opacity:0;max-height:0} to{opacity:1;max-height:500px} }

        /* 状态栏 */
        .status-bar {
            padding: 10px 12px; border-radius: 6px; font-size: 13px; font-weight: 500;
            margin-bottom: 12px; display: flex; align-items: center; gap: 8px;
            background: #f7f8fa; border: 1px solid var(--aa-border-light);
        }

        .status-idle { color: #999; }

        .status-running { background: rgba(0,168,255,0.06); border-color: rgba(0,168,255,0.15); color: var(--aa-primary); }

        .status-success { background: rgba(76,175,122,0.06); border-color: rgba(76,175,122,0.15); color: var(--aa-success-text); }

        .status-error { background: rgba(214,90,90,0.06); border-color: rgba(214,90,90,0.15); color: var(--aa-danger-text); }

        .status-dot {
            width: 8px; height: 8px; border-radius: 50%; background: currentColor;
            flex-shrink: 0;
        }

        .status-running .status-dot { animation: blink 1s infinite; }

        @keyframes blink { 50% { opacity: 0.3; } }

        /* 进度条 */
        .progress-wrap { margin: 14px 0; }

        .progress-info {
            display: flex; justify-content: space-between; font-size: 12px;
            color: #999; margin-bottom: 6px; font-weight: 500;
        }

        .progress-track {
            width: 100%; height: 8px; background: var(--aa-border-light); border-radius: 4px;
            overflow: hidden;
        }

        .progress-fill {
            height: 100%; background: var(--aa-primary);
            border-radius: 4px; transition: width 0.35s ease;
        }

        /* 日志区 */
        .log-area {
            height: 200px; overflow-y: auto; background: #1B263B; border-radius: var(--aa-radius-sm);
            padding: 14px; font-family: "Cascadia Code", "Fira Code", Consolas, monospace;
            font-size: 12px; line-height: 1.6; color: #E5E7EB;
        }

        .log-line { padding: 4px 0; border-bottom: 1px solid rgba(255,255,255,0.08); word-break: break-all; }

        .log-line:last-child { border-bottom: none; }

        .log-ts { color: #8B95A5; margin-right: 10px; user-select: none; }

        .log-msg-ok { color: var(--aa-success); }

        .log-msg-err { color: #FF7875; }

        .log-msg-warn { color: var(--aa-warning); }

        .log-msg-info { color: var(--aa-primary); }

        /* 设置项 */
        .setting-item {
            display: flex; justify-content: space-between; align-items: center;
            padding: 14px 0; border-bottom: 1px solid var(--aa-divider);
            gap: 12px;
        }

        .setting-item:last-child { border-bottom: none; padding-bottom: 0; }

        .setting-item:first-child { padding-top: 0; }

        .setting-label { font-size: 13px; color: #333; font-weight: 600; }

        .toggle-switch {
            position: relative; width: 50px; height: 28px; flex-shrink: 0;
        }

        .toggle-switch input { opacity: 0; width: 0; height: 0; }

        .toggle-slider {
            position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0;
            background: gainsboro; border-radius: 28px; transition: 0.25s;
        }

        .toggle-slider:before {
            content: ""; position: absolute; height: 20px; width: 20px;
            left: 4px; bottom: 4px; background: white; border-radius: 50%;
            transition: 0.25s; box-shadow: 0 2px 4px rgba(0,0,0,0.15);
        }

        input:checked + .toggle-slider { background: var(--aa-primary); }

        input:checked + .toggle-slider:before { transform: translateX(22px); }

        .radio-label {
            display: flex; align-items: center; gap: 8px;
            font-size: 13px; color: #636363; cursor: pointer;
        }

        .radio-label input[type="radio"] {
            width: 16px; height: 16px; accent-color: var(--aa-primary);
        }

        .study-switch-label {
            display: flex; align-items: center; gap: 6px;
            padding: 7px 10px; background: #f7f8fa;
            border: 1px solid var(--aa-border-light);
            border-radius: 5px; cursor: pointer; font-size: 12px; color: #636363;
        }

        .study-switch-label input[type="checkbox"] {
            width: 16px; height: 16px; accent-color: var(--aa-primary); margin: 0;
        }

        .type-label {
            display: inline-flex; align-items: center; gap: 6px;
            padding: 5px 11px; background: #f7f8fa;
            border: 1px solid var(--aa-border-light);
            border-radius: 5px; cursor: pointer; font-size: 12px;
            color: #636363; font-weight: 500;
        }

        .type-label input[type="checkbox"] {
            width: 16px; height: 16px; accent-color: var(--aa-primary); margin: 0;
        }

        /* 题目预览 */
        .question-preview {
            background: #f7f8fa; border: 1px solid var(--aa-border-light);
            border-radius: 6px; padding: 12px; margin-top: 12px;
        }

        .preview-q { font-size: 13px; line-height: 1.6; color: #333; margin-bottom: 10px; }

        .preview-a {
            font-size: 14px; line-height: 1.6; color: var(--aa-success-text); font-weight: 700;
            padding-top: 10px; border-top: 1px dashed var(--aa-border);
        }

        /* 通知提示 */
        .toast {
            position: fixed; top: 80px; right: 490px; padding: 12px 16px;
            background: #fff; border: 1px solid var(--aa-border-light);
            border-radius: 6px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.08); font-size: 13px; font-weight: 500;
            z-index: 1000000; animation: toastIn 0.3s ease; max-width: 300px;
            color: #333;
        }

        .toast.success { border-left: 3px solid var(--aa-success); }

        .toast.error { border-left: 3px solid var(--aa-danger); }

        .toast.info { border-left: 3px solid var(--aa-primary); }

        @keyframes toastIn { from{transform:translateX(24px);opacity:0} to{transform:translateX(0);opacity:1} }

        /* 模态框 */
        .aa-modal-overlay {
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.25);
            z-index: 999999; display: flex; align-items: center; justify-content: center;
        }

        .aa-modal {
            background: #fff;
            border: 1px solid var(--aa-border);
            border-radius: 10px;
            box-shadow: 0 8px 30px rgba(0,0,0,0.12);
            display: flex; flex-direction: column;
            font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, 'Microsoft YaHei', sans-serif;
            overflow: hidden;
            animation: scaleIn 0.3s ease-out;
        }

        @keyframes scaleIn { from { opacity: 0; transform: scale(0.92); } to { opacity: 1; transform: scale(1); } }

        .aa-modal-header {
            padding: 18px 20px; border-bottom: 1px solid var(--aa-border-light);
            display: flex; align-items: center; justify-content: space-between; flex-shrink: 0;
        }

        .aa-modal-title { font-size: 16px; font-weight: 700; color: #333; }

        .aa-modal-subtitle { font-size: 13px; font-weight: 500; color: #999; }

        .aa-modal-body { padding: 20px 24px; overflow-y: auto; flex: 1; }

        .aa-modal-footer {
            padding: 14px 24px 24px; border-top: 1px solid var(--aa-divider);
            display: flex; gap: 10px; justify-content: flex-end; flex-shrink: 0;
        }
    `);
    }

    // ==================== 内置学习网站白名单 ====================
    // 平台注册：name + 域名列表 + 该平台专用刷课选区器
    const PLATFORMS = [
        {
            id: 'chaoxing',
            name: '超星学习通',
            domains: [
                'chaoxing.com', 'edu.cn', 'org.cn', 'xueyinonline.com',
                'hnsyu.net', 'qutjxjy.cn', 'ynny.cn', 'hnvist.cn',
                'fjlecb.cn', 'gdhkmooc.com', 'cugbonline.cn', 'zjelib.cn',
                'cqrspx.cn', 'neauce.com', 'zhihui-yun.com', 'cqie.cn',
                'ccqmxx.com', 'jxgmxy.com', 'jnzyjsxy.cn', 'sslibrary.com',
                'mooc1.chaoxing.com', 'hw.smartstudy.com', 'passport2.chaoxing.com'
            ],
            // 任务点跳转/下一个：超星专用
            selectors: {
                nextBtn: '#rightNextBtn, .next, .nextChapter, .jb_btn[jb-type="right"], .ncells .currents ~ a',
                taskPoint: '.posCatalog_active, .tabtags, .clearfix.tabs .currents',
                videoContainer: '#iframe, .video, .ans-job-icon',
                quizContainer: '.xuexi .TiMu, .topic, .questionLi, .TiMu',
                // 超星内嵌视频题目
                videoQuizPanel: '.x-tiku_show, .x-fur-window, .popup',
                videoQuizOption: '.x-tiku_show .x-tiku-options input, .x-fur-window .fur-answer input',
                videoQuizSubmit: '.x-tiku_show .x-tiku-submit, .x-fur-window .fur-submit',
                // 超星人脸识别（老 + 新）
                faceOld: '#fcqrimg',
                faceNew: '.chapterVideoFaceMaskDiv',
                // 超星视频错误弹窗
                errorDialog: '.vjs-modal-dialog-content',
                // 任务点完成icon（绿色对勾）
                taskDoneIcon: '.ans-job-icon, .icon_Completed, .done',
                // 视频学习引导提示
                guideText: '请手动进入视频、作业、考试页面'
            }
        },
        {
            id: 'zhihuishu',
            name: '知到智慧树',
            domains: [
                'zhihuishu.com', 'hike-teaching-center.polymas.com',
                'onlineweb.zhihuishu.com', 'studyvideoh5.zhihuishu.com',
                'studyplush5.zhihuishu.com', 'fusioncourseh5.zhihuishu.com',
                'studywisdomh5.zhihuishu.com'
            ],
            selectors: {
                nextBtn: '.next_button, .topic-switch, .next-section, .right-btn',
                taskPoint: '.clearfix.task-list, .chapter-content .item',
                videoContainer: 'video, .video-box, #video-box',
                quizContainer: '.subject_describe, .questionContent, .topic-item',
                videoQuizPanel: '.topic-item, .dialog-topic',
                videoQuizOption: '.topic-item .option input, .topic-item .topic-option',
                videoQuizSubmit: '.topic-item .btn-submit, .dialog-topic .btn-submit',
                faceOld: '',
                faceNew: '',
                errorDialog: '.vjs-modal-dialog-content, .el-message-box',
                taskDoneIcon: '.icon-finish, .finish',
                guideText: '智慧树倍速最高1.5x，1-2倍才安全'
            }
        },
        {
            id: 'icve',
            name: '智慧职教',
            domains: [
                'icve.com.cn', 'ai.icve.com.cn', 'course.icve.com.cn',
                'courshare.cn', 'webtrn.cn', 'user.icve.com.cn', 'mooc.icve.com.cn'
            ],
            selectors: {
                nextBtn: '.next, .next-chapter, .btn-next',
                taskPoint: '.tabsel.seled, .h_cells a',
                videoContainer: 'video, .docBox',
                quizContainer: '.exam-question, .TiMu',
                videoQuizPanel: '',
                videoQuizOption: '',
                videoQuizSubmit: '',
                faceOld: '',
                faceNew: '',
                errorDialog: '.vjs-modal-dialog-content',
                taskDoneIcon: '.icon-finish',
                guideText: '智慧职教：点击课程目录里任意章节进入'
            }
        },
        {
            id: 'zjy',
            name: '职教云',
            domains: ['icve.com.cn', 'zjy2.icve.com.cn', 'zyk.icve.com.cn'],
            selectors: {
                nextBtn: '.next, .courseware-next, .btn-next',
                taskPoint: '.classroom_activities .active_list, .catalog_list li',
                videoContainer: 'video, .docBox',
                quizContainer: '.test-question, .TiMu',
                videoQuizPanel: '',
                videoQuizOption: '',
                videoQuizSubmit: '',
                faceOld: '',
                faceNew: '',
                errorDialog: '.vjs-modal-dialog-content',
                taskDoneIcon: '.finish, .icon-ok',
                guideText: '职教云：进入课程后点任意章节，脚本自动跑'
            }
        },
        {
            id: 'mooc163',
            name: '中国大学MOOC',
            domains: ['icourse163.org'],
            selectors: {
                nextBtn: '.next, .j-next, .nextUnit, .j-up',
                taskPoint: '.chapter-item, .j-listItem, .u-line-1',
                videoContainer: 'video, .j-media',
                quizContainer: '.u-questionItem, .j-problemContent',
                videoQuizPanel: '.u-questionItem',
                videoQuizOption: '.u-questionItem input[type=radio], .u-questionItem input[type=checkbox]',
                videoQuizSubmit: '.u-questionItem .j-submit, .u-questionItem .submitBtn',
                faceOld: '',
                faceNew: '',
                errorDialog: '.vjs-modal-dialog-content, .m-popup',
                taskDoneIcon: '.j-finishIcon, .icon-finish',
                guideText: 'MOOC：进入课程任意章节即可'
            }
        },
        {
            id: 'yuketang',
            name: '雨课堂',
            domains: ['yuketang.cn'],
            selectors: {
                nextBtn: '.next-section, .right-btn, .leaf-list .leaf-detail',
                taskPoint: '.leaf-detail, .chapter-list .leaf',
                videoContainer: '#video-box, video',
                quizContainer: '.problem-content, .question',
                videoQuizPanel: '.digital-human-video-element-selector, video',
                videoQuizOption: '',
                videoQuizSubmit: '',
                faceOld: '',
                faceNew: '',
                errorDialog: '.el-message-box, .vjs-modal-dialog-content',
                taskDoneIcon: '.finish-icon, .j-finishIcon',
                guideText: '雨课堂：进入课程点任意小节'
            }
        },
        {
            id: 'ucampus',
            name: 'U校园',
            domains: ['u-campus.cn', 'www.ucampus.unipus.cn', 'ucampus.unipus.cn'],
            selectors: {
                nextBtn: '.next, .next-unit, .arrow-right',
                taskPoint: '.unit-list, .task-list',
                videoContainer: 'video, .video-content',
                quizContainer: '.question, .test-item',
                videoQuizPanel: '',
                videoQuizOption: '',
                videoQuizSubmit: '',
                faceOld: '',
                faceNew: '',
                errorDialog: '',
                taskDoneIcon: '.icon-finish',
                guideText: 'U校园：进入课程目录点击单元'
            }
        },
        {
            id: 'xuetangx',
            name: '学堂在线',
            domains: ['xuetangx.com', 'www.xuetangx.com'],
            selectors: {
                nextBtn: '.xt_video_player_next, .next',
                taskPoint: '.seq_nav .seq_contents li',
                videoContainer: 'video, #xt_video_player',
                quizContainer: '.problem, .problem_content',
                videoQuizPanel: '',
                videoQuizOption: '',
                videoQuizSubmit: '',
                faceOld: '',
                faceNew: '',
                errorDialog: '.vjs-modal-dialog-content',
                taskDoneIcon: '.finished, .xt_finished',
                guideText: '学堂在线：进入课程点任意小节'
            }
        },
        {
            id: 'cnmooc',
            name: '好大学在线',
            domains: ['cnmooc.org', 'www.cnmooc.org'],
            selectors: {
                nextBtn: '.next-lesson, .next, .lesson-next',
                taskPoint: '.chapter-item, .lesson-item',
                videoContainer: 'video, .video-player',
                quizContainer: '.question-item, .quiz-item, .problem',
                videoQuizPanel: '',
                videoQuizOption: '',
                videoQuizSubmit: '',
                faceOld: '',
                faceNew: '',
                errorDialog: '.vjs-modal-dialog-content',
                taskDoneIcon: '.finished, .completed',
                guideText: '好大学在线：进入课程点任意章节'
            }
        },
        {
            id: 'ulearning',
            name: '优学院',
            domains: ['ulearning.cn', 'www.ulearning.cn', 'app.ulearning.cn'],
            selectors: {
                nextBtn: '.next-btn, .next, .btn-next',
                taskPoint: '.chapter-item, .course-item, .unit-item',
                videoContainer: 'video, .video-box',
                quizContainer: '.question-item, .exam-item, .topic-item',
                videoQuizPanel: '',
                videoQuizOption: '',
                videoQuizSubmit: '',
                faceOld: '',
                faceNew: '',
                errorDialog: '.el-message-box, .vjs-modal-dialog-content',
                taskDoneIcon: '.complete, .finished',
                guideText: '优学院：进入课程点任意章节'
            }
        },
        {
            id: 'phmooc',
            name: '人卫慕课',
            domains: ['phmooc.com', 'www.phmooc.com'],
            selectors: {
                nextBtn: '.next, .next-chapter, .btn-next',
                taskPoint: '.chapter-item, .lesson-item, .course-menu-item',
                videoContainer: 'video, .video-js',
                quizContainer: '.question-item, .test-item, .quiz-question',
                videoQuizPanel: '',
                videoQuizOption: '',
                videoQuizSubmit: '',
                faceOld: '',
                faceNew: '',
                errorDialog: '.vjs-modal-dialog-content',
                taskDoneIcon: '.finished, .icon-complete',
                guideText: '人卫慕课：进入课程点任意章节'
            }
        },
        {
            id: 'chinesemooc',
            name: '华文慕课',
            domains: ['chinesemooc.org', 'www.chinesemooc.org'],
            selectors: {
                nextBtn: '.next, .next-unit, .courseware-next',
                taskPoint: '.chapter-item, .unit-item',
                videoContainer: 'video, .video-player',
                quizContainer: '.question-item, .quiz-item',
                videoQuizPanel: '',
                videoQuizOption: '',
                videoQuizSubmit: '',
                faceOld: '',
                faceNew: '',
                errorDialog: '.vjs-modal-dialog-content',
                taskDoneIcon: '.finished, .complete',
                guideText: '华文慕课：进入课程点任意章节'
            }
        },
        {
            id: 'gaoxiaobang',
            name: '高校邦',
            domains: ['gaoxiaobang.com', 'www.gaoxiaobang.com'],
            selectors: {
                nextBtn: '.next, .next-lesson, .btn-next',
                taskPoint: '.chapter-item, .lesson-item, .catalog-item',
                videoContainer: 'video, .video-box, .video-js',
                quizContainer: '.question-item, .topic-item, .test-question',
                videoQuizPanel: '',
                videoQuizOption: '',
                videoQuizSubmit: '',
                faceOld: '',
                faceNew: '',
                errorDialog: '.vjs-modal-dialog-content',
                taskDoneIcon: '.finished, .icon-finish',
                guideText: '高校邦：进入课程点任意章节'
            }
        },
        {
            id: 'kaoshixing',
            name: '考试星',
            domains: ['kaoshixing.com', 'exam.kaoshixing.com', 'www.kaoshixing.com'],
            selectors: {
                nextBtn: '.next, .next-question, .btn-next',
                taskPoint: '',
                videoContainer: '',
                quizContainer: '.question-item, .exam-question, .question-box',
                videoQuizPanel: '',
                videoQuizOption: '',
                videoQuizSubmit: '',
                faceOld: '',
                faceNew: '',
                errorDialog: '',
                taskDoneIcon: '',
                guideText: '考试星：打开考试页面后点击开始答题'
            }
        },
        {
            id: 'xiaoeknow',
            name: '小鹅通',
            domains: ['h5.xiaoeknow.com', 'xiaoeknow.com', 'www.xiaoeknow.com'],
            selectors: {
                nextBtn: '.next, .btn-next, .submit-btn',
                taskPoint: '',
                videoContainer: 'video, .video-player',
                quizContainer: '.practice-detail__body, .question-item, .exam-item',
                videoQuizPanel: '',
                videoQuizOption: '',
                videoQuizSubmit: '',
                faceOld: '',
                faceNew: '',
                errorDialog: '',
                taskDoneIcon: '',
                guideText: '小鹅通：进入课程考试或练习页面'
            }
        },
        {
            id: 'qingshuxuetang',
            name: '青书学堂',
            domains: ['qingshuxuetang.com', 'quiz.qingshuxuetang.com', 'www.qingshuxuetang.com'],
            selectors: {
                nextBtn: '.next, .btn-next, .submit-paper',
                taskPoint: '',
                videoContainer: 'video, .video-box',
                quizContainer: '.question-detail-container, .question-item, .paper-container',
                videoQuizPanel: '',
                videoQuizOption: '',
                videoQuizSubmit: '',
                faceOld: '',
                faceNew: '',
                errorDialog: '',
                taskDoneIcon: '',
                guideText: '青书学堂：进入作业/考试页面'
            }
        },
        {
            id: 'ouchn',
            name: '国家开放大学',
            domains: ['ouchn.cn', 'lms.ouchn.cn', 'zzx.ouchn.edu.cn', 'old-zzx.ouchn.edu.cn', 'www.ouchn.cn'],
            selectors: {
                nextBtn: '.next, .btn-next, .submit-btn',
                taskPoint: '.chapter-item, .catalog-item, .lesson-item',
                videoContainer: 'video, .video-player',
                quizContainer: '.subject, .question-item, .question-box',
                videoQuizPanel: '',
                videoQuizOption: '',
                videoQuizSubmit: '',
                faceOld: '',
                faceNew: '',
                errorDialog: '',
                taskDoneIcon: '.finished, .complete',
                guideText: '国开：进入课程学习或考试页面'
            }
        },
        {
            id: 'wangxiao168',
            name: '168网校',
            domains: ['168wangxiao.com', 'www.168wangxiao.com'],
            selectors: {
                nextBtn: '.next, .btn-next, .submit-btn',
                taskPoint: '.chapter-item, .lesson-item',
                videoContainer: 'video, .video-player',
                quizContainer: '.question-item-container, .Answer-area, .question-box',
                videoQuizPanel: '',
                videoQuizOption: '',
                videoQuizSubmit: '',
                faceOld: '',
                faceNew: '',
                errorDialog: '',
                taskDoneIcon: '',
                guideText: '168网校：进入学习中心或考试页面'
            }
        },
        {
            id: 'zjooc',
            name: '浙江高校在线开放课程共享平台',
            domains: ['zjooc.cn', 'www.zjooc.cn'],
            selectors: {
                nextBtn: '.next, .btn-next, .submit-btn',
                taskPoint: '.chapter-item, .course-item',
                videoContainer: 'video, .video-box',
                quizContainer: '.question-item, .question-box, .homework-item',
                videoQuizPanel: '',
                videoQuizOption: '',
                videoQuizSubmit: '',
                faceOld: '',
                faceNew: '',
                errorDialog: '',
                taskDoneIcon: '.finished, .complete',
                guideText: '浙江高校在线：进入课程作业/考试页面'
            }
        },
        {
            id: 'faxuanyun',
            name: '法宣在线',
            domains: ['faxuanyun.com', 'www.faxuanyun.com'],
            selectors: {
                nextBtn: '.next, .btn-next, .submit-btn',
                taskPoint: '.chapter-item, .lesson-item',
                videoContainer: 'video, .video-player',
                quizContainer: '#timucontent, .question-item, .question-box',
                videoQuizPanel: '',
                videoQuizOption: '',
                videoQuizSubmit: '',
                faceOld: '',
                faceNew: '',
                errorDialog: '',
                taskDoneIcon: '',
                guideText: '法宣在线：进入考试页面'
            }
        },
        {
            id: 'youkexuetang',
            name: '优课学堂',
            domains: ['youkexuetang.cn', 'www.youkexuetang.cn'],
            selectors: {
                nextBtn: '.next, .btn-next, .submit-btn',
                taskPoint: '.chapter-item, .lesson-item, .catalog-item',
                videoContainer: 'video, .video-player',
                quizContainer: '.paperItemBox, .question-item, .question-box',
                videoQuizPanel: '',
                videoQuizOption: '',
                videoQuizSubmit: '',
                faceOld: '',
                faceNew: '',
                errorDialog: '',
                taskDoneIcon: '.finished, .complete',
                guideText: '优课学堂：进入课程考试页面'
            }
        },
        {
            id: 'yixuebaoyun',
            name: '亿学宝云',
            domains: ['yxbyun.com', 'www.yxbyun.com'],
            selectors: {
                nextBtn: '.next, .btn-next, .submit-btn',
                taskPoint: '.chapter-item, .lesson-item',
                videoContainer: 'video, .video-player',
                quizContainer: '.danxuan, .test, .question-item, .question-box',
                videoQuizPanel: '',
                videoQuizOption: '',
                videoQuizSubmit: '',
                faceOld: '',
                faceNew: '',
                errorDialog: '',
                taskDoneIcon: '',
                guideText: '亿学宝云：进入考试页面'
            }
        }
    ];

    // 扁平化白名单 = 所有平台的 domain 并集 + 一些其他通用域
    const DEFAULT_WHITELIST = [
        ...new Set(PLATFORMS.flatMap(p => p.domains)),
        // 通用站点
        'study.163.com',     // 网易云课堂
        'open.163.com',      // 网易公开课
        'coursera.org', 'www.coursera.org',  // Coursera
        'edx.org', 'www.edx.org',            // edX
        'www.icourse6.net',  // 爱课程
        'ke.qq.com',         // 腾讯课堂
        'classcentral.com'   // Class Central
    ];

    /**
     * 检测当前网站属于哪个平台
     * @returns {object|null} 平台对象 或 null（不在白名单）
     */
    function hostMatchesDomain(host, domain) {
        const normalizedHost = String(host || '').toLowerCase();
        const normalizedDomain = String(domain || '').trim().toLowerCase();
        if (!normalizedHost || !normalizedDomain) return false;
        return normalizedHost === normalizedDomain || normalizedHost.endsWith('.' + normalizedDomain);
    }

    function detectPlatform() {
        const host = (location.hostname || '').toLowerCase();
        for (const p of PLATFORMS) {
            for (const d of p.domains) {
                if (hostMatchesDomain(host, d)) {
                    return p;
                }
            }
        }
        // 不在任何已知平台
        return null;
    }

    // isWhitelisted() 的完整版本在下方（包含 state.settings 检查 + 自定义白名单）
    // 此处只保留 detectPlatform() 即可

    function isVisibleForLoginDetection(el) {
        if (!el) return false;
        try {
            const rect = el.getBoundingClientRect();
            if (!rect || rect.width < 8 || rect.height < 8) return false;
            const style = window.getComputedStyle(el);
            if (!style) return true;
            if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) === 0) {
                return false;
            }
            return true;
        } catch (e) {
            return true;
        }
    }

    /**
     * 检测当前页面是否为登录页（避免在登录页启动刷课/跳转）
     * 仅认定明确登录 URL，或当前页面存在可见的登录表单。
     */
    function isLoginPage() {
        const href = String(location.href || '').toLowerCase();
        const pathname = String(location.pathname || '').toLowerCase();
        const hostname = String(location.hostname || '').toLowerCase();

        if ((/(^|\/)(login|signin)(\/|$|[.?#-])/i.test(pathname) || /(^|\/)auth(\/|$|[.?#-])/i.test(pathname)) &&
            !/(course|chapter|work|exam|test|study|video|lesson|task)/i.test(pathname)) {
            return true;
        }

        if (/^passport\d*\./i.test(hostname) && !/(course|chapter|work|exam|study|video|lesson|task)/i.test(href)) {
            return true;
        }

        const visiblePasswords = Array.from(document.querySelectorAll('input[type="password"]'))
            .filter(isVisibleForLoginDetection);
        if (!visiblePasswords.length) return false;

        const visibleLoginBtns = Array.from(document.querySelectorAll('button, input[type="submit"], a, span, div'))
            .filter(isVisibleForLoginDetection)
            .filter(el => {
                const text = (el.textContent || el.value || '').trim();
                return /^(登录|登陆|login|sign in)$/i.test(text) || /立即登录|马上登录|账号登录|密码登录/i.test(text);
            });

        if (!visibleLoginBtns.length) return false;

        return visiblePasswords.some(pwd => {
            const scope = pwd.closest('form, [class*="login"], [id*="login"], [class*="signin"], [id*="signin"], [class*="passport"], [id*="passport"]') || pwd.parentElement;
            if (!scope) return false;
            return visibleLoginBtns.some(btn => scope.contains(btn) || btn.closest('form') === pwd.closest('form'));
        });
    }

    /**
     * 判定当前页面是否为"刷课界面"（任务点学习页）。
     * 依据 2026-09 真机抓包确认的 URL 特征：
     *   - /mycourse/studentstudy          学生学习页面（章节学习页，内含 #iframe 知识卡片）
     *   - …/knowledge/cards               知识卡片任务点页（iframe 实抓路径 /mooc-ans/knowledge/cards）
     *   - …/ananas/modules/               视频播放器 iframe（刷课 worker 所在地，脚本注释确认）
     * 以下均不属于刷课界面：
     *   - /visit/interaction              课程列表页（"我学的课"）
     *   - /mooc2-ans/mycourse/stu、/mycourse/studentcourse   课程门户/章节目录页
     *   - /base、/space/…                 个人空间/空间站
     *   - 登录页 passport2.chaoxing.com/login
     * 非刷课界面禁止自动启动刷课，主循环也会暂停全部刷课动作，
     * 避免在课程列表/空间等页面误提示"刷课"、误点"确定"确认站点刷新提示、误跳章节。
     */
    function isStudyInterface() {
        const pathname = String(location.pathname || '').toLowerCase();
        // 学习通现在把学习页挂在带前缀的路径上：/mooc-ans/mycourse/studentstudy、
        // /mooc2-ans/mycourse/studentstudy（新版超星路由），旧版才是 /mycourse/studentstudy。
        // 修复（2026-10-21 真机核验）：原来用 indexOf(...) === 0 锚定匹配，
        // 遇到 mooc-ans / mooc2-ans 前缀直接判为"非刷课界面"→ 整个刷课功能静默不启动。
        // 现改为「路径中包含 /mycourse/studentstudy」，与 OCS 5.2.1 的判断口径一致。
        return /\/mycourse\/studentstudy/.test(pathname) ||
               /\/knowledge\/cards/.test(pathname) ||
               /\/ananas\/modules\//.test(pathname);
    }

    // ==================== 全局状态 ====================
    const state = {
        isRunning: false,
        shouldStop: false,
        currentIndex: 0,
        totalQuestions: 0,
        answeredCount: 0,
        selectedAPIId: null,
        questionArea: null,
        questionCache: new Map(),
        logs: [],
        portalAccess: {
            blocked: false,
            blockedReason: '',
            connected: false,
            lastSyncAt: 0,
            lastError: '',
            integrityStatus: 'pending',
            metaHash: ''
        },
        // 保存暂停时的进度
        lastProcessedIndex: 0,  // 上次处理到第几题
        questionsList: [],       // 题目列表缓存
        settings: {
            autoSearch: true,        // 自动搜题
            searchEngine: 'baidu',  // 搜索引擎：baidu/google/bing
            autoFill: true,          // 自动填写
            autoNext: true,          // 自动下一题
            delayTime: 1500,         // 延迟时间(ms)
            useCache: true,          // 使用缓存
            enableDualAPI: false,    // 启用双API对比
            secondAPIId: null,       // 第二个API
            questionTypes: ['all'],  // 要做的题目类型
            startMode: 'beginning', // 答题起始模式: beginning(从头开始), unanswered(从没做的开始), continue(继续上次进度)
            enableWhitelist: true,   // 是否启用网站白名单
            customWhitelist: [],     // 用户自定义网站白名单
            // 题库相关
            // 题库列表：[{id, name, url, enabled}]
            // 默认带官方题库（2026-10-23 接后端）。老用户保存过的配置会整体覆盖默认值，
            // 所以 loadAllConfig() 里还有一处 ensureDefaultTikuList() 负责补回来。
            tikuList: [{
                id: 'xspirt',
                name: '我的题库（官方）',
                url: 'https://xspirt.online/tiku-api/tiku',
                enabled: true
            }],
            tikuEnabled: true,       // 总开关：是否启用题库
            tikuRevalidate: false,   // 题库有答案时，是否再复查一次
            reviewMode: false,       // 复查模式：勾选后，再次验证所有已做题目，不一致则清除
            // 刷课相关
            studyEnabled: false,     // 总开关：是否启用刷课
            studyRate: 1.5,          // 视频倍速（1.0~16.0）
            studyVolume: 0,          // 视频音量（0~1）
            studyAntiPause: true,    // 反鼠标检测：鼠标离开视频不暂停
            studyAutoUnpause: true,  // 自动解除暂停：检测到暂停就播放
            studyAutoNext: true,     // 自动跳转：当前任务点完成后跳到下一个
            studyLoop: true,         // 自动连播：视频结束后自动连播下一个
            studyAutoCloseDialog: true, // 自动关弹窗：检测到弹窗（习惯分/确认）自动关闭
            skipExercise: false,     // true=总是跳过习题；false=智能模式（配了作答引擎就自动作答并保存，没配就等外部答题脚本，超时跳过）
            studyHandleVideoQuiz: true, // 自动做视频内嵌题目（学习通视频里弹出的选择题）
            studyAutoStartOnLoad: false, // 进入学习页面时自动启动刷课
            studyAlwaysStartFromEarliest: true, // 每次都从最早未完成章节开始刷
            // 读章节 + 讨论
            studyReadTask: true,         // 自动读章节（PPT/书籍/长时阅读）
            readSpeed: 1,                // 翻页速度（秒/页）1~10
            studyAutoDiscuss: true,      // 讨论自动回复
            studyDiscussMode: 'random',  // 讨论模式: random/first/lastest/max-show-up/max-fav
            portalServerBase: 'https://xspirt.online',  // 站点域名（公开入口）
            portalAuthToken: '',         // 公开接口令牌
            portalRemoteNotice: true,    // 接收站点公告
            portalRemoteConfig: true,    // 接收站点配置
            portalUploadLogs: true,      // 上传运行日志
            portalStrictMode: false,     // 站点服务离线时禁用脚本
            portalOfflineGraceMinutes: 30, // 站点服务离线宽限时间（分钟）
            portalTamperCheck: true,     // 基础防篡改校验
            portalOpenPath: '/portal/resource/chaoxing-script' // 站点详情页路径
        }
    };

    // ==================== 网站白名单检查 ====================
    function isWhitelisted() {
        // 如果未启用白名单，返回true
        if (!state.settings.enableWhitelist) {
            return true;
        }

        const currentHost = (window.location.hostname || '').toLowerCase();

        // 检查内置白名单
        for (const domain of DEFAULT_WHITELIST) {
            if (hostMatchesDomain(currentHost, domain)) {
                return true;
            }
        }

        // 检查用户自定义白名单
        for (const domain of state.settings.customWhitelist) {
            if (hostMatchesDomain(currentHost, domain)) {
                return true;
            }
        }

        return false;
    }

    // ==================== 日志系统 ====================
    function addLog(msg, type = 'info') {
        const ts = new Date().toLocaleTimeString('zh-CN', { hour12: false });
        const text = String(msg || '');
        const entry = {
            id: `${PORTAL_PAGE_SESSION_ID}_${++portalLogSequence}`,
            seq: portalLogSequence,
            ts,
            msg: text,
            type
        };
        state.logs.push(entry);
        if (state.logs.length > 150) state.logs.shift();

        const el = document.getElementById('log-container');
        if (!el) return;

        const div = document.createElement('div');
        div.className = 'log-line';
        const tsSpan = document.createElement('span');
        tsSpan.className = 'log-ts';
        tsSpan.textContent = `[${ts}]`;
        const msgSpan = document.createElement('span');
        msgSpan.className = `log-msg-${type}`;
        msgSpan.textContent = text;
        div.appendChild(tsSpan);
        div.appendChild(msgSpan);
        el.appendChild(div);
        el.scrollTop = el.scrollHeight;
    }

    // 面板创建（或重建）后，用 state.logs 重建日志区。
    // 启动阶段的 addLog 在容器缺失时只入队不渲染，不回放的话早期日志永远看不到
    function replayLogs() {
        const el = document.getElementById('log-container');
        if (!el) return;
        el.innerHTML = '';
        state.logs.forEach(entry => {
            const div = document.createElement('div');
            div.className = 'log-line';
            const tsSpan = document.createElement('span');
            tsSpan.className = 'log-ts';
            tsSpan.textContent = `[${entry.ts}]`;
            const msgSpan = document.createElement('span');
            msgSpan.className = `log-msg-${entry.type}`;
            msgSpan.textContent = entry.msg;
            div.appendChild(tsSpan);
            div.appendChild(msgSpan);
            el.appendChild(div);
        });
        el.scrollTop = el.scrollHeight;
    }

    function showStatus(text, type = 'idle') {
        const bar = document.getElementById('status-bar');
        if (!bar) return;
        bar.className = `status-bar status-${type}`;
        bar.innerHTML = `<div class="status-dot"></div>${text}`;
    }

    function showToast(msg, type = 'info') {
        const t = document.createElement('div');
        t.className = `toast ${type}`;
        t.textContent = msg;
        document.body.appendChild(t);
        setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 2800);
    }

    // ==================== 站点公开接口联动 ====================
    const PORTAL_CLIENT_ID_KEY = 'smart_answer_assistant_portal_client_id';
    const PORTAL_LAST_ANNOUNCEMENT_KEY = 'smart_answer_assistant_portal_last_announcement';
    const PORTAL_LAST_UPDATE_KEY = 'smart_answer_assistant_portal_last_update';
    const PORTAL_LAST_BLOCK_KEY = 'smart_answer_assistant_portal_last_block';
    const PORTAL_LAST_OK_KEY = 'smart_answer_assistant_portal_last_ok';
    const PORTAL_LAST_SETTINGS_KEY = 'smart_answer_assistant_portal_last_settings';
    const PORTAL_LAST_COMMAND_KEY = 'smart_answer_assistant_portal_last_command';
    const PORTAL_HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000;
    const PORTAL_PAGE_SESSION_ID = 'portal_page_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    let portalHeartbeatTimer = null;
    let portalLogSequence = 0;
    let portalLastUploadedLogSeq = 0;
    let portalIntegrityPromise = null;

    function getGMInfoSafe() {
        try {
            return typeof GM_info !== 'undefined' ? GM_info : null;
        } catch (e) {
            return null;
        }
    }

    function normalizePortalServerBase(input) {
        let value = String(input || '').trim();
        if (!value) return '';
        if (!/^https?:\/\//i.test(value)) {
            value = (/^(localhost|127\.0\.0\.1)/i.test(value) ? 'http://' : 'https://') + value;
        }
        return value.replace(/\/+$/, '');
    }

    function normalizePortalRelativePath(input) {
        const value = String(input || '').trim();
        if (!value) return '/portal/resource/chaoxing-script';
        return value.startsWith('/') ? value : '/' + value;
    }

    function inferPortalServerBase() {
        if (state.settings.portalServerBase) {
            return normalizePortalServerBase(state.settings.portalServerBase);
        }
        try {
            const gmInfo = getGMInfoSafe();
            const downloadURL = gmInfo && gmInfo.script ? (gmInfo.script.downloadURL || gmInfo.script.updateURL || '') : '';
            if (downloadURL && /\/api\/public\/download\//.test(downloadURL)) {
                return normalizePortalServerBase(new URL(downloadURL).origin);
            }
        } catch (e) {}
        return '';
    }

    function getPortalServerBase() {
        const inferred = inferPortalServerBase();
        if (inferred && inferred !== state.settings.portalServerBase) {
            state.settings.portalServerBase = inferred;
            saveAllConfig();
        }
        return inferred;
    }

    function getPortalOpenPath() {
        return normalizePortalRelativePath(state.settings.portalOpenPath);
    }

    function getPortalClientId() {
        let clientId = GM_getValue(PORTAL_CLIENT_ID_KEY);
        if (!clientId) {
            clientId = 'portal_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
            GM_setValue(PORTAL_CLIENT_ID_KEY, clientId);
        }
        return clientId;
    }

    function getPortalAuthToken() {
        return String(state.settings.portalAuthToken || '').trim();
    }

    function getPortalOfflineGraceMs() {
        const mins = Math.max(1, Math.min(1440, parseInt(state.settings.portalOfflineGraceMinutes, 10) || 30));
        return mins * 60 * 1000;
    }

    function formatPortalSyncTime(ts) {
        if (!ts) return '尚未同步';
        const diff = Math.max(0, Date.now() - ts);
        if (diff < 60 * 1000) return '刚刚同步';
        const mins = Math.floor(diff / 60000);
        if (mins < 60) return `${mins} 分钟前同步`;
        const hours = Math.floor(mins / 60);
        if (hours < 24) return `${hours} 小时前同步`;
        const days = Math.floor(hours / 24);
        return `${days} 天前同步`;
    }

    function renderPortalStatus() {
        const textEl = document.getElementById('portal-status-text');
        const extraEl = document.getElementById('portal-status-extra');
        const clientEl = document.getElementById('portal-client-id');
        if (clientEl) {
            clientEl.textContent = `客户端ID：${getPortalClientId()}`;
        }
        if (!textEl || !extraEl) return;

        if (state.portalAccess.blocked) {
            textEl.textContent = '已限制';
            textEl.style.color = '#FF4D4F';
            extraEl.textContent = state.portalAccess.blockedReason || '该脚本客户端已被管理员限制使用';
            return;
        }

        if (!getPortalServerBase()) {
            textEl.textContent = '未配置';
            textEl.style.color = '#999';
            extraEl.textContent = '请先填写站点地址';
            return;
        }

        if (state.portalAccess.connected) {
            textEl.textContent = '已连接';
            textEl.style.color = '#16a34a';
            let extraText = formatPortalSyncTime(state.portalAccess.lastSyncAt);
            if (state.portalAccess.integrityStatus === 'mismatch') {
                extraText += ' · 元信息校验异常';
            } else if (state.portalAccess.integrityStatus === 'ok') {
                extraText += ' · 元信息正常';
            }
            extraEl.textContent = extraText;
            return;
        }

        textEl.textContent = '未连接';
        textEl.style.color = '#d97706';
        extraEl.textContent = state.portalAccess.lastError || '等待连接站点服务';
    }

    function setPortalConnectionState(connected, errorText = '') {
        state.portalAccess.connected = !!connected;
        if (connected) {
            state.portalAccess.lastSyncAt = Date.now();
            state.portalAccess.lastError = '';
            GM_setValue(PORTAL_LAST_OK_KEY, state.portalAccess.lastSyncAt);
        } else if (errorText) {
            state.portalAccess.lastError = errorText;
        }
        renderPortalStatus();
    }

    function handlePortalOffline(source = 'auto', errorText = '站点服务连接失败') {
        setPortalConnectionState(false, errorText);
        if (!state.settings.portalStrictMode || !getPortalServerBase()) return;

        const graceMs = getPortalOfflineGraceMs();
        const lastOk = Number(GM_getValue(PORTAL_LAST_OK_KEY, 0));
        if (lastOk && (Date.now() - lastOk) <= graceMs) return;

        state.portalAccess.blocked = true;
        state.portalAccess.blockedReason = `站点服务离线超过 ${Math.round(graceMs / 60000)} 分钟，脚本已暂停`;
        state.shouldStop = true;
        state.isRunning = false;
        if (_STUDY.running) stopStudy();
        removeAssistantPanel();
        renderPortalStatus();
        const blockToken = `offline:${state.portalAccess.blockedReason}`;
        const lastBlockToken = GM_getValue(PORTAL_LAST_BLOCK_KEY, '');
        if (source === 'manual' || lastBlockToken !== blockToken) {
            GM_setValue(PORTAL_LAST_BLOCK_KEY, blockToken);
            showPortalDialog('站点服务离线', state.portalAccess.blockedReason, {
                confirmText: '知道了'
            });
        }
    }

    function buildPortalHeaders(extraHeaders = {}) {
        const headers = {
            'Content-Type': 'application/json',
            'x-script-client-id': getPortalClientId()
        };
        const token = getPortalAuthToken();
        if (token) {
            headers['x-script-auth-token'] = token;
            headers.Authorization = `Bearer ${token}`;
        }
        return Object.assign(headers, extraHeaders || {});
    }

    function portalRequest(path, method = 'GET', dataObj = null, extraHeaders = null) {
        const base = getPortalServerBase();
        if (!base) return Promise.resolve(null);
        const url = `${base}${path}`;
        const requestUrl = method === 'GET' && dataObj ? appendQueryToUrl(url, dataObj) : url;
        return new Promise((resolve) => {
            GM_xmlhttpRequest({
                method,
                url: requestUrl,
                headers: buildPortalHeaders(extraHeaders),
                data: method === 'GET' || !dataObj ? undefined : JSON.stringify(dataObj),
                onload: function(res) {
                    try {
                        resolve(JSON.parse(res.responseText || '{}'));
                    } catch (e) {
                        resolve(null);
                    }
                },
                onerror: function() {
                    resolve(null);
                }
            });
        });
    }

    async function sha256Hex(text) {
        try {
            if (!window.crypto || !window.crypto.subtle || typeof TextEncoder === 'undefined') return '';
            const data = new TextEncoder().encode(String(text || ''));
            const digest = await window.crypto.subtle.digest('SHA-256', data);
            return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
        } catch (e) {
            return '';
        }
    }

    async function getPortalIntegritySnapshot() {
        if (!portalIntegrityPromise) {
            portalIntegrityPromise = (async () => {
                const gmInfo = getGMInfoSafe();
                const script = gmInfo && gmInfo.script ? gmInfo.script : {};
                const metaStr = String((gmInfo && gmInfo.scriptMetaStr) || '');
                const hashSource = metaStr || JSON.stringify({
                    name: script.name || '',
                    version: script.version || '',
                    namespace: script.namespace || '',
                    updateURL: script.updateURL || '',
                    downloadURL: script.downloadURL || ''
                });
                return {
                    name: script.name || '智能自动答题助手',
                    version: String(script.version || '1.0.0'),
                    namespace: script.namespace || '',
                    updateURL: script.updateURL || '',
                    downloadURL: script.downloadURL || '',
                    metaHash: await sha256Hex(hashSource),
                    metaLength: metaStr.length
                };
            })().catch(() => ({
                name: '智能自动答题助手',
                version: '1.0.0',
                namespace: '',
                updateURL: '',
                downloadURL: '',
                metaHash: '',
                metaLength: 0
            }));
        }
        return portalIntegrityPromise;
    }

    function normalizeRemoteTikuList(list) {
        if (!Array.isArray(list)) return [];
        return list.map((item, index) => {
            if (!item || typeof item !== 'object') return null;
            const url = String(item.url || '').trim();
            if (!url) return null;
            return {
                id: String(item.id || `remote_tiku_${index}_${Date.now().toString(36)}`),
                name: String(item.name || `远程题库 ${index + 1}`),
                url,
                enabled: item.enabled !== false,
                config: item.config && typeof item.config === 'object' ? item.config : undefined
            };
        }).filter(Boolean);
    }

    function buildManagedSettingsPatch(rawSettings) {
        if (!rawSettings || typeof rawSettings !== 'object') return {};
        const patch = {};
        const choices = {
            searchEngine: ['baidu', 'google', 'bing'],
            startMode: ['beginning', 'unanswered', 'continue'],
            studyDiscussMode: ['random', 'first', 'lastest', 'max-show-up', 'max-fav']
        };
        const applyBool = (key) => {
            if (typeof rawSettings[key] === 'boolean') patch[key] = rawSettings[key];
        };
        const applyNumber = (key, min, max, digits = null) => {
            if (rawSettings[key] === undefined || rawSettings[key] === null || rawSettings[key] === '') return;
            const num = Number(rawSettings[key]);
            if (!Number.isFinite(num)) return;
            const next = Math.max(min, Math.min(max, num));
            patch[key] = digits === null ? next : Number(next.toFixed(digits));
        };
        const applyChoice = (key, list) => {
            const value = String(rawSettings[key] || '').trim();
            if (list.includes(value)) patch[key] = value;
        };
        const applyStringArray = (key) => {
            if (!Array.isArray(rawSettings[key])) return;
            patch[key] = rawSettings[key].map(v => String(v || '').trim()).filter(Boolean);
        };

        applyBool('autoSearch');
        applyBool('autoFill');
        applyBool('autoNext');
        applyBool('useCache');
        applyBool('tikuEnabled');
        applyBool('tikuRevalidate');
        applyBool('reviewMode');
        applyBool('enableDualAPI');
        applyBool('enableWhitelist');
        applyBool('studyAntiPause');
        applyBool('studyAutoUnpause');
        applyBool('studyAutoNext');
        applyBool('studyLoop');
        applyBool('studyAutoCloseDialog');
        applyBool('studyHandleVideoQuiz');
        applyBool('studyReadTask');
        applyBool('studyAutoDiscuss');
        applyBool('portalRemoteNotice');
        applyBool('portalRemoteConfig');
        applyBool('portalUploadLogs');
        applyBool('portalStrictMode');
        applyBool('portalTamperCheck');

        applyNumber('delayTime', 500, 8000, 0);
        applyNumber('studyRate', 0.25, 16, 2);
        applyNumber('studyVolume', 0, 1, 2);
        applyNumber('readSpeed', 1, 10, 1);
        applyNumber('portalOfflineGraceMinutes', 1, 1440, 0);

        applyChoice('searchEngine', choices.searchEngine);
        applyChoice('startMode', choices.startMode);
        applyChoice('studyDiscussMode', choices.studyDiscussMode);

        applyStringArray('questionTypes');
        applyStringArray('customWhitelist');

        if (rawSettings.secondAPIId !== undefined) {
            const secondAPIId = String(rawSettings.secondAPIId || '').trim();
            patch.secondAPIId = secondAPIId || null;
        }
        if (Array.isArray(rawSettings.tikuList)) {
            /*
             * ⚠ 这里要**合并**而不是覆盖（2026-10-23）：
             *   后端下发的是「官方题库」，但用户自己在面板里加的题库不能被顶掉 ——
             *   否则每 5 分钟一次的心跳就会把用户的配置洗掉。
             *   去重按 url：同一个 url 以服务端版本为准（服务端能改地址、能改开关）。
             */
            const remote = normalizeRemoteTikuList(rawSettings.tikuList);
            const local = Array.isArray(state.settings.tikuList) ? state.settings.tikuList : [];
            const merged = remote.slice();
            local.forEach((item) => {
                if (!item || !String(item.url || '').trim()) return;
                if (merged.some((m) => m && String(m.url || '').trim() === String(item.url).trim())) return;
                merged.push({
                    id: item.id || ('local_' + Date.now().toString(36)),
                    name: item.name || '本地题库',
                    url: String(item.url || '').trim(),
                    enabled: item.enabled !== false,
                    config: item.config && typeof item.config === 'object' ? item.config : undefined
                });
            });
            patch.tikuList = merged;
        }
        if (rawSettings.portalOpenPath !== undefined) {
            patch.portalOpenPath = normalizePortalRelativePath(rawSettings.portalOpenPath);
        }

        return patch;
    }

    function applyPortalManagedSettings(payload, source = 'auto') {
        if (!state.settings.portalRemoteConfig || !payload) return false;
        const packet = payload.settings && typeof payload.settings === 'object' ? payload : { settings: payload };
        const token = String(packet.updatedAt || packet.version || packet.id || '').trim();
        if (token && source !== 'manual' && GM_getValue(PORTAL_LAST_SETTINGS_KEY, '') === token) {
            return false;
        }
        const patch = buildManagedSettingsPatch(packet.settings);
        const keys = Object.keys(patch);
        if (!keys.length) return false;
        Object.assign(state.settings, patch);
        if (token) GM_setValue(PORTAL_LAST_SETTINGS_KEY, token);
        persistAllConfig();
        if (document.getElementById('answer-assistant-panel')) {
            loadSettingsToUI();
        }
        addLog(`站点已同步 ${keys.length} 项配置`, 'info');
        if (source === 'manual') {
            showToast('已同步站点配置', 'success');
        }
        return true;
    }

    function handlePortalCommand(command, source = 'auto') {
        if (!command || typeof command !== 'object') return;
        const commandId = String(command.id || `${command.type || 'command'}:${command.updatedAt || command.message || ''}`);
        if (commandId && source !== 'manual' && GM_getValue(PORTAL_LAST_COMMAND_KEY, '') === commandId) {
            return;
        }
        if (commandId) {
            GM_setValue(PORTAL_LAST_COMMAND_KEY, commandId);
        }
        const type = String(command.type || '').toLowerCase();
        if (type === 'notice') {
            showPortalDialog(command.title || '后台通知', command.message || '', {
                confirmText: command.buttonText || '知道了',
                secondaryText: command.buttonHref ? '打开详情' : '',
                onSecondary: () => {
                    if (command.buttonHref) window.open(command.buttonHref, '_blank');
                }
            });
            return;
        }
        if (type === 'log') {
            addLog(command.message || '站点下发了一条日志', command.level || 'info');
            return;
        }
        if (type === 'config') {
            applyPortalManagedSettings(command.settings || command.payload || {}, source);
            return;
        }
        if (type === 'open' && command.url) {
            window.open(command.url, '_blank');
            return;
        }
        if (type === 'reload') {
            window.location.reload();
        }
    }

    function handlePortalCommands(commands, source = 'auto') {
        if (Array.isArray(commands)) {
            commands.forEach(command => handlePortalCommand(command, source));
            return;
        }
        handlePortalCommand(commands, source);
    }

    function openPortalHomePage() {
        const base = getPortalServerBase();
        if (!base) {
            showToast('请先设置站点地址', 'warning');
            return;
        }
        window.open(`${base}${getPortalOpenPath()}`, '_blank');
    }

    function showPortalDialog(title, message, options = {}) {
        const existed = document.getElementById('aa-portal-dialog');
        if (existed) existed.remove();
        const overlay = document.createElement('div');
        overlay.id = 'aa-portal-dialog';
        overlay.style.cssText = `
            position: fixed; inset: 0; z-index: 10000001;
            background: rgba(15,23,42,0.42); display: flex;
            align-items: center; justify-content: center;
            backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
        `;
        const card = document.createElement('div');
        card.style.cssText = `
            width: min(520px, 92vw); background: #fff; border-radius: 18px;
            border: 1px solid rgba(226,229,233,0.9); box-shadow: 0 18px 50px rgba(15,23,42,0.14);
            padding: 20px;
        `;
        card.innerHTML = `
            <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px">
                <div style="font-size:18px;font-weight:800;color:#1B263B">${title}</div>
                <button id="aa-portal-close" style="border:none;background:transparent;font-size:18px;cursor:pointer;color:#8B95A5">×</button>
            </div>
            <div style="white-space:pre-wrap;line-height:1.8;color:#4A5568;font-size:14px">${message}</div>
            <div style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;margin-top:18px">
                ${options.secondaryText ? `<button id="aa-portal-secondary" style="height:40px;padding:0 16px;border:1px solid #dbe3ec;background:#fff;border-radius:10px;cursor:pointer;color:#4A5568">${options.secondaryText}</button>` : ''}
                <button id="aa-portal-confirm" style="height:40px;padding:0 16px;border:none;background:#00A8FF;color:#fff;border-radius:10px;cursor:pointer">${options.confirmText || '知道了'}</button>
            </div>
        `;
        overlay.appendChild(card);
        document.body.appendChild(overlay);
        const close = () => { try { overlay.remove(); } catch (e) {} };
        card.querySelector('#aa-portal-close')?.addEventListener('click', close);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
        card.querySelector('#aa-portal-confirm')?.addEventListener('click', () => {
            if (typeof options.onConfirm === 'function') options.onConfirm();
            close();
        });
        card.querySelector('#aa-portal-secondary')?.addEventListener('click', () => {
            if (typeof options.onSecondary === 'function') options.onSecondary();
            close();
        });
    }

    function clearPortalHeartbeatLoop() {
        if (portalHeartbeatTimer) {
            clearInterval(portalHeartbeatTimer);
            portalHeartbeatTimer = null;
        }
    }

    function removeAssistantPanel() {
        const panel = document.getElementById('answer-assistant-panel');
        if (panel) {
            try { panel.remove(); } catch (e) {}
        }
    }

    function handlePortalRuntime(runtime, source = 'auto') {
        if (!runtime) return;
        setPortalConnectionState(true);

        const integrity = runtime.integrity && typeof runtime.integrity === 'object' ? runtime.integrity : null;
        if (integrity && state.settings.portalTamperCheck) {
            const expectedMetaHash = String(integrity.expectedMetaHash || '').trim();
            if (expectedMetaHash && state.portalAccess.metaHash) {
                state.portalAccess.integrityStatus = expectedMetaHash === state.portalAccess.metaHash ? 'ok' : 'mismatch';
                if (state.portalAccess.integrityStatus === 'mismatch') {
                    runtime.blocked = true;
                    runtime.blockedReason = integrity.message || integrity.reason || '脚本元信息校验失败，已暂停使用';
                }
            } else if (integrity.status) {
                state.portalAccess.integrityStatus = String(integrity.status);
            }
        } else if (!state.settings.portalTamperCheck) {
            state.portalAccess.integrityStatus = 'disabled';
        }

        if (runtime.blocked) {
            state.portalAccess.blocked = true;
            state.portalAccess.blockedReason = runtime.blockedReason || '该脚本客户端已被管理员限制使用';
            state.shouldStop = true;
            state.isRunning = false;
            if (_STUDY.running) {
                stopStudy();
            }
            removeAssistantPanel();
            const blockToken = `${runtime.blockedReason || ''}`;
            const lastBlockToken = GM_getValue(PORTAL_LAST_BLOCK_KEY, '');
            if (source === 'manual' || lastBlockToken !== blockToken) {
                GM_setValue(PORTAL_LAST_BLOCK_KEY, blockToken);
                const blockTarget = runtime.installUrl || (runtime.script && (runtime.script.installUrl || runtime.script.detailUrl)) || (integrity && (integrity.installUrl || integrity.detailUrl)) || '';
                showPortalDialog('脚本设备已被限制', state.portalAccess.blockedReason, {
                    confirmText: '知道了',
                    secondaryText: blockTarget ? '去站点更新' : '',
                    onSecondary: () => {
                        if (blockTarget) window.open(blockTarget, '_blank');
                    }
                });
            }
            return;
        }

        state.portalAccess.blocked = false;
        state.portalAccess.blockedReason = '';
        GM_setValue(PORTAL_LAST_BLOCK_KEY, '');
        renderPortalStatus();

        if (runtime.settings || runtime.config) {
            applyPortalManagedSettings(runtime.settings || runtime.config, source);
        }
        const announcement = runtime.announcement || {};
        if (state.settings.portalRemoteNotice && announcement.enabled && announcement.message && announcement.updatedAt) {
            const lastSeenAnnouncement = GM_getValue(PORTAL_LAST_ANNOUNCEMENT_KEY, '');
            if (source === 'manual' || lastSeenAnnouncement !== announcement.updatedAt) {
                GM_setValue(PORTAL_LAST_ANNOUNCEMENT_KEY, announcement.updatedAt);
                addLog(`站点公告: ${announcement.title || '未命名公告'}`, 'info');
                showPortalDialog(announcement.title || '站点公告', announcement.message, {
                    confirmText: announcement.buttonText || '知道了',
                    secondaryText: announcement.buttonHref ? '打开详情' : '',
                    onSecondary: () => {
                        if (announcement.buttonHref) window.open(announcement.buttonHref, '_blank');
                    }
                });
            }
        }

        const script = runtime.script || {};
        if (script.hasUpdate && script.version) {
            const lastSeenUpdate = GM_getValue(PORTAL_LAST_UPDATE_KEY, '');
            if (source === 'manual' || lastSeenUpdate !== script.version) {
                GM_setValue(PORTAL_LAST_UPDATE_KEY, script.version);
                showPortalDialog(
                    `发现脚本更新 v${script.version}`,
                    `${script.releaseNotes || '服务器上已有新脚本版本。'}\n\n你可以直接打开站点详情页，或重新安装最新脚本。`,
                    {
                        confirmText: '稍后再说',
                        secondaryText: '打开站点',
                        onSecondary: () => {
                            const target = script.detailUrl || script.installUrl || '';
                            if (target) window.open(target, '_blank');
                        }
                    }
                );
            }
        } else if (source === 'manual') {
            showToast('已检查完成，当前脚本已是最新版本', 'success');
        }

        handlePortalCommands(runtime.commands || runtime.command, source);
    }

    async function checkPortalRuntime(source = 'auto') {
        const base = getPortalServerBase();
        if (!base) {
            if (source === 'manual') {
                showToast('请先设置站点地址', 'warning');
            }
            return null;
        }
        const integrity = await getPortalIntegritySnapshot();
        state.portalAccess.metaHash = integrity.metaHash || '';
        const runtime = await portalRequest('/api/public/script-runtime', 'GET', {
            version: integrity.version,
            clientId: getPortalClientId(),
            pageHost: window.location.host || '',
            pageUrl: window.location.href || '',
            metaHash: integrity.metaHash || '',
            sessionId: PORTAL_PAGE_SESSION_ID
        });
        if (!runtime) {
            handlePortalOffline(source, '站点服务连接失败，请检查域名、公开令牌或服务状态');
            if (source === 'manual') showToast('站点服务连接失败，请检查域名、公开令牌或服务状态', 'error');
            return null;
        }
        handlePortalRuntime(runtime, source);
        return runtime;
    }

    async function reportPortalHeartbeat(source = 'auto') {
        const base = getPortalServerBase();
        if (!base) return null;
        const payload = {
            clientId: getPortalClientId(),
            sessionId: PORTAL_PAGE_SESSION_ID,
            scriptVersion: String((await getPortalIntegritySnapshot()).version || '1.0.0'),
            pageHost: window.location.host || '',
            pageUrl: window.location.href || '',
            pageTitle: document.title || '',
            studyEnabled: !!state.settings.studyEnabled,
            installSource: base,
            action: source,
            configFlags: {
                remoteNotice: !!state.settings.portalRemoteNotice,
                remoteConfig: !!state.settings.portalRemoteConfig,
                uploadLogs: !!state.settings.portalUploadLogs,
                strictMode: !!state.settings.portalStrictMode,
                tamperCheck: !!state.settings.portalTamperCheck
            },
            integrity: await getPortalIntegritySnapshot()
        };
        const res = await portalRequest('/api/public/script-client/heartbeat', 'POST', payload);
        if (!res) {
            handlePortalOffline(source, '站点服务心跳失败');
            return null;
        }
        if (res && res.runtime) {
            handlePortalRuntime(res.runtime, source);
        }
        if (state.settings.portalUploadLogs) {
            await reportPortalLogs(source);
        }
        return res;
    }

    async function reportPortalLogs(source = 'auto') {
        const base = getPortalServerBase();
        if (!base || !state.settings.portalUploadLogs) return null;
        const pendingLogs = state.logs.filter(item => item.seq > portalLastUploadedLogSeq).slice(-40);
        if (!pendingLogs.length) return null;
        const res = await portalRequest('/api/public/script-client/logs', 'POST', {
            clientId: getPortalClientId(),
            sessionId: PORTAL_PAGE_SESSION_ID,
            pageHost: window.location.host || '',
            pageUrl: window.location.href || '',
            action: source,
            logs: pendingLogs.map(item => ({
                id: item.id,
                ts: item.ts,
                type: item.type,
                msg: item.msg
            }))
        });
        if (res) {
            portalLastUploadedLogSeq = pendingLogs[pendingLogs.length - 1].seq;
        }
        return res;
    }

    function startPortalHeartbeatLoop() {
        clearPortalHeartbeatLoop();
        portalHeartbeatTimer = setInterval(() => {
            reportPortalHeartbeat('auto');
        }, PORTAL_HEARTBEAT_INTERVAL_MS);
    }

    function promptPortalServerBase() {
        const current = getPortalServerBase();
        const input = window.prompt('请输入站点地址，例如 https://你的域名 或 http://127.0.0.1:8080\n这里只填公开站点域名，不填后台登录地址。', current || '');
        if (input === null) return;
        const next = normalizePortalServerBase(input);
        state.settings.portalServerBase = next;
        saveAllConfig();
        renderPortalStatus();
        showToast(next ? `站点地址已保存：${next}` : '已清空站点地址', next ? 'success' : 'info');
    }

    function registerPortalMenuCommands() {
        return;
    }

    // ==================== 配置持久化 ====================
    function buildAPIStorageSnapshot() {
        const apis = {};
        for (const [id, cfg] of Object.entries(AI_MODELS)) {
            apis[id] = {
                apiKey: document.getElementById(`key-${id}`)?.value || cfg.apiKey || '',
                secretKey: document.getElementById(`secret-${id}`)?.value || cfg.secretKey || '',
                model: document.getElementById(`model-${id}`)?.value || cfg.model || cfg.defaultModel,
                enabled: cfg.enabled,
                baseURL: cfg.baseURL,
                name: cfg.name,
                models: cfg.models,
                isCustom: cfg.isCustom,
                useApiKeyHeader: cfg.useApiKeyHeader || false,
                // 修复（2026-10）：自定义 API 的协议 / 能力开关也要落盘，
                // 否则刷新页面后 supportsImages / isAnthropic / isOpenAI 全部丢失，
                // 行为漂移（图片题被拒、或 Anthropic 端点被当 OpenAI 兼容层发出去 → 400/401）。
                protocol: cfg.protocol || 'openai',
                supportsImages: cfg.supportsImages === true,
                isOpenAI: cfg.isOpenAI === true,
                isAnthropic: cfg.isAnthropic === true,
                isReasoning: typeof cfg.isReasoning === 'boolean' ? cfg.isReasoning : undefined
            };
        }
        return apis;
    }

    function persistAllConfig() {
        GM_setValue('smart_answer_assistant_v2', JSON.stringify({
            selectedAPI: state.selectedAPIId,
            apis: buildAPIStorageSnapshot(),
            settings: state.settings,
            questionArea: state.questionArea,
            lastProcessedIndex: state.lastProcessedIndex,
            questionsList: state.questionsList.map(q => ({
                text: q.cleanText || q.rawText || '',
                options: q.options || []
            }))
        }));
    }

    function saveAllConfig() {
        // 收集设置
        state.settings.autoSearch = document.getElementById('set-search')?.checked ?? true;
        state.settings.searchEngine = document.getElementById('set-engine')?.value || 'baidu';
        state.settings.autoFill = document.getElementById('set-fill')?.checked ?? true;
        state.settings.autoNext = document.getElementById('set-next')?.checked ?? true;
        state.settings.delayTime = parseInt(document.getElementById('set-delay')?.value || 1500);
        state.settings.useCache = document.getElementById('set-cache')?.checked ?? true;
        // 题库相关
        // tikuList 通过 addTiku/removeTiku/toggleTiku 维护
        state.settings.tikuEnabled = document.getElementById('set-tiku-enabled')?.checked ?? true;
        state.settings.tikuRevalidate = document.getElementById('set-tiku-revalidate')?.checked ?? false;
        state.settings.portalServerBase = normalizePortalServerBase(document.getElementById('input-portal-server-base')?.value || state.settings.portalServerBase || '');
        state.settings.portalAuthToken = String(document.getElementById('input-portal-auth-token')?.value || state.settings.portalAuthToken || '').trim();
        state.settings.portalRemoteNotice = document.getElementById('set-portal-remote-notice')?.checked ?? state.settings.portalRemoteNotice ?? true;
        state.settings.portalRemoteConfig = document.getElementById('set-portal-remote-config')?.checked ?? state.settings.portalRemoteConfig ?? true;
        state.settings.portalUploadLogs = document.getElementById('set-portal-upload-logs')?.checked ?? state.settings.portalUploadLogs ?? true;
        state.settings.portalStrictMode = document.getElementById('set-portal-strict-mode')?.checked ?? state.settings.portalStrictMode ?? false;
        state.settings.portalOfflineGraceMinutes = Math.max(1, Math.min(1440, parseInt(document.getElementById('set-portal-offline-grace')?.value || state.settings.portalOfflineGraceMinutes || 30, 10) || 30));
        state.settings.portalTamperCheck = document.getElementById('set-portal-tamper-check')?.checked ?? state.settings.portalTamperCheck ?? true;
        state.settings.portalOpenPath = normalizePortalRelativePath(state.settings.portalOpenPath || '/portal/resource/chaoxing-script');
        state.settings.reviewMode = document.getElementById('set-review')?.checked ?? false;
        state.settings.enableDualAPI = document.getElementById('set-dual-api')?.checked ?? false;
        // 刷课相关
        state.settings.studyEnabled = document.getElementById('set-study-enabled')?.checked ?? false;
        const rateEl = document.getElementById('set-study-rate');
        const volEl = document.getElementById('set-study-volume');
        if (rateEl) state.settings.studyRate = Math.max(0.25, Math.min(16, parseFloat(rateEl.value) || 1.5));
        if (volEl) state.settings.studyVolume = Math.max(0, Math.min(1, parseFloat(volEl.value) || 0));
        state.settings.studyAntiPause = document.getElementById('set-study-anti-pause')?.checked ?? true;
        state.settings.studyAutoUnpause = document.getElementById('set-study-auto-unpause')?.checked ?? true;
        state.settings.studyAutoNext = document.getElementById('set-study-auto-next')?.checked ?? true;
        state.settings.studyLoop = document.getElementById('set-study-loop')?.checked ?? true;
        state.settings.studyAutoCloseDialog = document.getElementById('set-study-close-dialog')?.checked ?? true;
        state.settings.skipExercise = document.getElementById('set-skip-exercise')?.checked ?? false;
        state.settings.studyHandleVideoQuiz = document.getElementById('set-study-handle-quiz')?.checked ?? true;
        state.settings.studyAutoStartOnLoad = document.getElementById('set-study-autostart')?.checked ?? false;
        state.settings.studyAlwaysStartFromEarliest = document.getElementById('set-study-earliest')?.checked ?? true;
        state.settings.studyReadTask = document.getElementById('set-study-read')?.checked ?? true;
        state.settings.studyAutoDiscuss = document.getElementById('set-study-discuss')?.checked ?? true;
        state.settings.studyDiscussMode = document.getElementById('set-study-discuss-mode')?.value || 'random';
        state.settings.readSpeed = parseFloat(document.getElementById('set-read-speed')?.value) || 1;
        state.settings.secondAPIId = document.getElementById('sel-second-api')?.value || null;
        // 获取答题起始模式
        const startMode = document.querySelector('input[name="start-mode"]:checked')?.value || 'beginning';
        state.settings.startMode = startMode;

        // 收集题目类型选择
        const typeCheckboxes = document.querySelectorAll('.type-checkbox');
        const selectedTypes = [];
        typeCheckboxes.forEach(cb => {
            if (cb.checked) selectedTypes.push(cb.value);
        });
        state.settings.questionTypes = selectedTypes.length > 0 ? selectedTypes : ['all'];

        // 收集网站白名单设置
        state.settings.enableWhitelist = document.getElementById('set-whitelist')?.checked ?? true;
        persistAllConfig();
    }

    /*
     * 官方题库与默认站点地址（2026-10-23 接入后端）。
     *
     * 地址为什么是 /tiku-api/tiku 而不是直接 8091：
     *   · 云服务器安全组只放行了 22 / 8080 / 8090，**8091 出不去**；
     *   · 主后端 8080 上有 /tiku-api 反代（剥掉前缀再转给 8091 的题库服务），
     *     所以脚本只跟 8080 打交道最省事，不用动安全组；
     *   · 8080 的 /tiku-api → 8091 的 /tiku，两段路径拼起来就是 /tiku-api/tiku。
     */
    const OFFICIAL_TIKU = {
        id: 'xspirt',
        name: '我的题库（官方）',
        url: 'https://xspirt.online/tiku-api/tiku',
        enabled: true
    };
    const DEFAULT_PORTAL_SERVER_BASE = 'https://xspirt.online';

    /*
     * 保证官方题库在列表里。
     * ⚠ 为什么需要它：loadAllConfig() 用 Object.assign(state.settings, data.settings)
     *   把用户**保存过的配置整体覆盖**到默认值上 —— 老用户当初保存时 tikuList 是空的、
     *   portalServerBase 也是空的，光改默认值对他们无效，这里显式补回来。
     */
    function ensureDefaultTikuList() {
        const list = Array.isArray(state.settings.tikuList) ? state.settings.tikuList : [];
        if (!list.some((item) => item && String(item.url || '').trim() === OFFICIAL_TIKU.url)) {
            list.push({ ...OFFICIAL_TIKU });
        }
        state.settings.tikuList = list;
    }

    function loadAllConfig() {
        // 优先读取新键名，兼容旧版 Pro 键名
        let raw = GM_getValue('smart_answer_assistant_v2');
        if (!raw) raw = GM_getValue('aa_pro_v5');
        if (!raw) return;

        try {
            const data = JSON.parse(raw);
            if (data.selectedAPI) state.selectedAPIId = data.selectedAPI;
            if (data.settings) Object.assign(state.settings, data.settings);
            if (data.questionArea) state.questionArea = data.questionArea;

            state.settings.searchEngine = ['baidu', 'google', 'bing'].includes(state.settings.searchEngine) ? state.settings.searchEngine : 'baidu';
            state.settings.portalServerBase = normalizePortalServerBase(state.settings.portalServerBase || '');
            state.settings.portalAuthToken = String(state.settings.portalAuthToken || '').trim();
            state.settings.portalRemoteNotice = state.settings.portalRemoteNotice !== false;
            state.settings.portalRemoteConfig = state.settings.portalRemoteConfig !== false;
            state.settings.portalUploadLogs = state.settings.portalUploadLogs !== false;
            state.settings.portalStrictMode = !!state.settings.portalStrictMode;
            state.settings.portalOfflineGraceMinutes = Math.max(1, Math.min(1440, parseInt(state.settings.portalOfflineGraceMinutes, 10) || 30));
            state.settings.portalTamperCheck = state.settings.portalTamperCheck !== false;
            state.settings.portalOpenPath = normalizePortalRelativePath(state.settings.portalOpenPath || '/portal/resource/chaoxing-script');

            // 2026-10-23：补齐官方题库与默认站点地址（老用户保存过的空值会覆盖掉默认值）
            ensureDefaultTikuList();
            if (!String(state.settings.portalServerBase || '').trim()) {
                state.settings.portalServerBase = DEFAULT_PORTAL_SERVER_BASE;
            }

            // 迁移：旧版 tikuUrl 字段 → 新版 tikuList 数组
            if (data.settings) {
                if (!Array.isArray(state.settings.tikuList)) {
                    state.settings.tikuList = [];
                }
                if (state.settings.tikuList.length === 0 && data.settings.tikuUrl && data.settings.tikuUrl.trim()) {
                    state.settings.tikuList.push({
                        id: 'tiku_' + Date.now(),
                        name: '默认题库',
                        url: data.settings.tikuUrl,
                        enabled: true
                    });
                    // 迁移后清除旧字段（Object.assign 已把 tikuUrl 拷入 settings，需一并删除）
                    delete data.settings.tikuUrl;
                    delete state.settings.tikuUrl;
                }
            }

            if (data.apis) {
                for (const [id, saved] of Object.entries(data.apis)) {
                    // 如果是内置 API
                    if (AI_MODELS[id]) {
                        const cfg = AI_MODELS[id];
                        cfg.apiKey = saved.apiKey || '';
                        cfg.secretKey = saved.secretKey || '';
                        cfg.enabled = saved.enabled || false;
                        // 迁移：v1.6 起模型名与端点均按官方文档更新，
                        // 旧配置里的模型名（如 gpt-5.5、claude-opus-4.8）只在新列表内才沿用，否则回落默认模型；
                        // 端点一律以脚本内置最新值为准（旧默认端点已过期，如百度旧版 token 接口）
                        cfg.model = (saved.model && Array.isArray(cfg.models) && cfg.models.includes(saved.model))
                            ? saved.model
                            : cfg.defaultModel;
                    }
                    // 如果是自定义 API
                    else if (saved.isCustom) {
                        const savedModel = saved.model || (saved.models && saved.models[0]) || '';
                        AI_MODELS[id] = {
                            name: saved.name || '自定义 API',
                            baseURL: saved.baseURL || '',
                            models: saved.models || [],
                            defaultModel: savedModel,
                            // 修复（2026-10）：原来只写进 defaultModel，漏了 model。
                            // 请求体用的是 api.model → undefined → JSON.stringify 直接丢键
                            // → 请求体里根本没有 model 字段 → 刷新页面后每次调用都被 400 拒绝，
                            // 界面却只显示"网络异常"，几乎无法定位。
                            model: savedModel,
                            apiKey: saved.apiKey || '',
                            enabled: saved.enabled || false,
                            isCustom: true,
                            useApiKeyHeader: saved.useApiKeyHeader || false,
                            // 能力开关一并恢复，避免刷新/编辑后行为漂移
                            supportsImages: saved.supportsImages === true,
                            isOpenAI: saved.isOpenAI === true,
                            isAnthropic: saved.isAnthropic === true,
                            isReasoning: typeof saved.isReasoning === 'boolean' ? saved.isReasoning : undefined
                        };
                    }
                }
            }

            // 加载答题进度
            if (data.lastProcessedIndex !== undefined) {
                state.lastProcessedIndex = data.lastProcessedIndex;
            }

            // 加载题目列表缓存
            if (data.questionsList && Array.isArray(data.questionsList)) {
                state.questionsList = data.questionsList;
            }
        } catch(e) {
            addLog('配置加载失败，使用默认值', 'error');
        }
    }

    // ==================== 搜索引擎集成 ====================
    async function searchQuestion(questionText) {
        const engine = state.settings.searchEngine;
        let url = '';

        switch(engine) {
            case 'google':
                url = `https://www.google.com/search?q=${encodeURIComponent(questionText + ' 答案')}&num=5`;
                break;
            case 'baidu':
                url = `https://www.baidu.com/s?wd=${encodeURIComponent(questionText + ' 答案')}&rn=5`;
                break;
            case 'bing':
            default:
                url = `https://cn.bing.com/search?q=${encodeURIComponent(questionText)}&count=5`;
                break;
        }

        addLog(`正在通过${engine === 'baidu' ? '百度' : engine === 'google' ? 'Google' : 'Bing'}搜索题目...`, 'info');

        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: url,
                onload: function(res) {
                    if (res.status !== 200) {
                        reject(new Error(`搜索失败: HTTP ${res.status}`));
                        return;
                    }

                    const html = res.responseText;
                    // 提取搜索结果摘要文本
                    const results = extractSearchResults(html);

                    if (results && results.length > 0) {
                        addLog(`搜索到 ${results.length} 条相关结果`, 'success');
                        resolve(results.join('\n'));
                    } else {
                        resolve('');
                    }
                },
                onerror: function(err) {
                    reject(new Error('搜索请求失败'));
                }
            });
        });
    }

    function extractSearchResults(html) {
        const results = [];

        // Bing 结果提取
        const bingMatches = html.match(/<p[^>]*>(.*?)<\/p>/gi) ||
                           html.match(/<li class="b_algo"[^>]*>.*?<\/li>/gi);

        if (bingMatches) {
            bingMatches.forEach(m => {
                const text = m.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
                if (text.length > 20 && text.length < 500) results.push(text);
            });
        }

        // Google 结果提取
        if (results.length === 0) {
            const googleMatches = html.match(/<span[^>]*>(.*?)<\/span>/gi);
            if (googleMatches) {
                googleMatches.slice(0, 8).forEach(m => {
                    const text = m.replace(/<[^>]+>/g, '').trim();
                    if (text.length > 15) results.push(text);
                });
            }
        }

        // 百度结果提取
        if (results.length === 0) {
            const baiduMatches = html.match(/<div class="c-abstract"[^>]*>(.*?)<\/div>/gi);
            if (baiduMatches) {
                baiduMatches.forEach(m => {
                    const text = m.replace(/<[^>]+>/g, '').trim();
                    if (text.length > 15) results.push(text);
                });
            }
        }

        return results.slice(0, 5);
    }

    // ==================== 调用核心 ====================
    const SYSTEM_PROMPT = `你是一个专业的自动答题助手，擅长解答各类题目。

任务：根据提供的题目内容和参考信息，给出最准确的答案。

答题规则：
1. 选择题：只回答选项字母（如 A、B、C、D），不要任何其他文字
2. 判断题：只回答"正确"或"错误"
3. 填空题：直接给出要填写的答案内容
4. 简答题：给出简洁准确的答案，不超过50字
5. 如果题目包含选项，请分析选项并选择最正确的一个
6. 即使没有参考信息，也要根据你的知识给出最佳答案

注意：
- 不要给出任何解释或推理过程
- 不要添加额外说明文字
- 直接输出答案即可`;

    // ==================== 题目类型检测 ====================
    function detectQuestionType(question) {
        // 检查题目对象和text属性是否存在
        if (!question) {
            return '单选题'; // 默认视为单选题
        }

        const el = question.element;

        // ===== 优先使用 DOM 结构判断（比文本关键词可靠得多） =====
        // 学习通等平台的选择题 DOM 结构：radio/checkbox + 选项文本
        // 文本关键词（如"计算"出现在题干中）不应覆盖 DOM 结构
        if (el) {
            const radios = el.querySelectorAll('input[type="radio"]');
            const checkboxes = el.querySelectorAll('input[type="checkbox"]');
            const textInputs = el.querySelectorAll('input[type="text"], textarea, input:not([type])');
            const editables = el.querySelectorAll('[contenteditable="true"]');

            // 有 checkbox = 多选题
            if (checkboxes.length > 0) {
                return '多选题';
            }

            // 有 radio = 单选或判断题
            if (radios.length > 0) {
                // 2 个 radio + 选项文本含"对/错/正确/错误" = 判断题
                if (radios.length === 2) {
                    const optionTexts = [];
                    radios.forEach(r => {
                        const label = r.closest('label, li, span, div, .check_answer, .check_answer_dx, .num_option, .num_option_dx');
                        if (label) optionTexts.push(label.textContent.trim());
                    });
                    const joined = optionTexts.join(' ');
                    if (/正确|错误|对|错|√|×|是|否/i.test(joined) && !/选项|选择|下列/i.test(joined)) {
                        return '判断题';
                    }
                }
                return '单选题';
            }

            // 无 radio/checkbox，有文本输入 = 填空题 或 简答题/计算题等
            if (textInputs.length > 0 || editables.length > 0) {
                const text = (question.cleanText || question.rawText || '').toLowerCase();
                if (text.includes('简答') || text.includes('简述') || text.includes('论述') || text.includes('材料') || text.includes('分析') || text.includes('报告')) {
                    return '简答题';
                }
                if (text.includes('计算') || text.includes('求值') || text.includes('证明') || text.includes('推导')) {
                    return '计算题';
                }
                return '填空题';
            }

            // 学习通自定义 UI：没有原生 radio/checkbox，但有 .check_answer 等选项容器
            const checkAnswerEls = el.querySelectorAll('.check_answer, .check_answer_dx, .check_answer_dx_, .num_option_dx, .num_option');
            if (checkAnswerEls.length > 0) {
                // 有多个选项容器 = 选择题
                return checkAnswerEls.length > 2 ? '单选题' : '判断题';
            }
        }

        // ===== Fallback: 仅在 DOM 结构无法判断时使用文本关键词 =====
        const text = (question.cleanText || question.rawText || '').toLowerCase();

        if (!text) {
            return '单选题';
        }

        if (text.includes('判断') || (text.includes('正确') && text.includes('错误'))) {
            return '判断题';
        }
        if (text.includes('选择') || text.includes('下列') || text.includes('选项')) {
            if (text.includes('多选') || text.includes('哪些')) {
                return '多选题';
            }
            return '单选题';
        }
        if (text.includes('填空') || text.includes('填写')) {
            return '填空题';
        }
        if (text.includes('简答') || text.includes('简述') || text.includes('说明')) {
            return '简答题';
        }
        if (text.includes('计算') || text.includes('求值')) {
            return '计算题';
        }

        return '单选题'; // 默认视为单选题
    }

    // ==================== 题目类型检查 ====================
    function isQuestionTypeAllowed(qType) {
        const allowedTypes = state.settings.questionTypes;

        if (!allowedTypes || allowedTypes.length === 0 || allowedTypes.includes('all')) {
            return true;
        }

        return allowedTypes.includes(qType);
    }

    // 检查题目是否已作答
    // 严格判定：只信任浏览器原生的 input.checked + 文本框/可编辑区域有值
    // 不要用 .check_answer / .check_answer_dx 等class — 这些是UI标记，**未选时也可能存在**
    function isQuestionAnswered(question) {
        const el = question.element;
        if (!el) return false;

        // 1. 原生 input[type=radio/checkbox] checked（最可靠）
        const radioInputs = el.querySelectorAll('input[type="radio"]');
        for (const radio of radioInputs) {
            if (radio.checked) return true;
        }
        const checkboxInputs = el.querySelectorAll('input[type="checkbox"]');
        for (const checkbox of checkboxInputs) {
            if (checkbox.checked) return true;
        }

        // 2. 文本输入框有值（填空题）
        const textInputs = el.querySelectorAll('input[type="text"], textarea, input:not([type])');
        for (const input of textInputs) {
            if ((input.value || '').trim()) return true;
        }

        // 3. contenteditable 有内容
        const editables = el.querySelectorAll('[contenteditable="true"]');
        for (const ed of editables) {
            if ((ed.textContent || ed.innerText || '').trim()) return true;
        }

        // 4. ARIA 标准 aria-checked="true"
        const ariaChecked = el.querySelectorAll('[aria-checked="true"]');
        if (ariaChecked.length > 0) return true;

        // 5. 学习通自定义 UI：选中标记
        // 学习通选中选项后，选项容器内会出现 .check_answer / .check_answer_dx 元素
        // 5a. .answerBg 内含 .check_answer / .check_answer_dx（作业/新版考试）
        const answerBgEls = el.querySelectorAll('.answerBg');
        for (const bg of answerBgEls) {
            if (bg.querySelector('.check_answer, .check_answer_dx, [class*="check_answer"]')) return true;
        }
        // 5b. .num_option / .num_option_dx 的 class 含 check_answer（章节测验）
        const numOptionEls = el.querySelectorAll('.num_option, .num_option_dx');
        for (const opt of numOptionEls) {
            if (opt.classList.contains('check_answer') || opt.className.includes('check_answer')) return true;
        }
        // 5c. 直接存在 .check_answer / .check_answer_dx 元素
        const checkAnswerEls = el.querySelectorAll('.check_answer, .check_answer_dx, .check_answer_dx_');
        if (checkAnswerEls.length > 0) return true;

        return false;
    }

    // 获取已答信息（用于日志显示+答案对比）
    // 返回 { kind: 'choice'|'multi'|'text'|'none', letters: 'B'|'AC'|'', text: '填的内容'|'', display: '用于显示的字符串' }
    function getAnsweredInfo(question) {
        const el = question.element;
        if (!el) return { kind: 'none', letters: '', text: '', display: '已答' };

        const allRadios = el.querySelectorAll('input[type="radio"]');
        const allCheckboxes = el.querySelectorAll('input[type="checkbox"]');

        // 学习通专用检测
        const foundLetters = new Set();

        // 0a. 检测 .answerBg 内含 .check_answer / .check_answer_dx 的选项（作业/新版考试）
        const answerBgEls = el.querySelectorAll('.answerBg');
        for (let i = 0; i < answerBgEls.length; i++) {
            const bg = answerBgEls[i];
            if (bg.querySelector('.check_answer, .check_answer_dx, [class*="check_answer"]')) {
                foundLetters.add(String.fromCharCode(65 + i));
            }
        }

        // 0b. 检测 .num_option / .num_option_dx 的 class 含 check_answer（章节测验）
        if (foundLetters.size === 0) {
            const numOptionEls = el.querySelectorAll('.num_option, .num_option_dx');
            for (let i = 0; i < numOptionEls.length; i++) {
                const opt = numOptionEls[i];
                if (opt.classList.contains('check_answer') || opt.className.includes('check_answer')) {
                    foundLetters.add(String.fromCharCode(65 + i));
                }
            }
        }

        // 0c. 检测 .check_answer / .check_answer_dx 直接作为选中标记（旧版结构）
        if (foundLetters.size === 0) {
            const checkAnswerEls = el.querySelectorAll('.check_answer, .check_answer_dx, .check_answer_dx_');
            // 这些元素本身就是选中标记，需要根据其在兄弟中的位置确定字母
            for (const ca of checkAnswerEls) {
                // 找到它在父容器中的索引
                const parent = ca.parentElement;
                if (parent) {
                    const siblings = Array.from(parent.children);
                    const idx = siblings.indexOf(ca);
                    if (idx >= 0) {
                        foundLetters.add(String.fromCharCode(65 + idx));
                    }
                }
                // 如果通过兄弟索引找不到，尝试从文本开头提取字母
                if (foundLetters.size === 0) {
                    const caText = (ca.textContent || '').trim();
                    const m = caText.match(/^([A-Fa-f])[\.、\)\s]/);
                    if (m) foundLetters.add(m[1].toUpperCase());
                }
            }
        }

        if (foundLetters.size > 0) {
            const letters = Array.from(foundLetters).sort().join('');
            const kind = letters.length > 1 ? 'multi' : 'choice';
            return { kind, letters, text: '', display: '选项 ' + letters.split('').join(',') };
        }

        // ===== 1. 原生 radio checked =====
        for (let i = 0; i < allRadios.length; i++) {
            if (allRadios[i].checked) {
                const letter = String.fromCharCode(65 + i);
                return { kind: 'choice', letters: letter, text: '', display: '选项 ' + letter };
            }
        }

        // ===== 2. 原生 checkbox checked =====
        const checked = [];
        for (let i = 0; i < allCheckboxes.length; i++) {
            if (allCheckboxes[i].checked) {
                checked.push(String.fromCharCode(65 + i));
            }
        }
        if (checked.length > 0) {
            return { kind: 'multi', letters: checked.join(''), text: '', display: '选项 ' + checked.join(',') };
        }

        // ===== 3. 通用：其他自定义class选中状态 =====
        const otherSelectedSelectors = '.selected, .checked, .on, .active, .is-checked, .is-selected, [class*="checked"]:not([class*="unchecked"]), [class*="selected"], .cur, .current';
        const otherSelectedEls = el.querySelectorAll(otherSelectedSelectors);
        const foundLetters2 = new Set();
        for (const sel of otherSelectedEls) {
            const innerRadios = sel.querySelectorAll('input[type="radio"]');
            for (const ir of innerRadios) {
                const idx = Array.from(allRadios).indexOf(ir);
                if (idx >= 0) foundLetters2.add(String.fromCharCode(65 + idx));
            }
            const innerCheckboxes = sel.querySelectorAll('input[type="checkbox"]');
            for (const ic of innerCheckboxes) {
                const idx = Array.from(allCheckboxes).indexOf(ic);
                if (idx >= 0) foundLetters2.add(String.fromCharCode(65 + idx));
            }
            if (foundLetters2.size === 0) {
                const selText = (sel.textContent || '').trim();
                const m = selText.match(/^([A-Fa-f])[\.、\)\s]/);
                if (m) foundLetters2.add(m[1].toUpperCase());
            }
        }
        if (foundLetters2.size > 0) {
            const letters = Array.from(foundLetters2).sort().join('');
            const kind = letters.length > 1 ? 'multi' : 'choice';
            return { kind, letters, text: '', display: '选项 ' + letters.split('').join(',') };
        }

        // ===== 4. 文本输入框 =====
        const textInputs = el.querySelectorAll('input[type="text"], textarea');
        for (const input of textInputs) {
            const v = (input.value || '').trim();
            if (v) {
                return { kind: 'text', letters: '', text: v, display: '填空: ' + v.substring(0, 10) };
            }
        }

        // 6. contenteditable
        const editables = el.querySelectorAll('[contenteditable="true"]');
        for (const ed of editables) {
            const v = (ed.textContent || ed.innerText || '').trim();
            if (v) {
                return { kind: 'text', letters: '', text: v, display: '填空: ' + v.substring(0, 10) };
            }
        }

        return { kind: 'none', letters: '', text: '', display: '已答(未识别选项)' };
    }

    // 找到第一个未作答的题目索引
    function findFirstUnansweredIndex(questions) {
        for (let i = 0; i < questions.length; i++) {
            if (!isQuestionAnswered(questions[i])) {
                return i;
            }
        }
        return 0; // 如果所有题目都已作答，返回0
    }

    // ==================== 双API对比处理 ====================
    async function processWithDualAPI(question) {
        const firstAPIId = state.selectedAPIId;
        const secondAPIId = state.settings.secondAPIId;
        const originalAPIId = state.selectedAPIId;

        try {
            // 第二个 API 未配置时回退单 API 模式（原逻辑会因第二个答案为空而永远跳过此题）
            if (!secondAPIId || !AI_MODELS[secondAPIId] || !AI_MODELS[secondAPIId].apiKey) {
                addLog('双API对比: 第二个API未配置，回退单API模式', 'warn');
                const answer = await getAnswerForQuestion(question);
                if (answer) {
                    const qType = detectQuestionType(question);
                    fillAnswer(question.element, answer, qType);
                    state.answeredCount++;
                }
                return;
            }

            // 保存原始API设置

            // 使用第一个API获取答案
            state.selectedAPIId = firstAPIId;
            const answer1 = await getAnswerForQuestion(question, { bypassCache: true });

            // 使用第二个API获取答案
            // 注意：必须绕过缓存，否则会直接命中上一次调用写入的缓存，两个"不同"的API返回同一个答案
            state.selectedAPIId = secondAPIId;
            const answer2 = await getAnswerForQuestion(question, { bypassCache: true });

            if (!answer1 || !answer2) {
                addLog('双API对比: 某个API未返回答案，跳过此题', 'warn');
                return;
            }

            addLog(`双API对比: [${AI_MODELS[firstAPIId].name}]${answer1} vs [${AI_MODELS[secondAPIId].name}]${answer2}`, 'info');

            // 对比答案
            const normalizedAnswer1 = answer1.trim().toUpperCase();
            const normalizedAnswer2 = answer2.trim().toUpperCase();

            if (normalizedAnswer1 === normalizedAnswer2 && normalizedAnswer1 !== '不确定') {
                // 答案一致，填写答案
                addLog('答案一致，自动填写', 'success');
                const qType = detectQuestionType(question);
                fillAnswer(question.element, answer1, qType);
                state.answeredCount++;
                // 修复（2026-10）：双 API 模式全程 bypassCache，缓存既不读也不写，
                // 答案一致时手动补写一条，避免下次重复调用两家 API 浪费额度。
                if (!question.isImageQuestion && state.settings.useCache) {
                    try {
                        state.questionCache.set(`q${question.index}_${hashString(question.cleanText)}`, { answer: answer1, ok: true });
                    } catch (e) {}
                }
            } else {
                // 答案不一致或不确定，跳过
                // 修复（2026-10）：第二个 API 的答案已被明确否决，必须把该题缓存清掉，
                // 否则关掉双 API 模式后，这一题会命中缓存并把被否决的答案填进表单。
                try {
                    state.questionCache.delete(`q${question.index}_${hashString(question.cleanText)}`);
                } catch (e) {}
                addLog('答案不一致或不确定，跳过此题（已清除该题缓存）', 'warn');
            }
        } catch (err) {
            addLog(`双API对比失败: ${err.message}`, 'error');
        } finally {
            // 无论成功失败都恢复原API，避免异常后一直停在第二个API上
            state.selectedAPIId = originalAPIId;
        }
    }

    async function callAI(prompt, images = []) {
        const api = AI_MODELS[state.selectedAPIId];
        if (!api || !api.apiKey) throw new Error('未选择或未配置 API');

        // 修复（2026-10）：恢复的自定义 API 曾经丢失 model 字段 → 请求体里没有 model
        // → 每次调用都被 OpenAI 兼容层以 400 拒绝，而界面只显示"网络异常"，极难定位。
        // 这里做一次兜底解析，缺模型时给出明确提示。
        const modelName = resolveModelName(api);
        if (!modelName) {
            throw new Error(`${api.name} 未选择模型，请在设置里选择模型后点"校验并启用"`);
        }
        if (!api.model) api.model = modelName;

        addLog(`调用 ${api.name} [${modelName}]...`, 'info');

        // 图片题目路由到不支持视觉的 API 时直接报错跳过，
        // 避免模型在看不到图片的情况下凭空编一个选项字母。
        // 修复（2026-10）：原来用 === false 严格判断，自定义 API 没有该字段（值为 undefined）时
        // 守卫整个失效，图片被硬塞给纯文本模型 → 要么 400，要么模型瞎猜选项字母。
        // 现在按"未显式声明支持就不支持"处理。
        if (images && images.length > 0 && api.supportsImages !== true) {
            throw new Error(`${api.name} 未声明支持图片题目，请在设置中勾选"支持图片"或切换支持视觉的 API`);
        }

        if (api.isAnthropic) {
            return callAnthropic(api, prompt, images);
        }
        // 百度已迁移到千帆 v2 OpenAI 兼容接口，与其余厂商统一走兼容层
        return callOpenAICompat(api, prompt, images);
    }

    // 思考型模型判定
    // 1) 供应商级别显式声明 isReasoning（true / false）优先
    // 2) 否则按模型名正则兜底
    // 思考型模型不接受自定义 temperature：MiMo 官方明确思考模式固定 temperature=1.0 / top_p=0.95，
    // DeepSeek-V4-Pro 官方模型卡也推荐 temperature=1.0；下发 temperature=0.1 轻则被忽略、
    // 重则直接 400。且思维链也计入 max_tokens，需要留足余量，否则正文在输出前就被截断。
    const REASONING_MODEL_RE = /^(gpt-5|gpt-6|o1|o3|claude-(?:opus|sonnet|haiku|fable)-5|glm-5|deepseek-v4|kimi-k3|mimo-v2\.6|qwen3\.8|doubao-seed-2\.0-pro|ernie-x1)/i;
    function isReasoningModel(api) {
        if (typeof api.isReasoning === 'boolean') return api.isReasoning;
        return REASONING_MODEL_RE.test(String((api && (api.model || api.defaultModel)) || ''));
    }

    // 取当前生效的模型名：model → defaultModel → models[0] 逐级兜底
    function resolveModelName(api) {
        if (!api) return '';
        const m = api.model || api.defaultModel || (Array.isArray(api.models) && api.models[0]) || '';
        return String(m);
    }

    // 构造 OpenAI 兼容请求体
    // OpenAI 官方接口的思考类模型（gpt-5.x / gpt-6.x 系列）不支持 max_tokens / 自定义 temperature，
    // 必须用 max_completion_tokens；其余厂商沿用 temperature + max_tokens，
    // 思考型模型（deepseek-v4 / glm / doubao / kimi-k3 / mimo-v2.6 等）的思维链也计入 max_tokens，故留足余量
    function buildChatBody(api, content) {
        const body = {
            model: resolveModelName(api),
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: content }
            ]
        };
        const reasoning = isReasoningModel(api);
        if (api.isOpenAI) {
            // 推理 token 同样计入 max_completion_tokens，1500 偏紧，正文容易被截断
            body.max_completion_tokens = reasoning ? 8000 : 1500;
        } else if (reasoning) {
            // 思考型模型不下发 temperature（部分厂商只接受 1.0，收到 0.1 直接 400）
            body.max_tokens = 8000;
        } else {
            body.temperature = 0.1;
            body.max_tokens = 2000;
        }
        return body;
    }

    function callOpenAICompat(api, prompt, images = []) {
        return new Promise((resolve, reject) => {
            const headers = {
                'Content-Type': 'application/json'
            };

            // 根据 API 类型选择认证方式
            if (api.useApiKeyHeader) {
                // 自定义 API 可选 Azure 风格的 api-key 请求头
                headers['api-key'] = api.apiKey;
            } else {
                // 默认使用 Authorization Bearer 方式（含 Gemini 千帆 v2 等兼容层）
                headers['Authorization'] = `Bearer ${api.apiKey}`;
            }

            // 构建消息内容
            let content = prompt;
            if (images && images.length > 0) {
                // 多模态请求：混合文本和图片
                content = [
                    { type: 'text', text: prompt }
                ];
                images.forEach(imgBase64 => {
                    content.push({
                        type: 'image_url',
                        image_url: {
                            url: imgBase64
                        }
                    });
                });
            }

            GM_xmlhttpRequest({
                method: 'POST',
                url: api.baseURL,
                headers: headers,
                data: JSON.stringify(buildChatBody(api, content)),
                // 修复（2026-10）：原来既没有 timeout 也没有 ontimeout。
                // Tampermonkey 未指定 timeout 时无限等待 → Promise 永不 settle
                // → await callAI(...) 永久挂起，整条答题流水线卡死且没有任何日志，只能刷新页面。
                timeout: 60000,
                onload(res) {
                    try {
                        const d = JSON.parse(res.responseText);
                        if (d.error) {
                            reject(new Error(d.error.message || ('接口返回错误 ' + (d.error.code || ''))));
                            return;
                        }
                        const ch = d.choices && d.choices[0];
                        const msg = ch && ch.message;
                        // 思考型模型被 max_tokens 截断时 content 可能是 null，正文落在 reasoning_content 里
                        const txt = (msg && (msg.content != null ? msg.content : msg.reasoning_content)) || '';
                        if (txt) {
                            resolve(String(txt).trim());
                        } else if (ch && ch.finish_reason === 'length') {
                            reject(new Error('输出被 max_tokens 截断，请改用输出上限更大的模型'));
                        } else {
                            reject(new Error('返回格式异常'));
                        }
                    } catch(e) {
                        reject(new Error('响应解析失败：' + (e && e.message ? e.message : e)));
                    }
                },
                onerror(res) {
                    const st = res && res.status;
                    reject(new Error(st ? `网络异常（HTTP ${st}）` : '网络异常'));
                },
                ontimeout() { reject(new Error('请求超时（60s），请检查网络或换一家 API')); }
            });
        });
    }

    function callAnthropic(api, prompt, images = []) {
        return new Promise((resolve, reject) => {
            // Claude 原生格式：图片以 content block 传入（base64 source）
            const userContent = [];
            (images || []).forEach(imgBase64 => {
                const m = /^data:([^;]+);base64,(.*)$/s.exec(String(imgBase64));
                if (!m) return;
                // Anthropic 只接受 image/jpeg|png|gif|webp，规范 mime 写法
                let mime = m[1].toLowerCase();
                if (mime === 'image/jpg') mime = 'image/jpeg';
                userContent.push({
                    type: 'image',
                    source: { type: 'base64', media_type: mime, data: m[2] }
                });
            });
            userContent.push({ type: 'text', text: prompt });

            GM_xmlhttpRequest({
                method: 'POST',
                url: api.baseURL,
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': api.apiKey,
                    'anthropic-version': '2023-06-01'
                },
                data: JSON.stringify({
                    model: resolveModelName(api),
                    // 修复（2026-10）：Claude 5 系列默认开启长思考，思维链也计入 max_tokens，
                    // 原来的 1000 会让正文在输出前就被截断（finish_reason=length）。
                    max_tokens: isReasoningModel(api) ? 8000 : 2000,
                    system: SYSTEM_PROMPT,
                    messages: [{ role: 'user', content: userContent }]
                }),
                // 修复（2026-10）：补 timeout / ontimeout，避免连接挂起导致流水线永久卡死
                timeout: 60000,
                onload(res) {
                    try {
                        const d = JSON.parse(res.responseText);
                        if (d.error) {
                            reject(new Error(d.error.message || ('接口返回错误 ' + (d.error.code || ''))));
                            return;
                        }
                        // 原实现只取 content[0].text，遇到 type:'thinking' 块就拿到 undefined。
                        // 改为把所有 type==='text' 的块拼起来。
                        const text = Array.isArray(d.content)
                            ? d.content.filter(b => b && b.type === 'text' && b.text).map(b => b.text).join('\n')
                            : '';
                        if (text) {
                            resolve(text.trim());
                        } else if (d.stop_reason === 'max_tokens') {
                            reject(new Error('输出被 max_tokens 截断，请改用输出上限更大的模型'));
                        } else {
                            reject(new Error('返回格式异常'));
                        }
                    } catch(e) {
                        reject(new Error('响应解析失败：' + (e && e.message ? e.message : e)));
                    }
                },
                onerror(res) {
                    const st = res && res.status;
                    reject(new Error(st ? `网络异常（HTTP ${st}）` : '网络异常'));
                },
                ontimeout() { reject(new Error('请求超时（60s），请检查网络或换一家 API')); }
            });
        });
    }

    // ==================== 题目识别与提取 ====================
    // ==================== 图片处理工具函数 ====================

    // 将图片转换为base64
    // 修复（2026-10）：canvas.toDataURL() 在跨域图片上会抛 SecurityError（画布被污染），
    // 而学习通题目图多在 p.ananas.chaoxing.com（与 chaoxing.com 不同源，子域≠同源），
    // 且 <img> 通常早已 complete=true → 走的正是必失败的分支 → 图片题 100% 被静默跳过。
    // 现在优先用 GM_xmlhttpRequest 跨域取图（@connect * 已授权），失败再回落 canvas。
    function imageToBase64(imgElement) {
        return new Promise((resolve, reject) => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');

            // 设置canvas大小
            canvas.width = imgElement.naturalWidth || imgElement.width || 800;
            canvas.height = imgElement.naturalHeight || imgElement.height || 600;

            ctx.drawImage(imgElement, 0, 0, canvas.width, canvas.height);

            try {
                const base64 = canvas.toDataURL('image/png');
                resolve(base64);
            } catch (e) {
                reject(e);
            }
        });
    }

    // 通过 GM_xmlhttpRequest 下载图片并转 base64（跨域可用）
    function imageToBase64ViaGM(src) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: src,
                responseType: 'blob',
                timeout: 15000,
                onload(res) {
                    if (res.status < 200 || res.status >= 300) {
                        reject(new Error('HTTP ' + res.status));
                        return;
                    }
                    const blob = res.response;
                    if (!blob) { reject(new Error('空响应')); return; }
                    const fr = new FileReader();
                    fr.onload = () => resolve(fr.result);
                    fr.onerror = () => reject(new Error('读取失败'));
                    fr.readAsDataURL(blob);
                },
                onerror() { reject(new Error('网络异常')); },
                ontimeout() { reject(new Error('图片下载超时')); }
            });
        });
    }

    // 获取题目区域内的所有图片
    async function extractImagesFromElement(element) {
        const images = element.querySelectorAll('img');
        const base64Images = [];

        for (const img of images) {
            // 跳过太小的图片（可能是图标）
            const width = img.naturalWidth || img.width || 0;
            const height = img.naturalHeight || img.height || 0;
            if (width < 30 || height < 30) continue;

            // 跳过svg图标
            const src = img.src || img.getAttribute('data-src') || img.getAttribute('data-lazy-src');
            if (!src) continue;
            if (src.includes('.svg')) continue;
            // 已经是 data: URL 的直接用
            if (src.startsWith('data:')) {
                base64Images.push(src);
                continue;
            }

            let base64 = null;
            // 首选：GM 跨域取图（对 p.ananas.chaoxing.com 等跨域图有效）
            try {
                base64 = await imageToBase64ViaGM(src);
            } catch (e) {
                // 回落：canvas 路径（同源图可用）
                try {
                    if (img.complete && img.naturalWidth > 0) {
                        base64 = await imageToBase64(img);
                    } else {
                        const newImg = new Image();
                        newImg.crossOrigin = 'anonymous';
                        await new Promise((resolve, reject) => {
                            newImg.onload = resolve;
                            newImg.onerror = reject;
                            newImg.src = src;
                        });
                        base64 = await imageToBase64(newImg);
                    }
                } catch (e2) {
                    console.warn('[AnswerAssistant] 图片转换失败:', src, e2);
                }
            }
            if (base64) base64Images.push(base64);
        }

        return base64Images;
    }

    // 检查元素是否主要包含图片（图片题目）
    function isImageQuestion(element) {
        const text = (element.innerText || element.textContent || '').trim();
        const images = element.querySelectorAll('img');

        // 如果文本很少但有图片，可能是图片题目
        if (text.length < 20 && images.length > 0) {
            // 检查是否有足够大的图片
            for (const img of images) {
                const width = img.naturalWidth || img.width || 0;
                const height = img.naturalHeight || img.height || 0;
                if (width > 100 && height > 50) {
                    return true;
                }
            }
        }
        return false;
    }

    // 章节判断
    // 关键原则：宁可漏判一些章节（让题目识别走URL精确root），也不要误判题目
    // 判断为章节的硬性条件（同时满足）：
    //   1. 元素在章节导航/目录/侧边栏容器内（class含chapter/catalog/tree等）
    //   2. 文本符合"数字.数字 xxx"或"第X章/节"等章节编号
    //   3. 没有答题控件
    // 注意：不要因为"短文本+没有A-F选项"就误判为章节！
    function isChapterElement(element) {
        if (!element) return false;

        // 1. 必须没有答题控件（章节没有单选/复选/输入框）
        const hasControls = element.querySelector('input[type="radio"], input[type="checkbox"], textarea, input[type="text"]');
        if (hasControls) return false;

        const text = (element.innerText || element.textContent || '').trim();
        if (!text) return false;

        // 2. 文本长度限制：章节标题通常较短
        if (text.length > 80) return false;

        // 3. 优先看父容器是否是章节容器（学习通侧边栏等）
        const chapterContainerSelectors = [
            '[class*="chapter"]',
            '[class*="catalog"]',
            '[class*="tree"]',
            '[class*="outline"]',
            '[class*="toc"]',
            '[class*="posCatalog"]',
            '[class*="anchor-bar"]',
            '[class*="sideBar"]',
            '[class*="menuList"]',
            '[class*="directory"]',
            '.chapter-content',
            '.chapter_list',
            '.timeline',
            '.anchor-list'
        ];
        let inChapterContainer = false;
        for (const sel of chapterContainerSelectors) {
            if (element.closest(sel)) {
                inChapterContainer = true;
                break;
            }
        }
        if (!inChapterContainer) return false;

        // 4. 在章节容器内才检查文本模式
        // 学习通章节："13.7 课程知识点"、"15.5 数据库CRUD操作（2）"
        // 章节："第三章"、"第一节"
        // 视频章节点："16.1 系统需求分析与设计"
        const chapterPatterns = [
            /^\d+\.\d+\s+\S+/,                              // 13.7 xxx
            /^第[一二三四五六七八九十百千万\d]+\s*[章节讲篇课]/,  // 第三章
        ];
        for (const p of chapterPatterns) {
            if (p.test(text)) {
                // 进一步确认不含问号（章节一般不是问句）
                if (!/[？?]/.test(text)) {
                    return true;
                }
            }
        }

        return false;
    }

    // 平台 URL 精确识别
    // 根据 URL 路径返回该平台精确的题目容器选择器
    // 返回 '__NO_QUESTION__' 表示该页面**没有题目**（如视频学习页、首页等）
    // 返回 null 表示未匹配平台，需要走通用fallback（**但仍可能误识别**）
    function getPlatformQuestionRoot() {
        const path = location.pathname;
        const href = location.href;

        // ==================== 已知"无题目"页面（直接排除） ====================
        // 登录页、认证页
        if (path.includes('/login') || path.includes('/signin') || path.includes('/auth') ||
            href.includes('/login') || href.includes('/signin') || href.includes('/auth')) {
            return '__NO_QUESTION__';
        }

        // 学习通视频学习页：/mycourse/studentstudy
        // 这种页面有章节导航、任务点、视频播放器，**没有题目**
        if (path.includes('/mycourse/studentstudy') ||
            path.includes('/mycourse/teacherstudy') ||
            path.includes('/mycourse/college') ||
            path.includes('/mooc2/course') ||
            path.includes('/work/list') ||
            path.includes('/exam/list') ||
            path.includes('/work/doHomeWorkList') ||
            path.includes('/exam/testList') ||
            path.includes('/mooc2/index') ||
            path === '/ananas/modules/video/index.html' ||
            href.includes('mycourse/studentstudy')) {
            return '__NO_QUESTION__';
        }

        // ==================== 有题目的页面 ====================
        // 学习通作业
        if (path === "/mooc2/work/dowork" || path === "/mooc-ans/mooc2/work/dowork") {
            return ".questionLi";
        }
        // 学习通新版考试/章节测验
        if (path === "/exam/test/reVersionTestStartNew" || path === "/exam-ans/exam/test/reVersionTestStartNew" || path === "/mooc-ans/exam/test/reVersionTestStartNew") {
            // 新版考试
            if (href.includes("newMooc=true")) {
                return ".questionLi";
            }
            // 旧版考试
            return ".TiMu";
        }
        // 学习通考试中心（所有题目）
        if (path === "/mooc2/exam/preview" || path === "/exam-ans/mooc2/exam/preview" || path === "/mooc-ans/mooc2/exam/preview") {
            return ".questionLi";
        }
        // 超星章节测验
        if (path === "/work/doHomeWorkNew" || path === "/mooc-ans/work/doHomeWorkNew") {
            return ".clearfix .TiMu";
        }
        // 超星随堂测验
        if (path.includes("/page/quiz/stu/answerQuestion")) {
            return ".question-item";
        }
        return null;
    }

    /*
     * 判分后回写题库（2026-10-23 新增）
     * ------------------------------------------------------------------
     * 学习通把作业/考试批阅之后，题目容器里会带上**平台判定的正确答案**。
     * 脚本读到就回写到题库服务 —— 题库因此会随使用量自动变厚。
     * 这是「自建题库」唯一能规模化增长的路径（人工整理永远追不上）。
     *
     * 答案提取沿用「学习通题目导出.user.js」里已在真实环境验证过的两套办法：
     *   ① .mark_answer .rightAnswerContent —— 结构化，新样式；
     *   ② 文本锚点「正确答案 / 参考答案」—— 不依赖 class，兼容改版，
     *      并排除「下列哪个是正确答案？」这类普通问句的误判。
     *
     * 题干与选项**复用** detectQuestions() 的结果，不另写一套解析。
     * 回写地址：{站点}/tiku-api/api/collect —— 8080 反代到 8091 的题库服务
     * （8091 没放行公网，走 8080 网关最省事）。
     */

    /* 本次会话已回写过的题干，避免每次扫描都重复提交 */
    const collectedStems = new Set();

    function extractMarkedCorrectAnswer(questionEl) {
        if (!questionEl) return '';
        // ① 结构化答案（.mark_answer .rightAnswerContent）
        try {
            const right = questionEl.querySelector('.mark_answer .rightAnswerContent');
            if (right) {
                const t = (right.textContent || '').replace(/\s+/g, ' ').trim();
                const cleaned = t.replace(/^(?:正确答案|参考答案|答案)\s*[:：]?\s*/, '').trim();
                if (cleaned) return cleaned;
            }
        } catch (e) { /* 继续走文本回退 */ }
        // ② 文本锚点回退（不依赖 class）
        const plain = (questionEl.textContent || '').replace(/[\u00a0\s]+/g, ' ').trim();
        const choice = plain.match(/(?:正确|参考)\s*答案\s*[:：]?\s*([A-H](?:\s*[,，、;；/|]\s*[A-H])*)/i);
        if (choice) return choice[1].replace(/[\s，、;；/|]/g, '').toUpperCase();
        const judge = plain.match(/(?:正确|参考)\s*答案\s*[:：]?\s*(√|✓|×|✕|✖|正确|错误|对|错|是|否|true|false)/i);
        if (judge) return judge[1];
        return '';
    }

    /* 把一条已判分的题目回写到题库服务 */
    function postCollectToTiku(payload) {
        const base = getPortalServerBase();
        if (!base) return Promise.resolve(false);
        /*
         * 回写走**沉淀池**（/tiku-api/api/pool）而不是公共写接口：
         *   · 脚本是公开的，藏在脚本里的写入口令人人可见 → 公开端点只能不靠密钥；
         *   · 沉淀池不参与匹配，脏数据污染不到任何人；
         *   · 由管理员审核后才晋升到公共池（服务端质量闸会自动校验答案是否在选项内）。
         */
        const url = String(base).replace(/\/+$/, '') + '/tiku-api/api/pool';
        return new Promise((resolve) => {
            try {
                GM_xmlhttpRequest({
                    method: 'POST',
                    url: url,
                    headers: { 'Content-Type': 'application/json' },
                    data: JSON.stringify(payload),
                    timeout: 8000,
                    onload: function (res) { resolve(res.status >= 200 && res.status < 300); },
                    onerror: function () { resolve(false); },
                    ontimeout: function () { resolve(false); }
                });
            } catch (e) { resolve(false); }
        });
    }

    /*
     * 扫描当前页面上的已判分题目并回写。
     * @param {Array} questions detectQuestions() 的结果（不给就自己扫一遍）
     * @returns {Promise<number>} 实际回写成功的条数
     */
    async function collectMarkedAnswers(questions) {
        try {
            if (!state.settings.tikuEnabled) return 0;
            if (!getPortalServerBase()) return 0;
            let list = questions;
            if (!Array.isArray(list)) {
                const root = getPlatformQuestionRoot();
                if (!root) return 0;
                list = detectQuestions(root) || [];
            }
            if (!list || !list.length) return 0;

            let count = 0;
            for (const q of list) {
                try {
                    const answer = extractMarkedCorrectAnswer(q.element);
                    if (!answer) continue;                 // 没判分 → 跳过（普通答题页就是这种情况）
                    const stem = String(q.cleanText || '').trim();
                    if (!stem || stem.length < 4) continue;
                    if (collectedStems.has(stem)) continue;
                    const options = (Array.isArray(q.options) ? q.options : [])
                        .map((o) => String((o && o.text) || '').replace(/^[A-Ha-h][\.、\)）\s]*/, '').trim())
                        .filter(Boolean);
                    if (!options.length) continue;         // 没选项的回写价值低，先跳过
                    const isJudge = options.length === 2;
                    const type = isJudge ? '判断题' : (answer.length > 1 ? '多选题' : '单选题');
                    const ok = await postCollectToTiku({
                        question: stem,
                        options: options,
                        type: type,
                        answer: answer,
                        source: '学习通判分自动沉淀',
                        // ⚠ clientId：服务端据此把题写进**用户自己的私有题库**，
                        //   本人立刻就能查得到（不用等管理员审核），且别人的查询查不到。
                        clientId: getPortalClientId()
                    });
                    if (ok) {
                        collectedStems.add(stem);
                        count++;
                        addLog('已回写题库：' + stem.slice(0, 30) + ' → ' + answer, 'info');
                    }
                } catch (e) { /* 单条失败不影响其它 */ }
            }
            if (count) addLog('本次共回写题库 ' + count + ' 道已判分题目', 'info');
            return count;
        } catch (e) {
            return 0;
        }
    }

    function detectQuestions(container) {
        const questions = [];

        // 登录页/认证页直接返回空，避免把登录表单误判为题目
        if (isLoginPage()) {
            return questions;
        }

        // ==================== 策略0：URL精确识别"无题目"页面（直接返回空） ====================
        const platformRoot = getPlatformQuestionRoot();
        if (platformRoot === '__NO_QUESTION__') {
            // 这是视频学习页、首页等，根本没有题目
            return questions;
        }

        // 策略1：URL 精确匹配
        // 章节导航栏在不同的DOM容器中，使用平台的精确root选择器根本不会匹配到章节
        // 这是避免章节误识别的根本方法
        if (platformRoot) {
            const found = container.querySelectorAll(platformRoot);
            if (found.length > 0) {
                for (const el of found) {
                    const text = (el.innerText || el.textContent || '').trim();
                    if (text.length > 3) {
                        const isImgQ = isImageQuestion(el);
                        questions.push({
                            index: questions.length + 1,
                            rawText: text,
                            cleanText: cleanQuestionText(text) || text,
                            element: el,
                            options: extractOptions(el),
                            isImageQuestion: isImgQ
                        });
                    }
                }
                // URL精确匹配成功，直接返回，不再走通用选择器（避免章节干扰）
                if (questions.length > 0) {
                    return questions;
                }
            }
        }

        // ==================== 策略2：fallback到通用选择器（仅在URL匹配不到时使用） ====================
        // 此时才使用宽泛选择器，但必须经过严格的章节排除

        // 排除侧边栏/导航栏/目录区域的选择器
        const excludeSelectors = [
            '[class*="sidebar"]',
            '[class*="nav"]',
            '[class*="menu"]',
            '[class*="catalog"]',
            '[class*="chapter"]',
            '[class*="directory"]',
            '[class*="toc"]',
            '[class*="outline"]',
            '[class*="tree"]',
            '[class*="list"]',
            '[id*="sidebar"]',
            '[id*="nav"]',
            '[id*="menu"]',
            '[id*="catalog"]',
            '[id*="chapter"]',
            'aside',
            'nav'
        ];

        // 精确的题目容器选择器（优先使用）
        const preciseSelectors = [
            '.questionLi',           // 学习通
            '.TiMu',                 // 超星
            '.question-item',        // 超星随堂测验
            '.exam-question',
            '.test-question',
            '.quiz-question',
            '[class*="question-item"]',
            '[class*="question-content"]',
            '[class*="question-body"]',
            '[class*="exam-item"]',
            '[class*="test-item"]'
        ];

        // 通用题目选择器（备用）
        const generalSelectors = [
            '[class*="question"]',
            '[class*="exam"]',
            'div[class*="question"]'
        ];

        // 辅助函数：检查元素是否在排除区域内
        function isInExcludedArea(el) {
            for (const sel of excludeSelectors) {
                if (el.closest(sel)) return true;
            }
            return false;
        }

        // 辅助函数：检查元素是否包含答题控件（单选框/复选框/输入框）
        function hasAnswerControls(el) {
            return el.querySelector('input[type="radio"], input[type="checkbox"], input[type="text"], textarea, .option, .answer') !== null;
        }

        // 综合判断元素是否应该被排除（章节/导航/无答题控件）
        function shouldExcludeElement(el) {
            if (isInExcludedArea(el)) return true;
            if (isChapterElement(el)) return true;
            return false;
        }

        let qElements = [];

        // 优先使用精确选择器
        if (qElements.length === 0) {
            for (const sel of preciseSelectors) {
                const found = container.querySelectorAll(sel);
                if (found.length > 0) {
                    qElements = Array.from(found).filter(el => {
                        if (shouldExcludeElement(el)) return false;
                        const text = (el.innerText || el.textContent || '').trim();
                        return text.length > 5; // 降低长度要求
                    });
                    if (qElements.length > 0) break;
                }
            }
        }

        // 如果精确选择器没找到，尝试通用选择器
        if (qElements.length === 0) {
            for (const sel of generalSelectors) {
                const found = container.querySelectorAll(sel);
                if (found.length > 0) {
                    qElements = Array.from(found).filter(el => {
                        if (shouldExcludeElement(el)) return false;
                        const text = (el.innerText || el.textContent || '').trim();
                        return text.length > 5;
                    });
                    if (qElements.length > 0) break;
                }
            }
        }

        // 如果还没找到，尝试更宽泛的选择器但排除导航区域和章节
        if (qElements.length === 0) {
            const wideFound = container.querySelectorAll('[class*="item"], [class*="topic"], li');
            qElements = Array.from(wideFound).filter(el => {
                if (shouldExcludeElement(el)) return false;
                // 必须包含答题控件或选项标记
                if (!hasAnswerControls(el) && !/[A-Fa-f][\.、\)\s]/.test(el.textContent)) return false;
                const text = (el.innerText || el.textContent || '').trim();
                return text.length > 5;
            });
        }

        // 关键：不再 fallback 到 [container]，避免把整个body误识别为单个"题目"
        // 如果宽泛选择器也没找到，说明当前页面没有题目，直接返回空数组

        // 去重 - 避免重复识别
        const processedElements = new Set();

        qElements.forEach(el => {
            // 跳过已处理的父元素的子元素
            let parent = el.parentElement;
            let isChild = false;
            while (parent) {
                if (processedElements.has(parent)) {
                    isChild = true;
                    break;
                }
                parent = parent.parentElement;
            }
            if (isChild) return;

            // 再次检查排除区域和章节
            if (shouldExcludeElement(el)) return;

            const text = (el.innerText || el.textContent || '').trim();

            // 检查是否是图片题目
            const isImgQ = isImageQuestion(el);

            // 匹配题目模式（放宽匹配条件）
            const patterns = [
                /^(\d+)[\.、\)\s]+(.+)/,           // 1. xxx 或 1）xxx
                /^[一二三四五六七八九十百千万][\.、\s]+(.+)/, // 一、xxx
                /^第\s*(\d+)\s*[题道小题]/,          // 第1题 / 第1道 / 第1小题
                /^Question\s*\d+/i,                  // Question 1
                /^Q[\.\s]\d+/i,                      // Q.1
                /^\d+\s*[-:]\s*/,                    // 1 - xxx 或 1: xxx
                /^[（(]\d+[）)]\s*/                   // (1) xxx
            ];

            // 对于图片题目，直接添加
            if (isImgQ) {
                processedElements.add(el);
                questions.push({
                    index: questions.length + 1,
                    rawText: text,
                    cleanText: text || '[图片题目]',
                    element: el,
                    options: extractOptions(el),
                    isImageQuestion: true
                });
            } else {
                // 检查是否匹配题目模式，或包含答题控件
                let isQuestion = false;
                for (const p of patterns) {
                    if (p.test(text)) {
                        isQuestion = true;
                        break;
                    }
                }

                // 如果没有匹配题目模式，但包含答题控件（单选/复选框/选项），也认为是题目
                if (!isQuestion && hasAnswerControls(el)) {
                    isQuestion = true;
                }

                if (isQuestion) {
                    const cleanText = cleanQuestionText(text);
                    if (cleanText.trim().length > 3 || isImgQ) { // 大幅降低长度要求
                        processedElements.add(el);
                        questions.push({
                            index: questions.length + 1,
                            rawText: text,
                            cleanText: cleanText,
                            element: el,
                            options: extractOptions(el),
                            isImageQuestion: isImgQ
                        });
                    }
                }
            }
        });

        // 如果上面没识别到，尝试更宽松的识别（扫描整个容器）
        if (questions.length === 0) {
            const allElements = container.querySelectorAll('div, section, article');
            allElements.forEach(el => {
                if (isInExcludedArea(el)) return;
                const text = (el.innerText || el.textContent || '').trim();
                if (text.length > 10 && text.length < 1000) {
                    // 检查是否包含选项标记或答题控件
                    if (/[A-Fa-f][\.、\)\s]/.test(text) || hasAnswerControls(el)) {
                        const cleanText = cleanQuestionText(text);
                        if (cleanText.trim().length > 5) {
                            processedElements.add(el);
                            questions.push({
                                index: questions.length + 1,
                                rawText: text,
                                cleanText: cleanText,
                                element: el,
                                options: extractOptions(el)
                            });
                        }
                    }
                }
            });
        }

        return questions;
    }

    function cleanQuestionText(text) {
        return text
            .replace(/\s+/g, ' ')
            .replace(/^\d+[\.、\)\s]*/, '')
            .replace(/^[一二三四五六七八九十][\.、\s]*/, '')
            .replace(/^第\d+\s*题[\s：:]*/, '')
            .trim();
    }

    function extractOptions(element) {
        const options = [];

        // 方法1: 查找包含选项文本的元素
        const optPattern = /^[A-Fa-f][\.、\)\s]/;
        const children = element.querySelectorAll('*');

        children.forEach(child => {
            const text = child.textContent.trim();
            if (optPattern.test(text) && text.length < 200) {
                options.push({ letter: text.charAt(0).toUpperCase(), text, element: child });
            }
        });

        // 方法2: 如果上面没找到，查找单选/复选框
        if (options.length === 0) {
            const inputs = element.querySelectorAll('input[type="radio"], input[type="checkbox"]');
            inputs.forEach(input => {
                // 查找附近的标签文本
                let label = input.closest('label');
                if (!label) {
                    const id = input.getAttribute('id');
                    if (id) label = element.querySelector(`label[for="${id}"]`);
                }

                let letter = null;
                let text = '';

                if (label) {
                    text = label.textContent.trim();
                    const match = text.match(/^([A-Fa-f])/);
                    if (match) letter = match[1].toUpperCase();
                } else {
                    // 检查value或附近文本
                    const parent = input.parentElement;
                    if (parent) {
                        text = parent.textContent.trim();
                        const match = text.match(/^([A-Fa-f])/);
                        if (match) letter = match[1].toUpperCase();
                    }
                }

                if (!letter) {
                    // 如果找不到字母，尝试按顺序分配
                    letter = String.fromCharCode(65 + options.length);
                }

                options.push({
                    letter: letter,
                    text: text,
                    element: input,
                    isInput: true
                });
            });
        }

        return normalizeOptions(options);
    }

    // 选项规范化：按字母去重 + 把"只剩字母的标记元素"换成可点击的容器
    // 2026-10-21 实机核验（超星学习通作业题真实 DOM）：
    //   <li class="clearfix"><i class="fl">A、</i><a class="fl"><p><span>00090H</span>…</p></a></li>
    // 原来 <li> 和 <i> 的 textContent 都以 "A、" 开头 → 同一个字母被收了两遍。
    // 后果：① 给 AI 的选项表变成 A/A/B/B/C/C/D/D（其中一半内容为空），干扰模型；
    //      ② 按文本相似度匹配答案时，可能命中只有字母的 <i>（点了等于没点，选项不会被选中）。
    // 现在：同一字母只保留内容最完整的一条；内容为空时改用可点击的 li/label 容器。
    function normalizeOptions(options) {
        const byLetter = new Map();
        for (const opt of options) {
            if (!opt || !opt.letter) continue;
            const content = (opt.text || '').replace(/^[A-Fa-f][\.、\)\s]*/, '').trim();
            const prev = byLetter.get(opt.letter);
            if (!prev) { byLetter.set(opt.letter, opt); continue; }
            const prevContent = (prev.text || '').replace(/^[A-Fa-f][\.、\)\s]*/, '').trim();
            // 保留内容更长（更完整）的那条
            if (content.length > prevContent.length) byLetter.set(opt.letter, opt);
        }
        const out = [];
        for (const [letter, opt] of byLetter) {
            const content = (opt.text || '').replace(/^[A-Fa-f][\.、\)\s]*/, '').trim();
            if (!content && opt.element && !opt.isInput) {
                // 只有字母标记（<i>A、</i> 这类）→ 换成可点击的祖先容器
                const host = opt.element.closest
                    ? opt.element.closest('li, label, p, .clearfix, .option, .answer, .TiMu li')
                    : null;
                if (host) {
                    const hostText = (host.textContent || '').trim();
                    if (hostText) {
                        out.push({ letter: letter, text: hostText, element: host, isInput: false });
                        continue;
                    }
                }
            }
            out.push(opt);
        }
        out.sort((a, b) => String(a.letter).localeCompare(String(b.letter)));
        return out;
    }

    // ==================== 选项文本相似度匹配（参考 OCS） ====================
    function compareTwoStrings(first, second) {
        first = String(first || '').replace(/\s+/g, '');
        second = String(second || '').replace(/\s+/g, '');
        if (first === second) return 1;
        if (first.length < 2 || second.length < 2) return 0;
        const firstBigrams = new Map();
        for (let i = 0; i < first.length - 1; i++) {
            const bigram = first.substring(i, i + 2);
            const count = firstBigrams.has(bigram) ? firstBigrams.get(bigram) + 1 : 1;
            firstBigrams.set(bigram, count);
        }
        let intersectionSize = 0;
        for (let i = 0; i < second.length - 1; i++) {
            const bigram = second.substring(i, i + 2);
            const count = firstBigrams.has(bigram) ? firstBigrams.get(bigram) : 0;
            if (count > 0) {
                firstBigrams.set(bigram, count - 1);
                intersectionSize++;
            }
        }
        return 2 * intersectionSize / (first.length + second.length - 2);
    }

    function findBestMatch(mainString, targetStrings) {
        const ratings = targetStrings.map(target => ({
            target,
            rating: compareTwoStrings(mainString, target)
        }));
        let bestMatchIndex = 0;
        for (let i = 1; i < ratings.length; i++) {
            if (ratings[i].rating > ratings[bestMatchIndex].rating) bestMatchIndex = i;
        }
        return { ratings, bestMatch: ratings[bestMatchIndex], bestMatchIndex };
    }

    function clearString(str) {
        return String(str || '').trim().toLocaleLowerCase()
            .replace(/[^\u2E80-\u9FFFA-Za-z0-9]/g, '');
    }

    function removeRedundant(str) {
        return String(str || '').trim()
            .replace(/^[A-Fa-f][^A-Za-z0-9\u2E80-\u9FFF]*([A-Za-z0-9\u2E80-\u9FFF]+)/, '$1');
    }

    function answerSimilar(answers, options) {
        const _answers = answers.map(removeRedundant).map(clearString);
        const _options = options.map(removeRedundant).map(clearString);
        if (_answers.length === 0) {
            return _options.map(() => ({ rating: 0, target: '' }));
        }
        return _options.map(option => {
            if (!option.trim()) return { rating: 0, target: '' };
            return findBestMatch(option, _answers).bestMatch;
        });
    }

    // ==================== 智能填写答案 ====================
    function fillAnswer(questionEl, answer, questionType) {
        const isLongAnswer = ['简答题', '论述题', '计算题', '问答题', '材料题', '综合题', '分析题'].includes(questionType);
        const isCompletion = questionType === '填空题';

        // ==================== 文本题通用填写（填空/简答/计算/问答） ====================
        // 参考 OCS 与万能脚本：优先处理 UEditor 富文本，其次 iframe/textarea/contenteditable

        // 0) 拆分答案（填空题多空用 # 分隔；长答案保留完整）
        const answerParts = (isCompletion && !isLongAnswer)
            ? String(answer).split(/\s*(?:===|###|\||;|；|@@|##|#)\s*/)
            : [String(answer)];

        // 1) 找到题目区域内所有 textarea（含嵌套 iframe 富文本）
        const textareas = Array.from(questionEl.querySelectorAll('textarea'));
        const iframes = Array.from(questionEl.querySelectorAll('iframe'));
        const contentEditables = Array.from(questionEl.querySelectorAll('[contenteditable="true"], [role="textbox"], .edui-body'));
        const plainInputs = Array.from(questionEl.querySelectorAll('input[type="text"], input[type="input"], input:not([type]), input[type="number"], .answer-input, #answer'));

        // 1.1) 尝试 UEditor：超星常见，textarea 的 name/id 即 editorId
        if (typeof window.UE !== 'undefined' && window.UE.getEditor) {
            for (const ta of textareas) {
                const editorId = ta.getAttribute('name') || ta.id || ta.getAttribute('data-name');
                if (!editorId) continue;
                try {
                    const editor = window.UE.getEditor(editorId);
                    if (editor && editor.setContent) {
                        const finalAnswer = answerParts.join('<br/>');
                        editor.setContent(finalAnswer);
                        editor.fire && editor.fire("contentchange");
                        // 点击保存按钮（OCS 选择器：option.parentElement.parentElement 里的 [onclick*=saveQuestion]）
                        const saveBtn = questionEl.querySelector('[onclick*="saveQuestion"]')
                            || document.querySelector(`#save_${editorId.replace(/answerEditor/i, '')}`)
                            || document.querySelector(`#save_${editorId}`);
                        if (saveBtn) saveBtn.click();
                        addLog(`已填写 UEditor（editorId=${editorId}）`, 'success');
                        return true;
                    }
                } catch (ueErr) {
                    addLog(`UEditor 尝试失败: ${ueErr.message}`, 'warn');
                }
            }
        }

        // 1.2) 处理 iframe 富文本（OCS：iframe.contentDocument.body.innerHTML = answer）
        let iframeFilled = false;
        for (const iframe of iframes) {
            try {
                const doc = iframe.contentDocument || (iframe.contentWindow && iframe.contentWindow.document);
                if (doc && doc.body) {
                    doc.body.innerHTML = answerParts.map(p => `<p>${p}</p>`).join('');
                    doc.body.dispatchEvent(new Event('input', { bubbles: true }));
                    iframeFilled = true;
                }
            } catch (e) {}
        }
        if (iframeFilled) {
            const saveBtn = questionEl.querySelector('[onclick*="saveQuestion"]');
            if (saveBtn) saveBtn.click();
            addLog('已填写 iframe 富文本', 'success');
            return true;
        }

        // 1.3) 处理 contenteditable 富文本
        if (contentEditables.length > 0) {
            for (let i = 0; i < contentEditables.length; i++) {
                const ce = contentEditables[i];
                const val = answerParts[i] !== undefined ? answerParts[i] : (answerParts[0] || '');
                if (!val) continue;
                ce.innerHTML = `<p>${val}</p>`;
                ce.dispatchEvent(new Event('input', { bubbles: true }));
                ce.dispatchEvent(new Event('change', { bubbles: true }));
                ce.dispatchEvent(new Event('blur', { bubbles: true }));
            }
            const saveBtn = questionEl.querySelector('[onclick*="saveQuestion"]');
            if (saveBtn) saveBtn.click();
            addLog(`已填写 contenteditable`, 'success');
            return true;
        }

        // 1.4) 处理普通 textarea / input
        const allTextInputs = textareas.concat(plainInputs);
        if (allTextInputs.length > 0) {
            let success = 0;
            for (let i = 0; i < allTextInputs.length; i++) {
                const val = answerParts[i] !== undefined ? answerParts[i] : (answerParts[0] || '');
                if (!val) continue;
                setNativeInputValue(allTextInputs[i], val);
                success++;
            }
            if (success > 0) {
                const saveBtn = questionEl.querySelector('[onclick*="saveQuestion"]');
                if (saveBtn) saveBtn.click();
                addLog(`已填写 ${success} 个文本输入`, 'success');
                return true;
            }
        }

        // 1.5) 兜底：在更广范围（父容器）里找 textarea / input / contenteditable
        const parent = questionEl.closest('[class*="question"], [class*="item"], li, .TiMu') || questionEl.parentElement;
        if (parent && parent !== questionEl) {
            const parentTextareas = Array.from(parent.querySelectorAll('textarea'));
            const parentInputs = Array.from(parent.querySelectorAll('input[type="text"], input[type="input"], input:not([type]), input[type="number"]'));
            const parentCE = parent.querySelector('[contenteditable="true"], [role="textbox"], .edui-body');
            if (parentTextareas.length > 0 || parentInputs.length > 0 || parentCE) {
                return fillAnswer(parent, answer, questionType);
            }
        }

        // 1.6) 兜底：查找后续兄弟元素中的答题区（超星常见：题干和输入区并列）
        let sibling = questionEl.nextElementSibling;
        let loopGuard = 0;
        while (sibling && loopGuard < 5) {
            loopGuard++;
            if (sibling.querySelector('textarea, input[type="text"], input:not([type]), [contenteditable="true"], iframe')) {
                return fillAnswer(sibling, answer, questionType);
            }
            sibling = sibling.nextElementSibling;
        }

        // 如果是选择题，点击选项
        // 支持多种格式：单个字母(A)、多个字母(AD、A D、A,B,C、A B C)
        const cleanAnswer = answer.trim().toUpperCase();

        // === 关键修复：先判断题目类型 ===
        // 1. 判断题特征：2 个 input[type=radio]（不是 > 2 个，所以不是单选/多选）
        // 2. 在判断题里，"A" 这个单字母答案**不是 A 选项**，而是答案"对"（因为 A 选项文本可能是"对"）
        // 3. 必须用 findJudgementOption 找**真正含"对/错"的那个 radio**，不能用 clickOption('A')
        const isJudgementQuestion = (() => {
            const radios = questionEl.querySelectorAll('input[type="radio"]');
            return radios.length === 2;  // 正好 2 个 radio = 判断题
        })();

        // 判断题处理
        // isTrue / isFalse 正则判语义，再按 data.options 索引
        // correctWords / incorrectWords 数组匹配，遍历选项文本
        // 关键：单字母 "A"/"B" 在判断题里**不能直接 clickOption('A')**，
        //      因为判断题的 A 选项文本可能是"对"或"错"，不一定是 A
        // （函数定义在下方通用判断处，此处直接调用，避免同名函数重复定义）

        if (isJudgementQuestion) {
            let answerIsTrue = isJudgementTrue(cleanAnswer);
            let answerIsFalse = isJudgementFalse(cleanAnswer);
            // AI 偶尔按选项字母回答判断题（A=对 / B=错），补充映射
            if (!answerIsTrue && !answerIsFalse) {
                if (/^A(\s*[,，、.。]|$)/.test(cleanAnswer)) answerIsTrue = true;
                else if (/^B(\s*[,，、.。]|$)/.test(cleanAnswer)) answerIsFalse = true;
            }
            if (answerIsTrue || answerIsFalse) {
                const targetIsTrue = answerIsTrue;
                const foundOption = findJudgementOption(questionEl, targetIsTrue);
                if (foundOption) {
                    try {
                        if (foundOption.isInput) {
                            if (!foundOption.element.checked) {
                                foundOption.element.checked = true;
                            }
                            foundOption.element.dispatchEvent(new Event('change', { bubbles: true }));
                            foundOption.element.dispatchEvent(new Event('input', { bubbles: true }));
                            // 某些平台用 click() 触发 Vue 监听器，再 click 一次
                            try { foundOption.element.click(); } catch (e) {}
                        } else {
                            foundOption.element.click();
                        }
                        addLog(`已选判断题"${targetIsTrue ? '对' : '错'}"（找到元素）`, 'success');
                        setTimeout(() => clickSaveButton(questionEl), 50);
                        return true;
                    } catch (e) {
                        addLog(`判断题 click 异常: ${e.message}`, 'error');
                    }
                }
                // 兜底：硬编码 A=对/B=错
                addLog('判断题兜底：A=对/B=错', 'warn');
                return clickOption(questionEl, targetIsTrue ? 'A' : 'B');
            }
        }

        // 检测是否为多选题答案（包含多个字母）
        // 仅当答案整体就是"字母+分隔符"组合时才按选项点击；
        // 简答/论述等长文本答案里偶尔出现的 A-F 字母不应触发点击（会乱选）
        const lettersOnly = /^[A-Fa-f][A-Fa-f\s,，、.。]*$/.test(cleanAnswer.trim());
        if (lettersOnly) {
            const multiMatch = cleanAnswer.match(/[A-F](?:[,\s][A-F])*/g);
            if (multiMatch && multiMatch.length > 0) {
                // 提取所有字母
                const letters = cleanAnswer.replace(/[^A-F]/g, '');
                if (letters.length > 0) {
                    let success = false;
                    for (const letter of letters) {
                        if (clickOption(questionEl, letter)) {
                            success = true;
                        }
                    }
                    if (success) return true;
                }
            }
        }

        // 检测判断题答案（正确/错误、对/错）
        // 核心：不硬编码 A=对/B=错，而是读取选项实际文本，用 isTrue/isFalse 正则判语义
        function isJudgementTrue(str) { return /(^|,)(正确|是|对|√|T|ri|true)(,|$)/i.test(String(str)); }
        function isJudgementFalse(str) { return /(^|,)(错误|否|错|×|F|不是|wr|false)(,|$)/i.test(String(str)); }

        const answerIsTrue = isJudgementTrue(cleanAnswer);
        const answerIsFalse = isJudgementFalse(cleanAnswer);

        if (!isJudgementQuestion && (answerIsTrue || answerIsFalse)) {
            const targetIsTrue = answerIsTrue;

            // 判断题专用填充逻辑
            // 核心思路：不依赖 extractOptions，直接找包含"对/错"文本的最小 label/li/span
            // 并按 DOM 顺序定位到具体的 radio input。
            // 新版超星判断题 DOM 通常是：
            //   <ul><li><input type=radio><span>对</span></li><li><input type=radio><span>错</span></li></ul>
            //   或 <div><label><input type=radio><span class="nodeLab">对</span></label>...</div>

            const foundOption = findJudgementOption(questionEl, targetIsTrue);
            if (foundOption) {
                try {
                    if (foundOption.isInput) {
                        // radio/checkbox input
                        if (!foundOption.element.checked) {
                            foundOption.element.checked = true;
                        }
                        foundOption.element.dispatchEvent(new Event('change', { bubbles: true }));
                        foundOption.element.dispatchEvent(new Event('input', { bubbles: true }));
                    } else {
                        // label/li/div - 触发整块 click
                        foundOption.element.click();
                    }
                    addLog(`已选判断题"${targetIsTrue ? '对' : '错'}"（找到元素）`, 'success');
                    setTimeout(() => clickSaveButton(questionEl), 50);
                    return true;
                } catch (e) {
                    addLog(`判断题 click 异常: ${e.message}`, 'error');
                }
            }

            // 兜底：硬编码 A=对/B=错
            addLog('判断题兜底：A=对/B=错', 'warn');
            return clickOption(questionEl, targetIsTrue ? 'A' : 'B');
        }

        // 单个字母选项
        if (/^[A-F]$/.test(cleanAnswer)) {
            return clickOption(questionEl, cleanAnswer);
        }

        // AI 返回答案是文本时，用选项文本相似度匹配
        const options = extractOptions(questionEl);
        if (options.length > 0) {
            const optionTexts = options.map(o => o.text);
            const similarities = answerSimilar([cleanAnswer, String(answer)], optionTexts);
            let bestIndex = -1;
            let bestRating = 0;
            for (let i = 0; i < similarities.length; i++) {
                if (similarities[i].rating > bestRating) {
                    bestRating = similarities[i].rating;
                    bestIndex = i;
                }
            }
            if (bestIndex >= 0 && bestRating >= 0.5) {
                const bestOption = options[bestIndex];
                addLog(`文本答案匹配到选项 ${bestOption.letter}（相似度 ${(bestRating * 100).toFixed(1)}%）`, 'success');
                if (bestOption.element) {
                    tryClickOptionElement(bestOption.element);
                    setTimeout(() => clickSaveButton(questionEl), 50);
                }
                return true;
            }
        }

        return false;
    }

    function setNativeInputValue(el, value) {
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        nativeSetter.call(el, value);

        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Enter' }));
        el.blur();

        // 兼容React Fiber
        const reactKey = Object.keys(el).find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
        if (reactKey) {
            const fiber = el[reactKey];
            if (fiber && fiber.memoizedProps && fiber.memoizedProps.onChange) {
                fiber.memoizedProps.onChange({ target: el });
            }
        }
    }

    // ==================== 判断题专用查找函数 ====================
    // 判断题处理辅助
    //   1) 遍历所有可点击选项元素（label/li/span/nodeLab）
    //   2) 找"文本含对/错且自身不含子选项"的最小容器
    //   3) 优先返回元素内部的 input（更精确），其次返回容器本身
    // 这样能避免 click 整个外层 li 触发"整块选中"导致选错
    function findJudgementOption(questionEl, targetIsTrue) {
        const targetWords = targetIsTrue
            ? ['对', '正确', '√', '是']
            : ['错', '错误', '×', '否', '不是'];

        // 1) 优先从 questionEl 下找所有 input[type=radio]，按 DOM 顺序
        //    通过"包含该 input 的最小文本容器"判断每个 radio 是"对"还是"错"
        const radios = Array.from(questionEl.querySelectorAll('input[type="radio"]'));
        if (radios.length === 2) {
            for (let i = 0; i < radios.length; i++) {
                const radio = radios[i];
                // 找 radio 关联的"最小文本容器"（label > li > 最近的父级）
                let container = radio.closest('label');
                if (!container) {
                    let p = radio.parentElement;
                    while (p && p !== questionEl) {
                        const t = (p.textContent || '').trim();
                        if (t.length > 0 && t.length < 30) {
                            container = p;
                            break;
                        }
                        p = p.parentElement;
                    }
                }
                const containerText = (container?.textContent || '').trim();
                if (targetWords.some(w => containerText.includes(w))) {
                    return { element: radio, isInput: true };
                }
            }
        }

        // 2) 找不到 2 个 radio 时，直接遍历所有 label/nodeLab/li/span
        //    找"文本含对/错且不含其他选项文本"的最小元素
        const candidates = Array.from(questionEl.querySelectorAll('label, .nodeLab, li, .topic-option-item, .answerBg, span, div'));
        let bestCandidate = null;
        let bestLength = Infinity;
        for (const el of candidates) {
            const t = (el.textContent || '').trim();
            if (!t) continue;
            if (t.length > 30) continue;  // 跳过题干/整块
            if (!targetWords.some(w => t === w || (t.length < 5 && t.includes(w)))) continue;
            // 排除"包含多个子选项"的元素（外层 li 含有两个 radio）
            const childRadios = el.querySelectorAll('input[type="radio"]');
            if (childRadios.length > 1) continue;
            if (t.length < bestLength) {
                bestLength = t.length;
                bestCandidate = el;
            }
        }

        if (bestCandidate) {
            const input = bestCandidate.querySelector('input[type="radio"], input[type="checkbox"]');
            if (input) {
                return { element: input, isInput: true };
            }
            return { element: bestCandidate, isInput: false };
        }

        return null;
    }

    // 点击题目的保存按钮（OCS 与万能脚本都会在作答后点击保存）
    function clickSaveButton(questionEl) {
        const saveBtn = questionEl.querySelector('[onclick*="saveQuestion"]')
            || questionEl.closest('.TiMu')?.querySelector('[onclick*="saveQuestion"]')
            || document.querySelector('[onclick*="saveQuestion"]');
        if (saveBtn) {
            saveBtn.click();
            return true;
        }
        return false;
    }

    // 真正尝试触发一个选项的选择（同步尝试多种点击方式）
    function tryClickOptionElement(el) {
        if (!el) return false;

        const tag = (el.tagName || '').toLowerCase();
        const type = (el.getAttribute('type') || '').toLowerCase();
        if (tag === 'input' && (type === 'radio' || type === 'checkbox')) {
            if (!el.checked) {
                el.checked = true;
                el.dispatchEvent(new Event('change', { bubbles: true }));
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            }
            return true;
        }

        try { el.click(); } catch (e) {}

        const subSelectors = ['label', 'span', 'i', 'b', 'em', 'a', 'div'];
        for (const s of subSelectors) {
            const subs = el.querySelectorAll(s);
            for (const sub of subs) {
                try { sub.click(); } catch (e) {}
            }
        }

        const input = el.querySelector('input[type="radio"], input[type="checkbox"]');
        if (input && !input.checked) {
            input.checked = true;
            input.dispatchEvent(new Event('change', { bubbles: true }));
            input.dispatchEvent(new Event('input', { bubbles: true }));
        }

        return true;
    }

    function clickOption(questionEl, letter) {
        letter = letter.toUpperCase();

        // 方法1: 使用extractOptions找到的选项
        const qData = state.questionsList?.find(q => q.element === questionEl);
        if (qData && qData.options) {
            const opt = qData.options.find(o => o.letter === letter);
            if (opt) {
                if (opt.isInput && opt.element) {
                    // 是input元素，直接勾选
                    if (!opt.element.checked) {
                        opt.element.checked = true;
                        opt.element.dispatchEvent(new Event('change', { bubbles: true }));
                        opt.element.dispatchEvent(new Event('input', { bubbles: true }));
                        addLog(`已选择选项 ${letter}`, 'success');
                        return true;
                    }
                } else if (opt.element) {
                    // 点击元素（新版超星判断题：整个 li 容器 click 可能不触发，
                    // 需要 click 容器内每个可点击子元素：圆圈 span、文字 span）
                    const wasCheckedBefore = !!opt.element.querySelector('input:checked');
                    tryClickOptionElement(opt.element);
                    // 检查 100ms 内是否有 radio 被勾上（新加：检测 click 是否真生效）
                    setTimeout(() => {
                        const afterChecked = !!opt.element.querySelector('input:checked');
                        if (!afterChecked && !wasCheckedBefore) {
                            // click 没生效（超星新版），click 每个子元素
                            const allClickable = opt.element.querySelectorAll('span, i, b, em, label');
                            for (const c of allClickable) {
                                try { c.click(); } catch (e) {}
                            }
                        }
                    }, 100);
                    addLog(`已选择选项 ${letter}`, 'success');
                    setTimeout(() => clickSaveButton(questionEl), 50);
                    return true;
                }
            }
        }

        // 方法2: 在题目区域内直接搜索
        const textPatterns = [
            new RegExp(`^${letter}[\\.、\\)\\s]`, 'i'),
            new RegExp(`^${letter}$`, 'i')
        ];

        const allChildren = questionEl.querySelectorAll('*');
        for (const child of allChildren) {
            const text = child.textContent.trim();
            for (const pattern of textPatterns) {
                if (pattern.test(text)) {
                    tryClickOptionElement(child);
                    setTimeout(() => clickSaveButton(questionEl), 50);
                    addLog(`已选择选项 ${letter}`, 'success');
                    return true;
                }
            }
        }

        // 方法3: 查找单选/复选框，按顺序点击
        const inputs = questionEl.querySelectorAll('input[type="radio"], input[type="checkbox"]');
        const index = letter.charCodeAt(0) - 65; // A=0, B=1, etc.
        if (inputs[index]) {
            if (!inputs[index].checked) {
                tryClickOptionElement(inputs[index]);
                setTimeout(() => clickSaveButton(questionEl), 50);
                addLog(`已选择选项 ${letter}`, 'success');
                return true;
            }
            return true;
        }

        // 方法4: 查找label元素，按文本匹配
        const labels = questionEl.querySelectorAll('label');
        for (const label of labels) {
            const text = label.textContent.trim();
            if (new RegExp(`^${letter}[\\.、\\)\\s]`, 'i').test(text)) {
                tryClickOptionElement(label);
                setTimeout(() => clickSaveButton(questionEl), 50);
                addLog(`已选择选项 ${letter}`, 'success');
                return true;
            }
        }

        addLog(`未找到选项 ${letter}`, 'warn');
        return false;
    }

    // ==================== 智能下一题切换 ====================
    function clickNextButton() {
        const nextPatterns = [
            // 文本匹配 - 优先找明确的下一题按钮
            { selector: 'button, a, input[type="button"]', texts: ['下一题', '下一页', 'Next', '下一道', '继续'] },
            // 类名匹配
            { selector: '[class*="next"]:not([class*="submit"]):not([class*="finish"])', texts: [] },
            // ID匹配
            { selector: '[id*="next"]:not([id*="submit"]):not([id*="finish"])', texts: [] }
            // 移除提交按钮作为备选，避免误触提交
        ];

        for (const pattern of nextPatterns) {
            const btns = document.querySelectorAll(pattern.selector);
            for (const btn of btns) {
                const text = btn.textContent.trim() || btn.value || '';
                const isVisible = btn.offsetParent !== null &&
                                  getComputedStyle(btn).display !== 'none' &&
                                  getComputedStyle(btn).visibility !== 'hidden';

                if (!isVisible) continue;

                // 检查是否是禁用状态
                if (btn.disabled || btn.hasAttribute('disabled')) continue;

                // 检查文本是否匹配
                if (pattern.texts.length > 0) {
                    const matched = pattern.texts.some(t => text.includes(t));
                    if (matched) {
                        btn.click();
                        addLog(`已点击"${text}"按钮`, 'success');
                        return true;
                    }
                } else {
                    // 无文本要求时，点击第一个可见元素
                    btn.click();
                    addLog('已点击下一题按钮', 'success');
                    return true;
                }
            }
        }

        // 尝试键盘操作
        simulateKeyPress('ArrowRight');
        addLog('尝试使用方向键切换', 'warn');
        return false;
    }

    function simulateKeyPress(key) {
        const event = new KeyboardEvent('keydown', {
            key: key,
            code: key === 'Enter' ? 'Enter' : (key === 'ArrowRight' ? 'ArrowRight' : ''),
            keyCode: key === 'Enter' ? 13 : (key === 'ArrowRight' ? 39 : 0),
            bubbles: true
        });
        document.activeElement.dispatchEvent(event);
    }

    // ==================== 主控制流程 ====================
async function startAutoAnswer() {
        if (!state.selectedAPIId) {
            showToast('请先选择并启用API', 'error');
            return;
        }

        const api = AI_MODELS[state.selectedAPIId];
        if (!api.enabled || !api.apiKey) {
            showToast('当前API未配置或未启用', 'error');
            return;
        }

        // 双API模式检查
        if (state.settings.enableDualAPI) {
            const secondApi = AI_MODELS[state.settings.secondAPIId];
            if (!secondApi || !secondApi.enabled || !secondApi.apiKey) {
                showToast('双API模式需要配置第二个可用的API', 'error');
                return;
            }
            if (state.selectedAPIId === state.settings.secondAPIId) {
                showToast('两个API不能相同', 'error');
                return;
            }
        }

        // 确定题目区域 - 直接使用整个页面
        const area = document.body;

        state.isRunning = true;
        state.shouldStop = false;

        // 根据答题起始模式初始化
        const startMode = state.settings.startMode;
        if (startMode === 'beginning') {
            state.answeredCount = 0;
            state.lastProcessedIndex = 0;
            addLog('从头开始答题...', 'info');
        } else if (startMode === 'continue') {
            addLog(`从第 ${state.lastProcessedIndex + 1} 题继续...`, 'info');
        }
        // unanswered 模式不需要特殊初始化，会在遍历中处理

        showStatus('正在识别题目...', 'running');

        try {
            // 识别所有题目（刷新页面后需要重新检测）
            const questions = detectQuestions(area);
            state.questionsList = questions; // 缓存题目列表
            state.totalQuestions = questions.length;

            if (state.totalQuestions === 0) {
                throw new Error('未能识别到任何题目，请手动选择题目区域');
            }

            updateProgress(state.lastProcessedIndex, state.totalQuestions);
            addLog(`共识别到 ${state.totalQuestions} 道题目`, 'info');

            if (startMode === 'beginning') {
                showToast(`识别到 ${state.totalQuestions} 道题目`, 'success');
            }

            // 确定起始索引
            let startIndex = 0;
            if (startMode === 'beginning') {
                startIndex = 0;
            } else if (startMode === 'continue') {
                startIndex = state.lastProcessedIndex;
            } else if (startMode === 'unanswered') {
                // 从没做的开始，找到第一个未作答的题目
                startIndex = findFirstUnansweredIndex(questions);
                addLog(`从没做的开始，从第 ${startIndex + 1} 题开始...`, 'info');
            }

            // 逐题处理
            for (let i = startIndex; i < questions.length; i++) {
                if (state.shouldStop) {
                    addLog('用户停止了自动答题', 'warn');
                    state.lastProcessedIndex = i; // 保存当前进度
                    break;
                }

                const q = questions[i];

                // 题目类型筛选
                const qType = detectQuestionType(q);
                if (!isQuestionTypeAllowed(qType)) {
                    addLog(`第 ${i + 1} 题: 类型 "${qType}" 不在筛选列表中，跳过`, 'info');
                    continue;
                }

                // unanswered 模式：跳过已作答的题目
                if (startMode === 'unanswered' && isQuestionAnswered(q)) {
                    addLog(`第 ${i + 1} 题: 已作答，跳过`, 'info');
                    continue;
                }

                state.currentIndex = i + 1;
                updateProgress(i + 1, questions.length);
                showStatus(`正在处理第 ${i + 1}/${questions.length} 题...`, 'running');

                // 滚动到当前题目位置
                q.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                await sleep(500); // 等待滚动完成

                // 处理已作答的题目
                // 已答的题目直接跳过
                if (isQuestionAnswered(q)) {
                    const answeredInfo = getAnsweredInfo(q);
                    // 关键：不要清空用户已选，不要重选！
                    // 已答的题目直接跳过，避免覆盖用户已选答案
                    addLog(`第 ${i + 1} 题: 已作答（${answeredInfo.display}），跳过避免覆盖`, 'info');
                    state.lastProcessedIndex = i + 1;
                    continue;
                }

                // 根据模式处理题目
                if (state.settings.enableDualAPI) {
                    await processWithDualAPI(q);
                } else {
                    await processSingleQuestion(q);
                }

                // 更新进度
                state.lastProcessedIndex = i + 1;

                // 延迟后进入下一题（随机延迟，降低被检测风险）
                if (state.settings.autoNext && i < questions.length - 1) {
                    await sleepRandom(state.settings.delayTime);
                    clickNextButton();
                    await sleepRandom(800, 0.25); // 等待页面更新
                }
            }

            // 检查是否是正常完成还是中途停止
            if (!state.shouldStop) {
                showStatus(`完成！共处理 ${state.answeredCount} 题`, 'success');
                showToast(`答题完成！已保存 ${state.answeredCount} 道答案`, 'success');
                state.lastProcessedIndex = 0; // 重置进度
            } else {
                showStatus(`已暂停，已处理 ${state.answeredCount} 题`, 'idle');
                showToast(`已暂停，当前进度: 第 ${state.lastProcessedIndex}/${state.totalQuestions} 题`, 'info');
            }
            addLog(`全部完成，成功 ${state.answeredCount}/${questions.length}`, 'success');

        } catch (err) {
            console.error('[AnswerAssistant]', err);
            showStatus(`出错: ${err.message}`, 'error');
            showToast(err.message, 'error');
            addLog(`错误: ${err.message}`, 'error');
        } finally {
            state.isRunning = false;
        }
    }

    // ==================== 辅助函数：清空已选答案 ====================
    function clearQuestionAnswer(q) {
        const el = q.element;
        if (!el) return;

        // ===== 学习通专用：通过点击取消选中 =====
        // 学习通的选中机制是点击选项 → 添加 .check_answer class / 修改 DOM
        // 取消选中必须再次点击已选中的选项（toggle 行为）
        // 通过 click() 来选择/取消选择

        // 1. 作业/新版考试：.answerBg 内含 .check_answer 的选项，点击该 .answerBg
        const answerBgEls = el.querySelectorAll('.answerBg');
        let clearedByClick = false;
        for (const bg of answerBgEls) {
            if (bg.querySelector('.check_answer, .check_answer_dx, [class*="check_answer"]')) {
                bg.click();
                clearedByClick = true;
            }
        }

        // 2. 章节测验：.num_option / .num_option_dx 的 class 含 check_answer，点击该选项
        if (!clearedByClick) {
            const numOptionEls = el.querySelectorAll('.num_option, .num_option_dx');
            for (const opt of numOptionEls) {
                if (opt.classList.contains('check_answer') || opt.className.includes('check_answer')) {
                    opt.click();
                    clearedByClick = true;
                }
            }
        }

        // 3. 旧版结构：直接点击 .check_answer / .check_answer_dx 元素
        if (!clearedByClick) {
            const checkAnswerEls = el.querySelectorAll('.check_answer, .check_answer_dx, .check_answer_dx_');
            for (const ca of checkAnswerEls) {
                ca.click();
                clearedByClick = true;
            }
        }

        // 如果通过学习通 click 方式已清除，则返回
        if (clearedByClick) return;

        // ===== 通用方式：原生 radio/checkbox =====
        // 取消选中单选按钮（学习通中 radio 可能无法直接取消，但作为 fallback）
        const radioInputs = el.querySelectorAll('input[type="radio"]');
        radioInputs.forEach(input => {
            if (input.checked) {
                input.checked = false;
                input.dispatchEvent(new Event('change', { bubbles: true }));
            }
        });

        // 取消选中复选框
        const checkboxInputs = el.querySelectorAll('input[type="checkbox"]');
        checkboxInputs.forEach(input => {
            if (input.checked) {
                input.checked = false;
                input.dispatchEvent(new Event('change', { bubbles: true }));
            }
        });

        // 清除文本输入框
        const textInputs = el.querySelectorAll('input[type="text"], textarea');
        textInputs.forEach(input => {
            setNativeInputValue(input, '');
        });

        // 清除带.selected/.checked类的元素
        const selected = el.querySelectorAll('.selected, .checked, .active, .cur, .current');
        selected.forEach(s => s.classList.remove('selected', 'checked', 'active', 'cur', 'current'));
    }

    // ==================== 辅助函数：规范化答案 ====================
    function normalizeAnswer(answer) {
        if (!answer) return '';
        return String(answer)
            .toUpperCase()
            .replace(/[^A-F]/g, '')
            .split('')
            .sort()
            .join('');
    }

    // ==================== 辅助函数：获取AI对题目的答案（不写入） ====================
    // opts.bypassCache: 跳过读缓存（双API对比/复查需要真实的新答案，否则第二次调用
    // 会直接命中第一次写入的缓存，对比/复查就失去了意义）
    async function getAnswerForQuestion(q, opts = {}) {
        const bypassCache = !!opts.bypassCache;
        // 生成更可靠的缓存键：使用题目索引 + 文本哈希
        const cacheKey = `q${q.index}_${hashString(q.cleanText)}`;

        // 检查缓存 - 对于图片题目，不使用缓存
        if (!bypassCache && !q.isImageQuestion && state.settings.useCache && q.cleanText.trim().length > 10 && state.questionCache.has(cacheKey)) {
            const cachedEntry = state.questionCache.get(cacheKey);
            // 兼容旧缓存（纯字符串）和新缓存（{answer, ok}对象）
            const cachedAnswer = typeof cachedEntry === 'string' ? cachedEntry : (cachedEntry?.answer || '');
            if (cachedAnswer) return cachedAnswer;
        }

        let finalPrompt = q.cleanText;
        let images = [];

        // 如果是图片题目，提取图片
        if (q.isImageQuestion) {
            try {
                images = await extractImagesFromElement(q.element);
            } catch (e) {
                images = [];
            }
            if (images.length > 0) {
                finalPrompt = '[图片题目] 请识别图片中的题目和选项，给出正确答案（只需输出选项字母，如A、B、C、D）';
            } else {
                // 修复（2026-10）：取图失败（跨域被拦 / 图片还没加载完）时不再整题放弃，
                // 改为降级为"纯题干作答"——题干文字通常已包含选项文本；
                // 原来这里直接 return null，会让这道题永远留空。
                addLog('图片题目未能提取到图片，降级为纯文本作答', 'warn');
                finalPrompt = '[图片题目] 未能读取到题目图片，请根据以下题干文字推断正确答案（只需输出选项字母，如A、B、C、D）';
            }
        }

        // 自动搜题
        if (!q.isImageQuestion && state.settings.autoSearch && q.cleanText.trim().length > 10) {
            try {
                const searchResult = await searchQuestion(q.cleanText);
                if (searchResult) {
                    finalPrompt += `\n\n【搜索到的参考信息】：\n${searchResult}`;
                }
            } catch(searchErr) {}
        }

        // 对于文本题目，检查文本长度
        if (!q.isImageQuestion && q.cleanText.trim().length < 10) {
            return null;
        }

        // 调用API（与processSingleQuestion保持一致）
        try {
            const answer = await callAI(finalPrompt, images);
            if (!answer) return null;

            // 缓存答案（图片题目不缓存）- 注意：这里只缓存答案不缓存填写状态（getAnswerForQuestion不填写）
            // 修复（2026-10）：bypassCache 只绕过了"读"，没绕过"写"。
            // 双 API 对比里"判定为不一致 → 跳过"的题，缓存里留下的却是第二个 API 的答案；
            // 之后关掉双 API 模式再答题，会把这份被明确否决的答案填进表单。复查流程同理。
            if (!bypassCache && !q.isImageQuestion && state.settings.useCache) {
                state.questionCache.set(cacheKey, { answer, ok: true });
            }

            return answer;
        } catch (err) {
            console.error('[AnswerAssistant] API调用失败:', err);
            return null;
        }
    }

    // 题库查询
    // 多题库同时查询，按 tikuList 顺序取第一个返回有效答案的题库
    // 返回 { source: '题库名', allAnswer: [...] } 或 null
    // 日志：通过 addLog 体现每个题库的查询结果
    async function queryTiku(questionText, optionsArr, qType) {
        const list = Array.isArray(state.settings.tikuList) ? state.settings.tikuList : [];
        // 过滤出启用的题库
        const enabled = list.filter(t => t && t.enabled && t.url && t.url.trim() && !t.url.includes('undefined'));
        if (enabled.length === 0) {
            return null;  // 未配置任何可用题库
        }

        const tasks = enabled.map(t => querySingleTiku(t, questionText, optionsArr, qType));
        // 并行跑所有题库（5s超时由querySingleTiku内部处理）
        const results = await Promise.all(tasks);

        // 找到第一个有有效答案的
        for (let i = 0; i < results.length; i++) {
            const r = results[i];
            if (r && r.allAnswer && Array.isArray(r.allAnswer) && r.allAnswer.length > 0) {
                return r;
            }
        }
        return null;
    }

    // 单个题库请求（带超时、错误处理、5秒兜底）
    // 兼容两种格式：
    //   1) 简单 URL（tikuAdapter）：POST {question, options, type} → {answer:{allAnswer:[]}}
    //   2) 完整 JSON 配置：{name, url, method, type, data, headers, handler, contentType}
    function buildQueryString(dataObj) {
        const params = new URLSearchParams();
        if (!dataObj || typeof dataObj !== 'object') return '';
        for (const [key, value] of Object.entries(dataObj)) {
            if (value === undefined || value === null) continue;
            if (Array.isArray(value)) {
                value.forEach(item => {
                    if (item === undefined || item === null) return;
                    params.append(key, typeof item === 'object' ? JSON.stringify(item) : String(item));
                });
                continue;
            }
            params.append(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
        }
        return params.toString();
    }

    function appendQueryToUrl(url, dataObj) {
        const query = buildQueryString(dataObj);
        if (!query) return url;
        return url + (url.includes('?') ? '&' : '?') + query;
    }

    function querySingleTiku(tiku, questionText, optionsArr, qType) {
        // 优先使用保存的完整 JSON 配置
        const cfg = tiku.config && typeof tiku.config === 'object' ? tiku.config : null;
        const method = (cfg?.method || 'post').toUpperCase();
        const reqType = cfg?.type || 'GM_xmlhttpRequest'; // fetch / GM_xmlhttpRequest
        const headers = (cfg?.headers && typeof cfg.headers === 'object') ? cfg.headers : { 'Content-Type': 'application/json;charset=utf-8' };
        const handlerStr = (cfg?.handler && typeof cfg.handler === 'string') ? cfg.handler : null;

        // 构造 URL：tikuAdapter 风格自动附加 wannengDisable
        let fullUrl = tiku.url;
        if (!cfg || !cfg.data) {
            fullUrl = tiku.url + (tiku.url.includes('?') ? '&' : '?') + 'wannengDisable=1';
        }

        // 构造 data（data 中的 ${title}、${options}、${type} 是模板；{handler: 'return ...'} 是函数）
        let dataObj = null;
        if (cfg && cfg.data && typeof cfg.data === 'object') {
            dataObj = {};
            for (const [k, v] of Object.entries(cfg.data)) {
                if (v && typeof v === 'object' && typeof v.handler === 'string') {
                    // handler 函数：return (env)=>...
                    try {
                        // eslint-disable-next-line no-new-func
                        const fn = new Function('return ' + v.handler)();
                        const env = { title: questionText, options: optionsArr, type: qType };
                        dataObj[k] = fn(env);
                    } catch (e) {
                        dataObj[k] = v;
                    }
                } else if (typeof v === 'string') {
                    // 模板字符串替换
                    dataObj[k] = v
                        .replace(/\$\{title\}/g, questionText || '')
                        .replace(/\$\{question\}/g, questionText || '')
                        .replace(/\$\{options\}/g, Array.isArray(optionsArr) ? optionsArr.join('\n') : (optionsArr || ''))
                        .replace(/\$\{type\}/g, qType || '');
                } else {
                    dataObj[k] = v;
                }
            }
        } else {
            // 默认 tikuAdapter 协议
            // ⚠ clientId：让服务端能查到**用户自己的私有题库**（脚本判分回写的题）。
            //   服务端按 clientId 隔离，A 用户的私有池不会出现在 B 用户的查询结果里。
            dataObj = {
                question: questionText,
                options: optionsArr || [],
                type: qType || '',
                clientId: getPortalClientId()
            };
        }

        return new Promise(resolve => {
            let resolved = false;
            const finish = (val) => {
                if (!resolved) { resolved = true; clearTimeout(timer); resolve(val); }
            };
            const timer = setTimeout(() => finish(null), 5000);

            const onSuccess = (raw) => {
                clearTimeout(timer);
                if (!raw) { finish(null); return; }
                let allAnswer = null;
                if (handlerStr) {
                    // handler：return (res)=>...
                    try {
                        // eslint-disable-next-line no-new-func
                        const handlerFn = new Function('return ' + handlerStr)();
                        const result = handlerFn(raw);
                        if (Array.isArray(result) && result.length > 0) {
                            // handler 返回 [answer, undefined] 或 [msg, allAnswer, extra]
                            const r0 = result[0];
                            const r1 = result[1];
                            if (Array.isArray(r1) && r1.length > 0) {
                                allAnswer = r1;
                            } else if (typeof r0 === 'string' && r0 && result.length > 1) {
                                allAnswer = result.slice(1).filter(x => x);
                            } else if (Array.isArray(r0) && r0.length > 0) {
                                allAnswer = r0;
                            }
                        }
                    } catch (e) {
                        // handler 解析失败，尝试降级
                    }
                }
                // 降级：尝试 tikuAdapter 格式
                if (!allAnswer) {
                    if (raw && raw.answer && Array.isArray(raw.answer.allAnswer) && raw.answer.allAnswer.length > 0) {
                        allAnswer = raw.answer.allAnswer;
                    } else if (raw && raw.data && Array.isArray(raw.data.answer)) {
                        allAnswer = raw.data.answer;
                    } else if (raw && Array.isArray(raw.answer)) {
                        allAnswer = raw.answer;
                    }
                }
                if (allAnswer && Array.isArray(allAnswer) && allAnswer.length > 0) {
                    finish({ source: tiku.name || cfg?.name || '题库', allAnswer });
                } else {
                    finish(null);
                }
            };

            try {
                const requestUrl = method === 'GET' ? appendQueryToUrl(fullUrl, dataObj) : fullUrl;
                if (reqType === 'fetch' && typeof fetch === 'function') {
                    fetch(requestUrl, {
                        method: method,
                        headers: headers,
                        body: method === 'GET' ? undefined : JSON.stringify(dataObj)
                    }).then(r => r.json().then(j => onSuccess(j)))
                      .catch(() => { clearTimeout(timer); finish(null); });
                } else {
                    GM_xmlhttpRequest({
                        method: method,
                        url: requestUrl,
                        headers: headers,
                        data: method === 'GET' ? undefined : JSON.stringify(dataObj),
                        onload: function(r) {
                            try {
                                const res = JSON.parse(r.responseText);
                                onSuccess(res);
                            } catch (e) {
                                clearTimeout(timer);
                                finish(null);
                            }
                        },
                        onerror: function() {
                            clearTimeout(timer);
                            finish(null);
                        }
                    });
                }
            } catch (e) {
                clearTimeout(timer);
                finish(null);
            }
        });
    }

    // 从题库返回的 allAnswer 中提取标准化答案字符串
    // allAnswer 可能是 ['A'] 或 [['A','B']] 或 ['答案文字'] 或 ['A','B']（多选）
    function extractAnswerFromTiku(allAnswer) {
        if (!Array.isArray(allAnswer) || allAnswer.length === 0) return '';

        const first = allAnswer[0];
        if (Array.isArray(first)) {
            // 复合格式：[['A','B']] -> 'AB'
            return first.map(x => String(x || '').trim()).filter(Boolean).join('');
        }

        // 所有元素都是单字母 -> 多选题，拼接排序后返回
        if (allAnswer.every(x => typeof x === 'string' && /^[A-Fa-f]$/.test(x.trim()))) {
            return allAnswer.map(x => x.trim().toUpperCase()).sort().join('');
        }

        return String(first || '').trim();
    }

    // 滚动到当前题目
    // 100 多题长页面如果用户不滚轮，界面会一直停在第 1 题，看着像卡住
    // 这里用 scrollIntoView 平滑滚动到当前题 + 临时高亮一下，用户能直观看到在处理哪题
    function scrollToQuestion(questionEl, index) {
        try {
            if (!questionEl || typeof questionEl.scrollIntoView !== 'function') return;
            // 已在视口内（容差 80px）就不滚，避免每题都闪一下
            const rect = questionEl.getBoundingClientRect();
            if (rect.top >= 0 && rect.bottom <= window.innerHeight && rect.top >= 80) return;
            // 平滑滚动到屏幕中央
            questionEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            // 临时高亮 1.2 秒：让用户能看清当前在处理哪题
            const oldOutline = questionEl.style.outline;
            const oldTransition = questionEl.style.transition;
            const oldBg = questionEl.style.backgroundColor;
            questionEl.style.transition = 'outline 0.2s, background-color 0.2s';
            questionEl.style.outline = '3px solid #f59e0b';
            questionEl.style.backgroundColor = 'rgba(245, 158, 11, 0.08)';
            setTimeout(() => {
                questionEl.style.outline = oldOutline;
                questionEl.style.transition = oldTransition;
                questionEl.style.backgroundColor = oldBg;
            }, 1200);
        } catch (e) {
            // 静默失败，不影响主流程
        }
    }

    async function processSingleQuestion(q) {
        // 滚动到当前题目
        // 100 多题时如果用户不滚轮，屏幕一直停在第 1 题，看着像卡住
        // 滚动到 q.element 居中 + 高亮一下，用户能直观看到脚本在处理哪一题
        scrollToQuestion(q.element, q.index);

        // 生成更可靠的缓存键：使用题目索引 + 文本哈希
        const cacheKey = `q${q.index}_${hashString(q.cleanText)}`;

        // 检查缓存 - 对于图片题目，不使用缓存（因为图片可能不同）
        // 缓存值：{answer, ok}  ok 表示上次是否真正填写成功
        if (!q.isImageQuestion && state.settings.useCache && q.cleanText.trim().length > 10 && state.questionCache.has(cacheKey)) {
            const cachedEntry = state.questionCache.get(cacheKey);
            const cachedAnswer = typeof cachedEntry === 'string'
                ? { answer: cachedEntry, ok: true }   // 兼容旧缓存（纯字符串）
                : cachedEntry;
            addLog(`第 ${q.index} 题: 使用缓存答案 ${cachedAnswer.answer}`, 'info');
            // 关键：缓存命中时**必须再调一次 fillAnswer**，上次可能没填成功
            // 但为了避免无限重试，强制尝试最多 2 次
            const qType = detectQuestionType(q);
            let filled = fillAnswer(q.element, cachedAnswer.answer, qType);
            if (!filled && typeof q.element?.isConnected === 'boolean' && !q.element.isConnected) {
                // element 已被 Vue 替换，跳过
                addLog(`第 ${q.index} 题: 题目元素已失效，跳过缓存`, 'warn');
                return;
            }
            if (filled) {
                if (typeof cachedEntry === 'string') {
                    state.questionCache.set(cacheKey, { answer: cachedAnswer.answer, ok: true });
                }
                state.answeredCount++;
                showPreview(q.cleanText, cachedAnswer.answer);
                return;
            }
            // 缓存命中但填写失败 → 删掉缓存，降级走 API（不要让用户拿到一个永远填不上的"假缓存"）
            addLog(`第 ${q.index} 题: 缓存命中但填写失败，删除缓存并调用AI重新作答`, 'warn');
            state.questionCache.delete(cacheKey);
        }

        let finalPrompt = q.cleanText;
        let images = [];

        // 如果是图片题目，提取图片
        if (q.isImageQuestion) {
            addLog(`第 ${q.index} 题: 检测到图片题目，正在提取图片...`, 'info');
            try {
                images = await extractImagesFromElement(q.element);
                if (images.length === 0) {
                    addLog(`第 ${q.index} 题: 未能提取到图片`, 'warn');
                    return;
                }
                finalPrompt = '[图片题目] 请识别图片中的题目和选项，给出正确答案（只需输出选项字母，如A、B、C、D）';
            } catch (e) {
                addLog(`第 ${q.index} 题: 图片提取失败: ${e.message}`, 'error');
                return;
            }
        }

        // 自动搜题 - 只有文本不为空时才搜索（图片题目不搜索）
        if (!q.isImageQuestion && state.settings.autoSearch && q.cleanText.trim().length > 10) {
            try {
                const searchResult = await searchQuestion(q.cleanText);
                if (searchResult) {
                    finalPrompt += `\n\n【搜索到的参考信息】：\n${searchResult}`;
                }
            } catch(searchErr) {
                addLog(`搜索失败: ${searchErr.message}`, 'warn');
            }
        }

        // 对于文本题目，检查文本长度
        if (!q.isImageQuestion && q.cleanText.trim().length < 10) {
            addLog(`第 ${q.index} 题: 题目文本过短，跳过`, 'warn');
            return;
        }

        // 题库优先
        // 流程：题库查 -> 有答案 -> 是否复查（开关）-> 写答案
        //              -> 无答案 -> 走API
        let tikuAnswer = '';
        let tikuSource = '';
        const enabledTikus = Array.isArray(state.settings.tikuList) ? state.settings.tikuList.filter(t => t.enabled) : [];
        if (!q.isImageQuestion && state.settings.tikuEnabled && enabledTikus.length > 0) {
            // 打印查询开始日志：列出启用的题库
            const tikuNames = enabledTikus.map(t => t.name || '题库').join(' / ');
            addLog(`第 ${q.index} 题: 查询题库（${tikuNames}）...`, 'info');
            try {
                const optionTexts = (q.options || []).map(o => o.text || String(o)).filter(Boolean);
                // q.type 在题目识别时未必设置，兜底现场检测，保证题库拿到题型
                const tikuResult = await queryTiku(q.cleanText, optionTexts, q.type || detectQuestionType(q));
                if (tikuResult && tikuResult.allAnswer) {
                    tikuAnswer = extractAnswerFromTiku(tikuResult.allAnswer);
                    tikuSource = tikuResult.source || '题库';
                    if (tikuAnswer) {
                        addLog(`第 ${q.index} 题: 题库【${tikuSource}】命中 → ${tikuAnswer}`, 'success');
                    } else {
                        addLog(`第 ${q.index} 题: 题库【${tikuSource}】返回了空答案`, 'warn');
                    }
                } else {
                    addLog(`第 ${q.index} 题: 所有题库均未命中答案（已查询 ${enabledTikus.length} 个）`, 'warn');
                }
            } catch (tikuErr) {
                addLog(`第 ${q.index} 题: 题库查询异常: ${tikuErr.message || tikuErr}`, 'warn');
                tikuAnswer = '';
            }
        } else if (state.settings.tikuEnabled) {
            // 题库总开关开了但没有启用的题库
            addLog(`第 ${q.index} 题: 未配置题库（请在设置中添加）`, 'info');
        }

        // 情况A：题库有答案 & 用户未开启"AI复查" -> 直接用题库答案，不调用AI（**节省API**）
        if (tikuAnswer && !state.settings.tikuRevalidate) {
            const qType = detectQuestionType(q);
            const filled = fillAnswer(q.element, tikuAnswer, qType);
            if (!filled) {
                // 填写失败不写缓存，让下次能重新尝试
                addLog(`第 ${q.index} 题: [题库] ${tikuAnswer} 填写失败（元素可能已刷新）`, 'error');
                return;
            }
            if (state.settings.useCache) {
                state.questionCache.set(cacheKey, { answer: tikuAnswer, ok: true });
            }
            addLog(`第 ${q.index} 题: [题库] ${tikuAnswer}（来源：${tikuSource}）`, 'success');
            state.answeredCount++;
            showPreview(q.cleanText || '[图片题目]', tikuAnswer);
            return;
        }

        // 情况B：题库有答案 & 用户开启"AI复查" -> AI再确认一次
        // 把题库答案作为参考，让AI决定是否覆盖
        let tikuprompt = finalPrompt;
        if (tikuAnswer) {
            addLog(`第 ${q.index} 题: [题库${tikuAnswer}→AI复查] 开始调用API核对...`, 'info');
            tikuprompt += `\n\n【题库参考答案】：${tikuAnswer}（来源：${tikuSource}。如果确认正确则沿用，否则给出新答案）`;
        } else {
            addLog(`第 ${q.index} 题: 调用 API...`, 'info');
        }

        try {
            // 调用API - 支持图片参数
            const answer = await callAI(tikuprompt, images);

            // 缓存答案（图片题目不缓存） - 必须先尝试填写，**成功才写缓存**
            const qType = detectQuestionType(q);
            const filled = fillAnswer(q.element, answer, qType);
            if (!filled) {
                // 填写失败不写缓存，下次能重新尝试
                addLog(`第 ${q.index} 题: 答案 ${answer} 填写失败（元素可能已刷新）`, 'error');
                return;
            }
            if (!q.isImageQuestion && state.settings.useCache) {
                state.questionCache.set(cacheKey, { answer, ok: true });
            }

            // 情况B时，把"题库+AI"都展示出来
            const logPrefix = tikuAnswer ? `[题库${tikuAnswer}→AI${answer === tikuAnswer ? '一致' : '纠正'}] ` : '[AI] ';
            addLog(`第 ${q.index} 题: ${logPrefix}${answer}`, 'success');
            state.answeredCount++;

            showPreview(q.cleanText || '[图片题目]', answer);

        } catch(aiErr) {
            addLog(`第 ${q.index} 题 API调用失败: ${aiErr.message}`, 'error');
            // API失败但题库有答案：兜底用题库答案
            if (tikuAnswer) {
                addLog(`第 ${q.index} 题: 兜底使用题库答案 ${tikuAnswer}`, 'info');
                const qType = detectQuestionType(q);
                const filled = fillAnswer(q.element, tikuAnswer, qType);
                if (!filled) {
                    addLog(`第 ${q.index} 题: 兜底题库答案 ${tikuAnswer} 填写失败`, 'error');
                    return;
                }
                if (state.settings.useCache) {
                    state.questionCache.set(cacheKey, { answer: tikuAnswer, ok: true });
                }
                state.answeredCount++;
                showPreview(q.cleanText || '[图片题目]', tikuAnswer);
            }
        }
    }

    // 简单的字符串哈希函数
    function hashString(str) {
        let hash = 0;
        if (str.length === 0) return hash;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(36);
    }

    function stopAutoAnswer() {
        state.shouldStop = true;
        showStatus('正在停止...', 'running');
    }

    // ==================== 复查功能：二次验证所有已做题目 ====================
    // 核心逻辑：遍历所有已做题目 → 重新调用AI获取答案 → 对比前后答案
    //   - 一致：保留原答案不动
    //   - 不一致（选择题/判断题）：取消选择（清除所有选项）
    //   - 不一致（填空题）：清空文本框
    //   - 简答题/论述题：跳过（主观题答案不一致属正常）
    async function startReview() {
        // 检查API是否已配置
        if (!state.selectedAPIId) {
            showToast('请先选择并启用API', 'error');
            return;
        }
        const api = AI_MODELS[state.selectedAPIId];
        if (!api.enabled || !api.apiKey) {
            showToast('当前API未配置或未启用', 'error');
            return;
        }

        // 识别题目
        const questions = detectQuestions(document.body);
        state.questionsList = questions;
        state.totalQuestions = questions.length;

        // 2026-10-23：若这页是已批阅的作业/考试，把平台给出的正确答案回写题库
        //（异步、不阻塞答题；页面没判分时内部会自动跳过）
        try {
            if (typeof collectMarkedAnswers === 'function') {
                Promise.resolve(collectMarkedAnswers(questions)).catch(() => {});
            }
        } catch (e) { /* 回写失败不影响答题流程 */ }

        if (questions.length === 0) {
            showToast('未能识别到任何题目', 'error');
            return;
        }

        state.isRunning = true;
        state.shouldStop = false;

        let reviewed = 0;   // 已复查数
        let matched = 0;    // 一致数
        let mismatched = 0; // 不一致数
        let skipped = 0;    // 跳过数

        // 收集需要关注的题目（不一致 + 跳过），用于最终弹窗汇总
        const problemQuestions = [];

        showStatus('正在复查题目...', 'running');
        addLog(`复查模式启动：共 ${questions.length} 题，仅复查已做题目`, 'info');

        for (let i = 0; i < questions.length; i++) {
            if (state.shouldStop) {
                addLog('用户停止了复查', 'warn');
                break;
            }

            const q = questions[i];
            state.currentIndex = i + 1;
            updateProgress(i + 1, questions.length);

            // 获取题目文本和选项（用于汇总弹窗）
            const qText = q.cleanText || q.rawText || '';
            const qOptions = extractOptions(q.element);
            const qType = detectQuestionType(q);

            // 跳过未作答的题目
            if (!isQuestionAnswered(q)) {
                skipped++;
                problemQuestions.push({
                    index: i + 1,
                    type: qType,
                    status: '未作答',
                    question: qText,
                    options: qOptions.map(o => `${o.letter}. ${o.text.replace(/^[A-Fa-f][\.、\)\s]/, '').trim()}`),
                    originalAnswer: '无',
                    newAnswer: '—'
                });
                continue;
            }

            // 获取当前已选答案信息
            const currentInfo = getAnsweredInfo(q);

            // 跳过简答题/论述题（主观题答案不可能完全一致）
            if (['简答题', '计算题'].includes(qType)) {
                addLog(`第 ${i + 1} 题: ${qType}，跳过复查（主观题答案不一致属正常）`, 'info');
                skipped++;
                problemQuestions.push({
                    index: i + 1,
                    type: qType,
                    status: '主观题跳过',
                    question: qText,
                    options: qOptions.map(o => `${o.letter}. ${o.text.replace(/^[A-Fa-f][\.、\)\s]/, '').trim()}`),
                    originalAnswer: currentInfo.display,
                    newAnswer: '—'
                });
                continue;
            }

            // 滚动到题目位置
            q.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await sleep(400);

            // 重新调用AI获取答案
            showStatus(`复查第 ${i + 1}/${questions.length} 题...`, 'running');
            addLog(`第 ${i + 1} 题: 复查中（原答案: ${currentInfo.display}）...`, 'info');

            let newAnswer;
            try {
                // 复查必须绕过缓存，否则拿到的是答题时缓存的旧答案，永远"一致"
                newAnswer = await getAnswerForQuestion(q, { bypassCache: true });
            } catch (err) {
                addLog(`第 ${i + 1} 题: API调用失败 (${err.message})，保留原答案`, 'warn');
                skipped++;
                problemQuestions.push({
                    index: i + 1,
                    type: qType,
                    status: 'API调用失败',
                    question: qText,
                    options: qOptions.map(o => `${o.letter}. ${o.text.replace(/^[A-Fa-f][\.、\)\s]/, '').trim()}`),
                    originalAnswer: currentInfo.display,
                    newAnswer: '调用失败'
                });
                continue;
            }

            if (!newAnswer || newAnswer.trim() === '') {
                addLog(`第 ${i + 1} 题: API未返回有效答案，保留原答案`, 'warn');
                skipped++;
                problemQuestions.push({
                    index: i + 1,
                    type: qType,
                    status: 'AI无答案',
                    question: qText,
                    options: qOptions.map(o => `${o.letter}. ${o.text.replace(/^[A-Fa-f][\.、\)\s]/, '').trim()}`),
                    originalAnswer: currentInfo.display,
                    newAnswer: '无有效答案'
                });
                continue;
            }

            reviewed++;

            // 对比答案
            const isMatch = compareAnswers(currentInfo, newAnswer, qType);

            if (isMatch) {
                addLog(`第 ${i + 1} 题: ✅ 一致（${currentInfo.display} ↔ ${newAnswer.trim()}），保留`, 'success');
                matched++;
            } else {
                addLog(`第 ${i + 1} 题: ❌ 不一致（${currentInfo.display} ↔ ${newAnswer.trim()}），清除原答案`, 'warn');
                mismatched++;

                problemQuestions.push({
                    index: i + 1,
                    type: qType,
                    status: '不一致',
                    question: qText,
                    options: qOptions.map(o => `${o.letter}. ${o.text.replace(/^[A-Fa-f][\.、\)\s]/, '').trim()}`),
                    originalAnswer: currentInfo.display,
                    newAnswer: newAnswer.trim()
                });

                if (qType === '填空题') {
                    // 填空题：清除所有文本输入框
                    const textInputs = q.element.querySelectorAll('input[type="text"], textarea, input:not([type])');
                    textInputs.forEach(input => {
                        setNativeInputValue(input, '');
                    });
                    const editables = q.element.querySelectorAll('[contenteditable="true"]');
                    editables.forEach(ed => {
                        ed.innerHTML = '';
                        ed.dispatchEvent(new Event('input', { bubbles: true }));
                    });
                } else {
                    // 选择题/判断题：取消所有选择
                    clearQuestionAnswer(q);
                }
            }

            await sleep(state.settings.delayTime);
        }

        state.isRunning = false;
        const summary = `复查完成: 一致${matched}题 / 不一致${mismatched}题 / 跳过${skipped}题`;
        showStatus(summary, mismatched > 0 ? 'warn' : 'success');
        addLog(summary + (mismatched > 0 ? '（不一致的题目已清除答案，请手动重新作答）' : ''), 'success');
        showToast(summary, mismatched > 0 ? 'warn' : 'success');
        state.lastProcessedIndex = 0;

        // 弹出汇总弹窗
        if (problemQuestions.length > 0) {
            showReviewSummary(problemQuestions, matched, mismatched, skipped);
        }
    }

    // 对比两个答案是否一致
    // currentInfo: getAnsweredInfo() 返回的对象 { kind, letters, text, display }
    // newAnswer: API返回的答案字符串
    // qType: 题目类型
    function compareAnswers(currentInfo, newAnswer, qType) {
        if (qType === '填空题') {
            // 填空题：对比文本内容（归一化处理）
            const norm = s => String(s || '')
                .replace(/\s+/g, '')
                .replace(/[，。；：、,\.;:]/g, '')
                .toLowerCase();
            const curText = norm(currentInfo.text || '');
            const newText = norm(newAnswer);
            // 如果当前答案为纯文本（非选项字母），直接对比
            if (curText && !/^[A-F]+$/i.test(currentInfo.text.trim())) {
                return curText === newText;
            }
            // 否则降级为宽松对比
            return curText === newText || newText.includes(curText) || curText.includes(newText);
        }

        // 选择题/判断题：对比选项字母
        const curLetters = (currentInfo.letters || '').toUpperCase().replace(/[^A-F]/g, '').split('').sort().join('');
        const newLetters = String(newAnswer).toUpperCase().replace(/[^A-F]/g, '').split('').sort().join('');

        if (curLetters && newLetters) {
            return curLetters === newLetters;
        }

        // 判断题特殊处理：当前答案为"对/错"格式时与AI返回对比
        if (qType === '判断题') {
            const curDisplay = (currentInfo.display || '').toLowerCase();
            const newDisplay = String(newAnswer).toLowerCase().trim();
            // 对/错 语义匹配
            const isTrue = /对|正确|true|√|t|ri|yes|是|a/i;
            const isFalse = /错|错误|false|×|f|wr|no|否|b/i;
            const curIsTrue = isTrue.test(curDisplay);
            const curIsFalse = isFalse.test(curDisplay);
            const newIsTrue = isTrue.test(newDisplay);
            const newIsFalse = isFalse.test(newDisplay);
            if ((curIsTrue && newIsTrue) || (curIsFalse && newIsFalse)) return true;
            if ((curIsTrue && newIsFalse) || (curIsFalse && newIsTrue)) return false;
        }

        // 宽松对比：直接字符串对比
        return String(currentInfo.display || '').trim().toUpperCase() === String(newAnswer || '').trim().toUpperCase();
    }

    // ==================== 复查汇总弹窗 ====================
    function showReviewSummary(problemQuestions, matched, mismatched, skipped) {
        // 移除已有弹窗
        const existing = document.getElementById('review-summary-overlay');
        if (existing) existing.remove();

        // 构建纯文本内容（方便一键复制到其他AI）
        let plainText = `===== 复查汇总 =====\n`;
        plainText += `一致: ${matched}题 | 不一致: ${mismatched}题 | 跳过: ${skipped}题\n`;
        plainText += `========================\n\n`;

        problemQuestions.forEach((pq, idx) => {
            plainText += `【第${pq.index}题】[${pq.type}] 状态: ${pq.status}\n`;
            plainText += `题目: ${pq.question}\n`;
            if (pq.options && pq.options.length > 0) {
                pq.options.forEach(opt => {
                    plainText += `  ${opt}\n`;
                });
            }
            plainText += `原答案: ${pq.originalAnswer}\n`;
            plainText += `API答案: ${pq.newAnswer}\n`;
            plainText += `\n`;
        });

        // 构建 HTML 弹窗
        const overlay = document.createElement('div');
        overlay.id = 'review-summary-overlay';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:999999;display:flex;align-items:center;justify-content:center;';

        const modal = document.createElement('div');
        modal.style.cssText = 'background:#fff;border-radius:12px;width:680px;max-height:80vh;display:flex;flex-direction:column;box-shadow:0 8px 32px rgba(0,0,0,0.3);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;';

        // 标题栏
        const header = document.createElement('div');
        header.style.cssText = 'padding:16px 20px;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;';
        header.innerHTML = `
            <div style="font-size:16px;font-weight:600;color:#1f2937;">复查汇总报告</div>
            <div style="font-size:13px;color:#6b7280;">一致${matched} | 不一致${mismatched} | 跳过${skipped}</div>
        `;

        // 内容区
        const content = document.createElement('div');
        content.style.cssText = 'padding:16px 20px;overflow-y:auto;flex:1;';

        let htmlContent = '';
        problemQuestions.forEach((pq) => {
            const statusColor = pq.status === '不一致' ? '#dc2626' : pq.status === '未作答' ? '#9ca3af' : '#f59e0b';
            const statusBg = pq.status === '不一致' ? '#fef2f2' : pq.status === '未作答' ? '#f9fafb' : '#fffbeb';
            htmlContent += `
                <div style="border:1px solid #e5e7eb;border-radius:8px;padding:12px 14px;margin-bottom:10px;background:${statusBg};">
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
                        <span style="font-weight:600;color:#374151;">第${pq.index}题</span>
                        <span style="font-size:12px;color:#6b7280;background:#f3f4f6;padding:1px 6px;border-radius:4px;">${pq.type}</span>
                        <span style="font-size:12px;color:${statusColor};font-weight:600;">${pq.status}</span>
                    </div>
                    <div style="font-size:13px;color:#374151;margin-bottom:6px;line-height:1.5;">${escapeHtml(pq.question)}</div>
                    ${pq.options && pq.options.length > 0 ? `<div style="font-size:12px;color:#6b7280;margin-bottom:4px;">${pq.options.map(o => escapeHtml(o)).join(' &nbsp;|&nbsp; ')}</div>` : ''}
                    <div style="font-size:12px;display:flex;gap:16px;">
                        <span style="color:#6b7280;">原答案: <b style="color:#374151;">${escapeHtml(pq.originalAnswer)}</b></span>
                        <span style="color:#6b7280;">API答案: <b style="color:${statusColor};">${escapeHtml(pq.newAnswer)}</b></span>
                    </div>
                </div>
            `;
        });
        content.innerHTML = htmlContent;

        // 底部按钮栏
        const footer = document.createElement('div');
        footer.style.cssText = 'padding:12px 20px;border-top:1px solid #e5e7eb;display:flex;gap:10px;justify-content:flex-end;flex-shrink:0;';

        const copyBtn = document.createElement('button');
        copyBtn.textContent = '复制纯文本（粘贴到其他模型）';
        copyBtn.style.cssText = 'padding:8px 16px;border-radius:6px;border:1px solid #3b82f6;background:#3b82f6;color:#fff;font-size:13px;cursor:pointer;';
        copyBtn.onmouseover = () => { copyBtn.style.background = '#2563eb'; };
        copyBtn.onmouseout = () => { copyBtn.style.background = '#3b82f6'; };
        copyBtn.onclick = () => {
            navigator.clipboard.writeText(plainText).then(() => {
                copyBtn.textContent = '已复制!';
                setTimeout(() => { copyBtn.textContent = '复制纯文本（粘贴到其他模型）'; }, 2000);
            }).catch(() => {
                // fallback: textarea 复制
                const ta = document.createElement('textarea');
                ta.value = plainText;
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
                copyBtn.textContent = '已复制!';
                setTimeout(() => { copyBtn.textContent = '复制纯文本（粘贴到其他模型）'; }, 2000);
            });
        };

        const closeBtn = document.createElement('button');
        closeBtn.textContent = '关闭';
        closeBtn.style.cssText = 'padding:8px 16px;border-radius:6px;border:1px solid #d1d5db;background:#fff;color:#374151;font-size:13px;cursor:pointer;';
        closeBtn.onmouseover = () => { closeBtn.style.background = '#f9fafb'; };
        closeBtn.onmouseout = () => { closeBtn.style.background = '#fff'; };
        closeBtn.onclick = () => { overlay.remove(); };

        footer.appendChild(copyBtn);
        footer.appendChild(closeBtn);

        modal.appendChild(header);
        modal.appendChild(content);
        modal.appendChild(footer);
        overlay.appendChild(modal);

        // 点击遮罩关闭
        overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

        document.body.appendChild(overlay);
    }

    // HTML 转义辅助
    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = String(str || '');
        return div.innerHTML;
    }

    function updateProgress(current, total) {
        const pct = Math.round((current / total) * 100);
        const fill = document.getElementById('progress-fill');
        const info = document.getElementById('progress-info');
        if (fill) fill.style.width = `${pct}%`;
        if (info) info.textContent = `${current} / ${total} (${pct}%)`;
    }

    function showPreview(question, answer) {
        const preview = document.getElementById('question-preview');
        if (preview) {
            // 题目/答案来自页面与AI，转义防止 HTML 注入
            preview.innerHTML = `
                <div class="preview-q"><strong>题目：</strong>${escapeHtml(question)}</div>
                <div class="preview-a"><strong>答案：</strong>${escapeHtml(answer)}</div>
            `;
            preview.style.display = 'block';
        }
    }

    function sleep(ms) {
        return new Promise(r => setTimeout(r, ms));
    }

    function sleepRandom(baseMs, variance = 0.3) {
        const min = Math.max(0, baseMs * (1 - variance));
        const max = baseMs * (1 + variance);
        return sleep(Math.floor(min + Math.random() * (max - min)));
    }

    // ==================== API 校验 ====================
async function validateAPI(apiId) {
    const api = AI_MODELS[apiId];
    if (!api.apiKey) return { ok: false, msg: '请先输入API Key' };

    const badge = document.getElementById(`badge-${apiId}`);
    if (badge) {
        badge.className = 'api-badge badge-checking';
        badge.textContent = '检测中...';
    }

    try {
        // 使用临时状态进行验证，不影响全局状态（无论成败都恢复）
        const originalAPIId = state.selectedAPIId;
        state.selectedAPIId = apiId;

        // 发送简单测试请求
        const testPrompt = '回复OK';
        let answer;
        try {
            answer = await callAI(testPrompt);
        } finally {
            state.selectedAPIId = originalAPIId;
        }

        if (!answer) throw new Error('未返回内容');

        if (badge) {
            badge.className = 'api-badge badge-ready';
            badge.textContent = '可用';
        }
        addLog(`${api.name} 连接验证成功`, 'success');
        return { ok: true, msg: '连接正常' };
    } catch(err) {
        if (badge) {
            badge.className = 'api-badge badge-empty';
            badge.textContent = '无效';
        }
        addLog(`${api.name} 验证失败: ${err.message}`, 'error');
        return { ok: false, msg: err.message };
    }
}

    // ==================== AI 对话模式（复制题目 + 粘贴答案回填） ====================
    function buildAIPrompt(questions) {
        let prompt = `请直接给出以下每道题的答案，按格式回复：
第1题答案：xxx
第2题答案：xxx

规则：
- 单选题只写选项字母，如 A、B、C、D
- 多选题连续写多个字母，如 AB、ACD
- 判断题写"正确"或"错误"
- 填空题直接写答案内容（多个空用 # 分隔）
- 简答题、论述题、计算题、问答题给出完整答案，可包含多段文字，不要省略
- 不要写推理过程
\n`;
        questions.forEach(q => {
            const type = detectQuestionType(q);
            prompt += `第${q.index}题（${type}）\n`;
            prompt += `${q.cleanText || q.rawText || ''}\n`;
            const options = q.options && q.options.length > 0 ? q.options : extractOptions(q.element);
            if (options.length > 0) {
                options.forEach(opt => {
                    prompt += `  ${opt.letter || opt.text.charAt(0)}. ${opt.text.replace(/^[A-Fa-f][\.、\)\s]*/, '')}\n`;
                });
            }
            prompt += `\n`;
        });
        prompt += `请按"第N题答案："的格式输出所有答案：`;
        return prompt;
    }

    async function copyAllQuestionsForAI() {
        try {
            const questions = detectQuestions(document.body);
            if (!questions || questions.length === 0) {
                showToast('当前页面未检测到题目', 'warn');
                addLog('AI对话: 未检测到题目', 'warn');
                return;
            }
            const prompt = buildAIPrompt(questions);
            const copy = async (text) => {
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    await navigator.clipboard.writeText(text);
                } else {
                    const ta = document.createElement('textarea');
                    ta.value = text;
                    document.body.appendChild(ta);
                    ta.select();
                    document.execCommand('copy');
                    document.body.removeChild(ta);
                }
            };
            await copy(prompt);
            showToast(`已复制 ${questions.length} 道题目，可粘贴给豆包/ChatGPT`, 'success');
            addLog(`AI对话: 已复制 ${questions.length} 道题目`, 'success');
        } catch (e) {
            showToast('复制失败: ' + e.message, 'error');
            addLog('AI对话: 复制题目失败 ' + e.message, 'error');
        }
    }

    function showAIAnswerInputModal() {
        const questions = detectQuestions(document.body);
        if (!questions || questions.length === 0) {
            showToast('当前页面未检测到题目', 'warn');
            return;
        }

        const overlay = document.createElement('div');
        overlay.id = 'ai-answer-overlay';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:999999;display:flex;align-items:center;justify-content:center;';

        const modal = document.createElement('div');
        modal.style.cssText = 'background:#fff;border-radius:12px;width:760px;max-height:86vh;display:flex;flex-direction:column;box-shadow:0 8px 32px rgba(0,0,0,0.3);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;';

        const header = document.createElement('div');
        header.style.cssText = 'padding:16px 20px;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;';
        header.innerHTML = `
            <div style="font-size:16px;font-weight:600;color:#1f2937;">粘贴 AI 答案</div>
            <div style="font-size:13px;color:#6b7280;">共识别到 ${questions.length} 题</div>
        `;

        const body = document.createElement('div');
        body.style.cssText = 'padding:16px 20px;overflow-y:auto;flex:1;';
        body.innerHTML = `
            <div style="font-size:12px;color:#6b7280;margin-bottom:8px;line-height:1.5;">
                把豆包 / ChatGPT 等返回的答案整段粘贴到下方，脚本会自动解析题号并填答。<br>
                支持的格式示例："第1题答案：A"、"1. A"、"1、正确"、"第2题：B"
            </div>
            <textarea id="ai-answer-input" style="width:100%;min-height:220px;padding:12px;border:1px solid #d1d5db;border-radius:8px;font-size:14px;line-height:1.5;resize:vertical;box-sizing:border-box;" placeholder="请粘贴 AI 的答案..."></textarea>
            <div id="ai-answer-preview" style="margin-top:12px;font-size:13px;color:#374151;line-height:1.6;display:none;"></div>
        `;

        const footer = document.createElement('div');
        footer.style.cssText = 'padding:12px 20px;border-top:1px solid #e5e7eb;display:flex;gap:10px;justify-content:flex-end;flex-shrink:0;';

        const previewBtn = document.createElement('button');
        previewBtn.textContent = '预览解析';
        previewBtn.style.cssText = 'padding:8px 16px;border-radius:6px;border:1px solid #d1d5db;background:#fff;color:#374151;font-size:13px;cursor:pointer;';
        previewBtn.onmouseover = () => { previewBtn.style.background = '#f9fafb'; };
        previewBtn.onmouseout = () => { previewBtn.style.background = '#fff'; };

        const fillBtn = document.createElement('button');
        fillBtn.textContent = '自动填答';
        fillBtn.style.cssText = 'padding:8px 16px;border-radius:6px;border:1px solid #10b981;background:#10b981;color:#fff;font-size:13px;cursor:pointer;';
        fillBtn.onmouseover = () => { fillBtn.style.background = '#059669'; };
        fillBtn.onmouseout = () => { fillBtn.style.background = '#10b981'; };

        const closeBtn = document.createElement('button');
        closeBtn.textContent = '关闭';
        closeBtn.style.cssText = 'padding:8px 16px;border-radius:6px;border:1px solid #d1d5db;background:#fff;color:#374151;font-size:13px;cursor:pointer;';
        closeBtn.onmouseover = () => { closeBtn.style.background = '#f9fafb'; };
        closeBtn.onmouseout = () => { closeBtn.style.background = '#fff'; };
        closeBtn.onclick = () => { overlay.remove(); };

        footer.appendChild(previewBtn);
        footer.appendChild(fillBtn);
        footer.appendChild(closeBtn);

        modal.appendChild(header);
        modal.appendChild(body);
        modal.appendChild(footer);
        overlay.appendChild(modal);

        overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
        document.body.appendChild(overlay);

        const input = document.getElementById('ai-answer-input');
        const preview = document.getElementById('ai-answer-preview');

        const doPreview = () => {
            const parsed = parseAIAnswers(input.value);
            if (parsed.length === 0) {
                preview.textContent = '未解析到任何答案，请检查格式。';
                preview.style.display = 'block';
                preview.style.color = '#dc2626';
                return;
            }
            preview.style.color = '#374151';
            const lines = parsed.map(a => `第${a.index}题：${a.answer}`);
            preview.innerHTML = `<div style="font-weight:600;margin-bottom:6px;">解析到 ${parsed.length} 个答案：</div>` + lines.map(l => `<div>${escapeHtml(l)}</div>`).join('');
            preview.style.display = 'block';
        };

        previewBtn.onclick = doPreview;
        fillBtn.onclick = () => {
            const parsed = parseAIAnswers(input.value);
            if (parsed.length === 0) {
                showToast('未解析到任何答案', 'warn');
                doPreview();
                return;
            }
            // 先关闭弹窗，让脚本能真正与学习通页面交互（点击输入框/选项）
            overlay.remove();
            // 延迟 300ms：等弹窗 DOM 移除、焦点回到学习通页面后再操作
            setTimeout(() => {
                fillAnswersFromAI(parsed);
            }, 300);
        };
    }

    // 清洗 AI 答案核心：去掉“答案：”“应选”等前缀，截断解释
    function cleanAnswerCore(str) {
        if (!str) return '';
        str = String(str).trim();
        if (!str) return '';

        // 去掉“答案：”“答案是”“答案为”
        str = str.replace(/^(?:答案|答)(?:是|为|：|:|\s)+/, '');
        // 去掉“正确答案是”“最终答案是”“参考答案为”
        str = str.replace(/^(?:正确|最终|参考)(?:答案|答)(?:是|为|：|:|\s)+/, '');
        // 去掉“选”“应选”“应该选”“应填写”“填写”等（把“填写/填入”作为整体先处理）
        str = str.replace(/^(?:应|应该|应当|可以)?(?:填写|填入|应填|可选填)(?:为|：|:|\s)*/, '');
        str = str.replace(/^(?:应|应该|应当|可以)?(?:选|填)(?:择|取|入|写|为|：|:|\s)*/, '');
        // 去掉残留的是/为/冒号/空白
        str = str.replace(/^[是为：:\s]+/, '');
        // 去掉首尾括号
        str = str.replace(/^[（(]|[）)]$/g, '').trim();

        // 截断到第一个分隔符（后面是解释）
        const sepIdx = str.search(/[，,。.;；]/);
        if (sepIdx > 0) {
            str = str.slice(0, sepIdx).trim();
        }

        // 再次清理残留说明
        str = str.replace(/(?:选项|项|填空|答案|因为|由于|所以)[。.]*$/i, '').trim();
        return str;
    }

    // 清洗长答案（简答题/论述题/计算题/问答题）：只清理前后缀，不截断内容
    function cleanAnswerCoreLong(str) {
        if (!str) return '';
        str = String(str).trim();
        if (!str) return '';

        // 去掉“答案：”“答案是”“答案为”
        str = str.replace(/^(?:答案|答)(?:是|为|：|:|\s)+/, '');
        // 去掉“正确答案是”“最终答案是”“参考答案为”
        str = str.replace(/^(?:正确|最终|参考)(?:答案|答)(?:是|为|：|:|\s)+/, '');
        // 去掉“选”“应选”“应该选”“应填写”“填写”等
        str = str.replace(/^(?:应|应该|应当|可以)?(?:填写|填入|应填|可选填)(?:为|：|:|\s)*/, '');
        str = str.replace(/^(?:应|应该|应当|可以)?(?:选|填)(?:择|取|入|写|为|：|:|\s)*/, '');
        // 去掉残留的是/为/冒号/空白
        str = str.replace(/^[是为：:\s]+/, '');
        // 去掉首尾括号
        str = str.replace(/^[（(]|[）)]$/g, '').trim();
        return str;
    }

    // 判断一段文本是否更像是题干而不是答案
    function isProbablyQuestionStem(str) {
        if (!str) return true;
        if (str.length > 120) return true;
        if (str.length > 40 && !/[A-Fa-f]|正确|错误|对|错|√|×/.test(str)) return true;
        return false;
    }

    // 判断是否为长答案题型（简答题/论述题/计算题/问答题/材料题/综合题）
    function isLongAnswerType(typeHint) {
        if (!typeHint) return false;
        return /简答|论述|计算|分析|问答|材料|综合|主观|证明|设计|报告/i.test(typeHint);
    }

    // 从“答案/选/应选/应填...”之后的内容中提取答案
    // typeHint: 题型提示，如"简答题"，用于决定是否保留完整长答案
    function extractAnswerFromContent(content, typeHint) {
        if (!content) return null;
        content = content.trim();
        if (!content) return null;

        // 整行就是判断词
        if (/^(正确|错误|对|错)$/i.test(content)) return content;

        // 长答案题型：保留完整内容（但尝试去掉"答案："等前缀）
        if (isLongAnswerType(typeHint)) {
            return cleanAnswerCoreLong(content) || null;
        }

        // 如果内容本身很长（超过40字符）或包含换行，也保留完整内容
        // 因为可能是简答题但没有题型提示；简答题答案可以很长，不应用题干过滤
        if (content.length > 40 || content.includes('\n')) {
            const longAns = cleanAnswerCoreLong(content);
            if (longAns && longAns.length > 20) {
                return longAns;
            }
        }

        // 优先匹配“答案/选/应选/应填/为”后面的简短内容
        // 注意：关键词里不要用单独的“为”，避免误匹配“因为”
        const patterns = [
            /(?:答案|答)[：:\s]+([^，,。.;；\n]{1,100})/,
            /(?:应选|应该选|应当选|可选|选)[择取]?[：:\s]*([A-Fa-f][,\s、A-Fa-f]{0,20})/,
            /(?:应填写|应填入|应该填写|应该填入|应当填写|应当填入|可填写|可填入|填写|填入|应填|应该填|应当填|可填)[的是为]?[：:\s]*([^，,。.;；\n]{1,100})/,
            /(?:答案|答)[的是为]?[：:\s]*([A-Fa-f][,\s、A-Fa-f]{0,20})/,
            /(?:答案|答)[的是为]?[：:\s]*([^，,。.;；\n]{1,100})/
        ];
        for (const re of patterns) {
            const m = content.match(re);
            if (m) {
                const ans = cleanAnswerCore(m[1]);
                if (ans && !isProbablyQuestionStem(ans)) return ans;
            }
        }

        // 兜底：直接清洗整行
        const ans = cleanAnswerCore(content);
        if (ans && !isProbablyQuestionStem(ans)) return ans;
        return null;
    }

    function parseSingleAnswerLine(line) {
        if (!line) return null;
        line = line.trim();
        if (!line || line.length > 5000) return null; // 简答题可能很长

        // “第N题（题型）答案：...”开头
        const mWithType = line.match(/^第\s*(\d+)\s*题\s*[（(]([^)）]+)[)）][，,\s：:]*(.*)$/);
        if (mWithType) {
            const idx = parseInt(mWithType[1], 10);
            const typeHint = mWithType[2];
            const ans = extractAnswerFromContent(mWithType[3], typeHint);
            return ans ? { index: idx, answer: ans } : null;
        }

        // “第N题答案：...”开头
        if (/^第\s*\d+\s*题/.test(line)) {
            const m = line.match(/^第\s*(\d+)\s*题[，,\s：:]*(.*)$/);
            if (!m) return null;
            const idx = parseInt(m[1], 10);
            const ans = extractAnswerFromContent(m[2]);
            return ans ? { index: idx, answer: ans } : null;
        }

        // “N. ...” / “N、...” / “N) ...” 开头
        if (/^\d+\s*[\.、\):：\s]/.test(line)) {
            const m = line.match(/^(\d+)\s*[\.、\):：\s]+\s*(.*)$/);
            if (!m) return null;
            const idx = parseInt(m[1], 10);
            const ans = extractAnswerFromContent(m[2]);
            return ans ? { index: idx, answer: ans } : null;
        }

        // 无分隔符的紧凑格式“N答案：A”“N选A”“N应填xxx”
        const m = line.match(/^(\d+)(?:题|小题)?(?:答案|选|应选|应填|为|正确|错误)?[：:\s]+(.+)$/);
        if (m) {
            const idx = parseInt(m[1], 10);
            const ans = extractAnswerFromContent(m[2]);
            return ans ? { index: idx, answer: ans } : null;
        }

        return null;
    }

    // 跨行解析：适用于整段“第1题（题型）...第2题（题型）...”没有换行的情况
    function parseCrossLineAnswers(text) {
        const result = [];
        const seen = new Set();
        // 匹配“第N题（题型）”，题型用于判断是否为长答案
        const re = /第\s*(\d+)\s*题(?:\s*[（(]([^)）]+)[)）])?/g;
        const positions = [];
        let match;
        while ((match = re.exec(text)) !== null) {
            positions.push({ index: parseInt(match[1], 10), type: match[2] || '', start: match.index });
        }
        for (let i = 0; i < positions.length; i++) {
            const pos = positions[i];
            const end = i + 1 < positions.length ? positions[i + 1].start : text.length;
            const segment = text.slice(pos.start, end);
            const content = segment.replace(/^第\s*\d+\s*题(?:\s*[（(][^)）]+[)）])?\s*[，,\s：:]*/, '').trim();
            const ans = extractAnswerFromContent(content, pos.type);
            if (ans && !seen.has(pos.index)) {
                seen.add(pos.index);
                result.push({ index: pos.index, answer: ans });
            }
        }
        return result;
    }

    // 顺序列表解析：当 AI 只给“1. A”这种纯列表时使用
    function parseSequentialAnswers(text) {
        const result = [];
        const seen = new Set();
        const lines = text.split(/\r?\n/);
        for (const rawLine of lines) {
            const line = rawLine.trim();
            if (!line) continue;
            const m = line.match(/^(\d+)\s*[\.、\):：\s]+\s*(.+)$/);
            if (!m) continue;
            const idx = parseInt(m[1], 10);
            const ans = extractAnswerFromContent(m[2]);
            if (!ans || isProbablyQuestionStem(ans)) continue;
            if (seen.has(idx)) continue;
            seen.add(idx);
            result.push({ index: idx, answer: ans });
        }
        return result;
    }

    function parseAIAnswers(text) {
        if (!text) return [];
        const result = [];
        const seen = new Set();

        // 策略1：按行解析（最常用）
        const lines = text.split(/\r?\n/);
        for (const rawLine of lines) {
            const parsed = parseSingleAnswerLine(rawLine);
            if (parsed && !seen.has(parsed.index)) {
                seen.add(parsed.index);
                result.push(parsed);
            }
        }

        // 策略2：跨行解析（应对整段连续文本，并补充策略1遗漏的题号）
        const cross = parseCrossLineAnswers(text);
        for (const item of cross) {
            if (!seen.has(item.index)) {
                seen.add(item.index);
                result.push(item);
            }
        }

        // 策略3：顺序列表（无“答案”字样，仅“1. A”，仅补充未解析到的题号）
        // 注意：如果 AI 回复里已经有“第N题”标记，说明答案是按题号组织的，
        // 此时不要再把答案内部的“1. 2. 3.”子编号误当成题号。
        const hasExplicitQuestionMarkers = /第\s*\d+\s*题/.test(text);
        if (!hasExplicitQuestionMarkers) {
            const seq = parseSequentialAnswers(text);
            for (const item of seq) {
                if (!seen.has(item.index)) {
                    seen.add(item.index);
                    result.push(item);
                }
            }
        }

        result.sort((a, b) => a.index - b.index);
        return result;
    }

    function normalizeAIAnswer(answer, questionType) {
        let ans = String(answer || '').trim();

        // 长答案题型直接保留完整内容，不截断
        if (['简答题', '论述题', '计算题', '问答题', '材料题', '综合题', '分析题'].includes(questionType)) {
            return ans;
        }

        // 填空题保留完整答案（多空用 # 分隔），只清理明显的前缀
        if (questionType === '填空题') {
            return cleanAnswerCoreLong(ans);
        }

        ans = cleanAnswerCore(ans);

        if (questionType === '多选题') {
            // 去重并排序
            const letters = [...new Set(ans.replace(/[^A-Fa-f]/g, '').toUpperCase().split(''))].sort().join('');
            return letters;
        }
        if (questionType === '单选题') {
            // 优先匹配“答案/选/为”后面的字母
            const explicit = ans.match(/(?:答案|选|为)[的得是为了]?[：:\s]*([A-Fa-f])/);
            if (explicit) return explicit[1].toUpperCase();
            const letter = ans.match(/[A-Fa-f]/);
            if (letter) return letter[0].toUpperCase();
            return ans;
        }
        if (questionType === '判断题') {
            if (/正确|是|对|√|T|true|yes/i.test(ans) && !/错误|否|错|×|false|no/i.test(ans)) return '正确';
            if (/错误|否|错|×|false|no/i.test(ans) && !/正确|是|对|√|true|yes/i.test(ans)) return '错误';
            if (/^A$/i.test(ans)) return '正确';
            if (/^B$/i.test(ans)) return '错误';
            return ans;
        }
        return ans;
    }

    function fillAnswersFromAI(parsedAnswers) {
        const questions = detectQuestions(document.body);
        if (!questions || questions.length === 0) {
            showToast('未检测到题目，无法填答', 'warn');
            return;
        }
        // 为每道题提取选项，并缓存到 state.questionsList，供 clickOption 使用
        questions.forEach(q => {
            if (!q.options || q.options.length === 0) {
                q.options = extractOptions(q.element);
            }
        });
        state.questionsList = questions;

        const qMap = new Map();
        questions.forEach(q => qMap.set(q.index, q));

        let success = 0;
        let fail = 0;
        for (const item of parsedAnswers) {
            const q = qMap.get(item.index);
            if (!q) {
                addLog(`AI回填: 第${item.index}题未找到`, 'warn');
                fail++;
                continue;
            }
            const qType = detectQuestionType(q);
            const answer = normalizeAIAnswer(item.answer, qType);
            if (!answer) {
                addLog(`AI回填: 第${item.index}题答案为空`, 'warn');
                fail++;
                continue;
            }
            const ok = fillAnswer(q.element, answer, qType);
            if (ok) {
                const logAns = answer.length > 60 ? answer.slice(0, 60) + '...' : answer;
                addLog(`AI回填: 第${item.index}题（${qType}）已填 ${logAns}`, 'success');
                success++;
            } else {
                addLog(`AI回填: 第${item.index}题（${qType}）填写失败`, 'warn');
                fail++;
            }
        }
        showToast(`AI答案回填完成：成功 ${success} 题，失败 ${fail} 题`, success > 0 ? 'success' : 'warn');
        addLog(`AI对话: 回填完成，成功${success}/${parsedAnswers.length}`, success > 0 ? 'success' : 'warn');
    }

    // ==================== UI 渲染与交互 ====================
    function createPanel() {
        if (state.portalAccess.blocked) {
            showToast(state.portalAccess.blockedReason || '该脚本客户端已被限制使用', 'error');
            return;
        }
        const existed = document.getElementById('answer-assistant-panel');
        if (existed) {
            return;
        }
        const panel = document.createElement('div');
        panel.id = 'answer-assistant-panel';
        panel.innerHTML = `
            <div class="panel-header">
                <h3 class="panel-title">
                    智能自动答题助手
                </h3>
                <div class="panel-actions">
                    <button class="icon-btn" id="btn-min" title="最小化">−</button>
                    <button class="icon-btn" id="btn-close" title="关闭">×</button>
                </div>
            </div>

            <div class="tab-nav">
                <button class="tab-item active" data-tab="main">控制台</button>
                <button class="tab-item" data-tab="study">视频刷课</button>
                <button class="tab-item" data-tab="apis">API 配置</button>
                <button class="tab-item" data-tab="settings">设置</button>
                <button class="tab-item" data-tab="logs">日志</button>
            </div>

            <div class="panel-body">

                <!-- 控制台 -->
                <div class="tab-pane active" id="pane-main">
                    <div class="status-bar status-idle" id="status-bar">
                        <div class="status-dot"></div>就绪 - 请配置API后开始
                    </div>

                    <div class="aa-card">
                        <div class="form-field">
                            <label class="field-label">当前使用的 API</label>
                            <select class="field-select" id="sel-api">
                                <option value="">-- 请选择 --</option>
                            </select>
                        </div>

                        <div class="progress-wrap">
                            <div class="progress-info" id="progress-info">0 / 0 (0%)</div>
                            <div class="progress-track">
                                <div class="progress-fill" id="progress-fill" style="width:0%"></div>
                            </div>
                        </div>
                    </div>

                    <div class="aa-card">
                        <div class="aa-card-title">自动答题</div>
                        <div class="btn-row">
                            <button class="btn btn-primary btn-block" id="btn-start">开始自动答题</button>
                        </div>
                        <div class="btn-row">
                            <button class="btn btn-success" id="btn-single" style="flex:1">答当前题</button>
                            <button class="btn btn-danger" id="btn-stop" style="flex:1;display:none">停止</button>
                        </div>
                        <div class="btn-row">
                            <button class="btn btn-warning btn-block" id="btn-save">保存答案</button>
                        </div>
                        <div class="btn-row">
                            <button class="btn btn-warning-outline btn-block" id="btn-review">开始复查（二次验证已做题目）</button>
                        </div>
                    </div>

                    <div class="aa-card">
                        <div class="aa-card-title">AI 对话模式（无需 API）</div>
                        <div style="font-size:12px;color:#999;margin-bottom:12px;line-height:1.5;">
                            没 API 时：先把题目复制发给豆包 / ChatGPT，再把 AI 的回复粘贴回来，脚本自动填答。
                        </div>
                        <div class="btn-row" style="margin-top:0;">
                            <button class="btn btn-primary" id="btn-copy-ai" style="flex:1;font-size:13px;">复制全部题目</button>
                            <button class="btn btn-success" id="btn-paste-ai" style="flex:1;font-size:13px;">粘贴 AI 答案</button>
                        </div>
                    </div>

                    <div class="question-preview" id="question-preview" style="display:none"></div>
                </div>

                <!-- 视频刷课 -->
                <div class="tab-pane" id="pane-study">
                    <div class="aa-card">
                        <div class="aa-card-title">运行状态</div>
                        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
                            <div id="study-status-dot" style="width:10px;height:10px;border-radius:50%;background:#999;"></div>
                            <div id="study-status-text" style="font-size:13px;color:#333;font-weight:700;">未运行</div>
                        </div>
                        <div style="font-size:12px;color:#999;line-height:1.6;">
                            倍速: <span id="study-info-rate">1.5</span>x · 音量: <span id="study-info-volume">0</span> · 视频数: <span id="study-info-count">0</span>
                        </div>
                    </div>

                    <div class="aa-card">
                        <div class="aa-card-title">基础设置</div>
                        <div style="display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap;margin-bottom:12px;">
                            <div class="form-field" style="flex:1;min-width:90px;margin-bottom:0;">
                                <label class="field-label" style="font-size:11px;">倍速</label>
                                <input type="number" class="field-input" id="set-study-rate" min="0.25" max="16" step="0.25" value="1.5" style="height:40px;">
                            </div>
                            <div class="form-field" style="flex:1;min-width:90px;margin-bottom:0;">
                                <label class="field-label" style="font-size:11px;">音量</label>
                                <input type="number" class="field-input" id="set-study-volume" min="0" max="1" step="0.1" value="0" style="height:40px;">
                            </div>
                            <label class="toggle-switch" style="margin-bottom:6px;">
                                <input type="checkbox" id="set-study-enabled">
                                <span class="toggle-slider"></span>
                            </label>
                        </div>
                        <div style="display:flex;gap:8px;flex-wrap:wrap;">
                            <button class="btn btn-primary" id="btn-study-start" style="flex:1;padding:0 14px;font-size:13px;">开始刷课</button>
                            <button class="btn btn-danger" id="btn-study-stop" style="flex:1;padding:0 14px;font-size:13px;">停止刷课</button>
                            <button class="btn btn-outline" id="btn-study-apply" style="flex:1;padding:0 14px;font-size:13px;">立即应用倍速</button>
                            <button class="btn btn-outline" id="btn-study-diagnose" style="flex:1;padding:0 14px;font-size:13px;">诊断视频</button>
                        </div>
                    </div>

                    <div class="aa-card">
                        <div class="aa-card-title">功能开关</div>
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px;color:#636363;">
                            <label class="study-switch-label">
                                <input type="checkbox" id="set-study-anti-pause" checked> 反鼠标检测
                            </label>
                            <label class="study-switch-label">
                                <input type="checkbox" id="set-study-auto-unpause" checked> 自动解除暂停
                            </label>
                            <label class="study-switch-label">
                                <input type="checkbox" id="set-study-auto-next" checked> 自动跳任务点
                            </label>
                            <label class="study-switch-label">
                                <input type="checkbox" id="set-study-loop" checked> 视频自动连播
                            </label>
                            <label class="study-switch-label">
                                <input type="checkbox" id="set-study-close-dialog" checked> 自动关弹窗
                            </label>
                            <label class="study-switch-label">
                                <input type="checkbox" id="set-skip-exercise"> 总是跳过习题（不勾选=智能：配了AI/题库就自动作答并保存，没配就等外部答题脚本）
                            </label>
                            <label class="study-switch-label">
                                <input type="checkbox" id="set-study-handle-quiz" checked> 自动做内嵌题
                            </label>
                            <label class="study-switch-label">
                                <input type="checkbox" id="set-study-read" checked> 自动读章节（PPT/书籍）
                            </label>
                            <label class="study-switch-label">
                                <input type="checkbox" id="set-study-discuss" checked> 讨论自动回复
                            </label>
                        </div>
                        <div style="margin-top:12px;display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                            <div class="form-field" style="margin-bottom:0;">
                                <label class="field-label" style="font-size:11px;">翻页速度（秒/页）</label>
                                <input type="number" class="field-input" id="set-read-speed" min="1" max="10" step="0.5" value="1" style="height:40px;">
                            </div>
                            <div class="form-field" style="margin-bottom:0;">
                                <label class="field-label" style="font-size:11px;">讨论模式</label>
                                <select class="field-select" id="set-study-discuss-mode" style="height:40px;">
                                    <option value="random">随机一条</option>
                                    <option value="first">第一条（最新）</option>
                                    <option value="lastest">最后一条（最新发布）</option>
                                    <option value="max-show-up">出现最多（MOOC）</option>
                                    <option value="max-fav">最多点赞（MOOC）</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <div class="aa-card">
                        <div class="aa-card-title">高级</div>
                        <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:#636363;cursor:pointer;">
                            <input type="checkbox" id="set-study-autostart" style="margin:0;width:16px;height:16px;accent-color:var(--aa-primary);"> 进入学习页面时自动启动刷课
                        </label>
                        <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:#636363;cursor:pointer;margin-top:10px;">
                            <input type="checkbox" id="set-study-earliest" style="margin:0;width:16px;height:16px;accent-color:var(--aa-primary);" checked> 每次都跳转到最早未完成章节开始刷
                        </label>
                        <div style="font-size:11px;color:#999;margin-top:6px;margin-left:24px;line-height:1.4;">
                            开启后，手动点到后面的章节时，脚本也会自动拉回前面第一个没完成的章节
                        </div>
                        <div style="font-size:11px;color:#999;margin-top:6px;margin-left:24px;line-height:1.4;">
                            首次使用请手动点一下视频以激活浏览器（autoplay policy）
                        </div>
                        <div class="btn-row">
                            <button class="btn btn-primary" id="btn-study-save" style="flex:1;font-size:13px;">保存设置并刷新页面</button>
                        </div>
                        <div style="font-size:11px;color:#999;margin-top:8px;line-height:1.4;">
                            倍速/音量/自动启动等修改后必须点此按钮，刷新后才会真正生效
                        </div>
                    </div>
                </div>

                <!-- API配置 -->
                <div class="tab-pane" id="pane-apis">
                    <div id="api-list-container"></div>

                    <div class="aa-card" style="margin-top:14px;">
                        <div class="aa-card-title">自定义 API 配置</div>
                        <div class="setting-item" style="flex-direction:column;align-items:flex-start;padding-top:0;">
                            <span class="setting-label" style="margin-bottom:8px;">API 名称</span>
                            <input type="text" class="field-input" id="custom-api-name"
                                   placeholder="如：我的自定义 API">
                        </div>

                        <div class="setting-item" style="flex-direction:column;align-items:flex-start;">
                            <span class="setting-label" style="margin-bottom:8px;">Base URL</span>
                            <input type="text" class="field-input" id="custom-api-baseurl"
                                   placeholder="https://api.example.com/v1/chat/completions">
                        </div>

                        <div class="setting-item" style="flex-direction:column;align-items:flex-start;">
                            <span class="setting-label" style="margin-bottom:8px;">API Key</span>
                            <input type="password" class="field-input" id="custom-api-key"
                                   placeholder="sk-...">
                        </div>

                        <div class="setting-item" style="flex-direction:column;align-items:flex-start;">
                            <span class="setting-label" style="margin-bottom:8px;">模型列表</span>
                            <textarea class="field-input" id="custom-api-models" rows="3"
                                      placeholder="每行一个模型，如：&#10;model-name-1&#10;model-name-2" style="font-family:monospace;white-space:pre;overflow-x:auto;"></textarea>
                        </div>

                        <div class="setting-item" style="flex-direction:column;align-items:flex-start;">
                            <span class="setting-label" style="margin-bottom:8px;">接口协议</span>
                            <select class="field-select" id="custom-api-protocol" style="width:100%;height:40px;">
                                <option value="openai">OpenAI 兼容（绝大多数中转站 / 第三方）</option>
                                <option value="openai-reasoning">OpenAI 官方（推理模型走 max_completion_tokens）</option>
                                <option value="anthropic">Anthropic 原生（/v1/messages）</option>
                            </select>
                        </div>

                        <div class="setting-item" style="flex-direction:column;align-items:flex-start;gap:6px;">
                            <label class="setting-label" style="display:flex;align-items:center;gap:6px;cursor:pointer;font-weight:normal;">
                                <input type="checkbox" id="custom-api-supports-images"> 支持图片题目（多模态模型才勾）
                            </label>
                            <label class="setting-label" style="display:flex;align-items:center;gap:6px;cursor:pointer;font-weight:normal;">
                                <input type="checkbox" id="custom-api-reasoning"> 是思考型模型（不下发 temperature，输出上限留足）
                            </label>
                            <label class="setting-label" style="display:flex;align-items:center;gap:6px;cursor:pointer;font-weight:normal;">
                                <input type="checkbox" id="custom-api-apikey-header"> 使用 api-key 请求头（Azure OpenAI）
                            </label>
                        </div>

                        <div class="btn-row" style="margin-top:10px;">
                            <button class="btn btn-outline" id="btn-add-custom-api" style="flex:1">添加/更新自定义 API</button>
                            <button class="btn btn-outline" id="btn-edit-custom-api" style="flex:1;">编辑自定义 API</button>
                        </div>
                    </div>
                </div>

                <!-- 设置 -->
                <div class="tab-pane" id="pane-settings">
                    <div class="aa-card">
                        <div class="aa-card-title">答题选项</div>
                        <div class="setting-item" style="padding-top:0;">
                            <span class="setting-label">启用自动搜题</span>
                            <label class="toggle-switch">
                                <input type="checkbox" id="set-search" checked>
                                <span class="toggle-slider"></span>
                            </label>
                        </div>

                        <div class="setting-item">
                            <span class="setting-label">搜索引擎</span>
                            <select class="field-select" id="set-engine" style="width:140px;height:40px;padding:0 12px;">
                                <option value="baidu">百度（推荐）</option>
                                <option value="google">Google</option>
                                <option value="bing">Bing</option>
                            </select>
                        </div>

                        <div class="setting-item">
                            <span class="setting-label">自动填写答案</span>
                            <label class="toggle-switch">
                                <input type="checkbox" id="set-fill" checked>
                                <span class="toggle-slider"></span>
                            </label>
                        </div>

                        <div class="setting-item">
                            <span class="setting-label">自动进入下一题</span>
                            <label class="toggle-switch">
                                <input type="checkbox" id="set-next" checked>
                                <span class="toggle-slider"></span>
                            </label>
                        </div>

                        <div class="setting-item">
                            <span class="setting-label">题目间延迟 (毫秒)</span>
                            <input type="number" class="field-input" id="set-delay"
                                   value="1500" min="500" max="8000" step="100" style="width:100px;text-align:right;height:40px;">
                        </div>

                        <div class="setting-item">
                            <span class="setting-label">启用答案缓存</span>
                            <label class="toggle-switch">
                                <input type="checkbox" id="set-cache" checked>
                                <span class="toggle-slider"></span>
                            </label>
                        </div>
                    </div>

                    <div class="aa-card">
                        <div class="aa-card-title">免费题库</div>
                        <div class="setting-item" style="padding-top:0;">
                            <span class="setting-label">题库优先（节省API）</span>
                            <label class="toggle-switch">
                                <input type="checkbox" id="set-tiku-enabled" checked>
                                <span class="toggle-slider"></span>
                            </label>
                        </div>

                        <div class="setting-item">
                            <span class="setting-label">题库有答案时AI再查一遍</span>
                            <label class="toggle-switch">
                                <input type="checkbox" id="set-tiku-revalidate">
                                <span class="toggle-slider"></span>
                            </label>
                        </div>

                        <div class="setting-item" style="flex-direction:column;align-items:flex-start;">
                            <span class="setting-label" style="margin-bottom:8px;">题库列表</span>
                            <div id="tiku-list" style="width:100%;display:flex;flex-direction:column;gap:6px;max-height:200px;overflow-y:auto;"></div>
                        </div>

                        <div class="setting-item" style="flex-direction:column;align-items:flex-start;">
                            <span class="setting-label" style="margin-bottom:8px;">添加新题库</span>
                            <div style="display:flex;gap:8px;width:100%;">
                                <input type="text" class="field-input" id="input-tiku-name"
                                       placeholder="题库名称（选填）" style="flex:1;height:40px;">
                                <input type="text" class="field-input" id="input-tiku-url"
                                       placeholder="接口URL（必填）" style="flex:2;height:40px;">
                                <button class="btn btn-outline" id="btn-add-tiku" style="width:auto;padding:0 14px;font-size:13px;height:40px;">添加</button>
                            </div>
                            <span style="font-size:11px;color:#999;margin-top:8px;line-height:1.4;">
                                支持两种格式：①简单URL（tikuAdapter协议）②完整JSON配置；JSON格式可粘贴整段配置自动导入
                            </span>
                        </div>
                    </div>

                    <div class="aa-card">
                        <div class="aa-card-title">高级选项</div>
                        <div class="setting-item" style="padding-top:0;">
                            <span class="setting-label">答题起始位置</span>
                            <div style="display:flex;flex-direction:column;gap:6px;">
                                <label class="radio-label">
                                    <input type="radio" name="start-mode" value="beginning" checked>
                                    <span>从头开始</span>
                                </label>
                                <label class="radio-label">
                                    <input type="radio" name="start-mode" value="unanswered">
                                    <span>从没做的开始</span>
                                </label>
                                <label class="radio-label">
                                    <input type="radio" name="start-mode" value="continue">
                                    <span>继续上次进度</span>
                                </label>
                            </div>
                        </div>

                        <div class="setting-item">
                            <span class="setting-label">启用双API对比</span>
                            <label class="toggle-switch">
                                <input type="checkbox" id="set-dual-api">
                                <span class="toggle-slider"></span>
                            </label>
                        </div>

                        <div class="setting-item" id="dual-api-settings" style="display:none;">
                            <span class="setting-label">第二个API</span>
                            <select class="field-select" id="sel-second-api" style="width:140px;height:40px;padding:0 12px;">
                                <option value="">-- 请选择 --</option>
                            </select>
                        </div>

                        <div class="setting-item">
                            <span class="setting-label">复查已做题目（二次验证）</span>
                            <label class="toggle-switch">
                                <input type="checkbox" id="set-review">
                                <span class="toggle-slider"></span>
                            </label>
                        </div>
                    </div>

                    <div class="aa-card">
                        <div class="aa-card-title">题目类型筛选</div>
                        <div style="display:flex;flex-wrap:wrap;gap:10px;">
                            <label class="type-label">
                                <input type="checkbox" class="type-checkbox" value="all" checked>
                                <span>全部</span>
                            </label>
                            <label class="type-label">
                                <input type="checkbox" class="type-checkbox" value="单选题">
                                <span>单选题</span>
                            </label>
                            <label class="type-label">
                                <input type="checkbox" class="type-checkbox" value="多选题">
                                <span>多选题</span>
                            </label>
                            <label class="type-label">
                                <input type="checkbox" class="type-checkbox" value="判断题">
                                <span>判断题</span>
                            </label>
                            <label class="type-label">
                                <input type="checkbox" class="type-checkbox" value="填空题">
                                <span>填空题</span>
                            </label>
                            <label class="type-label">
                                <input type="checkbox" class="type-checkbox" value="简答题">
                                <span>简答题</span>
                            </label>
                            <label class="type-label">
                                <input type="checkbox" class="type-checkbox" value="计算题">
                                <span>计算题</span>
                            </label>
                        </div>
                    </div>

                    <div class="aa-card">
                        <div class="aa-card-title">网站白名单</div>
                        <div class="setting-item" style="padding-top:0;">
                            <span class="setting-label">启用网站白名单</span>
                            <label class="toggle-switch">
                                <input type="checkbox" id="set-whitelist" checked>
                                <span class="toggle-slider"></span>
                            </label>
                        </div>

                        <div class="setting-item">
                            <span class="setting-label">当前网站</span>
                            <span id="current-host" style="font-size:12px;font-weight:600;color:var(--aa-primary);background:rgba(0,168,255,0.06);padding:4px 10px;border-radius:4px;">--</span>
                        </div>

                        <div class="setting-item" style="flex-direction:column;align-items:flex-start;">
                            <span class="setting-label" style="margin-bottom:8px;">自定义网站列表</span>
                            <div style="display:flex;gap:8px;width:100%;">
                                <input type="text" class="field-input" id="input-add-domain"
                                       placeholder="输入域名，如 example.com" style="flex:1;height:40px;">
                                <button class="btn btn-outline" id="btn-add-domain" style="width:auto;padding:0 14px;font-size:13px;height:40px;">添加</button>
                            </div>
                            <div id="custom-domains-list" style="margin-top:10px;max-height:150px;overflow-y:auto;width:100%;"></div>
                        </div>

                        <div class="btn-row" style="margin-top:18px;">
                            <button class="btn btn-primary btn-block" id="btn-save-settings">保存设置</button>
                        </div>
                    </div>
                </div>

                <!-- 日志 -->
                <div class="tab-pane" id="pane-logs">
                    <div class="aa-card">
                        <div class="log-area" id="log-container">
                            <div class="log-line"><span class="log-ts">[--:--:--]</span><span class="log-msg-info">系统初始化完成</span></div>
                        </div>
                        <div class="btn-row" style="margin-top:14px">
                            <button class="btn btn-outline btn-block" id="btn-clear-log">清空日志</button>
                        </div>
                    </div>
                </div>

            </div>
        `;

        document.body.appendChild(panel);

        // 使面板可拖拽
        makeDraggable(panel.querySelector('.panel-header'), panel);

        renderAPIList();
        bindEvents();
        loadSettingsToUI();
    }

    function renderAPIList() {
        const container = document.getElementById('api-list-container');
        const select = document.getElementById('sel-api');

        if (!container || !select) {
            console.error('API列表容器未找到');
            return;
        }

        container.innerHTML = '';
        select.innerHTML = '<option value="">-- 请选择 --</option>';

        for (const [id, api] of Object.entries(AI_MODELS)) {
            const hasKey = !!api.apiKey;
            const isSelected = state.selectedAPIId === id;

            const card = document.createElement('div');
            card.className = `api-card ${isSelected ? 'selected' : ''}`;
            card.id = `card-${id}`;

            // 创建头部
            const header = document.createElement('div');
            header.className = 'api-card-header';

            // 构建头部内容，包含删除按钮（仅自定义 API 显示）
            // 自定义 API 名称用户可控，需转义防止注入
            let headerContent = `
                <span class="api-name">${escapeHtml(api.name)}</span>
                <span class="api-badge ${hasKey ? 'badge-ready' : 'badge-empty'}" id="badge-${id}">
                    ${hasKey ? '已配置' : '未配置'}
                </span>
            `;

            // 仅自定义 API 显示删除按钮
            if (api.isCustom) {
                headerContent += `
                    <button class="btn btn-delete" id="btn-delete-${id}" title="删除此 API">
                        ×
                    </button>
                `;
            }

            header.innerHTML = headerContent;

            // 使用 addEventListener 绑定点击事件
            header.addEventListener('click', function(e) {
                e.stopPropagation();
                const body = document.getElementById(`body-${id}`);
                if (body) {
                    body.classList.toggle('show');
                    card.classList.toggle('selected');
                }
            });

            // 创建内容体
            const body = document.createElement('div');
            body.className = `api-body ${isSelected ? 'show' : ''}`;
            body.id = `body-${id}`;

            // 创建表单元素
            const formContent = document.createElement('div');
            // 当前模型不在列表里时补进选项，避免下拉框显示空白
            const modelList = Array.isArray(api.models) ? api.models : [];
            const currentModel = api.model || api.defaultModel || '';
            const fullModelList = currentModel && !modelList.includes(currentModel)
                ? [currentModel, ...modelList]
                : modelList;
            formContent.innerHTML = `
                <div class="form-field">
                    <label class="field-label">API Key</label>
                    <input class="field-input" type="password" id="key-${id}"
                           placeholder="${getPlaceholder(id)}" value="${api.apiKey}">
                </div>
                <div class="form-field">
                    <label class="field-label">模型</label>
                    <select class="field-select" id="model-${id}">
                        ${fullModelList.map(m =>
                            `<option value="${escapeHtml(m)}" ${currentModel===m?'selected':''}>${escapeHtml(m)}</option>`
                        ).join('')}
                    </select>
                </div>
                <div class="btn-row">
                    <button class="btn btn-outline" id="btn-validate-${id}" style="flex:1">校验并启用</button>
                </div>
            `;

            body.appendChild(formContent);

            card.appendChild(header);
            card.appendChild(body);
            container.appendChild(card);

            // 绑定校验按钮事件
            const validateBtn = document.getElementById(`btn-validate-${id}`);
            if (validateBtn) {
                validateBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    validateAndSave(id);
                });
            }

            // 绑定删除按钮事件（仅自定义 API）
            if (api.isCustom) {
                const deleteBtn = document.getElementById(`btn-delete-${id}`);
                if (deleteBtn) {
                    deleteBtn.addEventListener('click', function(e) {
                        e.stopPropagation();
                        if (confirm(`确定要删除 "${api.name}" 吗？此操作无法撤销。`)) {
                            delete AI_MODELS[id];
                            saveAllConfig();
                            renderAPIList();
                            showToast(`已删除 "${api.name}"`, 'success');
                            addLog(`删除自定义 API: ${api.name}`, 'info');
                        }
                    });
                }
            }

            if (hasKey || api.enabled) {
                const opt = document.createElement('option');
                opt.value = id;
                opt.text = api.name;
                if (isSelected) opt.selected = true;
                select.appendChild(opt);
            }
        }
    }

    function getPlaceholder(apiId) {
        const ph = {
            openai: 'sk-...',
            anthropic: 'sk-ant-...',
            baidu: '百度 API Key',
            aliyun: 'sk-...',
            moonshot: 'sk-...',
            zhipu: '...',
            deepseek: 'sk-...',
            minimax: '...'
        };
        if (apiId.startsWith('custom_')) {
            return '自定义 API Key';
        }
        return ph[apiId] || '输入密钥...';
    }

    function bindEvents() {
        // 标签切换
        document.querySelectorAll('.tab-item').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
                tab.classList.add('active');
                document.getElementById(`pane-${tab.dataset.tab}`).classList.add('active');

                // 如果切换到设置页面，刷新第二个API下拉列表
                if (tab.dataset.tab === 'settings') {
                    populateSecondAPIDropdown();
                }
            });
        });

        // 最小化/关闭
        document.getElementById('btn-min').addEventListener('click', () => {
            const body = document.querySelector('.panel-body');
            const nav = document.querySelector('.tab-nav');
            body.style.display = body.style.display === 'none' ? '' : 'none';
            nav.style.display = nav.style.display === 'none' ? '' : 'none';
        });

        document.getElementById('btn-close').addEventListener('click', () => {
            document.getElementById('answer-assistant-panel').style.display = 'none';
        });

        // 主控按钮
        document.getElementById('btn-start').addEventListener('click', () => {
            saveAllConfig();
            startAutoAnswer();
        });

        document.getElementById('btn-stop').addEventListener('click', stopAutoAnswer);

        document.getElementById('btn-single').addEventListener('click', async () => {
            saveAllConfig();
            // 单题答题逻辑 - 直接识别整个页面
            const questions = detectQuestions(document.body);
            if (questions.length > 0) {
                await processSingleQuestion(questions[0]);
            } else {
                showToast('未检测到题目', 'error');
            }
        });

        document.getElementById('btn-save').addEventListener('click', () => {
            saveAllConfig();
            showToast('答案已保存（本地存储）', 'success');
            addLog('用户手动触发保存', 'info');
        });

        document.getElementById('btn-review').addEventListener('click', () => {
            saveAllConfig();
            startReview();
        });

        document.getElementById('btn-copy-ai').addEventListener('click', () => {
            copyAllQuestionsForAI();
        });

        document.getElementById('btn-paste-ai').addEventListener('click', () => {
            showAIAnswerInputModal();
        });

        document.getElementById('btn-save-settings').addEventListener('click', () => {
            saveAllConfig();
            renderPortalStatus();
            showToast('设置已保存', 'success');
            addLog('设置已保存', 'info');
        });

        // 添加题库
        document.getElementById('btn-add-tiku')?.addEventListener('click', () => {
            addTiku();
        });
        // 刷课控制按钮
        document.getElementById('btn-study-start')?.addEventListener('click', () => {
            if (typeof startStudy === 'function') {
                startStudy();
            } else {
                showToast('刷课模块未加载', 'error');
            }
        });
        document.getElementById('btn-study-stop')?.addEventListener('click', () => {
            if (typeof stopStudy === 'function') {
                stopStudy();
            } else {
                showToast('刷课模块未加载', 'error');
            }
        });
        document.getElementById('btn-study-apply')?.addEventListener('click', () => {
            if (typeof applyStudyRate === 'function') {
                const rate = parseFloat(document.getElementById('set-study-rate')?.value || 1.5);
                const vol = parseFloat(document.getElementById('set-study-volume')?.value || 0);
                // force=true：用户主动改倍速后，已应用过的视频也要重新应用
                const n = applyStudyRate(rate, vol, true);
                if (n > 0) {
                    showToast(`已对 ${n} 个视频应用 ${rate}x / 音量${vol}`, 'success');
                    addLog(`刷课: 已对 ${n} 个视频应用 ${rate}x / 音量${vol}`, 'success');
                } else {
                    showToast('当前页面没找到视频，点诊断', 'warn');
                    addLog('刷课: 当前页面未找到视频（可点诊断排查）', 'warn');
                }
            }
        });
        // 诊断按钮：详细列出页面所有可能的视频位置+iframe信息
        document.getElementById('btn-study-diagnose')?.addEventListener('click', () => {
            if (typeof diagnoseVideo === 'function') {
                diagnoseVideo();
            }
        });

        // 保存设置并刷新页面
        document.getElementById('btn-study-save')?.addEventListener('click', () => {
            if (typeof saveAllConfig === 'function') saveAllConfig();
            if (typeof addLog === 'function') addLog('刷课: 设置已保存，即将刷新页面', 'success');
            if (typeof showToast === 'function') showToast('设置已保存，正在刷新…', 'success');
            setTimeout(() => { try { location.reload(); } catch(e) {} }, 500);
        });

        // ========== 视频刷课 tab：状态更新 + 实时显示视频数 ==========
        function updateStudyStatus() {
            const dot = document.getElementById('study-status-dot');
            const text = document.getElementById('study-status-text');
            const rate = document.getElementById('study-info-rate');
            const vol = document.getElementById('study-info-volume');
            const count = document.getElementById('study-info-count');
            if (rate) rate.textContent = state.settings.studyRate;
            if (vol) vol.textContent = state.settings.studyVolume;
            if (count) {
                try { count.textContent = findAllVideos().length; } catch(e) { count.textContent = '?'; }
            }
            if (dot && text) {
                if (_STUDY.running) {
                    dot.style.background = 'var(--aa-success)';
                    text.textContent = '运行中';
                    text.style.color = 'var(--aa-success)';
                } else {
                    dot.style.background = '#999';
                    text.textContent = '未运行';
                    text.style.color = '#333';
                }
            }
        }
        // 启动时初始化一次
        updateStudyStatus();
        // 每3秒刷新一次（视频数会变）
        setInterval(updateStudyStatus, 3000);

        // 添加自定义域名
        document.getElementById('btn-add-domain')?.addEventListener('click', () => {
            const input = document.getElementById('input-add-domain');
            const domain = input.value?.trim();
            if (!domain) {
                showToast('请输入域名', 'error');
                return;
            }
            if (state.settings.customWhitelist.includes(domain)) {
                showToast('域名已存在', 'error');
                return;
            }
            state.settings.customWhitelist.push(domain);
            input.value = '';
            renderCustomDomainsList();
            saveAllConfig();
            showToast('已添加域名', 'success');
        });

        // 回车键添加域名
        document.getElementById('input-add-domain')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                document.getElementById('btn-add-domain')?.click();
            }
        });

        // 添加自定义 API
        document.getElementById('btn-add-custom-api')?.addEventListener('click', () => {
            const name = document.getElementById('custom-api-name')?.value?.trim();
            const baseURL = document.getElementById('custom-api-baseurl')?.value?.trim();
            const apiKey = document.getElementById('custom-api-key')?.value?.trim();
            const modelsText = document.getElementById('custom-api-models')?.value?.trim();

            if (!name || !baseURL || !apiKey || !modelsText) {
                showToast('请填写完整的自定义 API 信息', 'error');
                return;
            }

            const models = modelsText.split('\n').map(m => m.trim()).filter(m => m);
            if (models.length === 0) {
                showToast('请至少添加一个模型', 'error');
                return;
            }

            const protocol = document.getElementById('custom-api-protocol')?.value || 'openai';
            const supportsImages = !!document.getElementById('custom-api-supports-images')?.checked;
            const isReasoning = !!document.getElementById('custom-api-reasoning')?.checked;
            const useApiKeyHeader = !!document.getElementById('custom-api-apikey-header')?.checked;

            // 修复（2026-10）：编辑流程以前是"先删旧条目、再让用户重新添加"，
            // 但删除后立刻 saveAllConfig()，快照里已经没有该条目 → 用户还没点"添加"，
            // 配置（含手输的 API Key）就已经被永久抹掉。改为原地替换，编辑全程无损。
            const editingId = window.__editingCustomId;
            const customId = editingId || ('custom_' + Date.now());

            // 添加/更新到模型配置
            AI_MODELS[customId] = {
                name: name,
                baseURL: baseURL,
                models: models,
                defaultModel: models[0],
                // 修复（2026-10）：必须同时写 model，否则刷新页面后请求体缺 model → 全部 400
                model: models[0],
                apiKey: apiKey,
                enabled: true,
                isCustom: true,
                protocol: protocol,
                // 协议 → 请求层标记（自定义 API 指向 OpenAI 官方 / Anthropic 原生端点时必需）
                isOpenAI: protocol === 'openai-reasoning',
                isAnthropic: protocol === 'anthropic',
                supportsImages: supportsImages,
                // 勾选 → 思考型；未勾选 → 留 undefined，交给模型名正则兜底判断
                isReasoning: isReasoning ? true : undefined,
                useApiKeyHeader: useApiKeyHeader
            };
            window.__editingCustomId = null;

            // 清空输入框
            document.getElementById('custom-api-name').value = '';
            document.getElementById('custom-api-baseurl').value = '';
            document.getElementById('custom-api-key').value = '';
            document.getElementById('custom-api-models').value = '';
            const protoSel = document.getElementById('custom-api-protocol');
            if (protoSel) protoSel.value = 'openai';
            const imgBox = document.getElementById('custom-api-supports-images');
            if (imgBox) imgBox.checked = false;
            const reasonBox = document.getElementById('custom-api-reasoning');
            if (reasonBox) reasonBox.checked = false;
            const keyBox = document.getElementById('custom-api-apikey-header');
            if (keyBox) keyBox.checked = false;

            // 重新渲染 API 列表
            renderAPIList();
            saveAllConfig();

            showToast(`自定义 API "${name}" ${editingId ? '已更新' : '已添加'}`, 'success');
            addLog(`${editingId ? '更新' : '添加'}自定义 API: ${name}`, 'info');
        });

        // 编辑自定义 API
        document.getElementById('btn-edit-custom-api')?.addEventListener('click', () => {
            // 获取所有自定义 API
            const customAPIs = Object.entries(AI_MODELS)
                .filter(([id, api]) => api.isCustom);

            if (customAPIs.length === 0) {
                showToast('暂无自定义 API，请先添加', 'info');
                return;
            }

            // 只有一个时直接选中；多个时用 prompt 输入序号选择
            // （原实现的选择框从未插入 DOM，confirm 后永远取第一个，与用户意图无关）
            let entry;
            if (customAPIs.length === 1) {
                entry = customAPIs[0];
            } else {
                const numbered = customAPIs
                    .map(([id, api], i) => `${i + 1}. ${api.name} (${api.baseURL})`)
                    .join('\n');
                const input = prompt(`请输入要编辑的自定义 API 序号（1-${customAPIs.length}）：\n${numbered}`, '1');
                if (input === null) return;
                entry = customAPIs[parseInt(input, 10) - 1];
                if (!entry) {
                    showToast('序号无效', 'error');
                    return;
                }
            }

            const [selectedId, api] = entry;
            document.getElementById('custom-api-name').value = api.name;
            document.getElementById('custom-api-baseurl').value = api.baseURL;
            document.getElementById('custom-api-key').value = api.apiKey;
            document.getElementById('custom-api-models').value = (api.models || []).join('\n');

            // 修复（2026-10）：把协议 / 能力开关一起回填，并记住待替换的旧 ID。
            // 原来这里是"立刻 delete + saveAllConfig()" → 用户只是点了"编辑"，
            // API Key、baseURL、模型列表就已经被覆盖写没了（必须重新手输密钥），
            // 而且 useApiKeyHeader（Azure）也会丢 → 请求头从 api-key 退回 Bearer → 401。
            const protoSel = document.getElementById('custom-api-protocol');
            if (protoSel) {
                protoSel.value = api.isAnthropic ? 'anthropic'
                    : (api.isOpenAI ? 'openai-reasoning' : 'openai');
            }
            const imgBox = document.getElementById('custom-api-supports-images');
            if (imgBox) imgBox.checked = api.supportsImages === true;
            const reasonBox = document.getElementById('custom-api-reasoning');
            if (reasonBox) reasonBox.checked = api.isReasoning === true;
            const keyBox = document.getElementById('custom-api-apikey-header');
            if (keyBox) keyBox.checked = api.useApiKeyHeader === true;

            // 只标记待替换，不删除；等用户点"添加/更新"成功后原地替换
            window.__editingCustomId = selectedId;
            renderAPIList();

            showToast('已填充信息，请修改后点击"添加/更新"（原配置不会被清除）', 'info');
        });

        document.getElementById('btn-clear-log').addEventListener('click', () => {
            const lc = document.getElementById('log-container');
            if (lc) lc.innerHTML = '';
            state.logs = [];
        });

        // API选择变更
        document.getElementById('sel-api').addEventListener('change', (e) => {
            state.selectedAPIId = e.target.value || null;
            saveAllConfig();
            // 更新第二个API下拉列表（排除当前选中的API）
            populateSecondAPIDropdown();
        });

        // 双API开关
        document.getElementById('set-dual-api')?.addEventListener('change', () => {
            updateDualAPISettings();
            // 刷新第二个API下拉列表
            populateSecondAPIDropdown();
        });

        // 题目类型全选逻辑
        document.querySelector('.type-checkbox[value="all"]')?.addEventListener('change', (e) => {
            const allChecked = e.target.checked;
            document.querySelectorAll('.type-checkbox').forEach(cb => {
                cb.checked = allChecked;
            });
        });

        // 单个题目类型选择（取消全选）
        document.querySelectorAll('.type-checkbox').forEach(cb => {
            cb.addEventListener('change', (e) => {
                if (e.target.value !== 'all' && !e.target.checked) {
                    const allCheckbox = document.querySelector('.type-checkbox[value="all"]');
                    if (allCheckbox) allCheckbox.checked = false;
                }
            });
        });

        // 运行状态时显示停止按钮
        const observer = new MutationObserver(() => {
            const running = state.isRunning;
            document.getElementById('btn-start').style.display = running ? 'none' : '';
            document.getElementById('btn-stop').style.display = running ? '' : 'none';
        });
        observer.observe(document.getElementById('status-bar'), { attributes: true, attributeFilter: ['class'] });

        // 注册菜单
        GM_registerMenuCommand('显示/隐藏面板', () => {
            const p = document.getElementById('answer-assistant-panel');
            if (p) p.style.display = p.style.display === 'none' ? '' : 'none';
        });
    }

    function loadSettingsToUI() {
        if (document.getElementById('set-search'))
            document.getElementById('set-search').checked = state.settings.autoSearch;
        if (document.getElementById('set-engine'))
            document.getElementById('set-engine').value = state.settings.searchEngine;
        if (document.getElementById('set-fill'))
            document.getElementById('set-fill').checked = state.settings.autoFill;
        if (document.getElementById('set-next'))
            document.getElementById('set-next').checked = state.settings.autoNext;
        if (document.getElementById('set-delay'))
            document.getElementById('set-delay').value = state.settings.delayTime;
        if (document.getElementById('set-cache'))
            document.getElementById('set-cache').checked = state.settings.useCache;
        // 题库相关
        if (document.getElementById('set-tiku-enabled'))
            document.getElementById('set-tiku-enabled').checked = state.settings.tikuEnabled !== false;
        if (document.getElementById('set-tiku-revalidate'))
            document.getElementById('set-tiku-revalidate').checked = !!state.settings.tikuRevalidate;
        // 渲染题库列表
        renderTikuList();
        // 刷课相关
        if (document.getElementById('set-study-enabled'))
            document.getElementById('set-study-enabled').checked = !!state.settings.studyEnabled;
        if (document.getElementById('set-study-rate'))
            document.getElementById('set-study-rate').value = state.settings.studyRate ?? 1.5;
        if (document.getElementById('set-study-volume'))
            document.getElementById('set-study-volume').value = state.settings.studyVolume ?? 0;
        if (document.getElementById('set-study-anti-pause'))
            document.getElementById('set-study-anti-pause').checked = state.settings.studyAntiPause !== false;
        if (document.getElementById('set-study-auto-unpause'))
            document.getElementById('set-study-auto-unpause').checked = state.settings.studyAutoUnpause !== false;
        if (document.getElementById('set-study-auto-next'))
            document.getElementById('set-study-auto-next').checked = state.settings.studyAutoNext !== false;
        if (document.getElementById('set-study-loop'))
            document.getElementById('set-study-loop').checked = state.settings.studyLoop !== false;
        if (document.getElementById('set-study-close-dialog'))
            document.getElementById('set-study-close-dialog').checked = state.settings.studyAutoCloseDialog !== false;
        if (document.getElementById('set-skip-exercise'))
            document.getElementById('set-skip-exercise').checked = state.settings.skipExercise === true;
        if (document.getElementById('set-study-handle-quiz'))
            document.getElementById('set-study-handle-quiz').checked = state.settings.studyHandleVideoQuiz !== false;
        if (document.getElementById('set-study-autostart'))
            document.getElementById('set-study-autostart').checked = state.settings.studyAutoStartOnLoad === true;
        if (document.getElementById('set-study-earliest'))
            document.getElementById('set-study-earliest').checked = state.settings.studyAlwaysStartFromEarliest !== false;
        if (document.getElementById('set-study-read'))
            document.getElementById('set-study-read').checked = state.settings.studyReadTask !== false;
        if (document.getElementById('set-study-discuss'))
            document.getElementById('set-study-discuss').checked = state.settings.studyAutoDiscuss !== false;
        if (document.getElementById('set-study-discuss-mode'))
            document.getElementById('set-study-discuss-mode').value = state.settings.studyDiscussMode || 'random';
        if (document.getElementById('set-read-speed'))
            document.getElementById('set-read-speed').value = state.settings.readSpeed || 1;

        // 加载答题起始模式设置
        const startMode = state.settings.startMode || 'beginning';
        const startModeRadio = document.querySelector(`input[name="start-mode"][value="${startMode}"]`);
        if (startModeRadio) {
            startModeRadio.checked = true;
        }

        if (document.getElementById('set-dual-api'))
            document.getElementById('set-dual-api').checked = state.settings.enableDualAPI;
        if (document.getElementById('set-review'))
            document.getElementById('set-review').checked = state.settings.reviewMode || false;
        if (document.getElementById('sel-second-api'))
            document.getElementById('sel-second-api').value = state.settings.secondAPIId || '';

        // 加载题目类型选择
        const typeCheckboxes = document.querySelectorAll('.type-checkbox');
        typeCheckboxes.forEach(cb => {
            cb.checked = state.settings.questionTypes.includes(cb.value);
        });

        // 加载网站白名单设置
        if (document.getElementById('set-whitelist'))
            document.getElementById('set-whitelist').checked = state.settings.enableWhitelist;

        // 显示当前网站域名
        if (document.getElementById('current-host'))
            document.getElementById('current-host').textContent = window.location.hostname;

        // 更新自定义域名列表
        renderCustomDomainsList();

        // 更新双API设置的显示状态
        updateDualAPISettings();

        // 更新第二个API下拉列表
        populateSecondAPIDropdown();
        renderPortalStatus();
    }

    function renderCustomDomainsList() {
        const container = document.getElementById('custom-domains-list');
        if (!container) return;

        container.innerHTML = '';

        if (state.settings.customWhitelist.length === 0) {
            container.innerHTML = '<div style="color:#999;font-size:12px;">暂无自定义域名</div>';
            return;
        }

        state.settings.customWhitelist.forEach((domain, index) => {
            const item = document.createElement('div');
            item.style.display = 'flex';
            item.style.alignItems = 'center';
            item.style.justifyContent = 'space-between';
            item.style.padding = '4px 8px';
            item.style.background = '#f7f8fa';
            item.style.borderRadius = '4px';
            item.style.marginBottom = '4px';
            const label = document.createElement('span');
            label.style.fontSize = '13px';
            label.style.color = '#333';
            label.textContent = domain;

            const button = document.createElement('button');
            button.className = 'btn btn-outline';
            button.style.padding = '2px 8px';
            button.style.fontSize = '12px';
            button.textContent = '删除';
            button.addEventListener('click', () => removeCustomDomain(index));

            item.appendChild(label);
            item.appendChild(button);
            container.appendChild(item);
        });
    }

    function removeCustomDomain(index) {
        state.settings.customWhitelist.splice(index, 1);
        renderCustomDomainsList();
        saveAllConfig();
        showToast('已删除域名', 'info');
    }

    // 题库列表管理
    // tikuList 结构：[{id, name, url, enabled}]
    // 多个题库可同时启用：依次查询，**任意一个**查到答案就停止（按列表顺序）
    function renderTikuList() {
        const container = document.getElementById('tiku-list');
        if (!container) return;
        container.innerHTML = '';

        if (!Array.isArray(state.settings.tikuList) || state.settings.tikuList.length === 0) {
            container.innerHTML = '<div style="color:#999;font-size:12px;padding:8px;">暂无题库，请添加</div>';
            return;
        }

        state.settings.tikuList.forEach((tiku, index) => {
            const item = document.createElement('div');
            item.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:6px 10px;background:#f7f8fa;border:1px solid var(--aa-border-light);border-radius:5px;gap:8px;';
            const safeName = (tiku.name || '').replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c]));
            const safeUrl = (tiku.url || '').replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c]));
            item.innerHTML = `
                <label class="toggle-switch" style="flex-shrink:0;">
                    <input type="checkbox" ${tiku.enabled ? 'checked' : ''} data-tiku-idx="${index}">
                    <span class="toggle-slider"></span>
                </label>
                <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;">
                    <span style="font-size:13px;font-weight:600;color:#333;">${safeName || '(未命名题库)'}</span>
                    <span style="font-size:11px;color:#999;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${safeUrl}">${safeUrl}</span>
                </div>
                <button class="btn btn-outline btn-tiku-remove" style="padding:2px 10px;font-size:12px;flex-shrink:0;" data-tiku-idx="${index}">删除</button>
            `;
            container.appendChild(item);
        });

        // 绑定启用开关和删除按钮事件（避免内联 onclick 找不到函数）
        container.querySelectorAll('input[data-tiku-idx]').forEach(cb => {
            cb.addEventListener('change', (e) => {
                const idx = parseInt(e.target.dataset.tikuIdx, 10);
                toggleTiku(idx, e.target.checked);
            });
        });
        container.querySelectorAll('.btn-tiku-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(e.target.dataset.tikuIdx, 10);
                removeTiku(idx);
            });
        });
    }

    // 去掉字符串首尾的反引号 / 空白 / 引号
    function cleanTikuStr(s) {
        if (typeof s !== 'string') return '';
        let v = s.trim();
        // 反复剥除成对的外层引号或反引号
        for (let i = 0; i < 3; i++) {
            if ((v.startsWith('"') && v.endsWith('"')) ||
                (v.startsWith("'") && v.endsWith("'")) ||
                (v.startsWith('`') && v.endsWith('`'))) {
                v = v.slice(1, -1).trim();
            } else {
                break;
            }
        }
        return v;
    }

    function addTiku() {
        const nameInput = document.getElementById('input-tiku-name');
        const urlInput = document.getElementById('input-tiku-url');
        if (!urlInput) return;
        const raw = (urlInput.value || '').trim();
        const name = (nameInput?.value || '').trim();

        if (!raw) {
            showToast('请填写题库URL或JSON配置', 'error');
            return;
        }
        if (!Array.isArray(state.settings.tikuList)) state.settings.tikuList = [];

        // 1) 如果是 JSON 数组，整体导入
        if (raw.startsWith('[') || raw.startsWith('{')) {
            try {
                const parsed = JSON.parse(raw);
                const arr = Array.isArray(parsed) ? parsed : [parsed];
                let added = 0;
                let skipped = 0;
                for (const item of arr) {
                    if (!item || typeof item !== 'object') { skipped++; continue; }
                    // 清理 url 字段：去掉反引号 / 空白 / 外层引号
                    const cleanUrl = cleanTikuStr(item.url);
                    if (!cleanUrl) { skipped++; continue; }
                    if (!/^https?:\/\//i.test(cleanUrl)) { skipped++; continue; }
                    // 去重（按 url + name）
                    if (state.settings.tikuList.some(t => t.url === cleanUrl && (t.name || '') === (item.name || ''))) {
                        skipped++; continue;
                    }
                    // 构造保存的 config：url 清理掉反引号，保留其余字段
                    const saveConfig = { ...item, url: cleanUrl };
                    const finalName = (name && arr.length === 1)
                        ? name
                        : (cleanTikuStr(item.name) || ('题库' + (state.settings.tikuList.length + 1)));
                    state.settings.tikuList.push({
                        id: 'tiku_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
                        name: finalName,
                        url: cleanUrl,
                        enabled: true,
                        // 完整保存 JSON 配置（method/type/data/headers/handler）
                        config: saveConfig
                    });
                    added++;
                }
                if (added === 0) {
                    showToast('未添加任何题库（' + (skipped > 0 ? skipped + '项已跳过/格式不符' : '请检查格式') + '）', 'error');
                    return;
                }
                saveAllConfig();
                renderTikuList();
                if (nameInput) nameInput.value = '';
                if (urlInput) urlInput.value = '';
                showToast('已导入 ' + added + ' 个题库' + (skipped > 0 ? '（跳过 ' + skipped + '）' : ''), 'success');
                return;
            } catch (e) {
                showToast('JSON解析失败: ' + e.message, 'error');
                return;
            }
        }

        // 2) 否则当作普通 URL 处理（兼容旧版）
        const url = cleanTikuStr(raw);
        if (!url) {
            showToast('请填写题库URL或JSON配置', 'error');
            return;
        }
        if (!/^https?:\/\//i.test(url)) {
            showToast('URL必须以 http:// 或 https:// 开头', 'error');
            return;
        }
        if (state.settings.tikuList.some(t => t.url === url)) {
            showToast('该题库已存在', 'warn');
            return;
        }
        state.settings.tikuList.push({
            id: 'tiku_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
            name: name || ('题库' + (state.settings.tikuList.length + 1)),
            url: url,
            enabled: true
        });
        if (nameInput) nameInput.value = '';
        if (urlInput) urlInput.value = '';
        renderTikuList();
        saveAllConfig();
        showToast('已添加题库：' + (name || url), 'success');
    }

    function removeTiku(index) {
        if (!Array.isArray(state.settings.tikuList)) return;
        const tiku = state.settings.tikuList[index];
        if (!tiku) return;
        const name = tiku.name || '题库';
        state.settings.tikuList.splice(index, 1);
        renderTikuList();
        saveAllConfig();
        showToast('已删除题库：' + name, 'info');
    }

    function toggleTiku(index, enabled) {
        if (!Array.isArray(state.settings.tikuList)) return;
        const tiku = state.settings.tikuList[index];
        if (!tiku) return;
        tiku.enabled = !!enabled;
        saveAllConfig();
    }

    function populateSecondAPIDropdown() {
        const select = document.getElementById('sel-second-api');
        if (!select) return;

        // 清空现有选项
        select.innerHTML = '<option value="">-- 请选择 --</option>';

        // 添加已启用的API（排除当前选中的API）
        for (const [id, api] of Object.entries(AI_MODELS)) {
            if (api.enabled && api.apiKey && id !== state.selectedAPIId) {
                const opt = document.createElement('option');
                opt.value = id;
                opt.text = api.name;
                select.appendChild(opt);
            }
        }
    }

    function updateDualAPISettings() {
        const dualApiEnabled = document.getElementById('set-dual-api')?.checked;
        const dualApiSettings = document.getElementById('dual-api-settings');

        if (dualApiSettings) {
            dualApiSettings.style.display = dualApiEnabled ? '' : 'none';
        }
    }

    function makeDraggable(header, panel) {
        let isDrag = false, startX = 0, startY = 0, startLeft = 0, startTop = 0;

        header.addEventListener('mousedown', (e) => {
            if (e.target.tagName === 'BUTTON') return;
            e.preventDefault();
            isDrag = true;

            // 记录初始位置
            const rect = panel.getBoundingClientRect();
            startX = e.clientX;
            startY = e.clientY;
            startLeft = rect.left;
            startTop = rect.top;
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDrag) return;

            // 计算新位置
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            const newLeft = startLeft + dx;
            const newTop = startTop + dy;

            // 限制在可视区域内
            const maxLeft = window.innerWidth - panel.offsetWidth;
            const maxTop = window.innerHeight - panel.offsetHeight;
            const boundedLeft = Math.max(0, Math.min(newLeft, maxLeft));
            const boundedTop = Math.max(0, Math.min(newTop, maxTop));

            panel.style.left = `${boundedLeft}px`;
            panel.style.top = `${boundedTop}px`;
            panel.style.transform = 'none';
        });

        document.addEventListener('mouseup', () => isDrag = false);
    }

    // 全局函数供onclick调用
window.toggleApiBody = function(id) {
    const body = document.getElementById(`body-${id}`);
    if (!body) return;
    body.classList.toggle('show');

    // 更新卡片选中状态
    const card = document.getElementById(`card-${id}`);
    if (card) {
        card.classList.toggle('selected');
    }
};

    window.validateAndSave = async function(id) {
        // 获取输入元素
        const keyInput = document.getElementById(`key-${id}`);
        const modelSelect = document.getElementById(`model-${id}`);

        if (!keyInput) {
            showToast('配置元素未找到', 'error');
            return;
        }

        // 保存配置
        const api = AI_MODELS[id];
        api.apiKey = keyInput.value.trim();

        if (modelSelect) {
            // 下拉框为空（旧模型名已下架）时回落到默认模型，避免发出 model:"" 的请求
            api.model = modelSelect.value || api.defaultModel || (Array.isArray(api.models) && api.models[0]) || '';
        }

        api.enabled = true;

        // 校验通过才切换当前 API；失败保持原来的选择
        const result = await validateAPI(id);
        if (result.ok) {
            state.selectedAPIId = id;
            showToast(`${api.name} 已启用`, 'success');
            renderAPIList(); // 刷新UI
        } else {
            showToast(`校验失败: ${result.msg}`, 'error');
            api.enabled = false;
        }

        saveAllConfig();
    };

    // ==================== 使用提示弹窗 ====================
    // UI 与主面板同一设计语言：复用 .aa-modal 系列结构与 --aa-* 设计变量，
    // 按钮用 OCS 描边风格 .btn，信息行用软色底图标 + 标题/描述两级文本（对齐面板卡片视觉）
    function showUsageNotice() {
        // 检查是否已设置为不再显示
        const hideNotice = GM_getValue('smart_answer_assistant_hide_notice');
        if (hideNotice) return;

        // 四条须知：图标 / 软色底 / 主题色 / 标题 / 描述
        const items = [
            { glyph: '✓', bg: 'var(--aa-success-soft)', color: 'var(--aa-success-text)', title: '完全免费公益',
              desc: '本脚本完全免费开源，若您是付费购买，请立即举报售卖者。' },
            { glyph: '%', bg: 'var(--aa-warning-soft)', color: 'var(--aa-warning-text)', title: '正确率说明',
              desc: '截至2026年6月8日，大模型答题正确率约为80%左右，具体取决于题目类型和难度。' },
            { glyph: 'A', bg: 'var(--aa-primary-soft)', color: 'var(--aa-primary)', title: 'API获取',
              desc: '请自行搜索各大AI平台的API获取方法，如OpenAI、智谱、阿里通义千问等。' },
            { glyph: '!', bg: 'var(--aa-danger-soft)', color: 'var(--aa-danger-text)', title: '使用声明',
              desc: '本脚本仅供学习参考使用，禁止用于商业盈利或恶意用途。' }
        ];

        // 遮罩层：叠加在面板（z-index 999999）之上
        const overlay = document.createElement('div');
        overlay.id = 'aa-notice-overlay';
        overlay.className = 'aa-modal-overlay';
        overlay.style.zIndex = '9999999';

        // 弹窗主体：与主面板同款白底 + 细边 + 柔和投影 + scaleIn 动画（.aa-modal 自带）
        const dialog = document.createElement('div');
        dialog.className = 'aa-modal';
        dialog.style.width = '480px';
        dialog.style.maxWidth = '90vw';

        // 顶部站点横幅（2026-09 新增）：优先脚本分发站点（portal 配置/推断），
        // 未配置时回落 GitHub 主页；新标签页打开
        let siteUrl = 'https://github.com/xu20060420fan-cell/xufan-tools';
        let siteName = 'GitHub 主页';
        try {
            const portalBase = (typeof getPortalServerBase === 'function') ? getPortalServerBase() : '';
            if (portalBase) {
                siteUrl = portalBase;
                siteName = '作者网站';
            }
        } catch (e) {}
        const banner = document.createElement('div');
        banner.style.cssText = `
            padding: 10px 20px; text-align: center; font-size: 12.5px;
            background: linear-gradient(90deg, var(--aa-primary-soft), rgba(0,168,255,0.03));
            border-bottom: 1px solid var(--aa-border-light); color: var(--aa-text-body);
        `;
        banner.innerHTML = `更多信息，欢迎访问我的网站：<a href="${siteUrl}" target="_blank" rel="noopener noreferrer" ` +
            `style="color: var(--aa-primary); font-weight: 700; text-decoration: none;">${siteName} ↗</a>`;

        // 头部：图标徽标 + 标题/副标题
        const header = document.createElement('div');
        header.className = 'aa-modal-header';
        header.innerHTML = `
            <div style="display:flex;align-items:center;gap:12px;">
                <div style="width:40px;height:40px;border-radius:12px;flex-shrink:0;
                            background:var(--aa-primary-soft);border:1px solid rgba(0,168,255,0.25);
                            display:flex;align-items:center;justify-content:center;
                            font-size:20px;font-weight:800;color:var(--aa-primary);">!</div>
                <div>
                    <div class="aa-modal-title" style="margin:0;">使用须知</div>
                    <div class="aa-modal-subtitle" style="margin-top:2px;">首次安装必读 · 请花30秒了解</div>
                </div>
            </div>
        `;

        // 内容：信息行列表
        const content = document.createElement('div');
        content.className = 'aa-modal-body';
        content.style.padding = '16px 20px';
        content.innerHTML = items.map(it => `
            <div style="display:flex;align-items:flex-start;gap:12px;
                        padding:12px;border:1px solid var(--aa-border-light);
                        border-radius:8px;margin-bottom:10px;background:#fff;">
                <div style="width:30px;height:30px;border-radius:8px;flex-shrink:0;
                            background:${it.bg};display:flex;align-items:center;justify-content:center;
                            font-size:14px;font-weight:800;color:${it.color};">${it.glyph}</div>
                <div style="min-width:0;">
                    <div style="font-size:13px;font-weight:700;color:#333;margin-bottom:3px;">${it.title}</div>
                    <div style="font-size:12px;line-height:1.6;color:var(--aa-text-body);">${it.desc}</div>
                </div>
            </div>
        `).join('');

        // 底部：OCS 描边按钮（与面板一致）
        const footer = document.createElement('div');
        footer.className = 'aa-modal-footer';
        footer.style.padding = '12px 20px 20px';

        const hideBtn = document.createElement('button');
        hideBtn.textContent = '不再显示';
        hideBtn.className = 'btn btn-outline';
        hideBtn.onclick = () => {
            if (observer) observer.disconnect();
            GM_setValue('smart_answer_assistant_hide_notice', true);
            overlay.remove();
        };

        const confirmBtn = document.createElement('button');
        confirmBtn.textContent = '我已知悉';
        confirmBtn.className = 'btn btn-primary';
        confirmBtn.onclick = () => {
            if (observer) observer.disconnect();
            overlay.remove();
        };

        footer.appendChild(hideBtn);
        footer.appendChild(confirmBtn);

        dialog.appendChild(banner);
        dialog.appendChild(header);
        dialog.appendChild(content);
        dialog.appendChild(footer);
        overlay.appendChild(dialog);

        document.body.appendChild(overlay);
        confirmBtn.focus();

        // 防止通过删除元素绕过
        let observer = null;
        observer = new MutationObserver(() => {
            if (!document.getElementById('aa-notice-overlay')) {
                observer.disconnect();
                showUsageNotice();
            }
        });
        observer.observe(document.body, { childList: true, subtree: false });
    }

    // 视频刷课模块
    // 不污染state结构，挂在自己的命名空间 _STUDY 下
    // 功能：反鼠标检测 / 倍速 / 音量 / 自动播放(解除暂停) / 任务点跳转 / 视频连播 / 关弹窗
    const _STUDY = {
        running: false,           // 刷课总开关
        intervalId: null,         // 主循环setInterval id
        appliedVideos: new WeakSet(),  // 已应用过倍速/音量的video元素
        lastJumpAt: 0,            // 上次跳任务点时间戳（防抖）
        lastUnpauseAt: 0,         // 上次自动播放时间戳（防抖）
        lastCloseAt: 0,           // 上次关弹窗时间戳（防抖）
        faceNotified: false,      // 人脸识别已提示（30秒内不再提示）
        errorNotified: false,     // 视频加载失败已提示
        currentMainVideo: null,   // 当前正在播放的主视频，避免多视频来回跳
        // 用户手动点过的视频任务点（2026-09 新增）：
        // 同一小节多个未完成视频按顺序播放时，用户点了后面某个视频，
        // 自动播放逻辑必须尊重这个选择（优先播它，播完再回到顺序模式），
        // 否则会和"从第一个未完成开始播"的顺序逻辑互相抢播、来回切换
        userPickedJobid: null,
        userPickedAt: 0,
        // 多视频顺序播放（2026-10-23 新增，修复"多个视频之间轮流播放 / 漏视频"）
        mediaSeq: [],          // 本小节的视频任务点队列（按任务点顺序）
        mediaSeqIndex: 0,     // 队列指针：播完一个才前进，只进不退
        lastPlayedMedia: null, // 队列指针用：最近播完的那个视频
        targetMedia: null,    // 当前唯一受保护的"目标视频"
        quizCheckedAt: 0,         // 上次检测题目任务点时间戳
        quizProcessing: false,    // 是否正在处理题目任务点
        stop() {
            if (this.intervalId) {
                clearInterval(this.intervalId);
                this.intervalId = null;
            }
            this.running = false;
            // 同步通知所有 iframe 里的刷课 worker 停止
            try { writeWorkerCfg(false); } catch (e) {}
            if (typeof addLog === 'function') {
                addLog('刷课: 已停止', 'info');
            }
            if (typeof showToast === 'function') {
                showToast('刷课已停止', 'info');
            }
        }
    };

    const STUDY_CHAPTER_NAV_SELECTOR = [
        '[onclick^="getTeacherAjax"]',
        '.posCatalog_select',
        '.posCatalog_item',
        '.chapter_item',
        '.chapter-item',
        '.catalog_item',
        '.catalog-item',
        '.task-item',
        '.task_item',
        '.lesson-item',
        '.lesson_item',
        '.point-item',
        '.point_item',
        'li[data-chapter-id]',
        'li[data-task-id]'
    ].join(', ');

    function findStudyChapterNavNode(target) {
        if (!target || typeof target.closest !== 'function') return null;
        if (target.closest('#answer-assistant-panel')) return null;
        return target.closest(STUDY_CHAPTER_NAV_SELECTOR);
    }

    function scheduleForceJumpToFirstUnfinished(reason) {
        if (!state.settings || state.settings.studyAutoNext === false) return;
        if (state.settings.studyAlwaysStartFromEarliest === false) return;

        try {
            if (_STUDY._forceJumpTimers) {
                _STUDY._forceJumpTimers.forEach(t => { try { clearTimeout(t); } catch (e) {} });
            }
        } catch (e) {}
        _STUDY._forceJumpTimers = [];

        const plans = [
            { delay: 1200, silent: false },
            { delay: 2800, silent: true },
            { delay: 4500, silent: true }
        ];

        plans.forEach(plan => {
            const timer = setTimeout(() => {
                if (!_STUDY.running) return;
                if (!state.settings || state.settings.studyAlwaysStartFromEarliest === false) return;
                try {
                    tryJumpToFirstUnfinished(plan.silent, true, reason);
                } catch (e) {}
            }, plan.delay);
            _STUDY._forceJumpTimers.push(timer);
        });
    }

    // 用户手动选择章节的"尊重窗口"（2026-09 修复）
    // 问题：学生study页目录里用户点击一个任务点 → 整页刷新（URL chapterId 变化）→
    //      AutoStart 重新触发 startStudy → 2s/5s 定时 tryJumpToFirstUnfinished 又把页面
    //      拽回"最早未完成章节" → 用户再点 → 再拽回 → A←→B 来回跳，触发人机验证。
    // 方案：点击章节导航时记录"用户选择时间"（写 sessionStorage 跨刷新保留），
    //      90 秒窗口内抑制一切"主动跳回最早未完成"，但视频播完后的顺序推进不受影响。
    const STUDY_USER_SELECT_KEY = 'study_user_selected_ts';
    function markUserChapterSelection() {
        _STUDY._userSelectedAt = Date.now();
        try { sessionStorage.setItem(STUDY_USER_SELECT_KEY, String(Date.now())); } catch (e) {}
    }
    function hasRecentUserSelection() {
        let t = _STUDY._userSelectedAt || 0;
        try {
            const s = Number(sessionStorage.getItem(STUDY_USER_SELECT_KEY)) || 0;
            if (s > t) t = s;
        } catch (e) {}
        return t > 0 && (Date.now() - t) < 90 * 1000;
    }

    function setupStudyChapterClickWatcher() {
        if (_STUDY._chapterClickWatcherBound) return;
        _STUDY._chapterClickWatcherBound = true;
        _STUDY._chapterClickHandler = (event) => {
            if (!_STUDY.running) return;
            // 用户手动点章节 = 主动选择（OCS/超新都不强制拉回）。
            // 原实现只打日志不记录，刷新后 2s/5s 定时跳转仍会把用户自选章节拽回，
            // 导致"点了未刷完的后面的就来回跳"——现在真正记录选择时间，窗口内不再主动拉回。
            const navNode = findStudyChapterNavNode(event.target);
            if (navNode) {
                markUserChapterSelection();
                if (typeof addLog === 'function') {
                    addLog('刷课: 检测到手动切换章节，尊重手动选择（90秒内不强制跳回最早未完成）', 'info');
                }
            }
        };
        document.addEventListener('click', _STUDY._chapterClickHandler, true);
    }

    // 找当前页面（包括iframe）所有<video>元素
    // 参考历史脚本的简洁实现：不过度设计，不按面积/优先级排序
    // 只做可见性过滤 + 去重
    function isVisibleMedia(el) {
        if (!el) return false;
        try {
            const r = el.getBoundingClientRect();
            if (!r || (r.width < 2 && r.height < 2)) return false;
            const style = el.ownerDocument && el.ownerDocument.defaultView
                ? el.ownerDocument.defaultView.getComputedStyle(el) : null;
            if (style && (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) === 0)) {
                return false;
            }
            return true;
        } catch (e) { return true; }
    }

    function findAllVideos() {
        const videos = [];
        const seen = new Set();
        // 注意：不使用 #video, #audio, #video-box 等容器选择器
        // 因为在超星中 #video 是 <div> 容器，不是 <video> 元素
        // div 没有 .paused/.ended/.play()，会导致 anyPlaying 误判为 true
        // 参考 OCS：用 #video,#audio 找容器（判断任务类型），用 video,audio 找真正的媒体元素
        const selectors = [
            'video', 'audio',
            '.vjs-tech',
            '.xgplayer video', '.xgplayer audio'
        ];
        const scan = (doc) => {
            if (!doc) return;
            try {
                for (const sel of selectors) {
                    try {
                        const vs = doc.querySelectorAll(sel);
                        for (const v of vs) {
                            // 只接受真正的媒体元素（有 play 方法）
                            if (typeof v.play !== 'function') continue;
                            if (!seen.has(v) && isVisibleMedia(v)) {
                                seen.add(v);
                                videos.push(v);
                            }
                        }
                    } catch (e) {}
                }
            } catch (e) {}
            const iframes = doc.querySelectorAll('iframe');
            for (const f of iframes) {
                try {
                    const cw = f.contentWindow;
                    if (cw && cw.document) scan(cw.document);
                } catch (e) {}
            }
        };
        scan(document);
        try { if (window.top && window.top.document && window.top.document !== document) scan(window.top.document); } catch(e) {}
        try { if (window.unsafeWindow && window.unsafeWindow.document) scan(window.unsafeWindow.document); } catch(e) {}
        return videos;
    }

    // 判断 video 是否有有效播放源
    // 超星用 video.js 动态加载，src 可能为空但 currentSrc 有 blob URL
    function hasVideoSource(v) {
        try {
            if (v.src && v.src.length > 0) return true;
            if (v.currentSrc && v.currentSrc.length > 0) return true;
            if (v.querySelector('source[src]')) return true;
        } catch(e) {}
        return false;
    }

    // 给一个video应用倍速+音量（如果已应用过就跳过）
    // 已应用过的视频仍会做"倍速漂移修正"：播放器切清晰度/换源时会重置 playbackRate，
    // 不修正的话倍速会悄悄变回 1x（OCS 同款问题的处理方式）
    function applyOneVideo(v, rate, vol) {
        if (!v) return false;
        if (_STUDY.appliedVideos.has(v)) {
            try {
                if (rate > 1 && Math.abs((v.playbackRate || 1) - rate) > 0.01) {
                    v.playbackRate = rate;
                }
            } catch (e) {}
            return false;
        }
        try {
            v.playbackRate = rate;
            v.volume = vol;
            // 静音
            v.muted = (vol === 0);
        } catch (e) {
            return false;
        }
        _STUDY.appliedVideos.add(v);
        return true;
    }

    // 立即应用倍速+音量到所有视频（供"立即应用倍速"按钮调用）
    // force=true 时清空"已应用"记录，让已应用过的视频也按新倍速重新应用
    function applyStudyRate(rate, vol, force = false) {
        const s = state && state.settings ? state.settings : null;
        if (s) {
            s.studyRate = rate;
            s.studyVolume = vol;
        }
        // 同步倍速/音量到 iframe worker（内部有变更检测，不会每秒写存储）
        try { writeWorkerCfg(_STUDY.running); } catch (e) {}
        if (force) _STUDY.appliedVideos = new WeakSet();
        const videos = findAllVideos();
        let applied = 0;
        for (const v of videos) {
            if (applyOneVideo(v, rate, vol)) applied++;
        }
        return applied;
    }

    // 包装器：调用 play()，捕获 autoplay policy 错误，提示用户
    // 播放视频
    // 浏览器拒绝 play() 的常见原因：用户没在画面交互过（chrome autoplay policy）
    function playWithErrorHandler(video) {
        try {
            const wasMuted = video.muted;
            video.muted = true; // muted 才能绕过 autoplay policy
            const p = video.play();
            if (p && typeof p.then === 'function') {
                return p.then(() => {
                    if (state.settings.studyVolume > 0) video.muted = wasMuted;
                    return true;
                }).catch((err) => {
                    video.muted = wasMuted;
                    const msg = String(err && err.message || err);
                    if (msg.includes("didn't interact with the document") ||
                        msg.includes("user gesture") ||
                        msg.includes("NotAllowedError")) {
                        if (typeof addLog === 'function') {
                            addLog('刷课: 浏览器拒绝自动播放 - 请手动点一下视频', 'warn');
                        }
                        if (typeof showToast === 'function') {
                            showToast('请点一下视频激活', 'warn');
                        }
                    } else if (msg.includes('no supported sources')) {
                        if (typeof addLog === 'function') {
                            addLog('刷课: 视频无法播放（格式/网络）', 'warn');
                        }
                    } else {
                        if (typeof addLog === 'function') {
                            addLog('刷课: play()失败 - ' + msg, 'warn');
                        }
                    }
                    return false;
                });
            }
            return Promise.resolve(true);
        } catch (e) {
            return Promise.resolve(false);
        }
    }

    // 检测视频加载失败的弹窗（vjs-modal-dialog-content）
    // 视频错误弹窗匹配
    function checkVideoLoadError() {
        const errorTexts = ['视频文件损坏', '网络错误导致视频下载中途失败', '视频因格式不支持', '网络的问题无法加载'];
        const dialog = document.querySelector('.vjs-modal-dialog-content');
        if (dialog && errorTexts.some(t => dialog.innerText && dialog.innerText.includes(t))) {
            if (!_STUDY.errorNotified) {
                _STUDY.errorNotified = true;
                if (typeof addLog === 'function') {
                    addLog('刷课: 视频加载失败（' + (dialog.innerText || '').trim() + '），3秒后跳下一节', 'warn');
                }
                // 3秒后让 tryAutoJumpTask 接管
                setTimeout(() => {
                    _STUDY.errorNotified = false;
                    if (typeof tryAutoJumpTask === 'function') tryAutoJumpTask();
                }, 3000);
            }
        }
    }

    // 检测人脸识别
    function checkFaceRecognition() {
        if (_STUDY.faceNotified) return;
        try {
            // 老版本：#fcqrimg 有 src
            const faces = document.querySelectorAll('#fcqrimg');
            for (const f of faces) {
                if (f.getAttribute('src')) {
                    _STUDY.faceNotified = true;
                    if (typeof addLog === 'function') {
                        addLog('刷课: 检测到人脸识别，请手动识别后继续', 'warn');
                    }
                    if (typeof showToast === 'function') {
                        showToast('人脸识别：手动完成后继续', 'warn');
                    }
                    // 30秒后再允许提示
                    setTimeout(() => { _STUDY.faceNotified = false; }, 30000);
                    return;
                }
            }
            // 新版本：.chapterVideoFaceMaskDiv display !== none
            const newMasks = document.querySelectorAll('.chapterVideoFaceMaskDiv');
            for (const m of newMasks) {
                if (m.style.display !== 'none') {
                    _STUDY.faceNotified = true;
                    if (typeof addLog === 'function') {
                        addLog('刷课: ⚠️ 检测到人脸识别（新版本），请手动识别后继续', 'warn');
                    }
                    if (typeof showToast === 'function') {
                        showToast('人脸识别：手动完成后继续', 'warn');
                    }
                    setTimeout(() => { _STUDY.faceNotified = false; }, 30000);
                    return;
                }
            }
        } catch (e) {}
    }

    // 修复控制条被隐藏
    function fixControlBar() {
        try {
            const bar = document.querySelector('.vjs-control-bar');
            if (bar) bar.style.opacity = '1';
            // 超星新版控制条
            const newBar = document.querySelector('.xgplayer-controls, .xg-controls');
            if (newBar) newBar.style.opacity = '1';
        } catch (e) {}
    }

    // PPT/书籍/读章节 自动完成
    // 本地模拟翻页/等待，不调 finishJob()

    /**
     * 检测当前页面是否是"读章节"任务点（PPT/书籍/长时阅读）
     */
    function detectReadTask() {
        // ===== 全局前置检查：如果页面有可见的视频，不是阅读任务点 =====
        try {
            const videos = findAllVideos();
            for (const v of videos) {
                if (hasVideoSource(v) || !v.paused) return null;
            }
        } catch(e) {}

        // 先递归搜索 iframe 里的内容
        let iframeDoc = null;
        let iframeWin = null;
        const scanIframes = (doc) => {
            if (iframeDoc) return;
            if (!doc) return;
            const iframes = doc.querySelectorAll('iframe');
            for (const f of iframes) {
                try {
                    const cw = f.contentWindow;
                    const cd = f.contentDocument;
                    if (!cw || !cd) continue;
                    if (cd.querySelector('.swiper-container, .swiper-slide, .swiper-wrapper, .ux-pdf-reader, .ux-h5pdfreader_container, .ans-attach-online, .readPdf, .book-reader, .pdf-reader, [class*="h5pdfreader"], [class*="pdfreader"]')) {
                        iframeDoc = cd;
                        iframeWin = cw;
                        return;
                    }
                    scanIframes(cd);
                } catch (e) { /* 跨域 */ }
            }
        };
        scanIframes(document);

        // 超星：包含 .swiper-container 的iframe（PPT）
        const swiper = document.querySelector('.swiper-container, .swiper, .ux-pdf-reader') || (iframeDoc && iframeDoc.querySelector('.swiper-container, .swiper, .ux-pdf-reader'));
        if (swiper) {
            // 找iframe里的swiper（更稳）
            const iframes = document.querySelectorAll('iframe');
            for (const f of iframes) {
                try {
                    if (f.contentDocument && f.contentDocument.querySelector('.swiper-container, .swiper-slide, .swiper-wrapper')) {
                        return { type: 'ppt', target: f.contentDocument, win: f.contentWindow, hasSwiperNext: !!f.contentWindow.swiperNext };
                    }
                } catch (e) { /* 跨域 */ }
            }
            // 也可能swiper在顶层
            if (document.querySelector('.swiper-container')) {
                return { type: 'ppt', target: document, win: window, hasSwiperNext: !!window.swiperNext };
            }
        }

        // 超星：阅读任务点（readsvr/book/mooc 页面 / H5 PDF 阅读器 / 在线附件）
        const hasReadEl = document.querySelector('.ans-attach-online, .readPdf, .book-reader, .ux-pdf-reader, .ux-h5pdfreader_container, .pdf-reader, [class*="h5pdfreader"], [class*="pdfreader"]') ||
                          (iframeDoc && iframeDoc.querySelector('.ans-attach-online, .readPdf, .book-reader, .ux-pdf-reader, .ux-h5pdfreader_container, .pdf-reader, [class*="h5pdfreader"], [class*="pdfreader"]'));
        if (location.pathname.includes('/readsvr/book/mooc') ||
            location.href.includes('readsvr') ||
            hasReadEl) {
            return { type: 'read', target: iframeDoc || document, win: iframeWin || window, hasSwiperNext: false };
        }

        // 超星：长时阅读任务点（含 timing 参数的iframe）
        const timeIframes = document.querySelectorAll('iframe[src*="timing="]');
        for (const f of timeIframes) {
            let timing = 60;
            try { timing = parseInt(new URL(f.src).searchParams.get('timing') || '60'); } catch (e) {}
            return { type: 'timereader', target: document, win: window, iframe: f, timing };
        }

        // 智慧树：读书模块
        if (location.hostname.includes('zhihuishu.com') &&
            (document.querySelector('.reader-container, .read-page, .book-content, .pdf-reader'))) {
            return { type: 'read', target: document, win: window, hasSwiperNext: false };
        }

        // 智慧职教：PPT/书籍
        if (location.hostname.includes('icve.com.cn') &&
            (document.querySelector('.docBox, .ppt-content, .pdf-viewer, .reader'))) {
            return { type: 'read', target: document, win: window, hasSwiperNext: false };
        }

        return null;
    }

    /**
     * 执行"读章节"任务点
     * - PPT 模式：调 swiperNext 翻完所有页 + audio.muted
     * - read 模式：等待 3 秒（用户说本地不提交后端）
     * - timereader 模式：等待 timing 秒
     */
    async function runReadTask(task) {
        if (typeof addLog === 'function') {
            addLog(`刷课: 检测到读章节任务点（${task.type}）`, 'info');
        }
        if (task.type === 'ppt') {
            // 静音所有 audio
            try {
                task.target.querySelectorAll('audio').forEach(a => { try { a.muted = true; } catch (e) {} });
            } catch (e) {}
            // 找总页数
            let total = 0;
            try {
                total = task.target.querySelectorAll('.swiper-container .swiper-slide').length;
            } catch (e) {}
            if (total === 0) {
                // 兜底：取 .swiper-slide
                try { total = task.target.querySelectorAll('.swiper-slide').length; } catch (e) {}
            }
            if (typeof addLog === 'function') {
                addLog(`刷课: PPT/书籍共 ${total} 页，开始自动翻页`, 'info');
            }
            const delay = (state.settings && state.settings.readSpeed ? state.settings.readSpeed : 1) * 1000;
            for (let i = 0; i < total; i++) {
                try {
                    if (task.win && typeof task.win.swiperNext === 'function') {
                        task.win.swiperNext();
                    } else {
                        // 兜底：找下一页按钮
                        const nextBtn = task.target.querySelector('.swiper-button-next, .arrow-right, .next, .next-page, .page-next');
                        if (nextBtn) nextBtn.click();
                    }
                } catch (e) {}
                await new Promise(r => setTimeout(r, delay));
            }
            await new Promise(r => setTimeout(r, 3000));
            if (typeof addLog === 'function') {
                addLog('刷课: PPT/书籍翻页完成', 'success');
            }
            return true;
        } else if (task.type === 'timereader') {
            const t = task.timing || 60;
            const total = (t + 3) * 3;
            if (typeof addLog === 'function') {
                addLog(`刷课: 长时阅读任务，预计等待 ${total} 秒`, 'info');
            }
            showToast && showToast(`长时阅读：${total}秒后完成`, 'info');
            await new Promise(r => setTimeout(r, total * 1000));
            if (typeof addLog === 'function') {
                addLog('刷课: 长时阅读完成', 'success');
            }
            return true;
        } else if (task.type === 'read') {
            // 普通阅读/PDF/PPT任务：优先调用页面里的 finishJob，其次自动滚动
            if (typeof addLog === 'function') {
                addLog('刷课: 阅读/PDF任务开始处理', 'info');
            }

            // 1. 尝试调用 iframe / 顶层 window 的 finishJob（超星等平台的完成钩子）
            let finishCalled = false;
            const tryFinishJob = (win) => {
                try {
                    if (win && typeof win.finishJob === 'function') {
                        win.finishJob();
                        return true;
                    }
                } catch (e) {}
                return false;
            };
            if (task.win && tryFinishJob(task.win)) {
                finishCalled = true;
                if (typeof addLog === 'function') addLog('刷课: 已调用 finishJob 标记阅读完成', 'success');
            } else {
                const iframes = document.querySelectorAll('iframe');
                for (const f of iframes) {
                    try {
                        if (f.contentWindow && tryFinishJob(f.contentWindow)) {
                            finishCalled = true;
                            if (typeof addLog === 'function') addLog('刷课: 已在 iframe 中调用 finishJob', 'success');
                            break;
                        }
                    } catch (e) {}
                }
            }

            // 2. 没有 finishJob 或调用失败，则自动滚动到底并停留
            if (!finishCalled) {
                if (typeof addLog === 'function') {
                    addLog('刷课: 未找到 finishJob，将自动滚动阅读', 'info');
                }
                const scrollTarget = task.target || document.documentElement;
                const scrollStep = Math.max(200, Math.floor((scrollTarget.scrollHeight || 1000) / 10));
                for (let i = 0; i < 10; i++) {
                    try {
                        scrollTarget.scrollTo({ top: scrollStep * (i + 1), behavior: 'smooth' });
                    } catch (e) {}
                    await new Promise(r => setTimeout(r, 800));
                }
            }

            await new Promise(r => setTimeout(r, 3000));
            return true;
        }
        return false;
    }

    // 状态：避免重复处理同一个读章节任务
    let _readTaskRunning = false;
    let _readTaskDone = false;

    /**
     * 检测当前页面是否是"音频/听力"任务点（mp3等纯音频播放）
     * 参考实现：熊猫超星助手(iframe[src*="/audio/index.html"])、
     *           OCS(iframe.src.includes("content_audio.action") + waitForMedia audio)
     *
     * 修复：原方法C（hasVjsAudioBar）存在严重假阳性——
     *   视频页面中 iframe 内的 .vjs-control-bar 可能被检测到，
     *   而 <video> 在其他作用域/嵌套层级，导致纯视频页面被误判为音频任务点。
     *
     *   新策略：
     *   1) 方法C 必须同时满足：<audio>有真实src OR iframe src 含音频路径
     *   2) 全局互斥检查：如果页面存在可见的 <video>（且非微小占位），不判定为音频
     *   3) findAudioEl 超时后立即标记完成，不再进入重试死循环
     */
    function detectAudioTask() {
        // ===== 全局前置检查：如果页面有可见的视频，不是音频任务点 =====
        // 使用 findAllVideos() 而非 document.querySelectorAll('video')，
        // 因为 findAllVideos 会递归扫描 iframe/top/unsafeWindow
        try {
            const videos = findAllVideos();
            for (const v of videos) {
                // 有 src、currentSrc（video.js 动态设置的 blob URL）、或 source 子元素 → 真实视频
                if (v.src || v.currentSrc || v.querySelector('source[src]')) return null;
                // 正在播放 → 肯定是视频任务点
                if (!v.paused && !v.ended) return null;
            }
        } catch(e) {}

        // ===== 任务类型核对（真机验证后新增）：只有当前小节确实存在未完成的
        // insertaudio 任务，才认作音频任务点。页面上常驻游离的 <audio> 元素
        // （视频播放器伴生/平台预加载），之前会导致视频播放时反复误报
        // "音频播放重试/失败/超时"，日志被刷屏
        try {
            const atts = getChaoxingAttachments();
            if (atts && atts.length > 0) {
                const hasUnfinishedAudio = atts.some(a => a && a.property && a.property.module === 'insertaudio' && a.job);
                if (!hasUnfinishedAudio) return null;
            }
        } catch (e) {}

        // 1) 顶层或 iframe 中有可见的 <audio> 元素（且有 src，未结束）
        const scanAudio = (doc) => {
            if (!doc) return null;
            try {
                const audios = doc.querySelectorAll('audio');
                for (const a of audios) {
                    if (!hasVideoSource(a)) continue; // 无有效播放源（"no supported sources" 报错的元凶）
                    const r = a.getBoundingClientRect();
                    if (r.width < 2 && r.height < 2) continue; // 不可见
                    const style = doc.defaultView ? doc.defaultView.getComputedStyle(a) : null;
                    if (style && (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) === 0)) continue;
                    return { type: 'audio', element: a, target: doc, win: doc.defaultView };
                }
            } catch (e) {}
            return null;
        };

        // 先检查顶层
        let result = scanAudio(document);
        if (result) return result;

        // 再递归 iframe（同源）
        const iframes = document.querySelectorAll('iframe');
        for (const f of iframes) {
            try {
                const cw = f.contentWindow;
                const cd = f.contentDocument;
                if (!cw || !cd) continue;
                // 方式A: iframe 内有 <audio> 元素
                result = scanAudio(cd);
                if (result) return result;

                // 方式B: iframe src 包含音频路径（熊猫超星 /audio/index.html、OCS content_audio.action）
                const src = f.getAttribute('src') || '';
                if (src.includes('/audio/index.html') || src.includes('content_audio.action')) {
                    // iframe 本身就是音频容器，返回 iframe 信息，让 handle 去内部找 audio/playBtn
                    return { type: 'audio-iframe', iframe: f, target: cd, win: cw, src: src };
                }

                // 方式C（已加强）：iframe 内有音频播放器 UI
                // 原逻辑仅靠 ".vjs-control-bar 存在 且无 video" 就判定为音频，假阳性高
                // 新要求：必须同时满足以下至少一项强证据
                //   a) <audio> 元素有真实的 src（length > 10，排除 about:blank 等）
                //   b) iframe 的 src 本身包含 audio 关键字
                //   c) 页面 DOM 中存在明确的音频标识（#audio 容器）
                const audioEl = cd.querySelector('audio');
                const hasAudioSrc = audioEl && (
                    (audioEl.src && audioEl.src.length > 10 && !audioEl.src.startsWith('about:') && !audioEl.src.startsWith('blob:dummy'))
                    || audioEl.querySelector('source[src]')
                );
                const iframeSrcHasAudio = (f.getAttribute('src') || '').includes('audio');
                const hasAudioContainer = !!cd.querySelector('#audio, [id*="audio_player"], [class*="audio-player"]');
                const hasVjsAudioBar = cd.querySelector('.vjs-control-bar') && !cd.querySelector('video');

                // 必须有强证据（有src的audio元素 或 音频路径 或 音频容器）+ 可选的 UI 特征
                if ((hasAudioSrc || iframeSrcHasAudio || hasAudioContainer) && hasVjsAudioBar) {
                    return { type: 'audio-ui', iframe: f, target: cd, win: cw };
                }

                // 单独有有 src 的 audio 元素（即使没有 vjs 控制条）也算
                if (hasAudioSrc) {
                    return { type: 'audio', element: audioEl, target: cd, win: cw };
                }
            } catch (e) { /* 跨域 */ }
        }

        // 4) 顶层直接有音频播放器特征（不在 iframe 里的情况）
        // 超星有时把音频播放器直接嵌在主页面
        // 同样需要全局视频互斥（已在函数开头处理）
        if (document.querySelector('audio')) {
            const audios = document.querySelectorAll('audio');
            for (const a of audios) {
                const src = a.src || '';
                const hasSource = a.querySelector('source[src]');
                if ((src.length > 10 && !src.startsWith('about:') && !src.startsWith('blob:dummy')) || hasSource) {
                    const r = a.getBoundingClientRect();
                    if (r.width >= 2 && r.height >= 2) {
                        return { type: 'audio', element: a, target: document, win: window };
                    }
                }
            }
        }

        return null;
    }

    /**
     * 执行音频/听力任务点：自动播放 → 等待播完 → 完成
     * 策略（参考 OCS waitForMedia + playMedia + 熊猫 hookAudio）：
     *   - 找到 audio 元素 / 点击播放按钮
     *   - 静音 + 设倍速
     *   - 监听 ended 事件，完成后触发跳转
     */
    async function runAudioTask(task) {
        if (typeof addLog === 'function') {
            addLog(`刷课: 检测到音频/听力任务点（${task.type}）`, 'info');
        }

        const rate = (state.settings && state.settings.studyRate) || 1.5;
        const vol = (state.settings && state.settings.studyVolume) || 0;

        // ============================================================
        //  辅助：在指定 doc 中查找 audio 元素（等待 src 真正就绪）
        //  根因修复：
        //    超星用 videojs 管理 audio 元素，<audio> 存在但 src 由 videojs 动态设置。
        //    如果在 videojs 初始化前调用 audio.play() → "The element has no supported sources"
        //
        //  参考 OCS waitForMedia（job.ts）:
        //    - 每200ms轮询，选择器 "#video,#audio" 或 "video,audio"
        //    - 过滤条件: m.src.length !== 0 （必须等 src 被设置）
        //    - 超时: timeoutMs（默认10秒）
        //
        //  参考 ABC超星助手:
        //    - 使用 videojs player API: player.play() / player.src()
        //    - 监听 player.on("play") / player.on("pause")
        // ============================================================
        const findAudioEl = (doc, timeoutMs = 15000) => {
            return new Promise((resolve) => {
                const start = Date.now();
                let lastWarnTime = 0;
                const interval = setInterval(() => {
                    const elapsed = Date.now() - start;
                    try {
                        // 策略1: 直接找 <audio> 元素（检查 src 是否已赋值）
                        const audios = doc.querySelectorAll('audio');
                        for (const el of audios) {
                            // 必须有真实的 src（非空、非 about:blank、非 blob: 开头的空 blob）
                            const src = el.src || '';
                            const hasSource = el.querySelector('source');
                            if ((src && src.length > 10 && !src.startsWith('about:') && !src.startsWith('blob:dummy')) || hasSource) {
                                clearInterval(interval);
                                resolve(el);
                                return;
                            }
                        }
                        // 策略2: 通过 videojs 容器查找（超星的 audio 播放器通常在 #audio 容器内）
                        const container = doc.querySelector('#audio, #video, [id*="audio_player"], [class*="audio-player"]');
                        if (container) {
                            const innerAudio = container.querySelector('audio');
                            if (innerAudio) {
                                const src = innerAudio.src || '';
                                if (src.length > 10 || innerAudio.querySelector('source')) {
                                    clearInterval(interval);
                                    resolve(innerAudio);
                                    return;
                                }
                            }
                        }
                    } catch (e) {}

                    // 每3秒日志一次（避免刷屏）
                    if (elapsed - lastWarnTime > 3000 && typeof addLog === 'function') {
                        addLog(`刷课: 等待音频元素加载 src... (${Math.floor(elapsed/1000)}s/${Math.floor(timeoutMs/1000)}s)`, 'info');
                        lastWarnTime = elapsed;
                    }

                    if (elapsed > timeoutMs) {
                        clearInterval(interval);
                        resolve(null);
                    }
                }, 200); // OCS 用 200ms 间隔
            });
        };

        // ============================================================
        //  辅助：等待媒体数据加载到可播放状态
        //  在调用 play() 前确保浏览器已经解析了足够的媒体数据
        //  参考 HTML5 规范: canplay 事件表示可以开始播放了
        // ============================================================
        const waitForCanPlay = (el, timeoutMs = 10000) => {
            return new Promise((resolve) => {
                // 如果已经有足够的数据，直接返回
                if (el.readyState >= 2) { // HAVE_CURRENT_DATA
                    resolve(true);
                    return;
                }
                const timer = setTimeout(() => {
                    cleanup();
                    resolve(false); // 超时
                }, timeoutMs);

                const onCanPlay = () => { cleanup(); resolve(true); };
                const onError = () => { cleanup(); resolve(false); };
                const cleanup = () => {
                    clearTimeout(timer);
                    try { el.removeEventListener('canplay', onCanPlay); } catch(e) {}
                    try { el.removeEventListener('error', onError); } catch(e) {}
                };

                el.addEventListener('canplay', onCanPlay);
                el.addEventListener('error', onError);

                // 同时尝试触发 load()（如果 src 已设置但还没加载）
                try { el.load(); } catch(e) {}
            });
        };

        // ============================================================
        //  辅助：带重试的播放函数
        //  处理 "The element has no supported sources" 错误
        //  这个错误意味着 videojs 还没给 <audio> 设置 src
        //  解决方案：等待后重试，最多 retryCount 次
        // ============================================================
        const playWithRetry = async (audioEl, taskDoc, maxRetries = 3) => {
            for (let attempt = 0; attempt <= maxRetries; attempt++) {
                if (attempt > 0) {
                    // 重试前等待（递增延迟：1s, 1.5s, 2s, 2.5s...）
                    const delay = 800 + attempt * 400;
                    await new Promise(r => setTimeout(r, delay));
                    if (typeof addLog === 'function') {
                        addLog(`刷课: 音频播放重试 ${attempt}/${maxRetries}...`, 'warn');
                    }
                    // 重新获取 audio 元素（可能被 videojs 替换了）
                    const freshAudio = taskDoc.querySelector('audio');
                    if (freshAudio && (freshAudio.src || freshAudio.querySelector('source'))) {
                        audioEl = freshAudio;
                    }
                }

                try {
                    // 先检查 src 是否存在
                    if (!audioEl.src && !audioEl.querySelector('source')) {
                        throw new Error('NO_SRC');
                    }

                    // 等待媒体可播放
                    const ready = await waitForCanPlay(audioEl, 5000);
                    if (!ready && attempt < maxRetries) {
                        continue; // 还没准备好，继续重试
                    }

                    // 尝试播放
                    const result = audioEl.play();
                    if (result && typeof result.catch === 'function') {
                        await result;
                    }
                    // 成功！
                    audioEl.playbackRate = rate;
                    if (typeof addLog === 'function') {
                        addLog(`刷课: 音频开始播放（${rate}x / 时长${Math.floor(audioEl.duration || 0)}秒）`, 'info');
                    }
                    return true;

                } catch (err) {
                    const msg = String(err && err.message || err);
                    // 针对不同错误的处理策略
                    if (msg.includes('no supported sources') || msg.includes('NotSupportedError') || msg === 'NO_SRC') {
                        // src 未就绪 → 继续重试
                        if (attempt >= maxRetries) {
                            if (typeof addLog === 'function') {
                                addLog(`刷课: 音频播放失败 - ${msg}（已重试${maxRetries}次，可能平台未正常加载音频资源）`, 'warn');
                            }
                            return false;
                        }
                        continue;
                    }
                    if (msg.includes("didn't interact") || msg.includes("user gesture") || msg.includes("NotAllowedError")) {
                        // autoplay policy → 点击播放按钮
                        if (typeof addLog === 'function') {
                            addLog('刷课: 音频被浏览器自动播放策略拦截，尝试点击播放按钮...', 'warn');
                        }
                        clickPlayBtn(taskDoc);
                        await new Promise(r => setTimeout(r, 500));
                        try { audioEl.play().catch(() => {}); audioEl.playbackRate = rate; } catch(e) {}
                        return true;
                    }
                    // 其他错误
                    if (attempt >= maxRetries) {
                        if (typeof addLog === 'function') {
                            addLog(`刷课: 音频播放失败 - ${msg}`, 'warn');
                        }
                        return false;
                    }
                }
            }
            return false;
        };

        // 辅助：尝试点击播放按钮（UI 层面）
        const clickPlayBtn = (doc) => {
            const candidates = [
                '.vjs-big-play-button',
                '.vjs-play-control',
                '[class*="play-btn"]',
                '[class*="playBtn"]',
                '[class*="play-button"]',
                '.xgplayer-play',
                '.jw-play',
                'button[aria-label*="播放"]',
                'button[title*="播放"]'
            ];
            for (const sel of candidates) {
                try {
                    const btn = doc.querySelector(sel);
                    if (btn) {
                        const r = btn.getBoundingClientRect();
                        if (r.width > 0 && r.height > 0) {
                            btn.click();
                            return true;
                        }
                    }
                } catch (e) {}
            }
            return false;
        };

        let audioEl = null;

        // ===== 根据 task.type 分支处理 =====
        if (task.type === 'audio' && task.element) {
            audioEl = task.element;
        } else {
            // 等待 audio 元素的 src 被 videojs 设置（最长15秒）
            audioEl = await findAudioEl(task.target);
        }

        if (!audioEl) {
            if (typeof addLog === 'function') {
                addLog('刷课: 音频任务点未找到可用 audio 元素（可能页面无音频内容），跳过', 'warn');
            }
            // 关键修复：标记完成，防止每秒重新进入 runAudioTask 导致死循环重试
            _audioTaskDone = true;
            return;
        }

        // ===== 对 audio 元素进行操作 =====
        // 参考 OCS JobRunner.media (line 19023-19099):
        //   1. media.volume = volume2          → volume=0（不用 muted，避免 videojs 冲突）
        //   2. media.currentTime = 0           → 从头开始
        //   3. media.addEventListener("pause", playFunction)  → 暂停时自动恢复（最关键！）
        //   4. media.addEventListener("ended", resolve)
        //   5. setTimeout(() => playMedia(() => media.play()), 200)  → 延迟200ms播放
        try {
            audioEl.volume = 0;
            try { audioEl.currentTime = 0; } catch (e) {}

            // 暂停恢复函数（OCS 核心：对抗平台自动暂停）
            const playFunction = async () => {
                if (audioEl.ended === false) {
                    await new Promise(r => setTimeout(r, 1000));
                    try { audioEl.play(); audioEl.playbackRate = rate; } catch (e) {}
                }
            };
            audioEl.addEventListener('pause', playFunction);

            // 主流程：带重试的播放
            const playOk = await playWithRetry(audioEl, task.target);

            if (!playOk) {
                // 所有重试都失败了 → 兜底：点击 UI 播放按钮
                clickPlayBtn(task.target);
                // 再等几秒看看能不能通过用户交互激活
                await new Promise(r => setTimeout(r, 3000));
                try { audioEl.play().catch(() => {}); audioEl.playbackRate = rate; } catch (e) {}
            }

            // 等待播放结束
            await new Promise((resolve) => {
                const onEnded = () => {
                    cleanup();
                    resolve();
                };
                const cleanup = () => {
                    try { audioEl.removeEventListener('ended', onEnded); } catch (e) {}
                    try { audioEl.removeEventListener('pause', playFunction); } catch (e) {}
                    clearTimeout(timer);
                    clearTimeout(checkTimer);
                };

                const duration = audioEl.duration || 0;
                const waitMs = Math.min((duration * 1000 / rate) + 30000, 600000);
                const timer = setTimeout(() => {
                    if (typeof addLog === 'function') {
                        addLog('刷课: 音频等待超时，视为完成', 'warn');
                    }
                    cleanup();
                    resolve();
                }, waitMs);

                audioEl.addEventListener('ended', onEnded);

                // 播放状态验证：5秒后检查 currentTime 是否变化
                let lastTime = audioEl.currentTime || 0;
                const checkTimer = setTimeout(() => {
                    const nowTime = audioEl.currentTime || 0;
                    if (Math.abs(nowTime - lastTime) < 0.1 && !audioEl.ended) {
                        if (typeof addLog === 'function') {
                            addLog('刷课: 音频进度未变化，尝试点击播放按钮...', 'warn');
                        }
                        clickPlayBtn(task.target);
                        setTimeout(() => {
                            try { audioEl.play().catch(() => {}); audioEl.playbackRate = rate; } catch (e) {}
                        }, 1000);
                    }
                }, 5000);
            });

            if (typeof addLog === 'function') {
                addLog('刷课: 音频播放完成', 'success');
            }

        } catch (e) {
            if (typeof addLog === 'function') {
                addLog(`刷课: 音频处理异常 - ${e.message || e}`, 'warn');
            }
        }
    }

    // 状态：避免重复处理同一个音频任务
    let _audioTaskRunning = false;
    let _audioTaskDone = false;

    function resetStudyTaskFlags() {
        _readTaskRunning = false;
        _readTaskDone = false;
        _audioTaskRunning = false;
        _audioTaskDone = false;
        _discussRunning = false;
        _discussDone = false;
        _discussCooldownUntil = 0;
        _discussEmptyLogged = false;
        _STUDY.quizProcessing = false;
        _STUDY.quizCheckedAt = 0;
    }

    /**
     * 音频任务主入口：被刷课主循环调用
     * 防重入：同一任务点只处理一次
     */
    function tryAudioTask() {
        if (_audioTaskRunning || _audioTaskDone) return;
        // 视频播放中不做音频任务（视频优先）——之前视频放着、音频重试日志同时刷屏就是这么来的
        try {
            const vids = findAllVideos();
            if (vids.some(v => !v.paused && !v.ended)) return;
        } catch (e) {}
        const task = detectAudioTask();
        if (!task) return;
        _audioTaskRunning = true;
        runAudioTask(task).then(() => {
            _audioTaskDone = true;
            _audioTaskRunning = false;
        }).catch(e => {
            _audioTaskRunning = false;
            if (typeof addLog === 'function') {
                addLog(`刷课: 音频任务异常 - ${e.message || e}`, 'warn');
            }
        });
    }

    /**
     * 读章节主入口：被刷课主循环调用
     * 防重入：同一任务点只处理一次
     */
    function tryReadTask() {
        if (!state.settings.studyReadTask) return;
        if (_readTaskRunning || _readTaskDone) return;
        const task = detectReadTask();
        if (!task) return;
        _readTaskRunning = true;
        runReadTask(task).then(() => {
            _readTaskDone = true;
            _readTaskRunning = false;
        }).catch(e => {
            _readTaskRunning = false;
            if (typeof addLog === 'function') {
                addLog(`刷课: 读章节异常 - ${e.message || e}`, 'warn');
            }
        });
    }

    // 讨论自动回复

    /**
     * 检测当前页面是否是讨论/回复区
     */
    function detectDiscussTask() {
        // MOOC: /learn/forum /discuss / .j-reply-add
        if (location.hostname.includes('icourse163.org')) {
            if (document.querySelector('.j-reply-add, .j-reply-all')) {
                return { type: 'mooc', existingReplies: document.querySelectorAll('.j-reply-all .f-pr .j-content') };
            }
        }
        // 雨课堂: /v2/web/lms/.../forum + .new_discuss_list
        if (location.hostname.includes('yuketang.cn')) {
            if (location.pathname.match(/v2\/web\/lms\/.*\/forum/)) {
                const list = document.querySelector('.new_discuss_list');
                if (list) {
                    return { type: 'ykt', existingReplies: list.querySelectorAll('.cont_detail') };
                }
            }
        }
        // 超星新版讨论
        if (location.hostname.includes('chaoxing.com') || location.hostname.endsWith('edu.cn')) {
            // 通用：找讨论/回复输入框
            if (document.querySelector('.reply-area, .discussion-reply, .editor-box, [contenteditable="true"]')) {
                return { type: 'cx', existingReplies: document.querySelectorAll('.reply-item, .comment-item, .reply, .comment') };
            }
        }
        return null;
    }

    /**
     * 选出一条讨论内容
     * @param {object} task detectDiscussTask()的返回值
     * @param {string} mode 'random' | 'first' | 'lastest' | 'max-show-up' | 'max-fav'
     * @returns {string}
     */
    function pickDiscussion(task, mode) {
        const replies = Array.from(task.existingReplies || []);
        if (replies.length === 0) return '';

        if (task.type === 'mooc') {
            if (mode === 'max-show-up') {
                // 出现次数最多
                const m = new Map();
                for (const r of replies) {
                    const t = (r.textContent || '').trim();
                    if (t) m.set(t, (m.get(t) || 0) + 1);
                }
                return [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '';
            } else if (mode === 'max-fav') {
                // 最多点赞
                const list = Array.from(document.querySelectorAll('.j-reply-all .f-pr'));
                let max = 0, maxEl = null;
                for (const item of list) {
                    const num = parseInt(item.querySelector('.bar .num')?.textContent || '0');
                    if (num > max) { max = num; maxEl = item; }
                }
                return maxEl?.querySelector('.j-content')?.textContent || '';
            } else if (mode === 'lastest' || mode === 'first') {
                // 最新
                return replies[0]?.textContent?.trim() || '';
            } else if (mode === 'random') {
                return replies[Math.floor(Math.random() * replies.length)]?.textContent?.trim() || '';
            }
        } else {
            // 雨课堂 + 超星通用
            if (mode === 'first' || mode === 'lastest') {
                return replies[0]?.textContent?.trim() || '';
            } else {
                // 默认 random
                return replies[Math.floor(Math.random() * replies.length)]?.textContent?.trim() || '';
            }
        }
        return '';
    }

    /**
     * 填入文本到讨论框并点击提交
     * @param {string} text
     * @returns {boolean} 是否成功
     */
    function fillAndSubmitDiscuss(text) {
        if (!text) return false;
        // 1) 找输入框
        const inputs = [
            // MOOC
            document.querySelector('.j-reply-add div.ql-editor p, .j-reply-add .ql-editor'),
            // 雨课堂
            document.querySelector('textarea.el-textarea__inner'),
            // 超星 contenteditable
            document.querySelector('.reply-area [contenteditable="true"], .discussion-reply [contenteditable="true"], .editor-box [contenteditable="true"]'),
            // 兜底
            document.querySelector('textarea[placeholder*="回复"], textarea[placeholder*="评论"], textarea[placeholder*="讨论"]'),
            document.querySelector('textarea')
        ].filter(Boolean);
        const input = inputs[0];
        if (!input) return false;
        // 2) 填入
        if (input.tagName === 'TEXTAREA') {
            input.value = text;
            input.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
            // contenteditable
            input.innerText = text;
            input.dispatchEvent(new Event('input', { bubbles: true }));
        }
        // 3) 找提交按钮
        const submitBtns = [
            document.querySelector('.j-reply-add .editbtn, .j-reply-add .submit, .j-reply-add button'),
            document.querySelector('button.submitComment, .submit-comment, button.submit'),
            // 超星提交
            document.querySelector('.reply-area .btn-submit, .discussion-reply .btn-submit, .editor-box .btn-submit'),
            // 兜底：包含"提交"或"回复"或"发表"或"评论"的button
            Array.from(document.querySelectorAll('button, a')).find(b => {
                const t = (b.textContent || '').trim();
                return ['提交', '回复', '发表', '评论', '发送', '发布'].includes(t) ||
                       ['提交', '回复', '发表', '评论', '发送', '发布'].some(k => t.includes(k));
            })
        ].filter(Boolean);
        const submit = submitBtns[0];
        if (!submit) return false;
        try { submit.click(); return true; } catch (e) { return false; }
    }

    // 状态：避免重复处理讨论
    let _discussRunning = false;
    let _discussDone = false;
    // 冷却时间戳：没有可参考内容时，60秒内不再重复检测（避免日志刷屏）
    let _discussCooldownUntil = 0;
    // "没有可参考回复"提示只打一次，换小节后随 resetStudyTaskFlags 重置
    let _discussEmptyLogged = false;

    /**
     * 讨论自动回复主入口
     */
    function tryDiscuss() {
        if (!state.settings.studyAutoDiscuss) return;
        if (_discussRunning || _discussDone) return;
        // 冷却期内不检测（避免没有可参考内容时每秒刷日志）
        const now = Date.now();
        if (now < _discussCooldownUntil) return;
        const task = detectDiscussTask();
        if (!task) return;
        _discussRunning = true;
        const mode = state.settings.studyDiscussMode || 'random';
        if (mode === 'none' || mode === 'not-reply') {
            _discussDone = true;
            _discussRunning = false;
            if (typeof addLog === 'function') {
                addLog('刷课: 讨论自动回复已关闭', 'info');
            }
            return;
        }
        const text = pickDiscussion(task, mode);
        if (!text) {
            _discussRunning = false;
            // 设置60秒冷却，避免日志刷屏；提示只打一次，换小节后重置
            _discussCooldownUntil = Date.now() + 60000;
            if (typeof addLog === 'function' && !_discussEmptyLogged) {
                _discussEmptyLogged = true;
                addLog('刷课: 讨论区没有可参考的回复内容（60秒后静默重试）', 'warn');
            }
            return;
        }
        const ok = fillAndSubmitDiscuss(text);
        if (ok) {
            _discussDone = true;
            if (typeof addLog === 'function') {
                addLog(`刷课: 讨论已自动回复（模式: ${mode}）`, 'success');
            }
            if (typeof showToast === 'function') {
                showToast('讨论已自动回复', 'success');
            }
        }
        _discussRunning = false;
    }

    // 详细诊断：列出当前页面所有"可能的视频位置"
    // 用于"立即找不到视频"时帮用户排查（仅在主控台输出，不污染UI）
    function diagnoseVideo() {
        const s = state && state.settings ? state.settings : null;
        const rate = s ? s.studyRate : 1.5;
        const vol = s ? s.studyVolume : 0;
        const videos = findAllVideos();
        console.log('[Study诊断] 找到 video/audio 元素:', videos.length);
        if (videos.length > 0) {
            for (const v of videos) {
                console.log('  - tag:', v.tagName, 'id:', v.id, 'class:', v.className, 'src:', v.src ? v.src.slice(0, 60) : '(无)');
            }
            // 顺便应用
            for (const v of videos) {
                applyOneVideo(v, rate, vol);
            }
            if (typeof addLog === 'function') {
                addLog(`刷课诊断: 找到 ${videos.length} 个视频，已应用${rate}x`, 'success');
            }
        } else {
            // 找不到时给详细诊断
            const iframes = document.querySelectorAll('iframe');
            const ids = ['#video', '#audio', '#video-box'].map(s => {
                try {
                    return s + (document.querySelector(s) ? '✓' : '✗');
                } catch (e) { return s + '?'; }
            }).join(' ');
            if (typeof addLog === 'function') {
                addLog(`刷课诊断: 未找到视频。iframe数=${iframes.length}，顶层选择器[${ids}]`, 'warn');
            }
            console.log('[Study诊断] 当前页面 iframe 数:', iframes.length);
            for (let i = 0; i < Math.min(iframes.length, 5); i++) {
                const f = iframes[i];
                console.log('  iframe[' + i + '] src:', (f.src || '').slice(0, 80));
            }
        }
        return videos.length;
    }

    // 自动解除暂停：检测到 paused 状态就 play()
    // 关键：play()可能被浏览器autoplay policy拒绝（"user didn't interact"）
    //      解决方法：play前先设 muted=true（muted play不受限制），
    //               然后用户配置里的音量再单独设
    function tryAutoUnpause() {
        if (!state.settings.studyAutoUnpause) return;
        const now = Date.now();
        if (now - _STUDY.lastUnpauseAt < 1000) return;
        const videos = findAllVideos();
        // 已有视频在播放 → 不干预
        if (videos.some(v => !v.paused && !v.ended)) return;
        // 统一决策：用户手动点过的视频优先（2026-09 修复多视频来回抢播）；
        // 用户点的还没就绪（readyState<2）时宁可等待，也不抢播前面的视频
        try { advanceMediaSeq(); } catch (e) {}
        const pick = pickMediaToPlay(videos);
        if (!pick) return;
        const v = pick.media;
        try { markTargetMedia(v); } catch (e) {}
        if (pick.reason === 'user' && (v.readyState || 0) < 2 && !v.ended) {
            return; // 等用户点的视频缓冲好，主循环每秒会再来
        }
        if (v.ended || !v.paused || v.readyState < 2 || !hasVideoSource(v)) return;
        if (isVideoTaskDone(v) === true) return;  // 平台已完成的任务点不重播（兜底）
        _STUDY.lastUnpauseAt = now;
        playWithErrorHandler(v).then(ok => {
            if (ok && typeof addLog === 'function') {
                addLog('刷课: 视频已自动播放', 'success');
            }
        });
    }

    // ==================== 超星任务点级判定（机制以 OCS 官方源码为准） ====================
    // OCS (github.com/ocsjs/ocsjs) packages/scripts/src/projects/cx.ts 中的官方类型定义：
    //   type Attachment = {
    //     isPassed: boolean | undefined;  // 仅音视频"播放完成后"才存在
    //     job: boolean | undefined;       // 是否为未完成任务点（音视频播完后此属性消失）
    //     jobid?: string;                 // 章节测试不是任务点时没有 jobid
    //     property: { _jobid: string; module: 'insertbook'|'insertdoc'|'insertflash'|'work'|'insertaudio'|'insertvideo'; ... }
    //   }
    // 即：job=true → 未完成必做任务；job 消失 + isPassed=true → 已完成；
    //     job 消失 + isPassed 消失 → 非任务点（不用刷）。module 标明任务类型（work=习题）。
    // attachments 数组挂在知识卡片顶层页面（unsafeWindow.attachments），覆盖整章任务。
    // 卡片 iframe 的 data 属性是 JSON（含 jobid/_jobid），用于把 DOM 里的视频和任务对上号。
    function getChaoxingAttachments() {
        try {
            // 实测（2026-08 真机验证）：attachments 数组挂在 knowledge/cards 子 iframe 的
            // window 上，顶层 studentstudy 页面没有。必须沿同源 frame 树递归查找。
            let found = null;
            const visit = (win, depth) => {
                if (!win || depth > 4 || found) return;
                try {
                    if (Array.isArray(win.attachments)) { found = win.attachments; return; }
                } catch (e) {}
                let frames = [];
                try { frames = win.document.querySelectorAll('iframe'); } catch (e) { return; }
                for (const f of frames) { try { visit(f.contentWindow, depth + 1); } catch (e) {} }
            };
            visit((typeof unsafeWindow !== 'undefined') ? unsafeWindow : window, 0);
            // 关键补充（2026-09 真机验证）：iframe 刷课 worker 跑在 /ananas/modules/video 播放器 iframe 里，
            // 从自身向下遍历永远碰不到顶层 knowledge/cards iframe 上的 attachments，
            // 导致 worker 里 isVideoTaskDone 恒为 null（判不了完成状态）→ 已完成视频被 worker 原地重播。
            // 同源平台（学习通）从 window.top 再向下找一次；跨域时访问被拒，静默跳过。
            if (!found) {
                try { if (window.top && window.top !== window) visit(window.top, 0); } catch (e) {}
            }
            if (!found && !window.__aaAttachmentsWarned) {
                // 修复（2026-10）：原来完全静默。平台一旦改版导致 attachments 取不到，
                // 任务点状态判定会退化成 DOM 回退、刷课行为明显变形，却没有任何线索可查。
                // 这里打一条 warn（每个 frame 只报一次，避免刷屏），便于下次真机校验时第一时间定位。
                window.__aaAttachmentsWarned = true;
                if (typeof addLog === 'function') {
                    addLog('刷课: 未找到学习通 attachments（页面结构可能已变更），任务点状态判定已降级', 'warn');
                }
            }
            return found;
        } catch (e) { return null; }
    }

    // 读取任务卡片 iframe 的 jobid（含 OCS 同款父级回退：嵌套 iframe 时 data 挂在外层卡片上）
    function readCardJobId(frameEl) {
        try {
            let dataStr = frameEl.getAttribute && frameEl.getAttribute('data');
            if (!dataStr) {
                // OCS 回退等价于 win.frameElement.contentWindow.parent.frameElement：
                // 嵌套播放器 iframe 自身无 data 时，向外一层卡片 iframe 元素上找
                try {
                    const cw = frameEl.contentWindow;
                    const parentFe = cw && cw.parent && cw.parent.frameElement;
                    if (parentFe && parentFe !== frameEl) {
                        dataStr = parentFe.getAttribute('data');
                    }
                } catch (e) { /* 跨域，忽略 */ }
            }
            if (!dataStr) return null;
            let fd;
            try { fd = JSON.parse(dataStr); } catch (e) { return null; }
            const jobid = fd && (fd.jobid || fd._jobid);
            return jobid ? String(jobid) : null;
        } catch (e) { return null; }
    }

    // 解析一个任务卡片 iframe 的完成状态
    // 返回：true=已完成或非必做（不用刷），false=未完成必做，null=无法判断
    function iframeJobDoneStatus(frameEl) {
        try {
            const jobid = readCardJobId(frameEl);
            if (!jobid) return null;
            const atts = getChaoxingAttachments();
            if (!atts) return null;
            const att = atts.find(a => {
                if (!a) return false;
                const aid = a.jobid || (a.property && a.property._jobid);
                return aid !== undefined && String(aid) === String(jobid);
            });
            if (!att) return null;
            // 修复（2026-10）：只判 job 会把"播过但平台侧未通过"（isPassed=false，如内嵌弹题没答、
            // 观看校验没通过）误判成"已完成" → 脚本直接推进到下一节，平台侧该任务点仍算未完成，
            // 课程进度留缺口。isPassed === false 时仍算未完成。
            if (att.isPassed === false) return false;
            return !att.job;  // job=true → 未完成；job 消失（已完成/非任务点）→ true
        } catch (e) { return null; }
    }

    // 收集"DOM 里已经播完"的视频任务 jobid 集合
    // 用途：视频刚播完的瞬间，页面 attachments 里的 job 可能仍是 true（未实时刷新），
    // 用 DOM 的 ended 状态纠正，否则会错过"刷完立即跳下一章"的时机
    function collectEndedVideoJobIds() {
        const ended = new Set();
        const walk = (doc) => {
            if (!doc) return;
            let frames = [];
            try { frames = Array.from(doc.querySelectorAll('iframe')); } catch (e) { return; }
            for (const f of frames) {
                let cdoc = null;
                try { cdoc = f.contentWindow && f.contentWindow.document; } catch (e) { continue; }
                if (!cdoc) continue;  // 跨域 iframe
                try {
                    const ms = cdoc.querySelectorAll('video, audio');
                    for (const m of ms) {
                        if (m.ended) {
                            const jid = readCardJobId(f);
                            if (jid) ended.add(jid);
                            break;
                        }
                    }
                } catch (e) {}
                walk(cdoc);
            }
        };
        walk(document);
        return ended;
    }

    // 扫描当前章节的任务完成情况
    // 返回 { known: 能否可靠判定, unfinishedVideos: 未完成音视频数,
    //        unfinishedDocs: 未完成文档数, unfinishedWork: 未完成习题数, hasExercise: 是否有习题(work),
    //        workJids: 未完成习题的 jobid 列表（用作小节状态键） }
    // 主路径读 attachments（整节任务，不依赖卡片渲染）；旧页面无 attachments 时回退 DOM 扫描
    // 注意：扫描范围是"当前小节"（studentstudy 一次只加载一个小节的卡片），
    //       章内其他小节靠"下一节"按钮推进
    function scanChaoxingChapterTasks() {
        // ===== 主路径：attachments =====
        const atts = getChaoxingAttachments();
        if (atts && atts.length > 0) {
            const info = { known: true, unfinishedVideos: 0, unfinishedDocs: 0, unfinishedWork: 0, hasExercise: false, workJids: [] };
            const endedJobs = collectEndedVideoJobIds();
            for (const a of atts) {
                if (!a || !a.property) continue;
                const mod = a.property.module;
                if (mod === 'work') {
                    info.hasExercise = true;
                    if (a.job) {
                        info.unfinishedWork++;  // 习题：未完成数单独计，跳过/作答由设置与作答引擎决定
                        const jid = a.jobid || a.property._jobid;
                        if (jid) info.workJids.push(String(jid));
                    }
                    continue;
                }
                const isMedia = (mod === 'insertvideo' || mod === 'insertaudio');
                const isDoc = (mod === 'insertdoc' || mod === 'insertbook' || mod === 'insertflash');
                if (!isMedia && !isDoc) continue;
                // 修复（2026-10）：isPassed === false（播过但平台侧未通过，如内嵌弹题没答）
                // 仍然算未完成，不能跳过，否则平台侧进度留缺口。
                if (!a.job && a.isPassed !== false) continue;  // 已完成（job 属性消失）或非任务点 → 不用刷
                // 刚播完瞬间 attachments 可能未刷新（job 仍为 true），用 DOM ended 纠正
                const jid = String(a.jobid || a.property._jobid || '');
                if (isMedia && jid && endedJobs.has(jid)) continue;
                if (isMedia) info.unfinishedVideos++;
                else info.unfinishedDocs++;
            }
            return info;
        }

        // ===== 回退：iframe DOM 扫描（旧版学习页没有 attachments 时用）=====
        const info = { known: false, unfinishedVideos: 0, unfinishedDocs: 0, unfinishedWork: 0, hasExercise: false };
        const scan = (doc) => {
            if (!doc) return;
            let frames = [];
            try { frames = Array.from(doc.querySelectorAll('iframe')); } catch (e) { return; }
            for (const f of frames) {
                let cdoc = null;
                try { cdoc = f.contentWindow && f.contentWindow.document; } catch (e) { continue; }
                if (!cdoc) continue;  // 跨域 iframe
                const isVideoCard = (() => {
                    try { return !!cdoc.querySelector('#video, #audio, video, audio'); } catch (e) { return false; }
                })();
                const isExerciseCard = (() => {
                    try { return !!cdoc.querySelector('.TiMu, .Zy_TMy_, .ans-job-tmp-quiz, .examTmx'); } catch (e) { return false; }
                })();
                const isDocCard = (() => {
                    try { return !!cdoc.querySelector('#img.imglook, .swiper-container, [name="bookifame"]'); } catch (e) { return false; }
                })();
                if (isVideoCard || isExerciseCard || isDocCard) info.known = true;
                if (isExerciseCard) info.hasExercise = true;

                const status = iframeJobDoneStatus(f);  // true=完成/非必做 false=未完成 null=未知
                if (isVideoCard && status !== true) {
                    // 播完（DOM ended）才算完成；判定不了时保守算未完成，避免漏刷
                    let endedInDom = false;
                    try {
                        const m = cdoc.querySelector('video, audio');
                        endedInDom = !!(m && m.ended);
                    } catch (e) {}
                    if (!endedInDom) info.unfinishedVideos++;
                }
                if (isDocCard && status === false) {
                    info.unfinishedDocs++;
                }
                // 习题卡片不计数：跳过习题模式下它不算"未完成"
                scan(cdoc);
            }
        };
        scan(document);
        return info;
    }

    // 用视频地址里的 objectid 精确对上 attachments 里的那个任务点
    // 学习通视频地址形如：
    //   https://s2.cldisk.com/sv-w2/video/03/f7/ca/<objectid>/sd.mp4
    // 而 attachments[].property.objectid 正是这个哈希
    //（平台自己的 mooc-ans/js/resource_scan.js 就是读 attachments[].property.objectid）
    function attachmentForMedia(v) {
        try {
            const atts = getChaoxingAttachments();
            if (!atts || !atts.length) return null;
            const src = String(v.currentSrc || v.src || '').split('?')[0];
            if (!src) return null;
            const segs = src.split('/');
            const cand = (segs.length >= 2 ? segs[segs.length - 2] : '').toLowerCase();
            if (!cand || cand.length < 8) return null;
            for (const a of atts) {
                const aoid = String((a && a.property && a.property.objectid) || (a && a.objectid) || '').toLowerCase();
                if (!aoid) continue;
                if (aoid === cand) return a;
                if (cand.length >= 16 && aoid.indexOf(cand) >= 0) return a;
                if (aoid.length >= 16 && cand.indexOf(aoid) >= 0) return a;
            }
            return null;
        } catch (e) { return null; }
    }

    // 判断一个 video 元素对应的任务是否"已完成/非必做"（不用再刷）
    // 返回：true=已完成或非必做，false=未完成，null=无法判断（非超星页面等）
    // 作用：防止脚本反复重播平台上已标记完成的视频（DOM 里视频重新加载后 ended 是 false）
    function isVideoTaskDone(v) {
        try {
            const doc = v.ownerDocument;
            const win = doc && doc.defaultView;
            const fe = win && win.frameElement;
            if (!fe) return null;  // 顶层视频，无卡片 data
            const st = iframeJobDoneStatus(fe);
            if (st !== null) return st;
            // 兜底1（2026-10-23）：按视频地址里的 objectid 精确匹配 attachments 里的任务点。
            // 这样才能精确知道"当前这个视频是不是已经做完了"，
            // 否则已完成视频会被重播、后面的视频也会被漏掉。
            const att = attachmentForMedia(v);
            if (att) {
                if (att.isPassed === false) return false;  // 播过但平台侧未通过 → 仍算未完成
                if (att.job) return false;                // job=true → 未完成
                return true;                              // job 消失 → 已完成 / 非任务点
            }
            // 兜底2（2026-10-21 实机核验）：当前学习通的任务点 iframe 上没有 data 属性，
            // readCardJobId 取不到 jobid → iframeJobDoneStatus 恒为 null，
            // 于是"平台已标记完成的任务点"会被当成未完成 → 看完的视频被原地重播。
            // 这里用平台自己的 attachments 兜底：若本章音视频任务点已全部完成，
            // 就视作已完成。找不到 attachments / 本章没有音视频时返回 null（判不了 → 保守）。
            const mediaState = attachmentsMediaState();
            if (mediaState === false) return true;
            return null;
        } catch (e) { return null; }
    }

    // 本章节附件里"还有没有未完成的音视频任务点"？
    // 返回 true=还有未完成音视频；false=音视频已全部完成；null=判断不了
    function attachmentsMediaState() {
        const atts = getChaoxingAttachments();
        if (!atts || !Array.isArray(atts) || atts.length === 0) return null;
        let hasMedia = false;
        let hasUnfinished = false;
        for (const a of atts) {
            if (!a) continue;
            const mod = (a.property && a.property.module) || a.module || '';
            if (mod !== 'insertvideo' && mod !== 'insertaudio') continue;
            hasMedia = true;
            // job=true → 未完成；isPassed===false → 播过但平台侧未通过，同样算未完成
            if (a.job || a.isPassed === false) hasUnfinished = true;
        }
        if (!hasMedia) return null;
        return hasUnfinished;
    }

    // ---------- 手动选择优先（2026-09 新增：修复多视频来回抢播） ----------
    // 场景：同一小节有多个未完成视频按顺序播放，用户手动点了后面某个视频。
    // 平台会暂停当前视频、播放用户点的那个；此时脚本里三套"自动恢复播放"
    //（主循环 tryAutoUnpause / pause 事件恢复 / iframe worker 防暂停）如果
    // 仍按"第一个未完成的视频"去播，就会把旧视频拉回来 → 两个视频互相打断、来回切换。
    // 方案：记录用户点击的 jobid（userPickedJobid），所有自动播放入口统一走
    // pickMediaToPlay()——优先播用户点的；它刷完或卡片消失（换小节）后自动恢复顺序模式。

    // 全局互斥：除 selfWin 外，同源 frame 树里是否已有别的媒体正在播放。
    // iframe worker 也在用（worker 只看得到自己 document 里的视频，必须借顶层视角判断）。
    // 跨域时 window.top 访问被拒 → 返回 false，保持原行为。
    function anyOtherMediaPlaying(selfWin) {
        try {
            const scan = (win, depth) => {
                if (!win || depth > 4) return false;
                let doc = null;
                try { doc = win.document; } catch (e) { return false; }
                if (doc) {
                    let ms = [];
                    try { ms = doc.querySelectorAll('video, audio'); } catch (e) {}
                    for (const m of ms) {
                        if (win !== selfWin && !m.paused && !m.ended) return true;
                    }
                    let frames = [];
                    try { frames = doc.querySelectorAll('iframe'); } catch (e) {}
                    for (const f of frames) { try { if (scan(f.contentWindow, depth + 1)) return true; } catch (e) {} }
                }
                return false;
            };
            return scan(window.top || window, 0);
        } catch (e) { return false; }
    }

    // 统一的"该播哪个视频"决策：用户手动点过的优先，否则按卡片顺序第一个未完成的。
    // 返回 { media, reason: 'user'|'order' }；没有可播的返回 null。
    // 附带自愈：选中的视频已刷完 / 卡片已不在当前小节 → 清除记录，回落顺序模式。
    // ============ 多视频顺序播放（2026-10-23） ============
    // 用户实机反馈：一章里有多个视频时（例：红色歌曲 16 个任务点、经典视频 10 个），
    // 脚本会在多个视频之间来回抢播（"轮流播放"），而且会漏视频。
    // 真机复盘（学习通 knowledge/cards 是一个高 iframe，里面把整章任务点卡片全渲染出来，
    // 每个卡片再套一层自己的 videojs 播放器）后定位到两个根因：
    //   ① 选片逻辑"每轮都从 DOM 里挑第一个 paused 的视频"，完全不记进度
    //      → 平台切到第 2 个之后，脚本下一轮又回到第 1 个；
    //   ② pause 恢复 / iframe worker 会在"平台暂停旧视频、准备切下一个"的瞬间
    //      把旧视频抢回来 → 平台再停掉新的 → 两个视频来回拉锯（真正在播的只有一个）。
    // 解法：队列指针（只进不退）+ 目标互斥（同一时刻只有一个视频享受保护）。

    // 两个视频列表是否完全相同（按元素身份比较）
    function sameMediaList(a, b) {
        if (!a || !b || a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
        return true;
    }

    // 视频的稳定标识：同一个任务点的视频地址（objectid）是固定的，
    // 而 DOM 元素会被平台在切任务点时整体重建 → 只能用地址认人，不能用元素。
    function mediaSig(v) {
        try { return String(v.currentSrc || v.src || ''); } catch (e) { return ''; }
    }

    // 建立 / 刷新播放队列。平台重建卡片 DOM（视频元素被换掉）时，
    // 按视频地址把指针对齐到同一个任务点 → 不会因为重建而跳回第一个视频。
    function ensureMediaSeq(videos) {
        if (!Array.isArray(videos)) return [];
        if (!sameMediaList(_STUDY.mediaSeq, videos)) {
            const old = Array.isArray(_STUDY.mediaSeq) ? _STUDY.mediaSeq : [];
            const oldIdx = Math.min(_STUDY.mediaSeqIndex, Math.max(0, old.length - 1));
            const anchor = old[oldIdx] || _STUDY.lastPlayedMedia || null;
            const anchorSig = anchor ? mediaSig(anchor) : '';
            _STUDY.mediaSeq = videos.slice();
            let ni = -1;
            if (anchorSig) {
                for (let i = 0; i < _STUDY.mediaSeq.length; i++) {
                    if (mediaSig(_STUDY.mediaSeq[i]) === anchorSig) { ni = i; break; }
                }
            }
            // 地址对不上（平台换了源）→ 退化成按位置对齐，绝不回到 0
            if (ni < 0) ni = Math.min(oldIdx, Math.max(0, _STUDY.mediaSeq.length - 1));
            _STUDY.mediaSeqIndex = ni;
        }
        return _STUDY.mediaSeq;
    }

    // 把队列指针推进到"下一个还没播完的"（只进不退）
    function advanceMediaSeq() {
        const seq = Array.isArray(_STUDY.mediaSeq) ? _STUDY.mediaSeq : [];
        if (!seq.length) return;
        // 目标视频已播完 → 解除保护，避免各 iframe 的 worker 一直护着它
        try { if (_STUDY.targetMedia && _STUDY.targetMedia.ended) markTargetMedia(null); } catch (e) {}
        let guard = 0;
        while (guard++ <= seq.length) {
            const v = seq[_STUDY.mediaSeqIndex % seq.length];
            if (!v) { _STUDY.mediaSeqIndex++; continue; }
            if (v.ended || isVideoTaskDone(v) === true) {
                _STUDY.lastPlayedMedia = v;
                _STUDY.mediaSeqIndex++;
                continue;
            }
            break;
        }
        if (_STUDY.mediaSeqIndex >= seq.length) _STUDY.mediaSeqIndex = 0;
    }

    // 标记"当前唯一要保护的目标视频"，写到顶层，供各 iframe 里的 worker 判断
    function markTargetMedia(v) {
        _STUDY.targetMedia = v || null;
        try { window.top.__aa_targetMedia = v || null; } catch (e) {}
    }

    // 判断某个媒体元素是不是当前目标。
    // 返回 false = 不是目标 → 一律不干预（让平台正常切任务点），这是防"轮流播放"的关键。
    function isTargetMedia(v) {
        try {
            const top = window.top;
            if (!top || top.__aa_targetMedia === undefined) return true; // 没有目标机制 → 保持旧行为
            const t = top.__aa_targetMedia;
            if (!t) return false;   // 目标还没定 / 已清空 → 谁都不保护
            return t === v;
        } catch (e) { return true; }
    }

    // 统一的"该播哪个视频"决策：用户手动点过的优先，否则按队列顺序。
    function pickMediaToPlay(videos) {
        if (_STUDY.userPickedJobid) {
            let picked = null;
            for (const v of videos) {
                try {
                    const doc = v.ownerDocument;
                    const win = doc && doc.defaultView;
                    const fe = win && win.frameElement;
                    if (fe && String(readCardJobId(fe) || '') === String(_STUDY.userPickedJobid)) { picked = v; break; }
                } catch (e) {}
            }
            if (picked) {
                if (picked.ended || isVideoTaskDone(picked) === true) {
                    _STUDY.userPickedJobid = null;  // 用户点的已刷完 → 恢复顺序模式
                } else {
                    return { media: picked, reason: 'user' };
                }
            } else {
                _STUDY.userPickedJobid = null;  // 卡片已不在（换了小节/章节）→ 恢复顺序模式
            }
        }
        // 顺序模式（2026-10-23）：按队列指针走，播完一个才播下一个，绝不回头。
        // 旧逻辑是"每轮挑第一个 paused 的视频"，在一章多个视频时会来回跳、并漏掉后面的。
        const seq = ensureMediaSeq(videos);
        if (seq.length) {
            for (let i = 0; i < seq.length; i++) {
                const v = seq[(_STUDY.mediaSeqIndex + i) % seq.length];
                if (!v) continue;
                // 平台已标记完成的任务点绝不重播（判定不了时 isVideoTaskDone 返回 null，保守视为未完成）
                if (isVideoTaskDone(v) === true) continue;
                if (v.ended || !v.paused) continue;
                if (!hasVideoSource(v)) continue;
                return { media: v, reason: 'order' };
            }
            return null;
        }
        // 兜底：拿不到队列信息时退回旧逻辑
        for (const v of videos) {
            if (isVideoTaskDone(v) === true) continue;
            if (v.ended || !v.paused) continue;
            if (!hasVideoSource(v)) continue;
            return { media: v, reason: 'order' };
        }
        return null;
    }

    // 给顶层 + 各同源 iframe 文档挂捕获阶段 click 监听，记录用户手动点的视频任务点。
    // 事件不会跨 iframe 边界冒泡，所以每层文档都要挂；主循环每秒调用一次做补挂（幂等）。
    function installUserPickWatchers() {
        const install = (doc) => {
            if (!doc || doc._aaUserPickWatcher) return;
            try { doc._aaUserPickWatcher = true; } catch (e) { return; }
            doc.addEventListener('click', (ev) => {
                try {
                    let jobid = null;
                    // 点击发生在播放器 iframe 文档内：该文档的媒体就是被点的
                    const media = doc.querySelector('video, audio');
                    if (media) {
                        const win = doc.defaultView;
                        const fe = win && win.frameElement;
                        jobid = fe ? readCardJobId(fe) : null;
                    }
                    // 点击发生在卡片层文档：目标落在哪个卡片 iframe 上
                    if (!jobid && ev.target && ev.target.closest) {
                        const cardFe = ev.target.closest('iframe[data]');
                        if (cardFe) jobid = readCardJobId(cardFe);
                    }
                    if (jobid) {
                        _STUDY.userPickedJobid = String(jobid);
                        _STUDY.userPickedAt = Date.now();
                    }
                } catch (e) {}
            }, true);
            let frames = [];
            try { frames = doc.querySelectorAll('iframe'); } catch (e) { return; }
            for (const f of frames) { try { install(f.contentDocument); } catch (e) {} }
        };
        install(document);
    }

    // 在页面全部视频里挑"要播的那个"激活播放（2026-09 新增）
    // 使用方：startStudy 启动、页面加载完成、可见性恢复、监控器切换。
    // 根因（真机复现）：重新进入/刷新小节时，已完成任务点的视频卡片仍在 DOM 里
    //（平台不移除，attachment 变为 isPassed:true 且 job 消失），且播放器会恢复上次进度。
    // 之前这几个入口抓"DOM 里第一个 paused 的视频"就播，正好播到已完成视频——
    // 表现为用户说的"再进一次网页，它判断第一个视频看完，从第二个开始看"（续播点错位）。
    // 修正：跳过已完成任务点，从第一个没刷完的视频继续；用户手动点过则优先播用户点的。
    function playFirstUnfinishedVideo(logPrefix) {
        let videos = [];
        try { videos = findAllVideos(); } catch (e) { return false; }
        try { advanceMediaSeq(); } catch (e) {}
        const pick = pickMediaToPlay(videos);
        if (!pick) return false;
        const v = pick.media;
        try { markTargetMedia(v); } catch (e) {}
        try {
            if (v.videoWidth > 0 && v.videoWidth < 200) return false;  // 微缩占位视频
            if (v.videoHeight > 0 && v.videoHeight < 200) return false;
        } catch (e) {}
        try {
            if (state.settings.studyRate) v.playbackRate = state.settings.studyRate;
            if (typeof state.settings.studyVolume === 'number') v.volume = state.settings.studyVolume;
        } catch (e) {}
        const r = playWithErrorHandler(v);
        if (r && typeof r.then === 'function') {
            r.then(ok => {
                if (ok && typeof addLog === 'function') {
                    const why = pick.reason === 'user' ? '按手动选择播放' : '已从第一个未完成任务点继续播放';
                    addLog(`${logPrefix || '刷课'}: ${why}`, 'success');
                }
            });
        }
        return true;
    }

    // ==================== 习题小节智能处理（作答/等待外部脚本/跳过） ====================
    // 决策矩阵（tryAutoJumpTask 的习题分支按此调度）：
    //   1) 勾选"总是跳过习题"                → 直接跳过
    //   2) 未勾选 + 配了可用作答引擎(AI/题库) → 自动作答 + 点"暂时保存"（绝不自动提交）→ 下一节
    //   3) 未勾选 + 没配作答引擎（如用户用另一个脚本答题）
    //                                       → 原地等待最多 90 秒，轮询题目是否被填；
    //                                         被填（外部脚本/用户答的）→ 下一节；超时 → 跳过保刷课
    const WORK_WAIT_TIMEOUT_MS = 90 * 1000;

    function anyAnswerEngineReady() {
        try {
            for (const api of Object.values(AI_MODELS)) {
                if (api && api.enabled && api.apiKey) return true;
            }
        } catch (e) {}
        const tikus = Array.isArray(state.settings.tikuList) ? state.settings.tikuList : [];
        return state.settings.tikuEnabled === true && tikus.some(t => t && t.enabled && t.url && String(t.url).trim());
    }

    // 在当前小节里收集习题题目（章节测验渲染在 work iframe 里，顶层扫描必须递归进同源 iframe；
    // studentstudy 页面会被 detectQuestions 的"视频页无题目"策略直接返回空，所以这里手动构建题目对象）
    function collectWorkQuestions() {
        const questions = [];
        const visit = (doc, depth) => {
            if (!doc || depth > 4) return;
            const timus = doc.querySelectorAll('.TiMu');
            for (const tm of timus) {
                try {
                    questions.push({
                        index: questions.length + 1,
                        rawText: (tm.innerText || tm.textContent || '').trim(),
                        cleanText: cleanQuestionText((tm.innerText || tm.textContent || '').trim()) || (tm.innerText || '').trim(),
                        element: tm,
                        options: extractOptions(tm),
                        isImageQuestion: isImageQuestion(tm)
                    });
                } catch (e) {}
            }
            if (questions.length === 0) {
                for (const f of doc.querySelectorAll('iframe')) {
                    try {
                        if (f.contentDocument) visit(f.contentDocument, depth + 1);
                    } catch (e) {}
                }
            }
        };
        visit(document, 0);
        return questions;
    }

    // 启发式判断当前小节的习题是否"已经被填上答案"（外部脚本或用户手动作答的场景）
    // 规则：页面上有题目容器，且每个容器都存在已填写的文本框/已勾选的选项
    function quizLooksAnswered() {
        let questions = 0, filled = 0;
        const visit = (doc, depth) => {
            if (!doc || depth > 4) return;
            const timus = doc.querySelectorAll('.TiMu');
            if (timus.length > 0) {
                questions += timus.length;
                for (const tm of timus) {
                    try {
                        const hasText = Array.from(tm.querySelectorAll('textarea, input[type="text"], [contenteditable="true"]'))
                            .some(i => ((i.value || i.textContent || '') + '').trim().length > 0);
                        const hasPicked = tm.querySelectorAll('input[type="radio"]:checked, input[type="checkbox"]:checked').length > 0;
                        if (hasText || hasPicked) filled++;
                    } catch (e) {}
                }
                return;
            }
            for (const f of doc.querySelectorAll('iframe')) { try { visit(f.contentDocument, depth + 1); } catch (e) {} }
        };
        visit(document, 0);
        return questions > 0 && filled >= questions;
    }

    // 章内小节推进：优先"下一节"，本章走完则跳下一个未完成章节
    function advanceSectionOrChapter() {
        // 修复（2026-10）：全脚本其它跳转路径都会写 _STUDY.lastJumpAt（10s 防抖），
        // 唯独"下一节"这条不写 → 主循环 1 秒调一次，attachments 异步刷新的窗口内
        // 会连续点两次"下一节"，中间那一小节被整个跳过（进度留缺口且毫无提示）。
        const now = Date.now();
        if (now - (_STUDY.lastJumpAt || 0) < 10000) return false;

        const nextBtn = document.querySelector('#prevNextFocusNext');
        const visible = nextBtn && nextBtn.getBoundingClientRect && nextBtn.getBoundingClientRect().width > 0;
        if (visible) {
            _STUDY.lastJumpAt = now;
            try { nextBtn.click(); } catch (e) {}
            scheduleAfterJump('section-next');
            return true;
        }
        tryJumpToNextUnfinishedChapter();
        return false;
    }

    // 自动作答当前习题小节（复用答题模块的 processSingleQuestion：题库优先→AI→填写）
    // 只"暂时保存"，绝不点"提交"——提交不可逆，留给用户核对后手动交
    async function tryAnswerWorkSection(workKey) {
        const st = _STUDY.work || (_STUDY.work = {});
        if (st.key === workKey && (st.phase === 'answering' || st.phase === 'done')) return;
        if (st.key === workKey && st.phase === 'error' && Date.now() - st.startedAt < 30000) return; // 失败 30 秒后再重试
        _STUDY.work = { key: workKey, phase: 'answering', startedAt: Date.now(), saved: false };
        if (typeof addLog === 'function') addLog('刷课: 检测到习题小节且已配置作答引擎，自动作答（完成后仅保存，不提交）', 'info');
        try {
            const qs = collectWorkQuestions();
            if (qs.length === 0) {
                // 没抓到题目 DOM（布局特殊）→ 当作已处理，交给外部/用户，按超时策略推进
                _STUDY.work.phase = 'done';
                _STUDY.work.saved = false;
                return;
            }
            for (const q of qs) {
                if (state.shouldStop) break;
                try { if (isQuestionAnswered(q)) continue; } catch (e) {}
                await processSingleQuestion(q);
            }
            // 点"暂时保存"（不点提交）
            const saveBtn = queryAllDocs('a, button, span, div').find(el => {
                try {
                    return el.offsetParent && /^(暂时保存|暂存)$/.test((el.textContent || '').trim()) && el.querySelectorAll('*').length <= 3;
                } catch (e) { return false; }
            });
            if (saveBtn) {
                try { saveBtn.click(); } catch (e) {}
                if (typeof addLog === 'function') addLog(`刷课: 习题已作答并点击"暂时保存"（共${qs.length}题，未提交，可自行核对后提交）`, 'success');
            } else {
                if (typeof addLog === 'function') addLog('刷课: 习题已填写答案，未找到"暂时保存"按钮（未提交）', 'warn');
            }
            _STUDY.work.saved = true;
            _STUDY.work.phase = 'done';
        } catch (e) {
            if (typeof addLog === 'function') addLog(`刷课: 习题自动作答失败（${e.message || e}），90秒后按超时策略跳过`, 'error');
            _STUDY.work.phase = 'error';
        }
    }

    // 找当前小节习题的处理决策：'skip'（直接跳）| 'answer'（自动作答）| 'wait'（等外部作答）
    function decideWorkAction() {
        if (state.settings.skipExercise === true) return 'skip';
        if (anyAnswerEngineReady()) return 'answer';
        return 'wait';
    }

    // 找未完成章节
    // 解析策略：
    // 1) 超星：[onclick^="getTeacherAjax"] + 隐藏 input.jobUnfinishCount
    // 2) 通用：.posCatalog_item / .chapter_item / .task-item 含 "已完成"/"未完成" icon
    // 3) 当前激活章节 = .posCatalog_active
    // 返回 [{element, unFinishCount, isActive}, ...] 或 []
    function findUnfinishedChapters() {
        const result = [];

        // ===== 策略1：超星 getTeacherAjax 元素 =====
        try {
            const els = document.querySelectorAll('[onclick^="getTeacherAjax"]');
            els.forEach(el => {
                let unFinish = 0;
                try {
                    const inp = el.parentElement ? el.parentElement.querySelector('.jobUnfinishCount') : null;
                    unFinish = parseInt(inp && inp.value ? inp.value : '0') || 0;
                } catch (e) {}
                result.push({
                    element: el,
                    unFinishCount: unFinish,
                    isActive: el.classList.contains('posCatalog_active') ||
                              (el.parentElement && el.parentElement.classList.contains('posCatalog_active')),
                    source: 'getTeacherAjax'
                });
            });
        } catch (e) {}

        if (result.length > 0) return result;

        // ===== 策略2：通用 task-item / chapter-item =====
        // 找包含"未完成"或"已完成"icon的列表项
        const candidateSelectors = [
            '.posCatalog_select',          // 超星左侧目录条目
            '.posCatalog_item',
            '.chapter_item',
            '.catalog_item',
            '.task-item',
            '.task_item',
            '.lesson-item',
            '.lesson_item',
            '.point-item',
            '.point_item',
            '.j-list .list',               // 章节列表
            '.j-chapter .list',
            'li[data-chapter-id]',
            'li[data-task-id]'
        ];
        for (const sel of candidateSelectors) {
            const nodes = document.querySelectorAll(sel);
            if (nodes.length === 0) continue;

            // 判断每个节点的"未完成数"
            // 启发式：找包含数字的"未完成"标签 / icon_Completed
            nodes.forEach(n => {
                let unFinish = 0;
                // 找显示未完成数的span
                // 2026-10 实机核验：学习通新版章节目录页（/mooc2-ans/mycourse/studentcourse）
                // 用的是 <span class="catalog_points_yi">N</span> 表示该章未完成任务点数，
                // 旧的 .unfinish-num / .jobUnfinishCount 只在学习页左侧目录（posCatalog）里存在。
                // 之前缺了 .catalog_points_yi → 计数全部取不到 → 兜底"没icon=算未完成"
                // → 每个章节都被当成未完成，"跳最早未完成章节"永远命中列表第一项。
                const unSpan = n.querySelector('.unfinish-num, .unfinished-num, .jobUnfinishCount, .num-unfinish, .catalog_points_yi');
                if (unSpan) {
                    unFinish = parseInt(unSpan.textContent.trim() || unSpan.value || '0') || 0;
                } else {
                    // 找完成/未完成 icon
                    const completedIcon = n.querySelector('.icon_Completed, .icon-completed, .completed, .finish, .finished, .done');
                    const unfinishIcon = n.querySelector('.icon_unfinish, .icon-unfinish, .unfinish, .unfinished, .todo, .pending');
                    if (unfinishIcon) {
                        unFinish = 1;  // 至少1个未完成
                    } else if (!completedIcon) {
                        // 没icon = 不知道状态，保守算1（认为未完成）
                        unFinish = 1;
                    }
                }
                result.push({
                    element: n,
                    unFinishCount: unFinish,
                    isActive: n.classList.contains('active') ||
                              n.classList.contains('posCatalog_active') ||
                              n.classList.contains('currents') ||
                              n.classList.contains('current'),
                    source: 'generic'
                });
            });
            if (result.length > 0) break;
        }
        return result;
    }

    // 跳到最早未完成章节
    // 策略：找 unFinishCount > 0 的第一个 chapter，调 getTeacherAjax 跳转
    // silent=true: 不打印日志（用于循环里的常规检查）
    // silent=false: 是用户启动刷课时的首次跳转
    function tryJumpToFirstUnfinished(silent, force = false, reason = '') {
        if (typeof state === 'undefined' || !state.settings) return;
        if (state.settings.studyAutoNext === false) return;
        if (!force && state.settings.studyAlwaysStartFromEarliest === false) return;
        // 登录页不跳转
        if (isLoginPage()) return;
        // 修复（2026-09）：非刷课界面禁止跳转（防 2s/5s 定时器在课程门户页误触 getTeacherAjax）
        if (!isStudyInterface()) return;
        // 修复（2026-09）：用户最近 90 秒手动选择过章节 → 不主动跳回"最早未完成"，
        // 否则点击"未刷完的后面的"节点后会被反复拽回（A←→B 来回跳，触发人机验证）
        if (hasRecentUserSelection()) return;

        const chapters = findUnfinishedChapters();
        if (chapters.length === 0) return;  // 还没加载完目录

        // 找第一个 unFinishCount > 0
        const first = chapters.find(c => c.unFinishCount > 0);
        if (!first) {
            if (!silent && typeof addLog === 'function') {
                addLog('刷课: 所有章节已完成，无可跳转目标', 'success');
            }
            return;
        }

        // 如果第一个未完成 = 当前激活章节，则不需要跳转
        if (first.isActive) {
            if (!silent && typeof addLog === 'function') {
                addLog('刷课: 当前已是最早未完成章节', 'info');
            }
            return;
        }

        // 防抖：5秒内不重复跳
        const now = Date.now();
        if (!force && now - _STUDY.lastJumpAt < 5000) return;

        // 真正开始跳转时才更新 lastJumpAt
        _STUDY.lastJumpAt = now;
        const jumpPrefix = reason ? `刷课: ${reason}后，` : '刷课: ';

        try {
            if (first.source === 'getTeacherAjax' && typeof window.getTeacherAjax === 'function') {
                // 解析 onclick 参数 'courseId','classId','chapterId'
                const oc = first.element.getAttribute('onclick') || '';
                const m = oc.match(/\('(.*?)','(.*?)','(.*?)'\)/);
                if (m) {
                    window.getTeacherAjax(m[1], m[2], m[3]);
                    if (!silent && typeof addLog === 'function') {
                        addLog(`${jumpPrefix}已跳到最早未完成章节（chapterId=${m[3]}）`, 'success');
                    }
                    scheduleAfterJump('跳最早未完成');
                    return;
                }
            }
            // 通用：点 .posCatalog_name / a / 元素本身
            const target = first.element.querySelector('.posCatalog_name, .chapter_name, .job_name, .name, a, .leaf-title, .topic-title, .lesson-title, .unit-title, h3, h4, span')
                         || first.element;
            target.click();
            if (!silent && typeof addLog === 'function') {
                addLog(`${jumpPrefix}已跳到最早未完成章节`, 'success');
            }
            scheduleAfterJump('跳最早未完成');
        } catch (e) {
            if (typeof addLog === 'function') {
                addLog(`刷课: 跳最早未完成失败 - ${e.message || e}`, 'error');
            }
        }
    }

    // 跳转后自动播放
    // 三个跳转函数调 getTeacherAjax/click 后，新章节视频是异步加载的。
    // 3秒后每隔 1 秒轮询（最多10次），找"未在播放的、有 src 的 video"，调 playWithErrorHandler。
    function scheduleAfterJump(reason) {
        try {
            resetStudyTaskFlags();
            const seenTags = new Set();  // 同一个 video 只激活一次
            let attempts = 0;

            const tick = () => {
                attempts++;
                if (attempts > 10) return;
                if (!_STUDY.running) return;

                const videos = findAllVideos();
                // 已有视频在播放 → 不干预
                if (videos.some(v => !v.paused && !v.ended)) return;

                for (const v of videos) {
                    if (seenTags.has(v)) continue;
                    if (!hasVideoSource(v)) continue;
                    if (v.ended) { seenTags.add(v); continue; }
                    // 平台上已完成的视频任务不重播
                    if (isVideoTaskDone(v) === true) { seenTags.add(v); continue; }
                    try {
                        if (v.videoWidth > 0 && v.videoWidth < 200) { seenTags.add(v); continue; }
                    } catch (e) {}
                    if (v.paused && v.readyState >= 1) {
                        try {
                            if (state.settings.studyRate) v.playbackRate = state.settings.studyRate;
                            if (typeof state.settings.studyVolume === 'number') {
                                v.volume = state.settings.studyVolume;
                            }
                        } catch (e) {}
                        playWithErrorHandler(v);
                    }
                    seenTags.add(v);
                    break; // 只播一个
                }

                // 继续等（视频可能还在缓冲）
                setTimeout(tick, 1000);
            };
            // 3秒后开始（给 DOM 渲染 + 视频元数据加载时间）
            const t = setTimeout(tick, 3000);
            _STUDY._jumpTimers = _STUDY._jumpTimers || [];
            _STUDY._jumpTimers.push(t);
        } catch (e) {
            if (typeof addLog === 'function') {
                addLog(`刷课: 跳转后激活失败 - ${e.message || e}`, 'error');
            }
        }
    }

    // 修正调度：让"当前激活章节"始终保持"最早未完成"
    // 用户场景：
    //   1,2,3,4,5,6 六个任务点，用户手动点了第3个
    //   → 脚本要主动跳回第1个（最早未完成）
    //   → 视频看完后 → 跳第2个
    //   → 第2个看完 → 跳第3个（用户之前点过的）…
    // 触发条件：每3秒检查一次（不能太频繁否则会闪）
    // 与 tryAutoJumpTask 不冲突：tryAutoJumpTask 只在"视频 ended"时跳；本函数是"主动修正"
    function tryCorrectActiveChapter() {
        if (!state.settings.studyAutoNext) return;
        if (state.settings.studyAlwaysStartFromEarliest === false) return;
        // 登录页不修正章节
        if (isLoginPage()) return;
        // 修复（2026-09）：非刷课界面禁止修正章节
        if (!isStudyInterface()) return;
        const now = Date.now();
        // 防抖：8秒内不重复修正（避免和 tryAutoJumpTask 撞车）
        if (now - _STUDY.lastJumpAt < 8000) return;

        // 1) 如果刚启动/视频还没加载完（防抖 30 秒内不检查）
        if (now - (_STUDY.startedAt || 0) < 3000) return;

        // 2) 如果有视频/音频在播放，等它自然结束再跳（避免中断用户学习）
        const videos = findAllVideos();
        let hasPlaying = false;
        for (const v of videos) {
            if (!v.paused && !v.ended && v.readyState >= 2) {
                hasPlaying = true;
                break;
            }
        }
        // 也检查音频是否在播放
        if (!hasPlaying && _audioTaskRunning) {
            hasPlaying = true;
        }
        if (hasPlaying) return;

        // 3) 找所有未完成章节
        const chapters = (typeof findUnfinishedChapters === 'function') ? findUnfinishedChapters() : [];
        if (chapters.length === 0) return;  // 目录还没加载

        // 4) 找"最早未完成"（包含未完成题目也算）
        const firstUnfinished = chapters.find(c => c.unFinishCount > 0);
        if (!firstUnfinished) {
            // 所有章节都完成了，不动
            return;
        }

        // 5) 当前激活章节 = 最早未完成？→ OK
        if (firstUnfinished.isActive) {
            return;
        }

        // 5.5) 只要当前激活章节不是"最早未完成"，就强制跳回。
        // 否则用户手动点到后面的未完成章节时，脚本会继续刷后面的任务，打乱顺序。

        // 6) 当前激活 ≠ 最早未完成 → 强制跳回
        // 真正开始跳转时才更新 lastJumpAt
        _STUDY.lastJumpAt = now;
        try {
            if (firstUnfinished.source === 'getTeacherAjax' && typeof window.getTeacherAjax === 'function') {
                const oc = firstUnfinished.element.getAttribute('onclick') || '';
                const m = oc.match(/\('(.*?)','(.*?)','(.*?)'\)/);
                if (m) {
                    window.getTeacherAjax(m[1], m[2], m[3]);
                    if (typeof addLog === 'function') {
                        addLog(`刷课: 检测到当前章节不是最早未完成，已强制跳回（chapterId=${m[3]}）`, 'success');
                    }
                    scheduleAfterJump('修正调度-跳回最早');
                    return;
                }
            }
            const target = firstUnfinished.element.querySelector('.posCatalog_name, .chapter_name, .job_name, .name, a, .leaf-title, .topic-title, .lesson-title, .unit-title, h3, h4, span')
                         || firstUnfinished.element;
            target.click();
            if (typeof addLog === 'function') {
                addLog('刷课: 检测到当前章节不是最早未完成，已强制跳回最早未完成章节', 'success');
            }
            scheduleAfterJump('修正调度-跳回最早');
        } catch (e) {
            if (typeof addLog === 'function') {
                addLog(`刷课: 强制跳回失败 - ${e.message || e}`, 'error');
            }
        }
    }

    // 找当前章节的下一个未完成章节
    // 区别于 tryCorrectActiveChapter：
    //   tryCorrectActiveChapter：主动修正（用户点了非最早未完成）
    //   tryJumpToNextUnfinishedChapter：被动推进（视频自然结束/题目做完后）
    function tryJumpToNextUnfinishedChapter() {
        if (!state.settings.studyAutoNext) return;
        // 登录页不跳转
        if (isLoginPage()) return;
        // 修复（2026-09）：非刷课界面禁止跳下一个未完成章节
        if (!isStudyInterface()) return;
        const now = Date.now();
        // 10秒防抖（与任务点推进共用，避免多个未完成节点间来回跳触发人机验证）
        if (now - _STUDY.lastJumpAt < 10000) return;

        const chapters = (typeof findUnfinishedChapters === 'function') ? findUnfinishedChapters() : [];
        if (chapters.length === 0) return;

        // 找当前激活章节的索引
        const currentIdx = chapters.findIndex(c => c.isActive);
        if (currentIdx === -1) {
            // 没有激活章节 → 跳最早未完成（但不会跳回本章，因为 tryJumpToFirstUnfinished 会判断 isActive）
            return tryJumpToFirstUnfinished(true);
        }

        // 找当前章节之后的"第一个未完成章节"
        const nextUnfinished = chapters.slice(currentIdx + 1).find(c => c.unFinishCount > 0);
        if (!nextUnfinished) {
            // 后面没有了 → 全部完成
            if (typeof addLog === 'function') {
                addLog('刷课: 当前章节之后没有未完成章节，全部任务点已学完', 'success');
            }
            return;
        }

        // 真正开始跳转时才更新 lastJumpAt
        _STUDY.lastJumpAt = now;
        try {
            if (nextUnfinished.source === 'getTeacherAjax' && typeof window.getTeacherAjax === 'function') {
                const oc = nextUnfinished.element.getAttribute('onclick') || '';
                const m = oc.match(/\('(.*?)','(.*?)','(.*?)'\)/);
                if (m) {
                    window.getTeacherAjax(m[1], m[2], m[3]);
                    if (typeof addLog === 'function') {
                        addLog(`刷课: 跳到下一个未完成章节（chapterId=${m[3]}）`, 'success');
                    }
                    scheduleAfterJump('跳下一个未完成');
                    return;
                }
            }
            const target = nextUnfinished.element.querySelector('.posCatalog_name, .chapter_name, .job_name, .name, a, .leaf-title, .topic-title, .lesson-title, .unit-title, h3, h4, span')
                         || nextUnfinished.element;
            target.click();
            if (typeof addLog === 'function') {
                addLog('刷课: 跳到下一个未完成章节', 'success');
            }
            scheduleAfterJump('跳下一个未完成');
        } catch (e) {
            if (typeof addLog === 'function') {
                addLog(`刷课: 跳下一个未完成失败 - ${e.message || e}`, 'error');
            }
        }
    }

    // 跳到当前章节的下一个任务点（同章节内顺序推进）
    function tryJumpToNextTaskPoint(now) {
        if (!now) now = Date.now();

        // 学习通：当前激活任务点的下一个同级任务点
        const active = document.querySelector('.posCatalog_active');
        if (active) {
            let next = active.nextElementSibling;
            while (next) {
                if (next.classList && next.classList.contains('posCatalog_item') &&
                    !next.classList.contains('finished') &&
                    !next.classList.contains('complete')) {
                    const nameEl = next.querySelector('.posCatalog_name, .posCatalog_title, a, span');
                    const target = nameEl || next;
                    target.click();
                    _STUDY.lastJumpAt = now;
                    if (typeof addLog === 'function') {
                        addLog('刷课: 跳到当前章节的下一个任务点', 'success');
                    }
                    scheduleAfterJump('跳下一个任务点');
                    return true;
                }
                next = next.nextElementSibling;
            }
        }

        // 通用：当前 active 菜单项的下一个未完成兄弟
        const activeSelectors = [
            '.tabtags .currents',
            '.tabs .currents',
            '.menu-item.active',
            '.chapter_item.active',
            '.task-item.active',
            '.catalog_item.active',
            'li.active',
            'li.currents'
        ];
        for (const sel of activeSelectors) {
            const activeEl = document.querySelector(sel);
            if (!activeEl) continue;
            let next = activeEl.nextElementSibling;
            while (next) {
                if (!next.classList.contains('finished') && !next.classList.contains('complete')) {
                    const target = next.querySelector('a, .name, .title, span') || next;
                    target.click();
                    _STUDY.lastJumpAt = now;
                    if (typeof addLog === 'function') {
                        addLog('刷课: 跳到下一个任务点', 'success');
                    }
                    scheduleAfterJump('跳下一个任务点');
                    return true;
                }
                next = next.nextElementSibling;
            }
        }

        return false;
    }

    // 处理纯题目章节：能检测到的题目停留一下，否则/超时后跳到下一个任务点
    function tryHandleQuizOrSkip() {
        if (!state.settings.studyAutoNext) return;
        // 登录页不处理题目章节
        if (isLoginPage()) return;
        const now = Date.now();
        if (now - _STUDY.quizCheckedAt < 3000) return;
        _STUDY.quizCheckedAt = now;

        // 如果有视频/阅读/音频/讨论任务，不当作纯题目章节处理
        // （平台上已完成的视频任务不算，否则会卡住纯习题章节的跳过）
        const videos = findAllVideos().filter(v => isVideoTaskDone(v) !== true);
        if (videos.some(v => !v.ended)) return;
        if (typeof detectReadTask === 'function' && detectReadTask()) return;
        if (typeof detectAudioTask === 'function' && detectAudioTask()) return;

        // 检测是否有题目
        const questions = (typeof detectQuestions === 'function') ? detectQuestions(document.body) : [];
        if (!questions || questions.length === 0) return;

        // 已经在答题中，不再触发跳过
        if (state.isRunning) return;

        // 智能模式：配置了作答引擎（AI/题库）时，题目交给 tryAnswerWorkSection 自动作答，
        // 不走"15秒后跳下一章"的跳过逻辑
        if (state.settings.skipExercise !== true && typeof anyAnswerEngineReady === 'function' && anyAnswerEngineReady()) {
            return;
        }

        if (!_STUDY.quizProcessing) {
            _STUDY.quizProcessing = true;
            if (typeof addLog === 'function') {
                addLog(`刷课: 检测到题目章节（${questions.length}题），15秒后跳到下一章`, 'info');
            }
            setTimeout(() => {
                if (!_STUDY.running) {
                    _STUDY.quizProcessing = false;
                    return;
                }
                // 如果用户手动开始答题了，不跳
                if (state.isRunning) {
                    _STUDY.quizProcessing = false;
                    return;
                }
                _STUDY.quizProcessing = false;
                // 直接跳到当前章节之后的下一个未完成章节，避免跳回本章
                if (typeof tryJumpToNextUnfinishedChapter === 'function') {
                    tryJumpToNextUnfinishedChapter();
                }
            }, 15000);
        }
    }

    // 自动跳任务点：当前任务点完成 → 找下一个未完成任务点
    // 策略：优先跳到“当前章节的下一个任务点”，避免多视频章节来回跳
    function tryAutoJumpTask() {
        if (!state.settings.studyAutoNext) return;
        // 登录页不跳转任务点
        if (isLoginPage()) return;
        // 修复（2026-09）：非刷课界面禁止跳任务点
        if (!isStudyInterface()) return;
        const now = Date.now();
        // 10秒防抖（任务点跳转是大动作，太短会在多个未完成任务点间来回跳，触发人机验证）
        if (now - _STUDY.lastJumpAt < 10000) return;

        // 如果正在处理音频/听力任务，等它完成后再跳（避免音频没播完就跳走）
        if (_audioTaskRunning) return;

        // 检查当前是否有未结束的视频（有视频时不跳）
        // 注意：平台上已标记完成/非必做的视频（attachment.job=false）不算"未结束"，
        // 否则重新加载后的旧视频（DOM 里 ended=false）会永远卡住任务点推进
        const videos = findAllVideos().filter(v => isVideoTaskDone(v) !== true);
        if (videos.some(v => !v.ended)) return;

        // ===== 任务点级推进（机制经真机验证，同 OCS 的 job/attachments 体系）=====
        // 用户场景：2.2 章内小节1=视频1、小节2=视频2、小节3=习题——
        // 本小节视频全部刷完后：按习题决策处理（跳过/自动作答/等外部脚本作答），
        // 然后点"下一节"继续；"下一节"消失（本章走完）才跳下一个未完成章节。
        {
            const tasks = scanChaoxingChapterTasks();
            // 修复（2026-09）：attachments 可判定时，只要本小节还有未完成任务点（视频/文档），
            // 就原地等待平台自动切下一卡片或 attachments 刷新，绝不执行后面的
            // "跳下一未完成章节/跳最早未完成/候选元素点击"等与平台抢导航的动作。
            // 否则多个未完成节点会在二者之间来回跳（真机表现：A←→B 反复跳，触发人机验证）。
            if (tasks.known && (tasks.unfinishedVideos > 0 || tasks.unfinishedDocs > 0)) {
                return;
            }
            if (tasks.known && tasks.unfinishedVideos === 0 && tasks.unfinishedDocs === 0) {
                let workCount = tasks.unfinishedWork;
                let workKey = (new URLSearchParams(location.search).get('chapterId') || 'na') + '|' + (tasks.workJids || []).join(',');
                // 兜底：attachments 没报 work 但页面实际渲染了题目（部分课程的章节测验卡片不在
                // attachments 里，真机截图验证过这种情况）→ 按 DOM 里的 .TiMu 判定
                if (workCount === 0) {
                    const domQuiz = (() => {
                        let n = 0;
                        const v = (doc, d) => {
                            if (!doc || d > 3) return;
                            try { n += doc.querySelectorAll('.TiMu').length; } catch (e) {}
                            for (const f of doc.querySelectorAll('iframe')) { try { v(f.contentDocument, d + 1); } catch (e) {} }
                        };
                        v(document, 0);
                        return n;
                    })();
                    if (domQuiz > 0) {
                        workCount = 1;
                        workKey = (new URLSearchParams(location.search).get('chapterId') || 'na') + '|domquiz';
                    }
                }
                if (workCount > 0) {
                    const action = decideWorkAction();

                    if (action === 'skip') {
                        if (typeof addLog === 'function') addLog('刷课: 习题小节按设置跳过', 'info');
                        advanceSectionOrChapter();
                        return;
                    }
                    if (action === 'answer') {
                        // 自动作答：作答期间不推进（processSingleQuestion 逐题处理，只保存不提交）
                        try { tryAnswerWorkSection(workKey); } catch (e) {}
                        const st = _STUDY.work || {};
                        const timedOut = st.key === workKey && Date.now() - (st.startedAt || 0) > 150000; // 作答兜底超时
                        if ((st.key === workKey && (st.saved || st.phase === 'done')) || timedOut) {
                            if (typeof addLog === 'function') addLog('刷课: 习题已处理完成，进入下一节', 'success');
                            advanceSectionOrChapter();
                        }
                        return;
                    }
                    // action === 'wait'：没配作答引擎（如用户用另一个脚本答题），原地等题目被填
                    if (!_STUDY.work || _STUDY.work.key !== workKey) {
                        _STUDY.work = { key: workKey, phase: 'wait', startedAt: Date.now(), saved: false };
                        if (typeof addLog === 'function') addLog('刷课: 检测到习题小节且未配置作答引擎，等待外部答题（最多90秒，之后跳过）', 'info');
                    }
                    const st = _STUDY.work;
                    if (quizLooksAnswered()) {
                        if (typeof addLog === 'function') addLog('刷课: 检测到习题已被作答（外部脚本或手动），进入下一节', 'success');
                        advanceSectionOrChapter();
                        return;
                    }
                    if (Date.now() - st.startedAt > WORK_WAIT_TIMEOUT_MS) {
                        if (typeof addLog === 'function') addLog('刷课: 等待习题作答超时，按跳过处理进入下一节（习题可稍后回来做）', 'warn');
                        advanceSectionOrChapter();
                        return;
                    }
                    return; // 继续等待
                }
                // 本小节没有习题任务（纯视频/文档已刷完）→ 直接推进
                advanceSectionOrChapter();
                return;
            }
        }

        // 如果页面有正在播放的音频元素（听力任务点），也不跳
        try {
            const audios = document.querySelectorAll('audio');
            for (const a of audios) {
                if (a.src && !a.paused && !a.ended && a.readyState >= 2) return;
            }
            // 也检查 iframe 内的 audio
            const iframes = document.querySelectorAll('iframe');
            for (const f of iframes) {
                try {
                    const doc = f.contentDocument;
                    if (!doc) continue;
                    const iframeAudios = doc.querySelectorAll('audio');
                    for (const a of iframeAudios) {
                        if ((a.src || a.querySelector('source')) && !a.paused && !a.ended && a.readyState >= 2) return;
                    }
                } catch (e) { /* 跨域 */ }
            }
        } catch (e) {}

        // 优先策略：跳到“当前章节之后的下一个未完成章节”（视频看完直接进下一章，不回头做题）
        if (typeof tryJumpToNextUnfinishedChapter === 'function') {
            const chapters = (typeof findUnfinishedChapters === 'function') ? findUnfinishedChapters() : [];
            const currentIdx = chapters.findIndex(c => c.isActive);
            const hasNextUnfinished = currentIdx !== -1 && chapters.slice(currentIdx + 1).some(c => c.unFinishCount > 0);
            if (hasNextUnfinished) {
                tryJumpToNextUnfinishedChapter();
                return;
            }
        }

        // 兜底策略：跳到“最早未完成章节”（兼容）
        const chapters = (typeof findUnfinishedChapters === 'function') ? findUnfinishedChapters() : [];
        if (chapters.length > 0) {
            const first = chapters.find(c => c.unFinishCount > 0);
            if (first && !first.isActive) {
                // 跳到最早未完成
                _STUDY.lastJumpAt = now;
                try {
                    // 油猴沙箱里页面函数挂在 unsafeWindow 上（OCS/超新的做法），
                    // 沙箱 window 上没有 getTeacherAjax，直接 typeof 永远是 undefined
                    const pageWin = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
                    if (first.source === 'getTeacherAjax' && typeof pageWin.getTeacherAjax === 'function') {
                        const oc = first.element.getAttribute('onclick') || '';
                        const m = oc.match(/\('(.*?)','(.*?)','(.*?)'\)/);
                        if (m) {
                            pageWin.getTeacherAjax(m[1], m[2], m[3]);
                            if (typeof addLog === 'function') {
                                addLog(`刷课: 当前任务点完成，跳到最早未完成章节（chapterId=${m[3]}）`, 'success');
                            }
                            scheduleAfterJump('任务点完成-跳最早');
                            return;
                        }
                    }
                    const target = first.element.querySelector('.posCatalog_name, .chapter_name, .job_name, .name, a, .leaf-title, .topic-title, .lesson-title, .unit-title, h3, h4, span')
                                 || first.element;
                    target.click();
                    if (typeof addLog === 'function') {
                        addLog('刷课: 当前任务点完成，跳到最早未完成章节', 'success');
                    }
                    scheduleAfterJump('任务点完成-跳最早');
                } catch (e) {}
                return;
            }
        }

        // ===== 兜底策略：原"next"逻辑（没解析出chapter列表时）=====
        // 获取当前平台（用于加载平台特定选区器）
        const platform = (typeof detectPlatform === 'function') ? detectPlatform() : null;
        const platformSels = platform && platform.selectors ? platform.selectors : {};

        // 找下一个任务点
        // 候选选择器：先试平台专用，再试通用
        const candidates = [
            // 超星专用
            '.posCatalog_active + .posCatalog_item, .posCatalog_active ~ .posCatalog_item',
            '.posCatalog_name',
            '.job_item:not(.finished)',
            '.chapter_item:not(.finished)',
            '.catalog_item:not(.finished)',
            '.task-point:not(.finished)',
            // 平台专用
            (platformSels.taskPoint || '') + ' ~ *:not(.finished):not(.complete)',
            // 通用：tab栏下一个
            '.tabtags .currents + *, .tabs .currents ~ *:not(.finished):not(.complete)',
            // 通用：菜单下一项
            '.menu-item.active ~ .menu-item:not(.finished)',
            // 通用：列表下一项
            'li.active + li, li.currents + li, li.currents ~ li'
        ].filter(s => s && s.trim());

        for (const sel of candidates) {
            // 找包含"完成"或非active的项
            let nextNode = null;
            if (sel.includes('posCatalog_active')) {
                const active = document.querySelector('.posCatalog_active');
                if (active && active.nextElementSibling) {
                    nextNode = active.nextElementSibling;
                }
            } else {
                const nodes = document.querySelectorAll(sel);
                for (const n of nodes) {
                    if (n !== document.querySelector('.posCatalog_active') &&
                        !n.classList.contains('finished') &&
                        !n.classList.contains('complete')) {
                        nextNode = n;
                        break;
                    }
                }
            }

            if (nextNode) {
                _STUDY.lastJumpAt = now;
                const platformName = platform ? platform.name : '当前平台';
                if (typeof addLog === 'function') {
                    addLog(`刷课: 当前任务点完成，即将跳转下一项（${platformName}）`, 'success');
                }
                try {
                    // 优先点击内部锚点或 name 节点
                    const target = nextNode.querySelector('.posCatalog_name, .chapter_name, .job_name, .name, a, .leaf-title, .topic-title, .lesson-title, .unit-title')
                                 || nextNode;
                    target.click();
                    scheduleAfterJump('兜底-next');
                } catch (e) {}
                return;
            }
        }
    }

    // 自动连播：视频ended → 找下一个video source并切换
    function tryAutoLoop() {
        if (!state.settings.studyLoop) return;
        // 跟 tryAutoJumpTask 共享逻辑：都靠点击下一个任务点
        tryAutoJumpTask();
    }

    // 自动关弹窗：检测 "习惯分已满" / "确认" / "是否继续" 等弹窗
    function tryCloseDialog() {
        if (!state.settings.studyAutoCloseDialog) return;
        const now = Date.now();
        if (now - _STUDY.lastCloseAt < 2000) return;

        // 超星原生确认框："当前章节还有任务点未完成，是否去完成？"（按钮：去学习 / 下一节）
        // 遇到章节测验/习题想跳过时平台会弹这个框。
        // 按"跳过习题"设置自动选择：开着 → 点"下一节"直接跳过；关着 → 点"去学习"留下答题。
        // 识别锚点：按钮文字"去学习"是该弹窗独有文案（注意排除章内导航的"下一节"按钮，
        // 只在弹窗容器内找配对的"下一节"）
        try {
            const goStudyBtn = queryAllDocs('a, button, span, div').find(el => {
                try {
                    if (!el.offsetParent) return false;
                    return (el.textContent || '').trim() === '去学习' && el.querySelectorAll('*').length <= 2;
                } catch (e) { return false; }
            });
            if (goStudyBtn) {
                let container = goStudyBtn.parentElement;
                let nextBtn = null;
                for (let i = 0; i < 5 && container && !nextBtn; i++) {
                    nextBtn = Array.from(container.querySelectorAll('a, button, span, div')).find(el => {
                        try {
                            return el !== goStudyBtn && el.offsetParent &&
                                   (el.textContent || '').trim() === '下一节' &&
                                   el.querySelectorAll('*').length <= 2;
                        } catch (e) { return false; }
                    });
                    if (!nextBtn) container = container.parentElement;
                }
                if (nextBtn) {
                    // 与习题决策保持一致：
                    //   勾选"总是跳过" → 下一节；
                    //   智能模式：习题已被作答/我们已保存 → 下一节；仍在等待作答 → 去学习（不打断）
                    let holdForWork = false;
                    try {
                        if (state.settings.skipExercise !== true) {
                            holdForWork = !quizLooksAnswered() && !(_STUDY.work && _STUDY.work.saved);
                        }
                    } catch (e) {}
                    if (!holdForWork) {
                        nextBtn.click();
                        if (typeof addLog === 'function') addLog('刷课: 检测到"任务点未完成"确认框，自动点击"下一节"继续', 'info');
                    } else {
                        goStudyBtn.click();
                        if (typeof addLog === 'function') addLog('刷课: 检测到"任务点未完成"确认框，点击"去学习"（等待习题被作答）', 'info');
                    }
                    _STUDY.lastCloseAt = now;
                    return;
                }
            }
        } catch (e) {}

        // 学习通习惯分弹窗："当天学习时间已满"
        // 超星确认弹窗：确定/关闭按钮
        const dialogSelectors = [
            { sel: '.layui-layer-btn0, .layui-layer-btn a', text: '确定' },     // layui弹窗"确定"
            { sel: '.el-message-box__btns button.el-button--primary', text: '确定' }, // elementUI
            { sel: '.ant-modal-confirm-btns button.ant-btn-primary', text: '确定' },   // antd
            { sel: '.dialog-footer .btn-primary, .dialog button.btn-primary', text: '确定' },
            { sel: 'button:contains("确定"):visible', text: '确定' },
            { sel: 'button:contains("我知道了"):visible', text: '我知道了' },
            { sel: 'button:contains("继续学习"):visible', text: '继续学习' }
        ];

        for (const { sel, text } of dialogSelectors) {
            try {
                let btns = [];
                if (sel.includes(':contains')) {
                    // 自定义contains选择器（jQuery风格，原生不支持）
                    const baseSel = sel.split(':contains')[0] || 'button';
                    const all = document.querySelectorAll(baseSel);
                    btns = Array.from(all).filter(b => {
                        if (b.offsetParent === null && sel.includes(':visible')) return false; // 不可见
                        const t = (b.textContent || '').trim();
                        return t === text || t.includes(text);
                    });
                } else {
                    btns = Array.from(document.querySelectorAll(sel)).filter(b => {
                        const rect = b.getBoundingClientRect();
                        return rect.width > 0 && rect.height > 0;  // 可见
                    });
                }
                if (btns.length > 0) {
                    btns[0].click();
                    _STUDY.lastCloseAt = now;
                    if (typeof addLog === 'function') {
                        addLog(`刷课: 自动关闭弹窗（${text}）`, 'info');
                    }
                    return;
                }
            } catch (e) {}
        }
    }

    // 视频内嵌题目处理
    // 学习通在某些视频里会暂停播放，弹出选择题让用户做
    // 策略：随机选一个 → 点提交按钮 → 移除题目容器（让视频继续播）
    // 在顶层文档 + 所有可访问的同源 iframe 文档里查询元素
    // 超星的弹题层（#video .ans-videoquiz）在视频 iframe 内部，只查顶层 document 永远找不到
    function queryAllDocs(selector) {
        const out = [];
        const scan = (doc) => {
            if (!doc) return;
            try {
                out.push(...Array.from(doc.querySelectorAll(selector)));
            } catch (e) {}
            try {
                const iframes = doc.querySelectorAll('iframe');
                for (const f of iframes) {
                    try { if (f.contentWindow && f.contentWindow.document) scan(f.contentWindow.document); } catch (e) {}
                }
            } catch (e) {}
        };
        scan(document);
        return out;
    }

    function queryOneDoc(selector) {
        const all = queryAllDocs(selector);
        return all.length > 0 ? all[0] : null;
    }

    function handleVideoQuiz() {
        // 找当前可见的内嵌题目容器
        // 视频内嵌题目选择器，支持：超星、雨课堂、MOOC、智慧树、智慧职教
        const platform = (typeof detectPlatform === 'function') ? detectPlatform() : null;
        const platformSels = platform && platform.selectors ? platform.selectors : {};

        const quizContainers = [
            '#video .ans-videoquiz',
            '.ans-videoquiz',
            '.videoquiz',
            '.video-quiz',
            '#videoquiz',
            '.x-videoquiz',
            '.ans-task-videoquiz',
            '.video_popup',  // 部分平台
            '.exam_popup',
            // 平台专用
            platformSels.videoQuizPanel,
            // 跨平台兜底
            '.topic-item:not(.done)',
            '.video-question',
            '.quiz-popup'
        ].filter(Boolean);
        for (const sel of quizContainers) {
            let containers = [];
            try { containers = queryAllDocs(sel); } catch(e){ continue; }
            for (const box of containers) {
                // 检查是否真的可见
                if (!box || !box.offsetParent) continue;
                // 找选项
                const optionSelectors = [
                    '.ans-videoquiz-opt label',
                    '.ans-videoquiz-option',
                    '.videoquiz-option',
                    '.option-item',
                    'label.radio',
                    'input[type="radio"]',
                    '.x-option',
                    // 跨平台
                    'label[for]',
                    '.option',
                    '.choice',
                    'li[role="option"]'
                ];
                let options = [];
                for (const os of optionSelectors) {
                    try {
                        const found = box.querySelectorAll(os);
                        if (found && found.length > 0) {
                            options = Array.from(found);
                            break;
                        }
                    } catch(e){}
                }
                if (options.length === 0) continue;
                // 随机选一个
                const pick = options[Math.floor(Math.random() * options.length)];
                // 模拟点击选项（label + 内部input都要点）
                if (typeof addLog === 'function') {
                    const labelText = (pick.textContent || '').trim().slice(0, 30);
                    addLog(`刷课: 视频内嵌题-选 [${labelText}]`, 'info');
                }
                try { pick.click(); } catch(e){}
                // label里如果有input也点
                const input = pick.querySelector && pick.querySelector('input');
                if (input) { try { input.click(); } catch(e){} }
                // 找提交按钮
                const submitSelectors = [
                    '#videoquiz-submit',
                    '.ans-videoquiz-submit',
                    '.videoquiz-submit',
                    'button.submit',
                    'button[type="submit"]',
                    'a.submit'
                ];
                let submitBtn = null;
                for (const ss of submitSelectors) {
                    try {
                        const f = box.querySelector(ss);
                        if (f) { submitBtn = f; break; }
                    } catch(e){}
                }
                // 也找全局提交按钮（含 iframe 内）
                if (!submitBtn) {
                    for (const ss of submitSelectors) {
                        try {
                            const f = queryOneDoc(ss);
                            if (f) { submitBtn = f; break; }
                        } catch(e){}
                    }
                }
                // 兜底：找包含"提交"文字的按钮
                if (!submitBtn) {
                    const allBtns = queryAllDocs('button, a');
                    for (const b of allBtns) {
                        const t = (b.textContent || '').trim();
                        if (t === '提交' || t === '提交答案' || t === '确认提交' || t === '提交试题') {
                            submitBtn = b; break;
                        }
                    }
                }
                if (submitBtn) {
                    setTimeout(() => {
                        try {
                            submitBtn.click();
                            if (typeof addLog === 'function') {
                                addLog('刷课: 视频内嵌题-已提交', 'success');
                            }
                            // 提交后立即移除容器+隐藏 x-component
                            setTimeout(() => {
                                try { box.remove(); } catch(e){}
                                // 隐藏可能的弹窗覆盖层
                                document.querySelectorAll('.x-component-default').forEach(c => {
                                    try { c.style.display = 'none'; } catch(e){}
                                });
                            }, 500);
                        } catch(e){}
                    }, 300);
                }
                return true; // 处理了一个
            }
        }
        return false;
    }

    // 反鼠标检测：劫持 document 的 mouseleave / visibilitychange 事件
    // 思路：阻止播放器自带的"鼠标离开就暂停"事件触发
    // 注意：超星/学习通的检测方式多种多样，这里用**统一拦截**的方式
    function setupAntiMouseLeave() {
        if (!state.settings.studyAntiPause) return;
        // 已经设过标记，避免重复挂监听
        if (window._aa_anti_mouse_installed) return;
        window._aa_anti_mouse_installed = true;

        // 1. 重写 video 的 pause 方法（让"检测到鼠标离开就pause"失效）
        const origPause = HTMLMediaElement.prototype.pause;
        // 存到window以便停止时还原
        window._aa_orig_pause = origPause;
        HTMLMediaElement.prototype.pause = function() {
            // 用户主动暂停 → 正常暂停
            if (window._aa_user_intended_pause) {
                return origPause.apply(this, arguments);
            }
            // 关键修复（2026-10-23 实机复核：一章多个视频时来回横跳）：
            // 平台"切任务点"时同样是先 pause 旧视频、再 play 新视频。
            // 原来这里把 pause 整个吞掉（连 origPause 都不调用）→ 旧视频根本停不下来，
            // 新旧两个视频同时播；脚本下一轮又按"第一个 paused 的视频"去挑 → 轮流播放。
            // 现在只对"脚本当前的目标视频"做保护（那才是鼠标离开检测才会暂停的），
            // 其它视频一律正常放行，让平台能正常切换任务点。
            if (!isTargetMedia(this)) {
                return origPause.apply(this, arguments);
            }
            if (this.ended) {
                return origPause.apply(this, arguments);
            }
            // 拦下这次暂停，并在下一拍恢复播放
            setTimeout(() => {
                if (!this.ended && this.paused) {
                    this.play().catch(() => {});
                }
            }, 0);
        };

        // 2. 拦截 mcpaperwrapper 等容器的 mouseleave
        //    学习通：播放器最外层是 #video 或者 .vjs-tech，hover检测在它们的祖先元素上
        const blockLeave = (e) => {
            // 阻止冒泡到检测层（不调用 stopImmediatePropagation，保留其他正常监听）
            // 这里什么都不做，依赖 video.pause 的覆盖
        };
        document.addEventListener('mouseleave', blockLeave, true);
        document.addEventListener('mouseout', blockLeave, true);

        // 给当前所有 video 挂上 pause 事件即时恢复监听（用同步事件，不被 setTimeout 节流）
        try {
            const curVideos = findAllVideos();
            for (const v of curVideos) attachVideoPauseRecovery(v);
        } catch (e) {}

        // 监听 DOM 变化，新出现的 video 自动挂上 pause 事件即时恢复
        if (!window._aa_video_recovery_observer) {
            try {
                const obs = new MutationObserver((mutations) => {
                    if (!state.settings.studyAntiPause) return;
                    for (const m of mutations) {
                        for (const node of m.addedNodes) {
                            if (!node || node.nodeType !== 1) continue;
                            // 节点本身是 video/audio
                            if ((node.tagName === 'VIDEO' || node.tagName === 'AUDIO') &&
                                typeof node.play === 'function') {
                                attachVideoPauseRecovery(node);
                            }
                            // 子节点中包含 video/audio
                            try {
                                const sub = node.querySelectorAll && node.querySelectorAll('video, audio');
                                if (sub) {
                                    for (const s of sub) attachVideoPauseRecovery(s);
                                }
                            } catch (e) {}
                        }
                    }
                });
                obs.observe(document.documentElement || document.body, { childList: true, subtree: true });
                window._aa_video_recovery_observer = obs;
            } catch (e) {}
        }

        if (typeof addLog === 'function') {
            addLog('刷课: 反鼠标检测已挂载', 'info');
        }
    }

    // ========== Web Audio API 静音防冻结 ==========
    // 原理：Chrome 在 Memory Saver 模式下会冻结长时间无活动标签页
    //       但如果标签页在"播放音频"，浏览器认为它活跃，不会冻结
    //       用 AudioContext + gain=0 播放人耳听不到的"音频"，即可让标签页保持活跃
    // 注意：AudioContext 必须在用户点击事件中创建（autoplay policy）
    //       因此在 startStudy 用户点击"开始刷课"按钮时调用
    let _keepAliveAudioCtx = null;
    let _keepAliveOscillator = null;

    function startKeepAliveAudio() {
        if (_keepAliveAudioCtx) return; // 已经在运行
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) return;
            const ctx = new AudioContext();
            // 部分浏览器要求 resume() 才能播放
            if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
                ctx.resume().catch(() => {});
            }
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            gain.gain.value = 0; // 静音（人耳完全听不到）
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            _keepAliveAudioCtx = ctx;
            _keepAliveOscillator = osc;
            if (typeof addLog === 'function') {
                addLog('刷课: 已启动静音防冻结（防止后台标签页被冻结）', 'info');
            }
        } catch (e) {
            // 失败不影响主流程
        }
    }

    function stopKeepAliveAudio() {
        try {
            if (_keepAliveOscillator) {
                try { _keepAliveOscillator.stop(); } catch (e) {}
                try { _keepAliveOscillator.disconnect(); } catch (e) {}
                _keepAliveOscillator = null;
            }
            if (_keepAliveAudioCtx) {
                try { _keepAliveAudioCtx.close(); } catch (e) {}
                _keepAliveAudioCtx = null;
            }
        } catch (e) {
            _keepAliveOscillator = null;
            _keepAliveAudioCtx = null;
        }
    }

    // ========== video.pause 事件即时恢复（替代 setTimeout 0）==========
    // 原来的反鼠标检测在拦截 pause 后用 setTimeout(fn, 0) 恢复
    // 问题：setTimeout 0 在后台标签页被节流到 1 分钟，导致恢复不及时
    // 解决：用 video 元素的 'pause' 事件做即时恢复
    //       pause 事件是同步触发的 DOM 事件，不受 setTimeout 节流影响
    function attachVideoPauseRecovery(v) {
        if (!v || v._aaPauseRecoveryAttached) return;
        v._aaPauseRecoveryAttached = true;
        v.addEventListener('pause', function onVideoPaused() {
            // 用户主动暂停时跳过（stopStudy 时会设置该标记）
            if (window._aa_user_intended_pause) return;
            // 监控器停播"已完成任务点"视频时设置的一次性抑制标记：
            // pause 事件是异步派发的，等本 handler 跑起来时上面的全局标记已被复位，
            // 若不单独抑制，这里会立刻把刚停掉的已完成视频又播起来
            if (this._aa_suppress_recovery) {
                this._aa_suppress_recovery = false;
                return;
            }
            // 已结束的视频不需要恢复
            if (this.ended) return;
            // 多视频互斥（2026-10-23，修复"多个视频轮流播放"）：
            // 只保护"脚本当前目标视频"的暂停。
            // 其它视频被平台暂停 = 平台正在切任务点，这时抢回来就会和平台拉锯
            // （旧视频被拉回→平台停新视频→再拉回旧视频→…），表现为视频之间轮流播。
            if (!isTargetMedia(this)) return;
            // 平台已标记完成的任务点不恢复（防止重播已完成的视频）
            if (isVideoTaskDone(this) === true) return;
            // 多视频互斥（2026-09 修复来回抢播）：如果已有"另一个"媒体在播放，
            // 说明这次暂停是平台/用户为了播别的视频（切换），不要把它拉回来——
            // 否则旧视频被恢复、新视频又被打断，两个视频来回切换永远停不下来
            try {
                const selfWin = this.ownerDocument && this.ownerDocument.defaultView;
                if (anyOtherMediaPlaying(selfWin)) return;
            } catch (e) {}
            // 已经在播放中（被反鼠标检测拦截后没真暂停）跳过
            if (!this.paused) return;
            // 修复（2026-09）：若此刻有"另一个"视频正在播放，说明用户/平台主动切换到了别的视频，
            // 本视频是被切换暂停的（不是鼠标离开导致）。若强行恢复，会和正在播的那个来回高频抢播。
            try {
                const others = findAllVideos();
                for (const o of others) {
                    if (o === this) continue;
                    if (!o.paused && !o.ended) return;
                }
            } catch (e) {}
            // 同步恢复 - 不经 setTimeout，不被后台节流
            try {
                // 重新应用倍速和音量（防止超星内部恢复时把我们的设置重置）
                if (state && state.settings) {
                    if (state.settings.studyRate) {
                        try { this.playbackRate = state.settings.studyRate; } catch (e) {}
                    }
                    if (typeof state.settings.studyVolume === 'number') {
                        try {
                            this.volume = state.settings.studyVolume;
                            this.muted = (state.settings.studyVolume === 0);
                        } catch (e) {}
                    }
                }
                const p = this.play();
                if (p && typeof p.catch === 'function') {
                    p.catch(() => {}); // 静默吞掉 autoplay policy 错误（已有其他机制处理）
                }
            } catch (e) {}
        });
    }

    // ========== 视频自动播放核心逻辑（页面刷新后也能恢复）==========
    // 问题：getTeacherAjax 会刷新页面，导致跳转前的定时器被取消
    // 解决方案：每次 startStudy 时启动一个"视频监控器"，持续检测并播放视频
    // 策略：
    //   1. 持续轮询查找未播放的视频
    //   2. 检测到新视频时立即播放
    //   3. 使用 playWithErrorHandler 处理 autoplay 限制
    //   4. 增加恢复尝试次数，避免浏览器最小化后放弃恢复
    let _videoMonitorInterval = null;
    let _lastActivatedSrc = '';

    function startVideoMonitor() {
        // 停止已有的监控
        if (_videoMonitorInterval) {
            clearInterval(_videoMonitorInterval);
        }

        let consecutiveNoVideo = 0;
        let consecutiveNoPlay = 0;
        let lastPlayingTime = Date.now();  // 记录上次有视频播放的时间

        _videoMonitorInterval = setInterval(() => {
            if (!_STUDY.running) {
                clearInterval(_videoMonitorInterval);
                _videoMonitorInterval = null;
                return;
            }

            const videos = findAllVideos();

            if (videos.length === 0) {
                consecutiveNoVideo++;
                consecutiveNoPlay = 0;
                // 延长到60秒，避免视频还没加载就停止监控
                if (consecutiveNoVideo > 60) {
                    if (typeof addLog === 'function') {
                        addLog('刷课: 60秒内未检测到视频，暂停监控', 'info');
                    }
                    clearInterval(_videoMonitorInterval);
                    _videoMonitorInterval = null;
                }
                return;
            }

            consecutiveNoVideo = 0;

            // 关键：如果页面已有视频在播放，本轮不做任何操作
            // 避免 A在播→脚本播B→B中断A→下一秒A暂停→又播A→循环
            // 例外（2026-09 修复）：正在播的是"平台上已标记完成"的任务点视频时必须干预——
            // 真机复现：刷新/重进小节后，已完成任务点的视频卡片仍在 DOM 且可能自动续播，
            // 平台自动连播也会翻回已完成卡片。不干预的话就会把看过的视频整段重看一遍。
            // 处理：pause 它（走 _aa_user_intended_pause 通道真正生效），改播第一个未完成任务点。
            let playingCompleted = null;
            const anyPlaying = videos.some(v => {
                if (v.paused || v.ended) return false;
                if (isVideoTaskDone(v) === true) { playingCompleted = v; return true; }
                return true;
            });
            if (anyPlaying) {
                if (playingCompleted) {
                    // 用户手动点过这个已完成视频（想自己重看）→ 尊重选择，不干预
                    let isUserRewatch = false;
                    try {
                        const win = playingCompleted.ownerDocument && playingCompleted.ownerDocument.defaultView;
                        const fe = win && win.frameElement;
                        const jid = fe ? readCardJobId(fe) : null;
                        isUserRewatch = !!jid && String(jid) === String(_STUDY.userPickedJobid || '');
                    } catch (e) {}
                    if (!isUserRewatch) {
                        try {
                            // 一次性抑制恢复：pause 事件是异步派发的，若不加标记，
                            // attachVideoPauseRecovery 会在下一轮把刚停掉的已完成视频又 play() 起来
                            playingCompleted._aa_suppress_recovery = true;
                            window._aa_user_intended_pause = true;
                            playingCompleted.pause();
                        } catch (e) {}
                        window._aa_user_intended_pause = false;
                        if (typeof addLog === 'function') {
                            addLog('刷课: 检测到正在重播已完成任务点的视频，已停止并切换到未完成任务点', 'warn');
                        }
                        playFirstUnfinishedVideo('刷课: 跳过已完成');
                        lastPlayingTime = Date.now();
                    }
                }
                consecutiveNoPlay = 0;
                lastPlayingTime = Date.now();  // 更新上次播放时间
                return;
            }

            // 没有视频在播放 → 尝试播放一个（只播一个，不播多个）
            // 关键改进：如果距离上次播放超过30秒，重置 consecutiveNoPlay 计数器
            // 这样浏览器最小化后视频停止，回来时还能恢复
            const timeSinceLastPlay = Date.now() - lastPlayingTime;
            if (timeSinceLastPlay > 30000) {
                consecutiveNoPlay = 0;  // 重置计数器
            }

            // 统一决策该播哪个（2026-09 修复多视频来回抢播）：
            // 用户手动点过的优先；否则按卡片顺序第一个未完成的。
            // 用户点的还没缓冲好时 pickMediaToPlay 仍返回它，这里因无播放源/未就绪自然进入等待，
            // 绝不回头抢播前面的视频。
            // 2026-10-23：先推进队列指针（只进不退），保证"第一个播完→第二个→第三个"。
            advanceMediaSeq();
            const pick = pickMediaToPlay(videos);
            if (pick) {
                const v = pick.media;
                // 标记目标视频：只有它享受防暂停保护，其余视频的 pause 一律放行给平台
                markTargetMedia(v);
                const playable = !(v.ended || !v.paused || !hasVideoSource(v));
                if (playable) {
                    let tiny = false;
                    try {
                        if (v.videoWidth > 0 && v.videoWidth < 200) tiny = true;
                        if (v.videoHeight > 0 && v.videoHeight < 200) tiny = true;
                    } catch (e) {}
                    if (!tiny) {
                        const isNewVideo = (v.src !== _lastActivatedSrc && _lastActivatedSrc !== '');

                        consecutiveNoPlay++;
                        // 改进：增加尝试次数到10次，并且如果是新视频或长时间没播放，总是尝试
                        if (consecutiveNoPlay <= 10 || isNewVideo || timeSinceLastPlay > 10000) {
                            try {
                                if (state.settings.studyRate) v.playbackRate = state.settings.studyRate;
                                if (typeof state.settings.studyVolume === 'number') {
                                    v.volume = state.settings.studyVolume;
                                }
                            } catch (e) {}

                            const res = playWithErrorHandler(v);
                            const onOk = () => {
                                consecutiveNoPlay = 0;
                                lastPlayingTime = Date.now();
                                _lastActivatedSrc = v.src;
                                if (typeof addLog === 'function') {
                                    const reason = isNewVideo ? '检测到新视频' : '自动恢复播放';
                                    addLog(`刷课: ${reason}（${v.videoWidth}x${v.videoHeight}）`, 'success');
                                }
                            };
                            if (res && typeof res.then === 'function') {
                                res.then(ok => { if (ok) onOk(); }).catch(() => {});
                            } else if (res) {
                                onOk();
                            }
                        }
                    }
                }
            }
        }, 1000);
    }

    // 页面可见性变化时重新激活视频
    // 当用户切换标签页回来时，浏览器可能会暂停视频，需要重新激活
    function setupVisibilityMonitor() {
        document.removeEventListener('visibilitychange', _handleVisibilityChange);
        document.addEventListener('visibilitychange', _handleVisibilityChange);
    }

    function _handleVisibilityChange() {
        // 改进：无论页面是否可见，只要刷课在运行就尝试恢复
        // 因为浏览器最小化后视频可能被暂停，回来时需要重新恢复
        if (_STUDY.running) {
            setTimeout(() => {
                if (!_STUDY.running) return;
                const videos = findAllVideos();
                // 已有视频在播放 → 不干预
                if (videos.some(v => !v.paused && !v.ended)) return;
                // 修复（2026-09）：只恢复"第一个未完成任务点"的视频，
                // 之前"播任何暂停视频"会把已完成的任务点也重播一遍
                playFirstUnfinishedVideo('刷课: 页面可见性恢复');
            }, 500);  // 缩短延迟到500ms，更快恢复
        }
    }

    // 页面加载完成时等待并播放
    function setupPageLoadMonitor() {
        // 页面加载完成后，等待 3 秒让视频加载，然后尝试播放
        // 这个逻辑在每次页面完全加载时都会执行
        if (document.readyState === 'complete') {
            onPageFullyLoaded();
        } else {
            window.addEventListener('load', onPageFullyLoaded);
        }
    }

    function onPageFullyLoaded() {
        if (!_STUDY.running) return;

        setTimeout(() => {
            if (!_STUDY.running) return;

            // 修复（2026-09）：改用 playFirstUnfinishedVideo——
            // 原逻辑"找第一个 paused 的视频就播"会在刷新后重播已完成的任务点视频，
            // 导致续播点错位（用户反馈：再进网页时从错误的位置开始看）
            playFirstUnfinishedVideo('刷课: 页面加载完成');

            startVideoMonitor();
        }, 3000);
    }

    // 开始刷课
    function startStudy() {
        if (state.portalAccess.blocked) {
            showPortalDialog('脚本设备已被限制', state.portalAccess.blockedReason || '该脚本客户端已被管理员限制使用', {
                confirmText: '知道了'
            });
            return;
        }
        if (_STUDY.running) {
            if (typeof showToast === 'function') showToast('刷课已在运行', 'info');
            return;
        }
        // 登录页不启动刷课
        if (isLoginPage()) {
            if (typeof addLog === 'function') {
                addLog('刷课: 当前页面为登录页，已暂停刷课逻辑，请手动登录后刷新页面', 'warning');
            }
            if (typeof showToast === 'function') showToast('检测到登录页，请手动登录后再启动刷课', 'warning');
            _STUDY.running = false;
            state.settings.studyEnabled = false;
            return;
        }
        // 修复（2026-09 真机抓包）：非刷课界面不启动刷课。
        // 课程列表/课程门户/章节目录/个人空间等页面没有任务点视频，
        // 启动刷课只会误提示、误跳转、甚至误点"确定"确认站点的"未操作刷新"提示。
        if (!isStudyInterface()) {
            if (typeof addLog === 'function') {
                addLog('刷课: 当前不是课程学习页面，未启动刷课（请进入章节学习页面后再点开始）', 'warning');
            }
            if (typeof showToast === 'function') {
                showToast('请进入课程章节学习页面后再启动刷课', 'warning');
            }
            _STUDY.running = false;
            state.settings.studyEnabled = false;
            return;
        }
        _STUDY.running = true;
        resetStudyTaskFlags();
        setupStudyChapterClickWatcher();
        state.settings.studyEnabled = true;
        if (typeof saveAllConfig === 'function') saveAllConfig();
        // 同步启动所有 iframe 里的刷课 worker（跨域视频由 worker 就地控制）
        try { writeWorkerCfg(true); } catch (e) {}

        // 立即应用一次
        applyStudyRate(state.settings.studyRate, state.settings.studyVolume);

        // 挂反鼠标检测（一次性）
        setupAntiMouseLeave();

        // 启动静音防冻结（必须在用户点击事件中创建 AudioContext）
        // 防止 Chrome Memory Saver 模式冻结后台标签页
        startKeepAliveAudio();

        // 挂可见性监控（页面切换回来时重新激活视频）
        setupVisibilityMonitor();

        // 挂页面加载监控（页面刷新后自动播放）
        setupPageLoadMonitor();

        // 关键：用户在点"▶开始"时，浏览器把这个事件当作"用户激活"，
        // 在这个事件处理函数的同步执行流里调 play() 不受autoplay policy限制。
        // 我们立即尝试播放第一个未完成的任务点（抢这个激活窗口）
        // 修复（2026-09）：不再"抓第一个 paused 视频就播"——那会重播已完成任务点；
        // 按卡片顺序跳过 isPassed 的任务点，从第一个没刷完的视频继续
        try {
            const videos = findAllVideos();
            const anyPlaying = videos.some(v => !v.paused && !v.ended);
            if (!anyPlaying) {
                playFirstUnfinishedVideo('刷课: 启动');
            }
        } catch (e) {}

        // 记录启动时间（给 tryCorrectActiveChapter 防抖用）
        _STUDY.startedAt = Date.now();

        // 立即启动视频监控（覆盖页面已加载的情况）
        startVideoMonitor();

        // 启动后2秒 + 5秒 各尝试一次"跳到最早未完成章节"（给目录加载留时间）
        // 修复（2026-09）：用户刚手动点过章节（90 秒窗口）时不强制跳最早未完成，
        // 否则刷新后 AutoStart 又跳回最早未完成，把用户自选章节拽回去来回跳
        setTimeout(() => {
            try {
                if (hasRecentUserSelection()) {
                    if (typeof addLog === 'function') {
                        addLog('刷课: 检测到你刚手动选择过章节，跳过自动跳转（尊重手动选择）', 'info');
                    }
                    return;
                }
                tryJumpToFirstUnfinished(false);
            } catch (e) {}
        }, 2000);
        setTimeout(() => {
            try {
                if (hasRecentUserSelection()) return;
                tryJumpToFirstUnfinished(false);
            } catch (e) {}
        }, 5000);

        // 主循环：每1秒检查一次
        _STUDY.intervalId = setInterval(() => {
            if (!_STUDY.running) {
                _STUDY.stop();
                return;
            }
            // 登录页直接跳过，不执行任何刷课操作
            if (isLoginPage()) {
                if (!_STUDY._loginPageLogged) {
                    _STUDY._loginPageLogged = true;
                    if (typeof addLog === 'function') {
                        addLog('刷课: 检测到当前页面为登录页，已暂停刷课相关操作，请登录后刷新页面', 'warning');
                    }
                }
                return;
            } else {
                _STUDY._loginPageLogged = false;
            }
            // 修复（2026-09 真机抓包）：不在刷课界面时暂停全部刷课动作。
            // 否则在课程列表/课程门户/章节目录/个人空间等页面仍会执行跳章节、
            // 点"下一节"、关弹窗（可能误点"确定"确认站点"未操作刷新"提示）等操作，
            // 表现为"不在刷课界面也提示刷课"且界面被无故刷新。
            // 回到刷课界面（/mycourse/studentstudy、/knowledge/cards）后自动恢复。
            if (!isStudyInterface()) {
                if (!_STUDY._leftStudyInterfaceLogged) {
                    _STUDY._leftStudyInterfaceLogged = true;
                    if (typeof addLog === 'function') {
                        addLog('刷课: 已离开课程学习页面，刷课动作暂停（回到章节学习页自动恢复）', 'warning');
                    }
                }
                return;
            } else {
                _STUDY._leftStudyInterfaceLogged = false;
            }
            try {
                // -1) 给顶层+各 iframe 文档补挂"手动选择视频"监听（幂等，2026-09 抢播修复依赖）
                try { installUserPickWatchers(); } catch (e) {}
                // 0) 修复控制条
                fixControlBar();
                // 0.5) 视频加载失败检测 + 人脸识别
                checkVideoLoadError();
                checkFaceRecognition();
                // 1) 给新出现的video应用倍速（迟加载的视频）
                applyStudyRate(state.settings.studyRate, state.settings.studyVolume);
                // 2) 视频内嵌题目（必须放最前，题目会卡视频）
                if (state.settings.studyHandleVideoQuiz) {
                    handleVideoQuiz();
                }
                // 2.5) 读章节（PPT/书籍/长时阅读）
                if (typeof tryReadTask === 'function') {
                    tryReadTask();
                }
                // 2.55) 音频/听力任务点（mp3等纯音频自动播放）
                if (typeof tryAudioTask === 'function') {
                    tryAudioTask();
                }
                // 2.6) 讨论自动回复
                if (typeof tryDiscuss === 'function') {
                    tryDiscuss();
                }
                // 3) 自动解除暂停
                tryAutoUnpause();
                // 4) 自动连播（任务点跳转）
                tryAutoLoop();
                // 4.25) 纯题目章节处理：停留后自动跳过
                tryHandleQuizOrSkip();
                // 4.5) 【已移除】每3秒"强制跳回最早未完成章节"的修正调度。
                //      OCS/超新都没有这个逻辑：它会把用户手动往后翻的页面拽回去，
                //      且"未完成"把习题也算在内，导致反复重看已完成章节的视频。
                //      现在只保留启动时的 tryJumpToFirstUnfinished（进入页面跳一次）；
                //      推进交给 tryAutoJumpTask 的任务点级逻辑。
                // 5) 自动关弹窗
                tryCloseDialog();
            } catch (e) {
                console.error('[StudyLoop] 错误:', e);
            }
        }, 1000);

        if (typeof addLog === 'function') {
            addLog(`刷课: 已启动（倍速${state.settings.studyRate}x / 音量${state.settings.studyVolume}）`, 'success');
        }
        if (typeof showToast === 'function') {
            showToast('刷课已启动', 'success');
        }
    }

    // 停止刷课：不仅清主循环，还要真把视频pause()掉、解除反鼠标劫持
    function stopStudy() {
        state.settings.studyEnabled = false;
        const studyEnabledCb = document.getElementById('set-study-enabled');
        if (studyEnabledCb) studyEnabledCb.checked = false;
        if (typeof saveAllConfig === 'function') saveAllConfig();
        // 主动 pause 所有正在播放的视频
        // 关键：设置 _aa_user_intended_pause 让重写的 pause() 真正执行
        try {
            window._aa_user_intended_pause = true;
            const vs = findAllVideos();
            for (const v of vs) {
                if (!v.paused) {
                    // 一次性抑制恢复：pause 事件是异步派发的，等 onVideoPaused 真正跑起来时
                    // 上面的 _aa_user_intended_pause 已被复位，若不设此标记，
                    // 监听器会把刚暂停的视频立刻又 play() 起来（导致"停止刷课"停不下来）
                    try { v._aa_suppress_recovery = true; } catch (e) {}
                    try { v.pause(); } catch (e) {}
                }
            }
            window._aa_user_intended_pause = false;
        } catch (e) {
            window._aa_user_intended_pause = false;
        }
        // 解除反鼠标劫持
        if (window._aa_orig_pause) {
            try { HTMLMediaElement.prototype.pause = window._aa_orig_pause; } catch (e) {}
            window._aa_orig_pause = null;
        }
        window._aa_anti_mouse_installed = false;
        // 停止静音防冻结
        stopKeepAliveAudio();
        // 清理 video 恢复 MutationObserver
        if (window._aa_video_recovery_observer) {
            try { window._aa_video_recovery_observer.disconnect(); } catch (e) {}
            window._aa_video_recovery_observer = null;
        }
        // 重置读章节 + 音频 + 讨论 状态（让用户重新启动刷课时能处理下一个任务点）
        try { resetStudyTaskFlags(); } catch (e) {}
        // 清掉 scheduleAfterJump 的轮询定时器
        try {
            if (_STUDY._jumpTimers) {
                _STUDY._jumpTimers.forEach(t => { try { clearTimeout(t); } catch (e) {} });
                _STUDY._jumpTimers = [];
            }
        } catch (e) {}
        try {
            if (_STUDY._forceJumpTimers) {
                _STUDY._forceJumpTimers.forEach(t => { try { clearTimeout(t); } catch (e) {} });
                _STUDY._forceJumpTimers = [];
            }
        } catch (e) {}
        // 清掉视频监控器
        try {
            if (_videoMonitorInterval) {
                clearInterval(_videoMonitorInterval);
                _videoMonitorInterval = null;
            }
        } catch (e) {}
        // 移除可见性监控（避免内存泄漏）
        try {
            document.removeEventListener('visibilitychange', _handleVisibilityChange);
        } catch (e) {}
        // 重置视频监控状态
        _lastActivatedSrc = '';
        _STUDY.currentMainVideo = null;
        _STUDY.quizProcessing = false;
        _STUDY.quizCheckedAt = 0;
        _STUDY.stop();
    }

    // ==================== iframe 刷课 worker（跨域视频支持） ====================
    // 学习平台的播放器常嵌在跨域 iframe 里（如智慧树 studyvideohls.zhihuishu.com），
    // 顶层脚本受同源策略限制摸不到视频元素。参考超新/OCS"脚本进 iframe"的思路：
    // 脚本本身也在 iframe 内运行，由本 worker 就地完成四件事——
    //   1) 应用倍速（含播放器重置后的漂移修正）
    //   2) 自动恢复播放（防暂停）
    //   3) 音量同步
    //   4) 视频播完 postMessage 通知顶层，由顶层 tryAutoJumpTask 切下一个任务点
    // 配置通过 GM 存储共享（Tampermonkey 所有 frame 共享同一存储），每秒轮询。
    // 仅在已知学习平台的域名上激活，普通网页的 iframe 完全不受影响。
    const WORKER_CFG_KEY = 'smart_answer_assistant_study_worker_cfg';

    function readWorkerCfg() {
        try {
            const raw = GM_getValue(WORKER_CFG_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (e) { return null; }
    }

    function writeWorkerCfg(running) {
        try {
            const s = state.settings || {};
            const cfg = JSON.stringify({
                running: !!running,
                rate: s.studyRate || 1,
                vol: (typeof s.studyVolume === 'number') ? s.studyVolume : 0,
                antiPause: s.studyAutoUnpause !== false,
                t: Date.now()
            });
            if (writeWorkerCfg._last !== cfg) {
                writeWorkerCfg._last = cfg;
                GM_setValue(WORKER_CFG_KEY, cfg);
            }
        } catch (e) {}
    }

    function isStudyPlatformHost() {
        const host = (location.hostname || '').toLowerCase();
        try {
            return PLATFORMS.some(p => (p.domains || []).some(d => hostMatchesDomain(host, d)));
        } catch (e) { return false; }
    }

    function setupStudyFrameWorker() {
        if (!isStudyPlatformHost()) return;
        const reportedEnded = new WeakSet();
        // 初始化"目标视频"标记（2026-10-23）：
        // 在顶层选定目标之前，谁都不享受防暂停保护。
        // 否则整章 N 个播放器 iframe 的 worker 会同时开抢，把各自的视频拉回来互相打断
        // → 表现为多个视频之间轮流播放、而且漏视频。
        try {
            if (window.top && window.top.__aa_targetMedia === undefined) {
                window.top.__aa_targetMedia = false;
            }
        } catch (e) {}

        setInterval(() => {
            const cfg = readWorkerCfg();
            const running = !!(cfg && cfg.running);
            const antiPause = !cfg || cfg.antiPause !== false;
            const rate = cfg ? (cfg.rate || 1) : 1;
            const vol = cfg ? cfg.vol : 0;

            let vids;
            try { vids = document.querySelectorAll('video, audio'); } catch (e) { return; }

            for (const v of vids) {
                if (typeof v.play !== 'function') continue;

                // 倍速漂移修正（播放器切清晰度会重置 playbackRate）
                try {
                    if (running && rate > 1 && Math.abs((v.playbackRate || 1) - rate) > 0.01) {
                        v.playbackRate = rate;
                    }
                } catch (e) {}

                // 音量同步
                try {
                    if (running && typeof vol === 'number' && v.volume !== vol) v.volume = vol;
                } catch (e) {}

                if (!running) continue;

                // 多视频互斥（2026-10-23，修复"多个视频之间轮流播放"）：
                // 学习通整章任务点的播放器 iframe 是同时存在的（knowledge/cards 是一个高 iframe，
                // 里面把所有任务点卡片全渲染出来，每个卡片再套一层自己的 videojs），
                // 所以这段防暂停逻辑会在 N 个 iframe 里各跑一份 —— 以前每个 worker 都想
                // 把自己 iframe 里的视频拉回来 → N 个视频互相抢播、来回切换。
                // 现在只有"顶层选定的目标视频"才享受保护，其它一律不碰。
                if (!isTargetMedia(v)) continue;

                // 防暂停：有播放源且已加载就自动恢复播放（尊重顶层的防暂停开关）
                // 修复（2026-09）：worker 跑在播放器 iframe 里，以前不管任务点是否已完成都会恢复播放，
                // 已完成任务点的视频会被 worker 原地重播。现在先查完成状态：
                // 学习通同源场景下能通过顶层 attachments 判定（job 消失/isPassed=true → 跳过）；
                // 跨域平台判不了（返回 null）时保持原行为，由顶层逻辑控制。
                try {
                    const taskDone = isVideoTaskDone(v);
                    if (taskDone === true) continue;
                } catch (e) {}
                // 全局互斥（2026-09 修复多视频来回抢播）：worker 只看得到自己 iframe 里的视频，
                // 用户点了同一小节的另一个视频时，旧视频的暂停是"被切换"，不能恢复——
                // 否则每个播放器 iframe 的 worker 各自把自己的视频拉回来，互相打断来回播。
                // 学习通同源可从顶层视角判断；跨域时 anyOtherMediaPlaying 返回 false，保持原行为。
                if (anyOtherMediaPlaying(window)) continue;
                try {
                    if (antiPause && v.paused && !v.ended && (v.readyState || 0) >= 2 && hasVideoSource(v)) {
                        const p = v.play();
                        if (p && p.catch) p.catch(() => {});
                    }
                } catch (e) {}

                // 播完上报（每个视频只报一次）
                try {
                    if (v.ended && !reportedEnded.has(v)) {
                        reportedEnded.add(v);
                        try { window.top.postMessage({ source: 'aa_study_worker', type: 'video_ended' }, '*'); } catch (e) {}
                    }
                } catch (e) {}
            }
        }, 1000);
    }

    // 顶层接收 worker 的"视频播完"通知，触发任务点切换
    function setupStudyWorkerMessageListener() {
        window.addEventListener('message', (ev) => {
            try {
                if (!ev.data || ev.data.source !== 'aa_study_worker' || ev.data.type !== 'video_ended') return;
            } catch (e) { return; }
            if (!_STUDY.running) return;
            // 视频播完 → 队列指针前进（2026-10-23：严格按顺序播下一个，不回头）
            try { advanceMediaSeq(); } catch (e) {}
            // 打破防抖，让切点立即执行
            _STUDY.lastJumpAt = 0;
            try { tryAutoJumpTask(); } catch (e) {}
        });
    }

    // ==================== 初始化入口 ====================
    async function init() {
        loadAllConfig();
        getPortalServerBase();
        registerPortalMenuCommands();
        renderPortalStatus();
        await checkPortalRuntime('auto');
        await reportPortalHeartbeat('auto');
        startPortalHeartbeatLoop();
        if (state.portalAccess.blocked) {
            return;
        }

        // 登录页拦截（2026-09 真机抓包）：passport2.chaoxing.com/login 等登录界面
        // 不创建面板、不弹"使用须知"——用户登录成功后跳转的是全新页面加载，
        // 届时 init() 重新执行，面板与提示正常出现。
        // 放在 portal 初始化之后：登录页仍保留更新检查/公告拉取，不影响其余能力。
        if (isLoginPage()) {
            console.log('%c[智能自动答题助手]%c 当前为登录页，已隐藏面板与使用提示，登录后进入课程页面即可使用', 'color:#2563eb;font-weight:bold', 'color:#999');
            return;
        }

        // 检查网站白名单（先于使用提示弹窗，避免在任意网页上都强制弹窗）
        if (!isWhitelisted()) {
            console.log('%c[智能自动答题助手]%c 当前网站不在白名单中，已自动隐藏', 'color:#2563eb;font-weight:bold', 'color:#999');
            // 通过菜单命令允许用户临时显示
            GM_registerMenuCommand('显示答题助手（当前网站不在白名单）', () => {
                if (document.readyState === 'loading') {
                    document.addEventListener('DOMContentLoaded', () => { createPanel(); replayLogs(); });
                } else {
                    createPanel();
                    replayLogs();
                }
                showToast('已临时显示（当前网站不在白名单）', 'info');
            });
            return;
        }

        // 显示使用提示弹窗
        showUsageNotice();

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => { createPanel(); replayLogs(); });
        } else {
            createPanel();
            replayLogs();
        }

        addLog('智能自动答题助手 启动完成', 'success');

        // 平台检测
        const platform = (typeof detectPlatform === 'function') ? detectPlatform() : null;
        if (platform) {
            console.log('%c[智能自动答题助手]%c 当前平台: ' + platform.name +
                ' | 已加载平台专用选区器 (nextBtn: ' + (platform.selectors.nextBtn || '-') +
                ', videoQuiz: ' + (platform.selectors.videoQuizPanel || '-') + ')',
                'color:#2563eb;font-weight:bold', 'color:#666');
            if (typeof addLog === 'function') {
                addLog(`平台适配: ${platform.name}（已启用该平台专用刷课逻辑）`, 'info');
            }
        } else {
            if (typeof addLog === 'function') {
                addLog('平台适配: 当前网站未在内置平台列表，使用通用刷课逻辑', 'info');
            }
        }

        // 监听 iframe 刷课 worker 的"视频播完"通知（跨域视频由 worker 就地控制）
        setupStudyWorkerMessageListener();

        console.log('%c[智能自动答题助手]%c 已加载 | 支持自动搜题+多平台', 'color:#2563eb;font-weight:bold', 'color:#666');

        // 自动启动刷课（如果用户开启）
        // 等面板创建完+视频可能还没加载，等2秒后启动
        // 修复（2026-09 真机抓包）：仅刷课界面（章节学习/知识卡片页）才自动启动，
        // 课程列表/课程门户/章节目录/个人空间等页面不再自动启动，避免误提示刷课。
        if (state.settings.studyAutoStartOnLoad) {
            setTimeout(() => {
                if (!_STUDY.running && typeof startStudy === 'function') {
                    const pname = platform ? platform.name : '当前平台';
                    if (!isStudyInterface()) {
                        if (typeof addLog === 'function') {
                            addLog(`刷课: 当前页面不是课程学习页面(${pname})，不自动启动刷课`, 'info');
                        }
                        return;
                    }
                    addLog(`刷课: 检测到开启【进入页面自动启动】(平台: ${pname})，2秒后自动开始`, 'info');
                    // 用户没在画面——play()可能会被autoplay policy拒绝
                    // 解决：模拟一次用户点击（dispatchEvent不增加激活时间）
                    // 最稳：先提示用户"首次请手动点一下视频以激活浏览器"
                    showToast('已自动启动刷课（首次请手动点一下视频以激活）', 'info');
                    startStudy();
                }
            }, 2000);
        }
    }

    // ==================== 按 frame 分流入口 ====================
    if (IS_TOP_FRAME) {
        void init();
    } else {
        // iframe 内不建 UI、不跑答题和 portal，只挂轻量刷课 worker
        // （学习平台的视频 iframe，尤其是跨域的，顶层摸不到播放器）
        setupStudyFrameWorker();
    }

})();

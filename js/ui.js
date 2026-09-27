/* ═══════════════════════════════════════════════════════════════════
   ui.js — 共用的 2D 介面小工具
   · UI.h()        建立 DOM
   · UI.fit()      字太多時自動縮字（不捲動），有上下限
   · UI.paginate() 長文字自動分頁（紙條）
   · UI.icon()     線條圖示（SVG，手機與電腦外觀一致；不用 emoji）
   · UI.art()      彩色插圖（晴天、下雨）
   · UI.fonts()    等網路字型載入（有逾時）
   · UI.store      localStorage 包裝（失敗不報錯）
   ═══════════════════════════════════════════════════════════════════ */

(function (global) {
    'use strict';

    var UI = {};

    UI.esc = function (s) {
        return String(s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    };

    UI.wait = function (ms) {
        return new Promise(function (res) { global.setTimeout(res, ms); });
    };

    /* DOM 準備好就執行（程式是由 boot.js 動態載入的，DOMContentLoaded 可能早就觸發過了） */
    UI.ready = function (fn) {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
        else fn();
    };

    /* UI.h('div', {class:'a', text:'b', html:'<i></i>', on:{click:fn}, attrs:{type:'button'}}, [children]) */
    UI.h = function (tag, props, children) {
        var el = document.createElement(tag);
        props = props || {};
        if (props['class']) el.className = props['class'];
        if (props.text != null) el.textContent = props.text;
        if (props.html != null) el.innerHTML = props.html;
        if (props.attrs) {
            for (var k in props.attrs) el.setAttribute(k, props.attrs[k]);
        }
        if (props.style) {
            for (var s in props.style) el.style.setProperty(s, props.style[s]);
        }
        if (props.on) {
            for (var ev in props.on) el.addEventListener(ev, props.on[ev]);
        }
        (children || []).forEach(function (c) {
            if (c == null) return;
            el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
        });
        if (tag === 'button' && !el.hasAttribute('type')) el.setAttribute('type', 'button');
        return el;
    };

    /* 讀 CSS 變數（px 數值） */
    UI.cssPx = function (name, fallback) {
        var v = parseFloat(global.getComputedStyle(document.documentElement).getPropertyValue(name));
        return isNaN(v) ? fallback : v;
    };

    /* 自動縮字：從 max 開始，放不下就一路縮到 min。
       · 只給 el：el 本身要有固定（或被版面限制）的高度，並且 overflow:hidden。
       · 另給 box：量 el 的實際高度是否超過 box（box 用 flex 置中時用這個）。 */
    /* 容許誤差：中文字型的字身比行高高，scrollHeight 常會多出 2–3px，不算溢出 */
    var TOL = 4;

    UI.fit = function (el, max, min, box) {
        var size = max;
        el.style.fontSize = size + 'px';
        function over() {
            if (box) {
                return el.offsetHeight > box.clientHeight + 1 || el.scrollWidth > el.clientWidth + TOL;
            }
            return el.scrollHeight > el.clientHeight + TOL || el.scrollWidth > el.clientWidth + TOL;
        }
        var guard = 80;
        while (size > min && guard-- > 0 && over()) {
            size -= 1;
            el.style.fontSize = size + 'px';
        }
        return size;
    };

    /* 分頁：把段落依序塞進 box，塞不下就換頁。box 要有固定高度。 */
    UI.paginate = function (paras, box) {
        var pages = [];
        var cur = [];
        function render(list) {
            box.innerHTML = list.map(function (p) { return '<p>' + UI.esc(p) + '</p>'; }).join('');
        }
        function overflow() { return box.scrollHeight > box.clientHeight + TOL; }
        for (var i = 0; i < paras.length; i++) {
            cur.push(paras[i]);
            render(cur);
            if (overflow() && cur.length > 1) {
                cur.pop();
                pages.push(cur);
                cur = [paras[i]];
                render(cur);
            }
        }
        if (cur.length) pages.push(cur);
        box.innerHTML = '';
        return pages;
    };

    UI.renderParas = function (box, list) {
        box.innerHTML = list.map(function (p) { return '<p>' + UI.esc(p) + '</p>'; }).join('');
    };

    /* 等字型載入；逾時也照常繼續 */
    UI.fonts = function (fontSpecs, text, timeout) {
        if (!document.fonts || !document.fonts.load) return Promise.resolve();
        var loads = fontSpecs.map(function (f) {
            return document.fonts.load(f, text || '回家的路').catch(function () { });
        });
        return Promise.race([Promise.all(loads), UI.wait(timeout || 2500)]);
    };

    UI.store = {
        get: function (key, fallback) {
            try {
                var raw = global.localStorage.getItem(key);
                return raw == null ? fallback : JSON.parse(raw);
            } catch (e) { return fallback; }
        },
        set: function (key, value) {
            try { global.localStorage.setItem(key, JSON.stringify(value)); } catch (e) { }
        }
    };

    /* ─── 線條圖示（24×24，跟著文字顏色）─── */
    var ICONS = {
        back: '<path d="M15 4.5 7.5 12 15 19.5"/>',
        home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v10h13V10"/><path d="M10 20v-5.5h4V20"/>',
        list: '<rect x="4" y="3" width="16" height="18" rx="2.5"/><path d="M8 8.5h8M8 12.5h8M8 16.5h5"/>',
        cube: '<path d="M12 2.8 20.5 7.5v9L12 21.2 3.5 16.5v-9z"/><path d="M12 12 20.5 7.5M12 12v9.2M12 12 3.5 7.5"/>',
        check: '<path d="M5 12.5 9.5 17 19 7.5"/>',
        cross: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
        menu: '<path d="M4.5 7h15M4.5 12h15M4.5 17h15"/>',
        hand: '<path d="M9 11.5V5.5a1.5 1.5 0 0 1 3 0v5"/><path d="M12 10V8.5a1.5 1.5 0 0 1 3 0V11"/><path d="M15 10.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-.8a6 6 0 0 1-4.9-2.6L3.8 14.7a1.5 1.5 0 0 1 2.4-1.8L9 15.5"/>',
        clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
        gift: '<rect x="3.5" y="9" width="17" height="11.5" rx="1.5"/><path d="M3.5 13h17M12 9v11.5"/><path d="M12 9C10.5 5 6.5 4.8 6.5 7.2 6.5 9 10 9 12 9zm0 0c1.5-4 5.5-4.2 5.5-1.8C17.5 9 14 9 12 9z"/>',
        cake: '<path d="M4 20.5h16v-8H4z"/><path d="M4 15.5c2 1.6 4-1.6 6 0s4 1.6 6 0 4-1.6 4 0"/><path d="M12 12.5V9"/><path d="M12 6.8c-1-1 0-2.6 0-3.3 0 .7 1 2.3 0 3.3z"/>',
        bike: '<circle cx="6" cy="16" r="3.5"/><circle cx="18" cy="16" r="3.5"/><path d="M6 16l4-7h5l3 7M10 9 8.5 6.5H6.5M15 9l-3 7H6"/>',
        volume: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4.5 4.5 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11"/>',
        mute: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>',
        refresh: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.8 4.2v5h-5"/>',
        play: '<path d="M8 5.5v13l10.5-6.5z"/>',
        bus: '<rect x="4" y="3.5" width="16" height="14" rx="3"/><path d="M4 11h16M7.5 17.5v3M16.5 17.5v3"/><circle cx="8" cy="14.3" r="1"/><circle cx="16" cy="14.3" r="1"/>',
        pin: '<path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
        up: '<path d="M4.5 15 12 7.5l7.5 7.5"/>',
        down: '<path d="M4.5 9 12 16.5 19.5 9"/>',
        left: '<path d="M15 4.5 7.5 12 15 19.5"/>',
        right: '<path d="M9 4.5 16.5 12 9 19.5"/>',
        star: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.8z"/>',
        share: '<polyline points="15.5 6.5 12 3 8.5 6.5"/><line x1="12" y1="4" x2="12" y2="14.5"/><path d="M5.5 12.5v6a1.5 1.5 0 0 0 1.5 1.5h10a1.5 1.5 0 0 0 1.5-1.5v-6"/>'
    };

    UI.icon = function (name, cls) {
        return '<svg class="icon ' + (cls || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
            'stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
            (ICONS[name] || '') + '</svg>';
    };

    /* ─── 彩色插圖 ─── */
    UI.art = function (name, cls) {
        var body = '';
        if (name === 'sun') {
            body =
                '<g stroke="#F09A2E" stroke-width="5" stroke-linecap="round">' +
                '<path d="M60 8v14M60 98v14M8 60h14M98 60h14M23 23l10 10M87 87l10 10M23 97l10-10M87 33l10-10"/></g>' +
                '<circle cx="60" cy="60" r="27" fill="#F7C53F" stroke="#EFA52E" stroke-width="4"/>' +
                '<circle cx="51" cy="56" r="3" fill="#8A5A1A"/><circle cx="69" cy="56" r="3" fill="#8A5A1A"/>' +
                '<path d="M50 67q10 9 20 0" fill="none" stroke="#8A5A1A" stroke-width="3.5" stroke-linecap="round"/>';
        } else if (name === 'rain') {
            body =
                '<path d="M28 70a18 18 0 0 1 4-35 24 24 0 0 1 45-6 20 20 0 0 1 16 41z" fill="#D8E9F6" stroke="#7FB1DC" stroke-width="4" stroke-linejoin="round"/>' +
                '<g stroke="#3E86C4" stroke-width="5" stroke-linecap="round">' +
                '<path d="M38 82l-5 12M58 82l-5 12M78 82l-5 12M48 98l-4 10M68 98l-4 10"/></g>';
        } else if (name === 'home') {
            body =
                '<circle cx="60" cy="60" r="56" fill="#FFF3CC" stroke="#E3C46A" stroke-width="4"/>' +
                '<path d="M60 22 22 54h10v38h56V54h10z" fill="#F7C53F" stroke="#C9851E" stroke-width="4" stroke-linejoin="round"/>' +
                '<rect x="51" y="66" width="18" height="26" rx="2" fill="#4C9A5B"/>' +
                '<rect x="36" y="60" width="12" height="12" rx="2" fill="#9ED0F2"/><rect x="72" y="60" width="12" height="12" rx="2" fill="#9ED0F2"/>' +
                '<path d="M60 38c-4-5-11-2-9 4 1 3 9 8 9 8s8-5 9-8c2-6-5-9-9-4z" fill="#E8822E"/>';
        }
        return '<svg class="' + (cls || '') + '" viewBox="0 0 120 120" aria-hidden="true">' + body + '</svg>';
    };

    global.UI = UI;
})(window);

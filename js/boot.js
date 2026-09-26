/* ═══════════════════════════════════════════════════════════════════
   boot.js — 版本檢查＋載入所有遊戲檔案
   ───────────────────────────────────────────────────────────────────
   1. 每次開頁面都（不經快取）讀 version.json 的版本號。
   2. 所有 CSS / JS 都加上 ?v=版本號 載入：
      版本號一改，網址就變了，瀏覽器一定會重新下載最新檔案；
      版本號沒變，就照常用快取（省流量、開得快）。
   3. boot.js 本身由 HTML 用時間戳載入，所以它永遠是最新的。
   4. 用 file:// 雙擊開啟時讀不到 version.json，就每次都用新的時間戳（本機檔案本來就沒有快取問題）。
   ★ 發佈新版本：改 version.json 的 version（並在 README 的「版本更新紀錄」寫一筆）。
   ★ 新增檔案：加到下面的 PAGES 清單。
   ═══════════════════════════════════════════════════════════════════ */

(function (global) {
    'use strict';

    var THREE_CDN = [
        'https://cdn.jsdelivr.net/npm/three@0.158.0/build/three.min.js',
        'https://cdnjs.cloudflare.com/ajax/libs/three.js/0.158.0/three.min.js'
    ];

    var BASE_CSS = ['css/theme.css', 'css/stage.css'];
    var BASE_JS = ['js/stage.js', 'js/ui.js'];

    /* 每個頁面要載入的檔案（照順序執行）；陣列 = 依序嘗試的備援來源 */
    var PAGES = {
        menu: {
            css: BASE_CSS.concat(['css/menu.css']),
            js: BASE_JS.concat(['js/menu.js'])
        },
        quiz: {
            css: BASE_CSS.concat(['css/quiz.css']),
            js: BASE_JS.concat(['js/quiz_pools.js', 'js/quiz_gen.js', 'js/quiz.js'])
        },
        world: {
            css: BASE_CSS.concat(['css/world.css']),
            js: [['vendor/three.min.js'].concat(THREE_CDN)].concat(BASE_JS, [
                'js/world/config.js',
                'js/world/hud.js',
                'js/world/kit.js',
                'js/world/core.js',
                'js/world/scenes.js',
                'js/world/story.js'
            ])
        }
    };

    var pageName = global.FM_PAGE || 'menu';
    var page = PAGES[pageName];

    function isRemote(u) { return /^https?:\/\//.test(u); }

    function loadCss(href) {
        return new Promise(function (resolve) {
            var l = document.createElement('link');
            l.rel = 'stylesheet';
            l.href = href;
            l.onload = l.onerror = function () { resolve(); };
            document.head.appendChild(l);
        });
    }

    function loadJs(src, ordered) {
        return new Promise(function (resolve, reject) {
            var s = document.createElement('script');
            s.src = src;
            s.async = !ordered ? true : false;
            s.onload = function () { resolve(); };
            s.onerror = function () { reject(src); };
            document.head.appendChild(s);
        });
    }

    /* 依序嘗試多個來源（例如本地 three.min.js 失敗就改用 CDN） */
    function loadWithFallback(list, q) {
        var i = 0;
        function next() {
            var src = list[i];
            var url = isRemote(src) ? src : src + q;
            return loadJs(url, true).catch(function (e) {
                i++;
                if (i < list.length) return next();
                throw e;
            });
        }
        return next();
    }

    function fetchVersion() {
        if (location.protocol === 'file:' || !global.fetch) return Promise.resolve(null);
        return fetch('version.json?t=' + Date.now(), { cache: 'no-store' })
            .then(function (r) { return r.ok ? r.json() : null; })
            .catch(function () { return null; });
    }

    function storeGet(k) { try { return global.localStorage.getItem(k); } catch (e) { return null; } }
    function storeSet(k, v) { try { global.localStorage.setItem(k, v); } catch (e) { } }

    function fail(what) {
        document.documentElement.classList.add('stage-ready');
        var box = document.createElement('div');
        box.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;padding:24px;' +
            'background:#FBF3D9;color:#4A3B1E;font:700 20px/1.6 sans-serif;text-align:center;z-index:99';
        box.textContent = '檔案載入失敗（' + what + '）。請確認網路連線後重新整理。';
        document.body ? document.body.appendChild(box) : document.addEventListener('DOMContentLoaded', function () { document.body.appendChild(box); });
    }

    fetchVersion().then(function (info) {
        var ver = info && info.version ? String(info.version) : 'local-' + Date.now();
        var prev = storeGet('fm.version');
        global.FM_VERSION = { version: ver, date: info && info.date, notes: info && info.notes, previous: prev };
        if (info && info.version) {
            if (prev && prev !== ver) global.FM_VERSION.updated = true;
            storeSet('fm.version', ver);
        }
        var q = '?v=' + encodeURIComponent(ver);

        return Promise.all(page.css.map(function (h) { return loadCss(h + q); })).then(function () {
            /* 有備援來源的（three.js）先載好，其餘平行下載、照順序執行 */
            var chain = Promise.resolve();
            var rest = [];
            page.js.forEach(function (entry) {
                if (Array.isArray(entry)) chain = chain.then(function () { return loadWithFallback(entry, q); });
                else rest.push(entry);
            });
            return chain.then(function () {
                return Promise.all(rest.map(function (src) { return loadJs(isRemote(src) ? src : src + q, true); }));
            });
        });
    }).catch(function (e) { fail(e); });

    /* 停在主選單時，切回這個頁面就檢查一次；有新版本就自動重新整理 */
    if (pageName === 'menu') {
        document.addEventListener('visibilitychange', function () {
            if (document.hidden || !global.FM_VERSION) return;
            fetchVersion().then(function (info) {
                if (info && info.version && String(info.version) !== global.FM_VERSION.version) location.reload();
            });
        });
    }
})(window);

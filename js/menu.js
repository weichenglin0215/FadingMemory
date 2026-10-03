/* ═══ menu.js — 入口畫面（index.html） ═══
   · 「明明還記得...」「秒反應」兩個按鈕不再直接導覽或亂數挑選：
     先彈出挑選彈窗（主軸是 3×2、小遊戲是每頁 3×3、可以翻頁），玩家自己選要練習的主軸／要玩的小遊戲，
     還沒做出來的格子顯示「構想中」（不可點）。彈窗做法跟 js/share.js 的
     QR Code 彈窗同一套：裝在 #stage 裡才會跟著整體縮放、第一次打開才建、
     點背景關閉。
   · 選主軸：quiz.html?theme=<id>（js/quiz_gen.js 的 QuizGen.session() 已支援）。
   · 選遊戲：reaction.html?game=<id>（js/reaction.js 讀這個參數指定要玩哪一個）。 */

(function () {
    'use strict';

    var h = UI.h;

    /* 主軸六格（3×2）的位置＝陣列順序（左上→右上，再左下→右下）；null＝「構想中」佔位格 */
    var THEME_CELLS = [
        { id: 'birthday', name: '生日' },
        { id: 'travel', name: '旅遊' },
        { id: 'health', name: '看病' },
        { id: 'dining', name: '聚餐' },
        null,
        null
    ];

    /* 小遊戲：由左到右、由上到下排，每頁 9 格（3×3），超過就翻頁。
       順序＝出現在選單裡的順序；沒有縮圖的遊戲會顯示彩色底＋名字的第一個字（印章）。
       null＝「構想中」佔位格（整頁補滿用）。 */
    var PAGE_SIZE = 9;
    var GAME_CELLS = [
        { id: 'spot', name: '大家來找碴', img: 'img/reaction/spot.png' },
        { id: 'speed', name: '零秒出手', img: 'img/reaction/speed.png' },
        { id: 'drop', name: '神準落下', img: 'img/reaction/drop.png' },
        { id: 'impossible', name: '不可能任務', img: 'img/reaction/impossible.png' },
        { id: 'shapes', name: '形形色色', img: 'img/reaction/shapes.png' },
        { id: 'matchcolor', name: '色不異空', img: 'img/reaction/matchcolor.png' },
        { id: 'rainbow', name: '七彩陷阱', img: 'img/reaction/rainbow.png' },
        { id: 'pendulum', name: '六點鐘方向', img: 'img/reaction/pendulum.png' },
        { id: 'tissue', name: '抽光它', img: 'img/reaction/tissue.png' },
        { id: 'landolt', name: '缺口在哪？', img: 'img/reaction/landolt.png' },
        { id: 'lights', name: '點燈記憶', img: 'img/reaction/lights.png' },
        { id: 'cups', name: '球在哪杯', img: 'img/reaction/cups.png' },
        { id: 'pattern', name: '解鎖圖案', img: 'img/reaction/pattern.png' },
        { id: 'illusion', name: '錯覺大師', img: 'img/reaction/illusion.png' },
        { id: 'pour', name: '倒到八分滿', img: 'img/reaction/pour.png' },
        { id: 'coins', name: '零錢分類', img: 'img/reaction/coins.png' },
        { id: 'invoice', name: '對發票', img: 'img/reaction/invoice.png' },
        { id: 'paint', name: '刷油漆', img: 'img/reaction/paint.png' },
        { id: 'diff', name: '哪裡怪怪的', img: 'img/reaction/diff.png' },
        { id: 'bread', name: '秤麵包重量', img: 'img/reaction/bread.png' },
        { id: 'candy', name: '幾顆糖', img: 'img/reaction/candy.png' },
        { id: 'curves', name: '誰先到？', img: 'img/reaction/curves.png' },
        { id: 'rps', name: '猜拳必贏', img: 'img/reaction/rps.png' },
        { id: 'balloon', name: '吹氣球', img: 'img/reaction/balloon.png' },
        { id: 'price', name: '價格陷阱', img: 'img/reaction/price.png' },
        { id: 'heartbeat', name: '心跳複製', img: 'img/reaction/heartbeat.png' }
    ];
    var gamePage = 0;

    /* 「構想中」佔位格：兩個彈窗共用同一個函式，cls 參數是 'theme' 或 'game'，
       拼出對應的 class 名稱（theme-cell--soon／game-cell--soon），disabled
       屬性讓這個按鈕看起來能按、但實際點不了也不會有 hover/active 效果。 */
    function soonCell(cls) {
        return h('button', { 'class': cls + '-cell ' + cls + '-cell--soon', attrs: { disabled: 'disabled' } }, [
            h('span', { 'class': cls + '-cell__soon', text: '構想中' })
        ]);
    }

    function closeOnBg(dlg) {
        dlg.addEventListener('click', function () { dlg.hidden = true; });
    }

    var themeDlg, gameDlg;
    var themeBuilt = false, gameBuilt = false;

    function pickTheme(id) {
        /* 從這裡進測試模式＝新的一局：題目在 quiz.html 一進去就全部重新產生（見 js/quiz_gen.js） */
        UI.store.set('fm.quiz.fresh', true);
        location.href = 'quiz.html?theme=' + id;
    }

    function buildThemeDlg() {
        themeBuilt = true;
        var cells = THEME_CELLS.map(function (c) {
            if (!c) return soonCell('theme');
            return h('button', {
                'class': 'theme-cell', type: 'button',
                on: { click: function (e) { e.stopPropagation(); pickTheme(c.id); } }
            }, [h('span', { 'class': 'theme-cell__name', text: c.name })]);
        });
        var card = h('div', { 'class': 'theme-dlg__card', on: { click: function (e) { e.stopPropagation(); } } }, [
            h('div', { 'class': 'theme-dlg__title', text: '選一個想練習的主題' }),
            h('div', { 'class': 'theme-grid' }, cells)
        ]);
        themeDlg.appendChild(card);
        closeOnBg(themeDlg);
    }

    function pickGame(id) {
        location.href = 'reaction.html?game=' + id;
    }

    /* 一格遊戲。縮圖載入失敗（還沒有圖檔）→ 把 <img> 藏起來，改顯示彩色底＋名字第一個字的「印章」，
       圖檔補齊之後會自動正常顯示，不用再改程式。 */
    function gameCell(c, idx) {
        if (!c) return soonCell('game');
        var img = h('img', { attrs: { src: c.img, alt: c.name } });
        var seal = h('span', { 'class': 'game-cell__seal', text: c.name.charAt(0) });
        var cell = h('button', {
            'class': 'game-cell game-cell--tone' + (idx % 4), type: 'button',
            on: { click: function (e) { e.stopPropagation(); pickGame(c.id); } }
        }, [seal, img, h('span', { 'class': 'game-cell__name', text: c.name })]);
        img.addEventListener('load', function () { seal.hidden = true; });
        img.addEventListener('error', function () { img.hidden = true; });
        return cell;
    }

    function buildGameDlg() {
        gameBuilt = true;
        var pages = Math.ceil(GAME_CELLS.length / PAGE_SIZE);
        var title = h('div', { 'class': 'game-dlg__title' });
        var grid = h('div', { 'class': 'game-grid' });
        var prev = h('button', { 'class': 'game-nav__btn', type: 'button', text: '上一頁' });
        var next = h('button', { 'class': 'game-nav__btn', type: 'button', text: '下一頁' });
        var dots = h('div', { 'class': 'game-nav__dots' });
        function render() {
            title.textContent = '選一個想玩的遊戲';
            grid.innerHTML = '';
            for (var i = 0; i < PAGE_SIZE; i++) {
                var gi = gamePage * PAGE_SIZE + i;
                grid.appendChild(gameCell(gi < GAME_CELLS.length ? GAME_CELLS[gi] : null, gi));
            }
            prev.disabled = gamePage <= 0;
            next.disabled = gamePage >= pages - 1;
            dots.innerHTML = '';
            for (var k = 0; k < pages; k++) dots.appendChild(h('span', { 'class': 'game-nav__dot' + (k === gamePage ? ' game-nav__dot--on' : '') }));
        }
        prev.addEventListener('click', function (e) { e.stopPropagation(); if (gamePage > 0) { gamePage--; render(); } });
        next.addEventListener('click', function (e) { e.stopPropagation(); if (gamePage < pages - 1) { gamePage++; render(); } });
        /* 在格子上左右滑也能翻頁 */
        var sx = null;
        grid.addEventListener('pointerdown', function (e) { sx = e.clientX; });
        grid.addEventListener('pointerup', function (e) {
            if (sx == null) return;
            var dx = e.clientX - sx; sx = null;
            if (dx < -60 && gamePage < pages - 1) { gamePage++; render(); }
            else if (dx > 60 && gamePage > 0) { gamePage--; render(); }
        });
        var nav = h('div', { 'class': 'game-nav' }, [prev, dots, next]);
        var card = h('div', { 'class': 'game-dlg__card', on: { click: function (e) { e.stopPropagation(); } } }, [title, grid, nav]);
        render();
        gameDlg.appendChild(card);
        closeOnBg(gameDlg);
    }

    /* UI.ready()：整個檔案真正開始跑的進入點，等 DOM 準備好才動手找元素、綁事件
       （見 js/ui.js 的說明）。Stage.init() 一定要在這裡呼叫一次，整個頁面的
       縮放置中才會開始運作。 */
    UI.ready(function () {
        Stage.init();
        document.getElementById('menu-logo').innerHTML = UI.art('home', 'menu__art');
        document.getElementById('icon-test').innerHTML = UI.icon('list');
        document.getElementById('icon-reaction').innerHTML = UI.icon('bolt');
        document.getElementById('icon-world').innerHTML = UI.icon('cube');

        themeDlg = document.getElementById('theme-dlg');
        gameDlg = document.getElementById('game-dlg');

        document.getElementById('mode-test').addEventListener('click', function () {
            if (!themeBuilt) buildThemeDlg();
            themeDlg.hidden = false;
        });
        document.getElementById('mode-reaction').addEventListener('click', function () {
            if (!gameBuilt) buildGameDlg();
            gameDlg.hidden = false;
        });

        var v = window.FM_VERSION;
        var el = document.getElementById('menu-version');
        if (v && el) {
            var shown = /^local-/.test(v.version) ? '本機版' : '版本 ' + v.version;
            el.textContent = v.updated ? '已更新到最新 ' + shown : shown;
        }
    });
})();

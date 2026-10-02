/* ═══ menu.js — 入口畫面（index.html） ═══
   · 「明明還記得...」「秒反應」兩個按鈕不再直接導覽或亂數挑選：
     先彈出挑選彈窗（主軸是 3×2、小遊戲是 3×3），玩家自己選要練習的主軸／要玩的小遊戲，
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

    /* 小遊戲九格（3×3）：同樣由左到右、由上到下排；null＝「構想中」佔位格 */
    var GAME_CELLS = [
        { id: 'spot', name: '大家來找碴', img: 'img/reaction/spot.png' },
        { id: 'speed', name: '零秒出手', img: 'img/reaction/speed.png' },
        { id: 'drop', name: '神準落下', img: 'img/reaction/drop.png' },
        { id: 'impossible', name: '不可能任務', img: 'img/reaction/impossible.png' },
        { id: 'shapes', name: '形形色色', img: 'img/reaction/shapes.png' },
        { id: 'matchcolor', name: '色不異空', img: 'img/reaction/matchcolor.png' },
        { id: 'rainbow', name: '七彩陷阱', img: 'img/reaction/rainbow.png' },
        null,
        null
    ];

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

    function buildGameDlg() {
        gameBuilt = true;
        var cells = GAME_CELLS.map(function (c) {
            if (!c) return soonCell('game');
            /* 遊戲縮圖目前還沒有圖檔（要等使用者自己截圖放進 img/reaction/ 資料夾），
               瀏覽器載入 <img src="..."> 失敗時會觸發 error 事件，這裡接住它把圖片
               隱藏起來——卡片本身的底色、邊框、下面的遊戲名稱文字都還在，不會變成
               一張顯眼的「破圖」圖示，圖檔補齊之後會自動正常顯示，不用再改程式。 */
            var img = h('img', {
                attrs: { src: c.img, alt: c.name }
            });
            img.addEventListener('error', function () { img.hidden = true; });
            return h('button', {
                'class': 'game-cell', type: 'button',
                on: { click: function (e) { e.stopPropagation(); pickGame(c.id); } }
            }, [img, h('span', { 'class': 'game-cell__name', text: c.name })]);
        });
        var card = h('div', { 'class': 'game-dlg__card', on: { click: function (e) { e.stopPropagation(); } } }, [
            h('div', { 'class': 'game-dlg__title', text: '選一個想玩的遊戲' }),
            h('div', { 'class': 'game-grid' }, cells)
        ]);
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

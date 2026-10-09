/* ═══ menu.js — 入口畫面（index.html） ═══
   · 「明明還記得...」「秒反應」兩個按鈕不再直接導覽或亂數挑選：
     先彈出挑選彈窗（主軸是 3×2、小遊戲是每頁 3×3、可以翻頁），玩家自己選要練習的主軸／要玩的小遊戲，
     還沒做出來的格子顯示「構想中」（不可點）。彈窗做法跟 js/share.js 的
     QR Code 彈窗同一套：裝在 #stage 裡才會跟著整體縮放、第一次打開才建、
     點背景關閉。
   · 選主軸：quiz.html?theme=<id>（js/quiz_gen.js 的 QuizGen.session() 已支援）。
   · 選遊戲：reaction.html?game=<id>（js/reaction.js 讀這個參數指定要玩哪一個）。 */

/* 【新手導讀】整個檔案用 (function () { ... })(); 包起來，叫做「立即執行函式」(IIFE)：
   裡面宣告的變數（THEME_CELLS、gamePage...）只在這個範圍內有效，不會變成全域變數，
   所以不會跟其他 .js 檔案裡的同名變數撞在一起。 */
(function () {
    /* 'use strict' 是「嚴格模式」：打錯變數名稱、用了不安全的寫法時，瀏覽器會直接報錯，
       而不是默默讓程式帶著錯誤繼續跑，比較容易找到 bug。 */
    'use strict';

    /* UI.h 是 js/ui.js 提供的「建立 HTML 元素」小工具，h('div', {class:'x'}, [子元素...]) 等於
       document.createElement('div') 再設定屬性、塞入子元素。把它存成短短的 h，後面寫起來比較省事。 */
    var h = UI.h;

    /* var 是宣告變數；[ ... ] 是「陣列」(一排資料)，{ ... } 是「物件」(有名字的資料欄位：id、name)。 */
    /* 主軸六格（3×2）的位置＝陣列順序（左上→右上，再左下→右下）；null＝「構想中」佔位格 */
    var THEME_CELLS = [
        { id: 'birthday', name: '生日' },
        { id: 'travel', name: '旅遊' },
        { id: 'health', name: '看病' },
        { id: 'dining', name: '聚餐' },
        null,
        null
    ];

    /* 這裡的資料只是「清單」：想新增一款遊戲，只要在 GAME_CELLS 裡加一行 { id, name, img }，
       選單就會自動多一格，不用改下面任何程式。 */
    /* 小遊戲：由左到右、由上到下排，每頁 9 格（3×3），超過就翻頁。
       順序＝出現在選單裡的順序；沒有縮圖的遊戲會顯示彩色底＋名字的第一個字（印章）。
       null＝「構想中」佔位格（整頁補滿用）。 */
    /* 每頁顯示幾格（3 欄 × 3 列 = 9）。 */
    var PAGE_SIZE = 9;
    /* id 要跟 js/reaction_<id>.js 裡 Reaction.register({ id: ... }) 的 id 一樣，
       點下去才會跳到 reaction.html?game=<id>。img 是縮圖路徑，檔案不存在時會自動改顯示「印章」(見 gameCell)。 */
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
        { id: 'landolt', name: 'E視力檢查', img: 'img/reaction/landolt.png' },
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
        { id: 'heartbeat', name: '心跳複製', img: 'img/reaction/heartbeat.png' },
        { id: 'sticks', name: '落下棍子', img: 'img/reaction/sticks.png' },
        { id: 'schulte', name: '數字方陣', img: 'img/reaction/schulte.png' },
        { id: 'same', name: '相同嗎？', img: 'img/reaction/same.png' },
        { id: 'backnum', name: '倒背數字', img: 'img/reaction/backnum.png' },
        { id: 'setclock', name: '撥時鐘', img: 'img/reaction/setclock.png' },
        { id: 'tearcal', name: '撕日曆', img: 'img/reaction/tearcal.png' },
        { id: 'pillbox', name: '分藥盒', img: 'img/reaction/pillbox.png' },
        { id: 'fridge', name: '冰箱歸位', img: 'img/reaction/fridge.png' },
        { id: 'scallion', name: '切蔥花', img: 'img/reaction/scallion.png' },
        { id: 'hangpic', name: '掛畫', img: 'img/reaction/hangpic.png' },
        { id: 'mirror', name: '左右顛倒', img: 'img/reaction/mirror.png' },
        { id: 'witness', name: '目擊證人', img: 'img/reaction/witness.png' },
        { id: 'halfchar', name: '半邊字', img: 'img/reaction/halfchar.png' },
        { id: 'followme', name: '照著走', img: 'img/reaction/followme.png' },
        { id: 'chicks', name: '找回小雞', img: 'img/reaction/chicks.png' },
        { id: 'bounce', name: '球會跑去哪', img: 'img/reaction/bounce.png' },
        { id: 'cake', name: '分蛋糕', img: 'img/reaction/cake.png' },
        { id: 'seven', name: '逢七過', img: 'img/reaction/seven.png' },
        { id: 'teacher', name: '老師說', img: 'img/reaction/teacher.png' },
        { id: 'dualtask', name: '一心二用', img: 'img/reaction/dualtask.png' },
        { id: 'pipes', name: '接水管', img: 'img/reaction/pipes.png' },
        { id: 'lightsout', name: '關燈', img: 'img/reaction/lightsout.png' },
        { id: 'seq', name: '猜下一個', img: 'img/reaction/seq.png' },
        { id: 'polyrhythm', name: '左右不同拍', img: 'img/reaction/polyrhythm.png' },
        { id: 'area', name: '面積一樣大', img: 'img/reaction/area.png' },
        { id: 'halfvol', name: '容量一半', img: 'img/reaction/halfvol.png' },
        { id: 'blindcircle', name: '盲畫一個圓', img: 'img/reaction/blindcircle.png' },
        { id: 'samelen', name: '畫一樣長', img: 'img/reaction/samelen.png' },
        { id: 'rightangle', name: '畫成直角', img: 'img/reaction/rightangle.png' },
        { id: 'stamp', name: '蓋在框內', img: 'img/reaction/stamp.png' },
        { id: 'focus', name: '轉到最清楚', img: 'img/reaction/focus.png' },
        { id: 'scratch', name: '刮刮樂推理', img: 'img/reaction/scratch.png' },
        { id: 'mathcheck', name: '算式對不對', img: 'img/reaction/mathcheck.png' },
        { id: 'fracduel', name: '分數大對決', img: 'img/reaction/fracduel.png' },
        { id: 'primetrap', name: '質數陷阱', img: 'img/reaction/primetrap.png' },
        { id: 'sum100', name: '湊百消除', img: 'img/reaction/sum100.png' },
        { id: 'timestable', name: '乘法表抓錯', img: 'img/reaction/timestable.png' },
        { id: 'maxexpr', name: '拼出最大的數', img: 'img/reaction/maxexpr.png' },
        { id: 'glyphspin', name: '鏡中旋轉字', img: 'img/reaction/glyphspin.png' },
        { id: 'fadee', name: '淡到看不見', img: 'img/reaction/fadee.png' },
        { id: 'oddsock', name: '落單的襪子', img: 'img/reaction/oddsock.png' },
        { id: 'ghostleg', name: '鬼腳圖', img: 'img/reaction/ghostleg.png' },
        { id: 'euler', name: '能一筆畫嗎', img: 'img/reaction/euler.png' },
        { id: 'colorrecall', name: '記色調色', img: 'img/reaction/colorrecall.png' },
        { id: 'basket', name: '菜籃總價', img: 'img/reaction/basket.png' },
        { id: 'passersby', name: '路人走過', img: 'img/reaction/passersby.png' },
        { id: 'seenit', name: '這個看過嗎', img: 'img/reaction/seenit.png' },
        { id: 'whofirst', name: '誰先亮', img: 'img/reaction/whofirst.png' },
        { id: 'watchoff', name: '哪支錶不準', img: 'img/reaction/watchoff.png' },
        { id: 'handsmeet', name: '兩針重疊', img: 'img/reaction/handsmeet.png' },
        { id: 'clearer', name: '越看越清楚', img: 'img/reaction/clearer.png' },
        { id: 'twobags', name: '兩袋一樣重', img: 'img/reaction/twobags.png' }
    ];
    /* 目前在第幾頁（從 0 開始算，0 就是第一頁）。 */
    var gamePage = 0;

    /* function 是「函式」：把一段會重複使用的程式取個名字。soonCell 負責做出一個「構想中」的灰色格子。 */
    /* 「構想中」佔位格：兩個彈窗共用同一個函式，cls 參數是 'theme' 或 'game'，
       拼出對應的 class 名稱（theme-cell--soon／game-cell--soon），disabled
       屬性讓這個按鈕看起來能按、但實際點不了也不會有 hover/active 效果。 */
    function soonCell(cls) {
        return h('button', { 'class': cls + '-cell ' + cls + '-cell--soon', attrs: { disabled: 'disabled' } }, [
            h('span', { 'class': cls + '-cell__soon', text: '構想中' })
        ]);
    }

    /* 點彈窗的暗色背景就關閉彈窗：hidden = true 是 HTML 的「隱藏」屬性。 */
    function closeOnBg(dlg) {
        dlg.addEventListener('click', function () { dlg.hidden = true; });
    }

    /* 先宣告變數、稍後 UI.ready 裡才指定值；Built 旗標讓彈窗「第一次打開才建立」，之後重複使用，省效能。 */
    var themeDlg, gameDlg;
    var themeBuilt = false, gameBuilt = false;

    /* 玩家選了一個主軸後做的事： */
    function pickTheme(id) {
        /* 從這裡進測試模式＝新的一局：題目在 quiz.html 一進去就全部重新產生（見 js/quiz_gen.js） */
        /* UI.store 是 localStorage 的小包裝（瀏覽器關掉也會記住的資料）。這裡先做個記號，
           告訴 quiz 頁「這是全新的一局」，題目要重新產生。 */
        UI.store.set('fm.quiz.fresh', true);
        /* 改變 location.href 就會跳到另一個網頁；? 後面是「查詢參數」，另一頁用它得知要玩哪個主軸。 */
        location.href = 'quiz.html?theme=' + id;
    }

    /* 建立「選主軸」彈窗的內容。THEME_CELLS.map(...) 的意思是：把清單裡每一項轉成一個按鈕，回傳新陣列。 */
    function buildThemeDlg() {
        themeBuilt = true;
        var cells = THEME_CELLS.map(function (c) {
            if (!c) return soonCell('theme');
            /* on: { click: ... } 是綁定「點擊事件」。e.stopPropagation() 表示事件到此為止，
               不要往上傳給外層的背景（不然點按鈕時背景的「點了就關閉」也會一起觸發）。 */
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

    /* 記住「上次點的是哪一款遊戲」：下次打開「選一個想玩的遊戲」彈窗時，自動翻到那一款所在的頁面，
       不用每次都從第 1 頁一直翻。存在 localStorage（UI.store），關掉瀏覽器也記得。 */
    var LAST_GAME_KEY = 'fm.menu.lastGame';
    function pickGame(id) {
        UI.store.set(LAST_GAME_KEY, id);
        location.href = 'reaction.html?game=' + id;
    }
    /* 上次點的遊戲在第幾頁（從 0 起算）；沒記錄、或那款遊戲已經不在清單裡就回傳 0 */
    function lastGamePage() {
        var id = UI.store.get(LAST_GAME_KEY, null);
        for (var i = 0; i < GAME_CELLS.length; i++) if (GAME_CELLS[i] && GAME_CELLS[i].id === id) return Math.floor(i / PAGE_SIZE);
        return 0;
    }

    /* 這個函式負責做出一格遊戲按鈕（縮圖＋名字）。 */
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
        /* load / error 是圖片的事件：載入成功就藏起印章；載入失敗（沒有圖檔）就藏起圖片，只顯示印章。 */
        img.addEventListener('load', function () { seal.hidden = true; });
        img.addEventListener('error', function () { img.hidden = true; });
        return cell;
    }

    /* 建立「選遊戲」彈窗：有標題、3×3 格子、上一頁／下一頁、頁數小圓點。 */
    function buildGameDlg() {
        gameBuilt = true;
        gamePage = lastGamePage();      /* 自動跳到上次玩的那一款所在的頁面 */
        /* Math.ceil 是「無條件進位」：25 款 ÷ 9 = 2.8 → 3 頁。 */
        var pages = Math.ceil(GAME_CELLS.length / PAGE_SIZE);
        var title = h('div', { 'class': 'game-dlg__title' });
        var grid = h('div', { 'class': 'game-grid' });
        var prev = h('button', { 'class': 'game-nav__btn', type: 'button', text: '上一頁' });
        var next = h('button', { 'class': 'game-nav__btn', type: 'button', text: '下一頁' });
        var dots = h('div', { 'class': 'game-nav__dots' });
        /* render() 負責「重畫目前這一頁」：每次翻頁都清空 grid 再重新放入該頁的 9 格。 */
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
        /* 左右滑動翻頁：記下按下去的 x 座標，放開時看移動了多少 (dx)，超過 60 像素就翻頁。 */
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

    /* UI.ready()：等網頁 DOM 都準備好了才執行裡面的程式（這時才找得到 getElementById 要找的元素）。 */
    /* UI.ready()：整個檔案真正開始跑的進入點，等 DOM 準備好才動手找元素、綁事件
       （見 js/ui.js 的說明）。Stage.init() 一定要在這裡呼叫一次，整個頁面的
       縮放置中才會開始運作。 */
    UI.ready(function () {
        Stage.init();
        document.getElementById('menu-logo').innerHTML = UI.art('home', 'menu__art');
        document.getElementById('icon-test').innerHTML = UI.icon('list');
        document.getElementById('icon-reaction').innerHTML = UI.icon('bolt');
        document.getElementById('icon-world').innerHTML = UI.icon('cube');
/* getElementById 用 id 找到 HTML 裡的元素，再替它放進圖示。 */

        themeDlg = document.getElementById('theme-dlg');
        gameDlg = document.getElementById('game-dlg');

        /* 替兩個大按鈕綁定點擊：第一次點才建立彈窗，之後只是把 hidden 設成 false 讓它顯示出來。 */
        document.getElementById('mode-test').addEventListener('click', function () {
            if (!themeBuilt) buildThemeDlg();
            themeDlg.hidden = false;
        });
        document.getElementById('mode-reaction').addEventListener('click', function () {
            if (!gameBuilt) buildGameDlg();
            gameDlg.hidden = false;
        });

        /* window.FM_VERSION 是 js/boot.js 讀完 version.json 後存起來的版本資訊，這裡拿來顯示在選單底部。 */
        var v = window.FM_VERSION;
        var el = document.getElementById('menu-version');
        if (v && el) {
            var shown = /^local-/.test(v.version) ? '本機版' : '版本 ' + v.version;
            el.textContent = v.updated ? '已更新到最新 ' + shown : shown;
        }
    });
})();

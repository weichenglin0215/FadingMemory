/* ═══ menu.js — 入口畫面（index.html） ═══
   · 「明明還記得...」「秒反應」兩個按鈕不再直接導覽或亂數挑選，會先彈出挑選彈窗：
       - 主軸彈窗（3×2 小彈窗）：玩家自己選要練習的主軸，還沒做出來的格子顯示「構想中」（不可點）。
       - 遊戲彈窗（V1.23.0 起「全螢幕」）：左上角有「返回」；中間是 3 欄的遊戲格子，可以用手指或滑鼠
         上下拖曳捲動（帶慣性，見 js/scroller.js）；最下面是分類頁籤（全部／最近／記憶／視覺／反應／數字／
         邏輯／手感／目測），頁籤文字是直式排列，取代以前的「上一頁／下一頁」。
     彈窗做法跟 js/share.js 的 QR Code 彈窗同一套：裝在 #stage 裡才會跟著整體縮放、第一次打開才建。
   · 選主軸：quiz.html?theme=<id>（js/quiz_gen.js 的 QuizGen.session() 已支援）。
   · 選遊戲：reaction.html?game=<id>（js/reaction.js 讀這個參數指定要玩哪一個）。 */

/* 【新手導讀】整個檔案用 (function () { ... })(); 包起來，叫做「立即執行函式」(IIFE)：
   裡面宣告的變數（THEME_CELLS、GAME_CELLS...）只在這個範圍內有效，不會變成全域變數，
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

    /* ═══ 小遊戲清單 ═══
       想新增一款遊戲，只要在 GAME_CELLS 裡加一行 { id, name, cat, img }，選單就會自動多一格，不用改下面任何程式。
         · id   要跟 js/reaction_<id>.js 裡 Reaction.register({ id: ... }) 的 id 一樣，點下去才會跳到 reaction.html?game=<id>；
         · name 格子下方的名稱，★最多 5 個字（格子寬度只放得下 5 個字；test/reaction/t_menu.js 會檢查）；
                要跟遊戲檔案裡的 name、資料庫 MF_games 的名稱一致；
         · cat  屬於哪一個分類頁籤（下面 GAME_TABS 裡 id 為 memory／visual／… 的那幾個），一款遊戲只放一個分類；
         · img  縮圖路徑（img/reaction/<id>.png，由 node test/reaction/make_icons.mjs 自動拍）；
                檔案不存在時會自動改顯示「印章」（名字第一個字，見 gameCell）。
       順序＝「全部」頁籤裡出現的順序，也是各分類頁籤裡的順序。 */
    /* 分類頁籤（由左到右）。all＝全部、recent＝最近玩過的（依玩的先後，不看 cat）；其餘七個是遊戲分類：
         記憶＝先記住再回想；視覺＝用眼睛觀察、找不同、辨識；反應＝抓時機、拚手速；數字＝計算、數感；
         邏輯＝推理、解謎；手感＝拖曳、畫線、控制力道的操作；目測＝不給數字、憑感覺估量（重量、面積、距離、數量）。 */
    var GAME_TABS = [
        { id: 'all', name: '全部' },
        { id: 'recent', name: '最近' },
        { id: 'memory', name: '記憶' },
        { id: 'visual', name: '視覺' },
        { id: 'reaction', name: '反應' },
        { id: 'number', name: '數字' },
        { id: 'logic', name: '邏輯' },
        { id: 'hand', name: '手感' },
        { id: 'guess', name: '目測' }
    ];
    var GAME_CELLS = [
        { id: 'spot', name: '大家來找碴', cat: 'visual', img: 'img/reaction/spot.png' },
        { id: 'speed', name: '零秒出手', cat: 'reaction', img: 'img/reaction/speed.png' },
        { id: 'drop', name: '神準落下', cat: 'reaction', img: 'img/reaction/drop.png' },
        { id: 'impossible', name: '不可能任務', cat: 'reaction', img: 'img/reaction/impossible.png' },
        { id: 'shapes', name: '形形色色', cat: 'visual', img: 'img/reaction/shapes.png' },
        { id: 'matchcolor', name: '色不異空', cat: 'visual', img: 'img/reaction/matchcolor.png' },
        { id: 'rainbow', name: '七彩陷阱', cat: 'reaction', img: 'img/reaction/rainbow.png' },
        { id: 'pendulum', name: '六點鐘方向', cat: 'reaction', img: 'img/reaction/pendulum.png' },
        { id: 'tissue', name: '抽光衛生紙', cat: 'hand', img: 'img/reaction/tissue.png' },
        { id: 'landolt', name: 'E視力檢查', cat: 'visual', img: 'img/reaction/landolt.png' },
        { id: 'lights', name: '點燈記憶', cat: 'memory', img: 'img/reaction/lights.png' },
        { id: 'cups', name: '球在哪杯', cat: 'memory', img: 'img/reaction/cups.png' },
        { id: 'pattern', name: '解鎖圖案', cat: 'memory', img: 'img/reaction/pattern.png' },
        { id: 'illusion', name: '錯覺大師', cat: 'visual', img: 'img/reaction/illusion.png' },
        { id: 'pour', name: '倒到八分滿', cat: 'hand', img: 'img/reaction/pour.png' },
        { id: 'coins', name: '零錢分類', cat: 'number', img: 'img/reaction/coins.png' },
        { id: 'invoice', name: '對發票', cat: 'number', img: 'img/reaction/invoice.png' },
        { id: 'paint', name: '刷油漆', cat: 'hand', img: 'img/reaction/paint.png' },
        { id: 'diff', name: '哪裡怪怪的', cat: 'visual', img: 'img/reaction/diff.png' },
        { id: 'bread', name: '秤麵包重量', cat: 'guess', img: 'img/reaction/bread.png' },
        { id: 'candy', name: '幾顆糖', cat: 'guess', img: 'img/reaction/candy.png' },
        { id: 'curves', name: '誰先到？', cat: 'guess', img: 'img/reaction/curves.png' },
        { id: 'rps', name: '猜拳必贏', cat: 'reaction', img: 'img/reaction/rps.png' },
        { id: 'balloon', name: '吹氣球', cat: 'hand', img: 'img/reaction/balloon.png' },
        { id: 'price', name: '價格陷阱', cat: 'number', img: 'img/reaction/price.png' },
        { id: 'heartbeat', name: '心跳複製', cat: 'reaction', img: 'img/reaction/heartbeat.png' },
        { id: 'sticks', name: '落下棍子', cat: 'reaction', img: 'img/reaction/sticks.png' },
        { id: 'schulte', name: '數字方陣', cat: 'visual', img: 'img/reaction/schulte.png' },
        { id: 'same', name: '相同嗎？', cat: 'memory', img: 'img/reaction/same.png' },
        { id: 'backnum', name: '倒背數字', cat: 'memory', img: 'img/reaction/backnum.png' },
        { id: 'setclock', name: '撥時鐘', cat: 'hand', img: 'img/reaction/setclock.png' },
        { id: 'tearcal', name: '撕日曆', cat: 'number', img: 'img/reaction/tearcal.png' },
        { id: 'pillbox', name: '分藥盒', cat: 'memory', img: 'img/reaction/pillbox.png' },
        { id: 'fridge', name: '冰箱歸位', cat: 'logic', img: 'img/reaction/fridge.png' },
        { id: 'scallion', name: '切蔥花', cat: 'reaction', img: 'img/reaction/scallion.png' },
        { id: 'hangpic', name: '掛畫', cat: 'hand', img: 'img/reaction/hangpic.png' },
        { id: 'mirror', name: '左右顛倒', cat: 'hand', img: 'img/reaction/mirror.png' },
        { id: 'witness', name: '目擊證人', cat: 'memory', img: 'img/reaction/witness.png' },
        { id: 'halfchar', name: '半邊字', cat: 'visual', img: 'img/reaction/halfchar.png' },
        { id: 'followme', name: '照著走', cat: 'memory', img: 'img/reaction/followme.png' },
        { id: 'chicks', name: '找回小雞', cat: 'memory', img: 'img/reaction/chicks.png' },
        { id: 'bounce', name: '球會跑去哪', cat: 'logic', img: 'img/reaction/bounce.png' },
        { id: 'cake', name: '分蛋糕', cat: 'guess', img: 'img/reaction/cake.png' },
        { id: 'seven', name: '逢七過', cat: 'number', img: 'img/reaction/seven.png' },
        { id: 'teacher', name: '老師說', cat: 'reaction', img: 'img/reaction/teacher.png' },
        { id: 'dualtask', name: '一心二用', cat: 'reaction', img: 'img/reaction/dualtask.png' },
        { id: 'pipes', name: '接水管', cat: 'logic', img: 'img/reaction/pipes.png' },
        { id: 'lightsout', name: '關燈', cat: 'logic', img: 'img/reaction/lightsout.png' },
        { id: 'seq', name: '猜下一個', cat: 'logic', img: 'img/reaction/seq.png' },
        { id: 'polyrhythm', name: '左右不同拍', cat: 'reaction', img: 'img/reaction/polyrhythm.png' },
        { id: 'area', name: '面積一樣大', cat: 'guess', img: 'img/reaction/area.png' },
        { id: 'halfvol', name: '容量一半', cat: 'guess', img: 'img/reaction/halfvol.png' },
        { id: 'blindcircle', name: '盲畫一個圓', cat: 'hand', img: 'img/reaction/blindcircle.png' },
        { id: 'samelen', name: '畫一樣長', cat: 'hand', img: 'img/reaction/samelen.png' },
        { id: 'rightangle', name: '畫成直角', cat: 'hand', img: 'img/reaction/rightangle.png' },
        { id: 'stamp', name: '蓋在框內', cat: 'hand', img: 'img/reaction/stamp.png' },
        { id: 'focus', name: '轉到最清楚', cat: 'visual', img: 'img/reaction/focus.png' },
        { id: 'scratch', name: '刮刮樂推理', cat: 'logic', img: 'img/reaction/scratch.png' },
        { id: 'mathcheck', name: '算式對不對', cat: 'number', img: 'img/reaction/mathcheck.png' },
        { id: 'fracduel', name: '分數大對決', cat: 'number', img: 'img/reaction/fracduel.png' },
        { id: 'primetrap', name: '質數陷阱', cat: 'number', img: 'img/reaction/primetrap.png' },
        { id: 'sum100', name: '湊百消除', cat: 'number', img: 'img/reaction/sum100.png' },
        { id: 'timestable', name: '乘法表抓錯', cat: 'number', img: 'img/reaction/timestable.png' },
        { id: 'maxexpr', name: '拼出最大數', cat: 'number', img: 'img/reaction/maxexpr.png' },
        { id: 'glyphspin', name: '鏡中旋轉字', cat: 'visual', img: 'img/reaction/glyphspin.png' },
        { id: 'fadee', name: '淡到看不見', cat: 'visual', img: 'img/reaction/fadee.png' },
        { id: 'oddsock', name: '落單的襪子', cat: 'visual', img: 'img/reaction/oddsock.png' },
        { id: 'ghostleg', name: '鬼腳圖', cat: 'hand', img: 'img/reaction/ghostleg.png' },
        { id: 'euler', name: '能一筆畫嗎', cat: 'logic', img: 'img/reaction/euler.png' },
        { id: 'colorrecall', name: '記色調色', cat: 'memory', img: 'img/reaction/colorrecall.png' },
        { id: 'basket', name: '菜籃總價', cat: 'number', img: 'img/reaction/basket.png' },
        { id: 'passersby', name: '路人走過', cat: 'memory', img: 'img/reaction/passersby.png' },
        { id: 'seenit', name: '這個看過嗎', cat: 'memory', img: 'img/reaction/seenit.png' },
        { id: 'whofirst', name: '誰先亮', cat: 'visual', img: 'img/reaction/whofirst.png' },
        { id: 'watchoff', name: '哪支錶不準', cat: 'visual', img: 'img/reaction/watchoff.png' },
        { id: 'handsmeet', name: '兩針重疊', cat: 'reaction', img: 'img/reaction/handsmeet.png' },
        { id: 'clearer', name: '越看越清楚', cat: 'visual', img: 'img/reaction/clearer.png' },
        { id: 'twobags', name: '兩袋一樣重', cat: 'guess', img: 'img/reaction/twobags.png' },
        { id: 'stackup', name: '重心疊疊樂', cat: 'hand', img: 'img/reaction/stackup.png' },
        { id: 'bridge', name: '搭一座橋', cat: 'reaction', img: 'img/reaction/bridge.png' },
        { id: 'halfcrowd', name: '一半的人', cat: 'guess', img: 'img/reaction/halfcrowd.png' },
        { id: 'catroad', name: '貓咪走山路', cat: 'hand', img: 'img/reaction/catroad.png' },
        { id: 'numline', name: '數線落點', cat: 'number', img: 'img/reaction/numline.png' },
        { id: 'twinsock', name: '雙胞胎襪子', cat: 'visual', img: 'img/reaction/twinsock.png' },
        { id: 'mixcolor', name: '混出什麼色', cat: 'visual', img: 'img/reaction/mixcolor.png' },
        { id: 'copycurve', name: '照抄曲線', cat: 'hand', img: 'img/reaction/copycurve.png' },
        { id: 'isequal', name: '等不等於', cat: 'number', img: 'img/reaction/isequal.png' },
        { id: 'orderops', name: '先乘除', cat: 'number', img: 'img/reaction/orderops.png' },
        { id: 'remainder', name: '求餘數', cat: 'number', img: 'img/reaction/remainder.png' },
        { id: 'hiddendigit', name: '遮住的數字', cat: 'number', img: 'img/reaction/hiddendigit.png' },
        { id: 'timeafter', name: '幾點幾分後', cat: 'number', img: 'img/reaction/timeafter.png' },
        { id: 'wrongline', name: '哪一行算錯', cat: 'number', img: 'img/reaction/wrongline.png' },
        { id: 'fillop', name: '挑加減乘除', cat: 'number', img: 'img/reaction/fillop.png' },
        { id: 'fastblink', name: '誰閃得快', cat: 'visual', img: 'img/reaction/fastblink.png' },
        { id: 'sneakmove', name: '誰在偷偷動', cat: 'visual', img: 'img/reaction/sneakmove.png' },
        { id: 'farpair', name: '哪對離最遠', cat: 'guess', img: 'img/reaction/farpair.png' },
        { id: 'dicechange', name: '骰子少一點', cat: 'memory', img: 'img/reaction/dicechange.png' },
        { id: 'whosaid', name: '誰說的', cat: 'memory', img: 'img/reaction/whosaid.png' },
        { id: 'tapback', name: '倒著點', cat: 'memory', img: 'img/reaction/tapback.png' },
        { id: 'nthshape', name: '第幾個出現', cat: 'memory', img: 'img/reaction/nthshape.png' },
        { id: 'spingap', name: '穿過旋轉縫', cat: 'reaction', img: 'img/reaction/spingap.png' },
        { id: 'sudokuone', name: '數獨猜一格', cat: 'logic', img: 'img/reaction/sudokuone.png' },
        { id: 'chequeamt', name: '支票金額', cat: 'number', img: 'img/reaction/chequeamt.png' },
        { id: 'mergechar', name: '左右合字', cat: 'logic', img: 'img/reaction/mergechar.png' },
        { id: 'flashlight', name: '手電筒猜圖', cat: 'visual', img: 'img/reaction/flashlight.png' },
        { id: 'racefirst', name: '誰先衝線', cat: 'visual', img: 'img/reaction/racefirst.png' },
        { id: 'spinpick', name: '轉盤停哪格', cat: 'guess', img: 'img/reaction/spinpick.png' },
        { id: 'alignchar', name: '對準才看到', cat: 'visual', img: 'img/reaction/alignchar.png' }
    ];
    /* 用 id 快速找到那一款（recent 頁籤只存 id，顯示時要靠它換回完整資料） */
    var gameById = {};
    GAME_CELLS.forEach(function (c) { gameById[c.id] = c; });

    /* function 是「函式」：把一段會重複使用的程式取個名字。soonCell 負責做出一個「構想中」的灰色格子。 */
    /* 「構想中」佔位格（主軸彈窗用）：cls 參數是 'theme'，拼出對應的 class 名稱（theme-cell--soon），
       disabled 屬性讓這個按鈕看起來能按、但實際點不了也不會有 hover/active 效果。 */
    function soonCell(cls) {
        return h('button', { 'class': cls + '-cell ' + cls + '-cell--soon', attrs: { disabled: 'disabled' } }, [
            h('span', { 'class': cls + '-cell__soon', text: '構想中' })
        ]);
    }

    /* 點彈窗的暗色背景就關閉彈窗：hidden = true 是 HTML 的「隱藏」屬性。（主軸彈窗用；遊戲彈窗是全螢幕，用「返回」關） */
    function closeOnBg(dlg) {
        dlg.addEventListener('click', function () { dlg.hidden = true; });
    }

    /* 先宣告變數、稍後 UI.ready 裡才指定值；Built 旗標讓彈窗「第一次打開才建立」，之後重複使用，省效能。 */
    var themeDlg, gameDlg;
    var themeBuilt = false;
    var gameMenu = null;         /* buildGameDlg() 建好之後的控制物件 { show, hide }；null＝還沒建 */

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

    /* ═══ 記住玩家的選擇（都存在 localStorage，關掉瀏覽器也記得）═══
       · LAST_GAME_KEY：上一次點的是哪一款 → 打開「全部」時自動捲到那一款，格子外圍會有一圈藍框；
       · RECENT_KEY：最近玩過的遊戲 id（最新的在最前面，最多 RECENT_MAX 款）→「最近」頁籤的內容；
       · TAB_KEY：上次停在哪個頁籤 → 下次打開還是那一頁。 */
    var LAST_GAME_KEY = 'fm.menu.lastGame';
    var RECENT_KEY = 'fm.menu.recent';
    var TAB_KEY = 'fm.menu.tab';
    var RECENT_MAX = 12;

    /* 最近玩過的 id 清單：去掉已經不存在的遊戲、重複的；從來沒存過「最近」但有「上次玩的」就用它當第一筆 */
    function recentIds() {
        var raw = UI.store.get(RECENT_KEY, null);
        var out = [];
        if (Array.isArray(raw)) {
            raw.forEach(function (id) { if (gameById[id] && out.indexOf(id) < 0) out.push(id); });
        } else {
            var last = UI.store.get(LAST_GAME_KEY, null);
            if (gameById[last]) out.push(last);
        }
        return out.slice(0, RECENT_MAX);
    }

    /* 玩家點了一款遊戲：記下來（上次玩的、最近玩過），再跳到那款遊戲 */
    function pickGame(id) {
        UI.store.set(LAST_GAME_KEY, id);
        var list = recentIds().filter(function (x) { return x !== id; });
        list.unshift(id);
        UI.store.set(RECENT_KEY, list.slice(0, RECENT_MAX));
        location.href = 'reaction.html?game=' + id;
    }

    /* 某個頁籤要顯示哪些遊戲（回傳 GAME_CELLS 裡的項目陣列）：
       全部＝每一款；最近＝recentIds() 的順序；其他＝cat 相同的那幾款（順序同「全部」）。 */
    function tabGames(tab) {
        if (tab === 'all') return GAME_CELLS.slice();
        if (tab === 'recent') return recentIds().map(function (id) { return gameById[id]; });
        return GAME_CELLS.filter(function (c) { return c.cat === tab; });
    }

    /* 這個頁籤 id 是不是合法的（存檔裡的值可能是舊版留下的、或被改壞） */
    function isTab(id) {
        return GAME_TABS.some(function (t) { return t.id === id; });
    }

    /* 這個函式負責做出一格遊戲按鈕（縮圖＋名字）。 */
    /* 一格遊戲：上面是縮圖（寬度撐滿格子，高度照比例），下面一行遊戲名稱（最多 5 個字）。
       縮圖載入失敗（還沒有圖檔）→ 把 <img> 藏起來，改顯示彩色底＋名字第一個字的「印章」，
       圖檔補齊之後會自動正常顯示，不用再改程式。 */
    function gameCell(c) {
        var idx = GAME_CELLS.indexOf(c);
        var img = h('img', { attrs: { src: c.img, alt: '', draggable: 'false', decoding: 'async' } });
        var seal = h('span', { 'class': 'game-cell__seal', text: c.name.charAt(0) });
        var cell = h('button', {
            'class': 'game-cell game-cell--tone' + (idx % 4), type: 'button',
            attrs: { 'data-id': c.id, 'aria-label': c.name },
            on: { click: function (e) { e.stopPropagation(); pickGame(c.id); } }
        }, [h('span', { 'class': 'game-cell__pic' }, [seal, img]), h('span', { 'class': 'game-cell__name', text: c.name })]);
        /* load / error 是圖片的事件：載入成功就藏起印章；載入失敗（沒有圖檔）就藏起圖片，只顯示印章。 */
        img.addEventListener('load', function () { seal.hidden = true; });
        img.addEventListener('error', function () { img.hidden = true; });
        return cell;
    }

    /* 舞台目前的縮放倍率（手機上通常小於 1）：getBoundingClientRect 量到的是「螢幕像素」，要除以它才是舞台裡的像素 */
    function stageScale() {
        var r = window.Stage && Stage.rect && Stage.rect();
        return (r && r.scale) || 1;
    }

    /* 建立「選遊戲」全螢幕彈窗：標題列（返回）、可捲動的遊戲格子、分類頁籤。回傳 { show, hide }。 */
    function buildGameDlg() {
        var cellEls = {};            /* 已經做好的格子（id → 按鈕），切換頁籤時重複使用，不用重做 */
        var tabEls = {};             /* 頁籤按鈕（id → 按鈕） */
        var curTab = 'all';

        function hide() { gameDlg.hidden = true; }

        /* 標題列：左上「返回」（樣式跟遊戲畫面的標題列同一套 .bar__back），標題置中 */
        var back = h('button', {
            'class': 'bar__back', type: 'button', attrs: { 'aria-label': '返回主選單' },
            html: UI.icon('back') + '<span>返回</span>', on: { click: hide }
        });
        var bar = h('div', { 'class': 'game-bar' }, [back, h('div', { 'class': 'game-bar__title', text: '選一個想玩的遊戲' })]);

        /* 遊戲格子：grid 是 3 欄的格線；list 是整個很長的內容（捲動時整個上下平移）；viewport 是看得見的窗口；thumb 是右邊的小滑桿 */
        var grid = h('div', { 'class': 'game-grid' });
        var list = h('div', { 'class': 'game-list' }, [grid]);
        var thumb = h('div', { 'class': 'game-thumb' });
        var viewport = h('div', { 'class': 'game-viewport' }, [list, thumb]);
        /* threshold: 8 → 手指／滑鼠要移動超過 8 個像素才算「拖曳」；沒超過就是「點一下」，按鈕照常收到點擊 */
        var scroller = Scroller.make(viewport, list, thumb, { threshold: 8 });

        /* 分類頁籤：文字直式排列，目前選中的那個填色 */
        var tabs = h('div', { 'class': 'game-tabs', attrs: { role: 'tablist' } });
        GAME_TABS.forEach(function (t) {
            var b = h('button', {
                'class': 'game-tab', type: 'button', text: t.name, attrs: { role: 'tab', 'aria-selected': 'false', 'data-tab': t.id },
                on: { click: function (e) { e.stopPropagation(); setTab(t.id); } }
            });
            tabEls[t.id] = b;
            tabs.appendChild(b);
        });

        /* render()：依照目前的頁籤，把該顯示的格子放進 grid（清空再放，格子元素本身是重複使用的） */
        function render() {
            var items = tabGames(curTab);
            var last = UI.store.get(LAST_GAME_KEY, null);
            grid.innerHTML = '';
            if (!items.length) {
                grid.appendChild(h('div', { 'class': 'game-empty' }, [
                    h('div', { 'class': 'game-empty__t', text: '還沒有玩過的遊戲' }),
                    h('div', { 'class': 'game-empty__s', text: '到「全部」挑一款開始玩吧' })
                ]));
            }
            items.forEach(function (c) {
                var el = cellEls[c.id] || (cellEls[c.id] = gameCell(c));
                el.classList.toggle('game-cell--last', c.id === last);
                grid.appendChild(el);
            });
            GAME_TABS.forEach(function (t) {
                var on = t.id === curTab;
                tabEls[t.id].classList.toggle('is-on', on);
                tabEls[t.id].setAttribute('aria-selected', on ? 'true' : 'false');
            });
            scroller.refresh();
        }

        /* 換頁籤：記住這次選的、重畫、捲回最上面 */
        function setTab(id) {
            curTab = id;
            UI.store.set(TAB_KEY, id);
            render();
            scroller.scrollTo(0);
        }

        /* 「全部」頁籤：把上次玩的那一款捲到畫面中間（它的格子外圍有藍框），不用每次都從最上面一路滑 */
        function scrollToLast() {
            var el = cellEls[UI.store.get(LAST_GAME_KEY, null)];
            if (!el || el.parentNode !== grid) return;
            var sc = stageScale();
            var top = (el.getBoundingClientRect().top - list.getBoundingClientRect().top) / sc;
            scroller.scrollTo(top - (viewport.clientHeight - el.offsetHeight) / 2);
        }

        gameDlg.appendChild(bar);
        gameDlg.appendChild(viewport);
        gameDlg.appendChild(tabs);
        /* 鍵盤 Esc 也可以關閉（電腦上方便） */
        document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !gameDlg.hidden) hide(); });

        return {
            hide: hide,
            show: function () {
                var saved = UI.store.get(TAB_KEY, 'all');
                curTab = isTab(saved) ? saved : 'all';
                if (curTab === 'recent' && !recentIds().length) curTab = 'all';      /* 還沒玩過任何遊戲就別停在空的「最近」 */
                gameDlg.hidden = false;                                              /* 先顯示出來，下面量尺寸才量得到 */
                render();
                scroller.scrollTo(0);
                if (curTab === 'all') scrollToLast();
            }
        };
    }

    /* 給 Node 測試用（test/reaction/t_menu.js）：資料與純函式；瀏覽器裡沒有人會用它 */
    window.FMMenu = { GAME_CELLS: GAME_CELLS, GAME_TABS: GAME_TABS, THEME_CELLS: THEME_CELLS, tabGames: tabGames, RECENT_MAX: RECENT_MAX, keys: { last: LAST_GAME_KEY, recent: RECENT_KEY, tab: TAB_KEY } };

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
            if (!gameMenu) gameMenu = buildGameDlg();
            gameMenu.show();
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

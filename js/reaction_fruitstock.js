/* ═══════════════════════════════════════════════════════════════════
   reaction_fruitstock.js — 秒反應・水果進出貨（原創篇 531「公車人數表」，照使用者的修改改成水果攤的進貨與賣出）
   樣式：css/games/reaction_fruitstock.css（class 一律以「fruitstock-」開頭）；數字鍵盤：js/numpad_lib.js
   ───────────────────────────────────────────────────────────────────
   · 玩法：水果攤上半部是每種水果的資料：名稱、顏色、**1 公斤有幾顆**、早上有幾顆。
     下半部是今天一筆一筆的進貨與賣出，寫法很多種：「賣出 蘋果 5 顆」「進貨 柳丁 2 公斤」「賣出 紅色的 3 顆」「進貨 黃色的 1 公斤」。
     算出**收攤時「被問到的那幾種」水果剩幾顆**（V1.43.0 起每關只問其中 1～3 種，被問到的那一列有黃底、有可以填的格子）：點那一種水果的「收攤」格子、用數字鍵填，
     全部填好按「對帳」。**算錯一種這一局就結束**，會列出那一種的算式。進出貨每一行的水果名稱前面都有水果的 emoji（寫顏色的那幾行用顏色的圓點）。
   · 頓悟：先把每一筆換成「哪一種、幾顆」（顏色對到水果、公斤 × 每公斤幾顆），再一種一種加減；
     同一種水果的進出分散在好幾行，要一筆都不漏。
   · 關卡：水果 1 → 8 種（KINDS）、進出 2 → 10 筆（EVENTS）（線性）；第 3 關起有「公斤」、第 6 關起有「顏色」（機會都隨關卡增加）；
     第 10 關起有「半公斤」（HALF_FROM）（只出現在每公斤顆數是偶數的水果）。賣出的數量不會超過當時攤上有的。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    /* 新手導讀：整個檔案包在 (function () { ... })(); 裡（叫「立即執行函式」），裡面的變數都是這個檔案私有的，不會跟別的遊戲檔案的同名變數打架。
       檔案由上往下大致分成：① 參數區（標題寫著可以自己調整的參數：難度、秒數、文字大多在這）；② 純函式（只做計算、不碰畫面：出題、判斷對錯，單元測試直接測它們）；③ 畫面（mount 是進場、setup 是每一關開始時呼叫，負責把畫面建出來並處理點擊）。
       最後的 Reaction.register(G) 把這款遊戲「登記」給選單（沒有這行，選單就看不到它）。'use strict' 是嚴格模式：打錯變數名稱會直接報錯，而不是默默建立新變數。
       這款遊戲的代號是 'fruitstock'：選單、成績、存檔都靠它；樣式在 css/games/reaction_fruitstock.css，裡面的 class 名稱一律以 fruitstock- 開頭。 */
    'use strict';

    var ID = 'fruitstock';                              /* 這款遊戲的代號：選單、成績、存檔、CSS class 前綴都用它 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 90 };  /* 成績規格：better（max＝越大越好、min＝越小越好）、decimals 小數位數、format 顯示格式、label 名稱、min／max 合理範圍（超出範圍的成績不會送排行榜） */
    var h = UI.h, kit = Reaction.kit;                   /* h：建立網頁元素的小工具；kit：闖關遊戲共用的工具箱 */

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 30;                           /* 難度升到頂的關卡：第 1 關線性變難，到第 30 關最難，之後維持不變 */
    var KINDS = [1, 8];                         /* 水果幾種：第 1 關 → 到頂 */
    var EVENTS = [2, 10];                       /* 進出貨幾筆：第 1 關 → 到頂 */
    var ASKS = [1, 3];                          /* 要回答幾種水果的收攤數量：第 1 關 → 到頂（簡單關只問 1 種、中難度 2 種、高難度 3 種；不會超過水果種數） */
    var KG_FROM = 3, KG_P = [0.5, 1.0];         /* 第幾關起出現「公斤」、機會（出現那關 → 到頂） */
    var COLOR_FROM = 6, COLOR_P = [0.5, 1.0];   /* 第幾關起出現「顏色」、機會 */
    var HALF_FROM = 10, HALF_P = 0.5;           /* 第幾關起出現「半公斤」、機會（只在每公斤顆數是偶數的水果） */
    var START = [8, 40];                        /* 早上每種有幾顆（亂數範圍） */
    var MAX_LEVEL = 90;                             /* 最後一關：過了第 90 關就算全破（也是成績的上限） */
    var PASS_DELAY_MS = 1500;                       /* 答對（過關）後停多久才換下一關（毫秒，1500 毫秒＝1.5 秒） */
    var FAIL_HOLD_MS = 7000;                        /* 答錯（失敗）後停多久才跳出結算畫面（毫秒，7000 毫秒＝7 秒），讓玩家先看清楚答案 */
    var TIME_BASE = 10, TIME_EVENT = [5, 3], TIME_ASK = 4;     /* 每一關限時（秒）＝基本 ＋ 每一筆進出貨幾秒（第 1 關 → 第 RAMP_LEVELS 關，線性縮短）＋ 每問一種水果幾秒；時間到了＝失敗（V1.43.1） */
    /* V1.47（玩家意見：題目的字太小）：進出貨的文字與水果表的字放大。畫面高度有限，所以「能放多大就放多大」（layoutFor）：
       進出貨的字級從 EV_FS 最大值往下試，先看一行放不放得下（兩欄的版面比較窄），再看整個畫面高度夠不夠；水果表每一列至少要 ROW_MIN 高，字級再跟著列高算。 */
    var EV_FS = [22, 32];                       /* 進出貨文字的字級（px）：最小 → 最大（以前固定 22） */
    var TB_FS = [22, 28];                       /* 水果表（水果名稱、顏色）的字級（px）：最小 → 最大（以前固定 22；「1 公斤、早上」多 4px，見 layoutFor） */
    var ROW_MIN = 30, ROW_MAX = 56;             /* 水果表每一列的高度範圍（px）；水果種類多到連 ROW_MIN 都放不下時，退到 FALLBACK_ROW */
    var FALLBACK_ROW = 26;                      /* 最難的關卡（水果 8 種、進出貨 10 筆）放不下時，水果表每一列最矮的高度（px），字級也退回最小 */
    var KEY_H = [34, 42];                       /* 數字鍵每顆的高度（px）：最矮 → 最高；空間不夠時先把數字鍵縮矮 */
    var COLOR_ICON = { 紅色: '🔴', 橘色: '🟠', 黃色: '🟡', 綠色: '🟢', 紫色: '🟣', 粉色: '🌸' };    /* 寫「顏色的」那幾行，名稱前面放顏色的圓點 */
    var FRUITS = [                              /* 名稱、圖示、顏色（文字）、顏色的 CSS 變數名尾碼、1 公斤幾顆 */
        { name: '蘋果', icon: '🍎', color: '紅色', c: 'red', perKg: 4 },
        { name: '番茄', icon: '🍅', color: '紅色', c: 'red', perKg: 12 },
        { name: '草莓', icon: '🍓', color: '紅色', c: 'red', perKg: 16 },
        { name: '橘子', icon: '🍊', color: '橘色', c: 'orange', perKg: 6 },
        { name: '檸檬', icon: '🍋', color: '黃色', c: 'yellow', perKg: 10 },
        { name: '香蕉', icon: '🍌', color: '黃色', c: 'yellow', perKg: 8 },
        { name: '芭樂', icon: '🍐', color: '綠色', c: 'green', perKg: 8 },
        { name: '哈密瓜', icon: '🍈', color: '綠色', c: 'green', perKg: 2 },
        { name: '葡萄', icon: '🍇', color: '紫色', c: 'green', perKg: 2 },
        { name: '茄子', icon: '🍆', color: '紫色', c: 'green', perKg: 4 },
        { name: '桃子', icon: '🍑', color: '粉色', c: 'pink', perKg: 5 }
    ];

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function timeFor(level, nEvents, nAsks) { return TIME_BASE + nEvents * kit.ramp(level, TIME_EVENT[0], TIME_EVENT[1], RAMP_LEVELS) + nAsks * TIME_ASK; }  /* kit.ramp(關卡, 起始值, 到頂值, 到頂關卡)：讓數值隨關卡「線性」從起始值變到到頂值（難度曲線的基本工具） */
    /* 版面（V1.47）：舞台高 H、寬 W，水果 K 種、進出貨 nEv 筆，算出「字能放多大」。
       textW(f)：進出貨最長那一行在字級 f px 時的寬度（畫面上用 canvas 量；測試可以傳估計值，沒給就不檢查寬度）。
       回傳 { evFs 進出貨字級, tbFs 水果名稱／顏色字級, tdFs 「1 公斤、早上」字級, rowH 水果表每列高, keyH 數字鍵高, evCols 進出貨幾欄 }。
       做法：進出貨字級由大到小試（EV_FS[1] → EV_FS[0]，每次少 2px）：① 一行放不放得下（超過 5 筆分兩欄，每欄比較窄）；
       ② 把數字鍵由高縮到矮（KEY_H），看剩下的高度能不能讓水果表每列有 ROW_MIN。第一組放得下的就用；
       都放不下（最難的關卡）→ 字級用最小、數字鍵最矮、每列至少 FALLBACK_ROW（跟 V1.43 以前一樣擠）。 */
    function layoutFor(H, W, K, nEv, textW) {
        var evCols = nEv > 5 ? 2 : 1, evRows = Math.ceil(nEv / evCols);   /* Math.ceil：無條件進位成整數 */
        var colW = (W * 0.96 - 16 - (evCols - 1) * 8) / evCols;           /* 進出貨每一欄可以放文字的寬度（外框 96%、左右內縮各 8、欄距 8） */
        /* 除了水果表每一列以外，其他東西佔的高度：表頭 24 ＋ 進出貨（每行「字級 × 1.25 行高 ＋ 4 間隔」＋ 外框內縮 10）＋ 數字鍵（4 排 ＋ 間隔 18）＋ 對帳鈕 52 ＋ 區塊間隔 24 ＋ 上方 4 ＋ 水果表列間隔 K × 4 */
        function fixedH(kh, evFs) { return 24 + (evRows * (Math.ceil(evFs * 1.25) + 4) + 10) + (4 * kh + 18) + 52 + 24 + 4 + K * 4; }
        function make(evFs, kh, rowH) {
            var tb = Math.max(TB_FS[0], Math.min(TB_FS[1], rowH - 8));    /* 水果名稱、顏色的字級：隨列高，最小 22、最大 28 */
            return { evFs: evFs, tbFs: tb, tdFs: tb + 4, rowH: rowH, keyH: kh, evCols: evCols };   /* 「1 公斤、早上」的字本來就比名稱大一級（26 對 22），所以多 4px */
        }
        for (var f = EV_FS[1]; f >= EV_FS[0]; f -= 2) {
            if (f > EV_FS[0] && textW && textW(f) > colW) continue;      /* 這個字級一行放不下（最小字級不檢查，跟以前一樣） */
            for (var kh = KEY_H[1]; kh >= KEY_H[0]; kh -= 2) {
                var rowH = Math.floor((H - fixedH(kh, f)) / K);           /* Math.floor：無條件捨去成整數 */
                if (rowH >= ROW_MIN) return make(f, kh, Math.min(ROW_MAX, rowH));
            }
        }
        return make(EV_FS[0], KEY_H[0], Math.max(FALLBACK_ROW, Math.min(ROW_MAX, Math.floor((H - fixedH(KEY_H[0], EV_FS[0])) / K))));
    }
    function sizeFor(level) {
        return {
            kinds: Math.round(kit.ramp(level, KINDS[0], KINDS[1], RAMP_LEVELS)),  /* Math.round：四捨五入成整數 */
            events: Math.round(kit.ramp(level, EVENTS[0], EVENTS[1], RAMP_LEVELS)),
            asks: Math.round(kit.ramp(level, ASKS[0], ASKS[1], RAMP_LEVELS))
        };
    }
    /* 某個功能從第 from 關開始出現，機會從 p[0] 走到 p[1]（到頂那關） */
    function chanceOf(level, from, p) { return level < from ? 0 : kit.ramp(level - from + 1, p[0], p[1], Math.max(2, RAMP_LEVELS - from + 1)); }
    /* 一筆進出貨的文字：{ dir:+1 進貨／−1 賣出, f（水果索引）, how:'name'|'color', unit:'pc'|'kg'|'half', amt（顆數或公斤數） } */
    function eventText(ev, fruits) {
        var fr = fruits[ev.f];
        var who = ev.how === 'color' ? (COLOR_ICON[fr.color] || '') + fr.color + '的' : fr.icon + fr.name;
        var qty = ev.unit === 'pc' ? ev.amt + ' 顆' : ev.unit === 'half' ? '半公斤' : ev.amt + ' 公斤';
        return (ev.dir > 0 ? '進貨 ' : '賣出 ') + who + ' ' + qty;
    }
    /* 這一筆是幾顆 */
    function piecesOf(ev, fruits) { var k = fruits[ev.f].perKg; return ev.unit === 'pc' ? ev.amt : ev.unit === 'half' ? k / 2 : ev.amt * k; }
    /* 收攤時每種剩幾顆 */
    function finalCounts(pz) {
        var out = pz.start.slice();                     /* slice()：複製一份陣列（之後改複本，不會動到原本的資料） */
        pz.events.forEach(function (ev) { out[ev.f] += ev.dir * piecesOf(ev, pz.fruits); });  /* forEach：對陣列的每個元素各做一次 */
        return out;
    }
    /* 出一題：{ fruits, start[], events[], answer[], asks[]（要回答的水果索引，由小到大） } */
    function makePuzzle(level, rand) {
        rand = rand || Math.random;                     /* 沒有傳亂數函式就用 Math.random（測試時可以傳固定的亂數，結果才能重現） */
        var sz = sizeFor(level), pKg = chanceOf(level, KG_FROM, KG_P), pColor = chanceOf(level, COLOR_FROM, COLOR_P);
        var fruits = kit.shuffle(FRUITS, rand).slice(0, sz.kinds);  /* kit.shuffle(陣列, rand)：把陣列隨機洗牌，回傳新陣列（不會動到原本的） */
        var start = fruits.map(function () { return kit.randInt(START[0], START[1], rand); });  /* kit.randInt(最小, 最大, rand)：隨機整數（含最小與最大） */
        var now = start.slice(), events = [];
        for (var e = 0; e < sz.events; e++) {
            /* 每種水果至少輪到一次：前 kinds 筆依序各一種，之後隨機 */
            var f = e < fruits.length ? e : kit.randInt(0, fruits.length - 1, rand), fr = fruits[f];
            var unit = 'pc', amt;
            if (level >= HALF_FROM && fr.perKg % 2 === 0 && rand() < HALF_P) { unit = 'half'; amt = 0.5; }
            else if (rand() < pKg) { unit = 'kg'; amt = kit.randInt(1, 3, rand); }
            else amt = kit.randInt(2, 12, rand);
            var pcs = unit === 'pc' ? amt : unit === 'half' ? fr.perKg / 2 : amt * fr.perKg;
            var dir = rand() < 0.45 ? 1 : -1;
            if (dir < 0 && pcs > now[f]) dir = 1;                     /* 攤上不夠賣，就改成進貨 */
            now[f] += dir * pcs;
            /* 「紅色的」要指得出是哪一種：這一關的水果裡有兩種以上同色，就改寫水果名稱 */
            var colorOk = fruits.filter(function (x) { return x.color === fr.color; }).length === 1;  /* filter：留下符合條件的元素，回傳新陣列 */
            events.push({ dir: dir, f: f, how: colorOk && rand() < pColor ? 'color' : 'name', unit: unit, amt: amt });
        }
        events = kit.shuffle(events, rand);        /* 打亂順序（不然前幾筆剛好是每種水果各一筆） */
        /* 打亂之後要再確認「賣出的不超過當時有的」：照新順序重算一遍，不夠就把那筆改成進貨 */
        now = start.slice();
        events.forEach(function (ev) { var p = piecesOf(ev, fruits); if (ev.dir < 0 && p > now[ev.f]) ev.dir = 1; now[ev.f] += ev.dir * p; });
        var pz = { fruits: fruits, start: start, events: events };
        pz.answer = finalCounts(pz);
        pz.asks = pickAsks(pz, Math.min(fruits.length, sz.asks), rand);
        return pz;
    }
    /* 要問哪幾種：優先挑「進出貨至少有 2 筆」的水果（只有 1 筆太好算），不夠再補其他的；回傳索引（由小到大） */
    function pickAsks(pz, n, rand) {
        var cnt = pz.fruits.map(function () { return 0; });  /* map：把陣列的每個元素轉換成別的東西，回傳新陣列 */
        pz.events.forEach(function (ev) { cnt[ev.f]++; });
        var idx = kit.shuffle(pz.fruits.map(function (_, i) { return i; }), rand || Math.random);
        var rich = idx.filter(function (i) { return cnt[i] >= 2; }), rest = idx.filter(function (i) { return cnt[i] < 2; });
        return rich.concat(rest).slice(0, n).sort(function (a, b) { return a - b; });  /* sort：排序；比較函式回傳負數代表 a 排前面、回傳正數代表 b 排前面 */
    }
    /* 某一種水果的算式：「蘋果：20 ＋ 12 − 5 − 8 ＝ 19 顆」 */
    function workOf(pz, f) {
        var s = pz.fruits[f].name + '：' + pz.start[f];
        pz.events.forEach(function (ev) { if (ev.f === f) s += (ev.dir > 0 ? ' ＋ ' : ' − ') + piecesOf(ev, pz.fruits); });
        return s + ' ＝ ' + pz.answer[f] + ' 顆';
    }
    /* 結算畫面的評語：依成績回傳一句話 */
    function rating(n) {
        if (n >= 25) return '水果攤老闆！';
        if (n >= 12) return '帳算得很清楚！';
        if (n >= 5) return '越來越有感覺了！';
        return '先把每一筆換成「哪一種、幾顆」，再一種一種算！';
    }

    /* ═══ 畫面 ═══ */
    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 5,
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['通過 ' + S.cleared + ' 關']; },
            setup: setup
        });
    }

    /* setup(api)：每一關開始時呼叫一次，負責出題並把這一關的畫面建出來。api 是共用骨架給的工具：api.stage（這一關的畫面容器）、api.level（第幾關）、
       api.after（延遲執行，換關後自動作廢）、api.timer（倒數計時）、api.pass／api.fail（過關／失敗）。 */
    function setup(api) {
        var stage = api.stage, level = api.level;       /* stage：這一關的畫面容器（要畫的東西都放進去）；level：現在是第幾關 */
        var pz = makePuzzle(level, api.rand), K = pz.fruits.length;
        api.info = pz;                                  /* 把這一關的題目資料掛在 api.info，測試與 debug 用（玩家看不到） */
        console.log('[水果進出貨] 第 ' + level + ' 關：' + K + ' 種、' + pz.events.length + ' 筆');  /* 在瀏覽器主控台（按 F12）印出這一關的出題內容，方便除錯與驗證 */
        /* 版面：舞台高 667px 要放下「水果表（標題＋K 列）＋進出貨（超過 5 筆分兩欄）＋4 排數字鍵＋對帳鈕」。
           V1.47：字能放多大就放多大——layoutFor 依高度與寬度算出進出貨字級、水果表字級、每列高度與數字鍵高度（最難的關卡擠不下時退回最小字級）。 */
        var H = stage.clientHeight || 667, W = stage.clientWidth || 472;
        var measure = document.createElement('canvas').getContext('2d');   /* 用一張看不見的畫布量文字寬度（measureText），判斷進出貨一行放不放得下 */
        var fam = getComputedStyle(stage).fontFamily || 'sans-serif';      /* 遊戲現在用的字型（量出來的寬度才準） */
        var evTexts = pz.events.map(function (ev) { return eventText(ev, pz.fruits); });   /* map：把陣列的每個元素轉換成別的東西，回傳新陣列 */
        var lay = layoutFor(H, W, K, pz.events.length, function (f) {
            measure.font = '700 ' + f + 'px ' + fam;
            return Math.max.apply(null, evTexts.map(function (t) { return measure.measureText(t).width; }));   /* 最長的一行有多寬 */
        });
        var rowH = lay.rowH, keyH = lay.keyH;
        var asked = {}; pz.asks.forEach(function (i) { asked[i] = true; });
        var ans = pz.fruits.map(function (_, i) { return asked[i] ? '' : '—'; }), sel = pz.asks[0], over = false;      /* 沒被問到的水果填「—」 */

        var wrap = h('div', { 'class': 'fruitstock-wrap' });  /* wrap：整個遊戲畫面的外框容器；下面建好的各個區塊（盤面、按鈕…）都放進它，最後再整個放進舞台 */
        wrap.style.setProperty('--fruitstock-row', rowH + 'px');  /* style.setProperty('--名稱', 值)：用 JS 設定 CSS 變數，CSS 裡用 var(--名稱) 取用（把算好的尺寸交給樣式） */
        wrap.style.setProperty('--fruitstock-ev-fs', lay.evFs + 'px');   /* V1.47：進出貨的字級 */
        wrap.style.setProperty('--fruitstock-tb-fs', lay.tbFs + 'px');   /* V1.47：水果名稱、顏色的字級 */
        wrap.style.setProperty('--fruitstock-td-fs', lay.tdFs + 'px');   /* V1.47：「1 公斤、早上」的字級 */
        var table = h('div', { 'class': 'fruitstock-table' });
        table.appendChild(h('div', { 'class': 'fruitstock-th', text: '水果' }));  /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
        table.appendChild(h('div', { 'class': 'fruitstock-th', text: '顏色' }));
        table.appendChild(h('div', { 'class': 'fruitstock-th', text: '1 公斤' }));
        table.appendChild(h('div', { 'class': 'fruitstock-th', text: '早上' }));
        table.appendChild(h('div', { 'class': 'fruitstock-th', text: '收攤剩' }));
        var inputs = [];
        pz.fruits.forEach(function (fr, i) {
            table.appendChild(h('div', { 'class': 'fruitstock-fruit' + (asked[i] ? ' fruitstock-fruit--ask' : '') }, [
                h('span', { 'class': 'fruitstock-icon', text: fr.icon }),
                h('span', { 'class': 'fruitstock-fname', text: fr.name })
            ]));
            table.appendChild(h('div', { 'class': 'fruitstock-td fruitstock-color fruitstock-color--' + fr.c, text: fr.color }));
            table.appendChild(h('div', { 'class': 'fruitstock-td', text: fr.perKg + ' 顆' }));
            table.appendChild(h('div', { 'class': 'fruitstock-td', text: pz.start[i] + ' 顆' }));
            var inp = asked[i] ? h('div', { 'class': 'fruitstock-input' }) : h('div', { 'class': 'fruitstock-td fruitstock-skip', text: '—' });
            if (asked[i]) kit.onTap(inp, function () { if (!over) { sel = i; paint(); } });  /* kit.onTap(元素, 函式)：幫元素綁定「點一下」的動作（手機觸控與電腦滑鼠通用，反應比一般 click 快） */
            table.appendChild(inp); inputs.push(inp);
        });
        var evBox = h('div', { 'class': 'fruitstock-events' + (lay.evCols > 1 ? ' fruitstock-events--two' : '') });
        pz.events.forEach(function (ev, i) {
            evBox.appendChild(h('div', { 'class': 'fruitstock-ev fruitstock-ev--' + (ev.dir > 0 ? 'in' : 'out'), text: evTexts[i] }));
        });
        var btnOk = h('button', { 'class': 'btn btn--primary fruitstock-ok', type: 'button', text: '對帳' });
        kit.onTap(btnOk, submit);
        wrap.appendChild(table); wrap.appendChild(evBox);
        stage.appendChild(wrap);                        /* 把整個遊戲區放進舞台（放進去，畫面上才看得到） */
        var pad = Reaction.numpad(wrap, { keyH: keyH, onKey: onKey });  /* 共用數字鍵盤（7 8 9／4 5 6／1 2 3／清除 0 ⌫），按鍵會呼叫 onKey */
        wrap.appendChild(btnOk);

        /* 重畫畫面：依目前的狀態（選中了什麼、填了什麼、對或錯…）更新每個元素的外觀 */
        function paint() {
            inputs.forEach(function (el, i) {
                if (!asked[i]) return;
                el.textContent = ans[i];                /* textContent：設定元素裡的文字（安全，不會被當成 HTML 解析） */
                el.className = 'fruitstock-input' + (i === sel && !over ? ' fruitstock-input--sel' : '') + (ans[i] !== '' ? ' fruitstock-input--filled' : '');
            });
            var left = pz.asks.filter(function (i) { return ans[i] === ''; }).length;
            btnOk.disabled = left > 0 || over;
            btnOk.textContent = left ? '還有 ' + left + ' 種沒填' : '對帳';
        }
        function onKey(k) {
            if (over) return;
            if (k === 'clr') ans[sel] = '';
            else if (k === 'del') ans[sel] = ans[sel].slice(0, -1);
            else if (ans[sel].length < 3 && !(ans[sel] === '0')) ans[sel] = ans[sel] + k;
            else if (ans[sel] === '0') ans[sel] = k;
            paint();
        }
        function submit() {
            if (over || pz.asks.some(function (i) { return ans[i] === ''; })) return;  /* some：陣列裡「只要有一個」元素符合條件就回傳 true */
            over = true; api.stopTimer(); pad.setEnabled(false);
            var bad = [];
            pz.asks.forEach(function (i) { if (parseInt(ans[i], 10) !== pz.answer[i]) bad.push(i); });
            paint();
            inputs.forEach(function (el, i) { if (!asked[i]) return; if (bad.indexOf(i) >= 0) { el.classList.add('fruitstock-input--bad'); el.textContent = ans[i] + '→' + pz.answer[i]; } else el.classList.add('fruitstock-input--ok'); });  /* classList.add／remove／toggle：加上／拿掉 CSS class，元素的外觀就跟著變（class 的樣式寫在 css 檔裡） */
            if (!bad.length) { btnOk.textContent = '帳對了！'; kit.flash(stage, true, api.my); api.pass({ delay: PASS_DELAY_MS }); return; }  /* kit.flash(舞台, 對或錯, 計時器)：畫面閃一下綠光（答對）或紅光（答錯） */
            settleFail(bad, '帳不對', []);
        }
        /* 時間到：每一種被問到的水果都算沒答出來，直接列出算式 */
        function timeUp() {
            if (over) return;
            over = true; pad.setEnabled(false); paint();
            inputs.forEach(function (el, i) { if (asked[i]) { el.classList.add('fruitstock-input--bad'); el.textContent = (ans[i] === '' ? '？' : ans[i]) + '→' + pz.answer[i]; } });
            settleFail(pz.asks.slice(), '時間到了', ['時間到了']);
        }
        function settleFail(bad, label, head) {
            var lines = bad.map(function (i) { return workOf(pz, i); });
            btnOk.textContent = label;
            evBox.innerHTML = ''; evBox.className = 'fruitstock-events';          /* 進出貨的位置改成列出算錯的那幾種的算式 */
            lines.forEach(function (t) { evBox.appendChild(h('div', { 'class': 'fruitstock-work', text: t })); });
            kit.flash(stage, false, api.my);
            api.fail({ delay: FAIL_HOLD_MS, lines: head.concat(lines) });  /* api.fail({ delay, lines })：宣告「失敗」，delay 毫秒後進結算畫面，lines 是結算要多寫的說明行 */
        }
        /* 給測試／debug 用：api.solve 自動走出正解、api.wrong 故意走錯一步、api.state 回報目前狀態（瀏覽器自動測試會呼叫它們，玩家用不到）。 */
        api.solve = function () { pz.asks.forEach(function (i) { ans[i] = String(pz.answer[i]); }); paint(); submit(); };
        api.wrong = function () { pz.asks.forEach(function (i) { ans[i] = String(pz.answer[i]); }); ans[pz.asks[0]] = String(pz.answer[pz.asks[0]] + 1); paint(); submit(); };
        api.state = function () { return { ans: ans.slice(), sel: sel, over: over }; };
        api.timeout = timeUp;
        api.timer(Math.round(timeFor(level, pz.events.length, pz.asks.length) * 1000), timeUp);  /* 開始倒數（畫面上方的時間條）：時間到就呼叫後面那個函式 */
        paint();
    }

    /* 遊戲登記資料：id 代號、name 選單上的名稱、rule 玩法說明（**包起來的是粗體重點）、mount 進場函式、score 成績規格、test 給單元測試用的內部函式。 */
    var G = {
        id: ID,
        name: '水果進出貨',
        rule: '水果攤上面寫著每種水果的**顏色、1 公斤有幾顆、早上有幾顆**；下面是今天一筆一筆的**進貨和賣出**，水果名稱前面有水果的圖案，有的只寫顏色（「紅色的」），有的寫顆數，有的寫公斤。**只要算出被問到的那幾種（黃底的那幾列）收攤時各剩幾顆**，前面的關卡只問 1 種，越後面問越多：點「收攤剩」的格子用數字鍵填，全部填好按「對帳」。**算錯一種就結束**，會列出算式。每一關有時間限制（上面的時間條，進出貨越多給的時間越長），時間到了也算失敗。',
        mount: mount,
        score: SCORE,
        /* test：把內部函式與參數交給單元測試（test/reaction/ 底下的 t_*.js）使用，遊戲本身不會用到。 */
        test: {
            layoutFor: layoutFor, EV_FS: EV_FS, TB_FS: TB_FS, ROW_MIN: ROW_MIN, ROW_MAX: ROW_MAX, FALLBACK_ROW: FALLBACK_ROW, KEY_H: KEY_H,
            sizeFor: sizeFor, timeFor: timeFor, TIME_BASE: TIME_BASE, TIME_EVENT: TIME_EVENT, TIME_ASK: TIME_ASK, chanceOf: chanceOf, eventText: eventText, piecesOf: piecesOf, finalCounts: finalCounts, makePuzzle: makePuzzle, workOf: workOf, pickAsks: pickAsks, rating: rating, ASKS: ASKS,
            FRUITS: FRUITS, RAMP_LEVELS: RAMP_LEVELS, KINDS: KINDS, EVENTS: EVENTS, KG_FROM: KG_FROM, COLOR_FROM: COLOR_FROM, HALF_FROM: HALF_FROM, MAX_LEVEL: MAX_LEVEL
        }
    };
    /* 把這款遊戲登記給選單（沒有這行，選單就看不到它） */
    Reaction.register(G);
})();

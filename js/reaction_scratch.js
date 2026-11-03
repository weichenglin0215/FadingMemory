/* ═══════════════════════════════════════════════════════════════════
   reaction_scratch.js — 秒反應・刮刮樂推理（V1.25 改版：關卡制、宮格線索）
   樣式：css/games/reaction_scratch.css（這款專屬的 class 一律以「scratch-」開頭；共用元件在 css/reaction_common.css）
   上方先把「這一關可能出現的 6 種圖案」完整顯示出來；下方是 12 張牌（4 欄 × 3 列），藏著「三張一模一樣」的圖案
   （其他 5 種圖案一共 9 張，每種最多 2 張，所以只有目標圖案會出現第三張）。
   每張牌的圖案被切成 g × g 宮格（3×3、4×4、5×5、6×6），只露出其中幾格當線索，其餘被刮刮漆蓋住；
   玩家要比對「露出的那幾格」跟上方 6 種圖案，推理哪幾張是同一個圖案。點一張牌＝把它整張刮開（看到完整圖案）。
   最多只能刮開 MAX_REV 張，在這之內找到三張相同的就過關；刮太多或時間到就失敗。成績＝通過幾關。
   ───────────────────────────────────────────────────────────────────
   · 圖案有四種「題材」，每 3 關換一種，循環：幾何圖形（路徑畫的）→ 水果（emoji）→ 阿拉伯數字 → 相似的中文字（筆劃多）。
   · 宮格大小隨關卡增加：第 1～3 關 3×3，第 4～7 關 4×4，第 8～12 關 5×5，第 13 關起 6×6；
     每張牌露出的比例從 60% 線性降到 30%（至少 2 格）；露出的格子優先挑「有筆畫（有墨水）的格子」，不會只露出一片空白。
   · 限時 TIME_S 60→35 秒。
   · 牌用兩層 canvas：底下是完整圖案，上面是刮刮漆（露出的宮格是透明的）；翻開時漆層淡出。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    /* 新手導讀：整個檔案包在 (function () { ... })(); 裡（叫「立即執行函式」），裡面的變數都是這個檔案私有的，不會跟別的遊戲檔案的同名變數打架。
       檔案由上往下大致分成：① 參數區（標題寫著可以自己調整的參數：難度、秒數、文字大多在這）；② 純函式（只做計算、不碰畫面：出題、判斷對錯，單元測試直接測它們）；③ 畫面（mount 是進場、setup 是每一關開始時呼叫，負責把畫面建出來並處理點擊）。
       最後的 Reaction.register(G) 把這款遊戲「登記」給選單（沒有這行，選單就看不到它）。'use strict' 是嚴格模式：打錯變數名稱會直接報錯，而不是默默建立新變數。
       這款遊戲的代號是 'scratch'：選單、成績、存檔都靠它；樣式在 css/games/reaction_scratch.css，裡面的 class 名稱一律以 scratch- 開頭。 */
    'use strict';

    var ID = 'scratch';                                 /* 這款遊戲的代號：選單、成績、存檔、CSS class 前綴都用它 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 90 };  /* 成績規格：better（max＝越大越好、min＝越小越好）、decimals 小數位數、format 顯示格式、label 名稱、min／max 合理範圍（超出範圍的成績不會送排行榜） */
    var h = UI.h, kit = Reaction.kit;                   /* h：建立網頁元素的小工具；kit：闖關遊戲共用的工具箱 */

    /* ═══ 可以自己調的參數 ═══ */
    var MAX_LEVEL = 90;                             /* 最後一關 */
    var COLS = 4, ROWS = 3, CELL = 108, GAP = 10;   /* 牌的排列與大小（px） */
    var TARGET_COUNT = 3;                           /* 要找到幾張一樣的 */
    var MAX_REV = 6;                                /* 最多刮開幾張（超過還沒找到三張一樣的就失敗） */
    var TIME_S = [60, 35];                          /* 每關限時（秒）：第 1 關 → 最後一關 */
    var SHOWN = [0.6, 0.3];                         /* 每張牌露出的宮格比例：第 1 關 → 最後一關 */
    var BAND_EVERY = 3;                             /* 每幾關換一種題材 */
    var K = 6;                                      /* 每關的圖案種數 */
    var SCALE = 2;                                  /* canvas 的像素密度（畫得比較清楚） */

    /* 四種題材的圖案池（id 就是畫面上的字或形狀名稱） */
    var SHAPES = ['circle', 'heart', 'triangle', 'diamond', 'square', 'cross', 'star', 'hexagon', 'pentagon', 'drop'];
    var SHAPE_D = {                                 /* 100×100 座標的路徑（Path2D 的 d 字串） */
        circle: 'M10 50a40 40 0 1 0 80 0a40 40 0 1 0 -80 0Z',
        heart: 'M50 88 C6 56 6 16 32 14 C42 13 48 20 50 28 C52 20 58 13 68 14 C94 16 94 56 50 88 Z',
        triangle: 'M50 8L94 90L6 90Z',
        diamond: 'M50 4L96 50L50 96L4 50Z',
        square: 'M12 12H88V88H12Z',
        cross: 'M36 8H64V36H92V64H64V92H36V64H8V36H36Z',
        star: 'M50 5L62 38L97 38L69 59L80 93L50 72L20 93L31 59L3 38L38 38Z',
        hexagon: 'M50 5L90 27V73L50 95L10 73V27Z',
        pentagon: 'M50 5L95 38L78 92H22L5 38Z',
        drop: 'M50 5C50 5 85 45 85 65A35 35 0 0 1 15 65C15 45 50 5 50 5Z'
    };
    var FRUITS = ['🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🍒', '🍑', '🍍', '🥝'];  /* 刮刮樂可能出現的水果 emoji */
    var DIGITS = ['0', '6', '8', '9', '3', '5', '2', '7', '1', '4'];  /* 刮刮樂的數字（順序是故意打亂的） */
    /* 相似的中文字，依筆劃由少到多排好：第 1 次出現中文字題材用前面的、越後面越往後面（筆劃多）挑。
       V1.33：改用共用資料庫 js/similar_chars.js（SimilarChars.chars()：同一組長得像的字排在一起，字群依平均筆劃由少到多），
       所以一次取的 10 個字裡，一定有好幾個彼此長得很像。 */
    var CHARS = SimilarChars.chars();
    var BANDS = ['shape', 'fruit', 'digit', 'char'];  /* 四條刮刮帶的題材：shape 形狀、fruit 水果、digit 數字、char 中文字 */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function bandFor(level) { return BANDS[Math.floor((level - 1) / BAND_EVERY) % BANDS.length]; }  /* Math.floor：無條件捨去成整數 */
    /* 宮格邊長：第 1～3 關 3，第 4～7 關 4，第 8～12 關 5，第 13 關起 6 */
    function gridFor(level) { return level <= 3 ? 3 : (level <= 7 ? 4 : (level <= 12 ? 5 : 6)); }
    function shownFrac(level) { return kit.ramp(level, SHOWN[0], SHOWN[1], MAX_LEVEL); }  /* kit.ramp(關卡, 起始值, 到頂值, 到頂關卡)：讓數值隨關卡「線性」從起始值變到到頂值（難度曲線的基本工具） */
    function shownCount(level) { var g = gridFor(level); return Math.max(2, Math.round(shownFrac(level) * g * g)); }  /* Math.round：四捨五入成整數 */
    function timeMs(level) { return Math.round(kit.ramp(level, TIME_S[0], TIME_S[1], MAX_LEVEL) * 1000); }
    /* 這一關用哪 K 種圖案（依題材；中文字依關卡往後面（筆劃多的）挑） */
    function pickPatterns(level, rand) {
        rand = rand || Math.random;                     /* 沒有傳亂數函式就用 Math.random（測試時可以傳固定的亂數，結果才能重現） */
        var band = bandFor(level), pool;
        if (band === 'shape') pool = SHAPES;
        else if (band === 'fruit') pool = FRUITS;
        else if (band === 'digit') pool = DIGITS;
        else {
            var span = 10, start = Math.round((CHARS.length - span) * Math.min(1, (level - 1) / (MAX_LEVEL - 1)));
            pool = CHARS.slice(start, start + span);
        }
        return kit.shuffle(pool.slice(), rand).slice(0, K);  /* kit.shuffle(陣列, rand)：把陣列隨機洗牌，回傳新陣列（不會動到原本的） */
    }
    /* 出牌：回傳 { band, grid, patterns（上方顯示的 K 種）, target, cells（12 張牌的圖案）, shown（每張牌露出的宮格編號） }
       inkOf(pattern) 可選：回傳這個圖案「有筆畫」的宮格編號陣列（瀏覽器裡用 canvas 量）；露出的格子優先從裡面挑 */
    function makeBoard(level, rand, inkOf) {
        rand = rand || Math.random;
        var patterns = pickPatterns(level, rand), target = patterns[0], others = patterns.slice(1);
        var single = kit.randInt(0, others.length - 1, rand), cells = [target, target, target];  /* kit.randInt(最小, 最大, rand)：隨機整數（含最小與最大） */
        others.forEach(function (s, i) { cells.push(s); if (i !== single) cells.push(s); });  /* forEach：對陣列的每個元素各做一次 */
        cells = kit.shuffle(cells, rand);
        var g = gridFor(level), k = Math.min(g * g, shownCount(level));
        var shown = cells.map(function (p) {            /* map：把陣列的每個元素轉換成別的東西，回傳新陣列 */
            var ink = inkOf ? inkOf(p, g) : null, all = [], i;
            for (i = 0; i < g * g; i++) all.push(i);
            var first = ink && ink.length ? kit.shuffle(ink.slice(), rand) : [];  /* slice()：複製一份陣列（之後改複本，不會動到原本的資料） */
            var rest = kit.shuffle(all.filter(function (x) { return first.indexOf(x) < 0; }), rand);  /* indexOf：找元素在陣列（或字串）裡的位置，找不到回傳 −1（所以 < 0 代表「不在裡面」） */
            return first.concat(rest).slice(0, k).sort(function (a, b) { return a - b; });  /* sort：排序；比較函式回傳負數代表 a 排前面、回傳正數代表 b 排前面 */
        });
        return { band: bandFor(level), grid: g, patterns: kit.shuffle(patterns.slice(), rand), target: target, cells: cells, shown: shown };
    }
    /* 目前翻開的牌中，有沒有任何圖案達到 TARGET_COUNT 張 */
    function winner(cells, revealed) {
        var cnt = {};
        revealed.forEach(function (i) { cnt[cells[i]] = (cnt[cells[i]] || 0) + 1; });
        for (var k in cnt) if (cnt[k] >= TARGET_COUNT) return k;
        return null;
    }
    /* 結算畫面的評語：依成績回傳一句話 */
    function rating(n) {
        if (n >= 18) return '推理大師！';
        if (n >= 12) return '高手！';
        if (n >= 6) return '不錯喔！';
        if (n >= 3) return '再接再厲！';
        return '多比對露出的那幾格，再來一次！';
    }

    /* ═══ 畫面（需要瀏覽器） ═══ */
    /* 把一個圖案畫在 size×size 的 canvas 上（ctx 已經 scale 過 SCALE） */
    function drawPattern(g, band, id, size, ink) {
        g.save();
        g.clearRect(0, 0, size, size);
        if (band === 'shape') {
            g.scale(size / 100, size / 100);
            var p = new Path2D(SHAPE_D[id]);
            g.fillStyle = '#E8822E'; g.fill(p);
            g.lineWidth = 4; g.lineJoin = 'round'; g.strokeStyle = ink; g.stroke(p);
        } else {
            g.textAlign = 'center'; g.textBaseline = 'middle';
            g.font = (band === 'fruit' ? '' : 'bold ') + Math.round(size * (band === 'fruit' ? 0.74 : 0.8)) + 'px "Noto Sans TC", "Microsoft JhengHei", sans-serif';
            g.fillStyle = ink;
            g.fillText(id, size / 2, size / 2 + size * 0.04);
        }
        g.restore();
    }
    /* 哪些宮格有「墨水」（透明度夠的像素占 15% 以上）：露出的線索優先從這裡挑 */
    function inkCells(cv, gridN) {
        var size = cv.width, d = cv.getContext('2d').getImageData(0, 0, size, size).data, out = [], cs = size / gridN;
        for (var r = 0; r < gridN; r++) for (var c = 0; c < gridN; c++) {
            var n = 0, tot = 0;
            for (var y = Math.floor(r * cs); y < Math.floor((r + 1) * cs); y += 2) for (var x = Math.floor(c * cs); x < Math.floor((c + 1) * cs); x += 2) { tot++; if (d[(y * size + x) * 4 + 3] > 100) n++; }
            if (tot && n / tot >= 0.15) out.push(r * gridN + c);
        }
        return out;
    }

    /* mount：選單按下這款遊戲時會呼叫它。把「闖關」的流程（第幾關、過關、失敗、結算、最佳紀錄）交給共用骨架 kit.run，我們只提供 setup（每一關怎麼畫）、rating（評語）等小零件。 */
    function mount(root, ctx) {
        /* V1.25 起刮刮樂推理改成關卡制（成績＝通過幾關、越大越好；以前是刮開幾格、越小越好），舊版的最佳紀錄不能比：第一次進來清掉（只清一次） */
        Reaction.migrateBest(ID, function () { return null; }, '.v125');
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 4,
            head: function (lv) { return '第 ' + lv + ' 關'; },
            info: function (S) { return gridFor(S.level) + '×' + gridFor(S.level) + ' 宮格'; },
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['通過 ' + S.cleared + ' 關']; },
            setup: setup
        });
    }

    /* setup(api)：每一關開始時呼叫一次，負責出題並把這一關的畫面建出來。api 是共用骨架給的工具：api.stage（這一關的畫面容器）、api.level（第幾關）、
       api.after（延遲執行，換關後自動作廢）、api.timer（倒數計時）、api.pass／api.fail（過關／失敗）。 */
    function setup(api) {
        var stage = api.stage, level = api.level, W = stage.clientWidth || 472;
        var gridN = gridFor(level), band = bandFor(level), SZ = CELL * SCALE;
        var inkColor = '#4A3B1E', coat = '#E0AA25', coat2 = '#C9921C';
        try {
            var cs = getComputedStyle(document.documentElement);
            inkColor = cs.getPropertyValue('--c-ink').trim() || inkColor; coat = cs.getPropertyValue('--c-yellow').trim() || coat; coat2 = cs.getPropertyValue('--c-orange').trim() || coat2;
        } catch (e) { }
        /* 每個圖案先畫一次（離螢幕 canvas），量出有墨水的宮格，再用它出牌 */
        var inkCache = {}, artCache = {};
        function art(p) {
            if (artCache[p]) return artCache[p];
            var cv = document.createElement('canvas'); cv.width = SZ; cv.height = SZ;
            var g = cv.getContext('2d'); drawPattern(g, band, p, SZ, inkColor);
            return (artCache[p] = cv);
        }
        function inkOf(p, gn) { var key = p + '|' + gn; return inkCache[key] || (inkCache[key] = inkCells(art(p), gn)); }
        var bd = makeBoard(level, api.rand, inkOf);
        api.info = bd;                                  /* 把這一關的題目資料掛在 api.info，測試與 debug 用（玩家看不到） */
        console.log('[刮刮樂推理] 第 ' + level + ' 關：' + band + '，' + gridN + '×' + gridN + '，目標圖案 ' + bd.target + '；牌面 ' + bd.cells.join(','));  /* 在瀏覽器主控台（按 F12）印出這一關的出題內容，方便除錯與驗證 */

        /* 上方：這一關的 6 種圖案（完整） */
        var refSize = 64, refGap = 8, refW = K * refSize + (K - 1) * refGap, rx0 = Math.round((W - refW) / 2);
        var refRow = h('div', { 'class': 'scratch-ref' });
        refRow.style.left = rx0 + 'px'; refRow.style.width = refW + 'px';
        bd.patterns.forEach(function (p) {
            var cv = document.createElement('canvas'); cv.width = refSize * SCALE; cv.height = refSize * SCALE; cv.className = 'scratch-refc';
            drawPattern(cv.getContext('2d'), band, p, refSize * SCALE, inkColor);
            refRow.appendChild(h('div', { 'class': 'scratch-refi' }, [cv]));  /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
        });
        stage.appendChild(h('div', { 'class': 'scratch-reftitle', text: '這一關的圖案（有 3 張一模一樣的）' }));
        stage.appendChild(refRow);

        /* 下方：12 張牌 */
        var bw = COLS * CELL + (COLS - 1) * GAP, bx0 = Math.round((W - bw) / 2);
        var board = h('div', { 'class': 'scratch-board' });  /* board：盤面（所有格子都放在裡面） */
        board.style.left = bx0 + 'px'; board.style.width = bw + 'px'; board.style.height = (ROWS * CELL + (ROWS - 1) * GAP) + 'px';
        stage.appendChild(board);
        var info = h('div', { 'class': 'scratch-info', text: '已刮開 0 / ' + MAX_REV + ' 張（點一張牌就整張刮開）' });
        stage.appendChild(info);

        var revealed = [], cards = [], done = false, hint = null, rev = 0;
        bd.cells.forEach(function (p, i) {
            var col = i % COLS, row = Math.floor(i / COLS);
            var el = h('div', { 'class': 'scratch-cell' });
            el.style.left = (col * (CELL + GAP)) + 'px'; el.style.top = (row * (CELL + GAP)) + 'px';
            var under = document.createElement('canvas'); under.width = SZ; under.height = SZ; under.className = 'scratch-under';
            under.getContext('2d').drawImage(art(p), 0, 0);
            var cv = document.createElement('canvas'); cv.width = SZ; cv.height = SZ; cv.className = 'scratch-coat';
            var g = cv.getContext('2d'), grad = g.createLinearGradient(0, 0, SZ, SZ); grad.addColorStop(0, coat); grad.addColorStop(1, coat2);
            g.fillStyle = grad; g.fillRect(0, 0, SZ, SZ);
            var cs2 = SZ / gridN;
            bd.shown[i].forEach(function (c) { g.clearRect(Math.floor((c % gridN) * cs2), Math.floor(Math.floor(c / gridN) * cs2), Math.ceil(cs2), Math.ceil(cs2)); });  /* Math.ceil：無條件進位成整數 */
            g.strokeStyle = 'rgba(74,59,30,0.35)'; g.lineWidth = 2;                   /* 宮格線（讓玩家看出每一格的位置） */
            for (var k = 1; k < gridN; k++) { g.beginPath(); g.moveTo(k * cs2, 0); g.lineTo(k * cs2, SZ); g.moveTo(0, k * cs2); g.lineTo(SZ, k * cs2); g.stroke(); }
            el.appendChild(under); el.appendChild(cv); board.appendChild(el);
            cards.push({ el: el });
            kit.onTap(el, function () { openCard(i); });  /* kit.onTap(元素, 函式)：幫元素綁定「點一下」的動作（手機觸控與電腦滑鼠通用，反應比一般 click 快） */
        });
        /* 操作提示（只在第一次進遊戲時）：手指點第一張牌（示範怎麼刮開，刮哪一張沒有標準答案） */
        if (level === 1 && kit.once('scratch.hint')) hint = kit.hintOn(stage, cards[0].el, { mode: 'tap', delay: 400, text: '請點牌，把它刮開' });  /* 操作提示（手指圖示指出該點哪裡）：玩家第一次按下就消失 */
        function hideHint() { if (hint) { hint.remove(); hint = null; } }

        function openCard(i) {
            if (done || api.over || revealed.indexOf(i) >= 0) return;
            hideHint();
            revealed.push(i); rev++;
            cards[i].el.classList.add('scratch-cell--open');  /* classList.add／remove／toggle：加上／拿掉 CSS class，元素的外觀就跟著變（class 的樣式寫在 css 檔裡） */
            Sfx.play('pop');                            /* Sfx.play(名稱)：播放音效（ok 答對、bad 答錯、click 點擊…；音效是程式即時合成的） */
            info.textContent = '已刮開 ' + rev + ' / ' + MAX_REV + ' 張';  /* textContent：設定元素裡的文字（安全，不會被當成 HTML 解析） */
            var w = winner(bd.cells, revealed);
            if (w) { win(w); return; }
            if (rev >= MAX_REV) lose('刮開 ' + MAX_REV + ' 張還沒找到三張一樣的');
        }
        function showAll(sym) {
            cards.forEach(function (c, i) {
                c.el.classList.add('scratch-cell--open');
                if (revealed.indexOf(i) < 0) c.el.classList.add('scratch-cell--rest');
                if (sym && bd.cells[i] === sym) c.el.classList.add('scratch-cell--hit');
            });
        }
        /* 過關：鎖住畫面、顯示成功效果，並呼叫 api.pass 進下一關（或結算） */
        function win(sym) {
            done = true; showAll(sym);
            api.pass({ delay: 1500 });                  /* api.pass({ delay })：宣告「過關」，delay 毫秒後進下一關（最後一關則進結算） */
        }
        function lose(why) {
            if (done) return;
            done = true; showAll(bd.target); info.textContent = why;
            api.fail({ delay: 2600, lines: [why, '三張一樣的是「' + bd.target + '」', '比對露出的宮格：同一個圖案露出的格子，位置會跟完整圖案的筆畫對得起來'] });  /* api.fail({ delay, lines })：宣告「失敗」，delay 毫秒後進結算畫面，lines 是結算要多寫的說明行 */
        }
        api.timer(timeMs(level), function () { lose('時間到！'); });  /* 開始倒數（畫面上方的時間條）：時間到就呼叫後面那個函式 */
        /* 給測試／debug 用：api.solve 自動走出正解、api.wrong 故意走錯一步、api.state 回報目前狀態（瀏覽器自動測試會呼叫它們，玩家用不到）。 */
        api.solve = function () { bd.cells.forEach(function (s, i) { if (s === bd.target) openCard(i); }); };
        api.wrong = function () {
            var n = 0;
            bd.cells.forEach(function (s, i) { if (s !== bd.target && n < MAX_REV) { openCard(i); n++; } });
        };
    }

    /* 遊戲登記資料：id 代號、name 選單上的名稱、rule 玩法說明（**包起來的是粗體重點）、mount 進場函式、score 成績規格、test 給單元測試用的內部函式。 */
    var G = {
        id: ID,
        name: '刮刮樂推理',
        rule: '上方是這一關的 6 種圖案。下方 12 張牌**藏著 3 張一模一樣的圖案**，每張牌只露出幾個宮格當線索。**比對露出的宮格，推理哪幾張是同一個圖案**，點牌就把它整張刮開。**最多只能刮開 6 張**，找到 3 張相同的就過關。越後面，宮格越多、露出的越少！',
        mount: mount,
        score: SCORE,
        /* test：把內部函式與參數交給單元測試（test/reaction/ 底下的 t_*.js）使用，遊戲本身不會用到。 */
        test: {
            bandFor: bandFor, gridFor: gridFor, shownFrac: shownFrac, shownCount: shownCount, timeMs: timeMs, pickPatterns: pickPatterns, makeBoard: makeBoard, winner: winner, rating: rating,
            SHAPES: SHAPES, SHAPE_D: SHAPE_D, FRUITS: FRUITS, DIGITS: DIGITS, CHARS: CHARS, BANDS: BANDS, COLS: COLS, ROWS: ROWS, CELL: CELL, GAP: GAP, MAX_REV: MAX_REV, MAX_LEVEL: MAX_LEVEL,
            TARGET_COUNT: TARGET_COUNT, K: K, TIME_S: TIME_S, SHOWN: SHOWN, BAND_EVERY: BAND_EVERY
        }
    };
    /* 把這款遊戲登記給選單（沒有這行，選單就看不到它） */
    Reaction.register(G);
})();

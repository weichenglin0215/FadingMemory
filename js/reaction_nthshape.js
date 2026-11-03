/* ═══════════════════════════════════════════════════════════════════
   reaction_nthshape.js — 秒反應・第幾個出現（企劃 169）
   樣式：css/games/reaction_nthshape.css（這款專屬的 class 一律以「nthshape-」開頭；共用元件在 css/reaction_common.css）
   畫面中央依序閃現幾個圖形（同一個圖形可以重複出現），閃完之後問：「第 3 個出現的是哪一個圖形？」，
   最下面是所有圖形的按鈕，點出答案。記的是「時間順序中的位置」，不是圖形本身。
   越後面，還會出現「同一種形狀、不同顏色」的圖形（紅色星形和藍色星形是不同的答案）。
   關卡制：答錯或來不及就結束，成績＝通過幾關。
   ───────────────────────────────────────────────────────────────────
   · 難度線性（RAMP_LEVELS 關走到頂）：圖形種類 2 → 6 種；閃現次數 5 → 9 次；每次閃現 0.8 → 0.45 秒；
     作答限時 7 → 4.5 秒。第 COLOR_FROM 關起，圖形有顏色，而且最多 2 種形狀會「多一個不同顏色的版本」
     （按鈕就多 1～2 顆）；之前所有圖形都是同一個顏色。
   · 閃現的圖形一律在畫面正中央，不顯示「第幾個」的編號（要自己數）。
   · 問的是第 k 個（k＝1～閃現次數，中間幾個的機率比頭尾高一點）。
   · 揭曉：整個順序排成一列，被問的那一個圈起來。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    /* 新手導讀：整個檔案包在 (function () { ... })(); 裡（叫「立即執行函式」），裡面的變數都是這個檔案私有的，不會跟別的遊戲檔案的同名變數打架。
       檔案由上往下大致分成：① 參數區（標題寫著可以自己調整的參數：難度、秒數、文字大多在這）；② 純函式（只做計算、不碰畫面：出題、判斷對錯，單元測試直接測它們）；③ 畫面（mount 是進場、setup 是每一關開始時呼叫，負責把畫面建出來並處理點擊）。
       最後的 Reaction.register(G) 把這款遊戲「登記」給選單（沒有這行，選單就看不到它）。'use strict' 是嚴格模式：打錯變數名稱會直接報錯，而不是默默建立新變數。
       這款遊戲的代號是 'nthshape'：選單、成績、存檔都靠它；樣式在 css/games/reaction_nthshape.css，裡面的 class 名稱一律以 nthshape- 開頭。 */
    'use strict';

    var ID = 'nthshape';                                /* 這款遊戲的代號：選單、成績、存檔、CSS class 前綴都用它 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 90 };  /* 成績規格：better（max＝越大越好、min＝越小越好）、decimals 小數位數、format 顯示格式、label 名稱、min／max 合理範圍（超出範圍的成績不會送排行榜） */
    var h = UI.h, kit = Reaction.kit;                   /* h：建立網頁元素的小工具；kit：闖關遊戲共用的工具箱 */

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 30;                       /* 幾關之後難度到頂 */
    var SHAPES_N = [2, 6];                      /* 圖形種類：第 1 關 → 到頂 */
    var SEQ_N = [3, 9];                         /* 閃現幾次：第 1 關 → 到頂 */
    var SHOW_MS = [800, 600];                   /* 每次閃現多久（毫秒）：第 1 關 → 到頂 */
    var GAP_MS = 200;                           /* 兩次之間的空檔（毫秒） */
    var ANS_S = [7, 10];                       /* 作答限時（秒）：第 1 關 → 到頂 */
    var COLOR_FROM = 8;                         /* 第幾關起圖形有顏色（而且有「同形不同色」） */
    var EXTRA = [1, 2];                         /* 「同形不同色」多幾顆按鈕：COLOR_FROM 關 → 到頂 */
    var MAX_LEVEL = 90;                             /* 最後一關：過了第 90 關就算全破（也是成績的上限） */
    /* 八種形狀（SVG 畫在 100×100 裡）與六種顏色（色相）*/
    var SHAPES = ['circle', 'square', 'triangle', 'star', 'diamond', 'heart', 'cross', 'hexagon'];
    var HUES = [{ n: '紅', h: 4 }, { n: '橘', h: 28 }, { n: '黃', h: 48 }, { n: '綠', h: 135 }, { n: '藍', h: 212 }, { n: '紫', h: 282 }];  /* 顏色的名稱 n 與色相角度 h（0～360） */
    var NEUTRAL = { n: '藍', h: 212 };          /* 前期所有圖形的顏色 */
    var SHAPE_NAME = { circle: '圓形', square: '正方形', triangle: '三角形', star: '星形', diamond: '菱形', heart: '愛心', cross: '十字', hexagon: '六角形' };  /* 每種圖形的中文名稱 */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function shapesFor(level) { return kit.clamp(Math.round(kit.ramp(level, SHAPES_N[0], SHAPES_N[1], RAMP_LEVELS)), SHAPES_N[0], SHAPES_N[1]); }  /* kit.ramp(關卡, 起始值, 到頂值, 到頂關卡)：讓數值隨關卡「線性」從起始值變到到頂值（難度曲線的基本工具） */
    function seqFor(level) { return kit.clamp(Math.round(kit.ramp(level, SEQ_N[0], SEQ_N[1], RAMP_LEVELS)), SEQ_N[0], SEQ_N[1]); }  /* kit.clamp(值, 最小, 最大)：把數值限制在範圍內（太小就取最小、太大就取最大） */
    function showMs(level) { return Math.round(kit.ramp(level, SHOW_MS[0], SHOW_MS[1], RAMP_LEVELS)); }  /* Math.round：四捨五入成整數 */
    function ansMs(level) { return Math.round(kit.ramp(level, ANS_S[0], ANS_S[1], RAMP_LEVELS) * 1000); }
    function extraFor(level) { return level < COLOR_FROM ? 0 : kit.clamp(Math.round(kit.ramp(level, EXTRA[0], EXTRA[1], RAMP_LEVELS - COLOR_FROM + 1)), EXTRA[0], EXTRA[1]); }
    /* 圖形的 SVG（100×100）；fill 是填色 */
    function shapeSvg(shape, fill, stroke) {
        var body;
        if (shape === 'circle') body = '<circle cx="50" cy="50" r="38"/>';
        else if (shape === 'square') body = '<rect x="14" y="14" width="72" height="72" rx="6"/>';
        else if (shape === 'triangle') body = '<polygon points="50,10 91,86 9,86"/>';
        else if (shape === 'diamond') body = '<polygon points="50,6 92,50 50,94 8,50"/>';
        else if (shape === 'heart') body = '<path d="M50 90 C8 60 4 28 27 19 C40 14 48 22 50 31 C52 22 60 14 73 19 C96 28 92 60 50 90 Z"/>';
        else if (shape === 'cross') body = '<polygon points="36,8 64,8 64,36 92,36 92,64 64,64 64,92 36,92 36,64 8,64 8,36 36,36"/>';
        else if (shape === 'hexagon') body = '<polygon points="50,6 88,28 88,72 50,94 12,72 12,28"/>';
        else {                                              /* star：五角星 */
            var pts = [];
            for (var i = 0; i < 10; i++) {
                var r = i % 2 === 0 ? 44 : 19, a = -Math.PI / 2 + i * Math.PI / 5;
                pts.push((50 + r * Math.cos(a)).toFixed(1) + ',' + (53 + r * Math.sin(a)).toFixed(1));
            }
            body = '<polygon points="' + pts.join(' ') + '"/>';
        }
        return '<svg viewBox="0 0 100 100" aria-hidden="true" fill="' + fill + '" stroke="' + stroke + '" stroke-width="5" stroke-linejoin="round">' + body + '</svg>';
    }
    function itemColors(it) { return { fill: kit.hsl(it.hue, 76, 56), stroke: kit.hsl(it.hue, 66, 30) }; }
    function itemSvg(it) { var c = itemColors(it); return shapeSvg(it.shape, c.fill, c.stroke); }
    /* 出一關：{ pool:[{shape, hue, cname}]（所有可能的圖形，也就是答案按鈕）, seq（閃現順序，pool 的索引）, ask（問第幾個，1 起算）, ans（答案是 pool 的第幾個） } */
    function makeLevel(level, rand) {
        rand = rand || Math.random;                     /* 沒有傳亂數函式就用 Math.random（測試時可以傳固定的亂數，結果才能重現） */
        var n = shapesFor(level), shapes = kit.sample(SHAPES, n, rand), pool = [], i;  /* kit.sample(陣列, n, rand)：從陣列隨機取 n 個不重複的元素 */
        if (level < COLOR_FROM) {
            shapes.forEach(function (s) { pool.push({ shape: s, hue: NEUTRAL.h, cname: NEUTRAL.n }); });  /* forEach：對陣列的每個元素各做一次 */
        } else {
            var cols = kit.shuffle(HUES, rand);         /* kit.shuffle(陣列, rand)：把陣列隨機洗牌，回傳新陣列（不會動到原本的） */
            shapes.forEach(function (s, k) { var c = cols[k % cols.length]; pool.push({ shape: s, hue: c.h, cname: c.n }); });
            /* 同形不同色：挑 extra 種形狀，各多一個「不同顏色」的版本 */
            kit.sample(shapes, Math.min(extraFor(level), shapes.length), rand).forEach(function (s) {
                var used = pool.filter(function (p) { return p.shape === s; }).map(function (p) { return p.hue; });  /* filter：留下符合條件的元素，回傳新陣列 */
                var c = kit.pick(HUES.filter(function (x) { return used.indexOf(x.h) < 0; }), rand);  /* kit.pick(陣列, rand)：從陣列隨機挑一個元素 */
                pool.push({ shape: s, hue: c.h, cname: c.n });
            });
            pool = kit.shuffle(pool, rand);
        }
        var L = seqFor(level), seq = [];
        for (i = 0; i < L; i++) seq.push(kit.randInt(0, pool.length - 1, rand));  /* kit.randInt(最小, 最大, rand)：隨機整數（含最小與最大） */
        /* 至少 2 種不同的圖形出現，不然問題沒意義 */
        if (new Set(seq).size < 2) seq[L - 1] = (seq[L - 1] + 1) % pool.length;
        /* 問第幾個：頭尾權重 0.6、中間 1 */
        var ws = seq.map(function (v, k) { return (k === 0 || k === L - 1) ? 0.6 : 1; });  /* map：把陣列的每個元素轉換成別的東西，回傳新陣列 */
        var tot = ws.reduce(function (a, b) { return a + b; }, 0), x = rand() * tot, ask = L;  /* reduce：把陣列的元素一個一個累積成一個值（例如加總） */
        for (i = 0; i < L; i++) { x -= ws[i]; if (x <= 0) { ask = i + 1; break; } }
        return { pool: pool, seq: seq, ask: ask, ans: seq[ask - 1] };
    }
    /* 結算畫面的評語：依成績回傳一句話 */
    function rating(n) {
        if (n >= 25) return '順序記憶大師！';
        if (n >= 15) return '記得又快又準！';
        if (n >= 8) return '不錯喔！';
        if (n >= 3) return '再接再厲！';
        return '邊看邊在心裡數，再來一次！';
    }

    /* mount：選單按下這款遊戲時會呼叫它。把「闖關」的流程（第幾關、過關、失敗、結算、最佳紀錄）交給共用骨架 kit.run，我們只提供 setup（每一關怎麼畫）、rating（評語）等小零件。 */
    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 6,
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
        var q = makeLevel(level, api.rand);
        api.info = q;                                   /* 把這一關的題目資料掛在 api.info，測試與 debug 用（玩家看不到） */
        var nm = function (it) { return (level >= COLOR_FROM ? it.cname + '色' : '') + SHAPE_NAME[it.shape]; };
        console.log('[第幾個出現] 第 ' + level + ' 關：' + q.pool.length + ' 種圖形；順序 ' + q.seq.map(function (i) { return nm(q.pool[i]); }).join('、') + '；問第 ' + q.ask + ' 個 → ' + nm(q.pool[q.ans]) + '；每次 ' + showMs(level) + ' ms，限時 ' + ansMs(level) + ' ms');  /* 在瀏覽器主控台（按 F12）印出這一關的出題內容，方便除錯與驗證 */

        var tip = h('div', { 'class': 'qz-note nthshape-tip', text: '請看圖形依序出現，要記得第幾個' });
        var show = h('div', { 'class': 'nthshape-show' });
        var strip = h('div', { 'class': 'nthshape-strip' });
        stage.appendChild(tip); stage.appendChild(show); stage.appendChild(strip);  /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
        var phase = 'show', btns = null;
        var t = 700, sm = showMs(level);
        q.seq.forEach(function (pi) {
            api.after(t, function () { show.innerHTML = itemSvg(q.pool[pi]); Sfx.play('tick'); });  /* Sfx.play(名稱)：播放音效（ok 答對、bad 答錯、click 點擊…；音效是程式即時合成的） */
            api.after(t + sm, function () { show.innerHTML = ''; });  /* api.after(毫秒, 函式)：過幾毫秒再執行；這一關結束後會自動作廢（不會跑到下一關去） */
            t += sm + GAP_MS;
        });
        api.after(t + 100, function () {
            phase = 'ask';
            tip.textContent = '第 ' + q.ask + ' 個出現的是哪一個圖形？';  /* textContent：設定元素裡的文字（安全，不會被當成 HTML 解析） */
            tip.classList.add('nthshape-tip--ask');     /* classList.add／remove／toggle：加上／拿掉 CSS class，元素的外觀就跟著變（class 的樣式寫在 css 檔裡） */
            var cols = q.pool.length <= 4 ? q.pool.length : 4;
            btns = kit.btnGrid(stage, q.pool.map(function (it, i) {  /* kit.btnGrid：共用的按鈕列（一排大按鈕） */
                return { html: itemSvg(it), kind: 'line', cls: 'nthshape-btn', onTap: function () { judge(i); } };
            }), { cols: cols, h: 96, gap: 10 }).btns;
            api.timer(ansMs(level), function () { judge(null); });  /* 開始倒數（畫面上方的時間條）：時間到就呼叫後面那個函式 */
            if (level === 1 && kit.once('nthshape.hint')) kit.hintOn(stage, btns[q.ans], { mode: 'tap', delay: 600, text: '請點擊圖形' });  /* 操作提示（手指圖示指出該點哪裡）：玩家第一次按下就消失 */
        });

        /* 判定玩家的答案：答對就過關（api.pass），答錯或超時就失敗（api.fail） */
        function judge(i) {
            if (api.over || phase !== 'ask') return;
            phase = 'done';
            var ok = i === q.ans;
            /* 揭曉：整個順序排成一列，被問的那一個圈起來 */
            strip.innerHTML = '';                       /* innerHTML = ''：把元素裡面的東西全部清掉 */
            q.seq.forEach(function (pi, k) {
                var c = h('div', { 'class': 'nthshape-cell' + (k + 1 === q.ask ? ' nthshape-cell--ask' : ''), html: itemSvg(q.pool[pi]) + '<span>' + (k + 1) + '</span>' });
                strip.appendChild(c);
            });
            show.innerHTML = '';
            if (btns) {
                btns[q.ans].classList.add('nthshape-btn--right');
                if (i != null && !ok) btns[i].classList.add('nthshape-btn--wrong');
            }
            if (ok) { kit.flash(stage, true, api.my); api.pass({ delay: 1500 }); return; }  /* kit.flash(舞台, 對或錯, 計時器)：畫面閃一下綠光（答對）或紅光（答錯） */
            kit.flash(stage, false, api.my);
            api.fail({                                  /* api.fail({ delay, lines })：宣告「失敗」，delay 毫秒後進結算畫面，lines 是結算要多寫的說明行 */
                delay: 2600, lines: [
                    (i == null ? '時間到！' : '選錯了') + '，第 ' + q.ask + ' 個出現的是：' + nm(q.pool[q.ans]),
                    '完整順序：' + q.seq.map(function (pi) { return nm(q.pool[pi]); }).join('、')
                ]
            });
        }
        /* 給測試／debug 用：api.solve 自動走出正解、api.wrong 故意走錯一步、api.state 回報目前狀態（瀏覽器自動測試會呼叫它們，玩家用不到）。 */
        api.solve = function () { if (phase !== 'ask') return; judge(q.ans); };
        api.wrong = function () { if (phase !== 'ask') return; judge((q.ans + 1) % q.pool.length); };
    }

    /* 遊戲登記資料：id 代號、name 選單上的名稱、rule 玩法說明（**包起來的是粗體重點）、mount 進場函式、score 成績規格、test 給單元測試用的內部函式。 */
    var G = {
        id: ID,
        name: '第幾個出現',
        rule: '畫面中央會**依序閃現幾個圖形**（同一個圖形可以重複出現），閃完後會問**「第幾個出現的是哪一個圖形」**，請點出下面的答案。後面還會出現同一種形狀、不同顏色的圖形。答錯或來不及就結束，看你能過幾關。',
        mount: mount,
        score: SCORE,
        /* test：把內部函式與參數交給單元測試（test/reaction/ 底下的 t_*.js）使用，遊戲本身不會用到。 */
        test: {
            shapesFor: shapesFor, seqFor: seqFor, showMs: showMs, ansMs: ansMs, extraFor: extraFor, shapeSvg: shapeSvg, makeLevel: makeLevel, rating: rating,
            RAMP_LEVELS: RAMP_LEVELS, COLOR_FROM: COLOR_FROM, SHAPES: SHAPES, SHAPE_NAME: SHAPE_NAME, HUES: HUES, MAX_LEVEL: MAX_LEVEL, SHAPES_N: SHAPES_N, SEQ_N: SEQ_N, SHOW_MS: SHOW_MS, ANS_S: ANS_S
        }
    };
    /* 把這款遊戲登記給選單（沒有這行，選單就看不到它） */
    Reaction.register(G);
})();

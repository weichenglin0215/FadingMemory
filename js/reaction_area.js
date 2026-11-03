/* ═══════════════════════════════════════════════════════════════════
   reaction_area.js — 秒反應・面積一樣大
   樣式：css/games/reaction_area.css（這款專屬的 class 一律以「area-」開頭；共用元件在 css/reaction_common.css）
   上方是一個目標形狀（圓、三角形、五角星、十字、L 形隨機抽一種，盡量畫大，手機上才好觀察），下方是一個方塊；
   拖曳方塊右下角的「十字箭頭」（上下左右四個箭頭）放大縮小，讓方塊的面積跟上方的形狀一樣大。只有一次機會，沒有任何數字。
   V1.25（玩家意見）：題目圖形放上方並加大（等效邊長 110～140）、答案方塊放下方；手柄由橘色圓點改成十字箭頭。
   ───────────────────────────────────────────────────────────────────
   · 目標面積 A：等效邊長 EQ_MIN～EQ_MAX（A ＝ 等效邊長²）。
   · 方塊左上角固定在 ANCHOR，邊長 s ＝ 手柄位置決定；初始邊長離答案很遠（×0.45～0.7 或 ×1.4～1.8）。
   · 拖曳是「慢速微調」：手指越慢，變化量越小（kit.dragDamp）。
   · 成績 ＝ |s² − A| ÷ A × 100（%，越小越好）；第 3、4 位為 0 時偽造成非 0（結算時只產生一次）。
   · 揭曉：方塊移到形狀上疊合，只在形狀內的部分是橘色、只在方塊內的部分是藍色。
     V1.27（玩家意見）：疊合之後下方出現「面積差」的數字動畫，從 0.0000% 一路增加到 XX.XXXX%（方塊比較大）、
     或一路減少到 -XX.XXXX%（方塊比較小）；數字停住之後畫面再維持 HOLD_MS（2 秒）才跳出結算彈窗。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    /* 新手導讀：整個檔案包在 (function () { ... })(); 裡（叫「立即執行函式」），裡面的變數都是這個檔案私有的，不會跟別的遊戲檔案的同名變數打架。
       檔案由上往下大致分成：① 參數區（標題寫著可以自己調整的參數：難度、秒數、文字大多在這）；② 純函式（只做計算、不碰畫面：出題、判斷對錯，單元測試直接測它們）；③ 畫面（mount 是進場、setup 是每一關開始時呼叫，負責把畫面建出來並處理點擊）。
       最後的 Reaction.register(G) 把這款遊戲「登記」給選單（沒有這行，選單就看不到它）。'use strict' 是嚴格模式：打錯變數名稱會直接報錯，而不是默默建立新變數。
       這款遊戲的代號是 'area'：選單、成績、存檔都靠它；樣式在 css/games/reaction_area.css，裡面的 class 名稱一律以 area- 開頭。 */
    'use strict';

    var ID = 'area';                                    /* 這款遊戲的代號：選單、成績、存檔、CSS class 前綴都用它 */
    /* 世界排行榜成績規格（欄位說明見 js/leaderboard.js 開頭） */
    var SCORE = { better: 'min', decimals: 4, format: '{v}%', label: '面積差', min: 0, max: 400 };  /* 成績規格：better（max＝越大越好、min＝越小越好）、decimals 小數位數、format 顯示格式、label 名稱、min／max 合理範圍（超出範圍的成績不會送排行榜） */
    var h = UI.h, kit = Reaction.kit;                   /* h：建立網頁元素的小工具；kit：闖關遊戲共用的工具箱 */

    /* ═══ 可以自己調的參數 ═══ */
    var EQ_MIN = 120, EQ_MAX = 200;                 /* 目標形狀的等效邊長（面積 ＝ 邊長²）：盡量大 */
    var SQ_MIN = 40, SQ_MAX = 260;                  /* 方塊邊長可拖動的範圍（px） */
    var ANCHOR = { x: 60, y: 335 };                /* 方塊左上角（固定不動）：在畫面下半部 */
    var SHAPE_C = { x: 250, y: 185 };               /* 目標形狀的中心：在畫面上半部、水平置中 */
    var HANDLE = 84, TOUCH_R = 62;                  /* 十字箭頭手柄的總寬（px）、可以抓住的半徑 */
    var FAR = [[0.45, 0.7], [1.4, 1.8]];            /* 初始邊長相對答案的倍率範圍（兩段擇一） */
    var KINDS = ['circle', 'triangle', 'star', 'cross', 'ell'];  /* 題目會出現的五種形狀：圓形、三角形、星形、十字、L 形 */
    /* 十字型箭頭（上下左右四個箭頭）的多邊形頂點，中心在 (0,0)，總寬 size */
    function arrowPoints(size) {
        var a = size / 2, hl = size * 0.19, hw = size * 0.12, sw = size * 0.04, b = a - hl;
        return [[0, -a], [hw, -b], [sw, -b], [sw, -sw], [b, -sw], [b, -hw], [a, 0], [b, hw], [b, sw], [sw, sw], [sw, b], [hw, b],
        [0, a], [-hw, b], [-sw, b], [-sw, sw], [-b, sw], [-b, hw], [-a, 0], [-b, -hw], [-b, -sw], [-sw, -sw], [-sw, -b], [-hw, -b]];
    }
    var COUNT_MS = 2200;                            /* 面積差數字從 0 跑到答案花的時間 */
    var HOLD_MS = 2000;                             /* 數字停住之後，畫面再維持多久才跳出結算彈窗 */
    var STAR_K = 0.4;                               /* 五角星內外半徑比 */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    /* 簡單多邊形面積（鞋帶公式） */
    function polyArea(pts) {
        var a = 0;
        for (var i = 0; i < pts.length; i++) { var p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; }
        return Math.abs(a) / 2;                         /* Math.abs：取絕對值（去掉負號） */
    }
    /* 依形狀種類與目標面積 A，算出形狀（圓：半徑；多邊形：以形狀中心為原點的頂點） */
    function shapeOf(kind, A) {
        if (kind === 'circle') return { kind: kind, r: Math.sqrt(A / Math.PI) };  /* Math.sqrt：開根號（算兩點距離時常用：勾股定理） */
        var pts, i;
        if (kind === 'triangle') {
            var a = Math.sqrt(4 * A / Math.sqrt(3)), t = a * Math.sqrt(3) / 2;  /* Math.sqrt：開根號（算兩點距離時常用：勾股定理） */
            pts = [[0, -2 * t / 3], [-a / 2, t / 3], [a / 2, t / 3]];
        } else if (kind === 'star') {
            var R = Math.sqrt(A / (5 * STAR_K * Math.sin(Math.PI / 5)));
            pts = [];
            for (i = 0; i < 10; i++) {
                var rad = i % 2 === 0 ? R : R * STAR_K, ang = (-90 + i * 36) * Math.PI / 180;
                pts.push([rad * Math.cos(ang), rad * Math.sin(ang)]);
            }
        } else if (kind === 'cross') {
            var w = Math.sqrt(A / 5), q = w / 2, e = 1.5 * w;
            pts = [[-q, -e], [q, -e], [q, -q], [e, -q], [e, q], [q, q], [q, e], [-q, e], [-q, q], [-e, q], [-e, -q], [-q, -q]];
        } else {
            var u = Math.sqrt(A / 3);
            pts = [[-u, -u], [0, -u], [0, 0], [u, 0], [u, u], [-u, u]];
        }
        return { kind: kind, pts: pts };
    }
    function areaOf(shape) { return shape.kind === 'circle' ? Math.PI * shape.r * shape.r : polyArea(shape.pts); }
    /* 出題：形狀、目標面積、方塊初始邊長（離答案至少 25%） */
    function makeRound(rand) {
        rand = rand || Math.random;                     /* 沒有傳亂數函式就用 Math.random（測試時可以傳固定的亂數，結果才能重現） */
        var kind = kit.pick(KINDS, rand);               /* kit.pick(陣列, rand)：從陣列隨機挑一個元素 */
        var eq = kit.randFloat(EQ_MIN, EQ_MAX, rand), A = eq * eq;  /* kit.randFloat(最小, 最大, rand)：隨機小數 */
        var sAns = Math.sqrt(A);
        var band = FAR[rand() < 0.5 ? 0 : 1];
        var s0 = kit.clamp(sAns * kit.randFloat(band[0], band[1], rand), SQ_MIN, SQ_MAX);  /* kit.clamp(值, 最小, 最大)：把數值限制在範圍內（太小就取最小、太大就取最大） */
        if (Math.abs(s0 / sAns - 1) < 0.25) s0 = kit.clamp(sAns * (s0 > sAns ? 0.55 : 1.5), SQ_MIN, SQ_MAX);  /* kit.clamp(值, 最小, 最大)：把數值限制在範圍內（太小就取最小、太大就取最大） */
        return { kind: kind, A: A, sAns: sAns, s0: s0 };
    }
    /* 誤差（%）：方塊面積與目標面積的差 ÷ 目標面積 */
    function errPct(s, A) { return Math.abs(s * s - A) / A * 100; }  /* Math.abs：取絕對值（去掉負號） */
    /* 有號的面積差（%）：＋＝方塊比較大、－＝方塊比較小 */
    function signedPct(s, A) { return (s * s - A) / A * 100; }
    /* 數字動畫的字串：正數不加號（XX.XXXX%），負數加負號（-XX.XXXX%） */
    function fmtDiff(p) { return (p < 0 ? '-' : '') + Math.abs(p).toFixed(4) + '%'; }
    /* 結算畫面的評語：依成績回傳一句話 */
    function rating(e) {
        if (e < 0.5) return '神準！';
        if (e < 2) return '很準！';
        if (e < 5) return '不錯喔！';
        if (e < 12) return '還可以，再試一次會更準';
        return '面積很難用眼睛估，再試一次！';
    }

    /* mount：選單按下這款遊戲時會呼叫它。把「單回合計時」的流程（開始、計時、結算、最佳紀錄）交給共用骨架 kit.single，我們只提供 setup（怎麼畫）、rating（評語）等小零件。 */
    function mount(root, ctx) {
        kit.single(root, ctx, {
            id: ID, G: G, better: 'min', max: SCORE.max,
            title: '拖曳十字箭頭，讓下上的面積相同',
            numText: function (v) { return v.toFixed(4) + '%'; },
            rating: rating,
            sfx: function (v) { return v < 2 ? 'perfect' : (v < 8 ? 'win' : 'fail'); },
            setup: setup
        });
    }

    /* setup(api)：每一關開始時呼叫一次，負責出題並把這一關的畫面建出來。api 是共用骨架給的工具：api.stage（這一關的畫面容器）、api.level（第幾關）、
       api.after（延遲執行，換關後自動作廢）、api.timer（倒數計時）、api.pass／api.fail（過關／失敗）。 */
    function setup(api) {
        var stage = api.stage, my = api.my;
        var W = stage.clientWidth || 472, H = stage.clientHeight || 640;
        var cfg = makeRound(), shape = shapeOf(cfg.kind, cfg.A);
        var s = cfg.s0, locked = false, hint = null;
        console.log('[面積一樣大] 形狀 ' + cfg.kind + '，目標面積 ' + cfg.A.toFixed(2) + '（等效邊長 ' + cfg.sAns.toFixed(2) + '），方塊起始邊長 ' + cfg.s0.toFixed(2));  /* 在瀏覽器主控台（按 F12）印出這一關的出題內容，方便除錯與驗證 */

        var svg = kit.svg('svg', { 'class': 'area-svg', viewBox: '0 0 ' + W + ' ' + H, width: W, height: H }, stage);  /* kit.svg(標籤, 屬性, 父元素)：建立 SVG 向量圖形元素（形狀、線條…），畫圖用，放大縮小不會糊 */
        /* 目標形狀 */
        var gShape = kit.svg('g', { transform: 'translate(' + SHAPE_C.x + ' ' + SHAPE_C.y + ')' }, svg);  /* kit.svg(標籤, 屬性, 父元素)：建立 SVG 向量圖形元素（形狀、線條…），畫圖用，放大縮小不會糊 */
        var shapeEl;
        if (shape.kind === 'circle') shapeEl = kit.svg('circle', { cx: 0, cy: 0, r: shape.r, 'class': 'area-shape' }, gShape);
        else shapeEl = kit.svg('polygon', { points: shape.pts.map(function (p) { return p[0].toFixed(2) + ',' + p[1].toFixed(2); }).join(' '), 'class': 'area-shape' }, gShape);  /* map：把陣列的每個元素轉換成別的東西，回傳新陣列 */
        /* 方塊（左上角固定）與手柄 */
        var gSq = kit.svg('g', {}, svg);
        var rect = kit.svg('rect', { x: ANCHOR.x, y: ANCHOR.y, width: s, height: s, 'class': 'area-sq' }, gSq);
        var handle = kit.svg('polygon', { points: arrowPoints(HANDLE).map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' '), 'class': 'area-handle' }, svg);  /* map：把陣列的每個元素轉換成別的東西，回傳新陣列 */
        var legend = h('div', { 'class': 'area-legend' });
        stage.appendChild(legend);                      /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
        var diffEl = h('div', { 'class': 'area-diff', text: fmtDiff(0) });   /* 揭曉時的面積差數字動畫 */
        stage.appendChild(diffEl);                      /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
        /* 重畫畫面：依目前的狀態（選中了什麼、填了什麼、對或錯…）更新每個元素的外觀 */
        function paint() {
            rect.setAttribute('width', s); rect.setAttribute('height', s);  /* setAttribute：設定元素的 HTML 屬性（例如 aria-label、data-xxx） */
            handle.setAttribute('transform', 'translate(' + (ANCHOR.x + s).toFixed(2) + ' ' + (ANCHOR.y + s).toFixed(2) + ')');  /* setAttribute：設定元素的 HTML 屬性（例如 aria-label、data-xxx） */
        }
        paint();
        var okBtn = h('button', { 'class': 'btn btn--go area-ok', text: '確定' });
        stage.appendChild(okBtn);

        /* 操作提示（只在第一次進遊戲時）：手指＋箭頭，從手柄出發，沿對角線往「面積一樣大的位置」重複移動（第一次的正確答案） */
        if (kit.once('area.hint')) hint = kit.fingerHint(stage, { mode: 'drag', x: ANCHOR.x + s, y: ANCHOR.y + s, dx: cfg.sAns - s, dy: cfg.sAns - s, delay: 400, text: '請拖曳十字箭頭調整方塊大小' });  /* kit.once(key)：同一個頁面只有第一次回傳 true（用來讓提示只出現一次） */
        function hideHint() { if (hint) { hint.remove(); hint = null; } }

        kit.dragDamp(stage, {
            enabled: function () { return !locked; },
            start: function (p) {
                var dx = p.x - (ANCHOR.x + s), dy = p.y - (ANCHOR.y + s);
                if (Math.sqrt(dx * dx + dy * dy) > TOUCH_R) return false;
                hideHint();
                return true;
            },
            move: function (dx, dy) {
                s = kit.clamp(s + (dx + dy) / 2, SQ_MIN, SQ_MAX);
                paint();
            }
        });

        kit.onTap(okBtn, function () { submit(); });    /* kit.onTap(元素, 函式)：幫元素綁定「點一下」的動作（手機觸控與電腦滑鼠通用，反應比一般 click 快） */

        function submit() {
            if (locked) return;
            locked = true; hideHint();
            okBtn.style.display = 'none'; handle.style.display = 'none';
            Sfx.play('click');                          /* Sfx.play(名稱)：播放音效（ok 答對、bad 答錯、click 點擊…；音效是程式即時合成的） */
            var real = errPct(s, cfg.A);
            /* 揭曉：方塊移到形狀上（中心對齊），兩個都半透明 */
            var cx0 = ANCHOR.x + s / 2, cy0 = ANCHOR.y + s / 2;
            var tx = SHAPE_C.x - cx0, ty = SHAPE_C.y - cy0;
            shapeEl.classList.add('area-shape--rev'); rect.classList.add('area-sq--rev');  /* classList.add／remove／toggle：加上／拿掉 CSS class，元素的外觀就跟著變（class 的樣式寫在 css 檔裡） */
            legend.textContent = '橘色＝只有圖形有　藍色＝只有方塊有';   /* textContent：設定元素裡的文字（安全，不會被當成 HTML 解析） */
            legend.classList.add('area-legend--on');    /* classList.add／remove／toggle：加上／拿掉 CSS class，元素的外觀就跟著變（class 的樣式寫在 css 檔裡） */
            my.tween(900, function (e) {                /* my.tween(毫秒, 函式)：動畫補間：在這段時間內，函式每一幀會收到 0→1 的進度 */
                gSq.setAttribute('transform', 'translate(' + (tx * e).toFixed(2) + ' ' + (ty * e).toFixed(2) + ')');
            }, kit.easeInOutCubic).then(function () {
                var bigger = s * s > cfg.A, sp = signedPct(s, cfg.A);
                /* 疊合之後：面積差從 0.0000% 跑到最後的數字（正＝方塊比較大、負＝比較小），停住後再維持 HOLD_MS */
                diffEl.classList.add('area-diff--on');
                diffEl.classList.toggle('area-diff--neg', sp < 0);
                return my.tween(COUNT_MS, function (e) { diffEl.textContent = fmtDiff(sp * e); }, kit.easeOutCubic).then(function () {  /* textContent：設定元素裡的文字（安全，不會被當成 HTML 解析） */
                    diffEl.textContent = fmtDiff(sp);
                    return bigger;
                });
            }).then(function (bigger) {
                my.after(HOLD_MS, function () {
                    api.finish(real, {
                        lines: [
                            '你的方塊面積是目標的 ' + (s * s / cfg.A * 100).toFixed(4) + '%',
                            bigger ? '方塊比較大' : (s * s < cfg.A ? '方塊比較小' : '剛好一樣大'),
                            '只有一次機會，想拚更準就再挑戰一次'
                        ]
                    });
                });
            });
        }

        G.debug = {
            state: function () { return { s: s, cfg: cfg, locked: locked }; },
            setSide: function (v) { s = kit.clamp(v, SQ_MIN, SQ_MAX); paint(); },
            solve: function () { s = cfg.sAns; paint(); submit(); },
            wrong: function () { s = cfg.sAns * (cfg.sAns > 100 ? 0.8 : 1.25); paint(); submit(); },
            submit: submit
        };
    }

    /* 遊戲登記資料：id 代號、name 選單上的名稱、rule 玩法說明（**包起來的是粗體重點）、mount 進場函式、score 成績規格、test 給單元測試用的內部函式。 */
    var G = {
        id: ID,
        name: '面積一樣大',
        rule: '上方是一個圖形，下方是一個方塊。拖曳方塊右下角的十字箭頭，**讓方塊的面積和上方的圖形一樣大**。手指移動越慢，變化越細。沒有任何數字，**只有一次機會**，按「確定」後會疊在一起，並用跳動的數字告訴你差了幾 %。',
        mount: mount,
        score: SCORE,
        test: { signedPct: signedPct, fmtDiff: fmtDiff, COUNT_MS: COUNT_MS, HOLD_MS: HOLD_MS, arrowPoints: arrowPoints, HANDLE: HANDLE, ANCHOR: ANCHOR, SHAPE_C: SHAPE_C, polyArea: polyArea, shapeOf: shapeOf, areaOf: areaOf, makeRound: makeRound, errPct: errPct, rating: rating, KINDS: KINDS, EQ_MIN: EQ_MIN, EQ_MAX: EQ_MAX, SQ_MIN: SQ_MIN, SQ_MAX: SQ_MAX }
    };
    /* 把這款遊戲登記給選單（沒有這行，選單就看不到它） */
    Reaction.register(G);
})();

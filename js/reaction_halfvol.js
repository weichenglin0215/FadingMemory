/* ═══════════════════════════════════════════════════════════════════
   reaction_halfvol.js — 秒反應・容量一半
   樣式：css/games/reaction_halfvol.css（這款專屬的 class 一律以「halfvol-」開頭；共用元件在 css/reaction_common.css）
   一個花瓶（每次曲線都不一樣），拖曳水位線，讓「線以下」的花瓶剪影面積剛好是整個花瓶的一半——
   不是一半的高度！只有一次機會。
   ───────────────────────────────────────────────────────────────────
   · 花瓶輪廓：半徑 r(y)（y 從瓶底往上）由 NODES 個隨機控制點用 Catmull-Rom 平滑連起來；
     V1.27（玩家意見）：「容量」只比「側面剪影的面積」，不再換算成立體容量（人腦沒辦法把 r² 換算出來）：
     V(y) ＝ ∫ 2r dy，用 1px 一格的數值積分（累積陣列），找出一半面積的高度 h*。
   · 出題限制：h* 與「一半高度」至少差 MIN_GAP（相對瓶高），不然拉到一半高度就接近正確。
   · 成績 ＝ |V(線以下) − V總÷2| ÷ V總 × 100（%，越小越好，最大 50）。畫面上眼睛看到的剪影面積就是計分的面積。
   · 揭曉（V1.25 玩家意見）：玩家拖的藍線不動，水從瓶底慢慢往上累積到藍線；水面下方即時顯示
     「目前水量與目標 50% 的差異」，從 −50.0000% 一路往上，過了 0 就變成 ＋XX.XXXX%；水面停住之後才出現代表 50% 的綠線；
     動畫結束後再停 REVEAL_PAUSE_MS（V1.27 起 2 秒，讓玩家看清楚差距）才跳出結算彈窗（沒有灰色的一半高度虛線了）。
     結算彈窗最上面的 % 帶正負號：＋＝水量超過一半（倒太多），－＝不足。
   · 差異的公式：V(y) ＝ ∫₀ʸ 2 r(t) dt（水位線以下的剪影面積），差異 ＝ (V(線) − V總÷2) ÷ V總 × 100（%）。
     （V1.25 曾經用旋轉體容量 ∫ π r² dt，玩家說看起來差很多，V1.27 改成看到什麼就算什麼；
     test/reaction/t_halfvol.js 用「把剪影切成很多條橫帶、再逐條相加」的獨立算法核對。水面因此是平的直線，不再畫成橢圓。）
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    /* 新手導讀：整個檔案包在 (function () { ... })(); 裡（叫「立即執行函式」），裡面的變數都是這個檔案私有的，不會跟別的遊戲檔案的同名變數打架。
       檔案由上往下大致分成：① 參數區（標題寫著可以自己調整的參數：難度、秒數、文字大多在這）；② 純函式（只做計算、不碰畫面：出題、判斷對錯，單元測試直接測它們）；③ 畫面（mount 是進場、setup 是每一關開始時呼叫，負責把畫面建出來並處理點擊）。
       最後的 Reaction.register(G) 把這款遊戲「登記」給選單（沒有這行，選單就看不到它）。'use strict' 是嚴格模式：打錯變數名稱會直接報錯，而不是默默建立新變數。
       這款遊戲的代號是 'halfvol'：選單、成績、存檔都靠它；樣式在 css/games/reaction_halfvol.css，裡面的 class 名稱一律以 halfvol- 開頭。 */
    'use strict';

    var ID = 'halfvol';                                 /* 這款遊戲的代號：選單、成績、存檔、CSS class 前綴都用它 */
    var SCORE = { better: 'min', decimals: 4, format: '{v}%', label: '容量差', min: 0, max: 50 };  /* 成績規格：better（max＝越大越好、min＝越小越好）、decimals 小數位數、format 顯示格式、label 名稱、min／max 合理範圍（超出範圍的成績不會送排行榜） */
    var h = UI.h, kit = Reaction.kit;                   /* h：建立網頁元素的小工具；kit：闖關遊戲共用的工具箱 */

    /* ═══ 可以自己調的參數 ═══ */
    var VASE_H = 480;                       /* 瓶高（px） */
    var NODES = 7;                          /* 輪廓控制點數 */
    var R_MIN = 22, R_MAX = 105;            /* 控制點半徑範圍 */
    var R_FLOOR = 14;                       /* 任何高度的半徑下限（避免瓶頸細成一條線） */
    var MIN_GAP = 0.08;                     /* 一半容量的高度與一半高度至少差瓶高的幾倍 */
    var START_GAP = 0.15;                   /* 起始水位離答案至少差瓶高的幾倍 */
    var CX = 236, BOTTOM = 575;             /* 花瓶中軸 x、瓶底 y（舞台座標） */
    var RISE_MS = 2600;                     /* 揭曉時水位從瓶底升到藍線花的時間 */
    var REVEAL_PAUSE_MS = 2000;             /* 動畫結束（水停住、綠線出現）之後，停多久才出現結算彈窗 */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    /* Catmull-Rom 內插：四個相鄰控制點 p0 p1 p2 p3，t 在 p1～p2 之間 */
    function cr(p0, p1, p2, p3, t) {
        var t2 = t * t, t3 = t2 * t;
        return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
    }
    /* 半徑 r(y)：y 在 0～VASE_H（從瓶底往上），rs 是 NODES 個控制點半徑 */
    function radiusAt(rs, y) {
        var u = kit.clamp(y / VASE_H, 0, 1) * (rs.length - 1);  /* kit.clamp(值, 最小, 最大)：把數值限制在範圍內（太小就取最小、太大就取最大） */
        var i = Math.min(rs.length - 2, Math.floor(u)), t = u - i;  /* Math.floor：無條件捨去成整數 */
        var p0 = rs[Math.max(0, i - 1)], p1 = rs[i], p2 = rs[i + 1], p3 = rs[Math.min(rs.length - 1, i + 2)];
        return Math.max(R_FLOOR, cr(p0, p1, p2, p3, t));
    }
    /* 累積面積陣列：cum[k] ＝ 從瓶底到高度 k px 的剪影面積（單位：px²；左右兩邊共 2r，只比較比例） */
    function cumulative(rs) {
        var cum = [0];
        for (var k = 1; k <= VASE_H; k++) {
            var r = radiusAt(rs, k - 0.5);
            cum.push(cum[k - 1] + 2 * r);
        }
        return cum;
    }
    /* 高度 y（可以有小數）以下的面積：在累積陣列上線性內插 */
    function volumeAt(cum, y) {
        y = kit.clamp(y, 0, VASE_H);                    /* kit.clamp(值, 最小, 最大)：把數值限制在範圍內（太小就取最小、太大就取最大） */
        var i = Math.min(VASE_H - 1, Math.floor(y)), t = y - i;  /* Math.floor：無條件捨去成整數 */
        return cum[i] + (cum[i + 1] - cum[i]) * t;
    }
    /* 一半面積的高度 h*：二分搜尋 */
    function halfHeight(cum) {
        var half = cum[VASE_H] / 2, lo = 0, hi = VASE_H;
        for (var it = 0; it < 50; it++) { var mid = (lo + hi) / 2; if (volumeAt(cum, mid) < half) lo = mid; else hi = mid; }
        return (lo + hi) / 2;
    }
    /* 誤差（%）：線以下的面積與一半總面積的差 ÷ 總面積 */
    function errPct(cum, y) { return Math.abs(volumeAt(cum, y) - cum[VASE_H] / 2) / cum[VASE_H] * 100; }  /* Math.abs：取絕對值（去掉負號） */
    /* 有號的差異（%）：＋＝線以下的面積超過一半、－＝不足。空瓶是 −50、滿瓶是 ＋50 */
    function signedPct(cum, y) { return (volumeAt(cum, y) - cum[VASE_H] / 2) / cum[VASE_H] * 100; }
    /* 帶正負號的百分比字串：＋3.1234% ／ −0.5000%（0 算＋） */
    function fmtSigned(p) { return (p >= 0 ? '+' : '−') + Math.abs(p).toFixed(4) + '%'; }  /* Math.abs：取絕對值（去掉負號） */
    /* 出題：隨機控制點半徑；h* 要離一半高度夠遠；起始水位離答案與一半高度都夠遠 */
    function makeRound(rand) {
        rand = rand || Math.random;                     /* 沒有傳亂數函式就用 Math.random（測試時可以傳固定的亂數，結果才能重現） */
        for (var tries = 0; tries < 800; tries++) {
            var rs = [];
            for (var i = 0; i < NODES; i++) rs.push(kit.randFloat(R_MIN, R_MAX, rand));  /* kit.randFloat(最小, 最大, rand)：隨機小數 */
            var cum = cumulative(rs), hs = halfHeight(cum);
            if (Math.abs(hs - VASE_H / 2) < MIN_GAP * VASE_H) continue;
            var start = null;
            for (var k = 0; k < 40 && start == null; k++) {
                var c = kit.randFloat(0.08, 0.92, rand) * VASE_H;  /* kit.randFloat(最小, 最大, rand)：隨機小數 */
                if (Math.abs(c - hs) >= START_GAP * VASE_H && Math.abs(c - VASE_H / 2) >= 0.1 * VASE_H) start = c;
            }
            if (start == null) continue;
            return { rs: rs, cum: cum, hs: hs, start: start, total: cum[VASE_H] };
        }
        /* 保底：瓶底肥、瓶口細 → 一半面積遠低於一半高度 */
        var fb = [100, 95, 70, 40, 28, 24, 30], cumF = cumulative(fb);
        return { rs: fb, cum: cumF, hs: halfHeight(cumF), start: 0.85 * VASE_H, total: cumF[VASE_H] };
    }
    /* 結算畫面的評語：依成績回傳一句話 */
    function rating(e) {
        if (e < 0.3) return '神準！';
        if (e < 1) return '很準！';
        if (e < 3) return '不錯喔！';
        return '面積不等於高度，再試一次！';
    }

    /* mount：選單按下這款遊戲時會呼叫它。把「單回合計時」的流程（開始、計時、結算、最佳紀錄）交給共用骨架 kit.single，我們只提供 setup（怎麼畫）、rating（評語）等小零件。 */
    function mount(root, ctx) {
        kit.single(root, ctx, {
            id: ID, G: G, better: 'min', max: SCORE.max,
            title: '拖曳水位線，讓線以下的花瓶面積剛好是一半',
            numText: function (v) { return v.toFixed(4) + '%'; },
            rating: rating,
            sfx: function (v) { return v < 1 ? 'perfect' : (v < 4 ? 'win' : 'fail'); },
            setup: setup
        });
    }

    /* setup(api)：每一關開始時呼叫一次，負責出題並把這一關的畫面建出來。api 是共用骨架給的工具：api.stage（這一關的畫面容器）、api.level（第幾關）、
       api.after（延遲執行，換關後自動作廢）、api.timer（倒數計時）、api.pass／api.fail（過關／失敗）。 */
    function setup(api) {
        var stage = api.stage, my = api.my;
        var W = stage.clientWidth || 472, H = stage.clientHeight || 640;
        var cfg = makeRound(), L = cfg.start, Wl = L, locked = false, hint = null;
        console.log('[容量一半] 一半面積的高度 ' + cfg.hs.toFixed(2) + '（一半高度 ' + (VASE_H / 2) + '），起始水位 ' + cfg.start.toFixed(2));  /* 在瀏覽器主控台（按 F12）印出這一關的出題內容，方便除錯與驗證 */
        var base = Math.min(BOTTOM, H - 100);
        function yOf(level) { return base - level; }

        var svg = kit.svg('svg', { 'class': 'halfvol-svg', viewBox: '0 0 ' + W + ' ' + H, width: W, height: H }, stage);  /* kit.svg(標籤, 屬性, 父元素)：建立 SVG 向量圖形元素（形狀、線條…），畫圖用，放大縮小不會糊 */
        /* 瓶身輪廓（每 4px 取一點） */
        function side(sign) {
            var pts = [];
            for (var y = 0; y <= VASE_H; y += 4) pts.push([CX + sign * radiusAt(cfg.rs, y), yOf(y)]);
            return pts;
        }
        var left = side(-1), right = side(1);
        var outline = left.concat(right.slice().reverse());  /* slice()：複製一份陣列（之後改複本，不會動到原本的資料） */
        kit.svg('polygon', { points: outline.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' '), 'class': 'halfvol-vase' }, svg);  /* map：把陣列的每個元素轉換成別的東西，回傳新陣列 */
        var water = kit.svg('polygon', { 'class': 'halfvol-water' }, svg);  /* kit.svg(標籤, 屬性, 父元素)：建立 SVG 向量圖形元素（形狀、線條…），畫圖用，放大縮小不會糊 */
        kit.svg('polygon', { points: outline.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' '), 'class': 'halfvol-rim' }, svg);  /* map：把陣列的每個元素轉換成別的東西，回傳新陣列 */
        var refHalfV = kit.svg('line', { x1: CX - 150, x2: CX + 150, y1: yOf(cfg.hs), y2: yOf(cfg.hs), 'class': 'halfvol-ref halfvol-ref--v', opacity: 0 }, svg);
        var line = kit.svg('line', { x1: CX - 150, x2: CX + 150, 'class': 'halfvol-line' }, svg);
        var hl = kit.svg('circle', { cx: CX - 150, r: 20, 'class': 'halfvol-knob' }, svg);
        var hr = kit.svg('circle', { cx: CX + 150, r: 20, 'class': 'halfvol-knob' }, svg);
        var diffTxt = kit.svg('text', { x: CX, y: 0, 'text-anchor': 'middle', 'class': 'halfvol-diff', opacity: 0 }, svg);   /* 水面下方：目前水量與 50% 的差異 */
        var msg = h('div', { 'class': 'halfvol-msg' });
        stage.appendChild(msg);                         /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
        var okBtn = h('button', { 'class': 'btn btn--go halfvol-ok', text: '確定' });
        stage.appendChild(okBtn);                       /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */

        function waterPoly(level) {
            var pts = [];
            for (var y = 0; y <= level; y += 4) pts.push([CX - radiusAt(cfg.rs, y), yOf(y)]);
            pts.push([CX - radiusAt(cfg.rs, level), yOf(level)]);
            for (var y2 = level; y2 >= 0; y2 -= 4) pts.push([CX + radiusAt(cfg.rs, y2), yOf(y2)]);
            pts.push([CX + radiusAt(cfg.rs, 0), yOf(0)]);
            return pts.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ');
        }
        /* L ＝ 藍線（玩家拖的）的位置；Wl ＝ 水位（平常等於 L，揭曉時從 0 升到 L，藍線不動） */
        function paint() {
            water.setAttribute('points', waterPoly(Wl));  /* setAttribute：設定元素的 HTML 屬性（例如 aria-label、data-xxx） */
            line.setAttribute('y1', yOf(L)); line.setAttribute('y2', yOf(L));  /* setAttribute：設定元素的 HTML 屬性（例如 aria-label、data-xxx） */
            hl.setAttribute('cy', yOf(L)); hr.setAttribute('cy', yOf(L));
        }
        paint();

        /* 操作提示（只在第一次進遊戲時）：手指＋箭頭，從水位線右邊的把手往「剛好一半容量的高度」重複移動（第一次的正確答案） */
        if (kit.once('halfvol.hint')) hint = kit.fingerHint(stage, { mode: 'drag', x: CX + 150, y: yOf(L), dx: 0, dy: yOf(cfg.hs) - yOf(L), delay: 400 });  /* kit.once(key)：同一個頁面只有第一次回傳 true（用來讓提示只出現一次） */
        function hideHint() { if (hint) { hint.remove(); hint = null; } }

        kit.dragDamp(stage, {
            enabled: function () { return !locked; },
            start: function () { hideHint(); return true; },
            move: function (dx, dy) { L = kit.clamp(L - dy, 0, VASE_H); Wl = L; paint(); }
        });
        kit.onTap(okBtn, function () { submit(); });    /* kit.onTap(元素, 函式)：幫元素綁定「點一下」的動作（手機觸控與電腦滑鼠通用，反應比一般 click 快） */

        function submit() {
            if (locked) return;
            locked = true; hideHint();
            okBtn.style.display = 'none';
            Sfx.play('click');                          /* Sfx.play(名稱)：播放音效（ok 答對、bad 答錯、click 點擊…；音效是程式即時合成的） */
            var real = errPct(cfg.cum, L), sgn = signedPct(cfg.cum, L) >= 0 ? 1 : -1;
            var below = volumeAt(cfg.cum, L) / cfg.total * 100;
            /* 揭曉：藍線不動，水從瓶底慢慢往上累積到藍線；水面下方顯示「目前水量與 50% 的差異」（−50.0000% 一路往上，過 0 變＋）；
               水面停住之後才出現綠線（真正的一半容量），再停 REVEAL_PAUSE_MS 才結算 */
            var target = L; Wl = 0; paint();
            diffTxt.setAttribute('opacity', 1);
            function showDiff() {
                var p = signedPct(cfg.cum, Wl);
                diffTxt.textContent = fmtSigned(p) + '（與 50% 的差）';  /* textContent：設定元素裡的文字（安全，不會被當成 HTML 解析） */
                diffTxt.setAttribute('y', Math.min(yOf(Wl) + 44, base - 10));
                diffTxt.setAttribute('class', 'halfvol-diff' + (p >= 0 ? ' halfvol-diff--over' : ''));
            }
            showDiff();
            my.tween(RISE_MS, function (e) { Wl = target * e; paint(); showDiff(); }, kit.easeInOutCubic).then(function () {  /* my.tween(毫秒, 函式)：動畫補間：在這段時間內，函式每一幀會收到 0→1 的進度 */
                Wl = target; paint(); showDiff();
                refHalfV.setAttribute('opacity', 1);
                msg.innerHTML = '';                     /* innerHTML = ''：把元素裡面的東西全部清掉 */
                msg.appendChild(h('div', { text: '線以下 ' + below.toFixed(4) + '%　線以上 ' + (100 - below).toFixed(4) + '%' }));
                msg.appendChild(h('div', { 'class': 'halfvol-msg__sub', text: '綠線＝真正的一半面積' }));
                msg.classList.add('halfvol-msg--on');   /* classList.add／remove／toggle：加上／拿掉 CSS class，元素的外觀就跟著變（class 的樣式寫在 css 檔裡） */
                my.after(REVEAL_PAUSE_MS, function () {
                    api.finish(real, { sign: sgn, lines: [
                        '線以下的面積是 ' + below.toFixed(4) + '%（目標 50.0000%）',
                        '真正的一半面積在 ' + (cfg.hs / VASE_H * 100).toFixed(4) + '% 高度，一半高度是 50.0000%',
                        '只有一次機會，想拚更準就再挑戰一次'
                    ] });
                });
            });
        }

        G.debug = {
            state: function () { return { L: L, cfg: cfg, locked: locked }; },
            setLevel: function (v) { L = kit.clamp(v, 0, VASE_H); Wl = L; paint(); },
            solve: function () { L = cfg.hs; Wl = L; paint(); submit(); },
            wrong: function () { L = VASE_H / 2; Wl = L; paint(); submit(); },
            submit: submit
        };
    }

    /* 遊戲登記資料：id 代號、name 選單上的名稱、rule 玩法說明（**包起來的是粗體重點）、mount 進場函式、score 成績規格、test 給單元測試用的內部函式。 */
    var G = {
        id: ID,
        name: '容量一半',
        rule: '畫面上是一個花瓶。上下拖曳水位線，**讓線以下的花瓶面積剛好是一半**。注意：**一半的高度不等於一半的面積**！每次花瓶都不一樣，只有一次機會，按「確定」後水會升上來告訴你差了幾 %。',
        mount: mount,
        score: SCORE,
        test: { signedPct: signedPct, fmtSigned: fmtSigned, RISE_MS: RISE_MS, REVEAL_PAUSE_MS: REVEAL_PAUSE_MS, radiusAt: radiusAt, cumulative: cumulative, volumeAt: volumeAt, halfHeight: halfHeight, errPct: errPct, makeRound: makeRound, rating: rating, VASE_H: VASE_H, NODES: NODES, R_FLOOR: R_FLOOR, MIN_GAP: MIN_GAP, START_GAP: START_GAP }
    };
    /* 把這款遊戲登記給選單（沒有這行，選單就看不到它） */
    Reaction.register(G);
})();

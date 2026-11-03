/* ═══════════════════════════════════════════════════════════════════
   reaction_stackup.js — 秒反應・重心疊疊樂（原企劃「002 重心落點」的復活版）
   樣式：css/games/reaction_stackup.css（這款專屬的 class 一律以「stackup-」開頭；共用元件在 css/reaction_common.css）
   上方出現一個方塊（長方形、梯形或三角形），下方的橫桿可以左右拖曳決定它落下的位置，
   按「放下」就會筆直掉下去；方塊必須「平穩」地擺在地板或其他方塊上面。
   傾斜（重心超出支撐）、滑掉（落在斜面或尖端）、頂到天花板，都算失敗。
   關卡制：一關放一個方塊，成績＝成功疊了幾塊（越多越好）。
   ───────────────────────────────────────────────────────────────────
   【物理規則（不是真的物理引擎，是一套簡單、固定、看得懂的判定）】
   座標：x 由左到右（px），y 由地板往上算（地板＝0）。每個方塊是一個「底邊水平」的形狀，
   用 {kind, x0, w, y0, h} 表示：左下角 x0、底寬 w、底部高度 y0、高度 h。
     · rect 長方形：頂面水平，寬 w。
     · trap 梯形：底寬 w、頂寬 w×TRAP_TOP（預設一半），頂面水平。
     · tri 三角形：底寬 w，頂端是一個尖點。
   1. 落地高度：方塊的底邊會停在「它底下所有東西頂面的最高點」。
   2. 接觸範圍：底邊上、高度跟落地高度差不到 EPS 的那些位置（可能一段，也可能只有一個點）；
      接觸範圍的「最左～最右」叫支撐範圍。
   3. 站得住：支撐範圍寬度至少 MIN_CONTACT（落在斜面或尖點上＝滑掉），而且
      「它自己加上壓在它上面的所有方塊」的重心（x）要落在支撐範圍裡，否則傾倒。
      重量＝面積；上面的重量依接觸寬度分給它底下的各個方塊，作用點取「重心夾到那一段接觸範圍裡」的位置。
   4. 疊上去之後，整座塔從上往下逐塊檢查（因為新方塊可能把下面某一塊壓倒）。
   5. 頂到畫面最上緣（超過 ZONE_H）也算失敗。
   6. 失敗動畫（V1.28 玩家意見）：失敗的那一塊（連同壓在它上面的）以「下方方塊互相碰撞的角落頂點」（checkTower 的 pivot）當旋轉中心，
      先慢慢轉開（越轉越快）、轉過 TIP_ANGLE 度之後失去支撐、一邊繼續轉一邊往下掉（tipPose）。
   【難度（隨關卡線性）】前 2 關只有長方形；第 3 關起出現梯形（機率 0 → 30%）；
   第 6 關起出現三角形（5% → 25%）。方塊寬度＝畫面寬的 1/6～1/2，高度固定 BLOCK_H。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    /* 新手導讀：整個檔案包在 (function () { ... })(); 裡（叫「立即執行函式」），裡面的變數都是這個檔案私有的，不會跟別的遊戲檔案的同名變數打架。
       檔案由上往下大致分成：① 參數區（標題寫著可以自己調整的參數：難度、秒數、文字大多在這）；② 純函式（只做計算、不碰畫面：出題、判斷對錯，單元測試直接測它們）；③ 畫面（mount 是進場、setup 是每一關開始時呼叫，負責把畫面建出來並處理點擊）。
       最後的 Reaction.register(G) 把這款遊戲「登記」給選單（沒有這行，選單就看不到它）。'use strict' 是嚴格模式：打錯變數名稱會直接報錯，而不是默默建立新變數。
       這款遊戲的代號是 'stackup'：選單、成績、存檔都靠它；樣式在 css/games/reaction_stackup.css，裡面的 class 名稱一律以 stackup- 開頭。 */
    'use strict';

    var ID = 'stackup';                                 /* 這款遊戲的代號：選單、成績、存檔、CSS class 前綴都用它 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 塊', label: '疊了幾塊', min: 1, max: 90 };  /* 成績規格：better（max＝越大越好、min＝越小越好）、decimals 小數位數、format 顯示格式、label 名稱、min／max 合理範圍（超出範圍的成績不會送排行榜） */
    var h = UI.h, kit = Reaction.kit;                   /* h：建立網頁元素的小工具；kit：闖關遊戲共用的工具箱 */

    /* ═══ 可以自己調的參數 ═══ */
    var MAX_LEVEL = 180;                 /* 疊滿幾塊算全破 */
    var BLOCK_H = 48;                   /* 方塊高度（固定，px） */
    var W_MIN_RATIO = 1 / 16, W_MAX_RATIO = 1 / 3;      /* 方塊寬度佔畫面寬的比例範圍 */
    var TRAP_TOP = 0.5;                 /* 梯形的頂寬是底寬的幾倍 */
    var EPS = 2;                        /* 兩個高度差在這個值以內算「一樣高」（接觸）（px） */
    var MIN_CONTACT = 8;                /* 支撐範圍至少要多寬，不然算落在尖點或斜面上、會滑掉（px） */
    var TOL = 0.5;                      /* 重心超出支撐範圍多少以內還算站得住（px） */
    var TRAP_FROM = 3, TRAP_P = [0, 0.3], TRAP_RAMP = 12;   /* 梯形：第幾關起、機率範圍、幾關升到頂 */
    var TRI_FROM = 6, TRI_P = [0.05, 0.25], TRI_RAMP = 20;  /* 三角形 */
    var PREVIEW_H = 84;                 /* 上方預覽區的高度（px） */
    var BAR_H = 56;                     /* 橫桿區高度（px） */
    var FALL_MS = 380;                  /* 方塊落下的時間 */
    var TIP_MS = 1500;                  /* 失敗動畫（傾倒）的總時間 */
    var TIP_SPLIT = 0.62;               /* 傾倒動畫前面多少比例是「繞著支點慢慢轉開」，後面是「失去支撐掉下去」 */
    var TIP_ANGLE = 62;                 /* 繞著支點轉開的角度（度） */
    var TIP_DROP = 240;                 /* 最後掉下去的距離（px） */
    /* 干擾用的動態條紋背景（共用元件 js/reaction_bgstripe.js，各欄位的意思見該檔開頭）：from 是從第幾關開始出現（想關掉改成 0，想晚一點出現就調大）；數字寫成 [起, 終] 會從第 from 關起漸漸變強 */
    var BG = { from: 0, type: 'dots', diff: [3, 6], width: 40, move: 'all', speed: 16 };  /* 第 12 關起出現：圓點、亮度差 3% → 6%（20 關內漸強）、點徑 26px、全方向捲動 14px／秒 */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    /* 方塊面積（＝重量）：長方形 w×h、梯形 (底＋頂)／2×h、三角形 w×h／2 */
    function areaOf(b) {
        if (b.kind === 'tri') return b.w * b.h / 2;
        if (b.kind === 'trap') return (b.w + b.w * TRAP_TOP) / 2 * b.h;
        return b.w * b.h;
    }
    /* 方塊在水平位置 x 的頂面高度（絕對高度）；x 在方塊範圍外回傳 null */
    function topAt(b, x) {
        if (x < b.x0 || x > b.x0 + b.w) return null;
        if (b.kind === 'rect') return b.y0 + b.h;
        if (b.kind === 'tri') return b.y0 + b.h * (1 - Math.abs(x - (b.x0 + b.w / 2)) / (b.w / 2));  /* Math.abs：取絕對值（去掉負號） */
        var e = b.w * (1 - TRAP_TOP) / 2, u = x - b.x0, d = Math.min(u, b.w - u);
        return b.y0 + b.h * Math.min(1, d / e);
    }
    /* 方塊「頂面高度 ≥ level」的水平範圍 [p, q]；沒有就回傳 null（頂面是凹的折線，所以一定是一段） */
    function levelSet(b, level) {
        var frac = (level - b.y0) / b.h;
        if (frac > 1 + 1e-9) return null;
        if (frac <= 0) return [b.x0, b.x0 + b.w];
        if (b.kind === 'rect') return [b.x0, b.x0 + b.w];
        if (b.kind === 'tri') { var c = b.x0 + b.w / 2, r = (1 - frac) * b.w / 2; return [c - r, c + r]; }
        var e = b.w * (1 - TRAP_TOP) / 2;
        return [b.x0 + frac * e, b.x0 + b.w - frac * e];
    }
    /* 底寬 w 的方塊放在左邊界 x0：它底下所有方塊頂面的最高點（沒有就是地板 0） */
    function restLevel(tower, x0, w) {
        var R = 0, x1 = x0 + w;
        tower.forEach(function (b) {                    /* forEach：對陣列的每個元素各做一次 */
            var a = Math.max(x0, b.x0), z = Math.min(x1, b.x0 + b.w);
            if (a > z) return;
            var cand = [a, z];
            if (b.kind === 'tri') cand.push(b.x0 + b.w / 2);
            if (b.kind === 'trap') { var e = b.w * (1 - TRAP_TOP) / 2; cand.push(b.x0 + e, b.x0 + b.w - e); }
            cand.forEach(function (x) { if (x >= a && x <= z) { var t = topAt(b, x); if (t != null && t > R) R = t; } });
        });
        return R;
    }
    /* 落在高度 R 時的接觸清單：[{i: 方塊編號（-1＝地板）, a, b: 接觸範圍的左右端}] */
    function contactsAt(tower, x0, w, R, W) {
        var out = [], x1 = x0 + w;
        if (R <= EPS) out.push({ i: -1, a: Math.max(0, x0), b: Math.min(W, x1) });
        tower.forEach(function (b, i) {
            var s = levelSet(b, R - EPS);
            if (!s) return;
            var a = Math.max(x0, s[0]), z = Math.min(x1, s[1]);
            if (a <= z) out.push({ i: i, a: a, b: z });
        });
        return out;
    }
    function hullOf(cs) {
        var a = Infinity, z = -Infinity;
        cs.forEach(function (c) { if (c.a < a) a = c.a; if (c.b > z) z = c.b; });
        return { a: a, b: z, w: z - a };
    }
    /* 整座塔從上往下逐塊檢查（新方塊已經在 tower 最後面）。回傳 { ok:true } 或 { ok:false, idx, reason:'tip'|'slide', pivot:{x,y} } */
    function checkTower(tower) {
        var n = tower.length, recM = [], recMx = [], i;
        for (i = 0; i < n; i++) { recM.push(0); recMx.push(0); }
        for (i = n - 1; i >= 0; i--) {
            var b = tower[i], cx = b.x0 + b.w / 2, ar = areaOf(b);
            var M = ar + recM[i], com = (ar * cx + recMx[i]) / M;
            var hull = hullOf(b.sup);
            /* dir：往哪邊倒（-1 往左、1 往右），動畫用 */
            if (hull.w < MIN_CONTACT) return { ok: false, idx: i, reason: 'slide', dir: com < (hull.a + hull.b) / 2 ? -1 : 1, pivot: { x: com < (hull.a + hull.b) / 2 ? hull.a : hull.b, y: b.y0 } };
            if (com < hull.a - TOL || com > hull.b + TOL) return { ok: false, idx: i, reason: 'tip', dir: com < hull.a ? -1 : 1, pivot: { x: com < hull.a ? hull.a : hull.b, y: b.y0 } };
            /* 把這一塊（加上它承受的重量）依接觸寬度分給底下的方塊；作用點＝重心夾到各自接觸範圍裡 */
            var tot = 0;
            b.sup.forEach(function (c) { tot += Math.max(c.b - c.a, 0.001); });
            b.sup.forEach(function (c) {
                if (c.i < 0) return;
                var part = M * Math.max(c.b - c.a, 0.001) / tot;
                recM[c.i] += part;
                recMx[c.i] += part * Math.min(c.b, Math.max(c.a, com));
            });
        }
        return { ok: true };
    }
    /* 模擬一次放下：block＝{kind, w, h}，x0＝左邊界。回傳
       { ok, reason:'ok'|'tip'|'slide'|'ceiling', rest（落地高度）, placed（疊上去之後的那一塊）, tower（含新方塊的新塔）, fail:{idx,pivot}（失敗時） } */
    function evaluateDrop(tower, block, x0, W, ZH) {
        var R = restLevel(tower, x0, block.w);
        var placed = { kind: block.kind, x0: x0, w: block.w, y0: R, h: block.h, hue: block.hue, sup: contactsAt(tower, x0, block.w, R, W) };
        var nt = tower.concat([placed]);
        if (R + block.h > ZH) return { ok: false, reason: 'ceiling', rest: R, placed: placed, tower: nt };
        var r = checkTower(nt);
        if (!r.ok) return { ok: false, reason: r.reason, rest: R, placed: placed, tower: nt, fail: { idx: r.idx, pivot: r.pivot, dir: r.dir } };
        return { ok: true, reason: 'ok', rest: R, placed: placed, tower: nt };
    }
    /* 出一塊：形狀（依關卡機率）、寬度（畫面寬的 1/6～1/2）、顏色 */
    function makeBlock(level, W, rand) {
        rand = rand || Math.random;                     /* 沒有傳亂數函式就用 Math.random（測試時可以傳固定的亂數，結果才能重現） */
        var pT = level >= TRAP_FROM ? kit.ramp(level - TRAP_FROM + 1, TRAP_P[0], TRAP_P[1], TRAP_RAMP) : 0;  /* kit.ramp(關卡, 起始值, 到頂值, 到頂關卡)：讓數值隨關卡「線性」從起始值變到到頂值（難度曲線的基本工具） */
        var pR = level >= TRI_FROM ? kit.ramp(level - TRI_FROM + 1, TRI_P[0], TRI_P[1], TRI_RAMP) : 0;
        var r = rand(), kind = r < pR ? 'tri' : (r < pR + pT ? 'trap' : 'rect');
        return { kind: kind, w: kit.randInt(Math.round(W * W_MIN_RATIO), Math.round(W * W_MAX_RATIO), rand), h: BLOCK_H, hue: Math.round(rand() * 360) };  /* kit.randInt(最小, 最大, rand)：隨機整數（含最小與最大） */
    }
    /* 找「站得住」的左邊界清單（每隔 step px 試一次）；除錯／測試用 */
    function stableSpots(tower, block, W, ZH, step) {
        var out = [], x;
        for (x = 0; x <= W - block.w; x += step || 2) if (evaluateDrop(tower, block, x, W, ZH).ok) out.push(x);
        return out;
    }
    /* 失敗動畫在進度 t（0～1）時的姿勢：先繞著「下方方塊的角落頂點」慢慢轉開（越轉越快，像重心不穩被壓著翻倒），
       轉過一定角度之後才失去支撐、一邊繼續轉一邊往下掉。回傳 { angle（度，未乘方向）, dy（往下掉多少 px） } */
    function tipPose(t) {
        t = Math.max(0, Math.min(1, t));
        if (t <= TIP_SPLIT) { var u = t / TIP_SPLIT; return { angle: TIP_ANGLE * u * u, dy: 0 }; }
        var v = (t - TIP_SPLIT) / (1 - TIP_SPLIT);
        return { angle: TIP_ANGLE + 38 * v * v, dy: TIP_DROP * v * v };
    }
    /* 結算畫面的評語：依成績回傳一句話 */
    function rating(n) {
        if (n >= 30) return '重心大師！';
        if (n >= 18) return '疊得真穩！';
        if (n >= 10) return '不錯喔！';
        if (n >= 5) return '再接再厲！';
        return '重心要落在底下的支撐範圍裡，再試一次！';
    }
    var FAIL_TEXT = {
        tip: '重心超出支撐，傾倒了！',
        slide: '落在斜面或尖端上，滑掉了！',
        ceiling: '塔頂碰到天花板了！'
    };

    /* mount：選單按下這款遊戲時會呼叫它。把「闖關」的流程（第幾關、過關、失敗、結算、最佳紀錄）交給共用骨架 kit.run，我們只提供 setup（每一關怎麼畫）、rating（評語）等小零件。 */
    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 8, resume: false,
            numText: function (v) { return v + ' 塊'; },
            rating: rating,
            head: function (level) { return '第 ' + level + ' 塊'; },
            lines: function (S) { return ['成功疊了 ' + S.cleared + ' 塊']; },
            stageClass: 'stackup-stage',
            setup: setup
        });
    }

    /* 目前疊好的塔（跨關保留；第 1 關開始時清空） */
    var tower = [];

    /* setup(api)：每一關開始時呼叫一次，負責出題並把這一關的畫面建出來。api 是共用骨架給的工具：api.stage（這一關的畫面容器）、api.level（第幾關）、
       api.after（延遲執行，換關後自動作廢）、api.timer（倒數計時）、api.pass／api.fail（過關／失敗）。 */
    function setup(api) {
        var stage = api.stage, level = api.level;       /* stage：這一關的畫面容器（要畫的東西都放進去）；level：現在是第幾關 */
        kit.bgStripe(stage, api.my, level, BG);        /* 在舞台最底下墊一層淡淡的動態圓點（BG.from 關之後才出現），干擾對重心位置的判斷 */
        if (level === 1) tower = [];
        var W = stage.clientWidth || 472, H = stage.clientHeight || 640;
        var ZH = Math.max(200, H - PREVIEW_H - BAR_H - 84 - 36);        /* 疊塔區高度：扣掉預覽、橫桿、按鈕與間距 */
        var block = makeBlock(level, W, api.rand);
        api.info = { block: block, towerSize: tower.length, W: W, ZH: ZH };
        var x0 = Math.round((W - block.w) / 2);         /* Math.round：四捨五入成整數 */
        console.log('[重心疊疊樂] 第 ' + level + ' 塊：' + ({ rect: '長方形', trap: '梯形', tri: '三角形' })[block.kind] + '，寬 ' + block.w + 'px；塔上已有 ' + tower.length + ' 塊');  /* 在瀏覽器主控台（按 F12）印出這一關的出題內容，方便除錯與驗證 */

        /* 世界座標（地板往上）→ SVG 座標（上方往下） */
        var SVG_H = PREVIEW_H + ZH;
        function sy(y) { return PREVIEW_H + ZH - y; }
        var svg = kit.svg('svg', { 'class': 'stackup-svg', viewBox: '0 0 ' + W + ' ' + SVG_H, width: W, height: SVG_H }, stage);  /* kit.svg(標籤, 屬性, 父元素)：建立 SVG 向量圖形元素（形狀、線條…），畫圖用，放大縮小不會糊 */
        kit.svg('line', { x1: 0, x2: W, y1: sy(ZH), y2: sy(ZH), 'class': 'stackup-ceil' }, svg);
        kit.svg('rect', { x: 0, y: sy(0), width: W, height: 400, 'class': 'stackup-floor' }, svg);

        function pts(b, dx) {
            var x = b.x0 + (dx || 0), y0 = b.y0;
            if (b.kind === 'tri') return [[x, y0], [x + b.w, y0], [x + b.w / 2, y0 + b.h]];
            if (b.kind === 'trap') { var e = b.w * (1 - TRAP_TOP) / 2; return [[x, y0], [x + b.w, y0], [x + b.w - e, y0 + b.h], [x + e, y0 + b.h]]; }
            return [[x, y0], [x + b.w, y0], [x + b.w, y0 + b.h], [x, y0 + b.h]];
        }
        function pointsStr(b, dx, dy) { return pts(b, dx).map(function (p) { return p[0].toFixed(1) + ',' + (sy(p[1]) + (dy || 0)).toFixed(1); }).join(' '); }  /* map：把陣列的每個元素轉換成別的東西，回傳新陣列 */
        function drawBlock(b, parent) {
            return kit.svg('polygon', { points: pointsStr(b), 'class': 'stackup-block', style: 'fill:hsl(' + b.hue + ',62%,70%)' }, parent);
        }
        /* 已經疊好的塔：每塊一個 <g>（失敗時整組一起轉） */
        var gTower = kit.svg('g', {}, svg), gEls = [];
        tower.forEach(function (b) { var g = kit.svg('g', {}, gTower); drawBlock(b, g); gEls.push(g); });

        /* 上方預覽：要放的那一塊（底邊在預覽區底部上方一點），用同一個形狀函式畫 */
        var prev = { kind: block.kind, x0: x0, w: block.w, y0: ZH + 14, h: block.h, hue: block.hue };
        var gPrev = kit.svg('g', {}, svg);
        var polyPrev = kit.svg('polygon', { points: pointsStr(prev), 'class': 'stackup-block stackup-block--prev', style: 'fill:hsl(' + block.hue + ',62%,70%)' }, gPrev);
        var guide = kit.svg('line', { x1: 0, x2: 0, y1: sy(ZH), y2: sy(0), 'class': 'stackup-guide' }, svg);
        function paintPrev() {
            prev.x0 = x0;
            polyPrev.setAttribute('points', pointsStr(prev));  /* setAttribute：設定元素的 HTML 屬性（例如 aria-label、data-xxx） */
            guide.setAttribute('x1', x0 + block.w / 2); guide.setAttribute('x2', x0 + block.w / 2);
        }
        paintPrev();

        /* 橫桿：拖曳旋鈕決定方塊的左右位置 */
        var bar = h('div', { 'class': 'stackup-bar' }), track = h('div', { 'class': 'stackup-track' }), knob = h('div', { 'class': 'stackup-knob' });
        bar.appendChild(track); bar.appendChild(knob);  /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
        var okBtn = h('button', { 'class': 'btn btn--go stackup-ok', text: '放下' });
        stage.appendChild(bar); stage.appendChild(okBtn);
        var KR = 24;                                   /* 旋鈕半徑 */
        function knobX() { return KR + (W - 2 * KR) * (W - block.w > 0 ? x0 / (W - block.w) : 0.5); }
        function paintKnob() { knob.style.left = (knobX() - KR) + 'px'; }
        paintKnob();
        var locked = false, hint = null;
        function setFromPointer(e) {
            var p = kit.localPt(e, bar), f = kit.clamp((p.x - KR) / (W - 2 * KR), 0, 1);  /* kit.clamp(值, 最小, 最大)：把數值限制在範圍內（太小就取最小、太大就取最大） */
            x0 = Math.round(f * (W - block.w));
            paintPrev(); paintKnob();
        }
        var dragging = null;
        bar.addEventListener('pointerdown', function (e) {  /* 指標事件（pointer）：手指與滑鼠通用，分成按下、移動、放開三種 */
            if (locked || dragging != null) return;
            e.preventDefault();                         /* preventDefault：取消瀏覽器的預設動作（例如拖曳時的捲動、文字選取） */
            try { bar.setPointerCapture(e.pointerId); } catch (err) { }  /* setPointerCapture：手指移出元素範圍後，仍然持續收到這個元素的移動事件（拖曳才不會中斷） */
            dragging = e.pointerId;
            if (hint) { hint.remove(); hint = null; }
            setFromPointer(e);
        });
        bar.addEventListener('pointermove', function (e) { if (dragging === e.pointerId && !locked) setFromPointer(e); });
        function endDrag(e) { if (dragging === e.pointerId) dragging = null; }
        bar.addEventListener('pointerup', endDrag);
        bar.addEventListener('pointercancel', endDrag);
        /* 操作提示（只在第一次進遊戲時）：手指＋箭頭，沿著橫桿左右移動 */
        if (level === 1 && kit.once('stackup.hint')) hint = kit.fingerHint(stage, { mode: 'drag', x: knobX(), y: SVG_H + 8 + BAR_H / 2, dx: 120, dy: 0, delay: 400, text: '請往左右拖曳' });  /* kit.once(key)：同一個頁面只有第一次回傳 true（用來讓提示只出現一次） */
        var msg = h('div', { 'class': 'stackup-msg' });
        stage.appendChild(msg);

        /* 放下：先算結果，再播落下動畫 */
        function drop() {
            if (locked || api.over) return;
            locked = true;
            if (hint) { hint.remove(); hint = null; }
            Sfx.play('click');                          /* Sfx.play(名稱)：播放音效（ok 答對、bad 答錯、click 點擊…；音效是程式即時合成的） */
            var res = evaluateDrop(tower, block, x0, W, ZH);
            gPrev.style.display = 'none'; guide.setAttribute('opacity', 0);
            var fallG = kit.svg('g', {}, svg);
            var fb = { kind: block.kind, x0: x0, w: block.w, y0: res.rest, h: block.h, hue: block.hue };
            var poly = drawBlock(fb, fallG);
            var dyStart = (ZH + 14 - res.rest);                     /* 從預覽位置到落地位置要掉多少 px */
            my_tween(FALL_MS, function (e) { fallG.setAttribute('transform', 'translate(0 ' + (-(1 - e) * dyStart).toFixed(2) + ')'); }, kit.easeInQuad).then(function () {
                fallG.setAttribute('transform', '');
                if (res.ok) {
                    tower = res.tower;
                    Sfx.play('ok');
                    msg.textContent = '站穩了！'; msg.classList.add('stackup-msg--ok');  /* classList.add／remove／toggle：加上／拿掉 CSS class，元素的外觀就跟著變（class 的樣式寫在 css 檔裡） */
                    api.pass({ gain: 1, delay: 600 });  /* api.pass({ delay })：宣告「過關」，delay 毫秒後進下一關（最後一關則進結算） */
                } else {
                    failAnim(res, fallG);
                }
            });
        }
        function my_tween(ms, fn, ease) { return api.my.tween(ms, fn, ease); }  /* my.tween(毫秒, 函式)：動畫補間：在這段時間內，函式每一幀會收到 0→1 的進度 */
        /* 失敗動畫：失敗的那一塊（連同壓在它上面的）繞著支撐邊緣轉開，再掉下去 */
        function failAnim(res, fallG) {
            Sfx.play('bad');
            msg.textContent = FAIL_TEXT[res.reason] || '失敗了'; msg.classList.add('stackup-msg--bad');  /* textContent：設定元素裡的文字（安全，不會被當成 HTML 解析） */
            var idx = res.fail ? res.fail.idx : res.tower.length - 1;
            var groups = [];
            var set = {}; set[idx] = true;
            res.tower.forEach(function (b, i) { if (i > idx && b.sup.some(function (c) { return set[c.i]; })) set[i] = true; });  /* some：陣列裡「只要有一個」元素符合條件就回傳 true */
            res.tower.forEach(function (b, i) { if (set[i]) groups.push(i === res.tower.length - 1 ? fallG : gEls[i]); });
            var pv = res.fail ? res.fail.pivot : { x: x0 + block.w / 2, y: res.rest };
            var sign = res.fail ? res.fail.dir : (x0 + block.w / 2 < W / 2 ? -1 : 1);
            var px = pv.x, py = sy(pv.y);
            /* 繞著支點（下方方塊互相碰撞的那個角落頂點）旋轉；掉下去的距離（dy）是在旋轉之後才加（世界座標往下），所以支點不會跑掉 */
            my_tween(TIP_MS, function (e) {
                var ps = tipPose(e);
                groups.forEach(function (g) { g.setAttribute('transform', 'translate(0 ' + ps.dy.toFixed(1) + ') rotate(' + (sign * ps.angle).toFixed(2) + ' ' + px.toFixed(2) + ' ' + py.toFixed(2) + ')'); });
            }, kit.linear).then(function () {
                api.fail({ delay: 500, lines: [FAIL_TEXT[res.reason] || '失敗了', '塔上共 ' + tower.length + ' 塊'] });  /* api.fail({ delay, lines })：宣告「失敗」，delay 毫秒後進結算畫面，lines 是結算要多寫的說明行 */
            });
        }
        kit.onTap(okBtn, drop);                         /* kit.onTap(元素, 函式)：幫元素綁定「點一下」的動作（手機觸控與電腦滑鼠通用，反應比一般 click 快） */

        /* 驗證用：solve 放在一個站得住的位置；wrong 放在一個站不住的位置（找不到就直接判失敗） */
        api.solve = function () {
            var spots = stableSpots(tower, block, W, ZH, 2);
            if (!spots.length) { api.fail({ lines: ['沒有地方可以放了'] }); return; }
            x0 = spots[Math.floor(spots.length / 2)]; paintPrev(); paintKnob(); drop();  /* Math.floor：無條件捨去成整數 */
        };
        api.wrong = function () {
            var bad = null, x;
            for (x = 0; x <= W - block.w && bad == null; x += 2) if (!evaluateDrop(tower, block, x, W, ZH).ok) bad = x;
            if (bad == null) { api.fail({ lines: ['（驗證）這一塊放哪裡都站得住，直接判失敗'] }); return; }
            x0 = bad; paintPrev(); paintKnob(); drop();
        };
    }

    /* 遊戲登記資料：id 代號、name 選單上的名稱、rule 玩法說明（**包起來的是粗體重點）、mount 進場函式、score 成績規格、test 給單元測試用的內部函式。 */
    var G = {
        id: ID,
        name: '重心疊疊樂',
        rule: '上方有一個方塊，拖曳下方的橫桿決定它落下的左右位置，按「放下」就會掉下去。**方塊要平穩地擺在地板或別的方塊上**：**重心超出底下的支撐會傾倒**、落在斜面或尖端會滑掉、疊太高碰到天花板也不行。越後面越常出現梯形和三角形。看你能疊幾塊！',
        mount: mount,
        score: SCORE,
        /* test：把內部函式與參數交給單元測試（test/reaction/ 底下的 t_*.js）使用，遊戲本身不會用到。 */
        test: {
            areaOf: areaOf, topAt: topAt, levelSet: levelSet, restLevel: restLevel, contactsAt: contactsAt, checkTower: checkTower,
            tipPose: tipPose, TIP_MS: TIP_MS, TIP_SPLIT: TIP_SPLIT, TIP_ANGLE: TIP_ANGLE, evaluateDrop: evaluateDrop, makeBlock: makeBlock, stableSpots: stableSpots, BLOCK_H: BLOCK_H, EPS: EPS, MIN_CONTACT: MIN_CONTACT,
            TRAP_TOP: TRAP_TOP, W_MIN_RATIO: W_MIN_RATIO, W_MAX_RATIO: W_MAX_RATIO, TRAP_FROM: TRAP_FROM, TRI_FROM: TRI_FROM,
            getTower: function () { return tower; }, setTower: function (t) { tower = t; }
        }
    };
    /* 把這款遊戲登記給選單（沒有這行，選單就看不到它） */
    Reaction.register(G);
})();

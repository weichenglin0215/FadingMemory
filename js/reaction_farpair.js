/* ═══════════════════════════════════════════════════════════════════
   reaction_farpair.js — 秒反應・哪對離最遠（企劃 158「哪一對離得遠」）
   畫面上有好幾對圓點，每一對是同一個顏色（兩個紅點、兩個綠點、兩個黃點…），
   判斷「哪一對的兩個點相距最遠」，點該對的任何一個圓點。
   關卡制：點錯或來不及就結束，成績＝通過幾關。
   ───────────────────────────────────────────────────────────────────
   · 出題（規範 Q1、Q6：先決定結果、再把精確度調到位）：先決定「最遠那一對」的距離 D1、第二遠的距離 D2 ＝ D1 ÷ 倍率，
     其他對的距離隨機在 D2 的 35％～92％；再把每一對的兩個圓點放到畫面上（角度隨機，所有圓點圓心至少相距 MIN_GAP）。
     所以「最遠」永遠只有一對，而且它比第二遠的長了剛好「倍率」倍。
   · 難度線性（RAMP_LEVELS 關走到頂）：對數 2 → 6 對；最遠與第二遠的比例 1.60 → 1.04（差距從 60％縮到 4％）。
     每對的連線方向隨機（橫、直、斜都有），所以不能靠「橫向看起來比較短」之類的錯覺取巧。
   · 揭曉（動畫）：先從你點的那一對的某個圓點，畫出一條直線到另一個端點，並顯示距離；
     如果你猜錯，再用同樣的動畫畫出「真正最遠的那一對」。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'farpair';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 60 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 25;                       /* 幾關之後難度到頂（對數用 PAIR_LEVELS） */
    var PAIR_LEVELS = 15;                       /* 對數幾關之後到頂 */
    var PAIRS = [2, 6];                         /* 有幾對圓點：第 1 關 → 到頂 */
    var RATIO = [1.6, 1.04];                    /* 最遠 ÷ 第二遠：第 1 關 → 到頂 */
    var ANS_S = [10, 7];                        /* 作答限時（秒）：第 1 關 → 到頂 */
    var D1_MIN = 250, D1_MAX = 380;             /* 最遠那一對的距離範圍（像素） */
    var D_MIN = 90;                             /* 任何一對的最短距離 */
    var OTHER = [0.35, 0.92];                   /* 其他對的距離 ＝ 第二遠 × 這個範圍內的隨機數 */
    var MIN_GAP = 64;                           /* 任兩個圓點圓心至少相距多少 */
    var MARGIN = 34;                            /* 圓點離遊戲區邊緣至少多遠 */
    var DOT_R = 20;                             /* 圓點畫出來的半徑 */
    var HIT_R = 40;                             /* 命中半徑 */
    var MAX_LEVEL = 60;
    /* 六種顏色（色相，飽和度與亮度固定）：紅、橘、黃、綠、藍、紫；彼此夠不一樣 */
    var HUES = [{ n: '紅', h: 4 }, { n: '橘', h: 28 }, { n: '黃', h: 50 }, { n: '綠', h: 135 }, { n: '藍', h: 212 }, { n: '紫', h: 282 }];

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function pairsFor(level) { return kit.clamp(Math.round(kit.ramp(level, PAIRS[0], PAIRS[1], PAIR_LEVELS)), PAIRS[0], PAIRS[1]); }
    function ratioFor(level) { return kit.ramp(level, RATIO[0], RATIO[1], RAMP_LEVELS); }
    function ansMs(level) { return Math.round(kit.ramp(level, ANS_S[0], ANS_S[1], RAMP_LEVELS) * 1000); }
    /* 把一對圓點（距離 d）放進 W×H 的區域：角度隨機、位置隨機，兩個點都要在邊界內、離已放的點 ≥ MIN_GAP；放不進去回傳 null */
    function placePair(d, W, H, placed, rand) {
        for (var tr = 0; tr < 300; tr++) {
            var ang = rand() * Math.PI * 2, vx = Math.cos(ang) * d, vy = Math.sin(ang) * d;
            var loX = MARGIN + Math.max(0, -vx), hiX = W - MARGIN - Math.max(0, vx), loY = MARGIN + Math.max(0, -vy), hiY = H - MARGIN - Math.max(0, vy);
            if (hiX < loX || hiY < loY) continue;
            var ax = kit.randFloat(loX, hiX, rand), ay = kit.randFloat(loY, hiY, rand), bx = ax + vx, by = ay + vy;
            var far = placed.every(function (p) { return kit.dist(ax, ay, p.x, p.y) >= MIN_GAP && kit.dist(bx, by, p.x, p.y) >= MIN_GAP; });
            if (far) return { a: { x: ax, y: ay }, b: { x: bx, y: by } };
        }
        return null;
    }
    /* 出一關：{ W, H, pairs:[{ color, hue, a:{x,y}, b:{x,y}, d }], best（最遠那一對是 pairs 的第幾個）, ratio } */
    function makeLevel(level, W, H, rand) {
        rand = rand || Math.random;
        var n = pairsFor(level), ratio = ratioFor(level);
        for (var tr = 0; tr < 300; tr++) {
            var d1 = kit.randFloat(D1_MIN, Math.min(D1_MAX, Math.sqrt(W * W + H * H) - 2 * MARGIN - 10), rand), d2 = d1 / ratio;
            if (d2 < D_MIN * 1.3) continue;
            var ds = [d1, d2];
            for (var i = 2; i < n; i++) ds.push(Math.max(D_MIN, d2 * kit.randFloat(OTHER[0], OTHER[1], rand)));
            /* 先放最遠的，再依距離從長到短放（長的最難放，先放） */
            var order = ds.map(function (d, k) { return k; });
            var placed = [], res = [], good = true;
            for (var k = 0; k < order.length; k++) {
                var pr = placePair(ds[order[k]], W, H, placed, rand);
                if (!pr) { good = false; break; }
                placed.push(pr.a, pr.b);
                res.push({ a: pr.a, b: pr.b, d: ds[order[k]] });
            }
            if (!good) continue;
            var cols = kit.shuffle(HUES, rand).slice(0, n);
            /* 洗牌：最遠那一對不一定是第一個 */
            var idx = kit.shuffle(res.map(function (r, j) { return j; }), rand);
            var pairs = idx.map(function (j, pos) { return { color: cols[pos].n, hue: cols[pos].h, a: res[j].a, b: res[j].b, d: res[j].d }; });
            var best = idx.indexOf(0);
            return { W: W, H: H, pairs: pairs, best: best, ratio: ratio };
        }
        /* 保底：固定的 2 對 */
        var fb = [{ color: HUES[0].n, hue: HUES[0].h, a: { x: 60, y: 100 }, b: { x: 360, y: 100 }, d: 300 }, { color: HUES[4].n, hue: HUES[4].h, a: { x: 100, y: 300 }, b: { x: 100, y: 570 }, d: 270 }];
        return { W: W, H: H, pairs: fb, best: 0, ratio: 300 / 270 };
    }
    function rating(n) {
        if (n >= 25) return '目測大師！';
        if (n >= 15) return '眼睛像尺一樣準！';
        if (n >= 8) return '不錯喔！';
        if (n >= 3) return '再接再厲！';
        return '橫的直的都比一比，再來一次！';
    }

    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 6,
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['通過 ' + S.cleared + ' 關']; },
            setup: setup
        });
    }

    function setup(api) {
        var stage = api.stage, level = api.level;
        var W = stage.clientWidth || 472, H = (stage.clientHeight || 640) - 64;          /* 下面留 64 像素放說明文字 */
        var q = makeLevel(level, W, H, api.rand);
        api.info = q;
        console.log('[哪對離最遠] 第 ' + level + ' 關：' + q.pairs.length + ' 對；各對距離 ' + q.pairs.map(function (p) { return p.color + p.d.toFixed(4); }).join('、') + '；最遠是 ' + q.pairs[q.best].color + '（最遠÷第二遠＝' + q.ratio.toFixed(4) + '）');

        var svg = kit.svg('svg', { 'class': 'fpr-svg', viewBox: '0 0 ' + W + ' ' + H, width: W, height: H }, stage);
        var gLine = kit.svg('g', {}, svg), gDot = kit.svg('g', {}, svg), gText = kit.svg('g', {}, svg);
        var dots = [];
        q.pairs.forEach(function (p, i) {
            var fill = kit.hsl(p.hue, 78, 52), stroke = kit.hsl(p.hue, 70, 30);
            ['a', 'b'].forEach(function (k) {
                var c = kit.svg('circle', { cx: p[k].x, cy: p[k].y, r: DOT_R, fill: fill, stroke: stroke, 'stroke-width': 3, 'class': 'fpr-dot' }, gDot);
                dots.push({ el: c, pair: i, end: k });
            });
        });
        var tip = h('div', { 'class': 'qz-note fpr-tip', text: '哪一對（同顏色）的兩個點離得最遠？' });
        stage.appendChild(tip);
        api.timer(ansMs(level), function () { judge(-1, null); });
        if (level === 1 && kit.once('farpair.hint')) kit.hintOn(stage, null, { mode: 'tap', x: q.pairs[q.best].a.x, y: q.pairs[q.best].a.y, delay: 600, text: '請點擊距離最遠那一對的圓點' });
        kit.onTap(stage, function (e) {
            if (api.over) return;
            var pt = kit.localPt(e, stage), bi = -1, bd = 1e9;
            dots.forEach(function (d, i) { var pp = q.pairs[d.pair][d.end], dd = kit.dist(pt.x, pt.y, pp.x, pp.y); if (dd < bd) { bd = dd; bi = i; } });
            if (bd <= HIT_R) judge(dots[bi].pair, dots[bi].end);
        });

        /* 畫一條從 from 慢慢長到 to 的線，結束時在中間寫距離；回傳 Promise */
        function drawLine(pi, fromKey, cls) {
            var p = q.pairs[pi], from = p[fromKey], to = p[fromKey === 'a' ? 'b' : 'a'];
            var ln = kit.svg('line', { x1: from.x, y1: from.y, x2: from.x, y2: from.y, 'class': 'fpr-line ' + cls }, gLine);
            return api.my.tween(650, function (e) {
                ln.setAttribute('x2', from.x + (to.x - from.x) * e); ln.setAttribute('y2', from.y + (to.y - from.y) * e);
            }, kit.easeOutCubic).then(function () {
                var mx = (from.x + to.x) / 2, my = (from.y + to.y) / 2;
                var tx = kit.svg('text', { x: mx, y: my - 10, 'text-anchor': 'middle', 'class': 'fpr-dist ' + cls }, gText);
                tx.textContent = p.color + '：' + p.d.toFixed(4);
            });
        }
        function judge(pi, endKey) {
            if (api.over) return;
            api.stopTimer();
            var ok = pi === q.best;
            if (pi < 0) {                       /* 時間到：直接揭曉最遠的那一對 */
                tip.textContent = '時間到！最遠的是 ' + q.pairs[q.best].color + ' 那一對';
                drawLine(q.best, 'a', 'fpr-line--right');
                api.fail({ delay: 3400, lines: ['時間到！', '最遠的是 ' + q.pairs[q.best].color + ' 那一對，距離 ' + q.pairs[q.best].d.toFixed(4) + ' 像素'] });
                return;
            }
            tip.textContent = ok ? '答對了！' : '再看一次';
            drawLine(pi, endKey, ok ? 'fpr-line--right' : 'fpr-line--wrong').then(function () {
                if (ok) return;
                return api.my.wait(500).then(function () {
                    tip.textContent = '真正最遠的是 ' + q.pairs[q.best].color + ' 那一對';
                    return drawLine(q.best, 'a', 'fpr-line--right');
                });
            });
            if (ok) { kit.flash(stage, true, api.my); api.pass({ delay: 1900 }); return; }
            kit.flash(stage, false, api.my);
            api.fail({ delay: 3400, lines: [
                '你選了 ' + q.pairs[pi].color + '（' + q.pairs[pi].d.toFixed(4) + ' 像素）',
                '最遠的是 ' + q.pairs[q.best].color + '（' + q.pairs[q.best].d.toFixed(4) + ' 像素）'
            ] });
        }
        api.solve = function () { judge(q.best, 'a'); };
        api.wrong = function () { judge((q.best + 1) % q.pairs.length, 'a'); };
    }

    var G = {
        id: ID,
        name: '哪對離最遠',
        rule: '畫面上有好幾對圓點，每一對是同一個顏色。判斷**哪一對的兩個點相距最遠**，**點該對的任何一個圓點**。揭曉時會用直線量給你看。點錯或來不及就結束，看你能過幾關。越後面，對數越多、距離差越小！',
        mount: mount,
        score: SCORE,
        test: {
            pairsFor: pairsFor, ratioFor: ratioFor, ansMs: ansMs, placePair: placePair, makeLevel: makeLevel, rating: rating,
            RAMP_LEVELS: RAMP_LEVELS, PAIR_LEVELS: PAIR_LEVELS, PAIRS: PAIRS, RATIO: RATIO, ANS_S: ANS_S, MIN_GAP: MIN_GAP, MARGIN: MARGIN, D_MIN: D_MIN, MAX_LEVEL: MAX_LEVEL, HUES: HUES
        }
    };
    Reaction.register(G);
})();

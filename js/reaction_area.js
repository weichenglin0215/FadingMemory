/* ═══════════════════════════════════════════════════════════════════
   reaction_area.js — 秒反應・面積一樣大
   左邊是一個目標形狀（圓、三角形、五角星、十字、L 形隨機抽一種），右邊是一個方塊；
   拖曳方塊右下角的手柄放大縮小，讓方塊的面積跟左邊的形狀一樣大。只有一次機會，沒有任何數字。
   ───────────────────────────────────────────────────────────────────
   · 目標面積 A：等效邊長 EQ_MIN～EQ_MAX（A ＝ 等效邊長²）。
   · 方塊左上角固定在 ANCHOR，邊長 s ＝ 手柄位置決定；初始邊長離答案很遠（×0.45～0.7 或 ×1.4～1.8）。
   · 拖曳是「慢速微調」：手指越慢，變化量越小（kit.dragDamp）。
   · 成績 ＝ |s² − A| ÷ A × 100（%，越小越好）；第 3、4 位為 0 時偽造成非 0（結算時只產生一次）。
   · 揭曉：方塊移到形狀上疊合，只在形狀內的部分是橘色、只在方塊內的部分是藍色。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'area';
    /* 世界排行榜成績規格（欄位說明見 js/leaderboard.js 開頭） */
    var SCORE = { better: 'min', decimals: 4, format: '{v}%', label: '面積差', min: 0, max: 400 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var EQ_MIN = 80, EQ_MAX = 115;                  /* 目標形狀的等效邊長（面積 ＝ 邊長²） */
    var SQ_MIN = 30, SQ_MAX = 170;                  /* 方塊邊長可拖動的範圍（px） */
    var ANCHOR = { x: 268, y: 175 };                /* 方塊左上角（固定不動） */
    var SHAPE_C = { x: 122, y: 300 };               /* 目標形狀的中心 */
    var HANDLE_R = 22, TOUCH_R = 60;                /* 手柄的畫面半徑、可以抓住的半徑 */
    var FAR = [[0.45, 0.7], [1.4, 1.8]];            /* 初始邊長相對答案的倍率範圍（兩段擇一） */
    var KINDS = ['circle', 'triangle', 'star', 'cross', 'ell'];
    var STAR_K = 0.4;                               /* 五角星內外半徑比 */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    /* 簡單多邊形面積（鞋帶公式） */
    function polyArea(pts) {
        var a = 0;
        for (var i = 0; i < pts.length; i++) { var p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; }
        return Math.abs(a) / 2;
    }
    /* 依形狀種類與目標面積 A，算出形狀（圓：半徑；多邊形：以形狀中心為原點的頂點） */
    function shapeOf(kind, A) {
        if (kind === 'circle') return { kind: kind, r: Math.sqrt(A / Math.PI) };
        var pts, i;
        if (kind === 'triangle') {
            var a = Math.sqrt(4 * A / Math.sqrt(3)), t = a * Math.sqrt(3) / 2;
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
        rand = rand || Math.random;
        var kind = kit.pick(KINDS, rand);
        var eq = kit.randFloat(EQ_MIN, EQ_MAX, rand), A = eq * eq;
        var sAns = Math.sqrt(A);
        var band = FAR[rand() < 0.5 ? 0 : 1];
        var s0 = kit.clamp(sAns * kit.randFloat(band[0], band[1], rand), SQ_MIN, SQ_MAX);
        if (Math.abs(s0 / sAns - 1) < 0.25) s0 = kit.clamp(sAns * (s0 > sAns ? 0.55 : 1.5), SQ_MIN, SQ_MAX);
        return { kind: kind, A: A, sAns: sAns, s0: s0 };
    }
    /* 誤差（%）：方塊面積與目標面積的差 ÷ 目標面積 */
    function errPct(s, A) { return Math.abs(s * s - A) / A * 100; }
    function rating(e) {
        if (e < 0.5) return '神準！';
        if (e < 2) return '很準！';
        if (e < 5) return '不錯喔！';
        if (e < 12) return '還可以，再試一次會更準';
        return '面積很難用眼睛估，再試一次！';
    }

    function mount(root, ctx) {
        kit.single(root, ctx, {
            id: ID, G: G, better: 'min', max: SCORE.max,
            title: '拖曳方塊右下角，讓方塊的面積和左邊的圖形一樣大',
            numText: function (v) { return v.toFixed(4) + '%'; },
            rating: rating,
            sfx: function (v) { return v < 2 ? 'perfect' : (v < 8 ? 'win' : 'fail'); },
            setup: setup
        });
    }

    function setup(api) {
        var stage = api.stage, my = api.my;
        var W = stage.clientWidth || 472, H = stage.clientHeight || 640;
        var cfg = makeRound(), shape = shapeOf(cfg.kind, cfg.A);
        var s = cfg.s0, locked = false, hint = null;
        console.log('[面積一樣大] 形狀 ' + cfg.kind + '，目標面積 ' + cfg.A.toFixed(2) + '（等效邊長 ' + cfg.sAns.toFixed(2) + '），方塊起始邊長 ' + cfg.s0.toFixed(2));

        var svg = kit.svg('svg', { 'class': 'ar-svg', viewBox: '0 0 ' + W + ' ' + H, width: W, height: H }, stage);
        /* 目標形狀 */
        var gShape = kit.svg('g', { transform: 'translate(' + SHAPE_C.x + ' ' + SHAPE_C.y + ')' }, svg);
        var shapeEl;
        if (shape.kind === 'circle') shapeEl = kit.svg('circle', { cx: 0, cy: 0, r: shape.r, 'class': 'ar-shape' }, gShape);
        else shapeEl = kit.svg('polygon', { points: shape.pts.map(function (p) { return p[0].toFixed(2) + ',' + p[1].toFixed(2); }).join(' '), 'class': 'ar-shape' }, gShape);
        /* 方塊（左上角固定）與手柄 */
        var gSq = kit.svg('g', {}, svg);
        var rect = kit.svg('rect', { x: ANCHOR.x, y: ANCHOR.y, width: s, height: s, 'class': 'ar-sq' }, gSq);
        var handle = kit.svg('circle', { r: HANDLE_R, 'class': 'ar-handle' }, svg);
        var legend = h('div', { 'class': 'ar-legend' });
        stage.appendChild(legend);
        function paint() {
            rect.setAttribute('width', s); rect.setAttribute('height', s);
            handle.setAttribute('cx', ANCHOR.x + s); handle.setAttribute('cy', ANCHOR.y + s);
        }
        paint();
        var okBtn = h('button', { 'class': 'btn btn--go ar-ok', text: '確定' });
        stage.appendChild(okBtn);

        /* 操作提示（只在第一次進遊戲時）：手指＋箭頭，從手柄出發，沿對角線往「面積一樣大的位置」重複移動（第一次的正確答案） */
        if (kit.once('area.hint')) hint = kit.fingerHint(stage, { mode: 'drag', x: ANCHOR.x + s, y: ANCHOR.y + s, dx: cfg.sAns - s, dy: cfg.sAns - s, delay: 400, text: '請拖曳圓點調整方塊大小' });
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

        kit.onTap(okBtn, function () { submit(); });

        function submit() {
            if (locked) return;
            locked = true; hideHint();
            okBtn.style.display = 'none'; handle.style.display = 'none';
            Sfx.play('click');
            var real = errPct(s, cfg.A);
            /* 揭曉：方塊移到形狀上（中心對齊），兩個都半透明 */
            var cx0 = ANCHOR.x + s / 2, cy0 = ANCHOR.y + s / 2;
            var tx = SHAPE_C.x - cx0, ty = SHAPE_C.y - cy0;
            shapeEl.classList.add('ar-shape--rev'); rect.classList.add('ar-sq--rev');
            legend.textContent = '橘色＝只有圖形有　藍色＝只有方塊有';
            legend.classList.add('ar-legend--on');
            my.tween(900, function (e) {
                gSq.setAttribute('transform', 'translate(' + (tx * e).toFixed(2) + ' ' + (ty * e).toFixed(2) + ')');
            }, kit.easeInOutCubic).then(function () {
                var bigger = s * s > cfg.A;
                my.after(1500, function () {
                    api.finish(real, { lines: [
                        '你的方塊面積是目標的 ' + (s * s / cfg.A * 100).toFixed(4) + '%',
                        bigger ? '方塊比較大' : (s * s < cfg.A ? '方塊比較小' : '剛好一樣大'),
                        '只有一次機會，想拚更準就再挑戰一次'
                    ] });
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

    var G = {
        id: ID,
        name: '面積一樣大',
        rule: '左邊是一個圖形，右邊是一個方塊。拖曳方塊右下角的圓點，讓方塊的面積和左邊的圖形一樣大。手指移動越慢，變化越細。沒有任何數字，只有一次機會，按「確定」後會疊在一起告訴你差了幾 %。',
        mount: mount,
        score: SCORE,
        test: { polyArea: polyArea, shapeOf: shapeOf, areaOf: areaOf, makeRound: makeRound, errPct: errPct, rating: rating, KINDS: KINDS, EQ_MIN: EQ_MIN, EQ_MAX: EQ_MAX, SQ_MIN: SQ_MIN, SQ_MAX: SQ_MAX }
    };
    Reaction.register(G);
})();

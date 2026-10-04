/* ═══════════════════════════════════════════════════════════════════
   reaction_bounce.js — 秒反應・球會跑去哪（彈珠檯）
   彈珠從檯子上方掉下來，在交錯排列的釘子間彈來彈去；最下面的收集口（共 7 個）和它上面
   1.5 顆珠子高的地方被簾子蓋住。猜猜珠子最後會掉進哪一個收集口，點下去。
   ───────────────────────────────────────────────────────────────────
   · 幾何（單位：檯面座標 px，w＝收集口寬度＝64）：
        - 檯面寬 7w＝448；收集口 7 個；珠子直徑＝0.8w（半徑 25.6）；
        - 釘子很小（半徑 4），同一列的釘子相隔 w；奇偶列錯開半格（偶數列在收集口中央，奇數列在收集口分隔線上），
          所以珠子上下兩列永遠「正對著」一根釘子，一定會被彈開；兩根釘子的間隙 w − 8 = 56 > 珠子直徑 51.2，
          珠子對準縫隙時過得去，只是不容易剛好。
        - 簾子蓋住的高度＝收集口高度 SLOT_H ＋ 1.5 顆珠子直徑（LEAD_BALLS）。
   · 物理：固定步長 1/240 秒、重力 g、珠子與釘子（圓對圓）及左右牆的彈性碰撞（恢復係數 E_PEG／E_WALL）。
     整條路線在出題時就**預先模擬完**，存成取樣點；畫面只是依時間查表播放，所以答案在珠子落下前就確定，
     不受影格率影響。落點＝珠子中心越過分隔線頂端 (BH − SLOT_H) 時的 x 屬於哪個收集口。
   · 為了不會卡住：每 0.5 秒檢查一次，珠子若幾乎沒有往下掉，就給一個固定方向的小推力（朝檯面中央）；
     偶數列不放最左最右兩根釘子（離牆太近會讓珠子靠牆卡在釘子頂端）。
   · 玩法：珠子掉進簾子後，在 limit 秒內點下面 7 個收集口之一（也可以在簾子蓋住之前先點）。
   · 難度（第 1 → ROUNDS 回合線性）：重力 1500 → 2400、初速左右最大 0 → 180 px/秒、簾子後的作答時限 6 → 2.5 秒。
   · 8 回合，成績＝平均誤差（猜的收集口與實際差幾格，越小越好；0.00 ＝每次都猜中）。
   ═══════════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    var ID = 'bounce';
    var h = UI.h;
    var kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var ROUNDS = 8;
    var SLOTS = 7, W = 64;                      /* 收集口數量與寬度 */
    var BW = SLOTS * W;                         /* 檯面寬 448 */
    var BALL_R = 0.4 * W;                       /* 珠子半徑（直徑＝收集口寬度的 80%）*/
    var PEG_R = 4;
    var ROW_GAP = 52, ROW0_Y = 70, ROWS = 8;
    var SLOT_H = 60, LEAD_BALLS = 1.5;
    var BH = 560;
    var HIDDEN_H = SLOT_H + LEAD_BALLS * 4 * BALL_R;   /* 簾子高度 */
    var CURTAIN_Y = BH - HIDDEN_H;
    var DIV_Y = BH - SLOT_H;                    /* 分隔線頂端：越過它就算進了收集口 */
    var G_START = 1500, G_END = 2400;
    var VX_START = 0, VX_END = 180;
    var LIMIT_START = 6, LIMIT_END = 2.5;
    var E_PEG = 0.5, E_WALL = 0.5;
    var DROP_MIN = W * 1.0;                     /* 珠子從上方掉下來的位置：離左右牆至少一個收集口寬（太靠牆的落點會讓結果偏向兩邊）*/
    var DT = 1 / 240, MAX_SIM_S = 12;
    var NEXT_MS = 2200;

    function fmtBest(v) { return v == null ? '' : '最佳 ' + v.toFixed(2) + ' 格'; }

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function gFor(r) { return kit.ramp(r, G_START, G_END, ROUNDS); }
    function vxFor(r) { return kit.ramp(r, VX_START, VX_END, ROUNDS); }
    function limitFor(r) { return kit.ramp(r, LIMIT_START, LIMIT_END, ROUNDS); }
    /* 全部釘子：偶數列在收集口中央 (k+0.5)w，k=0..6；奇數列在分隔線 k·w，k=1..6 */
    function makePegs() {
        var pegs = [];
        for (var r = 0; r < ROWS; r++) {
            var y = ROW0_Y + r * ROW_GAP;
            /* 偶數列不放最左、最右的釘子：那兩根離牆只有 32px，珠子會卡在「釘子頂端靠著牆」動不了 */
            if (r % 2 === 0) for (var k = 1; k < SLOTS - 1; k++) pegs.push({ x: (k + 0.5) * W, y: y, row: r });
            else for (var k2 = 1; k2 < SLOTS; k2++) pegs.push({ x: k2 * W, y: y, row: r });
        }
        return pegs;
    }
    var PEGS = makePegs();
    /* 模擬一顆珠子：回傳 { xs, ys（每 DT 一個取樣點）, slot, tCross（越過分隔線的時間，秒）, tHide（整顆珠子被簾子蓋住的時間）, steps } */
    function simulate(x0, vx0, g) {
        var x = x0, y = BALL_R + 4, vx = vx0, vy = 0, xs = [x], ys = [y], t = 0, yMark = y, tHide = null, tCross = null, nudged = 0;
        var maxSteps = Math.round(MAX_SIM_S / DT);
        for (var step = 0; step < maxSteps; step++) {
            vy += g * DT;
            x += vx * DT; y += vy * DT;
            /* 左右牆 */
            if (x < BALL_R) { x = BALL_R; if (vx < 0) vx = -vx * E_WALL; }
            if (x > BW - BALL_R) { x = BW - BALL_R; if (vx > 0) vx = -vx * E_WALL; }
            /* 釘子（只檢查附近的列）*/
            for (var i = 0; i < PEGS.length; i++) {
                var p = PEGS[i];
                if (Math.abs(p.y - y) > BALL_R + PEG_R + 2) continue;
                var dx = x - p.x, dy = y - p.y, d2 = dx * dx + dy * dy, rr = BALL_R + PEG_R;
                if (d2 < rr * rr) {
                    var d = Math.sqrt(d2) || 1e-6, nx = dx / d, ny = dy / d;
                    x = p.x + nx * rr; y = p.y + ny * rr;
                    var vn = vx * nx + vy * ny;
                    if (vn < 0) { vx -= (1 + E_PEG) * vn * nx; vy -= (1 + E_PEG) * vn * ny; }
                }
            }
            t += DT;
            xs.push(x); ys.push(y);
            if (tHide == null && y - BALL_R >= CURTAIN_Y) tHide = t;
            if (y >= DIV_Y) { tCross = t; break; }
            /* 卡住保險：每 0.5 秒看一次，沒怎麼往下掉就朝檯面中央推一下（決定性：只看位置）*/
            if (step % 120 === 119) {
                if (y - yMark < 4) { vx += (x < BW / 2 ? 1 : -1) * 70; nudged++; }
                yMark = y;
            }
        }
        if (tCross == null) tCross = t;
        if (tHide == null) tHide = tCross;
        var slot = Math.max(0, Math.min(SLOTS - 1, Math.floor(x / W)));
        return { xs: xs, ys: ys, slot: slot, tCross: tCross, tHide: tHide, steps: xs.length - 1, xEnd: x, nudged: nudged };
    }
    function pathAt(sim, t) {
        var f = Math.max(0, t) / DT, i = Math.min(sim.steps, Math.floor(f)), j = Math.min(sim.steps, i + 1), u = f - i;
        return { x: sim.xs[i] + (sim.xs[j] - sim.xs[i]) * u, y: sim.ys[i] + (sim.ys[j] - sim.ys[i]) * u };
    }
    function makeRound(r, rand) {
        rand = rand || Math.random;
        var x0 = kit.randFloat(DROP_MIN, BW - DROP_MIN, rand), vmax = vxFor(r), vx0 = kit.randFloat(-vmax, vmax, rand), g = gFor(r);
        var sim = simulate(x0, vx0, g);
        return { x0: x0, vx0: vx0, g: g, sim: sim, limit: limitFor(r) };
    }

    function mount(root, ctx) {
        var R = null;

        function round() {
            if (R) R.dispose();
            R = kit.round();
            var my = R;
            root.innerHTML = '';

            var r = 0, errs = [], hits = 0, state = 'idle', rid = 0, cur = null, picked = null;
            var head = h('div', { 'class': 'bo-head' });
            var banner = h('div', { 'class': 'bo-banner' });
            var field = h('div', { 'class': 'bo-field' });
            var tb = kit.timebar();
            [head, banner, field, tb.el].forEach(function (n) { root.appendChild(n); });
            ctx.setMeta('');

            /* 檯面（SVG）*/
            var svg = kit.svg('svg', { 'class': 'bo-svg', viewBox: '0 0 ' + BW + ' ' + BH, preserveAspectRatio: 'xMidYMid meet' }, field);
            kit.svg('rect', { 'class': 'bo-board', x: 0, y: 0, width: BW, height: BH }, svg);
            PEGS.forEach(function (p) { kit.svg('circle', { 'class': 'bo-peg', cx: p.x, cy: p.y, r: PEG_R }, svg); });
            for (var k = 1; k < SLOTS; k++) kit.svg('line', { 'class': 'bo-div', x1: k * W, y1: DIV_Y, x2: k * W, y2: BH }, svg);
            var trail = kit.svg('polyline', { 'class': 'bo-trail', points: '' }, svg);
            var ball = kit.svg('circle', { 'class': 'bo-ball', cx: -100, cy: -100, r: BALL_R }, svg);
            var curtain = kit.svg('rect', { 'class': 'bo-curtain', x: 0, y: CURTAIN_Y, width: BW, height: HIDDEN_H }, svg);
            var slotEls = [];
            for (var s = 0; s < SLOTS; s++) {
                (function (s) {
                    var g = kit.svg('g', { 'class': 'bo-slot' }, svg);
                    kit.svg('rect', { 'class': 'bo-slot__bg', x: s * W + 3, y: CURTAIN_Y + 14, width: W - 6, height: HIDDEN_H - 20, rx: 10 }, g);
                    var t = kit.svg('text', { 'class': 'bo-slot__t', x: s * W + W / 2, y: CURTAIN_Y + HIDDEN_H / 2 + 6, 'text-anchor': 'middle', 'dominant-baseline': 'central' }, g);
                    t.textContent = String(s + 1);
                    g.addEventListener('pointerdown', function (e) { e.preventDefault(); choose(s); });
                    slotEls.push(g);
                })(s);
            }

            function startRound() {
                if (my.dead) return;
                r++;
                var id = ++rid;
                cur = makeRound(r); picked = null;
                head.textContent = '第 ' + r + '／' + ROUNDS + ' 回合';
                banner.textContent = '看珠子怎麼彈，猜它掉進幾號';
                curtain.setAttribute('opacity', 1);
                slotEls.forEach(function (g) { g.classList.remove('bo-slot--pick', 'bo-slot--ok', 'bo-slot--bad'); g.style.display = ''; });
                trail.setAttribute('points', '');
                ball.setAttribute('cx', -100);
                tb.set(0);
                state = 'fall';
                try { console.info('[球會跑去哪] 第 ' + r + ' 回合：起點 x=' + cur.x0.toFixed(1) + '、初速 ' + cur.vx0.toFixed(0) + ' px/秒、g=' + cur.g.toFixed(0) + '；全程 ' + cur.sim.tCross.toFixed(2) + ' 秒、被簾子蓋住時 ' + cur.sim.tHide.toFixed(2) + ' 秒；會掉進第 ' + (cur.sim.slot + 1) + ' 個收集口；作答時限 ' + cur.limit.toFixed(1) + ' 秒（從蓋住算起）'); } catch (e) { }
                var t0 = performance.now();
                my.loop(function (now) {
                    if (id !== rid || state === 'done') return false;
                    var t = (now - t0) / 1000;
                    if (state === 'fall') {
                        var p = pathAt(cur.sim, Math.min(t, cur.sim.tCross));
                        ball.setAttribute('cx', p.x.toFixed(1)); ball.setAttribute('cy', p.y.toFixed(1));
                    }
                    if (t >= cur.sim.tHide) tb.set(1 - (t - cur.sim.tHide) / cur.limit);
                });
                my.after((cur.sim.tHide + cur.limit) * 1000, function () { if (id === rid && (state === 'fall')) reveal(null); });
            }

            function choose(s) {
                if (state !== 'fall') return;
                picked = s;
                slotEls[s].classList.add('bo-slot--pick');
                Sfx.play('click');
                reveal(s);
            }

            function reveal(s) {
                if (state !== 'fall') return;
                state = 'reveal';
                tb.set(0);
                var actual = cur.sim.slot;
                var err = s == null ? Math.max(actual, SLOTS - 1 - actual) : Math.abs(s - actual);     /* 沒猜＝最糟的誤差 */
                errs.push(err); if (err === 0) hits++;
                /* 簾子拉開，畫出完整軌跡，珠子停在實際的收集口 */
                curtain.setAttribute('opacity', 0.12);
                slotEls.forEach(function (g) { g.style.display = 'none'; });
                var pts = [], step = Math.max(1, Math.floor(cur.sim.steps / 160));
                for (var i = 0; i <= cur.sim.steps; i += step) pts.push(cur.sim.xs[i].toFixed(1) + ',' + cur.sim.ys[i].toFixed(1));
                trail.setAttribute('points', pts.join(' '));
                ball.setAttribute('cx', (actual * W + W / 2).toFixed(1)); ball.setAttribute('cy', (BH - 26).toFixed(1));
                var tag = kit.svg('g', { 'class': 'bo-result' }, svg);
                var rect = kit.svg('rect', { 'class': 'bo-result__bg ' + (err === 0 ? 'bo-result__bg--ok' : 'bo-result__bg--bad'), x: actual * W + 2, y: DIV_Y, width: W - 4, height: SLOT_H - 4, rx: 8 }, tag);
                if (s != null && s !== actual) kit.svg('rect', { 'class': 'bo-result__bg bo-result__bg--you', x: s * W + 2, y: DIV_Y, width: W - 4, height: SLOT_H - 4, rx: 8 }, tag);
                Sfx.play(err === 0 ? 'win' : 'bad');
                banner.textContent = (err === 0 ? '猜中了！' : s == null ? '時間到！' : '差了 ' + err + ' 格') + '　珠子掉進第 ' + (actual + 1) + ' 號';
                my.after(NEXT_MS, function () {
                    if (tag.parentNode) tag.parentNode.removeChild(tag);
                    if (r >= ROUNDS) finish(); else startRound();
                });
            }

            function finish() {
                state = 'done';
                var avg = errs.reduce(function (a, b) { return a + b; }, 0) / errs.length;
                var isNew = Reaction.setBest(ID, avg, function (v, b) { return v < b; });
                ctx.setMeta(fmtBest(Reaction.getBest(ID)));
                kit.result(root, {
                    num: avg.toFixed(2) + ' 格', label: hits >= 6 ? '彈珠大師！' : (hits >= 3 ? '抓得到節奏！' : '再試一次，會更準！'),
                    lines: ['平均誤差（猜的號碼與實際差幾格）', '猜中 ' + hits + '／' + ROUNDS + ' 次　各回合誤差：' + errs.join('、')],
                    isNew: isNew, sfx: avg < 1 ? 'win' : 'neutral', onAgain: round
                });
            }

            G.debug = {
                state: function () { return { r: r, state: state, errs: errs.slice(), hits: hits, slot: cur && cur.sim.slot, cur: cur }; },
                choose: choose,
                chooseRight: function () { choose(cur.sim.slot); },
                chooseWrong: function () { choose((cur.sim.slot + 3) % SLOTS); },
                timeoutNow: function () { reveal(null); }
            };
            my.after(400, startRound);
        }

        round();
    }

    var G = {
        id: ID,
        name: '球會跑去哪',
        rule: '彈珠從上面掉下來，在釘子之間彈來彈去，最下面一小段被簾子蓋住。猜猜它最後會掉進哪一個收集口（共 7 個），點下面的號碼。共 8 回合，看誰猜得準！',
        mount: mount,
        test: { gFor: gFor, vxFor: vxFor, limitFor: limitFor, PEGS: PEGS, makePegs: makePegs, simulate: simulate, pathAt: pathAt, makeRound: makeRound, SLOTS: SLOTS, W: W, BW: BW, BH: BH, BALL_R: BALL_R, PEG_R: PEG_R, CURTAIN_Y: CURTAIN_Y, DIV_Y: DIV_Y, HIDDEN_H: HIDDEN_H, SLOT_H: SLOT_H, LEAD_BALLS: LEAD_BALLS, ROW_GAP: ROW_GAP, ROWS: ROWS, DT: DT, ROUNDS: ROUNDS }
    };
    Reaction.register(G);
})();

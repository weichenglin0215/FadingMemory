/* ═══════════════════════════════════════════════════════════════════
   reaction_mirror.js — 秒反應・左右顛倒
   手指往右，小球卻往左！在顛倒的世界裡，把小球沿著彎彎曲曲的通道送到終點，不能碰到牆。
   ───────────────────────────────────────────────────────────────────
   · 控制：按下去之後，小球的移動量 ＝ 手指移動量經過「映射」：第 1～FLIP_BOTH_FROM-1 關左右反（x 取負），
     第 FLIP_BOTH_FROM 關起上下左右都反；再乘上增益 gain（1.0 → 1.6，手指一動球動更多）。
     放開手指後小球停在原地，再按下去從目前位置繼續（相對控制，不會因為手指落點不同而跳掉）。
   · 通道：從上到下的折線，兩端固定，中間有 bends 個彎（1 → 5）。每個彎的轉角 ≤ MAX_TURN_DEG(100°)，
     通道半寬 hw 64 → 30px；通道用「折線粗描邊」畫成，判定用「球心到折線的距離 ≤ hw − 球半徑」，
     所以畫的跟判的是同一個形狀。最窄時手指的容許誤差約 (hw − 球半徑) ÷ gain ＝ 11px，這是刻意的極限難度。
   · 碰到牆（球出了通道）→ 球回到起點，累計一次；累計 BUMPS 次結束。到終點圈圈就過關。
   · 成績＝通過關數（越多越好）。不限時。
   ═══════════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    var ID = 'mirror';
    var h = UI.h;
    var kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var LEVEL_RAMP = 15;
    var HW_START = 64, HW_END = 30;            /* 通道半寬（px） */
    var BENDS_START = 1, BENDS_END = 5;        /* 彎的數量 */
    var GAIN_START = 1.0, GAIN_END = 1.6;      /* 手指動 1px，球動幾 px */
    var FLIP_BOTH_FROM = 8;                    /* 第幾關起上下也反 */
    var BALL_R = 14;
    var BUMPS = 3;
    var MAX_TURN_DEG = 100;
    var MARGIN_Y = 46, MARGIN_X = 6;
    var GOAL_R = 28;
    var NEXT_MS = 1000;

    function fmtBest(v) { return v == null ? '' : '最佳 ' + v + ' 關'; }

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function hwFor(level) { return kit.ramp(level, HW_START, HW_END, LEVEL_RAMP); }
    function bendsFor(level) { return Math.round(kit.ramp(level, BENDS_START, BENDS_END, LEVEL_RAMP)); }
    function gainFor(level) { return kit.ramp(level, GAIN_START, GAIN_END, LEVEL_RAMP); }
    function flipBoth(level) { return level >= FLIP_BOTH_FROM; }
    /* 手指移動 (dx, dy) → 球的移動量 */
    function mapDelta(level, dx, dy) {
        var g = gainFor(level);
        return { x: -dx * g, y: (flipBoth(level) ? -dy : dy) * g };
    }
    /* 點到線段的距離 */
    function distSeg(px, py, ax, ay, bx, by) {
        var vx = bx - ax, vy = by - ay, wx = px - ax, wy = py - ay;
        var c = vx * vx + vy * vy, t = c ? Math.max(0, Math.min(1, (wx * vx + wy * vy) / c)) : 0;
        var qx = ax + vx * t, qy = ay + vy * t;
        return Math.sqrt((px - qx) * (px - qx) + (py - qy) * (py - qy));
    }
    function distToPolyline(p, pts) {
        var best = Infinity;
        for (var i = 0; i < pts.length - 1; i++) best = Math.min(best, distSeg(p.x, p.y, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y));
        return best;
    }
    function turnDeg(a, b, c) {
        var v1x = b.x - a.x, v1y = b.y - a.y, v2x = c.x - b.x, v2y = c.y - b.y;
        var d = Math.atan2(v1x * v2y - v1y * v2x, v1x * v2x + v1y * v2y);
        return Math.abs(d) * 180 / Math.PI;
    }
    /* 通道中心線：起點在上方中央，終點在下方；中間 bends 個彎，左右交替。回傳折線點陣列。 */
    function makeCenterline(level, FW, FH, rand) {
        rand = rand || Math.random;
        var hw = hwFor(level), B = bendsFor(level);
        var xMin = MARGIN_X + hw + 4, xMax = FW - MARGIN_X - hw - 4, cx = FW / 2;
        var y0 = MARGIN_Y, y1 = FH - MARGIN_Y;
        for (var tries = 0; tries < 400; tries++) {
            var pts = [{ x: cx, y: y0 }];
            for (var i = 1; i <= B; i++) {
                var y = y0 + (y1 - y0) * i / (B + 1);
                var side = i % 2 ? 1 : -1;
                var x = cx + side * kit.randFloat(0.45, 1.0, rand) * Math.min(xMax - cx, cx - xMin);
                pts.push({ x: x, y: y });
            }
            pts.push({ x: cx + kit.randFloat(-0.3, 0.3, rand) * (xMax - cx), y: y1 });
            var ok = true;
            for (var k = 1; k < pts.length - 1; k++) if (turnDeg(pts[k - 1], pts[k], pts[k + 1]) > MAX_TURN_DEG) { ok = false; break; }
            if (ok) return pts;
        }
        /* 保底：幅度小一點的 S 形 */
        var fb = [{ x: cx, y: y0 }];
        for (var j = 1; j <= B; j++) fb.push({ x: cx + (j % 2 ? 1 : -1) * 50, y: y0 + (y1 - y0) * j / (B + 1) });
        fb.push({ x: cx, y: y1 });
        return fb;
    }
    function inCorridor(p, pts, hw) { return distToPolyline(p, pts) <= hw - BALL_R + 1e-9; }

    function mount(root, ctx) {
        var R = null;

        /* startAt：從第幾關開始（失敗後可從前 5 關繼續）*/
        function round(startAt) {
            if (R) R.dispose();
            R = kit.round();
            var my = R;
            root.innerHTML = '';

            var level = startAt || 1, cleared = level - 1, bumps = 0, newRec = false, state = 'idle', lvId = 0;
            var pts = null, ball = { x: 0, y: 0 }, hw = 60, FW = 0, FH = 0;
            var head = h('div', { 'class': 'mr-head' });
            var field = h('div', { 'class': 'mr-field' });
            var hint = h('div', { 'class': 'mr-hint' });
            [head, field, hint].forEach(function (n) { root.appendChild(n); });
            var svg = null, ballEl = null, goalEl = null, ghost = null;

            function meta() { ctx.setMeta(kit.meta(['第 ' + level + ' 關', '碰牆 ' + bumps + '／' + BUMPS])); }

            function build() {
                if (svg && svg.parentNode) svg.parentNode.removeChild(svg);
                FW = field.clientWidth; FH = field.clientHeight;
                svg = kit.svg('svg', { 'class': 'mr-svg', viewBox: '0 0 ' + FW + ' ' + FH }, field);
                var d = pts.map(function (p, i) { return (i ? 'L' : 'M') + p.x.toFixed(1) + ' ' + p.y.toFixed(1); }).join(' ');
                kit.svg('path', { 'class': 'mr-wall', d: d, 'stroke-width': hw * 2 + 8 }, svg);
                kit.svg('path', { 'class': 'mr-lane', d: d, 'stroke-width': hw * 2 - 4 }, svg);
                var s = pts[0], g = pts[pts.length - 1];
                kit.svg('circle', { 'class': 'mr-start', cx: s.x, cy: s.y, r: BALL_R + 8 }, svg);
                goalEl = kit.svg('circle', { 'class': 'mr-goal', cx: g.x, cy: g.y, r: GOAL_R }, svg);
                var flag = kit.svg('text', { 'class': 'mr-goal-t', x: g.x, y: g.y, 'text-anchor': 'middle', 'dominant-baseline': 'central' }, svg);
                flag.textContent = '終點';
                ghost = kit.svg('circle', { 'class': 'mr-ghost', cx: -100, cy: -100, r: 18 }, svg);
                ballEl = kit.svg('circle', { 'class': 'mr-ball', r: BALL_R }, svg);
                setBall(s.x, s.y);
            }
            function setBall(x, y) { ball.x = x; ball.y = y; ballEl.setAttribute('cx', x.toFixed(1)); ballEl.setAttribute('cy', y.toFixed(1)); }

            function startLevel() {
                if (my.dead) return;
                lvId++;
                FW = field.clientWidth; FH = field.clientHeight;
                hw = hwFor(level);
                pts = makeCenterline(level, FW, FH);
                build();
                state = 'play';
                head.textContent = '第 ' + level + ' 關';
                hint.textContent = flipBoth(level) ? '現在連上下也是反的！' : '手指往右，球往左';
                meta();
                try { console.info('[左右顛倒] 第 ' + level + ' 關：通道半寬 ' + hw.toFixed(1) + 'px、彎 ' + bendsFor(level) + ' 個、增益 ' + gainFor(level).toFixed(2) + '、上下' + (flipBoth(level) ? '也反' : '正常') + '、手指容許誤差約 ±' + ((hw - BALL_R) / gainFor(level)).toFixed(1) + 'px'); } catch (e) { }
            }

            function bump() {
                state = 'bump';
                bumps++;
                Sfx.play('bad');
                svg.classList.add('mr-svg--bump');
                meta();
                if (bumps >= BUMPS) {
                    my.after(700, function () {
                        var back = kit.resumeFrom(level);
                        kit.result(root, {
                            num: cleared + ' 關', label: cleared >= 8 ? '腦袋轉得真快！' : (cleared >= 4 ? '適應得不錯！' : '再試一次，會更順！'),
                            lines: ['第 ' + level + ' 關碰牆 ' + BUMPS + ' 次'], isNew: newRec, sfx: cleared >= 5 ? 'win' : 'fail', onAgain: function () { round(1); },
                            resume: { level: back, run: function () { round(back); } }
                        });
                    });
                    return;
                }
                my.after(600, function () { svg.classList.remove('mr-svg--bump'); setBall(pts[0].x, pts[0].y); state = 'play'; });
            }
            function win() {
                state = 'clear';
                cleared = level;
                if (Reaction.setBest(ID, cleared, function (v, b) { return v > b; })) newRec = true;
                goalEl.classList.add('mr-goal--ok');
                Sfx.play('win');
                level++;
                meta();
                my.after(NEXT_MS, startLevel);
            }
            /* 球移到新位置：沿途取樣檢查，避免快速滑動「穿牆」 */
            function moveBall(nx, ny) {
                var steps = Math.max(1, Math.ceil(Math.sqrt((nx - ball.x) * (nx - ball.x) + (ny - ball.y) * (ny - ball.y)) / 4));
                var sx = ball.x, sy = ball.y;
                for (var i = 1; i <= steps; i++) {
                    var x = sx + (nx - sx) * i / steps, y = sy + (ny - sy) * i / steps;
                    var p = { x: x, y: y };
                    if (!inCorridor(p, pts, hw)) { setBall(x, y); bump(); return; }
                    var g = pts[pts.length - 1];
                    if (Math.sqrt((x - g.x) * (x - g.x) + (y - g.y) * (y - g.y)) <= GOAL_R) { setBall(x, y); win(); return; }
                }
                setBall(nx, ny);
            }

            var drag = null;
            field.addEventListener('pointerdown', function (e) {
                if (state !== 'play' || drag) return;
                e.preventDefault();
                try { field.setPointerCapture(e.pointerId); } catch (err) { }
                var p = kit.localPt(e, field);
                drag = { id: e.pointerId, fx: p.x, fy: p.y, bx: ball.x, by: ball.y };
                ghost.setAttribute('cx', p.x); ghost.setAttribute('cy', p.y);
            });
            field.addEventListener('pointermove', function (e) {
                if (!drag || e.pointerId !== drag.id) return;
                var evs = e.getCoalescedEvents ? e.getCoalescedEvents() : null;
                var list = evs && evs.length ? evs : [e];
                for (var k = 0; k < list.length && state === 'play'; k++) {
                    var p = kit.localPt(list[k], field), m = mapDelta(level, p.x - drag.fx, p.y - drag.fy);
                    ghost.setAttribute('cx', p.x); ghost.setAttribute('cy', p.y);
                    moveBall(drag.bx + m.x, drag.by + m.y);
                }
            });
            function endDrag(e) { if (drag && e.pointerId === drag.id) { drag = null; if (ghost) { ghost.setAttribute('cx', -100); } } }
            field.addEventListener('pointerup', endDrag);
            field.addEventListener('pointercancel', endDrag);

            G.debug = {
                state: function () { return { level: level, state: state, bumps: bumps, cleared: cleared, ball: { x: ball.x, y: ball.y }, pts: pts, hw: hw }; },
                /* 用真的 PointerEvent 讓球沿著中心線走到終點（反推手指要怎麼動）*/
                solve: function () {
                    var rect = field.getBoundingClientRect(), sc = rect.width / FW;
                    var fx = rect.left + 60 * sc, fy = rect.top + 60 * sc, pid = 31;
                    field.dispatchEvent(new PointerEvent('pointerdown', { clientX: fx, clientY: fy, bubbles: true, cancelable: true, pointerId: pid }));
                    var cx = 0, cy = 0, flip = flipBoth(level), g = gainFor(level);
                    for (var i = 1; i < pts.length && state === 'play'; i++) {
                        var segLen = Math.sqrt(Math.pow(pts[i].x - pts[i - 1].x, 2) + Math.pow(pts[i].y - pts[i - 1].y, 2)), n = Math.ceil(segLen / 6);
                        for (var k = 1; k <= n && state === 'play'; k++) {
                            var tx = pts[i - 1].x + (pts[i].x - pts[i - 1].x) * k / n - pts[0].x, ty = pts[i - 1].y + (pts[i].y - pts[i - 1].y) * k / n - pts[0].y;
                            /* 球位移 = (−dx·g, ±dy·g) → 手指位移 = (−tx/g, ±ty/g) */
                            cx = -tx / g; cy = (flip ? -ty : ty) / g;
                            field.dispatchEvent(new PointerEvent('pointermove', { clientX: fx + cx * sc, clientY: fy + cy * sc, bubbles: true, cancelable: true, pointerId: pid }));
                        }
                    }
                    field.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: pid }));
                    return state;
                },
                wall: function () {     /* 讓球直接穿出通道（往左大幅度拖）*/
                    var rect = field.getBoundingClientRect(), sc = rect.width / FW, pid = 32;
                    field.dispatchEvent(new PointerEvent('pointerdown', { clientX: rect.left + 100, clientY: rect.top + 100, bubbles: true, cancelable: true, pointerId: pid }));
                    field.dispatchEvent(new PointerEvent('pointermove', { clientX: rect.left + 100 + 300 * sc, clientY: rect.top + 100, bubbles: true, cancelable: true, pointerId: pid }));
                    field.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: pid }));
                    return state;
                }
            };
            my.after(400, startLevel);
        }

        round(1);
    }

    var G = {
        id: ID,
        name: '左右顛倒',
        rule: '手指往右，球卻往左（左右是反的）。拖動手指，帶小球沿著通道走到終點，不要碰到牆。碰牆三次就結束，越後面通道越窄、控制越反！',
        mount: mount,
        test: { hwFor: hwFor, bendsFor: bendsFor, gainFor: gainFor, flipBoth: flipBoth, mapDelta: mapDelta, distSeg: distSeg, distToPolyline: distToPolyline, turnDeg: turnDeg, makeCenterline: makeCenterline, inCorridor: inCorridor, BALL_R: BALL_R, MAX_TURN_DEG: MAX_TURN_DEG, LEVEL_RAMP: LEVEL_RAMP }
    };
    Reaction.register(G);
})();

/* ═══════════════════════════════════════════════════════════════════
   reaction_hangpic.js — 秒反應・掛畫
   把相框轉到「剛好是水平的」。牆面沒有任何水平或垂直的線條，只有刻意傾斜的條紋或碎花，
   畫框的顏色又跟牆面很接近，很難靠對比判斷。按「掛好了」之後，鏡頭推進看差了幾度。
   ───────────────────────────────────────────────────────────────────
   · 牆面兩種：斜條紋（傾斜角 12°～78°，故意不是水平也不是垂直）或碎花（位置抖動、方向隨機，
     沒有成列成行的對齊線索）。
   · 畫框顏色與牆面的亮度差 CONTRAST_START → CONTRAST_END（%，第 1 → ROUNDS 回合線性變小，越來越難分辨）。
   · 起始歪斜角度 START_DEV_START → START_DEV_END 度（隨機左右）。
   · 轉動：手指在畫面上繞著相框中心轉，轉動量依手指速度打折（慢 ×GAIN_MIN、快 ×1），所以可以微調；
     另有 ◀ ▶ 每次 0.1°（按住會連續）。過程中不顯示任何刻度。
   · 判定值＝相框相對真水平的夾角（全精度；矩形轉 180° 看起來一樣，所以取 (-90°, 90°]）。
   · 結算：以相框右下角為固定錨點，鏡頭推進 ×8／×80／×800（紅色水平線是真水平，從左下角拉出來），
     放大到「紅線還在畫面內」為止，最後寫「差了 X.XX 度」。
   · 5 回合，成績＝平均誤差（度，越小越好）。
   ═══════════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    var ID = 'hangpic';
    var h = UI.h;
    var kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var ROUNDS = 5;
    var FRAME_W = 300, FRAME_H = 220, BORDER = 16;
    var CONTRAST_START = 10, CONTRAST_END = 4;          /* 畫框比牆面暗幾個 L%（越小越難分） */
    var START_DEV_START = 25, START_DEV_END = 8;       /* 起始歪斜角度上限（度） */
    var GAIN_MIN = 0.12, SPEED_FULL = 0.25;            /* 手指轉動：慢 ×0.12，快到 0.25 度／毫秒以上 ×1 */
    var NUDGE_DEG = 0.1;
    var ZOOMS = [8, 80, 800];
    var ZOOM_MS = 1000, ZOOM_HOLD_MS = 600, VIEW_RED_PX = 200;
    var NEXT_MS = 1600;
    var DEAD_ZONE = 30;                                /* 離相框中心多近就不理（px，客戶端座標）*/

    function fmtBest(v) { return v == null ? '' : '最佳 ' + v.toFixed(2) + '°'; }

    /* ═══ 純函式（也給 Node 測試用）═══ */
    /* 角度正規化成 (-90, 90]：矩形轉 180° 一樣 */
    function norm180(deg) { var d = ((deg % 180) + 180) % 180; return d > 90 ? d - 180 : d; }
    function errDeg(theta) { return Math.abs(norm180(theta)); }
    function contrast(r) { return kit.ramp(r, CONTRAST_START, CONTRAST_END, ROUNDS); }
    function devMax(r) { return kit.ramp(r, START_DEV_START, START_DEV_END, ROUNDS); }
    function gainFor(speed) { return kit.lerp(GAIN_MIN, 1, kit.clamp(speed / SPEED_FULL, 0, 1)); }
    /* 兩個角度之間的最短有號差 */
    function angDelta(a, b) { return ((b - a + 540) % 360) - 180; }
    /* 要放大到哪些倍率：紅線到錨點的距離（倍率 1 時，px）× 倍率 ≤ VIEW_RED_PX 的最大一段為止 */
    function zoomPlan(distAt1) {
        var stages = [];
        for (var i = 0; i < ZOOMS.length; i++) { if (distAt1 * ZOOMS[i] <= VIEW_RED_PX) stages.push(ZOOMS[i]); else break; }
        if (!stages.length) { var z = VIEW_RED_PX / Math.max(distAt1, 1e-9); if (z > 1.15) stages.push(Math.min(z, ZOOMS[0])); }
        return stages;
    }
    /* 相框右下角與左下角的高度差（px）＝推進的依據 */
    function cornerDrop(theta) { return FRAME_W * Math.sin(theta * Math.PI / 180); }
    /* 出一回合：牆面種類／參數、起始角度 */
    function makeRound(r, rand) {
        rand = rand || Math.random;
        var wall = rand() < 0.5 ? 'stripes' : 'flowers';
        var mag = kit.randFloat(12, 38, rand);
        var alpha = (rand() < 0.5 ? 1 : -1) * (rand() < 0.5 ? mag : 90 - mag + 0);      /* 12～38° 或 52～78° */
        var dev = devMax(r) * kit.randFloat(0.6, 1, rand);
        return {
            hue: kit.randInt(0, 359, rand), wall: wall, alpha: alpha,
            start: (rand() < 0.5 ? 1 : -1) * dev, contrast: contrast(r),
            seed: kit.randInt(1, 1e9, rand)
        };
    }
    function rating(e) {
        if (e < 0.05) return '神乎其技！';
        if (e < 0.2) return '高手！';
        if (e < 0.5) return '很準！';
        if (e < 1) return '不錯喔！';
        return '再試一次，會更準！';
    }

    function mount(root, ctx) {
        var R = null;

        function round() {
            if (R) R.dispose();
            R = kit.round();
            var my = R;
            root.innerHTML = '';

            var r = 0, errs = [], theta = 0, state = 'idle', cfg = null, lastErr = null, runId = 0;
            var head = h('div', { 'class': 'hp-head' });
            var field = h('div', { 'class': 'hp-field' });
            var nudgeL = h('button', { 'class': 'btn btn--line hp-nudge', text: '◀' });
            var doneBtn = h('button', { 'class': 'btn btn--go hp-done', text: '掛好了' });
            var nudgeR = h('button', { 'class': 'btn btn--line hp-nudge', text: '▶' });
            var ctrl = h('div', { 'class': 'hp-ctrl' }, [nudgeL, doneBtn, nudgeR]);
            var verdict = h('div', { 'class': 'hp-verdict' });
            [head, field, ctrl].forEach(function (x) { root.appendChild(x); });
            field.appendChild(verdict);
            ctx.setMeta(fmtBest(Reaction.getBest(ID)));

            var FW = 0, FH = 0, svg = null, gWall = null, gFrame = null, refLine = null, edgeLine = null, full = null, CX = 0, CY = 0;

            function seeded(seed) { var a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

            function build() {
                if (svg && svg.parentNode) svg.parentNode.removeChild(svg);
                FW = field.clientWidth; FH = field.clientHeight; CX = FW / 2; CY = FH * 0.46;
                svg = kit.svg('svg', { 'class': 'hp-svg', viewBox: '0 0 ' + FW + ' ' + FH, preserveAspectRatio: 'none' });
                field.insertBefore(svg, verdict);
                full = { vx: 0, vy: 0, vw: FW, vh: FH };
                var wallL = 84, hue = cfg.hue;
                kit.svg('rect', { x: -2000, y: -2000, width: 5000, height: 5000, fill: 'hsl(' + hue + ',32%,' + wallL + '%)' }, svg);
                gWall = kit.svg('g', {}, svg);
                var rnd = seeded(cfg.seed);
                if (cfg.wall === 'stripes') {
                    var g = kit.svg('g', { transform: 'rotate(' + cfg.alpha + ' ' + CX + ' ' + CY + ')' }, gWall);
                    var diag = Math.sqrt(FW * FW + FH * FH);
                    for (var x = -diag; x < diag; x += 58) kit.svg('rect', { x: CX + x, y: CY - diag, width: 26, height: diag * 2, fill: 'hsl(' + hue + ',32%,' + (wallL - 5) + '%)' }, g);
                } else {
                    /* 碎花：位置抖動、方向隨機。用「拒絕取樣」避免成列成行 */
                    var pts = [];
                    for (var tries = 0; tries < 900 && pts.length < 62; tries++) {
                        var px = rnd() * FW, py = rnd() * FH, okp = true;
                        for (var q = 0; q < pts.length; q++) { var dx = pts[q][0] - px, dy = pts[q][1] - py; if (dx * dx + dy * dy < 62 * 62) { okp = false; break; } }
                        if (okp) pts.push([px, py]);
                    }
                    pts.forEach(function (p) {
                        var f = kit.svg('g', { transform: 'translate(' + p[0].toFixed(1) + ' ' + p[1].toFixed(1) + ') rotate(' + (rnd() * 72).toFixed(0) + ') scale(' + (0.8 + rnd() * 0.5).toFixed(2) + ')' }, gWall);
                        for (var k = 0; k < 5; k++) {
                            var a = k * 72 * Math.PI / 180;
                            kit.svg('circle', { cx: 11 * Math.sin(a), cy: -11 * Math.cos(a), r: 8, fill: 'hsl(' + ((hue + 20) % 360) + ',38%,' + (wallL - 9) + '%)' }, f);
                        }
                        kit.svg('circle', { cx: 0, cy: 0, r: 5, fill: 'hsl(' + ((hue + 60) % 360) + ',40%,' + (wallL - 3) + '%)' }, f);
                    });
                }
                /* 相框（整組繞中心旋轉）*/
                gFrame = kit.svg('g', {}, svg);
                var W = FRAME_W, H = FRAME_H, B = BORDER, frameL = wallL - cfg.contrast;
                kit.svg('rect', { x: CX - W / 2 + 5, y: CY - H / 2 + 7, width: W, height: H, fill: 'rgba(74,59,30,0.12)' }, gFrame);        /* 直角，沒有圓角：放大之後才看得到邊緣 */
                kit.svg('rect', { x: CX - W / 2, y: CY - H / 2, width: W, height: H, fill: 'hsl(' + hue + ',32%,' + frameL + '%)' }, gFrame);
                kit.svg('rect', { x: CX - W / 2 + B, y: CY - H / 2 + B, width: W - 2 * B, height: H - 2 * B, fill: 'hsl(' + hue + ',22%,93%)' }, gFrame);
                /* 畫裡面的圖案：曲線和圓，不用水平垂直的線 */
                kit.svg('circle', { cx: CX + 52, cy: CY - 34, r: 20, fill: 'hsl(' + ((hue + 40) % 360) + ',45%,82%)' }, gFrame);
                kit.svg('path', { d: 'M' + (CX - W / 2 + B) + ' ' + (CY + 40) + ' Q ' + (CX - 60) + ' ' + (CY - 30) + ' ' + (CX + 10) + ' ' + (CY + 30) + ' T ' + (CX + W / 2 - B) + ' ' + (CY + 20) + ' L ' + (CX + W / 2 - B) + ' ' + (CY + H / 2 - B) + ' L ' + (CX - W / 2 + B) + ' ' + (CY + H / 2 - B) + ' Z', fill: 'hsl(' + ((hue + 120) % 360) + ',30%,84%)' }, gFrame);
                /* 畫框下緣的邊緣線（綠色，跟著相框轉，兩端拉得很長）：按「掛好了」之後才顯示 */
                edgeLine = kit.svg('line', { x1: CX - 4000, x2: CX + 4000, y1: CY + H / 2, y2: CY + H / 2, stroke: 'hsl(135,60%,32%)', 'stroke-width': 2.5, 'vector-effect': 'non-scaling-stroke', opacity: 0 }, gFrame);
                refLine = kit.svg('line', { x1: -3000, x2: 4000, y1: 0, y2: 0, stroke: 'hsl(2,75%,48%)', 'stroke-width': 2.5, 'vector-effect': 'non-scaling-stroke', opacity: 0 }, svg);
                setTheta(theta);
            }
            function setTheta(t) { theta = t; gFrame.setAttribute('transform', 'rotate(' + t.toFixed(4) + ' ' + CX + ' ' + CY + ')'); }

            function startRound() {
                if (my.dead) return;
                r++;
                var id = ++runId;
                cfg = makeRound(r);
                theta = cfg.start;
                build();
                verdict.textContent = ''; verdict.classList.remove('hp-verdict--on');
                state = 'play';
                head.textContent = '第 ' + r + '／' + ROUNDS + ' 回合　把相框轉成水平';
                try { console.info('[掛畫] 第 ' + r + ' 回合：牆面 ' + cfg.wall + (cfg.wall === 'stripes' ? '（條紋傾斜 ' + cfg.alpha.toFixed(1) + '°）' : '') + '，畫框比牆暗 ' + cfg.contrast.toFixed(1) + '%，起始歪斜 ' + cfg.start.toFixed(2) + '°'); } catch (e) { }
            }

            /* ─── 轉動 ─── */
            var drag = null;
            function centerClient() { var rc = svg.getBoundingClientRect(); return { x: rc.left + rc.width * CX / FW, y: rc.top + rc.height * CY / FH }; }
            field.addEventListener('pointerdown', function (e) {
                if (state !== 'play' || drag) return;
                var c = centerClient(), dx = e.clientX - c.x, dy = e.clientY - c.y;
                if (Math.sqrt(dx * dx + dy * dy) < DEAD_ZONE) return;
                e.preventDefault();
                try { field.setPointerCapture(e.pointerId); } catch (err) { }
                drag = { id: e.pointerId, a: Math.atan2(dy, dx) * 180 / Math.PI, t: performance.now() };
            });
            field.addEventListener('pointermove', function (e) {
                if (state !== 'play' || !drag || e.pointerId !== drag.id) return;
                var c = centerClient(), dx = e.clientX - c.x, dy = e.clientY - c.y;
                if (Math.sqrt(dx * dx + dy * dy) < DEAD_ZONE) return;
                var a = Math.atan2(dy, dx) * 180 / Math.PI, now = performance.now();
                var da = angDelta(drag.a, a), dt = Math.max(1, now - drag.t);
                setTheta(theta + da * gainFor(Math.abs(da) / dt));
                drag.a = a; drag.t = now;
            });
            function endDrag(e) { if (drag && e.pointerId === drag.id) drag = null; }
            field.addEventListener('pointerup', endDrag);
            field.addEventListener('pointercancel', endDrag);

            function nudge(btn, dir) {
                var rep = null;
                function step() { if (state === 'play') setTheta(theta + dir * NUDGE_DEG); }
                btn.addEventListener('pointerdown', function (e) {
                    e.preventDefault(); step();
                    var n = 0;
                    (function again() { rep = my.after(n++ < 3 ? 350 : 60, function () { step(); again(); }); })();
                });
                function stop() { if (rep != null) { my.cancel(rep); rep = null; } }
                btn.addEventListener('pointerup', stop); btn.addEventListener('pointerleave', stop); btn.addEventListener('pointercancel', stop);
            }
            nudge(nudgeL, -1); nudge(nudgeR, 1);
            doneBtn.addEventListener('pointerdown', function (e) { e.preventDefault(); submit(); });

            /* ─── 結算：鏡頭推進 ─── */
            function corner(sign) {      /* 相框底邊左(-1)／右(+1) 角在畫面上的位置 */
                var a = theta * Math.PI / 180, x = sign * FRAME_W / 2, y = FRAME_H / 2;
                return { x: CX + x * Math.cos(a) - y * Math.sin(a), y: CY + x * Math.sin(a) + y * Math.cos(a) };
            }
            function boxFor(tip, z) {
                var vw = FW / z, vh = FH / z;
                return { vx: tip.x - (tip.x / FW) * vw, vy: tip.y - (tip.y / FH) * vh, vw: vw, vh: vh };
            }
            function submit() {
                if (state !== 'play') return;
                state = 'zoom';
                var e = errDeg(theta);
                lastErr = e; errs.push(e);
                Sfx.play('click');
                var bl = corner(-1), br = corner(1);
                refLine.setAttribute('y1', bl.y); refLine.setAttribute('y2', bl.y); refLine.setAttribute('opacity', 1);
                edgeLine.setAttribute('opacity', 1);
                head.textContent = '紅線是真正的水平，綠線是畫框的下緣';
                var plan = zoomPlan(Math.abs(br.y - bl.y));
                var chain = my.wait(400), cur = full;
                plan.forEach(function (z) {
                    chain = chain.then(function () {
                        Sfx.play('zoom');
                        gWall.style.display = 'none';
                        var to = boxFor(br, z);
                        return kit.tweenViewBox(my, svg, cur, to, ZOOM_MS, kit.easeInOutCubic).then(function () { cur = to; return my.wait(ZOOM_HOLD_MS); });
                    });
                });
                chain.then(function () {
                    var side = norm180(theta) > 0.005 ? '（順時針歪）' : (norm180(theta) < -0.005 ? '（逆時針歪）' : '');
                    verdict.textContent = e < 0.005 ? '差了 0.00 度・分毫不差！' : '差了 ' + e.toFixed(2) + ' 度' + side;
                    verdict.classList.add('hp-verdict--on');
                    Sfx.play(e < 0.2 ? 'win' : 'click');
                    my.after(NEXT_MS, function () {
                        if (r >= ROUNDS) finish(); else startRound();
                    });
                });
            }

            function finish() {
                state = 'done';
                var avg = errs.reduce(function (s, x) { return s + x; }, 0) / errs.length;
                var isNew = Reaction.setBest(ID, avg, function (v, b) { return v < b; });
                ctx.setMeta(fmtBest(Reaction.getBest(ID)));
                kit.result(root, {
                    num: avg.toFixed(2) + ' 度', label: rating(avg),
                    lines: ['五回合平均誤差', errs.map(function (x) { return x.toFixed(2); }).join('／') + ' 度'],
                    isNew: isNew, sfx: avg < 0.5 ? 'perfect' : (avg < 1.5 ? 'win' : 'fail'), onAgain: round
                });
            }

            G.debug = {
                state: function () { return { r: r, state: state, theta: theta, errs: errs.slice(), cfg: cfg, last: lastErr }; },
                setTheta: setTheta,
                submit: submit,
                spin: function (deg) {      /* 用真的 PointerEvent 繞著相框中心轉 deg 度（快速） */
                    var c = centerClient(), rad = 120, a0 = 0, n = Math.max(1, Math.ceil(Math.abs(deg) / 8));
                    function at(a) { var t = a * Math.PI / 180; return { clientX: c.x + rad * Math.cos(t), clientY: c.y + rad * Math.sin(t) }; }
                    var p = at(a0);
                    field.dispatchEvent(new PointerEvent('pointerdown', { clientX: p.clientX, clientY: p.clientY, bubbles: true, cancelable: true, pointerId: 21 }));
                    for (var i = 1; i <= n; i++) { var q = at(a0 + deg * i / n); field.dispatchEvent(new PointerEvent('pointermove', { clientX: q.clientX, clientY: q.clientY, bubbles: true, cancelable: true, pointerId: 21 })); }
                    field.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 21 }));
                    return theta;
                }
            };
            my.after(300, startRound);
        }

        round();
    }

    var G = {
        id: ID,
        name: '掛畫',
        rule: '把相框轉到剛好水平。牆上沒有水平或垂直的線，畫框顏色又和牆很像，只能靠眼睛判斷。手指繞著相框轉，慢慢轉可以微調，也可以按 ◀ ▶。最後看差了幾度！',
        mount: mount,
        test: { norm180: norm180, errDeg: errDeg, contrast: contrast, devMax: devMax, gainFor: gainFor, angDelta: angDelta, zoomPlan: zoomPlan, cornerDrop: cornerDrop, makeRound: makeRound, rating: rating, ROUNDS: ROUNDS, FRAME_W: FRAME_W }
    };
    Reaction.register(G);
})();

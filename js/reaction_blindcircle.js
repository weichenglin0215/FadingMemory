/* ═══════════════════════════════════════════════════════════════════
   reaction_blindcircle.js — 秒反應・盲畫一個圓
   畫面只有「圓心」與「起點」兩個記號，起點在圓心的右下方（右手畫的圓弧不容易被手遮住）。
   從起點出發，繞圓心畫一圈回到起點——畫的過程中看不到自己的筆跡。只有一次機會。
   V1.25（玩家意見）：起點的記號由橘色圓點改成「十字型的箭頭」（上下左右四個箭頭，總寬 ARROW 200 px，手指壓在中心，
   箭頭仍超出手指）；畫的過程中不再有藍色圓點；圓的半徑加大（R 180～215 px），起點跟著往外移，圓可以畫得更大。
   V1.27（玩家意見）：十字箭頭縮小成 75%（200 → 150 px）；手指拖曳時用 1px 黑色虛線顯示軌跡，但軌跡只留手指身後
   TRAIL_LEN（160 px）的長度，更早畫過的部分會自動消失，玩家看不到完整的筆跡（維持「盲畫」的難度）。
   ───────────────────────────────────────────────────────────────────
   · 目標圓：圓心 C、半徑 R ＝ |起點 − C|（R 每次隨機），起點方位在右下象限 ANG_MIN～ANG_MAX 度。
   · 取樣：每 STEP px 重新取樣（沿弧長等距），算每點到圓心的距離 r，與 R 比較。
   · 圓度 ＝ 100 − RMS(r − R) ÷ R × 100（%，越大越好）；繞行角度要在 TURN_MIN～TURN_MAX 度，否則
     「再畫一次」（不算一次機會）。
   · 揭曉：標準圓（綠色虛線）＋你的筆跡（依偏離量上色：±2% 綠、±5% 橘、更大紅）。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'blindcircle';
    var SCORE = { better: 'max', decimals: 4, format: '{v}%', label: '圓度', min: 0, max: 100 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var CENTER = { x: 236, y: 318 };        /* 圓心（舞台座標） */
    var R_MIN = 180, R_MAX = 215;           /* 半徑範圍（px）：盡量大，手機上才好畫 */
    var ARROW = 150;                        /* 起點十字箭頭的總寬、總高（px）（V1.27：200 → 150，縮小成 75%） */
    var TRAIL_LEN = 160;                    /* 拖曳時畫出的虛線軌跡長度（px）：只留手指身後這麼長，更早的筆跡自動消失 */
    var ANG_MIN = 20, ANG_MAX = 70;         /* 起點方位（從圓心往右下，度） */
    var START_R = 56;                       /* 手指要在起點多近的地方按下才算（px） */
    var STEP = 4;                           /* 重新取樣的弧長間距（px） */
    var TURN_MIN = 300, TURN_MAX = 450;     /* 有效的繞行總角度（度） */
    var LEN_MIN = 200;                      /* 有效的筆畫長度下限（px） */
    var GOOD = 0.02, OK = 0.05;             /* 揭曉上色門檻（相對半徑） */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function makeRound(rand) {
        rand = rand || Math.random;
        var R = kit.randFloat(R_MIN, R_MAX, rand), ang = kit.randFloat(ANG_MIN, ANG_MAX, rand) * Math.PI / 180;
        return { R: R, ang: ang, start: { x: CENTER.x + R * Math.cos(ang), y: CENTER.y + R * Math.sin(ang) } };
    }
    /* 十字型箭頭（上下左右四個箭頭）的多邊形頂點，中心在 (0,0)，總寬 size：
       每個箭頭的頭長 ＝ 0.19 × size、頭半寬 ＝ 0.12 × size，桿半寬 ＝ 0.04 × size */
    function arrowPoints(size) {
        var a = size / 2, hl = size * 0.19, hw = size * 0.12, sw = size * 0.04, b = a - hl;
        var pts = [[0, -a], [hw, -b], [sw, -b], [sw, -sw], [b, -sw], [b, -hw], [a, 0], [b, hw], [b, sw], [sw, sw], [sw, b], [hw, b],
            [0, a], [-hw, b], [-sw, b], [-sw, sw], [-b, sw], [-b, hw], [-a, 0], [-b, -hw], [-b, -sw], [-sw, -sw], [-sw, -b], [-hw, -b]];
        return pts;
    }
    /* 折線最後面 maxLen（px）長的那一段：從最新的點往回數，累積長度超過 maxLen 的那一段線段只留一部分（剛好湊滿 maxLen） */
    function tailOf(pts, maxLen) {
        if (!pts.length) return [];
        var out = [pts[pts.length - 1]], acc = 0;
        for (var i = pts.length - 2; i >= 0; i--) {
            var a = pts[i], b = pts[i + 1], dx = a.x - b.x, dy = a.y - b.y, d = Math.sqrt(dx * dx + dy * dy);
            if (acc + d >= maxLen) {
                var t = d > 0 ? (maxLen - acc) / d : 0;
                out.push({ x: b.x + dx * t, y: b.y + dy * t });
                break;
            }
            acc += d; out.push(a);
        }
        return out.reverse();
    }
    /* 沿折線每隔 step 重新取樣（弧長等距），回傳點陣列 */
    function resample(pts, step) {
        var out = [pts[0]], acc = 0, prev = pts[0];
        for (var i = 1; i < pts.length; i++) {
            var p = pts[i], dx = p.x - prev.x, dy = p.y - prev.y, d = Math.sqrt(dx * dx + dy * dy);
            while (acc + d >= step && d > 0) {
                var t = (step - acc) / d;
                prev = { x: prev.x + dx * t, y: prev.y + dy * t };
                out.push(prev);
                dx = p.x - prev.x; dy = p.y - prev.y; d = Math.sqrt(dx * dx + dy * dy); acc = 0;
            }
            acc += d; prev = p;
        }
        return out;
    }
    function lengthOf(pts) {
        var s = 0;
        for (var i = 1; i < pts.length; i++) { var dx = pts[i].x - pts[i - 1].x, dy = pts[i].y - pts[i - 1].y; s += Math.sqrt(dx * dx + dy * dy); }
        return s;
    }
    /* 分析筆跡：turn 繞圓心轉過的總角度（度，有號）、rms 相對半徑的均方根偏離、meanR 平均半徑、gap 首尾間距 */
    function analyze(pts, C, R) {
        var rs = resample(pts, STEP);
        if (rs.length < 3) return { valid: false, turn: 0, len: lengthOf(pts) };
        var turn = 0, prevA = Math.atan2(rs[0].y - C.y, rs[0].x - C.x), sum2 = 0, sumR = 0, devs = [];
        for (var i = 0; i < rs.length; i++) {
            var a = Math.atan2(rs[i].y - C.y, rs[i].x - C.x), r = Math.sqrt(Math.pow(rs[i].x - C.x, 2) + Math.pow(rs[i].y - C.y, 2));
            var da = a - prevA; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
            if (i > 0) turn += da;
            prevA = a; sum2 += (r - R) * (r - R); sumR += r; devs.push((r - R) / R);
        }
        var turnDeg = turn * 180 / Math.PI, len = lengthOf(pts);
        var rms = Math.sqrt(sum2 / rs.length);
        var gap = Math.sqrt(Math.pow(rs[0].x - rs[rs.length - 1].x, 2) + Math.pow(rs[0].y - rs[rs.length - 1].y, 2));
        return {
            valid: Math.abs(turnDeg) >= TURN_MIN && Math.abs(turnDeg) <= TURN_MAX && len >= LEN_MIN,
            turn: turnDeg, len: len, rms: rms, meanR: sumR / rs.length, gap: gap, devs: devs, samples: rs,
            roundness: Math.max(0, 100 - rms / R * 100)
        };
    }
    function rating(v) {
        if (v >= 99) return '神乎其技！';
        if (v >= 97) return '高手！';
        if (v >= 94) return '很圓！';
        if (v >= 90) return '不錯喔！';
        return '再試一次，會更圓！';
    }

    function mount(root, ctx) {
        kit.single(root, ctx, {
            id: ID, G: G, better: 'max', max: SCORE.max,
            title: '從起點出發，繞圓心畫一圈回到起點（筆跡會消失）',
            numText: function (v) { return v.toFixed(4) + '%'; },
            rating: rating,
            sfx: function (v) { return v >= 97 ? 'perfect' : (v >= 90 ? 'win' : 'fail'); },
            setup: setup
        });
    }

    function setup(api) {
        var stage = api.stage, my = api.my;
        var W = stage.clientWidth || 472, H = stage.clientHeight || 640;
        var cfg = makeRound(), pts = [], drawing = false, locked = false, hint = null, pid = null;
        console.log('[盲畫一個圓] 半徑 ' + cfg.R.toFixed(2) + '，起點方位 ' + (cfg.ang * 180 / Math.PI).toFixed(1) + '°');

        var svg = kit.svg('svg', { 'class': 'bc-svg', viewBox: '0 0 ' + W + ' ' + H, width: W, height: H }, stage);
        var gRev = kit.svg('g', {}, svg);
        /* 圓心十字與起點 */
        var cx = CENTER.x, cy = CENTER.y;
        kit.svg('line', { x1: cx - 16, x2: cx + 16, y1: cy, y2: cy, 'class': 'bc-cross' }, svg);
        kit.svg('line', { x1: cx, x2: cx, y1: cy - 16, y2: cy + 16, 'class': 'bc-cross' }, svg);
        /* 起點：十字型的箭頭（150px），中心是真正的起點，再加一個小黑點標出正中心 */
        var dot = kit.svg('polygon', { points: arrowPoints(ARROW).map(function (p) { return (cfg.start.x + p[0]).toFixed(1) + ',' + (cfg.start.y + p[1]).toFixed(1); }).join(' '), 'class': 'bc-start' }, svg);
        kit.svg('circle', { cx: cfg.start.x, cy: cfg.start.y, r: 4, 'class': 'bc-startdot' }, svg);
        var trail = kit.svg('polyline', { 'class': 'bc-trail', points: '' }, svg);          /* 手指身後 160px 的黑色虛線軌跡 */
        var msg = h('div', { 'class': 'bc-msg' });
        stage.appendChild(msg);
        function paintTrail() {
            trail.setAttribute('points', tailOf(pts, TRAIL_LEN).map(function (p) { return p.x.toFixed(1) + ',' + p.y.toFixed(1); }).join(' '));
        }

        /* 操作提示（只在第一次進遊戲時）：手指＋箭頭，從起點出發，沿著圓的切線方向（順時針）重複移動 */
        var tx = -Math.sin(cfg.ang), ty = Math.cos(cfg.ang);
        if (kit.once('blindcircle.hint')) hint = kit.fingerHint(stage, { mode: 'drag', x: cfg.start.x, y: cfg.start.y, dx: tx * 80, dy: ty * 80, delay: 300, text: '請繞著圓心畫一圈' });
        function hideHint() { if (hint) { hint.remove(); hint = null; } }
        function say(t) { msg.textContent = t; msg.classList.toggle('bc-msg--on', !!t); }

        function loc(e) { return kit.localPt(e, stage); }
        stage.addEventListener('pointerdown', function (e) {
            if (locked || drawing) return;
            var p = loc(e), dx = p.x - cfg.start.x, dy = p.y - cfg.start.y;
            if (Math.sqrt(dx * dx + dy * dy) > START_R) { dot.classList.add('bc-start--blink'); my.after(500, function () { dot.classList.remove('bc-start--blink'); }); say('請從起點的圓點開始畫'); return; }
            e.preventDefault();
            try { stage.setPointerCapture(e.pointerId); } catch (err) { }
            drawing = true; pid = e.pointerId; pts = [p]; hideHint(); say(''); paintTrail();
        });
        stage.addEventListener('pointermove', function (e) {
            if (!drawing || e.pointerId !== pid) return;
            pts.push(loc(e));                                          /* 只畫手指身後 TRAIL_LEN 長的虛線，前面的筆跡消失（盲畫） */
            paintTrail();
        });
        function end(e) {
            if (!drawing || e.pointerId !== pid) return;
            drawing = false; trail.setAttribute('points', '');
            var res = analyze(pts, CENTER, cfg.R);
            if (!res.valid) {
                say(Math.abs(res.turn) < TURN_MIN ? '要繞圓心畫完整一圈，再畫一次' : (res.len < LEN_MIN ? '再畫大一點，再畫一次' : '畫太多圈了，再畫一次'));
                pts = []; Sfx.play('bad');
                return;
            }
            submit(res);
        }
        stage.addEventListener('pointerup', end);
        stage.addEventListener('pointercancel', end);

        function submit(res) {
            if (locked) return;
            locked = true; hideHint();
            Sfx.play('click');
            /* 揭曉：標準圓＋依偏離上色的筆跡 */
            kit.svg('circle', { cx: cx, cy: cy, r: cfg.R, 'class': 'bc-ref' }, gRev);
            var s = res.samples;
            for (var i = 1; i < s.length; i++) {
                var d = Math.abs(res.devs[i]);
                kit.svg('line', { x1: s[i - 1].x, y1: s[i - 1].y, x2: s[i].x, y2: s[i].y, 'class': 'bc-seg ' + (d <= GOOD ? 'bc-seg--g' : (d <= OK ? 'bc-seg--o' : 'bc-seg--r')) }, gRev);
            }
            var more = res.meanR - cfg.R;
            say('平均半徑' + (more >= 0 ? '偏大 ' : '偏小 ') + Math.abs(more).toFixed(4) + ' 像素　首尾間距 ' + res.gap.toFixed(4) + ' 像素');
            my.after(2300, function () {
                api.finish(res.roundness, { lines: [
                    '平均半徑' + (more >= 0 ? '偏大 ' : '偏小 ') + Math.abs(more).toFixed(4) + ' 像素',
                    '首尾沒接上的缺口 ' + res.gap.toFixed(4) + ' 像素',
                    '只有一次機會，想拚更圓就再挑戰一次'
                ] });
            });
        }

        /* 驗證用：用真的 PointerEvent 畫一圈（noise＝半徑的隨機抖動比例；scale＝整圈半徑倍率） */
        function fire(type, x, y) {
            var r = stage.getBoundingClientRect(), sc = r.width / (stage.clientWidth || r.width);
            stage.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 9, clientX: r.left + x * sc, clientY: r.top + y * sc }));
        }
        function drawCircle(noise, scale, turns) {
            var R = cfg.R * (scale || 1), n = 90, t = turns || 1;
            fire('pointerdown', cfg.start.x, cfg.start.y);
            for (var i = 1; i <= n; i++) {
                var a = cfg.ang + 2 * Math.PI * t * i / n, rr = R * (1 + (noise || 0) * (Math.random() * 2 - 1));
                fire('pointermove', CENTER.x + rr * Math.cos(a), CENTER.y + rr * Math.sin(a));
            }
            fire('pointerup', cfg.start.x, cfg.start.y);
        }
        G.debug = {
            state: function () { return { cfg: cfg, locked: locked, n: pts.length }; },
            draw: drawCircle,
            solve: function () { drawCircle(0, 1, 1); },
            wrong: function () { drawCircle(0.08, 0.8, 1); }
        };
    }

    var G = {
        id: ID,
        name: '盲畫一個圓',
        rule: '畫面上只有圓心的十字和右下方的起點。手指按住起點，**繞著圓心畫一圈回到起點**。**只看得到身後一小段虛線**，畫過的筆跡會消失！只有一次機會，放開手指後會告訴你圓度，目標是 100.0000%。',
        mount: mount,
        score: SCORE,
        test: { tailOf: tailOf, TRAIL_LEN: TRAIL_LEN, arrowPoints: arrowPoints, ARROW: ARROW, START_R: START_R, makeRound: makeRound, resample: resample, analyze: analyze, rating: rating, CENTER: CENTER, R_MIN: R_MIN, R_MAX: R_MAX, ANG_MIN: ANG_MIN, ANG_MAX: ANG_MAX, TURN_MIN: TURN_MIN, TURN_MAX: TURN_MAX, STEP: STEP }
    };
    Reaction.register(G);
})();

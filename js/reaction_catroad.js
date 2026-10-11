/* ═══════════════════════════════════════════════════════════════════
   reaction_catroad.js — 秒反應・貓咪走山路（原企劃「016 電流急急棒」的復活版）
   一隻貓咪走在寬窄不一、彎彎曲曲的山路上，兩側是斷崖與岩漿，掉下去就結束。
   貓咪的上下位置固定在畫面下方三分之一，下方的橫桿可以左右拖曳決定貓咪的位置；
   山路會一直往下捲動（看起來就像貓咪一直往前走）。成績＝撐了幾秒（越久越好）。
   ───────────────────────────────────────────────────────────────────
   【難度（隨「撐過的秒數」線性變難，到 T_RAMP 秒到頂）】
   · 捲動速度 SPEED：110 → 340 px／秒；
   · 山路半寬 HW：104 → 36 px（路越來越窄），而且寬度會忽寬忽窄（變化幅度 WVAR 0.08 → 0.30）；
   · 彎曲程度 SLOPE：路的中心線橫向斜率上限 0.25 → 0.95，每一段直線的長度 SEG 300 → 120 px（轉彎越來越密）。
   · 前 GRACE_S 秒是一段筆直的寬路，讓玩家先抓到手感。
   【怎麼做的】山路是一串「每 STEP px 一個取樣點」（中心 c、半寬 hw）；捲動到哪、取樣點就往前補到哪，
   補的時候用「當時的難度」決定下一點的斜率與寬度，所以一個計時器就能決定整條路的難度。
   貓咪的橫向位置＝橫桿旋鈕的位置（1：1），不做任何延遲；判定＝貓咪中心離山路中心線超過半寬。
   測試（t_catroad.js）有一個「完美機器人」：用有限的橫向速度跟著中心線走，證明最難的設定下仍然走得過去。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'catroad';
    var SCORE = { better: 'max', decimals: 4, format: '{v} 秒', label: '撐過時間', min: 1, max: 600 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var T_RAMP = 90;                    /* 難度升到頂要幾秒 */
    var SPEED = [110, 340];             /* 山路往下捲動的速度（px／秒） */
    var HW = [104, 36];                 /* 山路的半寬（px） */
    var SLOPE = [0.25, 0.95];           /* 中心線橫向斜率上限（橫向 px ／ 前進 px） */
    var SEG = [300, 120];               /* 一段直線大約多長（前進 px） */
    var WVAR = [0.08, 0.30];            /* 寬度忽寬忽窄的幅度（±比例） */
    var GRACE_S = 2.5;                  /* 一開始筆直寬路的秒數 */
    var STEP = 6;                       /* 山路取樣點的間距（前進 px） */
    var CAT_R = 15;                     /* 貓咪半徑（畫面） */
    var EDGE_PAD = 20;                  /* 山路離畫面左右邊緣至少多遠 */
    var CAT_Y = 0.7;                    /* 貓咪在山路畫面的垂直位置（從上算的比例；0.7＝下方三分之一的上緣附近） */
    var BAR_H = 78;                     /* 橫桿區高度 */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function prog(t) { return Math.min(1, Math.max(0, t / T_RAMP)); }
    function lerp(a, b, p) { return a + (b - a) * p; }
    /* 第 t 秒的難度 */
    function difficulty(t) {
        var p = prog(t);
        return { speed: lerp(SPEED[0], SPEED[1], p), hw: lerp(HW[0], HW[1], p), slope: lerp(SLOPE[0], SLOPE[1], p), seg: lerp(SEG[0], SEG[1], p), wvar: lerp(WVAR[0], WVAR[1], p), p: p };
    }
    /* 新的一條山路：W＝畫面寬；rand＝亂數函式 */
    function newRoad(W, rand) {
        var d = difficulty(0);
        return { W: W, rand: rand || Math.random, pts: [{ c: W / 2, hw: d.hw }], c: W / 2, slope: 0, tslope: 0, segLeft: 0, n: 0, hwBase: d.hw, wn: 0 };
    }
    /* 把山路補到前進距離 sTarget（px）：補的每一點用「那一刻 t」的難度。回傳山路本身 */
    function extendRoad(road, sTarget, t) {
        var rand = road.rand, W = road.W;
        while ((road.pts.length - 1) * STEP < sTarget) {
            var s = road.pts.length * STEP, tt = t;
            var d = difficulty(tt);
            if (tt < GRACE_S * 1 && s < 360) {                       /* 一開始筆直的寬路（以前進距離大約 360px 為限） */
                road.pts.push({ c: W / 2, hw: HW[0] });
                continue;
            }
            if (road.segLeft <= 0) {
                road.tslope = kit.randFloat(-d.slope, d.slope, rand);
                road.segLeft = d.seg * kit.randFloat(0.7, 1.3, rand);
            }
            road.segLeft -= STEP;
            /* 斜率慢慢追上目標（每點最多改 0.06，轉彎不會是突然的折角） */
            var diff = road.tslope - road.slope;
            road.slope += Math.max(-0.06, Math.min(0.06, diff));
            road.slope = Math.max(-d.slope, Math.min(d.slope, road.slope));
            /* 半寬：基準隨難度變窄，再乘一個忽寬忽窄的雜訊（慢慢漂動） */
            road.wn = Math.max(-1, Math.min(1, road.wn + kit.randFloat(-0.12, 0.12, rand)));
            var hw = Math.max(d.hw * (1 - d.wvar), d.hw * (1 + d.wvar * road.wn));
            hw = Math.max(HW[1] * 0.7, hw);
            var lo = hw + EDGE_PAD, hi = W - hw - EDGE_PAD;
            road.c += road.slope * STEP;
            if (road.c < lo) { road.c = lo; road.slope = Math.abs(road.slope); road.tslope = Math.abs(road.tslope); }
            if (road.c > hi) { road.c = hi; road.slope = -Math.abs(road.slope); road.tslope = -Math.abs(road.tslope); }
            road.pts.push({ c: road.c, hw: hw });
        }
        return road;
    }
    /* 前進距離 s 的山路：{ c 中心、hw 半寬 }（兩個取樣點之間線性內插） */
    function roadAt(road, s) {
        var f = Math.max(0, s) / STEP, i = Math.floor(f), u = f - i;
        var a = road.pts[Math.min(i, road.pts.length - 1)], b = road.pts[Math.min(i + 1, road.pts.length - 1)];
        return { c: a.c + (b.c - a.c) * u, hw: a.hw + (b.hw - a.hw) * u };
    }
    /* 貓咪在橫向位置 x 掉下去了嗎（中心離中心線超過半寬） */
    function fallen(road, s, x) { var r = roadAt(road, s); return Math.abs(x - r.c) > r.hw; }
    function rating(sec) {
        if (sec >= 90) return '山路之王！';
        if (sec >= 60) return '貓咪大師！';
        if (sec >= 30) return '走得真穩！';
        if (sec >= 15) return '不錯喔！';
        return '再試一次，路會越來越窄！';
    }

    function mount(root, ctx) {
        kit.single(root, ctx, {
            id: ID, G: G, better: 'max', max: SCORE.max,
            title: '拖曳下方橫桿，讓貓咪一直走在山路上，不要掉進岩漿',
            numText: function (v) { return v.toFixed(4) + ' 秒'; },
            rating: rating,
            sfx: function (v) { return v >= 30 ? 'perfect' : (v >= 15 ? 'win' : 'fail'); },
            stageClass: 'cr-stage',
            setup: setup
        });
    }

    function cssVar(name, fallback) {
        var v = window.getComputedStyle(document.documentElement).getPropertyValue(name);
        return (v && v.trim()) || fallback;
    }

    function setup(api) {
        var stage = api.stage, my = api.my;
        var W = stage.clientWidth || 472, H = stage.clientHeight || 640;
        var CH = H - BAR_H - 8;                                        /* 山路畫面高度 */
        var road = newRoad(W, api.rand), YC = Math.round(CH * CAT_Y);   /* 貓咪的畫面 y */
        var dpr = Math.min(2, window.devicePixelRatio || 1);
        var cv = h('canvas', { 'class': 'cr-canvas' });
        cv.width = Math.round(W * dpr); cv.height = Math.round(CH * dpr);
        cv.style.width = W + 'px'; cv.style.height = CH + 'px';
        stage.appendChild(cv);
        var g = cv.getContext('2d');
        g.scale(dpr, dpr);
        var timeEl = h('div', { 'class': 'cr-time', text: '0.0000 秒' });
        stage.appendChild(timeEl);

        /* 橫桿 */
        var bar = h('div', { 'class': 'cr-bar' }), knob = h('div', { 'class': 'cr-knob' });
        bar.appendChild(h('div', { 'class': 'cr-track' })); bar.appendChild(knob);
        bar.style.top = (CH + 8) + 'px'; bar.style.height = BAR_H + 'px';
        stage.appendChild(bar);
        var KR = 30, catX = W / 2, dragging = null, hint = null;
        function paintKnob() { knob.style.left = (catX - KR) + 'px'; }
        paintKnob();
        function setFromPointer(e) { var p = kit.localPt(e, bar); catX = kit.clamp(p.x, KR, W - KR); paintKnob(); }

        /* 顏色（從 css/theme.css 的變數讀，canvas 沒辦法直接用 var()） */
        var C = {
            lava1: cssVar('--cr-lava-1', '#D9421F'), lava2: cssVar('--cr-lava-2', '#F4A53A'), cliff: cssVar('--cr-cliff', '#5B4630'),
            road: cssVar('--cr-road', '#C9B58A'), edge: cssVar('--cr-road-edge', '#8A6F43'), cat: cssVar('--cr-cat', '#F3B24F'), ink: cssVar('--cr-cat-ink', '#4A3B1E')
        };
        /* 狀態 */
        var state = 'ready', t = 0, s = 0, last = null, tFall = 0, fallX = 0;
        extendRoad(road, CH + 200, 0);

        /* 畫一格：岩漿背景、山路、貓咪 */
        function draw(now) {
            /* 岩漿：直條漸層＋慢慢流動的亮帶 */
            var gr = g.createLinearGradient(0, 0, 0, CH);
            gr.addColorStop(0, C.lava1); gr.addColorStop(1, C.lava2);
            g.fillStyle = gr; g.fillRect(0, 0, W, CH);
            g.fillStyle = 'rgba(255,230,160,0.18)';
            var off = (s * 0.6) % 90;
            for (var by = -90; by < CH + 90; by += 90) g.fillRect(0, by + off, W, 14);
            /* 山路：左邊緣往下、右邊緣往回，連成一個多邊形；畫面 y(s') ＝ YC − (s' − s) */
            var s0 = s - (CH - YC) - STEP, s1 = s + YC + STEP;
            extendRoad(road, s1 + STEP, t);
            var i0 = Math.max(0, Math.floor(s0 / STEP)), i1 = Math.min(road.pts.length - 1, Math.ceil(s1 / STEP));
            var i;
            g.beginPath();
            for (i = i0; i <= i1; i++) { var p = road.pts[i]; g.lineTo(p.c - p.hw, YC - (i * STEP - s)); }
            for (i = i1; i >= i0; i--) { var q = road.pts[i]; g.lineTo(q.c + q.hw, YC - (i * STEP - s)); }
            g.closePath();
            g.fillStyle = C.road; g.fill();
            g.lineWidth = 6; g.strokeStyle = C.cliff; g.lineJoin = 'round';
            g.beginPath(); for (i = i0; i <= i1; i++) { var pa = road.pts[i]; g.lineTo(pa.c - pa.hw, YC - (i * STEP - s)); } g.stroke();
            g.beginPath(); for (i = i0; i <= i1; i++) { var pb = road.pts[i]; g.lineTo(pb.c + pb.hw, YC - (i * STEP - s)); } g.stroke();
            /* 路面中線（虛線，隨捲動流動） */
            g.lineWidth = 3; g.strokeStyle = C.edge; g.setLineDash([14, 18]); g.lineDashOffset = -(s % 32);
            g.beginPath(); for (i = i0; i <= i1; i++) { var pc = road.pts[i]; g.lineTo(pc.c, YC - (i * STEP - s)); } g.stroke();
            g.setLineDash([]);
            /* 貓咪 */
            drawCat(state === 'fall' ? fallX : catX, state === 'fall' ? YC + tFall * 60 : YC, state === 'fall' ? Math.max(0.2, 1 - tFall * 1.2) : 1);
        }
        function drawCat(x, y, k) {
            g.save(); g.translate(x, y); g.scale(k, k);
            g.fillStyle = C.cat; g.strokeStyle = C.ink; g.lineWidth = 3;
            g.beginPath(); g.moveTo(-CAT_R + 2, -CAT_R + 6); g.lineTo(-CAT_R + 4, -CAT_R - 10); g.lineTo(-4, -CAT_R + 1); g.closePath(); g.fill(); g.stroke();
            g.beginPath(); g.moveTo(CAT_R - 2, -CAT_R + 6); g.lineTo(CAT_R - 4, -CAT_R - 10); g.lineTo(4, -CAT_R + 1); g.closePath(); g.fill(); g.stroke();
            g.beginPath(); g.arc(0, 0, CAT_R, 0, Math.PI * 2); g.fill(); g.stroke();
            g.fillStyle = C.ink;
            g.beginPath(); g.arc(-5, -2, 2.4, 0, Math.PI * 2); g.fill();
            g.beginPath(); g.arc(5, -2, 2.4, 0, Math.PI * 2); g.fill();
            g.lineWidth = 1.5; g.beginPath(); g.moveTo(-3, 4); g.lineTo(0, 6); g.lineTo(3, 4); g.stroke();
            g.restore();
        }

        /* 一步：用時間差推進；rAF 與備援計時器都會呼叫它（用時間差算，重複呼叫不會多走） */
        function step(now) {
            if (state !== 'run' && state !== 'fall') return;
            var dt = last == null ? 0 : Math.min(60, now - last);
            last = now;
            if (state === 'fall') {
                tFall += dt / 1000;
                draw(now);
                if (tFall >= 0.7) { state = 'done'; finish(); }
                return;
            }
            var d = difficulty(t);
            t += dt / 1000; s += d.speed * dt / 1000;
            timeEl.textContent = t.toFixed(4) + ' 秒';
            if (fallen(road, s, catX)) {
                state = 'fall'; tFall = 0; fallX = catX; Sfx.play('bad');
                timeEl.classList.add('cr-time--dead');
            }
            draw(now);
        }
        function finish() {
            api.finish(t, { lines: ['路寬走到 ' + (difficulty(t).hw * 2).toFixed(0) + ' px、速度 ' + difficulty(t).speed.toFixed(0) + ' px／秒', '掉進岩漿前一共走了 ' + Math.round(s) + ' px'] });
        }
        draw(0);

        /* 橫桿輸入 */
        bar.addEventListener('pointerdown', function (e) {
            if (dragging != null || state === 'fall' || state === 'done') return;
            e.preventDefault();
            try { bar.setPointerCapture(e.pointerId); } catch (err) { }
            dragging = e.pointerId; if (hint) { hint.remove(); hint = null; }
            setFromPointer(e);
        });
        bar.addEventListener('pointermove', function (e) { if (dragging === e.pointerId && state !== 'done') setFromPointer(e); });
        function endDrag(e) { if (dragging === e.pointerId) dragging = null; }
        bar.addEventListener('pointerup', endDrag); bar.addEventListener('pointercancel', endDrag);

        /* 開始：蓋一層「出發」遮罩（kit.startCover），按下才開始跑 */
        var cover = kit.startCover(stage, {
            text: '拖曳下方橫桿，讓貓咪一直走在山路上。\n山路會越來越窄、越來越彎、越來越快，\n掉進岩漿就結束，看你能撐幾秒！', btn: '出發',
            onStart: function () {
                state = 'run'; last = null; t = 0; s = 0;
                my.loop(function (now) { if (state === 'done') return false; step(now); });
                /* rAF 被暫停（分頁在背景）時每 40 毫秒補算一次 */
                (function again() { my.after(40, function () { if (state === 'run' || state === 'fall') { step(performance.now()); again(); } }); })();
                /* 操作提示（只在第一次進遊戲時）：手指＋箭頭，沿著橫桿左右移動 */
                if (kit.once('catroad.hint')) hint = kit.fingerHint(stage, { mode: 'drag', x: catX, y: CH + 8 + BAR_H / 2, dx: 110, dy: 0, text: '請往左右拖曳' });
            }
        });

        /* 驗證用：solve＝讓貓咪跟著中心線「走」到指定秒數（機器人，橫向速度不限）再結束；wrong＝直接把貓咪移出山路 */
        function startNow() { if (state === 'ready') { cover.remove(); state = 'run'; last = null; t = 0; s = 0; } }
        G.debug = {
            state: function () { return { state: state, t: t, s: s, catX: catX }; },
            solve: function () {
                startNow();
                var target = 12, k = 0, now = performance.now();
                while (k++ < 2000 && state === 'run' && t < target) { now += 16; catX = kit.clamp(roadAt(road, s).c, KR, W - KR); step(now); }
                if (state === 'run') { state = 'fall'; tFall = 0.7; fallX = catX; step(now + 16); }
            },
            wrong: function () {
                startNow();
                catX = roadAt(road, s).c > W / 2 ? KR : W - KR;
                var k = 0, now = performance.now();
                while (k++ < 400 && state === 'run') { now += 16; step(now); }
                if (state === 'fall') { tFall = 0.7; step(now + 16); }
            }
        };
    }

    var G = {
        id: ID,
        name: '貓咪走山路',
        rule: '貓咪走在彎曲的山路上，兩側是斷崖和岩漿。**拖曳下方的橫桿讓貓咪左右移動**，一直留在路上，**掉進岩漿就結束**。山路會越來越窄、越來越彎、越來越快，成績是你撐了幾秒（秒數越多越好）。',
        mount: mount,
        score: SCORE,
        test: {
            prog: prog, difficulty: difficulty, newRoad: newRoad, extendRoad: extendRoad, roadAt: roadAt, fallen: fallen,
            T_RAMP: T_RAMP, SPEED: SPEED, HW: HW, SLOPE: SLOPE, SEG: SEG, WVAR: WVAR, STEP: STEP, EDGE_PAD: EDGE_PAD, GRACE_S: GRACE_S
        }
    };
    Reaction.register(G);
})();

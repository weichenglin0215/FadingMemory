/* ═══════════════════════════════════════════════════════════════════
   reaction_pinwheel.js — 秒反應・轉風車（企劃 378「打蛋白」的換主題版）
   使用者很喜歡「在螢幕上持續快速畫圈圈」的玩法，但打蛋白很難明確分出過關，所以換成「轉風車」——**過關條件一眼就看得出來**：
   **手指繞著風車快快畫圈，風車就會跟著轉；要讓風車的轉速停在「綠色範圍」裡，連續撐滿指定的秒數**。
   速度表上有一條綠色的範圍、右邊有紅色的危險區：轉太慢進度會倒退，轉太快（衝進紅色區太久）風車就壞掉了。
   ───────────────────────────────────────────────────────────────────
   · 手指的轉速（angularRate）：用手指在風車周圍的「角度變化」算——每兩個相鄰的觸控點，相對風車中心的角度差（取 −180°～180°，避免跨過 ±180° 的跳躍），
     加總最近 RATE_WINDOW 秒的角度差 ÷ 窗口時間 ＝ 每秒轉幾圈（不分順時針、逆時針）。手指離風車中心太近（< R_MIN）的點不算。手指放開或停住，轉速就是 0。
   · 風車的轉速（stepWheel）：有慣性——風車轉速 ω 往「手指轉速 ω_in」靠近（時間常數 TAU 秒），再加上一陣一陣的陣風 g(t)（讓轉速自己飄，要一直微調）：
         dω/dt ＝ (ω_in − ω) ÷ TAU ＋ g(t)；g(t) 是兩個不同頻率正弦波的組合（gustAt），振幅隨關卡增加。
   · 過關的進度（progressStep）：轉速在綠色範圍 [lo, hi] 裡，進度每秒增加 1／HOLD_S；不在範圍裡，每秒倒退 DECAY／HOLD_S；進度滿了就過關。
     轉速超過 breakLine（hi 的 BREAK_RATIO 倍）累積超過 BREAK_S 秒 → 風車壞了（失敗）；時間到進度還沒滿 → 失敗。
   · 難度（線性，到 RAMP_LEVELS 關到頂）：綠色範圍的中心 1.2 → 3.6 圈／秒、範圍的半寬（占中心的比例）0.35 → 0.12、要撐的秒數 2 → 4、陣風的強度 0 → 1.2 圈／秒²、限時 20 → 15 秒。
   · 揭曉：失敗時畫出「風車轉速隨時間變化」的折線圖，疊上綠色範圍和紅線，標出什麼時候超出去、什麼時候進度沒了。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'pinwheel';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 60 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 24;                       /* 幾關之後難度到頂 */
    var CENTER = [3.0, 6.0];                    /* 綠色範圍的中心轉速（圈／秒）：第 1 關 → 到頂 */
    var HALF_BAND = [0.33, 0.1];               /* 綠色範圍的半寬（占中心轉速的比例）：第 1 關 → 到頂（越小越難） */
    var HOLD_S = [5, 30];                        /* 要在綠色範圍裡撐幾秒（進度滿）：第 1 關 → 到頂 */
    var GUST = [0, 1.2];                        /* 陣風的強度（圈／秒²）：第 1 關 → 到頂 */
    var LIMIT_S = [20, 60];                     /* 限時（秒）：第 1 關 → 到頂 */
    var TAU = 0.35;                             /* 風車的慣性：轉速追上手指轉速的時間常數（秒） */
    var DECAY = 1.0;                            /* 不在綠色範圍時，進度倒退的速度（相對於增加的速度的倍數） */
    var BREAK_RATIO = 1.5;                      /* 轉速超過「綠色範圍上緣 × 這個數」就進入危險區（紅色） */
    var BREAK_S = 0.7;                          /* 在危險區累積超過幾秒，風車就壞了 */
    var RATE_WINDOW = 0.3;                      /* 算手指轉速時看最近幾秒 */
    var R_MIN = 36;                             /* 手指離風車中心至少多遠（px）才算畫圈 */
    var SPEED_MAX_RATIO = 2.2;                  /* 速度表的最大刻度＝中心轉速 × 這個數 */
    var SAMPLE_S = 0.05;                        /* 紀錄轉速折線圖的取樣間隔（秒） */
    var MAX_LEVEL = 60;

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function ramp(level, pair) { return kit.ramp(level, pair[0], pair[1], RAMP_LEVELS); }
    function centerFor(level) { return Math.round(ramp(level, CENTER) * 1000) / 1000; }
    function halfBandFor(level) { return Math.round(ramp(level, HALF_BAND) * 1000) / 1000; }
    function holdFor(level) { return Math.round(ramp(level, HOLD_S) * 1000) / 1000; }
    function gustFor(level) { return Math.round(ramp(level, GUST) * 1000) / 1000; }
    function limitFor(level) { return Math.round(ramp(level, LIMIT_S) * 1000) / 1000; }
    /* 一關：{ level, center, half, lo, hi（綠色範圍）, breakLine, hold, limit, gust（{ A, f1, f2, p1, p2 }）, maxSpeed } */
    function makeLevel(level, rand) {
        rand = rand || Math.random;
        var c = centerFor(level), hb = halfBandFor(level), lo = c * (1 - hb), hi = c * (1 + hb);
        return {
            level: level, center: c, half: hb, lo: Math.round(lo * 1000) / 1000, hi: Math.round(hi * 1000) / 1000, breakLine: Math.round(hi * BREAK_RATIO * 1000) / 1000, hold: holdFor(level), limit: limitFor(level),
            gust: { A: gustFor(level), f1: Math.round(kit.randFloat(0.35, 0.6, rand) * 1000) / 1000, f2: Math.round(kit.randFloat(0.9, 1.5, rand) * 1000) / 1000, p1: Math.round(kit.randFloat(0, 6.28, rand) * 1000) / 1000, p2: Math.round(kit.randFloat(0, 6.28, rand) * 1000) / 1000 }, maxSpeed: Math.round(c * SPEED_MAX_RATIO * 100) / 100
        };
    }
    /* 陣風：t 秒時對風車轉速的加速度（圈／秒²） */
    function gustAt(g, t) { return g.A * (0.6 * Math.sin(6.2832 * g.f1 * t + g.p1) + 0.4 * Math.sin(6.2832 * g.f2 * t + g.p2)); }
    /* 手指的轉速（圈／秒）：samples ＝ [{ t（秒）, x, y }]（相對風車中心的座標），now ＝ 現在的時間；只看最近 window 秒；離中心太近的點不算 */
    function angularRate(samples, now, win, rmin) {
        win = win == null ? RATE_WINDOW : win; rmin = rmin == null ? R_MIN : rmin;
        var prev = null, tot = 0;
        for (var i = 0; i < samples.length; i++) {
            var s = samples[i]; if (s.t < now - win) continue;
            if (Math.hypot(s.x, s.y) < rmin) { prev = null; continue; }
            var a = Math.atan2(s.y, s.x);
            if (prev != null) { var d = a - prev; if (d > Math.PI) d -= 2 * Math.PI; else if (d < -Math.PI) d += 2 * Math.PI; tot += d; }
            prev = a;
        }
        return Math.abs(tot) / (2 * Math.PI) / win;
    }
    /* 風車轉速往前走 dt 秒：ω' ＝ (ωin − ω)/TAU ＋ 陣風加速度；轉速不會是負的 */
    function stepWheel(w, wIn, dt, gAcc, tau) { tau = tau == null ? TAU : tau; return Math.max(0, w + ((wIn - w) / tau + gAcc) * dt); }
    /* 進度往前走 dt 秒：在綠色範圍裡增加、不在就倒退，夾在 0～1 */
    function progressStep(p, inBand, dt, hold) { return Math.max(0, Math.min(1, p + (inBand ? dt / hold : -DECAY * dt / hold))); }
    /* 在危險區的累積時間往前走 dt：在危險區就增加；回到安全區慢慢減少（減得比增加慢，一碰就記） */
    function breakStep(b, inDanger, dt) { return inDanger ? b + dt : Math.max(0, b - dt * 0.5); }
    function inBand(q, w) { return w >= q.lo && w <= q.hi; }
    /* 純模擬：給一個「手指轉速控制器」controller(t, w, q) → ωin（圈／秒），以 dt 往前走，回傳 { result: 'pass'｜'time'｜'break', t, progress, trace } */
    function simulate(q, controller, dt, tAdd) {
        dt = dt || 0.01; var w = 0, p = 0, b = 0, t = 0, trace = [];
        while (t < q.limit) {
            var win = controller(t, w, q); w = stepWheel(w, win, dt, gustAt(q.gust, t)); t += dt;
            p = progressStep(p, inBand(q, w), dt, q.hold); b = breakStep(b, w > q.breakLine, dt);
            trace.push(w);
            if (b >= BREAK_S) return { result: 'break', t: t, progress: p, trace: trace };
            if (p >= 1) return { result: 'pass', t: t, progress: p, trace: trace };
        }
        return { result: 'time', t: t, progress: p, trace: trace };
    }
    function whyText(kind, q) {
        if (kind === 'break') return '風車轉太快壞掉了！超過紅線 ' + q.breakLine.toFixed(4) + ' 圈／秒太久';
        if (kind === 'time') return '時間到了！風車沒有在 ' + q.lo.toFixed(4) + '～' + q.hi.toFixed(4) + ' 圈／秒裡撐滿 ' + q.hold.toFixed(4) + ' 秒';
        return '風車穩穩地轉了 ' + q.hold.toFixed(4) + ' 秒！';
    }
    function rating(n) {
        if (n >= 15) return '風車大師！';
        if (n >= 9) return '手速穩定！';
        if (n >= 5) return '不錯喔！';
        if (n >= 2) return '再接再厲！';
        return '繞著風車快快畫圈！';
    }

    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 5, stageClass: 'pwl-stage',
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['通過 ' + S.cleared + ' 關']; },
            setup: setup
        });
    }

    function setup(api) {
        var stage = api.stage, level = api.level;
        var q = makeLevel(level, api.rand);
        api.info = q;
        console.log('[轉風車] 第 ' + level + ' 關：綠色範圍 ' + q.lo + '～' + q.hi + ' 圈/秒（中心 ' + q.center + '、半寬 ' + (100 * q.half).toFixed(0) + '%）；撐 ' + q.hold + ' 秒；陣風 ' + q.gust.A + '；限時 ' + q.limit + ' 秒');

        var W = stage.clientWidth || 472, H = stage.clientHeight || 640;
        var cx = Math.round(W / 2), cy = Math.round(H * 0.50), RING = Math.min(200, Math.round(W * 0.4));
        var field = h('div', { 'class': 'pwl-field' });
        stage.appendChild(field);
        var tip = h('div', { 'class': 'qz-note pwl-tip', text: level === 1 ? '繞著風車畫圈，停在綠色範圍！' : '轉速停在綠色範圍，撐滿進度' });
        field.appendChild(tip);
        /* 速度表（橫條）：0～maxSpeed；綠色範圍、紅色危險區、目前轉速的指針 */
        var BW = W - 40, bar = h('div', { 'class': 'pwl-gauge' }); bar.style.cssText = 'left:20px;top:64px;width:' + BW + 'px;'; field.appendChild(bar);
        function X(v) { return Math.round(BW * Math.min(1, v / q.maxSpeed)); }
        var band = h('div', { 'class': 'pwl-band' }); band.style.cssText = 'left:' + X(q.lo) + 'px;width:' + (X(q.hi) - X(q.lo)) + 'px;'; bar.appendChild(band);
        var danger = h('div', { 'class': 'pwl-danger' }); danger.style.cssText = 'left:' + X(q.breakLine) + 'px;right:0;'; bar.appendChild(danger);
        var needle = h('div', { 'class': 'pwl-needle' }); bar.appendChild(needle);
        var lab = h('div', { 'class': 'pwl-gauge__lab', text: '綠色＝' + q.lo.toFixed(4) + '～' + q.hi.toFixed(4) + ' 圈／秒' }); lab.style.cssText = 'left:20px;top:100px;right:20px;'; field.appendChild(lab);
        /* 軌道圈（提示怎麼畫）、風車 */
        var svg = kit.svg('svg', { 'class': 'pwl-svg', width: W, height: H, viewBox: '0 0 ' + W + ' ' + H }, field);
        kit.svg('circle', { 'class': 'pwl-track', cx: cx, cy: cy, r: RING }, svg);
        var wheel = kit.svg('g', { 'class': 'pwl-wheel', transform: 'translate(' + cx + ',' + cy + ')' }, svg), blades = kit.svg('g', {}, wheel);
        for (var b = 0; b < 4; b++) { kit.svg('path', { 'class': 'pwl-blade pwl-blade' + b, d: 'M0,0 L-34,-8 Q-30,-62 0,-66 Z', transform: 'rotate(' + (b * 90) + ')' }, blades); }
        kit.svg('circle', { 'class': 'pwl-hub', cx: 0, cy: 0, r: 9 }, wheel);
        kit.svg('rect', { 'class': 'pwl-pole', x: cx - 5, y: cy + 8, width: 10, height: 120, rx: 4 }, svg);
        /* 進度條 */
        var prog = h('div', { 'class': 'pwl-prog' }), fill = h('div', { 'class': 'pwl-prog__fill' }); prog.appendChild(fill); prog.style.cssText = 'left:20px;right:20px;top:' + (cy + RING + 18) + 'px;'; field.appendChild(prog);
        var plab = h('div', { 'class': 'pwl-prog__lab', text: '在綠色範圍撐滿 ' + q.hold.toFixed(4) + ' 秒' }); plab.style.cssText = 'left:20px;right:20px;top:' + (cy + RING + 18 + 38) + 'px;'; field.appendChild(plab);
        var info = h('div', { 'class': 'qz-note pwl-info', text: '' }); info.style.cssText = 'top:' + (cy + RING + 18 + 76) + 'px;'; field.appendChild(info);
        if (level === 1 && kit.once('pinwheel.hint')) kit.hintOn(stage, null, { mode: 'hold', x: cx + RING * 0.7, y: cy - RING * 0.7, delay: 700, text: '繞著風車快快畫圈' });

        var phase = 'play', t0 = performance.now(), w = 0, p = 0, br = 0, ang = 0, samples = [], down = null, lastT = 0, wIn = 0, trace = [], nextSample = 0, override = null;
        function nowS() { return (performance.now() - t0) / 1000; }
        function frame(now) {
            var t = (now - t0) / 1000, dt = Math.min(0.05, t - lastT); lastT = t; if (dt <= 0) return;
            /* 手指轉速：放開、或最近沒有新的觸控點，就是 0 */
            wIn = override ? override(t, w) : (down ? angularRate(samples, t) : 0);
            w = stepWheel(w, wIn, dt, gustAt(q.gust, t));
            p = progressStep(p, inBand(q, w), dt, q.hold); br = breakStep(br, w > q.breakLine, dt);
            ang += w * 360 * dt; wheel.setAttribute('transform', 'translate(' + cx + ',' + cy + ') rotate(' + (ang % 360).toFixed(1) + ')');
            needle.style.left = X(w) + 'px'; needle.classList.toggle('pwl-needle--ok', inBand(q, w)); needle.classList.toggle('pwl-needle--bad', w > q.breakLine);
            fill.style.width = (100 * p).toFixed(1) + '%'; fill.classList.toggle('pwl-prog__fill--on', inBand(q, w)); band.classList.toggle('pwl-band--on', inBand(q, w));
            if (t >= nextSample) { trace.push([t, w]); nextSample += SAMPLE_S; }
            if (p >= 1) finish('pass'); else if (br >= BREAK_S) finish('break'); else if (t >= q.limit) finish('time');
        }
        api.my.loop(function (now) { if (phase !== 'play' || api.over || !stage.isConnected) return false; frame(now); });
        /* 保底：rAF 被暫停時，限時一到還是要結束 */
        api.after(Math.round(q.limit * 1000) + 400, function () { if (phase === 'play') finish('time'); });
        api.timer(Math.round(q.limit * 1000), function () { if (phase === 'play') finish('time'); });

        /* 手指：按住畫圈（pointerdown／move／up／cancel）；座標換成「相對風車中心」 */
        field.addEventListener('pointerdown', function (e) {
            if (phase !== 'play' || api.over || down) return;
            e.preventDefault(); try { field.setPointerCapture(e.pointerId); } catch (err) { }
            down = { id: e.pointerId }; samples = []; push(e);
        });
        function push(e) { var pt = kit.localPt(e, field); samples.push({ t: nowS(), x: pt.x - cx, y: pt.y - cy }); if (samples.length > 80) samples.shift(); }
        field.addEventListener('pointermove', function (e) { if (down && e.pointerId === down.id && phase === 'play') push(e); });
        function up(e) { if (down && e.pointerId === down.id) { down = null; samples = []; } }
        field.addEventListener('pointerup', up); field.addEventListener('pointercancel', up);

        function finish(kind) {
            if (phase !== 'play' || api.over) return;
            phase = 'end'; api.stopTimer();
            var why = whyText(kind, q);
            info.textContent = why;
            if (kind === 'pass') { info.classList.add('pwl-info--ok'); kit.flash(stage, true, api.my); Sfx.play('ok'); api.pass({ delay: 1800 }); return; }
            info.classList.add('pwl-info--bad'); kit.flash(stage, false, api.my);
            showChart(kind);
            api.fail({ delay: 4200, lines: [why, '綠色範圍 ' + q.lo.toFixed(4) + '～' + q.hi.toFixed(4) + ' 圈／秒、紅線 ' + q.breakLine.toFixed(4) + '、要撐 ' + q.hold.toFixed(4) + ' 秒', '進度停在 ' + (100 * p).toFixed(4) + '%'] });
        }
        /* 揭曉：轉速隨時間變化的折線圖，疊上綠色範圍和紅線 */
        function showChart(kind) {
            var CW = W - 24, CH = 110, box = h('div', { 'class': 'pwl-chart' }); box.style.cssText = 'left:12px;top:' + (cy + RING + 18 + 76 + 70) + 'px;width:' + CW + 'px;height:' + (CH + 8) + 'px;';
            var s = kit.svg('svg', { viewBox: '0 0 ' + CW + ' ' + (CH + 8), width: CW, height: CH + 8 }, box), total = Math.max(trace.length ? trace[trace.length - 1][0] : 1, 1), Y = function (v) { return 4 + CH - CH * Math.min(1, v / q.maxSpeed); }, XX = function (t) { return 4 + (CW - 8) * t / total; };
            kit.svg('rect', { 'class': 'pwl-chart__bg', x: 0, y: 0, width: CW, height: CH + 8, rx: 10 }, s);
            kit.svg('rect', { 'class': 'pwl-chart__band', x: 4, y: Y(q.hi), width: CW - 8, height: Math.max(2, Y(q.lo) - Y(q.hi)) }, s);
            kit.svg('line', { 'class': 'pwl-chart__red', x1: 4, x2: CW - 4, y1: Y(q.breakLine), y2: Y(q.breakLine) }, s);
            kit.svg('polyline', { 'class': 'pwl-chart__curve', points: trace.map(function (r) { return XX(r[0]).toFixed(1) + ',' + Y(r[1]).toFixed(1); }).join(' ') }, s);
            field.appendChild(box);
        }
        /* 驗證用：不真的畫圈，直接覆蓋「手指轉速」——solve＝一個簡單的比例控制器，把轉速穩穩拉到範圍中心；wrong＝一直轉太快（衝進紅色區）；可以重複呼叫 */
        api.solve = function () { if (phase === 'play') override = function (t, ww) { return Math.max(0, q.center + 3 * (q.center - ww)); }; };
        api.wrong = function () { if (phase === 'play') override = function () { return q.breakLine * 1.6; }; };
    }

    var G = {
        id: ID,
        name: '轉風車',
        rule: '**手指繞著風車快快畫圈**，風車就會跟著轉（順時針、逆時針都可以）。畫面上有一條速度表，綠色範圍是目標轉速：**要讓風車的速度停在綠色範圍裡，一直撐到進度條滿**。**轉太慢進度會倒退，轉太快衝進紅色危險區太久風車就壞了**；風車有慣性，還會被陣風吹得忽快忽慢，要一直微調手指的速度。越後面，要轉得越快、綠色範圍越窄、要撐得越久、陣風越強！',
        mount: mount,
        score: SCORE,
        test: {
            centerFor: centerFor, halfBandFor: halfBandFor, holdFor: holdFor, gustFor: gustFor, limitFor: limitFor, makeLevel: makeLevel, gustAt: gustAt, angularRate: angularRate, stepWheel: stepWheel, progressStep: progressStep, breakStep: breakStep, inBand: inBand, simulate: simulate, whyText: whyText, rating: rating,
            RAMP_LEVELS: RAMP_LEVELS, CENTER: CENTER, HALF_BAND: HALF_BAND, HOLD_S: HOLD_S, GUST: GUST, LIMIT_S: LIMIT_S, TAU: TAU, DECAY: DECAY, BREAK_RATIO: BREAK_RATIO, BREAK_S: BREAK_S, RATE_WINDOW: RATE_WINDOW, R_MIN: R_MIN, SPEED_MAX_RATIO: SPEED_MAX_RATIO, MAX_LEVEL: MAX_LEVEL
        }
    };
    Reaction.register(G);
})();

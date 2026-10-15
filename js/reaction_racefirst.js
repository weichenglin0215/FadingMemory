/* ═══════════════════════════════════════════════════════════════════
   reaction_racefirst.js — 秒反應・誰先衝線（企劃 206）
   四個穿著不同顏色衣服的小人排在起跑線上（靜止），畫面中央先出現「3、2、1」倒數，接著一聲令下，每個小人都以「加速度」
   向右衝：一開始很慢、越接近右邊越快，約 1 秒內就全部衝過終點線。看完之後，點「最先到終點」的那一個。
   越後面，各個小人到終點的時間差越小。關卡制：點錯或來不及就結束，成績＝通過幾關。
   ───────────────────────────────────────────────────────────────────
   · V1.29（玩家意見：太容易了、也無聊）改版：
       - 一開始先在畫面中央疊上「3、2、1」倒數（COUNT_STEPS × COUNT_MS），再開跑；
       - 原本的彩色圓點改成「穿著不同顏色衣服的小人在跑步」（手腳擺動的跑步動作）；
       - 每個小人的「起跑時間點」不一致（DELAY_MAX 以內隨機，有人比較慢才起跑），不過起跑慢不一定會落後：
         慢起跑的小人衝刺（加速度）比較大，所以光看誰先動、誰跑在前面都不可靠，要看誰「先到終點」。
   · 運動是時間的純函式（規範 T3）：第 k 個小人在起跑後第 t 秒（從哨音算起）離起跑線的距離
     x(t) ＝ ½ · a · (t − d)²（t ≥ d：從靜止、固定加速度 a 出發；d 是這個小人的起跑延遲），
     到達終點的時間 T ＝ d ＋ √(2 · D ÷ a)，D 是起跑線到終點線的距離。畫面只是把這個函式畫出來，跟影格率無關。
   · 出題（規範 Q1、Q6）：先決定「四個到達時間」——最快的 T1 在 0.60～0.72 秒之間隨機；
     第二名比第一名慢 GAP 秒，之後每一名再多慢 GAP × 0.5～1.2 秒——再替每個小人隨機決定起跑延遲 d（0～DELAY_MAX，
     而且跑的時間 T − d 至少 MIN_RUN 秒），由 a ＝ 2D ÷ (T − d)² 反推每個小人的加速度，
     所以「最先到」永遠只有一個，而且領先的時間差剛好是 GAP。
   · 難度線性（RAMP_LEVELS 關走到頂）：第一名與第二名的時間差 GAP 0.12 秒 → 0.025 秒（最後只差約 1.5 個影格）。
     四個小人每一關在哪一條跑道、什麼顏色都隨機。
   · 揭曉：答對時直接標出四個到達時間；答錯或逾時時，用 0.25 倍速的慢動作重播一次，並標出各自到達的時間（X.XXXX 秒）。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'racefirst';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 60 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 20;                       /* 幾關之後難度到頂 */
    var GAP = [0.12, 0.025];                    /* 第一名與第二名的到達時間差（秒）：第 1 關 → 到頂 */
    var T_WIN = [0.6, 0.72];                   /* 第一名的到達時間範圍（秒，每關隨機） */
    var SPREAD = [0.5, 1.2];                    /* 其餘名次之間的時間差 ＝ GAP × 這個範圍的隨機數 */
    var DELAY_MAX = 0.3;                        /* 每個小人的起跑延遲上限（秒）：每人在 0～DELAY_MAX 之間隨機 */
    var MIN_RUN = 0.4;                          /* 每個小人從起跑到終點至少要跑幾秒（起跑延遲不能太大，不然衝刺速度誇張） */
    var ANS_S = [5, 3.5];                       /* 衝完之後的作答限時（秒）：第 1 關 → 到頂 */
    var SLOW = 0.25;                            /* 慢動作重播的速度倍率 */
    var COUNT_STEPS = 3, COUNT_MS = 800;        /* 開跑前的倒數：3、2、1，每個數字停多久（毫秒） */
    var RUNNER_SCALE = 1.2;                     /* 小人畫多大（倍） */
    var STEP_RATE = 5;                          /* 跑步時手腳擺動的頻率（每秒幾個完整的擺動） */
    var MAX_LEVEL = 60;
    var HUES = [{ n: '紅', h: 4 }, { n: '橘', h: 28 }, { n: '黃', h: 48 }, { n: '綠', h: 135 }, { n: '藍', h: 212 }, { n: '紫', h: 282 }];

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function gapFor(level) { return kit.ramp(level, GAP[0], GAP[1], RAMP_LEVELS); }
    function ansMs(level) { return Math.round(kit.ramp(level, ANS_S[0], ANS_S[1], RAMP_LEVELS) * 1000); }
    /* 加速度 a、經過 t 秒，離起跑線多遠（到終點 D 就停住） */
    function distAt(a, t, D) { return Math.min(D, 0.5 * a * t * t); }
    /* 加速度 a 要幾秒到達距離 D */
    function arriveT(a, D) { return Math.sqrt(2 * D / a); }
    /* 跑的時間 T → 加速度 */
    function accelOf(T, D) { return 2 * D / (T * T); }
    /* 小人在哨音後第 t 秒的位置（含起跑延遲 d） */
    function runnerX(q, k, t) { return distAt(q.a[k], Math.max(0, t - q.d[k]), q.D); }
    /* 小人在哨音後第 t 秒的姿勢：跑步中（起跑之後、到終點之前）手腳擺動，其他時候站著。回傳各肢體離垂直線的角度（度） */
    function poseAt(q, k, t) {
        var tr = t - q.d[k];
        if (tr <= 0 || tr >= q.run[k]) return { moving: false, legA: 8, legB: -8, armA: 0, armB: 0 };
        var s = Math.sin(2 * Math.PI * STEP_RATE * tr);
        return { moving: true, legA: 48 * s, legB: -48 * s, armA: -42 * s, armB: 42 * s };
    }
    /* 出一關：{ D, gap, T:[每條跑道的小人到達時間（從哨音算起）], d:[起跑延遲], run:[跑的時間 T − d], a:[加速度], win（最先到的是第幾條跑道）, hues:[顏色], order（依到達時間排名的跑道） } */
    function makeRace(level, D, rand) {
        rand = rand || Math.random;
        var gap = gapFor(level), t1 = kit.randFloat(T_WIN[0], T_WIN[1], rand);
        var times = [t1, t1 + gap];
        times.push(times[1] + gap * kit.randFloat(SPREAD[0], SPREAD[1], rand));
        times.push(times[2] + gap * kit.randFloat(SPREAD[0], SPREAD[1], rand));
        var lanes = kit.shuffle([0, 1, 2, 3], rand), T = [0, 0, 0, 0];
        lanes.forEach(function (lane, rank) { T[lane] = times[rank]; });
        var d = T.map(function (t) { return kit.randFloat(0, Math.max(0, Math.min(DELAY_MAX, t - MIN_RUN)), rand); });
        var run = T.map(function (t, k) { return t - d[k]; });
        var cols = kit.sample(HUES, 4, rand);
        return { D: D, gap: gap, T: T, d: d, run: run, a: run.map(function (r) { return accelOf(r, D); }), win: lanes[0], order: lanes, hues: cols };
    }
    function rating(n) {
        if (n >= 20) return '鷹眼！';
        if (n >= 12) return '眼睛追得很準！';
        if (n >= 6) return '不錯喔！';
        if (n >= 3) return '再接再厲！';
        return '盯住終點線，再來一次！';
    }

    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 5,
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['通過 ' + S.cleared + ' 關']; },
            setup: setup
        });
    }

    /* 小人（面向右邊）：頭、身體（衣服的顏色）、兩隻手、兩隻腳；回傳 { g, set(pose) }，原點在腰的位置 */
    function makeRunner(parent, hue) {
        var shirt = kit.hsl(hue, 78, 52), shirtDk = kit.hsl(hue, 70, 34), pants = '#4A3B1E', skin = '#FFE3B8';
        var g = kit.svg('g', { 'class': 'rcf-runner' }, parent);
        var armB = kit.svg('line', { x1: 0, y1: -16, x2: 0, y2: 4, stroke: shirtDk, 'stroke-width': 6, 'stroke-linecap': 'round' }, g);
        var legB = kit.svg('line', { x1: 0, y1: 8, x2: 0, y2: 30, stroke: pants, 'stroke-width': 7, 'stroke-linecap': 'round' }, g);
        kit.svg('line', { x1: 1, y1: -18, x2: 3, y2: 9, stroke: shirt, 'stroke-width': 15, 'stroke-linecap': 'round' }, g);
        kit.svg('circle', { cx: 5, cy: -32, r: 10, fill: skin, stroke: '#4A3B1E', 'stroke-width': 2.5 }, g);
        kit.svg('circle', { cx: 9, cy: -34, r: 1.8, fill: '#4A3B1E' }, g);
        var legA = kit.svg('line', { x1: 0, y1: 8, x2: 0, y2: 30, stroke: pants, 'stroke-width': 7, 'stroke-linecap': 'round' }, g);
        var armA = kit.svg('line', { x1: 0, y1: -16, x2: 0, y2: 4, stroke: shirt, 'stroke-width': 6, 'stroke-linecap': 'round' }, g);
        function limb(el, x1, y1, len, deg) { var r = deg * Math.PI / 180; el.setAttribute('x2', (x1 + len * Math.sin(r)).toFixed(2)); el.setAttribute('y2', (y1 + len * Math.cos(r)).toFixed(2)); }
        return {
            g: g,
            set: function (p) { limb(legA, 0, 8, 22, p.legA); limb(legB, 0, 8, 22, p.legB); limb(armA, 0, -16, 19, p.armA); limb(armB, 0, -16, 19, p.armB); }
        };
    }

    function setup(api) {
        var stage = api.stage, level = api.level;
        var W = stage.clientWidth || 472, H = stage.clientHeight || 640;
        var X0 = 40, X1 = W - 44, D = X1 - X0;
        var q = makeRace(level, D, api.rand);
        api.info = q;
        console.log('[誰先衝線] 第 ' + level + ' 關：到達時間 ' + q.hues.map(function (c, i) { return c.n + ' ' + q.T[i].toFixed(4) + '（起跑 ' + q.d[i].toFixed(3) + '）'; }).join('、') + '；最先到的是 ' + q.hues[q.win].n + '，領先第二名 ' + q.gap.toFixed(4) + ' 秒；限時 ' + ansMs(level) + ' ms');

        var top = 70, laneH = 104;
        var svg = kit.svg('svg', { 'class': 'rcf-svg', viewBox: '0 0 ' + W + ' ' + H, width: W, height: H }, stage);
        var runners = [], halos = [], labs = [];
        for (var i = 0; i < 4; i++) {
            var cy = top + laneH * i + laneH / 2 - 6;
            kit.svg('rect', { x: 10, y: top + laneH * i + 6, width: W - 20, height: laneH - 12, rx: 14, 'class': 'rcf-lane' }, svg);
            halos.push(kit.svg('circle', { cx: X0, cy: cy, r: 40, 'class': 'rcf-halo' }, svg));
            var rn = makeRunner(svg, q.hues[i].h);
            rn.set(poseAt(q, i, 0)); rn.g.setAttribute('transform', 'translate(' + X0 + ' ' + cy + ') scale(' + RUNNER_SCALE + ')');
            runners.push({ run: rn, cy: cy });
            var t = kit.svg('text', { x: X1 - 6, y: cy + 46, 'text-anchor': 'end', 'class': 'rcf-time' }, svg); labs.push(t);
        }
        kit.svg('line', { x1: X0, y1: top, x2: X0, y2: top + laneH * 4, 'class': 'rcf-start' }, svg);
        kit.svg('line', { x1: X1 + 24, y1: top, x2: X1 + 24, y2: top + laneH * 4, 'class': 'rcf-finish' }, svg);
        var tip = h('div', { 'class': 'qz-note rcf-tip', text: '準備…' });
        stage.appendChild(tip);
        var count = h('div', { 'class': 'rcf-count', text: '' });
        stage.appendChild(count);
        var phase = 'wait', t0 = 0;
        /* 把哨音後第 tt 秒的畫面畫出來（位置＋跑步姿勢；小人的位置是離起跑線的距離，原點在腰） */
        function paint(tt) {
            for (var k = 0; k < 4; k++) {
                var x = X0 + runnerX(q, k, tt);
                runners[k].run.g.setAttribute('transform', 'translate(' + x.toFixed(2) + ' ' + runners[k].cy + ') scale(' + RUNNER_SCALE + ')');
                runners[k].run.set(poseAt(q, k, tt));
                halos[k].setAttribute('cx', x.toFixed(2));
            }
        }
        function go() {
            phase = 'run'; count.textContent = ''; tip.textContent = '看！'; t0 = performance.now(); Sfx.play('go');
            var maxT = Math.max.apply(null, q.T);
            api.my.loop(function () {
                var tt = (performance.now() - t0) / 1000;
                paint(tt);
                if (tt >= maxT + 0.02) return false;
            });
            api.after(maxT * 1000 + 120, function () {
                paint(maxT + 1); phase = 'ask';
                tip.textContent = '最先到終點的是哪一個？點它！';
                api.timer(ansMs(level), function () { judge(-1); });
                if (level === 1 && kit.once('racefirst.hint')) kit.hintOn(stage, null, { mode: 'tap', x: X1, y: top + laneH * q.win + laneH / 2, delay: 300, text: '請點擊最先到終點的小人' });
            });
        }
        /* 開跑前：畫面中央疊上 3、2、1 倒數，再開跑 */
        for (var c = 0; c < COUNT_STEPS; c++) (function (c) {
            api.after(400 + c * COUNT_MS, function () { count.textContent = String(COUNT_STEPS - c); count.classList.remove('rcf-count--pop'); void count.offsetWidth; count.classList.add('rcf-count--pop'); Sfx.play('tick'); });
        })(c);
        api.after(400 + COUNT_STEPS * COUNT_MS, go);
        /* 整條跑道都可以點 */
        for (i = 0; i < 4; i++) (function (lane) {
            var hit = h('div', { 'class': 'rcf-hit' });
            hit.style.left = '0px'; hit.style.width = W + 'px'; hit.style.top = (top + laneH * lane) + 'px'; hit.style.height = laneH + 'px';
            kit.onTap(hit, function () { if (phase === 'ask') judge(lane); });
            stage.appendChild(hit);
        })(i);

        function times() { q.T.forEach(function (t, k) { labs[k].textContent = t.toFixed(4) + ' 秒' + (k === q.win ? '　第 1 名' : ''); }); }
        function judge(lane) {
            if (api.over || phase !== 'ask') return;
            phase = 'done';
            var ok = lane === q.win;
            halos[q.win].classList.add('rcf-halo--win');
            if (lane >= 0 && !ok) halos[lane].classList.add('rcf-halo--wrong');
            if (ok) {
                times(); tip.textContent = '答對了！第一名領先第二名 ' + q.gap.toFixed(4) + ' 秒';
                kit.flash(stage, true, api.my); api.pass({ delay: 1700 }); return;
            }
            kit.flash(stage, false, api.my);
            tip.textContent = (lane < 0 ? '時間到！' : '不是那個。') + '慢動作重播（0.25 倍速）…';
            /* 慢動作重播：從頭再跑一次，速度 SLOW 倍 */
            paint(0);
            var rt0 = performance.now(), maxT = Math.max.apply(null, q.T);
            api.my.loop(function () {
                var tt = (performance.now() - rt0) / 1000 * SLOW;
                paint(tt);
                if (tt >= maxT + 0.02) { paint(maxT + 1); times(); tip.textContent = '最先到的是 ' + q.hues[q.win].n + '色，領先 ' + q.gap.toFixed(4) + ' 秒'; return false; }
            });
            api.after((maxT / SLOW) * 1000 + 600, function () { paint(maxT + 1); times(); });
            api.fail({ delay: (maxT / SLOW) * 1000 + 1500, lines: [
                (lane < 0 ? '時間到！' : '你選了 ' + q.hues[lane].n + '色（' + q.T[lane].toFixed(4) + ' 秒）') + '，最先到的是 ' + q.hues[q.win].n + '色（' + q.T[q.win].toFixed(4) + ' 秒）',
                '第一名領先第二名 ' + q.gap.toFixed(4) + ' 秒'
            ] });
        }
        api.solve = function () { if (phase === 'ask') judge(q.win); };
        api.wrong = function () { if (phase === 'ask') judge((q.win + 1) % 4); };
    }

    var G = {
        id: ID,
        name: '誰先衝線',
        rule: '先倒數 3、2、1，四個穿不同顏色衣服的小人從左邊靜止出發，一起以加速度向右衝：**越接近右邊越快**，約 1 秒內就衝過終點。**每個小人起跑的時間不一樣**，起跑慢的不一定會落後！看完之後，**點「最先到終點」的那一個**。點錯或來不及就結束，看你能過幾關。越後面，它們到終點的時間差越小！',
        mount: mount,
        score: SCORE,
        test: {
            gapFor: gapFor, ansMs: ansMs, distAt: distAt, arriveT: arriveT, accelOf: accelOf, runnerX: runnerX, poseAt: poseAt, makeRace: makeRace, rating: rating,
            RAMP_LEVELS: RAMP_LEVELS, GAP: GAP, T_WIN: T_WIN, SPREAD: SPREAD, SLOW: SLOW, DELAY_MAX: DELAY_MAX, MIN_RUN: MIN_RUN, COUNT_STEPS: COUNT_STEPS, COUNT_MS: COUNT_MS, STEP_RATE: STEP_RATE, MAX_LEVEL: MAX_LEVEL
        }
    };
    Reaction.register(G);
})();

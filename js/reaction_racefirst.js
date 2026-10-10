/* ═══════════════════════════════════════════════════════════════════
   reaction_racefirst.js — 秒反應・誰先衝線（企劃 206）
   四個彩色圓點排在起跑線上（靜止），一聲令下，每個圓點都以「加速度」向右衝：一開始很慢、越接近右邊越快，
   約 1 秒內就全部衝過終點線。看完之後，點「最先到終點」的那一個。越後面，各個圓點到終點的時間差越小。
   關卡制：點錯或來不及就結束，成績＝通過幾關。
   ───────────────────────────────────────────────────────────────────
   · 運動是時間的純函式（規範 T3）：圓點離起跑線的距離 x(t) ＝ ½ · a · t²（從靜止、固定加速度 a 出發），
     到達終點的時間 T ＝ √(2 · D ÷ a)，D 是起跑線到終點線的距離。畫面只是把這個函式畫出來，跟影格率無關。
   · 出題（規範 Q1、Q6）：先決定「四個到達時間」——最快的 T1 在 0.60～0.72 秒之間隨機；
     第二名比第一名慢 GAP 秒，之後每一名再多慢 GAP × 0.5～1.2 秒——再由 a ＝ 2D ÷ T² 反推每個圓點的加速度，
     所以「最先到」永遠只有一個，而且領先的時間差剛好是 GAP。
   · 難度線性（RAMP_LEVELS 關走到頂）：第一名與第二名的時間差 GAP 0.12 秒 → 0.025 秒（最後只差約 1.5 個影格）。
     四個圓點每一關在哪一條跑道、什麼顏色都隨機。
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
    var ANS_S = [5, 3.5];                       /* 衝完之後的作答限時（秒）：第 1 關 → 到頂 */
    var SLOW = 0.25;                            /* 慢動作重播的速度倍率 */
    var START_DELAY = 1500;                     /* 關卡開始後多久出發（毫秒） */
    var MAX_LEVEL = 60;
    var HUES = [{ n: '紅', h: 4 }, { n: '橘', h: 28 }, { n: '黃', h: 48 }, { n: '綠', h: 135 }, { n: '藍', h: 212 }, { n: '紫', h: 282 }];

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function gapFor(level) { return kit.ramp(level, GAP[0], GAP[1], RAMP_LEVELS); }
    function ansMs(level) { return Math.round(kit.ramp(level, ANS_S[0], ANS_S[1], RAMP_LEVELS) * 1000); }
    /* 加速度 a、經過 t 秒，離起跑線多遠（到終點 D 就停住） */
    function distAt(a, t, D) { return Math.min(D, 0.5 * a * t * t); }
    /* 加速度 a 要幾秒到達距離 D */
    function arriveT(a, D) { return Math.sqrt(2 * D / a); }
    /* 到達時間 T → 加速度 */
    function accelOf(T, D) { return 2 * D / (T * T); }
    /* 出一關：{ T:[每條跑道的圓點到達時間], a:[加速度], win（最先到的是第幾條跑道）, hues:[顏色], order（依到達時間排名的跑道） }，D 是跑道長度 */
    function makeRace(level, D, rand) {
        rand = rand || Math.random;
        var gap = gapFor(level), t1 = kit.randFloat(T_WIN[0], T_WIN[1], rand);
        var times = [t1, t1 + gap];
        times.push(times[1] + gap * kit.randFloat(SPREAD[0], SPREAD[1], rand));
        times.push(times[2] + gap * kit.randFloat(SPREAD[0], SPREAD[1], rand));
        var lanes = kit.shuffle([0, 1, 2, 3], rand), T = [0, 0, 0, 0];
        lanes.forEach(function (lane, rank) { T[lane] = times[rank]; });
        var cols = kit.sample(HUES, 4, rand);
        return { D: D, gap: gap, T: T, a: T.map(function (t) { return accelOf(t, D); }), win: lanes[0], order: lanes, hues: cols };
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

    function setup(api) {
        var stage = api.stage, level = api.level;
        var W = stage.clientWidth || 472, H = stage.clientHeight || 640;
        var X0 = 40, X1 = W - 44, D = X1 - X0;
        var q = makeRace(level, D, api.rand);
        api.info = q;
        console.log('[誰先衝線] 第 ' + level + ' 關：到達時間 ' + q.hues.map(function (c, i) { return c.n + ' ' + q.T[i].toFixed(4); }).join('、') + '；最先到的是 ' + q.hues[q.win].n + '，領先第二名 ' + q.gap.toFixed(4) + ' 秒；限時 ' + ansMs(level) + ' ms');

        var top = 70, laneH = 104;
        var svg = kit.svg('svg', { 'class': 'rcf-svg', viewBox: '0 0 ' + W + ' ' + H, width: W, height: H }, stage);
        var dots = [], labs = [];
        for (var i = 0; i < 4; i++) {
            var cy = top + laneH * i + laneH / 2;
            kit.svg('rect', { x: 10, y: top + laneH * i + 6, width: W - 20, height: laneH - 12, rx: 14, 'class': 'rcf-lane' }, svg);
            var c = q.hues[i];
            dots.push(kit.svg('circle', { cx: X0, cy: cy, r: 23, fill: kit.hsl(c.h, 78, 52), stroke: kit.hsl(c.h, 70, 30), 'stroke-width': 3, 'class': 'rcf-dot' }, svg));
            var t = kit.svg('text', { x: X1 - 6, y: cy + 38, 'text-anchor': 'end', 'class': 'rcf-time' }, svg); labs.push(t);
        }
        kit.svg('line', { x1: X0, y1: top, x2: X0, y2: top + laneH * 4, 'class': 'rcf-start' }, svg);
        kit.svg('line', { x1: X1 + 24, y1: top, x2: X1 + 24, y2: top + laneH * 4, 'class': 'rcf-finish' }, svg);
        var tip = h('div', { 'class': 'qz-note rcf-tip', text: '準備…' });
        stage.appendChild(tip);
        var phase = 'wait', t0 = 0;
        function paint(tt) { for (var k = 0; k < 4; k++) dots[k].setAttribute('cx', X0 + distAt(q.a[k], tt, D)); }
        /* 起跑 */
        api.after(START_DELAY, function () {
            phase = 'run'; tip.textContent = '看！'; t0 = performance.now(); Sfx.play('go');
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
                if (level === 1 && kit.once('racefirst.hint')) kit.hintOn(stage, null, { mode: 'tap', x: X1, y: top + laneH * q.win + laneH / 2, delay: 300, text: '請點擊最先到終點的圓點' });
            });
        });
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
            dots[q.win].setAttribute('stroke-width', 7);
            if (lane >= 0 && !ok) dots[lane].classList.add('rcf-dot--wrong');
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
        rule: '四個圓點從左邊靜止出發，一聲令下，一起以加速度向右衝：越接近右邊越快，約 1 秒內就衝過終點。看完之後，點「最先到終點」的那一個。點錯或來不及就結束，看你能過幾關。越後面，它們到終點的時間差越小！',
        mount: mount,
        score: SCORE,
        test: {
            gapFor: gapFor, ansMs: ansMs, distAt: distAt, arriveT: arriveT, accelOf: accelOf, makeRace: makeRace, rating: rating,
            RAMP_LEVELS: RAMP_LEVELS, GAP: GAP, T_WIN: T_WIN, SPREAD: SPREAD, SLOW: SLOW, MAX_LEVEL: MAX_LEVEL
        }
    };
    Reaction.register(G);
})();

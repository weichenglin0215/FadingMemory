/* ═══════════════════════════════════════════════════════════════════
   reaction_spinpick.js — 秒反應・轉盤停哪格（企劃 218，指針版）
   圓盤正中央有一根旋轉的指針，底下的圓盤像披薩一樣切成好幾格（每格顏色不同）。指針一開始轉得很快，然後慢慢減速、
   最後停下來。可是從「最後 3 秒」開始，指針會漸漸變成半透明，「最後第 2 秒」完全看不見，等到第 0 秒，
   中央會出現「請點擊指針指向哪個方向」——請憑指針減速的節奏，推測它最後停在哪一格，點那一格。
   關卡制：點錯或來不及就結束，成績＝通過幾關。第一關圓盤只切成左右兩格，越後面切得越多。
   ───────────────────────────────────────────────────────────────────
   · 指針的角度是時間的純函式（規範 T3）：等減速運動  θ(t) ＝ θ0 ＋ ω0·t − ½·α·t²（α＝ω0÷T，所以剛好在 T 秒停住）。
     θ 是從正上方順時針量的角度（度）；第 k 格涵蓋 [k·360/N, (k+1)·360/N)，第 0 格在右上到右下（N＝2 時就是右半邊）。
   · 出題（規範 Q1、Q15）：先決定「停在第幾格、格內的哪個位置」（離格線至少 20％的格寬），再由 θ_終 ＝ θ0 ＋ ω0·T÷2 反推起始角度 θ0；
     所以答案絕對不會剛好落在格線上，判定不會有爭議。
   · 難度線性（RAMP_LEVELS 關走到頂）：格數 2 → 12；起轉速度 1.5 → 0.9 圈／秒（越後面轉越慢，看不見的最後 2 秒掃過的角度較小，
     但格子更小，所以仍然越來越難）；作答限時 6 → 4 秒。旋轉總時間固定 T ＝ 5 秒（看得見 2 秒、漸隱 1 秒、看不見 2 秒）。
   · 揭曉：指針重新出現在停住的位置，正確那一格加粗框；選錯的那一格用橘紅框標出。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'spinpick';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 60 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 20;                       /* 幾關之後難度到頂 */
    var SECTORS = [2, 12];                      /* 圓盤切成幾格：第 1 關 → 到頂 */
    var OMEGA_REV = [1.5, 0.9];                 /* 指針起轉速度（圈／秒）：第 1 關 → 到頂 */
    var SPIN_S = 5;                             /* 指針從起轉到停住的總秒數 */
    var FADE_START = 3, FADE_END = 2;           /* 剩幾秒時開始漸隱／完全看不見（企劃指定：最後 3 秒起半透明、最後第 2 秒全透明） */
    var ANS_S = [6, 4];                         /* 停住之後的作答限時（秒）：第 1 關 → 到頂 */
    var MARGIN = 0.2;                           /* 停點離格線至少多遠（格寬的幾分之幾） */
    var DISC_R = 190, NEEDLE_R = 168, DEAD_R = 54;   /* 圓盤半徑、指針長度、中央不能點的半徑 */
    var CENTER_Y = 300;
    var MAX_LEVEL = 60;

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function sectorsFor(level) { return kit.clamp(Math.round(kit.ramp(level, SECTORS[0], SECTORS[1], RAMP_LEVELS)), SECTORS[0], SECTORS[1]); }
    function omegaFor(level) { return kit.ramp(level, OMEGA_REV[0], OMEGA_REV[1], RAMP_LEVELS) * 360; }     /* 度／秒 */
    function ansMs(level) { return Math.round(kit.ramp(level, ANS_S[0], ANS_S[1], RAMP_LEVELS) * 1000); }
    function norm360(a) { return ((a % 360) + 360) % 360; }
    /* 指針在第 t 秒的角度（t 超過 SPIN_S 就停在終點） */
    function thetaAt(sp, t) {
        var tt = Math.min(Math.max(t, 0), sp.T), alpha = sp.omega0 / sp.T;
        return sp.theta0 + sp.omega0 * tt - 0.5 * alpha * tt * tt;
    }
    /* 指針的不透明度：剩餘時間 ≥ FADE_START → 1；FADE_START → FADE_END 之間線性漸隱；≤ FADE_END → 0 */
    function alphaAt(t, T) {
        var rem = T - t;
        if (rem >= FADE_START) return 1;
        if (rem <= FADE_END) return 0;
        return (rem - FADE_END) / (FADE_START - FADE_END);
    }
    /* 角度 theta 落在 N 格裡的第幾格 */
    function sectorOf(theta, N) { return Math.floor(norm360(theta) / (360 / N)) % N; }
    /* 出一關：{ N, s（停在第幾格）, thetaF（停點角度）, theta0, omega0, T, offset（停點在格內的位置 0～1） } */
    function makeSpin(level, rand) {
        rand = rand || Math.random;
        var N = sectorsFor(level), w = 360 / N;
        var s = kit.randInt(0, N - 1, rand), offset = kit.randFloat(MARGIN, 1 - MARGIN, rand);
        var thetaF = s * w + offset * w, omega0 = omegaFor(level);
        var theta0 = norm360(thetaF - omega0 * SPIN_S / 2);
        return { N: N, s: s, thetaF: thetaF, theta0: theta0, omega0: omega0, T: SPIN_S, offset: offset };
    }
    function rating(n) {
        if (n >= 20) return '轉盤預言家！';
        if (n >= 12) return '節奏感很準！';
        if (n >= 6) return '不錯喔！';
        if (n >= 3) return '再接再厲！';
        return '看指針減速的節奏，再來一次！';
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
        var sp = makeSpin(level, api.rand), N = sp.N, w = 360 / N;
        api.info = sp;
        console.log('[轉盤停哪格] 第 ' + level + ' 關：' + N + ' 格，停在第 ' + (sp.s + 1) + ' 格（格內 ' + (sp.offset * 100).toFixed(1) + '％）；起轉 ' + sp.omega0.toFixed(2) + ' 度/秒，起始角 ' + sp.theta0.toFixed(2) + ' 度，終點角 ' + sp.thetaF.toFixed(2) + ' 度；限時 ' + ansMs(level) + ' ms');

        var W = stage.clientWidth || 472, cx = W / 2, cy = CENTER_Y;
        var svg = kit.svg('svg', { 'class': 'spk-svg', viewBox: '0 0 ' + W + ' 640', width: W, height: 640 }, stage);
        /* 圓盤：N 個扇形 */
        function pt(theta, r) { var a = (theta - 90) * Math.PI / 180; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; }
        var secs = [];
        for (var k = 0; k < N; k++) {
            var a0 = k * w, a1 = (k + 1) * w, p0 = pt(a0, DISC_R), p1 = pt(a1, DISC_R);
            var d = 'M' + cx + ' ' + cy + ' L' + p0[0].toFixed(2) + ' ' + p0[1].toFixed(2) + ' A' + DISC_R + ' ' + DISC_R + ' 0 ' + (w > 180 ? 1 : 0) + ' 1 ' + p1[0].toFixed(2) + ' ' + p1[1].toFixed(2) + ' Z';
            var hue = (212 + k * (360 / N)) % 360;
            secs.push(kit.svg('path', { d: d, fill: kit.hsl(hue, 70, 72), 'class': 'spk-sec' }, svg));
        }
        var needle = kit.svg('g', { 'class': 'spk-needle' }, svg);
        kit.svg('polygon', { points: (cx - 11) + ',' + cy + ' ' + (cx + 11) + ',' + cy + ' ' + cx + ',' + (cy - NEEDLE_R), 'class': 'spk-tip' }, needle);
        kit.svg('circle', { cx: cx, cy: cy, r: 17, 'class': 'spk-hub' }, svg);
        var center = h('div', { 'class': 'spk-center', html: '請點擊指針<br>指向哪個方向' });
        center.style.left = (cx - 90) + 'px'; center.style.top = (cy - 40) + 'px'; center.style.visibility = 'hidden';
        stage.appendChild(center);
        var tip = h('div', { 'class': 'qz-note spk-tip-text', text: '看指針怎麼轉、怎麼慢下來' });
        stage.appendChild(tip);
        var phase = 'spin', t0 = performance.now();
        function paint(t) {
            needle.setAttribute('transform', 'rotate(' + thetaAt(sp, t).toFixed(3) + ' ' + cx + ' ' + cy + ')');
            needle.setAttribute('opacity', alphaAt(t, sp.T).toFixed(3));
        }
        paint(0);
        var loop = api.my.loop(function () {
            var t = (performance.now() - t0) / 1000;
            paint(t);
            if (t >= sp.T || phase !== 'spin') return false;
        });
        api.after(sp.T * 1000 + 30, function () {
            loop.stop(); paint(sp.T);
            phase = 'ask'; center.style.visibility = ''; needle.setAttribute('opacity', 0);
            tip.textContent = '指針停了：它指向哪一格？';
            api.timer(ansMs(level), function () { judge(-1); });
            if (level === 1 && kit.once('spinpick.hint')) {
                var hp = pt(sp.s * w + w / 2, DISC_R * 0.62);
                kit.hintOn(stage, null, { mode: 'tap', x: hp[0], y: hp[1], delay: 300, text: '請點擊指針指向的方向' });
            }
        });
        kit.onTap(stage, function (e) {
            if (api.over || phase !== 'ask') return;
            var p = kit.localPt(e, stage), dx = p.x - cx, dy = p.y - cy, r = Math.sqrt(dx * dx + dy * dy);
            if (r < DEAD_R || r > DISC_R) return;
            judge(sectorOf(Math.atan2(dx, -dy) * 180 / Math.PI, N));
        });

        function judge(k) {
            if (api.over || phase === 'done') return;
            phase = 'done'; loop.stop();
            var ok = k === sp.s;
            paint(sp.T); needle.setAttribute('opacity', 1);
            center.style.visibility = 'hidden';
            secs[sp.s].classList.add('spk-sec--right');
            if (k >= 0 && !ok) secs[k].classList.add('spk-sec--wrong');
            var pos = (sp.offset * 100).toFixed(4);
            tip.textContent = '指針停在第 ' + (sp.s + 1) + ' 格（格內 ' + pos + '％的位置）' + (ok ? '' : '，你選了第 ' + (k + 1) + ' 格');
            if (ok) { kit.flash(stage, true, api.my); api.pass({ delay: 1600 }); return; }
            kit.flash(stage, false, api.my);
            api.fail({ delay: 2600, lines: [
                (k < 0 ? '時間到！' : '你選了第 ' + (k + 1) + ' 格') + '，指針停在第 ' + (sp.s + 1) + ' 格（共 ' + N + ' 格）',
                '停點角度 ' + sp.thetaF.toFixed(4) + ' 度（從正上方順時針量）'
            ] });
        }
        api.solve = function () { if (phase === 'ask') judge(sp.s); };
        api.wrong = function () { if (phase === 'ask') judge((sp.s + 1) % N); };
    }

    var G = {
        id: ID,
        name: '轉盤停哪格',
        rule: '圓盤中央的指針會轉動並慢慢減速到停住。但從最後 3 秒開始，指針會漸漸變透明，最後 2 秒完全看不見。請憑它減速的節奏，推測它最後停在哪一格，點那一格。點錯或來不及就結束，看你能過幾關。越後面，圓盤切得越多格！',
        mount: mount,
        score: SCORE,
        test: {
            sectorsFor: sectorsFor, omegaFor: omegaFor, ansMs: ansMs, norm360: norm360, thetaAt: thetaAt, alphaAt: alphaAt, sectorOf: sectorOf, makeSpin: makeSpin, rating: rating,
            RAMP_LEVELS: RAMP_LEVELS, SECTORS: SECTORS, OMEGA_REV: OMEGA_REV, SPIN_S: SPIN_S, FADE_START: FADE_START, FADE_END: FADE_END, MARGIN: MARGIN, MAX_LEVEL: MAX_LEVEL
        }
    };
    Reaction.register(G);
})();

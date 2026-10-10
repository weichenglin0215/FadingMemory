/* ═══════════════════════════════════════════════════════════════════
   reaction_fastblink.js — 秒反應・誰閃得快（企劃 151）
   左右各一個圓點在閃爍，點「閃得比較快」的那一個。兩個圓點的顏色、位置、閃爍的起點都不一樣，
   一開始快的是慢的 2 倍，越後面兩邊的快慢越接近（最後只差 5％）。
   關卡制：點錯或來不及就結束，成績＝通過幾關。
   ───────────────────────────────────────────────────────────────────
   · 閃爍是「時間的純函式」（規範 T3）：isOn(頻率, 起始相位, 秒數)＝一個週期的前半亮、後半暗，
     畫面（rAF）只是每影格把同一個函式畫出來；跟影格率無關，所以 60／120 Hz 的螢幕看到的快慢一樣。
   · 難度線性（RAMP_LEVELS 關走到頂）：快／慢的頻率比 2.00 → 1.05；慢的那顆頻率每關在 SLOW_HZ 範圍內隨機，
     所以「看起來閃得快不快」不能靠記住某個絕對頻率。
   · 左右哪邊快、哪個顏色快、閃爍起點（相位），每關都隨機。
   · 揭曉：兩邊的頻率並排（例如 4.0000 Hz 對 4.2000 Hz），閃得快的那顆圈起來。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'fastblink';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 60 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 25;                       /* 幾關之後難度到頂 */
    var RATIO = [2.0, 1.05];                    /* 快／慢的頻率比：第 1 關 → 到頂 */
    var SLOW_HZ = [2.4, 4.2];                   /* 慢的那顆頻率的隨機範圍（赫茲＝每秒閃幾下） */
    var ANS_S = [8, 5];                         /* 作答限時（秒）：第 1 關 → 到頂 */
    var MAX_LEVEL = 60;

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function ratioFor(level) { return kit.ramp(level, RATIO[0], RATIO[1], RAMP_LEVELS); }
    function ansMs(level) { return Math.round(kit.ramp(level, ANS_S[0], ANS_S[1], RAMP_LEVELS) * 1000); }
    /* 頻率 f（赫茲）、起始相位 phase（0～1）的圓點，在第 t 秒是亮的嗎？一個週期的前半亮、後半暗 */
    function isOn(f, phase, t) {
        var x = f * t + phase;
        return x - Math.floor(x) < 0.5;
    }
    /* 出一關：{ slow, fast（頻率）, ratio, fastSide 'L'|'R', phL, phR（兩邊的起始相位）, hueSwap 左邊用不用第二種顏色 } */
    function makeLevel(level, rand) {
        rand = rand || Math.random;
        var ratio = ratioFor(level);
        var slow = kit.randFloat(SLOW_HZ[0], SLOW_HZ[1], rand), fast = slow * ratio;
        /* 頻率取到小數 1 位（揭曉時寫成 4.0000 Hz 這種好讀的數字，而且比值仍然非常接近設定值） */
        slow = Math.round(slow * 10) / 10; fast = Math.round(slow * ratio * 100) / 100;
        return { slow: slow, fast: fast, ratio: fast / slow, fastSide: rand() < 0.5 ? 'L' : 'R', phL: rand(), phR: rand(), swap: rand() < 0.5 };
    }
    /* 數一數：在 [0, T] 秒內，頻率 f 的圓點「亮起來」幾次（驗證用） */
    function countFlashes(f, phase, T, step) {
        step = step || 0.001;
        var n = 0, prev = isOn(f, phase, 0);
        for (var t = step; t <= T; t += step) { var cur = isOn(f, phase, t); if (cur && !prev) n++; prev = cur; }
        return n;
    }
    function rating(n) {
        if (n >= 30) return '節奏感超強！';
        if (n >= 18) return '眼睛很敏銳！';
        if (n >= 10) return '不錯喔！';
        if (n >= 4) return '再接再厲！';
        return '多看幾次，節奏會越來越清楚！';
    }

    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 6,
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
        console.log('[誰閃得快] 第 ' + level + ' 關：慢 ' + q.slow.toFixed(4) + ' Hz、快 ' + q.fast.toFixed(4) + ' Hz（比 ' + q.ratio.toFixed(4) + '），快的在' + (q.fastSide === 'L' ? '左' : '右') + '，限時 ' + ansMs(level) + ' ms');

        var W = stage.clientWidth || 472, H = stage.clientHeight || 640;
        var R = 70;
        function mkDot(side, cx, cy, cls) {
            var d = h('div', { 'class': 'fbk-dot ' + cls });
            d.style.width = d.style.height = (2 * R) + 'px';
            d.style.left = (cx - R) + 'px'; d.style.top = (cy - R) + 'px';
            var lab = h('div', { 'class': 'fbk-hz' });
            lab.style.left = (cx - 100) + 'px'; lab.style.top = (cy + R + 14) + 'px';
            stage.appendChild(d); stage.appendChild(lab);
            kit.onTap(d, function () { judge(side); });
            return { el: d, lab: lab };
        }
        /* 兩顆圓點的位置也不一樣高（規範：亮度與位置不同），左右各自上下偏一點 */
        var yL = Math.round(H * 0.3) + kit.randInt(-30, 30, api.rand), yR = Math.round(H * 0.3) + kit.randInt(-30, 30, api.rand);
        var dotL = mkDot('L', Math.round(W * 0.27), yL, q.swap ? 'fbk-dot--b' : 'fbk-dot--a');
        var dotR = mkDot('R', Math.round(W * 0.73), yR, q.swap ? 'fbk-dot--a' : 'fbk-dot--b');
        var tip = h('div', { 'class': 'qz-note fbk-tip', text: '點閃得比較快的圓點' });
        stage.appendChild(tip);
        var fL = q.fastSide === 'L' ? q.fast : q.slow, fR = q.fastSide === 'R' ? q.fast : q.slow;
        var t0 = performance.now();
        var loop = api.my.loop(function () {
            if (api.over) return false;
            var t = (performance.now() - t0) / 1000;
            dotL.el.classList.toggle('fbk-dot--on', isOn(fL, q.phL, t));
            dotR.el.classList.toggle('fbk-dot--on', isOn(fR, q.phR, t));
        });
        api.timer(ansMs(level), function () { judge(null); });
        if (level === 1 && kit.once('fastblink.hint')) kit.hintOn(stage, q.fastSide === 'L' ? dotL.el : dotR.el, { mode: 'tap', delay: 600, text: '請點擊閃得比較快的圓點' });

        function judge(side) {
            if (api.over) return;
            loop.stop();
            var ok = side === q.fastSide;
            dotL.el.classList.remove('fbk-dot--on'); dotR.el.classList.remove('fbk-dot--on');
            dotL.lab.textContent = fL.toFixed(4) + ' Hz'; dotR.lab.textContent = fR.toFixed(4) + ' Hz';
            (q.fastSide === 'L' ? dotL : dotR).el.classList.add('fbk-dot--right');
            if (side != null && !ok) (side === 'L' ? dotL : dotR).el.classList.add('fbk-dot--wrong');
            tip.textContent = '快 ' + q.fast.toFixed(4) + ' Hz　慢 ' + q.slow.toFixed(4) + ' Hz　（快的是慢的 ' + q.ratio.toFixed(4) + ' 倍）';
            if (ok) { kit.flash(stage, true, api.my); api.pass({ delay: 1300 }); return; }
            kit.flash(stage, false, api.my);
            api.fail({ delay: 2400, lines: [
                (side == null ? '時間到！' : '你選到比較慢的那顆') + '，閃得快的在' + (q.fastSide === 'L' ? '左邊' : '右邊'),
                '左邊 ' + fL.toFixed(4) + ' Hz　右邊 ' + fR.toFixed(4) + ' Hz'
            ] });
        }
        api.solve = function () { judge(q.fastSide); };
        api.wrong = function () { judge(q.fastSide === 'L' ? 'R' : 'L'); };
    }

    var G = {
        id: ID,
        name: '誰閃得快',
        rule: '左右各有一個圓點在閃爍，點「閃得比較快」的那一個。兩個圓點的顏色、位置、閃爍的起點都不一樣。點錯或來不及就結束，看你能過幾關。越後面，兩邊的快慢越接近！',
        mount: mount,
        score: SCORE,
        test: {
            ratioFor: ratioFor, ansMs: ansMs, isOn: isOn, makeLevel: makeLevel, countFlashes: countFlashes, rating: rating,
            RAMP_LEVELS: RAMP_LEVELS, RATIO: RATIO, SLOW_HZ: SLOW_HZ, ANS_S: ANS_S, MAX_LEVEL: MAX_LEVEL
        }
    };
    Reaction.register(G);
})();

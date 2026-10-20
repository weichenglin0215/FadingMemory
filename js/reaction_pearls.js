/* ═══════════════════════════════════════════════════════════════════
   reaction_pearls.js — 秒反應・吸珍珠（企劃 370）
   一杯珍珠奶茶。上方寫「吸 N 顆珍珠」。**按住吸管開始吸，珍珠一顆一顆（有時一串好幾顆擠在一起）沿著吸管往上衝，放手就停**。
   **剛好吸到 N 顆（珍珠衝到最上面、進到嘴裡的才算）就過關**；放手時多了或少了都失敗。每關只有「一次按住」，放手就是最後的答案。
   ───────────────────────────────────────────────────────────────────
   · 珍珠的時間表（makeLevel）：用「按住的時間 T（秒）」當時鐘——放手時 T 就停住。第 i 顆珍珠在 T ＝ arrive[i] 的時候衝到吸管最上面。
     珍珠分成「一串一串」：每串 1～CLUSTER_MAX 顆，串內相隔 GAP_IN 秒（又快又擠）、串與串之間相隔 GAP_SINGLE 秒（可以看出節奏）。
     **保證有解**：目標 N 剛好落在「一串的結尾」，而且第 N 顆和第 N+1 顆之間至少隔 MIN_WIN 秒——放手的窗口 [arrive[N−1], arrive[N]) 一定 ≥ MIN_WIN。
     N 顆之後再多排幾顆（EXTRA 顆），多了就失敗。
   · 判定（judgeRelease）：放手時的 T → 吸到的顆數 count ＝ arrive[i] ≤ T 的珍珠數；count＝N 過關，count < N「吸少了」，count > N「吸多了」。
     一直按到珍珠全部衝完（還是不放手）→ 自動判定（一定多了）。限時內沒按 → 失敗。
   · 難度（線性，到 RAMP_LEVELS 關到頂）：目標顆數 5 → 25、成串的機率 0.2 → 0.8、最大一串的顆數 2 → 4、
     單顆之間的間隔 0.42 → 0.20 秒、放手窗口 0.45 → 0.14 秒。
   · 揭曉：吸管裡還沒到嘴裡的珍珠停在原地；嘴裡的珍珠排成一排、依序編號，寫出「吸了 11 顆」，第 N 顆標綠色、多出來的標紅色。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'pearls';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 60 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 20;                       /* 幾關之後難度到頂 */
    var TARGET = [5, 25];                       /* 要吸幾顆：第 1 關 → 到頂（四捨五入） */
    var P_CLUSTER = [0.2, 0.8];                 /* 一串有多顆（≥ 2）的機率：第 1 關 → 到頂 */
    var CLUSTER_MAX = [2, 4];                   /* 一串最多幾顆：第 1 關 → 到頂（四捨五入） */
    var GAP_SINGLE = [0.42, 0.20];              /* 串與串（單顆）之間的間隔（秒）：第 1 關 → 到頂 */
    var GAP_IN = [0.10, 0.06];                  /* 同一串裡面兩顆之間的間隔（秒）：第 1 關 → 到頂 */
    var MIN_WIN = [0.45, 0.14];                 /* 第 N 顆和第 N+1 顆之間至少隔多久（放手的窗口，秒）：第 1 關 → 到頂 */
    var EXTRA = [4, 8];                         /* 第 N 顆之後再排幾顆（隨機） */
    var FIRST_AT = [0.5, 0.8];                  /* 第一顆衝到最上面的時間（按住後幾秒） */
    var GAP_JITTER = [0.85, 1.2];               /* 間隔的隨機倍率 */
    var TRAVEL_S = 0.28;                        /* 一顆珍珠從吸管底衝到最上面要多久（秒，看得到的移動） */
    var PRESS_LIMIT_S = 14;                     /* 限時：多久沒按住就失敗 */
    var END_GRACE = 0.25;                       /* 珍珠全部衝完之後再等多久（還沒放手就自動判定） */
    var MAX_LEVEL = 60;

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function ramp(level, pair) { return kit.ramp(level, pair[0], pair[1], RAMP_LEVELS); }
    function targetFor(level) { return Math.round(ramp(level, TARGET)); }
    function pClusterFor(level) { return Math.round(ramp(level, P_CLUSTER) * 1000) / 1000; }
    function clusterMaxFor(level) { return Math.round(ramp(level, CLUSTER_MAX)); }
    function gapSingleFor(level) { return Math.round(ramp(level, GAP_SINGLE) * 1000) / 1000; }
    function gapInFor(level) { return Math.round(ramp(level, GAP_IN) * 1000) / 1000; }
    function minWinFor(level) { return Math.round(ramp(level, MIN_WIN) * 1000) / 1000; }
    /* 把 total 顆分成一串一串：每串 1 顆（機率 1 − pCluster）或 2～maxSize 顆；最後一串剛好補滿 total */
    function splitClusters(total, pCluster, maxSize, rand) {
        var out = [], left = total;
        while (left > 0) {
            var sz = (maxSize >= 2 && rand() < pCluster) ? kit.randInt(2, maxSize, rand) : 1;
            sz = Math.min(sz, left); out.push(sz); left -= sz;
        }
        return out;
    }
    /* 出一關：{
         level, n（目標顆數）, total（珍珠總數）, clusters（每串幾顆，前 n 顆剛好湊滿）, arrive（每顆衝到最上面的時間，秒，遞增）,
         winStart／winEnd（放手剛好吸到 n 顆的窗口 [arrive[n−1], arrive[n]) ）, minWin } */
    function makeLevel(level, rand) {
        rand = rand || Math.random;
        var n = targetFor(level), pc = pClusterFor(level), cm = clusterMaxFor(level), gs = gapSingleFor(level), gi = gapInFor(level), mw = minWinFor(level);
        var extra = kit.randInt(EXTRA[0], EXTRA[1], rand);
        var c1 = splitClusters(n, pc, cm, rand), c2 = splitClusters(extra, pc, cm, rand), clusters = c1.concat(c2), arrive = [], t = kit.randFloat(FIRST_AT[0], FIRST_AT[1], rand), idx = 0, total = n + extra;
        for (var ci = 0; ci < clusters.length; ci++) {
            for (var k = 0; k < clusters[ci]; k++) {
                if (idx > 0) {
                    var within = k > 0;
                    if (within) t += gi * kit.randFloat(GAP_JITTER[0], GAP_JITTER[1], rand);
                    else if (idx === n) t += mw * kit.randFloat(1, 1.5, rand);                             /* 第 N 顆和第 N+1 顆之間：一定 ≥ minWin（放手的窗口） */
                    else t += gs * kit.randFloat(GAP_JITTER[0], GAP_JITTER[1], rand);
                }
                arrive.push(Math.round(t * 10000) / 10000); idx++;
            }
        }
        return { level: level, n: n, total: total, clusters: clusters, arrive: arrive, winStart: arrive[n - 1], winEnd: arrive[n], minWin: mw };
    }
    /* 按住 T 秒時，已經衝到最上面（進到嘴裡）的珍珠數 */
    function countAt(q, T) { var c = 0; for (var i = 0; i < q.arrive.length; i++) if (q.arrive[i] <= T + 1e-9) c++; return c; }
    /* 第 i 顆珍珠在按住 T 秒時的位置：0＝還在杯子裡（沒進吸管）、0～1＝在吸管裡往上衝、1＝已經到最上面 */
    function pearlPos(q, i, T) { return Math.max(0, Math.min(1, (T - (q.arrive[i] - TRAVEL_S)) / TRAVEL_S)); }
    /* 放手判定：回傳 { count, result: 'ok'｜'few'｜'many', diff（count − n） } */
    function judgeRelease(q, T) {
        var c = countAt(q, T);
        return { count: c, result: c === q.n ? 'ok' : (c < q.n ? 'few' : 'many'), diff: c - q.n };
    }
    function whyText(r, q) {
        if (r.result === 'ok') return '剛剛好 ' + q.n + ' 顆！';
        if (r.result === 'few') return '吸了 ' + r.count + ' 顆，要 ' + q.n + ' 顆——少了 ' + (-r.diff) + ' 顆';
        return '吸了 ' + r.count + ' 顆，要 ' + q.n + ' 顆——多了 ' + r.diff + ' 顆';
    }
    function rating(n) {
        if (n >= 15) return '珍珠達人！';
        if (n >= 9) return '數得很準！';
        if (n >= 5) return '不錯喔！';
        if (n >= 2) return '再接再厲！';
        return '邊吸邊數！';
    }

    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 5, stageClass: 'prl-stage',
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
        console.log('[吸珍珠] 第 ' + level + ' 關：吸 ' + q.n + ' 顆（共 ' + q.total + ' 顆，分成 ' + q.clusters.join('、') + '）；放手窗口 ' + q.winStart.toFixed(3) + '～' + q.winEnd.toFixed(3) + ' 秒（' + (q.winEnd - q.winStart).toFixed(3) + ' 秒）');

        var W = stage.clientWidth || 472, H = stage.clientHeight || 640;
        var field = h('div', { 'class': 'prl-field' });
        stage.appendChild(field);
        var goal = h('div', { 'class': 'prl-goal' });
        goal.appendChild(h('span', { 'class': 'prl-goal__t', text: '吸 ' })); goal.appendChild(h('span', { 'class': 'prl-goal__n', text: String(q.n) })); goal.appendChild(h('span', { 'class': 'prl-goal__t', text: ' 顆珍珠' }));
        field.appendChild(goal);
        var cx = Math.round(W / 2), strawTop = 118, cupTop = Math.round(H * 0.5), strawBot = cupTop + 36, L = strawBot - strawTop, SW = 46, PD = 30;
        /* 嘴（吸管上端）：珍珠衝到這裡就進嘴裡 */
        var mouth = h('div', { 'class': 'prl-mouth' }); mouth.style.cssText = 'left:' + (cx - 54) + 'px;top:' + (strawTop - 56) + 'px;'; field.appendChild(mouth);
        /* 杯子：透明的杯身、奶茶、杯底一堆珍珠（裝飾） */
        var cup = h('div', { 'class': 'prl-cup' }); cup.style.cssText = 'left:' + (cx - 118) + 'px;top:' + cupTop + 'px;width:236px;height:' + Math.round(H * 0.24) + 'px;'; field.appendChild(cup);
        var tea = h('div', { 'class': 'prl-tea' }); cup.appendChild(tea);
        for (var d = 0; d < 26; d++) { var dp = h('div', { 'class': 'prl-deco' }); dp.style.cssText = 'left:' + Math.round(10 + api.rand() * 196) + 'px;bottom:' + Math.round(4 + api.rand() * 38) + 'px;'; cup.appendChild(dp); }
        /* 吸管：從杯子裡一直伸到嘴 */
        var straw = h('div', { 'class': 'prl-straw' }); straw.style.cssText = 'left:' + (cx - SW / 2) + 'px;top:' + strawTop + 'px;width:' + SW + 'px;height:' + L + 'px;'; field.appendChild(straw);
        var pearls = q.arrive.map(function (a, i) { var p = h('div', { 'class': 'prl-pearl' }); p.style.cssText = 'left:' + (cx - PD / 2) + 'px;width:' + PD + 'px;height:' + PD + 'px;display:none;'; field.appendChild(p); return p; });
        var infoTop = cupTop + Math.round(H * 0.24) + 8, info = h('div', { 'class': 'qz-note prl-info', text: level === 1 ? '按住吸，數珍珠，剛好就放手！' : '按住吸、邊吸邊數、剛好就放手' }); info.style.top = infoTop + 'px'; field.appendChild(info);
        var row = h('div', { 'class': 'prl-row' }); row.style.cssText = 'display:none;top:' + (cupTop + 46) + 'px;'; field.appendChild(row);
        var holdEl = h('div', { 'class': 'prl-hold', text: '按住 吸' }); field.appendChild(holdEl);
        if (level === 1 && kit.once('pearls.hint')) kit.hintOn(stage, holdEl, { mode: 'hold', delay: 700, text: '按住吸，剛好就放手' });

        var phase = 'wait', tDown = 0, T = 0, ticked = 0, ctl = null, held = false;
        /* 畫：每顆珍珠的位置（吸管裡的才顯示；已經到嘴裡的和還在杯子裡的不顯示） */
        function paint(t) {
            for (var i = 0; i < pearls.length; i++) {
                var f = pearlPos(q, i, t), el = pearls[i];
                if (f > 0 && f < 1) { el.style.display = 'block'; el.style.top = Math.round(strawBot - PD - (L - PD) * f) + 'px'; } else el.style.display = 'none';
            }
        }
        paint(0);
        /* 開始吸：從按下去的那一刻起算「按住時間」T；每一格影格重畫珍珠、數到新的一顆就「咕嚕」一聲 */
        function begin() {
            phase = 'suck'; tDown = performance.now(); holdEl.classList.add('prl-hold--down'); mouth.classList.add('prl-mouth--suck'); straw.classList.add('prl-straw--suck'); api.stopTimer();
            api.my.loop(function (now) {
                if (phase !== 'suck' || !stage.isConnected) return false;
                T = (now - tDown) / 1000; paint(T);
                var c = countAt(q, T); while (ticked < c) { ticked++; Sfx.play('tick'); }
                if (T > q.arrive[q.total - 1] + END_GRACE) release('auto');
            });
            /* 保底：rAF 被暫停時，珍珠全部衝完的時間一到也要自動判定 */
            api.after(Math.round((q.arrive[q.total - 1] + END_GRACE) * 1000) + 300, function () { if (phase === 'suck') release('auto'); });
        }
        ctl = kit.hold(holdEl, {
            enabled: function () { return phase === 'wait'; },
            down: begin,
            up: function () { if (phase === 'suck') release('up'); }
        });
        api.my.onDispose(function () { ctl.destroy(); });
        api.timer(PRESS_LIMIT_S * 1000, function () { if (phase === 'wait') { phase = 'end'; info.textContent = '一直沒有吸！時間到了'; info.classList.add('prl-info--bad'); kit.flash(stage, false, api.my); api.fail({ delay: 2800, lines: ['一直沒有按住吸管', '目標是吸 ' + q.n + ' 顆珍珠'] }); } });

        /* 放手（或珍珠全部衝完）：用「放手那一刻的按住時間」判定 */
        function release(reason) {
            if (phase !== 'suck') return;
            T = (performance.now() - tDown) / 1000; if (reason === 'auto') T = q.arrive[q.total - 1] + END_GRACE;
            phase = 'end'; paint(T);
            holdEl.classList.remove('prl-hold--down'); mouth.classList.remove('prl-mouth--suck'); straw.classList.remove('prl-straw--suck');
            var r = judgeRelease(q, T), why = whyText(r, q);
            info.textContent = why;
            showRow(r);
            if (r.result === 'ok') { info.classList.add('prl-info--ok'); kit.flash(stage, true, api.my); api.pass({ delay: 2000 }); return; }
            info.classList.add('prl-info--bad'); kit.flash(stage, false, api.my);
            api.fail({ delay: 4000, lines: [why, '放手的窗口是按住 ' + q.winStart.toFixed(4) + '～' + q.winEnd.toFixed(4) + ' 秒之間（共 ' + (q.winEnd - q.winStart).toFixed(4) + ' 秒）', '你按住了 ' + T.toFixed(4) + ' 秒'] });
        }
        /* 揭曉：嘴裡的珍珠排成一排、依序編號；第 N 顆標綠色、多出來的標紅色 */
        function showRow(r) {
            row.innerHTML = ''; row.style.display = 'flex';
            var cols = Math.min(r.count, 13), size = Math.max(22, Math.min(40, Math.floor((W - 24) / Math.max(cols, 1)) - 4));
            for (var i = 0; i < r.count; i++) { var b = h('div', { 'class': 'prl-rowp' + (i < q.n ? (i === q.n - 1 ? ' prl-rowp--n' : '') : ' prl-rowp--extra'), text: String(i + 1) }); b.style.cssText = 'width:' + size + 'px;height:' + size + 'px;line-height:' + size + 'px;font-size:' + Math.round(size * 0.55) + 'px;'; row.appendChild(b); }
            if (!r.count) row.appendChild(h('div', { 'class': 'prl-rowp--none', text: '嘴裡一顆都沒有' }));
        }
        /* 驗證用：按住、在窗口中間放手（solve）／在窗口之後放手（wrong）；只排一次 */
        var armed = false;
        api.solve = function () { if (armed || phase !== 'wait') return; armed = true; ctl && holdSim((q.winStart + q.winEnd) / 2); };
        api.wrong = function () { if (armed || phase !== 'wait') return; armed = true; ctl && holdSim(q.winEnd + 0.03); };
        function holdSim(Tstar) { begin(); api.after(Math.round(Tstar * 1000), function () { release('up'); }); }
    }

    var G = {
        id: ID,
        name: '吸珍珠',
        rule: '一杯珍珠奶茶，上面寫著要吸 N 顆珍珠。**按住吸管開始吸**，珍珠一顆一顆（有時一串好幾顆擠在一起）沿著吸管往上衝，**放手就停**。**剛好吸到 N 顆（衝到最上面、進到嘴裡的才算）就過關**，多了少了都失敗；每關只有一次按住，放手就是答案。越後面，要吸的顆數越多（5 → 25）、珍珠成串的越多、衝得越快、放手的空檔越短！',
        mount: mount,
        score: SCORE,
        test: {
            targetFor: targetFor, pClusterFor: pClusterFor, clusterMaxFor: clusterMaxFor, gapSingleFor: gapSingleFor, gapInFor: gapInFor, minWinFor: minWinFor, splitClusters: splitClusters, makeLevel: makeLevel, countAt: countAt, pearlPos: pearlPos, judgeRelease: judgeRelease, whyText: whyText, rating: rating,
            RAMP_LEVELS: RAMP_LEVELS, TARGET: TARGET, P_CLUSTER: P_CLUSTER, CLUSTER_MAX: CLUSTER_MAX, GAP_SINGLE: GAP_SINGLE, GAP_IN: GAP_IN, MIN_WIN: MIN_WIN, EXTRA: EXTRA, FIRST_AT: FIRST_AT, GAP_JITTER: GAP_JITTER, TRAVEL_S: TRAVEL_S, PRESS_LIMIT_S: PRESS_LIMIT_S, END_GRACE: END_GRACE, MAX_LEVEL: MAX_LEVEL
        }
    };
    Reaction.register(G);
})();

/* ═══════════════════════════════════════════════════════════════════
   reaction_countbills.js — 秒反應・數鈔票（企劃 375）
   銀行櫃台的點鈔。一疊鈔票（面額 100、500、1000 元混在一起，順序打亂）。上方寫「數出 3700 元」。
   **每點一下，最上面那張鈔票就撥到右邊**（撥出去的那一疊只看得到最上面一張，要邊撥邊心算）。
   你覺得撥出去的剛好是目標金額，就按「好了」。**剛好才過關**；撥多了、撥少了、時間到都算失敗。
   ───────────────────────────────────────────────────────────────────
   · 一疊鈔票（makeLevel）：先決定「要撥幾張」n，從面額表隨機抽 n 張，目標金額＝這 n 張的總和；後面再多放 EXTRA 張（撥過頭的）。
     因為每張都是正數，「從上面撥 k 張的總和」一直在變大，所以**只有撥到第 n 張的時候總和剛好是目標**——保證有解、而且解唯一（沒有別的撥法剛好也湊到）。
     n 張裡至少有 2 種不同面額（不會全是同一種）。
   · 難度（線性，到 RAMP_LEVELS 關到頂）：要撥的張數 4 → 14、限時 15 → 8 秒；
     第 10 關起面額表加入 200 和 2000（顏色跟 100、1000 很接近，一不注意就加錯）。
   · 鈔票用顏色加大數字分面額（不仿真鈔）：只寫面額和簡單的花紋。
   · 揭曉：撥出去的鈔票全部攤開，一張一張累加：「3800 元，多了 100」；撥到第 n 張（剛好那張）標綠色、多撥的標紅色；撥少了就顯示下一張是什麼。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'countbills';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 90 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 30;                       /* 幾關之後難度到頂 */
    var COUNT = [4, 14];                        /* 要撥幾張才是目標：第 1 關 → 到頂（四捨五入） */
    var TIME_S = [15, 8];                       /* 限時（秒）：第 1 關 → 到頂 */
    var EXTRA = [4, 6];                         /* 目標之後再多放幾張（撥過頭用的，隨機） */
    var DENOMS_BASE = [100, 500, 1000];         /* 一開始的面額 */
    var DENOMS_LATER = [100, 200, 500, 1000, 2000];   /* 第 LATER_FROM 關起的面額（多了 200 和 2000） */
    var LATER_FROM = 10;
    var MAX_LEVEL = 90;

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function ramp(level, pair) { return kit.ramp(level, pair[0], pair[1], RAMP_LEVELS); }
    function countFor(level) { return Math.round(ramp(level, COUNT)); }
    function timeMs(level) { return Math.round(ramp(level, TIME_S) * 1000); }
    function denomsFor(level) { return level >= LATER_FROM ? DENOMS_LATER : DENOMS_BASE; }
    /* 撥出去前 k 張的總和 */
    function sumFirst(notes, k) { var s = 0; for (var i = 0; i < k && i < notes.length; i++) s += notes[i]; return s; }
    /* 出一關：{ level, notes（整疊鈔票從上到下的面額）, n（撥幾張剛好）, target（目標金額）, extra, time（限時毫秒）, denoms（這一關的面額表）} */
    function makeLevel(level, rand) {
        rand = rand || Math.random;
        var n = countFor(level), denoms = denomsFor(level), extra = kit.randInt(EXTRA[0], EXTRA[1], rand), notes = [], i;
        for (var tr = 0; tr < 100; tr++) {
            notes = []; for (i = 0; i < n; i++) notes.push(kit.pick(denoms, rand));
            if (new Set(notes).size >= 2) break;                                   /* 至少 2 種不同面額 */
        }
        if (new Set(notes).size < 2) notes[n - 1] = denoms[0] === notes[0] ? denoms[1] : denoms[0];
        var target = sumFirst(notes, n);
        for (i = 0; i < extra; i++) notes.push(kit.pick(denoms, rand));
        return { level: level, notes: notes, n: n, target: target, extra: extra, time: timeMs(level), denoms: denoms };
    }
    /* 撥了 taken 張的判定：{ sum, result: 'ok'｜'few'｜'many', diff（sum − target）} */
    function judge(q, taken) {
        var s = sumFirst(q.notes, taken);
        return { sum: s, result: s === q.target ? 'ok' : (s < q.target ? 'few' : 'many'), diff: s - q.target };
    }
    function whyText(r, q) {
        if (r.result === 'ok') return '剛剛好 ' + q.target + ' 元！';
        if (r.result === 'few') return '撥了 ' + r.sum + ' 元，目標 ' + q.target + ' 元——少了 ' + (-r.diff) + ' 元';
        return '撥了 ' + r.sum + ' 元，目標 ' + q.target + ' 元——多了 ' + r.diff + ' 元';
    }
    function rating(n) {
        if (n >= 15) return '點鈔達人！';
        if (n >= 9) return '心算很快！';
        if (n >= 5) return '不錯喔！';
        if (n >= 2) return '再接再厲！';
        return '邊撥邊加！';
    }

    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 5, stageClass: 'cbl-stage',
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['通過 ' + S.cleared + ' 關']; },
            setup: setup
        });
    }

    /* 一張鈔票（div）：底色依面額（CSS class cbl-d100…）、中間大大的面額、四個角落小字與花紋 */
    function noteEl(v, cls) {
        var el = h('div', { 'class': 'cbl-note cbl-d' + v + (cls ? ' ' + cls : '') });
        el.appendChild(h('div', { 'class': 'cbl-note__c cbl-note__c--l', text: String(v) }));
        el.appendChild(h('div', { 'class': 'cbl-note__c cbl-note__c--r', text: String(v) }));
        el.appendChild(h('div', { 'class': 'cbl-note__v', text: String(v) }));
        el.appendChild(h('div', { 'class': 'cbl-note__p' }));
        return el;
    }

    function setup(api) {
        var stage = api.stage, level = api.level;
        var q = makeLevel(level, api.rand);
        api.info = q;
        console.log('[數鈔票] 第 ' + level + ' 關：目標 ' + q.target + ' 元＝前 ' + q.n + ' 張（' + q.notes.slice(0, q.n).join('+') + '）；整疊 ' + q.notes.length + ' 張；限時 ' + q.time + ' 毫秒');

        var W = stage.clientWidth || 472, H = stage.clientHeight || 640;
        var NW = Math.min(210, Math.round((W - 60) / 2)), NH = Math.round(NW * 0.52), top0 = 130;
        var field = h('div', { 'class': 'cbl-field' });
        stage.appendChild(field);
        var goal = h('div', { 'class': 'cbl-goal' });
        goal.appendChild(h('span', { 'class': 'cbl-goal__t', text: '數出 ' })); goal.appendChild(h('span', { 'class': 'cbl-goal__n', text: String(q.target) })); goal.appendChild(h('span', { 'class': 'cbl-goal__t', text: ' 元' }));
        field.appendChild(goal);
        var lab1 = h('div', { 'class': 'cbl-lab', text: '點一下撥一張' }), lab2 = h('div', { 'class': 'cbl-lab', text: '撥出去的' });
        lab1.style.cssText = 'left:20px;top:' + (top0 - 38) + 'px;width:' + NW + 'px;'; lab2.style.cssText = 'right:20px;top:' + (top0 - 38) + 'px;width:' + NW + 'px;'; field.appendChild(lab1); field.appendChild(lab2);
        /* 整疊鈔票（全部先放好，用 class 控制在「疊上」還是「撥出去」） */
        var table = h('div', { 'class': 'cbl-table' }); table.style.cssText = 'top:' + top0 + 'px;height:' + (NH + 40) + 'px;'; field.appendChild(table);
        var els = q.notes.map(function (v, i) { var el = noteEl(v, ''); el.style.cssText = 'width:' + NW + 'px;height:' + NH + 'px;'; table.appendChild(el); return el; });
        var taken = 0, phase = 'play';
        /* 排位置：每張鈔票都用 transform 擺在「疊上（左邊）」或「撥出去（右邊）」；
           疊上只畫最上面 3 張（越下面越暗、偏下一點）；撥出去只畫最後撥的 3 張（歪一點點）——其他的藏在底下看不到 */
        function layout() {
            els.forEach(function (el, i) {
                var out = i < taken, depth = out ? (taken - 1 - i) : (i - taken);               /* 疊上：離最上面幾張；撥出去：離最後撥的那張幾張 */
                if (depth > 2) { el.style.display = 'none'; return; }
                el.style.display = 'block'; el.style.zIndex = String(10 - depth);
                var x = out ? W - 20 - NW : 20, rot = out ? [3, -4, 5][depth] : 0, dy = depth * 6;
                el.style.transform = 'translate(' + x + 'px,' + dy + 'px) rotate(' + rot + 'deg)';
                el.classList.toggle('cbl-note--out', out); el.classList.toggle('cbl-note--under', !out && depth > 0);
            });
        }
        layout();
        var info = h('div', { 'class': 'qz-note cbl-info', text: level === 1 ? '算好了就按「好了」，多了少了都不行！' : '邊撥邊心算，剛好就按「好了」' }); info.style.top = (top0 + NH + 56) + 'px'; field.appendChild(info);
        var btn = kit.btnGrid(field, [{ text: '好了！', kind: 'primary', cls: 'cbl-btn', onTap: function () { done('done'); } }], { cols: 1, h: 96, bottom: 12 });
        if (level === 1 && kit.once('countbills.hint')) kit.hintOn(stage, null, { mode: 'tap', x: 20 + NW / 2, y: top0 + NH / 2, delay: 700, text: '點一下，最上面那張就撥出去' });
        /* 撥一張：點「疊上」的區域（整個桌面都可以點，手指比較好點） */
        table.addEventListener('pointerdown', function (e) {
            if (phase !== 'play' || api.over) return;
            e.preventDefault();
            if (taken >= q.notes.length) return;
            taken++; layout(); Sfx.play('tick');
        });
        api.timer(q.time, function () { done('timeout'); });

        /* 按「好了」（或時間到）：把撥出去的鈔票攤開，一張一張累加 */
        function done(kind) {
            if (phase !== 'play' || api.over) return;
            phase = 'end'; api.stopTimer();
            var r = judge(q, taken), why = (kind === 'timeout' ? '時間到！' : '') + whyText(r, q);
            btn.btns[0].classList.add('cbl-btn--off');
            table.style.display = 'none'; lab1.style.display = 'none'; lab2.style.display = 'none';
            showSpread(r);
            info.textContent = why; info.style.top = ''; info.style.bottom = '124px';
            if (r.result === 'ok') { info.classList.add('cbl-info--ok'); kit.flash(stage, true, api.my); Sfx.play('ok'); api.pass({ delay: 2200 }); return; }
            info.classList.add('cbl-info--bad'); kit.flash(stage, false, api.my);
            api.fail({ delay: 4200, lines: [why, '前 ' + q.n + ' 張是 ' + q.notes.slice(0, q.n).join('＋') + ' ＝ ' + q.target + ' 元', '你撥了 ' + taken + ' 張：' + (taken ? q.notes.slice(0, taken).join('＋') : '（沒撥）') + ' ＝ ' + r.sum + ' 元'] });
        }
        /* 攤開：每張一個小格，下面寫累加的總和；剛好湊到目標的那張標綠、多撥的標紅；撥少了就多顯示下一張（灰色） */
        function showSpread(r) {
            var box = h('div', { 'class': 'cbl-spread' }); box.style.top = '110px';
            var show = Math.max(taken, 0), cols = 4, cw = Math.floor((W - 24 - (cols - 1) * 8) / cols), nh = Math.round(cw * 0.52), run = 0, count = show + (r.result === 'few' ? 1 : 0);
            if (!show) box.appendChild(h('div', { 'class': 'cbl-spread__none', text: '一張都沒撥' }));
            for (var i = 0; i < count; i++) {
                var v = q.notes[i], cell = h('div', { 'class': 'cbl-cell' }), ghost = i >= taken;
                if (!ghost) run += v;
                var m = noteEl(v, 'cbl-note--mini' + (ghost ? ' cbl-note--ghost' : '') + (!ghost && i === q.n - 1 ? ' cbl-note--hit' : '') + (!ghost && i >= q.n ? ' cbl-note--extra' : ''));
                m.style.cssText = 'position:relative;width:' + cw + 'px;height:' + nh + 'px;'; cell.style.width = cw + 'px';
                cell.appendChild(m); cell.appendChild(h('div', { 'class': 'cbl-cell__s' + (ghost ? ' cbl-cell__s--ghost' : ''), text: ghost ? '下一張' : String(run) })); box.appendChild(cell);
            }
            field.appendChild(box);
        }
        /* 驗證用：撥 n 張再按好了（solve）／少撥一張再按好了（wrong）；只排一次 */
        var armed = false;
        function run(cnt) { armed = true; for (var i = 0; i < cnt; i++) (function (k) { api.after(60 + k * 90, function () { if (phase === 'play') { taken++; layout(); } }); })(i); api.after(60 + cnt * 90 + 80, function () { done('done'); }); }
        api.solve = function () { if (!armed && phase === 'play') run(q.n); };
        api.wrong = function () { if (!armed && phase === 'play') run(q.n - 1); };
    }

    var G = {
        id: ID,
        name: '數鈔票',
        rule: '一疊鈔票，面額 100、500、1000 元混在一起，順序打亂。上面寫著**目標金額**（例如「數出 3700 元」）。**每點一下，最上面那張鈔票就撥到右邊**，要邊撥邊心算。你覺得撥出去的剛好是目標金額，就**按「好了」**。多了、少了、時間到都失敗；撥過頭不能回頭。**第 10 關起加入 200 元和 2000 元**，顏色很接近，小心加錯！',
        mount: mount,
        score: SCORE,
        test: {
            countFor: countFor, timeMs: timeMs, denomsFor: denomsFor, sumFirst: sumFirst, makeLevel: makeLevel, judge: judge, whyText: whyText, rating: rating,
            RAMP_LEVELS: RAMP_LEVELS, COUNT: COUNT, TIME_S: TIME_S, EXTRA: EXTRA, DENOMS_BASE: DENOMS_BASE, DENOMS_LATER: DENOMS_LATER, LATER_FROM: LATER_FROM, MAX_LEVEL: MAX_LEVEL
        }
    };
    Reaction.register(G);
})();

/* ═══════════════════════════════════════════════════════════════════
   reaction_witness.js — 秒反應・目擊證人
   警察局裡先看一張嫌疑人的臉幾秒鐘，臉收起來之後，從一排人裡指出剛才那一個。越後面大家越像，
   只差一個特徵。
   ───────────────────────────────────────────────────────────────────
   · 臉由 7 個特徵拼成（全部自繪 SVG）：臉型 3、髮型 5、眼睛 3、眉毛 3、鼻子 3、嘴巴 3、配件 4（無／眼鏡／鬍子／帽子）。
     一張臉＝ 7 個數字的向量 [臉型, 髮型, 眼睛, 眉毛, 鼻子, 嘴巴, 配件]。
   · 出題（makeSuspects）：目標臉＝隨機向量；每張干擾臉與目標「恰好有 d 個特徵不同」（d 從 4 線性降到 1），
     干擾臉彼此不同、也不等於目標，所以正解唯一（距離 0 的只有目標）。
   · 難度（第 1 → LEVEL_RAMP 關線性）：d 4 → 1、選項數 4 → 8、看臉時間 4.0 → 1.5 秒、作答時限 15 → 8 秒。
   · 有 LIVES 次機會（選錯或超時扣一次），成績＝通過關數（越多越好）。
   ═══════════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    var ID = 'witness';
    var h = UI.h;
    var kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var LEVEL_RAMP = 15;
    var D_START = 3, D_END = 1;               /* 干擾臉與目標差幾個特徵 */
    var OPTS_START = 4, OPTS_END = 8;         /* 選項（含目標）數量 */
    var LOOK_START = 4.0, LOOK_END = 6.0;     /* 看臉秒數 */
    var PICK_START = 10, PICK_END = 15;        /* 作答時限（秒） */
    var LIVES = 1;
    var NEXT_MS = 1500;
    /* 每個特徵有幾種 */
    var SIZES = [3, 5, 3, 3, 3, 3, 4];
    var FEATURE_NAME = ['臉型', '髮型', '眼睛', '眉毛', '鼻子', '嘴巴', '配件'];
    var VALUE_NAME = [
        ['圓臉', '長臉', '方臉'], ['短髮', '旁分', '長髮', '捲髮', '刺蝟頭'], ['圓眼', '瞇瞇眼', '大眼'],
        ['平眉', '凶眉', '彎眉'], ['小圓鼻', '三角鼻', '長鼻'], ['微笑', '平嘴', '張嘴'], ['沒有配件', '眼鏡', '鬍子', '帽子']
    ];

    function fmtBest(v) { return v == null ? '' : '最佳 ' + v + ' 關'; }

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function dFor(level) { return Math.round(kit.ramp(level, D_START, D_END, LEVEL_RAMP)); }
    function optsFor(level) { return Math.round(kit.ramp(level, OPTS_START, OPTS_END, LEVEL_RAMP)); }
    function lookSec(level) { return kit.ramp(level, LOOK_START, LOOK_END, LEVEL_RAMP); }
    function pickSec(level) { return kit.ramp(level, PICK_START, PICK_END, LEVEL_RAMP); }
    function randFace(rand) { return SIZES.map(function (n) { return kit.randInt(0, n - 1, rand); }); }
    function hamming(a, b) { var d = 0; for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) d++; return d; }
    function key(f) { return f.join(','); }
    /* 與 base 恰好有 d 個特徵不同的一張臉 */
    function variant(base, d, rand) {
        var idx = kit.shuffle(base.map(function (_, i) { return i; }), rand).slice(0, d), f = base.slice();
        idx.forEach(function (i) {
            var v; do { v = kit.randInt(0, SIZES[i] - 1, rand); } while (v === base[i]);
            f[i] = v;
        });
        return f;
    }
    /* 出一關：回傳 { target, faces:[…（含目標，已洗牌）], answer（目標在 faces 的索引）, d } */
    function makeSuspects(level, rand) {
        rand = rand || Math.random;
        var d = dFor(level), n = optsFor(level), target = randFace(rand), seen = {}, faces = [target];
        seen[key(target)] = 1;
        for (var tries = 0; faces.length < n && tries < 5000; tries++) {
            var v = variant(target, d, rand);
            if (seen[key(v)]) continue;
            seen[key(v)] = 1; faces.push(v);
        }
        var order = kit.shuffle(faces.map(function (_, i) { return i; }), rand);
        var shuffled = order.map(function (i) { return faces[i]; });
        return { target: target, faces: shuffled, answer: order.indexOf(0), d: d };
    }
    /* 兩張臉的差異說明（給結算用）*/
    function diffText(a, b) {
        var t = [];
        for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) t.push(FEATURE_NAME[i] + '：' + VALUE_NAME[i][a[i]] + ' → ' + VALUE_NAME[i][b[i]]);
        return t;
    }

    /* ═══ 畫臉 ═══ */
    var SKIN = 'hsl(28,62%,80%)', HAIR = 'hsl(24,42%,24%)', INK = 'hsl(24,40%,22%)';
    function drawFace(f, parent) {
        var svg = kit.svg('svg', { 'class': 'wt-face', viewBox: '0 -30 200 270' }, parent);
        var S = function (tag, a) { return kit.svg(tag, a, svg); };
        var line = { fill: 'none', stroke: INK, 'stroke-width': 5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
        function L(tag, a) { var o = {}, k; for (k in line) o[k] = line[k]; for (k in a) o[k] = a[k]; return S(tag, o); }
        /* 髮型（畫在臉後面的部分）*/
        var hair = f[1];
        if (hair === 2) S('path', { d: 'M22 196 Q12 40 100 30 Q188 40 178 196 L156 196 Q158 96 100 82 Q42 96 44 196 Z', fill: HAIR });
        /* 臉 */
        var shape = f[0];
        if (shape === 0) S('ellipse', { cx: 100, cy: 125, rx: 72, ry: 78, fill: SKIN, stroke: INK, 'stroke-width': 4 });
        else if (shape === 1) S('ellipse', { cx: 100, cy: 126, rx: 58, ry: 92, fill: SKIN, stroke: INK, 'stroke-width': 4 });
        else S('rect', { x: 30, y: 48, width: 140, height: 158, rx: 34, fill: SKIN, stroke: INK, 'stroke-width': 4 });
        /* 髮型（前面的部分）*/
        if (hair === 0) S('path', { d: 'M30 112 Q28 44 100 40 Q172 44 170 112 Q150 82 100 80 Q50 82 30 112 Z', fill: HAIR });
        else if (hair === 1) S('path', { d: 'M28 120 Q20 40 100 36 Q182 38 172 104 Q122 62 70 92 Q48 102 28 120 Z', fill: HAIR });
        else if (hair === 3) [[52, 66], [80, 50], [110, 48], [138, 58], [152, 84], [48, 96]].forEach(function (p) { S('circle', { cx: p[0], cy: p[1], r: 24, fill: HAIR }); });
        else if (hair === 4) S('path', { d: 'M30 104 L38 48 L62 80 L76 34 L100 72 L124 34 L138 80 L162 48 L170 104 Q100 72 30 104 Z', fill: HAIR });
        /* 眉毛 */
        var br = f[3];
        if (br === 0) { L('path', { d: 'M54 98 H84' }); L('path', { d: 'M116 98 H146' }); }
        else if (br === 1) { L('path', { d: 'M54 90 L84 104' }); L('path', { d: 'M146 90 L116 104' }); }
        else { L('path', { d: 'M54 102 Q69 84 84 100' }); L('path', { d: 'M116 100 Q131 84 146 102' }); }
        /* 眼睛 */
        var ey = f[2];
        if (ey === 0) { S('circle', { cx: 70, cy: 118, r: 8, fill: INK }); S('circle', { cx: 130, cy: 118, r: 8, fill: INK }); }
        else if (ey === 1) { L('path', { d: 'M56 118 H84' }); L('path', { d: 'M116 118 H144' }); }
        else { S('ellipse', { cx: 70, cy: 118, rx: 14, ry: 11, fill: '#fff', stroke: INK, 'stroke-width': 3 }); S('ellipse', { cx: 130, cy: 118, rx: 14, ry: 11, fill: '#fff', stroke: INK, 'stroke-width': 3 }); S('circle', { cx: 70, cy: 119, r: 6, fill: INK }); S('circle', { cx: 130, cy: 119, r: 6, fill: INK }); }
        /* 鼻子 */
        var no = f[4];
        if (no === 0) S('circle', { cx: 100, cy: 144, r: 5, fill: INK });
        else if (no === 1) L('path', { d: 'M100 128 L88 152 H112 Z' });
        else L('path', { d: 'M100 124 V154' });
        /* 嘴巴 */
        var mo = f[5];
        if (mo === 0) L('path', { d: 'M72 172 Q100 198 128 172' });
        else if (mo === 1) L('path', { d: 'M76 178 H124' });
        else S('ellipse', { cx: 100, cy: 180, rx: 18, ry: 12, fill: INK });
        /* 配件 */
        var ac = f[6];
        if (ac === 1) { L('circle', { cx: 70, cy: 118, r: 20 }); L('circle', { cx: 130, cy: 118, r: 20 }); L('path', { d: 'M90 116 H110' }); }
        else if (ac === 2) S('path', { d: 'M66 164 Q84 148 100 160 Q116 148 134 164 Q116 172 100 166 Q84 172 66 164 Z', fill: HAIR });
        else if (ac === 3) { S('ellipse', { cx: 100, cy: 56, rx: 84, ry: 14, fill: 'hsl(210,60%,46%)', stroke: INK, 'stroke-width': 3 }); S('path', { d: 'M46 54 Q46 -16 100 -16 Q154 -16 154 54 Z', fill: 'hsl(210,60%,52%)', stroke: INK, 'stroke-width': 3 }); }
        return svg;
    }

    function mount(root, ctx) {
        var R = null;

        /* startAt：從第幾關開始（失敗後可從前 5 關繼續）*/
        function round(startAt) {
            if (R) R.dispose();
            R = kit.round();
            var my = R;
            root.innerHTML = '';

            var level = startAt || 1, cleared = level - 1, lives = LIVES, newRec = false, state = 'idle', lvId = 0, S = null;
            var head = h('div', { 'class': 'wt-head' });
            var banner = h('div', { 'class': 'wt-banner' });
            var stage = h('div', { 'class': 'wt-stage' });
            var tb = kit.timebar();
            [head, banner, stage, tb.el].forEach(function (n) { root.appendChild(n); });

            function meta() { ctx.setMeta(kit.meta(['第 ' + level + ' 關', '機會 ' + lives])); }

            function startLevel() {
                if (my.dead) return;
                var id = ++lvId;
                S = makeSuspects(level);
                state = 'look';
                head.textContent = '第 ' + level + ' 關';
                banner.textContent = '記住這個嫌疑人的臉！';
                stage.className = 'wt-stage wt-stage--look';
                stage.innerHTML = '';
                var big = h('div', { 'class': 'wt-big' }); stage.appendChild(big);
                drawFace(S.target, big);
                meta();
                try { console.info('[目擊證人] 第 ' + level + ' 關：目標 ' + S.target.map(function (v, i) { return VALUE_NAME[i][v]; }).join('／') + '；干擾臉各差 ' + S.d + ' 個特徵，共 ' + S.faces.length + ' 張，正解是第 ' + (S.answer + 1) + ' 張；看 ' + lookSec(level).toFixed(1) + ' 秒、選 ' + pickSec(level).toFixed(0) + ' 秒'); } catch (e) { }
                var t0 = performance.now(), lim = lookSec(level) * 1000;
                my.loop(function (now) { if (id !== lvId || state !== 'look') return false; tb.set(1 - (now - t0) / lim); });
                my.after(lim, function () { if (id === lvId && state === 'look') startPick(id); });
            }

            function startPick(id) {
                state = 'pick';
                banner.textContent = '剛才那個人是誰？';
                stage.className = 'wt-stage wt-stage--pick';
                stage.innerHTML = '';
                Sfx.play('go');
                S.faces.forEach(function (f, i) {
                    var cell = h('button', { 'class': 'wt-cell' });
                    drawFace(f, cell);
                    cell.addEventListener('pointerdown', function (e) { e.preventDefault(); pick(i); });
                    stage.appendChild(cell);
                });
                var t0 = performance.now(), lim = pickSec(level) * 1000;
                my.loop(function (now) { if (id !== lvId || state !== 'pick') return false; tb.set(1 - (now - t0) / lim); });
                my.after(lim, function () { if (id === lvId && state === 'pick') pick(-1); });
            }

            function pick(i) {
                if (state !== 'pick') return;
                state = 'reveal';
                tb.set(0);
                var cells = stage.children;
                cells[S.answer].classList.add('wt-cell--ok');
                var ok = i === S.answer;
                if (!ok && i >= 0) cells[i].classList.add('wt-cell--bad');
                if (ok) {
                    cleared = level;
                    if (Reaction.setBest(ID, cleared, function (v, b) { return v > b; })) newRec = true;
                    Sfx.play('win');
                    banner.textContent = '抓對了！';
                    level++; meta();
                    my.after(NEXT_MS - 400, startLevel);
                    return;
                }
                lives--;
                Sfx.play('bad');
                var diffs = i >= 0 ? diffText(S.faces[i], S.target) : [];
                banner.textContent = i < 0 ? '時間到！綠框才是嫌疑人' : '抓錯了！綠框才是嫌疑人' + (diffs.length ? '（你選的人' + diffs[0].replace(' → ', '，嫌疑人是') + '）' : '');
                meta();
                if (lives <= 0) {
                    my.after(2200, function () {
                        var back = kit.resumeFrom(level);
                        kit.result(root, {
                            num: cleared + ' 關', label: cleared >= 8 ? '火眼金睛！' : (cleared >= 4 ? '記性不錯！' : '再試一次，會更準！'),
                            lines: diffs.slice(0, 3), isNew: newRec, sfx: cleared >= 5 ? 'win' : 'fail', onAgain: function () { round(1); },
                            resume: { level: back, run: function () { round(back); } }
                        });
                    });
                } else my.after(2200, startLevel);
            }

            G.debug = {
                state: function () { return { level: level, state: state, lives: lives, cleared: cleared, S: S }; },
                pickRight: function () { if (state === 'pick') pick(S.answer); return state; },
                pickWrong: function () { if (state === 'pick') pick((S.answer + 1) % S.faces.length); return state; },
                skipLook: function () { if (state === 'look') startPick(lvId); }
            };
            my.after(300, startLevel);
        }

        round(1);
    }

    var G = {
        id: ID,
        name: '目擊證人',
        rule: '先看一張嫌疑人的臉，記住他的特徵。臉收起來之後，從一排人裡點出剛才那一個。越後面，大家越像！',
        mount: mount,
        test: { dFor: dFor, optsFor: optsFor, lookSec: lookSec, pickSec: pickSec, randFace: randFace, hamming: hamming, variant: variant, makeSuspects: makeSuspects, diffText: diffText, SIZES: SIZES, LEVEL_RAMP: LEVEL_RAMP }
    };
    Reaction.register(G);
})();

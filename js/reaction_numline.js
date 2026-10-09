/* ═══════════════════════════════════════════════════════════════════
   reaction_numline.js — 秒反應・數線落點（原企劃「031 數線落點」的復活版）
   出現一個 0～1 之間的數（可能寫成小數 0.37、分數 3/8、或百分比 37%），數線上只標了 0 和 1，
   用手指把圓點拖到你覺得它該在的位置，按「確定」。誤差在容許範圍內才過關，容許範圍一關比一關小。
   關卡制：答錯就結束，成績＝過了幾關。
   ───────────────────────────────────────────────────────────────────
   · 一關只用一種寫法（不再混雜）：小數／分數／百分比隨機。前幾關的數字比較「整」（0.35、1/4、40%），
     越後面越「碎」（0.37、5/13、37%）。數字一律離 0 與 1 至少 0.05，也離「畫面中央的起點」至少 0.12，
     所以圓點一開始不會剛好就在答案附近。
   · 容許誤差 TOL：第 1 關 ±0.10（10%）→ 第 TOL_RAMP 關 ±0.01（1%），線性。
   · 圓點跟著手指的橫向位置走（手指在數線下方的拖曳區，不會擋住圓點）；可以反覆拖、按「確定」才算。
   · 揭曉：正確位置畫一根綠色刻度並標出數字，你的圓點與它的距離用 4 位小數寫出來。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'numline';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 40 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var TOL = [0.10, 0.01];                     /* 容許誤差（數線全長 ＝ 1）：第 1 關 → 到頂 */
    var TOL_RAMP = 15;                          /* 幾關之後容許誤差縮到最小 */
    var MAX_LEVEL = 40;
    var V_MIN = 0.05, V_MAX = 0.95;             /* 數字離 0 與 1 至少多遠 */
    var START = 0.5;                            /* 圓點一開始的位置 */
    var START_GAP = 0.12;                       /* 答案離起點至少多遠 */
    var LINE_PAD = 36;                          /* 數線左右兩端離畫面邊緣 */
    var FORMS = ['decimal', 'fraction', 'percent'];

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function tolAt(level) { return kit.ramp(level, TOL[0], TOL[1], TOL_RAMP); }
    function gcd(a, b) { return b ? gcd(b, a % b) : a; }
    /* 這一關的題目：{ form, v（0～1 的真值）, text（畫面上的寫法）, tol } */
    function makeQuestion(level, rand) {
        rand = rand || Math.random;
        var form = kit.pick(FORMS, rand), tol = tolAt(level), fine = kit.ramp(level, 0, 1, 10);   /* fine：0＝整齊的數、1＝零碎的數 */
        for (var tr = 0; tr < 200; tr++) {
            var v, text;
            if (form === 'decimal') {
                var k = fine < 0.5 ? kit.randInt(1, 19, rand) * 5 : kit.randInt(5, 95, rand);
                v = k / 100; text = v.toFixed(2);
            } else if (form === 'percent') {
                var p = fine < 0.5 ? kit.randInt(1, 19, rand) * 5 : kit.randInt(5, 95, rand);
                v = p / 100; text = p + '%';
            } else {
                var dens = fine < 0.5 ? [2, 3, 4, 5, 6, 8, 10] : [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15, 16];
                var d = kit.pick(dens, rand), n = kit.randInt(1, d - 1, rand);
                if (gcd(n, d) !== 1) continue;
                v = n / d; text = n + '/' + d;
            }
            if (v < V_MIN || v > V_MAX || Math.abs(v - START) < START_GAP) continue;
            return { form: form, v: v, text: text, tol: tol };
        }
        return { form: 'decimal', v: 0.75, text: '0.75', tol: tol };
    }
    /* 判定：誤差在容許範圍內（含邊界）就過 */
    function judge(pos, v, tol) { var err = Math.abs(pos - v); return { ok: err <= tol + 1e-12, err: err }; }
    function rating(n) {
        if (n >= 25) return '數感大師！';
        if (n >= 15) return '數感很好！';
        if (n >= 8) return '不錯喔！';
        if (n >= 3) return '再接再厲！';
        return '多想想它大概是幾分之幾，再試一次！';
    }

    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 6,
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['通過 ' + S.cleared + ' 關']; },
            stageClass: 'nl-stage',
            setup: setup
        });
    }

    function setup(api) {
        var stage = api.stage, level = api.level;
        var q = makeQuestion(level, api.rand);
        api.info = q;
        var W = stage.clientWidth || 472, H = stage.clientHeight || 640;
        var X0 = LINE_PAD, X1 = W - LINE_PAD, LY = Math.round(H * 0.36), LEN = X1 - X0;
        console.log('[數線落點] 第 ' + level + ' 關：' + q.text + '（＝' + q.v.toFixed(4) + '）；容許 ±' + q.tol.toFixed(4) + '（±' + (q.tol * LEN).toFixed(1) + 'px）');

        var big = h('div', { 'class': 'nl-big', text: q.text });
        var tip = h('div', { 'class': 'nl-tip', text: '拖到這個數該在的位置，再按「確定」' });
        stage.appendChild(big); stage.appendChild(tip);
        var svg = kit.svg('svg', { 'class': 'nl-svg', viewBox: '0 0 ' + W + ' ' + H, width: W, height: H }, stage);
        kit.svg('line', { x1: X0, x2: X1, y1: LY, y2: LY, 'class': 'nl-line' }, svg);
        [[X0, '0'], [X1, '1']].forEach(function (t) {
            kit.svg('line', { x1: t[0], x2: t[0], y1: LY - 16, y2: LY + 16, 'class': 'nl-tick' }, svg);
            var tx = kit.svg('text', { x: t[0], y: LY + 46, 'text-anchor': 'middle', 'class': 'nl-label' }, svg); tx.textContent = t[1];
        });
        var gAns = kit.svg('g', {}, svg);
        var pos = START;
        var stem = kit.svg('line', { x1: 0, x2: 0, y1: LY - 70, y2: LY, 'class': 'nl-stem' }, svg);
        var dot = kit.svg('circle', { cx: 0, cy: LY - 70, r: 20, 'class': 'nl-dot' }, svg);
        function xOf(v) { return X0 + v * LEN; }
        function paint() {
            var x = xOf(pos);
            stem.setAttribute('x1', x); stem.setAttribute('x2', x); dot.setAttribute('cx', x);
        }
        paint();
        /* 拖曳區：數線下方一大塊，手指在這裡橫向移動，圓點跟著走（手指不會擋住圓點） */
        var pad = h('div', { 'class': 'nl-pad' });
        pad.style.top = (LY + 70) + 'px'; pad.style.height = (H - LY - 70 - 84 - 12) + 'px';
        var okBtn = h('button', { 'class': 'btn btn--go nl-ok', text: '確定' });
        stage.appendChild(pad); stage.appendChild(okBtn);
        var locked = false, hint = null, dragging = null;
        function fromPointer(e) { var p = kit.localPt(e, pad); pos = kit.clamp((p.x - X0) / LEN, 0, 1); paint(); }
        pad.addEventListener('pointerdown', function (e) {
            if (locked || dragging != null) return;
            e.preventDefault();
            try { pad.setPointerCapture(e.pointerId); } catch (err) { }
            dragging = e.pointerId; if (hint) { hint.remove(); hint = null; }
            fromPointer(e);
        });
        pad.addEventListener('pointermove', function (e) { if (dragging === e.pointerId && !locked) fromPointer(e); });
        function endDrag(e) { if (dragging === e.pointerId) dragging = null; }
        pad.addEventListener('pointerup', endDrag); pad.addEventListener('pointercancel', endDrag);
        pad.appendChild(h('div', { 'class': 'nl-pad__text', text: '在這裡左右拖曳' }));
        /* 操作提示（只在第一次進遊戲時）：手指＋箭頭，從圓點現在的位置往「正確的位置」重複移動（第一關的正確答案）；手指擺在數線下方的拖曳區 */
        if (level === 1 && kit.once('numline.hint')) {
            var y = LY + 70 + 60;
            hint = kit.fingerHint(stage, { mode: 'drag', x: xOf(pos), y: y, dx: xOf(q.v) - xOf(pos), dy: 0, delay: 400, text: '請往左右拖曳圓點' });
        }
        var msg = h('div', { 'class': 'nl-msg' });
        stage.appendChild(msg);

        function submit() {
            if (locked || api.over) return;
            locked = true; if (hint) { hint.remove(); hint = null; }
            Sfx.play('click');
            var r = judge(pos, q.v, q.tol);
            /* 揭曉：綠色刻度標出正確位置，還有容許範圍（淡綠色底） */
            var ax = xOf(q.v);
            kit.svg('rect', { x: Math.max(X0, xOf(q.v - q.tol)), y: LY - 16, width: Math.min(X1, xOf(q.v + q.tol)) - Math.max(X0, xOf(q.v - q.tol)), height: 32, 'class': 'nl-tol' }, gAns);
            kit.svg('line', { x1: ax, x2: ax, y1: LY - 34, y2: LY + 34, 'class': 'nl-ans' }, gAns);
            var tx = kit.svg('text', { x: ax, y: LY + 78, 'text-anchor': 'middle', 'class': 'nl-anslabel' }, gAns); tx.textContent = q.text + '＝' + q.v.toFixed(4);
            msg.textContent = (r.ok ? '落在容許範圍內！' : '超出容許範圍了') + '　差 ' + r.err.toFixed(4) + '（容許 ' + q.tol.toFixed(4) + '）';
            msg.classList.add(r.ok ? 'nl-msg--ok' : 'nl-msg--bad');
            if (r.ok) { Sfx.play('ok'); api.pass({ gain: 1, delay: 1500 }); }
            else api.fail({ delay: 2200, lines: ['第 ' + level + ' 關：' + q.text + '＝' + q.v.toFixed(4), '你的圓點在 ' + pos.toFixed(4) + '，差 ' + r.err.toFixed(4) + '（容許 ±' + q.tol.toFixed(4) + '）'] });
        }
        kit.onTap(okBtn, submit);

        api.solve = function () { pos = q.v; paint(); submit(); };
        api.wrong = function () { pos = kit.clamp(q.v + (q.v > 0.5 ? -1 : 1) * Math.max(0.2, q.tol * 3), 0, 1); paint(); submit(); };
    }

    var G = {
        id: ID,
        name: '數線落點',
        rule: '畫面上有一條數線，只標了 0 和 1。上方出現一個 0 到 1 之間的數（可能是小數、分數或百分比），在數線下方的拖曳區左右拖曳，把圓點移到你覺得它該在的位置，按「確定」。誤差在容許範圍內才過關，容許範圍一關比一關小，答錯就結束。',
        mount: mount,
        score: SCORE,
        test: { tolAt: tolAt, makeQuestion: makeQuestion, judge: judge, gcd: gcd, TOL: TOL, TOL_RAMP: TOL_RAMP, V_MIN: V_MIN, V_MAX: V_MAX, START: START, START_GAP: START_GAP }
    };
    Reaction.register(G);
})();

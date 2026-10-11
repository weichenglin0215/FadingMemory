/* ═══════════════════════════════════════════════════════════════════
   reaction_handsmeet.js — 秒反應・兩針重疊
   一個沒有刻度的圓盤，兩根指針（長針藍、短針橘）以不同速度轉，在它們剛好疊在一起的瞬間按「重疊！」。
   只有一次機會（每回合只能按一次），指針最多轉 MAX_S 秒；成績＝按下瞬間兩針的夾角（度，越小越好）。
   ───────────────────────────────────────────────────────────────────
   · 長針角速度 W1 120～300 度／秒（順時針），短針角速度 ＝ 長針 ÷ K（K 隨機 2～5）；
     相對角速度 ≥ 60 度／秒，一定會一次又一次地重疊。
   · 起始：短針在長針前方 d0 度（60～300），第一次重疊時間 ≥ FIRST_MIN 秒（不夠就多加整圈）。
   · 重疊時刻 t_n ＝ (d0 ＋ 360·n) ÷ (W1 − W2)；任何時刻的夾角是純函式，用事件的 timeStamp 判定。
   · 12 秒內沒按：這一回合作廢，自動重新開始（不算一次機會）。
   · 揭曉：指針定格在按下的瞬間，寫「早了／晚了 X.XXXX 秒」與夾角。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'handsmeet';
    var SCORE = { better: 'min', decimals: 4, format: '{v} 度', label: '夾角', min: 0, max: 180 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var W1 = [120, 300];                        /* 長針角速度範圍（度／秒） */
    var K = [2, 5];                             /* 長針是短針的幾倍快 */
    var FIRST_MIN = 2.5;                        /* 第一次重疊至少在幾秒之後 */
    var MAX_S = 12;                             /* 指針最多轉幾秒 */
    var CX = 236, CY = 270, R = 150;            /* 圓盤中心與半徑（舞台座標） */
    var LEN1 = 128, LEN2 = 90;                  /* 長針、短針長度 */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    /* 出題：回傳 { w1, w2, th1, th2, d0, rel, t0（第一次重疊的秒數）} */
    function makeRound(rand) {
        rand = rand || Math.random;
        var w1 = kit.randFloat(W1[0], W1[1], rand), k = kit.randFloat(K[0], K[1], rand), w2 = w1 / k, rel = w1 - w2;
        var th1 = rand() * 360, d0 = kit.randFloat(60, 300, rand);
        while (d0 / rel < FIRST_MIN) d0 += 360;
        return { w1: w1, w2: w2, th1: th1, th2: (th1 + d0) % 360, d0: d0, rel: rel, t0: d0 / rel };
    }
    function handAngle(th, w, t) { return th + w * t; }
    /* 時刻 t（秒）兩針的夾角（0～180 度） */
    function diffAt(q, t) {
        var d = ((q.d0 - q.rel * t) % 360 + 360) % 360;
        return d > 180 ? 360 - d : d;
    }
    /* 離 t 最近的一次重疊時刻（秒） */
    function nearestOverlap(q, t) {
        var n = Math.max(0, Math.round((q.rel * t - q.d0) / 360));
        return (q.d0 + 360 * n) / q.rel;
    }
    function rating(e) {
        if (e < 0.5) return '神乎其技！';
        if (e < 2) return '高手！';
        if (e < 5) return '很準！';
        if (e < 12) return '不錯喔！';
        return '再試一次，先抓節奏再按！';
    }

    function mount(root, ctx) {
        kit.single(root, ctx, {
            id: ID, G: G, better: 'min', max: SCORE.max,
            title: '兩根指針疊在一起的瞬間，按「重疊！」',
            numText: function (v) { return v.toFixed(4) + ' 度'; },
            rating: rating,
            sfx: function (v) { return v < 2 ? 'perfect' : (v < 8 ? 'win' : 'fail'); },
            setup: setup
        });
    }

    function setup(api) {
        var stage = api.stage, my = api.my;
        var q = makeRound(), started = false, locked = false, t0 = 0, loop = null;
        console.log('[兩針重疊] 長針 ' + q.w1.toFixed(1) + ' 度/秒、短針 ' + q.w2.toFixed(1) + ' 度/秒；第一次重疊 ' + q.t0.toFixed(3) + ' 秒；之後每 ' + (360 / q.rel).toFixed(3) + ' 秒一次');

        var svg = kit.svg('svg', { 'class': 'hm-svg', viewBox: '0 0 472 560', width: 472, height: 560 }, stage);
        kit.svg('circle', { cx: CX, cy: CY, r: R, 'class': 'hm-dial' }, svg);
        var ghost = kit.svg('g', { opacity: 0 }, svg);
        var g1 = kit.svg('line', { x1: CX, y1: CY, x2: CX, y2: CY - LEN1, 'class': 'hm-ghost' }, ghost);
        var h2 = kit.svg('line', { x1: CX, y1: CY, x2: CX, y2: CY - LEN2, 'class': 'hm-hand2' }, svg);
        var h1 = kit.svg('line', { x1: CX, y1: CY, x2: CX, y2: CY - LEN1, 'class': 'hm-hand1' }, svg);
        kit.svg('circle', { cx: CX, cy: CY, r: 9, 'class': 'hm-pin' }, svg);
        var msg = h('div', { 'class': 'hm-msg', text: '' });
        stage.appendChild(msg);
        var btn = h('button', { 'class': 'btn btn--go hm-btn', text: '重疊！' });
        btn.disabled = true;
        stage.appendChild(btn);
        function setHands(sec) {
            h1.setAttribute('transform', 'rotate(' + handAngle(q.th1, q.w1, sec).toFixed(2) + ' ' + CX + ' ' + CY + ')');
            h2.setAttribute('transform', 'rotate(' + handAngle(q.th2, q.w2, sec).toFixed(2) + ' ' + CX + ' ' + CY + ')');
        }
        setHands(0);

        function begin() {
            if (started) return;
            started = true; btn.disabled = false; t0 = performance.now();
            msg.textContent = '轉動中…抓準它們疊在一起的瞬間！';
            loop = my.loop(function () { if (locked) return false; setHands((performance.now() - t0) / 1000); });
            my.after(MAX_S * 1000, function () {
                if (locked) return;
                locked = true; loop && loop.stop(); btn.disabled = true;
                msg.textContent = MAX_S + ' 秒內沒有按，重新開始（不算一次機會）';
                Sfx.play('bad');
                my.after(1600, function () { api.restart(); });
            });
        }
        var cover = kit.startCover(stage, { text: '兩根指針會一直轉。\n在它們剛好疊在一起的瞬間，按「重疊！」。\n只有一次機會。', onStart: begin });

        function tapAtMs(ms) {
            if (locked || !started) return;
            locked = true; if (loop) loop.stop(); btn.disabled = true;
            Sfx.play('click');
            var sec = ms / 1000, real = diffAt(q, sec), ts = nearestOverlap(q, sec), early = sec < ts;
            setHands(sec);
            g1.setAttribute('transform', 'rotate(' + handAngle(q.th1, q.w1, ts).toFixed(2) + ' ' + CX + ' ' + CY + ')'); ghost.setAttribute('opacity', 1);
            var off = Math.abs(sec - ts);
            msg.textContent = '夾角 ' + real.toFixed(4) + ' 度　你' + (early ? '早了 ' : '晚了 ') + off.toFixed(4) + ' 秒';
            my.after(2200, function () {
                api.finish(real, { lines: [
                    '按下的瞬間，兩針夾角 ' + real.toFixed(4) + ' 度',
                    '最近的一次重疊在第 ' + ts.toFixed(4) + ' 秒，你' + (early ? '早了 ' : '晚了 ') + off.toFixed(4) + ' 秒',
                    '只有一次機會，想拚更準就再挑戰一次'
                ] });
            });
        }
        kit.onTap(btn, function (e) { tapAtMs(kit.evT(e) - t0); });

        G.debug = {
            state: function () { return { q: q, started: started, locked: locked }; },
            start: function () { cover.remove(); begin(); },
            tapAtMs: function (ms) { cover.remove(); begin(); tapAtMs(ms); },
            solve: function () { cover.remove(); begin(); tapAtMs(q.t0 * 1000); },
            wrong: function () { cover.remove(); begin(); tapAtMs((q.t0 + 0.5 * 360 / q.rel) * 1000); }
        };
    }

    var G = {
        id: ID,
        name: '兩針重疊',
        rule: '圓盤上有兩根指針，長針轉得快、短針轉得慢，圓盤沒有任何刻度。**在兩根針剛好疊在一起的瞬間按下「重疊！」**。**每次只能按一次**，不用等第一次重疊，任何一次都可以。成績是按下時兩針的夾角，目標是 0.0000 度。',
        mount: mount,
        score: SCORE,
        test: { makeRound: makeRound, handAngle: handAngle, diffAt: diffAt, nearestOverlap: nearestOverlap, rating: rating, W1: W1, K: K, FIRST_MIN: FIRST_MIN, MAX_S: MAX_S }
    };
    Reaction.register(G);
})();

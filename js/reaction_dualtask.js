/* ═══════════════════════════════════════════════════════════════════
   reaction_dualtask.js — 秒反應・一心二用
   左邊的圓燈亮綠色就要馬上點；右邊的圓燈會閃紅色，不能點，只要默默數它閃了幾次。
   每回合 30 秒，時間到要回答「紅燈亮了幾次」。共 3 回合。
   ───────────────────────────────────────────────────────────────────
   · 事件時間表（makeEvents）：一回合開始前就排好，之後只照表演出，判定也是拿「現在時刻」去比表，
     不靠計時器有沒有準時觸發，所以計時器晚一點也不會影響成績。
   · 綠燈：平均間隔 GREEN_GAP_START → END 秒（隨機 ± GREEN_JITTER），每次亮 LIT_START → END 秒；
     生成時保證「相鄰兩次綠燈的間隔 ≥ 亮燈秒數 + 0.1」，所以畫面上同時只會有一盞綠燈。
   · 紅燈：次數 RED_N_START → END（第 1 → ROUNDS 回合線性取整），每次亮 RED_LIT 秒。
     紅燈只放在「兩次綠燈之間、離兩邊綠燈各 ≥ MIN_EVENT_GAP 秒」的空檔裡，每個空檔最多 1 次，
     所以任兩個事件的開始時間至少相距 0.3 秒、任兩次紅燈至少相距 0.6 秒（數得出來）。
   · 計分：回合分數 ＝ max(0, 綠燈命中 − 亂點次數)；紅燈答錯則 ×WRONG_COUNT_MULT（四捨五入）。
       亂點＝綠燈沒亮（或已經點過）時點左邊，扣 1 分，避免「一直亂點」就拿高分。右邊的點擊不算。
   · 選項：4 個，正解與其他 3 個互異且都 ≥ 1，彼此相差 OPT_GAP 的倍數（OPT_GAP 3 → 1，越後面越難分）。
   · 成績＝3 回合總分（越大越好）。
   ═══════════════════════════════════════════════════════════════════ */

/* （檔案結構說明見 js/reaction_sticks.js 開頭的「新手導讀」） */
(function () {
    'use strict';

    var ID = 'dualtask';
    var h = UI.h;
    var kit = Reaction.kit;

    /* 設定集中在這一區 */
    /* ═══ 可以自己調的參數 ═══ */
    /* 共 3 回合，每回合 30 秒 */
    var ROUNDS = 3;
    var DURATION_SEC = 30;
    /* 綠燈的平均間隔（隨回合線性變短）與隨機抖動幅度 */
    var GREEN_GAP_START = 2.0, GREEN_GAP_END = 1.1, GREEN_JITTER = 0.25;
    var LIT_START = 1.2, LIT_END = 0.65;
    /* 紅燈次數隨回合增加、每次亮 0.25 秒 */
    var RED_N_START = 8, RED_N_END = 20, RED_LIT = 0.25;
    var OPT_GAP_START = 3, OPT_GAP_END = 1;
    /* 任兩個事件至少相隔 0.3 秒，避免兩邊同時發生搞不清楚 */
    var MIN_EVENT_GAP = 0.3;
    var LEAD_S = 1.5;                         /* 第一盞綠燈不早於這個時間 */
    var RED_LEAD_S = 0.8;                     /* 第一次紅燈不早於這個時間 */
    var TAIL_S = 0.4;                         /* 最後一個事件結束後留的空檔 */
    /* 紅燈次數答錯時，本回合分數乘以 0.5 */
    var WRONG_COUNT_MULT = 0.5;
    /* 亂點一次扣 1 分 */
    var STRAY_PENALTY = 1;
    var READY_MS = 1400, REVIEW_MS = 3200;

    /* ═══ 純函式（也給 Node 測試用）═══ */
    /* 這一回合綠燈間隔／亮燈時間／紅燈次數／答案選項間距 */
    function greenGapFor(r) { return kit.ramp(r, GREEN_GAP_START, GREEN_GAP_END, ROUNDS); }
    function litFor(r) { return kit.ramp(r, LIT_START, LIT_END, ROUNDS); }
    function redNFor(r) { return Math.round(kit.ramp(r, RED_N_START, RED_N_END, ROUNDS)); }
    function optGapFor(r) { return Math.round(kit.ramp(r, OPT_GAP_START, OPT_GAP_END, ROUNDS)); }

    /* 事件表：一回合開始前就排好每盞燈「何時亮」。判定時比對「現在時刻」與這張表，不靠計時器是否準時，所以計時器晚一點也不影響成績 */
    /* 一回合的事件表：{ lit, green:[開始時間], red:[開始時間] }（單位：秒，由回合開始算起）*/
    function makeEvents(r, rand) {
        rand = rand || Math.random;
        var lit = litFor(r), gap = greenGapFor(r), D = DURATION_SEC, g = [];
        /* 綠燈：從 LEAD_S 開始，每隔 gap 秒（隨機抖動 ±25%）亮一次，直到快結束 */
        for (var t = LEAD_S; t + lit <= D - TAIL_S; t += gap * (1 + (rand() * 2 - 1) * GREEN_JITTER)) g.push(t);
        /* 綠燈之間的空檔：[上一盞綠燈 + 0.3, 下一盞綠燈 − 0.3]（頭尾用邊界）*/
        /* 紅燈只放在「兩次綠燈之間」的空檔裡，每個空檔最多一次，並離綠燈各至少 0.3 秒 */
        var edges = [RED_LEAD_S - MIN_EVENT_GAP].concat(g).concat([D - TAIL_S - RED_LIT + MIN_EVENT_GAP]);
        var slots = [];
        for (var i = 0; i + 1 < edges.length; i++) {
            var lo = edges[i] + MIN_EVENT_GAP, hi = edges[i + 1] - MIN_EVENT_GAP;
            if (hi - lo >= 0.05) slots.push([lo, hi]);
        }
        /* 紅燈次數不能超過可用的空檔數 */
        var n = Math.min(redNFor(r), slots.length);
        /* 隨機挑 n 個空檔（shuffle 洗牌後取前 n 個，再排序） */
        var pickIdx = kit.shuffle(slots.map(function (_, k) { return k; }), rand).slice(0, n).sort(function (a, b) { return a - b; });
        /* 在每個被選到的空檔裡隨機取一個時間點 */
        var red = pickIdx.map(function (k) { return slots[k][0] + rand() * (slots[k][1] - slots[k][0]); });
        return { lit: lit, green: g, red: red };
    }
    /* 產生 4 個選項：正解 + 另外 3 個差距為 gap 的倍數（隨回合 gap 變小，越來越難分），都要 ≥ 1 */
    /* 4 個互異、≥ 1、含正解的選項，由小到大 */
    function makeOptions(truth, gap, rand) {
        rand = rand || Math.random;
        var cand = [];
        for (var k = -3; k <= 6; k++) { if (k !== 0 && truth + k * gap >= 1) cand.push(truth + k * gap); }
        var opts = kit.shuffle(cand, rand).slice(0, 3).concat([truth]);
        return opts.sort(function (a, b) { return a - b; });
    }
    /* 回合得分＝命中的綠燈 − 亂點次數（最低 0）；紅燈次數答錯分數減半 */
    function roundScore(hits, strays, answer, truth) {
        var base = Math.max(0, hits - STRAY_PENALTY * strays);
        return answer === truth ? base : Math.round(base * WRONG_COUNT_MULT);
    }
    /* 現在時刻有沒有落在某個事件的亮燈區間內：回傳事件編號，沒有回 −1 */
    /* 現在時刻（秒）有沒有落在某個事件的亮燈區間：回傳事件編號，沒有回 −1 */
    function litIndex(starts, dur, el) {
        for (var i = 0; i < starts.length; i++) if (el >= starts[i] && el < starts[i] + dur) return i;
        return -1;
    }
    /* 依總分給評語 */
    function rating(total) {
        if (total >= 45) return '一心二用高手！';
        if (total >= 25) return '蠻專心的！';
        return '再試一次，會更穩！';
    }

    /* mount：遊戲進場點 */
    function mount(root, ctx) {
        var R = null;

        /* round：開一局 */
        function round() {
            if (R) R.dispose();
            R = kit.round();
            var my = R;
            root.innerHTML = '';

            /* r 目前第幾回合；total 總分；rows 每回合的成績紀錄；ev 這回合的事件表；t0 這回合開始時間；hit 每盞綠燈是否已點；hits 命中數；strays 亂點數；missed 漏掉數；token 回合流水號 */
            var r = 0, total = 0, rows = [], state = 'idle', ev = null, t0 = 0, hit = [], hits = 0, strays = 0, missed = 0, token = 0;
            /* 建立畫面元素：標題、時間條、左邊綠燈區、右邊紅燈區、回答區 */
            var head = h('div', { 'class': 'du-head', text: ' ' });
            var tb = kit.timebar();
            var greenLamp = h('div', { 'class': 'du-lamp du-lamp--green' });
            var redLamp = h('div', { 'class': 'du-lamp du-lamp--red' });
            var gTxt = h('div', { 'class': 'du-cap', text: '綠燈亮就點！' });
            var gCnt = h('div', { 'class': 'du-cnt', text: ' ' });
            var rTxt = h('div', { 'class': 'du-cap', text: '紅燈只要數' });
            var rCnt = h('div', { 'class': 'du-cnt', text: '不要點' });
            var left = h('div', { 'class': 'du-side du-side--left' }, [greenLamp, gTxt, gCnt]);
            var right = h('div', { 'class': 'du-side du-side--right' }, [redLamp, rTxt, rCnt]);
            var stage = h('div', { 'class': 'du-stage' }, [left, right]);
            var ask = h('div', { 'class': 'du-ask' });
            var askQ = h('div', { 'class': 'du-ask__q', text: '紅燈亮了幾次？' });
            var optsEl = h('div', { 'class': 'du-opts' });
            ask.appendChild(askQ); ask.appendChild(optsEl);
            [head, tb.el, stage, ask].forEach(function (x) { root.appendChild(x); });
            ask.style.visibility = 'hidden';
            ctx.setMeta(Reaction.getBest(ID) != null ? '最佳 ' + Reaction.getBest(ID) : '');

            /* 開關燈：加／拿掉 CSS class（亮的樣式在 css/reaction2.css） */
            function show(lampEl, on) { lampEl.classList[on ? 'add' : 'remove']('du-lamp--on'); }

            /* 開始一回合 */
            function startRound() {
                if (my.dead) return;
                r++;
                var id = ++token;
                /* 產生事件表；hit 初始化成全部 false */
                ev = makeEvents(r); hit = ev.green.map(function () { return false; });
                hits = 0; strays = 0; missed = 0;
                state = 'ready';
                ask.style.visibility = 'hidden'; optsEl.innerHTML = '';
                show(greenLamp, false); show(redLamp, false);
                head.textContent = '第 ' + r + '／' + ROUNDS + ' 回合　準備…';
                gCnt.textContent = '命中 0'; tb.set(1);
                try { console.info('[一心二用] 第 ' + r + ' 回合：綠燈 ' + ev.green.length + ' 次（平均間隔 ' + greenGapFor(r).toFixed(2) + ' 秒、每次亮 ' + ev.lit.toFixed(2) + ' 秒）、紅燈 ' + ev.red.length + ' 次（' + ev.red.map(function (t) { return t.toFixed(1); }).join(' ') + '）'); } catch (e) { }
                /* READY_MS 準備時間後正式開始，記下開始時間 t0 */
                my.after(READY_MS, function () {
                    if (id !== token) return;
                    state = 'play';
                    t0 = performance.now();
                    /* 照表排程：每盞燈在「t 秒」亮、「t+亮燈時間」秒熄滅。延遲用 t0 的絕對時間換算，所以不會累積誤差 */
                    /* 照表排程：開燈／關燈都是 setTimeout，位置用 t0 絕對時間換算，所以不會累積誤差 */
                    ev.green.forEach(function (t, k) {
                        my.after(Math.max(0, t * 1000 - (performance.now() - t0)), function () { if (id === token && !hit[k]) show(greenLamp, true); });
                        my.after(Math.max(0, (t + ev.lit) * 1000 - (performance.now() - t0)), function () {
                            if (id !== token) return;
                            show(greenLamp, false);
                            if (!hit[k]) missed++;
                        });
                    });
                    ev.red.forEach(function (t) {
                        my.after(Math.max(0, t * 1000 - (performance.now() - t0)), function () { if (id === token) show(redLamp, true); });
                        my.after(Math.max(0, (t + RED_LIT) * 1000 - (performance.now() - t0)), function () { if (id === token) show(redLamp, false); });
                    });
                    /* my.loop：每個畫面更新一次，更新剩餘秒數與時間條 */
                    my.loop(function (now) {
                        if (id !== token || state !== 'play') return false;
                        var el = (now - t0) / 1000;
                        tb.set(1 - el / DURATION_SEC);
                        head.textContent = '第 ' + r + '／' + ROUNDS + ' 回合　剩 ' + Math.max(0, Math.ceil(DURATION_SEC - el)) + ' 秒';
                    });
                    /* 30 秒到 → 進入回答階段 */
                    my.after(DURATION_SEC * 1000, function () { if (id === token) askCount(); });
                });
            }

            /* 回答階段：顯示 4 個紅燈次數選項 */
            function askCount() {
                state = 'ask'; token++;
                show(greenLamp, false); show(redLamp, false);
                tb.set(0);
                head.textContent = '第 ' + r + '／' + ROUNDS + ' 回合　時間到';
                var truth = ev.red.length, opts = makeOptions(truth, optGapFor(r));
                optsEl.innerHTML = '';
                opts.forEach(function (v) {
                    var b = h('button', { 'class': 'btn du-opt', text: String(v) });
                    b.addEventListener('pointerdown', function (e) { e.preventDefault(); answer(v); });
                    optsEl.appendChild(b);
                });
                ask.style.visibility = '';
                Sfx.play('pop');
            }

            /* 玩家選了 v：算本回合分數、標出正確與錯誤選項，稍後進下一回合 */
            function answer(v) {
                if (state !== 'ask') return;
                state = 'review';
                var truth = ev.red.length, sc = roundScore(hits, strays, v, truth);
                total += sc;
                rows.push({ r: r, hits: hits, greens: ev.green.length, strays: strays, truth: truth, answer: v, score: sc });
                [].forEach.call(optsEl.children, function (b) {
                    b.disabled = true;
                    var n = Number(b.textContent);
                    if (n === truth) b.classList.add('du-opt--ok'); else if (n === v) b.classList.add('du-opt--bad');
                });
                var best = Reaction.getBest(ID);
                ctx.setMeta(kit.meta(['累計 ' + total, best != null ? '最佳 ' + best : '']));
                head.textContent = '綠燈命中 ' + hits + '／' + ev.green.length + (strays ? '　亂點 ' + strays : '') + '　本回合 ' + sc + ' 分';
                Sfx.play(v === truth ? 'win' : 'bad');
                /* 3 回合結束 → 結算 */
                my.after(REVIEW_MS, function () { if (r >= ROUNDS) finish(); else startRound(); });
            }

            /* 結算：三回合總分 */
            function finish() {
                state = 'done';
                var isNew = Reaction.setBest(ID, total, function (v, b) { return v > b; });
                ctx.setMeta('最佳 ' + Reaction.getBest(ID));
                kit.result(root, {
                    num: String(total), label: rating(total),
                    lines: rows.map(function (x) { return '第 ' + x.r + ' 回合：綠燈 ' + x.hits + '／' + x.greens + (x.strays ? '、亂點 ' + x.strays : '') + '；紅燈實際 ' + x.truth + (x.answer === x.truth ? ' 答對' : '、你答 ' + x.answer + '（分數減半）') + ' ＝ ' + x.score + ' 分'; }),
                    isNew: isNew && total > 0, sfx: total >= 25 ? 'win' : 'neutral', onAgain: round
                });
            }

            /* 左半邊才是點擊區（右邊紅燈區不能點） */
            /* 左半邊才是點擊區 */
            function tapLeft(e) {
                if (e) e.preventDefault();
                if (state !== 'play') return;
                /* el：現在是回合開始後第幾秒 */
                var el = (performance.now() - t0) / 1000;
                /* litIndex：現在是不是正好有一盞綠燈亮著 */
                var k = litIndex(ev.green, ev.lit, el);
                /* 有亮、而且還沒點過 → 命中 */
                if (k >= 0 && !hit[k]) {
                    hit[k] = true; hits++;
                    show(greenLamp, false);
                    gCnt.textContent = '命中 ' + hits;
                    Sfx.play('click');
                /* 否則算亂點，扣分 */
                } else {
                    strays++;
                    gCnt.textContent = '命中 ' + hits + (strays ? '・亂點 ' + strays : '');
                }
            }
            /* 替左半邊綁定 pointerdown */
            left.addEventListener('pointerdown', tapLeft);

            /* G.debug：測試用後門 */
            G.debug = {
                state: function () { return { r: r, state: state, total: total, hits: hits, strays: strays, missed: missed, greens: ev && ev.green.slice(), reds: ev && ev.red.slice(), lit: ev && ev.lit, t0: t0, rows: rows.slice() }; },
                tapLeft: function () { tapLeft(); },
                answer: answer,
                answerRight: function () { answer(ev.red.length); },
                gotoRound: function (k) { token++; r = k - 1; startRound(); }
            };
            /* 開場等 500 毫秒再開始第一回合 */
            my.after(500, startRound);
        }

        round();
    }

    /* 遊戲身分證 */
    var G = {
        id: ID,
        name: '一心二用',
        rule: '左邊的圓燈亮綠色就馬上點它；右邊的燈會閃紅色，不能點，只要在心裡默默數它閃了幾次。每回合 30 秒，時間到要回答紅燈亮了幾次。共 3 回合，亂點會扣分喔！',
        mount: mount,
        /* test 匯出純函式給 Node 自動測試 */
        test: { greenGapFor: greenGapFor, litFor: litFor, redNFor: redNFor, optGapFor: optGapFor, makeEvents: makeEvents, makeOptions: makeOptions, roundScore: roundScore, litIndex: litIndex, rating: rating, ROUNDS: ROUNDS, DURATION_SEC: DURATION_SEC, MIN_EVENT_GAP: MIN_EVENT_GAP, RED_LIT: RED_LIT, GREEN_JITTER: GREEN_JITTER }
    };
    /* 登記到遊戲清單 */
    Reaction.register(G);
})();

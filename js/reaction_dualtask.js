/* ═══════════════════════════════════════════════════════════════════
   reaction_dualtask.js — 秒反應・一心二用
   右邊的圓燈亮綠色就要馬上點；左邊的圓燈會閃紅色，不能點，只要默默數它閃了幾次。
   只有一回合 30 秒，時間到要從「10 個連續的號碼」裡選出紅燈亮了幾次。
   ───────────────────────────────────────────────────────────────────
   · 難度會在這 30 秒裡越來越高：難度值 d ＝ 經過的秒數 ÷ RAMP_SEC（15 秒）。
       d = 0（剛開始）＝ 舊版（3 回合版）第 1 回合的程度；
       d = 1（第 15 秒）＝ 舊版第 3 回合（最難）的程度（綠燈亮 0.65 秒）；
       d > 1（第 15 秒以後）＝ 繼續加難，直到各項參數碰到下限為止。
     每一項參數寫成 [d=0 的值, d=1 的值, 下限／上限]（paramAt 負責內插）。
   · 綠燈、紅燈都是「一串一串」出現：一串有 1～BURST_MAX 次連續亮起（綠燈要連續點好幾下，紅燈連續閃好幾下），
     串的長度上限隨難度增加（3 → 5 → 7），兩串之間的空檔也越來越短。
       綠燈：每次亮 LIT 秒（1.2 → 0.65 → 0.4），同一串裡兩次之間熄滅 GREEN_REST 秒（0.4 → 0.2 → 0.1）；
       紅燈：每次亮 RED_LIT 秒，同一串裡兩次之間熄滅 RED_REST 秒（0.45 → 0.3 → 0.18）。
   · 事件時間表（makeEvents）：開始前就排好，之後只照表演出，判定也是拿「現在時刻」去比表，
     不靠計時器有沒有準時觸發，所以計時器晚一點也不會影響成績。
     排法：綠燈、紅燈各自一串一串往後排（像兩條各自進行的節拍），哪一條的「下一串開始時間」比較早就先排它；
     兩種燈的開始時間至少相隔 CROSS_GAP（0.15 秒），但可以同時亮著（左右手同時忙，這才是「一心二用」）；
     同一種燈不會重疊（綠燈熄滅至少 MIN_REST 秒才會再亮，紅燈每次閃的間隔至少 RED_LIT＋RED_REST 下限）。
     一串排不進去就往後挪一點再試，挪太多還是不行就放棄這一串。
     實際數量（量過 3000 局）：綠燈約 31 次（29～33）、紅燈約 38 次（34～41），都比舊版（綠 25、紅 20）多。
   · 計分：分數 ＝ max(0, 綠燈命中 − 亂點次數)；紅燈次數答錯則 ×WRONG_COUNT_MULT（四捨五入）。
       亂點＝綠燈沒亮（或已經點過）時點右邊，扣 1 分，避免「一直亂點」就拿高分。左邊的點擊不算。
   · 答案：10 個連續的號碼，上下兩排各 5 個（例如 31 32 33 34 35／36 37 38 39 40），正解隨機落在其中一個位置，
     選項最小不會小於 1。
   · 成績＝這一回合的分數（越大越好）。
   ═══════════════════════════════════════════════════════════════════ */

/* （檔案結構說明見 js/reaction_sticks.js 開頭的「新手導讀」） */
(function () {
    'use strict';

    var ID = 'dualtask';

    /* 世界排行榜的成績規格（欄位說明見 js/leaderboard.js 開頭）；資料庫 MF_games 裡 dualtask 那一列要一致
       （node test/leaderboard/gen_games_sql.cjs 會從這裡產生 insert，test/reaction/t_leaderboard.js 會檢查兩邊是否一致）。 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 分', label: '分數', min: 1, max: 300 };
    var h = UI.h;
    var kit = Reaction.kit;

    /* 設定集中在這一區 */
    /* ═══ 可以自己調的參數 ═══ */
    var DURATION_SEC = 30;                    /* 一回合幾秒 */
    var RAMP_SEC = 15;                        /* 難度 d ＝ 秒數 ÷ RAMP_SEC：第 15 秒＝舊版第 3 回合的最難程度，之後繼續加難 */
    /* 下面每一項都是 [d=0（剛開始）, d=1（第 15 秒）, 之後往同一個方向繼續變、最多變到這個下限／上限] */
    var LIT = [1.2, 0.65, 0.4];               /* 綠燈每次亮幾秒 */
    var GREEN_REST = [0.4, 0.2, 0.1];         /* 同一串裡，兩次綠燈之間熄滅幾秒 */
    var GREEN_PAUSE = [0.7, 0.25, 0.12];      /* 兩串綠燈之間的空檔（秒，實際會再乘 0.7～1.3 的隨機倍數） */
    var RED_REST = [0.45, 0.3, 0.18];         /* 同一串裡，兩次紅燈之間熄滅幾秒 */
    var RED_PAUSE = [1.2, 0.7, 0.45];         /* 兩串紅燈之間的空檔 */
    var BURST_MAX = [3, 5, 7];                /* 一串最多連續幾次（實際長度從 1 到這個數字，偏向短的） */
    var BURST_SKEW = 1.2;                     /* 越大越偏向短的串（1＝平均分配） */
    var RED_LIT = 0.25;                       /* 紅燈每次亮幾秒（固定） */
    var CROSS_GAP = 0.15;                     /* 綠燈與紅燈的「開始時間」至少相隔幾秒（不能剛好同時開始） */
    var MIN_REST = 0.1;                       /* 同一盞綠燈熄滅至少幾秒才會再亮（避免兩次連在一起分不出來） */
    var LEAD_S = 1.5;                         /* 第一盞綠燈不早於這個時間 */
    var RED_LEAD_S = 1.0;                     /* 第一次紅燈不早於這個時間 */
    var TAIL_S = 0.4;                         /* 最後一個事件結束後留的空檔 */
    var SHIFT_STEP = 0.05, SHIFT_MAX = 1.5;   /* 一串排不進去時，每次往後挪 0.05 秒再試，最多挪 1.5 秒 */
    /* 紅燈次數答錯時，分數乘以 0.5 */
    var WRONG_COUNT_MULT = 0.5;
    /* 亂點一次扣 1 分 */
    var STRAY_PENALTY = 1;
    var OPT_COUNT = 10, OPT_COLS = 5;         /* 答案選項：10 個連續號碼，每排 5 個（兩排） */
    var READY_MS = 1400, REVIEW_MS = 3200;

    /* ═══ 純函式（也給 Node 測試用）═══ */
    /* 第 sec 秒的難度值 d：0（開始）→ 1（第 RAMP_SEC 秒）→ 繼續變大（不設上限，各項參數有各自的下限） */
    function diffAt(sec) { return Math.max(0, sec) / RAMP_SEC; }
    /* 參數內插：arr＝[d=0 的值, d=1 的值, 下限／上限]。d 在 0～1 之間照比例變，d > 1 照同樣的速度繼續變，
       但最多變到 arr[2]（往小變的參數 arr[2] 是下限，往大變的是上限） */
    function paramAt(arr, d) {
        var v = arr[0] + (arr[1] - arr[0]) * d;
        return arr[1] <= arr[0] ? Math.max(arr[2], v) : Math.min(arr[2], v);
    }
    /* 這個難度下，一串最多連續幾次（四捨五入成整數） */
    function burstMaxAt(d) { return Math.round(paramAt(BURST_MAX, d)); }
    /* 隨機決定這一串有幾次：1～burstMaxAt(d)，偏向短的（rand()^BURST_SKEW 讓小的數字比較常出現） */
    function burstSize(d, rand) {
        rand = rand || Math.random;
        return 1 + Math.floor(Math.pow(rand(), BURST_SKEW) * burstMaxAt(d));
    }

    /* 事件表：一回合開始前就排好每盞燈「何時亮」。判定時比對「現在時刻」與這張表，不靠計時器是否準時，所以計時器晚一點也不影響成績 */
    /* 一回合的事件表：{ green:[綠燈開始時間], greenLit:[每次綠燈亮多久], red:[紅燈開始時間] }（單位：秒，由回合開始算起，由小到大）*/
    function makeEvents(rand) {
        rand = rand || Math.random;
        var limit = DURATION_SEC - TAIL_S;
        var green = [], greenLit = [], red = [];
        /* cursor：每一種燈「下一串最早可以從幾秒開始」 */
        var cursor = { g: LEAD_S, r: RED_LEAD_S };
        for (var guard = 0; guard < 500; guard++) {
            /* 哪一種燈的下一串比較早，就先排它（一樣早就隨機）；兩種都排完（超過 limit）就結束 */
            var open = ['g', 'r'].filter(function (c) { return cursor[c] < limit; });
            if (!open.length) break;
            var c = open.length === 1 ? open[0] : (cursor.g < cursor.r ? 'g' : (cursor.g > cursor.r ? 'r' : (rand() < 0.5 ? 'g' : 'r')));
            var s0 = cursor[c], d = diffAt(s0), k = burstSize(d, rand);
            var lit = c === 'g' ? paramAt(LIT, d) : RED_LIT;
            var cycle = lit + paramAt(c === 'g' ? GREEN_REST : RED_REST, d);     /* 同一串裡，每次「開始」相隔多久 */
            var other = c === 'g' ? red : green;
            var placed = false;
            for (var shift = 0; shift <= SHIFT_MAX + 1e-9 && !placed; shift += SHIFT_STEP) {
                var starts = [];
                for (var i = 0; i < k; i++) starts.push(s0 + shift + i * cycle);
                /* 最後一次亮完要在回合結束前（之後再挪只會更晚，不用再試） */
                if (starts[k - 1] + lit > limit) break;
                /* 跟另一種燈的開始時間不能靠太近 */
                var clash = starts.some(function (t) { return other.some(function (o) { return Math.abs(o - t) < CROSS_GAP; }); });
                if (clash) continue;
                starts.forEach(function (t) { if (c === 'g') { green.push(t); greenLit.push(lit); } else red.push(t); });
                placed = true;
                /* 這一串排好了：下一串最早從「這一串亮完 + 空檔」開始（綠燈至少熄滅 MIN_REST 秒） */
                var dEnd = diffAt(starts[k - 1]);
                var pause = paramAt(c === 'g' ? GREEN_PAUSE : RED_PAUSE, dEnd) * (0.7 + 0.6 * rand());
                cursor[c] = starts[k - 1] + lit + Math.max(pause, c === 'g' ? MIN_REST : 0);
            }
            /* 排不進去（跟另一種燈撞了、或快沒時間了）：這一種燈往後 0.5 秒再試 */
            if (!placed) cursor[c] = s0 + 0.5;
        }
        /* 綠燈的開始時間與亮燈長度要一起排序 */
        var order = green.map(function (_, i) { return i; }).sort(function (a, b) { return green[a] - green[b]; });
        return {
            green: order.map(function (i) { return green[i]; }),
            greenLit: order.map(function (i) { return greenLit[i]; }),
            red: red.slice().sort(function (a, b) { return a - b; })
        };
    }
    /* 答案選項：10 個連續的號碼（由小到大），正解隨機落在其中一個位置，最小號碼不小於 1。
       例如正解 38 可能得到 33～42、30～39、38～47… 每個位置的機會大約一樣（只有正解很小的時候受限制） */
    function makeOptions(truth, rand) {
        rand = rand || Math.random;
        var lo = Math.max(1, truth - (OPT_COUNT - 1)), hi = truth;          /* 起始號碼 a 的範圍：a ≤ truth ≤ a + 9 */
        var a = lo + Math.floor(rand() * (hi - lo + 1));
        var opts = [];
        for (var i = 0; i < OPT_COUNT; i++) opts.push(a + i);
        return opts;
    }
    /* 分數＝命中的綠燈 − 亂點次數（最低 0）；紅燈次數答錯分數減半 */
    function roundScore(hits, strays, answer, truth) {
        var base = Math.max(0, hits - STRAY_PENALTY * strays);
        return answer === truth ? base : Math.round(base * WRONG_COUNT_MULT);
    }
    /* 現在時刻（秒）有沒有落在某個綠燈的亮燈區間：回傳事件編號，沒有回 −1。
       lits 可以是「每一盞亮多久」的陣列（難度越高亮得越短），也可以是一個固定的數字 */
    function litIndex(starts, lits, el) {
        for (var i = 0; i < starts.length; i++) {
            var dur = typeof lits === 'number' ? lits : lits[i];
            if (el >= starts[i] && el < starts[i] + dur) return i;
        }
        return -1;
    }
    /* 依分數給評語（單回合：綠燈約 31 次，全部點中又沒亂點是 31 分） */
    function rating(score) {
        if (score >= 22) return '一心二用高手！';
        if (score >= 12) return '蠻專心的！';
        return '再試一次，會更穩！';
    }

    /* mount：遊戲進場點 */
    function mount(root, ctx) {
        /* 舊版是「3 回合總分」，跟現在的「單回合分數」不能比：第一次進來把舊的最佳紀錄清掉（只清一次） */
        Reaction.migrateBest(ID, function () { return null; }, '.single');
        var R = null;

        /* round：開一局（只有一回合） */
        function round() {
            if (R) R.dispose();
            R = kit.round();
            var my = R;
            root.innerHTML = '';

            /* score 這一回合的分數；ev 事件表；t0 回合開始時間；hit 每盞綠燈是否已點；hits 命中數；strays 亂點數；missed 漏掉數；token 流水號（重新開始時舊的計時器就失效） */
            var score = 0, state = 'idle', ev = null, t0 = 0, hit = [], hits = 0, strays = 0, missed = 0, token = 0, answered = null;
            /* 建立畫面元素：標題、時間條、左邊紅燈區（只要數）、右邊綠燈區（點這裡）、回答區 */
            var head = h('div', { 'class': 'du-head', text: ' ' });
            var tb = kit.timebar();
            var greenLamp = h('div', { 'class': 'du-lamp du-lamp--green' });
            var redLamp = h('div', { 'class': 'du-lamp du-lamp--red' });
            var gTxt = h('div', { 'class': 'du-cap', text: '綠燈亮就點！' });
            var gCnt = h('div', { 'class': 'du-cnt', text: ' ' });
            var rTxt = h('div', { 'class': 'du-cap', text: '紅燈只要數' });
            var rCnt = h('div', { 'class': 'du-cnt', text: '不要點' });
            /* 紅燈在左邊（只用眼睛數），綠燈在右邊（右手好點，手也不會擋住左邊的紅燈） */
            var count = h('div', { 'class': 'du-side du-side--count' }, [redLamp, rTxt, rCnt]);
            var tap = h('div', { 'class': 'du-side du-side--tap' }, [greenLamp, gTxt, gCnt]);
            var stage = h('div', { 'class': 'du-stage' }, [count, tap]);
            var ask = h('div', { 'class': 'du-ask' });
            var askQ = h('div', { 'class': 'du-ask__q', text: '紅燈亮了幾次？' });
            var optsEl = h('div', { 'class': 'du-opts' });
            ask.appendChild(askQ); ask.appendChild(optsEl);
            [head, tb.el, stage, ask].forEach(function (x) { root.appendChild(x); });
            ask.style.visibility = 'hidden';
            ctx.setMeta(Reaction.getBest(ID) != null ? '最佳 ' + Reaction.getBest(ID) : '');

            /* 開關燈：加／拿掉 CSS class（亮的樣式在 css/reaction2.css） */
            function show(lampEl, on) { lampEl.classList[on ? 'add' : 'remove']('du-lamp--on'); }

            /* 開始這一回合 */
            function startRound() {
                if (my.dead) return;
                var id = ++token;
                /* 產生事件表；hit 初始化成全部 false */
                ev = makeEvents(); hit = ev.green.map(function () { return false; });
                hits = 0; strays = 0; missed = 0; answered = null;
                state = 'ready';
                ask.style.visibility = 'hidden'; optsEl.innerHTML = '';
                show(greenLamp, false); show(redLamp, false);
                head.textContent = '準備…';
                gCnt.textContent = '命中 0'; tb.set(1);
                try { console.info('[一心二用] 綠燈 ' + ev.green.length + ' 次、紅燈 ' + ev.red.length + ' 次（紅燈時間：' + ev.red.map(function (t) { return t.toFixed(1); }).join(' ') + '）'); } catch (e) { }
                /* READY_MS 準備時間後正式開始，記下開始時間 t0 */
                my.after(READY_MS, function () {
                    if (id !== token) return;
                    state = 'play';
                    t0 = performance.now();
                    /* 照表排程：每盞燈在「t 秒」亮、「t+亮燈時間」秒熄滅。延遲用 t0 的絕對時間換算，所以不會累積誤差 */
                    /* 照表排程：開燈／關燈都是 setTimeout，位置用 t0 絕對時間換算，所以不會累積誤差 */
                    ev.green.forEach(function (t, k) {
                        my.after(Math.max(0, t * 1000 - (performance.now() - t0)), function () { if (id === token && !hit[k]) show(greenLamp, true); });
                        my.after(Math.max(0, (t + ev.greenLit[k]) * 1000 - (performance.now() - t0)), function () {
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
                        head.textContent = '剩 ' + Math.max(0, Math.ceil(DURATION_SEC - el)) + ' 秒';
                    });
                    /* 30 秒到 → 進入回答階段 */
                    my.after(DURATION_SEC * 1000, function () { if (id === token) askCount(); });
                });
            }

            /* 回答階段：顯示 10 個連續號碼（上下兩排，每排 5 個），選出紅燈亮了幾次 */
            function askCount() {
                state = 'ask'; token++;
                show(greenLamp, false); show(redLamp, false);
                tb.set(0);
                head.textContent = '時間到';
                var truth = ev.red.length, opts = makeOptions(truth);
                optsEl.innerHTML = '';
                opts.forEach(function (v) {
                    var b = h('button', { 'class': 'btn du-opt', text: String(v) });
                    b.addEventListener('pointerdown', function (e) { e.preventDefault(); answer(v); });
                    optsEl.appendChild(b);
                });
                ask.style.visibility = '';
                Sfx.play('pop');
            }

            /* 玩家選了 v：算分數、標出正確與錯誤選項，稍後結算 */
            function answer(v) {
                if (state !== 'ask') return;
                state = 'review';
                var truth = ev.red.length;
                score = roundScore(hits, strays, v, truth); answered = v;
                [].forEach.call(optsEl.children, function (b) {
                    b.disabled = true;
                    var n = Number(b.textContent);
                    if (n === truth) b.classList.add('du-opt--ok'); else if (n === v) b.classList.add('du-opt--bad');
                });
                var best = Reaction.getBest(ID);
                ctx.setMeta(kit.meta(['本局 ' + score, best != null ? '最佳 ' + best : '']));
                head.textContent = '綠燈命中 ' + hits + '／' + ev.green.length + (strays ? '　亂點 ' + strays : '') + '　得 ' + score + ' 分';
                Sfx.play(v === truth ? 'win' : 'bad');
                my.after(REVIEW_MS, finish);
            }

            /* 結算：這一回合的分數就是成績 */
            function finish() {
                state = 'done';
                var truth = ev.red.length;
                var isNew = Reaction.setBest(ID, score, function (v, b) { return v > b; });
                ctx.setMeta('最佳 ' + Reaction.getBest(ID));
                kit.result(root, {
                    score: score,        /* 世界排行榜成績（跟 setBest 存的同一個數字） */
                    num: String(score), label: rating(score),
                    lines: ['綠燈命中 ' + hits + '／' + ev.green.length + (strays ? '，亂點 ' + strays + ' 次（每次扣 ' + STRAY_PENALTY + ' 分）' : ''),
                        '紅燈實際閃了 ' + truth + ' 次' + (answered === truth ? '，你答對了' : '，你答 ' + answered + '（分數減半）')],
                    isNew: isNew && score > 0, sfx: score >= 12 ? 'win' : 'neutral', onAgain: round
                });
            }

            /* 右半邊（綠燈區）才是點擊區；左邊紅燈區不能點 */
            function tapGreen(e) {
                if (e) e.preventDefault();
                if (state !== 'play') return;
                /* el：現在是回合開始後第幾秒 */
                var el = (performance.now() - t0) / 1000;
                /* litIndex：現在是不是正好有一盞綠燈亮著 */
                var k = litIndex(ev.green, ev.greenLit, el);
                /* 有亮、而且還沒點過 → 命中 */
                if (k >= 0 && !hit[k]) {
                    hit[k] = true; hits++;
                    show(greenLamp, false);
                    gCnt.textContent = '命中 ' + hits + (strays ? '・亂點 ' + strays : '');
                    Sfx.play('click');
                /* 否則算亂點，扣分 */
                } else {
                    strays++;
                    gCnt.textContent = '命中 ' + hits + (strays ? '・亂點 ' + strays : '');
                }
            }
            /* 替右半邊綁定 pointerdown */
            tap.addEventListener('pointerdown', tapGreen);

            /* G.debug：測試用後門 */
            G.debug = {
                state: function () { return { state: state, score: score, hits: hits, strays: strays, missed: missed, greens: ev && ev.green.slice(), greenLit: ev && ev.greenLit.slice(), reds: ev && ev.red.slice(), t0: t0, answered: answered }; },
                tapGreen: function () { tapGreen(); },
                answer: answer,
                answerRight: function () { answer(ev.red.length); },
                restart: function () { token++; startRound(); }
            };
            /* 開場等 500 毫秒再開始 */
            my.after(500, startRound);
        }

        round();
    }

    /* 遊戲身分證 */
    var G = {
        id: ID,
        name: '一心二用',
        rule: '右邊的圓燈亮綠色就馬上點它；左邊的燈會閃紅色，不能點，只要在心裡默默數它閃了幾次。只有一回合 30 秒，越到後面燈亮得越快、越密，還會一連亮好幾次。時間到要從 10 個連續的號碼裡選出紅燈亮了幾次，亂點會扣分喔！',
        mount: mount,
        /* 世界排行榜的成績規格 */
        score: SCORE,
        /* test 匯出純函式給 Node 自動測試 */
        test: {
            diffAt: diffAt, paramAt: paramAt, burstMaxAt: burstMaxAt, burstSize: burstSize, makeEvents: makeEvents, makeOptions: makeOptions, roundScore: roundScore, litIndex: litIndex, rating: rating,
            DURATION_SEC: DURATION_SEC, RAMP_SEC: RAMP_SEC, CROSS_GAP: CROSS_GAP, RED_LIT: RED_LIT, MIN_REST: MIN_REST, LEAD_S: LEAD_S, RED_LEAD_S: RED_LEAD_S, TAIL_S: TAIL_S, OPT_COUNT: OPT_COUNT, OPT_COLS: OPT_COLS,
            LIT: LIT, GREEN_REST: GREEN_REST, RED_REST: RED_REST, BURST_MAX: BURST_MAX
        }
    };
    /* 登記到遊戲清單 */
    Reaction.register(G);
})();

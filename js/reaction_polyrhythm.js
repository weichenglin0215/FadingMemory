/* ═══════════════════════════════════════════════════════════════════
   reaction_polyrhythm.js — 秒反應・左右不同拍（音樂節奏遊戲）
   左右兩邊各有一條軌道，有顏色的方塊會準時由上往下掉，經過下方的紅色基準線的那一刻，就要點該邊的軌道（左手點左邊、
   右手點右邊）。每一小節有四拍；方塊的顏色代表「到下一個方塊隔幾拍」：
       紅＝4 拍　橙＝2 拍　黃＝1 拍　綠＝1/2 拍　藍＝1/4 拍　紫＝1/8 拍
   左右兩邊每一小節各自換一次顏色，而且兩邊的顏色不同，所以左右手要用不同的拍數同時點。BPM 會越來越快，看你能撐幾小節。
   ───────────────────────────────────────────────────────────────────
   · 時間軸（秒）：t=0 是遊戲開始；第 m 小節（從 0 起算）的 BPM 是 bpmFor(m)，一拍 60/BPM 秒，一小節四拍。
     第 0 小節從 LEAD_S 秒開始（先讓方塊掉一段）。每個小節的長度跟著該小節的 BPM 變，小節一個接一個。
   · 方塊：左邊顏色的間隔 a 拍，就在這小節的 0, a, 2a… 拍（共 4/a 個）各掉一個。方塊「經過基準線」的時間就是它的時刻，
     掉落速度固定（FALL_S 秒從頂端掉到基準線），所以 BPM 越快，方塊在畫面上越擠。
   · 每小節的顏色（nextMeasure）：
       第 0 小節固定「左黃、右綠」；之後每小節兩邊各抽一個顏色，必須①左右不同 ②跟自己這邊上一小節不同；
       顏色隨小節解鎖（紅橙黃綠一開始就有；藍從第 UNLOCK.blue 小節；紫從第 UNLOCK.purple 小節），
       而且該顏色的間隔秒數要 ≥ MIN_INTERVAL_S（BPM 太快時，太密的顏色就不會出現，不然手根本點不了）；
       每邊每秒最多 MAX_LANE_RATE 個、兩邊合計最多 MAX_TOTAL_RATE 個。
   · 判定：點某一邊時，找這一邊「還沒被打中、離現在最近」的方塊，時間差 ≤ 判定視窗就算打中
     （視窗 ＝ min(HIT_WIN, 該方塊間隔 × 0.45)，間隔越密視窗越小）；沒有方塊在視窗內＝多餘的點擊。
     方塊過了基準線 ＋ 視窗還沒打中＝漏掉。
   · 生命 HEALTH_MAX 顆：漏掉一個方塊、多餘的點擊各 −1；連續打中 HEAL_EVERY 個 ＋1 顆（最多 HEALTH_MAX）。
     「滾奏」（方塊間隔 < DENSE_S 秒的藍、紫色小節）太密，人手不可能每個都準：同一小節同一邊漏掉再多個，也只扣 1 顆生命。
     生命歸零就結束，成績＝撐過的小節數（越多越好），另外記錄撐了幾秒。
   · 計時用 performance.now()，畫面每影格更新（rAF），另外有 setTimeout 後備，分頁暫停也不會錯亂。
   ═══════════════════════════════════════════════════════════════════ */

/* （檔案結構說明見 js/reaction_sticks.js 開頭的「新手導讀」） */
(function () {
    'use strict';

    var ID = 'polyrhythm';

    /* 世界排行榜的成績規格（欄位說明見 js/leaderboard.js 開頭）；資料庫 MF_games 裡 polyrhythm 那一列要一致
       （node test/leaderboard/gen_games_sql.cjs 會從這裡產生 insert，test/reaction/t_leaderboard.js 會檢查兩邊是否一致）。 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 小節', label: '撐過小節', min: 1, max: 500 };
    var h = UI.h;
    var kit = Reaction.kit;

    /* 設定集中在這一區 */
    /* ═══ 可以自己調的參數 ═══ */
    /* BPM（每分鐘幾拍）：第 m 小節的速度＝起始 + 每小節增加量 × m，不超過上限 */
    var BPM_START = 48, BPM_STEP = 1.2, BPM_MAX = 120;        /* 第 m 小節的 BPM ＝ BPM_START + BPM_STEP × m（不超過 BPM_MAX）*/
    var LEAD_S = 3.0;                                          /* 遊戲開始到第一個小節開始 */
    /* 方塊從畫面頂端掉到紅線要幾秒（固定值，所以 BPM 越快，畫面上的方塊越擠） */
    var FALL_S = 1.7;                                          /* 方塊從頂端掉到基準線要幾秒 */
    /* 判定視窗：方塊到紅線的時間前後 0.14 秒內點下去都算打中 */
    var HIT_WIN = 0.14;                                        /* 判定視窗上限（秒）*/
    var MIN_INTERVAL_S = 0.1;                                  /* 一種顏色在這個 BPM 下，方塊間隔至少幾秒才會出現 */
    /* 每邊／兩邊合計每秒最多幾個方塊，避免太密點不完 */
    var MAX_LANE_RATE = 8, MAX_TOTAL_RATE = 10;                /* 每邊／兩邊合計每秒最多幾個方塊 */
    /* 生命 5 顆；連續打中 12 個回復 1 顆 */
    var HEALTH_MAX = 5, HEAL_EVERY = 12;
    var DENSE_S = 0.2;                                         /* 方塊間隔小於這麼多秒的軌道叫「滾奏」：同一小節同一邊漏掉再多，也只扣 1 顆生命 */
    /* UNLOCK：每個顏色從第幾小節起才會出現（藍色 3、紫色 5，前面太密，讓玩家先熟悉） */
    var UNLOCK = { red: 0, orange: 0, yellow: 0, green: 0, blue: 3, purple: 5 };       /* 第幾小節起可以出現 */
    /* 六種顏色的資料：id 代號、name 名稱、beats 到下一個方塊隔幾拍、label 說明文字 */
    var COLORS = [
        { id: 'red', name: '紅', beats: 4, label: '4 拍' },
        { id: 'orange', name: '橙', beats: 2, label: '2 拍' },
        { id: 'yellow', name: '黃', beats: 1, label: '1 拍' },
        { id: 'green', name: '綠', beats: 0.5, label: '1/2 拍' },
        { id: 'blue', name: '藍', beats: 0.25, label: '1/4 拍' },
        { id: 'purple', name: '紫', beats: 0.125, label: '1/8 拍' }
    ];
    /* BY_ID：用顏色代號快速查資料的查表 */
    var BY_ID = {}; COLORS.forEach(function (c) { BY_ID[c.id] = c; });

    /* 最佳紀錄文字；舊版本存的小數（單位不同）不顯示 */
    function fmtBest(v) { return (v == null || v !== Math.floor(v)) ? '' : '最佳 ' + v + ' 小節'; }       /* 舊版本留下的小數紀錄（單位不同）不顯示 */

    /* 純函式（也給 Node 測試用） */
    /* ═══ 純函式（也給 Node 測試用）═══ */
    /* 第 m 小節的 BPM */
    function bpmFor(m) { return Math.min(BPM_MAX, BPM_START + BPM_STEP * m); }
    /* 一拍幾秒：60 秒 ÷ BPM */
    function beatSec(m) { return 60 / bpmFor(m); }
    /* 一小節幾秒：4 拍 */
    function measureSec(m) { return 4 * beatSec(m); }
    /* 第 m 小節可以出現哪些顏色：已解鎖，而且方塊間隔夠長（BPM 太快時，太密的顏色就不會出現） */
    /* 第 m 小節可以用哪些顏色（id 陣列）*/
    function allowedColors(m) {
        var bs = beatSec(m);
        return COLORS.filter(function (c) { return m >= UNLOCK[c.id] && c.beats * bs >= MIN_INTERVAL_S - 1e-9; }).map(function (c) { return c.id; });
    }
    /* 某顏色在第 m 小節每秒會掉幾個方塊 */
    function laneRate(id, m) { return 1 / (BY_ID[id].beats * beatSec(m)); }
    /* 出下一個小節：左右各抽一個顏色（兩邊要不同，也不能和自己這邊上一小節相同），算出每個方塊經過紅線的時刻 */
    /* 出下一個小節：prev＝上一個小節（或 null）；回傳 { m, start, bpm, bs, dur, L:{color, times[]}, R:{…} }，times 是方塊經過基準線的時刻（秒）*/
    function nextMeasure(prev, rand) {
        rand = rand || Math.random;
        /* 第 m 小節的開始時間＝上一個小節的開始＋長度；第一個小節從 LEAD_S 秒開始 */
        var m = prev ? prev.m + 1 : 0, start = prev ? prev.start + prev.dur : LEAD_S, bs = beatSec(m), dur = 4 * bs;
        var L, Rr;
        /* 第 0 小節固定：左黃、右綠（題目指定） */
        if (m === 0) { L = 'yellow'; Rr = 'green'; }
        else {
            var pool = allowedColors(m), found = false;
            /* 最多試 200 次，抽到符合條件的顏色組合 */
            for (var tries = 0; tries < 200 && !found; tries++) {
                L = kit.pick(pool, rand); Rr = kit.pick(pool, rand);
                if (L === Rr || L === prev.L.color || Rr === prev.R.color) continue;
                if (laneRate(L, m) > MAX_LANE_RATE || laneRate(Rr, m) > MAX_LANE_RATE || laneRate(L, m) + laneRate(Rr, m) > MAX_TOTAL_RATE) continue;
                found = true;
            }
            /* 保底：萬一都失敗，兩邊對調 */
            if (!found) { L = prev.R.color; Rr = prev.L.color; if (L === Rr) { L = 'yellow'; Rr = 'orange'; } }      /* 保底：兩邊對調（極不可能用到）*/
        }
        /* times(顏色)：這種顏色在這小節的方塊時刻——每隔「拍數×一拍秒數」掉一個，共 4 ÷ 拍數 個 */
        function times(id) {
            var a = BY_ID[id].beats * bs, out = [];
            for (var k = 0; k < Math.round(4 / BY_ID[id].beats); k++) out.push(start + k * a);
            return out;
        }
        return { m: m, start: start, bpm: bpmFor(m), bs: bs, dur: dur, L: { color: L, times: times(L), interval: BY_ID[L].beats * bs }, R: { color: Rr, times: times(Rr), interval: BY_ID[Rr].beats * bs } };
    }
    /* 連續產生 M 個小節（測試用） */
    function makeChart(M, rand) { var out = [], prev = null; for (var i = 0; i < M; i++) { prev = nextMeasure(prev, rand); out.push(prev); } return out; }
    /* 判定視窗：不超過 0.14 秒，而且不超過方塊間隔的 45%（間隔越密越小） */
    /* 判定視窗（秒）：間隔越密越小 */
    function windowFor(interval) { return Math.min(HIT_WIN, interval * 0.45); }
    /* 找出「離現在最近、還沒處理、而且在視窗內」的方塊編號，沒有回傳 −1 */
    /* 一邊的方塊清單（{t, win, hit, miss}）裡，找出離 now 最近、還沒處理、且在視窗內的方塊編號；沒有回傳 −1 */
    function matchTap(notes, now) {
        var best = -1, bd = 1e9;
        for (var i = 0; i < notes.length; i++) {
            var n = notes[i];
            if (n.hit || n.miss) continue;
            var d = Math.abs(now - n.t);
            if (d <= n.win + 1e-9 && d < bd) { bd = d; best = i; }
        }
        return best;
    }
    /* 依撐過的小節數給評語 */
    function rating(m) {
        if (m >= 40) return '節奏之神！';
        if (m >= 25) return '兩手超協調！';
        if (m >= 12) return '很有節奏感！';
        if (m >= 5) return '抓到感覺了！';
        return '再試一次，會更穩！';
    }

    /* mount：遊戲進場點 */
    function mount(root, ctx) {
        var R = null;

        /* round：開一局（只有一局，撐到生命用完） */
        function round() {
            if (R) R.dispose();
            R = kit.round();
            var my = R;
            root.innerHTML = '';

            /* state 目前階段；t0 開始時間；measures 已產生的小節；notes 左右兩邊的方塊；health 生命；streak 連續打中數 */
            var state = 'idle', t0 = 0, measures = [], notes = { L: [], R: [] }, noteEls = { L: [], R: [] }, health = HEALTH_MAX, streak = 0;
            /* penalized 記錄「滾奏」小節已扣過生命的邊；hits／misses／extras 打中／漏掉／多點；doneMeasures 已撐過的小節；biasSum 打擊時間偏差總和（算平均偏早／偏晚） */
            var penalized = {}, hits = 0, misses = 0, extras = 0, doneMeasures = 0, lastBeatIdx = -1, over = false, biasSum = 0, biasN = 0, curM = 0;

            /* 建立畫面元素：說明、生命愛心、顏色圖例、左右軌道（各有紅色基準線與「左手／右手」標籤）、訊息 */
            var head = h('div', { 'class': 'py-head', text: ' ' });
            var hearts = h('div', { 'class': 'py-hearts' });
            var legend = h('div', { 'class': 'py-legend' });
            COLORS.forEach(function (c) { legend.appendChild(h('span', { 'class': 'py-legend__i' }, [h('i', { 'class': 'py-dot py-dot--' + c.id }), h('b', { text: c.label })])); });
            var laneL = h('div', { 'class': 'py-lane py-lane--left' }), laneR = h('div', { 'class': 'py-lane py-lane--right' });
            var lineL = h('div', { 'class': 'py-line' }), lineR = h('div', { 'class': 'py-line' });
            laneL.appendChild(lineL); laneR.appendChild(lineR);
            var capL = h('div', { 'class': 'py-cap', text: '左手' }), capR = h('div', { 'class': 'py-cap', text: '右手' });
            laneL.appendChild(capL); laneR.appendChild(capR);
            var stage = h('div', { 'class': 'py-stage' }, [laneL, laneR]);
            var msg = h('div', { 'class': 'py-msg', text: '' });
            [head, hearts, legend, stage, msg].forEach(function (x) { root.appendChild(x); });
            ctx.setMeta(fmtBest(Reaction.getBest(ID)));

            /* layout：量軌道高度，算出基準線位置 LINE_Y 與掉落速度 SPEED（高度 ÷ 掉落秒數） */
            var LH = 0, LINE_Y = 0, SPEED = 0;
            function layout() { LH = laneL.clientHeight; LINE_Y = Math.round(LH * 0.82); SPEED = LINE_Y / FALL_S; lineL.style.top = lineR.style.top = LINE_Y + 'px'; }
            function paintHearts() {
                hearts.innerHTML = '';
                for (var i = 0; i < HEALTH_MAX; i++) hearts.appendChild(h('span', { 'class': 'py-heart' + (i < health ? ' py-heart--on' : '') }));
            }

            /* 補出之後的小節：確保畫面上掉得到的方塊都已產生（提前準備到 FALL_S×2 + 4 秒之後） */
            /* 補出之後的小節（至少到 now 之後 3 小節）*/
            function ensure(upToT) {
                while (!measures.length || measures[measures.length - 1].start + measures[measures.length - 1].dur < upToT + 2 * FALL_S + 4) {
                    var mm = nextMeasure(measures.length ? measures[measures.length - 1] : null);
                    measures.push(mm);
                    ['L', 'R'].forEach(function (side) {
                        mm[side].times.forEach(function (t) { notes[side].push({ t: t, win: windowFor(mm[side].interval), color: mm[side].color, m: mm.m, side: side, dense: mm[side].interval < DENSE_S, hit: false, miss: false, el: null }); });
                    });
                }
            }
            /* 讓元素重播一次動畫的小技巧：先移除 class，讀一次 offsetWidth 強制瀏覽器重新計算，再加回 class */
            function bump(el, cls) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }
            /* 扣一顆生命：連擊歸零、畫面閃紅框，生命用完就結束 */
            function hurt(why) {
                health--; streak = 0; paintHearts();
                bump(stage, 'py-stage--hurt');
                Sfx.play('bad');
                if (health <= 0) endGame(why);
            }
            /* 結束遊戲：計算撐了幾秒、命中率、平均偏早或偏晚，並顯示結算 */
            function endGame(why) {
                if (over) return;
                over = true; state = 'over';
                var secs = Math.max(0, (performance.now() - t0) / 1000 - LEAD_S);
                var n = doneMeasures, isNew = Reaction.setBest(ID, n, function (v, b) { return v > b; });
                ctx.setMeta(fmtBest(Reaction.getBest(ID)));
                msg.textContent = '生命用完了！';
                var acc = hits + misses + extras > 0 ? hits / (hits + misses + extras) * 100 : 0;
                var bias = biasN ? biasSum / biasN : 0;
                /* 結算畫面上的秒數類數字：4 位小數、第 3／4 位不為 0，各產生一次 */
                var secsShown = Leaderboard.fake4(secs), biasShown = Leaderboard.fake4(Math.abs(bias));
                console.log('左右不同拍：撐了 ' + secs.toFixed(6) + ' 秒、平均偏差 ' + bias.toFixed(6) + ' 秒 → 顯示 ' + secsShown.toFixed(4) + ' 秒、' + biasShown.toFixed(4) + ' 秒');
                my.after(1100, function () {
                    kit.result(root, {
                        score: n,        /* 世界排行榜成績（跟 setBest 存的同一個數字） */
                        num: n + ' 小節', label: rating(n),
                        lines: ['撐了 ' + secsShown.toFixed(4) + ' 秒，最後的速度 ' + Math.round(bpmFor(curM)) + ' BPM', '打中 ' + hits + '、漏掉 ' + misses + '、多點 ' + extras + '（命中率 ' + acc.toFixed(0) + '%）', biasN ? (Math.abs(bias) < 0.005 ? '節奏很準' : (bias < 0 ? '平均偏早 ' : '平均偏晚 ') + biasShown.toFixed(4) + ' 秒') : ''].filter(Boolean),
                        isNew: isNew && n > 0, sfx: n >= 12 ? 'win' : 'neutral', onAgain: round
                    });
                });
            }

            /* 每影格（以及 setTimeout 後備）執行一次：產生小節、移動方塊、偵測漏掉、播節拍聲、計小節數 */
            /* 每影格（與 setTimeout 後備）：生成小節、掉落方塊、處理漏掉、節拍聲、小節計數 */
            function tick() {
                if (state !== 'run') return;
                /* now：遊戲開始後經過幾秒 */
                var now = (performance.now() - t0) / 1000;
                ensure(now);
                ['L', 'R'].forEach(function (side) {
                    var lane = side === 'L' ? laneL : laneR, arr = notes[side];
                    for (var i = 0; i < arr.length; i++) {
                        var n = arr[i];
                        if (n.hit) { continue; }
                        /* dt：這個方塊還要多久到紅線（負數＝已經過了） */
                        var dt = n.t - now;                              /* 還要多久到基準線 */
                        /* 還沒進畫面的方塊就不用處理（方塊依時間排好，直接 break） */
                        if (dt > FALL_S + 0.1) break;                    /* 之後的還沒進畫面（方塊依時間排好）*/
                        /* 過了紅線又超過判定視窗還沒打中 → 漏掉，扣生命 */
                        if (!n.miss && dt < -n.win) {                    /* 過了基準線 ＋ 視窗還沒打中 → 漏掉 */
                            n.miss = true; misses++;
                            if (n.el) n.el.classList.add('py-note--miss');
                            var pk = n.m + side;
                            /* 滾奏（太密的藍、紫色小節）：同一小節同一邊只扣一次，不然一次漏掉就會扣光 */
                            if (!n.dense || !penalized[pk]) { penalized[pk] = true; hurt('漏掉了方塊'); }       /* 滾奏：同一小節同一邊只扣一次 */
                            if (over) return;
                        }
                        /* 方塊快要進畫面時才建立元素（不用一開始就建立所有方塊） */
                        if (!n.el && dt > -0.5) {
                            n.el = h('div', { 'class': 'py-note py-note--' + n.color }); lane.appendChild(n.el);
                        }
                        if (n.el) {
                            /* 方塊的位置＝紅線位置 − 還剩的時間 × 掉落速度，用 transform 移動 */
                            var y = LINE_Y - dt * SPEED;
                            n.el.style.transform = 'translateY(' + (y - 14).toFixed(1) + 'px)';
                            if (dt < -0.6 && n.el.parentNode) { n.el.parentNode.removeChild(n.el); n.el = null; }
                        }
                    }
                    /* 清掉已經處理過很久的方塊，避免陣列越來越大 */
                    /* 清掉已經打中很久的 */
                    while (arr.length > 80 && (arr[0].hit || arr[0].miss) && arr[0].t < now - 1) arr.shift();
                });
                /* 小節與節拍：每一拍播一次「滴」聲、紅線閃一下；小節結束就加計撐過的小節數 */
                /* 小節與節拍 */
                for (var q = 0; q < measures.length; q++) {
                    var mm = measures[q];
                    if (now >= mm.start && now < mm.start + mm.dur) {
                        curM = mm.m;
                        var bi = Math.floor((now - mm.start) / mm.bs);
                        if (mm.m * 4 + bi !== lastBeatIdx) { lastBeatIdx = mm.m * 4 + bi; Sfx.play('tick'); beatFlash(bi); }
                    }
                    if (now >= mm.start + mm.dur && mm.m + 1 > doneMeasures) {
                        doneMeasures = mm.m + 1;
                        var best = Reaction.getBest(ID);
                        ctx.setMeta(kit.meta(['小節 ' + doneMeasures, best != null ? '最佳 ' + best : '']));
                    }
                }
                var cm = null; for (var z = 0; z < measures.length; z++) if (now >= measures[z].start && now < measures[z].start + measures[z].dur) cm = measures[z];
                if (cm) head.textContent = '第 ' + (cm.m + 1) + ' 小節　' + Math.round(cm.bpm) + ' BPM　左 ' + BY_ID[cm.L.color].name + '（' + BY_ID[cm.L.color].label + '）／右 ' + BY_ID[cm.R.color].name + '（' + BY_ID[cm.R.color].label + '）';
                else if (now < LEAD_S) head.textContent = '準備…' + Math.ceil(LEAD_S - now) + '　方塊碰到紅線的那一刻點該邊';
            }
            /* 每一拍紅線閃一下（第 1 拍閃得比較亮） */
            /* 每一拍基準線閃一下（第 1 拍閃得比較亮）*/
            function beatFlash(bi) { [lineL, lineR].forEach(function (l) { bump(l, bi === 0 ? 'py-line--bar' : 'py-line--beat'); }); }

            /* tap：玩家點某一邊——找離現在最近、在視窗內的方塊，找到＝打中，找不到＝多點，扣生命 */
            function tap(side, e) {
                if (e) e.preventDefault();
                if (state !== 'run') return;
                var now = (performance.now() - t0) / 1000, arr = notes[side], i = matchTap(arr, now);
                var lane = side === 'L' ? laneL : laneR;
                bump(lane, 'py-lane--hit');
                if (i < 0) { extras++; hurt('多點了一下'); return; }
                var n = arr[i]; n.hit = true; hits++; biasSum += now - n.t; biasN++; streak++;
                var el = n.el; n.el = null;
                if (el) { el.classList.add('py-note--hit'); my.after(240, function () { if (el.parentNode) el.parentNode.removeChild(el); }); }
                Sfx.play(side === 'L' ? 'click' : 'pop');
                if (streak % HEAL_EVERY === 0 && health < HEALTH_MAX) { health++; paintHearts(); }
            }
            /* 左右軌道：pointerdown 一碰就判定 */
            laneL.addEventListener('pointerdown', function (e) { tap('L', e); });
            laneR.addEventListener('pointerdown', function (e) { tap('R', e); });

            /* 開始遊戲：量版面、記下開始時間，啟動每影格更新（rAF）與每 33 毫秒的後備更新（分頁在背景時 rAF 會被暫停，沒有後備就會卡死） */
            function start() {
                if (my.dead) return;
                layout(); paintHearts();
                state = 'run'; t0 = performance.now();
                try { console.info('[左右不同拍] 開始：BPM ' + BPM_START + ' → 每小節 +' + BPM_STEP + '（上限 ' + BPM_MAX + '），生命 ' + HEALTH_MAX); } catch (err) { }
                my.loop(function () { if (state !== 'run') return false; tick(); });
                /* 遞迴的小技巧：again() 每 33ms 排下一次 tick，直到遊戲結束 */
                (function again() { my.after(33, function () { if (state === 'run') { tick(); again(); } }); })();
            }

            /* G.debug：測試用後門，nextNotes 可取得即將到達的方塊時刻 */
            G.debug = {
                state: function () { return { state: state, health: health, hits: hits, misses: misses, extras: extras, doneMeasures: doneMeasures, curM: curM, now: state === 'run' ? (performance.now() - t0) / 1000 : null, measures: measures.map(function (m) { return { m: m.m, start: m.start, L: m.L.color, R: m.R.color, bpm: m.bpm }; }), upcoming: { L: notes.L.filter(function (n) { return !n.hit && !n.miss; }).slice(0, 3).map(function (n) { return n.t; }), R: notes.R.filter(function (n) { return !n.hit && !n.miss; }).slice(0, 3).map(function (n) { return n.t; }) } }; },
                tapL: function () { tap('L'); }, tapR: function () { tap('R'); },
                nextNotes: function (side) { return notes[side].filter(function (n) { return !n.hit && !n.miss; }).map(function (n) { return n.t; }); },
                clock: function () { return t0; }
            };
            /* 開場等 500 毫秒再開始 */
            my.after(500, start);
        }

        round();
    }

    /* 遊戲身分證 */
    var G = {
        id: ID,
        name: '左右不同拍',
        rule: '左右各有一條軌道，有顏色的方塊會由上往下掉，碰到下方紅線的那一刻，就點該邊（左手點左邊、右手點右邊）。顏色代表到下一個方塊隔幾拍：紅 4 拍、橙 2 拍、黃 1 拍、綠半拍、藍四分之一拍、紫八分之一拍。左右兩邊每一小節各換一次顏色，而且兩邊不一樣，速度也會越來越快。漏掉方塊或亂點都會扣生命，看你能撐幾小節！',
        mount: mount,
        /* 世界排行榜的成績規格 */
        score: SCORE,
        /* test 匯出純函式給 Node 自動測試 */
        test: { DENSE_S: DENSE_S, bpmFor: bpmFor, beatSec: beatSec, measureSec: measureSec, allowedColors: allowedColors, laneRate: laneRate, nextMeasure: nextMeasure, makeChart: makeChart, windowFor: windowFor, matchTap: matchTap, rating: rating, COLORS: COLORS, UNLOCK: UNLOCK, LEAD_S: LEAD_S, FALL_S: FALL_S, HIT_WIN: HIT_WIN, MIN_INTERVAL_S: MIN_INTERVAL_S, MAX_LANE_RATE: MAX_LANE_RATE, MAX_TOTAL_RATE: MAX_TOTAL_RATE, BPM_START: BPM_START, BPM_MAX: BPM_MAX, BPM_STEP: BPM_STEP, HEALTH_MAX: HEALTH_MAX }
    };
    /* 登記到遊戲清單 */
    Reaction.register(G);
})();

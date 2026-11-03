/* ═══════════════════════════════════════════════════════════════════
   reaction_knockcount.js — 秒反應・敲幾下（企劃 313，依使用者的修改：取消飛鳥、改成「銅缽」干擾）
   樣式：css/games/reaction_knockcount.css（這款專屬的 class 一律以「knockcount-」開頭；共用元件在 css/reaction_common.css）
   寺廟的木魚。師父先敲一段（快速的節奏，例如 咚咚 咚咚咚 咚），木魚旁邊沒有數字。師父敲完，**你要快速敲出一樣的次數**（不用一樣的節奏），
   敲完按「我數好了」（V1.36.0：這顆按鈕要等你敲了第一下木魚才會出現——常有玩家沒敲木魚就按了按鈕而失敗）。揭曉：「師父敲了 17 下，你敲了 17 下」。剛好才過關。
   ───────────────────────────────────────────────────────────────────
   · 節奏（makeLevel）：把總次數 N 隨機分成好幾組（每組 1～5 下）；組內每下間隔 tempo 毫秒、組與組之間停頓 PAUSE 內隨機長短
     （人會數組數、數錯總數）。每下之間的間隔隨關卡越來越快。
   · 干擾（使用者要求把「飛鳥」換成「銅缽」）：師父的另一手會**不定時敲銅缽**（「噹——」，聲音和畫面都跟木魚不同），可能連續多下（一串 1～3 聲）；
     **銅缽的聲音不算**。時間點隨機，會夾在木魚的節奏中間，但離任何一下木魚至少 BOWL_CLEAR 毫秒（不會剛好重疊分不清）。銅缽聲數隨關卡增加。
     V1.36.0：師父會**做出去敲銅缽的動作**來干擾——銅缽聲響之前一瞬間，師父的另一隻手（第二支木槌）從肩膀伸出去敲向銅缽、身體跟著往銅缽那邊傾（BOWL_LEAD_MS），
     所以光看師父的手就分不清這一下是木魚還是銅缽，要靠聲音和位置分辨。
   · 玩家這一段：師父敲完才能敲；在木魚上快速點，每點一下算一下，敲了第一下之後才出現「我數好了」，覺得夠了按它。判定：你敲的次數 ＝ 師父敲木魚的次數才過關。
   · 難度（線性）：次數 4 → 30（COUNT）、間隔 520 → 160 毫秒（TEMPO_MS）、銅缽聲數 0 → 6（BOWLS，第 BOWL_FROM 關起才有）、
     組與組的停頓 400～1200 毫秒、玩家作答的時間 = RESP_BASE + 次數 × RESP_PER 秒。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    /* 新手導讀：整個檔案包在 (function () { ... })(); 裡（叫「立即執行函式」），裡面的變數都是這個檔案私有的，不會跟別的遊戲檔案的同名變數打架。
       檔案由上往下大致分成：① 參數區（標題寫著可以自己調整的參數：難度、秒數、文字大多在這）；② 純函式（只做計算、不碰畫面：出題、判斷對錯，單元測試直接測它們）；③ 畫面（mount 是進場、setup 是每一關開始時呼叫，負責把畫面建出來並處理點擊）。
       最後的 Reaction.register(G) 把這款遊戲「登記」給選單（沒有這行，選單就看不到它）。'use strict' 是嚴格模式：打錯變數名稱會直接報錯，而不是默默建立新變數。
       這款遊戲的代號是 'knockcount'：選單、成績、存檔都靠它；樣式在 css/games/reaction_knockcount.css，裡面的 class 名稱一律以 knockcount- 開頭。 */
    'use strict';

    var ID = 'knockcount';                              /* 這款遊戲的代號：選單、成績、存檔、CSS class 前綴都用它 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 90 };  /* 成績規格：better（max＝越大越好、min＝越小越好）、decimals 小數位數、format 顯示格式、label 名稱、min／max 合理範圍（超出範圍的成績不會送排行榜） */
    var h = UI.h, kit = Reaction.kit;                   /* h：建立網頁元素的小工具；kit：闖關遊戲共用的工具箱 */

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 30;                       /* 幾關之後難度到頂 */
    var COUNT = [4, 30];                        /* 師父敲木魚的總次數：第 1 關 → 到頂 */
    var TEMPO_MS = [520, 160];                  /* 組內每一下的間隔（毫秒）：第 1 關 → 到頂 */
    var BOWLS = [0, 6];                         /* 銅缽的聲數：第 BOWL_FROM 關起才有，第 BOWL_FROM 關 1 聲 → 到頂 */
    var BOWL_FROM = 3;                              /* 第幾關起才有銅缽（銅缽的聲數見上面的 BOWLS） */
    var GROUP_MAX = 5;                          /* 每組最多幾下 */
    var PAUSE_MS = [400, 1200];                 /* 組與組之間的停頓（毫秒，隨機） */
    var BOWL_CLEAR = 90;                        /* 銅缽聲離任何一下木魚至少多遠（毫秒） */
    var BOWL_GAP = 380;                         /* 一串連續銅缽聲之間的間隔（毫秒） */
    var BOWL_LEAD_MS = 150;                     /* 師父的手在銅缽「噹」聲響之前多久開始揮出去（毫秒；揮到一半剛好響） */
    var LEAD_MS = 700;                          /* 開始後多久師父才敲第一下 */
    var RESP_BASE = 6, RESP_PER = 0.35;         /* 作答時間（秒）＝ RESP_BASE ＋ 次數 × RESP_PER */
    var MAX_LEVEL = 90;                             /* 最後一關：過了第 90 關就算全破（也是成績的上限） */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function ramp(level, pair) { return kit.ramp(level, pair[0], pair[1], RAMP_LEVELS); }
    function countFor(level) { return Math.round(ramp(level, COUNT)); }
    function tempoFor(level) { return Math.round(ramp(level, TEMPO_MS)); }
    function bowlsFor(level) { return level < BOWL_FROM ? 0 : Math.max(1, Math.round(kit.ramp(level, 1, BOWLS[1], RAMP_LEVELS))); }
    function respMs(count) { return Math.round((RESP_BASE + count * RESP_PER) * 1000); }
    /* 把 total 分成好幾組（每組 1～GROUP_MAX 下）；至少兩組（total ≥ 2 時），不是每組一樣大 */
    function splitGroups(total, rand) {
        rand = rand || Math.random;                     /* 沒有傳亂數函式就用 Math.random（測試時可以傳固定的亂數，結果才能重現） */
        if (total <= 1) return [total];
        for (var tr = 0; tr < 200; tr++) {
            var gs = [], left = total;
            while (left > 0) { var g = Math.min(left, kit.randInt(1, GROUP_MAX, rand)); gs.push(g); left -= g; }
            if (gs.length >= 2 && (total < 4 || new Set(gs).size > 1)) return gs;
        }
        var half = Math.floor(total / 2); return [half, total - half];
    }
    /* 出一關：{ count, groups, events（依時間排序：{ t（毫秒）, type: 'fish'｜'bowl' }）, fishMs（木魚最後一下的時間）, endMs（全部結束的時間）, bowls, tempo, level } */
    function makeLevel(level, rand) {
        rand = rand || Math.random;
        var count = countFor(level), tempo = tempoFor(level), groups = splitGroups(count, rand), events = [], t = LEAD_MS;
        groups.forEach(function (g, gi) {
            if (gi > 0) t += kit.randInt(PAUSE_MS[0], PAUSE_MS[1], rand);
            for (var k = 0; k < g; k++) { events.push({ t: Math.round(t), type: 'fish' }); t += tempo * kit.randFloat(0.9, 1.1, rand); }
        });
        var fishMs = events[events.length - 1].t, fish = events.map(function (e) { return e.t; });
        /* 銅缽：分成 1～3 串（每串 1～3 聲），時間隨機落在師父敲的這段時間裡，離每一下木魚至少 BOWL_CLEAR */
        var want = bowlsFor(level), bowlTimes = [], guard = 0;
        function clear(x) { for (var i = 0; i < fish.length; i++) if (Math.abs(fish[i] - x) < BOWL_CLEAR) return false; for (var j = 0; j < bowlTimes.length; j++) if (Math.abs(bowlTimes[j] - x) < BOWL_CLEAR) return false; return true; }
        while (bowlTimes.length < want && guard++ < 400) {
            var run = Math.min(want - bowlTimes.length, kit.randInt(1, 3, rand)), t0 = kit.randFloat(LEAD_MS * 0.5, fishMs + 400, rand), part = [], okRun = true;
            for (var r = 0; r < run; r++) { var tt = Math.round(t0 + r * BOWL_GAP); if (!clear(tt) || part.indexOf(tt) >= 0) { okRun = false; break; } part.push(tt); }
            if (okRun) { part.forEach(function (x) { bowlTimes.push(x); }); }
        }
        bowlTimes.forEach(function (x) { events.push({ t: x, type: 'bowl' }); });
        events.sort(function (a, b) { return a.t - b.t; });
        return { count: count, groups: groups, events: events, fishMs: fishMs, endMs: events[events.length - 1].t, bowls: bowlTimes.length, tempo: tempo, level: level };
    }
    /* 結算畫面的評語：依成績回傳一句話 */
    function rating(n) {
        if (n >= 15) return '木魚大師！';
        if (n >= 10) return '耳朵很靈！';
        if (n >= 6) return '不錯喔！';
        if (n >= 3) return '再接再厲！';
        return '只數木魚，銅缽的聲音不算！';
    }

    /* mount：選單按下這款遊戲時會呼叫它。把「闖關」的流程（第幾關、過關、失敗、結算、最佳紀錄）交給共用骨架 kit.run，我們只提供 setup（每一關怎麼畫）、rating（評語）等小零件。 */
    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 5, stageClass: 'knockcount-stage',
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['通過 ' + S.cleared + ' 關']; },
            setup: setup
        });
    }

    /* 木魚（SVG）：圓圓的木頭、一條嘴縫；木槌 */
    function fishSvg(parent) {
        var s = kit.svg('svg', { 'class': 'knockcount-fish', viewBox: '0 0 200 170', width: 200, height: 170 }, parent);
        kit.svg('ellipse', { 'class': 'knockcount-fish__body', cx: 100, cy: 92, rx: 88, ry: 70 }, s);
        kit.svg('path', { 'class': 'knockcount-fish__mouth', d: 'M34 98 Q100 130 166 98' }, s);
        kit.svg('ellipse', { 'class': 'knockcount-fish__shine', cx: 70, cy: 62, rx: 26, ry: 12 }, s);
        kit.svg('rect', { 'class': 'knockcount-fish__stand', x: 50, y: 150, width: 100, height: 14, rx: 7 }, s);
        return s;
    }
    /* 銅缽（SVG）：金色的碗，缽緣有一圈光；敲的時候擴散一圈波紋 */
    function bowlSvg(parent) {
        var s = kit.svg('svg', { 'class': 'knockcount-bowl', viewBox: '0 0 140 110', width: 140, height: 110 }, parent);
        kit.svg('path', { 'class': 'knockcount-bowl__body', d: 'M10 30 Q70 8 130 30 Q124 92 70 98 Q16 92 10 30 Z' }, s);
        kit.svg('ellipse', { 'class': 'knockcount-bowl__rim', cx: 70, cy: 28, rx: 60, ry: 14 }, s);
        kit.svg('ellipse', { 'class': 'knockcount-bowl__wave', cx: 70, cy: 28, rx: 60, ry: 14 }, s);
        return s;
    }

    /* setup(api)：每一關開始時呼叫一次，負責出題並把這一關的畫面建出來。api 是共用骨架給的工具：api.stage（這一關的畫面容器）、api.level（第幾關）、
       api.after（延遲執行，換關後自動作廢）、api.timer（倒數計時）、api.pass／api.fail（過關／失敗）。 */
    function setup(api) {
        var stage = api.stage, level = api.level;       /* stage：這一關的畫面容器（要畫的東西都放進去）；level：現在是第幾關 */
        var q = makeLevel(level, api.rand), N = q.count;
        api.info = q;                                   /* 把這一關的題目資料掛在 api.info，測試與 debug 用（玩家看不到） */
        console.log('[敲幾下] 第 ' + level + ' 關：師父敲木魚 ' + N + ' 下（分組 ' + q.groups.join('、') + '），銅缽 ' + q.bowls + ' 聲（不算），組內間隔約 ' + q.tempo + ' 毫秒；木魚最後一下 ' + q.fishMs + ' 毫秒、全部 ' + q.endMs + ' 毫秒');  /* 在瀏覽器主控台（按 F12）印出這一關的出題內容，方便除錯與驗證 */

        var W = stage.clientWidth || 472, H = stage.clientHeight || 640;
        var field = h('div', { 'class': 'knockcount-field' });
        stage.appendChild(field);
        var tip = h('div', { 'class': 'qz-note knockcount-tip', text: '聽師父敲木魚，數有幾下' });
        field.appendChild(tip);
        var count = h('div', { 'class': 'knockcount-count', text: '' });
        field.appendChild(count);
        /* 師父（剪影）、木槌、木魚、銅缽 */
        var monk = h('div', { 'class': 'knockcount-monk' }, [h('div', { 'class': 'knockcount-monk__head' }), h('div', { 'class': 'knockcount-monk__body' })]);
        field.appendChild(monk);
        var mallet = h('div', { 'class': 'knockcount-mallet' }, [h('div', { 'class': 'knockcount-mallet__stick' }), h('div', { 'class': 'knockcount-mallet__head' })]);
        field.appendChild(mallet);
        var mallet2 = h('div', { 'class': 'knockcount-mallet knockcount-mallet2' }, [h('div', { 'class': 'knockcount-mallet__stick' }), h('div', { 'class': 'knockcount-mallet__head' })]);          /* 師父另一隻手的木槌：專門用來敲銅缽 */
        field.appendChild(mallet2);
        var fishBox = h('div', { 'class': 'knockcount-fishbox' }); fishSvg(fishBox); field.appendChild(fishBox);
        var bowlBox = h('div', { 'class': 'knockcount-bowlbox' }); bowlSvg(bowlBox); field.appendChild(bowlBox);
        var info = h('div', { 'class': 'qz-note knockcount-info', text: '' });
        field.appendChild(info);
        var done = h('div', { 'class': 'btn btn--go knockcount-done', text: '我數好了' });
        done.style.display = 'none'; field.appendChild(done);

        var phase = 'watch', taps = 0, over = false;
        function hitFish(cls) { fishBox.classList.remove('knockcount-hit'); void fishBox.offsetWidth; fishBox.classList.add('knockcount-hit'); if (cls) { mallet.classList.remove('knockcount-mallet--hit'); void mallet.offsetWidth; mallet.classList.add('knockcount-mallet--hit'); } }
        function hitBowl() { bowlBox.classList.remove('knockcount-hit'); void bowlBox.offsetWidth; bowlBox.classList.add('knockcount-hit'); }
        /* 師父去敲銅缽的動作：另一隻手的木槌揮向銅缽、身體往銅缽那邊傾一下（動畫約 0.4 秒，揮到一半剛好響） */
        function reachBowl() {
            mallet2.classList.remove('knockcount-mallet2--hit'); void mallet2.offsetWidth; mallet2.classList.add('knockcount-mallet2--hit');
            monk.classList.remove('knockcount-monk--lean'); void monk.offsetWidth; monk.classList.add('knockcount-monk--lean');
        }
        /* 師父表演：依時間表敲木魚（咚）和銅缽（噹） */
        q.events.forEach(function (e) {
            api.after(e.t, function () {
                if (e.type === 'fish') { hitFish(true); Sfx.play('tick'); } else { hitBowl(); Sfx.play('note'); }
            });
            if (e.type === 'bowl') api.after(Math.max(0, e.t - BOWL_LEAD_MS), reachBowl);                  /* 銅缽響之前，師父的手先揮出去 */
        });
        api.after(q.endMs + 450, startPlay);
        function startPlay() {
            if (api.over) return;
            phase = 'play'; tip.textContent = '快速敲出一樣的次數';                /* 提示只放一行：兩行會蓋到下面的大數字（按鈕怎麼出現，下面的小字說明） */
            info.textContent = '只算木魚，銅缽的聲音不算；敲了第一下之後才能按「我數好了」'; count.textContent = '0';           /* 「我數好了」要等敲了第一下木魚才出現 */
            api.timer(respMs(N), function () { judge(true); });  /* 開始倒數（畫面上方的時間條）：時間到就呼叫後面那個函式 */
            if (level === 1 && kit.once('knockcount.hint')) kit.hintOn(stage, fishBox, { mode: 'tap', delay: 300, text: '快速敲出一樣的次數' });  /* 操作提示（手指圖示指出該點哪裡）：玩家第一次按下就消失 */
        }
        kit.onTap(fishBox, function () {
            if (phase !== 'play' || over || api.over) return;
            taps++; count.textContent = String(taps); hitFish(false); Sfx.play('tick');
            if (taps === 1) done.style.display = '';                         /* 敲了第一下木魚，「我數好了」才出現 */
        });
        kit.onTap(done, function () { if (phase === 'play') judge(false); });
        /* 判定玩家的答案：答對就過關（api.pass），答錯或超時就失敗（api.fail） */
        function judge(timeout) {
            if (over || api.over || phase !== 'play') return;
            over = true; phase = 'end'; done.style.display = 'none';
            var ok = taps === N, groups = q.groups.join(' ＋ ');
            count.textContent = String(taps);
            info.textContent = '師父敲了 ' + N + ' 下，你敲了 ' + taps + ' 下' + (ok ? '，剛好！' : (taps < N ? '，少了 ' + (N - taps) + ' 下' : '，多了 ' + (taps - N) + ' 下')) + (q.bowls ? '（銅缽 ' + q.bowls + ' 聲不算）' : '');
            kit.flash(stage, ok, api.my);
            if (ok) { api.pass({ delay: 1600 }); return; }
            api.fail({ delay: 3000, lines: ['師父敲了 ' + N + ' 下，你敲了 ' + taps + ' 下' + (timeout ? '（時間到）' : ''), '師父的節奏：' + groups + ' ＝ ' + N + (q.bowls ? '；銅缽 ' + q.bowls + ' 聲不算' : '')] });
        }
        /* 給測試／debug 用：api.solve 自動走出正解、api.wrong 故意走錯一步、api.state 回報目前狀態（瀏覽器自動測試會呼叫它們，玩家用不到）。 */
        api.solve = function () { if (phase !== 'play') return; while (taps < N) { taps++; } count.textContent = String(taps); judge(false); };
        api.wrong = function () { if (phase !== 'play') return; taps = Math.max(0, N - 1); count.textContent = String(taps); judge(false); };
    }

    /* 遊戲登記資料：id 代號、name 選單上的名稱、rule 玩法說明（**包起來的是粗體重點）、mount 進場函式、score 成績規格、test 給單元測試用的內部函式。 */
    var G = {
        id: ID,
        name: '敲幾下',
        rule: '寺廟的木魚。師父先敲一段（快速的節奏，分成好幾組，組與組之間停頓長短不一），**木魚旁邊沒有數字**。師父另一手會不定時敲銅缽（「噹——」，可能連續好幾下），**銅缽的聲音不算**。師父敲完，**你要在木魚上快速敲出一樣的次數**（不用一樣的節奏），敲完按「我數好了」（敲了第一下木魚，按鈕才會出現）。**次數剛好**才過關。師父敲銅缽時手會揮過去、身體會傾過去，別被他的動作騙了。越後面，次數越多、師父敲得越快、銅缽干擾越多！',
        mount: mount,
        score: SCORE,
        /* test：把內部函式與參數交給單元測試（test/reaction/ 底下的 t_*.js）使用，遊戲本身不會用到。 */
        test: {
            countFor: countFor, tempoFor: tempoFor, bowlsFor: bowlsFor, respMs: respMs, splitGroups: splitGroups, makeLevel: makeLevel, rating: rating,
            RAMP_LEVELS: RAMP_LEVELS, COUNT: COUNT, TEMPO_MS: TEMPO_MS, BOWLS: BOWLS, BOWL_FROM: BOWL_FROM, GROUP_MAX: GROUP_MAX, PAUSE_MS: PAUSE_MS, BOWL_CLEAR: BOWL_CLEAR, BOWL_GAP: BOWL_GAP, BOWL_LEAD_MS: BOWL_LEAD_MS, LEAD_MS: LEAD_MS, RESP_BASE: RESP_BASE, RESP_PER: RESP_PER, MAX_LEVEL: MAX_LEVEL
        }
    };
    /* 把這款遊戲登記給選單（沒有這行，選單就看不到它） */
    Reaction.register(G);
})();

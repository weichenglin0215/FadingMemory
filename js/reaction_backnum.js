/* ═══════════════════════════════════════════════════════════════════
   reaction_backnum.js — 秒反應・倒背數字（原「倒背電話」）
   3×3 九宮格（數字 1～9）。先看格子依序發亮，再「倒著」把順序按回去：
   例如亮 1、2、3，就要按 3、2、1。看你能過第幾關。
   ───────────────────────────────────────────────────────────────────
   · 第 1 關亮 3 個，之後每關多 1 個（SEQ_START＋關數−1）。
   · 每一關可以錯 chances(level) 次：第 1 關 1 次，之後每 3 關多 1 次（第 4 關 2 次、第 7 關 3 次…）。
     錯的次數超過機會就失敗。發生錯誤時，用「同一組數字」再亮一次，加強記憶，然後重新輸入。
   · 一開始先用很大的字提醒「倒著順序按數字」。
   · 亮燈順序隨機，相鄰兩個不會是同一格（超過 9 個時格子會重複出現，但不會連續相同）。
   · 亮燈速度隨關卡線性加快（每格亮 LIT_START → LIT_END 秒）。
   · 成績＝通過關數（越多越好）。流程用 setTimeout 排程，不靠 rAF。
   ═══════════════════════════════════════════════════════════════════ */

/* （檔案結構說明見 js/reaction_sticks.js 開頭的「新手導讀」） */
(function () {
    'use strict';

    var ID = 'backnum';

    /* 世界排行榜的成績規格（欄位說明見 js/leaderboard.js 開頭）；資料庫 MF_games 裡 backnum 那一列要一致
       （node test/leaderboard/gen_games_sql.cjs 會從這裡產生 insert，test/reaction/t_leaderboard.js 會檢查兩邊是否一致）。 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 200 };
    var h = UI.h;
    var kit = Reaction.kit;

    /* 難度設定：想調難度只要改這一區的數字 */
    /* ═══ 可以自己調的參數 ═══ */
    /* 第 1 關要記幾個數字 */
    var SEQ_START = 3;            /* 第 1 關要記幾個 */
    var CHANCE_EVERY = 3;         /* 每幾關多一次錯誤機會 */
    var RAMP = 15;                /* 亮燈速度走完的關卡 */
    var LIT_START = 0.7, LIT_END = 0.45;    /* 每格亮多久（秒） */
    var GAP_S = 0.25;             /* 兩格之間的空檔（秒） */
    var SPLASH_MS = 2400;         /* 開場大字提醒停多久 */
    var CLEAR_MS = 900;
    var REPLAY_MS = 1100;         /* 答錯後多久再亮一次 */

    function fmtBest(v) { return v == null ? '' : '最佳 ' + v + ' 關'; }

    /* ═══ 純函式（也給 Node 測試用）═══ */
    /* 第 level 關要記幾個：3 + (關數 − 1) */
    function seqLen(level) { return SEQ_START + level - 1; }
    /* 這一關可以錯幾次：Math.floor 是「無條件捨去」，所以每 3 關才多 1 次 */
    function chances(level) { return 1 + Math.floor((level - 1) / CHANCE_EVERY); }
    /* 每一格亮多久：kit.ramp 是線性難度，隨關卡從 0.7 秒平均縮短到 0.45 秒 */
    function litSec(level) { return kit.ramp(level, LIT_START, LIT_END, RAMP); }
    /* 產生亮燈順序（1～9 的數字）。長度 ≤ 9 時用洗牌取前 L 個（不重複）；超過 9 就逐個隨機挑，但相鄰不能相同 */
    /* 亮燈順序：每格 1～9，相鄰不同；長度 ≤ 9 時盡量不重複（用洗牌取前 L 個） */
    function makeSeq(L, rand) {
        /* rand = rand || Math.random：沒有指定亂數函式就用內建的 */
        rand = rand || Math.random;
        var nums = [1, 2, 3, 4, 5, 6, 7, 8, 9], out = [];
        /* kit.shuffle 洗牌，.slice(0, L) 取前 L 個 */
        if (L <= 9) return kit.shuffle(nums, rand).slice(0, L);
        /* while：還沒湊滿 L 個就繼續挑 */
        while (out.length < L) {
            var n = kit.pick(nums, rand);
            /* 如果挑到的數字和上一個一樣就 continue（跳過這次，重挑） */
            if (out.length && out[out.length - 1] === n) continue;
            out.push(n);
        }
        return out;
    }
    /* slice() 先複製陣列再 reverse() 倒過來（reverse 會直接改原陣列，所以先複製避免弄壞原本的順序） */
    function reversed(seq) { return seq.slice().reverse(); }

    /* mount：遊戲進場點 */
    function mount(root, ctx) {
        var R = null;

        /* startAt：從第幾關開始（失敗後可從前 5 關繼續）*/
        /* round：開一局（失敗後可從前 5 關繼續，所以有 startAt 參數） */
        function round(startAt) {
            if (R) R.dispose();
            R = kit.round();
            var my = R;
            root.innerHTML = '';

            /* level 關卡；cleared 已過幾關；errors 這關已錯幾次；seq 亮燈順序；want 要按的順序（倒過來）；idx 目前按到第幾個；runId 每次播放 +1，讓舊的排程知道自己過期 */
            var level = startAt || 1, cleared = level - 1, newRec = false, state = 'idle', errors = 0, seq = [], want = [], idx = 0, runId = 0;
            /* 建立畫面元素：標題、橫幅提示、九宮格、開場大字 */
            var head = h('div', { 'class': 'bn-head' });
            var banner = h('div', { 'class': 'bn-banner' });
            var grid = h('div', { 'class': 'bn-grid' });
            var splash = h('div', { 'class': 'bn-splash' }, [h('div', { 'class': 'bn-splash__big', text: '倒著順序' }), h('div', { 'class': 'bn-splash__big', text: '按數字！' }), h('div', { 'class': 'bn-splash__small', text: '例如亮 1、2、3，就要按 3、2、1' })]);
            /* cells：以數字當索引存放九顆按鈕（cells[1]…cells[9]） */
            var cells = [];
            for (var n = 1; n <= 9; n++) {
                /* 這個 (function (n) {...})(n) 是「立即執行函式」：為每個迴圈各自留住一份 n（舊式 JS 的 var 沒有區塊範圍，沒包起來的話所有按鈕都會共用同一個 n） */
                (function (n) {
                    var el = h('button', { 'class': 'bn-cell', text: String(n) });
                    /* pointerdown：手指一碰到就算按下，比 click 更即時 */
                    el.addEventListener('pointerdown', function (e) { e.preventDefault(); tap(n); });
                    cells[n] = el;
                    grid.appendChild(el);
                })(n);
            }
            /* 把元素依序放進畫面 */
            [head, banner, grid].forEach(function (x) { root.appendChild(x); });
            root.appendChild(splash);

            /* 更新標題列右側的小字 */
            function meta() { ctx.setMeta(kit.meta(['第 ' + level + ' 關', fmtBest(Reaction.getBest(ID))])); }
            /* 更新標題文字：顯示第幾關、要記幾個、還能錯幾次 */
            function paintHead() {
                head.textContent = '第 ' + level + ' 關・' + seqLen(level) + ' 個數字・還能錯 ' + Math.max(0, chances(level) - errors) + ' 次';
            }
            /* 設定橫幅的文字與樣式（cls 是顏色變化版） */
            function setBanner(text, cls) { banner.textContent = text; banner.className = 'bn-banner' + (cls ? ' bn-banner--' + cls : ''); }

            /* 讓某格閃一下 class（發亮、答對或答錯的顏色），ms 毫秒後移除 */
            function flash(n, cls, ms) {
                var el = cells[n];
                el.classList.add(cls);
                my.after(ms, function () { el.classList.remove(cls); });
            }

            /* 播放亮燈順序：每格依序亮起，最後進入「輸入階段」 */
            /* 播放亮燈順序（使用同一組 seq），播完進入輸入 */
            function play(again) {
                /* runId 加 1：這次播放的編號 */
                var id = ++runId;
                state = 'show';
                idx = 0;
                paintHead();
                setBanner(again ? '再看一次，記清楚！' : '看清楚順序…');
                /* lit 每格亮的毫秒數、gap 格子間的空檔、t 目前的時間軸（從 400ms 開始） */
                var lit = litSec(level) * 1000, gap = GAP_S * 1000, t = 400;
                /* 用 forEach 為每個數字排一個「幾毫秒後亮起」的計時器：my.after(延遲, 函式) */
                seq.forEach(function (n) {
                    my.after(t, function () { if (id === runId) { flash(n, 'bn-cell--lit', lit); Sfx.play('tick'); } });
                    t += lit + gap;
                });
                /* 全部亮完後切換到輸入階段 */
                my.after(t, function () {
                    if (id !== runId) return;
                    state = 'input';
                    /* 操作提示（只在第一次進遊戲時）：手指縮放，擺在「要先按的那一格」上＝剛才亮的順序裡最後亮的那一格（要倒著按） */
                    if (Reaction.kit.once('backnum.hint')) Reaction.kit.hintOn(root, cells[seq[seq.length - 1]], { mode: 'tap', text: '請倒著點擊，先點這一格' });
                    setBanner('換你了：倒著按！', 'go');
                    Sfx.play('go');
                });
            }

            /* 開始一關 */
            function startLevel() {
                if (my.dead) return;
                errors = 0;
                /* 產生這關的亮燈順序 */
                seq = makeSeq(seqLen(level));
                /* 要按的順序＝亮燈順序倒過來 */
                want = reversed(seq);
                try { console.info('[倒背數字] 第 ' + level + ' 關：亮燈順序 ' + seq.join('、') + '；要按 ' + want.join('、') + '；可錯 ' + chances(level) + ' 次；每格亮 ' + litSec(level).toFixed(2) + ' 秒'); } catch (e) { }
                meta();
                play(false);
            }

            /* tap：處理按下數字 n */
            function tap(n) {
                if (state !== 'input') return;
                /* 按對了：要按的順序 want 的第 idx 個 */
                if (n === want[idx]) {
                    flash(n, 'bn-cell--ok', 350);
                    Sfx.play('ok');
                    idx++;
                    /* 全部按完＝過關 */
                    if (idx >= want.length) {
                        state = 'clear';
                        cleared = level;
                        if (Reaction.setBest(ID, cleared, function (v, b) { return v > b; })) newRec = true;
                        meta();
                        setBanner('過關！', 'ok');
                        Sfx.play('win');
                        level++;
                        my.after(CLEAR_MS, startLevel);
                    }
                    return;
                }
                /* 按錯的處理 */
                /* 按錯 */
                state = 'wrong';
                flash(n, 'bn-cell--bad', 700);
                Sfx.play('bad');
                errors++;
                paintHead();
                /* 錯誤次數超過這關的機會＝失敗，顯示結算 */
                if (errors > chances(level)) {
                    my.after(900, function () {
                        /* kit.resumeFrom：失敗後可從前 5 關繼續 */
                        var back = kit.resumeFrom(level);
                        kit.result(root, {
                            score: cleared,        /* 世界排行榜成績（跟 setBest 存的同一個數字） */
                            num: cleared + ' 關', label: cleared >= 8 ? '記憶力驚人！' : (cleared >= 4 ? '很不錯！' : '再試一次，會更準！'),
                            lines: ['第 ' + level + ' 關要按：' + want.join('、'), '你按到 ' + n + '，應該是 ' + want[idx]],
                            isNew: newRec, sfx: cleared >= 5 ? 'win' : 'fail', onAgain: function () { round(1); },
                            resume: { level: back, run: function () { round(back); } }
                        });
                    });
                /* 還有機會：用同一組數字再亮一次，加強記憶 */
                } else {
                    setBanner('按錯了！同一組數字再看一次', 'bad');
                    my.after(REPLAY_MS, function () { play(true); });
                }
            }

            /* G.debug：測試用後門 */
            G.debug = {
                state: function () { return { level: level, state: state, errors: errors, seq: seq.slice(), want: want.slice(), idx: idx, cleared: cleared }; },
                tapNext: function () { if (state === 'input') tap(want[idx]); return state; },
                tapWrong: function () { if (state === 'input') tap(want[idx] === 9 ? 1 : want[idx] + 1); return state; }
            };

            /* 開場流程：大字提醒 → 開始第 1 關 */
            /* 開場：大字提醒 → 開始第 1 關 */
            setBanner('');
            head.textContent = '準備…';
            Sfx.play('go');
            /* SPLASH_MS 後隱藏開場大字並開始第一關 */
            my.after(SPLASH_MS, function () { splash.hidden = true; startLevel(); });
        }

        round(1);
    }

    /* 遊戲身分證 */
    var G = {
        id: ID,
        name: '倒背數字',
        rule: '九宮格會依序亮起幾個數字，請「倒著順序」把它們按回去，例如亮 1、2、3 就按 3、2、1。每關多一個數字，按錯會再給你看一次，但機會有限！',
        mount: mount,
        /* 世界排行榜的成績規格 */
        score: SCORE,
        test: { seqLen: seqLen, chances: chances, litSec: litSec, makeSeq: makeSeq, reversed: reversed, SEQ_START: SEQ_START }
    };
    /* 登記到遊戲清單 */
    Reaction.register(G);
})();

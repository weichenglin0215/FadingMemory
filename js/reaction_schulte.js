/* ═══════════════════════════════════════════════════════════════════
   reaction_schulte.js — 秒反應・數字方陣（舒爾特方格）
   6×6＝36 格，黑底白字，把 1～36 依序一個一個點完，計時，越快越好。只玩一局。
   ───────────────────────────────────────────────────────────────────
   · 數字盡量放大、充滿格子；點對的數字變綠色 0.6 秒再變回白色（不留記號，要靠記憶看哪個點過了）。
   · 點錯：那一格變紅底白字，並且一直留著，讓玩家知道錯在哪；遊戲結束，停留 1.5 秒才跳出結算。
   · 計時從第一次點擊開始（pointerdown 的事件時間），點到 36 停表。只有完整點完才算成績。
   · 成績＝完成時間（秒、小數點後 4 位 X.XXXX，越小越好）。計時中的數字是真實時間；
     完成的那一刻才用 Leaderboard.fake4() 產生最終成績（第 3、4 位不為 0，只產生一次，
     之後畫面、最佳紀錄用的是同一個數字）。
   ═══════════════════════════════════════════════════════════════════ */

/* （檔案結構說明見 js/reaction_sticks.js 開頭的「新手導讀」：參數 → 純函式 → mount → G.debug → register） */
(function () {
    'use strict';

    /* 遊戲代號，與檔名、選單 id 一致 */
    var ID = 'schulte';

    /* 世界排行榜的成績規格（欄位說明見 js/leaderboard.js 開頭）；資料庫 MF_games 裡 schulte 那一列要一致
       （node test/leaderboard/gen_games_sql.cjs 會從這裡產生 insert，test/reaction/t_leaderboard.js 會檢查兩邊是否一致）。 */
    var SCORE = { better: 'min', decimals: 4, format: '{v} 秒', label: '時間', min: 3, max: 600 };
    /* UI.h：建立 HTML 元素的小工具 */
    var h = UI.h;
    /* Reaction.kit：共用工具箱 */
    var kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    /* SIDE × SIDE 的方陣；改成 5 就是 5×5＝25 格 */
    var SIDE = 6;                 /* 方陣邊長（6×6＝36 格） */
    var OK_FLASH_MS = 600;        /* 點對後數字變綠多久 */
    var FAIL_STAY_MS = 1500;      /* 點錯後畫面停留多久才跳結算 */
    var DONE_STAY_MS = 700;       /* 全部點完後多久跳結算 */

    /* 最佳紀錄顯示文字：toFixed(4) 表示小數點後四位（X.XXXX 秒），v == null 是還沒有紀錄 */
    function fmtBest(v) { return v == null ? '' : '最佳 ' + v.toFixed(4) + ' 秒'; }

    /* ═══ 純函式（也給 Node 測試用）═══ */
    /* 1..N 洗牌，並確保不是剛好排好的 */
    /* 把 1..36 隨機排成一列，並確保不會剛好是 1,2,3,...（已排好）的順序 */
    function makeBoard(rand) {
        /* n 格子總數；base 是 1..n 的陣列 */
        var n = SIDE * SIDE, base = [];
        /* for 迴圈：i 從 1 數到 n，每次把 i 放進 base */
        for (var i = 1; i <= n; i++) base.push(i);
        var b;
        /* do { ... } while (條件)：先做一次，條件成立就重做；b.every(...) 檢查「是不是每個位置的數字都剛好等於位置+1」 */
        do { b = kit.shuffle(base, rand); } while (b.every(function (v, k) { return v === k + 1; }));
        return b;
    }
    /* 依完成秒數給評語 */
    function rating(sec) {
        if (sec <= 40) return '眼力超強！';
        if (sec <= 55) return '很快喔！';
        if (sec <= 75) return '不錯！';
        return '慢慢找也很棒！';
    }

    /* mount：遊戲進場點 */
    function mount(root, ctx) {
        /* 舊版的最佳紀錄只有 3 位小數（沒有偽造尾數），第一次進來換算一次：補成 4 位、第 3／4 位不為 0 */
        Reaction.migrateBest(ID, function (v) { return Leaderboard.fake4(v); });
        /* R 存目前這局的生命週期物件 */
        var R = null;

        /* round：開一局 */
        function round() {
            if (R) R.dispose();
            /* kit.round()：這局的計時器管家，重玩時 dispose 會把舊計時器全部清掉 */
            R = kit.round();
            var my = R;
            root.innerHTML = '';
            /* 替整個畫面加上黑底的 class（樣式在 css/reaction2.css 的 .sch-bg） */
            root.classList.add('sch-bg');
            /* 這一局結束（dispose）時，把黑底 class 拿掉，不影響下一款遊戲 */
            my.onDispose(function () { root.classList.remove('sch-bg'); });

            /* makeBoard()：本局的數字排列 */
            var board = makeBoard();
            /* next：下一個該點的數字；t0：第一次點擊的時間（null＝還沒開始）；state：play/fail/done；cells：每個數字對應的按鈕元素 */
            var next = 1, t0 = null, state = 'play', cells = [];
            /* 上方狀態列：左邊「下一個：N」，右邊計時 */
            var head = h('div', { 'class': 'sch-head' });
            var info = h('span', { 'class': 'sch-next' });
            var clock = h('span', { 'class': 'sch-clock', text: '0.0000 秒' });
            head.appendChild(info); head.appendChild(clock);
            /* 36 格的格子容器 */
            var grid = h('div', { 'class': 'sch-grid' });
            root.appendChild(head);
            root.appendChild(grid);
            /* ctx.setMeta：更新標題列右側的小字 */
            ctx.setMeta(fmtBest(Reaction.getBest(ID)));

            /* 更新「下一個：N」 */
            function paintHead() { info.textContent = '下一個：' + next; }
            paintHead();

            /* 替每個數字各建一顆按鈕，放進格子裡（順序就是洗牌後的排列） */
            board.forEach(function (n) {
                var el = h('button', { 'class': 'sch-cell', text: String(n) });
                /* pointerdown：手指一碰到就算點擊；kit.evT(e) 取事件發生的精確時間 */
                el.addEventListener('pointerdown', function (e) { e.preventDefault(); tap(n, el, kit.evT(e)); });
                grid.appendChild(el);
                /* cells[n] = el：用數字當索引，之後想找「第 n 號按鈕」就能直接取到 */
                cells[n] = el;
            });

            /* my.loop：每個畫面更新時呼叫，更新計時文字；回傳 false 會停止這個迴圈 */
            my.loop(function (now) {
                if (state !== 'play') return false;
                clock.textContent = (t0 == null ? 0 : (now - t0) / 1000).toFixed(4) + ' 秒';
            });

            /* tap：處理一次點擊（n＝點到的數字，el＝按鈕，t＝點擊時間） */
            function tap(n, el, t) {
                if (state !== 'play') return;
                /* 第一次點擊才開始計時（所以不是按下規則就開始算） */
                if (t0 == null) t0 = t;
                /* 點錯：停止遊戲、錯的格子變紅、等 FAIL_STAY_MS 後顯示結算 */
                if (n !== next) {
                    state = 'fail';
                    el.classList.add('sch-cell--bad');
                    Sfx.play('bad');
                    clock.textContent = ((t - t0) / 1000).toFixed(4) + ' 秒';
                    my.after(FAIL_STAY_MS, function () {
                        /* kit.result：顯示結算畫面 */
                        kit.result(root, {
                            num: '點錯了', label: '你點了 ' + n + '，下一個應該是 ' + next,
                            lines: ['已經正確點到 ' + (next - 1) + ' 個', '用了 ' + ((t - t0) / 1000).toFixed(4) + ' 秒'],
                            note: '全部點完才會記錄成績', sfx: 'fail', onAgain: round
                        });
                    });
                    return;
                }
                /* 點對：該格變綠（0.6 秒後變回白色，所以要靠記憶記得點過哪些） */
                el.classList.add('sch-cell--ok');
                my.after(OK_FLASH_MS, function () { el.classList.remove('sch-cell--ok'); });
                Sfx.play('ok');
                /* 全部點完（點到 36） */
                if (next >= SIDE * SIDE) {
                    state = 'done';
                    /* 完成秒數＝最後一次點擊時間 − 第一次點擊時間；換成「最終成績」（第 3、4 位不為 0）只做這一次，
                       停表的數字、最佳紀錄、結算畫面都用這同一個數字 */
                    var rawSec = (t - t0) / 1000;
                    var sec = Leaderboard.fake4(rawSec);
                    console.log('數字方陣：實際 ' + rawSec.toFixed(6) + ' 秒 → 成績 ' + sec.toFixed(4) + ' 秒');
                    clock.textContent = sec.toFixed(4) + ' 秒';
                    /* 存最佳紀錄：這個遊戲秒數「越小越好」，所以比較函式是 v < b */
                    var isNew = Reaction.setBest(ID, sec, function (v, b) { return v < b; });
                    ctx.setMeta(fmtBest(Reaction.getBest(ID)));
                    my.after(DONE_STAY_MS, function () {
                        kit.result(root, {
                            score: sec,        /* 世界排行榜成績（跟 setBest 存的同一個數字） */
                            num: sec.toFixed(4) + ' 秒', label: rating(sec),
                            lines: ['6×6 共 36 個數字全部點完'], isNew: isNew, sfx: sec <= 55 ? 'win' : 'neutral', onAgain: round
                        });
                    });
                    return;
                }
                /* 還沒點完：期待的數字 +1，更新文字 */
                next++;
                paintHead();
            }

            /* G.debug：測試用後門，讓自動測試可以假裝玩家依序點擊 */
            G.debug = {
                board: board,
                state: function () { return { next: next, state: state }; },
                /* 依序點對 count 個；wrong＝true 時最後故意點錯一格 */
                play: function (count, wrong) {
                    var tt = performance.now();
                    for (var i = 0; i < count && state === 'play'; i++) tap(next, cells[next], tt + i * 50);
                    if (wrong && state === 'play') { var bad = next === 36 ? 1 : next + 1; tap(bad, cells[bad], tt + count * 50); }
                    return state;
                }
            };
        }

        round();
    }

    /* 遊戲的身分證（id、name、規則、進場函式、給測試用的函式） */
    var G = {
        id: ID,
        name: '數字方陣',
        rule: '黑色方格裡有 1 到 36 的數字，請照順序從 1 一直點到 36，點完停表，越快越好！點對的數字會閃一下綠色；只要點錯一個，就會停在那裡讓你看看錯在哪。',
        mount: mount,
        /* 世界排行榜的成績規格 */
        score: SCORE,
        test: { makeBoard: makeBoard, rating: rating, SIDE: SIDE }
    };
    /* 登記到遊戲清單 */
    Reaction.register(G);
})();

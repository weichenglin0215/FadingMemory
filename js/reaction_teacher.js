/* ═══════════════════════════════════════════════════════════════════
   reaction_teacher.js — 秒反應・老師說
   畫面上的老師會下指令，例如「老師說 點左邊」。只有開頭有「老師說」的指令才要照做；
   沒說「老師說」的指令，什麼都不要點，等時間過去就算答對。後面還會出現「點相反的左邊」＝要點右邊。
   ───────────────────────────────────────────────────────────────────
   · 指令 ＝［老師說］＋ 點 ＋［相反的］＋ 方向（上、下、左、右）。
   · 有「老師說」的比例 P_SAY：第 1 → RAMP_N 題 70% → 50%（越後面越常是陷阱）；
     沒說的連續不超過 NO_SAY_RUN_MAX 個；前 2 題至少有 1 題有「老師說」；不會連續出現完全相同的指令。
   · 「相反」指令從第 OPPOSITE_FROM 題開始出現（機率 P_OPPOSITE），有沒有「老師說」都可能。
   · 每題限時 TIME_START → TIME_END 秒（第 1 → RAMP_N 題線性）。
       有「老師說」：限時內點對方向才過；點錯、沒點到 ＝ 失敗。
       沒有「老師說」：限時內不要點，時間到就過；點了 ＝ 失敗。
   · 成績＝連續答對題數（越大越好）。pointerdown 判定；計時以 performance.now 為準，並有 setTimeout 後備。
   ═══════════════════════════════════════════════════════════════════ */

/* （檔案結構說明見 js/reaction_sticks.js 開頭的「新手導讀」） */
(function () {
    'use strict';

    var ID = 'teacher';

    /* 世界排行榜的成績規格（欄位說明見 js/leaderboard.js 開頭）；資料庫 MF_games 裡 teacher 那一列要一致
       （node test/leaderboard/gen_games_sql.cjs 會從這裡產生 insert，test/reaction/t_leaderboard.js 會檢查兩邊是否一致）。 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 題', label: '連對題數', min: 1, max: 1000 };
    var h = UI.h;
    var kit = Reaction.kit;

    /* 設定集中在這一區 */
    /* ═══ 可以自己調的參數 ═══ */
    /* 難度隨題號線性變化到第 RAMP_N 題 */
    var RAMP_N = 30;
    /* 「老師說」出現的機率：70% → 50%（越後面越常是陷阱） */
    var P_SAY_START = 0.7, P_SAY_END = 0.5;
    var TIME_START = 2.5, TIME_END = 0.9;           /* 每題限時（秒）*/
    /* 第 15 題起才出現「相反」指令，出現機率 35% */
    var OPPOSITE_FROM = 15, P_OPPOSITE = 0.35;
    /* 沒說「老師說」的題目最多連續幾題 */
    var NO_SAY_RUN_MAX = 3;
    var GAP_S = 0.3;                                /* 答完到下一題之間的空檔（空檔內的點擊不算）*/
    var FAIL_SHOW_MS = 2200;
    /* 四個方向，以及方向的中文名稱與相反方向對照表 */
    var DIRS = ['up', 'down', 'left', 'right'];
    var DIR_NAME = { up: '上面', down: '下面', left: '左邊', right: '右邊' };
    var OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };

    /* ═══ 純函式（也給 Node 測試用）═══ */
    /* 第 i 題有「老師說」的機率 */
    function pSay(i) { return kit.ramp(i, P_SAY_START, P_SAY_END, RAMP_N); }
    /* 第 i 題的限時 */
    function limitFor(i) { return kit.ramp(i, TIME_START, TIME_END, RAMP_N); }
    /* 兩個指令是否完全相同（!! 把 null 轉成 false） */
    function sameCmd(a, b) { return !!a && !!b && a.say === b.say && a.dir === b.dir && a.opposite === b.opposite; }
    /* 出第 i 題：先決定有沒有「老師說」、是不是「相反」、哪個方向；不能和上一題完全相同 */
    /* 第 i 題（從 1 算）的指令；history 是之前所有的指令 */
    function makeCommand(i, history, rand) {
        rand = rand || Math.random;
        var prev = history.length ? history[history.length - 1] : null, cmd = null;
        /* 最多試 60 次，直到產生符合規則的指令 */
        for (var tries = 0; tries < 60; tries++) {
            var say = rand() < pSay(i);
            /* 沒說的連續不超過上限；前 2 題至少有 1 題有說 */
            /* 算出目前連續幾題沒說「老師說」 */
            var run = 0; for (var k = history.length - 1; k >= 0 && !history[k].say; k--) run++;
            /* 連續太多沒說 → 這題強制有說 */
            if (!say && run >= NO_SAY_RUN_MAX) say = true;
            /* 前兩題至少有一題要有說，不然玩家會以為都不用動 */
            if (!say && i === 2 && history.length === 1 && !history[0].say) say = true;
            var opposite = i >= OPPOSITE_FROM && rand() < P_OPPOSITE;
            cmd = { say: say, opposite: opposite, dir: kit.pick(DIRS, rand) };
            if (!sameCmd(cmd, prev)) break;
        }
        cmd.text = textOf(cmd);
        return cmd;
    }
    /* 指令轉成顯示用文字：前綴（老師說）和動作（點左邊／點相反的左邊） */
    function textOf(cmd) { return { prefix: cmd.say ? '老師說' : '', action: '點' + (cmd.opposite ? '相反的' : '') + DIR_NAME[cmd.dir] }; }
    /* 正確反應是什麼：要點哪個方向；不用點是 null */
    /* 正確的反應：要點的方向；不用點則是 null */
    /* 有「老師說」才要點；「相反」的話要點反方向 */
    function expectedAction(cmd) { return cmd.say ? (cmd.opposite ? OPPOSITE[cmd.dir] : cmd.dir) : null; }
    /* 失敗時的說明文字 */
    function why(cmd, kind, got) {
        if (kind === 'nosay') return '這句沒有「老師說」，你不能動';
        if (kind === 'late') return '「老師說」的要照做，你來不及了';
        var exp = expectedAction(cmd);
        return cmd.opposite ? '老師說點相反的' + DIR_NAME[cmd.dir] + '，所以要點' + DIR_NAME[exp] : '老師說' + DIR_NAME[exp] + '，你點了' + DIR_NAME[got];
    }
    /* 依連對題數給評語 */
    function rating(n) {
        if (n >= 40) return '老師最得意的學生！';
        if (n >= 20) return '反應很靈光！';
        if (n >= 8) return '不錯喔！';
        return '再試一次，會更準！';
    }

    /* 老師嘴巴的三種形狀（SVG path 的 d 屬性）：平常、壞笑（沒說老師說時）、開心（答對） */
    /* 嘴巴的形狀：一般＝微笑；沒說「老師說」（tease）＝壞壞的歪嘴；答對（happy）＝大笑。
       用 path 的 d 屬性切換（不用 CSS 的 d: path()，Safari 不支援）*/
    var MOUTH = { normal: 'M36 72 Q50 82 64 72', tease: 'M34 74 Q50 86 66 70', happy: 'M32 70 Q50 92 68 70' };

    /* 畫老師的臉（SVG：頭、頭髮、眼鏡、眼睛、嘴巴） */
    function faceSvg() {
        var svg = kit.svg('svg', { 'class': 'te-face', viewBox: '0 0 100 100' });
        kit.svg('circle', { 'class': 'te-face__head', cx: 50, cy: 52, r: 40 }, svg);
        kit.svg('path', { 'class': 'te-face__hair', d: 'M12 46 Q14 14 50 12 Q86 14 88 46 Q70 28 50 30 Q30 28 12 46 Z' }, svg);
        kit.svg('circle', { 'class': 'te-face__glass', cx: 35, cy: 52, r: 11 }, svg);
        kit.svg('circle', { 'class': 'te-face__glass', cx: 65, cy: 52, r: 11 }, svg);
        kit.svg('line', { 'class': 'te-face__glass', x1: 46, y1: 52, x2: 54, y2: 52 }, svg);
        var eyes = kit.svg('g', { 'class': 'te-face__eyes' }, svg);
        kit.svg('circle', { cx: 35, cy: 52, r: 3.2 }, eyes);
        kit.svg('circle', { cx: 65, cy: 52, r: 3.2 }, eyes);
        /* 把嘴巴元素存在 svg._mouth，之後換表情時直接用 */
        svg._mouth = kit.svg('path', { 'class': 'te-face__mouth', d: MOUTH.normal }, svg);
        return svg;
    }

    /* mount：遊戲進場點 */
    function mount(root, ctx) {
        var R = null;

        /* startAt：從第幾關開始（失敗後可從前 5 關繼續）*/
        /* round：開一局 */
        function round(startAt) {
            if (R) R.dispose();
            R = kit.round();
            var my = R;
            root.innerHTML = '';

            /* i 目前第幾題；streak 連續答對數；history 已出過的指令；cmd 目前指令；state 目前階段；token 每題 +1，讓舊計時器知道自己過期；over 是否已失敗 */
            var i = (startAt || 1) - 1, streak = i, history = [], cmd = null, state = 'idle', token = 0, over = false, nowLimit = 1;
            var face = faceSvg();
            var pre = h('div', { 'class': 'te-bubble__pre', text: ' ' });
            var act = h('div', { 'class': 'te-bubble__act', text: ' ' });
            var bubble = h('div', { 'class': 'te-bubble' }, [pre, act]);
            var top = h('div', { 'class': 'te-top' }, [h('div', { 'class': 'te-teacher' }, [face]), bubble]);
            var sub = h('div', { 'class': 'te-sub', text: ' ' });
            var tb = kit.timebar();
            var pad = h('div', { 'class': 'te-pad' });
            var btns = {};
            /* 建立四個方向鍵（上下左右），用 css grid 排成十字形（樣式在 css/reaction2.css） */
            DIRS.forEach(function (d) {
                var b = h('button', { 'class': 'btn te-btn te-btn--' + d, text: DIR_NAME[d] });
                b.addEventListener('pointerdown', function (e) { e.preventDefault(); press(d); });
                btns[d] = b; pad.appendChild(b);
            });
            [top, sub, tb.el, pad].forEach(function (x) { root.appendChild(x); });
            ctx.setMeta(Reaction.getBest(ID) != null ? '最佳 ' + Reaction.getBest(ID) : '');

            /* 換老師的表情 */
            function setFace(mood) { face.setAttribute('class', 'te-face te-face--' + mood); face._mouth.setAttribute('d', MOUTH[mood]); }
            setFace('normal');

            /* 出下一題指令 */
            function nextCommand() {
                if (my.dead || over) return;
                i++;
                /* 產生指令並記到 history */
                cmd = makeCommand(i, history, null);
                history.push(cmd);
                var id = ++token, limit = limitFor(i), t0 = performance.now();
                nowLimit = limit;
                var tx = textOf(cmd);
                /* 顯示指令文字 */
                pre.textContent = tx.prefix || ' '; act.textContent = tx.action;
                bubble.className = 'te-bubble' + (cmd.say ? ' te-bubble--say' : '');
                sub.textContent = '連對 ' + streak + ' 題';
                setFace(cmd.say ? 'normal' : 'tease');
                state = 'live';
                tb.set(1);
                /* 主控台印出這題內容、正確答案與限時，方便驗證 */
                try { console.info('[老師說] 第 ' + i + ' 題：' + (tx.prefix ? tx.prefix + ' ' : '') + tx.action + '；答案＝' + (expectedAction(cmd) || '不要點') + '；限時 ' + limit.toFixed(3) + ' 秒；P(說)=' + pSay(i).toFixed(2)); } catch (e) { }
                /* my.loop：每個畫面更新一次，更新倒數時間條 */
                my.loop(function (now) {
                    if (id !== token || state !== 'live') return false;
                    tb.set(1 - (now - t0) / (limit * 1000));
                });
                /* 時間到 */
                my.after(limit * 1000, function () { if (id === token && state === 'live') timeout(); });
            }

            /* 答對一題：連對數 +1，稍後出下一題；silent 為 true 表示是「忍住不點」而過關 */
            function good(silent) {
                state = 'gap'; token++;
                streak = i;
                tb.set(0);
                setFace('happy');
                bubble.className = 'te-bubble te-bubble--ok';
                Sfx.play(silent ? 'pop' : 'click');
                var best = Reaction.getBest(ID);
                ctx.setMeta(kit.meta(['連對 ' + streak, best != null ? '最佳 ' + best : '']));
                my.after(GAP_S * 1000, nextCommand);
            }

            /* 失敗：顯示原因並結算 */
            function fail(kind, got) {
                if (over) return;
                over = true; state = 'over'; token++;
                tb.set(0);
                setFace('tease');
                bubble.className = 'te-bubble te-bubble--bad';
                var msg = why(cmd, kind, got);
                sub.textContent = msg;
                Sfx.play('bad');
                var isNew = Reaction.setBest(ID, streak, function (v, b) { return v > b; });
                my.after(FAIL_SHOW_MS, function () {
                    var back = kit.resumeFrom(i);
                        kit.result(root, {
                        score: streak,        /* 世界排行榜成績（跟 setBest 存的同一個數字） */
                        num: String(streak), label: rating(streak),
                        lines: [msg], isNew: isNew && streak > 0, sfx: streak >= 8 ? 'win' : 'fail', onAgain: function () { round(1); },
                            resume: { level: back, run: function () { round(back); } }
                    });
                });
            }

            /* 時間到的處理：有說「老師說」卻沒點＝失敗；沒說「老師說」而且沒點＝過關 */
            function timeout() {
                if (state !== 'live') return;
                if (cmd.say) fail('late'); else good(true);
            }

            /* 玩家按了方向 d */
            function press(d) {
                if (state !== 'live') return;
                /* 沒說「老師說」卻點了＝失敗 */
                if (!cmd.say) { fail('nosay', d); return; }
                /* 有說：點對方向過關，點錯失敗 */
                if (d === expectedAction(cmd)) good(false); else fail('wrong', d);
            }

            /* G.debug：測試用後門 */
            G.debug = {
                state: function () { return { i: i, streak: streak, state: state, over: over, cmd: cmd, expected: cmd ? expectedAction(cmd) : null, limit: nowLimit }; },
                press: press
            };
            /* 開場等 600 毫秒再出第一題 */
            my.after(600, nextCommand);
        }

        round(1);
    }

    /* 遊戲身分證 */
    var G = {
        id: ID,
        name: '老師說',
        rule: '老師會下指令。只有開頭有「老師說」的才要照做，例如「老師說 點左邊」就點左邊；沒說「老師說」就什麼都不要點。後面還會有「點相反的」，要點反方向。錯一次就結束！',
        mount: mount,
        /* 世界排行榜的成績規格 */
        score: SCORE,
        /* test 匯出純函式給 Node 自動測試 */
        test: { pSay: pSay, limitFor: limitFor, makeCommand: makeCommand, expectedAction: expectedAction, textOf: textOf, why: why, rating: rating, sameCmd: sameCmd, NO_SAY_RUN_MAX: NO_SAY_RUN_MAX, OPPOSITE_FROM: OPPOSITE_FROM, RAMP_N: RAMP_N, DIRS: DIRS, P_SAY_START: P_SAY_START, P_SAY_END: P_SAY_END, TIME_START: TIME_START, TIME_END: TIME_END }
    };
    /* 登記到遊戲清單 */
    Reaction.register(G);
})();

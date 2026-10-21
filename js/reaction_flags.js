/* ═══════════════════════════════════════════════════════════════════
   reaction_flags.js — 秒反應・舉旗子（企劃 358，依使用者的修改：左右半邊按住＝舉起）
   你兩手各拿一面旗子：**左手紅旗、右手白旗**。口令一句一句出現：「紅旗舉起來」「白旗不要放下」「紅旗不舉」……
   **畫面的左半邊用左手拇指按住＝舉紅旗、放開＝放下紅旗；右半邊用右手拇指按住＝舉白旗**（左右拇指可以一起用）。
   旗子的狀態要隨時跟口令一致；口令說「不要」就保持不動（這時動了就錯）。做錯就結束。成績＝答對幾句口令。
   ───────────────────────────────────────────────────────────────────
   · 要求的狀態（required）：兩面旗各自「該舉著（true）還是放下（false）」，一開始都放下。每句口令更新它：
       「X旗舉起來」→ X 該舉著；「X旗放下」→ X 該放下；「兩面旗一起舉起來／放下」→ 兩面都改；
       「X旗不要舉／不舉」→ X 保持現在的樣子（只在 X 現在是放下的時候才會出這句，所以意思就是「繼續放著」）；
       「X旗不要放下」→ X 保持現在的樣子（只在 X 現在是舉著的時候才出）。否定句是故意的混淆：看到「舉」字很容易手癢去舉。
   · 判定（每句口令出現之後有一小段寬限時間 grace 讓你反應）：
       ① 寬限時間內：一般口令隨便你動；「不要」類口令，被點名的那面旗子只要動了（跟口令出現時的狀態不同）就錯。
       ② 寬限時間結束的那一刻：兩面旗的實際狀態都要等於 required，不然錯；全對就加一分。
       ③ 寬限時間結束到下一句口令出現之前：任何一面旗子動到不等於 required 就馬上錯（「隨時一致」）。
   · 難度（隨已答對的句數 count 線性增加，到 RAMP_CMDS 句為止）：口令間隔 2200 → 950 毫秒（INTERVAL）、寬限時間是間隔的 62%（GRACE）、
     否定句的機率 12% → 40%（NEG_P）、「兩面旗一起」的機率從第 BOTH_FROM 句起 0 → 30%（BOTH_P）；同一面旗子連續出現的機率偏高（SAME_P）。
   · 結束時把那句口令和你的動作並排：左邊是「該有的旗子」、右邊是「你的旗子」，不一樣的標紅。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'flags';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 句', label: '答對幾句', min: 1, max: 300 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_CMDS = 40;                         /* 答對幾句之後難度到頂 */
    var INTERVAL = [2200, 950];                 /* 兩句口令之間的間隔（毫秒）：0 句 → 到頂 */
    var GRACE = 0.62;                           /* 寬限時間 ＝ 間隔 × 這個比例 */
    var NEG_P = [0.12, 0.4];                    /* 否定句（不要舉／不要放下）的機率：0 句 → 到頂 */
    var BOTH_FROM = 10, BOTH_P = [0, 0.3];      /* 第幾句起會出「兩面旗一起」、機率：第 BOTH_FROM 句 → 到頂 */
    var SAME_P = 0.45;                          /* 這句口令跟上一句是同一面旗子的機率 */
    var LEAD_MS = 1500;                         /* 開始後多久出第一句口令 */
    var SOLVE_CAP = 8;                          /* 驗證用：api.solve 最多幫你答對幾句（再多就故意不動，遊戲才會結束） */
    var MAX_LEVEL = 90;
    var NAMES = { L: '紅旗', R: '白旗' };

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function prog(n) { return Math.min(1, Math.max(0, n / RAMP_CMDS)); }
    function intervalFor(n) { return Math.round(INTERVAL[0] + (INTERVAL[1] - INTERVAL[0]) * prog(n)); }
    function graceFor(n) { return Math.round(intervalFor(n) * GRACE); }
    function negPFor(n) { return NEG_P[0] + (NEG_P[1] - NEG_P[0]) * prog(n); }
    function bothPFor(n) { return n < BOTH_FROM ? 0 : BOTH_P[0] + (BOTH_P[1] - BOTH_P[0]) * Math.min(1, (n - BOTH_FROM) / (RAMP_CMDS - BOTH_FROM)); }
    /* 一句口令：{ text, kind（'raise'｜'lower'｜'keep'）, flags（被點名的旗子 ['L']｜['R']｜['L','R']）, to（舉起來／放下之後的狀態 true｜false；keep 時為 null）}
       req 是目前「該有的狀態」{ L, R }；prev 是上一句口令（用來決定要不要連續同一面旗子）。 */
    function nextCommand(req, prev, count, rand) {
        rand = rand || Math.random;
        if (rand() < bothPFor(count)) { var up = rand() < 0.5; return { text: '兩面旗一起' + (up ? '舉起來' : '放下'), kind: up ? 'raise' : 'lower', flags: ['L', 'R'], to: up }; }
        var f = prev && prev.flags.length === 1 && rand() < SAME_P ? prev.flags[0] : kit.pick(['L', 'R'], rand), nm = NAMES[f];
        if (rand() < negPFor(count)) {
            /* 否定句：旗子現在放下 → 「不要舉」（繼續放著）；現在舉著 → 「不要放下」（繼續舉著） */
            return req[f] ? { text: nm + '不要放下', kind: 'keep', flags: [f], to: null } : { text: nm + (rand() < 0.5 ? '不要舉' : '不舉'), kind: 'keep', flags: [f], to: null };
        }
        var raise = rand() < 0.5;
        return { text: nm + (raise ? '舉起來' : '放下'), kind: raise ? 'raise' : 'lower', flags: [f], to: raise };
    }
    /* 套用口令：回傳新的「該有的狀態」 */
    function applyCommand(req, cmd) {
        var out = { L: req.L, R: req.R };
        if (cmd.kind !== 'keep') cmd.flags.forEach(function (f) { out[f] = cmd.to; });
        return out;
    }
    function consistent(actual, req) { return actual.L === req.L && actual.R === req.R; }
    /* 實際狀態跟「該有的」不一樣的旗子 */
    function wrongFlags(actual, req) { return ['L', 'R'].filter(function (f) { return actual[f] !== req[f]; }); }
    function describeState(s) { return '紅旗' + (s.L ? '舉著' : '放下') + '、白旗' + (s.R ? '舉著' : '放下'); }
    function rating(n) {
        if (n >= 50) return '運動會旗手！';
        if (n >= 30) return '反應和手指都靈活！';
        if (n >= 15) return '不錯喔！';
        if (n >= 6) return '再接再厲！';
        return '口令說「不要」就別動！';
    }

    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 12, stageClass: 'flg-stage', resume: false,
            head: function () { return '舉旗子'; },
            info: function (S) { return '答對 ' + S.score + ' 句'; },
            scoreOf: function (S) { return S.score; },
            numText: function (v) { return v + ' 句'; },
            rating: rating,
            lines: function (S) { return ['一共答對 ' + S.score + ' 句口令']; },
            setup: setup
        });
    }

    /* 小人與兩面旗子（SVG）：旗桿從手上伸出去，旗面跟著舉起／放下（用 CSS 的 transform 轉動旗桿） */
    function drawPerson(parent, W) {
        var svg = kit.svg('svg', { 'class': 'flg-svg', viewBox: '0 0 300 220', width: Math.min(W - 40, 360), height: Math.round(Math.min(W - 40, 360) * 220 / 300) }, parent);
        kit.svg('circle', { 'class': 'flg-head', cx: 150, cy: 52, r: 30 }, svg);
        kit.svg('path', { 'class': 'flg-body', d: 'M120 90 L180 90 L192 200 L108 200 Z' }, svg);
        var poles = {};
        ['L', 'R'].forEach(function (f) {
            var x = f === 'L' ? 112 : 188, g = kit.svg('g', { 'class': 'flg-pole flg-pole--' + f, transform: 'translate(' + x + ',110)' }, svg);
            var arm = kit.svg('g', { 'class': 'flg-arm' }, g);                       /* 以手為轉軸：放下時往下斜、舉起時往上斜 */
            kit.svg('line', { 'class': 'flg-stick', x1: 0, y1: 0, x2: 0, y2: -92 }, arm);
            kit.svg('path', { 'class': 'flg-cloth flg-cloth--' + f, d: f === 'L' ? 'M0,-92 L-62,-84 L-56,-66 L-62,-48 L0,-56 Z' : 'M0,-92 L62,-84 L56,-66 L62,-48 L0,-56 Z' }, arm);
            poles[f] = arm;
        });
        return { svg: svg, poles: poles };
    }

    function setup(api) {
        var stage = api.stage, S = api.S;
        var W = stage.clientWidth || 472, H = stage.clientHeight || 640;
        var actual = { L: false, R: false }, req = { L: false, R: false }, cmd = null, prev = null, count = 0, over = false, graceEnd = 0, startState = null, gen = 0, cmdNo = 0;
        api.info = { get count() { return count; }, get cmd() { return cmd; }, get req() { return req; }, get actual() { return actual; } };
        S.score = 0; api.setInfo('答對 0 句');
        console.log('[舉旗子] 開始：口令間隔 ' + intervalFor(0) + ' 毫秒');

        var field = h('div', { 'class': 'flg-field' });
        stage.appendChild(field);
        /* 左右半邊的按壓區（整個畫面分兩半）：左＝紅旗、右＝白旗 */
        var padL = h('div', { 'class': 'flg-pad flg-pad--L' }, [h('div', { 'class': 'flg-pad__t', text: '左手　紅旗' })]), padR = h('div', { 'class': 'flg-pad flg-pad--R' }, [h('div', { 'class': 'flg-pad__t', text: '右手　白旗' })]);
        field.appendChild(padL); field.appendChild(padR);
        var bubble = h('div', { 'class': 'flg-cmd', text: '準備…' }); field.appendChild(bubble);
        var person = drawPerson(field, W); person.svg.style.cssText = 'left:' + Math.round((W - person.svg.getAttribute('width')) / 2) + 'px;top:150px;';
        var info = h('div', { 'class': 'qz-note flg-info', text: '' }); field.appendChild(info);
        if (kit.once('flags.hint')) kit.hintOn(stage, null, { mode: 'hold', x: W * 0.25, y: H * 0.78, delay: 800, labelAbove: true, text: '按住＝舉旗，放開＝放下' });

        function paintFlags() {
            ['L', 'R'].forEach(function (f) { person.poles[f].style.transform = 'rotate(' + (actual[f] ? (f === 'L' ? -28 : 28) : (f === 'L' ? -150 : 150)) + 'deg)'; });
            padL.classList.toggle('flg-pad--down', actual.L); padR.classList.toggle('flg-pad--down', actual.R);
        }
        paintFlags();
        /* 按住／放開：記錄每個手指在哪半邊，這半邊還有手指按著就是舉著 */
        var ptrs = {}, held = { L: 0, R: 0 };
        function setActual(f, up) { if (actual[f] === up) return; actual[f] = up; paintFlags(); onChange(f); }
        field.addEventListener('pointerdown', function (e) {
            if (over || api.over) return;
            var p = kit.localPt(e, field), side = p.x < W / 2 ? 'L' : 'R';
            e.preventDefault(); try { field.setPointerCapture(e.pointerId); } catch (err) { }
            ptrs[e.pointerId] = side; held[side]++; setActual(side, true);
        });
        function release(e) { var side = ptrs[e.pointerId]; if (!side) return; delete ptrs[e.pointerId]; held[side] = Math.max(0, held[side] - 1); if (!held[side]) setActual(side, false); }
        field.addEventListener('pointerup', release); field.addEventListener('pointercancel', release);

        /* 判定：①寬限時間內只管「不要」類口令被點名的旗子有沒有動 ③寬限結束後任何旗子動到不等於 required 就錯 */
        function onChange(f) {
            if (over || !cmd) return;
            if (performance.now() < graceEnd) { if (cmd.kind === 'keep' && cmd.flags.indexOf(f) >= 0 && actual[f] !== startState[f]) finish('moved', f); }
            else if (actual[f] !== req[f]) finish('moved', f);
        }
        function issue() {
            if (over || api.over) return;
            var myGen = ++gen;
            cmd = nextCommand(req, prev, count, api.rand); prev = cmd; cmdNo++;
            startState = { L: actual.L, R: actual.R }; req = applyCommand(req, cmd);
            var iv = intervalFor(count), gr = graceFor(count);
            graceEnd = performance.now() + gr;
            bubble.textContent = cmd.text; bubble.classList.remove('flg-cmd--pop'); void bubble.offsetWidth; bubble.classList.add('flg-cmd--pop'); Sfx.play('click');
            api.after(gr, function () {                                                               /* ② 寬限結束：兩面旗都要符合 */
                if (over || myGen !== gen) return;
                if (!consistent(actual, req)) { finish('mismatch', wrongFlags(actual, req)[0]); return; }
                count++; S.score = count; api.setInfo('答對 ' + count + ' 句'); Sfx.play('ok');
            });
            api.after(iv, issue);
        }
        api.after(LEAD_MS, issue);
        function finish(kind, f) {
            if (over) return;
            over = true; gen++; bubble.classList.add('flg-cmd--bad');
            var want = describeState(req), mine = describeState(actual);
            var why = kind === 'moved' ? (cmd && cmd.kind === 'keep' && performance.now() < graceEnd ? '口令是「' + cmd.text + '」，卻動了' + NAMES[f] + '！' : NAMES[f] + '動了，跟口令不一致！') : '寬限時間到了，' + NAMES[f] + '的狀態不對！';
            info.textContent = why;
            showCompare(want, mine, f);
            kit.flash(stage, false, api.my);
            api.fail({ delay: 3600, lines: [why, '口令「' + (cmd ? cmd.text : '') + '」→ 該有：' + want, '你的旗子：' + mine] });
        }
        function showCompare(want, mine, badFlag) {
            var box = h('div', { 'class': 'flg-cmp' });
            [['該有的', req, false], ['你的', actual, true]].forEach(function (row) {
                var col = h('div', { 'class': 'flg-cmp__col' }, [h('div', { 'class': 'flg-cmp__t', text: row[0] })]);
                ['L', 'R'].forEach(function (f) { var up = row[1][f], bad = row[2] && actual[f] !== req[f]; col.appendChild(h('div', { 'class': 'flg-cmp__flag flg-cmp__flag--' + f + (bad ? ' flg-cmp__flag--bad' : ''), text: NAMES[f] + (up ? '舉著' : '放下') })); });
                box.appendChild(col);
            });
            field.appendChild(box);
        }
        /* 驗證用（會被重複呼叫，要冪等）：solve＝把旗子調成「該有的狀態」（最多答對 SOLVE_CAP 句，之後不再動，遊戲才會結束）、wrong＝把旗子調成跟該有的相反 */
        api.solve = function () {
            if (over || !cmd || count >= SOLVE_CAP) return;
            ['L', 'R'].forEach(function (f) { setActual(f, req[f]); });
        };
        api.wrong = function () { if (over || !cmd) return; ['L', 'R'].forEach(function (f) { setActual(f, !req[f]); }); };
    }

    var G = {
        id: ID,
        name: '舉旗子',
        rule: '你兩手各拿一面旗子：**左手紅旗、右手白旗**。口令一句一句出現：「紅旗舉起來」「白旗不要放下」。畫面左半邊（左手拇指）管紅旗、右半邊（右手拇指）管白旗，**按住＝舉起來，放開＝放下**，左右可以同時用。**旗子的狀態要隨時跟口令一致**；口令說「不要」就保持不動（動了就錯）。小心：同一面旗子會連續出現，後面口令越來越快，還會出現「兩面旗一起」。做錯就結束，看你能答對幾句。',
        mount: mount,
        score: SCORE,
        test: {
            intervalFor: intervalFor, graceFor: graceFor, negPFor: negPFor, bothPFor: bothPFor, nextCommand: nextCommand, applyCommand: applyCommand, consistent: consistent, wrongFlags: wrongFlags, describeState: describeState, rating: rating,
            RAMP_CMDS: RAMP_CMDS, INTERVAL: INTERVAL, GRACE: GRACE, NEG_P: NEG_P, BOTH_FROM: BOTH_FROM, BOTH_P: BOTH_P, SAME_P: SAME_P, LEAD_MS: LEAD_MS, SOLVE_CAP: SOLVE_CAP, NAMES: NAMES, MAX_LEVEL: MAX_LEVEL
        }
    };
    Reaction.register(G);
})();

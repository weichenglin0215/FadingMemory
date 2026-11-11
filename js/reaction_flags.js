/* ═══════════════════════════════════════════════════════════════════
   reaction_flags.js — 秒反應・舉旗子（企劃 358，依使用者的修改：左右半邊按住＝舉起）
   樣式：css/games/reaction_flags.css（這款專屬的 class 一律以「flags-」開頭；共用元件在 css/reaction_common.css）
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
   · V1.38.0（玩家意見）：
       ① 寬限時間看得見：口令框的下緣有一條藍色橫條，口令一出現就從滿慢慢縮到空（長度＝這句的寬限時間 graceFor），縮完就是寬限結束、旗子要對了；
       ② 換新口令有明顯的表演：口令框從左右兩邊交替快速滑進來（0.26 秒）＋ 閃一下黃色底 ＋ 「啵」一聲（連續兩句一模一樣的口令也看得出來是新的）；
       ③ 口令要常常讓手指動：一般口令有 CHANGE_P（90%）會讓旗子換狀態（現在放下就叫你舉、現在舉著就叫你放）；「兩面一起」也一定往會動的方向；
          「不要」類（不用動的）機率降低（12%→40% 改成 8%→28%）。所以大多數口令都要按住或放開，不會一直發呆。
   · V1.54.0（玩家意見：難度太低）：
       ① 時間更短：口令間隔 2200 → 950 改成 1700 → 750 毫秒（INTERVAL）、寬限時間比例 62% → 60%（GRACE），30 句就到頂（RAMP_CMDS，原本 40）；
       ② 雙手一起動、分別動：「兩面旗一起」更早（第 5 句起）、機率更高（0 → 40%）；新增「對調」口令——一手放下、另一手同時舉起（例如「紅旗放下、白旗舉起來」），
          只在兩面旗一高一低的時候出（SWAP_FROM 第 4 句起、機率 0 → 40%，SWAP_P），兩隻手指要同時往相反方向動。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    /* 新手導讀：整個檔案包在 (function () { ... })(); 裡（叫「立即執行函式」），裡面的變數都是這個檔案私有的，不會跟別的遊戲檔案的同名變數打架。
       檔案由上往下大致分成：① 參數區（標題寫著可以自己調整的參數：難度、秒數、文字大多在這）；② 純函式（只做計算、不碰畫面：出題、判斷對錯，單元測試直接測它們）；③ 畫面（mount 是進場、setup 是每一關開始時呼叫，負責把畫面建出來並處理點擊）。
       最後的 Reaction.register(G) 把這款遊戲「登記」給選單（沒有這行，選單就看不到它）。'use strict' 是嚴格模式：打錯變數名稱會直接報錯，而不是默默建立新變數。
       這款遊戲的代號是 'flags'：選單、成績、存檔都靠它；樣式在 css/games/reaction_flags.css，裡面的 class 名稱一律以 flags- 開頭。 */
    'use strict';

    var ID = 'flags';                                   /* 這款遊戲的代號：選單、成績、存檔、CSS class 前綴都用它 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 句', label: '答對幾句', min: 1, max: 300 };  /* 成績規格：better（max＝越大越好、min＝越小越好）、decimals 小數位數、format 顯示格式、label 名稱、min／max 合理範圍（超出範圍的成績不會送排行榜） */
    var h = UI.h, kit = Reaction.kit;                   /* h：建立網頁元素的小工具；kit：闖關遊戲共用的工具箱 */

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_CMDS = 30;                         /* 答對幾句之後難度到頂（V1.54.0：原本 40，玩家說太簡單） */
    var INTERVAL = [1700, 750];                 /* 兩句口令之間的間隔（毫秒）：0 句 → 到頂（V1.54.0：原本 2200 → 950） */
    var GRACE = 0.66;                            /* 寬限時間 ＝ 間隔 × 這個比例（原本 0.62） */
    var NEG_P = [0.08, 0.28];                   /* 否定句（不要舉／不要放下，旗子不用動）的機率：0 句 → 到頂（原本 12% → 40%，V1.38.0 降低：玩家說大部分口令不用動手指） */
    var CHANGE_P = 0.9;                         /* 一般口令（舉起來／放下）讓旗子換狀態（要按住或放開）的機率；其餘是「已經是那樣了」的重複口令（V1.38.0） */
    var BOTH_FROM = 5, BOTH_P = [0, 0.4];       /* 第幾句起會出「兩面旗一起」、機率：第 BOTH_FROM 句 → 到頂（V1.54.0：原本第 10 句起、到頂 30%） */
    var SWAP_FROM = 4, SWAP_P = [0, 0.4];       /* 第幾句起會出「對調」口令（一手放下、另一手同時舉起；只在兩面旗一高一低時出）、機率：第 SWAP_FROM 句 → 到頂（V1.54.0 新增） */
    var SAME_P = 0.45;                          /* 這句口令跟上一句是同一面旗子的機率 */
    var LEAD_MS = 1500;                         /* 開始後多久出第一句口令 */
    var SOLVE_CAP = 8;                          /* 驗證用：api.solve 最多幫你答對幾句（再多就故意不動，遊戲才會結束） */
    var MAX_LEVEL = 90;                             /* 最後一關：過了第 90 關就算全破（也是成績的上限） */
    var NAMES = { L: '紅旗', R: '白旗' };               /* 旗子的名稱：L＝左邊的紅旗、R＝右邊的白旗 */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function prog(n) { return Math.min(1, Math.max(0, n / RAMP_CMDS)); }
    function intervalFor(n) { return Math.round(INTERVAL[0] + (INTERVAL[1] - INTERVAL[0]) * prog(n)); }  /* Math.round：四捨五入成整數 */
    function graceFor(n) { return Math.round(intervalFor(n) * GRACE); }
    function negPFor(n) { return NEG_P[0] + (NEG_P[1] - NEG_P[0]) * prog(n); }
    function bothPFor(n) { return n < BOTH_FROM ? 0 : BOTH_P[0] + (BOTH_P[1] - BOTH_P[0]) * Math.min(1, (n - BOTH_FROM) / (RAMP_CMDS - BOTH_FROM)); }
    function swapPFor(n) { return n < SWAP_FROM ? 0 : SWAP_P[0] + (SWAP_P[1] - SWAP_P[0]) * Math.min(1, (n - SWAP_FROM) / (RAMP_CMDS - SWAP_FROM)); }
    /* 一句口令：{ text, kind（'raise'｜'lower'｜'keep'｜'swap'）, flags（被點名的旗子 ['L']｜['R']｜['L','R']）, to（舉起來／放下之後的狀態 true｜false；keep 與 swap 時為 null）,
       set（只有 swap 有：{ L: 要的狀態, R: 要的狀態 }，兩面旗各自往相反方向動）}
       req 是目前「該有的狀態」{ L, R }；prev 是上一句口令（用來決定要不要連續同一面旗子）。 */
    function nextCommand(req, prev, count, rand) {
        rand = rand || Math.random;                     /* 沒有傳亂數函式就用 Math.random（測試時可以傳固定的亂數，結果才能重現） */
        if (req.L !== req.R && rand() < swapPFor(count)) {
            /* 對調：一高一低的兩面旗，現在舉著的放下、放下的舉起來——兩隻手指同時往相反方向動；先講哪一面隨機 */
            var seq = rand() < 0.5 ? ['L', 'R'] : ['R', 'L'], set = { L: !req.L, R: !req.R };
            return { text: seq.map(function (f) { return NAMES[f] + (set[f] ? '舉起來' : '放下'); }).join('、'), kind: 'swap', flags: ['L', 'R'], to: null, set: set };
        }
        if (rand() < bothPFor(count)) {
            /* 兩面旗一起：往「至少一面會動」的方向（兩面都舉著就放下、都放下就舉起來；一高一低隨機） */
            var up = req.L === req.R ? !req.L : rand() < 0.5;
            return { text: '兩面旗一起' + (up ? '舉起來' : '放下'), kind: up ? 'raise' : 'lower', flags: ['L', 'R'], to: up };
        }
        var f = prev && prev.flags.length === 1 && rand() < SAME_P ? prev.flags[0] : kit.pick(['L', 'R'], rand), nm = NAMES[f];  /* kit.pick(陣列, rand)：從陣列隨機挑一個元素 */
        if (rand() < negPFor(count)) {
            /* 否定句：旗子現在放下 → 「不要舉」（繼續放著）；現在舉著 → 「不要放下」（繼續舉著） */
            return req[f] ? { text: nm + '不要放下', kind: 'keep', flags: [f], to: null } : { text: nm + (rand() < 0.5 ? '不要舉' : '不舉'), kind: 'keep', flags: [f], to: null };
        }
        /* 一般口令：大多數（CHANGE_P）會讓這面旗子換狀態，手指要按住或放開；少數是「已經是那樣了」的重複口令 */
        var raise = rand() < CHANGE_P ? !req[f] : req[f];
        return { text: nm + (raise ? '舉起來' : '放下'), kind: raise ? 'raise' : 'lower', flags: [f], to: raise };
    }
    /* 套用口令：回傳新的「該有的狀態」 */
    function applyCommand(req, cmd) {
        var out = { L: req.L, R: req.R };
        if (cmd.kind === 'swap') { out.L = cmd.set.L; out.R = cmd.set.R; }
        else if (cmd.kind !== 'keep') cmd.flags.forEach(function (f) { out[f] = cmd.to; });  /* forEach：對陣列的每個元素各做一次 */
        return out;
    }
    function consistent(actual, req) { return actual.L === req.L && actual.R === req.R; }
    /* 實際狀態跟「該有的」不一樣的旗子 */
    function wrongFlags(actual, req) { return ['L', 'R'].filter(function (f) { return actual[f] !== req[f]; }); }  /* filter：留下符合條件的元素，回傳新陣列 */
    function describeState(s) { return '紅旗' + (s.L ? '舉著' : '放下') + '、白旗' + (s.R ? '舉著' : '放下'); }
    /* 結算畫面的評語：依成績回傳一句話 */
    function rating(n) {
        if (n >= 50) return '運動會旗手！';
        if (n >= 30) return '反應和手指都靈活！';
        if (n >= 15) return '不錯喔！';
        if (n >= 6) return '再接再厲！';
        return '口令說「不要」就別動！';
    }

    /* mount：選單按下這款遊戲時會呼叫它。把「闖關」的流程（第幾關、過關、失敗、結算、最佳紀錄）交給共用骨架 kit.run，我們只提供 setup（每一關怎麼畫）、rating（評語）等小零件。 */
    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 12, stageClass: 'flags-stage', resume: false,
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
        var svg = kit.svg('svg', { 'class': 'flags-svg', viewBox: '0 0 300 220', width: Math.min(W - 40, 360), height: Math.round(Math.min(W - 40, 360) * 220 / 300) }, parent);  /* kit.svg(標籤, 屬性, 父元素)：建立 SVG 向量圖形元素（形狀、線條…），畫圖用，放大縮小不會糊 */
        kit.svg('circle', { 'class': 'flags-head', cx: 150, cy: 52, r: 30 }, svg);
        kit.svg('path', { 'class': 'flags-body', d: 'M120 90 L180 90 L192 200 L108 200 Z' }, svg);
        var poles = {};
        ['L', 'R'].forEach(function (f) {
            var x = f === 'L' ? 112 : 188, g = kit.svg('g', { 'class': 'flags-pole flags-pole--' + f, transform: 'translate(' + x + ',110)' }, svg);
            var arm = kit.svg('g', { 'class': 'flags-arm' }, g);                       /* 以手為轉軸：放下時往下斜、舉起時往上斜 */
            kit.svg('line', { 'class': 'flags-stick', x1: 0, y1: 0, x2: 0, y2: -92 }, arm);
            kit.svg('path', { 'class': 'flags-cloth flags-cloth--' + f, d: f === 'L' ? 'M0,-92 L-62,-84 L-56,-66 L-62,-48 L0,-56 Z' : 'M0,-92 L62,-84 L56,-66 L62,-48 L0,-56 Z' }, arm);
            poles[f] = arm;
        });
        return { svg: svg, poles: poles };
    }

    /* setup(api)：每一關開始時呼叫一次，負責出題並把這一關的畫面建出來。api 是共用骨架給的工具：api.stage（這一關的畫面容器）、api.level（第幾關）、
       api.after（延遲執行，換關後自動作廢）、api.timer（倒數計時）、api.pass／api.fail（過關／失敗）。 */
    function setup(api) {
        var stage = api.stage, S = api.S;
        var W = stage.clientWidth || 472, H = stage.clientHeight || 640;
        var actual = { L: false, R: false }, req = { L: false, R: false }, cmd = null, prev = null, count = 0, over = false, graceEnd = 0, startState = null, gen = 0, cmdNo = 0;
        api.info = { get count() { return count; }, get cmd() { return cmd; }, get req() { return req; }, get actual() { return actual; } };
        S.score = 0; api.setInfo('答對 0 句');
        console.log('[舉旗子] 開始：口令間隔 ' + intervalFor(0) + ' 毫秒');  /* 在瀏覽器主控台（按 F12）印出這一關的出題內容，方便除錯與驗證 */

        var field = h('div', { 'class': 'flags-field' });
        stage.appendChild(field);                       /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
        /* 左右半邊的按壓區（整個畫面分兩半）：左＝紅旗、右＝白旗 */
        var padL = h('div', { 'class': 'flags-pad flags-pad--L' }, [h('div', { 'class': 'flags-pad__t', text: '左手　紅旗' })]), padR = h('div', { 'class': 'flags-pad flags-pad--R' }, [h('div', { 'class': 'flags-pad__t', text: '右手　白旗' })]);
        field.appendChild(padL); field.appendChild(padR);
        /* 口令框：上面是口令文字，下緣是藍色的寬限時間橫條（V1.38.0）：口令一出現就從滿縮到空，縮完＝寬限結束 */
        var bubbleText = h('span', { 'class': 'flags-cmd__t', text: '準備…' });
        var graceFill = h('div', { 'class': 'flags-grace__fill' });
        var bubble = h('div', { 'class': 'flags-cmd' }, [bubbleText, h('div', { 'class': 'flags-grace' }, [graceFill])]); field.appendChild(bubble);
        var person = drawPerson(field, W); person.svg.style.cssText = 'left:' + Math.round((W - person.svg.getAttribute('width')) / 2) + 'px;top:150px;';
        var info = h('div', { 'class': 'qz-note flags-info', text: '' }); field.appendChild(info);
        if (kit.once('flags.hint')) kit.hintOn(stage, null, { mode: 'hold', x: W * 0.25, y: H * 0.78, delay: 800, labelAbove: true, text: '按住＝舉旗，放開＝放下' });  /* 操作提示（手指圖示指出該點哪裡）：玩家第一次按下就消失 */

        function paintFlags() {
            ['L', 'R'].forEach(function (f) { person.poles[f].style.transform = 'rotate(' + (actual[f] ? (f === 'L' ? -28 : 28) : (f === 'L' ? -150 : 150)) + 'deg)'; });
            padL.classList.toggle('flags-pad--down', actual.L); padR.classList.toggle('flags-pad--down', actual.R);  /* classList.add／remove／toggle：加上／拿掉 CSS class，元素的外觀就跟著變（class 的樣式寫在 css 檔裡） */
        }
        paintFlags();
        /* 按住／放開：記錄每個手指在哪半邊，這半邊還有手指按著就是舉著 */
        var ptrs = {}, held = { L: 0, R: 0 };
        function setActual(f, up) { if (actual[f] === up) return; actual[f] = up; paintFlags(); onChange(f); }
        field.addEventListener('pointerdown', function (e) {  /* 指標事件（pointer）：手指與滑鼠通用，分成按下、移動、放開三種 */
            if (over || api.over) return;
            var p = kit.localPt(e, field), side = p.x < W / 2 ? 'L' : 'R';
            e.preventDefault(); try { field.setPointerCapture(e.pointerId); } catch (err) { }  /* preventDefault：取消瀏覽器的預設動作（例如拖曳時的捲動、文字選取） */
            ptrs[e.pointerId] = side; held[side]++; setActual(side, true);
        });
        function release(e) { var side = ptrs[e.pointerId]; if (!side) return; delete ptrs[e.pointerId]; held[side] = Math.max(0, held[side] - 1); if (!held[side]) setActual(side, false); }
        field.addEventListener('pointerup', release); field.addEventListener('pointercancel', release);

        /* 判定：①寬限時間內只管「不要」類口令被點名的旗子有沒有動 ③寬限結束後任何旗子動到不等於 required 就錯 */
        function onChange(f) {
            if (over || !cmd) return;
            if (performance.now() < graceEnd) { if (cmd.kind === 'keep' && cmd.flags.indexOf(f) >= 0 && actual[f] !== startState[f]) finish('moved', f); }  /* indexOf：找元素在陣列（或字串）裡的位置，找不到回傳 −1（所以 < 0 代表「不在裡面」） */
            else if (actual[f] !== req[f]) finish('moved', f);
        }
        function issue() {
            if (over || api.over) return;
            var myGen = ++gen;
            cmd = nextCommand(req, prev, count, api.rand); prev = cmd; cmdNo++;
            startState = { L: actual.L, R: actual.R }; req = applyCommand(req, cmd);
            var iv = intervalFor(count), gr = graceFor(count);
            graceEnd = performance.now() + gr;          /* performance.now()：高精度的時間（毫秒），計時用 */
            /* 換新口令的表演（要快）：口令框從左右兩邊交替滑進來＋閃一下黃色底＋「啵」一聲；寬限條重新從滿開始縮 */
            bubbleText.textContent = cmd.text;          /* textContent：設定元素裡的文字（安全，不會被當成 HTML 解析） */
            bubble.classList.remove('flags-cmd--inL', 'flags-cmd--inR'); void bubble.offsetWidth; bubble.classList.add(cmdNo % 2 ? 'flags-cmd--inL' : 'flags-cmd--inR');
            graceFill.classList.remove('flags-grace__fill--run'); void graceFill.offsetWidth; graceFill.style.animationDuration = gr + 'ms'; graceFill.style.animationPlayState = 'running'; graceFill.classList.add('flags-grace__fill--run');
            Sfx.play('pop');                            /* Sfx.play(名稱)：播放音效（ok 答對、bad 答錯、click 點擊…；音效是程式即時合成的） */
            api.after(gr, function () {                                                               /* ② 寬限結束：兩面旗都要符合 */
                if (over || myGen !== gen) return;
                if (!consistent(actual, req)) { finish('mismatch', wrongFlags(actual, req)[0]); return; }
                count++; S.score = count; api.setInfo('答對 ' + count + ' 句'); Sfx.play('ok');
            });
            api.after(iv, issue);                       /* api.after(毫秒, 函式)：過幾毫秒再執行；這一關結束後會自動作廢（不會跑到下一關去） */
        }
        api.after(LEAD_MS, issue);
        /* 這一局結束：算出成績並進入結算畫面 */
        function finish(kind, f) {
            if (over) return;
            over = true; gen++; bubble.classList.add('flags-cmd--bad'); graceFill.style.animationPlayState = 'paused';
            var want = describeState(req), mine = describeState(actual);
            var why = kind === 'moved' ? (cmd && cmd.kind === 'keep' && performance.now() < graceEnd ? '口令是「' + cmd.text + '」，卻動了' + NAMES[f] + '！' : NAMES[f] + '動了，跟口令不一致！') : '寬限時間到了，' + NAMES[f] + '的狀態不對！';
            info.textContent = why;
            showCompare(want, mine, f);
            kit.flash(stage, false, api.my);            /* kit.flash(舞台, 對或錯, 計時器)：畫面閃一下綠光（答對）或紅光（答錯） */
            api.fail({ delay: 3600, lines: [why, '口令「' + (cmd ? cmd.text : '') + '」→ 該有：' + want, '你的旗子：' + mine] });  /* api.fail({ delay, lines })：宣告「失敗」，delay 毫秒後進結算畫面，lines 是結算要多寫的說明行 */
        }
        function showCompare(want, mine, badFlag) {
            var box = h('div', { 'class': 'flags-cmp' });
            [['該有的', req, false], ['你的', actual, true]].forEach(function (row) {
                var col = h('div', { 'class': 'flags-cmp__col' }, [h('div', { 'class': 'flags-cmp__t', text: row[0] })]);
                ['L', 'R'].forEach(function (f) { var up = row[1][f], bad = row[2] && actual[f] !== req[f]; col.appendChild(h('div', { 'class': 'flags-cmp__flag flags-cmp__flag--' + f + (bad ? ' flags-cmp__flag--bad' : ''), text: NAMES[f] + (up ? '舉著' : '放下') })); });
                box.appendChild(col);
            });
            field.appendChild(box);
        }
        /* 驗證用（會被重複呼叫，要冪等）：solve＝把旗子調成「該有的狀態」（最多答對 SOLVE_CAP 句，之後不再動，遊戲才會結束）、wrong＝把旗子調成跟該有的相反 */
        api.solve = function () {
            if (over || !cmd || count >= SOLVE_CAP) return;
            ['L', 'R'].forEach(function (f) { setActual(f, req[f]); });
        };
        api.wrong = function () { if (over || !cmd) return;['L', 'R'].forEach(function (f) { setActual(f, !req[f]); }); };
    }

    /* 遊戲登記資料：id 代號、name 選單上的名稱、rule 玩法說明（**包起來的是粗體重點）、mount 進場函式、score 成績規格、test 給單元測試用的內部函式。 */
    var G = {
        id: ID,
        name: '舉旗子',
        rule: '你兩手各拿一面旗子：**左手紅旗、右手白旗**。口令一句一句出現：「紅旗舉起來」「白旗不要放下」。畫面左半邊（左手拇指）管紅旗、右半邊（右手拇指）管白旗，**按住＝舉起來，放開＝放下**，左右可以同時用。口令下面的**藍色橫條是反應時間**，縮完旗子就要對了；旗子的狀態要隨時跟口令一致；口令說「不要」就保持不動（動了就錯）。小心：同一面旗子會連續出現，後面口令越來越快，還會出現**雙手一起動**的口令：「兩面旗一起舉起來」，或是一手放下、另一手同時舉起（「紅旗放下、白旗舉起來」）。做錯就結束，看你能答對幾句。',
        mount: mount,
        score: SCORE,
        /* test：把內部函式與參數交給單元測試（test/reaction/ 底下的 t_*.js）使用，遊戲本身不會用到。 */
        test: {
            intervalFor: intervalFor, graceFor: graceFor, negPFor: negPFor, bothPFor: bothPFor, swapPFor: swapPFor, nextCommand: nextCommand, applyCommand: applyCommand, consistent: consistent, wrongFlags: wrongFlags, describeState: describeState, rating: rating,
            RAMP_CMDS: RAMP_CMDS, INTERVAL: INTERVAL, GRACE: GRACE, NEG_P: NEG_P, CHANGE_P: CHANGE_P, BOTH_FROM: BOTH_FROM, BOTH_P: BOTH_P, SWAP_FROM: SWAP_FROM, SWAP_P: SWAP_P, SAME_P: SAME_P, LEAD_MS: LEAD_MS, SOLVE_CAP: SOLVE_CAP, NAMES: NAMES, MAX_LEVEL: MAX_LEVEL
        }
    };
    /* 把這款遊戲登記給選單（沒有這行，選單就看不到它） */
    Reaction.register(G);
})();

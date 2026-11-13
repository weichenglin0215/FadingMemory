/* ═══════════════════════════════════════════════════════════════════
   reaction_blinkchar.js — 秒反應・瞬間識字（V1.57.0 新增）
   樣式：css/games/reaction_blinkchar.css（這款專屬的 class 一律以「blinkchar-」開頭；共用元件在 css/reaction_common.css）
   畫面上方是一塊白底。開局之後，在 WAIT_S（3 秒）之內的某個**不定的時刻**，白底上的**隨機位置**會閃出一個黑色的中文字，
   只亮一下就消失（一開始 0.2 秒，最後縮到 1 個畫面更新＝1 幀）；字消失之後，畫面下方才跳出答案按鈕（一開始 4 格，最後 16 格），點出剛剛閃過的是哪個字。
   ───────────────────────────────────────────────────────────────────
   · 難度（線性，RAMP_LEVELS 關走到頂；全部可以自己調，格式都是 [第 1 關, 到頂]）：
       ① 字亮多久 FLASH_MS：200 → 16.7 毫秒（到頂＝1 幀；亮 ≤ ONE_FRAME_MS 毫秒的一律只亮「一個畫面更新」，不管螢幕是 60 還是 120 Hz）；
       ② 字的濃淡 OPACITY：1（全黑）→ 0.1（淡淡的 10%）；
       ③ 字多大 SIZE：畫面寬度的 90% → 10%（字太大放不下白底時縮到放得下為止）；
       ④ 答案按鈕數 OPTIONS：4 → 16；選項優先挑「長得像」的字（共用字庫 SimilarChars），不夠再補別的字；
       ⑤ 字的筆劃 STROKES_MAX：第 1 關只考 ≤ 8 劃的字，後面越來越複雜；
       ⑥ 閃過之後的作答限時 ANSWER_S：6 → 3 秒（時間條）。
   · 題目框（V1.57.0 玩家意見）：固定是正方形，邊長＝畫面寬度（ZONE_RATIO 1）；字只會閃在框裡、框的下緣留一條（MSG_H）放說明文字。
   · 答案按鈕（V1.57.0 玩家意見）：寬度固定是畫面寬度的 1/OPT_COLS（1/6，一排 6 個）；按鈕多了就多排幾排，高度依排數調整（盡量維持正方形，放不下才縮矮）；
     按鈕上的字，字級是按鈕（寬、高較小的那一邊）的 OPT_FONT（80%）。
   · 作答之後（V1.57.0）：題目框裡的說明文字（「剛剛閃過的是…」）移到題目框的下緣，不會壓在揭曉的正確答案字上。
   · 選錯或來不及就失敗（把字再亮出來給你看清楚）；成績＝通過幾關。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    /* 新手導讀：整個檔案包在 (function () { ... })(); 裡（叫「立即執行函式」），裡面的變數都是這個檔案私有的，不會跟別的遊戲檔案的同名變數打架。
       檔案由上往下大致分成：① 參數區（標題寫著可以自己調整的參數：難度、秒數、文字大多在這）；② 純函式（只做計算、不碰畫面：出題、判斷對錯，單元測試直接測它們）；③ 畫面（mount 是進場，setup 是每一關開始時呼叫，負責把畫面建出來並處理點擊）。
       最後的 Reaction.register(G) 把這款遊戲「登記」給選單（沒有這行，選單就看不到它）。'use strict' 是嚴格模式：打錯變數名稱會直接報錯，而不是默默建立新變數。
       這款遊戲的代號是 'blinkchar'：選單、成績、存檔都靠它；樣式在 css/games/reaction_blinkchar.css，裡面的 class 名稱一律以 blinkchar- 開頭。 */
    'use strict';

    var ID = 'blinkchar';                               /* 這款遊戲的代號：選單、成績、存檔、CSS class 前綴都用它 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 90 };  /* 成績規格：better（max＝越大越好、min＝越小越好）、decimals 小數位數、format 顯示格式、label 名稱、min／max 合理範圍（超出範圍的成績不會送排行榜） */
    var h = UI.h, kit = Reaction.kit;                   /* h：建立網頁元素的小工具；kit：闖關遊戲共用的工具箱 */

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 30;                       /* 幾關之後難度到頂 */
    var FLASH_MS = [167, 16.7];                 /* 字亮多久（毫秒）：第 1 關 → 到頂（16.7＝60 Hz 螢幕的 1 幀） */
    var ONE_FRAME_MS = 17;                      /* 亮的時間 ≤ 這個毫秒數，就只亮「一個畫面更新」（1 幀） */
    var OPACITY = [0.5, 0.02];                     /* 黑色字的不透明度：第 1 關 → 到頂（1＝全黑、0.1＝只剩 10%） */
    var SIZE = [0.5, 0.033];                      /* 字的大小是畫面寬度的幾倍：第 1 關 → 到頂（字太大放不進白底時會縮到放得下） */
    var OPTIONS = [6, 18];                      /* 答案按鈕有幾格：第 1 關 → 到頂 */
    var STROKES_MAX = [8, 31];                  /* 只考筆劃不超過幾劃的字：第 1 關 → 到頂（31＝字庫裡最多筆劃的字，等於什麼字都會考） */
    var ANSWER_S = [5, 8];                      /* 字閃過之後，作答限時（秒）：第 1 關 → 到頂 */
    var WAIT_S = 3;                             /* 字會在開局後這麼多秒之內的某個不定時刻閃出來（秒） */
    var WAIT_MIN_S = 0.6;                       /* 最早也要等這麼久才閃（秒），讓玩家先看到白底 */
    var OPT_FONT = 0.8;                         /* 答案按鈕上的字寬，是按鈕（寬、高較小的那一邊）的幾分之幾：0.8＝4/5 */
    var OPT_COLS = 6;                           /* 答案按鈕的寬度是畫面寬度的 1/OPT_COLS（6＝1/6，一排放 6 個）；按鈕多了就多排幾排，高度依排數調整（盡量維持正方形） */
    var ZONE_RATIO = 1;                         /* 題目框（白底）的高度是畫面寬度的幾倍：1＝正方形（寬度維持畫面寬度） */
    var MSG_H = 44;                             /* 題目框下緣留給說明文字的高度（px；字級 26px 的一行約 31px 再加底邊 6px）：字只會閃在這一條以上的範圍，作答之後說明文字就放在這一條裡，才不會壓到正確答案的字 */
    var GAP = 8;                                /* 答案按鈕之間的空隙（px） */
    var FLASH_FONT = 0.92;                      /* 閃出來的字，字級是字框邊長的幾倍（字框＝字的大小 SIZE × 畫面寬度） */
    var MAX_LEVEL = 90;                             /* 最後一關：過了第 90 關就算全破（也是成績的上限） */
    /* 字庫：共用的「長得很像的中文字」（js/similar_chars.js 的 SimilarChars）。CHARS＝所有字（不重複），GROUPS＝一群一群長得像的字 */
    var GROUPS = SimilarChars.groups({ minSize: 2 }).map(function (g) { return g.chars; });  /* 「長得像的字」群組（每一群是一個字的陣列） */
    var CHARS = SimilarChars.chars({ minSize: 2 });     /* 所有群組裡出現過的字（不重複） */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function ramp(level, pair) { return kit.ramp(level, pair[0], pair[1], RAMP_LEVELS); }  /* kit.ramp(關卡, 起始值, 到頂值, 到頂關卡)：讓數值隨關卡「線性」從起始值變到到頂值（難度曲線的基本工具） */
    function flashMsFor(level) { return ramp(level, FLASH_MS); }
    function oneFrame(ms) { return ms <= ONE_FRAME_MS; }
    function opacityFor(level) { return Math.round(ramp(level, OPACITY) * 1000) / 1000; }
    function sizeFor(level) { return ramp(level, SIZE); }
    function optionsFor(level) { return kit.clamp(Math.round(ramp(level, OPTIONS)), Math.min(OPTIONS[0], OPTIONS[1]), Math.max(OPTIONS[0], OPTIONS[1])); }  /* kit.clamp(值, 最小, 最大)：把數值限制在範圍內 */
    function strokesMaxFor(level) { return Math.round(ramp(level, STROKES_MAX)); }
    function answerMsFor(level) { return Math.round(ramp(level, ANSWER_S) * 1000); }
    /* 這一關可以考的字（筆劃不超過 strokesMaxFor）；一個都沒有就退回全部（不會發生，字庫有 2 劃的字） */
    function poolFor(level) {
        var cap = strokesMaxFor(level), p = CHARS.filter(function (c) { var s = SimilarChars.strokes(c); return s == null || s <= cap; });  /* filter：留下符合條件的元素，回傳新陣列 */
        return p.length ? p : CHARS.slice();            /* slice()：複製一份陣列 */
    }
    /* 選項：答案 ＋ count−1 個干擾字。優先從「跟答案長得像」的字（同一群）挑，不夠再從這一關的字庫補，最後從全部的字補；洗牌 */
    function makeOptions(target, count, level, rand) {
        rand = rand || Math.random;                     /* 沒有傳亂數函式就用 Math.random（測試時可以傳固定的亂數，結果才能重現） */
        var near = SimilarChars.near(target), opts = kit.shuffle(near, rand).slice(0, count - 1);  /* kit.shuffle(陣列, rand)：把陣列隨機洗牌，回傳新陣列（不會動到原本的） */
        function fill(src) {
            var rest = kit.shuffle(src.filter(function (c) { return c !== target && opts.indexOf(c) < 0; }), rand);  /* indexOf：找元素在陣列裡的位置，找不到回傳 −1 */
            while (opts.length < count - 1 && rest.length) opts.push(rest.shift());
        }
        if (opts.length < count - 1) fill(poolFor(level));
        if (opts.length < count - 1) fill(CHARS);
        return kit.shuffle([target].concat(opts), rand);
    }
    /* 答案按鈕的版面（V1.57.0）：n 個按鈕 → { cols（一排幾個）, rows（幾排）, bw（按鈕寬）, bh（按鈕高）, side（寬高較小的一邊，字級用）, gw／hh（整個方陣的寬與高）}。
       W 是畫面寬度，maxH 是可用高度（px），gap 是按鈕之間的空隙，cols 是一排幾個（預設 OPT_COLS）。
       按鈕寬度固定＝畫面寬度的 1/cols（扣掉空隙）；高度盡量跟寬度一樣（正方形），排數多、放不下就縮矮到放得下為止（至少 24 px）。 */
    function gridFor(n, W, maxH, gap, cols) {
        cols = cols || OPT_COLS;
        var rows = Math.ceil(n / cols), bw = Math.floor((W - gap * (cols - 1)) / cols);
        var bh = Math.max(24, Math.floor(Math.min(bw, (maxH - gap * (rows - 1)) / rows)));
        var inRow = Math.min(n, cols);
        return { cols: cols, rows: rows, bw: bw, bh: bh, side: Math.min(bw, bh), gw: inRow * bw + (inRow - 1) * gap, hh: rows * bh + (rows - 1) * gap };
    }
    /* 閃出來的字：邊長 s（px）＝畫面寬度 W × SIZE，放不進白底（寬 zw、高 zh）就縮到放得下；回傳整數 px，至少 8 */
    function flashBox(level, W, zw, zh) { return Math.max(8, Math.floor(Math.min(sizeFor(level) * W, zw, zh))); }
    /* 出一關：{ ch, options, answer（答案是第幾個選項）, flashAtMs（開局後多久閃）, flashMs, one（只亮 1 幀）, opacity, size（占畫面寬度的比例）, u／v（位置：0～1，字框左上角在「可放範圍」裡的比例）, answerMs, level } */
    function makeLevel(level, rand) {
        rand = rand || Math.random;
        var pool = poolFor(level), ch = kit.pick(pool, rand), options = makeOptions(ch, optionsFor(level), level, rand);  /* kit.pick(陣列, rand)：從陣列隨機挑一個元素 */
        var ms = flashMsFor(level), lo = Math.min(WAIT_MIN_S, WAIT_S), flashAt = Math.round(kit.randFloat(lo, WAIT_S, rand) * 1000);  /* kit.randFloat(最小, 最大, rand)：隨機小數 */
        return { ch: ch, options: options, answer: options.indexOf(ch), flashAtMs: flashAt, flashMs: ms, one: oneFrame(ms), opacity: opacityFor(level), size: sizeFor(level), u: rand(), v: rand(), answerMs: answerMsFor(level), level: level };
    }
    /* 結算畫面的評語：依成績回傳一句話 */
    function rating(n) {
        if (n >= 20) return '一瞬間就認出來了，眼力太神！';
        if (n >= 12) return '眼力超強！';
        if (n >= 6) return '不錯喔！';
        if (n >= 3) return '再接再厲！';
        return '盯著白底的中間，字一閃就要抓住筆畫！';
    }

    /* mount：選單按下這款遊戲時會呼叫它。把「闖關」的流程（第幾關、過關、失敗、結算、最佳紀錄）交給共用骨架 kit.run，我們只提供 setup（每一關怎麼畫）、rating（評語）等小零件。 */
    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 5,
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['通過 ' + S.cleared + ' 關']; },
            setup: setup
        });
    }

    /* setup(api)：每一關開始時呼叫一次，負責出題並把這一關的畫面建出來。api 是共用骨架給的工具：api.stage（這一關的畫面容器）、api.level（第幾關）、
       api.after（延遲執行，換關後自動作廢）、api.timer（倒數計時）、api.pass／api.fail（過關／失敗）。 */
    function setup(api) {
        var stage = api.stage, level = api.level;       /* stage：這一關的畫面容器（要畫的東西都放進去）；level：現在是第幾關 */
        var q = makeLevel(level, api.rand);
        api.info = q;                                   /* 把這一關的題目資料掛在 api.info，測試與 debug 用（玩家看不到） */
        console.log('[瞬間識字] 第 ' + level + ' 關：字「' + q.ch + '」；第 ' + q.flashAtMs + ' 毫秒閃出，亮 ' + q.flashMs.toFixed(1) + ' 毫秒' + (q.one ? '（1 幀）' : '') + '，濃度 ' + q.opacity + '，大小 ' + (q.size * 100).toFixed(0) + '% 畫面寬；' + q.options.length + ' 個選項；作答 ' + q.answerMs + ' 毫秒');  /* 在瀏覽器主控台（按 F12）印出這一關的出題內容，方便除錯與驗證 */

        var W = stage.clientWidth || 472, H = stage.clientHeight || 700;
        var zoneW = W, zoneH = Math.round(W * ZONE_RATIO);          /* 題目框：正方形，邊長＝畫面寬度（V1.57.0） */
        var g = gridFor(q.options.length, W, H - zoneH - 12, GAP);  /* 答案按鈕的版面：寬度固定是畫面的 1/OPT_COLS，高度依排數調整（放得進題目框下面剩下的高度） */
        var wrap = h('div', { 'class': 'blinkchar-wrap' });
        var zone = h('div', { 'class': 'blinkchar-zone' });
        zone.style.height = zoneH + 'px';
        var msg = h('div', { 'class': 'blinkchar-msg', text: '盯著白底，字會閃一下！' });
        zone.appendChild(msg);                          /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
        var areaH = zoneH - 6 - MSG_H;                                /* 字可以閃的範圍高度：題目框裡面扣掉下緣留給說明文字的 MSG_H */
        var S = flashBox(level, W, zoneW - 6, areaH);               /* 字框邊長（px） */
        var left = Math.round(q.u * (zoneW - 6 - S)), top = Math.round(q.v * (areaH - S));  /* 隨機位置：整個字框都要放進（上面那塊）白底裡 */
        var chEl = h('div', { 'class': 'blinkchar-ch', text: q.ch });
        chEl.style.cssText = 'left:' + left + 'px;top:' + top + 'px;width:' + S + 'px;height:' + S + 'px;line-height:' + S + 'px;font-size:' + Math.round(S * FLASH_FONT) + 'px;';
        zone.appendChild(chEl);
        var btnBox = h('div', { 'class': 'blinkchar-btns' });
        btnBox.style.height = g.hh + 'px';
        wrap.appendChild(zone); wrap.appendChild(btnBox);
        stage.appendChild(wrap);                        /* 把整個遊戲區放進舞台（放進去，畫面上才看得到） */
        api.box = { left: left, top: top, size: S, zoneW: zoneW, zoneH: zoneH, areaH: areaH, msgH: MSG_H, grid: g };

        var phase = 'wait', frames = 0, shownAt = 0, btns = [], t0 = performance.now(), flashAt = t0 + q.flashAtMs;  /* performance.now()：高精度的時間（毫秒），計時用 */
        /* 字亮／滅：用「濃度」（opacity）顯示，濃度 0 就看不到；亮的那一個畫面更新由下面的迴圈控制 */
        function show() { chEl.style.opacity = String(q.opacity); msg.style.visibility = 'hidden'; }
        function hide() { chEl.style.opacity = '0'; }
        /* 每個畫面更新檢查一次：到了時刻就亮出來；亮滿 1 幀（或 flashMs 毫秒）就滅掉，接著顯示答案按鈕 */
        api.my.loop(function (now) {                    /* my.loop(函式)：每個畫面更新（約每秒 60 次）就執行一次函式；函式回傳 false 就停止 */
            if (api.over || phase === 'ask' || phase === 'end') return false;
            if (phase === 'wait' && now >= flashAt) { phase = 'flash'; shownAt = now; frames = 0; show(); return; }
            if (phase === 'flash') {
                frames++;
                if (q.one ? frames >= 1 : now - shownAt >= q.flashMs) { hide(); phase = 'ask'; ask(); return false; }
            }
        });
        /* 字消失之後：跳出答案按鈕、開始作答倒數 */
        function ask() {
            msg.textContent = '剛剛閃過的是哪個字？'; msg.style.visibility = 'visible';
            btnBox.style.width = W + 'px';
            btnBox.style.gap = GAP + 'px';
            q.options.forEach(function (c, i) {
                var b = h('button', { 'class': 'blinkchar-opt', text: c });
                b.style.width = g.bw + 'px'; b.style.height = g.bh + 'px';          /* 寬度固定是畫面的 1/6；高度依排數調整 */
                b.style.fontSize = Math.floor(g.side * OPT_FONT) + 'px';           /* 字寬＝按鈕（寬、高較小的那一邊）的 80% */
                kit.onTap(b, function () { judge(i); });  /* kit.onTap(元素, 函式)：幫元素綁定「點一下」的動作（手機觸控與電腦滑鼠都可以） */
                btnBox.appendChild(b); btns.push(b);
            });
            api.timer(q.answerMs, function () { judge(null); });  /* 開始倒數（畫面上方的時間條）：時間到就呼叫後面那個函式 */
        }
        /* 揭曉：把字用全黑亮出來給玩家看 */
        function reveal() { chEl.classList.add('blinkchar-ch--reveal'); chEl.style.opacity = '1'; }
        /* 判定玩家的答案：答對就過關（api.pass），答錯或超時就失敗（api.fail） */
        function judge(i) {
            if (api.over || phase !== 'ask') return;
            phase = 'end';
            var ok = i === q.answer;
            btns[q.answer].classList.add('blinkchar-opt--right');  /* classList.add／remove／toggle：加上／拿掉 CSS class，元素的外觀就跟著變（class 的樣式寫在 css 檔裡） */
            if (i != null && !ok) btns[i].classList.add('blinkchar-opt--wrong');
            reveal();
            msg.textContent = '剛剛閃過的是「' + q.ch + '」';
            msg.className = 'blinkchar-msg blinkchar-msg--bottom';             /* 說明文字移到題目框下緣（V1.57.0），不要壓在揭曉的正確答案字上 */
            if (ok) { kit.flash(stage, true, api.my); api.pass({ delay: 1100 }); return; }  /* kit.flash(舞台, 對或錯, 計時器)：畫面閃一下綠光（答對）或紅光（答錯） */
            kit.flash(stage, false, api.my);
            api.fail({ delay: 2600, lines: [(i == null ? '時間到！' : '選錯了') + '，剛剛閃過的是「' + q.ch + '」', '那一關：亮 ' + (q.flashMs / 1000).toFixed(4) + ' 秒、濃度 ' + Math.round(q.opacity * 100) + '%、' + q.options.length + ' 個選項'] });  /* api.fail({ delay, lines })：宣告「失敗」，delay 毫秒後進結算畫面，lines 是結算要多寫的說明行 */
        }
        /* 給測試／debug 用：api.solve 直接答對、api.wrong 直接答錯（字還沒閃完時先等它閃完）。 */
        function whenAsk(fn) { if (phase === 'ask') fn(); else if (phase !== 'end') api.after(60, function () { whenAsk(fn); }); }
        api.solve = function () { whenAsk(function () { judge(q.answer); }); };
        api.wrong = function () { whenAsk(function () { judge((q.answer + 1) % q.options.length); }); };
        api.state = function () { return { phase: phase, frames: frames, btns: btns.length }; };
        if (level === 1 && kit.once('blinkchar.hint')) api.after(1200, function () { msg.textContent = '字只會閃一下，眼睛不要離開白底'; });  /* kit.once(key)：同一個頁面只有第一次回傳 true（用來讓提示只出現一次） */
    }

    /* 遊戲登記資料：id 代號、name 選單上的名稱、rule 玩法說明（**包起來的是粗體重點）、mount 進場函式、score 成績規格、test 給單元測試用的內部函式。 */
    var G = {
        id: ID,
        name: '瞬間識字',
        rule: '上方有一塊白底，**在 3 秒內的某個不定的時刻，白底上的隨機位置會閃出一個黑色的中文字**，只亮一下就消失。字消失之後，下面才跳出答案按鈕，**點出剛剛閃過的是哪個字**。一開始字又大又黑、亮 0.2 秒、只有 4 個選項；越後面，字越來越小、越來越淡、亮得越來越短（最後只亮一個畫面更新），選項最多到 16 個。選錯或來不及就結束，看你能過幾關。',
        mount: mount,
        score: SCORE,
        /* test：把內部函式與參數交給單元測試（test/reaction/ 底下的 t_*.js）使用，遊戲本身不會用到。 */
        test: {
            flashMsFor: flashMsFor, oneFrame: oneFrame, opacityFor: opacityFor, sizeFor: sizeFor, optionsFor: optionsFor, strokesMaxFor: strokesMaxFor, answerMsFor: answerMsFor, poolFor: poolFor, makeOptions: makeOptions, gridFor: gridFor, flashBox: flashBox, makeLevel: makeLevel, rating: rating,
            RAMP_LEVELS: RAMP_LEVELS, FLASH_MS: FLASH_MS, ONE_FRAME_MS: ONE_FRAME_MS, OPACITY: OPACITY, SIZE: SIZE, OPTIONS: OPTIONS, STROKES_MAX: STROKES_MAX, ANSWER_S: ANSWER_S, WAIT_S: WAIT_S, WAIT_MIN_S: WAIT_MIN_S, OPT_FONT: OPT_FONT, OPT_COLS: OPT_COLS, ZONE_RATIO: ZONE_RATIO, MSG_H: MSG_H, GAP: GAP, GROUPS: GROUPS, CHARS: CHARS, MAX_LEVEL: MAX_LEVEL
        }
    };
    /* 把這款遊戲登記給選單（沒有這行，選單就看不到它） */
    Reaction.register(G);
})();

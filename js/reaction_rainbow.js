/* ═══════════════════════════════════════════════════════════════════
   reaction_rainbow.js — 秒反應・七彩陷阱
   畫面是黑底 2×2 四個緊鄰的正方形，一開始四格全黑。方塊會照順時針的順序
   （左上→右上→右下→左下→左上…）一個接一個換上隨機的七彩顏色，最新換上去的
   那一格有白邊。畫面上緣的提示文字寫著要點哪些顏色——那種顏色的方塊一出現，
   就要在下一個方塊出現「之前」點下去；來不及（超時）、或是點到不該點的方塊，
   都算失敗。
   ───────────────────────────────────────────────────────────────────
   · 一開始只要點紅色。每成功點擊 TARGETS_PER_STAGE 個目標色方塊，遊戲就先暫停，
     跳出新規則彈窗：除了原本要點的顏色，再隨機多加一種顏色也要點，提示文字跟著
     改；依此類推，最多到 MAX_TARGETS（6）種。換階段時棋盤上原有的四個方塊
     原封不動保留（不清空），玩家按下彈窗的「知道了」之後，從下一個方塊接著玩；
     換方塊的間隔縮短的進度也是接續的（不會因為換階段就重新變慢）。
   · 新規則彈窗只能按「知道了」按鈕關閉，不會自動消失、點彈窗以外的地方也不會
     關。按鈕剛出現的前 RULE_ARM_MS 毫秒是灰的、按不下去：彈窗是玩家點掉第 N 個
     目標的那一下「立刻」跳出來的，手指還停在畫面上、或緊接著又點了一下，這一
     下就會落在彈窗中央的按鈕上（觸控裝置常見的「鬼點擊」），讓彈窗還沒看清楚
     就被關掉，之後玩家完全不知道規則變了。
   · 換階段的緩衝：新規則彈窗一跳出來，「下一個要出現方塊的那一格」就先清成黑底
     （其他三格保留），預先告訴玩家下一個方塊會出現在哪；玩家按下「知道了」之後，
     那一格會用白色大字從 3、2、1 倒數（每個數字 COUNTDOWN_STEP_MS 毫秒），倒數完
     才換上新的方塊，不會一關彈窗方塊就馬上冒出來、來不及反應。
   · 換階段後，棋盤上「已經存在」的舊方塊全部算「已處理」：點到不算錯、也不算
     成功，直接忽略（舊方塊裡可能剛好有新加入的目標色，玩家看到順手點下去，
     不該為了還沒開始算的方塊失敗）。下一次換到那一格時才重新開始計算。
   · 七彩顏色固定 7 個（紅橙黃綠藍靛紫），能當「要點的顏色」的只有前面有圓形
     符號（🔴🟠🟡🟢🔵🟣）的 6 個——靛色沒有對應的符號，永遠只是干擾用的顏色，
     跟藍色、紫色放在一起很容易看錯，這就是「陷阱」。
   · 干擾字：不是目標色的方塊，有一定機率在上面壓一個大大的粗體字（寬度約方塊的
     80%），字的內容是「目前要點的某個顏色的名字」（例如只要點紅色時永遠是「紅」，
     紅＋綠時會是「紅」或「綠」），字的顏色從「目前要點的顏色＋白＋黑」裡隨機挑。
     目標色方塊上不會有字（乾乾淨淨的色塊才是真的目標）。
   · 判定：
     - 目標色的最新方塊，在下一個方塊出現前被點到＝成功（方塊維持原本的顏色
       不變；已經點過的方塊再點一次不算錯，直接忽略，免得手快連點兩下就失敗）。
     - 到了下一個方塊出現的時間，上一個目標色方塊還沒被點到＝超時，失敗。
     - 點到「不是目前這個待點目標」的任何方塊（包含非目標色、舊的方塊、全黑的
       方塊；已經成功點過的除外，見上面）＝點錯，失敗。點到方塊以外的地方不算。
   · 方塊換色的間隔從 START_INTERVAL_MS 開始，每換一個方塊就縮短
     INTERVAL_STEP_MS，最短縮到 MIN_INTERVAL_MS 為止；成績＝成功點擊的目標數，
     越多越好。
   · 觸發用 pointerdown（手指一碰到就算），理由跟「神準落下」「不可能任務」一樣。
   · 右上角「?」規則彈窗開著的時候，換方塊會暫停等它關掉（重新給一整個間隔
     的時間才繼續），不會因為看規則就莫名其妙超時。
   ═══════════════════════════════════════════════════════════════════ */

/* （這款是較早寫的遊戲：只有一局、沒有關卡，所以不用 kit.round，直接用 setTimeout；共通結構見 js/reaction_sticks.js 開頭的「新手導讀」） */
(function () {
    'use strict';

    var ID = 'rainbow';

    /* 世界排行榜的成績規格（欄位說明見 js/leaderboard.js 開頭）；資料庫 MF_games 裡 rainbow 那一列要一致
       （node test/leaderboard/gen_games_sql.cjs 會從這裡產生 insert，test/reaction/t_leaderboard.js 會檢查兩邊是否一致）。 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 個', label: '點中個數', min: 1, max: 1000 };
    var h = UI.h;

    /* 設定集中在這一區 */
    /* ═══ 可以自己調的參數 ═══ */
    /* 每成功點擊幾個目標之後暫停並多加一種顏色 */
    var TARGETS_PER_STAGE = 10;     /* 每個階段成功點擊幾個目標色方塊之後，暫停並加一種新顏色 */
    var MAX_TARGETS = 6;            /* 要點的顏色最多加到幾種 */
    /* 換方塊的間隔從 800ms 開始，每換一個縮短一點，最短 200ms */
    var START_INTERVAL_MS = 800;   /* 換方塊的間隔起始值（每個方塊一開始停留多久） */
    var MIN_INTERVAL_MS = 200;      /* 間隔最短縮到多少（再短人就按不到了） */
    /* 每換一個方塊，間隔縮短幾毫秒（從 START_INTERVAL_MS 縮到 MIN_INTERVAL_MS 大約
       要換 (START − MIN) ÷ 這個數字 個方塊） */
    var INTERVAL_STEP_MS = 5.0;
    var FIRST_DELAY_MS = 900;       /* 一局開始到第一個方塊出現的等待時間 */
    var COUNTDOWN_FROM = 3;         /* 換階段、關掉新規則彈窗之後，從幾開始倒數 */
    var COUNTDOWN_STEP_MS = 1000;   /* 倒數每個數字停留多久 */
    var TARGET_PROB = 0.3;          /* 每個新方塊是目標色的機率 */
    var DECOY_PROB = 0.23;          /* 非目標色的方塊上，出現干擾字的機率（原本 0.7，再降成它的 1/3 ≈ 0.23） */
    var RULE_ARM_MS = 1000;         /* 新規則彈窗跳出後，「知道了」按鈕要等多久才按得下去（防止誤觸） */

    /* 七個顏色的資料：id、名稱、提示用符號 emoji、CSS 顏色碼 */
    /* 七個固定的鮮豔七彩顏色。emoji 是提示文字用的圓形符號（靛色沒有，所以不能當目標）。 */
    var COLORS = [
        { id: 'red', name: '紅', emoji: '🔴', css: '#FF1F1F' },
        { id: 'orange', name: '橙', emoji: '🟠', css: '#FF8A00' },
        { id: 'yellow', name: '黃', emoji: '🟡', css: '#FFE600' },
        { id: 'green', name: '綠', emoji: '🟢', css: '#14C83C' },
        { id: 'blue', name: '藍', emoji: '🔵', css: '#1E7BFF' },
        { id: 'indigo', name: '靛', emoji: '', css: '#4B2BFF' },
        { id: 'purple', name: '紫', emoji: '🟣', css: '#B026FF' }
    ];
    /* RED：一開始只要點紅色 */
    var RED = COLORS[0];
    /* EXTRA_POOL：之後能加進來當目標的顏色（要有符號，所以靛色不能當目標，永遠只是干擾） */
    var EXTRA_POOL = COLORS.filter(function (c) { return c.emoji && c !== RED; });

    /* 2×2 格子在 CSS Grid 的編號是左上0、右上1、左下2、右下3 */
    /* 2×2 格子在 CSS Grid 裡的編號是左上0、右上1、左下2、右下3；
       順時針換方塊的順序就是 左上→右上→右下→左下。 */
    /* ORDER：順時針換方塊的順序（左上→右上→右下→左下） */
    var ORDER = [0, 1, 3, 2];

    /* 從陣列隨機挑一個 */
    function pickAny(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
    /* 提示文字：「請點擊 🔴紅 … 方塊」 */
    function hintTextFor(targets) {
        return '請點擊' + targets.map(function (c) { return c.emoji + c.name; }).join('') + '方塊，超時就失敗。';
    }

    /* mount：遊戲進場點 */
    function mount(root, ctx) {
        /* 替整個畫面加上黑底 class（樣式在 css/reaction.css 的 .rb-bg） */
        root.classList.add('rb-bg');
        /* 規則彈窗元素：「?」重看規則時，換方塊要暫停等它關掉 */
        var ruleDlg = document.getElementById('rule-dlg');
        function ruleOpen() { return !!ruleDlg && !ruleDlg.hidden; }

        /* gen：每開一局 +1；上一局還沒跑完的計時器發現世代不一樣就自己停掉 */
        var gen = 0;    /* 每開一局就 +1：上一局還沒跑完的計時器發現世代不一樣就自己停掉 */

        /* round：開一局 */
        function round() {
            var myGen = ++gen;
            root.innerHTML = '';

            /* targets 目前要點的顏色清單；hits 成功點擊數（成績）；steps 已換過幾個方塊（決定間隔縮到多短）；pending 還沒被點掉的目標方塊 */
            var targets = [RED];
            var hits = 0;               /* 成功點擊的目標數（成績） */
            var stageHits = 0;          /* 這個階段已經成功點擊的目標數 */
            var steps = 0;              /* 已經換過幾個方塊（決定間隔縮到多短） */
            var cur = -1;               /* 目前最新的方塊在 ORDER 裡的位置 */
            var pending = null;         /* 還沒被點掉的目標色方塊：{ idx } */
            /* handled：這一格的目標方塊已點過（再點不算錯，避免連點兩下就失敗） */
            var handled = [false, false, false, false];   /* 這一格的目標色方塊已經成功點過（再點不算錯） */
            /* state：ready 等第一個方塊/play 進行中/paused 新規則彈窗/over 結束 */
            var state = 'ready';        /* ready：等第一個方塊／play：進行中／paused：新規則彈窗／over：結束 */
            var timer = null;
            var resumeAfterRule = false;

            /* 標題列右側的文字要短：太長會把中間的遊戲名稱擠成「七…」，所以只寫
               「N 個・最佳 M」，不像結算卡片那樣寫完整的「成功／個」。 */
            function updateMeta() {
                var b = Reaction.getBest(ID);
                ctx.setMeta(hits + ' 個' + (b == null ? '' : '・最佳 ' + b));
            }
            updateMeta();

            var hint = h('div', { 'class': 'rb-top', text: hintTextFor(targets) });
            var wrap = h('div', { 'class': 'rb-wrap' });
            var board = h('div', { 'class': 'rb-board' });
            wrap.appendChild(board);
            root.appendChild(hint);
            root.appendChild(wrap);

            /* 棋盤是正方形：量 wrap 實際可用的寬高，取小的那個（取偶數，兩格剛好平分）
               當邊長；剩下的空間靠 .rb-wrap 的 flex 置中，留白平均分在兩側／上下。 */
            /* 棋盤是正方形：取可用寬高較小者，取偶數讓兩格剛好平分 */
            var side = Math.floor(Math.min(wrap.clientWidth, wrap.clientHeight) / 2) * 2;
            board.style.width = side + 'px';
            board.style.height = side + 'px';
            var cellPx = side / 2;

            var cells = [];
            /* 建立 4 個格子，每格綁 pointerdown（一碰就觸發） */
            for (var i = 0; i < 4; i++) {
                (function (i) {
                    var el = h('div', { 'class': 'rb-cell' });
                    el.addEventListener('pointerdown', function (e) { e.preventDefault(); tap(i); });
                    board.appendChild(el);
                    cells.push(el);
                })(i);
            }


            /* 目前的間隔（隨換方塊數縮短） */
            function intervalNow() { return Math.max(MIN_INTERVAL_MS, START_INTERVAL_MS - steps * INTERVAL_STEP_MS); }
            /* 排下一次換方塊 */
            function schedule(ms) {
                clearTimeout(timer);
                timer = setTimeout(function () { if (myGen === gen) tick(); }, ms);
            }

            /* 換下一個方塊：①上一個目標沒被點到＝超時失敗 ②拿掉白邊 ③換上新顏色（可能壓干擾字）④排下一次 */
            /* 換下一個方塊。順序固定是：①先檢查上一個目標有沒有被點掉（沒有＝超時）
               ②拿掉上一個方塊的白邊 ③新方塊換上隨機顏色＋白邊（非目標色再看要不要壓干擾字）
               ④排下一次換方塊。 */
            function tick() {
                if (state !== 'play' && state !== 'ready') return;
                if (ruleOpen()) { resumeAfterRule = true; schedule(150); return; }
                if (resumeAfterRule) { resumeAfterRule = false; schedule(intervalNow()); return; }
                if (pending) { fail('超時了，來不及點！', null, pending.idx); return; }
                state = 'play';

                if (cur >= 0) cells[ORDER[cur]].classList.remove('rb-cell--new');
                cur = (cur + 1) % 4;
                var idx = ORDER[cur], el = cells[idx];

                /* 依機率決定這個方塊是不是目標色 */
                var isTarget = Math.random() < TARGET_PROB;
                var nonTargets = COLORS.filter(function (c) { return targets.indexOf(c) < 0; });
                var color = isTarget ? pickAny(targets) : pickAny(nonTargets);
                el.style.background = color.css;
                el.innerHTML = '';
                handled[idx] = false;
                if (isTarget) {
                    pending = { idx: idx };
                } else if (Math.random() < DECOY_PROB) {
                    var inkPool = targets.map(function (c) { return c.css; }).concat(['#FFFFFF', '#000000']);
                    var letter = h('span', { 'class': 'rb-letter', text: pickAny(targets).name });
                    letter.style.fontSize = Math.round(cellPx * 0.8) + 'px';
                    letter.style.color = pickAny(inkPool);
                    el.appendChild(letter);
                }
                el.classList.add('rb-cell--new');

                var ms = intervalNow();
                steps++;
                schedule(ms);
            }

            /* 玩家點了某一格：必須剛好是待點的目標，否則失敗 */
            function tap(idx) {
                if (state !== 'play') return;
                if (handled[idx]) return;
                if (!pending || idx !== pending.idx) { fail('點錯了！那不是要點的方塊', idx, pending ? pending.idx : null); return; }

                /* 成功：方塊維持原本的顏色（不變黑），白邊也留著直到下一個方塊出現 */
                handled[idx] = true;
                pending = null;
                hits++;
                stageHits++;
                updateMeta();

                if (stageHits >= TARGETS_PER_STAGE && targets.length < MAX_TARGETS) newStage();
            }

            /* 換階段：暫停、加一種新目標色、彈出新規則視窗 */
            /* 換階段：先暫停（取消換方塊的計時器），再彈出新規則彈窗 */
            function newStage() {
                state = 'paused';
                clearTimeout(timer);
                var extra = pickAny(EXTRA_POOL.filter(function (c) { return targets.indexOf(c) < 0; }));
                targets.push(extra);

                /* 下一個要出現方塊的那一格先清成黑底，預告位置 */
                /* 下一個要出現方塊的那一格先清成黑底（舊顏色、干擾字都拿掉），預先讓玩家
                   知道下一個方塊會出現在哪；其他三格維持原樣。 */
                var nextEl = cells[ORDER[(cur + 1) % 4]];
                nextEl.style.background = '#000';
                nextEl.innerHTML = '';

                var okBtn = h('button', { 'class': 'btn btn--primary', text: '知道了', attrs: { disabled: 'disabled' }, on: { click: close } });
                var overlay = h('div', { 'class': 'drop-result-overlay' }, [
                    h('div', { 'class': 'drop-result-card' }, [
                        h('div', { 'class': 'rx-result__label', text: '新規則！' }),
                        h('div', { 'class': 'rb-rule-text', text: '除了原本的顏色，現在' + extra.emoji + extra.name + '色的方塊也要點！其他顏色一律不能點，來不及點或點錯，都算失敗。' }),
                        h('div', { 'class': 'rb-rule-targets', text: targets.map(function (c) { return c.emoji + c.name; }).join('　') }),
                        okBtn
                    ])
                ]);
                root.appendChild(overlay);

                /* 「知道了」按鈕剛出現的 1 秒內是灰的（防止手指的「鬼點擊」立刻把彈窗關掉） */
                setTimeout(function () { if (myGen === gen) okBtn.disabled = false; }, RULE_ARM_MS);

                /* 關掉彈窗：舊方塊全部標成「已處理」，然後倒數 3、2、1 才接著換方塊 */
                /* 關掉彈窗：棋盤保持原樣（不清空、不重設 cur），舊方塊全部標成「已處理」，
                   然後在下一個位置倒數 3、2、1，倒數完才從那一格接著換方塊。 */
                function close() {
                    if (state !== 'paused' || myGen !== gen || okBtn.disabled) return;
                    overlay.remove();
                    hint.textContent = hintTextFor(targets);
                    handled = [true, true, true, true];
                    stageHits = 0;
                    state = 'play';
                    countdown(COUNTDOWN_FROM);
                }

                /* 倒數：在下一格顯示白色大數字，每秒減 1，到 0 就換方塊 */
                /* 在 nextEl 上顯示白色大數字 n，COUNTDOWN_STEP_MS 之後換 n-1；倒數到 0 就
                   把數字拿掉、換下一個方塊（tick）。「?」規則視窗開著的時候先停在原地等它關掉。 */
                function countdown(n) {
                    if (myGen !== gen || state !== 'play') return;
                    if (ruleOpen()) { timer = setTimeout(function () { countdown(n); }, 150); return; }
                    nextEl.innerHTML = '';
                    if (n <= 0) { tick(); return; }
                    var num = h('span', { 'class': 'rb-letter', text: String(n) });
                    num.style.fontSize = Math.round(cellPx * 0.8) + 'px';
                    num.style.color = '#FFFFFF';
                    nextEl.appendChild(num);
                    timer = setTimeout(function () { countdown(n - 1); }, COUNTDOWN_STEP_MS);
                }
            }

            /* 失敗：標出點錯的那一格（紅虛線）與漏掉的那一格（白虛線），稍後顯示結算 */
            /* 失敗：停掉計時器，標出哪一格出事——badIdx＝點錯的那一格（鮮紅色虛線框）、
               missedIdx＝本來該點、卻沒點到的那一格（白色虛線框，告訴玩家「正確的是這個」），
               稍等一下再疊上結算卡片，跟其他遊戲同一套做法。 */
            function fail(reason, badIdx, missedIdx) {
                state = 'over';
                if (window.Sfx) Sfx.play('bad');
                clearTimeout(timer);
                if (badIdx != null) cells[badIdx].classList.add('rb-cell--bad');
                if (missedIdx != null) cells[missedIdx].classList.add('rb-cell--missed');
                var isNew = hits > 0 && Reaction.setBest(ID, hits, function (v, b) { return v > b; });
                updateMeta();
                UI.wait(700).then(function () {
                    if (myGen !== gen) return;
                    root.appendChild(h('div', { 'class': 'drop-result-overlay', attrs: { 'data-sfx': hits >= 15 ? 'win' : 'fail' } }, [
                        h('div', { 'class': 'drop-result-card' }, [
                            h('div', { 'class': 'rx-result__num', text: hits + ' 個' }),
                            h('div', { 'class': 'rx-result__label', text: reason }),
                            isNew ? h('div', { 'class': 'hint hint--ok', text: '新紀錄！' }) : null,
                            h('button', { 'class': 'btn btn--primary', text: '再挑戰一次', on: { click: round } })
                        ])
                    ]));
                    /* 送世界排行榜（結算卡片已經在畫面上了；0 個不在有效範圍，會自己略過） */
                    Leaderboard.submit(ID, hits);
                });
            }

            /* 一開始等 900ms 才出第一個方塊 */
            schedule(FIRST_DELAY_MS);
        }

        round();
    }

    /* Reaction.register：把這款遊戲登記到遊戲清單 */
    Reaction.register({
        id: ID,
        name: '七彩陷阱',
        rule: '畫面上有 2×2 四個方塊，會照順時針的順序，一個接一個換上七彩顏色（最新的那個有白邊），而且換得越來越快。一開始只要點「紅色」方塊：紅色一出現，就要在下一個方塊出現之前馬上點下去！來不及，或是點到別的方塊，都算失敗。小心，其他顏色的方塊上面可能壓著「紅」字來騙你。每成功點擊幾個之後，遊戲會暫停並增加新的顏色也要點，看你能撐多久！',
        mount: mount,
        /* 世界排行榜的成績規格 */
        score: SCORE
    });
})();

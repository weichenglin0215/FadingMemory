/* ═══════════════════════════════════════════════════════════════════
   reaction_rps.js — 秒反應・猜拳必贏
   樣式：css/games/reaction_rps.css（這款專屬的 class 一律以「rps-」開頭；共用元件在 css/reaction_common.css）
   上面倒數 3、2、1、0，數字變成 0 的那一刻開始，你只有 1.0 秒可以按下剪刀／石頭／布；
   電腦在 0 之後出拳。前面的關卡電腦一數到 0 就立刻出拳，你可以看了再出；越後面電腦越晚出，
   留給你「看到電腦的拳」的時間越短，最後幾乎只能盲出。
   ───────────────────────────────────────────────────────────────────
   · 電腦的拳在倒數開始之前就用亂數決定好（優先用 crypto.getRandomValues，沒有才用
     Math.random），不會因為玩家出什麼而改變，所以完全公平。
   · 時間（第 L 關 ＝ 目前連贏數 ＋ 1）：
        你的出拳時限固定 WINDOW_MS（1.0 秒，依玩家意見由 0.5 秒改成 1.0 秒），從「0」出現開始算；電腦出拳的延遲 ＝ 1.0 秒 － 緩衝，
        緩衝（電腦出拳後到你的時限結束，剩多久可以看）從 BUFFER_START（1.0 秒）隨關卡線性減到
        BUFFER_END（0.03 秒），第 BUFFER_RAMP 關起維持最低。也就是電腦的延遲從 0 秒慢慢變成 0.97 秒。
        電腦圖形與你的圖形中間是倒數橫條，顯示你剩多少時間。
   · 犯規：0 出現之前就按 ＝ 搶拳犯規，直接輸；1.0 秒內沒按 ＝ 慢出，輸。
   · 平手不算數，同一關重來（延遲不變）。輸了就結束，成績＝連贏幾關。
   · 失敗後可以從「失敗關卡 − 5」繼續（kit.resumeFrom）。
   ═══════════════════════════════════════════════════════════════════ */

/* （檔案結構說明見 js/reaction_sticks.js 開頭的「新手導讀」） */
(function () {
    'use strict';

    var ID = 'rps';

    /* 世界排行榜的成績規格（欄位說明見 js/leaderboard.js 開頭）；資料庫 MF_games 裡 rps 那一列要一致
       （node test/leaderboard/gen_games_sql.cjs 會從這裡產生 insert，test/reaction/t_leaderboard.js 會檢查兩邊是否一致）。 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 200 };
    var h = UI.h;
    var kit = Reaction.kit;

    /* 設定集中在這一區 */
    /* ═══ 可以自己調的參數 ═══ */
    /* 倒數每個數字停留 0.75 秒 */
    var COUNT_MS = 750;            /* 倒數每個數字停留多久 */
    /* 0 出現之後，要在 1000 毫秒（1.0 秒）內出拳——原本是 500 毫秒，玩家覺得太趕，改成 1.0 秒 */
    var WINDOW_MS = 1000;          /* 0 出現之後，要在幾毫秒內出拳 */
    /* 緩衝：電腦出拳後，你還剩多少秒可以看，從 1.0 秒（＝整個時限，電腦一數到 0 就出拳）線性減到 0.03 秒（電腦出得越來越晚） */
    var BUFFER_START = 1.0, BUFFER_END = 0.03, BUFFER_RAMP = 20;      /* 電腦出拳後，你還剩多少秒可以出（秒）*/
    var REVEAL_MS = 1700;          /* 公布結果後多久進下一回合 */
    /* 三種拳：剪刀、石頭、布 */
    var KINDS = ['scissors', 'rock', 'paper'];
    var NAMES = { scissors: '剪刀', rock: '石頭', paper: '布' };  /* 三種手勢的中文名稱：剪刀、石頭、布 */

    function fmtBest(v) { return v == null ? '' : '最佳連贏 ' + v; }

    /* 純函式（也給 Node 測試用） */
    /* ═══ 純函式（也給 Node 測試用）═══ */
    /* 判定勝負：0 平手、1 是 a 贏、−1 是 b 贏（剪刀勝布、石頭勝剪刀、布勝石頭） */
    /* 0＝平手、1＝a 贏、-1＝b 贏 */
    function judge(a, b) {
        if (a === b) return 0;
        if ((a === 'scissors' && b === 'paper') || (a === 'rock' && b === 'scissors') || (a === 'paper' && b === 'rock')) return 1;
        return -1;
    }
    /* 電腦的拳：優先用 crypto.getRandomValues（真正的亂數），不行才用 Math.random；r 是 0、1、2，對應三種拳 */
    function randomKind() {
        var r;
        try {
            var arr = new Uint32Array(1);
            window.crypto.getRandomValues(arr);
            r = arr[0] % 3;
        } catch (e) { r = Math.floor(Math.random() * 3); }  /* Math.floor：無條件捨去成整數 */
        return KINDS[r];
    }
    /* 第 level 關：緩衝與電腦延遲（延遲＝限時 1.0 秒 − 緩衝） */
    /* 第 level 關：電腦出拳後，你還剩幾秒；以及電腦在 0 之後多久才出拳 */
    function bufferFor(level) { return kit.ramp(level, BUFFER_START, BUFFER_END, BUFFER_RAMP); }  /* kit.ramp(關卡, 起始值, 到頂值, 到頂關卡)：讓數值隨關卡「線性」從起始值變到到頂值（難度曲線的基本工具） */
    function delayFor(level) { return WINDOW_MS / 1000 - bufferFor(level); }
    /* 連贏 n 關的機率文字（每關贏的機率 1/2 → 0.5 的 n 次方） */
    function chanceText(n) {
        if (n <= 0) return '';
        var p = Math.pow(0.5, n) * 100;
        return '連贏 ' + n + ' 關的機率只有 ' + p.toFixed(4) + '%';
    }

    /* 手勢圖示：用簡單的向量圖（SVG）畫，不用 emoji；100×100 座標 */
    /* 手勢圖示（簡單向量圖，不用 emoji）：100×100 */
    function handIcon(kind, color) {
        var svg = kit.svg('svg', { 'class': 'rps-icon', viewBox: '0 0 100 100' });  /* kit.svg(標籤, 屬性, 父元素)：建立 SVG 向量圖形元素（形狀、線條…），畫圖用，放大縮小不會糊 */
        var st = { fill: color, stroke: 'rgba(0,0,0,0.45)', 'stroke-width': 3, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' };
        /* 小工具 el(標籤, 屬性)：建立形狀並自動合併共用的填色、外框 */
        function el(tag, attrs, parent) { var a = {}; for (var k in st) a[k] = st[k]; for (var k2 in attrs) a[k2] = attrs[k2]; return kit.svg(tag, a, parent || svg); }
        if (kind === 'rock') {
            el('rect', { x: 20, y: 28, width: 60, height: 52, rx: 20 });
            [37, 50, 63].forEach(function (x) { kit.svg('line', { x1: x, y1: 30, x2: x, y2: 46, stroke: 'rgba(0,0,0,0.35)', 'stroke-width': 3, 'stroke-linecap': 'round' }, svg); });  /* forEach：對陣列的每個元素各做一次 */
            el('ellipse', { cx: 36, cy: 70, rx: 18, ry: 10, transform: 'rotate(-15 36 70)' });
        } else if (kind === 'paper') {
            [[24, 22], [37, 12], [50, 8], [63, 14]].forEach(function (p) { el('rect', { x: p[0], y: p[1], width: 12, height: 46, rx: 6 }); });
            el('rect', { x: 22, y: 44, width: 56, height: 40, rx: 16 });
            el('rect', { x: 6, y: 50, width: 12, height: 32, rx: 6, transform: 'rotate(-35 12 66)' });
        } else {
            el('rect', { x: 28, y: 10, width: 13, height: 52, rx: 6.5, transform: 'rotate(-14 34 60)' });
            el('rect', { x: 58, y: 10, width: 13, height: 52, rx: 6.5, transform: 'rotate(14 65 60)' });
            el('rect', { x: 22, y: 50, width: 56, height: 36, rx: 16 });
            kit.svg('line', { x1: 40, y1: 64, x2: 40, y2: 74, stroke: 'rgba(0,0,0,0.3)', 'stroke-width': 3, 'stroke-linecap': 'round' }, svg);
            kit.svg('line', { x1: 56, y1: 64, x2: 56, y2: 74, stroke: 'rgba(0,0,0,0.3)', 'stroke-width': 3, 'stroke-linecap': 'round' }, svg);
        }
        return svg;
    }

    /* mount：遊戲進場點 */
    function mount(root, ctx) {
        var R = null;

        /* start：從第幾關開始（失敗後可從前 5 關繼續）*/
        /* round：開一局（失敗後可從失敗關卡前 5 關繼續） */
        function round(start) {
            if (R) R.dispose();
            R = kit.round();
            var my = R;
            root.innerHTML = '';                        /* innerHTML = ''：把元素裡面的東西全部清掉 */
            /* wins 連贏數；rounds 總回合；ties 平手次數；state 目前階段（count 倒數中/open 可出拳/reveal 揭曉/over 結束）；comp 電腦的拳 */
            var wins = (start || 1) - 1, newRec = false, rounds = 0, ties = 0, state = 'idle', comp = null, lastWhy = '', lastDelay = 0;

            /* 畫面：電腦（上）／ 中間的數字與倒數橫條 ／ 你（下）／ 三顆按鈕 */
            /* 畫面：電腦（上）／ 中間的數字與倒數橫條 ／ 你（下）／ 三顆按鈕 */
            var compWho = h('div', { 'class': 'rps-who', text: '電腦' });
            var compBody = h('div', { 'class': 'rps-body' });
            var meBody = h('div', { 'class': 'rps-body' });
            var halfC = h('div', { 'class': 'rps-half rps-half--comp' }, [compWho, compBody]);
            var halfP = h('div', { 'class': 'rps-half rps-half--me' }, [meBody, h('div', { 'class': 'rps-who', text: '你' })]);
            var big = h('div', { 'class': 'rps-big', text: '' });
            var bar = h('div', { 'class': 'ld-time' }, [h('div', { 'class': 'ld-time__fill' })]);
            var fill = bar.firstChild;
            var mid = h('div', { 'class': 'rps-mid' }, [big, bar]);
            var top = h('div', { 'class': 'rps-top' }, [halfC, mid, halfP]);
            var btns = h('div', { 'class': 'rps-btns' });
            root.appendChild(top);                      /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
            root.appendChild(btns);
            var btnEls = {};
            /* 建立三顆出拳按鈕（剪刀、石頭、布），pointerdown 一碰就出拳；kit.evT(e) 取事件發生的精確時間 */
            KINDS.forEach(function (k) {
                var b = h('button', { 'class': 'rps-btn rps-btn--' + k }, [h('span', { 'class': 'rps-btn__ico' }), h('span', { 'class': 'rps-btn__txt', text: NAMES[k] })]);
                b.firstChild.appendChild(handIcon(k, '#FFE9B0'));
                b.addEventListener('pointerdown', function (e) { e.preventDefault(); press(k, kit.evT(e)); });  /* preventDefault：取消瀏覽器的預設動作（例如拖曳時的捲動、文字選取） */
                btns.appendChild(b);
                btnEls[k] = b;
            });

            /* 更新標題列右側的小字 */
            function meta() { ctx.setMeta(kit.meta(['連贏 ' + wins, fmtBest(Reaction.getBest(ID))])); }  /* Reaction.getBest／setBest：讀／寫這款遊戲的個人最佳紀錄（存在手機的 localStorage） */
            function placeholder(txt) { return h('div', { 'class': 'rps-none', text: txt }); }
            function setComp(kind) {
                compBody.innerHTML = '';
                if (kind) { compBody.appendChild(handIcon(kind, '#F6A39B')); compBody.appendChild(h('div', { 'class': 'rps-name', text: NAMES[kind] })); }
                else compBody.appendChild(placeholder('？'));
            }
            function setMe(kind, missText) {
                meBody.innerHTML = '';
                if (kind) { meBody.appendChild(handIcon(kind, '#9CC3F0')); meBody.appendChild(h('div', { 'class': 'rps-name', text: NAMES[kind] })); }
                else meBody.appendChild(placeholder(missText || ''));
            }
            function setMid(text, cls) { big.textContent = text; big.className = 'rps-big' + (cls ? ' ' + cls : ''); }  /* textContent：設定元素裡的文字（安全，不會被當成 HTML 解析） */

            /* ─── 一回合：倒數 3、2、1、0 → 1.0 秒出拳時限 ─── */
            function play() {
                if (my.dead) return;
                var level = wins + 1, delay = delayFor(level);
                /* 電腦的拳先決定好，不受玩家影響（所以公平） */
                comp = randomKind();             /* 先決定好，不受玩家影響 */
                lastDelay = delay;
                state = 'count';
                rounds++;
                meta();
                fill.style.width = '100%';
                [].forEach.call(btns.children, function (b) { b.classList.remove('rps-btn--pick'); });  /* classList.add／remove／toggle：加上／拿掉 CSS class，元素的外觀就跟著變（class 的樣式寫在 css 檔裡） */
                compWho.textContent = '電腦　第 ' + level + ' 關';
                setComp(null); setMe(null, '');
                /* 主控台印出電腦這回合的拳與延遲，方便驗證 */
                try { console.info('[猜拳必贏] 第 ' + level + ' 關（第 ' + rounds + ' 回合）電腦已決定出：' + NAMES[comp] + '；0 之後電腦延遲 ' + delay.toFixed(3) + ' 秒才出（你看得到的緩衝 ' + bufferFor(level).toFixed(3) + ' 秒）'); } catch (e) { }
                setMid('3'); Sfx.play('tick');          /* Sfx.play(名稱)：播放音效（ok 答對、bad 答錯、click 點擊…；音效是程式即時合成的） */
                /* 用 my.after 依序排：0.75 秒顯示 2、1.5 秒顯示 1、2.25 秒開放出拳 */
                my.after(COUNT_MS, function () { setMid('2'); Sfx.play('tick'); });
                my.after(COUNT_MS * 2, function () { setMid('1'); Sfx.play('tick'); });
                my.after(COUNT_MS * 3, function () { openWindow(delay); });
            }
            /* 開放出拳：顯示 0，開始倒數時間條；電腦在 delay 秒後出拳 */
            function openWindow(delay) {
                state = 'open';
                setMid('0');
                Sfx.play('go');
                var t0 = performance.now();             /* performance.now()：高精度的時間（毫秒），計時用 */
                var lp = my.loop(function (now) {       /* my.loop(函式)：每個畫面更新（約每秒 60 次）就執行一次函式；函式回傳 false 就停止 */
                    if (state !== 'open') return false;
                    fill.style.width = (100 * Math.max(0, 1 - (now - t0) / WINDOW_MS)).toFixed(1) + '%';
                });
                R.winLoop = lp;
                /* 電腦在 0 之後 delay 秒出拳（第 1 關是 0 秒，也就是同一刻）*/
                /* 第 1 關延遲接近 0 秒，電腦同一刻出拳 */
                if (delay <= 0.0005) { setComp(comp); Sfx.play('pop'); }
                else R.compTimer = my.after(delay * 1000, function () { if (state === 'open') { setComp(comp); Sfx.play('pop'); } });
                /* 1.0 秒到了玩家還沒出拳 → 慢出，輸 */
                R.winTimer = my.after(WINDOW_MS, function () { if (state === 'open') { lp.stop(); press(null, performance.now()); } });
            }

            /* 玩家按了某個拳（kind 為 null 代表超時沒按） */
            function press(kind, t) {
                if (state === 'count') {
                    /* 0 出現之前就按：搶拳犯規 */
                    /* 0 出現之前就按：搶拳犯規 */
                    if (kind) { state = 'reveal'; fill.style.width = '0%'; btnEls[kind].classList.add('rps-btn--pick'); reveal(kind, 'early'); }
                    return;
                }
                if (state !== 'open') return;
                state = 'reveal';
                my.cancel(R.winTimer); my.cancel(R.compTimer); if (R.winLoop) R.winLoop.stop();
                fill.style.width = '0%';
                if (kind) btnEls[kind].classList.add('rps-btn--pick');
                reveal(kind, kind ? null : 'late');
            }

            /* 揭曉結果：贏了進下一回合、平手重來、輸了結束 */
            function reveal(kind, foul) {
                var res = foul ? -1 : judge(kind, comp);
                setComp(comp);
                setMe(kind, foul === 'late' ? '來不及' : '');
                var msg = foul === 'early' ? '搶拳犯規！要等 0' : (foul === 'late' ? '慢出了…' : (res > 0 ? '你贏了！' : (res < 0 ? '你輸了…' : '平手，重來')));
                setMid(msg, 'rps-big--msg rps-big--' + (res > 0 ? 'win' : (res < 0 ? 'lose' : 'tie')));
                /* 贏 */
                if (res > 0) {
                    wins++;
                    if (Reaction.setBest(ID, wins, function (v, b) { return v > b; })) newRec = true;
                    meta();
                    Sfx.play('win');
                    my.after(G.dev.reveal || REVEAL_MS, play);
                /* 平手：同一關重來 */
                } else if (res === 0) {
                    ties++;
                    Sfx.play('click');
                    my.after(REVEAL_MS - 400, play);
                /* 輸：顯示原因，結算時提供「從失敗關卡 − 5 繼續」 */
                } else {
                    Sfx.play('bad');
                    state = 'over';
                    lastWhy = foul === 'early' ? '在數字 0 出現之前就按了' : (foul === 'late' ? (WINDOW_MS / 1000).toFixed(4) + ' 秒內沒有出拳' : '輸給電腦的' + NAMES[comp]);
                    var failLevel = wins + 1, back = kit.resumeFrom(failLevel);
                    my.after(REVEAL_MS + 300, function () {
                        kit.result(root, {              /* kit.result：顯示結算卡片（成績、評語、再玩一次…），並自動記最佳紀錄、送世界排行榜 */
                            score: wins,        /* 世界排行榜成績（跟 setBest 存的同一個數字） */
                            num: wins + ' 關', label: foul === 'early' ? '太急了' : (foul === 'late' ? '慢了一步' : (wins >= 8 ? '手氣與眼力都好！' : '再試一次')),
                            lines: ['第 ' + failLevel + ' 關：' + lastWhy, '那一關電腦延遲 ' + lastDelay.toFixed(4) + ' 秒才出拳', '共出拳 ' + rounds + ' 回合（平手 ' + ties + ' 次）'],
                            note: '電腦出拳是亂數決定的，不受你影響',
                            isNew: newRec, sfx: wins >= 4 ? 'win' : 'fail',
                            onAgain: function () { round(1); },
                            resume: { level: back, run: function () { round(back); } }
                        });
                    });
                }
            }

            /* G.debug：測試用後門 */
            G.debug = {
                state: function () { return { wins: wins, state: state, comp: comp, ties: ties, rounds: rounds, delay: lastDelay }; },
                press: function (k) { press(k, performance.now()); },
                /* 測試用：指定電腦這回合出什麼 */
                setComp: function (k) { comp = k; },
                beat: function () { return KINDS.find(function (k) { return judge(k, comp) > 0; }); },
                lose: function () { return KINDS.find(function (k) { return judge(k, comp) < 0; }); },
                compShown: function () { return compBody.querySelector('.rps-icon') != null; }  /* querySelector：用 CSS 選擇器在網頁裡找元素 */
            };
            /* 開場等 500 毫秒再開始 */
            my.after(500, play);
        }

        /* V1.34.0：從「個人最佳關卡 − 5」開始（沒玩過就是第 1 關），見 kit.enter（reaction_kit.js） */

        kit.enter(ID, round);
    }

    /* 遊戲身分證 */
    var G = {
        id: ID,
        name: '猜拳必贏',
        rule: '上面倒數 3、2、1、0。**數字變成 0 的時候電腦出拳，你只有 1.0000 秒可以按下「剪刀／石頭／布」**，**太早（還沒到 0）或太慢都算輸**。前面的關卡可以先看電腦出什麼再出，越後面電腦出得越晚，留給你看的時間越短！贏了才能進下一關，平手重來。',
        mount: mount,
        /* 世界排行榜的成績規格 */
        score: SCORE,
        /* dev 是開發用設定 */
        dev: { reveal: null },          /* 開發驗證用：延長公布結果的停留時間 */
        /* test 匯出純函式給 Node 自動測試 */
        test: { judge: judge, randomKind: randomKind, chanceText: chanceText, bufferFor: bufferFor, delayFor: delayFor, KINDS: KINDS, WINDOW_MS: WINDOW_MS, BUFFER_RAMP: BUFFER_RAMP }
    };
    /* 登記到遊戲清單 */
    Reaction.register(G);
})();

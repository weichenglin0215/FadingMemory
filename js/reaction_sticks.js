/* ═══════════════════════════════════════════════════════════════════
   reaction_sticks.js — 秒反應・落下棍子（原「抓住尺子」）
   畫面上方掛著六根垂直的棍子，棍子會在不定的時間點鬆手、以地心引力加速度落下；
   要在棍子掉出畫面下緣之前點到它。每一關只能錯失一根，錯失第二根就失敗。
   ───────────────────────────────────────────────────────────────────
   · 棍長：第 1 關＝場地高度的一半，每過一關 ×0.8（依使用者指定），最短 LEN_MIN。
   · 掉落：棍子頂端的位置是時間的純函式 top(t) = ½·g·t²（t 從鬆手那一刻算起），
     g 也隨關卡線性變大（G_START → G_END）。畫面（rAF）只是把同一個函式畫出來，
     判定在 pointerdown 那一刻用事件時間代進同一個函式算，不看畫面影格。
   · 鬆手時間表：六根棍子的鬆手順序隨機，第一根在 FIRST_MIN～FIRST_MAX 秒內，其後每
     根間隔 GAP_MIN～GAP_MAX 秒（至少 GAP_MIN，確保人來得及反應）。
   · 判定（judgeTap）：
        - 點在還掛著的棍子上，或鬆手後不到 REACT_MIN_S 就點（比人的反應還快＝亂猜）→ 搶按，
          該根算錯失（變橘紅，不再掉落）。
        - 點到正在掉的棍子（棍身上下各放寬 HIT_PAD）→ 接住（變綠，停在原地）。
        - 其餘位置點了沒事。
   · 一根棍子「錯失」＝掉出畫面、或被搶按。一關錯失 ≥ 2 根就結束；六根都處理完且錯失 ≤ 1 就過關。
   · 成績＝通過幾關（越多越好）。
   ═══════════════════════════════════════════════════════════════════ */

/* 【新手導讀：每一款「秒反應」遊戲檔案的共同結構】（其他遊戲檔案都照這個格式，看懂這一份就看得懂全部）
    1. 最上面是 (function () { ... })(); 立即執行函式：把變數關在裡面，不會污染其他檔案。
    2. 「可以自己調的參數」：全是大寫的常數（N、G_START…）。想改難度，只改這一區就好。
    3. 「純函式」：只靠輸入算出輸出、不碰畫面的函式（stickLen、topAt…）。好處是可以不開瀏覽器，直接用
       Node 跑 test/reaction/t_sticks.js 自動測試它們；畫面的程式則放在 mount 裡。
    4. mount(root, ctx)：遊戲真正「開始」的地方。root 是要把畫面畫進去的 HTML 元素，ctx.setMeta(文字)
       可以改標題列右側的小字（例如「第 3 關・最佳 5 關」）。
    5. round()：開一局新遊戲。重玩時再呼叫一次 round()，所以開頭要先把「上一局」的計時器通通清掉
       （kit.round() 做的 dispose）。
    6. G.debug：給瀏覽器主控台／自動測試用的後門，玩家看不到，不影響遊戲。
    7. 最後 Reaction.register(G) 把這款遊戲登記到清單，選單才找得到它。 */
(function () {
    'use strict';

    /* 遊戲的代號（跟檔名 reaction_sticks.js、網址 ?game=sticks、選單 GAME_CELLS 的 id 都要一致） */
    var ID = 'sticks';
    /* UI.h：建立 HTML 元素的小工具（見 js/ui.js）。 */
    var h = UI.h;
    /* kit：Reaction.kit（js/reaction_kit.js）共用工具箱：亂數、動畫迴圈、結算畫面… */
    var kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var N = 6;                  /* 棍子數量 */
    var LEN_FRAC = 0.5;         /* 第 1 關棍長＝場地高度的幾分之幾 */
    var SHRINK = 0.8;           /* 每過一關棍長 ×0.8 */
    var LEN_MIN = 30;           /* 棍長下限（px） */
    var STICK_W = 46;           /* 棍子畫出來的寬度 */
    var HIT_W = 68;             /* 命中範圍的寬度（比畫出來的大，手指好點） */
    var HIT_PAD = 24;           /* 命中範圍上下各放寬多少 px */
    var G_START = 2200, G_END = 4400;   /* 重力加速度（px/秒²），第 1 → RAMP 關線性 */
    var RAMP = 15;
    var REACT_MIN_S = 0.10;     /* 鬆手後不到這麼久就點＝搶按 */
    var FIRST_MIN = 0.9, FIRST_MAX = 2.0;   /* 第一根鬆手時間（秒） */
    var GAP_MIN = 0.5, GAP_MAX = 1.4;       /* 相鄰兩根鬆手的間隔（秒） */
    var MISS_ALLOWED = 1;       /* 一關最多可以錯失幾根（再多一根就失敗） */
    var NEXT_MS = 1100;         /* 過關後多久出下一關 */

    /* 把最佳紀錄格式化成顯示文字；v == null 表示還沒有紀錄，就回傳空字串 */
    function fmtBest(v) { return v == null ? '' : '最佳 ' + v + ' 關'; }

    /* ═══ 純函式（也給 Node 測試用）═══ */
    /* 棍長：第 1 關是場地高度的一半，之後每關乘 0.8（Math.pow(SHRINK, level-1) = 0.8 的 (level-1) 次方），
       Math.max 確保不會短於 LEN_MIN */
    function stickLen(level, FH) { return Math.max(LEN_MIN, FH * LEN_FRAC * Math.pow(SHRINK, level - 1)); }
    /* 重力：kit.ramp 是「線性」難度（從 G_START 平均增加到 G_END），不是越來越快的指數增加 */
    function gravity(level) { return kit.ramp(level, G_START, G_END, RAMP); }
    /* 鬆手後 tSec 秒，棍子頂端往下掉了多少 px */
    /* 自由落體公式 位移 = ½ × g × t²。這就是「棍子在時間 t 掉了多少」的唯一真理，
       畫面和判定都用同一個公式，所以不會因為手機畫面卡頓而判錯 */
    function topAt(g, tSec) { return tSec <= 0 ? 0 : 0.5 * g * tSec * tSec; }
    /* 從鬆手到整根掉出場地下緣（頂端到達 FH）要幾秒 */
    /* 掉到畫面底部要多久：把 ½gt² = FH 解出 t */
    function exitSec(g, FH) { return Math.sqrt(2 * FH / g); }
    /* 鬆手時間表：回傳 [{i, t}]（t 單位秒，依時間遞增），i 是棍子編號 0..N-1 */
    /* 排出六根棍子「何時鬆手」：先把編號 0..5 隨機洗牌，第一根在 FIRST_MIN~MAX 秒，之後每根再加上一個隨機間隔 */
    function makeSchedule(rand) {
        rand = rand || Math.random;
        /* Array.apply(null, Array(N)).map(...) 是產生 [0,1,2,3,4,5] 的老寫法；kit.shuffle 把它洗牌 */
        var order = kit.shuffle(Array.apply(null, Array(N)).map(function (_, k) { return k; }), rand);
        /* t 是累計時間，out 是結果清單 */
        var t = kit.randFloat(FIRST_MIN, FIRST_MAX, rand), out = [];
        /* forEach 依序處理每一根；k > 0 表示不是第一根，就把時間往後加一個間隔 */
        order.forEach(function (i, k) {
            if (k > 0) t += kit.randFloat(GAP_MIN, GAP_MAX, rand);
            out.push({ i: i, t: t });
        });
        return out;
    }
    /* 判定一次點擊。st：{cx, len, relT}（relT＝鬆手時刻 ms，還沒鬆手是 null）；tap：{x, y, t(ms)}
       回傳 'none'（沒點到這根）／'early'（搶按）／'hit'（接住） */
    /* 判定一次點擊：回傳 'none'（沒點到）、'early'（搶按，犯規）、'hit'（接住）三種結果 */
    function judgeTap(st, g, tap) {
        /* 左右偏離棍子中心超過一半命中寬度，就不是點這一根 */
        if (Math.abs(tap.x - st.cx) > HIT_W / 2) return 'none';
        /* relT 是「鬆手時刻」，null 表示棍子還掛著沒掉 */
        if (st.relT == null) {
            return tap.y <= st.len + HIT_PAD ? 'early' : 'none';
        }
        /* dt = 點擊時刻 − 鬆手時刻（毫秒轉成秒） */
        var dt = (tap.t - st.relT) / 1000;
        /* 用同一個公式算出「點擊那一瞬間棍子的位置」 */
        var top = topAt(g, dt);
        if (tap.y < top - HIT_PAD || tap.y > top + st.len + HIT_PAD) return 'none';
        /* 反應時間小於人類極限 REACT_MIN_S（0.10 秒）只可能是亂猜，算搶按 */
        return dt < REACT_MIN_S ? 'early' : 'hit';
    }

    /* mount：遊戲進場點 */
    function mount(root, ctx) {
        /* R 存「目前這一局的生命週期物件」，重玩前先 dispose 掉舊的 */
        var R = null;

        /* startAt：從第幾關開始（預設第 1 關；失敗後可選「從前 5 關繼續」） */
        /* startAt：從第幾關開始（失敗後可從前 5 關繼續）*/
        /* round：開一局新遊戲 */
        function round(startAt) {
            /* 有舊的一局就先清掉（計時器、動畫迴圈都會停） */
            if (R) R.dispose();
            /* kit.round()：建立這一局的「計時器管家」，之後 my.after／my.loop 排的東西，dispose 時自動全部取消 */
            R = kit.round();
            var my = R;
            /* 清空畫面（root 是 reaction.html 的 #screen） */
            root.innerHTML = '';

            /* level 目前關卡；cleared 已通過的關數；newRec 這次有沒有破紀錄；state 目前狀態（idle/play/clear/over）；levelNo 第幾次 startLevel（防止舊計時器亂入） */
            var level = startAt || 1, cleared = level - 1, newRec = false, state = 'idle', levelNo = 0;
            /* 建立標題列和場地兩個 HTML 元素；'stk-head' 等 class 的樣式在 css/reaction2.css */
            var head = h('div', { 'class': 'stk-head' });
            var field = h('div', { 'class': 'stk-field' });
            root.appendChild(head);
            root.appendChild(field);
            var rail = h('div', { 'class': 'stk-rail' });
            field.appendChild(rail);

            /* field.clientWidth／clientHeight：場地實際的寬高（px），要在元素放進頁面「之後」才量得到 */
            var FW = field.clientWidth, FH = field.clientHeight;
            /* sticks：六根棍子的資料；misses：已錯失幾根；resolved：已處理（接住或錯失）幾根；g：這關的重力 */
            var sticks = [], misses = 0, resolved = 0, g = G_START, len = 0, drawLoop = null;

            /* 更新標題列右側的小字：kit.meta 把陣列用「・」串起來並略過空字串 */
            function meta() { ctx.setMeta(kit.meta(['第 ' + level + ' 關', fmtBest(Reaction.getBest(ID))])); }
            /* 更新場地上方那行字 */
            function paintHead() {
                head.textContent = '第 ' + level + ' 關　棍長 ' + Math.round(len) + '　' + (misses ? '已錯失 ' + misses + ' 根' : '還能錯失 ' + MISS_ALLOWED + ' 根');
            }

            /* startLevel：開始（或進入下一關的）一關 */
            function startLevel() {
                /* my.dead 為 true 表示這一局已被丟棄（玩家按了重玩），舊計時器醒來也不能再動作 */
                if (my.dead) return;
                /* levelNo 每關 +1；之後計時器回呼會比對 myLevel === levelNo，確認「這個計時器是這一關排的」 */
                levelNo++;
                var myLevel = levelNo;
                FW = field.clientWidth; FH = field.clientHeight;
                len = stickLen(level, FH);
                g = gravity(level);
                misses = 0; resolved = 0; state = 'play';
                /* 把上一關殘留的棍子元素從畫面移除 */
                sticks.forEach(function (s) { if (s.el.parentNode) s.el.parentNode.removeChild(s.el); });
                sticks = [];
                /* 把場地寬度平均分成 N 欄，每根棍子放在欄的中央 */
                var gap = FW / N;
                for (var i = 0; i < N; i++) {
                    /* 建立棍子元素：寬高與 left 用 style 直接設定（單位 px） */
                    var el = h('div', { 'class': 'stk-stick' });
                    el.style.width = STICK_W + 'px';
                    el.style.height = len + 'px';
                    el.style.left = (gap * (i + 0.5) - STICK_W / 2) + 'px';
                    field.appendChild(el);
                    /* 記下這根棍子的資料：i 編號、el 對應的 HTML 元素、cx 中心 x、len 長度、relT 鬆手時刻、state 狀態（hang 掛著/fall 掉落中/caught 接住/missed 錯失/foul 搶按） */
                    sticks.push({ i: i, el: el, cx: gap * (i + 0.5), len: len, relT: null, state: 'hang', top: 0 });
                }
                /* 產生這關的鬆手時間表 */
                var sched = makeSchedule();
                /* console.info：在瀏覽器主控台印出這關的實際數值（方便除錯與驗證；try/catch 是怕主控台不存在時出錯） */
                try {
                    console.info('[落下棍子] 第 ' + level + ' 關 棍長 ' + len.toFixed(1) + 'px、重力 ' + g.toFixed(0) + ' px/秒²、整根掉出要 ' + exitSec(g, FH).toFixed(3) + ' 秒；鬆手順序 ' +
                        sched.map(function (s) { return '棍' + (s.i + 1) + '@' + s.t.toFixed(2) + 's'; }).join(' '));
                } catch (e) { }
                /* 替每根棍子排一個「到時間就鬆手」的計時器：my.after(毫秒, 函式) */
                sched.forEach(function (s) {
                    /* 比對 myLevel === levelNo：如果玩家已經過關或重玩，舊計時器就什麼都不做 */
                    my.after(s.t * 1000, function () { if (myLevel === levelNo) release(sticks[s.i]); });
                });
                /* 更新文字 */
                paintHead(); meta();
                /* 如果之前有一個畫面更新迴圈，先停掉 */
                if (drawLoop) drawLoop.stop();
                /* my.loop：每一個畫面更新（約 60 次／秒）呼叫一次，回傳 false 就停止 */
                drawLoop = my.loop(function (now) {
                    if (myLevel !== levelNo) return false;
                    sticks.forEach(function (s) {
                        if (s.state === 'fall' || s.state === 'missed' && s.relT != null) {
                            /* 用公式算出現在棍子掉了多少，再用 CSS transform: translateY 移動棍子（比改 top 更順暢） */
                            s.top = topAt(g, (now - s.relT) / 1000);
                            s.el.style.transform = 'translateY(' + s.top.toFixed(1) + 'px)';
                        }
                    });
                });
            }

            /* release：把一根棍子「鬆手」，從現在開始算它掉落 */
            function release(s) {
                if (state !== 'play' || s.state !== 'hang') return;
                s.state = 'fall';
                /* performance.now() 是高精度時間（毫秒）；之後所有掉落位置都用「現在 − relT」算出來 */
                s.relT = performance.now();
                /* Sfx.play('tick')：播放音效（js/sfx.js） */
                Sfx.play('tick');
                /* 排一個計時器：掉出畫面下緣那一刻還沒被接住，就算錯失 */
                my.after(exitSec(g, FH) * 1000 + 40, function () { if (s.state === 'fall') lose(s, false); });
            }

            /* resolve：有一根棍子「處理完」（接住或錯失）時呼叫，檢查這關有沒有結束 */
            function resolve() {
                resolved++;
                paintHead();
                /* 錯失超過 MISS_ALLOWED 根就立刻失敗 */
                if (misses > MISS_ALLOWED) { endLevel(false); return; }
                /* 六根都處理完 → 過關 */
                if (resolved >= N) endLevel(true);
            }
            /* 接住一根：停在原地、變綠、播音效 */
            function catchStick(s, now) {
                s.state = 'caught';
                s.top = topAt(g, (now - s.relT) / 1000);
                s.el.style.transform = 'translateY(' + s.top.toFixed(1) + 'px)';
                s.el.classList.add('stk-stick--ok');
                Sfx.play('ok');
                resolve();
            }
            /* 錯失一根（foul＝true 代表是搶按）：變橘紅，錯失數 +1 */
            function lose(s, foul) {
                if (s.state === 'caught' || s.state === 'missed' || s.state === 'foul') return;
                s.state = foul ? 'foul' : 'missed';
                s.el.classList.add('stk-stick--bad');
                Sfx.play('bad');
                misses++;
                resolve();
            }

            /* 一關結束：ok 為 true 過關，否則失敗 */
            function endLevel(ok) {
                if (state !== 'play') return;
                state = ok ? 'clear' : 'over';
                if (ok) {
                    /* Reaction.setBest：存最佳紀錄，第三個參數是「新值是否比舊值好」的比較函式；回傳是否破紀錄 */
                    cleared = level;
                    if (Reaction.setBest(ID, cleared, function (v, b) { return v > b; })) newRec = true;
                    meta();
                    Sfx.play('win');
                    head.textContent = '第 ' + level + ' 關過關！';
                    level++;
                    /* 等一下（NEXT_MS 毫秒）再開始下一關 */
                    my.after(NEXT_MS, startLevel);
                } else {
                    /* 還沒掉完的棍子讓它繼續掉，玩家看得到是哪幾根沒接到 */
                    my.after(1200, function () {
                        /* kit.resumeFrom：失敗後「從失敗關卡往前 5 關」可繼續玩的起點 */
                        var back = kit.resumeFrom(level);
                        /* kit.result：顯示結算畫面（成績、評語、再玩一次、從某關繼續…） */
                        kit.result(root, {
                            num: cleared + ' 關',
                            label: cleared >= 8 ? '眼明手快！' : (cleared >= 4 ? '反應不錯！' : '再試一次，會更快！'),
                            lines: ['第 ' + level + ' 關錯失了 ' + misses + ' 根棍子', '那一關棍長 ' + Math.round(len) + ' px'],
                            isNew: newRec, sfx: cleared >= 6 ? 'win' : 'fail', onAgain: function () { round(1); },
                            resume: { level: back, run: function () { round(back); } }
                        });
                    });
                }
            }

            /* 一次點擊的處理：先找是點哪一根，再判定 */
            /* 一次點擊：先找哪一欄，再判定 */
            function handleTap(x, y, t) {
                /* 遊戲不在進行中就不處理 */
                if (state !== 'play') return null;
                for (var k = 0; k < sticks.length; k++) {
                    var s = sticks[k];
                    if (s.state !== 'hang' && s.state !== 'fall') continue;
                    var r = judgeTap(s, g, { x: x, y: y, t: t });
                    if (r === 'hit') { catchStick(s, t); return 'hit'; }
                    if (r === 'early') { lose(s, true); return 'early'; }
                }
                return 'none';
            }
            /* pointerdown 比 click 更即時（手指一碰到螢幕就觸發，不用等放開），計時遊戲一定要用它 */
            field.addEventListener('pointerdown', function (e) {
                /* preventDefault：阻止瀏覽器的預設行為（例如雙擊縮放、長按選單） */
                e.preventDefault();
                /* kit.localPt：把螢幕座標換算成場地內的座標 */
                var p = kit.localPt(e, field);
                /* kit.evT(e)：取得事件的精確時間 */
                handleTap(p.x, p.y, kit.evT(e));
            });

            /* G.debug：除錯／測試用後門，下面的函式讓自動測試可以「假裝玩家」操作 */
            G.debug = {
                state: function () { return { level: level, state: state, misses: misses, resolved: resolved, cleared: cleared, len: len, g: g, FH: FH, sticks: sticks.map(function (s) { return s.state; }) }; },
                /* 模擬在第 i 根掉下去 sec 秒後點它（還沒鬆手就用 sec＝null 當搶按） */
                tapStick: function (i, secAfterRelease) {
                    var s = sticks[i];
                    if (!s) return 'no';
                    var t = s.relT == null ? performance.now() : s.relT + secAfterRelease * 1000;
                    var top = s.relT == null ? 0 : topAt(g, secAfterRelease);
                    return handleTap(s.cx, top + s.len / 2, t);
                },
                /* 接住目前所有正在掉的棍子（反應 0.25 秒） */
                catchFalling: function () {
                    var n = 0;
                    sticks.forEach(function (s, i) { if (s.state === 'fall') { var r = G.debug.tapStick(i, Math.max(REACT_MIN_S + 0.05, (performance.now() - s.relT) / 1000)); if (r === 'hit') n++; } });
                    return n;
                },
                releaseAll: function () { sticks.forEach(function (s) { release(s); }); }
            };
            /* 開場等 500 毫秒再開始第一關，讓玩家有準備時間 */
            my.after(500, startLevel);
        }

        /* 進場就開第 1 關 */
        round(1);
    }

    /* 遊戲的「身分證」：id 代號、name 顯示名稱、rule 規則說明、mount 進場函式、test 給 Node 測試用的函式 */
    var G = {
        id: ID,
        name: '落下棍子',
        rule: '上面掛著六根棍子，會在不同時間掉下來。要在棍子掉出畫面之前點到它！點到還沒掉的棍子也算錯失。每一關只能錯失一根，棍子會越來越短喔！',
        mount: mount,
        test: { stickLen: stickLen, gravity: gravity, topAt: topAt, exitSec: exitSec, makeSchedule: makeSchedule, judgeTap: judgeTap, N: N, GAP_MIN: GAP_MIN, REACT_MIN_S: REACT_MIN_S, HIT_W: HIT_W, HIT_PAD: HIT_PAD, MISS_ALLOWED: MISS_ALLOWED }
    };
    /* 把這款遊戲登記到清單（js/reaction_core.js） */
    Reaction.register(G);
})();

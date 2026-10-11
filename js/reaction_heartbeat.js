/* ═══════════════════════════════════════════════════════════════════
   reaction_heartbeat.js — 秒反應・心跳複製
   畫面中央有左／中／右三個位置，每一拍會冒出幾顆球（只有中、只有左、只有右、中＋左、中＋右、
   三顆全出，或是這拍什麼都沒有），球外面有一圈倒數圈，要在圈跑完之前點到球。
   好玩的地方：先給你一段很有規律的節奏，讓你養成習慣，然後突然打破它。
   ───────────────────────────────────────────────────────────────────
   【節奏引擎】（makeSegment／Generator）
     一段 = 「循環」重複好幾次 + 一拍「打破規律」：
       · 循環 cycle：長度 K = 1（同一個位置一直出）／2（兩種輪流）／3（左中右之類的輪替）；
         每相鄰兩拍不同，所以規律是「重複 cyc 輪」。
       · 打破 break：循環預期的下一拍被換成別的：
            - 'none'  這一拍什麼都沒有（機率 0.2 → 0.4 隨進度線性上升）
            - 別的組合（沒預期的位置；有時「多一顆球」或「少一顆球」的近似組合）
         打破之後接新的一段（有 30% 機率回到剛剛的規律，讓人以為又穩了）。
       · 規律的長度（打破之前有幾拍）從 BODY_START(3) 線性增加到 BODY_END(7)（±1 隨機）。
         養成習慣越久，被打破時越容易按錯。
       · 組合種類隨進度解鎖：一開始只有「中、左、右」單顆；第 DOUBLE_FROM 拍起加入「中＋左、中＋右」，
         第 TRIPLE_FROM 拍起加入「三顆」；雙顆、三顆的權重也線性增加。
   【速度】拍子間隔從 1.0 秒線性加快到 0.3 秒（第 RAMP_BEATS 拍起維持 0.3）。
     兩顆以上要全部點完才算過，所以那一拍的圈圈時間多給 0.1 秒 × (球數 − 1)：
        這一拍到下一拍的間隔 = 基本間隔 + 0.1 × (球數 − 1)，圈圈剛好在下一拍出現時跑完。
   【規則】點到球 = 打中；點到「沒有球的位置」（包括這拍根本沒球的時候）或球的圈跑完了 = 失誤。
     有 LIVES 次機會。成績 = 撐過幾次心跳（沒球的空拍也算）。
   ═══════════════════════════════════════════════════════════════════ */

/* （檔案結構說明見 js/reaction_sticks.js 開頭的「新手導讀」） */
(function () {
    'use strict';

    var ID = 'heartbeat';

    /* 世界排行榜的成績規格（欄位說明見 js/leaderboard.js 開頭）；資料庫 MF_games 裡 heartbeat 那一列要一致
       （node test/leaderboard/gen_games_sql.cjs 會從這裡產生 insert，test/reaction/t_leaderboard.js 會檢查兩邊是否一致）。 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 拍', label: '撐過拍數', min: 1, max: 1000 };
    var h = UI.h;
    var kit = Reaction.kit;

    /* 設定集中在這一區 */
    /* ═══ 可以自己調的參數 ═══ */
    /* 難度隨拍數線性變化到第 RAMP_BEATS 拍 */
    var RAMP_BEATS = 60;                   /* 第幾拍起維持最快 */
    /* 拍子的基本間隔：1 秒線性縮短到 0.3 秒 */
    var INT_START = 1.0, INT_END = 0.3;    /* 基本間隔（秒） */
    /* 同一拍多一顆球就多給 0.1 秒（兩顆以上要全部點完） */
    var EXTRA_PER_BALL = 0.1;              /* 多一顆球多給幾秒 */
    var BODY_START = 3, BODY_END = 7;      /* 打破規律之前的拍數 */
    var NONE_START = 0.2, NONE_END = 0.4;  /* 打破時「什麼都沒有」的機率 */
    /* 第 10 拍起出現雙顆組合，第 25 拍起出現三顆組合 */
    var DOUBLE_FROM = 10, TRIPLE_FROM = 25;
    var RETURN_P = 0.3;                    /* 打破之後回到原規律的機率 */
    var LIVES = 3;
    var GRACE_MS = 160;                    /* 球被點掉後，同一個位置多久內再點不算失誤（雙擊保護） */
    /* 三個位置：左（L）、中（C）、右（R） */
    var SLOTS = ['L', 'C', 'R'];
    /* 組合表：每種組合包含哪幾個位置（0 左、1 中、2 右） */
    var COMBOS = { C: [1], L: [0], R: [2], CL: [0, 1], CR: [1, 2], LCR: [0, 1, 2] };

    /* 最佳紀錄文字 */
    function fmtBest(v) { return v == null ? '' : '最佳 ' + v + ' 拍'; }

    /* 心形的 SVG 路徑（M 移動、C 曲線、Z 封閉） */
    /* 心形（以原點為中心，寬約 ±37、高約 −27～40，再由 mount 縮放並上移到視覺中心）*/
    var HEART_D = 'M0,40 C-60,0 -38,-42 0,-14 C38,-42 60,0 0,40 Z';

    /* 純函式（也給 Node 測試用） */
    /* ═══ 純函式（也給 Node 測試用）═══ */
    /* 第 beatNo 拍的基本間隔 */
    function baseInterval(beatNo) { return kit.ramp(beatNo, INT_START, INT_END, RAMP_BEATS); }
    /* 這一拍到下一拍的間隔＝基本間隔＋多出的球數×0.1 秒 */
    function spacingFor(beatNo, nBalls) { return baseInterval(beatNo) + EXTRA_PER_BALL * Math.max(0, nBalls - 1); }
    /* 把組合代號轉成球的位置清單 */
    function ballsOf(combo) { return combo === 'none' ? [] : COMBOS[combo]; }

    /* 進度 beatNo 時可以出的組合與權重（權重越大越容易被抽到），雙顆、三顆的權重隨進度增加 */
    /* 進度 beatNo 時可以出的組合與權重 */
    function pool(beatNo) {
        var p = [{ c: 'C', w: 1 }, { c: 'L', w: 1 }, { c: 'R', w: 1 }];
        if (beatNo >= DOUBLE_FROM) {
            var d = kit.ramp(beatNo, 0.2, 0.9, RAMP_BEATS);
            p.push({ c: 'CL', w: d }, { c: 'CR', w: d });
        }
        if (beatNo >= TRIPLE_FROM) p.push({ c: 'LCR', w: kit.ramp(beatNo, 0.1, 0.5, RAMP_BEATS) });
        return p;
    }
    /* 加權抽籤：把所有權重加總，亂數 × 總和，再逐項扣權重，扣到 ≤0 的那一項被選中 */
    function pickWeighted(p, rand, exclude) {
        var list = p.filter(function (x) { return !exclude || exclude.indexOf(x.c) < 0; });
        var sum = list.reduce(function (s, x) { return s + x.w; }, 0), r = rand() * sum;
        for (var i = 0; i < list.length; i++) { r -= list[i].w; if (r <= 0) return list[i].c; }
        return list[list.length - 1].c;
    }
    /* 產生「循環」：K 個組合重複，相鄰的（包含頭尾）都不同 */
    /* 循環：K 個組合，相鄰（含頭尾）都不同 */
    function makeCycle(beatNo, rand) {
        var wk2 = kit.ramp(beatNo, 0, 0.8, RAMP_BEATS), wk3 = beatNo >= 20 ? kit.ramp(beatNo, 0, 0.6, RAMP_BEATS) : 0;
        var r = rand() * (1 + wk2 + wk3), K = r < 1 ? 1 : (r < 1 + wk2 ? 2 : 3);
        var p = pool(beatNo), cyc = [];
        for (var i = 0; i < K; i++) {
            var ex = [];
            if (i > 0) ex.push(cyc[i - 1]);
            if (i === K - 1 && K > 1) ex.push(cyc[0]);
            cyc.push(pickWeighted(p, rand, ex));
        }
        return cyc;
    }
    /* 產生「打破規律」的那一拍：可能是空拍，或是和預期差一顆球的近似組合，或隨機別的組合 */
    /* 打破規律的那一拍：expected 是循環預期的下一拍 */
    function makeBreak(beatNo, expected, rand) {
        var pNone = kit.ramp(beatNo, NONE_START, NONE_END, RAMP_BEATS);
        if (rand() < pNone) return 'none';
        var p = pool(beatNo);
        /* 30% 用「近似」的組合：跟預期差一顆球（多一顆或少一顆） */
        if (rand() < 0.3) {
            var near = Object.keys(COMBOS).filter(function (c) {
                if (c === expected || p.every(function (x) { return x.c !== c; })) return false;
                var a = COMBOS[c], b = COMBOS[expected];
                var inter = a.filter(function (x) { return b.indexOf(x) >= 0; }).length;
                return inter > 0 && Math.abs(a.length - b.length) === 1;
            });
            if (near.length) return near[Math.floor(rand() * near.length)];
        }
        return pickWeighted(p, rand, [expected]);
    }
    /* 產生一段節奏：規律重複好幾拍，最後一拍打破規律 */
    /* 一段：回傳 combo 陣列（最後一個是打破的那一拍，可能是 'none'） */
    function makeSegment(beatNo, rand, cycle) {
        rand = rand || Math.random;
        cycle = cycle || makeCycle(beatNo, rand);
        /* 規律的長度：隨進度從 3 拍增加到 7 拍（±1）；習慣養成越久，被打破時越容易按錯 */
        var target = kit.ramp(beatNo, BODY_START, BODY_END, RAMP_BEATS) + kit.randInt(-1, 1, rand);
        var cyc = Math.max(cycle.length > 1 ? 2 : 1, Math.round(target / cycle.length));
        var body = [];
        for (var i = 0; i < cyc; i++) body = body.concat(cycle);
        /* 開頭至少 3 拍規律，才有「習慣」可以破 */
        while (body.length < 3) body = body.concat(cycle);
        var expected = cycle[body.length % cycle.length];
        return { cycle: cycle, body: body, brk: makeBreak(beatNo, expected, rand), expected: expected };
    }
    /* 拍子產生器（用建構函式 function Generator 寫成的物件）：next() 每次給出下一拍 */
    /* 拍子產生器：next() 每次給下一拍 {combo, kind:'body'|'break', seg}，beatNo 由呼叫端給 */
    function Generator(rand) {
        rand = rand || Math.random;
        var queue = [], lastCycle = null;
        /* 佇列 queue 空了就產生新的一段，把整段拍子排進去 */
        this.next = function (beatNo) {
            if (!queue.length) {
                var cycle = (lastCycle && rand() < RETURN_P) ? lastCycle : null;
                var seg = makeSegment(beatNo, rand, cycle);
                lastCycle = seg.cycle;
                seg.body.forEach(function (c, i) { queue.push({ combo: c, kind: 'body', seg: seg, i: i }); });
                queue.push({ combo: seg.brk, kind: 'break', seg: seg, i: seg.body.length });
            }
            return queue.shift();
        };
    }

    /* mount：遊戲進場點 */
    function mount(root, ctx) {
        var R = null;

        /* round：開一局 */
        function round() {
            if (R) R.dispose();
            R = kit.round();
            var my = R;
            root.innerHTML = '';
            /* beatNo 目前第幾拍；cleared 撐過幾拍；lives 機會；state 目前階段 */
            var beatNo = 0, cleared = 0, lives = LIVES, newRec = false, state = 'idle';
            var gen = new Generator();
            /* alive：每個位置目前正在倒數的球；ghost：已被點掉的球，圈圈繼續跑完；pending：每拍還沒點完的球數 */
            var alive = [null, null, null];             /* 每個位置目前的球：{born, life, beat, el, ring} */
            var ghost = [null, null, null];             /* 已經點掉（或空拍）、只剩倒數圈還在跑的：到下一拍出現才移除 */
            var lastPop = [0, 0, 0];
            var pending = {};                           /* 每一拍還沒點完的球數：beatIdx → 剩幾顆 */
            var nextAt = 0, timerId = null;
            /* 操作提示（只在第一次進遊戲時）：第一顆心出現時，手指縮放擺在那顆心上（見 spawnBeat）；玩家第一次碰畫面就不再提示 */
            var hintWanted = Reaction.kit.once('heartbeat.hint'), hintObj = null;
            root.addEventListener('pointerdown', function () { hintWanted = false; }, { capture: true, once: true });

            /* 建立畫面元素：標題、場地 */
            var head = h('div', { 'class': 'hb-head' });
            var field = h('div', { 'class': 'hb-field' });
            root.appendChild(head);
            root.appendChild(field);
            var W = field.clientWidth, Hh = field.clientHeight;
            /* SVG 畫布：左中右三個位置各畫一個空圓圈（球要出現的位置） */
            var svg = kit.svg('svg', { 'class': 'hb-svg', viewBox: '0 0 ' + W + ' ' + Hh }, field);
            var CY = Hh / 2, RB = 52, RR = 66, CIRC = 2 * Math.PI * RR;
            var xs = [W * 0.2, W * 0.5, W * 0.8];
            var slotG = [];
            for (var i = 0; i < 3; i++) {
                (function (i) {
                    var g = kit.svg('g', { transform: 'translate(' + xs[i].toFixed(1) + ' ' + CY.toFixed(1) + ')' }, svg);
                    kit.svg('circle', { 'class': 'hb-slot', r: RB }, g);
                    slotG.push(g);
                })(i);
            }
            var hurt = h('div', { 'class': 'hb-hurt' });
            field.appendChild(hurt);

            /* 更新標題列右側的小字 */
            function meta() { ctx.setMeta(kit.meta(['機會 ' + lives, fmtBest(Reaction.getBest(ID))])); }
            function paintHead(extra) {
                head.textContent = '撐過 ' + cleared + ' 拍　每拍 ' + baseInterval(beatNo).toFixed(4) + ' 秒' + (extra ? '　' + extra : '');
            }
            meta(); paintHead();

            /* 發球：依這一拍的組合在對應位置畫出心形與倒數圈 */
            /* ─── 發球 ─── */
            function spawnBeat(plan) {
                var balls = ballsOf(plan.combo), n = balls.length;
                if (hintObj) { hintObj.remove(); hintObj = null; }
                var spacing = spacingFor(beatNo, n);
                var idx = beatNo;
                Sfx.play('kick');
                try {
                    console.info('[心跳複製] 第 ' + (idx + 1) + ' 拍 ' + (plan.kind === 'break' ? '【打破規律】' : '規律') + ' 組合=' + plan.combo + ' 間隔 ' + spacing.toFixed(3) + ' 秒' +
                        (plan.kind === 'break' ? '（預期是 ' + plan.seg.expected + '，規律已重複 ' + plan.seg.body.length + ' 拍，循環 ' + plan.seg.cycle.join('→') + '）' : ''));
                } catch (e) { }
                pending[idx] = n;
                var now = performance.now();
                /* 上一拍留下的倒數圈，在這一拍出現時一起收掉 */
                clearGhosts();                           /* 上一拍留下的倒數圈，這一拍出現就收掉（它剛好也在這一刻跑完）*/
                balls.forEach(function (s) {
                    if (alive[s]) expire(s, true);       /* 同位置還有舊球（不應該發生，保險） */
                    var g = kit.svg('g', { 'class': 'hb-ball hb-ball--' + SLOTS[s] }, slotG[s]);
                    kit.svg('path', { 'class': 'hb-ball__body', d: HEART_D, transform: 'translate(0 -8) scale(1.3)' }, g);
                    /* 倒數圈：用 SVG 圓的 stroke-dasharray／stroke-dashoffset 做出「圈慢慢消失」的效果 */
                    var ring = kit.svg('circle', { 'class': 'hb-ring', r: RR, 'stroke-dasharray': CIRC.toFixed(1), 'stroke-dashoffset': 0, transform: 'rotate(-90)' }, g);
                    var b = { born: now, life: spacing * 1000, beat: idx, el: g, ring: ring, slot: s };
                    alive[s] = b;
                    if (hintWanted && !hintObj) hintObj = Reaction.kit.hintOn(root, g, { mode: 'tap', text: '請點擊出現的愛心' });
                    b.timer = my.after(b.life, function () { if (alive[s] === b) expire(s, false); });
                });
                beatNo++;
                /* 空拍：中間畫一個沒有心的空倒數圈，讓節拍看得見，這一拍結束就算撐過 */
                if (n === 0) {
                    /* 空拍：中間畫一個沒有心的空倒數圈（讓節拍看得見），這一拍結束就算撐過 */
                    var eg = kit.svg('g', { 'class': 'hb-ball hb-ball--E' }, slotG[1]);
                    var er = kit.svg('circle', { 'class': 'hb-ring hb-ring--empty', r: RR, 'stroke-dasharray': CIRC.toFixed(1), 'stroke-dashoffset': 0, transform: 'rotate(-90)' }, eg);
                    ghost[1] = { born: now, life: spacing * 1000, beat: idx, el: eg, ring: er, slot: 1 };
                    my.after(spacing * 1000, function () { if (state === 'run') beatDone(idx); });
                }
                paintHead(plan.combo === 'none' ? '這拍沒有球' : '');
                /* 排程下一拍：絕對時間 nextAt 累加（不是現在+間隔），所以不會累積誤差 */
                nextAt += spacing * 1000;
                timerId = my.after(Math.max(0, nextAt - performance.now()), nextBeat);
            }
            function nextBeat() {
                if (state !== 'run') return;
                spawnBeat(gen.next(beatNo));
            }
            function beatDone(idx) {
                cleared++;
                if (Reaction.setBest(ID, cleared, function (v, b) { return v > b; })) newRec = true;
                meta(); paintHead();
            }

            /* 點擊 */
            /* ─── 點擊 ─── */
            /* 依手指的 x 座標判斷點在左、中、右哪一格（把場地三等分） */
            function slotOf(e) {
                var p = field.getBoundingClientRect(), x = (e.clientX - p.left) / p.width;
                return x < 1 / 3 ? 0 : (x < 2 / 3 ? 1 : 2);
            }
            field.addEventListener('pointerdown', function (e) {
                if (state !== 'run') return;
                e.preventDefault();
                tap(slotOf(e), kit.evT(e));
            });
            /* 玩家點了第 s 個位置：有球就打中，沒球就失誤（剛點掉的球 160ms 內再點不算，雙擊保護） */
            function tap(s, t) {
                if (state !== 'run') return;
                var b = alive[s];
                if (b) {
                    kill(s, 'hit');
                    Sfx.play('note' + SLOTS[s]);
                    lastPop[s] = performance.now();
                    if (--pending[b.beat] === 0) beatDone(b.beat);
                } else {
                    if (performance.now() - lastPop[s] < GRACE_MS) return;       /* 剛點掉的球，雙擊保護 */
                    mistake('點到沒有球的位置');
                    flashSlot(s, 'hb-slot--bad');
                }
            }
            function clearGhosts() {
                for (var s = 0; s < 3; s++) {
                    var g = ghost[s];
                    if (g) { if (g.el.parentNode) g.el.parentNode.removeChild(g.el); ghost[s] = null; }
                }
            }
            /* 移除球：打中時心消失、圈留在原地變綠色；沒打中時整顆淡出 */
            function kill(s, how) {
                var b = alive[s];
                if (!b) return;
                my.cancel(b.timer);
                alive[s] = null;
                if (how === 'hit') {
                    /* 心在原位消失，倒數圈留在原位（變綠色）繼續跑完，下一拍要等圈跑完才出現 */
                    var heart = b.el.querySelector('.hb-ball__body');
                    if (heart && heart.parentNode) heart.parentNode.removeChild(heart);
                    b.ring.classList.remove('hb-ring--late');
                    b.ring.classList.add('hb-ring--done');
                    ghost[s] = b;
                    return;
                }
                b.el.classList.add('hb-ball--miss');
                my.after(260, function () { if (b.el.parentNode) b.el.parentNode.removeChild(b.el); });
            }
            /* 球的倒數圈跑完還沒點到：失誤 */
            function expire(s, silent) {
                var b = alive[s];
                if (!b) return;
                kill(s, 'miss');
                if (!silent) { pending[b.beat] = -999; mistake('球的圈圈跑完了'); }
            }
            function flashSlot(s, cls) {
                slotG[s].firstChild.classList.add(cls);
                my.after(260, function () { slotG[s].firstChild.classList.remove(cls); });
            }
            var mlog = [];
            /* 失誤：扣一次機會、閃紅光，機會用完就結束 */
            function mistake(why) {
                if (state !== 'run') return;
                lives--;
                mlog.push({ beat: beatNo, why: why, alive: alive.map(function (b) { return b ? b.beat : null; }), t: Math.round(performance.now()) });
                Sfx.play('bad');
                hurt.classList.remove('hb-hurt--on'); void hurt.offsetWidth; hurt.classList.add('hb-hurt--on');
                meta();
                paintHead(why);
                if (lives <= 0) gameOver(why);
            }
            /* 遊戲結束：顯示結算 */
            function gameOver(why) {
                state = 'over';
                my.cancel(timerId);
                for (var s = 0; s < 3; s++) if (alive[s]) { my.cancel(alive[s].timer); }
                my.after(900, function () {
                    kit.result(root, {
                        score: cleared,        /* 世界排行榜成績（跟 setBest 存的同一個數字） */
                        num: cleared + ' 拍', label: '節奏亂掉了',
                        lines: ['最後一拍：' + why, '最快的間隔 ' + baseInterval(beatNo).toFixed(4) + ' 秒'],
                        isNew: newRec, sfx: cleared >= 30 ? 'win' : 'fail', onAgain: round
                    });
                });
            }

            /* 圈圈用 rAF 每個畫面更新（只是畫面）；判定靠 setTimeout 才準 */
            /* 圈圈用 rAF 每影格更新（只是畫面；判定靠 setTimeout） */
            my.loop(function (now) {
                if (state === 'over') return false;
                for (var s = 0; s < 3; s++) {
                    var b = alive[s];
                    if (b) {
                        var f = Math.min(1, (now - b.born) / b.life);
                        b.ring.setAttribute('stroke-dashoffset', (CIRC * f).toFixed(1));
                        b.ring.classList.toggle('hb-ring--late', f > 0.7);
                    }
                    var gh = ghost[s];
                    if (gh) gh.ring.setAttribute('stroke-dashoffset', (CIRC * Math.min(1, (now - gh.born) / gh.life)).toFixed(1));
                }
            });

            /* 開始：先等 1.2 秒讓玩家就位，再來第一拍 */
            /* ─── 開始：先等一下，讓玩家就位，再來第一拍 ─── */
            head.textContent = '準備…看球出現在哪就點哪';
            my.after(1200, function () {
                state = 'run';
                nextAt = performance.now();
                nextBeat();
            });

            /* G.debug：測試用後門，autoplay 可以自動全部點對 */
            G.debug = {
                state: function () { return { state: state, beatNo: beatNo, cleared: cleared, lives: lives, alive: alive.map(function (b) { return b ? b.beat : null; }), ghost: ghost.map(function (b) { return b ? b.beat : null; }), pending: pending }; },
                tap: function (s) { tap(s, performance.now()); },
                aliveSlots: function () { return alive.map(function (b, i) { return b ? i : -1; }).filter(function (x) { return x >= 0; }); },
                /* 自動全部點對（用在測試）：每 40ms 檢查有球就點 */
                autoplay: function (on) {
                    if (R.auto) { clearInterval(R.auto); R.auto = null; }
                    if (on) R.auto = setInterval(function () { G.debug.aliveSlots().forEach(function (s) { tap(s, performance.now()); }); }, 20);
                },
                gen: gen,
                mlog: mlog
            };
            my.onDispose(function () { if (R.auto) clearInterval(R.auto); });
        }

        round();
    }

    /* 遊戲身分證 */
    var G = {
        id: ID,
        name: '心跳複製',
        rule: '左、中、右三個位置會冒出球（有時一顆、有時兩顆、有時三顆，有時這一拍什麼都沒有），球外面有一圈倒數圈，**要在圈跑完之前點到球**。節奏一開始很規律，然後會突然改變！拍子越來越快，兩顆以上要全部點完。**點到沒有球的位置、或圈跑完了，都會失去一次機會**。',
        mount: mount,
        /* 世界排行榜的成績規格 */
        score: SCORE,
        /* test 匯出純函式給 Node 自動測試 */
        test: { baseInterval: baseInterval, spacingFor: spacingFor, pool: pool, makeCycle: makeCycle, makeBreak: makeBreak, makeSegment: makeSegment, Generator: Generator, COMBOS: COMBOS, ballsOf: ballsOf, RAMP_BEATS: RAMP_BEATS }
    };
    /* 登記到遊戲清單 */
    Reaction.register(G);
})();

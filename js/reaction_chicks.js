/* ═══════════════════════════════════════════════════════════════════
   reaction_chicks.js — 秒反應・找回小雞
   幾隻小雞頭上有星星（2 秒），星星消失後大家在院子裡亂跑，停下來後，直接點剛才有星星的那幾隻。
   ───────────────────────────────────────────────────────────────────
   · 起點：一開始任兩隻都不重疊（距離 ≥ MIN_START_DIST，比小雞本身 CHICK 還大一點，頭上的星星也不會被壓住）；
     用拒絕取樣擺放，擺不下就把最小距離慢慢縮小（最小不低於 CHICK + 2），再不行才改用六角形格子。
     移動過程中小雞可以互相穿過、互相遮住。
   · 路線（makePath）：近似直線的「折線」——從起點出發，一段一段往院子裡隨機挑的遠處走（每段至少 MIN_LEG px），
     最後走到停止位置；整條路線的長度約 ＝ 速度 × 移動秒數，所以速度越快、走過的範圍越大，不會縮在小角落。
     位置是時間的純函式 posAt(c, t)（等速沿著折線走，t ≥ T 就停在終點），畫面只是照函式畫。
   · 停止位置：六角形格子隨機挑 n 格再抖動一點，任兩隻的距離 ≥ MIN_STOP_DIST，才點得到、也不會互相壓住。
   · 流程：標記 MARK_S 秒（目標頭上有星星，星星在最上層不會被別的小雞遮住）→ 移動 T 秒 → 停下 →
     **只有星星小雞可以點**（其他小雞沒有點擊功能）：點到一隻星星小雞就亮綠色；點到沒有星星的地方（包含別的小雞、空地）
     就失敗；星星小雞全部點到就過關。
   · 難度（第 1 → LEVEL_RAMP 關線性）：目標數 K_START → K_END、小雞總數 TOTAL_START → TOTAL_END、速度、移動秒數。
   · 有 LIVES 次機會，成績＝通過關數（越多越好）；失敗後可從「失敗關卡 − 5」繼續。
   ═══════════════════════════════════════════════════════════════════ */

/* （檔案結構說明見 js/reaction_sticks.js 開頭的「新手導讀」） */
(function () {
    'use strict';

    var ID = 'chicks';

    /* 世界排行榜的成績規格（欄位說明見 js/leaderboard.js 開頭）；資料庫 MF_games 裡 chicks 那一列要一致
       （node test/leaderboard/gen_games_sql.cjs 會從這裡產生 insert，test/reaction/t_leaderboard.js 會檢查兩邊是否一致）。 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 200 };
    var h = UI.h;
    var kit = Reaction.kit;

    /* 設定集中在這一區 */
    /* ═══ 可以自己調的參數 ═══ */
    var LEVEL_RAMP = 30;
    /* 目標數、小雞總數、速度、移動秒數都隨關卡線性增加 */
    var K_START = 1, K_END = 8;                 /* 目標數 */
    var TOTAL_START = 12, TOTAL_END = 24;       /* 小雞總數 */
    var SPEED_START = 120, SPEED_END = 360;     /* 速度（px/秒，沿著折線的平均速度）*/
    var MOVE_START = 6, MOVE_END = 9;          /* 移動秒數 */
    var MARK_S = 2.0;
    /* 小雞畫出來的大小（px） */
    var CHICK = 64;                            /* 小雞畫出來的大小 */
    /* 起點與停止位置的最小間距：保證一開始不重疊、停下來時也點得到 */
    var MIN_START_DIST = 74, MIN_STOP_DIST = 80;
    /* 折線每一段至少多長（走法接近直線、活動範圍大） */
    var MIN_LEG = 90;                          /* 折線每一段至少多長（px）：走法接近直線、範圍大 */
    var MARGIN = 30;
    var LIVES = 3;
    var NEXT_MS = 1500;

    function fmtBest(v) { return v == null ? '' : '最佳 ' + v + ' 關'; }

    /* ═══ 純函式（也給 Node 測試用）═══ */
    /* 這一關的目標數 */
    function kFor(level) { return Math.round(kit.ramp(level, K_START, K_END, LEVEL_RAMP)); }
    /* 這一關的小雞總數 */
    function totalFor(level) { return Math.round(kit.ramp(level, TOTAL_START, TOTAL_END, LEVEL_RAMP)); }
    /* 小雞速度 */
    function speedFor(level) { return kit.ramp(level, SPEED_START, SPEED_END, LEVEL_RAMP); }
    /* 移動時間 */
    function moveFor(level) { return kit.ramp(level, MOVE_START, MOVE_END, LEVEL_RAMP); }
    /* 兩點之間的距離（勾股定理） */
    function dist2(a, b) { return Math.sqrt((a[0] - b[0]) * (a[0] - b[0]) + (a[1] - b[1]) * (a[1] - b[1])); }
    /* 小雞 c 在時間 t 的位置：等速沿著折線走，用二分搜尋找出目前在折線的哪一段，再用線性插值算出該段內的位置 */
    /* 小雞 c 在時間 t（秒）的位置：等速沿著折線 c.pts 走，t ≥ c.T 就停在最後一點 */
    function posAt(c, t) {
        /* u 是走完全程的比例（0～1）；s 是已走的距離；cum 是折線每個轉折點的累計距離 */
        var u = c.T > 0 ? Math.min(1, Math.max(0, t / c.T)) : 1, s = u * c.len, pts = c.pts, cum = c.cum;
        if (u >= 1) return { x: pts[pts.length - 1][0], y: pts[pts.length - 1][1] };
        /* 二分搜尋：lo、hi 夾住 s 所在的線段；>> 1 是除以 2 取整數 */
        var lo = 0, hi = cum.length - 1;
        while (hi - lo > 1) { var m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m; }
        /* f 是在這一段裡走了幾成，座標 = 起點 + (終點 − 起點) × f */
        var seg = cum[hi] - cum[lo], f = seg > 0 ? (s - cum[lo]) / seg : 0;
        return { x: pts[lo][0] + (pts[hi][0] - pts[lo][0]) * f, y: pts[lo][1] + (pts[hi][1] - pts[lo][1]) * f };
    }
    /* 某一時刻所有小雞之間最近的距離（測試和主控台用） */
    function minDist(list, t) {
        var m = Infinity, ps = list.map(function (c) { return posAt(c, t); });
        for (var i = 0; i < ps.length; i++) for (var j = i + 1; j < ps.length; j++) {
            var dx = ps[i].x - ps[j].x, dy = ps[i].y - ps[j].y; m = Math.min(m, Math.sqrt(dx * dx + dy * dy));
        }
        return m;
    }
    /* 起點：隨機撒點，任兩隻距離都 ≥ d（拒絕取樣）。擺不下就把 d 縮小一點再試，仍不行才改用六角形格子 */
    /* 起點：互不重疊（距離 ≥ minD）；擺不下就把 minD 縮小（不低於 CHICK + 2），再不行用六角形格子 */
    function startSpots(n, FW, FH, rand) {
        rand = rand || Math.random;
        /* x0..y1 是可以擺放的範圍（留邊界和頭上星星的空間） */
        var x0 = MARGIN + 6, x1 = FW - MARGIN - 6, y0 = MARGIN + 24, y1 = FH - MARGIN - 6;       /* 上緣多留 18px 給頭上的星星 */
        /* d 從 MIN_START_DIST 一路乘 0.97 縮小，最小到 CHICK+2 */
        for (var d = MIN_START_DIST; d >= CHICK + 2 - 1e-9; d *= 0.97) {
            for (var attempt = 0; attempt < 6; attempt++) {
                var pts = [];
                for (var tries = 0; tries < 2500 && pts.length < n; tries++) {
                    var x = kit.randFloat(x0, x1, rand), y = kit.randFloat(y0, y1, rand), ok = true;
                    for (var i = 0; i < pts.length; i++) { var dx = pts[i][0] - x, dy = pts[i][1] - y; if (dx * dx + dy * dy < d * d) { ok = false; break; } }
                    if (ok) pts.push([x, y]);
                }
                if (pts.length === n) return pts;
            }
        }
        return hexSpots(n, FW, FH, CHICK + 6, rand);
    }
    /* 六角形格子：每列錯開半格，相鄰兩格距離都是 sp，隨機挑 n 格。格子數不夠就回傳 null */
    /* 六角形格子（相鄰距離 sp）隨機挑 n 格；格子不夠回傳 null */
    function hexSpots(n, FW, FH, sp, rand) {
        rand = rand || Math.random;
        var rowH = sp * Math.sqrt(3) / 2, x0 = MARGIN + 6, y0 = MARGIN + 24, slots = [];
        var offX = rand() * sp * 0.5, offY = rand() * rowH * 0.5;
        for (var r = 0; ; r++) {
            var y = y0 + offY + r * rowH;
            if (y > FH - MARGIN - 6) break;
            for (var c = 0; ; c++) {
                var x = x0 + offX + c * sp + (r % 2 ? sp / 2 : 0);
                if (x > FW - MARGIN - 6) break;
                slots.push([x, y]);
            }
        }
        if (slots.length < n) return null;
        return kit.shuffle(slots, rand).slice(0, n);
    }
    /* 停止位置：六角形格子再加一點抖動，任兩隻距離仍 ≥ MIN_STOP_DIST */
    /* 停止位置：六角形格子（相鄰距離 MIN_STOP_DIST + 8，抖動 ±2 之後仍 ≥ MIN_STOP_DIST） */
    function stopSpots(n, FW, FH, rand) {
        rand = rand || Math.random;
        var slots = hexSpots(n, FW, FH, MIN_STOP_DIST + 8, rand);
        if (!slots) return null;
        return slots.map(function (p) { return [p[0] + kit.randFloat(-2, 2, rand), p[1] + kit.randFloat(-2, 2, rand)]; });
    }
    /* 一隻小雞的折線路線：起點 S → 一連串遠處的轉折點 → 終點 Z，總長約 Ltarget */
    /* 一隻小雞的折線路線：S → 一連串遠處的轉折點 → Z，總長約 Ltarget（至少 S 到 Z 的直線距離） */
    function makePath(S, Z, Ltarget, FW, FH, rand) {
        rand = rand || Math.random;
        var pts = [S], cur = S, len = 0;
        /* 最多加 14 個轉折點 */
        for (var guard = 0; guard < 14; guard++) {
            /* 剩下的距離直接走到終點就夠長，就不用再加轉折點 */
            if (len + dist2(cur, Z) >= Ltarget) break;                  /* 剩下的距離直接走到終點就夠長了 */
            var chosen = null;
            /* 每次最多嘗試 40 個候選點，挑一個「夠遠、不會讓路線太長」的 */
            for (var a = 0; a < 40 && !chosen; a++) {
                var W = [kit.randFloat(MARGIN, FW - MARGIN, rand), kit.randFloat(MARGIN, FH - MARGIN, rand)], seg = dist2(cur, W);
                if (seg < MIN_LEG || dist2(W, Z) < MIN_LEG * 0.6) continue;
                if (len + seg + dist2(W, Z) > Ltarget * 1.12) continue;
                chosen = { p: W, seg: seg };
            }
            if (!chosen) break;
            pts.push(chosen.p); len += chosen.seg; cur = chosen.p;
        }
        pts.push(Z);
        /* cum：累計距離，posAt 要用它快速查位置 */
        var cum = [0];
        for (var i = 1; i < pts.length; i++) cum.push(cum[i - 1] + dist2(pts[i - 1], pts[i]));
        return { pts: pts, cum: cum, len: cum[cum.length - 1] };
    }
    /* 出一關：每隻小雞有起點、折線路線、移動時間；再隨機挑 K 隻當目標 */
    /* 出一關：回傳 { chicks, targets（目標編號陣列）, tMove（停止時間，秒）, FW, FH } */
    function makeLevel(level, FW, FH, rand) {
        rand = rand || Math.random;
        var n = totalFor(level), K = kFor(level), T = moveFor(level), v = speedFor(level);
        /* 先算好所有起點與停止位置 */
        var starts = startSpots(n, FW, FH, rand), stops = stopSpots(n, FW, FH, rand);
        var chicks;
        if (starts && stops) {
            /* 停止位置洗牌後一一配給小雞，這樣誰走到哪是隨機的 */
            kit.shuffle(stops, rand);
            chicks = starts.map(function (s, k) {
                var path = makePath(s, stops[k], v * T, FW, FH, rand);
                return { x0: s[0], y0: s[1], pts: path.pts, cum: path.cum, len: path.len, T: T };
            });
        /* 保底：萬一擺不出來，小雞排成格子站著不動 */
        } else {
            /* 保底：小雞排成格子、站著不動（停止時一定分得開）*/
            var cols = Math.ceil(Math.sqrt(n)); chicks = [];
            for (var k = 0; k < n; k++) {
                var gx = MARGIN + (k % cols) * (FW - 2 * MARGIN) / Math.max(1, cols - 1), gy = MARGIN + 24 + Math.floor(k / cols) * 90;
                chicks.push({ x0: gx, y0: gy, pts: [[gx, gy], [gx, gy]], cum: [0, 0], len: 0, T: T });
            }
        }
        return { chicks: chicks, targets: kit.shuffle(chicks.map(function (_, k) { return k; }), rand).slice(0, K), tMove: T, FW: FW, FH: FH };
    }
    /* 判定一次點擊：'miss'（沒點到星星小雞）、'again'（重複點同一隻）、'hit'（找到） */
    /* 判定：點到的是不是還沒點過的星星小雞 */
    function judgeTap(targets, found, idx) {
        if (idx == null || targets.indexOf(idx) < 0) return 'miss';
        return found.indexOf(idx) >= 0 ? 'again' : 'hit';
    }

    /* 畫小雞（SVG：身體、眼睛、嘴、冠、腳） */
    function chickSvg() {
        var svg = kit.svg('svg', { 'class': 'ck-svg', viewBox: '0 0 64 64' });
        kit.svg('ellipse', { cx: 32, cy: 38, rx: 24, ry: 21, fill: 'hsl(48,95%,62%)', stroke: 'hsl(36,70%,34%)', 'stroke-width': 3 }, svg);
        kit.svg('circle', { cx: 24, cy: 32, r: 3.2, fill: 'hsl(24,40%,20%)' }, svg);
        kit.svg('circle', { cx: 40, cy: 32, r: 3.2, fill: 'hsl(24,40%,20%)' }, svg);
        kit.svg('polygon', { points: '28,38 36,38 32,45', fill: 'hsl(24,95%,55%)', stroke: 'hsl(24,60%,30%)', 'stroke-width': 1.5, 'stroke-linejoin': 'round' }, svg);
        kit.svg('path', { d: 'M28 12 Q32 4 36 12', fill: 'none', stroke: 'hsl(36,70%,34%)', 'stroke-width': 3, 'stroke-linecap': 'round' }, svg);
        kit.svg('line', { x1: 26, y1: 58, x2: 26, y2: 62, stroke: 'hsl(24,95%,50%)', 'stroke-width': 3, 'stroke-linecap': 'round' }, svg);
        kit.svg('line', { x1: 38, y1: 58, x2: 38, y2: 62, stroke: 'hsl(24,95%,50%)', 'stroke-width': 3, 'stroke-linecap': 'round' }, svg);
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

            /* S 這關的資料；els 每隻小雞對應的 HTML 元素；found 已找到的目標編號 */
            var level = startAt || 1, cleared = level - 1, lives = LIVES, newRec = false, state = 'idle', lvId = 0, S = null, els = [], found = [];
            /* 先放不斷行空白佔住一行高，之後再量院子大小才準 */
            /* 先放不斷行空白佔住一行高：startLevel 一開頭就量院子大小，文字晚一點才填的話，量到的會比最後的大 */
            var head = h('div', { 'class': 'ck-head', text: ' ' });
            var banner = h('div', { 'class': 'ck-banner', text: ' ' });
            var field = h('div', { 'class': 'ck-field' });
            [head, banner, field].forEach(function (n) { root.appendChild(n); });

            function meta() { ctx.setMeta(kit.meta(['第 ' + level + ' 關', '機會 ' + lives])); }
            /* 把第 i 隻小雞放到時間 t 的位置：用 CSS transform: translate 移動（比改 left/top 順暢） */
            function place(i, t) {
                var p = posAt(S.chicks[i], t);
                els[i].style.transform = 'translate(' + (p.x - CHICK / 2).toFixed(1) + 'px,' + (p.y - CHICK / 2).toFixed(1) + 'px)';
            }

            /* 開始一關 */
            function startLevel() {
                if (my.dead) return;
                var id = ++lvId;
                field.innerHTML = ''; els = []; found = [];
                S = makeLevel(level, field.clientWidth, field.clientHeight);
                /* 建立每隻小雞的元素：目標小雞頭上顯示星星，並且 z-index 提高到最上層，星星不會被其他小雞遮住 */
                S.chicks.forEach(function (c, i) {
                    var isT = S.targets.indexOf(i) >= 0;
                    var el = h('div', { 'class': 'ck-chick' });
                    el.setAttribute('data-i', String(i));
                    el.style.width = el.style.height = CHICK + 'px';
                    el.appendChild(chickSvg());
                    var star = h('div', { 'class': 'ck-star', text: '★' });
                    star.hidden = !isT;
                    el.appendChild(star);
                    if (isT) el.style.zIndex = '20';             /* 星星小雞疊在最上面：星星不會被別的小雞遮住 */
                    field.appendChild(el); els.push(el);
                    place(i, 0);
                });
                /* 標記階段：顯示 MARK_S 秒，讓玩家記住哪幾隻有星星 */
                state = 'mark';
                head.textContent = '第 ' + level + ' 關　找出 ' + S.targets.length + ' 隻';
                banner.textContent = '記住頭上有星星的小雞！';
                meta();
                try { console.info('[找回小雞] 第 ' + level + ' 關：共 ' + S.chicks.length + ' 隻、目標 ' + S.targets.length + ' 隻（編號 ' + S.targets.map(function (k) { return k + 1; }).join('、') + '）、速度 ' + speedFor(level).toFixed(0) + ' px/秒、移動 ' + S.tMove.toFixed(2) + ' 秒，折線平均 ' + (S.chicks.reduce(function (a, c) { return a + c.len; }, 0) / S.chicks.length).toFixed(0) + ' px，停止時最近距離 ' + minDist(S.chicks, S.tMove).toFixed(1) + ' px'); } catch (e) { }
                Sfx.play('go');
                /* 標記結束 → 隱藏星星，小雞開始亂跑 */
                my.after(MARK_S * 1000, function () {
                    if (id !== lvId) return;
                    state = 'move';
                    els.forEach(function (el) { el.querySelector('.ck-star').hidden = true; });
                    banner.textContent = '小雞亂跑中…盯緊！';
                    var t0 = performance.now();
                    /* my.loop：每個畫面更新一次，把每隻小雞放到目前時間的位置 */
                    my.loop(function (now) {
                        if (id !== lvId || state !== 'move') return false;
                        var t = Math.min(S.tMove, (now - t0) / 1000);
                        for (var i = 0; i < els.length; i++) place(i, t);
                    });
                    /* 移動時間結束：所有小雞定在終點位置 */
                    my.after(S.tMove * 1000, function () {
                        if (id !== lvId || state !== 'move') return;
                        for (var i = 0; i < els.length; i++) place(i, S.tMove);       /* rAF 被暫停時也一定停在正確位置 */
                        state = 'pick';
                        /* 只有星星小雞可以點（加上 ck-chick--live），其他小雞的 pointer-events 關掉（ck-chick--dead），點下去等於點到空地 */
                        /* 只有星星小雞有點擊功能：其他小雞的 pointer-events 關掉，點下去等於點到空地 */
                        els.forEach(function (el, k) { el.classList.add(S.targets.indexOf(k) >= 0 ? 'ck-chick--live' : 'ck-chick--dead'); });
                        banner.textContent = '點出剛才有星星的 ' + S.targets.length + ' 隻（點錯就失敗）';
                        Sfx.play('pop');
                    });
                });
            }

            /* 點擊：整個院子只有一個事件監聽，用 closest 往上找被點的元素是不是「可點的小雞」 */
            /* 點擊：整個院子只有一個監聽；點到沒有星星的地方就是失敗 */
            field.addEventListener('pointerdown', function (e) {
                if (state !== 'pick') return;
                e.preventDefault();
                var el = e.target && e.target.closest ? e.target.closest('.ck-chick--live') : null;
                tap(el ? Number(el.getAttribute('data-i')) : null);
            });
            /* 處理一次點擊 */
            function tap(idx) {
                if (state !== 'pick') return;
                var r = judgeTap(S.targets, found, idx);
                if (r === 'again') return;
                if (r === 'miss') { fail(idx); return; }
                found.push(idx);
                els[idx].classList.add('ck-chick--ok');
                els[idx].querySelector('.ck-star').hidden = false;
                Sfx.play('click');
                banner.textContent = '找到 ' + found.length + '／' + S.targets.length;
                if (found.length === S.targets.length) win();
            }

            /* 全部找到 → 過關 */
            function win() {
                state = 'reveal';
                cleared = level;
                if (Reaction.setBest(ID, cleared, function (v, b) { return v > b; })) newRec = true;
                banner.textContent = '全部找回來了！';
                Sfx.play('win');
                level++; meta();
                my.after(NEXT_MS, startLevel);
            }

            /* 點錯 → 失敗：把沒找到的星星小雞亮出來 */
            function fail(idx) {
                state = 'reveal';
                /* 沒找到的星星小雞亮出來（橘色），剛才點到的地方標紅 */
                S.targets.forEach(function (t) {
                    if (found.indexOf(t) < 0) { els[t].querySelector('.ck-star').hidden = false; els[t].classList.add('ck-chick--miss'); }
                });
                if (idx != null && els[idx]) els[idx].classList.add('ck-chick--wrong');
                var missed = S.targets.length - found.length;
                lives--;
                banner.textContent = '沒點到星星小雞！還有 ' + missed + ' 隻沒找到';
                Sfx.play('bad'); meta();
                if (lives <= 0) {
                    /* 沒有機會了 → 結算；kit.resumeFrom 可以從前 5 關繼續 */
                    var failLevel = level, back = kit.resumeFrom(failLevel);
                    my.after(2200, function () {
                        kit.result(root, {
                            score: cleared,        /* 世界排行榜成績（跟 setBest 存的同一個數字） */
                            num: cleared + ' 關', label: cleared >= 8 ? '小雞守護者！' : (cleared >= 4 ? '眼力不錯！' : '再試一次，會更準！'),
                            lines: ['第 ' + failLevel + ' 關要找 ' + S.targets.length + ' 隻，找到 ' + found.length + ' 隻'], isNew: newRec, sfx: cleared >= 5 ? 'win' : 'fail',
                            onAgain: function () { round(1); },
                            resume: { level: back, run: function () { round(back); } }
                        });
                    });
                } else my.after(2300, startLevel);
            }

            /* G.debug：測試用後門 */
            G.debug = {
                state: function () { return { level: level, state: state, lives: lives, cleared: cleared, S: S, found: found.slice() }; },
                tapChick: function (i) { tap(i); },
                tapEmpty: function () { tap(null); },
                findAll: function () { S.targets.forEach(function (t) { tap(t); }); },
                liveCount: function () { return field.querySelectorAll('.ck-chick--live').length; }
            };
            /* 開場等 300 毫秒再開始第一關 */
            my.after(300, startLevel);
        }

        round(1);
    }

    /* 遊戲身分證 */
    var G = {
        id: ID,
        name: '找回小雞',
        rule: '**先記住頭上有星星的小雞**。星星消失後，小雞會到處亂跑，還會互相遮住。等牠們停下來，**直接點剛才有星星的那幾隻**：只有星星小雞點得到，點到別的地方就失敗了！越後面小雞越多、跑得越快！',
        mount: mount,
        /* 世界排行榜的成績規格 */
        score: SCORE,
        /* test 匯出純函式給 Node 自動測試 */
        test: { stopSpots: stopSpots, startSpots: startSpots, hexSpots: hexSpots, makePath: makePath, judgeTap: judgeTap, kFor: kFor, totalFor: totalFor, speedFor: speedFor, moveFor: moveFor, posAt: posAt, minDist: minDist, makeLevel: makeLevel, MIN_STOP_DIST: MIN_STOP_DIST, MIN_START_DIST: MIN_START_DIST, MIN_LEG: MIN_LEG, CHICK: CHICK, MARGIN: MARGIN, LEVEL_RAMP: LEVEL_RAMP }
    };
    /* 登記到遊戲清單 */
    Reaction.register(G);
})();

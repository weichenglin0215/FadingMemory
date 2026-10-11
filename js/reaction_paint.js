/* ═══════════════════════════════════════════════════════════════════
   reaction_paint.js — 秒反應・刷油漆
   用手指把白色的正方形整個刷上顏色，一個角落、一條縫都不能漏。沾油漆的次數越少越好。
   ───────────────────────────────────────────────────────────────────
   · 下方的圓形就是油漆刷（大小＝筆刷粗細），也是「沾油漆」按鈕：
       每沾一次 → 筆刷縮小 15%（直徑 ×SHRINK＝0.85，最小 BRUSH_MIN），油漆量補滿；
       油漆量＝方塊寬度的 BUDGET_MULT（3）倍的筆畫長度，用完就畫不出來，畫面中央出現警語，要再去沾。
   · 判斷「是否完全塗滿」：用一張跟方塊同大的點陣遮罩（每個邏輯 px 一格，Uint8Array），
       每畫一小段就沿著筆畫每隔幾 px 蓋一個圓（逐列填、同時數有幾格從「沒塗」變「塗到」），
       「還沒塗的格數」減到 0 就是完全塗滿——不需要讀取畫布像素，每一格都精確，
       任何 1px 的縫、任何一個角落都不會被漏掉。
       圓的半徑會少算 0.5px（保守），所以只有「整格幾乎都被蓋到」才算塗到，不會因為
       邊緣反鋸齒留下肉眼看得到的白線卻被當成塗完。
   · 不會自動告訴玩家哪裡還沒塗到：要玩家自己去找。真的找不到，可以按最下面的按鈕
       「消耗三次沾漆，顯示未完成區域」：沾油漆次數 +HINT_COST（成績會變差），並在方塊上標出
       「最大的一塊」還沒塗到的區域（紅色脈動圓圈，每按一次只標一處；下一筆開始畫就消失）。
       找出區域用連通區域（holes）：每一處漏掉的點都能找到，不用玩家用眼睛去找 1px 的白點。
   · 圓形畫筆變成虛線（沒有油漆了，要去沾）時，圓形右上方會出現一支油漆刷，上下點動提醒玩家來點圓形
       （高度＝圓形直徑的 200%，圓形縮得很小時刷子最小 POINTER_MIN_H px）。
   · 成績＝沾油漆次數（越少越好，用了提示的話含提示的次數），另外算「塗料利用率」＝方塊面積 ÷ 所有筆畫掃過的面積總和
       （重複塗到已塗的地方會讓利用率下降）。
   ═══════════════════════════════════════════════════════════════════ */

/* （檔案結構說明見 js/reaction_sticks.js 開頭的「新手導讀」） */
(function () {
    'use strict';

    var ID = 'paint';

    /* 世界排行榜的成績規格（欄位說明見 js/leaderboard.js 開頭）；資料庫 MF_games 裡 paint 那一列要一致
       （node test/leaderboard/gen_games_sql.cjs 會從這裡產生 insert，test/reaction/t_leaderboard.js 會檢查兩邊是否一致）。 */
    var SCORE = { better: 'min', decimals: 0, format: '{v} 次', label: '沾油漆', min: 1, max: 500 };
    var h = UI.h;
    var kit = Reaction.kit;

    /* 設定集中在這一區 */
    /* ═══ 可以自己調的參數 ═══ */
    /* 方塊邊長 400（邏輯 px） */
    var SQ = 400;                  /* 方塊邊長（邏輯 px） */
    /* 筆刷一開始直徑 80，每沾一次 ×0.85，最小 4 */
    var BRUSH_START = 80;         /* 第一次沾油漆之前的筆刷直徑 */
    var SHRINK = 0.88;             /* 每沾一次，直徑 ×0.85 */
    var BRUSH_MIN = 3;             /* 筆刷最小直徑（再小就畫不完了） */
    /* 一次沾油漆可以刷幾倍方塊寬度的長度 */
    var BUDGET_MULT = 1;           /* 一次沾油漆可以刷幾倍方塊寬度的長度 */
    /* 遮罩判定時半徑少算 0.5px（保守：整格幾乎都被蓋到才算塗到） */
    var EDGE_SLACK = 0.5;          /* 遮罩半徑少算幾 px（保守判定） */
    var HINT_COST = 3;             /* 按「顯示未完成區域」要消耗幾次沾漆（直接加進沾油漆次數，成績會變差） */
    var HINT_R_MIN = 22, HINT_R_MAX = 70;   /* 標出未完成區域的紅圈半徑範圍（px；區域越大圈越大） */
    var HIT_MIN = 56;              /* 點擊區至少多大（px）：筆刷縮得很小時，圓形旁邊的空白也算點到 */
    var POINTER_MIN_H = 52, POINTER_MAX_H = 160;   /* 油漆刷提示的高度範圍（px）；正常是圓形直徑的 2 倍 */
    var COLORS = ['#E8685A', '#4A90D9', '#3FA46A', '#9B59B6', '#F08A24', '#1FA2A6', '#D6478C'];

    function fmtBest(v) { return v == null ? '' : '最少 ' + v + ' 次'; }
    /* 按鈕文字用中文數字（HINT_COST 改成 2 或 5，文字會跟著變） */
    var NUM_CN = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

    /* 純函式：遮罩（也給 Node 測試用） */
    /* ═══ 純函式：遮罩（也給 Node 測試用）═══ */
    /* 遮罩是一張 n×n 的點陣（每個邏輯 px 一格），0＝沒塗、1＝塗到了；left 記還有幾格沒塗，減到 0 就完全塗滿 */
    function makeMask(n) {
        return { n: n, data: new Uint8Array(n * n), left: n * n };
    }
    /* 蓋一個圓（圓心、半徑）：逐列填入，並算有幾格是「新塗到」的 */
    /* 蓋一個圓（圓心 cx,cy 是方塊座標，r 是畫出來的半徑）；回傳新塗到幾格 */
    function stampDisc(m, cx, cy, r) {
        var re = r - EDGE_SLACK;
        if (re <= 0) return 0;
        var n = m.n, d = m.data, added = 0;
        /* y0..y1：圓覆蓋的列範圍 */
        var y0 = Math.max(0, Math.ceil(cy - re - 0.5)), y1 = Math.min(n - 1, Math.floor(cy + re - 0.5));
        for (var y = y0; y <= y1; y++) {
            var dy = (y + 0.5) - cy;
            /* hw：這一列圓的半寬（勾股定理） */
            var hw = Math.sqrt(re * re - dy * dy);
            var x0 = Math.max(0, Math.ceil(cx - hw - 0.5)), x1 = Math.min(n - 1, Math.floor(cx + hw - 0.5));
            var row = y * n;
            for (var x = x0; x <= x1; x++) {
                if (!d[row + x]) { d[row + x] = 1; added++; }
            }
        }
        m.left -= added;
        return added;
    }
    /* 沿線段每隔幾 px 蓋一個圓，這樣畫得快也不會漏縫 */
    /* 沿線段蓋圓，間隔 ≤ min(3, r/3) px。第一個點（起點）也會蓋，所以一小段一小段呼叫時
       上一段的終點會重複蓋一次（無害） */
    function stampSegment(m, x0, y0, x1, y1, r) {
        var len = Math.sqrt((x1 - x0) * (x1 - x0) + (y1 - y0) * (y1 - y0));
        var step = Math.max(0.5, Math.min(3, r / 3));
        var k = Math.max(1, Math.ceil(len / step));
        var added = 0;
        for (var i = 0; i <= k; i++) {
            var t = i / k;
            added += stampDisc(m, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, r);
        }
        return added;
    }
    /* 找出沒塗到的連通區域（用深度優先搜尋 + 堆疊 stack），回傳各區域的質心，最大的排前面；用來標出還沒塗到的地方 */
    /* 找出沒塗到的連通區域（4 鄰接），回傳 [{x,y,size,px,py}]，最大的在前，最多 limit 個：
       x,y＝質心；size＝格數；px,py＝「區域裡面、離質心最近的一格」的中心（環狀或彎曲的區域質心可能落在已經塗到的地方，
       要標記區域就用 px,py 才一定指在還沒塗到的格子上） */
    /* seen 記錄已處理的格子，stack 是待處理格子的堆疊（後進先出），order 依序記下這一區的格子（找代表點用） */
    function holes(m, limit) {
        var n = m.n, d = m.data, seen = new Uint8Array(n * n), out = [];
        var stack = new Int32Array(n * n), order = new Int32Array(n * n);
        for (var s = 0; s < n * n; s++) {
            if (d[s] || seen[s]) continue;
            var sp = 0, sx = 0, sy = 0, cnt = 0;
            stack[sp++] = s; seen[s] = 1;
            while (sp) {
                var p = stack[--sp], px = p % n, py = (p - px) / n;
                order[cnt] = p;
                sx += px; sy += py; cnt++;
                if (px > 0 && !d[p - 1] && !seen[p - 1]) { seen[p - 1] = 1; stack[sp++] = p - 1; }
                if (px < n - 1 && !d[p + 1] && !seen[p + 1]) { seen[p + 1] = 1; stack[sp++] = p + 1; }
                if (py > 0 && !d[p - n] && !seen[p - n]) { seen[p - n] = 1; stack[sp++] = p - n; }
                if (py < n - 1 && !d[p + n] && !seen[p + n]) { seen[p + n] = 1; stack[sp++] = p + n; }
            }
            /* 代表點：這一區裡離質心最近的格子 */
            var cx = sx / cnt, cy = sy / cnt, best = order[0], bestD = Infinity;
            for (var i = 0; i < cnt; i++) {
                var q = order[i], qx = q % n, qy = (q - qx) / n, dd = (qx - cx) * (qx - cx) + (qy - cy) * (qy - cy);
                if (dd < bestD) { bestD = dd; best = q; }
            }
            var bx = best % n;
            out.push({ x: cx + 0.5, y: cy + 0.5, size: cnt, px: bx + 0.5, py: (best - bx) / n + 0.5 });
        }
        out.sort(function (a, b) { return b.size - a.size; });
        return out.slice(0, limit || 20);
    }
    /* 沾油漆後筆刷縮小到多少 */
    function brushAfter(d) { return Math.max(BRUSH_MIN, d * SHRINK); }
    /* 依沾油漆次數給評語 */
    function rating(dips) {
        if (dips <= 2) return '油漆大師！';
        if (dips <= 3) return '刷得真漂亮';
        if (dips <= 5) return '很不錯';
        if (dips <= 8) return '刷好了';
        return '慢慢來也完成了';
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

            /* color 這局的油漆顏色；mask 遮罩；D 目前筆刷直徑；dips 沾了幾次；budget 剩餘油漆量（可畫多長）；swept 所有筆畫掃過的面積總和（算利用率） */
            var color = kit.pick(COLORS);
            var mask = makeMask(SQ);
            /* 目前筆刷直徑 */
            var D = BRUSH_START;                 /* 目前筆刷直徑 */
            var dips = 0;
            var budget = 0, budgetMax = SQ * BUDGET_MULT;     /* 目前剩下的筆畫長度 */
            var swept = 0;                       /* 所有筆畫掃過的面積總和（算利用率） */
            var strokeLen = 0;
            var state = 'play';                  /* play／done */
            /* last：目前這一筆的上一個點，沒有在畫＝null；pid 正在畫的手指 */
            var last = null;                     /* 目前這一筆的上一個點（方塊座標），沒有在畫＝null */
            var pid = null;
            var warnTimer = null;
            var hints = 0;                       /* 用了幾次「顯示未完成區域」 */
            var hintShown = false;               /* 目前方塊上有沒有正在顯示的未完成區域標記（下一筆開始畫就消失） */

            /* 建立畫面元素：資訊、方塊（canvas 畫布）、警語、油漆量長條、筆刷按鈕 */
            var info = h('div', { 'class': 'pa-info' });
            var field = h('div', { 'class': 'pa-field' });
            var sq = h('div', { 'class': 'pa-square' });
            /* canvas：用 JS 在上面畫點陣圖 */
            var cv = h('canvas', { 'class': 'pa-canvas' });
            /* DPR：畫布解析度加倍（2 倍），在高解析度螢幕上筆跡才不會模糊 */
            var DPR = 2;
            cv.width = SQ * DPR; cv.height = SQ * DPR;
            cv.style.width = SQ + 'px'; cv.style.height = SQ + 'px';
            /* getContext('2d')：取得 2D 畫筆；g.scale 讓之後座標仍以邏輯 px 計 */
            var g = cv.getContext('2d');
            g.scale(DPR, DPR);
            g.lineCap = 'round'; g.lineJoin = 'round';
            sq.style.width = sq.style.height = SQ + 'px';
            sq.appendChild(cv);
            var marks = h('div', { 'class': 'pa-marks' });
            sq.appendChild(marks);
            field.appendChild(sq);
            var warn = h('div', { 'class': 'pa-warn' });
            field.appendChild(warn);
            var zone = h('div', { 'class': 'pa-zone' });
            var gauge = h('div', { 'class': 'pa-gauge' }, [h('div', { 'class': 'pa-gauge__fill' })]);
            var gfill = gauge.firstChild;
            var brush = h('button', { 'class': 'pa-brush' });
            var brushLabel = h('div', { 'class': 'pa-brushlabel' });
            /* 油漆刷提示：用 SVG 畫（木柄、金屬環、刷毛），刷毛的顏色＝這一局的油漆色；平常隱藏，圓形變成虛線時才顯示（見 refresh） */
            var pointer = h('div', { 'class': 'pa-pointer' });
            var ps = kit.svg('svg', { 'class': 'pa-pointer__svg', viewBox: '0 0 50 100', preserveAspectRatio: 'xMidYMax meet' }, pointer);
            kit.svg('rect', { 'class': 'pa-pt-handle', x: 19, y: 2, width: 12, height: 48, rx: 6 }, ps);
            kit.svg('rect', { 'class': 'pa-pt-ferrule', x: 14, y: 48, width: 22, height: 14, rx: 2 }, ps);
            var bristle = kit.svg('path', { 'class': 'pa-pt-bristle', d: 'M15 62 H35 C38 74 33 90 25 98 C17 90 12 74 15 62 Z' }, ps);
            bristle.style.fill = color;
            /* 畫筆的點擊區（圓形＋油漆刷提示都放在裡面）；放在下方操作區，圓形貼著下緣 */
            var brushBox = h('div', { 'class': 'pa-brushbox' }, [brush, pointer]);
            var brushWrap = h('div', { 'class': 'pa-brushwrap' }, [brushBox]);
            /* 最下面的按鈕：消耗 HINT_COST 次沾漆，標出最大的一塊未完成區域 */
            var hintBtn = h('button', { 'class': 'btn btn--line pa-hintbtn', text: '消耗' + (NUM_CN[HINT_COST] || HINT_COST) + '次沾漆，顯示未完成區域。' });
            zone.appendChild(gauge);
            zone.appendChild(brushWrap);
            zone.appendChild(brushLabel);
            zone.appendChild(hintBtn);
            root.appendChild(info);
            root.appendChild(field);
            root.appendChild(zone);

            /* 已塗滿的百分比 */
            function paintedPct() { return (1 - mask.left / (SQ * SQ)) * 100; }
            /* 重新整理畫面上的文字、油漆量、筆刷大小與顏色 */
            function refresh() {
                var pct = paintedPct();
                /* 沒塗完不顯示 100%：用無條件捨去 */
                var shown = mask.left === 0 ? '100.0000' : (Math.floor(pct * 10000) / 10000).toFixed(4);
                info.textContent = '沾了 ' + dips + ' 次油漆　已塗 ' + shown + '%';
                ctx.setMeta(kit.meta([fmtBest(Reaction.getBest(ID))]));
                gfill.style.width = (100 * budget / budgetMax).toFixed(1) + '%';
                brush.style.width = brush.style.height = D + 'px';
                brush.style.background = budget > 0 ? color : 'transparent';
                brush.style.borderColor = color;
                brush.classList.toggle('pa-brush--empty', budget <= 0);
                brushLabel.textContent = budget > 0 ? '油漆剩 ' + Math.round(100 * budget / budgetMax) + '%' : (dips === 0 ? '點圓形沾油漆' : '油漆用完了，點圓形再沾');
                /* 點擊區：筆刷直徑，但至少 HIT_MIN px（圓形在框的正中間） */
                var S = Math.max(D, HIT_MIN);
                brushBox.style.width = brushBox.style.height = S + 'px';
                /* 油漆刷提示：只在「圓形是虛線（要去沾油漆）」而且遊戲還沒結束時顯示。
                   高度＝圓形直徑的 2 倍（限制在 POINTER_MIN_H～POINTER_MAX_H），寬度是高度的一半；
                   筆尖（圖的底邊正中央）壓在圓形中心偏右下的位置，刷子往右上方傾斜，所以整支刷在圓形的右上方、一部分蓋在圓形上 */
                var ph = Math.max(POINTER_MIN_H, Math.min(POINTER_MAX_H, D * 2));
                pointer.style.height = ph + 'px'; pointer.style.width = (ph / 2) + 'px';
                pointer.style.left = (S / 2 + 0.12 * D - ph / 4) + 'px';
                pointer.style.top = (S / 2 + 0.4 * D - ph) + 'px';
                pointer.classList.toggle('pa-pointer--on', budget <= 0 && state === 'play');
                /* 提示按鈕：還沒塗任何東西、已經塗滿、或標記還在顯示時都不能按（避免白白消耗） */
                hintBtn.disabled = !(state === 'play' && swept > 0 && mask.left > 0 && !hintShown);
            }
            /* 顯示警語一陣子後自動消失 */
            function showWarn(text) {
                warn.textContent = text;
                warn.classList.add('pa-warn--on');
                my.cancel(warnTimer);
                warnTimer = my.after(1600, function () { warn.classList.remove('pa-warn--on'); });
            }

            /* 沾油漆：油漆量補滿，筆刷縮小一圈 */
            /* ─── 沾油漆 ─── */
            function dip() {
                if (state !== 'play') return;
                dips++;
                D = brushAfter(D);
                budget = budgetMax;
                Sfx.play('flip');
                warn.classList.remove('pa-warn--on');
                refresh();
            }
            brushBox.addEventListener('pointerdown', function (e) { e.preventDefault(); dip(); });
            hintBtn.addEventListener('pointerdown', function (e) { e.preventDefault(); useHint(); });

            /* 畫 */
            /* ─── 畫 ─── */
            /* 方塊的左上角（螢幕座標轉成邏輯座標） */
            var sqOrigin = null;
            function origin() {
                var r = sq.getBoundingClientRect();
                var o = Stage.toLogical(r.left, r.top);
                return o;
            }
            /* 把事件座標轉成方塊內的座標 */
            function toSq(e) {
                var p = kit.pt(e);
                if (!sqOrigin) sqOrigin = origin();
                return { x: p.x - sqOrigin.x, y: p.y - sqOrigin.y };
            }
            /* 把一段筆畫畫出來並更新遮罩；油漆量不夠就只畫到用完為止 */
            function drawTo(x, y) {
                /* 把這一段畫出來，並更新遮罩。budget 不夠就只畫到用完為止 */
                var dx = x - last.x, dy = y - last.y;
                var len = Math.sqrt(dx * dx + dy * dy);
                if (len <= 0) return;
                var use = Math.min(len, budget);
                var ex = last.x + dx * use / len, ey = last.y + dy * use / len;
                g.strokeStyle = color; g.fillStyle = color; g.lineWidth = D;
                /* canvas 畫線：beginPath 開始路徑、moveTo 移動、lineTo 畫線、stroke 描邊 */
                g.beginPath(); g.moveTo(last.x, last.y); g.lineTo(ex, ey); g.stroke();
                /* 同時更新遮罩（stampSegment）：之後判定「是否塗滿」靠它，不讀取畫布像素 */
                stampSegment(mask, last.x, last.y, ex, ey, D / 2);
                budget -= use; strokeLen += use;
                swept += use * D;
                last = { x: ex, y: ey };
                /* 油漆用完：警語提示要再沾 */
                if (use < len) {            /* 油漆用完 */
                    budget = 0;
                    last = null;
                    Sfx.play('bad');
                    showWarn('油漆用完了！\n點下方圓形再沾一次');
                }
                refresh();
                if (mask.left === 0) complete();
            }
            /* 開始一筆：點一下也要有一個圓點 */
            function startAt(x, y) {
                if (budget <= 0) { showWarn(dips === 0 ? '先點下方的圓形\n沾一點油漆' : '油漆用完了！\n點下方圓形再沾一次'); return; }
                last = { x: x, y: y };
                /* 點一下也要有一個圓點 */
                g.fillStyle = color;
                /* arc 畫圓；fill 填滿 */
                g.beginPath(); g.arc(x, y, D / 2, 0, Math.PI * 2); g.fill();
                stampDisc(mask, x, y, D / 2);
                swept += Math.PI * D * D / 4;
                clearMarks();
                refresh();
                if (mask.left === 0) complete();
            }
            /* 手指按下 */
            function onDown(e) {
                if (state !== 'play' || pid != null) return;
                e.preventDefault();
                pid = e.pointerId;
                try { field.setPointerCapture(e.pointerId); } catch (err) { }
                /* 每一筆都重新量方塊位置（視窗縮放後也準） */
                sqOrigin = origin();            /* 每一筆重新量方塊位置（視窗縮放後也準） */
                var p = toSq(e);
                startAt(p.x, p.y);
            }
            /* 手指移動 */
            function onMove(e) {
                if (state !== 'play' || e.pointerId !== pid || !last) return;
                /* getCoalescedEvents：取回被瀏覽器合併掉的中間點，筆畫才不會出現缺口 */
                var evs = e.getCoalescedEvents ? e.getCoalescedEvents() : null;
                var list = evs && evs.length ? evs : [e];
                for (var i = 0; i < list.length && last && state === 'play'; i++) {
                    var p = toSq(list[i]);
                    drawTo(p.x, p.y);
                }
            }
            /* 手指放開：啟動「閒置提示」的計時 */
            function onUp(e) {
                if (e.pointerId !== pid) return;
                pid = null; last = null;
            }
            /* 綁定手指事件；setPointerCapture 讓手指移出方塊外也持續收到事件 */
            field.addEventListener('pointerdown', onDown);
            field.addEventListener('pointermove', onMove);
            field.addEventListener('pointerup', onUp);
            field.addEventListener('pointercancel', onUp);
            /* 操作提示（只在第一次進遊戲時）：拖曳塗滿方塊 → 手指＋箭頭 */
            /* 先提示「點下方的圓形沾油漆」（手指縮放）；玩家沾了油漆之後，再提示「拖曳塗滿方塊」（手指＋箭頭） */
            if (Reaction.kit.once('paint.hint')) Reaction.kit.hintOn(root, brushBox, { mode: 'tap', fy: 0.75, text: '請點擊圓形沾油漆' });
            brushBox.addEventListener('pointerdown', function () {
                if (Reaction.kit.once('paint.hint2')) Reaction.kit.hintOn(root, field, { mode: 'drag', dx: field.clientWidth * 0.55, dy: 0, fx: 0.2, fy: 0.25, delay: 300, text: '請往左右拖曳塗滿方塊' });
            });
            /* 這一局結束時把事件監聽拿掉 */
            my.onDispose(function () {
                field.removeEventListener('pointerdown', onDown);
                field.removeEventListener('pointermove', onMove);
                field.removeEventListener('pointerup', onUp);
                field.removeEventListener('pointercancel', onUp);
            });

            /* ─── 未完成的區域：不會自動標出來，玩家按「顯示未完成區域」按鈕（消耗 HINT_COST 次沾漆）才標一處 ─── */
            function clearMarks() { marks.innerHTML = ''; hintShown = false; }
            /* 按鈕：沾油漆次數 +HINT_COST，標出「最大的一塊」還沒塗到的區域（只洩漏最容易看出來的那一處）。
               標記留在方塊上，直到玩家下一筆開始畫（startAt 會清掉）；標記還在的時候按鈕按不了，不會重複扣。 */
            function useHint() {
                if (state !== 'play' || mask.left === 0 || swept <= 0 || hintShown) return;
                var hl = holes(mask, 1)[0];
                if (!hl) return;
                dips += HINT_COST; hints++;
                clearMarks();
                /* 紅圈半徑：區域越大圈越大（等面積圓的半徑 + 12px），限制在 HINT_R_MIN～HINT_R_MAX */
                var r = Math.max(HINT_R_MIN, Math.min(HINT_R_MAX, Math.sqrt(hl.size / Math.PI) + 12));
                var m = h('div', { 'class': 'pa-mark' });
                m.style.left = hl.px + 'px';
                m.style.top = hl.py + 'px';
                m.style.width = m.style.height = (r * 2) + 'px';
                m.style.margin = (-r) + 'px 0 0 ' + (-r) + 'px';
                marks.appendChild(m);
                hintShown = true;
                Sfx.play('pop');
                console.log('刷油漆：提示 → 最大的未完成區域 ' + hl.size + ' 格，中心 (' + hl.px.toFixed(1) + ', ' + hl.py.toFixed(1) + ')，沾油漆次數 +' + HINT_COST + ' → ' + dips);
                refresh();
            }

            /* ─── 完成 ─── */
            /* 完成：全部塗滿，算塗料利用率＝方塊面積 ÷ 所有筆畫掃過的面積（重複塗會降低） */
            function complete() {
                if (state !== 'play') return;
                state = 'done';
                pid = null; last = null;
                clearMarks();
                refresh();
                var isNew = Reaction.setBest(ID, dips, function (v, b) { return v < b; });
                ctx.setMeta(kit.meta([fmtBest(Reaction.getBest(ID))]));
                var eff = Math.min(100, SQ * SQ / Math.max(1, swept) * 100);
                warn.textContent = '全部塗滿了！';
                warn.classList.add('pa-warn--on', 'pa-warn--ok');
                Sfx.play('win');
                my.after(1100, function () {
                    kit.result(root, {
                        score: dips,        /* 世界排行榜成績（跟 setBest 存的同一個數字） */
                        num: dips + ' 次', label: rating(dips),
                        lines: ['沾油漆 ' + dips + ' 次' + (hints ? '（含提示 ' + hints + ' 次，每次算 ' + HINT_COST + ' 次）' : ''), '塗料利用率 ' + eff.toFixed(0) + '%（越高代表重複塗得越少）'],
                        isNew: isNew, sfx: dips <= 3 ? 'perfect' : (dips <= 8 ? 'win' : 'neutral'), onAgain: round
                    });
                });
            }

            refresh();
            showWarn('先點下方的圓形\n沾一點油漆');

            /* G.debug：測試用後門，stroke() 可以模擬一筆 */
            G.debug = {
                SQ: SQ,
                state: function () { return { dips: dips, D: D, budget: budget, left: mask.left, pct: paintedPct(), state: state, swept: swept }; },
                dip: dip,
                /* 模擬一筆：points 是方塊座標 [{x,y}]，從第一點按下、依序移動、最後放開 */
                stroke: function (points) {
                    if (state !== 'play') return state;
                    startAt(points[0].x, points[0].y);
                    for (var i = 1; i < points.length && last; i++) drawTo(points[i].x, points[i].y);
                    last = null;
                    return state;
                },
                holes: function () { return holes(mask, 50); },
                hint: useHint,
                hintState: function () { return { hints: hints, hintShown: hintShown, disabled: hintBtn.disabled, marks: marks.children.length, pointerOn: pointer.classList.contains('pa-pointer--on'), pointerH: pointer.style.height }; }
            };
        }

        round();
    }

    /* 遊戲身分證 */
    var G = {
        id: ID,
        name: '刷油漆',
        rule: '用手指**把白色的正方形整個刷上顏色**，一個角落、一條縫都不能漏，哪裡還沒塗到要自己找。點下方的圓形沾油漆：每沾一次，筆刷會縮小 ' + Math.round((1 - SHRINK) * 100) + '%，而且只能刷方塊寬度 ' + BUDGET_MULT + ' 倍的長度，用完就要再沾。**沾油漆的次數越少越厲害**，小心別重複刷到已經塗過的地方！實在找不到，可以按最下面的按鈕，消耗 ' + HINT_COST + ' 次沾漆，標出最大的一塊未完成區域。',
        mount: mount,
        /* 世界排行榜的成績規格 */
        score: SCORE,
        /* test 匯出純函式給 Node 自動測試 */
        test: { makeMask: makeMask, stampDisc: stampDisc, stampSegment: stampSegment, holes: holes, brushAfter: brushAfter, BRUSH_MIN: BRUSH_MIN, SQ: SQ, BRUSH_START: BRUSH_START, BUDGET_MULT: BUDGET_MULT }
    };
    /* 登記到遊戲清單 */
    Reaction.register(G);
})();

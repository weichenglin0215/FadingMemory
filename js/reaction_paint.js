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
   · 手指停下來、離開畫面 IDLE_HINT_MS 後如果還沒塗完，會在漏掉的地方閃出紅色圓圈
       （用連通區域找出每一處漏掉的點），不用玩家用眼睛去找 1px 的白點。
   · 成績＝沾油漆次數（越少越好），另外算「塗料利用率」＝方塊面積 ÷ 所有筆畫掃過的面積總和
       （重複塗到已塗的地方會讓利用率下降）。
   ═══════════════════════════════════════════════════════════════════ */

/* （檔案結構說明見 js/reaction_sticks.js 開頭的「新手導讀」） */
(function () {
    'use strict';

    var ID = 'paint';
    var h = UI.h;
    var kit = Reaction.kit;

    /* 設定集中在這一區 */
    /* ═══ 可以自己調的參數 ═══ */
    /* 方塊邊長 400（邏輯 px） */
    var SQ = 400;                  /* 方塊邊長（邏輯 px） */
    /* 筆刷一開始直徑 80，每沾一次 ×0.85，最小 4 */
    var BRUSH_START = 80;         /* 第一次沾油漆之前的筆刷直徑 */
    var SHRINK = 0.85;             /* 每沾一次，直徑 ×0.85 */
    var BRUSH_MIN = 4;             /* 筆刷最小直徑（再小就畫不完了） */
    /* 一次沾油漆可以刷幾倍方塊寬度的長度 */
    var BUDGET_MULT = 3;           /* 一次沾油漆可以刷幾倍方塊寬度的長度 */
    /* 遮罩判定時半徑少算 0.5px（保守：整格幾乎都被蓋到才算塗到） */
    var EDGE_SLACK = 0.5;          /* 遮罩半徑少算幾 px（保守判定） */
    var IDLE_HINT_MS = 2200;       /* 放開後多久還沒塗完就標出漏掉的地方 */
    var COLORS = ['#E8685A', '#4A90D9', '#3FA46A', '#9B59B6', '#F08A24', '#1FA2A6', '#D6478C'];

    function fmtBest(v) { return v == null ? '' : '最少 ' + v + ' 次'; }

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
    /* 找出沒塗到的連通區域（用深度優先搜尋 + 堆疊 stack），回傳各區域的質心，最大的排前面；用來在漏掉的地方閃紅圈 */
    /* 找出沒塗到的連通區域（4 鄰接），回傳 [{x,y,size}]（質心），最大的在前，最多 limit 個 */
    /* seen 記錄已處理的格子，stack 是待處理格子的堆疊（後進先出） */
    function holes(m, limit) {
        var n = m.n, d = m.data, seen = new Uint8Array(n * n), out = [];
        var stack = new Int32Array(n * n);
        for (var s = 0; s < n * n; s++) {
            if (d[s] || seen[s]) continue;
            var sp = 0, sx = 0, sy = 0, cnt = 0;
            stack[sp++] = s; seen[s] = 1;
            while (sp) {
                var p = stack[--sp], px = p % n, py = (p - px) / n;
                sx += px; sy += py; cnt++;
                if (px > 0 && !d[p - 1] && !seen[p - 1]) { seen[p - 1] = 1; stack[sp++] = p - 1; }
                if (px < n - 1 && !d[p + 1] && !seen[p + 1]) { seen[p + 1] = 1; stack[sp++] = p + 1; }
                if (py > 0 && !d[p - n] && !seen[p - n]) { seen[p - n] = 1; stack[sp++] = p - n; }
                if (py < n - 1 && !d[p + n] && !seen[p + n]) { seen[p + n] = 1; stack[sp++] = p + n; }
            }
            out.push({ x: sx / cnt + 0.5, y: sy / cnt + 0.5, size: cnt });
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
            var idleTimer = null;
            var warnTimer = null;

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
            var brushWrap = h('div', { 'class': 'pa-brushwrap' }, [brush]);
            zone.appendChild(gauge);
            zone.appendChild(brushWrap);
            zone.appendChild(brushLabel);
            root.appendChild(info);
            root.appendChild(field);
            root.appendChild(zone);

            /* 已塗滿的百分比 */
            function paintedPct() { return (1 - mask.left / (SQ * SQ)) * 100; }
            /* 重新整理畫面上的文字、油漆量、筆刷大小與顏色 */
            function refresh() {
                var pct = paintedPct();
                /* 沒塗完不顯示 100%：用無條件捨去 */
                var shown = mask.left === 0 ? '100' : (Math.floor(pct * 10) / 10).toFixed(1);
                info.textContent = '沾了 ' + dips + ' 次油漆　已塗 ' + shown + '%';
                ctx.setMeta(kit.meta([fmtBest(Reaction.getBest(ID))]));
                gfill.style.width = (100 * budget / budgetMax).toFixed(1) + '%';
                brush.style.width = brush.style.height = D + 'px';
                brush.style.background = budget > 0 ? color : 'transparent';
                brush.style.borderColor = color;
                brush.classList.toggle('pa-brush--empty', budget <= 0);
                brushLabel.textContent = budget > 0 ? '油漆剩 ' + Math.round(100 * budget / budgetMax) + '%' : (dips === 0 ? '點圓形沾油漆' : '油漆用完了，點圓形再沾');
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
            brush.addEventListener('pointerdown', function (e) { e.preventDefault(); dip(); });

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
                my.cancel(idleTimer);
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
                armIdle();
            }
            /* 綁定手指事件；setPointerCapture 讓手指移出方塊外也持續收到事件 */
            field.addEventListener('pointerdown', onDown);
            field.addEventListener('pointermove', onMove);
            field.addEventListener('pointerup', onUp);
            field.addEventListener('pointercancel', onUp);
            /* 這一局結束時把事件監聽拿掉 */
            my.onDispose(function () {
                field.removeEventListener('pointerdown', onDown);
                field.removeEventListener('pointermove', onMove);
                field.removeEventListener('pointerup', onUp);
                field.removeEventListener('pointercancel', onUp);
            });

            /* 漏掉的地方：手指停下來一陣子後，在沒塗到的位置閃紅圈 */
            /* ─── 漏掉的地方：閒置一陣子就標出來 ─── */
            function clearMarks() { marks.innerHTML = ''; }
            function armIdle() {
                my.cancel(idleTimer);
                if (state !== 'play' || mask.left === 0) return;
                idleTimer = my.after(IDLE_HINT_MS, showHoles);
            }
            function showHoles() {
                if (state !== 'play' || pid != null || mask.left === 0) return;
                clearMarks();
                holes(mask, 12).forEach(function (hl) {
                    var m = h('div', { 'class': 'pa-mark' });
                    m.style.left = hl.x + 'px';
                    m.style.top = hl.y + 'px';
                    marks.appendChild(m);
                });
                my.cancel(idleTimer);
                idleTimer = my.after(2600, clearMarks);
            }

            /* ─── 完成 ─── */
            /* 完成：全部塗滿，算塗料利用率＝方塊面積 ÷ 所有筆畫掃過的面積（重複塗會降低） */
            function complete() {
                if (state !== 'play') return;
                state = 'done';
                pid = null; last = null;
                my.cancel(idleTimer); clearMarks();
                refresh();
                var isNew = Reaction.setBest(ID, dips, function (v, b) { return v < b; });
                ctx.setMeta(kit.meta([fmtBest(Reaction.getBest(ID))]));
                var eff = Math.min(100, SQ * SQ / Math.max(1, swept) * 100);
                warn.textContent = '全部塗滿了！';
                warn.classList.add('pa-warn--on', 'pa-warn--ok');
                Sfx.play('win');
                my.after(1100, function () {
                    kit.result(root, {
                        num: dips + ' 次', label: rating(dips),
                        lines: ['沾油漆 ' + dips + ' 次', '塗料利用率 ' + eff.toFixed(0) + '%（越高代表重複塗得越少）'],
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
                    last = null; armIdle();
                    return state;
                },
                holes: function () { return holes(mask, 50); },
                showHoles: showHoles
            };
        }

        round();
    }

    /* 遊戲身分證 */
    var G = {
        id: ID,
        name: '刷油漆',
        rule: '用手指把白色的正方形整個刷上顏色，一個角落、一條縫都不能漏。點下方的圓形沾油漆：每沾一次，筆刷會縮小 15%，而且只能刷方塊寬度 3 倍的長度，用完就要再沾。沾油漆的次數越少越厲害，小心別重複刷到已經塗過的地方！',
        mount: mount,
        /* test 匯出純函式給 Node 自動測試 */
        test: { makeMask: makeMask, stampDisc: stampDisc, stampSegment: stampSegment, holes: holes, brushAfter: brushAfter, BRUSH_MIN: BRUSH_MIN, SQ: SQ, BRUSH_START: BRUSH_START, BUDGET_MULT: BUDGET_MULT }
    };
    /* 登記到遊戲清單 */
    Reaction.register(G);
})();

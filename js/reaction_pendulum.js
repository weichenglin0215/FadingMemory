/* ═══════════════════════════════════════════════════════════════════
   reaction_pendulum.js — 秒反應・六點鐘方向
   鐘擺從五點鐘的位置出發，順時針往下擺過六點鐘、擺到七點鐘再擺回來（左右各 30 度），
   玩家點一下讓它「停住」，越接近正下方（六點鐘方向）越好。每一局只有一次機會，沒有關卡。
   結算時鏡頭以「針尖」為固定錨點持續推進，看清楚到底差了幾度（目標 0.00 度）。
   ───────────────────────────────────────────────────────────────────
   · 鐘擺的角度是「時間的純函式」：θ(t) = A·cos(2π·t/T)，不逐格累加。t=0 時 θ=+A=+30°
     （螢幕右邊＝五點鐘），之後先往 0°（六點鐘）擺＝順時針。
     點下去那一刻用事件的 e.timeStamp 代進去算停止角度，不用 rAF 當下影格的時間
     ——畫面就算卡了一下，成績也不會失真；rAF 被瀏覽器暫停時，點擊照樣算得出
     正確角度，結算流程全部用 setTimeout／補間保底推進，不會卡住。
   · 速度：週期 T 是 PERIOD_S＝1.5 秒（原本第 1 關是 3.0 秒，現在快成 200%），振幅固定 30°，
     最大角速度約 125°/秒，所以早按或晚按 10 毫秒就差 1 度多。沒有關卡、沒有過關門檻。
   · 鏡頭推進（跟「神準落下」「不可能任務」同一套手法）：整個畫面是一個 SVG，
     推進＝補間 viewBox；針尖在螢幕上的位置固定不動（錨點），倍率 ZOOMS＝
     [8, 80, 800]，每一段刻度精細 10 倍（×8 時 1° 一格、×80 時 0.1° 一格、
     ×800 時 0.01° 一格）。放大到「再放大紅線就會跑出畫面」為止。
     細刻度（0.1°、0.01°）本來就畫在那裡，只是放大前太細看不到，鏡頭推進時
     才淡入，像用顯微鏡發現本來就存在的刻度。
   · 成績：歷來最小的誤差（越小越好，顯示 4 位小數）。停住的那一刻用 Leaderboard.fake4() 產生一次
     「最終成績」（第 3、4 位不為 0），結算文字、評語、最佳紀錄都用這個數字；
     鏡頭推進（zoomPlan）仍然用真實的誤差，所以放大看到的是真實的刻度位置。
   ═══════════════════════════════════════════════════════════════════ */

/* （檔案結構說明見 js/reaction_sticks.js 開頭的「新手導讀」） */
(function () {
    'use strict';

    var ID = 'pendulum';

    /* 世界排行榜的成績規格（欄位說明見 js/leaderboard.js 開頭）；資料庫 MF_games 裡 pendulum 那一列要一致
       （node test/leaderboard/gen_games_sql.cjs 會從這裡產生 insert，test/reaction/t_leaderboard.js 會檢查兩邊是否一致）。 */
    var SCORE = { better: 'min', decimals: 4, format: '{v} 度', label: '誤差', min: 0, max: 31 };
    var h = UI.h;
    var kit = Reaction.kit;

    /* 設定集中在這一區 */
    /* ═══ 可以自己調的參數 ═══ */
    /* 擺長、支點位置、擺錘半徑、針長（邏輯 px） */
    var LEN = 360;           /* 擺長：支點到針尖的距離（邏輯 px） */
    var PIVOT_Y = 100;       /* 支點離欄位上緣多遠 */
    var BOB_R = 34;          /* 擺錘半徑 */
    var NEEDLE = 16;         /* 擺錘下方的針長度 */
    var ARC_MAX_DEG = 55;    /* 刻度盤畫到左右各幾度 */
    /* 起點與振幅：右邊五點鐘到左邊七點鐘各 30 度 */
    var START_DEG = 30;      /* 起點與振幅：五點鐘（右）到七點鐘（左）各 30 度 */
    /* 擺動週期 1.5 秒 */
    var PERIOD_S = 1.5;      /* 擺動週期（秒）：原本 3.0 秒的 200% 速度 */
    var ARM_MS = 400;        /* 每關開始後，前這麼久點了不算（避免上一關的手指殘留） */
    var FREEZE_MS = 500;     /* 點下去後定格多久才開始推進 */
    /* 結算時鏡頭放大的倍率：8 → 80 → 800 */
    var ZOOMS = [8, 80, 800];
    var ZOOM_MS = 1100;      /* 每一段推進的時間 */
    var ZOOM_HOLD_MS = 650;  /* 每一段推進完停留的時間 */
    var VIEW_RED_PX = 200;   /* 放大後，紅線離針尖最遠不能超過幾 px（超過就不再放大） */
    var LATENCY_COMP_MS = 0; /* 螢幕顯示約晚 1～2 影格；預設不補償，要補償才調 */
    /* 1 度對應弧線上幾 px（弧長 = 半徑 × 弧度） */
    var PX_PER_DEG = LEN * Math.PI / 180;   /* 1° 對應弧上幾 px（約 6.28） */

    /* 角度的顯示格式（四位小數） */
    function fmtDeg(v) { return v.toFixed(4); }
    function fmtBest(v) { return v == null ? '' : '最佳 ' + fmtDeg(v) + '°'; }

    /* 純函式（也給 Node 測試用） */
    /* ═══ 純函式（也給 Node 測試用）═══ */
    /* 鐘擺參數：固定值。phi=π/2 讓 sin 變成 cos，t=0 時正好在最右邊 */
    /* 鐘擺參數：固定的。phi＝π/2 讓 sin 變成 cos，t=0 時正好在最右邊（五點鐘） */
    function params() { return { A: START_DEG, T: PERIOD_S, phi: Math.PI / 2 }; }
    /* 角度（度）：正＝往螢幕右邊擺（五點鐘那一側）；從 +A 出發，先往 0（六點鐘）擺＝順時針 */
    /* 角度是「時間的純函式」：θ(t) = A·sin(2πt/T + φ)。點擊時用事件時間代進去算，不看畫面當下的影格，所以畫面卡頓也不影響成績 */
    function thetaAt(p, tSec) { return p.A * Math.sin(2 * Math.PI * tSec / p.T + p.phi); }

    /* 要推進到哪些倍率：紅線仍在畫面內的最大一段為止 */
    /* 要推進到哪些倍率：ZOOMS 裡「紅線仍在畫面內（≤ VIEW_RED_PX）」的最大一段為止；
       連 ×8 都放不下（誤差太大）就只放大到剛好放得下的倍率（至少 1，不放大）。 */
    function zoomPlan(errDeg) {
        var distAt1 = Math.abs(errDeg) * PX_PER_DEG;      /* 紅線距針尖（倍率 1 時的 px） */
        var stages = [];
        for (var i = 0; i < ZOOMS.length; i++) {
            if (distAt1 * ZOOMS[i] <= VIEW_RED_PX) stages.push(ZOOMS[i]);
            else break;
        }
        if (!stages.length) {
            var z = VIEW_RED_PX / Math.max(distAt1, 1e-9);
            if (z > 1.15) stages.push(Math.min(z, ZOOMS[0]));
        }
        return stages;
    }

    /* 依誤差給評語 */
    /* 評語 */
    function rating(err) {
        if (err < 0.05) return '神乎其技！';
        if (err < 0.2) return '高手！';
        if (err < 0.5) return '很準！';
        if (err < 1) return '不錯喔！';
        return '再試一次，會更準！';
    }

    /* mount：遊戲進場點 */
    function mount(root, ctx) {
        /* 舊版最佳紀錄只有兩位小數的真實誤差：第一次進來換算成「4 位、第 3／4 位不為 0」 */
        Reaction.migrateBest(ID, function (v) { return Leaderboard.fake4(v); });
        /* R：這一局的計時器管家 */
        var R = null;            /* 這一關的生命週期物件（kit.round） */
        var state = 'idle';

        function updateMeta() {
            ctx.setMeta(kit.meta([fmtBest(Reaction.getBest(ID))]));
        }

        /* round：開一局（只有一次機會） */
        function round() {
            if (R) R.dispose();
            R = kit.round();
            var my = R;
            root.innerHTML = '';
            state = 'swing';
            updateMeta();

            var hint = h('div', { 'class': 'hint', text: '點一下，讓鐘擺停在六點鐘方向' });
            var field = h('div', { 'class': 'pend-field' });
            root.appendChild(hint);
            root.appendChild(field);
            /* 操作提示（只在第一次進遊戲時）：點畫面任一處 → 手指縮放，放在畫面下方（不擋住鐘擺） */
            if (Reaction.kit.once('pendulum.hint')) Reaction.kit.hintOn(root, field, { mode: 'tap', fy: 0.9, text: '請點擊畫面' });

            /* FW／FH 場地大小；Px、Py 支點位置 */
            var FW = field.clientWidth, FH = field.clientHeight;
            var Px = FW / 2, Py = PIVOT_Y;
            /* SVG 畫布；viewBox 是畫布座標，結算時改 viewBox 就能做「鏡頭推進」 */
            var svg = kit.svg('svg', { 'class': 'pend-svg', viewBox: '0 0 ' + FW + ' ' + FH, preserveAspectRatio: 'none' }, field);
            var full = { vx: 0, vy: 0, vw: FW, vh: FH };

            /* 極座標轉換：從支點出發，角度 deg、距離 r 的位置（sin／cos） */
            function polar(deg, r) {
                var a = deg * Math.PI / 180;
                return { x: Px + r * Math.sin(a), y: Py + r * Math.cos(a) };
            }

            /* 刻度盤（1° 一格，5° 一條長刻度，0° 是紅線）；刻度以針尖所在半徑為中心上下對稱畫，放大 800 倍時才看得到 */
            /* ─── 刻度盤（第一層：1° 一格，5° 一條長刻度；0° 是紅線）───
               刻度「以針尖所在的半徑為中心」上下對稱畫（不是畫在弧外面一段距離）：
               鏡頭放大 800 倍時，哪怕只差 0.1 個世界座標單位也會變成 80 px，
               刻度離針尖太遠就會直接掉出畫面，看不到。 */
            var gArc = kit.svg('g', {}, svg);
            var a0 = polar(-ARC_MAX_DEG, LEN), a1 = polar(ARC_MAX_DEG, LEN);
            kit.svg('path', {
                'class': 'pend-arc', fill: 'none', 'vector-effect': 'non-scaling-stroke',
                d: 'M' + a0.x + ' ' + a0.y + ' A' + LEN + ' ' + LEN + ' 0 0 0 ' + a1.x + ' ' + a1.y
            }, gArc);
            /* 畫一條刻度線 */
            function tickLine(g, cls, deg, half) {
                var q0 = polar(deg, LEN - half), q1 = polar(deg, LEN + half);
                return kit.svg('line', { 'class': cls, 'vector-effect': 'non-scaling-stroke', x1: q0.x, y1: q0.y, x2: q1.x, y2: q1.y }, g);
            }
            for (var d = -ARC_MAX_DEG; d <= ARC_MAX_DEG; d++) {
                if (d !== 0) tickLine(gArc, 'pend-tick', d, d % 5 === 0 ? 7 : 4);
            }
            /* 時鐘數字：±30° 是 5 點與 7 點，正下方 0° 是 6 點 */
            /* 時鐘數字：±30° 是 5 點與 7 點（5 在右、7 在左），正下方 0° 是 6 點 */
            [[30, '5'], [0, '6'], [-30, '7']].forEach(function (n) {
                var tp = polar(n[0], LEN + 40);
                var t = kit.svg('text', {
                    'class': 'pend-num' + (n[0] === 0 ? ' pend-num--zero' : ''),
                    x: tp.x, y: tp.y, 'text-anchor': 'middle', 'dominant-baseline': 'central'
                }, gArc);
                t.textContent = n[1];
            });
            tickLine(gArc, 'pend-zero', 0, 14);

            /* 細刻度層（0.1°、0.01°）：停下來之後才依落點生出來，鏡頭推進時淡入 */
            /* ─── 細刻度層（停下來之後才依落點生出來，鏡頭推進時淡入）─── */
            var gFine2 = kit.svg('g', { opacity: 0 }, svg);
            var gFine3 = kit.svg('g', { opacity: 0 }, svg);

            /* 鐘擺本體（整組繞支點旋轉）：擺桿、擺錘、針 */
            /* ─── 鐘擺本體（整組繞支點旋轉）─── */
            var gPend = kit.svg('g', {}, svg);
            var bobCy = Py + LEN - NEEDLE - BOB_R;
            var rod = kit.svg('line', { 'class': 'pend-rod', 'vector-effect': 'non-scaling-stroke', x1: Px, y1: Py, x2: Px, y2: bobCy - BOB_R }, gPend);
            var bob = kit.svg('circle', { 'class': 'pend-bob', cx: Px, cy: bobCy, r: BOB_R }, gPend);
            kit.svg('line', { 'class': 'pend-needle', 'vector-effect': 'non-scaling-stroke', x1: Px, y1: bobCy + BOB_R, x2: Px, y2: Py + LEN }, gPend);
            var pivot = kit.svg('circle', { 'class': 'pend-pivot', cx: Px, cy: Py, r: 8 }, svg);

            /* 轉到角度 deg：SVG 的 rotate(角度 圓心x 圓心y) */
            function setAngle(deg) {
                gPend.setAttribute('transform', 'rotate(' + (-deg) + ' ' + Px + ' ' + Py + ')');
            }

            /* p 鐘擺參數；t0 這一局開始時間 */
            var p = params();
            var t0 = performance.now();
            setAngle(thetaAt(p, 0));
            /* my.loop：每個畫面更新一次，依時間算出角度 */
            var swing = my.loop(function (now) { setAngle(thetaAt(p, (now - t0) / 1000)); });

            /* 點下去：定格 */
            /* ─── 點下去：定格 ─── */
            var onDown = function (e) {
                if (state !== 'swing' || my.dead) return;
                if (e.target && e.target.closest && e.target.closest('button')) return;
                /* 開頭 400ms 內點了不算（避免上一局手指殘留） */
                if (performance.now() - t0 < ARM_MS) return;
                e.preventDefault();
                /* 用事件時間 kit.evT(e) 算停止角度 */
                stopAt(kit.evT(e) - t0 - LATENCY_COMP_MS);
            };
            root.addEventListener('pointerdown', onDown);
            my.onDispose(function () { root.removeEventListener('pointerdown', onDown); });

            /* 測試用：在指定時間直接停擺 */
            /* 測試用：在指定時間（距離這一關開始幾毫秒）直接停擺，繞過 ARM_MS */
            G.debug.stopAt = function (tMs) {
                if (state !== 'swing') return false;
                stopAt(tMs);
                return true;
            };
            G.debug.params = p;

            /* 停住：算出停止角度與誤差，針尖位置就是鏡頭推進的固定錨點 */
            /* tMs：從這關開始算起的毫秒數（debug.stopAt 也走這裡） */
            function stopAt(tMs) {
                if (state !== 'swing') return;
                state = 'freeze';
                /* 定格：停掉擺動迴圈，不然下一影格又會把角度改回去 */
                swing.stop();      /* 定格：停掉擺動迴圈，不然下一影格又會把角度改回去 */
                var theta = thetaAt(p, tMs / 1000);
                var err = Math.abs(theta);
                setAngle(theta);
                Sfx.play('click');
                hint.style.visibility = 'hidden';
                G.debug.last = { theta: theta, err: err };

                /* 針尖停下來的位置（世界座標）＝鏡頭推進的固定錨點 */
                var tip = polar(theta, LEN);
                var plan = zoomPlan(err);
                buildFine(theta, plan);

                /* my.wait 回傳 Promise；用 .then 把每一段放大串起來，一段完成才播下一段 */
                var chain = my.wait(FREEZE_MS);
                var cur = full;
                plan.forEach(function (z) {
                    chain = chain.then(function () {
                        Sfx.play('zoom');
                        var to = boxFor(tip, z);
                        /* kit.tweenViewBox：動畫修改 SVG 的 viewBox */
                        return kit.tweenViewBox(my, svg, cur, to, ZOOM_MS, kit.easeInOutCubic, onZoomFrame).then(function () {
                            cur = to;
                            return my.wait(ZOOM_HOLD_MS);
                        });
                    });
                });
                chain.then(function () { verdict(theta, err); });
            }

            /* 讓針尖在螢幕上的位置固定：算出放大後的 viewBox */
            /* 讓針尖在螢幕上的位置固定：針尖在完整畫面裡的相對位置 (tx/FW, ty/FH)，
               放大後的框裡要維持一模一樣 */
            function boxFor(tip, z) {
                var vw = FW / z, vh = FH / z;
                return { vx: tip.x - (tip.x / FW) * vw, vy: tip.y - (tip.y / FH) * vh, vw: vw, vh: vh };
            }

            /* 每個放大影格：太大倍率時隱藏看不到的圖形（省算圖），細刻度隨倍率淡入 */
            function onZoomFrame(b) {
                var z = FW / b.vw;
                /* 放大到 ×20 以上，擺錘／擺桿／支點都早就掉出畫面了；但它們放大 800 倍會變成半徑
                   數萬 px 的巨大圖形，瀏覽器光是光柵化這些看不到的東西就會卡到截圖逾時，
                   所以直接隱藏。 */
                var far = z > 20 ? 'none' : '';
                bob.style.display = far; rod.style.display = far; pivot.style.display = far;
                gFine2.setAttribute('opacity', kit.clamp((z - 6) / 30, 0, 1).toFixed(3));
                gFine3.setAttribute('opacity', kit.clamp((z - 60) / 300, 0, 1).toFixed(3));
            }

            /* 細刻度：只畫會被看到的那一小段 */
            /* 細刻度：只畫會被看到的那一小段（0° 到落點附近），數量很少 */
            function buildFine(theta, plan) {
                var lo = Math.min(0, theta), hi = Math.max(0, theta);
                function layer(g, step, half, from, to) {
                    var k0 = Math.floor(from / step), k1 = Math.ceil(to / step);
                    if (k1 - k0 > 240) return;
                    for (var k = k0; k <= k1; k++) {
                        var deg = k * step;
                        if (Math.abs(deg - Math.round(deg)) < step * 0.01) continue;   /* 整數度已有上一層刻度 */
                        tickLine(g, 'pend-tick pend-tick--fine', deg, half);
                    }
                }
                if (plan.length >= 2) layer(gFine2, 0.1, 0.4, lo - 0.6, hi + 0.6);
                if (plan.length >= 3) layer(gFine3, 0.01, 0.04, lo - 0.06, hi + 0.06);
            }

            /* 結算：顯示差了幾度與評語 */
            /* ─── 結算（只有一次機會：永遠是「再挑戰一次」）─── */
            function verdict(theta, realErr) {
                state = 'verdict';
                var side = Math.abs(theta) < 0.005 ? '' : (theta < 0 ? '偏左' : '偏右');
                /* 最終成績：第 3、4 位不為 0，只產生這一次（之後的評語、最佳紀錄、畫面文字都用它） */
                var err = Leaderboard.fake4(realErr);
                console.log('六點鐘方向：實際差 ' + realErr.toFixed(6) + ' 度 → 成績 ' + fmtDeg(err) + ' 度');
                var isNewErr = Reaction.setBest(ID, err, function (v, b) { return v < b; });
                updateMeta();

                var sfx = err < 0.05 ? 'perfect' : (err < 1 ? 'win' : 'fail');
                /* 結算彈窗（公版 kit.result）：貼在畫面上緣、背後不壓暗——針尖放大後的細節還要看得到；
                   帶 score 會在彈窗出現之後自動送世界排行榜 */
                kit.result(root, {
                    num: rating(err), label: err < 0.005 ? '差了 ' + fmtDeg(err) + ' 度・分毫不差！' : '差了 ' + fmtDeg(err) + ' 度',
                    lines: [side ? '針尖在紅線' + (theta < 0 ? '左' : '右') + '邊（' + side + '）' : '針尖正好壓在紅線上'],
                    isNew: isNewErr, score: err, dock: 'top', sfx: sfx, onAgain: round
                });
            }
        }

        /* G.debug：測試用後門 */
        G.debug = { last: null };
        round();
    }

    /* 遊戲身分證 */
    var G = {
        id: ID,
        name: '六點鐘方向',
        rule: '鐘擺從五點鐘的位置出發，順時針往下擺，**點一下讓它停住**，**越接近正下方（六點鐘方向）越好**。每局只有一次機會；停住後鏡頭會放大，告訴你差了幾度，目標是 0.0000 度！',
        mount: mount,
        /* 世界排行榜的成績規格 */
        score: SCORE,
        /* test 匯出純函式給 Node 自動測試 */
        test: { params: params, thetaAt: thetaAt, START_DEG: START_DEG, PERIOD_S: PERIOD_S, zoomPlan: zoomPlan, rating: rating, PX_PER_DEG: PX_PER_DEG }
    };
    /* 登記到遊戲清單 */
    Reaction.register(G);
})();

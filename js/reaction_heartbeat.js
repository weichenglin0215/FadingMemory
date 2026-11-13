/* ═══════════════════════════════════════════════════════════════════
   reaction_heartbeat.js — 秒反應・心跳複製（V1.57.0 改版）
   樣式：css/games/reaction_heartbeat.css（這款專屬的 class 一律以「heartbeat-」開頭；共用元件在 css/reaction_common.css）
   畫面上有 8 個白色圓形排成一圈（整圈的寬度是畫面的 90%）。**每一拍，圓形依序（順時針）亮起一種顏色**：
     · **藍色（圓裡有手指圖示）＝要點一下**；點對了，這個圓會變**綠色**；
     · **橘色＝不可以點**；點了，這個圓會變**紅色**（失誤）。
   藍色的圓如果在這一拍結束前沒點到，也算失誤（那個圓變紅色）。拍子越來越快，成績＝**正確點擊了幾次**。有 LIVES 次機會。
   ───────────────────────────────────────────────────────────────────
   · **點擊範圍是整個遊戲畫面**：不用點在圓形上，畫面任何位置都可以點（畫面上寫著「可點擊畫面任何位置」）。
   · 整個環形偏上方放置（RING_Y）：避免玩家的手指遮住環的下方。
   · 第 1 拍一定是藍色（教學：先讓玩家看到手指圖示，知道要點），之後每一拍獨立抽籤。
   · 控制參數（都可以自己調）：
       ① 頻率：拍子的間隔 INT_START（1.0 秒）→ INT_END（0.3 秒），**只有出現藍色（必須點擊）的拍才會讓間隔縮短**（V1.57.0 玩家意見）——
          橘色的拍不算，一直出橘色，間隔就一直維持不變；第 RAMP_BLUES（60）個藍色拍起維持最快；
       ② 藍色圓形出現的比例 BLUE_P：[第 1 拍, 到頂]，隨拍數線性變化（每一拍獨立抽籤，沒有「一定要有幾顆藍色」的規則）。
   · 判定看「這一刻畫面上亮的是什麼」：點的時候亮藍色且這一拍還沒點過＝點對；亮橘色＝點錯；同一拍多點的（已經點對、或已經點錯過）不再算。
   ═══════════════════════════════════════════════════════════════════ */

/* （檔案結構說明見 js/reaction_sticks.js 開頭的「新手導讀」） */
(function () {
    'use strict';

    var ID = 'heartbeat';

    /* 世界排行榜的成績規格（欄位說明見 js/leaderboard.js 開頭）；資料庫 MF_games 裡 heartbeat 那一列要一致
       （node test/leaderboard/gen_games_sql.cjs 會從這裡產生 insert，test/reaction/t_leaderboard.js 會檢查兩邊是否一致）。
       V1.57.0：成績的意思改了（原本是「撐過幾拍」，現在是「正確點擊幾次」）。 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 下', label: '正確點擊', min: 1, max: 1000 };
    var h = UI.h;
    var kit = Reaction.kit;

    /* 設定集中在這一區 */
    /* ═══ 可以自己調的參數 ═══ */
    /* 難度隨拍數線性變化到第 RAMP_BEATS 拍 */
    var RAMP_BEATS = 60;                   /* 藍色比例 BLUE_P 升到頂的拍數：第幾拍起維持最大 */
    var RAMP_BLUES = 60;                   /* 拍子的間隔縮短到最快所需的「藍色拍」數：第幾個藍色拍起維持最快（V1.57.0：只有藍色的拍才算，橘色不算） */
    /* 拍子的間隔（頻率）：1 秒線性縮短到 0.3 秒 */
    var INT_START = 1.0, INT_END = 0.3;    /* 拍子的間隔（秒）：第 1 個藍色拍 → 第 RAMP_BLUES 個藍色拍（橘色的拍不會讓間隔變短） */
    var BLUE_P = [0.50, 0.75];               /* 藍色圓形（要點）出現的比例：第 1 拍 → 第 RAMP_BEATS 拍；其餘是橘色（不能點） */
    var LIVES = 1;                                  /* 命數（失誤一次扣一條，用完就結束） */
    var GRACE_MS = 160;                    /* 點對之後多久內再點一下不算（雙擊保護，毫秒） */
    var N_CIRCLES = 8;                     /* 圓形有幾個（排成一圈，由正上方開始順時針） */
    var RING_W = 0.9;                      /* 整圈圓形的寬度是畫面（遊戲區）寬度的幾倍：0.9＝90% */
    var RING_Y = 0.36;                     /* 整個環形的中心在遊戲區高度的幾分之幾（0.5＝正中央；調小就往上移，避免手指遮住環的下方；最多只會移到環的上緣貼齊遊戲區上緣） */
    var CIRCLE_K = 0.36;                   /* 每個圓形的半徑是「圓心排成的那個圈的半徑」的幾倍（相鄰兩個圓不能重疊：0.38 以下） */
    var START_MS = 1200;                   /* 開局先等多久讓玩家就位，才開始第一拍（毫秒） */

    /* 最佳紀錄文字 */
    function fmtBest(v) { return v == null ? '' : '最佳 ' + v + ' 下'; }

    /* 食指圖示的路徑（跟共用的操作提示 kit.fingerHint 同一隻手，viewBox 48×60；指尖在 (17, 3)） */
    var FINGER_D = 'M17 3c-2.6 0-4.5 2-4.5 4.6V30l-3.4-3.6c-1.9-2-5-1.8-6.4.4-1 1.6-.7 3.6.7 5.1L16 49c2 2.2 4.8 3.4 7.8 3.4H33c5.6 0 10.2-4.600 10.200-10.200V27c0-2.500-2-4.500-4.500-4.500-.7 0-1.400.2-2 .5-.6-1.800-2.300-3-4.300-3-1.100 0-2.100.4-2.900 1.100-.8-1.700-2.400-2.800-4.300-2.800-.6 0-1.200.1-1.800.4V7.600C21.500 5 19.600 3 17 3z';
    var FINGER_BOX = { w: 48, h: 60, cx: 23, cy: 27 };    /* 食指圖示的畫布大小與視覺中心 */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    /* 已經出現 blueNo 個藍色拍（含這一拍）時，拍子的間隔（秒）；橘色的拍沿用目前的間隔（V1.57.0：只有藍色才會縮短） */
    function intervalFor(blueNo) { return kit.ramp(blueNo, INT_START, INT_END, RAMP_BLUES); }  /* kit.ramp(關卡, 起始值, 到頂值, 到頂關卡)：讓數值隨關卡「線性」從起始值變到到頂值（難度曲線的基本工具） */
    /* 排一拍：前面已經有 blueN 個藍色拍，這一拍是 blue（藍色）或不是 → { blueN（含這一拍）, spacing（這一拍到下一拍的間隔，秒）}。橘色的拍 blueN 不增加，所以間隔跟上一拍一樣 */
    function beatPlan(blueN, blue) { var n = blueN + (blue ? 1 : 0); return { blueN: n, spacing: intervalFor(Math.max(1, n)) }; }
    /* 第 beatNo 拍亮藍色（要點）的機率 */
    function blueFor(beatNo) { return Math.round(kit.ramp(beatNo, BLUE_P[0], BLUE_P[1], RAMP_BEATS) * 10000) / 10000; }
    /* 這一拍是不是藍色：依機率抽籤；第 1 拍一定是藍色（第一次玩，先讓玩家看到手指圖示、知道要點） */
    function pickBlue(beatNo, rand) { return beatNo === 1 || (rand || Math.random)() < blueFor(beatNo); }
    /* 第 beatNo 拍（從 1 算起）亮第幾個圓：由正上方（0）開始順時針，繞完一圈再從頭 */
    function circleOf(beatNo) { return (beatNo - 1) % N_CIRCLES; }
    /* 圓形的版面：W、Hh 是遊戲區的寬高（px）。整圈（含圓形）寬度 ＝ W × RING_W：圓心圈半徑 Rc ＋ 圓半徑 r ＝ W × RING_W ÷ 2，r ＝ Rc × CIRCLE_K */
    function ringLayout(W, Hh) {
        var Rc = W * RING_W / 2 / (1 + CIRCLE_K), r = Rc * CIRCLE_K;
        var total = 2 * (Rc + r), cy = Math.max(Hh * RING_Y, total / 2 + 6);       /* 環形偏上方放置（RING_Y），但最多只到「環的上緣離遊戲區上緣 6 px」 */
        return { cx: W / 2, cy: cy, Rc: Rc, r: r, total: total };
    }
    /* 第 i 個圓的圓心：由正上方開始順時針每 360/N 度一個 */
    function circlePos(i, lay) {
        var a = (-90 + i * 360 / N_CIRCLES) * Math.PI / 180;
        return { x: lay.cx + lay.Rc * Math.cos(a), y: lay.cy + lay.Rc * Math.sin(a) };
    }
    /* 玩家點了一下，這一拍（beat：{ blue, tapped, bad }，沒有就是 null）怎麼算：'hit'＝點對（藍色、這一拍第一次點）；'bad'＝點錯（橘色、這一拍第一次點）；'ignore'＝不算（沒有這一拍、或這一拍已經點過了） */
    function tapResult(beat) {
        if (!beat) return 'ignore';
        if (beat.blue) return beat.tapped ? 'ignore' : 'hit';
        return beat.bad ? 'ignore' : 'bad';
    }
    /* 這一拍結束了，算不算「漏掉」：藍色、而且一直沒點 */
    function missed(beat) { return !!(beat && beat.blue && !beat.tapped); }

    /* mount：遊戲進場點 */
    function mount(root, ctx) {
        var R = null;

        /* round：開一局 */
        function round() {
            if (R) R.dispose();
            R = kit.round();
            var my = R;
            root.innerHTML = '';                        /* innerHTML = ''：把元素裡面的東西全部清掉 */
            root.classList.add('heartbeat-screen');     /* 整個畫面都可以點（見 css：關掉瀏覽器的觸控手勢）；離開遊戲時拿掉 */
            my.onDispose(function () { root.classList.remove('heartbeat-screen'); });
            /* beatNo 目前第幾拍；cleared 正確點擊幾次；lives 機會；state 目前階段；cur 這一拍：{ n, idx, blue, tapped, bad } */
            var beatNo = 0, blueN = 0, cleared = 0, lives = LIVES, newRec = false, state = 'idle', cur = null, lastHit = -1e9;
            var nextAt = 0, timerId = null, mlog = [];
            /* 操作提示（只在第一次進遊戲時）：第一顆藍色圓出現時，手指擺在那顆圓上（見 startBeat）；玩家第一次碰畫面就不再提示 */
            var hintWanted = kit.once('heartbeat.hint'), hintObj = null;  /* kit.once(key)：同一個頁面只有第一次回傳 true（用來讓提示只出現一次） */
            root.addEventListener('pointerdown', function () { hintWanted = false; if (hintObj) { hintObj.remove(); hintObj = null; } }, { capture: true, once: true });  /* 指標事件（pointer）：手指與滑鼠通用，分成按下、移動、放開三種 */

            /* 建立畫面元素：標題、場地（SVG 畫 8 個圓＋下方的提示文字） */
            var head = h('div', { 'class': 'heartbeat-head' });
            var field = h('div', { 'class': 'heartbeat-field' });
            root.appendChild(head);                     /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
            root.appendChild(field);
            var W = field.clientWidth || 472, Hh = field.clientHeight || 600;
            var lay = ringLayout(W, Hh);
            var svg = kit.svg('svg', { 'class': 'heartbeat-svg', viewBox: '0 0 ' + W + ' ' + Hh }, field);  /* kit.svg(標籤, 屬性, 父元素)：建立 SVG 向量圖形元素（形狀、線條…），畫圖用，放大縮小不會糊 */
            var circles = [], fs = lay.r * 1.3 / FINGER_BOX.h;       /* fs：手指圖示的縮放（圖示高度約圓半徑的 1.3 倍） */
            for (var i = 0; i < N_CIRCLES; i++) {
                var p = circlePos(i, lay);
                var g = kit.svg('g', { 'class': 'heartbeat-c', transform: 'translate(' + p.x.toFixed(1) + ' ' + p.y.toFixed(1) + ')' }, svg);
                kit.svg('circle', { 'class': 'heartbeat-disc', r: lay.r.toFixed(1) }, g);
                kit.svg('path', { 'class': 'heartbeat-finger', d: FINGER_D, transform: 'translate(' + (-FINGER_BOX.cx * fs).toFixed(1) + ' ' + (-FINGER_BOX.cy * fs).toFixed(1) + ') scale(' + fs.toFixed(3) + ')' }, g);
                circles.push(g);
            }
            var tip = h('div', { 'class': 'heartbeat-tip', text: '藍色（手指）要點，橘色不能點\n可點擊畫面任何位置' });
            field.appendChild(tip);
            var hurt = h('div', { 'class': 'heartbeat-hurt' });
            field.appendChild(hurt);

            /* 圓的狀態：'' 白色、'blue' 藍色（要點）、'orange' 橘色（不能點）、'ok' 綠色（點對了）、'bad' 紅色（點錯或漏掉） */
            function setCircle(i, st) { circles[i].setAttribute('class', 'heartbeat-c' + (st ? ' heartbeat-c--' + st : '')); }
            /* 更新標題列右側的小字與標題 */
            function meta() { ctx.setMeta(kit.meta(['機會 ' + lives, fmtBest(Reaction.getBest(ID))])); }  /* Reaction.getBest／setBest：讀／寫這款遊戲的個人最佳紀錄（存在手機的 localStorage） */
            function paintHead(extra) {
                head.textContent = '點對 ' + cleared + ' 次　每拍 ' + intervalFor(Math.max(1, blueN)).toFixed(4) + ' 秒' + (extra ? '　' + extra : '');  /* textContent：設定元素裡的文字（安全，不會被當成 HTML 解析） */
            }
            meta(); paintHead();

            /* 一拍：先結算上一拍（藍色沒點到＝漏掉）、上一個圓變回白色，再讓下一個圓亮起這一拍的顏色，並排下一拍 */
            function startBeat() {
                if (state !== 'run') return;
                closeBeat();
                if (state !== 'run') return;
                beatNo++;
                var blue = pickBlue(beatNo, Math.random), idx = circleOf(beatNo), plan = beatPlan(blueN, blue), spacing = plan.spacing;
                blueN = plan.blueN;                      /* 只有藍色的拍才會增加（間隔因此縮短），橘色的拍不會 */
                cur = { n: beatNo, idx: idx, blue: blue, tapped: false, bad: false };
                setCircle(idx, blue ? 'blue' : 'orange');
                Sfx.play('kick');                       /* Sfx.play(名稱)：播放音效（ok 答對、bad 答錯、click 點擊…；音效是程式即時合成的） */
                try { console.info('[心跳複製] 第 ' + beatNo + ' 拍：第 ' + (idx + 1) + ' 個圓亮' + (blue ? '藍色（要點）' : '橘色（不能點）') + '；間隔 ' + spacing.toFixed(3) + ' 秒（已有 ' + blueN + ' 個藍色拍）；藍色機率 ' + blueFor(beatNo)); } catch (e) { }
                if (blue && hintWanted && !hintObj) hintObj = kit.hintOn(root, circles[idx], { mode: 'tap', text: '可點擊畫面任何位置' });
                paintHead();
                /* 排下一拍：絕對時間 nextAt 累加（不是現在＋間隔），所以不會累積誤差 */
                nextAt += spacing * 1000;
                timerId = my.after(Math.max(0, nextAt - performance.now()), startBeat);  /* performance.now()：高精度的時間（毫秒），計時用 */
            }
            /* 這一拍結束：藍色沒點＝漏掉（圓閃紅色 220 毫秒再變回白色）；其他情況圓直接變回白色 */
            function closeBeat() {
                var b = cur;
                if (!b) return;
                cur = null;
                if (missed(b)) {
                    var idx = b.idx;
                    setCircle(idx, 'bad'); my.after(220, function () { setCircle(idx, ''); });
                    mistake('漏掉了藍色的圓');
                } else setCircle(b.idx, '');
            }
            /* 點擊：整個遊戲畫面（root）任何位置都算 */
            function tap() {
                if (state !== 'run') return;
                var now = performance.now();
                if (now - lastHit < GRACE_MS) return;      /* 剛點對的，雙擊保護 */
                var r = tapResult(cur);
                if (r === 'hit') {
                    cur.tapped = true; lastHit = now; cleared++;
                    setCircle(cur.idx, 'ok');
                    Sfx.play('ok');
                    if (Reaction.setBest(ID, cleared, function (v, b) { return v > b; })) newRec = true;
                    if (hintObj) { hintObj.remove(); hintObj = null; }
                    meta(); paintHead();
                } else if (r === 'bad') {
                    cur.bad = true;
                    setCircle(cur.idx, 'bad');
                    mistake('點到橘色的圓');
                }
            }
            root.addEventListener('pointerdown', onDown);
            function onDown(e) { if (state !== 'run') return; e.preventDefault(); tap(); }  /* preventDefault：取消瀏覽器的預設動作（例如拖曳時的捲動、文字選取） */
            my.onDispose(function () { root.removeEventListener('pointerdown', onDown); });
            /* 失誤：扣一次機會、閃紅光，機會用完就結束 */
            function mistake(why) {
                if (state !== 'run') return;
                lives--;
                mlog.push({ beat: beatNo, why: why, t: Math.round(performance.now()) });
                Sfx.play('bad');
                hurt.classList.remove('heartbeat-hurt--on'); void hurt.offsetWidth; hurt.classList.add('heartbeat-hurt--on');  /* classList.add／remove／toggle：加上／拿掉 CSS class，元素的外觀就跟著變 */
                meta();
                paintHead(why);
                if (lives <= 0) gameOver(why);
            }
            /* 遊戲結束：顯示結算 */
            function gameOver(why) {
                state = 'over';
                my.cancel(timerId);
                my.after(900, function () {
                    kit.result(root, {                  /* kit.result：顯示結算卡片（成績、評語、再玩一次…），並自動記最佳紀錄、送世界排行榜 */
                        score: cleared,        /* 世界排行榜成績（跟 setBest 存的同一個數字） */
                        num: cleared + ' 下', label: cleared >= 30 ? '節奏感超強！' : (cleared >= 10 ? '跟上節奏了！' : '節奏亂掉了'),
                        lines: ['最後一次失誤：' + why, '最快的間隔 ' + intervalFor(Math.max(1, blueN)).toFixed(4) + ' 秒'],
                        isNew: newRec, sfx: cleared >= 30 ? 'win' : 'fail', onAgain: round
                    });
                });
            }

            /* 開始：先等一下讓玩家就位，再來第一拍 */
            head.textContent = '準備…藍色的圓亮起就點，橘色不要點';
            my.after(START_MS, function () {
                state = 'run';
                nextAt = performance.now();
                startBeat();
            });

            /* G.debug：測試用後門，autoplay 可以自動全部點對（藍色就點、橘色不點） */
            G.debug = {
                state: function () { return { state: state, beatNo: beatNo, blueN: blueN, cleared: cleared, lives: lives, cur: cur ? { n: cur.n, idx: cur.idx, blue: cur.blue, tapped: cur.tapped, bad: cur.bad } : null }; },
                tap: function () { tap(); },
                circleClass: function (i) { return circles[i].getAttribute('class'); },
                autoplay: function (on) {
                    if (R.auto) { clearInterval(R.auto); R.auto = null; }
                    if (on) R.auto = setInterval(function () { if (cur && cur.blue && !cur.tapped) tap(); }, 10);
                },
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
        rule: '畫面上有 8 個白色圓形排成一圈，**圓形會依序亮起顏色**：**藍色（有手指圖示）要點一下，橘色不能點**。點對的圓形會變綠色，點錯的會變紅色，漏掉藍色的圓也算失誤。拍子會越來越快，但**只有藍色的圓出現才會變快**（一直出橘色，速度不變），有 3 次機會，看你能正確點擊幾次。**點擊範圍是整個畫面**，可點擊畫面任何位置，不用點在圓形上。',
        mount: mount,
        /* 世界排行榜的成績規格 */
        score: SCORE,
        /* test 匯出純函式給 Node 自動測試 */
        test: { intervalFor: intervalFor, beatPlan: beatPlan, RAMP_BLUES: RAMP_BLUES, RING_Y: RING_Y, blueFor: blueFor, pickBlue: pickBlue, circleOf: circleOf, ringLayout: ringLayout, circlePos: circlePos, tapResult: tapResult, missed: missed, RAMP_BEATS: RAMP_BEATS, INT_START: INT_START, INT_END: INT_END, BLUE_P: BLUE_P, N_CIRCLES: N_CIRCLES, RING_W: RING_W, CIRCLE_K: CIRCLE_K, LIVES: LIVES, GRACE_MS: GRACE_MS, START_MS: START_MS }
    };
    /* 登記到遊戲清單 */
    Reaction.register(G);
})();

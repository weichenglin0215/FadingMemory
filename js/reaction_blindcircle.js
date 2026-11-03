/* ═══════════════════════════════════════════════════════════════════
   reaction_blindcircle.js — 秒反應・盲畫一個圓
   樣式：css/games/reaction_blindcircle.css（這款專屬的 class 一律以「blindcircle-」開頭；共用元件在 css/reaction_common.css）
   畫面只有「圓心」與「起點」兩個記號，起點在圓心的右下方（右手畫的圓弧不容易被手遮住）。
   從起點出發，繞圓心畫一圈回到起點——畫的過程中看不到自己的筆跡。只有一次機會。
   V1.25（玩家意見）：起點的記號由橘色圓點改成「十字型的箭頭」（上下左右四個箭頭，總寬 ARROW 200 px，手指壓在中心，
   箭頭仍超出手指）；畫的過程中不再有藍色圓點；圓的半徑加大（R 180～215 px），起點跟著往外移，圓可以畫得更大。
   V1.27（玩家意見）：十字箭頭縮小成 75%（200 → 150 px）；手指拖曳時用 1px 黑色虛線顯示軌跡，但軌跡只留手指身後
   TRAIL_LEN（160 px）的長度，更早畫過的部分會自動消失，玩家看不到完整的筆跡（維持「盲畫」的難度）。
   ───────────────────────────────────────────────────────────────────
   · 目標圓：圓心 C、半徑 R ＝ |起點 − C|（R 每次隨機），起點方位在右下象限 ANG_MIN～ANG_MAX 度。
   · 取樣：每 STEP px 重新取樣（沿弧長等距），算每點到圓心的距離 r，與 R 比較。
   · 圓度 ＝ 100 − RMS(r − R) ÷ R × 100（%，越大越好）；繞行角度要在 TURN_MIN～TURN_MAX 度，否則
     「再畫一次」（不算一次機會）。
   · 揭曉：標準圓（綠色虛線）＋你的筆跡（依偏離量上色：±2% 綠、±5% 橘、更大紅）。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    /* 新手導讀：整個檔案包在 (function () { ... })(); 裡（叫「立即執行函式」），裡面的變數都是這個檔案私有的，不會跟別的遊戲檔案的同名變數打架。
       檔案由上往下大致分成：① 參數區（標題寫著可以自己調整的參數：難度、秒數、文字大多在這）；② 純函式（只做計算、不碰畫面：出題、判斷對錯，單元測試直接測它們）；③ 畫面（mount 是進場、setup 是每一關開始時呼叫，負責把畫面建出來並處理點擊）。
       最後的 Reaction.register(G) 把這款遊戲「登記」給選單（沒有這行，選單就看不到它）。'use strict' 是嚴格模式：打錯變數名稱會直接報錯，而不是默默建立新變數。
       這款遊戲的代號是 'blindcircle'：選單、成績、存檔都靠它；樣式在 css/games/reaction_blindcircle.css，裡面的 class 名稱一律以 blindcircle- 開頭。 */
    'use strict';

    var ID = 'blindcircle';                             /* 這款遊戲的代號：選單、成績、存檔、CSS class 前綴都用它 */
    var SCORE = { better: 'max', decimals: 4, format: '{v}%', label: '圓度', min: 0, max: 100 };  /* 成績規格：better（max＝越大越好、min＝越小越好）、decimals 小數位數、format 顯示格式、label 名稱、min／max 合理範圍（超出範圍的成績不會送排行榜） */
    var h = UI.h, kit = Reaction.kit;                   /* h：建立網頁元素的小工具；kit：闖關遊戲共用的工具箱 */

    /* ═══ 可以自己調的參數 ═══ */
    var CENTER = { x: 236, y: 318 };        /* 圓心（舞台座標） */
    var R_MIN = 180, R_MAX = 215;           /* 半徑範圍（px）：盡量大，手機上才好畫 */
    var ARROW = 150;                        /* 起點十字箭頭的總寬、總高（px）（V1.27：200 → 150，縮小成 75%） */
    var TRAIL_LEN = 160;                    /* 拖曳時畫出的虛線軌跡長度（px）：只留手指身後這麼長，更早的筆跡自動消失 */
    var ANG_MIN = 20, ANG_MAX = 70;         /* 起點方位（從圓心往右下，度） */
    var START_R = 56;                       /* 手指要在起點多近的地方按下才算（px） */
    var STEP = 4;                           /* 重新取樣的弧長間距（px） */
    var TURN_MIN = 300, TURN_MAX = 450;     /* 有效的繞行總角度（度） */
    var LEN_MIN = 200;                      /* 有效的筆畫長度下限（px） */
    var GOOD = 0.02, OK = 0.05;             /* 揭曉上色門檻（相對半徑） */
    /* 干擾用的動態條紋背景（共用元件 js/reaction_bgstripe.js，各欄位的意思見該檔開頭）：from 是從第幾關開始出現（想關掉改成 0，想晚一點出現就調大）；數字寫成 [起, 終] 會從第 from 關起漸漸變強 */
    var BG = { from: 1, type: 'spiral', diff: 4, width: 64, move: 'none', spin: 40 };  /* 單回合遊戲，一開始就有：螺紋、亮度差 4%、帶寬 28px、不平移、每秒順時針轉 5 度 */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    /* 出一回合：隨機決定圓的半徑 R 與起點方位 ang（從圓心往右下的角度），算出起點座標（圓心 ＋ R×(cos, sin)，三角函數把「角度」換成「x、y 座標」） */
    function makeRound(rand) {
        rand = rand || Math.random;                     /* 沒有傳亂數函式就用 Math.random（測試時可以傳固定的亂數，結果才能重現） */
        var R = kit.randFloat(R_MIN, R_MAX, rand), ang = kit.randFloat(ANG_MIN, ANG_MAX, rand) * Math.PI / 180;  /* kit.randFloat(最小, 最大, rand)：隨機小數 */
        return { R: R, ang: ang, start: { x: CENTER.x + R * Math.cos(ang), y: CENTER.y + R * Math.sin(ang) } };
    }
    /* 十字型箭頭（上下左右四個箭頭）的多邊形頂點，中心在 (0,0)，總寬 size：
       每個箭頭的頭長 ＝ 0.19 × size、頭半寬 ＝ 0.12 × size，桿半寬 ＝ 0.04 × size */
    /* 算「十字型箭頭」多邊形的頂點座標（中心在 0,0，總寬 size）：上下左右四個箭頭，頭長、頭寬、桿寬都是 size 的固定比例，畫成 SVG 的 polygon（多邊形） */
    function arrowPoints(size) {
        var a = size / 2, hl = size * 0.19, hw = size * 0.12, sw = size * 0.04, b = a - hl;
        var pts = [[0, -a], [hw, -b], [sw, -b], [sw, -sw], [b, -sw], [b, -hw], [a, 0], [b, hw], [b, sw], [sw, sw], [sw, b], [hw, b],
        [0, a], [-hw, b], [-sw, b], [-sw, sw], [-b, sw], [-b, hw], [-a, 0], [-b, -hw], [-b, -sw], [-sw, -sw], [-sw, -b], [-hw, -b]];
        return pts;
    }
    /* 折線最後面 maxLen（px）長的那一段：從最新的點往回數，累積長度超過 maxLen 的那一段線段只留一部分（剛好湊滿 maxLen） */
    /* 取折線「最後面」maxLen 長的那一段（只畫手指身後一小段，更早的筆跡消失）：從最新的點往回數，累積長度超過 maxLen 的那一段線只留一部分 */
    function tailOf(pts, maxLen) {
        if (!pts.length) return [];
        var out = [pts[pts.length - 1]], acc = 0;
        for (var i = pts.length - 2; i >= 0; i--) {
            var a = pts[i], b = pts[i + 1], dx = a.x - b.x, dy = a.y - b.y, d = Math.sqrt(dx * dx + dy * dy);  /* Math.sqrt：開根號（算兩點距離時常用：勾股定理） */
            if (acc + d >= maxLen) {
                var t = d > 0 ? (maxLen - acc) / d : 0;
                out.push({ x: b.x + dx * t, y: b.y + dy * t });
                break;
            }
            acc += d; out.push(a);
        }
        return out.reverse();
    }
    /* 沿折線每隔 step 重新取樣（弧長等距），回傳點陣列 */
    /* 重新取樣：沿著折線每隔 step 的弧長取一個點，讓點的間距均勻（手指快慢不同時，原本的點疏密不一） */
    function resample(pts, step) {
        var out = [pts[0]], acc = 0, prev = pts[0];
        for (var i = 1; i < pts.length; i++) {
            var p = pts[i], dx = p.x - prev.x, dy = p.y - prev.y, d = Math.sqrt(dx * dx + dy * dy);
            while (acc + d >= step && d > 0) {
                var t = (step - acc) / d;
                prev = { x: prev.x + dx * t, y: prev.y + dy * t };
                out.push(prev);
                dx = p.x - prev.x; dy = p.y - prev.y; d = Math.sqrt(dx * dx + dy * dy); acc = 0;
            }
            acc += d; prev = p;
        }
        return out;
    }
    /* 算折線的總長度（相鄰兩點距離相加，距離用勾股定理） */
    function lengthOf(pts) {
        var s = 0;
        for (var i = 1; i < pts.length; i++) { var dx = pts[i].x - pts[i - 1].x, dy = pts[i].y - pts[i - 1].y; s += Math.sqrt(dx * dx + dy * dy); }
        return s;
    }
    /* 分析筆跡：turn 繞圓心轉過的總角度（度，有號）、rms 相對半徑的均方根偏離、meanR 平均半徑、gap 首尾間距 */
    /* 分析筆跡：繞圓心 C 轉過的總角度（用 Math.atan2 算每個點的方位角，相鄰兩點的角度差累加）、每個點離圓心的距離與標準半徑 R 的差（devs）、
       均方根偏離（rms，越小越圓）、平均半徑、首尾間距。valid 代表有效（繞了 300～450 度、而且夠長）；roundness（圓度）＝ 100 − rms／R×100。 */
    function analyze(pts, C, R) {
        var rs = resample(pts, STEP);
        if (rs.length < 3) return { valid: false, turn: 0, len: lengthOf(pts) };
        var turn = 0, prevA = Math.atan2(rs[0].y - C.y, rs[0].x - C.x), sum2 = 0, sumR = 0, devs = [];
        for (var i = 0; i < rs.length; i++) {
            var a = Math.atan2(rs[i].y - C.y, rs[i].x - C.x), r = Math.sqrt(Math.pow(rs[i].x - C.x, 2) + Math.pow(rs[i].y - C.y, 2));
            var da = a - prevA; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
            if (i > 0) turn += da;
            prevA = a; sum2 += (r - R) * (r - R); sumR += r; devs.push((r - R) / R);
        }
        var turnDeg = turn * 180 / Math.PI, len = lengthOf(pts);
        var rms = Math.sqrt(sum2 / rs.length);
        var gap = Math.sqrt(Math.pow(rs[0].x - rs[rs.length - 1].x, 2) + Math.pow(rs[0].y - rs[rs.length - 1].y, 2));
        return {
            valid: Math.abs(turnDeg) >= TURN_MIN && Math.abs(turnDeg) <= TURN_MAX && len >= LEN_MIN,  /* Math.abs：取絕對值（去掉負號） */
            turn: turnDeg, len: len, rms: rms, meanR: sumR / rs.length, gap: gap, devs: devs, samples: rs,
            roundness: Math.max(0, 100 - rms / R * 100)
        };
    }
    /* 結算畫面的評語：依成績回傳一句話 */
    function rating(v) {
        if (v >= 99) return '神乎其技！';
        if (v >= 97) return '高手！';
        if (v >= 94) return '很圓！';
        if (v >= 90) return '不錯喔！';
        return '再試一次，會更圓！';
    }

    /* mount：選單按下這款遊戲時會呼叫它。把「單回合計時」的流程（開始、計時、結算、最佳紀錄）交給共用骨架 kit.single，我們只提供 setup（怎麼畫）、rating（評語）等小零件。 */
    function mount(root, ctx) {
        kit.single(root, ctx, {
            id: ID, G: G, better: 'max', max: SCORE.max,
            title: '從起點出發，繞圓心畫一圈回到起點（筆跡會消失）',
            numText: function (v) { return v.toFixed(4) + '%'; },
            rating: rating,
            sfx: function (v) { return v >= 97 ? 'perfect' : (v >= 90 ? 'win' : 'fail'); },
            setup: setup
        });
    }

    /* setup(api)：每一關開始時呼叫一次，負責出題並把這一關的畫面建出來。api 是共用骨架給的工具：api.stage（這一關的畫面容器）、api.level（第幾關）、
       api.after（延遲執行，換關後自動作廢）、api.timer（倒數計時）、api.pass／api.fail（過關／失敗）。 */
    function setup(api) {
        var stage = api.stage, my = api.my;
        kit.bgStripe(stage, my, 1, BG);                 /* 在舞台最底下墊一層淡淡的旋轉螺紋，干擾對「圓」的感覺（單回合遊戲沒有關卡，一律當第 1 關） */
        var W = stage.clientWidth || 472, H = stage.clientHeight || 640;
        var cfg = makeRound(), pts = [], drawing = false, locked = false, hint = null, pid = null;  /* cfg：這一回合的圓（半徑、起點）；pts：手指畫過的點；drawing：正在畫；locked：已經交卷；hint：操作提示；pid：目前這根手指的編號（多指時只認第一根） */
        console.log('[盲畫一個圓] 半徑 ' + cfg.R.toFixed(2) + '，起點方位 ' + (cfg.ang * 180 / Math.PI).toFixed(1) + '°');  /* 在瀏覽器主控台（按 F12）印出這一關的出題內容，方便除錯與驗證 */

        var svg = kit.svg('svg', { 'class': 'blindcircle-svg', viewBox: '0 0 ' + W + ' ' + H, width: W, height: H }, stage);  /* kit.svg(標籤, 屬性, 父元素)：建立 SVG 向量圖形元素（形狀、線條…），畫圖用，放大縮小不會糊 */  /* 畫布：整個畫面是一張 SVG（向量圖），用 viewBox 對應舞台的邏輯座標；gRev 是揭曉時放標準圓與上色筆跡的群組 */
        var gRev = kit.svg('g', {}, svg);
        /* 圓心十字與起點 */
        var cx = CENTER.x, cy = CENTER.y;
        kit.svg('line', { x1: cx - 16, x2: cx + 16, y1: cy, y2: cy, 'class': 'blindcircle-cross' }, svg);
        kit.svg('line', { x1: cx, x2: cx, y1: cy - 16, y2: cy + 16, 'class': 'blindcircle-cross' }, svg);
        /* 起點：十字型的箭頭（150px），中心是真正的起點，再加一個小黑點標出正中心 */
        var dot = kit.svg('polygon', { points: arrowPoints(ARROW).map(function (p) { return (cfg.start.x + p[0]).toFixed(1) + ',' + (cfg.start.y + p[1]).toFixed(1); }).join(' '), 'class': 'blindcircle-start' }, svg);  /* map：把陣列的每個元素轉換成別的東西，回傳新陣列 */
        kit.svg('circle', { cx: cfg.start.x, cy: cfg.start.y, r: 4, 'class': 'blindcircle-startdot' }, svg);
        var trail = kit.svg('polyline', { 'class': 'blindcircle-trail', points: '' }, svg);          /* 手指身後 160px 的黑色虛線軌跡 */
        var msg = h('div', { 'class': 'blindcircle-msg' });
        stage.appendChild(msg);                         /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
        /* 更新手指身後的虛線：只取最後 TRAIL_LEN 長的一段，轉成 SVG polyline 的 points 屬性（"x,y x,y …"） */
        function paintTrail() {
            trail.setAttribute('points', tailOf(pts, TRAIL_LEN).map(function (p) { return p.x.toFixed(1) + ',' + p.y.toFixed(1); }).join(' '));  /* setAttribute：設定元素的 HTML 屬性（例如 aria-label、data-xxx） */
        }

        /* 操作提示（只在第一次進遊戲時）：手指＋箭頭，從起點出發，沿著圓的切線方向（順時針）重複移動 */
        var tx = -Math.sin(cfg.ang), ty = Math.cos(cfg.ang);
        if (kit.once('blindcircle.hint')) hint = kit.fingerHint(stage, { mode: 'drag', x: cfg.start.x, y: cfg.start.y, dx: tx * 80, dy: ty * 80, delay: 300, text: '請繞著圓心畫一圈' });  /* kit.once(key)：同一個頁面只有第一次回傳 true（用來讓提示只出現一次） */
        /* 拿掉操作提示 */
        function hideHint() { if (hint) { hint.remove(); hint = null; } }
        /* 在畫面上顯示一段提示文字（空字串就隱藏） */
        function say(t) { msg.textContent = t; msg.classList.toggle('blindcircle-msg--on', !!t); }  /* classList.add／remove／toggle：加上／拿掉 CSS class，元素的外觀就跟著變（class 的樣式寫在 css 檔裡） */

        /* 把事件的螢幕座標換成舞台裡的座標（舞台會跟著視窗縮放，不能直接用螢幕座標） */
        function loc(e) { return kit.localPt(e, stage); }
        stage.addEventListener('pointerdown', function (e) {  /* 指標事件（pointer）：手指與滑鼠通用，分成按下、移動、放開三種 */
            if (locked || drawing) return;
            var p = loc(e), dx = p.x - cfg.start.x, dy = p.y - cfg.start.y;
            if (Math.sqrt(dx * dx + dy * dy) > START_R) { dot.classList.add('blindcircle-start--blink'); my.after(500, function () { dot.classList.remove('blindcircle-start--blink'); }); say('請從起點的圓點開始畫'); return; }
            e.preventDefault();                         /* preventDefault：取消瀏覽器的預設動作（例如拖曳時的捲動、文字選取） */
            try { stage.setPointerCapture(e.pointerId); } catch (err) { }  /* setPointerCapture：手指移出元素範圍後，仍然持續收到這個元素的移動事件（拖曳才不會中斷） */
            drawing = true; pid = e.pointerId; pts = [p]; hideHint(); say(''); paintTrail();
        });
        stage.addEventListener('pointermove', function (e) {
            if (!drawing || e.pointerId !== pid) return;
            pts.push(loc(e));                                          /* 只畫手指身後 TRAIL_LEN 長的虛線，前面的筆跡消失（盲畫） */
            paintTrail();
        });
        /* 手指放開：先 analyze 分析筆跡；筆跡無效（沒繞完整一圈、太短、太多圈）就提示重畫，有效就交卷（submit） */
        function end(e) {
            if (!drawing || e.pointerId !== pid) return;
            drawing = false; trail.setAttribute('points', '');
            var res = analyze(pts, CENTER, cfg.R);
            if (!res.valid) {
                say(Math.abs(res.turn) < TURN_MIN ? '要繞圓心畫完整一圈，再畫一次' : (res.len < LEN_MIN ? '再畫大一點，再畫一次' : '畫太多圈了，再畫一次'));
                pts = []; Sfx.play('bad');              /* Sfx.play(名稱)：播放音效（ok 答對、bad 答錯、click 點擊…；音效是程式即時合成的） */
                return;
            }
            submit(res);
        }
        stage.addEventListener('pointerup', end);
        stage.addEventListener('pointercancel', end);

        /* 交卷與揭曉：畫出標準圓，並把筆跡每一小段依偏離程度上色（綠＝很準、橘＝還好、紅＝偏很多），顯示平均半徑偏差與首尾缺口，最後呼叫 api.finish 結算（成績＝圓度 %） */
        function submit(res) {
            if (locked) return;
            locked = true; hideHint();
            Sfx.play('click');
            /* 揭曉：標準圓＋依偏離上色的筆跡 */
            kit.svg('circle', { cx: cx, cy: cy, r: cfg.R, 'class': 'blindcircle-ref' }, gRev);
            var s = res.samples;
            for (var i = 1; i < s.length; i++) {
                var d = Math.abs(res.devs[i]);
                kit.svg('line', { x1: s[i - 1].x, y1: s[i - 1].y, x2: s[i].x, y2: s[i].y, 'class': 'blindcircle-seg ' + (d <= GOOD ? 'blindcircle-seg--g' : (d <= OK ? 'blindcircle-seg--o' : 'blindcircle-seg--r')) }, gRev);
            }
            var more = res.meanR - cfg.R;
            say('平均半徑' + (more >= 0 ? '偏大 ' : '偏小 ') + Math.abs(more).toFixed(4) + ' 像素　首尾間距 ' + res.gap.toFixed(4) + ' 像素');
            my.after(2300, function () {
                api.finish(res.roundness, {
                    lines: [
                        '平均半徑' + (more >= 0 ? '偏大 ' : '偏小 ') + Math.abs(more).toFixed(4) + ' 像素',
                        '首尾沒接上的缺口 ' + res.gap.toFixed(4) + ' 像素',
                        '只有一次機會，想拚更圓就再挑戰一次'
                    ]
                });
            });
        }

        /* 驗證用：用真的 PointerEvent 畫一圈（noise＝半徑的隨機抖動比例；scale＝整圈半徑倍率） */
        /* 測試用：用程式送出一個真的 PointerEvent（指標事件）給舞台，模擬手指按下／移動／放開 */
        function fire(type, x, y) {
            var r = stage.getBoundingClientRect(), sc = r.width / (stage.clientWidth || r.width);  /* getBoundingClientRect：取得元素在螢幕上的位置與大小（算點擊位置、版面用） */
            stage.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 9, clientX: r.left + x * sc, clientY: r.top + y * sc }));
        }
        /* 測試用：模擬手指畫一圈（noise 半徑隨機抖動的比例、scale 半徑倍率、turns 繞幾圈） */
        function drawCircle(noise, scale, turns) {
            var R = cfg.R * (scale || 1), n = 90, t = turns || 1;
            fire('pointerdown', cfg.start.x, cfg.start.y);
            for (var i = 1; i <= n; i++) {
                var a = cfg.ang + 2 * Math.PI * t * i / n, rr = R * (1 + (noise || 0) * (Math.random() * 2 - 1));
                fire('pointermove', CENTER.x + rr * Math.cos(a), CENTER.y + rr * Math.sin(a));
            }
            fire('pointerup', cfg.start.x, cfg.start.y);
        }
        G.debug = {
            state: function () { return { cfg: cfg, locked: locked, n: pts.length }; },
            draw: drawCircle,
            solve: function () { drawCircle(0, 1, 1); },
            wrong: function () { drawCircle(0.08, 0.8, 1); }
        };
    }

    /* 遊戲登記資料：id 代號、name 選單上的名稱、rule 玩法說明（**包起來的是粗體重點）、mount 進場函式、score 成績規格、test 給單元測試用的內部函式。 */
    var G = {
        id: ID,
        name: '盲畫一個圓',
        rule: '畫面上只有圓心的十字和右下方的起點。手指按住起點，**繞著圓心畫一圈回到起點**。**只看得到身後一小段虛線**，畫過的筆跡會消失！只有一次機會，放開手指後會告訴你圓度，目標是 100.0000%。',
        mount: mount,
        score: SCORE,
        test: { tailOf: tailOf, TRAIL_LEN: TRAIL_LEN, arrowPoints: arrowPoints, ARROW: ARROW, START_R: START_R, makeRound: makeRound, resample: resample, analyze: analyze, rating: rating, CENTER: CENTER, R_MIN: R_MIN, R_MAX: R_MAX, ANG_MIN: ANG_MIN, ANG_MAX: ANG_MAX, TURN_MIN: TURN_MIN, TURN_MAX: TURN_MAX, STEP: STEP }
    };
    /* 把這款遊戲登記給選單（沒有這行，選單就看不到它） */
    Reaction.register(G);
})();

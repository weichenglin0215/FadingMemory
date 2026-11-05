/* ═══════════════════════════════════════════════════════════════════
   reaction_skyshot.js — 秒反應・砲打飛機
   樣式：css/games/reaction_skyshot.css（這款專屬的 class 一律以「skyshot-」開頭；共用元件在 css/reaction_common.css）
   畫面最下方有一座固定的砲塔，點畫面任何地方就往正上方發射一發砲彈（砲彈等速往上飛）。一共只有 30 發。
   畫面上方 2/3 的天空，由上到下分成 10 條航道，各有一種飛行器左右飛來飛去；**算好砲彈飛上去要多久、飛機飛過來要多久**，才打得中。
   ───────────────────────────────────────────────────────────────────
   · 10 種飛行器（由下到上）：直升機、雙層翼、螺旋槳飛機、私人飛機、空中巴士、噴射戰鬥機、隱形戰機、火箭、衛星、飛碟。
     越上面的越小（尺寸比例：最上面 0.2、最下面 1.0，中間線性分配）、也越快（速度見 TYPES 的 speed）。
   · 每一種飛行器的速度都不一樣，隨機往左或往右飛；飛出畫面後等 0.5～1.5 秒（WAIT_S），再隨機從左邊或右邊飛進來，
     而且每次重新進場的速度都會變動 −20%～＋20%（SPEED_JITTER），讓你沒辦法背。
   · 被打中第 1 次冒黑煙、第 2 次冒火花、第 3 次爆炸消失（消失就不再出現）。每打中一次得 1 分，飛行器上方跳出大大的「+1」。
     10 種 × 3 次 ＝ 30 分，剛好等於 30 發砲彈：滿分就是一發都不浪費。
   · 砲彈只會打中「最先碰到」的那一架（砲彈從下往上飛，所以下面的大飛機會替上面的小飛機擋子彈）。
     碰撞用「這一格砲彈走過的整段距離」來判斷（掃掠），砲彈很快、上面的飛機很扁，也不會穿過去。
   · 成績＝得分（越多越好）。30 發都打完、而且最後一發飛出畫面（或 10 架全部打爆）就結算。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    /* 新手導讀：整個檔案包在 (function () { ... })(); 裡（叫「立即執行函式」），裡面的變數都是這個檔案私有的，不會跟別的遊戲檔案的同名變數打架。
       檔案由上往下大致分成：① 參數區（標題寫著可以自己調整的參數：難度、秒數、文字大多在這）；② 純函式（只做計算、不碰畫面：出題、判斷對錯，單元測試直接測它們）；③ 畫面（mount 是進場、setup 是每一關開始時呼叫，負責把畫面建出來並處理點擊）。
       最後的 Reaction.register(G) 把這款遊戲「登記」給選單（沒有這行，選單就看不到它）。'use strict' 是嚴格模式：打錯變數名稱會直接報錯，而不是默默建立新變數。
       這款遊戲的代號是 'skyshot'：選單、成績、存檔都靠它；樣式在 css/games/reaction_skyshot.css，裡面的 class 名稱一律以 skyshot- 開頭。 */
    'use strict';

    var ID = 'skyshot';                                 /* 這款遊戲的代號：選單、成績、存檔、CSS class 前綴都用它 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 分', label: '得分', min: 1, max: 30 };  /* 成績規格：better（max＝越大越好）、decimals 小數位數、format 顯示格式、label 名稱、min／max 合理範圍（超出範圍的成績不會送排行榜） */
    var h = UI.h, kit = Reaction.kit;                   /* h：建立網頁元素的小工具；kit：闖關遊戲共用的工具箱 */

    /* ═══ 可以自己調的參數 ═══ */
    var SHELLS = 30;                                    /* 一局有幾發砲彈 */
    var SHELL_V = 620;                                  /* 砲彈往上飛的速度（px／秒，全程等速） */
    var SHELL_R = 4;                                    /* 砲彈半徑（px，畫出來與碰撞都用它） */
    var FIRE_GAP_MS = 180;                              /* 兩發之間至少隔多久（毫秒）：避免手指抖一下就連發兩顆 */
    var HITS_TO_KILL = 3;                               /* 打中幾次會爆炸消失（第 1 次黑煙、第 2 次火花） */
    var SCALE_TOP = 0.2, SCALE_BOTTOM = 1.0;            /* 最上面、最下面那條航道的尺寸比例（中間線性分配） */
    var SKY_TOP = 30;                                   /* 最上面那條航道的上緣（px） */
    var SKY_FRAC = 2 / 3;                               /* 航道區佔畫面高度的比例（上方 2/3） */
    var BASE_W = 128;                                   /* 尺寸比例 1.0 時，飛行器的基本寬度（px；各型再乘自己的 w） */
    var SPEED_JITTER = 0.2;                             /* 每次重新進場，速度隨機變動 ±20% */
    var WAIT_S = [0.5, 1.5];                            /* 飛出畫面後，等幾秒再進來（隨機） */
    var END_DELAY_MS = 900;                             /* 最後一發結束後，停多久才結算 */
    var PLUS_MS = 1000;                                 /* 「+1」字樣飄多久 */
    var SOLVE_CAP = 12;                                 /* 驗證用：api.solve 最多幫你打中幾次 */
    var MAX_LEVEL = 1;                                  /* 只有一局（成績用 scoreOf＝得分） */
    /* 10 種飛行器（由下到上：越上面越小、越快）：key 代號、name 名稱、speed 基本速度（px／秒）、w／h 外框的寬高（BASE_W 的倍數） */
    var TYPES = [
        { key: 'heli', name: '直升機', speed: 52, w: 1.0, h: 0.5 },
        { key: 'biplane', name: '雙層翼飛機', speed: 70, w: 1.0, h: 0.46 },
        { key: 'prop', name: '螺旋槳飛機', speed: 90, w: 1.0, h: 0.38 },
        { key: 'bizjet', name: '私人飛機', speed: 112, w: 1.05, h: 0.32 },
        { key: 'airbus', name: '空中巴士', speed: 132, w: 1.25, h: 0.36 },
        { key: 'fighter', name: '噴射戰鬥機', speed: 165, w: 1.0, h: 0.32 },
        { key: 'stealth', name: '隱形戰機', speed: 195, w: 1.0, h: 0.26 },
        { key: 'rocket', name: '火箭', speed: 228, w: 1.1, h: 0.26 },
        { key: 'satellite', name: '衛星', speed: 258, w: 1.1, h: 0.46 },
        { key: 'ufo', name: '飛碟', speed: 300, w: 0.9, h: 0.42 }
    ];
    /* 畫布用的顏色（canvas 不能直接用 CSS 變數，所以寫在這裡） */
    var COL = {
        sky1: '#7EC8F0', sky2: '#DFF3FB', hill: '#7FB069', hill2: '#5E9150', ground: '#6B8E4E',
        ink: '#2F3A40', metal: '#7D8C96', metalDk: '#4F5D66', red: '#D9483B', white: '#F7F7F2', glass: '#9ED8F0',
        yellow: '#F6C343', orange: '#F08A24', blue: '#3B6FB6', navy: '#26324A', green: '#4F8A4B', gold: '#D9A93A', purple: '#8A6BC2'
    };

    /* ═══ 純函式（也給 Node 測試用）═══ */
    /* 第 k 種飛行器（0＝直升機、9＝飛碟）的尺寸比例：直升機在最下面（1.0），飛碟在最上面（0.2），中間線性 */
    function scaleOf(k) { var n = TYPES.length - 1; return SCALE_BOTTOM + (SCALE_TOP - SCALE_BOTTOM) * k / n; }
    /* 航道排法：回傳每一種飛行器的 { k, scale, y（航道中心）, w, h（外框 px）}；航道高度跟尺寸比例成正比（大飛機的航道比較寬） */
    function lanes(H) {
        var top = SKY_TOP, bottom = H * SKY_FRAC, total = 0, k;
        for (k = 0; k < TYPES.length; k++) total += scaleOf(k);
        var out = [], y = top;
        for (k = TYPES.length - 1; k >= 0; k--) {               /* 從最上面（飛碟）往下排 */
            var s = scaleOf(k), lh = (bottom - top) * s / total;
            out[k] = { k: k, scale: s, y: y + lh / 2, laneH: lh, w: BASE_W * s * TYPES[k].w, h: BASE_W * s * TYPES[k].h };
            y += lh;
        }
        return out;
    }
    /* 重新進場的速度：基本速度 × (1 ± 20%) */
    function entrySpeed(k, rand) { return TYPES[k].speed * (1 + kit.randFloat(-SPEED_JITTER, SPEED_JITTER, rand || Math.random)); }  /* kit.randFloat(最小, 最大, rand)：隨機小數 */
    /* 飛出畫面後等幾秒 */
    function waitSec(rand) { return kit.randFloat(WAIT_S[0], WAIT_S[1], rand || Math.random); }
    /* 從哪一邊進場：dir ＝ +1（從左往右）或 −1（從右往左）；x ＝ 剛好在畫面外的起點 */
    function entryPos(W, w, rand) { var dir = (rand || Math.random)() < 0.5 ? 1 : -1; return { dir: dir, x: dir > 0 ? -w / 2 - 6 : W + w / 2 + 6 }; }
    /* 飛出畫面了沒（整架都出去才算） */
    function isOut(x, w, dir, W) { return dir > 0 ? x - w / 2 > W + 2 : x + w / 2 < -2; }
    /* 砲彈這一格從 y0 飛到 y1（y1 < y0，往上），會打中哪一架？planes 是 [{ x, y, w, h, alive }]；
       打中的條件：水平上砲彈在機身外框內（含砲彈半徑），垂直上這段路徑跟機身外框重疊。好幾架都碰到時，取最下面（最先碰到）的那一架。沒打中回傳 −1 */
    function sweepHit(sx, y0, y1, planes, r) {
        r = r == null ? SHELL_R : r;
        var best = -1, by = -1e9;
        for (var i = 0; i < planes.length; i++) {
            var p = planes[i];
            if (!p || !p.alive) continue;
            if (Math.abs(sx - p.x) > p.w / 2 + r) continue;
            var top = p.y - p.h / 2, bot = p.y + p.h / 2;
            if (y1 - r > bot || y0 + r < top) continue;         /* 這一段路徑跟機身沒有重疊 */
            if (p.y > by) { by = p.y; best = i; }
        }
        return best;
    }
    /* 打中之後的樣子：0 次＝正常、1 次＝冒黑煙、2 次＝冒火花、3 次＝爆炸 */
    function damageOf(hits) { return hits >= HITS_TO_KILL ? 'boom' : hits === 2 ? 'spark' : hits === 1 ? 'smoke' : 'ok'; }
    /* 現在發射，會不會打中這架飛機（給 api.solve 與測試用）：砲彈從 (cx, cy) 往上，飛到航道要 (cy − y)／SHELL_V 秒，
       那時飛機會在 x ＋ dir × speed × t；離砲塔的水平距離小於機身一半（打中機身中段比較保險，取 0.35 倍）就算會中 */
    function willHit(cx, cy, p) {
        var t = (cy - p.y) / SHELL_V, fx = p.x + p.dir * p.speed * t;
        return Math.abs(fx - cx) <= p.w * 0.35;
    }
    /* 結算評語 */
    function rating(n) {
        if (n >= 30) return '彈無虛發，神砲手！';
        if (n >= 24) return '百發百中！';
        if (n >= 16) return '抓到時機了！';
        if (n >= 8) return '再算準一點！';
        return '先看飛機要多久飛到砲口上方！';
    }

    /* mount：選單按下這款遊戲時會呼叫它。把流程（結算、最佳紀錄）交給共用骨架 kit.run；只有一局，成績用 scoreOf（S.score＝得分）。 */
    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 12, stageClass: 'skyshot-stage', resume: false,
            head: function () { return '砲打飛機'; },
            info: function (S) { return '得分 ' + S.score; },
            scoreOf: function (S) { return S.score; },
            numText: function (v) { return v + ' 分'; },
            rating: rating,
            lines: function (S) { return ['30 發砲彈，打中 ' + S.score + ' 次（命中率 ' + Math.round(100 * S.score / SHELLS) + '%）']; },
            setup: setup
        });
    }

    /* setup(api)：遊戲開始時呼叫一次，把畫面建出來、開始動畫迴圈並處理點擊。 */
    function setup(api) {
        var stage = api.stage, S = api.S, rand = api.rand;
        var W = stage.clientWidth || 472, H = stage.clientHeight || 640;
        var CX = W / 2, GROUND_Y = H - 34, MUZZLE_Y = GROUND_Y - 78;         /* 砲塔在正中央；砲口的高度 */
        var dpr = Math.min(2, window.devicePixelRatio || 1);
        var cv = h('canvas', { 'class': 'skyshot-canvas' });
        cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);    /* Math.round：四捨五入成整數 */
        cv.style.width = W + 'px'; cv.style.height = H + 'px';
        stage.appendChild(cv);                          /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
        var g = cv.getContext('2d'); g.scale(dpr, dpr);

        /* 狀態 */
        var L = lanes(H), left = SHELLS, shells = [], parts = [], floats = [], over = false, lastFire = -1e9, recoil = 0, flash = 0, clock = 0;
        var planes = L.map(function (ln) {                  /* map：把陣列的每個元素轉換成別的東西，回傳新陣列 */
            var dir = rand() < 0.5 ? 1 : -1;
            return { k: ln.k, x: kit.randFloat(ln.w, W - ln.w, rand), y: ln.y, w: ln.w, h: ln.h, scale: ln.scale, dir: dir, speed: entrySpeed(ln.k, rand), hits: 0, alive: true, gone: false, wait: 0, emit: 0, phase: rand() * 10 };
        });
        S.score = 0; api.setInfo('得分 0');
        api.info = { get left() { return left; }, get planes() { return planes; }, get score() { return S.score; } };
        console.log('[砲打飛機] 航道：' + planes.map(function (p) { return TYPES[p.k].name + ' ' + Math.round(p.w) + 'px ' + Math.round(p.speed) + 'px/s'; }).join('、'));  /* 在瀏覽器主控台（按 F12）印出這一局的設定，方便除錯 */
        var ammo = h('div', { 'class': 'skyshot-ammo', text: '' }); stage.appendChild(ammo);
        function paintAmmo() { ammo.textContent = '砲彈 ' + left + ' / ' + SHELLS; ammo.classList.toggle('skyshot-ammo--low', left <= 5); }  /* classList.toggle(名稱, 條件)：條件成立就加上 class、不成立就拿掉 */
        paintAmmo();
        if (kit.once('skyshot.hint')) kit.hintOn(stage, null, { mode: 'tap', x: W * 0.5, y: H * 0.78, delay: 900, text: '點畫面任何地方開砲' });  /* 操作提示（手指圖示指出該點哪裡）：玩家第一次按下就消失 */

        /* 開砲：點畫面任何地方 */
        kit.onTap(cv, function () { fire(); });         /* kit.onTap(元素, 函式)：幫元素綁定「點一下」的動作（手機觸控與電腦滑鼠通用） */
        function fire() {
            if (over || api.over || left <= 0) return false;
            var now = performance.now();
            if (now - lastFire < FIRE_GAP_MS) return false;
            lastFire = now; left--; paintAmmo();
            shells.push({ x: CX, y: MUZZLE_Y });
            recoil = 1; flash = 1; Sfx.play('click');   /* Sfx.play(名稱)：播放音效（音效是程式即時合成的） */
            return true;
        }

        api.my.loop(function (now, dt) {                /* my.loop(函式)：每個畫面更新（約每秒 60 次）就執行一次函式；函式回傳 false 就停止 */
            if (!cv.isConnected) return false;
            var d = Math.min(dt, 50) / 1000;
            clock += d;
            if (!over) update(d);
            draw();
        });

        function update(d) {
            /* 飛行器：飛、出畫面、等、再進場 */
            planes.forEach(function (p) {               /* forEach：對陣列的每個元素各做一次 */
                if (p.gone) return;
                if (!p.alive) { p.wait -= d; if (p.wait <= 0) { var e = entryPos(W, p.w, rand); p.x = e.x; p.dir = e.dir; p.speed = entrySpeed(p.k, rand); p.alive = true; } return; }
                p.x += p.dir * p.speed * d;
                if (isOut(p.x, p.w, p.dir, W)) { p.alive = false; p.wait = waitSec(rand); return; }
                /* 受傷的樣子：冒黑煙（1 次）、火花（2 次） */
                if (p.hits >= 1) {
                    p.emit += d * (p.hits >= 2 ? 34 : 20);
                    while (p.emit >= 1) { p.emit -= 1; emitDamage(p); }
                }
            });
            /* 砲彈：等速往上，掃掠判斷有沒有打中 */
            for (var i = shells.length - 1; i >= 0; i--) {
                var s = shells[i], y0 = s.y, y1 = s.y - SHELL_V * d;
                var hit = sweepHit(s.x, y0, y1, planes, SHELL_R);
                if (hit >= 0) { shells.splice(i, 1); strike(planes[hit], s.x); continue; }  /* splice：從陣列中刪掉元素 */
                s.y = y1;
                if (s.y < -20) shells.splice(i, 1);
            }
            /* 粒子、+1 字樣 */
            for (var j = parts.length - 1; j >= 0; j--) {
                var q = parts[j]; q.t += d;
                if (q.t >= q.life) { parts.splice(j, 1); continue; }
                q.x += q.vx * d; q.y += q.vy * d; q.vy += (q.g || 0) * d; q.r += (q.grow || 0) * d;
            }
            for (var m = floats.length - 1; m >= 0; m--) { floats[m].t += d * 1000; if (floats[m].t >= PLUS_MS) floats.splice(m, 1); }
            recoil = Math.max(0, recoil - d * 6); flash = Math.max(0, flash - d * 9);
            /* 結算：砲彈打完、而且空中沒有砲彈了；或 10 架全部打爆 */
            var allDown = planes.every(function (p) { return p.gone; });  /* every：陣列裡「每一個」都符合才回傳 true */
            if ((left <= 0 && !shells.length) || allDown) end(allDown);
        }

        /* 打中一架：+1 分、跳出「+1」；第 3 次爆炸 */
        function strike(p, sx) {
            p.hits++; S.score++; api.setInfo('得分 ' + S.score);
            floats.push({ x: p.x, y: p.y - p.h / 2 - 8, t: 0, big: Math.max(26, 44 * p.scale + 14) });
            var dmg = damageOf(p.hits);
            if (dmg === 'boom') { explode(p); p.alive = false; p.gone = true; Sfx.play('ok'); }
            else { burst(sx, p.y, p.scale, dmg === 'spark' ? 14 : 8, dmg === 'spark'); Sfx.play('pop'); }
        }
        function burst(x, y, sc, n, hot) {
            for (var i = 0; i < n; i++) {
                var a = rand() * Math.PI * 2, v = (60 + rand() * 140) * (0.5 + sc);
                parts.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 160, r: (1.5 + rand() * 2.5) * (0.5 + sc), grow: 0, t: 0, life: 0.35 + rand() * 0.3, kind: hot ? 'spark' : 'chip' });
            }
        }
        function explode(p) {
            var sc = p.scale, i;
            parts.push({ x: p.x, y: p.y, vx: 0, vy: 0, r: p.w * 0.2, grow: p.w * 1.6, t: 0, life: 0.45, kind: 'ring' });
            for (i = 0; i < 28; i++) {
                var a = rand() * Math.PI * 2, v = (60 + rand() * 260) * (0.4 + sc);
                parts.push({ x: p.x, y: p.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 120, r: (2 + rand() * 4) * (0.5 + sc), grow: 0, t: 0, life: 0.5 + rand() * 0.5, kind: rand() < 0.5 ? 'spark' : 'fire' });
            }
            for (i = 0; i < 12; i++) parts.push({ x: p.x + (rand() - 0.5) * p.w * 0.5, y: p.y, vx: (rand() - 0.5) * 50, vy: -20 - rand() * 40, g: 0, r: 4 * (0.4 + sc), grow: 26 * (0.4 + sc), t: 0, life: 0.9 + rand() * 0.6, kind: 'smoke' });
        }
        /* 受傷的飛機在機尾冒煙（黑煙）或噴火花 */
        function emitDamage(p) {
            var tx = p.x - p.dir * p.w * 0.36, sc = p.scale;
            if (p.hits >= 2 && rand() < 0.65) parts.push({ x: tx, y: p.y, vx: -p.dir * (20 + rand() * 60) + (rand() - 0.5) * 80, vy: (rand() - 0.7) * 90, g: 220, r: (1.2 + rand() * 1.8) * (0.5 + sc), grow: 0, t: 0, life: 0.3 + rand() * 0.3, kind: 'spark' });
            else parts.push({ x: tx, y: p.y - p.h * 0.1, vx: -p.dir * 18 + (rand() - 0.5) * 16, vy: -14 - rand() * 18, g: 0, r: 3 * (0.4 + sc), grow: 18 * (0.4 + sc), t: 0, life: 0.8 + rand() * 0.6, kind: 'smoke' });
        }
        function end(allDown) {
            if (over) return;
            over = true;
            var msg = allDown ? '10 架全部打下來了！' : '30 發砲彈都打完了！';
            console.log('[砲打飛機] 結算：得分 ' + S.score);
            api.after(END_DELAY_MS, function () { api.fail({ delay: 600, lines: [msg] }); });  /* api.fail({ delay, lines })：這局結束，delay 毫秒後進結算畫面，lines 是結算要多寫的說明行 */
        }

        /* ═══ 畫面 ═══ */
        function draw() {
            var sky = g.createLinearGradient(0, 0, 0, GROUND_Y);
            sky.addColorStop(0, COL.sky1); sky.addColorStop(1, COL.sky2);
            g.fillStyle = sky; g.fillRect(0, 0, W, H);
            /* 遠山與草地 */
            g.fillStyle = COL.hill;
            g.beginPath(); g.moveTo(0, GROUND_Y - 40);
            for (var x = 0; x <= W; x += 24) g.lineTo(x, GROUND_Y - 40 - 22 * Math.sin(x / 70) - 10 * Math.sin(x / 23));
            g.lineTo(W, GROUND_Y); g.lineTo(0, GROUND_Y); g.closePath(); g.fill();
            g.fillStyle = COL.ground; g.fillRect(0, GROUND_Y, W, H - GROUND_Y);
            /* 飛行器 */
            planes.forEach(function (p) { if (p.alive && !p.gone) drawPlane(p); });
            /* 粒子 */
            parts.forEach(drawPart);
            /* 砲彈（拖一小段光跡） */
            shells.forEach(function (s) {
                g.strokeStyle = 'rgba(255,240,180,0.7)'; g.lineWidth = SHELL_R * 1.2;
                g.beginPath(); g.moveTo(s.x, s.y + 4); g.lineTo(s.x, s.y + 22); g.stroke();
                g.fillStyle = COL.ink; g.beginPath(); g.ellipse(s.x, s.y, SHELL_R, SHELL_R * 1.6, 0, 0, Math.PI * 2); g.fill();
            });
            drawCannon();
            /* +1 字樣：往上飄、慢慢變淡 */
            floats.forEach(function (f) {
                var k = f.t / PLUS_MS, y = f.y - 46 * k;
                g.save(); g.globalAlpha = 1 - k * k;
                g.font = '900 ' + Math.round(f.big) + 'px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'bottom';
                g.lineWidth = 5; g.strokeStyle = COL.ink; g.strokeText('+1', f.x, y);
                g.fillStyle = COL.yellow; g.fillText('+1', f.x, y);
                g.restore();
            });
        }
        function drawPart(q) {
            var k = q.t / q.life;
            g.save();
            if (q.kind === 'smoke') { g.globalAlpha = 0.55 * (1 - k); g.fillStyle = '#2B2B2B'; }
            else if (q.kind === 'spark') { g.globalAlpha = 1 - k; g.fillStyle = k < 0.4 ? '#FFF3A0' : COL.orange; }
            else if (q.kind === 'fire') { g.globalAlpha = 1 - k; g.fillStyle = k < 0.3 ? COL.yellow : COL.red; }
            else if (q.kind === 'ring') { g.globalAlpha = 0.8 * (1 - k); g.strokeStyle = COL.yellow; g.lineWidth = 6 * (1 - k) + 1; g.beginPath(); g.arc(q.x, q.y, q.r, 0, Math.PI * 2); g.stroke(); g.restore(); return; }
            else { g.globalAlpha = 1 - k; g.fillStyle = COL.metalDk; }
            g.beginPath(); g.arc(q.x, q.y, Math.max(0.5, q.r), 0, Math.PI * 2); g.fill();
            g.restore();
        }
        function drawCannon() {
            var ry = recoil * 8;
            g.save();
            /* 砲管 */
            g.fillStyle = COL.metalDk; g.fillRect(CX - 9, MUZZLE_Y + ry, 18, 62);
            g.fillStyle = COL.ink; g.fillRect(CX - 11, MUZZLE_Y + ry - 4, 22, 9);
            /* 砲座 */
            g.fillStyle = COL.green; g.beginPath(); g.arc(CX, GROUND_Y - 16, 34, Math.PI, 0); g.fill();
            g.fillStyle = COL.ink; g.fillRect(CX - 48, GROUND_Y - 16, 96, 16);
            g.fillStyle = COL.metal; for (var i = -2; i <= 2; i++) { g.beginPath(); g.arc(CX + i * 18, GROUND_Y - 8, 6, 0, Math.PI * 2); g.fill(); }
            /* 砲口火光 */
            if (flash > 0) { g.globalAlpha = flash; g.fillStyle = COL.yellow; g.beginPath(); g.moveTo(CX - 14, MUZZLE_Y - 4); g.lineTo(CX, MUZZLE_Y - 34 * flash - 6); g.lineTo(CX + 14, MUZZLE_Y - 4); g.closePath(); g.fill(); }
            g.restore();
        }
        /* 畫一架飛行器：先移到機身中心，依飛行方向左右翻轉，再用「寬 100 單位」的座標畫（機頭朝右） */
        function drawPlane(p) {
            var tp = TYPES[p.k], u = p.w / 100, hu = 100 * tp.h / tp.w;
            g.save(); g.translate(p.x, p.y); g.scale(p.dir * u, u);
            DRAW[tp.key](hu, clock + p.phase);
            g.restore();
        }
        /* 小工具：用目前的填色畫圓角矩形、橢圓、多邊形 */
        function rr(x, y, w, hh, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + hh, r); g.arcTo(x + w, y + hh, x, y + hh, r); g.arcTo(x, y + hh, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); g.fill(); }
        function el(x, y, rx, ry) { g.beginPath(); g.ellipse(x, y, Math.abs(rx), Math.abs(ry), 0, 0, Math.PI * 2); g.fill(); }
        function poly(pts) { g.beginPath(); g.moveTo(pts[0], pts[1]); for (var i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]); g.closePath(); g.fill(); }
        /* 10 種飛行器的畫法（座標：x 從 −50 到 50，y 的範圍是 ±hu／2，機頭朝右） */
        var DRAW = {
            heli: function (hu, t) {
                g.fillStyle = COL.red; el(8, 4, 26, 13);                              /* 機身 */
                g.fillStyle = COL.glass; el(22, 0, 11, 8);                            /* 座艙玻璃 */
                g.fillStyle = COL.red; poly([-14, 0, -48, -2, -48, 4, -14, 10]);       /* 尾桁 */
                g.fillStyle = COL.ink; var tr = 8 * Math.abs(Math.sin(t * 40)); g.fillRect(-49, -4 - tr, 3, tr * 2 + 2);  /* 尾旋翼 */
                g.fillRect(4, -14, 4, 6);                                             /* 旋翼軸 */
                var bl = 46 * Math.abs(Math.cos(t * 26)) + 6; g.fillRect(6 - bl, -17, bl * 2, 3);   /* 主旋翼（轉動時忽長忽短） */
                g.fillRect(-12, 20, 40, 3); g.fillRect(-6, 15, 3, 6); g.fillRect(16, 15, 3, 6);    /* 起落橇 */
            },
            biplane: function (hu, t) {
                g.fillStyle = COL.yellow; rr(-36, -12, 60, 5, 2); rr(-30, 10, 52, 5, 2);   /* 上下兩層機翼 */
                g.fillStyle = COL.ink; g.fillRect(-24, -8, 2, 19); g.fillRect(8, -8, 2, 19);  /* 支柱 */
                g.fillStyle = COL.red; poly([-44, -2, 28, -6, 34, 0, 28, 8, -44, 4]);        /* 機身 */
                poly([-46, -14, -36, -14, -30, -2, -46, -2]);                                /* 垂直尾翼 */
                g.fillStyle = COL.ink; el(36, 1, 3, 6);
                var pr = 16 * Math.abs(Math.cos(t * 50)); g.fillRect(38, 1 - pr, 3, pr * 2);   /* 螺旋槳 */
                g.beginPath(); g.arc(4, -6, 4, Math.PI, 0); g.fill();                          /* 飛行員的頭 */
            },
            prop: function (hu, t) {
                g.fillStyle = COL.white; poly([-46, -4, 30, -8, 40, -2, 38, 6, -46, 3]);     /* 機身 */
                g.fillStyle = COL.blue; poly([-46, -4, -38, -18, -30, -18, -32, -4]);         /* 尾翼 */
                g.fillStyle = COL.blue; poly([-8, 1, 10, 1, 4, 12, -16, 12]);                 /* 主翼 */
                g.fillStyle = COL.glass; poly([14, -7, 26, -7, 30, -2, 14, -2]);              /* 座艙 */
                g.fillStyle = COL.blue; g.fillRect(-40, 0, 70, 2);                            /* 塗裝線 */
                g.fillStyle = COL.ink; var pr = 15 * Math.abs(Math.cos(t * 55)); g.fillRect(41, 1 - pr, 3, pr * 2);
            },
            bizjet: function (hu, t) {
                g.fillStyle = COL.white; poly([-44, -3, 26, -6, 46, 0, 26, 6, -44, 4]);      /* 細長機身 */
                g.fillStyle = COL.navy; poly([-44, -3, -40, -15, -26, -15, -30, -4]);         /* T 型尾翼 */
                g.fillRect(-44, -16, 22, 3);
                g.fillStyle = COL.metalDk; rr(-30, -9, 18, 6, 3);                            /* 機尾的發動機 */
                g.fillStyle = COL.navy; poly([-6, 2, 10, 2, 2, 11, -12, 11]);                 /* 主翼 */
                g.fillStyle = COL.glass; for (var i = 0; i < 5; i++) el(-14 + i * 8, -1, 2, 2);   /* 窗戶 */
                g.fillStyle = COL.ink; poly([30, -5, 38, -3, 30, -1]);
            },
            airbus: function (hu, t) {
                g.fillStyle = COL.white; poly([-48, -6, 34, -8, 50, -1, 34, 10, -48, 6]);    /* 寬胖的機身 */
                g.fillStyle = COL.blue; poly([-48, -6, -42, -22, -30, -22, -32, -6]);         /* 尾翼 */
                g.fillRect(-48, 3, 92, 3);                                                     /* 塗裝線 */
                g.fillStyle = COL.metal; poly([-10, 4, 12, 4, 2, 18, -18, 18]);               /* 主翼 */
                g.fillStyle = COL.metalDk; rr(-6, 12, 14, 7, 3);                              /* 翼下發動機 */
                g.fillStyle = COL.glass; for (var i = 0; i < 9; i++) el(-34 + i * 7.5, -2, 1.8, 2);
                g.fillStyle = COL.ink; poly([40, -6, 46, -3, 40, -2]);
            },
            fighter: function (hu, t) {
                if (Math.sin(t * 30) > -0.6) { g.fillStyle = COL.orange; poly([-44, -3, -56 - 6 * Math.abs(Math.sin(t * 20)), 0, -44, 3]); }   /* 後燃器火焰 */
                g.fillStyle = COL.metal; poly([-44, -4, 20, -5, 50, 0, 20, 5, -44, 4]);       /* 尖尖的機身 */
                g.fillStyle = COL.metalDk; poly([-30, -4, -38, -15, -28, -15, -20, -4]);      /* 尾翼 */
                poly([-18, 2, 12, 2, -6, 13, -26, 13]);                                       /* 三角翼 */
                g.fillStyle = COL.glass; poly([16, -4, 30, -3, 22, -9, 14, -9]);              /* 座艙罩 */
            },
            stealth: function (hu, t) {
                g.fillStyle = '#22262B'; poly([-46, 2, -30, -8, 10, -10, 50, 1, 10, 9, -30, 8]);  /* 扁平多角形的機身 */
                g.fillStyle = '#3A4048'; poly([-34, -6, -40, -13, -24, -9]);                       /* 斜斜的尾翼 */
                poly([-6, 2, 16, 2, -14, 10]);
                g.fillStyle = '#5A6E7A'; poly([14, -7, 30, -3, 16, -3]);                          /* 座艙（暗色） */
            },
            rocket: function (hu, t) {
                g.fillStyle = COL.orange; var fl = 10 + 6 * Math.abs(Math.sin(t * 35)); poly([-40, -6, -40 - fl - 6, 0, -40, 6]);
                g.fillStyle = COL.yellow; poly([-40, -3, -40 - fl, 0, -40, 3]);              /* 尾焰 */
                g.fillStyle = COL.white; rr(-40, -7, 66, 14, 3);                             /* 箭身 */
                g.fillStyle = COL.red; poly([26, -7, 50, 0, 26, 7]);                          /* 箭頭 */
                poly([-40, -7, -30, -7, -36, -13, -42, -13]); poly([-40, 7, -30, 7, -36, 13, -42, 13]);   /* 尾翼 */
                g.fillStyle = COL.blue; g.fillRect(4, -7, 4, 14);
            },
            satellite: function (hu, t) {
                g.fillStyle = COL.navy; g.fillRect(-48, -7, 32, 14); g.fillRect(16, -7, 32, 14);   /* 兩片太陽能板 */
                g.strokeStyle = COL.glass; g.lineWidth = 1;
                for (var i = 0; i < 4; i++) { g.strokeRect(-48 + i * 8, -7, 8, 14); g.strokeRect(16 + i * 8, -7, 8, 14); }
                g.fillStyle = COL.metal; g.fillRect(-16, -1, 32, 2);                         /* 支架 */
                g.fillStyle = COL.gold; rr(-12, -12, 24, 24, 3);                             /* 本體（金色隔熱膜） */
                g.fillStyle = COL.white; g.beginPath(); g.arc(0, -15, 8, Math.PI, 0); g.fill();   /* 碟形天線 */
                if (Math.sin(t * 6) > 0) { g.fillStyle = COL.red; el(0, 15, 2.5, 2.5); }
            },
            ufo: function (hu, t) {
                g.fillStyle = 'rgba(158,216,240,0.85)'; el(0, -7, 18, 14);                  /* 玻璃罩 */
                g.fillStyle = '#7ED957'; el(0, -5, 6, 6);                                    /* 外星人 */
                g.fillStyle = COL.metal; el(0, 4, 48, 11);                                   /* 碟身 */
                g.fillStyle = COL.metalDk; el(0, 8, 30, 5);
                for (var i = 0; i < 5; i++) { g.fillStyle = (Math.floor(t * 8) + i) % 2 ? COL.yellow : COL.purple; el(-32 + i * 16, 4, 3.5, 3.5); }  /* 跑馬燈 */
            }
        };

        /* 驗證用（會被重複呼叫，要冪等）：solve＝現在開砲會打中某一架（最多 SOLVE_CAP 次）才開砲；wrong＝對空開一砲（目前沒有飛機會被打中時） */
        api.solve = function () {
            if (over || S.score >= SOLVE_CAP) return;
            var ok = planes.some(function (p) { return p.alive && !p.gone && willHit(CX, MUZZLE_Y, p); });  /* some：陣列裡「有任何一個」符合就回傳 true */
            if (ok) fire();
        };
        api.wrong = function () {
            if (over) return;
            var any = planes.some(function (p) { return p.alive && !p.gone && Math.abs(p.x - CX) < p.w * 2; });
            if (!any) fire();
        };
    }

    /* 遊戲登記資料：id 代號、name 選單上的名稱、rule 玩法說明（**包起來的是粗體重點）、mount 進場函式、score 成績規格、test 給單元測試用的內部函式。 */
    var G = {
        id: ID,
        name: '砲打飛機',
        rule: '畫面最下方有一座固定不動的砲塔，**點畫面任何地方就往正上方開一砲**，砲彈等速往上飛，一共只有 30 發。天空由上到下有 10 種飛行器飛來飛去：飛碟、衛星、火箭、隱形戰機、戰鬥機、空中巴士、私人飛機、螺旋槳飛機、雙層翼飛機、直升機，越上面越小、也飛得越快。飛出畫面的飛機過一下會再從左邊或右邊飛進來，速度還會變快或變慢。**算好砲彈飛上去的時間**，提早開砲才打得中！每架打中第 1 次冒黑煙、第 2 次冒火花、第 3 次爆炸。**每打中一次得 1 分**，滿分 30 分。',
        mount: mount,
        score: SCORE,
        /* test：把內部函式與參數交給單元測試（test/reaction/ 底下的 t_*.js）使用，遊戲本身不會用到。 */
        test: {
            scaleOf: scaleOf, lanes: lanes, entrySpeed: entrySpeed, waitSec: waitSec, entryPos: entryPos, isOut: isOut, sweepHit: sweepHit, damageOf: damageOf, willHit: willHit, rating: rating,
            SHELLS: SHELLS, SHELL_V: SHELL_V, SHELL_R: SHELL_R, FIRE_GAP_MS: FIRE_GAP_MS, HITS_TO_KILL: HITS_TO_KILL, SCALE_TOP: SCALE_TOP, SCALE_BOTTOM: SCALE_BOTTOM, SKY_TOP: SKY_TOP, SKY_FRAC: SKY_FRAC, BASE_W: BASE_W, SPEED_JITTER: SPEED_JITTER, WAIT_S: WAIT_S, TYPES: TYPES, SOLVE_CAP: SOLVE_CAP, MAX_LEVEL: MAX_LEVEL
        }
    };
    /* 把這款遊戲登記給選單（沒有這行，選單就看不到它） */
    Reaction.register(G);
})();

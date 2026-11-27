/* 錄影工具在「遊戲頁面載入之前」注入的程式（只有錄影時的瀏覽器看得到，遊戲本身的檔案完全不用改）。做三件事：
   ① 虛擬時鐘：遊戲看到的時間（performance.now、setTimeout、requestAnimationFrame、CSS 動畫）全部由錄影工具控制，
      可以「前進 1/30 秒 → 拍一張」，電腦快慢都不影響畫面順不順。
   ② 固定亂數：Math.random 換成「給同一個種子就出同一串數字」的版本，重錄會出一樣的題目。
   ③ 虛擬手指：畫一隻手在畫面上，讓觀眾看得到在哪裡按、往哪裡拖。 */
(function () {
    if (window.__vt) return;
    /* 每一段錄影都從「第一次玩」的狀態開始：不然前一段打出的最佳紀錄會出現在下一段的畫面上，只重錄一段時畫面也會跟整支重錄不同
       （這是工具自己開的暫存瀏覽器，清掉的不是你的紀錄） */
    try { window.localStorage.clear(); window.sessionStorage.clear(); } catch (e) { }

    /* ═══ ① 虛擬時鐘 ═══ */
    var realSetInterval = window.setInterval.bind(window);
    var EPOCH = Date.now(), now = 0, nextId = 1, auto = true;
    var timers = new Map(), rafs = new Map();
    performance.now = function () { return now; };
    Date.now = function () { return EPOCH + Math.floor(now); };
    function addTimer(fn, ms, args, repeat) {
        var id = nextId++, d = Math.max(repeat ? 1 : 0, Number(ms) || 0);
        timers.set(id, { at: now + d, every: repeat ? d : 0, fn: fn, args: args });
        return id;
    }
    window.setTimeout = function (fn, ms) { return addTimer(fn, ms, [].slice.call(arguments, 2), false); };
    window.setInterval = function (fn, ms) { return addTimer(fn, ms, [].slice.call(arguments, 2), true); };
    window.clearTimeout = window.clearInterval = function (id) { timers.delete(id); };
    window.requestAnimationFrame = function (fn) { var id = nextId++; rafs.set(id, fn); return id; };
    window.cancelAnimationFrame = function (id) { rafs.delete(id); };
    function run(fn, args) { try { if (typeof fn === 'function') fn.apply(window, args); } catch (e) { window.reportError(e); } }
    /* CSS 動畫與轉場不吃上面那些時間，要另外一個一個暫停起來、照虛擬時間設定進度 */
    function syncAnimations() {
        if (!document.getAnimations) return;
        document.getAnimations().forEach(function (a) {
            if (a.__start === undefined) { a.__start = now; try { a.pause(); } catch (e) { } }
            var t = now - a.__start, end = a.effect ? a.effect.getComputedTiming().endTime : Infinity;
            try { if (isFinite(end) && t >= end) a.finish(); else a.currentTime = t; } catch (e) { }
        });
    }
    /* 讓時間前進 ms 毫秒：先依時間順序執行到期的計時器，再執行一輪「下一個畫面」的函式 */
    function advance(ms) {
        var target = now + ms;
        for (var guard = 0; guard < 100000; guard++) {
            var best = null, bestId = 0;
            timers.forEach(function (t, id) { if (t.at <= target && (!best || t.at < best.at || (t.at === best.at && id < bestId))) { best = t; bestId = id; } });
            if (!best) break;
            now = Math.max(now, best.at);
            if (best.every) best.at += best.every; else timers.delete(bestId);
            run(best.fn, best.args);
        }
        now = target;
        var batch = Array.from(rafs.values());
        rafs.clear();
        batch.forEach(function (fn) { run(fn, [now]); });
        syncAnimations();
    }
    /* auto＝true（載入頁面、按開始鈕的階段）：時間自己走；開始錄影前改成 false，之後只有錄影工具能讓時間前進 */
    realSetInterval(function () { if (auto) advance(16); }, 16);

    /* ═══ ② 固定亂數（mulberry32）═══ */
    var state = 12345;
    Math.random = function () {
        state = (state + 0x6D2B79F5) >>> 0;
        var t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    window.__vt = {
        advance: advance,
        now: function () { return now; },
        setAuto: function (v) { auto = !!v; },
        reseed: function (s) { state = s >>> 0; }
    };

    /* ═══ ③ 虛擬手指 ═══ */
    /* 跟遊戲內建操作提示同一個手指圖示（js/reaction_kit2.js 的 FINGER_SVG），指尖在 viewBox 的 (17, 3) */
    var SVG = '<svg viewBox="0 0 48 60" width="84" height="105" aria-hidden="true">' +
        '<path d="M17 3c-2.6 0-4.5 2-4.5 4.6V30l-3.4-3.6c-1.9-2-5-1.8-6.4.4-1 1.6-.7 3.6.7 5.1L16 49c2 2.2 4.8 3.4 7.8 3.4H33c5.6 0 10.2-4.600 10.200-10.200V27c0-2.500-2-4.500-4.500-4.500-.7 0-1.400.2-2 .5-.6-1.800-2.300-3-4.300-3-1.100 0-2.100.4-2.900 1.100-.8-1.700-2.400-2.800-4.300-2.800-.6 0-1.200.1-1.800.4V7.600C21.5 5 19.6 3 17 3z" ' +
        'fill="#FFFDF3" stroke="#4A3B1E" stroke-width="2.4" stroke-linejoin="round"/></svg>';
    var TIP_X = 17 * 84 / 48, TIP_Y = 3 * 105 / 60;
    var hand = null, wasDown = false;
    function make(tag, css) { var e = document.createElement(tag); e.style.cssText = css; document.documentElement.appendChild(e); return e; }
    /* x, y：指尖在畫面上的位置；down：有沒有按著；opts：{ show, tapRing } */
    window.__finger = function (x, y, down, opts) {
        if (!opts.show) { if (hand) hand.style.display = 'none'; wasDown = down; return; }
        if (hand) hand.style.display = '';
        if (!hand) {
            hand = make('div', 'position:fixed;left:0;top:0;width:84px;height:105px;pointer-events:none;z-index:2147483647;transform-origin:' + TIP_X + 'px ' + TIP_Y + 'px;filter:drop-shadow(3px 6px 4px rgba(0,0,0,.35));');
            hand.innerHTML = SVG;
        }
        hand.style.transform = 'translate(' + (x - TIP_X) + 'px,' + (y - TIP_Y) + 'px) scale(' + (down ? 0.9 : 1.04) + ')';
        hand.style.opacity = down ? '0.92' : '0.85';
        if (down && !wasDown && opts.tapRing) {
            var ring = make('div', 'position:fixed;pointer-events:none;z-index:2147483646;width:56px;height:56px;border-radius:50%;border:5px solid #FF8A00;left:' + (x - 33) + 'px;top:' + (y - 33) + 'px;');
            ring.animate([{ transform: 'scale(.4)', opacity: 1 }, { transform: 'scale(1.7)', opacity: 0 }], { duration: 360, easing: 'ease-out', fill: 'forwards' }).onfinish = function () { ring.remove(); };
        }
        wasDown = down;
    };
})();

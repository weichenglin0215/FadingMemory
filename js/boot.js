/* ═══════════════════════════════════════════════════════════════════
   boot.js — 版本檢查＋載入所有遊戲檔案
   ───────────────────────────────────────────────────────────────────
   1. 每次開頁面都（不經快取）讀 version.json 的版本號。V1.53：訊號不好、超過 VERSION_WAIT_MS 還沒回來，
      而且這支手機以前讀過版本號（localStorage 的 fm.version）→ 先用「上次的版本號」開頁面（配合 sw.js，備份是同一版就完全不用連網），
      version.json 晚點才回來也照常處理（記下新版本，下次開頁面就是新的）。第一次來（沒有記錄）還是要等。
   2. 所有 CSS / JS 都加上 ?v=版本號 載入：
      版本號一改，網址就變了，瀏覽器一定會重新下載最新檔案；
      版本號沒變，就照常用快取（省流量、開得快）。
   3. boot.js 本身由 HTML 用時間戳載入，所以它永遠是最新的。
   4. 用 file:// 雙擊開啟時讀不到 version.json，就每次都用新的時間戳（本機檔案本來就沒有快取問題）。
   5. 註冊 sw.js（Service Worker）讓遊戲能離線玩，並把網址上的 ?openExternalBrowser=1 拿掉（見 registerSw／cleanShareParam）。
   ★ 發佈新版本：改 version.json 的 version（並在 README 的「版本更新紀錄」寫一筆）。
   ★ 新增檔案：加到下面的 PAGES 清單，然後執行 node test/pwa/gen_sw.cjs --write 更新 sw.js 的離線清單。
   ═══════════════════════════════════════════════════════════════════ */

/* 整個檔案包在 (function(global){ ... })(window) 這個「立即執行函式」裡：
   目的是讓裡面宣告的 THREE_CDN／BASE_CSS／PAGES…等變數，都只存在這個函式的
   局部範圍（local scope），不會變成全域變數、污染到其他 <script> 檔案可能用到
   的同名變數。真正需要被外部看到的東西（例如下面會設定的 global.FM_VERSION），
   刻意透過參數 global（就是呼叫時傳進來的 window）掛上去，是「特意公開」的，
   不是不小心漏出去的。 */
(function (global) {
    'use strict';

    /* 本機沒有 vendor/three.min.js（或載入失敗）時，依序改試這兩個 CDN 來源 */
    var THREE_CDN = [
        'https://cdn.jsdelivr.net/npm/three@0.158.0/build/three.min.js',
        'https://cdnjs.cloudflare.com/ajax/libs/three.js/0.158.0/three.min.js'
    ];

    /* 每一頁都共用的基礎 CSS／JS（版面縮放、共用元件），所以獨立出來，
       下面 PAGES 裡每一頁用 .concat() 接上自己專屬的檔案 */
    var BASE_CSS = ['css/fonts.css', 'css/theme.css', 'css/stage.css'];       /* fonts.css：Noto 字型的樣式表（加了字型度量覆寫，文字才會在方塊裡垂直置中；V1.36.0） */
    var BASE_JS = ['js/stage.js', 'js/ui.js'];

    /* 每個頁面要載入的檔案清單。css 的載入順序不重要（全部平行載入）；
       js 的順序很重要——陣列裡「字串」的項目會照順序一個一個執行完才載下一個
       （例如 quiz 頁要先有 quiz_pools.js 的題庫資料，quiz_gen.js 才能用），
       「巢狀陣列」的項目（只有 world 頁的 three.min.js 用到）則是「依序嘗試
       這幾個來源，第一個成功就用它」的備援清單，不是全部都載入。 */
    var PAGES = {
        menu: {
            css: BASE_CSS.concat(['css/dialog.css', 'css/identity.css', 'css/leaderboard.css', 'css/rating.css', 'css/menu.css', 'css/menu_nav.css']),
            js: BASE_JS.concat(['js/sfx.js', 'js/scroller.js', 'js/dialog.js', 'js/leaderboard.js', 'js/plays.js', 'js/identity.js', 'js/identity_ui.js', 'js/rating.js', 'js/score_specs.js', 'js/menu.js', 'js/menu_nav.js', 'js/pwa.js', 'js/offline.js', 'js/offline_ui.js', 'js/share.js'])
        },
        reaction: {
            css: BASE_CSS.concat(['css/dialog.css', 
                'css/reaction_common.css',
                'css/sudoku_lib.css',
                'css/numpad_lib.css',
                'css/games/reaction_alignchar.css',
                'css/games/reaction_area.css',
                'css/games/reaction_babyscale.css',
                'css/games/reaction_backnum.css',
                'css/games/reaction_balloon.css',
                'css/games/reaction_basket.css',
                'css/games/reaction_beans.css',
                'css/games/reaction_blindcircle.css',
                'css/games/reaction_blinkchar.css',
                'css/games/reaction_bounce.css',
                'css/games/reaction_boxstack.css',
                'css/games/reaction_bread.css',
                'css/games/reaction_bridge.css',
                'css/games/reaction_bubblespray.css',
                'css/games/reaction_butterfly.css',
                'css/games/reaction_cake.css',
                'css/games/reaction_calendar.css',
                'css/games/reaction_candy.css',
                'css/games/reaction_cardslap.css',
                'css/games/reaction_carpet.css',
                'css/games/reaction_catroad.css',
                'css/games/reaction_change.css',
                'css/games/reaction_checkers.css',
                'css/games/reaction_chequeamt.css',
                'css/games/reaction_chicks.css',
                'css/games/reaction_clearer.css',
                'css/games/reaction_coins.css',
                'css/games/reaction_coinsort.css',
                'css/games/reaction_colorrecall.css',
                'css/games/reaction_copycurve.css',
                'css/games/reaction_countbills.css',
                'css/games/reaction_cups.css',
                'css/games/reaction_curves.css',
                'css/games/reaction_danmaku.css',
                'css/games/reaction_dicechange.css',
                'css/games/reaction_diff.css',
                'css/games/reaction_discount.css',
                'css/games/reaction_dishes.css',
                'css/games/reaction_doorslit.css',
                'css/games/reaction_dough.css',
                'css/games/reaction_drop.css',
                'css/games/reaction_dualtask.css',
                'css/games/reaction_emojisort.css',
                'css/games/reaction_euler.css',
                'css/games/reaction_expiry.css',
                'css/games/reaction_eyebrow.css',
                'css/games/reaction_fadee.css',
                'css/games/reaction_farpair.css',
                'css/games/reaction_fastblink.css',
                'css/games/reaction_fifteen.css',
                'css/games/reaction_fillop.css',
                'css/games/reaction_findsquare.css',
                'css/games/reaction_fishbite.css',
                'css/games/reaction_fishtoy.css',
                'css/games/reaction_flags.css',
                'css/games/reaction_flashlight.css',
                'css/games/reaction_flip3cent.css',
                'css/games/reaction_flipcent.css',
                'css/games/reaction_flipten.css',
                'css/games/reaction_followme.css',
                'css/games/reaction_forestpeek.css',
                'css/games/reaction_fracduel.css',
                'css/games/reaction_fridge.css',
                'css/games/reaction_fruitstock.css',
                'css/games/reaction_gaspump.css',
                'css/games/reaction_gearmark.css',
                'css/games/reaction_ghostleg.css',
                'css/games/reaction_ghostleg2.css',
                'css/games/reaction_glyphspin.css',
                'css/games/reaction_gomoku.css',
                'css/games/reaction_groupphoto.css',
                'css/games/reaction_halfchar.css',
                'css/games/reaction_halfcrowd.css',
                'css/games/reaction_halfvol.css',
                'css/games/reaction_handsmeet.css',
                'css/games/reaction_hangpic.css',
                'css/games/reaction_heartbeat.css',
                'css/games/reaction_hexcolor.css',
                'css/games/reaction_hiddendigit.css',
                'css/games/reaction_homerun.css',
                'css/games/reaction_huesort.css',
                'css/games/reaction_illusion.css',
                'css/games/reaction_impossible.css',
                'css/games/reaction_inkword.css',
                'css/games/reaction_inout.css',
                'css/games/reaction_invoice.css',
                'css/games/reaction_isequal.css',
                'css/games/reaction_kinetic.css',
                'css/games/reaction_knockcount.css',
                'css/games/reaction_landolt.css',
                'css/games/reaction_layerdrink.css',
                'css/games/reaction_lights.css',
                'css/games/reaction_lightsout.css',
                'css/games/reaction_magicsq.css',
                'css/games/reaction_mahjong3.css',
                'css/games/reaction_matchcolor.css',
                'css/games/reaction_mathcheck.css',
                'css/games/reaction_maxexpr.css',
                'css/games/reaction_menuslice.css',
                'css/games/reaction_mergechar.css',
                'css/games/reaction_milktea.css',
                'css/games/reaction_minus7.css',
                'css/games/reaction_mirror.css',
                'css/games/reaction_mixcolor.css',
                'css/games/reaction_nim.css',
                'css/games/reaction_nthshape.css',
                'css/games/reaction_numline.css',
                'css/games/reaction_oddsock.css',
                'css/games/reaction_oneway.css',
                'css/games/reaction_ordercut.css',
                'css/games/reaction_orderops.css',
                'css/games/reaction_paint.css',
                'css/games/reaction_passersby.css',
                'css/games/reaction_pattern.css',
                'css/games/reaction_pearls.css',
                'css/games/reaction_pendulum.css',
                'css/games/reaction_piggybank.css',
                'css/games/reaction_pillbox.css',
                'css/games/reaction_pinwheel.css',
                'css/games/reaction_pipes.css',
                'css/games/reaction_polyrhythm.css',
                'css/games/reaction_pour.css',
                'css/games/reaction_price.css',
                'css/games/reaction_primetrap.css',
                'css/games/reaction_racefirst.css',
                'css/games/reaction_rainbow.css',
                'css/games/reaction_remainder.css',
                'css/games/reaction_reversi.css',
                'css/games/reaction_rightangle.css',
                'css/games/reaction_rocketland.css',
                'css/games/reaction_rotary.css',
                'css/games/reaction_rps.css',
                'css/games/reaction_same.css',
                'css/games/reaction_samelen.css',
                'css/games/reaction_scallion.css',
                'css/games/reaction_schulte.css',
                'css/games/reaction_scratch.css',
                'css/games/reaction_seenchars.css',
                'css/games/reaction_seenit.css',
                'css/games/reaction_seesaw.css',
                'css/games/reaction_seq.css',
                'css/games/reaction_setclock.css',
                'css/games/reaction_seven.css',
                'css/games/reaction_shapegrid.css',
                'css/games/reaction_shapes.css',
                'css/games/reaction_skyshot.css',
                'css/games/reaction_slicechar.css',
                'css/games/reaction_sneakmove.css',
                'css/games/reaction_speed.css',
                'css/games/reaction_spingap.css',
                'css/games/reaction_spinpick.css',
                'css/games/reaction_spot.css',
                'css/games/reaction_stackup.css',
                'css/games/reaction_stamp.css',
                'css/games/reaction_stars.css',
                'css/games/reaction_sticks.css',
                'css/games/reaction_sudokuone.css',
                'css/games/reaction_sum100.css',
                'css/games/reaction_sumdel.css',
                'css/games/reaction_sushi.css',
                'css/games/reaction_swapeven.css',
                'css/games/reaction_swipecopy.css',
                'css/games/reaction_takuzu.css',
                'css/games/reaction_tapback.css',
                'css/games/reaction_teacher.css',
                'css/games/reaction_tearcal.css',
                'css/games/reaction_tianji.css',
                'css/games/reaction_timeafter.css',
                'css/games/reaction_timepair.css',
                'css/games/reaction_timestable.css',
                'css/games/reaction_timetable.css',
                'css/games/reaction_tissue.css',
                'css/games/reaction_triple100.css',
                'css/games/reaction_twinsock.css',
                'css/games/reaction_twobags.css',
                'css/games/reaction_watchoff.css',
                'css/games/reaction_weekday.css',
                'css/games/reaction_whofirst.css',
                'css/games/reaction_whosaid.css',
                'css/games/reaction_windblow.css',
                'css/games/reaction_wirelink.css',
                'css/games/reaction_witness.css',
                'css/games/reaction_wrongline.css'
            , 'css/leaderboard.css', 'css/identity.css', 'css/rating.css']),
            js: BASE_JS.concat(['js/sfx.js', 'js/dialog.js', 'js/scroller.js', 'js/leaderboard.js', 'js/plays.js', 'js/leaderboard_ui.js', 'js/identity.js', 'js/identity_ui.js', 'js/rating.js', 'js/reaction_core.js', 'js/reaction_kit.js', 'js/reaction_kit2.js', 'js/reaction_kit3.js', 'js/reaction_kit4.js', 'js/emoji_png.js', 'js/reaction_bgstripe.js', 'js/flipsum_core.js', 'js/similar_chars.js', 'js/sudoku_engine.js', 'js/sudoku_lib.js', 'js/numpad_lib.js', 'js/reaction_speed.js', 'js/reaction_drop.js', 'js/reaction_spot.js', 'js/reaction_impossible.js', 'js/reaction_shapes.js', 'js/reaction_matchcolor.js', 'js/reaction_rainbow.js', 'js/reaction_pendulum.js', 'js/reaction_tissue.js', 'js/reaction_landolt.js', 'js/reaction_lights.js', 'js/reaction_cups.js', 'js/reaction_pattern.js', 'js/reaction_illusion.js', 'js/reaction_pour.js', 'js/reaction_coins.js', 'js/reaction_invoice.js', 'js/reaction_paint.js', 'js/reaction_diff.js', 'js/reaction_bread.js', 'js/reaction_candy.js', 'js/reaction_curves.js', 'js/reaction_rps.js', 'js/reaction_balloon.js', 'js/reaction_price.js', 'js/reaction_heartbeat.js', 'js/reaction_sticks.js', 'js/reaction_schulte.js', 'js/reaction_same.js', 'js/reaction_backnum.js', 'js/reaction_setclock.js', 'js/reaction_tearcal.js', 'js/reaction_pillbox.js', 'js/reaction_fridge.js', 'js/reaction_scallion.js', 'js/reaction_hangpic.js', 'js/reaction_mirror.js', 'js/reaction_witness.js', 'js/reaction_halfchar.js', 'js/reaction_blinkchar.js', 'js/reaction_followme.js', 'js/reaction_chicks.js', 'js/reaction_bounce.js', 'js/reaction_cake.js', 'js/reaction_seven.js', 'js/reaction_teacher.js', 'js/reaction_dualtask.js', 'js/reaction_pipes.js', 'js/reaction_lightsout.js', 'js/reaction_seq.js', 'js/reaction_polyrhythm.js', 'js/reaction_area.js', 'js/reaction_halfvol.js', 'js/reaction_blindcircle.js', 'js/reaction_samelen.js', 'js/reaction_rightangle.js', 'js/reaction_stamp.js', 'js/reaction_scratch.js', 'js/reaction_mathcheck.js', 'js/reaction_fracduel.js', 'js/reaction_primetrap.js', 'js/reaction_sum100.js', 'js/reaction_timestable.js', 'js/reaction_maxexpr.js', 'js/reaction_glyphspin.js', 'js/reaction_fadee.js', 'js/reaction_oddsock.js', 'js/ghostleg_core.js', 'js/reaction_ghostleg.js', 'js/reaction_ghostleg2.js', 'js/reaction_euler.js', 'js/reaction_colorrecall.js', 'js/reaction_basket.js', 'js/reaction_passersby.js', 'js/reaction_seenit.js', 'js/reaction_whofirst.js', 'js/reaction_watchoff.js', 'js/reaction_handsmeet.js', 'js/reaction_clearer.js', 'js/reaction_twobags.js', 'js/reaction_stackup.js', 'js/reaction_bridge.js', 'js/reaction_halfcrowd.js', 'js/reaction_catroad.js', 'js/reaction_numline.js', 'js/reaction_twinsock.js', 'js/reaction_mixcolor.js', 'js/reaction_copycurve.js', 'js/reaction_isequal.js', 'js/reaction_orderops.js', 'js/reaction_remainder.js', 'js/reaction_hiddendigit.js', 'js/reaction_timeafter.js', 'js/reaction_wrongline.js', 'js/reaction_fillop.js', 'js/reaction_fastblink.js', 'js/reaction_sneakmove.js', 'js/reaction_farpair.js', 'js/reaction_dicechange.js', 'js/reaction_whosaid.js', 'js/reaction_tapback.js', 'js/reaction_nthshape.js', 'js/reaction_spingap.js', 'js/reaction_sudokuone.js', 'js/reaction_chequeamt.js', 'js/reaction_mergechar.js', 'js/reaction_flashlight.js', 'js/reaction_racefirst.js', 'js/reaction_spinpick.js', 'js/reaction_alignchar.js', 'js/reaction_triple100.js', 'js/reaction_carpet.js', 'js/reaction_wirelink.js', 'js/reaction_oneway.js', 'js/reaction_mahjong3.js', 'js/reaction_reversi.js', 'js/gomoku_bank.js', 'js/reaction_gomoku.js', 'js/reaction_swapeven.js', 'js/reaction_weekday.js', 'js/reaction_gearmark.js', 'js/reaction_seesaw.js', 'js/reaction_findsquare.js', 'js/reaction_checkers.js', 'js/reaction_inout.js', 'js/reaction_gaspump.js', 'js/reaction_milktea.js', 'js/reaction_rotary.js', 'js/reaction_swipecopy.js', 'js/reaction_knockcount.js', 'js/reaction_menuslice.js', 'js/reaction_inkword.js', 'js/reaction_calendar.js', 'js/reaction_layerdrink.js', 'js/reaction_seenchars.js', 'js/reaction_doorslit.js', 'js/reaction_stars.js', 'js/reaction_slicechar.js', 'js/reaction_butterfly.js', 'js/reaction_danmaku.js', 'js/reaction_cardslap.js', 'js/reaction_flags.js', 'js/reaction_huesort.js', 'js/reaction_kinetic.js', 'js/reaction_coinsort.js', 'js/reaction_groupphoto.js', 'js/reaction_fishbite.js', 'js/reaction_homerun.js', 'js/reaction_windblow.js', 'js/reaction_pearls.js', 'js/reaction_fishtoy.js', 'js/reaction_countbills.js', 'js/reaction_ordercut.js', 'js/reaction_pinwheel.js', 'js/reaction_dishes.js', 'js/reaction_beans.js', 'js/reaction_minus7.js', 'js/reaction_sushi.js', 'js/reaction_change.js', 'js/reaction_discount.js', 'js/reaction_timepair.js', 'js/reaction_eyebrow.js', 'js/reaction_dough.js', 'js/reaction_sudoku4.js', 'js/reaction_sudoku6e.js', 'js/reaction_sudoku6m.js', 'js/reaction_sudoku9e.js', 'js/reaction_sudoku9m.js', 'js/reaction_sudoku9h.js', 'js/reaction_sandwich.js', 'js/reaction_takuzu.js', 'js/reaction_sumdel.js', 'js/reaction_magicsq.js', 'js/reaction_nim.js', 'js/reaction_fifteen.js', 'js/reaction_tianji.js', 'js/reaction_flipten.js', 'js/reaction_flipcent.js', 'js/reaction_flip3cent.js', 'js/reaction_timetable.js', 'js/reaction_piggybank.js', 'js/reaction_expiry.js', 'js/reaction_fruitstock.js', 'js/reaction_boxstack.js', 'js/reaction_shapegrid.js', 'js/reaction_babyscale.js', 'js/reaction_skyshot.js', 'js/reaction_forestpeek.js', 'js/reaction_rocketland.js', 'js/reaction_bubblespray.js', 'js/reaction_emojisort.js', 'js/hexcolor_core.js', 'js/reaction_hexcolor.js', 'js/reaction.js'])
        },
        quiz: {
            css: BASE_CSS.concat(['css/quiz.css']),
            js: BASE_JS.concat(['js/quiz_pools.js', 'js/quiz_gen.js', 'js/quiz_happyBirthday.js', 'js/quiz_travel.js', 'js/quiz_health.js', 'js/quiz_dining.js', 'js/quiz.js'])
        },
        world: {
            css: BASE_CSS.concat(['css/world.css']),
            js: [['vendor/three.min.js'].concat(THREE_CDN)].concat(BASE_JS, [
                'js/world/config.js',
                'js/world/hud.js',
                'js/world/kit.js',
                'js/world/core.js',
                'js/world/scenes.js',
                'js/world/story.js'
            ])
        }
    };

    /* window.FM_PAGE 是每一頁自己在 <head> 裡用一行 <script> 設定的字串
       （例如 index.html 設 'menu'、quiz.html 設 'quiz'），boot.js 靠這個字串
       去 PAGES 裡找出「這一頁該載入哪些檔案」。 */
    var pageName = global.FM_PAGE || 'menu';
    var page = PAGES[pageName];

    /* 判斷網址是不是 http(s):// 開頭的外部連結（CDN）——是的話不能再加上
       ?v=版本號 的 query string（那是給本地檔案做快取破壞用的，外部網址
       本來就有自己的版本號在路徑裡，加了反而可能造成 CDN 回應錯誤或變成
       另一個快取不到的網址）。 */
    function isRemote(u) { return /^https?:\/\//.test(u); }

    /* 動態插入一個 <link rel="stylesheet">，回傳一個「CSS 載入完成（或失敗）
       就會 resolve」的 Promise，讓外面可以用 .then() 接著做事。CSS 載入失敗
       也刻意 resolve（不是 reject）：單一 CSS 檔案掛掉，讓畫面能照樣跑、只是
       樣式不完整，好過整頁直接卡住。 */
    function loadCss(href) {
        return new Promise(function (resolve) {
            var l = document.createElement('link');
            l.rel = 'stylesheet';
            l.href = href;
            l.onload = l.onerror = function () { resolve(); };
            document.head.appendChild(l);               /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
        });
    }

    /* 動態插入一個 <script src="...">。ordered=true 時設定 async=false：
       瀏覽器對 async=false 的動態 script 會保證「照插入的順序」依序執行，
       這樣 PAGES 清單裡那些有先後依賴關係的檔案（例如 quiz_pools.js 要比
       quiz_gen.js 先跑）才不會因為下載完成的時間不同而執行順序跑掉。
       跟 loadCss 不同，這裡載入失敗是真的 reject：缺一個 JS 檔案遊戲可能
       整個跑不動，要讓外層的 .catch() 接住、顯示錯誤畫面（見 fail()）。 */
    function loadJs(src, ordered) {
        return new Promise(function (resolve, reject) {
            var s = document.createElement('script');
            s.src = src;
            s.async = !ordered ? true : false;
            s.onload = function () { resolve(); };
            s.onerror = function () { reject(src); };
            document.head.appendChild(s);
        });
    }

    /* 依序嘗試多個來源（例如本地 three.min.js 失敗就改用 CDN）：
       從 list[0] 開始試，失敗（.catch）就換下一個，直到成功或整份清單都
       試過還是失敗（最後一個失敗時把錯誤繼續往外丟出去）。 */
    function loadWithFallback(list, q) {
        var i = 0;
        function next() {
            var src = list[i];
            var url = isRemote(src) ? src : src + q;
            return loadJs(url, true).catch(function (e) {  /* catch：Promise（承諾）失敗時才執行的函式，這裡用來吞掉錯誤，避免整個程式中斷 */
                i++;
                if (i < list.length) return next();
                throw e;
            });
        }
        return next();
    }

    /* 讀 version.json，拿到裡面的版本號／日期／更新說明。
       file:// 開啟（雙擊 index.html）時，Chrome 會直接擋掉對本機其他檔案的 fetch()
       （file:// 的跨來源限制），擋下來的時候主控台一定會印出一行刺眼的紅字錯誤
       ——即使程式碼用 .catch 接住、不影響遊戲照常執行，那行錯誤還是會出現在
       主控台（這是瀏覽器自己印的，不是 JS 丟出來的例外，程式碼攔不住）。
       與其每次 file:// 開啟都讓玩家看到一次這種嚇人的錯誤訊息，不如直接偵測到
       file:// 協定就不要嘗試，一律使用「目前的時間戳記」當版本號（見下面主流程）
       ——一樣能做到「每次都載入最新檔案」，只是沒辦法顯示真正的版本號文字，
       主控台也乾乾淨淨。用本機伺服器（http://localhost:...）開啟完全不受影響。 */
    function fetchVersion() {
        if (location.protocol === 'file:' || !global.fetch) return Promise.resolve(null);
        return fetch('version.json?t=' + Date.now(), { cache: 'no-store' })  /* Date.now()：現在的時間（毫秒），拿來算「經過了多久」 */
            .then(function (r) { return r.ok ? r.json() : null; })
            .catch(function () { return null; });
    }

    /* localStorage 包一層 try/catch：有些瀏覽器環境（例如無痕模式、使用者關掉
       網站資料儲存）存取 localStorage 會直接拋出例外，不包起來的話會讓整個
       boot 流程中斷。這裡只是記錄「上一次看到的版本號」，讀不到/存不了都
       不影響遊戲能不能玩，所以失敗就安靜地回傳 null／什麼都不做即可。 */
    function storeGet(k) { try { return global.localStorage.getItem(k); } catch (e) { return null; } }
    function storeSet(k, v) { try { global.localStorage.setItem(k, v); } catch (e) { } }

    /* 檔案真的載不出來時的最後防線：先把畫面「解除隱藏」（不然使用者只會看到
       一片空白，見 HTML 裡 html:not(.stage-ready) body{visibility:hidden} 那條
       規則），再疊一個全螢幕的錯誤訊息方塊上去。 */
    function fail(what) {
        document.documentElement.classList.add('stage-ready');  /* classList.add／remove／toggle：加上／拿掉 CSS class，元素的外觀就跟著變（class 的樣式寫在 css 檔裡） */
        var box = document.createElement('div');
        box.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;padding:24px;' +
            'background:#FBF3D9;color:#4A3B1E;font:700 20px/1.6 sans-serif;text-align:center;z-index:99';
        box.textContent = '檔案載入失敗（' + what + '）。請確認網路連線後重新整理。';  /* textContent：設定元素裡的文字（安全，不會被當成 HTML 解析） */
        document.body ? document.body.appendChild(box) : document.addEventListener('DOMContentLoaded', function () { document.body.appendChild(box); });
    }

    /* 分享出去的連結帶有 ?openExternalBrowser=1（給 LINE 看的：請改用手機瀏覽器開，見 js/share.js）。
       LINE 轉去瀏覽器之後，這個參數就沒用了，留在網址列只會被存進書籤、加到主畫面時也跟著存進去，
       所以進站第一件事就是用 replaceState 把它拿掉（不會重新載入頁面，其他參數例如 ?game= 不受影響）。 */
    function cleanShareParam() {
        try {
            var u = new URL(global.location.href);
            if (!u.searchParams.has('openExternalBrowser')) return;
            u.searchParams.delete('openExternalBrowser');
            global.history.replaceState(null, '', u.pathname + u.search + u.hash);
        } catch (e) { }
    }

    /* 註冊 Service Worker（sw.js）：之後這個網站的檔案會備份在手機裡，沒網路也能開（做法見 sw.js 的說明）。
       · 等頁面 load 完才註冊，不跟遊戲檔案搶頻寬；
       · updateViaCache:'none'＝檢查 sw.js 有沒有更新時，不吃瀏覽器的 HTTP 快取（GitHub Pages 的檔案預設會被快取 10 分鐘）；
       · file:// 雙擊開啟、不支援的瀏覽器（舊瀏覽器、網址不是 https 也不是 localhost）直接略過，遊戲照常運作；
       · 註冊結果存在 global.FM_SW（ServiceWorkerRegistration），選單切回來時用它檢查更新（見下面 visibilitychange）。 */
    function registerSw() {
        var nav = global.navigator;
        if (!nav || !('serviceWorker' in nav) || global.location.protocol === 'file:') return;
        var go = function () {
            nav.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(function (reg) { global.FM_SW = reg; }, function () { });
        };
        if (document.readyState === 'complete') go(); else global.addEventListener('load', go);
    }

    /* 等 version.json 最多等幾毫秒（V1.53）：超過就先用上次的版本號開頁面（見檔頭第 1 點）。網路正常時 version.json 幾百毫秒就回來，完全不受影響 */
    var VERSION_WAIT_MS = 1500;
    var SLOW = { slow: true };                      /* 賽跑時代表「等太久了」的記號 */

    cleanShareParam();
    registerSw();

    /* ═══ 主流程：這個檔案真正開始「做事」的地方 ═══
       1. 先讀版本號（或用時間戳記代替）。
       2. 把版本號記到 global.FM_VERSION，讓其他頁面（例如主選單想顯示
          「目前版本：1.13.3」）可以直接讀這個全域變數，不用自己再讀一次
          version.json。updated 旗標表示「這次讀到的版本號跟上次存的不一樣」，
          可以用來提示使用者「剛更新過」。
       3. 組出 ?v=版本號 這段 query string，所有本地 CSS/JS 檔名後面都接這個——
          這就是整個快取破壞機制的核心：版本號沒變，網址沒變，瀏覽器照常用
          快取；版本號一變，網址跟著變，瀏覽器就認定是全新的檔案要重新下載。
       4. 先把這一頁需要的 CSS 全部平行載入、等全部完成；CSS 跑完才開始載 JS
          （避免畫面在還沒套上樣式前就被 JS 動到）。JS 的部分：陣列型態的項目
          （目前只有 three.js）用 loadWithFallback 依序處理，其餘的 JS 檔案
          才平行下載（但靠 async=false 保證還是依照清單順序執行）。 */
    var versionP = fetchVersion();                  /* 一定會跑完（失敗＝null）；就算賽跑輸了也繼續在背景等它，不中斷（sw.js 靠這個請求發現新版本） */
    var known = storeGet('fm.version');             /* 上次讀到的版本號（第一次來是 null） */
    (known ? Promise.race([versionP, new Promise(function (r) { global.setTimeout(function () { r(SLOW); }, VERSION_WAIT_MS); })]) : versionP).then(function (info) {
        var slow = info === SLOW;
        if (slow) info = null;
        /* 讀不到 version.json（太慢、或離線）又有上次的版本號 → 用上次的（備份是同一版就直接用備份）；兩樣都沒有才用時間戳（每次都載最新檔案） */
        var ver = info && info.version ? String(info.version) : (known || 'local-' + Date.now());
        var prev = known;
        global.FM_VERSION = { version: ver, date: info && info.date, notes: info && info.notes, previous: prev, slow: slow };
        if (info && info.version) {
            if (prev && prev !== ver) global.FM_VERSION.updated = true;
            storeSet('fm.version', ver);
        }
        if (slow) versionP.then(function (late) {   /* 晚到的 version.json：記下新版本號（下次開頁面就用新的），不動這一次已經在載的檔案 */
            if (late && late.version) {
                if (String(late.version) !== ver) global.FM_VERSION.latest = String(late.version);
                storeSet('fm.version', String(late.version));
            }
        });
        var q = '?v=' + encodeURIComponent(ver);

        return Promise.all(page.css.map(function (h) { return loadCss(h + q); })).then(function () {  /* map：把陣列的每個元素轉換成別的東西，回傳新陣列 */
            /* 有備援來源的（three.js）先載好，其餘平行下載、照順序執行 */
            var chain = Promise.resolve();
            var rest = [];
            page.js.forEach(function (entry) {          /* forEach：對陣列的每個元素各做一次 */
                if (Array.isArray(entry)) chain = chain.then(function () { return loadWithFallback(entry, q); });
                else rest.push(entry);
            });
            return chain.then(function () {
                return Promise.all(rest.map(function (src) { return loadJs(isRemote(src) ? src : src + q, true); }));
            });
        });
    }).catch(function (e) { fail(e); });

    /* 停在主選單時，切回這個頁面就檢查一次；有新版本就自動重新整理。
       只在 menu 頁做這件事：使用者如果正在 quiz/reaction 頁答題答到一半，
       切回來就被強制重新整理會把正在做的事情打斷，體驗很差；主選單本身
       沒有「正在進行中」的狀態，重新整理完全無感，適合拿來做這個檢查。 */
    if (pageName === 'menu') {
        document.addEventListener('visibilitychange', function () {
            if (document.hidden || !global.FM_VERSION) return;
            /* 順便問一下 sw.js 有沒有新版（瀏覽器自己一天才查一次；清單變了才需要，平常是同一份） */
            if (global.FM_SW && global.FM_SW.update) global.FM_SW.update().catch(function () { });
            fetchVersion().then(function (info) {
                if (info && info.version && String(info.version) !== global.FM_VERSION.version) location.reload();
            });
        });
    }
})(window);

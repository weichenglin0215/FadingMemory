/* ═══════════════════════════════════════════════════════════════════
   sw.js — Service Worker：讓「記憶模糊」可以離線玩
   ───────────────────────────────────────────────────────────────────
   【做法：網路優先、離線才用快取】
   · 有網路：照舊從網路拿最新檔案（所以「改版本號就會拿到新檔案」的老規矩不變），拿到後順手更新手機裡的備份。
   · 沒網路（或網路太慢，超過 NET_TIMEOUT_MS 毫秒）：用手機裡備份的檔案。
   為什麼不用「快取優先」：本專案靠 version.json 的版本號控制更新（js/boot.js 在每個檔名後面加 ?v=版本號），
   快取優先的話，忘了重新產生下面的清單就會永遠卡在舊版，「明明改了程式、畫面卻沒變」會變得更嚴重。
   網路優先就沒有這個風險；清單只負責「保證一次就把全部檔案存好」。

   【比對快取時一律忽略 ?query】boot.js 載入檔案時會加 ?t=時間戳（boot.js 自己）和 ?v=版本號（其他檔案），
   網址每次都不一樣，所以快取的 key 一律是「去掉 ? 之後的網址」（keyOf）。reaction.html?game=speed 也是同一份 reaction.html。

   【版本一換就整批更新】version.json 是「網路優先」讀進來的；如果它跟備份的不一樣，代表遊戲更新了，
   就在背景把整份清單重新抓一次（refreshAll），這樣離線時各頁的檔案不會一部分新、一部分舊。

   【什麼會被攔】只有「同網域、GET、不在 NO_CACHE_DIRS 裡」的請求，加上 Google Fonts（字型盡量存起來，離線時外觀才一致）。
   Supabase（排行榜）等其他網域的請求完全不碰；admin/、test/ 等開發用的資料夾也不碰。

   【維護】PRECACHE（下面兩行標記之間）是自動產生的：新增／刪除檔案之後執行
       node test/pwa/gen_sw.cjs --write
   test/reaction/t_pwa.js 會檢查它有沒有跟專案同步。CACHE 名字只有在「快取策略改了」才需要手動換掉（會清掉舊的）。
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

var CACHE = 'fm-cache-v1';
var NET_TIMEOUT_MS = 4000;                 /* 網路超過這麼久沒回應，而且手機裡有備份，就先用備份 */
var NO_CACHE_DIRS = ['admin/', 'test/', 'note/', 'supabase/', '.claude/'];
var NO_CACHE_FILES = ['sw.js', 'screen_adaptive.html', 'screen_adaptive.css', 'screen_adaptive.js', 'README.md'];
var FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

/* PRECACHE-BEGIN（自動產生，請勿手改） */
var PRECACHE = [
    'css/dialog.css',
    'css/fonts.css',
    'css/games/reaction_alignchar.css',
    'css/games/reaction_area.css',
    'css/games/reaction_babyscale.css',
    'css/games/reaction_backnum.css',
    'css/games/reaction_balloon.css',
    'css/games/reaction_basket.css',
    'css/games/reaction_beans.css',
    'css/games/reaction_blindcircle.css',
    'css/games/reaction_bounce.css',
    'css/games/reaction_boxstack.css',
    'css/games/reaction_bread.css',
    'css/games/reaction_bridge.css',
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
    'css/games/reaction_flipten.css',
    'css/games/reaction_followme.css',
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
    'css/games/reaction_wrongline.css',
    'css/identity.css',
    'css/leaderboard.css',
    'css/menu.css',
    'css/menu_nav.css',
    'css/numpad_lib.css',
    'css/quiz.css',
    'css/rating.css',
    'css/reaction_common.css',
    'css/stage.css',
    'css/sudoku_lib.css',
    'css/theme.css',
    'css/world.css',
    'icons/apple-touch-icon.png',
    'icons/icon-192.png',
    'icons/icon-512.png',
    'icons/icon-maskable-512.png',
    'images/Impossible.png',
    'img/reaction/alignchar.png',
    'img/reaction/area.png',
    'img/reaction/babyscale.png',
    'img/reaction/backnum.png',
    'img/reaction/balloon.png',
    'img/reaction/basket.png',
    'img/reaction/beans.png',
    'img/reaction/blindcircle.png',
    'img/reaction/bounce.png',
    'img/reaction/boxstack.png',
    'img/reaction/bread.png',
    'img/reaction/bridge.png',
    'img/reaction/butterfly.png',
    'img/reaction/cake.png',
    'img/reaction/calendar.png',
    'img/reaction/candy.png',
    'img/reaction/cardslap.png',
    'img/reaction/carpet.png',
    'img/reaction/catroad.png',
    'img/reaction/change.png',
    'img/reaction/checkers.png',
    'img/reaction/chequeamt.png',
    'img/reaction/chicks.png',
    'img/reaction/clearer.png',
    'img/reaction/coins.png',
    'img/reaction/coinsort.png',
    'img/reaction/colorrecall.png',
    'img/reaction/copycurve.png',
    'img/reaction/countbills.png',
    'img/reaction/cups.png',
    'img/reaction/curves.png',
    'img/reaction/danmaku.png',
    'img/reaction/dicechange.png',
    'img/reaction/diff.png',
    'img/reaction/discount.png',
    'img/reaction/dishes.png',
    'img/reaction/doorslit.png',
    'img/reaction/dough.png',
    'img/reaction/drop.png',
    'img/reaction/dualtask.png',
    'img/reaction/euler.png',
    'img/reaction/expiry.png',
    'img/reaction/eyebrow.png',
    'img/reaction/fadee.png',
    'img/reaction/farpair.png',
    'img/reaction/fastblink.png',
    'img/reaction/fifteen.png',
    'img/reaction/fillop.png',
    'img/reaction/findsquare.png',
    'img/reaction/fishbite.png',
    'img/reaction/fishtoy.png',
    'img/reaction/flags.png',
    'img/reaction/flashlight.png',
    'img/reaction/flipten.png',
    'img/reaction/followme.png',
    'img/reaction/fracduel.png',
    'img/reaction/fridge.png',
    'img/reaction/fruitstock.png',
    'img/reaction/gaspump.png',
    'img/reaction/gearmark.png',
    'img/reaction/ghostleg.png',
    'img/reaction/ghostleg2.png',
    'img/reaction/glyphspin.png',
    'img/reaction/gomoku.png',
    'img/reaction/groupphoto.png',
    'img/reaction/halfchar.png',
    'img/reaction/halfcrowd.png',
    'img/reaction/halfvol.png',
    'img/reaction/handsmeet.png',
    'img/reaction/hangpic.png',
    'img/reaction/heartbeat.png',
    'img/reaction/hiddendigit.png',
    'img/reaction/homerun.png',
    'img/reaction/huesort.png',
    'img/reaction/illusion.png',
    'img/reaction/impossible.png',
    'img/reaction/inkword.png',
    'img/reaction/inout.png',
    'img/reaction/invoice.png',
    'img/reaction/isequal.png',
    'img/reaction/kinetic.png',
    'img/reaction/knockcount.png',
    'img/reaction/landolt.png',
    'img/reaction/layerdrink.png',
    'img/reaction/lights.png',
    'img/reaction/lightsout.png',
    'img/reaction/magicsq.png',
    'img/reaction/mahjong3.png',
    'img/reaction/matchcolor.png',
    'img/reaction/mathcheck.png',
    'img/reaction/maxexpr.png',
    'img/reaction/menuslice.png',
    'img/reaction/mergechar.png',
    'img/reaction/milktea.png',
    'img/reaction/minus7.png',
    'img/reaction/mirror.png',
    'img/reaction/mixcolor.png',
    'img/reaction/nim.png',
    'img/reaction/nthshape.png',
    'img/reaction/numline.png',
    'img/reaction/oddsock.png',
    'img/reaction/oneway.png',
    'img/reaction/ordercut.png',
    'img/reaction/orderops.png',
    'img/reaction/paint.png',
    'img/reaction/passersby.png',
    'img/reaction/pattern.png',
    'img/reaction/pearls.png',
    'img/reaction/pendulum.png',
    'img/reaction/piggybank.png',
    'img/reaction/pillbox.png',
    'img/reaction/pinwheel.png',
    'img/reaction/pipes.png',
    'img/reaction/polyrhythm.png',
    'img/reaction/pour.png',
    'img/reaction/price.png',
    'img/reaction/primetrap.png',
    'img/reaction/racefirst.png',
    'img/reaction/rainbow.png',
    'img/reaction/remainder.png',
    'img/reaction/reversi.png',
    'img/reaction/rightangle.png',
    'img/reaction/rotary.png',
    'img/reaction/rps.png',
    'img/reaction/same.png',
    'img/reaction/samelen.png',
    'img/reaction/sandwich.png',
    'img/reaction/scallion.png',
    'img/reaction/schulte.png',
    'img/reaction/scratch.png',
    'img/reaction/seenchars.png',
    'img/reaction/seenit.png',
    'img/reaction/seesaw.png',
    'img/reaction/seq.png',
    'img/reaction/setclock.png',
    'img/reaction/seven.png',
    'img/reaction/shapegrid.png',
    'img/reaction/shapes.png',
    'img/reaction/slicechar.png',
    'img/reaction/sneakmove.png',
    'img/reaction/speed.png',
    'img/reaction/spingap.png',
    'img/reaction/spinpick.png',
    'img/reaction/spot.png',
    'img/reaction/stackup.png',
    'img/reaction/stamp.png',
    'img/reaction/stars.png',
    'img/reaction/sticks.png',
    'img/reaction/sudoku4.png',
    'img/reaction/sudoku6e.png',
    'img/reaction/sudoku6m.png',
    'img/reaction/sudoku9e.png',
    'img/reaction/sudoku9h.png',
    'img/reaction/sudoku9m.png',
    'img/reaction/sudokuone.png',
    'img/reaction/sum100.png',
    'img/reaction/sumdel.png',
    'img/reaction/sushi.png',
    'img/reaction/swapeven.png',
    'img/reaction/swipecopy.png',
    'img/reaction/takuzu.png',
    'img/reaction/tapback.png',
    'img/reaction/teacher.png',
    'img/reaction/tearcal.png',
    'img/reaction/tianji.png',
    'img/reaction/timeafter.png',
    'img/reaction/timepair.png',
    'img/reaction/timestable.png',
    'img/reaction/timetable.png',
    'img/reaction/tissue.png',
    'img/reaction/triple100.png',
    'img/reaction/twinsock.png',
    'img/reaction/twobags.png',
    'img/reaction/watchoff.png',
    'img/reaction/weekday.png',
    'img/reaction/whofirst.png',
    'img/reaction/whosaid.png',
    'img/reaction/windblow.png',
    'img/reaction/wirelink.png',
    'img/reaction/witness.png',
    'img/reaction/wrongline.png',
    'index.html',
    'js/boot.js',
    'js/dialog.js',
    'js/ghostleg_core.js',
    'js/gomoku_bank.js',
    'js/identity.js',
    'js/identity_ui.js',
    'js/leaderboard.js',
    'js/leaderboard_ui.js',
    'js/menu.js',
    'js/menu_nav.js',
    'js/numpad_lib.js',
    'js/offline.js',
    'js/offline_ui.js',
    'js/plays.js',
    'js/pwa.js',
    'js/quiz.js',
    'js/quiz_dining.js',
    'js/quiz_gen.js',
    'js/quiz_happyBirthday.js',
    'js/quiz_health.js',
    'js/quiz_pools.js',
    'js/quiz_travel.js',
    'js/rating.js',
    'js/reaction.js',
    'js/reaction_alignchar.js',
    'js/reaction_area.js',
    'js/reaction_babyscale.js',
    'js/reaction_backnum.js',
    'js/reaction_balloon.js',
    'js/reaction_basket.js',
    'js/reaction_beans.js',
    'js/reaction_bgstripe.js',
    'js/reaction_blindcircle.js',
    'js/reaction_bounce.js',
    'js/reaction_boxstack.js',
    'js/reaction_bread.js',
    'js/reaction_bridge.js',
    'js/reaction_butterfly.js',
    'js/reaction_cake.js',
    'js/reaction_calendar.js',
    'js/reaction_candy.js',
    'js/reaction_cardslap.js',
    'js/reaction_carpet.js',
    'js/reaction_catroad.js',
    'js/reaction_change.js',
    'js/reaction_checkers.js',
    'js/reaction_chequeamt.js',
    'js/reaction_chicks.js',
    'js/reaction_clearer.js',
    'js/reaction_coins.js',
    'js/reaction_coinsort.js',
    'js/reaction_colorrecall.js',
    'js/reaction_copycurve.js',
    'js/reaction_core.js',
    'js/reaction_countbills.js',
    'js/reaction_cups.js',
    'js/reaction_curves.js',
    'js/reaction_danmaku.js',
    'js/reaction_dicechange.js',
    'js/reaction_diff.js',
    'js/reaction_discount.js',
    'js/reaction_dishes.js',
    'js/reaction_doorslit.js',
    'js/reaction_dough.js',
    'js/reaction_drop.js',
    'js/reaction_dualtask.js',
    'js/reaction_euler.js',
    'js/reaction_expiry.js',
    'js/reaction_eyebrow.js',
    'js/reaction_fadee.js',
    'js/reaction_farpair.js',
    'js/reaction_fastblink.js',
    'js/reaction_fifteen.js',
    'js/reaction_fillop.js',
    'js/reaction_findsquare.js',
    'js/reaction_fishbite.js',
    'js/reaction_fishtoy.js',
    'js/reaction_flags.js',
    'js/reaction_flashlight.js',
    'js/reaction_flipten.js',
    'js/reaction_followme.js',
    'js/reaction_fracduel.js',
    'js/reaction_fridge.js',
    'js/reaction_fruitstock.js',
    'js/reaction_gaspump.js',
    'js/reaction_gearmark.js',
    'js/reaction_ghostleg.js',
    'js/reaction_ghostleg2.js',
    'js/reaction_glyphspin.js',
    'js/reaction_gomoku.js',
    'js/reaction_groupphoto.js',
    'js/reaction_halfchar.js',
    'js/reaction_halfcrowd.js',
    'js/reaction_halfvol.js',
    'js/reaction_handsmeet.js',
    'js/reaction_hangpic.js',
    'js/reaction_heartbeat.js',
    'js/reaction_hiddendigit.js',
    'js/reaction_homerun.js',
    'js/reaction_huesort.js',
    'js/reaction_illusion.js',
    'js/reaction_impossible.js',
    'js/reaction_inkword.js',
    'js/reaction_inout.js',
    'js/reaction_invoice.js',
    'js/reaction_isequal.js',
    'js/reaction_kinetic.js',
    'js/reaction_kit.js',
    'js/reaction_kit2.js',
    'js/reaction_kit3.js',
    'js/reaction_kit4.js',
    'js/reaction_knockcount.js',
    'js/reaction_landolt.js',
    'js/reaction_layerdrink.js',
    'js/reaction_lights.js',
    'js/reaction_lightsout.js',
    'js/reaction_magicsq.js',
    'js/reaction_mahjong3.js',
    'js/reaction_matchcolor.js',
    'js/reaction_mathcheck.js',
    'js/reaction_maxexpr.js',
    'js/reaction_menuslice.js',
    'js/reaction_mergechar.js',
    'js/reaction_milktea.js',
    'js/reaction_minus7.js',
    'js/reaction_mirror.js',
    'js/reaction_mixcolor.js',
    'js/reaction_nim.js',
    'js/reaction_nthshape.js',
    'js/reaction_numline.js',
    'js/reaction_oddsock.js',
    'js/reaction_oneway.js',
    'js/reaction_ordercut.js',
    'js/reaction_orderops.js',
    'js/reaction_paint.js',
    'js/reaction_passersby.js',
    'js/reaction_pattern.js',
    'js/reaction_pearls.js',
    'js/reaction_pendulum.js',
    'js/reaction_piggybank.js',
    'js/reaction_pillbox.js',
    'js/reaction_pinwheel.js',
    'js/reaction_pipes.js',
    'js/reaction_polyrhythm.js',
    'js/reaction_pour.js',
    'js/reaction_price.js',
    'js/reaction_primetrap.js',
    'js/reaction_racefirst.js',
    'js/reaction_rainbow.js',
    'js/reaction_remainder.js',
    'js/reaction_reversi.js',
    'js/reaction_rightangle.js',
    'js/reaction_rotary.js',
    'js/reaction_rps.js',
    'js/reaction_same.js',
    'js/reaction_samelen.js',
    'js/reaction_sandwich.js',
    'js/reaction_scallion.js',
    'js/reaction_schulte.js',
    'js/reaction_scratch.js',
    'js/reaction_seenchars.js',
    'js/reaction_seenit.js',
    'js/reaction_seesaw.js',
    'js/reaction_seq.js',
    'js/reaction_setclock.js',
    'js/reaction_seven.js',
    'js/reaction_shapegrid.js',
    'js/reaction_shapes.js',
    'js/reaction_slicechar.js',
    'js/reaction_sneakmove.js',
    'js/reaction_speed.js',
    'js/reaction_spingap.js',
    'js/reaction_spinpick.js',
    'js/reaction_spot.js',
    'js/reaction_stackup.js',
    'js/reaction_stamp.js',
    'js/reaction_stars.js',
    'js/reaction_sticks.js',
    'js/reaction_sudoku4.js',
    'js/reaction_sudoku6e.js',
    'js/reaction_sudoku6m.js',
    'js/reaction_sudoku9e.js',
    'js/reaction_sudoku9h.js',
    'js/reaction_sudoku9m.js',
    'js/reaction_sudokuone.js',
    'js/reaction_sum100.js',
    'js/reaction_sumdel.js',
    'js/reaction_sushi.js',
    'js/reaction_swapeven.js',
    'js/reaction_swipecopy.js',
    'js/reaction_takuzu.js',
    'js/reaction_tapback.js',
    'js/reaction_teacher.js',
    'js/reaction_tearcal.js',
    'js/reaction_tianji.js',
    'js/reaction_timeafter.js',
    'js/reaction_timepair.js',
    'js/reaction_timestable.js',
    'js/reaction_timetable.js',
    'js/reaction_tissue.js',
    'js/reaction_triple100.js',
    'js/reaction_twinsock.js',
    'js/reaction_twobags.js',
    'js/reaction_watchoff.js',
    'js/reaction_weekday.js',
    'js/reaction_whofirst.js',
    'js/reaction_whosaid.js',
    'js/reaction_windblow.js',
    'js/reaction_wirelink.js',
    'js/reaction_witness.js',
    'js/reaction_wrongline.js',
    'js/score_specs.js',
    'js/scroller.js',
    'js/sfx.js',
    'js/share.js',
    'js/similar_chars.js',
    'js/stage.js',
    'js/sudoku_engine.js',
    'js/sudoku_lib.js',
    'js/ui.js',
    'js/world/config.js',
    'js/world/core.js',
    'js/world/hud.js',
    'js/world/kit.js',
    'js/world/scenes.js',
    'js/world/story.js',
    'manifest.webmanifest',
    'quiz.html',
    'reaction.html',
    'vendor/qrcode.min.js',
    'vendor/three.min.js',
    'version.json',
    'world.html'
];
/* PRECACHE-END */

var SCOPE = self.registration.scope;       /* 例如 https://xxx.github.io/FadingMemory/ */

function scoped(rel) { return new URL(rel, SCOPE).href; }

/* 快取的 key：同網域的網址去掉 ?query 與 #hash；資料夾網址（…/FadingMemory/）當成 index.html */
function keyOf(url) {
    var u = new URL(url);
    u.search = '';
    u.hash = '';
    if (/\/$/.test(u.pathname)) u.pathname += 'index.html';
    return u.href;
}

/* 這個同網域的網址要不要由我們處理（在 scope 底下、不是開發用的資料夾或檔案） */
function handled(url) {
    var u = new URL(url);
    if (u.origin !== self.location.origin) return false;
    var base = new URL(SCOPE);
    if (u.pathname.indexOf(base.pathname) !== 0) return false;
    var rel = u.pathname.slice(base.pathname.length);
    for (var i = 0; i < NO_CACHE_DIRS.length; i++) if (rel.indexOf(NO_CACHE_DIRS[i]) === 0) return false;
    return NO_CACHE_FILES.indexOf(rel) < 0;
}

function lookup(key) {
    return caches.open(CACHE).then(function (c) { return c.match(key, { ignoreVary: true }); });
}

/* 存進備份：只存「成功、沒被轉址、同一份內容（ETag 一樣）就不重存」的回應，省掉每次開頁面都重寫一遍幾 MB 的檔案 */
function store(key, res) {
    if (!res || !res.ok || res.redirected || res.type === 'opaque') return Promise.resolve();
    return caches.open(CACHE).then(function (c) {
        return c.match(key, { ignoreVary: true }).then(function (old) {
            var tag = res.headers.get('etag');
            if (old && tag && old.headers.get('etag') === tag) return;
            return c.put(key, res);
        });
    });
}

/* 把整份清單重新抓一次存起來（安裝時、遊戲更新時）；用 no-cache＝每個檔案都先問伺服器有沒有變（沒變就是很小的 304）。
   version.json 一定最後才存：它是「備份是不是最新」的記號，只要有任何一個檔案沒抓到，它就維持舊的，
   下次開頁面發現版本不一樣，就會再整批試一次。 */
var refreshing = null;
function refreshAll() {
    if (refreshing) return refreshing;
    var one = function (c, rel) {
        var url = scoped(rel);
        return fetch(new Request(url, { cache: 'no-cache' })).then(function (res) {
            if (!res.ok) throw new Error(rel + ' ' + res.status);
            return c.put(keyOf(url), res);
        });
    };
    refreshing = caches.open(CACHE).then(function (c) {
        var rest = PRECACHE.filter(function (rel) { return rel !== 'version.json'; });
        return Promise.all(rest.map(function (rel) { return one(c, rel); })).then(function () { return one(c, 'version.json'); });
    }).then(function () { refreshing = null; }, function (e) { refreshing = null; throw e; });
    return refreshing;
}

/* 讓 Service Worker 活到「存備份」做完。事件已經結束才呼叫 waitUntil 會丟例外（網路很慢、先用了備份，
   後來網路才回來的情況），那就直接做、不等了（最多是這次沒存到，下次再存）。 */
function keepAlive(event, p) {
    p = p.catch(function () { });
    try { event.waitUntil(p); } catch (e) { }
}

/* 網路優先：網路先拿；失敗、或超過 NET_TIMEOUT_MS 而手機裡有備份，就用備份。
   超時時網路請求不會中斷，回來之後照樣更新備份（下次就是新的）。 */
function networkFirst(event, req, key) {
    var timer;
    var net = fetch(req).then(function (res) {
        clearTimeout(timer);
        keepAlive(event, afterFetch(key, res.clone()));
        return res;
    }, function (e) {
        clearTimeout(timer);
        throw e;
    });
    var slow = new Promise(function (resolve) {
        timer = setTimeout(function () { resolve(lookup(key)); }, NET_TIMEOUT_MS);
    });
    return Promise.race([
        net.catch(function () { return lookup(key); }),
        slow.then(function (hit) { return hit || net; })
    ]).then(function (res) { return res || Response.error(); });
}

/* 拿到網路上的新檔案之後：一般檔案存起來；version.json 要先比對，不一樣就整批更新（它自己會在最後一起被存進去） */
function afterFetch(key, res) {
    if (!/\/version\.json$/.test(key)) return store(key, res);
    if (!res.ok) return Promise.resolve();
    return Promise.all([res.text(), lookup(key).then(function (old) { return old ? old.text() : null; })]).then(function (t) {
        if (t[1] === t[0]) return;
        return refreshAll().catch(function () { /* 抓不全就算了，備份裡的 version.json 沒更新，下次開啟會再試 */ });
    });
}

/* 字型：Google Fonts 的 CSS 網路優先、字型檔（woff2）快取優先；都用 CORS 模式抓，才存得起來（不存「不透明」回應，它在 Chrome 會佔 7MB 額度） */
function fonts(event) {
    var req = event.request;
    var url = req.url;
    var isCss = new URL(url).hostname === 'fonts.googleapis.com';
    var cors = new Request(url, { mode: 'cors', credentials: 'omit' });
    var get = function () {
        return fetch(cors).then(function (res) {
            if (res.ok) {
                var copy = res.clone();
                keepAlive(event, caches.open(CACHE).then(function (c) { return c.put(url, copy); }));
            }
            return res;
        });
    };
    var cached = function () { return caches.open(CACHE).then(function (c) { return c.match(url); }); };
    if (isCss) return get().catch(function () { return cached().then(function (hit) { return hit || Response.error(); }); });
    return cached().then(function (hit) { return hit || get().catch(function () { return Response.error(); }); });
}

self.addEventListener('install', function (event) {
    /* 安裝時把整份清單存好；任何一個抓不到就安裝失敗，瀏覽器下次開頁面會再試（不會裝出一個缺檔案的 Service Worker） */
    event.waitUntil(refreshAll().then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (event) {
    event.waitUntil(
        caches.keys().then(function (names) {
            return Promise.all(names.filter(function (n) { return n !== CACHE; }).map(function (n) { return caches.delete(n); }));
        }).then(function () { return self.clients.claim(); })
    );
});

/* 頁面（js/offline.js 的「安裝與離線」彈窗）找 Service Worker 講話，透過 MessageChannel 的 port 回覆：
     STATUS  → { type, cache 快取名字, precache 清單有幾個檔案, cached 備份裡已經有幾個 }
     REFRESH → 把清單全部重新從網路拿一次（refreshAll），做完回 { type, ok }；頁面收到之後重新載入就是最新版 */
self.addEventListener('message', function (event) {
    var d = event.data || {}, port = event.ports && event.ports[0];
    if (!port || (d.type !== 'STATUS' && d.type !== 'REFRESH')) return;
    var reply = function (o) { try { port.postMessage(o); } catch (e) { } };
    if (d.type === 'REFRESH') {
        keepAlive(event, refreshAll().then(function () { reply({ type: 'REFRESH', ok: true }); }, function () { reply({ type: 'REFRESH', ok: false }); }));
        return;
    }
    keepAlive(event, caches.open(CACHE).then(function (c) {
        return Promise.all(PRECACHE.map(function (rel) {
            return c.match(keyOf(scoped(rel)), { ignoreVary: true }).then(function (r) { return r ? 1 : 0; });
        }));
    }).then(function (hits) {
        reply({ type: 'STATUS', cache: CACHE, precache: PRECACHE.length, cached: hits.reduce(function (a, b) { return a + b; }, 0) });
    }, function () { reply({ type: 'STATUS', error: true }); }));
});

self.addEventListener('fetch', function (event) {
    var req = event.request;
    if (req.method !== 'GET') return;
    var host = new URL(req.url).hostname;
    if (FONT_HOSTS.indexOf(host) >= 0) { event.respondWith(fonts(event)); return; }
    if (!handled(req.url)) return;
    event.respondWith(networkFirst(event, req, keyOf(req.url)));
});

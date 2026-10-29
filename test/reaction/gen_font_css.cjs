// 產生 css/fonts.css：把 Google Fonts 的 Noto Sans TC／Noto Serif TC 樣式表抓下來，每個 @font-face 加上「字型度量覆寫」（ascent-override／descent-override），
// 讓文字在方塊／按鈕裡垂直置中（V1.36.0）。
//
// 為什麼要這樣做（玩家回報：大字放在方塊或按鈕裡會偏下，下緣貼框、上緣留一大片）：
//   瀏覽器把「一行字」排進方塊時，置中的是「行框」——字型宣告的 ascent（基線以上）加 descent（基線以下）合成的那一格，
//   不是看得見的筆畫。Noto Sans TC 宣告 ascent = 1.16 倍字高、descent = 只有 0.29 倍，行框的中心在基線上方 0.435 倍字高；
//   可是漢字（含 ＋ × 這類符號）與阿拉伯數字的筆畫中心在基線上方約 0.37～0.38 倍字高，
//   所以置中之後，筆畫比方塊的正中央低約 6.5％字高（emoji 約 9～11％）：字 60 px 就低 4 px、字 100 px 低 6.5 px，看起來「掉到下面」。
//   修法：不動版面（行框總高度不變，還是 1.45 倍字高），只把 ascent 調成 1.1045、descent 調成 0.3445，讓行框的中心剛好落在筆畫的中心（基線上方 0.38 倍）。
//   這個覆寫只能寫在 @font-face 裡，而 Google 的樣式表我們改不到，所以把它抓下來、加上覆寫，存成 css/fonts.css 由我們自己提供
//   （字型檔本身還是從 fonts.gstatic.com 載入，網址原封不動）。
//
// 用法：node test/reaction/gen_font_css.cjs        （要連網路；結果寫到 css/fonts.css，之後 git 提交就好，不需要每次執行）
//   Google 更新字型版本時（fonts.gstatic.com 的網址有 v40 這種版本號）才需要重新執行。
const fs = require('fs');
const path = require('path');

const URL = 'https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@500;700;900&family=Noto+Serif+TC:wght@700&display=swap';
const ASCENT = '110.45%', DESCENT = '34.45%';        // 1.1045 + 0.3445 = 1.449（跟原本的 1.16 + 0.288 = 1.448 一樣高），中心在基線上方 (1.1045 - 0.3445) / 2 = 0.38 倍字高
const OUT = path.resolve(__dirname, '../../css/fonts.css');
// 假裝是新版 Chrome，Google 才會回傳 woff2 的分段（unicode-range）樣式表
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

(async () => {
  const res = await fetch(URL, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error('抓不到 Google Fonts 樣式表：' + res.status);
  let css = await res.text();
  const n = (css.match(/@font-face/g) || []).length;
  if (n < 100 || !/fonts\.gstatic\.com/.test(css)) throw new Error('回傳的內容不像字型樣式表（@font-face 只有 ' + n + ' 個）');
  css = css.replace(/@font-face\s*\{/g, '@font-face {\n  ascent-override: ' + ASCENT + ';\n  descent-override: ' + DESCENT + ';\n  line-gap-override: 0%;');
  const head = '/* 自動產生，請勿手改——產生器：test/reaction/gen_font_css.cjs。\n'
    + '   內容＝Google Fonts 的 Noto Sans TC（500／700／900）與 Noto Serif TC（700）樣式表，每個 @font-face 多了 ascent-override／descent-override／line-gap-override，\n'
    + '   讓文字的筆畫在方塊與按鈕裡垂直置中（原因見產生器開頭的說明）。字型檔本身仍由 fonts.gstatic.com 提供。 */\n';
  fs.writeFileSync(OUT, head + css);
  console.log('已寫入 ' + OUT + '：' + n + ' 個 @font-face，' + Math.round(css.length / 1024) + ' KB');
})().catch(e => { console.error(e.message); process.exit(1); });

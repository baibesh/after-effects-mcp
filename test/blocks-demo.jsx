// Демо блоков урока: композиции "block · NN · <тип> · <формат>" в одном стиле (KB_DEMO_STYLE, по умолчанию editorial-dark).
// Картинки — из kemel-bilim (тестовые пробы). Запуск в открытом тестовом проекте: osascript … DoScriptFile "<путь>/test/blocks-demo.jsx"

//@include "../kit/blocks.jsx"

var KEMEL = "~/kemel-bilim/kemel-bilim-content/ae/assets/";
var KB_DEMO_STYLES = ["editorial-dark", "swiss-light", "color-blocks"];
var KB_DEMO_DATA = [
  ["title", { title: "Food and fruit", subtitle: "Тамақ пен жемістер · 5 new words", label: "Lesson 03" }],
  ["word", { word: "wave", ipa: "/weɪv/", tr: { kk: "қол бұлғау", ru: "махать" }, example: "I *wave* to my friend.", image: KEMEL + "doodle/taqiya-wave.png", focus: [0.5, 0.3] }], // ae-ok: asset
  ["image-callout", { image: KEMEL + "doodle/friend-aha.png", focus: [0.5, 0.3], labels: [{ at: [0.5, 0.18], text: "hat — бөрік" }, { at: [0.47, 0.42], text: "scarf — шарф" }], title: "Clothes" }], // ae-ok: asset
  ["quiz-pick", { q: "Which one is a fruit?", options: [{ t: "car" }, { t: "apple", ok: true }, { t: "chair" }], explain: "An apple is a fruit." }],
  ["recap", { words: ["wave", "hat", "scarf", "apple"], title: "Today" }]
];

kbRun("blocks-demo", function () {
  var log = [];
  for (var s = 0; s < KB_DEMO_STYLES.length; s++) {
    var st = kbStyle(KB_DEMO_STYLES[s]);
    var fmts = s === 0 ? ["9x16", "16x9"] : ["9x16"];
    for (var f = 0; f < fmts.length; f++) {
      for (var i = 0; i < KB_DEMO_DATA.length; i++) {
        var b = kbBlock(st, KB_DEMO_DATA[i][0], KB_DEMO_DATA[i][1], { format: fmts[f], index: i + 1, name: "block · " + st.id + " · " + (i + 1) + " " + KB_DEMO_DATA[i][0] + " · " + fmts[f] });
        var beats = [];
        for (var k = 0; k < b.beats.length; k++) beats.push(b.beats[k].beat + "@" + b.beats[k].t);
        log.push(b.comp.name + ": " + b.duration.toFixed(2) + " с; " + beats.join(", "));
      }
    }
  }
  kbLog("blocks-demo\n" + log.join("\n"));
});

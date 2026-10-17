// Демо картинок и фонов: композиции "vis · <стиль>" (фон стиля, картинка в маске стиля, вырезка, наезд к детали)
// и "bgdemo · <фон>" (каждый фон в editorial-dark). Картинки — из kemel-bilim (тестовые пробы).
// Запуск в открытом тестовом проекте: osascript … DoScriptFile "<путь>/test/visual-demo.jsx"

//@include "../kit/visual.jsx"

var KEMEL = "~/kemel-bilim/kemel-bilim-content/ae/assets/";

/**
 * @param {string} name
 * @param {number} w
 * @param {number} h
 * @param {number} sec
 * @returns {CompItem}
 */
function fresh(name, w, h, sec) {
  for (var i = app.project.numItems; i >= 1; i--) if (app.project.item(i).name === name) app.project.item(i).remove();
  return app.project.items.addComp(name, w, h, 1, sec, 30);
}

kbRun("visual-demo", function () {
  var log = [];
  var ids = ["editorial-dark", "swiss-light", "color-blocks"];
  for (var s = 0; s < ids.length; s++) {
    var st = kbStyle(ids[s]);
    var comp = fresh("vis · " + ids[s], 1080, 1920, 5);
    var bg = kbBackground(st, comp, undefined, { start: 0 });
    var img = kbImage(st, comp, KEMEL + "doodle/taqiya-wave.png", { box: [540, 720, 760, 820], start: 0.3, hold: 4.5, focus: [0.5, 0.35] }); // ae-ok: asset — путь от KEMEL
    var cut = kbImage(st, comp, KEMEL + "heroes/arlan/arlan_happy.png", { box: [790, 1500, 520, 520], mask: "cutout", start: 1.0 }); // ae-ok: asset — путь от KEMEL
    var z = kbImageZoom(st, img, [0.5, 0.3], 2.6);
    log.push(ids[s] + ": bg " + bg.layers.join("+") + "; img " + img.mask + " scale " + img.scale.toFixed(3) + "; cut " + cut.layers.join("+") + "; zoom→" + z.end.toFixed(2));
  }
  kbLog("visual-demo\n" + log.join("\n"));
});

kbRun("visual-demo backgrounds", function () {
  var st = kbStyle("editorial-dark");
  var all = ["bg.solid", "bg.gradient", "bg.grid-fine", "bg.dots", "bg.panel", "bg.blocks", "bg.noise", "bg.blobs"];
  for (var i = 0; i < all.length; i++) {
    var comp = fresh("bgdemo · " + all[i], 1080, 1920, 3);
    kbBackground(st, comp, all[i], { start: 0 });
  }
});

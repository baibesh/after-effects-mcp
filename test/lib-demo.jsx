// Демо библиотеки примитивов в трёх стилях: одна сцена «новое слово» — композиции "lib · <стиль>".
// Запуск в открытом тестовом проекте (open_test_project): osascript … DoScriptFile "<путь>/test/lib-demo.jsx"
// Смотреть: node build/cli.js get_frames '{"comp":"lib · editorial-dark","times":[0.5,1,1.6,2.6,3.6,4.2,5,5.6]}'

//@include "../kit/library.jsx"

/**
 * @param {string} id
 */
function demo(id) {
  var st = kbStyle(id);
  var name = "lib · " + id;
  for (var i = app.project.numItems; i >= 1; i--) if (app.project.item(i).name === name) app.project.item(i).remove();
  var comp = app.project.items.addComp(name, 1080, 1920, 1, 6, 30);
  var c = function (role) { return kbHex(kbTok(st, "color." + role)); };
  var size = function (role) { return kbTok(st, "type.size." + role + ".9x16"); };
  var font = function (role) { return kbTok(st, "type.font." + role); };

  comp.layers.addSolid(c("bg"), "bg", 1080, 1920, 1);

  var label = kbText(comp, { text: "01 — NEW WORD", font: font("mono"), size: size("label") * 0.8, color: c("muted"), x: 540, y: 430, tracking: kbTok(st, "type.tracking.label") });
  var word = kbText(comp, { text: "apple", font: font("hero"), size: size("hero"), color: c("ink"), x: 540, y: 720, tracking: kbTok(st, "type.tracking.hero") });
  var ipa = kbText(comp, { text: "/ˈæp.əl/", font: font("ipa"), size: size("body"), color: c("accent"), x: 540, y: 880 });
  var tr = kbText(comp, { text: "алма · яблоко", font: font("text"), size: size("translation"), color: c("muted"), x: 540, y: 980 });
  var phrase = kbText(comp, { text: "I eat an apple\revery day.", font: font("text"), size: size("body"), color: c("ink"), x: 540, y: 1660, leading: size("body") * 1.25 });

  var box = kbLibShapeLayer(comp, "card");
  kbLibShape(box, { name: "dot", ellipse: [150, 150], center: [0, 0], fill: c("accent") });
  kbLibShape(box, { name: "card", rect: [380, 300], center: [0, 0], radius: kbTok(st, "shape.radius.card"), fill: c("surface") });
  kbProp(box, ["ADBE Transform Group", "ADBE Position"]).setValue([540, 1310]);

  var log = [];
  var run = function (pid, layer, opts) { var r = kbLib(st, pid, layer, opts); log.push(pid + " " + r.start.toFixed(2) + "→" + r.end.toFixed(2)); return r; };
  run("text.rise", label, { start: 0.3 });
  run(kbTok(st, "motion.word"), word, { start: 0.6 });
  run("draw.underline", word, { start: 1.25 });
  run(kbTok(st, "motion.text"), ipa, { start: 1.2 });
  run("text.rise", tr, { start: 1.5 });
  run("enter.pop", box, { start: 1.8 });
  run("idle.breathe", box, { start: 2.4 });
  var arrow = run("draw.arrow", null, { comp: comp, from: tr, to: box, start: 2.1, params: { bend: 0.25 } });
  run("draw.circle", ipa, { start: 2.7 });
  run(kbTok(st, "motion.text"), phrase, { start: 3.0 });
  run("text.highlightWord", phrase, { start: 3.6, params: { word: "apple" } });
  run("emphasis.pop", word, { start: 3.5 });
  run("callout", null, { comp: comp, from: [600, 1260], to: [830, 1130], start: 3.8, params: { text: "fruit — жеміс" } });
  run("emphasis.dimOthers", null, { start: 4.0, others: [label, tr] });
  run("emphasis.shake", box, { start: 4.4 });
  run("emphasis.undim", null, { start: 4.8, others: [label, tr] });
  run("draw.strike", tr, { start: 4.6 });
  run("undraw", comp.layer(arrow.layers[0]), { start: 5.0 });
  run("text.maskDown", phrase, { start: 5.1 });
  run("exit.fadeDown", box, { start: 5.2 });
  return name + ": " + log.join("; ");
}

kbRun("lib-demo", function () {
  var out = [demo("editorial-dark"), demo("swiss-light"), demo("color-blocks")];
  kbLog("lib-demo\n" + out.join("\n"));
});

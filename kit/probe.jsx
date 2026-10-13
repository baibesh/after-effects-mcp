// Зонд: снимает с живого AE то, чего нет в документации, — параметры эффектов из списка KB_PROBE_EFFECTS.
// Все подряд перебирать нельзя: часть старых эффектов (Basic Text, Numbers, Path Text, Apply Color LUT)
// при добавлении открывает диалог и вешает AE до ответа человека. Нужен новый эффект — дописать в список.
// Запускать один раз после установки AE и после каждого обновления версии.
//
//   tools/data/effect-params.json        { "<matchName эффекта>": ["<matchName параметра>", …] } — читает validate.mjs
//   tools/data/effect-params-names.json  то же с именами и типами значений — справочник при написании кита
//   tools/data/layer-props.json          { "<matchName>": "<имя>" } — свойства текста, shape, камеры, света, материала,
//                                        которых нет в документации; validate.mjs добавляет их к словарю
//   tools/data/fonts.json                PostScript-имена установленных шрифтов проекта (KB_CONFIG.probeFonts) — их ждёт TextDocument.font
//
// Эффект, который не удалось добавить на слой (нужен 3D-слой, камера, лицензия), попадает в журнал и пропускается.

//@include "core.jsx"

/** @param {string} text */
function kbQuote(text) {
  return '"' + String(text).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/[\r\n]+/g, " ") + '"';
}

/**
 * @param {string} relativePath
 * @param {string} text
 */
function kbWrite(relativePath, text) {
  var file = new File(KB_ROOT.fsName + "/" + relativePath);
  if (!file.parent.exists) file.parent.create();
  file.encoding = "UTF-8";
  file.lineFeed = "Unix";
  file.open("w");
  file.write(text);
  file.close();
}

/**
 * @param {any} group
 * @param {string[]} out строки "matchName": "имя"
 */
function kbDumpTree(group, out) {
  for (var i = 1; i <= group.numProperties; i++) {
    var child = group.property(i);
    out.push(kbQuote(child.matchName) + ": " + kbQuote(child.name));
    if (child.numProperties) kbDumpTree(child, out);
  }
}

/** Слои со всем, что кит добавляет скриптом, — чтобы в дереве были и добавляемые свойства. */
function kbProbeLayers() {
  var comp = app.project.items.addComp("kb-probe-layers", 400, 400, 1, 1, 30);
  var out = [];

  var text = comp.layers.addText("probe");
  text.threeDLayer = true;
  var animator = kbAdd(kbGroup(text, ["ADBE Text Properties", "ADBE Text Animators"]), "ADBE Text Animator");
  var animated = kbGroup(animator, ["ADBE Text Animator Properties"]);
  var wanted = ["ADBE Text Position 3D", "ADBE Text Scale 3D", "ADBE Text Rotation", "ADBE Text Opacity",
    "ADBE Text Blur", "ADBE Text Tracking Amount", "ADBE Text Fill Color"];
  for (var w = 0; w < wanted.length; w++) if (animated.canAddProperty(wanted[w])) animated.addProperty(wanted[w]);
  var selectors = kbGroup(animator, ["ADBE Text Selectors"]);
  kbAdd(selectors, "ADBE Text Selector");
  if (selectors.canAddProperty("ADBE Text Wiggly Selector")) selectors.addProperty("ADBE Text Wiggly Selector"); // ae-ok: matchname
  kbDumpTree(text, out);

  var shape = comp.layers.addShape();
  var contents = kbGroup(kbAdd(kbGroup(shape, ["ADBE Root Vectors Group"]), "ADBE Vector Group"), ["ADBE Vectors Group"]);
  var parts = ["ADBE Vector Shape - Group", "ADBE Vector Shape - Rect", "ADBE Vector Shape - Ellipse",
    "ADBE Vector Graphic - Stroke", "ADBE Vector Graphic - Fill", "ADBE Vector Filter - Trim",
    "ADBE Vector Filter - Repeater", "ADBE Vector Filter - Roughen", "ADBE Vector Filter - Wiggler",
    "ADBE Vector Filter - Offset", "ADBE Vector Filter - Merge", "ADBE Vector Filter - PB", "ADBE Vector Filter - RC"];
  for (var s = 0; s < parts.length; s++) if (contents.canAddProperty(parts[s])) contents.addProperty(parts[s]);
  kbDumpTree(shape, out);

  kbDumpTree(comp.layers.addCamera("cam", [200, 200]), out);
  kbDumpTree(comp.layers.addLight("light", [200, 200]), out);

  var solid = comp.layers.addSolid([1, 1, 1], "solid3d", 100, 100, 1);
  solid.threeDLayer = true;
  kbDumpTree(solid, out);

  comp.remove();
  kbWrite("tools/data/layer-props.json", "{\n" + out.join(",\n") + "\n}\n");
  kbLog("probe: свойств слоёв " + out.length);
}

function kbProbeFonts() {
  var fonts = /** @type {any} */ (app).fonts;
  if (!fonts || !fonts.allFonts) { kbLog("probe: app.fonts нет в этой версии AE"); return; }
  var out = [];
  for (var f = 0; f < fonts.allFonts.length; f++) {
    var family = fonts.allFonts[f];
    for (var i = 0; i < family.length; i++) {
      var font = family[i];
      if (new RegExp(kbConfig("probeFonts", "inter"), "i").test(font.familyName)) {
        out.push("{\"postScriptName\": " + kbQuote(font.postScriptName) + ", \"family\": " + kbQuote(font.familyName) +
          ", \"style\": " + kbQuote(font.styleName) + "}");
      }
    }
  }
  kbWrite("tools/data/fonts.json", "[\n" + out.join(",\n") + "\n]\n");
  kbLog("probe: шрифтов " + kbConfig("probeFonts", "inter") + " — " + out.length);
}

kbRun("probe-layers", kbProbeLayers);
kbRun("probe-fonts", kbProbeFonts);

// ae-ok-file: bpc — зонд только читает параметры, глубина цвета здесь ни при чём.
var KB_PROBE_EFFECTS = [
  "ADBE Turbulent Displace", "ADBE Roughen Edges", "ADBE Posterize Time", "ADBE Fractal Noise",
  "ADBE Camera Lens Blur", "ADBE Glo2", "ADBE BEZMESH", "CC Bend It", "CC Particle World",
  "ADBE Simple Choker", "ADBE Box Blur2", "ADBE Gaussian Blur 2", "VISINF Grain Implant", "ADBE Noise",
  "ADBE Echo", "ADBE Optics Compensation", "ADBE Drop Shadow", "ADBE Fill", "ADBE Tint", "ADBE Set Matte3",
  "ADBE Displacement Map", "ADBE Lumetri", "ADBE Easy Levels2", "CC Force Motion Blur", "CC Wide Time",
  "ADBE Wave Warp", "ADBE Ramp", "ADBE 4ColorGradient", "ADBE Exposure2", "ADBE HUE SATURATION", "CS Vignette",
  "CC Glass", "CC Mr. Mercury", "ADBE Matte Choker", "ADBE Minimax", "ADBE Offset", "ADBE Tile",
  "ADBE Shift Channels", "ADBE Linear Wipe", "ADBE Radial Wipe", "ADBE Stroke", "ADBE Write-on",
  "ADBE Slider Control", "ADBE Color Control", "ADBE Point Control", "ADBE Checkbox Control",
  "ADBE Angle Control", "ADBE Geometry2", "ADBE Mosaic", "ADBE Find Edges", "ADBE Threshold2", "ADBE Invert",
  "ADBE Tritone", "ADBE Motion Blur", "ADBE Radial Blur", "CC Radial Fast Blur", "CC Light Rays",
  "CC Light Sweep", "ADBE MESH WARP", "ADBE LIQUIFY", "ADBE Spherize", "ADBE Bulge", "ADBE Twirl",
  "ADBE Ripple", "CC Page Turn", "ADBE Scatter", "ADBE Brush Strokes", "ADBE Cartoonify", "ADBE Posterize",
  "ADBE Venetian Blinds", "ADBE Scribble Fill"
];

kbRun("probe", function () {
  var comp = app.project.items.addComp("kb-probe", 200, 200, 1, 1, 30);
  var layer = comp.layers.addSolid([0.5, 0.5, 0.5], "probe", 200, 200, 1);
  var parade = kbGroup(layer, ["ADBE Effect Parade"]);

  var catalog = {};
  for (var c = 0; c < app.effects.length; c++) catalog[app.effects[c].matchName] = app.effects[c];

  var plain = [];
  var named = [];
  var skipped = 0;

  for (var i = 0; i < KB_PROBE_EFFECTS.length; i++) {
    var matchName = KB_PROBE_EFFECTS[i];
    var info = catalog[matchName];
    if (!info || !parade.canAddProperty(matchName)) {
      kbLog("probe: нет в этой версии AE — " + matchName);
      skipped++;
      continue;
    }

    var effect;
    try {
      effect = kbAdd(parade, matchName);
    } catch (e) {
      kbLog("probe: пропущен " + matchName + " — " + e.message);
      skipped++;
      continue;
    }

    var ids = [];
    var details = [];
    for (var p = 1; p <= effect.numProperties; p++) {
      var param = effect.property(p);
      ids.push(kbQuote(param.matchName));
      var valueType = param instanceof Property ? String(param.propertyValueType) : "group";
      details.push(kbQuote(param.matchName) + ": [" + kbQuote(param.name) + ", " + kbQuote(valueType) + "]");
    }
    plain.push(kbQuote(matchName) + ": [" + ids.join(", ") + "]");
    named.push(kbQuote(matchName) + ": {\"name\": " + kbQuote(info.displayName) +
      ", \"category\": " + kbQuote(info.category) + ", \"params\": {" + details.join(", ") + "}}");

    effect.remove();
  }

  comp.remove();
  kbWrite("tools/data/effect-params.json", "{\n" + plain.join(",\n") + "\n}\n");
  kbWrite("tools/data/effect-params-names.json", "{\n" + named.join(",\n") + "\n}\n");
  kbLog("probe: эффектов " + plain.length + ", пропущено " + skipped + ", AE " + app.version);
});

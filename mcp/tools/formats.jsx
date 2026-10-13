// Форматы: композиция под другой размер кадра и проверка безопасных зон.
//
// Правильный путь — своя раскладка под каждый формат (композиция «<имя> <формат>», собранная вручную
// или скриптом из тех же данных с другим KB_FRAME). Переразметка готовой сцены — запасной путь:
// сцена кладётся целиком, масштаб «cover» (заполнить кадр, обрезав края) или «contain» (вписать,
// поля — размытая копия или цвет). Что из текста вылезло за безопасные зоны — в ответе.

/**
 * Прямоугольник текста слоя в координатах его композиции в момент t. Только для слоёв без родителя,
 * без поворота и не 3D — остальное посчитать без выражений нельзя, такие слои возвращают null.
 * @param {TextLayer} layer
 * @param {number} t
 * @returns {number[]|null} [left, top, right, bottom]
 */
function mcpTextBox(layer, t) {
  if (layer.parent || /** @type {any} */ (layer).threeDLayer) return null;
  if (kbProp(layer, ["ADBE Transform Group", "ADBE Rotate Z"]).valueAtTime(t, false) !== 0) return null;
  var rect = layer.sourceRectAtTime(t, false);
  var pos = kbProp(layer, ["ADBE Transform Group", "ADBE Position"]).valueAtTime(t, false);
  var anchor = kbProp(layer, ["ADBE Transform Group", "ADBE Anchor Point"]).valueAtTime(t, false);
  var scale = kbProp(layer, ["ADBE Transform Group", "ADBE Scale"]).valueAtTime(t, false);
  var sx = scale[0] / 100;
  var sy = scale[1] / 100;
  var x0 = pos[0] + (rect.left - anchor[0]) * sx;
  var y0 = pos[1] + (rect.top - anchor[1]) * sy;
  var x1 = x0 + rect.width * sx;
  var y1 = y0 + rect.height * sy;
  return [Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1)];
}

/**
 * Текстовые слои исходной композиции, которые после переноса (масштаб k, сдвиг dx, dy) выходят
 * за безопасную зону целевого кадра. Проверка в начале, середине и конце жизни слоя.
 * @param {CompItem} source
 * @param {number} k
 * @param {number} dx
 * @param {number} dy
 * @param {number[]} safe [left, top, right, bottom] — допустимая область целевого кадра
 * @returns {{outside: Object[], unchecked: string[]}}
 */
function mcpCheckSafe(source, k, dx, dy, safe) {
  var outside = [];
  var unchecked = [];
  for (var i = 1; i <= source.numLayers; i++) {
    var layer = source.layer(i);
    if (!(layer instanceof TextLayer) || !layer.enabled) continue;
    var times = [layer.inPoint, (layer.inPoint + layer.outPoint) / 2, layer.outPoint - 1 / source.frameRate];
    for (var j = 0; j < times.length; j++) {
      var t = Math.max(0, Math.min(times[j], source.duration - 1 / source.frameRate));
      var box = mcpTextBox(/** @type {TextLayer} */ (layer), t);
      if (!box) {
        unchecked.push(layer.name);
        break;
      }
      var b = [box[0] * k + dx, box[1] * k + dy, box[2] * k + dx, box[3] * k + dy];
      if (b[0] < safe[0] || b[1] < safe[1] || b[2] > safe[2] || b[3] > safe[3]) {
        outside.push({layer: layer.name, time: Math.round(t * 100) / 100, box: [Math.round(b[0]), Math.round(b[1]), Math.round(b[2]), Math.round(b[3])]});
        break;
      }
    }
  }
  return {outside: outside, unchecked: unchecked};
}

/**
 * @param {string} name
 * @returns {CompItem|null}
 */
function mcpCompOrNull(name) {
  for (var i = 1; i <= app.project.numItems; i++) {
    var item = app.project.item(i);
    if (item instanceof CompItem && item.name === name) return item;
  }
  return null;
}

MCP_TOOLS.make_format_comp = {
  write: false, // готовую раскладку только находит; создание новой — с проверкой проекта и отменой (ниже)
  run: function (args) {
    var source = mcpFindComp(args.comp);
    var w = args.width;
    var h = args.height;
    var safe = args.safe; // [left, top, right, bottom] отступы
    var safeRect = [safe[0], safe[1], w - safe[2], h - safe[3]];

    // 1. Своя раскладка уже есть — берём её, ничего не создаём.
    var layoutName = source.name + " " + args.format;
    var layout = mcpCompOrNull(layoutName);
    if (layout) {
      if (layout.width !== w || layout.height !== h) {
        throw new Error("Раскладка «" + layoutName + "» есть, но её размер " + layout.width + "×" + layout.height + ", а формату " + args.format + " нужен " + w + "×" + h);
      }
      var own = mcpCheckSafe(layout, 1, 0, 0, safeRect);
      return {comp: mcpItemPath(layout), kind: "layout", outside: own.outside, unchecked: own.unchecked};
    }
    if (source.width === w && source.height === h) {
      var same = mcpCheckSafe(source, 1, 0, 0, safeRect);
      return {comp: mcpItemPath(source), kind: "source", outside: same.outside, unchecked: same.unchecked};
    }

    // 2. Переразметка: исходная сцена слоем в новой композиции.
    mcpCheckWritable();
    app.beginUndoGroup("MCP: make_format_comp");
    try {
      return mcpReframe(source, args, w, h, safeRect, layoutName);
    } finally {
      app.endUndoGroup();
    }
  }
};

/**
 * @param {CompItem} source
 * @param {any} args
 * @param {number} w
 * @param {number} h
 * @param {number[]} safeRect
 * @param {string} layoutName
 * @returns {Object}
 */
function mcpReframe(source, args, w, h, safeRect, layoutName) {
  var name = layoutName + " (reframe)";
  var old = mcpCompOrNull(name);
  if (old) old.remove();
  var comp = app.project.items.addComp(name, w, h, 1, source.duration, source.frameRate);
  comp.parentFolder = source.parentFolder;
  comp.bgColor = source.bgColor;

  var mode = args.mode || "cover";
  var cover = Math.max(w / source.width, h / source.height);
  var contain = Math.min(w / source.width, h / source.height);
  var k = mode === "cover" ? cover : contain;
  var focus = args.focus || [source.width / 2, source.height / 2];

  // Точка фокуса — в центр кадра; при cover сдвиг ограничен, чтобы не открыть пустые края.
  var dx = w / 2 - focus[0] * k;
  var dy = h / 2 - focus[1] * k;
  if (mode === "cover") {
    dx = Math.min(0, Math.max(w - source.width * k, dx));
    dy = Math.min(0, Math.max(h - source.height * k, dy));
  }

  if (mode === "contain" && (args.background || "blur") === "blur") {
    var back = comp.layers.add(source);
    back.name = "background (blur)";
    back.audioEnabled = false; // иначе звук сцены играет дважды (+6 дБ)
    kbProp(back, ["ADBE Transform Group", "ADBE Scale"]).setValue([cover * 100, cover * 100]);
    var blur = kbEffect(back, "ADBE Gaussian Blur 2");
    kbProp(blur, ["ADBE Gaussian Blur 2-0001"]).setValue(60); // Blurriness
    kbProp(blur, ["ADBE Gaussian Blur 2-0003"]).setValue(1); // Repeat Edge Pixels
    kbProp(back, ["ADBE Transform Group", "ADBE Opacity"]).setValue(70);
  } else if (mode === "contain" && args.background instanceof Array) {
    comp.bgColor = args.background;
  }

  var layer = comp.layers.add(source);
  layer.name = source.name;
  kbProp(layer, ["ADBE Transform Group", "ADBE Anchor Point"]).setValue([0, 0]);
  kbProp(layer, ["ADBE Transform Group", "ADBE Scale"]).setValue([k * 100, k * 100]);
  kbProp(layer, ["ADBE Transform Group", "ADBE Position"]).setValue([dx, dy]);

  var check = mcpCheckSafe(source, k, dx, dy, safeRect);
  return {
    comp: mcpItemPath(comp),
    kind: "reframe",
    mode: mode,
    scale: Math.round(k * 1000) / 10,
    offset: [Math.round(dx), Math.round(dy)],
    outside: check.outside,
    unchecked: check.unchecked
  };
}

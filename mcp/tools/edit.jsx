// Правка готового: ключи (сдвиг, растяжение, ease, удаление, установка), текст, исходник слоя, цвет.
//
// Ключ в ExtendScript нельзя передвинуть по времени — только снять со всеми свойствами (значение,
// интерполяция, ease, пространственные касательные, roving, непрерывность) и поставить заново.

var MCP_SHORT_PROPS = {
  position: ["ADBE Transform Group", "ADBE Position"],
  scale: ["ADBE Transform Group", "ADBE Scale"],
  rotation: ["ADBE Transform Group", "ADBE Rotate Z"],
  opacity: ["ADBE Transform Group", "ADBE Opacity"],
  anchor: ["ADBE Transform Group", "ADBE Anchor Point"],
  x: ["ADBE Transform Group", "ADBE Position_0"],
  y: ["ADBE Transform Group", "ADBE Position_1"],
  timeRemap: ["ADBE Time Remapping"],
  sourceText: ["ADBE Text Properties", "ADBE Text Document"]
};

/**
 * Свойства для правки: короткое имя, «*» (всё с ключами в трансформе) или путь имён/matchName
 * (["Effects", "Gaussian Blur", "Blurriness"] или ["ADBE Effect Parade", "ADBE Gaussian Blur 2", "ADBE Gaussian Blur 2-0001"]).
 * @param {Layer} layer
 * @param {any} prop
 * @returns {any[]}
 */
function mcpResolveProps(layer, prop) {
  if (prop === "*") {
    var all = [];
    var tr = kbGroup(layer, ["ADBE Transform Group"]);
    for (var i = 1; i <= tr.numProperties; i++) {
      /** @type {any} */
      var p = tr.property(i);
      if (p && p.numKeys > 0) all.push(p);
    }
    return all;
  }
  if (prop instanceof Array) return [kbProp(layer, prop)];
  var path = MCP_SHORT_PROPS[prop];
  if (!path) throw new Error("Нет свойства «" + prop + "». Короткие: position, scale, rotation, opacity, anchor, x, y, timeRemap, sourceText; «*» — весь трансформ; или путь [группа, …, свойство]");
  return [kbProp(layer, path)];
}

/**
 * Всё о ключе, чтобы поставить его заново в другое время.
 * @param {any} p
 * @param {number} k
 * @returns {Object}
 */
function mcpKeySnapshot(p, k) {
  var s = {
    time: p.keyTime(k),
    value: p.keyValue(k),
    inType: p.keyInInterpolationType(k),
    outType: p.keyOutInterpolationType(k)
  };
  if (s.inType === KeyframeInterpolationType.BEZIER || s.outType === KeyframeInterpolationType.BEZIER) {
    s.easeIn = p.keyInTemporalEase(k);
    s.easeOut = p.keyOutTemporalEase(k);
    s.continuous = p.keyTemporalContinuous(k);
    s.autoBezier = p.keyTemporalAutoBezier(k);
  }
  if (p.isSpatial) {
    s.tanIn = p.keyInSpatialTangent(k);
    s.tanOut = p.keyOutSpatialTangent(k);
    s.spatialContinuous = p.keySpatialContinuous(k);
    s.spatialAuto = p.keySpatialAutoBezier(k);
    s.roving = p.keyRoving(k);
  }
  return s;
}

/**
 * @param {any} p
 * @param {any} s снимок mcpKeySnapshot
 * @param {number} t новое время
 */
function mcpKeyRestore(p, s, t) {
  p.setValueAtTime(t, s.value);
  var k = p.nearestKeyIndex(t);
  if (s.easeIn) {
    p.setTemporalEaseAtKey(k, s.easeIn, s.easeOut);
    p.setTemporalContinuousAtKey(k, s.continuous);
    p.setTemporalAutoBezierAtKey(k, s.autoBezier);
  }
  p.setInterpolationTypeAtKey(k, s.inType, s.outType);
  if (s.tanIn) {
    p.setSpatialTangentsAtKey(k, s.tanIn, s.tanOut);
    p.setSpatialContinuousAtKey(k, s.spatialContinuous);
    p.setSpatialAutoBezierAtKey(k, s.spatialAuto);
  }
  if (s.roving) p.setRovingAtKey(k, true);
}

/**
 * Перенести ключи отрезка по правилу map(t). Порядок ключей не меняется: перескок через неподвижный ключ,
 * попадание на него или два ключа в одном кадре — ошибка, свойство возвращается как было.
 * AE при вставке ключа в отрезок пересчитывает ease соседей — у неподвижных ключей он восстанавливается.
 * @param {any} p
 * @param {number} from
 * @param {number} to
 * @param {function(number): number} map
 * @param {number} fps
 * @returns {number} сколько ключей перенесено
 */
function mcpMoveKeys(p, from, to, map, fps) {
  var eps = 0.5 / fps;
  var moving = [];
  var staying = [];
  var k;
  for (k = 1; k <= p.numKeys; k++) {
    var t = p.keyTime(k);
    if (t >= from - eps && t <= to + eps) moving.push(mcpKeySnapshot(p, k));
    else staying.push(mcpKeySnapshot(p, k));
  }
  var targets = [];
  var problem = null;
  for (var i = 0; i < moving.length && !problem; i++) {
    var nt = Math.round(map(moving[i].time) * fps) / fps; // на кадр композиции
    if (nt < 0) problem = "ключ ушёл бы в отрицательное время (" + mcpRound(nt) + " с)";
    for (var o = 0; o < staying.length && !problem; o++) {
      var st = staying[o].time;
      if (Math.abs(st - nt) < eps) problem = "ключ встал бы на неподвижный ключ " + mcpRound(st) + " с";
      else if (st > Math.min(moving[i].time, nt) && st < Math.max(moving[i].time, nt)) {
        problem = "ключ " + mcpRound(moving[i].time) + " с перескочил бы через неподвижный ключ " + mcpRound(st) + " с — порядок анимации сломается; возьмите отрезок from/to шире";
      }
    }
    for (var c = 0; c < targets.length && !problem; c++) {
      if (Math.abs(targets[c] - nt) < eps) problem = "сжатие сводит два ключа в один кадр (" + mcpRound(nt) + " с)";
    }
    targets.push(nt);
  }
  if (problem) throw new Error("«" + p.name + "»: " + problem + " — ничего не изменено");
  for (k = p.numKeys; k >= 1; k--) {
    var tk = p.keyTime(k);
    if (tk >= from - eps && tk <= to + eps) p.removeKey(k);
  }
  for (var j = 0; j < moving.length; j++) mcpKeyRestore(p, moving[j], targets[j]);
  for (var s2 = 0; s2 < staying.length; s2++) {
    var ks = p.nearestKeyIndex(staying[s2].time);
    var snap = staying[s2];
    if (snap.easeIn) p.setTemporalEaseAtKey(ks, snap.easeIn, snap.easeOut);
    p.setInterpolationTypeAtKey(ks, snap.inType, snap.outType);
  }
  return moving.length;
}

/**
 * Ease на ключи отрезка: строка (snap/soft/punch/linear/hold) или {in, out} — влияние, %.
 * @param {any} p
 * @param {number} from
 * @param {number} to
 * @param {any} ease
 * @param {number} fps
 * @returns {number}
 */
function mcpEaseKeys(p, from, to, ease, fps) {
  var eps = 0.5 / fps;
  var n = 0;
  var dims = mcpEaseDims(p);
  for (var k = 1; k <= p.numKeys; k++) {
    var t = p.keyTime(k);
    if (t < from - eps || t > to + eps) continue;
    n++;
    if (ease === "hold") {
      p.setInterpolationTypeAtKey(k, p.keyInInterpolationType(k), KeyframeInterpolationType.HOLD);
      continue;
    }
    if (ease === "linear") {
      p.setInterpolationTypeAtKey(k, KeyframeInterpolationType.LINEAR, KeyframeInterpolationType.LINEAR);
      continue;
    }
    var e = typeof ease === "string" ? MCP_PRESET_EASE[ease] : {out: ease.out, into: ease["in"]};
    if (!e) throw new Error("Нет ease «" + ease + "»: snap, soft, punch, linear, hold или {in, out} — влияние, %");
    p.setInterpolationTypeAtKey(k, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
    var inEase = e.into === undefined ? p.keyInTemporalEase(k) : mcpEaseArray(dims, e.into);
    var outEase = e.out === undefined ? p.keyOutTemporalEase(k) : mcpEaseArray(dims, e.out);
    p.setTemporalEaseAtKey(k, /** @type {any} */ (inEase), /** @type {any} */ (outEase));
  }
  return n;
}

/**
 * Ключи свойства коротко — для ответа.
 * @param {any} p
 * @returns {Object}
 */
function mcpKeysSummary(p) {
  var keys = [];
  for (var k = 1; k <= p.numKeys && k <= 40; k++) {
    var v = p.keyValue(k);
    keys.push({time: mcpRound(p.keyTime(k)), value: typeof v === "number" || v instanceof Array ? mcpValue(p, v) : "…", interp: MCP_INTERP[p.keyOutInterpolationType(k)]});
  }
  return {prop: p.name, keys: keys, total: p.numKeys};
}

MCP_TOOLS.edit_keys = {
  write: true,
  run: function (args) {
    var comp = mcpFindComp(args.comp);
    var layer = mcpFindLayer(comp, args.layer);
    var props = mcpResolveProps(layer, args.prop);
    if (!props.length) throw new Error("У «" + layer.name + "» нет ключей в трансформе");
    var fps = comp.frameRate;
    var from = args.from === undefined ? -1e9 : args.from;
    var to = args.to === undefined ? 1e9 : args.to;
    var done = [];
    for (var i = 0; i < props.length; i++) {
      var p = props[i];
      var n = 0;
      if (args.action === "shift") {
        var delta = args.frames !== undefined ? args.frames / fps : args.seconds;
        if (delta === undefined) throw new Error("shift: укажите seconds или frames");
        n = mcpMoveKeys(p, from, to, function (t) { return t + delta; }, fps);
      } else if (args.action === "stretch") {
        if (!args.factor) throw new Error("stretch: укажите factor (2 — вдвое длиннее, 0.5 — вдвое короче)");
        var pivot = args.pivot === undefined ? Math.max(from, 0) : args.pivot;
        n = mcpMoveKeys(p, from, to, function (t) { return pivot + (t - pivot) * args.factor; }, fps);
      } else if (args.action === "ease") {
        n = mcpEaseKeys(p, from, to, args.ease, fps);
      } else if (args.action === "delete") {
        var eps = 0.5 / fps;
        for (var k = p.numKeys; k >= 1; k--) {
          var t = p.keyTime(k);
          if (t >= from - eps && t <= to + eps) { p.removeKey(k); n++; }
        }
      } else if (args.action === "set") {
        if (args.time === undefined || args.value === undefined) throw new Error("set: укажите time и value");
        var tt = Math.round(args.time * fps) / fps;
        p.setValueAtTime(tt, args.value);
        if (args.ease) mcpEaseKeys(p, tt, tt, args.ease, fps);
        n = 1;
      } else {
        throw new Error("Нет действия «" + args.action + "»: shift, stretch, ease, delete, set");
      }
      var sum = mcpKeysSummary(p);
      sum.changed = n;
      done.push(sum);
    }
    return {layer: layer.name, action: args.action, props: done};
  }
};

MCP_TOOLS.set_text = {
  write: true,
  run: function (args) {
    var comp = mcpFindComp(args.comp);
    var layer = mcpFindLayer(comp, args.layer);
    if (!(layer instanceof TextLayer)) throw new Error("«" + layer.name + "» — не текстовый слой");
    var source = kbProp(layer, ["ADBE Text Properties", "ADBE Text Document"]);
    if (args.font) {
      var font = KB_FONT[args.font] || args.font;
      var found = app.fonts.getFontsByPostScriptName(font);
      var real = false;
      for (var f = 0; found && f < found.length; f++) if (!found[f].isSubstitute) real = true;
      if (!real) throw new Error("Шрифта «" + font + "» нет в системе");
      args.font = font;
    }
    // Якорь был в центре текста (так ставит add_text / kbText) — держим его в центре и после правки.
    var anchorProp = kbProp(layer, ["ADBE Transform Group", "ADBE Anchor Point"]);
    var t = args.time === undefined ? comp.time : args.time;
    var before = layer.sourceRectAtTime(t, false);
    var anchor = anchorProp.value;
    var centered = Math.abs(anchor[0] - (before.left + before.width / 2)) < 1 && Math.abs(anchor[1] - (before.top + before.height / 2)) < 1;

    /** @param {TextDocument} doc @returns {TextDocument} */
    var restyle = function (doc) {
      if (args.font) doc.font = args.font;
      if (args.size) doc.fontSize = args.size;
      if (args.color) { doc.applyFill = true; doc.fillColor = args.color; }
      if (args.tracking !== undefined) doc.tracking = args.tracking;
      if (args.leading) { doc.autoLeading = false; doc.leading = args.leading; }
      if (args.justify) {
        doc.justification = args.justify === "left" ? ParagraphJustification.LEFT_JUSTIFY :
          (args.justify === "right" ? ParagraphJustification.RIGHT_JUSTIFY : ParagraphJustification.CENTER_JUSTIFY);
      }
      return doc;
    };
    if (source.numKeys > 0) {
      // Текст меняется во времени: стиль — на всех ключах, новый текст — только в ключе в момент time.
      for (var k = 1; k <= source.numKeys; k++) source.setValueAtKey(k, restyle(source.keyValue(k)));
      if (args.text !== undefined) {
        if (args.time === undefined) throw new Error("У «" + layer.name + "» текст меняется по ключам — укажите time, в какой момент заменить");
        var doc = restyle(source.valueAtTime(args.time, true));
        doc.text = String(args.text).replace(/\n/g, "\r");
        source.setValueAtTime(args.time, doc);
      }
    } else {
      var d = restyle(source.value);
      if (args.text !== undefined) d.text = String(args.text).replace(/\n/g, "\r");
      source.setValue(d);
    }
    if (centered && anchorProp.numKeys === 0) {
      var after = layer.sourceRectAtTime(t, false);
      anchorProp.setValue([after.left + after.width / 2, after.top + after.height / 2]);
    }
    var now = source.valueAtTime(t, false);
    return {layer: layer.name, text: now.text, font: now.font, size: now.fontSize, centered: centered};
  }
};

MCP_TOOLS.replace_footage = {
  write: true,
  run: function (args) {
    var comp = mcpFindComp(args.comp);
    var layer = /** @type {AVLayer} */ (mcpFindLayer(comp, args.layer));
    var old = layer.source;
    if (!(old instanceof FootageItem)) throw new Error("«" + layer.name + "» — не картинка/видео/звук (замена только для слоёв из файлов)");
    var file = new File(args.file);
    if (!file.exists) throw new Error("Нет файла " + args.file);
    var oldWidth = old.hasVideo ? old.width : 0;
    var others = [];
    if (args.everywhere) {
      // Во всём проекте: меняется сам элемент Project, его используют все слои
      old.replace(file);
    } else {
      var item = kbImport(file.fsName);
      layer.replaceSource(item, false);
    }
    var source = layer.source;
    if (args.keepSize !== false && oldWidth && source.hasVideo && source.width !== oldWidth) {
      // Та же ширина на экране: масштаб × старая ширина / новая
      var scale = kbProp(layer, ["ADBE Transform Group", "ADBE Scale"]);
      if (scale.numKeys > 0) {
        others.push("у масштаба есть ключи — размер не подгонялся");
      } else {
        var k = oldWidth / source.width;
        var s = scale.value;
        scale.setValue([s[0] * k, s[1] * k, s[2]]);
      }
    }
    return {layer: layer.name, source: source.name, size: source.hasVideo ? [source.width, source.height] : null, everywhere: args.everywhere === true, notes: others};
  }
};

/**
 * Свойства цвета внутри shape-группы (заливки или обводки), рекурсивно.
 * @param {any} group
 * @param {string} matchName "ADBE Vector Graphic - Fill" / "- Stroke"
 * @param {any[]} out
 */
function mcpShapeColors(group, matchName, out) {
  for (var i = 1; i <= group.numProperties; i++) {
    /** @type {any} */
    var p = group.property(i);
    if (!p || p.propertyType === PropertyType.PROPERTY) continue;
    if (p.matchName === matchName) {
      out.push(p.property(matchName === "ADBE Vector Graphic - Fill" ? "ADBE Vector Fill Color" : "ADBE Vector Stroke Color"));
    } else {
      mcpShapeColors(p, matchName, out);
    }
  }
}

MCP_TOOLS.set_color = {
  write: true,
  run: function (args) {
    var comp = mcpFindComp(args.comp);
    var layer = mcpFindLayer(comp, args.layer);
    var target = args.target || "fill";
    var color = args.color;
    if (layer instanceof TextLayer) {
      var source = kbProp(layer, ["ADBE Text Properties", "ADBE Text Document"]);
      var apply = function (/** @type {TextDocument} */ doc) {
        if (target === "stroke") { doc.applyStroke = true; doc.strokeColor = color; } else { doc.applyFill = true; doc.fillColor = color; }
        return doc;
      };
      if (source.numKeys) for (var k = 1; k <= source.numKeys; k++) source.setValueAtKey(k, apply(source.keyValue(k)));
      else source.setValue(apply(source.value));
      return {layer: layer.name, kind: "text", target: target, color: color};
    }
    if (layer instanceof ShapeLayer) {
      var props = [];
      mcpShapeColors(kbGroup(layer, ["ADBE Root Vectors Group"]), target === "stroke" ? "ADBE Vector Graphic - Stroke" : "ADBE Vector Graphic - Fill", props);
      if (!props.length) throw new Error("У «" + layer.name + "» нет " + (target === "stroke" ? "обводки" : "заливки"));
      var keyed = 0;
      for (var i = 0; i < props.length; i++) {
        if (props[i].numKeys) { keyed++; continue; }
        props[i].setValue(color);
      }
      return {layer: layer.name, kind: "shape", target: target, changed: props.length - keyed, skippedKeyed: keyed};
    }
    var av = /** @type {AVLayer} */ (layer);
    if (av.source instanceof FootageItem && av.source.mainSource instanceof SolidSource) {
      /** @type {SolidSource} */ (av.source.mainSource).color = color;
      return {layer: layer.name, kind: "solid", color: color, note: "цвет заливки общий для всех слоёв с этим solid"};
    }
    throw new Error("Цвет меняется у текста, фигуры или заливки (solid); у «" + layer.name + "» — " + mcpLayerKind(layer));
  }
};

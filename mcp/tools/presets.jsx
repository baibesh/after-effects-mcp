// Пресеты анимации: данные (presets/*.json — ключи в кадрах при 24 fps) и файлы .ffx (Animation → Save Animation Preset).
// JSON читает сервер и передаёт сюда объектом; .ffx применяется штатно через applyPreset.

/** Короткие имена свойств трансформа → matchName. */
var MCP_PRESET_PROPS = {
  opacity: "ADBE Opacity",
  position: "ADBE Position",
  scale: "ADBE Scale",
  rotation: "ADBE Rotate Z",
  anchor: "ADBE Anchor Point"
};

/** Ease отрезка: out — влияние на выходе из ключа, into — на входе в следующий (как KB_EASE). */
var MCP_PRESET_EASE = {
  snap: KB_EASE.snap,
  soft: KB_EASE.soft,
  punch: KB_EASE.punch
};

/**
 * @param {Property} prop
 * @returns {number}
 */
function mcpEaseDims(prop) {
  if (prop.propertyValueType === PropertyValueType.ThreeD) return 3;
  if (prop.propertyValueType === PropertyValueType.TwoD) return 2;
  return 1; // и у пространственных свойств (позиция) — одно измерение
}

/**
 * @param {number} dims
 * @param {number} influence
 * @returns {any}
 */
function mcpEaseArray(dims, influence) {
  var out = [];
  for (var d = 0; d < dims; d++) out.push(new KeyframeEase(0, influence));
  return out;
}

/**
 * Ключ со значением трека: absolute — как есть, offset — прибавить к базе, factor — база × v / 100.
 * @param {string} mode
 * @param {any} base значение свойства до пресета
 * @param {any} v
 * @returns {any}
 */
function mcpPresetValue(mode, base, v) {
  if (mode === "absolute" || mode === undefined) {
    if (base instanceof Array && !(v instanceof Array)) {
      var filled = [];
      for (var i = 0; i < base.length; i++) filled.push(v); // scale: 0 → [0, 0, 0]
      return filled;
    }
    return v;
  }
  if (!(base instanceof Array)) return mode === "factor" ? base * v / 100 : base + v;
  var out = [];
  for (var j = 0; j < base.length; j++) {
    var part = v instanceof Array ? (j < v.length ? v[j] : (mode === "factor" ? 100 : 0)) : v;
    out.push(mode === "factor" ? base[j] * part / 100 : base[j] + part);
  }
  return out;
}

/**
 * Один трек пресета: ключи с ease по отрезкам или выражение.
 * @param {Layer} layer
 * @param {any} track
 * @param {number} start секунды
 * @param {number} speed растяжение времени (2 — вдвое медленнее)
 * @param {number} fps
 * @returns {Object} что сделано
 */
function mcpApplyTrack(layer, track, start, speed, fps) {
  var matchName = MCP_PRESET_PROPS[track.prop];
  if (!matchName) throw new Error("Свойство «" + track.prop + "» пресетами не поддерживается: " + "opacity, position, scale, rotation, anchor");
  var prop = kbProp(layer, ["ADBE Transform Group", matchName]);

  if (track.expression) {
    prop.expression = String(track.expression).replace(/\$start/g, String(start));
    return {prop: track.prop, expression: true};
  }
  if (prop.dimensionsSeparated) throw new Error("У слоя «" + layer.name + "» позиция разделена по осям — пресет ставит ключи на общую позицию");

  var base = prop.valueAtTime(start, true);
  var times = [];
  var keys = [];
  for (var i = 0; i < track.keys.length; i++) {
    var t = start + track.keys[i][0] / 24 * speed;
    t = Math.round(t * fps) / fps; // ключ на кадр композиции
    times.push(t);
    prop.setValueAtTime(t, mcpPresetValue(track.mode, base, track.keys[i][1]));
  }
  for (var k = 0; k < times.length; k++) keys.push(prop.nearestKeyIndex(times[k]));

  var ease = track.ease || "snap";
  var dims = mcpEaseDims(prop);
  for (var s = 0; s + 1 < keys.length; s++) {
    var a = keys[s];
    var b = keys[s + 1];
    if (ease === "hold") {
      prop.setInterpolationTypeAtKey(a, prop.keyInInterpolationType(a), KeyframeInterpolationType.HOLD);
      continue;
    }
    if (ease === "linear") {
      prop.setInterpolationTypeAtKey(a, prop.keyInInterpolationType(a), KeyframeInterpolationType.LINEAR);
      prop.setInterpolationTypeAtKey(b, KeyframeInterpolationType.LINEAR, prop.keyOutInterpolationType(b));
      continue;
    }
    prop.setInterpolationTypeAtKey(a, prop.keyInInterpolationType(a), KeyframeInterpolationType.BEZIER);
    prop.setInterpolationTypeAtKey(b, KeyframeInterpolationType.BEZIER, prop.keyOutInterpolationType(b));
    if (typeof ease === "string" && !MCP_PRESET_EASE[ease]) {
      // Кривая из kit/library/ease.json: influence и speed по cubic-bezier (kit/style.jsx).
      var curve = kbCurve(ease);
      if (!curve.bezier || curve.keys) throw new Error("Кривая «" + ease + "» с перелётом задаётся ключами пресета, а не ease отрезка");
      var seg = kbCurveSegment(curve.bezier, kbEaseDelta(prop, prop.keyValue(a), prop.keyValue(b)), prop.keyTime(b) - prop.keyTime(a));
      prop.setTemporalEaseAtKey(a, /** @type {any} */ (prop.keyInTemporalEase(a)), kbEaseList(seg.out));
      prop.setTemporalEaseAtKey(b, kbEaseList(seg.into), /** @type {any} */ (prop.keyOutTemporalEase(b)));
      continue;
    }
    var e = typeof ease === "string" ? MCP_PRESET_EASE[ease] : ease;
    // Длина массива зависит от свойства, а типы ждут кортеж фиксированной длины (как в kbKeys).
    prop.setTemporalEaseAtKey(a, /** @type {any} */ (prop.keyInTemporalEase(a)), mcpEaseArray(dims, e.out));
    prop.setTemporalEaseAtKey(b, mcpEaseArray(dims, e.into), /** @type {any} */ (prop.keyOutTemporalEase(b)));
  }
  return {prop: track.prop, keys: times.length, from: Math.round(times[0] * 1000) / 1000, to: Math.round(times[times.length - 1] * 1000) / 1000};
}

MCP_TOOLS.apply_preset = {
  write: true,
  run: function (args) {
    var comp = mcpFindComp(args.comp);
    var layer = mcpFindLayer(comp, args.layer);
    var start = args.start === undefined ? layer.inPoint : Number(args.start);
    var speed = args.speed || 1;

    if (args.ffx) {
      var file = new File(args.ffx);
      if (!file.exists) throw new Error("Нет файла пресета " + args.ffx);
      // applyPreset применяется к выделенным слоям от времени индикатора: выделяем только наш слой.
      for (var i = 1; i <= comp.numLayers; i++) comp.layer(i).selected = false;
      layer.selected = true;
      comp.time = start;
      comp.openInViewer();
      /** @type {AVLayer} */ (layer).applyPreset(file);
      layer.selected = false;
      return {layer: layer.name, ffx: file.fsName, start: start};
    }

    var preset = args.preset;
    var done = [];
    for (var t = 0; t < preset.tracks.length; t++) {
      done.push(mcpApplyTrack(layer, preset.tracks[t], start, speed, comp.frameRate));
    }
    return {layer: layer.name, preset: args.name, start: start, speed: speed, tracks: done};
  }
};

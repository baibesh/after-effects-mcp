// Стили серии и кривые движения: данные в JSON, здесь — загрузка, слияние и перевод в ключи AE.
//
//   kit/styles/<id>.json   — стиль (токены: color, type, shape, motion); _base.json — общая база
//   ae/styles/<id>.json    — стиль проекта: ищется первым, может расширять стили кита
//   kit/library/ease.json  — кривые по имени (cubic-bezier и кривые с перелётом)
//
// Стиль расширяет другие через "extends": "<id>" или список: ["swiss-light", {"motion": "color-blocks"}] —
// объект берёт из стиля только названные группы. Слияние глубокое: объекты сливаются, списки и значения заменяются.
//
// Чистые функции (без File и API AE) тот же код выполняет сервер MCP (src/styles.ts) — один источник правды.

//@include "core.jsx"

/**
 * Разбор JSON своих файлов кита и проекта (в ExtendScript нет JSON.parse; чужой текст сюда не попадает).
 * @param {string} text
 * @returns {any}
 */
function kbJsonParse(text) {
  return eval("(" + text + ")");
}

/**
 * @param {any} v
 * @returns {boolean}
 */
function kbIsPlain(v) {
  return v !== null && typeof v === "object" && !(v instanceof Array);
}

/**
 * Глубокая копия данных JSON.
 * @param {any} v
 * @returns {any}
 */
function kbCopy(v) {
  var out;
  if (v instanceof Array) {
    out = [];
    for (var i = 0; i < v.length; i++) out.push(kbCopy(v[i]));
    return out;
  }
  if (kbIsPlain(v)) {
    out = {};
    for (var k in v) if (v.hasOwnProperty(k)) out[k] = kbCopy(v[k]);
    return out;
  }
  return v;
}

/**
 * Слить over в копию base: объекты сливаются, списки и значения заменяются целиком.
 * @param {any} base
 * @param {any} over
 * @returns {any}
 */
function kbStyleMerge(base, over) {
  if (!kbIsPlain(base) || !kbIsPlain(over)) return kbCopy(over);
  var out = kbCopy(base);
  for (var k in over) {
    if (!over.hasOwnProperty(k)) continue;
    out[k] = kbIsPlain(out[k]) && kbIsPlain(over[k]) ? kbStyleMerge(out[k], over[k]) : kbCopy(over[k]);
  }
  return out;
}

/**
 * Итоговый стиль: цепочка extends развёрнута, поле extends убрано, id и from (порядок источников) проставлены.
 * @param {string} id
 * @param {function(string): any} read данные стиля по id или null
 * @param {string[]=} chain для поиска циклов
 * @returns {any}
 */
function kbStyleResolve(id, read, chain) {
  var seen = chain || [];
  for (var c = 0; c < seen.length; c++) {
    if (seen[c] === id) throw new Error("Стиль «" + id + "»: цикл в extends (" + seen.join(" → ") + " → " + id + ")");
  }
  var raw = read(id);
  if (!raw) throw new Error("Нет стиля «" + id + "»" + (seen.length ? " (extends в «" + seen[seen.length - 1] + "»)" : ""));
  var path = seen.concat([id]);

  var ext = raw["extends"];
  var parts = ext === undefined || ext === null ? [] : (ext instanceof Array ? ext : [ext]);
  var out = {};
  var from = [];
  for (var i = 0; i < parts.length; i++) {
    var part = parts[i];
    if (typeof part === "string") {
      var whole = kbStyleResolve(part, read, path);
      out = kbStyleMerge(out, whole);
      from = from.concat(whole.from);
      continue;
    }
    if (!kbIsPlain(part)) throw new Error("Стиль «" + id + "»: в extends строка или {группа: стиль}");
    for (var group in part) {
      if (!part.hasOwnProperty(group)) continue;
      var src = kbStyleResolve(part[group], read, path);
      if (src[group] === undefined) throw new Error("Стиль «" + id + "»: у «" + part[group] + "» нет группы «" + group + "»");
      var piece = {};
      piece[group] = src[group];
      out = kbStyleMerge(out, piece);
      from.push(part[group] + "." + group);
    }
  }

  var own = kbCopy(raw);
  delete own["extends"];
  out = kbStyleMerge(out, own);
  out.id = id;
  from.push(id);
  out.from = from;
  return out;
}

/**
 * Токен по пути «color.accent», «type.size.h1.9x16».
 * @param {any} style
 * @param {string} path
 * @returns {any}
 */
function kbTok(style, path) {
  var parts = path.split(".");
  var node = style;
  for (var i = 0; i < parts.length; i++) {
    if (!kbIsPlain(node) || node[parts[i]] === undefined) {
      var at = parts.slice(0, i).join(".");
      var keys = [];
      if (kbIsPlain(node)) for (var k in node) if (node.hasOwnProperty(k)) keys.push(k);
      throw new Error("Стиль «" + style.id + "»: нет токена «" + path + "»" + (keys.length ? " (в " + (at || "корне") + ": " + keys.join(", ") + ")" : ""));
    }
    node = node[parts[i]];
  }
  return node;
}

/**
 * Длительность в мс: число или имя из motion.dur, умноженное на motion.tempo.
 * @param {any} style
 * @param {number|string} dur
 * @returns {number}
 */
function kbMs(style, dur) {
  var ms = typeof dur === "number" ? dur : kbTok(style, "motion.dur." + dur);
  return ms * kbTok(style, "motion.tempo");
}

/**
 * Миллисекунды → секунды на целом кадре композиции.
 * @param {number} ms
 * @param {number} fps
 * @returns {number}
 */
function kbMsToTime(ms, fps) {
  return Math.round(ms / 1000 * fps) / fps;
}

/**
 * "#RRGGBB" → [r, g, b] 0…1 для AE.
 * @param {string} hex
 * @returns {[number, number, number]}
 */
function kbHex(hex) {
  var h = String(hex).replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) throw new Error("Цвет «" + hex + "»: нужен #RRGGBB");
  return [parseInt(h.substr(0, 2), 16) / 255, parseInt(h.substr(2, 2), 16) / 255, parseInt(h.substr(4, 2), 16) / 255];
}

/**
 * Influence AE в допустимых границах 0.1…100.
 * @param {number} v
 * @returns {number}
 */
function kbInfl(v) {
  return Math.max(0.1, Math.min(100, v));
}

/**
 * Отрезок между двумя ключами по cubic-bezier → speed и influence ключей AE.
 * Скорость в AE — в единицах свойства в секунду: средняя скорость отрезка × наклон кривой на краю.
 * inflOut = x1·100, speedOut = y1/x1·vAvg; inflIn = (1−x2)·100, speedIn = (1−y2)/(1−x2)·vAvg.
 * @param {number[]} bezier [x1, y1, x2, y2]
 * @param {number[]} delta изменение значения по измерениям ease (у пространственного свойства — одно: длина пути)
 * @param {number} duration секунды
 * @returns {{out: {speed: number, influence: number}[], into: {speed: number, influence: number}[]}}
 */
function kbCurveSegment(bezier, delta, duration) {
  var x1 = bezier[0];
  var y1 = bezier[1];
  var x2 = bezier[2];
  var y2 = bezier[3];
  var slopeOut = x1 > 0 ? y1 / x1 : 0;
  var slopeIn = x2 < 1 ? (1 - y2) / (1 - x2) : 0;
  var out = [];
  var into = [];
  for (var d = 0; d < delta.length; d++) {
    var avg = duration > 0 ? delta[d] / duration : 0;
    out.push({ speed: slopeOut * avg, influence: kbInfl(x1 * 100) });
    into.push({ speed: slopeIn * avg, influence: kbInfl((1 - x2) * 100) });
  }
  return { out: out, into: into };
}

/**
 * Кривая с перелётом → ключи: [доля времени, доля пути] от 0 до 1 включительно.
 * amp масштабирует отклонение от 1 (motion.overshoot стиля): 0 — без перелёта, только segEase.
 * @param {any} curve
 * @param {number} amp
 * @returns {number[][]}
 */
function kbCurvePoints(curve, amp) {
  var pts = [[0, 0]];
  if (curve.keys && amp > 0) {
    for (var i = 0; i < curve.keys.length; i++) pts.push([curve.keys[i][0], 1 + (curve.keys[i][1] - 1) * amp]);
  }
  pts.push([1, 1]);
  return pts;
}

// ---------- файлы (только в AE) ----------

/** @type {any} */
var KB_CURVES = null;

/**
 * @param {File} file
 * @returns {any}
 */
function kbReadJson(file) {
  file.encoding = "UTF-8";
  if (!file.open("r")) throw new Error("Не открыть " + file.fsName);
  var text = file.read();
  file.close();
  try {
    return kbJsonParse(text);
  } catch (e) {
    throw new Error("Не разобрать JSON " + file.fsName + ": " + e.message);
  }
}

/**
 * Данные стиля по id: сначала ae/styles проекта, потом kit/styles.
 * @param {string} id
 * @returns {any}
 */
function kbStyleRead(id) {
  if (!/^[a-z0-9_][a-z0-9_-]*$/.test(id)) throw new Error("Имя стиля «" + id + "»: строчные латинские буквы, цифры, - и _");
  var dirs = [KB_ROOT.fsName + "/styles", KB_ROOT.fsName + "/kit/styles"];
  for (var i = 0; i < dirs.length; i++) {
    var f = new File(dirs[i] + "/" + id + ".json"); // ae-ok: asset — путь собирается из имени стиля
    if (f.exists) return kbReadJson(f);
  }
  return null;
}

/**
 * Итоговый стиль по id (extends развёрнуты).
 * @param {string} id
 * @returns {any}
 */
function kbStyle(id) {
  return kbStyleResolve(id, kbStyleRead);
}

/**
 * Кривая по имени из kit/library/ease.json.
 * @param {string} name
 * @returns {any}
 */
function kbCurve(name) {
  if (!KB_CURVES) KB_CURVES = kbReadJson(new File(KB_ROOT.fsName + "/kit/library/ease.json")).curves; // ae-ok: asset
  var c = KB_CURVES[name];
  if (!c) {
    var names = [];
    for (var k in KB_CURVES) if (KB_CURVES.hasOwnProperty(k)) names.push(k);
    throw new Error("Нет кривой «" + name + "»: " + names.join(", "));
  }
  return c;
}

/**
 * @param {Property} prop
 * @returns {boolean}
 */
function kbIsSpatial(prop) {
  return prop.propertyValueType === PropertyValueType.TwoD_SPATIAL || prop.propertyValueType === PropertyValueType.ThreeD_SPATIAL;
}

/**
 * Изменение значения по измерениям ease: у пространственного свойства одно (длина хорды), иначе по осям.
 * Масштаб 2D-слоя трёхмерный в ease, хотя значение может быть короче — недостающие оси без изменения.
 * @param {Property} prop
 * @param {any} a
 * @param {any} b
 * @returns {number[]}
 */
function kbEaseDelta(prop, a, b) {
  if (!(a instanceof Array)) return [b - a];
  if (kbIsSpatial(prop)) {
    var sum = 0;
    for (var i = 0; i < a.length; i++) sum += (b[i] - a[i]) * (b[i] - a[i]);
    return [Math.sqrt(sum)];
  }
  var dims = prop.propertyValueType === PropertyValueType.ThreeD ? 3 : 2;
  var out = [];
  for (var d = 0; d < dims; d++) out.push(d < a.length ? b[d] - a[d] : 0);
  return out;
}

/**
 * @param {{speed: number, influence: number}[]} list
 * @returns {any}
 */
function kbEaseList(list) {
  var out = [];
  for (var i = 0; i < list.length; i++) out.push(new KeyframeEase(list[i].speed, list[i].influence));
  return out;
}

/**
 * @param {any} a
 * @param {any} b
 * @param {number} p доля пути (может быть больше 1 — перелёт)
 * @returns {any}
 */
function kbLerp(a, b, p) {
  if (!(a instanceof Array)) return a + (b - a) * p;
  var out = [];
  for (var i = 0; i < a.length; i++) out.push(a[i] + (b[i] - a[i]) * p);
  return out;
}

/**
 * Движение from → to по кривой: ключи на кадрах, influence и speed по cubic-bezier,
 * у кривой с перелётом — промежуточные ключи (segEase к первому, settle между остальными).
 * Ease ставится только на свои отрезки: вход в первый ключ и выход из последнего не трогаются.
 * @param {Property} prop
 * @param {number} start секунды
 * @param {number} duration секунды
 * @param {any} from
 * @param {any} to
 * @param {string} curveName
 * @param {number=} amp доля перелёта (motion.overshoot стиля), по умолчанию 1
 * @returns {number} число ключей
 */
function kbKeysCurve(prop, start, duration, from, to, curveName, amp) {
  var curve = kbCurve(curveName);
  var layer = /** @type {Layer} */ (/** @type {any} */ (prop.propertyGroup(prop.propertyDepth)));
  var fps = 1 / layer.containingComp.frameDuration;
  var pts = kbCurvePoints(curve, amp === undefined ? 1 : amp);
  var times = [];
  var values = [];
  for (var i = 0; i < pts.length; i++) {
    times.push(Math.round((start + duration * pts[i][0]) * fps) / fps);
    values.push(kbLerp(from, to, pts[i][1]));
    prop.setValueAtTime(times[i], values[i]);
  }
  for (var s = 0; s + 1 < times.length; s++) {
    var a = prop.nearestKeyIndex(times[s]);
    var b = prop.nearestKeyIndex(times[s + 1]);
    var name = curve.keys ? (s === 0 ? curve.segEase : curve.settle) : curveName;
    var seg = kbCurve(name);
    if (seg.linear) {
      prop.setInterpolationTypeAtKey(a, prop.keyInInterpolationType(a), KeyframeInterpolationType.LINEAR);
      prop.setInterpolationTypeAtKey(b, KeyframeInterpolationType.LINEAR, prop.keyOutInterpolationType(b));
      continue;
    }
    var ease = kbCurveSegment(seg.bezier, kbEaseDelta(prop, values[s], values[s + 1]), times[s + 1] - times[s]);
    prop.setInterpolationTypeAtKey(a, prop.keyInInterpolationType(a), KeyframeInterpolationType.BEZIER);
    prop.setInterpolationTypeAtKey(b, KeyframeInterpolationType.BEZIER, prop.keyOutInterpolationType(b));
    prop.setTemporalEaseAtKey(a, /** @type {any} */ (prop.keyInTemporalEase(a)), kbEaseList(ease.out));
    prop.setTemporalEaseAtKey(b, kbEaseList(ease.into), /** @type {any} */ (prop.keyOutTemporalEase(b)));
  }
  return times.length;
}

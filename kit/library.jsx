// Библиотека примитивов: kit/library/{motion,text,lines}.json — данные, здесь — движок.
// Каждый примитив берёт оформление из стиля (kit/style.jsx): длительности, кривые, толщины, цвета, кегли.
//
//   var st = kbStyle("editorial-dark");
//   kbLib(st, "text.letters", word, {start: 0.5});
//   kbLib(st, "draw.underline", word, {start: 1.2});
//   kbLib(st, "draw.arrow", null, {comp: comp, from: [200, 900], to: box, start: 2});
//
// opts: start (с, по умолчанию начало слоя), dur (мс — вместо dur примитива), params (поверх params примитива),
// index (фаза idle), others (слои для target "others"), comp/from/to (для линий по точкам).
// Ответ: {id, start, end, layers} — end по последнему ключу, чтобы ставить следующее.

//@include "core.jsx"
//@include "text.jsx"
//@include "style.jsx"

/** @type {{[folder: string]: any}} */
var KB_LIB = {};
var KB_LIB_FOLDERS = ["motion", "text", "lines"];

/**
 * Примитив по id: ищется во всех файлах библиотеки.
 * @param {string} id
 * @returns {any}
 */
function kbLibItem(id) {
  var names = [];
  for (var i = 0; i < KB_LIB_FOLDERS.length; i++) {
    var folder = KB_LIB_FOLDERS[i];
    if (!KB_LIB[folder]) KB_LIB[folder] = kbReadJson(new File(KB_ROOT.fsName + "/kit/library/" + folder + ".json")).items; // ae-ok: asset
    if (KB_LIB[folder][id]) return KB_LIB[folder][id];
    for (var k in KB_LIB[folder]) if (KB_LIB[folder].hasOwnProperty(k)) names.push(k);
  }
  throw new Error("Нет примитива «" + id + "» в kit/library: " + names.join(", "));
}

/**
 * Масштаб px библиотеки (база стиля, 1080) к композиции: по короткой стороне.
 * @param {any} style
 * @param {CompItem} comp
 * @returns {number}
 */
function kbLibUnit(style, comp) {
  return Math.min(comp.width, comp.height) / kbTok(style, "base");
}

/**
 * Кривая по ссылке: "@enter" → motion.ease.enter стиля, иначе имя из ease.json.
 * @param {any} style
 * @param {string|undefined} ref
 * @param {string} kind
 * @returns {string}
 */
function kbLibCurve(style, ref, kind) {
  var r = ref || ("@" + (kind === "idle" || kind === "counter" ? "enter" : kind));
  if (r === "@undraw") r = "@exit";
  return r.charAt(0) === "@" ? kbTok(style, "motion.ease." + r.substr(1)) : r;
}

/**
 * Параметры: params примитива, поверх — opts.params.
 * @param {any} item
 * @param {any} opts
 * @returns {any}
 */
function kbLibParams(item, opts) {
  return kbStyleMerge(item.params || {}, (opts && opts.params) || {});
}

/**
 * "$имя" → параметр; рекурсивно по спискам и объектам.
 * @param {any} v
 * @param {any} params
 * @returns {any}
 */
function kbLibSubst(v, params) {
  if (typeof v === "string" && v.charAt(0) === "$") {
    var name = v.substr(1);
    if (params[name] === undefined) throw new Error("Нет параметра «" + name + "»");
    return params[name];
  }
  if (v instanceof Array) {
    var out = [];
    for (var i = 0; i < v.length; i++) out.push(kbLibSubst(v[i], params));
    return out;
  }
  if (kbIsPlain(v)) {
    var o = {};
    for (var k in v) if (v.hasOwnProperty(k)) o[k] = kbLibSubst(v[k], params);
    return o;
  }
  return v;
}

/**
 * Длительность примитива в секундах на кадре: opts.dur (мс) → dur примитива (мс | имя | {path}) × tempo.
 * {path: [база, мс на px, предел]} — от длины пути первого offset позиции.
 * @param {any} style
 * @param {any} item
 * @param {any} opts
 * @param {number} fps
 * @param {number=} pathPx
 * @returns {number}
 */
function kbLibDur(style, item, opts, fps, pathPx) {
  var d = opts && opts.dur !== undefined ? opts.dur : item.dur;
  if (kbIsPlain(d) && d.path) d = Math.min(d.path[2], d.path[0] + d.path[1] * (pathPx || 0));
  if (d === undefined) throw new Error("У примитива нет dur");
  return Math.max(1 / fps, kbMsToTime(kbMs(style, d), fps));
}

// ---------- значения ----------

/** Короткие имена свойств слоя → путь matchName. */
var KB_LIB_PROPS = {
  opacity: ["ADBE Transform Group", "ADBE Opacity"],
  position: ["ADBE Transform Group", "ADBE Position"],
  scale: ["ADBE Transform Group", "ADBE Scale"],
  rotation: ["ADBE Transform Group", "ADBE Rotate Z"],
  anchor: ["ADBE Transform Group", "ADBE Anchor Point"]
};

/**
 * Свойство трека; blur — эффект Gaussian Blur (добавляется один раз, имя kb-blur).
 * @param {Layer} layer
 * @param {string} name
 * @returns {Property}
 */
function kbLibProp(layer, name) {
  if (name === "blur") {
    var parade = kbGroup(layer, ["ADBE Effect Parade"]);
    var fx = parade.property("kb-blur");
    if (!fx) {
      fx = kbAdd(parade, "ADBE Gaussian Blur 2");
      fx.name = "kb-blur";
      kbProp(fx, ["ADBE Gaussian Blur 2-0003"]).setValue(1); // повторять края: без тёмной каймы
    }
    return kbProp(fx, ["ADBE Gaussian Blur 2-0001"]);
  }
  var path = KB_LIB_PROPS[name];
  if (!path) throw new Error("Свойство «" + name + "» библиотекой не поддерживается: opacity, position, scale, rotation, anchor, blur");
  var prop = kbProp(layer, path);
  if (name === "position" && prop.dimensionsSeparated) throw new Error("У слоя «" + layer.name + "» позиция разделена по осям — примитив ставит ключи на общую позицию");
  return prop;
}

/**
 * Значение трека: "base" | число/список | {offset} | {factor}. Смещение позиции — px при базе стиля (× unit).
 * @param {any} spec
 * @param {any} base
 * @param {string} prop
 * @param {number} unit
 * @returns {any}
 */
function kbLibValue(spec, base, prop, unit) {
  if (spec === "base") return base;
  var px = prop === "position" || prop === "anchor" ? unit : 1;
  var i;
  var out;
  if (kbIsPlain(spec) && spec.offset !== undefined) {
    if (!(base instanceof Array)) return base + spec.offset * px;
    out = [];
    for (i = 0; i < base.length; i++) {
      var o = spec.offset instanceof Array ? (i < spec.offset.length ? spec.offset[i] : 0) : spec.offset;
      out.push(base[i] + o * px);
    }
    return out;
  }
  if (kbIsPlain(spec) && spec.factor !== undefined) {
    if (!(base instanceof Array)) return base * spec.factor / 100;
    out = [];
    for (i = 0; i < base.length; i++) out.push(base[i] * (spec.factor instanceof Array ? spec.factor[i] : spec.factor) / 100);
    return out;
  }
  if (base instanceof Array && !(spec instanceof Array)) {
    out = [];
    for (i = 0; i < base.length; i++) out.push(spec); // scale: 0 → [0, 0, 0]
    return out;
  }
  return spec;
}

/**
 * Длина пути смещения позиции в px базы (для dur {path}).
 * @param {any} item
 * @param {any} params
 * @returns {number}
 */
function kbLibPathPx(item, params) {
  for (var i = 0; i < item.tracks.length; i++) {
    var t = kbLibSubst(item.tracks[i], params);
    if (t.prop !== "position") continue;
    var spec = kbIsPlain(t.from) && t.from.offset ? t.from : t.to;
    if (kbIsPlain(spec) && spec.offset instanceof Array) return Math.sqrt(spec.offset[0] * spec.offset[0] + spec.offset[1] * spec.offset[1]);
  }
  return 0;
}

// ---------- движение слоя ----------

/**
 * @param {any} style
 * @param {any} item
 * @param {Layer} layer
 * @param {any} opts
 * @returns {any}
 */
function kbLibMotion(style, item, layer, opts) {
  var comp = layer.containingComp;
  var fps = 1 / comp.frameDuration;
  var params = kbLibParams(item, opts);
  var unit = kbLibUnit(style, comp);
  var start = opts.start === undefined ? layer.inPoint : opts.start;
  var amp = kbTok(style, "motion.overshoot");
  var targets = item.target === "others" ? (opts.others || []) : [layer];
  if (item.target === "others" && !targets.length) throw new Error(item.id + ": нужен список others — какие слои приглушать");

  if (item.kind === "idle") {
    for (var n = 0; n < targets.length; n++) {
      for (var e = 0; e < item.tracks.length; e++) {
        var tr = item.tracks[e];
        var expr = String(tr.expression)
          .replace(/\$start/g, String(start))
          .replace(/\$phase/g, String(((opts.index || 0) * 0.9) % 6.283))
          .replace(/\$unit/g, String(unit));
        for (var pk in params) if (params.hasOwnProperty(pk)) expr = expr.replace(new RegExp("\\$" + pk, "g"), String(params[pk]));
        kbLibProp(targets[n], tr.prop).expression = expr;
      }
    }
    return { id: item.id, start: start, end: start, layers: kbLibNames(targets) };
  }

  var dur = kbLibDur(style, item, opts, fps, kbLibPathPx(item, params));
  for (var l = 0; l < targets.length; l++) {
    for (var t = 0; t < item.tracks.length; t++) {
      var track = kbLibSubst(item.tracks[t], params);
      var prop = kbLibProp(targets[l], track.prop);
      var base = prop.numKeys ? prop.valueAtTime(start, true) : prop.value;
      var curve = kbLibCurve(style, track.curve, item.kind);
      var keys = track.keys;
      if (!keys) {
        var span = track.span || [0, 1];
        keys = [[span[0], track.from], [span[1], track.to, curve]];
      }
      for (var k = 1; k < keys.length; k++) {
        var t0 = start + dur * keys[k - 1][0];
        var t1 = start + dur * keys[k][0];
        kbKeysCurve(prop, t0, Math.max(t1 - t0, 1 / fps), kbLibValue(keys[k - 1][1], base, track.prop, unit),
          kbLibValue(keys[k][1], base, track.prop, unit), keys[k][2] ? kbLibCurve(style, keys[k][2], item.kind) : curve, amp);
      }
    }
  }
  return { id: item.id, start: start, end: start + dur, layers: kbLibNames(targets) };
}

/**
 * @param {Layer[]} layers
 * @returns {string[]}
 */
function kbLibNames(layers) {
  var out = [];
  for (var i = 0; i < layers.length; i++) out.push(layers[i].name);
  return out;
}

// ---------- текст ----------

/** Единицы Expression Selector: Based On. */
var KB_LIB_BASED = { chars: 2, characters: 1, words: 3, lines: 4 };

/**
 * Кривая для выражения: точки [t, v, x1, y1, x2, y2] (первая — [0, 0]).
 * @param {string} name
 * @param {number} amp
 * @returns {string}
 */
function kbLibCurveExpr(name, amp) {
  var curve = kbCurve(name);
  var pts = kbCurvePoints(curve, amp);
  var out = ["[0,0]"];
  for (var i = 1; i < pts.length; i++) {
    var seg = curve.keys ? kbCurve(i === 1 ? curve.segEase : curve.settle) : curve;
    var b = seg.bezier;
    out.push("[" + pts[i][0] + "," + pts[i][1].toFixed(4) + "," + b[0] + "," + b[1] + "," + b[2] + "," + b[3] + "]");
  }
  return "[" + out.join(",") + "]";
}

/** Функции кривой в выражении: bz — cubic-bezier (x1, y1, x2, y2) бисекцией, cv — кусочная кривая по точкам P. */
var KB_LIB_EXPR_CURVE =
  "function bz(w,x1,y1,x2,y2){var lo=0,hi=1,t=w;for(var k=0;k<22;k++){t=(lo+hi)/2;var m=1-t;" +
  "var x=3*m*m*t*x1+3*m*t*t*x2+t*t*t;if(x<w)lo=t;else hi=t;}var n=1-t;return 3*n*n*t*y1+3*n*t*t*y2+t*t*t;}\n" +
  "function cv(u){if(u<=0)return 0;if(u>=1)return 1;for(var j=1;j<P.length;j++){if(u<=P[j][0]){var a=P[j-1],b=P[j];" +
  "return a[1]+(b[1]-a[1])*bz((u-a[0])/(b[0]-a[0]),b[2],b[3],b[4],b[5]);}}return 1;}\n";

/**
 * Число единиц текста (для длительности каскада): строки, слова или буквы без пробелов.
 * @param {string} text
 * @param {string} basedOn
 * @returns {number}
 */
function kbLibUnits(text, basedOn) {
  var s = String(text);
  if (basedOn === "lines") return s.split(/\r\n|\r|\n/).length;
  if (basedOn === "words") return s.replace(/^\s+|\s+$/g, "").split(/\s+/).length;
  if (basedOn === "chars") return s.replace(/\s/g, "").length;
  return s.length;
}

/**
 * Значение аниматора: "1.1em" → доля кегля, число px → × unit (позиция).
 * @param {any} v
 * @param {number} em
 * @param {number} unit
 * @returns {number}
 */
function kbLibLen(v, em, unit) {
  // Не parseFloat: ExtendScript читает «1.1em» как незаконченную экспоненту «1.1e…» и отдаёт NaN (AE 26.5).
  if (typeof v === "string" && /em$/.test(v)) return Number(v.replace(/em$/, "")) * em;
  return Number(v) * unit;
}

/**
 * Маски по строкам: буквы, выезжающие из-под линии, обрезаются своей строкой.
 * Строки — по переводам строк текста, высота строки — leading документа (или 1,2 кегля при авто).
 * @param {TextLayer} layer
 * @param {any} doc
 * @param {number} lines
 * @param {number} t
 */
function kbLibLineMasks(layer, doc, lines, t) {
  var rect = layer.sourceRectAtTime(t, false);
  var size = doc.fontSize;
  var lead = doc.autoLeading ? size * 1.2 : doc.leading;
  var masks = kbGroup(layer, ["ADBE Mask Parade"]);
  var padX = size * 0.3;
  for (var i = 0; i < lines; i++) {
    // Строка i: базовая линия на i·leading от первой (y = 0 у точечного текста). Полоса — от верха букв до выносных;
    // соседние полосы делят межстрочье пополам, чтобы буква не выглядывала в чужой строке.
    var base = i * lead;
    var top = i === 0 ? Math.min(rect.top, -size) - size * 0.1 : base - lead + size * 0.3 + (lead - size * 1.3) / 2;
    var bottom = i === lines - 1 ? Math.max(rect.top + rect.height, base + size * 0.3) + size * 0.06 : base + size * 0.3 + (lead - size * 1.3) / 2;
    var shape = new Shape();
    shape.vertices = [[rect.left - padX, top], [rect.left + rect.width + padX, top], [rect.left + rect.width + padX, bottom], [rect.left - padX, bottom]];
    shape.closed = true;
    var mask = masks.addProperty("ADBE Mask Atom"); // ae-ok: matchname
    mask.name = "kb-line-" + (i + 1);
    kbProp(mask, ["ADBE Mask Shape"]).setValue(shape); // ae-ok: matchname
  }
}

/**
 * @param {any} style
 * @param {any} item
 * @param {TextLayer} layer
 * @param {any} opts
 * @returns {any}
 */
function kbLibText(style, item, layer, opts) {
  if (!(layer instanceof TextLayer)) throw new Error(item.id + ": слой «" + /** @type {Layer} */ (/** @type {any} */ (layer)).name + "» не текстовый");
  var comp = layer.containingComp;
  var fps = 1 / comp.frameDuration;
  var params = kbLibParams(item, opts);
  var unit = kbLibUnit(style, comp);
  var start = opts.start === undefined ? layer.inPoint : opts.start;
  var dur = kbLibDur(style, item, opts, fps);
  var source = kbProp(layer, ["ADBE Text Properties", "ADBE Text Document"]);
  var doc = source.valueAtTime(start, false);
  var em = doc.fontSize;
  var amp = kbTok(style, "motion.overshoot");
  var curve = kbLibCurve(style, item.curve, item.kind === "emphasis" ? "enter" : item.kind);
  var P = "var P=" + kbLibCurveExpr(curve, amp) + ";\n";

  if (item.kind === "counter") {
    var c = params;
    source.expression = KB_LIB_EXPR_CURVE + P +
      "var u=(time-" + start + ")/" + dur + ";var v=" + c.from + "+(" + (c.to - c.from) + ")*cv(u);" +
      "v.toFixed(" + (c.decimals || 0) + ")+" + kbLibQuote(c.suffix || "");
    return { id: item.id, start: start, end: start + dur, layers: [layer.name] };
  }

  var basedOn = item.basedOn || "chars";
  var n = kbLibUnits(doc.text, basedOn);
  var gap = item.stagger ? kbMs(style, kbTok(style, "motion.stagger." + item.stagger)) / 1000 : 0;
  var maxTotal = kbMs(style, kbTok(style, "motion.stagger.maxTotal")) / 1000;
  if (n > 1 && gap * (n - 1) > maxTotal) gap = maxTotal / (n - 1);

  var animator = kbAdd(kbGroup(layer, ["ADBE Text Properties", "ADBE Text Animators"]), "ADBE Text Animator");
  animator.name = item.id;
  var props = kbGroup(animator, ["ADBE Text Animator Properties"]);
  var anim = kbLibSubst(item.animate, params);
  if (anim.position) {
    /** @type {Property} */ (props.addProperty("ADBE Text Position 3D")).setValue([kbLibLen(anim.position[0], em, unit), kbLibLen(anim.position[1], em, unit), 0]);
  }
  if (anim.opacity !== undefined) /** @type {Property} */ (props.addProperty("ADBE Text Opacity")).setValue(anim.opacity);
  if (anim.scale !== undefined) /** @type {Property} */ (props.addProperty("ADBE Text Scale 3D")).setValue([anim.scale, anim.scale, 100]);
  if (anim.blur !== undefined) /** @type {Property} */ (props.addProperty("ADBE Text Blur")).setValue([anim.blur * unit, anim.blur * unit]);
  if (anim.fill !== undefined) {
    var rgb = kbHex(kbTok(style, "color." + anim.fill));
    /** @type {Property} */ (props.addProperty("ADBE Text Fill Color")).setValue([rgb[0], rgb[1], rgb[2], 1]);
  }

  var selector = kbAdd(kbGroup(animator, ["ADBE Text Selectors"]), "ADBE Text Expressible Selector"); // ae-ok: matchname
  kbProp(selector, ["ADBE Text Range Type2"]).setValue(KB_LIB_BASED[basedOn]); // ae-ok: matchname
  var timing = "var u=(time-" + start + "-(textIndex-1)*" + gap.toFixed(4) + ")/" + dur.toFixed(4) + ";\n";
  var amount;
  if (item.kind === "emphasis") {
    var w = kbLibWordIndex(doc.text, params.word);
    timing = "var u=(time-" + start + ")/" + dur.toFixed(4) + ";\n";
    amount = "textIndex==" + w + "?100*cv(u):0";
  } else amount = item.kind === "exit" ? "100*cv(u)" : "100*(1-cv(u))";
  kbProp(selector, ["ADBE Text Expressible Amount"]).expression = KB_LIB_EXPR_CURVE + P + timing + amount; // ae-ok: matchname

  var units = item.kind === "emphasis" ? 1 : n;
  var end = start + dur + gap * (units - 1);
  if (item.mask) {
    var lines = kbLibUnits(doc.text, "lines");
    // Маски — по раскладке в покое: до входа (exit) или после него (enter).
    if (kbLibMaskless(layer)) kbLibLineMasks(layer, doc, lines, item.kind === "exit" ? Math.max(0, start - comp.frameDuration) : end + comp.frameDuration);
    if (lines > 1) {
      // Полосы строк соседствуют: буква строки k вдали от своей линии лежит в полосе строки k+1 — там её прячет прозрачность.
      var hide = kbAdd(kbGroup(layer, ["ADBE Text Properties", "ADBE Text Animators"]), "ADBE Text Animator");
      hide.name = item.id + " · hide";
      /** @type {Property} */ (kbGroup(hide, ["ADBE Text Animator Properties"]).addProperty("ADBE Text Opacity")).setValue(0);
      var hs = kbAdd(kbGroup(hide, ["ADBE Text Selectors"]), "ADBE Text Expressible Selector"); // ae-ok: matchname
      kbProp(hs, ["ADBE Text Range Type2"]).setValue(KB_LIB_BASED[basedOn]); // ae-ok: matchname
      // r — доля смещения от покоя: буква видна, пока ближе ~0,3 em к своей строке, дальше растворяется (смещение 1,15 em).
      kbProp(hs, ["ADBE Text Expressible Amount"]).expression = KB_LIB_EXPR_CURVE + P + timing + // ae-ok: matchname
        "var r=" + (item.kind === "exit" ? "cv(u)" : "1-cv(u)") + ";Math.max(0,Math.min(1,(r-0.2)/0.3))*100";
    }
  }
  layer.motionBlur = true;
  return { id: item.id, start: start, end: end, layers: [layer.name], units: n, stagger: Math.round(gap * 1000) };
}

/**
 * Маски строк ставятся один раз: второй примитив с mask на том же слое их не дублирует.
 * @param {Layer} layer
 * @returns {boolean}
 */
function kbLibMaskless(layer) {
  var masks = kbGroup(layer, ["ADBE Mask Parade"]);
  for (var i = 1; i <= masks.numProperties; i++) if (/^kb-line-/.test(masks.property(i).name)) return false;
  return true;
}

/**
 * Номер слова с 1: число как есть, строка — первое совпадение без учёта регистра и знаков.
 * @param {string} text
 * @param {any} word
 * @returns {number}
 */
function kbLibWordIndex(text, word) {
  if (typeof word === "number") return word;
  var words = String(text).replace(/^\s+|\s+$/g, "").split(/\s+/);
  var want = String(word).toLowerCase();
  for (var i = 0; i < words.length; i++) if (words[i].toLowerCase().replace(/[^\wа-яёәғқңөұүһі'-]/g, "") === want) return i + 1;
  throw new Error("Слова «" + word + "» нет в тексте «" + text + "»");
}

/**
 * Строка для выражения.
 * @param {string} s
 * @returns {string}
 */
function kbLibQuote(s) {
  return '"' + String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
}

// ---------- линии ----------

/**
 * Рамка слоя в координатах композиции (без родителя и поворота) и базовая линия последней строки текста.
 * @param {Layer} layer
 * @param {number} t
 * @returns {{left: number, top: number, right: number, bottom: number, baseline: number, size: number}}
 */
function kbLibBox(layer, t) {
  var av = /** @type {AVLayer} */ (/** @type {any} */ (layer));
  var rect = av.sourceRectAtTime(t, false);
  var p = kbProp(layer, ["ADBE Transform Group", "ADBE Position"]).valueAtTime(t, false);
  var a = kbProp(layer, ["ADBE Transform Group", "ADBE Anchor Point"]).valueAtTime(t, false);
  var s = kbProp(layer, ["ADBE Transform Group", "ADBE Scale"]).valueAtTime(t, false);
  var sx = s[0] / 100;
  var sy = s[1] / 100;
  var box = {
    left: p[0] + (rect.left - a[0]) * sx, top: p[1] + (rect.top - a[1]) * sy,
    right: p[0] + (rect.left + rect.width - a[0]) * sx, bottom: p[1] + (rect.top + rect.height - a[1]) * sy,
    baseline: p[1] + (rect.top + rect.height - a[1]) * sy, size: rect.height * sy
  };
  if (layer instanceof TextLayer) {
    var doc = kbProp(layer, ["ADBE Text Properties", "ADBE Text Document"]).valueAtTime(t, false);
    var lines = kbLibUnits(doc.text, "lines");
    var lead = doc.autoLeading ? doc.fontSize * 1.2 : doc.leading;
    box.baseline = p[1] + ((lines - 1) * lead - a[1]) * sy;
    box.size = doc.fontSize * sy;
  }
  return box;
}

/**
 * Точка: [x, y] или слой (центр рамки).
 * @param {any} v
 * @param {number} t
 * @returns {number[]}
 */
function kbLibPoint(v, t) {
  if (v instanceof Array) return v;
  var b = kbLibBox(v, t);
  return [(b.left + b.right) / 2, (b.top + b.bottom) / 2];
}

/**
 * Точка на краю рамки слоя по направлению к другой точке, с зазором gap — стрелка не залезает на объект.
 * @param {any} v
 * @param {number[]} toward
 * @param {number} gap
 * @param {number} t
 * @returns {number[]}
 */
function kbLibEdge(v, toward, gap, t) {
  if (v instanceof Array) return v;
  var b = kbLibBox(v, t);
  var c = [(b.left + b.right) / 2, (b.top + b.bottom) / 2];
  var dx = toward[0] - c[0];
  var dy = toward[1] - c[1];
  var hw = (b.right - b.left) / 2 + gap;
  var hh = (b.bottom - b.top) / 2 + gap;
  var k = Math.min(dx ? hw / Math.abs(dx) : 1e9, dy ? hh / Math.abs(dy) : 1e9);
  return k >= 1 ? c : [c[0] + dx * k, c[1] + dy * k];
}

/**
 * Пустой shape-слой в координатах композиции (позиция и якорь в 0).
 * @param {CompItem} comp
 * @param {string} name
 * @returns {ShapeLayer}
 */
function kbLibShapeLayer(comp, name) {
  var layer = comp.layers.addShape();
  layer.name = name;
  kbProp(layer, ["ADBE Transform Group", "ADBE Anchor Point"]).setValue([0, 0]);
  kbProp(layer, ["ADBE Transform Group", "ADBE Position"]).setValue([0, 0]);
  return layer;
}

/**
 * Группа с путём (или эллипсом/прямоугольником), обводкой или заливкой и trim.
 * Новая группа ложится под прежние (порядок AE: первая группа сверху).
 * @param {ShapeLayer} layer
 * @param {{name: string, vertices?: number[][], inT?: number[][], outT?: number[][], closed?: boolean, ellipse?: number[], rect?: number[], center?: number[], radius?: number, stroke?: number[], width?: number, cap?: string, fill?: number[], opacity?: number, trim?: boolean}} o
 * @returns {{group: PropertyGroup, trim: Property}}
 */
function kbLibShape(layer, o) {
  var group = kbAdd(kbGroup(layer, ["ADBE Root Vectors Group"]), "ADBE Vector Group");
  group.name = o.name;
  var contents = kbGroup(group, ["ADBE Vectors Group"]);
  if (o.ellipse) {
    var el = kbAdd(contents, "ADBE Vector Shape - Ellipse");
    kbProp(el, ["ADBE Vector Ellipse Size"]).setValue(o.ellipse);
    kbProp(el, ["ADBE Vector Ellipse Position"]).setValue(o.center || [0, 0]);
  } else if (o.rect) {
    var rc = kbAdd(contents, "ADBE Vector Shape - Rect");
    kbProp(rc, ["ADBE Vector Rect Size"]).setValue(o.rect);
    kbProp(rc, ["ADBE Vector Rect Position"]).setValue(o.center || [0, 0]);
    kbProp(rc, ["ADBE Vector Rect Roundness"]).setValue(o.radius || 0);
  } else {
    var sh = new Shape();
    // Кортежи [x, y] типов AE против number[][] данных — одно приведение.
    sh.vertices = /** @type {any} */ (o.vertices || []);
    if (o.inT) sh.inTangents = /** @type {any} */ (o.inT);
    if (o.outT) sh.outTangents = /** @type {any} */ (o.outT);
    sh.closed = !!o.closed;
    kbProp(kbAdd(contents, "ADBE Vector Shape - Group"), ["ADBE Vector Shape"]).setValue(sh);
  }
  if (o.fill) {
    var fill = kbAdd(contents, "ADBE Vector Graphic - Fill");
    kbProp(fill, ["ADBE Vector Fill Color"]).setValue([o.fill[0], o.fill[1], o.fill[2], 1]);
  }
  if (o.stroke) {
    var stroke = kbAdd(contents, "ADBE Vector Graphic - Stroke");
    kbProp(stroke, ["ADBE Vector Stroke Color"]).setValue([o.stroke[0], o.stroke[1], o.stroke[2], 1]);
    kbProp(stroke, ["ADBE Vector Stroke Width"]).setValue(o.width || 4);
    kbProp(stroke, ["ADBE Vector Stroke Line Cap"]).setValue(o.cap === "butt" ? 1 : 2);
    kbProp(stroke, ["ADBE Vector Stroke Line Join"]).setValue(2);
  }
  if (o.opacity !== undefined) kbProp(group, ["ADBE Vector Transform Group", "ADBE Vector Group Opacity"]).setValue(o.opacity);
  var trim = null;
  if (o.trim) trim = kbProp(kbAdd(contents, "ADBE Vector Filter - Trim"), ["ADBE Vector Trim End"]);
  return { group: group, trim: /** @type {any} */ (trim) };
}

/**
 * Выскок группы shape (масштаб 0 → 100 по @emphasis) вокруг точки.
 * @param {any} style
 * @param {PropertyGroup} group
 * @param {number[]} at
 * @param {number} start
 * @param {number} dur
 */
function kbLibGroupPop(style, group, at, start, dur) {
  var tr = kbGroup(group, ["ADBE Vector Transform Group"]);
  kbProp(tr, ["ADBE Vector Anchor"]).setValue(at);
  kbProp(tr, ["ADBE Vector Position"]).setValue(at);
  kbKeysCurve(kbProp(tr, ["ADBE Vector Scale"]), start, dur, [0, 0], [100, 100], kbTok(style, "motion.ease.emphasis"), kbTok(style, "motion.overshoot"));
}

/**
 * Изогнутый путь p0 → p1: контрольная точка на перпендикуляре к середине, bend — доля длины.
 * @param {number[]} p0
 * @param {number[]} p1
 * @param {number} bend
 * @returns {{vertices: number[][], inT: number[][], outT: number[][], q: number[]}}
 */
function kbLibBend(p0, p1, bend) {
  var dx = p1[0] - p0[0];
  var dy = p1[1] - p0[1];
  var q = [(p0[0] + p1[0]) / 2 - dy * bend, (p0[1] + p1[1]) / 2 + dx * bend];
  return {
    vertices: [p0, p1],
    outT: [[(q[0] - p0[0]) * 2 / 3, (q[1] - p0[1]) * 2 / 3], [0, 0]],
    inT: [[0, 0], [(q[0] - p1[0]) * 2 / 3, (q[1] - p1[1]) * 2 / 3]],
    q: q
  };
}

/**
 * @param {any} style
 * @param {any} item
 * @param {Layer|null} target
 * @param {any} opts
 * @returns {any}
 */
function kbLibLine(style, item, target, opts) {
  var comp = target ? target.containingComp : opts.comp;
  if (!comp) throw new Error(item.id + ": нужен слой-цель или opts.comp");
  var fps = 1 / comp.frameDuration;
  var p = kbLibParams(item, opts);
  var unit = kbLibUnit(style, comp);
  var start = opts.start === undefined ? (target ? target.inPoint : 0) : opts.start;
  var dur = kbLibDur(style, item, opts, fps);
  var curve = kbLibCurve(style, item.curve, "draw");
  var color = p.color ? kbHex(kbTok(style, "color." + p.color)) : null;
  var width = p.stroke ? kbTok(style, "shape.stroke." + p.stroke) * unit : 0;
  if (!p.cap) p.cap = kbTok(style, "shape.cap");
  var id = item.id;
  var made = [];
  var end = start + dur;
  var s;

  if (id === "undraw") {
    if (!target) throw new Error("undraw: нужен слой линии");
    var trims = kbLibTrims(kbGroup(target, ["ADBE Root Vectors Group"]), []);
    if (!trims.length) throw new Error("undraw: у «" + target.name + "» нет trim — это не линия библиотеки");
    var d = Math.max(1 / fps, kbMsToTime(kbMs(style, opts.dur !== undefined ? opts.dur : kbTok(style, "motion.dur.draw")) * 0.65, fps));
    for (var u = 0; u < trims.length; u++) kbKeysCurve(trims[u], start, d, trims[u].valueAtTime(start, false), 0, curve);
    // Наконечник и точка без trim: сжимаются в начале стирания — наконечник уходит первым, как пришёл последним.
    var root = kbGroup(target, ["ADBE Root Vectors Group"]);
    for (var g = 1; g <= root.numProperties; g++) {
      var grp = /** @type {PropertyGroup} */ (root.property(g));
      if (!kbLibTrims(grp, []).length) {
        var gs = kbProp(grp, ["ADBE Vector Transform Group", "ADBE Vector Scale"]);
        kbKeysCurve(gs, start, Math.max(1 / fps, kbMsToTime(d * 1000 * 0.35, fps)), gs.valueAtTime(start, false), [0, 0], curve);
      }
    }
    return { id: id, start: start, end: start + d, layers: [target.name] };
  }

  if (item.target === "layer") {
    if (!target) throw new Error(id + ": нужен слой-цель");
    var b = kbLibBox(target, start + dur);
    var layer = kbLibShapeLayer(comp, target.name + " · " + id.replace("draw.", ""));
    made.push(layer);
    if (id === "draw.underline") {
      var over = (b.right - b.left) * p.overhang;
      var y = b.baseline + b.size * p.offset;
      s = kbLibShape(layer, { name: "line", vertices: [[b.left - over, y], [b.right + over, y]], stroke: color, width: width, cap: p.cap, trim: true });
      kbKeysCurve(s.trim, start, dur, 0, 100, curve);
    } else if (id === "draw.marker") {
      var h = b.size * p.height;
      var my = b.baseline - h / 2 + b.size * 0.06;
      s = kbLibShape(layer, { name: "marker", vertices: [[b.left - b.size * 0.06, my], [b.right + b.size * 0.06, my]], stroke: color, width: h, cap: p.cap, opacity: p.opacity, trim: true });
      kbKeysCurve(s.trim, start, dur, 0, 100, curve);
      layer.moveAfter(target);
    } else if (id === "draw.circle") {
      var cx = (b.left + b.right) / 2;
      var cy = (b.top + b.bottom) / 2;
      s = kbLibShape(layer, { name: "circle", ellipse: [(b.right - b.left) * (1 + 2 * p.pad), (b.bottom - b.top) * (1 + 2 * p.pad * 1.6)], center: [cx, cy], stroke: color, width: width, cap: p.cap, trim: true });
      // Начало штриха — вверху слева, как рука: сдвиг trim, а не поворот группы (поворот развернул бы сам эллипс).
      kbProp(kbGroup(s.group, ["ADBE Vectors Group", "ADBE Vector Filter - Trim"]), ["ADBE Vector Trim Offset"]).setValue(-110);
      kbKeysCurve(s.trim, start, dur, 0, 100, curve);
    } else if (id === "draw.strike") {
      var sy = b.baseline - b.size * 0.32;
      var half = (b.right - b.left) / 2 * 1.08;
      var mx = (b.left + b.right) / 2;
      var tilt = p.tilt * Math.PI / 180;
      s = kbLibShape(layer, {
        name: "strike", stroke: color, width: width, cap: p.cap, trim: true,
        vertices: [[mx - half * Math.cos(tilt), sy - half * Math.sin(tilt)], [mx + half * Math.cos(tilt), sy + half * Math.sin(tilt)]]
      });
      kbKeysCurve(s.trim, start, dur, 0, 100, curve);
    } else throw new Error("Нет линии «" + id + "»");
    return { id: id, start: start, end: end, layers: kbLibNames(made) };
  }

  // По точкам: draw.arrow, draw.connector, callout.
  if (opts.from === undefined || opts.to === undefined) throw new Error(id + ": нужны from и to — точки [x, y] или слои");
  var gap = p.gap * unit;
  var c0 = kbLibPoint(opts.from, start);
  var c1 = kbLibPoint(opts.to, start);
  var chip = null;
  if (id === "callout") chip = kbLibChip(style, comp, p, c1, unit, start);
  var p1 = chip ? kbLibEdge(chip.plate, c0, 0, start) : kbLibEdge(opts.to, c0, gap, start);
  var p0 = kbLibEdge(opts.from, p1, opts.from instanceof Array ? 0 : gap, start);
  var path = kbLibBend(p0, p1, p.bend);
  var line = kbLibShapeLayer(comp, (opts.name || id.replace("draw.", "")));
  made.push(line);
  s = kbLibShape(line, { name: "line", vertices: path.vertices, inT: path.inT, outT: path.outT, stroke: color, width: width, cap: p.cap, trim: true });
  kbKeysCurve(s.trim, start, dur, 0, 100, curve);

  if (p.dot) {
    var dot = kbLibShape(line, { name: "dot", ellipse: [p.dot * unit, p.dot * unit], center: p0, fill: color });
    kbLibGroupPop(style, dot.group, p0, start, kbMsToTime(kbMs(style, "micro"), fps));
  }
  if (id === "draw.arrow") {
    // Наконечник по касательной в конце: направление от контрольной точки к концу.
    var tx = p1[0] - path.q[0];
    var ty = p1[1] - path.q[1];
    var len = Math.sqrt(tx * tx + ty * ty) || 1;
    tx /= len;
    ty /= len;
    var hl = width * p.head;
    var ang = p.headAngle * Math.PI / 180;
    var w1 = [p1[0] - hl * (tx * Math.cos(ang) - ty * Math.sin(ang)), p1[1] - hl * (ty * Math.cos(ang) + tx * Math.sin(ang))];
    var w2 = [p1[0] - hl * (tx * Math.cos(ang) + ty * Math.sin(ang)), p1[1] - hl * (ty * Math.cos(ang) - tx * Math.sin(ang))];
    var head = kbLibShape(line, { name: "head", vertices: [w1, p1, w2], stroke: color, width: width, cap: p.cap });
    kbLibGroupPop(style, head.group, p1, start + dur * 0.8, kbMsToTime(160 * kbTok(style, "motion.tempo"), fps));
    end = Math.max(end, start + dur * 0.8 + 0.16);
  }
  if (chip) {
    var popAt = start + dur * 0.85;
    var popDur = kbMsToTime(kbMs(style, 250), fps);
    var plateScale = kbProp(chip.plate, ["ADBE Transform Group", "ADBE Scale"]);
    var full = plateScale.value;
    kbKeysCurve(plateScale, popAt, popDur, kbLibValue({ factor: 0 }, full, "scale", 1), full, kbTok(style, "motion.ease.emphasis"), kbTok(style, "motion.overshoot"));
    made.push(chip.plate, chip.text);
    end = Math.max(end, popAt + popDur);
  }
  return { id: id, start: start, end: end, layers: kbLibNames(made) };
}

/**
 * Плашка выноски: скруглённый прямоугольник по тексту, текст — ребёнок плашки (выскакивают вместе).
 * @param {any} style
 * @param {CompItem} comp
 * @param {any} p
 * @param {number[]} at центр плашки
 * @param {number} unit
 * @param {number} t
 * @returns {{plate: ShapeLayer, text: TextLayer}}
 */
function kbLibChip(style, comp, p, at, unit, t) {
  var fmt = comp.width < comp.height ? "9x16" : "16x9";
  var size = kbTok(style, "type.size." + p.size + "." + fmt) * unit;
  var ink = kbHex(kbTok(style, "color." + p.ink));
  var text = kbText(comp, { text: p.text, font: kbTok(style, "type.font.text"), size: size, color: ink, x: at[0], y: at[1] });
  text.name = "chip · " + p.text;
  var r = text.sourceRectAtTime(t, false);
  var plate = kbLibShapeLayer(comp, "chip-plate · " + p.text);
  var w = r.width + 2 * p.padX * unit;
  var h = r.height + 2 * p.padY * unit;
  kbLibShape(plate, { name: "plate", rect: [w, h], center: [0, 0], radius: Math.min(kbTok(style, "shape.radius.chip") * unit, h / 2), fill: kbHex(kbTok(style, "color." + p.chip)) });
  kbProp(plate, ["ADBE Transform Group", "ADBE Position"]).setValue(at);
  plate.moveAfter(text);
  text.parent = plate;
  return { plate: plate, text: text };
}

/**
 * Все Trim End в группе shape (рекурсивно).
 * @param {PropertyGroup} group
 * @param {Property[]} out
 * @returns {Property[]}
 */
function kbLibTrims(group, out) {
  for (var i = 1; i <= group.numProperties; i++) {
    var pr = group.property(i);
    if (pr.matchName === "ADBE Vector Filter - Trim") out.push(kbProp(pr, ["ADBE Vector Trim End"]));
    else if (pr.propertyType !== PropertyType.PROPERTY) kbLibTrims(/** @type {PropertyGroup} */ (pr), out);
  }
  return out;
}

// ---------- вход ----------

/**
 * Применить примитив библиотеки.
 * @param {any} style итоговый стиль (kbStyle) или id
 * @param {string|any} id имя примитива или сам объект (сервер MCP передаёт готовым)
 * @param {Layer|null} layer цель (для линий по точкам — null и opts.comp)
 * @param {any=} opts
 * @returns {any}
 */
function kbLib(style, id, layer, opts) {
  var st = typeof style === "string" ? kbStyle(style) : style;
  var item = typeof id === "string" ? kbLibItem(id) : id;
  if (typeof id === "string") item.id = id;
  var o = opts || {};
  if (item.kind === "draw" || item.kind === "undraw") return kbLibLine(st, item, layer, o);
  if (!layer && item.target === "others" && o.others && o.others.length) layer = o.others[0];
  if (!layer) throw new Error(item.id + ": нужен слой" + (item.target === "others" ? " или others" : ""));
  if (item.basedOn || item.kind === "counter") return kbLibText(st, item, /** @type {TextLayer} */ (layer), o);
  return kbLibMotion(st, item, layer, o);
}

/**
 * Время удержания текста после входа, мс (docs/research §1.4): на изучаемом языке 1000 + 400 на слово,
 * на родном (l1) 800 + 300; от 900 до 7000; новое слово — не меньше 2500.
 * @param {any} style
 * @param {string} text
 * @param {{l1?: boolean, newWord?: boolean}=} o
 * @returns {number}
 */
function kbTextHold(style, text, o) {
  var h = kbTok(style, "motion.hold");
  var words = kbLibUnits(text, "words");
  var ms = o && o.l1 ? h.baseL1 + h.perWordL1 * words : h.baseL2 + h.perWordL2 * words;
  if (o && o.newWord) ms = Math.max(ms, h.newWordMin);
  return Math.max(h.min, Math.min(h.max, ms));
}

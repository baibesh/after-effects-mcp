// Каркас именованных движений type-lab: реестр TL_MOVES, стили, раннер kbMove/kbMovePlan/kbSlot,
// аниматор текста с Expression Selector, звук из маркеров. Пресеты: rise, sink-out, hold-alive; TL_TWOS — двойки для выражений.
// ES3, свойства только по matchName. Подключать после tl-ease.jsx.

//@include "../core.jsx"
//@include "../project.jsx"
//@include "../motion.jsx"
//@include "../text.jsx"
//@include "../audio.jsx"
//@include "../show-e.jsx"
//@include "tl-ease.jsx"

// Guard повторного //@include (tl-accent/tl-hand подключают tl-move ещё раз): в пределах одного запуска реестр и стиль
// сохраняются, новый запуск начинает с чистого. Глобальные переменные AE живут между запусками DoScriptFile (движок main),
// поэтому признак «тот же запуск» — объект функции kbMove: //@include склеивает файлы в один текст, объявление функции
// поднимается до начала выполнения и одинаково для всех копий файла в запуске, а в следующем запуске это уже новый объект.
/** @type {any} */
var TL_RUN_OWNER;
/** @type {{[name: string]: any}} */
var TL_MOVES = (TL_RUN_OWNER === kbMove && typeof TL_MOVES === "object" && TL_MOVES !== null) ? TL_MOVES : {};

/** @type {{[name: string]: any}} */
var TL_STYLES = {
  hand: { dur: 1, strength: 1, overCap: 0.06, hitCap: 0.08, swap: {} },
  brisk: { dur: 0.7, strength: 1.2, overCap: 0.1, hitCap: 0.1, swap: { "rise": "land", "cascade": "slam", "paper-fade": "sink-out" } },
  // swapOpts: опции пресета-замены, которые раннер подмешивает под опции вызова (stream2/spec.md §3.4)
  lesson: { dur: 1.3, strength: 0.6, overCap: 0, hitCap: 0,
    swap: { "land": "rise", "slam": "cascade", "baseline-reveal": "rise", "marker-swipe": "recolor-swipe" },
    swapOpts: { "recolor-swipe": { mode: "step" } } },
  magazine: { dur: 1.6, strength: 0.5, overCap: 0, hitCap: 0,
    swap: { "land": "baseline-reveal", "slam": "cascade", "stamp-in": "plate-in", "marker-swipe": "recolor-swipe", "punch": "cam-push" }, swapOpts: {} }
};

/** Текущий стиль (читает раннер). */
/** @type {any} */
var TL_S = (TL_RUN_OWNER === kbMove && typeof TL_S === "object" && TL_S !== null) ? TL_S : { name: "hand", dur: 1, strength: 1, overCap: 0.06, hitCap: 0.08, swap: {}, swapOpts: {}, text: { caps: true, tracking: 0, cap: 0.72 }, sfx: { dir: "", map: {} } };
TL_RUN_OWNER = kbMove;

/**
 * Двойки, устойчивые к motion blur (stream2/spec.md §4.1): строка для выражений, задаёт tq — время, округлённое
 * к двойке. Корзины [2k − 0,5; 2k + 1,5) кадра: кадры 2k и 2k + 1 одинаковы, экспозиция (± 0,25 к.) границу не пересекает,
 * чего не умеет posterizeTime(15) (его граница на целом кадре, и при затворе 180°/−90 чётный кадр — смесь двух поз).
 * Пары начинаются с чётного кадра времени композиции, где стоит выражение. Шумы и синусы считаются от tq.
 */
var TL_TWOS = "var tq=Math.floor((time*30+0.5)/2)*2/30;\n";

/**
 * Включить стиль: объект KB_STYLE или имя ("brisk"). Подмены берутся из таблицы стиля, если в объекте пусты.
 * @param {any} style
 */
function kbMoveStyle(style) {
  var obj = typeof style === "string" ? { name: style } : style;
  var base = TL_STYLES[obj.name];
  if (!base) throw new Error("kbMoveStyle: нет стиля «" + obj.name + "»");
  var s = {};
  var key;
  for (key in TL_S) s[key] = TL_S[key]; // палитра, шрифты, sfx переходят от прошлого стиля
  for (key in obj) s[key] = obj[key];
  s.name = obj.name;
  s.dur = obj.dur !== undefined ? obj.dur : base.dur;
  s.strength = obj.strength !== undefined ? obj.strength : base.strength;
  s.overCap = obj.overCap !== undefined ? obj.overCap : base.overCap;
  s.hitCap = obj.hitCap !== undefined ? obj.hitCap : base.hitCap;
  var hasSwap = false;
  for (key in (obj.swap || {})) hasSwap = true;
  s.swap = hasSwap ? obj.swap : base.swap;
  s.swapOpts = obj.swapOpts ? obj.swapOpts : (base.swapOpts || {});
  TL_S = s;
  kbLog("STYLE " + s.name + " dur " + s.dur + " str " + s.strength + " cap " + s.overCap);
}

/**
 * Исключение на то, чего нет в шрифтах: стрелки, ✓✗, комбинирующие знаки. Һ/һ — пропускаем.
 * @param {string} text
 */
function tlGuardText(text) {
  if (/[←-⇿]/.test(text)) throw new Error("tlGuardText: стрелка в тексте «" + text + "» — в InterKB/Caveat её нет");
  if (/[✓-✘]/.test(text)) throw new Error("tlGuardText: ✓/✗ в тексте «" + text + "» — в шрифтах их нет");
  if (/[̀-ͯ]/.test(text)) throw new Error("tlGuardText: комбинирующий знак в тексте «" + text + "» — буква уйдёт в другой шрифт");
  if (text.indexOf("ғ") >= 0) kbLog("WARN tlGuardText: строчная «ғ» в InterKB читается как F («" + text + "»)");
}

/**
 * Размер шрифта под ширину: самая широкая строка при 100 px.
 * @param {CompItem} comp
 * @param {string[]} lines
 * @param {string} font
 * @param {number} maxWidth
 * @param {number} maxSize
 * @returns {number}
 */
function tlFit(comp, lines, font, maxWidth, maxSize) {
  var widest = 1;
  for (var i = 0; i < lines.length; i++) {
    var w = kbTextMeasure(comp, { text: lines[i], font: font, size: 100 }).width;
    if (w > widest) widest = w;
  }
  return Math.min(maxSize, Math.floor(100 * maxWidth / widest));
}

/**
 * Текст на базовую линию: якорь в центр рамки, позиция так, чтобы базовая линия первой строки встала на baseline.
 * @param {CompItem} comp
 * @param {{text: string, font: string, size: number, color: [number, number, number], x: number, baseline: number, leading?: number, ranges?: {from: number, to: number, color: [number, number, number]}[], name?: string}} o
 * @returns {TextLayer}
 */
function tlTextAt(comp, o) {
  tlGuardText(o.text);
  var layer = kbText(comp, { text: o.text, font: o.font, size: o.size, color: o.color, x: o.x, y: 0, leading: o.leading });
  if (o.name) layer.name = o.name;
  if (o.ranges) {
    var source = kbProp(layer, ["ADBE Text Properties", "ADBE Text Document"]);
    var doc = source.value;
    for (var i = 0; i < o.ranges.length; i++) {
      var range = doc.characterRange(o.ranges[i].from, o.ranges[i].to);
      range.fillColor = o.ranges[i].color;
    }
    source.setValue(doc);
  }
  var rect = layer.sourceRectAtTime(0, false);
  kbProp(layer, ["ADBE Transform Group", "ADBE Anchor Point"]).setValue([rect.left + rect.width / 2, rect.top + rect.height / 2]);
  kbProp(layer, ["ADBE Transform Group", "ADBE Position"]).setValue([o.x, o.baseline + rect.top + rect.height / 2]);
  var cap = (TL_S.text && TL_S.text.cap) || 0.72;
  kbLog("LAYOUT " + layer.name + " size " + o.size + " base " + o.baseline + " left " + Math.round(o.x - rect.width / 2) +
    " right " + Math.round(o.x + rect.width / 2) + " capTop " + Math.round(o.baseline - cap * o.size));
  return layer;
}

/**
 * Число единиц текста слоя: char (без пробелов), word, line.
 * @param {Layer} layer
 * @param {string} unit
 * @returns {number}
 */
function tlCountUnits(layer, unit) {
  var text = kbProp(layer, ["ADBE Text Properties", "ADBE Text Document"]).value.text;
  var parts;
  var n = 0;
  var i;
  if (unit === "char") {
    for (i = 0; i < text.length; i++) if (!/\s/.test(text.charAt(i))) n++;
    return n;
  }
  parts = text.split(unit === "word" ? /\s+/ : /[\r\n]+/);
  for (i = 0; i < parts.length; i++) if (parts[i] !== "") n++;
  return n;
}

/**
 * Размер шрифта слоя (em пресета).
 * @param {Layer} layer
 * @returns {number}
 */
function tlFontSize(layer) {
  return kbProp(layer, ["ADBE Text Properties", "ADBE Text Document"]).value.fontSize;
}

/**
 * Общий план времени: старт каждой единицы с учётом стаггера, потолка и опорного момента.
 * @param {Layer} layer
 * @param {any} o опции вызова (unit, stagger мс, stagger_ease, at | start)
 * @param {any} S стиль
 * @param {any} def паспорт пресета; def.fracStagger — дробные смещения (без Math.round; иначе соседние единицы
 *   с разницей < 0,5 к. стартуют на одном кадре — склейка «CAN» у cascade, «SO» у land, «БЕС» у slam)
 * @param {number} unitFr длительность одной единицы, кадров (уже со множителем стиля)
 * @param {boolean} isOut выход: at — момент, когда слоя уже нет
 * @param {number=} maxTotal потолок всей длительности, кадров
 * @returns {{n: number, unit: string, starts: number[], start: number, hit: number, end: number, total: number, unitFr: number, staggerFr: number, ease: string, frac: boolean}}
 */
function tlPlan(layer, o, S, def, unitFr, isOut, maxTotal) {
  var unit = o.unit || def.unit;
  var n = tlCountUnits(layer, unit);
  if (n < 1) throw new Error("в слое нет единиц «" + unit + "»");
  var staggerMs = o.stagger !== undefined ? o.stagger : def.stagger[unit];
  var staggerFr = staggerMs / 1000 * 30 * S.dur;
  var O = n > 1 ? staggerFr * (n - 1) : 0;
  if (maxTotal !== undefined && unitFr + O > maxTotal) {
    O = Math.max(0, maxTotal - unitFr);
    staggerFr = n > 1 ? O / (n - 1) : 0;
    kbLog("INFO stagger→ " + Math.round(staggerFr / 30 * 1000) + " ms (" + layer.name + ")");
  }
  var ease = o.stagger_ease || def.staggerEase || "soft";
  var order = o.order || "forward";
  var offs = [];
  var maxOff = 0;
  var i;
  for (i = 0; i < n; i++) {
    var rank = i;
    if (order === "backward") rank = n - 1 - i;
    else if (order === "center") rank = Math.round(Math.abs(i - (n - 1) / 2) * 2);
    var u = order === "center" ? rank / Math.max(1, n - 1) : rank / (n - 1);
    var off = n > 1 ? O * tlBz(u, ease) : 0;
    if (!def.fracStagger) off = Math.round(off); // fracStagger: дробные смещения, без склейки по кадрам
    offs.push(off);
    if (off > maxOff) maxOff = off;
  }
  var total = unitFr + maxOff;
  var start;
  var hit;
  if (o.at !== undefined && o.start === undefined) {
    if (isOut) { hit = o.at; start = o.at - total / 30; } else { hit = o.at - def.lead / 30; start = hit - total / 30; }
  } else if (o.start !== undefined && o.at === undefined) {
    start = o.start;
    hit = start + total / 30;
  } else {
    throw new Error("нужно ровно одно из at | start");
  }
  start = Math.round(start * 30) / 30;
  hit = start + total / 30;
  var starts = [];
  for (i = 0; i < n; i++) starts.push(start + offs[i] / 30);
  return { n: n, unit: unit, starts: starts, start: start, hit: hit, end: hit, total: total, unitFr: unitFr, staggerFr: staggerFr,
    ease: ease, frac: !!def.fracStagger };
}

/**
 * Аниматор текста с Expression Selector: одно свойство — один аниматор.
 * Значение кривой v (в единицах свойства) переводится в amount = (v − rest) / span × 100, |amount| ≤ 100.
 * @param {TextLayer} layer
 * @param {{name: string, basedOn: number, grouping?: number, lock?: boolean, align?: number[], prop: string, fullValue: any, rest: number, span: number, starts: number[], keys: any[][]}} o
 *   keys: [кадр от старта единицы, значение, кривая отрезка (приходит в этот ключ): имя | "fall" | пусто = линейно]
 * @returns {PropertyGroup}
 */
function tlAnimator(layer, o) {
  var i;
  var animator = kbAdd(kbGroup(layer, ["ADBE Text Properties", "ADBE Text Animators"]), "ADBE Text Animator");
  animator.name = o.name;
  var props = kbGroup(animator, ["ADBE Text Animator Properties"]);
  /** @type {Property} */ (props.addProperty(o.prop)).setValue(o.fullValue);
  var selector = kbAdd(kbGroup(animator, ["ADBE Text Selectors"]), "ADBE Text Expressible Selector"); // ae-ok: matchname
  kbProp(selector, ["ADBE Text Range Type2"]).setValue(o.basedOn);
  // Группировка якоря — одно свойство на весь слой. Пресет, которому важен якорь (slam: центр капители каждой буквы),
  // ставит замок (o.lock) в комментарий слоя; последующие аниматоры (sink-out по словам и т. п.) его не перезаписывают.
  var locked = String(layer.comment).indexOf("tl-anchor-lock") === 0;
  if (o.grouping && (!locked || o.lock)) {
    kbProp(layer, ["ADBE Text Properties", "ADBE Text More Options", "ADBE Text Anchor Point Option"]).setValue(o.grouping);
    kbProp(layer, ["ADBE Text Properties", "ADBE Text More Options", "ADBE Text Anchor Point Align"]).setValue(o.align || [0, 0]);
    if (o.lock) layer.comment = "tl-anchor-lock";
  } else if (o.grouping && locked) {
    kbLog("INFO anchor grouping locked (" + layer.name + "): " + o.name + " keeps the layer's anchor");
  }
  var s = [];
  for (i = 0; i < o.starts.length; i++) s.push(o.starts[i].toFixed(4));
  var k = [];
  for (i = 0; i < o.keys.length; i++) {
    var key = o.keys[i];
    var mode = 2;
    var x1 = 0;
    var x2 = 0;
    if (key[2] === "fall") mode = 1;
    else if (key[2]) {
      var ke = tlEase(key[2]);
      if (ke.linear) mode = 2; // линейно; bz(u, 1/3, 2/3) в выражении — это smoothstep, не линия
      else { mode = 0; x1 = ke.x1; x2 = ke.x2; }
    }
    k.push("[" + key[0] + "," + Number(key[1]).toFixed(4) + "," + mode + "," + x1 + "," + x2 + "]");
  }
  var expr = TL_EXPR_BZ +
    "var S=[" + s.join(",") + "];\n" +
    "var K=[" + k.join(",") + "];\n" +
    "var i=Math.min(Math.max(textIndex,1),S.length)-1;\n" +
    "var f=(time-S[i])*30;\n" +
    "var v=K[K.length-1][1];\n" +
    "if(f<=K[0][0]){v=K[0][1];}else{for(var j=1;j<K.length;j++){if(f<=K[j][0]){var a=K[j-1],b=K[j];" +
    "var u=(f-a[0])/(b[0]-a[0]);var e=(b[2]==1)?u*u:((b[2]==0)?bz(u,b[3],b[4]):u);v=a[1]+(b[1]-a[1])*e;break;}}}\n" +
    "(v-(" + o.rest + "))/(" + o.span + ")*100;";
  kbProp(selector, ["ADBE Text Expressible Amount"]).expression = expr; // ae-ok: matchname
  return animator;
}

/**
 * Секунды → ближайший кадр не раньше (звук не раньше картинки).
 * @param {number} t
 * @returns {number}
 */
function tlCeilFrame(t) {
  return Math.ceil(t * 30 - 0.001) / 30;
}

/**
 * Маркер sfx на композиции слоя; на занятом кадре дописывается через «|».
 * @param {Layer} layer
 * @param {number} t
 * @param {string} kind
 * @param {number} strength
 */
function tlSfxMarker(layer, t, kind, strength) {
  var markers = layer.containingComp.markerProperty;
  var item = kind + "@" + strength;
  var comment = "sfx:" + item;
  for (var i = 1; i <= markers.numKeys; i++) {
    if (Math.abs(markers.keyTime(i) - t) < 0.0005) {
      var old = markers.keyValue(i).comment;
      comment = old.indexOf("sfx:") === 0 ? old + "|" + item : comment;
    }
  }
  markers.setValueAtTime(t, new MarkerValue(comment));
}

/**
 * Выполнить (или только спланировать) движение.
 * @param {Layer} layer
 * @param {string} name
 * @param {any} opts
 * @param {boolean} doRun
 * @returns {any}
 */
function tlRunMove(layer, name, opts, doRun) {
  var S = TL_S;
  var from = name;
  var o = {};
  var key;
  if (S.swap[name]) {
    kbLog("SWAP " + name + "→" + S.swap[name] + " (" + S.name + ")");
    name = S.swap[name];
  }
  var def = TL_MOVES[name];
  if (!def) throw new Error("kbMove: нет пресета «" + name + "» (подмена из «" + from + "», стиль " + S.name + ", слой «" + layer.name + "»)");
  for (key in (def.params || {})) o[key] = def.params[key];
  if (from !== name && S.swapOpts && S.swapOpts[name]) for (key in S.swapOpts[name]) o[key] = S.swapOpts[name][key]; // опции подмены — под опциями вызова
  for (key in (opts || {})) o[key] = opts[key];
  var plan;
  try {
    plan = def.plan(layer, o, S);
    if (doRun) def.run(layer, o, S, plan);
    if (doRun && plan.starts && plan.starts.length > 1) { // журнал: смещение старта каждой единицы, кадров (приёмка сверяет со спекой)
      var offTxt = [];
      for (var oi = 0; oi < plan.starts.length; oi++) offTxt.push(((plan.starts[oi] - plan.start) * 30).toFixed(2));
      kbLog("INFO " + name + " offs " + offTxt.join(",") + " (" + layer.name + ", " + (plan.ease || "-") + (plan.frac ? ", frac" : ", round") + ")");
    }
  } catch (e) {
    throw new Error("kbMove «" + name + "» на «" + layer.name + "»: " + e.message);
  }
  var sfx = [];
  if (doRun && def.sfx) {
    var strength = (def.sfx.strength || 1) * (o.strength !== undefined ? o.strength : 1);
    var t = tlCeilFrame(def.sfx.at === "start" ? plan.start : plan.hit); // sfx.at: "hit" (по умолчанию) | "start" (звук проведения, marker-swipe)
    tlSfxMarker(layer, t, def.sfx.kind, strength);
    sfx.push({ kind: def.sfx.kind, t: t, strength: strength });
  }
  var res = { name: name, from: from, start: plan.start, hit: plan.hit, end: plan.end, units: plan.n, sfx: sfx };
  kbLog((doRun ? "MOVE " : "PLAN ") + name + " «" + layer.name + "» start " + plan.start.toFixed(3) + " hit " + plan.hit.toFixed(3) +
    " end " + plan.end.toFixed(3) + " (" + (plan.unitFr || 0) + "f, n" + (plan.n || 0) + ", st " + (plan.staggerFr || 0).toFixed(1) + "f, ×" +
    (S.strength * (o.strength !== undefined ? o.strength : 1)).toFixed(2) + ")" +
    (sfx.length ? " sfx " + sfx[0].kind + "@" + sfx[0].t.toFixed(3) : ""));
  return res;
}

/**
 * Применить именованное движение к слою.
 * @param {Layer} layer
 * @param {string} name
 * @param {any=} opts at | start, unit, stagger, stagger_ease, order, strength, out, …
 * @returns {{name: string, from: string, start: number, hit: number, end: number, units: number, sfx: any[]}}
 */
function kbMove(layer, name, opts) {
  return tlRunMove(layer, name, opts, true);
}

/**
 * Сухой прогон: времена движения без ключей.
 * @param {Layer} layer
 * @param {string} name
 * @param {any=} opts
 * @returns {any}
 */
function kbMovePlan(layer, name, opts) {
  return tlRunMove(layer, name, opts, false);
}

/**
 * Рамка и мат слоя, на который уже ставили baseline-reveal (null «… frame» с комментарием tl-frame и shape «… mat»).
 * @param {Layer} layer
 * @returns {{frame: Layer, mat: ShapeLayer}|null}
 */
function tlFrameParts(layer) {
  var frame = layer.parent;
  if (!frame || String(frame.comment).indexOf("tl-frame") !== 0) return null;
  var mat = null;
  try { mat = layer.containingComp.layer(layer.name + " mat"); } catch (e) { mat = null; }
  if (!mat) return null;
  return { frame: frame, mat: /** @type {ShapeLayer} */ (mat) };
}

/**
 * Слот слоя: вход, цикл в окне, выход; outPoint — конец выхода.
 * @param {Layer} layer
 * @param {{in: string, loop?: string, out?: string, at: number, until: number, inOpts?: any, loopOpts?: any, outOpts?: any}} o
 * @returns {{in: any, loop: any, out: any}}
 */
function kbSlot(layer, o) {
  var key;
  var inOpts = { at: o.at };
  for (key in (o.inOpts || {})) inOpts[key] = o.inOpts[key];
  var res = { "in": kbMove(layer, o["in"], inOpts), loop: null, out: null };
  var outPlan = null;
  if (o.out) {
    var outOpts = { at: o.until, out: true };
    for (key in (o.outOpts || {})) outOpts[key] = o.outOpts[key];
    outPlan = kbMovePlan(layer, o.out, outOpts);
  } else {
    kbLog("WARN no-out " + layer.name);
  }
  var parts = tlFrameParts(layer); // baseline-reveal: цикл вешается на рамку-пустышку, чтобы текст и мат двигались вместе
  if (o.loop) {
    var loopOpts = { from: res["in"].end, to: outPlan ? outPlan.start : o.until };
    for (key in (o.loopOpts || {})) loopOpts[key] = o.loopOpts[key];
    res.loop = kbMove(parts ? parts.frame : layer, o.loop, loopOpts);
  }
  if (o.out && outPlan) {
    var realOut = { at: o.until, out: true };
    for (key in (o.outOpts || {})) realOut[key] = o.outOpts[key];
    res.out = kbMove(layer, o.out, realOut);
    layer.outPoint = res.out.end + 1 / 30;
    if (parts) { parts.frame.outPoint = layer.outPoint; parts.mat.outPoint = layer.outPoint; }
  }
  return res;
}

/**
 * Собрать маркеры sfx: композиции и вложенных (слой-прекомпозиция: t = startTime + t маркера, внутри in…out).
 * @param {CompItem} comp
 * @param {{dir: string, map: any}} cfg
 * @returns {AVLayer[]}
 */
function kbSfxFromMarkers(comp, cfg) {
  /** @type {{kind: string, t: number, strength: number}[]} */
  var found = [];
  tlCollectSfx(comp, 0, -1e9, 1e9, found);
  var groups = {};
  var order = [];
  var i;
  for (i = 0; i < found.length; i++) {
    var gk = found[i].kind + "@" + found[i].strength;
    if (!groups[gk]) { groups[gk] = { kind: found[i].kind, strength: found[i].strength, times: [] }; order.push(gk); }
    groups[gk].times.push(found[i].t);
  }
  var layers = [];
  var counts = {};
  var summary = [];
  for (i = 0; i < order.length; i++) {
    var g = groups[order[i]];
    var m = cfg.map[g.kind];
    if (!m) throw new Error("kbSfxFromMarkers: нет звука «" + g.kind + "» в карте");
    var made = kbSfx(comp, { file: cfg.dir + m.file, times: g.times, level: m.level - 6 * (1 - g.strength) });
    for (var j = 0; j < made.length; j++) {
      counts[g.kind] = (counts[g.kind] || 0) + 1;
      made[j].name = g.kind + "-" + counts[g.kind];
      layers.push(made[j]);
    }
  }
  for (var kind in counts) summary.push(kind + " ×" + counts[kind]);
  kbLog("SFX " + (summary.length ? summary.join(", ") : "нет маркеров"));
  return layers;
}

/**
 * @param {CompItem} comp
 * @param {number} offset
 * @param {number} lo
 * @param {number} hi
 * @param {{kind: string, t: number, strength: number}[]} out
 */
function tlCollectSfx(comp, offset, lo, hi, out) {
  var markers = comp.markerProperty;
  var i;
  for (i = 1; i <= markers.numKeys; i++) {
    var comment = markers.keyValue(i).comment;
    var t = offset + markers.keyTime(i);
    if (comment.indexOf("sfx:") !== 0 || t < lo - 0.0005 || t > hi + 0.0005) continue;
    var items = comment.substring(4).split("|");
    for (var j = 0; j < items.length; j++) {
      var parts = items[j].split("@");
      out.push({ kind: parts[0], t: t, strength: parts.length > 1 ? parseFloat(parts[1]) : 1 });
    }
  }
  for (i = 1; i <= comp.numLayers; i++) {
    var layer = comp.layer(i);
    if (layer instanceof AVLayer && layer.source instanceof CompItem) {
      tlCollectSfx(layer.source, offset + layer.startTime, Math.max(lo, offset + layer.inPoint), Math.min(hi, offset + layer.outPoint), out);
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Служебные пресеты каркаса
// ---------------------------------------------------------------------------------------------------------------------

/** №1 rise — ровный «дорогой» вход (out:true — зеркало вверх). */
TL_MOVES["rise"] = {
  group: "text-in", slot: "in", units: ["char", "word", "line"], unit: "word",
  frames: { anticip: 2, travel: 12, out: 8 }, stagger: { "char": 33.3, word: 66.7, line: 100 },
  over: 0, lead: 2, sfx: null,
  params: { stagger_ease: "soft", strength: 1 },
  plan: function (layer, o, S) {
    var fr = o.out ? Math.max(3, Math.round(8 * S.dur)) : Math.max(3, Math.round(14 * S.dur));
    return tlPlan(layer, o, S, TL_MOVES["rise"], fr, !!o.out);
  },
  run: function (layer, o, S, plan) {
    var em = tlFontSize(layer);
    var amp = o.strength * S.strength;
    var T = plan.unitFr;
    var basedOn = plan.unit === "char" ? 2 : (plan.unit === "word" ? 3 : 4);
    var grouping = plan.unit === "char" ? 1 : (plan.unit === "word" ? 2 : 3);
    var span = 0.6 * em * Math.max(1, amp);
    if (o.out) {
      tlAnimator(layer, { name: "rise-out-pos", basedOn: basedOn, grouping: grouping, prop: "ADBE Text Position 3D", fullValue: [0, -span, 0], rest: 0, span: -span,
        starts: plan.starts, keys: [[0, 0], [T, -0.3 * em * amp, "release"]] });
      tlAnimator(layer, { name: "rise-out-op", basedOn: basedOn, grouping: grouping, prop: "ADBE Text Opacity", fullValue: 0, rest: 100, span: -100,
        starts: plan.starts, keys: [[0, 100], [T, 0, "release"]] });
      return;
    }
    var a = Math.max(1, Math.round(2 * S.dur));
    var full = a + Math.round(0.4 * (T - a));
    tlAnimator(layer, { name: "rise-pos", basedOn: basedOn, grouping: grouping, prop: "ADBE Text Position 3D", fullValue: [0, span, 0], rest: 0, span: span,
      starts: plan.starts, keys: [[0, 0.5 * em * amp], [a, 0.56 * em * amp, "soft"], [T, 0, "snap"]] });
    tlAnimator(layer, { name: "rise-op", basedOn: basedOn, grouping: grouping, prop: "ADBE Text Opacity", fullValue: 0, rest: 100, span: -100,
      starts: plan.starts, keys: [[0, 0], [a, 35, "soft"], [full, 100, "snap"], [T, 100]] });
  }
};

/** sink-out — выход: «вдох» вверх, затем вниз, уменьшение и исчезание; весь выход ≤ 8 к. */
TL_MOVES["sink-out"] = {
  group: "text-out", slot: "out", units: ["char", "word", "line"], unit: "word",
  frames: { total: 5, ceiling: 8 }, stagger: { "char": 20, word: 20, line: 20 },
  over: 0, lead: 0, sfx: null, fracStagger: true, staggerEase: "linear", // 20 мс = 0,6 к.: soft + Math.round склеивали пары букв (stream2/spec.md §3.1, cascade-fix.md §3.1)
  params: { stagger_ease: "linear", strength: 1 },
  plan: function (layer, o, S) {
    var fr = Math.max(3, Math.round(5 * S.dur));
    return tlPlan(layer, o, S, TL_MOVES["sink-out"], fr, true, Math.max(fr, Math.round(8 * S.dur)));
  },
  run: function (layer, o, S, plan) {
    var em = tlFontSize(layer);
    var amp = o.strength * S.strength;
    var T = plan.unitFr;
    var v1 = Math.max(1, Math.round(S.dur));
    var basedOn = plan.unit === "char" ? 2 : (plan.unit === "word" ? 3 : 4);
    var grouping = plan.unit === "char" ? 1 : (plan.unit === "word" ? 2 : 3);
    var span = 0.2 * em * Math.max(1, amp);
    tlAnimator(layer, { name: "sink-pos", basedOn: basedOn, grouping: grouping, prop: "ADBE Text Position 3D", fullValue: [0, span, 0], rest: 0, span: span,
      starts: plan.starts, keys: [[0, 0], [v1, -0.03 * em, "soft"], [T, 0.16 * em * amp, "release"]] });
    tlAnimator(layer, { name: "sink-scale", basedOn: basedOn, grouping: grouping, prop: "ADBE Text Scale 3D", fullValue: [90, 90, 100], rest: 100, span: -10,
      starts: plan.starts, keys: [[0, 100], [v1, 100], [T, 90, "release"]] });
    tlAnimator(layer, { name: "sink-op", basedOn: basedOn, grouping: grouping, prop: "ADBE Text Opacity", fullValue: 0, rest: 100, span: -100,
      starts: plan.starts, keys: [[0, 100], [v1, 100], [T, 0, "release"]] });
  }
};

/**
 * hold-alive — цикл в окне [from, to] (синонимы t0/t1), без ключей, всё на двойках TL_TWOS (stream2/spec.md §3.2, §5.3).
 * kind "text" (по умолчанию): поворот wiggle(2, 0,45·str, 1, 0.5, tq), масштаб ×(1 + 0,007·str·sin(5,2·(tq − t0))).
 * kind "paper": то же + поворот wiggle(0,6, 1,0·str) и масштаб ×(1 + 0,01·str·(1 − cos(2π·(tq − t0)·30/50))), 100 ↔ 102 %, период 50 к.
 * Добавки умножены на огибающую k = clamp((tq − t0)/0,2)·clamp((t1 − tq)/0,2); вне окна ровно value.
 */
TL_MOVES["hold-alive"] = {
  group: "text-loop", slot: "loop", units: [], unit: "word",
  frames: {}, stagger: {}, over: 0, lead: 0, sfx: null,
  params: { strength: 1, kind: "text" },
  plan: function (layer, o, S) {
    var from = o.from !== undefined ? o.from : o.t0;
    var to = o.to !== undefined ? o.to : o.t1;
    if (from === undefined || to === undefined) throw new Error("hold-alive: нужны from и to (или t0 и t1), окно в секундах");
    if (o.kind !== "text" && o.kind !== "paper") throw new Error("hold-alive: kind «" + o.kind + "» — нужен text или paper");
    if (!(layer instanceof TextLayer) && !layer.nullLayer) throw new Error("hold-alive: только текстовый слой или пустышка-рамка (baseline-reveal)");
    return { n: 0, unit: "", starts: [], start: from, hit: to, end: to, total: Math.round((to - from) * 30), unitFr: 0, staggerFr: 0 };
  },
  run: function (layer, o, S, plan) {
    var str = o.strength * S.strength;
    var paper = o.kind === "paper";
    var win = "var t0=" + plan.start.toFixed(4) + ",t1=" + plan.end.toFixed(4) + ";\n" + TL_TWOS +
      "var k=Math.min(1,Math.max(0,(tq-t0)/0.2))*Math.min(1,Math.max(0,(t1-tq)/0.2));\n";
    var rot = kbProp(layer, ["ADBE Transform Group", "ADBE Rotate Z"]);
    rot.expression = win +
      "if(time<t0||time>t1){value;}else{var r=(wiggle(2," + (0.45 * str).toFixed(3) + ",1,0.5,tq)-value)" +
      (paper ? "+(wiggle(0.6," + (1.0 * str).toFixed(3) + ",1,0.5,tq)-value)" : "") + ";value+r*k;}";
    var sc = kbProp(layer, ["ADBE Transform Group", "ADBE Scale"]);
    sc.expression = win +
      "if(time<t0||time>t1){value;}else{var m=1+0.007*" + str.toFixed(3) + "*Math.sin(5.2*(tq-t0))*k;" +
      (paper ? "m*=1+0.01*" + str.toFixed(3) + "*(1-Math.cos(2*Math.PI*(tq-t0)*30/50))*k;" : "") +
      "var s=value;(s.length==3)?[s[0]*m,s[1]*m,s[2]]:[s[0]*m,s[1]*m];}";
  }
};

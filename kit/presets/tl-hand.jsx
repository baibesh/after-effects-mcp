// Маркерные штрихи потока 2: tlStrokeFit (геометрия штриха по слову), tlRetrim (ключи прорисовки), пресет marker-swipe.
// Подключать после tl-move.jsx и tl-accent.jsx (tlKeysEased). ES3, свойства только по matchName. Спека: stream2/spec.md §4.6, §5.7.

//@include "../core.jsx"
//@include "../show-hand.jsx"
//@include "tl-ease.jsx"
//@include "tl-move.jsx"
//@include "tl-accent.jsx"

/**
 * Виды штриха (spec §4.6): толщина в долях cap, центр y = base + yEm·em + yCap·cap, наклон слоя, косой срез, шероховатость края.
 * @type {{[kind: string]: {t: number, yEm: number, yCap: number, tilt: number, cut: number, rough: number, ext?: number}}}
 */
var TL_STROKE_KINDS = {
  marker: { t: 0.42, yEm: 0.08, yCap: 0, tilt: -0.9, cut: -16, rough: 3, ext: 0.055 }, // ext: калибровка R3 15.10 (см. tlStrokeFit)
  thin: { t: 0.18, yEm: 0.08, yCap: 0.12, tilt: -1.3, cut: -24, rough: 4 },
  strike: { t: 0.18, yEm: 0, yCap: -0.5, tilt: -2, cut: -16, rough: 3 },
  matte: { t: 1.3, yEm: 0, yCap: -0.5, tilt: 0, cut: -8, rough: 2 }
};

/**
 * Зонд R1 (probe-stroke): чернила InterKB-Black внутри рамки sourceRectAtTime. «TOMORROW» 130: левый край чернил на −0,13 px от рамки,
 * правый на 0,87 px; на 100: 0,52 / 0,48. В среднем ≈ 0,4 px на 100 px кегля с каждой стороны (поле антиалиасинга, не геометрия).
 */
var TL_INK_PAD = 0.004; // доля кегля: dL = dR = 0,004·em

/**
 * Геометрия штриха по слову (замер до аниматоров; слово не масштабировано и не повёрнуто на момент вызова).
 * inkL/inkR — края чернил слова в координатах композиции; width = (inkR − inkL) − eL − eR, где eL = eR = t·tan|cut|/2 + rough (R3):
 * внешние края штриха ложатся на чернила слова ×1,00, а не шире буквы. x — центр штриха, y — по виду штриха.
 * @param {TextLayer} word
 * @param {{kind?: string, pad?: number}=} o kind: marker | thin | strike | matte
 * @returns {{kind: string, x: number, y: number, width: number, thickness: number, inkL: number, inkR: number, eL: number, eR: number,
 *   tilt: number, cut: number, rough: number, base: number, em: number, cap: number}}
 */
function tlStrokeFit(word, o) {
  o = o || {};
  var kind = o.kind || "marker";
  var K = TL_STROKE_KINDS[kind];
  if (!K) throw new Error("tlStrokeFit: вид «" + kind + "» — нужен marker, thin, strike или matte");
  var capK = (TL_S.text && TL_S.text.cap) || 0.72;
  var em = tlFontSize(word);
  var cap = capK * em;
  var rect = word.sourceRectAtTime(0, false);
  var anchor = kbProp(word, ["ADBE Transform Group", "ADBE Anchor Point"]).value;
  var pos = kbProp(word, ["ADBE Transform Group", "ADBE Position"]).value;
  var sc = kbProp(word, ["ADBE Transform Group", "ADBE Scale"]).value;
  var rz = kbProp(word, ["ADBE Transform Group", "ADBE Rotate Z"]).value;
  if (Math.abs(sc[0] - 100) > 1e-6 || Math.abs(sc[1] - 100) > 1e-6 || Math.abs(rz) > 1e-6) throw new Error("tlStrokeFit: «" + word.name + "» не в покое (масштаб 100, поворот 0)");
  var pad = o.pad === undefined ? TL_INK_PAD * em : o.pad;
  var inkL = pos[0] - anchor[0] + rect.left + pad;
  var inkR = pos[0] - anchor[0] + rect.left + rect.width - pad;
  var base = pos[1] - anchor[1]; // базовая линия первой строки: якорь tlTextAt лежит на rect.top + height/2 от неё
  var t = K.t * cap;
  // e — насколько чернила штриха выходят за x ± width/2. Оценка t·tan|cut|/2 + rough (8,9 px у marker) на деле завышена: витрина 15.10,
  // TOMORROW 137, t 41,4, seed 60 — штрих width 815,4 лёг на 130…950 при номинале 132,3…947,7, то есть e ≈ 2,3 px = 0,055·t,
  // и концы вставали на 10 px внутрь чернил (провал «покрывает [inkL + 8, inkR − 8]»). У kind с ext — замер, у остальных — оценка.
  var e = K.ext !== undefined ? K.ext * t : t * Math.tan(Math.abs(K.cut) * Math.PI / 180) / 2 + K.rough;
  var width = (inkR - inkL) - 2 * e;
  if (width < 4) throw new Error("tlStrokeFit: слово «" + word.name + "» слишком узкое для штриха (width " + width.toFixed(1) + ")");
  return { kind: kind, x: (inkL + inkR) / 2, y: base + K.yEm * em + K.yCap * cap, width: width, thickness: t, inkL: inkL, inkR: inkR,
    eL: e, eR: e, tilt: K.tilt, cut: K.cut, rough: K.rough, base: base, em: em, cap: cap };
}

/**
 * Переписать ключи Trim End прохода pass-1 штриха kbHandMarker: от start за frames кадров по кривой ease (0 → 100 %).
 * @param {Layer} layer слой kbHandMarker / kbHandUnderline
 * @param {number} start с
 * @param {number} frames кадров (может быть дробным: 10,2)
 * @param {string} ease имя кривой TL_EASE
 * @returns {Property} Trim End
 */
function tlRetrim(layer, start, frames, ease) {
  var trim = kbProp(layer, ["ADBE Root Vectors Group", "pass-1", "ADBE Vectors Group", "ADBE Vector Filter - Trim", "ADBE Vector Trim End"]);
  while (trim.numKeys > 0) trim.removeKey(1);
  tlKeysEased(trim, [[start, 0], [start + frames / 30, 100, ease]]);
  return trim;
}

/**
 * №13 marker-swipe — маркер проводится рукой под словом и гаснет (stream2/spec.md §5.7).
 * tlStrokeFit(kind marker | thin) → kbHandMarker (kbHandUnderline при thin) под словом, дети слова (двигаются с его hold-alive) → kbMarkerGlaze над словом.
 * Прорисовка: 0,34 с = 10,2 к., кривая punch (к. 1 → 27,8 %, 2 → 53,0 %, … 10 → 100 %). Глазурь 2,2 %. sfx marker@1 на первый кадр штриха (sfx.at "start").
 * out (с, конец выхода): непрозрачность штриха 100 → 0 за 6 к. soft, у глазури 2,2 → 0 с теми же ключами.
 * Порядок спеки «ключи выхода до глазури» невозможен буквально: kbMarkerGlaze ставит непрозрачность копии через setValue, а на свойстве с ключами
 * он бросает исключение; поэтому глазурь создаётся сразу после прорисовки, а ключи выхода пишутся на обоих слоях одной процедурой, в одни и те же кадры.
 * Параметры: thin (подчёркивание), color, seed, out. start = первый кадр Trim; hit = start + 10,2 к.; при at: hit = at − lead.
 */
TL_MOVES["marker-swipe"] = {
  group: "text-accent", slot: "accent", units: [], unit: "word",
  frames: { draw: 10.2, fade: 6 }, stagger: {}, over: 0, lead: 2,
  sfx: { kind: "marker", strength: 1, at: "start" },
  params: { thin: false, color: null, seed: 60, out: undefined, strength: 1, arc: undefined }, // seed 60: перебор 1–60 в боевой ячейке 13 (scan-marker-seed): покрытие и толщина проходят
  plan: function (layer, o, S) {
    var T = (o.thin ? 0.3 : 0.34) * 30 * S.dur; // кадров, дробное
    var start;
    if (o.at !== undefined && o.start === undefined) start = o.at - TL_MOVES["marker-swipe"].lead / 30 - T / 30;
    else if (o.start !== undefined && o.at === undefined) start = o.start;
    else throw new Error("нужно ровно одно из at | start");
    start = Math.round(start * 30) / 30;
    var hit = start + T / 30;
    return { n: 0, unit: "", starts: [], start: start, hit: hit, end: hit, total: T, unitFr: T, staggerFr: 0 };
  },
  run: function (layer, o, S, plan) {
    var pal = S.palette || {};
    var color = o.color || pal.marker || KB_COLOR.markerInk;
    var comp = layer.containingComp;
    var fit = tlStrokeFit(layer, { kind: o.thin ? "thin" : "marker" });
    var T = plan.unitFr / 30;
    var band;
    if (o.thin) {
      band = kbHandUnderline(comp, { x: fit.x, y: fit.y, width: fit.width, thickness: fit.thickness, color: color, start: plan.start, duration: T,
        seed: o.seed, tilt: fit.tilt, cut: fit.cut, head: 0, name: layer.name + " underline" });
    } else {
      band = kbHandMarker(comp, { x: fit.x, y: fit.y, width: fit.width, thickness: fit.thickness, color: color, start: plan.start, duration: T,
        seed: o.seed, tilt: fit.tilt, cut: fit.cut, wobble: 4.5, rough: fit.rough, arc: o.arc, fade: 16, head: 0, name: layer.name + " marker" });
    }
    tlRetrim(band, plan.start, plan.unitFr, "punch");
    band.moveAfter(layer); // штрих под словом: буквы поверх краски
    var glaze = kbMarkerGlaze(band, layer, { opacity: 2.2 }); // над словом, копия забрала ключи прорисовки
    // setParentWithJump не компенсирует якорь родителя: позиция ребёнка считается в слое слова вручную (слово в покое: масштаб 100, поворот 0)
    var wa = kbProp(layer, ["ADBE Transform Group", "ADBE Anchor Point"]).value;
    var wp = kbProp(layer, ["ADBE Transform Group", "ADBE Position"]).value;
    var kids = [band, glaze];
    for (var ki = 0; ki < kids.length; ki++) {
      kids[ki].parent = layer;
      kbProp(kids[ki], ["ADBE Transform Group", "ADBE Position"]).setValue([fit.x + wa[0] - wp[0], fit.y + wa[1] - wp[1]]);
    }
    var fadeTxt = "";
    if (typeof o.out === "number") {
      var fr = Math.max(2, Math.round(6 * S.dur));
      var t1 = o.out;
      var t0 = t1 - fr / 30;
      var ops = [band, glaze];
      var tops = [100, 2.2];
      for (var i = 0; i < ops.length; i++) {
        tlKeysEased(kbProp(ops[i], ["ADBE Transform Group", "ADBE Opacity"]), [[t0, tops[i]], [t1, 0, "soft"]]);
        ops[i].outPoint = t1 + 1 / 30;
      }
      fadeTxt = " fade f" + Math.round(t0 * 30) + "–" + Math.round(t1 * 30) + " (band 100→0, glaze 2.2→0)";
    }
    kbLog("STROKE " + fit.kind + " inkL " + fit.inkL.toFixed(1) + " inkR " + fit.inkR.toFixed(1) + " width " + fit.width.toFixed(1) +
      " thickness " + fit.thickness.toFixed(2) + " y " + fit.y.toFixed(2) + " base " + fit.base.toFixed(1) + " seed " + o.seed +
      " trim f" + (plan.start * 30).toFixed(1) + "–" + (plan.hit * 30).toFixed(1) + fadeTxt);
  }
};

/**
 * Ступенька цвета (и начертания) диапазона символов слоя: hold-ключ Source Text на tStep. Базовый ключ с исходным документом
 * ставится на 0 (с одним ключом свойство держало бы новое значение на всём времени), поэтому «ключей после 0» ровно один.
 * @param {TextLayer} layer
 * @param {number} tStep секунды
 * @param {number} from первый символ
 * @param {number} to символ после последнего
 * @param {number[]} color
 * @param {string=} font
 */
function tlRestyleRange(layer, tStep, from, to, color, font) {
  var src = kbProp(layer, ["ADBE Text Properties", "ADBE Text Document"]);
  if (src.numKeys === 0) src.setValueAtTime(0, src.value);
  var doc = src.valueAtTime(tStep, false);
  var r = doc.characterRange(from, to);
  r.fillColor = /** @type {any} */ (color);
  if (font) r.font = font;
  src.setValueAtTime(tStep, doc);
}

/**
 * №15 recolor-swipe — слово внутри фразы перекрашивается мазком слева направо (stream2/spec.md §5.8).
 * swipe: дубль строки (после hold-alive, с теми же выражениями) в цвете color прямо над оригиналом; трек-мат ALPHA — маска
 * kbHandMarker kind matte по диапазону слова (без разводов, без глазури), прорисовка 5 к. snap (tlRetrim); на start + 6 к. − 0,02 с
 * hold-ключ Source Text оригинала (characterRange(from, to).fillColor); дубль и маска кончаются на start + 6 к.
 * Границы маски по центральной линии: L = inkL слова − g1/2 + e, R = inkR слова + g2/2 − e (g — зазоры до соседних знаков из kbTextMeasure
 * подстрок; у края строки зазор 2e), так что края чернил маски лежат на серединах зазоров. Маска — ребёнок оригинала (едет с его hold-alive).
 * step: только hold-ключ на at − 0,02 с, дубля нет. Параметры: range [from, to), color (palette.en), mode swipe | step, font, seed.
 * hit = start + 5 к.; при at в swipe: start = at − lead − 5 к.; в step start = hit = at.
 */
TL_MOVES["recolor-swipe"] = {
  group: "text-accent", slot: "accent", units: [], unit: "word",
  frames: { swipe: 5 }, stagger: {}, over: 0, lead: 2, sfx: null,
  params: { range: null, color: null, mode: "swipe", font: null, seed: 71, strength: 1 },
  plan: function (layer, o, S) {
    if (!o.range || o.range.length !== 2 || !(o.range[0] >= 0) || !(o.range[1] > o.range[0])) throw new Error("recolor-swipe: нужен range [from, to) символов строки");
    if (o.mode !== "swipe" && o.mode !== "step") throw new Error("recolor-swipe: mode «" + o.mode + "» — нужен swipe или step");
    if (!(layer instanceof TextLayer)) throw new Error("recolor-swipe: только текстовый слой");
    var start;
    if (o.mode === "step") {
      if (o.at !== undefined && o.start === undefined) start = o.at;
      else if (o.start !== undefined && o.at === undefined) start = o.start;
      else throw new Error("нужно ровно одно из at | start");
      return { n: 0, unit: "", starts: [], start: start, hit: start, end: start, total: 0, unitFr: 0, staggerFr: 0 };
    }
    var T = TL_MOVES["recolor-swipe"].frames.swipe * S.dur;
    if (o.at !== undefined && o.start === undefined) start = o.at - TL_MOVES["recolor-swipe"].lead / 30 - T / 30;
    else if (o.start !== undefined && o.at === undefined) start = o.start;
    else throw new Error("нужно ровно одно из at | start");
    start = Math.round(start * 30) / 30;
    return { n: 0, unit: "", starts: [], start: start, hit: start + T / 30, end: start + (T + 1) / 30, total: T + 1, unitFr: T, staggerFr: 0 };
  },
  run: function (layer, o, S, plan) {
    var pal = S.palette || {};
    var color = o.color || pal.en || KB_COLOR.blue;
    var from = o.range[0];
    var to = o.range[1];
    var comp = layer.containingComp;
    if (o.mode === "step") {
      var ts = plan.start - 0.02;
      tlRestyleRange(/** @type {TextLayer} */ (layer), ts, from, to, color, o.font || undefined);
      kbLog("RECOLOR step range [" + from + "," + to + ") key t " + ts.toFixed(4) + " (f" + (ts * 30).toFixed(2) + ") без дубля");
      return;
    }
    var T = plan.unitFr;
    var tEnd = plan.start + (T + 1) / 30; // дубль и маска кончаются здесь
    var tStep = tEnd - 0.02;
    var doc0 = kbProp(layer, ["ADBE Text Properties", "ADBE Text Document"]).value;
    var txt = String(doc0.text);
    if (txt.indexOf("\r") >= 0 || txt.indexOf("\n") >= 0) throw new Error("recolor-swipe: только однострочный текст");
    if (to > txt.length) throw new Error("recolor-swipe: range [" + from + "," + to + ") за пределами строки длиной " + txt.length);
    var fit = tlStrokeFit(layer, { kind: "matte" });
    var em = fit.em;
    var meas = function (s) {
      return s === "" ? 0 : kbTextMeasure(comp, { text: s, font: doc0.font, size: em, tracking: doc0.tracking || 0 }).width;
    };
    var word = txt.substring(from, to);
    var pre = txt.substring(0, to);
    var before = txt.substring(0, from).replace(/\s+$/, "");
    var after = txt.substring(to).replace(/^\s+/, "");
    var whole = txt.replace(/\s+$/, "");
    var wPre = meas(pre);
    var wWord = meas(word);
    var wBefore = meas(before);
    var wAfter = meas(after);
    var wWhole = meas(whole);
    var wordL = fit.inkL + (wPre - wWord);
    var wordR = fit.inkL + wPre;
    var g1 = before === "" ? 2 * fit.eL : (wPre - wWord - wBefore);
    var g2 = after === "" ? 2 * fit.eR : ((wWhole - wAfter) - wPre);
    var L = wordL - g1 / 2 + fit.eL;
    var R = wordR + g2 / 2 - fit.eR;
    var width = R - L;
    if (width < 4) throw new Error("recolor-swipe: маска уже 4 px (width " + width.toFixed(1) + ")");
    var mask = kbHandMarker(comp, { x: (L + R) / 2, y: fit.y, width: width, thickness: fit.thickness, color: [1, 1, 1], start: plan.start, duration: T / 30,
      seed: o.seed, tilt: fit.tilt, cut: fit.cut, wobble: 2, rough: fit.rough, fade: 0, head: 0, name: layer.name + " recolor-mask" });
    mask.blendingMode = BlendingMode.NORMAL;
    mask.motionBlur = false; // край маски = край мазка: смаз по Trim End размывает его в облако шириной в ход кадра (97 px/к.)
    var fxs = kbGroup(mask, ["ADBE Effect Parade"]);
    for (var fi = fxs.numProperties; fi >= 1; fi--) if (fxs.property(fi).matchName === "ADBE Fractal Noise") fxs.property(fi).remove(); // ae-ok: matchname — разводы дают альфу < 100 %
    tlRetrim(mask, plan.start, T, "snap");
    // дубль: после hold-alive (выражения копируются), заливка всего текста в color, прямо над оригиналом
    var dup = /** @type {TextLayer} */ (layer.duplicate());
    dup.name = layer.name + " recolor";
    var dsrc = kbProp(dup, ["ADBE Text Properties", "ADBE Text Document"]);
    var dd = dsrc.value;
    dd.fillColor = /** @type {any} */ (color);
    dsrc.setValue(dd);
    if (o.font) { var dd2 = dsrc.value; dd2.font = o.font; dsrc.setValue(dd2); }
    // wiggle у дубля даёт другой шум, чем у оригинала (шум привязан к свойству слоя; зонд R4): поворот дубля берём у оригинала
    kbProp(dup, ["ADBE Transform Group", "ADBE Rotate Z"]).expression = 'thisComp.layer("' + layer.name.replace(/"/g, '\\"') + '").transform.rotation;';
    dup.inPoint = plan.start;
    dup.outPoint = tEnd;
    mask.inPoint = plan.start;
    mask.outPoint = tEnd;
    mask.moveBefore(dup);
    dup.setTrackMatte(mask, TrackMatteType.ALPHA);
    // маска едет с оригиналом (его hold-alive): позиция в слое родителя считается вручную, слово в покое
    var wa = kbProp(layer, ["ADBE Transform Group", "ADBE Anchor Point"]).value;
    var wp = kbProp(layer, ["ADBE Transform Group", "ADBE Position"]).value;
    mask.parent = layer;
    kbProp(mask, ["ADBE Transform Group", "ADBE Position"]).setValue([(L + R) / 2 + wa[0] - wp[0], fit.y + wa[1] - wp[1]]);
    tlRestyleRange(/** @type {TextLayer} */ (layer), tStep, from, to, color, o.font || undefined);
    kbLog("RECOLOR swipe range [" + from + "," + to + ") «" + word + "» wordInk " + wordL.toFixed(1) + "–" + wordR.toFixed(1) + " g1 " + g1.toFixed(1) + " g2 " + g2.toFixed(1) +
      " e " + fit.eL.toFixed(1) + " mask L " + L.toFixed(1) + " R " + R.toFixed(1) + " width " + width.toFixed(1) + " ink " + (L - fit.eL).toFixed(1) + "–" + (R + fit.eR).toFixed(1) +
      " thick " + fit.thickness.toFixed(1) + " y " + fit.y.toFixed(1) + " trim f" + (plan.start * 30).toFixed(1) + "–" + (plan.hit * 30).toFixed(1) +
      " step t " + tStep.toFixed(4) + " (f" + (tStep * 30).toFixed(2) + ") out f" + (tEnd * 30).toFixed(2) + " line " + wWhole.toFixed(1) + " vs rect " + (fit.inkR - fit.inkL).toFixed(1));
  }
};

/**
 * №20 strike-out — неверная форма перечёркивается кораллом, бледнеет и оседает (stream2/spec.md §5.10, §3.4).
 * Фазы (кадры от start): 0–6 дрожь слова по x на двойках TL_TWOS (+2,5 / −2,5 / +1,5 px, с 6 — 0; выражение на Position, окно);
 * 6–15 штрих (tlStrokeFit kind strike, kbHandMarker цвет palette.error, режим NORMAL, 100 %, 9 к. кривая punch, tilt −2, head 0, без глазури,
 * ребёнок слова); 14–22 слово бледнеет до rest (0,35 по восприятию: paper-fade, release) и оседает на drop px (ключи Position, release).
 * Штрих держит 100 % и едет вниз вместе со словом (родитель). out (с, конец выхода слова): непрозрачность штриха 100 → 0 за 5 к. release (ключи на штрихе).
 * Без shake штрих стартует с к. 0, бледнение — с к. 8. В стиле lesson штриха нет: paper-fade(rest) + recolor-swipe(color error, step) на кадре начала штриха.
 * start = первый кадр дрожи (или штриха); hit = start + (дрожь + 9) к.; end = start + (дрожь + 16) к.; при at: hit = at − lead.
 * Звук marker@1 ставит сам run на первый кадр штриха (раннер ставит sfx.at только на start или hit, а здесь start — начало дрожи).
 * Параметры: shake (true), color (palette.error), rest (0,35), drop (12 px), seed, out.
 */
TL_MOVES["strike-out"] = {
  group: "text-accent", slot: "accent", units: [], unit: "word",
  frames: { shake: 6, draw: 9, wait: 8, fade: 8 }, stagger: {}, over: 0, lead: 2, sfx: null,
  params: { shake: true, color: null, rest: 0.35, drop: 12, seed: 20, out: undefined, strength: 1 }, // seed 20: перебор 1–40 в боевой ячейке 20 (scan-strike-seed): центр на к. 17 в ±3, покрытие без дыр
  plan: function (layer, o, S) {
    if (!(layer instanceof TextLayer)) throw new Error("strike-out: только текстовый слой");
    var F = TL_MOVES["strike-out"].frames;
    var off = o.shake ? 2 * Math.round(F.shake / 2 * S.dur) : 0; // дрожь целыми двойками
    var draw = F.draw * S.dur;
    var wait = Math.round(F.wait * S.dur);
    var fade = Math.max(2, Math.round(F.fade * S.dur));
    var start;
    if (o.at !== undefined && o.start === undefined) start = o.at - TL_MOVES["strike-out"].lead / 30 - (off + draw) / 30;
    else if (o.start !== undefined && o.at === undefined) start = o.start;
    else throw new Error("нужно ровно одно из at | start");
    start = Math.round(start * 30) / 30;
    var hit = start + (off + draw) / 30;
    var end = start + (off + wait + fade) / 30;
    return { n: 0, unit: "", starts: [], start: start, hit: hit, end: end, total: off + wait + fade, unitFr: draw, staggerFr: 0, off: off, wait: wait, fade: fade };
  },
  run: function (layer, o, S, plan) {
    var pal = S.palette || {};
    var color = o.color || pal.error || KB_COLOR.coral;
    var comp = layer.containingComp;
    var str = o.strength * S.strength;
    var off = plan.off;
    var tStroke = plan.start + off / 30;
    var tFade = tStroke + plan.wait / 30;
    var fadeT = plan.fade / 30;
    var lesson = S.name === "lesson";
    var txt = String(kbProp(layer, ["ADBE Text Properties", "ADBE Text Document"]).value.text);
    var fit = null;
    var band = null;
    if (!lesson) fit = tlStrokeFit(layer, { kind: "strike" }); // до аниматоров и выражений: слово в покое
    var wa = kbProp(layer, ["ADBE Transform Group", "ADBE Anchor Point"]).value;
    var wp = kbProp(layer, ["ADBE Transform Group", "ADBE Position"]).value;
    if (!lesson) {
      band = kbHandMarker(comp, { x: fit.x, y: fit.y, width: fit.width, thickness: fit.thickness, color: color, start: tStroke, duration: plan.unitFr / 30,
        seed: o.seed, tilt: fit.tilt, cut: fit.cut, wobble: 3, rough: fit.rough, fade: 0, head: 0, name: layer.name + " strike" });
      band.blendingMode = BlendingMode.NORMAL; // Multiply коралла на туши даёт тушь: на буквах линии не видно
      tlRetrim(band, tStroke, plan.unitFr, "punch");
      band.moveBefore(layer); // слой слова под рукой: штрих поверх букв (index меньше = выше)
      band.parent = layer;
      kbProp(band, ["ADBE Transform Group", "ADBE Position"]).setValue([fit.x + wa[0] - wp[0], fit.y + wa[1] - wp[1]]);
      if (typeof o.out === "number") {
        var fr = Math.max(2, Math.round(5 * S.dur));
        tlKeysEased(kbProp(band, ["ADBE Transform Group", "ADBE Opacity"]), [[o.out - fr / 30, 100], [o.out, 0, "release"]]);
        band.outPoint = o.out + 1 / 30;
      }
      tlSfxMarker(layer, tlCeilFrame(tStroke), "marker", 1 * (o.strength !== undefined ? o.strength : 1));
    }
    // оседание: ключи Position (release), дрожь добавляется выражением поверх
    var pos = kbProp(layer, ["ADBE Transform Group", "ADBE Position"]);
    var p0 = pos.value;
    var drop = o.drop * str;
    var p1 = p0.length > 2 ? [p0[0], p0[1] + drop, p0[2]] : [p0[0], p0[1] + drop];
    tlKeysEased(pos, [[tFade, p0], [tFade + fadeT, p1, "release"]]);
    if (o.shake) {
      var a = (2.5 * str).toFixed(3), b = (-2.5 * str).toFixed(3), c = (1.5 * str).toFixed(3);
      pos.expression = "var t0=" + plan.start.toFixed(5) + ";\n" + TL_TWOS +
        "var n=Math.floor((tq-t0)*15+0.001);var d=0;\nif(n==0)d=" + a + ";else if(n==1)d=" + b + ";else if(n==2)d=" + c + ";\n" +
        "(value.length==3)?[value[0]+d,value[1],value[2]]:[value[0]+d,value[1]];";
    }
    // бледнение: paper-fade напрямую (мимо подмен стиля brisk), rest по восприятию
    var pf = TL_MOVES["paper-fade"];
    var po = { rest: o.rest, from: 1, duration: plan.fade, ease: "release", start: tFade, strength: 1 };
    pf.run(layer, po, S, pf.plan(layer, po, S));
    if (lesson) {
      kbMove(layer, "recolor-swipe", { range: [0, txt.length], color: color, mode: "step", at: tStroke });
    }
    kbLog("STRIKE " + layer.name + (fit ? " inkL " + fit.inkL.toFixed(1) + " inkR " + fit.inkR.toFixed(1) + " width " + fit.width.toFixed(1) + " thickness " + fit.thickness.toFixed(2) +
      " y " + fit.y.toFixed(2) + " base " + fit.base.toFixed(1) : " (lesson: без штриха)") + " seed " + o.seed + " shake f" + Math.round(plan.start * 30) + "–" + Math.round(tStroke * 30) +
      " stroke f" + (tStroke * 30).toFixed(1) + "–" + (plan.hit * 30).toFixed(1) + " fade f" + Math.round(tFade * 30) + "–" + Math.round((tFade + fadeT) * 30) + " drop " + drop.toFixed(1));
  }
};

// Пресеты потока 2 (выход и акценты): paper-fade и помощник tlPerceptOpacity. Подключать после tl-move.jsx (реестр TL_MOVES).
// ES3, свойства только по matchName. Спека: stream2/spec.md §4.2, §5.2.

//@include "../core.jsx"
//@include "tl-ease.jsx"
//@include "tl-move.jsx"

/**
 * Непрозрачность слоя (%) по доле контраста c по CIE L* между бумагой #F4F1EA и тушью #111 (stream2/spec.md §4.2).
 * Проект смешивает в линейном свете, поэтому непрозрачность считается через яркость Y, а не равна c.
 * @param {number} c доля контраста 0…1
 * @returns {number}
 */
function tlPerceptOpacity(c) {
  var L = 95.18 - c * (95.18 - 4.66);
  var Y = L > 8 ? Math.pow((L + 16) / 116, 3) : L / 903.3;
  return (0.8805 - Y) / (0.8805 - 0.00516) * 100;
}

/** Та же функция строкой для выражений. */
var TL_EXPR_PERCEPT =
  "function po(c){var L=95.18-c*(95.18-4.66);var Y=(L>8)?Math.pow((L+16)/116,3):L/903.3;return (0.8805-Y)/(0.8805-0.00516)*100;}\n";

/** Ступени paper-fade по слоям: ключ «id композиции|имя слоя» → [{t0, T, from, rest, x1, x2, lin}]. Лестница = несколько ступеней на одном слое. */
/** @type {{[key: string]: any[]}} */
var TL_FADES = {};

/**
 * №8 paper-fade — текст бледнеет к бумаге без движения (stream2/spec.md §5.2).
 * Параметры: rest (доля контраста, по умолчанию 0), from (с какой доли начинается, по умолчанию 1), duration 12 к., ease soft.
 * Слой стоит, меняется только ADBE Opacity выражением: c(u) = from − (from − rest)·ease(u), непрозрачность = tlPerceptOpacity(c).
 * Несколько вызовов на одном слое (лестница 1 → 0,55 → 0,30) складываются в одно выражение: ступени идут по порядку, до первой держится from.
 * hit = end = start + T. sfx нет. С out:true слой гаснет (outPoint = end + 1 к.), иначе живёт дальше.
 */
TL_MOVES["paper-fade"] = {
  group: "text-out", slot: "out", units: [], unit: "word",
  frames: { total: 12 }, stagger: {}, over: 0, lead: 0, sfx: null,
  params: { rest: 0, from: 1, duration: 12, ease: "soft", strength: 1 },
  plan: function (layer, o, S) {
    var T = Math.max(1, Math.round(o.duration * S.dur));
    var start;
    if (o.at !== undefined && o.start === undefined) start = o.at - T / 30; // at = конец ступени
    else if (o.start !== undefined && o.at === undefined) start = o.start;
    else throw new Error("нужно ровно одно из at | start");
    start = Math.round(start * 30) / 30;
    var end = start + T / 30;
    return { n: 0, unit: "", starts: [], start: start, hit: end, end: end, total: T, unitFr: T, staggerFr: 0 };
  },
  run: function (layer, o, S, plan) {
    var key = layer.containingComp.id + "|" + layer.name;
    if (!TL_FADES[key]) TL_FADES[key] = [];
    var e = tlEase(o.ease);
    var stages = TL_FADES[key];
    stages.push({ t0: plan.start, T: plan.unitFr / 30, from: o.from, rest: o.rest, x1: e.x1, x2: e.x2, lin: e.linear ? 1 : 0 });
    var st = [];
    for (var i = 0; i < stages.length; i++) {
      var g = stages[i];
      st.push("[" + g.t0.toFixed(5) + "," + g.T.toFixed(5) + "," + g.from.toFixed(4) + "," + g.rest.toFixed(4) + "," + g.x1 + "," + g.x2 + "," + g.lin + "]");
    }
    var expr = TL_EXPR_BZ + TL_EXPR_PERCEPT +
      "var ST=[" + st.join(",") + "];\n" +
      "var c=ST[0][2];\n" +
      "for(var i=0;i<ST.length;i++){var g=ST[i];if(time>=g[0]){var u=Math.min(1,(time-g[0])/g[1]);var q=g[6]?u:bz(u,g[4],g[5]);c=g[2]-(g[2]-g[3])*q;}}\n" +
      "po(c);";
    kbProp(layer, ["ADBE Transform Group", "ADBE Opacity"]).expression = expr; // ae-ok: matchname
    if (o.out) layer.outPoint = plan.end + 1 / 30;
    kbLog("FADE " + layer.name + " c " + o.from + "→" + o.rest + " op " + tlPerceptOpacity(o.from).toFixed(1) + "→" + tlPerceptOpacity(o.rest).toFixed(1) +
      " f " + Math.round(plan.start * 30) + "–" + Math.round(plan.end * 30));
  }
};

/**
 * Перенести якорь слоя в точку (координаты слоя), позицию сдвинуть так, чтобы кадр не сдвинулся (stream2/spec.md §4.3).
 * Вызывать до ключей и выражений трансформа; масштаб 100 и поворот 0 на момент вызова (иначе исключение).
 * @param {any} layer
 * @param {number[]} a [ax, ay]
 */
function tlSetAnchor(layer, a) {
  var anchor = kbProp(layer, ["ADBE Transform Group", "ADBE Anchor Point"]);
  var pos = kbProp(layer, ["ADBE Transform Group", "ADBE Position"]);
  var sc = kbProp(layer, ["ADBE Transform Group", "ADBE Scale"]);
  var rz = kbProp(layer, ["ADBE Transform Group", "ADBE Rotate Z"]);
  if (anchor.numKeys > 0 || pos.numKeys > 0 || anchor.expression !== "" || pos.expression !== "") throw new Error("tlSetAnchor: на «" + layer.name + "» уже есть ключи или выражения якоря/позиции");
  var s = sc.value;
  if (Math.abs(s[0] - 100) > 1e-9 || Math.abs(s[1] - 100) > 1e-9 || Math.abs(rz.value) > 1e-9) throw new Error("tlSetAnchor: «" + layer.name + "» не в покое (масштаб 100, поворот 0)");
  var old = anchor.value;
  var p = pos.value;
  var before = layer.sourceRectAtTime(0, false);
  anchor.setValue(a.length > 2 ? a : [a[0], a[1], old.length > 2 ? old[2] : 0].slice(0, old.length));
  pos.setValue(p.length > 2 ? [p[0] + a[0] - old[0], p[1] + a[1] - old[1], p[2]] : [p[0] + a[0] - old[0], p[1] + a[1] - old[1]]);
  var np = pos.value;
  var shift = Math.abs((np[0] - a[0]) - (p[0] - old[0])) + Math.abs((np[1] - a[1]) - (p[1] - old[1]));
  kbLog("ANCHOR " + layer.name + " [" + a[0].toFixed(1) + ", " + a[1].toFixed(1) + "] shift " + shift.toFixed(2) + " rect " + before.left.toFixed(1) + "," + before.top.toFixed(1));
}

/**
 * №10 slot-pulse — пустой слот «дышит», ждёт ответа (stream2/spec.md §5.4).
 * s = value × (1 + 0,015·amount·(1 − cos(2π·1,2·(tq − t0)))·k): 100 ↔ 103 %, 1,2 Гц (период 25 к.), на двойках TL_TWOS,
 * огибающая k = clamp((tq − t0)/0,2)·clamp((t1 − tq)/0,2); вне окна [t0, t1] ровно value. Тени у слота нет.
 * Якорь в центре чернил слота: по умолчанию центр рамки, либо o.anchor = [ax, ay] (координаты слоя; тогда tlSetAnchor).
 * Параметры: t0, t1 (синонимы from, to) — окно в секундах; amount (1). start = t0, hit = end = t1. sfx нет.
 */
TL_MOVES["slot-pulse"] = {
  group: "text-loop", slot: "loop", units: [], unit: "word",
  frames: {}, stagger: {}, over: 0, lead: 0, sfx: null,
  params: { amount: 1, strength: 1 },
  plan: function (layer, o, S) {
    var from = o.t0 !== undefined ? o.t0 : o.from;
    var to = o.t1 !== undefined ? o.t1 : o.to;
    if (from === undefined || to === undefined) throw new Error("slot-pulse: нужны t0 и t1 (или from и to), окно в секундах");
    if (!(to > from)) throw new Error("slot-pulse: t1 должен быть больше t0");
    return { n: 0, unit: "", starts: [], start: from, hit: to, end: to, total: Math.round((to - from) * 30), unitFr: 0, staggerFr: 0 };
  },
  run: function (layer, o, S, plan) {
    if (o.anchor) tlSetAnchor(layer, o.anchor);
    var amp = 0.015 * o.amount * o.strength * S.strength;
    var sc = kbProp(layer, ["ADBE Transform Group", "ADBE Scale"]);
    sc.expression = "var t0=" + plan.start.toFixed(5) + ",t1=" + plan.end.toFixed(5) + ";\n" + TL_TWOS +
      "var k=Math.min(1,Math.max(0,(tq-t0)/0.2))*Math.min(1,Math.max(0,(t1-tq)/0.2));\n" +
      "if(time<t0||time>t1){value;}else{var m=1+" + amp.toFixed(5) + "*(1-Math.cos(2*Math.PI*1.2*(tq-t0)))*k;" +
      "var s=value;(s.length==3)?[s[0]*m,s[1]*m,s[2]]:[s[0]*m,s[1]*m];}";
    kbLog("SLOT " + layer.name + " pulse f " + Math.round(plan.start * 30) + "–" + Math.round(plan.end * 30) + " amount " + o.amount + " peak " + (100 * (1 + 2 * amp)).toFixed(2));
  }
};

/**
 * Ключи с кривой на каждый отрезок (кривая приходит в ключ слева). Скорость в ключах 0, влияние из TL_EASE: те же безье, что у tlBz.
 * @param {Property} prop
 * @param {any[][]} keys [время с, значение, кривая отрезка к этому ключу (имя) | пусто]
 */
function tlKeysEased(prop, keys) {
  var i;
  for (i = 0; i < keys.length; i++) prop.setValueAtTime(keys[i][0], keys[i][1]);
  var dims = prop.propertyValueType === PropertyValueType.ThreeD ? 3 : (prop.propertyValueType === PropertyValueType.TwoD ? 2 : 1);
  for (i = 0; i < keys.length; i++) {
    var inf = (i > 0 && keys[i][2]) ? TL_EASE[keys[i][2]].into : 50; // влияние входа в ключ — кривая пришедшего отрезка
    var outf = (i < keys.length - 1 && keys[i + 1][2]) ? TL_EASE[keys[i + 1][2]].out : 50; // выхода — кривая уходящего
    var ein = [];
    var eout = [];
    for (var d = 0; d < dims; d++) { ein.push(new KeyframeEase(0, inf)); eout.push(new KeyframeEase(0, outf)); }
    prop.setTemporalEaseAtKey(i + 1, /** @type {any} */ (ein), /** @type {any} */ (eout));
  }
}

/**
 * №11 punch — слово коротко отбивает такт (stream2/spec.md §5.5). Ключи на ADBE Scale трансформа слоя (не аниматор:
 * Anchor Point Grouping текста один на слой). hold-alive умножает value, поэтому ключи под ним работают.
 * amount: soft 0 → 100, 2 → 103, 6 → 100 (punch, snap); medium 0 → 100, 3 → 106, 10 → 100; strong 0 → 100, 2 → 92 (soft), 5 → 104 (punch), 12 → 100 (snap).
 * Амплитуда = min(def × strength × S.strength, S.overCap > 0 ? S.overCap : 0,02); антиципация strong −8 % × тот же множитель.
 * anchor: center — (центр рамки по x, base − 0,5·cap); junction — (левый край рамки слоя, base): окончание растёт от основы.
 * Якорь ставится tlSetAnchor до ключей: вызывать до hold-alive и до аниматоров позиции. sfx: soft нет, medium/strong tick@0,8 на hit.
 * hit = start + кадр пика, end = start + последний ключ. Удар на at − lead.
 */
TL_MOVES["punch"] = {
  group: "text-accent", slot: "accent", units: [], unit: "word",
  frames: { soft: [2, 6], medium: [3, 10], strong: [2, 5, 12] }, stagger: {},
  over: 0.06, lead: 2, sfx: null,
  params: { amount: "medium", anchor: "center", strength: 1 },
  // def по силам: амплитуда, ключи (кадр, кривая отрезка), антиципация
  table: {
    soft: { amp: 0.03, keys: [[2, "punch"], [6, "snap"]], peak: 0 },
    medium: { amp: 0.06, keys: [[3, "punch"], [10, "snap"]], peak: 0 },
    strong: { amp: 0.04, keys: [[2, "soft"], [5, "punch"], [12, "snap"]], dip: 0.08, peak: 1 }
  },
  plan: function (layer, o, S) {
    var d = TL_MOVES["punch"].table[o.amount];
    if (!d) throw new Error("punch: amount «" + o.amount + "» — нужен soft, medium или strong");
    if (o.anchor !== "center" && o.anchor !== "junction") throw new Error("punch: anchor «" + o.anchor + "» — нужен center или junction");
    var fr = [];
    var prev = 0;
    for (var i = 0; i < d.keys.length; i++) {
      var f = Math.max(prev + 1, Math.round(d.keys[i][0] * S.dur));
      fr.push(f);
      prev = f;
    }
    var peakFr = fr[d.peak];
    var lastFr = fr[fr.length - 1];
    var start;
    if (o.at !== undefined && o.start === undefined) start = o.at - TL_MOVES["punch"].lead / 30 - peakFr / 30;
    else if (o.start !== undefined && o.at === undefined) start = o.start;
    else throw new Error("нужно ровно одно из at | start");
    start = Math.round(start * 30) / 30;
    TL_MOVES["punch"].sfx = o.amount === "soft" ? null : { kind: "tick", strength: 0.8 }; // sfx зависит от силы: раннер читает def.sfx после run
    return { n: 0, unit: "", starts: [], start: start, hit: start + peakFr / 30, end: start + lastFr / 30, total: lastFr, unitFr: lastFr, staggerFr: 0, fr: fr };
  },
  run: function (layer, o, S, plan) {
    var d = TL_MOVES["punch"].table[o.amount];
    var mult = o.strength * S.strength;
    var cap = S.overCap > 0 ? S.overCap : 0.02;
    var amp = Math.min(d.amp * mult, cap);
    var em = tlFontSize(layer);
    var rect = layer.sourceRectAtTime(0, false);
    var a = o.anchor === "center"
      ? [rect.left + rect.width / 2, -0.5 * (S.text && S.text.cap ? S.text.cap : 0.72) * em]
      : [rect.left, 0];
    tlSetAnchor(layer, a);
    var sc = kbProp(layer, ["ADBE Transform Group", "ADBE Scale"]);
    var z = sc.value.length > 2;
    var keys = [[plan.start, 100]];
    var vals = [];
    for (var i = 0; i < d.keys.length; i++) {
      var isPeak = i === d.peak;
      var v = isPeak ? 100 + amp * 100 : (i === d.keys.length - 1 ? 100 : 100 - d.dip * mult * 100);
      keys.push([plan.start + plan.fr[i] / 30, v, d.keys[i][1]]);
    }
    for (var j = 0; j < keys.length; j++) keys[j][1] = z ? [keys[j][1], keys[j][1], 100] : [keys[j][1], keys[j][1]];
    tlKeysEased(sc, keys);
    kbLog("PUNCH " + layer.name + " " + o.amount + " peak " + (100 + amp * 100).toFixed(2) + " anchor " + o.anchor +
      " f " + Math.round(plan.start * 30) + "/" + Math.round(plan.hit * 30) + "/" + Math.round(plan.end * 30));
  }
};

/**
 * Слово из двух слоёв: основа (text[0, cut)) с правой выключкой и окончание (text[cut…)) с левой (stream2/spec.md §4.4).
 * Замер kbTextMeasure: целое W, основа Ws, окончание Wf; gap = W − Ws − Wf (кернинг и поля стыка).
 * Правый край основы = xJoin − gap/2, левый край окончания = xJoin + gap/2, базовая линия общая.
 * Журнал: SPLIT <имя> W Ws Wf gap err, err = (правый край окончания − левый край основы) − W по рамкам поставленных слоёв; |err| ≤ 2 px.
 * @param {CompItem} comp
 * @param {{text: string, cut: number, font: string, size: number, colors: {stem: number[], suffix: number[]}, xJoin: number, baseline: number, name?: string}} o
 * @returns {{stem: TextLayer, suffix: TextLayer, W: number, Ws: number, Wf: number, gap: number, xJoin: number}}
 */
function tlSplitWord(comp, o) {
  var name = o.name || o.text;
  var stemText = o.text.substr(0, o.cut);
  var sufText = o.text.substr(o.cut);
  if (o.cut <= 0 || sufText === "") throw new Error("tlSplitWord «" + name + "»: cut " + o.cut + " вне слова");
  var W = kbTextMeasure(comp, { text: o.text, font: o.font, size: o.size }).width;
  var Ws = kbTextMeasure(comp, { text: stemText, font: o.font, size: o.size }).width;
  var Wf = kbTextMeasure(comp, { text: sufText, font: o.font, size: o.size }).width;
  var gap = W - Ws - Wf;
  var stem = tlTextAt(comp, { text: stemText, font: o.font, size: o.size, color: /** @type {any} */ (o.colors.stem), x: o.xJoin - gap / 2 - Ws / 2, baseline: o.baseline, name: name + " stem" });
  var suffix = tlTextAt(comp, { text: sufText, font: o.font, size: o.size, color: /** @type {any} */ (o.colors.suffix), x: o.xJoin + gap / 2 + Wf / 2, baseline: o.baseline, name: name + " suffix" });
  var rs = stem.sourceRectAtTime(0, false);
  var rf = suffix.sourceRectAtTime(0, false);
  var left = kbProp(stem, ["ADBE Transform Group", "ADBE Position"]).value[0] - rs.width / 2;
  var right = kbProp(suffix, ["ADBE Transform Group", "ADBE Position"]).value[0] + rf.width / 2;
  var err = (right - left) - W;
  kbLog("SPLIT " + name + " W " + W.toFixed(1) + " Ws " + Ws.toFixed(1) + " Wf " + Wf.toFixed(1) + " gap " + gap.toFixed(2) + " err " + err.toFixed(2) + " join " + o.xJoin.toFixed(1));
  if (Math.abs(err) > 2) throw new Error("tlSplitWord «" + name + "»: err " + err.toFixed(2) + " px > 2");
  return { stem: stem, suffix: suffix, W: W, Ws: Ws, Wf: Wf, gap: gap, xJoin: o.xJoin };
}

/**
 * Пары «основа|окончание» столбцом с общим стыком (stream2/spec.md §4.5): xc = x − (max Wf − max Ws)/2,
 * блок от xc − max Ws до xc + max Wf стоит по центру x. Каждая пара — tlSplitWord с xJoin = xc.
 * pair: {text, cut, colors: {stem, suffix}, name?}; baselines — по одной на пару.
 * @param {CompItem} comp
 * @param {{text: string, cut: number, colors: {stem: number[], suffix: number[]}, name?: string}[]} pairs
 * @param {{font: string, size: number, x?: number, baselines: number[]}} o
 * @returns {{xc: number, words: any[], left: number, right: number}}
 */
function tlFitPair(comp, pairs, o) {
  var x = o.x === undefined ? 540 : o.x;
  var maxWs = 0;
  var maxWf = 0;
  var i;
  for (i = 0; i < pairs.length; i++) {
    var ws = kbTextMeasure(comp, { text: pairs[i].text.substr(0, pairs[i].cut), font: o.font, size: o.size }).width;
    var wf = kbTextMeasure(comp, { text: pairs[i].text.substr(pairs[i].cut), font: o.font, size: o.size }).width;
    if (ws > maxWs) maxWs = ws;
    if (wf > maxWf) maxWf = wf;
  }
  var xc = x - (maxWf - maxWs) / 2;
  var words = [];
  var left = 1e9;
  var right = -1e9;
  for (i = 0; i < pairs.length; i++) {
    var w = tlSplitWord(comp, { text: pairs[i].text, cut: pairs[i].cut, font: o.font, size: o.size, colors: pairs[i].colors, xJoin: xc, baseline: o.baselines[i], name: pairs[i].name });
    words.push(w);
    left = Math.min(left, xc - w.gap / 2 - w.Ws);
    right = Math.max(right, xc + w.gap / 2 + w.Wf);
  }
  kbLog("PAIR xc " + xc.toFixed(1) + " left " + left.toFixed(1) + " right " + right.toFixed(1) + " width " + (right - left).toFixed(1));
  if (right - left > 840.5) throw new Error("tlFitPair: ширина блока " + (right - left).toFixed(1) + " > 840");
  return { xc: xc, words: words, left: left, right: right };
}

/**
 * №12 suffix-beat — окончание бьёт на своём слоге, основа стоит (stream2/spec.md §5.6).
 * Слой окончания из tlSplitWord. Масштаб слоя, якорь junction (левый край рамки окончания, базовая линия). По умолчанию dip:true (решение владельца 15.10):
 * 0 → 100, 2 → 96 (soft), 5 → 108 (punch), 10 → 100 (snap), hit = start + 5, end = start + 10. С dip:false (прежний удар): 0 → 100, 3 → 108 (punch),
 * 8 → 100 (snap), hit = start + 3, end = start + 8.
 * Амплитуда = min(0,08 × strength × S.strength, S.hitCap > 0 ? S.hitCap : 0,02) — один из двух «ударов ролика».
 * sfx tick (сила 1) на hit. echo (false): Echo не видит трансформ слоя, поэтому при echo:true масштаб идёт аниматором suffix-scale
 * (Scale 3D, Expression Selector, Based On 4, Grouping 4 «всё», Align по x — левый край) + kbEcho с окном [start + 1 к., start + 9 к.], fade 0,1 с.
 * dip (true по умолчанию; решение владельца 15.10 — утверждён): антиципация как у punch strong; размах 12 % при том же потолке hitCap
 * (провал вниз в потолок перелёта не входит). dip:false — прежний удар без провала. Удар на at − lead.
 */
TL_MOVES["suffix-beat"] = {
  group: "text-accent", slot: "accent", units: [], unit: "word",
  frames: { punch: 3, snap: 8 }, stagger: {},
  over: 0.08, lead: 2, sfx: { kind: "tick", strength: 1 },
  params: { echo: false, dip: true, strength: 1 }, // dip:true по умолчанию — решение владельца 15.10
  // dip: кадры (провал, пик, конец) и глубина провала — по образцу punch strong (решение владельца 15.10 — утверждён, по умолчанию)
  dipTable: { frames: [2, 5, 10], depth: 0.04 },
  plan: function (layer, o, S) {
    var dt = TL_MOVES["suffix-beat"].dipTable;
    var dipFr = 0;
    var peakFr, lastFr;
    if (o.dip) {
      dipFr = Math.max(1, Math.round(dt.frames[0] * S.dur));
      peakFr = Math.max(dipFr + 1, Math.round(dt.frames[1] * S.dur));
      lastFr = Math.max(peakFr + 1, Math.round(dt.frames[2] * S.dur));
    } else {
      peakFr = Math.max(1, Math.round(3 * S.dur));
      lastFr = Math.max(peakFr + 1, Math.round(8 * S.dur));
    }
    var start;
    if (o.at !== undefined && o.start === undefined) start = o.at - TL_MOVES["suffix-beat"].lead / 30 - peakFr / 30;
    else if (o.start !== undefined && o.at === undefined) start = o.start;
    else throw new Error("нужно ровно одно из at | start");
    start = Math.round(start * 30) / 30;
    return { n: 0, unit: "", starts: [], start: start, hit: start + peakFr / 30, end: start + lastFr / 30, total: lastFr, unitFr: lastFr, staggerFr: 0, peakFr: peakFr, lastFr: lastFr, dipFr: dipFr };
  },
  run: function (layer, o, S, plan) {
    var amp = Math.min(0.08 * o.strength * S.strength, S.hitCap > 0 ? S.hitCap : 0.02);
    var peak = 100 + amp * 100;
    var low = 100 - TL_MOVES["suffix-beat"].dipTable.depth * o.strength * S.strength * 100;
    // ключи в кадрах от старта: [кадр, значение, кривая отрезка]
    var rk = o.dip ? [[0, 100], [plan.dipFr, low, "soft"], [plan.peakFr, peak, "punch"], [plan.lastFr, 100, "snap"]]
      : [[0, 100], [plan.peakFr, peak, "punch"], [plan.lastFr, 100, "snap"]];
    var rect = layer.sourceRectAtTime(0, false);
    if (o.echo) {
      if (typeof kbEcho === "undefined") throw new Error("suffix-beat echo: нужен kit/show-a.jsx (kbEcho)");
      var anim = kbGroup(layer, ["ADBE Text Properties", "ADBE Text Animators"]);
      if (anim.numProperties > 0) throw new Error("suffix-beat echo: на слое уже аниматоры");
      // зонд probe-suffix-align: при Grouping 4 выравнивание — проценты половины рамки: x −100 = левый край, y +100 = низ рамки, 0 = центр.
      // Якорь junction (левый край, базовая линия 0): y = (0 − центр рамки по y) / (h/2) × 100.
      var alignY = (0 - (rect.top + rect.height / 2)) / (rect.height / 2) * 100;
      tlAnimator(layer, { name: "suffix-scale", basedOn: 4, grouping: 4, lock: true, align: [-100, alignY], prop: "ADBE Text Scale 3D", fullValue: [peak, peak, 100], rest: 100, span: peak - 100,
        starts: [plan.start], keys: rk });
      kbEcho(layer, { windows: [{ from: plan.start + 1 / 30, to: plan.start + (o.dip ? plan.lastFr + 1 : 9) / 30, fade: 0.1 }] });
    } else {
      tlSetAnchor(layer, [rect.left, 0]);
      var sc = kbProp(layer, ["ADBE Transform Group", "ADBE Scale"]);
      var z = sc.value.length > 2;
      var raw = [];
      for (var j = 0; j < rk.length; j++) {
        var v = z ? [rk[j][1], rk[j][1], 100] : [rk[j][1], rk[j][1]];
        raw.push(rk[j].length > 2 ? [plan.start + rk[j][0] / 30, v, rk[j][2]] : [plan.start + rk[j][0] / 30, v]);
      }
      tlKeysEased(sc, raw);
    }
    kbLog("SUFFIX " + layer.name + " peak " + peak.toFixed(2) + (o.dip ? " dip " + low.toFixed(2) + " f" + Math.round(plan.start * 30 + plan.dipFr) : "") + (o.echo ? " echo" : "") + " f " + Math.round(plan.start * 30) + "/" + Math.round(plan.hit * 30) + "/" + Math.round(plan.end * 30));
  }
};

/**
 * №19 letter-wave — по единицам текста (строка / слово / буква) пробегает волна вверх и обратно (stream2/spec.md §5.9).
 * Аниматор wave-pos (ADBE Text Position 3D, Expression Selector, tlAnimator): ключи единицы [0, 0], [4, −0,14·em, soft], [8, 0, soft];
 * −21 px при кегле 150. Ключи монотонны на половинах, перелёта ниже базовой нет. Стаггер: line 80 мс = 2,4 к., char 30 мс = 0,9 к.
 * (word 50 мс — наше значение, в спеке его нет); linear, дробный (fracStagger). Grouping по unit (строка 3 / слово 2 / буква 1), Align [0, 0].
 * hit = пик последней единицы = start + O + 4, end = start + O + 8. С at: start = at − (O + 4) к. (hit = at). sfx нет.
 * Параметры: unit (line), stagger (мс), stagger_ease (linear), order, strength.
 */
TL_MOVES["letter-wave"] = {
  group: "text-accent", slot: "accent", units: ["char", "word", "line"], unit: "line",
  frames: { peak: 4, total: 8 }, stagger: { "char": 30, word: 50, line: 80 },
  over: 0, lead: 0, sfx: null, fracStagger: true, staggerEase: "linear", // дробные смещения: 0,9 к. и 2,4 к. без Math.round (cascade-fix.md)
  params: { unit: "line", stagger_ease: "linear", strength: 1 },
  plan: function (layer, o, S) {
    var half = Math.max(2, Math.round(4 * S.dur));
    var o2 = {};
    for (var key in o) o2[key] = o[key];
    delete o2.at;
    o2.start = 0; // старт ставим сами: at относится к пику последней единицы, а не к концу
    var p = /** @type {any} */ (tlPlan(layer, o2, S, TL_MOVES["letter-wave"], 2 * half, false));
    var maxOff = p.total - p.unitFr;
    var start;
    if (o.at !== undefined && o.start === undefined) start = o.at - (maxOff + half) / 30;
    else if (o.start !== undefined && o.at === undefined) start = o.start;
    else throw new Error("нужно ровно одно из at | start");
    start = Math.round(start * 30) / 30;
    var starts = [];
    for (var i = 0; i < p.starts.length; i++) starts.push(start + p.starts[i] * 1); // p.starts при start 0 — смещения в секундах
    p.starts = starts;
    p.start = start;
    p.hit = start + (maxOff + half) / 30;
    p.end = start + (maxOff + 2 * half) / 30;
    p.half = half;
    return p;
  },
  run: function (layer, o, S, plan) {
    var em = tlFontSize(layer);
    var amp = o.strength * S.strength;
    var basedOn = plan.unit === "char" ? 2 : (plan.unit === "word" ? 3 : 4);
    var grouping = plan.unit === "char" ? 1 : (plan.unit === "word" ? 2 : 3);
    var rise = 0.14 * em * amp;
    tlAnimator(layer, { name: "wave-pos", basedOn: basedOn, grouping: grouping, align: [0, 0], prop: "ADBE Text Position 3D",
      fullValue: [0, -rise, 0], rest: 0, span: -rise,
      starts: plan.starts, keys: [[0, 0], [plan.half, -rise, "soft"], [2 * plan.half, 0, "soft"]] });
    kbLog("WAVE " + layer.name + " " + plan.unit + " rise " + rise.toFixed(2) + " px f " + Math.round(plan.start * 30) + "/" + Math.round(plan.hit * 30) + "/" + Math.round(plan.end * 30));
  }
};

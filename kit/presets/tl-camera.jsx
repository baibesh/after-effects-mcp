// Поток 6 (переходы и камера): камера-пустышка tlCamRig (лист + сцены-прекомпозиции едут вместе), оси pan / tilt / roll / zoom, пресеты
// №29 cam-push (push / micro / cut), №30 shake-hit, №31 whip-paper, +1 iris-hand (stream6/spec.md §4–6).
// Подключать ПОСЛЕ tl-ease, tl-move, tl-accent, tl-hand, tl-type, tl-voice, tl-mark, tl-caption, tl-plate (порядок spec §1): файл сам подключает только
// кит без состояния — повторный include lib/*.jsx обнулил бы реестр TL_MOVES. Всё из tl-*.jsx (tlBz, TL_EASE, TL_S, tlSfxMarker, tlmInk, tlHandPath, …)
// берётся по имени в момент вызова. ES3, свойства только по matchName. Подложек нет; свечений нет: «вспышка бумаги» = кадры чистого листа.

//@include "../core.jsx"
//@include "../project.jsx"
//@include "../motion.jsx"
//@include "../look.jsx"
//@include "../show-final.jsx"

/** Данные камеры (spec §4.2). */
var TL_CAM = {
  margin: 60,                                     // поле листа за кадром, px с каждой стороны
  sheet: { seed: 1, contrast: 4, brightness: 46, scale: 2, complexity: 1, blend: 5 },  // набор kbHolePlane (kit/README §4)
  slow: 12,                                       // px/к — потолок «медленной камеры» в сейф-зоне
  mid: [12, 60], midMax: 3,                       // px/к — полоса «без смаза и не медленно»: ≤ 3 к. на сторону перехода
  safe: { l: 60, t: 200, r: 1020, b: 1600 },      // сейф-зона 9:16 (как потоки 3–5)
  zoomMax: 1.25, rollCap: { hand: 1, brisk: 1.5, lesson: 0, magazine: 0 },
  gap: 6,                                         // к.: тишина камеры между движениями и после посадки главного элемента
  push:  { zoom: 1.06, frames: 36, back: 12, ease: "soft", lead: 12 },
  micro: { zoom: 1.03, inFr: 6, inEase: "snap", backFr: 12, backEase: "soft", lead: 2 },
  cut:   { zA: 1.20, nA: 5, easeA: "release", paper: 2, zB: 1.12, nB: 6, easeB: "snap", lead: 2 },
  shake: { amount: 6, freq: 22, attack: 0.06, decay: 0.25, max: 2, gapFr: 30, sources: ["slam", "land", "stamp-in", "suffix-dock"] },
  whip:  { antic: 38, anticFr: 4, frames: 9, ease: { out: 72, into: 82, x1: 0.72, x2: 0.18 }, lead: 2 },
  iris:  { draw: 10, hold: 4, fade: 6, close: 10, paper: 2, open: 10, ease: "release", pad: [0.18, 0.26], thick: 0.12, seed: 11, tilt: 3, verts: 72, over: 1.03 },
  why: ["silence", "accent", "summary", "next-topic", "detail", "end-of-topic", "compare"],
  eps: 1 / 600,                                   // с: парные ключи смены опоры (t − eps, t)
  cutStyle: { hand: [5, 2, 6], brisk: [4, 1, 4], lesson: [5, 0, 6], magazine: [8, 2, 10] },   // nA, paper, nB по стилям (spec §6)
  pairs: {},                                      // comp.id:время → true: парные ключи смены опоры (tlCamBusy их не считает)
  scenes: {}                                      // comp.id → {cam, layer} (tlCamScene)
};

// ---------------------------------------------------------------------------------------------------------------------
// Низкий уровень: числа, ключи, преобразования
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Кадры из секунд: защита от плавающей точки (spec s4 M1).
 * @param {number} x
 * @returns {number}
 */
function tlkKf(x) {
  return Math.round(x * 1e6) / 1e6;
}

/**
 * Поворот точки на r градусов по часовой (как Rotation AE, y вниз).
 * @param {number[]} v
 * @param {number} r
 * @returns {number[]}
 */
function tlkRot(v, r) {
  var a = r * Math.PI / 180;
  var c = Math.cos(a);
  var s = Math.sin(a);
  return [v[0] * c - v[1] * s, v[0] * s + v[1] * c];
}

/**
 * Кривая по имени TL_EASE или объекту {out, into, x1, x2}.
 * @param {any} e
 * @returns {{out: number, into: number, x1: number, x2: number}}
 */
function tlkEaseOf(e) {
  if (typeof e === "string") {
    if (!TL_EASE[e] || TL_EASE[e].linear) throw new Error("tlkKeys: кривая «" + e + "» не годится для ключей камеры");
    return TL_EASE[e];
  }
  return e;
}

/**
 * Пространственным свойствам — прямой путь (spec §0, spec-check M2): auto-bezier и continuous off, касательные [0, 0].
 * @param {Property} prop
 */
function tlkSpatial(prop) {
  if (!prop.isSpatial) return;
  var dims = prop.value.length;
  var zero = dims > 2 ? [0, 0, 0] : [0, 0];
  for (var k = 1; k <= prop.numKeys; k++) {
    prop.setSpatialAutoBezierAtKey(k, false);
    prop.setSpatialContinuousAtKey(k, false);
    prop.setSpatialTangentsAtKey(k, /** @type {any} */ (zero), /** @type {any} */ (zero));
  }
}

/**
 * Ключи камеры: [время с, значение, кривая отрезка, пришедшего в этот ключ: имя TL_EASE | объект {out, into, x1, x2} | "hold" (ключ слева держит значение) | пусто].
 * Как tlKeysEased/tlpKeys, но с поиском индекса по времени (можно дописывать к ключам других пресетов) и с прямым путём на пространственных свойствах.
 * @param {Property} prop
 * @param {any[][]} keys
 * @param {string=} label имя для журнала KEYS
 */
function tlkKeys(prop, keys, label) {
  var n = keys.length;
  var i;
  for (i = 0; i < n; i++) prop.setValueAtTime(keys[i][0], keys[i][1]);
  var idx = [];
  for (i = 0; i < n; i++) idx.push(prop.nearestKeyIndex(keys[i][0]));
  var named = function (e) { return !!e && e !== "hold"; };
  for (i = 0; i < n; i++) {
    var arr = keys[i][2];
    var leave = i < n - 1 ? keys[i + 1][2] : undefined;
    if (!named(arr) && !named(leave)) continue;
    var ein = prop.keyInTemporalEase(idx[i]);
    var eout = prop.keyOutTemporalEase(idx[i]);
    for (var d = 0; d < ein.length; d++) {
      if (named(arr)) ein[d] = new KeyframeEase(0, tlkEaseOf(arr).into);
      if (named(leave)) eout[d] = new KeyframeEase(0, tlkEaseOf(leave).out);
    }
    prop.setTemporalEaseAtKey(idx[i], /** @type {any} */ (ein), /** @type {any} */ (eout));
  }
  for (i = 0; i < n - 1; i++) {
    if (keys[i + 1][2] === "hold") prop.setInterpolationTypeAtKey(idx[i], prop.keyInInterpolationType(idx[i]), KeyframeInterpolationType.HOLD);
  }
  if (prop.isSpatial) {
    tlkSpatial(prop);
    kbLog("KEYS " + (label || prop.name) + " n " + prop.numKeys + " spatial linear");
  }
}

/**
 * Значение кривой 0…1 (имя или объект) — обёртка над tlBz.
 * @param {number} u
 * @param {any} e
 * @returns {number}
 */
function tlkBz(u, e) {
  return tlBz(u, e);
}

// ---------------------------------------------------------------------------------------------------------------------
// Риг: tl-shake → tl-rig → tl-sheet (spec §4.3)
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Слайдер lnZ рига.
 * @param {any} cam
 * @returns {Property}
 */
function tlkLnZ(cam) {
  var fx = kbGroup(cam.rig, ["ADBE Effect Parade"]).property(1);
  return kbProp(fx, ["ADBE Slider Control-0001"]); // ae-ok: matchname
}

/**
 * Слайдер силы встряски (единственный, из tlCamRig).
 * @param {any} cam
 * @returns {Property}
 */
function tlkShakeAmt(cam) {
  var fx = kbGroup(cam.shake, ["ADBE Effect Parade"]).property(1);
  return kbProp(fx, ["ADBE Slider Control-0001"]); // ae-ok: matchname
}

/**
 * Значение свойства трансформа слоя в момент t (pre = true — до выражений).
 * @param {any} layer
 * @param {string} m matchName внутри ADBE Transform Group
 * @param {number} t
 * @param {boolean=} pre
 * @returns {any}
 */
function tlkT(layer, m, t, pre) {
  return kbProp(layer, ["ADBE Transform Group", m]).valueAtTime(t, !!pre);
}

/**
 * Камера композиции: риг, пустышка встряски и лист (по комментариям слоёв tl-rig / tl-shake / tl-sheet, не по именам).
 * @param {CompItem} comp
 * @returns {any} cam или null
 */
function tlkCamOfComp(comp) {
  var rig = null, shake = null, sheet = null;
  for (var i = 1; i <= comp.numLayers; i++) {
    var c = String(comp.layer(i).comment);
    if (c === "tl-rig") rig = comp.layer(i);
    else if (c === "tl-shake") shake = comp.layer(i);
    else if (c === "tl-sheet") sheet = comp.layer(i);
  }
  if (!rig || !shake || !sheet) return null;
  var src = /** @type {any} */ (sheet).source;
  var nx = Math.round((src.width - 2 * TL_CAM.margin) / comp.width);
  var ny = Math.round((src.height - 2 * TL_CAM.margin) / comp.height);
  return { comp: comp, shake: shake, rig: rig, sheet: sheet, W: comp.width, H: comp.height, span: [nx, ny], margin: TL_CAM.margin };
}

/**
 * Риг слоя: сам риг/пустышка/лист композиции слоя или композиция-сцена, зарегистрированная tlCamScene.
 * @param {any} layer
 * @returns {any} cam или null
 */
function tlCamOf(layer) {
  var comp = layer.containingComp;
  var own = tlkCamOfComp(comp);
  if (own) return own;
  var sc = TL_CAM.scenes[comp.id];
  return sc ? sc.cam : null;
}

/**
 * Камера: три слоя снизу вверх tl-shake, tl-rig, tl-sheet (spec §4.3). Пустышки в тождестве; якорь A, позиция P, поворот r, масштаб = e^lnZ.
 * @param {CompItem} comp
 * @param {{span?: number[], margin?: number, seed?: number}=} o span [nx, ny] — размер листа в кадрах (по умолчанию [1, 1])
 * @returns {{comp: CompItem, shake: AVLayer, rig: AVLayer, sheet: AVLayer, W: number, H: number, span: number[], margin: number}}
 */
function tlCamRig(comp, o) {
  o = o || {};
  if (tlkCamOfComp(comp)) throw new Error("tlCamRig: в «" + comp.name + "» уже есть риг — второй не бывает");
  var span = o.span || [1, 1];
  var margin = o.margin === undefined ? TL_CAM.margin : o.margin;
  var seed = o.seed === undefined ? TL_CAM.sheet.seed : o.seed;
  var Ws = span[0] * comp.width + 2 * margin;
  var Hs = span[1] * comp.height + 2 * margin;
  var shake = comp.layers.addNull();
  shake.name = "tl-shake";
  shake.comment = "tl-shake";
  kbShake(shake, [], { freq: TL_CAM.shake.freq }); // единственный вызов: второй теряет удар (зонд Q4)
  var rig = comp.layers.addNull();
  rig.name = "tl-rig";
  rig.comment = "tl-rig";
  kbProp(rig, ["ADBE Transform Group", "ADBE Anchor Point"]).setValue([0, 0]);
  kbProp(rig, ["ADBE Transform Group", "ADBE Position"]).setValue([0, 0]);
  kbProp(rig, ["ADBE Transform Group", "ADBE Scale"]).setValue([100, 100, 100]);
  kbProp(rig, ["ADBE Transform Group", "ADBE Rotate Z"]).setValue(0);
  rig.parent = shake;
  var fx = kbEffect(rig, "ADBE Slider Control"); // ae-ok: matchname
  fx.name = "lnZ";
  kbProp(fx, ["ADBE Slider Control-0001"]).setValue(0); // ae-ok: matchname
  kbProp(rig, ["ADBE Transform Group", "ADBE Scale"]).expression =
    "var z=Math.exp(effect(1)(1));var s=value;(s.length==3)?[s[0]*z,s[1]*z,s[2]]:[s[0]*z,s[1]*z];";
  var sheet = comp.layers.addSolid(KB_COLOR.paper, "tl-sheet", Ws, Hs, 1, comp.duration);
  sheet.comment = "tl-sheet";
  var cx = (span[0] - 1) * comp.width / 2 + comp.width / 2;
  var cy = (span[1] - 1) * comp.height / 2 + comp.height / 2;
  kbProp(sheet, ["ADBE Transform Group", "ADBE Position"]).setValue([cx, cy]);
  var nz = kbEffect(sheet, "ADBE Fractal Noise");
  kbProp(nz, ["ADBE Fractal Noise-0004"]).setValue(TL_CAM.sheet.contrast);
  kbProp(nz, ["ADBE Fractal Noise-0005"]).setValue(TL_CAM.sheet.brightness);
  kbProp(nz, ["ADBE Fractal Noise-0010"]).setValue(TL_CAM.sheet.scale);
  kbProp(nz, ["ADBE Fractal Noise-0015"]).setValue(TL_CAM.sheet.complexity);
  kbProp(nz, ["ADBE Fractal Noise-0027"]).setValue(seed);
  kbProp(nz, ["ADBE Fractal Noise-0030"]).setValue(TL_CAM.sheet.blend);
  sheet.motionBlur = true;
  sheet.quality = LayerQuality.BEST;
  sheet.samplingQuality = LayerSamplingQuality.BICUBIC;
  sheet.parent = rig;
  sheet.moveToEnd();
  rig.moveToEnd();
  shake.moveToEnd();
  kbLog("CAMRIG " + comp.name + " sheet " + Ws + "x" + Hs + " center (" + cx + "," + cy + ") margin " + margin + " idx sheet #" + sheet.index + " rig #" + rig.index + " shake #" + shake.index);
  return { comp: comp, shake: shake, rig: rig, sheet: sheet, W: comp.width, H: comp.height, span: span, margin: margin };
}

/**
 * Есть ли на риге или пустышке встряски ключи движения (якорь, позиция, поворот, lnZ) — для tlCamAttach и статичной смены опоры.
 * @param {any} cam
 * @returns {boolean}
 */
function tlkHasKeys(cam) {
  return kbProp(cam.rig, ["ADBE Transform Group", "ADBE Anchor Point"]).numKeys > 0 ||
    kbProp(cam.rig, ["ADBE Transform Group", "ADBE Position"]).numKeys > 0 ||
    kbProp(cam.rig, ["ADBE Transform Group", "ADBE Rotate Z"]).numKeys > 0 ||
    tlkLnZ(cam).numKeys > 0 || tlkShakeAmt(cam).numKeys > 0;
}

/**
 * Назначить слой ребёнком рига. Риг должен быть в тождестве без ключей: parent не анимируется, а назначение под сдвинутым ригом пересчитало бы значения ребёнка.
 * @param {any} cam
 * @param {any} layer
 */
function tlCamAttach(cam, layer) {
  if (tlkHasKeys(cam)) throw new Error("tlCamAttach: у рига уже есть ключи");
  layer.parent = cam.rig;
}

/**
 * Сцена-прекомпозиция под ригом (spec §4.1): 1080 × 1920 на длину ячейки, startTime 0, фон прозрачный, затвор 180 / −90 / 16 / предел 128, motionBlur,
 * слой BEST + BICUBIC, ребёнок рига; регистрируется в TL_CAM.scenes. Содержимое собирается обычными вызовами потоков 1–5 внутри comp.
 * @param {CompItem} cell
 * @param {any} cam
 * @param {string} name
 * @returns {{comp: CompItem, layer: AVLayer}}
 */
function tlCamScene(cell, cam, name) {
  var comp = kbComp(name, cell.duration);
  comp.shutterAngle = 180;
  comp.shutterPhase = -90;
  comp.motionBlurSamplesPerFrame = 16;
  comp.motionBlurAdaptiveSampleLimit = 128;
  comp.motionBlur = true;
  var layer = kbPlace(cell, comp, 0);
  layer.quality = LayerQuality.BEST;
  layer.samplingQuality = LayerSamplingQuality.BICUBIC;
  tlCamAttach(cam, layer);
  TL_CAM.scenes[comp.id] = { cam: cam, layer: layer };
  kbLog("CAMSCENE " + name + " in " + cell.name + " layer #" + layer.index);
  return { comp: comp, layer: layer };
}

// ---------------------------------------------------------------------------------------------------------------------
// Состояние камеры и преобразования (spec §4, §4.4)
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Состояние рига на t: якорь A, позиция P, масштаб z, поворот r, сдвиг встряски D (значения выражений).
 * @param {any} cam
 * @param {number} t
 * @param {boolean=} pre true — значения ключей без выражений (z из слайдера lnZ)
 * @returns {{A: number[], P: number[], z: number, r: number, D: number[], lnZ: number}}
 */
function tlCamState(cam, t, pre) {
  var A = tlkT(cam.rig, "ADBE Anchor Point", t, false);
  var P = tlkT(cam.rig, "ADBE Position", t, false);
  var r = tlkT(cam.rig, "ADBE Rotate Z", t, false);
  var ln = tlkLnZ(cam).valueAtTime(t, false);
  var D = pre ? [0, 0] : tlkT(cam.shake, "ADBE Position", t, false);
  return { A: [A[0], A[1]], P: [P[0], P[1]], z: Math.exp(ln), r: r, D: [D[0], D[1]], lnZ: ln };
}

/**
 * Точка мира на экране: q = D + P + R(r)·z·(p − A).
 * @param {{A: number[], P: number[], z: number, r: number, D: number[]}} st
 * @param {number[]} p
 * @param {boolean=} shake
 * @returns {number[]}
 */
function tlkQ(st, p, shake) {
  var v = tlkRot([p[0] - st.A[0], p[1] - st.A[1]], st.r);
  var d = shake === false ? [0, 0] : st.D;
  return [d[0] + st.P[0] + st.z * v[0], d[1] + st.P[1] + st.z * v[1]];
}

/**
 * Точка мира на экране (spec §4).
 * @param {any} cam
 * @param {number[]} p
 * @param {number} t
 * @param {boolean=} shake по умолчанию true
 * @returns {number[]}
 */
function tlCamToScreen(cam, p, t, shake) {
  return tlkQ(tlCamState(cam, t), p, shake);
}

/**
 * Обратное: точка экрана → точка мира: p = A + R(−r)·(q − D − P)/z.
 * @param {any} cam
 * @param {number[]} q
 * @param {number} t
 * @param {boolean=} shake по умолчанию true
 * @returns {number[]}
 */
function tlCamToWorld(cam, q, t, shake) {
  var st = tlCamState(cam, t);
  var d = shake === false ? [0, 0] : st.D;
  var v = tlkRot([(q[0] - d[0] - st.P[0]) / st.z, (q[1] - d[1] - st.P[1]) / st.z], -st.r);
  return [st.A[0] + v[0], st.A[1] + v[1]];
}

/**
 * Точка слоя → композиция через цепочку родителей (масштаб, поворот Z; pre — без выражений).
 * @param {any} layer
 * @param {number} x
 * @param {number} y
 * @param {number} t
 * @param {boolean=} pre
 * @returns {number[]}
 */
function tlkToComp(layer, x, y, t, pre) {
  var p = [x, y];
  var L = layer;
  while (L) {
    var anc = tlkT(L, "ADBE Anchor Point", t, pre);
    var pos = tlkT(L, "ADBE Position", t, pre);
    var sc = tlkT(L, "ADBE Scale", t, pre);
    var rot = tlkT(L, "ADBE Rotate Z", t, pre);
    var v = tlkRot([(p[0] - anc[0]) * sc[0] / 100, (p[1] - anc[1]) * sc[1] / 100], rot);
    p = [pos[0] + v[0], pos[1] + v[1]];
    L = L.parent;
  }
  return p;
}

/**
 * Точка внутри сцены → мир: трансформ ТОЛЬКО самого слоя сцены (позиция − якорь, масштаб, поворот), без родителя-рига; затем tlCamToScreen.
 * @param {any} sceneLayer
 * @param {number[]} p
 * @param {number} t
 * @returns {number[]}
 */
function tlkSceneToWorld(sceneLayer, p, t) {
  var anc = tlkT(sceneLayer, "ADBE Anchor Point", t, true);
  var pos = tlkT(sceneLayer, "ADBE Position", t, true);
  var sc = tlkT(sceneLayer, "ADBE Scale", t, true);
  var rot = tlkT(sceneLayer, "ADBE Rotate Z", t, true);
  var v = tlkRot([(p[0] - anc[0]) * sc[0] / 100, (p[1] - anc[1]) * sc[1] / 100], rot);
  return [pos[0] + v[0], pos[1] + v[1]];
}

/**
 * Высота капители слова в px: по «Н» шрифта (tlpMetrics потока 5), нет — высота из стиля (TL_S.text.cap).
 * @param {any} layer
 * @returns {number}
 */
function tlkCapOf(layer) {
  var em = tlFontSize(layer);
  var doc = kbProp(layer, ["ADBE Text Properties", "ADBE Text Document"]).value;
  try {
    return tlpMetrics(layer.containingComp, doc.font).cap * em;
  } catch (e) {
    return (TL_S.text && TL_S.text.cap ? TL_S.text.cap : 0.72) * em;
  }
}

/**
 * Чернила текстового слоя в системе его композиции на t (до выражений): центр, база, края, верх капители.
 * @param {any} layer
 * @param {number} t
 * @returns {{l: number, r: number, base: number, top: number, bottom: number, cx: number, cy: number}}
 */
function tlkInk(layer, t) {
  var rect = layer.sourceRectAtTime(0, false);
  var em = tlFontSize(layer);
  var cap = tlkCapOf(layer);
  var pad = 0.004 * em;
  var l = tlkToComp(layer, rect.left + pad, 0, t, true);
  var r = tlkToComp(layer, rect.left + rect.width - pad, 0, t, true);
  var base = l[1];
  return { l: l[0], r: r[0], base: base, top: base - cap, bottom: base, cx: (l[0] + r[0]) / 2, cy: base - cap / 2 };
}

/**
 * Ключи осей камеры (spec §4.4): keys [{f, pan?, tilt?, roll?, zoom?, ease}] — кадры композиции; ось без значения не трогается.
 * pan/tilt — px экрана при любых z и r: P = A − (pan, tilt). Кривая приходит в ключ слева (имя TL_EASE или объект {out, into, x1, x2}).
 * @param {any} cam
 * @param {any[]} keys
 */
function tlCamKeys(cam, keys) {
  var posKeys = [], rotKeys = [], zKeys = [];
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    var t = tlkKf(k.f / 30);
    var st = tlCamState(cam, t, true);
    if (k.pan !== undefined || k.tilt !== undefined) {
      var A = tlkT(cam.rig, "ADBE Anchor Point", t, false);
      var px = k.pan !== undefined ? A[0] - k.pan : st.P[0];
      var py = k.tilt !== undefined ? A[1] - k.tilt : st.P[1];
      posKeys.push([t, [px, py], k.ease]);
    }
    if (k.roll !== undefined) rotKeys.push([t, k.roll, k.ease]);
    if (k.zoom !== undefined) zKeys.push([t, Math.log(k.zoom), k.ease]);
  }
  if (posKeys.length) tlkKeys(kbProp(cam.rig, ["ADBE Transform Group", "ADBE Position"]), posKeys, "tl-rig Position");
  if (rotKeys.length) tlkKeys(kbProp(cam.rig, ["ADBE Transform Group", "ADBE Rotate Z"]), rotKeys, "tl-rig Rotation");
  if (zKeys.length) tlkKeys(tlkLnZ(cam), zKeys, "tl-rig lnZ");
}

/**
 * Новая опора в точке экрана S без скачка (spec §4.4): A′ = A + R(−r)·(S − P)/z, P′ = S (значения на t, без встряски).
 * Нет ключей — статично; иначе парой ключей на якоре и позиции: t − eps (старое, выход HOLD) и t (новое).
 * Журнал REPIVOT tl-rig t f<…> before (<x>,<y>) after (<x>,<y>) err <px>.
 * @param {any} cam
 * @param {number} t
 * @param {number[]} S
 * @returns {{A: number[], P: number[]}}
 */
function tlCamRepivot(cam, t, S) {
  var ancP = kbProp(cam.rig, ["ADBE Transform Group", "ADBE Anchor Point"]);
  var posP = kbProp(cam.rig, ["ADBE Transform Group", "ADBE Position"]);
  var st = tlCamState(cam, t, true);
  var d = tlkRot([(S[0] - st.P[0]) / st.z, (S[1] - st.P[1]) / st.z], -st.r);
  var A2 = [st.A[0] + d[0], st.A[1] + d[1]];
  var e = TL_CAM.eps;
  var before, after;
  if (!tlkHasKeys(cam)) {
    before = tlkQ(st, A2, false);
    ancP.setValue(A2);
    posP.setValue(S);
    after = tlCamToScreen(cam, A2, t, false);
    kbLog("REPIVOT tl-rig static before (" + before[0].toFixed(2) + "," + before[1].toFixed(2) + ") after (" + after[0].toFixed(2) + "," + after[1].toFixed(2) + ") err " +
      Math.sqrt(Math.pow(after[0] - before[0], 2) + Math.pow(after[1] - before[1], 2)).toFixed(3));
    return { A: A2, P: S };
  }
  tlkKeys(ancP, [[t - e, st.A], [t, A2, "hold"]], "tl-rig Anchor");
  tlkKeys(posP, [[t - e, st.P], [t, S, "hold"]], "tl-rig Position");
  TL_CAM.pairs[cam.comp.id + ":" + tlkKf(t - e)] = true;
  TL_CAM.pairs[cam.comp.id + ":" + tlkKf(t)] = true;
  var st1 = tlCamState(cam, t - e / 2, true);
  var st2 = tlCamState(cam, t, true);
  before = tlkQ(st1, A2, false);
  after = tlkQ(st2, A2, false);
  // реальное движение рига за eps/2 до смены опоры отделено от ошибки смены (как tlPlateRepivot): err = |(after − before) − drift|
  var atE = tlkQ(tlCamState(cam, t - e, true), A2, false);
  var drift = [before[0] - atE[0], before[1] - atE[1]];
  kbLog("REPIVOT tl-rig t f" + (t * 30).toFixed(2) + " before (" + before[0].toFixed(2) + "," + before[1].toFixed(2) + ") after (" + after[0].toFixed(2) + "," + after[1].toFixed(2) + ") drift (" +
    drift[0].toFixed(3) + "," + drift[1].toFixed(3) + ") err " + Math.sqrt(Math.pow(after[0] - before[0] - drift[0], 2) + Math.pow(after[1] - before[1] - drift[1], 2)).toFixed(3));
  return { A: A2, P: S };
}

// ---------------------------------------------------------------------------------------------------------------------
// Пределы «без укачивания» (spec §4.5): скорость, лист, сейф-зона, занятость
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Точки мира для скорости камеры: 4 угла сейф-зоны и опора.
 * @param {number[]} anchor
 * @returns {number[][]}
 */
function tlkSpeedPoints(anchor) {
  var s = TL_CAM.safe;
  return [[s.l, s.t], [s.r, s.t], [s.l, s.b], [s.r, s.b], [anchor[0], anchor[1]]];
}

/**
 * Скорости по кадрам аналитической модели: stateAt(k) → {A, P, z, r}; k = 0…n. Возвращает {v[k] (k ≥ 1), peak, at}.
 * @param {function(number): any} stateAt
 * @param {number} n
 * @param {number[][]} pts
 * @returns {{v: number[], peak: number, at: number}}
 */
function tlkSim(stateAt, n, pts) {
  var prev = [];
  var v = [0];
  var peak = 0, at = 0;
  var k, i;
  for (k = 0; k <= n; k++) {
    var st = stateAt(k);
    var cur = [];
    for (i = 0; i < pts.length; i++) cur.push(tlkQ(st, pts[i], false));
    if (k > 0) {
      var m = 0;
      for (i = 0; i < pts.length; i++) m = Math.max(m, Math.sqrt(Math.pow(cur[i][0] - prev[i][0], 2) + Math.pow(cur[i][1] - prev[i][1], 2)));
      v.push(m);
      if (m > peak) { peak = m; at = k; }
    }
    prev = cur;
  }
  return { v: v, peak: peak, at: at };
}

/**
 * Скорость по фактическим ключам рига: кадры f0…f1, точки — углы сейф-зоны и опора на f0 (без встряски). Журнал CAMSPEED <имя> peak <v> at f<…>.
 * @param {any} cam
 * @param {number} f0 кадр
 * @param {number} f1 кадр
 * @param {string} name
 * @returns {{v: number[], peak: number, at: number}}
 */
function tlCamSpeed(cam, f0, f1, name) {
  var st0 = tlCamState(cam, f0 / 30, true);
  var pts = tlkSpeedPoints(st0.A);
  var res = tlkSim(function (k) { return tlCamState(cam, (f0 + k) / 30, true); }, f1 - f0, pts);
  kbLog("CAMSPEED " + name + " peak " + res.peak.toFixed(2) + " at f" + (f0 + res.at));
  return res;
}

/**
 * Полоса переходов: сколько кадров стороны в полосе [12, 60) (по точному числу) и пограничные значения (edge ±0,2).
 * @param {number[]} v скорости, v[0] не считается
 * @param {string} cam
 * @param {string} side
 * @param {number=} skip индекс кадра, который не считается (кадр склейки)
 */
function tlkBand(v, cam, side, skip) {
  var n = 0, peak = 0, edge = [];
  for (var k = 1; k < v.length; k++) {
    if (skip !== undefined && k === skip) continue;
    if (v[k] >= TL_CAM.mid[0] && v[k] < TL_CAM.mid[1]) n++;
    if (v[k] > peak) peak = v[k];
    if (Math.abs(v[k] - TL_CAM.mid[0]) <= 0.2 || Math.abs(v[k] - TL_CAM.mid[1]) <= 0.2) edge.push(v[k].toFixed(2));
  }
  kbLog("CAMSPEED " + cam + " side " + side + " mid " + n + " peak " + peak.toFixed(2) + (edge.length ? " edge " + edge.join(",") : ""));
  return { mid: n, peak: peak };
}

/**
 * Лист накрывает кадр (spec §4.5): запас углов кадра до края листа в мировых координатах; запас на встряску ± (слайдер + 0,01) только на кадрах, где слайдер > 0.
 * Журнал COVER <комп> min <px> at f<…>.
 * @param {any} cam
 * @param {number} f0
 * @param {number} f1
 * @returns {{min: number, at: number}}
 */
function tlCamCover(cam, f0, f1) {
  var sp = /** @type {any} */ (cam.sheet).source;
  var pos = tlkT(cam.sheet, "ADBE Position", 0, true);
  var hx = sp.width / 2, hy = sp.height / 2;
  var corners = [[0, 0], [cam.W, 0], [0, cam.H], [cam.W, cam.H]];
  var best = 1e9, at = f0;
  for (var f = f0; f <= f1; f++) {
    var t = f / 30;
    var st = tlCamState(cam, t, true);
    var amt = tlkShakeAmt(cam).valueAtTime(t, false);
    var slack = amt > 0 ? amt + 0.01 : 0;
    for (var i = 0; i < corners.length; i++) {
      var q = [corners[i][0], corners[i][1]];
      // мир ← экран без встряски
      var v = tlkRot([(q[0] - st.P[0]) / st.z, (q[1] - st.P[1]) / st.z], -st.r);
      var w = [st.A[0] + v[0], st.A[1] + v[1]];
      var m = Math.min(w[0] - (pos[0] - hx), (pos[0] + hx) - w[0], w[1] - (pos[1] - hy), (pos[1] + hy) - w[1]) - slack / st.z;
      if (m < best) { best = m; at = f; }
    }
  }
  kbLog("COVER " + cam.comp.name + " min " + best.toFixed(2) + " at f" + at);
  return { min: best, at: at };
}

/**
 * Тексты сцен камеры на кадре: рамки чернил на экране (после рига, без встряски). Журнал CAMBOX <комп> f<…> <слой> (x0,y0,x1,y1) и признак сейф-зоны.
 * @param {any} cam
 * @param {number} f
 * @returns {boolean} true — все в сейф-зоне (x 60…1020, y 200…1600; в полосе y ≥ 900 — x ≤ 960)
 */
function tlCamBox(cam, f) {
  var t = f / 30;
  var ok = true;
  var s = TL_CAM.safe;
  for (var id in TL_CAM.scenes) {
    var sc = TL_CAM.scenes[id];
    if (sc.cam.comp.id !== cam.comp.id) continue;
    var comp = sc.layer.source;
    for (var i = 1; i <= comp.numLayers; i++) {
      var L = comp.layer(i);
      if (!(L instanceof TextLayer)) continue;
      if (t < L.inPoint - 1e-6 || t > L.outPoint + 1e-6) continue;
      var ink = tlkInk(L, t);
      var pts = [[ink.l, ink.top], [ink.r, ink.top], [ink.l, ink.bottom], [ink.r, ink.bottom]];
      var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (var p = 0; p < 4; p++) {
        var q = tlCamToScreen(cam, tlkSceneToWorld(sc.layer, pts[p], t), t, false);
        x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]);
      }
      var inside = x0 >= s.l - 0.5 && x1 <= s.r + 0.5 && y0 >= s.t - 0.5 && y1 <= s.b + 0.5 && !(y1 > 900 && x1 > 960.5);
      if (!inside) ok = false;
      kbLog("CAMBOX " + cam.comp.name + " f" + f + " " + L.name + " (" + x0.toFixed(1) + "," + y0.toFixed(1) + "," + x1.toFixed(1) + "," + y1.toFixed(1) + ")" + (inside ? "" : " OUT"));
    }
  }
  return ok;
}

/**
 * Занятость камеры (spec §4.6): ключи lnZ / позиции / поворота рига в (f0 − 6, f1 + 6) кадров, кроме парных ключей смены опоры, — исключение.
 * @param {any} cam
 * @param {number} f0
 * @param {number} f1
 */
function tlCamBusy(cam, f0, f1) {
  var lo = tlkKf((f0 - TL_CAM.gap) / 30) + 1e-6;
  var hi = tlkKf((f1 + TL_CAM.gap) / 30) - 1e-6;
  var props = [tlkLnZ(cam), kbProp(cam.rig, ["ADBE Transform Group", "ADBE Position"]), kbProp(cam.rig, ["ADBE Transform Group", "ADBE Rotate Z"])];
  for (var p = 0; p < props.length; p++) {
    for (var k = 1; k <= props[p].numKeys; k++) {
      var kt = props[p].keyTime(k);
      if (kt <= lo || kt >= hi) continue;
      if (TL_CAM.pairs && TL_CAM.pairs[cam.comp.id + ":" + tlkKf(kt)]) continue;
      throw new Error("камера: движение внахлёст с f" + (kt * 30).toFixed(2));
    }
  }
  kbLog("CAMBUSY " + cam.comp.name + " f" + f0 + "–f" + f1 + " 0");
}

/**
 * Причина движения камеры (spec §4.5): строка из TL_CAM.why; нет — исключение.
 * @param {any} o
 * @param {string} name
 * @returns {string}
 */
function tlCamWhy(o, name) {
  var w = o.why;
  var ok = false;
  for (var i = 0; i < TL_CAM.why.length; i++) if (TL_CAM.why[i] === w) ok = true;
  if (!ok) throw new Error("камера без причины: " + name + " — нужен why из " + TL_CAM.why.join(", "));
  kbLog("CAMWHY " + name + " " + w);
  return w;
}

/**
 * Старт движения из at | start (секунды); at − lead кадров.
 * @param {any} o
 * @param {number} leadFr
 * @returns {number}
 */
function tlkStartOf(o, leadFr) {
  if (o.at !== undefined && o.start === undefined) return tlkKf(Math.round((o.at - leadFr / 30) * 30) / 30);
  if (o.start !== undefined && o.at === undefined) return tlkKf(o.start);
  throw new Error("нужно ровно одно из at | start");
}

/**
 * Камера для слоя пресета: ключ риг/пустышка/сцена; нет — исключение.
 * @param {any} layer
 * @param {string} why
 * @returns {any}
 */
function tlkNeedCam(layer, why) {
  var cam = tlCamOf(layer);
  if (!cam) throw new Error("cam-push: у «" + layer.containingComp.name + "» нет рига tl-rig" + (why ? " (" + why + ")" : ""));
  return cam;
}

/**
 * Состояние рига на t по ключам, без выражений (для планов).
 * @param {any} cam
 * @param {number} t
 * @returns {{A: number[], P: number[], z: number, r: number}}
 */
function tlkRest(cam, t) {
  var st = tlCamState(cam, t, true);
  return { A: st.A, P: st.P, z: st.z, r: st.r };
}

/**
 * Состояние после смены опоры на экранную точку S (без скачка).
 * @param {{A: number[], P: number[], z: number, r: number}} st
 * @param {number[]|undefined} S
 * @returns {{A: number[], P: number[], z: number, r: number}}
 */
function tlkPivoted(st, S) {
  if (!S) return { A: st.A, P: st.P, z: st.z, r: st.r };
  var d = tlkRot([(S[0] - st.P[0]) / st.z, (S[1] - st.P[1]) / st.z], -st.r);
  return { A: [st.A[0] + d[0], st.A[1] + d[1]], P: [S[0], S[1]], z: st.z, r: st.r };
}

// ---------------------------------------------------------------------------------------------------------------------
// №29 cam-push: push / отъезд, micro, cut (spec §5.1–5.3)
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Ширина зума стиля: ln z = ln(zoom)·сила.
 * @param {number} zoom
 * @param {number} mult
 * @returns {number}
 */
function tlkLn(zoom, mult) {
  return Math.log(zoom) * mult;
}

/**
 * Скорость отрезка зума/крена вокруг опоры: растим число кадров N, пока пик > 12 px/к (spec §4.5).
 * @param {{A: number[], P: number[]}} pv состояние опоры
 * @param {number} l0 ln z в начале
 * @param {number} l1 ln z в конце
 * @param {number} r0 крен в начале
 * @param {number} r1 крен в конце
 * @param {string} ease
 * @param {number} n0 стартовое число кадров
 * @returns {{n: number, sim: any, grown: boolean}}
 */
function tlkGrow(pv, l0, l1, r0, r1, ease, n0) {
  var pts = tlkSpeedPoints(pv.A);
  var n = Math.max(2, n0);
  var sim;
  for (; n <= 240; n++) {
    var nn = n;
    sim = tlkSim(function (k) {
      var e = tlkBz(k / nn, ease);
      return { A: pv.A, P: pv.P, z: Math.exp(l0 + (l1 - l0) * e), r: r0 + (r1 - r0) * e };
    }, nn, pts);
    if (sim.peak <= TL_CAM.slow) break;
  }
  return { n: n, sim: sim, grown: n !== Math.max(2, n0) };
}

/**
 * План push / отъезд (spec §5.1).
 * @param {any} layer
 * @param {any} o
 * @param {any} S
 * @returns {any}
 */
function tlkPlanPush(layer, o, S) {
  var cam = tlkNeedCam(layer, "");
  var back = o.zoom <= 1;
  var start = tlkStartOf(o, TL_CAM.push.lead);
  var st = tlkRest(cam, start);
  var l0 = Math.log(st.z);
  var l1 = back ? 0 : tlkLn(o.zoom, o.strength * S.strength);
  if (Math.exp(l1) > TL_CAM.zoomMax + 1e-9) throw new Error("cam-push: зум " + Math.exp(l1).toFixed(4) + " > " + TL_CAM.zoomMax);
  var cap = TL_CAM.rollCap[S.name] === undefined ? 0 : TL_CAM.rollCap[S.name];
  var roll = o.roll || 0;
  var rollOff = false;
  if (cap === 0 && roll !== 0) { roll = 0; rollOff = true; }
  if (Math.abs(roll) > cap + 1e-9) throw new Error("cam-push: крен " + roll + "° > " + cap + "° (" + S.name + ")");
  var pv = tlkPivoted(st, o.to);
  var n0 = Math.round((back ? TL_CAM.push.back : TL_CAM.push.frames) * S.dur);
  var g = tlkGrow(pv, l0, l1, st.r, roll, TL_CAM.push.ease, n0);
  return { n: 0, unit: "", starts: [], start: start, hit: tlkKf(start + g.n / 30), end: tlkKf(start + g.n / 30), total: g.n, unitFr: g.n, staggerFr: 0,
    kind: back ? "back" : "push", cam: cam, l0: l0, l1: l1, r0: st.r, r1: roll, rollOff: rollOff, pv: pv, N: g.n, N0: n0, sim: g.sim };
}

/**
 * Экранная опора micro по слову: центр чернил слова → мир (через слой сцены) → экран на t.
 * @param {any} layer текстовый слой
 * @param {any} cam
 * @param {number} t
 * @returns {number[]}
 */
function tlkWordScreen(layer, cam, t) {
  var ink = tlkInk(layer, t);
  var sc = TL_CAM.scenes[layer.containingComp.id];
  if (sc) return tlCamToScreen(cam, tlkSceneToWorld(sc.layer, [ink.cx, ink.cy], t), t, false);
  return [ink.cx, ink.cy];
}

/**
 * План micro (spec §5.2): вход N_in snap, возврат N_back soft; оба растут до скорости ≤ 12 px/к.
 * @param {any} layer риг или текстовый слой (подмена из punch)
 * @param {any} o
 * @param {any} S
 * @returns {any}
 */
function tlkPlanMicro(layer, o, S) {
  var isText = layer instanceof TextLayer;
  var cam = tlkNeedCam(layer, isText ? "подмена из punch, " + S.name : "");
  var Mi = TL_CAM.micro;
  var nIn0 = Math.max(2, Math.round(Mi.inFr * S.dur));
  var nBack0 = Math.max(2, Math.round(Mi.backFr * S.dur));
  var l1 = tlkLn(Mi.zoom, (isText ? 1 : o.strength) * S.strength);
  // опорная точка: слово (подмена из punch) или to; считаем на предварительном старте, затем уточняем
  var guessStart = o.start !== undefined ? tlkKf(o.start) : tlkKf(Math.round((o.at - Mi.lead / 30) * 30) / 30 - nIn0 / 30);
  var to = isText ? tlkWordScreen(layer, cam, guessStart) : o.to;
  var st = tlkRest(cam, guessStart);
  var pv = tlkPivoted(st, to);
  var gi = tlkGrow(pv, 0, l1, 0, 0, Mi.inEase, nIn0);
  var gb = tlkGrow(pv, l1, 0, 0, 0, Mi.backEase, nBack0);
  var start, hit;
  if (o.at !== undefined && o.start === undefined) {
    hit = tlkKf(Math.round((o.at - Mi.lead / 30) * 30) / 30);
    start = tlkKf(hit - gi.n / 30);
  } else if (o.start !== undefined && o.at === undefined) {
    start = tlkKf(o.start);
    hit = tlkKf(start + gi.n / 30);
  } else {
    throw new Error("нужно ровно одно из at | start");
  }
  var end = tlkKf(hit + gb.n / 30);
  if (isText) to = tlkWordScreen(layer, cam, start);
  return { n: 0, unit: "", starts: [], start: start, hit: hit, end: end, total: gi.n + gb.n, unitFr: gi.n + gb.n, staggerFr: 0, kind: "micro", cam: cam, to: to,
    l1: l1, pv: tlkPivoted(tlkRest(cam, start), to), nIn: gi.n, nBack: gb.n, nIn0: nIn0, nBack0: nBack0, simIn: gi.sim, simBack: gb.sim, isText: isText };
}

/**
 * План cut (spec §5.3): A nA release → склейка на полкадра → лист paper → B nB snap. Числа по стилю (TL_CAM.cutStyle); lesson — длительности не ×1,3.
 * @param {any} layer риг
 * @param {any} o
 * @param {any} S
 * @returns {any}
 */
function tlkPlanCut(layer, o, S) {
  var cam = tlkNeedCam(layer, "");
  var C = TL_CAM.cut;
  var cs = TL_CAM.cutStyle[S.name];
  if (!cs) throw new Error("cam-push cut: стиль " + S.name + " не поддержан");
  var nA = cs[0];
  var paper = o.paper !== undefined ? o.paper : cs[1];
  var nB = cs[2];
  var lnA = tlkLn(C.zA, S.strength);
  var lnB = tlkLn(C.zB, S.strength);
  if (Math.exp(lnA) > TL_CAM.zoomMax + 1e-9) throw new Error("cam-push cut: зум " + Math.exp(lnA).toFixed(4) + " > " + TL_CAM.zoomMax);
  var total = nA + 1 + paper;
  var start, hit;
  if (o.at !== undefined && o.start === undefined) {
    hit = tlkKf(Math.round((o.at - C.lead / 30) * 30) / 30);
    start = tlkKf(hit - total / 30);
  } else if (o.start !== undefined && o.at === undefined) {
    start = tlkKf(o.start);
    hit = tlkKf(start + total / 30);
  } else {
    throw new Error("нужно ровно одно из at | start");
  }
  var from = o.from;
  if (!from) throw new Error("cam-push cut: нужна точка from (экран)");
  var target = o.target || from;
  var match = Math.sqrt(Math.pow(target[0] - from[0], 2) + Math.pow(target[1] - from[1], 2));
  var pts = tlkSpeedPoints(from);
  var simA = tlkSim(function (k) { return { A: from, P: from, z: Math.exp(lnA * tlkBz(k / nA, C.easeA)), r: 0 }; }, nA, pts);
  var simB = tlkSim(function (k) { return { A: target, P: target, z: Math.exp(lnB * (1 - tlkBz(k / nB, C.easeB))), r: 0 }; }, nB, pts);
  var tc = tlkKf((Math.round(start * 30) + nA + 0.5) / 30);
  return { n: 0, unit: "", starts: [], start: start, hit: hit, end: tlkKf(hit + nB / 30), total: total + nB, unitFr: total + nB, staggerFr: 0, kind: "cut", cam: cam,
    nA: nA, paper: paper, nB: nB, lnA: lnA, lnB: lnB, tc: tc, from: from, target: target, match: match, simA: simA, simB: simB, tcFr: Math.round(start * 30) + nA + 0.5 };
}

/**
 * Запись push / отъезда (spec §5.1).
 * @param {any} layer
 * @param {any} o
 * @param {any} S
 * @param {any} plan
 */
function tlkRunPush(layer, o, S, plan) {
  var cam = plan.cam;
  var why = tlCamWhy(o, "cam-push");
  tlCamBusy(cam, Math.round(plan.start * 30), Math.round(plan.end * 30));
  if (plan.rollOff) kbLog("INFO cam-push roll off (" + S.name + ")");
  if (plan.N !== plan.N0) kbLog("INFO cam-push frames " + plan.N0 + "→" + plan.N + " (скорость)");
  if (o.to) tlCamRepivot(cam, plan.start, o.to);
  tlkKeys(tlkLnZ(cam), [[plan.start, plan.l0], [plan.end, plan.l1, TL_CAM.push.ease]], "tl-rig lnZ");
  if (plan.r0 !== 0 || plan.r1 !== 0) {
    tlkKeys(kbProp(cam.rig, ["ADBE Transform Group", "ADBE Rotate Z"]), [[plan.start, plan.r0], [plan.end, plan.r1, TL_CAM.push.ease]], "tl-rig Rotation");
  }
  var fs = Math.round(plan.start * 30);
  var fe = Math.round(plan.end * 30);
  var mid = tlCamState(cam, (plan.start + plan.end) / 2, true);
  var pv = plan.pv;
  kbLog("CAMPUSH " + plan.kind + " start f" + fs + " hit f" + fe + " z " + Math.exp(plan.l0).toFixed(4) + "→" + Math.exp(plan.l1).toFixed(4) + " roll " + plan.r0.toFixed(2) + "→" + plan.r1.toFixed(2) +
    " pivot (" + pv.P[0].toFixed(2) + "," + pv.P[1].toFixed(2) + ") mid f" + ((fs + fe) / 2) + " z " + mid.z.toFixed(6) + " why " + why);
  tlCamSpeed(cam, fs, fe, "cam-push " + plan.kind);
  tlCamCover(cam, fs, fe);
  tlCamBox(cam, fe);
}

/**
 * Запись micro (spec §5.2).
 * @param {any} layer
 * @param {any} o
 * @param {any} S
 * @param {any} plan
 */
function tlkRunMicro(layer, o, S, plan) {
  var cam = plan.cam;
  var why = plan.isText ? "accent" : tlCamWhy(o, "cam-push micro");
  if (plan.isText) {
    kbLog("INFO cam-push: слой «" + layer.name + "» не риг — micro к его чернилам");
    kbLog("CAMWHY cam-push micro accent");
  }
  var fs = Math.round(plan.start * 30);
  var fh = Math.round(plan.hit * 30);
  var fe = Math.round(plan.end * 30);
  var st0 = tlkRest(cam, plan.start);
  if (Math.abs(st0.z - 1) > 1e-6 || Math.abs(st0.r) > 1e-6) throw new Error("cam-push micro: micro поверх наезда (z " + st0.z.toFixed(4) + ", крен " + st0.r.toFixed(2) + ")");
  tlCamBusy(cam, fs, fe);
  if (plan.nIn !== plan.nIn0) kbLog("INFO cam-push micro in frames " + plan.nIn0 + "→" + plan.nIn + " (скорость)");
  if (plan.nBack !== plan.nBack0) kbLog("INFO cam-push micro back frames " + plan.nBack0 + "→" + plan.nBack + " (скорость)");
  if (plan.to) tlCamRepivot(cam, plan.start, plan.to);
  tlkKeys(tlkLnZ(cam), [[plan.start, 0], [plan.hit, plan.l1, TL_CAM.micro.inEase], [plan.end, 0, TL_CAM.micro.backEase]], "tl-rig lnZ");
  kbLog("CAMPUSH micro start f" + fs + " hit f" + fh + " end f" + fe + " z 1→" + Math.exp(plan.l1).toFixed(4) + "→1 pivot (" + (plan.to ? plan.to[0].toFixed(2) + "," + plan.to[1].toFixed(2) : "-") + ")" + " why " + why);
  tlCamSpeed(cam, fs, fh, "cam-push micro in");
  tlCamSpeed(cam, fh, fe, "cam-push micro back");
  tlCamCover(cam, fs, fe);
  tlCamBox(cam, fh);
}

/**
 * Запись cut (spec §5.3). Склейка на полкадра: outPoint A = t_c, inPoint B = (hit − 0,5)/30; на t_c парные ключи lnZ и опоры; лист — кадры без сцен.
 * @param {any} layer
 * @param {any} o
 * @param {any} S
 * @param {any} plan
 */
function tlkRunCut(layer, o, S, plan) {
  var cam = plan.cam;
  var C = TL_CAM.cut;
  var why = tlCamWhy(o, "cam-push cut");
  var A = o.out;
  var B = o["in"];
  if (!A || !B) throw new Error("cam-push cut: нужны out (сцена A) и in (сцена B)");
  var fs = Math.round(plan.start * 30);
  var fh = Math.round(plan.hit * 30);
  var fe = Math.round(plan.end * 30);
  tlCamBusy(cam, fs, fe);
  if (plan.match > 60) kbLog("WARN cut match " + plan.match.toFixed(1));
  var e = TL_CAM.eps;
  tlCamRepivot(cam, plan.start, plan.from);
  var tc = plan.tc;
  var thit = plan.hit;
  tlkKeys(tlkLnZ(cam), [[plan.start, 0], [tlkKf(plan.start + plan.nA / 30), plan.lnA, C.easeA], [tc - e, plan.lnA, "soft"], [tc, plan.lnB, "hold"], [thit, plan.lnB],
    [plan.end, 0, C.easeB]], "tl-rig lnZ");
  // опора на склейке: A′ = P′ = target (прыжок между сценами, не «без скачка»)
  tlkKeys(kbProp(cam.rig, ["ADBE Transform Group", "ADBE Anchor Point"]), [[tc - e, plan.from], [tc, plan.target, "hold"]], "tl-rig Anchor");
  tlkKeys(kbProp(cam.rig, ["ADBE Transform Group", "ADBE Position"]), [[tc - e, plan.from], [tc, plan.target, "hold"]], "tl-rig Position");
  TL_CAM.pairs[cam.comp.id + ":" + tlkKf(tc - e)] = true;
  TL_CAM.pairs[cam.comp.id + ":" + tlkKf(tc)] = true;
  A.outPoint = tc;
  B.inPoint = tlkKf((plan.hit * 30 - 0.5) / 30);
  var tcEnd = tlkKf(tc + 0.002);
  var screenAfter = tlCamToScreen(cam, plan.target, tcEnd, false);
  kbLog("REPIVOT tl-rig t f" + plan.tcFr.toFixed(2) + " before (" + plan.from[0].toFixed(2) + "," + plan.from[1].toFixed(2) + ") after (" + screenAfter[0].toFixed(2) + "," + screenAfter[1].toFixed(2) + ") err " +
    Math.sqrt(Math.pow(screenAfter[0] - plan.target[0], 2) + Math.pow(screenAfter[1] - plan.target[1], 2)).toFixed(3));
  if (S.name === "magazine") {
    A.motionBlur = false; B.motionBlur = false; cam.sheet.motionBlur = false;
    kbLog("INFO cam-push cut: motionBlur off (magazine)");
  }
  tlSfxMarker(cam.rig, tlCeilFrame(plan.start), "whoosh", 0.5 * S.strength);
  kbLog("CUT start f" + fs + " A f" + fs + "–f" + (fs + plan.nA) + " z 1→" + Math.exp(plan.lnA).toFixed(4) + " switch t f" + plan.tcFr.toFixed(1) + " paper f" + (fs + plan.nA + 1) + "–f" + (fs + plan.nA + plan.paper) +
    " B f" + fh + "–f" + fe + " z " + Math.exp(plan.lnB).toFixed(4) + "→1 from (" + plan.from[0].toFixed(1) + "," + plan.from[1].toFixed(1) + ") target (" + plan.target[0].toFixed(1) + "," + plan.target[1].toFixed(1) + ") match " + plan.match.toFixed(1) + " why " + why);
  tlkBand(plan.simA.v, "cam-push cut", "A");
  tlkBand(plan.simB.v, "cam-push cut", "B");
  tlCamCover(cam, fs, fe);
  tlCamBox(cam, fs + plan.nA);
  tlCamBox(cam, fh);
}

/** №29 cam-push — наезд камеры: push / отъезд, micro, cut (spec §5.1–5.3). Реальные пресеты ставит раннер; режим выбирают опции. */
TL_MOVES["cam-push"] = {
  group: "camera", slot: "accent", units: [], unit: "word",
  frames: { push: 36, back: 12, micro: [6, 12], cut: [5, 2, 6] }, stagger: {}, over: 0, lead: 12, sfx: null,
  params: { zoom: 1.06, roll: 0, strength: 1, micro: false, mode: "push" },
  plan: function (layer, o, S) {
    if (o.mode === "cut") return tlkPlanCut(layer, o, S);
    if (o.micro || layer instanceof TextLayer) return tlkPlanMicro(layer, o, S);
    return tlkPlanPush(layer, o, S);
  },
  run: function (layer, o, S, plan) {
    if (plan.kind === "cut") tlkRunCut(layer, o, S, plan);
    else if (plan.kind === "micro") tlkRunMicro(layer, o, S, plan);
    else tlkRunPush(layer, o, S, plan);
  }
};

// ---------------------------------------------------------------------------------------------------------------------
// №30 shake-hit (spec §5.4)
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Удары встряски композиции: времена пиков слайдера (ключи > 0) минус атака.
 * @param {any} cam
 * @returns {number[]} hit-времена, с
 */
function tlkShakeHits(cam) {
  var sl = tlkShakeAmt(cam);
  var hits = [];
  for (var k = 1; k <= sl.numKeys; k++) {
    if (sl.keyValue(k) > 0) hits.push(tlkKf(sl.keyTime(k) - TL_CAM.shake.attack));
  }
  return hits;
}

/** №30 shake-hit — кадр вздрагивает на тяжёлом ударе; ≤ 2 на ролик; в lesson/magazine выключен (spec §5.4). */
TL_MOVES["shake-hit"] = {
  group: "camera", slot: "accent", units: [], unit: "word",
  frames: { attack: 1.8, decay: 7.5 }, stagger: {}, over: 0, lead: 0, sfx: null,
  params: { amount: 6, strength: 1 },
  plan: function (layer, o, S) {
    var cam = tlkNeedCam(layer, "");
    if (S.name === "lesson" || S.name === "magazine") {
      return { n: 0, unit: "", starts: [], start: 0, hit: 0, end: 0, total: 0, unitFr: 0, staggerFr: 0, off: true, cam: cam };
    }
    if (!o.src) throw new Error("shake-hit: нужен src — результат kbMove удара (встряска «просто так» запрещена)");
    var okSrc = false;
    for (var i = 0; i < TL_CAM.shake.sources.length; i++) if (TL_CAM.shake.sources[i] === o.src.name) okSrc = true;
    if (!okSrc) throw new Error("shake-hit: удар «" + o.src.name + "» не тяжёлый");
    var h = tlkKf(o.src.hit);
    var prev = tlkShakeHits(cam);
    if (prev.length >= TL_CAM.shake.max) throw new Error("shake-hit: третий удар в «" + cam.comp.name + "» — не больше двух на ролик");
    var gap = "-";
    for (var j = 0; j < prev.length; j++) {
      var g = Math.abs(h - prev[j]) * 30;
      if (g < TL_CAM.shake.gapFr - 1e-6) throw new Error("shake-hit: зазор до удара " + g.toFixed(1) + " к. < " + TL_CAM.shake.gapFr);
      gap = g.toFixed(1);
    }
    return { n: 0, unit: "", starts: [], start: h, hit: h, end: tlkKf(h + TL_CAM.shake.decay), total: 0, unitFr: 0, staggerFr: 0, cam: cam, count: prev.length + 1, gap: gap,
      amount: o.amount * S.strength };
  },
  run: function (layer, o, S, plan) {
    if (plan.off) { kbLog("INFO shake-hit off (" + S.name + ")"); return; }
    var sh = TL_CAM.shake;
    var sl = tlkShakeAmt(plan.cam);
    tlkKeys(sl, [[plan.hit, 0], [tlkKf(plan.hit + sh.attack), plan.amount, "punch"], [tlkKf(plan.hit + sh.decay), 0, "punch"]], "tl-shake slider");
    kbLog("SHAKE " + plan.count + "/" + sh.max + " hit f" + (plan.hit * 30).toFixed(2) + " src " + o.src.name + "(" + o.src.from + ") amount " + plan.amount.toFixed(2) + " gap " + plan.gap);
  }
};

// ---------------------------------------------------------------------------------------------------------------------
// №31 whip-paper (spec §5.5)
// ---------------------------------------------------------------------------------------------------------------------

/** №31 whip-paper — рывок по одному длинному листу: сцена B лежит справа, лист едет вместе, смаз даёт AE; в lesson → cam-push(cut) (spec §5.5). */
TL_MOVES["whip-paper"] = {
  group: "camera", slot: "in", units: [], unit: "word",
  frames: { antic: 4, whip: 9 }, stagger: {}, over: 0, lead: 2, sfx: null,
  params: { dir: "next", axis: "x", strength: 1 },
  plan: function (layer, o, S) {
    if (S.name === "lesson") { // подмена режима — тем же кодом, что и в run (spec-check S7)
      if (!o.from || !o.target) throw new Error("whip-paper→cut: нужны from и target");
      return tlkPlanCut(layer, o, S);
    }
    var cam = tlkNeedCam(layer, "");
    var W = TL_CAM.whip;
    var anticFr = Math.max(1, Math.round(W.anticFr * S.dur));
    var whipFr = Math.max(1, Math.round(W.frames * S.dur));
    var total = anticFr + whipFr;
    var start, hit;
    if (o.at !== undefined && o.start === undefined) {
      hit = tlkKf(Math.round((o.at - W.lead / 30) * 30) / 30);
      start = tlkKf(hit - total / 30);
    } else if (o.start !== undefined && o.at === undefined) {
      start = tlkKf(o.start);
      hit = tlkKf(start + total / 30);
    } else {
      throw new Error("нужно ровно одно из at | start");
    }
    return { n: 0, unit: "", starts: [], start: start, hit: hit, end: hit, total: total, unitFr: total, staggerFr: 0, kind: "whip", cam: cam,
      anticFr: anticFr, whipFr: whipFr, amp: W.antic * S.strength };
  },
  run: function (layer, o, S, plan) {
    if (plan.kind === "cut") {
      kbLog("SWAP whip-paper→cam-push(cut) (" + S.name + ", в run)");
      tlkRunCut(layer, o, S, plan);
      return;
    }
    var cam = plan.cam;
    var W = TL_CAM.whip;
    var why = tlCamWhy(o, "whip-paper");
    var A = o.out;
    var B = o["in"];
    if (!A || !B) throw new Error("whip-paper: нужны out (сцена A) и in (сцена B)");
    var fs = Math.round(plan.start * 30);
    var fh = Math.round(plan.hit * 30);
    var st = tlkRest(cam, plan.start);
    if (Math.abs(st.z - 1) > 1e-6 || Math.abs(st.r) > 1e-6) throw new Error("whip-paper: сначала вернуть зум 1 и крен 0");
    tlCamBusy(cam, fs, fh);
    var vert = o.axis === "y";
    var d = o.dir === "back" ? -1 : 1;
    var dist = vert ? cam.H : cam.W;
    var ax = vert ? [0, 1] : [1, 0];
    var posA = kbProp(A, ["ADBE Transform Group", "ADBE Position"]).value;
    kbProp(B, ["ADBE Transform Group", "ADBE Position"]).setValue([posA[0] + d * dist * ax[0], posA[1] + d * dist * ax[1]]); // до ключей рига
    var P0 = st.P;
    var tA = tlkKf(plan.start + plan.anticFr / 30);
    tlkKeys(kbProp(cam.rig, ["ADBE Transform Group", "ADBE Position"]), [
      [plan.start, [P0[0], P0[1]]],
      [tA, [P0[0] + plan.amp * d * ax[0], P0[1] + plan.amp * d * ax[1]], W.ease],
      [plan.hit, [P0[0] - dist * d * ax[0], P0[1] - dist * d * ax[1]], W.ease]], "tl-rig Position");
    B.inPoint = plan.start;
    A.outPoint = tlkKf(plan.hit + 1 / 30);
    A.motionBlur = true; B.motionBlur = true; cam.sheet.motionBlur = true;
    var cv = tlCamCover(cam, fs, fh);
    if (cv.min < 2) throw new Error("whip-paper: лист не накрывает кадр (COVER " + cv.min.toFixed(2) + " < 2 px) — нужен span ≥ 2 по оси");
    tlSfxMarker(cam.rig, tlCeilFrame(tA), "whoosh", 0.5 * S.strength);
    kbLog("WHIP start f" + fs + " antic f" + fs + "–f" + (fs + plan.anticFr) + " +" + plan.amp.toFixed(1) + " whip f" + (fs + plan.anticFr) + "–f" + fh + " span " + dist + " dir " + (o.dir || "next") +
      " axis " + (vert ? "y" : "x") + " hit f" + fh + " why " + why);
    var sp = tlCamSpeed(cam, fs, fh, "whip-paper");
    tlkBand(sp.v.slice(0, plan.anticFr + 1), "whip-paper", "antic");
    var w = [0];
    for (var i = plan.anticFr + 1; i < sp.v.length; i++) w.push(sp.v[i]);
    tlkBand(w, "whip-paper", "whip");
  }
};

// ---------------------------------------------------------------------------------------------------------------------
// +1 iris-hand: круг от руки (spec §5.6)
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Геометрия кольца вокруг слова (формулы circle-marker): центр, полуоси a, b, толщина t.
 * @param {any} word текстовый слой
 * @returns {{cx: number, cy: number, a: number, b: number, t: number, em: number, cap: number}}
 */
function tlkIrisGeo(word) {
  var I = TL_CAM.iris;
  var em = tlFontSize(word);
  var cap = tlkCapOf(word);
  var ink = tlmInk(word);
  return { cx: (ink.l + ink.r) / 2, cy: ink.base - cap / 2, a: (ink.r - ink.l) / 2 + I.pad[0] * em, b: cap / 2 + I.pad[1] * em, t: I.thick * cap, em: em, cap: cap };
}

/**
 * Вершины дырки (замкнутый суперэллипс, 72 вершины).
 * @param {{cx: number, cy: number, a: number, b: number}} g
 * @param {number} seed
 * @returns {number[][]}
 */
function tlkIrisPts(g, seed) {
  var I = TL_CAM.iris;
  var r = tlOvalPoints({ cx: g.cx, cy: g.cy, a: g.a, b: g.b, seed: seed, tilt: I.tilt, turns: 1, flare: 0, tail: 0, count: I.verts + 1, quiet: true });
  return r.points.slice(0, I.verts);
}

/**
 * Shape дырки в системе слоя крышки: v_layer = v_world·s вокруг c − (позиция листа − центр Solid); касательные — замкнутый Catmull-Rom/6, ×s.
 * @param {number[][]} pts
 * @param {number[]} c центр масштабирования, мир
 * @param {number} s
 * @param {number[]} off позиция листа − (W_s/2, H_s/2)
 * @returns {Shape}
 */
function tlkIrisShape(pts, c, s, off) {
  var n = pts.length;
  var vs = [], tin = [], tout = [];
  for (var i = 0; i < n; i++) {
    var v = pts[i];
    var pr = pts[(i + n - 1) % n];
    var nx = pts[(i + 1) % n];
    vs.push([c[0] + s * (v[0] - c[0]) - off[0], c[1] + s * (v[1] - c[1]) - off[1]]);
    var tg = [(nx[0] - pr[0]) / 6 * s, (nx[1] - pr[1]) / 6 * s];
    tout.push(tg);
    tin.push([-tg[0], -tg[1]]);
  }
  var sh = new Shape();
  sh.vertices = /** @type {any} */ (vs);
  sh.inTangents = /** @type {any} */ (tin);
  sh.outTangents = /** @type {any} */ (tout);
  sh.closed = true;
  return sh;
}

/**
 * s_max раскрытия: 1,03 × наибольшая «норма» угла кадра в суперэллипсе n = 3 с наклоном (дырка на последнем кадре накрывает кадр целиком).
 * @param {{cx: number, cy: number, a: number, b: number}} g
 * @param {number} W
 * @param {number} H
 * @returns {number}
 */
function tlkIrisSmax(g, W, H) {
  var I = TL_CAM.iris;
  var th = I.tilt * Math.PI / 180;
  var corners = [[0, 0], [W, 0], [0, H], [W, H]];
  var best = 0;
  for (var i = 0; i < 4; i++) {
    var dx = corners[i][0] - g.cx;
    var dy = corners[i][1] - g.cy;
    var xr = dx, yr = -dy;
    var X = xr * Math.cos(th) - yr * Math.sin(th);
    var Y = xr * Math.sin(th) + yr * Math.cos(th);
    var nm = Math.pow(Math.pow(Math.abs(X) / g.a, 3) + Math.pow(Math.abs(Y) / g.b, 3), 1 / 3);
    if (nm > best) best = nm;
  }
  return I.over * best;
}

/**
 * Рамки чернил текстовых слоёв сцены, кроме одного (для зазоров кольца).
 * @param {CompItem} comp
 * @param {any} except
 * @returns {any[]}
 */
function tlkTextBoxes(comp, except) {
  var boxes = [];
  for (var i = 1; i <= comp.numLayers; i++) {
    var L = comp.layer(i);
    if (!(L instanceof TextLayer) || L.index === except.index) continue;
    var ink = tlkInk(L, 0);
    boxes.push({ l: ink.l, t: ink.top, r: ink.r, b: ink.bottom });
  }
  return boxes;
}

/** +1 iris-hand — круг маркером на слове, фон уходит в бумагу, круг сжимается в точку; из точки раскрывается следующая сцена (spec §5.6). lesson/magazine → cut. */
TL_MOVES["iris-hand"] = {
  group: "camera", slot: "out", units: [], unit: "word",
  frames: { draw: 10, hold: 4, fade: 6, close: 10, paper: 2, open: 10 }, stagger: {}, over: 0, lead: 0, sfx: null,
  params: { seed: 11, strength: 1 },
  plan: function (layer, o, S) {
    var cam = tlkNeedCam(layer, "");
    if (S.name === "lesson" || S.name === "magazine") { // подмена режима тем же кодом, что в run
      var start0 = tlkStartOf(o, 0);
      var from = tlkWordScreen(o.word, cam, start0);
      var gB = tlkIrisGeo(o.wordIn);
      var target = tlkSceneToWorld(o["in"], [gB.cx, gB.cy], start0);
      var o2 = {};
      for (var k in o) o2[k] = o[k];
      o2.from = from; o2.target = target;
      return tlkPlanCut(layer, o2, S);
    }
    if (S.name !== "hand" && S.name !== "brisk") throw new Error("iris-hand: стиль " + S.name + " не поддержан");
    var I = TL_CAM.iris;
    var m = S.name === "brisk" ? 0.7 : 1;
    var fr = function (x) { return Math.max(1, Math.round(x * m)); };
    var draw = fr(I.draw), hold = fr(I.hold), fade = fr(I.fade), close = fr(I.close), paper = fr(I.paper), open = fr(I.open);
    var f = { draw: draw, fade0: draw + hold, close0: draw + hold + fade, close1: draw + hold + fade + close };
    f.open0 = f.close1 + paper;
    f.open1 = f.open0 + open;
    f.paper = paper; f.close = close; f.open = open;
    var start = tlkStartOf(o, 0);
    return { n: 0, unit: "", starts: [], start: start, hit: tlkKf(start + f.open1 / 30), end: tlkKf(start + f.open1 / 30), total: f.open1, unitFr: f.open1, staggerFr: 0,
      kind: "iris", cam: cam, f: f };
  },
  run: function (layer, o, S, plan) {
    if (plan.kind === "cut") {
      kbLog("SWAP iris-hand→cam-push(cut) (" + S.name + ", в run)");
      tlkRunCut(layer, o, S, plan);
      return;
    }
    var cam = plan.cam;
    var I = TL_CAM.iris;
    var f = plan.f;
    var why = tlCamWhy(o, "iris-hand");
    var A = o.out, B = o["in"];
    if (!A || !B || !o.word || !o.wordIn) throw new Error("iris-hand: нужны out, in, word, wordIn");
    var fs = Math.round(plan.start * 30);
    var tAt = function (k) { return tlkKf((fs + k) / 30); };
    // камера стоит в окне (spec §5.6)
    var winProps = [tlkLnZ(cam), kbProp(cam.rig, ["ADBE Transform Group", "ADBE Position"]), kbProp(cam.rig, ["ADBE Transform Group", "ADBE Rotate Z"]), kbProp(cam.rig, ["ADBE Transform Group", "ADBE Anchor Point"])];
    for (var wp = 0; wp < winProps.length; wp++) {
      for (var wk = 1; wk <= winProps[wp].numKeys; wk++) {
        var kt = winProps[wp].keyTime(wk);
        if (kt > tAt(-TL_CAM.gap) - 1e-6 && kt < tAt(f.open1 + TL_CAM.gap) + 1e-6) throw new Error("iris-hand: у рига есть ключи в окне f" + (kt * 30).toFixed(2));
      }
    }
    var sheetPos = tlkT(cam.sheet, "ADBE Position", 0, true);
    var src = /** @type {any} */ (cam.sheet).source;
    var off = [sheetPos[0] - src.width / 2, sheetPos[1] - src.height / 2];
    var gA = tlkIrisGeo(o.word);
    var gB = tlkIrisGeo(o.wordIn);
    var color = o.color || (TL_S.palette && TL_S.palette.en) || KB_COLOR.blue;
    // тело кольца: те же формулы, что у circle-marker
    var boxes = tlkTextBoxes(A.source, o.word);
    var oval = tlOvalPoints({ cx: gA.cx, cy: gA.cy, a: gA.a, b: gA.b, seed: o.seed, em: gA.em, thickness: gA.t, boxes: boxes, name: "iris" });
    var ring = tlHandPath(cam.comp, { name: "tl-iris-ring", points: oval.points, color: color, thickness: gA.t, start: plan.start, frames: f.draw, ease: "snap",
      taper: true, rough: true, boil: true, parent: cam.rig, seed: o.seed });
    ring.comment = "tl-iris-ring";
    kbProp(ring, ["ADBE Transform Group", "ADBE Anchor Point"]).setValue([gA.cx, gA.cy]);
    kbProp(ring, ["ADBE Transform Group", "ADBE Position"]).setValue([gA.cx, gA.cy]);
    // крышка = копия листа: то же волокно (зонд Q6)
    var cover = /** @type {AVLayer} */ (cam.sheet.duplicate());
    cover.name = "tl-iris-cover";
    cover.comment = "tl-iris-cover";
    var top = A.index < B.index ? A : B;
    cover.moveBefore(top);
    ring.moveBefore(cover);
    var covOp = kbProp(cover, ["ADBE Transform Group", "ADBE Opacity"]);
    tlkKeys(covOp, [[tAt(f.fade0), 0], [tAt(f.close0), 100, "soft"]], "tl-iris-cover Opacity");
    cover.inPoint = tAt(f.fade0);
    cover.outPoint = tAt(f.open1 + 1);
    var masks = kbGroup(cover, ["ADBE Mask Parade"]);
    var mask = /** @type {MaskPropertyGroup} */ (kbAdd(masks, "ADBE Mask Atom")); // ae-ok: matchname
    mask.maskMode = MaskMode.SUBTRACT;
    mask.maskMotionBlur = MaskMotionBlur.OFF;
    var shapeP = kbProp(mask, ["ADBE Mask Shape"]); // ae-ok: matchname
    var ptsA = tlkIrisPts(gA, o.seed);
    var ptsB = tlkIrisPts(gB, o.seed);
    var cA = [gA.cx, gA.cy], cB = [gB.cx, gB.cy];
    var smax = tlkIrisSmax(gB, cam.W, cam.H);
    var scaleP = kbProp(ring, ["ADBE Transform Group", "ADBE Scale"]);
    var k, u, s;
    var sClose = [], sOpen = [];
    for (k = 0; k <= f.close; k++) {
      s = 1 - tlkBz(k / f.close, I.ease);
      sClose.push(s);
      shapeP.setValueAtTime(tAt(f.close0 + k), tlkIrisShape(ptsA, cA, s, off));
      scaleP.setValueAtTime(tAt(f.close0 + k), [100 * s, 100 * s, 100]);
    }
    for (k = 0; k <= f.open; k++) {
      s = smax * tlkBz(k / f.open, I.ease);
      sOpen.push(s);
      shapeP.setValueAtTime(tAt(f.open0 + k), tlkIrisShape(ptsB, cB, s, off));
    }
    for (k = 1; k <= shapeP.numKeys; k++) shapeP.setInterpolationTypeAtKey(k, KeyframeInterpolationType.LINEAR);
    for (k = 1; k <= scaleP.numKeys; k++) scaleP.setInterpolationTypeAtKey(k, KeyframeInterpolationType.LINEAR);
    ring.outPoint = tAt(f.close1);
    A.outPoint = tAt(f.close1);
    B.inPoint = tAt(f.open0);
    tlSfxMarker(cam.rig, tlCeilFrame(plan.start), "marker", 0.8);
    kbLog("IRIS close «" + o.word.name + "» center (" + gA.cx.toFixed(1) + "," + gA.cy.toFixed(1) + ") a " + gA.a.toFixed(1) + " b " + gA.b.toFixed(1) + " t " + gA.t.toFixed(1) +
      " draw f" + fs + "–f" + (fs + f.draw) + " fade f" + (fs + f.fade0) + "–f" + (fs + f.close0) + " close f" + (fs + f.close0) + "–f" + (fs + f.close1) + " | open «" + o.wordIn.name + "» center (" +
      gB.cx.toFixed(1) + "," + gB.cy.toFixed(1) + ") a " + gB.a.toFixed(1) + " b " + gB.b.toFixed(1) + " smax " + smax.toFixed(3) + " f" + (fs + f.open0) + "–f" + (fs + f.open1) +
      " | cover " + cover.name + " verts " + I.verts + " why " + why);
    var sl = [];
    for (k = 0; k < sClose.length; k++) sl.push(sClose[k].toFixed(4));
    kbLog("IRIS s close " + sl.join(" "));
    var so = [];
    for (k = 0; k < sOpen.length; k++) so.push(sOpen[k].toFixed(4));
    kbLog("IRIS s open " + so.join(" "));
  }
};

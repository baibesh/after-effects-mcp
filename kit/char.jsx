// Персонаж урока: композиция из поз и накладок лица (моргание, брови, рот по огибающей голоса), посадка в сцену, портрет и аватар.
// Данные: KB_RIG (reels/<unit>/rig.jsx ← tools/rig-to-jsx.mjs), рот — KB_MOUTH (reels/<unit>/voice.jsx ← tools/bake-voice.mjs).
// Каталог — kit/README.md «Урок: персонаж и голос». ES3. Времена — секунды композиции, в которую кладётся слой.

//@include "core.jsx"
//@include "motion.jsx"
//@include "footage.jsx"

/** Кадр 1/30 с. */
var KB_F = 1 / 30;

/** Трансформ слоя по короткому ключу. */
var KB_TR = { anchor: "ADBE Anchor Point", pos: "ADBE Position", scale: "ADBE Scale", rot: "ADBE Rotate Z", rotY: "ADBE Rotate Y", op: "ADBE Opacity" };

/**
 * Свойство трансформа слоя.
 * @param {any} layer
 * @param {string} key anchor | pos | scale | rot | rotY | op
 * @returns {Property}
 */
function kbTr(layer, key) {
  return kbProp(layer, ["ADBE Transform Group", KB_TR[key]]);
}

// ─── время ──────────────────────────────────────────────────────────────────────────────

/**
 * Время ключа hold, сдвинутое на 0,02 с раньше границы кадра: затвор открыт вокруг кадра и без сдвига показал бы два состояния.
 * @param {number} t
 * @returns {number}
 */
function kbHT(t) {
  if (t <= 0.001) return 0;
  return Math.max(0, Math.round(t * 30) / 30 - 0.02);
}

/**
 * То же «на двойках» (чётные кадры, 15 к/с) — для рта.
 * @param {number} t
 * @returns {number}
 */
function kbHT2(t) {
  if (t <= 0.001) return 0;
  return Math.max(0, Math.round(t * 15) / 15 - 0.02);
}

/**
 * Ступенчатые ключи (hold).
 * @param {Property} prop
 * @param {number[]} times
 * @param {any[]} values
 */
function kbHold(prop, times, values) {
  var i;
  for (i = 0; i < times.length; i++) prop.setValueAtTime(times[i], values[i]);
  for (i = 0; i < times.length; i++) {
    var k = prop.nearestKeyIndex(times[i]);
    prop.setInterpolationTypeAtKey(k, KeyframeInterpolationType.HOLD, KeyframeInterpolationType.HOLD);
  }
}

/**
 * Слить пересекающиеся отрезки [a, b].
 * @param {number[][]} segs
 * @returns {number[][]}
 */
function kbMerge(segs) {
  var list = segs.slice(0);
  list.sort(function (p, q) { return p[0] - q[0]; });
  var out = [];
  for (var i = 0; i < list.length; i++) {
    var s = list[i];
    if (s[1] <= s[0] + 0.001) continue;
    var last = out.length ? out[out.length - 1] : null;
    if (last && s[0] <= last[1] + 0.001) {
      if (s[1] > last[1]) last[1] = s[1];
    } else {
      out.push([s[0], s[1]]);
    }
  }
  return out;
}

/**
 * Пересечение отрезков двух списков.
 * @param {number[][]} segsA
 * @param {number[][]} segsB
 * @returns {number[][]}
 */
function kbClip(segsA, segsB) {
  var out = [];
  for (var i = 0; i < segsA.length; i++) {
    for (var j = 0; j < segsB.length; j++) {
      var a = Math.max(segsA[i][0], segsB[j][0]);
      var b = Math.min(segsA[i][1], segsB[j][1]);
      if (b > a + 0.001) out.push([a, b]);
    }
  }
  return out;
}

/**
 * Слой виден только на отрезках (hold-ключи непрозрачности).
 * @param {AVLayer} layer
 * @param {number[][]} segs
 * @param {number=} hi непрозрачность на отрезке, % (по умолчанию 100)
 */
function kbVis(layer, segs, hi) {
  var op = kbTr(layer, "op");
  var top = hi === undefined ? 100 : hi;
  var m = kbMerge(segs);
  if (!m.length) {
    op.setValue(0);
    return;
  }
  var times = [];
  var vals = [];
  if (m[0][0] > 0.001) {
    times.push(0);
    vals.push(0);
  }
  for (var i = 0; i < m.length; i++) {
    times.push(m[i][0]);
    vals.push(top);
    times.push(m[i][1]);
    vals.push(0);
  }
  kbHold(op, times, vals);
}

// ─── моргание ───────────────────────────────────────────────────────────────────────────

/**
 * Ряд морганий от seed: интервалы minGap…maxGap, времена кратны кадру. Один seed — один и тот же ряд (Math.random нельзя).
 * @param {number} seed целое > 0
 * @param {number} t0 с
 * @param {number} t1 с
 * @param {{minGap?: number, maxGap?: number}=} opts интервал между морганиями, с (по умолчанию 2,4…5,2)
 * @returns {number[]}
 */
function kbBlinks(seed, t0, t1, opts) {
  var o = opts || {};
  var lo = o.minGap === undefined ? 2.4 : o.minGap;
  var hi = o.maxGap === undefined ? 5.2 : o.maxGap;
  var state = Math.abs(Math.floor(seed)) % 2147483647 || 1;
  var out = [];
  var t = t0 + lo * 0.5;
  while (t < t1 - 0.3) {
    out.push(Math.round(t * 30) / 30);
    state = (state * 16807) % 2147483647;
    t += lo + (hi - lo) * (state / 2147483647);
  }
  return out;
}

/**
 * Моргания без попадания на смену позы (±0,3 с) и внутри окон `skip` ([a, b]), плюс обязательные (keep, кратно кадру).
 * @param {number[]} times
 * @param {number[]} poseTimes
 * @param {number[]} keep
 * @param {number[][]=} skip
 * @returns {number[]}
 */
function kbBlinkFree(times, poseTimes, keep, skip) {
  var out = [];
  var i;
  var j;
  for (i = 0; i < times.length; i++) {
    var ok = true;
    for (j = 0; j < poseTimes.length; j++) if (Math.abs(times[i] - poseTimes[j]) < 0.3) ok = false;
    for (j = 0; skip && j < skip.length; j++) if (times[i] > skip[j][0] && times[i] < skip[j][1]) ok = false;
    if (ok) out.push(times[i]);
  }
  for (i = 0; i < keep.length; i++) out.push(Math.round(keep[i] * 30) / 30);
  out.sort(function (a, b) { return a - b; });
  return out;
}

// ─── персонаж из поз и накладок лица ────────────────────────────────────────────────────

/**
 * Накладка допустима на позе: лицевые — только на позах с face_patches_ok (кроме talk3q), накладка с onlyOn — на своей позе.
 * @param {any} r запись персонажа в KB_RIG
 * @param {string} patch
 * @param {string} pose
 * @returns {boolean}
 */
function kbPatchOk(r, patch, pose) {
  var f = r.face[patch];
  if (f.onlyOn) return pose === f.onlyOn;
  var own = kbPatchPose(r, patch);
  if (own) return pose === own;
  return r.poses[pose].ok && pose !== "talk3q";
}

/**
 * Накладка своей позы по имени «<база>_<поза>» (eyes_half_cook, eyes_closed_folder3q-R): поза, если она есть в риге, иначе "".
 * Такая накладка работает только на своей позе и получает события базы (eyes_half, eyes_closed …).
 * @param {any} r запись персонажа в KB_RIG
 * @param {string} patch
 * @returns {string}
 */
function kbPatchPose(r, patch) {
  var bases = ["eyes_half_", "eyes_closed_", "mouth_small_", "mouth_open_", "mouth_wide_", "brows_up_"];
  for (var i = 0; i < bases.length; i++) {
    if (patch.indexOf(bases[i]) === 0) {
      var pose = patch.substring(bases[i].length);
      if (r.poses[pose]) return pose;
    }
  }
  return "";
}

/**
 * События накладок: имя → отрезки [a, b] в секундах композиции персонажа (уже со сдвигом hold).
 * Какие накладки есть, решает rig.json: у персонажа с eyes_half моргание трёхступенчатое (полуприкрыт → закрыт → полуприкрыт, 7 кадров),
 * без него — eyes_closed на 3 кадра; рот: уровень 3 → mouth_wide (если нет — mouth_open), 2 → mouth_open, 1 → mouth_small (если нет — закрыт);
 * у каждой накладки есть двойник «<имя>_3q» (only_on: своя ¾-поза) — события получают оба.
 * @param {any} r запись персонажа в KB_RIG
 * @param {any} cfg
 * @returns {any}
 */
function kbCharEvents(r, cfg) {
  var ev = {};
  var i;
  function has(name) { return !!r.face[name]; }
  function add(name, a, b) {
    if (!has(name)) return;
    if (!ev[name]) ev[name] = [];
    ev[name].push([a, b]);
  }
  // накладки ¾-позы живут под тем же именем с суффиксом _3q (у них only_on: работают только на своей позе)
  // и накладки своей позы «<имя>_<поза>» (kbPatchPose): видны только на своей позе
  function add2(name, a, b) {
    add(name, a, b);
    add(name + "_3q", a, b);
    for (var pz in r.poses) add(name + "_" + pz, a, b);
  }
  var bl = cfg.blinks || [];
  for (i = 0; i < bl.length; i++) {
    var t = bl[i];
    if (has("eyes_half")) {
      add2("eyes_half", kbHT(t), kbHT(t + 2 * KB_F));
      add2("eyes_closed", kbHT(t + 2 * KB_F), kbHT(t + 5 * KB_F));
      add2("eyes_half", kbHT(t + 5 * KB_F), kbHT(t + 7 * KB_F));
    } else {
      add2("eyes_closed", kbHT(t), kbHT(t + 3 * KB_F));
    }
  }
  var br = cfg.brows || [];
  for (i = 0; i < br.length; i++) add2("brows_up", kbHT(br[i][0]), kbHT(br[i][1]));
  var mo = cfg.mouth || [];
  for (i = 0; i < mo.length; i++) {
    var a = kbHT2(mo[i][0]);
    var b = kbHT2(mo[i][1]);
    var lv = mo[i][2];
    if (lv === 3 && has("mouth_wide")) {
      add2("mouth_wide", a, b);
    } else if (lv >= 2) {
      add2("mouth_open", a, b);
    } else {
      add2("mouth_small", a, b);
    }
  }
  return ev;
}

/**
 * Рот без звука (заглушка до voice/mouth): на каждое слово — цикл «открыт 0,14 / приоткрыт 0,06»,
 * пока слово звучит (не дольше 0,6 с от начала). Первый кадр клипа — открыт.
 * @param {number[]} words начала слов
 * @param {number} clipEnd конец клипа
 * @returns {number[][]} [[a, b, уровень 2|1]]
 */
function kbMouthMock(words, clipEnd) {
  var out = [];
  for (var i = 0; i < words.length; i++) {
    var ws = words[i];
    var next = i + 1 < words.length ? words[i + 1] - 0.06 : clipEnd - 0.04;
    var span = Math.min(next, ws + 0.6);
    var k = 0;
    while (ws + k * 0.2 + 0.14 <= span + 0.05) {
      out.push([ws + k * 0.2, ws + k * 0.2 + 0.14, 2]);
      out.push([ws + k * 0.2 + 0.14, ws + k * 0.2 + 0.2, 1]);
      k++;
    }
  }
  return out;
}

/**
 * Композиция персонажа 1024×1024: по слою на позу (видна одна, hold-ключи) и по слою на накладку лица.
 * @param {any} rig KB_RIG
 * @param {string} dir каталог ассетов (KB_ASSET_DIR, со слэшем)
 * @param {string} who ключ в KB_RIG
 * @param {string} name имя композиции
 * @param {{dur: number, poses: any[][], blinks?: number[], brows?: number[][], mouth?: number[][]}} cfg
 *   poses — [[время, поза, режим жеста 0|1|2]], первая запись на 0 · blinks — начала морганий (kbBlinks) ·
 *   brows — [[от, до]] · mouth — [[от, до, уровень 1 small | 2 open | 3 wide]] (огибающая голоса, tools/bake-voice.mjs)
 * @returns {CompItem}
 */
function kbCharComp(rig, dir, who, name, cfg) {
  var r = rig[who];
  var comp = app.project.items.addComp(name, 1024, 1024, 1, cfg.dur, 30);
  comp.motionBlur = false;
  var tl = cfg.poses;
  var poseSegs = {};
  var order = [];
  var i;
  var j;
  for (i = 0; i < tl.length; i++) {
    var a = i === 0 ? 0 : kbHT(tl[i][0]);
    var b = i + 1 < tl.length ? kbHT(tl[i + 1][0]) : cfg.dur + 5;
    var p = tl[i][1];
    if (!poseSegs[p]) {
      poseSegs[p] = [];
      order.push(p);
    }
    poseSegs[p].push([a, b]);
  }
  for (i = 0; i < order.length; i++) {
    if (!r.poses[order[i]]) throw new Error("Нет позы «" + order[i] + "» у «" + who + "» в rig.json");
    var item = kbImport(dir + r.poses[order[i]].file);
    var layer = comp.layers.add(item);
    layer.name = "pose-" + order[i];
    kbVis(layer, poseSegs[order[i]]);
  }
  var ev = kbCharEvents(r, cfg);
  var names = [];
  var pn;
  for (pn in r.face) names.push(pn);
  for (i = 0; i < names.length; i++) {
    pn = names[i];
    if (!ev[pn]) continue;
    var valid = [];
    for (j = 0; j < order.length; j++) {
      if (kbPatchOk(r, pn, order[j])) valid = valid.concat(poseSegs[order[j]]);
    }
    var segs = kbClip(kbMerge(ev[pn]), kbMerge(valid));
    if (!segs.length) continue;
    var f = r.face[pn];
    var pitem = kbImport(dir + f.file);
    var pl = comp.layers.add(pitem);
    pl.name = pn;
    kbTr(pl, "pos").setValue([f.pos[0] + pitem.width / 2, f.pos[1] + pitem.height / 2]);
    kbVis(pl, segs);
  }
  return comp;
}

/**
 * Нажим «сквош»: слайдер 0 → amount → −amount·0,67 → 0 вокруг времени t (проценты).
 * @param {Property} slider
 * @param {number} t
 * @param {number} amount
 * @param {number=} lead
 */
function kbSquashAt(slider, t, amount, lead) {
  var l = lead === undefined ? 0.133 : lead;
  slider.setValueAtTime(Math.max(0, t - l), 0);
  slider.setValueAtTime(t, amount);
  slider.setValueAtTime(t + 0.04, -amount * 0.67);
  slider.setValueAtTime(t + 0.1, 0);
}

/**
 * Слой персонажа в сцене: 3D, якорь в подошвах, дыхание «на двойках», сквош на жестах (режим 1 — большой, 2 — малый).
 * @param {CompItem} host
 * @param {CompItem} charComp композиция из kbCharComp
 * @param {{x: number, y: number, z: number, scale: number, phase?: number, name?: string, poses?: any[][], feet?: number[]}} o
 *   x, y, z — где стоят подошвы · scale — % · phase — сдвиг дыхания, с · poses — та же таблица, что у kbCharComp (для сквоша) ·
 *   feet — подошвы на холсте персонажа (по умолчанию [512, 987])
 * @returns {{layer: AVLayer, slider: Property}}
 */
function kbPlaceChar(host, charComp, o) {
  var layer = host.layers.add(charComp);
  layer.name = o.name || charComp.name;
  layer.threeDLayer = true;
  layer.motionBlur = false; // «на двойках»: размытие поверх posterizeTime даёт двойной контур
  var feet = o.feet || [512, 987];
  kbTr(layer, "anchor").setValue([feet[0], feet[1], 0]);
  kbTr(layer, "pos").setValue([o.x, o.y, o.z]);
  kbTr(layer, "scale").setValue([o.scale, o.scale, o.scale]);
  var fx = kbEffect(layer, "ADBE Slider Control");
  fx.name = "squash";
  var slider = kbProp(fx, ["ADBE Slider Control-0001"]);
  kbTr(layer, "scale").expression =
    "posterizeTime(15);\n" +
    "var s = value;\n" +
    "var k = 0.018 * Math.sin((time + " + (o.phase || 0) + ") * 2 * Math.PI / 2.8);\n" +
    "var q = effect(\"squash\")(1) / 100;\n" +
    "var h = s[1] * (1 + k) * (1 - q);\n" +
    "var w = s[0] * (1 - k * 0.45) * (1 + q * 0.5);\n" +
    "[w, h, s[2]];";
  var tl = o.poses || [];
  for (var i = 1; i < tl.length; i++) {
    if (tl[i][2] === 1) kbSquashAt(slider, kbHT(tl[i][0]), 3, 0.133);
    if (tl[i][2] === 2) kbSquashAt(slider, kbHT(tl[i][0]), 2.5, 0.04);
  }
  return { layer: layer, slider: slider };
}

/**
 * Закончить сквош: мягкий easing на все ключи слайдера.
 * @param {{layer: AVLayer, slider: Property}} life результат kbPlaceChar
 */
function kbLifeDone(life) {
  var prop = life.slider;
  if (prop.numKeys === 0) return;
  for (var k = 1; k <= prop.numKeys; k++) {
    prop.setTemporalEaseAtKey(k, /** @type {any} */ ([new KeyframeEase(0, KB_EASE.soft.into)]), /** @type {any} */ ([new KeyframeEase(0, KB_EASE.soft.out)]));
  }
}

// ─── портрет и аватар ───────────────────────────────────────────────────────────────────

/**
 * Круглая маска вокруг точки (cx, cy) радиусом r (координаты слоя, пиксели источника).
 * @param {AVLayer} layer
 * @param {number} cx
 * @param {number} cy
 * @param {number} r
 */
function kbMaskCircle(layer, cx, cy, r) {
  var mask = kbAdd(kbGroup(layer, ["ADBE Mask Parade"]), "ADBE Mask Atom"); // ae-ok: matchname
  var k = 0.5523 * r;
  var shape = new Shape();
  shape.vertices = [[cx, cy - r], [cx + r, cy], [cx, cy + r], [cx - r, cy]];
  shape.inTangents = [[-k, 0], [0, -k], [k, 0], [0, k]];
  shape.outTangents = [[k, 0], [0, k], [-k, 0], [0, -k]];
  shape.closed = true;
  kbProp(mask, ["ADBE Mask Shape"]).setValue(shape); // ae-ok: matchname
}

/**
 * Маска-прямоугольник с мягким нижним краем (голова и плечи, ниже тают): растушёвка по вертикали.
 * @param {AVLayer} layer
 * @param {number} x0
 * @param {number} y0
 * @param {number} x1
 * @param {number} y1
 * @param {number} feather px
 */
function kbMaskBust(layer, x0, y0, x1, y1, feather) {
  var mask = kbAdd(kbGroup(layer, ["ADBE Mask Parade"]), "ADBE Mask Atom"); // ae-ok: matchname
  var shape = new Shape();
  shape.vertices = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  shape.inTangents = [[0, 0], [0, 0], [0, 0], [0, 0]];
  shape.outTangents = [[0, 0], [0, 0], [0, 0], [0, 0]];
  shape.closed = true;
  kbProp(mask, ["ADBE Mask Shape"]).setValue(shape); // ae-ok: matchname
  kbProp(mask, ["ADBE Mask Feather"]).setValue([0, feather]); // ae-ok: matchname
}

/**
 * Бюст-портрет в круге: композиция kbCharComp для ключа «<who>B» из KB_RIG (rig-to-jsx.mjs делает его из portrait в rig.json)
 * с круглой маской и центром в (x, y). Накладки глаз и рта живут так же, как у полноростового.
 * @param {CompItem} host
 * @param {CompItem} portraitComp композиция из kbCharComp(rig, dir, who + "B", …)
 * @param {{x: number, y: number, diameter: number, name?: string}} o
 * @returns {AVLayer}
 */
function kbPortrait(host, portraitComp, o) {
  var layer = host.layers.add(portraitComp);
  layer.name = o.name || portraitComp.name;
  kbMaskCircle(layer, 512, 512, 512);
  var s = (o.diameter / 1024) * 100;
  kbTr(layer, "anchor").setValue([512, 512]);
  kbTr(layer, "pos").setValue([o.x, o.y]);
  kbTr(layer, "scale").setValue([s, s]);
  return layer;
}

/**
 * Круглый аватар из готового файла (KB_AVATARS[who], 2x): ⌀ diameter на экране.
 * @param {CompItem} host
 * @param {string} path абсолютный путь (KB_ASSET_DIR + KB_AVATARS[who])
 * @param {{x: number, y: number, diameter: number, name?: string}} o
 * @returns {AVLayer}
 */
function kbAvatar(host, path, o) {
  var item = kbImport(path);
  var layer = host.layers.add(item);
  layer.name = o.name || "avatar";
  var s = (o.diameter / item.width) * 100;
  kbTr(layer, "anchor").setValue([item.width / 2, item.height / 2]);
  kbTr(layer, "pos").setValue([o.x, o.y]);
  kbTr(layer, "scale").setValue([s, s]);
  return layer;
}

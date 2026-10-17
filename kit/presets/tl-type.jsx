// Пресеты входа текста группы A (кроме rise): land, ... Подключать после tl-move.jsx (реестр TL_MOVES, tlPlan, tlAnimator).
// ES3, свойства только по matchName.

/**
 * №2 land — падение, касание со сплющиванием, затухающая дрожь.
 * Кадры единицы (hand): подскок-«вдох» 2, падение 6, касание на 8, оседание 10. Якорь масштаба — базовая линия буквы.
 * hit = касание последней единицы, end = hit + оседание. sfx thud на hit.
 * Стаггер линейный и дробный (0, 0,9, 1,8 … к. при 30 мс): hit = start + 8 + O, как в spec §6 (20,5 при старте 8).
 */
TL_MOVES["land"] = {
  group: "text-in", slot: "in", units: ["char", "word"], unit: "char",
  frames: { anticip: 2, travel: 6, settle: 10 }, stagger: { "char": 30, word: 80 },
  over: 0.06, lead: 2, sfx: { kind: "thud", strength: 1 }, fracStagger: true, staggerEase: "linear", // linear + дробные: soft + округление запускали S и O на одном кадре (cascade-fix.md §7)
  params: { from: 1.2, strength: 1, stagger_ease: "linear" },
  stills: [0, 0.25, 0.5, 0.75, 1, 1.25],
  plan: function (layer, o, S) {
    var a = Math.max(1, Math.round(2 * S.dur));
    var fall = Math.max(2, Math.round(6 * S.dur));
    var settle = Math.max(3, Math.round(10 * S.dur));
    /** @type {any} */
    var plan = tlPlan(layer, o, S, TL_MOVES["land"], a + fall, false); // hit планировщика = касание последней единицы
    plan.settle = settle;
    plan.end = plan.hit + settle / 30;
    plan.unitFr = a + fall + settle;
    return plan;
  },
  run: function (layer, o, S, plan) {
    var em = tlFontSize(layer);
    var A = o.strength * S.strength;
    var a = Math.max(1, Math.round(2 * S.dur));
    var fall = Math.max(2, Math.round(6 * S.dur));
    var T1 = a + fall;
    var Ts = plan.settle;
    var basedOn = plan.unit === "char" ? 2 : 3;
    var grouping = plan.unit === "char" ? 1 : 2;
    var from = o.from;
    // обратная вытяжка не выше потолка стиля
    var kneg = Math.min(1, S.overCap / (0.20 * A * Math.exp(-0.875)));
    if (kneg <= 0) kneg = 0;
    var pspan = 1.5 * em;
    // позиция: подскок, падение u²
    tlAnimator(layer, { name: "land-pos", basedOn: basedOn, grouping: grouping, align: [0, 0], prop: "ADBE Text Position 3D", fullValue: [0, -pspan, 0], rest: 0, span: -pspan,
      starts: plan.starts, keys: [[0, -from * em], [a, -(from + 0.1) * em, "soft"], [T1, 0, "fall"]] });
    // непрозрачность: 100 % уже на кадр раньше конца подскока (при плотном каскаде появление не вялое)
    tlAnimator(layer, { name: "land-op", basedOn: basedOn, grouping: grouping, align: [0, 0], prop: "ADBE Text Opacity", fullValue: 0, rest: 100, span: -100,
      starts: plan.starts, keys: [[0, 0], [Math.max(1, a - 1), 100, "soft"], [T1, 100]] });
    // масштаб: две оси двумя аниматорами (проверено без зонда P2); значения в процентах
    var kx = [[0, 100], [a, 104, "soft"], [T1 - 1, 100 - 8 * A, "fall"], [T1, 100 + 15 * A]];
    var ky = [[0, 100], [a, 100 - 6 * A, "soft"], [T1 - 1, 100 + 15 * A, "fall"], [T1, 100 - 20 * A]];
    var k;
    for (k = 1; k <= Ts; k++) {
      var u = k / Ts;
      var f = Math.exp(-3.5 * u) * Math.cos(4 * Math.PI * u);
      if (f < 0) f = f * kneg;
      if (k === Ts) f = 0;
      kx.push([T1 + k, 100 + 15 * A * f]);
      ky.push([T1 + k, 100 - 20 * A * f]);
    }
    tlAnimator(layer, { name: "land-sx", basedOn: basedOn, grouping: grouping, align: [0, 0], prop: "ADBE Text Scale 3D", fullValue: [200, 100, 100], rest: 100, span: 100,
      starts: plan.starts, keys: kx });
    tlAnimator(layer, { name: "land-sy", basedOn: basedOn, grouping: grouping, align: [0, 0], prop: "ADBE Text Scale 3D", fullValue: [100, 200, 100], rest: 100, span: 100,
      starts: plan.starts, keys: ky });
  }
};

/**
 * №3 slam — слово падает на бумагу из крупного размытия (хук, опенер).
 * Буква (hand): к. 0→6 масштаб 220→100 % и размытие 24→0 px (punch), непрозрачность 0→100 за 2 к. (soft).
 * Блок (масштаб слоя): start → hit → hit+8: 97 → 101 → 100 % (snap, затем soft). Якорь буквы — центр капители (Align y −42,1 %,
 * зонд probe-slam-align: 1 % = 0,8635 em/100, половина капители InterKB Black = 0,364 em).
 * phase (кадров | "auto" = ceil(O + 3)): движение сдвинуто так, что кадр 0 композиции = кадр phase движения (start/at задают положение без сдвига).
 * hit = последняя буква 100 %, end = hit + оседание блока. sfx thud на hit.
 * Стаггер линейный и дробный (0, 0,6, 1,2 … к. при 20 мс): hit = start + 6 + O, как в spec §6 (18,8 при старте 8).
 */
TL_MOVES["slam"] = {
  group: "text-in", slot: "in", units: ["char"], unit: "char",
  frames: { travel: 6, fade: 2, settle: 8 }, stagger: { "char": 20 },
  over: 0.01, lead: 2, sfx: { kind: "thud", strength: 1 }, fracStagger: true, staggerEase: "linear", // linear + дробные: soft + округление запускали Б, Е, С на одном кадре
  params: { strength: 1, stagger_ease: "linear", phase: 0 },
  stills: [0, 0.25, 0.5, 0.75, 1, 1.25],
  plan: function (layer, o, S) {
    var fall = Math.max(3, Math.round(6 * S.dur));
    var settle = Math.max(3, Math.round(8 * S.dur));
    /** @type {any} */
    var plan = tlPlan(layer, o, S, TL_MOVES["slam"], fall, false);
    var phase = o.phase;
    if (phase === "auto") phase = Math.ceil(plan.staggerFr * (plan.n - 1) + 3);
    phase = phase || 0;
    if (phase) {
      var shift = phase / 30;
      for (var i = 0; i < plan.starts.length; i++) plan.starts[i] -= shift;
      plan.start -= shift;
      plan.hit -= shift;
      kbLog("INFO slam phase " + phase + " (" + layer.name + ")");
    }
    plan.phase = phase;
    plan.settle = settle;
    plan.end = plan.hit + settle / 30;
    plan.unitFr = fall;
    return plan;
  },
  run: function (layer, o, S, plan) {
    var A = o.strength * S.strength;
    var T = plan.unitFr;
    var fade = Math.max(1, Math.round(2 * S.dur));
    var align = [0, -42.1];
    var from = 100 + 120 * A;
    var blur = 24 * A;
    tlAnimator(layer, { name: "slam-scale", basedOn: 2, grouping: 1, lock: true, align: align, prop: "ADBE Text Scale 3D", fullValue: [from, from, 100], rest: 100, span: from - 100,
      starts: plan.starts, keys: [[0, from], [T, 100, "punch"]] });
    tlAnimator(layer, { name: "slam-blur", basedOn: 2, grouping: 1, lock: true, align: align, prop: "ADBE Text Blur", fullValue: [blur, blur], rest: 0, span: blur,
      starts: plan.starts, keys: [[0, blur], [T, 0, "punch"]] });
    tlAnimator(layer, { name: "slam-op", basedOn: 2, grouping: 1, lock: true, align: align, prop: "ADBE Text Opacity", fullValue: 0, rest: 100, span: -100,
      starts: plan.starts, keys: [[0, 0], [fade, 100, "soft"], [T, 100]] });
    // блок: «вдох» 97 → удар 101 → 100 (перелёт 1 %, при потолке стиля ниже — по потолку)
    var peak = 100 + Math.min(1 * A, S.overCap * 100);
    var low = 100 - 3 * A;
    var t0 = plan.start;
    var t1 = plan.hit;
    var t2 = plan.hit + plan.settle / 30;
    var scale = kbProp(layer, ["ADBE Transform Group", "ADBE Scale"]);
    var tm = [t0, t1, t2];
    var vm = [low, peak, 100];
    if (t0 < 0) { // ключи до начала композиции не нужны: стартуем с интерполированного значения в нуле
      var u = (0 - t0) / (t1 - t0);
      vm[0] = low + (peak - low) * tlBz(u, "snap");
      tm[0] = 0;
    }
    for (var i = 0; i < 3; i++) scale.setValueAtTime(tm[i], [vm[i], vm[i]]);
    kbLog("INFO slam block " + vm[0].toFixed(1) + "@" + tm[0].toFixed(3) + " → " + vm[1].toFixed(1) + "@" + tm[1].toFixed(3) + " → " + vm[2] + "@" + tm[2].toFixed(3));
    var ea = TL_EASE.snap;
    var eb = TL_EASE.soft;
    scale.setTemporalEaseAtKey(1, /** @type {any} */ ([new KeyframeEase(0, 50), new KeyframeEase(0, 50), new KeyframeEase(0, 50)]), /** @type {any} */ ([new KeyframeEase(0, ea.out), new KeyframeEase(0, ea.out), new KeyframeEase(0, ea.out)]));
    scale.setTemporalEaseAtKey(2, /** @type {any} */ ([new KeyframeEase(0, ea.into), new KeyframeEase(0, ea.into), new KeyframeEase(0, ea.into)]), /** @type {any} */ ([new KeyframeEase(0, eb.out), new KeyframeEase(0, eb.out), new KeyframeEase(0, eb.out)]));
    scale.setTemporalEaseAtKey(3, /** @type {any} */ ([new KeyframeEase(0, eb.into), new KeyframeEase(0, eb.into), new KeyframeEase(0, eb.into)]), /** @type {any} */ ([new KeyframeEase(0, 50), new KeyframeEase(0, 50), new KeyframeEase(0, 50)]));
  }
};

/**
 * №4 cascade — буквы/слова/строки поднимаются на место слева направо, без перелёта.
 * Единица (hand): к. 0 y +0,24 em, 92 %, 0 % → к. 1 («вдох») +0,27 em, 91 %, 25 % (soft) → к. 8 y 0, 100 % (snap);
 * непрозрачность 100 % к к. 1 + round(0,4 × (T − 1)). Якорь масштаба — базовая линия.
 * hit = start + 8 + O (последний ключ последней единицы). На глаз единица садится раньше: хвост snap —
 * ≤ 2 px к к. 6,1, ≤ 1 px к к. 6,6 (кегль 165); кадры приёмки считать от этого, не от +8 (stream1/cascade-fix.md §3.3).
 * Стаггер линейный и дробный (soft + округление склеивали первые буквы). Шаг по буквам — параметр stagger_ms
 * (по умолчанию 35 мс = 1,05 к.; явный stagger важнее). sfx: серия tick (сила 0,6) на посадку каждой единицы (шаг ≥ 2 к., ≤ 24).
 */
TL_MOVES["cascade"] = {
  group: "text-in", slot: "in", units: ["char", "word", "line"], unit: "char",
  frames: { anticip: 1, travel: 7 }, stagger: { "char": 35, word: 66.7, line: 120 },
  over: 0, lead: 2, sfx: null, fracStagger: true, staggerEase: "linear", // spec §3.4: linear + дробные смещения; char 35 мс по каталогу (48 мс ломало к. 29)
  params: { stagger_ease: "linear", stagger_ms: 35, strength: 1 },
  plan: function (layer, o, S) {
    var fr = Math.max(3, Math.round(8 * S.dur));
    var oo = {};
    for (var key in o) oo[key] = o[key];
    if (oo.stagger === undefined && (oo.unit || "char") === "char" && oo.stagger_ms !== undefined) oo.stagger = oo.stagger_ms;
    return tlPlan(layer, oo, S, TL_MOVES["cascade"], fr, false);
  },
  run: function (layer, o, S, plan) {
    var em = tlFontSize(layer);
    var amp = o.strength * S.strength;
    var T = plan.unitFr;
    var a = Math.max(1, Math.round(1 * S.dur));
    var full = a + Math.round(0.4 * (T - a));
    var basedOn = plan.unit === "char" ? 2 : (plan.unit === "word" ? 3 : 4);
    var grouping = plan.unit === "char" ? 1 : (plan.unit === "word" ? 2 : 3);
    var span = 0.27 * em * Math.max(1, amp);
    tlAnimator(layer, { name: "cascade-pos", basedOn: basedOn, grouping: grouping, align: [0, 0], prop: "ADBE Text Position 3D", fullValue: [0, span, 0], rest: 0, span: span,
      starts: plan.starts, keys: [[0, 0.24 * em * amp], [a, 0.27 * em * amp, "soft"], [T, 0, "snap"]] });
    tlAnimator(layer, { name: "cascade-scale", basedOn: basedOn, grouping: grouping, align: [0, 0], prop: "ADBE Text Scale 3D", fullValue: [91, 91, 100], rest: 100, span: -9,
      starts: plan.starts, keys: [[0, 100 - 8 * amp], [a, 100 - 9 * amp, "soft"], [T, 100, "snap"]] });
    tlAnimator(layer, { name: "cascade-op", basedOn: basedOn, grouping: grouping, align: [0, 0], prop: "ADBE Text Opacity", fullValue: 0, rest: 100, span: -100,
      starts: plan.starts, keys: [[0, 0], [a, 25, "soft"], [full, 100, "snap"], [T, 100]] });
    // серия tick на посадках: шаг ≥ 2 к., не более 24
    var last = -100;
    var count = 0;
    for (var i = 0; i < plan.starts.length && count < 24; i++) {
      var fr = Math.ceil((plan.starts[i] + T / 30) * 30 - 0.001);
      if (fr - last >= 2) {
        tlSfxMarker(layer, fr / 30, "tick", 0.6);
        last = fr;
        count++;
      }
    }
    kbLog("INFO cascade ticks " + count + " (" + layer.name + ")");
  }
};

/** Повторяемое псевдослучайное 0…1 (как kbHoleNoise, без зависимости от show-b). */
function tlBrNoise(i, seed) {
  var v = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453;
  return v - Math.floor(v);
}

/**
 * Рамка и мат для baseline-reveal: пустышка «… frame» в точке базовой линии, shape «… mat» прямо над текстом (трек-мат Alpha),
 * оба — дети рамки. Мат: от capTop − 1,0 em до base + 0,08 em, шире строки на 0,5 em с каждой стороны; нижний край — 64 вершины
 * с неровностью ±1,5 px (seed считается один раз). Низ мата на время покоя опускается до base + 0,35 em, чтобы не резать
 * выносные элементы (хвост Қ): это делает пресет ключами пути в последние 3 к. входа и в первые 2 к. выхода.
 * @param {TextLayer} layer
 * @param {number} em
 * @returns {{frame: Layer, mat: ShapeLayer}}
 */
function tlBrFrame(layer, em) {
  var parts = tlFrameParts(layer);
  if (parts) return parts;
  var comp = layer.containingComp;
  var pos = kbProp(layer, ["ADBE Transform Group", "ADBE Position"]).value;
  var anc = kbProp(layer, ["ADBE Transform Group", "ADBE Anchor Point"]).value;
  var base = pos[1] - anc[1];
  var rect = layer.sourceRectAtTime(0, false);
  var cap = (TL_S.text && TL_S.text.cap) || 0.72;
  var left = pos[0] - rect.width / 2 - 0.5 * em;
  var right = pos[0] + rect.width / 2 + 0.5 * em;
  var top = base - cap * em - 1.0 * em;
  var seed = kbProp(layer, ["ADBE Text Properties", "ADBE Text Document"]).value.text.length + Math.round(em);
  var n = 64;
  var i;
  var lo = new Shape();
  var hi = new Shape();
  /** @type {[number, number][]} */
  var vlo = [[left, top], [right, top]];
  /** @type {[number, number][]} */
  var vhi = [[left, top], [right, top]];
  for (i = 0; i < n; i++) {
    var x = right - (right - left) * i / (n - 1);
    var j = (tlBrNoise(i, seed) - 0.5) * 3; // ±1,5 px
    vlo.push([x, base + 0.08 * em + j]);
    vhi.push([x, base + 0.35 * em + j]);
  }
  lo.vertices = vlo; lo.closed = true;
  hi.vertices = vhi; hi.closed = true;

  var mat = comp.layers.addShape();
  mat.name = layer.name + " mat";
  kbProp(mat, ["ADBE Transform Group", "ADBE Position"]).setValue([0, 0]); // у нового shape-слоя позиция — центр кадра
  var group = kbAdd(kbGroup(mat, ["ADBE Root Vectors Group"]), "ADBE Vector Group");
  group.name = "m";
  var contents = kbGroup(group, ["ADBE Vectors Group"]);
  var path = kbAdd(contents, "ADBE Vector Shape - Group");
  path.name = "p";
  kbProp(path, ["ADBE Vector Shape"]).setValue(lo);
  var fill = kbAdd(contents, "ADBE Vector Graphic - Fill");
  kbProp(fill, ["ADBE Vector Fill Color"]).setValue([1, 1, 1, 1]);
  mat.moveBefore(layer);
  layer.setTrackMatte(mat, TrackMatteType.ALPHA);

  var frame = comp.layers.addNull();
  frame.name = layer.name + " frame";
  frame.comment = "tl-frame";
  kbProp(frame, ["ADBE Transform Group", "ADBE Anchor Point"]).setValue([pos[0], base]);
  kbProp(frame, ["ADBE Transform Group", "ADBE Position"]).setValue([pos[0], base]);
  frame.moveBefore(mat);
  mat.parent = frame;
  layer.parent = frame;
  kbLog("MAT " + layer.name + " base " + Math.round(base) + " x " + Math.round(left) + "–" + Math.round(right) + " y " + Math.round(top) + "–" + Math.round(base + 0.08 * em));
  mat.comment = "tl-mat " + Math.round(base + 0.35 * em);
  return { frame: frame, mat: mat };
}

/** Ключи пути мата: низ между «режет» (+0,08 em) и «открыт» (+0,35 em); формы берутся из ключевых вершин, поэтому строим заново с тем же seed. */
function tlBrMatKey(mat, layer, em, t, open) {
  var pathProp = kbProp(mat, ["ADBE Root Vectors Group", "m", "ADBE Vectors Group", "p", "ADBE Vector Shape"]);
  var cur = pathProp.value;
  var v = cur.vertices;
  var base = mat.comment.split(" ")[1] - 0.35 * em; // сохранена в tlBrFrame
  var seed = kbProp(layer, ["ADBE Text Properties", "ADBE Text Document"]).value.text.length + Math.round(em);
  /** @type {[number, number][]} */
  var out = [];
  for (var i = 0; i < v.length; i++) {
    if (i < 2) { out.push([v[i][0], v[i][1]]); continue; }
    var j = (tlBrNoise(i - 2, seed) - 0.5) * 3;
    out.push([v[i][0], base + (open ? 0.35 : 0.08) * em + j]);
  }
  var shape = new Shape();
  shape.vertices = out;
  shape.closed = true;
  pathProp.setValueAtTime(Math.max(0, t), shape);
}

/**
 * №6 baseline-reveal — буквы выезжают снизу из-под невидимой линии (мат по базовой, непрозрачность не анимируется).
 * Вход (hand): единица 12 к., y +1,0 em → 0 (expo), стаггер char 60 мс, word 2 к.; выход (out:true): 6 к., y 0 → +1,0 em (release), стаггер 20 мс.
 * Расстояние всегда 1,0 em (strength его не меняет — буква обязана целиком уйти под мат). Одна строка на слой.
 * В стиле lesson подменяется на rise. hit = последняя буква на месте. sfx нет.
 */
TL_MOVES["baseline-reveal"] = {
  group: "text-in", slot: "in", units: ["char", "word"], unit: "char",
  frames: { travel: 12, out: 6 }, stagger: { "char": 60, word: 66.7 },
  over: 0, lead: 2, sfx: null, fracStagger: true,
  params: { stagger_ease: "linear", strength: 1 },
  plan: function (layer, o, S) {
    var text = kbProp(layer, ["ADBE Text Properties", "ADBE Text Document"]).value.text;
    if (/[\r\n]/.test(text)) throw new Error("baseline-reveal: одна строка на слой (мат режет по базовой одной строки)");
    if (o.out && o.stagger === undefined) o.stagger = 20;
    var fr = o.out ? Math.max(3, Math.round(6 * S.dur)) : Math.max(3, Math.round(12 * S.dur));
    return tlPlan(layer, o, S, TL_MOVES["baseline-reveal"], fr, !!o.out);
  },
  run: function (layer, o, S, plan) {
    var em = tlFontSize(layer);
    var T = plan.unitFr;
    var basedOn = plan.unit === "char" ? 2 : 3;
    var grouping = plan.unit === "char" ? 1 : 2;
    var parts = tlBrFrame(layer, em);
    if (o.out) {
      tlAnimator(layer, { name: "br-out-pos", basedOn: basedOn, grouping: grouping, align: [0, 0], prop: "ADBE Text Position 3D", fullValue: [0, em, 0], rest: 0, span: em,
        starts: plan.starts, keys: [[0, 0], [T, em, "release"]] });
      tlBrMatKey(parts.mat, layer, em, plan.start, true);
      tlBrMatKey(parts.mat, layer, em, plan.start + 2 / 30, false);
      return;
    }
    tlAnimator(layer, { name: "br-pos", basedOn: basedOn, grouping: grouping, align: [0, 0], prop: "ADBE Text Position 3D", fullValue: [0, em, 0], rest: 0, span: em,
      starts: plan.starts, keys: [[0, em], [T, 0, "expo"]] });
    tlBrMatKey(parts.mat, layer, em, plan.hit - 3 / 30, false);
    tlBrMatKey(parts.mat, layer, em, plan.hit, true);
  }
};

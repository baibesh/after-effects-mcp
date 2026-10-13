// Свет: летящий шар с горячим ядром и шлейфом, объёмные лучи от него сквозь кадр.
//
// Оба приёма живут на одной дуге. Дуга задаётся редкими опорными точками, а ключи считаются по
// сплайну Кэтмулла–Рома с мелким шагом: у Position внутри shape-группы и у Center эффекта нет
// пространственных касательных, и редкие ключи дали бы ломаную с изломом на каждой опоре.
// Шар двигается ключами ВНУТРИ группы, а не трансформом слоя: Echo снимает растр слоя до трансформа
// и движения слоя не видит — шлейфа бы не было.

//@include "core.jsx"
//@include "motion.jsx"
//@include "project.jsx"

/**
 * Разложить дугу на частые ключи: опорные точки → гладкий путь, точка через каждые step секунд.
 * Скорость задаётся расстоянием между соседними опорами (времена опор равномерные).
 * @param {[number, number][]} path опорные точки в координатах кадра
 * @param {number[]} times времена опорных точек, по возрастанию, той же длины
 * @param {number} [step] шаг выборки в секундах (по умолчанию 1/15)
 * @returns {{times: number[], values: [number, number][]}}
 */
function kbArcSamples(path, times, step) {
  if (path.length !== times.length) throw new Error("kbArcSamples: точек " + path.length + ", времён " + times.length);
  if (path.length < 2) throw new Error("kbArcSamples: нужно хотя бы две опорные точки");
  var dt = step === undefined ? 1 / 15 : step;

  /** @type {number[]} */
  var outTimes = [];
  /** @type {[number, number][]} */
  var outValues = [];

  var first = times[0];
  var last = times[times.length - 1];
  var seg = 0;
  var t = first;
  while (t < last + dt * 0.5) {
    if (t > last) t = last;
    while (seg < times.length - 2 && t > times[seg + 1]) seg++;
    var span = times[seg + 1] - times[seg];
    var u = span <= 0 ? 0 : (t - times[seg]) / span;
    if (u < 0) u = 0;
    if (u > 1) u = 1;

    var p0 = path[seg === 0 ? 0 : seg - 1];
    var p1 = path[seg];
    var p2 = path[seg + 1];
    var p3 = path[seg + 2 > path.length - 1 ? path.length - 1 : seg + 2];

    outTimes.push(t);
    outValues.push([kbSpline(p0[0], p1[0], p2[0], p3[0], u), kbSpline(p0[1], p1[1], p2[1], p3[1], u)]);
    t += dt;
  }
  return { times: outTimes, values: outValues };
}

/**
 * Одна координата сплайна Кэтмулла–Рома.
 * @param {number} a
 * @param {number} b
 * @param {number} c
 * @param {number} d
 * @param {number} u 0…1 между b и c
 * @returns {number}
 */
function kbSpline(a, b, c, d, u) {
  var u2 = u * u;
  var u3 = u2 * u;
  return 0.5 * (2 * b + (c - a) * u + (2 * a - 5 * b + 4 * c - d) * u2 + (-a + 3 * b - 3 * c + d) * u3);
}

/**
 * Положить выборку дуги ключами. Интерполяция линейная: кривизна уже внутри выборки,
 * а мягкий easing на каждом ключе дал бы дёрганый ход.
 * @param {Property} prop двумерное свойство (позиция группы, Center эффекта)
 * @param {{times: number[], values: [number, number][]}} samples
 * @param {[number, number]} [offset] сдвиг ко всем значениям
 */
function kbPathKeys(prop, samples, offset) {
  var dx = offset ? offset[0] : 0;
  var dy = offset ? offset[1] : 0;
  var i;
  for (i = 0; i < samples.times.length; i++) {
    prop.setValueAtTime(samples.times[i], [samples.values[i][0] + dx, samples.values[i][1] + dy]);
  }
  for (i = 1; i <= prop.numKeys; i++) {
    prop.setInterpolationTypeAtKey(i, KeyframeInterpolationType.LINEAR, KeyframeInterpolationType.LINEAR);
  }
}

/**
 * Светящийся шар: тёплое ядро в мягком ореоле, летит по дуге и тянет шлейф (Echo).
 * Слой кладётся в режиме Add — на тёмном фоне у света не бывает края.
 * Пересвет делает Exposure: в 32 битах яркость выше 1.0 — это и есть свечение, ореол дорисует kbGlow.
 * @param {CompItem} comp
 * @param {[number, number][]} path опорные точки дуги в координатах кадра
 * @param {number[]} times времена опорных точек
 * @param {{core?: number, halo?: number, haloOpacity?: number, haloColor?: [number, number, number],
 *   color?: [number, number, number],
 *   coreColor?: [number, number, number], blur?: number, exposure?: number,
 *   boost?: {start: number, end: number, exposure: number}, glow?: {radius: number, intensity: number},
 *   echoes?: number, echoTime?: number, decay?: number, step?: number, name?: string}} [opts]
 *   glow — ореол СВОИМ слоем, а не общим kbGlow поверх кадра: свечение на весь кадр ловит всё, что
 *   лучи подняли выше 1.0 у краёв букв, а там первым порог переходит красный канал — и вокруг слова
 *   загорается красная кайма. На самом шаре ореол видит только шар.
 *   haloOpacity подбирается так, чтобы ореол ПОСЛЕ экспозиции остался ниже 1.0: иначе светится не
 *   ядро, а весь шар целиком, и kbGlow раздувает его в белое пятно на пол-кадра.
 * @returns {ShapeLayer}
 */
function kbOrb(comp, path, times, opts) {
  opts = opts || {};
  var coreSize = opts.core === undefined ? 60 : opts.core;
  var haloSize = opts.halo === undefined ? coreSize * 2.1 : opts.halo;
  var haloColor = opts.haloColor || opts.color || KB_COLOR.marker;
  var coreColor = opts.coreColor || [1, 0.93, 0.78];
  var exposure = opts.exposure === undefined ? 2.2 : opts.exposure;

  var layer = comp.layers.addShape();
  layer.name = opts.name || "orb";
  layer.motionBlur = true;
  layer.blendingMode = BlendingMode.ADD;
  // Слой в координатах кадра: точки группы читаются как пиксели композиции.
  kbProp(layer, ["ADBE Transform Group", "ADBE Anchor Point"]).setValue([0, 0]);
  kbProp(layer, ["ADBE Transform Group", "ADBE Position"]).setValue([0, 0]);

  var group = kbAdd(kbGroup(layer, ["ADBE Root Vectors Group"]), "ADBE Vector Group");
  group.name = "flight";
  var contents = kbGroup(group, ["ADBE Vectors Group"]);

  // Ядро — первым: в shape-слое первая группа рисуется поверх остальных.
  kbOrbBall(contents, "core", coreSize, coreColor, 100);
  kbOrbBall(contents, "halo", haloSize, haloColor, opts.haloOpacity === undefined ? 18 : opts.haloOpacity);

  kbPathKeys(kbProp(kbGroup(group, ["ADBE Vector Transform Group"]), ["ADBE Vector Position"]),
    kbArcSamples(path, times, opts.step));

  // Порядок эффектов: размытие лепит мягкий ореол → Echo снимает шлейф с уже мягкого шара →
  // Exposure выталкивает всё выше 1.0. Экспозиция последней, чтобы разгорание тянуло и шлейф.
  var blur = kbEffect(layer, "ADBE Gaussian Blur 2");
  kbProp(blur, ["ADBE Gaussian Blur 2-0001"]).setValue(opts.blur === undefined ? 9 : opts.blur); // Blurriness
  kbProp(blur, ["ADBE Gaussian Blur 2-0003"]).setValue(0); // Repeat Edge Pixels — выкл.: шар уходит за край кадра

  var echo = kbEffect(layer, "ADBE Echo");
  // Шаг эха меньше диаметра ядра: иначе шлейф распадается на отдельные копии и читается лесенкой,
  // а не смазом. Длину хвоста набираем числом эх, а не шагом.
  kbProp(echo, ["ADBE Echo-0001"]).setValue(opts.echoTime === undefined ? -0.022 : opts.echoTime); // Echo Time
  kbProp(echo, ["ADBE Echo-0002"]).setValue(opts.echoes === undefined ? 16 : opts.echoes); // Number Of Echoes
  kbProp(echo, ["ADBE Echo-0003"]).setValue(1); // Starting Intensity
  kbProp(echo, ["ADBE Echo-0004"]).setValue(opts.decay === undefined ? 0.75 : opts.decay); // Decay
  kbProp(echo, ["ADBE Echo-0005"]).setValue(5); // Echo Operator: Composite In Back

  var exp = kbEffect(layer, "ADBE Exposure2");
  var level = kbProp(exp, ["ADBE Exposure2-0003"]); // Exposure, ступени
  if (opts.boost) {
    kbKeys(level, [0, opts.boost.start, opts.boost.end], [exposure, exposure + 0.2, opts.boost.exposure], KB_EASE.soft);
  } else {
    level.setValue(exposure);
  }

  if (opts.glow) {
    var halo = kbEffect(layer, "ADBE Glo2");
    kbProp(halo, ["ADBE Glo2-0002"]).setValue(255); // Glow Threshold — шкала 0–255, светится ярче белого
    kbProp(halo, ["ADBE Glo2-0003"]).setValue(opts.glow.radius); // Glow Radius
    kbProp(halo, ["ADBE Glo2-0004"]).setValue(opts.glow.intensity); // Glow Intensity
  }
  return layer;
}

/**
 * Один круг внутри группы шара: своя подгруппа, чтобы у ядра и ореола были разные цвета.
 * @param {PropertyGroup} contents содержимое группы-носителя
 * @param {string} name
 * @param {number} size диаметр в пикселях
 * @param {[number, number, number]} color
 * @param {number} opacity 0…100
 */
function kbOrbBall(contents, name, size, color, opacity) {
  var group = kbAdd(contents, "ADBE Vector Group");
  group.name = name;
  var inner = kbGroup(group, ["ADBE Vectors Group"]);
  var ellipse = kbAdd(inner, "ADBE Vector Shape - Ellipse");
  kbProp(ellipse, ["ADBE Vector Ellipse Size"]).setValue([size, size]);
  var fill = kbAdd(inner, "ADBE Vector Graphic - Fill");
  kbProp(fill, ["ADBE Vector Fill Color"]).setValue([color[0], color[1], color[2], 1]);
  kbProp(fill, ["ADBE Vector Fill Opacity"]).setValue(opacity);
}

/**
 * Объёмные лучи от точки на дуге: корректирующий слой, поэтому Center считается в координатах кадра,
 * а лучи собираются из всего, что лежит ниже, — включая просветы между буквами.
 * Ставить НАД слоем текста и НИЖЕ подписи: подпись должна остаться чистой.
 * @param {CompItem} comp
 * @param {[number, number][]} path те же опорные точки, что у шара
 * @param {number[]} times те же времена
 * @param {{intensity?: number, radius?: number, warp?: number, step?: number, name?: string,
 *   color?: [number, number, number], brighten?: boolean, pool?: {radius: number, feather: number},
 *   noise?: number,
 *   boost?: {start: number, end: number, intensity: number, radius: number, out?: number}}} [opts]
 *   pool — круглая маска-пятно, едущая с шаром: без неё эффект чуть поднимает ВЕСЬ кадр, и вдали от
 *   света тушь становится бурой. С маской лучи живут только вокруг источника, дальше кадр чёрный.
 *   boost.out — время, к которому лучи гаснут совсем: на пике яркости CC Light Rays уводит красный и
 *   зелёный в минус, и на белой вспышке вдоль шара проступает холодная тёмная кайма.
 *   brighten (Allow Brightening) по умолчанию выключен: с ним лучи поднимают весь кадр и тушь
 *   уходит в хаки — остаются не лучи, а мутная заливка.
 * @returns {AVLayer}
 */
function kbLightRays(comp, path, times, opts) {
  opts = opts || {};
  var layer = comp.layers.addSolid([1, 1, 1], opts.name || "rays", comp.width, comp.height, 1, comp.duration);
  layer.adjustmentLayer = true;
  var samples = kbArcSamples(path, times, opts.step);

  var fx = kbEffect(layer, "CC Light Rays");
  kbPathKeys(kbProp(fx, ["CC Light Rays-0002"]), samples); // Center
  if (opts.pool) kbPoolMask(layer, samples, opts.pool.radius, opts.pool.feather);

  var intensity = kbProp(fx, ["CC Light Rays-0001"]);
  var radius = kbProp(fx, ["CC Light Rays-0003"]);
  var i0 = opts.intensity === undefined ? 60 : opts.intensity;
  var r0 = opts.radius === undefined ? 100 : opts.radius;
  if (opts.boost) {
    // Не `times`: в ES3 var поднимается на всю функцию и перекрыл бы параметр с отметками дуги.
    var boostTimes = [0, opts.boost.start, opts.boost.end];
    var iv = [i0, i0, opts.boost.intensity];
    var rv = [r0, r0, opts.boost.radius];
    if (opts.boost.out !== undefined) {
      boostTimes.push(opts.boost.out);
      iv.push(0);
      rv.push(r0);
    }
    kbKeys(intensity, boostTimes, iv, KB_EASE.soft);
    kbKeys(radius, boostTimes, rv, KB_EASE.soft);
  } else {
    intensity.setValue(i0);
    radius.setValue(r0);
  }

  // Warp Softness — размытие границы луча. Выше 30 пучки расплываются в общую дымку и читаются
  // как грязь на фоне; ниже 20 у луча появляется край, и он становится лучом.
  kbProp(fx, ["CC Light Rays-0004"]).setValue(opts.warp === undefined ? 14 : opts.warp); // Warp Softness
  kbProp(fx, ["CC Light Rays-0005"]).setValue(1); // Shape: Round
  if (opts.color) {
    // Свой цвет вместо цвета источника: иначе луч от белых букв идёт серым, и вместо света в кадре
    // лежат серые многоугольники. Один тёплый оттенок держит сцену в двух цветах.
    kbProp(fx, ["CC Light Rays-0007"]).setValue(0); // Color from Source — выкл.
    kbProp(fx, ["CC Light Rays-0008"]).setValue([opts.color[0], opts.color[1], opts.color[2], 1]); // Color
  } else {
    kbProp(fx, ["CC Light Rays-0007"]).setValue(1);
  }
  kbProp(fx, ["CC Light Rays-0010"]).setValue(opts.brighten ? 1 : 0); // Allow Brightening

  // Пучок — длинная пологая растяжка; в 8-битном выводе она идёт кольцами. Зерно поверх лучей
  // размывает ступень (слой корректирующий — зерно ложится и на то, что под ним, внутри маски).
  if (opts.noise) {
    var grain = kbEffect(layer, "ADBE Noise");
    kbProp(grain, ["ADBE Noise-0001"]).setValue(opts.noise); // Amount of Noise, %
    kbProp(grain, ["ADBE Noise-0002"]).setValue(0); // Use Color Noise — выкл.
  }
  return layer;
}

/**
 * Маска-пятно, едущая вместе с шаром: круг с широкой растушёвкой вокруг точки дуги.
 * Корректирующий слой с такой маской действует только рядом с источником света.
 * @param {AVLayer} layer
 * @param {{times: number[], values: [number, number][]}} samples
 * @param {number} radius радиус круга в пикселях
 * @param {number} feather растушёвка
 * @returns {MaskPropertyGroup}
 */
function kbPoolMask(layer, samples, radius, feather) {
  var mask = /** @type {any} */ (kbAdd(kbGroup(layer, ["ADBE Mask Parade"]), "ADBE Mask Atom")); // ae-ok: matchname
  mask.name = "pool";
  var shape = kbProp(mask, ["ADBE Mask Shape"]); // ae-ok: matchname
  var i;
  for (i = 0; i < samples.times.length; i++) {
    shape.setValueAtTime(samples.times[i], kbCircleShape(samples.values[i][0], samples.values[i][1], radius));
  }
  for (i = 1; i <= shape.numKeys; i++) {
    shape.setInterpolationTypeAtKey(i, KeyframeInterpolationType.LINEAR, KeyframeInterpolationType.LINEAR);
  }
  kbProp(mask, ["ADBE Mask Feather"]).setValue([feather, feather]); // ae-ok: matchname
  return mask;
}

/**
 * Круг как замкнутый путь Безье (четыре точки, касательная 0,5523·r).
 * @param {number} cx
 * @param {number} cy
 * @param {number} r
 * @returns {Shape}
 */
function kbCircleShape(cx, cy, r) {
  var k = 0.5523 * r;
  var shape = new Shape();
  shape.vertices = [[cx, cy - r], [cx + r, cy], [cx, cy + r], [cx - r, cy]];
  shape.inTangents = [[-k, 0], [0, -k], [k, 0], [0, k]];
  shape.outTangents = [[k, 0], [0, k], [-k, 0], [0, -k]];
  shape.closed = true;
  return shape;
}

/**
 * Анаморфный штрих: тонкая длинная горизонтальная полоса света через источник — след, который даёт
 * анаморфная оптика. Делается копией ядра с горизонтальным Box Blur: энергия точки размазывается
 * вдоль строки, поэтому яркость приходится возвращать экспозицией.
 * Слой в режиме Add и НИЖЕ ядра: самой яркой точкой кадра остаётся ядро.
 * @param {CompItem} comp
 * @param {[number, number][]} path те же опорные точки, что у ядра
 * @param {number[]} times те же времена
 * @param {{size?: number, length?: number, color?: [number, number, number], exposure?: number,
 *   boost?: {start: number, end: number, exposure: number}, step?: number, name?: string}} [opts]
 * @returns {ShapeLayer}
 */
function kbStreak(comp, path, times, opts) {
  opts = opts || {};
  var layer = comp.layers.addShape();
  layer.name = opts.name || "streak";
  layer.blendingMode = BlendingMode.ADD;
  kbProp(layer, ["ADBE Transform Group", "ADBE Anchor Point"]).setValue([0, 0]);
  kbProp(layer, ["ADBE Transform Group", "ADBE Position"]).setValue([0, 0]);

  var group = kbAdd(kbGroup(layer, ["ADBE Root Vectors Group"]), "ADBE Vector Group");
  group.name = "flight";
  kbOrbBall(kbGroup(group, ["ADBE Vectors Group"]), "seed", opts.size === undefined ? 26 : opts.size,
    opts.color || [1, 0.93, 0.82], 100);
  kbPathKeys(kbProp(kbGroup(group, ["ADBE Vector Transform Group"]), ["ADBE Vector Position"]),
    kbArcSamples(path, times, opts.step));

  var blur = kbEffect(layer, "ADBE Box Blur2");
  kbProp(blur, ["ADBE Box Blur2-0001"]).setValue(opts.length === undefined ? 520 : opts.length); // Blur Radius
  kbProp(blur, ["ADBE Box Blur2-0002"]).setValue(3); // Iterations — коробка в три прохода даёт мягкие концы
  kbProp(blur, ["ADBE Box Blur2-0003"]).setValue(2); // Blur Dimensions: Horizontal

  var exp = kbEffect(layer, "ADBE Exposure2");
  var level = kbProp(exp, ["ADBE Exposure2-0003"]);
  var base = opts.exposure === undefined ? 3.6 : opts.exposure;
  if (opts.boost) {
    kbKeys(level, [0, opts.boost.start, opts.boost.end], [base, base, opts.boost.exposure], KB_EASE.soft);
  } else {
    level.setValue(base);
  }
  return layer;
}

/**
 * Лужа света как матовый слой: белый круг с мягким затуханием, едущий по дуге вместе с источником.
 * Работает трек-матом (kbCutByLight): буквы видны только там, где сейчас свет. Создавать сразу
 * ПОСЛЕ слоя, который матируем, — трек-мат берёт слой, лежащий прямо над целью.
 * @param {CompItem} comp
 * @param {[number, number][]} path
 * @param {number[]} times
 * @param {{radius: number, floor?: number, open?: {start: number, end: number, radius: number},
 *   step?: number, name?: string}} opts
 *   floor — сколько света остаётся вдали (0.03 = буквы едва тлеют, а не исчезают совсем);
 *   open — раскрытие лужи на весь кадр перед вспышкой: слово на миг видно целиком.
 * @returns {AVLayer}
 */
function kbLightPool(comp, path, times, opts) {
  var samples = kbArcSamples(path, times, opts.step);
  var layer = comp.layers.addSolid([0, 0, 0], opts.name || "light-pool", comp.width, comp.height, 1, comp.duration);

  var ramp = kbEffect(layer, "ADBE Ramp");
  kbPathKeys(kbProp(ramp, ["ADBE Ramp-0001"]), samples); // Start of Ramp — центр лужи

  var end = kbProp(ramp, ["ADBE Ramp-0003"]); // End of Ramp — радиус, задаём по кадрам вместе с раскрытием
  var i;
  for (i = 0; i < samples.times.length; i++) {
    end.setValueAtTime(samples.times[i], [samples.values[i][0], samples.values[i][1] + kbPoolRadius(samples.times[i], opts)]);
  }
  for (i = 1; i <= end.numKeys; i++) {
    end.setInterpolationTypeAtKey(i, KeyframeInterpolationType.LINEAR, KeyframeInterpolationType.LINEAR);
  }

  var floor = opts.floor === undefined ? 0.03 : opts.floor;
  kbProp(ramp, ["ADBE Ramp-0002"]).setValue([1, 1, 1, 1]); // Start Color
  kbProp(ramp, ["ADBE Ramp-0004"]).setValue([floor, floor, floor, 1]); // End Color
  kbProp(ramp, ["ADBE Ramp-0005"]).setValue(2); // Ramp Shape: Radial Ramp
  return layer;
}

/**
 * Радиус лужи в момент t с учётом раскрытия.
 * @param {number} t
 * @param {{radius: number, open?: {start: number, end: number, radius: number}}} opts
 * @returns {number}
 */
function kbPoolRadius(t, opts) {
  if (!opts.open || t <= opts.open.start) return opts.radius;
  var u = (t - opts.open.start) / (opts.open.end - opts.open.start);
  if (u > 1) u = 1;
  u = u * u * (3 - 2 * u);
  return opts.radius + (opts.open.radius - opts.radius) * u;
}

/**
 * Вырезать слой лужей света: буквы видны только там, где свет. Трек-мат, а не ADBE Set Matte —
 * у Set Matte слой-источник задаётся НОМЕРОМ, и на живом AE 2026 он молча берёт не тот слой:
 * слово пропадает целиком, без ошибки в журнале.
 * @param {AVLayer} layer
 * @param {AVLayer} pool слой-лужа (kbLightPool)
 */
function kbCutByLight(layer, pool) {
  pool.moveBefore(layer);
  layer.setTrackMatte(pool, TrackMatteType.LUMA);
}

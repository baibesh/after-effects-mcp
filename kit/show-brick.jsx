// Кирпич-слово: бумажная вырезка с текстом, куча кирпичей и кладка стены.
// Приём ролика «Бір кірпіш жетеді» (reels/say-simple): длинная мысль = куча кирпичей,
// на каждом по слову; одна короткая фраза = один кирпич; три кирпича = первый ряд стены.
//
// Кирпич — это kbCutout (3D, парит над стеной, роняет на неё настоящую тень от kbShadowLight)
// плюс текст, посаженный kbStick, плюс волокно набора листа (§4 kit/README) и лёгкий увод края:
// бумагу режут ножницами, а не гильотиной. Три роли по цвету:
//   «в куче»         — KB_BRICK_PAPER (тональная бумага) или KB_COLOR.grey, текст тушью;
//   выбранный        — KB_COLOR.ochre, текст тушью;
//   английская сторона — KB_COLOR.blue, текст цвета бумаги.
//
// Координаты и размеры — в системе композиции (мир сцены), а не в пикселях кадра: когда камера
// стоит не на плоскости кирпичей, ролик пересчитывает кадр в мир сам (reels/say-simple/common.jsx).
// Ось Z как везде в ките: минус — к камере; opts.z у кирпича задаётся в этой же системе.

//@include "core.jsx"
//@include "motion.jsx"
//@include "text.jsx"
//@include "space.jsx"
//@include "show-hand.jsx"

/**
 * Тональная бумага кирпича: темнее листа стены (#F4F1EA), светлее KB_COLOR.grey (#C9C4B8).
 * @type {[number, number, number]}
 */
var KB_BRICK_PAPER = [0.886, 0.869, 0.827];

/**
 * Служебная: вписать строку в площадку кирпича и пересчитать якорь.
 * Площадка — 0,80 ширины и 0,66 высоты: в куче соседний кирпич накрывает край, и текст,
 * набранный во всю ширину, уходил под него (проверено кадрами: «Кешіріңіз,» читалось как «Кеш»).
 * kbTextFitWidth (show-e) растягивает строку ровно в ширину и не смотрит на высоту — на кирпиче
 * нужно и то и другое, и только в сторону уменьшения: короткое слово не должно раздуваться.
 * @param {TextLayer} layer
 * @param {number} maxWidth
 * @param {number} maxHeight
 * @returns {number} итоговый кегль
 */
function kbBrickFit(layer, maxWidth, maxHeight) {
  var source = kbProp(layer, ["ADBE Text Properties", "ADBE Text Document"]);
  var rect = layer.sourceRectAtTime(0, false);
  /** @type {TextDocument} */
  var doc = source.value;
  if (rect.width > 1 && rect.height > 1) {
    var k = Math.min(maxWidth / rect.width, maxHeight / rect.height);
    if (k < 1) {
      var size = Math.max(8, Math.round(doc.fontSize * k * 10) / 10);
      doc.fontSize = size;
      doc.autoLeading = false;
      doc.leading = Math.round(size * 1.12);
      source.setValue(doc);
    }
  }
  var fitted = layer.sourceRectAtTime(0, false);
  kbProp(layer, ["ADBE Transform Group", "ADBE Anchor Point"])
    .setValue([fitted.left + fitted.width / 2, fitted.top + fitted.height / 2]);
  return source.value.fontSize;
}

/**
 * Кирпич: бумажная вырезка с текстом в одну-две строки.
 *
 * @param {CompItem} comp
 * @param {{name?: string, x: number, y: number, z?: number, width: number, height: number,
 *   color?: [number, number, number], ink?: [number, number, number], lines?: string[],
 *   lineSize?: number, tilt?: number, turn?: number, seed?: number, grain?: boolean,
 *   tracking?: number}} opts
 *   x, y — центр кирпича в мире; z — глубина (минус — к камере, по умолчанию −40);
 *   color — бумага кирпича (умолчание KB_BRICK_PAPER), ink — цвет текста (умолчание KB_COLOR.ink);
 *   lines — одна-две строки (пустой массив или без поля — пустой тональный кирпич);
 *   lineSize — кегль; без него 0,244·height для одной строки и 0,222·height для двух
 *   (на кирпиче 520×180 это ≈ 44 и 40), дальше строка вписывается в площадку;
 *   tilt — поворот по Z, град. (живость), turn — поворот по Y, град. (кирпич повёрнут другой стороной);
 *   seed — номер кирпича: от него волокно и увод края, повторяемо;
 *   grain: false — без волокна (кирпич далеко от камеры и зерно всё равно не видно)
 * @returns {{cutout: ShapeLayer, text: TextLayer}} text === null у пустого кирпича
 */
function kbBrick(comp, opts) {
  var seed = opts.seed === undefined ? 1 : opts.seed;
  var z = opts.z === undefined ? -40 : opts.z;

  var cutout = kbCutout(comp, {
    name: opts.name === undefined ? "brick" : opts.name,
    x: opts.x, y: opts.y, width: opts.width, height: opts.height,
    lift: -z,
    tilt: opts.tilt || 0,
    color: opts.color || KB_BRICK_PAPER
  });
  if (opts.turn) kbProp(cutout, ["ADBE Transform Group", "ADBE Rotate Y"]).setValue(opts.turn);

  // Волокно — набор листа из §4 kit/README: одна октава, размах без срезов. Старый набор
  // (Contrast 14 / Complexity 4) на кирпиче даёт белёсые кляксы и переживает расфокус пятнами.
  if (opts.grain !== false) {
    var noise = kbEffect(cutout, "ADBE Fractal Noise");
    kbProp(noise, ["ADBE Fractal Noise-0004"]).setValue(4); // Contrast
    kbProp(noise, ["ADBE Fractal Noise-0005"]).setValue(46); // Brightness
    kbProp(noise, ["ADBE Fractal Noise-0010"]).setValue(2.2); // Scale
    kbProp(noise, ["ADBE Fractal Noise-0015"]).setValue(1); // Complexity — одна октава
    kbProp(noise, ["ADBE Fractal Noise-0027"]).setValue(seed); // Random Seed
    kbProp(noise, ["ADBE Fractal Noise-0030"]).setValue(5); // Blending Mode: Multiply
  }

  // Увод края длинной волной: край бумаги не по линейке. Size ниже ~80 даёт рябь (см. kbHandMarker).
  var warp = kbEffect(cutout, "ADBE Turbulent Displace");
  kbProp(warp, ["ADBE Turbulent Displace-0002"]).setValue(3.5); // Amount
  kbProp(warp, ["ADBE Turbulent Displace-0003"]).setValue(260); // Size
  kbProp(warp, ["ADBE Turbulent Displace-0005"]).setValue(1); // Complexity
  kbProp(warp, ["ADBE Turbulent Displace-0006"]).setValue(seed * 41); // Evolution — не анимируется

  var text = null;
  if (opts.lines && opts.lines.length > 0) {
    var joined = opts.lines[0];
    for (var i = 1; i < opts.lines.length; i++) joined = joined + "\r" + opts.lines[i];

    var size = opts.lineSize;
    if (size === undefined) size = Math.round(opts.height * (opts.lines.length > 1 ? 0.222 : 0.244));
    text = kbText(comp, {
      text: joined, font: KB_FONT.bold, size: size,
      color: opts.ink || KB_COLOR.ink,
      x: opts.x, y: opts.y,
      tracking: opts.tracking === undefined ? 4 : opts.tracking, // не отрицательный: у Ғ, Қ, Ң слипаются выносные
      leading: Math.round(size * 1.12)
    });
    text.name = cutout.name + "-text";
    kbBrickFit(text, opts.width * 0.8, opts.height * 0.66);
    kbStick(text, cutout, 0, 0, 2);
  }

  return { cutout: cutout, text: text };
}

/**
 * Куча: кирпичи лежат горкой в несколько ярусов с нахлёстом, у каждого своё слово.
 * Ряды считаются снизу вверх, нечётные сдвинуты на пол-шага, у каждого кирпича свой разброс
 * по месту и повороту — куча должна читаться как «много, тяжело», а не как узор. Ряд выше лежит
 * ближе к камере (кирпич сверху накрывает нижний), поэтому порядок в мире совпадает с порядком слов.
 *
 * @param {CompItem} comp
 * @param {{x: number, groundY: number, z?: number, words: string[],
 *   brick: {width: number, height: number}, tilt?: number, seed?: number, perRow?: number,
 *   counts?: number[], overlap?: number, rowOverlap?: number, color?: [number, number, number],
 *   ink?: [number, number, number], lineSize?: number, grain?: boolean, name?: string}} opts
 *   x — середина кучи, groundY — земля (низ нижнего яруса); z — глубина плоскости кучи;
 *   counts — сколько кирпичей в каждом ярусе снизу вверх (горка задаётся прямо: [3,3,2,2,2,1]);
 *   без него perRow ровными рядами, без него √n; overlap — доля нахлёста по горизонтали (0,22),
 *   rowOverlap — по вертикали (0,26); tilt — предел случайного поворота, град. (6);
 *   пустая строка в words — пустой тональный кирпич без слоя текста (куча «без слов»: 13 слоёв
 *   пустого текста зря ходят в рендер)
 * @returns {{cutout: ShapeLayer, text: TextLayer}[]} кирпичи в порядке слов; text === null у пустых
 */
function kbBrickPile(comp, opts) {
  var words = opts.words;
  var bw = opts.brick.width;
  var bh = opts.brick.height;
  var overlap = opts.overlap === undefined ? 0.22 : opts.overlap;
  var rowOverlap = opts.rowOverlap === undefined ? 0.26 : opts.rowOverlap;
  var tilt = opts.tilt === undefined ? 6 : opts.tilt;
  var base = opts.z === undefined ? -40 : opts.z;
  var name = opts.name === undefined ? "pile" : opts.name;
  var rnd = kbHandNoise(opts.seed === undefined ? 7 : opts.seed);

  // Ярусы: либо заданы прямо (counts), либо ровные ряды по perRow с остатком наверху.
  var counts = opts.counts;
  if (!counts) {
    var perRow = opts.perRow === undefined ? Math.max(2, Math.round(Math.sqrt(words.length))) : opts.perRow;
    counts = [];
    var left = words.length;
    while (left > 0) {
      counts.push(Math.min(perRow, left));
      left -= perRow;
    }
  }

  var xStep = bw * (1 - overlap);
  var yStep = bh * (1 - rowOverlap);
  var bricks = [];
  var n = 0;
  for (var r = 0; r < counts.length && n < words.length; r++) {
    var count = Math.min(counts[r], words.length - n);
    // Ярусы качает то вправо, то влево: сдвиг в одну сторону собирал бы кучу в лесенку.
    var swing = r % 2 === 0 ? 0 : (r % 4 === 1 ? 0.4 : -0.4);
    var shift = swing * xStep + (rnd() * 2 - 1) * xStep * 0.14;
    for (var i = 0; i < count; i++) {
      var bx = opts.x + (i - (count - 1) / 2) * xStep + shift + (rnd() * 2 - 1) * bw * 0.07;
      var by = opts.groundY - bh / 2 - r * yStep + (rnd() * 2 - 1) * bh * 0.08;
      bricks.push(kbBrick(comp, {
        name: name + "-" + (n + 1),
        x: bx, y: by, z: base - n * 4,
        width: bw, height: bh,
        color: opts.color, ink: opts.ink,
        lines: words[n] ? [words[n]] : null, lineSize: opts.lineSize,
        tilt: (rnd() * 2 - 1) * tilt,
        seed: n + 1, grain: opts.grain
      }));
      n++;
    }
  }
  return bricks;
}

/**
 * Кладка: ряды снизу вверх с перевязкой. Чётные ряды — два полных кирпича, нечётные — половинки
 * по краям и полный по центру (шов не приходится на шов). Кирпичи из `slots` получают текст и цвет
 * слота, остальные остаются пустыми тональными.
 *
 * Геометрия выводится из ширины кирпича: стена идёт от x − W до x + W (при W = 520 и x = 540 это
 * 20…1060), половинки отступают от краёв на `gap` — те же 150 и 930, что лежат в data.jsx ролика.
 *
 * @param {CompItem} comp
 * @param {{groundY: number, brick: {width: number, height: number}, half: {width: number, height: number},
 *   rowStep: number, rows: number, slots: {x: number, row: number, lines?: string[],
 *   color?: [number, number, number], ink?: [number, number, number], lineSize?: number}[],
 *   x?: number, z?: number, gap?: number, tilt?: number, seed?: number,
 *   color?: [number, number, number], ink?: [number, number, number], fill?: boolean,
 *   grain?: boolean, name?: string}} opts
 *   x — середина стены (без него середина кадра); rowStep — шаг ряда вверх от земли;
 *   fill: false — ставить только кирпичи слотов (первый ряд ролика, пока дома ещё нет);
 *   tilt — предел случайного поворота, град. (1,2: стена сложена рукой, а не по чертежу)
 * @returns {{cutout: ShapeLayer, text: TextLayer}[]} кирпичи снизу вверх, слева направо
 */
function kbBrickBond(comp, opts) {
  var full = opts.brick.width;
  var halfWidth = opts.half.width;
  var height = opts.brick.height;
  var cx = opts.x === undefined ? comp.width / 2 : opts.x;
  var gap = opts.gap === undefined ? 10 : opts.gap;
  var tilt = opts.tilt === undefined ? 1.2 : opts.tilt;
  var base = opts.z === undefined ? -40 : opts.z;
  var name = opts.name === undefined ? "bond" : opts.name;
  var rnd = kbHandNoise(opts.seed === undefined ? 11 : opts.seed);

  var bricks = [];
  for (var r = 0; r < opts.rows; r++) {
    var y = opts.groundY - height / 2 - r * opts.rowStep;
    /** @type {number[]} */
    var xs;
    /** @type {number[]} */
    var widths;
    if (r % 2 === 0) {
      xs = [cx - full / 2, cx + full / 2];
      widths = [full, full];
    } else {
      xs = [cx - full + halfWidth / 2 + gap, cx, cx + full - halfWidth / 2 - gap];
      widths = [halfWidth, full, halfWidth];
    }

    for (var i = 0; i < xs.length; i++) {
      var slot = null;
      for (var s = 0; s < opts.slots.length; s++) {
        if (opts.slots[s].row === r && Math.abs(opts.slots[s].x - xs[i]) < 8) slot = opts.slots[s];
      }
      var turn = (rnd() * 2 - 1) * tilt; // ряд крутится всегда — иначе seed зависит от состава слотов
      if (!slot && opts.fill === false) continue;

      bricks.push(kbBrick(comp, {
        name: name + "-" + r + "-" + i,
        x: xs[i], y: y, z: base - r * 3,
        width: widths[i], height: height,
        color: slot ? (slot.color || KB_COLOR.blue) : (opts.color || KB_BRICK_PAPER),
        ink: slot ? (slot.ink || KB_COLOR.paper) : (opts.ink || KB_COLOR.ink),
        lines: slot ? slot.lines : null,
        lineSize: slot ? slot.lineSize : undefined,
        tilt: turn, seed: r * 7 + i + 1, grain: opts.grain
      }));
    }
  }
  return bricks;
}

/**
 * Непрозрачность кирпича целиком: вырезка и текст на ней.
 * Текст сидит на вырезке ребёнком, а непрозрачность через родителя НЕ наследуется — без второго
 * ключа у погашенного кирпича в воздухе остаются висеть буквы.
 * @param {{cutout: ShapeLayer, text: TextLayer}} brick
 * @param {number[]} times
 * @param {number[]} values проценты
 * @param {boolean} [hold] ступенькой (подмена одного кирпича другим), а не плавно
 */
function kbBrickOpacity(brick, times, values, hold) {
  var layers = [brick.cutout];
  if (brick.text) layers.push(brick.text);
  for (var i = 0; i < layers.length; i++) {
    var prop = kbProp(layers[i], ["ADBE Transform Group", "ADBE Opacity"]);
    for (var t = 0; t < times.length; t++) prop.setValueAtTime(times[t], values[t]);
    if (hold) {
      for (var k = 1; k <= prop.numKeys; k++) {
        prop.setInterpolationTypeAtKey(k, KeyframeInterpolationType.HOLD, KeyframeInterpolationType.HOLD);
      }
    }
  }
}

/**
 * Кирпич выпрыгивает на месте другого: маленький гаснет ступенькой, большой зажигается там же
 * и доезжает масштабом с перелётом.
 * Подмена именно ступенькой: тянуть один кирпич в другой нельзя — ни размер, ни цвет по дороге
 * не читаются (середина пути охра → серый выходит грязной, см. `kbKeyColor` в show-d).
 * @param {{cutout: ShapeLayer, text: TextLayer}} brick который появляется
 * @param {number} time
 * @param {{replace?: {cutout: ShapeLayer, text: TextLayer}, from?: number, over?: number, duration?: number}} [opts]
 *   replace — кирпич, который в этот же кадр гаснет; from — с какого масштаба выпрыгивает, % (62);
 *   over — перелёт, % (108); duration — за сколько садится на 100 %, с (0,34)
 */
function kbBrickPop(brick, time, opts) {
  opts = opts || {};
  var from = opts.from === undefined ? 62 : opts.from;
  var over = opts.over === undefined ? 108 : opts.over;
  var duration = opts.duration === undefined ? 0.34 : opts.duration;

  kbBrickOpacity(brick, [0, time], [0, 100], true);
  if (opts.replace) kbBrickOpacity(opts.replace, [0, time], [100, 0], true);

  kbOvershoot(kbProp(brick.cutout, ["ADBE Transform Group", "ADBE Scale"]), time, duration,
    [from, from, 100], [over, over, 100], [100, 100, 100]);
}

/**
 * Полёт кирпича по дуге броска.
 *
 * Дуга — квадратичная кривая Безье, снятая равными долями параметра: равномерный шаг параметра
 * по такой кривой и есть баллистика (постоянная скорость по горизонтали плюс постоянное ускорение
 * вниз), поэтому ключи ставятся ЛИНЕЙНЫМИ — easing на концах дал бы «мультяшный подлёт» вместо броска.
 * Обе стороны кирпича (казахская и английская) летят одним списком: ключи у них должны совпадать
 * до кадра, иначе на перевороте стороны разъедутся.
 *
 * @param {{cutout: ShapeLayer, text: TextLayer}[]} bricks кирпич или обе его стороны
 * @param {{start: number, duration: number, from: [number, number, number], to: [number, number, number],
 *   apex: [number, number, number], samples?: number, tilt?: [number, number], gap?: number}} opts
 *   from / to — центр кирпича в МИРЕ; apex — точка, через которую кривая проходит на середине пути
 *   (не обязательно высшая: при разной высоте концов вершина дуги смещается к более низкому концу);
 *   samples — сколько ключей на полёт (24); tilt — поворот по Z от и до, град.;
 *   gap — на сколько каждая следующая сторона ближе к камере, px (1,5: копланарные 3D-слои мерцают)
 */
function kbBrickFly(bricks, opts) {
  var samples = opts.samples === undefined ? 24 : opts.samples;
  var gap = opts.gap === undefined ? 1.5 : opts.gap;
  var from = opts.from;
  var to = opts.to;
  var apex = opts.apex;
  // Контрольная точка подбирается так, чтобы кривая прошла ровно через apex на середине параметра.
  var control = [
    2 * apex[0] - (from[0] + to[0]) / 2,
    2 * apex[1] - (from[1] + to[1]) / 2,
    2 * apex[2] - (from[2] + to[2]) / 2
  ];

  var times = [];
  var points = [];
  for (var i = 0; i <= samples; i++) {
    var u = i / samples;
    var a = (1 - u) * (1 - u);
    var b = 2 * u * (1 - u);
    var c = u * u;
    times.push(opts.start + opts.duration * u);
    points.push([
      a * from[0] + b * control[0] + c * to[0],
      a * from[1] + b * control[1] + c * to[1],
      a * from[2] + b * control[2] + c * to[2]
    ]);
  }

  for (var n = 0; n < bricks.length; n++) {
    var position = kbProp(bricks[n].cutout, ["ADBE Transform Group", "ADBE Position"]);
    for (var k = 0; k < times.length; k++) {
      position.setValueAtTime(times[k], [points[k][0], points[k][1], points[k][2] - n * gap]);
      var key = position.nearestKeyIndex(times[k]);
      position.setInterpolationTypeAtKey(key, KeyframeInterpolationType.LINEAR, KeyframeInterpolationType.LINEAR);
    }
    if (opts.tilt) {
      kbKeys(kbProp(bricks[n].cutout, ["ADBE Transform Group", "ADBE Rotate Z"]),
        [opts.start, opts.start + opts.duration], [opts.tilt[0], opts.tilt[1]], KB_EASE.soft);
    }
  }
}

/**
 * Переворот кирпича другой стороной: лицевая идёт по Y от 0 к 180°, обратная следом от −180 к 0,
 * и ровно на 90° — когда обе видны с ребра и в кадре их нет — они меняются hold-ключами.
 * Одним слоем этого не сделать: у вырезки с изнанки тот же текст, только зеркальный.
 * Easing мягкий с обоих концов намеренно: кирпич задерживается на каждой стороне, и обе надписи
 * успевают прочитаться за один просмотр.
 * @param {{cutout: ShapeLayer, text: TextLayer}} front сторона, с которой начинают
 * @param {{cutout: ShapeLayer, text: TextLayer}} back сторона, которой заканчивают
 * @param {{start: number, duration: number}} opts
 */
function kbBrickFlip(front, back, opts) {
  var swap = opts.start + opts.duration / 2;
  var times = [opts.start, opts.start + opts.duration];

  kbKeys(kbProp(front.cutout, ["ADBE Transform Group", "ADBE Rotate Y"]), times, [0, 180], KB_EASE.soft);
  kbKeys(kbProp(back.cutout, ["ADBE Transform Group", "ADBE Rotate Y"]), times, [-180, 0], KB_EASE.soft);

  kbBrickOpacity(front, [opts.start, swap], [100, 0], true);
  kbBrickOpacity(back, [opts.start, swap], [0, 100], true);
}

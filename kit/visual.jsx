// Картинки и фоны в стиле серии: kit/library/{images,backgrounds}.json — параметры, здесь — сборка.
//
//   var st = kbStyle("editorial-dark");
//   kbBackground(st, comp);                                   // фон по shape.background стиля
//   var img = kbImage(st, comp, "/…/apple.png", {box: [540, 700, 720, 720], start: 0.4, hold: 5, focus: [0.5, 0.4]});
//   kbImageZoom(st, img, [0.62, 0.3], 3.2);                  // наезд к детали
//
// Картинка сидит под матом (track matte): рамка неподвижна, наезд и сдвиг идут внутри неё.

//@include "library.jsx"
//@include "footage.jsx"

/**
 * Формат композиции для токенов: 9x16, 16x9 или 1x1.
 * @param {CompItem} comp
 * @returns {string}
 */
function kbFormat(comp) {
  if (Math.abs(comp.width - comp.height) < 2) return "1x1";
  return comp.width < comp.height ? "9x16" : "16x9";
}

/**
 * Цвет роли стиля, смешанный с другой ролью: mix 0 — первая, 1 — вторая.
 * @param {any} style
 * @param {string} a
 * @param {string=} b
 * @param {number=} mix
 * @returns {[number, number, number]}
 */
function kbColorMix(style, a, b, mix) {
  var c = kbHex(kbTok(style, "color." + a));
  if (!b || !mix) return c;
  var d = kbHex(kbTok(style, "color." + b));
  return [c[0] + (d[0] - c[0]) * mix, c[1] + (d[1] - c[1]) * mix, c[2] + (d[2] - c[2]) * mix];
}

// ---------- фоны ----------

/**
 * Фон во всю композицию — самым нижним слоем (или слоями).
 * @param {any} style
 * @param {CompItem} comp
 * @param {string=} id по умолчанию shape.background стиля
 * @param {{start?: number, params?: any}=} opts
 * @returns {{id: string, layers: string[]}}
 */
function kbBackground(style, comp, id, opts) {
  var bid = id || kbTok(style, "shape.background");
  var item = kbLibItem(bid);
  var o = opts || {};
  var p = kbLibParams(item, o);
  // Размер по формату: {"9x16": …, "16x9": …} — плашка не должна ложиться под текст safe-зоны.
  if (kbIsPlain(p.size)) p.size = p.size[kbFormat(comp)];
  var unit = kbLibUnit(style, comp);
  var W = comp.width;
  var H = comp.height;
  var made = [];
  var base = comp.layers.addSolid(kbColorMix(style, p.color), "bg · base", W, H, 1, comp.duration);
  made.push(base);
  var start = o.start || 0;
  var trDur = kbMsToTime(kbMs(style, "transition"), 1 / comp.frameDuration);

  if (bid === "bg.gradient") {
    var ramp = kbEffect(base, "ADBE Ramp");
    kbProp(ramp, ["ADBE Ramp-0001"]).setValue([W / 2, 0]);
    kbProp(ramp, ["ADBE Ramp-0002"]).setValue(kbColorMix(style, p.color));
    kbProp(ramp, ["ADBE Ramp-0003"]).setValue([W / 2, H]);
    kbProp(ramp, ["ADBE Ramp-0004"]).setValue(kbColorMix(style, p.color, p.toward, p.mix));
  } else if (bid === "bg.grid-fine" || bid === "bg.dots") {
    var grid = kbLibShapeLayer(comp, "bg · pattern");
    made.push(grid);
    var step = p.step * unit;
    var color = kbColorMix(style, p.line);
    var nx = Math.ceil(W / step) + 2;
    var ny = Math.ceil(H / step) + 2;
    if (bid === "bg.grid-fine") {
      kbBgRepeat(kbLibShape(grid, { name: "v", vertices: [[-step, -step], [-step, H + step]], stroke: color, width: p.width * unit, cap: "butt" }).group, nx, [step, 0]);
      kbBgRepeat(kbLibShape(grid, { name: "h", vertices: [[-step, -step], [W + step, -step]], stroke: color, width: p.width * unit, cap: "butt" }).group, ny, [0, step]);
    } else {
      var dots = kbLibShape(grid, { name: "dots", ellipse: [p.dot * unit, p.dot * unit], center: [-step, -step], fill: color }).group;
      kbBgRepeat(dots, nx, [step, 0]);
      kbBgRepeat(dots, ny, [0, step]);
    }
    kbProp(grid, ["ADBE Transform Group", "ADBE Opacity"]).setValue(p.opacity);
    // Дрейф по диагонали с переносом на шаг сетки — узор бесконечен, слой не уезжает.
    if (p.drift) kbProp(grid, ["ADBE Transform Group", "ADBE Position"]).expression = "var s=" + step + ",v=" + (p.drift * unit) + ";var d=(time*v)%s;[d,d]";
  } else if (bid === "bg.panel") {
    var vertical = kbFormat(comp) === "9x16";
    var panel = kbLibShapeLayer(comp, "bg · panel");
    made.push(panel);
    var pw = vertical ? W : W * p.size;
    var ph = vertical ? H * p.size : H;
    kbLibShape(panel, { name: "panel", rect: [pw, ph], center: [pw / 2, ph / 2], fill: kbColorMix(style, p.panel) });
    kbKeysCurve(kbProp(panel, ["ADBE Transform Group", "ADBE Scale"]), start, trDur, vertical ? [100, 0] : [0, 100], [100, 100], kbTok(style, "motion.ease.transition"));
  } else if (bid === "bg.blocks") {
    var block = kbLibShapeLayer(comp, "bg · block");
    made.push(block);
    var bh = H * p.size;
    kbLibShape(block, { name: "block", rect: [W, bh], center: [W / 2, -bh / 2], fill: kbColorMix(style, p.block) });
    kbProp(block, ["ADBE Transform Group", "ADBE Position"]).setValue([0, H]);
    kbKeysCurve(kbProp(block, ["ADBE Transform Group", "ADBE Scale"]), start, trDur, [100, 0], [100, 100], kbTok(style, "motion.ease.transition"));
  } else if (bid === "bg.noise") {
    var noise = comp.layers.addSolid([0.5, 0.5, 0.5], "bg · noise", W, H, 1, comp.duration);
    made.push(noise);
    var fn = kbEffect(noise, "ADBE Fractal Noise");
    kbProp(fn, ["ADBE Fractal Noise-0004"]).setValue(60);
    noise.blendingMode = BlendingMode.OVERLAY;
    kbProp(noise, ["ADBE Transform Group", "ADBE Opacity"]).setValue(p.opacity);
  } else if (bid === "bg.blobs") {
    // Пятно — solid с растушёванной круглой маской: размытие shape-слоя обрезается рамкой содержимого (квадраты).
    for (var b = 0; b < p.blobs.length; b++) {
      var d = W * 0.4;
      var blob = comp.layers.addSolid(kbColorMix(style, p.blobs[b]), "bg · blob " + (b + 1), Math.round(d * 2), Math.round(d * 2), 1, comp.duration);
      made.push(blob);
      var cx = W * [0.2, 0.8, 0.5][b % 3];
      var cy = H * [0.25, 0.45, 0.8][b % 3];
      var circle = new Shape();
      var r = d / 2;
      var k = r * 0.5523;
      circle.vertices = [[d, d - r], [d + r, d], [d, d + r], [d - r, d]];
      circle.inTangents = [[-k, 0], [0, -k], [k, 0], [0, k]];
      circle.outTangents = [[k, 0], [0, k], [-k, 0], [0, -k]];
      circle.closed = true;
      var bm = kbGroup(blob, ["ADBE Mask Parade"]).addProperty("ADBE Mask Atom"); // ae-ok: matchname
      kbProp(bm, ["ADBE Mask Shape"]).setValue(circle); // ae-ok: matchname
      kbProp(bm, ["ADBE Mask Feather"]).setValue([d * 0.45, d * 0.45]); // ae-ok: matchname
      kbProp(blob, ["ADBE Transform Group", "ADBE Position"]).expression =
        "[" + cx + "+" + (60 * unit) + "*Math.sin(2*Math.PI*time/9+" + b * 2.1 + ")," + cy + "+" + (40 * unit) + "*Math.cos(2*Math.PI*time/9+" + b * 1.3 + ")]";
      kbProp(blob, ["ADBE Transform Group", "ADBE Opacity"]).setValue(p.opacity);
    }
  } else if (bid !== "bg.solid") {
    throw new Error("Фон «" + bid + "» не собирается: bg.solid, bg.gradient, bg.grid-fine, bg.dots, bg.panel, bg.blocks, bg.noise, bg.blobs");
  }

  // Вниз стопки: последним опускается первый созданный (основа) — он и оказывается в самом низу.
  for (var m = made.length - 1; m >= 0; m--) made[m].moveToEnd();
  return { id: bid, layers: kbLibNames(made) };
}

/**
 * Повторитель в группе shape: n копий со сдвигом offset.
 * @param {PropertyGroup} group
 * @param {number} n
 * @param {number[]} offset
 */
function kbBgRepeat(group, n, offset) {
  var rep = kbAdd(kbGroup(group, ["ADBE Vectors Group"]), "ADBE Vector Filter - Repeater");
  kbProp(rep, ["ADBE Vector Repeater Copies"]).setValue(n);
  kbProp(rep, ["ADBE Vector Repeater Transform", "ADBE Vector Repeater Position"]).setValue(offset);
}

// ---------- картинки ----------

/**
 * Картинка в рамке стиля.
 * @param {any} style
 * @param {CompItem} comp
 * @param {string} file абсолютный путь или путь от папки ae/ (KB_ROOT)
 * @param {{box: number[], mask?: string, fit?: string, focus?: number[], grade?: string, start?: number, hold?: number, reveal?: boolean, kenBurns?: boolean, name?: string, radius?: number}} o
 *   box — [центр x, центр y, ширина, высота]; mask — rounded | rect | circle | cutout | none (по умолчанию shape.imageMask);
 *   hold — длина сцены для наезда (с); reveal/kenBurns — по умолчанию по motion.image стиля
 * @returns {{image: AVLayer, matte: ShapeLayer|null, layers: string[], box: number[], start: number, end: number, scale: number, mask: string}}
 */
function kbImage(style, comp, file, o) {
  var path = /^(\/|~)/.test(file) ? file : KB_ROOT.fsName + "/" + file;
  var item = kbImport(path);
  var fps = 1 / comp.frameDuration;
  var unit = kbLibUnit(style, comp);
  var mask = o.mask || kbTok(style, "shape.imageMask");
  var fit = o.fit || (mask === "cutout" || mask === "none" ? "contain" : "cover");
  var focus = o.focus || [0.5, 0.5];
  var start = o.start === undefined ? 0 : o.start;
  var hold = o.hold === undefined ? 5 : o.hold;
  var motion = kbTok(style, "motion.image");
  var wants = function (id) { for (var i = 0; i < motion.length; i++) if (motion[i] === id) return true; return false; };
  var box = o.box;
  var made = [];

  var layer = comp.layers.add(item);
  layer.name = o.name || item.name.replace(/\.[^.]+$/, "");
  made.push(layer);
  var iw = item.width;
  var ih = item.height;
  var s = fit === "cover" ? Math.max(box[2] / iw, box[3] / ih) : Math.min(box[2] / iw, box[3] / ih);
  // Фокус к центру рамки, но картинка не открывает края рамки.
  var dx = Math.max(-(iw * s - box[2]) / 2, Math.min((iw * s - box[2]) / 2, (0.5 - focus[0]) * iw * s));
  var dy = Math.max(-(ih * s - box[3]) / 2, Math.min((ih * s - box[3]) / 2, (0.5 - focus[1]) * ih * s));
  if (fit !== "cover") { dx = 0; dy = 0; }
  var scaleProp = kbProp(layer, ["ADBE Transform Group", "ADBE Scale"]);
  var posProp = kbProp(layer, ["ADBE Transform Group", "ADBE Position"]);
  scaleProp.setValue([s * 100, s * 100]);
  posProp.setValue([box[0] + dx, box[1] + dy]);
  layer.motionBlur = true;

  var grade = o.grade === undefined ? kbTok(style, "shape.imageGrade") : o.grade;
  if (grade && grade !== "none") kbImageGrade(style, layer, grade);

  var matte = null;
  if (mask === "rounded" || mask === "rect" || mask === "circle") {
    matte = kbLibShapeLayer(comp, layer.name + " · matte");
    var r = mask === "rounded" ? (o.radius === undefined ? kbTok(style, "shape.radius.card") * unit : o.radius) : 0;
    var shape = mask === "circle"
      ? kbLibShape(matte, { name: "frame", ellipse: [Math.min(box[2], box[3]), Math.min(box[2], box[3])], center: [box[0], box[1]], fill: [1, 1, 1] })
      : kbLibShape(matte, { name: "frame", rect: [box[2], box[3]], center: [box[0], box[1]], radius: r, fill: [1, 1, 1] });
    matte.moveBefore(layer);
    layer.setTrackMatte(matte, TrackMatteType.ALPHA);
    made.push(matte);
    if (o.reveal !== false && wants("image.maskReveal")) kbImageReveal(style, matte, shape.group, mask, box, start);
  } else if (mask === "cutout") {
    if (kbTok(style, "shape.sticker") === "outline-white") made.push(kbImageOutline(style, layer, unit));
    if (o.reveal !== false) kbLib(style, "enter.pop", layer, { start: start });
  } else if (o.reveal !== false) {
    kbLib(style, "enter.scaleIn", layer, { start: start });
  }

  var end = start + kbMsToTime(kbMs(style, kbLibItem("image.maskReveal").dur), fps);
  if (fit === "cover" && o.kenBurns !== false && wants("image.kenBurns")) {
    var kb = kbLibParams(kbLibItem("image.kenBurns"), {});
    var s0 = s * 100;
    var s1 = s0 * kb.scale / 100;
    var p0 = posProp.value;
    // Сдвиг к фокусу: доля кадра в сторону, где фокус от центра; не дальше, чем позволяет запас масштаба.
    var room = (s1 / s0 - 1) / 2;
    var shift = Math.min(kb.drift, room);
    var p1 = [p0[0] + (0.5 - focus[0]) * 2 * shift * box[2], p0[1] + (0.5 - focus[1]) * 2 * shift * box[3]];
    kbKeysCurve(scaleProp, start, Math.max(hold, 1), [s0, s0], [s1, s1], "sineInOut");
    kbKeysCurve(posProp, start, Math.max(hold, 1), p0, p1, "sineInOut");
  }
  return { image: /** @type {AVLayer} */ (layer), matte: matte, layers: kbLibNames(made), box: box, start: start, end: end, scale: s, mask: mask };
}

/**
 * Цветокоррекция картинки: image.normalize (уровни, насыщенность, тонировка) или image.duotone.
 * @param {any} style
 * @param {Layer} layer
 * @param {string} id
 */
function kbImageGrade(style, layer, id) {
  var p = kbLibParams(kbLibItem(id), {});
  if (id === "image.normalize") {
    var lv = kbEffect(layer, "ADBE Easy Levels2");
    kbProp(lv, ["ADBE Easy Levels2-0003"]).setValue(p.black);
    kbProp(lv, ["ADBE Easy Levels2-0004"]).setValue(p.white);
    kbProp(kbEffect(layer, "ADBE HUE SATURATION"), ["ADBE HUE SATURATION-0005"]).setValue(p.saturation);
  }
  var tint = kbEffect(layer, "ADBE Tint");
  kbProp(tint, ["ADBE Tint-0001"]).setValue(kbColorMix(style, p.dark));
  kbProp(tint, ["ADBE Tint-0002"]).setValue(kbColorMix(style, p.light));
  kbProp(tint, ["ADBE Tint-0003"]).setValue(id === "image.normalize" ? p.tint : p.amount);
}

/**
 * Раскрытие мата: прямоугольник — шторкой снизу вверх (высота 0 → h, центр снизу), круг — ирисом из центра.
 * @param {any} style
 * @param {ShapeLayer} matte
 * @param {PropertyGroup} group
 * @param {string} mask
 * @param {number[]} box
 * @param {number} start
 */
function kbImageReveal(style, matte, group, mask, box, start) {
  var fps = 1 / matte.containingComp.frameDuration;
  var dur = kbMsToTime(kbMs(style, kbLibItem("image.maskReveal").dur), fps);
  var curve = kbTok(style, "motion.ease.enter");
  var contents = kbGroup(group, ["ADBE Vectors Group"]);
  if (mask === "circle") {
    var d = Math.min(box[2], box[3]);
    kbKeysCurve(kbProp(contents, ["ADBE Vector Shape - Ellipse", "ADBE Vector Ellipse Size"]), start, dur, [0, 0], [d, d], curve);
    return;
  }
  var rect = kbGroup(contents, ["ADBE Vector Shape - Rect"]);
  kbKeysCurve(kbProp(rect, ["ADBE Vector Rect Size"]), start, dur, [box[2], 0], [box[2], box[3]], curve);
  kbKeysCurve(kbProp(rect, ["ADBE Vector Rect Position"]), start, dur, [box[0], box[1] + box[3] / 2], [box[0], box[1]], curve);
}

/**
 * Белая обводка вырезки (стикер): копия слоя под ним, залитая белым и расширенная Minimax.
 * @param {any} style
 * @param {AVLayer} layer
 * @param {number} unit
 * @returns {AVLayer}
 */
function kbImageOutline(style, layer, unit) {
  var outline = /** @type {AVLayer} */ (layer.duplicate());
  outline.name = layer.name + " · outline";
  var parade = kbGroup(outline, ["ADBE Effect Parade"]);
  while (parade.numProperties) parade.property(1).remove();
  kbProp(kbEffect(outline, "ADBE Fill"), ["ADBE Fill-0002"]).setValue([1, 1, 1]);
  var mm = kbEffect(outline, "ADBE Minimax"); // ae-ok: bpc — белый силуэт, яркостей выше 1.0 нет
  kbProp(mm, ["ADBE Minimax-0001"]).setValue(2); // максимум по альфе: силуэт шире на радиус
  kbProp(mm, ["ADBE Minimax-0002"]).setValue(kbTok(style, "shape.stroke.stickerOutline") * unit / Math.max(0.01, kbProp(layer, ["ADBE Transform Group", "ADBE Scale"]).value[0] / 100));
  kbProp(mm, ["ADBE Minimax-0003"]).setValue(4); // только альфа
  outline.moveAfter(layer);
  outline.parent = layer;
  return outline;
}

/**
 * Наезд к детали внутри рамки: точка focus [u, v] картинки встаёт в центр рамки, масштаб × scale / 100.
 * @param {any} style
 * @param {{image: AVLayer, box: number[], scale: number}} img результат kbImage
 * @param {number[]} focus
 * @param {number} start
 * @param {{scale?: number, dur?: number}=} o
 * @returns {{start: number, end: number, point: number[]}}
 */
function kbImageZoom(style, img, focus, start, o) {
  var item = kbLibItem("image.zoomDetail");
  var p = kbLibParams(item, { params: o || {} });
  var fps = 1 / img.image.containingComp.frameDuration;
  var dur = kbLibDur(style, item, o && o.dur ? { dur: o.dur } : {}, fps);
  var src = /** @type {any} */ (img.image.source);
  var s1 = img.scale * p.scale;
  var scaleProp = kbProp(img.image, ["ADBE Transform Group", "ADBE Scale"]);
  var posProp = kbProp(img.image, ["ADBE Transform Group", "ADBE Position"]);
  var s0 = scaleProp.valueAtTime(start, false);
  var p0 = posProp.valueAtTime(start, false);
  var p1 = [img.box[0] - (focus[0] - 0.5) * src.width * s1 / 100, img.box[1] - (focus[1] - 0.5) * src.height * s1 / 100];
  // Ключи наезда стирают продолжение Ken Burns после start — дальше картинка стоит на детали.
  kbLibClearAfter(scaleProp, start);
  kbLibClearAfter(posProp, start);
  kbKeysCurve(scaleProp, start, dur, s0, [s1, s1], kbLibCurve(style, item.curve, "move"));
  kbKeysCurve(posProp, start, dur, p0, p1, kbLibCurve(style, item.curve, "move"));
  return { start: start, end: start + dur, point: img.box.slice(0, 2) };
}

/**
 * Убрать ключи свойства позже t (значение в t сохраняется ключом).
 * @param {Property} prop
 * @param {number} t
 */
function kbLibClearAfter(prop, t) {
  if (!prop.numKeys) return;
  var v = prop.valueAtTime(t, false);
  for (var k = prop.numKeys; k >= 1; k--) if (prop.keyTime(k) > t + 1e-4) prop.removeKey(k);
  prop.setValueAtTime(t, v);
}

// Блоки урока: kit/library/blocks.json — раскладка и тайминг, здесь — сборка блока своей композицией.
//
//   var st = kbStyle("editorial-dark");
//   var b = kbBlock(st, "word", {word: "apple", ipa: "/ˈæp.əl/", tr: "алма · яблоко", example: "I eat an *apple* every day.",
//                               image: "assets/doodle/apple.png"}, {format: "9x16", index: 2});
//   // b.comp — композиция блока, b.duration — длина, b.beats — моменты входов (для голоса и переходов)
//
// Блок не знает цветов, шрифтов и длительностей — всё из стиля и blocks.json. Координаты слотов — доли safe-зоны формата.

//@include "visual.jsx"

/** Размер композиции по формату. */
var KB_BLOCK_SIZE = { "9x16": [1080, 1920], "16x9": [1920, 1080], "1x1": [1080, 1080] };

/**
 * Контекст сборки блока: композиция, стиль, формат, safe-зона, перевод долей в px.
 * @param {any} style
 * @param {any} item
 * @param {any} o
 * @returns {any}
 */
function kbBlockCtx(style, item, o) {
  var fmt = o.format || "9x16";
  var size = KB_BLOCK_SIZE[fmt];
  if (!size) throw new Error("Формат «" + fmt + "»: 9x16, 16x9, 1x1");
  var name = o.name || ("block · " + (o.index ? (o.index < 10 ? "0" : "") + o.index + " · " : "") + item.id + " · " + fmt);
  for (var i = app.project.numItems; i >= 1; i--) if (app.project.item(i).name === name && app.project.item(i) instanceof CompItem) app.project.item(i).remove();
  var comp = app.project.items.addComp(name, size[0], size[1], 1, o.duration || 30, o.fps || 30);
  var safe = kbTok(style, "safe." + fmt);
  var ctx = {
    style: style, item: item, comp: comp, fmt: fmt, fps: o.fps || 30, index: o.index || 0, audience: o.audience || "teens",
    unit: kbLibUnit(style, comp), tempo: kbTok(style, "motion.tempo"),
    L: safe.left, T: safe.top, W: size[0] - safe.left - safe.right, H: size[1] - safe.top - safe.bottom,
    layout: item.layout[fmt] || item.layout["9x16"], end: 0, beats: []
  };
  return ctx;
}

/**
 * Точка слота: доли safe-зоны → px композиции.
 * @param {any} c
 * @param {number[]} f [x, y] или [x, y, w, h]
 * @returns {number[]}
 */
function kbBlockAt(c, f) {
  var out = [c.L + f[0] * c.W, c.T + f[1] * c.H];
  if (f.length > 2) out.push(f[2] * c.W, (f.length > 3 ? f[3] : f[2]) * c.H);
  return out;
}

/**
 * Время бита блока (с, × tempo).
 * @param {any} c
 * @param {string} key
 * @returns {number}
 */
function kbBlockBeat(c, key) {
  var b = c.item.beats[key];
  if (b === undefined) throw new Error("В блоке " + c.item.id + " нет бита «" + key + "»");
  return Math.round(b * c.tempo * c.fps) / c.fps;
}

/**
 * Текст блока по роли кегля: hero, h1, h2, body, translation, label; шрифт и цвет из стиля.
 * @param {any} c
 * @param {string} role
 * @param {string} text
 * @param {number[]} at
 * @param {{color?: string, font?: string, scale?: number, name?: string, tracking?: number, maxWidth?: number}=} o
 * @returns {TextLayer}
 */
function kbBlockText(c, role, text, at, o) {
  var opt = o || {};
  var st = c.style;
  var fontRole = opt.font || { hero: "hero", h1: "display", h2: "display", body: "text", translation: "text", label: "mono" }[role] || "text";
  var size = kbTok(st, "type.size." + role + "." + (c.fmt === "1x1" ? "9x16" : c.fmt)) * c.unit * (opt.scale || 1);
  var trackKey = { hero: "hero", h1: "h1", h2: "h1", label: "label" }[role] || "body";
  var lines = String(text).split(/\r\n|\r|\n/).length;
  var layer = kbText(c.comp, {
    text: text, font: kbTok(st, "type.font." + fontRole), size: size,
    color: kbHex(kbTok(st, "color." + (opt.color || (role === "label" || role === "translation" ? "muted" : "ink")))),
    x: at[0], y: at[1], tracking: opt.tracking === undefined ? kbTok(st, "type.tracking." + trackKey) : opt.tracking,
    leading: lines > 1 ? size * kbTok(st, "type.leading." + (role === "body" || role === "translation" ? "body" : "title")) : undefined
  });
  layer.name = opt.name || (role + " · " + String(text).substr(0, 24));
  // Не шире слота: длинный текст уменьшается целиком, но не мельче type.min.
  if (opt.maxWidth) {
    var w = layer.sourceRectAtTime(0, false).width;
    if (w > opt.maxWidth) {
      var k = Math.max(opt.maxWidth / w, kbTok(st, "type.min") * c.unit / size);
      kbProp(layer, ["ADBE Transform Group", "ADBE Scale"]).setValue([k * 100, k * 100]);
    }
  }
  return layer;
}

/**
 * Метка блока по type.labels стиля: numbered-mono — «02 — NEW WORD», caps — «NEW WORD», plain — «New word».
 * @param {any} c
 * @param {string=} text
 * @returns {string}
 */
function kbBlockLabel(c, text) {
  var t = text || c.item.label;
  var mode = kbTok(c.style, "type.labels");
  // Своя метка (например «Lesson 03») уже несёт номер — без второй нумерации.
  if (mode === "numbered-mono" && !text && c.index > 0) return (c.index < 10 ? "0" : "") + c.index + " — " + t.toUpperCase();
  if (mode === "caps" || mode === "numbered-mono") return t.toUpperCase();
  return t.charAt(0).toUpperCase() + t.substr(1).toLowerCase();
}

/**
 * Применить примитив и запомнить конец и бит.
 * @param {any} c
 * @param {string} id
 * @param {Layer|null} layer
 * @param {any} opts
 * @param {string=} beat
 * @returns {any}
 */
function kbBlockRun(c, id, layer, opts, beat) {
  var o = opts || {};
  if (!o.comp) o.comp = c.comp;
  var r = kbLib(c.style, id, layer, o);
  if (r.end > c.end) c.end = r.end;
  if (beat) c.beats.push({ beat: beat, t: Math.round(r.start * 1000) / 1000 });
  return r;
}

/**
 * Текст меняет цвет целиком на роль стиля (аниматор Fill Color, amount 0 → 100 за dur.micro).
 * @param {any} c
 * @param {TextLayer} layer
 * @param {string} role
 * @param {number} start
 */
function kbBlockTextColor(c, layer, role, start) {
  var anim = kbAdd(kbGroup(layer, ["ADBE Text Properties", "ADBE Text Animators"]), "ADBE Text Animator");
  anim.name = "color → " + role;
  var rgb = kbHex(kbTok(c.style, "color." + role));
  /** @type {Property} */ (kbGroup(anim, ["ADBE Text Animator Properties"]).addProperty("ADBE Text Fill Color")).setValue([rgb[0], rgb[1], rgb[2], 1]);
  var sel = kbAdd(kbGroup(anim, ["ADBE Text Selectors"]), "ADBE Text Expressible Selector"); // ae-ok: matchname
  var dur = kbMsToTime(kbMs(c.style, "micro"), c.fps);
  kbProp(sel, ["ADBE Text Expressible Amount"]).expression = "linear(time," + start + "," + (start + dur) + ",0,100)"; // ae-ok: matchname
}

/**
 * Карточка: скруглённая плашка (surface) с текстом-ребёнком; анимируется плашка.
 * @param {any} c
 * @param {number[]} box [cx, cy, w, h]
 * @param {string} text
 * @param {{role?: string, name?: string, prefix?: string}=} o
 * @returns {{plate: ShapeLayer, text: TextLayer}}
 */
function kbBlockCard(c, box, text, o) {
  var opt = o || {};
  var plate = kbLibShapeLayer(c.comp, opt.name || ("card · " + text));
  var radius = Math.min(kbTok(c.style, "shape.radius.card") * c.unit, box[3] / 2);
  kbLibShape(plate, { name: "plate", rect: [box[2], box[3]], center: [0, 0], radius: radius, fill: kbHex(kbTok(c.style, "color.surface")) });
  kbProp(plate, ["ADBE Transform Group", "ADBE Position"]).setValue([box[0], box[1]]);
  var label = (opt.prefix ? opt.prefix + "   " : "") + text;
  var t = kbBlockText(c, opt.role || "h2", label, [box[0], box[1]], { color: "onSurface", name: (opt.name || "card") + " · text", maxWidth: box[2] * 0.86 });
  // Текст по центру плашки: kbText ставит якорь в центр рамки текста.
  t.parent = plate;
  // Прозрачность ребёнку не передаётся: карточка входит и гаснет прозрачностью — текст повторяет плашку.
  kbProp(t, ["ADBE Transform Group", "ADBE Opacity"]).expression = "parent ? value * parent.transform.opacity / 100 : value";
  return { plate: plate, text: t };
}

/**
 * Галочка: два отрезка, прорисовка по @draw.
 * @param {any} c
 * @param {number[]} at центр
 * @param {number} size
 * @param {string} role
 * @param {number} start
 * @returns {ShapeLayer}
 */
function kbBlockCheck(c, at, size, role, start) {
  var layer = kbLibShapeLayer(c.comp, "check");
  var h = size / 2;
  var s = kbLibShape(layer, {
    name: "check", vertices: [[at[0] - h, at[1]], [at[0] - h * 0.3, at[1] + h * 0.65], [at[0] + h, at[1] - h * 0.7]],
    stroke: kbHex(kbTok(c.style, "color." + role)), width: kbTok(c.style, "shape.stroke.accent") * c.unit, cap: "round", trim: true
  });
  kbKeysCurve(s.trim, start, kbMsToTime(270 * c.tempo, c.fps), 0, 100, kbTok(c.style, "motion.ease.draw"));
  return layer;
}

/**
 * Пример с *целевым словом*: текст без звёздочек и само слово.
 * @param {string} s
 * @returns {{text: string, word: string|null}}
 */
function kbBlockTarget(s) {
  var m = /\*([^*]+)\*/.exec(String(s));
  return { text: String(s).replace(/\*/g, ""), word: m ? m[1] : null };
}

// ---------- блоки ----------

/** @param {any} c @param {any} d */
function kbBlockTitle(c, d) {
  var lay = c.layout;
  var label = kbBlockText(c, "label", kbBlockLabel(c, d.label), kbBlockAt(c, lay.label));
  kbBlockRun(c, "text.rise", label, { start: kbBlockBeat(c, "label") }, "label");
  var title = kbBlockText(c, "h1", d.title, kbBlockAt(c, lay.title), { maxWidth: c.W });
  var tr = kbBlockRun(c, kbTok(c.style, "motion.text"), title, { start: kbBlockBeat(c, "title") }, "title");
  var last = tr;
  if (d.subtitle) {
    var sub = kbBlockText(c, "body", d.subtitle, kbBlockAt(c, lay.subtitle), { color: "muted", maxWidth: c.W });
    last = kbBlockRun(c, "text.rise", sub, { start: kbBlockBeat(c, "subtitle") }, "subtitle");
  }
  c.end = Math.max(c.end, last.end + kbBlockBeat(c, "hold"));
}

/** @param {any} c @param {any} d */
function kbBlockWord(c, d) {
  var lay = c.layout;
  var st = c.style;
  var label = kbBlockText(c, "label", kbBlockLabel(c, d.label), kbBlockAt(c, lay.label));
  kbBlockRun(c, "text.rise", label, { start: 0 });
  if (d.image) {
    var img = kbImage(st, c.comp, d.image, { box: kbBlockAt(c, lay.image), focus: d.focus, start: kbBlockBeat(c, "image"), hold: 8 });
    c.end = Math.max(c.end, img.end);
    c.beats.push({ beat: "image", t: img.start });
  }
  var word = kbBlockText(c, "hero", d.word, kbBlockAt(c, lay.word), { maxWidth: c.W });
  var wr = kbBlockRun(c, kbTok(st, "motion.word"), word, { start: kbBlockBeat(c, "word") }, "word");
  kbBlockRun(c, kbTok(st, "motion.emphasis") === "draw.marker" ? "draw.marker" : "draw.underline", word, { start: Math.max(kbBlockBeat(c, "underline"), wr.end - 0.1) });
  var newWordHold = kbTextHold(st, d.word, { newWord: true }) / 1000;
  var last = wr.end + newWordHold;
  if (d.ipa) {
    var ipa = kbBlockText(c, "body", d.ipa, kbBlockAt(c, lay.ipa), { color: "accentText", font: "ipa", tracking: 0 });
    kbBlockRun(c, kbTok(st, "motion.text"), ipa, { start: kbBlockBeat(c, "ipa") }, "ipa");
  }
  if (d.tr) {
    var trText = typeof d.tr === "string" ? d.tr : [d.tr.kk, d.tr.ru].join(" · ").replace(/^ · | · $/g, "");
    var tr = kbBlockText(c, "translation", trText, kbBlockAt(c, lay.tr), { maxWidth: c.W });
    var trr = kbBlockRun(c, "text.rise", tr, { start: kbBlockBeat(c, "tr") }, "tr");
    last = Math.max(last, trr.end + kbTextHold(st, trText, { l1: true }) / 1000);
  }
  if (d.example) {
    var ex = kbBlockTarget(d.example);
    var exl = kbBlockText(c, "body", ex.text, kbBlockAt(c, lay.example), { scale: 0.85, maxWidth: c.W });
    var er = kbBlockRun(c, kbTok(st, "motion.text"), exl, { start: kbBlockBeat(c, "example") }, "example");
    if (ex.word) kbBlockRun(c, "text.highlightWord", exl, { start: Math.max(kbBlockBeat(c, "highlight"), er.end), params: { word: ex.word } }, "highlight");
    last = Math.max(last, er.end + kbTextHold(st, ex.text) / 1000);
  }
  c.end = Math.max(c.end, last);
}

/** @param {any} c @param {any} d */
function kbBlockImageCallout(c, d) {
  var lay = c.layout;
  var st = c.style;
  var label = kbBlockText(c, "label", kbBlockLabel(c, d.label), kbBlockAt(c, lay.label));
  kbBlockRun(c, "text.rise", label, { start: 0 });
  var box = kbBlockAt(c, lay.image);
  var labels = d.labels || [];
  var span = kbBlockBeat(c, "first") + labels.length * kbBlockBeat(c, "step") + 3;
  var img = kbImage(st, c.comp, d.image, { box: box, focus: d.focus, start: kbBlockBeat(c, "image"), hold: span });
  c.beats.push({ beat: "image", t: img.start });
  var last = img.end;
  for (var i = 0; i < labels.length; i++) {
    var lb = labels[i];
    var pt = [box[0] - box[2] / 2 + lb.at[0] * box[2], box[1] - box[3] / 2 + lb.at[1] * box[3]];
    var dir = lb.at[0] < 0.5 ? -1 : 1;
    var to = [Math.max(c.L + c.W * 0.2, Math.min(c.L + c.W * 0.8, pt[0] + dir * c.W * 0.24)), pt[1] - c.H * 0.08];
    var start = kbBlockBeat(c, "first") + i * kbBlockBeat(c, "step");
    var r = kbBlockRun(c, "callout", null, { from: pt, to: to, start: start, name: "callout " + (i + 1), params: { text: lb.text } }, "label " + (i + 1));
    last = Math.max(last, r.end + kbTextHold(st, lb.text) / 1000);
  }
  if (d.title) {
    var title = kbBlockText(c, "h2", d.title, kbBlockAt(c, lay.title), { maxWidth: c.W });
    var tr = kbBlockRun(c, kbTok(st, "motion.text"), title, { start: kbBlockBeat(c, "title") }, "title");
    last = Math.max(last, tr.end + kbTextHold(st, d.title) / 1000);
  }
  c.end = Math.max(c.end, last);
}

/** @param {any} c @param {any} d */
function kbBlockQuiz(c, d) {
  var lay = c.layout;
  var st = c.style;
  var label = kbBlockText(c, "label", kbBlockLabel(c, d.label), kbBlockAt(c, lay.label), { color: "accentText" });
  kbBlockRun(c, "enter.pop", label, { start: kbBlockBeat(c, "label") }, "label");
  var q = kbBlockText(c, "h2", d.q, kbBlockAt(c, lay.q), { maxWidth: c.W });
  var qr = kbBlockRun(c, kbTok(st, "motion.text"), q, { start: kbBlockBeat(c, "q") }, "q");

  var opts = d.options || [];
  var o0 = kbBlockAt(c, lay.options);
  var vertical = c.fmt !== "16x9";
  var cards = [];
  var okIndex = -1;
  var t0 = Math.max(kbBlockBeat(c, "options"), qr.end - 0.2);
  var stagger = kbMs(st, kbTok(st, "motion.stagger.card")) / 1000;
  for (var i = 0; i < opts.length; i++) {
    var offset = (i - (opts.length - 1) / 2) * lay.gap;
    var cx = vertical ? o0[0] : c.L + (lay.options[0] + offset) * c.W;
    var cy = vertical ? c.T + (lay.options[1] + i * lay.gap) * c.H : o0[1];
    var card = kbBlockCard(c, [cx, cy, o0[2], o0[3]], opts[i].t, { name: "option " + "ABCD".charAt(i), prefix: "ABCD".charAt(i) });
    cards.push(card);
    if (opts[i].ok) okIndex = i;
    kbBlockRun(c, "enter.rise", card.plate, { start: t0 + i * stagger }, i === 0 ? "options" : undefined);
  }

  // Таймер: дорожка и заполнение, линейно (время — единственное, что идёт линейно).
  var think = c.item.think[c.audience] || c.item.think.teens;
  var tStart = t0 + (opts.length - 1) * stagger + kbMsToTime(kbMs(st, "text"), c.fps);
  var ta = kbBlockAt(c, lay.timer);
  var tw = lay.timer[2] * c.W;
  var timer = kbLibShapeLayer(c.comp, "timer");
  var bar = kbTok(st, "shape.stroke.accent") * c.unit * 1.4;
  // Заливка создаётся первой: новая группа ложится под прежние, так дорожка окажется под заливкой.
  kbLibShape(timer, { name: "fill", vertices: [[ta[0] - tw / 2, ta[1]], [ta[0] + tw / 2, ta[1]]], stroke: kbHex(kbTok(st, "color.accent")), width: bar, cap: "round", trim: true });
  kbLibShape(timer, { name: "track", vertices: [[ta[0] - tw / 2, ta[1]], [ta[0] + tw / 2, ta[1]]], stroke: kbHex(kbTok(st, "color.line")), width: bar, cap: "round" });
  // Trim — заново: добавление группы «track» сделало прежние ссылки на свойства слоя недействительными.
  kbKeysCurve(kbProp(timer, ["ADBE Root Vectors Group", "fill", "ADBE Vectors Group", "ADBE Vector Filter - Trim", "ADBE Vector Trim End"]), tStart, think, 100, 0, "linear");
  kbBlockRun(c, "enter.scaleIn", timer, { start: tStart - 0.25 });
  c.beats.push({ beat: "think", t: Math.round(tStart * 1000) / 1000 });

  // Раскрытие.
  var rv = tStart + think + kbBlockBeat(c, "reveal");
  c.beats.push({ beat: "reveal", t: Math.round(rv * 1000) / 1000 });
  for (var w = 0; w < cards.length; w++) {
    if (w === okIndex) continue;
    var plate = cards[w].plate;
    kbKeysCurve(kbProp(plate, ["ADBE Transform Group", "ADBE Opacity"]), rv, kbMsToTime(250, c.fps), 100, 40, kbTok(st, "motion.ease.exit"));
    var sc = kbProp(plate, ["ADBE Transform Group", "ADBE Scale"]);
    kbKeysCurve(sc, rv, kbMsToTime(250, c.fps), sc.valueAtTime(rv, false), kbLibValue({ factor: 95 }, sc.valueAtTime(rv, false), "scale", 1), kbTok(st, "motion.ease.exit"));
  }
  var good = cards[okIndex];
  // Свойство берём заново: ссылки на свойства привязаны к номеру слоя, а слои после карточки добавлялись (Object is invalid).
  var goodFill = kbProp(good.plate, ["ADBE Root Vectors Group", "plate", "ADBE Vectors Group", "ADBE Vector Graphic - Fill", "ADBE Vector Fill Color"]);
  kbKeysCurve(goodFill, rv, kbMsToTime(kbMs(st, "micro"), c.fps), goodFill.valueAtTime(rv, false), kbLibColor4(st, "correct"), "cubicInOut");
  kbBlockTextColor(c, good.text, "light", rv);
  kbBlockRun(c, "emphasis.pop", good.plate, { start: rv }, "correct");
  var gb = kbLibBox(good.plate, rv + 1);
  var checkSize = (gb.bottom - gb.top) * 0.42;
  // Родитель назначается по значениям в текущем времени композиции: ставим его на момент покоя карточки,
  // иначе вход (карточка ещё на 48 px ниже) сдвинет галочку.
  var check = kbBlockCheck(c, [gb.right - checkSize * 0.8, (gb.top + gb.bottom) / 2], checkSize * 0.8, "light", rv + 0.15);
  c.comp.time = rv;
  check.parent = good.plate;
  c.comp.time = 0;
  kbKeysCurve(kbProp(timer, ["ADBE Transform Group", "ADBE Opacity"]), rv, kbMsToTime(kbMs(st, "exit"), c.fps), 100, 0, kbTok(st, "motion.ease.exit"));
  var last = rv + kbBlockBeat(c, "hold");
  if (d.explain) {
    var ex = kbBlockText(c, "body", d.explain, kbBlockAt(c, lay.explain), { scale: 0.85, maxWidth: c.W });
    var er = kbBlockRun(c, "text.rise", ex, { start: rv + kbBlockBeat(c, "explain") }, "explain");
    last = Math.max(last, er.end + kbTextHold(st, d.explain) / 1000);
  }
  c.end = Math.max(c.end, last);
}

/**
 * Цвет роли с альфой 1 — для свойства Fill Color shape.
 * @param {any} style
 * @param {string} role
 * @returns {number[]}
 */
function kbLibColor4(style, role) {
  var c = kbHex(kbTok(style, "color." + role));
  return [c[0], c[1], c[2], 1];
}

/** @param {any} c @param {any} d */
function kbBlockRecap(c, d) {
  var lay = c.layout;
  var st = c.style;
  var label = kbBlockText(c, "label", kbBlockLabel(c, d.label), kbBlockAt(c, lay.label));
  kbBlockRun(c, "text.rise", label, { start: kbBlockBeat(c, "label") }, "label");
  if (d.title) {
    var title = kbBlockText(c, "h1", d.title, kbBlockAt(c, lay.title), { maxWidth: c.W });
    kbBlockRun(c, kbTok(st, "motion.text"), title, { start: kbBlockBeat(c, "title") }, "title");
  }
  var words = d.words || [];
  var cols = Math.min(lay.cols, words.length);
  var rows = Math.ceil(words.length / cols);
  var g = kbBlockAt(c, lay.grid);
  var gap = 24 * c.unit;
  var cw = (g[2] - gap * (cols - 1)) / cols;
  var ch = Math.min((g[3] - gap * (rows - 1)) / rows, cw * 0.62);
  var gh = rows * ch + (rows - 1) * gap;
  var stagger = kbMs(st, kbTok(st, "motion.stagger.card")) / 1000;
  var t0 = kbBlockBeat(c, "cards");
  var cards = [];
  for (var i = 0; i < words.length; i++) {
    var wd = typeof words[i] === "string" ? words[i] : words[i].t;
    var col = i % cols;
    var row = Math.floor(i / cols);
    var inRow = Math.min(cols, words.length - row * cols);
    var x = g[0] + (col - (inRow - 1) / 2) * (cw + gap);
    var y = g[1] - gh / 2 + ch / 2 + row * (ch + gap);
    var card = kbBlockCard(c, [x, y, cw, ch], wd, { name: "recap " + (i + 1) });
    cards.push(card);
    kbBlockRun(c, "enter.pop", card.plate, { start: t0 + i * stagger }, i === 0 ? "cards" : undefined);
  }
  var say = t0 + (words.length - 1) * stagger + kbMsToTime(kbMs(st, "icon"), c.fps) + 0.3;
  for (var s = 0; s < cards.length; s++) {
    kbBlockRun(c, "emphasis.pop", cards[s].plate, { start: say + s * kbBlockBeat(c, "say") }, "say " + (s + 1));
  }
  c.end = Math.max(c.end, say + (cards.length - 1) * kbBlockBeat(c, "say") + kbBlockBeat(c, "hold"));
}

/**
 * Данные блока проверяются до сборки: ошибка не оставляет полусобранной композиции.
 * @param {string} type
 * @param {any} d
 */
function kbBlockCheckData(type, d) {
  var need = { title: ["title"], word: ["word"], "image-callout": ["image", "labels"], "quiz-pick": ["q", "options"], recap: ["words"] }[type] || [];
  for (var i = 0; i < need.length; i++) if (d[need[i]] === undefined || d[need[i]] === "") throw new Error(type + ": нет поля «" + need[i] + "»");
  if (type === "quiz-pick") {
    if (!(d.options instanceof Array) || d.options.length < 2 || d.options.length > 4) throw new Error("quiz-pick: 2–4 варианта в options");
    var ok = 0;
    for (var k = 0; k < d.options.length; k++) if (d.options[k].ok) ok++;
    if (ok !== 1) throw new Error("quiz-pick: ровно один вариант с ok: true (сейчас " + ok + ")");
  }
  if (type === "recap" && !(d.words instanceof Array && d.words.length)) throw new Error("recap: words — непустой список");
  if (type === "image-callout" && !(d.labels instanceof Array)) throw new Error("image-callout: labels — список {at: [u, v], text}");
}

/** Сборщики по типу блока. */
var KB_BLOCKS = { title: kbBlockTitle, word: kbBlockWord, "image-callout": kbBlockImageCallout, "quiz-pick": kbBlockQuiz, recap: kbBlockRecap };

/**
 * Собрать блок урока своей композицией.
 * @param {any} style итоговый стиль или id
 * @param {string|any} type тип блока или объект из blocks.json
 * @param {any} data содержимое блока
 * @param {{format?: string, index?: number, audience?: string, fps?: number, name?: string}=} opts
 * @returns {{comp: CompItem, type: string, duration: number, beats: any[]}}
 */
function kbBlock(style, type, data, opts) {
  var st = typeof style === "string" ? kbStyle(style) : style;
  var item = typeof type === "string" ? kbLibItem(type) : type;
  if (typeof type === "string") item.id = type;
  var build = KB_BLOCKS[item.id];
  if (!build) throw new Error("Блок «" + item.id + "» не собирается: title, word, image-callout, quiz-pick, recap");
  kbBlockCheckData(item.id, data || {});
  var c = kbBlockCtx(st, item, opts || {});
  kbBackground(st, c.comp, undefined, { start: 0 });
  build(c, data || {});
  var dur = Math.ceil((c.end + 0.2) * c.fps) / c.fps;
  c.comp.duration = dur;
  for (var i = 1; i <= c.comp.numLayers; i++) c.comp.layer(i).outPoint = dur;
  return { comp: c.comp, type: item.id, duration: dur, beats: c.beats };
}

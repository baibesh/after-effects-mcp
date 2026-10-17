// Субтитры под голос (поток 4): помощники tlCap…/tlHead… и пресеты №21 caption-words, №22 headline-sub. Спека: stream4/spec.md §3–5.
// Подключать ПОСЛЕ tl-ease, tl-move, tl-accent, tl-hand, tl-type, tl-voice, tl-mark: сам файл подключает только кит (повторный include tl-*.jsx
// обнулил бы TL_MOVES). Всё из tl-*.jsx берётся по имени в момент вызова. Файл только добавляет два имени в TL_MOVES и функции tlCap…/tlHead…/tlc….
// ES3, свойства только по matchName (через kbProp/kbGroup). Кадры от меток считаются через tlcKf: Math.round(x·1e6)/1e6, затем ceil/floor/round (spec §4).

//@include "../core.jsx"
//@include "../text.jsx"
//@include "../show-e.jsx"

// ---------------------------------------------------------------------------------------------------------------------
// Мелочи: кадры, обратная кривая, цвета, журнал
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Кадры без плавающего «хвоста»: (0.4 + 1.30) * 30 = 51.00000000000001, и ceil дал бы 52 вместо 51 (spec §4, M1).
 * @param {number} x кадры
 * @returns {number}
 */
function tlcKf(x) {
  return Math.round(x * 1e6) / 1e6;
}

/**
 * Секунды → кадры (через tlcKf).
 * @param {number} sec
 * @returns {number}
 */
function tlcFr(sec) {
  return tlcKf(sec * 30);
}

/**
 * Доля времени u, при которой кривая ease (tlBz) даёт значение v. Бисекция по монотонной tlBz.
 * @param {number} v 0…1
 * @param {string} ease
 * @returns {number}
 */
function tlcInv(v, ease) {
  var lo = 0;
  var hi = 1;
  for (var i = 0; i < 50; i++) {
    var m = (lo + hi) / 2;
    if (tlBz(m, ease) < v) lo = m; else hi = m;
  }
  return (lo + hi) / 2;
}

/** Кадр входа слова (от старта s), на котором непрозрачность = 50 %: отрезок 1 → 2,6 к. `snap` от 40 до 100 %. */
function tlcK50In() {
  return 1 + 1.6 * tlcInv(1 / 6, "snap");
}

/** Кадр прорисовки подчёркивания (9 к. `punch`), на котором 50 % длины. */
function tlcK50Mark() {
  return 9 * tlcInv(0.5, "punch");
}

/** Кадр мазка перекраски (5 к. `snap`), на котором 50 % ширины. */
function tlcK50Rec() {
  return 5 * tlcInv(0.5, "snap");
}

/**
 * Палитра текущего стиля с запасными значениями кита.
 * @returns {{ink: number[], en: number[], soft: number[]}}
 */
function tlcPal() {
  var pal = (TL_S && TL_S.palette) || {};
  return { ink: pal.ink || KB_COLOR.ink, en: pal.en || KB_COLOR.blue, soft: pal.soft || KB_COLOR.inkSoft };
}

/**
 * Пауза [start, end] из массива или объекта {start, end}.
 * @param {any} p
 * @returns {{start: number, end: number}}
 */
function tlcPause(p) {
  if (p.length !== undefined) return { start: p[0], end: p[1] };
  return { start: p.start, end: p.end };
}

/**
 * Число в строку журнала: целое без хвоста, дробное с двумя знаками.
 * @param {number} x
 * @returns {string}
 */
function tlcN(x) {
  var r = Math.round(x * 100) / 100;
  return String(r);
}

/**
 * Свойство трансформа.
 * @param {any} layer
 * @param {string} prop matchName
 * @returns {any}
 */
function tlcT(layer, prop) {
  return kbProp(layer, ["ADBE Transform Group", prop]);
}

// ---------------------------------------------------------------------------------------------------------------------
// §4.8 Стиль до первого слоя
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Стили hand и lesson — дальше; brisk, magazine → исключение до первого слоя и ключа (spec §5.4).
 * @param {string} name имя пресета для сообщения
 */
function tlCapGuardStyle(name) {
  var st = TL_S.name;
  if (st !== "hand" && st !== "lesson") throw new Error("«" + name + "»: стиль " + st + " не поддержан");
}

// ---------------------------------------------------------------------------------------------------------------------
// §4.1 Блоки
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Блоки субтитров по паузам и счёту (spec §4.1). Новый блок начинается со слова w, если есть пауза p: p.end − p.start ≥ 0,40,
 * p.start > onsets[w−1], p.end ≤ onsets[w] + 0,02. Блок набрал `words` слов без паузы → кандидат «блок + слово» режется на наибольшем
 * промежутке между соседними onset (WARN caption-words split).
 * @param {string[]} words
 * @param {number[]} onsets секунды
 * @param {any[]} pauses [[start, end], …] или [{start, end}, …]
 * @param {{words?: number, name?: string}=} o words — макс. слов в блоке (6)
 * @returns {{from: number, to: number, words: string[]}[]} from/to — номера слов включительно
 */
function tlCapBlocks(words, onsets, pauses, o) {
  o = o || {};
  var maxw = o.words || 6;
  var name = o.name || "caption";
  if (words.length !== onsets.length) throw new Error("tlCapBlocks: слов " + words.length + ", меток " + onsets.length);
  var bl = [[0]];
  var w;
  var i;
  for (w = 1; w < words.length; w++) {
    var cut = false;
    for (i = 0; pauses && i < pauses.length; i++) {
      var p = tlcPause(pauses[i]);
      if (p.end - p.start >= 0.40 - 1e-9 && p.start > onsets[w - 1] && p.end <= onsets[w] + 0.02 + 1e-9) cut = true;
    }
    var cur = bl[bl.length - 1];
    if (cut) {
      bl.push([w]);
    } else if (cur.length >= maxw) {
      var cand = cur.concat([w]);
      var k = 1;
      var best = -1;
      for (i = 1; i < cand.length; i++) {
        var gap = onsets[cand[i]] - onsets[cand[i - 1]];
        if (gap > best + 1e-12) { best = gap; k = i; }
      }
      kbLog("WARN caption-words split «" + words[cand[k]] + "» gap " + Math.round(best * 1000) + " ms");
      bl[bl.length - 1] = cand.slice(0, k);
      bl.push(cand.slice(k));
    } else {
      cur.push(w);
    }
  }
  var out = [];
  for (i = 0; i < bl.length; i++) {
    var ws = [];
    for (var j = 0; j < bl[i].length; j++) ws.push(words[bl[i][j]]);
    out.push({ from: bl[i][0], to: bl[i][bl[i].length - 1], words: ws });
    kbLog("CAPBLOCK " + name + " b" + i + " [" + bl[i][0] + "," + bl[i][bl[i].length - 1] + "] «" + ws.join(" ") + "»");
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// §4.2 Кегль и строки
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Ширины слов при 100 px (кэш по тексту).
 * @param {CompItem} comp
 * @param {string[]} words
 * @param {string} font
 * @returns {number[]}
 */
function tlcWidths100(comp, words, font) {
  var cache = {};
  var out = [];
  for (var i = 0; i < words.length; i++) {
    var key = "k" + words[i];
    if (cache[key] === undefined) cache[key] = kbTextMeasure(comp, { text: words[i], font: font, size: 100 }).width;
    out.push(cache[key]);
  }
  return out;
}

/**
 * Разрыв на две строки по минимуму ширины более длинной (при равенстве — первая строка длиннее).
 * @param {number[]} w ширины слов при 100 px
 * @returns {number} сколько слов в первой строке
 */
function tlcSplit2(w) {
  var n = w.length;
  var best = -1;
  var bestMax = 0;
  for (var k = 1; k < n; k++) {
    var a = 0;
    var b = 0;
    var i;
    for (i = 0; i < k; i++) a += w[i];
    a += 26 * (k - 1);
    for (i = k; i < n; i++) b += w[i];
    b += 26 * (n - k - 1);
    var m = Math.max(a, b);
    if (best < 0 || m < bestMax - 1e-9 || (Math.abs(m - bestMax) <= 1e-9 && k > best)) { best = k; bestMax = m; }
  }
  return best;
}

/**
 * Кандидаты разрыва на две строки: [{k, max}] по возрастанию ширины более длинной строки (при равенстве — первая строка длиннее).
 * Нужны журналу CAPFIT: запас между первым и вторым кандидатом (21b: 2+3 против 3+2 — 11,76 px из 1151 при 100 px, ≈ 1 %), чтобы смена шрифта или
 * текста не перевернула раскладку молча.
 * @param {number[]} w ширины слов при 100 px
 * @returns {{k: number, max: number}[]}
 */
function tlcSplitCands(w) {
  var n = w.length;
  var out = [];
  for (var k = 1; k < n; k++) {
    var a = 0;
    var b = 0;
    var i;
    for (i = 0; i < k; i++) a += w[i];
    a += 26 * (k - 1);
    for (i = k; i < n; i++) b += w[i];
    b += 26 * (n - k - 1);
    out.push({ k: k, max: Math.max(a, b) });
  }
  out.sort(function (p, q) { return Math.abs(p.max - q.max) <= 1e-9 ? q.k - p.k : p.max - q.max; });
  return out;
}

/**
 * Один кегль на всю реплику (spec §4.2). Строки блока: слов ≤ 3 — одна; иначе две. Записывает blocks[b].lines = [{from, to, w100}] (номера слов
 * реплики включительно), их читает tlCapLayout. size < minSize → исключение.
 * @param {CompItem} comp
 * @param {any[]} blocks результат tlCapBlocks
 * @param {{font: string, maxW?: number, maxSize?: number, minSize?: number, name?: string}} o
 * @returns {{size: number, lines: any[][], W100: number}}
 */
function tlCapFit(comp, blocks, o) {
  tlCapGuardStyle("caption-words");
  var maxW = o.maxW || 840;
  var minSize = o.minSize || 64;
  var maxSize = o.maxSize || 110;
  var name = o.name || "caption";
  var all = [];
  var b;
  var i;
  for (b = 0; b < blocks.length; b++) for (i = 0; i < blocks[b].words.length; i++) all.push(blocks[b].words[i]);
  var w100 = tlcWidths100(comp, all, o.font);
  var forced = [];
  for (b = 0; b < blocks.length; b++) forced.push(false);
  var size = 0;
  var widest = 0;
  var candTxt = [];
  for (;;) {
    widest = 0;
    candTxt = [];
    var oneLine = [];
    for (b = 0; b < blocks.length; b++) {
      var bk = blocks[b];
      var ws = w100.slice(bk.from, bk.to + 1);
      var cnt = ws.length;
      var lines = [];
      var split = (cnt > 3 || forced[b]) && cnt > 1 ? tlcSplit2(ws) : cnt;
      var parts = split < cnt ? [[0, split - 1], [split, cnt - 1]] : [[0, cnt - 1]];
      for (i = 0; i < parts.length; i++) {
        var lw = 0;
        for (var j = parts[i][0]; j <= parts[i][1]; j++) lw += ws[j];
        lw += 26 * (parts[i][1] - parts[i][0]);
        lines.push({ from: bk.from + parts[i][0], to: bk.from + parts[i][1], w100: lw });
        if (lw > widest) widest = lw;
      }
      bk.lines = lines;
      if (lines.length === 2 && cnt > 3) {
        var cd = tlcSplitCands(ws);
        var cs = "";
        for (var ci = 0; ci < cd.length && ci < 2; ci++) cs += (ci ? "|" : "") + cd[ci].k + "+" + (cnt - cd[ci].k) + "=" + tlcN(cd[ci].max);
        candTxt[b] = cs + (cd.length > 1 ? " margin " + tlcN(cd[1].max - cd[0].max) : "");
      }
      oneLine.push(lines.length === 1 && cnt > 1);
    }
    size = Math.min(maxSize, Math.floor(100 * maxW / widest));
    if (size >= minSize) break;
    // не влезает при 64: блок из ≥ 2 слов в одну строку → две строки и пересчёт
    var pick = -1;
    var pw = 0;
    for (b = 0; b < blocks.length; b++) {
      if (oneLine[b] && blocks[b].lines[0].w100 > pw) { pw = blocks[b].lines[0].w100; pick = b; }
    }
    if (pick < 0) throw new Error("caption-words: кегль " + size + " < 64 — разбейте реплику или уменьшите words");
    forced[pick] = true;
  }
  var txt = [];
  var res = [];
  for (b = 0; b < blocks.length; b++) {
    var lt = [];
    for (i = 0; i < blocks[b].lines.length; i++) {
      var ln = blocks[b].lines[i];
      lt.push("«" + all.slice(ln.from, ln.to + 1).join(" ") + "»");
    }
    txt.push("b" + b + ": " + lt.join("|"));
    res.push(blocks[b].lines);
  }
  var ct = [];
  for (b = 0; b < blocks.length; b++) if (candTxt[b]) ct.push("b" + b + ": " + candTxt[b]);
  kbLog("CAPFIT " + name + " size " + size + " lines " + txt.join("; ") + " W100 " + tlcN(widest) + (ct.length ? " cand " + ct.join("; ") : ""));
  return { size: size, lines: res, W100: widest };
}

// ---------------------------------------------------------------------------------------------------------------------
// §4.3 Раскладка
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Безопасная зона: исключение, если коробка выходит за x 120…960, y 250…1500 (spec §4.3). Низ = max(подчёркивание, выносные Д/Қ/Щ/Ц/«,»),
 * верх = capTop − breve при Й.
 * @param {{left: number, right: number, base: number, S: number, cap: number, text: string}} b
 * @param {{top: number, bottom: number, left: number, right: number}} safe
 * @param {{desc: number, breve: number}} ink
 */
function tlcSafeCheck(b, safe, ink) {
  var under = b.base + 0.08 * b.S + 0.21 * b.cap + 4;
  var bottom = under;
  if (/[ДҚЩЦдқщц,]/.test(b.text)) bottom = Math.max(bottom, b.base + ink.desc * b.S);
  var top = b.base - b.cap;
  if (/[Йй]/.test(b.text)) top -= ink.breve * b.S;
  if (b.left < safe.left - 1e-6) throw new Error("caption-words: выход из безопасной зоны (left " + Math.round(b.left) + ")");
  if (b.right > safe.right + 1e-6) throw new Error("caption-words: выход из безопасной зоны (right " + Math.round(b.right) + ")");
  if (top < safe.top - 1e-6) throw new Error("caption-words: выход из безопасной зоны (top " + Math.round(top) + ")");
  if (bottom > safe.bottom + 1e-6) throw new Error("caption-words: выход из безопасной зоны (bottom " + Math.round(bottom) + ")");
}

/**
 * Пустышка: якорь [0, 0], позиция, имя.
 * @param {CompItem} comp
 * @param {string} name
 * @param {number} x
 * @param {number} y
 * @returns {any}
 */
function tlcNull(comp, name, x, y) {
  var n = comp.layers.addNull();
  n.name = name;
  tlcT(n, "ADBE Anchor Point").setValue([0, 0]);
  tlcT(n, "ADBE Position").setValue([x, y]);
  return n;
}

/**
 * Имена слоёв ячейки уникальны (spec §4.3): среди новых и уже стоящих в композиции.
 * @param {CompItem} comp
 * @param {string[]} names
 */
function tlcUniqueNames(comp, names) {
  var seen = {};
  var i;
  for (i = 1; i <= comp.numLayers; i++) seen["k" + comp.layer(i).name] = true;
  for (i = 0; i < names.length; i++) {
    if (seen["k" + names[i]]) throw new Error("caption-words: имя слоя " + names[i] + " не уникально");
    seen["k" + names[i]] = true;
  }
}

/**
 * Слой слова: якорь [центр рамки, 0] на базовой линии (как kbWordRow).
 * @param {CompItem} comp
 * @param {string} text
 * @param {string} font
 * @param {number} size
 * @param {number[]} color
 * @param {string} name
 * @returns {TextLayer}
 */
function tlcWordLayer(comp, text, font, size, color, name) {
  var l = kbText(comp, { text: text, font: font, size: size, color: /** @type {any} */ (color), x: 0, y: 0 });
  l.name = name;
  var rc = l.sourceRectAtTime(0, false);
  tlcT(l, "ADBE Anchor Point").setValue([rc.left + rc.width / 2, 0]);
  return l;
}

/**
 * Раскладка блоков слов (spec §4.3): каждое слово — свой слой `<name>-w<i>-<слово>`, дети пустышки блока `<name>-b<k>` (центр чернил, якорь [0, 0]),
 * пустышки блоков — дети корня `<name>`. Родитель ставится сеттером до аниматоров и штрихов; локальная позиция пересчитывается явно.
 * Исключение до первого слоя: выход из безопасной зоны, неуникальное имя.
 * @param {CompItem} comp
 * @param {{name: string, words: string[], blocks: any[], size: number, font: string, colors?: number[][], base: number, x?: number, leading?: number,
 *   safe?: {top: number, bottom: number, left: number, right: number}, desc?: number, breve?: number}} o
 * @returns {{root: any, blocks: any[], boxes: any[], words: any[], size: number, name: string}}
 */
function tlCapLayout(comp, o) {
  tlCapGuardStyle("caption-words");
  var S = o.size;
  var x = o.x === undefined ? 540 : o.x;
  var lead = o.leading || 1.15;
  var safe = o.safe || { top: 250, bottom: 1500, left: 120, right: 960 };
  var ink = { desc: o.desc === undefined ? 0.17 : o.desc, breve: o.breve === undefined ? 0.22 : o.breve };
  var capK = (TL_S.text && TL_S.text.cap) || 0.72;
  var cap = capK * S;
  var space = 0.26 * S;
  var pal = tlcPal();
  var n = o.words.length;
  var i;
  var j;
  var b;
  var W = [];
  var cache = {};
  for (i = 0; i < n; i++) {
    var ck = "k" + o.words[i];
    if (cache[ck] === undefined) cache[ck] = kbTextMeasure(comp, { text: o.words[i], font: o.font, size: S }).width;
    W.push(cache[ck]);
  }
  // геометрия до слоёв
  var boxes = [];
  var bgeo = [];
  var lineH = Math.round(lead * S);
  for (b = 0; b < o.blocks.length; b++) {
    var bk = o.blocks[b];
    var lines = bk.lines;
    if (!lines) {
      lines = [{ from: bk.from, to: bk.to }];
    }
    var nl = lines.length;
    var glines = [];
    var topCap = 1e9;
    var botBase = -1e9;
    for (var l = 0; l < nl; l++) {
      var ln = lines[l];
      var lw = 0;
      for (j = ln.from; j <= ln.to; j++) lw += W[j];
      lw += space * (ln.to - ln.from);
      var base = o.base - lineH * (nl - 1 - l);
      var cur = x - lw / 2;
      var txt = "";
      for (j = ln.from; j <= ln.to; j++) {
        boxes[j] = { inkL: cur, inkR: cur + W[j], base: base, capTop: base - cap, line: l, block: b, width: W[j] };
        cur += W[j] + space;
        txt += (txt === "" ? "" : " ") + o.words[j];
      }
      tlcSafeCheck({ left: x - lw / 2, right: x + lw / 2, base: base, S: S, cap: cap, text: txt }, safe, ink);
      glines.push({ from: ln.from, to: ln.to, text: txt, width: lw, base: base, left: x - lw / 2 });
      if (base - cap < topCap) topCap = base - cap;
      if (base > botBase) botBase = base;
    }
    bgeo.push({ lines: glines, cy: (topCap + botBase) / 2 });
  }
  var names = [];
  var cnames = [];
  for (i = 0; i < n; i++) names.push(o.name + "-w" + i + "-" + o.words[i]);
  tlcUniqueNames(comp, names);
  // слои
  var root = tlcNull(comp, o.name, 0, 0);
  var words = [];
  var outBlocks = [];
  for (b = 0; b < o.blocks.length; b++) {
    var bn = tlcNull(comp, o.name + "-b" + b, x, bgeo[b].cy);
    bn.parent = root;
    tlcT(bn, "ADBE Position").setValue([x, bgeo[b].cy]);
    var bwords = [];
    var blines = [];
    for (var l2 = 0; l2 < bgeo[b].lines.length; l2++) {
      var g = bgeo[b].lines[l2];
      var idx = [];
      for (j = g.from; j <= g.to; j++) {
        var color = (o.colors && o.colors[j]) || pal.ink;
        var wl = tlcWordLayer(comp, o.words[j], o.font, S, color, names[j]);
        wl.parent = bn;
        tlcT(wl, "ADBE Position").setValue([boxes[j].inkL + W[j] / 2 - x, boxes[j].base - bgeo[b].cy]);
        words[j] = wl;
        bwords.push(wl);
        idx.push(j);
        kbLog("LAYOUT " + wl.name + " size " + S + " base " + tlcN(boxes[j].base) + " left " + Math.round(boxes[j].inkL) + " right " + Math.round(boxes[j].inkR) +
          " capTop " + Math.round(boxes[j].capTop));
      }
      blines.push(idx);
      kbLog("CAPLAYOUT " + o.name + " b" + b + " line" + l2 + " «" + g.text + "» base " + tlcN(g.base) + " left " + tlcN(g.left) + " right " + tlcN(g.left + g.width) +
        " capTop " + tlcN(g.base - cap) + " width " + tlcN(g.width));
    }
    outBlocks.push({ nul: bn, "null": bn, words: bwords, lines: blines, from: o.blocks[b].from, to: o.blocks[b].to });
  }
  return { root: root, blocks: outBlocks, boxes: boxes, words: words, size: S, name: o.name };
}

// ---------------------------------------------------------------------------------------------------------------------
// §4.4 Вход слова
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Ключи единицы voice-in для слова целиком (без S.strength).
 * @param {any} layer
 * @param {number} s секунды
 */
function tlcWordInKeys(layer, s) {
  var em = tlFontSize(layer);
  var a = 1;
  var T = 5;
  var full = a + 0.4 * (T - a);
  var span = 0.28 * em;
  var st = [s];
  tlAnimator(layer, { name: "capin-pos", basedOn: 3, grouping: 2, align: [0, 0], prop: "ADBE Text Position 3D", fullValue: [0, span, 0], rest: 0, span: span,
    starts: st, keys: [[0, 0.24 * em], [a, 0.28 * em, "soft"], [T, 0, "snap"]] });
  tlAnimator(layer, { name: "capin-scale", basedOn: 3, grouping: 2, align: [0, 0], prop: "ADBE Text Scale 3D", fullValue: [91, 91, 100], rest: 100, span: -9,
    starts: st, keys: [[0, 92], [a, 91, "soft"], [T, 100, "snap"]] });
  tlAnimator(layer, { name: "capin-op", basedOn: 3, grouping: 2, align: [0, 0], prop: "ADBE Text Opacity", fullValue: 0, rest: 100, span: -100,
    starts: st, keys: [[0, 0], [a, 40, "soft"], [full, 100, "snap"], [T, 100]] });
}

/**
 * Дубль перекраски слова (`<имя> recolor`) или null.
 * @param {any} layer
 * @returns {any}
 */
function tlcDupOf(layer) {
  try { return layer.containingComp.layer(layer.name + " recolor"); } catch (e) { return null; }
}

/**
 * Вход слова целиком: единица voice-in (5 к.), единица — слово, старт s (секунды, дробный). Те же ключи ставятся на дубль перекраски.
 * Строить после штрихов и масок (Q3: аниматор сдвигает sourceRectAtTime).
 * @param {any} layer
 * @param {number} s
 * @returns {{F50: number}}
 */
function tlCapWordIn(layer, s) {
  tlcWordInKeys(layer, s);
  var dup = tlcDupOf(layer);
  if (dup) tlcWordInKeys(dup, s);
  var sf = tlcFr(s);
  var F50 = Math.ceil(tlcKf(sf + tlcK50In()));
  kbLog("CAPIN " + layer.name + " s " + s.toFixed(4) + " (f" + tlcN(sf) + ") F50 " + F50 + (dup ? " dup" : ""));
  return { F50: F50 };
}

// ---------------------------------------------------------------------------------------------------------------------
// §4.5 Подчёркивание без звука
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Подчёркивание: прямой вызов паспорта marker-swipe {thin} мимо раннера — маркер sfx не ставится (spec §4.5).
 * Вызывать до tlCapWordIn.
 * @param {any} word
 * @param {{start: number, out?: number, seed?: number, color?: number[]}} o секунды
 * @returns {any} слой подчёркивания
 */
function tlCapStroke(word, o) {
  var def = TL_MOVES["marker-swipe"];
  var p = {};
  var key;
  for (key in def.params) p[key] = def.params[key];
  p.thin = true;
  p.start = o.start;
  if (o.out !== undefined) p.out = o.out;
  if (o.seed !== undefined) p.seed = o.seed;
  if (o.color) p.color = o.color;
  var plan = def.plan(word, p, TL_S);
  def.run(word, p, TL_S, plan);
  kbLog("CAPSTROKE " + word.name + " start f" + tlcN(plan.start * 30) + " out " + (o.out === undefined ? "-" : "f" + tlcN(o.out * 30)) + " sfx off");
  var band = null;
  try { band = word.containingComp.layer(word.name + " underline"); } catch (e) { band = null; }
  return band;
}

// ---------------------------------------------------------------------------------------------------------------------
// §4.6 Карточки (words: 1)
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Карточки «по одному слову»: слово с запасом меньше minWord кадров до следующего склеивается с ним; последнее — с предыдущим, если до off меньше minWord.
 * Один кегль на все карточки (tlFit по самой широкой, maxSize 140, minSize 64); слой `<name>-c<i>-<текст>`, видна с F = ceil(o − 2).
 * @param {CompItem} comp
 * @param {{name: string, words: string[], onsets: number[], off: number, size?: number, font: string, colors?: number[][], base: number, x?: number, minWord?: number}} o
 * @returns {{layer: any, text: string, o: number, F: number, last: number, first: number, size: number}[]}
 */
function tlCapCards(comp, o) {
  tlCapGuardStyle("caption-words");
  var minWord = o.minWord || 6;
  var x = o.x === undefined ? 540 : o.x;
  var n = o.words.length;
  if (n !== o.onsets.length) throw new Error("tlCapCards: слов " + n + ", меток " + o.onsets.length);
  var offF = tlcFr(o.off);
  var groups = [];
  var i = 0;
  while (i < n) {
    var g = [i];
    var k = i + 1;
    while (k < n && tlcFr(o.onsets[k]) - tlcFr(o.onsets[i]) < minWord - 1e-9) { g.push(k); k++; }
    groups.push(g);
    i = k;
  }
  while (groups.length > 1 && offF - tlcFr(o.onsets[groups[groups.length - 1][0]]) < minWord - 1e-9) {
    var lastG = groups.pop();
    groups[groups.length - 1] = groups[groups.length - 1].concat(lastG);
  }
  var texts = [];
  var gi;
  for (gi = 0; gi < groups.length; gi++) {
    var parts = [];
    for (var j = 0; j < groups[gi].length; j++) parts.push(o.words[groups[gi][j]]);
    texts.push(parts.join(" "));
    if (parts.length > 1) kbLog("INFO caption-words join «" + texts[gi] + "»");
  }
  var minSize = 64;
  var size = tlFit(comp, texts, o.font, 840, o.size || 140);
  if (size < minSize) throw new Error("caption-words: кегль " + size + " < 64 — разбейте реплику или уменьшите words");
  var capK = (TL_S.text && TL_S.text.cap) || 0.72;
  var pal = tlcPal();
  var names = [];
  for (gi = 0; gi < texts.length; gi++) names.push(o.name + "-c" + gi + "-" + texts[gi]);
  var wmax = 0;
  for (gi = 0; gi < texts.length; gi++) {
    var wd = kbTextMeasure(comp, { text: texts[gi], font: o.font, size: size }).width;
    if (wd > wmax) wmax = wd;
    tlcSafeCheck({ left: x - wd / 2, right: x + wd / 2, base: o.base, S: size, cap: capK * size, text: texts[gi] }, { top: 250, bottom: 1500, left: 120, right: 960 }, { desc: 0.17, breve: 0.22 });
  }
  tlcUniqueNames(comp, names);
  var cards = [];
  for (gi = 0; gi < texts.length; gi++) {
    var first = groups[gi][0];
    var color = (o.colors && o.colors[first]) || pal.ink;
    var layer = tlcWordLayer(comp, texts[gi], o.font, size, color, names[gi]);
    tlcT(layer, "ADBE Position").setValue([x, o.base]);
    var oF = tlcFr(o.onsets[first]);
    var F = Math.ceil(tlcKf(oF - 2));
    cards.push({ layer: layer, text: texts[gi], o: oF, F: F, last: 0, first: first, size: size });
  }
  for (gi = 0; gi < cards.length; gi++) {
    var Fn = gi + 1 < cards.length ? cards[gi + 1].F : null;
    cards[gi].last = Fn === null ? -1 : Fn - 1; // последняя в ряду получает last при сборке пресета (until − 1)
    cards[gi].layer.inPoint = cards[gi].F / 30;
    kbLog("CARD " + o.name + " c" + gi + " «" + cards[gi].text + "» o f" + tlcN(cards[gi].o) + " F f" + cards[gi].F + " last f" + (Fn === null ? "-" : cards[gi].last));
  }
  return cards;
}

// ---------------------------------------------------------------------------------------------------------------------
// §4.7 Заголовок с подписью
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Заголовок (строки через \r, кегль tlFit) и подпись вдвое мельче (Bold, soft) под ним; оба — дети пустышки пары `<name>-pair`.
 * base — базовая линия ПЕРВОЙ строки заголовка (как у tlTextAt). Подпись: s = max(subMin, round(ratio·S)), базовая = база последней строки заголовка +
 * round(0,30·S + 0,72·s) — зазор капителей 0,30·S.
 * @param {CompItem} comp
 * @param {{name: string, head: {lines: string[], ranges?: any[]}, sub: {text: string}, font: string, subFont: string, ratio?: number, subMin?: number, x?: number,
 *   base: number, maxW?: number, maxSize?: number, colors?: {head?: number[], sub?: number[]}}} o
 * @returns {{head: any, sub: any, pair: any, S: number, s: number, subBase: number, gap: number}}
 */
function tlHeadLayout(comp, o) {
  tlCapGuardStyle("headline-sub");
  var x = o.x === undefined ? 540 : o.x;
  var ratio = o.ratio || 0.5;
  var subMin = o.subMin || 56;
  var pal = tlcPal();
  var capK = (TL_S.text && TL_S.text.cap) || 0.72;
  var S = tlFit(comp, o.head.lines, o.font, o.maxW || 840, o.maxSize || 150);
  var s = Math.round(ratio * S);
  if (s < subMin) {
    s = subMin;
    kbLog("WARN headline-sub: подпись поднята до 56 px");
  }
  var lead = Math.round(1.05 * S);
  var nl = o.head.lines.length;
  var lastBase = o.base + lead * (nl - 1);
  var subBase = lastBase + Math.round(0.30 * S + capK * s);
  var gap = subBase - capK * s - lastBase;
  var headText = o.head.lines.join("\r");
  // безопасная зона по замеру
  var wmax = 0;
  var i;
  for (i = 0; i < nl; i++) {
    var wl = kbTextMeasure(comp, { text: o.head.lines[i], font: o.font, size: S }).width;
    if (wl > wmax) wmax = wl;
  }
  var ws = kbTextMeasure(comp, { text: o.sub.text, font: o.subFont, size: s }).width;
  var safe = { top: 250, bottom: 1500, left: 120, right: 960 };
  var ink = { desc: 0.17, breve: 0.22 };
  tlcSafeCheck({ left: x - wmax / 2, right: x + wmax / 2, base: o.base, S: S, cap: capK * S, text: o.head.lines[0] }, safe, ink);
  tlcSafeCheck({ left: x - ws / 2, right: x + ws / 2, base: subBase, S: s, cap: capK * s, text: o.sub.text }, safe, ink);
  var head = tlTextAt(comp, { text: headText, font: o.font, size: S, color: /** @type {any} */ ((o.colors && o.colors.head) || pal.ink), x: x, baseline: o.base,
    leading: lead, ranges: o.head.ranges, name: o.name + "-head" });
  var sub = tlTextAt(comp, { text: o.sub.text, font: o.subFont, size: s, color: /** @type {any} */ ((o.colors && o.colors.sub) || pal.soft), x: x, baseline: subBase,
    name: o.name + "-sub" });
  var cy = (o.base - capK * S + subBase) / 2;
  var pair = tlcNull(comp, o.name + "-pair", x, cy);
  var kids = [head, sub];
  for (i = 0; i < kids.length; i++) {
    var pp = tlcT(kids[i], "ADBE Position");
    var pv = pp.value;
    kids[i].parent = pair;
    pp.setValue([pv[0] - x, pv[1] - cy]);
  }
  kbLog("HEADLAYOUT S " + S + " s " + s + " base " + o.base + " subBase " + subBase + " gap " + tlcN(gap));
  return { head: head, sub: sub, pair: pair, "null": pair, S: S, s: s, subBase: subBase, gap: gap }; // ae-ok: types
}

// ---------------------------------------------------------------------------------------------------------------------
// №21 caption-words
// ---------------------------------------------------------------------------------------------------------------------

/** Знаки препинания по краям слова-слоя (решение владельца 15.10: знак всегда перекрашивается вместе со своим словом). */
var TLC_PUNCT = ".,!?;:\u2026\"'\u00AB\u00BB\u201C\u201D\u2018\u2019()[]-\u2013\u2014\u00BF\u00A1";

/**
 * Делит строку слова на буквы и знаки по краям: [a, b) — буквы (внутренние знаки — апостроф, дефис — остаются в буквах), [0, a) и [b, n) — знаки.
 * @param {string} text
 * @returns {{a: number, b: number, n: number}}
 */
function tlcPunctSplit(text) {
  var n = text.length;
  var a = 0;
  var b = n;
  while (a < n && TLC_PUNCT.indexOf(text.charAt(a)) >= 0) a++;
  while (b > a && TLC_PUNCT.indexOf(text.charAt(b - 1)) >= 0) b--;
  if (a >= b) return { a: 0, b: n, n: n }; // слово из одних знаков — целиком
  return { a: a, b: b, n: n };
}

/**
 * Правило пресета caption-words (все режимы): знаки по краям слова меняют цвет в тот же кадр, что и слово, а не позже мазка.
 * Режим recolor: мазок маски идёт по всему слову (знак внутри маски — маска без хвоста дала бы срез края последней буквы наискосок), а оригинал получает
 * hold-ключ Source Text знаков на первом кадре мазка (tFlip): знак синий с первого кадра мазка и не ждёт, пока мазок дойдёт до края слова.
 * Режимы marker и words:1 знаков не перекрашивают сами: подчёркивание и карточка охватывают слово целиком; lesson красит слово целиком ступенькой.
 * Вызывать после kbMove recolor-swipe (дубль слоя создаётся внутри него и не должен получить ключей).
 * @param {any} wl слой слова
 * @param {{a: number, b: number, n: number}} pr
 * @param {number[]} color
 * @param {number} tFlip секунды
 */
function tlcPunctFollow(wl, pr, color, tFlip) {
  if (pr.a > 0) tlRestyleRange(wl, tFlip, 0, pr.a, color);
  if (pr.b < pr.n) tlRestyleRange(wl, tFlip, pr.b, pr.n, color);
}

/**
 * Расписание caption-words в кадрах ячейки (spec §5.1): s = o − 3; A = round(o − 2) (marker) | round(o − 1) (recolor); прочитано R; выход блока
 * E = floor(s следующего блока − 2), X = E − вход выхода − шаг·(строк − 1). Проверки в plan: посадка до следующего onset, WARN fast / short.
 * @param {any} o опции пресета
 * @param {any} S стиль
 * @returns {any}
 */
function tlcCapSched(o, S) {
  var cap = o.cap;
  if (!cap || !cap.blocks || !cap.words) throw new Error("caption-words: нужен cap из tlCapLayout");
  var n = cap.words.length;
  if (!o.onsets || o.onsets.length !== n) throw new Error("caption-words: меток " + (o.onsets ? o.onsets.length : 0) + ", слов " + n);
  if (o.active !== "marker" && o.active !== "recolor") throw new Error("caption-words: active «" + o.active + "» — нужен marker или recolor");
  var lesson = S.name === "lesson";
  var recolor = o.active === "recolor";
  var accent = {};
  var i;
  for (i = 0; o.accent && i < o.accent.length; i++) accent["k" + o.accent[i]] = true;
  var oF = [];
  var sF = [];
  var A = [];
  var w;
  for (w = 0; w < n; w++) {
    oF.push(tlcFr(o.onsets[w]));
    sF.push(oF[w] - 3);
    A.push(Math.round(tlcKf(oF[w] - (recolor ? 1 : 2))));
  }
  for (w = 0; w + 1 < n; w++) {
    if (sF[w] + 5 > oF[w + 1] + 1e-6) throw new Error("caption-words: слово «" + cap.words[w].name + "» не успевает сесть до следующего onset");
  }
  var untilF = o.until !== undefined ? Math.round(tlcFr(o.until)) : Math.round(tlcFr((o.off || 0) + 0.5));
  var sinkFr = Math.max(3, Math.round(5 * S.dur));
  var step = Math.max(1, Math.round(2 * S.dur));
  var R = [];
  var outF = [];
  var blocks = [];
  var b;
  var Kmark = tlcK50Mark();
  var Krec = tlcK50Rec();
  var act50 = [];
  var F50 = [];
  var K50in = tlcK50In();
  // settle (решение владельца 15.10, 21a): после последнего слова блока вся готовая фраза плавно возвращается в тушь, до выхода блока.
  // По умолчанию включён у recolor с dim; marker и lesson — выключен, пока не включён явно (lesson — без анимации цвета).
  var settle = o.settle === undefined ? (recolor && !!o.dim) : !!o.settle;
  if (lesson) settle = false;
  var settleFr = Math.max(3, Math.round(6 * S.dur));
  for (b = 0; b < cap.blocks.length; b++) {
    var bk = cap.blocks[b];
    var E = b + 1 < cap.blocks.length ? Math.floor(tlcKf(sF[cap.blocks[b + 1].from] - 2)) : untilF;
    var nl = bk.lines.length;
    var X = E - sinkFr - step * (nl - 1);
    var lastW = bk.to;
    var holdFrom = sF[bk.from] + 5;
    var full = X - (sF[lastW] + 5);
    if (full < 6) kbLog("WARN caption-words block " + b + " short");
    for (w = bk.from; w <= bk.to; w++) {
      var isAcc = !!accent["k" + w];
      var nextIn = w < bk.to;
      var r = null;
      if (nextIn && o.dim && !isAcc) {
        if (lesson) r = sF[w + 1];
        else r = recolor ? Math.max(A[w + 1], A[w] + 6) : A[w + 1];
      }
      R[w] = r;
      outF[w] = nextIn ? A[w + 1] + 6 : E;
      F50[w] = Math.ceil(tlcKf(sF[w] + K50in));
      act50[w] = recolor ? A[w] + Krec : A[w] + Kmark;
      if (nextIn && !lesson && recolor === true && A[w + 1] - A[w] < 3) kbLog("WARN caption-words fast «" + cap.words[w].name + "»");
      if (nextIn && !lesson && !recolor && A[w + 1] - A[w] < 3) kbLog("WARN caption-words fast «" + cap.words[w].name + "»");
    }
    var sFrom = A[lastW] + (recolor ? 6 : 9);
    var sTo = Math.min(sFrom + settleFr, X - 2);
    var doSettle = settle && sTo - sFrom >= 3;
    if (settle && !doSettle) kbLog("WARN caption-words block " + b + " settle skipped");
    blocks.push({ E: E, X: X, lines: nl, holdFrom: holdFrom, full: full, settleFrom: doSettle ? sFrom : null, settleTo: doSettle ? sTo : null });
  }
  return { n: n, oF: oF, sF: sF, A: A, R: R, outF: outF, blocks: blocks, F50: F50, act50: act50, untilF: untilF, sinkFr: sinkFr, step: step, accent: accent, lesson: lesson, recolor: recolor };
}

/**
 * Сборка режима «блоки слов».
 * @param {any} o
 * @param {any} S
 * @param {any} sc расписание
 */
function tlcCapRunBlocks(o, S, sc) {
  var cap = o.cap;
  var pal = tlcPal();
  var en = S.palette && S.palette.en ? S.palette.en : pal.en;
  var soft = pal.soft;
  var n = sc.n;
  var w;
  var b;
  var dim = !!o.dim;
  if (sc.lesson) kbLog("SWAP caption-words active " + o.active + "→recolor(step) (lesson, в run)");
  // 1. активное слово
  for (w = 0; w < n; w++) {
    var wl = cap.words[w];
    var len = String(kbProp(wl, ["ADBE Text Properties", "ADBE Text Document"]).value.text).length;
    if (sc.accent["k" + w]) {
      var src = kbProp(wl, ["ADBE Text Properties", "ADBE Text Document"]);
      var doc = src.value;
      doc.fillColor = /** @type {any} */ (en);
      src.setValue(doc);
      if (o.active === "marker" && !sc.lesson) tlCapStroke(wl, { start: sc.A[w] / 30, out: sc.outF[w] / 30 });
      continue;
    }
    if (sc.lesson) {
      kbMove(wl, "recolor-swipe", { range: [0, len], color: en, mode: "step", at: sc.sF[w] / 30 });
    } else if (o.active === "recolor") {
      var pr = tlcPunctSplit(String(kbProp(wl, ["ADBE Text Properties", "ADBE Text Document"]).value.text));
      kbMove(wl, "recolor-swipe", { range: [0, len], color: en, start: sc.A[w] / 30 });
      tlcPunctFollow(wl, pr, en, (sc.A[w] + 1) / 30 - 0.02);
      if (pr.a > 0 || pr.b < pr.n) kbLog("CAPPUNCT " + wl.name + " letters [" + pr.a + "," + pr.b + ") of " + pr.n + " flip f" + tlcN(sc.A[w] + 1 - 0.6));
    } else {
      tlCapStroke(wl, { start: sc.A[w] / 30, out: sc.outF[w] / 30 });
    }
  }
  // 2. вход слов и дублей
  for (w = 0; w < n; w++) tlCapWordIn(cap.words[w], sc.sF[w] / 30);
  // 3. прочитано
  for (w = 0; w < n; w++) {
    if (sc.R[w] === null || !dim) continue;
    var wl2 = cap.words[w];
    var len2 = String(kbProp(wl2, ["ADBE Text Properties", "ADBE Text Document"]).value.text).length;
    tlRestyleRange(wl2, sc.R[w] / 30 - 0.02, 0, len2, soft);
  }
  // 3б. settle: вся фраза блока плавно в тушь (аниматор заливки по слову, поверх любого цвета слова)
  var ink = pal.ink.length === 3 ? [pal.ink[0], pal.ink[1], pal.ink[2], 1] : pal.ink;
  for (b = 0; b < cap.blocks.length; b++) {
    var bs0 = sc.blocks[b];
    if (bs0.settleFrom === null) continue;
    var bk0 = cap.blocks[b];
    var dF = bs0.settleTo - bs0.settleFrom;
    for (w = bk0.from; w <= bk0.to; w++) {
      tlAnimator(cap.words[w], { name: "settle-ink", basedOn: 3, prop: "ADBE Text Fill Color", fullValue: ink, rest: 0, span: 1,
        starts: [bs0.settleFrom / 30], keys: [[0, 0], [dF, 1, "soft"]] });
    }
    kbLog("SETTLE " + cap.name + " b" + b + " f" + bs0.settleFrom + "-f" + bs0.settleTo + " X f" + bs0.X + " words " + (bk0.to - bk0.from + 1));
  }
  // 4. hold-alive пустышек блоков и 5. выходы
  for (b = 0; b < cap.blocks.length; b++) {
    var bk = cap.blocks[b];
    var bs = sc.blocks[b];
    if (bs.X / 30 > bs.holdFrom / 30) kbMove(bk.nul, "hold-alive", { from: bs.holdFrom / 30, to: bs.X / 30, strength: 0.35 });
    var endMax = 0;
    for (var li = 0; li < bk.lines.length; li++) {
      for (var wi = 0; wi < bk.lines[li].length; wi++) {
        var wl3 = cap.words[bk.lines[li][wi]];
        var res = kbMove(wl3, "sink-out", { start: (bs.X + sc.step * li) / 30, unit: "word" });
        wl3.outPoint = res.end + 1 / 30;
        if (res.end > endMax) endMax = res.end;
      }
    }
    bk.nul.outPoint = endMax + 1 / 30;
    kbLog("CAPEXIT " + cap.name + " b" + b + " X f" + bs.X + " E f" + bs.E + " lines " + bs.lines + " full " + tlcN(bs.full));
  }
  // журнал по словам
  for (w = 0; w < n; w++) {
    var bx = cap.boxes[w];
    kbLog("CAPW " + cap.words[w].name + " w" + w + " «" + bx.word + "» b" + bx.block + " line" + bx.line + " o f" + tlcN(sc.oF[w]) + " s f" + tlcN(sc.sF[w]) +
      " F50 f" + sc.F50[w] + " A f" + (sc.lesson ? "-" : sc.A[w]) + " act50 f" + (sc.lesson ? "-" : tlcN(sc.act50[w])) + " read f" + (sc.R[w] === null ? "-" : tlcN(sc.R[w])) +
      " inkL " + tlcN(bx.inkL) + " inkR " + tlcN(bx.inkR) + " base " + tlcN(bx.base));
  }
}

/**
 * Сборка режима «по одному слову».
 * @param {any} o
 * @param {any} S
 */
function tlcCapRunCards(o, S) {
  var cards = o.cards;
  var untilF = o.until !== undefined ? Math.round(tlcFr(o.until)) : Math.round(tlcFr((o.off || 0) + 0.5));
  var gi;
  for (gi = 0; gi < cards.length; gi++) {
    var c = cards[gi];
    var em = tlFontSize(c.layer);
    var s0 = c.F / 30;
    tlAnimator(c.layer, { name: "cardin-pos", basedOn: 3, grouping: 2, align: [0, 0], prop: "ADBE Text Position 3D", fullValue: [0, 0.08 * em, 0], rest: 0, span: 0.08 * em,
      starts: [s0], keys: [[0, 0.08 * em], [4, 0, "snap"]] });
    tlAnimator(c.layer, { name: "cardin-scale", basedOn: 3, grouping: 2, align: [0, 0], prop: "ADBE Text Scale 3D", fullValue: [94, 94, 100], rest: 100, span: -6,
      starts: [s0], keys: [[0, 94], [4, 100, "snap"]] });
  }
  for (gi = 0; gi < cards.length; gi++) {
    var cc = cards[gi];
    if (gi + 1 < cards.length) {
      cc.layer.outPoint = cards[gi + 1].F / 30;
      cc.last = cards[gi + 1].F - 1;
      kbMove(cc.layer, "hold-alive", { from: (cc.F + 4) / 30, to: cards[gi + 1].F / 30, strength: 0.35 });
    } else {
      var res = kbMove(cc.layer, "sink-out", { at: untilF / 30, unit: "word" });
      cc.layer.outPoint = untilF / 30;
      cc.last = untilF - 1;
      if (res.start > (cc.F + 4) / 30) kbMove(cc.layer, "hold-alive", { from: (cc.F + 4) / 30, to: res.start, strength: 0.35 });
    }
    kbLog("CARD " + cc.layer.name + " F f" + cc.F + " last f" + cc.last + " out f" + tlcN(cc.layer.outPoint * 30));
  }
}

/** №21 caption-words — блок слов встаёт в такт речи, активное слово отмечено, прочитанные мягче; words: 1 — по одному слову (spec §5.1). */
TL_MOVES["caption-words"] = {
  group: "subtitle", slot: "in", units: ["word"], unit: "word",
  frames: { entry: 5, mark: 9, swipe: 5 }, stagger: {}, over: 0, lead: 3, sfx: null,
  params: { words: 6, active: "marker", dim: true, accent: [], minWord: 6, settle: undefined, strength: 1 },
  plan: function (layer, o, S) {
    tlCapGuardStyle("caption-words");
    if (o.words === 1 || o.cards) {
      if (!o.cards || !o.cards.length) throw new Error("caption-words: words: 1 — нужны cards из tlCapCards");
      if (o.active !== "marker" && o.active !== undefined) kbLog("INFO caption-words words:1 — active не нужен");
      var cards = o.cards;
      var untilC = o.until !== undefined ? Math.round(tlcFr(o.until)) : Math.round(tlcFr((o.off || 0) + 0.5));
      return { n: cards.length, unit: "word", starts: [], start: cards[0].F / 30, hit: (cards[cards.length - 1].F + 4) / 30, end: untilC / 30,
        total: untilC - cards[0].F, unitFr: 5, staggerFr: 0, mode: "cards" };
    }
    var sc = tlcCapSched(o, S);
    var last = sc.blocks[sc.blocks.length - 1];
    return { n: sc.n, unit: "word", starts: [], start: sc.sF[0] / 30, hit: (sc.sF[sc.n - 1] + 5) / 30, end: last.E / 30, total: last.E - sc.sF[0], unitFr: 5, staggerFr: 0,
      mode: "blocks", sched: sc };
  },
  run: function (layer, o, S, plan) {
    if (plan.mode === "cards") { tlcCapRunCards(o, S); return; }
    // имя слова для журнала
    var cap = o.cap;
    for (var i = 0; i < cap.words.length; i++) cap.boxes[i].word = String(kbProp(cap.words[i], ["ADBE Text Properties", "ADBE Text Document"]).value.text);
    tlcCapRunBlocks(o, S, plan.sched);
  }
};

// ---------------------------------------------------------------------------------------------------------------------
// №22 headline-sub
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Опции входа заголовка и план: voice-in читает метки голоса (tlVoiceSchedule), остальные — по start.
 * @param {any} head
 * @param {any} o
 * @returns {{opts: any, hit: number, start: number, firstLand: number}}
 */
function tlcHeadIn(head, o) {
  var inName = o.head_in || "voice-in";
  if (inName === "voice-in") {
    var text = String(kbProp(head, ["ADBE Text Properties", "ADBE Text Document"]).value.text);
    var words = tlWordsOf(text);
    var sch = tlVoiceSchedule(words, o.onsets, o.off, o.anchors);
    var n0 = words[0].length;
    return { opts: { onsets: o.onsets, off: o.off }, hit: sch.hit, start: sch.start, firstLand: sch.starts[n0 - 1] + sch.unitFr / 30 };
  }
  if (o.start === undefined) throw new Error("headline-sub: head_in «" + inName + "» — нужен start (секунды)");
  var hp = kbMovePlan(head, inName, { start: o.start });
  return { opts: { start: o.start }, hit: hp.hit, start: hp.start, firstLand: hp.hit };
}

/** №22 headline-sub — заголовок и подпись вдвое мельче, подпись приходит на 0,15–0,2 с позже (spec §5.2). */
TL_MOVES["headline-sub"] = {
  group: "subtitle", slot: "in", units: ["char", "word"], unit: "char",
  frames: { delay: 5 }, stagger: {}, over: 0, lead: 3, sfx: null,
  params: { delay: 5, head_in: "voice-in", strength: 1 },
  plan: function (layer, o, S) {
    tlCapGuardStyle("headline-sub");
    if (!o.sub) throw new Error("headline-sub: нужен sub (подпись из tlHeadLayout)");
    var hi = tlcHeadIn(layer, o);
    var delay = Math.round(o.delay * S.dur);
    var hitF = tlcFr(hi.hit);
    var subStart = Math.round(tlcKf(hitF + delay));
    var sp = kbMovePlan(o.sub, "rise", { unit: "word", stagger_ease: "linear", start: subStart / 30 });
    var untilF = o.until !== undefined ? Math.round(tlcFr(o.until)) : Math.round(tlcFr((o.off || 0) + 0.5));
    var dstep = Math.max(1, Math.round(2 * S.dur));
    var ep = kbMovePlan(layer, "sink-out", { at: untilF / 30, unit: "char" });
    var es = kbMovePlan(o.sub, "sink-out", { at: (untilF + dstep) / 30, unit: "word" });
    return { n: 1, unit: "char", starts: [], start: hi.start, hit: sp.hit, end: es.end, total: Math.round((es.end - hi.start) * 30), unitFr: 5, staggerFr: 0,
      head: hi, delay: delay, subStart: subStart, subHit: sp.hit, headExit: ep, subExit: es, untilF: untilF };
  },
  run: function (layer, o, S, plan) {
    var inName = o.head_in || "voice-in";
    kbMove(layer, inName, plan.head.opts);
    kbMove(o.sub, "rise", { unit: "word", stagger_ease: "linear", start: plan.subStart / 30 });
    var hold = null;
    if (o.pair && plan.headExit.start > plan.head.firstLand) {
      hold = kbMove(o.pair, "hold-alive", { from: plan.head.firstLand, to: plan.headExit.start, strength: 0.35 });
    }
    var dstep = Math.max(1, Math.round(2 * S.dur));
    var he = kbMove(layer, "sink-out", { at: plan.untilF / 30, unit: "char" });
    var se = kbMove(o.sub, "sink-out", { at: (plan.untilF + dstep) / 30, unit: "word" });
    layer.outPoint = he.end + 1 / 30;
    o.sub.outPoint = se.end + 1 / 30;
    if (o.pair) o.pair.outPoint = Math.max(he.end, se.end) + 1 / 30;
    var S0 = tlFontSize(layer);
    var s0 = tlFontSize(o.sub);
    var subText = String(kbProp(o.sub, ["ADBE Text Properties", "ADBE Text Document"]).value.text);
    var hitF = tlcFr(plan.head.hit);
    kbLog("HEADSUB head hit f" + tlcN(hitF) + " sub start f" + plan.subStart + " delay " + tlcN(plan.subStart - hitF) + " (" + ((plan.subStart - hitF) / 30).toFixed(3) + ") ratio " +
      (s0 / S0).toFixed(3) + " sub «" + subText + "» hit f" + tlcN(tlcFr(plan.subHit)) + (hold ? "" : " (без пары)"));
  }
};

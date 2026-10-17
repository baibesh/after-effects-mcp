// Поток 7: герой как данные и его реакции (spec stream7 §4–5). Ядро: актёр tlActor (дыхание, кипение, разрез по шее, изгиб, сквош, масштаб, позы по ролям),
// точка героя tlActorPoint и пустышка на ней tlAttach, смена позы tlActorPose, запись каналов tlActorDone и восемь пресетов:
// nod (+tilt), lean-to (+point), catch, throw, take (+cheer, +light), sparks, listen, wave.
// В файле НЕТ имени, позы и числа конкретного героя: всё про героя — паспорт TL_HEROES (kit/heroes/heroes.jsx). Подмена героя = другой паспорт в данных ячейки; нет позы под роль — fallback паспорта + WARN ROLE.
// ES3, свойства только по matchName. Подключает только файлы кита без состояния (повторный include lib/*.jsx обнулил бы TL_MOVES, spec §0);
// tl-ease/tl-move/tl-hand/tl-plate/tl-mark берутся по имени в момент вызова — подключать после них.
// Кадры: опции cause/start/contact/release/t0/t1/back/untilt — кадры ячейки (30 к/с), at — секунды (ударный слог). Герой на двойках: ключи на чётных кадрах,
// кроме окон единиц (вытяжка тэйка). Значение канала на кадре — сумма событий; ключи AE = значения JS точно (на этом стоят tlActorPoint и критерии §9).

//@include "../core.jsx"
//@include "../project.jsx"
//@include "../motion.jsx"
//@include "../look.jsx"
//@include "../footage.jsx"
//@include "../hero.jsx"

/**
 * Таблица реакций (данные без героя): шаги, число кадров ключей руки (стиль hand), амплитуды. Другие стили — правило §6: кадры ×S.dur до ближайшего чётного
 * (ничья — вверх), амплитуда ×S.strength, перелёт ×(S.overCap > 0 ? 1 : 0). Отступления (take, wave) записаны явно.
 * @type {any}
 */
var TL_ACT = {
  lead: 4, lag: 2,
  sw: { hand: [0.03, -0.012], brisk: [0.036, -0.014], lesson: [0.018, 0], magazine: [0.015, 0] }, // смена позы: dip, перелёт
  eWind: { x1: 0.33, x2: 0.1 },                                                                     // замах броска {out 33, into 90}
  nod: { a: 4.5, hit: 2,
    head: { f: [0, 2, 8, 14, 20, 26], v: [0, -0.2, 1, -0.42, 0.16, 0], e: ["soft", "soft", "snap", "soft", "soft", "soft"] },
    body: { f: [2, 10, 16, 28], v: [0, 0.3, -0.12, 0], e: ["soft", "soft", "soft", "soft"] } },
  tilt: { a: 4.5, hit: 2,
    head: { f: [0, 2, 12, 18], v: [0, -0.2, 1.08, 1], e: ["soft", "soft", "soft", "soft"] },
    body: { f: [2, 14, 20], v: [0, 0.3, 0.3], e: ["soft", "soft", "soft"] } },
  lean: { a: 4, hit: 2, f: [0, 2, 12, 18], v: [0, -0.2, 1.1, 1], e: ["soft", "soft", "soft", "soft"] },
  catchA: { bend: 3, sq: 0.04, rot: [[0, -12], [2, -4.2], [4, -7.4], [6, -5.3], [8, -6]] },
  throwA: { bend: -8, sq: 0.05, push: -0.03, follow: 6 },
  take: {
    hand: { f: [0, 4, 7, 10, 14, 20], up: 0.07, upCheer: 0.08, rest: [0.025, -0.008], win: [4, 7], peak: 7 },
    brisk: { f: [0, 2, 5, 8, 10, 14], up: 0.07, upCheer: 0.08, rest: [0.025, -0.008], win: [2, 5], peak: 5 },
    lesson: { f: [0, 6, 10, 26], up: 0.07, upCheer: 0.08, rest: null, win: [6, 10], peak: 10 },
    magazine: { f: [0, 6, 12, 32], up: 0.07, upCheer: 0.08, rest: null, win: [6, 12], peak: 12 } },
  light: {
    hand: { f: [0, 4, 8, 12], v: [0, 0.04, -0.02, 0] },
    brisk: { f: [0, 2, 6, 8], v: [0, 0.048, -0.024, 0] },
    lesson: { f: [0, 6, 10, 16], v: [0, 0.024, 0.006, 0] },
    magazine: { f: [0, 6, 12, 20], v: [0, 0.02, 0.005, 0] } },
  wave: { a: 4, period: { hand: 16, brisk: 16, lesson: 24, magazine: 32 }, cycles: 2, settle: true },
  listen: { scale: 0.02, tilt: 2 },
  sparks: { thick: 0.011, gap: 0.05, len: [0.075, 0.095, 0.075], ang: [-40, 0, 40], side: 0.006, hold: 16, fade: 6 },
  sfx: { nod: 0.4, lean: 0.5, catchA: 0.8, take: 0.6, cheer: 0.7, sparks: 0.4 }
};

/** Реестр актёров по ключу «комп:слой». @type {{[key: string]: any}} */
var TL_ACTORS = {};

// ---------------------------------------------------------------------------------------------------------------------
// Мелочи
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Секунды/кадры без накопления плавающей точки.
 * @param {number} x
 * @returns {number}
 */
function tlaKf(x) {
  return Math.round(x * 1e6) / 1e6;
}

/**
 * Ближайшее чётное (ничья — вверх).
 * @param {number} x
 * @returns {number}
 */
function tlaEvenN(x) {
  return 2 * Math.floor(x / 2 + 0.5 + 1e-9);
}

/**
 * @param {number} x
 * @returns {number}
 */
function tlaCeilEven(x) {
  return 2 * Math.ceil(tlaKf(x) / 2);
}

/**
 * @param {number} x
 * @returns {number}
 */
function tlaFloorEven(x) {
  return 2 * Math.floor(tlaKf(x) / 2);
}

/**
 * @param {number} x
 * @returns {number}
 */
function tlaSign(x) {
  return x < 0 ? -1 : 1;
}

/**
 * Кадры ×dur до ближайшего чётного, строго по возрастанию.
 * @param {number[]} f
 * @param {number} dur
 * @returns {number[]}
 */
function tlaScaleF(f, dur) {
  var out = [];
  for (var i = 0; i < f.length; i++) {
    var x = tlaEvenN(f[i] * dur);
    if (i > 0 && x <= out[i - 1]) x = out[i - 1] + 2;
    out.push(x);
  }
  return out;
}

/**
 * Ключ стиля таблицы: hand | brisk | lesson | magazine (иное — hand).
 * @returns {string}
 */
function tlaStyleKey() {
  var n = TL_S.name;
  return (n === "brisk" || n === "lesson" || n === "magazine") ? n : "hand";
}

/**
 * Параметры текущего стиля.
 * @returns {{key: string, dur: number, str: number, over: boolean}}
 */
function tlaS() {
  return { key: tlaStyleKey(), dur: TL_S.dur, str: TL_S.strength, over: TL_S.overCap > 0 };
}

/**
 * Копия числового массива с множителем.
 * @param {number[]} v
 * @param {number} k
 * @returns {number[]}
 */
function tlaMul(v, k) {
  var o = [];
  for (var i = 0; i < v.length; i++) o.push(v[i] * k);
  return o;
}

/**
 * Актёр слоя ячейки.
 * @param {Layer} layer
 * @returns {any}
 */
function tlActorOf(layer) {
  var a = TL_ACTORS[layer.containingComp.id + ":" + layer.id];
  if (!a) throw new Error("tlActor: слой «" + layer.name + "» не актёр (tlActor не создавал его)");
  return a;
}

/**
 * Роль → список поз героя (роль в паспорте — строка или массив).
 * Нет роли или её позы, а у паспорта есть fallback[role] (роль или поза) — запасной путь + WARN ROLE (один раз на актёра и роль), без падения.
 * У паспорта без fallback — исключение с именем поля (как раньше).
 * @param {any} A
 * @param {string} role
 * @returns {string[]}
 */
function tlaRolePoses(A, role) {
  var H = A.hero;
  var r = H.roles ? H.roles[role] : undefined;
  var list = (r === undefined || r === null) ? [] : ((r instanceof Array) ? r : [r]);
  var ok = [];
  for (var i = 0; i < list.length; i++) {
    if (H.poses[list[i]]) ok.push(list[i]);
    else if (!H.fallback) throw new Error("tlActor: роль " + role + " героя " + H.id + " указывает на позу «" + list[i] + "», которой нет в TL_HEROES." + H.id + ".poses");
  }
  if (ok.length) return ok;
  if (!H.fallback) throw new Error("tlActor: у героя " + H.id + " нет роли " + role + " — заполнить TL_HEROES." + H.id + ".roles");
  return [tlaFallbackPose(A, role)];
}

/**
 * Запасная поза роли по паспорту: fallback[role] → роль (её первая поза) или поза; цепочка до 4 шагов, в конце — роль idle.
 * @param {any} A
 * @param {string} role
 * @returns {string}
 */
function tlaFallbackPose(A, role) {
  var H = A.hero;
  var cur = role;
  var path = [role];
  var pose = null;
  for (var step = 0; step < 4 && pose === null; step++) {
    var fb = H.fallback[cur];
    if (fb === undefined || fb === null) break;
    path.push(fb);
    if (H.poses[fb]) { pose = fb; break; }
    var rr = H.roles ? H.roles[fb] : undefined;
    var rl = (rr === undefined || rr === null) ? [] : ((rr instanceof Array) ? rr : [rr]);
    for (var j = 0; j < rl.length && pose === null; j++) if (H.poses[rl[j]]) pose = rl[j];
    cur = fb;
  }
  if (pose === null) {
    var idle = H.roles ? H.roles.idle : null;
    pose = (idle instanceof Array) ? idle[0] : idle;
    path.push("idle");
    if (!pose || !H.poses[pose]) throw new Error("tlActor: у героя " + H.id + " нет роли " + role + " и запасной позы (fallback, idle) — заполнить TL_HEROES." + H.id + ".roles");
  }
  if (!A.warnRole) A.warnRole = {};
  if (!A.warnRole[role]) {
    kbLog("WARN ROLE " + H.id + " " + role + ": своей позы нет — запасной путь паспорта " + path.join(" → ") + " = " + pose);
    A.warnRole[role] = true;
  }
  return pose;
}

/**
 * Одна поза роли (первая из списка).
 * @param {any} A
 * @param {string} role
 * @returns {string}
 */
function tlaRolePose(A, role) {
  return tlaRolePoses(A, role)[0];
}

// ---------------------------------------------------------------------------------------------------------------------
// События и каналы
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Значение события на кадре: между ключами tlBz по кривой, пришедшей в правый ключ; до первого — первое, после последнего — последнее.
 * @param {any} ev {keys: [[кадр, значение, кривая]]}
 * @param {number} f
 * @returns {number}
 */
function tlaEval(ev, f) {
  var K = ev.keys;
  var n = K.length;
  if (f <= K[0][0]) return K[0][1];
  if (f >= K[n - 1][0]) return K[n - 1][1];
  for (var i = 1; i < n; i++) {
    if (f <= K[i][0]) {
      var a = K[i - 1];
      var b = K[i];
      var u = (f - a[0]) / (b[0] - a[0]);
      return a[1] + (b[1] - a[1]) * tlBz(u, b[2] || "soft");
    }
  }
  return K[n - 1][1];
}

/**
 * Кадр, на котором герой «видит» значения: в окне единиц — сам кадр, иначе пара 2k.
 * @param {any} A
 * @param {number} f
 * @returns {number}
 */
function tlaFq(A, f) {
  for (var i = 0; i < A.ones.length; i++) if (f >= A.ones[i][0] && f <= A.ones[i][1]) return f;
  return 2 * Math.floor(f / 2);
}

/**
 * Значение канала на кадре f (уже квантованном): сумма событий; scale — 1 + сумма.
 * @param {any} A
 * @param {string} ch
 * @param {number} f
 * @returns {number}
 */
function tlaChan(A, ch, f) {
  var list = A.ev[ch];
  var v = ch === "scale" ? 1 : 0;
  for (var i = 0; i < list.length; i++) v += tlaEval(list[i], f);
  return v;
}

/**
 * Зарегистрировать событие канала.
 * @param {any} A
 * @param {string} ch head | body | bend | sq | scale
 * @param {string} name
 * @param {any[][]} keys [кадр, значение, кривая]
 */
function tlaAdd(A, ch, name, keys) {
  if (A.done) throw new Error("tlActor: реакция «" + name + "» после tlActorDone");
  if (A.pointed) throw new Error("tlActor: реакция после запроса точки (" + name + ") — реакции с пустышкой регистрировать последними");
  for (var i = 1; i < keys.length; i++) if (keys[i][0] <= keys[i - 1][0]) throw new Error("tlActor: ключи «" + name + "» не по возрастанию (кадр " + keys[i][0] + ")");
  A.ev[ch].push({ name: name, keys: keys });
}

/**
 * Окно единиц (кадр за кадром).
 * @param {any} A
 * @param {number} a
 * @param {number} b
 */
function tlaOnes(A, a, b) {
  A.ones.push([a, b]);
}

/**
 * Поза героя на кадре по расписанию.
 * @param {any} A
 * @param {number} f
 * @returns {{f: number, role: string, pose: string}}
 */
function tlaPoseAt(A, f) {
  var cur = A.poses[0];
  for (var i = 0; i < A.poses.length; i++) if (A.poses[i].f <= f) cur = A.poses[i];
  return cur;
}

// ---------------------------------------------------------------------------------------------------------------------
// Якоря и геометрия (spec §4.4)
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Точка паспорта по имени: crown | head | neck | ground | palm | palmEnd | tip | hand | ear | hands:<i> | palms:<i>.
 * Нет в паспорте — исключение с именем героя, позы и поля.
 * @param {any} A
 * @param {string} name
 * @param {string} pose
 * @returns {{p: number[], head: boolean}}
 */
function tlaAnchor(A, name, pose) {
  var H = A.hero;
  var P = H.poses[pose];
  if (!P) throw new Error("tlActor: у героя " + H.id + " нет позы «" + pose + "»");
  var miss = function (field) {
    return new Error("tlActor: у героя " + H.id + " в позе «" + pose + "» нет якоря «" + field + "» — заполнить TL_HEROES." + H.id + ".poses[\"" + pose + "\"]." + field + " (measure-hero.py)");
  };
  var idx = -1;
  var key = name;
  var cp = name.indexOf(":");
  if (cp > 0) { key = name.substring(0, cp); idx = parseInt(name.substring(cp + 1), 10); }
  if (key === "crown") {
    if (!H.head || !H.head.crown) throw new Error("tlActor: у героя " + H.id + " нет head.crown — заполнить TL_HEROES." + H.id + ".head.crown");
    var cy = (P.top !== undefined && P.top !== null) ? P.top : H.head.crown[1];
    return { p: [H.head.crown[0], cy], head: true };
  }
  if (key === "head") {
    if (!H.head || !H.head.c) throw new Error("tlActor: у героя " + H.id + " нет head.c — заполнить TL_HEROES." + H.id + ".head.c");
    return { p: [H.head.c[0], H.head.c[1]], head: true };
  }
  if (key === "neck") {
    if (!H.neck) throw new Error("tlActor: у героя " + H.id + " нет neck — заполнить TL_HEROES." + H.id + ".neck");
    return { p: [H.neck.x, H.neck.y], head: false };
  }
  if (key === "ground") return { p: [H.axis, H.ground], head: false };
  var v = P[key];
  if (idx >= 0 && v) v = v[idx];
  if (!v) throw miss(key);
  var isHead = false;
  if (H.neck && P.split && H.neck.col && v[1] < H.neck.y && v[0] >= H.neck.col[0] && v[0] <= H.neck.col[1]) isHead = true;
  return { p: [v[0], v[1]], head: isHead };
}

/**
 * Поворот по часовой (как Rotation AE на экране с осью y вниз).
 * @param {number[]} v
 * @param {number} deg
 * @returns {number[]}
 */
function tlaRot(v, deg) {
  var a = deg * Math.PI / 180;
  var c = Math.cos(a);
  var s = Math.sin(a);
  return [v[0] * c - v[1] * s, v[0] * s + v[1] * c];
}

/**
 * CC Bend It (модель дуги): ось S→E, точка на высоте u уходит на дугу угла φ·u, поперечное смещение поворачивается вместе с ней.
 * θ — наклон хорды Start → макушка (на оси) от вертикали: хорда дуги до макушки наклонена на половину её угла, φ = 2θ/u_c (u_c — высота макушки вдоль оси); решение оркестратора 17.10 (Q3).
 * @param {any} A
 * @param {number[]} p точка листа
 * @param {number} theta градусы
 * @returns {number[]}
 */
function tlaBendPt(A, p, theta) {
  if (Math.abs(theta) < 1e-9) return [p[0], p[1]];
  var G = A.geo;
  var L = G.sy - G.ey;
  var phi = (theta * Math.PI / 180) * 2 / G.uc;
  var R = L / phi;
  var u = (G.sy - p[1]) / L;
  var psi = phi * u;
  var d = p[0] - G.sx;
  return [G.sx + R + (d - R) * Math.cos(psi), G.sy + (d - R) * Math.sin(psi)];
}

/**
 * Кубическая безье по четырём точкам.
 * @param {number[][]} q
 * @param {number} t
 * @returns {number[]}
 */
function tlaBez3(q, t) {
  var m = 1 - t;
  var a = m * m * m, b = 3 * m * m * t, c = 3 * m * t * t, d = t * t * t;
  return [a * q[0][0] + b * q[1][0] + c * q[2][0] + d * q[3][0], a * q[0][1] + b * q[1][1] + c * q[2][1] + d * q[3][1]];
}

/**
 * Вершины Bezier Warp «покой» и «pull» (таблица kbSquash) для листа w×h.
 * @param {number} w
 * @param {number} h
 * @returns {{rest: number[][], pull: number[][]}}
 */
function tlaWarpTable(w, h) {
  return {
    rest: [[0, 0], [w / 3, 0], [w * 2 / 3, 0], [w, 0], [w, h / 3], [w, h * 2 / 3], [w, h], [w * 2 / 3, h], [w / 3, h], [0, h], [0, h * 2 / 3], [0, h / 3]],
    pull: [[-w * 0.25, h], [-w * 0.08, h], [w * 0.08, h], [w * 0.25, h], [w * 0.4, h * 0.667], [w * 0.4, h * 0.333],
           [w * 0.25, 0], [w * 0.08, 0], [-w * 0.08, 0], [-w * 0.25, 0], [-w * 0.4, h * 0.333], [-w * 0.4, h * 0.667]]
  };
}

/**
 * Bezier Warp (патч Кунса по четырём кубическим краям из 12 вершин): точка листа → точка после искажения при слайдере a.
 * @param {any} A
 * @param {number[]} p
 * @param {number} a
 * @returns {number[]}
 */
function tlaWarpPt(A, p, a) {
  if (Math.abs(a) < 1e-12) return [p[0], p[1]];
  var sh = A.hero.sheet;
  var T = tlaWarpTable(sh.w, sh.h);
  var V = [];
  var i;
  for (i = 0; i < 12; i++) V.push([T.rest[i][0] + T.pull[i][0] * a, T.rest[i][1] + T.pull[i][1] * a]);
  var u = p[0] / sh.w;
  var v = p[1] / sh.h;
  var top = tlaBez3([V[0], V[1], V[2], V[3]], u);
  var bot = tlaBez3([V[9], V[8], V[7], V[6]], u);
  var lef = tlaBez3([V[0], V[11], V[10], V[9]], v);
  var rig = tlaBez3([V[3], V[4], V[5], V[6]], v);
  var out = [0, 0];
  for (i = 0; i < 2; i++) {
    out[i] = (1 - v) * top[i] + v * bot[i] + (1 - u) * lef[i] + u * rig[i] -
      ((1 - u) * (1 - v) * V[0][i] + u * (1 - v) * V[3][i] + (1 - u) * v * V[9][i] + u * v * V[6][i]);
  }
  return out;
}

/**
 * Точка героя на кадре f без побочных эффектов (все шесть шагов §4.4).
 * @param {any} A
 * @param {string} anchor
 * @param {number} f кадр ячейки
 * @param {{pose?: string, p?: number[], head?: boolean}=} opt pose — принудительно; p/head — произвольная точка листа вместо имени
 * @returns {{x: number, y: number, pose: string, k: number, head: number, body: number, theta: number, sq: number, S: number}}
 */
function tlaPointRaw(A, anchor, f, opt) {
  opt = opt || {};
  var H = A.hero;
  var fq = tlaFq(A, f);
  var pose = opt.pose || tlaPoseAt(A, f).pose;
  var an = opt.p ? { p: opt.p, head: !!opt.head } : tlaAnchor(A, anchor, pose);
  var G = A.geo;
  var p = [an.p[0], an.p[1]];
  var splitHere = !!(A.split[pose] && H.neck);
  var ah = tlaChan(A, "head", fq);
  var ab = tlaChan(A, "body", fq);
  if (an.head && splitHere) {
    var nrel = tlaRot([p[0] - H.neck.x, p[1] - H.neck.y], ah);
    p = [H.neck.x + nrel[0], H.neck.y + nrel[1]];
  }
  var tq = Math.floor(fq / 2 + 1e-6) / 15; // tq = floor(t·15)/15, t = fq/30
  var br = H.life && H.life.breath && !A.noBreath ? H.life.breath : null;
  var k = br ? br.amount * Math.sin(2 * Math.PI * (tq + A.phase) / br.period) : 0;
  var rel = [(p[0] - H.axis) * (1 - 0.45 * k), (p[1] - H.ground) * (1 + k)];
  rel = tlaRot(rel, ab);
  p = [H.axis + rel[0], H.ground + rel[1]];
  var sh = H.sheet;
  p = [p[0] + sh.dx, p[1] + sh.dy];
  var theta = tlaChan(A, "bend", fq);
  p = tlaBendPt(A, p, theta);
  var sq = tlaChan(A, "sq", fq);
  p = tlaWarpPt(A, p, sq);
  var S = tlaChan(A, "scale", fq);
  var q = [A.feet[0] + A.s * S * (p[0] - G.ax), A.feet[1] + A.s * S * (p[1] - G.ay)];
  return { x: q[0], y: q[1], pose: pose, k: k, head: ah, body: ab, theta: theta, sq: sq, S: S };
}

/**
 * Точка героя в кадре ячейки на момент t (секунды): ладонь, кончик пальца, макушка… с дыханием и всеми каналами реакций (spec §4.4).
 * Первый запрос закрывает регистрацию реакций (реакции с пустышкой — последними).
 * @param {any} actor
 * @param {string} anchor
 * @param {number} t
 * @returns {number[]}
 */
function tlActorPoint(actor, anchor, t) {
  actor.pointed = true;
  var f = Math.round(tlaKf(t * 30));
  var r = tlaPointRaw(actor, anchor, f);
  kbLog("ACTPT " + actor.name + " " + anchor + " f" + f + " (" + r.x.toFixed(2) + "," + r.y.toFixed(2) + ") pose " + r.pose + " k " + r.k.toFixed(4) + " head " + r.head.toFixed(3) +
    " body " + r.body.toFixed(3) + " θ " + r.theta.toFixed(3) + " sq " + r.sq.toFixed(4) + " S " + r.S.toFixed(4));
  return [r.x, r.y];
}

// ---------------------------------------------------------------------------------------------------------------------
// Актёр
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Герой в ячейке: композиции рисунка и фигуры, слой в ячейке, каналы. Слои поз строит tlActorDone.
 * @param {CompItem} comp ячейка
 * @param {{hero: any, feet: number[], h: number, pose?: string, name?: string, phase?: number, seed?: number, noBreath?: boolean, noBoil?: boolean,
 *   noWarp?: boolean, noBend?: boolean, alwaysFx?: boolean, bendK?: number, probes?: any[], blend?: boolean}} o
 *   pose — роль начальной позы (по умолчанию idle); noBreath/noBoil/noWarp/noBend/alwaysFx — для зондов (alwaysFx — эффекты даже без событий); bendK — подмена калибровки; probes — пробные точки зонда
 * @returns {any}
 */
function tlActor(comp, o) {
  var H = o.hero;
  if (!H || !H.id) throw new Error("tlActor: нужен паспорт героя (hero: TL_HEROES.<id>)");
  var req = ["sheet", "top", "ground", "axis", "bend"];
  for (var ri = 0; ri < req.length; ri++) {
    if (H[req[ri]] === null || H[req[ri]] === undefined) {
      throw new Error("tlActor: у героя " + H.id + " нет поля " + req[ri] + " — заполнить TL_HEROES." + H.id + "." + req[ri] + " (measure-hero.py --hero " + H.id + ")");
    }
  }
  var name = o.name || H.id;
  var Hpx = H.ground - H.top;
  var s = o.h / Hpx;
  var sh = H.sheet;
  var bendK = o.bendK !== undefined ? o.bendK : (H.calib ? H.calib.bendK : null);
  var A = {
    name: name, hero: H, comp: comp, feet: [o.feet[0], o.feet[1]], h: o.h, s: s, phase: o.phase === undefined ? 0 : o.phase, seed: o.seed === undefined ? 7 : o.seed,
    ev: { head: [], body: [], bend: [], sq: [], scale: [] }, ones: [], poses: [], split: {}, headOrder: {}, done: false, pointed: false,
    deferred: [], attaches: {}, takes: [], noBreath: !!o.noBreath, noBoil: !!o.noBoil, noWarp: !!o.noWarp, noBend: !!o.noBend, alwaysFx: !!o.alwaysFx, bendK: bendK, probes: o.probes || [],
    dur: comp.duration, layer: null, draw: null, fig: null, poseLayers: {}, sfxFrames: [],
    geo: { sx: sh.dx + H.axis, sy: sh.dy + H.bend.start, ey: sh.dy + H.bend.end, ax: sh.dx + H.axis, ay: sh.dy + H.ground, uc: 1 }
  };
  if (H.head && H.head.crown) A.geo.uc = (A.geo.sy - (sh.dy + H.head.crown[1])) / (A.geo.sy - A.geo.ey);
  var role0 = o.pose || "idle";
  var pose0 = ((H.roles && H.roles[role0] !== undefined) || (H.fallback && H.fallback[role0] !== undefined && !H.poses[role0])) ? tlaRolePose(A, role0) : role0;
  if (!H.poses[pose0]) throw new Error("tlActor: у героя " + H.id + " нет позы «" + pose0 + "»");
  A.poses.push({ f: 0, role: role0, pose: pose0 });

  // рисунок (лист + поле под подошвами sheet.pad — только для CC Bend It: эффект даёт рваный низ у своего Start, поэтому Start лежит на pad ниже подошв)
  var pad = sh.pad || 0;
  var draw = app.project.items.addComp(name + "-draw", sh.w, sh.h + pad, 1, comp.duration, KB_FRAME.fps);
  draw.bgColor = KB_COLOR.paper;
  draw.motionBlur = false;
  if (sh.fill === "white") draw.layers.addSolid([1, 1, 1], name + "-sheet", sh.w, sh.h + pad, 1, comp.duration);
  A.draw = draw;

  // фигура: изгиб (CC Bend It) на листе с полем pad
  var fig = app.project.items.addComp(name + "-fig", sh.w, sh.h + pad, 1, comp.duration, KB_FRAME.fps);
  fig.bgColor = KB_COLOR.paper;
  fig.motionBlur = false;
  var figure = fig.layers.add(draw);
  figure.name = "figure";
  figure.motionBlur = false;
  A.fig = fig;

  // обрезка до листа без поля: сквош (Bezier Warp) — на слое ячейки поверх этой композиции, низ листа на 19 px ниже подошв, подошвы стоят (§4.1)
  var sqc = app.project.items.addComp(name + "-sq", sh.w, sh.h, 1, comp.duration, KB_FRAME.fps);
  sqc.bgColor = KB_COLOR.paper;
  sqc.motionBlur = false;
  var bent = sqc.layers.add(fig);
  bent.name = "bent";
  bent.motionBlur = false;
  kbProp(bent, ["ADBE Transform Group", "ADBE Position"]).setValue([sh.w / 2, (sh.h + pad) / 2]); // верхний левый угол совпадает, поле pad обрезается
  A.sqc = sqc;

  // слой в ячейке
  var layer = comp.layers.add(sqc);
  layer.name = name + "-fig";
  layer.motionBlur = false;
  layer.blendingMode = H.blend === "multiply" ? BlendingMode.MULTIPLY : BlendingMode.NORMAL;
  layer.comment = "tl-actor " + H.id;
  kbProp(layer, ["ADBE Transform Group", "ADBE Anchor Point"]).setValue([A.geo.ax, A.geo.ay]);
  kbProp(layer, ["ADBE Transform Group", "ADBE Position"]).setValue([o.feet[0], o.feet[1]]);
  kbProp(layer, ["ADBE Transform Group", "ADBE Scale"]).setValue([100 * s, 100 * s]);
  A.layer = layer;
  TL_ACTORS[comp.id + ":" + layer.id] = A;

  kbLog("ACTOR " + name + " hero " + H.id + " render " + H.render + " sheet " + sh.w + "x" + sh.h + " feet (" + o.feet[0] + "," + o.feet[1] + ") h " + o.h +
    " s " + s.toFixed(5) + " pose " + role0 + "→" + pose0);
  return A;
}

/**
 * Смена позы по роли: hold-ключ на кадре f с антиципацией (dip сквоша) и оседанием; f чётный (кроме окна единиц тэйка).
 * @param {any} A
 * @param {string} role роль паспорта (или имя позы при o.pose)
 * @param {number} f кадр смены
 * @param {{quiet?: boolean, pose?: string}=} o quiet — без dip (смена внутри тэйка/ловли)
 * @returns {string} имя позы
 */
function tlActorPose(A, role, f, o) {
  o = o || {};
  if (A.done) throw new Error("tlActor: смена позы после tlActorDone");
  if (A.pointed) throw new Error("tlActor: реакция после запроса точки (смена позы)");
  var pose = o.pose || tlaRolePose(A, role);
  if (!A.hero.poses[pose]) throw new Error("tlActor: у героя " + A.hero.id + " нет позы «" + pose + "»");
  var inOnes = false;
  for (var i = 0; i < A.ones.length; i++) if (f >= A.ones[i][0] && f <= A.ones[i][1]) inOnes = true;
  if (f % 2 !== 0 && !inOnes) throw new Error("tlActorPose: кадр смены " + f + " нечётный вне окна единиц (двойки)");
  var cur = tlaPoseAt(A, f);
  if (cur.pose === pose) {
    kbLog("INFO POSE " + A.name + " " + role + "→" + pose + " f" + f + ": поза уже стоит");
    return pose;
  }
  var last = A.poses[A.poses.length - 1];
  if (f <= last.f) throw new Error("tlActorPose: смена на кадре " + f + " раньше или вместе с прошлой (" + last.f + ") — регистрировать по порядку");
  A.poses.push({ f: f, role: role, pose: pose });
  var dip = 0;
  if (!o.quiet) {
    var sw = TL_ACT.sw[tlaStyleKey()];
    dip = sw[0];
    var keys = [[f - 4, 0], [f, dip, "snap"]];
    if (sw[1] !== 0) {
      keys.push([f + 2, sw[1], "soft"]);
      keys.push([f + 8, 0, "soft"]);
    } else {
      keys.push([f + 8, 0, "soft"]);
    }
    tlaAdd(A, "sq", "pose-" + pose, keys);
  }
  kbLog("POSE " + A.name + " " + role + "→" + pose + " f" + f + " dip " + dip.toFixed(4));
  kbLog("ROLE " + role + "→" + pose);
  return pose;
}

/**
 * Пустышка, повторяющая точку героя на каждом кадре окна [from, to] (hold-ключи по правилу двоек); вне окна стоит на ближайшей границе.
 * Предмет — ребёнок пустышки с к. 0 (o.child). Ключи пишутся сразу: полёты предметов считают точки в её системе (spec-check M5).
 * @param {any} A
 * @param {{anchor: string, from?: number, to?: number, name?: string, child?: Layer}} o кадры ячейки
 * @returns {Layer}
 */
function tlAttach(A, o) {
  A.pointed = true;
  var from = o.from === undefined ? 0 : o.from;
  var lastF = Math.round(A.dur * 30) - 1;
  var to = o.to === undefined ? lastF : o.to;
  var nm = o.name || (A.name + "-at-" + o.anchor + "-" + (A.nAttach = (A.nAttach || 0) + 1));
  var p0 = tlaAttPt(A, o.anchor, from, null);
  var n = tlpNull(A.comp, nm, p0[0], p0[1]);
  n.comment = "tl-attach";
  var pos = kbProp(n, ["ADBE Transform Group", "ADBE Position"]);
  var frames = [];
  var f;
  for (f = from; f <= to; f++) {
    if (f === from || tlaFq(A, f) === f) frames.push(f);
  }
  var last = p0;
  for (var i = 0; i < frames.length; i++) {
    var p = tlaAttPt(A, o.anchor, frames[i], last);
    last = p;
    // шаг двоек стоит на полкадра раньше кадра: окно затвора 180° с фазой −90 — [t−¼, t+¼] кадра, шаг на кадре t попадал в окно и двоил предмет (две позиции ладони в одном кадре)
    pos.setValueAtTime(Math.max(0, frames[i] - 0.5) / 30, [p[0], p[1]]);
  }
  for (var k = 1; k <= pos.numKeys; k++) pos.setInterpolationTypeAtKey(k, KeyframeInterpolationType.HOLD, KeyframeInterpolationType.HOLD);
  A.attaches[nm] = n;
  if (o.child) o.child.parent = n;
  kbLog("ATTACH " + nm + " " + o.anchor + " f" + from + "–f" + to + " n " + frames.length);
  return n;
}

/**
 * Точка для пустышки; если в позе на этом кадре нет якоря — держим прошлую (WARN один раз).
 * @param {any} A
 * @param {string} anchor
 * @param {number} f
 * @param {number[]|null} fallback
 * @returns {number[]}
 */
function tlaAttPt(A, anchor, f, fallback) {
  try {
    var r = tlaPointRaw(A, anchor, f);
    return [r.x, r.y];
  } catch (e) {
    if (!fallback) throw e;
    if (!A.warnAtt) kbLog("WARN ATTACH " + A.name + " " + anchor + " f" + f + ": " + e.message);
    A.warnAtt = true;
    return fallback;
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Запись: слои поз и каналы
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Путь к файлу позы по паспорту.
 * @param {any} H
 * @param {string} pose
 * @returns {string}
 */
function tlaPosePath(H, pose) {
  if (H.files.dir) return kbConfig("heroRoot", KB_ROOT.parent.fsName) + "/" + H.files.dir + H.files.prefix + pose + ".png"; // heroRoot — настройка проекта (kit.config.jsx), по умолчанию папка над ae/
  return kbDoodlePath(H.files.prefix + pose);
}

/**
 * Слои позы в композиции рисунка: импорт → кипение → разрез → дыхание на теле (spec-check S4).
 * @param {any} A
 * @param {string} pose
 * @returns {{body: AVLayer, head: AVLayer|null}}
 */
function tlaBuildPose(A, pose) {
  var H = A.hero;
  var sh = H.sheet;
  var item = kbImport(tlaPosePath(H, pose));
  var layer = A.draw.layers.add(item);
  layer.name = A.name + "-" + pose;
  layer.blendingMode = BlendingMode.NORMAL;
  layer.motionBlur = false;
  kbProp(layer, ["ADBE Transform Group", "ADBE Anchor Point"]).setValue([H.axis, H.ground]);
  kbProp(layer, ["ADBE Transform Group", "ADBE Position"]).setValue([sh.dx + H.axis, sh.dy + H.ground]);
  kbProp(layer, ["ADBE Transform Group", "ADBE Scale"]).setValue([100, 100]);
  if (H.life && H.life.boil && !A.noBoil) {
    kbBoil(layer, { amount: H.life.boil.amount, size: H.life.boil.size, fps: H.life.boil.fps });
    kbOnTwos(layer, H.life.twos || 15);
  }
  var parts = { body: layer, head: null };
  if (A.split[pose]) {
    // feather шва — как в паспорте, без зажима в коде (зонд Q6; решение оркестратора 17.10: значение задаёт паспорт)
    var sp = kbHeadSplit(A.draw, layer, { neck: H.neck.y, x: H.neck.x, overlap: H.neck.overlap, feather: H.neck.feather });
    parts = { body: sp.body, head: sp.head };
    parts.head.motionBlur = false;
  }
  if (H.life && H.life.breath && !A.noBreath) {
    kbBreath(parts.body, { amount: H.life.breath.amount, period: H.life.breath.period, fps: H.life.breath.fps || 15, phase: A.phase });
  }
  return parts;
}

/**
 * Hold-ключи на каждом кадре списка (интерполяция HOLD вход/выход).
 * @param {Property} prop
 * @param {number[]} frames
 * @param {any[]} values
 */
function tlaHold(prop, frames, values) {
  var i;
  for (i = 0; i < frames.length; i++) prop.setValueAtTime(frames[i] / 30, values[i]);
  for (i = 1; i <= prop.numKeys; i++) prop.setInterpolationTypeAtKey(i, KeyframeInterpolationType.HOLD, KeyframeInterpolationType.HOLD);
}

/**
 * Окно канала: чётные кадры (и каждый кадр окон единиц) от первого события −2 до последнего +2.
 * @param {any} A
 * @param {string} ch
 * @returns {{frames: number[], a: number, b: number}|null}
 */
function tlaWindow(A, ch) {
  var list = A.ev[ch];
  if (list.length === 0) return null;
  var lo = 1e9;
  var hi = -1e9;
  for (var i = 0; i < list.length; i++) {
    var K = list[i].keys;
    if (K[0][0] < lo) lo = K[0][0];
    if (K[K.length - 1][0] > hi) hi = K[K.length - 1][0];
  }
  var last = Math.round(A.dur * 30) - 1;
  var a = Math.max(0, tlaFloorEven(lo - 2));
  var b = Math.min(last, hi + 2);
  var frames = [];
  for (var f = a; f <= b; f++) if (tlaFq(A, f) === f) frames.push(f);
  return { frames: frames, a: a, b: b };
}

/**
 * Записать канал hold-ключами в свойство.
 * @param {any} A
 * @param {string} ch
 * @param {function(number): any} conv значение канала → значение свойства
 * @param {Property[]} props
 */
function tlaWriteChan(A, ch, props, conv) {
  var w = tlaWindow(A, ch);
  if (!w) return;
  var vals = [];
  var i;
  for (i = 0; i < w.frames.length; i++) vals.push(conv(tlaChan(A, ch, w.frames[i])));
  for (i = 0; i < props.length; i++) tlaHold(props[i], w.frames, vals);
  var ones = [];
  for (i = 0; i < A.ones.length; i++) ones.push(A.ones[i][0] + "–" + A.ones[i][1]);
  kbLog("ACTKEYS " + A.name + " " + ch + " n " + w.frames.length + " f" + w.a + "–f" + w.b + " ones [" + ones.join(",") + "]");
}

/**
 * Эффекты фигуры — по одному на канал: CC Bend It (если есть события изгиба) и Bezier Warp со слайдером tl-sq (если есть события сквоша).
 * Эффект в нуле не тождественен картинке (зонд Q2b: CC Bend It даёт рваный низ у подошв рядом со своим Start), поэтому герою без изгиба/сквоша эффект не ставится;
 * Start изгиба лежит на sheet.pad ниже подошв (Q2b: чем дальше от Start, тем меньше отличие), Bezier Warp — на листе без поля (подошвы стоят при сквоше).
 * @param {any} A
 */
function tlaBuildFx(A) {
  var sh = A.hero.sheet;
  var figure = A.fig.layer(1);
  var bentL = A.layer; // Bezier Warp — на слое ячейки (источник sqc = лист без поля): вершины сетки считаются по размеру источника w × h
  var needBend = !A.noBend && (A.ev.bend.length > 0 || A.alwaysFx);
  var needWarp = !A.noWarp && (A.ev.sq.length > 0 || A.alwaysFx);
  if (needWarp || A.ev.sq.length > 0) {
    var slider = kbEffect(bentL, "ADBE Slider Control");
    slider.name = "tl-sq";
    kbProp(slider, ["ADBE Slider Control-0001"]).setValue(0);
  }
  if (needBend) {
    var bend = kbEffect(figure, "CC Bend It"); // ae-ok: bpc
    bend.name = "tl-bend";
    kbProp(bend, ["CC Bend It-0002"]).setValue([A.geo.sx, A.geo.sy]); // Start — ниже подошв (sheet.pad даёт под ним лист)
    kbProp(bend, ["CC Bend It-0003"]).setValue([A.geo.sx, A.geo.ey]); // End — выше макушки
  }
  if (needWarp) {
    var warp = kbEffect(bentL, "ADBE BEZMESH"); // ae-ok: bpc
    warp.name = "tl-warp";
    var T = tlaWarpTable(sh.w, sh.h);
    for (var vi = 0; vi < 12; vi++) {
      var mn = "ADBE BEZMESH-" + (vi < 9 ? "000" : "00") + (vi + 1); // ae-ok: matchname
      kbProp(warp, [mn]).expression = "var a=effect(\"tl-sq\")(1);\n[" + T.rest[vi][0] + "+(" + T.pull[vi][0] + ")*a," + T.rest[vi][1] + "+(" + T.pull[vi][1] + ")*a];";
    }
  }
}

/**
 * Один вызов после всех реакций и полётов: слои поз, каналы, отложенные ключи предметов.
 * @param {any} A
 */
function tlActorDone(A) {
  if (A.done) throw new Error("tlActorDone: " + A.name + " уже записан");
  var H = A.hero;
  var pose;
  var i;
  // какие позы нужны и какие разрезать (разрез — только под кивок и только у поз с split)
  var used = [];
  for (i = 0; i < A.poses.length; i++) {
    pose = A.poses[i].pose;
    var seen = false;
    for (var u = 0; u < used.length; u++) if (used[u] === pose) seen = true;
    if (!seen) used.push(pose);
  }
  // разрез решён при регистрации (A.split) — здесь проверка согласованности
  for (pose in A.headOrder) {
    if (A.headOrder[pose] && !A.split[pose]) kbLog("WARN split: поза " + pose + " заказала голову, но не режется");
  }
  for (i = 0; i < used.length; i++) A.poseLayers[used[i]] = tlaBuildPose(A, used[i]);
  tlaBuildFx(A);
  A.done = true;

  // пробные точки зонда (дети слоёв поз внутри рисунка)
  for (i = 0; i < A.probes.length; i++) {
    var pr = A.probes[i];
    var pl = A.poseLayers[pr.pose || used[0]];
    var par = (pr.part === "head" && pl.head) ? pl.head : pl.body;
    var dot = A.draw.layers.addSolid(pr.color || [1, 0, 1], pr.name || (A.name + "-dot-" + i), 6, 6, 1, A.dur);
    dot.motionBlur = false;
    kbProp(dot, ["ADBE Transform Group", "ADBE Anchor Point"]).setValue([3, 3]);
    dot.parent = par;
    kbProp(dot, ["ADBE Transform Group", "ADBE Position"]).setValue([pr.p[0], pr.p[1]]);
    kbLog("DOT " + dot.name + " pose " + (pr.pose || used[0]) + " part " + (pr.part || "body") + " at (" + pr.p[0] + "," + pr.p[1] + ")");
  }

  // каналы
  var headProps = [];
  var bodyProps = [];
  for (i = 0; i < used.length; i++) {
    var pls = A.poseLayers[used[i]];
    bodyProps.push(kbProp(pls.body, ["ADBE Transform Group", "ADBE Rotate Z"]));
    if (pls.head) headProps.push(kbProp(pls.head, ["ADBE Transform Group", "ADBE Rotate Z"]));
  }
  tlaWriteChan(A, "head", headProps, function (v) { return v; });
  tlaWriteChan(A, "body", bodyProps, function (v) { return v; });
  var figure = A.fig.layer(1);
  if (A.ev.bend.length > 0 && !A.noBend) {
    if (A.bendK === null || A.bendK === undefined) throw new Error("tlActor: у героя " + H.id + " нет calib.bendK — измерить зондом Q3 и записать в TL_HEROES." + H.id + ".calib.bendK");
    var k = A.bendK;
    tlaWriteChan(A, "bend", [kbProp(figure, ["ADBE Effect Parade", "tl-bend", "CC Bend It-0001"])], function (v) { return v / k; }); // ae-ok: matchname
  }
  if (A.ev.sq.length > 0) {
    tlaWriteChan(A, "sq", [kbProp(A.layer, ["ADBE Effect Parade", "tl-sq", "ADBE Slider Control-0001"])], function (v) { return v; });
  }
  tlaWriteChan(A, "scale", [kbProp(A.layer, ["ADBE Transform Group", "ADBE Scale"])], function (v) { return [100 * A.s * v, 100 * A.s * v]; });

  // позы: непрозрачность hold-ключами на t_f − 0,02 с (нет кадра с двумя позами)
  for (i = 0; i < used.length; i++) {
    var pose2 = used[i];
    var pl2 = A.poseLayers[pose2];
    var ts = [];
    var vs = [];
    ts.push(0);
    vs.push(A.poses[0].pose === pose2 ? 100 : 0);
    for (var j = 1; j < A.poses.length; j++) {
      var on = A.poses[j].pose === pose2 ? 100 : 0;
      var prev = A.poses[j - 1].pose === pose2 ? 100 : 0;
      if (on !== prev) {
        ts.push(tlaKf(A.poses[j].f / 30 - 0.02));
        vs.push(on);
      }
    }
    var targets = pl2.head ? [pl2.head, pl2.body] : [pl2.body];
    for (var tg = 0; tg < targets.length; tg++) {
      var op = kbProp(targets[tg], ["ADBE Transform Group", "ADBE Opacity"]);
      for (var q = 0; q < ts.length; q++) op.setValueAtTime(ts[q], vs[q]);
      for (var hk = 1; hk <= op.numKeys; hk++) op.setInterpolationTypeAtKey(hk, KeyframeInterpolationType.HOLD, KeyframeInterpolationType.HOLD);
    }
  }
  var plist = [];
  for (i = 0; i < A.poses.length; i++) plist.push(A.poses[i].role + "→" + A.poses[i].pose + "@" + A.poses[i].f);
  kbLog("POSES " + A.name + " " + plist.join(" "));

  // отложенные ключи предметов (после полётов)
  for (i = 0; i < A.deferred.length; i++) A.deferred[i]();
  kbLog("ACTDONE " + A.name);
}

// ---------------------------------------------------------------------------------------------------------------------
// Общие помощники пресетов
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Старт реакции: ровно одно из at (с) | cause (кадр) | start (кадр); результат — чётный кадр ячейки.
 * @param {any} o
 * @param {number} hitOff кадров от старта до видимого акцента (для at: акцент на TL_ACT.lead раньше слога)
 * @returns {number}
 */
function tlaStartF(o, hitOff) {
  var n = (o.at !== undefined ? 1 : 0) + (o.cause !== undefined ? 1 : 0) + (o.start !== undefined ? 1 : 0);
  if (n !== 1) throw new Error("нужно ровно одно из at | cause | start");
  if (o.at !== undefined) return tlaFloorEven(o.at * 30 - hitOff - TL_ACT.lead);
  if (o.cause !== undefined) return tlaCeilEven(o.cause + TL_ACT.lag);
  return tlaCeilEven(o.start);
}

/**
 * Результат plan() в формате раннера (секунды) + кадры.
 * @param {number} s
 * @param {number} hit
 * @param {number} end
 * @returns {any}
 */
function tlaPlanOut(s, hit, end) {
  return { n: 0, unit: "", starts: [], start: tlaKf(s / 30), hit: tlaKf(hit / 30), end: tlaKf(end / 30), total: end - s, unitFr: end - s, staggerFr: 0, s: s, hitF: hit, endF: end };
}

/**
 * Строка REACT.
 * @param {any} A
 * @param {string} name
 * @param {any} P план
 */
function tlaReact(A, name, P) {
  kbLog("REACT " + A.name + " " + name + " start f" + P.s + " hit f" + P.hitF + " end f" + P.endF);
}

/**
 * Звук реакции в мягком наборе: сила × стиль (lesson ×0,6, magazine ×0,5), кадр — не раньше картинки.
 * @param {any} A
 * @param {string} kind
 * @param {number} strength
 * @param {number} f
 */
function tlaSfx(A, kind, strength, f) {
  var k = tlaStyleKey();
  var mul = k === "lesson" ? 0.6 : (k === "magazine" ? 0.5 : 1);
  tlSfxMarker(A.layer, tlCeilFrame(tlaKf(f / 30)), kind, tlaKf(strength * mul));
  A.sfxFrames.push(f);
}

/**
 * Центр цели: точка кадра [x, y], слой (чернила или позиция) или объект {x, y}.
 * @param {any} target
 * @param {number} t
 * @returns {number[]}
 */
function tlaTargetXY(target, t) {
  if (target instanceof Array) return [target[0], target[1]];
  if (target instanceof TextLayer) {
    var ink = tlpInk(target, t);
    return [ink.cx, (ink.top + ink.bottom) / 2];
  }
  if (target && target.root) return tlpToComp(target.root, 0, 0, t);
  if (target && target.index !== undefined) return tlpToComp(target, 0, 0, t);
  throw new Error("цель (to): нужна точка [x, y], слой или предмет");
}

/**
 * Актёр слоя + проверка, что реакция не раньше причины.
 * @param {Layer} layer
 * @returns {any}
 */
function tlaActorFor(layer) {
  return tlActorOf(layer);
}

// ---------------------------------------------------------------------------------------------------------------------
// №33 nod / tilt
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Конфиг кивка/наклона на стиль (кадры и амплитуды из TL_ACT).
 * @param {boolean} tilt
 * @returns {any}
 */
function tlaNodConf(tilt) {
  var S = tlaS();
  var T = tilt ? TL_ACT.tilt : TL_ACT.nod;
  var hv = T.head.v.slice(0);
  if (tilt && !S.over) hv[2] = 1;
  var hf = tlaScaleF(T.head.f, S.dur);
  var bf = tlaScaleF(T.body.f, S.dur);
  return { a: T.a * S.str, hf: hf, hv: hv, he: T.head.e, bf: bf, bv: T.body.v, be: T.body.e, hit: hf[T.hit] };
}

/**
 * Решить режим кивка: голова (поза режется) или изгиб корпуса; заказать разрез.
 * @param {any} A
 * @param {number} f кадр акцента
 * @returns {{mode: string, pose: string}}
 */
function tlaNodMode(A, f) {
  var pose = tlaPoseAt(A, f).pose;
  var P = A.hero.poses[pose];
  if (A.hero.neck && P && P.split && A.hero.rig && A.hero.rig.split) {
    A.split[pose] = true;
    A.headOrder[pose] = true;
    return { mode: "head", pose: pose };
  }
  return { mode: "bend", pose: pose };
}

/**
 * Знак наклона к цели: цель правее центра головы/оси — плюс.
 * @param {any} A
 * @param {any} to
 * @param {number} t
 * @returns {number}
 */
function tlaSignTo(A, to, t) {
  if (to === undefined || to === null) return 1;
  var xy = tlaTargetXY(to, t);
  var f = Math.round(t * 30);
  var cx;
  try { cx = tlaPointRaw(A, "head", f).x; } catch (e) { cx = tlaPointRaw(A, "ground", f).x; }
  return tlaSign(xy[0] - cx);
}

/**
 * Общий запуск nod/tilt.
 * @param {Layer} layer
 * @param {any} o
 * @param {any} P план
 * @param {boolean} tilt
 */
function tlaRunNod(layer, o, P, tilt) {
  var A = tlActorOf(layer);
  var C = P.cfg;
  var s = P.s;
  var sign = P.sign;
  var a = C.a * sign * (o.second ? 0.6 : 1);
  if (A.hero.neck && Math.abs(a) > A.hero.neck.maxAngle + 1e-9) throw new Error("nod: |a| " + Math.abs(a).toFixed(2) + "° больше neck.maxAngle " + A.hero.neck.maxAngle);
  var m = tlaNodMode(A, s + C.hit);
  var hk = [];
  var bk = [];
  var i;
  for (i = 0; i < C.hf.length; i++) {
    var v = C.hv[i] * a;
    if (tilt && i === 1) v = -0.2 * a; // антиципация от слова
    hk.push([s + C.hf[i], v, C.he[i]]);
  }
  for (i = 0; i < C.bf.length; i++) bk.push([s + C.bf[i], C.bv[i] * a, C.be[i]]);
  if (tilt && o.untilt !== undefined) {
    hk.push([o.untilt + 12, 0, "soft"]);
    if (o.untilt > hk[hk.length - 2][0]) hk.splice(hk.length - 1, 0, [o.untilt, hk[hk.length - 2][1], "soft"]);
  }
  if (m.mode === "head") {
    tlaAdd(A, "head", tilt ? "tilt" : "nod", hk);
    tlaAdd(A, "body", tilt ? "tilt-body" : "nod-body", bk);
  } else {
    var hb = [];
    for (i = 0; i < hk.length; i++) hb.push([hk[i][0], hk[i][1] * 0.5, hk[i][2]]);
    tlaAdd(A, "bend", tilt ? "tilt-bend" : "nod-bend", hb);
    kbLog("INFO nod→bend (" + m.pose + " без шеи)");
  }
  kbLog("NOD " + A.name + " s f" + s + " hit f" + (s + C.hit) + " a " + a.toFixed(3) + " mode " + m.mode + (tilt ? " tilt" : ""));
  if (o.sfx) tlaSfx(A, "tick", TL_ACT.sfx.nod, s + C.hit);
  tlaReact(A, tilt ? "tilt" : "nod", P);
}

/** №33 nod — кивок в такт слову; tilt — наклон головы к слову без возврата. brisk: nod → take(light). */
TL_MOVES["nod"] = {
  group: "actor", slot: "accent", units: [], unit: "word",
  frames: { total: 26 }, stagger: {}, over: 0, lead: 4, sfx: null,
  params: { tilt: false, second: false, strength: 1 },
  plan: function (layer, o, S) {
    var A = tlActorOf(layer);
    if (S.name === "brisk" && !o.tilt) {
      var o2 = {};
      for (var k in o) o2[k] = o[k];
      o2.light = true;
      return TL_MOVES["take"].plan(layer, o2, S);
    }
    var C = tlaNodConf(!!o.tilt);
    var s = tlaStartF(o, C.hit);
    var sign = 1;
    if (o.tilt || o.to !== undefined) sign = tlaSignTo(A, o.to, (s + C.hit) / 30);
    var P = tlaPlanOut(s, s + C.hit, s + C.hf[C.hf.length - 1]);
    P.cfg = C;
    P.sign = sign;
    tlaReact(A, o.tilt ? "tilt" : "nod", P);
    return P;
  },
  run: function (layer, o, S, P) {
    if (S.name === "brisk" && !o.tilt) {
      kbLog("SWAP nod→take(light) (brisk, в run)");
      var o2 = {};
      for (var k in o) o2[k] = o[k];
      o2.light = true;
      TL_MOVES["take"].run(layer, o2, S, P);
      return;
    }
    tlaRunNod(layer, o, P, !!o.tilt);
  }
};

// ---------------------------------------------------------------------------------------------------------------------
// №34 lean-to
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Угол между вектором d1 и d2 в градусах.
 * @param {number[]} d1
 * @param {number[]} d2
 * @returns {number}
 */
function tlaAngle(d1, d2) {
  var a = Math.atan2(d1[1], d1[0]);
  var b = Math.atan2(d2[1], d2[0]);
  var d = Math.abs(a - b) * 180 / Math.PI;
  return d > 180 ? 360 - d : d;
}

/** №34 lean-to — корпус тянется дугой к слову; point: смена позы на указывающую. */
TL_MOVES["lean-to"] = {
  group: "actor", slot: "accent", units: [], unit: "word",
  frames: { total: 18 }, stagger: {}, over: 0, lead: 4, sfx: null,
  params: { point: false, strength: 1 },
  plan: function (layer, o, S) {
    var A = tlActorOf(layer);
    if (o.to === undefined) throw new Error("lean-to: нужна цель to (точка кадра или слой)");
    var Sx = tlaS();
    var T = TL_ACT.lean;
    var f = tlaScaleF(T.f, Sx.dur);
    var s = tlaStartF(o, f[T.hit]);
    var P = tlaPlanOut(s, s + f[T.hit], s + f[f.length - 1]);
    P.f = f;
    P.sign = tlaSignTo(A, o.to, (s + f[T.hit]) / 30);
    tlaReact(A, "lean-to", P);
    return P;
  },
  run: function (layer, o, S, P) {
    var A = tlActorOf(layer);
    var Sx = tlaS();
    var T = TL_ACT.lean;
    var th = T.a * Sx.str * P.sign;
    var v = T.v.slice(0);
    if (!Sx.over) v[2] = 1;
    var keys = [];
    var i;
    for (i = 0; i < P.f.length; i++) keys.push([P.s + P.f[i], v[i] * th, T.e[i]]);
    if (o.back !== undefined) keys.push([o.back + 12, 0, "soft"]);
    var swPose = "-";
    tlaAdd(A, "bend", "lean", keys);
    if (o.point) {
      // выбор позы: наименьший угол между осью пальца (с учётом изгиба) и направлением на цель на кадре s + 18
      var fa = P.s + P.f[P.f.length - 1];
      var cand = tlaRolePoses(A, "point");
      var best = null;
      var bestAng = 1e9;
      var tgt = tlaTargetXY(o.to, fa / 30);
      for (i = 0; i < cand.length; i++) {
        var Pc = A.hero.poses[cand[i]];
        if (!Pc.tip || !Pc.dir) continue;
        var tip = tlaPointRaw(A, "tip", fa, { pose: cand[i] });
        var base = tlaPointRaw(A, "tip", fa, { pose: cand[i], p: [Pc.tip[0] - Pc.dir[0], Pc.tip[1] - Pc.dir[1]] });
        var ang = tlaAngle([tip.x - base.x, tip.y - base.y], [tgt[0] - tip.x, tgt[1] - tip.y]);
        kbLog("AIM " + cand[i] + " " + ang.toFixed(2));
        if (ang < bestAng) { bestAng = ang; best = cand[i]; }
      }
      if (best === null) throw new Error("lean-to: у героя " + A.hero.id + " в ролях point нет позы с tip и dir — заполнить TL_HEROES." + A.hero.id + ".poses");
      if (bestAng > 12) kbLog("WARN aim " + bestAng.toFixed(2) + "° > 12 — нужна поза с пальцем под углом к цели (данные героя, spec §14)");
      var fsw = P.s + P.f[T.hit] - 4;
      swPose = tlActorPose(A, "point", fsw, { pose: best });
      tlaSfx(A, "tick", TL_ACT.sfx.lean, fsw);
    }
    kbLog("LEAN " + A.name + " s f" + P.s + " hit f" + P.hitF + " θ " + th.toFixed(3) + " point " + swPose);
    tlaReact(A, "lean-to", P);
  }
};

// ---------------------------------------------------------------------------------------------------------------------
// №37 take
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Конфиг тэйка: ключи sq (кадры от s), окно единиц, кадр смены позы.
 * @param {any} o
 * @returns {any}
 */
function tlaTakeConf(o) {
  var S = tlaS();
  var key = S.key;
  if (o.light) {
    var L = TL_ACT.light[key];
    return { keys: [[L.f[0], L.v[0], "soft"], [L.f[1], L.v[1], "soft"], [L.f[2], L.v[2], "soft"], [L.f[3], L.v[3], "soft"]], win: null, peak: L.f[1], end: L.f[3], light: true };
  }
  var T = TL_ACT.take[key];
  var up = (o.cheer ? T.upCheer : T.up) * S.str;
  var dn = T.up * S.str;
  var f = T.f;
  var keys;
  if (T.rest) {
    keys = [[f[0], 0, "soft"], [f[1], dn, "soft"], [f[2], -up, "punch"], [f[3], T.rest[0] * S.str, "soft"], [f[4], T.rest[1] * S.str, "soft"], [f[5], 0, "soft"]];
  } else {
    keys = [[f[0], 0, "soft"], [f[1], dn, "soft"], [f[2], -up, "punch"], [f[3], 0, "soft"]];
  }
  return { keys: keys, win: T.win, peak: T.peak, end: f[f.length - 1], light: false };
}

/** №37 take — тэйк: сжатие → вытяжка со сменой позы на пике → оседание; cheer — радость; light — лёгкий (подмена nod в brisk). */
TL_MOVES["take"] = {
  group: "actor", slot: "accent", units: [], unit: "word",
  frames: { total: 20 }, stagger: {}, over: 0.08, lead: 4, sfx: null,
  params: { cheer: false, light: false, pose: null, strength: 1 },
  plan: function (layer, o, S) {
    var A = tlActorOf(layer);
    var C = tlaTakeConf(o);
    var s = tlaStartF(o, C.peak);
    var P = tlaPlanOut(s, s + C.peak, s + C.end);
    P.cfg = C;
    tlaReact(A, "take", P);
    return P;
  },
  run: function (layer, o, S, P) {
    var A = tlActorOf(layer);
    var C = P.cfg;
    var s = P.s;
    var keys = [];
    var i;
    for (i = 0; i < C.keys.length; i++) keys.push([s + C.keys[i][0], C.keys[i][1], C.keys[i][2]]);
    var mode = o.light ? "light" : (o.cheer ? "cheer" : "take");
    if (C.win) tlaOnes(A, s + C.win[0], s + C.win[1]);
    tlaAdd(A, "sq", "take-" + mode, keys);
    var poseName = "-";
    if (!o.light) {
      var role = o.pose ? o.pose : (o.cheer ? "cheer" : "take");
      poseName = tlActorPose(A, role, s + C.peak, { quiet: true });
      tlaSfx(A, o.cheer ? "ding" : "pop", o.cheer ? TL_ACT.sfx.cheer : TL_ACT.sfx.take, s + C.peak);
      kbLog("INFO take: век нет");
    }
    A.takes.push({ s: s, peak: s + C.peak, end: s + C.end });
    kbLog("TAKE " + A.name + " s f" + s + " down f" + (s + C.keys[1][0]) + " peak f" + (s + C.peak) + " pose " + poseName + " settle f" + (s + C.end) + " mode " + mode);
    tlaReact(A, "take", P);
  }
};

// ---------------------------------------------------------------------------------------------------------------------
// №35 catch
// ---------------------------------------------------------------------------------------------------------------------

/** №35 catch — тело героя вокруг arc-fly: тянется, рука встречает, отдача, предмет качается на ладони. Вызов до полётов: опции item, contact (чётный кадр касания). */
TL_MOVES["catch"] = {
  group: "actor", slot: "accent", units: [], unit: "word",
  frames: { total: 24 }, stagger: {}, over: 0, lead: 0, sfx: null,
  params: { strength: 1, palmU: 0.75, to: undefined },
  plan: function (layer, o, S) {
    var A = tlActorOf(layer);
    if (o.contact === undefined) throw new Error("catch: нужен contact (чётный кадр касания)");
    if (o.contact % 2 !== 0) throw new Error("catch: contact " + o.contact + " нечётный (двойки)");
    var P = tlaPlanOut(o.contact - 8, o.contact, o.contact + 16);
    tlaReact(A, "catch", P);
    return P;
  },
  run: function (layer, o, S, P) {
    var A = tlActorOf(layer);
    var Sx = tlaS();
    var c = o.contact;
    var T = TL_ACT.catchA;
    // знак: к ладони посадки (x ладони − x оси героя) в кадре; ладонь берём из позы роли hold
    var holdPose = tlaRolePose(A, "hold");
    var palm = tlaPointRaw(A, "palm", c, { pose: holdPose });
    var ax = tlaPointRaw(A, "ground", c, { pose: holdPose });
    var sign = tlaSign(palm.x - ax.x);
    var bend = T.bend * Sx.str * sign;
    tlaAdd(A, "bend", "catch", [[c - 8, 0], [c - 4, bend, "soft"], [c, bend], [c + 8, 0, "soft"]]);
    tlActorPose(A, "hold", c - 4, { quiet: true });
    var a = T.sq * Sx.str;
    var sqk;
    if (Sx.key === "hand" || Sx.key === "brisk") {
      var fr = tlaScaleF([0, 2, 6, 12, 16], Sx.dur);
      sqk = [[c + fr[0], 0], [c + fr[1], a, "snap"], [c + fr[2], -0.35 * a, "soft"], [c + fr[3], 0.1 * a, "soft"], [c + fr[4], 0, "soft"]];
    } else {
      sqk = [[c, 0], [c + 2, a, "snap"], [c + tlaEvenN(16 * Sx.dur), 0, "soft"]];
    }
    tlaAdd(A, "sq", "catch-recoil", sqk);
    // пустышка на ладони: с c, ключи сразу; предмет — её ребёнок с к. 0
    var item = o.item;
    var until = o.to === undefined ? Math.round(A.dur * 30) - 1 : o.to;
    var nm = o.attachName || (A.name + "-at-palm-catch");
    var nul = tlAttach(A, { anchor: "palm", from: c, to: until, name: nm, child: item ? item.root : undefined });
    // отложенное: опора в точке касания и качание — после полётов
    if (item) {
      var swing = [];
      var i;
      if (Sx.key === "hand") {
        for (i = 0; i < T.rot.length; i++) swing.push([c + T.rot[i][0], T.rot[i][1]]);
      } else if (Sx.key === "brisk") {
        for (i = 0; i < T.rot.length; i++) swing.push([c + T.rot[i][0], -6 + (T.rot[i][1] + 6) * 1.2]);
      } else {
        swing = [[c, -12], [c + (Sx.key === "lesson" ? 10 : 12), -6]];
      }
      A.deferred.push(function () {
        var root = item.root;
        var sd = tlpSide(item);
        var W = sd.W;
        var Hh = sd.H;
        tlPlateRepivot(root, c / 30, [-W / 2 + o.palmU * W, Hh / 2]);
        var rot = kbProp(root, ["ADBE Transform Group", "ADBE Rotate Z"]);
        var ks = [];
        for (var j = 0; j < swing.length; j++) ks.push([swing[j][0] / 30, swing[j][1], j > 0 ? "soft" : undefined]);
        tlpKeys(rot, ks);
        var errs = [];
        for (var ff = c; ff <= c + 16; ff += 2) {
          var touch = tlpToComp(root, -W / 2 + o.palmU * W, Hh / 2, ff / 30);
          var pp = tlaPointRaw(A, "palm", ff);
          errs.push(Math.max(Math.abs(touch[0] - pp.x), Math.abs(touch[1] - pp.y)));
        }
        var mx = 0;
        for (var e = 0; e < errs.length; e++) if (errs[e] > mx) mx = errs[e];
        kbLog("CATCH " + A.name + " touch err " + mx.toFixed(2) + " px (c…c+16)");
      });
    }
    tlaSfx(A, "tick", TL_ACT.sfx.catchA, c);
    var sw = [];
    for (var k = 0; k < T.rot.length; k++) sw.push(T.rot[k][1]);
    kbLog("CATCH " + A.name + " c f" + c + " pose " + holdPose + " f" + (c - 4) + " recoil " + a.toFixed(4) + " swing " + sw.join("/") + " attach " + nul.name);
    tlaReact(A, "catch", P);
  }
};

// ---------------------------------------------------------------------------------------------------------------------
// №36 throw
// ---------------------------------------------------------------------------------------------------------------------

/** №36 throw — замах с приседанием, бросок, корпус догоняет. Вызов: item, release (чётный), to (цель — центр ED) последней реакцией ячейки. */
TL_MOVES["throw"] = {
  group: "actor", slot: "accent", units: [], unit: "word",
  frames: { total: 22 }, stagger: {}, over: 0, lead: 0, sfx: null,
  params: { strength: 1 },
  plan: function (layer, o, S) {
    var A = tlActorOf(layer);
    if (o.release === undefined) throw new Error("throw: нужен release (чётный кадр выброса)");
    if (o.release % 2 !== 0) throw new Error("throw: release " + o.release + " нечётный (двойки)");
    var P = tlaPlanOut(o.release - 10, o.release, o.release + 12);
    tlaReact(A, "throw", P);
    return P;
  },
  run: function (layer, o, S, P) {
    var A = tlActorOf(layer);
    var Sx = tlaS();
    var r = o.release;
    var T = TL_ACT.throwA;
    var sg = o.to !== undefined ? tlaSignTo(A, o.to, r / 30) : 1;
    var wind = T.bend * Sx.str * sg;
    var sqw = T.sq * Sx.str;
    var ew = TL_ACT.eWind;
    var bk = [[r - 10, 0], [r, wind, ew]];
    var qk = [[r - 10, 0], [r, sqw, ew]];
    var catchUp = Sx.key === "hand" || Sx.key === "brisk";
    if (catchUp) {
      bk.push([r + 4, T.follow * Sx.str * sg, "soft"]);
      bk.push([r + 12, 0, "soft"]);
      qk.push([r + 2, T.push * Sx.str, "snap"]);
      qk.push([r + 6, 0, "soft"]);
    } else {
      bk.push([r + 12, 0, "soft"]);
      qk.push([r + 6, 0, "soft"]);
    }
    tlaAdd(A, "bend", "throw-bend", bk);
    tlaAdd(A, "sq", "throw-sq", qk);
    var rel = "-";
    var rolePoses = A.hero.roles ? A.hero.roles.release : null;
    var noRel = rolePoses === null || rolePoses === undefined;
    var lastPoseF = A.poses[A.poses.length - 1].f;
    if (noRel && A.hero.fallback && ("release" in A.hero.fallback) && !(A.hero.fallback.release && r + 4 > lastPoseF)) {
      // запасная поза есть, но смена на r + 4 встала бы раньше уже записанной (ячейка задала позу после броска заранее) — только корпус
      kbLog("WARN ROLE " + A.hero.id + " release: своей позы нет" + (A.hero.fallback.release ? ", запасная «" + A.hero.fallback.release + "» не встаёт по порядку (последняя смена f" + lastPoseF + ")" : "") + " — только корпус");
    } else if (noRel && !(A.hero.fallback && A.hero.fallback.release)) {
      kbLog("INFO throw: позы выброса нет — только корпус");
    } else {
      rel = tlActorPose(A, "release", r + 4, { quiet: true });
    }
    var nm = o.attachName || (A.name + "-at-palm-throw");
    if (o.item) tlAttach(A, { anchor: "palm", from: 0, to: r, name: nm, child: o.item.root });
    kbLog("THROW " + A.name + " r f" + r + " windup " + wind.toFixed(2) + "/" + sqw.toFixed(3) + " follow " + (catchUp ? (T.follow * Sx.str).toFixed(2) : "0") + " release " + rel);
    tlaReact(A, "throw", P);
  }
};

// ---------------------------------------------------------------------------------------------------------------------
// №38 sparks
// ---------------------------------------------------------------------------------------------------------------------

/** №38 sparks — три штриха «как рукой» веером над макушкой (дети tlAttach(crown)). lesson: → take; magazine: нет. */
TL_MOVES["sparks"] = {
  group: "actor", slot: "accent", units: [], unit: "word",
  frames: { total: 23 }, stagger: {}, over: 0, lead: 0, sfx: null,
  params: { strength: 1, seed: 17 },
  plan: function (layer, o, S) {
    var A = tlActorOf(layer);
    if (o.start === undefined) throw new Error("sparks: нужен start (кадр, обычно пик тэйка)");
    var P = tlaPlanOut(o.start, o.start, o.start + 23);
    tlaReact(A, "sparks", P);
    return P;
  },
  run: function (layer, o, S, P) {
    var A = tlActorOf(layer);
    var Sx = tlaS();
    var s = o.start;
    if (Sx.key === "magazine") { kbLog("INFO sparks off (magazine)"); return; }
    if (Sx.key === "lesson") {
      kbLog("SWAP sparks→take (lesson, в run)");
      for (var ti = 0; ti < A.takes.length; ti++) {
        if (Math.abs(A.takes[ti].peak - s) <= 10) { kbLog("INFO sparks→take слито"); return; }
      }
      var o2 = {};
      for (var k in o) o2[k] = o[k];
      o2.cheer = true;
      o2.start = tlaCeilEven(s);
      TL_MOVES["take"].run(layer, o2, S, TL_MOVES["take"].plan(layer, o2, S));
      return;
    }
    var T = TL_ACT.sparks;
    var h = A.h;
    var comp = A.comp;
    var pal = (S.palette || {});
    var color = pal.ink || KB_COLOR.ink;
    var nul = tlAttach(A, { anchor: "crown", from: s, to: s + 23, name: A.name + "-spark-at" });
    // тайминг: центральный первым, затем левый, правый
    var order = [1, 0, 2];
    var trim = Sx.key === "brisk" ? 3 : 4;
    var made = [];
    for (var j = 0; j < 3; j++) {
      var idx = order[j];
      var ang = T.ang[idx] * Math.PI / 180;
      var dirv = [Math.sin(ang), -Math.cos(ang)];
      var nrm = [Math.cos(ang), Math.sin(ang)];
      var inner = T.gap * h;
      var len = T.len[idx] * h;
      var seedv = tlaKf(Math.sin((o.seed + idx) * 12.9898) * 43758.5453);
      var side = (seedv - Math.floor(seedv) - 0.5) * 2 * T.side * h;
      var p0 = [dirv[0] * inner, dirv[1] * inner];
      var p1, p2;
      // длина штриха = длина кривой tlHandPath (HANDPATH len), а не хорды: сдвиг середины вбок удлиняет кривую — подгоняем вдоль оси за 4 прохода
      var ext = len;
      for (var it = 0; it < 4; it++) {
        p1 = [dirv[0] * (inner + ext / 2) + nrm[0] * side, dirv[1] * (inner + ext / 2) + nrm[1] * side];
        p2 = [dirv[0] * (inner + ext), dirv[1] * (inner + ext)];
        var cl = tlmLen(tlmCurve([p0, p1, p2]));
        ext = ext * len / cl;
      }
      p1 = [dirv[0] * (inner + ext / 2) + nrm[0] * side, dirv[1] * (inner + ext / 2) + nrm[1] * side];
      p2 = [dirv[0] * (inner + ext), dirv[1] * (inner + ext)];
      var st = s + 2 * j;
      var L = tlHandPath(comp, { name: A.name + "-spark-" + j + "-" + idx, points: [p0, p1, p2], color: color, thickness: T.thick * h, start: st / 30,
        frames: trim, ease: "snap", taper: true, rough: true, boil: true, parent: nul, seed: o.seed + idx });
      var op = kbProp(L, ["ADBE Transform Group", "ADBE Opacity"]);
      tlpKeys(op, [[(s + T.hold) / 30, 100], [(s + T.hold + T.fade) / 30, 0, "soft"]]);
      L.outPoint = (s + T.hold + T.fade + 1) / 30;
      made.push(L);
    }
    var cr = tlaPointRaw(A, "crown", s);
    var busy = false;
    for (var q = 0; q < A.sfxFrames.length; q++) if (Math.abs(A.sfxFrames[q] - s) <= 6) busy = true;
    if (busy) kbLog("INFO sparks sfx занят");
    else tlaSfx(A, "marker", TL_ACT.sfx.sparks, s);
    kbLog("SPARKS " + A.name + " s f" + s + " crown (" + cr.x.toFixed(2) + "," + cr.y.toFixed(2) + ") len " + T.len.join("/") + "h gap " + T.gap + "h");
    tlaReact(A, "sparks", P);
  }
};

// ---------------------------------------------------------------------------------------------------------------------
// №39 listen
// ---------------------------------------------------------------------------------------------------------------------

/** №39 listen — «я тебя слушаю»: поза слушания, медленно ближе к зрителю, лёгкий наклон. Окно тишины [t0, t1] (чётные кадры); back — кадр возврата (по умолчанию t1 + 4). */
TL_MOVES["listen"] = {
  group: "actor", slot: "loop", units: [], unit: "word",
  frames: { total: 60 }, stagger: {}, over: 0, lead: 0, sfx: null,
  params: { strength: 1 },
  plan: function (layer, o, S) {
    var A = tlActorOf(layer);
    if (o.t0 === undefined || o.t1 === undefined) throw new Error("listen: нужны t0 и t1 (кадры окна тишины)");
    if (o.t0 % 2 !== 0 || o.t1 % 2 !== 0) throw new Error("listen: t0 и t1 должны быть чётными (двойки)");
    var back = o.back === undefined ? o.t1 + 4 : o.back;
    var P = tlaPlanOut(o.t0 - 4, o.t0, back + 12);
    P.back = back;
    tlaReact(A, "listen", P);
    return P;
  },
  run: function (layer, o, S, P) {
    var A = tlActorOf(layer);
    var Sx = tlaS();
    var t0 = o.t0;
    var t1 = o.t1;
    var back = P.back;
    var T = TL_ACT.listen;
    var pose = tlActorPose(A, "listen", t0, {});
    var amt = T.scale * Sx.str;
    tlaAdd(A, "scale", "listen-scale", [[t0, 0], [t1, amt, "soft"], [back, amt], [back + 12, 0, "soft"]]);
    var m = tlaEvenN((t0 + t1) / 2);
    var P0 = A.hero.poses[pose];
    var side = 1;
    if (P0.hand) side = tlaSign(P0.hand[0] - A.hero.axis);
    var tilt = T.tilt * Sx.str * side;
    tlaAdd(A, "bend", "listen-tilt", [[m - 6, 0], [m + 6, tilt, "soft"], [back, tilt], [back + 10, 0, "soft"]]);
    tlActorPose(A, "idle", back, {});
    kbLog("LISTEN " + A.name + " t0 f" + t0 + " t1 f" + t1 + " scale " + (1 + amt).toFixed(4) + " tilt " + tilt.toFixed(2) + " back f" + back);
    tlaReact(A, "listen", P);
  }
};

// ---------------------------------------------------------------------------------------------------------------------
// №40 wave
// ---------------------------------------------------------------------------------------------------------------------

/** №40 wave — машет на прощание: поза wave на w = s + 4, корпус качается 2 раза, оседание. */
TL_MOVES["wave"] = {
  group: "actor", slot: "accent", units: [], unit: "word",
  frames: { total: 42 }, stagger: {}, over: 0, lead: 4, sfx: null,
  params: { strength: 1 },
  plan: function (layer, o, S) {
    var A = tlActorOf(layer);
    var Sx = tlaS();
    var Pd = TL_ACT.wave.period[Sx.key];
    var s;
    if (o.at !== undefined && o.cause === undefined && o.start === undefined) s = tlaFloorEven(o.at * 30 - 4) - 4;
    else s = tlaStartF(o, 0);
    var w = s + 4;
    var end = w + TL_ACT.wave.cycles * Pd + ((Sx.key === "hand" || Sx.key === "brisk") ? 6 : 0);
    var P = tlaPlanOut(s, w, end);
    P.w = w;
    P.period = Pd;
    tlaReact(A, "wave", P);
    return P;
  },
  run: function (layer, o, S, P) {
    var A = tlActorOf(layer);
    var Sx = tlaS();
    var T = TL_ACT.wave;
    var amp = T.a * Sx.str;
    var w = P.w;
    var q = P.period / 4;
    tlActorPose(A, "wave", w, {});
    var keys = [[w, 0]];
    var sgn = [1, 0, -1, 0];
    var n = T.cycles * 4;
    for (var i = 1; i <= n; i++) keys.push([w + i * q, sgn[(i - 1) % 4] * amp, "soft"]);
    if (Sx.key === "hand" || Sx.key === "brisk") {
      keys.push([w + n * q + 2, 0.2 * amp, "soft"]);
      keys.push([w + n * q + 6, 0, "soft"]);
    }
    tlaAdd(A, "bend", "wave", keys);
    kbLog("WAVE " + A.name + " w f" + w + " cycles " + T.cycles + " period " + P.period + " amp " + amp.toFixed(2));
    tlaReact(A, "wave", P);
  }
};

/**
 * Сухой прогон реакции актёра (времена без ключей).
 * @param {any} A
 * @param {string} name
 * @param {any} opts
 * @returns {any}
 */
function tlActorPlan(A, name, opts) {
  return kbMovePlan(A.layer, name, opts);
}

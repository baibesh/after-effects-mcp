// Кривые движения type-lab: пять кубических безье (x1, 0, x2, 1) — одна и та же кривая для ключей AE и для выражений.
// x1 = out/100, x2 = 1 - into/100 (influence AE).

//@include "../core.jsx"
//@include "../motion.jsx"

/** @type {{[name: string]: {out: number, into: number, x1: number, x2: number, linear?: boolean}}} */
var TL_EASE = {
  snap: { out: 20, into: 90, x1: 0.2, x2: 0.1 },
  soft: { out: 60, into: 60, x1: 0.6, x2: 0.4 },
  punch: { out: 10, into: 95, x1: 0.1, x2: 0.05 },
  release: { out: 90, into: 20, x1: 0.9, x2: 0.8 },
  expo: { out: 5, into: 85, x1: 0.05, x2: 0.15 },
  // линейная (флаг linear): tlBz возвращает u, tlAnimator пишет отрезок линейным (режим 2). x1/x2 = 1/3, 2/3 —
  // заглушка: через bz() это smoothstep 3u²−2u³, а не линия. Для setTemporalEaseAtKey не применять.
  linear: { out: 33.3, into: 33.3, x1: 1 / 3, x2: 2 / 3, linear: true }
};

/**
 * Кривая по имени или объекту.
 * @param {string|{x1: number, x2: number, linear?: boolean}} ease
 * @returns {{x1: number, x2: number, linear?: boolean}}
 */
function tlEase(ease) {
  if (typeof ease === "string") {
    if (!TL_EASE[ease]) throw new Error("tlEase: нет кривой «" + ease + "»");
    return TL_EASE[ease];
  }
  return ease;
}

/**
 * Значение кривой 0…1 при доле времени u (бисекция по x(t) = u, 18 шагов).
 * @param {number} u
 * @param {string|{x1: number, x2: number, linear?: boolean}} ease
 * @returns {number}
 */
function tlBz(u, ease) {
  var e = tlEase(ease);
  if (e.linear) return Math.max(0, Math.min(1, u));
  if (u <= 0) return 0;
  if (u >= 1) return 1;
  var lo = 0;
  var hi = 1;
  var t = u;
  for (var k = 0; k < 18; k++) {
    t = (lo + hi) / 2;
    var m = 1 - t;
    var x = 3 * m * m * t * e.x1 + 3 * m * t * t * e.x2 + t * t * t;
    if (x < u) lo = t; else hi = t;
  }
  return 3 * (1 - t) * t * t + t * t * t;
}

/** Та же функция строкой для выражений: bz(u, x1, x2). */
var TL_EXPR_BZ =
  "function bz(u,x1,x2){if(u<=0)return 0;if(u>=1)return 1;var lo=0,hi=1,t=u;" +
  "for(var k=0;k<18;k++){t=(lo+hi)/2;var m=1-t;var x=3*m*m*t*x1+3*m*t*t*x2+t*t*t;if(x<u)lo=t;else hi=t;}" +
  "return 3*(1-t)*t*t+t*t*t;}\n";

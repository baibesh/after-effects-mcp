// Ключи и easing. Времена — в секундах от начала композиции.

//@include "core.jsx"

// Влияние (influence) в процентах: чем больше на входе в ключ, тем дольше и мягче торможение.
var KB_EASE = {
  snap: { out: 20, into: 90 }, // резкий старт, долгая посадка — основной для текста и вырезок
  soft: { out: 60, into: 60 },
  punch: { out: 10, into: 95 }
};

/**
 * Два и более ключа с одинаковым easing между ними.
 * @param {Property} prop
 * @param {number[]} times
 * @param {any[]} values
 * @param {{out: number, into: number}} ease
 */
function kbKeys(prop, times, values, ease) {
  var i;
  for (i = 0; i < times.length; i++) prop.setValueAtTime(times[i], values[i]);

  // Число измерений easing задаёт тип свойства, а не длина значения: масштаб всегда трёхмерный,
  // даже у 2D-слоя; у пространственных свойств (позиция) измерение одно.
  var dims = 1;
  if (prop.propertyValueType === PropertyValueType.ThreeD) dims = 3;
  if (prop.propertyValueType === PropertyValueType.TwoD) dims = 2;

  for (i = 0; i < times.length; i++) {
    var key = prop.nearestKeyIndex(times[i]);
    var easeIn = [];
    var easeOut = [];
    for (var d = 0; d < dims; d++) {
      easeIn.push(new KeyframeEase(0, ease.into));
      easeOut.push(new KeyframeEase(0, ease.out));
    }
    // Длина массива зависит от свойства, а типы ждут кортеж фиксированной длины.
    prop.setTemporalEaseAtKey(key, /** @type {any} */ (easeIn), /** @type {any} */ (easeOut));
  }
}

/**
 * Перелёт и возврат: значение проскакивает цель и садится на неё.
 * @param {Property} prop
 * @param {number} start
 * @param {number} duration
 * @param {any} from
 * @param {any} over значение перелёта
 * @param {any} to
 */
function kbOvershoot(prop, start, duration, from, over, to) {
  kbKeys(prop, [start, start + duration * 0.6, start + duration], [from, over, to], KB_EASE.snap);
}

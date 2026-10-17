// Стили и кривые без AE: чистые функции kit/style.jsx в песочнице vm (как в src/styles.ts).
//   npm test

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as vm from 'node:vm'

const kitDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'kit')
const ctx = vm.createContext({})
vm.runInContext(readFileSync(join(kitDir, 'style.jsx'), 'utf8'), ctx)
const J = vm.runInContext('JSON', ctx)
const plain = (v) => JSON.parse(JSON.stringify(v))
const fromDisk = (id) => {
  try {
    return J.parse(readFileSync(join(kitDir, 'styles', `${id}.json`), 'utf8'))
  } catch {
    return null
  }
}
const fromMap = (map) => (id) => (map[id] ? J.parse(JSON.stringify(map[id])) : null)
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`)

test('все стили кита разворачиваются, у каждого полный набор групп', () => {
  const ids = readdirSync(join(kitDir, 'styles')).filter((f) => f.endsWith('.json')).map((f) => f.replace('.json', ''))
  assert.ok(ids.includes('_base') && ids.length >= 4)
  for (const id of ids) {
    const s = plain(ctx.kbStyleResolve(id, fromDisk))
    assert.equal(s.id, id)
    assert.equal(s.extends, undefined)
    for (const group of ['color', 'type', 'shape', 'motion']) assert.ok(s[group], `${id}: нет ${group}`)
    for (const [k, v] of Object.entries(s.color)) if (typeof v === 'string') assert.match(v, /^#[0-9A-Fa-f]{6}$/, `${id}.color.${k}`)
    assert.ok(s.motion.dur.text > 0 && s.motion.tempo > 0)
  }
})

test('стиль переопределяет базу глубоко, списки заменяются целиком', () => {
  const s = plain(ctx.kbStyleResolve('editorial-dark', fromDisk))
  assert.equal(s.color.bg, '#0E1116')
  assert.equal(s.color.reward, '#2A1D14')
  assert.equal(s.type.font.mono, 'Menlo-Regular') // из _base
  assert.equal(s.type.font.hero, 'Inter-Bold') // своё
  assert.equal(s.type.size.h1['9x16'], 108)
  assert.deepEqual(s.from, ['_base', 'editorial-dark'])
})

test('extends с группой берёт только названную группу', () => {
  const read = fromMap({
    a: { color: { bg: '#111111' }, motion: { tempo: 1, list: [1, 2, 3] } },
    b: { color: { bg: '#222222' }, motion: { tempo: 0.8, list: [9] } },
    mix: { extends: ['a', { motion: 'b' }], color: { ink: '#333333' } },
  })
  const s = plain(ctx.kbStyleResolve('mix', read))
  assert.equal(s.color.bg, '#111111')
  assert.equal(s.color.ink, '#333333')
  assert.equal(s.motion.tempo, 0.8)
  assert.deepEqual(s.motion.list, [9])
  assert.deepEqual(s.from, ['a', 'b.motion', 'mix'])
})

test('ошибки: цикл, нет стиля, нет группы', () => {
  assert.throws(() => ctx.kbStyleResolve('x', fromMap({ x: { extends: 'y' }, y: { extends: 'x' } })), /цикл в extends \(x → y → x\)/)
  assert.throws(() => ctx.kbStyleResolve('x', fromMap({ x: { extends: 'nope' } })), /Нет стиля «nope» \(extends в «x»\)/)
  assert.throws(() => ctx.kbStyleResolve('x', fromMap({ x: { extends: [{ shape: 'y' }] }, y: {} })), /нет группы «shape»/)
})

test('токены, длительность с tempo, мс на кадр, цвет', () => {
  const s = ctx.kbStyleResolve('color-blocks', fromDisk)
  assert.equal(ctx.kbTok(s, 'color.accent'), '#FF5A36')
  assert.throws(() => ctx.kbTok(s, 'color.nope'), /нет токена «color.nope» \(в color: bg, /)
  near(ctx.kbMs(s, 'text'), 500 * 0.9)
  near(ctx.kbMs(s, 200), 180)
  near(ctx.kbMsToTime(450, 30), 14 / 30)
  assert.deepEqual(plain(ctx.kbHex('#FF8000')), [1, 128 / 255, 0])
  assert.throws(() => ctx.kbHex('red'), /нужен #RRGGBB/)
})

test('expoOut → influence 16/70, скорость 6.25× и 0 от средней', () => {
  const seg = plain(ctx.kbCurveSegment([0.16, 1, 0.3, 1], [100], 0.5)) // 100 единиц за 0,5 с: средняя 200/с
  near(seg.out[0].influence, 16)
  near(seg.out[0].speed, 1250)
  near(seg.into[0].influence, 70)
  near(seg.into[0].speed, 0)
})

test('скорость по осям со знаком; influence в границах AE', () => {
  const seg = plain(ctx.kbCurveSegment([0.22, 1, 0.36, 1], [-50, 0, 20], 1))
  seg.out.forEach((e, i) => near(e.speed, [-50, 0, 20][i] / 0.22))
  const lin = plain(ctx.kbCurveSegment([0, 0, 1, 1], [-30], 1))
  near(lin.out[0].influence, 0.1)
  near(lin.into[0].influence, 0.1)
  const emph = plain(ctx.kbCurveSegment([0.05, 0.7, 0.1, 1], [-10], 1))
  near(emph.out[0].speed, -140)
})

test('кривая с перелётом: ключи и амплитуда overshoot', () => {
  const curves = JSON.parse(readFileSync(join(kitDir, 'library', 'ease.json'), 'utf8')).curves
  const back = J.parse(JSON.stringify(curves.backOut))
  assert.deepEqual(plain(ctx.kbCurvePoints(back, 1)), [[0, 0], [0.55, 1.12], [0.8, 0.96], [1, 1]])
  const half = plain(ctx.kbCurvePoints(back, 0.5))
  near(half[1][1], 1.06)
  near(half[2][1], 0.98)
  assert.deepEqual(plain(ctx.kbCurvePoints(back, 0)), [[0, 0], [1, 1]])
  for (const [name, c] of Object.entries(curves)) {
    if (c.keys) for (const sub of [c.segEase, c.settle]) assert.ok(curves[sub]?.bezier, `${name}: нет кривой ${sub}`)
    else assert.equal(c.bezier.length, 4, name)
  }
})

// Библиотека примитивов без AE: чистые функции kit/library.jsx + целостность kit/library/*.json против стилей.
//   npm test

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as vm from 'node:vm'

const kitDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'kit')
const ctx = vm.createContext({})
for (const f of ['style.jsx', 'library.jsx']) vm.runInContext(readFileSync(join(kitDir, f), 'utf8'), ctx, { filename: f })
const J = vm.runInContext('JSON', ctx)
const load = (rel) => J.parse(readFileSync(join(kitDir, rel), 'utf8'))
ctx.KB_CURVES = load('library/ease.json').curves
const plain = (v) => JSON.parse(JSON.stringify(v))
const inVm = (v) => J.parse(JSON.stringify(v))
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`)
const styleIds = readdirSync(join(kitDir, 'styles')).filter((f) => f.endsWith('.json') && !f.startsWith('_')).map((f) => f.replace('.json', ''))
const styles = Object.fromEntries(styleIds.map((id) => [id, ctx.kbStyleResolve(id, (s) => { try { return load(`styles/${s}.json`) } catch { return null } })]))
const lib = Object.fromEntries(['motion', 'text', 'lines'].map((f) => [f, load(`library/${f}.json`).items]))

test('значения треков: base, абсолютные, offset (px × unit только у позиции), factor', () => {
  assert.deepEqual(plain(ctx.kbLibValue('base', inVm([1, 2]), 'position', 2)), [1, 2])
  assert.deepEqual(plain(ctx.kbLibValue(inVm({ offset: [0, 48] }), inVm([540, 960]), 'position', 2)), [540, 1056])
  assert.deepEqual(plain(ctx.kbLibValue(inVm({ offset: [0, 48] }), inVm([540, 960, 0]), 'position', 1)), [540, 1008, 0])
  assert.equal(ctx.kbLibValue(inVm({ offset: -10 }), 5, 'rotation', 2), -5)
  assert.deepEqual(plain(ctx.kbLibValue(inVm({ factor: 80 }), inVm([100, 50, 100]), 'scale', 2)), [80, 40, 80])
  assert.deepEqual(plain(ctx.kbLibValue(0, inVm([100, 100]), 'scale', 1)), [0, 0])
  assert.equal(ctx.kbLibValue(0, 100, 'opacity', 1), 0)
})

test('параметры: $имя подставляется, вызов переопределяет, неизвестный — ошибка', () => {
  const item = inVm(lib.motion['enter.slideIn'])
  const p = ctx.kbLibParams(item, inVm({ params: { dx: 400 } }))
  assert.deepEqual(plain(ctx.kbLibSubst(item.tracks[1].from, p)), { offset: [400, 0] })
  assert.throws(() => ctx.kbLibSubst('$nope', inVm({})), /Нет параметра «nope»/)
  near(ctx.kbLibPathPx(item, p), 400)
})

test('длительность: токен × tempo, {path} от пути, opts.dur, на кадре', () => {
  const c = styles['color-blocks']
  near(ctx.kbLibDur(c, inVm({ dur: 'text' }), inVm({}), 30), Math.round(0.45 * 30) / 30)
  near(ctx.kbLibDur(styles["editorial-dark"], inVm({ dur: { path: [300, 0.25, 900] } }), inVm({}), 30, 240), Math.round(0.36 * 30) / 30)
  near(ctx.kbLibDur(styles['editorial-dark'], inVm({ dur: { path: [300, 0.25, 900] } }), inVm({}), 30, 9000), 0.9)
  near(ctx.kbLibDur(styles['editorial-dark'], inVm({ dur: 'text' }), inVm({ dur: 1000 }), 25), 1)
})

test('кривые по ссылке стиля', () => {
  assert.equal(ctx.kbLibCurve(styles['swiss-light'], undefined, 'enter'), 'expoOut')
  assert.equal(ctx.kbLibCurve(styles['swiss-light'], '@move', 'enter'), 'expoInOut')
  assert.equal(ctx.kbLibCurve(styles['swiss-light'], undefined, 'draw'), 'expoOut')
  assert.equal(ctx.kbLibCurve(styles['swiss-light'], 'quintOut', 'enter'), 'quintOut')
})

test('кривая в выражении совпадает с cubic-bezier и даёт перелёт backOut', () => {
  const run = (name, amp) => {
    const P = J.parse(ctx.kbLibCurveExpr(name, amp))
    return new Function('P', ctx.KB_LIB_EXPR_CURVE + 'return cv;')(P)
  }
  const bez = (u, [x1, y1, x2, y2]) => { // эталон: бисекция по x(t)
    let lo = 0, hi = 1, t = u
    for (let k = 0; k < 60; k++) { t = (lo + hi) / 2; const m = 1 - t; const x = 3 * m * m * t * x1 + 3 * m * t * t * x2 + t ** 3; if (x < u) lo = t; else hi = t }
    const n = 1 - t; return 3 * n * n * t * y1 + 3 * n * t * t * y2 + t ** 3
  }
  const expo = run('expoOut', 1)
  for (const u of [0.05, 0.2, 0.5, 0.8]) near(expo(u), bez(u, [0.16, 1, 0.3, 1]), 1e-5)
  assert.equal(expo(-1), 0)
  assert.equal(expo(2), 1)
  const back = run('backOut', 1)
  near(back(0.55), 1.12, 1e-9)
  near(back(0.8), 0.96, 1e-9)
  near(run('backOut', 0)(0.55), bez(0.55, [0.22, 1, 0.36, 1]), 1e-5)
})

test('текст: единицы, номер слова, удержание', () => {
  assert.equal(ctx.kbLibUnits('I eat an apple\revery day.', 'lines'), 2)
  assert.equal(ctx.kbLibUnits('  I eat  an apple ', 'words'), 4)
  assert.equal(ctx.kbLibUnits('al ma', 'chars'), 4)
  assert.equal(ctx.kbLibWordIndex('I eat an Apple, every day.', 'apple'), 4)
  assert.equal(ctx.kbLibWordIndex('x', 2), 2)
  assert.throws(() => ctx.kbLibWordIndex('I eat', 'pear'), /Слова «pear» нет/)
  const st = styles['editorial-dark']
  assert.equal(ctx.kbTextHold(st, 'I eat an apple every day'), 1000 + 400 * 6)
  assert.equal(ctx.kbTextHold(st, 'алма', inVm({ l1: true })), 1100)
  assert.equal(ctx.kbTextHold(st, 'apple', inVm({ newWord: true })), 2500)
  assert.equal(ctx.kbTextHold(st, Array(40).fill('w').join(' ')), 7000)
})

test('библиотека против всех стилей: токены длительности, кривые, толщины, цвета, кегли', () => {
  const curves = ctx.KB_CURVES
  for (const [folder, items] of Object.entries(lib)) {
    for (const [id, it] of Object.entries(items)) {
      assert.ok(it.description, `${id}: нет description`)
      assert.ok(it.kind, `${id}: нет kind`)
      if (it.basedOn) assert.ok(ctx.KB_LIB_BASED[it.basedOn], `${id}: basedOn ${it.basedOn}`)
      const refs = [it.curve, ...(it.tracks || []).flatMap((t) => [t.curve, ...(t.keys || []).map((k) => k[2])])].filter(Boolean)
      for (const st of Object.values(styles)) {
        if (typeof it.dur === 'string') assert.ok(st.motion.dur[it.dur], `${id}: нет motion.dur.${it.dur} в ${st.id}`)
        if (it.stagger) assert.ok(st.motion.stagger[it.stagger], `${id}: нет stagger.${it.stagger}`)
        for (const r of refs) assert.ok(curves[r.startsWith('@') ? st.motion.ease[r.slice(1)] : r], `${id}: кривая ${r} в ${st.id}`)
        const p = it.params || {}
        if (p.stroke) assert.ok(st.shape.stroke[p.stroke] !== undefined, `${id}: shape.stroke.${p.stroke}`)
        for (const role of [p.color, p.chip, p.ink, it.animate?.fill === '$color' ? p.color : null].filter(Boolean)) assert.match(st.color[role] ?? '', /^#/, `${id}: color.${role} в ${st.id}`)
        if (p.size) assert.ok(st.type.size[p.size], `${id}: type.size.${p.size}`)
        for (const e of Object.values(st.motion.ease)) assert.ok(curves[e], `${st.id}: motion.ease → ${e}`)
        for (const k of ['text', 'word']) assert.ok(lib.text[st.motion[k]], `${st.id}: motion.${k} = ${st.motion[k]} нет в text.json`)
        assert.ok(['round', 'butt'].includes(st.shape.cap), `${st.id}: shape.cap`)
      }
    }
  }
})

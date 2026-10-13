#!/usr/bin/env node
// Проверка .jsx (ExtendScript для After Effects) без запущенного AE.
//
//   node tools/validate.mjs            — kit/ и reels/
//   node tools/validate.mjs kit/text.jsx reels/demo
//   --no-types                         — без проверки типов (быстрее)
//   --bpc 8|16|32                      — глубина цвета проекта (по умолчанию 32)
//
// Что ловит:
//   es3        синтаксис не ES3 (let/const, стрелки, шаблонные строки, висячая запятая в объекте)
//   directive  #include/#target вместо //@include (ломают и парсер, и tsc)
//   include    //@include на несуществующий файл
//   reserved   зарезервированное слово ES3 как имя свойства (obj.class, {default: 1})
//   blocking   alert/confirm/prompt/new Window — вешают запуск без человека
//   undo       beginUndoGroup без парного endUndoGroup
//   matchname  matchName, которого нет в документации (с подсказкой ближайшего)
//   bpc        эффект с меньшей глубиной цвета, чем проект (обрежет яркости выше 1.0)
//   asset      путь к файлу, которого нет; формат, который AE не импортирует
//   types      вызовы API AE и ExtendScript против types-for-adobe (в т.ч. forEach/JSON/trim — их нет)
//
// Заглушить находку в строке: комментарий `// ae-ok: <правило>[, <правило>]` в той же строке;
// на весь файл — `// ae-ok-file: <правило>`.

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, extname, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as acorn from 'acorn'
import * as walk from 'acorn-walk'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const AE_TYPES = 'node_modules/types-for-adobe/AfterEffects/26.0/index.d.ts'

const args = process.argv.slice(2)
const flag = (name) => args.includes(name)
const option = (name, fallback) => {
  const i = args.indexOf(name)
  return i === -1 ? fallback : args[i + 1]
}
const projectBpc = Number(option('--bpc', 32))
const targets = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--bpc')

const ES3_RESERVED = new Set(('abstract boolean byte case catch char class const continue debugger default ' +
  'delete do double else enum export extends final finally float for function goto if implements import in ' +
  'instanceof int interface long native new package private protected public return short static super switch ' +
  'synchronized this throw throws transient try typeof var void volatile while with').split(' '))
const BLOCKING_CALLS = new Set(['alert', 'confirm', 'prompt'])
const MATCHNAME_PREFIX = /^(ADBE|CC|VISINF|PEDG|APC|CS|ISL|SYNTHAP|aeCA) \S/
const ASSET_EXT = new Set(['.png', '.jpg', '.jpeg', '.psd', '.ai', '.tif', '.tiff', '.exr', '.wav', '.mp3', '.aif',
  '.mp4', '.mov', '.ffx', '.aep', '.json', '.ttf', '.otf', '.webp', '.svg', '.gif', '.jsx'])
const NOT_IMPORTABLE = { '.webp': 'AE не импортирует WebP — перегнать в PNG', '.gif': 'GIF импортируется как видео без альфы — лучше PNG-секвенция' }

const dict = loadDictionary()
const findings = []

const files = collect(targets.length ? targets : ['kit', 'reels'])
if (!files.length) {
  console.error('Нет .jsx для проверки.')
  process.exit(1)
}

for (const file of files) checkFile(file)
if (!flag('--no-types')) await checkTypes(files)
report()

// ─── словарь ────────────────────────────────────────────────────────────────

function loadDictionary() {
  const path = join(root, 'tools', 'data', 'matchnames.json')
  if (!existsSync(path)) {
    console.error('Нет tools/data/matchnames.json — сначала `npm run matchnames`.')
    process.exit(1)
  }
  const { effects, props } = JSON.parse(readFileSync(path, 'utf8'))
  // Свойства слоёв, снятые зондом: закрывают пробелы документации (селекторы текста и т.п.).
  const layerPropsPath = join(root, 'tools', 'data', 'layer-props.json')
  if (existsSync(layerPropsPath)) {
    for (const [name, title] of Object.entries(JSON.parse(readFileSync(layerPropsPath, 'utf8')))) {
      props[name] ??= { name: title, page: 'probe' }
    }
  }
  // Параметры эффектов, снятые с живого AE (kit/probe.jsx); до первого запуска AE файла нет.
  const paramsPath = join(root, 'tools', 'data', 'effect-params.json')
  const params = existsSync(paramsPath) ? JSON.parse(readFileSync(paramsPath, 'utf8')) : null
  return { effects, props, params, all: [...Object.keys(effects), ...Object.keys(props)] }
}

// ─── сбор файлов ────────────────────────────────────────────────────────────

function collect(paths) {
  const out = []
  const visit = (p) => {
    if (!existsSync(p)) return
    if (statSync(p).isDirectory()) {
      for (const e of readdirSync(p)) if (e !== 'node_modules' && !e.startsWith('.')) visit(join(p, e))
    } else if (p.endsWith('.jsx')) out.push(resolve(p))
  }
  for (const p of paths) visit(isAbsolute(p) ? p : join(root, p))
  return out
}

// ─── проверки одного файла ──────────────────────────────────────────────────

function checkFile(file) {
  const source = readFileSync(file, 'utf8')
  const lines = source.split('\n')
  const parseMuted = (text) => text?.split(',').map((s) => s.trim().split(/\s/)[0]) ?? []
  const mutedInFile = parseMuted(source.match(/\/\/\s*ae-ok-file:\s*([^\n]+)/)?.[1])
  const add = (rule, line, message, level = 'error') => {
    const muted = parseMuted(lines[line - 1]?.match(/\/\/\s*ae-ok:\s*([^\n]+)/)?.[1])
    if (!muted.includes(rule) && !mutedInFile.includes(rule)) findings.push({ file, line, rule, level, message })
  }

  lines.forEach((text, i) => {
    if (/^\s*#(include|includepath|target|targetengine|script)\b/.test(text)) {
      add('directive', i + 1, `«${text.trim()}» — писать //@${text.trim().slice(1)}`)
    }
    const inc = text.match(/^\s*\/\/\s*@include\s+["'](.+?)["']/)
    if (inc && !existsSync(resolve(dirname(file), inc[1]))) {
      add('include', i + 1, `нет файла ${inc[1]}`)
    }
  })

  // Директивы с # не переживут парсер — глушим их, чтобы остальной файл проверился.
  const parseable = source.replace(/^(\s*)#(include|includepath|target|targetengine|script)\b.*$/gm, '$1//')

  let ast
  try {
    ast = acorn.parse(parseable, { ecmaVersion: 3, locations: true, allowReserved: true })
  } catch (e) {
    add('es3', e.loc?.line ?? 1, `не ES3: ${e.message.replace(/\s*\(\d+:\d+\)$/, '')}`)
    return
  }

  let undoOpen = 0
  let undoLine = 0

  walk.simple(ast, {
    MemberExpression(node) {
      if (!node.computed && ES3_RESERVED.has(node.property.name)) {
        add('reserved', node.loc.start.line, `.${node.property.name} — зарезервированное слово ES3, писать ["${node.property.name}"]`)
      }
    },
    Property(node) {
      if (node.key.type === 'Identifier' && ES3_RESERVED.has(node.key.name)) {
        add('reserved', node.loc.start.line, `ключ ${node.key.name} — зарезервированное слово ES3, взять в кавычки`)
      }
    },
    CallExpression(node) {
      const callee = node.callee
      if (callee.type === 'Identifier' && BLOCKING_CALLS.has(callee.name)) {
        add('blocking', node.loc.start.line, `${callee.name}() остановит запуск без человека — писать в лог`)
      }
      if (callee.type === 'MemberExpression' && !callee.computed) {
        if (callee.property.name === 'beginUndoGroup') { undoOpen++; undoLine = node.loc.start.line }
        if (callee.property.name === 'endUndoGroup') undoOpen--
      }
    },
    NewExpression(node) {
      if (node.callee.type === 'Identifier' && node.callee.name === 'Window') {
        add('blocking', node.loc.start.line, 'new Window() — окно ScriptUI остановит запуск без человека')
      }
    },
    Literal(node) {
      if (typeof node.value !== 'string') return
      checkMatchName(node.value, node.loc.start.line, add)
      checkAsset(node.value, node.loc.start.line, file, add)
    },
  })

  if (undoOpen !== 0) add('undo', undoLine || 1, 'beginUndoGroup и endUndoGroup не парные')
}

function checkMatchName(value, line, add) {
  if (!MATCHNAME_PREFIX.test(value)) return

  const effect = dict.effects[value]
  if (effect) {
    if (effect.bpc && effect.bpc < projectBpc) {
      add('bpc', line, `${effect.name} работает в ${effect.bpc} бит, проект — ${projectBpc}: яркости выше 1.0 обрежутся ` +
        '(на масках и матах это не страшно — тогда ae-ok: bpc)', 'warn')
    }
    return
  }
  if (dict.props[value]) return

  // Параметр эффекта: «<matchName эффекта>-0003».
  const param = value.match(/^(.+)-(\d{4})$/)
  if (param && dict.effects[param[1]]) {
    const known = dict.params?.[param[1]]
    if (known && !known.includes(value)) add('matchname', line, `у эффекта ${param[1]} нет параметра ${value}`)
    return
  }

  const near = nearest(value, dict.all)
  add('matchname', line, `неизвестный matchName «${value}»` + (near ? ` — возможно, «${near}»` : ''))
}

function checkAsset(value, line, file, add) {
  const ext = extname(value).toLowerCase()
  if (!ASSET_EXT.has(ext) || /[*<>]|^https?:/.test(value) || !/[\\/]/.test(value)) return
  if (/^(out|tools\/data)\//.test(value)) return // то, что скрипты сами пишут

  if (NOT_IMPORTABLE[ext]) add('asset', line, `${value}: ${NOT_IMPORTABLE[ext]}`)
  if (ext === '.svg') add('asset', line, `${value}: импорт SVG зависит от версии AE — проверить на живом`, 'warn')

  const candidates = isAbsolute(value)
    ? [value.replace(/^~/, process.env.HOME)]
    : [resolve(dirname(file), value), resolve(root, value), resolve(root, '..', value)]
  if (value.startsWith('~/')) candidates.push(join(process.env.HOME, value.slice(2)))
  if (!candidates.some(existsSync)) add('asset', line, `нет файла ${value}`)
}

function nearest(value, pool) {
  let best = null
  let bestDistance = Math.max(3, Math.floor(value.length / 4))
  for (const candidate of pool) {
    if (Math.abs(candidate.length - value.length) > bestDistance) continue
    const d = levenshtein(value.toLowerCase(), candidate.toLowerCase(), bestDistance)
    if (d < bestDistance) { best = candidate; bestDistance = d }
  }
  return best
}

function levenshtein(a, b, limit) {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const row = [i]
    let rowMin = i
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
      rowMin = Math.min(rowMin, row[j])
    }
    if (rowMin > limit) return Infinity
    prev = row
  }
  return prev[b.length]
}

// ─── типы API ───────────────────────────────────────────────────────────────

async function checkTypes(jsxFiles) {
  const { default: ts } = await import('typescript')
  const types = join(root, AE_TYPES)
  if (!existsSync(types)) {
    findings.push({ file: types, line: 1, rule: 'types', level: 'error', message: 'нет types-for-adobe — `npm install`' })
    return
  }

  // Все файлы — глобальные скрипты одной программы: так работает //@include.
  // noLib: стандартную библиотеку заменяет ExtendScript из types-for-adobe (в нём нет forEach, JSON, trim).
  const program = ts.createProgram([types, ...jsxFiles], {
    allowJs: true,
    checkJs: true,
    noEmit: true,
    noLib: true,
    types: [],
    skipLibCheck: true,
    strict: false,
    jsx: ts.JsxEmit.Preserve,
    target: ts.ScriptTarget.ES5,
    module: ts.ModuleKind.None,
  })

  const wanted = new Set(jsxFiles)
  for (const d of ts.getPreEmitDiagnostics(program)) {
    if (!d.file || !wanted.has(resolve(d.file.fileName))) continue
    const { line } = d.file.getLineAndCharacterOfPosition(d.start)
    const text = d.file.text.split('\n')[line] ?? ''
    if (/\/\/\s*ae-ok:[^\n]*\btypes\b/.test(text)) continue
    if (/^\s*#/.test(text)) continue // директиву уже назвало правило directive
    findings.push({
      file: resolve(d.file.fileName),
      line: line + 1,
      rule: 'types',
      level: 'error',
      message: typeMessage(ts.flattenDiagnosticMessageText(d.messageText, ' ').replace(/\s+/g, ' '), d.code),
    })
  }
}

function typeMessage(text, code) {
  // .property() возвращает «свойство или группу» — дальше по цепочке типов нет.
  if (text.includes("'_PropertyClasses'")) {
    const member = text.match(/Property '(\w+)'/)?.[1]
    return `.${member} после .property(): брать свойство через kbProp/kbGroup из kit/core.jsx`
  }
  return `${text} (TS${code})`
}

// ─── отчёт ──────────────────────────────────────────────────────────────────

function report() {
  findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)
  let current = ''
  for (const f of findings) {
    if (f.file !== current) { current = f.file; console.log(`\n${relative(root, f.file)}`) }
    console.log(`  ${String(f.line).padStart(4)}  ${f.level === 'error' ? '✗' : '!'} ${f.rule.padEnd(9)} ${f.message}`)
  }
  const errors = findings.filter((f) => f.level === 'error').length
  const warns = findings.length - errors
  console.log(`\n${files.length} файл(ов): ошибок ${errors}, предупреждений ${warns}` +
    (dict.params ? '' : ' · параметры эффектов не проверялись: нет tools/data/effect-params.json (снимет kit/probe.jsx на живом AE)'))
  process.exit(errors ? 1 : 0)
}

#!/usr/bin/env node
// Копия общего кита в проекте:  node tools/kit-sync.mjs <папка ae проекта> [--check]
//
// Почему копия, а не символическая ссылка: ExtendScript не находит вложенные //@include через ссылку
// (reels → local/x.jsx → ../kit/project.jsx → core.jsx даёт «File or folder does not exist»), проверено на AE 26.5.
//
// Заодно обновляет tools/validate.mjs проекта (правила валидатора общие с китом).
//
// Источник правды — ae-plugin/kit. В проекте kit/ — копия с меткой kit/.kit-source (коммит ae-plugin).
// Перед обновлением сверяет копию с тем коммитом: если кит правили прямо в проекте, ничего не трогает
// и перечисляет файлы — правки сначала перенести в ae-plugin/kit.
//   --check  только сверить: копия = текущему ae-plugin/kit? (код выхода 1, если нет)

import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = join(repo, 'kit')
const args = process.argv.slice(2)
const check = args.includes('--check')
const target = args.find((a) => !a.startsWith('--'))
if (!target) {
  console.error('usage: node tools/kit-sync.mjs <папка ae проекта> [--check]')
  process.exit(2)
}
const kit = join(resolve(target), 'kit')
const stamp = join(kit, '.kit-source')
const git = (...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8' }).trim()
// Файлы кита с подпапками (presets/, heroes/, styles/, library/): пути от kit/, через «/».
const kitFiles = (dir, sub = '') => {
  if (!existsSync(join(dir, sub))) return []
  const out = []
  for (const e of readdirSync(join(dir, sub), { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue
    const rel = sub ? `${sub}/${e.name}` : e.name
    if (e.isDirectory()) out.push(...kitFiles(dir, rel))
    else if (/\.(jsx|md|json)$/.test(e.name)) out.push(rel)
  }
  return out.sort()
}

const differs = (a, b) => !existsSync(a) || !existsSync(b) || !readFileSync(a).equals(readFileSync(b))

const validator = join(repo, 'tools', 'validate.mjs')
const projectValidator = join(resolve(target), 'tools', 'validate.mjs')

if (check) {
  const names = new Set([...kitFiles(source), ...kitFiles(kit)])
  const changed = [...names].filter((f) => differs(join(source, f), join(kit, f)))
  if (existsSync(projectValidator) && differs(validator, projectValidator)) changed.push('tools/validate.mjs')
  if (changed.length) {
    console.log(`kit/ проекта расходится с ae-plugin/kit: ${changed.join(', ')}\n→ node ${join(repo, 'tools/kit-sync.mjs')} ${target}`)
    process.exit(1)
  }
  console.log('kit/ проекта = ae-plugin/kit')
  process.exit(0)
}

// Правки в копии проекта, сделанные после прошлой синхронизации.
if (existsSync(stamp)) {
  const base = readFileSync(stamp, 'utf8').match(/commit (\w+)/)?.[1]
  const local = kitFiles(kit).filter((f) => {
    let original
    try {
      original = execFileSync('git', ['-C', repo, 'show', `${base}:kit/${f}`])
    } catch {
      return true // файла не было в ките на момент синхронизации
    }
    return !original.equals(readFileSync(join(kit, f)))
  })
  if (local.length) {
    console.error(`СТОП: kit/ в проекте правили после синхронизации (${base}): ${local.join(', ')}.\n` +
      `Перенесите правки в ${source} (и закоммитьте там), затем повторите.`)
    process.exit(1)
  }
} else if (existsSync(kit)) {
  console.log('Меток синхронизации нет — первая синхронизация, kit/ проекта заменяется целиком.')
}

if (git('status', '--porcelain', '--', 'kit')) {
  console.error('СТОП: в ae-plugin/kit есть незакоммиченные правки — закоммитьте, чтобы метка указывала на точную версию.')
  process.exit(1)
}

rmSync(kit, { recursive: true, force: true })
mkdirSync(kit, { recursive: true })
for (const f of kitFiles(source)) {
  mkdirSync(dirname(join(kit, f)), { recursive: true })
  copyFileSync(join(source, f), join(kit, f))
}
if (existsSync(projectValidator)) copyFileSync(validator, projectValidator)
const commit = git('rev-parse', '--short', 'HEAD')
writeFileSync(stamp, `Копия ae-plugin/kit, commit ${commit}. Не править здесь: правки — в ae-plugin/kit, затем tools/kit-sync.mjs.\n`)
console.log(`kit/ ← ae-plugin/kit @ ${commit} (${kitFiles(kit).length} файлов)`)

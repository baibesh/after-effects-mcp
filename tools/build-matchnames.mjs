#!/usr/bin/env node
// Собирает словарь matchName из документации docsforadobe (.ref/after-effects-scripting-guide)
// в tools/data/matchnames.json. Словарь читает validate.mjs.
//
// Параметры эффектов («ADBE Glo2-0003») в документации не описаны: их снимает с живого AE
// kit/probe.jsx → tools/data/effect-params.json (см. README).

import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const guide = join(root, '.ref', 'after-effects-scripting-guide')
const docs = join(guide, 'docs', 'matchnames')

if (!existsSync(docs)) {
  console.error(`Нет документации: ${relative(root, docs)}\n` +
    'git clone --depth 1 https://github.com/docsforadobe/after-effects-scripting-guide.git ae/.ref/after-effects-scripting-guide')
  process.exit(1)
}

const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith('.md') ? [join(dir, e.name)] : [])

const cells = (line) => line.split('|').slice(1, -1).map((c) => c.trim())

const effects = {}
const props = {}

for (const file of walk(docs)) {
  const page = relative(docs, file).replace(/\.md$/, '')
  const isEffects = page.startsWith('effects/')
  let section = ''
  let header = null

  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const h = line.match(/^#{2,4}\s+(.*)$/)
    if (h) { section = h[1].trim(); header = null; continue }
    if (!line.startsWith('|')) { header = null; continue }

    const row = cells(line)
    if (!header) { header = row.map((c) => c.toLowerCase()); continue }
    if (row.every((c) => /^:?-+:?$/.test(c))) continue

    const name = row[0].match(/^`(.+)`$/)?.[1]
    if (!name) continue
    const col = (title) => row[header.findIndex((c) => c.startsWith(title))] ?? ''

    if (isEffects) {
      effects[name] = {
        name: col('display'),
        category: section,
        bpc: Number(col('bpc')) || null,
        gpu: col('gpu') || null,
      }
    } else {
      props[name] = { name: col('display'), page, section }
    }
  }
}

let commit = ''
try { commit = execSync('git rev-parse --short HEAD', { cwd: guide }).toString().trim() } catch {}

const out = join(root, 'tools', 'data', 'matchnames.json')
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, JSON.stringify({
  source: `docsforadobe/after-effects-scripting-guide@${commit}`,
  effects,
  props,
}, null, 1) + '\n')

console.log(`${relative(root, out)}: эффектов ${Object.keys(effects).length}, свойств ${Object.keys(props).length}`)

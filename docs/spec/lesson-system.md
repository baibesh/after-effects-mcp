# Система уроков: стиль, библиотека, партитура

Черновик спецификации, 17.10.2026. Этапы 1 (стили, кривые, `list_styles`/`get_style`) и 2 (примитивы motion/text/lines, `list_library`/`apply_library`) сделаны — kit/README.md §7. Числа и правила — из [research/motion-design-pro.md](../research/motion-design-pro.md) (раздел 7). Пометка [П] в исследовании означает отраслевую практику без источника; такие значения проверяем на 2–3 тестовых роликах и правим в токенах, а не в коде.

Первая серия — kemel-bilim English, мини-ролики 60–90 с, 9:16 и 16:9, с игровыми вставками. Без липсинка. Картинки генерируются (fal).

## 1. Три уровня

```
lesson.json  ──►  build_lesson  ──►  комп AE  ──►  audit_animation  ──►  render_formats
   │ блоки и контент        ▲
   │                         │
   └── style: "editorial-dark"  ─►  styles/*.json  (токены: цвет, шрифт, формы, движение)
                             │
                 library/*.json  (блоки, переходы, линии, картинки, фоны, игры)
```

- **Стиль** — как выглядит и двигается. Меняется одной строкой в партитуре.
- **Библиотека** — что умеет делать: раскладки блоков и примитивы. Ничего не знает о цветах, берёт всё из токенов стиля.
- **Партитура** — что сказать в этом уроке: блоки по порядку, тексты, ссылки на картинки и голос.

Правило: в библиотеке и партитуре нет ни одного hex-цвета, шрифта или длительности в кадрах. Только роли (`accent`, `h1`, `dur.text`) и множители.

## 2. Стиль — `styles/<id>.json`

Общая база `styles/_base.json` (токены из исследования, 7.1) плюс файл стиля, который переопределяет только своё. Гибрид — третий файл с `"extends": ["swiss-light", {"motion": "color-blocks"}]`.

```json
{
  "id": "editorial-dark",
  "extends": "_base",
  "color": {
    "bg": "#0E1116", "surface": "#1A1F27", "ink": "#F2F4F7", "muted": "#9AA4B2",
    "brand": "#FF6B3D", "accent": "#FF6B3D",
    "correct": "#3FB27F", "wrong": "#FF4D4D",
    "pos": { "noun": "#5B9DFF", "verb": "#FF9B4A", "adj": "#3FB27F", "other": "#A78BFA" }
  },
  "type": {
    "display": "Inter Tight", "text": "Inter", "mono": "JetBrains Mono",
    "tracking": { "hero": -30, "h1": -10 },
    "labels": "numbered-mono"
  },
  "shape": {
    "radius": { "card": 20, "chip": 12 },
    "stroke": { "thin": 2, "main": 5, "accent": 8, "underline": 6 },
    "imageMask": "rounded", "imageFrame": "none",
    "background": "bg.grid-fine", "sticker": "none", "shadow": "none"
  },
  "motion": {
    "tempo": 1.0,
    "ease": { "enter": "expoOut", "exit": "expoIn", "move": "quartInOut" },
    "text": "text.maskUp", "word": "text.letters",
    "image": ["image.maskReveal", "image.kenBurns"],
    "transition": "trans.push", "emphasis": "draw.underline",
    "overshoot": 0
  }
}
```

Первые три стиля — варианты с превью:

| id | Фон | Формы | Движение |
|---|---|---|---|
| `editorial-dark` (A) | тёмный, тонкая сетка | скругление 20, линии 2–5 px, номера блоков моно | маска снизу по буквам, шторка картинки, push |
| `swiss-light` (B) | тёплый светлый, цветная панель | скругление 4, жирная линейка 3 px | панель scaleX, маска по буквам, slide |
| `color-blocks` (C) | крупные цветные плоскости | круги, плашки, линии 6 px | плоскости сменяют друг друга, iris, лёгкий overshoot |

`motion.tempo` умножает все `dur.*` (0.85 — бодрее для подростков, 1.15 — спокойнее для малышей). `motion.overshoot` 0…1 масштабирует амплитуду `backOut` и inertial bounce.

## 3. Библиотека — `library/`

Формат один для всех файлов: `id`, `params` с дефолтами, `tracks` или `parts`. Время в миллисекундах или ссылкой на токен (`"dur": "text"`), перевод в кадры по fps компа. Кривые по имени из `ease.json` (expoOut, quintOut, backOut…) — конвертер в influence/speed AE из исследования, 7.2. Старые `presets/*.json` (кадры при 24 fps) остаются и читаются как раньше.

| Папка | Что внутри | Первый набор |
|---|---|---|
| `ease.json` | кривые | 12 кривых из 7.2 |
| `motion/` | примитивы входа, выхода, акцента, idle, камеры | `enter.rise/maskUp/pop/scaleIn/unblur`, `exit.fadeDown/shrink`, `emphasis.pop/dimOthers/shake`, `idle.breathe/sway/float`, `camera.pushIn/zoomTo` |
| `text/` | анимация текста и раскладка | `text.maskUp/letters/rise/highlightWord/counter/plate/fit/hold` |
| `lines/` | линии и аннотации | `draw.arrow/connector/underline/marker/circle/strike`, `callout` |
| `images/` | обработка картинок | `image.normalize/duotone/card/cutout/kenBurns/maskReveal/zoomDetail/compare/grid/parallax` |
| `stickers/` | стикеры и иконки | `sticker.style`, `icon.style` |
| `backgrounds/` | фоны | `bg.solid/grid-fine/dots/pattern/noise/blobs/image/panel` |
| `transitions/` | связки сцен | `trans.cut/push/shapeWipe/iris/zoomThrough/whip/matchCut` |
| `blocks/` | раскладки блоков урока (сцены) | см. раздел 4 |
| `games/` | игровые компоненты | `game.choices/timerRing/timerBar/reveal/starFly/counter/thinkPause/speakPrompt/flipReveal/fillBlank/rewardStars` |

Что берём из кита, а не пишем заново: `kbUnderline`, `kbMarkerStroke`, `kbScribbleReveal` и `tlHandPath` (основа `draw.*`), `kbWhip` и `tlCamRig` (основа `trans.whip`, `camera.*`), плашки из `tl-plate.jsx` и `add_text_plate` (основа `text.plate`, `callout`), `kbImport` и `kbConfetti`. Новое: стрелка, обработка картинок, квиз и таймер, движок раскладок, конвертер bezier → AE.

### Картинки

ИИ-картинки разнородные, поэтому каждая проходит одну цепочку, заданную стилем:

1. Генерация с одним style-prompt серии и запасом размера ×1,5–2 (`srcScale ≥ 1.5` для наезда).
2. `image.normalize`: чёрная/белая точка 5/95 %, насыщенность −15, тонировка в палитру 15 %, общее зерно 3 %.
3. Подача по стилю: `card` (маска, рамка) или `cutout` (вырезка фона, обводка).
4. Движение: `maskReveal` на входе, `kenBurns` 100→110 % за сцену к `focus`, по смыслу `zoomDetail` или `compare`.

Ассеты кладутся в `assets/library/<тема>/<slug>.png` с `<slug>.json` рядом: prompt, модель, seed, `focus` (u,v), теги. Повторная тема берёт готовое из кэша.

## 4. Блоки урока

Блок — раскладка со слотами и таймингом внутри. Слоты заполняет партитура, раскладку подбирает формат (9:16 и 16:9 — разные раскладки одного блока, без кропа).

| Блок | Слоты | Тайминг (из 7.8–7.9) |
|---|---|---|
| `hook` | вопрос или картинка-загадка | ≤ 3 с, без логотипа |
| `topic` | заголовок темы, номер урока | 2–3 с |
| `word` | image, word, ipa, stress, tr, example | картинка → слово +0,4 → IPA +1,2 → перевод +2,5 → пример +4 → «повтори» +6 с паузой 1,5–2 |
| `image-callout` | image, 1–3 метки с точками (u,v) | картинка, затем метки по одной; удержание по формуле |
| `compare` | две картинки или два слова | сплит 650 мс, подсветка различия |
| `list` | 2–4 пункта с иконками | stagger 130 мс, всё ≤ 700 мс |
| `example` | фраза, целевое слово | фраза maskUp, слово highlightWord синхронно с голосом |
| `quiz-pick` | вопрос, 2–4 варианта, ответ | анонс 0,7 → варианты → таймер 3 с (подростки) / 5 с (дети) → раскрытие → звезда к счётчику; ≈ 12 с |
| `recall` | картинка без слова | «How do you say…?» → пауза 3 с → flip |
| `fill-blank` | фраза с пропуском, варианты | пропуск → пауза → слово maskUp + подчёркивание |
| `recap` | 4–6 слов урока | сетка 2×2 / 3×2, pop + голос по каждому |
| `outro` | звёзды, CTA | ≤ 2 с, логотип ≤ 1,5 с |

Для математики потом добавятся `formula`, `number-line`, `graph`, `fraction` (7.8) — тот же формат, другой стиль.

## 5. Партитура — `reels/<unit>/lesson.json`

```json
{
  "series": "kemel-english",
  "style": "editorial-dark",
  "formats": ["9x16", "16x9"],
  "audience": "teens",
  "lang": { "target": "en", "native": ["kk", "ru"] },
  "voice": "reels/en-03/voice.jsx",
  "blocks": [
    { "type": "hook", "voice": "v01", "text": "What do you call this?", "image": "gen:apple-closeup" },
    { "type": "word", "voice": "v02",
      "word": "apple", "ipa": "ˈæp.əl", "stress": 0, "pos": "noun",
      "tr": { "kk": "алма", "ru": "яблоко" },
      "example": "I eat an *apple* every day.", "image": "gen:apple" },
    { "type": "image-callout", "voice": "v03", "image": "gen:apple-tree",
      "labels": [ { "at": [0.42, 0.30], "text": "branch — бұтақ" } ] },
    { "type": "quiz-pick", "q": "Which one is a fruit?",
      "options": [ {"t": "car"}, {"t": "apple", "ok": true}, {"t": "chair"} ] },
    { "type": "recap", "words": ["apple", "pear", "plum", "grape"] },
    { "type": "outro" }
  ],
  "transitions": { "default": "style", "beforeGame": "trans.shapeWipe" }
}
```

- `voice` — id клипа из `voice.jsx`; старты и длины считает уже существующий `kbTimeline`. Блок без голоса получает время по формуле удержания текста.
- `image: "gen:<slug>"` — взять из библиотеки ассетов или сгенерировать по style-prompt серии.
- `*слово*` в тексте — целевое слово, его подсветка привязывается к маркеру слова в голосе.
- Переход между блоками по умолчанию из стиля; перед игровым блоком — шторка в цвет квиза.

## 6. Инструменты MCP

| Инструмент | Что делает |
|---|---|
| `list_styles`, `get_style` | список стилей и итоговые токены после `extends` |
| `list_library` | что есть в библиотеке, по папкам, с параметрами |
| `apply_library` | один элемент библиотеки на слой или группу (как `apply_preset`, но со стилем) |
| `build_block` | один блок в текущем компе — для отладки раскладок |
| `build_lesson` | партитура → компы по форматам: голос, блоки, переходы, фон, затем audit |
| `gen_image` | генерация картинки по slug и style-prompt серии, `normalize`, запись в библиотеку ассетов |

`audit_animation` получает правила из 7.11: нет Easy Ease 33 %, текст в safe-зоне и не мельче минимума, контраст ≥ 4,5:1, текст не двигается во время удержания, удержание ≥ формулы, выход короче входа, запас разрешения картинок, idle ≤ 3 слоёв, каскад ≤ 700 мс, в каждом окне 4 с есть событие и не больше одного «громкого» на 4–6 с.

## 7. Порядок работ

1. **Фундамент:** `_base` и три стиля, `ease.json` с конвертером, загрузчик стилей в ките, `list_styles`.
2. **Примитивы:** `motion/`, `text/`, `lines/` — поверх существующих функций кита. Проверка: тестовый комп с каждым примитивом в трёх стилях, кадры через `get_frames`.
3. **Картинки и фоны:** `images/`, `backgrounds/`, `gen_image` с кэшем.
4. **Блоки:** `word`, `image-callout`, `quiz-pick`, `recap` в двух форматах, `build_block`.
5. **Сборка:** `build_lesson`, переходы, новые правила audit.
6. **Пилот:** один урок English 60–90 с в трёх стилях. Сверка чисел [П] на просмотре, правка токенов.
7. Остальные блоки, затем математика.

## Открытые вопросы

- Шрифты: нужны гарнитуры с казахской кириллицей и IPA. Inter и JetBrains Mono их покрывают — подтвердить, что они установлены в системе для AE.
- Генерация картинок: какая модель и style-prompt серии (плоская иллюстрация, 3D-клей, фото) — решить на пилоте.
- Где живёт библиотека: в `ae-plugin/kit` (общая для проектов, как кит) или отдельно. Предложение — в ките, ассеты в проекте серии.

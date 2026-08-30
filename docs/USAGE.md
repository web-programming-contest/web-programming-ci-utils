# Руководство по Web Programming CI Utils

Это руководство описывает установку, настройку и эксплуатацию
`web-programming-ci-utils`, подключение новых репозиториев курса, работу всех
CLI-скриптов, жизненный цикл студенческого pull request и диагностику ошибок.

## 1. Назначение системы

Система разделена на три типа репозиториев.

| Репозиторий                                                         | Назначение                                                                        | Кто изменяет                                                              |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `web-programming-ci-utils`                                          | Доверенная логика PR Gate, grader, задачи, контракты, отчёты и reusable workflows | Преподаватель                                                             |
| `web-programming-contest-template`                                  | Минимальный шаблон для создания репозиториев групп                                | Скрипты из `ci-utils` и преподаватель                                     |
| Репозиторий группы, например `web-programming-v2026-autumn-group-1` | Студенческие работы и два caller workflow                                         | Студенты внутри своих `surname.name/labN`; преподаватель — инфраструктуру |

В репозиторий группы не копируется реализация grader. Caller workflow получает
полный SHA опубликованного commit `ci-utils` и вызывает reusable workflow из
этого commit. Благодаря этому несколько групп используют одну версию проверок.

Основной поток данных:

```text
PR студента
    │
    ▼
caller workflow репозитория группы
    │ pinned full commit SHA
    ▼
reusable workflow из ci-utils
    ├── PR Gate
    ├── Docker grader
    └── GitHub Summary + artifacts
```

## 2. Требования

Для разработки и локального запуска `ci-utils` нужны:

- Git;
- Node.js `24.19.0`;
- npm и сохранённый в `ci-utils` `package-lock.json`;
- Docker — для безопасного запуска чужого студенческого кода;
- Chromium, установленный через Playwright, — только для прямого локального
  запуска браузерных проверок без Docker;
- доступ к GitHub API для определения автора первой принятой работы и
  формирования progress report.

Для публичного репозитория курса рекомендуется публичный `ci-utils`. Workflow
fork PR не получает secrets, поэтому приватный grader нельзя надёжно скачивать
из публичного курса обычным `GITHUB_TOKEN`. Для приватной схемы нужно отдельно
настроить доступ организации к reusable workflows и проверить fork-модель до
начала курса.

## 3. Установка `ci-utils`

```bash
git clone git@github.com:YOUR-ORG/web-programming-ci-utils.git
cd web-programming-ci-utils
npm ci
npm run validate
```

`npm ci` должен использовать сохранённый lock-файл. Не удаляйте
`package-lock.json`: Dockerfile также копирует его и выполняет `npm ci`.

Для прямого локального запуска lab1, lab4 или lab5 дополнительно установите
Chromium:

```bash
npm run setup:browser
```

Docker-образ устанавливает Chromium автоматически во время сборки.

## 4. Структура `ci-utils`

```text
web-programming-ci-utils/
├── pr-gate/                    # Проверка PR до запуска кода
├── docker-grader/
│   ├── checks/
│   │   ├── quality/            # Prettier, ESLint, Stylelint, HTML, TypeScript
│   │   ├── functions/          # Функциональные проверки lab2/lab3
│   │   ├── model/              # Модель и функции lab4
│   │   └── browser/            # Playwright для lab1/lab4/lab5
│   ├── config/                 # Канонические student-facing конфиги
│   ├── contracts/              # Тестовые данные и ожидаемые результаты
│   ├── tasks/                  # Задачи и variant → task
│   ├── runtime/                # Изоляция процессов и static server
│   ├── submission/             # Структурный контракт лабораторной
│   ├── Dockerfile
│   └── index.mjs               # Главный grader CLI
├── reports/                    # Summary, HTML и progress report
├── scripts/                    # Синхронизация и проверка контрактов
├── shared/                     # Общий parser CLI-аргументов
├── docs/
└── .github/workflows/          # Reusable workflows и собственный CI
```

## 5. Первичное подключение репозитория курса

### 5.1. Создание из template

Создайте новый репозиторий из `web-programming-contest-template` через GitHub
Template Repository либо скопируйте его содержимое. В новом репозитории должны
остаться только:

```text
.github/CODEOWNERS
.github/workflows/submission.yml
.github/workflows/progress-report.yml
.editorconfig
.gitignore
.htmlvalidate.json
.nvmrc
.prettierignore
.prettierrc.json
.stylelintrc.json
eslint.config.mjs
package.json
```

Проверьте `.github/CODEOWNERS` и замените команду maintainers на реальную
команду или GitHub login преподавателя.

Caller workflow template слушает PR в ветку `master`:

```yaml
on:
  pull_request:
    branches: [master]
```

Если default branch называется `main`, измените `branches` на `[main]` до
первого студенческого PR.

### 5.2. Закрепление grader

Reusable workflow всегда закрепляется полным 40-символьным SHA в двух местах:

```yaml
uses: YOUR-ORG/web-programming-ci-utils/.github/workflows/submission.yml@FULL_SHA
with:
  utils_repository: YOUR-ORG/web-programming-ci-utils
  utils_ref: 'FULL_SHA'
```

Не используйте `@main`, tag или короткий SHA. Полный SHA гарантирует, что
проверяемый PR не сможет незаметно изменить grader между запусками.

Вручную SHA обычно менять не нужно. После публикации `ci-utils` используйте:

```bash
npm run refs:update:courses -- \
  --repo ../web-programming-v2026-autumn-group-1 \
  --repo ../web-programming-v2026-autumn-group-2
```

Команда всегда обновляет template, затем каждый явно перечисленный репозиторий.
Помимо SHA и student-facing конфигов она переносит каноническое расписание
progress report из `scripts/workflow-refs.mjs`.

### 5.3. Настройки GitHub Actions

В репозитории курса:

1. Включите GitHub Actions.
2. Разрешите запуск workflows для pull request из fork.
3. Для первого PR нового внешнего участника оставьте ручное подтверждение
   запуска workflow.
4. Не добавляйте secrets в submission workflow.
5. Не заменяйте событие `pull_request` на `pull_request_target`.

Workflow использует только:

```yaml
permissions:
  contents: read
  pull-requests: read
```

### 5.4. Защита основной ветки

После первого тестового PR откройте правила защиты `master` или `main` и
настройте:

- обязательные CI checks, появившиеся в тестовом PR;
- минимум один approval преподавателя;
- сброс approval после нового push;
- обязательное разрешение обсуждений;
- запрет прямого push и force push;
- squash merge как основной способ принятия работы.

Названия required checks лучше выбирать из реально появившихся checks после
первого запуска, поскольку GitHub отображает reusable jobs с префиксом caller
workflow.

## 6. Канонические конфиги и синхронизация

Student-facing конфиги имеют единственный источник в
`docker-grader/config/`.

Расписание caller workflow `progress-report.yml` имеет отдельный канонический
источник в `scripts/workflow-refs.mjs`. Команды `template:sync` и
`refs:update:courses` переносят его в template; `refs:update:courses` также
переносит расписание во все явно переданные репозитории курсов.

| Источник в `ci-utils`  | Файл в template/курсе | Назначение                                      |
| ---------------------- | --------------------- | ----------------------------------------------- |
| `editorconfig`         | `.editorconfig`       | Кодировка, LF, отступы и финальная новая строка |
| `eslint.config.mjs`    | `eslint.config.mjs`   | Правила JavaScript/TypeScript                   |
| `gitignore`            | `.gitignore`          | Локальные зависимости, логи и IDE-файлы         |
| `htmlvalidate.json`    | `.htmlvalidate.json`  | Правила HTML Validate                           |
| `node-version`         | `.nvmrc`              | Версия Node.js                                  |
| `prettier.json`        | `.prettierrc.json`    | Форматирование кода и Markdown                  |
| `prettierignore`       | `.prettierignore`     | Исключения Prettier                             |
| `student-package.json` | `package.json`        | Команды и точные версии локальных инструментов  |
| `stylelint.json`       | `.stylelintrc.json`   | Правила CSS                                     |

### 6.1. Изменение конфигурации

Правильный порядок:

1. Изменить файл только в `ci-utils/docker-grader/config/`.
2. Запустить `npm run validate`.
3. Запустить `npm run template:sync` для проверки результата в template.
4. Закоммитить и отправить `ci-utils`.
5. Запустить `refs:update:courses` для template и всех репозиториев групп.
6. Просмотреть diff, закоммитить и отправить изменения каждого репозитория.

Не редактируйте копии конфигов в template вручную: следующая синхронизация их
перезапишет.

### 6.2. Что проверяет PR Gate

Перед проверкой студента PR Gate сравнивает девять конфигов base-ветки курса с
конфигами закреплённого commit grader. Если они различаются, выполнение
останавливается с сообщением:

```text
Course tooling is not synchronized with the pinned grader: ...
```

Это означает, что преподаватель обновил SHA отдельно от конфигов либо изменил
конфиги курса вручную. Нужно повторно запустить `refs:update:courses`.

## 7. Контракт студенческого PR

### 7.1. Название PR

Единственный допустимый формат:

```text
[TASK-N] variant_K surname.name
```

Пример:

```text
[TASK-2] variant_2 testov.oleg
```

Ограничения:

- `N` — номер лабораторной от 1 до 5;
- `K` — номер варианта от 1 до 40;
- `surname.name` — lowercase Latin;
- в частях фамилии и имени разрешён внутренний дефис;
- дополнительные слова, пробелы в начале/конце и другой регистр запрещены.

Допустимые slug:

```text
ivanov.ivan
petrov-sidorov.alexey
```

Недопустимые:

```text
Ivanov.Ivan
ivanov
иванов.иван
ivanov_ivan
```

### 7.2. Изменённые пути

Для PR `[TASK-2] variant_2 testov.oleg` разрешён только каталог:

```text
testov.oleg/lab2/
```

Проверяются и новое, и предыдущее имя переименованного файла. Поэтому нельзя
обойти gate переименованием чужого файла в свой каталог.

Запрещены:

- файлы вне единственного разрешённого каталога;
- `.git`, `.github`, `node_modules` и переходы `..` в пути;
- `package.json`, `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock` внутри
  сдачи;
- symlink;
- Git submodule;
- executable-файлы;
- изображения вне `assets/`.

Лимиты:

| Тип                     |  Лимит |
| ----------------------- | -----: |
| Обычный файл            |  1 MiB |
| Изображение в `assets/` |  5 MiB |
| Вся лабораторная        | 20 MiB |

Поддерживаемые бинарные изображения: AVIF, GIF, ICO, JPEG, PNG и WebP. SVG
считается текстовым файлом.

### 7.3. Обязательная структура лабораторных

Таблица описывает минимально обязательные файлы. Дополнительные компоненты
разрешены внутри текущего `surname.name/labN` при соблюдении ограничений путей.

| Лабораторная | Обязательные файлы                                                                                    |
| ------------ | ----------------------------------------------------------------------------------------------------- |
| lab1         | `README.md`, `index.html`, `styles.css`                                                               |
| lab2         | `README.md` и ровно один из `solution.js`, `solution.ts`                                              |
| lab3         | `README.md` и ровно один из `solution.js`, `solution.ts`                                              |
| lab4         | `README.md`, `index.html`, `styles.css`, ровно один `main.js/main.ts`, ровно один `model.js/model.ts` |
| lab5         | `README.md`, `index.html`, `styles.css`, ровно один `main.js/main.ts`                                 |

Файл `submission.json` запрещён. Вариант берётся только из названия PR.

### 7.4. README

Первая строка должна в точности соответствовать лабораторной:

```markdown
# Лабораторная работа 2
```

Далее должны ровно по одному разу и именно в таком порядке присутствовать
непустые разделы:

```markdown
## Задание

Описание задания.

## Реализация

Описание решения и ключевых решений.

## Запуск

Инструкция запуска.
```

HTML-комментарий или пустой code fence не считается содержимым раздела.

## 8. Как определяется вариант и задача

Источник соответствия — `docker-grader/tasks/variants.json`.

Для каждой лабораторной хранится массив из 40 task ID. Номер варианта
однобазовый:

```text
taskId = variants.labs[lab][variant - 1]
```

Затем task ID разрешается в метаданные из `tasks/labN.json`. Для lab2/lab3 там
указан обязательный именованный ESM export.

Пример:

```text
[TASK-2] variant_2 testov.oleg
          │       │
          │       └── каталог testov.oleg/lab2
          └── variants.labs["2"][1] = "to-roman"
                                      exportName = "toRoman"
```

Студент должен экспортировать функцию по имени:

```js
export function toRoman(value) {
  // Реализация.
}
```

`default export`, другое имя или функция без `export` контракт не выполняют.

## 9. Привязка slug, GitHub-пользователя и варианта

Отдельного реестра студентов нет.

Для первого PR slug ещё отсутствует в истории основной ветки. Gate использует
автора текущего PR и вариант из title, а в Summary помечает сдачу как первую.
Преподаватель должен сверить вариант со своей таблицей перед merge.

После squash merge каталог появляется в основной ветке. Для следующих работ
gate:

1. Находит историю commit для `surname.name` от старых к новым.
2. Через GitHub API получает PR, связанные с commit.
3. Находит первый merged PR с валидным title и тем же slug.
4. Запоминает автора PR и вариант.
5. Сравнивает их с текущим PR.

Другой GitHub-пользователь или другой вариант после первой принятой работы
приводят к немедленному отказу.

## 10. Последовательность CI для студенческого PR

### 10.1. Caller workflow

События запуска:

- PR открыт;
- PR переоткрыт;
- в PR отправлен новый commit;
- изменено название PR.

Concurrency отменяет старый незавершённый run того же PR после нового push.

### 10.2. Job `Structural contract`

По порядку выполняется:

1. Проверка полного SHA grader.
2. Checkout доверенного `ci-utils` по SHA.
3. Checkout полной истории base-ветки курса.
4. Checkout head commit студента из fork.
5. Проверка синхронизации конфигов курса.
6. Разбор PR title.
7. Получение изменённых файлов через GitHub API.
8. Проверка единственного разрешённого каталога.
9. Проверка обязательных файлов и README.
10. Разрешение `lab/variant/task`.
11. Проверка Git tree, типов и размеров файлов.
12. Определение привязки GitHub login и варианта.
13. Передача `lab`, `variant`, `submission_dir` следующему job.

Если gate падает, Docker grader не запускается.

### 10.3. Job `Trusted grader`

1. Повторно checkout доверенного grader и head commit студента.
2. Создаётся каталог диагностики.
3. Собирается Docker image из доверенного commit.
4. Контейнер запускается без сети и с ограничениями.
5. Выполняются quality и task-specific проверки.
6. Создаются `summary.json` и browser artifacts.
7. Доверенный renderer создаёт `report.md`.
8. Таблица добавляется в GitHub Job Summary.
9. Ошибки публикуются как annotations.
10. Вся диагностика загружается как artifact.

### 10.4. Изоляция контейнера

CI запускает контейнер со следующими ограничениями:

- `--network none`;
- read-only root filesystem;
- submission примонтирован read-only;
- отдельный writable volume только для результатов;
- удалены Linux capabilities;
- `no-new-privileges`;
- максимум 256 процессов;
- 1 GiB памяти;
- 2 CPU;
- ограниченные tmpfs для `/tmp` и `/dev/shm`;
- UID/GID текущего runner;
- из environment передаётся только безопасный `HOME`;
- scripts из студенческого `package.json` не выполняются.

## 11. Проверки grader

### 11.1. Общие quality checks

Все лабораторные проходят применимые проверки в следующем порядке.

| Этап          | Какие файлы               | Что проверяет                                                                           |
| ------------- | ------------------------- | --------------------------------------------------------------------------------------- |
| Prettier      | Все текстовые файлы сдачи | Соответствие `docker-grader/config/prettier.json`                                       |
| ESLint        | `.js`, `.mjs`, `.ts`      | Recommended JS/TS, browser globals, zero warnings и дополнительные code-style правила   |
| Stylelint     | `.css`                    | Standard CSS и ограничения селекторов/`!important`                                      |
| HTML Validate | `.html`                   | Валидная и семантическая HTML-разметка, обязательные атрибуты, отсутствие inline styles |
| TypeScript    | `.ts`                     | `tsc --noEmit --strict`, ES2022, DOM и Bundler module resolution                        |

Если подходящих файлов нет, этап помечается `Skipped`, а не `Failed`. Падение
одного quality check не останавливает остальные: студент получает список всех
обнаруженных проблем за один run.

### 11.2. Lab1

После quality checks запускается Chromium. Общие проверки:

- страница открывается;
- `body` видим;
- локальные ресурсы загружаются без HTTP 4xx/5xx;
- нет ошибок `console.error` и `pageerror`;
- нет недопустимого горизонтального overflow.

Общий контракт намеренно не требует определённый `title`, HTML-тег или
интерактивный элемент: такие требования применяются только тогда, когда они
есть в описании конкретного варианта.

Затем загружается контракт конкретной задачи из
`contracts/lab1/<task-id>.json`. Он может проверять:

- наличие, количество и видимость элементов;
- текст и атрибуты;
- computed styles и геометрию;
- hover/focus;
- responsive layout на нескольких viewport;
- специализированные правила формы, таблицы, карточек, флагов и layout.

### 11.3. Lab2 и lab3

Browser check не запускается. Grader импортирует `solution.js` или
`solution.ts` как ES module и находит именованный export из метаданных задачи.

Для каждого case из `contracts/lab2` или `contracts/lab3` проверяются входные
данные и ожидаемый результат. Дополнительно:

- Promise запрещён для синхронного контракта;
- входные аргументы не должны изменяться;
- повторяемые случайные проверки выполняются указанное контрактом число раз;
- при необходимости системное время фиксируется;
- поддерживаются проверки точного результата, регулярного выражения,
  перестановки, unordered-коллекций и специальных свойств результата.

Контракты содержат тестовые данные, но не содержат эталонной реализации.

### 11.4. Lab4

Сначала отдельно импортируется `model.js/model.ts` и проверяется:

- обязательный именованный export класса;
- constructor и начальное состояние;
- обязательные методы и изменения состояния;
- функции работы с коллекциями;
- наличие возвращаемого значения у query-функций.

Query-функции могут быть синхронными или асинхронными. Grader не запрещает им
изменять переданную коллекцию, поскольку общего требования о неизменяемости в
методичке нет.

Затем Chromium проверяет приложение:

- единственный список сущностей и форму;
- обязательные поля формы;
- добавление сущности через асинхронный `setTimeout`;
- обновление DOM только после асинхронной операции;
- сохранение и восстановление из `localStorage`;
- асинхронное удаление из DOM и `localStorage`.

Если используется `main.ts`, grader собирает его через esbuild в ESM `main.js`
и временно подменяет ссылку в подготовленной копии `index.html`.

### 11.5. Lab5

После общих quality checks Chromium проверяет:

- единственный корневой элемент приложения;
- обязательные `data-testid` конкретной задачи;
- один или несколько пользовательских сценариев;
- click, fill, select, keyboard, drag-and-drop, reload;
- изменение текста, значения, атрибута, количества элементов или визуального
  состояния;
- изменение `localStorage`;
- ожидание асинхронного результата в пределах contract timeout.

## 12. Отчёты и артефакты

### 12.1. GitHub Summary

После grader workflow всегда запускает renderer. В Summary отображаются:

- лабораторная, вариант и задача;
- ожидаемый export, если применимо;
- общее время;
- таблица всех этапов со статусом и временем;
- stdout/stderr каждого упавшего этапа;
- ошибка инфраструктуры, если grader не успел создать `summary.json`.

Каждая упавшая проверка также создаёт GitHub annotation. Поэтому краткая
причина видна из PR → Checks без write-token и без комментария от bot.

### 12.2. Artifact `grader-results-<PR number>`

Artifact хранится 14 дней и может содержать:

```text
docker-build.log
docker-run.log
summary.json           # Машиночитаемый общий результат
failure.json           # Если grader завершился до штатного summary
report.md              # Человекочитаемый отчёт
site/                  # Подготовленная копия браузерного приложения
browser/
├── result.json
├── index.html          # Автономный HTML-отчёт
├── page.png            # Screenshot успешной проверки
├── failure.png         # Screenshot при падении
└── trace.zip           # Playwright trace при падении
```

Не каждый файл присутствует в каждом run. Например, `trace.zip` сохраняется
только при browser failure.

### 12.3. Просмотр Playwright trace

После скачивания artifact:

```bash
npx playwright show-trace path/to/trace.zip
```

## 13. Progress report

Progress report сканирует основную ветку курса. Каталог лабораторной считается
принятым, если он находится в основной ветке и удовлетворяет обязательной
структуре. Это предполагает, что преподаватель merge-ит только защищённые
работы.

Полностью отсутствующий каталог `surname.name/labN` считается несданной работой
и отображается как `—`. Если каталог существует, но обязательных файлов нет,
отчёт считает это ошибкой структуры и добавляет строку с предупреждением.
Progress report не запускает функциональные или браузерные контракты повторно:
статус принятой работы опирается на структуру основной ветки и правило, что в неё
merge-ятся только успешно проверенные PR.

Для каждого slug определяется:

- GitHub login из первого merged PR;
- закреплённый вариант;
- наличие lab1…lab5;
- дата первого commit, в котором появилась лабораторная;
- количество принятых работ;
- проблемы истории или структуры.

Reusable workflow создаёт:

```text
progress.md
progress.csv
progress.json
```

Markdown попадает в Job Summary, все три файла — в artifact `progress-report`
на 90 дней.

Для ручного запуска откройте репозиторий курса на GitHub, выберите
**Actions → Progress report → Run workflow** и нужную основную ветку. Это
предпочтительный способ построить отчёт непосредственно по удалённому
репозиторию: workflow сам получает полный checkout и токен с правами
`contents: read` и `pull-requests: read`.

Caller workflow template запускается вручную и по расписанию:

```yaml
on:
  workflow_dispatch:
  schedule:
    - cron: '30 0 * * 1'
      timezone: 'Europe/Moscow'
```

Workflow запускается один раз в неделю, в ночь с воскресенья на понедельник,
примерно в `00:30` по московскому времени. Явный IANA timezone
`Europe/Moscow` делает расписание независимым от UTC-смещения. GitHub Actions
может запустить scheduled workflow с небольшой задержкой при высокой нагрузке.

## 14. Полный справочник npm-скриптов `ci-utils`

Все команды запускаются из корня `web-programming-ci-utils`.

### `npm run gate`

Запускает PR Gate напрямую:

```bash
npm run gate -- \
  --event /path/to/event.json \
  --base-root /path/to/course-base \
  --head-root /path/to/submission
```

Аргументы:

| Аргумент               | Обязательность                      | Значение по умолчанию            |
| ---------------------- | ----------------------------------- | -------------------------------- |
| `--event PATH`         | Нужен, если нет `GITHUB_EVENT_PATH` | `GITHUB_EVENT_PATH`              |
| `--base-root PATH`     | Нет                                 | Текущий каталог                  |
| `--head-root PATH`     | Нет                                 | Текущий каталог                  |
| `--changed-files PATH` | Нет                                 | GitHub API из `pull_request.url` |

`--changed-files` должен указывать на JSON-массив объектов GitHub формата,
содержащих как минимум `filename`, а для rename — `previous_filename`.

Используемые environment variables:

- `GITHUB_EVENT_PATH`;
- `GITHUB_TOKEN`;
- `GITHUB_OUTPUT` — запись `lab`, `variant`, `submission_dir`;
- `GITHUB_STEP_SUMMARY` — Summary gate.

### `npm run grade`

Запускает главный grader:

```bash
npm run grade -- \
  --submission /absolute/path/ivanov.ivan/lab2 \
  --lab 2 \
  --variant 7 \
  --results /absolute/path/grader-results
```

Аргументы:

| Аргумент            | Обязательность | Описание                        |
| ------------------- | -------------- | ------------------------------- |
| `--submission PATH` | Да             | Каталог одной лабораторной      |
| `--lab N`           | Да             | Целое число 1…5                 |
| `--variant K`       | Да             | Целое число 1…40                |
| `--results PATH`    | Нет            | По умолчанию `./grader-results` |

Предупреждение: эта команда импортирует и выполняет код напрямую на текущей
машине. Студент может использовать её для собственного кода. Преподаватель не
должен запускать непроверенный чужой код так — используйте Docker или GitHub CI.

### `npm run report`

Формирует отчёт прогресса. `--root` принимает путь к полному локальному Git
checkout курса, а не URL удалённого репозитория.

Вывод Markdown в stdout:

```bash
npm run report -- --root /path/to/course
```

Один формат в файл:

```bash
npm run report -- \
  --root /path/to/course \
  --repository YOUR-ORG/course-repo \
  --format csv \
  --output /tmp/progress.csv
```

Все форматы за один проход:

```bash
npm run report -- \
  --root /path/to/course \
  --output-dir /tmp/progress
```

Для публичного репозитория команда может выполняться без `GITHUB_TOKEN`. Чтобы
построить отчёт по удалённому репозиторию, сначала клонируйте его вместе со всей
историей, затем передайте путь в `--root`:

```bash
REPORT_ROOT=$(mktemp -d)
git clone https://github.com/YOUR-ORG/course-repo.git "$REPORT_ROOT/course"
npm run report -- \
  --root "$REPORT_ROOT/course" \
  --repository YOUR-ORG/course-repo \
  --output-dir "$REPORT_ROOT/progress"
```

Не используйте shallow clone (`--depth 1`): даты принятия определяются по
истории коммитов. Для приватного репозитория самому `git clone` потребуются
настроенные Git credentials, даже если генератор запускается без
`GITHUB_TOKEN`.

Аргументы:

| Аргумент                       | Описание                                                         |
| ------------------------------ | ---------------------------------------------------------------- |
| `--root PATH`                  | Полный Git checkout курса; по умолчанию текущий каталог          |
| `--repository OWNER/REPO`      | Репозиторий для GitHub API; иначе `GITHUB_REPOSITORY` или origin |
| `--format markdown\|csv\|json` | Формат одного результата; default `markdown`                     |
| `--output PATH`                | Записать один результат вместо stdout                            |
| `--output-dir PATH`            | Сразу создать `progress.md/csv/json`                             |

`--output-dir` нельзя комбинировать с `--format` или `--output`.
`--repository` можно не указывать, если `OWNER/REPO` корректно определяется из
`origin`. Без `GITHUB_TOKEN` публичный GitHub API имеет низкий rate limit; при
его исчерпании отчёт сохранит состояние лабораторных, но может не определить
GitHub login или вариант. Для стабильного результата рекомендуется передать
`GITHUB_TOKEN` через environment variable.

### `npm run refs:update:courses`

Обновляет template и перечисленные репозитории курса:

```bash
npm run refs:update:courses -- \
  --repo ../group-1 \
  --repo ../group-2
```

Для каждого target:

1. Находит ровно один full SHA в `uses:` файла `submission.yml`.
2. Находит ровно один `utils_ref` в этом файле.
3. Повторяет проверку для `progress-report.yml`.
4. Заменяет четыре значения на новый SHA.
5. Синхронизирует каноническое расписание progress report.
6. Синхронизирует девять student-facing конфигов.

Опции:

| Опция            | Описание                                           |
| ---------------- | -------------------------------------------------- |
| `--repo PATH`    | Добавить локальный checkout курса; можно повторять |
| `--sha FULL_SHA` | Использовать заданный полный SHA вместо `HEAD`     |
| `--allow-dirty`  | Разрешить брать `HEAD` при dirty worktree          |
| `--help`         | Показать встроенную справку                        |

Без `--repo` обновляется только sibling
`../web-programming-contest-template`.

По умолчанию dirty `ci-utils` запрещён. Это защищает от типичной ошибки, когда
workflow закрепляется на `HEAD`, но ожидаемые изменения существуют только в
working tree и отсутствуют в этом commit.

`--allow-dirty` не добавляет незакоммиченные изменения в SHA. Используйте его
только для локальной диагностики. Для публикации сначала commit и push.

Скрипт не выполняет `git add`, commit, push, clone или pull.

### `npm run refs:update:test`

Работает как `refs:update:courses`, но предназначен для тестовых репозиториев.

Без `--repo` проверяет два стандартных пути и обновляет существующие caller
repositories:

```text
../web-programming-ci-test
../workdir/web-programming-ci-test
```

Явный путь:

```bash
npm run refs:update:test -- --repo ../web-programming-ci-test
```

Поддерживает те же `--sha`, `--repo`, `--allow-dirty`, `--help`.

### `npm run template:sync`

Копирует каноническое расписание progress report и девять конфигов в sibling
directory:

```text
../web-programming-contest-template
```

```bash
npm run template:sync
```

Скрипт обновляет расписание в существующем `progress-report.yml` и записывает
только отсутствующие или отличающиеся mapped-файлы. Он не обновляет SHA workflow
и не удаляет посторонние файлы.

### `npm run contracts:check`

```bash
npm run contracts:check
```

Проверяет все 200 сочетаний `5 лабораторных × 40 вариантов`:

- корректность task bank;
- существование task ID;
- существование соответствующего контракта;
- schema функциональных cases;
- model/query contracts lab4;
- browser contracts lab1/lab4/lab5;
- lab5 commands и expectations.

Эта команда не запускает студенческие решения и Chromium.

### `npm run setup:browser`

```bash
npm run setup:browser
```

Выполняет `playwright install chromium`. Нужен для прямого запуска browser
grader на машине разработчика. Для Docker отдельно не требуется.

### `npm run format:check`

```bash
npm run format:check
```

Проверяет форматирование самого `ci-utils`, не изменяя файлы.

Для исправления форматирования разработчик может вызвать напрямую:

```bash
npx prettier --write .
```

### `npm run lint`

```bash
npm run lint
```

Запускает ESLint для исходного кода самого `ci-utils` с запретом warnings.

### `npm run validate`

```bash
npm run validate
```

Последовательно выполняет:

```text
format:check → lint → contracts:check
```

Это обязательная локальная проверка перед commit `ci-utils`. Собственный GitHub
Actions workflow дополнительно собирает Docker image.

## 15. Внутренние CLI entrypoint

Обычно их вызывает главный grader или workflow, но они полезны для диагностики.

| Entry point                              | Назначение                                               | Основные аргументы                          |
| ---------------------------------------- | -------------------------------------------------------- | ------------------------------------------- |
| `reports/github-summary.mjs`             | Преобразовать результаты grader в Markdown и annotations | `--results PATH`                            |
| `docker-grader/checks/functions/run.mjs` | Только lab2/lab3 functional contracts                    | `--lab`, `--variant`, `--solution`          |
| `docker-grader/checks/model/run.mjs`     | Только model contract lab4                               | `--variant`, `--model`                      |
| `docker-grader/checks/browser/run.mjs`   | Только Playwright suite                                  | `--lab`, `--variant`, `--site`, `--results` |
| `scripts/update-course-refs.mjs`         | Реализация `refs:update:courses`                         | См. раздел выше                             |
| `scripts/update-ci-test-ref.mjs`         | Реализация `refs:update:test`                            | См. раздел выше                             |
| `scripts/sync-template.mjs`              | Реализация `template:sync`                               | Без аргументов                              |
| `scripts/validate-contracts.mjs`         | Реализация `contracts:check`                             | Без аргументов                              |

CLI parser принимает `--name value` и `--name=value`. Повтор одного обычного
аргумента считается ошибкой. Исключение — специализированный parser update
scripts, где `--repo` специально разрешено повторять.

## 16. Команды из template для студентов

После клонирования курса:

```bash
npm install
```

Студент запускает инструменты только на своём каталоге:

```bash
npm run format -- surname.name/labN
npm run format:check -- surname.name/labN
npm run lint:js -- surname.name/labN
npm run lint:css -- "surname.name/labN/**/*.css"
npm run lint:html -- "surname.name/labN/**/*.html"
```

| Команда        | Действие                            |
| -------------- | ----------------------------------- |
| `format`       | Перезаписывает файлы через Prettier |
| `format:check` | Только проверяет Prettier           |
| `lint:js`      | ESLint с zero warnings              |
| `lint:css`     | Stylelint                           |
| `lint:html`    | HTML Validate                       |

Эти команды помогают до push, но не заменяют task-specific контракты grader.

## 17. Безопасный локальный запуск через Docker

Собрать image:

```bash
docker build \
  --file docker-grader/Dockerfile \
  --tag course-grader:local \
  .
```

Подготовить writable results directory и запустить одну работу:

```bash
mkdir -p /tmp/course-grader-results

docker run --rm \
  --network none \
  --read-only \
  --cap-drop ALL \
  --security-opt no-new-privileges \
  --pids-limit 256 \
  --memory 1g \
  --cpus 2 \
  --tmpfs /tmp:rw,nosuid,nodev,size=256m \
  --tmpfs /dev/shm:rw,nosuid,nodev,size=512m \
  --user "$(id -u):$(id -g)" \
  --env HOME=/tmp/home \
  --volume "/absolute/course:/workspace/submission:ro" \
  --volume "/tmp/course-grader-results:/workspace/grader-results:rw" \
  course-grader:local \
  node docker-grader/index.mjs \
  --submission /workspace/submission/surname.name/lab2 \
  --lab 2 \
  --variant 2 \
  --results /workspace/grader-results
```

Используйте абсолютный путь в `--volume`. На macOS/Windows синтаксис UID/GID и
mount может отличаться; GitHub CI использует Linux.

## 18. Обновление задач и контрактов

Человекочитаемый каталог текущих task contract также находится в
[TASK_CONTRACTS.md](TASK_CONTRACTS.md). После изменения банка сверяйте этот
документ с JSON-контрактами и обновляйте его, если публичная спецификация задачи
изменилась.

### 18.1. Изменение существующей задачи

1. Найдите task ID в `docker-grader/tasks/labN.json`.
2. Найдите варианты в `docker-grader/tasks/variants.json`.
3. Измените декларативный контракт:
   - lab1: `contracts/lab1/<task-id>.json`;
   - lab2/lab3: `contracts/labN/<task-id>.json`;
   - lab4: `contracts/lab4/models.json`, `queries.json` и metadata задачи;
   - lab5: `contracts/lab5/scenarios.json`.
4. Выполните `npm run validate`.
5. Для browser-задачи выполните релевантный локальный или Docker smoke run.
6. Commit/push `ci-utils` и обновите SHA репозиториев курса.

### 18.2. Добавление task ID

Task ID должен состоять из lowercase Latin, цифр и дефисов и быть уникальным
в своей лабораторной. После добавления metadata создайте контракт и добавьте ID
в нужные позиции `variants.json`.

Длина каждого массива лабораторной должна быть ровно `variantCount`.

### 18.3. Изменение количества вариантов

Измените `variantCount` и одновременно длину массивов всех пяти лабораторных.
Затем добавьте необходимые контракты и выполните:

```bash
npm run contracts:check
```

## 19. Выпуск новой версии grader

Рекомендуемый release-процесс:

```bash
cd web-programming-ci-utils
npm ci
npm run validate
docker build --file docker-grader/Dockerfile --tag course-grader:release-check .
git diff --check
git add .
git commit -m "Describe grader change"
git push

npm run refs:update:courses -- \
  --repo ../group-1 \
  --repo ../group-2
```

После команды обновления:

1. Проверьте diff template и каждой группы.
2. Убедитесь, что `uses@SHA` и `utils_ref` одинаковы.
3. Убедитесь, что новый SHA существует в remote `ci-utils`.
4. Commit/push template.
5. Создайте `[MAINTENANCE] ...` PR в каждый активный репозиторий курса.
6. После merge перезапустите один тестовый студенческий PR.

Maintenance PR распознаётся только если:

- он открыт из ветки того же репозитория, не из fork;
- title начинается с `[MAINTENANCE] `.

Для него студенческий gate/grader пропускаются, а закреплённый `ci-utils`
проходит `npm ci` и `npm run validate`.

## 20. Приёмка работы преподавателем

Рекомендуемый порядок:

1. Убедиться, что `Structural contract` и `Trusted grader` зелёные.
2. Открыть Summary и проверить все строки таблицы.
3. Посмотреть diff и задать вопросы по конкретному коду.
4. Попросить небольшое live-изменение.
5. Дождаться нового зелёного run после push.
6. Approve.
7. Выполнить squash merge.

Зелёный CI означает допуск к защите, а не автоматическую оценку понимания,
авторства, архитектуры или субъективного качества интерфейса.

## 21. Диагностика типовых проблем

### Action не запустился

Проверьте:

- caller workflow уже находится в default branch;
- PR направлен в ветку из `branches: [...]`;
- событие входит в `opened/reopened/synchronize/edited`;
- GitHub Actions включён;
- запуск fork PR не ожидает ручного approval;
- YAML находится в `.github/workflows/`;
- reusable `uses` содержит существующий полный SHA.

### `utils_ref must be a full lowercase 40-character commit SHA`

В workflow указан branch, tag, короткий SHA или uppercase SHA. Запустите
`refs:update:courses` после commit/push `ci-utils`.

### `Course tooling is not synchronized with the pinned grader`

SHA и корневые конфиги курса обновлены раздельно. Повторно выполните
`refs:update:courses -- --repo PATH` и закоммитьте весь diff.

### `File outside the only allowed directory`

PR содержит файл вне `surname.name/labN`. Частая причина — лабораторная создана
как `lab2/` в корне вместо `surname.name/lab2/` либо в PR случайно попал
конфигурационный файл.

### `Expected named ESM export`

Название export не соответствует задаче выбранного варианта. Проверьте
`tasks/variants.json`, metadata lab и title PR. Используйте именованный export,
не `default`.

### Prettier показывает README и solution

Это отдельный quality check, а не ошибка ESLint. Запустите:

```bash
npm run format -- surname.name/labN
```

После исправления проверьте diff: Prettier может перенести длинные строки
Markdown и изменить пробелы в JavaScript.

### Вывод одного этапа отображается под другим

Актуальный grader направляет captured stdout/stderr в один упорядоченный поток.
Если проблема остаётся, проверьте SHA: вероятно, курс закреплён на старом
commit `ci-utils`.

### Report создан, но его не видно

Откройте конкретный Actions run и вкладку Summary. Краткие причины также видны
как annotations в PR → Checks. Полные файлы находятся в artifact
`grader-results-<PR number>`.

Если step `Render check summary` отсутствует, используется старый SHA. Если step
упал, скачайте artifact и проверьте `summary.json`, `failure.json` и Docker logs.

### Docker не находит Node image

Проверьте, что используется актуальный Dockerfile с существующим tag и pinned
digest. Затем обновите SHA курса. Самостоятельное удаление lock-файла проблему
image не исправляет и ломает `COPY package.json package-lock.json`.

### `package-lock.json: not found`

Lock-файл удалён из `ci-utils`, хотя Dockerfile требует его. Восстановите
`package-lock.json`, выполните `npm ci` и закоммитьте его.

### Vite/Vitest пытается писать в read-only `node_modules`

Это признак старой версии grader, использовавшей runtime bundling через Vite.
Обновите pinned SHA. Текущие functional contracts запускаются напрямую и не
должны создавать `.vite-temp`.

### Browser validation упал

Скачайте artifact и последовательно изучите:

1. `browser/index.html`;
2. `browser/failure.png`;
3. `browser/result.json`;
4. `browser/trace.zip` через `playwright show-trace`;
5. `docker-run.log`.

### Progress report не определяет автора или вариант

Проверьте, что:

- работа попала в main/master через merged PR;
- title первого принятого PR соответствовал контракту;
- squash commit связан с PR в GitHub;
- workflow имеет `pull-requests: read`;
- API token не исчерпал rate limit;
- локальный запуск получил `GITHUB_TOKEN` и правильный `--repository`.

### Progress report показывает ошибку у несданной лабораторной

Полностью отсутствующий каталог лабораторной должен отображаться как `—` без
предупреждения. Предупреждение означает, что каталог уже существует в основной
ветке, но не удовлетворяет обязательной структуре. Проверьте tracked-файлы
внутри `surname.name/labN`: частично добавленный `README.md`, `.gitkeep` или
другой файл превращает каталог в существующую, но некорректную сдачу.

### Update script сообщает dirty worktree

Это штатная защита. Закоммитьте изменения `ci-utils`, затем повторите команду.
Не используйте `--allow-dirty` для release: SHA всё равно указывает только на
последний commit.

## 22. Что система намеренно не делает

- не определяет использование ИИ;
- не доказывает авторство работы;
- не оценивает понимание решения;
- не выставляет итоговую оценку;
- не merge-ит PR автоматически;
- не запускает студенческий `package.json`;
- не хранит отдельный реестр студентов;
- не раздаёт варианты;
- не обновляет удалённые репозитории без локального checkout, commit и push.

Эти ограничения являются частью модели: CI проверяет объективный контракт, а
преподаватель проводит защиту и принимает решение о merge.

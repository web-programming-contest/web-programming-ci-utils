# Web Programming CI Utils

Центральный доверенный grader для автоматизированной приёмки лабораторных работ. Репозиторий содержит CLI, открытый банк задач, декларативные контракты, ограниченный Docker runtime и reusable GitHub Actions workflows. Работы студентов здесь не хранятся.

## Состав

```text
web-programming-ci-utils/
├── pr-gate/                  # Проверка PR до запуска студенческого кода
│   ├── title.mjs             # Формат названия и lab/variant/student
│   ├── changed-files.mjs     # Разрешённый каталог и безопасные Git-объекты
│   ├── identity.mjs          # Привязка slug к GitHub-пользователю и варианту
│   ├── github.mjs            # Чтение PR через GitHub API
│   ├── git.mjs               # Чтение истории и дерева Git
│   └── index.mjs             # CLI и оркестрация PR Gate
├── docker-grader/            # Проверки внутри ограниченного контейнера
│   ├── checks/
│   │   ├── quality/          # Prettier, ESLint, Stylelint, HTML Validate, TypeScript
│   │   ├── functions/        # Функциональные проверки lab2/lab3
│   │   └── browser/          # Браузерные проверки lab1/lab4/lab5
│   ├── config/               # Доверенные конфиги статических проверок
│   ├── contracts/labN/       # Входы и ожидаемые результаты по задачам
│   ├── tasks/                # Банк задач и соответствие variant → task
│   ├── runtime/              # Запуск процессов, сбор файлов и локальный сервер
│   ├── submission/           # Контракт структуры сдаваемой лабораторной
│   ├── Dockerfile
│   └── index.mjs             # CLI и оркестрация grader
├── reports/
│   ├── github-summary.mjs    # Таблица для GitHub Job Summary
│   ├── output.mjs            # summary.json и GitHub output
│   ├── browser-html.mjs      # HTML-отчёт браузерных проверок
│   ├── browser-artifacts.mjs # Screenshot и Playwright trace
│   └── progress.mjs          # Прогресс группы в Markdown/CSV/JSON
├── shared/                   # Общий разбор аргументов CLI
└── .github/workflows/        # Reusable workflows и CI самого utils-репозитория
```

## Публикация

Опубликуйте содержимое этой директории как отдельный репозиторий `YOUR-ORG/web-programming-ci-utils`. Для публичного репозитория курса utils также должен быть публичным: fork PR не получает пользовательские secrets, а токен workflow ограничен репозиторием курса.

После публикации получите полный SHA проверенного коммита:

```bash
git rev-parse HEAD
```

Этот SHA нужно дважды указать в каждом caller workflow репозитория курса: после `@` в `uses` и в `utils_ref`. Вызов по ветке `@main` не допускается.

## Локальный запуск

Требуется Node.js `24.19.0`.

```bash
npm ci
npm run grade -- --submission /path/to/course/ivanov.ivan/lab2 --lab 2 --variant 7
```

Для lab1, lab4 и lab5 перед первым запуском установите Chromium:

```bash
npm run setup:browser
```

Проверка форматирования и линтеров самого utils-репозитория:

```bash
npm run validate
```

## Отчёт CI

После запуска grader формирует `summary.json` и человекочитаемый `report.md`.
Тот же отчёт выводится в GitHub Actions Job Summary: таблица показывает статус
и время каждого этапа, а ниже раскрывается stdout/stderr каждого упавшего этапа.
Проверки продолжаются после отдельного падения, поэтому один запуск показывает
сразу все найденные проблемы. Docker build/run логи, браузерные screenshot,
trace и HTML-report загружаются в artifact `grader-results-<PR number>`.

Каждая задача lab1 имеет отдельный браузерный контракт, а каждая функция
lab2/lab3 — отдельный JSON-набор входов и результатов. Выбранный контракт и
связь варианта с задачей валидируются непосредственно во время сдачи. Для
lab4/lab5 пока действует общий browser smoke contract.

Google-style конфиги, которые CI использует для проверки работ, находятся в
`docker-grader/config/`.

Открытые контракты задач находятся в [docs/TASK_CONTRACTS.md](docs/TASK_CONTRACTS.md).

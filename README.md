# Web Programming CLI Utils

Центральный доверенный grader для автоматизированной приёмки лабораторных работ. Репозиторий содержит CLI, открытый банк задач, тесты, ограниченный Docker runtime и reusable GitHub Actions workflows. Работы студентов здесь не хранятся.

## Состав

- `.github/workflows/submission.yml` — reusable workflow проверки pull request;
- `.github/workflows/progress-report.yml` — reusable workflow отчёта по репозиторию курса;
- `.github/workflows/ci.yml` — собственная проверка изменений utils;
- `grader/src` — structural gate, grader и генератор отчётов;
- `grader/tasks` — единый банк вариантов lab2/lab3;
- `grader/tests` — функциональные и браузерные контракты;
- `grader/Dockerfile` — воспроизводимое изолированное окружение.

## Публикация

Опубликуйте содержимое этой директории как отдельный репозиторий `YOUR-ORG/web-programming-cli-utils`. Для публичного репозитория курса utils также должен быть публичным: fork PR не получает пользовательские secrets, а токен workflow ограничен репозиторием курса.

После публикации получите полный SHA проверенного коммита:

```bash
git rev-parse HEAD
```

Этот SHA нужно дважды указать в каждом caller workflow репозитория курса: после `@` в `uses` и в `utils_ref`. Вызов по ветке `@main` не допускается.

## Локальный запуск

Требуется Node.js `24.20.0`.

```bash
npm ci
npm run grade -- --submission /path/to/course/ivanov.ivan/lab2 --lab 2 --variant 7
```

Для lab1, lab4 и lab5 перед первым запуском установите Chromium:

```bash
npm run setup:browser
```

Полная самопроверка utils:

```bash
npm run validate
```

Открытые контракты задач находятся в [docs/TASK_CONTRACTS.md](docs/TASK_CONTRACTS.md).

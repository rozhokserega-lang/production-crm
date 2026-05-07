# Docker для новичка: зачем нужен и как пользоваться

Эта инструкция объясняет Docker в проекте Production CRM простыми словами: что это даёт, как один раз настроить окружение и какие команды запускать каждый день.

## 1. Зачем вообще нужен Docker

Docker — это способ запускать проект не напрямую на компьютере разработчика, а внутри отдельного контейнера.

Контейнер можно представить как маленькую изолированную систему, где уже задано:

- какая версия Node.js используется;
- как устанавливаются зависимости;
- как запускается frontend;
- как выполняются проверки и сборка.

Главная польза: у разных людей проект работает одинаково. Не важно, какая версия Node.js стоит локально на Windows, какие пакеты были установлены раньше и какие настройки есть в системе.

В этом проекте Docker нужен для frontend-части из папки `fronted/`.

## 2. Какие Docker-файлы есть в проекте

- `docker-compose.yml` — главный файл запуска. В нём описаны сервисы `web` и `web-preview`.
- `fronted/Dockerfile` — инструкция, как собрать Docker-образ frontend-приложения.
- `fronted/.dockerignore` — список файлов, которые не надо отправлять внутрь Docker-сборки.
- `fronted/nginx/default.conf` — настройки Nginx для проверки production-сборки.

Обычно вручную редактировать эти файлы не нужно. Достаточно пользоваться командами ниже.

## 3. Что будет запускаться

В проекте есть два Docker-сервиса.

### `web`

Основной сервис для разработки.

Он запускает Vite dev server и открывает приложение на:

```text
http://localhost:5173
```

Используется каждый день при разработке.

### `web-preview`

Сервис для проверки production-сборки.

Он сначала собирает frontend, потом отдаёт готовые файлы через Nginx на:

```text
http://localhost:8080
```

Используется реже — когда нужно проверить, как приложение будет выглядеть после сборки.

## 4. Что нужно установить один раз

### Шаг 1. Установить Docker Desktop

Скачайте Docker Desktop с официального сайта Docker и установите его.

После установки откройте Docker Desktop и дождитесь, пока он полностью запустится.

Важно: команды `docker ...` будут работать только когда Docker Desktop запущен.

### Шаг 2. Проверить, что Docker доступен

Откройте терминал в VS Code или обычный `cmd.exe` и выполните:

```bat
docker --version
```

Потом:

```bat
docker compose version
```

Если обе команды показывают версии — Docker установлен правильно.

Если Windows пишет, что `docker` не является командой, значит Docker Desktop не установлен, не запущен или терминал открыт до установки Docker. Перезапустите терминал, а при необходимости компьютер.

## 5. Подготовить env-файл

Frontend берёт настройки Supabase из файла `fronted/.env.local`.

Этот файл хранит локальные настройки и секретные значения, поэтому он не должен попадать в Git.

### Шаг 1. Создать файл из примера

В корне проекта выполните:

```bat
copy fronted\.env.staging.example fronted\.env.local
```

После этого появится файл:

```text
fronted/.env.local
```

### Шаг 2. Заполнить значения

Откройте `fronted/.env.local` и укажите реальные значения:

```env
VITE_BACKEND_PROVIDER=supabase
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_ANON_KEY
```

Что это значит:

- `VITE_BACKEND_PROVIDER=supabase` — frontend работает через Supabase.
- `VITE_SUPABASE_URL` — адрес вашего Supabase-проекта или прокси.
- `VITE_SUPABASE_ANON_KEY` — публичный anon/publishable key Supabase.

Без этих значений приложение может открыться, но данные из Supabase работать не будут.

## 6. Первый запуск проекта через Docker

Все команды ниже выполняются из корня проекта, то есть из папки, где лежит `docker-compose.yml`.

Запустите:

```bat
docker compose up web
```

Что произойдёт:

1. Docker прочитает `docker-compose.yml`.
2. Соберёт образ из `fronted/Dockerfile`, если он ещё не собран.
3. Установит зависимости через `npm ci` внутри контейнера.
4. Запустит Vite dev server.
5. Приложение станет доступно на `http://localhost:5173`.

Первый запуск может быть долгим, потому что Docker скачивает Node.js образ и устанавливает npm-зависимости.

## 7. Как открыть приложение

После запуска откройте браузер и перейдите по адресу:

```text
http://localhost:5173
```

Если страница открылась — frontend работает через Docker.

## 8. Как остановить проект

Если терминал с `docker compose up web` активен, нажмите:

```text
Ctrl + C
```

Потом выполните:

```bat
docker compose down
```

Эта команда останавливает и удаляет контейнеры, но не удаляет npm-зависимости из Docker volume.

## 9. Как запускать проект каждый день

Обычно рабочий цикл такой:

1. Открыть Docker Desktop.
2. Открыть проект в VS Code.
3. В терминале из корня проекта выполнить:

```bat
docker compose up web
```

4. Открыть браузер:

```text
http://localhost:5173
```

5. Работать с кодом в папке `fronted/`.
6. Когда работа закончена — остановить через `Ctrl + C` и:

```bat
docker compose down
```

## 10. Как запускать проверки

Проверки нужно выполнять внутри контейнера `web`, а не напрямую на компьютере.

Важно: сначала должен быть запущен сервис:

```bat
docker compose up web
```

После этого откройте второй терминал в корне проекта.

### Проверить lint

```bat
docker compose exec web npm run lint
```

Эта команда проверяет JavaScript/React-код ESLint-ом.

### Запустить тесты

```bat
docker compose exec web npm run test:run
```

Эта команда запускает тесты Vitest один раз и завершает выполнение.

### Проверить production-сборку

```bat
docker compose exec web npm run build
```

Эта команда проверяет, что frontend может собраться в готовую папку `dist`.

## 11. Как открыть production-like preview

Обычный `web` — это режим разработки. Иногда нужно проверить именно собранную версию, похожую на деплой.

Для этого используется `web-preview`.

В Windows `cmd.exe` сначала задайте переменные окружения:

```bat
set VITE_BACKEND_PROVIDER=supabase
set VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
set VITE_SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_ANON_KEY
```

Затем запустите preview:

```bat
docker compose --profile preview up --build web-preview
```

Откройте:

```text
http://localhost:8080
```

Остановить preview:

```bat
docker compose --profile preview down
```

## 12. Самые частые команды

### Запустить разработку

```bat
docker compose up web
```

### Остановить контейнеры

```bat
docker compose down
```

### Полностью пересоздать зависимости

```bat
docker compose down -v
```

Потом снова:

```bat
docker compose up --build web
```

Команда с `-v` удаляет Docker volume с `node_modules`. После неё зависимости будут установлены заново.

### Запустить команду внутри контейнера

```bat
docker compose exec web npm run lint
```

Вместо `npm run lint` можно подставить другую npm-команду из `fronted/package.json`.

## 13. Типичные проблемы и решения

### Проблема: `docker` не является внутренней или внешней командой

Причина: Docker Desktop не установлен или терминал не видит Docker.

Решение:

1. Установить Docker Desktop.
2. Запустить Docker Desktop.
3. Закрыть и заново открыть терминал.
4. Проверить:

```bat
docker --version
```

### Проблема: порт `5173` уже занят

Причина: уже запущен другой dev server или старый контейнер.

Решение:

```bat
docker compose down
```

Если не помогло, найдите и остановите процесс, который занимает порт `5173`, или временно измените порт в `docker-compose.yml`.

### Проблема: приложение открылось, но нет данных

Причина: не заполнен `fronted/.env.local` или указаны неправильные Supabase-значения.

Решение: проверить файл `fronted/.env.local` и убедиться, что там есть реальные значения:

```env
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

После изменения env-файла перезапустите контейнер:

```bat
docker compose down
docker compose up web
```

### Проблема: зависимости странно работают или пакет не найден

Решение: удалить Docker volume и собрать заново:

```bat
docker compose down -v
docker compose up --build web
```

### Проблема: изменения в коде не подхватываются

Решение:

1. Убедиться, что редактируются файлы именно в папке `fronted/`.
2. Перезапустить контейнер:

```bat
docker compose down
docker compose up web
```

## 14. Что новичку важно запомнить

- Docker Desktop должен быть запущен перед работой.
- Основная команда запуска: `docker compose up web`.
- Открывать приложение нужно на `http://localhost:5173`.
- Проверки запускать через `docker compose exec web ...`.
- Env-файл `fronted/.env.local` обязателен для работы с Supabase.
- Если всё сломалось непонятно почему, часто помогает `docker compose down -v` и затем `docker compose up --build web`.

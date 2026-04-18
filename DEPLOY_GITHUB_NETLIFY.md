# Деплой через GitHub -> Netlify

В проект уже добавлен workflow: `.github/workflows/deploy-netlify.yml`.

## 1) Что нужно один раз настроить

1. Загрузить проект в GitHub-репозиторий.
2. В Netlify открыть ваш сайт -> `Site configuration` -> `General` и скопировать `Site ID`.
3. В Netlify создать персональный токен: `User settings` -> `Applications` -> `Personal access tokens`.
4. В GitHub открыть `Settings` -> `Secrets and variables` -> `Actions` и добавить:
   - `NETLIFY_AUTH_TOKEN` = токен из Netlify
   - `NETLIFY_SITE_ID` = Site ID из Netlify

## 2) Как работает автодеплой

- Любой push в ветку `main` с изменениями в `frontend/**` запускает сборку и деплой.
- Также можно запустить вручную в GitHub: `Actions` -> `Deploy frontend to Netlify` -> `Run workflow`.

## 3) Проверка после первого запуска

1. Откройте вкладку `Actions` в GitHub, дождитесь зеленого статуса.
2. Откройте сайт Netlify и убедитесь, что новая версия доступна.
3. Проверьте переменные окружения Netlify: `VITE_BACKEND_PROVIDER=supabase`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (см. `fronted/.env.staging.example`).

## 4) Если деплой упал

- `Missing NETLIFY_AUTH_TOKEN / NETLIFY_SITE_ID` -> секреты не добавлены или с ошибкой.
- Ошибка `npm ci` -> проверьте `frontend/package-lock.json`.
- Ошибка API на проде -> проверьте Supabase URL/ключ и сеть до `*.supabase.co` (при блокировке провайдером может понадобиться VPN или свой прокси).
Test deploy from dev branch

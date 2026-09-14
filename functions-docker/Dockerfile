# Edge Functions self-host: один Deno-процесс с роутером supabase/functions/_router/main.ts.
# Облако это не использует — там каждая функция деплоится отдельно через свой index.ts.
FROM denoland/deno:alpine
CMD ["deno", "run", "--allow-all", "/home/deno/functions/_router/main.ts"]

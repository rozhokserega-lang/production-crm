-- 3D-модели секций мебели: файл модели (формат detalQR из «Экспорт модели в JSON-4.js»)
-- хранится прямо в БД (jsonb) — синхронизация с локальным сервером без файловых хранилищ.
--
-- Поток: вкладка «Мебель» → под-вкладыш «3D-модели» → загрузка/замена файла по секции;
-- вкладка «Производство» → кнопка «Модель» на карточке заказа:
--   артикул заказа → item_article_map.section_name → section_models.model_json → вьюер.
--
-- Выполнить: SQL Editor Supabase или scripts/local-db-up.ps1 (накатывает supabase/migrations).

-- ---------------------------------------------------------------------------
-- 1. Таблица
-- ---------------------------------------------------------------------------
create table if not exists public.section_models (
    section_name text primary key,
    file_name    text not null default '',
    model_json   jsonb not null,
    size_bytes   integer not null default 0,
    updated_at   timestamptz not null default now()
);

comment on table public.section_models is
    '3D-модель секции мебели (формат detalQR): одна модель на секцию, секции — как в public.section_catalog.';
comment on column public.section_models.model_json is
    'JSON модели из «Экспорт модели в JSON-4.js» (info + panels + fittings + ...).';

-- ---------------------------------------------------------------------------
-- 2. Загрузка/замена модели секции
-- ---------------------------------------------------------------------------
create or replace function public.web_upload_section_model(
    p_section   text,
    p_file_name text,
    p_model_json jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = 'public', 'extensions', 'pg_temp'
as $fn$
declare
    v_section text := trim(coalesce(p_section, ''));
    v_file    text := trim(coalesce(p_file_name, ''));
begin
    if v_section = '' then
        raise exception 'Не указано название секции';
    end if;
    if p_model_json is null or jsonb_typeof(p_model_json) <> 'object'
       or not jsonb_exists(p_model_json, 'panels')
       or jsonb_typeof(p_model_json->'panels') <> 'array' then
        raise exception 'Файл не похож на модель: в JSON нет списка "panels"';
    end if;

    insert into public.section_models (section_name, file_name, model_json, size_bytes, updated_at)
    values (
        v_section,
        v_file,
        p_model_json,
        length(p_model_json::text)::integer,
        now()
    )
    on conflict (section_name) do update
    set file_name   = excluded.file_name,
        model_json  = excluded.model_json,
        size_bytes  = excluded.size_bytes,
        updated_at  = excluded.updated_at;

    return jsonb_build_object(
        'ok', true,
        'section', v_section,
        'file_name', v_file,
        'size_bytes', length(p_model_json::text)::integer
    );
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 3. Удаление модели секции
-- ---------------------------------------------------------------------------
create or replace function public.web_delete_section_model(p_section text)
returns jsonb
language plpgsql
security definer
set search_path = 'public', 'extensions', 'pg_temp'
as $fn$
declare
    v_section text := trim(coalesce(p_section, ''));
begin
    delete from public.section_models
    where section_name = v_section;
    return jsonb_build_object('ok', true, 'section', v_section);
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 4. Список привязок (метаданные, без самого JSON)
-- ---------------------------------------------------------------------------
create or replace function public.web_list_section_models()
returns table (
    section_name text,
    file_name    text,
    size_bytes   integer,
    panels       integer,
    updated_at   timestamptz
)
language sql
stable
security definer
set search_path = 'public', 'extensions', 'pg_temp'
as $$
    select
        sm.section_name,
        sm.file_name,
        sm.size_bytes,
        coalesce(jsonb_array_length(sm.model_json->'panels'), 0) as panels,
        sm.updated_at
    from public.section_models sm
    order by sm.section_name;
$$;

-- ---------------------------------------------------------------------------
-- 5. Модель одной секции (для окна просмотра)
-- ---------------------------------------------------------------------------
create or replace function public.web_get_section_model(p_section text)
returns table (
    section_name text,
    file_name    text,
    model_json   jsonb
)
language sql
stable
security definer
set search_path = 'public', 'extensions', 'pg_temp'
as $$
    select sm.section_name, sm.file_name, sm.model_json
    from public.section_models sm
    where sm.section_name = trim(coalesce(p_section, ''));
$$;

-- ---------------------------------------------------------------------------
-- 6. Карта «артикул → секция с моделью» (одним запросом для карточек производства)
-- ---------------------------------------------------------------------------
create or replace function public.web_list_model_section_map()
returns table (
    article       text,
    item_name     text,
    section_name  text
)
language sql
stable
security definer
set search_path = 'public', 'extensions', 'pg_temp'
as $$
    select distinct
        trim(coalesce(m.article, '')) as article,
        m.item_name,
        sm.section_name
    from public.item_article_map m
    join public.section_models sm on sm.section_name = m.section_name
    where trim(coalesce(m.article, '')) <> '';
$$;

-- ---------------------------------------------------------------------------
-- 7. Права для PostgREST
-- ---------------------------------------------------------------------------
grant execute on function public.web_upload_section_model(text, text, jsonb) to authenticated, anon, service_role;
grant execute on function public.web_delete_section_model(text) to authenticated, anon, service_role;
grant execute on function public.web_list_section_models() to authenticated, anon, service_role;
grant execute on function public.web_get_section_model(text) to authenticated, anon, service_role;
grant execute on function public.web_list_model_section_map() to authenticated, anon, service_role;

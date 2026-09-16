-- Модели секций: поддержка сжатой передачи (gzip+base64).
-- Зачем: шлюз (nginx) и облачный Supabase режут тело запроса (1–5 МБ), а JSON моделей
-- бывает 1–3 МБ. Сжатый JSON уходит в ~10 раз меньше и проходит без правок инфраструктуры.
-- Хранение: либо model_json (jsonb, как было), либо model_gz (text, gzip+base64).
--
-- Выполнить: SQL Editor Supabase или scripts/local-db-up.ps1.

-- ---------------------------------------------------------------------------
-- 1. Колонки
-- ---------------------------------------------------------------------------
alter table public.section_models add column if not exists model_gz text;
alter table public.section_models add column if not exists panels integer not null default 0;
alter table public.section_models alter column model_json drop not null;

comment on column public.section_models.model_gz is
    'Модель, сжатая gzip и упакованная в base64 (когда JSON не проходит по лимиту тела запроса).';
comment on column public.section_models.panels is
    'Число деталей в модели — чтобы списку не разбирать JSON.';

-- переносим счётчик деталей у существующих строк
update public.section_models
set panels = coalesce(jsonb_array_length(model_json->'panels'), 0)
where coalesce(panels, 0) = 0 and model_json is not null;

-- ---------------------------------------------------------------------------
-- 2. Загрузка/замена (старая версия с 3 аргументами больше не нужна)
-- ---------------------------------------------------------------------------
drop function if exists public.web_upload_section_model(text, text, jsonb);

create or replace function public.web_upload_section_model(
    p_section    text,
    p_file_name  text,
    p_model_json jsonb default null,
    p_model_gz   text default null,
    p_panels     integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = 'public', 'extensions', 'pg_temp'
as $fn$
declare
    v_section text := trim(coalesce(p_section, ''));
    v_file    text := trim(coalesce(p_file_name, ''));
    v_panels  integer := greatest(0, coalesce(p_panels, 0));
    v_size    integer;
begin
    if v_section = '' then
        raise exception 'Не указано название секции';
    end if;

    if p_model_gz is not null and length(trim(p_model_gz)) > 0 then
        -- сжатый вариант: счётчик деталей приходит отдельным полем
        v_size := length(p_model_gz);
        insert into public.section_models (section_name, file_name, model_json, model_gz, panels, size_bytes, updated_at)
        values (v_section, v_file, null, p_model_gz, v_panels, v_size, now())
        on conflict (section_name) do update
        set file_name  = excluded.file_name,
            model_json = null,
            model_gz   = excluded.model_gz,
            panels     = excluded.panels,
            size_bytes = excluded.size_bytes,
            updated_at = excluded.updated_at;
    elsif p_model_json is not null then
        if jsonb_typeof(p_model_json) <> 'object'
           or not jsonb_exists(p_model_json, 'panels')
           or jsonb_typeof(p_model_json->'panels') <> 'array' then
            raise exception 'Файл не похож на модель: в JSON нет списка "panels"';
        end if;
        v_size := length(p_model_json::text);
        if v_panels = 0 then
            v_panels := coalesce(jsonb_array_length(p_model_json->'panels'), 0);
        end if;
        insert into public.section_models (section_name, file_name, model_json, model_gz, panels, size_bytes, updated_at)
        values (v_section, v_file, p_model_json, null, v_panels, v_size, now())
        on conflict (section_name) do update
        set file_name  = excluded.file_name,
            model_json = excluded.model_json,
            model_gz   = null,
            panels     = excluded.panels,
            size_bytes = excluded.size_bytes,
            updated_at = excluded.updated_at;
    else
        raise exception 'Пустая модель: нужен p_model_json или p_model_gz';
    end if;

    return jsonb_build_object(
        'ok', true,
        'section', v_section,
        'file_name', v_file,
        'panels', v_panels,
        'size_bytes', v_size
    );
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 3. Список привязок
-- ---------------------------------------------------------------------------
drop function if exists public.web_list_section_models();

create or replace function public.web_list_section_models()
returns table (
    section_name text,
    file_name    text,
    size_bytes   integer,
    panels       integer,
    compressed   boolean,
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
        coalesce(nullif(sm.panels, 0), jsonb_array_length(sm.model_json->'panels'), 0) as panels,
        (sm.model_gz is not null) as compressed,
        sm.updated_at
    from public.section_models sm
    order by sm.section_name;
$$;

-- ---------------------------------------------------------------------------
-- 4. Модель одной секции
-- ---------------------------------------------------------------------------
drop function if exists public.web_get_section_model(text);

create or replace function public.web_get_section_model(p_section text)
returns table (
    section_name text,
    file_name    text,
    model_json   jsonb,
    model_gz     text
)
language sql
stable
security definer
set search_path = 'public', 'extensions', 'pg_temp'
as $$
    select sm.section_name, sm.file_name, sm.model_json, sm.model_gz
    from public.section_models sm
    where sm.section_name = trim(coalesce(p_section, ''));
$$;

-- ---------------------------------------------------------------------------
-- 5. Права
-- ---------------------------------------------------------------------------
grant execute on function public.web_upload_section_model(text, text, jsonb, text, integer) to authenticated, anon, service_role;
grant execute on function public.web_list_section_models() to authenticated, anon, service_role;
grant execute on function public.web_get_section_model(text) to authenticated, anon, service_role;

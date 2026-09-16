-- Загрузка моделей секций ЧАСТЯМИ: тело запроса у шлюза (nginx) и облака ограничено
-- (1–5 МБ), а сжатая модель может быть и 1–3 МБ. Режем base64 на части по ~600 КБ,
-- шлём последовательно, на последней части сервер склеивает и сохраняет модель.
--
-- Выполнить после 20260916000000_section_models.sql и 20260916120000_section_models_gz.sql.

-- ---------------------------------------------------------------------------
-- 1. Промежуточная таблица частей
-- ---------------------------------------------------------------------------
create table if not exists public.section_model_uploads (
    section_name text not null,
    idx          integer not null,
    part         text not null,
    total        integer not null default 1,
    file_name    text not null default '',
    panels       integer not null default 0,
    updated_at   timestamptz not null default now(),
    primary key (section_name, idx)
);

comment on table public.section_model_uploads is
    'Промежуточные части загружаемой модели секции (см. web_upload_section_model_chunk).';

-- ---------------------------------------------------------------------------
-- 2. Приём части; на последней — склейка и сохранение
-- ---------------------------------------------------------------------------
create or replace function public.web_upload_section_model_chunk(
    p_section   text,
    p_file_name text,
    p_part      text,
    p_idx       integer,
    p_total     integer,
    p_panels    integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = 'public', 'extensions', 'pg_temp'
as $fn$
declare
    v_section text := trim(coalesce(p_section, ''));
    v_file    text := trim(coalesce(p_file_name, ''));
    v_total   integer := greatest(1, coalesce(p_total, 1));
    v_idx     integer := coalesce(p_idx, 0);
    v_panels  integer := greatest(0, coalesce(p_panels, 0));
    v_got     integer;
    v_gz      text;
begin
    if v_section = '' then
        raise exception 'Не указано название секции';
    end if;
    if v_idx < 0 or v_idx >= v_total then
        raise exception 'Некорректный номер части: % из %', v_idx, v_total;
    end if;

    insert into public.section_model_uploads (section_name, idx, part, total, file_name, panels, updated_at)
    values (v_section, v_idx, coalesce(p_part, ''), v_total, v_file, v_panels, now())
    on conflict (section_name, idx) do update
    set part       = excluded.part,
        total      = excluded.total,
        file_name  = excluded.file_name,
        panels     = excluded.panels,
        updated_at = excluded.updated_at;

    select count(*) into v_got
    from public.section_model_uploads u
    where u.section_name = v_section;

    -- ещё не все части — просто говорим, сколько приняли
    if v_got < v_total then
        return jsonb_build_object('ok', true, 'done', false, 'received', v_got, 'total', v_total);
    end if;

    -- все части на месте: склеиваем по порядку и сохраняем модель
    select string_agg(u.part, '' order by u.idx) into v_gz
    from public.section_model_uploads u
    where u.section_name = v_section;

    update public.section_models sm
    set model_json = null,
        model_gz   = v_gz,
        file_name  = coalesce(nullif(v_file, ''), sm.file_name),
        panels     = greatest(v_panels, sm.panels, 0),
        size_bytes = length(v_gz),
        updated_at = now()
    where sm.section_name = v_section;

    if not found then
        insert into public.section_models (section_name, file_name, model_json, model_gz, panels, size_bytes, updated_at)
        values (v_section, v_file, null, v_gz, v_panels, length(v_gz), now());
    end if;

    delete from public.section_model_uploads where section_name = v_section;

    return jsonb_build_object('ok', true, 'done', true, 'parts', v_total,
                              'panels', v_panels, 'size_bytes', length(v_gz));
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 3. Отмена незавершённой загрузки
-- ---------------------------------------------------------------------------
create or replace function public.web_cancel_section_model_upload(p_section text)
returns jsonb
language sql
security definer
set search_path = 'public', 'extensions', 'pg_temp'
as $$
    delete from public.section_model_uploads
    where section_name = trim(coalesce(p_section, ''));
    select jsonb_build_object('ok', true);
$$;

-- ---------------------------------------------------------------------------
-- 4. Права
-- ---------------------------------------------------------------------------
grant execute on function public.web_upload_section_model_chunk(text, text, text, integer, integer, integer) to authenticated, anon, service_role;
grant execute on function public.web_cancel_section_model_upload(text) to authenticated, anon, service_role;

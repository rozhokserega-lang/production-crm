-- Имя вкладки Google в книге склада, куда пишутся списания листов (Edge log-consume-sheet).

insert into public.crm_runtime_settings (key, value_text, updated_at)
values ('crm_consume_log_sheet_name', 'расход май 2026', now())
on conflict (key) do nothing;

create or replace function public.web_get_consume_log_sheet_name()
returns table(sheet_name text, updated_at timestamptz)
language plpgsql
stable
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
declare
  v_default constant text := 'расход май 2026';
  v_raw text;
  v_at timestamptz;
begin
  select s.value_text, s.updated_at
  into v_raw, v_at
  from public.crm_runtime_settings s
  where s.key = 'crm_consume_log_sheet_name'
  limit 1;

  sheet_name := coalesce(nullif(btrim(coalesce(v_raw, '')), ''), v_default);
  updated_at := coalesce(v_at, now());
  return next;
end;
$$;

create or replace function public.web_set_consume_log_sheet_name(p_sheet_name text)
returns table(sheet_name text, updated_at timestamptz)
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
declare
  v_default text := 'расход май 2026';
  v_name text;
begin
  perform public.web_require_roles(array['admin']);

  v_name := nullif(btrim(coalesce(p_sheet_name, '')), '');
  if v_name is null then
    v_name := v_default;
  end if;

  insert into public.crm_runtime_settings (key, value_text, updated_at)
  values ('crm_consume_log_sheet_name', v_name, now())
  on conflict (key) do update
  set
    value_text = excluded.value_text,
    updated_at = now();

  return query
  select r.sheet_name, r.updated_at
  from public.web_get_consume_log_sheet_name() r;
end;
$$;

grant execute on function public.web_get_consume_log_sheet_name() to anon, authenticated, service_role;
grant execute on function public.web_set_consume_log_sheet_name(text) to anon, authenticated, service_role;

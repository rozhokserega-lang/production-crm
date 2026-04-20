-- Runtime-configurable workshop executors for UI select lists.
-- Stored in crm_runtime_settings so admins can update composition without frontend redeploy.

insert into public.crm_runtime_settings (key, value_text, updated_at)
values
  ('crm_kromka_executors', '["Слава","Сережа"]', now()),
  ('crm_pras_executors', '["Леха","Виталик"]', now())
on conflict (key) do nothing;

create or replace function public.web_get_crm_executors()
returns table(
  kromka_executors text[],
  pras_executors text[],
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
declare
  v_kromka_raw text := '';
  v_pras_raw text := '';
  v_kromka_json jsonb := '[]'::jsonb;
  v_pras_json jsonb := '[]'::jsonb;
begin
  select coalesce(value_text, ''), coalesce(updated_at, now())
  into v_kromka_raw, updated_at
  from public.crm_runtime_settings
  where key = 'crm_kromka_executors'
  limit 1;

  select coalesce(value_text, '')
  into v_pras_raw
  from public.crm_runtime_settings
  where key = 'crm_pras_executors'
  limit 1;

  begin
    if btrim(v_kromka_raw) <> '' then
      v_kromka_json := v_kromka_raw::jsonb;
    end if;
  exception when others then
    v_kromka_json := '[]'::jsonb;
  end;

  begin
    if btrim(v_pras_raw) <> '' then
      v_pras_json := v_pras_raw::jsonb;
    end if;
  exception when others then
    v_pras_json := '[]'::jsonb;
  end;

  kromka_executors := array(
    select nullif(btrim(value), '')
    from jsonb_array_elements_text(v_kromka_json)
  );
  pras_executors := array(
    select nullif(btrim(value), '')
    from jsonb_array_elements_text(v_pras_json)
  );

  if coalesce(array_length(kromka_executors, 1), 0) = 0 then
    kromka_executors := array['Слава', 'Сережа'];
  end if;
  if coalesce(array_length(pras_executors, 1), 0) = 0 then
    pras_executors := array['Леха', 'Виталик'];
  end if;
  if updated_at is null then
    updated_at := now();
  end if;

  return next;
end;
$$;

create or replace function public.web_set_crm_executors(
  p_kromka_executors text[],
  p_pras_executors text[]
)
returns table(
  kromka_executors text[],
  pras_executors text[],
  updated_at timestamptz
)
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
declare
  v_kromka text[];
  v_pras text[];
begin
  perform public.web_require_roles(array['admin']);

  v_kromka := array(
    select distinct nullif(btrim(x), '')
    from unnest(coalesce(p_kromka_executors, array[]::text[])) as x
    where nullif(btrim(x), '') is not null
  );
  v_pras := array(
    select distinct nullif(btrim(x), '')
    from unnest(coalesce(p_pras_executors, array[]::text[])) as x
    where nullif(btrim(x), '') is not null
  );

  if coalesce(array_length(v_kromka, 1), 0) = 0 then
    v_kromka := array['Слава', 'Сережа'];
  end if;
  if coalesce(array_length(v_pras, 1), 0) = 0 then
    v_pras := array['Леха', 'Виталик'];
  end if;

  insert into public.crm_runtime_settings (key, value_text, updated_at)
  values ('crm_kromka_executors', to_json(v_kromka)::text, now())
  on conflict (key) do update
  set
    value_text = excluded.value_text,
    updated_at = now();

  insert into public.crm_runtime_settings (key, value_text, updated_at)
  values ('crm_pras_executors', to_json(v_pras)::text, now())
  on conflict (key) do update
  set
    value_text = excluded.value_text,
    updated_at = now();

  return query
  select r.kromka_executors, r.pras_executors, r.updated_at
  from public.web_get_crm_executors() r;
end;
$$;

grant execute on function public.web_get_crm_executors() to anon, authenticated, service_role;
grant execute on function public.web_set_crm_executors(text[], text[]) to anon, authenticated, service_role;

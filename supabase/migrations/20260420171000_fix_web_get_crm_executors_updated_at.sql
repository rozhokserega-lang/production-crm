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
  v_updated_at timestamptz := now();
begin
  select coalesce(s.value_text, ''), coalesce(s.updated_at, now())
  into v_kromka_raw, v_updated_at
  from public.crm_runtime_settings s
  where s.key = 'crm_kromka_executors'
  limit 1;

  select coalesce(s.value_text, '')
  into v_pras_raw
  from public.crm_runtime_settings s
  where s.key = 'crm_pras_executors'
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

  updated_at := v_updated_at;
  return next;
end;
$$;

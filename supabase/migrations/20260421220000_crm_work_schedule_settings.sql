-- Runtime work schedule settings for labor planning.
-- Stores working day length and week mask in crm_runtime_settings.

insert into public.crm_runtime_settings (key, value_text, updated_at)
values
  ('crm_work_hours_per_day', '8', now()),
  ('crm_working_days', '["mon","tue","wed","thu","fri"]', now())
on conflict (key) do nothing;

create or replace function public.web_get_work_schedule()
returns table(
  hours_per_day numeric,
  working_days text[],
  weekend_days text[],
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
declare
  v_hours_raw text := '8';
  v_days_raw text := '["mon","tue","wed","thu","fri"]';
  v_days_json jsonb := '["mon","tue","wed","thu","fri"]'::jsonb;
begin
  select coalesce(s.value_text, '8'), coalesce(s.updated_at, now())
  into v_hours_raw, updated_at
  from public.crm_runtime_settings s
  where s.key = 'crm_work_hours_per_day'
  limit 1;

  select coalesce(value_text, '["mon","tue","wed","thu","fri"]')
  into v_days_raw
  from public.crm_runtime_settings
  where key = 'crm_working_days'
  limit 1;

  begin
    if btrim(v_days_raw) <> '' then
      v_days_json := v_days_raw::jsonb;
    end if;
  exception when others then
    v_days_json := '["mon","tue","wed","thu","fri"]'::jsonb;
  end;

  hours_per_day := least(greatest(coalesce(nullif(btrim(v_hours_raw), '')::numeric, 8), 1), 24);
  working_days := array(
    select d
    from (
      select distinct lower(nullif(btrim(value), '')) as d
      from jsonb_array_elements_text(v_days_json)
    ) x
    where d in ('mon','tue','wed','thu','fri','sat','sun')
    order by array_position(array['mon','tue','wed','thu','fri','sat','sun']::text[], d)
  );
  if coalesce(array_length(working_days, 1), 0) = 0 then
    working_days := array['mon','tue','wed','thu','fri'];
  end if;
  weekend_days := array(
    select d
    from unnest(array['mon','tue','wed','thu','fri','sat','sun']::text[]) d
    where d <> all(working_days)
  );
  if updated_at is null then
    updated_at := now();
  end if;

  return next;
end;
$$;

create or replace function public.web_set_work_schedule(
  p_hours_per_day numeric,
  p_working_days text[]
)
returns table(
  hours_per_day numeric,
  working_days text[],
  weekend_days text[],
  updated_at timestamptz
)
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
declare
  v_hours numeric;
  v_days text[];
begin
  perform public.web_require_roles(array['admin']);

  v_hours := least(greatest(coalesce(p_hours_per_day, 8), 1), 24);
  v_days := array(
    select d
    from (
      select distinct lower(nullif(btrim(x), '')) as d
      from unnest(coalesce(p_working_days, array[]::text[])) as x
    ) y
    where d in ('mon','tue','wed','thu','fri','sat','sun')
    order by array_position(array['mon','tue','wed','thu','fri','sat','sun']::text[], d)
  );

  if coalesce(array_length(v_days, 1), 0) = 0 then
    v_days := array['mon','tue','wed','thu','fri'];
  end if;

  insert into public.crm_runtime_settings (key, value_text, updated_at)
  values ('crm_work_hours_per_day', trim(to_char(v_hours, 'FM999999999.##')), now())
  on conflict (key) do update
  set value_text = excluded.value_text, updated_at = now();

  insert into public.crm_runtime_settings (key, value_text, updated_at)
  values ('crm_working_days', to_json(v_days)::text, now())
  on conflict (key) do update
  set value_text = excluded.value_text, updated_at = now();

  return query
  select r.hours_per_day, r.working_days, r.weekend_days, r.updated_at
  from public.web_get_work_schedule() r;
end;
$$;

grant execute on function public.web_get_work_schedule() to anon, authenticated, service_role;
grant execute on function public.web_set_work_schedule(numeric, text[]) to anon, authenticated, service_role;

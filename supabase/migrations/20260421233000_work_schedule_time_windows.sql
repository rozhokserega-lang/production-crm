-- Add explicit work day time windows and lunch break.
-- hours_per_day is derived from work/lunch intervals.

insert into public.crm_runtime_settings (key, value_text, updated_at)
values
  ('crm_work_start', '08:00', now()),
  ('crm_work_end', '18:00', now()),
  ('crm_lunch_start', '12:00', now()),
  ('crm_lunch_end', '13:00', now())
on conflict (key) do nothing;

drop function if exists public.web_get_work_schedule();

create function public.web_get_work_schedule()
returns table(
  hours_per_day numeric,
  working_days text[],
  weekend_days text[],
  work_start text,
  work_end text,
  lunch_start text,
  lunch_end text,
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
  v_work_start text := '08:00';
  v_work_end text := '18:00';
  v_lunch_start text := '12:00';
  v_lunch_end text := '13:00';
  v_work_start_t time;
  v_work_end_t time;
  v_lunch_start_t time;
  v_lunch_end_t time;
  v_overlap_start time;
  v_overlap_end time;
  v_shift_hours numeric := 8;
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

  select coalesce(value_text, '08:00')
  into v_work_start
  from public.crm_runtime_settings
  where key = 'crm_work_start'
  limit 1;

  select coalesce(value_text, '18:00')
  into v_work_end
  from public.crm_runtime_settings
  where key = 'crm_work_end'
  limit 1;

  select coalesce(value_text, '12:00')
  into v_lunch_start
  from public.crm_runtime_settings
  where key = 'crm_lunch_start'
  limit 1;

  select coalesce(value_text, '13:00')
  into v_lunch_end
  from public.crm_runtime_settings
  where key = 'crm_lunch_end'
  limit 1;

  begin
    if btrim(v_days_raw) <> '' then
      v_days_json := v_days_raw::jsonb;
    end if;
  exception when others then
    v_days_json := '["mon","tue","wed","thu","fri"]'::jsonb;
  end;

  begin
    v_work_start_t := v_work_start::time;
    v_work_end_t := v_work_end::time;
    if v_work_end_t <= v_work_start_t then
      v_work_end_t := (v_work_start_t + interval '8 hour')::time;
    end if;
  exception when others then
    v_work_start_t := '08:00'::time;
    v_work_end_t := '18:00'::time;
  end;

  begin
    v_lunch_start_t := v_lunch_start::time;
    v_lunch_end_t := v_lunch_end::time;
    if v_lunch_end_t < v_lunch_start_t then
      v_lunch_end_t := v_lunch_start_t;
    end if;
  exception when others then
    v_lunch_start_t := '12:00'::time;
    v_lunch_end_t := '13:00'::time;
  end;

  v_overlap_start := greatest(v_work_start_t, v_lunch_start_t);
  v_overlap_end := least(v_work_end_t, v_lunch_end_t);
  v_shift_hours := extract(epoch from (v_work_end_t - v_work_start_t)) / 3600.0;
  if v_overlap_end > v_overlap_start then
    v_shift_hours := v_shift_hours - (extract(epoch from (v_overlap_end - v_overlap_start)) / 3600.0);
  end if;
  v_shift_hours := least(greatest(v_shift_hours, 1), 24);

  hours_per_day := v_shift_hours;
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

  work_start := to_char(v_work_start_t, 'HH24:MI');
  work_end := to_char(v_work_end_t, 'HH24:MI');
  lunch_start := to_char(v_lunch_start_t, 'HH24:MI');
  lunch_end := to_char(v_lunch_end_t, 'HH24:MI');
  if updated_at is null then
    updated_at := now();
  end if;

  return next;
end;
$$;

drop function if exists public.web_set_work_schedule(numeric, text[]);

create function public.web_set_work_schedule(
  p_hours_per_day numeric default null,
  p_working_days text[] default null,
  p_work_start text default '08:00',
  p_work_end text default '18:00',
  p_lunch_start text default '12:00',
  p_lunch_end text default '13:00'
)
returns table(
  hours_per_day numeric,
  working_days text[],
  weekend_days text[],
  work_start text,
  work_end text,
  lunch_start text,
  lunch_end text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
declare
  v_days text[];
  v_work_start time;
  v_work_end time;
  v_lunch_start time;
  v_lunch_end time;
  v_updated timestamptz := now();
begin
  perform public.web_require_roles(array['admin']);

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

  begin
    v_work_start := coalesce(nullif(btrim(p_work_start), ''), '08:00')::time;
  exception when others then
    v_work_start := '08:00'::time;
  end;
  begin
    v_work_end := coalesce(nullif(btrim(p_work_end), ''), '18:00')::time;
  exception when others then
    v_work_end := '18:00'::time;
  end;
  if v_work_end <= v_work_start then
    v_work_end := (v_work_start + interval '8 hour')::time;
  end if;

  begin
    v_lunch_start := coalesce(nullif(btrim(p_lunch_start), ''), '12:00')::time;
  exception when others then
    v_lunch_start := '12:00'::time;
  end;
  begin
    v_lunch_end := coalesce(nullif(btrim(p_lunch_end), ''), '13:00')::time;
  exception when others then
    v_lunch_end := '13:00'::time;
  end;
  if v_lunch_end < v_lunch_start then
    v_lunch_end := v_lunch_start;
  end if;

  insert into public.crm_runtime_settings (key, value_text, updated_at)
  values ('crm_working_days', to_json(v_days)::text, v_updated)
  on conflict (key) do update
  set value_text = excluded.value_text, updated_at = excluded.updated_at;

  insert into public.crm_runtime_settings (key, value_text, updated_at)
  values ('crm_work_start', to_char(v_work_start, 'HH24:MI'), v_updated)
  on conflict (key) do update
  set value_text = excluded.value_text, updated_at = excluded.updated_at;

  insert into public.crm_runtime_settings (key, value_text, updated_at)
  values ('crm_work_end', to_char(v_work_end, 'HH24:MI'), v_updated)
  on conflict (key) do update
  set value_text = excluded.value_text, updated_at = excluded.updated_at;

  insert into public.crm_runtime_settings (key, value_text, updated_at)
  values ('crm_lunch_start', to_char(v_lunch_start, 'HH24:MI'), v_updated)
  on conflict (key) do update
  set value_text = excluded.value_text, updated_at = excluded.updated_at;

  insert into public.crm_runtime_settings (key, value_text, updated_at)
  values ('crm_lunch_end', to_char(v_lunch_end, 'HH24:MI'), v_updated)
  on conflict (key) do update
  set value_text = excluded.value_text, updated_at = excluded.updated_at;

  return query
  select r.hours_per_day, r.working_days, r.weekend_days, r.work_start, r.work_end, r.lunch_start, r.lunch_end, r.updated_at
  from public.web_get_work_schedule() r;
end;
$$;

grant execute on function public.web_get_work_schedule() to anon, authenticated, service_role;
grant execute on function public.web_set_work_schedule(numeric, text[], text, text, text, text) to anon, authenticated, service_role;

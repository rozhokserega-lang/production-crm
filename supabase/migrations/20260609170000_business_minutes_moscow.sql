-- Рабочие минуты: окно 8–18 и обед 12–13 по календарю Europe/Moscow (не UTC).

create or replace function public.business_minutes(p_start timestamptz, p_end timestamptz)
returns integer
language sql
stable
set search_path = public
as $$
  with bounds as (
    select least(p_start, p_end) as start_ts, greatest(p_start, p_end) as end_ts
    where p_start is not null
      and p_end is not null
      and p_start < p_end
  ),
  schedule as (
    select
      coalesce(
        (select value_text from public.crm_runtime_settings where key = 'crm_work_start' limit 1),
        '08:00'
      )::time as work_start,
      coalesce(
        (select value_text from public.crm_runtime_settings where key = 'crm_work_end' limit 1),
        '18:00'
      )::time as work_end,
      coalesce(
        (select value_text from public.crm_runtime_settings where key = 'crm_lunch_start' limit 1),
        '12:00'
      )::time as lunch_start,
      coalesce(
        (select value_text from public.crm_runtime_settings where key = 'crm_lunch_end' limit 1),
        '13:00'
      )::time as lunch_end
  ),
  msk_days as (
    select gs::date as msk_date
    from bounds b
    cross join lateral generate_series(
      date_trunc('day', b.start_ts at time zone 'Europe/Moscow')::date,
      date_trunc('day', b.end_ts at time zone 'Europe/Moscow')::date,
      interval '1 day'
    ) as g(gs)
  ),
  day_windows as (
    select
      d.msk_date,
      ((d.msk_date + s.work_start) at time zone 'Europe/Moscow') as work_start_ts,
      ((d.msk_date + s.work_end) at time zone 'Europe/Moscow') as work_end_ts,
      ((d.msk_date + s.lunch_start) at time zone 'Europe/Moscow') as lunch_start_ts,
      ((d.msk_date + s.lunch_end) at time zone 'Europe/Moscow') as lunch_end_ts,
      extract(dow from d.msk_date)::int as dow_msk
    from msk_days d
    cross join schedule s
  ),
  work_overlaps as (
    select
      greatest(
        0,
        extract(epoch from least(b.end_ts, w.work_end_ts) - greatest(b.start_ts, w.work_start_ts)) / 60.0
        - greatest(
            0,
            extract(
              epoch from
              least(least(b.end_ts, w.work_end_ts), w.lunch_end_ts)
              - greatest(greatest(b.start_ts, w.work_start_ts), w.lunch_start_ts)
            ) / 60.0
          )
      ) as work_min
    from bounds b
    cross join day_windows w
    where w.dow_msk <> 0
      and greatest(b.start_ts, w.work_start_ts) < least(b.end_ts, w.work_end_ts)
  )
  select coalesce((select round(sum(wo.work_min))::integer from work_overlaps wo), 0);
$$;

alter function public.business_minutes(timestamp with time zone, timestamp with time zone)
  set search_path = public;

-- Пересчёт labor_facts по всем заказам с закрытыми этапами цеха.
do $backfill$
declare
  r record;
begin
  for r in
    select o.order_id
    from public.orders o
    where o.pilka_done_at is not null
       or o.kromka_done_at is not null
       or o.pras_done_at is not null
  loop
    perform public.sync_labor_fact_from_order(r.order_id);
  end loop;
end $backfill$;

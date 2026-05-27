-- Replace plpgsql WHILE loop with set-based SQL for labor table performance.

create or replace function public.business_minutes(p_start timestamptz, p_end timestamptz)
returns integer
language sql
stable
set search_path = public
as $$
  select case
    when p_start is null or p_end is null or p_start >= p_end then 0
    else greatest(
      coalesce(
        (
          select round(sum(
            extract(epoch from (
              least(p_end, d + interval '18 hours') -
              greatest(p_start, d + interval '8 hours')
            )) / 60.0
            - greatest(0, extract(epoch from (
                least(
                  least(p_end, d + interval '18 hours'),
                  d + interval '13 hours'
                ) -
                greatest(
                  greatest(p_start, d + interval '8 hours'),
                  d + interval '12 hours'
                )
              )) / 60.0)
          ))::integer
          from generate_series(
            date_trunc('day', p_start),
            date_trunc('day', p_end),
            interval '1 day'
          ) as g(d)
          where extract(dow from d) <> 0
            and greatest(p_start, d + interval '8 hours') < least(p_end, d + interval '18 hours')
        ),
        0
      ),
      1
    )
  end;
$$;

alter function public.business_minutes(timestamp with time zone, timestamp with time zone)
  set search_path = public;

-- Stage 2 (P0): runtime switch for strict auth mode.
-- strict=false (default): backward-compatible anon -> admin fallback.
-- strict=true: unauthenticated callers become viewer.

create table if not exists public.crm_runtime_settings (
  key text primary key,
  value_text text not null,
  updated_at timestamptz not null default now()
);

insert into public.crm_runtime_settings(key, value_text)
values ('crm_auth_strict', 'false')
on conflict (key) do nothing;

create or replace function public.web_is_crm_auth_strict()
returns boolean
language sql
stable
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
  select coalesce(
    (
      select lower(trim(coalesce(s.value_text, ''))) in ('1', 'true', 'yes', 'on')
      from public.crm_runtime_settings s
      where s.key = 'crm_auth_strict'
      limit 1
    ),
    false
  );
$$;

create or replace function public.web_effective_crm_role()
returns text
language plpgsql
stable
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
declare
  v_claims jsonb := coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
  v_db_role text := lower(coalesce(current_setting('request.jwt.claim.role', true), ''));
  v_claim_role text := lower(trim(coalesce(v_claims -> 'app_metadata' ->> 'crm_role', v_claims ->> 'crm_role', '')));
begin
  if v_db_role = 'service_role' then
    return 'admin';
  end if;
  if public.web_is_valid_crm_role(v_claim_role) then
    return v_claim_role;
  end if;

  -- strict=false keeps compatibility with current anon-key flow.
  if auth.uid() is null then
    if public.web_is_crm_auth_strict() then
      return 'viewer';
    end if;
    return 'admin';
  end if;

  return 'viewer';
end;
$$;

create or replace function public.web_set_crm_auth_strict(p_enabled boolean)
returns table(enabled boolean, updated_at timestamptz)
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
begin
  perform public.web_require_roles(array['admin']);

  insert into public.crm_runtime_settings(key, value_text, updated_at)
  values ('crm_auth_strict', case when coalesce(p_enabled, false) then 'true' else 'false' end, now())
  on conflict (key) do update
  set
    value_text = excluded.value_text,
    updated_at = now();

  return query
  select public.web_is_crm_auth_strict(), s.updated_at
  from public.crm_runtime_settings s
  where s.key = 'crm_auth_strict'
  limit 1;
end;
$$;

grant select on public.crm_runtime_settings to authenticated, service_role;
grant execute on function public.web_is_crm_auth_strict() to anon, authenticated, service_role;
grant execute on function public.web_effective_crm_role() to anon, authenticated, service_role;
grant execute on function public.web_set_crm_auth_strict(boolean) to anon, authenticated, service_role;

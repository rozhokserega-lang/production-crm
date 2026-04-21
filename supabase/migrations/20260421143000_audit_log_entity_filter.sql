-- Add server-side entity filter for audit log RPC.

drop function if exists public.web_get_audit_log(integer, integer, text);

create or replace function public.web_get_audit_log(
  p_limit integer default 200,
  p_offset integer default 0,
  p_action text default null,
  p_entity text default null
)
returns table (
  id bigint,
  created_at timestamptz,
  actor_user_id uuid,
  actor_db_role text,
  actor_crm_role text,
  action text,
  entity text,
  entity_id text,
  details jsonb
)
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 200), 1000));
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_action text := nullif(lower(trim(coalesce(p_action, ''))), '');
  v_entity text := nullif(lower(trim(coalesce(p_entity, ''))), '');
begin
  perform public.web_require_roles(array['admin', 'manager']);

  return query
  select
    l.id,
    l.created_at,
    l.actor_user_id,
    l.actor_db_role,
    l.actor_crm_role,
    l.action,
    l.entity,
    l.entity_id,
    l.details
  from public.crm_audit_log l
  where (v_action is null or l.action = v_action)
    and (v_entity is null or l.entity = v_entity)
  order by l.created_at desc, l.id desc
  limit v_limit
  offset v_offset;
end;
$$;

grant execute on function public.web_get_audit_log(integer, integer, text, text) to authenticated, service_role;

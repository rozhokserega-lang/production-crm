-- Default strict CRM auth: anonymous requests get viewer, not admin (see web_effective_crm_role).
-- Ensure at least one Supabase-authenticated user has admin in crm_user_roles before applying in production.

insert into public.crm_runtime_settings (key, value_text, updated_at)
values ('crm_auth_strict', 'true', now())
on conflict (key) do update
set
  value_text = excluded.value_text,
  updated_at = excluded.updated_at;

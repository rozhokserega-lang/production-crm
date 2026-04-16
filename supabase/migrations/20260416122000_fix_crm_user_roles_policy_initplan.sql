-- Avoid per-row auth function re-evaluation in RLS policy.

drop policy if exists "crm_user_roles_select_authenticated" on public.crm_user_roles;
create policy "crm_user_roles_select_authenticated"
  on public.crm_user_roles
  for select
  to authenticated
  using ((select auth.uid()) is not null);

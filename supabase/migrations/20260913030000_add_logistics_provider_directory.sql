-- logistics_providers is correctly RLS-locked to each provider's own row
-- (auth.uid() = profile_id) -- but that means the AI pricing backend,
-- which calls Supabase with the anon key and has no provider's session,
-- gets zero rows back from a plain select, so trip-notification matching
-- would silently never find anyone. Same shape of problem as farmer
-- crop_details, solved the same way: a security-definer function that
-- exposes only the fields needed for matching (company name + declared
-- fleet), never anything else in the table.
create or replace function public.logistics_provider_directory()
returns table (profile_id uuid, company_name text, fleet_details text)
language sql
security definer
set search_path = public
stable
as $$
  select profile_id, company_name, fleet_details
  from public.logistics_providers;
$$;

grant execute on function public.logistics_provider_directory() to anon, authenticated;

create policy "Logistics providers can add their own record" on public.logistics_providers for insert with check (auth.uid() = profile_id);

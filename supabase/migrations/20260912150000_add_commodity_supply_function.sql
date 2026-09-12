-- Aggregate-only read of farmer supply, for the AI pricing backend's
-- scarcity multiplier. crop_details rows are protected by per-farmer RLS
-- (a farmer can only select their own rows), which is correct for privacy
-- but means the pricing backend can't just query crop_details directly with
-- the anon key. This function returns a single summed number -- no farmer
-- identity, no row-level detail -- so it's safe to expose to anon/authenticated.
create or replace function public.commodity_supply_kg(p_crop_type text)
returns numeric
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(sum(
    case when harvested then turnover else expected_turnover end
  ), 0) * 100  -- crop_details stores quintals; convert to kg
  from public.crop_details
  where lower(crop_type) = lower(p_crop_type);
$$;

grant execute on function public.commodity_supply_kg(text) to anon, authenticated;

-- Harvest-date transparency for buyers: crop_details only ever had
-- expected_harvest_date (an estimate) -- there was no record of when a crop
-- was ACTUALLY harvested, and marking a crop harvested in the farmer
-- dashboard only changed local React state (never persisted). Buyers had no
-- visibility into freshness at all. This adds:
--   1. crop_details.actual_harvest_date, set to today's date when a farmer
--      confirms harvest (src/api/farmer.js markCropHarvested) -- a genuine
--      freshness signal, not a repeat of the estimate.
--   2. harvested/harvest_date on commodity_supply_listings(), so a buyer's
--      /api/quote shows freshness before they order.
--   3. The same on order_allocations, snapshotted at order time by
--      create_order() -- same reasoning as market_crop_price_per_kg being
--      snapshotted rather than joined live: a farmer's crop row can change
--      after the order, the buyer's record should freeze what was true then.

alter table public.crop_details
  add column if not exists actual_harvest_date date;

alter table public.order_allocations
  add column if not exists harvested boolean,
  add column if not exists harvest_date date;

-- Postgres refuses `create or replace` when the OUT-parameter row shape
-- changes (adding harvested/harvest_date here) -- drop first.
drop function if exists public.commodity_supply_listings(text);

create or replace function public.commodity_supply_listings(p_crop_type text)
returns table (
  farmer_id uuid,
  crop_id bigint,
  available_kg numeric,
  pincode text,
  harvested boolean,
  harvest_date date
)
language sql
security definer
set search_path = public
stable
as $$
  select
    cd.farmer_id,
    cd.id as crop_id,
    (case when cd.harvested then cd.turnover else cd.expected_turnover end) * 100 as available_kg,
    fp.pincode,
    coalesce(cd.harvested, false) as harvested,
    coalesce(cd.actual_harvest_date, cd.expected_harvest_date) as harvest_date
  from public.crop_details cd
  join public.farmer_profiles fp on fp.farmer_id = cd.farmer_id
  where lower(cd.crop_type) = lower(p_crop_type)
    and coalesce(case when cd.harvested then cd.turnover else cd.expected_turnover end, 0) > 0
    and fp.pincode is not null and fp.pincode <> '';
$$;

grant execute on function public.commodity_supply_listings(text) to anon, authenticated;

create or replace function public.create_order(
  p_buyer_id uuid,
  p_commodity text,
  p_market text,
  p_order_demand_kg numeric,
  p_base_price_per_kg numeric,
  p_market_crop_price_per_kg numeric,
  p_logistics_cost_total numeric,
  p_platform_commission_total numeric,
  p_final_price_per_kg numeric,
  p_grand_total numeric,
  p_breakdown jsonb,
  p_allocations jsonb,   -- [{farmer_id, crop_id, allocated_kg, farmer_payout, harvested, harvest_date}, ...]
  p_trips jsonb          -- [{vehicle_class, total_weight_kg, distance_km, cost, stops}, ...]
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  new_order_id bigint;
  alloc jsonb;
  trip jsonb;
  v_crop_id bigint;
  v_allocated_quintals numeric;
  v_harvested boolean;
  v_harvest_date date;
begin
  insert into public.orders (
    buyer_id, commodity, market, order_demand_kg, base_price_per_kg,
    market_crop_price_per_kg, logistics_cost_total, platform_commission_total,
    final_price_per_kg, grand_total, breakdown
  ) values (
    p_buyer_id, p_commodity, p_market, p_order_demand_kg, p_base_price_per_kg,
    p_market_crop_price_per_kg, p_logistics_cost_total, p_platform_commission_total,
    p_final_price_per_kg, p_grand_total, p_breakdown
  ) returning id into new_order_id;

  for alloc in select * from jsonb_array_elements(coalesce(p_allocations, '[]'::jsonb)) loop
    v_crop_id := nullif(alloc->>'crop_id', '')::bigint;

    -- Prefer whatever the quote actually showed the buyer (passed through
    -- in the allocation payload); fall back to a live crop_details lookup
    -- only if that's missing (older callers, or the single-shipment path).
    v_harvested := nullif(alloc->>'harvested', '')::boolean;
    v_harvest_date := nullif(alloc->>'harvest_date', '')::date;
    if v_crop_id is not null and (v_harvested is null or v_harvest_date is null) then
      select coalesce(v_harvested, harvested), coalesce(v_harvest_date, coalesce(actual_harvest_date, expected_harvest_date))
        into v_harvested, v_harvest_date
      from public.crop_details where id = v_crop_id;
    end if;

    insert into public.order_allocations (order_id, farmer_id, crop_id, allocated_kg, farmer_payout, harvested, harvest_date)
    values (
      new_order_id,
      (alloc->>'farmer_id')::uuid,
      v_crop_id,
      (alloc->>'allocated_kg')::numeric,
      coalesce((alloc->>'farmer_payout')::numeric, 0),
      v_harvested,
      v_harvest_date
    );

    if v_crop_id is not null then
      v_allocated_quintals := (alloc->>'allocated_kg')::numeric / 100.0;

      select harvested into v_harvested from public.crop_details where id = v_crop_id;
      if found then
        if v_harvested then
          update public.crop_details
          set turnover = greatest(0, coalesce(turnover, 0) - v_allocated_quintals)
          where id = v_crop_id;
        else
          update public.crop_details
          set expected_turnover = greatest(0, coalesce(expected_turnover, 0) - v_allocated_quintals)
          where id = v_crop_id;
        end if;
      end if;
    end if;
  end loop;

  for trip in select * from jsonb_array_elements(coalesce(p_trips, '[]'::jsonb)) loop
    insert into public.order_trips (order_id, vehicle_class, total_weight_kg, distance_km, cost, stops)
    values (
      new_order_id,
      trip->>'vehicle_class',
      (trip->>'total_weight_kg')::numeric,
      (trip->>'distance_km')::numeric,
      (trip->>'cost')::numeric,
      coalesce(trip->'stops', '[]'::jsonb)
    );
  end loop;

  return new_order_id;
end;
$$;

grant execute on function public.create_order(
  uuid, text, text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, jsonb, jsonb, jsonb
) to anon, authenticated;

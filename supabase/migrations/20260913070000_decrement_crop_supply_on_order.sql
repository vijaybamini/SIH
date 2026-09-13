-- Real correctness bug: placing an order never reduced the farmer's
-- remaining supply. commodity_supply_kg()/commodity_supply_listings() read
-- crop_details.turnover (or expected_turnover) directly, so the exact same
-- listed quantity could be sold to every buyer who asks, with no limit --
-- discovered by actually placing more than one order against a real test
-- listing and finding the "available" figure never moved.
--
-- Fix: create_order() now decrements the relevant column by each
-- allocation's kg (converted back to quintals) for every crop_id it
-- draws from. The UPDATE takes a row lock for the crop_details row it
-- touches, so two concurrent orders against the same listing serialize
-- correctly instead of both reading the same stale total and overselling.
alter table public.crop_details
  add constraint crop_details_turnover_nonnegative check (turnover is null or turnover >= 0),
  add constraint crop_details_expected_turnover_nonnegative check (expected_turnover is null or expected_turnover >= 0);

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
  p_allocations jsonb,   -- [{farmer_id, crop_id, allocated_kg, farmer_payout}, ...]
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
    insert into public.order_allocations (order_id, farmer_id, crop_id, allocated_kg, farmer_payout)
    values (
      new_order_id,
      (alloc->>'farmer_id')::uuid,
      nullif(alloc->>'crop_id', '')::bigint,
      (alloc->>'allocated_kg')::numeric,
      coalesce((alloc->>'farmer_payout')::numeric, 0)
    );

    v_crop_id := nullif(alloc->>'crop_id', '')::bigint;
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

import math
import argparse
import sys
import pandas as pd
import os
from scipy.optimize import linprog
from ortools.constraint_solver import routing_enums_pb2, pywrapcp

# ---------------------------------------------------------------------------
# 0. PINCODE RESOLUTION ENGINE (USING CSV)
# ---------------------------------------------------------------------------
# Lazy + exception-based (never sys.exit) so this module is safe to `import`
# from a long-running server (pipeline.py) -- the original version ran the
# CSV load at import time and called sys.exit(1) on any problem, which would
# have killed the whole FastAPI process the moment this module was imported.
# CLI usage (the __main__ block below) still gets equivalent behavior: an
# uncaught exception there prints a traceback and exits, same as sys.exit did.

CSV_FILENAME = "all_india_pincode_directory_2025.csv"
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CSV_PATH = os.path.join(BASE_DIR, CSV_FILENAME)

_pincode_df = None


def _load_pincode_df():
    global _pincode_df
    if _pincode_df is not None:
        return _pincode_df

    if not os.path.exists(CSV_PATH):
        raise FileNotFoundError(
            f"Pincode directory not found at {CSV_PATH}. Place "
            f"'{CSV_FILENAME}' in the AI_backend folder."
        )

    df = pd.read_csv(CSV_PATH, low_memory=False)
    df.columns = [str(c).strip().lower() for c in df.columns]

    if 'lat' in df.columns and 'latitude' not in df.columns:
        df.rename(columns={'lat': 'latitude'}, inplace=True)
    if 'lon' in df.columns and 'longitude' not in df.columns:
        df.rename(columns={'lon': 'longitude'}, inplace=True)
    if 'long' in df.columns and 'longitude' not in df.columns:
        df.rename(columns={'long': 'longitude'}, inplace=True)

    if not all(col in df.columns for col in ['pincode', 'latitude', 'longitude']):
        raise ValueError(
            f"The pincode CSV must contain 'pincode', 'latitude', and 'longitude' "
            f"columns. Found: {list(df.columns)}"
        )

    df['pincode'] = df['pincode'].astype(str).str.replace(r'\.0$', '', regex=True).str.strip()
    df.set_index('pincode', inplace=True)
    _pincode_df = df
    return _pincode_df


def resolve_pincode(pincode):
    """Fetches (lat, lon) for a given pincode string. Raises ValueError (not
    sys.exit) if the pincode can't be resolved -- callers running inside a
    server process must catch this and skip/report, never let it propagate
    up and kill the whole process."""
    pincode_str = str(pincode).strip()
    df = _load_pincode_df()
    try:
        row = df.loc[pincode_str]
        if isinstance(row, pd.DataFrame):
            row = row.iloc[0]
        return float(row['latitude']), float(row['longitude'])
    except KeyError:
        raise ValueError(f"Pincode '{pincode_str}' not found in {CSV_FILENAME}.")

# ---------------------------------------------------------------------------
# CONFIGURATION
# ---------------------------------------------------------------------------
VEHICLE_CLASSES = [
    {"name": "Mini_LCV", "capacity_kg": 1500, "cost_per_km": 18},
    {"name": "7T_Truck", "capacity_kg": 7000, "cost_per_km": 32},
    {"name": "Reefer_7T", "capacity_kg": 7000, "cost_per_km": 45},
]

UTILIZATION_LIMIT = 0.90   # shipment must fit within 90% of rated capacity
MIN_HEADROOM_KG = 100      # at least 100kg headroom required
ROAD_FACTOR = 1.3          # straight-line distance underestimates real road distance


# ---------------------------------------------------------------------------
# 1. DISTANCE FUNCTION
# ---------------------------------------------------------------------------
def haversine_km(lat1, lon1, lat2, lon2):
    R = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlambda / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))

def road_distance_km(a, b):
    return haversine_km(a["lat"], a["lon"], b["lat"], b["lon"]) * ROAD_FACTOR


# ---------------------------------------------------------------------------
# PHASE 1: ALLOCATION 
# ---------------------------------------------------------------------------
def allocate(farmers, buyers):
    n_f, n_b = len(farmers), len(buyers)
    M = 1_000_000 

    dist_matrix = [[road_distance_km(f, b) for b in buyers] for f in farmers]

    c = []
    for i in range(n_f):
        for j in range(n_b):
            c.append(dist_matrix[i][j] - M)

    A_ub = []
    b_ub = []

    for i in range(n_f):
        row = [0] * (n_f * n_b)
        for j in range(n_b):
            row[i * n_b + j] = 1
        A_ub.append(row)
        b_ub.append(farmers[i]["weight_kg"])

    for j in range(n_b):
        row = [0] * (n_f * n_b)
        for i in range(n_f):
            row[i * n_b + j] = 1
        A_ub.append(row)
        b_ub.append(buyers[j]["weight_req_kg"])

    bounds = [(0, None)] * (n_f * n_b)
    result = linprog(c, A_ub=A_ub, b_ub=b_ub, bounds=bounds, method="highs")

    allocation = {}
    for j, buyer in enumerate(buyers):
        allocation[buyer["id"]] = []
        for i, farmer in enumerate(farmers):
            qty = result.x[i * n_b + j]
            if qty > 1e-3:
                allocation[buyer["id"]].append((farmer["id"], round(qty, 1)))

    return allocation, dist_matrix, result


# ---------------------------------------------------------------------------
# PHASE 2: VEHICLE SELECTION + FARMER-TO-VEHICLE BIN PACKING 
# ---------------------------------------------------------------------------
def pick_vehicle_class_for_load(load_kg, vehicle_classes):
    for vc in sorted(vehicle_classes, key=lambda v: v["capacity_kg"]):
        usable_capacity = vc["capacity_kg"] * UTILIZATION_LIMIT
        headroom = vc["capacity_kg"] - load_kg
        if load_kg <= usable_capacity and headroom >= MIN_HEADROOM_KG:
            return vc
    return None

def bin_pack_farmers_to_vehicles(farmer_points, vehicle_classes):
    remaining_farmers = sorted(farmer_points, key=lambda f: -f["weight_kg"])
    largest_capacity = max(v["capacity_kg"] for v in vehicle_classes) * UTILIZATION_LIMIT

    trips = []
    while remaining_farmers:
        if remaining_farmers[0]["weight_kg"] > largest_capacity:
            raise ValueError(
                f"Farmer {remaining_farmers[0]['id']} shipment "
                f"({remaining_farmers[0]['weight_kg']}kg) exceeds the largest "
                f"vehicle's usable capacity ({largest_capacity}kg) on its own."
            )

        bin_farmers = []
        bin_weight = 0
        for f in list(remaining_farmers):
            candidate_weight = bin_weight + f["weight_kg"]
            vc = pick_vehicle_class_for_load(candidate_weight, vehicle_classes)
            if vc is not None:
                bin_farmers.append(f)
                bin_weight = candidate_weight
                remaining_farmers.remove(f)

        vc = pick_vehicle_class_for_load(bin_weight, vehicle_classes)
        trips.append({
            "vehicle_class": vc["name"],
            "cost_per_km": vc["cost_per_km"],
            "capacity_kg": vc["capacity_kg"],
            "farmers": bin_farmers,
            "total_weight": round(bin_weight, 1),
        })
    return trips


# ---------------------------------------------------------------------------
# PHASE 3: ROUTE OPTIMIZATION 
# ---------------------------------------------------------------------------
def optimize_single_trip_route(shed, trip_farmers, buyer, cost_per_km):
    """Routes one vehicle: starts at `shed` (the trip's first farmer stop),
    visits the rest of trip_farmers for pickup, ends at `buyer` for delivery.
    Explicit separate start/end nodes so this is a real one-way delivery
    route, not a round trip back to the start -- a single shared
    start-equals-end depot (the OR-Tools default) would have the vehicle
    loop back to the first farmer after dropping off at the buyer, inflating
    both the reported distance and the logistics cost computed from it."""
    nodes = [shed] + trip_farmers + [buyer]
    n = len(nodes)
    depot_index = 0
    buyer_index = n - 1

    dist_matrix = [[int(road_distance_km(a, b) * 1000) for b in nodes] for a in nodes]

    manager = pywrapcp.RoutingIndexManager(n, 1, [depot_index], [buyer_index])
    routing = pywrapcp.RoutingModel(manager)

    def distance_callback(from_index, to_index):
        from_node = manager.IndexToNode(from_index)
        to_node = manager.IndexToNode(to_index)
        return dist_matrix[from_node][to_node]

    transit_callback_index = routing.RegisterTransitCallback(distance_callback)
    routing.SetArcCostEvaluatorOfVehicle(transit_callback_index, 0)

    # No AddPickupAndDelivery constraints needed (and, with the buyer set as
    # the vehicle's END node rather than a regular node, calling it would
    # segfault the OR-Tools C++ core -- delivery indices must be regular
    # nodes, not a vehicle's dedicated end index). With a single vehicle and
    # a fixed end at the buyer, every farmer node is necessarily visited
    # before the buyer by construction, so no explicit pairing is needed.

    search_params = pywrapcp.DefaultRoutingSearchParameters()
    search_params.first_solution_strategy = (
        routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC
    )
    search_params.time_limit.FromSeconds(5)

    solution = routing.SolveWithParameters(search_params)
    if not solution:
        return None

    index = routing.Start(0)
    route_nodes = []
    route_distance_m = 0
    while not routing.IsEnd(index):
        node = manager.IndexToNode(index)
        route_nodes.append(nodes[node].get("id", "SHED"))
        prev_index = index
        index = solution.Value(routing.NextVar(index))
        route_distance_m += dist_matrix[manager.IndexToNode(prev_index)][manager.IndexToNode(index)]
    route_nodes.append(nodes[manager.IndexToNode(index)].get("id", "SHED"))

    return {
        "stops": route_nodes,
        "distance_km": round(route_distance_m / 1000.0, 2),
        "cost": round((route_distance_m / 1000.0) * cost_per_km, 2),
    }


# ---------------------------------------------------------------------------
# SINGLE-BUYER ENTRYPOINT (for the live API -- run_pipeline() below is
# CLI-only: it always wants a separate shed pincode and prints instead of
# returning structured data)
# ---------------------------------------------------------------------------
def plan_multi_farmer_delivery(buyer_pincode, buyer_demand_kg, farmer_candidates):
    """
    Allocates buyer_demand_kg across farmer_candidates (an LP-optimal
    supply split, same formulation as allocate()), bin-packs the allocated
    farmers into vehicle trips, and routes each multi-farmer trip with
    OR-Tools. There's no separate shed/warehouse in this codebase, so a
    trip's route starts at whichever of its farmers is visited first, rather
    than a fixed depot.

    farmer_candidates: list of dicts shaped like Supabase's
    commodity_supply_listings() rows: {"farmer_id", "crop_id", "pincode",
    "available_kg"}.

    Returns {"allocations": [...], "trips": [...], "total_allocated_kg",
    "warnings": [...]}. A farmer whose pincode can't be resolved is skipped
    (reported in "warnings"), not fatal to the whole order -- one bad
    listing shouldn't block every other buyer from getting a quote.
    """
    buyer_lat, buyer_lon = resolve_pincode(buyer_pincode)
    buyer_node = {"id": "BUYER", "lat": buyer_lat, "lon": buyer_lon}

    warnings = []
    resolved_farmers = []
    for cand in farmer_candidates:
        try:
            lat, lon = resolve_pincode(cand["pincode"])
        except ValueError as exc:
            warnings.append(f"Skipped a farmer listing (crop_id={cand.get('crop_id')}): {exc}")
            continue
        resolved_farmers.append({
            "id": cand["farmer_id"],
            "crop_id": cand.get("crop_id"),
            "lat": lat,
            "lon": lon,
            "weight_kg": float(cand["available_kg"]),
        })

    if not resolved_farmers:
        raise ValueError("No farmer listings with a resolvable pincode are available for this commodity.")

    total_available = sum(f["weight_kg"] for f in resolved_farmers)
    if total_available < buyer_demand_kg:
        warnings.append(
            f"Only {total_available:.0f}kg of real farmer supply has a resolvable "
            f"location (requested {buyer_demand_kg:.0f}kg) -- allocating what's available."
        )

    allocation, _dist_matrix, _lp_result = allocate(
        resolved_farmers, [{"id": "BUYER", "lat": buyer_lat, "lon": buyer_lon, "weight_req_kg": buyer_demand_kg}]
    )
    assigns = allocation["BUYER"]
    if not assigns:
        raise ValueError("Could not allocate any farmer supply to this order.")

    allocated_farmers = []
    for farmer_id, qty in assigns:
        f = next(f for f in resolved_farmers if f["id"] == farmer_id)
        allocated_farmers.append({**f, "weight_kg": qty})

    trips_raw = bin_pack_farmers_to_vehicles(allocated_farmers, VEHICLE_CLASSES)

    trips_out = []
    for t in trips_raw:
        trip_farmers = t["farmers"]
        if len(trip_farmers) == 1:
            f = trip_farmers[0]
            distance_km = road_distance_km(f, buyer_node)
            stops = [str(f["id"]), "BUYER"]
        else:
            depot, *rest = trip_farmers
            route = optimize_single_trip_route(depot, rest, buyer_node, t["cost_per_km"])
            if route is None:
                # OR-Tools found no feasible route (rare) -- fall back to
                # summed direct distances so the order can still be priced,
                # flagged as non-optimal rather than silently wrong.
                distance_km = sum(road_distance_km(f, buyer_node) for f in trip_farmers)
                stops = [str(f["id"]) for f in trip_farmers] + ["BUYER"]
                warnings.append(f"No optimized route found for trip carrying "
                                f"{[f['id'] for f in trip_farmers]}; used summed direct distances instead.")
            else:
                distance_km = route["distance_km"]
                stops = route["stops"]

        trips_out.append({
            "vehicle_class": t["vehicle_class"],
            "total_weight_kg": round(t["total_weight"], 2),
            "farmer_ids": [f["id"] for f in trip_farmers],
            "distance_km": round(distance_km, 2),
            "stops": stops,
        })

    return {
        "allocations": [
            {"farmer_id": f["id"], "crop_id": f.get("crop_id"), "allocated_kg": round(f["weight_kg"], 2)}
            for f in allocated_farmers
        ],
        "trips": trips_out,
        "total_allocated_kg": round(sum(f["weight_kg"] for f in allocated_farmers), 2),
        "warnings": warnings,
    }


# ---------------------------------------------------------------------------
# MAIN PIPELINE
# ---------------------------------------------------------------------------
def run_pipeline(shed, farmers, buyers):
    print("=" * 70)
    print("PHASE 1: ALLOCATION (farmer supply -> buyer demand)")
    print("=" * 70)
    
    allocation, dist_matrix, lp_result = allocate(farmers, buyers)
    
    for buyer_id, assigns in allocation.items():
        total = sum(q for _, q in assigns)
        buyer_req = next(b["weight_req_kg"] for b in buyers if b["id"] == buyer_id)
        print(f"\nBuyer {buyer_id} (requires {buyer_req} kg):")
        for farmer_id, qty in assigns:
            print(f"   {farmer_id} -> {qty} kg")
        print(f"   TOTAL ALLOCATED: {total} kg "
              f"({round(100*total/buyer_req,1)}% of requirement)")

    grand_total_cost = 0

    for buyer in buyers:
        print("\n" + "=" * 70)
        print(f"BUYER {buyer['id']} — Vehicle Bin-Packing, Routing, Cost")
        print("=" * 70)

        assigns = allocation[buyer["id"]]
        if not assigns:
            print("No farmers allocated to this buyer. Skipping.")
            continue

        farmer_points = []
        for farmer_id, qty in assigns:
            f = next(f for f in farmers if f["id"] == farmer_id)
            farmer_points.append({**f, "id": farmer_id, "weight_kg": qty})

        print(f"\nPHASE 2: Vehicle Bin-Packing "
              f"(total {sum(f['weight_kg'] for f in farmer_points)} kg "
              f"across {len(farmer_points)} farmers)")
        trips = bin_pack_farmers_to_vehicles(farmer_points, VEHICLE_CLASSES)
        for t in trips:
            farmer_ids = [f["id"] for f in t["farmers"]]
            print(f"   {t['vehicle_class']} | carries {farmer_ids} "
                  f"| {t['total_weight']}kg | ₹{t['cost_per_km']}/km")

        print(f"\nPHASE 3 + 4: Route Optimization & Cost per Vehicle Trip")
        buyer_total_cost = 0
        for t in trips:
            result = optimize_single_trip_route(
                shed, t["farmers"], buyer, t["cost_per_km"]
            )
            if result is None:
                print(f"   [{t['vehicle_class']}] NO FEASIBLE ROUTE FOUND")
                continue
            print(f"   [{t['vehicle_class']}] Route: "
                  f"{' -> '.join(result['stops'])} | "
                  f"{result['distance_km']} km | Cost: ₹{result['cost']}")
            buyer_total_cost += result["cost"]

        print(f"\n   >>> TOTAL LOGISTICS COST for {buyer['id']}: ₹{round(buyer_total_cost,2)}")
        grand_total_cost += buyer_total_cost

    print("\n" + "=" * 70)
    print(f"GRAND TOTAL LOGISTICS COST (all buyers): ₹{round(grand_total_cost, 2)}")
    print("=" * 70)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Agricultural Logistics Route Optimization Engine")
    
    parser.add_argument(
        "--shed", 
        type=str, 
        required=True, 
        help="Shed pincode (e.g., 506001)"
    )
    parser.add_argument(
        "--farmers", 
        nargs="+", 
        required=True, 
        help="List of farmers as PINCODE:WEIGHT_KG (e.g., 506002:1200 506003:900)"
    )
    parser.add_argument(
        "--buyers", 
        nargs="+", 
        required=True, 
        help="List of buyers as PINCODE:DEMAND_KG (e.g., 506007:2200 506008:2000)"
    )

    args = parser.parse_args()

    try:
        # 1. Parse and Resolve Shed
        shed_lat, shed_lon = resolve_pincode(args.shed)
        shed_data = {"id": f"Shed_{args.shed}", "lat": shed_lat, "lon": shed_lon}

        # 2. Parse and Resolve Farmers
        farmers_data = []
        for idx, f_entry in enumerate(args.farmers, start=1):
            try:
                pincode, weight = f_entry.split(":")
            except ValueError:
                print(f"Error: Invalid farmer format '{f_entry}'. Expected PINCODE:WEIGHT_KG")
                sys.exit(1)
            lat, lon = resolve_pincode(pincode)
            farmers_data.append({
                "id": f"F{idx}_{pincode}",
                "lat": lat,
                "lon": lon,
                "weight_kg": float(weight)
            })

        # 3. Parse and Resolve Buyers
        buyers_data = []
        for idx, b_entry in enumerate(args.buyers, start=1):
            try:
                pincode, demand = b_entry.split(":")
            except ValueError:
                print(f"Error: Invalid buyer format '{b_entry}'. Expected PINCODE:DEMAND_KG")
                sys.exit(1)
            lat, lon = resolve_pincode(pincode)
            buyers_data.append({
                "id": f"B{idx}_{pincode}",
                "lat": lat,
                "lon": lon,
                "weight_req_kg": float(demand)
            })
    except (ValueError, FileNotFoundError) as exc:
        print(f"Error: {exc}")
        sys.exit(1)

    # Execute Pipeline
    run_pipeline(shed_data, farmers_data, buyers_data)
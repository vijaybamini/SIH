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


def _stop_label(node):
    """A route's `stops` list is shown to the logistics provider as the
    actual pickup/drop points on their job -- a farmer's raw UUID (their
    node "id", used internally for allocation tracking) tells a driver
    nothing about where to go. Prefer a human-meaningful pincode when the
    node carries one; only fall back to the id for nodes that don't
    (e.g. a synthetic depot)."""
    return str(node.get("pincode") or node.get("id", "NODE"))


# ---------------------------------------------------------------------------
# PHASE 1: ALLOCATION 
# ---------------------------------------------------------------------------
def allocate(farmers, buyers):
    if not farmers or not buyers:
        return {b["id"]: [] for b in buyers}, [], None

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

    if not result.success:
        raise ValueError(f"Allocation optimization failed: {result.message}")

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
        route_nodes.append(_stop_label(nodes[node]))
        prev_index = index
        index = solution.Value(routing.NextVar(index))
        route_distance_m += dist_matrix[manager.IndexToNode(prev_index)][manager.IndexToNode(index)]
    route_nodes.append(_stop_label(nodes[manager.IndexToNode(index)]))

    return {
        "stops": route_nodes,
        "distance_km": round(route_distance_m / 1000.0, 2),
        "cost": round((route_distance_m / 1000.0) * cost_per_km, 2),
    }


# ---------------------------------------------------------------------------
# PHASE 1B: CROP-COMPATIBILITY GROUPING
# ---------------------------------------------------------------------------
def _group_by_crop(nodes):
    """Splits nodes into {crop_id: [nodes]}, keyed by exact crop_id match.
    Nodes with no crop_id recorded are returned separately (`uncropped`)
    rather than folded into any group, since their compatibility with a
    given crop can't be verified -- crop_id is the ONLY compatibility key
    (Section 13); it is never inferred from proximity or anything else."""
    groups = {}
    uncropped = []
    for node in nodes:
        crop = node.get("crop_id")
        if crop is None:
            uncropped.append(node)
        else:
            groups.setdefault(crop, []).append(node)
    return groups, uncropped


def _resolve_dominant_crop(resolved_farmers, warnings):
    """Crop-compatibility guard for the single-buyer entrypoint: if the
    resolved farmer listings span more than one distinct crop_id, keep only
    the crop with the most available supply and warn about the rest --
    pooling different crops into one shipment is never allowed (Section 1
    / Section 13). Farmers with no crop_id recorded are left in place
    unless a real crop_id is ALSO present among the listings, in which case
    they're excluded too since their compatibility with that crop can't be
    verified."""
    present = [f for f in resolved_farmers if f.get("crop_id")]
    crop_ids = {f["crop_id"] for f in present}

    if len(crop_ids) <= 1:
        missing = [f for f in resolved_farmers if not f.get("crop_id")]
        if present and missing:
            warnings.append(
                f"{len(missing)} farmer listing(s) had no crop_id and were excluded since crop "
                f"compatibility with the '{next(iter(crop_ids))}' shipment could not be verified: "
                f"{[f['id'] for f in missing]}"
            )
            return present, next(iter(crop_ids))
        return resolved_farmers, (next(iter(crop_ids)) if crop_ids else None)

    groups = {}
    for f in present:
        groups.setdefault(f["crop_id"], []).append(f)
    best_crop = max(groups, key=lambda c: sum(f["weight_kg"] for f in groups[c]))
    excluded = [f["id"] for c, fs in groups.items() if c != best_crop for f in fs]
    excluded += [f["id"] for f in resolved_farmers if not f.get("crop_id")]
    warnings.append(
        f"Farmer listings span multiple crop_ids ({sorted(crop_ids)}); only crop '{best_crop}' "
        f"was used for this order to avoid pooling different crops together. Excluded: {excluded}"
    )
    return groups[best_crop], best_crop


# ---------------------------------------------------------------------------
# PHASE 3B: POOLED MULTI-FARMER / MULTI-CUSTOMER ROUTE OPTIMIZATION
# ---------------------------------------------------------------------------
def _optimize_pooled_route(farmer_nodes, customer_nodes, time_limit_s=5):
    """Open-path route over `farmer_nodes` (pickups) followed by
    `customer_nodes` (deliveries), with NEITHER the starting farmer NOR the
    internal visiting order fixed -- OR-Tools evaluates every feasible
    ordering and picks whichever minimizes total real road distance
    (Section 7, Section 9, Section 10).

    Implemented with two tricks, both purely about ROUTE COST, not
    direction/geography (Section 8 forbids directional-flow scoring):
      1. A zero-cost dummy depot gives a free start and a free end, so the
         route is a true open path rather than a round trip back to a
         fixed node (see optimize_single_trip_route's docstring for why a
         REAL node used as a shared start/end inflates distance).
      2. Any customer->farmer edge is priced at a prohibitive penalty. This
         is a pickup-before-delivery SEQUENCING constraint (you can't
         deliver cargo you haven't picked up yet), not a geographic
         directional-flow constraint -- farmer visiting order and customer
         visiting order within their own groups remain entirely free.

    Returns {"stops": [...], "distance_km": float} or None if no feasible
    solution was found (caller should fall back to _greedy_pooled_route).
    """
    if not farmer_nodes:
        return None  # every trip needs at least one pickup

    nodes = farmer_nodes + customer_nodes
    n_real = len(nodes)
    n_farmers = len(farmer_nodes)
    dummy = n_real
    size = n_real + 1

    real_dist = [[int(road_distance_km(a, b) * 1000) for b in nodes] for a in nodes]
    large = sum(sum(row) for row in real_dist) + 1  # costs more than any real route ever could

    dist_matrix = [[0] * size for _ in range(size)]
    for i in range(n_real):
        for j in range(n_real):
            if i == j:
                continue
            is_i_customer = i >= n_farmers
            is_j_farmer = j < n_farmers
            dist_matrix[i][j] = large if (is_i_customer and is_j_farmer) else real_dist[i][j]
    for i in range(n_real):
        is_customer = i >= n_farmers
        dist_matrix[dummy][i] = large if (is_customer and customer_nodes) else 0
        dist_matrix[i][dummy] = 0

    manager = pywrapcp.RoutingIndexManager(size, 1, [dummy], [dummy])
    routing = pywrapcp.RoutingModel(manager)

    def distance_callback(from_index, to_index):
        return dist_matrix[manager.IndexToNode(from_index)][manager.IndexToNode(to_index)]

    transit_callback_index = routing.RegisterTransitCallback(distance_callback)
    routing.SetArcCostEvaluatorOfVehicle(transit_callback_index, 0)

    search_params = pywrapcp.DefaultRoutingSearchParameters()
    search_params.first_solution_strategy = (
        routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC
    )
    search_params.time_limit.FromSeconds(time_limit_s)

    solution = routing.SolveWithParameters(search_params)
    if not solution:
        return None

    index = routing.Start(0)
    route_node_indices = []
    route_distance_m = 0
    while not routing.IsEnd(index):
        node = manager.IndexToNode(index)
        if node != dummy:
            route_node_indices.append(node)
        next_index = solution.Value(routing.NextVar(index))
        next_node = manager.IndexToNode(next_index)
        if node != dummy and next_node != dummy:
            route_distance_m += real_dist[node][next_node]
        index = next_index

    if len(route_node_indices) != n_real:
        return None  # not every pickup/delivery got visited -- treat as infeasible

    return {
        "stops": [_stop_label(nodes[i]) for i in route_node_indices],
        "distance_km": round(route_distance_m / 1000.0, 2),
    }


def _nearest_neighbor_path(start, others):
    """Greedy nearest-neighbor walk starting AT `start` (not counted as a
    leg) through every node in `others`. Returns (ordered_others,
    total_leg_distance_km)."""
    remaining = list(others)
    seq = []
    total = 0.0
    current = start
    while remaining:
        nxt = min(remaining, key=lambda n: road_distance_km(current, n))
        total += road_distance_km(current, nxt)
        seq.append(nxt)
        remaining.remove(nxt)
        current = nxt
    return seq, total


def _greedy_pooled_route(farmer_nodes, customer_nodes):
    """Real greedy feasible route, used ONLY when OR-Tools fails to find a
    solution (Section 11). Unlike a fallback that sums each farmer's and
    each customer's direct distance to a single point -- which is not a
    valid vehicle path -- this walks an actual sequence of route legs:
    every candidate farmer is tried as the first pickup (Section 7), the
    rest of the farmers are visited nearest-neighbor, then the customers
    are visited nearest-neighbor from the last farmer. The caller marks the
    result as a fallback/non-optimized solution."""
    best_start_route, best_start_distance = None, None
    for start in farmer_nodes:
        rest = [f for f in farmer_nodes if f is not start]
        seq, dist = _nearest_neighbor_path(start, rest)
        if best_start_distance is None or dist < best_start_distance:
            best_start_route, best_start_distance = ([start] + seq), dist

    route = list(best_start_route)
    total_distance_km = best_start_distance

    if customer_nodes:
        cust_seq, cust_dist = _nearest_neighbor_path(route[-1], customer_nodes)
        route.extend(cust_seq)
        total_distance_km += cust_dist

    return {
        "stops": [_stop_label(n) for n in route],
        "distance_km": round(total_distance_km, 2),
    }


def _route_bin(farmer_nodes, customer_nodes):
    route = _optimize_pooled_route(farmer_nodes, customer_nodes)
    if route is not None:
        return route, False
    return _greedy_pooled_route(farmer_nodes, customer_nodes), True


# ---------------------------------------------------------------------------
# PHASE 2B: CAPACITY-AWARE BIN-PACKING OF ALLOCATION EDGES
# ---------------------------------------------------------------------------
def _split_oversized_edges(edges, max_usable_kg):
    """Splits any single (farmer, customer, qty) allocation edge that alone
    exceeds the largest available vehicle's usable capacity into multiple
    max_usable_kg-sized chunks (Section 4's 2,500kg -> 1,350kg + 1,150kg
    example), so capacity-aware bin-packing downstream never has to reject
    an edge outright."""
    split = []
    for farmer, customer, qty in edges:
        remaining = qty
        while remaining > 1e-6:
            chunk = min(remaining, max_usable_kg)
            split.append((farmer, customer, chunk))
            remaining -= chunk
    return split


def _bin_pack_edges(edges, vehicle_classes):
    """Greedily packs allocation edges into vehicle-capacity-aware bins,
    first-fit-decreasing by quantity (same strategy as
    bin_pack_farmers_to_vehicles). Each bin becomes one pooled vehicle trip;
    the distinct farmers and customers referenced by a bin's edges are
    exactly that trip's pickup/delivery stops. Pooling emerges only when
    edges happen to fit together under the capacity cap -- nothing here
    forces it (Section 3)."""
    largest_usable = max(vc["capacity_kg"] for vc in vehicle_classes) * UTILIZATION_LIMIT
    remaining = sorted(_split_oversized_edges(edges, largest_usable), key=lambda e: -e[2])

    bins = []
    while remaining:
        bin_edges = []
        bin_weight = 0.0
        for e in list(remaining):
            candidate_weight = bin_weight + e[2]
            vc = pick_vehicle_class_for_load(candidate_weight, vehicle_classes)
            if vc is not None:
                bin_edges.append(e)
                bin_weight = candidate_weight
                remaining.remove(e)
        vc = pick_vehicle_class_for_load(bin_weight, vehicle_classes)
        bins.append({"edges": bin_edges, "weight": bin_weight, "vehicle": vc})
    return bins


def _aggregate_bin_nodes(edges):
    farmer_map, customer_map = {}, {}
    for farmer, customer, qty in edges:
        fe = farmer_map.setdefault(farmer["id"], {"node": farmer, "qty": 0.0})
        fe["qty"] += qty
        ce = customer_map.setdefault(customer["id"], {"node": customer, "qty": 0.0})
        ce["qty"] += qty
    return farmer_map, customer_map


def _make_trip(vehicle, weight_kg, farmer_ids, customer_ids, route, is_fallback):
    return {
        "vehicle_class": vehicle["name"],
        "total_weight_kg": round(weight_kg, 2),
        "farmer_ids": list(farmer_ids),
        "customer_ids": list(customer_ids),
        "stops": route["stops"],
        "distance_km": route["distance_km"],
        "is_fallback": is_fallback,
    }


# ---------------------------------------------------------------------------
# PHASE 1C-4: CROP-AWARE, CAPACITY-AWARE, MULTI-FARMER/MULTI-CUSTOMER
# POOLING + ROUTE OPTIMIZATION ENGINE
#
#                  ALL FARMERS
#                       |
#                 GROUP BY CROP
#                       |
#              MATCH SAME-CROP
#                 SUPPLY/DEMAND  (LP allocation, allocate())
#                       |
#                VEHICLE POOLING  (bin-pack allocation edges by capacity)
#                       |
#               CAPACITY CHECK
#                       |
#           CHOOSE OPTIMAL FIRST PICKUP + ROUTE  (_optimize_pooled_route)
#                       |
#              MULTIPLE CUSTOMERS
#                       |
#                    DELIVERY
# ---------------------------------------------------------------------------
def _plan_crop_group(crop_id, farmers, customers, vehicle_classes):
    """Allocates and routes ONE crop's worth of same-crop farmers against
    same-crop customers. Never called with mixed crops -- see
    plan_pooled_deliveries / _resolve_dominant_crop for where crop
    separation happens."""
    warnings = []
    total_demand = sum(c["weight_req_kg"] for c in customers)

    allocation_dict, _dist_matrix, _lp_result = allocate(farmers, customers)

    farmer_by_id = {f["id"]: f for f in farmers}
    allocation_edges = []
    for customer in customers:
        for farmer_id, qty in allocation_dict.get(customer["id"], []):
            if qty > 1e-6:
                allocation_edges.append((farmer_by_id[farmer_id], customer, qty))

    total_allocated = sum(qty for _f, _c, qty in allocation_edges)
    if total_allocated < total_demand - 1e-3:
        warnings.append(
            f"Only {total_allocated:.0f}kg of {total_demand:.0f}kg requested for crop '{crop_id}' "
            f"could be allocated from available supply; planning reflects the {total_allocated:.0f}kg "
            f"that is actually deliverable."
        )

    if not allocation_edges:
        return {"crop_id": crop_id, "allocations": [], "trips": [], "total_allocated_kg": 0.0, "warnings": warnings}

    bins = _bin_pack_edges(allocation_edges, vehicle_classes)

    trips = []
    for b in bins:
        farmer_map, customer_map = _aggregate_bin_nodes(b["edges"])
        farmer_nodes = [dict(v["node"], weight_kg=v["qty"]) for v in farmer_map.values()]
        customer_nodes = [dict(v["node"], weight_req_kg=v["qty"]) for v in customer_map.values()]

        if len(farmer_map) > 1 or len(customer_map) > 1:
            # Pooling only pays off if the shared route is actually shorter
            # than delivering each farmer-customer pair separately --
            # pooling must stay OPTIONAL (Section 3), decided by route
            # distance/feasibility, not forced just because it fits.
            pooled_route, pooled_is_fallback = _route_bin(farmer_nodes, customer_nodes)
            separate_distance = sum(road_distance_km(f, c) for f, c, _q in b["edges"])

            if pooled_route["distance_km"] <= separate_distance:
                trips.append(_make_trip(b["vehicle"], b["weight"], farmer_map.keys(), customer_map.keys(),
                                         pooled_route, pooled_is_fallback))
            else:
                warnings.append(
                    f"Pooling farmers {list(farmer_map)} with customers {list(customer_map)} would add "
                    f"{pooled_route['distance_km'] - separate_distance:.1f}km of route distance versus "
                    f"delivering each farmer-customer pair separately; split into individual vehicle trips."
                )
                for farmer, customer, qty in b["edges"]:
                    vc = pick_vehicle_class_for_load(qty, vehicle_classes)
                    route = {"stops": [str(farmer["id"]), str(customer["id"])],
                             "distance_km": round(road_distance_km(farmer, customer), 2)}
                    trips.append(_make_trip(vc, qty, [farmer["id"]], [customer["id"]], route, False))
        else:
            route, is_fallback = _route_bin(farmer_nodes, customer_nodes)
            trips.append(_make_trip(b["vehicle"], b["weight"], farmer_map.keys(), customer_map.keys(),
                                     route, is_fallback))

    allocations_out = [
        {"farmer_id": f["id"], "customer_id": c["id"], "crop_id": crop_id, "allocated_kg": round(qty, 2)}
        for f, c, qty in allocation_edges
    ]

    return {
        "crop_id": crop_id,
        "allocations": allocations_out,
        "trips": trips,
        "total_allocated_kg": round(total_allocated, 2),
        "warnings": warnings,
    }


def plan_pooled_deliveries(farmers, customers, vehicle_classes=None):
    """
    General-purpose, crop-aware, multi-farmer, multi-customer pooling +
    route-optimization engine.

    farmers: dicts with "id", "crop_id", "lat", "lon", "weight_kg".
    customers: dicts with "id", "crop_id", "lat", "lon", "weight_req_kg".

    Returns a list of per-crop result dicts -- one per crop_id present in
    either input -- each shaped:
      {"crop_id", "allocations", "trips", "total_allocated_kg", "warnings"}
    A vehicle trip's farmer_ids/customer_ids always belong to exactly one
    crop_id; crops are never pooled together (Section 13).
    """
    vehicle_classes = vehicle_classes or VEHICLE_CLASSES
    global_warnings = []

    farmer_groups, uncropped_f = _group_by_crop(farmers)
    customer_groups, uncropped_c = _group_by_crop(customers)
    if uncropped_f:
        global_warnings.append(f"{len(uncropped_f)} farmer(s) missing crop_id were excluded from "
                                f"crop-aware pooling: {[f['id'] for f in uncropped_f]}")
    if uncropped_c:
        global_warnings.append(f"{len(uncropped_c)} customer(s) missing crop_id were excluded from "
                                f"crop-aware pooling: {[c['id'] for c in uncropped_c]}")

    results = []
    for crop_id in sorted(set(farmer_groups) | set(customer_groups)):
        crop_farmers = farmer_groups.get(crop_id, [])
        crop_customers = customer_groups.get(crop_id, [])
        if not crop_farmers or not crop_customers:
            missing_side = "customers" if crop_farmers else "farmers"
            global_warnings.append(f"crop '{crop_id}' has no matching {missing_side}; nothing allocated.")
            continue
        results.append(_plan_crop_group(crop_id, crop_farmers, crop_customers, vehicle_classes))

    if global_warnings:
        if results:
            results[0]["warnings"] = global_warnings + results[0]["warnings"]
        else:
            results.append({"crop_id": None, "allocations": [], "trips": [],
                             "total_allocated_kg": 0.0, "warnings": global_warnings})

    return results


# ---------------------------------------------------------------------------
# SINGLE-BUYER ENTRYPOINT (for the live API -- run_pipeline() below is
# CLI-only: it always wants a separate shed pincode and prints instead of
# returning structured data)
# ---------------------------------------------------------------------------
def plan_multi_farmer_delivery(buyer_pincode, buyer_demand_kg, farmer_candidates):
    """
    Single-buyer convenience wrapper around the crop-aware pooling engine
    (_plan_crop_group / plan_pooled_deliveries): resolves pincodes, then
    allocates buyer_demand_kg across farmer_candidates (LP-optimal supply
    split), bin-packs the allocation into capacity-aware vehicle trips, and
    routes each trip. There's no separate shed/warehouse in this codebase,
    so a trip's route starts at whichever of its farmers OR-Tools determines
    minimizes total route distance, rather than a fixed depot or the first
    farmer in the input list.

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
            "pincode": cand.get("pincode"),
            "lat": lat,
            "lon": lon,
            "weight_kg": float(cand["available_kg"]),
            "harvested": cand.get("harvested"),
            "harvest_date": cand.get("harvest_date"),
        })

    if not resolved_farmers:
        raise ValueError("No farmer listings with a resolvable pincode are available for this commodity.")

    total_available = sum(f["weight_kg"] for f in resolved_farmers)
    if total_available < buyer_demand_kg:
        warnings.append(
            f"Only {total_available:.0f}kg of real farmer supply has a resolvable "
            f"location (requested {buyer_demand_kg:.0f}kg) -- allocating what's available."
        )

    # Crop-compatibility guard (Section 13): commodity_supply_listings() is
    # already filtered to one commodity upstream, so this is a defensive
    # backstop, not the primary matching mechanism -- see
    # plan_pooled_deliveries for a caller that genuinely mixes crops.
    resolved_farmers, crop_id = _resolve_dominant_crop(resolved_farmers, warnings)

    buyer_node["weight_req_kg"] = buyer_demand_kg
    plan = _plan_crop_group(crop_id, resolved_farmers, [buyer_node], VEHICLE_CLASSES)
    if plan["total_allocated_kg"] <= 0:
        raise ValueError("Could not allocate any farmer supply to this order.")

    freshness_by_key = {
        (f["id"], f["crop_id"]): (f.get("harvested"), f.get("harvest_date")) for f in resolved_farmers
    }
    allocations_out = []
    for e in plan["allocations"]:
        harvested, harvest_date = freshness_by_key.get((e["farmer_id"], e["crop_id"]), (None, None))
        allocations_out.append({
            "farmer_id": e["farmer_id"], "crop_id": e["crop_id"], "allocated_kg": e["allocated_kg"],
            "harvested": harvested, "harvest_date": harvest_date,
        })

    return {
        "allocations": allocations_out,
        "trips": plan["trips"],
        "total_allocated_kg": plan["total_allocated_kg"],
        "warnings": warnings + plan["warnings"],
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
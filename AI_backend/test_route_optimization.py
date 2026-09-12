"""
Validation test suite for route_optimization.py's crop-aware pooling +
route-optimization engine.

Uses synthetic in-memory farmer/customer nodes (lat/lon supplied directly)
so these tests don't depend on the pincode CSV or resolve_pincode() --
pincode resolution is a separate, already-covered concern. Run directly:

    python test_route_optimization.py
"""
import itertools
import unittest
from unittest import mock

import route_optimization as ro


def farmer(id_, crop_id, lat, lon, weight_kg):
    return {"id": id_, "crop_id": crop_id, "lat": lat, "lon": lon, "weight_kg": weight_kg}


def customer(id_, crop_id, lat, lon, weight_req_kg):
    return {"id": id_, "crop_id": crop_id, "lat": lat, "lon": lon, "weight_req_kg": weight_req_kg}


def brute_force_best_distance(farmer_nodes, customer_nodes):
    """Exhaustively tries every farmer-order x customer-order combination
    (pickups always before deliveries) and returns the minimum total route
    distance, as an independent ground truth for the optimizer's output."""
    best = None
    for f_perm in itertools.permutations(farmer_nodes):
        for c_perm in itertools.permutations(customer_nodes):
            seq = list(f_perm) + list(c_perm)
            dist = sum(ro.road_distance_km(seq[i], seq[i + 1]) for i in range(len(seq) - 1))
            if best is None or dist < best:
                best = dist
    return best


class TestRouteOptimizationEngine(unittest.TestCase):

    # -- Test 1: one farmer, one customer -----------------------------------
    def test_1_single_farmer_single_customer(self):
        f = [farmer("F1", "tomato", 17.00, 78.00, 500)]
        c = [customer("C1", "tomato", 17.20, 78.20, 500)]
        results = ro.plan_pooled_deliveries(f, c)
        self.assertEqual(len(results), 1)
        plan = results[0]
        self.assertEqual(plan["crop_id"], "tomato")
        self.assertEqual(plan["total_allocated_kg"], 500)
        self.assertEqual(len(plan["trips"]), 1)
        trip = plan["trips"][0]
        self.assertEqual(trip["farmer_ids"], ["F1"])
        self.assertEqual(trip["customer_ids"], ["C1"])
        self.assertAlmostEqual(trip["distance_km"], ro.road_distance_km(f[0], c[0]), places=2)

    # -- Test 2: multiple same-crop farmers pooled to one customer ----------
    def test_2_multi_farmer_same_crop_pooled(self):
        f = [
            farmer("F1", "tomato", 17.00, 78.00, 500),
            farmer("F2", "tomato", 17.05, 78.05, 400),
            farmer("F3", "tomato", 17.10, 78.02, 300),
        ]
        c = [customer("C1", "tomato", 17.30, 78.30, 1200)]
        results = ro.plan_pooled_deliveries(f, c)
        plan = results[0]
        self.assertEqual(plan["total_allocated_kg"], 1200)
        # all three farmers should be reachable in one or more trips that
        # together cover the full 1200kg
        farmer_ids_seen = set()
        for trip in plan["trips"]:
            farmer_ids_seen.update(trip["farmer_ids"])
        self.assertEqual(farmer_ids_seen, {"F1", "F2", "F3"})
        # since 1200kg pools under the largest vehicle's usable capacity,
        # pooling should have been chosen (not forced into 3 separate trips)
        self.assertTrue(any(len(t["farmer_ids"]) > 1 for t in plan["trips"]))

    # -- Test 3: different crops must NOT pool -------------------------------
    def test_3_different_crops_not_pooled(self):
        f = [
            farmer("F1", "tomato", 17.00, 78.00, 500),
            farmer("F2", "onion", 17.01, 78.01, 500),
        ]
        c = [
            customer("C1", "tomato", 17.20, 78.20, 500),
            customer("C2", "onion", 17.21, 78.21, 500),
        ]
        results = ro.plan_pooled_deliveries(f, c)
        crop_ids = {r["crop_id"] for r in results}
        self.assertEqual(crop_ids, {"tomato", "onion"})
        for plan in results:
            for trip in plan["trips"]:
                # every farmer/customer referenced in a trip must belong to
                # this trip's own crop group
                self.assertTrue(all(fid in ("F1",) for fid in trip["farmer_ids"]) or
                                 all(fid in ("F2",) for fid in trip["farmer_ids"]))

    # -- Test 4: multiple same-crop customers pooled -------------------------
    def test_4_multi_customer_same_crop_pooled(self):
        f = [
            farmer("F1", "tomato", 17.00, 78.00, 500),
            farmer("F2", "tomato", 17.02, 78.02, 400),
        ]
        c = [
            customer("C1", "tomato", 17.30, 78.30, 500),
            customer("C2", "tomato", 17.31, 78.32, 400),
        ]
        results = ro.plan_pooled_deliveries(f, c)
        plan = results[0]
        self.assertEqual(plan["total_allocated_kg"], 900)
        pooled_multi_customer = any(len(t["customer_ids"]) > 1 for t in plan["trips"])
        self.assertTrue(pooled_multi_customer, "expected at least one trip serving both customers")
        for trip in plan["trips"]:
            self.assertLessEqual(trip["total_weight_kg"], max(vc["capacity_kg"] for vc in ro.VEHICLE_CLASSES))

    # -- Test 5: vehicle capacity exceeded -> multiple vehicles --------------
    def test_5_capacity_exceeded_splits_vehicles(self):
        largest_usable = max(vc["capacity_kg"] for vc in ro.VEHICLE_CLASSES) * ro.UTILIZATION_LIMIT
        shipment_kg = largest_usable * 1.5  # deliberately more than one vehicle can carry

        f = [farmer("F1", "tomato", 17.00, 78.00, shipment_kg)]
        c = [customer("C1", "tomato", 17.05, 78.05, shipment_kg)]
        results = ro.plan_pooled_deliveries(f, c)
        plan = results[0]
        self.assertAlmostEqual(plan["total_allocated_kg"], shipment_kg, places=1)
        self.assertGreaterEqual(len(plan["trips"]), 2)
        for trip in plan["trips"]:
            self.assertLessEqual(trip["total_weight_kg"], largest_usable + 1e-6)

    # -- Test 6: insufficient farmer supply -> partial + warning ------------
    def test_6_insufficient_supply_warns(self):
        f = [farmer("F1", "tomato", 17.00, 78.00, 300)]
        c = [customer("C1", "tomato", 17.05, 78.05, 1000)]
        results = ro.plan_pooled_deliveries(f, c)
        plan = results[0]
        self.assertEqual(plan["total_allocated_kg"], 300)
        self.assertTrue(any("could be allocated" in w for w in plan["warnings"]))

    # -- Test 7: optimal first pickup, independent of input order -----------
    def test_7_optimal_first_pickup_independent_of_input_order(self):
        f_a = farmer("A", "tomato", 17.000, 78.000, 100)
        f_b = farmer("B", "tomato", 17.090, 78.090, 100)
        f_c = farmer("C", "tomato", 17.270, 78.045, 100)
        cust = customer("CUST", "tomato", 17.360, 78.360, 300)

        expected_best = brute_force_best_distance([f_a, f_b, f_c], [cust])

        orderings = [
            [f_a, f_b, f_c],
            [f_b, f_c, f_a],
            [f_c, f_a, f_b],
            [f_c, f_b, f_a],
        ]
        distances = []
        for farmers_in_order in orderings:
            results = ro.plan_pooled_deliveries(farmers_in_order, [cust])
            plan = results[0]
            self.assertEqual(len(plan["trips"]), 1)
            distances.append(plan["trips"][0]["distance_km"])

        for d in distances:
            self.assertAlmostEqual(d, expected_best, places=1)
        # all input orderings must converge on the same (optimal) distance
        self.assertEqual(len(set(round(d, 1) for d in distances)), 1)

    # -- Test 8: OR-Tools fallback produces a real route ---------------------
    def test_8_or_tools_fallback_real_route(self):
        f = [
            farmer("F1", "tomato", 17.00, 78.00, 300),
            farmer("F2", "tomato", 17.05, 78.05, 300),
        ]
        c = [customer("C1", "tomato", 17.20, 78.20, 600)]

        with mock.patch.object(ro, "_optimize_pooled_route", return_value=None):
            results = ro.plan_pooled_deliveries(f, c)

        plan = results[0]
        self.assertEqual(len(plan["trips"]), 1)
        trip = plan["trips"][0]
        self.assertTrue(trip["is_fallback"])
        self.assertEqual(set(trip["stops"]), {"F1", "F2", "C1"})
        self.assertEqual(trip["stops"][-1], "C1")  # last stop is the delivery
        # the fallback must be a real route (sum of actual legs), NOT the
        # old bug of summing each farmer's own direct distance to the buyer
        naive_wrong_distance = sum(ro.road_distance_km(fn, c[0]) for fn in f)
        legs = list(zip(trip["stops"], trip["stops"][1:]))
        node_by_id = {n["id"]: n for n in f + c}
        real_leg_distance = sum(ro.road_distance_km(node_by_id[a], node_by_id[b]) for a, b in legs)
        self.assertAlmostEqual(trip["distance_km"], real_leg_distance, places=2)
        self.assertNotAlmostEqual(trip["distance_km"], naive_wrong_distance, places=2)

    # -- Test 9: LP failure is reported cleanly -------------------------------
    def test_9_lp_failure_reported_cleanly(self):
        f = [farmer("F1", "tomato", 17.00, 78.00, 500)]
        c = [customer("C1", "tomato", 17.05, 78.05, 500)]

        class FakeResult:
            success = False
            message = "simulated infeasible LP"

        with mock.patch.object(ro, "linprog", return_value=FakeResult()):
            with self.assertRaises(ValueError) as ctx:
                ro.allocate(f, c)
        self.assertIn("simulated infeasible LP", str(ctx.exception))

        with mock.patch.object(ro, "linprog", return_value=FakeResult()):
            with self.assertRaises(ValueError):
                ro.plan_pooled_deliveries(f, c)

    # -- Test 10: pooling split into separate vehicles when unnecessarily long
    def test_10_poor_pooling_splits_into_separate_trips(self):
        # Two farmers in opposite directions from their respective
        # customers -- pooling them into one shared route detours far more
        # than just delivering each pair directly.
        f = [
            farmer("F1", "tomato", 17.000, 78.000, 300),
            farmer("F2", "tomato", 10.000, 90.000, 300),
        ]
        c = [
            customer("C1", "tomato", 17.010, 78.010, 300),
            customer("C2", "tomato", 10.010, 90.010, 300),
        ]
        results = ro.plan_pooled_deliveries(f, c)
        plan = results[0]
        self.assertEqual(plan["total_allocated_kg"], 600)
        # each far-apart pair should be routed as its own trip rather than
        # one long detouring pooled trip
        self.assertTrue(all(len(t["farmer_ids"]) == 1 and len(t["customer_ids"]) == 1
                             for t in plan["trips"]))
        self.assertTrue(any("split into individual vehicle trips" in w for w in plan["warnings"]))


if __name__ == "__main__":
    unittest.main(verbosity=2)

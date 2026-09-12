"""
Dynamic Consumer Pricing Engine
==================================================
Calculates the final consumer price by fusing:
  1. Historical/Forecasted Baseline Price (from APMC data)
  2. Macro Market Demand (overall trend percentage)
  3. Micro Platform Scarcity (POOLED demand across every buyer currently
     competing for this commodity vs. available local supply — not just
     the one buyer whose order happens to be in front of you; see
     demand_pool.py)
  4. Incurred Logistics Freight Cost (from the routing/pricing engine, passed
     through at exactly what the driver is quoted — no platform markup there)

Multi-buyer model: the per-kg PRICE is a shared, market-clearing number set
by pooled_demand_kg (every live buyer's demand for this commodity) against
total_platform_supply_kg. Each buyer's own BILL is then that shared price
times their own order_demand_kg. This mirrors a real market: five buyers
each wanting 500kg of a 2000kg-supply commodity all see the same, higher
price, because collectively they'd exhaust the supply -- not five separate
prices computed as if each were the only buyer in the market.

Commission model: the platform's cut is taken ONLY from the farmer's crop-value
share (a percentage of the market crop price), the same way a normal
marketplace commission works. Freight is a service the platform is paying the
driver for, not a product it resells, so it is never marked up — the buyer
pays the driver's exact quoted freight, and the farmer's net payout is the
market crop price minus the platform's commission.
"""

from dataclasses import dataclass
from typing import Dict, Any

@dataclass
class ConsumerQuote:
    # Anchor values
    base_price_per_kg: float
    order_demand_kg: float
    pooled_demand_kg: float        # this order + every other live buyer's demand for this commodity
    total_platform_supply_kg: float

    # Multipliers
    macro_trend_pct: float
    macro_multiplier: float
    micro_scarcity_ratio: float    # pooled_demand_kg / total_platform_supply_kg
    micro_multiplier: float

    # Breakdown per KG
    market_crop_price_per_kg: float    # what the buyer pays for the crop itself
    commission_pct: float              # platform commission rate applied to the farmer's side
    platform_commission_per_kg: float  # deducted from the farmer, not added for the buyer
    farmer_net_price_per_kg: float     # what the farmer actually receives
    logistics_cost_per_kg: float       # pass-through, no platform markup
    final_price_per_kg: float          # = market_crop_price_per_kg + logistics_cost_per_kg

    # Total Order Values
    total_crop_value: float
    total_platform_commission: float
    total_farmer_payout: float
    total_logistics_cost: float
    grand_total_consumer_price: float

    def to_dict(self) -> Dict[str, Any]:
        return {
            "per_kg_breakdown": {
                "base_apmc_anchor_price": round(self.base_price_per_kg, 2),
                "market_crop_price": round(self.market_crop_price_per_kg, 2),
                "platform_commission_deducted_from_farmer": round(self.platform_commission_per_kg, 2),
                "farmer_net_price": round(self.farmer_net_price_per_kg, 2),
                "logistics_freight_cost": round(self.logistics_cost_per_kg, 2),
                "final_checkout_price_per_kg": round(self.final_price_per_kg, 2)
            },
            "order_totals": {
                "total_crop_value": round(self.total_crop_value, 2),
                "total_platform_commission": round(self.total_platform_commission, 2),
                "total_farmer_payout": round(self.total_farmer_payout, 2),
                "total_logistics_cost": round(self.total_logistics_cost, 2),
                "grand_total_to_pay": round(self.grand_total_consumer_price, 2)
            },
            "market_intelligence_metrics": {
                "macro_market_trend": f"{self.macro_trend_pct}%",
                "macro_multiplier_applied": round(self.macro_multiplier, 3),
                "your_order_kg": round(self.order_demand_kg, 2),
                "pooled_demand_kg_all_buyers": round(self.pooled_demand_kg, 2),
                "your_share_of_pooled_demand_pct": round(
                    (self.order_demand_kg / self.pooled_demand_kg * 100) if self.pooled_demand_kg else 100.0, 1
                ),
                "local_scarcity_ratio": round(self.micro_scarcity_ratio, 3),
                "micro_multiplier_applied": round(self.micro_multiplier, 3)
            },
            "commission_model": {
                "platform_commission_pct": round(self.commission_pct * 100, 2),
                "charged_to": "farmer (deducted from crop value)",
                "note": "Freight is passed through to the buyer at the driver's exact quoted price "
                        "with no platform markup. The platform's only cut is this commission, taken "
                        "out of the farmer's crop-value share."
            }
        }


class ConsumerPricingEngine:
    def __init__(
        self,
        platform_fee_pct: float = 8.0,
        min_scarcity_multiplier: float = 0.95,
        max_scarcity_multiplier: float = 1.15
    ):
        """
        :param platform_fee_pct: The platform's commission, as a percentage of the
            crop value, DEDUCTED FROM THE FARMER (not added to the buyer's price).
        :param min_scarcity_multiplier: The maximum discount applied when supply heavily outweighs demand.
        :param max_scarcity_multiplier: The maximum premium applied when demand consumes almost all supply.
        """
        self.commission_pct = platform_fee_pct / 100.0
        self.min_scarcity = min_scarcity_multiplier
        self.max_scarcity = max_scarcity_multiplier

    def generate_consumer_price(
        self,
        historical_base_price_kg: float,
        market_demand_trend_pct: float,
        total_platform_supply_kg: float,
        order_demand_kg: float,
        total_logistics_cost: float,
        pooled_demand_kg: float = None,
    ) -> ConsumerQuote:
        """
        Calculates the dynamic checkout price for a buyer's order.

        :param order_demand_kg: THIS buyer's own order size — used to compute
            their bill (total_crop_value, total_farmer_payout, etc.) and to
            amortize logistics cost per kg.
        :param pooled_demand_kg: TOTAL demand across every buyer currently
            competing for this commodity (including this order) — used
            instead of order_demand_kg to size the scarcity multiplier, so
            the per-kg price reflects real market pressure, not just this
            one request in isolation. Defaults to order_demand_kg (i.e.
            "treat this buyer as the only one in the market") when not
            provided, for single-buyer callers/tests.
        """
        if pooled_demand_kg is None:
            pooled_demand_kg = order_demand_kg

        # 1. MACRO DEMAND MULTIPLIER (from market forecast)
        # Example: +3.5% trend -> 1.035 multiplier
        macro_multiplier = 1.0 + (market_demand_trend_pct / 100.0)

        # 2. MICRO SCARCITY MULTIPLIER (platform supply/demand mechanics)
        # Ratio of TOTAL pooled buyer demand vs what farmers actually have
        # available -- this is the shared, market-clearing pressure every
        # buyer for this commodity sees right now, not just this one order.
        safe_supply = max(total_platform_supply_kg, 1.0) # Prevent division by zero
        supply_ratio = pooled_demand_kg / safe_supply

        # Scales between min_scarcity (0.95) and max_scarcity (1.15).
        # We use an algorithmic slope: base (0.95) + (ratio * 0.20)
        calculated_micro = self.min_scarcity + (supply_ratio * 0.20)
        micro_multiplier = max(self.min_scarcity, min(self.max_scarcity, calculated_micro))

        # 3. MARKET CROP PRICE (what the buyer pays for the crop itself)
        market_crop_price_kg = historical_base_price_kg * macro_multiplier * micro_multiplier

        # 4. PLATFORM COMMISSION (deducted from the farmer's side only — never
        #    added to the buyer's price, and never taken from the logistics leg,
        #    since that's a service the platform is paying the driver for).
        platform_commission_kg = market_crop_price_kg * self.commission_pct
        farmer_net_price_kg = market_crop_price_kg - platform_commission_kg

        # 5. LOGISTICS COST (amortized per kg, passed through at cost — no markup)
        logistics_per_kg = total_logistics_cost / max(order_demand_kg, 1.0)

        # 6. FINAL AGGREGATIONS — buyer pays the crop price plus freight, full stop.
        final_price_per_kg = market_crop_price_kg + logistics_per_kg

        return ConsumerQuote(
            base_price_per_kg=historical_base_price_kg,
            order_demand_kg=order_demand_kg,
            pooled_demand_kg=pooled_demand_kg,
            total_platform_supply_kg=total_platform_supply_kg,
            macro_trend_pct=market_demand_trend_pct,
            macro_multiplier=macro_multiplier,
            micro_scarcity_ratio=supply_ratio,
            micro_multiplier=micro_multiplier,

            market_crop_price_per_kg=market_crop_price_kg,
            commission_pct=self.commission_pct,
            platform_commission_per_kg=platform_commission_kg,
            farmer_net_price_per_kg=farmer_net_price_kg,
            logistics_cost_per_kg=logistics_per_kg,
            final_price_per_kg=final_price_per_kg,

            total_crop_value=market_crop_price_kg * order_demand_kg,
            total_platform_commission=platform_commission_kg * order_demand_kg,
            total_farmer_payout=farmer_net_price_kg * order_demand_kg,
            total_logistics_cost=total_logistics_cost,
            grand_total_consumer_price=final_price_per_kg * order_demand_kg
        )


# ---------------------------------------------------------------------------
# DEMO EXECUTION
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import json

    print("=" * 65)
    print("TESTING DYNAMIC CONSUMER PRICING ENGINE")
    print("=" * 65)

    # Initialize the engine
    pricing_engine = ConsumerPricingEngine(platform_fee_pct=8.0)

    # Simulated Inputs from your other engines
    # 1. From demand_forecast_engine_2: ₹2100/quintal = ₹21.0/kg, trending UP by 3.5%
    forecast_base_price = 21.0
    market_trend = 3.5

    # 2. From route_optimization: Farmers in the area have 3000kg total.
    platform_supply = 3000.0

    # 3. From pricing_engine: The 7T Truck route costs ₹2500 for the trip (driver's
    #    exact quoted freight — no platform markup on this leg).
    logistics_freight = 2500.0

    # Multi-buyer scenario: THIS buyer wants 2200kg, but two other buyers are
    # also currently after the same commodity (demand_pool.py would supply
    # this number in the real API; simulated here for the demo).
    buyer_demand = 2200.0
    other_buyers_demand = 1800.0
    pooled_demand = buyer_demand + other_buyers_demand  # 4000kg pooled vs. 3000kg supply

    quote = pricing_engine.generate_consumer_price(
        historical_base_price_kg=forecast_base_price,
        market_demand_trend_pct=market_trend,
        total_platform_supply_kg=platform_supply,
        order_demand_kg=buyer_demand,
        total_logistics_cost=logistics_freight,
        pooled_demand_kg=pooled_demand,
    )

    # Print the result exactly as the API will return it
    print(json.dumps(quote.to_dict(), indent=4))

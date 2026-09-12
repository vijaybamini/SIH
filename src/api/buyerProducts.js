/* ---------------------------------------------------------------------------
 * Buyer marketplace data layer (frontend-only mock).
 *
 * This mirrors the exact shape of a future Supabase query so the swap later
 * is a one-line change. Currently it resolves with static data from
 * ../data/buyerProducts.js. To connect to the backend later, replace the
 * body with:
 *
 *   const { data, error } = await supabase
 *     .from('buyer_products')
 *     .select('*')
 *     .eq('status', 'active')
 *   if (error) throw error
 *   return { products: data, categories: await fetchCategories() }
 *
 * Same Promise contract, so BulkBuyerDashboard never changes.
 * -------------------------------------------------------------------------*/

import { buyerProducts, buyerCategories } from '../data/buyerProducts'

export async function fetchBuyerProducts() {
  return {
    products: buyerProducts,
    categories: buyerCategories,
  }
}

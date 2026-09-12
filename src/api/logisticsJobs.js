import { supabase } from '../supabase'

function requireSupabase() {
  if (!supabase) throw new Error('Supabase is not configured. Add the project URL and publishable key.')
}

// order_trips rows this provider has accepted (or delivered) -- readable
// via the "Providers can view trips assigned to them" RLS policy.
export async function fetchMyTrips(providerId) {
  requireSupabase()
  const { data, error } = await supabase
    .from('order_trips')
    .select('id, order_id, vehicle_class, total_weight_kg, distance_km, cost, stops, assignment_status, accepted_at, delivered_at')
    .eq('assigned_provider_id', providerId)
    .order('accepted_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function markTripDelivered(orderTripId, providerId) {
  requireSupabase()
  const { data, error } = await supabase.rpc('mark_trip_delivered', {
    p_order_trip_id: orderTripId,
    p_provider_id: providerId,
  })
  if (error) throw error
  return data
}

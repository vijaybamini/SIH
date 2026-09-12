import { supabase } from '../supabase'

function requireSupabase() {
  if (!supabase) throw new Error('Supabase is not configured. Add the project URL and publishable key.')
}

export async function fetchNotifications(userId) {
  requireSupabase()
  const { data, error } = await supabase
    .from('notifications')
    .select('id, type, title, body, payload, is_read, created_at')
    .eq('recipient_id', userId)
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) throw error
  return data || []
}

export async function markNotificationRead(id) {
  requireSupabase()
  const { error } = await supabase.from('notifications').update({ is_read: true }).eq('id', id)
  if (error) throw error
}

export async function markAllNotificationsRead(userId) {
  requireSupabase()
  const { error } = await supabase.from('notifications').update({ is_read: true }).eq('recipient_id', userId).eq('is_read', false)
  if (error) throw error
}

// Atomic "first to accept wins" claim on a trip -- see accept_trip_offer()
// in the migration. Returns {success:true, ...} or {success:false, reason}
// (e.g. someone else already accepted it); never throws for that case,
// only for a genuine request failure.
export async function acceptTripOffer(orderTripId, providerId) {
  requireSupabase()
  const { data, error } = await supabase.rpc('accept_trip_offer', {
    p_order_trip_id: orderTripId,
    p_provider_id: providerId,
  })
  if (error) throw error
  return data
}

// Live updates so a job offer appears the moment the backend creates it,
// without the provider needing to refresh. Returns an unsubscribe function.
export function subscribeToNotifications(userId, onInsert) {
  if (!supabase || !userId) return () => {}
  const channel = supabase
    .channel(`notifications:${userId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${userId}` },
      (payload) => onInsert(payload.new)
    )
    .subscribe()
  return () => supabase.removeChannel(channel)
}

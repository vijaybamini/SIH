import { supabase } from '../supabase'
import { loadBasicProfile } from './profile'

function requireSupabase() {
  if (!supabase) throw new Error('Supabase is not configured. Add the project URL and publishable key.')
}

export async function loadBuyerData(userId) {
  requireSupabase()
  const [{ data: row, error }, basicProfile] = await Promise.all([
    supabase.from('bulk_buyers').select('*').eq('profile_id', userId).maybeSingle(),
    loadBasicProfile(userId),
  ])
  if (error) throw error
  return {
    name: basicProfile?.name || row?.name || '',
    phone: basicProfile?.phone || '',
    photo: basicProfile?.photo || null,
    address: row?.address || '',
    pincode: row?.pincode || '',
    rating: row?.rating ?? null,
    profileComplete: Boolean(row?.pincode),
  }
}

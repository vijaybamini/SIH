import { supabase } from '../supabase'

function requireSupabase() {
  if (!supabase) throw new Error('Supabase is not configured. Add the project URL and publishable key.')
}

export async function loadUserRole(userId) {
  requireSupabase()
  const { data, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw error
  return data?.role || null
}

export async function loadBasicProfile(userId) {
  requireSupabase()
  const { data, error } = await supabase
    .from('profiles')
    .select('first_name, phone, photo_url')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw error
  return {
    name: data?.first_name || '',
    phone: data?.phone || '',
    photo: data?.photo_url || null,
  }
}

export async function uploadAvatar(userId, file) {
  requireSupabase()
  const extension = (file.name.split('.').pop() || 'jpg').toLowerCase()
  const path = `${userId}/avatar.${extension}`
  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(path, file, { upsert: true, cacheControl: '3600' })
  if (uploadError) throw uploadError
  const { data } = supabase.storage.from('avatars').getPublicUrl(path)
  return `${data.publicUrl}?t=${Date.now()}`
}

export async function updateBasicProfile(userId, { name, phone, photoUrl }) {
  requireSupabase()
  const update = {
    first_name: name.trim(),
    phone: phone.trim(),
  }
  if (photoUrl !== undefined) update.photo_url = photoUrl
  const { error } = await supabase.from('profiles').update(update).eq('id', userId)
  if (error) throw error
}

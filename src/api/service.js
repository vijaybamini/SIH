import { supabase } from '../supabase'
import { loadBasicProfile, updateBasicProfile, uploadAvatar } from './profile'

function requireSupabase() {
  if (!supabase) throw new Error('Supabase is not configured. Add the project URL and publishable key.')
}

async function readSingle(table, column, userId) {
  const { data, error } = await supabase.from(table).select('*').eq(column, userId).maybeSingle()
  if (error) throw error
  return data
}

function millComplete(mill) {
  return Boolean(mill && mill.cropTypes.some((crop) => crop.trim()) && mill.gstin)
}

function normalizeMill(row) {
  return {
    id: row.id,
    cropTypes: Array.isArray(row.crop_types) && row.crop_types.length ? row.crop_types : [''],
    gstin: row.gstin || '',
    documentUrl: row.document_url || null,
  }
}

export async function loadServiceData(userId) {
  requireSupabase()
  const [provider, millsResult, basicProfile] = await Promise.all([
    readSingle('service_providers', 'profile_id', userId),
    supabase.from('service_provider_mills').select('*').eq('service_provider_id', userId).order('created_at', { ascending: true }),
    loadBasicProfile(userId),
  ])
  if (millsResult.error) throw millsResult.error

  const mills = (millsResult.data || []).map(normalizeMill)

  return {
    name: basicProfile?.name || '',
    phone: basicProfile?.phone || '',
    photo: basicProfile?.photo || null,
    businessName: provider?.business_name || '',
    email: provider?.email || '',
    address: provider?.address || '',
    mills,
    profileComplete: Boolean(provider?.address && mills.length > 0 && mills.every(millComplete)),
  }
}

export async function uploadServiceDocument(userId, file, millKey) {
  requireSupabase()
  const extension = (file.name.split('.').pop() || 'pdf').toLowerCase()
  const path = `${userId}/mill-${millKey}.${extension}`
  const { error: uploadError } = await supabase.storage
    .from('service-docs')
    .upload(path, file, { upsert: true, cacheControl: '3600' })
  if (uploadError) throw uploadError
  const { data } = supabase.storage.from('service-docs').getPublicUrl(path)
  return `${data.publicUrl}?t=${Date.now()}`
}

export async function saveServiceData(userId, formData) {
  requireSupabase()
  if (!userId) throw new Error('Your account session is missing. Please sign in again.')

  let photoUrl = formData.photo || null
  if (formData.photoFile) {
    try {
      photoUrl = await uploadAvatar(userId, formData.photoFile)
    } catch {
      photoUrl = formData.photo || null
    }
  }
  await updateBasicProfile(userId, { name: formData.name, phone: formData.phone, photoUrl })

  const existingProvider = await readSingle('service_providers', 'profile_id', userId)
  const { error: providerError } = await supabase.from('service_providers').upsert({
    profile_id: userId,
    business_name: existingProvider?.business_name || formData.name || 'Service provider',
    email: formData.email.trim(),
    address: formData.address.trim(),
  }, { onConflict: 'profile_id' })
  if (providerError) throw providerError

  const mills = (formData.mills || []).filter((mill) => mill.cropTypes.some((crop) => crop.trim()) || mill.gstin.trim())

  const { data: existingMills, error: existingError } = await supabase
    .from('service_provider_mills')
    .select('id')
    .eq('service_provider_id', userId)
  if (existingError) throw existingError

  const retainedIds = mills.map((mill) => Number(mill.id)).filter((id) => Number.isInteger(id) && id > 0)
  const idsToDelete = (existingMills || []).map((mill) => mill.id).filter((id) => !retainedIds.includes(Number(id)))
  if (idsToDelete.length) {
    const { error } = await supabase.from('service_provider_mills').delete().in('id', idsToDelete).eq('service_provider_id', userId)
    if (error) throw error
  }

  if (mills.length) {
    const millRows = []
    for (const [index, mill] of mills.entries()) {
      let documentUrl = mill.documentUrl || null
      if (mill.documentFile) {
        try {
          documentUrl = await uploadServiceDocument(userId, mill.documentFile, retainedIds.includes(Number(mill.id)) ? mill.id : index + 1)
        } catch {
          documentUrl = mill.documentUrl || null
        }
      }
      const row = {
        service_provider_id: userId,
        crop_types: mill.cropTypes.map((crop) => crop.trim()).filter(Boolean),
        gstin: mill.gstin.trim().toUpperCase() || null,
        document_url: documentUrl,
      }
      if (retainedIds.includes(Number(mill.id))) row.id = Number(mill.id)
      millRows.push(row)
    }
    const { error } = await supabase.from('service_provider_mills').upsert(millRows)
    if (error) throw error
  }

  return loadServiceData(userId)
}

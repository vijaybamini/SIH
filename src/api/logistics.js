import { supabase } from '../supabase'
import { loadBasicProfile } from './profile'

function requireSupabase() {
  if (!supabase) throw new Error('Supabase is not configured. Add the project URL and publishable key.')
}

function asNumberOrNull(value) {
  if (value === '' || value === null || value === undefined) return null
  const number = Number(String(value).replace(/[^\d.-]/g, ''))
  return Number.isFinite(number) ? number : null
}

async function readSingle(table, column, userId) {
  const { data, error } = await supabase.from(table).select('*').eq(column, userId).maybeSingle()
  if (error) throw error
  return data
}

export async function loadLogisticsData(userId) {
  requireSupabase()
  if (!userId) throw new Error('Your account session is missing. Please sign in again.')
  const [basicProfile, provider, fleetResult, inventory] = await Promise.all([
    loadBasicProfile(userId),
    readSingle('logistics_providers', 'profile_id', userId),
    supabase.from('fleet_vehicles').select('*').eq('logistics_provider_id', userId).order('id', { ascending: true }),
    readSingle('inventory_details', 'logistics_provider_id', userId),
  ])
  if (fleetResult.error) throw fleetResult.error

  const serviceType = provider?.service_type || null
  const vehicles = (fleetResult.data || []).map((vehicle) => ({
    type: vehicle.vehicle_type || '',
    location: vehicle.location || '',
    registration: vehicle.registration_number || '',
  }))

  const data = {
    name: basicProfile?.name || '',
    serviceType,
    vehicles,
    vehicleCount: vehicles.length ? String(vehicles.length) : '',
    storage: inventory
      ? {
          capacity: inventory.cold_storage_capacity == null ? '' : String(inventory.cold_storage_capacity),
          location: inventory.location || '',
          fillPercentage: inventory.storage_fill_percentage == null ? '' : String(inventory.storage_fill_percentage),
        }
      : { capacity: '', location: '', fillPercentage: '' },
  }
  data.profileComplete = Boolean(serviceType)
  return data
}

export async function saveLogisticsData(userId, formData) {
  requireSupabase()
  if (!userId) throw new Error('Your account session is missing. Please sign in again.')

  const { error: serviceError } = await supabase.from('logistics_providers').upsert({
    profile_id: userId,
    service_type: formData.serviceType,
  }, { onConflict: 'profile_id' })
  if (serviceError) throw serviceError

  const wantTransport = formData.serviceType === 'transportation' || formData.serviceType === 'both'

  const { error: deleteFleetError } = await supabase.from('fleet_vehicles').delete().eq('logistics_provider_id', userId)
  if (deleteFleetError) throw deleteFleetError

  if (wantTransport) {
    const vehicles = (formData.vehicles || []).filter((vehicle) => vehicle.type.trim())
    if (vehicles.length) {
      const rows = vehicles.map((vehicle) => ({
        logistics_provider_id: userId,
        vehicle_type: vehicle.type.trim(),
        registration_number: vehicle.registration.trim(),
        location: vehicle.location.trim(),
      }))
      const { error: insertError } = await supabase.from('fleet_vehicles').insert(rows)
      if (insertError) throw insertError
    }
  }

  const wantStorage = formData.serviceType === 'storage' || formData.serviceType === 'both'

  if (wantStorage) {
    const { error: storageError } = await supabase.from('inventory_details').upsert({
      logistics_provider_id: userId,
      cold_storage_capacity: asNumberOrNull(formData.storage.capacity),
      location: formData.storage.location.trim(),
      storage_fill_percentage: asNumberOrNull(formData.storage.fillPercentage) ?? 0,
    }, { onConflict: 'logistics_provider_id' })
    if (storageError) throw storageError
  } else {
    const { error: deleteStorageError } = await supabase.from('inventory_details').delete().eq('logistics_provider_id', userId)
    if (deleteStorageError && deleteStorageError.code !== 'PGRST116') throw deleteStorageError
  }

  return loadLogisticsData(userId)
}
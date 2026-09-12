import { supabase } from '../supabase'
import { loadBasicProfile, updateBasicProfile } from './profile'

function requireSupabase() {
  if (!supabase) throw new Error('Supabase is not configured. Add the project URL and publishable key.')
}

function asNumberOrNull(value) {
  if (value === '' || value === null || value === undefined) return null
  const number = Number(String(value).replace(/[^\d.]/g, ''))
  return Number.isFinite(number) ? number : null
}

function vehicleComplete(vehicle) {
  return Boolean(vehicle && vehicle.type && vehicle.registrationNumber)
}

function inventoryComplete(inventory) {
  return Boolean(
    inventory &&
      inventory.type &&
      inventory.location &&
      inventory.capacity !== '' &&
      inventory.capacity != null &&
      inventory.fill !== '' &&
      inventory.fill != null
  )
}

function profileComplete(profile) {
  return Boolean(
    profile && profile.name && profile.aadhaarNumber && profile.phone && profile.address
  )
}

function parseFleetDetails(raw) {
  if (!raw) return { profile: null, vehicles: [], inventory: null }
  try {
    const parsed = JSON.parse(raw)
    return {
      profile: parsed.profile || null,
      vehicles: Array.isArray(parsed.vehicles) ? parsed.vehicles : [],
      inventory: parsed.inventory || null,
    }
  } catch {
    return { profile: null, vehicles: [], inventory: null }
  }
}

function normalizeVehicle(vehicle, index) {
  return {
    id: `db-${index}`,
    type: vehicle?.type || '',
    capacity: vehicle?.capacity == null ? '' : String(vehicle.capacity),
    registrationNumber: vehicle?.registrationNumber || '',
    location: vehicle?.location || '',
    status: vehicle?.status || 'active',
    history: Array.isArray(vehicle?.history) ? vehicle.history.map((entry) => ({ ...entry })) : [],
  }
}

function normalizeInventory(inventory) {
  if (!inventory) return null
  return {
    type: inventory.type || '',
    capacity: inventory.capacity == null ? '' : String(inventory.capacity),
    location: inventory.location || '',
    fill: inventory.fill == null ? '' : String(inventory.fill),
  }
}

async function readSingle(table, column, userId) {
  const { data, error } = await supabase.from(table).select('*').eq(column, userId).maybeSingle()
  if (error) throw error
  return data
}

export async function loadLogisticsData(userId) {
  requireSupabase()
  const [provider, transport, inventory, basicProfile] = await Promise.all([
    readSingle('logistics_providers', 'profile_id', userId),
    readSingle('transportation_details', 'logistics_provider_id', userId),
    readSingle('inventory_details', 'logistics_provider_id', userId),
    loadBasicProfile(userId),
  ])

  const parsed = parseFleetDetails(provider?.fleet_details)

  let vehicles = parsed.vehicles.map(normalizeVehicle)
  if (!vehicles.length && transport) {
    vehicles = [{
      id: 'db-1',
      type: transport.vehicle_type || '',
      capacity: transport.vehicle_capacity == null ? '' : String(transport.vehicle_capacity),
      registrationNumber: '',
      location: '',
      status: 'active',
      history: [],
    }]
  }

  let inventoryState = normalizeInventory(parsed.inventory)
  if (!inventoryState && inventory) {
    inventoryState = {
      type: '',
      capacity: inventory.cold_storage_capacity == null ? '' : String(inventory.cold_storage_capacity),
      location: inventory.location || '',
      fill: inventory.storage_fill_percentage == null ? '' : String(inventory.storage_fill_percentage),
    }
  }

  const profile = {
    name: parsed.profile?.name || basicProfile?.name || '',
    aadhaarNumber: parsed.profile?.aadhaarNumber || '',
    phone: parsed.profile?.phone || basicProfile?.phone || '',
    address: parsed.profile?.address || '',
  }

  return {
    name: profile.name,
    phone: profile.phone,
    companyName: provider?.company_name || '',
    serviceAreas: provider?.service_areas || '',
    profile,
    vehicles,
    inventory: inventoryState,
    profileComplete: Boolean(
      provider &&
      profileComplete(profile) &&
      vehicles.some(vehicleComplete) &&
      inventoryComplete(inventoryState)
    ),
  }
}

export async function saveLogisticsData(userId, formData) {
  requireSupabase()
  if (!userId) throw new Error('Your account session is missing. Please sign in again.')

  const profile = {
    name: String(formData.profile?.name || '').trim(),
    aadhaarNumber: String(formData.profile?.aadhaarNumber || '').trim(),
    phone: String(formData.profile?.phone || '').trim(),
    address: String(formData.profile?.address || '').trim(),
  }

  const vehicles = (formData.vehicles || [])
    .filter((vehicle) => vehicle.type && String(vehicle.type).trim())
    .map((vehicle) => ({
      type: String(vehicle.type).trim(),
      capacity: asNumberOrNull(vehicle.capacity),
      registrationNumber: String(vehicle.registrationNumber || '').trim(),
      location: String(vehicle.location || '').trim(),
      status: vehicle.status || 'active',
      history: Array.isArray(vehicle.history)
        ? vehicle.history.map((entry) => ({
            date: String(entry.date || '').trim(),
            note: String(entry.note || '').trim(),
          }))
        : [],
    }))

  const inventory = formData.inventory || {}
  const fleetPayload = JSON.stringify({
    profile,
    vehicles,
    inventory: {
      type: String(inventory.type || '').trim(),
      capacity: asNumberOrNull(inventory.capacity),
      location: String(inventory.location || '').trim(),
      fill: asNumberOrNull(inventory.fill),
    },
  })

  await updateBasicProfile(userId, { name: profile.name, phone: profile.phone })

  const { error: providerError } = await supabase
    .from('logistics_providers')
    .update({ fleet_details: fleetPayload })
    .eq('profile_id', userId)
  if (providerError) throw providerError

  const primary = vehicles[0]
  if (primary && primary.capacity != null) {
    const { error } = await supabase.from('transportation_details').upsert({
      logistics_provider_id: userId,
      vehicle_type: primary.type,
      vehicle_capacity: primary.capacity,
    }, { onConflict: 'logistics_provider_id' })
    if (error) throw error
  }

  const hasInventory =
    inventory &&
    String(inventory.type || '').trim() &&
    String(inventory.location || '').trim() &&
    inventory.capacity !== '' &&
    inventory.capacity != null
  if (hasInventory) {
    const { error } = await supabase.from('inventory_details').upsert({
      logistics_provider_id: userId,
      cold_storage_capacity: asNumberOrNull(inventory.capacity),
      location: String(inventory.location || '').trim(),
      storage_fill_percentage: asNumberOrNull(inventory.fill) ?? 0,
    }, { onConflict: 'logistics_provider_id' })
    if (error) throw error
  }

  return loadLogisticsData(userId)
}
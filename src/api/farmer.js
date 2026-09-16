import { supabase } from '../supabase'
import { loadBasicProfile, updateBasicProfile, uploadAvatar } from './profile'

function requireSupabase() {
  if (!supabase) throw new Error('Supabase is not configured. Add the project URL and publishable key.')
}

function asNumberOrNull(value) {
  if (value === '' || value === null || value === undefined) return null
  const number = Number(String(value).replace(/[^\d.-]/g, ''))
  return Number.isFinite(number) ? number : null
}

function mapCrop(row) {
  const turnover = row.harvested ? row.turnover : (row.expected_turnover ?? row.turnover)
  return {
    id: row.id,
    name: row.crop_type || '',
    harvested: row.harvested ?? null,
    turnover: String(turnover ?? ''),
    specificType: row.specific_crop_type || '',
    plantedDate: row.planted_date || '',
    expectedHarvestDate: row.expected_harvest_date || '',
    actualHarvestDate: row.actual_harvest_date || '',
    landUsed: row.land_used == null ? '' : String(row.land_used),
  }
}

function mapFarmerData(profile, crops, bank, basicProfile) {
  const mappedCrops = (crops || []).map(mapCrop)
  const data = {
    name: basicProfile?.name || '',
    phone: basicProfile?.phone || '',
    photo: basicProfile?.photo || null,
    areaOfLand: profile?.area_of_crop == null ? '' : String(profile.area_of_crop),
    surveyNumber: profile?.survey_number || '',
    aadhaarNumber: profile?.aadhaar_number || '',
    cropLocation: profile?.crop_location || '',
    pincode: profile?.pincode || '',
    crops: mappedCrops.length ? mappedCrops : undefined,
    bank: bank
      ? {
          accountHolderName: bank.account_holder_name || '',
          accountNumber: bank.account_number || '',
          ifsc: bank.ifsc_code || '',
          branch: bank.branch_name || '',
        }
      : null,
  }
  data.profileComplete = Boolean(profile && bank)
  return data
}

async function readSingle(table, column, userId) {
  const { data, error } = await supabase.from(table).select('*').eq(column, userId).maybeSingle()
  if (error) throw error
  return data
}

export async function loadFarmerData(userId) {
  requireSupabase()
  const [profile, cropsResult, bank, basicProfile] = await Promise.all([
    readSingle('farmer_profiles', 'farmer_id', userId),
    supabase.from('crop_details').select('*').eq('farmer_id', userId).order('created_at', { ascending: true }),
    readSingle('farmer_bank_details', 'farmer_id', userId),
    loadBasicProfile(userId),
  ])
  if (cropsResult.error) throw cropsResult.error
  return mapFarmerData(profile, cropsResult.data, bank, basicProfile)
}

export async function saveFarmerData(userId, formData) {
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

  const { error: profileError } = await supabase.from('farmer_profiles').upsert({
    farmer_id: userId,
    area_of_crop: asNumberOrNull(formData.areaOfLand),
    survey_number: formData.surveyNumber.trim(),
    aadhaar_number: formData.aadhaarNumber.trim(),
    crop_location: formData.cropLocation.trim(),
    pincode: formData.pincode.trim(),
  }, { onConflict: 'farmer_id' })
  if (profileError) throw profileError

  const crops = (formData.crops || []).filter((crop) => crop.name.trim())
  const { data: existingCrops, error: existingError } = await supabase
    .from('crop_details')
    .select('id')
    .eq('farmer_id', userId)
  if (existingError) throw existingError

  const retainedIds = crops
    .map((crop) => Number(crop.id))
    .filter((id) => Number.isInteger(id) && id > 0)
  const idsToDelete = (existingCrops || []).map((crop) => crop.id).filter((id) => !retainedIds.includes(Number(id)))
  if (idsToDelete.length) {
    const { error } = await supabase.from('crop_details').delete().in('id', idsToDelete).eq('farmer_id', userId)
    if (error) throw error
  }

  if (crops.length) {
    const cropRow = (crop) => ({
      farmer_id: userId,
      crop_type: crop.name.trim(),
      specific_crop_type: crop.specificType.trim() || null,
      land_used: asNumberOrNull(crop.landUsed),
      turnover: crop.harvested ? asNumberOrNull(crop.turnover) : null,
      expected_turnover: crop.harvested ? null : asNumberOrNull(crop.turnover),
      harvested: crop.harvested,
      planted_date: crop.plantedDate || null,
      expected_harvest_date: crop.expectedHarvestDate || null,
    })

    // Existing crops (carrying a real id) and brand-new ones (no id yet)
    // must be written separately: PostgREST's bulk upsert requires every
    // row in the same call to have identical keys (PGRST102 "All object
    // keys must match" otherwise), and a new crop simply has no id to give
    // it yet. New rows go through insert() so the id column's identity
    // default assigns one.
    const existingCropRows = crops
      .filter((crop) => retainedIds.includes(Number(crop.id)))
      .map((crop) => ({ id: Number(crop.id), ...cropRow(crop) }))
    const newCropRows = crops
      .filter((crop) => !retainedIds.includes(Number(crop.id)))
      .map(cropRow)

    if (existingCropRows.length) {
      const { error } = await supabase.from('crop_details').upsert(existingCropRows)
      if (error) throw error
    }
    if (newCropRows.length) {
      const { error } = await supabase.from('crop_details').insert(newCropRows)
      if (error) throw error
    }
  }

  const { error: bankError } = await supabase.from('farmer_bank_details').upsert({
    farmer_id: userId,
    account_holder_name: formData.bank.accountHolderName.trim(),
    account_number: formData.bank.accountNumber.trim(),
    ifsc_code: formData.bank.ifsc.trim().toUpperCase(),
    branch_name: formData.bank.branch.trim(),
  }, { onConflict: 'farmer_id' })
  if (bankError) throw bankError

  return loadFarmerData(userId)
}

// Persists the "mark harvested" action (previously local-state-only, which
// meant it reverted on refresh -- unacceptable once a buyer-facing harvest
// date depends on it being real). Captures TODAY as the actual harvest
// date, distinct from the pre-harvest estimate in expected_harvest_date.
export async function markCropHarvested(cropId) {
  requireSupabase()
  const today = new Date().toISOString().slice(0, 10)
  const { error } = await supabase
    .from('crop_details')
    .update({ harvested: true, actual_harvest_date: today })
    .eq('id', cropId)
  if (error) throw error
  return today
}

// A farmer's own past sales, for the analytics tab -- order_allocations is
// readable directly under RLS ("Farmers can view their own allocations"),
// joined to the parent order for commodity/date/market price.
export async function fetchFarmerSalesHistory(farmerId) {
  requireSupabase()
  const { data, error } = await supabase
    .from('order_allocations')
    .select('id, allocated_kg, farmer_payout, created_at, orders(commodity, market_crop_price_per_kg, created_at)')
    .eq('farmer_id', farmerId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data || []).map((row) => ({
    id: row.id,
    commodity: row.orders?.commodity || '',
    date: row.created_at,
    allocatedKg: Number(row.allocated_kg) || 0,
    payout: Number(row.farmer_payout) || 0,
    pricePerKg: Number(row.allocated_kg) > 0 ? Number(row.farmer_payout) / Number(row.allocated_kg) : null,
  }))
}

export async function fetchPriceAlerts(farmerId) {
  requireSupabase()
  const { data, error } = await supabase
    .from('price_alerts')
    .select('*')
    .eq('farmer_id', farmerId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data || []).map((row) => ({
    id: row.id,
    commodity: row.commodity,
    thresholdPrice: Number(row.threshold_price),
    direction: row.direction,
    active: row.active,
    createdAt: row.created_at,
  }))
}

export async function createPriceAlert(farmerId, { commodity, thresholdPrice, direction }) {
  requireSupabase()
  const { error } = await supabase.from('price_alerts').insert({
    farmer_id: farmerId,
    commodity,
    threshold_price: thresholdPrice,
    direction,
  })
  if (error) throw error
}

export async function deletePriceAlert(alertId) {
  requireSupabase()
  const { error } = await supabase.from('price_alerts').delete().eq('id', alertId)
  if (error) throw error
}

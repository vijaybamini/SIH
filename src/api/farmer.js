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
    const cropRows = crops.map((crop) => {
      const row = {
        farmer_id: userId,
        crop_type: crop.name.trim(),
        specific_crop_type: crop.specificType.trim() || null,
        land_used: asNumberOrNull(crop.landUsed),
        turnover: crop.harvested ? asNumberOrNull(crop.turnover) : null,
        expected_turnover: crop.harvested ? null : asNumberOrNull(crop.turnover),
        harvested: crop.harvested,
        planted_date: crop.plantedDate || null,
        expected_harvest_date: crop.expectedHarvestDate || null,
      }
      if (retainedIds.includes(Number(crop.id))) row.id = Number(crop.id)
      return row
    })
    const { error } = await supabase.from('crop_details').upsert(cropRows)
    if (error) throw error
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

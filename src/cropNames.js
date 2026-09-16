// Crop names are stored as whatever the farmer picked from the (per-language)
// autocomplete suggestions -- which meant a Telugu/Hindi/etc. farmer's crop
// got saved in that script, and every downstream lookup (AI backend price
// matching, which only knows English Agmarknet commodity names) silently
// broke for them. These helpers keep the STORED value canonical English
// (for the backend) while translating only for DISPLAY, using the existing
// per-language `cropSuggestions` lists (positionally parallel to English's).
import { translations } from './i18n'

const EN_LIST = translations.en.cropSuggestions

// normalized (trimmed/uppercased) name, in ANY language, -> index into EN_LIST
const NORMALIZED_TO_INDEX = new Map()
Object.values(translations).forEach((langData) => {
  const list = langData.cropSuggestions
  if (!Array.isArray(list)) return
  list.forEach((name, index) => {
    if (index < EN_LIST.length) NORMALIZED_TO_INDEX.set(String(name).trim().toUpperCase(), index)
  })
})

// Canonicalizes a crop name (typed/selected in any language) to English, for
// storage and for calling the AI backend. Names that aren't a known crop
// (custom/free-typed) pass through unchanged.
export function toEnglishCropName(name) {
  if (!name) return name
  const index = NORMALIZED_TO_INDEX.get(String(name).trim().toUpperCase())
  return index === undefined ? name : EN_LIST[index]
}

// Translates a stored crop name to the given display language. Handles
// legacy data that may already be stored in a non-English script too, since
// the lookup covers every language's suggestion list.
export function displayCropName(name, language) {
  if (!name) return name
  if (language === 'en') return name
  const index = NORMALIZED_TO_INDEX.get(String(name).trim().toUpperCase())
  if (index === undefined) return name
  const list = translations[language]?.cropSuggestions
  return list?.[index] || name
}

// Realistic max days from planting to (first) harvest, per crop -- real
// agronomic figures, not a single blanket cap: annual crops top out around
// 4-6 months, while the few genuinely perennial/tree crops in the
// suggestion list (mango, coconut, tea, coffee, banana) can legitimately
// take years before a first harvest. Keyed by the canonical English name.
const CROP_MAX_CYCLE_DAYS = {
  'Rice': 150,
  'Wheat': 150,
  'Maize': 120,
  'Bajra': 100,
  'Jowar': 120,
  'Sugarcane': 540,
  'Cotton': 180,
  'Groundnut': 130,
  'Soybean': 110,
  'Mustard': 130,
  'Chickpea (Gram)': 120,
  'Pigeon Pea (Tur)': 180,
  'Green Gram (Moong)': 70,
  'Black Gram (Urad)': 90,
  'Potato': 100,
  'Onion': 150,
  'Tomato': 120,
  'Banana': 400,
  'Mango': 1825,
  'Turmeric': 270,
  'Chilli': 150,
  'Coconut': 2555,
  'Tea': 1095,
  'Coffee': 1460,
  'Jute': 120,
  'Barley': 130,
  'Sunflower': 100,
  'Sesame': 100,
}

// Generous fallback for a custom/free-typed crop not in the suggestion
// list -- long enough not to block legitimate unusual crops, short enough
// to still catch an obvious data-entry mistake (a date years off).
const DEFAULT_MAX_CYCLE_DAYS = 400

export function maxCropCycleDays(name) {
  const english = toEnglishCropName(name)
  return CROP_MAX_CYCLE_DAYS[english] ?? DEFAULT_MAX_CYCLE_DAYS
}

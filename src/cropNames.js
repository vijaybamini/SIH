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
// agronomic figures, not a single blanket cap: annual/vegetable crops top
// out around 2-9 months, while the genuinely perennial ones in the list
// (apple, mango) can legitimately take years before a first harvest.
// Keyed by the canonical English name -- kept in sync with the real,
// price-backed commodity list in i18n.js's cropSuggestions (the AI
// backend's actual Agmarknet commodities, plus Rice -- see pipeline.py's
// rice supplement for why Rice needed adding back in separately).
const CROP_MAX_CYCLE_DAYS = {
  'Apple': 1825,
  'Arhar (Tur/Red Gram)(Whole)': 180,
  'Bajra(Pearl Millet/Cumbu)': 100,
  'Banana': 400,
  'Bhindi(Ladies Finger)': 70,
  'Brinjal': 120,
  'Cabbage': 100,
  'Carrot': 100,
  'Cauliflower': 120,
  'Cotton': 180,
  'Garlic': 180,
  'Ginger(Green)': 270,
  'Green Chilli': 150,
  'Green Gram (Moong)(Whole)': 70,
  'Groundnut': 130,
  'Gur(Jaggery)': 540,
  'Jowar(Sorghum)': 120,
  'Lentil (Masur)(Whole)': 130,
  'Maize': 120,
  'Mango': 1825,
  'Mustard': 130,
  'Rice': 150,
  'Soyabean': 110,
  'Wheat': 150,
}

// Generous fallback for a custom/free-typed crop not in the suggestion
// list -- long enough not to block legitimate unusual crops, short enough
// to still catch an obvious data-entry mistake (a date years off).
const DEFAULT_MAX_CYCLE_DAYS = 400

export function maxCropCycleDays(name) {
  const english = toEnglishCropName(name)
  return CROP_MAX_CYCLE_DAYS[english] ?? DEFAULT_MAX_CYCLE_DAYS
}

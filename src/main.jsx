import { StrictMode, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import './styles.css'
import PublicLayout from './PublicLayout'
import HomePage from './pages/HomePage'
import ServicesOverviewPage from './pages/ServicesOverviewPage'
import ServiceCategoryPage from './pages/ServiceCategoryPage'
import HowItWorksPage from './pages/HowItWorksPage'
import AboutPage from './pages/AboutPage'
import FaqPage from './pages/FaqPage'
import PolicyPage from './pages/PolicyPage'
import TermsPage from './pages/TermsPage'
import ContactPage from './pages/ContactPage'
import { isSupabaseConfigured, supabase } from './supabase'
import Dashboard from './Dashboard'
import BulkBuyerDashboard from './BulkBuyerDashboard'
import CompleteProfileFarmer from './CompleteProfileFarmer'
import CompleteProfileService from './CompleteProfileService'
import ServiceDashboard from './ServiceDashboard'
import LogisticsDashboard from './LogisticsDashboard'
import LanguageSwitcher from './LanguageSwitcher'
import LanguageSelection from './LanguageSelection'
import Logo from './Logo'
import PincodeHint, { PINCODE_PATTERN } from './PincodeHint'
import { getStoredLanguage, storeLanguage, useTranslation } from './i18n'
import { loadFarmerData, markCropHarvested } from './api/farmer'
import { loadLogisticsData } from './api/logistics'
import { loadBuyerData } from './api/buyer'
import { loadServiceData } from './api/service'
import { loadUserRole } from './api/profile'
import { requestEmailOtp, verifyEmailOtpCode } from './api/aiBackend'

const FONT_SIZE_LEVELS = [87.5, 93.75, 100, 106.25, 112.5]
const DEFAULT_FONT_SIZE_LEVEL = 2
const SATURATION_LEVELS = [0.55, 0.8, 1, 1.35]
const DEFAULT_SATURATION_LEVEL = 2
const SPEECH_LANG_CODES = { en: 'en-US', hi: 'hi-IN', te: 'te-IN', ta: 'ta-IN', ml: 'ml-IN', kn: 'kn-IN', mr: 'mr-IN', bn: 'bn-IN' }
const PHONE_EMAIL_DOMAIN = 'phone.farmdirect.internal'
const phoneToSyntheticEmail = (phone) => `${String(phone).replace(/\D/g, '')}@${PHONE_EMAIL_DOMAIN}`
const isSyntheticEmail = (email) => !email || email.endsWith(`@${PHONE_EMAIL_DOMAIN}`)

const LOGISTICS_CHOICE_KEY = (userId) => `farmdirect:logistics_choice:${userId}`

function readLogisticsChoice(userId) {
  if (!userId) return null
  const value = localStorage.getItem(LOGISTICS_CHOICE_KEY(userId))
  return value === 'transport' || value === 'inventory' ? value : null
}

function rememberLogisticsChoice(userId, section) {
  if (!userId || (section !== 'transport' && section !== 'inventory')) return
  try { localStorage.setItem(LOGISTICS_CHOICE_KEY(userId), section) } catch { /* storage unavailable */ }
}

function logisticsSectionDone(logisticsProfile, section) {
  const profile = logisticsProfile?.profile
  const profileOK = Boolean(profile && profile.name && profile.aadhaarNumber && profile.phone && profile.address)
  if (section === 'transport') {
    return profileOK && (logisticsProfile?.vehicles || []).some((vehicle) => vehicle.type && vehicle.registrationNumber)
  }
  const inventoryState = logisticsProfile?.inventory
  return Boolean(inventoryState && inventoryState.type && inventoryState.location && inventoryState.capacity !== '' && inventoryState.fill !== '')
}

function App() {
  const [panel, setPanel] = useState(null)
  const [registerRole, setRegisterRole] = useState(null)
  const [language, setLanguage] = useState(() => getStoredLanguage() || 'en')
  const [showLanguageSelection, setShowLanguageSelection] = useState(() => !getStoredLanguage())
  const t = useTranslation(language)
  const [showAccessibilityMenu, setShowAccessibilityMenu] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [accessibility, setAccessibility] = useState({
    fontSizeLevel: DEFAULT_FONT_SIZE_LEVEL,
    saturationLevel: DEFAULT_SATURATION_LEVEL,
    screenReader: false,
    highContrast: false,
  })
  const [currentUser, setCurrentUser] = useState(null)
  const [authStatus, setAuthStatus] = useState(supabase ? 'loading' : 'unauthenticated')
  const [completingProfile, setCompletingProfile] = useState(false)
  const [quickAddCrop, setQuickAddCrop] = useState(false)
  const [chosenSection, setChosenSection] = useState(null)
  const [farmerProfile, setFarmerProfile] = useState(null)
  const [logisticsProfile, setLogisticsProfile] = useState(null)
const authRequestRef = useRef(0)
  const lastSessionUserRef = useRef(null)
  const [buyerProfile, setBuyerProfile] = useState(null)
  const [serviceProfile, setServiceProfile] = useState(null)

  async function resolveUserRole(user) {
    if (user.id) {
      try {
        const dbRole = await loadUserRole(user.id)
        if (dbRole) return dbRole
      } catch (error) {
        console.error('Could not load role from profiles:', error)
      }
    }
    return user.role || null
  }

  function clearAuthenticatedState(status = 'unauthenticated') {
    setCurrentUser(null)
    setFarmerProfile(null)
    setLogisticsProfile(null)
    setBuyerProfile(null)
    setServiceProfile(null)
    setChosenSection(null)
    setCompletingProfile(false)
    setQuickAddCrop(false)
    setPanel(null)
    setAuthStatus(status)
  }

  async function restoreSession(session) {
    const user = session?.user
    if (!user) {
      authRequestRef.current += 1
      lastSessionUserRef.current = null
      clearAuthenticatedState()
      return
    }

    if (lastSessionUserRef.current === user.id) return
    lastSessionUserRef.current = user.id
    const requestId = ++authRequestRef.current
    const metadata = user.user_metadata || {}
    const baseUser = {
      id: user.id,
      name: metadata.first_name || user.email?.split('@')[0].replace(/[._]/g, ' '),
      role: metadata.role || null,
      profileComplete: false,
      email: isSyntheticEmail(user.email) ? '' : (user.email || ''),
    }

    setAuthStatus('loading')
    setFarmerProfile(null)
    setLogisticsProfile(null)
    setCompletingProfile(false)
    setQuickAddCrop(false)

    try {
      const role = await resolveUserRole(baseUser)
      if (authRequestRef.current !== requestId) return
      const authenticatedUser = { ...baseUser, role: role || 'unknown' }
      setCurrentUser(authenticatedUser)
      const choice = readLogisticsChoice(baseUser.id)
      setChosenSection(choice)

      if (role === 'farmer') {
        const data = await loadFarmerData(baseUser.id)
        if (authRequestRef.current !== requestId) return
        setFarmerProfile(data)
        setCurrentUser((current) => current ? { ...current, name: data.name || current.name, profileComplete: data.profileComplete } : current)
      } else if (role === 'logistics') {
        const data = await loadLogisticsData(baseUser.id)
        if (authRequestRef.current !== requestId) return
        setLogisticsProfile(data)
        const profileComplete = choice ? logisticsSectionDone(data, choice) : false
        setCurrentUser((current) => current ? { ...current, name: data.name || current.name, profileComplete } : current)
      } else if (role === 'buyer') {
        const data = await loadBuyerData(user.id)
        setBuyerProfile(data)
        setCurrentUser((current) => current ? { ...current, name: data.name || current.name, profileComplete: data.profileComplete } : current)
      } else if (role === 'service') {
        const data = await loadServiceData(baseUser.id)
        if (authRequestRef.current !== requestId) return
        setServiceProfile(data)
        setCurrentUser((current) => current ? { ...current, name: data.name || current.name, profileComplete: data.profileComplete } : current)
      }
    } catch (error) {
      console.error('Could not load profile data:', error)
    } finally {
      if (authRequestRef.current === requestId) setAuthStatus('authenticated')
    }
  }

  async function handleLogout() {
authRequestRef.current += 1
    lastSessionUserRef.current = null
    clearAuthenticatedState('loading')

    try {
      const { error } = await supabase?.auth.signOut() || {}
      if (error) throw error
    } catch (error) {
      console.error('Could not sign out:', error)
    } finally {
      setAuthStatus('unauthenticated')
    }
  }

  function handleSelectLanguage(code) {
    storeLanguage(code)
    setLanguage(code)
    setShowLanguageSelection(false)
  }

  function handleSetLanguage(code) {
    storeLanguage(code)
    setLanguage(code)
  }

  useEffect(() => {
    if (!supabase) return undefined
    let active = true
    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        restoreSession(session)
      } else if (event === 'SIGNED_OUT') {
        authRequestRef.current += 1
        lastSessionUserRef.current = null
        clearAuthenticatedState()
      }
    })

    supabase.auth.getSession()
      .then(({ data }) => {
        if (!active) return
        restoreSession(data?.session || null)
      })
      .catch((error) => {
        console.error('Could not restore session:', error)
        if (active) clearAuthenticatedState()
      })

    return () => {
      active = false
      subscription?.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!menuOpen) return
    const onKey = (event) => { if (event.key === 'Escape') setMenuOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen])

  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return undefined
    if (!accessibility.screenReader) {
      window.speechSynthesis.cancel()
      return undefined
    }
    const target = document.querySelector('main') || document.body
    const utterance = new SpeechSynthesisUtterance(target.innerText)
    utterance.lang = SPEECH_LANG_CODES[language] || SPEECH_LANG_CODES.en
    const voices = window.speechSynthesis.getVoices()
    const matchingVoice = voices.find((voice) => voice.lang === utterance.lang) || voices.find((voice) => voice.lang.startsWith(language))
    if (matchingVoice) utterance.voice = matchingVoice
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(utterance)
    return () => window.speechSynthesis.cancel()
  }, [accessibility.screenReader, language])

  if (authStatus === 'loading') return <AuthLoadingScreen language={language} />

  function handleChooseSection(section) {
    rememberLogisticsChoice(currentUser?.id, section)
    setChosenSection(section)
  }

  function handleLogisticsSave(data) {
    setLogisticsProfile(data)
    const profileComplete = chosenSection ? logisticsSectionDone(data, chosenSection) : false
    setCurrentUser((user) => user ? { ...user, name: data.name || user.name, profileComplete } : user)
  }

  const copy = language === 'hi' ? {
    about: 'परियोजना के बारे में', how: 'यह कैसे काम करता है', login: 'लॉग इन', register: 'रजिस्टर',
    navServices: 'हमारी सेवाएं', navHow: 'यह कैसे काम करता है', navAbout: 'परियोजना के बारे में',
    title: 'हमारा भोजन उगाने वालों के लिए बेहतर कीमतें।',
    hero: 'किसानों और उपभोक्ताओं के बीच सीधा संपर्क, जिससे किसानों को अधिक कमाई और परिवारों को उचित मूल्य पर ताज़ी उपज मिल सके।',
    join: 'प्लेटफ़ॉर्म से जुड़ें', middlemen: 'अनावश्यक बिचौलिए', connection: 'किसान से खरीदार का सीधा संपर्क', transparency: '100% मूल्य पारदर्शिता',
    challenge: 'चुनौती', mission: 'एक सरल लक्ष्य: भोजन की यात्रा को अधिक निष्पक्ष बनाना।',
    missionText: 'कई बिचौलिए किसानों की कमाई घटाते हैं और उपभोक्ताओं की कीमतें बढ़ाते हैं। F2C एक पारदर्शी प्लेटफ़ॉर्म के ज़रिए दोनों पक्षों को करीब लाता है।',
    accessibility: 'सुलभता', language: 'भाषा',
    fontSize: 'फ़ॉन्ट आकार', saturation: 'संतृप्ति', screenReader: 'स्क्रीन रीडर', highContrastTheme: 'हाई कॉन्ट्रास्ट थीम', resetLabel: 'रीसेट',
    faq: 'सामान्य प्रश्न', shippingPolicy: 'शिपिंग नीति', policy: 'नीति', cancelPolicy: 'रद्द करने की नीति', termsConditions: 'नियम व शर्तें', contactUs: 'संपर्क करें',
    svcFarmers: 'किसान', svcMarketplace: 'बाज़ार', svcProcessing: 'प्रसंस्करण इकाई', svcLogistics: 'लॉजिस्टिक्स'
  } : language === 'te' ? {
    about: 'ప్రాజెక్ట్ గురించి', how: 'ఇది ఎలా పనిచేస్తుంది', login: 'లాగిన్', register: 'నమోదు',
    navServices: 'మా సేవలు', navHow: 'ఇది ఎలా పనిచేస్తుంది', navAbout: 'ప్రాజెక్ట్ గురించి',
    title: 'మన ఆహారాన్ని పండించే వారికి మెరుగైన ధరలు.',
    hero: 'రైతులు మరియు వినియోగదారుల మధ్య ప్రత్యక్ష అనుసంధానం. రైతులకు ఎక్కువ ఆదాయం, కుటుంబాలకు సరసమైన ధరకు తాజా ఉత్పత్తులు.',
    join: 'ప్లాట్‌ఫారమ్‌లో చేరండి', middlemen: 'అనవసర మధ్యవర్తులు', connection: 'రైతు నుండి కొనుగోలుదారుకు ప్రత్యక్ష అనుసంధానం', transparency: 'ధరలో పూర్తి పారదర్శకత',
    challenge: 'సవాలు', mission: 'ఒకే లక్ష్యం: ఆహార ప్రయాణాన్ని మరింత న్యాయంగా చేయడం.',
    missionText: 'అనేక మధ్యవర్తులు రైతుల ఆదాయాన్ని తగ్గించి వినియోగదారుల ధరలను పెంచుతారు. F2C పారదర్శక వేదిక ద్వారా ఇరుపక్షాలను దగ్గర చేస్తుంది.',
    accessibility: 'అందుబాటు', language: 'భాష',
    fontSize: 'ఫాంట్ పరిమాణం', saturation: 'సంతృప్తత', screenReader: 'స్క్రీన్ రీడర్', highContrastTheme: 'హై కాంట్రాస్ట్ థీమ్', resetLabel: 'రీసెట్',
    faq: 'తరచుగా అడిగే ప్రశ్నలు', shippingPolicy: 'షిప్పింగ్ విధానం', policy: 'విధానం', cancelPolicy: 'రద్దు విధానం', termsConditions: 'నిబంధనలు & షరతులు', contactUs: 'మమ్మల్ని సంప్రదించండి',
    svcFarmers: 'రైతులు', svcMarketplace: 'మార్కెట్ ప్లేస్', svcProcessing: 'ప్రాసెసింగ్ యూనిట్', svcLogistics: 'లాజిస్టిక్స్'
  } : language === 'ta' ? {
    about: 'திட்டத்தைப் பற்றி', how: 'இது எப்படி செயல்படுகிறது', login: 'உள்நுழைவு', register: 'பதிவு',
    navServices: 'எங்கள் சேவைகள்', navHow: 'இது எப்படி செயல்படுகிறது', navAbout: 'திட்டத்தைப் பற்றி',
    title: 'நமது உணவை விளைவிப்பவர்களுக்கு சிறந்த விலைகள்.',
    hero: 'விவசாயிகளுக்கும் நுகர்வோருக்கும் நேரடி இணைப்பு. விவசாயிகள் அதிகம் சம்பாதிக்கவும், குடும்பங்கள் நியாயமான விலையில் புதிய விளைபொருட்களை வாங்கவும் உதவுகிறது.',
    join: 'தளத்தில் இணையுங்கள்', middlemen: 'தேவையற்ற இடைத்தரகர்கள்', connection: 'விவசாயி முதல் வாங்குபவர் வரை நேரடி இணைப்பு', transparency: 'முழு விலை வெளிப்படைத்தன்மை',
    challenge: 'சவால்', mission: 'ஒரே குறிக்கோள்: உணவுப் பயணத்தை நியாயமானதாக மாற்றுவது.',
    missionText: 'பல இடைத்தரகர்கள் விவசாயிகளின் வருமானத்தைக் குறைத்து நுகர்வோர் விலைகளை அதிகரிக்கின்றனர். F2C வெளிப்படையான தளத்தின் மூலம் இரு தரப்பினரையும் இணைக்கிறது.',
    accessibility: 'அணுகல்தன்மை', language: 'மொழி',
    fontSize: 'எழுத்துரு அளவு', saturation: 'செறிவூட்டல்', screenReader: 'திரை வாசகர்', highContrastTheme: 'உயர் மாறுபாடு தீம்', resetLabel: 'மீட்டமை',
    faq: 'அடிக்கடி கேட்கப்படும் கேள்விகள்', shippingPolicy: 'அனுப்புகை கொள்கை', policy: 'கொள்கை', cancelPolicy: 'ரத்து கொள்கை', termsConditions: 'விதிமுறைகள் & நிபந்தனைகள்', contactUs: 'எங்களை தொடர்பு கொள்ள',
    svcFarmers: 'விவசாயிகள்', svcMarketplace: 'சந்தை இடம்', svcProcessing: 'செயலாக்க அலகு', svcLogistics: 'லாஜிஸ்டிக்'
  } : language === 'ml' ? {
    about: 'പ്രോജക്റ്റിനെക്കുറിച്ച്', how: 'ഇത് എങ്ങനെ പ്രവർത്തിക്കുന്നു', login: 'ലോഗിൻ', register: 'രജിസ്റ്റർ',
    navServices: 'ഞങ്ങളുടെ സേവനങ്ങൾ', navHow: 'ഇത് എങ്ങനെ പ്രവർത്തിക്കുന്നു', navAbout: 'പ്രോജക്റ്റിനെക്കുറിച്ച്',
    title: 'നമ്മുടെ ഭക്ഷണം കൃഷി ചെയ്യുന്നവർക്ക് മികച്ച വിലകൾ.',
    hero: 'കർഷകരെയും ഉപഭോക്താക്കളെയും നേരിട്ട് ബന്ധിപ്പിക്കുന്നു. കർഷകർക്ക് കൂടുതൽ വരുമാനവും കുടുംബങ്ങൾക്ക് ന്യായമായ വിലയിൽ പുതിയ ഉൽപ്പന്നങ്ങളും ലഭിക്കുന്നു.',
    join: 'പ്ലാറ്റ്‌ഫോമിൽ ചേരുക', middlemen: 'അനാവശ്യ ഇടനിലക്കാർ', connection: 'കർഷകനിൽ നിന്ന് വാങ്ങുന്നയാളിലേക്ക് നേരിട്ടുള്ള ബന്ധം', transparency: 'പൂർണ്ണ വില സുതാര്യത',
    challenge: 'വെല്ലുവിളി', mission: 'ഒരേയൊരു ലക്ഷ്യം: ഭക്ഷണ യാത്ര കൂടുതൽ നീതിയുക്തമാക്കുക.',
    missionText: 'നിരവധി ഇടനിലക്കാർ കർഷകരുടെ വരുമാനം കുറയ്ക്കുകയും ഉപഭോക്തൃ വില വർധിപ്പിക്കുകയും ചെയ്യുന്നു. F2C സുതാര്യമായ ഒരു പ്ലാറ്റ്‌ഫോമിലൂടെ ഇരുപക്ഷത്തെയും അടുപ്പിക്കുന്നു.',
    accessibility: 'പ്രവേശനക്ഷമത', language: 'ഭാഷ',
    fontSize: 'ഫോണ്ട് വലുപ്പം', saturation: 'സാച്ചുറേഷൻ', screenReader: 'സ്ക്രീൻ റീഡർ', highContrastTheme: 'ഹൈ കോൺട്രാസ്റ്റ് തീം', resetLabel: 'പുനഃസജ്ജമാക്കുക',
    faq: 'പതിവ് ചോദ്യങ്ങൾ', shippingPolicy: 'ഷിപ്പിംഗ് നയം', policy: 'നയം', cancelPolicy: 'റദ്ദാക്കൽ നയം', termsConditions: 'നിബന്ധനകളും വ്യവസ്ഥകളും', contactUs: 'ഞങ്ങളെ ബന്ധപ്പെടുക',
    svcFarmers: 'കർഷകർ', svcMarketplace: 'മാർക്കറ്റ് പ്ലേസ്', svcProcessing: 'പ്രോസസ്സിംഗ് യൂണിറ്റ്', svcLogistics: 'ലോജിസ്റ്റിക്'
  } : language === 'kn' ? {
    about: 'ಯೋಜನೆಯ ಬಗ್ಗೆ', how: 'ಇದು ಹೇಗೆ ಕೆಲಸ ಮಾಡುತ್ತದೆ', login: 'ಲಾಗಿನ್', register: 'ನೋಂದಣಿ',
    navServices: 'ನಮ್ಮ ಸೇವೆಗಳು', navHow: 'ಇದು ಹೇಗೆ ಕೆಲಸ ಮಾಡುತ್ತದೆ', navAbout: 'ಯೋಜನೆಯ ಬಗ್ಗೆ',
    title: 'ನಮ್ಮ ಆಹಾರವನ್ನು ಬೆಳೆಸುವವರಿಗೆ ಉತ್ತಮ ಬೆಲೆಗಳು.',
    hero: 'ರೈತರು ಮತ್ತು ಗ್ರಾಹಕರ ನಡುವೆ ನೇರ ಸಂಪರ್ಕ. ರೈತರಿಗೆ ಹೆಚ್ಚು ಆದಾಯ ಮತ್ತು ಕುಟುಂಬಗಳಿಗೆ ನ್ಯಾಯಯುತ ಬೆಲೆಯಲ್ಲಿ ತಾಜಾ ಉತ್ಪನ್ನಗಳನ್ನು ಒದಗಿಸುತ್ತದೆ.',
    join: 'ವೇದಿಕೆಗೆ ಸೇರಿ', middlemen: 'ಅನಗತ್ಯ ಮಧ್ಯವರ್ತಿಗಳು', connection: 'ರೈತರಿಂದ ಖರೀದಿದಾರರಿಗೆ ನೇರ ಸಂಪರ್ಕ', transparency: '100% ಬೆಲೆ ಪಾರದರ್ಶಕತೆ',
    challenge: 'ಸವಾಲು', mission: 'ಒಂದು ಸರಳ ಗುರಿ: ಆಹಾರದ ಪ್ರಯಾಣವನ್ನು ಹೆಚ್ಚು ನ್ಯಾಯಯುತಗೊಳಿಸುವುದು.',
    missionText: 'ಹಲವು ಮಧ್ಯವರ್ತಿಗಳು ರೈತರ ಆದಾಯವನ್ನು ಕಡಿಮೆ ಮಾಡಿ ಗ್ರಾಹಕರ ಬೆಲೆಗಳನ್ನು ಹೆಚ್ಚಿಸುತ್ತಾರೆ. F2C ಪಾರದರ್ಶಕ ವೇದಿಕೆಯ ಮೂಲಕ ಎರಡೂ ಬದಿಗಳನ್ನು ಹತ್ತಿರ ತರುತ್ತದೆ.',
    accessibility: 'ಪ್ರವೇಶಿಸುವಿಕೆ', language: 'ಭಾಷೆ',
    fontSize: 'ಫಾಂಟ್ ಗಾತ್ರ', saturation: 'ಸ್ಯಾಚುರೇಶನ್', screenReader: 'ಸ್ಕ್ರೀನ್ ರೀಡರ್', highContrastTheme: 'ಹೈ ಕಾಂಟ್ರಾಸ್ಟ್ ಥೀಮ್', resetLabel: 'ಮರುಹೊಂದಿಸಿ',
    faq: 'ಪದೇ ಪದೇ ಕೇಳಲಾಗುವ ಪ್ರಶ್ನೆಗಳು', shippingPolicy: 'ಶಿಪ್ಪಿಂಗ್ ನೀತಿ', policy: 'ನೀತಿ', cancelPolicy: 'ರದ್ದತಿ ನೀತಿ', termsConditions: 'ನಿಯಮಗಳು ಮತ್ತು ಷರತ್ತುಗಳು', contactUs: 'ನಮ್ಮನ್ನು ಸಂಪರ್ಕಿಸಿ',
    svcFarmers: 'ರೈತರು', svcMarketplace: 'ಮಾರುಕಟ್ಟೆ', svcProcessing: 'ಸಂಸ್ಕರಣಾ ಘಟಕ', svcLogistics: 'ಲಾಜಿಸ್ಟಿಕ್ಸ್'
  } : language === 'mr' ? {
    about: 'प्रकल्पाबद्दल', how: 'हे कसे कार्य करते', login: 'लॉग इन', register: 'नोंदणी करा',
    navServices: 'आमच्या सेवा', navHow: 'हे कसे कार्य करते', navAbout: 'प्रकल्पाबद्दल',
    title: 'आपले अन्न पिकवणाऱ्यांसाठी चांगल्या किमती.',
    hero: 'शेतकरी आणि ग्राहकांमधील थेट संपर्क, ज्यामुळे शेतकऱ्यांना अधिक कमाई आणि कुटुंबांना योग्य किमतीत ताजा भाजीपाला मिळतो.',
    join: 'प्लॅटफॉर्ममध्ये सामील व्हा', middlemen: 'अनावश्यक मध्यस्थ', connection: 'शेतकरी ते खरेदीदार थेट संपर्क', transparency: '100% किंमत पारदर्शकता',
    challenge: 'आव्हान', mission: 'एक साधे ध्येय: अन्नाचा प्रवास अधिक न्याय्य बनवणे.',
    missionText: 'अनेक मध्यस्थ शेतकऱ्यांची कमाई कमी करतात आणि ग्राहकांच्या किमती वाढवतात. F2C एका पारदर्शक प्लॅटफॉर्मद्वारे दोन्ही बाजूंना जवळ आणते.',
    accessibility: 'सुलभता', language: 'भाषा',
    fontSize: 'फॉन्ट आकार', saturation: 'संपृक्तता', screenReader: 'स्क्रीन रीडर', highContrastTheme: 'हाय काँट्रास्ट थीम', resetLabel: 'रीसेट',
    faq: 'वारंवार विचारले जाणारे प्रश्न', shippingPolicy: 'शिपिंग धोरण', policy: 'धोरण', cancelPolicy: 'रद्द करण्याचे धोरण', termsConditions: 'नियम व अटी', contactUs: 'आमच्याशी संपर्क साधा',
    svcFarmers: 'शेतकरी', svcMarketplace: 'मार्केट प्लेस', svcProcessing: 'प्रक्रिया युनिट', svcLogistics: 'लॉजिस्टिक'
  } : language === 'bn' ? {
    about: 'প্রকল্প সম্পর্কে', how: 'এটি কীভাবে কাজ করে', login: 'লগ ইন', register: 'নিবন্ধন',
    navServices: 'আমাদের পরিষেবা', navHow: 'এটি কীভাবে কাজ করে', navAbout: 'প্রকল্প সম্পর্কে',
    title: 'আমাদের খাদ্য উৎপাদনকারীদের জন্য ভালো দাম।',
    hero: 'কৃষক ও ভোক্তাদের মধ্যে সরাসরি সংযোগ, যা কৃষকদের বেশি আয় করতে এবং পরিবারগুলিকে ন্যায্য মূল্যে তাজা ফসল কিনতে সাহায্য করে।',
    join: 'প্ল্যাটফর্মে যোগ দিন', middlemen: 'অপ্রয়োজনীয় মধ্যস্বত্বভোগী', connection: 'কৃষক থেকে ক্রেতার সরাসরি সংযোগ', transparency: '১০০% মূল্য স্বচ্ছতা',
    challenge: 'চ্যালেঞ্জ', mission: 'একটি সহজ লক্ষ্য: খাদ্যের যাত্রাকে আরও ন্যায্য করা।',
    missionText: 'অনেক মধ্যস্বত্বভোগী কৃষকদের আয় কমিয়ে দেয় এবং ভোক্তাদের দাম বাড়িয়ে দেয়। F2C একটি স্বচ্ছ প্ল্যাটফর্মের মাধ্যমে উভয় পক্ষকে কাছাকাছি নিয়ে আসে।',
    accessibility: 'অ্যাক্সেসিবিলিটি', language: 'ভাষা',
    fontSize: 'ফন্ট সাইজ', saturation: 'স্যাচুরেশন', screenReader: 'স্ক্রিন রিডার', highContrastTheme: 'হাই কনট্রাস্ট থিম', resetLabel: 'রিসেট',
    faq: 'প্রায়শই জিজ্ঞাসিত প্রশ্ন', shippingPolicy: 'শিপিং নীতি', policy: 'নীতি', cancelPolicy: 'বাতিলকরণ নীতি', termsConditions: 'শর্তাবলী', contactUs: 'যোগাযোগ করুন',
    svcFarmers: 'কৃষক', svcMarketplace: 'মার্কেটপ্লেস', svcProcessing: 'প্রসেসিং ইউনিট', svcLogistics: 'লজিস্টিক'
  } : {
    about: 'About the project', how: 'How it works', login: 'Login', register: 'Register',
    navServices: 'Our Services', navHow: 'How it works', navAbout: 'About',
    title: 'Better prices for the people who grow our food.',
    hero: 'A direct connection between farmers and consumers, helping farmers earn more and families buy fresh produce at a fair price.',
    join: 'Join the platform', middlemen: 'Unnecessary middlemen', connection: 'Farmer to buyer connection', transparency: 'Price transparency',
    challenge: 'THE CHALLENGE', mission: 'One simple goal: make the food journey fairer.',
    missionText: 'Multiple intermediaries reduce farmers’ earnings and increase consumer prices. F2C brings both sides closer together through one transparent platform.',
    accessibility: 'Accessibility', language: 'Language',
    fontSize: 'Font Size', saturation: 'Saturation', screenReader: 'Screen Reader', highContrastTheme: 'High Contrast Theme', resetLabel: 'Reset',
    faq: 'FAQ', shippingPolicy: 'Shipping Policy', policy: 'Policy', cancelPolicy: 'cancel policy', termsConditions: 'Terms & Conditions', contactUs: 'Contact Us',
    svcFarmers: 'Farmers', svcMarketplace: 'Market Place', svcProcessing: 'Processing Unit', svcLogistics: 'Logistic'
  }

  const navItems = [
    { key: 'services', label: copy.navServices, href: '/services' },
    { key: 'how', label: copy.navHow, href: '/how-it-works' },
    { key: 'about', label: copy.navAbout, href: '/about' },
  ]

  const footerLinks = [
    { key: 'faq', label: copy.faq, href: '/faq' },
    { key: 'policy', label: copy.policy, href: '/policy' },
    { key: 'terms', label: copy.termsConditions, href: '/terms' },
    { key: 'contact', label: copy.contactUs, href: '/contact' },
  ]

  const servicesLinks = [
    { key: 'svc-farmers', label: copy.svcFarmers, href: '/services/farmers' },
    { key: 'svc-marketplace', label: copy.svcMarketplace, href: '/services/marketplace' },
    { key: 'svc-processing', label: copy.svcProcessing, href: '/services/processing-unit' },
    { key: 'svc-logistics', label: copy.svcLogistics, href: '/services/logistics' },
  ]

  const NAV_SUBMENUS = { about: footerLinks, services: servicesLinks }

  function openRegister(role) {
    setRegisterRole(role)
    setPanel('register')
  }

  const serviceOfferings = [
    { id: 'farmers', icon: '🌱', title: copy.svcFarmers, desc: t.farmerRoleDesc, role: 'farmer' },
    { id: 'marketplace', icon: '🏪', title: copy.svcMarketplace, desc: t.buyerRoleDesc, role: 'buyer' },
    { id: 'processing-unit', icon: '🛠', title: copy.svcProcessing, desc: t.serviceRoleDesc, role: 'service' },
    { id: 'logistics', icon: '🚚', title: copy.svcLogistics, desc: t.logisticsRoleDesc, role: 'logistics' },
  ]

  const toggleAccessibility = (key) => setAccessibility((current) => ({ ...current, [key]: !current[key] }))
  const setFontSizeLevel = (level) => setAccessibility((current) => ({ ...current, fontSizeLevel: Math.max(0, Math.min(FONT_SIZE_LEVELS.length - 1, level)) }))
  const setSaturationLevel = (level) => setAccessibility((current) => ({ ...current, saturationLevel: Math.max(0, Math.min(SATURATION_LEVELS.length - 1, level)) }))
  const accessibilityClass = accessibility.highContrast ? 'high-contrast' : ''
  const accessibilityStyle = {
    zoom: `${FONT_SIZE_LEVELS[accessibility.fontSizeLevel]}%`,
    filter: [accessibility.highContrast && 'contrast(1.15)', `saturate(${SATURATION_LEVELS[accessibility.saturationLevel]})`].filter(Boolean).join(' '),
  }

  if (showLanguageSelection) {
    return <LanguageSelection onSelect={handleSelectLanguage} />
  }

  if (currentUser && completingProfile && currentUser.role === 'service') {
    return (
      <CompleteProfileService
        userId={currentUser.id}
        language={language}
        setLanguage={handleSetLanguage}
        initialData={serviceProfile}
        onBack={() => setCompletingProfile(false)}
        onComplete={(data) => {
          setServiceProfile(data)
          setCurrentUser((user) => ({ ...user, name: data.name || user.name, profileComplete: data.profileComplete }))
          setCompletingProfile(false)
        }}
      />
    )
  }

  if (currentUser && completingProfile) {
    return (
      <CompleteProfileFarmer
        userId={currentUser.id}
        language={language}
        setLanguage={handleSetLanguage}
        initialData={farmerProfile}
        currentEmail={currentUser.email}
        onEmailUpdateRequested={(newEmail) => setCurrentUser((user) => ({ ...user, pendingEmail: newEmail }))}
        initialStep={quickAddCrop ? 1 : 0}
        addCropOnOpen={quickAddCrop}
        onBack={() => { setCompletingProfile(false); setQuickAddCrop(false) }}
        onComplete={(data) => {
          setFarmerProfile(data)
          setCurrentUser((user) => ({ ...user, name: data.name || user.name, profileComplete: data.profileComplete }))
          setCompletingProfile(false)
          setQuickAddCrop(false)
        }}
      />
    )
  }

  if (currentUser && currentUser.role === 'buyer') {
    return (
      <BulkBuyerDashboard
        user={currentUser}
        buyerProfile={buyerProfile}
        language={language}
        setLanguage={handleSetLanguage}
        onLogout={handleLogout}
      />
    )
  }

  if (currentUser) {
    if (currentUser.role === 'logistics') {
      return (
        <LogisticsDashboard
          user={currentUser}
          logisticsProfile={logisticsProfile}
          language={language}
          setLanguage={handleSetLanguage}
          chosenSection={chosenSection}
          onChooseSection={handleChooseSection}
          onComplete={handleLogisticsSave}
          onLogout={handleLogout}
        />
      )
    }
    if (currentUser.role === 'service') {
      return (
        <ServiceDashboard
          user={currentUser}
          serviceProfile={serviceProfile}
          language={language}
          setLanguage={handleSetLanguage}
          onOpenCompleteProfile={() => setCompletingProfile(true)}
          onLogout={handleLogout}
        />
      )
    }
    if (currentUser.role === 'farmer') {
      return (
        <Dashboard
          user={currentUser}
          farmerProfile={farmerProfile}
          language={language}
          setLanguage={handleSetLanguage}
          onOpenCompleteProfile={() => setCompletingProfile(true)}
          onQuickAddCrop={() => { setQuickAddCrop(true); setCompletingProfile(true) }}
          onMarkCropHarvested={(cropId) => {
            const today = new Date().toISOString().slice(0, 10)
            setFarmerProfile((profile) => (profile
              ? { ...profile, crops: profile.crops.map((crop) => (crop.id === cropId ? { ...crop, harvested: true, actualHarvestDate: today } : crop)) }
              : profile))
            markCropHarvested(cropId).catch((error) => console.error('Could not save harvest confirmation:', error))
          }}
          onLogout={handleLogout}
        />
      )
    }
    return (
      <RolePlaceholder
        user={currentUser}
        language={language}
        setLanguage={handleSetLanguage}
        onLogout={handleLogout}
      />
    )
  }

  return (
    <>
      <Routes>
        <Route
          element={
            <PublicLayout
              language={language}
              t={t}
              copy={copy}
              navItems={navItems}
              NAV_SUBMENUS={NAV_SUBMENUS}
              menuOpen={menuOpen}
              setMenuOpen={setMenuOpen}
              showAccessibilityMenu={showAccessibilityMenu}
              setShowAccessibilityMenu={setShowAccessibilityMenu}
              accessibility={accessibility}
              toggleAccessibility={toggleAccessibility}
              setFontSizeLevel={setFontSizeLevel}
              setSaturationLevel={setSaturationLevel}
              fontSizeLevels={FONT_SIZE_LEVELS}
              saturationLevels={SATURATION_LEVELS}
              defaultFontSizeLevel={DEFAULT_FONT_SIZE_LEVEL}
              defaultSaturationLevel={DEFAULT_SATURATION_LEVEL}
              accessibilityClass={accessibilityClass}
              accessibilityStyle={accessibilityStyle}
              setPanel={setPanel}
              handleSetLanguage={handleSetLanguage}
              openRegister={openRegister}
              serviceOfferings={serviceOfferings}
              servicesLinks={servicesLinks}
            />
          }
        >
          <Route index element={<HomePage />} />
          <Route path="services" element={<ServicesOverviewPage />} />
          <Route path="services/:categoryId" element={<ServiceCategoryPage />} />
          <Route path="how-it-works" element={<HowItWorksPage />} />
          <Route path="about" element={<AboutPage />} />
          <Route path="faq" element={<FaqPage />} />
          <Route path="policy" element={<PolicyPage />} />
          <Route path="terms" element={<TermsPage />} />
          <Route path="contact" element={<ContactPage />} />
        </Route>
      </Routes>
      {panel && (
        <AuthPanel
          key={panel}
          type={panel}
          language={language}
          setLanguage={handleSetLanguage}
          initialRole={registerRole}
          onClose={() => { setPanel(null); setRegisterRole(null) }}
          onSwitch={() => setPanel(panel === 'login' ? 'register' : 'login')}
        />
      )}
    </>
  )
}

function RolePlaceholder({ user, language, setLanguage, onLogout }) {
  const t = useTranslation(language)
  const initials = (user.name || 'U').trim().split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase() || 'U'
  return (
    <div className="dashboard-shell">
      <aside className="dash-sidebar">
        <div className="dash-brand"><Logo /></div>
        <button className="dash-logout" onClick={onLogout}><span aria-hidden="true">⤶</span> {t.logout}</button>
      </aside>
      <main className="dash-main">
        <header className="dash-topbar">
          <div>
            <p className="dash-greeting-eyebrow">{t.dashboardLabel}</p>
            <h2 className="dash-greeting">{t.welcomeBack}{user.name ? `, ${user.name.split(' ')[0]}` : ''}</h2>
          </div>
          <div className="dash-topbar-actions">
            <LanguageSwitcher language={language} setLanguage={setLanguage} />
            <div className="dash-avatar" tabIndex={0}>{initials}</div>
          </div>
        </header>
        <div className="empty-card" style={{ padding: '42px 32px' }}>
          <p className="eyebrow">{t.rolePlaceholderEyebrow}</p>
          <h2 className="dash-greeting" style={{ margin: '10px 0 8px' }}>{t.rolePlaceholderTitle}</h2>
          <p className="panel-subtitle">{t.rolePlaceholderSub.replace('{role}', user.role || '—')}</p>
          <button className="button button-primary" style={{ marginTop: 18 }} onClick={onLogout}>{t.logout}</button>
        </div>
      </main>
    </div>
  )
}

function AuthLoadingScreen({ language }) {
  const t = useTranslation(language)
  return (
    <main className="auth-loading" aria-live="polite" aria-busy="true">
      <div className="auth-loading-mark" aria-hidden="true">✦</div>
      <strong>F<span>2</span>C</strong>
      <p>{t.restoringSession}</p>
    </main>
  )
}


const NAME_PATTERN = /^(?=(?:[^A-Za-z]*[A-Za-z]){3,})[A-Za-z\s'.\-]+$/
const PHONE_PATTERN = /^[6-9][0-9]{9}$/
const PASSWORD_PATTERN = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/
const WEAK_PASSWORDS = new Set([
  '12345678', '123456789', '1234567890', 'password', 'password1', 'password123',
  'qwerty123', 'letmein1', 'welcome1', 'abc12345', 'iloveyou1',
])

function validateRegistration(t, { name, phone, pincode, password, confirmPassword }) {
  if (!NAME_PATTERN.test(name.trim())) return t.validationNameInvalid
  if (!PHONE_PATTERN.test(phone.trim())) return t.validationPhoneInvalid
  if (!PINCODE_PATTERN.test(pincode.trim())) return t.validationPincodeInvalid
  if (!PASSWORD_PATTERN.test(password)) return t.validationPasswordWeak
  if (WEAK_PASSWORDS.has(password.toLowerCase())) return t.validationPasswordCommon
  if (password.toLowerCase().includes(phone.trim())) return t.validationPasswordPhone
  if (password !== confirmPassword) return t.passwordsDontMatch
  return null
}

const inputClass = 'w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3.5 py-3 text-[15px] text-[var(--text-primary)] outline-none transition-shadow focus:border-brand-400 focus:shadow-[0_0_0_3px_var(--color-brand-50)]'
const labelClass = 'grid gap-1.5 text-xs font-semibold text-[var(--text-secondary)]'

function SlidingToggle({ options, value, onChange, ariaLabel }) {
  const n = options.length
  const compact = n > 2
  const activeIndex = Math.max(0, options.findIndex((opt) => opt.key === value))
  return (
    <div className="relative rounded-xl bg-brand-50 p-1" role="tablist" aria-label={ariaLabel}>
      <div className="relative grid" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
        <span
          aria-hidden="true"
          className="absolute inset-y-0 rounded-lg bg-white shadow-sm transition-transform duration-300 ease-out"
          style={{ width: `${100 / n}%`, transform: `translateX(${activeIndex * 100}%)` }}
        />
        {options.map((opt) => (
          <button
            key={opt.key}
            type="button"
            role="tab"
            aria-selected={value === opt.key}
            onClick={() => onChange(opt.key)}
            className={`relative z-10 flex min-w-0 items-center justify-center gap-1 rounded-lg font-semibold transition-colors duration-300 ${compact ? 'flex-col px-1 py-2 text-[11px] leading-tight' : 'px-3.5 py-2.5 text-sm'} ${
              value === opt.key ? 'text-brand-700' : 'text-[var(--text-muted)] hover:text-brand-600'
            }`}
          >
            {opt.icon && <span aria-hidden="true" className={compact ? 'text-base' : ''}>{opt.icon}</span>}
            <span className="truncate">{opt.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function EmailOtpLogin({ t, onClose }) {
  const [stage, setStage] = useState('request')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function requestCode(event) {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      // Sent by our own AI backend (via Resend), not Supabase's built-in
      // mailer -- see email_otp.py for why.
      await requestEmailOtp(email.trim())
      setStage('sent')
    } catch (err) {
      setError(err.message || t.genericError)
    } finally {
      setLoading(false)
    }
  }

  async function verifyCode(event) {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { token_hash: tokenHash } = await verifyEmailOtpCode(email.trim(), code.trim())
      const { error: verifyError } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'email' })
      if (verifyError) throw verifyError
      onClose()
    } catch (err) {
      setError(err.message || t.genericError)
    } finally {
      setLoading(false)
    }
  }

  if (stage === 'sent') {
    return (
      <form onSubmit={verifyCode} className="grid gap-4">
        <p className="text-sm text-[var(--text-muted)]">{t.otpSentTo.replace('{email}', email)}</p>
        <label className={labelClass}>{t.otpCodeLabel}
          <input className={inputClass} inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="123456" required />
        </label>
        {error && <p className="rounded-lg border-l-4 border-[var(--color-error)] bg-[var(--color-error-bg)] px-3 py-2.5 text-xs text-[var(--color-error-ink)]" role="alert">{error}</p>}
        <button className="mt-1 inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-wait disabled:opacity-70" type="submit" disabled={loading}>
          {loading ? t.pleaseWait : t.verifyCode}
        </button>
        <button type="button" className="text-xs font-semibold text-brand-600" onClick={() => setStage('request')}>{t.useDifferentEmail}</button>
      </form>
    )
  }

  return (
    <form onSubmit={requestCode} className="grid gap-4">
      <label className={labelClass}>{t.email}
        <input className={inputClass} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t.emailPlaceholder} required />
      </label>
      {error && <p className="rounded-lg border-l-4 border-[var(--color-error)] bg-[var(--color-error-bg)] px-3 py-2.5 text-xs text-[var(--color-error-ink)]" role="alert">{error}</p>}
      <button className="mt-1 inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-wait disabled:opacity-70" type="submit" disabled={loading}>
        {loading ? t.pleaseWait : t.sendCode}
      </button>
      <p className="text-[11px] text-[var(--text-muted)]">{t.otpRequiresEmailOnFile}</p>
    </form>
  )
}

function AuthPanel({ type, onClose, onSwitch, language, setLanguage, initialRole }) {
  const t = useTranslation(language)
  const isRegister = type === 'register'
  const [role, setRole] = useState(initialRole || null)
  const [submitted, setSubmitted] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [loginMode, setLoginMode] = useState('password')
  const [loginRole, setLoginRole] = useState('farmer')
  const [pincodeValue, setPincodeValue] = useState('')
  const roles = {
    farmer: { title: t.farmer, description: t.farmerRoleDesc, icon: '🌱', requiredKey: 'farm_name' },
    buyer: { title: t.bulkBuyer, description: t.buyerRoleDesc, icon: '🏪', requiredKey: 'name' },
    logistics: { title: t.logisticsProvider, description: t.logisticsRoleDesc, icon: '🚚', requiredKey: 'company_name' },
    service: { title: t.serviceProvider, description: t.serviceRoleDesc, icon: '🛠', requiredKey: 'business_name' },
  }
  const selectedRole = roles[role]

  async function handleSubmit(event) {
    event.preventDefault()
    setErrorMessage('')

    if (!isSupabaseConfigured) {
      setErrorMessage(t.supabaseNotConfigured)
      return
    }

    const formData = new FormData(event.currentTarget)
    const password = formData.get('password')
    setIsSubmitting(true)

    try {
      if (isRegister) {
        const name = formData.get('name')
        const phone = formData.get('phone')
        const pincode = formData.get('pincode')
        const validationError = validateRegistration(t, { name, phone, pincode, password, confirmPassword: formData.get('confirmPassword') })
        if (validationError) throw new Error(validationError)

        const syntheticEmail = phoneToSyntheticEmail(phone)
        const { error } = await supabase.auth.signUp({
          email: syntheticEmail,
          password,
          options: {
            data: {
              first_name: name,
              last_name: '',
              phone,
              role,
              registration_details: {
                pincode,
                [selectedRole.requiredKey]: name,
              },
            },
          },
        })
        if (error) throw error

        // Registration uses a phone-derived placeholder identity (no email
        // collected here -- that's added later in profile completion), which
        // a database trigger auto-confirms server-side. signUp()'s own
        // response doesn't reliably reflect that, so sign in explicitly
        // right after to establish the session.
        const { error: signInError } = await supabase.auth.signInWithPassword({ email: syntheticEmail, password })
        if (signInError) {
          setSubmitted(true)
        } else {
          onClose()
        }
      } else {
        const phone = formData.get('phone').trim()
        if (!PHONE_PATTERN.test(phone)) throw new Error(t.validationPhoneInvalid)

        const { data: resolvedEmail, error: resolveError } = await supabase.rpc('resolve_login_email', { p_phone: phone })
        if (resolveError || !resolvedEmail) throw new Error(t.accountNotFound)

        const { error } = await supabase.auth.signInWithPassword({ email: resolvedEmail, password })
        if (error) {
          error.message = error.code === 'email_not_confirmed' ? t.emailNotConfirmed : error.message
          throw error
        }
        onClose()
      }
    } catch (error) {
      setErrorMessage(error.message || t.genericError)
    } finally {
      setIsSubmitting(false)
    }
  }

  const panelShell = 'w-full max-w-[455px] rounded-2xl bg-[var(--surface-raised)] p-9 shadow-2xl shadow-brand-900/25'

  if (isRegister && !role) {
    return (
      <div className="fixed inset-0 z-50 grid items-start justify-items-center overflow-y-auto bg-brand-900/45 px-4 py-8" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
        <section className={`${panelShell} relative max-w-[610px]`} role="dialog" aria-modal="true" aria-labelledby="auth-title">
          <button className="absolute right-5 top-5 flex h-8 w-8 items-center justify-center rounded-full bg-brand-50 text-xl text-[var(--text-muted)] hover:text-brand-700" aria-label={t.closeLabel} onClick={onClose}>×</button>
          <LanguageSwitcher language={language} setLanguage={setLanguage} className="mb-3.5 mr-11 inline-flex" />
          <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-brand-400">F2C</p>
          <h2 id="auth-title" className="font-display text-[28px] font-semibold text-brand-900">{t.howRegister}</h2>
          <p className="mb-6 mt-1.5 text-sm text-[var(--text-muted)]">{t.chooseAccount}</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {Object.entries(roles).map(([key, item]) => (
              <button
                className="group relative min-h-[145px] rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] p-5 text-left transition-all hover:-translate-y-0.5 hover:border-brand-400 hover:shadow-md hover:shadow-brand-900/10"
                key={key}
                onClick={() => setRole(key)}
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-100 text-lg" aria-hidden="true">{item.icon}</span>
                <strong className="mt-2.5 mb-1 block text-base text-brand-900">{item.title}</strong>
                <small className="block max-w-[190px] text-xs leading-relaxed text-[var(--text-muted)]">{item.description}</small>
                <span className="absolute bottom-4 right-4 text-brand-500 opacity-0 transition-opacity group-hover:opacity-100">→</span>
              </button>
            ))}
          </div>
          <p className="mt-6 text-center text-xs text-[var(--text-muted)]">{t.alreadyHaveAccount} <button className="font-bold text-brand-600" onClick={onSwitch}>{t.login}</button></p>
        </section>
      </div>
    )
  }

  if (submitted) {
    return (
      <div className="fixed inset-0 z-50 grid items-start justify-items-center overflow-y-auto bg-brand-900/45 px-4 py-8" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
        <section className={`${panelShell} relative max-w-[480px] text-center`} role="dialog" aria-modal="true" aria-labelledby="auth-title">
          <button className="absolute right-5 top-5 flex h-8 w-8 items-center justify-center rounded-full bg-brand-50 text-xl text-[var(--text-muted)] hover:text-brand-700" aria-label={t.closeLabel} onClick={onClose}>×</button>
          <div className="mx-auto mb-5 flex h-[62px] w-[62px] items-center justify-center rounded-full bg-brand-100 text-3xl text-brand-600" aria-hidden="true">✓</div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-brand-400">{t.registrationReceived}</p>
          <h2 id="auth-title" className="mt-1.5 font-display text-2xl font-semibold text-brand-900">{t.registeredAs.replace('{role}', selectedRole.title)}</h2>
          <p className="mt-2 text-sm text-[var(--text-muted)]">{t.accountSubmittedText}</p>
          <button className="mt-6 w-full rounded-lg bg-brand-600 px-4 py-3.5 text-sm font-semibold text-white hover:bg-brand-700" onClick={() => onClose()}>{t.doneButton}</button>
        </section>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 grid items-start justify-items-center overflow-y-auto bg-brand-900/45 px-4 py-8" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className={panelShell} role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <button className="absolute right-5 top-5 flex h-8 w-8 items-center justify-center rounded-full bg-brand-50 text-xl text-[var(--text-muted)] hover:text-brand-700" aria-label={t.closeLabel} onClick={onClose}>×</button>
        <LanguageSwitcher language={language} setLanguage={setLanguage} className="mb-3.5 mr-11 inline-flex" />
        <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-brand-400">F2C</p>
        {isRegister && <button className="mb-4 -mt-1 block text-xs font-bold text-brand-800 hover:text-brand-600" onClick={() => setRole(null)}>{t.changeRole}</button>}
        <h2 id="auth-title" className="font-display text-[28px] font-semibold text-brand-900">
          {isRegister ? t.createAccount.replace('{role}', selectedRole.title) : `${t.welcomeBack} · ${roles[loginRole].title}`}
        </h2>
        <p className="mb-6 mt-1.5 text-sm text-[var(--text-muted)]">{isRegister ? selectedRole.description : t.logInToContinue}</p>

        {!isRegister && (
          <div className="mb-4">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-brand-400">{t.loginAsLabel}</p>
            <SlidingToggle
              ariaLabel={t.loginAsLabel}
              value={loginRole}
              onChange={setLoginRole}
              options={Object.entries(roles).map(([key, item]) => ({ key, label: t.loginRoleShortLabels[key] || item.title, icon: item.icon }))}
            />
          </div>
        )}

        {!isRegister && (
          <div className="mb-5">
            <SlidingToggle
              ariaLabel={t.loginMethodLabel}
              value={loginMode}
              onChange={setLoginMode}
              options={[
                { key: 'password', label: t.loginWithPassword },
                { key: 'otp', label: t.loginWithEmailCode },
              ]}
            />
          </div>
        )}

        {!isRegister && loginMode === 'otp' ? (
          <EmailOtpLogin t={t} onClose={onClose} />
        ) : (
          <form onSubmit={handleSubmit} className="grid gap-4">
            {isRegister && (
              <label className={labelClass}>{t.name}
                <input className={inputClass} name="name" type="text" placeholder={t.namePlaceholder} onInput={(event) => { event.target.value = event.target.value.toUpperCase() }} pattern={NAME_PATTERN.source} title={t.validationNameInvalid} required />
              </label>
            )}
            <label className={labelClass}>{t.phone}
              <input className={inputClass} name="phone" type="tel" inputMode="numeric" maxLength={10} pattern={PHONE_PATTERN.source} placeholder={t.phonePlaceholder} title={t.validationPhoneInvalid} required />
            </label>
            {isRegister && (
              <label className={labelClass}>{t.pincode}
                <input className={inputClass} name="pincode" type="text" inputMode="numeric" maxLength={6} pattern={PINCODE_PATTERN.source} placeholder={t.pincodePlaceholder} title={t.validationPincodeInvalid} value={pincodeValue} onChange={(e) => setPincodeValue(e.target.value.replace(/\D/g, ''))} required />
                <PincodeHint pincode={pincodeValue} t={t} />
              </label>
            )}
            <label className={labelClass}>{t.password}
              <input className={inputClass} name="password" type="password" placeholder={t.passwordPlaceholder} minLength={8} required />
              {isRegister && <small className="text-[11px] font-normal text-[var(--text-muted)]">{t.passwordHint}</small>}
            </label>
            {isRegister && (
              <label className={labelClass}>{t.confirmPassword}
                <input className={inputClass} name="confirmPassword" type="password" placeholder={t.confirmPasswordPlaceholder} minLength={8} required />
              </label>
            )}
            {errorMessage && <p className="rounded-lg border-l-4 border-[var(--color-error)] bg-[var(--color-error-bg)] px-3 py-2.5 text-xs text-[var(--color-error-ink)]" role="alert">{errorMessage}</p>}
            <button className="mt-1 inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-wait disabled:opacity-70" type="submit" disabled={isSubmitting}>
              {isSubmitting ? t.pleaseWait : isRegister ? t.createAccount.replace('{role}', selectedRole.title) : t.login} <span>→</span>
            </button>
          </form>
        )}
        <p className="mt-5 text-center text-xs text-[var(--text-muted)]">{isRegister ? t.alreadyHaveAccount : t.newToF2C} <button className="font-bold text-brand-600" onClick={onSwitch}>{isRegister ? t.login : t.register}</button></p>
      </section>
    </div>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
)

import { StrictMode, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import { isSupabaseConfigured, supabase } from './supabase'
import Dashboard from './Dashboard'
import BulkBuyerDashboard from './BulkBuyerDashboard'
import CompleteProfileFarmer from './CompleteProfileFarmer'
import LogisticsDashboard from './LogisticsDashboard'
import TransportationDashboard from './TransportationDashboard'
import InventoryDashboard from './InventoryDashboard'
import LanguageSwitcher from './LanguageSwitcher'
import LanguageSelection from './LanguageSelection'
import { getStoredLanguage, storeLanguage, useTranslation } from './i18n'
import { loadFarmerData } from './api/farmer'
import { loadLogisticsData } from './api/logistics'
import { loadBuyerData } from './api/buyer'
import { loadUserRole } from './api/profile'

const stats = [
  { value: '0%', label: 'Unnecessary middlemen', icon: '↘' },
  { value: '1:1', label: 'Farmer to buyer connection', icon: '↔' },
  { value: '100%', label: 'Price transparency', icon: '₹' },
]

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
  const [language, setLanguage] = useState(() => getStoredLanguage() || 'en')
  const [showLanguageSelection, setShowLanguageSelection] = useState(() => !getStoredLanguage())
  const t = useTranslation(language)
  const [showAccessibilityMenu, setShowAccessibilityMenu] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [activeNav, setActiveNav] = useState('home')
  const [accessibility, setAccessibility] = useState({ largeText: false, highContrast: false, reducedMotion: false })
  const [currentUser, setCurrentUser] = useState(null)
  const [authStatus, setAuthStatus] = useState(supabase ? 'loading' : 'unauthenticated')
  const [completingProfile, setCompletingProfile] = useState(false)
  const [quickAddCrop, setQuickAddCrop] = useState(false)
  const [logisticsPage, setLogisticsPage] = useState(null)
  const [chosenSection, setChosenSection] = useState(null)
  const [farmerProfile, setFarmerProfile] = useState(null)
  const [logisticsProfile, setLogisticsProfile] = useState(null)
const authRequestRef = useRef(0)
  const lastSessionUserRef = useRef(null)
  const [buyerProfile, setBuyerProfile] = useState(null)

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
    setLogisticsPage(null)
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
    }

    setAuthStatus('loading')
    setFarmerProfile(null)
    setLogisticsProfile(null)
    setLogisticsPage(null)
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

  function handleChooseSection(section) {
    rememberLogisticsChoice(currentUser?.id, section)
    setChosenSection(section)
    setLogisticsPage(section)
  }

  function handleLogisticsSave(data) {
    setLogisticsProfile(data)
    const profileComplete = chosenSection ? logisticsSectionDone(data, chosenSection) : false
    setCurrentUser((user) => user ? { ...user, name: data.name || user.name, profileComplete } : user)
  }

  function logisticsFirstIncomplete(logisticsProfile) {
    if (!chosenSection) return null
    return logisticsSectionDone(logisticsProfile, chosenSection) ? null : chosenSection
  }

  const copy = language === 'hi' ? {
    about: 'परियोजना के बारे में', how: 'यह कैसे काम करता है', login: 'लॉग इन', register: 'रजिस्टर',
    navFarmers: 'हमारे किसान', navServices: 'हमारी सेवाएं', navHow: 'यह कैसे काम करता है', navAbout: 'परियोजना के बारे में',
    title: 'हमारा भोजन उगाने वालों के लिए बेहतर कीमतें।',
    hero: 'किसानों और उपभोक्ताओं के बीच सीधा संपर्क, जिससे किसानों को अधिक कमाई और परिवारों को उचित मूल्य पर ताज़ी उपज मिल सके।',
    join: 'प्लेटफ़ॉर्म से जुड़ें', middlemen: 'अनावश्यक बिचौलिए', connection: 'किसान से खरीदार का सीधा संपर्क', transparency: '100% मूल्य पारदर्शिता',
    challenge: 'चुनौती', mission: 'एक सरल लक्ष्य: भोजन की यात्रा को अधिक निष्पक्ष बनाना।',
    missionText: 'कई बिचौलिए किसानों की कमाई घटाते हैं और उपभोक्ताओं की कीमतें बढ़ाते हैं। FarmDirect एक पारदर्शी प्लेटफ़ॉर्म के ज़रिए दोनों पक्षों को करीब लाता है।',
    accessibility: 'सुलभता', language: 'भाषा', largeText: 'बड़ा टेक्स्ट', contrast: 'अधिक कंट्रास्ट', motion: 'कम गति'
  } : language === 'te' ? {
    about: 'ప్రాజెక్ట్ గురించి', how: 'ఇది ఎలా పనిచేస్తుంది', login: 'లాగిన్', register: 'నమోదు',
    navFarmers: 'మా రైతులు', navServices: 'మా సేవలు', navHow: 'ఇది ఎలా పనిచేస్తుంది', navAbout: 'ప్రాజెక్ట్ గురించి',
    title: 'మన ఆహారాన్ని పండించే వారికి మెరుగైన ధరలు.',
    hero: 'రైతులు మరియు వినియోగదారుల మధ్య ప్రత్యక్ష అనుసంధానం. రైతులకు ఎక్కువ ఆదాయం, కుటుంబాలకు సరసమైన ధరకు తాజా ఉత్పత్తులు.',
    join: 'ప్లాట్‌ఫారమ్‌లో చేరండి', middlemen: 'అనవసర మధ్యవర్తులు', connection: 'రైతు నుండి కొనుగోలుదారుకు ప్రత్యక్ష అనుసంధానం', transparency: 'ధరలో పూర్తి పారదర్శకత',
    challenge: 'సవాలు', mission: 'ఒకే లక్ష్యం: ఆహార ప్రయాణాన్ని మరింత న్యాయంగా చేయడం.',
    missionText: 'అనేక మధ్యవర్తులు రైతుల ఆదాయాన్ని తగ్గించి వినియోగదారుల ధరలను పెంచుతారు. FarmDirect పారదర్శక వేదిక ద్వారా ఇరుపక్షాలను దగ్గర చేస్తుంది.',
    accessibility: 'అందుబాటు', language: 'భాష', largeText: 'పెద్ద అక్షరాలు', contrast: 'అధిక కాంట్రాస్ట్', motion: 'తక్కువ కదలిక'
  } : language === 'ta' ? {
    about: 'திட்டத்தைப் பற்றி', how: 'இது எப்படி செயல்படுகிறது', login: 'உள்நுழைவு', register: 'பதிவு',
    navFarmers: 'எங்கள் விவசாயிகள்', navServices: 'எங்கள் சேவைகள்', navHow: 'இது எப்படி செயல்படுகிறது', navAbout: 'திட்டத்தைப் பற்றி',
    title: 'நமது உணவை விளைவிப்பவர்களுக்கு சிறந்த விலைகள்.',
    hero: 'விவசாயிகளுக்கும் நுகர்வோருக்கும் நேரடி இணைப்பு. விவசாயிகள் அதிகம் சம்பாதிக்கவும், குடும்பங்கள் நியாயமான விலையில் புதிய விளைபொருட்களை வாங்கவும் உதவுகிறது.',
    join: 'தளத்தில் இணையுங்கள்', middlemen: 'தேவையற்ற இடைத்தரகர்கள்', connection: 'விவசாயி முதல் வாங்குபவர் வரை நேரடி இணைப்பு', transparency: 'முழு விலை வெளிப்படைத்தன்மை',
    challenge: 'சவால்', mission: 'ஒரே குறிக்கோள்: உணவுப் பயணத்தை நியாயமானதாக மாற்றுவது.',
    missionText: 'பல இடைத்தரகர்கள் விவசாயிகளின் வருமானத்தைக் குறைத்து நுகர்வோர் விலைகளை அதிகரிக்கின்றனர். FarmDirect வெளிப்படையான தளத்தின் மூலம் இரு தரப்பினரையும் இணைக்கிறது.',
    accessibility: 'அணுகல்தன்மை', language: 'மொழி', largeText: 'பெரிய உரை', contrast: 'அதிக மாறுபாடு', motion: 'குறைந்த இயக்கம்'
  } : language === 'ml' ? {
    about: 'പ്രോജക്റ്റിനെക്കുറിച്ച്', how: 'ഇത് എങ്ങനെ പ്രവർത്തിക്കുന്നു', login: 'ലോഗിൻ', register: 'രജിസ്റ്റർ',
    navFarmers: 'ഞങ്ങളുടെ കർഷകർ', navServices: 'ഞങ്ങളുടെ സേവനങ്ങൾ', navHow: 'ഇത് എങ്ങനെ പ്രവർത്തിക്കുന്നു', navAbout: 'പ്രോജക്റ്റിനെക്കുറിച്ച്',
    title: 'നമ്മുടെ ഭക്ഷണം കൃഷി ചെയ്യുന്നവർക്ക് മികച്ച വിലകൾ.',
    hero: 'കർഷകരെയും ഉപഭോക്താക്കളെയും നേരിട്ട് ബന്ധിപ്പിക്കുന്നു. കർഷകർക്ക് കൂടുതൽ വരുമാനവും കുടുംബങ്ങൾക്ക് ന്യായമായ വിലയിൽ പുതിയ ഉൽപ്പന്നങ്ങളും ലഭിക്കുന്നു.',
    join: 'പ്ലാറ്റ്‌ഫോമിൽ ചേരുക', middlemen: 'അനാവശ്യ ഇടനിലക്കാർ', connection: 'കർഷകനിൽ നിന്ന് വാങ്ങുന്നയാളിലേക്ക് നേരിട്ടുള്ള ബന്ധം', transparency: 'പൂർണ്ണ വില സുതാര്യത',
    challenge: 'വെല്ലുവിളി', mission: 'ഒരേയൊരു ലക്ഷ്യം: ഭക്ഷണ യാത്ര കൂടുതൽ നീതിയുക്തമാക്കുക.',
    missionText: 'നിരവധി ഇടനിലക്കാർ കർഷകരുടെ വരുമാനം കുറയ്ക്കുകയും ഉപഭോക്തൃ വില വർധിപ്പിക്കുകയും ചെയ്യുന്നു. FarmDirect സുതാര്യമായ ഒരു പ്ലാറ്റ്‌ഫോമിലൂടെ ഇരുപക്ഷത്തെയും അടുപ്പിക്കുന്നു.',
    accessibility: 'പ്രവേശനക്ഷമത', language: 'ഭാഷ', largeText: 'വലിയ അക്ഷരങ്ങൾ', contrast: 'ഉയർന്ന കോൺട്രാസ്റ്റ്', motion: 'കുറഞ്ഞ ചലനം'
  } : language === 'kn' ? {
    about: 'ಯೋಜನೆಯ ಬಗ್ಗೆ', how: 'ಇದು ಹೇಗೆ ಕೆಲಸ ಮಾಡುತ್ತದೆ', login: 'ಲಾಗಿನ್', register: 'ನೋಂದಣಿ',
    navFarmers: 'ನಮ್ಮ ರೈತರು', navServices: 'ನಮ್ಮ ಸೇವೆಗಳು', navHow: 'ಇದು ಹೇಗೆ ಕೆಲಸ ಮಾಡುತ್ತದೆ', navAbout: 'ಯೋಜನೆಯ ಬಗ್ಗೆ',
    title: 'ನಮ್ಮ ಆಹಾರವನ್ನು ಬೆಳೆಸುವವರಿಗೆ ಉತ್ತಮ ಬೆಲೆಗಳು.',
    hero: 'ರೈತರು ಮತ್ತು ಗ್ರಾಹಕರ ನಡುವೆ ನೇರ ಸಂಪರ್ಕ. ರೈತರಿಗೆ ಹೆಚ್ಚು ಆದಾಯ ಮತ್ತು ಕುಟುಂಬಗಳಿಗೆ ನ್ಯಾಯಯುತ ಬೆಲೆಯಲ್ಲಿ ತಾಜಾ ಉತ್ಪನ್ನಗಳನ್ನು ಒದಗಿಸುತ್ತದೆ.',
    join: 'ವೇದಿಕೆಗೆ ಸೇರಿ', middlemen: 'ಅನಗತ್ಯ ಮಧ್ಯವರ್ತಿಗಳು', connection: 'ರೈತರಿಂದ ಖರೀದಿದಾರರಿಗೆ ನೇರ ಸಂಪರ್ಕ', transparency: '100% ಬೆಲೆ ಪಾರದರ್ಶಕತೆ',
    challenge: 'ಸವಾಲು', mission: 'ಒಂದು ಸರಳ ಗುರಿ: ಆಹಾರದ ಪ್ರಯಾಣವನ್ನು ಹೆಚ್ಚು ನ್ಯಾಯಯುತಗೊಳಿಸುವುದು.',
    missionText: 'ಹಲವು ಮಧ್ಯವರ್ತಿಗಳು ರೈತರ ಆದಾಯವನ್ನು ಕಡಿಮೆ ಮಾಡಿ ಗ್ರಾಹಕರ ಬೆಲೆಗಳನ್ನು ಹೆಚ್ಚಿಸುತ್ತಾರೆ. FarmDirect ಪಾರದರ್ಶಕ ವೇದಿಕೆಯ ಮೂಲಕ ಎರಡೂ ಬದಿಗಳನ್ನು ಹತ್ತಿರ ತರುತ್ತದೆ.',
    accessibility: 'ಪ್ರವೇಶಿಸುವಿಕೆ', language: 'ಭಾಷೆ', largeText: 'ದೊಡ್ಡ ಪಠ್ಯ', contrast: 'ಹೆಚ್ಚಿನ ಕಾಂಟ್ರಾಸ್ಟ್', motion: 'ಕಡಿಮೆ ಚಲನೆ'
  } : {
    about: 'About the project', how: 'How it works', login: 'Login', register: 'Register',
    navFarmers: 'Our Farmers', navServices: 'Our Services', navHow: 'How it works', navAbout: 'About',
    title: 'Better prices for the people who grow our food.',
    hero: 'A direct connection between farmers and consumers, helping farmers earn more and families buy fresh produce at a fair price.',
    join: 'Join the platform', middlemen: 'Unnecessary middlemen', connection: 'Farmer to buyer connection', transparency: 'Price transparency',
    challenge: 'THE CHALLENGE', mission: 'One simple goal: make the food journey fairer.',
    missionText: 'Multiple intermediaries reduce farmers’ earnings and increase consumer prices. FarmDirect brings both sides closer together through one transparent platform.',
    accessibility: 'Accessibility', language: 'Language', largeText: 'Larger text', contrast: 'High contrast', motion: 'Reduce motion'
  }

  const navItems = [
    { key: 'farmers', label: copy.navFarmers, href: '#about' },
    { key: 'services', label: copy.navServices, href: '#how-it-works' },
    { key: 'how', label: copy.navHow, href: '#how-it-works' },
    { key: 'about', label: copy.navAbout, href: '#about' },
  ]

  useEffect(() => {
    let offsetAbout = 0
    let offsetHow = 0
    const measure = () => {
      offsetAbout = document.getElementById('about')?.offsetTop || 0
      offsetHow = document.getElementById('how-it-works')?.offsetTop || 0
    }
    const updateActive = () => {
      const probe = window.scrollY + 150
      if (probe < offsetAbout) setActiveNav('home')
      else if (probe < offsetHow) setActiveNav('about')
      else setActiveNav('how-it-works')
    }
    const onResize = () => { measure(); updateActive() }
    measure()
    updateActive()
    window.addEventListener('scroll', updateActive, { passive: true })
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('scroll', updateActive)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  useEffect(() => {
    if (!menuOpen) return
    const onKey = (event) => { if (event.key === 'Escape') setMenuOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen])

  const toggleAccessibility = (key) => setAccessibility((current) => ({ ...current, [key]: !current[key] }))
  const accessibilityClass = [accessibility.largeText && 'large-text', accessibility.highContrast && 'high-contrast', accessibility.reducedMotion && 'reduced-motion'].filter(Boolean).join(' ')

  if (authStatus === 'loading') return <AuthLoadingScreen />

  if (showLanguageSelection) {
    return <LanguageSelection onSelect={handleSelectLanguage} />
  }

  if (currentUser && completingProfile) {
    return (
      <CompleteProfileFarmer
        userId={currentUser.id}
        language={language}
        setLanguage={handleSetLanguage}
        initialData={farmerProfile}
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
      if (logisticsPage === 'transport') {
        return (
          <TransportationDashboard
            userId={currentUser.id}
            initialData={logisticsProfile}
            language={language}
            setLanguage={handleSetLanguage}
            onBack={() => setLogisticsPage(null)}
            onComplete={handleLogisticsSave}
          />
        )
      }
      if (logisticsPage === 'inventory') {
        return (
          <InventoryDashboard
            userId={currentUser.id}
            initialData={logisticsProfile}
            language={language}
            setLanguage={handleSetLanguage}
            onBack={() => setLogisticsPage(null)}
            onComplete={handleLogisticsSave}
          />
        )
      }
      return (
        <LogisticsDashboard
          user={currentUser}
          logisticsProfile={logisticsProfile}
          language={language}
          setLanguage={handleSetLanguage}
          chosenSection={chosenSection}
          onChooseSection={handleChooseSection}
          onSelectSection={setLogisticsPage}
          onOpenCompleteProfile={() => chosenSection && setLogisticsPage(logisticsFirstIncomplete(logisticsProfile) || chosenSection)}
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
          onMarkCropHarvested={(cropId) => setFarmerProfile((profile) => (profile
            ? { ...profile, crops: profile.crops.map((crop) => (crop.id === cropId ? { ...crop, harvested: true } : crop)) }
            : profile))}
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
    <div className={`app-shell ${accessibilityClass}`}>
      <header className="topbar">
        <a className="brand" href="#home" aria-label={t.homeLabel}>
          <span className="brand-mark">✦</span>
          <span>Farm<span>Direct</span></span>
        </a>
        <nav className="nav-links" aria-label={t.mainNavLabel}>
          <ul>
            {navItems.map((item) => (
              <li key={item.key}>
                <a
                  href={item.href}
                  className={activeNav === item.key ? 'active' : ''}
                  aria-current={activeNav === item.key ? 'page' : undefined}
                  onClick={() => setActiveNav(item.key)}
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="utility-actions">
          <div className="utility-menu">
            <button className="utility-button" aria-expanded={showAccessibilityMenu} aria-controls="accessibility-menu" onClick={() => setShowAccessibilityMenu(!showAccessibilityMenu)}>
              <span aria-hidden="true">◐</span> {copy.accessibility}
            </button>
            {showAccessibilityMenu && <div className="utility-popover accessibility-popover" id="accessibility-menu">
              <p className="popover-title">{copy.accessibility}</p>
              {['largeText', 'contrast', 'motion'].map((key) => {
                const label = key === 'largeText' ? copy.largeText : key === 'contrast' ? copy.contrast : copy.motion
                return <label className="toggle-row" key={key}><span>{label}</span><input type="checkbox" checked={accessibility[key]} onChange={() => toggleAccessibility(key)} /><i /></label>
              })}
            </div>}
          </div>
          <LanguageSwitcher language={language} setLanguage={handleSetLanguage} />
        </div>
        <div className="auth-actions">
          <button className="button button-quiet" onClick={() => setPanel('login')}>{copy.login}</button>
          <button className="button button-primary" onClick={() => setPanel('register')}>{copy.register}</button>
        </div>
        <button className="menu-toggle" type="button" aria-label={t.menuToggleLabel} aria-expanded={menuOpen} aria-controls="site-nav-menu" onClick={() => setMenuOpen((open) => !open)}>
          <span /><span /><span />
        </button>
      </header>

      {menuOpen && (
        <nav className="mobile-nav" id="site-nav-menu" aria-label={t.mainNavLabel}>
          <ul>
            {navItems.map((item) => (
              <li key={item.key}>
                <a
                  href={item.href}
                  className={activeNav === item.key ? 'active' : ''}
                  aria-current={activeNav === item.key ? 'page' : undefined}
                  onClick={() => { setActiveNav(item.key); setMenuOpen(false) }}
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}

      <main id="home">
        <section className="hero" id="about">
          <div className="hero-copy">
            <h1>{copy.title}</h1>
            <p className="hero-text">{copy.hero}</p>
            <div className="hero-actions">
              <button className="button button-primary button-large button-pill" onClick={() => setPanel('register')}>{copy.join} <span>→</span></button>
            </div>
          </div>
          <div className="hero-art" aria-label={t.heroIllustrationLabel}>
            <div className="sun" />
            <div className="mountains" />
            <div className="field field-back" />
            <div className="field field-front" />
            <div className="plant plant-one"><i /><i /><i /></div>
            <div className="plant plant-two"><i /><i /><i /></div>
            <div className="plant plant-three"><i /><i /><i /></div>
          </div>
        </section>

        <section className="stats-row" id="how-it-works">
          {stats.map((stat, index) => (
            <article className="stat-card" key={stat.label}>
              <div className="stat-icon">{stat.icon}</div>
              <div><strong>{stat.value}</strong><span>{[copy.middlemen, copy.connection, copy.transparency][index]}</span></div>
            </article>
          ))}
        </section>

        <section className="mission-card">
          <div>
            <p className="eyebrow">{copy.challenge}</p>
            <h2>{copy.mission}</h2>
          </div>
          <p>{copy.missionText}</p>
        </section>
      </main>

      {panel && (
        <AuthPanel
          key={panel}
          type={panel}
          language={language}
          setLanguage={handleSetLanguage}
          onClose={() => setPanel(null)}
          onSwitch={() => setPanel(panel === 'login' ? 'register' : 'login')}
        />
      )}
    </div>
  )
}

function RolePlaceholder({ user, language, setLanguage, onLogout }) {
  const t = useTranslation(language)
  const initials = (user.name || 'U').trim().split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase() || 'U'
  return (
    <div className="dashboard-shell">
      <aside className="dash-sidebar">
        <div className="dash-brand"><span className="brand-mark">✦</span>Farm<span>Direct</span></div>
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

function AuthLoadingScreen() {
  return (
    <main className="auth-loading" aria-live="polite" aria-busy="true">
      <div className="auth-loading-mark" aria-hidden="true">✦</div>
      <strong>Farm<span>Direct</span></strong>
      <p>Restoring your session…</p>
    </main>
  )
}

function AuthPanel({ type, onClose, onSwitch, language, setLanguage }) {
  const t = useTranslation(language)
  const isRegister = type === 'register'
  const [role, setRole] = useState(null)
  const [submitted, setSubmitted] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [registeredName, setRegisteredName] = useState('')
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
    const email = formData.get('email')
    const password = formData.get('password')
    setIsSubmitting(true)

    try {
      if (isRegister) {
        if (password !== formData.get('confirmPassword')) throw new Error(t.passwordsDontMatch)
        const name = formData.get('name')
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: {
              first_name: name,
              last_name: '',
              phone: formData.get('phone'),
              role,
              registration_details: {
                pincode: formData.get('pincode'),
                [selectedRole.requiredKey]: name,
              },
            },
          },
        })
        if (error) throw error
        setRegisteredName(name)
        if (data.session) {
          onClose()
        } else {
          setSubmitted(true)
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) {
          error.message = error.code === 'email_not_confirmed'
            ? t.emailNotConfirmed
            : error.message
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

  if (isRegister && !role) {
    return (
      <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
        <section className="auth-panel register-panel role-panel" role="dialog" aria-modal="true" aria-labelledby="auth-title">
          <button className="close-button" aria-label={t.closeLabel} onClick={onClose}>×</button>
          <LanguageSwitcher language={language} setLanguage={setLanguage} className="auth-language-switcher" />
          <p className="eyebrow">FARMDIRECT</p>
          <h2 id="auth-title">{t.howRegister}</h2>
          <p className="panel-subtitle">{t.chooseAccount}</p>
          <div className="role-grid">
            {Object.entries(roles).map(([key, item]) => <button className="role-card" key={key} onClick={() => setRole(key)}>
              <span className="role-icon" aria-hidden="true">{item.icon}</span><strong>{item.title}</strong><small>{item.description}</small><span className="role-arrow">→</span>
            </button>)}
          </div>
          <p className="switch-auth">{t.alreadyHaveAccount} <button onClick={onSwitch}>{t.login}</button></p>
        </section>
      </div>
    )
  }

  if (submitted) {
    return (
      <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
        <section className="auth-panel success-panel" role="dialog" aria-modal="true" aria-labelledby="auth-title">
          <button className="close-button" aria-label={t.closeLabel} onClick={onClose}>×</button>
          <div className="success-icon" aria-hidden="true">✓</div>
          <p className="eyebrow">{t.registrationReceived}</p>
          <h2 id="auth-title">{t.registeredAs.replace('{role}', selectedRole.title)}</h2>
          <p className="panel-subtitle">{t.accountSubmittedText}</p>
          <button
            className="button button-primary submit-button"
            onClick={() => {
              onClose()
            }}
          >
            {t.doneButton}
          </button>
        </section>
      </div>
    )
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className={`auth-panel ${isRegister ? 'register-panel' : ''}`} role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <button className="close-button" aria-label={t.closeLabel} onClick={onClose}>×</button>
        <LanguageSwitcher language={language} setLanguage={setLanguage} className="auth-language-switcher" />
        <p className="eyebrow">FARMDIRECT</p>
        {isRegister && <button className="back-button" onClick={() => setRole(null)}>{t.changeRole}</button>}
        <h2 id="auth-title">{isRegister ? t.createAccount.replace('{role}', selectedRole.title) : t.welcomeBack}</h2>
        <p className="panel-subtitle">{isRegister ? selectedRole.description : t.logInToContinue}</p>
        <form onSubmit={handleSubmit}>
          {isRegister && <label>{t.name}<input name="name" type="text" placeholder={t.namePlaceholder} onInput={(event) => { event.target.value = event.target.value.toUpperCase() }} required /></label>}
          <label>{t.email}<input name="email" type="email" placeholder={t.emailPlaceholder} required /></label>
          {isRegister && <label>{t.phone}<input name="phone" type="tel" placeholder={t.phonePlaceholder} required /></label>}
          {isRegister && <label>{t.pincode}<input name="pincode" type="text" inputMode="numeric" pattern="[0-9]{6}" placeholder={t.pincodePlaceholder} required /></label>}
          <label>{t.password}<input name="password" type="password" placeholder={t.passwordPlaceholder} minLength="6" required /></label>
          {isRegister && <label>{t.confirmPassword}<input name="confirmPassword" type="password" placeholder={t.confirmPasswordPlaceholder} minLength="6" required /></label>}
          {errorMessage && <p className="form-error" role="alert">{errorMessage}</p>}
          <button className="button button-primary submit-button" type="submit" disabled={isSubmitting}>{isSubmitting ? t.pleaseWait : isRegister ? t.createAccount.replace('{role}', selectedRole.title) : t.login} <span>→</span></button>
        </form>
        <p className="switch-auth">{isRegister ? t.alreadyHaveAccount : t.newToFarmDirect} <button onClick={onSwitch}>{isRegister ? t.login : t.register}</button></p>
      </section>
    </div>
  )
}

createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>)

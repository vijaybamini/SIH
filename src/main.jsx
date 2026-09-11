import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import { isSupabaseConfigured, supabase } from './supabase'

const stats = [
  { value: '0%', label: 'Unnecessary middlemen', icon: '↘' },
  { value: '1:1', label: 'Farmer to buyer connection', icon: '↔' },
  { value: '100%', label: 'Price transparency', icon: '₹' },
]

function App() {
  const [panel, setPanel] = useState(null)
  const [language, setLanguage] = useState('en')
  const [showLanguageMenu, setShowLanguageMenu] = useState(false)
  const [showAccessibilityMenu, setShowAccessibilityMenu] = useState(false)
  const [accessibility, setAccessibility] = useState({ largeText: false, highContrast: false, reducedMotion: false })

  const copy = language === 'hi' ? {
    about: 'परियोजना के बारे में', how: 'यह कैसे काम करता है', login: 'लॉग इन', register: 'रजिस्टर',
    eyebrow: 'SIH परियोजना · समस्या विवरण 26033', title: 'हमारा भोजन उगाने वालों के लिए बेहतर कीमतें।',
    hero: 'किसानों और उपभोक्ताओं के बीच सीधा संपर्क, जिससे किसानों को अधिक कमाई और परिवारों को उचित मूल्य पर ताज़ी उपज मिल सके।',
    join: 'प्लेटफ़ॉर्म से जुड़ें', learn: 'जानें यह कैसे काम करता है', middlemen: 'अनावश्यक बिचौलिए', connection: 'किसान से खरीदार का सीधा संपर्क', transparency: '100% मूल्य पारदर्शिता',
    challenge: 'चुनौती', mission: 'एक सरल लक्ष्य: भोजन की यात्रा को अधिक निष्पक्ष बनाना।',
    missionText: 'कई बिचौलिए किसानों की कमाई घटाते हैं और उपभोक्ताओं की कीमतें बढ़ाते हैं। FarmDirect एक पारदर्शी प्लेटफ़ॉर्म के ज़रिए दोनों पक्षों को करीब लाता है।',
    accessibility: 'सुलभता', language: 'भाषा', largeText: 'बड़ा टेक्स्ट', contrast: 'अधिक कंट्रास्ट', motion: 'कम गति'
  } : language === 'te' ? {
    about: 'ప్రాజెక్ట్ గురించి', how: 'ఇది ఎలా పనిచేస్తుంది', login: 'లాగిన్', register: 'నమోదు',
    eyebrow: 'SIH ప్రాజెక్ట్ · సమస్య ప్రకటన 26033', title: 'మన ఆహారాన్ని పండించే వారికి మెరుగైన ధరలు.',
    hero: 'రైతులు మరియు వినియోగదారుల మధ్య ప్రత్యక్ష అనుసంధానం. రైతులకు ఎక్కువ ఆదాయం, కుటుంబాలకు సరసమైన ధరకు తాజా ఉత్పత్తులు.',
    join: 'ప్లాట్‌ఫారమ్‌లో చేరండి', learn: 'ఇది ఎలా పనిచేస్తుందో తెలుసుకోండి', middlemen: 'అనవసర మధ్యవర్తులు', connection: 'రైతు నుండి కొనుగోలుదారుకు ప్రత్యక్ష అనుసంధానం', transparency: 'ధరలో పూర్తి పారదర్శకత',
    challenge: 'సవాలు', mission: 'ఒకే లక్ష్యం: ఆహార ప్రయాణాన్ని మరింత న్యాయంగా చేయడం.',
    missionText: 'అనేక మధ్యవర్తులు రైతుల ఆదాయాన్ని తగ్గించి వినియోగదారుల ధరలను పెంచుతారు. FarmDirect పారదర్శక వేదిక ద్వారా ఇరుపక్షాలను దగ్గర చేస్తుంది.',
    accessibility: 'అందుబాటు', language: 'భాష', largeText: 'పెద్ద అక్షరాలు', contrast: 'అధిక కాంట్రాస్ట్', motion: 'తక్కువ కదలిక'
  } : language === 'ta' ? {
    about: 'திட்டத்தைப் பற்றி', how: 'இது எப்படி செயல்படுகிறது', login: 'உள்நுழைவு', register: 'பதிவு',
    eyebrow: 'SIH திட்டம் · பிரச்சினை அறிக்கை 26033', title: 'நமது உணவை விளைவிப்பவர்களுக்கு சிறந்த விலைகள்.',
    hero: 'விவசாயிகளுக்கும் நுகர்வோருக்கும் நேரடி இணைப்பு. விவசாயிகள் அதிகம் சம்பாதிக்கவும், குடும்பங்கள் நியாயமான விலையில் புதிய விளைபொருட்களை வாங்கவும் உதவுகிறது.',
    join: 'தளத்தில் இணையுங்கள்', learn: 'இது எப்படி செயல்படுகிறது', middlemen: 'தேவையற்ற இடைத்தரகர்கள்', connection: 'விவசாயி முதல் வாங்குபவர் வரை நேரடி இணைப்பு', transparency: 'முழு விலை வெளிப்படைத்தன்மை',
    challenge: 'சவால்', mission: 'ஒரே குறிக்கோள்: உணவுப் பயணத்தை நியாயமானதாக மாற்றுவது.',
    missionText: 'பல இடைத்தரகர்கள் விவசாயிகளின் வருமானத்தைக் குறைத்து நுகர்வோர் விலைகளை அதிகரிக்கின்றனர். FarmDirect வெளிப்படையான தளத்தின் மூலம் இரு தரப்பினரையும் இணைக்கிறது.',
    accessibility: 'அணுகல்தன்மை', language: 'மொழி', largeText: 'பெரிய உரை', contrast: 'அதிக மாறுபாடு', motion: 'குறைந்த இயக்கம்'
  } : language === 'ml' ? {
    about: 'പ്രോജക്റ്റിനെക്കുറിച്ച്', how: 'ഇത് എങ്ങനെ പ്രവർത്തിക്കുന്നു', login: 'ലോഗിൻ', register: 'രജിസ്റ്റർ',
    eyebrow: 'SIH പ്രോജക്റ്റ് · പ്രശ്ന പ്രസ്താവന 26033', title: 'നമ്മുടെ ഭക്ഷണം കൃഷി ചെയ്യുന്നവർക്ക് മികച്ച വിലകൾ.',
    hero: 'കർഷകരെയും ഉപഭോക്താക്കളെയും നേരിട്ട് ബന്ധിപ്പിക്കുന്നു. കർഷകർക്ക് കൂടുതൽ വരുമാനവും കുടുംബങ്ങൾക്ക് ന്യായമായ വിലയിൽ പുതിയ ഉൽപ്പന്നങ്ങളും ലഭിക്കുന്നു.',
    join: 'പ്ലാറ്റ്‌ഫോമിൽ ചേരുക', learn: 'ഇത് എങ്ങനെ പ്രവർത്തിക്കുന്നുവെന്ന് അറിയുക', middlemen: 'അനാവശ്യ ഇടനിലക്കാർ', connection: 'കർഷകനിൽ നിന്ന് വാങ്ങുന്നയാളിലേക്ക് നേരിട്ടുള്ള ബന്ധം', transparency: 'പൂർണ്ണ വില സുതാര്യത',
    challenge: 'വെല്ലുവിളി', mission: 'ഒരേയൊരു ലക്ഷ്യം: ഭക്ഷണ യാത്ര കൂടുതൽ നീതിയുക്തമാക്കുക.',
    missionText: 'നിരവധി ഇടനിലക്കാർ കർഷകരുടെ വരുമാനം കുറയ്ക്കുകയും ഉപഭോക്തൃ വില വർധിപ്പിക്കുകയും ചെയ്യുന്നു. FarmDirect സുതാര്യമായ ഒരു പ്ലാറ്റ്‌ഫോമിലൂടെ ഇരുപക്ഷത്തെയും അടുപ്പിക്കുന്നു.',
    accessibility: 'പ്രവേശനക്ഷമത', language: 'ഭാഷ', largeText: 'വലിയ അക്ഷരങ്ങൾ', contrast: 'ഉയർന്ന കോൺട്രാസ്റ്റ്', motion: 'കുറഞ്ഞ ചലനം'
  } : language === 'kn' ? {
    about: 'ಯೋಜನೆಯ ಬಗ್ಗೆ', how: 'ಇದು ಹೇಗೆ ಕೆಲಸ ಮಾಡುತ್ತದೆ', login: 'ಲಾಗಿನ್', register: 'ನೋಂದಣಿ',
    eyebrow: 'SIH ಯೋಜನೆ · ಸಮಸ್ಯೆ ಹೇಳಿಕೆ 26033', title: 'ನಮ್ಮ ಆಹಾರವನ್ನು ಬೆಳೆಸುವವರಿಗೆ ಉತ್ತಮ ಬೆಲೆಗಳು.',
    hero: 'ರೈತರು ಮತ್ತು ಗ್ರಾಹಕರ ನಡುವೆ ನೇರ ಸಂಪರ್ಕ. ರೈತರಿಗೆ ಹೆಚ್ಚು ಆದಾಯ ಮತ್ತು ಕುಟುಂಬಗಳಿಗೆ ನ್ಯಾಯಯುತ ಬೆಲೆಯಲ್ಲಿ ತಾಜಾ ಉತ್ಪನ್ನಗಳನ್ನು ಒದಗಿಸುತ್ತದೆ.',
    join: 'ವೇದಿಕೆಗೆ ಸೇರಿ', learn: 'ಇದು ಹೇಗೆ ಕೆಲಸ ಮಾಡುತ್ತದೆ ತಿಳಿಯಿರಿ', middlemen: 'ಅನಗತ್ಯ ಮಧ್ಯವರ್ತಿಗಳು', connection: 'ರೈತರಿಂದ ಖರೀದಿದಾರರಿಗೆ ನೇರ ಸಂಪರ್ಕ', transparency: '100% ಬೆಲೆ ಪಾರದರ್ಶಕತೆ',
    challenge: 'ಸವಾಲು', mission: 'ಒಂದು ಸರಳ ಗುರಿ: ಆಹಾರದ ಪ್ರಯಾಣವನ್ನು ಹೆಚ್ಚು ನ್ಯಾಯಯುತಗೊಳಿಸುವುದು.',
    missionText: 'ಹಲವು ಮಧ್ಯವರ್ತಿಗಳು ರೈತರ ಆದಾಯವನ್ನು ಕಡಿಮೆ ಮಾಡಿ ಗ್ರಾಹಕರ ಬೆಲೆಗಳನ್ನು ಹೆಚ್ಚಿಸುತ್ತಾರೆ. FarmDirect ಪಾರದರ್ಶಕ ವೇದಿಕೆಯ ಮೂಲಕ ಎರಡೂ ಬದಿಗಳನ್ನು ಹತ್ತಿರ ತರುತ್ತದೆ.',
    accessibility: 'ಪ್ರವೇಶಿಸುವಿಕೆ', language: 'ಭಾಷೆ', largeText: 'ದೊಡ್ಡ ಪಠ್ಯ', contrast: 'ಹೆಚ್ಚಿನ ಕಾಂಟ್ರಾಸ್ಟ್', motion: 'ಕಡಿಮೆ ಚಲನೆ'
  } : {
    about: 'About the project', how: 'How it works', login: 'Login', register: 'Register',
    eyebrow: 'SIH PROJECT · PROBLEM STATEMENT 26033', title: 'Better prices for the people who grow our food.',
    hero: 'A direct connection between farmers and consumers, helping farmers earn more and families buy fresh produce at a fair price.',
    join: 'Join the platform', learn: 'Learn how it works', middlemen: 'Unnecessary middlemen', connection: 'Farmer to buyer connection', transparency: 'Price transparency',
    challenge: 'THE CHALLENGE', mission: 'One simple goal: make the food journey fairer.',
    missionText: 'Multiple intermediaries reduce farmers’ earnings and increase consumer prices. FarmDirect brings both sides closer together through one transparent platform.',
    accessibility: 'Accessibility', language: 'Language', largeText: 'Larger text', contrast: 'High contrast', motion: 'Reduce motion'
  }

  const languageNames = { en: 'English', hi: 'हिन्दी', te: 'తెలుగు', ta: 'தமிழ்', ml: 'മലയാളം', kn: 'ಕನ್ನಡ' }

  const toggleAccessibility = (key) => setAccessibility((current) => ({ ...current, [key]: !current[key] }))
  const accessibilityClass = [accessibility.largeText && 'large-text', accessibility.highContrast && 'high-contrast', accessibility.reducedMotion && 'reduced-motion'].filter(Boolean).join(' ')

  return (
    <div className={`app-shell ${accessibilityClass}`}>
      <header className="topbar">
        <a className="brand" href="#home" aria-label="FarmDirect home">
          <span className="brand-mark">✦</span>
          <span>Farm<span>Direct</span></span>
        </a>
        <nav className="nav-links" aria-label="Main navigation">
          <a href="#about">{copy.about}</a>
          <a href="#how-it-works">{copy.how}</a>
        </nav>
        <div className="utility-actions">
          <div className="utility-menu">
            <button className="utility-button" aria-expanded={showAccessibilityMenu} aria-controls="accessibility-menu" onClick={() => { setShowAccessibilityMenu(!showAccessibilityMenu); setShowLanguageMenu(false) }}>
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
          <div className="utility-menu">
            <button className="utility-button" aria-expanded={showLanguageMenu} aria-controls="language-menu" onClick={() => { setShowLanguageMenu(!showLanguageMenu); setShowAccessibilityMenu(false) }}>
              <span aria-hidden="true">文</span> {languageNames[language]} <span className="chevron">⌄</span>
            </button>
            {showLanguageMenu && <div className="utility-popover language-popover" id="language-menu">
              {Object.entries(languageNames).map(([code, name]) => <button key={code} className={language === code ? 'selected' : ''} onClick={() => { setLanguage(code); setShowLanguageMenu(false) }}>{name}</button>)}
            </div>}
          </div>
        </div>
        <div className="auth-actions">
          <button className="button button-quiet" onClick={() => setPanel('login')}>{copy.login}</button>
          <button className="button button-primary" onClick={() => setPanel('register')}>{copy.register}</button>
        </div>
      </header>

      <main id="home">
        <section className="hero" id="about">
          <div className="hero-copy">
            <p className="eyebrow">{copy.eyebrow}</p>
            <h1>{copy.title}</h1>
            <p className="hero-text">{copy.hero}</p>
            <div className="hero-actions">
              <button className="button button-primary button-large" onClick={() => setPanel('register')}>{copy.join} <span>→</span></button>
              <a className="text-link" href="#how-it-works">{copy.learn} <span>→</span></a>
            </div>
          </div>
          <div className="hero-art" aria-label="Illustration of a farm field">
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

      <footer>Built for SIH · Statement no. 26033</footer>

      {panel && <AuthPanel key={panel} type={panel} onClose={() => setPanel(null)} onSwitch={() => setPanel(panel === 'login' ? 'register' : 'login')} />}
    </div>
  )
}

function AuthPanel({ type, onClose, onSwitch }) {
  const isRegister = type === 'register'
  const [role, setRole] = useState(null)
  const [submitted, setSubmitted] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const roles = {
    farmer: { title: 'Farmer', description: 'Sell fresh produce directly to buyers.', icon: '🌱', fields: [['Farm or producer name', 'Enter your farm name', 'farm_name'], ['Primary crops', 'e.g. Rice, vegetables, fruits', 'primary_crops'], ['Land details', 'e.g. Owned, leased, irrigated', 'land_details'], ['Crop location', 'Village, district, state', 'crop_location'], ['Area of crop (acres)', 'e.g. 2.5', 'area_of_crop'], ['Survey number', 'Enter the land survey number', 'survey_number']] },
    buyer: { title: 'Bulk Buyer', description: 'Source produce for your business or institution.', icon: '🏪', fields: [['Business name', 'Enter your business name', 'business_name'], ['Business type', 'Retailer, hotel, processor…', 'business_type'], ['GSTIN (optional)', 'Enter GSTIN', 'gstin']] },
    logistics: { title: 'Logistics Provider', description: 'Offer transport and delivery services.', icon: '🚚', fields: [['Company name', 'Enter your company name', 'company_name'], ['Service areas', 'Cities or districts you cover', 'service_areas'], ['Fleet / vehicle details', 'e.g. Refrigerated truck, mini van', 'fleet_details']] },
    service: { title: 'Service Provider', description: 'Provide farm-related services and support.', icon: '🛠', fields: [['Business or service name', 'Enter your business name', 'business_name'], ['Service category', 'e.g. Equipment, advisory, packaging', 'service_category'], ['Service areas', 'Cities or districts you cover', 'service_areas']] },
  }
  const selectedRole = roles[role]

  async function handleSubmit(event) {
    event.preventDefault()
    setErrorMessage('')

    if (!isSupabaseConfigured) {
      setErrorMessage('Supabase is not configured yet. Add your project URL and publishable key to .env.local.')
      return
    }

    const formData = new FormData(event.currentTarget)
    const email = formData.get('email')
    const password = formData.get('password')
    setIsSubmitting(true)

    try {
      if (isRegister) {
        if (password !== formData.get('confirmPassword')) throw new Error('Passwords do not match.')
        const registrationDetails = Object.fromEntries(selectedRole.fields.map(([, , name]) => [name, formData.get(name)]))
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: {
              first_name: formData.get('firstName'),
              last_name: formData.get('lastName'),
              phone: formData.get('phone'),
              role,
              registration_details: registrationDetails,
            },
          },
        })
        if (error) throw error
        setSubmitted(true)
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        onClose()
      }
    } catch (error) {
      setErrorMessage(error.message || 'Something went wrong. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isRegister && !role) {
    return (
      <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
        <section className="auth-panel register-panel role-panel" role="dialog" aria-modal="true" aria-labelledby="auth-title">
          <button className="close-button" aria-label="Close" onClick={onClose}>×</button>
          <p className="eyebrow">FARMDIRECT</p>
          <h2 id="auth-title">How would you like to register?</h2>
          <p className="panel-subtitle">Choose the account that best describes your role on the platform.</p>
          <div className="role-grid">
            {Object.entries(roles).map(([key, item]) => <button className="role-card" key={key} onClick={() => setRole(key)}>
              <span className="role-icon" aria-hidden="true">{item.icon}</span><strong>{item.title}</strong><small>{item.description}</small><span className="role-arrow">→</span>
            </button>)}
          </div>
          <p className="switch-auth">Already have an account? <button onClick={onSwitch}>Login</button></p>
        </section>
      </div>
    )
  }

  if (submitted) {
    return (
      <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
        <section className="auth-panel success-panel" role="dialog" aria-modal="true" aria-labelledby="auth-title">
          <button className="close-button" aria-label="Close" onClick={onClose}>×</button>
          <div className="success-icon" aria-hidden="true">✓</div>
          <p className="eyebrow">REGISTRATION RECEIVED</p>
          <h2 id="auth-title">You’re registered as a {selectedRole.title}.</h2>
          <p className="panel-subtitle">Your account details have been submitted. We’ll guide you through the next steps shortly.</p>
          <button className="button button-primary submit-button" onClick={onClose}>Done</button>
        </section>
      </div>
    )
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className={`auth-panel ${isRegister ? 'register-panel' : ''}`} role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <button className="close-button" aria-label="Close" onClick={onClose}>×</button>
        <p className="eyebrow">FARMDIRECT</p>
        {isRegister && <button className="back-button" onClick={() => setRole(null)}>← Change role</button>}
        <h2 id="auth-title">{isRegister ? `Create your ${selectedRole.title} account` : 'Welcome back'}</h2>
        <p className="panel-subtitle">{isRegister ? selectedRole.description : 'Log in to continue to your dashboard.'}</p>
        <form onSubmit={handleSubmit}>
          {isRegister && <div className="form-grid">
            <label>First name<input name="firstName" type="text" placeholder="Your first name" required /></label>
            <label>Last name<input name="lastName" type="text" placeholder="Your last name" required /></label>
          </div>}
          <label>Email address<input name="email" type="email" placeholder="you@example.com" required /></label>
          {isRegister && <label>Phone number<input name="phone" type="tel" placeholder="+91 00000 00000" required /></label>}
          {isRegister && selectedRole.fields.map(([label, placeholder, name]) => <label key={name}>{label}<input name={name} type={name === 'area_of_crop' ? 'number' : 'text'} step={name === 'area_of_crop' ? '0.01' : undefined} min={name === 'area_of_crop' ? '0' : undefined} placeholder={placeholder} required={name !== 'gstin'} /></label>)}
          <label>Password<input name="password" type="password" placeholder="Enter your password" minLength="6" required /></label>
          {isRegister && <label>Confirm password<input name="confirmPassword" type="password" placeholder="Re-enter your password" minLength="6" required /></label>}
          {errorMessage && <p className="form-error" role="alert">{errorMessage}</p>}
          <button className="button button-primary submit-button" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Please wait…' : isRegister ? `Create ${selectedRole.title} account` : 'Login'} <span>→</span></button>
        </form>
        <p className="switch-auth">{isRegister ? 'Already have an account?' : 'New to FarmDirect?'} <button onClick={onSwitch}>{isRegister ? 'Login' : 'Register'}</button></p>
      </section>
    </div>
  )
}

createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>)

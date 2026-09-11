import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'

const stats = [
  { value: '0%', label: 'Unnecessary middlemen', icon: '↘' },
  { value: '1:1', label: 'Farmer to buyer connection', icon: '↔' },
  { value: '100%', label: 'Price transparency', icon: '₹' },
]

function App() {
  const [panel, setPanel] = useState(null)

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#home" aria-label="FarmDirect home">
          <span className="brand-mark">✦</span>
          <span>Farm<span>Direct</span></span>
        </a>
        <nav className="nav-links" aria-label="Main navigation">
          <a href="#about">About the project</a>
          <a href="#how-it-works">How it works</a>
        </nav>
        <div className="auth-actions">
          <button className="button button-quiet" onClick={() => setPanel('login')}>Login</button>
          <button className="button button-primary" onClick={() => setPanel('register')}>Register</button>
        </div>
      </header>

      <main id="home">
        <section className="hero" id="about">
          <div className="hero-copy">
            <p className="eyebrow">SIH PROJECT · PROBLEM STATEMENT 26033</p>
            <h1>Better prices for the people who grow our food.</h1>
            <p className="hero-text">
              A direct connection between farmers and consumers, helping farmers earn more and families buy fresh produce at a fair price.
            </p>
            <div className="hero-actions">
              <button className="button button-primary button-large" onClick={() => setPanel('register')}>Join the platform <span>→</span></button>
              <a className="text-link" href="#how-it-works">Learn how it works <span>→</span></a>
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
          {stats.map((stat) => (
            <article className="stat-card" key={stat.label}>
              <div className="stat-icon">{stat.icon}</div>
              <div><strong>{stat.value}</strong><span>{stat.label}</span></div>
            </article>
          ))}
        </section>

        <section className="mission-card">
          <div>
            <p className="eyebrow">THE CHALLENGE</p>
            <h2>One simple goal: make the food journey fairer.</h2>
          </div>
          <p>Multiple intermediaries reduce farmers’ earnings and increase consumer prices. FarmDirect brings both sides closer together through one transparent platform.</p>
        </section>
      </main>

      <footer>Built for SIH · Statement no. 26033</footer>

      {panel && <AuthPanel type={panel} onClose={() => setPanel(null)} onSwitch={() => setPanel(panel === 'login' ? 'register' : 'login')} />}
    </div>
  )
}

function AuthPanel({ type, onClose, onSwitch }) {
  const isRegister = type === 'register'
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className={`auth-panel ${isRegister ? 'register-panel' : ''}`} role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <button className="close-button" aria-label="Close" onClick={onClose}>×</button>
        <p className="eyebrow">FARMDIRECT</p>
        <h2 id="auth-title">{isRegister ? 'Create your account' : 'Welcome back'}</h2>
        <p className="panel-subtitle">{isRegister ? 'Join a fairer farm-to-home marketplace.' : 'Log in to continue to your dashboard.'}</p>
        <form onSubmit={(event) => event.preventDefault()}>
          {isRegister && <div className="form-grid">
            <label>First name<input type="text" placeholder="Your first name" /></label>
            <label>Last name<input type="text" placeholder="Your last name" /></label>
          </div>}
          <label>Email address<input type="email" placeholder="you@example.com" /></label>
          {isRegister && <label>Phone number<input type="tel" placeholder="+91 00000 00000" /></label>}
          {isRegister && <label>I am a<select defaultValue=""><option value="" disabled>Select your role</option><option>Farmer</option><option>Consumer</option><option>Buyer / Retailer</option></select></label>}
          <label>Password<input type="password" placeholder="Enter your password" /></label>
          {isRegister && <label>Confirm password<input type="password" placeholder="Re-enter your password" /></label>}
          <button className="button button-primary submit-button" type="submit">{isRegister ? 'Create account' : 'Login'} <span>→</span></button>
        </form>
        <p className="switch-auth">{isRegister ? 'Already have an account?' : 'New to FarmDirect?'} <button onClick={onSwitch}>{isRegister ? 'Login' : 'Register'}</button></p>
      </section>
    </div>
  )
}

createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>)

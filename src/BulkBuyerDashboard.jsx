import { useEffect, useMemo, useState } from 'react'
import LanguageSwitcher from './LanguageSwitcher'
import { useTranslation } from './i18n'
import { fetchBuyerProducts } from './api/buyerProducts'

const CATEGORY_LABELS = {
  rice: 'Rice', wheat: 'Wheat', cereals: 'Cereals', oils: 'Oils', vegetables: 'Vegetables', fruits: 'Fruits',
}

const RANDOM_PICKS_COUNT = 12

function shuffled(list) {
  const copy = [...list]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

function ProductCard({ product, favorited, onToggleFavorite, inCart, onToggleCart }) {
  const [imageFailed, setImageFailed] = useState(false)
  return (
    <article className="buyer-product-card">
      <div className="buyer-product-media">
        {!imageFailed ? (
          <img src={product.image} alt={product.name} loading="lazy" onError={() => setImageFailed(true)} />
        ) : (
          <div className="buyer-product-media-fallback" aria-hidden="true">
            {CATEGORY_LABELS[product.category]?.[0] || '🌿'}
          </div>
        )}
        <button
          type="button"
          className={`buyer-fav-button${favorited ? ' active' : ''}`}
          aria-label={favorited ? 'Remove from favorites' : 'Add to favorites'}
          onClick={() => onToggleFavorite(product.id)}
        >
          {favorited ? '♥' : '♡'}
        </button>
      </div>
      <div className="buyer-product-body">
        <p className="buyer-product-origin">{product.origin}</p>
        <h4 className="buyer-product-name">{product.name}</h4>
        <p className="buyer-product-rating">★ {product.rating.toFixed(1)}</p>
        <div className="buyer-product-footer">
          <div className="buyer-product-price">
            <strong>₹{product.pricePerKg}</strong>
            <span>/{product.unit}</span>
          </div>
          <button
            type="button"
            className={`button buyer-add-button${inCart ? ' added' : ''}`}
            onClick={() => onToggleCart(product.id)}
          >
            {inCart ? 'Added ✓' : 'Add'}
          </button>
        </div>
        <p className="buyer-product-moq">Min. order {product.minOrderKg} {product.unit}</p>
      </div>
    </article>
  )
}

function ProductGrid({ products, favorites, onToggleFavorite, cart, onToggleCart }) {
  if (products.length === 0) {
    return <div className="empty-card"><p>No products found.</p></div>
  }
  return (
    <div className="buyer-product-grid">
      {products.map((product) => (
        <ProductCard
          key={product.id}
          product={product}
          favorited={favorites.has(product.id)}
          onToggleFavorite={onToggleFavorite}
          inCart={cart.has(product.id)}
          onToggleCart={onToggleCart}
        />
      ))}
    </div>
  )
}

function CategoryModal({ categoryId, products, favorites, onToggleFavorite, cart, onToggleCart, onClose }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="buyer-category-modal" role="dialog" aria-modal="true" aria-labelledby="category-modal-title">
        <button className="close-button" aria-label="Close" onClick={onClose}>×</button>
        <p className="eyebrow">SHOP BY CATEGORY</p>
        <h2 id="category-modal-title">{CATEGORY_LABELS[categoryId] || categoryId}</h2>
        <div className="buyer-category-modal-body">
          <ProductGrid products={products} favorites={favorites} onToggleFavorite={onToggleFavorite} cart={cart} onToggleCart={onToggleCart} />
        </div>
      </section>
    </div>
  )
}

export default function BulkBuyerDashboard({ user, language, setLanguage, onLogout }) {
  const t = useTranslation(language)
  const [catalog, setCatalog] = useState({ products: [], categories: [] })
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState(null)
  const [favorites, setFavorites] = useState(() => new Set())
  const [cart, setCart] = useState(() => new Set())

  useEffect(() => {
    let cancelled = false
    fetchBuyerProducts().then((data) => {
      if (!cancelled) setCatalog(data)
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [])

  const randomPicks = useMemo(
    () => shuffled(catalog.products).slice(0, RANDOM_PICKS_COUNT),
    [catalog.products],
  )

  const searchTerm = search.trim().toLowerCase()
  const searchResults = searchTerm
    ? catalog.products.filter((product) => product.name.toLowerCase().includes(searchTerm))
    : null

  const categoryProducts = activeCategory
    ? catalog.products.filter((product) => product.category === activeCategory)
    : []

  function toggleFavorite(id) {
    setFavorites((current) => {
      const next = new Set(current)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleCart(id) {
    setCart((current) => {
      const next = new Set(current)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const initials = (user.name || 'B').trim().split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase() || 'B'

  return (
    <div className="buyer-shell">
      <header className="buyer-topbar">
        <div className="brand buyer-brand">
          <span className="brand-mark">✦</span>
          <span>Farm<span>Direct</span></span>
        </div>

        <div className="buyer-search">
          <span className="buyer-search-icon" aria-hidden="true">⌕</span>
          <input
            type="search"
            placeholder="Search for rice, wheat, vegetables, fruits…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Search products"
          />
        </div>

        <div className="buyer-topbar-actions">
          <LanguageSwitcher language={language} setLanguage={setLanguage} />
          <button type="button" className="buyer-cart-button" aria-label="Cart">
            🛒{cart.size > 0 && <span className="buyer-cart-count">{cart.size}</span>}
          </button>
          <div className="buyer-profile">
            <div className="buyer-avatar" aria-hidden="true">{initials}</div>
            <div className="buyer-profile-info">
              <strong>{user.name || 'Buyer'}</strong>
              <span>{user.location || 'Add your location'}</span>
            </div>
            <button className="text-link buyer-logout" onClick={onLogout}>{t.logout}</button>
          </div>
        </div>
      </header>

      <nav className="buyer-categories" aria-label="Product categories">
        {catalog.categories.map((category) => (
          <button
            key={category.id}
            type="button"
            className="buyer-category-tile"
            style={{ '--tile-accent': category.accent }}
            onClick={() => setActiveCategory(category.id)}
          >
            <span className="buyer-category-icon" aria-hidden="true">{category.icon}</span>
            <span>{CATEGORY_LABELS[category.id] || category.id}</span>
          </button>
        ))}
      </nav>

      <main className="buyer-main">
        <div className="section-heading-row">
          <h3>{searchTerm ? `Results for “${search.trim()}”` : 'Explore products'}</h3>
        </div>
        {loading ? (
          <p className="buyer-loading">Loading catalog…</p>
        ) : (
          <ProductGrid
            products={searchResults ?? randomPicks}
            favorites={favorites}
            onToggleFavorite={toggleFavorite}
            cart={cart}
            onToggleCart={toggleCart}
          />
        )}
      </main>

      {activeCategory && (
        <CategoryModal
          categoryId={activeCategory}
          products={categoryProducts}
          favorites={favorites}
          onToggleFavorite={toggleFavorite}
          cart={cart}
          onToggleCart={toggleCart}
          onClose={() => setActiveCategory(null)}
        />
      )}
    </div>
  )
}

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode,} from 'react'
import { BrowserRouter, Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { api, getAccessToken, setAccessToken, setUnauthorizedHandler, type Customer, type InventoryItem, type Movement, type Order, type Product, type User, type Warehouse } from './api'
import './App.css'

type ModalKind = 'product' | 'warehouse' | 'customer' | 'adjust' | 'transfer' | 'order'
type DataState<T> = { data: T; loading: boolean; error: string; reload: () => void }
const TODAY_LABEL = new Intl.DateTimeFormat('en', { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date())
type Theme = 'light' | 'dark'
const ThemeContext = createContext<{ theme: Theme; toggleTheme: () => void } | null>(null)
type AuthContextValue = {
  token: string | null
  user: User | null
  loading: boolean
  error: string
  signIn: (token: string) => Promise<void>
  signOut: () => void
}
const AuthContext = createContext<AuthContextValue | null>(null)

function tokenExpiration(token: string) {
  try {
    const payload = token.split('.')[1]
    if (!payload) return null
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: number }
    return typeof decoded.exp === 'number' ? decoded.exp * 1000 : null
  } catch {
    return null
  }
}

function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState(() => getAccessToken())
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(() => Boolean(getAccessToken()))
  const [error, setError] = useState('')

  const signOut = useCallback(() => {
    setAccessToken(null)
    setToken(null)
    setUser(null)
    setLoading(false)
    setError('')
  }, [])

  const expireSession = useCallback(() => {
    setAccessToken(null)
    setToken(null)
    setUser(null)
    setLoading(false)
    setError('Your session has expired. Please sign in again.')
  }, [])

  const loadUser = useCallback(async (accessToken: string) => {
    setLoading(true)
    setError('')
    try {
      const currentUser = await api.users.me()
      if (getAccessToken() === accessToken) setUser(currentUser)
    } catch (cause) {
      if (getAccessToken() === accessToken) {
        setError(cause instanceof Error ? cause.message : 'Unable to load your account')
      }
      throw cause
    } finally {
      if (getAccessToken() === accessToken) setLoading(false)
    }
  }, [])

  useEffect(() => {
    setUnauthorizedHandler(expireSession)
    return () => setUnauthorizedHandler(null)
  }, [expireSession])

  useEffect(() => {
    const existingToken = getAccessToken()
    if (!existingToken) {
      setLoading(false)
      return
    }
    const expiresAt = tokenExpiration(existingToken)
    if (expiresAt !== null && expiresAt <= Date.now()) {
      expireSession()
      return
    }
    void loadUser(existingToken).catch(() => undefined)
  }, [loadUser, expireSession])

  useEffect(() => {
    if (!token) return
    const expiresAt = tokenExpiration(token)
    if (expiresAt === null) return
    const remaining = expiresAt - Date.now()
    if (remaining <= 0) {
      expireSession()
      return
    }
    let timer = 0
    const checkExpiry = () => {
      const timeLeft = expiresAt - Date.now()
      if (timeLeft <= 0) expireSession()
      else timer = window.setTimeout(checkExpiry, Math.min(timeLeft, 2_147_000_000))
    }
    timer = window.setTimeout(checkExpiry, Math.min(remaining, 2_147_000_000))
    return () => window.clearTimeout(timer)
  }, [token, expireSession])

  const signIn = useCallback(async (newToken: string) => {
    setAccessToken(newToken)
    setToken(newToken)
    setUser(null)
    await loadUser(newToken)
  }, [loadUser])

  const value = useMemo(() => ({ token, user, loading, error, signIn, signOut }), [token, user, loading, error, signIn, signOut])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('Authentication must be used within AuthProvider')
  return context
}

function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => localStorage.getItem('northstock-theme') === 'dark' ? 'dark' : 'light')
  const toggleTheme = useCallback(() => {
    setTheme((current) => current === 'dark' ? 'light' : 'dark')
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('northstock-theme', theme)
  }, [theme])

  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>
}

function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('Theme toggle must be used within ThemeProvider')
  return context
}

function useResource<T>(loader: () => Promise<T>, initial: T): DataState<T> {
  const [data, setData] = useState(initial)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [version, setVersion] = useState(0)
  const reload = useCallback(() => {
    setLoading(true)
    setError('')
    setVersion((value) => value + 1)
  }, [])

  useEffect(() => {
    let active = true
    loader().then((result) => {
      if (active) setData(result)
    }).catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause.message : 'Unable to load data')
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [loader, version])

  return { data, loading, error, reload }
}

function useProducts() { return useResource(api.products.getAll, [] as Product[]) }
function useWarehouses() { return useResource(api.warehouses.getAll, [] as Warehouse[]) }
function useInventory() { return useResource(api.inventory.getAll, [] as InventoryItem[]) }
function useCustomers() { return useResource(api.customers.getAll, [] as Customer[]) }
function useOrders() { return useResource(api.orders.getAll, [] as Order[]) }
function useLowStock() { return useResource(api.inventory.lowStock, [] as InventoryItem[]) }

const navGroups = [
  {
    label: 'WORKSPACE',
    links: [
      { to: '/dashboard', label: 'Overview', icon: 'grid' },
      { to: '/inventory', label: 'Inventory', icon: 'boxes' },
      { to: '/low-stock', label: 'Low stock', icon: 'alert' },
      { to: '/movements', label: 'Movement log', icon: 'activity' },
    ],
  },
  {
    label: 'CATALOG',
    links: [
      { to: '/products', label: 'Products', icon: 'tag' },
      { to: '/warehouses', label: 'Warehouses', icon: 'warehouse' },
    ],
  },
  {
    label: 'COMMERCE',
    links: [
      { to: '/orders', label: 'Orders', icon: 'receipt' },
      { to: '/customers', label: 'Customers', icon: 'users' },
    ],
  },
]

function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    boxes: <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 12 9 5 9-5M3 16l9 5 9-5M12 13v8" /></>,
    alert: <><path d="m10.3 3.9-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3l-8-14a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4m0 4h.01" /></>,
    activity: <><path d="M3 12h4l3-8 4 16 3-8h4" /></>,
    tag: <><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0l-8.2-8.2A2 2 0 0 1 1.8 11V4a2 2 0 0 1 2-2h7a2 2 0 0 1 1.4.6l8.4 8a2 2 0 0 1 0 2.8Z" /><circle cx="7.5" cy="7.5" r="1.5" /></>,
    warehouse: <><path d="m3 9 9-6 9 6v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9Z" /><path d="M9 21v-8h6v8M3 9h18" /></>,
    receipt: <><path d="M4 2v20l4-2 4 2 4-2 4 2V2l-4 2-4-2-4 2-4-2Z" /><path d="M8 9h8m-8 4h8" /></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="10" cy="7" r="4" /><path d="M20 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    arrow: <><path d="M5 12h14m-7-7 7 7-7 7" /></>,
    down: <><path d="m7 10 5 5 5-5" /></>,
    close: <><path d="m18 6-12 12M6 6l12 12" /></>,
    edit: <><path d="m16 4 4 4M4 20l4-.8L19 8a2.1 2.1 0 0 0-3-3L5 16l-1 4Z" /></>,
    trash: <><path d="M3 6h18m-2 0-.9 14H5L4 6m4 0V4h8v2m-5 4v6m4-6v6" /></>,
    refresh: <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M5.5 9a7 7 0 0 1 12-2L20 12M4 12l2.5 5a7 7 0 0 0 12-2" /></>,
    menu: <><path d="M4 6h16M4 12h16M4 18h16" /></>,
    check: <><path d="m5 12 4 4L19 6" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    moon: <path d="M20.8 13a8.5 8.5 0 0 1-9.8-9.8A9 9 0 1 0 20.8 13Z" />,
    sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" /></>,
    logout: <><path d="M10 17l5-5-5-5M15 12H3" /><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" /></>,
  }
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name] ?? paths.grid}</svg>
}

function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { theme, toggleTheme } = useTheme()
  const nextTheme = theme === 'dark' ? 'light' : 'dark'
  return <button className={`theme-toggle ${compact ? 'theme-toggle-compact' : ''}`} type="button" onClick={toggleTheme} aria-label={`Switch to ${nextTheme} mode`} title={`Switch to ${nextTheme} mode`}><Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} />{!compact && <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>}</button>
}

function LandingPage() {
  return <div className="landing-page" id="top">
    <header className="landing-header">
      <NavLink className="landing-brand" to="/" aria-label="ApexStock home">
        <span className="brand-mark">A</span>
        <span className="brand-name">APEX<span>STOCK</span></span>
      </NavLink>
      <nav className="landing-nav" aria-label="Landing page navigation">
        <a href="#why-apexstock">Why ApexStock</a>
        <a href="#how-it-works">How it works</a>
      </nav>
      <div className="landing-header-actions"><ThemeToggle compact /><NavLink className="landing-signin" to="/dashboard">Open app <Icon name="arrow" size={15} /></NavLink></div>
    </header>

    <main>
      <section className="landing-hero">
        <div className="landing-hero-copy">
          <div className="landing-eyebrow"><span /> INVENTORY, IN GOOD ORDER.</div>
          <h1>Know what<br />you have.<br /><span>Move with</span><br /><em>confidence.</em></h1>
          <div className="landing-hero-bottom">
            <p>A calmer way to manage products, stock, warehouses, and orders — all in one considered workspace.</p>
            <NavLink className="landing-cta" to="/dashboard">Step inside <Icon name="arrow" size={17} /></NavLink>
          </div>
        </div>
        <div className="landing-hero-visual">
          <img src="https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=1600&q=85" alt="Sunlight falling across organized warehouse shelves" />
          <div className="hero-image-wash" />
          <div className="hero-image-caption"><span>01 / BUILT FOR THE DAY-TO-DAY</span><span>LESS GUESSWORK. MORE GETTING THERE.</span></div>
          <div className="hero-sticker"><span>✳</span><small>GOOD STOCK<br />GOOD FLOW</small></div>
          <div className="hero-inventory-card">
            <div className="hero-card-top"><span>YOUR STOCK, AT A GLANCE</span><span className="hero-live"><i /> LIVE</span></div>
            <strong>One clear view.</strong>
            <div className="hero-card-stats"><div><span>PRODUCTS</span><b>All in one place</b></div><div><span>LOCATIONS</span><b>Always accounted for</b></div></div>
            <NavLink to="/dashboard">Explore your workspace <Icon name="arrow" size={14} /></NavLink>
          </div>
        </div>
        <div className="landing-scroll"><span>SCROLL TO EXPLORE</span><i /></div>
      </section>

      <section className="landing-manifesto" id="why-apexstock">
        <div className="landing-section-label"><span>01</span> A BETTER KIND OF BUSY</div>
        <div className="manifesto-copy"><h2>Operations have enough moving parts.<br /><span>Your inventory shouldn't be one of them.</span></h2><p>ApexStock brings the everyday essentials into focus. Keep the details close, the next step obvious, and your team moving in the same direction.</p></div>
        <NavLink className="manifesto-link" to="/dashboard">Get to know your stock <Icon name="arrow" size={16} /></NavLink>
      </section>

      <section className="landing-features" id="how-it-works">
        <div className="landing-features-heading"><div><div className="landing-section-label"><span>02</span> THE EVERYDAY, MADE EASIER</div><h2>Everything in its<br /><em>right place.</em></h2></div><p>From the first product to the final order, the work stays simple, visible, and connected.</p></div>
        <div className="feature-grid">
          <article className="feature-card feature-card-dark"><span className="feature-number">01 / KEEP TRACK</span><div className="feature-illustration feature-boxes"><span /><span /><span /></div><h3>See the whole picture.</h3><p>Products, quantities, and locations together — so the answer is never far away.</p><NavLink to="/inventory">Explore inventory <Icon name="arrow" size={14} /></NavLink></article>
          <article className="feature-card feature-card-orange"><span className="feature-number">02 / STAY AHEAD</span><div className="feature-illustration feature-level"><span /><span /><span /><b>LOW STOCK<br />IN FOCUS</b></div><h3>A little heads-up goes a long way.</h3><p>Spot items approaching their reorder point before they slow you down.</p><NavLink to="/low-stock">See what needs a restock <Icon name="arrow" size={14} /></NavLink></article>
          <article className="feature-card feature-card-sand"><span className="feature-number">03 / KEEP IT MOVING</span><div className="feature-illustration feature-arrows"><span>01</span><i /><span>02</span></div><h3>From warehouse to doorstep.</h3><p>Adjust stock, move it between locations, and keep customer orders in view.</p><NavLink to="/orders">Visit the order desk <Icon name="arrow" size={14} /></NavLink></article>
        </div>
      </section>

      <section className="landing-closing">
        <div className="landing-section-label"><span>03</span> A CLEARER START</div>
        <h2>Ready when<br />you <em>are.</em></h2>
        <p>Take a breath. Take stock. Then get on with what matters.</p>
        <NavLink className="landing-cta landing-cta-light" to="/dashboard">Open your workspace <Icon name="arrow" size={17} /></NavLink>
        <span className="closing-orbit closing-orbit-one" /><span className="closing-orbit closing-orbit-two" />
      </section>
    </main>

    <footer className="landing-footer"><NavLink className="landing-brand" to="/"><span className="brand-mark">A</span><span className="brand-name">APEX<span>STOCK</span></span></NavLink><span>INVENTORY, IN GOOD ORDER.</span><a href="#top" onClick={(event) => { event.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>BACK TO THE TOP ↑</a></footer>
  </div>
}

function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const { signIn, error: sessionError } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const from = (location.state as { from?: { pathname?: string; search?: string; hash?: string } } | null)?.from
  const destination = from?.pathname ? `${from.pathname}${from.search ?? ''}${from.hash ?? ''}` : '/dashboard'
  const notice = (location.state as { notice?: string } | null)?.notice ?? ''
  const isRegister = mode === 'register'

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    const values = new FormData(event.currentTarget)
    const email = String(values.get('email') ?? '').trim()
    const password = String(values.get('password') ?? '')

    try {
      if (isRegister) {
        const response = await api.auth.register({
          name: String(values.get('name') ?? '').trim(),
          email,
          password,
        })
        const token = response?.accessToken
        if (token) {
          await signIn(token)
          navigate(destination, { replace: true })
        } else {
          navigate('/login', { replace: true, state: { notice: 'Your account is ready. Sign in to continue.' } })
        }
      } else {
        const response = await api.auth.login({ email, password })
        const token = response.accessToken

        if (!token) {
          throw new Error('The sign-in response did not include an access token.')
        }

        await signIn(token)
        navigate(destination, { replace: true })
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to complete your request')
    } finally {
      setBusy(false)
    }
  }

  return <main className="auth-page">
    <header className="auth-header">
      <NavLink className="landing-brand" to="/" aria-label="ApexStock home"><span className="brand-mark">A</span><span className="brand-name">APEX<span>STOCK</span></span></NavLink>
      <ThemeToggle compact />
    </header>
    <section className="auth-card">
      <div className="landing-eyebrow"><span /> INVENTORY, IN GOOD ORDER.</div>
      <h1>{isRegister ? 'A clearer start.' : 'Welcome back.'}</h1>
      <p>{isRegister ? 'Create your account and get your inventory in order.' : 'Sign in to pick up where your workspace left off.'}</p>
      {notice && <div className="auth-notice" role="status">{notice}</div>}
      {(error || sessionError) && <div className="auth-error" role="alert">{error || sessionError}</div>}
      <form className="auth-form" onSubmit={(event) => void submit(event)}>
        {isRegister && <label>YOUR NAME<input name="name" type="text" autoComplete="name" required /></label>}
        <label>EMAIL ADDRESS<input name="email" type="email" autoComplete="email" required /></label>
        <label>PASSWORD<input name="password" type="password" autoComplete={isRegister ? 'new-password' : 'current-password'} required /></label>
        <button className="auth-submit" type="submit" disabled={busy}>{busy ? 'Please wait…' : isRegister ? 'Create account' : 'Sign in'}<Icon name="arrow" size={16} /></button>
      </form>
      <div className="auth-switch">{isRegister ? 'Already have an account?' : 'New to ApexStock?'} <NavLink to={isRegister ? '/login' : '/register'}>{isRegister ? 'Sign in' : 'Create an account'}</NavLink></div>
    </section>
    <footer className="auth-footer">APEXSTOCK <span>•</span> INVENTORY, IN GOOD ORDER.</footer>
  </main>
}

function AppShell() {
  const location = useLocation()
  const { token, user, loading, signOut, error: sessionError } = useAuth()
  const navigate = useNavigate()
  const [modal, setModal] = useState<ModalKind | null>(null)
  const [mobileNav, setMobileNav] = useState(false)
  const [toast, setToast] = useState('')
  const path = location.pathname

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(''), 3600)
    return () => window.clearTimeout(timer)
  }, [toast])

  const pageTitle = useMemo(() => {
    if (path === '/') return 'Overview'
    const link = navGroups.flatMap((group) => group.links).find((item) => item.to === path)
    return link?.label ?? (path === '/movements' ? 'Movement log' : 'Not found')
  }, [path])

  const afterSave = (message: string) => {
    setModal(null)
    setToast(message)
    window.dispatchEvent(new Event('inventory-refresh'))
  }

  const refreshKey = useRefreshKey()

  if (path === '/login' || path === '/register') return <AuthPage key={path} mode={path === '/register' ? 'register' : 'login'} />
  if (path === '/') return <LandingPage />
  if (loading) return <div className="auth-loading"><span className="spinner" />Checking your session…</div>
  if (!token) return <Navigate to="/login" replace state={{ from: location }} />

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
        <NavLink className="brand" to="/" onClick={() => setMobileNav(false)}>
          <span className="brand-mark">A</span>
          <span className="brand-name">APEX<span>STOCK</span></span>
          <span className="brand-edition">INVENTORY OS</span>
        </NavLink>
        <div className="workspace-select">
          <span className="workspace-avatar">{user?.name?.slice(0, 1).toUpperCase() ?? 'A'}</span>
          <span><strong>{user?.name || 'Your account'}</strong><small>{user?.email || 'Signed in'}</small></span>
        </div>
        <nav className="side-nav" aria-label="Main navigation">
          {navGroups.map((group) => (
            <div className="nav-group" key={group.label}>
              <div className="nav-label">{group.label}</div>
              {group.links.map((item) => (
                <NavLink key={item.to} to={item.to} end={item.to === '/'} onClick={() => setMobileNav(false)} className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}>
                  <Icon name={item.icon} /><span>{item.label}</span>
                  {item.to === '/low-stock' && <span className="nav-live-dot" />}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note"><span className="status-pulse" />INVENTORY, IN GOOD ORDER</div>
          <div className="profile">
            <div className="profile-avatar">{user?.name?.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase() ?? 'A'}</div>
            <div><strong>{user?.name || 'Your account'}</strong><small>{user?.email || 'Account details unavailable'}</small></div>
            <button className="icon-button" aria-label="Log out" title="Log out" onClick={() => { signOut(); navigate('/login', { replace: true }) }}><Icon name="logout" size={17} /></button>
          </div>
        </div>
      </aside>
      {mobileNav && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMobileNav(false)} />}
      <main className="main-area">
        <header className="topbar">
          <button className="mobile-menu icon-button" aria-label="Open navigation" onClick={() => setMobileNav(true)}><Icon name="menu" /></button>
          <div className="breadcrumbs"><span>Workspace</span><span className="crumb-slash">/</span><strong>{pageTitle}</strong></div>
          <div className="topbar-right">
            <span className="today-label">{TODAY_LABEL}</span>
            <ThemeToggle />
            <span className="topbar-divider" />
            {sessionError && <span className="session-warning" role="status">{sessionError}</span>}
            <div className="top-avatar">{user?.name?.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase() ?? 'A'}</div>
          </div>
        </header>
        <div className="page-content">
          <Routes>
                    <Route path="/dashboard" element={<Dashboard key={refreshKey} onAction={setModal} />} />
            <Route path="/products" element={<Products key={refreshKey} onAction={setModal} onToast={setToast} />} />
            <Route path="/warehouses" element={<Warehouses key={refreshKey} onAction={setModal} onToast={setToast} />} />
            <Route path="/inventory" element={<InventoryPage key={refreshKey} onAction={setModal} />} />
            <Route path="/low-stock" element={<LowStockPage key={refreshKey} onAction={setModal} />} />
            <Route path="/customers" element={<CustomersPage key={refreshKey} onAction={setModal} onToast={setToast} />} />
            <Route path="/orders" element={<OrdersPage key={refreshKey} onAction={setModal} onToast={setToast} />} />
            <Route path="/movements" element={<MovementsPage key={refreshKey} />} />
            <Route path="*" element={<EmptyState title="This page isn't here" detail="Choose a destination from the navigation." />} />
          </Routes>
        </div>
        <footer className="page-footer"><span>APEXSTOCK <span className="footer-dot">•</span> INVENTORY, IN GOOD ORDER.</span><span>DESIGNED FOR THE EVERYDAY.</span></footer>
      </main>
      {modal && <ActionDialog kind={modal} onClose={() => setModal(null)} onSaved={afterSave} />}
      {toast && <div className="toast"><span className="toast-check"><Icon name="check" size={15} /></span>{toast}</div>}
    </div>
  )
}

function useRefreshKey() {
  const [key, setKey] = useState(0)
  useEffect(() => {
    const refresh = () => setKey((value) => value + 1)
    window.addEventListener('inventory-refresh', refresh)
    return () => window.removeEventListener('inventory-refresh', refresh)
  }, [])
  return key
}

function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: ReactNode; description: string; action?: ReactNode }) {
  return <div className="page-heading"><div><div className="eyebrow"><span />{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{action && <div className="heading-actions">{action}</div>}</div>
}

function Button({ children, onClick, variant = 'primary', icon, type = 'button', disabled = false }: { children: ReactNode; onClick?: () => void; variant?: 'primary' | 'secondary' | 'text' | 'danger'; icon?: string; type?: 'button' | 'submit'; disabled?: boolean }) {
  return <button type={type} className={`button button-${variant}`} onClick={onClick} disabled={disabled}>{icon && <Icon name={icon} size={16} />}{children}</button>
}

function StateMessage({ loading, error, onRetry }: { loading: boolean; error: string; onRetry?: () => void }) {
  if (loading) return <div className="state-message"><span className="spinner" />Loading your data…</div>
  if (error) return <div className="error-banner"><Icon name="alert" size={18} /><div><strong>Couldn't reach your inventory data</strong><span>{error}. Check your API connection and try again.</span></div>{onRetry && <button className="button button-secondary button-small" onClick={onRetry}>Retry</button>}</div>
  return null
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <div className="empty-state"><div className="empty-icon"><Icon name="boxes" size={24} /></div><strong>{title}</strong><span>{detail}</span></div>
}

function StatCard({ label, value, note, icon, accent = false }: { label: string; value: string | number; note: string; icon: string; accent?: boolean }) {
  return <div className={`stat-card ${accent ? 'stat-card-accent' : ''}`}><div className="stat-top"><span>{label}</span><span className="stat-icon"><Icon name={icon} size={18} /></span></div><div className="stat-value">{value}</div><div className="stat-note">{note}</div></div>
}

function Dashboard({ onAction }: { onAction: (kind: ModalKind) => void }) {
  const products = useProducts()
  const warehouses = useWarehouses()
  const inventory = useInventory()
  const lowStock = useLowStock()
  const orders = useOrders()
  const customers = useCustomers()
  const loading = products.loading || warehouses.loading || inventory.loading || lowStock.loading || orders.loading || customers.loading
  const firstError = products.error || warehouses.error || inventory.error || lowStock.error || orders.error || customers.error
  const totalUnits = inventory.data.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0)
  const reload = () => [products, warehouses, inventory, lowStock, orders, customers].forEach((resource) => resource.reload())
  const lowStockRows = lowStock.data.slice(0, 4)
  const productsById = new Map(products.data.map((product) => [product.id, product]))
  const warehousesById = new Map(warehouses.data.map((warehouse) => [warehouse.id, warehouse]))

  return <>
    <PageHeading eyebrow="YOUR OPERATIONS, AT A GLANCE" title={<>A clearer view<br className="desktop-break" /> of your stock.</>} description="Your operations, at a glance. Pick up where your team left off." action={<Button icon="plus" onClick={() => onAction('product')}>Add a product</Button>} />
    <StateMessage loading={loading} error={firstError} onRetry={reload} />
    <section className="stats-grid">
      <StatCard label="PRODUCTS" value={products.error ? '—' : products.data.length.toLocaleString()} note={products.error ? 'Data unavailable' : 'Across your full catalog'} icon="tag" />
      <StatCard label="WAREHOUSES" value={warehouses.error ? '—' : warehouses.data.length.toString().padStart(2, '0')} note={warehouses.error ? 'Data unavailable' : `${warehouses.data.filter((warehouse) => warehouse.isActive).length} currently active`} icon="warehouse" />
      <StatCard label="UNITS ON HAND" value={inventory.error ? '—' : totalUnits.toLocaleString()} note={inventory.error ? 'Data unavailable' : 'Total across all locations'} icon="boxes" />
      <StatCard label="NEEDS ATTENTION" value={lowStock.error ? '—' : lowStock.data.length.toString().padStart(2, '0')} note={lowStock.error ? 'Data unavailable' : 'Items at or below reorder point'} icon="alert" accent />
    </section>
    <section className="dashboard-grid">
      <div className="panel inventory-panel">
        <div className="panel-heading"><div><div className="eyebrow">KEEP AN EYE ON</div><h2>Needs a restock</h2></div><NavLink to="/low-stock" className="text-link">View all <Icon name="arrow" size={15} /></NavLink></div>
        {lowStockRows.length ? <div className="restock-list">
          {lowStockRows.map((item, index) => {
            const product = productsById.get(item.product_id)
            const warehouse = warehousesById.get(item.warehouse_id)
            const level = item.reorder_level ?? product?.reorder_level ?? 0
            const percent = level ? Math.min(100, (item.quantity / level) * 100) : 0
            return <div className="restock-row" key={`${item.product_id}-${item.warehouse_id}`}>
              <div className={`product-thumb thumb-${index + 1}`}>{(product?.name ?? item.product_name ?? 'P').slice(0, 1).toUpperCase()}</div>
              <div className="restock-product"><strong>{product?.name ?? item.product_name ?? `Product #${item.product_id}`}</strong><small>{product?.sku ?? item.product_sku ?? 'SKU not available'} <span>·</span> {warehouse?.name ?? item.warehouse_name ?? item.warehouse_code ?? `Location ${item.warehouse_id}`}</small></div>
              <div className="restock-level"><strong>{item.quantity}</strong><small>of {level || '—'} min</small></div>
              <div className="level-track"><span style={{ width: `${percent}%` }} /></div>
              <span className="low-pill">LOW</span>
            </div>
          })}
        </div> : !loading && !firstError ? <EmptyState title="All stocked up" detail="Nothing is below its reorder point." /> : null}
      </div>
      <div className="panel quick-panel">
        <div className="panel-heading"><div><div className="eyebrow">GET THINGS MOVING</div><h2>Quick actions</h2></div><span className="quick-spark">✳</span></div>
        <button className="quick-action" onClick={() => onAction('adjust')}><span className="quick-action-icon"><Icon name="plus" /></span><span><strong>Adjust stock</strong><small>Log an incoming or outgoing item</small></span><Icon name="arrow" size={16} /></button>
        <button className="quick-action" onClick={() => onAction('transfer')}><span className="quick-action-icon quick-action-cream"><Icon name="arrow" /></span><span><strong>Transfer stock</strong><small>Move items between locations</small></span><Icon name="arrow" size={16} /></button>
        <button className="quick-action" onClick={() => onAction('warehouse')}><span className="quick-action-icon quick-action-dark"><Icon name="warehouse" /></span><span><strong>Add a warehouse</strong><small>Grow your storage network</small></span><Icon name="arrow" size={16} /></button>
        <div className="quick-footnote"><span className="status-pulse" />Small actions, big difference.</div>
      </div>
    </section>
    <section className="panel recent-panel">
      <div className="panel-heading"><div><div className="eyebrow">YOUR BUSINESS, IN MOTION</div><h2>Recent orders</h2></div><NavLink to="/orders" className="text-link">All orders <Icon name="arrow" size={15} /></NavLink></div>
      {orders.data.length ? <OrderTable orders={orders.data.slice(0, 5)} customers={customers.data} /> : !loading && !firstError ? <EmptyState title="A little quiet here" detail="New orders will show up here as they come in." /> : null}
    </section>
    <div className="dashboard-bottom"><div className="quote-card"><span className="quote-mark">“</span><p>Good inventory isn't about having more.<br />It's about knowing what you have.</p><small>THE APEXSTOCK PRINCIPLE <span>—</span> 01</small><div className="quote-orbit orbit-one" /><div className="quote-orbit orbit-two" /></div><div className="orders-mini panel"><div className="eyebrow">PENDING ORDERS</div><div className="mini-number">{orders.error ? '—' : orders.data.filter((order) => order.status === 'PENDING').length.toString().padStart(2, '0')}</div><div className="mini-copy">{orders.error ? 'Data unavailable' : 'Ready for your review'}</div><NavLink to="/orders" className="mini-link">Open order desk <Icon name="arrow" size={14} /></NavLink></div></div>
  </>
}

function SearchField({ value, onChange, placeholder = 'Search by name or SKU…' }: { value: string; onChange: (value: string) => void; placeholder?: string }) {
  return <label className="search-field"><Icon name="search" size={17} /><input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} /><kbd>⌘ K</kbd></label>
}

function Products({ onAction, onToast }: { onAction: (kind: ModalKind) => void; onToast: (message: string) => void }) {
  const resource = useProducts()
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<Product | null>(null)
  const filtered = resource.data.filter((product) => `${product.name} ${product.sku} ${product.category}`.toLowerCase().includes(search.toLowerCase()))
  const remove = async (product: Product) => {
    if (!window.confirm(`Delete ${product.name}? This cannot be undone.`)) return
    try { await api.products.delete(product.id); onToast('Product deleted'); resource.reload() }
    catch (error) { onToast(error instanceof Error ? error.message : 'Could not delete product') }
  }
  return <>
    <PageHeading eyebrow="YOUR CATALOG" title="Products." description="The things you make, move, and keep track of." action={<Button icon="plus" onClick={() => { setEditing(null); onAction('product') }}>Add product</Button>} />
    <StateMessage loading={resource.loading} error={resource.error} onRetry={resource.reload} />
    <div className="table-card"><div className="table-toolbar"><div className="table-count"><strong>Product list</strong><span>{resource.data.length} items</span></div><SearchField value={search} onChange={setSearch} /></div>
      {filtered.length ? <div className="table-scroll"><table><thead><tr><th>PRODUCT</th><th>SKU</th><th>CATEGORY</th><th>REORDER POINT</th><th /></tr></thead><tbody>{filtered.map((product, index) => <tr key={product.id}><td><div className="table-product"><span className={`product-thumb thumb-${index % 4 + 1}`}>{product.name.slice(0, 1).toUpperCase()}</span><span><strong>{product.name}</strong><small>ID · {product.id}</small></span></div></td><td><span className="mono">{product.sku}</span></td><td>{product.category || 'Uncategorized'}</td><td><span className="reorder-number">{product.reorder_level}</span><span className="subtle"> units</span></td><td><div className="row-actions"><button className="icon-button" aria-label={`Edit ${product.name}`} onClick={() => setEditing(product)}><Icon name="edit" size={16} /></button><button className="icon-button row-delete" aria-label={`Delete ${product.name}`} onClick={() => void remove(product)}><Icon name="trash" size={16} /></button></div></td></tr>)}</tbody></table></div> : !resource.loading && !resource.error ? <EmptyState title={search ? 'No matches found' : 'Your catalog starts here'} detail={search ? 'Try another search term.' : 'Add your first product to start keeping track.'} /> : null}
    </div>
    {editing && <ActionDialog key={editing.id} kind="product" existing={editing} onClose={() => setEditing(null)} onSaved={(message) => { setEditing(null); onToast(message); resource.reload() }} />}
  </>
}


function Warehouses({
  onAction,
  onToast,
}: {
  onAction: (kind: ModalKind) => void
  onToast: (message: string) => void
}) {
  const resource = useWarehouses()
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<Warehouse | null>(null)
  const [importing, setImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const filtered = resource.data.filter((warehouse) =>
    `${warehouse.name} ${warehouse.code}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  )

  const importCsv = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.name.toLowerCase().endsWith('.csv')) {
      onToast('Please select a CSV file')
      event.target.value = ''
      return
    }

    setImporting(true)

    try {
      const imported = await api.warehouses.importCsv(file)

      onToast(`Successfully imported ${imported.length} warehouses`)
      resource.reload()
      window.dispatchEvent(new Event('inventory-refresh'))
    } catch (error) {
      onToast(
        error instanceof Error
          ? error.message
          : 'Could not import warehouses',
      )
    } finally {
      setImporting(false)
      event.target.value = ''
    }
  }

  const remove = async (warehouse: Warehouse) => {
    if (!window.confirm(`Delete ${warehouse.name}?`)) return

    try {
      await api.warehouses.delete(warehouse.id)
      onToast('Warehouse deleted')
      resource.reload()
    } catch (error) {
      onToast(
        error instanceof Error
          ? error.message
          : 'Could not delete warehouse',
      )
    }
  }

  return (
    <>
      <PageHeading
        eyebrow="WHERE IT LIVES"
        title="Warehouses."
        description="Every location, accounted for and in its place."
        action={
          <>
            <Button
              variant="secondary"
              icon="arrow"
              disabled={importing}
              onClick={() => fileInputRef.current?.click()}
            >
              {importing ? 'Importing…' : 'Import CSV'}
            </Button>

            <Button
              icon="plus"
              onClick={() => {
                setEditing(null)
                onAction('warehouse')
              }}
            >
              Add warehouse
            </Button>

            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              hidden
              onChange={importCsv}
              disabled={importing}
              aria-label="Select warehouse CSV file"
            />
          </>
        }
      />

      <StateMessage
        loading={resource.loading}
        error={resource.error}
        onRetry={resource.reload}
      />

      <div className="table-card">
        <div className="table-toolbar">
          <div className="table-count">
            <strong>Locations</strong>
            <span>{resource.data.length} warehouses</span>
          </div>
          <SearchField
            value={search}
            onChange={setSearch}
            placeholder="Search warehouses…"
          />
        </div>

        {filtered.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>WAREHOUSE</th>
                  <th>CODE</th>
                  <th>CAPACITY</th>
                  <th>STATUS</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((warehouse) => (
                  <tr key={warehouse.id}>
                    <td>
                      <div className="table-product">
                        <span className="warehouse-thumb">
                          <Icon name="warehouse" size={18} />
                        </span>
                        <span>
                          <strong>{warehouse.name}</strong>
                          <small>ID · {warehouse.id}</small>
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className="mono">{warehouse.code}</span>
                    </td>
                    <td>
                      {warehouse.capacity.toLocaleString()}{' '}
                      <span className="subtle">units</span>
                    </td>
                    <td>
                      <span
                        className={`status-pill ${
                          warehouse.isActive
                            ? 'status-active'
                            : 'status-inactive'
                        }`}
                      >
                        <i />
                        {warehouse.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      <div className="row-actions">
                        <button
                          className="icon-button"
                          aria-label={`Edit ${warehouse.name}`}
                          onClick={() => setEditing(warehouse)}
                        >
                          <Icon name="edit" size={16} />
                        </button>
                        <button
                          className="icon-button row-delete"
                          aria-label={`Delete ${warehouse.name}`}
                          onClick={() => void remove(warehouse)}
                        >
                          <Icon name="trash" size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : !resource.loading && !resource.error ? (
          <EmptyState
            title={search ? 'No matches found' : 'No warehouses yet'}
            detail={
              search
                ? 'Try another search term.'
                : 'Add a warehouse or import a CSV file to get started.'
            }
          />
        ) : null}
      </div>

      {editing && (
        <ActionDialog
          key={editing.id}
          kind="warehouse"
          existing={editing}
          onClose={() => setEditing(null)}
          onSaved={(message) => {
            setEditing(null)
            onToast(message)
            resource.reload()
          }}
        />
      )}
    </>
  )
}
  

function InventoryPage({ onAction }: { onAction: (kind: ModalKind) => void }) {
  const resource = useInventory()
  const products = useProducts()
  const warehouses = useWarehouses()
  const [search, setSearch] = useState('')
  const [warehouseFilter, setWarehouseFilter] = useState('')
  const productsById = new Map(products.data.map((product) => [product.id, product]))
  const warehousesById = new Map(warehouses.data.map((warehouse) => [warehouse.id, warehouse]))
  const filtered = resource.data.filter((item) => {
    const product = productsById.get(item.product_id)
    const warehouse = warehousesById.get(item.warehouse_id)
    const textMatch = `${product?.name ?? item.product_name ?? ''} ${product?.sku ?? item.product_sku ?? ''} ${warehouse?.name ?? item.warehouse_name ?? item.warehouse_code ?? ''}`.toLowerCase().includes(search.toLowerCase())
    return textMatch && (!warehouseFilter || item.warehouse_id === Number(warehouseFilter))
  })
  return <>
    <PageHeading eyebrow="STOCK, EVERYWHERE" title="Inventory." description="See what you have and where it is, all in one place." action={<><Button variant="secondary" icon="arrow" onClick={() => onAction('transfer')}>Transfer</Button><Button icon="plus" onClick={() => onAction('adjust')}>Adjust stock</Button></>} />
    <StateMessage loading={resource.loading || products.loading || warehouses.loading} error={resource.error || products.error || warehouses.error} onRetry={() => { resource.reload(); products.reload(); warehouses.reload() }} />
    <div className="table-card"><div className="table-toolbar"><div className="table-count"><strong>Stock by location</strong><span>{resource.data.length} stock positions</span></div><div className="table-filters"><SearchField value={search} onChange={setSearch} placeholder="Search inventory…" /><select className="filter-select" value={warehouseFilter} onChange={(event) => setWarehouseFilter(event.target.value)}><option value="">All warehouses</option>{warehouses.data.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></div></div>
      {filtered.length ? <div className="table-scroll"><table><thead><tr><th>PRODUCT</th><th>WAREHOUSE</th><th>BIN</th><th>QUANTITY</th><th>STATUS</th></tr></thead><tbody>{filtered.map((item, index) => { const product = productsById.get(item.product_id); const warehouse = warehousesById.get(item.warehouse_id); const isLow = item.low_stock ?? item.quantity <= (item.reorder_level ?? product?.reorder_level ?? 0); return <tr key={`${item.product_id}-${item.warehouse_id}`}><td><div className="table-product"><span className={`product-thumb thumb-${index % 4 + 1}`}>{(product?.name ?? item.product_name ?? 'P').slice(0, 1).toUpperCase()}</span><span><strong>{product?.name ?? item.product_name ?? `Product #${item.product_id}`}</strong><small>{product?.sku ?? item.product_sku ?? 'SKU unavailable'}</small></span></div></td><td>{warehouse?.name ?? item.warehouse_name ?? item.warehouse_code ?? `Location ${item.warehouse_id}`}</td><td><span className="mono">{item.bin ?? '—'}</span></td><td><strong className="quantity-value">{item.quantity.toLocaleString()}</strong><span className="subtle"> units</span></td><td><span className={`status-pill ${isLow ? 'status-low' : 'status-good'}`}><i />{isLow ? 'Low stock' : 'In stock'}</span></td></tr> })}</tbody></table></div> : !resource.loading && !resource.error ? <EmptyState title="No stock to show" detail="Stock positions will appear here once inventory is recorded." /> : null}
    </div>
  </>
}

function LowStockPage({ onAction }: { onAction: (kind: ModalKind) => void }) {
  const resource = useLowStock()
  const products = useProducts()
  const warehouses = useWarehouses()
  const productsById = new Map(products.data.map((product) => [product.id, product]))
  const warehousesById = new Map(warehouses.data.map((warehouse) => [warehouse.id, warehouse]))
  return <>
    <PageHeading eyebrow="A LITTLE HEADS-UP" title="Low stock." description="A few items could use a little attention before they run out." action={<Button icon="plus" onClick={() => onAction('adjust')}>Restock inventory</Button>} />
    <StateMessage loading={resource.loading || products.loading || warehouses.loading} error={resource.error || products.error || warehouses.error} onRetry={() => { resource.reload(); products.reload(); warehouses.reload() }} />
    <div className="notice-strip"><span className="notice-icon"><Icon name="alert" size={18} /></span><span>Items at or below their product reorder level appear here.</span><span className="notice-count">{resource.data.length} NEED ATTENTION</span></div>
    <div className="table-card"><div className="table-toolbar"><div className="table-count"><strong>Restock list</strong><span>Sorted by urgency</span></div></div>
      {resource.data.length ? <div className="table-scroll"><table><thead><tr><th>PRODUCT</th><th>LOCATION</th><th>ON HAND</th><th>REORDER POINT</th><th>TO REORDER</th></tr></thead><tbody>{resource.data.map((item, index) => { const product = productsById.get(item.product_id); const reorderLevel = item.reorder_level ?? product?.reorder_level; const deficit = Math.max(0, (reorderLevel ?? 0) - item.quantity); return <tr key={`${item.product_id}-${item.warehouse_id}`}><td><div className="table-product"><span className={`product-thumb thumb-${index % 4 + 1}`}>{(product?.name ?? item.product_name ?? 'P').slice(0, 1).toUpperCase()}</span><span><strong>{product?.name ?? item.product_name ?? `Product #${item.product_id}`}</strong><small>{product?.sku ?? item.product_sku ?? 'SKU unavailable'}</small></span></div></td><td>{warehousesById.get(item.warehouse_id)?.name ?? item.warehouse_name ?? item.warehouse_code ?? `Location ${item.warehouse_id}`}</td><td><strong className="stock-danger">{item.quantity}</strong> <span className="subtle">units</span></td><td>{reorderLevel ?? '—'} <span className="subtle">units</span></td><td><span className="reorder-pill">+{reorderLevel === undefined ? '—' : deficit} units</span></td></tr>})}</tbody></table></div> : !resource.loading && !resource.error ? <EmptyState title="Nothing needs restocking" detail="Nice work. Your inventory is above its reorder points." /> : null}
    </div>
  </>
}

function CustomersPage({ onAction, onToast }: { onAction: (kind: ModalKind) => void; onToast: (message: string) => void }) {
  const resource = useCustomers()
  const [search, setSearch] = useState('')
  const filtered = resource.data.filter((customer) => `${customer.name} ${customer.email}`.toLowerCase().includes(search.toLowerCase()))
  return <>
    <PageHeading eyebrow="PEOPLE YOU WORK WITH" title="Customers." description="Your customers, ready when it's time to get an order moving." action={<Button icon="plus" onClick={() => onAction('customer')}>Add customer</Button>} />
    <StateMessage loading={resource.loading} error={resource.error} onRetry={resource.reload} />
    <div className="table-card"><div className="table-toolbar"><div className="table-count"><strong>Customer book</strong><span>{resource.data.length} customers</span></div><SearchField value={search} onChange={setSearch} placeholder="Search customers…" /></div>
      {filtered.length ? <div className="table-scroll"><table><thead><tr><th>CUSTOMER</th><th>EMAIL</th><th>CUSTOMER ID</th><th /></tr></thead><tbody>{filtered.map((customer, index) => <tr key={customer.id}><td><div className="table-product"><span className={`customer-avatar avatar-${index % 4 + 1}`}>{customer.name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()}</span><span><strong>{customer.name}</strong><small>Customer since joining</small></span></div></td><td>{customer.email}</td><td><span className="mono">CUS-{String(customer.id).padStart(4, '0')}</span></td><td><Button variant="text" onClick={() => onToast(`${customer.name} · ${customer.email}`)}>View details <Icon name="arrow" size={14} /></Button></td></tr>)}</tbody></table></div> : !resource.loading && !resource.error ? <EmptyState title="No customers yet" detail="Add a customer here or while creating an order." /> : null}
    </div>
  </>
}

function OrdersPage({ onAction, onToast }: { onAction: (kind: ModalKind) => void; onToast: (message: string) => void }) {
  const resource = useOrders()
  const customers = useCustomers()
  const [filter, setFilter] = useState('all')
  const filtered = resource.data.filter((order) => filter === 'all' || order.status === filter)
  const cancel = async (order: Order) => {
    if (!window.confirm(`Cancel order #${order.id}?`)) return
    try { await api.orders.cancel(order.id); onToast('Order cancelled'); resource.reload() }
    catch (error) { onToast(error instanceof Error ? error.message : 'Could not cancel order') }
  }
  return <>
    <PageHeading eyebrow="FROM CART TO CUSTOMER" title="Orders." description="A steady pulse on every order, from placed to packed." action={<Button icon="plus" onClick={() => onAction('order')}>Create order</Button>} />
    <StateMessage loading={resource.loading || customers.loading} error={resource.error || customers.error} onRetry={() => { resource.reload(); customers.reload() }} />
    <div className="table-card"><div className="table-toolbar"><div className="table-count"><strong>Order desk</strong><span>{resource.data.length} orders</span></div><div className="table-filters"><div className="segmented-control">{[['all', 'All'], ['PENDING', 'Pending'], ['CONFIRMED', 'Confirmed']].map(([value, label]) => <button key={value} className={filter === value ? 'segment-active' : ''} onClick={() => setFilter(value)}>{label}</button>)}</div></div></div>
      {filtered.length ? <OrderTable orders={filtered} customers={customers.data} onCancel={cancel} /> : !resource.loading && !resource.error ? <EmptyState title="No orders in this view" detail={filter === 'all' ? 'When your first order arrives, it will be right here.' : 'Try switching to another order status.'} /> : null}
    </div>
  </>
}

function OrderTable({ orders, customers, onCancel }: { orders: Order[]; customers: Customer[]; onCancel?: (order: Order) => void }) {
  return <div className="table-scroll"><table><thead><tr><th>ORDER</th><th>CUSTOMER</th><th>ITEMS</th><th>PLACED</th><th>STATUS</th><th /></tr></thead><tbody>{orders.map((order) => { const customer = customers.find((item) => item.id === order.customer_id); return <tr key={order.id}><td><span className="mono order-id">ORD-{String(order.id).padStart(4, '0')}</span></td><td>{customer?.name ?? `Customer #${order.customer_id}`}</td><td>{order.items?.length ?? 0} line items</td><td>{formatDate(order.createdAt ?? order.created_at)}</td><td><span className={`status-pill status-${order.status.toLowerCase()}`}><i />{order.status}</span></td><td>{onCancel && order.status === 'PENDING' && <button className="button button-text button-small" onClick={() => onCancel(order)}>Cancel</button>}</td></tr> })}</tbody></table></div>
}

function formatDate(value?: string) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(date)
}

function MovementsPage() {
  const products = useProducts()
  const warehouses = useWarehouses()
  const [productId, setProductId] = useState('')
  const [warehouseId, setWarehouseId] = useState('')
  const [movements, setMovements] = useState<Movement[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [searched, setSearched] = useState(false)
  const load = async (event: FormEvent) => {
    event.preventDefault()
    if (!productId || !warehouseId) return
    setLoading(true); setError(''); setSearched(true)
    try { setMovements(await api.inventory.movements(Number(productId), Number(warehouseId))) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load movements') }
    finally { setLoading(false) }
  }
  return <>
    <PageHeading eyebrow="EVERY MOVE, ACCOUNTED FOR" title="Movement log." description="A timeline of stock coming in, going out, and moving around." />
    <StateMessage loading={products.loading || warehouses.loading} error={products.error || warehouses.error} onRetry={() => { products.reload(); warehouses.reload() }} />
    <form className="movement-filters panel" onSubmit={load}><label><span>PRODUCT</span><select required value={productId} onChange={(event) => setProductId(event.target.value)}><option value="">Choose a product</option>{products.data.map((product) => <option key={product.id} value={product.id}>{product.name} · {product.sku}</option>)}</select></label><label><span>WAREHOUSE</span><select required value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)}><option value="">Choose a warehouse</option>{warehouses.data.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></label><Button type="submit" icon="search" disabled={loading}>{loading ? 'Loading…' : 'Show movements'}</Button></form>
    {error && <div className="error-banner"><Icon name="alert" /><div><strong>Couldn't load movement history</strong><span>{error}</span></div></div>}
    <div className="table-card"><div className="table-toolbar"><div className="table-count"><strong>Stock history</strong><span>{searched ? `${movements.length} movements` : 'Choose a product and location'}</span></div></div>
      {movements.length ? <div className="table-scroll"><table><thead><tr><th>MOVEMENT ID</th><th>MOVEMENT</th><th>QUANTITY CHANGE</th></tr></thead><tbody>{movements.map((movement) => { const type = movement.type ?? 'Movement'; const quantity = movement.quantity_change ?? 0; return <tr key={movement.id}><td><span className="mono">MOV-{movement.id}</span></td><td><span className={`movement-type movement-${type.toLowerCase()}`}>{type}</span></td><td><strong className={quantity < 0 ? 'stock-danger' : 'stock-positive'}>{quantity > 0 ? '+' : ''}{quantity}</strong> units</td></tr> })}</tbody></table></div> : !loading && !error ? <EmptyState title={searched ? 'No movements found' : 'Start with a location'} detail={searched ? 'There are no recorded movements for this selection.' : 'Choose a product and warehouse to see stock history.'} /> : null}
    </div>
  </>
}

function ActionDialog({ kind, existing, onClose, onSaved }: { kind: ModalKind; existing?: Product | Warehouse; onClose: () => void; onSaved: (message: string) => void }) {
  const products = useProducts()
  const warehouses = useWarehouses()
  const customers = useCustomers()
  const inventory = useInventory()
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [lines, setLines] = useState([{ product_id: '', warehouse_id: '', quantity: '1' }])
  const [values, setValues] = useState<Record<string, string>>(() => existing ? Object.fromEntries(Object.entries(existing).map(([key, value]) => [key, String(value)])) : { isActive: 'true', movementType: 'INBOUND', quantity: '' })
  const title = existing ? `Edit ${kind}` : ({ product: 'Add a product', warehouse: 'Add a warehouse', customer: 'Add a customer', adjust: 'Adjust stock', transfer: 'Transfer stock', order: 'Create an order' } as const)[kind]
  const setValue = (name: string, value: string) => setValues((current) => ({ ...current, [name]: value }))
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setFormError(''); setSaving(true)
    try {
      if (kind === 'product') {
        const data = { sku: values.sku.trim(), name: values.name.trim(), category: values.category.trim(), reorder_level: Number(values.reorder_level) }
        if (existing) await api.products.update(existing.id, data as Omit<Product, 'id'>)
        else await api.products.create(data)
      } else if (kind === 'warehouse') {
        const data = { code: values.code.trim(), name: values.name.trim(), capacity: Number(values.capacity) }
        if (existing) await api.warehouses.update(existing.id, { ...data, isActive: values.isActive === 'true' })
        else await api.warehouses.create(data)
      } else if (kind === 'customer') {
        await api.customers.create({ name: values.name.trim(), email: values.email.trim() })
      } else if (kind === 'adjust') {
        const quantity = Number(values.quantity)
        const movementType = values.movementType
        if (!Number.isFinite(quantity) || quantity === 0) throw new Error('Quantity cannot be zero.')
        if (movementType === 'OUTBOUND' && quantity > 0) throw new Error('Outbound quantity must be negative.')
        if (movementType === 'INBOUND' && quantity < 0) throw new Error('Inbound quantity must be positive.')
        if (inventory.loading) throw new Error('Inventory is still loading. Please try again in a moment.')
        if (inventory.error) throw new Error(`Unable to verify current stock: ${inventory.error}`)
        const currentStock = inventory.data.find((item) => item.product_id === Number(values.product_id) && item.warehouse_id === Number(values.warehouse_id))?.quantity ?? 0
        if (movementType === 'OUTBOUND' && Math.abs(quantity) > currentStock) throw new Error(`Only ${currentStock} units are available at this warehouse.`)
        await api.inventory.adjust({ product_id: Number(values.product_id), warehouse_id: Number(values.warehouse_id), quantity, movementType })
      } else if (kind === 'transfer') {
        const quantity = Number(values.quantity)
        if (Number(values.from_warehouse_id) === Number(values.to_warehouse_id)) throw new Error('Choose two different warehouses.')
        if (quantity <= 0) throw new Error('Transfer quantity must be positive.')
        if (inventory.loading) throw new Error('Inventory is still loading. Please try again in a moment.')
        if (inventory.error) throw new Error(`Unable to verify current stock: ${inventory.error}`)
        const available = inventory.data.find((item) => item.product_id === Number(values.product_id) && item.warehouse_id === Number(values.from_warehouse_id))?.quantity ?? 0
        if (quantity > available) throw new Error(`Only ${available} units are available to transfer.`)
        await api.inventory.transfer({ product_id: Number(values.product_id), from_warehouse_id: Number(values.from_warehouse_id), to_warehouse_id: Number(values.to_warehouse_id), quantity })
      } else {
        if (lines.some((line) => !line.product_id || !line.warehouse_id || Number(line.quantity) <= 0)) throw new Error('Complete each order line with a positive quantity.')
        await api.orders.create({ customer_id: Number(values.customer_id), items: lines.map((line) => ({ product_id: Number(line.product_id), warehouse_id: Number(line.warehouse_id), quantity: Number(line.quantity) })) })
      }
      onSaved(existing ? `${kind[0].toUpperCase()}${kind.slice(1)} updated` : `${kind[0].toUpperCase()}${kind.slice(1)} saved`)
    } catch (cause) { setFormError(cause instanceof Error ? cause.message : 'Unable to save changes') }
    finally { setSaving(false) }
  }
  const field = (label: string, name: string, type = 'text', required = true, min?: number) => <label className="form-field"><span>{label}</span><input type={type} required={required} min={min} value={values[name] ?? ''} onChange={(event) => setValue(name, event.target.value)} /></label>
  const select = (label: string, name: string, options: Array<[string, string]>, placeholder: string) => <label className="form-field"><span>{label}</span><select required value={values[name] ?? ''} onChange={(event) => setValue(name, event.target.value)}><option value="">{placeholder}</option>{options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-heading"><div><div className="eyebrow">APEXSTOCK / {kind.toUpperCase()}</div><h2 id="modal-title">{title}</h2></div><button className="icon-button" onClick={onClose} aria-label="Close dialog"><Icon name="close" /></button></div>
    <form onSubmit={submit}><div className="modal-fields">
      {kind === 'product' && <>{field('PRODUCT NAME', 'name')}{field('SKU', 'sku')}{field('CATEGORY', 'category')}{field('REORDER LEVEL', 'reorder_level', 'number', true, 0)}</>}
      {kind === 'warehouse' && <>{field('WAREHOUSE NAME', 'name')}{field('LOCATION CODE', 'code')}{field('CAPACITY (UNITS)', 'capacity', 'number', true, 0)}{existing && select('STATUS', 'isActive', [['true', 'Active'], ['false', 'Inactive']], 'Choose status')}</>}
      {kind === 'customer' && <>{field('CUSTOMER NAME', 'name')}{field('EMAIL ADDRESS', 'email', 'email')}</>}
      {kind === 'adjust' && <>{select('PRODUCT', 'product_id', products.data.map((product): [string, string] => [String(product.id), `${product.name} · ${product.sku}`]), 'Choose a product')}{select('WAREHOUSE', 'warehouse_id', warehouses.data.map((warehouse): [string, string] => [String(warehouse.id), warehouse.name]), 'Choose a warehouse')}{select('MOVEMENT TYPE', 'movementType', [['INBOUND', 'Inbound — stock coming in'], ['OUTBOUND', 'Outbound — stock going out'], ['ADJUSTMENT', 'Adjustment — set a correction']], 'Choose a movement')}{field('QUANTITY (use a negative number for outbound)', 'quantity', 'number', true)}</>}
      {kind === 'transfer' && <>{select('PRODUCT', 'product_id', products.data.map((product): [string, string] => [String(product.id), `${product.name} · ${product.sku}`]), 'Choose a product')}{select('FROM WAREHOUSE', 'from_warehouse_id', warehouses.data.map((warehouse): [string, string] => [String(warehouse.id), warehouse.name]), 'Choose source')}{select('TO WAREHOUSE', 'to_warehouse_id', warehouses.data.map((warehouse): [string, string] => [String(warehouse.id), warehouse.name]), 'Choose destination')}{field('QUANTITY TO MOVE', 'quantity', 'number', true, 1)}</>}
      {kind === 'order' && <>{select('CUSTOMER', 'customer_id', customers.data.map((customer): [string, string] => [String(customer.id), customer.name]), 'Choose a customer')}<div className="order-lines-label"><span>ORDER ITEMS</span><button type="button" className="inline-link" onClick={() => setLines((current) => [...current, { product_id: '', warehouse_id: '', quantity: '1' }])}><Icon name="plus" size={14} /> Add item</button></div>{lines.map((line, index) => <div className="order-line" key={index}><select aria-label={`Product ${index + 1}`} required value={line.product_id} onChange={(event) => setLines((current) => current.map((entry, row) => row === index ? { ...entry, product_id: event.target.value } : entry))}><option value="">Product</option>{products.data.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select><select aria-label={`Warehouse ${index + 1}`} required value={line.warehouse_id} onChange={(event) => setLines((current) => current.map((entry, row) => row === index ? { ...entry, warehouse_id: event.target.value } : entry))}><option value="">Warehouse</option>{warehouses.data.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select><input aria-label={`Quantity ${index + 1}`} type="number" min="1" required value={line.quantity} onChange={(event) => setLines((current) => current.map((entry, row) => row === index ? { ...entry, quantity: event.target.value } : entry))} />{lines.length > 1 && <button type="button" className="icon-button row-delete" aria-label="Remove line item" onClick={() => setLines((current) => current.filter((_, row) => row !== index))}><Icon name="close" size={15} /></button>}</div>)}</>}
    </div>{formError && <div className="form-error"><Icon name="alert" size={16} />{formError}</div>}<div className="modal-actions"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? 'Saving…' : existing ? 'Save changes' : kind === 'order' ? 'Place order' : kind === 'adjust' ? 'Record adjustment' : kind === 'transfer' ? 'Transfer stock' : `Create ${kind}`} <Icon name="arrow" size={15} /></Button></div></form>
  </section></div>
}

export default function App() {
  return <ThemeProvider><BrowserRouter><AuthProvider><AppShell /></AuthProvider></BrowserRouter></ThemeProvider>
}

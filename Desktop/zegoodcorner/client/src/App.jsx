import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, NavLink, Route, Routes, useNavigate } from 'react-router-dom'
import HomePage from './pages/HomePage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import CreateListingPage from './pages/CreateListingPage'
import AdminPage from './pages/AdminPage'
import MyListingsPage from './pages/MyListingsPage'
import MyFavoritesPage from './pages/MyFavoritesPage'
import ListingDetailsPage from './pages/ListingDetailsPage'
import DiscussionPage from './pages/DiscussionPage'
import UserListingsPage from './pages/UserListingsPage'
import InvoicePage from './pages/InvoicePage'
import AccountSettingsModal from './components/AccountSettingsModal'
import SellerGuideModal from './components/SellerGuideModal'

const SESSION_USER_KEY = 'zegoodcorner_user'
const PENDING_BECOME_SELLER_KEY = 'zegoodcorner_pending_become_seller'

function App() {
  const navigate = useNavigate()
  const apiBaseUrl = useMemo(
    () => import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000',
    [],
  )
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const savedUser = localStorage.getItem(SESSION_USER_KEY)
      if (!savedUser) {
        return null
      }

      const parsedUser = JSON.parse(savedUser)
      return {
        ...parsedUser,
        isBanned: Boolean(parsedUser?.isBanned),
        stripeChargesEnabled: Boolean(parsedUser?.stripeChargesEnabled),
        stripeDetailsSubmitted: Boolean(parsedUser?.stripeDetailsSubmitted),
        stripePayoutsEnabled: Boolean(parsedUser?.stripePayoutsEnabled),
      }
    } catch (_error) {
      return null
    }
  })
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false)
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false)
  const [isSellerGuideOpen, setIsSellerGuideOpen] = useState(false)
  const [flashMessage, setFlashMessage] = useState('')
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0)
  const profileMenuRef = useRef(null)

  const isSeller =
    currentUser?.role === 'vendeur' || currentUser?.role === 'admin'
  const canCreateListing =
    currentUser?.role === 'admin' ||
    (currentUser?.role === 'vendeur' && Boolean(currentUser?.stripeChargesEnabled))

  const handleAuthenticated = (user) => {
    const normalizedUser = {
      ...user,
      isBanned: Boolean(user?.isBanned),
      stripeChargesEnabled: Boolean(user?.stripeChargesEnabled),
      stripeDetailsSubmitted: Boolean(user?.stripeDetailsSubmitted),
      stripePayoutsEnabled: Boolean(user?.stripePayoutsEnabled),
    }

    setCurrentUser(normalizedUser)
    localStorage.setItem(SESSION_USER_KEY, JSON.stringify(normalizedUser))
    setIsProfileMenuOpen(false)
  }

  const handleLogout = () => {
    setCurrentUser(null)
    setUnreadMessagesCount(0)
    localStorage.removeItem(SESSION_USER_KEY)
    localStorage.removeItem(PENDING_BECOME_SELLER_KEY)
    setIsProfileMenuOpen(false)
    setIsSettingsModalOpen(false)
    setIsSellerGuideOpen(false)
    navigate('/')
  }

  const handleSellerActivated = (updatedUser) => {
    handleAuthenticated(updatedUser)
    setFlashMessage('Félicitations, tu peux maintenant vendre sur ZeGoodCorner.')
  }

  const handleOpenCreateListing = () => {
    navigate('/creer-annonce')
    setIsProfileMenuOpen(false)
  }

  const handleStripeOnboarding = async () => {
    if (!currentUser?.id) {
      return
    }

    try {
      const response = await fetch(`${apiBaseUrl}/api/stripe/connect/onboarding-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.id }),
      })

      if (!response.ok) {
        return
      }

      const data = await response.json()

      if (data?.user) {
        handleAuthenticated(data.user)
      }

      const onboardingUrl = String(data?.onboardingUrl || '').trim()

      if (onboardingUrl) {
        window.location.href = onboardingUrl
      }
    } catch (_error) {}
  }

  const handleOpenSellerGuide = () => {
    setIsSellerGuideOpen(true)
  }

  const handleStartBecomeSeller = async () => {
    if (currentUser?.stripeAccountId) {
      setIsSellerGuideOpen(true)
      return
    }

    localStorage.setItem(PENDING_BECOME_SELLER_KEY, '1')
    await handleStripeOnboarding()
  }

  useEffect(() => {
    if (!currentUser?.id) {
      return undefined
    }

    let isMounted = true

    const syncSessionStatus = async () => {
      try {
        const response = await fetch(
          `${apiBaseUrl}/api/auth/session?userId=${currentUser.id}`,
        )

        if (!response.ok) {
          if (response.status === 404) {
            if (isMounted) {
              setCurrentUser(null)
              localStorage.removeItem(SESSION_USER_KEY)
              navigate('/')
            }
          }

          return
        }

        const data = await response.json()

        if (!isMounted) {
          return
        }

        const updatedUser = {
          ...currentUser,
          displayName: data.displayName,
          role: data.role,
          isBanned: Boolean(data.isBanned),
          stripeAccountId: data.stripeAccountId || null,
          stripeChargesEnabled: Boolean(data.stripeChargesEnabled),
          stripeDetailsSubmitted: Boolean(data.stripeDetailsSubmitted),
          stripePayoutsEnabled: Boolean(data.stripePayoutsEnabled),
        }

        setCurrentUser(updatedUser)
        localStorage.setItem(SESSION_USER_KEY, JSON.stringify(updatedUser))
      } catch (_error) {}
    }

    syncSessionStatus()
    const intervalId = window.setInterval(syncSessionStatus, 30000)

    return () => {
      isMounted = false
      window.clearInterval(intervalId)
    }
  }, [apiBaseUrl, currentUser?.id, navigate])

  useEffect(() => {
    if (!currentUser?.id) {
      setUnreadMessagesCount(0)
      return undefined
    }

    let isMounted = true

    const syncUnreadCount = async () => {
      try {
        const response = await fetch(
          `${apiBaseUrl}/api/messages/unread-count?userId=${currentUser.id}`,
        )

        if (!response.ok || !isMounted) {
          return
        }

        const data = await response.json()
        setUnreadMessagesCount(Number(data?.unreadCount || 0))
      } catch (_error) {}
    }

    syncUnreadCount()
    const intervalId = window.setInterval(syncUnreadCount, 6000)

    return () => {
      isMounted = false
      window.clearInterval(intervalId)
    }
  }, [apiBaseUrl, currentUser?.id])

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (
        isProfileMenuOpen &&
        profileMenuRef.current &&
        !profileMenuRef.current.contains(event.target)
      ) {
        setIsProfileMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handleOutsideClick)

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
    }
  }, [isProfileMenuOpen])

  useEffect(() => {
    if (localStorage.getItem(PENDING_BECOME_SELLER_KEY) === '1' && currentUser?.stripeAccountId) {
      setIsSellerGuideOpen(true)
      localStorage.removeItem(PENDING_BECOME_SELLER_KEY)
    }
  }, [currentUser?.stripeAccountId])

  useEffect(() => {
    if (!currentUser?.id) {
      return undefined
    }

    const stripeState = new URLSearchParams(window.location.search).get('stripe')
    const shouldRefreshAfterStripe =
      stripeState === 'onboarding_return' || stripeState === 'onboarding_refresh'

    if (!shouldRefreshAfterStripe) {
      return undefined
    }

    let isMounted = true

    const refreshAfterStripe = async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/api/auth/session?userId=${currentUser.id}`)

        if (!response.ok || !isMounted) {
          return
        }

        const data = await response.json()
        handleAuthenticated(data)

        if (
          localStorage.getItem(PENDING_BECOME_SELLER_KEY) === '1' &&
          data?.stripeAccountId
        ) {
          setIsSellerGuideOpen(true)
          localStorage.removeItem(PENDING_BECOME_SELLER_KEY)
        }
      } catch (_error) {
      } finally {
        const cleanedUrl = `${window.location.pathname}${window.location.hash || ''}`
        window.history.replaceState({}, document.title, cleanedUrl)
      }
    }

    refreshAfterStripe()

    return () => {
      isMounted = false
    }
  }, [apiBaseUrl, currentUser?.id])

  if (currentUser?.isBanned) {
    return (
      <main className="ban-screen" role="alert" aria-live="assertive">
        <section className="ban-message-card">
          <h1>COMPTE BANNI</h1>
          <p>
            Vous avez violé les règles et conditions d’utilisation de ZeGoodCorner.
          </p>
          <p>
            Votre accès est bloqué et vous ne pouvez plus consulter la plateforme.
          </p>
          <div className="ban-actions">
            <button
              type="button"
              className="button-secondary"
              onClick={handleLogout}
            >
              Se déconnecter
            </button>
          </div>
        </section>
      </main>
    )
  }

  return (
    <div className="app-shell">
      <header className="main-header">
        <Link className="brand" to="/">
          ZeGoodCorner
        </Link>
        <nav className="header-actions" aria-label="Actions utilisateur">
          {!currentUser && (
            <>
              <NavLink to="/connexion" className="button-secondary nav-link">
                Se connecter
              </NavLink>
              <NavLink to="/inscription" className="button-primary nav-link">
                Créer un compte
              </NavLink>
            </>
          )}

          {currentUser && (
            <>
              <span className="greeting">Bonjour, {currentUser.displayName}</span>
              <NavLink to="/discussion" className="button-secondary nav-link discussion-link">
                Discussion
                {unreadMessagesCount > 0 && (
                  <span className="discussion-badge" aria-label={`${unreadMessagesCount} messages non lus`}>
                    {unreadMessagesCount > 99 ? '99+' : unreadMessagesCount}
                  </span>
                )}
              </NavLink>
              <div className="profile-menu-wrapper" ref={profileMenuRef}>
                {isSeller && canCreateListing && (
                  <button
                    type="button"
                    className="button-primary"
                    onClick={handleOpenCreateListing}
                  >
                    Créer une annonce
                  </button>
                )}

                {isSeller && !canCreateListing && (
                  <button
                    type="button"
                    className="button-primary"
                    onClick={handleStripeOnboarding}
                  >
                    {currentUser?.stripeAccountId
                      ? 'Finaliser paiements Stripe'
                      : 'Lier mon compte Stripe'}
                  </button>
                )}

              <button
                type="button"
                className="button-secondary profile-toggle"
                onClick={() => setIsProfileMenuOpen((value) => !value)}
              >
                Profil ▾
              </button>

              {isProfileMenuOpen && (
                <div className="profile-dropdown" role="menu">
                  <button
                    type="button"
                    className="dropdown-item"
                    onClick={() => {
                      setIsSettingsModalOpen(true)
                      setIsProfileMenuOpen(false)
                    }}
                  >
                    Paramètres
                  </button>

                  <button
                    type="button"
                    className="dropdown-item"
                    onClick={() => {
                      navigate('/mes-annonces')
                      setIsProfileMenuOpen(false)
                    }}
                  >
                    Mes annonces
                  </button>

                  <button
                    type="button"
                    className="dropdown-item"
                    onClick={() => {
                      navigate('/mes-favoris')
                      setIsProfileMenuOpen(false)
                    }}
                  >
                    Mes favoris
                  </button>

                  {!isSeller && (
                    <button
                      type="button"
                      className="dropdown-item"
                      onClick={() => {
                        handleStartBecomeSeller()
                        setIsProfileMenuOpen(false)
                      }}
                    >
                      Devenir vendeur
                    </button>
                  )}

                  {isSeller && !canCreateListing && (
                    <button
                      type="button"
                      className="dropdown-item"
                      onClick={() => {
                        setIsProfileMenuOpen(false)
                        handleStripeOnboarding()
                      }}
                    >
                      {currentUser?.stripeAccountId
                        ? 'Finaliser paiements Stripe'
                        : 'Lier mon compte Stripe'}
                    </button>
                  )}

                  {currentUser?.role === 'admin' && (
                    <button
                      type="button"
                      className="dropdown-item admin-item"
                      onClick={() => {
                        navigate('/admin')
                        setIsProfileMenuOpen(false)
                      }}
                    >
                      👁️ Panneau admin
                    </button>
                  )}

                  <button
                    type="button"
                    className="dropdown-item danger-item"
                    onClick={handleLogout}
                  >
                    Se déconnecter
                  </button>
                </div>
              )}
            </div>
            </>
          )}
        </nav>
      </header>

      {flashMessage && <p className="flash-message">{flashMessage}</p>}

      <main className="main-content">
        <Routes>
          <Route
            path="/"
            element={
              <HomePage
                apiBaseUrl={apiBaseUrl}
                currentUser={currentUser}
              />
            }
          />
          <Route
            path="/creer-annonce"
            element={
              currentUser && isSeller && canCreateListing ? (
                <CreateListingPage
                  apiBaseUrl={apiBaseUrl}
                  currentUser={currentUser}
                />
              ) : (
                <Navigate to="/" replace />
              )
            }
          />
          <Route
            path="/mes-annonces"
            element={
              currentUser ? (
                <MyListingsPage
                  apiBaseUrl={apiBaseUrl}
                  currentUser={currentUser}
                />
              ) : (
                <Navigate to="/connexion" replace />
              )
            }
          />
          <Route
            path="/annonce/:listingId"
            element={
              <ListingDetailsPage
                apiBaseUrl={apiBaseUrl}
                currentUser={currentUser}
              />
            }
          />
          <Route
            path="/utilisateur/:userId/annonces"
            element={<UserListingsPage apiBaseUrl={apiBaseUrl} />}
          />
          <Route
            path="/facture/:transactionId"
            element={
              <InvoicePage
                apiBaseUrl={apiBaseUrl}
                currentUser={currentUser}
              />
            }
          />
          <Route
            path="/mes-favoris"
            element={
              currentUser ? (
                <MyFavoritesPage
                  apiBaseUrl={apiBaseUrl}
                  currentUser={currentUser}
                />
              ) : (
                <Navigate to="/connexion" replace />
              )
            }
          />
          <Route
            path="/discussion"
            element={
              currentUser ? (
                <DiscussionPage
                  apiBaseUrl={apiBaseUrl}
                  currentUser={currentUser}
                  onUnreadCountChange={setUnreadMessagesCount}
                />
              ) : (
                <Navigate to="/connexion" replace />
              )
            }
          />
          <Route
            path="/admin"
            element={
              currentUser?.role === 'admin' ? (
                <AdminPage
                  apiBaseUrl={apiBaseUrl}
                  currentUser={currentUser}
                />
              ) : (
                <Navigate to="/" replace />
              )
            }
          />
          <Route
            path="/connexion"
            element={
              currentUser ? (
                <Navigate to="/" replace />
              ) : (
                <LoginPage
                  apiBaseUrl={apiBaseUrl}
                  onAuthenticated={handleAuthenticated}
                />
              )
            }
          />
          <Route
            path="/inscription"
            element={
              currentUser ? (
                <Navigate to="/" replace />
              ) : (
                <RegisterPage
                  apiBaseUrl={apiBaseUrl}
                  onAuthenticated={handleAuthenticated}
                />
              )
            }
          />
        </Routes>
      </main>

      {isSettingsModalOpen && currentUser && (
        <AccountSettingsModal
          apiBaseUrl={apiBaseUrl}
          currentUser={currentUser}
          onClose={() => setIsSettingsModalOpen(false)}
          onAccountDeleted={handleLogout}
          onUserUpdated={handleAuthenticated}
        />
      )}

      {isSellerGuideOpen && currentUser && (
        <SellerGuideModal
          apiBaseUrl={apiBaseUrl}
          currentUser={currentUser}
          onClose={() => setIsSellerGuideOpen(false)}
          onAccepted={(updatedUser) => {
            handleSellerActivated(updatedUser)
            setIsSellerGuideOpen(false)
          }}
        />
      )}
    </div>
  )
}

export default App

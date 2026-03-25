import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getApiErrorMessage } from '../utils/apiError'

function MyFavoritesPage({ apiBaseUrl, currentUser }) {
  const [favorites, setFavorites] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [processingListingId, setProcessingListingId] = useState(null)

  const loadFavorites = async () => {
    try {
      setIsLoading(true)
      setError('')

      const response = await fetch(
        `${apiBaseUrl}/api/favorites?userId=${currentUser.id}`,
      )

      if (!response.ok) {
        const message = await getApiErrorMessage(
          response,
          'Impossible de charger tes favoris pour le moment.',
        )
        throw new Error(message)
      }

      const data = await response.json()
      setFavorites(Array.isArray(data) ? data : [])
    } catch (fetchError) {
      setError(fetchError.message)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadFavorites()
  }, [apiBaseUrl, currentUser.id])

  const getListingImage = (listing) => {
    try {
      const parsed = JSON.parse(listing.images_json || '[]')
      if (!Array.isArray(parsed) || parsed.length === 0) {
        return ''
      }

      return parsed[0] || ''
    } catch (_error) {
      return ''
    }
  }

  const handleRemoveFavorite = async (listingId) => {
    try {
      setProcessingListingId(listingId)
      setError('')

      const response = await fetch(`${apiBaseUrl}/api/favorites/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUser.id,
          listingId,
        }),
      })

      if (!response.ok) {
        const message = await getApiErrorMessage(
          response,
          'Impossible de mettre à jour tes favoris pour le moment.',
        )
        throw new Error(message)
      }

      setFavorites((currentFavorites) =>
        currentFavorites.filter((favorite) => Number(favorite.id) !== Number(listingId)),
      )
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setProcessingListingId(null)
    }
  }

  return (
    <section className="favorites-page">
      <header className="favorites-header">
        <h1>Mes favoris</h1>
        <Link className="button-secondary" to="/">
          Retour aux annonces
        </Link>
      </header>

      {isLoading && <p>Chargement des favoris...</p>}
      {!isLoading && error && <p className="error-message">{error}</p>}

      {!isLoading && !error && favorites.length === 0 && (
        <div className="empty-state">
          <p>Tu n’as pas encore d’annonces en favori.</p>
        </div>
      )}

      {!isLoading && !error && favorites.length > 0 && (
        <ul className="listing-grid">
          {favorites.map((favorite) => {
            const imageUrl = getListingImage(favorite)

            return (
              <li className="listing-card" key={favorite.id}>
                <Link className="listing-card-link" to={`/annonce/${favorite.id}`}>
                  <div className="listing-media">
                    {imageUrl ? (
                      <img
                        src={imageUrl}
                        alt={`Photo de ${favorite.title}`}
                        className="listing-main-image"
                      />
                    ) : (
                      <div className="listing-image-placeholder">Aucune photo</div>
                    )}
                  </div>

                  <div className="listing-content">
                    <h2>{favorite.title}</h2>
                    <p>{favorite.description}</p>
                    <p className="meta">
                      {Number(favorite.price_eur).toFixed(2)} € • {favorite.city}
                    </p>
                  </div>
                </Link>

                <div className="listing-contact-row">
                  <button
                    type="button"
                    className="button-secondary"
                    onClick={() => handleRemoveFavorite(favorite.id)}
                    disabled={processingListingId === favorite.id}
                  >
                    {processingListingId === favorite.id
                      ? 'Suppression...'
                      : 'Retirer des favoris'}
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

export default MyFavoritesPage

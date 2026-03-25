import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

function UserListingsPage({ apiBaseUrl }) {
  const { userId } = useParams()
  const [seller, setSeller] = useState(null)
  const [listings, setListings] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  const getListingImages = (listing) => {
    try {
      const parsed = JSON.parse(listing.images_json || '[]')
      return Array.isArray(parsed) ? parsed : []
    } catch (_error) {
      return []
    }
  }

  useEffect(() => {
    const controller = new AbortController()

    const fetchUserListings = async () => {
      try {
        setIsLoading(true)
        setError('')

        const response = await fetch(
          `${apiBaseUrl}/api/listings/by-user/${userId}`,
          { signal: controller.signal },
        )

        if (!response.ok) {
          let message = 'Impossible de charger les annonces de cet utilisateur.'
          try {
            const payload = await response.json()
            message = payload?.message || message
          } catch (_error) {}
          throw new Error(message)
        }

        const data = await response.json()
        setSeller(data?.seller || null)
        setListings(Array.isArray(data?.listings) ? data.listings : [])
      } catch (fetchError) {
        if (fetchError.name !== 'AbortError') {
          setError(fetchError.message)
        }
      } finally {
        setIsLoading(false)
      }
    }

    fetchUserListings()

    return () => {
      controller.abort()
    }
  }, [apiBaseUrl, userId])

  return (
    <section className="latest-listings-wrapper">
      <section className="latest-listings">
        <h1>Annonces de {seller?.displayName || 'cet utilisateur'}</h1>

        {isLoading && <p>Chargement des annonces...</p>}
        {!isLoading && error && <p className="error-message">{error}</p>}

        {!isLoading && !error && listings.length === 0 && (
          <div className="empty-state">
            <p>Aucune annonce disponible pour le moment.</p>
          </div>
        )}

        {!isLoading && !error && listings.length > 0 && (
          <ul className="listing-grid">
            {listings.map((listing) => {
              const listingImage = getListingImages(listing)[0]

              return (
                <li className="listing-card" key={listing.id}>
                  <Link className="listing-card-link" to={`/annonce/${listing.id}`}>
                    <div className="listing-media">
                      {listingImage ? (
                        <img
                          src={listingImage}
                          alt={`Photo de ${listing.title}`}
                          className="listing-main-image"
                        />
                      ) : (
                        <div className="listing-image-placeholder">Aucune photo</div>
                      )}
                    </div>

                    <div className="listing-content">
                      <h2>{listing.title}</h2>
                      <p>{listing.description}</p>
                      <p className="meta">
                        {Number(listing.price_eur).toFixed(2)} € • {listing.city}
                      </p>
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </section>
  )
}

export default UserListingsPage

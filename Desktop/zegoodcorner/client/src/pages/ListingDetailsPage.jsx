import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { getApiErrorMessage } from '../utils/apiError'

function ListingDetailsPage({ apiBaseUrl, currentUser }) {
  const navigate = useNavigate()
  const { listingId } = useParams()
  const [listing, setListing] = useState(null)
  const [images, setImages] = useState([])
  const [selectedImage, setSelectedImage] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [isStartingConversation, setIsStartingConversation] = useState(false)
  const [isPurchaseSubmitting, setIsPurchaseSubmitting] = useState(false)
  const [isFavorite, setIsFavorite] = useState(false)
  const [isFavoriteLoading, setIsFavoriteLoading] = useState(false)

  useEffect(() => {
    const controller = new AbortController()

    const fetchListing = async () => {
      try {
        setIsLoading(true)
        setError('')

        const listingUrl = currentUser?.id
          ? `${apiBaseUrl}/api/listings/${listingId}?userId=${currentUser.id}`
          : `${apiBaseUrl}/api/listings/${listingId}`

        const response = await fetch(listingUrl, { signal: controller.signal })

        if (!response.ok) {
          let message = 'Impossible de charger cette annonce pour le moment.'
          try {
            const payload = await response.json()
            message = payload?.message || message
          } catch (_error) {}
          throw new Error(message)
        }

        const data = await response.json()
        setListing(data)
        setIsFavorite(Boolean(data?.is_favorite))

        let parsedImages = []
        try {
          const parsed = JSON.parse(data.images_json || '[]')
          parsedImages = Array.isArray(parsed) ? parsed : []
        } catch (_error) {}

        setImages(parsedImages)
        setSelectedImage(parsedImages[0] || '')
      } catch (fetchError) {
        if (fetchError.name !== 'AbortError') {
          setError(fetchError.message)
        }
      } finally {
        setIsLoading(false)
      }
    }

    fetchListing()

    return () => {
      controller.abort()
    }
  }, [apiBaseUrl, listingId, currentUser?.id])

  if (isLoading) {
    return (
      <section className="listing-details-page">
        <p>Chargement de l'annonce...</p>
      </section>
    )
  }

  if (error) {
    return (
      <section className="listing-details-page">
        <p className="error-message">{error}</p>
        <Link className="button-secondary" to="/">
          Retour aux annonces
        </Link>
      </section>
    )
  }

  if (!listing) {
    return null
  }

  const categoryLabelMap = {
    voitures: 'Voitures',
    mobiliers: 'Mobiliers',
    divertissement: 'Divertissement',
  }

  const isOwnListing = Number(listing.user_id) === Number(currentUser?.id)
  const isSold = Boolean(listing.is_sold)

  const handleContactSeller = async () => {
    if (!currentUser) {
      navigate('/connexion')
      return
    }

    try {
      setIsStartingConversation(true)
      setError('')

      const response = await fetch(`${apiBaseUrl}/api/messages/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUser.id,
          listingId: listing.id,
        }),
      })

      if (!response.ok) {
        const message = await getApiErrorMessage(
          response,
          'Impossible de démarrer la discussion pour le moment.',
        )
        throw new Error(message)
      }

      const data = await response.json()
      const conversationId = Number(data?.conversationId)

      if (!conversationId) {
        throw new Error('Discussion indisponible pour le moment.')
      }

      navigate(`/discussion?conversationId=${conversationId}`)
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setIsStartingConversation(false)
    }
  }

  const handleToggleFavorite = async () => {
    if (!currentUser?.id || !listing?.id) {
      navigate('/connexion')
      return
    }

    try {
      setIsFavoriteLoading(true)
      setError('')

      const response = await fetch(`${apiBaseUrl}/api/favorites/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUser.id,
          listingId: listing.id,
        }),
      })

      if (!response.ok) {
        const message = await getApiErrorMessage(
          response,
          'Impossible de mettre à jour tes favoris pour le moment.',
        )
        throw new Error(message)
      }

      const data = await response.json()
      setIsFavorite(Boolean(data?.isFavorite))
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setIsFavoriteLoading(false)
    }
  }

  const handleBuyListing = async () => {
    if (!currentUser) {
      navigate('/connexion')
      return
    }

    try {
      setIsPurchaseSubmitting(true)
      setError('')

      const response = await fetch(`${apiBaseUrl}/api/purchases/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUser.id,
          listingId: listing.id,
        }),
      })

      if (!response.ok) {
        const message = await getApiErrorMessage(
          response,
          'Impossible d’envoyer la demande d’achat pour le moment.',
        )
        throw new Error(message)
      }

      const data = await response.json()
      const conversationId = Number(data?.conversationId)

      if (!conversationId) {
        throw new Error('Impossible d’ouvrir la discussion pour le moment.')
      }

      navigate(`/discussion?conversationId=${conversationId}`)
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setIsPurchaseSubmitting(false)
    }
  }

  return (
    <section className="listing-details-page">
      <article className="listing-details-card">
        <div className="listing-details-media">
          {selectedImage ? (
            <img
              src={selectedImage}
              alt={`Photo de ${listing.title}`}
              className="listing-details-main-image"
            />
          ) : (
            <div className="listing-image-placeholder">Aucune photo</div>
          )}

          {images.length > 1 && (
            <div className="listing-details-thumbnails">
              {images.map((image, index) => (
                <button
                  key={`${image}-${index}`}
                  type="button"
                  className={`thumbnail-button ${selectedImage === image ? 'active' : ''}`}
                  onClick={() => setSelectedImage(image)}
                >
                  <img src={image} alt={`Miniature ${index + 1}`} />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="listing-details-content">
          <h1>{listing.title}</h1>
          <p className="details-price">{Number(listing.price_eur).toFixed(2)} €</p>
          <p className="listing-category">
            Catégorie: {categoryLabelMap[listing.category] || 'Divertissement'}
          </p>

          <p className="listing-extra">
            Statut: {isSold ? 'Vendu' : 'Disponible'}
          </p>

          {listing.category === 'voitures' && (
            <p className="listing-extra">
              {listing.mileage_km} km • Modèle {listing.model_year}
            </p>
          )}

          <p className="details-location">{listing.city}</p>
          <p className="details-description">{listing.description}</p>
          <p className="details-seller">Vendu par: {listing.seller_name || 'Utilisateur'}</p>

          <button
            type="button"
            className="button-secondary listing-favorite-button"
            onClick={handleToggleFavorite}
            disabled={isFavoriteLoading}
          >
            {isFavoriteLoading
              ? 'Mise à jour...'
              : isFavorite
                ? 'Retirer des favoris'
                : 'Ajouter aux favoris'}
          </button>

          <button
            type="button"
            className="button-primary listing-contact-button"
            onClick={handleContactSeller}
            disabled={isStartingConversation || isOwnListing || isSold}
          >
            {isOwnListing
              ? 'Votre annonce'
              : isSold
                ? 'Annonce vendue'
              : isStartingConversation
                ? 'Ouverture...'
                : 'Contacter le vendeur'}
          </button>

          {!isOwnListing && !isSold && (
            <button
              type="button"
              className="button-primary listing-contact-button"
              onClick={handleBuyListing}
              disabled={isPurchaseSubmitting}
            >
              {isPurchaseSubmitting ? 'Envoi...' : 'Acheter'}
            </button>
          )}

          <Link className="button-secondary" to="/">
            Retour aux annonces
          </Link>
        </div>
      </article>
    </section>
  )
}

export default ListingDetailsPage

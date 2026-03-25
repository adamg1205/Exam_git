import { useCallback, useEffect, useState } from 'react'

function MyListingsPage({ apiBaseUrl, currentUser }) {
  const [listings, setListings] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [actionMessage, setActionMessage] = useState('')
  const [editingListingId, setEditingListingId] = useState(null)
  const [editForm, setEditForm] = useState({
    title: '',
    description: '',
    priceEur: '',
    city: '',
    category: '',
    deliveryMethod: 'remise_main_propre',
    mileageKm: '',
    modelYear: '',
  })

  const categoryLabelMap = {
    voitures: 'Voitures',
    mobiliers: 'Mobiliers',
    divertissement: 'Divertissement',
  }

  const getListingImages = (listing) => {
    try {
      const parsed = JSON.parse(listing.images_json || '[]')
      return Array.isArray(parsed) ? parsed : []
    } catch (_error) {
      return []
    }
  }

  const fetchMyListings = useCallback(
    async (signal) => {
      try {
        setIsLoading(true)
        setError('')

        const response = await fetch(
          `${apiBaseUrl}/api/listings/mine?userId=${currentUser.id}`,
          { signal },
        )

        if (!response.ok) {
          let fallback = 'Impossible de charger tes annonces pour le moment.'
          try {
            const payload = await response.json()
            fallback = payload?.message || fallback
          } catch (_error) {}

          throw new Error(fallback)
        }

        const data = await response.json()
        setListings(Array.isArray(data) ? data : [])
      } catch (fetchError) {
        if (fetchError.name !== 'AbortError') {
          setError(fetchError.message)
        }
      } finally {
        setIsLoading(false)
      }
    },
    [apiBaseUrl, currentUser.id],
  )

  useEffect(() => {
    const controller = new AbortController()

    fetchMyListings(controller.signal)

    return () => {
      controller.abort()
    }
  }, [fetchMyListings])

  const handleStartEdit = (listing) => {
    setActionMessage('')
    setEditingListingId(listing.id)
    setEditForm({
      title: listing.title,
      description: listing.description,
      priceEur: String(listing.price_eur),
      city: listing.city,
      category: listing.category || 'divertissement',
      deliveryMethod: listing.delivery_method || 'remise_main_propre',
      mileageKm: listing.mileage_km == null ? '' : String(listing.mileage_km),
      modelYear: listing.model_year == null ? '' : String(listing.model_year),
    })
  }

  const handleCancelEdit = () => {
    setEditingListingId(null)
    setEditForm({
      title: '',
      description: '',
      priceEur: '',
      city: '',
      category: '',
      deliveryMethod: 'remise_main_propre',
      mileageKm: '',
      modelYear: '',
    })
  }

  const handleSaveEdit = async (listingId) => {
    setError('')
    setActionMessage('')
    setIsSubmitting(true)

    try {
      const response = await fetch(
        `${apiBaseUrl}/api/listings/${listingId}?userId=${currentUser.id}`,
        {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUser.id,
          title: editForm.title.trim(),
          description: editForm.description.trim(),
          priceEur: Number(editForm.priceEur),
          city: editForm.city.trim(),
          category: editForm.category,
          deliveryMethod: editForm.deliveryMethod,
          mileageKm: editForm.category === 'voitures' ? Number(editForm.mileageKm) : null,
          modelYear: editForm.category === 'voitures' ? Number(editForm.modelYear) : null,
        }),
      },
      )

      if (!response.ok) {
        let message = 'Impossible de modifier cette annonce.'
        try {
          const payload = await response.json()
          message = payload?.message || message
        } catch (_error) {}
        throw new Error(message)
      }

      setActionMessage('Annonce modifiée avec succès.')
      setEditingListingId(null)
      await fetchMyListings()
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async (listingId) => {
    if (!confirm('Supprimer cette annonce ?')) {
      return
    }

    setError('')
    setActionMessage('')
    setIsSubmitting(true)

    try {
      const response = await fetch(
        `${apiBaseUrl}/api/listings/${listingId}?userId=${currentUser.id}`,
        {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.id }),
      },
      )

      if (!response.ok) {
        let message = 'Impossible de supprimer cette annonce.'
        try {
          const payload = await response.json()
          message = payload?.message || message
        } catch (_error) {}
        throw new Error(message)
      }

      setActionMessage('Annonce supprimée avec succès.')
      if (editingListingId === listingId) {
        handleCancelEdit()
      }
      await fetchMyListings()
    } catch (deleteError) {
      setError(deleteError.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="latest-listings">
      <h1>Mes annonces</h1>

      {isLoading && <p>Chargement de tes annonces...</p>}

      {!isLoading && error && <p className="error-message">{error}</p>}
      {!isLoading && !error && actionMessage && (
        <p className="success-message">{actionMessage}</p>
      )}

      {!isLoading && !error && listings.length === 0 && (
        <div className="empty-state">
          <p>Tu n'as pas encore publié d'annonce.</p>
        </div>
      )}

      {!isLoading && !error && listings.length > 0 && (
        <ul className="listing-grid">
          {listings.map((listing) => {
            const listingImage = getListingImages(listing)[0]

            return (
            <li className="listing-card" key={listing.id}>
              <div className="listing-card-link">
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
                {editingListingId === listing.id ? (
                  <div className="listing-edit-fields">
                    <input
                      type="text"
                      value={editForm.title}
                      onChange={(event) =>
                        setEditForm((previous) => ({
                          ...previous,
                          title: event.target.value,
                        }))
                      }
                    />
                    <textarea
                      className="form-textarea"
                      value={editForm.description}
                      onChange={(event) =>
                        setEditForm((previous) => ({
                          ...previous,
                          description: event.target.value,
                        }))
                      }
                    />
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={editForm.priceEur}
                      onChange={(event) =>
                        setEditForm((previous) => ({
                          ...previous,
                          priceEur: event.target.value,
                        }))
                      }
                    />
                    <select
                      value={editForm.deliveryMethod}
                      onChange={(event) =>
                        setEditForm((previous) => ({
                          ...previous,
                          deliveryMethod: event.target.value,
                        }))
                      }
                    >
                      <option value="remise_main_propre">Remise en main propre</option>
                      <option value="livraison">Livraison</option>
                    </select>
                    <input
                      type="text"
                      value={editForm.city}
                      onChange={(event) =>
                        setEditForm((previous) => ({
                          ...previous,
                          city: event.target.value,
                        }))
                      }
                    />
                    <select
                      value={editForm.category}
                      onChange={(event) =>
                        setEditForm((previous) => ({
                          ...previous,
                          category: event.target.value,
                          mileageKm:
                            event.target.value === 'voitures' ? previous.mileageKm : '',
                          modelYear:
                            event.target.value === 'voitures' ? previous.modelYear : '',
                        }))
                      }
                    >
                      <option value="voitures">Voitures</option>
                      <option value="mobiliers">Mobiliers</option>
                      <option value="divertissement">Divertissement</option>
                    </select>

                    {editForm.category === 'voitures' && (
                      <>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          placeholder="Kilométrage (km)"
                          value={editForm.mileageKm}
                          onChange={(event) =>
                            setEditForm((previous) => ({
                              ...previous,
                              mileageKm: event.target.value,
                            }))
                          }
                        />
                        <input
                          type="number"
                          min="1900"
                          step="1"
                          placeholder="Année du modèle"
                          value={editForm.modelYear}
                          onChange={(event) =>
                            setEditForm((previous) => ({
                              ...previous,
                              modelYear: event.target.value,
                            }))
                          }
                        />
                      </>
                    )}
                  </div>
                ) : (
                  <>
                    <h2>{listing.title}</h2>
                    <p>{listing.description}</p>
                    <p className="listing-category">
                      Catégorie: {categoryLabelMap[listing.category] || 'Divertissement'}
                    </p>
                    <p className="listing-extra">
                      Statut: {listing.is_sold ? 'Vendu' : 'Disponible'}
                    </p>
                    {listing.category === 'voitures' && (
                      <p className="listing-extra">
                        {listing.mileage_km} km • Modèle {listing.model_year}
                      </p>
                    )}
                    <p className="meta">
                      {Number(listing.price_eur).toFixed(2)} € • {listing.city}
                    </p>
                  </>
                )}

                <div className="listing-actions">
                  {editingListingId === listing.id ? (
                    <>
                      <button
                        type="button"
                        className="button-primary"
                        onClick={() => handleSaveEdit(listing.id)}
                        disabled={isSubmitting}
                      >
                        Enregistrer
                      </button>
                      <button
                        type="button"
                        className="button-secondary"
                        onClick={handleCancelEdit}
                        disabled={isSubmitting}
                      >
                        Annuler
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="button-secondary"
                        onClick={() => handleStartEdit(listing)}
                        disabled={isSubmitting}
                      >
                        Modifier
                      </button>
                      <button
                        type="button"
                        className="button-danger"
                        onClick={() => handleDelete(listing.id)}
                        disabled={isSubmitting}
                      >
                        Supprimer
                      </button>
                    </>
                  )}
                </div>
                </div>
              </div>
            </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

export default MyListingsPage

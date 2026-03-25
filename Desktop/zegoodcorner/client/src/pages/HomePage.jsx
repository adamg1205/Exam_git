import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

function HomePage({ apiBaseUrl }) {
  const categoryLabelMap = {
    voitures: 'Voitures',
    mobiliers: 'Mobiliers',
    divertissement: 'Divertissement',
  }

  const [listings, setListings] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [priceSort, setPriceSort] = useState('none')
  const [priceMin, setPriceMin] = useState('')
  const [priceMax, setPriceMax] = useState('')

  const getListingImages = (listing) => {
    try {
      const parsed = JSON.parse(listing.images_json || '[]')
      return Array.isArray(parsed) ? parsed : []
    } catch (_error) {
      return []
    }
  }

  const fetchLatestListings = async (signal) => {
    try {
      setIsLoading(true)
      setError('')

      const response = await fetch(`${apiBaseUrl}/api/listings/latest`, {
        signal,
      })

      if (!response.ok) {
        throw new Error('Impossible de charger les annonces pour le moment.')
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
  }

  useEffect(() => {
    const controller = new AbortController()

    fetchLatestListings(controller.signal)

    return () => {
      controller.abort()
    }
  }, [apiBaseUrl])

  const displayedListings = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase()
    const parsedMinPrice = Number(priceMin)
    const parsedMaxPrice = Number(priceMax)
    const hasMinPrice = priceMin !== '' && Number.isFinite(parsedMinPrice)
    const hasMaxPrice = priceMax !== '' && Number.isFinite(parsedMaxPrice)
    const normalizedMinPrice =
      hasMinPrice && hasMaxPrice
        ? Math.min(parsedMinPrice, parsedMaxPrice)
        : parsedMinPrice
    const normalizedMaxPrice =
      hasMinPrice && hasMaxPrice
        ? Math.max(parsedMinPrice, parsedMaxPrice)
        : parsedMaxPrice

    const filteredListings = listings.filter((listing) => {
      const labelCategory = categoryLabelMap[listing.category] || 'Divertissement'
      const listingPrice = Number(listing.price_eur)
      const searchableText = [
        listing.title,
        listing.description,
        listing.city,
        listing.category,
        labelCategory,
      ]
        .join(' ')
        .toLowerCase()

      const matchesQuery = !normalizedQuery || searchableText.includes(normalizedQuery)
      const matchesCategory =
        selectedCategory === 'all' || listing.category === selectedCategory
      const matchesMinPrice = !hasMinPrice || listingPrice >= normalizedMinPrice
      const matchesMaxPrice = !hasMaxPrice || listingPrice <= normalizedMaxPrice

      return matchesQuery && matchesCategory && matchesMinPrice && matchesMaxPrice
    })

    if (priceSort === 'asc') {
      return [...filteredListings].sort(
        (leftListing, rightListing) =>
          Number(leftListing.price_eur) - Number(rightListing.price_eur),
      )
    }

    if (priceSort === 'desc') {
      return [...filteredListings].sort(
        (leftListing, rightListing) =>
          Number(rightListing.price_eur) - Number(leftListing.price_eur),
      )
    }

    return filteredListings
  }, [listings, searchQuery, selectedCategory, priceSort, priceMin, priceMax])

  return (
    <section className="latest-listings-wrapper">
      <section className="latest-listings">
        <h1>Dernières annonces</h1>

        {isLoading && <p>Chargement des annonces...</p>}

        {!isLoading && error && <p className="error-message">{error}</p>}

        {!isLoading && !error && (
          <div className="listings-toolbar">
            <label>
              Rechercher
              <input
                type="text"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Titre, description, ville..."
              />
            </label>

            <label>
              Catégorie
              <select
                value={selectedCategory}
                onChange={(event) => setSelectedCategory(event.target.value)}
              >
                <option value="all">Toutes</option>
                <option value="voitures">Voitures</option>
                <option value="mobiliers">Mobiliers</option>
                <option value="divertissement">Divertissement</option>
              </select>
            </label>

            <label>
              Trier par prix
              <select
                value={priceSort}
                onChange={(event) => setPriceSort(event.target.value)}
              >
                <option value="none">Par défaut</option>
                <option value="asc">Prix croissant</option>
                <option value="desc">Prix décroissant</option>
              </select>
            </label>

            <label>
              Prix min (€)
              <input
                type="number"
                min="0"
                step="0.01"
                value={priceMin}
                onChange={(event) => setPriceMin(event.target.value)}
                placeholder="Ex: 5"
              />
            </label>

            <label>
              Prix max (€)
              <input
                type="number"
                min="0"
                step="0.01"
                value={priceMax}
                onChange={(event) => setPriceMax(event.target.value)}
                placeholder="Ex: 80"
              />
            </label>
          </div>
        )}

        {!isLoading && !error && displayedListings.length === 0 && (
          <div className="empty-state">
            <p>Aucune annonce ne correspond à ta recherche.</p>
          </div>
        )}

        {!isLoading && !error && displayedListings.length > 0 && (
          <ul className="listing-grid">
            {displayedListings.map((listing) => {
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
                      <p className="listing-category">
                        Catégorie: {categoryLabelMap[listing.category] || 'Divertissement'}
                      </p>
                      {listing.category === 'voitures' && (
                        <p className="listing-extra">
                          {listing.mileage_km} km • Modèle {listing.model_year}
                        </p>
                      )}
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

export default HomePage

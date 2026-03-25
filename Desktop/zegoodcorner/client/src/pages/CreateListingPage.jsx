import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getApiErrorMessage } from '../utils/apiError'

const MAX_IMAGES = 3
const MAX_RAW_FILE_SIZE_BYTES = 10 * 1024 * 1024
const MAX_OPTIMIZED_IMAGE_CHARS = 1_200_000
const MAX_TOTAL_IMAGES_CHARS = 1_200_000
const PHOTO_FORMAT_WIDTH = 1200
const PHOTO_FORMAT_HEIGHT = 900

function CreateListingPage({ apiBaseUrl, currentUser }) {
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priceEur, setPriceEur] = useState('')
  const [city, setCity] = useState('')
  const [category, setCategory] = useState('')
  const [deliveryMethod, setDeliveryMethod] = useState('')
  const [mileageKm, setMileageKm] = useState('')
  const [modelYear, setModelYear] = useState('')
  const [selectedImages, setSelectedImages] = useState([])
  const [listingError, setListingError] = useState('')
  const [listingSuccess, setListingSuccess] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const isCarCategory = category === 'voitures'

  useEffect(() => {
    return () => {
      selectedImages.forEach((image) => URL.revokeObjectURL(image.previewUrl))
    }
  }, [selectedImages])

  const optimizeImageFile = (file) =>
    new Promise((resolve, reject) => {
      const objectUrl = URL.createObjectURL(file)
      const image = new Image()

      image.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = PHOTO_FORMAT_WIDTH
        canvas.height = PHOTO_FORMAT_HEIGHT
        const context = canvas.getContext('2d')

        if (!context) {
          URL.revokeObjectURL(objectUrl)
          reject(new Error('Impossible de traiter une image.'))
          return
        }

        const targetRatio = PHOTO_FORMAT_WIDTH / PHOTO_FORMAT_HEIGHT
        const sourceRatio = image.width / image.height

        let drawWidth = PHOTO_FORMAT_WIDTH
        let drawHeight = PHOTO_FORMAT_HEIGHT
        let offsetX = 0
        let offsetY = 0

        if (sourceRatio > targetRatio) {
          drawHeight = PHOTO_FORMAT_HEIGHT
          drawWidth = Math.round(drawHeight * sourceRatio)
          offsetX = Math.round((PHOTO_FORMAT_WIDTH - drawWidth) / 2)
        } else {
          drawWidth = PHOTO_FORMAT_WIDTH
          drawHeight = Math.round(drawWidth / sourceRatio)
          offsetY = Math.round((PHOTO_FORMAT_HEIGHT - drawHeight) / 2)
        }

        context.fillStyle = '#f8fafc'
        context.fillRect(0, 0, PHOTO_FORMAT_WIDTH, PHOTO_FORMAT_HEIGHT)
        context.drawImage(image, offsetX, offsetY, drawWidth, drawHeight)

        const outputType = 'image/jpeg'
        const optimizedDataUrl = canvas.toDataURL(outputType, 0.68)

        if (optimizedDataUrl.length > MAX_OPTIMIZED_IMAGE_CHARS) {
          URL.revokeObjectURL(objectUrl)
          reject(
            new Error('Une photo reste trop volumineuse après optimisation. Choisis une photo plus légère.'),
          )
          return
        }

        URL.revokeObjectURL(objectUrl)
        resolve(optimizedDataUrl)
      }

      image.onerror = () => {
        URL.revokeObjectURL(objectUrl)
        reject(new Error('Impossible de traiter une image.'))
      }

      image.src = objectUrl
    })

  const handleImageChange = (event) => {
    const files = Array.from(event.target.files || [])

    if (files.length === 0) {
      return
    }

    setListingError('')

    setSelectedImages((previousImages) => {
      const availableSlots = MAX_IMAGES - previousImages.length

      if (availableSlots <= 0) {
        setListingError('Tu as déjà sélectionné 3 photos.')
        return previousImages
      }

      const validFiles = files.filter((file) => file.type.startsWith('image/'))
      const sizeValidFiles = validFiles.filter((file) => file.size <= MAX_RAW_FILE_SIZE_BYTES)
      const filesToUse = sizeValidFiles.slice(0, availableSlots)

      if (validFiles.length < files.length) {
        setListingError('Certains fichiers ont été ignorés car ce ne sont pas des images.')
      }

      if (sizeValidFiles.length < validFiles.length) {
        setListingError('Certaines photos sont trop lourdes (max 10 MB par photo).')
      }

      if (filesToUse.length < validFiles.length) {
        setListingError('Tu peux ajouter jusqu’à 3 photos maximum.')
      }

      const mappedFiles = filesToUse.map((file) => ({
        id: `${Date.now()}-${Math.random()}`,
        file,
        previewUrl: URL.createObjectURL(file),
      }))

      return [...previousImages, ...mappedFiles]
    })

    event.target.value = ''
  }

  const handleRemoveImage = (imageId) => {
    setSelectedImages((previousImages) => {
      const imageToRemove = previousImages.find((image) => image.id === imageId)

      if (imageToRemove) {
        URL.revokeObjectURL(imageToRemove.previewUrl)
      }

      return previousImages.filter((image) => image.id !== imageId)
    })
  }

  const handleCreateListing = async (event) => {
    event.preventDefault()
    setListingError('')
    setListingSuccess('')

    if (!category) {
      setListingError('Merci de choisir une catégorie.')
      return
    }

    if (!deliveryMethod) {
      setListingError('Merci de choisir le mode de remise (main propre ou livraison).')
      return
    }

    if (isCarCategory && (!mileageKm || !modelYear)) {
      setListingError('Pour une voiture, le kilométrage et l’année du modèle sont obligatoires.')
      return
    }

    setIsSubmitting(true)

    try {
      const optimizedImages = await Promise.all(
        selectedImages.map((image) => optimizeImageFile(image.file)),
      )

      const totalImagesChars = optimizedImages.reduce(
        (totalChars, image) => totalChars + image.length,
        0,
      )

      if (totalImagesChars > MAX_TOTAL_IMAGES_CHARS) {
        throw new Error(
          'Les photos restent trop volumineuses. Essaie avec des images plus légères ou moins de photos.',
        )
      }

      const response = await fetch(`${apiBaseUrl}/api/listings/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUser.id,
          title: title.trim(),
          description: description.trim(),
          priceEur: Number(priceEur),
          city: city.trim(),
          category,
          deliveryMethod,
          mileageKm: isCarCategory ? Number(mileageKm) : null,
          modelYear: isCarCategory ? Number(modelYear) : null,
          images: optimizedImages,
        }),
      })

      if (!response.ok) {
        let message = await getApiErrorMessage(
          response,
          'Impossible de créer ton annonce pour le moment.',
        )

        const isGenericMessage =
          message === 'Une erreur est survenue. Réessaie dans quelques instants.' ||
          message === 'Impossible de créer ton annonce pour le moment.'

        if (isGenericMessage && optimizedImages.length > 0) {
          message =
            'Échec de l’envoi des photos. Réduis la taille des images ou essaie avec une seule photo.'
        }

        throw new Error(message)
      }

      setTitle('')
      setDescription('')
      setPriceEur('')
      setCity('')
      setCategory('')
      setDeliveryMethod('')
      setMileageKm('')
      setModelYear('')
      setSelectedImages((previousImages) => {
        previousImages.forEach((image) => URL.revokeObjectURL(image.previewUrl))
        return []
      })
      setListingSuccess('Annonce créée avec succès.')
      
      setTimeout(() => {
        navigate('/')
      }, 1500)
    } catch (submitError) {
      setListingError(submitError.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="create-listing-page">
      <div className="create-listing-container">
        <h1>Créer une annonce</h1>
        
        <form className="auth-form" onSubmit={handleCreateListing}>
          <label>
            Titre
            <input
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
            />
          </label>

          <label>
            Description
            <textarea
              className="form-textarea"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              required
            />
          </label>

          <label>
            Catégorie
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              required
            >
              <option value="">Sélectionner une catégorie</option>
              <option value="voitures">Voitures</option>
              <option value="mobiliers">Mobiliers</option>
              <option value="divertissement">Divertissement</option>
            </select>
          </label>

          <label>
            Mode de remise
            <select
              value={deliveryMethod}
              onChange={(event) => setDeliveryMethod(event.target.value)}
              required
            >
              <option value="">Sélectionner un mode</option>
              <option value="remise_main_propre">Remise en main propre</option>
              <option value="livraison">Livraison</option>
            </select>
          </label>

          <label>
            Photos (max 3)
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={handleImageChange}
            />
          </label>

          {selectedImages.length > 0 && (
            <p className="image-counter">
              {selectedImages.length} / {MAX_IMAGES} photos sélectionnées
            </p>
          )}

          {selectedImages.length > 0 && (
            <div className="listing-image-preview-grid">
              {selectedImages.map((image, index) => (
                <div key={image.id} className="listing-image-preview-card">
                  <img
                    src={image.previewUrl}
                    alt={`Aperçu ${index + 1}`}
                    className="listing-image-preview"
                  />
                  <button
                    type="button"
                    className="image-remove-button"
                    onClick={() => handleRemoveImage(image.id)}
                    disabled={isSubmitting}
                  >
                    Enlever
                  </button>
                </div>
              ))}
            </div>
          )}

          {isCarCategory && (
            <>
              <label>
                Kilométrage (km)
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={mileageKm}
                  onChange={(event) => setMileageKm(event.target.value)}
                  required
                />
              </label>

              <label>
                Année du modèle
                <input
                  type="number"
                  min="1900"
                  step="1"
                  value={modelYear}
                  onChange={(event) => setModelYear(event.target.value)}
                  required
                />
              </label>
            </>
          )}

          <label>
            Prix (€)
            <input
              type="number"
              min="1"
              step="0.01"
              value={priceEur}
              onChange={(event) => setPriceEur(event.target.value)}
              required
            />
          </label>

          <label>
            Ville
            <input
              type="text"
              value={city}
              onChange={(event) => setCity(event.target.value)}
              required
            />
          </label>

          {listingError && <p className="error-message">{listingError}</p>}
          {listingSuccess && <p className="success-message">{listingSuccess}</p>}

          <button className="button-primary" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Création...' : 'Créer une annonce'}
          </button>
        </form>

        <button
          type="button"
          className="button-secondary"
          onClick={() => navigate('/')}
          style={{ marginTop: '1rem' }}
        >
          Retour aux annonces
        </button>
      </div>
    </section>
  )
}

export default CreateListingPage

import { useState } from 'react'
import { getApiErrorMessage } from '../utils/apiError'

function SellerGuideModal({ apiBaseUrl, currentUser, onClose, onAccepted }) {
  const [errorMessage, setErrorMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleAccept = async () => {
    setErrorMessage('')
    setIsSubmitting(true)

    try {
      const response = await fetch(`${apiBaseUrl}/api/account/become-seller`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.id }),
      })

      if (!response.ok) {
        const message = await getApiErrorMessage(
          response,
          'Impossible d’activer le statut vendeur pour le moment.',
        )
        throw new Error(message)
      }

      const updatedUser = await response.json()
      onAccepted(updatedUser)
      onClose()
    } catch (error) {
      setErrorMessage(error.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="modal-card" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h2>Devenir vendeur</h2>
          <button type="button" className="button-secondary" onClick={onClose}>
            Renoncer
          </button>
        </div>

        <p>
          Avant de publier une annonce, merci de lire ce guide et d’accepter les règles.
        </p>

        <h3>Comment publier une annonce</h3>
        <ul className="guide-list">
          <li>Ajoute un titre clair et une description précise.</li>
          <li>Indique un prix réaliste et la ville correcte.</li>
          <li>Vérifie les informations avant de publier.</li>
        </ul>

        <h3>Règles à respecter</h3>
        <ul className="guide-list">
          <li>Pas de contenu illégal, choquant ou trompeur.</li>
          <li>Pas de spam, ni de fausses annonces.</li>
          <li>Respect des acheteurs et communication honnête.</li>
        </ul>

        {errorMessage && <p className="error-message">{errorMessage}</p>}

        <div className="modal-actions">
          <button type="button" className="button-secondary" onClick={onClose}>
            Renoncer
          </button>
          <button
            type="button"
            className="button-primary"
            onClick={handleAccept}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Activation...' : 'Accepter et devenir vendeur'}
          </button>
        </div>
      </section>
    </div>
  )
}

export default SellerGuideModal

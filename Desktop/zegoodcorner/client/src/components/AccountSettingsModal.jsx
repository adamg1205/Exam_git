import { useState } from 'react'
import { getApiErrorMessage } from '../utils/apiError'

function AccountSettingsModal({ apiBaseUrl, currentUser, onClose, onAccountDeleted, onUserUpdated }) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')
  const [deletePassword, setDeletePassword] = useState('')
  const [deletePasswordConfirm, setDeletePasswordConfirm] = useState('')
  const [stripeDisconnectLoading, setStripeDisconnectLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const validatePassword = (value) =>
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(value)

  const resetMessages = () => {
    setErrorMessage('')
    setSuccessMessage('')
  }

  const handleChangePassword = async (event) => {
    event.preventDefault()
    resetMessages()

    if (newPassword !== confirmNewPassword) {
      setErrorMessage('Les nouveaux mots de passe ne correspondent pas.')
      return
    }

    if (!validatePassword(newPassword)) {
      setErrorMessage(
        'Le nouveau mot de passe doit contenir au moins 8 caractères, une majuscule, une minuscule et un chiffre.',
      )
      return
    }

    setIsSubmitting(true)

    try {
      const response = await fetch(`${apiBaseUrl}/api/account/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUser.id,
          currentPassword,
          newPassword,
        }),
      })

      if (!response.ok) {
        const message = await getApiErrorMessage(
          response,
          'Impossible de modifier ton mot de passe pour le moment.',
        )
        throw new Error(message)
      }

      setCurrentPassword('')
      setNewPassword('')
      setConfirmNewPassword('')
      setSuccessMessage('Mot de passe modifié avec succès.')
    } catch (error) {
      setErrorMessage(error.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteAccount = async (event) => {
    event.preventDefault()
    resetMessages()

    if (deletePassword !== deletePasswordConfirm) {
      setErrorMessage('Les mots de passe de confirmation ne correspondent pas.')
      return
    }

    setIsSubmitting(true)

    try {
      const response = await fetch(`${apiBaseUrl}/api/account/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUser.id,
          password: deletePassword,
        }),
      })

      if (!response.ok) {
        const message = await getApiErrorMessage(
          response,
          'Impossible de supprimer ton compte pour le moment.',
        )
        throw new Error(message)
      }

      onAccountDeleted()
    } catch (error) {
      setErrorMessage(error.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDisconnectStripe = async () => {
    resetMessages()
    setStripeDisconnectLoading(true)

    try {
      const response = await fetch(`${apiBaseUrl}/api/stripe/disconnect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUser.id,
        }),
      })

      if (!response.ok) {
        const message = await getApiErrorMessage(
          response,
          'Impossible de délier ton compte Stripe pour le moment.',
        )
        throw new Error(message)
      }

      const updatedUser = await response.json()
      setSuccessMessage('Ton compte Stripe a été délié avec succès.')

      if (onUserUpdated) {
        onUserUpdated(updatedUser)
      }
    } catch (error) {
      setErrorMessage(error.message)
    } finally {
      setStripeDisconnectLoading(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="modal-card" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h2>Paramètres du compte</h2>
          <button type="button" className="button-secondary" onClick={onClose}>
            Fermer
          </button>
        </div>

        {errorMessage && <p className="error-message">{errorMessage}</p>}
        {successMessage && <p className="success-message">{successMessage}</p>}

        <form className="auth-form" onSubmit={handleChangePassword}>
          <h3>Changer le mot de passe</h3>
          <label>
            Mot de passe actuel
            <input
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              required
            />
          </label>
          <label>
            Nouveau mot de passe
            <input
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              required
            />
          </label>
          <label>
            Confirmer le nouveau mot de passe
            <input
              type="password"
              value={confirmNewPassword}
              onChange={(event) => setConfirmNewPassword(event.target.value)}
              required
            />
          </label>
          <p className="password-rule">
            Minimum 8 caractères, au moins 1 majuscule, 1 minuscule et 1 chiffre.
          </p>
          <button className="button-primary" type="submit" disabled={isSubmitting}>
            Mettre à jour le mot de passe
          </button>
        </form>

        <section className="auth-form">
          <h3>Paramètres Stripe</h3>
          {currentUser?.stripeAccountId ? (
            <>
              <p>
                <strong>État:</strong>{' '}
                {currentUser?.stripeChargesEnabled
                  ? 'Compte Stripe lié et actif ✓'
                  : 'Compte Stripe lié (activation des paiements en attente)'}
              </p>
              {currentUser?.stripeAccountId && (
                <p>
                  <strong>ID du compte:</strong> {currentUser.stripeAccountId}
                </p>
              )}
              <button
                type="button"
                className="button-secondary"
                onClick={handleDisconnectStripe}
                disabled={stripeDisconnectLoading}
              >
                {stripeDisconnectLoading ? 'Déliage en cours...' : 'Délier mon compte Stripe'}
              </button>
            </>
          ) : (
            <p>Aucun compte Stripe lié pour le moment.</p>
          )}
        </section>

        <form className="auth-form danger-zone" onSubmit={handleDeleteAccount}>
          <h3>Supprimer le compte</h3>
          <label>
            Mot de passe
            <input
              type="password"
              value={deletePassword}
              onChange={(event) => setDeletePassword(event.target.value)}
              required
            />
          </label>
          <label>
            Confirme ton mot de passe
            <input
              type="password"
              value={deletePasswordConfirm}
              onChange={(event) => setDeletePasswordConfirm(event.target.value)}
              required
            />
          </label>
          <button className="button-secondary" type="submit" disabled={isSubmitting}>
            Supprimer mon compte
          </button>
        </form>
      </section>
    </div>
  )
}

export default AccountSettingsModal

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getApiErrorMessage } from '../utils/apiError'

function ProfilePage({ apiBaseUrl, currentUser, onUserUpdated, onLogout }) {
  const navigate = useNavigate()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')
  const [deletePassword, setDeletePassword] = useState('')
  const [deletePasswordConfirm, setDeletePasswordConfirm] = useState('')
  const [infoMessage, setInfoMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const validatePassword = (value) =>
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(value)

  const resetMessages = () => {
    setInfoMessage('')
    setErrorMessage('')
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
          'Impossible de modifier le mot de passe pour le moment.',
        )
        throw new Error(message)
      }

      setCurrentPassword('')
      setNewPassword('')
      setConfirmNewPassword('')
      setInfoMessage('Ton mot de passe a été modifié.')
    } catch (error) {
      setErrorMessage(error.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleBecomeSeller = async () => {
    resetMessages()
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
          'Impossible de changer ton statut pour le moment.',
        )
        throw new Error(message)
      }

      const updatedUser = await response.json()
      onUserUpdated(updatedUser)
      setInfoMessage('Ton compte est maintenant vendeur. Tu peux créer des annonces.')
      navigate('/', { replace: true })
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

      onLogout()
      navigate('/', { replace: true })
    } catch (error) {
      setErrorMessage(error.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="profile-section">
      <h1>Profil</h1>
      <p className="profile-meta">Connecté en tant que {currentUser.displayName}</p>

      {errorMessage && <p className="error-message">{errorMessage}</p>}
      {infoMessage && <p className="success-message">{infoMessage}</p>}

      <div className="profile-cards">
        <article className="profile-card">
          <h2>Paramètres</h2>
          <form className="auth-form" onSubmit={handleChangePassword}>
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
              Changer le mot de passe
            </button>
          </form>
        </article>

        <article className="profile-card">
          <h2>Statut vendeur</h2>
          {currentUser.role === 'vendeur' || currentUser.role === 'admin' ? (
            <p>Ton compte peut déjà créer des annonces.</p>
          ) : (
            <>
              <p>Passe en vendeur pour publier tes annonces.</p>
              <button
                type="button"
                className="button-primary"
                onClick={handleBecomeSeller}
                disabled={isSubmitting}
              >
                Devenir vendeur
              </button>
            </>
          )}
        </article>

        <article className="profile-card danger-card">
          <h2>Supprimer le compte</h2>
          <form className="auth-form" onSubmit={handleDeleteAccount}>
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
        </article>
      </div>
    </section>
  )
}

export default ProfilePage

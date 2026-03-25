import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getApiErrorMessage } from '../utils/apiError'

function AdminPage({ apiBaseUrl, currentUser }) {
  const [users, setUsers] = useState([])
  const [listings, setListings] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionMessage, setActionMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const fetchAdminData = async () => {
    try {
      setIsLoading(true)
      setError('')

      const [usersResponse, listingsResponse] = await Promise.all([
        fetch(`${apiBaseUrl}/api/admin/users?adminUserId=${currentUser.id}`),
        fetch(`${apiBaseUrl}/api/admin/listings?adminUserId=${currentUser.id}`),
      ])

      if (!usersResponse.ok) {
        const message = await getApiErrorMessage(
          usersResponse,
          'Impossible de charger les utilisateurs.',
        )
        throw new Error(message)
      }

      if (!listingsResponse.ok) {
        const message = await getApiErrorMessage(
          listingsResponse,
          'Impossible de charger les annonces.',
        )
        throw new Error(message)
      }

      const usersData = await usersResponse.json()
      const listingsData = await listingsResponse.json()
      setUsers(Array.isArray(usersData) ? usersData : [])
      setListings(Array.isArray(listingsData) ? listingsData : [])
    } catch (fetchError) {
      setError(fetchError.message)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchAdminData()
  }, [apiBaseUrl, currentUser.id])

  const handleBanUser = async (userId, currentBanStatus) => {
    if (!confirm(`Sûr de vouloir ${currentBanStatus ? 'débannir' : 'bannir'} cet utilisateur?`)) {
      return
    }

    setActionMessage('')
    setIsSubmitting(true)

    try {
      const response = await fetch(`${apiBaseUrl}/api/admin/ban-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminUserId: currentUser.id,
          userId,
          isBanned: !currentBanStatus,
        }),
      })

      if (!response.ok) {
        const message = await getApiErrorMessage(
          response,
          'Impossible de changer le statut de bannissement.',
        )
        throw new Error(message)
      }

      setActionMessage(`Utilisateur ${!currentBanStatus ? 'banni' : 'débanni'} avec succès.`)
      await fetchAdminData()
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteUser = async (userId, displayName) => {
    if (!confirm(`Êtes-vous sûr de vouloir supprimer le compte de ${displayName}? Cette action supprimera aussi toutes ses annonces.`)) {
      return
    }

    setActionMessage('')
    setIsSubmitting(true)

    try {
      const response = await fetch(`${apiBaseUrl}/api/admin/users/${userId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminUserId: currentUser.id,
        }),
      })

      if (!response.ok) {
        const message = await getApiErrorMessage(
          response,
          'Impossible de supprimer cet utilisateur.',
        )
        throw new Error(message)
      }

      setActionMessage('Compte utilisateur supprimé avec succès.')
      await fetchAdminData()
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteListing = async (listingId, listingTitle) => {
    if (!confirm(`Êtes-vous sûr de vouloir supprimer l'annonce "${listingTitle}" ?`)) {
      return
    }

    setActionMessage('')
    setIsSubmitting(true)

    try {
      const response = await fetch(`${apiBaseUrl}/api/admin/listings/${listingId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminUserId: currentUser.id,
        }),
      })

      if (!response.ok) {
        const message = await getApiErrorMessage(
          response,
          'Impossible de supprimer cette annonce.',
        )
        throw new Error(message)
      }

      setActionMessage('Annonce supprimée avec succès.')
      await fetchAdminData()
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="admin-section">
      <h1>Panneau d'administration</h1>

      {error && <p className="error-message">{error}</p>}
      {actionMessage && <p className="success-message">{actionMessage}</p>}

      {isLoading && <p>Chargement des utilisateurs...</p>}

      {!isLoading && users.length === 0 && (
        <div className="empty-state">
          <p>Aucun utilisateur trouvé.</p>
        </div>
      )}

      {!isLoading && users.length > 0 && (
        <div className="admin-table-wrapper">
          <h2>Gestion des utilisateurs</h2>
          <table className="admin-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Nom</th>
                <th>Email</th>
                <th>Rôle</th>
                <th>Statut</th>
                <th>Créé le</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className={user.is_banned ? 'user-banned' : ''}>
                  <td>{user.id}</td>
                  <td>{user.display_name}</td>
                  <td>{user.email}</td>
                  <td>
                    <span className={`role-badge role-${user.role}`}>{user.role}</span>
                  </td>
                  <td>
                    <span className={user.is_banned ? 'status-banned' : 'status-active'}>
                      {user.is_banned ? 'Banni' : 'Actif'}
                    </span>
                  </td>
                  <td>{new Date(user.created_at).toLocaleDateString('fr-FR')}</td>
                  <td className="admin-actions">
                    <button
                      type="button"
                      className={user.is_banned ? 'button-secondary' : 'button-warning'}
                      onClick={() => handleBanUser(user.id, user.is_banned)}
                      disabled={isSubmitting}
                    >
                      {user.is_banned ? 'Débannir' : 'Bannir'}
                    </button>
                    <button
                      type="button"
                      className="button-danger"
                      onClick={() => handleDeleteUser(user.id, user.display_name)}
                      disabled={isSubmitting}
                    >
                      Supprimer
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!isLoading && listings.length === 0 && (
        <div className="empty-state">
          <p>Aucune annonce trouvée.</p>
        </div>
      )}

      {!isLoading && listings.length > 0 && (
        <div className="admin-table-wrapper">
          <h2>Gestion des annonces</h2>
          <table className="admin-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Titre</th>
                <th>Prix</th>
                <th>Ville</th>
                <th>Catégorie</th>
                <th>Statut</th>
                <th>Vendeur</th>
                <th>Créée le</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {listings.map((listing) => (
                <tr key={listing.id}>
                  <td>{listing.id}</td>
                  <td>
                    <Link to={`/annonce/${listing.id}`}>{listing.title}</Link>
                  </td>
                  <td>{Number(listing.price_eur).toFixed(2)} €</td>
                  <td>{listing.city}</td>
                  <td>{listing.category}</td>
                  <td>{listing.is_sold ? 'Vendu' : 'Disponible'}</td>
                  <td>{listing.seller_name || listing.seller_email || 'Utilisateur'}</td>
                  <td>{new Date(listing.created_at).toLocaleDateString('fr-FR')}</td>
                  <td className="admin-actions">
                    <button
                      type="button"
                      className="button-danger"
                      onClick={() => handleDeleteListing(listing.id, listing.title)}
                      disabled={isSubmitting}
                    >
                      Supprimer
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

export default AdminPage

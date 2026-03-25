import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getApiErrorMessage } from '../utils/apiError'

function InvoicePage({ apiBaseUrl, currentUser }) {
  const { transactionId } = useParams()
  const [invoice, setInvoice] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!currentUser?.id) {
      return
    }

    const controller = new AbortController()

    const fetchInvoice = async () => {
      try {
        setIsLoading(true)
        setError('')

        const response = await fetch(
          `${apiBaseUrl}/api/transactions/${transactionId}/invoice-data?userId=${currentUser.id}`,
          { signal: controller.signal },
        )

        if (!response.ok) {
          const message = await getApiErrorMessage(
            response,
            'Impossible de charger la facture pour le moment.',
          )
          throw new Error(message)
        }

        const data = await response.json()
        setInvoice(data)
      } catch (fetchError) {
        if (fetchError.name !== 'AbortError') {
          setError(fetchError.message)
        }
      } finally {
        setIsLoading(false)
      }
    }

    fetchInvoice()

    return () => {
      controller.abort()
    }
  }, [apiBaseUrl, transactionId, currentUser?.id])

  if (!currentUser) {
    return (
      <section className="latest-listings">
        <p>Connexion requise.</p>
        <Link className="button-primary" to="/connexion">
          Se connecter
        </Link>
      </section>
    )
  }

  return (
    <section className="latest-listings">
      <h1>Facture / Reçu</h1>

      {isLoading && <p>Chargement de la facture...</p>}
      {!isLoading && error && <p className="error-message">{error}</p>}

      {!isLoading && !error && invoice && (
        <article className="listing-details-card">
          <p>
            <strong>Facture n°:</strong> {invoice.id}
          </p>
          <p>
            <strong>Date:</strong>{' '}
            {new Date(invoice.createdAt).toLocaleString('fr-FR')}
          </p>
          <p>
            <strong>Statut:</strong> Payée
          </p>
          <p>
            <strong>Annonce:</strong> {invoice.listingTitle}
          </p>
          <p>
            <strong>Ville:</strong> {invoice.listingCity || '—'}
          </p>
          <p>
            <strong>Acheteur:</strong> {invoice.buyerName}
          </p>
          <p>
            <strong>Vendeur:</strong> {invoice.sellerName}
          </p>
          <p>
            <strong>Montant:</strong> {Number(invoice.amountEur).toFixed(2)} {invoice.currency}
          </p>
          {invoice.stripePaymentIntentId && (
            <p>
              <strong>Référence paiement Stripe:</strong> {invoice.stripePaymentIntentId}
            </p>
          )}
          <div className="listing-actions">
            <button
              type="button"
              className="button-secondary"
              onClick={() => window.print()}
            >
              Imprimer
            </button>
            <Link className="button-primary" to="/discussion">
              Retour discussion
            </Link>
          </div>
        </article>
      )}
    </section>
  )
}

export default InvoicePage

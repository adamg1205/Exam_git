import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { getApiErrorMessage } from '../utils/apiError'

const DISCUSSION_REFRESH_MS = 5000

function DiscussionPage({ apiBaseUrl, currentUser, onUnreadCountChange }) {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const initialConversationId = Number(searchParams.get('conversationId') || 0)

  const [conversations, setConversations] = useState([])
  const [messages, setMessages] = useState([])
  const [purchaseRequests, setPurchaseRequests] = useState([])
  const [selectedConversationId, setSelectedConversationId] = useState(
    initialConversationId || null,
  )
  const [messageInput, setMessageInput] = useState('')
  const [isLoadingConversations, setIsLoadingConversations] = useState(true)
  const [isLoadingMessages, setIsLoadingMessages] = useState(false)
  const [isLoadingPurchaseRequests, setIsLoadingPurchaseRequests] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [processingRequestId, setProcessingRequestId] = useState(null)
  const [startingCheckoutRequestId, setStartingCheckoutRequestId] = useState(null)
  const [openingReceiptTransactionId, setOpeningReceiptTransactionId] = useState(null)
  const [submittingShippingTransactionId, setSubmittingShippingTransactionId] = useState(null)
  const [shippingForms, setShippingForms] = useState({})
  const [paymentMessage, setPaymentMessage] = useState('')
  const [error, setError] = useState('')

  const selectedConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === selectedConversationId) || null,
    [conversations, selectedConversationId],
  )

  const timelineItems = useMemo(() => {
    const safeMessages = (Array.isArray(messages) ? messages : []).map((message) => ({
      type: 'message',
      id: `message-${message.id}`,
      createdAt: new Date(message.created_at || 0).getTime(),
      payload: message,
    }))

    const safeRequests = (Array.isArray(purchaseRequests) ? purchaseRequests : []).map((request) => ({
      type: 'purchase-request',
      id: `purchase-request-${request.id}`,
      createdAt: new Date(request.created_at || 0).getTime(),
      payload: request,
    }))

    return [...safeMessages, ...safeRequests].sort((leftItem, rightItem) => {
      if (leftItem.createdAt !== rightItem.createdAt) {
        return leftItem.createdAt - rightItem.createdAt
      }

      return leftItem.id.localeCompare(rightItem.id)
    })
  }, [messages, purchaseRequests])

  const loadConversations = async ({ silent = false } = {}) => {
    try {
      if (!silent) {
        setIsLoadingConversations(true)
        setError('')
      }

      const response = await fetch(
        `${apiBaseUrl}/api/messages/conversations?userId=${currentUser.id}`,
      )

      if (!response.ok) {
        const message = await getApiErrorMessage(
          response,
          'Impossible de charger tes discussions pour le moment.',
        )
        throw new Error(message)
      }

      const data = await response.json()
      const safeConversations = Array.isArray(data) ? data : []
      setConversations(safeConversations)

      const totalUnread = safeConversations.reduce(
        (sum, conversation) => sum + Number(conversation?.unread_count || 0),
        0,
      )
      onUnreadCountChange?.(totalUnread)

      if (safeConversations.length === 0) {
        setSelectedConversationId(null)
        setMessages([])
        return
      }

      const hasCurrent = safeConversations.some(
        (conversation) => conversation.id === selectedConversationId,
      )

      if (!hasCurrent) {
        const nextConversationId = initialConversationId
          ? safeConversations.find((conversation) => conversation.id === initialConversationId)?.id ||
            safeConversations[0].id
          : safeConversations[0].id

        setSelectedConversationId(nextConversationId)
      }
    } catch (fetchError) {
      if (!silent) {
        setError(fetchError.message)
      }
    } finally {
      if (!silent) {
        setIsLoadingConversations(false)
      }
    }
  }

  const loadMessages = async (conversationId, { silent = false } = {}) => {
    if (!conversationId) {
      setMessages([])
      return
    }

    try {
      if (!silent) {
        setIsLoadingMessages(true)
        setError('')
      }

      const response = await fetch(
        `${apiBaseUrl}/api/messages/conversations/${conversationId}/messages?userId=${currentUser.id}`,
      )

      if (!response.ok) {
        const message = await getApiErrorMessage(
          response,
          'Impossible de charger les messages pour le moment.',
        )
        throw new Error(message)
      }

      const data = await response.json()
      setMessages(Array.isArray(data) ? data : [])
    } catch (fetchError) {
      if (!silent) {
        setError(fetchError.message)
      }
    } finally {
      if (!silent) {
        setIsLoadingMessages(false)
      }
    }
  }

  const loadPurchaseRequests = async (conversationId, { silent = false } = {}) => {
    if (!conversationId) {
      setPurchaseRequests([])
      return
    }

    try {
      if (!silent) {
        setIsLoadingPurchaseRequests(true)
      }

      const response = await fetch(
        `${apiBaseUrl}/api/messages/conversations/${conversationId}/purchase-requests?userId=${currentUser.id}`,
      )

      if (!response.ok) {
        const message = await getApiErrorMessage(
          response,
          'Impossible de charger les demandes d’achat pour le moment.',
        )
        throw new Error(message)
      }

      const data = await response.json()
      setPurchaseRequests(Array.isArray(data) ? data : [])
    } catch (fetchError) {
      if (!silent) {
        setError(fetchError.message)
      }
    } finally {
      if (!silent) {
        setIsLoadingPurchaseRequests(false)
      }
    }
  }

  const markConversationAsRead = async (conversationId) => {
    if (!conversationId) {
      return
    }

    try {
      await fetch(`${apiBaseUrl}/api/messages/conversations/${conversationId}/read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.id }),
      })
    } catch (_error) {}
  }

  useEffect(() => {
    loadConversations()
    const intervalId = window.setInterval(() => {
      loadConversations({ silent: true })
    }, DISCUSSION_REFRESH_MS)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [])

  useEffect(() => {
    if (!selectedConversationId) {
      setSearchParams({}, { replace: true })
      return
    }

    setSearchParams({ conversationId: String(selectedConversationId) }, { replace: true })
    loadMessages(selectedConversationId)
    loadPurchaseRequests(selectedConversationId)
    markConversationAsRead(selectedConversationId).then(() => {
      loadConversations({ silent: true })
    })

    const intervalId = window.setInterval(() => {
      loadMessages(selectedConversationId, { silent: true })
      loadPurchaseRequests(selectedConversationId, { silent: true })
      markConversationAsRead(selectedConversationId).then(() => {
        loadConversations({ silent: true })
      })
    }, DISCUSSION_REFRESH_MS)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [selectedConversationId])

  useEffect(() => {
    const paymentStatus = searchParams.get('payment')
    const transactionId = Number(searchParams.get('transactionId') || 0)
    const sessionId = String(searchParams.get('session_id') || '').trim()

    if (paymentStatus !== 'success' || !transactionId || !sessionId) {
      if (paymentStatus === 'cancel') {
        setPaymentMessage('Paiement annulé.')
      }
      return
    }

    let isMounted = true

    const verifyCheckout = async () => {
      try {
        setError('')
        setPaymentMessage('Validation du paiement en cours...')

        const response = await fetch(
          `${apiBaseUrl}/api/transactions/verify-checkout?userId=${currentUser.id}&transactionId=${transactionId}&sessionId=${encodeURIComponent(sessionId)}`,
        )

        if (!response.ok) {
          const message = await getApiErrorMessage(
            response,
            'Impossible de valider le paiement pour le moment.',
          )
          throw new Error(message)
        }

        const data = await response.json()

        if (!isMounted) {
          return
        }

        setPaymentMessage(data?.message || 'Paiement validé avec succès.')

        await Promise.all([
          loadPurchaseRequests(selectedConversationId, { silent: true }),
          loadMessages(selectedConversationId, { silent: true }),
          loadConversations({ silent: true }),
        ])

        const nextConversationId = selectedConversationId
          ? { conversationId: String(selectedConversationId) }
          : {}

        setSearchParams(nextConversationId, { replace: true })
      } catch (verificationError) {
        if (isMounted) {
          setError(verificationError.message)
          setPaymentMessage('')
        }
      }
    }

    verifyCheckout()

    return () => {
      isMounted = false
    }
  }, [apiBaseUrl, currentUser.id, searchParams, selectedConversationId])

  const handleSendMessage = async (event) => {
    event.preventDefault()
    const safeMessage = messageInput.trim()

    if (!safeMessage || !selectedConversationId || isSending) {
      return
    }

    try {
      setIsSending(true)
      setError('')

      const response = await fetch(
        `${apiBaseUrl}/api/messages/conversations/${selectedConversationId}/messages`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: currentUser.id,
            content: safeMessage,
          }),
        },
      )

      if (!response.ok) {
        const message = await getApiErrorMessage(
          response,
          'Impossible d’envoyer le message pour le moment.',
        )
        throw new Error(message)
      }

      setMessageInput('')
      await Promise.all([
        loadMessages(selectedConversationId),
        loadPurchaseRequests(selectedConversationId),
        markConversationAsRead(selectedConversationId),
        loadConversations(),
      ])
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setIsSending(false)
    }
  }

  const handlePurchaseDecision = async (requestId, decision) => {
    if (!requestId || !decision) {
      return
    }

    setProcessingRequestId(requestId)
    setError('')

    try {
      const response = await fetch(`${apiBaseUrl}/api/purchases/requests/${requestId}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUser.id,
          decision,
        }),
      })

      if (!response.ok) {
        const message = await getApiErrorMessage(
          response,
          'Impossible de traiter la demande d’achat pour le moment.',
        )
        throw new Error(message)
      }

      await Promise.all([
        loadPurchaseRequests(selectedConversationId),
        loadMessages(selectedConversationId),
        loadConversations(),
      ])
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setProcessingRequestId(null)
    }
  }

  const handleStartCheckout = async (requestId) => {
    if (!requestId) {
      return
    }

    try {
      setStartingCheckoutRequestId(requestId)
      setError('')
      setPaymentMessage('')

      const response = await fetch(`${apiBaseUrl}/api/purchases/requests/${requestId}/checkout-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.id }),
      })

      if (!response.ok) {
        const message = await getApiErrorMessage(
          response,
          'Impossible de démarrer le paiement pour le moment.',
        )
        throw new Error(message)
      }

      const data = await response.json()
      const checkoutUrl = String(data?.checkoutUrl || '').trim()

      if (!checkoutUrl) {
        throw new Error('URL de paiement indisponible pour le moment.')
      }

      window.location.href = checkoutUrl
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setStartingCheckoutRequestId(null)
    }
  }

  const handleOpenReceipt = async (transactionId) => {
    if (!transactionId) {
      return
    }

    try {
      setOpeningReceiptTransactionId(transactionId)
      setError('')

      const response = await fetch(
        `${apiBaseUrl}/api/transactions/${transactionId}/receipt?userId=${currentUser.id}`,
      )

      if (!response.ok) {
        const message = await getApiErrorMessage(
          response,
          'Impossible de charger la facture/reçu pour le moment.',
        )
        throw new Error(message)
      }

      const data = await response.json()
      const receiptUrl = String(data?.receiptUrl || '').trim()

      if (!receiptUrl) {
        throw new Error('Reçu indisponible pour cette transaction.')
      }

      window.open(receiptUrl, '_blank', 'noopener,noreferrer')
    } catch (receiptError) {
      setError(receiptError.message)
    } finally {
      setOpeningReceiptTransactionId(null)
    }
  }

  const getShippingForm = (transactionId) => {
    const existing = shippingForms[transactionId]

    if (existing) {
      return existing
    }

    return {
      fullName: '',
      addressLine1: '',
      addressLine2: '',
      postalCode: '',
      city: '',
      country: 'France',
      phone: '',
    }
  }

  const handleShippingFieldChange = (transactionId, field, value) => {
    setShippingForms((previous) => ({
      ...previous,
      [transactionId]: {
        ...getShippingForm(transactionId),
        [field]: value,
      },
    }))
  }

  const handleSubmitShippingAddress = async (transactionId) => {
    if (!transactionId) {
      return
    }

    const form = getShippingForm(transactionId)

    try {
      setSubmittingShippingTransactionId(transactionId)
      setError('')

      const response = await fetch(
        `${apiBaseUrl}/api/transactions/${transactionId}/shipping-address`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: currentUser.id,
            fullName: form.fullName,
            addressLine1: form.addressLine1,
            addressLine2: form.addressLine2,
            postalCode: form.postalCode,
            city: form.city,
            country: form.country,
            phone: form.phone,
          }),
        },
      )

      if (!response.ok) {
        const message = await getApiErrorMessage(
          response,
          'Impossible d’enregistrer l’adresse de livraison pour le moment.',
        )
        throw new Error(message)
      }

      await Promise.all([
        loadPurchaseRequests(selectedConversationId),
        loadMessages(selectedConversationId),
        loadConversations({ silent: true }),
      ])
    } catch (shippingError) {
      setError(shippingError.message)
    } finally {
      setSubmittingShippingTransactionId(null)
    }
  }

  const handleBuyFromConversation = async () => {
    if (!selectedConversation?.listing_id) {
      return
    }

    try {
      setIsSending(true)
      setError('')

      const response = await fetch(`${apiBaseUrl}/api/purchases/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUser.id,
          listingId: selectedConversation.listing_id,
        }),
      })

      if (!response.ok) {
        const message = await getApiErrorMessage(
          response,
          'Impossible d’envoyer la demande d’achat pour le moment.',
        )
        throw new Error(message)
      }

      await Promise.all([
        loadPurchaseRequests(selectedConversationId),
        loadMessages(selectedConversationId),
        loadConversations(),
      ])
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setIsSending(false)
    }
  }

  return (
    <section className="discussion-page">
      <h1>Discussion</h1>

      {error && <p className="error-message">{error}</p>}
      {paymentMessage && <p className="success-message">{paymentMessage}</p>}

      <div className="discussion-layout">
        <aside className="discussion-list">
          <div className="discussion-list-header">
            <h2>Conversations</h2>
            <button type="button" className="button-secondary" onClick={loadConversations}>
              Actualiser
            </button>
          </div>

          {isLoadingConversations && <p>Chargement...</p>}

          {!isLoadingConversations && conversations.length === 0 && (
            <p>Aucune conversation pour le moment.</p>
          )}

          {!isLoadingConversations && conversations.length > 0 && (
            <ul className="conversation-list-items">
              {conversations.map((conversation) => {
                const isActive = conversation.id === selectedConversationId

                return (
                  <li key={conversation.id}>
                    <button
                      type="button"
                      className={`conversation-item ${isActive ? 'active' : ''}`}
                      onClick={() => setSelectedConversationId(conversation.id)}
                    >
                      <span className="conversation-title">{conversation.listing_title}</span>
                      <span className="conversation-meta">
                        Avec {conversation.other_user_name || 'Utilisateur'}
                      </span>
                      <span className="conversation-last">
                        {conversation.last_message || 'Aucun message envoyé pour le moment.'}
                      </span>
                      {Number(conversation.unread_count) > 0 && (
                        <span className="conversation-unread-badge">
                          {Number(conversation.unread_count) > 99
                            ? '99+'
                            : Number(conversation.unread_count)}
                        </span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </aside>

        <section className="discussion-thread">
          {selectedConversation ? (
            <>
              <header className="thread-header">
                <h2>{selectedConversation.listing_title}</h2>
                <p>
                  Avec{' '}
                  <button
                    type="button"
                    className="button-secondary"
                    onClick={() =>
                      navigate(`/utilisateur/${selectedConversation.other_user_id}/annonces`)
                    }
                  >
                    {selectedConversation.other_user_name || 'Utilisateur'}
                  </button>
                </p>

                <div className="listing-actions">
                  <Link
                    className="button-secondary"
                    to={`/annonce/${selectedConversation.listing_id}`}
                  >
                    Voir l’annonce
                  </Link>

                  {Number(selectedConversation.buyer_id) === Number(currentUser.id) && (
                    <button
                      type="button"
                      className="button-primary"
                      onClick={handleBuyFromConversation}
                      disabled={isSending}
                    >
                      {isSending ? 'Envoi...' : 'Acheter'}
                    </button>
                  )}
                </div>
              </header>

              <div className="thread-messages">
                {isLoadingPurchaseRequests && <p>Chargement des demandes d’achat...</p>}

                {isLoadingMessages && <p>Chargement des messages...</p>}

                {!isLoadingMessages && timelineItems.length === 0 && (
                  <p>Commence la discussion avec le vendeur.</p>
                )}

                {!isLoadingMessages && timelineItems.length > 0 && (
                  <ul className="message-list-items">
                    {timelineItems.map((item) => {
                      if (item.type === 'purchase-request') {
                        const request = item.payload
                        const isSeller = Number(request.seller_id) === Number(currentUser.id)
                        const isBuyer = Number(request.buyer_id) === Number(currentUser.id)
                        const canDecide = isSeller && request.status === 'pending'
                        const canPayNow =
                          isBuyer &&
                          request.status === 'accepted' &&
                          !Boolean(request.listing_is_sold) &&
                          request.latest_transaction_status !== 'succeeded'
                        const canViewReceipt =
                          isBuyer &&
                          request.latest_transaction_status === 'succeeded' &&
                          Number(request.latest_transaction_id) > 0
                        const needsShippingAddress =
                          isBuyer &&
                          request.latest_transaction_status === 'succeeded' &&
                          request.listing_delivery_method === 'livraison' &&
                          !request.latest_shipping_address_submitted_at &&
                          Number(request.latest_transaction_id) > 0

                        const shippingForm = getShippingForm(
                          Number(request.latest_transaction_id),
                        )

                        const statusLabelMap = {
                          pending: 'en attente',
                          accepted: 'acceptée',
                          refused: 'refusée',
                        }

                        return (
                          <li key={item.id} className="message-bubble their">
                            <p>
                              Demande d’achat • Statut: <strong>{statusLabelMap[request.status] || request.status}</strong>
                            </p>

                            {canDecide && (
                              <div className="listing-actions">
                                <button
                                  type="button"
                                  className="button-primary"
                                  onClick={() => handlePurchaseDecision(request.id, 'accept')}
                                  disabled={processingRequestId === request.id}
                                >
                                  Accepter
                                </button>
                                <button
                                  type="button"
                                  className="button-danger"
                                  onClick={() => handlePurchaseDecision(request.id, 'refuse')}
                                  disabled={processingRequestId === request.id}
                                >
                                  Refuser
                                </button>
                              </div>
                            )}

                            {canPayNow && (
                              <div className="listing-actions">
                                <button
                                  type="button"
                                  className="button-primary"
                                  onClick={() => handleStartCheckout(request.id)}
                                  disabled={startingCheckoutRequestId === request.id}
                                >
                                  {startingCheckoutRequestId === request.id
                                    ? 'Redirection...'
                                    : 'Payer maintenant'}
                                </button>
                              </div>
                            )}

                            {canViewReceipt && (
                              <div className="listing-actions">
                                <button
                                  type="button"
                                  className="button-secondary"
                                  onClick={() =>
                                    handleOpenReceipt(Number(request.latest_transaction_id))
                                  }
                                  disabled={
                                    openingReceiptTransactionId ===
                                    Number(request.latest_transaction_id)
                                  }
                                >
                                  {openingReceiptTransactionId ===
                                  Number(request.latest_transaction_id)
                                    ? 'Ouverture...'
                                    : 'Voir facture'}
                                </button>
                              </div>
                            )}

                            {needsShippingAddress && (
                              <div className="auth-form" style={{ marginTop: '0.75rem' }}>
                                <p>
                                  <strong>Livraison :</strong> renseigne ton adresse après paiement.
                                </p>

                                <label>
                                  Nom complet
                                  <input
                                    type="text"
                                    value={shippingForm.fullName}
                                    onChange={(event) =>
                                      handleShippingFieldChange(
                                        Number(request.latest_transaction_id),
                                        'fullName',
                                        event.target.value,
                                      )
                                    }
                                  />
                                </label>

                                <label>
                                  Adresse
                                  <input
                                    type="text"
                                    value={shippingForm.addressLine1}
                                    onChange={(event) =>
                                      handleShippingFieldChange(
                                        Number(request.latest_transaction_id),
                                        'addressLine1',
                                        event.target.value,
                                      )
                                    }
                                  />
                                </label>

                                <label>
                                  Complément d’adresse (optionnel)
                                  <input
                                    type="text"
                                    value={shippingForm.addressLine2}
                                    onChange={(event) =>
                                      handleShippingFieldChange(
                                        Number(request.latest_transaction_id),
                                        'addressLine2',
                                        event.target.value,
                                      )
                                    }
                                  />
                                </label>

                                <label>
                                  Code postal
                                  <input
                                    type="text"
                                    value={shippingForm.postalCode}
                                    onChange={(event) =>
                                      handleShippingFieldChange(
                                        Number(request.latest_transaction_id),
                                        'postalCode',
                                        event.target.value,
                                      )
                                    }
                                  />
                                </label>

                                <label>
                                  Ville
                                  <input
                                    type="text"
                                    value={shippingForm.city}
                                    onChange={(event) =>
                                      handleShippingFieldChange(
                                        Number(request.latest_transaction_id),
                                        'city',
                                        event.target.value,
                                      )
                                    }
                                  />
                                </label>

                                <label>
                                  Pays
                                  <input
                                    type="text"
                                    value={shippingForm.country}
                                    onChange={(event) =>
                                      handleShippingFieldChange(
                                        Number(request.latest_transaction_id),
                                        'country',
                                        event.target.value,
                                      )
                                    }
                                  />
                                </label>

                                <label>
                                  Téléphone (optionnel)
                                  <input
                                    type="text"
                                    value={shippingForm.phone}
                                    onChange={(event) =>
                                      handleShippingFieldChange(
                                        Number(request.latest_transaction_id),
                                        'phone',
                                        event.target.value,
                                      )
                                    }
                                  />
                                </label>

                                <button
                                  type="button"
                                  className="button-primary"
                                  onClick={() =>
                                    handleSubmitShippingAddress(
                                      Number(request.latest_transaction_id),
                                    )
                                  }
                                  disabled={
                                    submittingShippingTransactionId ===
                                    Number(request.latest_transaction_id)
                                  }
                                >
                                  {submittingShippingTransactionId ===
                                  Number(request.latest_transaction_id)
                                    ? 'Enregistrement...'
                                    : 'Enregistrer adresse de livraison'}
                                </button>
                              </div>
                            )}
                          </li>
                        )
                      }

                      const message = item.payload
                      const isMine = Number(message.sender_id) === Number(currentUser.id)

                      return (
                        <li key={item.id} className={`message-bubble ${isMine ? 'mine' : 'their'}`}>
                          <p>{message.content}</p>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>

              <form className="thread-input" onSubmit={handleSendMessage}>
                <input
                  type="text"
                  value={messageInput}
                  onChange={(event) => setMessageInput(event.target.value)}
                  placeholder="Écris ton message..."
                  maxLength={1200}
                />
                <button type="submit" className="button-primary" disabled={isSending}>
                  {isSending ? 'Envoi...' : 'Envoyer'}
                </button>
              </form>
            </>
          ) : (
            <p>Sélectionne une conversation.</p>
          )}
        </section>
      </div>
    </section>
  )
}

export default DiscussionPage

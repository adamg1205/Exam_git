const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, '.env') })

const express = require('express')
const cors = require('cors')
const bcrypt = require('bcryptjs')
const Stripe = require('stripe')
const { pool } = require('./db')

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null

const USER_ROLES = {
  BUYER: 'acheteur',
  SELLER: 'vendeur',
  ADMIN: 'admin',
}

const LISTING_CATEGORIES = {
  CARS: 'voitures',
  FURNITURE: 'mobiliers',
  ENTERTAINMENT: 'divertissement',
}

const DELIVERY_METHODS = {
  HAND_DELIVERY: 'remise_main_propre',
  SHIPPING: 'livraison',
}

const LISTING_CATEGORY_VALUES = Object.values(LISTING_CATEGORIES)
const MAX_LISTING_IMAGES = 3
const MAX_IMAGES_JSON_CHARS = 1_500_000
const STRIPE_CONNECT_COUNTRY = String(process.env.STRIPE_CONNECT_COUNTRY || 'FR').toUpperCase()
const PLATFORM_FEE_PERCENT = Number(process.env.PLATFORM_FEE_PERCENT || 0)

const GENERIC_ERROR_MESSAGE = 'Une erreur est survenue. Réessaie dans quelques instants.'

async function ensureBannedColumnExists() {
  try {
    await pool.query('SELECT is_banned FROM users LIMIT 1')
  } catch (error) {
    if (error.message.includes('Unknown column')) {
      try {
        await pool.query('ALTER TABLE users ADD COLUMN is_banned BOOLEAN NOT NULL DEFAULT FALSE')
      } catch (alterError) {
        // Column might already exist, ignore error
      }
    }
  }
}

async function ensureStripeConnectColumnsExist() {
  const [columns] = await pool.query(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'users'
       AND COLUMN_NAME IN ('stripe_account_id', 'stripe_charges_enabled', 'stripe_details_submitted', 'stripe_payouts_enabled')`,
  )

  const existingColumns = new Set(columns.map((column) => column.COLUMN_NAME))

  if (!existingColumns.has('stripe_account_id')) {
    await pool.query('ALTER TABLE users ADD COLUMN stripe_account_id VARCHAR(255) NULL')
  }

  if (!existingColumns.has('stripe_charges_enabled')) {
    await pool.query('ALTER TABLE users ADD COLUMN stripe_charges_enabled BOOLEAN NOT NULL DEFAULT FALSE')
  }

  if (!existingColumns.has('stripe_details_submitted')) {
    await pool.query('ALTER TABLE users ADD COLUMN stripe_details_submitted BOOLEAN NOT NULL DEFAULT FALSE')
  }

  if (!existingColumns.has('stripe_payouts_enabled')) {
    await pool.query('ALTER TABLE users ADD COLUMN stripe_payouts_enabled BOOLEAN NOT NULL DEFAULT FALSE')
  }
}

async function ensureListingColumnsExist() {
  const [columns] = await pool.query(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'listings'
        AND COLUMN_NAME IN ('category', 'mileage_km', 'model_year', 'images_json', 'is_sold', 'sold_to_user_id', 'delivery_method')`,
  )

  const existingColumns = new Set(columns.map((column) => column.COLUMN_NAME))

  if (!existingColumns.has('category')) {
    await pool.query(
      `ALTER TABLE listings
       ADD COLUMN category VARCHAR(32) NOT NULL DEFAULT '${LISTING_CATEGORIES.ENTERTAINMENT}'`,
    )
  }

  if (!existingColumns.has('mileage_km')) {
    await pool.query('ALTER TABLE listings ADD COLUMN mileage_km INT NULL')
  }

  if (!existingColumns.has('model_year')) {
    await pool.query('ALTER TABLE listings ADD COLUMN model_year INT NULL')
  }

  if (!existingColumns.has('images_json')) {
    await pool.query('ALTER TABLE listings ADD COLUMN images_json LONGTEXT NULL')
  }

  if (!existingColumns.has('is_sold')) {
    await pool.query('ALTER TABLE listings ADD COLUMN is_sold BOOLEAN NOT NULL DEFAULT FALSE')
  }

  if (!existingColumns.has('sold_to_user_id')) {
    await pool.query('ALTER TABLE listings ADD COLUMN sold_to_user_id INT NULL')
  }

  if (!existingColumns.has('delivery_method')) {
    await pool.query(
      `ALTER TABLE listings
       ADD COLUMN delivery_method VARCHAR(32) NOT NULL DEFAULT '${DELIVERY_METHODS.HAND_DELIVERY}'`,
    )
  }
}

async function ensureMessagingTablesExist() {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS conversations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      listing_id INT NOT NULL,
      buyer_id INT NOT NULL,
      seller_id INT NOT NULL,
      buyer_last_read_at TIMESTAMP NULL DEFAULT NULL,
      seller_last_read_at TIMESTAMP NULL DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_listing_buyer (listing_id, buyer_id),
      INDEX idx_conversations_buyer (buyer_id),
      INDEX idx_conversations_seller (seller_id),
      INDEX idx_conversations_updated_at (updated_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  )

  await pool.query(
    `CREATE TABLE IF NOT EXISTS conversation_messages (
      id INT AUTO_INCREMENT PRIMARY KEY,
      conversation_id INT NOT NULL,
      sender_id INT NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_messages_conversation_created (conversation_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  )

  const [conversationColumns] = await pool.query(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'conversations'
       AND COLUMN_NAME IN ('buyer_last_read_at', 'seller_last_read_at')`,
  )

  const existingConversationColumns = new Set(
    conversationColumns.map((column) => column.COLUMN_NAME),
  )

  if (!existingConversationColumns.has('buyer_last_read_at')) {
    await pool.query('ALTER TABLE conversations ADD COLUMN buyer_last_read_at TIMESTAMP NULL DEFAULT NULL')
  }

  if (!existingConversationColumns.has('seller_last_read_at')) {
    await pool.query('ALTER TABLE conversations ADD COLUMN seller_last_read_at TIMESTAMP NULL DEFAULT NULL')
  }
}

async function ensureFavoritesTableExists() {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS favorites (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      listing_id INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_user_listing_favorite (user_id, listing_id),
      INDEX idx_favorites_user (user_id),
      INDEX idx_favorites_listing (listing_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  )
}

async function ensurePurchaseRequestsTableExists() {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS purchase_requests (
      id INT AUTO_INCREMENT PRIMARY KEY,
      listing_id INT NOT NULL,
      conversation_id INT NOT NULL,
      buyer_id INT NOT NULL,
      seller_id INT NOT NULL,
      status ENUM('pending', 'accepted', 'refused') NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_purchase_requests_listing (listing_id),
      INDEX idx_purchase_requests_conversation (conversation_id),
      INDEX idx_purchase_requests_seller_status (seller_id, status),
      INDEX idx_purchase_requests_buyer_status (buyer_id, status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  )
}

async function ensureTransactionsTableExists() {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS transactions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      purchase_request_id INT NOT NULL,
      listing_id INT NOT NULL,
      buyer_id INT NOT NULL,
      seller_id INT NOT NULL,
      amount_eur DECIMAL(10,2) NOT NULL,
      currency VARCHAR(10) NOT NULL DEFAULT 'eur',
      status ENUM('pending', 'succeeded', 'failed') NOT NULL DEFAULT 'pending',
      stripe_checkout_session_id VARCHAR(255) NULL,
      stripe_payment_intent_id VARCHAR(255) NULL,
      shipping_address_json LONGTEXT NULL,
      shipping_address_submitted_at TIMESTAMP NULL DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_transactions_request (purchase_request_id),
      INDEX idx_transactions_listing (listing_id),
      INDEX idx_transactions_buyer (buyer_id),
      INDEX idx_transactions_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  )

  const [columns] = await pool.query(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'transactions'
       AND COLUMN_NAME IN ('shipping_address_json', 'shipping_address_submitted_at')`,
  )

  const existingColumns = new Set(columns.map((column) => column.COLUMN_NAME))

  if (!existingColumns.has('shipping_address_json')) {
    await pool.query('ALTER TABLE transactions ADD COLUMN shipping_address_json LONGTEXT NULL')
  }

  if (!existingColumns.has('shipping_address_submitted_at')) {
    await pool.query(
      'ALTER TABLE transactions ADD COLUMN shipping_address_submitted_at TIMESTAMP NULL DEFAULT NULL',
    )
  }
}

// Initialize database columns on startup
ensureBannedColumnExists().catch(err => console.error('Failed to ensure banned column:', err))
ensureListingColumnsExist().catch(err => console.error('Failed to ensure listing columns:', err))
ensureMessagingTablesExist().catch(err => console.error('Failed to ensure messaging tables:', err))
ensureFavoritesTableExists().catch(err => console.error('Failed to ensure favorites table:', err))
ensurePurchaseRequestsTableExists().catch(err => console.error('Failed to ensure purchase requests table:', err))
ensureTransactionsTableExists().catch(err => console.error('Failed to ensure transactions table:', err))
ensureStripeConnectColumnsExist().catch(err => console.error('Failed to ensure Stripe Connect columns:', err))

function sendError(res, status, message) {
  return res.status(status).json({ message })
}

function isStrongPassword(value) {
  return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(String(value || ''))
}

function parseOptionalInt(value) {
  if (value === undefined || value === null || value === '') {
    return null
  }

  const parsedValue = Number(value)

  if (!Number.isInteger(parsedValue)) {
    return Number.NaN
  }

  return parsedValue
}

function eurosToCents(value) {
  const amount = Number(value)

  if (!Number.isFinite(amount) || amount <= 0) {
    return Number.NaN
  }

  return Math.round(amount * 100)
}

function validateDeliveryMethod(value) {
  const safeValue = String(value || '').trim()
  const allowedValues = Object.values(DELIVERY_METHODS)

  if (!allowedValues.includes(safeValue)) {
    return {
      isValid: false,
      value: null,
      message: 'Merci de choisir le mode de remise (remise en main propre ou livraison).',
    }
  }

  return {
    isValid: true,
    value: safeValue,
    message: '',
  }
}

function computePlatformFeeCents(amountCents) {
  if (!Number.isFinite(PLATFORM_FEE_PERCENT) || PLATFORM_FEE_PERCENT <= 0) {
    return 0
  }

  const rawFee = (amountCents * PLATFORM_FEE_PERCENT) / 100
  return Math.max(0, Math.floor(rawFee))
}

function normalizeListingImages(images) {
  if (!Array.isArray(images)) {
    return []
  }

  return images
    .map((image) => String(image || '').trim())
    .filter((image) => image.startsWith('data:image/'))
    .slice(0, MAX_LISTING_IMAGES)
}

function validateListingCategoryAndCarFields(category, mileageKm, modelYear) {
  const safeCategory = String(category || '').trim().toLowerCase()

  if (!LISTING_CATEGORY_VALUES.includes(safeCategory)) {
    return {
      isValid: false,
      message: 'La catégorie doit être voitures, mobiliers ou divertissement.',
    }
  }

  const parsedMileageKm = parseOptionalInt(mileageKm)
  const parsedModelYear = parseOptionalInt(modelYear)

  if (Number.isNaN(parsedMileageKm) || Number.isNaN(parsedModelYear)) {
    return {
      isValid: false,
      message: 'Le kilométrage et l’année du modèle doivent être des nombres entiers.',
    }
  }

  if (safeCategory === LISTING_CATEGORIES.CARS) {
    const currentYear = new Date().getFullYear()

    if (parsedMileageKm === null || parsedMileageKm < 0) {
      return {
        isValid: false,
        message: 'Pour une voiture, le kilométrage est obligatoire et doit être supérieur ou égal à 0.',
      }
    }

    if (parsedModelYear === null || parsedModelYear < 1900 || parsedModelYear > currentYear + 1) {
      return {
        isValid: false,
        message: 'Pour une voiture, l’année du modèle est obligatoire et doit être valide.',
      }
    }

    return {
      isValid: true,
      category: safeCategory,
      mileageKm: parsedMileageKm,
      modelYear: parsedModelYear,
    }
  }

  return {
    isValid: true,
    category: safeCategory,
    mileageKm: null,
    modelYear: null,
  }
}

function ensureUserNotBanned(res, user) {
  if (Boolean(user?.is_banned)) {
    sendError(
      res,
      403,
      'Votre compte est banni. Vous avez violé les règles et conditions d’utilisation de la plateforme.',
    )
    return false
  }

  return true
}

async function getUserById(userId) {
  try {
    const [rows] = await pool.query(
      `SELECT
         id,
         email,
         password_hash,
         display_name,
         role,
         is_banned,
         stripe_account_id,
         stripe_charges_enabled,
         stripe_details_submitted,
         stripe_payouts_enabled
       FROM users
       WHERE id = ?
       LIMIT 1`,
      [userId],
    )

    return rows[0] || null
  } catch (error) {
    if (String(error?.message || '').includes('Unknown column')) {
      const [fallbackRows] = await pool.query(
        'SELECT id, email, password_hash, display_name, role, is_banned FROM users WHERE id = ? LIMIT 1',
        [userId],
      )

      const fallbackUser = fallbackRows[0] || null

      if (!fallbackUser) {
        return null
      }

      return {
        ...fallbackUser,
        stripe_account_id: null,
        stripe_charges_enabled: false,
        stripe_details_submitted: false,
        stripe_payouts_enabled: false,
      }
    }

    throw error
  }
}

async function getUserByEmail(email) {
  const [rows] = await pool.query(
    `SELECT
       id,
       email,
       password_hash,
       display_name,
       role,
       is_banned,
       stripe_account_id,
       stripe_charges_enabled,
       stripe_details_submitted,
       stripe_payouts_enabled
     FROM users
     WHERE email = ?
     LIMIT 1`,
    [email],
  )

  return rows[0] || null
}

function toSessionUser(user) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.display_name,
    role: user.role,
    isBanned: Boolean(user.is_banned),
    stripeAccountId: user.stripe_account_id || null,
    stripeChargesEnabled: Boolean(user.stripe_charges_enabled),
    stripeDetailsSubmitted: Boolean(user.stripe_details_submitted),
    stripePayoutsEnabled: Boolean(user.stripe_payouts_enabled),
  }
}

async function syncStripeConnectStatus(user) {
  if (!stripe || !user?.stripe_account_id) {
    return user
  }

  try {
    const stripeAccount = await stripe.accounts.retrieve(user.stripe_account_id)
    const nextChargesEnabled = Boolean(stripeAccount?.charges_enabled)
    const nextDetailsSubmitted = Boolean(stripeAccount?.details_submitted)
    const nextPayoutsEnabled = Boolean(stripeAccount?.payouts_enabled)

    await pool.query(
      `UPDATE users
       SET stripe_charges_enabled = ?,
           stripe_details_submitted = ?,
           stripe_payouts_enabled = ?
       WHERE id = ?`,
      [nextChargesEnabled, nextDetailsSubmitted, nextPayoutsEnabled, user.id],
    )

    return {
      ...user,
      stripe_charges_enabled: nextChargesEnabled,
      stripe_details_submitted: nextDetailsSubmitted,
      stripe_payouts_enabled: nextPayoutsEnabled,
    }
  } catch (_error) {
    return user
  }
}

async function getOrCreateConversationForListing(listingId, buyerId, sellerId) {
  const [existingConversationRows] = await pool.query(
    `SELECT id
     FROM conversations
     WHERE listing_id = ? AND buyer_id = ?
     LIMIT 1`,
    [listingId, buyerId],
  )

  if (existingConversationRows.length > 0) {
    return existingConversationRows[0].id
  }

  const [insertResult] = await pool.query(
    `INSERT INTO conversations (listing_id, buyer_id, seller_id, buyer_last_read_at, seller_last_read_at)
     VALUES (?, ?, ?, NOW(), NULL)`,
    [listingId, buyerId, sellerId],
  )

  return insertResult.insertId
}

const app = express()
const PORT = Number(process.env.PORT || 4000)

app.use(cors())
app.use(express.json({ limit: '15mb' }))

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1')
    res.json({ status: 'ok' })
  } catch (error) {
    sendError(res, 500, 'La base de données est indisponible pour le moment.')
  }
})

app.get('/api/listings/latest', async (_req, res) => {
  try {
    await ensureListingColumnsExist()

    const [rows] = await pool.query(
      `SELECT id, user_id, title, description, price_eur, city, category, mileage_km, model_year, images_json, delivery_method, is_sold, created_at
       FROM listings
       WHERE is_sold = FALSE
       ORDER BY created_at DESC
       LIMIT 12`,
    )

    res.json(rows)
  } catch (error) {
    sendError(res, 500, 'Impossible de charger les annonces pour le moment.')
  }
})

app.get('/api/listings/mine', async (req, res) => {
  const { userId } = req.query
  const safeUserId = Number(userId)

  if (!safeUserId) {
    return sendError(res, 400, 'Utilisateur invalide.')
  }

  try {
    await ensureListingColumnsExist()
    await ensureStripeConnectColumnsExist()

    const user = await getUserById(safeUserId)

    if (!user) {
      return sendError(res, 404, 'Compte introuvable.')
    }

    if (!ensureUserNotBanned(res, user)) {
      return
    }

    const [rows] = await pool.query(
      `SELECT id, title, description, price_eur, city, category, mileage_km, model_year, images_json, delivery_method, is_sold, created_at
       FROM listings
       WHERE user_id = ?
       ORDER BY created_at DESC`,
      [safeUserId],
    )

    res.json(rows)
  } catch (error) {
    sendError(res, 500, 'Impossible de charger tes annonces pour le moment.')
  }
})

app.get('/api/listings/by-user/:sellerUserId', async (req, res) => {
  const { sellerUserId } = req.params
  const safeSellerUserId = Number(sellerUserId)

  if (!safeSellerUserId) {
    return sendError(res, 400, 'Vendeur invalide.')
  }

  try {
    await ensureListingColumnsExist()

    const [sellerRows] = await pool.query(
      'SELECT id, display_name FROM users WHERE id = ? LIMIT 1',
      [safeSellerUserId],
    )

    if (sellerRows.length === 0) {
      return sendError(res, 404, 'Vendeur introuvable.')
    }

    const seller = sellerRows[0]

    const [rows] = await pool.query(
      `SELECT id, user_id, title, description, price_eur, city, category, mileage_km, model_year, images_json, delivery_method, is_sold, created_at
       FROM listings
       WHERE user_id = ? AND is_sold = FALSE
       ORDER BY created_at DESC`,
      [safeSellerUserId],
    )

    res.json({
      seller: {
        id: seller.id,
        displayName: seller.display_name,
      },
      listings: Array.isArray(rows) ? rows : [],
    })
  } catch (error) {
    sendError(res, 500, 'Impossible de charger les annonces de ce vendeur pour le moment.')
  }
})

app.get('/api/listings/:listingId', async (req, res) => {
  const { listingId } = req.params
  const { userId } = req.query
  const safeListingId = Number(listingId)
  const safeUserId = Number(userId)

  if (!safeListingId) {
    return sendError(res, 400, 'Annonce invalide.')
  }

  try {
    await ensureListingColumnsExist()

    const [rows] = await pool.query(
      `SELECT
         l.id,
         l.user_id,
         l.title,
         l.description,
         l.price_eur,
         l.city,
         l.category,
         l.mileage_km,
         l.model_year,
         l.images_json,
         l.delivery_method,
         l.is_sold,
         l.sold_to_user_id,
         l.created_at,
         u.display_name AS seller_name
       FROM listings l
       LEFT JOIN users u ON u.id = l.user_id
       WHERE l.id = ?
       LIMIT 1`,
      [safeListingId],
    )

    if (rows.length === 0) {
      return sendError(res, 404, 'Annonce introuvable.')
    }

    const listing = rows[0]

    if (safeUserId) {
      await ensureFavoritesTableExists()
      const [favoriteRows] = await pool.query(
        `SELECT id
         FROM favorites
         WHERE user_id = ? AND listing_id = ?
         LIMIT 1`,
        [safeUserId, safeListingId],
      )

      listing.is_favorite = favoriteRows.length > 0
    } else {
      listing.is_favorite = false
    }

    res.json(listing)
  } catch (error) {
    sendError(res, 500, 'Impossible de charger cette annonce pour le moment.')
  }
})

app.get('/api/favorites', async (req, res) => {
  const { userId } = req.query
  const safeUserId = Number(userId)

  if (!safeUserId) {
    return sendError(res, 400, 'Utilisateur invalide.')
  }

  try {
    await ensureFavoritesTableExists()
    await ensureListingColumnsExist()

    const user = await getUserById(safeUserId)

    if (!user) {
      return sendError(res, 404, 'Compte introuvable.')
    }

    if (!ensureUserNotBanned(res, user)) {
      return
    }

    const [rows] = await pool.query(
      `SELECT
         l.id,
         l.user_id,
         l.title,
         l.description,
         l.price_eur,
         l.city,
         l.category,
         l.mileage_km,
         l.model_year,
         l.images_json,
         l.created_at,
         f.created_at AS favorited_at
       FROM favorites f
       INNER JOIN listings l ON l.id = f.listing_id
       WHERE f.user_id = ?
       ORDER BY f.created_at DESC`,
      [safeUserId],
    )

    res.json(rows)
  } catch (error) {
    sendError(res, 500, 'Impossible de charger tes favoris pour le moment.')
  }
})

app.post('/api/favorites/toggle', async (req, res) => {
  const { userId, listingId } = req.body || {}
  const safeUserId = Number(userId)
  const safeListingId = Number(listingId)

  if (!safeUserId || !safeListingId) {
    return sendError(res, 400, 'Données invalides.')
  }

  try {
    await ensureFavoritesTableExists()

    const user = await getUserById(safeUserId)

    if (!user) {
      return sendError(res, 404, 'Compte introuvable.')
    }

    if (!ensureUserNotBanned(res, user)) {
      return
    }

    const [listingRows] = await pool.query(
      'SELECT id FROM listings WHERE id = ? LIMIT 1',
      [safeListingId],
    )

    if (listingRows.length === 0) {
      return sendError(res, 404, 'Annonce introuvable.')
    }

    const [favoriteRows] = await pool.query(
      `SELECT id
       FROM favorites
       WHERE user_id = ? AND listing_id = ?
       LIMIT 1`,
      [safeUserId, safeListingId],
    )

    if (favoriteRows.length > 0) {
      await pool.query('DELETE FROM favorites WHERE user_id = ? AND listing_id = ?', [
        safeUserId,
        safeListingId,
      ])

      return res.json({ isFavorite: false })
    }

    await pool.query('INSERT INTO favorites (user_id, listing_id) VALUES (?, ?)', [
      safeUserId,
      safeListingId,
    ])

    return res.json({ isFavorite: true })
  } catch (error) {
    sendError(res, 500, 'Impossible de mettre à jour tes favoris pour le moment.')
  }
})

app.post('/api/messages/start', async (req, res) => {
  const { userId, listingId } = req.body || {}
  const safeUserId = Number(userId)
  const safeListingId = Number(listingId)

  if (!safeUserId || !safeListingId) {
    return sendError(res, 400, 'Données invalides.')
  }

  try {
    await ensureMessagingTablesExist()

    const user = await getUserById(safeUserId)

    if (!user) {
      return sendError(res, 404, 'Compte introuvable.')
    }

    if (!ensureUserNotBanned(res, user)) {
      return
    }

    const [listingRows] = await pool.query(
      'SELECT id, user_id, title FROM listings WHERE id = ? LIMIT 1',
      [safeListingId],
    )

    if (listingRows.length === 0) {
      return sendError(res, 404, 'Annonce introuvable.')
    }

    const listing = listingRows[0]

    if (listing.user_id === safeUserId) {
      return sendError(res, 400, 'Tu ne peux pas te contacter toi-même.')
    }

    const conversationId = await getOrCreateConversationForListing(
      safeListingId,
      safeUserId,
      listing.user_id,
    )

    res.status(201).json({
      conversationId,
      listingId: safeListingId,
    })
  } catch (error) {
    sendError(res, 500, 'Impossible de démarrer la discussion pour le moment.')
  }
})

app.post('/api/purchases/request', async (req, res) => {
  const { userId, listingId } = req.body || {}
  const safeUserId = Number(userId)
  const safeListingId = Number(listingId)

  if (!safeUserId || !safeListingId) {
    return sendError(res, 400, 'Données invalides.')
  }

  try {
    await ensureMessagingTablesExist()
    await ensureListingColumnsExist()
    await ensurePurchaseRequestsTableExists()

    const user = await getUserById(safeUserId)

    if (!user) {
      return sendError(res, 404, 'Compte introuvable.')
    }

    if (!ensureUserNotBanned(res, user)) {
      return
    }

    const [listingRows] = await pool.query(
      'SELECT id, user_id, title, is_sold FROM listings WHERE id = ? LIMIT 1',
      [safeListingId],
    )

    if (listingRows.length === 0) {
      return sendError(res, 404, 'Annonce introuvable.')
    }

    const listing = listingRows[0]

    if (listing.user_id === safeUserId) {
      return sendError(res, 400, 'Tu ne peux pas acheter ta propre annonce.')
    }

    if (Boolean(listing.is_sold)) {
      return sendError(res, 409, 'Cette annonce est déjà vendue.')
    }

    const [existingPendingRequests] = await pool.query(
      `SELECT id
       FROM purchase_requests
       WHERE listing_id = ? AND buyer_id = ? AND status = 'pending'
       LIMIT 1`,
      [safeListingId, safeUserId],
    )

    if (existingPendingRequests.length > 0) {
      return sendError(res, 409, 'Une demande d’achat est déjà en attente pour cette annonce.')
    }

    const conversationId = await getOrCreateConversationForListing(
      safeListingId,
      safeUserId,
      listing.user_id,
    )

    const [insertResult] = await pool.query(
      `INSERT INTO purchase_requests (listing_id, conversation_id, buyer_id, seller_id, status)
       VALUES (?, ?, ?, ?, 'pending')`,
      [safeListingId, conversationId, safeUserId, listing.user_id],
    )

    await pool.query(
      `INSERT INTO conversation_messages (conversation_id, sender_id, content)
       VALUES (?, ?, ?)`,
      [conversationId, safeUserId, `Demande d’achat envoyée pour l’annonce: ${listing.title}`],
    )

    await pool.query('UPDATE conversations SET updated_at = NOW() WHERE id = ?', [conversationId])

    res.status(201).json({
      requestId: insertResult.insertId,
      conversationId,
      listingId: safeListingId,
      status: 'pending',
    })
  } catch (error) {
    sendError(res, 500, 'Impossible d’envoyer la demande d’achat pour le moment.')
  }
})

app.get('/api/messages/conversations/:conversationId/purchase-requests', async (req, res) => {
  const { conversationId } = req.params
  const { userId } = req.query
  const safeConversationId = Number(conversationId)
  const safeUserId = Number(userId)

  if (!safeConversationId || !safeUserId) {
    return sendError(res, 400, 'Données invalides.')
  }

  try {
    await ensurePurchaseRequestsTableExists()
    await ensureTransactionsTableExists()

    const user = await getUserById(safeUserId)

    if (!user) {
      return sendError(res, 404, 'Compte introuvable.')
    }

    if (!ensureUserNotBanned(res, user)) {
      return
    }

    const [conversationRows] = await pool.query(
      `SELECT id, buyer_id, seller_id
       FROM conversations
       WHERE id = ?
       LIMIT 1`,
      [safeConversationId],
    )

    if (conversationRows.length === 0) {
      return sendError(res, 404, 'Discussion introuvable.')
    }

    const conversation = conversationRows[0]
    const isParticipant =
      conversation.buyer_id === safeUserId || conversation.seller_id === safeUserId

    if (!isParticipant) {
      return sendError(res, 403, 'Accès refusé à cette discussion.')
    }

    const [requestRows] = await pool.query(
      `SELECT
         pr.id,
         pr.listing_id,
         pr.conversation_id,
         pr.buyer_id,
         pr.seller_id,
         pr.status,
         pr.created_at,
         pr.updated_at,
         l.title AS listing_title,
         l.is_sold AS listing_is_sold,
         l.delivery_method AS listing_delivery_method,
         l.sold_to_user_id,
         latest_tx.id AS latest_transaction_id,
         latest_tx.status AS latest_transaction_status,
         latest_tx.shipping_address_submitted_at AS latest_shipping_address_submitted_at
       FROM purchase_requests pr
       INNER JOIN listings l ON l.id = pr.listing_id
       LEFT JOIN transactions latest_tx ON latest_tx.id = (
         SELECT t.id
         FROM transactions t
         WHERE t.purchase_request_id = pr.id
         ORDER BY t.created_at DESC, t.id DESC
         LIMIT 1
       )
       WHERE pr.conversation_id = ?
       ORDER BY pr.created_at DESC`,
      [safeConversationId],
    )

    res.json(requestRows)
  } catch (error) {
    sendError(res, 500, 'Impossible de charger les demandes d’achat pour le moment.')
  }
})

app.post('/api/purchases/requests/:requestId/decision', async (req, res) => {
  const { requestId } = req.params
  const { userId, decision } = req.body || {}
  const safeRequestId = Number(requestId)
  const safeUserId = Number(userId)
  const safeDecision = String(decision || '').trim().toLowerCase()

  if (!safeRequestId || !safeUserId || !['accept', 'refuse'].includes(safeDecision)) {
    return sendError(res, 400, 'Données invalides.')
  }

  try {
    await ensurePurchaseRequestsTableExists()
    await ensureListingColumnsExist()
    await ensureTransactionsTableExists()

    const user = await getUserById(safeUserId)

    if (!user) {
      return sendError(res, 404, 'Compte introuvable.')
    }

    if (!ensureUserNotBanned(res, user)) {
      return
    }

    const [requestRows] = await pool.query(
      `SELECT
         pr.id,
         pr.listing_id,
         pr.conversation_id,
         pr.buyer_id,
         pr.seller_id,
         pr.status,
         l.title,
         l.is_sold,
         l.sold_to_user_id
       FROM purchase_requests pr
       INNER JOIN listings l ON l.id = pr.listing_id
       WHERE pr.id = ?
       LIMIT 1`,
      [safeRequestId],
    )

    if (requestRows.length === 0) {
      return sendError(res, 404, 'Demande d’achat introuvable.')
    }

    const request = requestRows[0]

    if (request.seller_id !== safeUserId) {
      return sendError(res, 403, 'Seul le vendeur peut accepter ou refuser cette demande.')
    }

    if (request.status !== 'pending') {
      return sendError(res, 409, 'Cette demande a déjà été traitée.')
    }

    if (safeDecision === 'accept') {
      if (Boolean(request.is_sold)) {
        return sendError(res, 409, 'Cette annonce est déjà vendue.')
      }

      const [acceptedRequests] = await pool.query(
        `SELECT id
         FROM purchase_requests
         WHERE listing_id = ?
           AND status = 'accepted'
           AND id <> ?
         LIMIT 1`,
        [request.listing_id, safeRequestId],
      )

      if (acceptedRequests.length > 0) {
        return sendError(
          res,
          409,
          'Une autre demande est déjà acceptée pour cette annonce. Traite-la d’abord.',
        )
      }

      await pool.query(
        `UPDATE purchase_requests
         SET status = 'accepted'
         WHERE id = ?`,
        [safeRequestId],
      )

      await pool.query(
        `INSERT INTO conversation_messages (conversation_id, sender_id, content)
         VALUES (?, ?, ?)`,
        [request.conversation_id, safeUserId, `Demande d’achat acceptée pour l’annonce: ${request.title}. En attente du paiement.`],
      )

      await pool.query('UPDATE conversations SET updated_at = NOW() WHERE id = ?', [
        request.conversation_id,
      ])

      return res.json({
        message: 'Demande d’achat acceptée. En attente du paiement de l’acheteur.',
        status: 'accepted',
      })
    }

    await pool.query(
      `UPDATE purchase_requests
       SET status = 'refused'
       WHERE id = ?`,
      [safeRequestId],
    )

    await pool.query(
      `INSERT INTO conversation_messages (conversation_id, sender_id, content)
       VALUES (?, ?, ?)`,
      [request.conversation_id, safeUserId, `Demande d’achat refusée pour l’annonce: ${request.title}`],
    )

    await pool.query('UPDATE conversations SET updated_at = NOW() WHERE id = ?', [
      request.conversation_id,
    ])

    return res.json({
      message: 'Demande d’achat refusée.',
      status: 'refused',
    })
  } catch (error) {
    sendError(res, 500, 'Impossible de traiter la demande d’achat pour le moment.')
  }
})

app.post('/api/purchases/requests/:requestId/checkout-session', async (req, res) => {
  const { requestId } = req.params
  const { userId } = req.body || {}
  const safeRequestId = Number(requestId)
  const safeUserId = Number(userId)

  if (!safeRequestId || !safeUserId) {
    return sendError(res, 400, 'Données invalides.')
  }

  if (!stripe) {
    return sendError(res, 500, 'Le paiement Stripe n’est pas configuré sur le serveur.')
  }

  try {
    await ensurePurchaseRequestsTableExists()
    await ensureTransactionsTableExists()
    await ensureListingColumnsExist()
    await ensureStripeConnectColumnsExist()

    const user = await getUserById(safeUserId)

    if (!user) {
      return sendError(res, 404, 'Compte introuvable.')
    }

    if (!ensureUserNotBanned(res, user)) {
      return
    }

    const [requestRows] = await pool.query(
      `SELECT
         pr.id,
         pr.listing_id,
         pr.conversation_id,
         pr.buyer_id,
         pr.seller_id,
         pr.status,
         l.title,
         l.price_eur,
         l.is_sold,
         seller.stripe_account_id AS seller_stripe_account_id,
         seller.stripe_charges_enabled AS seller_stripe_charges_enabled
       FROM purchase_requests pr
       INNER JOIN listings l ON l.id = pr.listing_id
       INNER JOIN users seller ON seller.id = pr.seller_id
       WHERE pr.id = ?
       LIMIT 1`,
      [safeRequestId],
    )

    if (requestRows.length === 0) {
      return sendError(res, 404, 'Demande d’achat introuvable.')
    }

    const request = requestRows[0]

    if (request.buyer_id !== safeUserId) {
      return sendError(res, 403, 'Seul l’acheteur peut payer cette demande.')
    }

    if (request.status !== 'accepted') {
      return sendError(res, 409, 'La demande doit être acceptée par le vendeur avant paiement.')
    }

    if (Boolean(request.is_sold)) {
      return sendError(res, 409, 'Cette annonce est déjà vendue.')
    }

    const sellerStripeAccountId = String(request.seller_stripe_account_id || '').trim()

    if (!sellerStripeAccountId) {
      return sendError(
        res,
        409,
        'Le vendeur n’a pas encore connecté son compte Stripe. Paiement indisponible.',
      )
    }

    let sellerChargesEnabled = Boolean(request.seller_stripe_charges_enabled)

    try {
      const sellerStripeAccount = await stripe.accounts.retrieve(sellerStripeAccountId)
      sellerChargesEnabled = Boolean(sellerStripeAccount?.charges_enabled)

      await pool.query(
        `UPDATE users
         SET stripe_charges_enabled = ?,
             stripe_details_submitted = ?,
             stripe_payouts_enabled = ?
         WHERE id = ?`,
        [
          Boolean(sellerStripeAccount?.charges_enabled),
          Boolean(sellerStripeAccount?.details_submitted),
          Boolean(sellerStripeAccount?.payouts_enabled),
          request.seller_id,
        ],
      )
    } catch (_error) {}

    if (!sellerChargesEnabled) {
      return sendError(
        res,
        409,
        'Le compte Stripe du vendeur n’est pas encore actif pour recevoir des paiements.',
      )
    }

    const amountCents = eurosToCents(request.price_eur)

    if (!Number.isInteger(amountCents) || amountCents <= 0) {
      return sendError(res, 400, 'Montant invalide pour le paiement.')
    }

    const [insertResult] = await pool.query(
      `INSERT INTO transactions
       (purchase_request_id, listing_id, buyer_id, seller_id, amount_eur, currency, status)
       VALUES (?, ?, ?, ?, ?, 'eur', 'pending')`,
      [safeRequestId, request.listing_id, request.buyer_id, request.seller_id, request.price_eur],
    )

    const safeClientUrl = String(process.env.CLIENT_APP_URL || 'http://localhost:5173').replace(/\/$/, '')

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'eur',
            unit_amount: amountCents,
            product_data: {
              name: String(request.title || 'Achat ZeGoodCorner'),
            },
          },
        },
      ],
      metadata: {
        transactionId: String(insertResult.insertId),
        purchaseRequestId: String(safeRequestId),
        listingId: String(request.listing_id),
        buyerId: String(request.buyer_id),
        sellerStripeAccountId,
      },
      payment_intent_data: {
        ...(computePlatformFeeCents(amountCents) > 0
          ? { application_fee_amount: computePlatformFeeCents(amountCents) }
          : {}),
        transfer_data: {
          destination: sellerStripeAccountId,
        },
      },
      success_url: `${safeClientUrl}/discussion?conversationId=${request.conversation_id}&payment=success&transactionId=${insertResult.insertId}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${safeClientUrl}/discussion?conversationId=${request.conversation_id}&payment=cancel`,
    })

    await pool.query(
      `UPDATE transactions
       SET stripe_checkout_session_id = ?
       WHERE id = ?`,
      [session.id, insertResult.insertId],
    )

    res.status(201).json({
      transactionId: insertResult.insertId,
      checkoutUrl: session.url,
    })
  } catch (error) {
    sendError(res, 500, 'Impossible de démarrer le paiement pour le moment.')
  }
})

app.get('/api/transactions/verify-checkout', async (req, res) => {
  const { userId, transactionId, sessionId } = req.query
  const safeUserId = Number(userId)
  const safeTransactionId = Number(transactionId)
  const safeSessionId = String(sessionId || '').trim()

  if (!safeUserId || !safeTransactionId || !safeSessionId) {
    return sendError(res, 400, 'Données invalides.')
  }

  if (!stripe) {
    return sendError(res, 500, 'Le paiement Stripe n’est pas configuré sur le serveur.')
  }

  try {
    await ensureTransactionsTableExists()
    await ensurePurchaseRequestsTableExists()
    await ensureListingColumnsExist()

    const user = await getUserById(safeUserId)

    if (!user) {
      return sendError(res, 404, 'Compte introuvable.')
    }

    if (!ensureUserNotBanned(res, user)) {
      return
    }

    const [transactionRows] = await pool.query(
      `SELECT
         t.id,
         t.purchase_request_id,
         t.listing_id,
         t.buyer_id,
         t.seller_id,
         t.status,
         t.stripe_checkout_session_id,
         t.stripe_payment_intent_id,
         pr.conversation_id,
         pr.status AS purchase_request_status,
         l.title,
         l.is_sold
       FROM transactions t
       INNER JOIN purchase_requests pr ON pr.id = t.purchase_request_id
       INNER JOIN listings l ON l.id = t.listing_id
       WHERE t.id = ?
       LIMIT 1`,
      [safeTransactionId],
    )

    if (transactionRows.length === 0) {
      return sendError(res, 404, 'Transaction introuvable.')
    }

    const transaction = transactionRows[0]

    if (transaction.buyer_id !== safeUserId) {
      return sendError(res, 403, 'Accès refusé à cette transaction.')
    }

    if (transaction.stripe_checkout_session_id !== safeSessionId) {
      return sendError(res, 400, 'Session de paiement invalide.')
    }

    if (transaction.status === 'succeeded') {
      return res.json({
        status: 'succeeded',
        message: 'Paiement déjà validé.',
      })
    }

    const session = await stripe.checkout.sessions.retrieve(safeSessionId, {
      expand: ['payment_intent'],
    })

    const paymentSucceeded =
      session.payment_status === 'paid' || session.status === 'complete'

    if (!paymentSucceeded) {
      await pool.query(
        `UPDATE transactions
         SET status = 'failed'
         WHERE id = ?`,
        [safeTransactionId],
      )

      return sendError(res, 409, 'Le paiement n’a pas été validé.')
    }

    const paymentIntentId =
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.payment_intent?.id || null

    await pool.query(
      `UPDATE transactions
       SET status = 'succeeded', stripe_payment_intent_id = ?
       WHERE id = ?`,
      [paymentIntentId, safeTransactionId],
    )

    await pool.query(
      'UPDATE listings SET is_sold = TRUE, sold_to_user_id = ? WHERE id = ?',
      [transaction.buyer_id, transaction.listing_id],
    )

    await pool.query(
      `UPDATE purchase_requests
       SET status = CASE WHEN id = ? THEN 'accepted' ELSE 'refused' END
       WHERE listing_id = ? AND status IN ('pending', 'accepted')`,
      [transaction.purchase_request_id, transaction.listing_id],
    )

    await pool.query(
      `INSERT INTO conversation_messages (conversation_id, sender_id, content)
       VALUES (?, ?, ?)`,
      [
        transaction.conversation_id,
        transaction.buyer_id,
        `Paiement validé pour l’annonce: ${transaction.title}.`,
      ],
    )

    await pool.query('UPDATE conversations SET updated_at = NOW() WHERE id = ?', [
      transaction.conversation_id,
    ])

    res.json({
      status: 'succeeded',
      message: 'Paiement validé. L’annonce est maintenant vendue.',
    })
  } catch (error) {
    sendError(res, 500, 'Impossible de valider la transaction pour le moment.')
  }
})

app.get('/api/transactions/:transactionId/receipt', async (req, res) => {
  const { transactionId } = req.params
  const { userId } = req.query
  const safeTransactionId = Number(transactionId)
  const safeUserId = Number(userId)

  if (!safeTransactionId || !safeUserId) {
    return sendError(res, 400, 'Données invalides.')
  }

  if (!stripe) {
    return sendError(res, 500, 'Le paiement Stripe n’est pas configuré sur le serveur.')
  }

  try {
    await ensureTransactionsTableExists()

    const user = await getUserById(safeUserId)

    if (!user) {
      return sendError(res, 404, 'Compte introuvable.')
    }

    if (!ensureUserNotBanned(res, user)) {
      return
    }

    const [rows] = await pool.query(
      `SELECT id, buyer_id, seller_id, status, stripe_checkout_session_id, stripe_payment_intent_id
       FROM transactions
       WHERE id = ?
       LIMIT 1`,
      [safeTransactionId],
    )

    if (rows.length === 0) {
      return sendError(res, 404, 'Transaction introuvable.')
    }

    const transaction = rows[0]

    if (Number(transaction.buyer_id) !== safeUserId) {
      return sendError(res, 403, 'Seul l’acheteur peut accéder au reçu.')
    }

    if (transaction.status !== 'succeeded') {
      return sendError(res, 409, 'Le paiement n’est pas encore validé.')
    }

    let paymentIntentId = String(transaction.stripe_payment_intent_id || '').trim()

    if (!paymentIntentId) {
      const checkoutSessionId = String(transaction.stripe_checkout_session_id || '').trim()

      if (!checkoutSessionId) {
        return sendError(res, 404, 'Reçu indisponible pour cette transaction.')
      }

      const session = await stripe.checkout.sessions.retrieve(checkoutSessionId, {
        expand: ['payment_intent'],
      })

      paymentIntentId =
        typeof session.payment_intent === 'string'
          ? session.payment_intent
          : session.payment_intent?.id || ''

      if (!paymentIntentId) {
        return sendError(res, 404, 'Reçu indisponible pour cette transaction.')
      }

      await pool.query(
        `UPDATE transactions
         SET stripe_payment_intent_id = ?
         WHERE id = ?`,
        [paymentIntentId, safeTransactionId],
      )
    }

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId, {
      expand: ['latest_charge'],
    })

    const latestCharge =
      typeof paymentIntent.latest_charge === 'string'
        ? await stripe.charges.retrieve(paymentIntent.latest_charge)
        : paymentIntent.latest_charge

    const receiptUrl = String(latestCharge?.receipt_url || '').trim()

    if (!receiptUrl) {
      const safeClientUrl = String(process.env.CLIENT_APP_URL || 'http://localhost:5173').replace(/\/$/, '')

      return res.json({
        transactionId: safeTransactionId,
        receiptUrl: `${safeClientUrl}/facture/${safeTransactionId}`,
        source: 'internal-fallback',
      })
    }

    res.json({
      transactionId: safeTransactionId,
      receiptUrl,
      source: 'stripe',
    })
  } catch (error) {
    sendError(res, 500, 'Impossible de charger le reçu pour le moment.')
  }
})

app.get('/api/transactions/:transactionId/invoice-data', async (req, res) => {
  const { transactionId } = req.params
  const { userId } = req.query
  const safeTransactionId = Number(transactionId)
  const safeUserId = Number(userId)

  if (!safeTransactionId || !safeUserId) {
    return sendError(res, 400, 'Données invalides.')
  }

  try {
    await ensureTransactionsTableExists()

    const user = await getUserById(safeUserId)

    if (!user) {
      return sendError(res, 404, 'Compte introuvable.')
    }

    if (!ensureUserNotBanned(res, user)) {
      return
    }

    const [rows] = await pool.query(
      `SELECT
         t.id,
         t.amount_eur,
         t.currency,
         t.status,
         t.created_at,
         t.stripe_payment_intent_id,
         t.stripe_checkout_session_id,
         t.buyer_id,
         t.seller_id,
         l.title AS listing_title,
         l.city AS listing_city,
         buyer.display_name AS buyer_name,
         seller.display_name AS seller_name
       FROM transactions t
       INNER JOIN listings l ON l.id = t.listing_id
       LEFT JOIN users buyer ON buyer.id = t.buyer_id
       LEFT JOIN users seller ON seller.id = t.seller_id
       WHERE t.id = ?
       LIMIT 1`,
      [safeTransactionId],
    )

    if (rows.length === 0) {
      return sendError(res, 404, 'Transaction introuvable.')
    }

    const transaction = rows[0]

    if (Number(transaction.buyer_id) !== safeUserId) {
      return sendError(res, 403, 'Seul l’acheteur peut accéder à cette facture.')
    }

    if (transaction.status !== 'succeeded') {
      return sendError(res, 409, 'Le paiement n’est pas encore validé.')
    }

    res.json({
      id: transaction.id,
      amountEur: Number(transaction.amount_eur),
      currency: String(transaction.currency || 'eur').toUpperCase(),
      status: transaction.status,
      createdAt: transaction.created_at,
      stripePaymentIntentId: transaction.stripe_payment_intent_id || null,
      stripeCheckoutSessionId: transaction.stripe_checkout_session_id || null,
      buyerName: transaction.buyer_name || 'Acheteur',
      sellerName: transaction.seller_name || 'Vendeur',
      listingTitle: transaction.listing_title || 'Annonce',
      listingCity: transaction.listing_city || '',
    })
  } catch (error) {
    sendError(res, 500, 'Impossible de charger la facture pour le moment.')
  }
})

app.post('/api/transactions/:transactionId/shipping-address', async (req, res) => {
  const { transactionId } = req.params
  const {
    userId,
    fullName,
    addressLine1,
    addressLine2,
    postalCode,
    city,
    country,
    phone,
  } = req.body || {}

  const safeTransactionId = Number(transactionId)
  const safeUserId = Number(userId)
  const safeFullName = String(fullName || '').trim()
  const safeAddressLine1 = String(addressLine1 || '').trim()
  const safeAddressLine2 = String(addressLine2 || '').trim()
  const safePostalCode = String(postalCode || '').trim()
  const safeCity = String(city || '').trim()
  const safeCountry = String(country || '').trim()
  const safePhone = String(phone || '').trim()

  if (!safeTransactionId || !safeUserId) {
    return sendError(res, 400, 'Données invalides.')
  }

  if (!safeFullName || !safeAddressLine1 || !safePostalCode || !safeCity || !safeCountry) {
    return sendError(
      res,
      400,
      'Merci de renseigner le nom, l’adresse, le code postal, la ville et le pays.',
    )
  }

  try {
    await ensureTransactionsTableExists()
    await ensureListingColumnsExist()

    const user = await getUserById(safeUserId)

    if (!user) {
      return sendError(res, 404, 'Compte introuvable.')
    }

    if (!ensureUserNotBanned(res, user)) {
      return
    }

    const [rows] = await pool.query(
      `SELECT
         t.id,
         t.buyer_id,
         t.status,
         t.shipping_address_submitted_at,
         pr.conversation_id,
         l.title AS listing_title,
         l.delivery_method
       FROM transactions t
       INNER JOIN purchase_requests pr ON pr.id = t.purchase_request_id
       INNER JOIN listings l ON l.id = t.listing_id
       WHERE t.id = ?
       LIMIT 1`,
      [safeTransactionId],
    )

    if (rows.length === 0) {
      return sendError(res, 404, 'Transaction introuvable.')
    }

    const transaction = rows[0]

    if (Number(transaction.buyer_id) !== safeUserId) {
      return sendError(res, 403, 'Seul l’acheteur peut enregistrer l’adresse de livraison.')
    }

    if (transaction.status !== 'succeeded') {
      return sendError(res, 409, 'Le paiement doit être validé avant de saisir l’adresse.')
    }

    if (transaction.delivery_method !== DELIVERY_METHODS.SHIPPING) {
      return sendError(res, 409, 'Cette annonce est en remise en main propre.')
    }

    const shippingAddress = {
      fullName: safeFullName,
      addressLine1: safeAddressLine1,
      addressLine2: safeAddressLine2 || null,
      postalCode: safePostalCode,
      city: safeCity,
      country: safeCountry,
      phone: safePhone || null,
    }

    await pool.query(
      `UPDATE transactions
       SET shipping_address_json = ?,
           shipping_address_submitted_at = NOW()
       WHERE id = ?`,
      [JSON.stringify(shippingAddress), safeTransactionId],
    )

    await pool.query(
      `INSERT INTO conversation_messages (conversation_id, sender_id, content)
       VALUES (?, ?, ?)`,
      [
        transaction.conversation_id,
        safeUserId,
        `Adresse de livraison transmise pour l’annonce: ${transaction.listing_title}.`,
      ],
    )

    await pool.query('UPDATE conversations SET updated_at = NOW() WHERE id = ?', [
      transaction.conversation_id,
    ])

    res.json({
      message: 'Adresse de livraison enregistrée avec succès.',
      shippingAddressSubmittedAt: new Date().toISOString(),
    })
  } catch (error) {
    sendError(res, 500, 'Impossible d’enregistrer l’adresse de livraison pour le moment.')
  }
})

app.get('/api/messages/conversations', async (req, res) => {
  const { userId } = req.query
  const safeUserId = Number(userId)

  if (!safeUserId) {
    return sendError(res, 400, 'Utilisateur invalide.')
  }

  try {
    await ensureMessagingTablesExist()

    const user = await getUserById(safeUserId)

    if (!user) {
      return sendError(res, 404, 'Compte introuvable.')
    }

    if (!ensureUserNotBanned(res, user)) {
      return
    }

    const [rows] = await pool.query(
      `SELECT
         c.id,
         c.listing_id,
         c.buyer_id,
         c.seller_id,
         c.updated_at,
         l.title AS listing_title,
         l.price_eur,
         l.city,
         CASE
           WHEN c.buyer_id = ? THEN c.seller_id
           ELSE c.buyer_id
         END AS other_user_id,
         u.display_name AS other_user_name,
         latest_message.content AS last_message,
         latest_message.created_at AS last_message_at,
         (
           SELECT COUNT(*)
           FROM conversation_messages cm_unread
           WHERE cm_unread.conversation_id = c.id
             AND cm_unread.sender_id <> ?
             AND cm_unread.created_at > COALESCE(
               CASE
                 WHEN c.buyer_id = ? THEN c.buyer_last_read_at
                 ELSE c.seller_last_read_at
               END,
               TIMESTAMP('1970-01-01 00:00:00')
             )
         ) AS unread_count
       FROM conversations c
       INNER JOIN listings l ON l.id = c.listing_id
       LEFT JOIN users u ON u.id = CASE WHEN c.buyer_id = ? THEN c.seller_id ELSE c.buyer_id END
       LEFT JOIN conversation_messages latest_message ON latest_message.id = (
         SELECT cm.id
         FROM conversation_messages cm
         WHERE cm.conversation_id = c.id
         ORDER BY cm.created_at DESC, cm.id DESC
         LIMIT 1
       )
       WHERE c.buyer_id = ? OR c.seller_id = ?
       ORDER BY COALESCE(latest_message.created_at, c.updated_at) DESC`,
      [safeUserId, safeUserId, safeUserId, safeUserId, safeUserId, safeUserId],
    )

    res.json(rows)
  } catch (error) {
    sendError(res, 500, 'Impossible de charger tes discussions pour le moment.')
  }
})

app.get('/api/messages/unread-count', async (req, res) => {
  const { userId } = req.query
  const safeUserId = Number(userId)

  if (!safeUserId) {
    return sendError(res, 400, 'Utilisateur invalide.')
  }

  try {
    await ensureMessagingTablesExist()

    const user = await getUserById(safeUserId)

    if (!user) {
      return sendError(res, 404, 'Compte introuvable.')
    }

    if (!ensureUserNotBanned(res, user)) {
      return
    }

    const [rows] = await pool.query(
      `SELECT COALESCE(SUM(
         (
           SELECT COUNT(*)
           FROM conversation_messages cm_unread
           WHERE cm_unread.conversation_id = c.id
             AND cm_unread.sender_id <> ?
             AND cm_unread.created_at > COALESCE(
               CASE
                 WHEN c.buyer_id = ? THEN c.buyer_last_read_at
                 ELSE c.seller_last_read_at
               END,
               TIMESTAMP('1970-01-01 00:00:00')
             )
         )
       ), 0) AS unread_count
       FROM conversations c
       WHERE c.buyer_id = ? OR c.seller_id = ?`,
      [safeUserId, safeUserId, safeUserId, safeUserId],
    )

    res.json({ unreadCount: Number(rows?.[0]?.unread_count || 0) })
  } catch (error) {
    sendError(res, 500, 'Impossible de charger les notifications pour le moment.')
  }
})

app.post('/api/messages/conversations/:conversationId/read', async (req, res) => {
  const { conversationId } = req.params
  const { userId } = req.body || {}
  const safeConversationId = Number(conversationId)
  const safeUserId = Number(userId)

  if (!safeConversationId || !safeUserId) {
    return sendError(res, 400, 'Données invalides.')
  }

  try {
    await ensureMessagingTablesExist()

    const user = await getUserById(safeUserId)

    if (!user) {
      return sendError(res, 404, 'Compte introuvable.')
    }

    if (!ensureUserNotBanned(res, user)) {
      return
    }

    const [conversationRows] = await pool.query(
      `SELECT id, buyer_id, seller_id
       FROM conversations
       WHERE id = ?
       LIMIT 1`,
      [safeConversationId],
    )

    if (conversationRows.length === 0) {
      return sendError(res, 404, 'Discussion introuvable.')
    }

    const conversation = conversationRows[0]

    if (conversation.buyer_id === safeUserId) {
      await pool.query('UPDATE conversations SET buyer_last_read_at = NOW() WHERE id = ?', [
        safeConversationId,
      ])
      return res.json({ message: 'Discussion marquée comme lue.' })
    }

    if (conversation.seller_id === safeUserId) {
      await pool.query('UPDATE conversations SET seller_last_read_at = NOW() WHERE id = ?', [
        safeConversationId,
      ])
      return res.json({ message: 'Discussion marquée comme lue.' })
    }

    return sendError(res, 403, 'Accès refusé à cette discussion.')
  } catch (error) {
    sendError(res, 500, 'Impossible de mettre à jour le statut de lecture.')
  }
})

app.get('/api/messages/conversations/:conversationId/messages', async (req, res) => {
  const { conversationId } = req.params
  const { userId } = req.query
  const safeConversationId = Number(conversationId)
  const safeUserId = Number(userId)

  if (!safeConversationId || !safeUserId) {
    return sendError(res, 400, 'Données invalides.')
  }

  try {
    await ensureMessagingTablesExist()

    const user = await getUserById(safeUserId)

    if (!user) {
      return sendError(res, 404, 'Compte introuvable.')
    }

    if (!ensureUserNotBanned(res, user)) {
      return
    }

    const [conversationRows] = await pool.query(
      `SELECT id, buyer_id, seller_id
       FROM conversations
       WHERE id = ?
       LIMIT 1`,
      [safeConversationId],
    )

    if (conversationRows.length === 0) {
      return sendError(res, 404, 'Discussion introuvable.')
    }

    const conversation = conversationRows[0]
    const isParticipant =
      conversation.buyer_id === safeUserId || conversation.seller_id === safeUserId

    if (!isParticipant) {
      return sendError(res, 403, 'Accès refusé à cette discussion.')
    }

    if (conversation.buyer_id === safeUserId) {
      await pool.query('UPDATE conversations SET buyer_last_read_at = NOW() WHERE id = ?', [
        safeConversationId,
      ])
    } else {
      await pool.query('UPDATE conversations SET seller_last_read_at = NOW() WHERE id = ?', [
        safeConversationId,
      ])
    }

    const [messageRows] = await pool.query(
      `SELECT
         cm.id,
         cm.conversation_id,
         cm.sender_id,
         cm.content,
         cm.created_at,
         u.display_name AS sender_name
       FROM conversation_messages cm
       LEFT JOIN users u ON u.id = cm.sender_id
       WHERE cm.conversation_id = ?
       ORDER BY cm.created_at ASC, cm.id ASC`,
      [safeConversationId],
    )

    res.json(messageRows)
  } catch (error) {
    sendError(res, 500, 'Impossible de charger les messages pour le moment.')
  }
})

app.post('/api/messages/conversations/:conversationId/messages', async (req, res) => {
  const { conversationId } = req.params
  const { userId, content } = req.body || {}
  const safeConversationId = Number(conversationId)
  const safeUserId = Number(userId)
  const safeContent = String(content || '').trim()

  if (!safeConversationId || !safeUserId || !safeContent) {
    return sendError(res, 400, 'Merci de saisir un message valide.')
  }

  if (safeContent.length > 1200) {
    return sendError(res, 400, 'Ton message est trop long (1200 caractères max).')
  }

  try {
    await ensureMessagingTablesExist()

    const user = await getUserById(safeUserId)

    if (!user) {
      return sendError(res, 404, 'Compte introuvable.')
    }

    if (!ensureUserNotBanned(res, user)) {
      return
    }

    const [conversationRows] = await pool.query(
      `SELECT id, buyer_id, seller_id
       FROM conversations
       WHERE id = ?
       LIMIT 1`,
      [safeConversationId],
    )

    if (conversationRows.length === 0) {
      return sendError(res, 404, 'Discussion introuvable.')
    }

    const conversation = conversationRows[0]
    const isParticipant =
      conversation.buyer_id === safeUserId || conversation.seller_id === safeUserId

    if (!isParticipant) {
      return sendError(res, 403, 'Accès refusé à cette discussion.')
    }

    const [insertResult] = await pool.query(
      `INSERT INTO conversation_messages (conversation_id, sender_id, content)
       VALUES (?, ?, ?)`,
      [safeConversationId, safeUserId, safeContent],
    )

    await pool.query(
      `UPDATE conversations
       SET updated_at = NOW(),
           buyer_last_read_at = CASE WHEN buyer_id = ? THEN NOW() ELSE buyer_last_read_at END,
           seller_last_read_at = CASE WHEN seller_id = ? THEN NOW() ELSE seller_last_read_at END
       WHERE id = ?`,
      [safeUserId, safeUserId, safeConversationId],
    )

    res.status(201).json({
      id: insertResult.insertId,
      conversationId: safeConversationId,
      senderId: safeUserId,
      content: safeContent,
    })
  } catch (error) {
    sendError(res, 500, 'Impossible d’envoyer le message pour le moment.')
  }
})

app.post('/api/auth/register', async (req, res) => {
  const { firstName, lastName, email, password } = req.body
  const safeFirstName = String(firstName || '').trim()
  const safeLastName = String(lastName || '').trim()
  const safeEmail = String(email || '').trim().toLowerCase()
  const passwordIsValid = isStrongPassword(password)

  if (!safeFirstName || !safeLastName || !safeEmail || !password) {
    return sendError(res, 400, 'Merci de remplir tous les champs du formulaire.')
  }

  if (!passwordIsValid) {
    return sendError(
      res,
      400,
      'Le mot de passe doit contenir au moins 8 caractères, une majuscule, une minuscule et un chiffre.',
    )
  }

  try {
    await ensureStripeConnectColumnsExist()

    const [existingUsers] = await pool.query(
      'SELECT id FROM users WHERE email = ? LIMIT 1',
      [safeEmail],
    )

    if (existingUsers.length > 0) {
      return sendError(res, 409, 'Cette adresse mail est déjà utilisée.')
    }

    const passwordHash = await bcrypt.hash(password, 10)
    const displayName = `${safeFirstName} ${safeLastName}`.trim()
    const role = USER_ROLES.BUYER
    const [result] = await pool.query(
      'INSERT INTO users (email, password_hash, first_name, last_name, display_name, role) VALUES (?, ?, ?, ?, ?, ?)',
      [safeEmail, passwordHash, safeFirstName, safeLastName, displayName, role],
    )

    const createdUser = await getUserById(result.insertId)

    if (!createdUser) {
      return sendError(res, 500, GENERIC_ERROR_MESSAGE)
    }

    res.status(201).json({
      ...toSessionUser(createdUser),
      firstName: safeFirstName,
      lastName: safeLastName,
    })
  } catch (error) {
    sendError(res, 500, GENERIC_ERROR_MESSAGE)
  }
})

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body
  const safeEmail = String(email || '').trim().toLowerCase()

  if (!safeEmail || !password) {
    return sendError(res, 400, 'Merci de saisir ton adresse mail et ton mot de passe.')
  }

  try {
    await ensureBannedColumnExists()
    await ensureStripeConnectColumnsExist()

    const user = await getUserByEmail(safeEmail)

    if (!user) {
      return sendError(res, 401, 'Adresse mail ou mot de passe incorrect.')
    }

    if (Boolean(user.is_banned)) {
      return sendError(
        res,
        403,
        'Votre compte est banni. Vous avez violé les règles et conditions d’utilisation de la plateforme.',
      )
    }

    const passwordIsValid = await bcrypt.compare(password, user.password_hash)

    if (!passwordIsValid) {
      return sendError(res, 401, 'Adresse mail ou mot de passe incorrect.')
    }

    const syncedUser = await syncStripeConnectStatus(user)

    res.json(toSessionUser(syncedUser))
  } catch (error) {
    sendError(res, 500, GENERIC_ERROR_MESSAGE)
  }
})

app.get('/api/auth/session', async (req, res) => {
  const { userId } = req.query
  const safeUserId = Number(userId)

  if (!safeUserId) {
    return sendError(res, 400, 'Utilisateur invalide.')
  }

  try {
    await ensureBannedColumnExists()
    await ensureStripeConnectColumnsExist()
    const user = await getUserById(safeUserId)

    if (!user) {
      return sendError(res, 404, 'Compte introuvable.')
    }

    const syncedUser = await syncStripeConnectStatus(user)

    res.json(toSessionUser(syncedUser))
  } catch (error) {
    sendError(res, 500, GENERIC_ERROR_MESSAGE)
  }
})

app.post('/api/account/change-password', async (req, res) => {
  const { userId, currentPassword, newPassword } = req.body
  const safeUserId = Number(userId)

  if (!safeUserId || !currentPassword || !newPassword) {
    return sendError(res, 400, 'Merci de remplir tous les champs demandés.')
  }

  if (!isStrongPassword(newPassword)) {
    return sendError(
      res,
      400,
      'Le nouveau mot de passe doit contenir au moins 8 caractères, une majuscule, une minuscule et un chiffre.',
    )
  }

  try {
    const user = await getUserById(safeUserId)

    if (!user) {
      return sendError(res, 404, 'Compte introuvable.')
    }

    if (!ensureUserNotBanned(res, user)) {
      return
    }

    const isCurrentPasswordValid = await bcrypt.compare(
      currentPassword,
      user.password_hash,
    )

    if (!isCurrentPasswordValid) {
      return sendError(res, 401, 'Le mot de passe actuel est incorrect.')
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 10)
    await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [
      newPasswordHash,
      safeUserId,
    ])

    res.json({ message: 'Mot de passe mis à jour avec succès.' })
  } catch (error) {
    sendError(res, 500, GENERIC_ERROR_MESSAGE)
  }
})

app.post('/api/account/delete', async (req, res) => {
  const { userId, password } = req.body
  const safeUserId = Number(userId)

  if (!safeUserId || !password) {
    return sendError(res, 400, 'Merci de confirmer ton mot de passe.')
  }

  try {
    const user = await getUserById(safeUserId)

    if (!user) {
      return sendError(res, 404, 'Compte introuvable.')
    }

    if (!ensureUserNotBanned(res, user)) {
      return
    }

    const isPasswordValid = await bcrypt.compare(password, user.password_hash)

    if (!isPasswordValid) {
      return sendError(res, 401, 'Le mot de passe saisi est incorrect.')
    }

    await ensureFavoritesTableExists()
    await ensurePurchaseRequestsTableExists()
    await ensureTransactionsTableExists()
    await pool.query('DELETE FROM favorites WHERE user_id = ?', [safeUserId])
    await pool.query('DELETE FROM transactions WHERE buyer_id = ? OR seller_id = ?', [
      safeUserId,
      safeUserId,
    ])
    await pool.query('DELETE FROM purchase_requests WHERE buyer_id = ? OR seller_id = ?', [
      safeUserId,
      safeUserId,
    ])
    await pool.query('DELETE FROM users WHERE id = ?', [safeUserId])
    res.json({ message: 'Ton compte a été supprimé.' })
  } catch (error) {
    sendError(res, 500, GENERIC_ERROR_MESSAGE)
  }
})

app.post('/api/account/become-seller', async (req, res) => {
  const { userId } = req.body
  const safeUserId = Number(userId)

  if (!safeUserId) {
    return sendError(res, 400, 'Utilisateur invalide.')
  }

  try {
    await ensureStripeConnectColumnsExist()

    const user = await getUserById(safeUserId)

    if (!user) {
      return sendError(res, 404, 'Compte introuvable.')
    }

    if (!ensureUserNotBanned(res, user)) {
      return
    }

    if (user.role !== USER_ROLES.BUYER) {
      return sendError(res, 403, 'Tu dois être acheteur pour devenir vendeur.')
    }

    await pool.query('UPDATE users SET role = ? WHERE id = ?', [
      USER_ROLES.SELLER,
      safeUserId,
    ])

    const updatedUser = await getUserById(safeUserId)

    if (!updatedUser) {
      return sendError(res, 500, GENERIC_ERROR_MESSAGE)
    }

    res.json(toSessionUser(updatedUser))
  } catch (error) {
    sendError(res, 500, GENERIC_ERROR_MESSAGE)
  }
})

app.post('/api/stripe/connect/onboarding-link', async (req, res) => {
  const { userId } = req.body || {}
  const safeUserId = Number(userId)

  if (!safeUserId) {
    return sendError(res, 400, 'Utilisateur invalide.')
  }

  if (!stripe) {
    return sendError(res, 500, 'Stripe Connect n’est pas configuré sur le serveur.')
  }

  try {
    await ensureStripeConnectColumnsExist()

    const user = await getUserById(safeUserId)

    if (!user) {
      return sendError(res, 404, 'Compte introuvable.')
    }

    if (!ensureUserNotBanned(res, user)) {
      return
    }

    // Accepter les acheteurs (role 'acheteur') et les vendeurs/admins pour lier Stripe
    // Les acheteurs veulent devenir vendeurs et doivent d'abord lier Stripe

    let stripeAccountId = String(user.stripe_account_id || '').trim()

    if (!stripeAccountId) {
      const stripeAccount = await stripe.accounts.create({
        type: 'express',
        country: STRIPE_CONNECT_COUNTRY,
        email: user.email,
        business_type: 'individual',
      })

      stripeAccountId = stripeAccount.id

      await pool.query('UPDATE users SET stripe_account_id = ? WHERE id = ?', [
        stripeAccountId,
        safeUserId,
      ])
    }

    const safeClientUrl = String(process.env.CLIENT_APP_URL || 'http://localhost:5173').replace(/\/$/, '')

    const accountLink = await stripe.accountLinks.create({
      account: stripeAccountId,
      refresh_url: `${safeClientUrl}/discussion?stripe=onboarding_refresh`,
      return_url: `${safeClientUrl}/discussion?stripe=onboarding_return`,
      type: 'account_onboarding',
    })

    const refreshedUser = await getUserById(safeUserId)
    const syncedUser = await syncStripeConnectStatus(refreshedUser)

    res.json({
      onboardingUrl: accountLink.url,
      user: toSessionUser(syncedUser),
    })
  } catch (error) {
    sendError(res, 500, 'Impossible de démarrer l’onboarding Stripe pour le moment.')
  }
})

app.get('/api/stripe/connect/status', async (req, res) => {
  const { userId } = req.query
  const safeUserId = Number(userId)

  if (!safeUserId) {
    return sendError(res, 400, 'Utilisateur invalide.')
  }

  try {
    await ensureStripeConnectColumnsExist()

    const user = await getUserById(safeUserId)

    if (!user) {
      return sendError(res, 404, 'Compte introuvable.')
    }

    if (!ensureUserNotBanned(res, user)) {
      return
    }

    const syncedUser = await syncStripeConnectStatus(user)

    res.json({
      stripeAccountId: syncedUser.stripe_account_id || null,
      stripeChargesEnabled: Boolean(syncedUser.stripe_charges_enabled),
      stripeDetailsSubmitted: Boolean(syncedUser.stripe_details_submitted),
      stripePayoutsEnabled: Boolean(syncedUser.stripe_payouts_enabled),
      canReceivePayments: Boolean(syncedUser.stripe_charges_enabled),
    })
  } catch (error) {
    sendError(res, 500, 'Impossible de charger le statut Stripe Connect pour le moment.')
  }
})

app.post('/api/stripe/disconnect', async (req, res) => {
  const { userId } = req.body
  const safeUserId = Number(userId)

  if (!safeUserId) {
    return sendError(res, 400, 'Utilisateur invalide.')
  }

  try {
    await ensureStripeConnectColumnsExist()

    const user = await getUserById(safeUserId)

    if (!user) {
      return sendError(res, 404, 'Compte introuvable.')
    }

    if (!ensureUserNotBanned(res, user)) {
      return
    }

    // Délier le compte Stripe
    await pool.query(
      'UPDATE users SET stripe_account_id = NULL, stripe_charges_enabled = FALSE, stripe_details_submitted = FALSE, stripe_payouts_enabled = FALSE WHERE id = ?',
      [safeUserId],
    )

    const refreshedUser = await getUserById(safeUserId)

    res.json(toSessionUser(refreshedUser))
  } catch (error) {
    console.error('Error disconnecting Stripe:', error.message)
    sendError(res, 500, 'Impossible de délier ton compte Stripe pour le moment.')
  }
})

app.post('/api/listings/create', async (req, res) => {
  const { userId, title, description, priceEur, city, category, mileageKm, modelYear, images, deliveryMethod } = req.body
  const safeUserId = Number(userId)
  const safeTitle = String(title || '').trim()
  const safeDescription = String(description || '').trim()
  const safeCity = String(city || '').trim()
  const safePrice = Number(priceEur)
  const categoryValidation = validateListingCategoryAndCarFields(
    category,
    mileageKm,
    modelYear,
  )
  const deliveryValidation = validateDeliveryMethod(deliveryMethod)
  const safeImages = normalizeListingImages(images)
  const imagesPayloadSize = JSON.stringify(safeImages).length

  if (!safeUserId || !safeTitle || !safeDescription || !safeCity || !Number.isFinite(safePrice)) {
    return sendError(res, 400, 'Merci de remplir tous les champs de l’annonce.')
  }

  if (Array.isArray(images) && images.length > MAX_LISTING_IMAGES) {
    return sendError(res, 400, 'Tu peux ajouter jusqu’à 3 photos maximum.')
  }

  if (imagesPayloadSize > MAX_IMAGES_JSON_CHARS) {
    return sendError(
      res,
      413,
      'Les photos sont trop volumineuses. Réduis leur taille ou leur qualité puis réessaie.',
    )
  }

  if (!categoryValidation.isValid) {
    return sendError(res, 400, categoryValidation.message)
  }

  if (!deliveryValidation.isValid) {
    return sendError(res, 400, deliveryValidation.message)
  }

  if (safePrice <= 0) {
    return sendError(res, 400, 'Le prix doit être supérieur à 0.')
  }

  try {
    await ensureListingColumnsExist()

    const user = await getUserById(safeUserId)

    if (!user) {
      return sendError(res, 404, 'Compte introuvable.')
    }

    if (!ensureUserNotBanned(res, user)) {
      return
    }

    if (user.role !== USER_ROLES.SELLER && user.role !== USER_ROLES.ADMIN) {
      return sendError(res, 403, 'Tu dois être vendeur pour créer une annonce.')
    }

    if (
      user.role === USER_ROLES.SELLER &&
      (!user.stripe_account_id || !Boolean(user.stripe_charges_enabled))
    ) {
      return sendError(
        res,
        403,
        'Tu dois lier et activer ton compte Stripe Connect avant de publier une annonce.',
      )
    }

    const [result] = await pool.query(
      `INSERT INTO listings
       (user_id, title, description, price_eur, city, category, mileage_km, model_year, images_json, delivery_method)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        safeUserId,
        safeTitle,
        safeDescription,
        safePrice,
        safeCity,
        categoryValidation.category,
        categoryValidation.mileageKm,
        categoryValidation.modelYear,
        safeImages.length > 0 ? JSON.stringify(safeImages) : null,
        deliveryValidation.value,
      ],
    )

    res.status(201).json({
      id: result.insertId,
      title: safeTitle,
      description: safeDescription,
      priceEur: safePrice,
      city: safeCity,
      category: categoryValidation.category,
      mileageKm: categoryValidation.mileageKm,
      modelYear: categoryValidation.modelYear,
      deliveryMethod: deliveryValidation.value,
      images: safeImages,
    })
  } catch (error) {
    console.error('Listing create failed:', error)

    const normalizedMessage = String(error?.message || '').toLowerCase()
    const normalizedCode = String(error?.code || '').toUpperCase()

    if (String(error?.message || '').toLowerCase().includes('max_allowed_packet')) {
      return sendError(
        res,
        413,
        'Les photos sont trop volumineuses pour la base de données. Réduis leur taille puis réessaie.',
      )
    }

    if (
      normalizedCode === 'ER_NET_PACKET_TOO_LARGE' ||
      normalizedCode === 'ER_DATA_TOO_LONG' ||
      normalizedMessage.includes('packet')
    ) {
      return sendError(
        res,
        413,
        'Les photos sont trop volumineuses. Réduis leur taille ou envoie moins de photos.',
      )
    }

    if (normalizedCode === 'ER_BAD_FIELD_ERROR' && normalizedMessage.includes('images_json')) {
      return sendError(
        res,
        500,
        'Le stockage des photos n’est pas prêt côté serveur. Redémarre le serveur puis réessaie.',
      )
    }

    if (safeImages.length > 0) {
      return sendError(
        res,
        413,
        'Les photos sont trop volumineuses ou invalides. Essaie avec des images plus légères.',
      )
    }

    sendError(res, 500, GENERIC_ERROR_MESSAGE)
  }
})

app.put('/api/listings/:listingId', async (req, res) => {
  const { listingId } = req.params
  const requestBody = req.body || {}
  const { userId, title, description, priceEur, city, category, mileageKm, modelYear, deliveryMethod } = requestBody
  const userIdFromQuery = req.query?.userId

  const safeListingId = Number(listingId)
  const safeUserId = Number(userId ?? userIdFromQuery)
  const safeTitle = String(title || '').trim()
  const safeDescription = String(description || '').trim()
  const safeCity = String(city || '').trim()
  const safePrice = Number(priceEur)
  const categoryValidation = validateListingCategoryAndCarFields(
    category,
    mileageKm,
    modelYear,
  )
  const deliveryValidation = validateDeliveryMethod(deliveryMethod)

  if (!safeListingId || !safeUserId || !safeTitle || !safeDescription || !safeCity || !Number.isFinite(safePrice)) {
    return sendError(res, 400, 'Merci de remplir tous les champs de l’annonce.')
  }

  if (!categoryValidation.isValid) {
    return sendError(res, 400, categoryValidation.message)
  }

  if (!deliveryValidation.isValid) {
    return sendError(res, 400, deliveryValidation.message)
  }

  if (safePrice <= 0) {
    return sendError(res, 400, 'Le prix doit être supérieur à 0.')
  }

  try {
    await ensureListingColumnsExist()

    const user = await getUserById(safeUserId)

    if (!user) {
      return sendError(res, 404, 'Compte introuvable.')
    }

    if (!ensureUserNotBanned(res, user)) {
      return
    }

    const [listings] = await pool.query(
      'SELECT id, user_id FROM listings WHERE id = ? LIMIT 1',
      [safeListingId],
    )

    if (listings.length === 0) {
      return sendError(res, 404, 'Annonce introuvable.')
    }

    const listing = listings[0]
    const canManageListing = listing.user_id === safeUserId || user.role === USER_ROLES.ADMIN

    if (!canManageListing) {
      return sendError(res, 403, 'Tu ne peux modifier que tes propres annonces.')
    }

    await pool.query(
      `UPDATE listings
       SET title = ?, description = ?, price_eur = ?, city = ?, category = ?, mileage_km = ?, model_year = ?, delivery_method = ?
       WHERE id = ?`,
      [
        safeTitle,
        safeDescription,
        safePrice,
        safeCity,
        categoryValidation.category,
        categoryValidation.mileageKm,
        categoryValidation.modelYear,
        deliveryValidation.value,
        safeListingId,
      ],
    )

    res.json({
      id: safeListingId,
      title: safeTitle,
      description: safeDescription,
      priceEur: safePrice,
      city: safeCity,
      category: categoryValidation.category,
      mileageKm: categoryValidation.mileageKm,
      modelYear: categoryValidation.modelYear,
      deliveryMethod: deliveryValidation.value,
      message: 'Annonce modifiée avec succès.',
    })
  } catch (error) {
    sendError(res, 500, GENERIC_ERROR_MESSAGE)
  }
})

app.delete('/api/listings/:listingId', async (req, res) => {
  const { listingId } = req.params
  const requestBody = req.body || {}
  const { userId } = requestBody
  const userIdFromQuery = req.query?.userId

  const safeListingId = Number(listingId)
  const safeUserId = Number(userId ?? userIdFromQuery)

  if (!safeListingId || !safeUserId) {
    return sendError(res, 400, 'Données invalides.')
  }

  try {
    const user = await getUserById(safeUserId)

    if (!user) {
      return sendError(res, 404, 'Compte introuvable.')
    }

    if (!ensureUserNotBanned(res, user)) {
      return
    }

    const [listings] = await pool.query(
      'SELECT id, user_id FROM listings WHERE id = ? LIMIT 1',
      [safeListingId],
    )

    if (listings.length === 0) {
      return sendError(res, 404, 'Annonce introuvable.')
    }

    const listing = listings[0]
    const canManageListing = listing.user_id === safeUserId || user.role === USER_ROLES.ADMIN

    if (!canManageListing) {
      return sendError(res, 403, 'Tu ne peux supprimer que tes propres annonces.')
    }

    await ensureFavoritesTableExists()
    await ensurePurchaseRequestsTableExists()
    await ensureTransactionsTableExists()
    await pool.query('DELETE FROM favorites WHERE listing_id = ?', [safeListingId])
    await pool.query('DELETE FROM transactions WHERE listing_id = ?', [safeListingId])
    await pool.query('DELETE FROM purchase_requests WHERE listing_id = ?', [safeListingId])
    await pool.query('DELETE FROM listings WHERE id = ?', [safeListingId])

    res.json({ message: 'Annonce supprimée avec succès.' })
  } catch (error) {
    sendError(res, 500, GENERIC_ERROR_MESSAGE)
  }
})

app.get('/api/admin/users', async (req, res) => {
  const { adminUserId } = req.query
  const safeAdminUserId = Number(adminUserId)

  if (!safeAdminUserId) {
    return sendError(res, 400, 'Utilisateur invalide.')
  }

  try {
    const admin = await getUserById(safeAdminUserId)

    if (!admin || admin.role !== USER_ROLES.ADMIN) {
      return sendError(res, 403, 'Accès refusé. Seuls les admins peuvent accéder à cette ressource.')
    }

    await ensureBannedColumnExists()
    const [users] = await pool.query(
      'SELECT id, email, display_name, role, is_banned, created_at FROM users ORDER BY created_at DESC',
    )

    res.json(users)
  } catch (error) {
    sendError(res, 500, GENERIC_ERROR_MESSAGE)
  }
})

app.get('/api/admin/listings', async (req, res) => {
  const { adminUserId } = req.query
  const safeAdminUserId = Number(adminUserId)

  if (!safeAdminUserId) {
    return sendError(res, 400, 'Utilisateur invalide.')
  }

  try {
    const admin = await getUserById(safeAdminUserId)

    if (!admin || admin.role !== USER_ROLES.ADMIN) {
      return sendError(res, 403, 'Accès refusé. Seuls les admins peuvent accéder à cette ressource.')
    }

    await ensureListingColumnsExist()

    const [listings] = await pool.query(
      `SELECT
         l.id,
         l.title,
         l.price_eur,
         l.city,
         l.category,
        l.is_sold,
         l.created_at,
         l.user_id,
         u.display_name AS seller_name,
         u.email AS seller_email
       FROM listings l
       LEFT JOIN users u ON u.id = l.user_id
       ORDER BY l.created_at DESC`,
    )

    res.json(listings)
  } catch (error) {
    sendError(res, 500, GENERIC_ERROR_MESSAGE)
  }
})

app.post('/api/admin/ban-user', async (req, res) => {
  const { adminUserId, userId, isBanned } = req.body
  const safeAdminUserId = Number(adminUserId)
  const safeUserId = Number(userId)
  const safeBanned = Boolean(isBanned)

  if (!safeAdminUserId || !safeUserId) {
    return sendError(res, 400, 'Données invalides.')
  }

  try {
    const admin = await getUserById(safeAdminUserId)

    if (!admin || admin.role !== USER_ROLES.ADMIN) {
      return sendError(res, 403, 'Accès refusé. Seuls les admins peuvent bannir des utilisateurs.')
    }

    const user = await getUserById(safeUserId)

    if (!user) {
      return sendError(res, 404, 'Utilisateur introuvable.')
    }

    if (user.id === admin.id) {
      return sendError(res, 400, 'Tu ne peux pas te bannir toi-même.')
    }

    await ensureBannedColumnExists()
    await pool.query('UPDATE users SET is_banned = ? WHERE id = ?', [safeBanned, safeUserId])

    res.json({
      message: safeBanned ? 'Utilisateur banni avec succès.' : 'Utilisateur débanni avec succès.',
      userId: safeUserId,
      isBanned: safeBanned,
    })
  } catch (error) {
    sendError(res, 500, GENERIC_ERROR_MESSAGE)
  }
})

app.delete('/api/admin/users/:userId', async (req, res) => {
  const { userId } = req.params
  const { adminUserId } = req.body
  const safeAdminUserId = Number(adminUserId)
  const safeUserId = Number(userId)

  if (!safeAdminUserId || !safeUserId) {
    return sendError(res, 400, 'Données invalides.')
  }

  try {
    const admin = await getUserById(safeAdminUserId)

    if (!admin || admin.role !== USER_ROLES.ADMIN) {
      return sendError(res, 403, 'Accès refusé. Seuls les admins peuvent supprimer des comptes.')
    }

    const user = await getUserById(safeUserId)

    if (!user) {
      return sendError(res, 404, 'Utilisateur introuvable.')
    }

    if (user.id === admin.id) {
      return sendError(res, 400, 'Tu ne peux pas supprimer ton propre compte en tant qu\'admin.')
    }

    await ensureFavoritesTableExists()
    await ensurePurchaseRequestsTableExists()
    await ensureTransactionsTableExists()
    await pool.query('DELETE FROM favorites WHERE user_id = ?', [safeUserId])
    await pool.query(
      'DELETE f FROM favorites f INNER JOIN listings l ON l.id = f.listing_id WHERE l.user_id = ?',
      [safeUserId],
    )
    await pool.query('DELETE FROM transactions WHERE buyer_id = ? OR seller_id = ?', [
      safeUserId,
      safeUserId,
    ])
    await pool.query('DELETE FROM purchase_requests WHERE buyer_id = ? OR seller_id = ?', [
      safeUserId,
      safeUserId,
    ])
    await pool.query('DELETE FROM listings WHERE user_id = ?', [safeUserId])
    await pool.query('DELETE FROM users WHERE id = ?', [safeUserId])

    res.json({ message: 'Compte utilisateur et ses annonces ont été supprimés.' })
  } catch (error) {
    sendError(res, 500, GENERIC_ERROR_MESSAGE)
  }
})

app.delete('/api/admin/listings/:listingId', async (req, res) => {
  const { listingId } = req.params
  const { adminUserId } = req.body
  const safeAdminUserId = Number(adminUserId)
  const safeListingId = Number(listingId)

  if (!safeAdminUserId || !safeListingId) {
    return sendError(res, 400, 'Données invalides.')
  }

  try {
    const admin = await getUserById(safeAdminUserId)

    if (!admin || admin.role !== USER_ROLES.ADMIN) {
      return sendError(res, 403, 'Accès refusé. Seuls les admins peuvent supprimer des annonces.')
    }

    const [listings] = await pool.query(
      'SELECT id FROM listings WHERE id = ? LIMIT 1',
      [safeListingId],
    )

    if (listings.length === 0) {
      return sendError(res, 404, 'Annonce introuvable.')
    }

    await ensureFavoritesTableExists()
    await ensurePurchaseRequestsTableExists()
    await ensureTransactionsTableExists()
    await pool.query('DELETE FROM favorites WHERE listing_id = ?', [safeListingId])
    await pool.query('DELETE FROM transactions WHERE listing_id = ?', [safeListingId])
    await pool.query('DELETE FROM purchase_requests WHERE listing_id = ?', [safeListingId])
    await pool.query('DELETE FROM listings WHERE id = ?', [safeListingId])

    res.json({ message: 'Annonce supprimée avec succès.' })
  } catch (error) {
    sendError(res, 500, GENERIC_ERROR_MESSAGE)
  }
})

app.use((error, _req, res, next) => {
  const isJsonParseError =
    (error instanceof SyntaxError && error.status === 400) ||
    error?.type === 'entity.parse.failed'
  const isPayloadTooLarge = error?.type === 'entity.too.large' || error?.status === 413

  if (isJsonParseError) {
    return sendError(res, 400, 'Le formulaire envoyé est invalide. Merci de réessayer.')
  }

  if (isPayloadTooLarge) {
    return sendError(
      res,
      413,
      'Les photos envoyées sont trop volumineuses. Réduis leur taille ou envoie-en moins.',
    )
  }

  return next(error)
})

app.use((_error, _req, res, _next) => {
  sendError(res, 500, GENERIC_ERROR_MESSAGE)
})

app.listen(PORT, () => {
  console.log(`ZeGoodCorner API en écoute sur http://localhost:${PORT}`)
})

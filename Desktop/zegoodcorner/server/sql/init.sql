CREATE DATABASE IF NOT EXISTS zegoodcorner
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE zegoodcorner;

CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  first_name VARCHAR(120) NOT NULL,
  last_name VARCHAR(120) NOT NULL,
  display_name VARCHAR(120) NOT NULL,
  role ENUM('acheteur', 'vendeur', 'admin') NOT NULL DEFAULT 'acheteur',
  stripe_account_id VARCHAR(255) NULL,
  stripe_charges_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  stripe_details_submitted BOOLEAN NOT NULL DEFAULT FALSE,
  stripe_payouts_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email)
);

CREATE TABLE IF NOT EXISTS listings (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  title VARCHAR(180) NOT NULL,
  description TEXT NOT NULL,
  price_eur DECIMAL(10,2) NOT NULL,
  city VARCHAR(120) NOT NULL,
  category VARCHAR(32) NOT NULL DEFAULT 'divertissement',
  mileage_km INT NULL,
  model_year INT NULL,
  images_json LONGTEXT NULL,
  delivery_method VARCHAR(32) NOT NULL DEFAULT 'remise_main_propre',
  is_sold BOOLEAN NOT NULL DEFAULT FALSE,
  sold_to_user_id INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_listings_created_at (created_at),
  CONSTRAINT fk_listings_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS purchase_requests (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  listing_id INT UNSIGNED NOT NULL,
  conversation_id INT UNSIGNED NOT NULL,
  buyer_id INT UNSIGNED NOT NULL,
  seller_id INT UNSIGNED NOT NULL,
  status ENUM('pending', 'accepted', 'refused') NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_purchase_requests_listing (listing_id),
  KEY idx_purchase_requests_conversation (conversation_id),
  KEY idx_purchase_requests_seller_status (seller_id, status),
  KEY idx_purchase_requests_buyer_status (buyer_id, status)
);

CREATE TABLE IF NOT EXISTS transactions (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  purchase_request_id INT UNSIGNED NOT NULL,
  listing_id INT UNSIGNED NOT NULL,
  buyer_id INT UNSIGNED NOT NULL,
  seller_id INT UNSIGNED NOT NULL,
  amount_eur DECIMAL(10,2) NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'eur',
  status ENUM('pending', 'succeeded', 'failed') NOT NULL DEFAULT 'pending',
  stripe_checkout_session_id VARCHAR(255) NULL,
  stripe_payment_intent_id VARCHAR(255) NULL,
  shipping_address_json LONGTEXT NULL,
  shipping_address_submitted_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_transactions_request (purchase_request_id),
  KEY idx_transactions_listing (listing_id),
  KEY idx_transactions_buyer (buyer_id),
  KEY idx_transactions_status (status)
);

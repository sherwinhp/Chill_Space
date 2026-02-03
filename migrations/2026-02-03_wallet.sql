-- Wallet and wallet-payment migration
-- Run this once against the chill_space database.

CREATE TABLE IF NOT EXISTS wallets (
  user_id INT NOT NULL,
  balance_cents BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  CONSTRAINT fk_wallets_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

CREATE TABLE IF NOT EXISTS wallet_transactions (
  id BIGINT NOT NULL AUTO_INCREMENT,
  user_id INT NOT NULL,
  type ENUM('topup','payment','refund','adjustment','reward') NOT NULL,
  amount_cents BIGINT NOT NULL,
  status ENUM('pending','completed','failed','cancelled') NOT NULL DEFAULT 'pending',
  provider ENUM('paypal','wallet','system') NOT NULL,
  provider_ref VARCHAR(255) DEFAULT NULL,
  metadata JSON DEFAULT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_wallet_transactions_user (user_id),
  KEY idx_wallet_transactions_created (created_at),
  UNIQUE KEY uq_wallet_provider_ref (provider, provider_ref),
  CONSTRAINT fk_wallet_transactions_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

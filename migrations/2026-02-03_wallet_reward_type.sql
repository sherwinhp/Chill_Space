-- Add reward type for cashback transaction entries.
ALTER TABLE wallet_transactions
  MODIFY COLUMN type ENUM('topup','payment','refund','adjustment','reward') NOT NULL;


ALTER TABLE rooms
  ADD COLUMN IF NOT EXISTS normal_hourly_rate DECIMAL(10,2) NULL AFTER hourly_rate,
  ADD COLUMN IF NOT EXISTS peak_hourly_rate DECIMAL(10,2) NULL AFTER normal_hourly_rate;

UPDATE rooms
SET
  normal_hourly_rate = COALESCE(normal_hourly_rate, hourly_rate),
  peak_hourly_rate = COALESCE(peak_hourly_rate, hourly_rate)
WHERE normal_hourly_rate IS NULL OR peak_hourly_rate IS NULL;


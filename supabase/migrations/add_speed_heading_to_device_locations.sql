-- Add speed and heading columns for transport mode detection (Snap Map)
ALTER TABLE device_locations
  ADD COLUMN IF NOT EXISTS speed DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS heading DOUBLE PRECISION;

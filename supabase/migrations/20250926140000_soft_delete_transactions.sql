-- Soft delete for transactions and unique_hash behavior
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false;

-- Index to speed up common filters
CREATE INDEX IF NOT EXISTS idx_transactions_user_is_deleted
  ON public.transactions(user_id, is_deleted);

-- Recreate unique index on (user_id, unique_hash) to ignore soft-deleted rows
DROP INDEX IF EXISTS idx_transactions_user_unique_hash;
DROP INDEX IF EXISTS idx_transactions_unique_hash;
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_user_unique_hash_active
  ON public.transactions(user_id, unique_hash)
  WHERE unique_hash IS NOT NULL AND is_deleted = false;

-- Optional: backfill NULLs to false (if column existed without default)
UPDATE public.transactions SET is_deleted = false WHERE is_deleted IS NULL;


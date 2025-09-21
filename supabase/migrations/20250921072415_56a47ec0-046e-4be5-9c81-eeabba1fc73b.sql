-- Add unique_hash column to transactions table for duplicate detection
ALTER TABLE public.transactions 
ADD COLUMN IF NOT EXISTS unique_hash TEXT;

-- Create index for better performance on duplicate checking
CREATE INDEX IF NOT EXISTS idx_transactions_unique_hash 
ON public.transactions(user_id, unique_hash) 
WHERE unique_hash IS NOT NULL;

-- Create a composite index for duplicate detection based on common fields
CREATE INDEX IF NOT EXISTS idx_transactions_duplicate_check 
ON public.transactions(user_id, date, amount, description);
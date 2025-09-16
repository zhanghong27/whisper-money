-- 添加 unique_hash 和 source 列到 transactions 表
ALTER TABLE public.transactions 
ADD COLUMN IF NOT EXISTS unique_hash TEXT,
ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';

-- 创建唯一索引防止重复导入
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_user_unique_hash 
ON public.transactions(user_id, unique_hash) 
WHERE unique_hash IS NOT NULL;

-- 为现有记录生成 unique_hash（基于日期、金额、描述的组合）
UPDATE public.transactions 
SET unique_hash = md5(user_id::text || date::text || amount::text || COALESCE(description, ''))
WHERE unique_hash IS NULL;

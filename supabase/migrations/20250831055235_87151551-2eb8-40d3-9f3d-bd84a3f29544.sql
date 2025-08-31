-- 修复函数安全路径问题
DROP FUNCTION IF EXISTS public.update_updated_at_column();
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP FUNCTION IF EXISTS public.handle_new_user();
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data ->> 'name', NEW.email));
  
  -- 创建默认账户
  INSERT INTO public.accounts (user_id, name, type, balance, icon, color)
  VALUES (NEW.id, '现金', 'cash', 0, '💵', '#10B981');
  
  -- 创建默认分类
  INSERT INTO public.categories (user_id, name, type, icon, color, is_system) VALUES
  (NEW.id, '餐饮', 'expense', '🍽️', '#EF4444', true),
  (NEW.id, '交通', 'expense', '🚗', '#3B82F6', true),
  (NEW.id, '购物', 'expense', '🛍️', '#F59E0B', true),
  (NEW.id, '娱乐', 'expense', '🎮', '#8B5CF6', true),
  (NEW.id, '医疗', 'expense', '🏥', '#EC4899', true),
  (NEW.id, '工资', 'income', '💼', '#10B981', true),
  (NEW.id, '奖金', 'income', '🎁', '#059669', true),
  (NEW.id, '投资', 'income', '📈', '#0D9488', true);
  
  RETURN NEW;
END;
$$;
-- Chạy sau supabase-bang-can-da-nang.sql trên DB cân.
-- Copy MT sang bang_can_da_nang rồi xóa khỏi can_tu_dong trong 1 transaction.
-- Bỏ qua dòng đã có trên Đà Nẵng (trùng id hoặc event_id) để chạy lại không lỗi unique.
CREATE OR REPLACE FUNCTION public.chuyen_can_mt_da_nang()
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cols text;
  copied bigint;
  removed bigint;
BEGIN
  LOCK TABLE public.can_tu_dong, public.bang_can_da_nang IN EXCLUSIVE MODE;

  SELECT string_agg(quote_ident(attname), ', ' ORDER BY attnum) INTO cols
  FROM pg_attribute
  WHERE attrelid = 'public.can_tu_dong'::regclass
    AND attnum > 0
    AND NOT attisdropped
    AND attgenerated = '';

  EXECUTE format(
    'INSERT INTO public.bang_can_da_nang (%s) OVERRIDING SYSTEM VALUE
     SELECT %s
     FROM public.can_tu_dong src
     WHERE upper(ltrim(src.qr_code)) LIKE ''MT%%''
       AND NOT EXISTS (
         SELECT 1 FROM public.bang_can_da_nang dst WHERE dst.id = src.id
       )
       AND (
         src.event_id IS NULL
         OR NOT EXISTS (
           SELECT 1 FROM public.bang_can_da_nang dst WHERE dst.event_id = src.event_id
         )
       )',
    cols,
    cols
  );
  GET DIAGNOSTICS copied = ROW_COUNT;

  -- Xóa mọi MT đã có trên Đà Nẵng (vừa copy hoặc đã chuyển trước đó).
  DELETE FROM public.can_tu_dong c
  WHERE upper(ltrim(c.qr_code)) LIKE 'MT%'
    AND (
      EXISTS (SELECT 1 FROM public.bang_can_da_nang d WHERE d.id = c.id)
      OR (
        c.event_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM public.bang_can_da_nang d WHERE d.event_id = c.event_id)
      )
    );
  GET DIAGNOSTICS removed = ROW_COUNT;

  RETURN removed;
END;
$$;

REVOKE ALL ON FUNCTION public.chuyen_can_mt_da_nang() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.chuyen_can_mt_da_nang() TO service_role;
NOTIFY pgrst, 'reload schema';

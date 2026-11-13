-- Chạy sau supabase-bang-can-da-nang.sql trên DB cân.
-- Copy và delete trong cùng transaction: lỗi bất kỳ bước nào sẽ rollback.
CREATE OR REPLACE FUNCTION public.chuyen_can_mt_da_nang()
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cols text; copied bigint; removed bigint;
BEGIN
  LOCK TABLE public.can_tu_dong, public.bang_can_da_nang IN EXCLUSIVE MODE;
  SELECT string_agg(quote_ident(attname), ', ' ORDER BY attnum) INTO cols
  FROM pg_attribute
  WHERE attrelid = 'public.can_tu_dong'::regclass AND attnum > 0
    AND NOT attisdropped AND attgenerated = '';
  EXECUTE format(
    'INSERT INTO public.bang_can_da_nang (%s) OVERRIDING SYSTEM VALUE SELECT %s FROM public.can_tu_dong WHERE upper(ltrim(qr_code)) LIKE ''MT%%''', cols, cols);
  GET DIAGNOSTICS copied = ROW_COUNT;
  DELETE FROM public.can_tu_dong WHERE upper(ltrim(qr_code)) LIKE 'MT%';
  GET DIAGNOSTICS removed = ROW_COUNT;
  IF removed <> copied THEN RAISE EXCEPTION 'Số bản ghi chuyển không khớp'; END IF;
  RETURN removed;
END;
$$;
REVOKE ALL ON FUNCTION public.chuyen_can_mt_da_nang() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.chuyen_can_mt_da_nang() TO service_role;
NOTIFY pgrst, 'reload schema';

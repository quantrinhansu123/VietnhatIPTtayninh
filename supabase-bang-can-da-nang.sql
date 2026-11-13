-- Bảng cân Đà Nẵng: cùng cấu trúc cân AI, không sao chép dữ liệu.
BEGIN;
CREATE TABLE IF NOT EXISTS public.bang_can_da_nang
  (LIKE public.can_tu_dong INCLUDING ALL);
COMMENT ON TABLE public.bang_can_da_nang IS 'Bảng cân Đà Nẵng';
ALTER TABLE public.bang_can_da_nang ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.bang_can_da_nang TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;

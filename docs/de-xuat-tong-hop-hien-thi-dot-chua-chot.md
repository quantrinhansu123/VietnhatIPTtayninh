# Đề xuất: tab "Bảng tổng hợp" hiển thị cả đợt chưa chốt (bản tối ưu, chịu tải lớn)

## 1. Hiện trạng

Tab **Bảng tổng hợp** (`src/features/kiem-kho/index.tsx`, view `tong-hop`) đang:

- Combobox "Đợt kiểm kho" chỉ liệt kê `confirmedBatches` = `allBatches.filter(b => b.da_xac_nhan)` (dòng 421‑429).
- Dữ liệu bảng lấy từ `GET /api/kiem-kho-tong-hop?limit=5000` **không truyền `dotKiemKho`** (dòng 398) — tức FE tải **toàn bộ lịch sử** bảng `kiem_kho_tong_hop` mỗi lần vào tab rồi mới lọc theo đợt ở client.
- Bảng `kiem_kho_tong_hop` **chỉ được ghi một lần duy nhất**, tại `POST /api/kiem-kho/dot-xac-nhan` (server.ts:9082‑9122) — lúc bấm "Xác nhận kiểm kho". Route này tự lấy `select(...).limit(20000)` toàn bộ dòng chi tiết của đợt về Node rồi `group` bằng vòng lặp JS, sau đó `upsert` cả mảng kết quả lên.

→ Đợt chưa chốt không "hiện lên" được vì dữ liệu tổng hợp của nó **chưa tồn tại** trong DB (chỉ sinh ra lúc chốt). Ngoài ra, cách làm hiện tại còn **2 điểm nghẽn khi dữ liệu lớn dần**:

1. `limit=5000` không lọc theo đợt → khi số đợt × số mã NVL vượt 5000 dòng lịch sử (vài năm sử dụng), FE sẽ mất dữ liệu cũ hoặc phải tăng limit vô hạn, tải cả bảng về chỉ để lọc 1 đợt.
2. `dot-xac-nhan` gộp bằng JS sau khi kéo tối đa 20000 dòng thô về Node — nếu một đợt có hơn 20000 dòng quét (kho lớn, nhiều sản phẩm), phần vượt bị **âm thầm cắt bỏ**, tổng hợp sai mà không báo lỗi. Cách này cũng tốn băng thông DB↔Node không cần thiết vì việc `GROUP BY` vốn là việc Postgres làm rất tốt.

## 2. Nguyên tắc chọn hướng tối ưu / dễ scale

- **Gộp dữ liệu (`GROUP BY`) nên làm trong Postgres, không làm bằng vòng lặp JS.** DB tận dụng index, chỉ trả về số dòng bằng số mã NVL phân biệt (nhỏ), thay vì kéo toàn bộ dòng thô (lớn, tăng theo thời gian) qua network rồi mới gộp.
- **Không có giới hạn `limit` cứng ở tầng ứng dụng cho một phép gộp** — để Postgres tự xử lý hết tập dữ liệu của đợt đó, tránh cắt dữ liệu âm thầm khi đợt lớn dần.
- **FE luôn lọc theo đợt ngay từ query, không tải cả lịch sử về rồi lọc client-side.**
- Bảng `kiem_kho_tong_hop` vẫn giữ vai trò cache/kết quả đã chốt (đọc rất rẻ vì đã pre-aggregate) — chỉ bổ sung một đường đọc "live" cho đợt chưa chốt, cũng tính bằng `GROUP BY` ở DB, không lưu.

## 3. Thiết kế đề xuất — gộp bằng SQL function (RPC), không gộp bằng JS

### 3.1 Thêm 1 SQL function dùng chung để gộp theo `ma_nvl`

File mới `supabase-kiem-kho-tong-hop-rpc.sql` (cùng DB `kiem-kho`, chạy sau `supabase-kiem-kho.sql` + `supabase-kiem-kho-tong-hop.sql`):

```sql
-- Gộp các dòng kiem_kho của 1 đợt theo mã NVL — chạy hẳn trong Postgres,
-- không kéo dữ liệu thô về Node. Dùng cho cả xem trước (chưa chốt) lẫn khi chốt đợt.
create or replace function public.kiem_kho_gop_theo_ma_nvl(p_dot text)
returns table (
  ma_nvl text,
  ten_sp text,
  loai_sp text,
  tong_so_luong bigint
)
language sql
stable
as $$
  select
    coalesce(nullif(trim(k.ma_nvl), ''), '(không xác định)') as ma_nvl,
    max(k.ten_sp) filter (where k.ten_sp is not null) as ten_sp,
    max(k.loai_sp) filter (where k.loai_sp is not null) as loai_sp,
    count(*)::bigint as tong_so_luong
  from public.kiem_kho k
  where k.dot_kiem_kho = p_dot
  group by 1;
$$;

-- Chốt đợt: set thoi_gian_xac_nhan + gộp + upsert kiem_kho_tong_hop trong CÙNG 1
-- transaction, 1 round-trip DB — thay cho việc Node select(limit 20000) rồi group.
create or replace function public.kiem_kho_chot_dot(p_dot text, p_nguoi text)
returns setof public.kiem_kho_tong_hop
language plpgsql
as $$
declare
  v_confirmed_at timestamptz := now();
begin
  if not exists (select 1 from public.kiem_kho where dot_kiem_kho = p_dot) then
    raise exception 'DOT_NOT_FOUND';
  end if;

  if exists (
    select 1 from public.kiem_kho
    where dot_kiem_kho = p_dot and thoi_gian_xac_nhan is not null
    limit 1
  ) and not exists (
    select 1 from public.kiem_kho
    where dot_kiem_kho = p_dot and thoi_gian_xac_nhan is null
  ) then
    raise exception 'ALREADY_CONFIRMED';
  end if;

  update public.kiem_kho
  set thoi_gian_xac_nhan = v_confirmed_at
  where dot_kiem_kho = p_dot;

  insert into public.kiem_kho_tong_hop as t
    (dot_kiem_kho, ma_nvl, ten_sp, loai_sp, tong_so_luong, chot_luc, nguoi_chot)
  select p_dot, g.ma_nvl, g.ten_sp, g.loai_sp, g.tong_so_luong, v_confirmed_at, p_nguoi
  from public.kiem_kho_gop_theo_ma_nvl(p_dot) g
  on conflict (dot_kiem_kho, ma_nvl) do update set
    ten_sp = excluded.ten_sp,
    loai_sp = excluded.loai_sp,
    tong_so_luong = excluded.tong_so_luong,
    chot_luc = excluded.chot_luc,
    nguoi_chot = excluded.nguoi_chot;

  return query
    select * from public.kiem_kho_tong_hop where dot_kiem_kho = p_dot;
end;
$$;

grant execute on function public.kiem_kho_gop_theo_ma_nvl(text) to anon, authenticated, service_role;
grant execute on function public.kiem_kho_chot_dot(text, text) to anon, authenticated, service_role;
```

Index sẵn có `kiem_kho_dot_kiem_kho_idx` (trên `dot_kiem_kho`) đã đủ để `GROUP BY` trong hàm này chạy nhanh kể cả khi bảng `kiem_kho` phình lên hàng triệu dòng — Postgres chỉ quét đúng phần dữ liệu của 1 `dot_kiem_kho` nhờ index, không full-scan.

### 3.2 Backend (`server.ts`)

1. **`POST /api/kiem-kho/dot-xac-nhan`**: thay toàn bộ khối `select(...).limit(20000)` + gộp JS + `upsert` (dòng 9047‑9122) bằng 1 lệnh:

   ```ts
   const { data, error } = await db.rpc('kiem_kho_chot_dot', {
     p_dot: dotKiemKho,
     p_nguoi: nguoiXacNhan || null
   });
   ```

   Bắt lỗi `DOT_NOT_FOUND` → 404, `ALREADY_CONFIRMED` → 409 (map từ `error.message`/`error.code`). Không còn giới hạn 20000 dòng, không còn 2 round-trip (select rồi upsert) — chỉ 1 call.

2. Thêm route mới **`GET /api/kiem-kho/dot-tong-hop-live?dotKiemKho=...`**:

   ```ts
   const { data, error } = await db.rpc('kiem_kho_gop_theo_ma_nvl', { p_dot: dotKiemKho });
   ```

   Trả `{ records: data.map(r => ({ ...r, da_chot: false })) , total, source: 'supabase' }`. Không cần `limit` ở tầng Node vì Postgres đã gộp trước khi trả — số dòng trả về = số mã NVL phân biệt của đợt (thường vài chục–vài trăm), không tăng theo số lượt quét.

3. **`GET /api/kiem-kho-tong-hop`**: giữ nguyên route, nhưng bắt buộc FE truyền `dotKiemKho` khi biết đợt cụ thể (xem 3.3) — route đã hỗ trợ sẵn `query.dotKiemKho` (server.ts:9341, 9350), chỉ là FE chưa dùng.

### 3.3 Frontend (`src/features/kiem-kho/index.tsx`)

1. **Bỏ tải toàn bộ lịch sử**: đổi `loadSummary()` (dòng 394‑412) từ gọi 1 lần `/api/kiem-kho-tong-hop?limit=5000` (không lọc) sang gọi **theo đợt đang chọn**:
   - Nếu `selectedSummaryDotGroup?.da_xac_nhan` → `GET /api/kiem-kho-tong-hop?dotKiemKho=${selectedSummaryDot}` (đã sẵn, chỉ thêm query param).
   - Nếu chưa chốt → `GET /api/kiem-kho/dot-tong-hop-live?dotKiemKho=${selectedSummaryDot}` (route mới).
   - Trigger lại effect này mỗi khi `selectedSummaryDot` đổi, thay vì load 1 lần khi mở tab. Bỏ hẳn khái niệm "load toàn bộ rồi filter client" (`filteredSummaryRows`, dòng 442‑444) — kết quả trả về từ API đã đúng 1 đợt.

2. **Combobox chọn đợt**: đổi `options={confirmedBatches}` → `options={allBatches}` (dòng 975); `summaryDotOptions`/`selectedSummaryDotGroup` (dòng 421‑440) đổi nguồn từ `confirmedBatches` sang `allBatches`. Nhãn thêm nhánh hiển thị "Chưa xác nhận" khi `!b.da_xac_nhan`.

3. **UI cột "Chốt lúc"/"Người chốt"**: khi `da_chot === false` (từ route live), hiện badge `"Chưa chốt"` thay vì gọi `formatDateTime(undefined)`.

4. Text mô tả (dòng 967, 1008, 1010) đổi trung tính: "Đợt kiểm kho" / "Danh sách sản phẩm" — không còn giả định "đã chốt".

### 3.4 Vì sao cách này scale tốt hơn hướng gộp-bằng-JS (bản đề xuất trước)

| | Gộp bằng JS (Node) | Gộp bằng SQL (`RPC`, bản này) |
|---|---|---|
| Dữ liệu truyền qua network | Toàn bộ dòng thô của đợt (tăng vô hạn theo số lượt quét) | Chỉ kết quả đã gộp (≈ số mã NVL, gần như không đổi theo thời gian) |
| Giới hạn cứng | Có (`limit 2000/20000`) → cắt âm thầm khi vượt | Không — Postgres xử lý hết tập dữ liệu thật |
| Nơi tính toán | Node (CPU của server ứng dụng, dùng chung cho mọi request) | Postgres (có index, tối ưu cho `GROUP BY`) |
| Số round-trip khi chốt đợt | 2 (select rồi upsert) | 1 (function chạy trong 1 transaction) |
| Trùng logic gộp ở nhiều nơi | Có rủi ro (phải nhớ đồng bộ 2 chỗ) | Không — 1 function SQL, gọi từ mọi route |

## 4. Việc cần làm (checklist)

- [ ] Thêm file `supabase-kiem-kho-tong-hop-rpc.sql` (2 function ở mục 3.1), chạy trên Supabase project `grlcgkzotqishzxwpddc`.
- [ ] Backend: sửa `POST /api/kiem-kho/dot-xac-nhan` gọi `rpc('kiem_kho_chot_dot', ...)`, map lỗi `DOT_NOT_FOUND`/`ALREADY_CONFIRMED`.
- [ ] Backend: thêm `GET /api/kiem-kho/dot-tong-hop-live` gọi `rpc('kiem_kho_gop_theo_ma_nvl', ...)`.
- [ ] Backend: xác nhận `GET /api/kiem-kho-tong-hop` dùng đúng `dotKiemKho` khi FE truyền (đã có sẵn, không cần sửa).
- [ ] FE: `loadSummary()` gọi theo đợt (route khác nhau tuỳ `da_xac_nhan`), bỏ tải toàn bộ lịch sử.
- [ ] FE: combobox đợt dùng `allBatches`, nhãn trạng thái, badge "Chưa chốt" ở cột Chốt lúc/Người chốt.
- [ ] Cập nhật `docs/ai-tables/kiem_kho.md` (mục API + SQL + mô tả tab) sau khi code xong.

## 5. Lưu ý / rủi ro

- `kiem_kho_chot_dot` thay đổi hành vi chốt đợt (route quan trọng, ghi dữ liệu thật) — nên test kỹ trên 1 đợt thử trước khi thay production, và cân nhắc giữ code JS cũ đã comment lại trong git history (không cần giữ song song trong codebase) để rollback nhanh nếu cần.
- RPC (`db.rpc`) qua Supabase JS chịu policy RLS như bảng thường; đã có `grant execute` + các policy `_select_all/_insert_all/...` hiện có trên `kiem_kho`/`kiem_kho_tong_hop` nên không cần thêm quyền gì khác, nhưng nhớ chạy đúng RLS/grant ở trên khi thêm hàm.
- Nếu sau này cần audit "ai chốt đợt lúc mấy giờ" chi tiết hơn, log riêng ở tầng ứng dụng (trước khi gọi RPC) thay vì thêm logic vào SQL function, để function giữ vai trò thuần tính toán/ghi dữ liệu — dễ test, dễ đọc.

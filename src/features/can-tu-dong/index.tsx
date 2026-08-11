import React from 'react';

export const CAN_TU_DONG_PILOT_URL = 'https://tram-can-qr-pilot.onrender.com/';

/**
 * Ý nghĩa cột DB / dùng chung `/phan-tich-tu-dong`:
 * - tare_weight      = Cân lõi
 * - weight           = Cân sản phẩm (còn lõi)
 * - Trọng lượng bì   = mặc định 0,16 kg
 * - Trọng lượng nhựa = SP − lõi − bì
 * - core_image_*     = Ảnh cân lõi
 * - product_image_*  = Ảnh cân sản phẩm
 */
export type CanTuDongRecord = {
  id: number | string;
  event_id?: string | null;
  qr_code?: string | null;
  /** Ca sản xuất (SOURCE_SHIFT metadata hoặc suy từ giờ captured_at). */
  ca?: string | null;
  /** Cân sản phẩm (còn lõi) */
  weight?: number | string | null;
  /** Cân lõi */
  tare_weight?: number | string | null;
  /** Khối lượng thực */
  net_weight?: number | string | null;
  unit?: string | null;
  captured_at?: string | null;
  product_image_path?: string | null;
  product_image_url?: string | null;
  product_image_public_id?: string | null;
  product_preview_url?: string | null;
  preview_url?: string | null;
  core_image_path?: string | null;
  core_image_url?: string | null;
  core_image_public_id?: string | null;
  core_preview_url?: string | null;
  can_loi?: number | string | null;
  can_san_pham?: number | string | null;
  khoi_luong_thuc?: number | string | null;
  device_id?: string | null;
  weight_source?: string | null;
  status?: string | null;
  created_at?: string | null;
};

/** Trạm cân QR pilot — nhúng trong trang, không mở tab mới. */
export function CanTuDongPanel({
  onBack: _onBack,
  initialFilters: _initialFilters
}: {
  onBack: () => void;
  initialFilters?: {
    dateFrom?: string;
    dateTo?: string;
    shift?: string;
  };
}) {
  return (
    <div className="flex h-[calc(100vh-7rem)] min-h-[28rem] w-full min-w-0 flex-col overflow-hidden rounded-2xl border-2 border-zinc-900/10 bg-white shadow-sm">
      <iframe
        title="Trạm cân QR"
        src={CAN_TU_DONG_PILOT_URL}
        className="h-full w-full flex-1 border-0 bg-white"
        referrerPolicy="no-referrer-when-downgrade"
        allow="camera; microphone; clipboard-read; clipboard-write"
      />
    </div>
  );
}

export default CanTuDongPanel;

import { normalizeBbLyDoToken } from './bbBaoCaoLyDo';

export type BbGiaiTrinhFields = {
  van_de: string;
  giai_quyet: string;
  lan_lap_lai: string;
  nguoi_chiu_trach_nhiem: string;
};

/** Khoa DB: ngay|ca|may|ma_lenh — khớp 1 dòng giải trình theo lệnh. */
export function buildBbGiaiTrinhStableKey(input: {
  ngay?: string | null;
  ca?: string | null;
  may?: string | null;
  maLenh?: string | null;
}) {
  return [
    String(input.ngay || '').trim(),
    normalizeBbLyDoToken(input.ca),
    normalizeBbLyDoToken(input.may),
    normalizeBbLyDoToken(input.maLenh)
  ].join('|');
}

export function emptyBbGiaiTrinhFields(): BbGiaiTrinhFields {
  return {
    van_de: '',
    giai_quyet: '',
    lan_lap_lai: '',
    nguoi_chiu_trach_nhiem: ''
  };
}

export type BbGiaiTrinhRow = BbGiaiTrinhFields & {
  id?: string;
  khoa_on_dinh: string;
  ngay: string;
  ca: string;
  may: string;
  ma_lenh: string;
  group_key?: string | null;
  nguoi_lap?: string | null;
};

export function parseBbGiaiTrinhFields(source: unknown): BbGiaiTrinhFields {
  if (!source || typeof source !== 'object') return emptyBbGiaiTrinhFields();
  const row = source as Record<string, unknown>;
  return {
    van_de: String(row.van_de ?? row.vanDe ?? row.issue ?? '').trim(),
    giai_quyet: String(row.giai_quyet ?? row.giaiQuyet ?? row.resolution ?? '').trim(),
    lan_lap_lai: String(row.lan_lap_lai ?? row.lanLapLai ?? row.recurrence ?? '').trim(),
    nguoi_chiu_trach_nhiem: String(
      row.nguoi_chiu_trach_nhiem ?? row.nguoiChiuTrachNhiem ?? row.responsible ?? ''
    ).trim()
  };
}

export function hasBbGiaiTrinhContent(fields: BbGiaiTrinhFields): boolean {
  return Boolean(
    fields.van_de || fields.giai_quyet || fields.lan_lap_lai || fields.nguoi_chiu_trach_nhiem
  );
}

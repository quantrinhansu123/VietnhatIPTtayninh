/** Ngày lịch Việt Nam: luôn dd/mm/yyyy. Không dùng toLocaleDateString / Intl.format (Windows US hay ra 8/10). */

export type DateYmd = { year: number; month: number; day: number };

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function isValidYmd(parts: DateYmd): boolean {
  const { year, month, day } = parts;
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return false;
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const utc = Date.UTC(year, month - 1, day);
  const check = new Date(utc);
  return check.getUTCFullYear() === year && check.getUTCMonth() + 1 === month && check.getUTCDate() === day;
}

/** Lấy ngày dương lịch Asia/Ho_Chi_Minh từ timestamp — VN không DST nên cộng UTC+7 là đủ. */
function ymdFromInstant(date: Date): DateYmd | null {
  if (!Number.isFinite(date.getTime())) return null;
  const vn = new Date(date.getTime() + 7 * 60 * 60 * 1000);
  const parts = {
    year: vn.getUTCFullYear(),
    month: vn.getUTCMonth() + 1,
    day: vn.getUTCDate()
  };
  return isValidYmd(parts) ? parts : null;
}

export function formatYmd(parts: DateYmd): string {
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
}

export function formatYmdDdMmYyyy(parts: DateYmd): string {
  return `${pad2(parts.day)}/${pad2(parts.month)}/${parts.year}`;
}

/**
 * Đọc ngày từ ISO (YYYY-MM-DD), dd/mm/yyyy, hoặc Date.
 * Chuỗi có dấu / hoặc - giữa 2 số luôn hiểu là ngày/tháng/năm — không bao giờ mm/dd.
 */
export function parseDateToYmd(value: unknown): DateYmd | null {
  if (value instanceof Date) return ymdFromInstant(value);

  const text = String(value ?? '').trim();
  if (!text || text === '-') return null;

  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const parts = { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) };
    return isValidYmd(parts) ? parts : null;
  }

  const ymdSlash = text.match(/^(\d{4})[/.](\d{1,2})[/.](\d{1,2})/);
  if (ymdSlash) {
    const parts = { year: Number(ymdSlash[1]), month: Number(ymdSlash[2]), day: Number(ymdSlash[3]) };
    return isValidYmd(parts) ? parts : null;
  }

  const dmy = text.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})/);
  if (dmy) {
    const parts = { year: Number(dmy[3]), month: Number(dmy[2]), day: Number(dmy[1]) };
    return isValidYmd(parts) ? parts : null;
  }

  return null;
}

export function parseDateToIso(value: unknown): string {
  const parts = parseDateToYmd(value);
  return parts ? formatYmd(parts) : '';
}

/** ISO YYYY-MM-DD hoặc chuỗi ngày bất kỳ → dd/mm/yyyy. Rỗng thì ''. */
export function formatIsoToDdMmYyyy(value: unknown): string {
  const parts = parseDateToYmd(value);
  return parts ? formatYmdDdMmYyyy(parts) : '';
}

/** Hiển thị ô bảng / phiếu: luôn dd/mm/yyyy, thiếu dữ liệu thì '-'. */
export function formatDateDdMmYyyy(value: unknown): string {
  if (value === null || value === undefined || String(value).trim() === '') return '-';
  const parts = parseDateToYmd(value);
  if (parts) return formatYmdDdMmYyyy(parts);
  const text = String(value).trim();
  return text === '-' ? '-' : text;
}

export function parseDdMmYyyyToIso(text: string): string {
  return parseDateToIso(text);
}

/** Gõ 10082026 hoặc dán 10/08/2026 → 10/08/2026. */
export function maskDdMmYyyyInput(raw: string): string {
  const trimmed = String(raw || '').trim();
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;

  const digits = String(raw || '').replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

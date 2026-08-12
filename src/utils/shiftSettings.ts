export type ShiftSetting = {
  id: string;
  code: string;
  name: string;
  loaiCaiDat: string;
  timeFrame: string;
  startTime: string;
  endTime: string;
};

export type ShiftOption = {
  value: string;
  label: string;
};

function pickText(record: Record<string, unknown>, keys: string[], fallback = '') {
  for (const key of keys) {
    const value = record[key];
    if (value !== null && value !== undefined && String(value).trim() && String(value).trim() !== '-') {
      return String(value).trim();
    }
  }
  return fallback;
}

function formatTimeCell(value: unknown) {
  if (value === null || value === undefined || value === '') return '-';
  const raw = String(value).trim();
  if (!raw || raw === '-') return '-';
  const match = raw.match(/(\d{1,2}):(\d{2})/);
  if (!match) return raw;
  return `${String(match[1]).padStart(2, '0')}:${match[2]}`;
}

export function normalizeShiftSettings(data: unknown): ShiftSetting[] {
  const rows = Array.isArray(data)
    ? data
    : Array.isArray((data as { settings?: unknown })?.settings)
      ? (data as { settings: unknown[] }).settings
      : [];

  return rows
    .map((item): ShiftSetting | null => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const code = pickText(record, ['ma_cai_dat', 'ma', 'code']);
      const name = pickText(record, ['ten_cai_dat', 'hang_muc', 'name']);
      const startTime = formatTimeCell(
        record.gio_bat_dau ?? record.thoi_gian_bat_dau ?? record.start_time ?? record.gio_bd
      );
      const endTime = formatTimeCell(
        record.gio_ket_thuc ?? record.thoi_gian_ket_thuc ?? record.end_time ?? record.gio_kt
      );
      if (!code && !name) return null;

      return {
        id: pickText(record, ['id'], code || name),
        code: code || name,
        name: name || code,
        loaiCaiDat: pickText(record, ['loai_cai_dat', 'loai'], '-'),
        timeFrame: pickText(record, ['khung_gio'], '-'),
        startTime: startTime === '-' ? '' : startTime,
        endTime: endTime === '-' ? '' : endTime
      };
    })
    .filter((setting): setting is ShiftSetting => Boolean(setting));
}

export function getShiftTimeRange(setting: ShiftSetting) {
  if (setting.timeFrame && setting.timeFrame !== '-') return setting.timeFrame;
  if (setting.startTime && setting.endTime) return `${setting.startTime} - ${setting.endTime}`;
  return '';
}

export function formatShiftSettingLabel(setting: ShiftSetting) {
  const base = setting.name || setting.code;
  const timeRange = getShiftTimeRange(setting);
  if (!timeRange) return base;
  if (base.includes(timeRange) || /\(\s*\d{1,2}:\d{2}/.test(base)) return base;
  return `${base} (${timeRange})`;
}

export function getProductionShiftOptions(settings: ShiftSetting[]): ShiftOption[] {
  const fromTimeSettings = settings
    .filter(setting => setting.loaiCaiDat === 'Thời gian')
    .map(setting => ({
      value: setting.name || setting.code,
      label: formatShiftSettingLabel(setting)
    }))
    .filter((option, index, arr) => option.value && arr.findIndex(item => item.value === option.value) === index);

  if (fromTimeSettings.length > 0) return fromTimeSettings;

  const fallbackFromSettings = settings
    .filter(
      setting =>
        setting.loaiCaiDat === 'Sản xuất' || /ca/i.test(setting.name) || /ca/i.test(setting.code)
    )
    .map(setting => ({
      value: setting.name || setting.code,
      label: formatShiftSettingLabel(setting)
    }))
    .filter((option, index, arr) => option.value && arr.findIndex(item => item.value === option.value) === index);

  if (fallbackFromSettings.length > 0) return fallbackFromSettings;

  // Cài đặt là nguồn duy nhất cho trường Ca trên toàn hệ thống.
  // Không tự sinh ca cố định vì sẽ làm form lệch với trang /cai-dat.
  return [];
}

export function shiftNamesMatch(left: string, right: string) {
  const a = String(left ?? '').trim().toLowerCase();
  const b = String(right ?? '').trim().toLowerCase();
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

export function resolveShiftName(rawName: string, options: ShiftOption[]): string {
  const trimmed = String(rawName ?? '').trim();
  if (!trimmed || options.length === 0) return trimmed;

  for (const option of options) {
    if (trimmed === option.value || shiftNamesMatch(trimmed, option.value)) {
      return option.value;
    }
    if (shiftNamesMatch(trimmed, option.label)) {
      return option.value;
    }
  }

  const lower = trimmed.toLowerCase();
  const legacyIndex =
    lower.includes('sáng') || lower.includes('sang')
      ? 0
      : lower.includes('chiều') || lower.includes('chieu')
        ? 1
        : lower.includes('tối') || lower.includes('toi')
          ? 2
          : -1;

  if (legacyIndex >= 0 && legacyIndex < options.length) {
    return options[legacyIndex].value;
  }

  return trimmed;
}

function shiftOptionIndex(rawShift: string, options: ShiftOption[]): number {
  if (!rawShift.trim() || options.length === 0) return -1;
  const resolved = resolveShiftName(rawShift, options);
  const exact = options.findIndex(
    option =>
      option.value === resolved ||
      shiftNamesMatch(rawShift, option.value) ||
      shiftNamesMatch(resolved, option.value) ||
      shiftNamesMatch(rawShift, option.label)
  );
  if (exact >= 0) return exact;

  const extractRank = (value: string) => {
    const parsed = parseProductionCShift(value);
    if (parsed) return parsed.num;
    return null;
  };
  const currentRank = extractRank(rawShift);
  if (currentRank === null) return -1;
  return options.findIndex(
    option => extractRank(option.value) === currentRank || extractRank(option.label) === currentRank
  );
}

export function shiftIsoDateByDays(isoDate: string, deltaDays: number): string | null {
  const match = String(isoDate || '')
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return date.toISOString().slice(0, 10);
}

/**
 * Parse ca dạng 12C1 / C2 / Ca 12C1.
 * Không nhận HC1/HC2 (chữ cái đứng ngay trước C).
 */
export function parseProductionCShift(value: string): { family: string; num: number } | null {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const re = /(\d*)\s*[cC]\s*(\d+)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(raw)) !== null) {
    const idx = match.index ?? 0;
    if (idx > 0 && /[A-Za-zÀ-ỹ]/.test(raw.charAt(idx - 1))) continue;
    const num = Number(match[2]);
    if (!Number.isFinite(num)) continue;
    return { family: match[1] || '', num };
  }
  return null;
}

/**
 * Ca trước của ca hiện tại:
 * - Cùng ngày: 12C1 là ca trước của 12C2
 * - Qua ngày: 12C2 ngày hôm trước là ca trước của 12C1 hôm nay
 * - Ca HC / ca thường: theo thứ tự danh sách ca (ca đầu ngày → ca cuối ngày hôm trước)
 */
export function resolvePreviousProductionShift(
  ngay: string,
  shift: string,
  options: ShiftOption[]
): { ngay: string; shift: string } | null {
  const date = String(ngay || '').trim();
  const rawShift = String(shift || '').trim();
  if (!date || !rawShift) return null;

  const current = parseProductionCShift(rawShift);
  if (current && Number.isFinite(current.num)) {
    const resolveInOptions = (family: string, num: number, fallback: string) => {
      const matched = options.find(option => {
        const parsed = parseProductionCShift(option.value) || parseProductionCShift(option.label);
        return parsed && parsed.family === family && parsed.num === num;
      });
      return matched?.value || fallback;
    };

    // 12C2 -> 12C1 cung ngay
    if (current.num > 1) {
      const fallback = rawShift.replace(/([cC]\s*)\d+/, `$1${current.num - 1}`);
      return {
        ngay: date,
        shift: resolveInOptions(current.family, current.num - 1, fallback)
      };
    }

    // 12C1 hom nay -> 12C2 (hoac C lon nhat cung ho) cua ngay hom truoc
    const prevDate = shiftIsoDateByDays(date, -1);
    if (!prevDate) return null;

    let maxNum = 2;
    for (const option of options) {
      const parsed = parseProductionCShift(option.value) || parseProductionCShift(option.label);
      if (!parsed || parsed.family !== current.family) continue;
      if (parsed.num > maxNum) maxNum = parsed.num;
    }
    const fallback = rawShift.replace(/([cC]\s*)\d+/, `$1${maxNum}`);
    return {
      ngay: prevDate,
      shift: resolveInOptions(current.family, maxNum, fallback)
    };
  }

  if (options.length > 0) {
    const idx = shiftOptionIndex(rawShift, options);
    if (idx > 0) {
      return { ngay: date, shift: options[idx - 1].value };
    }
    if (idx === 0) {
      const prevDate = shiftIsoDateByDays(date, -1);
      if (!prevDate) return null;
      return { ngay: prevDate, shift: options[options.length - 1].value };
    }
  }

  return null;
}

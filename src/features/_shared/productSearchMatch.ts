/**
 * Khớp tìm kiếm theo sản phẩm cho các bảng danh sách (Đơn hàng, Lệnh SX…).
 *
 * Vì sao không dùng `haystack.includes(token)` đơn giản:
 * - Gõ "bb453" sẽ khớp cả "MN-BB4530" (khớp chuỗi con tuỳ tiện) → sai.
 * - Nhiều từ khoá ("bb453 6.28") hiện chỉ cần mỗi từ khớp ở MỘT DÒNG BẤT KỲ của đơn,
 *   nên 1 đơn có BB453 ở dòng 1 và 6.28kg ở dòng 2 vẫn "khớp" dù không dòng nào đúng.
 *
 * Cách làm ở đây:
 * - Chuẩn hoá bỏ dấu, bỏ mọi ký tự phân cách (space, -, ., *, /, …) thành 2 dạng:
 *   `text` (có dấu cách) và `compact` (liền nhau) để "1.4m 95m" khớp "1.4m*95m".
 * - Chấm điểm theo mức khớp: mã trùng khít > mã bắt đầu bằng > mã chứa > tên chứa.
 * - Yêu cầu TẤT CẢ từ khoá cùng khớp TRONG CÙNG MỘT DÒNG sản phẩm (hoặc cùng nhóm
 *   thông tin cấp đơn như mã đơn / khách hàng) — tránh khớp chéo dòng.
 */

export type SearchToken = {
  /** Dạng có dấu cách, đã bỏ dấu. */
  text: string;
  /** Dạng liền nhau, chỉ còn chữ + số. */
  compact: string;
};

/** Bỏ dấu tiếng Việt + hạ chữ thường. */
export function normalizeSearchText(value: string) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd');
}

/** Chỉ giữ chữ + số (bỏ space, -, ., *, /, …). */
export function compactSearchText(value: string) {
  return normalizeSearchText(value).replace(/[^a-z0-9]/g, '');
}

/**
 * Tách từ khoá. Mỗi từ giữ cả 2 dạng: có dấu cách và liền.
 * Từ khoá toàn ký tự đặc biệt bị bỏ qua.
 */
export function tokenizeSearchQuery(query: string): SearchToken[] {
  return normalizeSearchText(query)
    .split(/\s+/)
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => ({ text: part, compact: part.replace(/[^a-z0-9]/g, '') }))
    .filter(token => token.compact.length > 0);
}

export type ProductSearchField = {
  /** Giá trị gốc (mã SP, tên SP, mã đơn…). */
  value: string;
  /**
   * Trọng số ưu tiên: mã hàng nên cao hơn tên, tên cao hơn ghi chú.
   * Điểm cuối = điểm khớp × weight.
   */
  weight?: number;
};

/** Điểm khi 1 từ khoá khớp 1 trường: khít > bắt đầu > chứa. */
function scoreTokenAgainstField(token: SearchToken, field: ProductSearchField): number {
  const text = normalizeSearchText(field.value);
  if (!text) return 0;
  const compact = compactSearchText(field.value);
  const weight = field.weight ?? 1;

  if (!compact && !text.includes(token.text)) return 0;

  // Mã khít hoàn toàn, ví dụ gõ đúng "MN-BB453".
  if (compact && compact === token.compact) return 100 * weight;
  if (text.trim() === token.text) return 100 * weight;
  // Bắt đầu bằng (so cả dạng liền để "bb453" khớp "MN-BB453" phần sau dấu gạch? không — chỉ đầu chuỗi).
  if (compact && compact.startsWith(token.compact)) return 60 * weight;
  if (text.startsWith(token.text)) return 60 * weight;
  // Khớp trọn một "từ" trong chuỗi: tách theo ký tự không phải chữ/số.
  const words = text.split(/[^a-z0-9]+/).filter(Boolean);
  if (compact && words.includes(token.compact)) return 55 * weight;
  // Chứa chuỗi con ở dạng liền (bỏ phân cách): "1.4m*95m" ↔ "1.4m 95m".
  if (compact && compact.includes(token.compact)) return 30 * weight;
  if (text.includes(token.text)) return 30 * weight;
  return 0;
}

export type ProductSearchGroup = {
  /** Nhóm trường được coi là "cùng dòng" — tất cả token phải khớp trong nhóm này. */
  fields: ProductSearchField[];
};

export type ProductSearchResult = {
  matched: boolean;
  score: number;
};

/**
 * Chấm điểm 1 tập nhóm trường.
 * `matched` = tồn tại MỘT nhóm mà TẤT CẢ token đều khớp (tránh khớp chéo dòng).
 * `score` = tổng điểm tốt nhất của nhóm khớp (dùng để xếp hạng kết quả).
 */
export function matchSearchTokens(
  tokens: SearchToken[],
  groups: ProductSearchGroup[]
): ProductSearchResult {
  if (tokens.length === 0) return { matched: true, score: 0 };

  let bestScore = 0;
  let matched = false;

  for (const group of groups) {
    if (group.fields.length === 0) continue;
    let groupScore = 0;
    let allTokensMatched = true;

    for (const token of tokens) {
      let tokenBest = 0;
      for (const field of group.fields) {
        const score = scoreTokenAgainstField(token, field);
        if (score > tokenBest) tokenBest = score;
      }
      if (tokenBest === 0) {
        allTokensMatched = false;
        break;
      }
      groupScore += tokenBest;
    }

    if (allTokensMatched) {
      matched = true;
      if (groupScore > bestScore) bestScore = groupScore;
    }
  }

  return { matched, score: bestScore };
}

/** Tiện dụng: 1 nhóm trường đơn giản. */
export function matchesAllTokensInFields(tokens: SearchToken[], fields: ProductSearchField[]) {
  return matchSearchTokens(tokens, [{ fields }]).matched;
}

import React from 'react';
import { createPortal } from 'react-dom';
import { PRINT_COMPANY_NAME, vietNhatLogoUrl } from './layout/constants';
import type { MixingNormLine, MixingNormProduct, MixingNormRow } from './MixingNormMaterialsTab';

export type MixingNormRatioPrintDoc = {
  maLenhSx: string;
  ngay: string;
  ca?: string;
  isActual?: boolean;
  actualValues?: Array<Array<{ percent: number | null; weight: number | null }>>;
  intro?: string;
  products: MixingNormProduct[];
};

function formatPrintDateLong(iso: string) {
  const raw = String(iso || '').trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) {
    const now = new Date();
    return {
      day: String(now.getDate()).padStart(2, '0'),
      month: String(now.getMonth() + 1).padStart(2, '0'),
      year: String(now.getFullYear())
    };
  }
  return { day: match[3], month: match[2], year: match[1] };
}

function formatNumberVi(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '';
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 3 }).format(value);
}

function resolveLinePercentAndKg(
  line: MixingNormLine,
  tongTrongLuong: number | null
): { percent: string; kg: string } {
  const value = line.gia_tri;
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return { percent: '', kg: formatNumberVi(line.khoi_luong) };
  }
  const unit = String(line.don_vi || 'kg').trim();
  if (unit === '%') {
    const kg =
      line.khoi_luong !== null && Number.isFinite(line.khoi_luong)
        ? line.khoi_luong
        : tongTrongLuong !== null && Number.isFinite(tongTrongLuong)
          ? (tongTrongLuong * value) / 100
          : null;
    return { percent: `${formatNumberVi(value)}%`, kg: formatNumberVi(kg) };
  }
  const percent =
    tongTrongLuong && tongTrongLuong > 0
      ? `${formatNumberVi((value / tongTrongLuong) * 100)}%`
      : '';
  const kg =
    line.khoi_luong !== null && Number.isFinite(line.khoi_luong) ? line.khoi_luong : value;
  return { percent, kg: formatNumberVi(kg) };
}

function productTitle(product: MixingNormProduct) {
  const name = (product.ten_sp || product.ma_sp || 'SẢN PHẨM').trim();
  return name.toUpperCase();
}

/** Một phiếu DB → một tờ in (nhiều khối SP). */
export function toPrintDoc(row: MixingNormRow): MixingNormRatioPrintDoc {
  return {
    maLenhSx: row.ma_lenh_sx.trim(),
    ngay: row.ngay || new Date().toISOString().slice(0, 10),
    products: [...row.products].sort((a, b) =>
      `${a.ma_sp} ${a.ten_sp}`.localeCompare(`${b.ma_sp} ${b.ten_sp}`, 'vi')
    )
  };
}

export function MixingNormRatioPrintSheet({ doc }: { doc: MixingNormRatioPrintDoc }) {
  const dateParts = formatPrintDateLong(doc.ngay || '');
  const intro = doc.intro?.trim() || 'Hiện tại BPSX thay đổi tỷ lệ như sau';

  return (
    <div className="mixing-norm-ratio-print-sheet">
      <div className="mixing-norm-ratio-print-doc">
        <header className="mixing-norm-ratio-print-header">
          <img src={vietNhatLogoUrl} alt={PRINT_COMPANY_NAME} className="mixing-norm-ratio-print-logo" />
          <div className="mixing-norm-ratio-print-company">
            <p className="mixing-norm-ratio-print-company-name">{PRINT_COMPANY_NAME}</p>
            <p className="mixing-norm-ratio-print-company-sub">Phiếu tỷ lệ trộn {doc.isActual ? 'thực tế' : 'định mức'}</p>
          </div>
        </header>

        <h1 className="mixing-norm-ratio-print-title">TỶ LỆ TRỘN {doc.isActual ? 'THỰC TẾ' : 'ĐỊNH MỨC'}</h1>
        <p className="mixing-norm-ratio-print-intro">{intro}</p>
        <p className="mixing-norm-ratio-print-meta">
          Lệnh SX: <strong>{doc.maLenhSx || '—'}</strong>
          <span className="mixing-norm-ratio-print-meta-sep">·</span>
          Ngày: <strong>{`${dateParts.day}/${dateParts.month}/${dateParts.year}`}</strong>
          {doc.ca ? <><span className="mixing-norm-ratio-print-meta-sep">·</span>Ca: <strong>{doc.ca}</strong></> : null}
        </p>

        {doc.products.length === 0 ? (
          <p className="mixing-norm-ratio-print-empty">Chưa có sản phẩm định mức cho lệnh này.</p>
        ) : (
          doc.products.map((product, index) => {
            const tong = product.tong_trong_luong;
            return (
              <section
                key={`${product.ma_sp}-${index}`}
                className="mixing-norm-ratio-print-block"
              >
                <h2 className="mixing-norm-ratio-print-product">
                  {index + 1}. {productTitle(product)}
                  {product.ma_sp ? ` (${product.ma_sp})` : ''}
                </h2>
                {tong !== null && tong !== undefined ? (
                  <p className="mixing-norm-ratio-print-tonnage">
                    Tổng trọng lượng: <strong>{formatNumberVi(tong)} kg</strong>
                  </p>
                ) : null}

                <table className="mixing-norm-ratio-print-table">
                  <thead>
                    <tr>
                      <th className="col-stt">STT</th>
                      <th className="col-code">Mã NVL</th>
                      <th className="col-name">Tên NVL</th>
                      <th className="col-pct">Tỷ lệ</th>
                      <th className="col-kg">Khối lượng</th>
                      {doc.isActual ? <th className="col-kg">Thực tế</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {product.chi_tiet.length === 0 ? (
                      <tr>
                        <td colSpan={doc.isActual ? 6 : 5} className="mixing-norm-ratio-print-empty-cell">
                          Chưa có dòng NVL
                        </td>
                      </tr>
                    ) : (
                      product.chi_tiet.map((line, lineIndex) => {
                        const { percent, kg } = resolveLinePercentAndKg(line, tong);
                        return (
                          <tr key={`${product.ma_sp}-${line.ma_nvl}-${lineIndex}`}>
                            <td className="col-stt">{lineIndex + 1}</td>
                            <td className="col-code">{line.ma_nvl || ''}</td>
                            <td className="col-name">{line.ten_nvl || ''}</td>
                            <td className="col-pct">{percent}</td>
                            <td className="col-kg">{kg ? `${kg} kg` : ''}</td>
                            {doc.isActual ? (
                              <td className="col-kg">
                                {formatNumberVi(doc.actualValues?.[index]?.[lineIndex]?.percent)}%
                                {' · '}
                                {formatNumberVi(doc.actualValues?.[index]?.[lineIndex]?.weight)} kg
                              </td>
                            ) : null}
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>

                {product.ghi_chu ? (
                  <p className="mixing-norm-ratio-print-note">
                    <strong>Ghi chú:</strong> {product.ghi_chu}
                  </p>
                ) : null}
              </section>
            );
          })
        )}

        <div className="mixing-norm-ratio-print-place">
          Việt Trì, ngày {dateParts.day} tháng {dateParts.month} năm {dateParts.year}
        </div>

        <div className="mixing-norm-ratio-print-signatures">
          <div>
            <p className="role">Người lập</p>
            <span>(Ký, ghi rõ họ tên)</span>
          </div>
          <div>
            <p className="role">Người kiểm tra</p>
            <span>(Ký, ghi rõ họ tên)</span>
          </div>
          <div>
            <p className="role">Duyệt</p>
            <span>(Ký, ghi rõ họ tên)</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function MixingNormRatioPrintBatch({ docs }: { docs: MixingNormRatioPrintDoc[] }) {
  if (docs.length === 0) return null;

  return createPortal(
    <div className="mixing-norm-ratio-print-batch">
      {docs.map((doc, index) => (
        <div
          key={`${doc.maLenhSx || 'none'}-${doc.ngay}-${index}`}
          className="mixing-norm-ratio-print-page"
        >
          <MixingNormRatioPrintSheet doc={doc} />
        </div>
      ))}
    </div>,
    document.body
  );
}

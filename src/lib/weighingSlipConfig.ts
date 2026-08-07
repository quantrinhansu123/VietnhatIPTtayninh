export type WeighingSlipConfig = {
  apiBasePath: string;
  weigherStorageKey: string;
  backLabel: string;
  summaryTitle: string;
  summarySubtitle: string;
  printTitle: string;
  /** Nếu true: Mã SP chỉ chọn theo lệnh SX của ngày+ca+máy. Nếu false: chọn từ danh sách SP. */
  restrictProductsToOrders?: boolean;
  /** Ẩn CN1/CN2 trong modal Nhập liệu */
  hideWorkersInEntry?: boolean;
  /** Ẩn TL lõi / TL bì trong modal Nhập liệu */
  hideCoreShellWeights?: boolean;
  /** Ẩn trường Nghiệm thu trong modal Nhập liệu */
  hideAcceptanceStatus?: boolean;
  /** Ẩn khối Ảnh lõi trong modal Nhập liệu */
  hideCoreWeightImage?: boolean;
  /** Ẩn khối Ảnh cân trong modal Nhập liệu */
  hideWeightImage?: boolean;
  /** Ẩn Mã SP / Tên SP trong nhập liệu và bảng chi tiết */
  hideProductFields?: boolean;
  /** KL nhựa (weight) + KL màng (shellWeight) thay cho Tổng trọng lượng */
  splitPlasticFilmWeights?: boolean;
  /** Báo cáo hàng hỏng: tách 3 loại nhựa lỗi + màng + lõi */
  splitDamagedPlasticDefectWeights?: boolean;
  /** Tab ma trận phân quyền (Xem / Thêm / Sửa / Xóa) */
  accessTab?: string;
};

export const DEFAULT_WEIGHING_SLIP_CONFIG: WeighingSlipConfig = {
  apiBasePath: '/api/phieu-can-dinh-ki',
  weigherStorageKey: 'weighing-current-weigher',
  backLabel: 'Quay lại Phiếu cân ca',
  summaryTitle: 'Tổng hợp báo cáo cân',
  summarySubtitle: 'Theo dõi phiếu cân theo từng ca sản xuất',
  printTitle: 'PHIẾU CÂN CA',
  restrictProductsToOrders: true,
  accessTab: 'weighing-summary-list'
};

export const DAMAGED_GOODS_SLIP_CONFIG: WeighingSlipConfig = {
  apiBasePath: '/api/bao-cao-hang-hong',
  weigherStorageKey: 'damaged-goods-current-weigher',
  backLabel: 'Quay lại Báo cáo hàng hỏng',
  summaryTitle: 'Tổng hợp báo cáo hàng hỏng',
  summarySubtitle: 'Theo dõi phiếu hàng hỏng theo từng ca sản xuất',
  printTitle: 'BÁO CÁO HÀNG HỎNG',
  restrictProductsToOrders: false,
  hideWorkersInEntry: true,
  hideCoreShellWeights: true,
  hideAcceptanceStatus: true,
  hideCoreWeightImage: true,
  hideWeightImage: true,
  hideProductFields: true,
  splitPlasticFilmWeights: true,
  splitDamagedPlasticDefectWeights: true,
  accessTab: 'damaged-goods-report-list'
};

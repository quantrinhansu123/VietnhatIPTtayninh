/**
 * Registry: bảng Supabase → file code.
 * AI: đọc manifest `docs/ai-tables/<table>.md` trước — frontend đã tách vào `src/features/<slug>/`.
 */
export type TableId =
  | 'reports'
  | 'phieu_can_dinh_ki'
  | 'can_tu_dong'
  | 'can_tu_dong_tong_hop'
  | 'kiem_kho'
  | 'kiem_kho_chenh_lech'
  | 'quan_ly_kho'
  | 'bao_cao_hang_hong'
  | 'san_pham'
  | 'import_sp'
  | 'ma_san_pham_chi_tiet'
  | 'danh_sach_may'
  | 'kho_nvl'
  | 'phieu_xuat_nhap_kho'
  | 'ton_kho'
  | 'don_hang'
  | 'khach_hang'
  | 'lenh_xuat_hang'
  | 'lenh_sx'
  | 'ke_hoach_san_xuat'
  | 'nhan_su'
  | 'danh_sach_xe'
  | 'doi_chieu_lai_xe'
  | 'chi_phi_xe'
  | 'nhat_ky_xe'
  | 'thu_tien_khach_hang'
  | 'cai_dat_thoi_gian'
  | 'bao_cao_phoi_tron'
  | 'bang_tron_vat_tu_dinh_muc'
  | 'phieu_tron_thuc_te'
  | 'bao_cao_nghiem_thu'
  | 'bao_cao_san_luong_nvl_dinh_muc'
  | 'bao_cao_may_nvl_ton'
  | 'phieu_bao_dung_may'
  | 'phieu_giao_ca'
  | 'nhat_ky_chay_may'
  | 'control_board'
  | 'bb_bao_cao_ly_do'
  | 'bb_phan_tich_danh_gia'
  | 'bb_bao_cao_tinh_toan';

export interface TableRegistryEntry {
  table: TableId;
  label: string;
  sql: string[];
  apiPrefix: string;
  serverLines: string;
  appTab: string;
  appLines: string;
  components: string[];
  utils: string[];
}

export const TABLE_REGISTRY: Record<TableId, TableRegistryEntry> = {
  reports: {
    table: 'reports',
    label: 'Báo cáo sản lượng ca (legacy)',
    sql: ['supabase-reports.sql'],
    apiPrefix: '/api/reports',
    serverLines: '3440–3505',
    appTab: 'form',
    appLines: 'src/App.tsx (wizard báo cáo ca ~dòng 900+)',
    components: ['src/components/ShiftInfoForm.tsx', 'src/components/ProductEntryForm.tsx', 'src/components/MaterialsForm.tsx', 'src/components/WasteForm.tsx'],
    utils: ['src/utils.ts', 'src/types.ts']
  },
  phieu_can_dinh_ki: {
    table: 'phieu_can_dinh_ki',
    label: 'Phiếu cân định kỳ',
    sql: ['supabase-phieu-can-dinh-ki.sql'],
    apiPrefix: '/api/phieu-can-dinh-ki',
    serverLines: 'registerWeighingSlipRoutes — client supabase (he-thong)',
    appTab: 'weighing-summary',
    appLines: 'src/components/WeighingShiftSummary.tsx',
    components: ['src/components/WeighingShiftSummary.tsx', 'src/components/WeighingReportForm.tsx', 'src/components/WeighingSlipPrintSheet.tsx', 'src/components/WeighingImagePreviewModal.tsx', 'src/lib/weighingSlipConfig.ts'],
    utils: []
  },
  can_tu_dong: {
    table: 'can_tu_dong',
    label: 'Cân tự động',
    sql: [],
    apiPrefix: '/api/can-tu-dong',
    serverLines: 'GET /api/can-tu-dong + POST /api/can-tu-dong/bulk-delete (client supabaseWeighing)',
    appTab: 'can-tu-dong',
    appLines: 'src/features/can-tu-dong/index.tsx',
    components: ['src/components/WeighingImagePreviewModal.tsx'],
    utils: ['src/utils/canTuDongWeights.ts', 'src/utils/canTuDongExcel.ts']
  },
  can_tu_dong_tong_hop: {
    table: 'can_tu_dong_tong_hop',
    label: 'Tổng hợp số cuộn / trọng lượng cân thực tế',
    sql: ['supabase-can-tu-dong-tong-hop.sql'],
    apiPrefix: '/api/can-tu-dong-tong-hop',
    serverLines: 'GET /api/can-tu-dong-tong-hop + POST /api/can-tu-dong-tong-hop/dong-bo',
    appTab: 'dashboard | dashboard-auto',
    appLines: 'src/components/BbCanTuDongTongHopPanel.tsx',
    components: ['src/components/BbCanTuDongTongHopPanel.tsx', 'src/components/ControlBoardBbMachineReportTable.tsx'],
    utils: ['src/utils/canTuDongTongHop.ts']
  },
  kiem_kho: {
    table: 'kiem_kho',
    label: 'Báo cáo kiểm kho',
    sql: ['supabase-kiem-kho.sql', 'supabase-kiem-kho-tong-hop.sql'],
    apiPrefix: '/api/kiem-kho',
    serverLines: 'GET/POST/DELETE /api/kiem-kho + /api/kiem-kho/dot-mo, /dot, /dot-xac-nhan + /api/kiem-kho-tong-hop',
    appTab: 'kiem-kho',
    appLines: 'src/features/kiem-kho/index.tsx',
    components: ['src/components/ProductQrScanner.tsx'],
    utils: []
  },
  kiem_kho_chenh_lech: {
    table: 'kiem_kho_chenh_lech',
    label: 'Xử lý chênh lệch kiểm kho',
    sql: ['supabase-kiem-kho-chenh-lech-xu-ly.sql'],
    apiPrefix: '/api/kiem-kho/chenh-lech',
    serverLines: 'GET /api/kiem-kho/chenh-lech + POST /api/kiem-kho/chenh-lech-xu-ly (gộp kiem_kho_tong_hop DB kiem-kho + RPC ton_kho_*_gop DB chính)',
    appTab: 'kiem-kho-chenh-lech',
    appLines: 'src/features/xu-ly-chenh-lech/index.tsx',
    components: [],
    utils: []
  },
  quan_ly_kho: {
    table: 'quan_ly_kho',
    label: 'Quản lý kho',
    sql: ['supabase-quan-ly-kho.sql'],
    apiPrefix: '/api/quan-ly-kho',
    serverLines: 'GET/POST/PUT/DELETE /api/quan-ly-kho (client supabase / he-thong)',
    appTab: 'quan-ly-kho',
    appLines: 'src/features/quan-ly-kho/index.tsx',
    components: [],
    utils: []
  },
  bao_cao_hang_hong: {
    table: 'bao_cao_hang_hong',
    label: 'Báo cáo hàng hỏng',
    sql: ['supabase-bao-cao-hang-hong.sql'],
    apiPrefix: '/api/bao-cao-hang-hong',
    serverLines: '5276–5282 (registerWeighingSlipRoutes)',
    appTab: 'damaged-goods-report',
    appLines: 'src/components/WeighingShiftSummary.tsx',
    components: ['src/components/WeighingShiftSummary.tsx', 'src/components/WeighingReportForm.tsx'],
    utils: ['src/lib/weighingSlipConfig.ts']
  },
  san_pham: {
    table: 'san_pham',
    label: 'Danh mục sản phẩm',
    sql: ['supabase-san-pham.sql', 'supabase-san-pham-dinh-muc.sql', 'supabase-san-pham-dinh-muc-seed.sql', 'supabase-san-pham-npl-phan-tram.sql', 'supabase-san-pham-ton-dau-ky.sql', 'supabase-san-pham-ma-chi-tiet.sql'],
    apiPrefix: '/api/san-pham',
    serverLines: '3507–3695',
    appTab: 'products',
    appLines: 'src/features/kho-hang/index.tsx, src/features/san-pham/index.tsx, src/features/san-pham/types.ts, src/features/san-pham/productFieldClass.ts',
    components: ['src/components/ProductQrScanner.tsx', 'src/components/LineEditorSheet.tsx'],
    utils: ['src/utils/productNplComponentsExcel.ts', 'src/utils/productCatalogExcel.ts']
  },
  import_sp: {
    table: 'import_sp',
    label: 'Staging Excel định mức NVL',
    sql: ['supabase-import-sp.sql'],
    apiPrefix: '/api/import-sp',
    serverLines: 'GET/POST /api/import-sp, POST /api/import-sp/dong-bo',
    appTab: 'products',
    appLines: 'src/features/san-pham/index.tsx (Nhập / Xem / Đồng bộ Thành phần)',
    components: [],
    utils: ['src/utils/productNplComponentsExcel.ts']
  },
  ma_san_pham_chi_tiet: {
    table: 'ma_san_pham_chi_tiet',
    label: 'Mã QR/serial chi tiết của sản phẩm',
    sql: ['supabase-san-pham-ma-chi-tiet.sql', 'supabase-phieu-nhap-san-pham-ma-chi-tiet.sql'],
    apiPrefix: '/api/phieu-xuat-nhap-kho/:slipCode/ma-qr | /api/ma-san-pham/danh-dau-in',
    serverLines: 'API sinh mã khi nhập thành phẩm + đồng bộ phiếu xuất nhập kho',
    appTab: 'warehouse-history',
    appLines: 'src/features/phieu-xuat-nhap-kho/index.tsx',
    components: ['src/components/ProductQrPrintModal.tsx'],
    utils: []
  },
  danh_sach_may: {
    table: 'danh_sach_may',
    label: 'Danh sách máy',
    sql: ['supabase-danh-sach-may.sql', 'supabase-san-pham-ten-may.sql'],
    apiPrefix: '/api/danh-sach-may',
    serverLines: '3697–3870',
    appTab: 'machines',
    appLines: 'src/features/danh-sach-may/index.tsx',
    components: [],
    utils: []
  },
  kho_nvl: {
    table: 'kho_nvl',
    label: 'Kho nguyên vật liệu',
    sql: ['supabase-kho-nvl.sql'],
    apiPrefix: '/api/kho-nvl',
    serverLines: '4605–4784',
    appTab: 'materials',
    appLines: 'src/features/kho-hang/index.tsx, src/features/kho-nvl/index.tsx',
    components: ['src/components/MaterialsForm.tsx'],
    utils: [
      'src/utils/bulkOpeningStockExcel.ts',
      'src/utils/bulkMaterialTotalWeightExcel.ts',
      'src/utils/materialCatalogExcel.ts'
    ]
  },
  phieu_xuat_nhap_kho: {
    table: 'phieu_xuat_nhap_kho',
    label: 'Phiếu xuất nhập kho',
    sql: ['supabase-phieu-xuat-nhap-kho.sql', 'supabase-phieu-xuat-nhap-kho-*.sql', 'supabase-phieu-nhap-san-pham-ma-chi-tiet.sql'],
    apiPrefix: '/api/phieu-xuat-nhap-kho',
    serverLines: '4786–5118',
    appTab: 'warehouse-slip | warehouse-history',
    appLines: 'src/features/phieu-xuat-nhap-kho/index.tsx',
    components: ['src/components/WarehouseSlipPrintModal.tsx', 'src/components/ProductQrPrintModal.tsx'],
    utils: ['scripts/sync-kho-nvl-from-phieu.mjs']
  },
  ton_kho: {
    table: 'ton_kho',
    label: 'Tồn kho tổng hợp',
    sql: [
      'supabase-kho-nvl-ten-kho.sql',
      'supabase-san-pham-ten-kho.sql',
      'supabase-phieu-xuat-nhap-kho-ten-kho.sql',
      'supabase-ton-kho-rpc.sql'
    ],
    apiPrefix: '/api/ton-kho',
    serverLines: 'GET /api/ton-kho/chi-tiet + GET /api/ton-kho/tong-hop',
    appTab: 'ton-kho',
    appLines: 'src/features/ton-kho/index.tsx',
    components: ['src/components/shared/table/FilterCombobox.tsx'],
    utils: []
  },
  don_hang: {
    table: 'don_hang',
    label: 'Đơn hàng',
    sql: ['supabase-don-hang-*.sql'],
    apiPrefix: '/api/don-hang',
    serverLines: '3872–3999',
    appTab: 'orders',
    appLines: 'src/features/don-hang/index.tsx, src/features/don-hang/OrderFormModal.tsx, src/features/_shared/orderHelpers.ts',
    components: [],
    utils: []
  },
  khach_hang: {
    table: 'khach_hang',
    label: 'Khách hàng',
    sql: ['supabase-khach-hang.sql'],
    apiPrefix: '/api/khach-hang',
    serverLines: '5601–5644',
    appTab: 'customers',
    appLines: 'src/features/khach-hang/index.tsx',
    components: [],
    utils: ['src/utils/customerExcel.ts']
  },
  lenh_xuat_hang: {
    table: 'lenh_xuat_hang',
    label: 'Lệnh xuất hàng',
    sql: ['supabase-lenh-xuat-hang.sql'],
    apiPrefix: '/api/lenh-xuat-hang',
    serverLines: '5705–5790',
    appTab: 'shipping-orders',
    appLines: 'src/features/lenh-xuat-hang/index.tsx',
    components: [],
    utils: []
  },
  lenh_sx: {
    table: 'lenh_sx',
    label: 'Lệnh sản xuất',
    sql: ['supabase-lenh-sx.sql'],
    apiPrefix: '/api/lenh-sx',
    serverLines: '4001–4434',
    appTab: 'production-orders',
    appLines: 'src/features/lenh-sx/index.tsx',
    components: ['src/components/MixingProductionOrderAutofillModal.tsx'],
    utils: []
  },
  ke_hoach_san_xuat: {
    table: 'ke_hoach_san_xuat',
    label: 'Kế hoạch sản xuất',
    sql: ['supabase-ke-hoach-sx.sql', 'supabase-ke-hoach-san-xuat.sql'],
    apiPrefix: '/api/ke-hoach-sx',
    serverLines: '4200–4360',
    appTab: 'production-plan-history',
    appLines: 'src/features/ke-hoach-san-xuat/index.tsx',
    components: ['src/components/ProductionPlanNvlPrintSheet.tsx', 'src/components/ControlBoardShiftSummaryTable.tsx'],
    utils: ['src/utils/controlBoardShiftSummary.ts', 'src/utils/controlBoardShiftSummaryDetails.ts']
  },
  nhan_su: {
    table: 'nhan_su',
    label: 'Nhân sự',
    sql: [
      'supabase-nhan-su.sql',
      'supabase-nhan-su-dang-nhap.sql',
      'supabase-nhan-su-vi-tri.sql',
      'supabase-nhan-su-vi-tri-gan.sql',
      'supabase-nhan-su-quyen-xem.sql'
    ],
    apiPrefix: '/api/nhan-su',
    serverLines: '7252–7590',
    appTab: 'hr',
    appLines: 'src/features/nhan-su/index.tsx',
    components: [
      'src/components/ShiftInfoForm.tsx',
      'src/features/cai-dat-thoi-gian/StaffRoleAssignmentPanel.tsx'
    ],
    utils: ['src/utils/shiftSettings.ts', 'src/utils/staffExcel.ts', 'src/features/nhan-su/menuViews.ts']
  },
  danh_sach_xe: {
    table: 'danh_sach_xe',
    label: 'Danh sách xe',
    sql: ['supabase-danh-sach-xe.sql'],
    apiPrefix: '/api/danh-sach-xe',
    serverLines: 'API /api/danh-sach-xe',
    appTab: 'vehicles',
    appLines: 'src/features/danh-sach-xe/index.tsx',
    components: [],
    utils: []
  },
  doi_chieu_lai_xe: {
    table: 'doi_chieu_lai_xe',
    label: 'Đối chiếu lái xe',
    sql: ['supabase-danh-sach-xe.sql'],
    apiPrefix: '/api/doi-chieu-lai-xe',
    serverLines: 'API /api/doi-chieu-lai-xe',
    appTab: 'vehicles',
    appLines: 'src/features/danh-sach-xe/index.tsx',
    components: [],
    utils: []
  },
  chi_phi_xe: {
    table: 'chi_phi_xe',
    label: 'Chi phí xe',
    sql: ['supabase-danh-sach-xe.sql'],
    apiPrefix: '/api/chi-phi-xe',
    serverLines: 'API /api/chi-phi-xe',
    appTab: 'vehicles',
    appLines: 'src/features/danh-sach-xe/VehicleOperations.tsx',
    components: [],
    utils: ['src/features/_shared/recordHelpers.ts']
  },
  nhat_ky_xe: {
    table: 'nhat_ky_xe',
    label: 'Nhật ký xe',
    sql: ['supabase-danh-sach-xe.sql'],
    apiPrefix: '/api/nhat-ky-xe',
    serverLines: 'API /api/nhat-ky-xe',
    appTab: 'vehicles',
    appLines: 'src/features/danh-sach-xe/VehicleOperations.tsx',
    components: [],
    utils: []
  },
  thu_tien_khach_hang: {
    table: 'thu_tien_khach_hang',
    label: 'Thu tiền khách hàng',
    sql: ['supabase-thu-tien-khach-hang.sql'],
    apiPrefix: '/api/thu-tien-khach-hang',
    serverLines: 'API /api/thu-tien-khach-hang',
    appTab: 'vehicles',
    appLines: 'src/features/danh-sach-xe/VehicleOperations.tsx',
    components: [],
    utils: []
  },
  cai_dat_thoi_gian: {
    table: 'cai_dat_thoi_gian',
    label: 'Cài đặt ca / thời gian',
    sql: ['supabase-cai-dat-thoi-gian.sql'],
    apiPrefix: '/api/cai-dat',
    serverLines: '4481–4603',
    appTab: 'settings',
    appLines: 'src/features/cai-dat-thoi-gian/index.tsx',
    components: [
      'src/features/cai-dat-thoi-gian/RolePermissionsMatrix.tsx',
      'src/features/cai-dat-thoi-gian/StaffRoleAssignmentPanel.tsx'
    ],
    utils: [
      'src/utils/shiftSettings.ts',
      'src/features/cai-dat-thoi-gian/permissionKeys.ts',
      'src/features/cai-dat-thoi-gian/staffAssignments.ts',
      'src/features/nhan-su/menuViews.ts'
    ]
  },
  bao_cao_phoi_tron: {
    table: 'bao_cao_phoi_tron',
    label: 'Báo cáo phối trộn',
    sql: ['supabase-bao-cao-phoi-tron.sql'],
    apiPrefix: '/api/bao-cao-phoi-tron',
    serverLines: '5284–5476',
    appTab: 'mixing-report | mixing-report-list',
    appLines: 'src/components/MixingReportForm.tsx, src/components/MixingReportListView.tsx',
    components: [
      'src/components/MixingReportForm.tsx',
      'src/components/MixingReportListView.tsx',
      'src/components/MixingReportPrintSheet.tsx',
      'src/components/MixingOrderAutofillModal.tsx',
      'src/components/MixingProductionOrderAutofillModal.tsx'
    ],
    utils: ['src/lib/mixingReportModel.ts', 'src/utils/mixingOrderAutofill.ts']
  },
  bang_tron_vat_tu_dinh_muc: {
    table: 'bang_tron_vat_tu_dinh_muc',
    label: 'Bảng trộn vật tư định mức',
    sql: ['supabase-bang-tron-vat-tu-dinh-muc.sql'],
    apiPrefix: '/api/bang-tron-vat-tu-dinh-muc',
    serverLines: 'bang_tron_vat_tu_dinh_muc routes',
    appTab: '(detached from mixing-report-list UI)',
    appLines: 'src/components/MixingNormMaterialsTab.tsx',
    components: ['src/components/MixingNormMaterialsTab.tsx'],
    utils: []
  },
  phieu_tron_thuc_te: {
    table: 'phieu_tron_thuc_te',
    label: 'Phiếu trộn thực tế',
    sql: ['supabase-phieu-tron-thuc-te.sql'],
    apiPrefix: '/api/phieu-tron-thuc-te',
    serverLines: 'phieu_tron_thuc_te routes',
    appTab: '(detached from mixing-report-list UI)',
    appLines: 'src/components/ActualMixingSheetTab.tsx',
    components: ['src/components/ActualMixingSheetTab.tsx'],
    utils: []
  },
  bao_cao_nghiem_thu: {
    table: 'bao_cao_nghiem_thu',
    label: 'Báo cáo sản lượng / nghiệm thu',
    sql: ['supabase-bao-cao-nghiem-thu.sql'],
    apiPrefix: '/api/bao-cao-nghiem-thu',
    serverLines: '5708–5833',
    appTab: 'acceptance-report | acceptance-report-list',
    appLines: 'src/components/AcceptanceReportForm.tsx, src/components/AcceptanceReportListView.tsx',
    components: ['src/components/AcceptanceReportForm.tsx', 'src/components/AcceptanceReportListView.tsx', 'src/components/AcceptanceReportPrintSheet.tsx'],
    utils: []
  },
  bao_cao_san_luong_nvl_dinh_muc: {
    table: 'bao_cao_san_luong_nvl_dinh_muc',
    label: 'NVL định mức theo phiếu báo cáo sản lượng',
    sql: ['supabase-bao-cao-san-luong-nvl-dinh-muc.sql'],
    apiPrefix: '/api/bao-cao-san-luong-nvl-dinh-muc',
    serverLines: 'GET/PUT /api/bao-cao-san-luong-nvl-dinh-muc (sau bao-cao-nghiem-thu)',
    appTab: 'acceptance-report-list',
    appLines: 'src/components/AcceptanceReportListView.tsx',
    components: ['src/components/AcceptanceReportListView.tsx'],
    utils: []
  },
  bao_cao_may_nvl_ton: {
    table: 'bao_cao_may_nvl_ton',
    label: 'Báo cáo tồn NVL theo máy',
    sql: ['supabase-bao-cao-may-nvl-ton.sql', 'supabase-bao-cao-may-nvl-ton-loai.sql'],
    apiPrefix: '/api/bao-cao-may-nvl-ton',
    serverLines: '5478–5600',
    appTab: 'machine-nvl-report',
    appLines: 'src/features/bao-cao-may-nvl-ton/index.tsx',
    components: ['src/components/MachineNvlPrintSheet.tsx', 'src/components/MachineNvlReportListView.tsx'],
    utils: ['src/utils/machineNvlReports.ts']
  },
  phieu_bao_dung_may: {
    table: 'phieu_bao_dung_may',
    label: 'Phiếu báo dừng máy',
    sql: ['supabase-phieu-bao-dung-may.sql'],
    apiPrefix: '/api/phieu-bao-dung-may',
    serverLines: '5602–5689',
    appTab: 'machine-downtime-report | machine-downtime-list',
    appLines: 'src/components/MachineDowntimeReportPanel.tsx',
    components: ['src/components/MachineDowntimeReportPanel.tsx', 'src/components/MachineDowntimeReportListView.tsx', 'src/components/MachineDowntimePrintSheet.tsx', 'src/components/icons/MachineDowntimeIcon.tsx'],
    utils: []
  },
  phieu_giao_ca: {
    table: 'phieu_giao_ca',
    label: 'Phiếu giao ca (QT-16-BM02)',
    sql: ['supabase-phieu-giao-ca.sql'],
    apiPrefix: '/api/phieu-giao-ca',
    serverLines: 'GET/POST/DELETE /api/phieu-giao-ca (sau /api/phieu-bao-dung-may)',
    appTab: 'shift-handover-report | shift-handover-list',
    appLines: 'src/components/ShiftHandoverPanel.tsx',
    components: [
      'src/components/ShiftHandoverPanel.tsx',
      'src/components/ShiftHandoverListView.tsx',
      'src/components/ShiftHandoverPrintSheet.tsx'
    ],
    utils: ['src/lib/shiftHandoverModel.ts', 'src/utils/shiftHandoverAutofill.ts']
  },
  nhat_ky_chay_may: {
    table: 'nhat_ky_chay_may',
    label: 'Nhật ký chạy máy (BM-SX-11)',
    sql: ['supabase-nhat-ky-chay-may.sql'],
    apiPrefix: '/api/nhat-ky-chay-may',
    serverLines: '6217+ (sau /api/phieu-bao-dung-may)',
    appTab: 'machine-run-log | machine-run-log-list',
    appLines: 'src/components/MachineRunLogPanel.tsx',
    components: ['src/components/MachineRunLogPanel.tsx', 'src/components/MachineRunLogPrintSheet.tsx'],
    utils: []
  },
  control_board: {
    table: 'control_board',
    label: 'Bảng điều khiển (đa bảng)',
    sql: [],
    apiPrefix: '—',
    serverLines: '—',
    appTab: 'control-board | dashboard | dashboard-auto',
    appLines: 'src/features/control-board/index.tsx (mode full | report-only), src/features/dashboard/index.tsx',
    components: [
      'src/components/ControlBoardCommonFilters.tsx',
      'src/components/ControlBoardShiftSummaryTable.tsx',
      'src/components/ControlBoardBbMachineReportTable.tsx',
      'src/components/ControlBoardBbMachineReportPrintSheet.tsx',
      'src/components/ControlBoardShiftDetailModal.tsx',
      'src/components/ControlBoardShiftSummaryPrintSheet.tsx',
      'src/components/ControlBoardShiftSummaryChart.tsx'
    ],
    utils: [
      'src/utils/controlBoardShiftSummary.ts',
      'src/utils/controlBoardBbMachineReport.ts',
      'src/utils/bbBaoCaoLyDo.ts'
    ]
  },
  bb_bao_cao_ly_do: {
    table: 'bb_bao_cao_ly_do',
    label: 'Lý do giải trình in BB',
    sql: ['supabase-bb-bao-cao-ly-do.sql'],
    apiPrefix: '/api/bb-bao-cao-ly-do',
    serverLines: 'GET/PUT /api/bb-bao-cao-ly-do (sau /api/phieu-giao-ca)',
    appTab: 'dashboard | dashboard-auto | control-board',
    appLines: 'src/components/ControlBoardBbMachineReportTable.tsx',
    components: [
      'src/components/ControlBoardBbMachineReportTable.tsx',
      'src/components/ControlBoardBbMachineReportPrintSheet.tsx'
    ],
    utils: ['src/utils/bbBaoCaoLyDo.ts']
  },
  bb_phan_tich_danh_gia: {
    table: 'bb_phan_tich_danh_gia',
    label: 'Phân tích đánh giá BB',
    sql: ['supabase-bb-phan-tich-danh-gia.sql'],
    apiPrefix: '/api/bb-phan-tich-danh-gia',
    serverLines: 'GET/PUT /api/bb-phan-tich-danh-gia (sau /api/bb-bao-cao-ly-do)',
    appTab: 'dashboard | dashboard-auto | control-board',
    appLines: 'src/components/ControlBoardBbMachineReportTable.tsx',
    components: ['src/components/ControlBoardBbMachineReportTable.tsx'],
    utils: ['src/utils/bbPhanTichDanhGia.ts']
  },
  bb_bao_cao_tinh_toan: {
    table: 'bb_bao_cao_tinh_toan',
    label: 'Snapshot tính toán báo cáo BB',
    sql: ['supabase-bb-bao-cao-tinh-toan.sql'],
    apiPrefix: '/api/bb-bao-cao-tinh-toan',
    serverLines: 'GET/PUT /api/bb-bao-cao-tinh-toan (sau /api/bb-phan-tich-danh-gia)',
    appTab: 'dashboard | dashboard-auto | control-board',
    appLines: 'src/components/ControlBoardBbMachineReportTable.tsx',
    components: ['src/components/ControlBoardBbMachineReportTable.tsx'],
    utils: ['src/utils/bbBaoCaoTinhToan.ts', 'src/utils/controlBoardBbMachineReport.ts']
  }
};

export function getTableByTab(tab: string): TableRegistryEntry | undefined {
  return Object.values(TABLE_REGISTRY).find(entry =>
    entry.appTab.split('|').some(t => t.trim() === tab)
  );
}

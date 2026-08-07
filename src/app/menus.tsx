import React from 'react';
import { Icon as IconifyIcon } from '@iconify/react';
import type { IconifyIcon as IconifyIconData } from '@iconify/types';
import gear3d from '@iconify-icons/fluent-emoji/gear';
import barChart3d from '@iconify-icons/fluent-emoji/bar-chart';
import people3d from '@iconify-icons/fluent-emoji/busts-in-silhouette';
import briefcase3d from '@iconify-icons/fluent-emoji/briefcase';
import factory3d from '@iconify-icons/fluent-emoji/factory';
import deliveryTruck3d from '@iconify-icons/fluent-emoji/delivery-truck';
import manager3d from '@iconify-icons/fluent-emoji/man-office-worker';
import shield3d from '@iconify-icons/fluent-emoji/shield';
import worker3d from '@iconify-icons/fluent-emoji/factory-worker';
import warehouse3d from '@iconify-icons/fluent-emoji/package';
import inventory3d from '@iconify-icons/fluent-emoji/card-file-box';
import warehouseSlip3d from '@iconify-icons/fluent-emoji/inbox-tray';
import warehouseHistory3d from '@iconify-icons/fluent-emoji/open-file-folder';
import facility3d from '@iconify-icons/fluent-emoji/office-building';
import reportEntry3d from '@iconify-icons/fluent-emoji/memo';
import reportList3d from '@iconify-icons/fluent-emoji/clipboard';
import testTube3d from '@iconify-icons/fluent-emoji/test-tube';
import scale3d from '@iconify-icons/fluent-emoji/balance-scale';
import stopwatch3d from '@iconify-icons/fluent-emoji/stopwatch';
import notebook3d from '@iconify-icons/fluent-emoji/notebook';
import prohibited3d from '@iconify-icons/fluent-emoji/prohibited';
import chartIncreasing3d from '@iconify-icons/fluent-emoji/chart-increasing';
import buildingConstruction3d from '@iconify-icons/fluent-emoji/building-construction';
import spiralCalendar3d from '@iconify-icons/fluent-emoji/spiral-calendar';
import bentoBox3d from '@iconify-icons/fluent-emoji/bento-box';
import wrench3d from '@iconify-icons/fluent-emoji/wrench';
import pushpin3d from '@iconify-icons/fluent-emoji/round-pushpin';
import idCard3d from '@iconify-icons/fluent-emoji/identification-card';
import receipt3d from '@iconify-icons/fluent-emoji/receipt';
import controlKnobs3d from '@iconify-icons/fluent-emoji/control-knobs';
import microscope3d from '@iconify-icons/fluent-emoji/microscope';
import robot3d from '@iconify-icons/fluent-emoji/robot';
import passportControl3d from '@iconify-icons/fluent-emoji/passport-control';
import articulatedLorry3d from '@iconify-icons/fluent-emoji/articulated-lorry';
import handshake3d from '@iconify-icons/fluent-emoji/handshake';
import moneyBag3d from '@iconify-icons/fluent-emoji/money-bag';
import spiralNotepad3d from '@iconify-icons/fluent-emoji/spiral-notepad';
import books3d from '@iconify-icons/fluent-emoji/books';
import abacus3d from '@iconify-icons/fluent-emoji/abacus';
import cardIndex3d from '@iconify-icons/fluent-emoji/card-index';
import puzzlePiece3d from '@iconify-icons/fluent-emoji/puzzle-piece';
import cardIndexDividers3d from '@iconify-icons/fluent-emoji/card-index-dividers';
import alarmClock3d from '@iconify-icons/fluent-emoji/alarm-clock';
import notebookCover3d from '@iconify-icons/fluent-emoji/notebook-with-decorative-cover';
import noEntry3d from '@iconify-icons/fluent-emoji/no-entry';
import checkMarkButton3d from '@iconify-icons/fluent-emoji/check-mark-button';
import openBook3d from '@iconify-icons/fluent-emoji/open-book';
import bustSingle3d from '@iconify-icons/fluent-emoji/bust-in-silhouette';
import toolbox3d from '@iconify-icons/fluent-emoji/toolbox';
import calendarPlain3d from '@iconify-icons/fluent-emoji/calendar';
import ledger3d from '@iconify-icons/fluent-emoji/ledger';
import {
  FilePlus2, Layers, History, UsersRound, Building2, BriefcaseBusiness, Package, Cpu, Boxes,
  ClipboardList, Factory, LayoutDashboard, FlaskConical, ArrowDownToLine, Scale, Settings,
  CalendarDays, ChevronRight, ChevronLeft, ClipboardCheck, PackageX, BarChart3, Activity, Truck,
  ArrowRight, ArrowDown, ShieldCheck, UserRound, Warehouse, Ban
} from 'lucide-react';
import type { AppTab } from '../routes';
import { hubHasAllowedChild, resolveAccessTab } from './tabAccess';
import { pathFromTab } from '../routes';
import MachineDowntimeIcon from '../components/icons/MachineDowntimeIcon';

export type MenuCardConfig = {
  title: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
  icon3d?: IconifyIconData;
  tab: AppTab;
  /** Mục chưa có trang — hiển thị tên/icon nhưng không cho bấm vào (làm sau). */
  disabled?: boolean;
};

export const MAIN_MENU_ITEMS: MenuCardConfig[] = [
  {
    title: 'Quản trị',
    desc: 'Dashboard quản trị, người dùng/phân quyền, cấu hình hệ thống và danh mục dùng chung.',
    icon: Settings,
    icon3d: gear3d,
    tab: 'quan-tri'
  },
  {
    title: 'HCNS',
    desc: 'Hồ sơ nhân sự, cơ cấu tổ chức, ca làm việc và báo cáo nhân sự.',
    icon: UsersRound,
    icon3d: people3d,
    tab: 'hcns'
  },
  {
    title: 'Kinh doanh',
    desc: 'Khách hàng, đơn đặt hàng, lệnh giao/xuất hàng và báo cáo kinh doanh.',
    icon: BriefcaseBusiness,
    icon3d: briefcase3d,
    tab: 'business'
  },
  {
    title: 'Quản Đốc',
    desc: 'Kế hoạch sản xuất, lệnh sản xuất, theo dõi và báo cáo sản xuất.',
    icon: BriefcaseBusiness,
    icon3d: manager3d,
    tab: 'factory-quan-doc'
  },
  {
    title: 'QC',
    desc: 'BOM/tỷ lệ phối trộn, kiểm soát hàng hỏng, kiểm soát cân và chất lượng.',
    icon: ShieldCheck,
    icon3d: shield3d,
    tab: 'factory-qc'
  },
  {
    title: 'Công nhân',
    desc: 'Công việc được giao, nhập báo cáo ca và lịch sử công việc.',
    icon: UserRound,
    icon3d: worker3d,
    tab: 'factory-cong-nhan'
  },
  {
    title: 'Kho',
    desc: 'Danh mục kho, kho NVL, kho thành phẩm, kiểm kho và xuất nhập kho.',
    icon: Warehouse,
    icon3d: warehouse3d,
    tab: 'factory-kho'
  },
  {
    title: 'Quản lý máy',
    desc: 'Danh sách máy móc, tình trạng và thông tin vận hành.',
    icon: Cpu,
    icon3d: wrench3d,
    tab: 'machines'
  },
  {
    title: 'Lái xe',
    desc: 'Công việc được giao, tuyến giao hàng, nhật ký, chi phí và thu tiền khách hàng.',
    icon: Truck,
    icon3d: deliveryTruck3d,
    tab: 'vehicles'
  }
];

export function MenuPageHeader({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-card">
      <h2 className="font-display text-base font-semibold tracking-tight text-slate-900">{title}</h2>
      <p className="mt-0.5 text-[11.5px] leading-snug text-slate-500">{desc}</p>
    </div>
  );
}

export const REPORT_FORM_MENU_ITEMS: MenuCardConfig[] = [
  {
    title: 'Báo cáo tồn',
    desc: 'Theo dõi NVL tồn theo từng máy và ca sản xuất.',
    icon: Boxes,
    icon3d: abacus3d,
    tab: 'machine-nvl-report'
  },
  {
    title: 'Trộn nguyên vật liệu',
    desc: 'Nhập bảng trộn vật tư theo ca, máy và lần phối trộn.',
    icon: FlaskConical,
    icon3d: testTube3d,
    tab: 'mixing-report'
  },
  {
    title: 'Phiếu cân',
    desc: 'Lập phiếu cân, ghi nhận khối lượng và xem tổng hợp theo ca.',
    icon: Scale,
    icon3d: scale3d,
    tab: 'weighing-summary'
  },
  {
    title: 'Phiếu báo dừng máy',
    desc: 'Ghi nhận thời gian dừng, lý do và số cuộn ảnh hưởng theo ca.',
    icon: MachineDowntimeIcon,
    icon3d: stopwatch3d,
    tab: 'machine-downtime-report'
  },
  {
    title: 'Nhật ký chạy máy',
    desc: 'Thợ chính ghi mỗi 2 giờ: tốc độ, nhiệt độ, cuộn ra và hiệu suất ca.',
    icon: Activity,
    icon3d: notebook3d,
    tab: 'machine-run-log'
  },
  {
    title: 'Báo cáo hàng hỏng',
    desc: 'Lập phiếu hàng hỏng với các cột và chức năng giống phiếu cân ca.',
    icon: PackageX,
    icon3d: prohibited3d,
    tab: 'damaged-goods-report'
  },
  {
    title: 'Báo cáo sản lượng',
    desc: 'Ghi nhận mặt hàng, số lượng và ảnh sản lượng theo ca.',
    icon: ClipboardCheck,
    icon3d: chartIncreasing3d,
    tab: 'acceptance-report'
  },
  {
    title: 'Báo cáo kiểm kho',
    desc: 'Quét mã SP bằng máy BT-A700 / camera và lưu vào bảng kiểm kho.',
    icon: ClipboardList,
    icon3d: reportList3d,
    tab: 'kiem-kho'
  }
];

export const PRODUCTION_REPORT_MENU_ITEMS: MenuCardConfig[] = [
  {
    title: 'Nhập báo cáo',
    desc: 'Mở các phiếu nhập báo cáo theo ca sản xuất.',
    icon: FilePlus2,
    icon3d: reportEntry3d,
    tab: 'report-forms'
  },
  {
    title: 'Xem báo cáo',
    desc: 'Mở danh sách phiếu cân, phối trộn và báo cáo sản lượng đã lưu.',
    icon: ClipboardList,
    icon3d: openBook3d,
    tab: 'report-lists'
  }
];

export const FACILITY_MENU_ITEMS: MenuCardConfig[] = [
  {
    title: 'Kho NVL',
    desc: 'Quản lý nguyên phụ liệu, trọng lượng, khổ cuộn và tồn nhập xuất.',
    icon: Boxes,
    icon3d: inventory3d,
    tab: 'materials'
  },
  {
    title: 'Sản phẩm',
    desc: 'Xem danh mục mã hàng, nhóm VTHH, đơn vị và tồn kho.',
    icon: Package,
    icon3d: bentoBox3d,
    tab: 'products'
  },
  {
    title: 'Danh sách máy',
    desc: 'Quản lý danh sách máy móc, tình trạng và thông tin vận hành.',
    icon: Cpu,
    icon3d: wrench3d,
    tab: 'machines'
  },
  {
    title: 'Lệnh sản xuất',
    desc: 'Xem danh sách lệnh SX, mã hàng, trạng thái và kế hoạch sản xuất.',
    icon: Factory,
    icon3d: factory3d,
    tab: 'production-orders'
  },
  {
    title: 'Phiếu xuất nhập kho',
    desc: 'Lập phiếu nhập hoặc xuất NVL theo từng mã NPL.',
    icon: ArrowDownToLine,
    icon3d: warehouseSlip3d,
    tab: 'warehouse-slip'
  },
  {
    title: 'Lịch sử xuất nhập kho',
    desc: 'Tra cứu phiếu đã lưu, lọc theo loại và ngày.',
    icon: History,
    icon3d: warehouseHistory3d,
    tab: 'warehouse-history'
  },
  {
    title: 'Quản lý kho',
    desc: 'Danh mục kho: tên kho, vị trí, tên vị trí và người phụ trách.',
    icon: Warehouse,
    icon3d: pushpin3d,
    tab: 'quan-ly-kho'
  }
];

export const REPORT_LIST_MENU_ITEMS: MenuCardConfig[] = [
  {
    title: 'Danh sách báo cáo tồn',
    desc: 'Xem báo cáo NVL tồn theo từng máy và ca sản xuất.',
    icon: Boxes,
    icon3d: cardIndex3d,
    tab: 'machine-nvl-report-list'
  },
  {
    title: 'Danh sách trộn nguyên vật liệu',
    desc: 'Lấy danh sách báo cáo phối trộn đã lưu theo ngày, ca và máy.',
    icon: Layers,
    icon3d: puzzlePiece3d,
    tab: 'mixing-report-list'
  },
  {
    title: 'Phiếu cân ca',
    desc: 'Xem danh sách phiếu cân và cộng dồn theo ca.',
    icon: History,
    icon3d: cardIndexDividers3d,
    tab: 'weighing-summary-list'
  },
  {
    title: 'Cân tự động',
    desc: 'Xem dữ liệu cân tự động (can_tu_dong); bấm ảnh để mở modal.',
    icon: Scale,
    icon3d: robot3d,
    tab: 'can-tu-dong'
  },
  {
    title: 'Báo cáo kiểm kho',
    desc: 'Nhập và xem các dòng kiểm kho đã quét mã SP.',
    icon: ClipboardList,
    icon3d: reportList3d,
    tab: 'kiem-kho'
  },
  {
    title: 'Danh sách báo cáo hàng hỏng',
    desc: 'Xem, sửa và in các phiếu hàng hỏng đã lưu theo ngày, ca và máy.',
    icon: PackageX,
    icon3d: noEntry3d,
    tab: 'damaged-goods-report-list'
  },
  {
    title: 'Danh sách báo cáo sản lượng',
    desc: 'Xem, sửa và in các phiếu báo cáo sản lượng đã lưu.',
    icon: ClipboardList,
    icon3d: checkMarkButton3d,
    tab: 'acceptance-report-list'
  },
  {
    title: 'Danh sách phiếu nhập kho thành phẩm',
    desc: 'Tra cứu các phiếu nhập kho thành phẩm đã lưu.',
    icon: ArrowDownToLine,
    icon3d: warehouseHistory3d,
    tab: 'warehouse-history'
  },
  {
    title: 'Danh sách báo cáo dừng máy',
    desc: 'Xem các phiếu báo dừng máy đã lưu và lịch sử gần nhất.',
    icon: MachineDowntimeIcon,
    icon3d: alarmClock3d,
    tab: 'machine-downtime-list'
  },
  {
    title: 'Danh sách nhật ký chạy máy',
    desc: 'Xem các nhật ký chạy máy BM-SX-11 đã lưu và in lại.',
    icon: Activity,
    icon3d: notebookCover3d,
    tab: 'machine-run-log-list'
  }
];

export const ADMIN_MENU_ITEMS: MenuCardConfig[] = [
  {
    title: 'Dashboard quản trị',
    desc: 'Tổng quan nhân sự, kinh doanh, sản xuất, kho và vận chuyển.',
    icon: LayoutDashboard,
    icon3d: barChart3d,
    tab: 'dashboard'
  },
  {
    title: 'Người dùng và phân quyền',
    desc: 'Tài khoản, vị trí, vai trò và thiết lập quyền xem menu theo phòng ban.',
    icon: UsersRound,
    icon3d: passportControl3d,
    tab: 'settings'
  },
  {
    title: 'Cấu hình hệ thống',
    desc: 'Tham số vận hành, ca làm việc/ca sản xuất và cấu hình chung.',
    icon: Settings,
    icon3d: toolbox3d,
    tab: 'settings'
  },
  {
    title: 'Danh mục dùng chung',
    desc: 'Sản phẩm, nguyên vật liệu, máy móc, kho/vị trí kho và phương tiện.',
    icon: Boxes,
    icon3d: books3d,
    tab: 'quan-tri',
    disabled: true
  }
];

export const HCNS_MENU_ITEMS: MenuCardConfig[] = [
  {
    title: 'Hồ sơ nhân sự',
    desc: 'Bảng danh sách nhân viên.',
    icon: UsersRound,
    icon3d: bustSingle3d,
    tab: 'hr'
  },
  {
    title: 'Cơ cấu tổ chức',
    desc: 'Chi nhánh, bộ phận và vị trí công việc.',
    icon: Building2,
    icon3d: buildingConstruction3d,
    tab: 'hcns',
    disabled: true
  },
  {
    title: 'Ca làm việc',
    desc: 'Danh mục ca và phân ca nhân sự.',
    icon: CalendarDays,
    icon3d: calendarPlain3d,
    tab: 'hcns',
    disabled: true
  },
  {
    title: 'Báo cáo nhân sự',
    desc: 'Báo cáo tổng hợp nhân sự.',
    icon: BarChart3,
    icon3d: ledger3d,
    tab: 'hcns',
    disabled: true
  }
];

export const BUSINESS_MENU_ITEMS: MenuCardConfig[] = [
  {
    title: 'Khách hàng',
    desc: 'Xem danh sách khách hàng phục vụ lập và tra cứu đơn hàng.',
    icon: BriefcaseBusiness,
    icon3d: idCard3d,
    tab: 'customers'
  },
  {
    title: 'Đơn đặt hàng',
    desc: 'Tạo đơn hàng, theo dõi mã đơn, khách hàng, mã hàng và lệnh sản xuất.',
    icon: ClipboardList,
    icon3d: receipt3d,
    tab: 'orders'
  },
  {
    title: 'Lệnh giao / xuất hàng',
    desc: 'Tạo lệnh xuất hàng cho khách hàng, chọn khách từ danh mục.',
    icon: Truck,
    icon3d: articulatedLorry3d,
    tab: 'shipping-orders'
  },
  {
    title: 'Báo cáo kinh doanh',
    desc: 'Báo cáo tổng hợp kinh doanh.',
    icon: BarChart3,
    icon3d: moneyBag3d,
    tab: 'business',
    disabled: true
  }
];

export const FACTORY_MENU_ITEMS: MenuCardConfig[] = [
  {
    title: 'Quản Đốc',
    desc: 'Theo dõi lệnh SX, kế hoạch và báo cáo tổng hợp nhà máy.',
    icon: BriefcaseBusiness,
    icon3d: manager3d,
    tab: 'factory-quan-doc'
  },
  {
    title: 'QC',
    desc: 'Quản lý chất lượng: sản lượng, hàng hỏng và phiếu cân ca.',
    icon: ShieldCheck,
    icon3d: shield3d,
    tab: 'factory-qc'
  },
  {
    title: 'Công nhân',
    desc: 'Nhập và xem báo cáo sản xuất theo ca làm việc.',
    icon: UserRound,
    icon3d: worker3d,
    tab: 'factory-cong-nhan'
  },
  {
    title: 'Kho',
    desc: 'Kho NVL, phiếu xuất nhập và lịch sử xuất nhập kho.',
    icon: Warehouse,
    icon3d: warehouse3d,
    tab: 'factory-kho'
  },
  {
    title: 'Quản lý CSVC',
    desc: 'Kho NVL, sản phẩm, máy móc và phiếu xuất nhập kho.',
    icon: Building2,
    icon3d: facility3d,
    tab: 'facility-management'
  }
];

export const FACTORY_QUAN_DOC_MENU_ITEMS: MenuCardConfig[] = [
  {
    title: 'Kế hoạch sản xuất',
    desc: 'Lập kế hoạch, danh sách kế hoạch và tra cứu snapshot đã lưu theo ngày.',
    icon: CalendarDays,
    icon3d: spiralCalendar3d,
    tab: 'production-plan-history'
  },
  {
    title: 'Lệnh sản xuất',
    desc: 'Xem danh sách lệnh SX, mã hàng, trạng thái và kế hoạch sản xuất.',
    icon: Factory,
    icon3d: factory3d,
    tab: 'production-orders'
  },
  {
    title: 'Theo dõi sản xuất',
    desc: 'Nhân sự, đơn hàng, sản phẩm và danh sách máy trên một màn hình.',
    icon: LayoutDashboard,
    icon3d: controlKnobs3d,
    tab: 'control-board'
  },
  {
    title: 'Báo cáo sản xuất',
    desc: 'Phiếu cân ca, phối trộn, sản lượng và các báo cáo theo ca.',
    icon: BarChart3,
    icon3d: spiralNotepad3d,
    tab: 'production-reports'
  }
];

export const FACTORY_QC_MENU_ITEMS: MenuCardConfig[] = [
  {
    title: 'BOM và tỷ lệ phối trộn',
    desc: 'Tỷ lệ trộn theo mặt hàng, theo lệnh và theo mẻ.',
    icon: Layers,
    icon3d: puzzlePiece3d,
    tab: 'mixing-report-list'
  },
  {
    title: 'Kiểm soát hàng hỏng',
    desc: 'Xem, sửa và in các phiếu hàng hỏng đã lưu theo ngày, ca và máy.',
    icon: PackageX,
    icon3d: noEntry3d,
    tab: 'damaged-goods-report-list'
  },
  {
    title: 'Phiếu cân ca',
    desc: 'Xem danh sách phiếu cân và cộng dồn theo ca.',
    icon: History,
    icon3d: cardIndexDividers3d,
    tab: 'weighing-summary-list'
  },
  {
    title: 'Dữ liệu cân tự động',
    desc: 'Xem dữ liệu cân tự động (can_tu_dong); bấm ảnh để mở modal.',
    icon: Scale,
    icon3d: robot3d,
    tab: 'can-tu-dong'
  },
  {
    title: 'Kiểm tra kho thành phẩm',
    desc: 'Xem, sửa và in các phiếu báo cáo sản lượng đã lưu.',
    icon: ClipboardCheck,
    icon3d: checkMarkButton3d,
    tab: 'acceptance-report-list'
  },
  {
    title: 'Báo cáo chất lượng',
    desc: 'Đối chiếu chất lượng theo lệnh SX và ca sản xuất.',
    icon: LayoutDashboard,
    icon3d: microscope3d,
    tab: 'factory-qc',
    disabled: true
  }
];

export const FACTORY_CONG_NHAN_MENU_ITEMS: MenuCardConfig[] = [
  {
    title: 'Công việc được giao',
    desc: 'Lệnh sản xuất, máy được phân công và mặt hàng cần sản xuất theo ca.',
    icon: Factory,
    icon3d: factory3d,
    tab: 'production-orders'
  },
  {
    title: 'Nhập báo cáo ca',
    desc: 'Mở các phiếu nhập báo cáo theo ca sản xuất.',
    icon: FilePlus2,
    icon3d: reportEntry3d,
    tab: 'report-forms'
  },
  {
    title: 'Lịch sử công việc',
    desc: 'Mở danh sách phiếu cân, phối trộn và báo cáo sản lượng đã lưu.',
    icon: ClipboardList,
    icon3d: openBook3d,
    tab: 'report-lists'
  }
];

export const FACTORY_KHO_MENU_ITEMS: MenuCardConfig[] = [
  {
    title: 'Danh mục kho',
    desc: 'Tên kho, vị trí kho và người phụ trách.',
    icon: Warehouse,
    icon3d: pushpin3d,
    tab: 'quan-ly-kho'
  },
  {
    title: 'Kho nguyên vật liệu',
    desc: 'Quản lý nguyên phụ liệu, trọng lượng, khổ cuộn và tồn nhập xuất.',
    icon: Boxes,
    icon3d: inventory3d,
    tab: 'materials'
  },
  {
    title: 'Kho thành phẩm',
    desc: 'Danh mục sản phẩm, mã hàng, đơn vị và tồn kho.',
    icon: Package,
    icon3d: bentoBox3d,
    tab: 'products'
  },
  {
    title: 'Phiếu xuất nhập kho',
    desc: 'Lập phiếu nhập hoặc xuất NVL theo từng mã NPL.',
    icon: ArrowDownToLine,
    icon3d: warehouseSlip3d,
    tab: 'warehouse-slip'
  },
  {
    title: 'Kiểm kho',
    desc: 'Tạo đợt kiểm kho, quét mã SP và xử lý chênh lệch tồn kho.',
    icon: ClipboardList,
    icon3d: reportList3d,
    tab: 'kiem-kho'
  },
  {
    title: 'Lịch sử xuất nhập',
    desc: 'Tra cứu phiếu đã lưu, lọc theo loại và ngày.',
    icon: History,
    icon3d: warehouseHistory3d,
    tab: 'warehouse-history'
  },
  {
    title: 'Chuẩn bị xuất hàng',
    desc: 'Danh sách lệnh giao hàng, xác nhận đủ hàng và bàn giao cho lái xe.',
    icon: Truck,
    icon3d: handshake3d,
    tab: 'factory-kho',
    disabled: true
  }
];

export function MenuCardGrid({
  items,
  onNavigate
}: {
  items: MenuCardConfig[];
  onNavigate: (tab: AppTab) => void;
}) {
  return (
    <section className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
      {items.map(item => {
        const Icon = item.icon;
        const disabled = item.disabled;
        return (
          <button
            key={item.title}
            type="button"
            aria-disabled={disabled}
            onClick={() => !disabled && onNavigate(item.tab)}
            className={`group relative min-h-[80px] overflow-hidden rounded-xl border border-slate-200 bg-white p-3.5 md:p-4 text-left transition hover:border-brand-200 hover:shadow-elevated focus-visible:ring-2 focus-visible:ring-brand-500/25 ${
              disabled ? 'cursor-not-allowed' : 'active:scale-[0.99]'
            }`}
          >
            <div className="flex items-start gap-3">
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition ${
                item.icon3d
                  ? 'bg-gradient-to-br from-white to-slate-100 shadow-sm ring-1 ring-slate-200/70 group-hover:scale-110'
                  : 'bg-brand-50 text-brand-500 group-hover:bg-brand-500 group-hover:text-white'
              }`}>
                {item.icon3d ? (
                  <IconifyIcon icon={item.icon3d} className="h-8 w-8 drop-shadow-sm" />
                ) : (
                  <Icon className="h-[18px] w-[18px]" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-display font-semibold tracking-tight text-[13.5px] text-slate-900">{item.title}</span>
                <span className="mt-0.5 block text-[11.5px] leading-snug text-slate-500 line-clamp-2">{item.desc}</span>
              </span>
            </div>
          </button>
        );
      })}
    </section>
  );
}

function MainMenuFlowCard({
  item,
  step,
  showStep = true,
  largeIcon = false,
  onNavigate
}: {
  item: MenuCardConfig;
  step: number;
  showStep?: boolean;
  largeIcon?: boolean;
  onNavigate: (tab: AppTab) => void;
}) {
  const Icon = item.icon;
  const disabled = item.disabled;

  return (
    <button
      type="button"
      aria-disabled={disabled}
      onClick={() => !disabled && onNavigate(item.tab)}
      className={`group relative z-10 min-h-[112px] overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-elevated focus-visible:ring-2 focus-visible:ring-brand-500/25 ${
        disabled ? 'cursor-not-allowed' : 'active:scale-[0.99]'
      }`}
    >
      {showStep && !disabled && (
        <span className="absolute right-4 top-3 text-[10px] font-bold uppercase tracking-[0.15em] text-slate-300 transition group-hover:text-brand-400">
          Bước {String(step).padStart(2, '0')}
        </span>
      )}
      <span className={`flex items-start ${largeIcon ? 'gap-4' : 'gap-3.5'} pt-2`}>
        <span className={`flex shrink-0 items-center justify-center transition ${
          largeIcon ? 'h-16 w-16 rounded-2xl' : 'h-11 w-11 rounded-xl'
        } ${
          item.icon3d
            ? 'bg-gradient-to-br from-white via-slate-50 to-slate-100 shadow-md ring-1 ring-slate-200/80 group-hover:scale-105'
            : 'bg-brand-50 text-brand-500 group-hover:bg-brand-500 group-hover:text-white'
        }`}>
          {item.icon3d ? (
            <IconifyIcon
              icon={item.icon3d}
              className={largeIcon ? 'h-[52px] w-[52px] drop-shadow-md' : 'h-9 w-9 drop-shadow-sm'}
            />
          ) : (
            <Icon className={largeIcon ? 'h-8 w-8' : 'h-5 w-5'} strokeWidth={largeIcon ? 1.8 : 2} />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-[14px] font-semibold tracking-tight text-slate-900">
            {item.title}
          </span>
          <span className="mt-1 block text-[11.5px] leading-snug text-slate-500 line-clamp-2">
            {item.desc}
          </span>
        </span>
      </span>
    </button>
  );
}

function FlowArrow({ direction }: { direction: 'right' | 'left' | 'down' }) {
  if (direction === 'down') {
    return (
      <div className="flex items-center justify-center text-brand-400" aria-hidden="true">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-50 ring-4 ring-slate-50">
          <ArrowDown className="h-4 w-4" strokeWidth={2.5} />
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center text-brand-400" aria-hidden="true">
      <span className="h-px flex-1 bg-brand-200" />
      <ArrowRight
        className={`h-5 w-5 shrink-0 ${direction === 'left' ? 'rotate-180' : ''}`}
        strokeWidth={2.5}
      />
      <span className="h-px flex-1 bg-brand-200" />
    </div>
  );
}

export function MainMenuFlow({
  items,
  onNavigate
}: {
  items: MenuCardConfig[];
  onNavigate: (tab: AppTab) => void;
}) {
  return <MenuCardGrid items={items} onNavigate={onNavigate} />;
}

export function FourStepMenuFlow({
  items,
  onNavigate,
  showFlow = true
}: {
  items: MenuCardConfig[];
  onNavigate: (tab: AppTab) => void;
  showFlow?: boolean;
}) {
  if (items.length !== 4) {
    return <MenuCardGrid items={items} onNavigate={onNavigate} />;
  }

  return (
    <>
      <div className="lg:hidden">
        <MenuCardGrid items={items} onNavigate={onNavigate} />
      </div>
      <section
        className={`relative hidden ${showFlow
          ? 'grid-cols-[minmax(0,1fr)_38px_minmax(0,1fr)_38px_minmax(0,1fr)_38px_minmax(0,1fr)]'
          : 'grid-cols-4 gap-4'
        } lg:grid`}
        aria-label={showFlow ? 'Lưu đồ chức năng nhà máy' : 'Chức năng quản trị'}
      >
        {items.map((item, index) => (
          <React.Fragment key={item.tab}>
            <div style={showFlow ? { gridColumnStart: index * 2 + 1 } : undefined}>
              <MainMenuFlowCard item={item} step={index + 1} showStep={showFlow} onNavigate={onNavigate} />
            </div>
            {showFlow && index < items.length - 1 && (
              <div style={{ gridColumnStart: index * 2 + 2 }}>
                <FlowArrow direction="right" />
              </div>
            )}
          </React.Fragment>
        ))}
      </section>
    </>
  );
}

export const PRIMARY_NAV_GROUPS: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  tab: AppTab;
  children: { label: string; tab: AppTab; disabled?: boolean }[];
}[] = [
  {
    title: 'Quản trị',
    icon: Settings,
    tab: 'quan-tri',
    children: [
      { label: 'Dashboard quản trị', tab: 'dashboard' },
      { label: 'Người dùng và phân quyền', tab: 'settings' },
      { label: 'Cấu hình hệ thống', tab: 'settings' },
      { label: 'Danh mục dùng chung', tab: 'quan-tri', disabled: true }
    ]
  },
  {
    title: 'HCNS',
    icon: UsersRound,
    tab: 'hcns',
    children: [
      { label: 'Hồ sơ nhân sự', tab: 'hr' },
      { label: 'Cơ cấu tổ chức', tab: 'hcns', disabled: true },
      { label: 'Ca làm việc', tab: 'hcns', disabled: true },
      { label: 'Báo cáo nhân sự', tab: 'hcns', disabled: true }
    ]
  },
  {
    title: 'Kinh doanh',
    icon: BriefcaseBusiness,
    tab: 'business',
    children: [
      { label: 'Khách hàng', tab: 'customers' },
      { label: 'Đơn đặt hàng', tab: 'orders' },
      { label: 'Lệnh giao / xuất hàng', tab: 'shipping-orders' },
      { label: 'Báo cáo kinh doanh', tab: 'business', disabled: true }
    ]
  },
  {
    title: 'Quản Đốc',
    icon: Factory,
    tab: 'factory-quan-doc',
    children: [
      { label: 'Kế hoạch sản xuất', tab: 'production-plan-history' },
      { label: 'Lệnh sản xuất', tab: 'production-orders' },
      { label: 'Theo dõi sản xuất', tab: 'control-board' },
      { label: 'Báo cáo sản xuất', tab: 'production-reports' }
    ]
  },
  {
    title: 'QC',
    icon: ShieldCheck,
    tab: 'factory-qc',
    children: [
      { label: 'BOM và tỷ lệ phối trộn', tab: 'mixing-report-list' },
      { label: 'Kiểm soát hàng hỏng', tab: 'damaged-goods-report-list' },
      { label: 'Phiếu cân ca', tab: 'weighing-summary-list' },
      { label: 'Dữ liệu cân tự động', tab: 'can-tu-dong' },
      { label: 'Kiểm tra kho thành phẩm', tab: 'acceptance-report-list' },
      { label: 'Báo cáo chất lượng', tab: 'factory-qc', disabled: true }
    ]
  },
  {
    title: 'Công nhân',
    icon: UserRound,
    tab: 'factory-cong-nhan',
    children: [
      { label: 'Công việc được giao', tab: 'production-orders' },
      { label: 'Nhập báo cáo ca', tab: 'report-forms' },
      { label: 'Lịch sử công việc', tab: 'report-lists' }
    ]
  },
  {
    title: 'Kho',
    icon: Warehouse,
    tab: 'factory-kho',
    children: [
      { label: 'Danh mục kho', tab: 'quan-ly-kho' },
      { label: 'Kho nguyên vật liệu', tab: 'materials' },
      { label: 'Kho thành phẩm', tab: 'products' },
      { label: 'Phiếu xuất nhập kho', tab: 'warehouse-slip' },
      { label: 'Kiểm kho', tab: 'kiem-kho' },
      { label: 'Lịch sử xuất nhập', tab: 'warehouse-history' },
      { label: 'Chuẩn bị xuất hàng', tab: 'factory-kho', disabled: true }
    ]
  },
  {
    title: 'Quản lý máy',
    icon: Cpu,
    tab: 'machines',
    children: []
  },
  {
    title: 'Lái xe',
    icon: Truck,
    tab: 'vehicles',
    children: []
  }
];

export const TAB_TITLE_MAP: Record<string, { group: string; sub: string }> = {
  'menu': { group: 'Trang chủ', sub: 'Chọn chức năng' },
  'quan-tri': { group: 'Trang chủ', sub: 'Quản trị' },
  'hcns': { group: 'Trang chủ', sub: 'HCNS' },
  'business': { group: 'Trang chủ', sub: 'Kinh doanh' },
  'control-board': { group: 'Quản Đốc', sub: 'Theo dõi sản xuất' },
  'report-forms': { group: 'Công nhân', sub: 'Nhập báo cáo ca' },
  'form': { group: 'Công nhân', sub: 'Nhập báo cáo ca' },
  'report-lists': { group: 'Công nhân', sub: 'Lịch sử công việc' },
  'acceptance-report-list': { group: 'QC', sub: 'Kiểm tra kho thành phẩm' },
  'weighing-summary': { group: 'Công nhân', sub: 'Phiếu cân' },
  'weighing-summary-list': { group: 'QC', sub: 'Phiếu cân ca' },
  'can-tu-dong': { group: 'QC', sub: 'Dữ liệu cân tự động' },
  'kiem-kho': { group: 'Kho', sub: 'Kiểm kho' },
  'quan-ly-kho': { group: 'Kho', sub: 'Danh mục kho' },
  'damaged-goods-report': { group: 'Công nhân', sub: 'Báo cáo hàng hư' },
  'damaged-goods-report-list': { group: 'QC', sub: 'Kiểm soát hàng hỏng' },
  'mixing-report': { group: 'Công nhân', sub: 'Báo cáo trộn' },
  'mixing-report-list': { group: 'QC', sub: 'BOM và tỷ lệ phối trộn' },
  'machine-nvl-report': { group: 'Công nhân', sub: 'Báo cáo máy-NVL' },
  'machine-nvl-report-list': { group: 'Kho', sub: 'Báo cáo tồn máy' },
  'acceptance-report': { group: 'Công nhân', sub: 'Phiếu nghiệm thu' },
  'machine-downtime-report': { group: 'Công nhân', sub: 'Báo cáo máy dừng' },
  'machine-downtime-list': { group: 'Quản Đốc', sub: 'DS máy dừng' },
  'machine-run-log': { group: 'Công nhân', sub: 'Nhật ký chạy máy' },
  'machine-run-log-list': { group: 'Quản Đốc', sub: 'DS nhật ký chạy máy' },
  'production-plan-history': { group: 'Quản Đốc', sub: 'Kế hoạch sản xuất' },
  'facility-management': { group: 'Kho', sub: 'Quản lý CSVC' },
  'factory': { group: 'Trang chủ', sub: 'Chọn vai trò' },
  'materials': { group: 'Kho', sub: 'Kho nguyên vật liệu' },
  'materials-inventory': { group: 'Kho', sub: 'Kho nguyên vật liệu' },
  'products': { group: 'Kho', sub: 'Kho thành phẩm' },
  'machines': { group: 'Trang chủ', sub: 'Quản lý máy' },
  'warehouse-slip': { group: 'Kho', sub: 'Phiếu xuất nhập kho' },
  'warehouse-history': { group: 'Kho', sub: 'Lịch sử xuất nhập' },
  'settings': { group: 'Quản trị', sub: 'Người dùng và phân quyền / Cấu hình hệ thống' },
  'hr': { group: 'HCNS', sub: 'Hồ sơ nhân sự' },
  'vehicles': { group: 'Trang chủ', sub: 'Lái xe' },
  'orders': { group: 'Kinh doanh', sub: 'Đơn đặt hàng' },
  'customers': { group: 'Kinh doanh', sub: 'Khách hàng' },
  'shipping-orders': { group: 'Kinh doanh', sub: 'Lệnh giao / xuất hàng' },
  'production-orders': { group: 'Quản Đốc', sub: 'Lệnh sản xuất' },
  'factory-quan-doc': { group: 'Trang chủ', sub: 'Quản Đốc' },
  'factory-qc': { group: 'Trang chủ', sub: 'QC' },
  'factory-cong-nhan': { group: 'Trang chủ', sub: 'Công nhân' },
  'factory-kho': { group: 'Trang chủ', sub: 'Kho' },
  'dashboard': { group: 'Quản trị', sub: 'Dashboard quản trị' }
};

export function getActivePageMeta(tab: AppTab): { group: string; sub: string } {
  if (TAB_TITLE_MAP[tab]) return TAB_TITLE_MAP[tab];
  for (const group of PRIMARY_NAV_GROUPS) {
    if (group.tab === tab) return { group: group.title, sub: '' };
    const child = group.children.find(c => c.tab === tab);
    if (child) return { group: group.title, sub: child.label };
  }
  return { group: 'Trang chủ', sub: '' };
}

export function SubNav({
  activeTab,
  onNavigate,
  allowedTabs,
  fullAccess = true
}: {
  activeTab: AppTab;
  onNavigate: (tab: AppTab) => void;
  allowedTabs?: Set<string>;
  fullAccess?: boolean;
}) {
  const canSee = (tab: AppTab) => {
    if (fullAccess) return true;
    if (!allowedTabs) return false;
    const accessTab = resolveAccessTab(tab);
    return (
      allowedTabs.has(tab) ||
      allowedTabs.has(accessTab) ||
      hubHasAllowedChild(tab, allowedTabs) ||
      hubHasAllowedChild(accessTab, allowedTabs)
    );
  };
  const visibleGroups = PRIMARY_NAV_GROUPS
    .map(group => ({
      ...group,
      children: group.children.filter(child => canSee(child.tab))
    }))
    .filter(group => canSee(group.tab) || group.children.length > 0);

  const findOwnerGroupTitle = (tab: AppTab) => {
    const owner = PRIMARY_NAV_GROUPS.find(
      group => group.tab === tab || group.children.some(child => child.tab === tab)
    );
    return owner?.title;
  };

  const [expanded, setExpanded] = React.useState<Set<string>>(() => {
    const owner = findOwnerGroupTitle(activeTab);
    return new Set(owner ? [owner] : []);
  });

  // Tự động sổ ra nhóm chứa trang đang xem khi điều hướng từ nơi khác.
  React.useEffect(() => {
    const owner = findOwnerGroupTitle(activeTab);
    if (owner) {
      setExpanded(prev => (prev.has(owner) ? prev : new Set(prev).add(owner)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const toggleGroup = (title: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(title)) {
        next.delete(title);
      } else {
        next.add(title);
      }
      return next;
    });
  };

  return (
    <nav className="rounded-xl bg-white border border-slate-100 p-2">
      <ul className="flex flex-col gap-0.5">
        {visibleGroups.map(group => {
          const Icon = group.icon;
          const hasChildren = group.children.length > 0;
          const isExpanded = expanded.has(group.title);
          const isActiveGroup = activeTab === group.tab || group.children.some(c => c.tab === activeTab);
          const isExact = activeTab === group.tab;
          return (
            <li key={group.title}>
              <button
                type="button"
                onClick={() => (hasChildren ? toggleGroup(group.title) : onNavigate(group.tab))}
                aria-expanded={hasChildren ? isExpanded : undefined}
                className={`relative flex w-full items-center gap-2 rounded-lg pl-3 pr-2.5 py-2 text-left text-sm font-semibold transition ${
                  isExact
                    ? 'bg-slate-100 text-slate-900 font-bold'
                    : isActiveGroup
                    ? 'bg-slate-50 text-slate-800'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                {isExact && (
                  <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-brand-500" aria-hidden />
                )}
                <Icon className="h-[18px] w-[18px] shrink-0" />
                <span className="flex-1 truncate font-display font-semibold tracking-tight">{group.title}</span>
                {hasChildren && (
                  <ChevronRight
                    className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                  />
                )}
              </button>
              {hasChildren && isExpanded && (
                <ul className="mt-0.5 ml-3 flex flex-col gap-0.5 border-l-2 border-slate-200 pl-2">
                  {group.children.map(child => (
                    <li key={`${group.title}-${child.tab}-${child.label}`}>
                      <button
                        type="button"
                        aria-disabled={child.disabled}
                        onClick={() => !child.disabled && onNavigate(child.tab)}
                        className={`group/child relative w-full overflow-hidden rounded-md px-2 py-1.5 text-left text-[13.5px] font-semibold transition ${
                          activeTab === child.tab
                            ? 'bg-brand-50 text-brand-700 font-bold'
                            : 'text-slate-500 hover:bg-slate-50 hover:text-brand-600'
                        } ${child.disabled ? 'cursor-not-allowed' : ''}`}
                      >
                        {child.label}
                        {child.disabled && (
                          <span className="pointer-events-none absolute inset-0 z-10 flex items-center justify-end gap-1 pr-2 opacity-0 transition group-hover/child:opacity-100">
                            <Ban className="h-3.5 w-3.5 text-slate-400" strokeWidth={1.75} />
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

import fs from 'fs';
import path from 'path';

const root = path.resolve(import.meta.dirname, '..');

const TABLE_FRONTEND = {
  reports: ['src/App.tsx (wizard báo cáo ca ~dòng 900+)'],
  phieu_can_dinh_ki: ['src/components/WeighingShiftSummary.tsx'],
  bao_cao_hang_hong: ['src/components/WeighingShiftSummary.tsx'],
  san_pham: ['src/features/san-pham/index.tsx', 'src/features/san-pham/types.ts', 'src/features/san-pham/productFieldClass.ts'],
  danh_sach_may: ['src/features/danh-sach-may/index.tsx'],
  kho_nvl: ['src/features/kho-nvl/index.tsx'],
  phieu_kho: ['src/features/phieu-xuat-nhap-kho/index.tsx'],
  don_hang: ['src/features/don-hang/index.tsx', 'src/features/_shared/orderHelpers.ts'],
  khach_hang: ['src/features/khach-hang/index.tsx'],
  lenh_sx: ['src/features/lenh-sx/index.tsx'],
  ke_hoach_san_xuat: ['src/features/ke-hoach-san-xuat/index.tsx'],
  nhan_su: ['src/features/nhan-su/index.tsx'],
  cai_dat_thoi_gian: ['src/features/cai-dat-thoi-gian/index.tsx'],
  bao_cao_phoi_tron: ['src/components/MixingReportForm.tsx', 'src/components/MixingReportListView.tsx'],
  bao_cao_nghiem_thu: ['src/components/AcceptanceReportForm.tsx', 'src/components/AcceptanceReportListView.tsx'],
  bao_cao_may_nvl_ton: ['src/features/bao-cao-may-nvl-ton/index.tsx'],
  phieu_bao_dung_may: ['src/components/MachineDowntimeReportPanel.tsx'],
  control_board: ['src/features/control-board/index.tsx', 'src/features/dashboard/index.tsx']
};

for (const [table, files] of Object.entries(TABLE_FRONTEND)) {
  const mdPath = path.join(root, 'docs/ai-tables', `${table}.md`);
  if (!fs.existsSync(mdPath)) continue;

  let content = fs.readFileSync(mdPath, 'utf8');
  const frontendBlock = files.map(f => `| \`${f}\` | Panel / logic chính |`).join('\n');

  if (content.includes('## Frontend')) {
    content = content.replace(
      /## Frontend[\s\S]*?(?=\n## |\n$)/,
      `## Frontend\n\n| File | Nội dung |\n|------|----------|\n${frontendBlock}\n| \`src/App.tsx\` | Shell routing — import panel, không chứa logic bảng |\n| \`src/features/_shared/\` | Helper dùng chung (storage, hr, recordHelpers) |\n\n`
    );
  }

  content = content.replace(/Toàn bộ `App\.tsx`[^\n]*/g, 'Các file feature ở trên — không mở `App.monolith.backup.tsx` trừ khi cần tham chiếu lịch sử.');

  fs.writeFileSync(mdPath, content);
  console.log('Updated', table);
}

const registryPath = path.join(root, 'src/features/registry.ts');
let registry = fs.readFileSync(registryPath, 'utf8');

for (const [table, files] of Object.entries(TABLE_FRONTEND)) {
  const appLines = files.join(', ');
  registry = registry.replace(
    new RegExp(`(${table}:[\\s\\S]*?appLines: ')[^']*(')`, 'm'),
    `$1${appLines}$2`
  );
}

registry = registry.replace(
  /AI: đọc manifest `docs\/ai-tables\/<table>\.md` trước khi mở App\.tsx\/server\.ts\./,
  'AI: đọc manifest `docs/ai-tables/<table>.md` trước — frontend đã tách vào `src/features/<slug>/`.'
);

fs.writeFileSync(registryPath, registry);
console.log('Updated registry.ts');

const readmePath = path.join(root, 'docs/ai-tables/README.md');
let readme = fs.readFileSync(readmePath, 'utf8');
readme = readme.replace(
  /\*\*Mục đích:\*\*[^\n]*/,
  '**Mục đích:** AI chỉ đọc file bảng liên quan — không cần mở `App.monolith.backup.tsx` hay toàn bộ `server.ts`.'
);
readme = readme.replace(
  /\| `src\/App\.tsx` \(shell\)[^\n]*/,
  '| `src/App.tsx` (~1.3k dòng) | Shell layout, menu, routing — logic từng bảng ở `src/features/` |'
);
fs.writeFileSync(readmePath, readme);
console.log('Updated README.md');

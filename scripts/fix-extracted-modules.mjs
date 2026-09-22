/** Sửa các module layout/shared bị cắt sai + thêm export */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const lines = fs.readFileSync(path.join(ROOT, 'src/App.monolith.backup.tsx'), 'utf8').split('\n');

function extract(start, end) {
  return lines.slice(start - 1, end).join('\n');
}

function exportify(code) {
  return code
    .replace(/^function /gm, 'export function ')
    .replace(/^const BACK_TAB_MAP/gm, 'export const BACK_TAB_MAP')
    .replace(/^const MAIN_MENU/gm, 'export const MAIN_MENU')
    .replace(/^const REPORT_/gm, 'export const REPORT_')
    .replace(/^const PRODUCTION_/gm, 'export const PRODUCTION_')
    .replace(/^const FACILITY_/gm, 'export const FACILITY_')
    .replace(/^const HCNS_/gm, 'export const HCNS_')
    .replace(/^const BUSINESS_/gm, 'export const BUSINESS_')
    .replace(/^const FACTORY_/gm, 'export const FACTORY_')
    .replace(/^const PRIMARY_/gm, 'export const PRIMARY_')
    .replace(/^const TAB_TITLE_/gm, 'export const TAB_TITLE_')
    .replace(/^type MenuCardConfig/gm, 'export type MenuCardConfig')
    .replace(/^function Menu/gm, 'export function Menu')
    .replace(/^function SubNav/gm, 'export function SubNav')
}

fs.writeFileSync(
  path.join(ROOT, 'src/components/layout/NavButtons.tsx'),
  `import React from 'react';
import { ChevronLeft, Home } from 'lucide-react';
import { pathFromTab } from '../../routes';

${exportify(extract(417, 537))}
`
);

fs.writeFileSync(
  path.join(ROOT, 'src/components/layout/Logo.tsx'),
  `import React from 'react';
import vietNhatLogoNewUrl from '../../logo-new.png';

export function VietNhatLogo({ className = '' }: { className?: string }) {
  return (
    <img
      src={vietNhatLogoNewUrl}
      alt="Công ty Việt Nhật - HCM"
      className={\`brand-logo h-9 md:h-10 w-auto max-h-full object-contain \${className}\`}
    />
  );
}
`
);

fs.writeFileSync(
  path.join(ROOT, 'src/components/layout/constants.ts'),
  extract(104, 104).replace('const ', 'export const ')
);

fs.writeFileSync(
  path.join(ROOT, 'src/features/_shared/storage.ts'),
  `import type { ProductionReport } from '../../types';

${exportify(extract(80, 92))}
`
);

const menuIcons = `import React from 'react';
import {
  FilePlus2, Layers, History, UsersRound, Building2, BriefcaseBusiness, Package, Cpu, Boxes,
  ClipboardList, Settings, Factory, LayoutDashboard, FlaskConical, ArrowDownToLine, Scale,
  CalendarDays, ChevronRight, ChevronLeft, ClipboardCheck, PackageX
} from 'lucide-react';
import type { AppTab } from '../routes';
import { pathFromTab } from '../routes';
import MachineDowntimeIcon from '../components/icons/MachineDowntimeIcon';
`;

fs.writeFileSync(
  path.join(ROOT, 'src/app/menus.tsx'),
  `${menuIcons}\n${exportify(extract(16503, 16935))}\n`
);

console.log('Fixed layout + menus + storage');

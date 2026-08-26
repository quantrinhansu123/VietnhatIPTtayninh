import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import dotenv from 'dotenv';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { ProductionReport } from './src/types';
import { normalizeStaffViewPermissions } from './src/features/nhan-su/menuViews';
import { normalizeAssignablePositions } from './src/features/cai-dat-thoi-gian/staffAssignments';

dotenv.config();

const DB_FILE_PATH = process.env.VERCEL
  ? path.join('/tmp', 'reports-db.json')
  : path.join(process.cwd(), 'reports-db.json');
const WEIGHING_DB_FILE_PATH = process.env.VERCEL
  ? path.join('/tmp', 'phieu-can-dinh-ki-db.json')
  : path.join(process.cwd(), 'phieu-can-dinh-ki-db.json');
const DAMAGED_GOODS_DB_FILE_PATH = process.env.VERCEL
  ? path.join('/tmp', 'bao-cao-hang-hong-db.json')
  : path.join(process.cwd(), 'bao-cao-hang-hong-db.json');
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY || process.env.NEXT_PUBLIC_SUPABASE_KEY;
/** DB riêng cho phiếu cân (phieu_can_dinh_ki) — khác DB chính hệ thống. */
const SUPABASE_WEIGHING_URL =
  process.env.SUPABASE_WEIGHING_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_WEIGHING_URL ||
  '';
const SUPABASE_WEIGHING_SERVICE_KEY = process.env.SUPABASE_WEIGHING_SERVICE_KEY || '';
const SUPABASE_WEIGHING_KEY =
  SUPABASE_WEIGHING_SERVICE_KEY ||
  process.env.SUPABASE_WEIGHING_KEY ||
  process.env.SUPABASE_WEIGHING_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_WEIGHING_PUBLISHABLE_KEY ||
  '';
/** DB riêng chỉ dùng cho các API kiểm kho. */
const SUPABASE_KIEM_KHO_URL =
  process.env.SUPABASE_KIEM_KHO_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_KIEM_KHO_URL ||
  '';
const SUPABASE_KIEM_KHO_SERVICE_KEY = process.env.SUPABASE_KIEM_KHO_SERVICE_KEY || '';
const SUPABASE_KIEM_KHO_KEY =
  SUPABASE_KIEM_KHO_SERVICE_KEY ||
  process.env.SUPABASE_KIEM_KHO_KEY ||
  process.env.SUPABASE_KIEM_KHO_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_KIEM_KHO_PUBLISHABLE_KEY ||
  '';
const SUPABASE_KIEM_KHO_DB_LABEL = process.env.SUPABASE_KIEM_KHO_DB_LABEL || 'kiem-kho';
const SUPABASE_WEIGHING_DB_LABEL = process.env.SUPABASE_WEIGHING_DB_LABEL || 'phieu-can';
const SUPABASE_MAIN_DB_LABEL = process.env.SUPABASE_MAIN_DB_LABEL || 'he-thong';
const SUPABASE_TABLE = process.env.SUPABASE_TABLE || 'reports';
const SUPABASE_WEIGHING_TABLE = process.env.SUPABASE_WEIGHING_TABLE || 'phieu_can_dinh_ki';
const SUPABASE_CAN_TU_DONG_TABLE = process.env.SUPABASE_CAN_TU_DONG_TABLE || 'can_tu_dong';
const SUPABASE_CAN_TU_DONG_STORAGE_BUCKET =
  process.env.SUPABASE_CAN_TU_DONG_STORAGE_BUCKET || 'roll-captures';
const SUPABASE_KIEM_KHO_TABLE = process.env.SUPABASE_KIEM_KHO_TABLE || 'kiem_kho';
const SUPABASE_KIEM_KHO_TONG_HOP_TABLE =
  process.env.SUPABASE_KIEM_KHO_TONG_HOP_TABLE || 'kiem_kho_tong_hop';
const SUPABASE_KIEM_KHO_CHENH_LECH_TABLE =
  process.env.SUPABASE_KIEM_KHO_CHENH_LECH_TABLE || 'kiem_kho_chenh_lech_xu_ly';
const SUPABASE_QUAN_LY_KHO_TABLE = process.env.SUPABASE_QUAN_LY_KHO_TABLE || 'quan_ly_kho';
const SUPABASE_DAMAGED_GOODS_TABLE = process.env.SUPABASE_DAMAGED_GOODS_TABLE || 'bao_cao_hang_hong';
const SUPABASE_PRODUCTS_TABLE = process.env.SUPABASE_PRODUCTS_TABLE || 'san_pham';
const SUPABASE_IMPORT_SP_TABLE = process.env.SUPABASE_IMPORT_SP_TABLE || 'import_sp';
const SUPABASE_PRODUCT_CODES_TABLE = process.env.SUPABASE_PRODUCT_CODES_TABLE || 'ma_san_pham_chi_tiet';
/** Sửa typo env phổ biến: anh_sach_may → danh_sach_may */
const SUPABASE_MACHINES_TABLE = (() => {
  const raw = String(process.env.SUPABASE_MACHINES_TABLE || '')
    .trim()
    .replace(/^["']|["']$/g, '');
  if (!raw) return 'danh_sach_may';
  if (raw === 'anh_sach_may') {
    console.warn(
      '[SUPABASE] SUPABASE_MACHINES_TABLE=anh_sach_may (thiếu chữ d) — tự dùng danh_sach_may. Hãy sửa env trên Vercel.'
    );
    return 'danh_sach_may';
  }
  return raw;
})();
const SUPABASE_MATERIALS_TABLE = process.env.SUPABASE_MATERIALS_TABLE || 'kho_nvl';
const SUPABASE_STAFF_TABLE = process.env.SUPABASE_STAFF_TABLE || 'nhan_su';
const SUPABASE_VEHICLES_TABLE = process.env.SUPABASE_VEHICLES_TABLE || 'danh_sach_xe';
const SUPABASE_DRIVER_RECONCILIATION_TABLE =
  process.env.SUPABASE_DRIVER_RECONCILIATION_TABLE || 'doi_chieu_lai_xe';
const SUPABASE_VEHICLE_EXPENSES_TABLE = process.env.SUPABASE_VEHICLE_EXPENSES_TABLE || 'chi_phi_xe';
const SUPABASE_VEHICLE_LOGS_TABLE = process.env.SUPABASE_VEHICLE_LOGS_TABLE || 'nhat_ky_xe';
const SUPABASE_VEHICLE_DELIVERY_REQUESTS_TABLE =
  process.env.SUPABASE_VEHICLE_DELIVERY_REQUESTS_TABLE || 'yeu_cau_xuat_hang_xe';
const SUPABASE_VEHICLE_DELIVERY_ROUTES_TABLE =
  process.env.SUPABASE_VEHICLE_DELIVERY_ROUTES_TABLE || 'tuyen_giao_hang_xe';
const SUPABASE_VEHICLE_KM_LOGS_TABLE = process.env.SUPABASE_VEHICLE_KM_LOGS_TABLE || 'nhat_ky_km_xe';
const SUPABASE_CUSTOMER_PAYMENTS_TABLE =
  process.env.SUPABASE_CUSTOMER_PAYMENTS_TABLE || 'thu_tien_khach_hang';
const SUPABASE_ORDERS_TABLE = process.env.SUPABASE_ORDERS_TABLE || 'don_hang';
const SUPABASE_CUSTOMERS_TABLE = process.env.SUPABASE_CUSTOMERS_TABLE || 'khach_hang';
const SUPABASE_SHIPPING_ORDERS_TABLE = process.env.SUPABASE_SHIPPING_ORDERS_TABLE || 'lenh_xuat_hang';
const SUPABASE_SETTINGS_TABLE = process.env.SUPABASE_SETTINGS_TABLE || 'cai_dat_thoi_gian';
const SUPABASE_PRODUCTION_ORDERS_TABLE = process.env.SUPABASE_PRODUCTION_ORDERS_TABLE || 'lenh_sx';
const SUPABASE_PRODUCTION_PLANS_TABLE = process.env.SUPABASE_PRODUCTION_PLANS_TABLE || 'ke_hoach_san_xuat';
const SUPABASE_PRODUCTION_PLAN_LINES_TABLE =
  process.env.SUPABASE_PRODUCTION_PLAN_LINES_TABLE || 'ke_hoach_san_xuat_dong';
const SUPABASE_WAREHOUSE_MOVEMENTS_TABLE = process.env.SUPABASE_WAREHOUSE_MOVEMENTS_TABLE || 'phieu_xuat_nhap_kho';
const SUPABASE_MIXING_REPORTS_TABLE = process.env.SUPABASE_MIXING_REPORTS_TABLE || 'bao_cao_phoi_tron';
const SUPABASE_MIXING_NORM_TABLE =
  process.env.SUPABASE_MIXING_NORM_TABLE || 'bang_tron_vat_tu_dinh_muc';
const SUPABASE_ACTUAL_MIXING_SHEET_TABLE =
  process.env.SUPABASE_ACTUAL_MIXING_SHEET_TABLE || 'phieu_tron_thuc_te';
const SUPABASE_ACCEPTANCE_REPORTS_TABLE = process.env.SUPABASE_ACCEPTANCE_REPORTS_TABLE || 'bao_cao_nghiem_thu';
const SUPABASE_ACCEPTANCE_NVL_DINH_MUC_TABLE =
  process.env.SUPABASE_ACCEPTANCE_NVL_DINH_MUC_TABLE || 'bao_cao_san_luong_nvl_dinh_muc';
const SUPABASE_MACHINE_NVL_REPORTS_TABLE =
  process.env.SUPABASE_MACHINE_NVL_REPORTS_TABLE || 'bao_cao_may_nvl_ton';
const SUPABASE_MACHINE_DOWNTIME_TABLE =
  process.env.SUPABASE_MACHINE_DOWNTIME_TABLE || 'phieu_bao_dung_may';
const SUPABASE_SHIFT_HANDOVER_TABLE =
  process.env.SUPABASE_SHIFT_HANDOVER_TABLE || 'phieu_giao_ca';
const SUPABASE_BB_BAO_CAO_LY_DO_TABLE =
  process.env.SUPABASE_BB_BAO_CAO_LY_DO_TABLE || 'bb_bao_cao_ly_do';
const SUPABASE_BB_PHAN_TICH_DANH_GIA_TABLE =
  process.env.SUPABASE_BB_PHAN_TICH_DANH_GIA_TABLE || 'bb_phan_tich_danh_gia';
const SUPABASE_BB_BAO_CAO_TINH_TOAN_TABLE =
  process.env.SUPABASE_BB_BAO_CAO_TINH_TOAN_TABLE || 'bb_bao_cao_tinh_toan';
const SUPABASE_MACHINE_RUN_LOG_TABLE =
  process.env.SUPABASE_MACHINE_RUN_LOG_TABLE || 'nhat_ky_chay_may';
const SUPABASE_STAFF_DEPARTMENT = process.env.SUPABASE_STAFF_DEPARTMENT || 'Sản xuất';
const SUPABASE_STAFF_BRANCH = process.env.SUPABASE_STAFF_BRANCH || 'Đà Nẵng';
const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME?.trim();
const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY?.trim();
const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET?.trim();
const ADDRESS_ENGINE_URL = (process.env.ADDRESS_ENGINE_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '');
const VIETMAP_SERVICES_KEY = process.env.VIETMAP_SERVICES_KEY?.trim();
const VIETMAP_TILE_KEY = process.env.VIETMAP_TILE_KEY?.trim();
const VIETMAP_API_URL = 'https://maps.vietmap.vn/api';

const SUPABASE_FETCH_TIMEOUT_MS = 30_000;
const SUPABASE_FETCH_RETRIES = 3;
const ADDRESS_ENGINE_TIMEOUT_MS = 10_000;
const JWT_CLOCK_SKEW_PATTERN =
  /PGRST303|JWT issued at future|JWTExpired|token is expired|exp claim/i;
const execFileAsync = promisify(execFile);

let supabaseClockSkewMs: number | null = null;
let supabaseClockSyncAttempted = false;

function isJwtClockSkewError(error: { code?: string; message?: string } | null | undefined) {
  const message = String(error?.message || '');
  const code = String(error?.code || '');
  return code === 'PGRST303' || JWT_CLOCK_SKEW_PATTERN.test(message);
}

async function probeSupabaseClockSkewMs(baseUrl: string | undefined): Promise<number | null> {
  if (!baseUrl) return null;
  try {
    const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/rest/v1/`, {
      method: 'HEAD',
      headers: { apikey: SUPABASE_KEY || 'probe' }
    });
    const dateHeader = response.headers.get('date');
    if (!dateHeader) return null;
    const serverMs = Date.parse(dateHeader);
    if (!Number.isFinite(serverMs)) return null;
    return Date.now() - serverMs;
  } catch {
    return null;
  }
}

async function tryAutoSyncSystemClock(): Promise<boolean> {
  if (supabaseClockSyncAttempted) return false;
  supabaseClockSyncAttempted = true;

  if (process.platform === 'win32') {
    try {
      await execFileAsync('w32tm', ['/resync', '/force'], {
        timeout: 20_000,
        windowsHide: true
      });
      console.log('[CLOCK] Đã chạy w32tm /resync — đồng bộ thời gian Windows với NTP.');
      return true;
    } catch (error) {
      console.warn(
        '[CLOCK] Không thể tự đồng bộ giờ (w32tm). Chạy CMD Admin: w32tm /resync /force —',
        (error as Error).message
      );
      return false;
    }
  }

  if (process.platform === 'linux') {
    try {
      await execFileAsync('timedatectl', ['set-ntp', 'true'], { timeout: 10_000 });
      console.log('[CLOCK] Đã bật đồng bộ NTP (timedatectl).');
      return true;
    } catch {
      return false;
    }
  }

  return false;
}

async function ensureSupabaseClockAligned() {
  if (!SUPABASE_URL) return;
  const skewMs = await probeSupabaseClockSkewMs(SUPABASE_URL);
  if (skewMs === null) return;
  supabaseClockSkewMs = skewMs;
  const absSkewSec = Math.round(Math.abs(skewMs) / 1000);
  if (absSkewSec < 5) return;

  console.warn(
    `[CLOCK] Đồng hồ máy lệch ~${absSkewSec}s so với Supabase (${skewMs > 0 ? 'nhanh hơn' : 'chậm hơn'}). Đang thử tự đồng bộ...`
  );
  await tryAutoSyncSystemClock();
  const skewAfter = await probeSupabaseClockSkewMs(SUPABASE_URL);
  if (skewAfter !== null) supabaseClockSkewMs = skewAfter;
  if (skewAfter !== null && Math.abs(skewAfter) >= 5000) {
    console.warn(
      `[CLOCK] Vẫn lệch ~${Math.round(Math.abs(skewAfter) / 1000)}s — bật «Đặt thời gian tự động» trên Windows rồi khởi động lại npm run dev.`
    );
  }
}

function formatSupabaseAuthClockHint(error: { code?: string; message?: string }) {
  if (!isJwtClockSkewError(error)) return '';
  const autoSyncNote = supabaseClockSyncAttempted
    ? ' Đã thử tự đồng bộ giờ (w32tm) nhưng vẫn lỗi —'
    : '';
  return (
    `${autoSyncNote} Đồng hồ máy tính lệch so với server (JWT). Vào Windows: Cài đặt → Thời gian & ngôn ngữ → bật «Đặt thời gian tự động»,` +
    ' bấm «Đồng bộ ngay», rồi khởi động lại npm run dev.'
  );
}

async function waitForJwtClockRecovery(body: string) {
  const synced = await tryAutoSyncSystemClock();
  if (supabaseClockSkewMs === null && SUPABASE_URL) {
    supabaseClockSkewMs = await probeSupabaseClockSkewMs(SUPABASE_URL);
  }
  const skewMs = Math.abs(supabaseClockSkewMs ?? 0);
  if (/JWT issued at future/i.test(body)) {
    return synced ? 800 : Math.min(Math.max(skewMs + 500, 1500), 120_000);
  }
  return synced ? 800 : Math.min(Math.max(skewMs + 500, 2000), 30_000);
}

function isSupabaseNetworkError(error: unknown) {
  const message = String((error as { message?: string })?.message ?? error ?? '').toLowerCase();
  return (
    message.includes('fetch failed') ||
    message.includes('network') ||
    message.includes('econnreset') ||
    message.includes('enotfound') ||
    message.includes('etimedout') ||
    message.includes('timeout') ||
    message.includes('abort')
  );
}

async function fetchWithTimeoutAndRetry(
  input: RequestInfo | URL,
  init?: RequestInit,
  attempt = 1,
  clockRecoveryAttempt = 0
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SUPABASE_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(input, { ...init, signal: init?.signal ?? controller.signal });

    if (clockRecoveryAttempt < 2 && (response.status === 401 || response.status === 403)) {
      const body = await response.clone().text();
      if (JWT_CLOCK_SKEW_PATTERN.test(body)) {
        const waitMs = await waitForJwtClockRecovery(body);
        console.warn(`[SUPABASE] JWT lệch giờ — thử lại sau ${waitMs}ms (${clockRecoveryAttempt + 1}/2)...`);
        await new Promise(resolve => setTimeout(resolve, waitMs));
        return fetchWithTimeoutAndRetry(input, init, 1, clockRecoveryAttempt + 1);
      }
    }

    return response;
  } catch (error) {
    if (attempt < SUPABASE_FETCH_RETRIES && isSupabaseNetworkError(error)) {
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      return fetchWithTimeoutAndRetry(input, init, attempt + 1, clockRecoveryAttempt);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

const supabase = SUPABASE_URL && SUPABASE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_KEY, {
      global: { fetch: fetchWithTimeoutAndRetry }
    })
  : null;
/** Client riêng — chỉ dùng cho API phiếu cân `/api/phieu-can-dinh-ki`. */
const supabaseWeighing =
  SUPABASE_WEIGHING_URL && SUPABASE_WEIGHING_KEY
    ? createClient(SUPABASE_WEIGHING_URL, SUPABASE_WEIGHING_KEY, {
        global: { fetch: fetchWithTimeoutAndRetry }
      })
    : null;
const supabaseKiemKho =
  SUPABASE_KIEM_KHO_URL && SUPABASE_KIEM_KHO_KEY
    ? createClient(SUPABASE_KIEM_KHO_URL, SUPABASE_KIEM_KHO_KEY, {
        global: { fetch: fetchWithTimeoutAndRetry }
      })
    : null;
const useSupabase = Boolean(supabase);
const usingServiceKey = Boolean(process.env.SUPABASE_SERVICE_KEY);
const usingWeighingServiceKey = Boolean(SUPABASE_WEIGHING_SERVICE_KEY);
const usingKiemKhoServiceKey = Boolean(SUPABASE_KIEM_KHO_SERVICE_KEY);
if (useSupabase) {
  console.log(`[SUPABASE:${SUPABASE_MAIN_DB_LABEL}] Connected to`, SUPABASE_URL, 'tables', {
    reports: SUPABASE_TABLE,
    weighingFallbackTable: SUPABASE_WEIGHING_TABLE,
    damagedGoods: SUPABASE_DAMAGED_GOODS_TABLE,
      products: SUPABASE_PRODUCTS_TABLE,
      importSp: SUPABASE_IMPORT_SP_TABLE,
      machines: SUPABASE_MACHINES_TABLE,
    materials: SUPABASE_MATERIALS_TABLE,
    staff: SUPABASE_STAFF_TABLE,
    orders: SUPABASE_ORDERS_TABLE,
    customers: SUPABASE_CUSTOMERS_TABLE,
    shippingOrders: SUPABASE_SHIPPING_ORDERS_TABLE,
    settings: SUPABASE_SETTINGS_TABLE,
    productionOrders: SUPABASE_PRODUCTION_ORDERS_TABLE,
    productionPlans: SUPABASE_PRODUCTION_PLANS_TABLE,
    productionPlanLines: SUPABASE_PRODUCTION_PLAN_LINES_TABLE,
    warehouseMovements: SUPABASE_WAREHOUSE_MOVEMENTS_TABLE,
    mixingReports: SUPABASE_MIXING_REPORTS_TABLE,
    mixingNormMaterials: SUPABASE_MIXING_NORM_TABLE,
    acceptanceReports: SUPABASE_ACCEPTANCE_REPORTS_TABLE,
    acceptanceNvlDinhMuc: SUPABASE_ACCEPTANCE_NVL_DINH_MUC_TABLE,
    machineNvlReports: SUPABASE_MACHINE_NVL_REPORTS_TABLE,
    machineDowntime: SUPABASE_MACHINE_DOWNTIME_TABLE,
    key: usingServiceKey ? 'service_role' : 'anon/public'
  });
} else {
  console.log(`[SUPABASE:${SUPABASE_MAIN_DB_LABEL}] Not configured; using local JSON fallback.`);
}
if (supabaseWeighing) {
  console.log(`[SUPABASE:${SUPABASE_WEIGHING_DB_LABEL}] Connected to`, SUPABASE_WEIGHING_URL, {
    weighing: SUPABASE_WEIGHING_TABLE,
    canTuDong: SUPABASE_CAN_TU_DONG_TABLE,
    kiemKho: SUPABASE_KIEM_KHO_TABLE,
    quanLyKho: SUPABASE_QUAN_LY_KHO_TABLE,
    key: usingWeighingServiceKey ? 'service_role' : 'anon/publishable'
  });
} else {
  console.log(
    `[SUPABASE:${SUPABASE_WEIGHING_DB_LABEL}] Chưa cấu hình riêng — bảng can_tu_dong chưa gắn DB cân tự động.`
  );
}
if (supabaseKiemKho) {
  console.log(`[SUPABASE:${SUPABASE_KIEM_KHO_DB_LABEL}] Connected to`, SUPABASE_KIEM_KHO_URL, {
    kiemKho: SUPABASE_KIEM_KHO_TABLE,
    kiemKhoTongHop: SUPABASE_KIEM_KHO_TONG_HOP_TABLE,
    key: usingKiemKhoServiceKey ? 'service_role' : 'anon/publishable'
  });
}

async function resolveCanTuDongImageUrl(
  db: SupabaseClient,
  row: Record<string, unknown>,
  options?: {
    urlKey?: 'image_url' | 'core_image_url' | 'qr_image_url' | 'product_image_url';
    pathKey?: 'image_path' | 'core_image_path' | 'qr_image_path' | 'product_image_path';
    publicIdKey?: 'image_public_id' | 'core_image_public_id' | 'qr_image_public_id' | 'product_image_public_id';
  }
): Promise<string> {
  const urlKey = options?.urlKey || 'image_url';
  const pathKey = options?.pathKey || 'image_path';
  const publicIdKey = options?.publicIdKey;
  const direct = String(row[urlKey] ?? '').trim();
  if (direct) return direct;

  // Ưu tiên path, rồi public_id (gateway thường ghi public_id Cloudinary).
  let storagePath = String(row[pathKey] ?? (publicIdKey ? row[publicIdKey] : '') ?? '')
    .trim()
    .replace(/^\/+/, '');
  if (!storagePath) return '';
  if (storagePath.startsWith(`${SUPABASE_CAN_TU_DONG_STORAGE_BUCKET}/`)) {
    storagePath = storagePath.slice(SUPABASE_CAN_TU_DONG_STORAGE_BUCKET.length + 1);
  }

  try {
    const { data, error } = await db.storage
      .from(SUPABASE_CAN_TU_DONG_STORAGE_BUCKET)
      .createSignedUrl(storagePath, 60 * 60);
    if (error || !data?.signedUrl) return '';
    return data.signedUrl;
  } catch {
    return '';
  }
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const normalized = value.trim().replace(',', '.');
    if (!normalized) return null;
    const num = Number(normalized);
    return Number.isFinite(num) ? num : null;
  }
  return null;
}

/**
 * Ý nghĩa cột DB cân tự động:
 * - tare_weight  = cân lõi
 * - weight       = cân sản phẩm (còn lõi)
 * - net_weight   = khối lượng thực (= weight - tare_weight; cột generated trên DB)
 * - core_image_* = ảnh bước cân lõi
 * - product_image_* = ảnh bước cân sản phẩm
 */
function resolveCanTuDongNetWeight(row: Record<string, unknown>): number | null {
  const net = asFiniteNumber(row.net_weight);
  if (net != null) return net;
  const weight = asFiniteNumber(row.weight);
  const tare = asFiniteNumber(row.tare_weight);
  if (weight == null || tare == null) return null;
  return Math.round((weight - tare) * 1000) / 1000;
}

function pickCanTuDongText(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (value === null || value === undefined) continue;
    const text = String(value).trim();
    if (text && text !== '-') return text;
  }
  return '';
}

/** Đổi phần mã SP trong QR, giữ serial / phần sau `+` nếu có. */
function replaceCanTuDongQrProductCode(raw: string | null | undefined, newProductCode: string): string {
  const next = String(newProductCode || '').trim();
  if (!next) return String(raw || '').trim();
  const trimmed = String(raw || '').trim();
  if (!trimmed) return next;
  const plusIdx = trimmed.indexOf('+');
  if (plusIdx > 0) return `${next}${trimmed.slice(plusIdx)}`;
  const serialMatch = trimmed.match(/^(.+?)([_-]\d{6}[0-9A-Za-z]{2,})$/);
  if (serialMatch?.[2]) return `${next}${serialMatch[2]}`;
  return next;
}

/** Chuỗi ngày → YYYY-MM-DD. Hiểu dd/mm/yyyy, không dùng captured_at. */
function parseCanTuDongNgayToIso(value: unknown): string | null {
  const text = String(value ?? '').trim();
  if (!text || text === '-') return null;
  const iso = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const dmy = text.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})/);
  if (!dmy) return null;
  return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
}

function asCanTuDongMetadata(metadata: unknown): Record<string, unknown> | null {
  if (!metadata) return null;
  if (typeof metadata === 'string') {
    try {
      const parsed = JSON.parse(metadata);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
    return null;
  }
  if (typeof metadata === 'object' && !Array.isArray(metadata)) {
    return metadata as Record<string, unknown>;
  }
  return null;
}

/** Cột Ngày (SOURCE_DATE / work_date) — không phải ngày cân captured_at. */
function resolveCanTuDongNgayColumn(row: Record<string, unknown>): string | null {
  const fromRow = parseCanTuDongNgayToIso(row.ngay ?? row.work_date ?? row.SOURCE_DATE);
  if (fromRow) return fromRow;

  const meta = asCanTuDongMetadata(row.metadata);
  if (meta) {
    for (const key of ['SOURCE_DATE', 'source_date', 'work_date', 'ngay', 'date']) {
      const parsed = parseCanTuDongNgayToIso(meta[key]);
      if (parsed) return parsed;
    }
    for (const value of Object.values(meta)) {
      if (typeof value !== 'string' || !value.trim()) continue;
      const match = value.match(
        /SOURCE_DATE\s*=\s*(\d{4}-\d{2}-\d{2}|\d{1,2}[/.\-]\d{1,2}[/.\-]\d{4})/i
      );
      if (match?.[1]) {
        const fromRaw = parseCanTuDongNgayToIso(match[1]);
        if (fromRaw) return fromRaw;
      }
    }
  }
  return null;
}

/** Trích ca từ metadata (SOURCE_SHIFT ưu tiên) rồi cột bảng. */
function resolveCanTuDongCaFromRecord(row: Record<string, unknown>): string | null {
  const meta = asCanTuDongMetadata(row.metadata);
  if (meta) {
    // Ưu tiên SOURCE_SHIFT / shift đã tự động điền — trước cột ca cũ trên row
    const fromSourceKey = pickCanTuDongText(meta, ['SOURCE_SHIFT', 'source_shift']);
    if (fromSourceKey) return fromSourceKey;

    for (const value of Object.values(meta)) {
      if (typeof value !== 'string' || !value.trim()) continue;
      const match = value.match(/SOURCE_SHIFT\s*=\s*([^\s;|,]+)/i);
      if (match?.[1]) return match[1].trim();
    }

    const fromShift = pickCanTuDongText(meta, ['shift', 'ca', 'shift_name', 'ca_san_xuat']);
    if (fromShift) return fromShift;
  }

  const direct = pickCanTuDongText(row, ['ca', 'shift', 'shift_name', 'ca_san_xuat', 'shiftName']);
  if (direct) return direct;
  return null;
}

/** Trích lệnh SX từ metadata (SOURCE_PRODUCTION_ORDER=LSX100) hoặc QR `MãSP+LSX…`. */
function resolveCanTuDongProductionOrder(row: Record<string, unknown>): string | null {
  const direct = pickCanTuDongText(row, [
    'lenh_sx',
    'ma_lenh_sx',
    'production_order',
    'productionOrder'
  ]);
  if (direct) return direct;

  const metadata = row.metadata;
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    const meta = metadata as Record<string, unknown>;
    const fromMeta = pickCanTuDongText(meta, [
      'production_order',
      'SOURCE_PRODUCTION_ORDER',
      'source_production_order',
      'ma_lenh_sx',
      'lenh_sx'
    ]);
    if (fromMeta) return fromMeta;

    for (const value of Object.values(meta)) {
      if (typeof value !== 'string' || !value.trim()) continue;
      const match = value.match(/SOURCE_PRODUCTION_ORDER\s*=\s*([^\s;|,]+)/i);
      if (match?.[1]) return match[1].trim();
    }
  }

  const qr = pickCanTuDongText(row, ['qr_code']);
  const plusIdx = qr.indexOf('+');
  if (plusIdx > 0) {
    const after = qr.slice(plusIdx + 1).trim();
    if (after) return after;
  }
  return null;
}

/** Trích máy từ metadata (SOURCE_MACHINE=…) hoặc cột may/machine. */
function resolveCanTuDongMachine(row: Record<string, unknown>): string | null {
  const direct = pickCanTuDongText(row, ['may', 'machine', 'ten_may', 'ma_may', 'machine_name']);
  if (direct) return direct;

  const metadata = row.metadata;
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    const meta = metadata as Record<string, unknown>;
    const fromMeta = pickCanTuDongText(meta, [
      'machine',
      'SOURCE_MACHINE',
      'source_machine',
      'may',
      'ten_may',
      'ma_may',
      'machine_name'
    ]);
    if (fromMeta) return fromMeta;

    for (const value of Object.values(meta)) {
      if (typeof value !== 'string' || !value.trim()) continue;
      const match = value.match(/SOURCE_MACHINE\s*=\s*([^;|,]+)/i);
      if (match?.[1]) return match[1].trim();
    }
  }
  return null;
}

/** Ghi/đè token KEY=value trong chuỗi weight_raw. */
function upsertCanTuDongWeightRawToken(raw: string, key: string, value: string): string {
  const token = `${key}=${value}`;
  const re = new RegExp(`${key}\\s*=\\s*[^;|,]*`, 'i');
  const text = String(raw || '');
  if (re.test(text)) return text.replace(re, token).replace(/;{2,}/g, ';').trim();
  const trimmed = text.trim();
  return trimmed ? `${trimmed}; ${token}` : token;
}

/** Gộp Ngày + Lệnh SX + Máy vào metadata cân tự động. */
function mergeCanTuDongNgayLenhSxMetadata(
  currentMetadata: Record<string, unknown>,
  opts: { ngay?: string | null; lenhSx?: string | null; ca?: string | null; may?: string | null }
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...currentMetadata };
  const ngay = String(opts.ngay ?? '').trim();
  const lenhSx = String(opts.lenhSx ?? '').trim();
  const ca = String(opts.ca ?? '').trim();
  const may = String(opts.may ?? '').trim();

  if (ngay) {
    next.work_date = ngay;
    next.SOURCE_DATE = ngay;
    next.source_date = ngay;
  }
  if (lenhSx) {
    next.production_order = lenhSx;
    next.SOURCE_PRODUCTION_ORDER = lenhSx;
    next.source_production_order = lenhSx;
  }
  if (ca) {
    next.ca = ca;
    next.SOURCE_SHIFT = ca;
    next.source_shift = ca;
    next.shift = ca;
    next.ca_san_xuat = ca;
  }
  if (may) {
    next.machine = may;
    next.SOURCE_MACHINE = may;
    next.source_machine = may;
    next.may = may;
  }

  const rawExisting =
    typeof next.weight_raw === 'string'
      ? next.weight_raw
      : typeof currentMetadata.weight_raw === 'string'
        ? currentMetadata.weight_raw
        : '';
  let weightRaw = rawExisting;
  if (ngay) weightRaw = upsertCanTuDongWeightRawToken(weightRaw, 'SOURCE_DATE', ngay);
  if (lenhSx) weightRaw = upsertCanTuDongWeightRawToken(weightRaw, 'SOURCE_PRODUCTION_ORDER', lenhSx);
  if (ca) weightRaw = upsertCanTuDongWeightRawToken(weightRaw, 'SOURCE_SHIFT', ca);
  if (may) weightRaw = upsertCanTuDongWeightRawToken(weightRaw, 'SOURCE_MACHINE', may);
  if (weightRaw) next.weight_raw = weightRaw;

  return next;
}

function parseClockMinutes(value: string): number | null {
  const match = String(value || '')
    .trim()
    .match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

function isClockMinutesInRange(mins: number, start: number, end: number): boolean {
  if (start === end) return true;
  if (start < end) return mins >= start && mins < end;
  // Ca qua đêm (vd 20:00 → 08:00)
  return mins >= start || mins < end;
}

/** Phút trong ngày theo giờ VN (UTC+7) từ ISO captured_at. */
function vietnamClockMinutesFromIso(iso: string): number | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return (date.getUTCHours() * 60 + date.getUTCMinutes() + 7 * 60) % (24 * 60);
}

type CanTuDongShiftWindow = { name: string; startTime: string; endTime: string };

function resolveCanTuDongCaFromCapturedAt(
  capturedAt: string,
  windows: CanTuDongShiftWindow[]
): string | null {
  const mins = vietnamClockMinutesFromIso(capturedAt);
  if (mins === null || windows.length === 0) return null;
  for (const window of windows) {
    const start = parseClockMinutes(window.startTime);
    const end = parseClockMinutes(window.endTime);
    if (start === null || end === null) continue;
    if (isClockMinutesInRange(mins, start, end)) return window.name;
  }
  return null;
}

async function loadCanTuDongShiftWindows(): Promise<CanTuDongShiftWindow[]> {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase.from(SUPABASE_SETTINGS_TABLE).select('*');
    if (error || !Array.isArray(data)) return [];
    const windows: CanTuDongShiftWindow[] = [];
    for (const item of data) {
      if (!item || typeof item !== 'object') continue;
      const record = item as Record<string, unknown>;
      const loai = String(record.loai_cai_dat ?? record.loai ?? '').trim();
      if (loai && loai !== 'Thời gian') continue;
      const name = String(record.ten_cai_dat ?? record.hang_muc ?? record.ma_cai_dat ?? record.ma ?? '')
        .trim();
      const startRaw = record.gio_bat_dau ?? record.thoi_gian_bat_dau ?? record.start_time ?? record.gio_bd;
      const endRaw = record.gio_ket_thuc ?? record.thoi_gian_ket_thuc ?? record.end_time ?? record.gio_kt;
      const startMatch = String(startRaw ?? '').match(/(\d{1,2}):(\d{2})/);
      const endMatch = String(endRaw ?? '').match(/(\d{1,2}):(\d{2})/);
      if (!name || !startMatch || !endMatch) continue;
      windows.push({
        name,
        startTime: `${String(startMatch[1]).padStart(2, '0')}:${startMatch[2]}`,
        endTime: `${String(endMatch[1]).padStart(2, '0')}:${endMatch[2]}`
      });
    }
    return windows;
  } catch {
    return [];
  }
}

function resolveCanTuDongCa(
  row: Record<string, unknown>,
  windows: CanTuDongShiftWindow[]
): string | null {
  const fromRecord = resolveCanTuDongCaFromRecord(row);
  if (fromRecord) return fromRecord;
  const capturedAt = String(row.captured_at ?? row.created_at ?? '').trim();
  if (!capturedAt) return null;
  return resolveCanTuDongCaFromCapturedAt(capturedAt, windows);
}

function getSeedReports(): ProductionReport[] {
  return [
    {
      id: 'rep_seed_1',
      date: '2026-06-20',
      shiftInfo: {
        machineId: 'MÁY SX-01 (Đùn PE)',
        shiftName: 'Ca 12C1 (08:00 - 20:00)',
        operatorName: 'Nguyễn Văn Hùng',
        assistantName: 'Trần Minh Tâm'
      },
      productEntry: {
        productCode: 'PE-LD100',
        rolls: 12,
        actualWeight: 295.5
      },
      materials: {
        virginPlastic: [100, 100],
        recycledPlastic: [50, 50],
        brightenerPowder: [1.5],
        dispersionOil: [0.5],
        otherAdditives: [0.3]
      },
      wasteWeight: 3.2,
      notes: 'Vận hành ổn định, màng PE bóng dẻo đạt chuẩn. Hao hụt cắt biên mỏng.',
      createdAt: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString()
    },
    {
      id: 'rep_seed_2',
      date: '2026-06-21',
      shiftInfo: {
        machineId: 'MÁY SX-02 (Đùn PE)',
        shiftName: 'Ca 12C2 (20:00 - 08:00)',
        operatorName: 'Lê Hoàng Hải',
        assistantName: 'Phan Thanh Bình'
      },
      productEntry: {
        productCode: 'PE-HD200',
        rolls: 8,
        actualWeight: 402.0
      },
      materials: {
        virginPlastic: [150, 150],
        recycledPlastic: [55, 50],
        brightenerPowder: [2.0],
        dispersionOil: [0.8],
        otherAdditives: [0.5]
      },
      wasteWeight: 2.5,
      notes: 'Chạy cuộn PE-HD200 dày dặn, tỷ lệ trộn nhựa tái sinh tăng nhẹ nhưng màng dai đạt chuẩn.',
      createdAt: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString()
    },
    {
      id: 'rep_seed_3',
      date: '2026-06-22',
      shiftInfo: {
        machineId: 'MÁY SX-03 (Dệt PP)',
        shiftName: 'Ca 12C1 (08:00 - 20:00)',
        operatorName: 'Nguyễn Văn Hùng',
        assistantName: 'Trần Minh Tâm'
      },
      productEntry: {
        productCode: 'PP-Y101',
        rolls: 10,
        actualWeight: 388.0
      },
      materials: {
        virginPlastic: [180, 170],
        recycledPlastic: [25, 25],
        brightenerPowder: [3.0],
        dispersionOil: [1.0],
        otherAdditives: [1.2]
      },
      wasteWeight: 10.5,
      notes: 'Một số cuộn lỗi phế phẩm đầu mẩu do nhiệt độ đầu đùn chưa đều nửa đầu ca, đã căn chỉnh lại.',
      createdAt: new Date(Date.now() - 1 * 24 * 3600 * 1000).toISOString()
    }
  ];
}

async function getReportsFromDb(): Promise<ProductionReport[]> {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from(SUPABASE_TABLE)
        .select('*')
        .order('createdAt', { ascending: false });

      if (error) {
        if (isMissingTableError(error)) {
          console.warn(`[SUPABASE] Bảng ${SUPABASE_TABLE} chưa tồn tại — dùng file local. Chạy supabase-reports.sql.`);
        } else {
          console.error('Lỗi khi truy vấn Supabase:', error);
        }
      } else if (data) {
        return data as ProductionReport[];
      }
    } catch (error) {
      console.error('Lỗi khi truy vấn Supabase:', error);
    }
  }

  return getReportsFromLocalFile();
}

async function saveReportsToDb(reports: ProductionReport[]): Promise<boolean> {
  try {
    fs.writeFileSync(DB_FILE_PATH, JSON.stringify(reports, null, 2), 'utf-8');
    return true;
  } catch (error) {
    console.error('Lỗi khi lưu file CSDL:', error);
    return false;
  }
}

function normalizeWeighTime(value: string | null | undefined) {
  if (!value) return null;
  const cleaned = value.replace(/\s/g, '').replace(/\./g, ':');
  const match = cleaned.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  return `${match[1].padStart(2, '0')}:${match[2]}`;
}

function emptyToNull(value: unknown) {
  const text = String(value ?? '').trim();
  return text || null;
}

function parseOptionalInt(value: unknown) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

function buildDbRecordFromClientRow(row: Record<string, unknown>, payload?: Record<string, unknown>) {
  const weighNo = emptyToNull(row.weighNo);
  const weighTime = normalizeWeighTime(String(row.weighTime ?? ''));

  return {
    document_no: emptyToNull(payload?.documentNo || row.documentNo),
    report_date: payload?.reportDate || row.reportDate || new Date().toISOString().split('T')[0],
    ngay_san_xuat:
      row.productionDate ||
      payload?.productionDate ||
      payload?.reportDate ||
      new Date().toISOString().split('T')[0],
    ca_san_xuat: emptyToNull(row.shiftName || payload?.shiftName),
    ten_cn_1: emptyToNull(row.worker1 || payload?.worker1),
    ten_cn_2: emptyToNull(row.worker2 || payload?.worker2),
    ten_nguoi_can: emptyToNull(row.weigherName || payload?.weigherName),
    ma_san_pham: emptyToNull(row.productCode),
    ten_san_pham: emptyToNull(row.productName),
    trong_luong_loi: emptyToNull(row.coreWeight),
    anh_trong_luong_loi_url: emptyToNull(row.coreWeightImageUrl),
    anh_trong_luong_loi_public_id: emptyToNull(row.coreWeightImagePublicId),
    trong_luong_bi: emptyToNull(row.shellWeight),
    ten_may_san_xuat: emptyToNull(row.machineName),
    lan_can: parseOptionalInt(weighNo),
    gio_can: weighTime || normalizeWeighTime(new Date().toTimeString().slice(0, 5)),
    trong_luong: emptyToNull(row.weight),
    trong_luong_nhua_khong_mang: emptyToNull(row.plasticNoFilmWeight),
    trong_luong_nhua_dau_nong: emptyToNull(row.plasticNozzleWeight),
    trong_luong_nhua_dinh_mang: emptyToNull(row.plasticFilmAdhesionWeight),
    loai_hang_hong: emptyToNull(row.materialType),
    ma_vat_tu: emptyToNull(row.materialCode),
    so_luong_vat_tu: emptyToNull(row.materialQuantity),
    don_vi_vat_tu: emptyToNull(row.materialUnit),
    anh_url: emptyToNull(row.imageUrl),
    anh_public_id: emptyToNull(row.imagePublicId),
    nghiem_thu: emptyToNull(row.acceptanceStatus),
    ghi_chu: emptyToNull(row.note)
  };
}

function mapWeighingRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    documentNo: String(row.document_no ?? '').trim(),
    reportDate: String(row.report_date ?? '').trim(),
    productionDate: String(row.ngay_san_xuat ?? '').trim(),
    shiftName: String(row.ca_san_xuat ?? '').trim(),
    worker1: String(row.ten_cn_1 ?? '').trim(),
    worker2: String(row.ten_cn_2 ?? '').trim(),
    weigherName: String(row.ten_nguoi_can ?? row.weigherName ?? '').trim(),
    productCode: String(row.ma_san_pham ?? '').trim(),
    productName: String(row.ten_san_pham ?? '').trim(),
    machineName: String(row.ten_may_san_xuat ?? '').trim(),
    weighNo: String(row.lan_can ?? '').trim(),
    weighTime: String(row.gio_can ?? '').trim(),
    coreWeight: String(row.trong_luong_loi ?? '').trim(),
    shellWeight: String(row.trong_luong_bi ?? '').trim(),
    weight: String(row.trong_luong ?? '').trim(),
    plasticNoFilmWeight: String(row.trong_luong_nhua_khong_mang ?? '').trim(),
    plasticNozzleWeight: String(row.trong_luong_nhua_dau_nong ?? '').trim(),
    plasticFilmAdhesionWeight: String(row.trong_luong_nhua_dinh_mang ?? '').trim(),
    materialType: String(row.loai_hang_hong ?? '').trim(),
    materialCode: String(row.ma_vat_tu ?? '').trim(),
    materialQuantity: String(row.so_luong_vat_tu ?? '').trim(),
    materialUnit: String(row.don_vi_vat_tu ?? '').trim(),
    imageUrl: String(row.anh_url ?? '').trim() || undefined,
    coreWeightImageUrl: String(row.anh_trong_luong_loi_url ?? '').trim() || undefined,
    acceptanceStatus: String(row.nghiem_thu ?? '').trim(),
    note: String(row.ghi_chu ?? '').trim(),
    createdAt: String(row.created_at ?? '').trim() || undefined
  };
}

type WeighingSlipApiConfig = {
  localFilePath: string;
  supabaseTable: string;
  sqlMigrationFile: string;
  entityLabel: string;
  localEntryPrefix: string;
  requireAcceptanceStatus?: boolean;
  requireDamagedMaterialType?: boolean;
  /** Client Supabase riêng (vd. DB phiếu cân). Mặc định = DB chính. */
  client?: SupabaseClient | null;
  dbLabel?: string;
};

function createWeighingLocalStore(cfg: Pick<WeighingSlipApiConfig, 'localFilePath' | 'localEntryPrefix'>) {
  const { localFilePath, localEntryPrefix } = cfg;

  const readLocalEntries = () => {
    try {
      if (!fs.existsSync(localFilePath)) return [];
      const saved = JSON.parse(fs.readFileSync(localFilePath, 'utf-8'));
      return Array.isArray(saved) ? saved : [];
    } catch (error) {
      console.error('Lỗi khi đọc phiếu local:', error);
      return [];
    }
  };

  const writeLocalEntries = (entries: any[]) => {
    fs.writeFileSync(localFilePath, JSON.stringify(entries, null, 2), 'utf-8');
  };

  const getReportsFromLocal = (): ReturnType<typeof mapWeighingRow>[] => {
    try {
      if (!fs.existsSync(localFilePath)) return [];

      const saved = JSON.parse(fs.readFileSync(localFilePath, 'utf-8'));
      if (!Array.isArray(saved)) return [];

      return saved.flatMap((entry: any) => {
        const rows = Array.isArray(entry?.rows) ? entry.rows : [];
        return rows.map((row: Record<string, unknown>) =>
          mapWeighingRow({
            ...row,
            document_no: row.document_no ?? entry.documentNo ?? entry.document_no,
            report_date: row.report_date ?? entry.reportDate ?? entry.report_date,
            ngay_san_xuat: row.ngay_san_xuat ?? row.productionDate ?? entry.productionDate ?? entry.ngay_san_xuat,
            ca_san_xuat: row.ca_san_xuat ?? row.shiftName ?? entry.shiftName ?? entry.ca_san_xuat,
            ten_cn_1: row.ten_cn_1 ?? row.worker1 ?? entry.worker1 ?? entry.ten_cn_1,
            ten_cn_2: row.ten_cn_2 ?? row.worker2 ?? entry.worker2 ?? entry.ten_cn_2,
            ten_nguoi_can: row.ten_nguoi_can ?? row.weigherName ?? entry.weigherName ?? entry.ten_nguoi_can,
            created_at: row.created_at ?? entry.created_at
          })
        );
      });
    } catch (error) {
      console.error('Lỗi khi đọc phiếu local:', error);
      return [];
    }
  };

  const saveReportToLocal = async (report: any): Promise<boolean> => {
    try {
      const current = fs.existsSync(localFilePath)
        ? JSON.parse(fs.readFileSync(localFilePath, 'utf-8'))
        : [];
      current.unshift(report);
      fs.writeFileSync(localFilePath, JSON.stringify(current, null, 2), 'utf-8');
      return true;
    } catch (error) {
      console.error('Lỗi khi lưu phiếu local:', error);
      return false;
    }
  };

  const findLocalRow = (id: string) => {
    const entries = readLocalEntries();

    for (const entry of entries) {
      const rows = Array.isArray(entry?.rows) ? entry.rows : [];
      const index = rows.findIndex(
        (row: Record<string, unknown>) => String(row.id) === id || String(row.dbId) === id
      );
      if (index >= 0) {
        return { entries, entry, rows, index };
      }
    }

    return null;
  };

  const updateRecordLocal = (id: string, record: Record<string, unknown>) => {
    const found = findLocalRow(id);
    if (!found) return false;

    const dbFields = {
      document_no: record.document_no,
      report_date: record.report_date,
      ngay_san_xuat: record.ngay_san_xuat,
      ca_san_xuat: record.ca_san_xuat,
      ten_cn_1: record.ten_cn_1,
      ten_cn_2: record.ten_cn_2,
      ten_nguoi_can: record.ten_nguoi_can,
      ma_san_pham: record.ma_san_pham,
      ten_san_pham: record.ten_san_pham,
      trong_luong_loi: record.trong_luong_loi,
      anh_trong_luong_loi_url: record.anh_trong_luong_loi_url,
      anh_trong_luong_loi_public_id: record.anh_trong_luong_loi_public_id,
      trong_luong_bi: record.trong_luong_bi,
      ten_may_san_xuat: record.ten_may_san_xuat,
      lan_can: record.lan_can,
      gio_can: record.gio_can,
      trong_luong: record.trong_luong,
      anh_url: record.anh_url,
      anh_public_id: record.anh_public_id,
      nghiem_thu: record.nghiem_thu,
      ghi_chu: record.ghi_chu
    };

    found.rows[found.index] = {
      ...found.rows[found.index],
      ...dbFields,
      productionDate: record.ngay_san_xuat,
      shiftName: record.ca_san_xuat,
      worker1: record.ten_cn_1,
      worker2: record.ten_cn_2,
      weigherName: record.ten_nguoi_can,
      productCode: record.ma_san_pham,
      productName: record.ten_san_pham,
      coreWeight: record.trong_luong_loi,
      coreWeightImageUrl: record.anh_trong_luong_loi_url,
      coreWeightImagePublicId: record.anh_trong_luong_loi_public_id,
      shellWeight: record.trong_luong_bi,
      machineName: record.ten_may_san_xuat,
      weighNo: record.lan_can,
      weighTime: record.gio_can,
      weight: record.trong_luong,
      imageUrl: record.anh_url,
      imagePublicId: record.anh_public_id,
      acceptanceStatus: record.nghiem_thu,
      note: record.ghi_chu
    };

    writeLocalEntries(found.entries);
    return mapWeighingRow({ ...found.rows[found.index], id });
  };

  const deleteRecordLocal = (id: string) => {
    const found = findLocalRow(id);
    if (!found) return false;

    found.rows.splice(found.index, 1);
    if (found.rows.length === 0) {
      const entryIndex = found.entries.indexOf(found.entry);
      if (entryIndex >= 0) {
        found.entries.splice(entryIndex, 1);
      }
    }

    writeLocalEntries(found.entries);
    return true;
  };

  const remapShiftLocal = (fromShift: string, toShift: string) => {
    const from = String(fromShift || '').trim();
    const to = String(toShift || '').trim();
    if (!from || !to || from === to) return 0;

    const entries = readLocalEntries();
    let updated = 0;
    let changed = false;

    for (const entry of entries) {
      const entryShift = String(entry?.shiftName ?? entry?.ca_san_xuat ?? '').trim();
      if (entryShift === from) {
        entry.shiftName = to;
        entry.ca_san_xuat = to;
        changed = true;
      }

      const rows = Array.isArray(entry?.rows) ? entry.rows : [];
      for (const row of rows) {
        const rowShift = String(row?.ca_san_xuat ?? row?.shiftName ?? entryShift).trim();
        if (rowShift === from) {
          row.ca_san_xuat = to;
          row.shiftName = to;
          updated += 1;
          changed = true;
        }
      }
    }

    if (changed) {
      writeLocalEntries(entries);
    }

    return updated;
  };

  const savePayloadLocally = async (payload: any, rows: any[]) => {
    const stamp = Date.now();
    const rowsWithIds = rows.map((row, index) => ({
      ...row,
      dbId: row.dbId || `local_${stamp}_${index}`,
      id: row.dbId || `local_${stamp}_${index}`
    }));

    const success = await saveReportToLocal({
      id: `${localEntryPrefix}${stamp}_${Math.random().toString(36).substring(2, 7)}`,
      ...payload,
      rows: rowsWithIds,
      created_at: new Date().toISOString()
    });

    if (!success) {
      return { ok: false as const };
    }

    return {
      ok: true as const,
      rows: rowsWithIds.map(row => mapWeighingRow(row as Record<string, unknown>))
    };
  };

  return {
    getReportsFromLocal,
    saveReportToLocal,
    findLocalRow,
    updateRecordLocal,
    deleteRecordLocal,
    remapShiftLocal,
    savePayloadLocally
  };
}

async function insertWeighingRecordsToTable(
  supabaseTable: string,
  records: Record<string, unknown>[],
  client: SupabaseClient | null = supabase
) {
  if (!client) {
    return { ok: false as const, error: { message: 'Supabase chưa được cấu hình.' } };
  }

  let lastError: { message?: string; code?: string } | null = null;

  for (let attempt = 1; attempt <= SUPABASE_FETCH_RETRIES; attempt++) {
    const { data, error } = await client.from(supabaseTable).insert(records).select('*');
    if (!error) {
      return { ok: true as const, data: data || [] };
    }

    lastError = error;
    if (!isSupabaseNetworkError(error) || attempt === SUPABASE_FETCH_RETRIES) {
      break;
    }

    console.warn(`Supabase insert retry ${attempt}/${SUPABASE_FETCH_RETRIES}:`, error.message);
    await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
  }

  return { ok: false as const, error: lastError };
}

function registerWeighingSlipRoutes(app: express.Application, apiPath: string, cfg: WeighingSlipApiConfig) {
  const store = createWeighingLocalStore(cfg);
  const db = cfg.client ?? supabase;
  const dbLabel = cfg.dbLabel || SUPABASE_MAIN_DB_LABEL;

  app.get(apiPath, async (req, res) => {
    try {
      const ngay = typeof req.query.ngay === 'string' ? req.query.ngay.trim() : '';
      const from = typeof req.query.from === 'string' ? req.query.from.trim() : parseWarehouseSlipDate(req.query.tu_ngay);
      const to = typeof req.query.to === 'string' ? req.query.to.trim() : parseWarehouseSlipDate(req.query.den_ngay);

      if (db) {
        let query = db
          .from(cfg.supabaseTable)
          .select('*')
          .order('created_at', { ascending: false, nullsFirst: false })
          .order('id', { ascending: false });

        if (ngay) {
          query = query.or(`ngay_san_xuat.eq.${ngay},report_date.eq.${ngay}`);
        } else if (from && to) {
          query = query.or(
            `and(ngay_san_xuat.gte.${from},ngay_san_xuat.lte.${to}),and(report_date.gte.${from},report_date.lte.${to})`
          );
        } else if (from) {
          query = query.or(`ngay_san_xuat.gte.${from},report_date.gte.${from}`);
        } else if (to) {
          query = query.or(`ngay_san_xuat.lte.${to},report_date.lte.${to}`);
        }

        const { data, error } = await query;
        if (error) {
          console.error(`Supabase[${dbLabel}] ${cfg.entityLabel} query error:`, error);
          return res.status(500).json({
            error: `Không thể tải ${cfg.entityLabel} từ ${cfg.supabaseTable} (${dbLabel}). ${error.message}`
          });
        }

        return res.json((data || []).map((row) => mapWeighingRow(row as Record<string, unknown>)));
      }

      let records = store.getReportsFromLocal();
      if (ngay) {
        records = records.filter(
          record => record.productionDate === ngay || record.reportDate === ngay
        );
      } else {
        if (from) {
          records = records.filter(record => {
            const d = record.productionDate || record.reportDate;
            return d && d >= from;
          });
        }
        if (to) {
          records = records.filter(record => {
            const d = record.productionDate || record.reportDate;
            return d && d <= to;
          });
        }
      }

      return res.json(
        [...records].sort((left, right) =>
          String(right.createdAt ?? '').localeCompare(String(left.createdAt ?? ''))
        )
      );
    } catch (err: any) {
      return res.status(500).json({ error: err.message || `Lỗi khi tải ${cfg.entityLabel}.` });
    }
  });

  app.post(apiPath, async (req, res) => {
    try {
      const payload = req.body;
      const rows = Array.isArray(payload?.rows) ? payload.rows : [];

      if (rows.length === 0) {
        return res.status(400).json({ error: 'Vui lòng nhập ít nhất một dòng cân.' });
      }

      const records = rows
        .filter((row: any) =>
          row.productCode || row.productName || row.machineName || row.coreWeight || row.shellWeight || row.weighNo || row.weight || row.imageUrl || row.coreWeightImageUrl || row.acceptanceStatus || row.materialType || row.materialCode || row.materialQuantity || row.note
        )
        .map((row: any) => buildDbRecordFromClientRow(row, payload));
      if (!cfg.requireDamagedMaterialType) {
        records.forEach(record => {
          delete record.loai_hang_hong;
          delete record.ma_vat_tu;
          delete record.so_luong_vat_tu;
        });
      }

      if (records.length === 0) {
        return res.status(400).json({ error: 'Vui lòng nhập ít nhất một dòng cân có dữ liệu.' });
      }

      const missingShift = records.find(record => !record.ngay_san_xuat || !record.ca_san_xuat);
      if (missingShift) {
        return res.status(400).json({ error: 'Mỗi dòng cần có ngày sản xuất và ca sản xuất.' });
      }

      if (cfg.requireAcceptanceStatus && records.some(record => !String(record.nghiem_thu ?? '').trim())) {
        return res.status(400).json({ error: 'Mỗi dòng cân cần có kết quả Nghiệm thu.' });
      }

      if (cfg.requireDamagedMaterialType && records.some(record => !String(record.loai_hang_hong ?? '').trim())) {
        return res.status(400).json({ error: 'Mỗi dòng cần chọn loại hàng hỏng: Nhựa hoặc Vật tư khác.' });
      }
      const invalidOtherMaterial = records.some(record =>
        record.loai_hang_hong === 'vat_tu_khac' &&
        (!String(record.ma_vat_tu ?? '').trim() || !String(record.so_luong_vat_tu ?? '').trim())
      );
      if (cfg.requireDamagedMaterialType && invalidOtherMaterial) {
        return res.status(400).json({ error: 'Vật tư khác cần có Mã vật tư và Số lượng.' });
      }

      if (db) {
        const insertResult = await insertWeighingRecordsToTable(cfg.supabaseTable, records, db);

        if (!insertResult.ok) {
          const error = insertResult.error;
          console.error(`Supabase[${dbLabel}] ${cfg.entityLabel} insert error:`, error);

          if (isSupabaseNetworkError(error)) {
            const savedLocally = await store.savePayloadLocally(payload, rows);
            if (savedLocally.ok) {
              return res.status(201).json({
                success: true,
                inserted: records.length,
                mode: 'local',
                rows: savedLocally.rows,
                warning:
                  'Mất kết nối Supabase tạm thời. Đã lưu tạm vào file local — dữ liệu sẽ cần đồng bộ lại khi mạng ổn định.'
              });
            }
          }

          const missingColumn = error?.code === 'PGRST204';
          const rlsBlocked = error?.code === '42501';
          return res.status(500).json({
            error: missingColumn
              ? `Bảng ${cfg.supabaseTable} đang thiếu cột. Hãy chạy file ${cfg.sqlMigrationFile} trong Supabase SQL Editor.`
              : rlsBlocked
                ? `Supabase đang chặn ghi do RLS trên bảng ${cfg.supabaseTable}. Hãy dùng SUPABASE_SERVICE_KEY ở backend hoặc thêm policy INSERT cho role anon/authenticated.`
                : isSupabaseNetworkError(error)
                  ? `Không kết nối được Supabase (lỗi mạng). Kiểm tra internet, firewall và thử lại. Chi tiết: ${error?.message || 'fetch failed'}`
                  : `Không thể ghi ${cfg.entityLabel} vào bảng ${cfg.supabaseTable}. ${error?.message || ''}`.trim()
          });
        }

        return res.status(201).json({
          success: true,
          inserted: records.length,
          mode: 'supabase',
          db: dbLabel,
          rows: (insertResult.data || []).map((row) => mapWeighingRow(row as Record<string, unknown>))
        });
      }

      const savedLocally = await store.savePayloadLocally(payload, rows);
      if (savedLocally.ok) {
        return res.status(201).json({
          success: true,
          inserted: records.length,
          mode: 'local',
          rows: savedLocally.rows
        });
      }

      return res.status(500).json({ error: `Không thể lưu ${cfg.entityLabel} local.` });
    } catch (err: any) {
      res.status(500).json({ error: err.message || `Lỗi hệ thống khi lưu ${cfg.entityLabel}.` });
    }
  });

  app.post(`${apiPath}/remap-shift`, async (req, res) => {
    try {
      const fromShift = String(req.body?.from ?? req.body?.fromShift ?? 'HC1').trim();
      const toShift = String(req.body?.to ?? req.body?.toShift ?? '12C1').trim();

      if (!fromShift || !toShift) {
        return res.status(400).json({ error: 'Thiếu ca nguồn hoặc ca đích.' });
      }
      if (fromShift === toShift) {
        return res.status(400).json({ error: 'Ca nguồn và ca đích phải khác nhau.' });
      }

      let supabaseUpdated = 0;
      if (db) {
        const { data, error } = await db
          .from(cfg.supabaseTable)
          .update({ ca_san_xuat: toShift })
          .eq('ca_san_xuat', fromShift)
          .select('id');

        if (error) {
          console.error(`Supabase[${dbLabel}] ${cfg.entityLabel} remap-shift error:`, error);
          const rlsBlocked = error.code === '42501';
          return res.status(500).json({
            error: rlsBlocked
              ? `Supabase chặn cập nhật do RLS. Chạy ${cfg.sqlMigrationFile} hoặc dùng SUPABASE_SERVICE_KEY.`
              : `Không thể đổi ca ${fromShift} → ${toShift}. ${error.message}`
          });
        }

        supabaseUpdated = Array.isArray(data) ? data.length : 0;
      }

      const localUpdated = store.remapShiftLocal(fromShift, toShift);
      const updated = db ? supabaseUpdated : localUpdated;

      return res.json({
        success: true,
        from: fromShift,
        to: toShift,
        updated,
        supabaseUpdated,
        localUpdated,
        mode: db ? 'supabase' : 'local',
        db: dbLabel
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi đổi ca hàng loạt.' });
    }
  });

  app.patch(`${apiPath}/:id`, async (req, res) => {
    try {
      const id = String(req.params.id || '').trim();
      if (!id) {
        return res.status(400).json({ error: 'Thiếu ID dòng cân.' });
      }

      const row = req.body?.row;
      if (!row || typeof row !== 'object') {
        return res.status(400).json({ error: 'Thiếu dữ liệu dòng cân.' });
      }

      const payload = req.body;
      const record = buildDbRecordFromClientRow(row, payload);
      if (!cfg.requireDamagedMaterialType) {
        delete record.loai_hang_hong;
        delete record.ma_vat_tu;
        delete record.so_luong_vat_tu;
      }

      if (!record.ngay_san_xuat || !record.ca_san_xuat) {
        return res.status(400).json({ error: 'Mỗi dòng cần có ngày sản xuất và ca sản xuất.' });
      }

      if (cfg.requireAcceptanceStatus && !String(record.nghiem_thu ?? '').trim()) {
        return res.status(400).json({ error: 'Dòng cân cần có kết quả Nghiệm thu.' });
      }

      if (cfg.requireDamagedMaterialType && !String(record.loai_hang_hong ?? '').trim()) {
        return res.status(400).json({ error: 'Dòng cần chọn loại hàng hỏng: Nhựa hoặc Vật tư khác.' });
      }
      if (
        cfg.requireDamagedMaterialType &&
        record.loai_hang_hong === 'vat_tu_khac' &&
        (!String(record.ma_vat_tu ?? '').trim() || !String(record.so_luong_vat_tu ?? '').trim())
      ) {
        return res.status(400).json({ error: 'Vật tư khác cần có Mã vật tư và Số lượng.' });
      }

      if (isLocalWeighingId(id)) {
        const updated = store.updateRecordLocal(id, record);
        if (!updated) {
          return res.status(404).json({ error: 'Không tìm thấy dòng cân trong file local.' });
        }

        return res.json({ success: true, row: updated, mode: 'local' });
      }

      if (db) {
        const dbId = parseWeighingId(id);
        const { data, error } = await db
          .from(cfg.supabaseTable)
          .update(record)
          .eq('id', dbId)
          .select('*')
          .maybeSingle();

        if (error) {
          console.error(`Supabase[${dbLabel}] ${cfg.entityLabel} update error:`, error);
          const rlsBlocked = error.code === '42501';
          return res.status(500).json({
            error: rlsBlocked
              ? `Supabase chặn cập nhật do RLS. Chạy ${cfg.sqlMigrationFile} hoặc dùng SUPABASE_SERVICE_KEY.`
              : `Không thể cập nhật dòng cân. ${error.message}`
          });
        }

        if (data) {
          return res.json({
            success: true,
            row: mapWeighingRow(data as Record<string, unknown>),
            mode: 'supabase',
            db: dbLabel
          });
        }

        const updatedLocally = store.updateRecordLocal(id, record);
        if (updatedLocally) {
          return res.json({ success: true, row: updatedLocally, mode: 'local' });
        }

        return res.status(404).json({ error: 'Không tìm thấy dòng cân.' });
      }

      const updated = store.updateRecordLocal(id, record);
      if (!updated) {
        return res.status(404).json({ error: 'Không tìm thấy dòng cân trong file local.' });
      }

      return res.json({ success: true, row: updated, mode: 'local' });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi cập nhật dòng cân.' });
    }
  });

  app.delete(`${apiPath}/:id`, async (req, res) => {
    try {
      const id = String(req.params.id || '').trim();
      if (!id) {
        return res.status(400).json({ error: 'Thiếu ID dòng cân.' });
      }

      if (isLocalWeighingId(id)) {
        const deleted = store.deleteRecordLocal(id);
        if (!deleted) {
          return res.status(404).json({ error: 'Không tìm thấy dòng cân trong file local.' });
        }

        return res.json({ success: true, mode: 'local' });
      }

      if (db) {
        const dbId = parseWeighingId(id);
        const { data, error } = await db
          .from(cfg.supabaseTable)
          .delete()
          .eq('id', dbId)
          .select('id')
          .maybeSingle();

        if (error) {
          console.error(`Supabase[${dbLabel}] ${cfg.entityLabel} delete error:`, error);
          const rlsBlocked = error.code === '42501';
          return res.status(500).json({
            error: rlsBlocked
              ? `Supabase chặn xóa do RLS. Chạy ${cfg.sqlMigrationFile} hoặc dùng SUPABASE_SERVICE_KEY.`
              : `Không thể xóa dòng cân. ${error.message}`
          });
        }

        if (data) {
          return res.json({ success: true, mode: 'supabase', db: dbLabel });
        }

        const deletedLocally = store.deleteRecordLocal(id);
        if (deletedLocally) {
          return res.json({ success: true, mode: 'local' });
        }

        return res.status(404).json({ error: 'Không tìm thấy dòng cân.' });
      }

      const deleted = store.deleteRecordLocal(id);
      if (!deleted) {
        return res.status(404).json({ error: 'Không tìm thấy dòng cân trong file local.' });
      }

      return res.json({ success: true, mode: 'local' });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi xóa dòng cân.' });
    }
  });
}

function parseWeighingId(id: string): string | number {
  return /^\d+$/.test(id) ? Number(id) : id;
}

function isLocalWeighingId(id: string) {
  return id.startsWith('local_');
}

async function uploadImageToCloudinary(imageDataUrl: string, folder = 'phieu_can_dinh_ki') {
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    throw new Error('Cloudinary chưa được cấu hình.');
  }

  const timestamp = Math.round(Date.now() / 1000).toString();
  const safeFolder = folder.trim() || 'phieu_can_dinh_ki';
  const signaturePayload = `folder=${safeFolder}&timestamp=${timestamp}${CLOUDINARY_API_SECRET}`;
  const signature = crypto.createHash('sha1').update(signaturePayload).digest('hex');
  const params = new FormData();
  params.append('file', imageDataUrl);
  params.append('api_key', CLOUDINARY_API_KEY);
  params.append('timestamp', timestamp);
  params.append('folder', safeFolder);
  params.append('signature', signature);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, {
    method: 'POST',
    body: params
  });

  const data = await response.json();
  if (!response.ok) {
    if (data?.error?.message?.toLowerCase().includes('invalid signature')) {
      throw new Error('Cloudinary từ chối chữ ký upload. Vui lòng kiểm tra lại CLOUDINARY_API_SECRET trong .env.');
    }
    throw new Error(data?.error?.message || 'Không thể upload ảnh lên Cloudinary.');
  }

  return {
    url: data.secure_url,
    publicId: data.public_id
  };
}

function pickStaffName(row: Record<string, unknown>) {
  const direct = String(
    row.nhan_su ?? row.ho_ten ?? row.ten_nv ?? row.ten ?? row.ho_va_ten ?? row.ten_nhan_vien ?? ''
  ).trim();
  if (direct) return direct;

  const nameKey = Object.keys(row).find(
    key =>
      (key === 'nhan_su' || /ten/i.test(key)) &&
      !/phong|ban|chi|nhanh|ma_|dang_nhap|mat_khau|password|login/i.test(key) &&
      typeof row[key] === 'string'
  );
  return nameKey ? String(row[nameKey]).trim() : '';
}

function pickStaffField(row: Record<string, unknown>, keys: string[], fallback = '') {
  for (const key of keys) {
    const value = row[key];
    if (value !== null && value !== undefined && String(value).trim()) {
      return String(value).trim();
    }
  }

  return fallback;
}

function mapStaffRecord(row: Record<string, unknown>) {
  const name = pickStaffName(row);
  const department = pickStaffField(row, ['phong_ban', 'phongban', 'department'], 'Chưa phân phòng ban');
  const branch = pickStaffField(row, ['chi_nhanh', 'chi_nhanh_lam_viec', 'branch', 'co_so'], 'Chưa phân chi nhánh');
  const role = pickStaffField(row, ['Cong_Viec', 'cong_viec', 'chuc_vu', 'role'], 'Nhân sự');
  const position = pickStaffField(row, ['vi_tri', 'ma_vi_tri'], '');
  const shift = pickStaffField(row, ['ca_lam', 'ca', 'shift'], 'Theo phân công');
  const status = pickStaffField(row, ['trang_thai', 'status'], 'Đang làm');
  const code = pickStaffField(row, ['ma_nhan_su', 'ma_nv', 'id'], name);
  const username = pickStaffField(row, ['ten_dang_nhap', 'username', 'login'], '');
  const password = pickStaffField(row, ['mat_khau', 'password'], '');
  const signatureUrl = pickStaffField(row, ['link_chu_ky', 'chu_ky_url', 'signature_url'], '');
  const createdAt = pickStaffField(row, ['created_at', 'createdAt'], '');

  return {
    id: code || name,
    code,
    name,
    branch,
    department,
    role,
    position,
    shift,
    status,
    username,
    password,
    signatureUrl,
    createdAt,
    link_chu_ky: signatureUrl,
    viewPermissions: normalizeStaffViewPermissions(row.quyen_xem ?? row.viewPermissions),
    quyen_xem: normalizeStaffViewPermissions(row.quyen_xem ?? row.viewPermissions),
    assignedPositions: normalizeAssignablePositions(row.vi_tri_gan ?? row.assignedPositions),
    vi_tri_gan: normalizeAssignablePositions(row.vi_tri_gan ?? row.assignedPositions)
  };
}

function buildStaffGroups(rows: Record<string, unknown>[]) {
  const staff = rows
    .map(mapStaffRecord)
    .filter(person => person.name)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const branchMap = new Map<string, {
    id: string;
    name: string;
    shortName: string;
    departments: Array<{
      id: string;
      name: string;
      lead: string;
      members: typeof staff;
    }>;
  }>();

  for (const person of staff) {
    const branchId = person.branch.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'branch';
    let branch = branchMap.get(person.branch);
    if (!branch) {
      branch = {
        id: branchId,
        name: person.branch,
        shortName: person.branch.replace(/^Chi nhánh\s+/i, ''),
        departments: []
      };
      branchMap.set(person.branch, branch);
    }

    let department = branch.departments.find(item => item.name === person.department);
    if (!department) {
      department = {
        id: `${branchId}-${person.department.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'department'}`,
        name: person.department,
        lead: '',
        members: []
      };
      branch.departments.push(department);
    }

    department.members.push(person);
  }

  for (const branch of branchMap.values()) {
    for (const department of branch.departments) {
      const lead =
        department.members.find(person =>
          /trưởng|quan ly|quản lý|giam doc|giám đốc|leader/i.test(`${person.role} ${person.position}`)
        ) || department.members[0];
      department.lead = lead?.name || 'Chưa phân công';
    }
  }

  return Array.from(branchMap.values());
}

function staffWriteErrorMessage(error: { code?: string; message?: string }) {
  if (isMissingTableError(error)) {
    return `Bảng ${SUPABASE_STAFF_TABLE} chưa tồn tại. Hãy chạy file supabase-nhan-su.sql trong Supabase SQL Editor.`;
  }
  if (isMissingColumnError(error)) {
    return `Bảng ${SUPABASE_STAFF_TABLE} đang thiếu cột. Hãy chạy file supabase-nhan-su.sql.`;
  }
  return `Không thể lưu nhân sự vào ${SUPABASE_STAFF_TABLE}. ${error.message}`;
}

function parseStaffQuyenXem(source: Record<string, unknown>) {
  return normalizeStaffViewPermissions(source.quyen_xem ?? source.viewPermissions);
}

/** Vị trí = Phòng ban + Chức vụ, mọi dấu cách → `_`. VD: Phòng_Kinh_Doanh_Giám_đốc */
function buildStaffViTriLabel(department: string, jobTitle: string) {
  const normalize = (value: string) =>
    String(value || '')
      .trim()
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
  const dept = normalize(department);
  const job = normalize(jobTitle);
  if (!dept && !job) return '';
  if (!dept) return job;
  if (!job) return dept;
  return `${dept}_${job}`;
}

function parseStaffBody(body: unknown): { error: string } | { record: Record<string, unknown> } {
  if (!body || typeof body !== 'object') {
    return { error: 'Dữ liệu không hợp lệ.' };
  }

  const source = body as Record<string, unknown>;
  const name = pickRowField(source, ['nhan_su', 'name', 'ho_ten', 'ten_nhan_vien'], '');
  if (!name) {
    return { error: 'Vui lòng nhập tên nhân sự.' };
  }

  const department = pickRowField(source, ['phong_ban', 'department'], '');
  if (!department) {
    return { error: 'Vui lòng chọn phòng ban.' };
  }

  const branch = pickRowField(source, ['chi_nhanh', 'branch', 'chi_nhanh_lam_viec'], SUPABASE_STAFF_BRANCH);
  const code = pickRowField(source, ['ma_nhan_su', 'ma_nv', 'code'], '');
  const congViec = pickRowField(source, ['cong_viec', 'Cong_Viec', 'chuc_vu', 'role'], 'Nhân sự');
  // Vị trí = Phòng ban_Chức vụ (dấu cách → _)
  const explicitViTri = pickRowField(source, ['vi_tri', 'position', 'ma_vi_tri'], '');
  const viTri = explicitViTri || buildStaffViTriLabel(department, congViec);

  const record: Record<string, unknown> = {
    nhan_su: name,
    phong_ban: department,
    chi_nhanh: branch,
    cong_viec: congViec,
    vi_tri: viTri,
    ca_lam: pickRowField(source, ['ca_lam', 'ca', 'shift'], 'Theo phân công'),
    trang_thai: pickRowField(source, ['trang_thai', 'status'], 'Đang làm'),
    ma_nhan_su: code || null,
    ten_dang_nhap: pickRowField(source, ['ten_dang_nhap', 'username', 'login'], '') || null,
    link_chu_ky: pickRowField(source, ['link_chu_ky', 'chu_ky_url', 'signature_url'], '') || null
  };

  // Chỉ ghi mật khẩu khi client gửi rõ — tránh Excel/PUT vô tình xóa mật khẩu cũ
  if (
    Object.prototype.hasOwnProperty.call(source, 'mat_khau') ||
    Object.prototype.hasOwnProperty.call(source, 'password')
  ) {
    record.mat_khau = pickRowField(source, ['mat_khau', 'password'], '') || null;
  }

  // Chỉ ghi quyền xem khi client gửi rõ — tránh Excel ghi đè [] mất phân quyền menu
  if (
    Object.prototype.hasOwnProperty.call(source, 'quyen_xem') ||
    Object.prototype.hasOwnProperty.call(source, 'viewPermissions')
  ) {
    record.quyen_xem = parseStaffQuyenXem(source);
  }

  // Chỉ ghi vi_tri_gan khi client gửi rõ — tránh form nhân sự ghi đè [] mất dữ liệu gán quyền
  if (
    Object.prototype.hasOwnProperty.call(source, 'vi_tri_gan') ||
    Object.prototype.hasOwnProperty.call(source, 'assignedPositions')
  ) {
    record.vi_tri_gan = normalizeAssignablePositions(source.vi_tri_gan ?? source.assignedPositions);
  }

  return { record };
}

function vehicleWriteError(error: { code?: string; message?: string }, table: string) {
  if (isMissingTableError(error)) {
    return `Bảng ${table} chưa tồn tại. Hãy chạy file supabase-danh-sach-xe.sql trong Supabase SQL Editor.`;
  }
  if (isMissingColumnError(error)) {
    return `Bảng ${table} đang thiếu cột. Hãy chạy lại file supabase-danh-sach-xe.sql.`;
  }
  if (error.code === '23505') {
    return 'Biển số xe đã tồn tại trong danh sách.';
  }
  return `Không thể lưu dữ liệu vào ${table}. ${error.message || ''}`.trim();
}

function customerWriteError(error: { code?: string; message?: string }, table: string) {
  if (isMissingTableError(error)) {
    return `Bảng ${table} chưa tồn tại. Hãy chạy file supabase-khach-hang.sql trong Supabase SQL Editor.`;
  }
  if (isMissingColumnError(error)) {
    return `Bảng ${table} đang thiếu cột. Hãy chạy lại file supabase-khach-hang.sql. ${error.message || ''}`.trim();
  }
  if (error.code === '23505') {
    return 'Mã khách hàng đã tồn tại trong danh sách.';
  }
  return `Không thể lưu khách hàng vào ${table}. ${error.message || ''}`.trim();
}

function parseVehicleDocuments(value: unknown) {
  const source = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? (() => {
          try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : [];
          } catch {
            return [];
          }
        })()
      : [];

  return source
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    .slice(0, 50)
    .map((item, index) => {
      const rawImages = Array.isArray(item.anh)
        ? item.anh
        : Array.isArray(item.images)
          ? item.images
          : [];
      const images = rawImages
        .filter((image): image is Record<string, unknown> => Boolean(image && typeof image === 'object'))
        .slice(0, 20)
        .map(image => ({
          url: String(image.url ?? image.imageUrl ?? '').trim(),
          public_id: String(image.public_id ?? image.imagePublicId ?? '').trim()
        }))
        .filter(image => image.url);

      return {
        stt: index + 1,
        ten_giay_to: String(item.ten_giay_to ?? item.name ?? '').trim(),
        anh: images
      };
    })
    .filter(item => item.ten_giay_to || item.anh.length > 0);
}

function parseVehicleBody(body: unknown): { error: string } | { record: Record<string, unknown> } {
  const source = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const vehicleType = pickRowField(source, ['loai_xe', 'vehicleType'], '');
  const plateNumber = pickRowField(source, ['bien_so_xe', 'bsx', 'plateNumber'], '')
    .toUpperCase()
    .replace(/\s+/g, '');

  if (!vehicleType) return { error: 'Vui lòng nhập loại xe.' };
  if (!plateNumber) return { error: 'Vui lòng nhập biển số xe.' };

  return {
    record: {
      loai_xe: vehicleType,
      bien_so_xe: plateNumber,
      ma_tai_xe: pickRowField(source, ['ma_tai_xe', 'driverCode'], '') || null,
      tai_xe_phu_trach: pickRowField(source, ['tai_xe_phu_trach', 'driverName'], '') || null,
      giay_to: parseVehicleDocuments(source.giay_to ?? source.documents),
      ghi_chu: pickRowField(source, ['ghi_chu', 'notes'], '') || null,
      trang_thai: pickRowField(source, ['trang_thai', 'status'], 'Đang sử dụng')
    }
  };
}

function parseDriverReconciliationNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return 0;
  const normalized = typeof value === 'number'
    ? value
    : Number(String(value).trim().replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(normalized) ? Math.round(normalized * 100) / 100 : 0;
}

function parseDriverReconciliationBody(
  body: unknown
): { error: string } | { record: Record<string, unknown> } {
  const source = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const year = Math.trunc(Number(source.nam ?? source.year));
  const month = Math.trunc(Number(source.thang ?? source.month));
  const driverName = pickRowField(source, ['ten_tai_xe', 'ten_nv', 'driverName'], '');

  if (!Number.isFinite(year) || year < 2000 || year > 2100) {
    return { error: 'Năm đối chiếu không hợp lệ.' };
  }
  if (!Number.isFinite(month) || month < 1 || month > 12) {
    return { error: 'Tháng đối chiếu phải từ 1 đến 12.' };
  }
  if (!driverName) return { error: 'Vui lòng chọn tài xế.' };

  return {
    record: {
      nam: year,
      thang: month,
      ma_nhan_su: pickRowField(source, ['ma_nhan_su', 'ma_tai_xe', 'driverCode'], '') || null,
      ten_tai_xe: driverName,
      xe_id: source.xe_id === null || source.xe_id === undefined || source.xe_id === ''
        ? null
        : source.xe_id,
      loai_xe_di: pickRowField(source, ['loai_xe_di', 'vehicleType'], '') || null,
      bien_so_xe: pickRowField(source, ['bien_so_xe', 'bsx', 'plateNumber'], '') || null,
      tong_cong_quy_doi: parseDriverReconciliationNumber(source.tong_cong_quy_doi),
      so_chuyen_di: parseDriverReconciliationNumber(source.so_chuyen_di),
      tong_km_thuc_te: parseDriverReconciliationNumber(source.tong_km_thuc_te),
      tien_thuong_luat: parseDriverReconciliationNumber(source.tien_thuong_luat),
      tien_thuong_chuyen: parseDriverReconciliationNumber(source.tien_thuong_chuyen),
      thuong_doanh_so: parseDriverReconciliationNumber(source.thuong_doanh_so),
      doanh_so: parseDriverReconciliationNumber(source.doanh_so),
      ghi_chu: pickRowField(source, ['ghi_chu', 'notes'], '') || null
    }
  };
}

function parseVehicleExpenseBody(
  body: unknown
): { error: string } | { record: Record<string, unknown> } {
  const source = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const dateTime = pickRowField(source, ['ngay_gio', 'dateTime'], '');
  const expenseType = pickRowField(source, ['loai_chi_phi', 'expenseType'], 'CHI PHÍ XĂNG DẦU').toUpperCase();
  const expenseName = pickRowField(source, ['ten_chi_phi', 'expenseName'], '');
  const plateNumber = pickRowField(source, ['bien_so_xe', 'bsx', 'plateNumber'], '').toUpperCase();
  const quantity = parseDriverReconciliationNumber(source.so_luong ?? source.quantity ?? 1);
  const amount = parseDriverReconciliationNumber(source.so_tien ?? source.amount);

  if (!dateTime || Number.isNaN(Date.parse(dateTime))) return { error: 'Ngày giờ chi phí không hợp lệ.' };
  if (!['CHI PHÍ XĂNG DẦU', 'CÁC CHI PHÍ KHÁC CỦA XE'].includes(expenseType)) {
    return { error: 'Loại chi phí không hợp lệ.' };
  }
  if (!expenseName) return { error: 'Vui lòng nhập tên chi phí.' };
  if (!plateNumber) return { error: 'Vui lòng chọn biển số xe.' };
  if (quantity <= 0) return { error: 'Số lượng phải lớn hơn 0.' };
  if (amount < 0) return { error: 'Số tiền không được âm.' };

  return {
    record: {
      ngay_gio: dateTime,
      loai_chi_phi: expenseType,
      ten_chi_phi: expenseName,
      so_luong: quantity,
      so_tien: amount,
      xe_id: source.xe_id === null || source.xe_id === undefined || source.xe_id === '' ? null : source.xe_id,
      bien_so_xe: plateNumber,
      ma_nhan_su: pickRowField(source, ['ma_nhan_su', 'staffCode'], '') || null,
      nhan_vien_phu_trach: pickRowField(source, ['nhan_vien_phu_trach', 'staffName'], '') || null,
      hoa_don_url: pickRowField(source, ['hoa_don_url', 'invoiceUrl'], '') || null,
      hoa_don_public_id: pickRowField(source, ['hoa_don_public_id', 'invoicePublicId'], '') || null,
      ghi_chu: pickRowField(source, ['ghi_chu', 'notes'], '') || null
    }
  };
}

const CUSTOMER_PAYMENT_METHODS = ['Tiền mặt', 'Chuyển khoản'] as const;

function parseCustomerPaymentBody(
  body: unknown
): { error: string } | { record: Record<string, unknown> } {
  const source = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const dateTime = pickRowField(source, ['ngay_thu', 'dateTime'], '');
  const customerCode = pickRowField(source, ['ma_khach_hang', 'customerCode'], '');
  const customerName = pickRowField(source, ['ten_khach_hang', 'customerName'], '');
  const method = pickRowField(source, ['hinh_thuc', 'paymentMethod'], CUSTOMER_PAYMENT_METHODS[0]);
  const amount = parseDriverReconciliationNumber(source.so_tien ?? source.amount);

  if (!dateTime || Number.isNaN(Date.parse(dateTime))) return { error: 'Ngày thu tiền không hợp lệ.' };
  if (!customerName) return { error: 'Vui lòng chọn khách hàng.' };
  if (!(CUSTOMER_PAYMENT_METHODS as readonly string[]).includes(method)) {
    return { error: 'Hình thức thu tiền không hợp lệ.' };
  }
  if (amount <= 0) return { error: 'Số tiền thu phải lớn hơn 0.' };

  const rawImageUrl = pickRowField(source, ['anh_url', 'imageUrl', 'photoUrl'], '');
  const imageUrl = /^https?:\/\//i.test(rawImageUrl) ? rawImageUrl : '';

  return {
    record: {
      ngay_thu: dateTime,
      ma_khach_hang: customerCode || null,
      ten_khach_hang: customerName,
      so_tien: amount,
      hinh_thuc: method,
      xe_id: source.xe_id === null || source.xe_id === undefined || source.xe_id === '' ? null : source.xe_id,
      bien_so_xe: pickRowField(source, ['bien_so_xe', 'plateNumber'], '').toUpperCase() || null,
      ma_nhan_su: pickRowField(source, ['ma_nhan_su', 'staffCode'], '') || null,
      nguoi_thu: pickRowField(source, ['nguoi_thu', 'collectorName'], '') || null,
      ghi_chu: pickRowField(source, ['ghi_chu', 'notes'], '') || null,
      anh_url: imageUrl || null,
      anh_public_id: imageUrl ? pickRowField(source, ['anh_public_id', 'imagePublicId', 'photoPublicId'], '') || null : null
    }
  };
}

function customerPaymentWriteError(error: { code?: string; message?: string }, table: string) {
  if (isMissingTableError(error)) {
    return `Bảng ${table} chưa tồn tại. Hãy chạy file supabase-thu-tien-khach-hang.sql trong Supabase SQL Editor.`;
  }
  if (isMissingColumnError(error)) {
    return `Bảng ${table} đang thiếu cột. Hãy chạy lại file supabase-thu-tien-khach-hang.sql.`;
  }
  return `Không thể lưu phiếu thu tiền khách hàng vào ${table}. ${error.message || ''}`.trim();
}

function parseVehicleDeliveryRequestBody(
  body: unknown
): { error: string } | { record: Record<string, unknown> } {
  const source = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const requestNo = pickRowField(source, ['so_yeu_cau', 'requestNo'], '');
  const requestDate = pickRowField(source, ['ngay_yeu_cau', 'requestDate'], '');
  const address = pickRowField(source, ['dia_diem_giao', 'deliveryAddress'], '');
  const goods = pickRowField(source, ['hang_hoa', 'goods'], '');
  const quantity = parseDriverReconciliationNumber(source.so_luong ?? source.quantity);
  if (!requestNo) return { error: 'Vui lòng nhập số yêu cầu xuất hàng.' };
  if (!requestDate || Number.isNaN(Date.parse(requestDate))) return { error: 'Ngày yêu cầu không hợp lệ.' };
  if (!address) return { error: 'Vui lòng nhập địa điểm giao hàng.' };
  if (!goods) return { error: 'Vui lòng nhập hàng hóa.' };
  if (quantity <= 0) return { error: 'Số lượng phải lớn hơn 0.' };
  const routeOrderRaw = source.thu_tu_giao ?? source.deliveryOrder ?? source.routeOrder;
  const routeOrder = Number(routeOrderRaw);
  return {
    record: {
      so_yeu_cau: requestNo,
      ngay_yeu_cau: requestDate,
      dia_diem_giao: address,
      hang_hoa: goods,
      so_luong: quantity,
      don_vi: pickRowField(source, ['don_vi', 'unit'], '') || null,
      xe_id: source.xe_id === null || source.xe_id === undefined || source.xe_id === '' ? null : source.xe_id,
      bien_so_xe: pickRowField(source, ['bien_so_xe', 'plateNumber'], '').toUpperCase() || null,
      ma_nhan_su: pickRowField(source, ['ma_nhan_su', 'staffCode'], '') || null,
      ten_tai_xe: pickRowField(source, ['ten_tai_xe', 'driverName'], '') || null,
      trang_thai: pickRowField(source, ['trang_thai', 'status'], 'Chờ xuất hàng'),
      ghi_chu: pickRowField(source, ['ghi_chu', 'notes'], '') || null,
      ten_khach_hang: pickRowField(source, ['ten_khach_hang', 'customerName'], '') || null,
      thu_tu_giao: Number.isFinite(routeOrder) && routeOrder > 0 ? Math.round(routeOrder) : 0,
      vi_do: Number.isFinite(Number(source.vi_do)) ? Number(source.vi_do) : null,
      kinh_do: Number.isFinite(Number(source.kinh_do)) ? Number(source.kinh_do) : null,
      km_vietmap: Math.max(0, Number(source.km_vietmap) || 0),
      km_nhap_tay: source.km_nhap_tay === '' || source.km_nhap_tay === null || source.km_nhap_tay === undefined
        ? null
        : Math.max(0, Number(source.km_nhap_tay) || 0),
      km_chot: Math.max(0, Number(source.km_chot) || 0),
      km_luy_ke: Math.max(0, Number(source.km_luy_ke) || 0)
    }
  };
}

function parseShippingOrderBody(
  body: unknown
): { error: string } | { record: Record<string, unknown> } {
  const source = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const code = pickRowField(source, ['ma_lenh', 'code'], '');
  const shipDate = pickRowField(source, ['ngay_xuat', 'ship_date', 'shipDate'], '');
  const customerName = pickRowField(source, ['ten_khach_hang', 'customer_name', 'khach_hang'], '');
  const rawLines = Array.isArray(source.chi_tiet)
    ? source.chi_tiet
    : typeof source.chi_tiet === 'string'
      ? (() => {
          try {
            const parsed = JSON.parse(source.chi_tiet);
            return Array.isArray(parsed) ? parsed : [];
          } catch {
            return [];
          }
        })()
      : [];

  if (!code) return { error: 'Vui lòng nhập mã lệnh xuất hàng.' };
  if (!shipDate || Number.isNaN(Date.parse(shipDate))) return { error: 'Ngày xuất không hợp lệ.' };
  if (!customerName) return { error: 'Vui lòng chọn khách hàng.' };

  const lines = rawLines
    .filter((row): row is Record<string, unknown> => Boolean(row && typeof row === 'object'))
    .map(row => ({
      ma_sp: pickRowField(row, ['ma_sp', 'ma_san_pham', 'code'], ''),
      ten_sp: pickRowField(row, ['ten_sp', 'ten_san_pham', 'name'], ''),
      don_vi: pickRowField(row, ['don_vi', 'unit'], ''),
      so_luong: Math.max(0, parseDriverReconciliationNumber(row.so_luong ?? row.quantity)),
      don_gia: Math.max(0, parseDriverReconciliationNumber(row.don_gia ?? row.unit_price)),
      tong_tien: Math.max(
        0,
        parseDriverReconciliationNumber(
          row.tong_tien ?? row.total_amount ?? row.thanh_tien
        )
      )
    }))
    .map(row => ({
      ...row,
      tong_tien: row.tong_tien > 0 ? row.tong_tien : row.so_luong * row.don_gia
    }))
    .filter(row => row.ma_sp || row.ten_sp || row.so_luong > 0 || row.don_gia > 0);

  if (lines.length === 0) return { error: 'Vui lòng thêm ít nhất một dòng hàng xuất.' };
  for (const line of lines) {
    if (!line.ma_sp && !line.ten_sp) return { error: 'Mỗi dòng cần có mã SP hoặc tên SP.' };
    if (!(line.so_luong > 0)) return { error: `Số lượng phải lớn hơn 0 (${line.ma_sp || line.ten_sp}).` };
  }

  return {
    record: {
      ma_lenh: code,
      ngay_xuat: shipDate.slice(0, 10),
      ma_khach_hang: pickRowField(source, ['ma_khach_hang', 'customer_code'], '') || null,
      ten_khach_hang: customerName,
      dia_chi_giao: pickRowField(source, ['dia_chi_giao', 'dia_chi', 'address'], '') || null,
      so_dien_thoai: pickRowField(source, ['so_dien_thoai', 'dien_thoai', 'phone'], '') || null,
      nhan_vien: pickRowField(source, ['nhan_vien', 'staff'], '') || null,
      trang_thai: pickRowField(source, ['trang_thai', 'status'], 'Chờ xuất') || 'Chờ xuất',
      ghi_chu: pickRowField(source, ['ghi_chu', 'notes', 'note'], '') || null,
      chi_tiet: lines,
      updated_at: new Date().toISOString()
    }
  };
}

function parseVehicleLogBody(
  body: unknown
): { error: string } | { record: Record<string, unknown> } {
  const source = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const dateTime = pickRowField(source, ['ngay_gio', 'dateTime'], '');
  const plateNumber = pickRowField(source, ['bien_so_xe', 'bsx', 'plateNumber'], '').toUpperCase();

  if (!dateTime || Number.isNaN(Date.parse(dateTime))) return { error: 'Ngày giờ nhật ký không hợp lệ.' };
  if (!plateNumber) return { error: 'Vui lòng chọn biển số xe.' };

  const kmBefore = Math.max(0, parseDriverReconciliationNumber(source.chi_so_km_truoc));
  const kmAfter = Math.max(0, parseDriverReconciliationNumber(source.chi_so_km_ve));
  const kmActualRaw = parseDriverReconciliationNumber(source.so_km_thuc_te);
  const kmActual = Number.isFinite(kmActualRaw) && kmActualRaw > 0
    ? Math.max(0, kmActualRaw)
    : Math.max(0, kmAfter - kmBefore);

  const rawLines = Array.isArray(source.chi_tiet_mat_hang)
    ? source.chi_tiet_mat_hang
    : typeof source.chi_tiet_mat_hang === 'string'
      ? (() => {
          try {
            const parsed = JSON.parse(source.chi_tiet_mat_hang);
            return Array.isArray(parsed) ? parsed : [];
          } catch {
            return [];
          }
        })()
      : [];

  const productLines = rawLines
    .filter((row): row is Record<string, unknown> => Boolean(row && typeof row === 'object'))
    .map(row => ({
      id: pickRowField(row, ['id'], '') || undefined,
      loai: pickRowField(row, ['loai'], '') || '',
      ten_mat_hang: pickRowField(row, ['ten_mat_hang'], '') || '',
      ma_san_pham: pickRowField(row, ['ma_san_pham'], '') || '',
      so_luong: Math.max(0, parseDriverReconciliationNumber(row.so_luong)),
      doanh_thu: Math.max(0, parseDriverReconciliationNumber(row.doanh_thu))
    }));

  const sumBy = (loai: string, field: 'so_luong' | 'doanh_thu') =>
    productLines.filter(line => line.loai === loai).reduce((sum, line) => sum + line[field], 0);

  const flatFromLines = productLines.length > 0
    ? {
        ten_mat_hang: productLines.find(line => line.ten_mat_hang)?.ten_mat_hang || '',
        ma_san_pham: productLines.find(line => line.ma_san_pham)?.ma_san_pham || '',
        sl_cuon_cach_nhiet: sumBy('cach_nhiet', 'so_luong'),
        doanh_thu_cach_nhiet: sumBy('cach_nhiet', 'doanh_thu'),
        so_luong_bao_bi: sumBy('bao_bi', 'so_luong'),
        doanh_thu_bao_bi: sumBy('bao_bi', 'doanh_thu'),
        so_luong_tui_tam_gia_cong: sumBy('tui_tam_gia_cong', 'so_luong'),
        doanh_thu_tui_tam_gia_cong: sumBy('tui_tam_gia_cong', 'doanh_thu'),
        so_luong_tui_niem_phong: sumBy('tui_niem_phong', 'so_luong'),
        doanh_thu_tui_niem_phong: sumBy('tui_niem_phong', 'doanh_thu'),
        so_luong_tui_cao_cap_chong_soc: sumBy('tui_cao_cap_chong_soc', 'so_luong'),
        thanh_tien_tui_cao_cap_chong_soc: sumBy('tui_cao_cap_chong_soc', 'doanh_thu'),
        ds_poly: sumBy('ds_poly', 'doanh_thu'),
        tong_mat_hang: productLines.reduce((sum, line) => sum + line.so_luong, 0),
        tong_doanh_thu: productLines.reduce((sum, line) => sum + line.doanh_thu, 0)
      }
    : null;

  return {
    record: {
      ngay_gio: dateTime,
      ca: pickRowField(source, ['ca', 'shift'], '') || null,
      xe_id: source.xe_id === null || source.xe_id === undefined || source.xe_id === '' ? null : source.xe_id,
      bien_so_xe: plateNumber,
      ma_nhan_su: pickRowField(source, ['ma_nhan_su', 'staffCode'], '') || null,
      nhan_vien_phu_trach: pickRowField(source, ['nhan_vien_phu_trach', 'staffName'], '') || null,
      tong_mat_hang: Math.max(0, flatFromLines?.tong_mat_hang ?? parseDriverReconciliationNumber(source.tong_mat_hang)),
      tong_doanh_thu: Math.max(0, flatFromLines?.tong_doanh_thu ?? parseDriverReconciliationNumber(source.tong_doanh_thu)),
      tong_chi_phi: Math.max(0, parseDriverReconciliationNumber(source.tong_chi_phi)),
      chi_tiet_mat_hang: productLines,
      ten_mat_hang: (flatFromLines?.ten_mat_hang || pickRowField(source, ['ten_mat_hang', 'productName'], '')) || null,
      ma_san_pham: (flatFromLines?.ma_san_pham || pickRowField(source, ['ma_san_pham', 'productCode'], '')) || null,
      sl_cuon_cach_nhiet: Math.max(0, flatFromLines?.sl_cuon_cach_nhiet ?? parseDriverReconciliationNumber(source.sl_cuon_cach_nhiet)),
      doanh_thu_cach_nhiet: Math.max(0, flatFromLines?.doanh_thu_cach_nhiet ?? parseDriverReconciliationNumber(source.doanh_thu_cach_nhiet)),
      so_luong_bao_bi: Math.max(0, flatFromLines?.so_luong_bao_bi ?? parseDriverReconciliationNumber(source.so_luong_bao_bi)),
      doanh_thu_bao_bi: Math.max(0, flatFromLines?.doanh_thu_bao_bi ?? parseDriverReconciliationNumber(source.doanh_thu_bao_bi)),
      so_luong_tui_tam_gia_cong: Math.max(0, flatFromLines?.so_luong_tui_tam_gia_cong ?? parseDriverReconciliationNumber(source.so_luong_tui_tam_gia_cong)),
      doanh_thu_tui_tam_gia_cong: Math.max(0, flatFromLines?.doanh_thu_tui_tam_gia_cong ?? parseDriverReconciliationNumber(source.doanh_thu_tui_tam_gia_cong)),
      so_luong_tui_niem_phong: Math.max(0, flatFromLines?.so_luong_tui_niem_phong ?? parseDriverReconciliationNumber(source.so_luong_tui_niem_phong)),
      doanh_thu_tui_niem_phong: Math.max(0, flatFromLines?.doanh_thu_tui_niem_phong ?? parseDriverReconciliationNumber(source.doanh_thu_tui_niem_phong)),
      so_luong_tui_cao_cap_chong_soc: Math.max(0, flatFromLines?.so_luong_tui_cao_cap_chong_soc ?? parseDriverReconciliationNumber(source.so_luong_tui_cao_cap_chong_soc)),
      thanh_tien_tui_cao_cap_chong_soc: Math.max(0, flatFromLines?.thanh_tien_tui_cao_cap_chong_soc ?? parseDriverReconciliationNumber(source.thanh_tien_tui_cao_cap_chong_soc)),
      ds_poly: Math.max(0, flatFromLines?.ds_poly ?? parseDriverReconciliationNumber(source.ds_poly)),
      thuong_chuyen_giao_hang: Math.max(0, parseDriverReconciliationNumber(source.thuong_chuyen_giao_hang)),
      cong_lai_xe_theo_km: Math.max(0, parseDriverReconciliationNumber(source.cong_lai_xe_theo_km)),
      thuong_km_di: Math.max(0, parseDriverReconciliationNumber(source.thuong_km_di)),
      chi_so_km_truoc: kmBefore,
      chi_so_km_ve: kmAfter,
      so_km_thuc_te: kmActual,
      so_lenh: Math.max(0, parseDriverReconciliationNumber(source.so_lenh)),
      so_chuyen: Math.max(0, parseDriverReconciliationNumber(source.so_chuyen)),
      ten_lx1: pickRowField(source, ['ten_lx1', 'driverName1'], '') || null,
      cong_lx1: Math.max(0, parseDriverReconciliationNumber(source.cong_lx1)),
      luong_lx1: Math.max(0, parseDriverReconciliationNumber(source.luong_lx1)),
      tien_an_lx1: Math.max(0, parseDriverReconciliationNumber(source.tien_an_lx1)),
      tien_ds_lx1: Math.max(0, parseDriverReconciliationNumber(source.tien_ds_lx1)),
      tien_thuong_chuyen_lx1: Math.max(0, parseDriverReconciliationNumber(source.tien_thuong_chuyen_lx1)),
      tien_luat_lx1: Math.max(0, parseDriverReconciliationNumber(source.tien_luat_lx1)),
      ghi_chu: pickRowField(source, ['ghi_chu', 'notes'], '') || null
    }
  };
}

function parseVehicleKmLogBody(
  body: unknown
): { error: string } | { record: Record<string, unknown> } {
  const source = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const driverName = pickRowField(source, ['ten_lai_xe', 'driverName'], '');
  const plateNumber = pickRowField(source, ['bien_so_xe', 'bsx', 'plateNumber'], '').toUpperCase();
  const departureTime = pickRowField(source, ['ngay_gio_di', 'departureTime'], '');
  const returnTime = pickRowField(source, ['ngay_gio_ve', 'returnTime'], '');

  if (!driverName) return { error: 'Vui lòng chọn tên lái xe.' };
  if (!plateNumber) return { error: 'Vui lòng chọn biển số xe.' };
  if (!departureTime || Number.isNaN(Date.parse(departureTime))) return { error: 'Ngày giờ đi không hợp lệ.' };
  if (returnTime && Number.isNaN(Date.parse(returnTime))) return { error: 'Ngày giờ về không hợp lệ.' };

  const kmDeparture = Math.max(0, parseDriverReconciliationNumber(source.so_km_di));
  const kmReturn = Math.max(0, parseDriverReconciliationNumber(source.so_km_ve));
  const totalRaw = parseDriverReconciliationNumber(source.tong_km);
  const totalKm = totalRaw > 0 ? totalRaw : Math.max(0, kmReturn - kmDeparture);
  const kmType = pickRowField(source, ['loai_km', 'kmType'], '');

  return {
    record: {
      ten_lai_xe: driverName,
      ma_nhan_su: pickRowField(source, ['ma_nhan_su', 'staffCode'], '') || null,
      xe_id: source.xe_id === null || source.xe_id === undefined || source.xe_id === '' ? null : source.xe_id,
      bien_so_xe: plateNumber,
      ngay_gio_di: departureTime,
      ngay_gio_ve: returnTime || null,
      loai_km: kmType || null,
      so_km_di: kmDeparture,
      so_km_ve: kmReturn,
      tong_km: totalKm,
      anh_url: pickRowField(source, ['anh_url', 'imageUrl', 'photoUrl'], '') || null,
      anh_public_id: pickRowField(source, ['anh_public_id', 'imagePublicId', 'photoPublicId'], '') || null,
      ghi_chu: pickRowField(source, ['ghi_chu', 'notes'], '') || null
    }
  };
}

function isMissingColumnError(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  if (error.code === 'PGRST204') return true;
  if (error.code === '42703') return true;
  return /does not exist|Could not find the .+ column|schema cache/i.test(error.message || '');
}

function isImmutableOrGeneratedColumnError(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return /generated column|can only be updated to DEFAULT|immutable/i.test(error.message || '');
}

function isMissingTableError(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  if (error.code === 'PGRST205') return true;
  return /could not find the table/i.test(error.message || '');
}

type SupabaseDbRef = { client: SupabaseClient; label: string };

/** Ưu tiên DB mới (phieu-can), rồi DB cũ (he-thong). */
function listSupabaseDbRefsPreferNew(): SupabaseDbRef[] {
  const refs: SupabaseDbRef[] = [];
  const seenUrls = new Set<string>();

  const push = (client: SupabaseClient | null, label: string, url: string) => {
    if (!client) return;
    const key = (url || label).trim().toLowerCase();
    if (key && seenUrls.has(key)) return;
    if (key) seenUrls.add(key);
    refs.push({ client, label });
  };

  push(supabaseWeighing, SUPABASE_WEIGHING_DB_LABEL, SUPABASE_WEIGHING_URL);
  push(supabase, SUPABASE_MAIN_DB_LABEL, SUPABASE_URL || '');
  return refs;
}

type KiemKhoDotGroup = {
  dot_kiem_kho: string;
  ten_kho: string | null;
  ngay_bat_dau: string | null;
  thoi_gian_xac_nhan: string | null;
  da_xac_nhan: boolean;
  so_dong: number;
  thu_tu_trong_ngay: number;
  tong_dot_trong_ngay: number;
};

/**
 * Gộp các dòng kiem_kho theo dot_kiem_kho. Đợt "đã xác nhận" = mọi dòng đều có thoi_gian_xac_nhan.
 * Mỗi đợt luôn thuộc đúng 1 kho (FE bắt buộc chọn kho trước khi lưu dòng đầu tiên của đợt).
 */
function computeKiemKhoDotGroups(
  rows: Array<{
    dot_kiem_kho?: unknown;
    ten_kho?: unknown;
    ngay_gio_kiem_kho?: unknown;
    thoi_gian_xac_nhan?: unknown;
  }>
): KiemKhoDotGroup[] {
  type Group = {
    start: string;
    tenKho: string | null;
    confirmMax: string | null;
    hasUnconfirmed: boolean;
    count: number;
  };
  const groups = new Map<string, Group>();
  for (const row of rows) {
    const key = String(row.dot_kiem_kho ?? '').trim();
    if (!key) continue;
    const start = String(row.ngay_gio_kiem_kho ?? '').trim();
    const tenKho = String(row.ten_kho ?? '').trim() || null;
    const confirmRaw = row.thoi_gian_xac_nhan ? String(row.thoi_gian_xac_nhan) : null;
    const g = groups.get(key);
    if (!g) {
      groups.set(key, { start, tenKho, confirmMax: confirmRaw, hasUnconfirmed: !confirmRaw, count: 1 });
    } else {
      if (start && (!g.start || start < g.start)) g.start = start;
      if (!g.tenKho && tenKho) g.tenKho = tenKho;
      if (!confirmRaw) g.hasUnconfirmed = true;
      if (confirmRaw && (!g.confirmMax || confirmRaw > g.confirmMax)) g.confirmMax = confirmRaw;
      g.count += 1;
    }
  }
  const result: KiemKhoDotGroup[] = [...groups.entries()].map(([dot_kiem_kho, g]) => ({
    dot_kiem_kho,
    ten_kho: g.tenKho,
    ngay_bat_dau: g.start || null,
    thoi_gian_xac_nhan: g.hasUnconfirmed ? null : g.confirmMax,
    da_xac_nhan: !g.hasUnconfirmed,
    so_dong: g.count,
    thu_tu_trong_ngay: 1,
    tong_dot_trong_ngay: 1
  }));

  // Việt Nam không có DST: cộng 7 giờ trước khi lấy ngày UTC để nhóm đúng ngày địa phương.
  const getVietnamDayKey = (value: string | null) => {
    if (!value) return '';
    const timestamp = new Date(value).getTime();
    if (Number.isNaN(timestamp)) return '';
    return new Date(timestamp + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
  };
  const groupsByDay = new Map<string, KiemKhoDotGroup[]>();
  for (const item of result) {
    const dayKey = getVietnamDayKey(item.ngay_bat_dau);
    if (!dayKey) continue;
    const sameDay = groupsByDay.get(dayKey) ?? [];
    sameDay.push(item);
    groupsByDay.set(dayKey, sameDay);
  }
  for (const sameDay of groupsByDay.values()) {
    sameDay.sort((a, b) => {
      const byStart = (a.ngay_bat_dau || '').localeCompare(b.ngay_bat_dau || '');
      return byStart || a.dot_kiem_kho.localeCompare(b.dot_kiem_kho);
    });
    sameDay.forEach((item, index) => {
      item.thu_tu_trong_ngay = index + 1;
      item.tong_dot_trong_ngay = sameDay.length;
    });
  }

  return result;
}

/** Lỗi PostgREST khi select/filter cột thoi_gian_xac_nhan trên DB chưa migration. */
function isMissingKiemKhoConfirmColumnError(error: { message?: string } | null | undefined) {
  return /thoi_gian_xac_nhan/i.test(String(error?.message || ''));
}

/**
 * Đọc meta đợt kiểm kho. Nếu DB chưa có cột thoi_gian_xac_nhan thì fallback
 * (mọi đợt coi như chưa chốt) thay vì trả 500.
 */
async function loadKiemKhoDotSourceRows(
  db: SupabaseClient,
  options: { tenKho?: string; limit?: number } = {}
): Promise<{
  rows: Array<{
    dot_kiem_kho?: unknown;
    ten_kho?: unknown;
    ngay_gio_kiem_kho?: unknown;
    thoi_gian_xac_nhan?: unknown;
  }>;
  hasConfirmColumn: boolean;
  error: { message?: string } | null;
}> {
  const tenKho = String(options.tenKho ?? '').trim();
  const limit = Number.isFinite(options.limit) ? Math.max(1, Math.trunc(options.limit!)) : 5000;

  let withConfirm = db
    .from(SUPABASE_KIEM_KHO_TABLE)
    .select('dot_kiem_kho, ten_kho, ngay_gio_kiem_kho, thoi_gian_xac_nhan')
    .not('dot_kiem_kho', 'is', null)
    .order('ngay_gio_kiem_kho', { ascending: true })
    .limit(limit);
  if (tenKho) withConfirm = withConfirm.eq('ten_kho', tenKho);

  const first = await withConfirm;
  if (!first.error) {
    return {
      rows: Array.isArray(first.data) ? first.data : [],
      hasConfirmColumn: true,
      error: null
    };
  }

  if (!isMissingKiemKhoConfirmColumnError(first.error)) {
    return { rows: [], hasConfirmColumn: true, error: first.error };
  }

  let withoutConfirm = db
    .from(SUPABASE_KIEM_KHO_TABLE)
    .select('dot_kiem_kho, ten_kho, ngay_gio_kiem_kho')
    .not('dot_kiem_kho', 'is', null)
    .order('ngay_gio_kiem_kho', { ascending: true })
    .limit(limit);
  if (tenKho) withoutConfirm = withoutConfirm.eq('ten_kho', tenKho);

  const second = await withoutConfirm;
  if (second.error) {
    return { rows: [], hasConfirmColumn: false, error: second.error };
  }

  console.warn(
    `[SUPABASE] Bảng ${SUPABASE_KIEM_KHO_TABLE} thiếu cột thoi_gian_xac_nhan — dùng fallback (mọi đợt coi như chưa chốt). Chạy supabase-kiem-kho.sql để bật chốt đợt.`
  );

  return {
    rows: Array.isArray(second.data) ? second.data : [],
    hasConfirmColumn: false,
    error: null
  };
}

const supabaseTableClientCache = new Map<string, SupabaseDbRef>();

/**
 * Nếu bảng không có trên Supabase mới → tự dùng Supabase cũ.
 * Cache theo tên bảng sau lần resolve đầu.
 */
async function resolveSupabaseClientForTable(table: string): Promise<SupabaseDbRef | null> {
  if (
    supabaseKiemKho &&
    (table === SUPABASE_KIEM_KHO_TABLE ||
      table === SUPABASE_KIEM_KHO_TONG_HOP_TABLE ||
      table === SUPABASE_KIEM_KHO_CHENH_LECH_TABLE)
  ) {
    return { client: supabaseKiemKho, label: SUPABASE_KIEM_KHO_DB_LABEL };
  }

  const cached = supabaseTableClientCache.get(table);
  if (cached) return cached;

  const refs = listSupabaseDbRefsPreferNew();
  for (const ref of refs) {
    const { error } = await ref.client.from(table).select('*').limit(1);
    if (!error) {
      supabaseTableClientCache.set(table, ref);
      console.log(`[SUPABASE] Bảng ${table} dùng DB ${ref.label}`);
      return ref;
    }
    if (!isMissingTableError(error)) {
      // Bảng có thể tồn tại nhưng lỗi khác (RLS/cột...) — vẫn gắn DB này.
      supabaseTableClientCache.set(table, ref);
      console.warn(`[SUPABASE] Bảng ${table} trên ${ref.label}: ${error.message}`);
      return ref;
    }
    console.warn(`[SUPABASE] Không thấy bảng ${table} trên ${ref.label}, thử DB tiếp theo...`);
  }

  return null;
}

async function runOnSupabaseTableWithFallback<T>(
  table: string,
  run: (client: SupabaseClient) => Promise<{ data: T; error: { code?: string; message?: string } | null }>
): Promise<{ data: T | null; error: { code?: string; message?: string } | null; dbLabel: string | null }> {
  const refs = listSupabaseDbRefsPreferNew();
  if (refs.length === 0) {
    return { data: null, error: { message: 'Supabase chưa được cấu hình.' }, dbLabel: null };
  }

  let lastMissing: { code?: string; message?: string } | null = null;

  for (const ref of refs) {
    const { data, error } = await run(ref.client);
    if (!error) {
      supabaseTableClientCache.set(table, ref);
      return { data, error: null, dbLabel: ref.label };
    }
    if (isMissingTableError(error)) {
      lastMissing = error;
      console.warn(`[SUPABASE] ${table} không có trên ${ref.label}, fallback DB khác...`);
      continue;
    }
    return { data: null, error, dbLabel: ref.label };
  }

  return { data: null, error: lastMissing, dbLabel: null };
}

function respondSupabaseReadError(
  res: express.Response,
  error: { code?: string; message?: string },
  table: string,
  emptyPayload: Record<string, unknown>
) {
  if (isMissingTableError(error)) {
    return res.json({
      ...emptyPayload,
      source: 'local',
      warning:
        `Bảng ${table} chưa có trên Supabase mới (${SUPABASE_WEIGHING_DB_LABEL}) lẫn cũ (${SUPABASE_MAIN_DB_LABEL}). ${error.message || ''}`.trim()
    });
  }
  console.error(`Supabase ${table} error:`, error);
  const clockHint = formatSupabaseAuthClockHint(error);
  return res.status(500).json({
    error: `Không thể tải từ ${table}. ${error.message || ''}${clockHint}`.trim()
  });
}

type ProductNplPhanTramItem = {
  ma_npl: string;
  ten_npl: string;
  loai: 'phan_tram' | 'so_luong';
  phan_tram: number | null;
  so_luong: number | null;
  don_vi: string | null;
  khoi_luong_kg: number | null;
};

function parseServerNumber(value: unknown): number {
  if (value === null || value === undefined || value === '') return NaN;
  if (typeof value === 'number') return value;
  const normalized = String(value).trim().replace(/\s/g, '').replace(',', '.');
  return Number(normalized);
}

function resolveServerNplAmountType(record: Record<string, unknown>): 'phan_tram' | 'so_luong' {
  const loai = String(record.loai ?? record.amountType ?? record.dinh_luong_loai ?? '').trim().toLowerCase();
  if (loai === 'so_luong' || loai === 'quantity') return 'so_luong';
  if (loai === 'phan_tram' || loai === 'percent') return 'phan_tram';

  const quantityRaw = record.so_luong ?? record.quantity;
  const percentRaw = record.phan_tram ?? record.percent ?? record.ty_le;
  const quantity = parseServerNumber(quantityRaw);
  const percent = parseServerNumber(percentRaw);

  if (quantityRaw !== undefined && quantityRaw !== null && quantityRaw !== '' && (percentRaw === undefined || percentRaw === null || percentRaw === '')) {
    return 'so_luong';
  }

  if (Number.isFinite(quantity) && !Number.isFinite(percent)) return 'so_luong';
  return 'phan_tram';
}

function parseProductNplPhanTramInput(raw: unknown): { error: string } | { items: ProductNplPhanTramItem[] } {
  let source = raw;

  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) {
      return { items: [] };
    }
    try {
      source = JSON.parse(trimmed);
    } catch {
      return { error: 'JSON NPL không hợp lệ.' };
    }
  }

  if (source === null || source === undefined) {
    return { items: [] };
  }

  const list = Array.isArray(source)
    ? source
    : source && typeof source === 'object' && Array.isArray((source as { items?: unknown }).items)
      ? (source as { items: unknown[] }).items
      : null;

  if (!list) {
    return { error: 'NPL phần trăm phải là mảng JSON.' };
  }

  const items: ProductNplPhanTramItem[] = [];

  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    const maNpl = String(record.ma_npl ?? record.code ?? record.ma ?? '').trim();
    const tenNpl = String(record.ten_npl ?? record.name ?? record.ten ?? '').trim();
    const donVi = String(record.don_vi ?? record.unit ?? '').trim() || null;
    const loai = resolveServerNplAmountType(record);

    if (!maNpl) {
      return { error: 'Mỗi dòng NPL cần có mã NPL.' };
    }

    const weightKgRaw = parseServerNumber(record.khoi_luong_kg ?? record.weightKg ?? record.weight_kg);
    const weightKg = Number.isFinite(weightKgRaw) && weightKgRaw >= 0 ? weightKgRaw : null;
    const companionPercentRaw = parseServerNumber(record.phan_tram ?? record.percent ?? record.ty_le);
    const companionPercent =
      Number.isFinite(companionPercentRaw) && companionPercentRaw >= 0 && companionPercentRaw <= 100
        ? companionPercentRaw
        : null;

    if (loai === 'so_luong') {
      const quantityRaw = record.so_luong ?? record.quantity;
      const quantityParsed = parseServerNumber(quantityRaw);
      const quantityMissing =
        quantityRaw === undefined || quantityRaw === null || quantityRaw === '';
      // 0 hợp lệ. Dòng Excel chỉ có Kg (BDT 0.0085) có thể gửi so_luong=0 hoặc null + khoi_luong_kg.
      let quantity: number | null;
      if (Number.isFinite(quantityParsed) && quantityParsed >= 0) {
        quantity = quantityParsed;
      } else if (quantityMissing && weightKg !== null) {
        quantity = 0;
      } else {
        return { error: `Số lượng của ${maNpl} phải >= 0.` };
      }
      items.push({
        ma_npl: maNpl,
        ten_npl: tenNpl,
        loai: 'so_luong',
        phan_tram: companionPercent,
        so_luong: quantity,
        don_vi: donVi,
        khoi_luong_kg: weightKg
      });
      continue;
    }

    const percent = parseServerNumber(record.phan_tram ?? record.percent ?? record.ty_le);
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
      return { error: `Phần trăm của ${maNpl} phải từ 0 đến 100.` };
    }

    items.push({
      ma_npl: maNpl,
      ten_npl: tenNpl,
      loai: 'phan_tram',
      phan_tram: percent,
      so_luong: null,
      don_vi: donVi || '%',
      khoi_luong_kg: weightKg
    });
  }

  return { items };
}

function parseProductPatchBody(body: unknown): { error: string } | { record: Record<string, string | number | null> } {
  const source = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const code = parseMaterialText(source.code ?? source.ma_sp);
  const name = parseMaterialText(source.name ?? source.ten_sp);
  const hasProductField = [
    'code', 'ma_sp', 'newCode', 'ma_sp_moi', 'amisCode', 'ma_amis', 'name', 'ten_sp', 'nature', 'tinh_chat', 'group', 'nhom_vthh',
    'unit', 'don_vi', 'openingStock', 'ton_dau_ky', 'inbound', 'nhap_trong_ky', 'outbound', 'xuat_trong_ky',
    'stock', 'sl_ton', 'minStock', 'so_luong_ton_toi_thieu',
    'origin', 'nguon_goc', 'description', 'mo_ta',
    'totalWeight', 'tong_trong_luong', 'rollWidth', 'kho_cuon', 'rollLength', 'chieu_dai_cuon',
    'coreWeight', 'trong_luong_loi', 'bagWeight', 'trong_luong_tui', 'plasticWeight', 'trong_luong_nhua',
    'warehouse', 'ten_kho'
  ].some(key => Object.prototype.hasOwnProperty.call(source, key));

  if (!hasProductField) {
    return { error: 'Không có dữ liệu sản phẩm để cập nhật.' };
  }

  if (!code && !name) {
    return { error: 'Vui lòng nhập mã SP hoặc tên sản phẩm.' };
  }

  const record: Record<string, string | number | null> = {};
  if (code) record.ma_sp = code;
  if (name) record.ten_sp = name;
  if (Object.prototype.hasOwnProperty.call(source, 'newCode') || Object.prototype.hasOwnProperty.call(source, 'ma_sp_moi')) {
    record.ma_sp_moi = parseMaterialText(source.newCode ?? source.ma_sp_moi) || null;
  }
  if (Object.prototype.hasOwnProperty.call(source, 'nature') || Object.prototype.hasOwnProperty.call(source, 'tinh_chat')) {
    record.tinh_chat = parseMaterialText(source.nature ?? source.tinh_chat) || null;
  }
  if (Object.prototype.hasOwnProperty.call(source, 'group') || Object.prototype.hasOwnProperty.call(source, 'nhom_vthh')) {
    record.nhom_vthh = parseMaterialText(source.group ?? source.nhom_vthh) || null;
  }
  if (Object.prototype.hasOwnProperty.call(source, 'unit') || Object.prototype.hasOwnProperty.call(source, 'don_vi')) {
    record.don_vi = parseMaterialText(source.unit ?? source.don_vi) || null;
  }
  if (Object.prototype.hasOwnProperty.call(source, 'openingStock') || Object.prototype.hasOwnProperty.call(source, 'ton_dau_ky')) {
    record.ton_dau_ky = parseOptionalMaterialNumber(source.openingStock ?? source.ton_dau_ky);
  }
  if (Object.prototype.hasOwnProperty.call(source, 'inbound') || Object.prototype.hasOwnProperty.call(source, 'nhap_trong_ky')) {
    record.nhap_trong_ky = parseOptionalMaterialNumber(source.inbound ?? source.nhap_trong_ky);
  }
  if (Object.prototype.hasOwnProperty.call(source, 'outbound') || Object.prototype.hasOwnProperty.call(source, 'xuat_trong_ky')) {
    record.xuat_trong_ky = parseOptionalMaterialNumber(source.outbound ?? source.xuat_trong_ky);
  }
  if (Object.prototype.hasOwnProperty.call(source, 'stock') || Object.prototype.hasOwnProperty.call(source, 'sl_ton')) {
    record.sl_ton = parseOptionalMaterialNumber(source.stock ?? source.sl_ton);
  }
  if (Object.prototype.hasOwnProperty.call(source, 'minStock') || Object.prototype.hasOwnProperty.call(source, 'so_luong_ton_toi_thieu')) {
    record.so_luong_ton_toi_thieu = parseOptionalMaterialNumber(source.minStock ?? source.so_luong_ton_toi_thieu);
  }
  if (Object.prototype.hasOwnProperty.call(source, 'origin') || Object.prototype.hasOwnProperty.call(source, 'nguon_goc')) {
    record.nguon_goc = parseMaterialText(source.origin ?? source.nguon_goc) || null;
  }
  if (Object.prototype.hasOwnProperty.call(source, 'description') || Object.prototype.hasOwnProperty.call(source, 'mo_ta')) {
    record.mo_ta = parseMaterialText(source.description ?? source.mo_ta) || null;
  }
  if (Object.prototype.hasOwnProperty.call(source, 'amisCode') || Object.prototype.hasOwnProperty.call(source, 'ma_amis')) {
    record.ma_amis = parseMaterialText(source.amisCode ?? source.ma_amis) || null;
  }
  if (Object.prototype.hasOwnProperty.call(source, 'totalWeight') || Object.prototype.hasOwnProperty.call(source, 'tong_trong_luong')) {
    record.tong_trong_luong = parseOptionalMaterialDecimalText(source.totalWeight ?? source.tong_trong_luong);
  }
  if (Object.prototype.hasOwnProperty.call(source, 'rollWidth') || Object.prototype.hasOwnProperty.call(source, 'kho_cuon')) {
    record.kho_cuon = parseOptionalMaterialDecimalText(source.rollWidth ?? source.kho_cuon);
  }
  if (Object.prototype.hasOwnProperty.call(source, 'rollLength') || Object.prototype.hasOwnProperty.call(source, 'chieu_dai_cuon')) {
    record.chieu_dai_cuon = parseOptionalMaterialDecimalText(source.rollLength ?? source.chieu_dai_cuon);
  }
  if (Object.prototype.hasOwnProperty.call(source, 'coreWeight') || Object.prototype.hasOwnProperty.call(source, 'trong_luong_loi')) {
    record.trong_luong_loi = parseOptionalMaterialDecimalText(source.coreWeight ?? source.trong_luong_loi);
  }
  if (Object.prototype.hasOwnProperty.call(source, 'bagWeight') || Object.prototype.hasOwnProperty.call(source, 'trong_luong_tui')) {
    record.trong_luong_tui = parseOptionalMaterialDecimalText(source.bagWeight ?? source.trong_luong_tui);
  }
  if (Object.prototype.hasOwnProperty.call(source, 'plasticWeight') || Object.prototype.hasOwnProperty.call(source, 'trong_luong_nhua')) {
    record.trong_luong_nhua = parseOptionalMaterialDecimalText(source.plasticWeight ?? source.trong_luong_nhua);
  }
  if (Object.prototype.hasOwnProperty.call(source, 'warehouse') || Object.prototype.hasOwnProperty.call(source, 'ten_kho')) {
    record.ten_kho = parseMaterialText(source.warehouse ?? source.ten_kho) || null;
  }

  return { record };
}

function productWriteErrorMessage(error: { code?: string; message?: string; details?: string }) {
  if (isMissingTableError(error)) {
    return `Bảng ${SUPABASE_PRODUCTS_TABLE} chưa tồn tại trên Supabase.`;
  }
  if (isMissingColumnError(error)) {
    return `Bảng ${SUPABASE_PRODUCTS_TABLE} đang thiếu cột (${error.message}). Hãy chạy supabase-san-pham-dinh-muc.sql.`;
  }
  return `Không thể lưu sản phẩm vào ${SUPABASE_PRODUCTS_TABLE}. ${error.message}${error.details ? ` (${error.details})` : ''}`;
}

function parseInitialProductQuantity(value: unknown): number {
  const quantity = Number(String(value ?? '').trim().replace(',', '.'));
  if (!Number.isFinite(quantity) || quantity <= 0) return 0;
  return Math.min(999, Math.floor(quantity));
}

function buildProductQrTimeSerial(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    second: '2-digit',
    minute: '2-digit',
    hour: '2-digit',
    day: '2-digit',
    month: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find(part => part.type === type)?.value.padStart(2, '0') || '00';
  return `${value('second')}${value('minute')}${value('hour')}${value('day')}${value('month')}`;
}

function randomProductQrSuffix(length: number): string {
  const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let result = '';
  for (let index = 0; index < length; index += 1) {
    result += alphabet[crypto.randomInt(0, alphabet.length)];
  }
  return result;
}

/** Giữ đúng quy tắc cũ: MãSP_ssmmhhddmm + ký tự ngẫu nhiên; tăng độ dài khi cần chống trùng. */
function buildStoredProductQrCodes(productCode: string, quantity: number): string[] {
  const code = productCode.trim();
  const used = new Set<string>();
  const records: string[] = [];

  for (let itemIndex = 0; itemIndex < quantity; itemIndex += 1) {
    let generated = '';
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const randomLength = attempt < 24 ? 1 : attempt < 64 ? 2 : 3;
      const candidate = `${code}_${buildProductQrTimeSerial()}${randomProductQrSuffix(randomLength)}`;
      if (!used.has(candidate)) {
        generated = candidate;
        break;
      }
    }
    if (!generated) {
      generated = `${code}_${buildProductQrTimeSerial()}${randomProductQrSuffix(4)}`;
    }
    used.add(generated);
    records.push(generated);
  }

  return records;
}

function buildInitialProductReceiptCode(): string {
  const now = new Date();
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(now).replace(/-/g, '');
  return `PN-KHOI-TAO-${date}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

function parseMixingNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(String(value).replace(',', '.'));
  return Number.isFinite(num) ? Math.round(num * 1000) / 1000 : null;
}

function roundMixingWeight(value: number) {
  return Math.round(value * 1000) / 1000;
}

function parseMixingRoundItem(source: unknown): {
  ma_nvl: string;
  ten_vat_tu: string;
  don_vi: string;
  so_luong: number | null;
  kl_thuc_te: number | null;
  ti_le_phan_tram: number | null;
} | null {
  if (!source || typeof source !== 'object') return null;
  const record = source as Record<string, unknown>;
  const ma_nvl = String(record.ma_npl ?? record.ma_nvl ?? record.code ?? '').trim();
  const ten_vat_tu = String(record.ten_vat_tu ?? record.ten_npl ?? '').trim();
  const don_vi = String(record.don_vi ?? record.unit ?? 'kg').trim() || 'kg';
  const so_luong = parseMixingNumber(record.so_luong ?? record.so_luong_kg);
  const kl_thuc_te = parseMixingNumber(record.kl_thuc_te ?? record.so_luong_thuc_te);
  const ti_le_phan_tram = parseMixingNumber(record.ti_le_phan_tram ?? record.phan_tram ?? record.percent);
  if (!ma_nvl && !ten_vat_tu && so_luong === null && kl_thuc_te === null && ti_le_phan_tram === null) return null;
  return { ma_nvl, ten_vat_tu, don_vi, so_luong, kl_thuc_te, ti_le_phan_tram };
}

const MIXING_ROUND_KEYS_SERVER: string[] = Array.from(
  { length: 20 },
  (_, index) => `lan_${index + 1}`
);

function hasMixingRoundMaterial(phoiTron: Record<string, unknown>) {
  return MIXING_ROUND_KEYS_SERVER.some(key =>
    parseMixingRoundItems(phoiTron[key]).some(
      item => item.ma_nvl || item.ten_vat_tu || item.so_luong !== null || item.kl_thuc_te !== null
    )
  );
}

function backfillLegacyMixingPhoiTron(
  line: Record<string, unknown>,
  phoiTron: Record<string, unknown>,
  ma_nvl: string,
  ten_vat_tu: string
) {
  if (hasMixingRoundMaterial(phoiTron)) return phoiTron;

  const don_vi = String(line.don_vi ?? line.unit ?? 'kg').trim() || 'kg';
  const tong_nhua_tron = parseMixingNumber(line.tong_nhua_tron);
  const ti_le_phan_tram = parseMixingNumber(line.ti_le_phan_tram ?? line.phan_tram);
  if (!ma_nvl && !ten_vat_tu && tong_nhua_tron === null) return phoiTron;

  return {
    ...phoiTron,
    lan_1: [{ ma_nvl, ten_vat_tu, don_vi, so_luong: tong_nhua_tron, kl_thuc_te: null, ti_le_phan_tram }]
  };
}

function parseMixingRoundItems(source: unknown) {
  if (source === null || source === undefined) return [];
  if (typeof source === 'number') {
    return [{ ma_nvl: '', ten_vat_tu: '', don_vi: 'kg', so_luong: source, kl_thuc_te: null, ti_le_phan_tram: null }];
  }
  if (Array.isArray(source)) {
    return source
      .map(item => parseMixingRoundItem(item))
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
  }
  const single = parseMixingRoundItem(source);
  return single ? [single] : [];
}

function parseMixingPhoiTron(source: unknown) {
  const record = source && typeof source === 'object' ? (source as Record<string, unknown>) : {};
  const phoiTron: Record<string, unknown> = {};
  MIXING_ROUND_KEYS_SERVER.forEach(key => {
    const rawItems = record[key];
    const items = parseMixingRoundItems(rawItems);
    if (items.length > 0) {
      if (Array.isArray(rawItems)) {
        phoiTron[key] = items.map((item, index) => {
          const rawItem = rawItems[index];
          if (!rawItem || typeof rawItem !== 'object') return item;
          const kl = parseMixingNumber((rawItem as Record<string, unknown>).kl_thuc_te);
          return kl !== null ? { ...item, kl_thuc_te: kl } : item;
        });
      } else {
        phoiTron[key] = items;
      }
    }
  });
  const rawBatch = record.khoi_luong_me;
  if (rawBatch && typeof rawBatch === 'object') {
    const khoi_luong_me: Record<string, number> = {};
    MIXING_ROUND_KEYS_SERVER.forEach(key => {
      const val = parseMixingNumber((rawBatch as Record<string, unknown>)[key]);
      if (val !== null && val > 0) khoi_luong_me[key] = val;
    });
    if (Object.keys(khoi_luong_me).length > 0) phoiTron.khoi_luong_me = khoi_luong_me;
  }
  if (!phoiTron.lan_1) {
    phoiTron.lan_1 = [{ ma_nvl: '', ten_vat_tu: '', don_vi: 'kg', so_luong: null, kl_thuc_te: null, ti_le_phan_tram: null }];
  }
  return phoiTron;
}

function visiblePhoiTronRoundCount(phoiTron: Record<string, unknown>) {
  const keys = MIXING_ROUND_KEYS_SERVER;
  for (let index = keys.length - 1; index >= 0; index -= 1) {
    if (phoiTron[keys[index]] !== undefined) return index + 1;
  }
  return 1;
}

function sumPhoiTronActualQuantity(phoiTron: Record<string, unknown>) {
  let total = 0;
  let hasAny = false;
  MIXING_ROUND_KEYS_SERVER.forEach(key => {
    const items = parseMixingRoundItems(phoiTron[key]);
    items.forEach(item => {
      if (item.kl_thuc_te !== null && item.kl_thuc_te !== undefined) {
        hasAny = true;
        total += item.kl_thuc_te;
      }
    });
  });
  return hasAny ? roundMixingWeight(total) : null;
}

function sumPhoiTronQuantity(phoiTron: Record<string, unknown>) {
  const rawBatch = phoiTron.khoi_luong_me;
  if (rawBatch && typeof rawBatch === 'object') {
    const roundCount = visiblePhoiTronRoundCount(phoiTron);
    let total = 0;
    let hasAny = false;
    MIXING_ROUND_KEYS_SERVER.slice(0, roundCount).forEach(key => {
      const val = parseMixingNumber((rawBatch as Record<string, unknown>)[key]);
      if (val !== null && val > 0) {
        total += val;
        hasAny = true;
      }
    });
    if (hasAny) return roundMixingWeight(total);
  }

  let total = 0;
  MIXING_ROUND_KEYS_SERVER.forEach(key => {
    const items = parseMixingRoundItems(phoiTron[key]);
    total += items.reduce((sum, item) => sum + (item.so_luong ?? 0), 0);
  });
  return roundMixingWeight(total);
}

function parseMixingRoundPhotos(source: unknown) {
  let value = source;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return {};
    }
  }
  if (!value || typeof value !== 'object') return {};
  const record = value as Record<string, unknown>;
  const result: Record<string, Array<{ url: string; public_id: string | null }>> = {};

  MIXING_ROUND_KEYS_SERVER.forEach(key => {
    const raw = record[key];
    if (!Array.isArray(raw)) return;
    const photos = raw
      .map(item => {
        if (!item || typeof item !== 'object') return null;
        const row = item as Record<string, unknown>;
        const url = String(row.url ?? row.hinh_anh ?? row.imageUrl ?? '').trim();
        if (!url) return null;
        return {
          url,
          public_id: String(row.public_id ?? row.hinh_anh_public_id ?? row.imagePublicId ?? '').trim() || null
        };
      })
      .filter((item): item is { url: string; public_id: string | null } => Boolean(item));
    if (photos.length > 0) result[key] = photos;
  });

  return result;
}

function extractMixingReportPhotosFromChiTiet(chiTietRaw: unknown) {
  if (!Array.isArray(chiTietRaw)) return {};
  for (const line of chiTietRaw) {
    if (!line || typeof line !== 'object') continue;
    const embedded = (line as Record<string, unknown>)._hinh_anh_theo_lan;
    const photos = parseMixingRoundPhotos(embedded);
    if (Object.keys(photos).length > 0) return photos;
  }
  return {};
}

function extractMixingReportPhotos(row: Record<string, unknown>) {
  const fromColumn = parseMixingRoundPhotos(row.hinh_anh_theo_lan);
  if (Object.keys(fromColumn).length > 0) return fromColumn;
  return extractMixingReportPhotosFromChiTiet(row.chi_tiet);
}

function normalizeMixingReasonList(source: unknown) {
  if (!Array.isArray(source)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  source.forEach(item => {
    const value = String(item ?? '').trim();
    if (!value) return;
    const key = value.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    result.push(value);
  });
  return result;
}

function parseMixingRoundReasons(source: unknown) {
  let value = source;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return {};
    }
  }
  if (!value || typeof value !== 'object') return {};
  const record = value as Record<string, unknown>;
  const result: Record<string, string[]> = {};
  MIXING_ROUND_KEYS_SERVER.forEach(key => {
    const reasons = normalizeMixingReasonList(record[key]);
    if (reasons.length > 0) result[key] = reasons;
  });
  return result;
}

function parseMixingRoundExplanations(source: unknown) {
  let value = source;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return {};
    }
  }
  if (!value || typeof value !== 'object') return {};
  const record = value as Record<string, unknown>;
  const result: Record<string, string> = {};
  MIXING_ROUND_KEYS_SERVER.forEach(key => {
    const text = String(record[key] ?? '').trim();
    if (text) result[key] = text;
  });
  return result;
}

function mergeMixingRoundReasons(...sources: unknown[]) {
  const result: Record<string, string[]> = {};
  sources.forEach(source => {
    const parsed = parseMixingRoundReasons(source);
    Object.entries(parsed).forEach(([key, values]) => {
      if (values.length > 0) result[key] = values;
    });
  });
  return result;
}

function mergeMixingRoundExplanations(...sources: unknown[]) {
  const result: Record<string, string> = {};
  sources.forEach(source => {
    const parsed = parseMixingRoundExplanations(source);
    Object.entries(parsed).forEach(([key, value]) => {
      if (value) result[key] = value;
    });
  });
  return result;
}

function extractMixingReportReasonsFromChiTiet(chiTietRaw: unknown) {
  if (!Array.isArray(chiTietRaw)) return {};
  for (const line of chiTietRaw) {
    if (!line || typeof line !== 'object') continue;
    const embedded = (line as Record<string, unknown>)._ly_do_theo_lan;
    const reasons = parseMixingRoundReasons(embedded);
    if (Object.keys(reasons).length > 0) return reasons;
  }
  return {};
}

function extractMixingReportExplanationsFromChiTiet(chiTietRaw: unknown) {
  if (!Array.isArray(chiTietRaw)) return {};
  for (const line of chiTietRaw) {
    if (!line || typeof line !== 'object') continue;
    const embedded = (line as Record<string, unknown>)._giai_trinh_theo_lan;
    const explanations = parseMixingRoundExplanations(embedded);
    if (Object.keys(explanations).length > 0) return explanations;
  }
  return {};
}

function extractMixingReportReasons(row: Record<string, unknown>) {
  const fromColumn = parseMixingRoundReasons(row.ly_do_theo_lan);
  if (Object.keys(fromColumn).length > 0) return fromColumn;
  return extractMixingReportReasonsFromChiTiet(row.chi_tiet);
}

function extractMixingReportExplanations(row: Record<string, unknown>) {
  const fromColumn = parseMixingRoundExplanations(row.giai_trinh_theo_lan);
  if (Object.keys(fromColumn).length > 0) return fromColumn;
  const fromReasons = parseMixingRoundReasons(extractMixingReportReasons(row));
  const derived: Record<string, string> = {};
  Object.entries(fromReasons).forEach(([key, reasons]) => {
    if (reasons.length > 0) derived[key] = formatMixingReasonsExplanation(reasons);
  });
  if (Object.keys(derived).length > 0) return derived;
  return extractMixingReportExplanationsFromChiTiet(row.chi_tiet);
}

function formatMixingReasonsExplanation(reasons: string[]) {
  return reasons.map(item => item.trim()).filter(Boolean).join('; ');
}

function embedMixingReportReasonsInChiTiet(
  chi_tiet: Array<Record<string, unknown>>,
  ly_do_theo_lan: Record<string, string[]>,
  giai_trinh_theo_lan: Record<string, string>
) {
  if (chi_tiet.length === 0) return chi_tiet;
  if (Object.keys(ly_do_theo_lan).length === 0 && Object.keys(giai_trinh_theo_lan).length === 0) {
    return chi_tiet;
  }
  return chi_tiet.map((line, index) =>
    index === 0
      ? {
          ...line,
          _ly_do_theo_lan: ly_do_theo_lan,
          _giai_trinh_theo_lan: giai_trinh_theo_lan
        }
      : line
  );
}

function collectMixingReasonSuggestions(rows: Array<Record<string, unknown>>) {
  const seen = new Set<string>();
  rows.forEach(row => {
    const reasonsByRound = extractMixingReportReasons(row);
    Object.values(reasonsByRound).forEach(list => {
      list.forEach(reason => {
        const normalized = reason.trim();
        if (normalized) seen.add(normalized);
      });
    });
  });
  return [...seen].sort((left, right) => left.localeCompare(right, 'vi'));
}

function embedMixingReportPhotosInChiTiet(
  chi_tiet: Array<Record<string, unknown>>,
  photos: Record<string, Array<{ url: string; public_id: string | null }>>
) {
  if (chi_tiet.length === 0 || Object.keys(photos).length === 0) return chi_tiet;
  return chi_tiet.map((line, index) =>
    index === 0 ? { ...line, _hinh_anh_theo_lan: photos } : line
  );
}

function embedMixingReportLanThuInChiTiet(chi_tiet: Array<Record<string, unknown>>, lan_thu: number) {
  if (chi_tiet.length === 0 || !Number.isFinite(lan_thu) || lan_thu <= 0) return chi_tiet;
  return chi_tiet.map((line, index) => (index === 0 ? { ...line, _lan_thu: lan_thu } : line));
}

function extractMixingReportLanThu(row: Record<string, unknown>) {
  const fromColumn = Number(row.lan_thu);
  if (Number.isFinite(fromColumn) && fromColumn > 0) return fromColumn;
  return extractMixingReportLanThuFromChiTiet(row.chi_tiet);
}

function extractMixingReportLanThuFromChiTiet(chiTietRaw: unknown) {
  if (!Array.isArray(chiTietRaw)) return 1;
  for (const line of chiTietRaw) {
    if (!line || typeof line !== 'object') continue;
    const embedded = Number((line as Record<string, unknown>)._lan_thu);
    if (Number.isFinite(embedded) && embedded > 0) return embedded;
  }
  return 1;
}

function isMissingMixingPhotosColumnError(error: { code?: string; message?: string } | null) {
  return (
    isMissingColumnError(error) &&
    String(error?.message ?? '')
      .toLowerCase()
      .includes('hinh_anh_theo_lan')
  );
}

function isMissingMixingLanThuColumnError(error: { code?: string; message?: string } | null) {
  return (
    isMissingColumnError(error) &&
    String(error?.message ?? '')
      .toLowerCase()
      .includes('lan_thu')
  );
}

function isMissingMixingReasonColumnError(error: { code?: string; message?: string } | null) {
  const message = String(error?.message ?? '').toLowerCase();
  return (
    isMissingColumnError(error) &&
    (message.includes('ly_do_theo_lan') || message.includes('giai_trinh_theo_lan'))
  );
}

async function writeMixingReportRecord(
  record: Record<string, unknown>,
  mode: 'insert' | 'update',
  id?: string
) {
  if (!supabase) throw new Error('Supabase chưa được cấu hình.');

  const runWrite = (payload: Record<string, unknown>) => {
    if (mode === 'insert') {
      return supabase.from(SUPABASE_MIXING_REPORTS_TABLE).insert(payload).select('*').single();
    }
    return supabase.from(SUPABASE_MIXING_REPORTS_TABLE).update(payload).eq('id', id).select('*').single();
  };

  let payload = { ...record };
  let result = await runWrite(payload);

  while (result.error && isMissingColumnError(result.error)) {
    const nextPayload = { ...payload };
    let changed = false;

    if (isMissingMixingPhotosColumnError(result.error)) {
      delete nextPayload.hinh_anh_theo_lan;
      changed = true;
    }
    if (isMissingMixingLanThuColumnError(result.error)) {
      delete nextPayload.lan_thu;
      changed = true;
    }
    if (isMissingMixingReasonColumnError(result.error)) {
      delete nextPayload.ly_do_theo_lan;
      delete nextPayload.giai_trinh_theo_lan;
      changed = true;
    }

    if (!changed) break;
    payload = nextPayload;
    result = await runWrite(payload);
  }

  return result;
}

function backfillMixingItemKlFromLine(
  phoiTron: Record<string, unknown>,
  ma_nvl: string,
  ten_vat_tu: string,
  kl: number
) {
  const hasItemKl = MIXING_ROUND_KEYS_SERVER.some(key =>
    parseMixingRoundItems(phoiTron[key]).some(
      item => item.kl_thuc_te !== null && item.kl_thuc_te !== undefined
    )
  );
  if (hasItemKl) return phoiTron;

  const codeKey = ma_nvl.trim().toLowerCase() || ten_vat_tu.trim().toLowerCase();
  for (const key of MIXING_ROUND_KEYS_SERVER) {
    const items = parseMixingRoundItems(phoiTron[key]);
    if (items.length === 0) continue;
    const updated = items.map(item => {
      const itemKey = (item.ma_nvl || item.ten_vat_tu).trim().toLowerCase();
      const matches = !codeKey || !itemKey || codeKey === itemKey || items.length === 1;
      return matches ? { ...item, kl_thuc_te: kl } : item;
    });
    return { ...phoiTron, [key]: updated };
  }
  return phoiTron;
}

function resolveMixingLineKlFromPhoiTron(
  phoiTron: Record<string, unknown>,
  lineKl: number | null
) {
  let total = 0;
  let hasAny = false;
  MIXING_ROUND_KEYS_SERVER.forEach(key => {
    parseMixingRoundItems(phoiTron[key]).forEach(item => {
      if (item.kl_thuc_te !== null && item.kl_thuc_te !== undefined) {
        hasAny = true;
        total += item.kl_thuc_te;
      }
    });
  });
  if (hasAny) return Math.round(total * 100) / 100;
  return lineKl;
}

function parseMixingReportLine(source: unknown, index: number) {
  if (!source || typeof source !== 'object') return null;
  const record = source as Record<string, unknown>;
  let lan_su_dung = parseMixingPhoiTron(record.lan_su_dung);
  const derivedMa = String(record.ma_npl ?? record.ma_nvl ?? record.code ?? '').trim();
  const derivedTen = String(record.ten_vat_tu ?? record.ten_npl ?? record.name ?? '').trim();
  const ma_nvl = derivedMa || (() => {
    for (const key of MIXING_ROUND_KEYS_SERVER) {
      for (const item of parseMixingRoundItems(lan_su_dung[key])) {
        if (item.ma_nvl) return item.ma_nvl;
      }
    }
    return '';
  })();
  const ten_vat_tu = derivedTen || (() => {
    for (const key of MIXING_ROUND_KEYS_SERVER) {
      for (const item of parseMixingRoundItems(lan_su_dung[key])) {
        if (item.ten_vat_tu) return item.ten_vat_tu;
      }
    }
    return '';
  })();
  if (!ma_nvl && !ten_vat_tu) return null;

  lan_su_dung = backfillLegacyMixingPhoiTron(record, lan_su_dung, ma_nvl, ten_vat_tu);
  const lineKl = parseMixingNumber(record.kl_thuc_te ?? record.so_luong_thuc_te);
  if (lineKl !== null) {
    lan_su_dung = backfillMixingItemKlFromLine(lan_su_dung, ma_nvl, ten_vat_tu, lineKl);
  }
  const tongFromRounds = sumPhoiTronQuantity(lan_su_dung);
  const kl_thuc_te = resolveMixingLineKlFromPhoiTron(lan_su_dung, lineKl);

  return {
    stt: Number(record.stt ?? index + 1) || index + 1,
    ma_nvl,
    ten_vat_tu,
    lan_su_dung,
    kl_thuc_te,
    tong_nhua_tron:
      parseMixingNumber(record.tong_nhua_tron) ?? (tongFromRounds > 0 ? tongFromRounds : null),
    hinh_anh: String(record.hinh_anh ?? record.imageUrl ?? '').trim() || null,
    hinh_anh_public_id: String(record.hinh_anh_public_id ?? record.imagePublicId ?? '').trim() || null
  };
}

function parseMixingReportBody(body: unknown): { error: string } | { record: Record<string, unknown> } {
  const source = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const ca = String(source.ca ?? '').trim();
  const ngay = String(source.ngay ?? '').trim();
  const ma_may = String(source.ma_may ?? source.machineCode ?? '').trim();
  const ten_may = String(source.ten_may ?? source.machineName ?? '').trim();

  if (!ca || ca === '-' || ca === '—') return { error: 'Vui lòng nhập ca.' };
  if (!ngay) return { error: 'Vui lòng chọn ngày.' };
  if (!ma_may && !ten_may) return { error: 'Vui lòng chọn máy.' };

  const chiTietRaw = source.chi_tiet ?? source.lines ?? source.items;
  const list = Array.isArray(chiTietRaw) ? chiTietRaw : [];
  const chi_tiet = list
    .map((line, index) => parseMixingReportLine(line, index))
    .filter((line): line is NonNullable<typeof line> => Boolean(line));

  if (chi_tiet.length === 0) {
    return { error: 'Vui lòng nhập ít nhất một dòng vật tư.' };
  }

  const thuc_te_su_dung =
    parseMixingNumber(source.thuc_te_su_dung) ??
    Math.round(
      chi_tiet.reduce((sum, line) => {
        const actual = sumPhoiTronActualQuantity(line.lan_su_dung as Record<string, unknown>);
        if (actual !== null) return sum + actual;
        return sum + (line.tong_nhua_tron ?? 0);
      }, 0) * 100
    ) / 100;

  const so_lan = Math.min(
    MIXING_ROUND_KEYS_SERVER.length,
    Math.max(
      1,
      Number(source.so_lan) ||
        chi_tiet.reduce(
          (max, line) => Math.max(max, visiblePhoiTronRoundCount(line.lan_su_dung as Record<string, unknown>)),
          1
        )
    )
  );

  const hinh_anh_theo_lan = parseMixingRoundPhotos(source.hinh_anh_theo_lan);
  const ly_do_theo_lan = mergeMixingRoundReasons(
    source.ly_do_theo_lan,
    extractMixingReportReasonsFromChiTiet(chiTietRaw)
  );
  const giai_trinh_theo_lan = mergeMixingRoundExplanations(
    source.giai_trinh_theo_lan,
    extractMixingReportExplanationsFromChiTiet(chiTietRaw)
  );
  MIXING_ROUND_KEYS_SERVER.forEach(key => {
    if (!giai_trinh_theo_lan[key] && ly_do_theo_lan[key]?.length) {
      giai_trinh_theo_lan[key] = formatMixingReasonsExplanation(ly_do_theo_lan[key]);
    }
  });
  const lan_thu = Math.min(
    MIXING_ROUND_KEYS_SERVER.length,
    Math.max(1, Number(source.lan_thu) || 1)
  );
  let chi_tiet_with_photos = embedMixingReportPhotosInChiTiet(chi_tiet, hinh_anh_theo_lan);
  chi_tiet_with_photos = embedMixingReportReasonsInChiTiet(
    chi_tiet_with_photos,
    ly_do_theo_lan,
    giai_trinh_theo_lan
  );
  chi_tiet_with_photos = embedMixingReportLanThuInChiTiet(chi_tiet_with_photos, lan_thu);

  return {
    record: {
      ca,
      ngay,
      gio: String(source.gio ?? '').trim() || null,
      chi_nhanh: String(source.chi_nhanh ?? source.branch ?? '').trim() || null,
      ma_may: ma_may || null,
      ten_may: ten_may || null,
      nhan_su: String(source.nhan_su ?? source.staff ?? '').trim() || null,
      so_phieu: String(source.so_phieu ?? source.documentNo ?? '').trim() || null,
      ky_hieu: String(source.ky_hieu ?? 'QT-16-BM02').trim() || 'QT-16-BM02',
      lan_thu,
      so_lan,
      thuc_te_su_dung,
      ghi_chu: String(source.ghi_chu ?? source.note ?? '').trim() || null,
      hinh_anh_theo_lan,
      ly_do_theo_lan,
      giai_trinh_theo_lan,
      chi_tiet: chi_tiet_with_photos
    }
  };
}

function mixingReportWriteError(error: { code?: string; message?: string }) {
  if (isMissingTableError(error)) {
    return `Bảng ${SUPABASE_MIXING_REPORTS_TABLE} chưa tồn tại. Hãy chạy supabase-bao-cao-phoi-tron.sql.`;
  }
  if (isMissingColumnError(error)) {
    return `Bảng ${SUPABASE_MIXING_REPORTS_TABLE} đang thiếu cột (${error.message}). Hãy chạy supabase-bao-cao-phoi-tron.sql.`;
  }
  return `Không thể lưu báo cáo phối trộn. ${error.message || ''}`.trim();
}

function mixingNormWriteError(error: { code?: string; message?: string }) {
  if (isMissingTableError(error)) {
    return `Bảng ${SUPABASE_MIXING_NORM_TABLE} chưa tồn tại. Hãy chạy supabase-bang-tron-vat-tu-dinh-muc.sql.`;
  }
  if (isMissingColumnError(error)) {
    return `Bảng ${SUPABASE_MIXING_NORM_TABLE} đang thiếu cột (${error.message}). Hãy chạy supabase-bang-tron-vat-tu-dinh-muc.sql.`;
  }
  return `Không thể lưu bảng trộn vật tư định mức. ${error.message || ''}`.trim();
}

function parseMixingNormBody(body: unknown): { error: string } | { record: Record<string, unknown> } {
  if (!body || typeof body !== 'object') return { error: 'Dữ liệu không hợp lệ.' };
  const source = body as Record<string, unknown>;

  const ngayRaw = String(source.ngay ?? '').trim();
  const ngay = ngayRaw ? parseWarehouseSlipDate(ngayRaw) || ngayRaw : null;
  const ma_lenh_sx = String(source.ma_lenh_sx ?? source.maLenhSx ?? '').trim() || null;
  const caRaw = String(source.ca ?? source.shift ?? '').trim();
  const ca = !caRaw || caRaw === '-' || caRaw === '—' ? null : caRaw;

  const parseNvlLines = (raw: unknown, label: string) => {
    const linesRaw = Array.isArray(raw) ? raw : [];
    const mapped = linesRaw
      .map((item, index) => {
        if (!item || typeof item !== 'object') return null;
        const line = item as Record<string, unknown>;
        const ma_nvl = String(line.ma_nvl ?? line.maNvl ?? '').trim();
        const ten_nvl = String(line.ten_nvl ?? line.tenNvl ?? '').trim();
        if (!ma_nvl && !ten_nvl) return null;
        const giaTriRaw = line.gia_tri ?? line.giaTri ?? line.dinh_muc ?? line.value;
        let gia_tri: number | null = null;
        if (giaTriRaw !== null && giaTriRaw !== undefined && String(giaTriRaw).trim() !== '') {
          const n = Number(String(giaTriRaw).replace(',', '.'));
          if (!Number.isFinite(n)) {
            return { error: `Giá trị NVL #${index + 1} (${label}) không hợp lệ.` };
          }
          gia_tri = n;
        }
        const donVi = String(line.don_vi ?? line.donVi ?? 'kg').trim().toLowerCase();
        const don_vi = donVi === '%' ? '%' : 'kg';
        let khoi_luong: number | null = null;
        const khoiRaw = line.khoi_luong ?? line.khoiLuong;
        if (khoiRaw !== null && khoiRaw !== undefined && String(khoiRaw).trim() !== '') {
          const n = Number(String(khoiRaw).replace(',', '.'));
          if (!Number.isFinite(n)) {
            return { error: `Khối lượng NVL #${index + 1} (${label}) không hợp lệ.` };
          }
          khoi_luong = n;
        }
        return {
          ma_nvl: ma_nvl || null,
          ten_nvl: ten_nvl || null,
          gia_tri,
          don_vi,
          khoi_luong
        };
      })
      .filter(Boolean);

    const lineError = mapped.find(
      item => item && typeof item === 'object' && 'error' in (item as object)
    ) as { error: string } | undefined;
    if (lineError?.error) return { error: lineError.error as string };

    const lines = mapped.filter(
      (
        item
      ): item is {
        ma_nvl: string | null;
        ten_nvl: string | null;
        gia_tri: number | null;
        don_vi: string;
        khoi_luong: number | null;
      } => Boolean(item && typeof item === 'object' && !('error' in (item as object)))
    );
    if (lines.length === 0) return { error: `${label}: cần ít nhất 1 dòng NVL.` };
    return { lines };
  };

  // Phiếu mới: nhiều SP trong chi_tiet
  const productsRaw = Array.isArray(source.products)
    ? source.products
    : Array.isArray(source.san_pham)
      ? source.san_pham
      : null;

  if (productsRaw) {
    const products: Array<Record<string, unknown>> = [];
    for (const [index, item] of productsRaw.entries()) {
      if (!item || typeof item !== 'object') continue;
      const product = item as Record<string, unknown>;
      const ma_sp = String(product.ma_sp ?? product.maSp ?? '').trim();
      const ten_sp = String(product.ten_sp ?? product.tenSp ?? '').trim();
      if (!ma_sp) return { error: `Sản phẩm #${index + 1} thiếu mã SP.` };

      const tongRaw = product.tong_trong_luong ?? product.tongTrongLuong;
      let tong_trong_luong: number | null = null;
      if (tongRaw !== null && tongRaw !== undefined && String(tongRaw).trim() !== '') {
        const n = Number(String(tongRaw).replace(',', '.'));
        if (!Number.isFinite(n)) {
          return { error: `Tổng trọng lượng SP ${ma_sp} phải là số.` };
        }
        tong_trong_luong = n;
      }

      const nvlParsed = parseNvlLines(
        product.nvl ?? product.lines ?? product.chi_tiet,
        `SP ${ma_sp}`
      );
      if ('error' in nvlParsed) return { error: nvlParsed.error };

      products.push({
        ma_sp,
        ten_sp: ten_sp || null,
        tong_trong_luong,
        ghi_chu: String(product.ghi_chu ?? product.ghiChu ?? '').trim() || null,
        nvl: nvlParsed.lines
      });
    }

    if (products.length === 0) return { error: 'Vui lòng thêm ít nhất 1 sản phẩm.' };
    if (!ca) return { error: 'Vui lòng chọn ca.' };

    const first = products[0];
    return {
      record: {
        ngay,
        ca,
        ma_lenh_sx,
        ma_sp: first.ma_sp,
        ten_sp: first.ten_sp,
        tong_trong_luong: first.tong_trong_luong,
        ghi_chu: String(source.ghi_chu ?? source.ghiChu ?? '').trim() || null,
        chi_tiet: products
      }
    };
  }

  // Legacy: 1 SP + chi_tiet = mảng NVL phẳng
  const tongRaw = source.tong_trong_luong ?? source.tongTrongLuong;
  let tong_trong_luong: number | null = null;
  if (tongRaw !== null && tongRaw !== undefined && String(tongRaw).trim() !== '') {
    const n = Number(String(tongRaw).replace(',', '.'));
    if (!Number.isFinite(n)) return { error: 'Tổng trọng lượng phải là số.' };
    tong_trong_luong = n;
  }

  const ma_sp = String(source.ma_sp ?? source.maSp ?? '').trim() || null;
  const ten_sp = String(source.ten_sp ?? source.tenSp ?? '').trim() || null;
  const nvlParsed = parseNvlLines(source.chi_tiet ?? source.lines, 'Sản phẩm');
  if ('error' in nvlParsed) return { error: nvlParsed.error };

  return {
    record: {
      ngay,
      ca,
      ma_lenh_sx,
      ma_sp,
      ten_sp,
      tong_trong_luong,
      ghi_chu: String(source.ghi_chu ?? source.ghiChu ?? '').trim() || null,
      chi_tiet: [
        {
          ma_sp,
          ten_sp,
          tong_trong_luong,
          ghi_chu: String(source.ghi_chu ?? source.ghiChu ?? '').trim() || null,
          nvl: nvlParsed.lines
        }
      ]
    }
  };
}

function parseMachineNvlReportKind(value: unknown): 'dau_ca' | 'cuoi_ca' {
  const raw = String(value ?? 'dau_ca').trim().toLowerCase();
  if (raw === 'cuoi_ca' || raw === 'cuoi' || raw === 'cuoi-ca') return 'cuoi_ca';
  return 'dau_ca';
}

function parseMachineNvlReportLine(source: unknown, index: number) {
  if (!source || typeof source !== 'object') return null;
  const record = source as Record<string, unknown>;
  const ma_nvl = String(record.ma_nvl ?? record.ma_npl ?? record.code ?? '').trim();
  const ten_nvl = String(record.ten_nvl ?? record.ten_npl ?? record.name ?? '').trim();
  const don_vi = String(record.don_vi ?? record.unit ?? 'kg').trim() || 'kg';
  const so_luong_ton = parseMixingNumber(record.so_luong_ton ?? record.so_luong ?? record.quantity);
  const so_luong_trong_may = parseMixingNumber(
    record.so_luong_trong_may ?? record.ton_trong_may ?? record.inMachineQuantity
  );
  const so_luong_trong_bon_tron = parseMixingNumber(
    record.so_luong_trong_bon_tron ?? record.ton_trong_bon_tron ?? record.inMixerQuantity
  );
  const so_luong_nl_chua_tron = parseMixingNumber(
    record.so_luong_nl_chua_tron ?? record.nl_chua_tron ?? record.unblendedQuantity
  );
  const so_luong_ton_ngoai = parseMixingNumber(
    record.so_luong_ton_ngoai ?? record.ton_ngoai ?? record.outsideQuantity
  );
  const so_luong_ton_dinh_muc = parseMixingNumber(
    record.so_luong_ton_dinh_muc ?? record.so_luong_dinh_muc ?? record.standardQuantity
  );
  const so_luong_ton_ca_truoc = parseMixingNumber(
    record.so_luong_ton_ca_truoc ?? record.so_luong_ca_truoc ?? record.previousQuantity
  );
  const trong_luong_quy_doi_kg = parseMixingNumber(
    record.trong_luong_quy_doi_kg ?? record.trong_luong_quy_doi ?? record.unitWeightKg
  );
  const loai_vat_tu_raw = String(record.loai_vat_tu ?? record.materialType ?? '').trim().toLowerCase();
  const loai_vat_tu = ['nhua', 'mang', 'loi', 'bao_bi'].includes(loai_vat_tu_raw) ? loai_vat_tu_raw : null;
  const ghi_chu = String(record.ghi_chu ?? record.note ?? '').trim();

  if (
    !ma_nvl &&
    !ten_nvl &&
    so_luong_ton === null &&
    so_luong_trong_may === null &&
    so_luong_trong_bon_tron === null &&
    so_luong_nl_chua_tron === null &&
    so_luong_ton_ngoai === null &&
    so_luong_ton_dinh_muc === null &&
    so_luong_ton_ca_truoc === null
  ) {
    return null;
  }

  return {
    stt: Number(record.stt ?? index + 1) || index + 1,
    ma_nvl,
    ten_nvl,
    don_vi,
    ...(so_luong_trong_may !== null ? { so_luong_trong_may } : {}),
    ...(so_luong_trong_bon_tron !== null ? { so_luong_trong_bon_tron } : {}),
    ...(so_luong_nl_chua_tron !== null ? { so_luong_nl_chua_tron } : {}),
    ...(so_luong_ton_ngoai !== null ? { so_luong_ton_ngoai } : {}),
    ...(so_luong_ton_dinh_muc !== null ? { so_luong_ton_dinh_muc } : {}),
    so_luong_ton:
      so_luong_ton ??
      Math.round(
        ((so_luong_trong_may ?? 0) +
          (so_luong_trong_bon_tron ?? 0) +
          (so_luong_nl_chua_tron ?? 0) +
          (so_luong_ton_ngoai ?? 0)) *
          100
      ) / 100,
    ...(so_luong_ton_ca_truoc !== null ? { so_luong_ton_ca_truoc } : {}),
    ...(trong_luong_quy_doi_kg !== null && trong_luong_quy_doi_kg > 0 ? { trong_luong_quy_doi_kg } : {}),
    ...(loai_vat_tu ? { loai_vat_tu } : {}),
    ghi_chu
  };
}

function parseMachineNvlReportBody(body: unknown): { error: string } | { record: Record<string, unknown> } {
  const source = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const ngay = String(source.ngay ?? '').trim();
  const ca = String(source.ca ?? '').trim();
  const ma_may = String(source.ma_may ?? source.machineCode ?? '').trim();
  const ten_may = String(source.ten_may ?? source.machineName ?? '').trim();

  if (!ngay) return { error: 'Vui lòng chọn ngày.' };
  if (!ca) return { error: 'Vui lòng chọn ca.' };
  if (!ma_may && !ten_may) return { error: 'Vui lòng chọn máy.' };

  const rawLines = source.chi_tiet ?? source.lines ?? source.items;
  const list = Array.isArray(rawLines) ? rawLines : [];
  const chi_tiet = list
    .map((line, index) => parseMachineNvlReportLine(line, index))
    .filter((line): line is NonNullable<typeof line> => Boolean(line));

  if (chi_tiet.length === 0) {
    return { error: 'Vui lòng nhập ít nhất một dòng NVL tồn theo máy.' };
  }

  const tong_so_luong_ton =
    Math.round(chi_tiet.reduce((sum, line) => sum + (line.so_luong_ton ?? 0), 0) * 100) / 100;

  return {
    record: {
      ngay,
      ca,
      loai_bao_cao: parseMachineNvlReportKind(source.loai_bao_cao ?? source.loai ?? source.reportKind),
      gio: String(source.gio ?? '').trim() || null,
      ma_may: ma_may || null,
      ten_may: ten_may || null,
      nhan_su: String(source.nhan_su ?? source.staff ?? '').trim() || null,
      tong_so_luong_ton,
      ghi_chu: String(source.ghi_chu ?? source.note ?? '').trim() || null,
      chi_tiet
    }
  };
}

function machineNvlReportWriteError(error: { code?: string; message?: string }) {
  if (isMissingTableError(error)) {
    return `Bảng ${SUPABASE_MACHINE_NVL_REPORTS_TABLE} chưa tồn tại. Hãy chạy supabase-bao-cao-may-nvl-ton.sql.`;
  }
  if (isMissingColumnError(error)) {
    return `Bảng ${SUPABASE_MACHINE_NVL_REPORTS_TABLE} đang thiếu cột (${error.message}). Hãy chạy supabase-bao-cao-may-nvl-ton-loai.sql hoặc supabase-bao-cao-may-nvl-ton.sql.`;
  }
  return `Không thể lưu báo cáo NVL tồn theo máy. ${error.message || ''}`.trim();
}

function normalizeMachineNvlDupToken(value: unknown) {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, '')
    .toLowerCase();
}

function machineNvlDupTokensMatch(left: unknown, right: unknown) {
  const a = normalizeMachineNvlDupToken(left);
  const b = normalizeMachineNvlDupToken(right);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

function machineNvlDupCaMatches(left: unknown, right: unknown) {
  const a = String(left ?? '').trim().toLowerCase();
  const b = String(right ?? '').trim().toLowerCase();
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

function formatMachineNvlDuplicateApiError(
  loai: 'dau_ca' | 'cuoi_ca',
  ngay: string,
  ca: string,
  machineLabel: string
) {
  const kindLabel = loai === 'cuoi_ca' ? 'tồn cuối ca' : 'tồn đầu ca';
  const machine = String(machineLabel || '').trim() || 'máy đã chọn';
  return `Đã lưu báo cáo ${kindLabel} này rồi (${ngay} · ca ${ca} · ${machine}). Không lưu bản trùng.`;
}

/** Trùng khóa: ngày + ca + loại + máy (mã hoặc tên). */
async function findExistingMachineNvlDuplicate(opts: {
  ngay: string;
  ca: string;
  loai_bao_cao: 'dau_ca' | 'cuoi_ca';
  ma_may?: string | null;
  ten_may?: string | null;
  excludeId?: string | null;
}) {
  if (!supabase) return null;
  const ngay = String(opts.ngay || '').trim();
  const ca = String(opts.ca || '').trim();
  const loai = opts.loai_bao_cao;
  const maMay = String(opts.ma_may || '').trim();
  const tenMay = String(opts.ten_may || '').trim();
  const excludeId = String(opts.excludeId || '').trim();
  if (!ngay || !ca || (!maMay && !tenMay)) return null;

  let query = supabase
    .from(SUPABASE_MACHINE_NVL_REPORTS_TABLE)
    .select('id, ngay, ca, ma_may, ten_may, loai_bao_cao')
    .eq('ngay', ngay)
    .eq('loai_bao_cao', loai)
    .limit(100);

  const { data, error } = await query;
  if (error || !Array.isArray(data)) {
    if (error) console.error('Supabase machine NVL duplicate check error:', error);
    return null;
  }

  for (const row of data) {
    if (!row || typeof row !== 'object') continue;
    const record = row as Record<string, unknown>;
    const id = String(record.id ?? '').trim();
    if (excludeId && id === excludeId) continue;
    if (!machineNvlDupCaMatches(record.ca, ca)) continue;
    const sameMachine =
      machineNvlDupTokensMatch(record.ma_may, maMay) ||
      machineNvlDupTokensMatch(record.ten_may, tenMay) ||
      machineNvlDupTokensMatch(record.ma_may, tenMay) ||
      machineNvlDupTokensMatch(record.ten_may, maMay);
    if (sameMachine) return record;
  }
  return null;
}

function parseDowntimeTime(value: unknown) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return '';
  const match = trimmed.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return trimmed;
  const hour = Math.min(23, Math.max(0, Number(match[1])));
  const minute = Math.min(59, Math.max(0, Number(match[2])));
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function calcDowntimeMinutes(start: string, end: string) {
  if (!start || !end) return null;
  const startMatch = start.match(/^(\d{1,2}):(\d{2})/);
  const endMatch = end.match(/^(\d{1,2}):(\d{2})/);
  if (!startMatch || !endMatch) return null;

  const startMinutes = Number(startMatch[1]) * 60 + Number(startMatch[2]);
  let endMinutes = Number(endMatch[1]) * 60 + Number(endMatch[2]);
  if (endMinutes < startMinutes) endMinutes += 24 * 60;

  const diff = endMinutes - startMinutes;
  return Number.isFinite(diff) && diff >= 0 ? Math.round(diff * 100) / 100 : null;
}

function generateMachineDowntimeSlipCode() {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const time =
    String(now.getHours()).padStart(2, '0') +
    String(now.getMinutes()).padStart(2, '0') +
    String(now.getSeconds()).padStart(2, '0');
  return `BDM-${date}-${time}`;
}

function parseMachineDowntimeLine(source: unknown, index: number) {
  if (!source || typeof source !== 'object') return null;
  const record = source as Record<string, unknown>;
  const thoi_gian_bat_dau = parseDowntimeTime(
    record.thoi_gian_bat_dau ?? record.thoiGianBatDau ?? record.startTime
  );
  const thoi_gian_chay_lai = parseDowntimeTime(
    record.thoi_gian_chay_lai ?? record.thoiGianChayLai ?? record.restartTime
  );
  const ly_do_dung_may = String(record.ly_do_dung_may ?? record.lyDo ?? record.reason ?? '').trim();
  const so_cuon_anh_huong = parseMixingNumber(
    record.so_cuon_anh_huong ?? record.soCuon ?? record.rollsAffected
  );
  const nguoi_xac_nhan = String(record.nguoi_xac_nhan ?? record.confirmedBy ?? '').trim();
  const ghi_chu = String(record.ghi_chu ?? record.note ?? '').trim();
  const providedMinutes = parseMixingNumber(
    record.tong_thoi_gian_dung_phut ?? record.downtimeMinutes ?? record.totalMinutes
  );
  const computedMinutes = calcDowntimeMinutes(thoi_gian_bat_dau, thoi_gian_chay_lai);
  const tong_thoi_gian_dung_phut =
    providedMinutes !== null ? providedMinutes : computedMinutes !== null ? computedMinutes : null;

  if (!thoi_gian_bat_dau && !thoi_gian_chay_lai && !ly_do_dung_may && so_cuon_anh_huong === null) {
    return null;
  }

  return {
    stt: Number(record.stt ?? index + 1) || index + 1,
    thoi_gian_bat_dau,
    thoi_gian_chay_lai,
    tong_thoi_gian_dung_phut: tong_thoi_gian_dung_phut ?? 0,
    ly_do_dung_may,
    so_cuon_anh_huong: so_cuon_anh_huong ?? 0,
    nguoi_xac_nhan,
    ghi_chu
  };
}

function parseMachineDowntimeBody(body: unknown): { error: string } | { record: Record<string, unknown> } {
  const source = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const ngay = String(source.ngay ?? '').trim();
  const ca = String(source.ca ?? '').trim();
  const ma_may = String(source.ma_may ?? source.machineCode ?? '').trim();
  const ten_may = String(source.ten_may ?? source.machineName ?? '').trim();

  if (!ngay) return { error: 'Vui lòng chọn ngày.' };
  if (!ca) return { error: 'Vui lòng chọn ca.' };
  if (!ma_may && !ten_may) return { error: 'Vui lòng chọn máy.' };

  const rawLines = source.chi_tiet ?? source.lines ?? source.items;
  const list = Array.isArray(rawLines) ? rawLines : [];
  const chi_tiet = list
    .map((line, index) => parseMachineDowntimeLine(line, index))
    .filter((line): line is NonNullable<typeof line> => Boolean(line));

  if (chi_tiet.length === 0) {
    return { error: 'Vui lòng nhập ít nhất một dòng dừng máy.' };
  }

  for (const line of chi_tiet) {
    if (!line.thoi_gian_bat_dau || !line.thoi_gian_chay_lai) {
      return { error: `Dòng ${line.stt}: vui lòng nhập thời gian bắt đầu dừng và thời gian chạy lại.` };
    }
    if (!line.ly_do_dung_may) {
      return { error: `Dòng ${line.stt}: vui lòng nhập lý do dừng máy.` };
    }
  }

  const tong_thoi_gian_dung_phut =
    Math.round(chi_tiet.reduce((sum, line) => sum + (line.tong_thoi_gian_dung_phut ?? 0), 0) * 100) / 100;
  const tong_cuon_anh_huong =
    Math.round(chi_tiet.reduce((sum, line) => sum + (line.so_cuon_anh_huong ?? 0), 0) * 100) / 100;

  const so_phieu =
    String(source.so_phieu ?? source.slipCode ?? '').trim() || generateMachineDowntimeSlipCode();

  return {
    record: {
      so_phieu,
      ngay,
      ca,
      ma_may: ma_may || null,
      ten_may: ten_may || null,
      nguoi_lap: String(source.nguoi_lap ?? source.preparedBy ?? '').trim() || null,
      lenh_sx_lien_quan: String(source.lenh_sx_lien_quan ?? source.productionOrder ?? '').trim() || null,
      tong_thoi_gian_dung_phut,
      tong_cuon_anh_huong,
      ghi_chu_chung: String(source.ghi_chu_chung ?? source.note ?? '').trim() || null,
      chi_tiet,
      nguoi_lap_ky: String(source.nguoi_lap_ky ?? '').trim() || null,
      truong_ca_ky: String(source.truong_ca_ky ?? '').trim() || null,
      bo_phan_ky: String(source.bo_phan_ky ?? '').trim() || null
    }
  };
}

function machineDowntimeWriteError(error: { code?: string; message?: string }) {
  if (isMissingTableError(error)) {
    return `Bảng ${SUPABASE_MACHINE_DOWNTIME_TABLE} chưa tồn tại. Hãy chạy supabase-phieu-bao-dung-may.sql.`;
  }
  if (isMissingColumnError(error)) {
    return `Bảng ${SUPABASE_MACHINE_DOWNTIME_TABLE} đang thiếu cột (${error.message}). Hãy chạy supabase-phieu-bao-dung-may.sql.`;
  }
  return `Không thể lưu phiếu báo dừng máy. ${error.message || ''}`.trim();
}

function generateShiftHandoverCode() {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const time =
    String(now.getHours()).padStart(2, '0') +
    String(now.getMinutes()).padStart(2, '0') +
    String(now.getSeconds()).padStart(2, '0');
  return `BGC-${date}-${time}`;
}

function parseShiftHandoverLine(source: unknown, index: number) {
  if (!source || typeof source !== 'object') return null;
  const record = source as Record<string, unknown>;
  const noi_dung = String(record.noi_dung ?? record.content ?? '').trim();
  const muc_do = String(record.muc_do ?? record.priority ?? '').trim();
  const nguoi_phu_trach = String(record.nguoi_phu_trach ?? record.assignee ?? '').trim();
  const trang_thai = String(record.trang_thai ?? record.status ?? '').trim();
  const ghi_chu = String(record.ghi_chu ?? record.note ?? '').trim();

  if (!noi_dung && !muc_do && !nguoi_phu_trach && !trang_thai && !ghi_chu) return null;

  return {
    stt: Number(record.stt ?? index + 1) || index + 1,
    noi_dung,
    muc_do,
    nguoi_phu_trach,
    trang_thai,
    ghi_chu
  };
}

function parseShiftHandoverNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(String(value).trim().replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(num) ? num : null;
}

function parseShiftHandoverProductLine(source: unknown, index: number) {
  if (!source || typeof source !== 'object') return null;
  const record = source as Record<string, unknown>;
  const ma_hang = String(record.ma_hang ?? record.productCode ?? record.ma_sp ?? '').trim();
  const thanh_pham = String(record.thanh_pham ?? record.productName ?? record.ten_sp ?? '').trim();
  const du_kien_tra_kho = parseShiftHandoverNumber(record.du_kien_tra_kho ?? record.plannedReturn);
  const so_luong = parseShiftHandoverNumber(record.so_luong ?? record.quantity);
  const trong_luong_cuon = parseShiftHandoverNumber(record.trong_luong_cuon ?? record.rollWeight);
  const dinh_muc_nhua = parseShiftHandoverNumber(record.dinh_muc_nhua ?? record.resinNorm);
  const tong_tl_dm =
    parseShiftHandoverNumber(record.tong_tl_dm ?? record.totalNormWeight) ??
    (so_luong !== null && dinh_muc_nhua !== null
      ? Math.round(so_luong * dinh_muc_nhua * 1000) / 1000
      : null);
  const loi_20cm = String(record.loi_20cm ?? record.defect20 ?? '').trim();
  const loi_30cm = String(record.loi_30cm ?? record.defect30 ?? '').trim();
  if (
    !ma_hang &&
    !thanh_pham &&
    du_kien_tra_kho === null &&
    so_luong === null &&
    trong_luong_cuon === null &&
    dinh_muc_nhua === null &&
    !loi_20cm &&
    !loi_30cm
  ) {
    return null;
  }
  return {
    stt: Number(record.stt ?? index + 1) || index + 1,
    ma_hang,
    thanh_pham,
    du_kien_tra_kho,
    so_luong,
    trong_luong_cuon,
    dinh_muc_nhua,
    tong_tl_dm,
    loi_20cm,
    loi_30cm
  };
}

function parseShiftHandoverScrapLine(source: unknown, index: number) {
  if (!source || typeof source !== 'object') return null;
  const record = source as Record<string, unknown>;
  const ten = String(record.ten ?? record.name ?? record.ten_loi ?? '').trim();
  const so_luong = parseShiftHandoverNumber(record.so_luong ?? record.quantity);
  if (!ten && so_luong === null) return null;
  return {
    stt: Number(record.stt ?? index + 1) || index + 1,
    ten,
    so_luong
  };
}

function parseShiftHandoverKpiLine(source: unknown, index: number) {
  if (!source || typeof source !== 'object') return null;
  const record = source as Record<string, unknown>;
  const chi_tieu = String(record.chi_tieu ?? record.criteria ?? '').trim();
  const sl_dm = parseShiftHandoverNumber(record.sl_dm ?? record.norm);
  const thuc_te = parseShiftHandoverNumber(record.thuc_te ?? record.actual);
  const chenh_lech =
    parseShiftHandoverNumber(record.chenh_lech ?? record.variance) ??
    (sl_dm !== null && thuc_te !== null ? Math.round((thuc_te - sl_dm) * 1000) / 1000 : null);
  if (!chi_tieu && sl_dm === null && thuc_te === null) return null;
  return {
    stt: Number(record.stt ?? index + 1) || index + 1,
    chi_tieu,
    sl_dm,
    thuc_te,
    chenh_lech
  };
}

function parseShiftHandoverNkSxDetail(source: Record<string, unknown>) {
  const nested =
    source.chi_tiet && typeof source.chi_tiet === 'object' && !Array.isArray(source.chi_tiet)
      ? (source.chi_tiet as Record<string, unknown>)
      : {};
  const productSource = Array.isArray(source.thanh_pham)
    ? source.thanh_pham
    : Array.isArray(nested.thanh_pham)
      ? nested.thanh_pham
      : [];
  const scrapSource = Array.isArray(source.hang_loi)
    ? source.hang_loi
    : Array.isArray(nested.hang_loi)
      ? nested.hang_loi
      : [];
  const kpiSource = Array.isArray(source.bao_cao_cuoi_ca)
    ? source.bao_cao_cuoi_ca
    : Array.isArray(nested.bao_cao_cuoi_ca)
      ? nested.bao_cao_cuoi_ca
      : [];

  return {
    loai: 'nk_sx',
    gio_tu: String(source.gio_tu ?? nested.gio_tu ?? '').trim() || null,
    gio_den: String(source.gio_den ?? nested.gio_den ?? '').trim() || null,
    thanh_pham: productSource
      .map((line, index) => parseShiftHandoverProductLine(line, index))
      .filter((line): line is NonNullable<typeof line> => Boolean(line)),
    hang_loi: scrapSource
      .map((line, index) => parseShiftHandoverScrapLine(line, index))
      .filter((line): line is NonNullable<typeof line> => Boolean(line)),
    bao_cao_cuoi_ca: kpiSource
      .map((line, index) => parseShiftHandoverKpiLine(line, index))
      .filter((line): line is NonNullable<typeof line> => Boolean(line))
  };
}

function parseShiftHandoverBody(body: unknown): { error: string } | { record: Record<string, unknown> } {
  const source = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const ngay = String(source.ngay ?? '').trim();
  const ca_giao = String(source.ca_giao ?? source.shift ?? '').trim();
  const ca_nhan = String(source.ca_nhan ?? source.nextShift ?? '').trim();
  const ma_may = String(source.ma_may ?? source.machineCode ?? '').trim();
  const ten_may = String(source.ten_may ?? source.machineName ?? '').trim();
  const nguoi_giao_ca = String(
    source.nguoi_giao_ca ?? source.nguoi_thuc_hien ?? source.handoverBy ?? source.operators ?? ''
  ).trim();
  const nguoi_nhan_ca = String(source.nguoi_nhan_ca ?? source.receivedBy ?? '').trim();

  if (!ngay) return { error: 'Vui lòng chọn ngày.' };
  if (!ca_giao) return { error: 'Vui lòng chọn ca sản xuất.' };
  if (!nguoi_giao_ca) return { error: 'Vui lòng nhập người thực hiện.' };

  const nestedDetail =
    source.chi_tiet && typeof source.chi_tiet === 'object' && !Array.isArray(source.chi_tiet)
      ? (source.chi_tiet as Record<string, unknown>)
      : null;
  const isNkSx =
    source.loai === 'nk_sx' ||
    nestedDetail?.loai === 'nk_sx' ||
    Array.isArray(source.thanh_pham) ||
    Array.isArray(source.hang_loi) ||
    Array.isArray(source.bao_cao_cuoi_ca) ||
    Array.isArray(nestedDetail?.thanh_pham);

  const rawLegacyLines = source.chi_tiet ?? source.lines ?? source.items;
  const chi_tiet = isNkSx
    ? parseShiftHandoverNkSxDetail(source)
    : (Array.isArray(rawLegacyLines) ? rawLegacyLines : [])
        .map((line, index) => parseShiftHandoverLine(line, index))
        .filter((line): line is NonNullable<typeof line> => Boolean(line));

  const so_phieu = String(source.so_phieu ?? source.slipCode ?? '').trim() || generateShiftHandoverCode();

  return {
    record: {
      so_phieu,
      ngay,
      ca_giao,
      ca_nhan: ca_nhan || null,
      ma_may: ma_may || null,
      ten_may: ten_may || null,
      nguoi_giao_ca,
      nguoi_nhan_ca: nguoi_nhan_ca || null,
      tinh_hinh_san_xuat: String(source.tinh_hinh_san_xuat ?? source.productionStatus ?? '').trim() || null,
      san_luong_dat_duoc: String(source.san_luong_dat_duoc ?? source.output ?? '').trim() || null,
      tinh_trang_may_moc: String(source.tinh_trang_may_moc ?? source.machineStatus ?? '').trim() || null,
      ton_kho_cuoi_ca: String(source.ton_kho_cuoi_ca ?? source.endingStock ?? '').trim() || null,
      ghi_chu_chung: String(source.ghi_chu_chung ?? source.note ?? '').trim() || null,
      chi_tiet,
      nguoi_giao_ky: String(source.nguoi_giao_ky ?? '').trim() || null,
      nguoi_nhan_ky: String(source.nguoi_nhan_ky ?? '').trim() || null
    }
  };
}

function shiftHandoverWriteError(error: { code?: string; message?: string }) {
  if (isMissingTableError(error)) {
    return `Bảng ${SUPABASE_SHIFT_HANDOVER_TABLE} chưa tồn tại. Hãy chạy supabase-phieu-giao-ca.sql.`;
  }
  if (isMissingColumnError(error)) {
    return `Bảng ${SUPABASE_SHIFT_HANDOVER_TABLE} đang thiếu cột (${error.message}). Hãy chạy supabase-phieu-giao-ca.sql.`;
  }
  return `Không thể lưu phiếu giao ca. ${error.message || ''}`.trim();
}

function normalizeBbLyDoToken(value: unknown) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function buildBbLyDoStableKey(input: {
  ngay?: string | null;
  ca?: string | null;
  may?: string | null;
  maLenh?: string | null;
  maSp?: string | null;
}) {
  const maSp = String(input.maSp || '')
    .trim()
    .replace(/[\s\u00A0\u1680\u2000-\u200B\u202F\u205F\u3000\uFEFF]+/g, '')
    .toUpperCase();
  return [
    String(input.ngay || '').trim(),
    normalizeBbLyDoToken(input.ca),
    normalizeBbLyDoToken(input.may),
    normalizeBbLyDoToken(input.maLenh),
    maSp
  ].join('|');
}

function parseBbBaoCaoLyDoItem(source: unknown) {
  if (!source || typeof source !== 'object') return null;
  const row = source as Record<string, unknown>;
  const ngay = String(row.ngay ?? row.date ?? '').trim();
  const ca = String(row.ca ?? row.shift ?? '').trim();
  const may = String(row.may ?? row.machine ?? '').trim();
  const ma_lenh = String(row.ma_lenh ?? row.maLenh ?? row.orderCode ?? '').trim();
  const ma_sp = String(row.ma_sp ?? row.maSp ?? row.productCode ?? '').trim();
  if (!ngay || !ma_sp) return null;
  const ly_do = String(row.ly_do ?? row.lyDo ?? '').trim();
  const ghi_chu = String(row.ghi_chu ?? row.ghiChu ?? row.note ?? '').trim();
  const khoa_on_dinh =
    String(row.khoa_on_dinh ?? row.stableKey ?? '').trim() ||
    buildBbLyDoStableKey({ ngay, ca, may, maLenh: ma_lenh, maSp: ma_sp });
  return {
    khoa_on_dinh,
    ngay,
    ca,
    may,
    ma_lenh,
    ma_sp,
    ten_sp: String(row.ten_sp ?? row.tenSp ?? row.productName ?? '').trim() || null,
    group_key: String(row.group_key ?? row.groupKey ?? '').trim() || null,
    line_key: String(row.line_key ?? row.lineKey ?? '').trim() || null,
    ly_do,
    ghi_chu
  };
}

function bbBaoCaoLyDoWriteError(error: { code?: string; message?: string }) {
  if (isMissingTableError(error)) {
    return `Bảng ${SUPABASE_BB_BAO_CAO_LY_DO_TABLE} chưa tồn tại. Hãy chạy supabase-bb-bao-cao-ly-do.sql trên Supabase.`;
  }
  if (isMissingColumnError(error)) {
    return `Bảng ${SUPABASE_BB_BAO_CAO_LY_DO_TABLE} đang thiếu cột (${error.message}). Hãy chạy supabase-bb-bao-cao-ly-do.sql.`;
  }
  return `Không thể lưu lý do giải trình BB. ${error.message || ''}`.trim();
}

function normalizeBbPhanTichToken(value: unknown) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function buildBbPhanTichStableKey(input: {
  ngay?: string | null;
  ca?: string | null;
  may?: string | null;
  maLenh?: string | null;
}) {
  return [
    String(input.ngay || '').trim(),
    normalizeBbPhanTichToken(input.ca),
    normalizeBbPhanTichToken(input.may),
    normalizeBbPhanTichToken(input.maLenh)
  ].join('|');
}

function parseBbPhanTichDanhGiaItem(source: unknown) {
  if (!source || typeof source !== 'object') return null;
  const row = source as Record<string, unknown>;
  const ngay = String(row.ngay ?? row.date ?? '').trim();
  const ca = String(row.ca ?? row.shift ?? '').trim();
  const may = String(row.may ?? row.machine ?? '').trim();
  const ma_lenh = String(row.ma_lenh ?? row.maLenh ?? row.orderCode ?? '').trim();
  if (!ngay || !ma_lenh) return null;
  const noi_dung = String(row.noi_dung ?? row.noiDung ?? row.content ?? row.phanTich ?? '').trim();
  const khoa_on_dinh =
    String(row.khoa_on_dinh ?? row.stableKey ?? '').trim() ||
    buildBbPhanTichStableKey({ ngay, ca, may, maLenh: ma_lenh });
  return {
    khoa_on_dinh,
    ngay,
    ca,
    may,
    ma_lenh,
    group_key: String(row.group_key ?? row.groupKey ?? ma_lenh).trim() || null,
    noi_dung,
    nguoi_lap: String(row.nguoi_lap ?? row.nguoiLap ?? row.createdBy ?? '').trim() || null
  };
}

function bbPhanTichDanhGiaWriteError(error: { code?: string; message?: string }) {
  if (isMissingTableError(error)) {
    return `Bảng ${SUPABASE_BB_PHAN_TICH_DANH_GIA_TABLE} chưa tồn tại. Hãy chạy supabase-bb-phan-tich-danh-gia.sql trên Supabase.`;
  }
  if (isMissingColumnError(error)) {
    return `Bảng ${SUPABASE_BB_PHAN_TICH_DANH_GIA_TABLE} đang thiếu cột (${error.message}). Hãy chạy supabase-bb-phan-tich-danh-gia.sql.`;
  }
  return `Không thể lưu phân tích đánh giá BB. ${error.message || ''}`.trim();
}

function buildBbBaoCaoTinhToanStableKey(input: {
  ngayTu?: string;
  ngayDen?: string;
  ca?: string;
  may?: string;
  nguonSanLuong?: string;
  includeAllMachines?: boolean;
  maLenhFilter?: string[];
}) {
  const orders = [...new Set((input.maLenhFilter || []).map(code => String(code || '').trim().toUpperCase()).filter(Boolean))]
    .sort()
    .join(',');
  return [
    String(input.ngayTu || '').trim(),
    String(input.ngayDen || '').trim(),
    String(input.ca || 'all').trim().toUpperCase() || 'ALL',
    String(input.may || 'all').trim().toUpperCase() || 'ALL',
    String(input.nguonSanLuong || 'acceptance').trim().toLowerCase(),
    input.includeAllMachines ? '1' : '0',
    orders || '*'
  ].join('|');
}

function parseBbBaoCaoTinhToanBody(source: unknown) {
  if (!source || typeof source !== 'object') return null;
  const row = source as Record<string, unknown>;
  const ngay_tu = String(row.ngay_tu ?? row.ngayTu ?? row.dateFrom ?? '').trim();
  const ngay_den = String(row.ngay_den ?? row.ngayDen ?? row.dateTo ?? '').trim();
  const ca = String(row.ca ?? row.shift ?? 'all').trim() || 'all';
  const may = String(row.may ?? row.machine ?? 'all').trim() || 'all';
  const nguon_san_luong =
    String(row.nguon_san_luong ?? row.nguonSanLuong ?? row.sanLuongSource ?? 'acceptance').trim().toLowerCase() ||
    'acceptance';
  const include_all_machines = Boolean(row.include_all_machines ?? row.includeAllMachines ?? false);
  const ma_lenh_filter = Array.isArray(row.ma_lenh_filter ?? row.maLenhFilter ?? row.orderCodes)
    ? [...new Set(
        ((row.ma_lenh_filter ?? row.maLenhFilter ?? row.orderCodes) as unknown[])
          .map(code => String(code || '').trim())
          .filter(Boolean)
      )].sort()
    : [];
  const payload = row.payload;
  if (!payload || typeof payload !== 'object') return null;
  const khoa_on_dinh =
    String(row.khoa_on_dinh ?? row.stableKey ?? '').trim() ||
    buildBbBaoCaoTinhToanStableKey({
      ngayTu: ngay_tu,
      ngayDen: ngay_den,
      ca,
      may,
      nguonSanLuong: nguon_san_luong,
      includeAllMachines: include_all_machines,
      maLenhFilter: ma_lenh_filter
    });
  return {
    khoa_on_dinh,
    ngay_tu,
    ngay_den,
    ca,
    may,
    nguon_san_luong,
    include_all_machines,
    ma_lenh_filter,
    payload,
    calculated_by: String(row.calculated_by ?? row.calculatedBy ?? '').trim() || null
  };
}

function bbBaoCaoTinhToanWriteError(error: { code?: string; message?: string }) {
  if (isMissingTableError(error)) {
    return `Bảng ${SUPABASE_BB_BAO_CAO_TINH_TOAN_TABLE} chưa tồn tại. Hãy chạy supabase-bb-bao-cao-tinh-toan.sql trên Supabase.`;
  }
  if (isMissingColumnError(error)) {
    return `Bảng ${SUPABASE_BB_BAO_CAO_TINH_TOAN_TABLE} đang thiếu cột (${error.message}). Hãy chạy supabase-bb-bao-cao-tinh-toan.sql.`;
  }
  return `Không thể lưu bản tính toán báo cáo BB. ${error.message || ''}`.trim();
}

function generateMachineRunLogCode() {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const time =
    String(now.getHours()).padStart(2, '0') +
    String(now.getMinutes()).padStart(2, '0') +
    String(now.getSeconds()).padStart(2, '0');
  return `NKC-${date}-${time}`;
}

function parseMachineRunLogLine(source: unknown, index: number) {
  if (!source || typeof source !== 'object') return null;
  const record = source as Record<string, unknown>;
  const thoi_diem_ghi = parseDowntimeTime(record.thoi_diem_ghi ?? record.logTime);
  const nhiet_do_gia_nhiet = parseMixingNumber(record.nhiet_do_gia_nhiet ?? record.temperature);
  const toc_do_thuc = parseMixingNumber(record.toc_do_thuc ?? record.actualSpeed);
  const toc_do_dinh_muc = parseMixingNumber(record.toc_do_dinh_muc ?? record.standardSpeed);
  const so_cuon_ra = parseMixingNumber(record.so_cuon_ra ?? record.rollsProduced);
  const thoi_gian_dung_phut = parseMixingNumber(record.thoi_gian_dung_phut ?? record.downtimeMinutes);
  const ly_do = String(record.ly_do ?? record.reason ?? '').trim();
  const nguoi_ghi = String(record.nguoi_ghi ?? record.recordedBy ?? '').trim();

  if (
    !thoi_diem_ghi &&
    nhiet_do_gia_nhiet === null &&
    toc_do_thuc === null &&
    so_cuon_ra === null &&
    thoi_gian_dung_phut === null &&
    !ly_do
  ) {
    return null;
  }

  return {
    stt: Number(record.stt ?? index + 1) || index + 1,
    thoi_diem_ghi,
    nhiet_do_gia_nhiet,
    toc_do_thuc,
    toc_do_dinh_muc,
    so_cuon_ra: so_cuon_ra ?? 0,
    thoi_gian_dung_phut: thoi_gian_dung_phut ?? 0,
    ly_do,
    nguoi_ghi
  };
}

function parseMachineRunLogBody(body: unknown): { error: string } | { record: Record<string, unknown> } {
  const source = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const ngay = String(source.ngay ?? '').trim();
  const ca = String(source.ca ?? '').trim();
  const ma_may = String(source.ma_may ?? source.machineCode ?? '').trim();
  const ten_may = String(source.ten_may ?? source.machineName ?? '').trim();

  if (!ngay) return { error: 'Vui lòng chọn ngày sản xuất.' };
  if (!ca) return { error: 'Vui lòng chọn ca.' };
  if (!ma_may && !ten_may) return { error: 'Vui lòng chọn máy.' };

  const rawLines = source.chi_tiet ?? source.lines ?? source.items;
  const list = Array.isArray(rawLines) ? rawLines : [];
  const chi_tiet = list
    .map((line, index) => parseMachineRunLogLine(line, index))
    .filter((line): line is NonNullable<typeof line> => Boolean(line));

  if (chi_tiet.length === 0) {
    return { error: 'Vui lòng nhập ít nhất một dòng nhật ký chạy máy.' };
  }

  for (const line of chi_tiet) {
    if (!line.thoi_diem_ghi) {
      return { error: `Dòng ${line.stt}: vui lòng nhập thời điểm ghi (giờ:phút).` };
    }
  }

  const gio_chay_kh = parseMixingNumber(source.gio_chay_kh ?? source.plannedRunHours) ?? 0;
  const tong_cuon_ra =
    Math.round(chi_tiet.reduce((sum, line) => sum + (line.so_cuon_ra ?? 0), 0) * 100) / 100;
  const tong_thoi_gian_dung_phut =
    Math.round(chi_tiet.reduce((sum, line) => sum + (line.thoi_gian_dung_phut ?? 0), 0) * 100) / 100;

  const plannedMinutes = gio_chay_kh * 60;
  const thoi_gian_chay_thuc_te_phut =
    Math.round(Math.max(0, plannedMinutes - tong_thoi_gian_dung_phut) * 100) / 100;
  const hieu_suat_thoi_gian_pct =
    plannedMinutes > 0 ? Math.round((thoi_gian_chay_thuc_te_phut / plannedMinutes) * 10000) / 100 : null;

  const speedRatios = chi_tiet
    .filter(line => (line.toc_do_dinh_muc ?? 0) > 0 && (line.toc_do_thuc ?? 0) > 0)
    .map(line => (line.toc_do_thuc as number) / (line.toc_do_dinh_muc as number));
  const toc_do_dat_dinh_muc_pct =
    speedRatios.length > 0
      ? Math.round((speedRatios.reduce((sum, ratio) => sum + ratio, 0) / speedRatios.length) * 10000) / 100
      : null;

  const nang_suat_cuon_gio =
    thoi_gian_chay_thuc_te_phut > 0
      ? Math.round((tong_cuon_ra / (thoi_gian_chay_thuc_te_phut / 60)) * 100) / 100
      : null;

  const so_phieu =
    String(source.so_phieu ?? source.slipCode ?? '').trim() || generateMachineRunLogCode();

  return {
    record: {
      so_phieu,
      ngay,
      ca,
      ma_may: ma_may || null,
      ten_may: ten_may || null,
      lenh_sx: String(source.lenh_sx ?? source.productionOrder ?? '').trim() || null,
      ma_san_pham: String(source.ma_san_pham ?? source.productCode ?? '').trim() || null,
      tho_chinh: String(source.tho_chinh ?? source.mainOperator ?? '').trim() || null,
      tho_phu: String(source.tho_phu ?? source.assistantOperator ?? '').trim() || null,
      gio_chay_kh,
      tong_cuon_ra,
      tong_thoi_gian_dung_phut,
      thoi_gian_chay_thuc_te_phut,
      hieu_suat_thoi_gian_pct,
      toc_do_dat_dinh_muc_pct,
      nang_suat_cuon_gio,
      ghi_chu: String(source.ghi_chu ?? source.note ?? '').trim() || null,
      chi_tiet
    }
  };
}

function machineRunLogWriteError(error: { code?: string; message?: string }) {
  if (isMissingTableError(error)) {
    return `Bảng ${SUPABASE_MACHINE_RUN_LOG_TABLE} chưa tồn tại. Hãy chạy supabase-nhat-ky-chay-may.sql.`;
  }
  if (isMissingColumnError(error)) {
    return `Bảng ${SUPABASE_MACHINE_RUN_LOG_TABLE} đang thiếu cột (${error.message}). Hãy chạy supabase-nhat-ky-chay-may.sql.`;
  }
  return `Không thể lưu nhật ký chạy máy. ${error.message || ''}`.trim();
}

function parseAcceptanceNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(String(value).replace(',', '.'));
  return Number.isFinite(num) ? Math.round(num * 100) / 100 : null;
}

function parseAcceptanceReportBody(body: unknown): { error: string } | { record: Record<string, unknown> } {
  const source = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const ngay = String(source.ngay ?? '').trim();
  const ca = String(source.ca ?? '').trim();
  const lan = String(source.lan ?? '').trim();
  const mat_hang = String(source.mat_hang ?? source.product ?? '').trim();
  const loai_vat_tu = String(source.loai_vat_tu ?? 'Thành phẩm').trim();
  const so_luong = parseAcceptanceNumber(source.so_luong ?? source.quantity);
  const trong_luong = parseAcceptanceNumber(source.trong_luong ?? source.weight);

  if (!ngay) return { error: 'Vui lòng chọn ngày.' };
  if (!ca) return { error: 'Vui lòng chọn ca.' };
  if (!lan) return { error: 'Vui lòng nhập lần ghi nhận.' };
  const ma_may = String(source.ma_may ?? source.machineCode ?? '').trim();
  const ten_may = String(source.ten_may ?? source.machineName ?? source.may ?? '').trim();
  if (!ma_may && !ten_may) return { error: 'Vui lòng chọn máy.' };
  if (!mat_hang) return { error: 'Vui lòng nhập mặt hàng.' };
  if (!['Thành phẩm', 'Gia công', 'SP lỗi', 'SP rác'].includes(loai_vat_tu)) {
    return { error: 'Loại vật tư không hợp lệ.' };
  }
  if (so_luong === null || so_luong <= 0) return { error: 'Số lượng phải lớn hơn 0.' };

  const hinh_anh = String(source.hinh_anh ?? source.imageUrl ?? '').trim();
  if (!hinh_anh) return { error: 'Vui lòng chụp hoặc tải ảnh sản lượng.' };

  return {
    record: {
      ngay,
      ca,
      lan,
      gio: String(source.gio ?? '').trim() || null,
      ma_may: ma_may || null,
      ten_may: ten_may || null,
      loai_vat_tu,
      mat_hang,
      don_vi: String(source.don_vi ?? source.unit ?? '').trim() || null,
      so_luong,
      trong_luong,
      don_vi_trong_luong: String(source.don_vi_trong_luong ?? source.weightUnit ?? 'Kg').trim() || 'Kg',
      hinh_anh,
      hinh_anh_public_id: String(source.hinh_anh_public_id ?? source.imagePublicId ?? '').trim() || null
    }
  };
}

function acceptanceReportWriteError(error: { code?: string; message?: string }) {
  if (isMissingTableError(error)) {
    return `Bảng ${SUPABASE_ACCEPTANCE_REPORTS_TABLE} chưa tồn tại. Hãy chạy supabase-bao-cao-nghiem-thu.sql.`;
  }
  if (isMissingColumnError(error)) {
    return `Bảng ${SUPABASE_ACCEPTANCE_REPORTS_TABLE} đang thiếu cột (${error.message}). Hãy chạy supabase-bao-cao-nghiem-thu.sql.`;
  }
  return `Không thể lưu báo cáo sản lượng. ${error.message || ''}`.trim();
}

type SettingWritePayload = {
  code: string;
  name: string;
  startTime: string;
  endTime: string;
  loaiCaiDat: string;
  group: string;
  note: string;
  khungGio: string;
  coreRecord: Record<string, string>;
  fullRecord: Record<string, string>;
};

function parseSettingBody(body: unknown): { error: string } | SettingWritePayload {
  const source = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const code = typeof source.code === 'string' ? source.code.trim() : '';
  const name = typeof source.name === 'string' ? source.name.trim() : '';

  if (!code) return { error: 'Vui lòng nhập mã cài đặt.' };
  if (!name) return { error: 'Vui lòng nhập tên cài đặt.' };

  const normalize24HourTime = (value: unknown) => {
    const raw = typeof value === 'string' ? value.trim() : '';
    const match = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (!match) return '';
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours > 23 || minutes > 59) return '';
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  };
  const startTime = normalize24HourTime(source.startTime);
  const endTime = normalize24HourTime(source.endTime);

  if (!startTime) return { error: 'Giờ bắt đầu phải đúng định dạng 24 giờ HH:mm (00:00–23:59).' };
  if (!endTime) return { error: 'Giờ kết thúc phải đúng định dạng 24 giờ HH:mm (00:00–23:59).' };

  const loaiCaiDat =
    typeof source.loaiCaiDat === 'string' && source.loaiCaiDat.trim()
      ? source.loaiCaiDat.trim()
      : typeof source.group === 'string' && source.group.trim()
        ? source.group.trim()
        : '';

  if (!loaiCaiDat) return { error: 'Vui lòng chọn loại cài đặt (loai_cai_dat).' };

  const group =
    typeof source.group === 'string' ? source.group.trim() || loaiCaiDat : loaiCaiDat;
  const note = typeof source.note === 'string' ? source.note.trim() : '';
  const khungGio =
    typeof source.khungGio === 'string' && source.khungGio.trim()
      ? source.khungGio.trim()
      : `${startTime} - ${endTime}`;

  const coreRecord = {
    hang_muc: name,
    loai_cai_dat: loaiCaiDat,
    khung_gio: khungGio,
    gio_bat_dau: startTime,
    gio_ket_thuc: endTime
  };

  const fullRecord = {
    ...coreRecord,
    ma_cai_dat: code,
    ten_cai_dat: name,
    nhom: group,
    ghi_chu: note
  };

  return {
    code,
    name,
    startTime,
    endTime,
    loaiCaiDat,
    group,
    note,
    khungGio,
    coreRecord,
    fullRecord
  };
}

function settingsWriteErrorMessage(error: { code?: string; message?: string; details?: string }) {
  if (isMissingTableError(error)) {
    return `Bảng ${SUPABASE_SETTINGS_TABLE} chưa tồn tại. Hãy chạy file supabase-cai-dat-thoi-gian.sql trong Supabase SQL Editor.`;
  }
  if (isMissingColumnError(error)) {
    return `Bảng ${SUPABASE_SETTINGS_TABLE} đang thiếu cột (${error.message}). Hãy chạy file supabase-cai-dat-thoi-gian.sql trong Supabase SQL Editor.`;
  }
  return `Không thể lưu cài đặt vào ${SUPABASE_SETTINGS_TABLE}. ${error.message}${error.details ? ` (${error.details})` : ''}`;
}

async function writeSettingRecord(
  client: SupabaseClient,
  payload: SettingWritePayload,
  id?: string
) {
  const { fullRecord, coreRecord, startTime, endTime, note } = payload;
  const write = (record: Record<string, string>) =>
    id
      ? client.from(SUPABASE_SETTINGS_TABLE).update(record).eq('id', id).select('*').single()
      : client.from(SUPABASE_SETTINGS_TABLE).insert(record).select('*').single();

  let { data, error } = await write(fullRecord);

  if (error?.code === 'PGRST204') {
    ({ data, error } = await write({
      ...coreRecord,
      gia_tri: `${startTime} - ${endTime}`,
      ghi_chu: note
    }));
  }

  if (error?.code === 'PGRST204') {
    ({ data, error } = await write(coreRecord));
  }

  return { data, error };
}

function parseOptionalMaterialNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text || text === '-') return null;
  const num = Number(text.replace(',', '.'));
  return Number.isFinite(num) ? num : null;
}

function parseOptionalMaterialDecimalText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw || raw === '-') return null;
  const normalized = raw.replace(',', '.');
  // Validate to avoid sending garbage to Postgres numeric columns.
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null;
  return normalized;
}

function parseMaterialText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isUuidValue(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());
}

function resolveMaterialRowFilter(id: string) {
  const value = id.trim();
  if (!value) return null;
  if (isUuidValue(value)) return { column: 'id' as const, value };
  return { column: 'ma_npl' as const, value };
}

function isMaterialKgUnitValue(value: unknown) {
  return String(value ?? '').trim().toLowerCase() === 'kg';
}

function parseMachineDinhLuong(value: unknown): number | null {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return null;
  const num = Number(raw.replace(',', '.'));
  return Number.isFinite(num) ? num : null;
}

function parseMachineMixingRatios(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .map(item => {
      if (!item || typeof item !== 'object') return null;
      const source = item as Record<string, unknown>;
      const materialCode = String(source.ma_nvl ?? source.materialCode ?? source.code ?? '').trim();
      const materialName = String(source.ten_nvl ?? source.materialName ?? source.name ?? '').trim();
      const rawPercent = String(source.phan_tram ?? source.percent ?? '').trim().replace(',', '.');
      const percent = Number(rawPercent);

      if ((!materialCode && !materialName) || !Number.isFinite(percent) || percent < 0 || percent > 100) {
        return null;
      }

      return {
        ma_nvl: materialCode,
        ten_nvl: materialName,
        phan_tram: Math.round(percent * 100) / 100
      };
    })
    .filter((item): item is { ma_nvl: string; ten_nvl: string; phan_tram: number } => Boolean(item));
}

function parseMachineBody(body: unknown): { error: string } | { record: Record<string, unknown> } {
  const source = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const code = typeof source.code === 'string' ? source.code.trim() : '';
  const name = typeof source.name === 'string' ? source.name.trim() : '';

  if (!code) return { error: 'Vui lòng nhập mã máy.' };
  if (!name) return { error: 'Vui lòng nhập tên máy.' };

  return {
    record: {
      ma_may: code,
      ten_may: name,
      loai_may: typeof source.type === 'string' ? source.type.trim() || 'Chưa phân loại' : 'Chưa phân loại',
      chi_nhanh: typeof source.branch === 'string' ? source.branch.trim() : '',
      vi_tri: typeof source.location === 'string' ? source.location.trim() : '',
      trang_thai: typeof source.status === 'string' ? source.status.trim() || 'Đang dùng' : 'Đang dùng',
      ghi_chu: typeof source.note === 'string' ? source.note.trim() : '',
      dinh_luong: parseMachineDinhLuong(source.dinhLuong),
      ty_le_tron: parseMachineMixingRatios(source.mixingRatios ?? source.ty_le_tron)
    }
  };
}

function machineWriteErrorMessage(error: { code?: string; message?: string }) {
  if (isMissingTableError(error)) {
    return `Bảng ${SUPABASE_MACHINES_TABLE} chưa tồn tại. Hãy chạy file supabase-danh-sach-may.sql trong Supabase SQL Editor.`;
  }
  if (isMissingColumnError(error)) {
    return `Bảng ${SUPABASE_MACHINES_TABLE} đang thiếu cột. Hãy chạy file supabase-danh-sach-may.sql.`;
  }
  return `Không thể lưu máy vào ${SUPABASE_MACHINES_TABLE}. ${error.message}`;
}

function machineKeyFilters(key: string): Array<{ column: string; value: string | number }> {
  const trimmed = key.trim();
  const filters: Array<{ column: string; value: string | number }> = [];

  if (/^\d+$/.test(trimmed)) {
    filters.push({ column: 'id', value: Number(trimmed) });
  }

  filters.push({ column: 'ma_may', value: trimmed });

  if (!filters.some(filter => filter.column === 'id')) {
    filters.push({ column: 'id', value: trimmed });
  }

  return filters;
}

async function updateMachineByKey(key: string, record: Record<string, unknown>) {
  const resolved = await resolveSupabaseClientForTable(SUPABASE_MACHINES_TABLE);
  if (!resolved) {
    return {
      data: null,
      error: {
        code: 'PGRST205',
        message: `Could not find the table 'public.${SUPABASE_MACHINES_TABLE}' in the schema cache`
      }
    };
  }

  let lastError: { code?: string; message?: string } | null = null;

  for (const filter of machineKeyFilters(key)) {
    const { data, error } = await resolved.client
      .from(SUPABASE_MACHINES_TABLE)
      .update(record)
      .eq(filter.column, filter.value)
      .select('*')
      .maybeSingle();

    if (!error && data) {
      return { data, error: null };
    }

    if (error && !isMissingColumnError(error)) {
      lastError = error;
    }
  }

  return { data: null, error: lastError };
}

async function deleteMachineByKey(key: string) {
  const resolved = await resolveSupabaseClientForTable(SUPABASE_MACHINES_TABLE);
  if (!resolved) {
    return {
      data: null,
      error: {
        code: 'PGRST205',
        message: `Could not find the table 'public.${SUPABASE_MACHINES_TABLE}' in the schema cache`
      }
    };
  }

  let lastError: { code?: string; message?: string } | null = null;

  for (const filter of machineKeyFilters(key)) {
    const { data, error } = await resolved.client
      .from(SUPABASE_MACHINES_TABLE)
      .delete()
      .eq(filter.column, filter.value)
      .select('ma_may')
      .maybeSingle();

    if (!error && data) {
      return { data, error: null };
    }

    if (error && !isMissingColumnError(error)) {
      lastError = error;
    }
  }

  return { data: null, error: lastError };
}

type MaterialWritePayload = {
  record: Record<string, string | number | null>;
};

function parseMaterialBody(body: unknown): { error: string } | MaterialWritePayload {
  const source = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const code = parseMaterialText(source.code);
  const name = parseMaterialText(source.name);

  if (!code) return { error: 'Vui lòng nhập mã NPL.' };
  if (!name) return { error: 'Vui lòng nhập tên nguyên phụ liệu.' };

  const record: Record<string, string | number | null> = {
    ma_npl: code,
    ten_npl: name,
    don_vi: parseMaterialText(source.unit) || null,
    tong_trong_luong: parseOptionalMaterialDecimalText(source.totalWeight),
    trong_luong_nhua: parseOptionalMaterialDecimalText(source.plasticWeight),
    trong_luong_tui: parseOptionalMaterialDecimalText(source.bagWeight),
    trong_luong_loi: parseOptionalMaterialDecimalText(source.coreWeight),
    kho_cuon: parseOptionalMaterialDecimalText(source.rollWidth),
    chieu_dai_don_vi: parseOptionalMaterialDecimalText(source.unitLength),
    ton_dau_ky: parseOptionalMaterialNumber(source.openingStock),
    nhap_trong_ky: parseOptionalMaterialNumber(source.inbound),
    xuat_trong_ky: parseOptionalMaterialNumber(source.outbound),
    ten_kho: parseMaterialText(source.warehouse ?? source.ten_kho) || null
  };

  return { record };
}

function materialWriteErrorMessage(error: { code?: string; message?: string; details?: string }) {
  if (isMissingTableError(error)) {
    return `Bảng ${SUPABASE_MATERIALS_TABLE} chưa tồn tại trên Supabase.`;
  }
  if (isMissingColumnError(error)) {
    return `Bảng ${SUPABASE_MATERIALS_TABLE} đang thiếu cột (${error.message}).`;
  }
  return `Không thể lưu nguyên phụ liệu vào ${SUPABASE_MATERIALS_TABLE}. ${error.message}${error.details ? ` (${error.details})` : ''}`;
}

type WarehouseSlipLineInput = {
  code: string;
  name: string;
  unit: string;
  quantity: number;
  documentQuantity?: number;
  unitPrice: number;
  lineAmount: number;
  sourceInboundLineId?: string;
  sourceInboundSlipCode?: string;
  damagedReportRowId?: string;
};

type NvlInboundLot = {
  id: string;
  ma_phieu: string;
  ngay_phieu: string;
  ma_npl: string;
  ten_npl: string;
  don_vi: string;
  don_gia: number;
  so_luong_nhap: number;
  so_luong_da_xuat: number;
  so_luong_con: number;
};

function roundWarehouseMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function roundWarehouseQty(value: number) {
  return Math.round(value * 1000) / 1000;
}

function resolveWarehouseMonthRange(thangOrNgay: string): { from: string; to: string; thang: string } | null {
  const raw = String(thangOrNgay || '').trim();
  let year = 0;
  let month = 0;
  const monthMatch = raw.match(/^(\d{4})-(\d{2})$/);
  const dateMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (monthMatch) {
    year = Number(monthMatch[1]);
    month = Number(monthMatch[2]);
  } else if (dateMatch) {
    year = Number(dateMatch[1]);
    month = Number(dateMatch[2]);
  } else {
    const now = new Date();
    year = now.getFullYear();
    month = now.getMonth() + 1;
  }
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return null;
  const thang = `${year}-${String(month).padStart(2, '0')}`;
  const lastDay = new Date(year, month, 0).getDate();
  return {
    thang,
    from: `${thang}-01`,
    to: `${thang}-${String(lastDay).padStart(2, '0')}`
  };
}

/** Tính BQ gia quyền từ các dòng nhập đã có đơn giá. */
function aggregateInboundAvgPrice(rows: any[]): { don_gia: number; so_dong: number; tong_sl: number } {
  let amount = 0;
  let qty = 0;
  let soDong = 0;
  for (const row of rows || []) {
    const donGia = Number(row.don_gia);
    const soLuong = Number(row.so_luong);
    if (!Number.isFinite(donGia) || donGia <= 0) continue;
    if (!Number.isFinite(soLuong) || soLuong <= 0) continue;
    amount += soLuong * donGia;
    qty += soLuong;
    soDong += 1;
  }
  return {
    don_gia: qty > 0 ? roundWarehouseMoney(amount / qty) : 0,
    so_dong: soDong,
    tong_sl: roundWarehouseQty(qty)
  };
}

/** Giá TB nhập NVL: ưu tiên trong tháng phiếu; không có thì lấy toàn bộ lịch sử nhập. */
async function buildNvlInboundAvgPriceForMonth(
  maNpl: string,
  thangOrNgay?: string
): Promise<{
  error?: string;
  don_gia: number;
  thang: string;
  so_dong: number;
  tong_sl: number;
  price_source: 'month' | 'all' | 'none';
}> {
  const code = String(maNpl || '').trim();
  const range = resolveWarehouseMonthRange(thangOrNgay || '');
  if (!code || !range) {
    return { don_gia: 0, thang: range?.thang || '', so_dong: 0, tong_sl: 0, price_source: 'none' };
  }
  if (!supabase) {
    return { don_gia: 0, thang: range.thang, so_dong: 0, tong_sl: 0, price_source: 'none' };
  }

  const { data, error } = await supabase
    .from(SUPABASE_WAREHOUSE_MOVEMENTS_TABLE)
    .select('don_gia, so_luong, ngay_phieu, loai_phieu, loai_kho, ma_npl')
    .ilike('ma_npl', code)
    .eq('loai_phieu', 'nhap')
    .or('loai_kho.eq.nvl,loai_kho.is.null')
    .gte('ngay_phieu', range.from)
    .lte('ngay_phieu', range.to);

  if (error) {
    console.error('Supabase gia-tb-nhap query error:', error);
    return {
      error: `Không thể tải giá nhập trung bình. ${error.message}`,
      don_gia: 0,
      thang: range.thang,
      so_dong: 0,
      tong_sl: 0,
      price_source: 'none'
    };
  }

  let agg = aggregateInboundAvgPrice(data || []);
  let priceSource: 'month' | 'all' | 'none' = agg.don_gia > 0 ? 'month' : 'none';

  if (agg.don_gia <= 0) {
    const { data: allData, error: allError } = await supabase
      .from(SUPABASE_WAREHOUSE_MOVEMENTS_TABLE)
      .select('don_gia, so_luong, ngay_phieu, loai_phieu, loai_kho, ma_npl')
      .ilike('ma_npl', code)
      .eq('loai_phieu', 'nhap')
      .or('loai_kho.eq.nvl,loai_kho.is.null');

    if (allError) {
      console.error('Supabase gia-tb-nhap fallback query error:', allError);
    } else {
      agg = aggregateInboundAvgPrice(allData || []);
      if (agg.don_gia > 0) priceSource = 'all';
    }
  }

  return {
    don_gia: agg.don_gia,
    thang: range.thang,
    so_dong: agg.so_dong,
    tong_sl: agg.tong_sl,
    price_source: priceSource
  };
}

async function buildNvlInboundLots(
  maNpl: string,
  excludeSlipCode?: string
): Promise<{ error?: string; lots: NvlInboundLot[] }> {
  if (!supabase) return { lots: [] };
  const code = String(maNpl || '').trim();
  if (!code) return { lots: [] };

  const { data: inboundRows, error: inboundError } = await supabase
    .from(SUPABASE_WAREHOUSE_MOVEMENTS_TABLE)
    .select('id, ma_phieu, ngay_phieu, ma_npl, ten_npl, don_vi, don_gia, so_luong, loai_phieu, loai_kho')
    .eq('ma_npl', code)
    .eq('loai_phieu', 'nhap')
    .or('loai_kho.eq.nvl,loai_kho.is.null')
    .order('ngay_phieu', { ascending: true })
    .order('created_at', { ascending: true });

  if (inboundError) {
    console.error('Supabase lo-ton inbound query error:', inboundError);
    return { error: `Không thể tải lô nhập. ${inboundError.message}`, lots: [] };
  }

  const { data: outboundRows, error: outboundError } = await supabase
    .from(SUPABASE_WAREHOUSE_MOVEMENTS_TABLE)
    .select('id, ma_phieu, so_luong, id_dong_nhap_nguon, loai_phieu, loai_kho')
    .eq('ma_npl', code)
    .eq('loai_phieu', 'xuat')
    .or('loai_kho.eq.nvl,loai_kho.is.null')
    .eq('treo', false)
    .not('id_dong_nhap_nguon', 'is', null);

  if (outboundError) {
    if (isMissingColumnError(outboundError)) {
      return {
        error:
          'Thiếu cột id_dong_nhap_nguon. Hãy chạy supabase-phieu-xuat-nhap-kho-lo-ton.sql trong Supabase SQL Editor.',
        lots: []
      };
    }
    console.error('Supabase lo-ton outbound query error:', outboundError);
    return { error: `Không thể tải xuất theo lô. ${outboundError.message}`, lots: [] };
  }

  const exclude = String(excludeSlipCode || '').trim();
  const consumedByLot = new Map<string, number>();
  for (const row of outboundRows || []) {
    if (exclude && String(row.ma_phieu || '').trim() === exclude) continue;
    const lotId = String(row.id_dong_nhap_nguon || '').trim();
    if (!lotId) continue;
    const qty = Number(row.so_luong);
    if (!Number.isFinite(qty) || qty <= 0) continue;
    consumedByLot.set(lotId, roundWarehouseQty((consumedByLot.get(lotId) || 0) + qty));
  }

  const lots: NvlInboundLot[] = [];
  for (const row of inboundRows || []) {
    const id = String(row.id || '').trim();
    if (!id) continue;
    const so_luong_nhap = roundWarehouseQty(Number(row.so_luong) || 0);
    if (so_luong_nhap <= 0) continue;
    const so_luong_da_xuat = roundWarehouseQty(consumedByLot.get(id) || 0);
    const so_luong_con = roundWarehouseQty(so_luong_nhap - so_luong_da_xuat);
    if (so_luong_con <= 0) continue;
    lots.push({
      id,
      ma_phieu: String(row.ma_phieu || '').trim(),
      ngay_phieu: String(row.ngay_phieu || '').trim(),
      ma_npl: String(row.ma_npl || '').trim() || code,
      ten_npl: String(row.ten_npl || '').trim(),
      don_vi: String(row.don_vi || '').trim(),
      don_gia: roundWarehouseMoney(Number(row.don_gia) || 0),
      so_luong_nhap,
      so_luong_da_xuat,
      so_luong_con
    });
  }

  return { lots };
}

async function validateNvlExportLots(
  items: WarehouseSlipLineInput[],
  excludeSlipCode?: string
): Promise<{ error: string } | null> {
  const requestedByLot = new Map<string, { qty: number; code: string; price: number; slipCode?: string }>();

  for (const item of items) {
    const lotId = String(item.sourceInboundLineId || '').trim();
    // Lô nhập / giá không bắt buộc — chỉ validate khi đã chọn lô.
    if (!lotId) continue;
    const current = requestedByLot.get(lotId) || {
      qty: 0,
      code: item.code,
      price: item.unitPrice,
      slipCode: item.sourceInboundSlipCode
    };
    current.qty = roundWarehouseQty(current.qty + item.quantity);
    requestedByLot.set(lotId, current);
  }

  for (const [lotId, request] of requestedByLot) {
    const built = await buildNvlInboundLots(request.code, excludeSlipCode);
    if (built.error) return { error: built.error };
    const lot = built.lots.find(item => item.id === lotId);
    if (!lot) {
      return { error: `Lô nhập của ${request.code} không còn tồn hoặc không hợp lệ.` };
    }
    // Giá xuất có thể sửa tay (BQ nhập chỉ là gợi ý) — không bắt khớp giá lô.
    if (request.qty > lot.so_luong_con + 0.0005) {
      return {
        error: `Xuất ${request.qty} vượt tồn lô ${lot.ma_phieu} còn ${lot.so_luong_con} (${request.code}).`
      };
    }
  }

  return null;
}

function parseWarehouseSlipType(value: unknown): 'nhap' | 'xuat' | null {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'nhap' || normalized === 'import' || normalized === 'in') return 'nhap';
  if (normalized === 'xuat' || normalized === 'export' || normalized === 'out') return 'xuat';
  return null;
}

type WarehouseStorageType =
  | 'nvl'
  | 'san_pham'
  | 'tai_che'
  | 'hang_hong'
  | 'hang_hoa'
  | 'cong_cu_dung_cu'
  | 'gia_cong';

function parseWarehouseStorageType(value: unknown): WarehouseStorageType | null {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'nvl' || normalized === 'kho_nvl' || normalized === 'material') return 'nvl';
  if (normalized === 'san_pham' || normalized === 'san-pham' || normalized === 'product' || normalized === 'sp') {
    return 'san_pham';
  }
  if (
    normalized === 'tai_che' ||
    normalized === 'tai-che' ||
    normalized === 'tai che' ||
    normalized === 'recycle' ||
    normalized === 'kho_tai_che' ||
    normalized === 'kho-tai-che'
  ) {
    return 'tai_che';
  }
  if (
    normalized === 'hang_hong' ||
    normalized === 'hang-hong' ||
    normalized === 'hang hong' ||
    normalized === 'damaged' ||
    normalized === 'kho_hang_hong' ||
    normalized === 'kho-hang-hong'
  ) {
    return 'hang_hong';
  }
  if (normalized === 'hang_hoa' || normalized === 'hang-hoa' || normalized === 'hang hoa' || normalized === 'goods') {
    return 'hang_hoa';
  }
  if (
    normalized === 'cong_cu_dung_cu' ||
    normalized === 'cong-cu-dung-cu' ||
    normalized === 'cong cu dung cu' ||
    normalized === 'tools'
  ) {
    return 'cong_cu_dung_cu';
  }
  if (normalized === 'gia_cong' || normalized === 'gia-cong' || normalized === 'gia cong' || normalized === 'processing') {
    return 'gia_cong';
  }
  return null;
}

function parseWarehouseSlipDate(value: unknown): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function normalizeWarehouseExportReferenceText(value: unknown): string | null {
  let normalized = String(value ?? '').trim();
  if (!normalized) return null;

  const pipeIndex = normalized.indexOf('|');
  if (pipeIndex >= 0) normalized = normalized.slice(0, pipeIndex).trim();

  normalized = normalized
    .replace(/\s*Tự động điền từ \d+ lệnh SX\s*\([^)]*\)\.?\s*$/iu, '')
    .trim();

  if (/^LSX[\w-]+(?:\s*,\s*LSX[\w-]+)*$/i.test(normalized)) return null;
  return normalized || null;
}

function parseWarehouseSlipLines(
  raw: unknown,
  loaiKho: WarehouseStorageType,
  loaiPhieu: 'nhap' | 'xuat' | null
): { error: string } | { items: WarehouseSlipLineInput[] } {
  const list = Array.isArray(raw) ? raw : [];
  if (list.length === 0) {
    return { error: loaiKho === 'san_pham' ? 'Phiếu cần ít nhất một dòng sản phẩm.' : 'Phiếu cần ít nhất một dòng NVL.' };
  }

  const items: WarehouseSlipLineInput[] = [];
  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    const code = String(
      record.code ??
        (loaiKho === 'san_pham' ? record.ma_sp ?? record.productCode : record.ma_npl ?? record.ma) ??
        ''
    ).trim();
    const name = String(
      record.name ??
        (loaiKho === 'san_pham' ? record.ten_sp ?? record.productName : record.ten_npl ?? record.ten) ??
        ''
    ).trim();
    const unit = String(record.unit ?? record.don_vi ?? '').trim();
    const quantity = parseOptionalMaterialNumber(record.quantity ?? record.so_luong);
    const documentQuantity = parseOptionalMaterialNumber(
      record.documentQuantity ?? record.so_luong_chung_tu ?? record.document_qty
    );
    const unitPriceRaw = record.unitPrice ?? record.don_gia ?? record.price ?? record.gia;
    const unitPrice = parseOptionalMaterialNumber(unitPriceRaw) ?? 0;
    const sourceInboundLineId = String(
      record.sourceInboundLineId ?? record.id_dong_nhap_nguon ?? record.inboundLineId ?? ''
    ).trim();
    const sourceInboundSlipCode = String(
      record.sourceInboundSlipCode ?? record.ma_phieu_nhap_nguon ?? record.inboundSlipCode ?? ''
    ).trim();
    const damagedReportRowId = String(
      record.damagedReportRowId ?? record.id_bao_cao_hang_hong ?? record.damagedGoodsReportId ?? ''
    ).trim();

    if (!code) {
      return { error: loaiKho === 'san_pham' ? 'Mỗi dòng cần có mã sản phẩm.' : 'Mỗi dòng cần có mã NPL.' };
    }
    if (quantity === null || quantity <= 0) {
      return { error: `Số lượng của ${code} phải lớn hơn 0.` };
    }
    if (unitPrice < 0) {
      return { error: `Giá của ${code} không hợp lệ.` };
    }

    items.push({
      code,
      name,
      unit,
      quantity: roundWarehouseMoney(quantity),
      documentQuantity:
        loaiPhieu === 'xuat' && documentQuantity !== null && documentQuantity > 0
          ? roundWarehouseMoney(documentQuantity)
          : undefined,
      unitPrice: roundWarehouseMoney(unitPrice),
      lineAmount: roundWarehouseMoney(quantity * unitPrice),
      ...(sourceInboundLineId ? { sourceInboundLineId } : {}),
      ...(sourceInboundSlipCode ? { sourceInboundSlipCode } : {}),
      ...(damagedReportRowId ? { damagedReportRowId } : {})
    });
  }

  if (items.length === 0) {
    return { error: loaiKho === 'san_pham' ? 'Phiếu cần ít nhất một dòng sản phẩm hợp lệ.' : 'Phiếu cần ít nhất một dòng NVL hợp lệ.' };
  }

  return { items };
}

function parseWarehouseSlipBody(body: unknown): {
  error: string;
} | {
  loaiPhieu: 'nhap' | 'xuat';
  loaiKho: WarehouseStorageType;
  ngayPhieu: string;
  lyDo: string | null;
  ghiChu: string | null;
  nguoiLap: string | null;
  ca: string | null;
  may: string | null;
  tenKho: string | null;
  treo: boolean;
  items: WarehouseSlipLineInput[];
} {
  const source = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const loaiPhieu = parseWarehouseSlipType(source.loaiPhieu ?? source.loai_phieu ?? source.type);
  const loaiKho = parseWarehouseStorageType(source.loaiKho ?? source.loai_kho ?? source.kho) ?? 'nvl';
  const ngayPhieu = parseWarehouseSlipDate(source.ngayPhieu ?? source.ngay_phieu ?? source.date);
  const parsedItems = parseWarehouseSlipLines(source.items ?? source.lines ?? source.chi_tiet, loaiKho, loaiPhieu);
  const treoRaw = source.treo;
  const treo = treoRaw === true || treoRaw === 'true' || treoRaw === 1;

  if (!loaiPhieu) {
    return { error: 'Loại phiếu phải là nhập hoặc xuất.' };
  }
  if (!ngayPhieu) {
    return { error: 'Vui lòng chọn ngày phiếu hợp lệ.' };
  }
  if ('error' in parsedItems) {
    return parsedItems;
  }

  const rawLyDo = String(source.lyDo ?? source.ly_do ?? source.reason ?? '').trim();
  const rawGhiChu = String(source.ghiChu ?? source.ghi_chu ?? source.note ?? '').trim();
  const rawCa = String(source.ca ?? source.shift ?? source.ca_san_xuat ?? '').trim();
  const isExport = loaiPhieu === 'xuat';

  return {
    loaiPhieu,
    loaiKho,
    ngayPhieu,
    lyDo: isExport ? normalizeWarehouseExportReferenceText(rawLyDo) : rawLyDo || null,
    ghiChu: isExport ? normalizeWarehouseExportReferenceText(rawGhiChu) : rawGhiChu || null,
    nguoiLap: String(source.nguoiLap ?? source.nguoi_lap ?? source.createdBy ?? '').trim() || null,
    ca: rawCa || null,
    may: String(source.may ?? source.machine ?? source.ten_may ?? '').trim() || null,
    tenKho: String(source.tenKho ?? source.ten_kho ?? source.warehouse ?? '').trim() || null,
    // "Phiếu xuất kho treo" — chỉ áp dụng cho phiếu xuất, chờ thủ kho xác nhận mới tính vào tồn kho.
    treo: loaiPhieu === 'xuat' ? treo : false,
    items: parsedItems.items
  };
}

function buildWarehouseSlipInsertRecords(
  parsed: {
    loaiPhieu: 'nhap' | 'xuat';
    loaiKho: WarehouseStorageType;
    ngayPhieu: string;
    lyDo: string | null;
    ghiChu: string | null;
    nguoiLap: string | null;
    ca: string | null;
    may: string | null;
    tenKho: string | null;
    treo?: boolean;
    items: WarehouseSlipLineInput[];
  },
  maPhieu: string
) {
  const nhanSu = parsed.nguoiLap || 'Hệ thống';
  return parsed.items.map(item => {
    const base: Record<string, unknown> = {
      ma_phieu: maPhieu,
      loai_phieu: parsed.loaiPhieu,
      loai_kho: parsed.loaiKho,
      ten_kho: parsed.tenKho || null,
      ngay_phieu: parsed.ngayPhieu,
      treo: parsed.loaiPhieu === 'xuat' && parsed.treo === true,
      don_vi: item.unit || '',
      so_luong: item.quantity,
      so_luong_chung_tu: parsed.loaiPhieu === 'xuat' ? item.documentQuantity ?? null : null,
      don_gia: item.unitPrice,
      thanh_tien: item.lineAmount,
      ly_do: parsed.lyDo || '',
      ghi_chu: parsed.ghiChu || '',
      nguoi_lap: parsed.nguoiLap || nhanSu,
      nhan_su: nhanSu,
      ca: parsed.ca || '',
      may: parsed.may || '',
      id_dong_nhap_nguon:
        parsed.loaiPhieu === 'xuat' && parsed.loaiKho === 'nvl' && item.sourceInboundLineId
          ? item.sourceInboundLineId
          : null,
      ma_phieu_nhap_nguon:
        parsed.loaiPhieu === 'xuat' && parsed.loaiKho === 'nvl' && item.sourceInboundSlipCode
          ? item.sourceInboundSlipCode
          : null,
      id_bao_cao_hang_hong:
        parsed.loaiKho === 'hang_hong' && item.damagedReportRowId
          ? item.damagedReportRowId
          : null
    };

    if (parsed.loaiKho === 'san_pham') {
      return {
        ...base,
        ma_sp: item.code,
        ten_sp: item.name || '',
        ma_npl: '',
        ten_npl: ''
      };
    }

    return {
      ...base,
      ma_npl: item.code,
      ten_npl: item.name || '',
      ma_sp: '',
      ten_sp: ''
    };
  });
}

function generateWarehouseSlipCode(loaiPhieu: 'nhap' | 'xuat') {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const time = now.toISOString().slice(11, 19).replace(/:/g, '');
  return `${loaiPhieu === 'nhap' ? 'PN' : 'PX'}-${date}-${time}`;
}

async function syncMaterialInventoryFromMovements(maNpl: string) {
  if (!supabase) return;
  const code = String(maNpl || '').trim();
  if (!code) return;

  const totals = await buildMaterialMovementTotals();
  const movement = totals.get(code) || { nhap: 0, xuat: 0 };

  const { error: updateError } = await supabase
    .from(SUPABASE_MATERIALS_TABLE)
    .update({
      nhap_trong_ky: movement.nhap,
      xuat_trong_ky: movement.xuat
    })
    .eq('ma_npl', code);

  if (updateError) {
    console.error('Supabase kho_nvl inventory sync error:', updateError);
  }
}

async function syncProductDetailCodeFromMovements(fullCode: string) {
  if (!supabase) return;
  const code = String(fullCode || '').trim();
  if (!code || !code.includes('_')) return;

  const { data: registered, error: registryError } = await supabase
    .from(SUPABASE_PRODUCT_CODES_TABLE)
    .select('id, trang_thai')
    .eq('ma_sp_day_du', code)
    .maybeSingle();

  if (registryError) {
    if (!isMissingTableError(registryError)) {
      console.error('Supabase product detail code lookup error:', registryError);
    }
    return;
  }
  if (!registered) return;

  const { data: movements, error: movementError } = await supabase
    .from(SUPABASE_WAREHOUSE_MOVEMENTS_TABLE)
    .select('ma_phieu, loai_phieu, so_luong, created_at')
    .eq('loai_kho', 'san_pham')
    .eq('ma_sp', code)
    .order('created_at', { ascending: true });

  if (movementError) {
    console.error('Supabase product detail movement sync error:', movementError);
    return;
  }

  let balance = 0;
  let lastInbound = '';
  let lastOutbound = '';
  for (const row of movements || []) {
    const quantity = Number(row.so_luong);
    if (!Number.isFinite(quantity)) continue;
    if (String(row.loai_phieu) === 'xuat') {
      balance -= quantity;
      lastOutbound = String(row.ma_phieu ?? '').trim() || lastOutbound;
    } else {
      balance += quantity;
      lastInbound = String(row.ma_phieu ?? '').trim() || lastInbound;
    }
  }

  const { error: updateError } = await supabase
    .from(SUPABASE_PRODUCT_CODES_TABLE)
    .update({
      trang_thai: balance > 0 ? 'trong_kho' : 'da_xuat',
      ma_phieu_nhap: lastInbound || null,
      ma_phieu_xuat: lastOutbound || null,
      updated_at: new Date().toISOString()
    })
    .eq('id', registered.id);

  if (updateError) {
    console.error('Supabase product detail status sync error:', updateError);
  }
}

async function buildMaterialMovementTotals(): Promise<Map<string, { nhap: number; xuat: number }>> {
  const totals = new Map<string, { nhap: number; xuat: number }>();
  if (!supabase) return totals;

  const { data, error } = await supabase
    .from(SUPABASE_WAREHOUSE_MOVEMENTS_TABLE)
    .select('ma_npl, loai_phieu, so_luong')
    .or('loai_kho.eq.nvl,loai_kho.is.null')
    .eq('treo', false);

  if (error) {
    console.error('Supabase material movement totals error:', error);
    return totals;
  }

  for (const row of data || []) {
    const code = String(row.ma_npl ?? '').trim();
    if (!code) continue;
    const current = totals.get(code) || { nhap: 0, xuat: 0 };
    const qty = Number(row.so_luong);
    if (!Number.isFinite(qty)) continue;
    if (String(row.loai_phieu || '').trim().toLowerCase() === 'xuat') {
      current.xuat = roundWarehouseMoney(current.xuat + qty);
    } else {
      current.nhap = roundWarehouseMoney(current.nhap + qty);
    }
    totals.set(code, current);
  }

  return totals;
}

function applyMaterialMovementTotals<T extends Record<string, unknown>>(
  materials: T[],
  totals: Map<string, { nhap: number; xuat: number }>
) {
  return materials.map(material => {
    const code = String(material.ma_npl ?? '').trim();
    const movement = totals.get(code);
    if (!movement) return material;
    return {
      ...material,
      nhap_trong_ky: movement.nhap,
      xuat_trong_ky: movement.xuat
    };
  });
}

function warehouseSlipWriteErrorMessage(error: { code?: string; message?: string; details?: string }) {
  if (isMissingTableError(error)) {
    return `Bảng ${SUPABASE_WAREHOUSE_MOVEMENTS_TABLE} chưa tồn tại trên Supabase. Hãy chạy supabase-phieu-xuat-nhap-kho.sql.`;
  }
  if (isMissingColumnError(error)) {
    const msg = String(error.message || '');
    if (/may/i.test(msg)) {
      return `Bảng ${SUPABASE_WAREHOUSE_MOVEMENTS_TABLE} đang thiếu cột may. Hãy chạy supabase-phieu-xuat-nhap-kho-may.sql trong Supabase SQL Editor.`;
    }
    return `Bảng ${SUPABASE_WAREHOUSE_MOVEMENTS_TABLE} đang thiếu cột (${error.message}).`;
  }
  if (String(error.message || '').includes('invalid input syntax for type integer')) {
    return 'Không thể lưu phiếu xuất nhập kho: cột số lượng trên Supabase đang là kiểu integer (chỉ nhận số nguyên). Hãy chạy file supabase-phieu-xuat-nhap-kho-so-luong-numeric.sql trong Supabase SQL Editor, hoặc đặt SUPABASE_DB_PASSWORD trong .env rồi chạy npm run migrate:warehouse-numeric.';
  }
  return `Không thể lưu phiếu xuất nhập kho. ${error.message}${error.details ? ` (${error.details})` : ''}`;
}

async function ensureWarehouseSlipNumericColumns() {
  const password = process.env.SUPABASE_DB_PASSWORD?.trim();
  if (!password || !SUPABASE_URL) return;

  const ref = SUPABASE_URL.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
  if (!ref) return;

  const sqlPath = path.join(process.cwd(), 'supabase-phieu-xuat-nhap-kho-so-luong-numeric.sql');
  if (!fs.existsSync(sqlPath)) return;

  const sql = fs.readFileSync(sqlPath, 'utf8');
  const customUrl = process.env.SUPABASE_DB_URL?.trim();
  const candidates = [
    customUrl,
    `postgresql://postgres:${encodeURIComponent(password)}@db.${ref}.supabase.co:5432/postgres`,
    `postgresql://postgres.${ref}:${encodeURIComponent(password)}@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`,
    `postgresql://postgres.${ref}:${encodeURIComponent(password)}@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres`
  ].filter((value): value is string => Boolean(value));

  try {
    const pg = await import('pg');
    for (const connectionString of candidates) {
      const client = new pg.default.Client({
        connectionString,
        ssl: { rejectUnauthorized: false }
      });

      try {
        await client.connect();
        await client.query(sql);
        console.log('[warehouse] Đã chuyển cột so_luong/don_gia/thanh_tien sang numeric.');
        await client.end();
        return;
      } catch (error) {
        try {
          await client.end();
        } catch {
          // ignore
        }
      }
    }
  } catch (error) {
    console.warn('[warehouse] Không thể tự chạy migration numeric:', error);
  }
}

function parseOrderQuantity(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

type OrderProductRecord = {
  ma_don_hang?: string;
  ma_sp: string;
  ten_sp: string;
  don_vi: string;
  so_luong: number | null;
};

function parseOrderProductsInput(
  source: Record<string, unknown>
): { error: string } | { products: OrderProductRecord[] } {
  const raw = source.products ?? source.san_pham;

  if (raw === undefined || raw === null || raw === '') {
    return { error: 'Vui lòng thêm ít nhất một sản phẩm.' };
  }

  if (!Array.isArray(raw)) {
    return { error: 'Sản phẩm phải là danh sách.' };
  }

  const products: OrderProductRecord[] = [];

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const ma_sp = pickRowField(row, ['ma_sp', 'ma_hang', 'productCode', 'code']);
    const ten_sp = pickRowField(row, ['ten_sp', 'ten_hang', 'productName', 'name']);
    const don_vi = pickRowField(row, ['don_vi', 'unit']);
    const so_luong = parseOrderQuantity(row.so_luong ?? row.quantity);
    const ma_don_hang = pickRowField(row, ['ma_don_hang', 'orderRef', 'order_code']);

    if (!ma_sp && !ten_sp) {
      return { error: 'Mỗi dòng sản phẩm cần có mã SP hoặc tên SP.' };
    }
    if (so_luong === null || so_luong <= 0) {
      return { error: `Số lượng phải lớn hơn 0 cho sản phẩm ${ma_sp || ten_sp}.` };
    }

    products.push({ ma_don_hang, ma_sp, ten_sp, don_vi, so_luong });
  }

  if (products.length === 0) {
    return { error: 'Vui lòng thêm ít nhất một sản phẩm.' };
  }

  return { products };
}

function parseOrderProductsFromRow(row: Record<string, unknown>): OrderProductRecord[] {
  let sanPham = row.san_pham;
  if (typeof sanPham === 'string') {
    const trimmed = sanPham.trim();
    if (trimmed) {
      try {
        sanPham = JSON.parse(trimmed);
      } catch {
        sanPham = trimmed;
      }
    }
  }
  if (sanPham && typeof sanPham === 'object' && !Array.isArray(sanPham)) {
    const nested =
      (sanPham as { items?: unknown }).items ??
      (sanPham as { products?: unknown }).products ??
      (sanPham as { san_pham?: unknown }).san_pham;
    if (Array.isArray(nested)) {
      sanPham = nested;
    }
  }
  if (Array.isArray(sanPham) && sanPham.length > 0) {
    return sanPham
      .map((item): OrderProductRecord | null => {
        if (!item || typeof item !== 'object') return null;
        const record = item as Record<string, unknown>;
        const ma_sp = pickRowField(record, ['ma_sp', 'ma_hang', 'productCode', 'code']);
        const ten_sp = pickRowField(record, ['ten_sp', 'ten_hang', 'productName', 'name']);
        if (!ma_sp && !ten_sp) return null;
        return {
          ma_don_hang: pickRowField(record, ['ma_don_hang', 'orderRef', 'order_code']),
          ma_sp,
          ten_sp,
          don_vi: pickRowField(record, ['don_vi', 'unit']),
          so_luong: parseOrderQuantity(record.so_luong ?? record.quantity)
        };
      })
      .filter((item): item is OrderProductRecord => Boolean(item));
  }

  const ma_sp = pickRowField(row, ['ma_hang', 'ma_sp', 'productCode']);
  const ten_sp = pickRowField(row, ['ten_hang', 'ten_sp', 'productName']);
  if (!ma_sp && !ten_sp) return [];

  return [
    {
      ma_don_hang: pickRowField(row, ['ma_don_hang', 'orderRef', 'order_code']),
      ma_sp,
      ten_sp,
      don_vi: pickRowField(row, ['don_vi', 'unit']),
      so_luong: parseOrderQuantity(row.so_luong ?? row.quantity)
    }
  ];
}

function getOrderedQuantityFromOrderRow(row: Record<string, unknown>, productCode: string): number {
  return parseOrderProductsFromRow(row).reduce((sum, item) => {
    if (item.ma_sp !== productCode) return sum;
    return sum + (item.so_luong ?? 0);
  }, 0);
}

function parseOrderBody(
  body: unknown,
  options?: { isCreate?: boolean }
): { error: string } | { record: Record<string, string | number | null | OrderProductRecord[]> } {
  const source = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const orderCode = typeof source.orderCode === 'string' ? source.orderCode.trim() : '';

  if (!orderCode) return { error: 'Vui lòng nhập mã đơn hàng.' };

  const parsedProducts = parseOrderProductsInput(source);
  if ('error' in parsedProducts) {
    return { error: parsedProducts.error };
  }

  const { products } = parsedProducts;

  const DEFAULT_ORDER_STATUS = 'Chờ sx';
  const status = options?.isCreate
    ? DEFAULT_ORDER_STATUS
    : typeof source.status === 'string' && source.status.trim()
      ? source.status.trim()
      : DEFAULT_ORDER_STATUS;

  const record: Record<string, string | number | null | OrderProductRecord[]> = {
    ma_don_hang: orderCode,
    loai_don_hang: typeof source.orderType === 'string' ? source.orderType.trim() : '',
    trang_thai: status,
    nhan_vien: typeof source.staffName === 'string' ? source.staffName.trim() : '',
    khach_hang: typeof source.customer === 'string' ? source.customer.trim() : '',
    san_pham: products,
    ghi_chu: typeof source.note === 'string' ? source.note.trim() : ''
  };

  if (Object.prototype.hasOwnProperty.call(source, 'stockQuantity')) {
    record.so_luong_ton = parseOrderQuantity(source.stockQuantity);
  }
  if (Object.prototype.hasOwnProperty.call(source, 'productionOrder')) {
    record.lenh_sx = typeof source.productionOrder === 'string' ? source.productionOrder.trim() : '';
  }
  if (typeof source.createdAt === 'string' && source.createdAt.trim()) {
    const dateMatch = source.createdAt.trim().match(/^(\d{4}-\d{2}-\d{2})/);
    if (dateMatch) {
      record.created_at = `${dateMatch[1]}T12:00:00.000Z`;
    }
  }

  return { record };
}

function orderWriteErrorMessage(error: { code?: string; message?: string }) {
  if (isMissingTableError(error)) {
    return `Bảng ${SUPABASE_ORDERS_TABLE} chưa tồn tại trong Supabase.`;
  }
  if (isMissingColumnError(error)) {
    const detail = error.message ? ` (${error.message})` : '';
    return `Bảng ${SUPABASE_ORDERS_TABLE} đang thiếu cột${detail}. Hãy chạy file supabase-don-hang-san-pham.sql trong Supabase SQL Editor.`;
  }
  return `Không thể lưu đơn hàng vào ${SUPABASE_ORDERS_TABLE}. ${error.message}`;
}

const DEFAULT_PRODUCTION_ORDER_STATUS = 'Chờ sx';
const DEFAULT_PRODUCTION_WORKERS = 'Chưa phân công';
const DEFAULT_PRODUCTION_CREATOR = 'Hệ thống';

function pickRowField(row: Record<string, unknown>, keys: string[], fallback = '') {
  for (const key of keys) {
    const value = row[key];
    if (value !== null && value !== undefined && String(value).trim()) {
      return String(value).trim();
    }
  }

  return fallback;
}

function makeProductionOrderCode(orderCode: string, suffix = '') {
  const base = (orderCode || 'DH').replace(/\s+/g, '-');
  return `LSX-${base}${suffix}`.slice(0, 80);
}

function generateNextStaffCode(existingCodes: Iterable<string>) {
  let max = 0;
  for (const raw of existingCodes) {
    const code = String(raw || '').trim().toUpperCase();
    const match = code.match(/^NV(\d+)$/);
    if (!match) continue;
    const num = Number(match[1]);
    if (Number.isFinite(num) && num > max) max = num;
  }
  const next = max + 1;
  const width = Math.max(3, String(next).length);
  return `NV${String(next).padStart(width, '0')}`;
}

async function generateNextStaffCodeFromDb() {
  if (!supabase) return 'NV001';
  const { data, error } = await supabase.from(SUPABASE_STAFF_TABLE).select('ma_nhan_su');
  if (error) {
    console.error('Supabase nhan_su next code query error:', error);
    return 'NV001';
  }
  return generateNextStaffCode((data || []).map(row => String((row as { ma_nhan_su?: string }).ma_nhan_su || '')));
}

function generateNextOrderCode(existingCodes: Iterable<string>) {
  let max = 0;
  for (const raw of existingCodes) {
    const code = String(raw || '').trim().toUpperCase();
    const match = code.match(/^DH(\d+)$/);
    if (!match) continue;
    const num = Number(match[1]);
    if (Number.isFinite(num) && num > max) max = num;
  }
  const next = max + 1;
  const width = Math.max(3, String(next).length);
  return `DH${String(next).padStart(width, '0')}`;
}

async function generateNextOrderCodeFromDb() {
  if (!supabase) return 'DH001';
  const { data, error } = await supabase.from(SUPABASE_ORDERS_TABLE).select('ma_don_hang');
  if (error) {
    console.error('Supabase don_hang next code query error:', error);
    return 'DH001';
  }
  return generateNextOrderCode((data || []).map(row => String((row as { ma_don_hang?: string }).ma_don_hang || '')));
}

function todayDateString() {
  return new Date().toISOString().slice(0, 10);
}

function productionOrderProductLabel(productCode: string, productName: string) {
  if (productName && productCode) return `${productCode} · ${productName}`;
  return productName || productCode || '-';
}

function buildProductionOrderRecordFromOrder(
  order: Record<string, unknown>,
  code: string,
  product?: OrderProductRecord
): Record<string, string | number | null> {
  const orderCode = pickRowField(order, ['ma_don_hang', 'order_code', 'code']);
  const selectedProduct = product ?? parseOrderProductsFromRow(order)[0];
  const productCode = selectedProduct?.ma_sp ?? '';
  const productName = selectedProduct?.ten_sp ?? '';
  const customer = pickRowField(order, ['khach_hang', 'customer']);
  const unit = selectedProduct?.don_vi ?? '';
  const workers =
    pickRowField(order, ['cong_nhan', 'nhan_su', 'nhan_vien', 'staff'], '') || DEFAULT_PRODUCTION_WORKERS;
  const creator =
    pickRowField(order, ['nguoi_tao', 'created_by', 'nguoi_lap', 'nhan_vien', 'staff'], '') || DEFAULT_PRODUCTION_CREATOR;
  const orderDateRaw = pickRowField(
    order,
    ['ngay_don_hang', 'ngay_dat_hang', 'order_date', 'ngay', 'ngay_giao'],
    ''
  );
  const orderDateOnly =
    (orderDateRaw && /^\d{4}-\d{2}-\d{2}/.test(orderDateRaw) ? orderDateRaw.slice(0, 10) : '') ||
    todayDateString();

  return {
    ma_lenh_sx: code,
    ten_lenh_sx: productName ? `SX ${productName}` : `Lệnh SX ${orderCode || code}`,
    ma_hang: productCode,
    ten_hang: productName,
    san_pham: productionOrderProductLabel(productCode, productName),
    so_luong: selectedProduct?.so_luong ?? null,
    don_vi: unit,
    trang_thai: DEFAULT_PRODUCTION_ORDER_STATUS,
    khach_hang: customer,
    cong_nhan: workers,
    nhan_su: workers,
    nguoi_tao: creator,
    ma_don_hang: orderCode,
    ngay: orderDateOnly,
    ngay_bat_dau: orderDateOnly,
    ngay_gio_bat_dau: `${orderDateOnly}T08:00:00`,
    ghi_chu: pickRowField(order, ['ghi_chu', 'note'])
  };
}

function parseProductionOrderProductsInput(source: Record<string, unknown>): OrderProductRecord[] | null {
  const raw = source.san_pham ?? source.products;
  if (!Array.isArray(raw) || raw.length === 0) return null;

  const products: OrderProductRecord[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const ma_sp = pickRowField(row, ['ma_sp', 'ma_hang', 'productCode', 'code']);
    const ten_sp = pickRowField(row, ['ten_sp', 'ten_hang', 'productName', 'name']);
    const don_vi = pickRowField(row, ['don_vi', 'unit']);
    const so_luong = parseOrderQuantity(row.so_luong ?? row.quantity);
    const ma_don_hang = pickRowField(row, ['ma_don_hang', 'orderRef', 'order_code']);

    if (!ma_sp && !ten_sp) {
      return null;
    }
    if (!Number.isFinite(so_luong) || so_luong <= 0) {
      return null;
    }

    products.push({ ma_don_hang, ma_sp, ten_sp, don_vi, so_luong });
  }

  return products.length > 0 ? products : null;
}

function summarizeProductionOrderProducts(products: OrderProductRecord[]) {
  const productCode = products.map(item => item.ma_sp).filter(Boolean).join(', ');
  const productName = products.map(item => item.ten_sp).filter(Boolean).join(', ');
  const units = [...new Set(products.map(item => item.don_vi).filter(unit => unit && unit !== '-'))];
  const quantity = products.reduce((sum, item) => sum + (item.so_luong ?? 0), 0);

  return {
    productCode,
    productName,
    unit: products.length === 1 ? products[0].don_vi ?? '' : units.join(', '),
    quantity
  };
}

function parseProductionOrderBody(
  body: unknown
): { error: string } | { record: Record<string, string | number | null | OrderProductRecord[]> } {
  if (!body || typeof body !== 'object') {
    return { error: 'Dữ liệu không hợp lệ.' };
  }

  const source = body as Record<string, unknown>;
  const parsedProducts = parseProductionOrderProductsInput(source);
  let products: OrderProductRecord[];

  if (parsedProducts && parsedProducts.length > 0) {
    products = parsedProducts;
  } else {
    const productCode = pickRowField(source, ['ma_hang', 'productCode', 'ma_sp'], '');
    const productName = pickRowField(source, ['ten_hang', 'productName', 'ten_sp'], '');
    if (!productCode && !productName) {
      return { error: 'Cần nhập mã hàng hoặc tên hàng.' };
    }

    const quantity = parseOrderQuantity(source.so_luong ?? source.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return { error: 'Số lượng phải lớn hơn 0.' };
    }

    products = [
      {
        ma_don_hang: pickRowField(source, ['ma_don_hang', 'orderRef', 'order_code'], ''),
        ma_sp: productCode,
        ten_sp: productName,
        don_vi: pickRowField(source, ['don_vi', 'unit'], ''),
        so_luong: quantity
      }
    ];
  }

  const summary = summarizeProductionOrderProducts(products);
  const productOrderRefs = [
    ...new Set(products.map(item => String(item.ma_don_hang ?? '').trim()).filter(Boolean))
  ];
  const orderRef = pickRowField(source, ['ma_don_hang', 'orderRef', 'order_code'], '') || productOrderRefs.join(', ');
  const manualSeed = `MAN-${Date.now().toString(36).slice(-6).toUpperCase()}`;
  const codeInput = pickRowField(source, ['ma_lenh_sx', 'code'], '');
  const code = codeInput || makeProductionOrderCode(orderRef || manualSeed);
  const name = pickRowField(source, ['ten_lenh_sx', 'name'], '');
  const startDateTime = pickRowField(source, ['ngay_gio_bat_dau', 'startDateTime'], '');
  const endDateTime = pickRowField(source, ['ngay_gio_ket_thuc', 'endDateTime', 'ngay_ket_thuc', 'endDate'], '');
  // Cột Ngày lệnh SX — lấy `ngay` / startDate form.
  const explicitDate = pickRowField(source, ['ngay', 'startDate', 'ngay_bat_dau'], '');
  const startDateOnly =
    (explicitDate && /^\d{4}-\d{2}-\d{2}/.test(explicitDate) ? explicitDate.slice(0, 10) : '') ||
    todayDateString();
  const endDateOnly = endDateTime ? endDateTime.slice(0, 10) : '';
  const workers =
    pickRowField(source, ['cong_nhan', 'nhan_su', 'staff', 'nhan_vien'], '') || DEFAULT_PRODUCTION_WORKERS;
  const creator =
    pickRowField(source, ['nguoi_tao', 'created_by', 'nguoi_lap', 'staff', 'nhan_vien'], '') || DEFAULT_PRODUCTION_CREATOR;
  const defaultName =
    products.length === 1
      ? products[0].ten_sp
        ? `SX ${products[0].ten_sp}`
        : `Lệnh SX ${code}`
      : products.map(item => item.ten_sp || item.ma_sp).filter(Boolean).join(' + ')
        ? `SX ${products.map(item => item.ten_sp || item.ma_sp).filter(Boolean).join(' + ')}`
        : `Lệnh SX ${code}`;

  return {
    record: {
      ma_lenh_sx: code,
      ten_lenh_sx: name || defaultName,
      ma_hang: summary.productCode,
      ten_hang: summary.productName,
      san_pham: products,
      so_luong: summary.quantity,
      don_vi: summary.unit,
      trang_thai: pickRowField(source, ['trang_thai', 'status'], DEFAULT_PRODUCTION_ORDER_STATUS),
      ma_don_hang: orderRef,
      ca: pickRowField(source, ['ca', 'shift'], ''),
      cong_nhan: workers,
      nhan_su: workers,
      truong_ca: pickRowField(source, ['truong_ca', 'shiftLead'], '') || null,
      nhan_su_chinh: pickRowField(source, ['nhan_su_chinh', 'mainStaff'], '') || null,
      tho_phu: pickRowField(source, ['tho_phu', 'assistantStaff'], '') || null,
      hoc_viec: pickRowField(source, ['hoc_viec', 'traineeStaff'], '') || null,
      nguoi_tao: creator,
      ngay: startDateOnly,
      ngay_gio_bat_dau: startDateTime || null,
      ngay_gio_ket_thuc: endDateTime || null,
      // Đồng bộ ngày form vào ngay_bat_dau để vẫn lưu được khi cột ngay không ghi được.
      ngay_bat_dau: startDateOnly,
      ngay_ket_thuc: endDateOnly || null,
      may: pickRowField(source, ['may', 'machine'], ''),
      ghi_chu: pickRowField(source, ['ghi_chu', 'note'], '')
    }
  };
}

async function ensureUniqueProductionOrderCode(initialCode: string) {
  if (!supabase) return initialCode;

  let code = initialCode;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { data: duplicate } = await supabase
      .from(SUPABASE_PRODUCTION_ORDERS_TABLE)
      .select('id')
      .eq('ma_lenh_sx', code)
      .maybeSingle();

    if (!duplicate) return code;
    code = makeProductionOrderCode(
      initialCode.replace(/^LSX-/, ''),
      `-${Date.now().toString(36).slice(-4)}`
    );
  }

  return code;
}

function productionOrderWriteErrorMessage(error: { code?: string; message?: string }) {
  if (isMissingTableError(error)) {
    return `Bảng ${SUPABASE_PRODUCTION_ORDERS_TABLE} chưa tồn tại. Hãy chạy file supabase-lenh-sx.sql trong Supabase SQL Editor.`;
  }
  if (isMissingColumnError(error)) {
    return `Bảng ${SUPABASE_PRODUCTION_ORDERS_TABLE} đang thiếu cột. Hãy chạy file supabase-lenh-sx.sql.`;
  }
  return `Không thể lưu lệnh sản xuất vào ${SUPABASE_PRODUCTION_ORDERS_TABLE}. ${error.message}`;
}

/** Ghi lệnh SX; chịu thiếu/cột generated `ngay` và cột san_pham kiểu text. */
async function insertProductionOrderRecord(record: Record<string, unknown>) {
  if (!supabase) return { data: null, error: { message: 'Supabase chưa được cấu hình.' } };

  const attempts: Record<string, unknown>[] = [record];
  if (Array.isArray(record.san_pham)) {
    attempts.push({ ...record, san_pham: JSON.stringify(record.san_pham) });
  }
  if (Object.prototype.hasOwnProperty.call(record, 'ngay')) {
    const { ngay, ...withoutNgay } = record;
    const fallbackDate = String(ngay ?? '').slice(0, 10);
    const without = {
      ...withoutNgay,
      // Nếu không ghi được cột ngay, vẫn giữ ngày form ở ngay_bat_dau.
      ngay_bat_dau: fallbackDate || withoutNgay.ngay_bat_dau || null
    };
    attempts.push(without);
    if (Array.isArray(record.san_pham)) {
      attempts.push({ ...without, san_pham: JSON.stringify(record.san_pham) });
    }
  }

  let data: unknown = null;
  let error: { code?: string; message?: string } | null = null;
  for (const attempt of attempts) {
    ({ data, error } = await supabase.from(SUPABASE_PRODUCTION_ORDERS_TABLE).insert(attempt).select('*').single());
    if (!error) return { data, error };
    if (!isMissingColumnError(error) && !isImmutableOrGeneratedColumnError(error)) {
      // Thử kiểu san_pham text nếu lỗi cast JSON.
      if (Array.isArray(attempt.san_pham) && /invalid|json|type/i.test(error.message || '')) {
        continue;
      }
      return { data, error };
    }
  }
  return { data, error };
}

async function updateProductionOrderRecord(id: string, record: Record<string, unknown>) {
  if (!supabase) return { data: null, error: { message: 'Supabase chưa được cấu hình.' } };

  const attempts: Record<string, unknown>[] = [record];
  if (Array.isArray(record.san_pham)) {
    attempts.push({ ...record, san_pham: JSON.stringify(record.san_pham) });
  }
  if (Object.prototype.hasOwnProperty.call(record, 'ngay')) {
    const { ngay, ...withoutNgay } = record;
    const fallbackDate = String(ngay ?? '').slice(0, 10);
    const without = {
      ...withoutNgay,
      ngay_bat_dau: fallbackDate || withoutNgay.ngay_bat_dau || null
    };
    attempts.push(without);
    if (Array.isArray(record.san_pham)) {
      attempts.push({ ...without, san_pham: JSON.stringify(record.san_pham) });
    }
  }

  let data: unknown = null;
  let error: { code?: string; message?: string } | null = null;
  for (const attempt of attempts) {
    ({ data, error } = await supabase
      .from(SUPABASE_PRODUCTION_ORDERS_TABLE)
      .update(attempt)
      .eq('id', id)
      .select('*')
      .maybeSingle());
    if (!error) return { data, error };
    if (!isMissingColumnError(error) && !isImmutableOrGeneratedColumnError(error)) {
      if (Array.isArray(attempt.san_pham) && /invalid|json|type/i.test(error.message || '')) {
        continue;
      }
      return { data, error };
    }
  }
  return { data, error };
}

function productionPlanWriteErrorMessage(error: { code?: string; message?: string }) {
  if (isMissingTableError(error)) {
    return `Bảng ${SUPABASE_PRODUCTION_PLANS_TABLE} chưa tồn tại. Hãy chạy file supabase-ke-hoach-san-xuat.sql trong Supabase SQL Editor.`;
  }
  if (isMissingColumnError(error)) {
    return `Bảng ${SUPABASE_PRODUCTION_PLANS_TABLE} đang thiếu cột. Hãy chạy file supabase-ke-hoach-san-xuat.sql.`;
  }
  return `Không thể lưu kế hoạch sản xuất vào ${SUPABASE_PRODUCTION_PLANS_TABLE}. ${error.message}`;
}

function parseProductionPlanDateInput(value: unknown): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function makeProductionPlanCode(planDate: string) {
  const compact = planDate.replace(/-/g, '');
  const suffix = Date.now().toString(36).slice(-4).toUpperCase();
  return `KHSX-${compact}-${suffix}`;
}

type ProductionPlanSnapshotLine = {
  lenh_sx_id: number | null;
  thu_tu_uu_tien: number;
  vi_tri: string | null;
  ghi_chu: string;
  ma_lenh_sx: string;
  ma_don_hang: string;
  ca: string;
  may: string;
  nhan_su: string;
  truong_ca: string;
  nhan_su_chinh: string;
  tho_phu: string;
  hoc_viec: string;
  san_pham: unknown[];
};

function parseProductionPlanSnapshotLine(raw: unknown): ProductionPlanSnapshotLine | null {
  if (!raw || typeof raw !== 'object') return null;
  const item = raw as Record<string, unknown>;
  const thu_tu_uu_tien = Number(item.thu_tu_uu_tien ?? item.priority);
  if (!Number.isFinite(thu_tu_uu_tien) || thu_tu_uu_tien <= 0) return null;

  const lenhRaw = item.lenh_sx_id ?? item.id;
  const lenhNumeric = Number(lenhRaw);
  const sanPhamRaw = item.san_pham ?? item.products;
  const san_pham = Array.isArray(sanPhamRaw) ? sanPhamRaw : [];

  return {
    lenh_sx_id: Number.isFinite(lenhNumeric) ? lenhNumeric : null,
    thu_tu_uu_tien: Math.round(thu_tu_uu_tien),
    vi_tri:
      typeof item.vi_tri === 'string' && item.vi_tri.trim()
        ? item.vi_tri.trim()
        : typeof item.position === 'string' && item.position.trim()
          ? item.position.trim()
          : null,
    ghi_chu: typeof item.ghi_chu === 'string' ? item.ghi_chu.trim() : typeof item.note === 'string' ? item.note.trim() : '',
    ma_lenh_sx: pickRowField(item, ['ma_lenh_sx', 'code'], ''),
    ma_don_hang: pickRowField(item, ['ma_don_hang', 'orderRef', 'order_code'], ''),
    ca: pickRowField(item, ['ca', 'shift'], ''),
    may: pickRowField(item, ['may', 'machine'], ''),
    nhan_su: pickRowField(item, ['nhan_su', 'staff'], ''),
    truong_ca: pickRowField(item, ['truong_ca', 'shiftLead'], ''),
    nhan_su_chinh: pickRowField(item, ['nhan_su_chinh', 'mainStaff'], ''),
    tho_phu: pickRowField(item, ['tho_phu', 'assistantStaff'], ''),
    hoc_viec: pickRowField(item, ['hoc_viec', 'traineeStaff'], ''),
    san_pham
  };
}

async function saveProductionPlanSnapshot(options: {
  planId?: string;
  planDate: string;
  note: string;
  createdBy: string;
  lines: ProductionPlanSnapshotLine[];
}) {
  if (!supabase) {
    throw new Error('Supabase chưa được cấu hình.');
  }

  const header = {
    ma_ke_hoach: makeProductionPlanCode(options.planDate),
    ngay_ke_hoach: options.planDate,
    trang_thai: 'Đã lập',
    so_lenh: options.lines.length,
    ghi_chu: options.note,
    nguoi_lap: options.createdBy,
    updated_at: new Date().toISOString()
  };

  const headerQuery = options.planId
    ? supabase.from(SUPABASE_PRODUCTION_PLANS_TABLE).update(header).eq('id', options.planId)
    : supabase.from(SUPABASE_PRODUCTION_PLANS_TABLE).insert(header);
  const { data: createdPlan, error: headerError } = await headerQuery
    .select('*')
    .single();

  if (headerError) {
    console.error('Supabase ke_hoach_san_xuat insert error:', headerError);
    throw new Error(productionPlanWriteErrorMessage(headerError));
  }

  const planId = String((createdPlan as Record<string, unknown>).id ?? '');
  if (!planId) {
    throw new Error('Không thể tạo bản ghi kế hoạch sản xuất.');
  }

  if (options.planId) {
    const { error: clearError } = await supabase
      .from(SUPABASE_PRODUCTION_PLAN_LINES_TABLE)
      .delete()
      .eq('ke_hoach_id', planId);
    if (clearError) throw new Error(productionPlanWriteErrorMessage(clearError));
  }

  const detailRows = options.lines.map(line => ({
    ke_hoach_id: planId,
    lenh_sx_id: line.lenh_sx_id,
    thu_tu_uu_tien: line.thu_tu_uu_tien,
    vi_tri: line.vi_tri,
    ghi_chu: line.ghi_chu,
    ma_lenh_sx: line.ma_lenh_sx,
    ma_don_hang: line.ma_don_hang,
    ca: line.ca,
    may: line.may,
    nhan_su: line.nhan_su,
    truong_ca: line.truong_ca,
    nhan_su_chinh: line.nhan_su_chinh,
    tho_phu: line.tho_phu,
    hoc_viec: line.hoc_viec,
    san_pham: line.san_pham
  }));

  let { error: detailError } = await supabase.from(SUPABASE_PRODUCTION_PLAN_LINES_TABLE).insert(detailRows);
  // Tương thích các cơ sở dữ liệu chưa chạy migration thêm 2 cột phân công.
  if (detailError && isMissingColumnError(detailError)) {
    const legacyRows = detailRows.map(({ truong_ca: _shiftLead, nhan_su_chinh: _mainStaff, tho_phu: _assistantStaff, hoc_viec: _traineeStaff, ...line }) => line);
    ({ error: detailError } = await supabase.from(SUPABASE_PRODUCTION_PLAN_LINES_TABLE).insert(legacyRows));
  }
  if (detailError) {
    console.error('Supabase ke_hoach_san_xuat_dong insert error:', detailError);
    if (!options.planId) await supabase.from(SUPABASE_PRODUCTION_PLANS_TABLE).delete().eq('id', planId);
    throw new Error(productionPlanWriteErrorMessage(detailError));
  }

  return createdPlan;
}

function splitProductionProductCodes(raw: string): string[] {
  return raw
    .split(',')
    .map(code => code.trim())
    .filter(code => code && code !== '-');
}

async function getRemainingProductionQuantityForProduct(
  orderRef: string,
  productCode: string
): Promise<{ ordered: number; allocated: number; remaining: number }> {
  if (!supabase || !orderRef || !productCode) {
    return { ordered: 0, allocated: 0, remaining: 0 };
  }

  const { data: orderRowsByCode, error: orderRowsError } = await supabase
    .from(SUPABASE_ORDERS_TABLE)
    .select('san_pham')
    .eq('ma_don_hang', orderRef);

  if (orderRowsError) {
    console.error('Supabase don_hang remaining qty error:', orderRowsError);
    throw new Error(`Không thể đọc sản phẩm của đơn ${orderRef}. ${orderRowsError.message}`);
  }

  const ordered = (orderRowsByCode || []).reduce((sum, row) => {
    return sum + getOrderedQuantityFromOrderRow(row as Record<string, unknown>, productCode);
  }, 0);

  const { data: productionRows, error: productionError } = await supabase
    .from(SUPABASE_PRODUCTION_ORDERS_TABLE)
    .select('ma_don_hang, ma_hang, so_luong, san_pham');

  if (productionError) {
    console.error('Supabase lenh_sx remaining qty error:', productionError);
    return { ordered, allocated: 0, remaining: ordered };
  }

  const allocated = (productionRows || []).reduce((sum, row) => {
    const productionRow = row as Record<string, unknown>;
    const rowOrderRefs = String(productionRow.ma_don_hang ?? '')
      .split(',')
      .map(item => item.trim())
      .filter(Boolean);

    return (
      sum +
      parseOrderProductsFromRow(productionRow).reduce((innerSum, item) => {
        const itemOrderRef = String(item.ma_don_hang ?? '').trim();
        const matchesOrder = itemOrderRef
          ? itemOrderRef === orderRef
          : rowOrderRefs.length === 0 || rowOrderRefs.includes(orderRef);
        if (!matchesOrder || item.ma_sp !== productCode) return innerSum;
        return innerSum + (item.so_luong ?? 0);
      }, 0)
    );
  }, 0);

  return { ordered, allocated, remaining: Math.max(0, ordered - allocated) };
}

async function getReportsFromLocalFile(): Promise<ProductionReport[]> {
  try {
    if (!fs.existsSync(DB_FILE_PATH)) {
      const seedReports = getSeedReports();
      fs.writeFileSync(DB_FILE_PATH, JSON.stringify(seedReports, null, 2), 'utf-8');
      return seedReports;
    }

    const fileContent = fs.readFileSync(DB_FILE_PATH, 'utf-8');
    return JSON.parse(fileContent) as ProductionReport[];
  } catch (error) {
    console.error('Lỗi khi đọc file CSDL:', error);
    return getSeedReports();
  }
}

function isBundledAssetPath(urlPath: string) {
  return /^\/assets\/.+\.(?:js|mjs|css|map|png|jpe?g|gif|svg|webp|ico|woff2?)$/i.test(urlPath);
}

async function startServer() {
  const app = createApp();
  const server = http.createServer(app);
  const PORT = Number(process.env.PORT) || 3001;
  const distPath = path.join(process.cwd(), 'dist');

  if (process.env.NODE_ENV !== 'production') {
    const publicPath = path.join(process.cwd(), 'public');

    // Dev: no-op SW that clears caches — production sw.js cache-first breaks Vite /src modules.
    app.get('/sw.js', (_req, res) => {
      res.set('Cache-Control', 'no-store');
      res.type('application/javascript').send(
        "self.addEventListener('install',(e)=>e.waitUntil(self.skipWaiting()));" +
        "self.addEventListener('activate',(e)=>e.waitUntil((async()=>{" +
        "const keys=await caches.keys();" +
        "await Promise.all(keys.map((k)=>caches.delete(k)));" +
        "await self.clients.claim();" +
        "})()));"
      );
    });

    app.use((req, res, next) => {
      const urlPath = (req.url || '/').split('?')[0] || '/';
      if (urlPath.startsWith('/src/') || urlPath.startsWith('/@')) {
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
      }
      next();
    });

    if (fs.existsSync(publicPath)) {
      app.use(express.static(publicPath));
    }

    // Cached production index.html may still request /assets/*.js while dev uses /src/main.tsx.
    // Never serve stale dist bundles in dev — return 404 (not SPA HTML) so the browser shows a clear error.
    app.use((req, res, next) => {
      const urlPath = (req.url || '/').split('?')[0] || '/';
      if (!isBundledAssetPath(urlPath)) {
        next();
        return;
      }

      res
        .status(404)
        .type('text/plain')
        .send(
          'Production asset requested in dev mode. Hard-refresh (Ctrl+Shift+R) — dev loads /src/main.tsx.'
        );
    });

    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      configFile: path.join(process.cwd(), 'vite.config.ts'),
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR === 'true' ? false : { server, host: '127.0.0.1', port: PORT },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);

    // Vite bỏ qua spa-fallback khi middlewareMode bật, nên các route client-side
    // (ví dụ /lenh-san-xuat) trả "Cannot GET" khi vào thẳng URL hoặc F5. Tự phục vụ
    // index.html (qua transformIndexHtml) cho mọi GET không phải API/asset để router phía client xử lý.
    app.get('*', async (req, res, next) => {
      const urlPath = (req.url || '/').split('?')[0] || '/';
      if (urlPath.startsWith('/api/') || isBundledAssetPath(urlPath)) {
        next();
        return;
      }

      try {
        const indexPath = path.join(process.cwd(), 'index.html');
        const rawHtml = await fs.promises.readFile(indexPath, 'utf-8');
        const html = await vite.transformIndexHtml(req.originalUrl, rawHtml);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
      } catch (error) {
        vite.ssrFixStacktrace(error as Error);
        next(error);
      }
    });
  } else {
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      const urlPath = (req.url || '/').split('?')[0] || '/';
      if (isBundledAssetPath(urlPath)) {
        res.status(404).type('text/plain').send('Asset not found');
        return;
      }
      res.set('Cache-Control', 'no-cache');
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[FULLSTACK] Server running on http://127.0.0.1:${PORT}`);
    console.log(
      `[FULLSTACK] Nếu http://localhost:${PORT} báo "Not Found", port IPv6 có thể bị app khác chiếm — dùng http://127.0.0.1:${PORT}`
    );
    getReportsFromDb();
    void ensureWarehouseSlipNumericColumns();
    void ensureSupabaseClockAligned();
  });
}

export function createApp() {
  const app = express();
  app.use(express.json({ limit: '12mb' }));

  app.use((req, _res, next) => {
    if (!process.env.VERCEL) {
      next();
      return;
    }

    const rawUrl = req.url || '/';
    const queryIndex = rawUrl.indexOf('?');
    const pathname = queryIndex >= 0 ? rawUrl.slice(0, queryIndex) : rawUrl;
    const query = queryIndex >= 0 ? rawUrl.slice(queryIndex) : '';

    if (!pathname.startsWith('/api')) {
      req.url = `/api${pathname.startsWith('/') ? pathname : `/${pathname}`}${query}`;
    }

    next();
  });

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      supabase: Boolean(supabase),
      supabaseUrl: SUPABASE_URL ? `${SUPABASE_URL.slice(0, 30)}...` : null,
      hasServiceKey: Boolean(process.env.SUPABASE_SERVICE_KEY),
      hasAnonKey: Boolean(process.env.SUPABASE_KEY || process.env.NEXT_PUBLIC_SUPABASE_KEY),
      keySource: process.env.SUPABASE_SERVICE_KEY
        ? 'SUPABASE_SERVICE_KEY'
        : process.env.SUPABASE_KEY
          ? 'SUPABASE_KEY'
          : process.env.NEXT_PUBLIC_SUPABASE_KEY
            ? 'NEXT_PUBLIC_SUPABASE_KEY'
            : 'none',
      vercel: Boolean(process.env.VERCEL),
      databases: {
        [SUPABASE_MAIN_DB_LABEL]: {
          connected: Boolean(supabase),
          url: SUPABASE_URL ? `${SUPABASE_URL.slice(0, 40)}...` : null,
          role: usingServiceKey ? 'service_role' : 'anon/public'
        },
        [SUPABASE_WEIGHING_DB_LABEL]: {
          connected: Boolean(supabaseWeighing),
          url: SUPABASE_WEIGHING_URL
            ? `${SUPABASE_WEIGHING_URL.slice(0, 40)}...`
            : SUPABASE_URL
              ? `${SUPABASE_URL.slice(0, 40)}... (fallback ${SUPABASE_MAIN_DB_LABEL})`
              : null,
          table: SUPABASE_WEIGHING_TABLE,
          canTuDong: SUPABASE_CAN_TU_DONG_TABLE,
          quanLyKho: SUPABASE_QUAN_LY_KHO_TABLE,
          role: supabaseWeighing
            ? usingWeighingServiceKey
              ? 'service_role'
              : 'anon/publishable'
            : usingServiceKey
              ? 'service_role'
              : 'anon/public'
        },
        [SUPABASE_KIEM_KHO_DB_LABEL]: {
          connected: Boolean(supabaseKiemKho),
          url: SUPABASE_KIEM_KHO_URL ? `${SUPABASE_KIEM_KHO_URL.slice(0, 40)}...` : null,
          kiemKho: SUPABASE_KIEM_KHO_TABLE,
          kiemKhoTongHop: SUPABASE_KIEM_KHO_TONG_HOP_TABLE,
          role: usingKiemKhoServiceKey ? 'service_role' : 'anon/publishable'
        }
      },
      tables: {
        reports: SUPABASE_TABLE,
        machines: SUPABASE_MACHINES_TABLE,
        materials: SUPABASE_MATERIALS_TABLE,
        orders: SUPABASE_ORDERS_TABLE,
        productionOrders: SUPABASE_PRODUCTION_ORDERS_TABLE,
        productionPlans: SUPABASE_PRODUCTION_PLANS_TABLE,
        weighing: SUPABASE_WEIGHING_TABLE,
        canTuDong: SUPABASE_CAN_TU_DONG_TABLE,
        kiemKho: SUPABASE_KIEM_KHO_TABLE,
        quanLyKho: SUPABASE_QUAN_LY_KHO_TABLE
      }
    });
  });

  app.get('/api/vietmap/config', (_req, res) => {
    return res.json({
      configured: Boolean(VIETMAP_SERVICES_KEY && VIETMAP_TILE_KEY),
      tileKey: VIETMAP_TILE_KEY || ''
    });
  });

  app.get('/api/vietmap/autocomplete', async (req, res) => {
    if (!VIETMAP_SERVICES_KEY) return res.status(503).json({ error: 'Chưa cấu hình VIETMAP_SERVICES_KEY.' });
    const query = typeof req.query.text === 'string' ? req.query.text.trim() : '';
    if (query.length < 2) return res.json({ rows: [] });
    try {
      const params = new URLSearchParams({
        apikey: VIETMAP_SERVICES_KEY,
        text: query,
        display_type: '5'
      });
      const response = await fetchWithTimeoutAndRetry(`${VIETMAP_API_URL}/autocomplete/v4?${params}`);
      const payload: any = await response.json().catch(() => null);
      if (!response.ok) return res.status(response.status).json({ error: payload?.message || 'Vietmap không thể gợi ý địa chỉ.' });
      const rows = Array.isArray(payload) ? payload : [];
      return res.json({
        rows: rows.slice(0, 8).map((row: any) => ({
          refId: String(row?.ref_id || row?.refid || ''),
          name: String(row?.name || ''),
          address: String(row?.address || ''),
          display: String(row?.display || [row?.name, row?.address].filter(Boolean).join(', '))
        })).filter((row: any) => row.refId)
      });
    } catch (error: any) {
      return res.status(502).json({ error: error?.message || 'Không thể kết nối Vietmap.' });
    }
  });

  app.get('/api/vietmap/place', async (req, res) => {
    if (!VIETMAP_SERVICES_KEY) return res.status(503).json({ error: 'Chưa cấu hình VIETMAP_SERVICES_KEY.' });
    const refId = typeof req.query.refid === 'string' ? req.query.refid.trim() : '';
    if (!refId) return res.status(400).json({ error: 'Thiếu refid địa chỉ Vietmap.' });
    try {
      const params = new URLSearchParams({ apikey: VIETMAP_SERVICES_KEY, refid: refId });
      const response = await fetchWithTimeoutAndRetry(`${VIETMAP_API_URL}/place/v4?${params}`);
      const payload: any = await response.json().catch(() => null);
      if (!response.ok) return res.status(response.status).json({ error: payload?.message || 'Không thể lấy tọa độ địa chỉ.' });
      const latitude = Number(payload?.lat);
      const longitude = Number(payload?.lng);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return res.status(502).json({ error: 'Vietmap không trả về tọa độ hợp lệ.' });
      }
      return res.json({
        display: String(payload?.display || payload?.address || ''),
        latitude,
        longitude
      });
    } catch (error: any) {
      return res.status(502).json({ error: error?.message || 'Không thể kết nối Vietmap.' });
    }
  });

  app.post('/api/vietmap/route', async (req, res) => {
    if (!VIETMAP_SERVICES_KEY) return res.status(503).json({ error: 'Chưa cấu hình VIETMAP_SERVICES_KEY.' });
    const rawPoints = Array.isArray(req.body?.points) ? req.body.points : [];
    const points = rawPoints.map((point: any) => ({
      latitude: Number(point?.latitude ?? point?.lat),
      longitude: Number(point?.longitude ?? point?.lng)
    })).filter((point: any) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude));
    if (points.length < 2) return res.status(400).json({ error: 'Cần ít nhất 2 điểm hợp lệ để tính tuyến.' });
    if (points.length > 20) return res.status(400).json({ error: 'Một tuyến hỗ trợ tối đa 20 điểm.' });
    const allowedVehicles = new Set(['car', 'motorcycle', 'truck', 'container']);
    const vehicle = allowedVehicles.has(String(req.body?.vehicle)) ? String(req.body.vehicle) : 'car';

    const buildParams = (extra: Record<string, string> = {}) => {
      const params = new URLSearchParams({ apikey: VIETMAP_SERVICES_KEY, vehicle, ...extra });
      points.forEach(point => params.append('point', `${point.latitude},${point.longitude}`));
      return params;
    };

    try {
      const [routeResponse, distanceResponse, durationResponse] = await Promise.all([
        fetchWithTimeoutAndRetry(`${VIETMAP_API_URL}/route/v4?${buildParams({ points_encoded: 'false' })}`),
        fetchWithTimeoutAndRetry(`${VIETMAP_API_URL}/matrix/v4?${buildParams({ annotation: 'distance' })}`),
        fetchWithTimeoutAndRetry(`${VIETMAP_API_URL}/matrix/v4?${buildParams({ annotation: 'duration' })}`)
      ]);
      const [routePayload, distancePayload, durationPayload]: any[] = await Promise.all([
        routeResponse.json().catch(() => null),
        distanceResponse.json().catch(() => null),
        durationResponse.json().catch(() => null)
      ]);
      if (!routeResponse.ok) return res.status(routeResponse.status).json({ error: routePayload?.message || routePayload?.messages || 'Vietmap không thể tính tuyến.' });
      const path = routePayload?.paths?.[0];
      if (!path) return res.status(502).json({ error: 'Vietmap không tìm thấy hành trình phù hợp.' });
      const rawCoordinates = Array.isArray(path.points?.coordinates)
        ? path.points.coordinates
        : Array.isArray(path.points) ? path.points : [];
      const coordinates = rawCoordinates.map((coordinate: any) => {
        const first = Number(coordinate?.[0]);
        const second = Number(coordinate?.[1]);
        return Math.abs(first) > 90 ? [first, second] : [second, first];
      }).filter((coordinate: number[]) => coordinate.every(Number.isFinite));
      const distances = Array.isArray(distancePayload?.distances) ? distancePayload.distances : [];
      const durations = Array.isArray(durationPayload?.durations) ? durationPayload.durations : [];
      const legs = points.slice(0, -1).map((_, index) => ({
        distanceMeters: Number(distances?.[index]?.[index + 1]) || 0,
        durationSeconds: Number(durations?.[index]?.[index + 1]) || 0
      }));
      return res.json({
        distanceMeters: Number(path.distance) || legs.reduce((sum, leg) => sum + leg.distanceMeters, 0),
        durationSeconds: Math.round((Number(path.time) || 0) / 1000) || legs.reduce((sum, leg) => sum + leg.durationSeconds, 0),
        coordinates,
        legs
      });
    } catch (error: any) {
      return res.status(502).json({ error: error?.message || 'Không thể kết nối Vietmap để tính tuyến.' });
    }
  });

  // API Route: Get all reports
  app.get('/api/reports', async (_req, res) => {
    try {
      const list = await getReportsFromDb();
      const sorted = [...(list || [])].sort(
        (a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? ''))
      );
      return res.json(sorted);
    } catch (err: any) {
      console.error('GET /api/reports error:', err);
      try {
        const fallback = await getReportsFromLocalFile();
        return res.json(
          [...fallback].sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')))
        );
      } catch (fallbackErr) {
        console.error('GET /api/reports fallback error:', fallbackErr);
        return res.json(getSeedReports());
      }
    }
  });

  app.post('/api/reports', async (req, res) => {
    try {
      const reportData = req.body;
      
      if (!reportData.date || !reportData.shiftInfo || !reportData.productEntry) {
        return res.status(400).json({ error: 'Yêu cầu điền đầy đủ dữ liệu bắt buộc!' });
      }

      const newReport: ProductionReport = {
        ...reportData,
        id: `rep_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        createdAt: new Date().toISOString()
      };

      if (supabase) {
        const { data, error } = await supabase
          .from(SUPABASE_TABLE)
          .insert(newReport)
          .select()
          .single();

        if (!error && data) {
          return res.status(201).json(data as ProductionReport);
        }

        if (error) {
          if (isMissingTableError(error)) {
            console.warn(`[SUPABASE] Bảng ${SUPABASE_TABLE} chưa tồn tại — lưu file local. Chạy supabase-reports.sql.`);
          } else {
            console.error('Supabase insert error:', error);
          }
        }
      }

      const list = await getReportsFromDb();
      list.push(newReport);
      const success = await saveReportsToDb(list);

      if (success) {
        res.status(201).json(newReport);
      } else {
        res.status(500).json({ error: 'Không thể ghi lưu báo cáo mới vào cơ sở dữ liệu!' });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Lỗi hệ thống không xác định' });
    }
  });

  app.get('/api/san-pham', async (req, res) => {
    if (!supabase) {
      return res.json([]);
    }

    try {
      const format = typeof req.query.format === 'string' ? req.query.format : 'list';
      if (format === 'table') {
        const { data, error } = await supabase
          .from(SUPABASE_PRODUCTS_TABLE)
          .select('*')
          .order('created_at', { ascending: false, nullsFirst: false })
          .order('id', { ascending: false });

        if (error) {
          return respondSupabaseReadError(res, error, SUPABASE_PRODUCTS_TABLE, { products: [], total: 0 });
        }

        return res.json({
          products: data || [],
          total: data?.length || 0,
          source: 'supabase'
        });
      }

      const { data, error } = await supabase
        .from(SUPABASE_PRODUCTS_TABLE)
        .select('ten_sp, ma_sp, ma_sp_moi')
        .not('ten_sp', 'is', null)
        .order('ten_sp', { ascending: true });

      if (error) {
        console.error('Supabase san_pham query error:', error);
        return respondSupabaseReadError(res, error, SUPABASE_PRODUCTS_TABLE, { products: [] });
      }

      const unique = new Map<string, { productName: string; productCode: string; newCode: string }>();
      (data || []).forEach((row) => {
        const productName = String(row.ten_sp ?? '').trim();
        const productCode = String(row.ma_sp ?? '').trim();
        const newCode = String(row.ma_sp_moi ?? '').trim();
        if (!productName) return;
        const key = `${productCode}|${productName}`;
        if (!unique.has(key)) {
          unique.set(key, { productName, productCode, newCode });
        }
      });

      const products = [...unique.values()];

      return res.json(products);
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi tải danh sách sản phẩm.' });
    }
  });

  app.post('/api/san-pham', async (req, res) => {
    if (!supabase) {
      return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });
    }

    try {
      const parsedProduct = parseProductPatchBody(req.body);
      if ('error' in parsedProduct) {
        return res.status(400).json({ error: parsedProduct.error });
      }

      const { data, error } = await supabase
        .from(SUPABASE_PRODUCTS_TABLE)
        .insert(parsedProduct.record)
        .select('*')
        .single();

      if (error) {
        console.error('Supabase san_pham insert error:', error);
        return res.status(500).json({ error: productWriteErrorMessage(error) });
      }

      return res.status(201).json({ success: true, product: data });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi tạo sản phẩm.' });
    }
  });

  app.get('/api/san-pham/:id/ma-chi-tiet', async (req, res) => {
    if (!supabase) {
      return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });
    }

    try {
      const productId = String(req.params.id || '').trim();
      if (!productId) return res.status(400).json({ error: 'Thiếu ID sản phẩm.' });

      const { data, error } = await supabase
        .from(SUPABASE_PRODUCT_CODES_TABLE)
        .select('*')
        .eq('san_pham_id', productId)
        .order('created_at', { ascending: true });

      if (error) {
        const missingMigration = isMissingTableError(error);
        return res.status(500).json({
          error: missingMigration
            ? 'Chưa có bảng mã sản phẩm chi tiết. Hãy chạy file supabase-san-pham-ma-chi-tiet.sql.'
            : error.message || 'Không thể tải mã sản phẩm chi tiết.'
        });
      }

      return res.json({ records: data || [], total: data?.length || 0 });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || 'Lỗi khi tải mã sản phẩm chi tiết.' });
    }
  });

  /** Nhật ký xuất/nhập kho thành phẩm theo mã SP (bảng phieu_xuat_nhap_kho). */
  app.get('/api/san-pham/:id/phieu-kho', async (req, res) => {
    if (!supabase) {
      return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });
    }

    try {
      const productId = String(req.params.id || '').trim();
      if (!productId) return res.status(400).json({ error: 'Thiếu ID sản phẩm.' });

      const loaiRaw = String(req.query.loai ?? req.query.type ?? '').trim().toLowerCase();
      const loai =
        loaiRaw === 'xuat' || loaiRaw === 'export' || loaiRaw === 'out'
          ? 'xuat'
          : loaiRaw === 'nhap' || loaiRaw === 'import' || loaiRaw === 'in'
            ? 'nhap'
            : null;
      if (!loai) {
        return res.status(400).json({ error: 'Thiếu loại phiếu (loai=nhap|xuat).' });
      }

      const normalizeKey = (code: unknown) =>
        String(code ?? '')
          .trim()
          .replace(/[\s\u00A0\u1680\u2000-\u200B\u202F\u205F\u3000\uFEFF]+/g, '')
          .toUpperCase();

      const { data: product, error: productError } = await supabase
        .from(SUPABASE_PRODUCTS_TABLE)
        .select('id, ma_sp, ma_sp_moi, ma_amis, ten_sp')
        .eq('id', productId)
        .maybeSingle();

      if (productError) {
        return res.status(500).json({ error: productError.message || 'Không thể tải sản phẩm.' });
      }
      if (!product) {
        return res.status(404).json({ error: 'Không tìm thấy sản phẩm.' });
      }

      const codeVariants = [
        ...new Set(
          [product.ma_sp, product.ma_sp_moi, product.ma_amis]
            .map(value => String(value ?? '').trim())
            .filter(Boolean)
            .flatMap(code => [code, code.replace(/[\s\u00A0]+/g, '')])
        )
      ];
      const codeKeys = [
        ...new Set(codeVariants.map(normalizeKey).filter(Boolean))
      ];

      if (codeKeys.length === 0) {
        return res.json({ movements: [], total: 0, loai, source: 'supabase' });
      }

      let query = supabase
        .from(SUPABASE_WAREHOUSE_MOVEMENTS_TABLE)
        .select('*')
        .eq('loai_phieu', loai)
        .eq('treo', false)
        .order('ngay_phieu', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false, nullsFirst: false })
        .limit(2000);

      // Ưu tiên khớp đúng mã; thêm or like tiền tố để bắt dòng serial (mã đầy đủ).
          const orParts: string[] = [];
          for (const code of codeVariants) {
            const safe = String(code).replace(/"/g, '');
            orParts.push(`ma_sp.eq."${safe}"`);
            orParts.push(`ma_sp.like."${safe}%"`);
          }
      if (orParts.length > 0) {
        query = query.or(orParts.join(','));
      }

      const { data, error } = await query;
      if (error) {
        console.error('Supabase san-pham phieu-kho error:', error);
        return res.status(500).json({
          error: `Không thể tải nhật ký xuất nhập kho. ${error.message}`
        });
      }

      const movements = (data || []).filter(row => {
        const maSp = String((row as { ma_sp?: string }).ma_sp ?? '').trim();
        const key = normalizeKey(maSp);
        if (!key) return false;
        return codeKeys.some(
          productKey => key === productKey || key.startsWith(`${productKey}_`) || key.startsWith(`${productKey}-`)
        );
      });

      return res.json({
        movements,
        total: movements.length,
        loai,
        ma_sp: product.ma_sp,
        source: 'supabase'
      });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || 'Lỗi khi tải nhật ký xuất nhập kho theo SP.' });
    }
  });

  app.post('/api/ma-san-pham/danh-dau-in', async (req, res) => {
    if (!supabase) {
      return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });
    }

    const codes = Array.isArray(req.body?.codes)
      ? req.body.codes.map((code: unknown) => String(code ?? '').trim()).filter(Boolean)
      : [];
    if (codes.length === 0) {
      return res.status(400).json({ error: 'Không có mã QR để đánh dấu in.' });
    }

    const { data, error } = await supabase.rpc('danh_dau_in_ma_san_pham', { p_codes: codes });
    if (error) {
      return res.status(500).json({
        error: /danh_dau_in_ma_san_pham/i.test(error.message || '') || error.code === 'PGRST202'
          ? 'Thiếu hàm lưu lịch sử in. Hãy chạy lại file supabase-san-pham-ma-chi-tiet.sql.'
          : error.message || 'Không thể lưu lịch sử in QR.'
      });
    }

    return res.json({ success: true, updated: Number(data) || 0 });
  });

  app.delete('/api/san-pham', async (req, res) => {
    if (!supabase) {
      return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });
    }

    try {
      const rawIds = Array.isArray(req.body?.ids)
        ? req.body.ids.map((id: unknown) => String(id ?? '').trim()).filter(Boolean)
        : [];

      if (rawIds.length === 0) {
        return res.status(400).json({ error: 'Vui lòng chọn ít nhất một sản phẩm để xóa.' });
      }

      const uuidIds = rawIds.filter((id: string) => isUuidValue(id));
      const codeIds = rawIds.filter((id: string) => !isUuidValue(id));
      const resolvedIds = new Set<string>(uuidIds);

      if (codeIds.length > 0) {
        const { data: byCode, error: codeLookupError } = await supabase
          .from(SUPABASE_PRODUCTS_TABLE)
          .select('id')
          .in('ma_sp', codeIds);

        if (codeLookupError) {
          console.error('Supabase san_pham lookup by ma_sp error:', codeLookupError);
          return res.status(500).json({
            error: `Không thể tra sản phẩm theo mã. ${codeLookupError.message}`
          });
        }

        for (const row of byCode || []) {
          const id = String(row.id ?? '').trim();
          if (id) resolvedIds.add(id);
        }
      }

      const ids = Array.from(resolvedIds);
      if (ids.length === 0) {
        return res.status(404).json({ error: 'Không tìm thấy sản phẩm cần xóa.' });
      }

      // Ưu tiên RPC SECURITY DEFINER (không bị RLS chặn mã chi tiết).
      const { data: rpcData, error: rpcError } = await supabase.rpc('xoa_san_pham_hang_loat', {
        p_ids: ids
      });

      if (!rpcError) {
        const result = rpcData && typeof rpcData === 'object' ? (rpcData as Record<string, unknown>) : {};
        if (result.success === false) {
          return res.status(400).json({
            error: String(result.error || 'Không thể xóa sản phẩm.')
          });
        }
        return res.json({
          success: true,
          deleted: Number(result.deleted) || 0,
          deleted_codes: Number(result.deleted_codes) || 0,
          ids
        });
      }

      // Fallback nếu chưa chạy SQL tạo RPC: xóa mã chi tiết rồi xóa SP.
      // (Cần FK ON DELETE CASCADE hoặc policy DELETE — xem supabase-ma-san-pham-chi-tiet-delete.sql)
      console.warn('RPC xoa_san_pham_hang_loat unavailable, fallback delete:', rpcError.message);

      const { error: codesError } = await supabase
        .from(SUPABASE_PRODUCT_CODES_TABLE)
        .delete()
        .in('san_pham_id', ids);

      if (codesError) {
        console.error('Supabase ma_san_pham_chi_tiet cascade delete error:', codesError);
        return res.status(500).json({
          error: `Không thể xóa mã chi tiết liên quan. Chạy file supabase-ma-san-pham-chi-tiet-delete.sql trên Supabase. ${codesError.message}`
        });
      }

      const { count: remainingCodes, error: remainError } = await supabase
        .from(SUPABASE_PRODUCT_CODES_TABLE)
        .select('id', { count: 'exact', head: true })
        .in('san_pham_id', ids);

      if (remainError) {
        console.error('Supabase ma_san_pham_chi_tiet remain check error:', remainError);
      } else if ((remainingCodes || 0) > 0) {
        return res.status(500).json({
          error:
            `Vẫn còn ${remainingCodes} mã chi tiết gắn sản phẩm (RLS/quyền DELETE). ` +
            'Hãy chạy lại toàn bộ file supabase-ma-san-pham-chi-tiet-delete.sql trên Supabase SQL Editor.'
        });
      }

      const { data, error } = await supabase
        .from(SUPABASE_PRODUCTS_TABLE)
        .delete()
        .in('id', ids)
        .select('id');

      if (error) {
        console.error('Supabase san_pham bulk delete error:', error);
        return res.status(500).json({
          error:
            `Không thể xóa sản phẩm. ${error.message}. ` +
            'Chạy file supabase-ma-san-pham-chi-tiet-delete.sql (đổi FK CASCADE + RPC) rồi thử lại.'
        });
      }

      return res.json({
        success: true,
        deleted: data?.length || 0,
        ids: (data || []).map(row => row.id)
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi xóa sản phẩm.' });
    }
  });

  app.patch('/api/san-pham', async (req, res) => {
    if (!supabase) {
      return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });
    }

    try {
      const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
      const group = parseMaterialText(body.group ?? body.nhom_vthh);
      const requestedWarehouse = parseMaterialText(body.warehouse ?? body.ten_kho);
      const requestedIds = Array.isArray(body.ids)
        ? Array.from(
            new Set(
              body.ids
                .map(value => String(value ?? '').trim())
                .filter(Boolean)
            )
          )
        : [];
      if (requestedIds.length === 0 && !group) {
        return res.status(400).json({ error: 'Vui lòng chọn sản phẩm hoặc nhóm VTHH cần đổi kho.' });
      }
      if (!requestedWarehouse) {
        return res.status(400).json({ error: 'Vui lòng chọn kho lưu trữ.' });
      }

      const normalizeWarehouseKey = (value: string) =>
        value
          .trim()
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/đ/g, 'd');

      const { data: warehouseRows, error: warehouseError } = await supabase
        .from(SUPABASE_QUAN_LY_KHO_TABLE)
        .select('ten_kho');
      if (warehouseError) {
        console.warn('Supabase quan_ly_kho lookup for bulk warehouse update:', warehouseError.message);
      }
      const warehouseNames = (warehouseRows || [])
        .map(row => String(row.ten_kho ?? '').trim())
        .filter(Boolean);
      const requestedKey = normalizeWarehouseKey(requestedWarehouse);
      const warehouseName =
        warehouseNames.find(name => normalizeWarehouseKey(name) === requestedKey) || requestedWarehouse;
      const warehouseKey = normalizeWarehouseKey(warehouseName);

      const idsToUpdate: string[] = [];
      if (requestedIds.length > 0) {
        const CHUNK_SIZE = 200;
        for (let index = 0; index < requestedIds.length; index += CHUNK_SIZE) {
          const chunk = requestedIds.slice(index, index + CHUNK_SIZE);
          const { data, error } = await supabase
            .from(SUPABASE_PRODUCTS_TABLE)
            .select('id, ten_kho')
            .in('id', chunk);
          if (error) {
            console.error('Supabase san_pham bulk warehouse id lookup error:', error);
            return res.status(500).json({ error: productWriteErrorMessage(error) });
          }
          for (const row of data || []) {
            if (normalizeWarehouseKey(String(row.ten_kho ?? '')) === warehouseKey) continue;
            const id = String(row.id ?? '').trim();
            if (id) idsToUpdate.push(id);
          }
        }
      } else {
        const groupKey = group.trim().toUpperCase();
        const PAGE_SIZE = 1000;
        let from = 0;
        while (true) {
          const { data, error } = await supabase
            .from(SUPABASE_PRODUCTS_TABLE)
            .select('id, nhom_vthh, ten_kho')
            .range(from, from + PAGE_SIZE - 1);
          if (error) {
            console.error('Supabase san_pham bulk warehouse scan error:', error);
            return res.status(500).json({ error: productWriteErrorMessage(error) });
          }
          const page = data || [];
          for (const row of page) {
            if (String(row.nhom_vthh ?? '').trim().toUpperCase() !== groupKey) continue;
            if (normalizeWarehouseKey(String(row.ten_kho ?? '')) === warehouseKey) continue;
            const id = String(row.id ?? '').trim();
            if (id) idsToUpdate.push(id);
          }
          if (page.length < PAGE_SIZE) break;
          from += PAGE_SIZE;
        }
      }

      if (idsToUpdate.length === 0) {
        return res.json({
          success: true,
          updated: 0,
          ten_kho: warehouseName,
          nhom_vthh: group || null
        });
      }

      let updated = 0;
      const CHUNK_SIZE = 200;
      for (let index = 0; index < idsToUpdate.length; index += CHUNK_SIZE) {
        const chunk = idsToUpdate.slice(index, index + CHUNK_SIZE);
        const { data, error } = await supabase
          .from(SUPABASE_PRODUCTS_TABLE)
          .update({ ten_kho: warehouseName })
          .in('id', chunk)
          .select('id');
        if (error) {
          console.error('Supabase san_pham bulk warehouse update error:', error);
          return res.status(500).json({ error: productWriteErrorMessage(error) });
        }
        updated += data?.length || 0;
      }

      return res.json({
        success: true,
        updated,
        ten_kho: warehouseName,
        nhom_vthh: group || null
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi đổi kho theo bộ lọc.' });
    }
  });

  app.patch('/api/san-pham/:id', async (req, res) => {
    if (!supabase) {
      return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });
    }

    try {
      const id = String(req.params.id || '').trim();
      if (!id) {
        return res.status(400).json({ error: 'Thiếu ID sản phẩm.' });
      }

      const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
      const nplInput = body.npl_phan_tram ?? body.nplPhanTram ?? body.nplItems;
      const hasNplInput = nplInput !== undefined && nplInput !== null;
      const updateRecord: Record<string, unknown> = {};

      if (hasNplInput) {
        const parsedNpl = parseProductNplPhanTramInput(nplInput);
        if ('error' in parsedNpl) {
          return res.status(400).json({ error: parsedNpl.error });
        }
        updateRecord.npl_phan_tram = parsedNpl.items;
      }

      const productFieldKeys = [
        'code', 'ma_sp', 'newCode', 'ma_sp_moi', 'amisCode', 'ma_amis', 'name', 'ten_sp', 'nature', 'tinh_chat', 'group', 'nhom_vthh',
        'unit', 'don_vi', 'openingStock', 'ton_dau_ky', 'inbound', 'nhap_trong_ky', 'outbound', 'xuat_trong_ky',
        'stock', 'sl_ton', 'minStock', 'so_luong_ton_toi_thieu',
        'origin', 'nguon_goc', 'description', 'mo_ta',
        'totalWeight', 'tong_trong_luong', 'rollWidth', 'kho_cuon', 'rollLength', 'chieu_dai_cuon',
        'coreWeight', 'trong_luong_loi', 'bagWeight', 'trong_luong_tui', 'plasticWeight', 'trong_luong_nhua',
        'warehouse', 'ten_kho'
      ];
      const hasProductFields = productFieldKeys.some(key => Object.prototype.hasOwnProperty.call(body, key));

      if (hasProductFields) {
        const parsedProduct = parseProductPatchBody(body);
        if ('error' in parsedProduct) {
          return res.status(400).json({ error: parsedProduct.error });
        }
        Object.assign(updateRecord, parsedProduct.record);
      }

      if (Object.keys(updateRecord).length === 0) {
        return res.status(400).json({ error: 'Không có dữ liệu để cập nhật.' });
      }

      const { data, error } = await supabase
        .from(SUPABASE_PRODUCTS_TABLE)
        .update(updateRecord)
        .eq('id', id)
        .select('*')
        .single();

      if (error) {
        console.error('Supabase san_pham update error:', error);
        return res.status(500).json({ error: productWriteErrorMessage(error) });
      }

      if (!data) {
        return res.status(404).json({ error: 'Không tìm thấy sản phẩm cần cập nhật.' });
      }

      return res.json({ success: true, product: data });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi cập nhật sản phẩm.' });
    }
  });

  app.get('/api/import-sp', async (req, res) => {
    if (!supabase) {
      return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });
    }

    try {
      const limitRaw = Number(req.query.limit);
      const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.floor(limitRaw), 2000) : 500;
      const batchId = typeof req.query.batch_id === 'string' ? req.query.batch_id.trim() : '';

      let query = supabase
        .from(SUPABASE_IMPORT_SP_TABLE)
        .select('*')
        .order('imported_at', { ascending: false })
        .order('so_dong_excel', { ascending: true })
        .limit(limit);

      if (batchId) {
        query = query.eq('batch_id', batchId);
      }

      const { data, error } = await query;
      if (error) {
        console.error('Supabase import_sp query error:', error);
        return res.status(500).json({
          error: `Không thể tải ${SUPABASE_IMPORT_SP_TABLE}. ${error.message}`
        });
      }

      return res.json({
        rows: data || [],
        total: data?.length || 0,
        source: 'supabase'
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi tải import_sp.' });
    }
  });

  app.post('/api/import-sp', async (req, res) => {
    if (!supabase) {
      return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });
    }

    try {
      const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
      const fileName = String(body.file_name ?? body.fileName ?? '').trim() || null;
      const importedBy = String(body.imported_by ?? body.importedBy ?? '').trim() || null;
      const list = Array.isArray(body.rows) ? body.rows : [];
      if (list.length === 0) {
        return res.status(400).json({ error: 'Không có dòng Excel để ghi vào import_sp.' });
      }

      const batchId =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

      const records = list
        .map((entry, index) => {
          if (!entry || typeof entry !== 'object') return null;
          const row = entry as Record<string, unknown>;
          const ma_sp = String(row.ma_sp ?? row.maSp ?? '').trim();
          const ma_nvl = String(row.ma_nvl ?? row.maNvl ?? '').trim();
          if (!ma_sp || !ma_nvl) return null;

          const parseNum = (value: unknown) => {
            if (value === null || value === undefined || value === '') return null;
            const n = typeof value === 'number' ? value : Number(String(value).trim().replace(/\s/g, '').replace(',', '.'));
            return Number.isFinite(n) && n >= 0 ? n : null;
          };

          return {
            ma_sp,
            ma_nvl,
            ten_nvl: String(row.ten_nvl ?? row.tenNvl ?? '').trim() || null,
            loai: String(row.loai ?? '').trim() || null,
            gia_tri: parseNum(row.gia_tri ?? row.giaTri),
            dvt: String(row.dvt ?? '').trim() || null,
            phan_tram: parseNum(row.phan_tram ?? row.phanTram),
            so_luong: parseNum(row.so_luong ?? row.soLuong),
            khoi_luong_kg: parseNum(row.khoi_luong_kg ?? row.khoiLuongKg),
            don_vi: String(row.don_vi ?? row.donVi ?? '').trim() || null,
            batch_id: batchId,
            file_name: fileName,
            so_dong_excel:
              Number.isFinite(Number(row.so_dong_excel ?? row.soDongExcel))
                ? Number(row.so_dong_excel ?? row.soDongExcel)
                : index + 1,
            trang_thai: 'moi',
            imported_by: importedBy
          };
        })
        .filter((row): row is NonNullable<typeof row> => Boolean(row));

      if (records.length === 0) {
        return res.status(400).json({ error: 'Không có dòng hợp lệ (cần Mã SP + Mã NVL).' });
      }

      const chunkSize = 200;
      let inserted = 0;
      for (let i = 0; i < records.length; i += chunkSize) {
        const chunk = records.slice(i, i + chunkSize);
        const { error } = await supabase.from(SUPABASE_IMPORT_SP_TABLE).insert(chunk);
        if (error) {
          console.error('Supabase import_sp insert error:', error);
          return res.status(500).json({
            error: `Không thể ghi ${SUPABASE_IMPORT_SP_TABLE}. ${error.message}`,
            batch_id: batchId,
            inserted
          });
        }
        inserted += chunk.length;
      }

      return res.json({
        success: true,
        batch_id: batchId,
        inserted,
        file_name: fileName
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi ghi import_sp.' });
    }
  });

  /** Đồng bộ import_sp → san_pham.npl_phan_tram theo mã SP (bỏ khoảng trắng khi khớp). */
  app.post('/api/import-sp/dong-bo', async (req, res) => {
    if (!supabase) {
      return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });
    }

    try {
      const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
      const batchId = String(body.batch_id ?? body.batchId ?? '').trim();
      const onlyMoi = body.only_moi !== false && body.onlyMoi !== false;

      const normalizeKey = (code: unknown) =>
        String(code ?? '')
          .trim()
          .replace(/[\s\u00A0\u1680\u2000-\u200B\u202F\u205F\u3000\uFEFF]+/g, '')
          .toUpperCase();

      const pageSize = 1000;
      const importRows: Record<string, unknown>[] = [];
      for (let from = 0; ; from += pageSize) {
        let query = supabase
          .from(SUPABASE_IMPORT_SP_TABLE)
          .select('*')
          .order('imported_at', { ascending: true })
          .order('so_dong_excel', { ascending: true })
          .range(from, from + pageSize - 1);
        if (onlyMoi) query = query.eq('trang_thai', 'moi');
        if (batchId) query = query.eq('batch_id', batchId);
        const { data, error } = await query;
        if (error) {
          console.error('Supabase import_sp dong-bo load error:', error);
          return res.status(500).json({
            error: `Không thể tải ${SUPABASE_IMPORT_SP_TABLE}. ${error.message}`
          });
        }
        if (!data || data.length === 0) break;
        importRows.push(...(data as Record<string, unknown>[]));
        if (data.length < pageSize) break;
      }

      if (importRows.length === 0) {
        return res.status(400).json({
          error: onlyMoi
            ? 'Không có dòng import_sp trạng thái «moi» để đồng bộ. Hãy nhập Excel trước.'
            : 'Không có dòng import_sp để đồng bộ.'
        });
      }

      const { data: products, error: productError } = await supabase
        .from(SUPABASE_PRODUCTS_TABLE)
        .select('id, ma_sp, ma_sp_moi, ma_amis, ten_sp');
      if (productError) {
        return res.status(500).json({
          error: `Không thể tải ${SUPABASE_PRODUCTS_TABLE}. ${productError.message}`
        });
      }

      const productByKey = new Map<string, { id: string; ma_sp: string }>();
      for (const product of products || []) {
        const row = product as { id: string; ma_sp?: string; ma_sp_moi?: string; ma_amis?: string };
        for (const code of [row.ma_sp, row.ma_sp_moi, row.ma_amis]) {
          const key = normalizeKey(code);
          if (key && !productByKey.has(key)) {
            productByKey.set(key, { id: row.id, ma_sp: String(row.ma_sp || code || '') });
          }
        }
      }

      type AggNvl = {
        ma_npl: string;
        ten_npl: string;
        phan_tram: number | null;
        so_luong: number | null;
        khoi_luong_kg: number | null;
        don_vi: string | null;
        importIds: string[];
      };

      const byProduct = new Map<string, { product: { id: string; ma_sp: string } | null; nvl: Map<string, AggNvl>; importIds: string[] }>();

      for (const row of importRows) {
        const maSp = String(row.ma_sp ?? '').trim();
        const maNvl = String(row.ma_nvl ?? '').trim();
        const id = String(row.id ?? '').trim();
        if (!maSp || !maNvl) continue;
        const productKey = normalizeKey(maSp);
        const nvlKey = normalizeKey(maNvl);
        if (!productKey || !nvlKey) continue;

        let bucket = byProduct.get(productKey);
        if (!bucket) {
          bucket = {
            product: productByKey.get(productKey) || null,
            nvl: new Map(),
            importIds: []
          };
          byProduct.set(productKey, bucket);
        }
        if (id) bucket.importIds.push(id);

        let agg = bucket.nvl.get(nvlKey);
        if (!agg) {
          agg = {
            ma_npl: maNvl,
            ten_npl: String(row.ten_nvl ?? '').trim() || maNvl,
            phan_tram: null,
            so_luong: null,
            khoi_luong_kg: null,
            don_vi: null,
            importIds: []
          };
          bucket.nvl.set(nvlKey, agg);
        }
        if (id) agg.importIds.push(id);
        const ten = String(row.ten_nvl ?? '').trim();
        if (ten) agg.ten_npl = ten;

        const phanTram = parseServerNumber(row.phan_tram);
        const soLuong = parseServerNumber(row.so_luong);
        const khoiLuong = parseServerNumber(row.khoi_luong_kg);
        const dvt = String(row.dvt ?? row.don_vi ?? '').trim();
        const dvtNorm = dvt.toLowerCase().replace(/[^a-z%]/g, '');

        if (Number.isFinite(phanTram) && phanTram >= 0) {
          agg.phan_tram = phanTram;
          if (!agg.don_vi) agg.don_vi = '%';
        }
        if (Number.isFinite(khoiLuong) && khoiLuong >= 0) {
          agg.khoi_luong_kg = khoiLuong;
        }
        // SL thực (Cái…): > 0 hoặc ĐVT không phải kg/% — bỏ so_luong=0 của dòng chỉ Kg
        if (Number.isFinite(soLuong) && soLuong >= 0) {
          const isKgUnit = dvtNorm.startsWith('kg');
          const isPercentUnit = dvtNorm === '%' || dvtNorm.includes('phantram');
          if (!isKgUnit && !isPercentUnit && (soLuong > 0 || Boolean(dvt))) {
            agg.so_luong = soLuong;
            agg.don_vi = dvt || agg.don_vi || 'Cái';
          } else if (agg.so_luong === null && !isKgUnit && soLuong > 0) {
            agg.so_luong = soLuong;
            agg.don_vi = dvt || agg.don_vi;
          }
        }
        if (!agg.don_vi && dvt) agg.don_vi = dvt;
      }

      let updatedProducts = 0;
      let updatedLines = 0;
      const appliedImportIds: string[] = [];
      const missingProductCodes: string[] = [];
      const failures: string[] = [];

      for (const [productKey, bucket] of byProduct.entries()) {
        if (!bucket.product) {
          missingProductCodes.push(productKey);
          continue;
        }

        const items: ProductNplPhanTramItem[] = [];
        for (const agg of bucket.nvl.values()) {
          const weightKg =
            agg.khoi_luong_kg !== null && Number.isFinite(agg.khoi_luong_kg) && agg.khoi_luong_kg >= 0
              ? agg.khoi_luong_kg
              : null;
          const hasPercent = agg.phan_tram !== null && Number.isFinite(agg.phan_tram);
          const hasQty = agg.so_luong !== null && Number.isFinite(agg.so_luong) && agg.so_luong > 0;

          if (hasPercent) {
            items.push({
              ma_npl: agg.ma_npl,
              ten_npl: agg.ten_npl,
              loai: 'phan_tram',
              phan_tram: agg.phan_tram,
              so_luong: null,
              don_vi: '%',
              khoi_luong_kg: weightKg
            });
          } else if (hasQty) {
            items.push({
              ma_npl: agg.ma_npl,
              ten_npl: agg.ten_npl,
              loai: 'so_luong',
              phan_tram: null,
              so_luong: agg.so_luong,
              don_vi: agg.don_vi || 'Cái',
              khoi_luong_kg: weightKg
            });
          } else if (weightKg !== null) {
            // Chỉ có Kg (vd BDT 0.0085)
            items.push({
              ma_npl: agg.ma_npl,
              ten_npl: agg.ten_npl,
              loai: 'so_luong',
              phan_tram: null,
              so_luong: 0,
              don_vi: 'kg',
              khoi_luong_kg: weightKg
            });
          } else {
            continue;
          }
        }

        if (items.length === 0) continue;

        const parsed = parseProductNplPhanTramInput(items);
        if ('error' in parsed) {
          failures.push(`${bucket.product.ma_sp}: ${parsed.error}`);
          continue;
        }

        const { error: updateError } = await supabase
          .from(SUPABASE_PRODUCTS_TABLE)
          .update({ npl_phan_tram: parsed.items })
          .eq('id', bucket.product.id);

        if (updateError) {
          failures.push(`${bucket.product.ma_sp}: ${updateError.message}`);
          continue;
        }

        updatedProducts += 1;
        updatedLines += parsed.items.length;
        appliedImportIds.push(...bucket.importIds);
      }

      const uniqueAppliedIds = [...new Set(appliedImportIds.filter(Boolean))];
      if (uniqueAppliedIds.length > 0) {
        const markChunk = 200;
        for (let i = 0; i < uniqueAppliedIds.length; i += markChunk) {
          const chunk = uniqueAppliedIds.slice(i, i + markChunk);
          const { error: markError } = await supabase
            .from(SUPABASE_IMPORT_SP_TABLE)
            .update({ trang_thai: 'da_ap_dung' })
            .in('id', chunk);
          if (markError) {
            console.error('Supabase import_sp mark da_ap_dung error:', markError);
          }
        }
      }

      return res.json({
        success: failures.length === 0,
        updated_products: updatedProducts,
        updated_lines: updatedLines,
        applied_rows: uniqueAppliedIds.length,
        missing_product_codes: missingProductCodes,
        failures
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi đồng bộ import_sp.' });
    }
  });

  app.get('/api/danh-sach-may', async (_req, res) => {
    if (!supabase && !supabaseWeighing) {
      return res.json({ machines: [], total: 0, source: 'local' });
    }

    try {
      const result = await runOnSupabaseTableWithFallback(SUPABASE_MACHINES_TABLE, async client => {
        const { data, error } = await client
          .from(SUPABASE_MACHINES_TABLE)
          .select('*')
          .order('created_at', { ascending: false, nullsFirst: false })
          .order('id', { ascending: false });
        return { data, error };
      });

      if (result.error) {
        return respondSupabaseReadError(res, result.error, SUPABASE_MACHINES_TABLE, {
          machines: [],
          total: 0
        });
      }

      return res.json({
        machines: result.data || [],
        total: result.data?.length || 0,
        source: 'supabase',
        db: result.dbLabel
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi tải danh sách máy.' });
    }
  });

  app.post('/api/danh-sach-may', async (req, res) => {
    if (!supabase && !supabaseWeighing) {
      return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });
    }

    try {
      const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
      const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';

      if (!code || !name) {
        return res.status(400).json({ error: 'Vui lòng nhập mã máy và tên máy.' });
      }

      const record = {
        ma_may: code,
        ten_may: name,
        loai_may: typeof req.body?.type === 'string' ? req.body.type.trim() || 'Chưa phân loại' : 'Chưa phân loại',
        chi_nhanh: typeof req.body?.branch === 'string' ? req.body.branch.trim() : '',
        vi_tri: typeof req.body?.location === 'string' ? req.body.location.trim() : '',
        trang_thai: typeof req.body?.status === 'string' ? req.body.status.trim() || 'Đang dùng' : 'Đang dùng',
        ghi_chu: typeof req.body?.note === 'string' ? req.body.note.trim() : '',
        dinh_luong: parseMachineDinhLuong(req.body?.dinhLuong),
        ty_le_tron: parseMachineMixingRatios(req.body?.mixingRatios ?? req.body?.ty_le_tron)
      };

      const resolved = await resolveSupabaseClientForTable(SUPABASE_MACHINES_TABLE);
      if (!resolved) {
        return res.status(500).json({
          error: `Bảng ${SUPABASE_MACHINES_TABLE} chưa tồn tại trên Supabase mới lẫn cũ. Hãy chạy file supabase-danh-sach-may.sql.`
        });
      }

      const { data, error } = await resolved.client
        .from(SUPABASE_MACHINES_TABLE)
        .insert(record)
        .select('*')
        .single();

      if (error) {
        console.error('Supabase danh_sach_may insert error:', error);
        const missingTable = error.code === 'PGRST205';
        const missingColumn = error.code === 'PGRST204';
        return res.status(500).json({
          error: missingTable
            ? `Bảng ${SUPABASE_MACHINES_TABLE} chưa tồn tại. Hãy chạy file supabase-danh-sach-may.sql trong Supabase SQL Editor.`
            : missingColumn
              ? `Bảng ${SUPABASE_MACHINES_TABLE} đang thiếu cột. Hãy chạy file supabase-danh-sach-may.sql.`
              : `Không thể thêm máy vào ${SUPABASE_MACHINES_TABLE}. ${error.message}`
        });
      }

      return res.status(201).json({ success: true, machine: data, db: resolved.label });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi thêm máy mới.' });
    }
  });

  app.patch('/api/danh-sach-may/:id', async (req, res) => {
    if (!supabase && !supabaseWeighing) {
      return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });
    }

    try {
      const id = String(req.params.id || '').trim();
      if (!id) {
        return res.status(400).json({ error: 'Thiếu ID máy.' });
      }

      const parsed = parseMachineBody(req.body);
      if ('error' in parsed) {
        return res.status(400).json({ error: parsed.error });
      }

      const { data, error } = await updateMachineByKey(id, parsed.record);

      if (error) {
        console.error('Supabase danh_sach_may update error:', error);
        return res.status(500).json({ error: machineWriteErrorMessage(error) });
      }

      if (!data) {
        return res.status(404).json({ error: 'Không tìm thấy máy cần cập nhật.' });
      }

      return res.json({ success: true, machine: data });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi cập nhật máy.' });
    }
  });

  app.delete('/api/danh-sach-may/:id', async (req, res) => {
    if (!supabase && !supabaseWeighing) {
      return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });
    }

    try {
      const id = String(req.params.id || '').trim();
      if (!id) {
        return res.status(400).json({ error: 'Thiếu ID máy.' });
      }

      const { data, error } = await deleteMachineByKey(id);

      if (error) {
        console.error('Supabase danh_sach_may delete error:', error);
        return res.status(500).json({ error: `Không thể xóa máy. ${error.message}` });
      }

      if (!data) {
        return res.status(404).json({ error: 'Không tìm thấy máy cần xóa.' });
      }

      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi xóa máy.' });
    }
  });

  app.patch('/api/danh-sach-may/:id/image', async (req, res) => {
    if (!supabase && !supabaseWeighing) {
      return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });
    }

    try {
      const id = String(req.params.id || '').trim();
      const imageUrl = typeof req.body?.imageUrl === 'string' ? req.body.imageUrl.trim() : '';
      const imagePublicId = typeof req.body?.imagePublicId === 'string' ? req.body.imagePublicId.trim() : '';

      if (!id) {
        return res.status(400).json({ error: 'Thiếu ID máy.' });
      }

      if (!imageUrl) {
        return res.status(400).json({ error: 'Thiếu URL ảnh máy.' });
      }

      const { data, error } = await updateMachineByKey(id, {
        anh_url: imageUrl,
        anh_public_id: imagePublicId || null
      });

      if (error) {
        console.error('Supabase danh_sach_may image update error:', error);
        return res.status(500).json({
          error: isMissingColumnError(error)
            ? `Bảng ${SUPABASE_MACHINES_TABLE} đang thiếu cột ảnh. Hãy chạy lại file supabase-danh-sach-may.sql.`
            : `Không thể cập nhật ảnh máy. ${error.message}`
        });
      }

      if (!data) {
        return res.status(404).json({ error: 'Không tìm thấy máy cần cập nhật ảnh.' });
      }

      return res.json({ success: true, machine: data });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi cập nhật ảnh máy.' });
    }
  });

  app.get('/api/don-hang', async (_req, res) => {
    if (!supabase) {
      return res.json({ orders: [], total: 0, source: 'local' });
    }

    try {
      const { data, error } = await supabase
        .from(SUPABASE_ORDERS_TABLE)
        .select('*')
        // Ngày tạo mới nhất luôn hiển thị trước; id chỉ phân định các dòng cùng thời điểm.
        .order('created_at', { ascending: false, nullsFirst: false })
        .order('id', { ascending: false })
        .order('ma_don_hang', { ascending: false });

      if (error) {
        return respondSupabaseReadError(res, error, SUPABASE_ORDERS_TABLE, { orders: [], total: 0 });
      }

      return res.json({
        orders: data || [],
        total: data?.length || 0,
        source: 'supabase'
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi tải đơn hàng.' });
    }
  });

  app.post('/api/don-hang', async (req, res) => {
    if (!supabase) {
      return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });
    }

    try {
      const source = req.body && typeof req.body === 'object' ? { ...(req.body as Record<string, unknown>) } : {};
      if (!String(source.orderCode ?? '').trim()) {
        source.orderCode = await generateNextOrderCodeFromDb();
      }

      const parsed = parseOrderBody(source, { isCreate: true });
      if ('error' in parsed) {
        return res.status(400).json({ error: parsed.error });
      }

      const { data, error } = await supabase
        .from(SUPABASE_ORDERS_TABLE)
        .insert(parsed.record)
        .select('*')
        .single();

      if (error) {
        console.error('Supabase don_hang insert error:', error);
        return res.status(500).json({ error: orderWriteErrorMessage(error) });
      }

      return res.status(201).json({ success: true, order: data });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi thêm đơn hàng mới.' });
    }
  });

  app.patch('/api/don-hang/:id', async (req, res) => {
    if (!supabase) {
      return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });
    }

    try {
      const id = String(req.params.id || '').trim();
      if (!id) {
        return res.status(400).json({ error: 'Thiếu ID đơn hàng.' });
      }

      const parsed = parseOrderBody(req.body);
      if ('error' in parsed) {
        return res.status(400).json({ error: parsed.error });
      }

      const { data, error } = await supabase
        .from(SUPABASE_ORDERS_TABLE)
        .update(parsed.record)
        .eq('id', id)
        .select('*')
        .single();

      if (error) {
        console.error('Supabase don_hang update error:', error);
        return res.status(500).json({ error: orderWriteErrorMessage(error) });
      }

      if (!data) {
        return res.status(404).json({ error: 'Không tìm thấy đơn hàng cần cập nhật.' });
      }

      return res.json({ success: true, order: data });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi cập nhật đơn hàng.' });
    }
  });

  app.delete('/api/don-hang/:id', async (req, res) => {
    if (!supabase) {
      return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });
    }

    try {
      const id = String(req.params.id || '').trim();
      if (!id) {
        return res.status(400).json({ error: 'Thiếu ID đơn hàng.' });
      }

      const { data, error } = await supabase
        .from(SUPABASE_ORDERS_TABLE)
        .delete()
        .eq('id', id)
        .select('id')
        .maybeSingle();

      if (error) {
        console.error('Supabase don_hang delete error:', error);
        return res.status(500).json({ error: `Không thể xóa đơn hàng. ${error.message}` });
      }

      if (!data) {
        return res.status(404).json({ error: 'Không tìm thấy đơn hàng cần xóa.' });
      }

      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi xóa đơn hàng.' });
    }
  });

  app.get('/api/lenh-sx', async (_req, res) => {
    if (!supabase) {
      return res.json({ productionOrders: [], total: 0, source: 'local' });
    }

    try {
      let { data, error } = await supabase
        .from(SUPABASE_PRODUCTION_ORDERS_TABLE)
        .select('*')
        // Bản ghi tạo mới nhất được đưa lên đầu danh sách lệnh sản xuất.
        .order('created_at', { ascending: false, nullsFirst: false })
        .order('id', { ascending: false });

      if (error && isMissingColumnError(error)) {
        ({ data, error } = await supabase
          .from(SUPABASE_PRODUCTION_ORDERS_TABLE)
          .select('*')
          .order('id', { ascending: false }));
      }

      if (error && isMissingColumnError(error)) {
        ({ data, error } = await supabase
          .from(SUPABASE_PRODUCTION_ORDERS_TABLE)
          .select('*')
          .order('ma_lenh_sx', { ascending: false }));
      }

      if (error) {
        return respondSupabaseReadError(res, error, SUPABASE_PRODUCTION_ORDERS_TABLE, {
          productionOrders: [],
          total: 0
        });
      }

      return res.json({
        productionOrders: data || [],
        total: data?.length || 0,
        source: 'supabase'
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi tải lệnh sản xuất.' });
    }
  });

  app.post('/api/lenh-sx/from-don-hang/:id', async (req, res) => {
    if (!supabase) {
      return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });
    }

    try {
      const id = String(req.params.id || '').trim();
      if (!id) {
        return res.status(400).json({ error: 'Thiếu ID đơn hàng.' });
      }

      const { data: order, error: orderError } = await supabase
        .from(SUPABASE_ORDERS_TABLE)
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (orderError) {
        console.error('Supabase don_hang lookup error:', orderError);
        return res.status(500).json({ error: orderWriteErrorMessage(orderError) });
      }

      if (!order) {
        return res.status(404).json({ error: 'Không tìm thấy đơn hàng.' });
      }

      const orderRow = order as Record<string, unknown>;
      const existingLenh = pickRowField(orderRow, ['lenh_sx', 'production_order']);
      if (existingLenh && existingLenh !== '-') {
        return res.status(409).json({
          error: `Đơn hàng đã có lệnh SX: ${existingLenh}`,
          productionOrderCode: existingLenh
        });
      }

      const orderCode = pickRowField(orderRow, ['ma_don_hang', 'order_code', 'code']);
      const orderProducts = parseOrderProductsFromRow(orderRow);
      if (!orderCode) {
        return res.status(400).json({ error: 'Đơn hàng thiếu mã đơn — không thể tạo lệnh SX.' });
      }
      if (orderProducts.length === 0) {
        return res.status(400).json({ error: 'Đơn hàng chưa có sản phẩm — không thể tạo lệnh SX.' });
      }
      if (orderProducts.length > 1) {
        return res.status(400).json({
          error: 'Đơn có nhiều sản phẩm — hãy tạo lệnh SX từ menu Lệnh sản xuất và chọn từng SP.'
        });
      }

      const firstProduct = orderProducts[0];
      if (!firstProduct.ma_sp && !firstProduct.ten_sp) {
        return res.status(400).json({ error: 'Sản phẩm trong đơn thiếu mã SP hoặc tên SP.' });
      }

      let code = makeProductionOrderCode(orderCode);
      code = await ensureUniqueProductionOrderCode(code);

      const record = buildProductionOrderRecordFromOrder(orderRow, code, firstProduct);
      const { data: created, error: insertError } = await insertProductionOrderRecord(record);

      if (insertError) {
        console.error('Supabase lenh_sx insert error:', insertError);
        return res.status(500).json({ error: productionOrderWriteErrorMessage(insertError) });
      }

      const { error: updateError } = await supabase
        .from(SUPABASE_ORDERS_TABLE)
        .update({ lenh_sx: code })
        .eq('id', id);

      if (updateError) {
        console.error('Supabase don_hang lenh_sx update error:', updateError);
        return res.status(201).json({
          success: true,
          productionOrder: created,
          code,
          warning: `Đã tạo lệnh SX ${code} nhưng chưa cập nhật được cột lenh_sx trên đơn hàng.`
        });
      }

      return res.status(201).json({
        success: true,
        productionOrder: created,
        code
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi tạo lệnh sản xuất.' });
    }
  });

  app.post('/api/lenh-sx', async (req, res) => {
    if (!supabase) {
      return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });
    }

    try {
      const parsed = parseProductionOrderBody(req.body);
      if ('error' in parsed) {
        return res.status(400).json({ error: parsed.error });
      }

      const record = { ...parsed.record };
      record.ma_lenh_sx = await ensureUniqueProductionOrderCode(String(record.ma_lenh_sx));

      const orderRef = String(record.ma_don_hang ?? '').trim();
      const orderProducts = parseOrderProductsFromRow(record);

      for (const product of orderProducts) {
        const productCode = product.ma_sp;
        const requestQuantity = product.so_luong ?? 0;
        const productOrderRef = String(product.ma_don_hang ?? '').trim() || orderRef;
        if (!productOrderRef || !productCode) continue;

        const { ordered, remaining } = await getRemainingProductionQuantityForProduct(productOrderRef, productCode);
        if (ordered <= 0) {
          return res.status(400).json({
            error: `Sản phẩm ${productCode} không có trong đơn ${productOrderRef} hoặc chưa có số lượng đặt hàng.`
          });
        }
        if (remaining <= 0) {
          return res.status(400).json({
            error: `Sản phẩm ${productCode} đã được lập đủ lệnh SX cho đơn ${productOrderRef}.`
          });
        }
        if (requestQuantity > remaining) {
          return res.status(400).json({
            error: `Số lượng vượt quá còn lại (${remaining}) cho ${productCode}.`
          });
        }
      }

      const { data: created, error: insertError } = await insertProductionOrderRecord(record);

      if (insertError) {
        console.error('Supabase lenh_sx insert error:', insertError);
        return res.status(500).json({ error: productionOrderWriteErrorMessage(insertError) });
      }

      return res.status(201).json({
        success: true,
        productionOrder: created,
        code: record.ma_lenh_sx
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi tạo lệnh sản xuất.' });
    }
  });

  app.get('/api/ke-hoach-sx', async (req, res) => {
    if (!supabase) {
      return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });
    }

    try {
      const usedLenhSxFlag = String(req.query.usedLenhSx ?? req.query.used_lenh_sx ?? '').trim();
      if (usedLenhSxFlag === '1' || usedLenhSxFlag.toLowerCase() === 'true') {
        const excludePlanId = String(req.query.excludePlanId ?? req.query.exclude_plan_id ?? '').trim();
        let usedLinesQuery = supabase
          .from(SUPABASE_PRODUCTION_PLAN_LINES_TABLE)
          .select('lenh_sx_id, ma_lenh_sx');
        if (excludePlanId) {
          usedLinesQuery = usedLinesQuery.neq('ke_hoach_id', excludePlanId);
        }
        const { data: usedLines, error: usedLinesError } = await usedLinesQuery;
        if (usedLinesError) {
          console.error('Supabase ke_hoach_san_xuat_dong used-lenh error:', usedLinesError);
          return res.status(500).json({ error: productionPlanWriteErrorMessage(usedLinesError) });
        }

        const usedLenhSxIds = new Set<string>();
        const usedOrderCodes = new Set<string>();
        for (const rawLine of (usedLines || []) as Record<string, unknown>[]) {
          const lenhSxId = String(rawLine.lenh_sx_id ?? '').trim();
          if (lenhSxId && lenhSxId !== '0' && lenhSxId.toLowerCase() !== 'null') {
            usedLenhSxIds.add(lenhSxId);
          }
          const orderCode = String(rawLine.ma_lenh_sx ?? '').trim();
          if (orderCode) usedOrderCodes.add(orderCode);
        }

        return res.json({
          usedLenhSxIds: Array.from(usedLenhSxIds),
          usedOrderCodes: Array.from(usedOrderCodes)
        });
      }

      const id = String(req.query.id ?? '').trim();
      if (id) {
        const { data: plan, error: planError } = await supabase
          .from(SUPABASE_PRODUCTION_PLANS_TABLE)
          .select('*')
          .eq('id', id)
          .maybeSingle();

        if (planError) {
          console.error('Supabase ke_hoach_san_xuat detail error:', planError);
          return res.status(500).json({ error: productionPlanWriteErrorMessage(planError) });
        }
        if (!plan) {
          return res.status(404).json({ error: 'Không tìm thấy kế hoạch sản xuất.' });
        }

        const { data: lines, error: linesError } = await supabase
          .from(SUPABASE_PRODUCTION_PLAN_LINES_TABLE)
          .select('*')
          .eq('ke_hoach_id', id)
          .order('thu_tu_uu_tien', { ascending: true });

        if (linesError) {
          console.error('Supabase ke_hoach_san_xuat_dong detail error:', linesError);
          return res.status(500).json({ error: productionPlanWriteErrorMessage(linesError) });
        }

        // Kế hoạch cũ chưa lưu riêng thợ chính/thợ phụ. Lấy từ lệnh SX để
        // phiếu in vẫn phân công đúng theo ca; kế hoạch mới dùng snapshot.
        const lineRows = (lines || []) as Record<string, unknown>[];
        const productionOrderIds = lineRows
          .map(line => String(line.lenh_sx_id ?? '').trim())
          .filter(Boolean);
        const productionOrderCodes = lineRows
          .map(line => String(line.ma_lenh_sx ?? '').trim())
          .filter(Boolean);
        let staffRolesByOrderId = new Map<string, Record<string, unknown>>();
        let staffRolesByOrderCode = new Map<string, Record<string, unknown>>();
        if (productionOrderIds.length > 0) {
          const { data: orderStaffRows, error: orderStaffError } = await supabase
            .from(SUPABASE_PRODUCTION_ORDERS_TABLE)
            .select('id, truong_ca, nhan_su_chinh, tho_phu, hoc_viec')
            .in('id', productionOrderIds);
          if (!orderStaffError) {
            staffRolesByOrderId = new Map(
              ((orderStaffRows || []) as Record<string, unknown>[]).map(order => [String(order.id ?? '').trim(), order])
            );
          }
        }
        if (productionOrderCodes.length > 0) {
          const { data: orderStaffRows, error: orderStaffError } = await supabase
            .from(SUPABASE_PRODUCTION_ORDERS_TABLE)
            .select('ma_lenh_sx, truong_ca, nhan_su_chinh, tho_phu, hoc_viec')
            .in('ma_lenh_sx', productionOrderCodes);
          if (!orderStaffError) {
            staffRolesByOrderCode = new Map(
              ((orderStaffRows || []) as Record<string, unknown>[]).map(order => [String(order.ma_lenh_sx ?? '').trim(), order])
            );
          }
        }
        const enrichedLines = lineRows.map(line => {
          const roleSource =
            staffRolesByOrderId.get(String(line.lenh_sx_id ?? '').trim()) ||
            staffRolesByOrderCode.get(String(line.ma_lenh_sx ?? '').trim());
          return {
            ...line,
            truong_ca: line.truong_ca || roleSource?.truong_ca || '',
            nhan_su_chinh: line.nhan_su_chinh || roleSource?.nhan_su_chinh || '',
            tho_phu: line.tho_phu || roleSource?.tho_phu || '',
            hoc_viec: line.hoc_viec || roleSource?.hoc_viec || ''
          };
        });

        return res.json({ plan, lines: enrichedLines });
      }

      let query = supabase
        .from(SUPABASE_PRODUCTION_PLANS_TABLE)
        .select('*')
        .order('created_at', { ascending: false, nullsFirst: false })
        .order('id', { ascending: false })
        .limit(Math.min(Number(req.query.limit) || 100, 500));

      const planDate = parseProductionPlanDateInput(req.query.ngay ?? req.query.planDate);
      const fromDate = parseProductionPlanDateInput(req.query.tu_ngay ?? req.query.fromDate);
      const toDate = parseProductionPlanDateInput(req.query.den_ngay ?? req.query.toDate);

      if (planDate) {
        query = query.eq('ngay_ke_hoach', planDate);
      } else {
        if (fromDate) query = query.gte('ngay_ke_hoach', fromDate);
        if (toDate) query = query.lte('ngay_ke_hoach', toDate);
      }

      const { data, error } = await query;
      if (error) {
        console.error('Supabase ke_hoach_san_xuat list error:', error);
        return res.status(500).json({ error: productionPlanWriteErrorMessage(error) });
      }

      return res.json({ plans: data || [] });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi tải kế hoạch sản xuất.' });
    }
  });

  app.put('/api/ke-hoach-sx', async (req, res) => {
    if (!supabase) {
      return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });
    }

    try {
      const source = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
      const planId = String(source.id ?? source.planId ?? '').trim();
      const items = source.items;
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'Danh sách lệnh SX trống.' });
      }

      const planDate = parseProductionPlanDateInput(source.ngay_ke_hoach ?? source.planDate) ?? todayDateString();
      const planNote = typeof source.ghi_chu === 'string' ? source.ghi_chu.trim() : '';
      const createdBy = pickRowField(source, ['nguoi_lap', 'createdBy', 'staff'], '');

      const updates: Array<{
        id: string;
        orderCode: string;
        vi_tri: string | null;
        thu_tu_uu_tien: number;
        ghi_chu: string;
      }> = [];
      const snapshotLines: ProductionPlanSnapshotLine[] = [];
      for (const raw of items) {
        if (!raw || typeof raw !== 'object') continue;
        const item = raw as Record<string, unknown>;
        const rawId = String(item.id ?? item.lenh_sx_id ?? '').trim();
        const id = rawId && rawId !== '0' && rawId.toLowerCase() !== 'null' ? rawId : '';
        const orderCode = String(item.ma_lenh_sx ?? item.code ?? '').trim();
        const thu_tu_uu_tien = Number(item.thu_tu_uu_tien ?? item.priority);
        if ((!id && !orderCode) || !Number.isFinite(thu_tu_uu_tien) || thu_tu_uu_tien <= 0) continue;
        updates.push({
          id,
          orderCode,
          vi_tri: typeof item.vi_tri === 'string' && item.vi_tri.trim() ? item.vi_tri.trim() : null,
          thu_tu_uu_tien: Math.round(thu_tu_uu_tien),
          ghi_chu: typeof item.ghi_chu === 'string' ? item.ghi_chu.trim() : ''
        });

        const snapshotLine = parseProductionPlanSnapshotLine(item);
        if (snapshotLine) snapshotLines.push(snapshotLine);
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: 'Không có lệnh SX hợp lệ để lưu kế hoạch.' });
      }

      for (const item of updates) {
        let updateQuery = supabase
          .from(SUPABASE_PRODUCTION_ORDERS_TABLE)
          .update({
            vi_tri: item.vi_tri,
            thu_tu_uu_tien: item.thu_tu_uu_tien,
            ghi_chu: item.ghi_chu
          });
        // Mã lệnh có trong snapshot kể cả dữ liệu cũ bị lưu lenh_sx_id = 0 hoặc ID dòng snapshot.
        // Ưu tiên mã lệnh để cập nhật đúng bản ghi lenh_sx thực tế.
        updateQuery = item.orderCode
          ? updateQuery.eq('ma_lenh_sx', item.orderCode)
          : updateQuery.eq('id', item.id);
        const { error: updateError } = await updateQuery;

        if (updateError) {
          console.error('Supabase ke_hoach_sx update error:', updateError);
          if (isMissingColumnError(updateError)) {
            return res.status(500).json({
              error: `Bảng ${SUPABASE_PRODUCTION_ORDERS_TABLE} thiếu cột vi_tri/thu_tu_uu_tien. Hãy chạy file supabase-ke-hoach-sx.sql trong Supabase SQL Editor.`
            });
          }
          return res.status(500).json({ error: productionOrderWriteErrorMessage(updateError) });
        }
      }

      let savedPlan: Record<string, unknown> | null = null;
      try {
        savedPlan = (await saveProductionPlanSnapshot({
          planId: planId || undefined,
          planDate,
          note: planNote,
          createdBy,
          lines: snapshotLines.length > 0 ? snapshotLines : updates.map((item, index) => ({
            lenh_sx_id: Number(item.id),
            thu_tu_uu_tien: item.thu_tu_uu_tien || index + 1,
            vi_tri: item.vi_tri,
            ghi_chu: item.ghi_chu,
            ma_lenh_sx: '',
            ma_don_hang: '',
            ca: '',
            may: item.vi_tri ?? '',
            nhan_su: '',
            truong_ca: '',
            nhan_su_chinh: '',
            tho_phu: '',
            hoc_viec: '',
            san_pham: []
          }))
        })) as Record<string, unknown>;
      } catch (snapshotError: any) {
        return res.status(500).json({ error: snapshotError.message || 'Không thể lưu snapshot kế hoạch sản xuất.' });
      }

      return res.json({
        success: true,
        updated: updates.length,
        plan: savedPlan,
        planId: savedPlan?.id ?? null,
        planCode: savedPlan?.ma_ke_hoach ?? null,
        planDate
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi lưu kế hoạch sản xuất.' });
    }
  });

  app.delete('/api/ke-hoach-sx/:id', async (req, res) => {
    if (!supabase) return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ error: 'Thiếu ID kế hoạch.' });
    try {
      const { data, error } = await supabase
        .from(SUPABASE_PRODUCTION_PLANS_TABLE)
        .delete()
        .eq('id', id)
        .select('id')
        .maybeSingle();
      if (error) return res.status(500).json({ error: productionPlanWriteErrorMessage(error) });
      if (!data) return res.status(404).json({ error: 'Không tìm thấy kế hoạch sản xuất.' });
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Không thể xóa kế hoạch sản xuất.' });
    }
  });

  app.patch('/api/lenh-sx/:id', async (req, res) => {
    if (!supabase) {
      return res.status(503).json({ error: 'Supabase is not configured.' });
    }

    try {
      const id = String(req.params.id || '').trim();
      if (!id) {
        return res.status(400).json({ error: 'Missing production order ID.' });
      }

      const parsed = parseProductionOrderBody(req.body);
      if ('error' in parsed) {
        return res.status(400).json({ error: parsed.error });
      }

      const { data: updated, error: updateError } = await updateProductionOrderRecord(id, parsed.record);

      if (updateError) {
        console.error('Supabase lenh_sx update error:', updateError);
        return res.status(500).json({ error: productionOrderWriteErrorMessage(updateError) });
      }

      if (!updated) {
        return res.status(404).json({ error: 'Production order not found.' });
      }

      return res.json({
        success: true,
        productionOrder: updated
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Error updating production order.' });
    }
  });

  app.delete('/api/lenh-sx/:id', async (req, res) => {
    if (!supabase) {
      return res.status(503).json({ error: 'Supabase is not configured.' });
    }

    try {
      const id = String(req.params.id || '').trim();
      if (!id) {
        return res.status(400).json({ error: 'Missing production order ID.' });
      }

      const { data: orderRow, error: fetchError } = await supabase
        .from(SUPABASE_PRODUCTION_ORDERS_TABLE)
        .select('id, ma_lenh_sx')
        .eq('id', id)
        .maybeSingle();

      if (fetchError) {
        console.error('Supabase lenh_sx fetch error:', fetchError);
        return res.status(500).json({ error: `Cannot delete production order. ${fetchError.message}` });
      }

      if (!orderRow) {
        return res.status(404).json({ error: 'Production order not found.' });
      }

      const code = String(orderRow.ma_lenh_sx ?? '').trim();
      const cascade = { planLines: 0, downtimeSlips: 0, orders: 0 };
      const warnings: string[] = [];

      // Xóa dữ liệu liên quan trước; lệnh SX xóa sau cùng để lỗi giữa chừng vẫn thử lại được.
      // Cột lenh_sx_id (schema cũ) kiểu bigint — chỉ lọc khi id là số, tránh lỗi khi lệnh SX dùng UUID.
      const isNumericId = /^\d+$/.test(id);
      if (isNumericId) {
        const { data: planLinesById, error: planLinesByIdError } = await supabase
          .from(SUPABASE_PRODUCTION_PLAN_LINES_TABLE)
          .delete()
          .eq('lenh_sx_id', id)
          .select('id');
        if (planLinesByIdError && !isMissingTableError(planLinesByIdError) && !isMissingColumnError(planLinesByIdError)) {
          console.error('Supabase ke_hoach_san_xuat_dong delete error:', planLinesByIdError);
          warnings.push(`Chưa xóa được dòng kế hoạch SX: ${planLinesByIdError.message}`);
        }
        cascade.planLines += planLinesById?.length || 0;
      }

      if (code) {
        const { data: planLinesByCode, error: planLinesByCodeError } = await supabase
          .from(SUPABASE_PRODUCTION_PLAN_LINES_TABLE)
          .delete()
          .eq('ma_lenh_sx', code)
          .select('id');
        if (planLinesByCodeError && !isMissingTableError(planLinesByCodeError) && !isMissingColumnError(planLinesByCodeError)) {
          console.error('Supabase ke_hoach_san_xuat_dong delete error:', planLinesByCodeError);
          warnings.push(`Chưa xóa được dòng kế hoạch SX theo mã: ${planLinesByCodeError.message}`);
        }
        cascade.planLines += planLinesByCode?.length || 0;

        const { data: downtimeSlips, error: downtimeError } = await supabase
          .from(SUPABASE_MACHINE_DOWNTIME_TABLE)
          .delete()
          .eq('lenh_sx_lien_quan', code)
          .select('id');
        if (downtimeError && !isMissingTableError(downtimeError) && !isMissingColumnError(downtimeError)) {
          console.error('Supabase phieu_bao_dung_may delete error:', downtimeError);
          warnings.push(`Chưa xóa được phiếu báo dừng máy: ${downtimeError.message}`);
        }
        cascade.downtimeSlips += downtimeSlips?.length || 0;

        const { data: linkedOrders, error: ordersError } = await supabase
          .from(SUPABASE_ORDERS_TABLE)
          .update({ lenh_sx: null })
          .eq('lenh_sx', code)
          .select('id');
        if (ordersError && !isMissingTableError(ordersError) && !isMissingColumnError(ordersError)) {
          console.error('Supabase don_hang delete error:', ordersError);
          warnings.push(`Chưa gỡ được liên kết lệnh SX khỏi đơn hàng: ${ordersError.message}`);
        }
        cascade.orders += linkedOrders?.length || 0;
      }

      const { data, error } = await supabase
        .from(SUPABASE_PRODUCTION_ORDERS_TABLE)
        .delete()
        .eq('id', id)
        .select('id')
        .maybeSingle();

      if (error) {
        console.error('Supabase lenh_sx delete error:', error);
        return res.status(500).json({ error: `Cannot delete production order. ${error.message}` });
      }

      if (!data) {
        return res.status(404).json({ error: 'Production order not found.' });
      }

      return res.json({
        success: true,
        cascade,
        warning: warnings.length > 0 ? warnings.join(' ') : undefined
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Error deleting production order.' });
    }
  });

  app.get('/api/address-lookup', async (req, res) => {
    const address = String(req.query.address || '').trim();
    if (!address) return res.status(400).json({ error: 'Vui lòng nhập địa chỉ cũ.' });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ADDRESS_ENGINE_TIMEOUT_MS);
    try {
      const response = await fetch(
        `${ADDRESS_ENGINE_URL}/lookup?address=${encodeURIComponent(address)}`,
        {
          headers: { Accept: 'application/json' },
          signal: controller.signal
        }
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload || typeof payload !== 'object') {
        const detail =
          payload && typeof payload === 'object' && 'detail' in payload
            ? String((payload as { detail?: unknown }).detail || '')
            : '';
        return res.status(502).json({
          error: detail || `Address Engine trả về lỗi HTTP ${response.status}.`
        });
      }

      const result = payload as Record<string, unknown>;
      const rawNote = String(result.note || '');
      const note =
        rawNote === 'Khong xac dinh duoc xa/phuong hoac tinh/thanh tuong ung.'
          ? 'Không xác định được xã/phường hoặc tỉnh/thành tương ứng.'
          : rawNote;
      return res.json({
        input: String(result.input || address),
        found: result.found === true,
        new_address: String(result.new_address || ''),
        note,
        method: String(result.method || '')
      });
    } catch (lookupError: unknown) {
      const isTimeout =
        lookupError instanceof Error &&
        (lookupError.name === 'AbortError' || lookupError.message.toLowerCase().includes('abort'));
      return res.status(isTimeout ? 504 : 502).json({
        error: isTimeout
          ? 'Address Engine phản hồi quá thời gian.'
          : 'Không kết nối được Address Engine. Hãy kiểm tra dịch vụ chuyển đổi địa chỉ.'
      });
    } finally {
      clearTimeout(timeout);
    }
  });

  app.get('/api/khach-hang', async (_req, res) => {
    if (!supabase) {
      return res.json({ customers: [], total: 0, source: 'local' });
    }

    try {
      const { data, error } = await supabase
        .from(SUPABASE_CUSTOMERS_TABLE)
        .select('*')
        .order('created_at', { ascending: false, nullsFirst: false });

      if (error && isMissingColumnError(error)) {
        const fallback = await supabase
          .from(SUPABASE_CUSTOMERS_TABLE)
          .select('*')
          .order('ma_khach_hang', { ascending: true, nullsFirst: false });
        if (fallback.error) {
          console.error('Supabase khach_hang query error:', fallback.error);
          return res.status(500).json({
            error: `Không thể tải khách hàng từ ${SUPABASE_CUSTOMERS_TABLE}. ${fallback.error.message}`
          });
        }
        return res.json({
          customers: fallback.data || [],
          total: fallback.data?.length || 0,
          source: 'supabase'
        });
      }

      if (error) {
        console.error('Supabase khach_hang query error:', error);
        return res.status(500).json({
          error: `Không thể tải khách hàng từ ${SUPABASE_CUSTOMERS_TABLE}. ${error.message}`
        });
      }

      return res.json({
        customers: data || [],
        total: data?.length || 0,
        source: 'supabase'
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi tải khách hàng.' });
    }
  });

  function buildCustomerOptionalFields(source: Record<string, unknown>): Record<string, unknown> {
    const congNoRaw = pickRowField(source, ['cong_no', 'debt'], '');
    const congNo = congNoRaw ? Number(congNoRaw) : 0;
    const normalizePhoneList = (value: string) =>
      value
        .split(/[,;\n]+/)
        .map(phone => phone.trim())
        .filter(Boolean)
        .join(', ');
    const isInternalRaw = source.la_doi_tuong_noi_bo ?? source.is_internal;
    const isInternal =
      typeof isInternalRaw === 'boolean'
        ? isInternalRaw
        : ['true', '1', 'co', 'có', 'x', 'yes'].includes(String(isInternalRaw ?? '').trim().toLowerCase());

    return {
      dia_chi: pickRowField(source, ['dia_chi', 'address'], '') || null,
      dia_chi_moi: pickRowField(source, ['dia_chi_moi', 'new_address'], '') || null,
      cong_no: Number.isFinite(congNo) ? congNo : 0,
      ma_so_thue: pickRowField(source, ['ma_so_thue', 'ma_so_thue_cccd', 'tax_code'], '') || null,
      dien_thoai:
        normalizePhoneList(pickRowField(source, ['so_dien_thoai', 'dien_thoai', 'phone', 'sdt'], '')) || null,
      dt_di_dong_nlh:
        normalizePhoneList(pickRowField(source, ['dt_di_dong_nlh', 'di_dong_nlh', 'mobile_nlh'], '')) || null,
      la_doi_tuong_noi_bo: isInternal,
      don_vi_quan_ly: pickRowField(source, ['don_vi_quan_ly', 'managing_unit'], '') || null,
      ghi_chu: pickRowField(source, ['ghi_chu', 'note', 'notes'], '') || null
    };
  }

  app.post('/api/khach-hang', async (req, res) => {
    if (!supabase) return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });

    try {
      const source = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
      const name = pickRowField(source, ['ten_khach_hang', 'khach_hang', 'name', 'ten'], '');
      let code = pickRowField(source, ['ma_khach_hang', 'ma_kh', 'code'], '');
      if (!name) return res.status(400).json({ error: 'Vui lòng nhập tên khách hàng.' });

      if (!code) {
        const existing = await supabase
          .from(SUPABASE_CUSTOMERS_TABLE)
          .select('ma_khach_hang')
          .order('ma_khach_hang', { ascending: false })
          .limit(200);
        let max = 0;
        for (const row of existing.data || []) {
          const raw = String((row as { ma_khach_hang?: unknown }).ma_khach_hang || '').trim().toUpperCase();
          const match = raw.match(/^KH(\d+)$/);
          if (!match) continue;
          const num = Number(match[1]);
          if (Number.isFinite(num) && num > max) max = num;
        }
        const next = max + 1;
        code = `KH${String(next).padStart(Math.max(3, String(next).length), '0')}`;
      }

      const record: Record<string, unknown> = {
        ma_khach_hang: code,
        ten_khach_hang: name,
        ...buildCustomerOptionalFields(source)
      };

      const { data, error } = await supabase
        .from(SUPABASE_CUSTOMERS_TABLE)
        .insert(record)
        .select('*')
        .single();

      if (error) {
        return res.status(500).json({ error: customerWriteError(error, SUPABASE_CUSTOMERS_TABLE) });
      }

      return res.status(201).json({ success: true, customer: data });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi thêm khách hàng.' });
    }
  });

  app.post('/api/khach-hang/replace', async (req, res) => {
    if (!supabase) return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });

    try {
      const source = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
      const rawCustomers = Array.isArray(source.customers) ? source.customers : [];
      if (rawCustomers.length === 0) {
        return res.status(400).json({ error: 'File Excel phải có ít nhất một khách hàng.' });
      }

      const codes = new Set<string>();
      const records: Record<string, unknown>[] = [];
      for (let index = 0; index < rawCustomers.length; index += 1) {
        const item = rawCustomers[index];
        if (!item || typeof item !== 'object') {
          return res.status(400).json({ error: `Dòng ${index + 2} không hợp lệ.` });
        }
        const row = item as Record<string, unknown>;
        const code = pickRowField(row, ['ma_khach_hang', 'ma_kh', 'code'], '');
        const name = pickRowField(row, ['ten_khach_hang', 'khach_hang', 'name', 'ten'], '');
        if (!code || !name) {
          return res.status(400).json({ error: `Dòng ${index + 2} phải có mã và tên khách hàng.` });
        }
        const normalizedCode = code.toUpperCase();
        if (codes.has(normalizedCode)) {
          return res.status(400).json({ error: `Mã khách hàng ${code} bị trùng trong file Excel.` });
        }
        codes.add(normalizedCode);
        records.push({
          ma_khach_hang: code,
          ten_khach_hang: name,
          ...buildCustomerOptionalFields(row)
        });
      }

      const { data, error } = await supabase.rpc('replace_khach_hang_from_json', {
        p_customers: records
      });
      if (error) {
        return res.status(500).json({
          error: `Không thể thay thế danh sách khách hàng. Hãy chạy file supabase-khach-hang-replace.sql. ${error.message || ''}`.trim()
        });
      }
      return res.json({ success: true, total: Number(data) || records.length });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi thay thế danh sách khách hàng.' });
    }
  });

  app.patch('/api/khach-hang/:id/dia-chi-moi', async (req, res) => {
    if (!supabase) return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ error: 'Thiếu ID khách hàng.' });

    try {
      const source = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
      const oldAddress = pickRowField(source, ['dia_chi', 'old_address'], '');
      const newAddress = pickRowField(source, ['dia_chi_moi', 'new_address'], '');
      if (!newAddress) return res.status(400).json({ error: 'Địa chỉ mới không được để trống.' });

      const existing = await supabase
        .from(SUPABASE_CUSTOMERS_TABLE)
        .select('ma_khach_hang, dia_chi, dia_chi_moi')
        .eq('ma_khach_hang', id)
        .maybeSingle();
      if (existing.error) {
        return res.status(500).json({ error: customerWriteError(existing.error, SUPABASE_CUSTOMERS_TABLE) });
      }
      if (!existing.data) return res.status(404).json({ error: 'Không tìm thấy khách hàng.' });

      const currentOldAddress = String(existing.data.dia_chi || '').trim();
      const currentNewAddress = String(existing.data.dia_chi_moi || '').trim();
      if (currentNewAddress) {
        return res.json({ success: true, customer: existing.data, skipped: true });
      }
      if (oldAddress && currentOldAddress !== oldAddress) {
        return res.status(409).json({ error: 'Địa chỉ cũ đã thay đổi; không tự động ghi đè.' });
      }

      let updateQuery = supabase
        .from(SUPABASE_CUSTOMERS_TABLE)
        .update({ dia_chi_moi: newAddress })
        .eq('ma_khach_hang', id)
        .eq('dia_chi', currentOldAddress);
      updateQuery =
        existing.data.dia_chi_moi === null
          ? updateQuery.is('dia_chi_moi', null)
          : updateQuery.eq('dia_chi_moi', '');

      const updated = await updateQuery.select('ma_khach_hang, dia_chi, dia_chi_moi').maybeSingle();
      if (updated.error) {
        return res.status(500).json({ error: customerWriteError(updated.error, SUPABASE_CUSTOMERS_TABLE) });
      }
      if (!updated.data) {
        return res.status(409).json({ error: 'Dữ liệu khách hàng vừa thay đổi; không tự động ghi đè.' });
      }
      return res.json({ success: true, customer: updated.data });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi lưu địa chỉ mới.' });
    }
  });

  app.put('/api/khach-hang/:id', async (req, res) => {
    if (!supabase) return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ error: 'Thiếu ID khách hàng.' });

    try {
      const source = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
      const name = pickRowField(source, ['ten_khach_hang', 'khach_hang', 'name', 'ten'], '');
      const code = pickRowField(source, ['ma_khach_hang', 'ma_kh', 'code'], '');
      if (!name) return res.status(400).json({ error: 'Vui lòng nhập tên khách hàng.' });

      const record: Record<string, unknown> = {
        ...(code ? { ma_khach_hang: code } : {}),
        ten_khach_hang: name,
        ...buildCustomerOptionalFields(source)
      };

      const { data, error } = await supabase
        .from(SUPABASE_CUSTOMERS_TABLE)
        .update(record)
        .eq('ma_khach_hang', id)
        .select('*')
        .single();

      if (error) {
        return res.status(500).json({ error: customerWriteError(error, SUPABASE_CUSTOMERS_TABLE) });
      }

      return res.json({ success: true, customer: data });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi cập nhật khách hàng.' });
    }
  });

  app.delete('/api/khach-hang/:id', async (req, res) => {
    if (!supabase) return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ error: 'Thiếu ID khách hàng.' });

    try {
      const { error } = await supabase.from(SUPABASE_CUSTOMERS_TABLE).delete().eq('ma_khach_hang', id);
      if (error) {
        return res.status(500).json({ error: customerWriteError(error, SUPABASE_CUSTOMERS_TABLE) });
      }
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi xóa khách hàng.' });
    }
  });

  app.get('/api/lenh-xuat-hang', async (_req, res) => {
    if (!supabase) {
      return res.json({ orders: [], total: 0, source: 'local' });
    }

    try {
      const { data, error } = await supabase
        .from(SUPABASE_SHIPPING_ORDERS_TABLE)
        .select('*')
        .order('created_at', { ascending: false, nullsFirst: false })
        .order('id', { ascending: false });

      if (error) {
        return respondSupabaseReadError(res, error, SUPABASE_SHIPPING_ORDERS_TABLE, {
          orders: [],
          total: 0
        });
      }

      return res.json({
        orders: data || [],
        total: data?.length || 0,
        source: 'supabase'
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi tải lệnh xuất hàng.' });
    }
  });

  app.post('/api/lenh-xuat-hang', async (req, res) => {
    if (!supabase) return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });

    try {
      const parsed = parseShippingOrderBody(req.body);
      if ('error' in parsed) return res.status(400).json({ error: parsed.error });
      const { data, error } = await supabase
        .from(SUPABASE_SHIPPING_ORDERS_TABLE)
        .insert(parsed.record)
        .select('*')
        .single();
      if (error) {
        return res.status(500).json({ error: vehicleWriteError(error, SUPABASE_SHIPPING_ORDERS_TABLE) });
      }
      return res.status(201).json({ success: true, order: data });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi thêm lệnh xuất hàng.' });
    }
  });

  app.put('/api/lenh-xuat-hang/:id', async (req, res) => {
    if (!supabase) return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ error: 'Thiếu ID lệnh xuất hàng.' });

    try {
      const parsed = parseShippingOrderBody(req.body);
      if ('error' in parsed) return res.status(400).json({ error: parsed.error });
      const { data, error } = await supabase
        .from(SUPABASE_SHIPPING_ORDERS_TABLE)
        .update(parsed.record)
        .eq('id', id)
        .select('*')
        .single();
      if (error) {
        return res.status(500).json({ error: vehicleWriteError(error, SUPABASE_SHIPPING_ORDERS_TABLE) });
      }
      return res.json({ success: true, order: data });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi cập nhật lệnh xuất hàng.' });
    }
  });

  app.delete('/api/lenh-xuat-hang/:id', async (req, res) => {
    if (!supabase) return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ error: 'Thiếu ID lệnh xuất hàng.' });

    try {
      const { error } = await supabase.from(SUPABASE_SHIPPING_ORDERS_TABLE).delete().eq('id', id);
      if (error) {
        return res.status(500).json({ error: vehicleWriteError(error, SUPABASE_SHIPPING_ORDERS_TABLE) });
      }
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi xóa lệnh xuất hàng.' });
    }
  });

  app.get('/api/cai-dat', async (_req, res) => {
    if (!supabase) {
      return res.json({ settings: [], total: 0, source: 'local' });
    }

    try {
      let { data, error } = await supabase
        .from(SUPABASE_SETTINGS_TABLE)
        .select('*')
        .order('created_at', { ascending: false, nullsFirst: false })
        .order('id', { ascending: false });

      if (error && isMissingColumnError(error)) {
        ({ data, error } = await supabase
          .from(SUPABASE_SETTINGS_TABLE)
          .select('*')
          .order('id', { ascending: false }));
      }

      if (error) {
        return respondSupabaseReadError(res, error, SUPABASE_SETTINGS_TABLE, { settings: [], total: 0 });
      }

      return res.json({
        settings: data || [],
        total: data?.length || 0,
        source: 'supabase'
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi tải cài đặt.' });
    }
  });

  app.post('/api/cai-dat', async (req, res) => {
    if (!supabase) {
      return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });
    }

    try {
      const parsed = parseSettingBody(req.body);
      if ('error' in parsed) {
        return res.status(400).json({ error: parsed.error });
      }

      const { data, error } = await writeSettingRecord(supabase, parsed);

      if (error) {
        console.error('Supabase cai_dat insert error:', error);
        return res.status(500).json({ error: settingsWriteErrorMessage(error) });
      }

      return res.status(201).json({ success: true, setting: data });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi thêm cài đặt mới.' });
    }
  });

  app.patch('/api/cai-dat/:id', async (req, res) => {
    if (!supabase) {
      return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });
    }

    try {
      const id = String(req.params.id || '').trim();
      if (!id) {
        return res.status(400).json({ error: 'Thiếu ID cài đặt.' });
      }

      const parsed = parseSettingBody(req.body);
      if ('error' in parsed) {
        return res.status(400).json({ error: parsed.error });
      }

      const { data, error } = await writeSettingRecord(supabase, parsed, id);

      if (error) {
        console.error('Supabase cai_dat update error:', error);
        return res.status(500).json({ error: settingsWriteErrorMessage(error) });
      }

      if (!data) {
        return res.status(404).json({ error: 'Không tìm thấy cài đặt cần cập nhật.' });
      }

      return res.json({ success: true, setting: data });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi cập nhật cài đặt.' });
    }
  });

  app.delete('/api/cai-dat/:id', async (req, res) => {
    if (!supabase) {
      return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });
    }

    try {
      const id = String(req.params.id || '').trim();
      if (!id) {
        return res.status(400).json({ error: 'Thiếu ID cài đặt.' });
      }

      const { data, error } = await supabase
        .from(SUPABASE_SETTINGS_TABLE)
        .delete()
        .eq('id', id)
        .select('id')
        .maybeSingle();

      if (error) {
        console.error('Supabase cai_dat delete error:', error);
        return res.status(500).json({
          error: `Không thể xóa cài đặt. ${error.message}`
        });
      }

      if (!data) {
        return res.status(404).json({ error: 'Không tìm thấy cài đặt cần xóa.' });
      }

      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi xóa cài đặt.' });
    }
  });

  app.get('/api/kho-nvl', async (_req, res) => {
    if (!supabase) {
      return res.json({ materials: [], total: 0, source: 'local' });
    }

    try {
      const { data, error } = await supabase
        .from(SUPABASE_MATERIALS_TABLE)
        .select('*')
        .order('created_at', { ascending: false, nullsFirst: false })
        .order('id', { ascending: false });

      if (error) {
        return respondSupabaseReadError(res, error, SUPABASE_MATERIALS_TABLE, { materials: [], total: 0 });
      }

      const movementTotals = await buildMaterialMovementTotals();
      const materials = applyMaterialMovementTotals(data || [], movementTotals);

      return res.json({
        materials,
        total: materials.length,
        source: 'supabase'
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi tải nguyên phụ liệu.' });
    }
  });

  app.post('/api/kho-nvl', async (req, res) => {
    if (!supabase) {
      return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });
    }

    try {
      const parsed = parseMaterialBody(req.body);
      if ('error' in parsed) {
        return res.status(400).json({ error: parsed.error });
      }

      const { data, error } = await supabase
        .from(SUPABASE_MATERIALS_TABLE)
        .insert(parsed.record)
        .select('*')
        .single();

      if (error) {
        console.error('Supabase kho_nvl insert error:', error);
        return res.status(500).json({ error: materialWriteErrorMessage(error) });
      }

      return res.status(201).json({ success: true, material: data });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi thêm nguyên phụ liệu.' });
    }
  });

  app.post('/api/kho-nvl/fill-total-kg', async (req, res) => {
    if (!supabase) {
      return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });
    }

    try {
      const value = parseOptionalMaterialNumber(req.body?.value ?? req.body?.totalWeight ?? 25);
      if (value === null || value <= 0) {
        return res.status(400).json({ error: 'Giá trị Tổng kg không hợp lệ.' });
      }

      const { data, error } = await supabase
        .from(SUPABASE_MATERIALS_TABLE)
        .select('ma_npl, don_vi');

      if (error) {
        console.error('Supabase kho_nvl fill-total-kg read error:', error);
        return res.status(500).json({ error: materialWriteErrorMessage(error) });
      }

      const codes = (data || [])
        .filter(row => {
          const code = String(row.ma_npl ?? '').trim();
          return code && isMaterialKgUnitValue(row.don_vi);
        })
        .map(row => String(row.ma_npl).trim());

      if (codes.length === 0) {
        return res.status(400).json({ error: 'Không có NPL nào có đơn vị Kg.' });
      }

      const { error: updateError } = await supabase
        .from(SUPABASE_MATERIALS_TABLE)
        .update({ tong_trong_luong: value })
        .in('ma_npl', codes);

      if (updateError) {
        console.error('Supabase kho_nvl fill-total-kg update error:', updateError);
        return res.status(500).json({ error: materialWriteErrorMessage(updateError) });
      }

      return res.json({
        success: true,
        updated: codes.length,
        value,
        codes
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi điền Tổng kg hàng loạt.' });
    }
  });

  app.patch('/api/kho-nvl/:id', async (req, res) => {
    if (!supabase) {
      return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });
    }

    try {
      const id = String(req.params.id || '').trim();
      const filter = resolveMaterialRowFilter(id);
      if (!filter) {
        return res.status(400).json({ error: 'Thiếu ID nguyên phụ liệu.' });
      }

      const parsed = parseMaterialBody(req.body);
      if ('error' in parsed) {
        return res.status(400).json({ error: parsed.error });
      }

      const { data, error } = await supabase
        .from(SUPABASE_MATERIALS_TABLE)
        .update(parsed.record)
        .eq(filter.column, filter.value)
        .select('*')
        .single();

      if (error) {
        console.error('Supabase kho_nvl update error:', error);
        return res.status(500).json({ error: materialWriteErrorMessage(error) });
      }

      if (!data) {
        return res.status(404).json({ error: 'Không tìm thấy nguyên phụ liệu cần cập nhật.' });
      }

      return res.json({ success: true, material: data });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi cập nhật nguyên phụ liệu.' });
    }
  });

  app.delete('/api/kho-nvl', async (req, res) => {
    if (!supabase) {
      return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });
    }

    try {
      const ids = Array.isArray(req.body?.ids)
        ? req.body.ids.map((id: unknown) => String(id ?? '').trim()).filter(Boolean)
        : [];

      if (ids.length === 0) {
        return res.status(400).json({ error: 'Vui lòng chọn ít nhất một nguyên phụ liệu để xóa.' });
      }

      const uuidIds = ids.filter((id: string) => isUuidValue(id));
      const codeIds = ids.filter((id: string) => !isUuidValue(id));
      let deleted = 0;

      if (uuidIds.length > 0) {
        const { data, error } = await supabase
          .from(SUPABASE_MATERIALS_TABLE)
          .delete()
          .in('id', uuidIds)
          .select('id');

        if (error) {
          console.error('Supabase kho_nvl bulk delete by id error:', error);
          return res.status(500).json({ error: `Không thể xóa nguyên phụ liệu. ${error.message}` });
        }
        deleted += data?.length || 0;
      }

      if (codeIds.length > 0) {
        const { data, error } = await supabase
          .from(SUPABASE_MATERIALS_TABLE)
          .delete()
          .in('ma_npl', codeIds)
          .select('ma_npl');

        if (error) {
          console.error('Supabase kho_nvl bulk delete by code error:', error);
          return res.status(500).json({ error: `Không thể xóa nguyên phụ liệu. ${error.message}` });
        }
        deleted += data?.length || 0;
      }

      return res.json({ success: true, deleted });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi xóa nguyên phụ liệu.' });
    }
  });

  app.delete('/api/kho-nvl/:id', async (req, res) => {
    if (!supabase) {
      return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });
    }

    try {
      const id = String(req.params.id || '').trim();
      const filter = resolveMaterialRowFilter(id);
      if (!filter) {
        return res.status(400).json({ error: 'Thiếu ID nguyên phụ liệu.' });
      }

      const { data, error } = await supabase
        .from(SUPABASE_MATERIALS_TABLE)
        .delete()
        .eq(filter.column, filter.value)
        .select(filter.column)
        .maybeSingle();

      if (error) {
        console.error('Supabase kho_nvl delete error:', error);
        return res.status(500).json({ error: `Không thể xóa nguyên phụ liệu. ${error.message}` });
      }

      if (!data) {
        return res.status(404).json({ error: 'Không tìm thấy nguyên phụ liệu cần xóa.' });
      }

      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi xóa nguyên phụ liệu.' });
    }
  });

  app.get('/api/phieu-xuat-nhap-kho/gia-tb-nhap', async (req, res) => {
    if (!supabase) {
      return res.json({ don_gia: 0, thang: '', so_dong: 0, tong_sl: 0, source: 'local' });
    }

    try {
      const maNpl = String(req.query.ma_npl ?? req.query.materialCode ?? req.query.code ?? '').trim();
      const thangOrNgay = String(
        req.query.thang ?? req.query.month ?? req.query.ngay ?? req.query.date ?? ''
      ).trim();
      if (!maNpl) {
        return res.status(400).json({ error: 'Thiếu mã NPL (ma_npl).' });
      }

      const built = await buildNvlInboundAvgPriceForMonth(maNpl, thangOrNgay);
      if (built.error) {
        return res.status(500).json({ error: built.error });
      }

      return res.json({
        don_gia: built.don_gia,
        thang: built.thang,
        so_dong: built.so_dong,
        tong_sl: built.tong_sl,
        price_source: built.price_source || 'none',
        source: 'supabase'
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi tải giá nhập trung bình.' });
    }
  });

  app.get('/api/phieu-xuat-nhap-kho/lo-ton', async (req, res) => {
    if (!supabase) {
      return res.json({ lots: [], total: 0, source: 'local' });
    }

    try {
      const maNpl = String(req.query.ma_npl ?? req.query.materialCode ?? req.query.code ?? '').trim();
      const excludeSlipCode = String(
        req.query.exclude_ma_phieu ?? req.query.excludeSlipCode ?? ''
      ).trim();
      if (!maNpl) {
        return res.status(400).json({ error: 'Thiếu mã NPL (ma_npl).' });
      }

      const built = await buildNvlInboundLots(maNpl, excludeSlipCode || undefined);
      if (built.error) {
        return res.status(500).json({ error: built.error });
      }

      return res.json({
        lots: built.lots,
        total: built.lots.length,
        source: 'supabase'
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi tải lô tồn NVL.' });
    }
  });

  app.get('/api/phieu-xuat-nhap-kho', async (req, res) => {
    if (!supabase) {
      return res.json({ movements: [], total: 0, source: 'local' });
    }

    try {
      const loaiFilter = parseWarehouseSlipType(req.query.loai ?? req.query.type);
      const khoFilter = parseWarehouseStorageType(req.query.loai_kho ?? req.query.kho ?? req.query.warehouseKind);
      const fromDate = parseWarehouseSlipDate(req.query.from ?? req.query.tu_ngay);
      const toDate = parseWarehouseSlipDate(req.query.to ?? req.query.den_ngay);
      const slipCode = String(req.query.ma_phieu ?? req.query.slipCode ?? '').trim();
      const maNpl = String(req.query.ma_npl ?? req.query.materialCode ?? '').trim();
      const maSp = String(req.query.ma_sp ?? req.query.productCode ?? '').trim();
      const treoFilter = String(req.query.treo ?? '').trim().toLowerCase();

      let query = supabase
        .from(SUPABASE_WAREHOUSE_MOVEMENTS_TABLE)
        .select('*')
        .order('created_at', { ascending: false, nullsFirst: false })
        .order('id', { ascending: false });

      // Phiếu xuất kho treo (chờ xác nhận) không hiện trong lịch sử mặc định — chỉ hiện khi lọc treo=true.
      if (treoFilter === 'true' || treoFilter === '1') {
        query = query.eq('treo', true);
      } else if (treoFilter !== 'all') {
        query = query.eq('treo', false);
      }

      if (loaiFilter) query = query.eq('loai_phieu', loaiFilter);
      if (khoFilter === 'san_pham') {
        query = query.eq('loai_kho', 'san_pham');
      } else if (khoFilter === 'hang_hong') {
        query = query.or(
          'loai_kho.eq.hang_hong,ten_kho.ilike.%hàng hỏng%,ten_kho.ilike.%hang hong%,ten_kho.ilike.%damaged%'
        );
      } else if (khoFilter === 'hang_hoa') {
        query = query.or('loai_kho.eq.hang_hoa,ten_kho.ilike.%hàng hóa%,ten_kho.ilike.%hang hoa%');
      } else if (khoFilter === 'cong_cu_dung_cu') {
        query = query.or(
          'loai_kho.eq.cong_cu_dung_cu,ten_kho.ilike.%công cụ dụng cụ%,ten_kho.ilike.%cong cu dung cu%'
        );
      } else if (khoFilter === 'gia_cong') {
        query = query.or('loai_kho.eq.gia_cong,ten_kho.ilike.%gia công%,ten_kho.ilike.%gia cong%');
      } else if (khoFilter === 'tai_che') {
        // Kho tái chế: loai_kho riêng hoặc ten_kho chứa "tái chế" (phiếu cũ gắn nvl)
        query = query.or(
          'loai_kho.eq.tai_che,ten_kho.ilike.%tái chế%,ten_kho.ilike.%tai che%,ten_kho.ilike.%Tai che%,ten_kho.ilike.%recycle%'
        );
      } else if (khoFilter === 'nvl') {
        query = query.or('loai_kho.eq.nvl,loai_kho.is.null');
      }
      if (fromDate) query = query.gte('ngay_phieu', fromDate);
      if (toDate) query = query.lte('ngay_phieu', toDate);
      if (slipCode) query = query.eq('ma_phieu', slipCode);
      if (maNpl) query = query.eq('ma_npl', maNpl);
      if (maSp) {
        const variants = [...new Set([maSp, maSp.replace(/[\s\u00A0]+/g, '')].filter(Boolean))];
        query = variants.length === 1 ? query.eq('ma_sp', variants[0]) : query.in('ma_sp', variants);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Supabase phieu_xuat_nhap_kho query error:', error);
        return res.status(500).json({
          error: `Không thể tải lịch sử xuất nhập kho từ ${SUPABASE_WAREHOUSE_MOVEMENTS_TABLE}. ${error.message}`
        });
      }

      const movements = (data || []).map(row =>
        String(row.loai_phieu || '').trim().toLowerCase() === 'xuat'
          ? {
              ...row,
              ly_do: normalizeWarehouseExportReferenceText(row.ly_do),
              ghi_chu: normalizeWarehouseExportReferenceText(row.ghi_chu)
            }
          : row
      );

      return res.json({
        movements,
        total: movements.length,
        source: 'supabase'
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi tải lịch sử xuất nhập kho.' });
    }
  });

  app.get('/api/phieu-xuat-nhap-kho/:slipCode/ma-qr', async (req, res) => {
    if (!supabase) {
      return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });
    }

    try {
      const slipCode = String(req.params.slipCode || '').trim();
      if (!slipCode) return res.status(400).json({ error: 'Thiếu mã phiếu nhập.' });

      const { data, error } = await supabase
        .from(SUPABASE_PRODUCT_CODES_TABLE)
        .select('id, ma_sp_goc, ma_sp_day_du, ten_kho, trang_thai, so_lan_in, ma_phieu_nhap, created_at')
        .eq('ma_phieu_nhap', slipCode)
        .order('created_at', { ascending: true });

      if (error) {
        return res.status(500).json({
          error: isMissingTableError(error)
            ? 'Chưa có bảng mã sản phẩm chi tiết. Hãy chạy migration mã QR sản phẩm.'
            : error.message || 'Không thể tải mã QR của phiếu nhập.'
        });
      }

      return res.json({ records: data || [], total: data?.length || 0 });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi tải mã QR của phiếu nhập.' });
    }
  });

  app.post('/api/phieu-xuat-nhap-kho', async (req, res) => {
    if (!supabase) {
      return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });
    }

    try {
      const parsed = parseWarehouseSlipBody(req.body);
      if ('error' in parsed) {
        return res.status(400).json({ error: parsed.error });
      }

      if (parsed.loaiPhieu === 'xuat' && parsed.loaiKho === 'nvl') {
        const lotError = await validateNvlExportLots(parsed.items);
        if (lotError) {
          return res.status(400).json(lotError);
        }
      }

      const maPhieu = generateWarehouseSlipCode(parsed.loaiPhieu);

      // Nhập kho thành phẩm không còn sinh mã QR/serial riêng cho từng đơn vị — ghi nhận theo
      // tổng số lượng như các kho khác (giống luồng NVL), đi qua nhánh insert chung bên dưới.

      // Hàng hóa đóng gói/quản lý theo từng đơn vị giống thành phẩm: mỗi đơn vị nhận một QR serial.
      // Không đăng ký vào ma_san_pham_chi_tiet vì đây không phải danh mục sản phẩm sản xuất.
      const goodsQrCodes = parsed.loaiPhieu === 'nhap' && parsed.loaiKho === 'hang_hoa'
        ? (() => {
            const totalQuantity = parsed.items.reduce((sum, item) => sum + item.quantity, 0);
            const invalidItem = parsed.items.find(item => !Number.isInteger(item.quantity));
            if (invalidItem) {
              return { error: `Số lượng nhập của ${invalidItem.code} phải là số nguyên để sinh từng mã QR.` };
            }
            if (totalQuantity < 1 || totalQuantity > 999) {
              return { error: 'Tổng số lượng sinh mã QR trong một phiếu phải từ 1 đến 999.' };
            }
            return {
              codes: parsed.items.flatMap(item =>
                buildStoredProductQrCodes(item.code, item.quantity).map(code => ({
                  code,
                  baseCode: item.code,
                  name: item.name
                }))
              ),
              quantity: totalQuantity
            };
          })()
        : null;
      if (goodsQrCodes && 'error' in goodsQrCodes) {
        return res.status(400).json({ error: goodsQrCodes.error });
      }

      const damagedReportRowIds = parsed.items
        .map(item => String(item.damagedReportRowId ?? '').trim())
        .filter(Boolean);
      if (damagedReportRowIds.length > 0) {
        const { data: alreadyImported, error: linkCheckError } = await supabase
          .from(SUPABASE_WAREHOUSE_MOVEMENTS_TABLE)
          .select('id_bao_cao_hang_hong')
          .in('id_bao_cao_hang_hong', damagedReportRowIds)
          .limit(1);
        if (linkCheckError) {
          return res.status(500).json({ error: warehouseSlipWriteErrorMessage(linkCheckError) });
        }
        if (alreadyImported && alreadyImported.length > 0) {
          return res.status(409).json({
            error: 'Báo cáo hàng hỏng này đã được nhập kho. Hãy tải lại danh sách chờ kiểm tra.'
          });
        }
      }

      const records = buildWarehouseSlipInsertRecords(parsed, maPhieu);

      const { data, error } = await supabase
        .from(SUPABASE_WAREHOUSE_MOVEMENTS_TABLE)
        .insert(records)
        .select('*');

      if (error) {
        console.error('Supabase phieu_xuat_nhap_kho insert error:', error);
        return res.status(500).json({ error: warehouseSlipWriteErrorMessage(error) });
      }

      if (parsed.loaiKho === 'nvl') {
        const nvlCodes = [...new Set(parsed.items.map(item => item.code.trim()).filter(Boolean))];
        await Promise.all(nvlCodes.map(code => syncMaterialInventoryFromMovements(code)));
      } else {
        const productCodes = [...new Set(parsed.items.map(item => item.code.trim()).filter(Boolean))];
        await Promise.all(productCodes.map(code => syncProductDetailCodeFromMovements(code)));
      }

      return res.status(201).json({
        success: true,
        slipCode: maPhieu,
        movements: data || [],
        qrCodes: goodsQrCodes?.codes || [],
        qrQuantity: goodsQrCodes?.quantity || 0
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi tạo phiếu xuất nhập kho.' });
    }
  });

  app.post('/api/phieu-xuat-nhap-kho/:slipCode/xac-nhan-treo', async (req, res) => {
    if (!supabase) {
      return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });
    }

    try {
      const slipCode = String(req.params.slipCode || '').trim();
      if (!slipCode) {
        return res.status(400).json({ error: 'Thiếu mã phiếu.' });
      }

      const { data: existing, error: fetchError } = await supabase
        .from(SUPABASE_WAREHOUSE_MOVEMENTS_TABLE)
        .select('id, ma_npl, ten_npl, ma_sp, ten_sp, don_vi, don_gia, so_luong, id_dong_nhap_nguon, ma_phieu_nhap_nguon, loai_kho, loai_phieu, treo')
        .eq('ma_phieu', slipCode);

      if (fetchError) {
        console.error('Supabase phieu_xuat_nhap_kho fetch for confirm error:', fetchError);
        return res.status(500).json({
          error: `Không thể tải phiếu cần xác nhận từ ${SUPABASE_WAREHOUSE_MOVEMENTS_TABLE}. ${fetchError.message}`
        });
      }

      if (!existing || existing.length === 0) {
        return res.status(404).json({ error: 'Không tìm thấy phiếu xuất kho treo cần xác nhận.' });
      }
      if (existing.some(row => String(row.loai_phieu || '') !== 'xuat')) {
        return res.status(400).json({ error: 'Chỉ phiếu xuất kho mới có thể xác nhận từ trạng thái treo.' });
      }
      if (!existing.some(row => row.treo === true)) {
        return res.status(409).json({ error: 'Phiếu này đã được xác nhận trước đó.' });
      }

      const nvlRows = existing.filter(row => String(row.loai_kho || 'nvl') !== 'san_pham');
      if (nvlRows.length > 0) {
        const lotError = await validateNvlExportLots(
          nvlRows.map(row => ({
            code: String(row.ma_npl || '').trim(),
            name: String(row.ten_npl || '').trim(),
            unit: String(row.don_vi || '').trim(),
            quantity: Number(row.so_luong) || 0,
            documentQuantity: Number(row.so_luong) || 0,
            unitPrice: Number(row.don_gia) || 0,
            lineAmount: roundWarehouseMoney((Number(row.so_luong) || 0) * (Number(row.don_gia) || 0)),
            sourceInboundLineId: String(row.id_dong_nhap_nguon || '').trim() || undefined,
            sourceInboundSlipCode: String(row.ma_phieu_nhap_nguon || '').trim() || undefined
          }))
        );
        if (lotError) {
          return res.status(409).json({
            error: `Không thể xác nhận phiếu ${slipCode}: ${lotError.error}`
          });
        }
      }

      const { data: updated, error: updateError } = await supabase
        .from(SUPABASE_WAREHOUSE_MOVEMENTS_TABLE)
        .update({ treo: false })
        .eq('ma_phieu', slipCode)
        .eq('treo', true)
        .select('*');

      if (updateError) {
        console.error('Supabase phieu_xuat_nhap_kho confirm treo error:', updateError);
        return res.status(500).json({ error: warehouseSlipWriteErrorMessage(updateError) });
      }
      if (!updated || updated.length !== existing.length) {
        return res.status(409).json({
          error: 'Phiếu đã được người khác xác nhận hoặc thay đổi. Hãy tải lại danh sách.'
        });
      }

      const affectedNvlCodes = new Set<string>();
      const affectedProductCodes = new Set<string>();
      existing.forEach(row => {
        const code = String(row.ma_npl || '').trim();
        if (code && String(row.loai_kho || 'nvl') !== 'san_pham') {
          affectedNvlCodes.add(code);
        }
        const productCode = String(row.ma_sp || '').trim();
        if (productCode && String(row.loai_kho || '') === 'san_pham') {
          affectedProductCodes.add(productCode);
        }
      });
      if (affectedNvlCodes.size > 0) {
        await Promise.all([...affectedNvlCodes].map(code => syncMaterialInventoryFromMovements(code)));
      }
      if (affectedProductCodes.size > 0) {
        await Promise.all([...affectedProductCodes].map(code => syncProductDetailCodeFromMovements(code)));
      }

      return res.json({
        success: true,
        slipCode,
        movements: updated || []
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi xác nhận phiếu xuất kho treo.' });
    }
  });

  app.post('/api/phieu-xuat-nhap-kho/remap-shift', async (req, res) => {
    if (!supabase) {
      return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });
    }

    try {
      const fromShift = String(req.body?.from ?? req.body?.fromShift ?? 'HC1').trim();
      const toShift = String(req.body?.to ?? req.body?.toShift ?? '12C1').trim();

      if (!fromShift || !toShift) {
        return res.status(400).json({ error: 'Thiếu ca nguồn hoặc ca đích.' });
      }
      if (fromShift === toShift) {
        return res.status(400).json({ error: 'Ca nguồn và ca đích phải khác nhau.' });
      }

      const { data, error } = await supabase
        .from(SUPABASE_WAREHOUSE_MOVEMENTS_TABLE)
        .update({ ca: toShift })
        .eq('ca', fromShift)
        .eq('loai_phieu', 'nhap')
        .select('id');

      if (error) {
        console.error('Supabase phieu_xuat_nhap_kho remap-shift error:', error);
        return res.status(500).json({ error: warehouseSlipWriteErrorMessage(error) });
      }

      return res.json({
        success: true,
        from: fromShift,
        to: toShift,
        updated: Array.isArray(data) ? data.length : 0,
        mode: 'supabase'
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi đổi ca hàng loạt.' });
    }
  });

  app.put('/api/phieu-xuat-nhap-kho/:slipCode', async (req, res) => {
    if (!supabase) {
      return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });
    }

    try {
      const slipCode = String(req.params.slipCode || '').trim();
      if (!slipCode) {
        return res.status(400).json({ error: 'Thiếu mã phiếu.' });
      }

      const parsed = parseWarehouseSlipBody(req.body);
      if ('error' in parsed) {
        return res.status(400).json({ error: parsed.error });
      }

      if (parsed.loaiPhieu === 'xuat' && parsed.loaiKho === 'nvl') {
        const lotError = await validateNvlExportLots(parsed.items, slipCode);
        if (lotError) {
          return res.status(400).json(lotError);
        }
      }

      const { data: existing, error: fetchError } = await supabase
        .from(SUPABASE_WAREHOUSE_MOVEMENTS_TABLE)
        .select('ma_npl, ma_sp, loai_kho')
        .eq('ma_phieu', slipCode);

      if (fetchError) {
        console.error('Supabase phieu_xuat_nhap_kho fetch for update error:', fetchError);
        return res.status(500).json({
          error: `Không thể tải phiếu cần cập nhật từ ${SUPABASE_WAREHOUSE_MOVEMENTS_TABLE}. ${fetchError.message}`
        });
      }

      if (!existing || existing.length === 0) {
        return res.status(404).json({ error: 'Không tìm thấy phiếu cần cập nhật.' });
      }

      const affectedNvlCodes = new Set<string>();
      const affectedProductCodes = new Set<string>();
      existing.forEach(row => {
        const code = String(row.ma_npl || '').trim();
        if (code && String(row.loai_kho || 'nvl') !== 'san_pham') {
          affectedNvlCodes.add(code);
        }
        const productCode = String(row.ma_sp || '').trim();
        if (productCode && String(row.loai_kho || '') === 'san_pham') {
          affectedProductCodes.add(productCode);
        }
      });
      if (parsed.loaiKho === 'nvl') {
        parsed.items.forEach(item => {
          const code = item.code.trim();
          if (code) affectedNvlCodes.add(code);
        });
      } else {
        parsed.items.forEach(item => {
          const code = item.code.trim();
          if (code) affectedProductCodes.add(code);
        });
      }

      const { error: deleteError } = await supabase
        .from(SUPABASE_WAREHOUSE_MOVEMENTS_TABLE)
        .delete()
        .eq('ma_phieu', slipCode);

      if (deleteError) {
        console.error('Supabase phieu_xuat_nhap_kho delete for update error:', deleteError);
        return res.status(500).json({ error: `Không thể xóa dữ liệu phiếu cũ. ${deleteError.message}` });
      }

      const records = buildWarehouseSlipInsertRecords(parsed, slipCode);

      const { data, error } = await supabase
        .from(SUPABASE_WAREHOUSE_MOVEMENTS_TABLE)
        .insert(records)
        .select('*');

      if (error) {
        console.error('Supabase phieu_xuat_nhap_kho update insert error:', error);
        return res.status(500).json({ error: warehouseSlipWriteErrorMessage(error) });
      }

      if (affectedNvlCodes.size > 0) {
        await Promise.all([...affectedNvlCodes].map(code => syncMaterialInventoryFromMovements(code)));
      }
      if (affectedProductCodes.size > 0) {
        await Promise.all([...affectedProductCodes].map(code => syncProductDetailCodeFromMovements(code)));
      }

      return res.json({
        success: true,
        slipCode,
        movements: data || []
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi cập nhật phiếu xuất nhập kho.' });
    }
  });

  app.delete('/api/phieu-xuat-nhap-kho/slip/:slipCode', async (req, res) => {
    if (!supabase) {
      return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });
    }

    try {
      const slipCode = String(req.params.slipCode || '').trim();
      if (!slipCode) {
        return res.status(400).json({ error: 'Thiếu mã phiếu.' });
      }

      const { data: existing, error: fetchError } = await supabase
        .from(SUPABASE_WAREHOUSE_MOVEMENTS_TABLE)
        .select('id, ma_npl, ma_sp, loai_kho')
        .eq('ma_phieu', slipCode);

      if (fetchError) {
        console.error('Supabase phieu_xuat_nhap_kho fetch for slip delete error:', fetchError);
        return res.status(500).json({ error: `Không thể tải phiếu cần xóa. ${fetchError.message}` });
      }

      if (!existing || existing.length === 0) {
        return res.status(404).json({ error: 'Không tìm thấy phiếu cần xóa.' });
      }

      const affectedNvlCodes = new Set<string>();
      const affectedProductCodes = new Set<string>();
      existing.forEach(row => {
        const code = String(row.ma_npl || '').trim();
        if (code && String(row.loai_kho || 'nvl') !== 'san_pham') {
          affectedNvlCodes.add(code);
        }
        const productCode = String(row.ma_sp || '').trim();
        if (productCode && String(row.loai_kho || '') === 'san_pham') {
          affectedProductCodes.add(productCode);
        }
      });

      const { error: deleteError } = await supabase
        .from(SUPABASE_WAREHOUSE_MOVEMENTS_TABLE)
        .delete()
        .eq('ma_phieu', slipCode);

      if (deleteError) {
        console.error('Supabase phieu_xuat_nhap_kho slip delete error:', deleteError);
        return res.status(500).json({ error: `Không thể xóa phiếu. ${deleteError.message}` });
      }

      if (affectedNvlCodes.size > 0) {
        await Promise.all([...affectedNvlCodes].map(code => syncMaterialInventoryFromMovements(code)));
      }
      if (affectedProductCodes.size > 0) {
        await Promise.all([...affectedProductCodes].map(code => syncProductDetailCodeFromMovements(code)));
      }

      return res.json({ success: true, deletedCount: existing.length });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi xóa phiếu xuất nhập kho.' });
    }
  });

  app.delete('/api/phieu-xuat-nhap-kho/:id', async (req, res) => {
    if (!supabase) {
      return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });
    }

    try {
      const id = String(req.params.id || '').trim();
      if (!id) {
        return res.status(400).json({ error: 'Thiếu ID dòng phiếu.' });
      }

      const { data, error } = await supabase
        .from(SUPABASE_WAREHOUSE_MOVEMENTS_TABLE)
        .delete()
        .eq('id', id)
        .select('id, ma_npl, ma_sp, loai_kho')
        .maybeSingle();

      if (error) {
        console.error('Supabase phieu_xuat_nhap_kho delete error:', error);
        return res.status(500).json({ error: `Không thể xóa dòng phiếu. ${error.message}` });
      }

      if (!data) {
        return res.status(404).json({ error: 'Không tìm thấy dòng phiếu cần xóa.' });
      }

      if (data.ma_npl && String(data.loai_kho || 'nvl') !== 'san_pham') {
        await syncMaterialInventoryFromMovements(String(data.ma_npl));
      }
      if (data.ma_sp && String(data.loai_kho || '') === 'san_pham') {
        await syncProductDetailCodeFromMovements(String(data.ma_sp));
      }

      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi xóa dòng phiếu.' });
    }
  });

  app.get('/api/nhan-su', async (req, res) => {
    const format = typeof req.query.format === 'string' ? req.query.format : 'list';

    if (!supabase) {
      if (format === 'groups') {
        return res.json({ branches: [], total: 0, source: 'local' });
      }
      return res.json([]);
    }

    try {
      const scope = typeof req.query.scope === 'string' ? req.query.scope : 'filtered';
      const departmentFilter = `%${SUPABASE_STAFF_DEPARTMENT}%`;
      const branchFilter = `%${SUPABASE_STAFF_BRANCH}%`;

      if (format === 'groups') {
        const { data, error } = await supabase
          .from(SUPABASE_STAFF_TABLE)
          .select('*')
          .order('created_at', { ascending: false, nullsFirst: false });

        if (error) {
          return respondSupabaseReadError(res, error, SUPABASE_STAFF_TABLE, { branches: [], total: 0 });
        }

        const rows = ((data || []) as Record<string, unknown>[])
          .filter(row => pickStaffName(row));

        const filteredRows = scope === 'all'
          ? rows
          : rows.filter(row => {
              const department = pickStaffField(row, ['phong_ban', 'phongban', 'department']).toLowerCase();
              const branch = pickStaffField(row, ['chi_nhanh', 'chi_nhanh_lam_viec', 'branch', 'co_so']).toLowerCase();
              return (
                department.includes(SUPABASE_STAFF_DEPARTMENT.toLowerCase()) &&
                branch.includes(SUPABASE_STAFF_BRANCH.toLowerCase())
              );
            });

        return res.json({
          branches: buildStaffGroups(filteredRows),
          total: filteredRows.length,
          source: 'supabase'
        });
      }

      const staffSelect = 'nhan_su, phong_ban, chi_nhanh';

      async function runStaffQuery(mode: 'dept-branch' | 'dept-only' | 'all') {
        let query = supabase!
          .from(SUPABASE_STAFF_TABLE)
          .select(staffSelect)
          .not('nhan_su', 'is', null)
          .order('nhan_su', { ascending: true });

        if (mode === 'dept-branch') {
          query = query.ilike('phong_ban', departmentFilter).ilike('chi_nhanh', branchFilter);
        } else if (mode === 'dept-only') {
          query = query.ilike('phong_ban', departmentFilter);
        }

        let { data, error } = await query;

        if (error && isMissingColumnError(error)) {
          let fallback = supabase!.from(SUPABASE_STAFF_TABLE).select('*');
          if (mode === 'dept-branch') {
            fallback = fallback.ilike('phong_ban', departmentFilter).ilike('chi_nhanh', branchFilter);
          } else if (mode === 'dept-only') {
            fallback = fallback.ilike('phong_ban', departmentFilter);
          }
          ({ data, error } = await fallback);
        }

        return { data, error };
      }

      const queryModes: Array<'dept-branch' | 'dept-only' | 'all'> = ['dept-branch', 'dept-only', 'all'];
      let data: Record<string, unknown>[] | null = null;
      let lastError: { message?: string } | null = null;

      for (const mode of queryModes) {
        const result = await runStaffQuery(mode);
        if (result.error) {
          lastError = result.error;
          continue;
        }

        const names = [...new Set((result.data || []).map(pickStaffName).filter(Boolean))];
        if (names.length > 0) {
          data = result.data;
          if (mode !== 'dept-branch') {
            console.warn(`[nhan-su] Fallback mode "${mode}" returned ${names.length} staff.`);
          }
          break;
        }
      }

      if (!data) {
        if (lastError) {
          console.error('Supabase nhan_su query error:', lastError);
          return res.status(500).json({
            error: `Không thể tải danh sách nhân sự từ ${SUPABASE_STAFF_TABLE}. ${lastError.message}`
          });
        }
        return res.json([]);
      }

      const names = [...new Set(data.map(pickStaffName).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b, 'vi')
      );

      return res.json(names.map(name => ({ name })));
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi tải danh sách nhân sự.' });
    }
  });

  app.post('/api/nhan-su', async (req, res) => {
    if (!supabase) {
      return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });
    }

    try {
      const source = req.body && typeof req.body === 'object' ? { ...(req.body as Record<string, unknown>) } : {};
      if (!pickRowField(source, ['ma_nhan_su', 'ma_nv', 'code'], '')) {
        source.ma_nhan_su = await generateNextStaffCodeFromDb();
      }

      const parsed = parseStaffBody(source);
      if ('error' in parsed) {
        return res.status(400).json({ error: parsed.error });
      }

      const { data: created, error: insertError } = await supabase
        .from(SUPABASE_STAFF_TABLE)
        .insert(parsed.record)
        .select('*')
        .single();

      if (insertError) {
        console.error('Supabase nhan_su insert error:', insertError);
        return res.status(500).json({ error: staffWriteErrorMessage(insertError) });
      }

      return res.status(201).json({
        success: true,
        staff: created,
        person: mapStaffRecord(created as Record<string, unknown>)
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi thêm nhân sự.' });
    }
  });

  /** Đồng bộ cột vi_tri = Phòng ban + "_" + Chức vụ. */
  app.post('/api/nhan-su/sync-vi-tri', async (req, res) => {
    if (!supabase) {
      return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });
    }

    const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
    const onlyEmpty = Boolean(body.onlyEmpty);
    const force = Boolean(body.force);

    try {
      // Lấy đủ cột có thể chứa chức vụ (schema thực tế có thể là Cong_Viec / chuc_vu…).
      const { data: rows, error: readError } = await supabase.from(SUPABASE_STAFF_TABLE).select('*');

      if (readError) {
        console.error('Supabase nhan_su sync-vi-tri read error:', readError);
        const hint = /vi_tri/i.test(readError.message || '')
          ? ' Thiếu cột vi_tri — chạy supabase-nhan-su-vi-tri.sql trong Supabase SQL Editor.'
          : '';
        return res.status(500).json({
          error: `${staffWriteErrorMessage(readError)}${hint}`.trim()
        });
      }

      const list = Array.isArray(rows) ? rows : [];
      let updated = 0;
      let skipped = 0;
      let alreadyMatched = 0;
      let missingCode = 0;
      let missingCongViec = 0;
      let missingDepartment = 0;
      const errors: string[] = [];

      for (const row of list) {
        const record = row as Record<string, unknown>;
        // Không lấy từ vi_tri (đã là Phòng ban_Chức vụ sau sync).
        const congViec = pickStaffField(record, ['Cong_Viec', 'cong_viec', 'chuc_vu', 'role'], '');
        const department = pickStaffField(record, ['phong_ban', 'phongban', 'department'], '');
        const currentViTri = pickStaffField(record, ['vi_tri', 'ma_vi_tri'], '');
        const code = pickStaffField(record, ['ma_nhan_su', 'ma_nv'], '');
        if (!code) {
          skipped += 1;
          missingCode += 1;
          continue;
        }
        if (!congViec) {
          skipped += 1;
          missingCongViec += 1;
          continue;
        }
        if (!department) {
          skipped += 1;
          missingDepartment += 1;
          continue;
        }

        const nextViTri = buildStaffViTriLabel(department, congViec);

        if (onlyEmpty && currentViTri) {
          skipped += 1;
          continue;
        }
        if (!force && currentViTri === nextViTri) {
          skipped += 1;
          alreadyMatched += 1;
          continue;
        }

        const { error: updateError } = await supabase
          .from(SUPABASE_STAFF_TABLE)
          .update({ vi_tri: nextViTri })
          .eq('ma_nhan_su', code);

        if (updateError) {
          errors.push(
            `${code}: ${
              isMissingColumnError(updateError) && /vi_tri/i.test(updateError.message || '')
                ? 'Thiếu cột vi_tri — chạy supabase-nhan-su-vi-tri.sql'
                : updateError.message
            }`
          );
          continue;
        }
        updated += 1;
      }

      if (errors.length && updated === 0) {
        return res.status(500).json({
          error: errors[0] || 'Không thể cập nhật vi_tri.',
          updated,
          skipped,
          errors
        });
      }

      const detailParts = [
        alreadyMatched ? `${alreadyMatched} đã khớp` : '',
        missingCongViec ? `${missingCongViec} thiếu chức vụ` : '',
        missingDepartment ? `${missingDepartment} thiếu phòng ban` : '',
        missingCode ? `${missingCode} thiếu mã NV` : ''
      ].filter(Boolean);

      return res.json({
        success: true,
        updated,
        skipped,
        alreadyMatched,
        missingCongViec,
        missingDepartment,
        missingCode,
        total: list.length,
        errors: errors.length ? errors.slice(0, 10) : undefined,
        message:
          updated > 0
            ? `Đã cập nhật vi_tri = Phòng ban_Chức vụ cho ${updated}/${list.length} nhân sự.${
                detailParts.length ? ` (Bỏ qua: ${detailParts.join(', ')})` : ''
              }`
            : `Không có dòng nào cần sửa (${updated}/${list.length}).${
                detailParts.length ? ` ${detailParts.join(' · ')}.` : ''
              }`
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi đồng bộ vi_tri.' });
    }
  });

  app.put('/api/nhan-su/:code', async (req, res) => {
    if (!supabase) {
      return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });
    }

    const code = String(req.params.code || '').trim();
    if (!code) {
      return res.status(400).json({ error: 'Thiếu mã nhân sự.' });
    }

    try {
      const source = req.body && typeof req.body === 'object' ? { ...(req.body as Record<string, unknown>) } : {};
      const parsed = parseStaffBody(source);
      if ('error' in parsed) {
        return res.status(400).json({ error: parsed.error });
      }

      const record = { ...parsed.record };
      delete (record as Record<string, unknown>).ma_nhan_su;

      const { data: updated, error: updateError } = await supabase
        .from(SUPABASE_STAFF_TABLE)
        .update(record)
        .eq('ma_nhan_su', code)
        .select('*')
        .single();

      if (updateError) {
        console.error('Supabase nhan_su update error:', updateError);
        return res.status(500).json({ error: staffWriteErrorMessage(updateError) });
      }

      return res.json({
        success: true,
        staff: updated,
        person: mapStaffRecord(updated as Record<string, unknown>)
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi cập nhật nhân sự.' });
    }
  });

  /** Gán / xóa danh sách vị trí quyền theo mã NV — chỉ cập nhật cột vi_tri_gan. */
  app.patch('/api/nhan-su/:code/vi-tri-gan', async (req, res) => {
    if (!supabase) {
      return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });
    }

    const code = String(req.params.code || '').trim();
    if (!code) {
      return res.status(400).json({ error: 'Thiếu mã nhân sự.' });
    }

    try {
      const source = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
      const vi_tri_gan = normalizeAssignablePositions(source.vi_tri_gan ?? source.assignedPositions ?? source.positions);

      const { data: updated, error: updateError } = await supabase
        .from(SUPABASE_STAFF_TABLE)
        .update({ vi_tri_gan })
        .eq('ma_nhan_su', code)
        .select('*')
        .maybeSingle();

      if (updateError) {
        console.error('Supabase nhan_su vi_tri_gan update error:', updateError);
        return res.status(500).json({
          error: isMissingColumnError(updateError)
            ? 'Bảng nhan_su thiếu cột vi_tri_gan. Hãy chạy supabase-nhan-su-vi-tri-gan.sql.'
            : staffWriteErrorMessage(updateError)
        });
      }

      if (!updated) {
        return res.status(404).json({ error: `Không tìm thấy nhân sự mã ${code}.` });
      }

      return res.json({
        success: true,
        staff: updated,
        person: mapStaffRecord(updated as Record<string, unknown>)
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi gán vị trí nhân sự.' });
    }
  });

  app.delete('/api/nhan-su/:code', async (req, res) => {
    if (!supabase) {
      return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });
    }

    const code = String(req.params.code || '').trim();
    if (!code) {
      return res.status(400).json({ error: 'Thiếu mã nhân sự.' });
    }

    try {
      const { error: deleteError } = await supabase
        .from(SUPABASE_STAFF_TABLE)
        .delete()
        .eq('ma_nhan_su', code);

      if (deleteError) {
        console.error('Supabase nhan_su delete error:', deleteError);
        return res.status(500).json({ error: staffWriteErrorMessage(deleteError) });
      }

      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi xóa nhân sự.' });
    }
  });

  app.post('/api/nhan-su/bulk-delete', async (req, res) => {
    if (!supabase) {
      return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });
    }

    try {
      const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
      const codesRaw = Array.isArray(body.codes) ? body.codes : Array.isArray(body.ids) ? body.ids : [];
      const codes = [...new Set(codesRaw.map(code => String(code || '').trim()).filter(Boolean))];
      if (codes.length === 0) {
        return res.status(400).json({ error: 'Thiếu danh sách mã nhân sự.' });
      }

      const { data, error } = await supabase
        .from(SUPABASE_STAFF_TABLE)
        .delete()
        .in('ma_nhan_su', codes)
        .select('ma_nhan_su');

      if (error) {
        console.error('Supabase nhan_su bulk delete error:', error);
        return res.status(500).json({ error: staffWriteErrorMessage(error) });
      }

      const deleted = Array.isArray(data) ? data.length : 0;
      return res.json({ success: true, deleted, requested: codes.length });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi xóa nhiều nhân sự.' });
    }
  });

  app.get('/api/danh-sach-xe', async (_req, res) => {
    if (!supabase) {
      return res.json({ vehicles: [], total: 0, source: 'local', warning: 'Supabase chưa được cấu hình.' });
    }

    try {
      const { data, error } = await supabase
        .from(SUPABASE_VEHICLES_TABLE)
        .select('*')
        .order('created_at', { ascending: false, nullsFirst: false })
        .order('id', { ascending: false });

      if (error) {
        return respondSupabaseReadError(res, error, SUPABASE_VEHICLES_TABLE, { vehicles: [], total: 0 });
      }
      return res.json({ vehicles: data || [], total: data?.length || 0, source: 'supabase' });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi tải danh sách xe.' });
    }
  });

  app.post('/api/danh-sach-xe', async (req, res) => {
    if (!supabase) return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });

    try {
      const parsed = parseVehicleBody(req.body);
      if ('error' in parsed) return res.status(400).json({ error: parsed.error });

      const { data, error } = await supabase
        .from(SUPABASE_VEHICLES_TABLE)
        .insert(parsed.record)
        .select('*')
        .single();
      if (error) return res.status(500).json({ error: vehicleWriteError(error, SUPABASE_VEHICLES_TABLE) });
      return res.status(201).json({ success: true, vehicle: data });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi thêm xe.' });
    }
  });

  app.put('/api/danh-sach-xe/:id', async (req, res) => {
    if (!supabase) return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ error: 'Thiếu ID xe.' });

    try {
      const parsed = parseVehicleBody(req.body);
      if ('error' in parsed) return res.status(400).json({ error: parsed.error });

      const { data, error } = await supabase
        .from(SUPABASE_VEHICLES_TABLE)
        .update(parsed.record)
        .eq('id', id)
        .select('*')
        .single();
      if (error) return res.status(500).json({ error: vehicleWriteError(error, SUPABASE_VEHICLES_TABLE) });
      return res.json({ success: true, vehicle: data });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi cập nhật xe.' });
    }
  });

  app.delete('/api/danh-sach-xe/:id', async (req, res) => {
    if (!supabase) return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ error: 'Thiếu ID xe.' });

    try {
      const { error } = await supabase.from(SUPABASE_VEHICLES_TABLE).delete().eq('id', id);
      if (error) return res.status(500).json({ error: vehicleWriteError(error, SUPABASE_VEHICLES_TABLE) });
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi xóa xe.' });
    }
  });

  app.get('/api/doi-chieu-lai-xe', async (req, res) => {
    if (!supabase) {
      return res.json({ rows: [], total: 0, source: 'local', warning: 'Supabase chưa được cấu hình.' });
    }

    try {
      const year = Number(req.query.nam ?? req.query.year);
      const month = Number(req.query.thang ?? req.query.month);
      const driverCode = typeof req.query.ma_nhan_su === 'string' ? req.query.ma_nhan_su.trim() : '';
      let query = supabase
        .from(SUPABASE_DRIVER_RECONCILIATION_TABLE)
        .select('*')
        .order('created_at', { ascending: false, nullsFirst: false })
        .order('id', { ascending: false });

      if (Number.isFinite(year) && year > 0) query = query.eq('nam', Math.trunc(year));
      if (Number.isFinite(month) && month >= 1 && month <= 12) query = query.eq('thang', Math.trunc(month));
      if (driverCode) query = query.eq('ma_nhan_su', driverCode);

      const { data, error } = await query;
      if (error) {
        return respondSupabaseReadError(res, error, SUPABASE_DRIVER_RECONCILIATION_TABLE, { rows: [], total: 0 });
      }
      return res.json({ rows: data || [], total: data?.length || 0, source: 'supabase' });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi tải bảng đối chiếu lái xe.' });
    }
  });

  app.post('/api/doi-chieu-lai-xe', async (req, res) => {
    if (!supabase) return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });

    try {
      const parsed = parseDriverReconciliationBody(req.body);
      if ('error' in parsed) return res.status(400).json({ error: parsed.error });
      const { data, error } = await supabase
        .from(SUPABASE_DRIVER_RECONCILIATION_TABLE)
        .insert(parsed.record)
        .select('*')
        .single();
      if (error) {
        return res.status(500).json({ error: vehicleWriteError(error, SUPABASE_DRIVER_RECONCILIATION_TABLE) });
      }
      return res.status(201).json({ success: true, row: data });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi thêm dòng đối chiếu.' });
    }
  });

  app.put('/api/doi-chieu-lai-xe/:id', async (req, res) => {
    if (!supabase) return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ error: 'Thiếu ID dòng đối chiếu.' });

    try {
      const parsed = parseDriverReconciliationBody(req.body);
      if ('error' in parsed) return res.status(400).json({ error: parsed.error });
      const { data, error } = await supabase
        .from(SUPABASE_DRIVER_RECONCILIATION_TABLE)
        .update(parsed.record)
        .eq('id', id)
        .select('*')
        .single();
      if (error) {
        return res.status(500).json({ error: vehicleWriteError(error, SUPABASE_DRIVER_RECONCILIATION_TABLE) });
      }
      return res.json({ success: true, row: data });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi cập nhật dòng đối chiếu.' });
    }
  });

  app.delete('/api/doi-chieu-lai-xe/:id', async (req, res) => {
    if (!supabase) return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ error: 'Thiếu ID dòng đối chiếu.' });

    try {
      const { error } = await supabase.from(SUPABASE_DRIVER_RECONCILIATION_TABLE).delete().eq('id', id);
      if (error) {
        return res.status(500).json({ error: vehicleWriteError(error, SUPABASE_DRIVER_RECONCILIATION_TABLE) });
      }
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi xóa dòng đối chiếu.' });
    }
  });

  async function adjustCustomerDebt(customerCode: string | null | undefined, delta: number) {
    if (!supabase || !customerCode || !delta) return;
    const { data: customer } = await supabase
      .from(SUPABASE_CUSTOMERS_TABLE)
      .select('cong_no')
      .eq('ma_khach_hang', customerCode)
      .maybeSingle();
    if (!customer) return;
    const nextDebt = Number(customer.cong_no || 0) + delta;
    await supabase
      .from(SUPABASE_CUSTOMERS_TABLE)
      .update({ cong_no: nextDebt })
      .eq('ma_khach_hang', customerCode);
  }

  app.get('/api/thu-tien-khach-hang', async (req, res) => {
    if (!supabase) {
      return res.json({ rows: [], total: 0, source: 'local', warning: 'Supabase chưa được cấu hình.' });
    }

    try {
      const customerCode = typeof req.query.ma_khach_hang === 'string' ? req.query.ma_khach_hang.trim() : '';
      const plateNumber = typeof req.query.bien_so_xe === 'string' ? req.query.bien_so_xe.trim() : '';
      const fromDate = typeof req.query.tu_ngay === 'string' ? req.query.tu_ngay.trim() : '';
      const toDate = typeof req.query.den_ngay === 'string' ? req.query.den_ngay.trim() : '';
      let query = supabase
        .from(SUPABASE_CUSTOMER_PAYMENTS_TABLE)
        .select('*')
        .order('created_at', { ascending: false, nullsFirst: false })
        .order('id', { ascending: false });

      if (customerCode) query = query.eq('ma_khach_hang', customerCode);
      if (plateNumber) query = query.eq('bien_so_xe', plateNumber);
      if (fromDate) query = query.gte('ngay_thu', fromDate);
      if (toDate) query = query.lte('ngay_thu', toDate);

      const { data, error } = await query;
      if (error) {
        return respondSupabaseReadError(res, error, SUPABASE_CUSTOMER_PAYMENTS_TABLE, { rows: [], total: 0 });
      }
      return res.json({ rows: data || [], total: data?.length || 0, source: 'supabase' });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi tải phiếu thu tiền khách hàng.' });
    }
  });

  app.post('/api/thu-tien-khach-hang', async (req, res) => {
    if (!supabase) return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });

    try {
      const parsed = parseCustomerPaymentBody(req.body);
      if ('error' in parsed) return res.status(400).json({ error: parsed.error });
      const { data, error } = await supabase
        .from(SUPABASE_CUSTOMER_PAYMENTS_TABLE)
        .insert(parsed.record)
        .select('*')
        .single();
      if (error) {
        return res.status(500).json({ error: customerPaymentWriteError(error, SUPABASE_CUSTOMER_PAYMENTS_TABLE) });
      }
      await adjustCustomerDebt(parsed.record.ma_khach_hang as string | null, -Number(parsed.record.so_tien));
      return res.status(201).json({ success: true, row: data });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi thêm phiếu thu tiền khách hàng.' });
    }
  });

  app.put('/api/thu-tien-khach-hang/:id', async (req, res) => {
    if (!supabase) return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ error: 'Thiếu ID phiếu thu tiền.' });

    try {
      const parsed = parseCustomerPaymentBody(req.body);
      if ('error' in parsed) return res.status(400).json({ error: parsed.error });

      const existing = await supabase
        .from(SUPABASE_CUSTOMER_PAYMENTS_TABLE)
        .select('ma_khach_hang, so_tien')
        .eq('id', id)
        .maybeSingle();

      const { data, error } = await supabase
        .from(SUPABASE_CUSTOMER_PAYMENTS_TABLE)
        .update(parsed.record)
        .eq('id', id)
        .select('*')
        .single();
      if (error) {
        return res.status(500).json({ error: customerPaymentWriteError(error, SUPABASE_CUSTOMER_PAYMENTS_TABLE) });
      }

      if (existing.data) {
        await adjustCustomerDebt(existing.data.ma_khach_hang, Number(existing.data.so_tien) || 0);
      }
      await adjustCustomerDebt(parsed.record.ma_khach_hang as string | null, -Number(parsed.record.so_tien));

      return res.json({ success: true, row: data });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi cập nhật phiếu thu tiền khách hàng.' });
    }
  });

  // Chỉ cập nhật ảnh (sau khi upload Cloudinary bất đồng bộ) — không đụng công nợ.
  app.patch('/api/thu-tien-khach-hang/:id/anh', async (req, res) => {
    if (!supabase) return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ error: 'Thiếu ID phiếu thu tiền.' });

    try {
      const source = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
      const anhUrl = pickRowField(source, ['anh_url', 'imageUrl', 'photoUrl'], '');
      const anhPublicId = pickRowField(source, ['anh_public_id', 'imagePublicId', 'photoPublicId'], '');
      if (anhUrl && !/^https?:\/\//i.test(anhUrl)) {
        return res.status(400).json({ error: 'URL ảnh không hợp lệ.' });
      }

      const { data, error } = await supabase
        .from(SUPABASE_CUSTOMER_PAYMENTS_TABLE)
        .update({
          anh_url: anhUrl || null,
          anh_public_id: anhPublicId || null
        })
        .eq('id', id)
        .select('*')
        .single();
      if (error) {
        return res.status(500).json({ error: customerPaymentWriteError(error, SUPABASE_CUSTOMER_PAYMENTS_TABLE) });
      }
      return res.json({ success: true, row: data });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi cập nhật ảnh phiếu thu tiền.' });
    }
  });

  app.delete('/api/thu-tien-khach-hang/:id', async (req, res) => {
    if (!supabase) return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ error: 'Thiếu ID phiếu thu tiền.' });

    try {
      const existing = await supabase
        .from(SUPABASE_CUSTOMER_PAYMENTS_TABLE)
        .select('ma_khach_hang, so_tien')
        .eq('id', id)
        .maybeSingle();

      const { error } = await supabase.from(SUPABASE_CUSTOMER_PAYMENTS_TABLE).delete().eq('id', id);
      if (error) {
        return res.status(500).json({ error: customerPaymentWriteError(error, SUPABASE_CUSTOMER_PAYMENTS_TABLE) });
      }

      if (existing.data) {
        await adjustCustomerDebt(existing.data.ma_khach_hang, Number(existing.data.so_tien) || 0);
      }
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi xóa phiếu thu tiền khách hàng.' });
    }
  });

  const vehicleOperationRoutes = [
    {
      path: 'chi-phi-xe',
      table: SUPABASE_VEHICLE_EXPENSES_TABLE,
      label: 'chi phí xe',
      parse: parseVehicleExpenseBody,
      dateColumn: 'ngay_gio'
    },
    {
      path: 'nhat-ky-xe',
      table: SUPABASE_VEHICLE_LOGS_TABLE,
      label: 'nhật ký xe',
      parse: parseVehicleLogBody,
      dateColumn: 'ngay_gio'
    },
    {
      path: 'yeu-cau-xuat-hang-xe',
      table: SUPABASE_VEHICLE_DELIVERY_REQUESTS_TABLE,
      label: 'yêu cầu xuất hàng',
      parse: parseVehicleDeliveryRequestBody,
      dateColumn: 'ngay_yeu_cau'
    },
    {
      path: 'nhat-ky-km-xe',
      table: SUPABASE_VEHICLE_KM_LOGS_TABLE,
      label: 'nhật ký KM xe',
      parse: parseVehicleKmLogBody,
      dateColumn: 'ngay_gio_di'
    }
  ] as const;

  // Đặt trước /:id để không bị nuốt path "thu-tu".
  app.put('/api/yeu-cau-xuat-hang-xe/thu-tu', async (req, res) => {
    if (!supabase) return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });

    try {
      const rawItems = Array.isArray(req.body?.items) ? req.body.items : [];
      const items = rawItems
        .filter((item: unknown): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
        .map((item: Record<string, unknown>) => {
          const id = String(item.id ?? '').trim();
          const order = Number(item.thu_tu_giao ?? item.deliveryOrder ?? item.routeOrder);
          return {
            id,
            thu_tu_giao: Number.isFinite(order) && order > 0 ? Math.round(order) : 0,
            dia_diem_giao: String(item.dia_diem_giao || '').trim(),
            vi_do: Number.isFinite(Number(item.vi_do)) ? Number(item.vi_do) : null,
            kinh_do: Number.isFinite(Number(item.kinh_do)) ? Number(item.kinh_do) : null,
            km_vietmap: Math.max(0, Number(item.km_vietmap) || 0),
            km_nhap_tay: item.km_nhap_tay === '' || item.km_nhap_tay === null || item.km_nhap_tay === undefined
              ? null
              : Math.max(0, Number(item.km_nhap_tay) || 0),
            km_chot: Math.max(0, Number(item.km_chot) || 0),
            km_luy_ke: Math.max(0, Number(item.km_luy_ke) || 0)
          };
        })
        .filter((item: { id: string }) => item.id);

      if (items.length === 0) {
        return res.status(400).json({ error: 'Thiếu danh sách thứ tự giao hàng.' });
      }

      const results = [];
      for (const item of items) {
        const { data, error } = await supabase
          .from(SUPABASE_VEHICLE_DELIVERY_REQUESTS_TABLE)
          .update({
            thu_tu_giao: item.thu_tu_giao,
            ...(item.dia_diem_giao ? { dia_diem_giao: item.dia_diem_giao } : {}),
            vi_do: item.vi_do,
            kinh_do: item.kinh_do,
            km_vietmap: item.km_vietmap,
            km_nhap_tay: item.km_nhap_tay,
            km_chot: item.km_chot,
            km_luy_ke: item.km_luy_ke
          })
          .eq('id', item.id)
          .select('*')
          .single();
        if (error) {
          if (isMissingColumnError(error)) {
            return res.status(500).json({
              error:
                'Bảng yeu_cau_xuat_hang_xe thiếu cột thu_tu_giao. Hãy chạy lại file supabase-danh-sach-xe.sql.'
            });
          }
          return res.status(500).json({
            error: `Không thể cập nhật thứ tự giao cho phiếu ${item.id}. ${error.message || ''}`.trim()
          });
        }
        results.push(data);
      }

      return res.json({ success: true, rows: results, total: results.length });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi lưu thứ tự tuyến giao hàng.' });
    }
  });

  app.get('/api/tuyen-giao-hang-xe', async (req, res) => {
    if (!supabase) return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });
    const ngayTuyen = typeof req.query.ngay_tuyen === 'string' ? req.query.ngay_tuyen.trim() : '';
    const bienSoXe = typeof req.query.bien_so_xe === 'string' ? req.query.bien_so_xe.trim().toUpperCase() : '';
    if (!ngayTuyen || !bienSoXe) return res.status(400).json({ error: 'Thiếu ngày tuyến hoặc biển số xe.' });
    try {
      const { data, error } = await supabase
        .from(SUPABASE_VEHICLE_DELIVERY_ROUTES_TABLE)
        .select('*')
        .eq('ngay_tuyen', ngayTuyen)
        .eq('bien_so_xe', bienSoXe)
        .maybeSingle();
      if (error) return res.status(500).json({ error: `Không thể tải cấu hình tuyến. ${error.message || ''}`.trim() });
      return res.json({ row: data || null });
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'Không thể tải cấu hình tuyến.' });
    }
  });

  app.put('/api/tuyen-giao-hang-xe', async (req, res) => {
    if (!supabase) return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });
    const source = req.body && typeof req.body === 'object' ? req.body : {};
    const ngayTuyen = String(source.ngay_tuyen || '').trim();
    const bienSoXe = String(source.bien_so_xe || '').trim().toUpperCase();
    if (!ngayTuyen || !bienSoXe) return res.status(400).json({ error: 'Thiếu ngày tuyến hoặc biển số xe.' });
    const optionalNumber = (value: unknown) => value === '' || value === null || value === undefined
      ? null
      : Number.isFinite(Number(value)) ? Number(value) : null;
    const rawExtraStops = Array.isArray(source.diem_them) ? source.diem_them : [];
    const extraStops = rawExtraStops
      .filter((item: any) => item && typeof item === 'object')
      .map((item: any) => ({
        id: String(item.id || '').trim(),
        ma_khach_hang: String(item.ma_khach_hang || '').trim(),
        ten_khach_hang: String(item.ten_khach_hang || '').trim(),
        dia_chi: String(item.dia_chi || '').trim(),
        vi_do: optionalNumber(item.vi_do),
        kinh_do: optionalNumber(item.kinh_do),
        km_vietmap: Math.max(0, Number(item.km_vietmap) || 0),
        km_nhap_tay: optionalNumber(item.km_nhap_tay),
        km_chot: Math.max(0, Number(item.km_chot) || 0),
        thu_tu: Math.max(0, Math.round(Number(item.thu_tu) || 0))
      }))
      .filter((item: { id: string; dia_chi: string }) => item.id && item.dia_chi)
      .slice(0, 20);
    const record = {
      ngay_tuyen: ngayTuyen,
      bien_so_xe: bienSoXe,
      diem_bat_dau: String(source.diem_bat_dau || '').trim(),
      vi_do_bat_dau: optionalNumber(source.vi_do_bat_dau),
      kinh_do_bat_dau: optionalNumber(source.kinh_do_bat_dau),
      diem_ket_thuc: String(source.diem_ket_thuc || '').trim(),
      vi_do_ket_thuc: optionalNumber(source.vi_do_ket_thuc),
      kinh_do_ket_thuc: optionalNumber(source.kinh_do_ket_thuc),
      loai_phuong_tien: ['car', 'motorcycle', 'truck', 'container'].includes(String(source.loai_phuong_tien))
        ? String(source.loai_phuong_tien)
        : 'car',
      tong_km_vietmap: Math.max(0, Number(source.tong_km_vietmap) || 0),
      tong_km_nhap_tay: optionalNumber(source.tong_km_nhap_tay),
      tong_km_chot: Math.max(0, Number(source.tong_km_chot) || 0),
      tong_thoi_gian_phut: Math.max(0, Number(source.tong_thoi_gian_phut) || 0),
      ly_do_dieu_chinh: String(source.ly_do_dieu_chinh || '').trim() || null,
      diem_them: extraStops,
      updated_at: new Date().toISOString()
    };
    try {
      const { data, error } = await supabase
        .from(SUPABASE_VEHICLE_DELIVERY_ROUTES_TABLE)
        .upsert(record, { onConflict: 'ngay_tuyen,bien_so_xe' })
        .select('*')
        .single();
      if (error) return res.status(500).json({ error: `Không thể lưu tuyến giao hàng. Hãy chạy lại supabase-danh-sach-xe.sql. ${error.message || ''}`.trim() });
      return res.json({ success: true, row: data });
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'Không thể lưu tuyến giao hàng.' });
    }
  });

  app.get('/api/chi-phi-xe/gia-xang', async (req, res) => {
    const date = typeof req.query.ngay === 'string' ? req.query.ngay.trim() : '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Ngày tra giá xăng không hợp lệ.' });
    }

    try {
      const response = await fetchWithTimeoutAndRetry(
        `https://giaxanghomnay.com/api/pvdate/${encodeURIComponent(date)}`,
        { headers: { Accept: 'application/json' } }
      );
      if (!response.ok) {
        return res.status(502).json({ error: `Không thể tải giá xăng ngày ${date}.` });
      }

      const payload: unknown = await response.json();
      const groups = Array.isArray(payload) ? payload : [];
      const records = groups
        .flatMap(group => Array.isArray(group) ? group : [])
        .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
        .filter(item => String(item.date || '').slice(0, 10) === date);
      const seen = new Set<string>();
      const options = records.flatMap(item => {
        const title = String(item.title || '').trim();
        if (!title || seen.has(title)) return [];
        seen.add(title);
        return [{
          title,
          price: Number(item.price ?? item.zone1_price) || 0,
          zone1_price: Number(item.zone1_price ?? item.price) || 0,
          zone2_price: Number(item.zone2_price) || 0
        }];
      });

      return res.json({ date, options });
    } catch (err: any) {
      return res.status(502).json({
        error: err.message || `Không thể kết nối API giá xăng ngày ${date}.`
      });
    }
  });

  for (const route of vehicleOperationRoutes) {
    app.get(`/api/${route.path}`, async (req, res) => {
      if (!supabase) {
        return res.json({ rows: [], total: 0, source: 'local', warning: 'Supabase chưa được cấu hình.' });
      }

      try {
        const plateNumber = typeof req.query.bien_so_xe === 'string' ? req.query.bien_so_xe.trim() : '';
        const fromDate = typeof req.query.tu_ngay === 'string' ? req.query.tu_ngay.trim() : '';
        const toDate = typeof req.query.den_ngay === 'string' ? req.query.den_ngay.trim() : '';
        let query = supabase
          .from(route.table)
          .select('*')
          .order('created_at', { ascending: false, nullsFirst: false })
          .order('id', { ascending: false });

        if (plateNumber) query = query.eq('bien_so_xe', plateNumber);
        if (fromDate) query = query.gte(route.dateColumn, fromDate);
        if (toDate) query = query.lte(route.dateColumn, toDate);

        const { data, error } = await query;
        if (error) {
          return respondSupabaseReadError(res, error, route.table, { rows: [], total: 0 });
        }
        return res.json({ rows: data || [], total: data?.length || 0, source: 'supabase' });
      } catch (err: any) {
        return res.status(500).json({ error: err.message || `Lỗi khi tải ${route.label}.` });
      }
    });

    app.post(`/api/${route.path}`, async (req, res) => {
      if (!supabase) return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });

      try {
        const parsed = route.parse(req.body);
        if ('error' in parsed) return res.status(400).json({ error: parsed.error });
        const { data, error } = await supabase.from(route.table).insert(parsed.record).select('*').single();
        if (error) return res.status(500).json({ error: vehicleWriteError(error, route.table) });
        return res.status(201).json({ success: true, row: data });
      } catch (err: any) {
        return res.status(500).json({ error: err.message || `Lỗi khi thêm ${route.label}.` });
      }
    });

    app.put(`/api/${route.path}/:id`, async (req, res) => {
      if (!supabase) return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });
      const id = String(req.params.id || '').trim();
      if (!id) return res.status(400).json({ error: `Thiếu ID ${route.label}.` });

      try {
        const parsed = route.parse(req.body);
        if ('error' in parsed) return res.status(400).json({ error: parsed.error });
        const { data, error } = await supabase
          .from(route.table)
          .update(parsed.record)
          .eq('id', id)
          .select('*')
          .single();
        if (error) return res.status(500).json({ error: vehicleWriteError(error, route.table) });
        return res.json({ success: true, row: data });
      } catch (err: any) {
        return res.status(500).json({ error: err.message || `Lỗi khi cập nhật ${route.label}.` });
      }
    });

    app.delete(`/api/${route.path}/:id`, async (req, res) => {
      if (!supabase) return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });
      const id = String(req.params.id || '').trim();
      if (!id) return res.status(400).json({ error: `Thiếu ID ${route.label}.` });

      try {
        const { error } = await supabase.from(route.table).delete().eq('id', id);
        if (error) return res.status(500).json({ error: vehicleWriteError(error, route.table) });
        return res.json({ success: true });
      } catch (err: any) {
        return res.status(500).json({ error: err.message || `Lỗi khi xóa ${route.label}.` });
      }
    });
  }

  // Phiếu cân định kỳ dùng DB chính (he-thong) — bảng phieu_can_dinh_ki đã có sẵn.
  registerWeighingSlipRoutes(app, '/api/phieu-can-dinh-ki', {
    localFilePath: WEIGHING_DB_FILE_PATH,
    supabaseTable: SUPABASE_WEIGHING_TABLE,
    sqlMigrationFile: 'supabase-phieu-can-dinh-ki.sql',
    entityLabel: 'phiếu cân',
    localEntryPrefix: 'pcdk_',
    requireAcceptanceStatus: true,
    client: supabase,
    dbLabel: SUPABASE_MAIN_DB_LABEL
  });

  app.get('/api/can-tu-dong', async (req, res) => {
    // Cố định DB can-tu-dong (njdlkyx…) — không fallback sang he-thong.
    if (!supabaseWeighing || !SUPABASE_WEIGHING_URL) {
      return res.status(503).json({
        error:
          `Chưa cấu hình DB cân tự động. Cần SUPABASE_WEIGHING_URL / SUPABASE_WEIGHING_SERVICE_KEY (label ${SUPABASE_WEIGHING_DB_LABEL}).`
      });
    }
    const db = supabaseWeighing;
    const dbLabel = SUPABASE_WEIGHING_DB_LABEL;

    const limitRaw = Number(req.query.limit ?? 200);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.trunc(limitRaw), 1), 10000) : 200;
    const deviceId = String(req.query.deviceId ?? req.query.device_id ?? '').trim();
    const status = String(req.query.status ?? '').trim();
    const qrCode = String(req.query.qrCode ?? req.query.qr_code ?? '').trim();
    const from = String(req.query.from ?? '').trim();
    const to = String(req.query.to ?? '').trim();
    const dateBy = String(req.query.dateBy ?? req.query.date_by ?? '').trim().toLowerCase();
    const filterByNgay =
      dateBy === 'ngay' || dateBy === 'source_date' || dateBy === 'work_date';

    try {
      let query = db
        .from(SUPABASE_CAN_TU_DONG_TABLE)
        .select('*')
        // Dữ liệu cân tự động dùng captured_at làm thời điểm bản ghi được tạo/thu nhận.
        .order('captured_at', { ascending: false, nullsFirst: false })
        .order('id', { ascending: false })
        .limit(limit);

      if (deviceId) query = query.eq('device_id', deviceId);
      if (status) query = query.eq('status', status);
      if (qrCode) query = query.eq('qr_code', qrCode);
      // Mặc định lọc captured_at (thời điểm cân). `dateBy=ngay` → không cắt theo ngày cân,
      // lọc cột Ngày (SOURCE_DATE) sau khi map.
      if (!filterByNgay) {
        if (from) query = query.gte('captured_at', `${from}T00:00:00+07:00`);
        if (to) query = query.lte('captured_at', `${to}T23:59:59.999+07:00`);
      }

      const { data, error } = await query;
      if (error) {
        return res.status(500).json({
          error: error.message || 'Không đọc được bảng can_tu_dong.',
          db: dbLabel
        });
      }

      const rows = Array.isArray(data) ? data : [];
      const matchedRows =
        filterByNgay && (from || to)
          ? rows.filter(row => {
              const ngay = resolveCanTuDongNgayColumn(row as Record<string, unknown>);
              if (!ngay) return false;
              if (from && ngay < from) return false;
              if (to && ngay > to) return false;
              return true;
            })
          : rows;
      const shiftWindows = await loadCanTuDongShiftWindows();
      const records = await Promise.all(
        matchedRows.map(async row => {
          const record = row as Record<string, unknown>;

          const [productUrl, coreUrl, qrUrl] = await Promise.all([
            resolveCanTuDongImageUrl(db, record, {
              urlKey: 'product_image_url',
              pathKey: 'product_image_path',
              publicIdKey: 'product_image_public_id'
            }),
            resolveCanTuDongImageUrl(db, record, {
              urlKey: 'core_image_url',
              pathKey: 'core_image_path',
              publicIdKey: 'core_image_public_id'
            }),
            resolveCanTuDongImageUrl(db, record, {
              urlKey: 'qr_image_url',
              pathKey: 'qr_image_path',
              publicIdKey: 'qr_image_public_id'
            })
          ]);

          const netWeight = resolveCanTuDongNetWeight(record);
          const ca = resolveCanTuDongCa(record, shiftWindows);
          const lenhSx = resolveCanTuDongProductionOrder(record);
          const may = resolveCanTuDongMachine(record);
          const ngay = resolveCanTuDongNgayColumn(record);

          return {
            ...record,
            // Chuẩn hoá net nếu DB để trống nhưng đã có weight + tare
            net_weight: netWeight ?? record.net_weight ?? null,
            ca,
            ngay,
            lenh_sx: lenhSx,
            ma_lenh_sx: lenhSx,
            may,
            machine: may,
            // Alias đọc UI theo nghĩa nghiệp vụ
            can_loi: asFiniteNumber(record.tare_weight),
            can_san_pham: asFiniteNumber(record.weight),
            khoi_luong_thuc: netWeight,
            product_preview_url: productUrl || null,
            core_preview_url: coreUrl || null,
            qr_preview_url: qrUrl || null,
            // Giữ tên cũ để client cũ không vỡ — map đúng nguồn
            preview_url: productUrl || null
          };
        })
      );

      return res.json({
        records,
        total: records.length,
        source: 'supabase',
        db: dbLabel,
        table: SUPABASE_CAN_TU_DONG_TABLE
      });
    } catch (err: any) {
      return res.status(500).json({
        error: err?.message || 'Lỗi khi tải cân tự động.',
        db: dbLabel
      });
    }
  });

  app.post('/api/can-tu-dong/bulk-delete', async (req, res) => {
    if (!supabaseWeighing || !SUPABASE_WEIGHING_URL) {
      return res.status(503).json({
        error:
          `Chưa cấu hình DB cân tự động. Cần SUPABASE_WEIGHING_URL / SUPABASE_WEIGHING_SERVICE_KEY (label ${SUPABASE_WEIGHING_DB_LABEL}).`
      });
    }

    try {
      const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
      const idsRaw = Array.isArray(body.ids) ? body.ids : [];
      const ids = [
        ...new Set(
          idsRaw
            .map(id => {
              if (typeof id === 'number' && Number.isFinite(id)) return id;
              const text = String(id ?? '').trim();
              if (!text) return null;
              const asNum = Number(text);
              return Number.isFinite(asNum) && String(asNum) === text ? asNum : text;
            })
            .filter((id): id is string | number => id != null && id !== '')
        )
      ];
      if (ids.length === 0) {
        return res.status(400).json({ error: 'Thiếu danh sách ID cân tự động.' });
      }

      const { data, error } = await supabaseWeighing
        .from(SUPABASE_CAN_TU_DONG_TABLE)
        .delete()
        .in('id', ids)
        .select('id');

      if (error) {
        console.error('Supabase can_tu_dong bulk delete error:', error);
        return res.status(500).json({
          error: error.message || 'Không thể xóa các dòng cân tự động.',
          db: SUPABASE_WEIGHING_DB_LABEL
        });
      }

      const deleted = Array.isArray(data) ? data.length : 0;
      return res.json({
        success: true,
        deleted,
        requested: ids.length,
        db: SUPABASE_WEIGHING_DB_LABEL,
        table: SUPABASE_CAN_TU_DONG_TABLE
      });
    } catch (err: any) {
      return res.status(500).json({
        error: err?.message || 'Lỗi khi xóa nhiều dòng cân tự động.',
        db: SUPABASE_WEIGHING_DB_LABEL
      });
    }
  });

  app.put('/api/can-tu-dong/:id', async (req, res) => {
    if (!supabaseWeighing || !SUPABASE_WEIGHING_URL) {
      return res.status(503).json({ error: 'Chưa cấu hình DB cân tự động.' });
    }
    const idText = String(req.params.id ?? '').trim();
    if (!idText) return res.status(400).json({ error: 'Thiếu ID cân tự động.' });
    const idNumber = Number(idText);
    const id: string | number = Number.isFinite(idNumber) && String(idNumber) === idText ? idNumber : idText;
    const body = req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {};
    const numberOrNull = (value: unknown) => {
      if (value === '' || value == null) return null;
      const parsed = Number(String(value).replace(',', '.'));
      return Number.isFinite(parsed) ? parsed : NaN;
    };
    const tareWeight = numberOrNull(body.tare_weight);
    const weight = numberOrNull(body.weight);
    if (Number.isNaN(tareWeight) || Number.isNaN(weight)) {
      return res.status(400).json({ error: 'Trọng lượng phải là số hợp lệ.' });
    }
    try {
      const { data: existing, error: readError } = await supabaseWeighing
        .from(SUPABASE_CAN_TU_DONG_TABLE)
        .select('metadata')
        .eq('id', id)
        .maybeSingle();
      if (readError) return res.status(500).json({ error: readError.message || 'Không thể đọc dòng cân tự động.' });
      if (!existing) return res.status(404).json({ error: 'Không tìm thấy dòng cân tự động.' });
      const currentMetadata = existing.metadata && typeof existing.metadata === 'object' && !Array.isArray(existing.metadata)
        ? existing.metadata as Record<string, unknown>
        : {};
      const shift = String(body.ca ?? '').trim();
      const ngay = String(body.ngay ?? body.work_date ?? body.SOURCE_DATE ?? '').trim();
      const lenhSx = String(
        body.lenh_sx ?? body.ma_lenh_sx ?? body.production_order ?? body.SOURCE_PRODUCTION_ORDER ?? ''
      ).trim();
      const may = String(
        body.may ?? body.machine ?? body.SOURCE_MACHINE ?? body.source_machine ?? ''
      ).trim();
      const payload = {
        qr_code: String(body.qr_code ?? '').trim() || null,
        tare_weight: tareWeight,
        weight,
        unit: String(body.unit ?? '').trim() || 'kg',
        status: String(body.status ?? '').trim() || null,
        device_id: String(body.device_id ?? '').trim() || null,
        metadata: mergeCanTuDongNgayLenhSxMetadata(currentMetadata, {
          ngay: ngay || null,
          lenhSx: lenhSx || null,
          ca: shift || null,
          may: may || null
        })
      };
      const { data, error } = await supabaseWeighing
        .from(SUPABASE_CAN_TU_DONG_TABLE)
        .update(payload)
        .eq('id', id)
        .select('*')
        .maybeSingle();
      if (error) return res.status(500).json({ error: error.message || 'Không thể cập nhật dòng cân tự động.' });
      if (!data) return res.status(404).json({ error: 'Không tìm thấy dòng cân tự động.' });
      return res.json({ success: true, record: data });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || 'Lỗi khi cập nhật dòng cân tự động.' });
    }
  });

  app.post('/api/can-tu-dong/bulk-autofill', async (req, res) => {
    if (!supabaseWeighing || !SUPABASE_WEIGHING_URL) {
      return res.status(503).json({
        error:
          `Chưa cấu hình DB cân tự động. Cần SUPABASE_WEIGHING_URL / SUPABASE_WEIGHING_SERVICE_KEY (label ${SUPABASE_WEIGHING_DB_LABEL}).`
      });
    }

    try {
      const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
      const idsRaw = Array.isArray(body.ids) ? body.ids : [];
      const ids = [
        ...new Set(
          idsRaw
            .map(id => {
              if (typeof id === 'number' && Number.isFinite(id)) return id;
              const text = String(id ?? '').trim();
              if (!text) return null;
              const asNum = Number(text);
              return Number.isFinite(asNum) && String(asNum) === text ? asNum : text;
            })
            .filter((id): id is string | number => id != null && id !== '')
        )
      ];

      const ngay = String(body.ngay ?? body.work_date ?? '2026-08-20').trim() || '2026-08-20';
      const hasLenhField =
        Object.prototype.hasOwnProperty.call(body, 'lenh_sx') ||
        Object.prototype.hasOwnProperty.call(body, 'ma_lenh_sx') ||
        Object.prototype.hasOwnProperty.call(body, 'production_order');
      const lenhSx = hasLenhField
        ? String(body.lenh_sx ?? body.ma_lenh_sx ?? body.production_order ?? '').trim()
        : '';
      const ca = String(body.ca ?? body.shift ?? body.SOURCE_SHIFT ?? '12C2').trim() || '12C2';
      const may =
        String(body.may ?? body.machine ?? body.SOURCE_MACHINE ?? body.source_machine ?? 'Máy Bao Bì').trim() ||
        'Máy Bao Bì';
      const updateAll =
        body.all === true ||
        body.all === 'true' ||
        String(body.scope ?? '').trim().toLowerCase() === 'all';

      let rows: Array<Record<string, unknown>> = [];
      if (updateAll) {
        const { data: allRows, error: readAllError } = await supabaseWeighing
          .from(SUPABASE_CAN_TU_DONG_TABLE)
          .select('id, metadata')
          .order('id', { ascending: true })
          .limit(10000);
        if (readAllError) {
          return res.status(500).json({
            error: readAllError.message || 'Không đọc được dòng cân tự động.',
            db: SUPABASE_WEIGHING_DB_LABEL
          });
        }
        rows = Array.isArray(allRows) ? (allRows as Array<Record<string, unknown>>) : [];
      } else {
        if (ids.length === 0) {
          return res.status(400).json({ error: 'Thiếu danh sách ID cân tự động.' });
        }
        const { data: existingRows, error: readError } = await supabaseWeighing
          .from(SUPABASE_CAN_TU_DONG_TABLE)
          .select('id, metadata')
          .in('id', ids);

        if (readError) {
          return res.status(500).json({
            error: readError.message || 'Không đọc được dòng cân tự động.',
            db: SUPABASE_WEIGHING_DB_LABEL
          });
        }
        rows = Array.isArray(existingRows) ? (existingRows as Array<Record<string, unknown>>) : [];
      }

      if (rows.length === 0) {
        return res.status(404).json({ error: 'Không tìm thấy dòng cân tự động đã chọn.' });
      }

      let updated = 0;
      for (const record of rows) {
        const currentMetadata = asCanTuDongMetadata(record.metadata) || {};
        const metadata = mergeCanTuDongNgayLenhSxMetadata(currentMetadata, {
          ngay,
          lenhSx,
          ca,
          may
        });
        const { data: updatedRows, error: updateError } = await supabaseWeighing
          .from(SUPABASE_CAN_TU_DONG_TABLE)
          .update({ metadata })
          .eq('id', record.id)
          .select('id');
        if (updateError) {
          return res.status(500).json({
            error: updateError.message || 'Không thể tự động điền dòng cân tự động.',
            db: SUPABASE_WEIGHING_DB_LABEL,
            updated
          });
        }
        if (!Array.isArray(updatedRows) || updatedRows.length === 0) {
          continue;
        }
        updated += 1;
      }

      return res.json({
        success: true,
        updated,
        requested: updateAll ? rows.length : ids.length,
        ngay,
        ca,
        lenh_sx: lenhSx,
        may,
        db: SUPABASE_WEIGHING_DB_LABEL,
        table: SUPABASE_CAN_TU_DONG_TABLE
      });
    } catch (err: any) {
      return res.status(500).json({
        error: err?.message || 'Lỗi khi tự động điền cân tự động.',
        db: SUPABASE_WEIGHING_DB_LABEL
      });
    }
  });

  /** Chỉ điền cột Ca (mặc định 12C2) cho các dòng đã chọn. */
  app.post('/api/can-tu-dong/bulk-set-ca', async (req, res) => {
    if (!supabaseWeighing || !SUPABASE_WEIGHING_URL) {
      return res.status(503).json({
        error:
          `Chưa cấu hình DB cân tự động. Cần SUPABASE_WEIGHING_URL / SUPABASE_WEIGHING_SERVICE_KEY (label ${SUPABASE_WEIGHING_DB_LABEL}).`
      });
    }

    try {
      const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
      const idsRaw = Array.isArray(body.ids) ? body.ids : [];
      const ids = [
        ...new Set(
          idsRaw
            .map(id => {
              if (typeof id === 'number' && Number.isFinite(id)) return id;
              const text = String(id ?? '').trim();
              if (!text) return null;
              const asNum = Number(text);
              return Number.isFinite(asNum) && String(asNum) === text ? asNum : text;
            })
            .filter((id): id is string | number => id != null && id !== '')
        )
      ];
      if (ids.length === 0) {
        return res.status(400).json({ error: 'Thiếu danh sách ID cân tự động.' });
      }

      const ca = String(body.ca ?? body.shift ?? body.SOURCE_SHIFT ?? '12C2').trim() || '12C2';

      const { data: existingRows, error: readError } = await supabaseWeighing
        .from(SUPABASE_CAN_TU_DONG_TABLE)
        .select('id, metadata')
        .in('id', ids);

      if (readError) {
        return res.status(500).json({
          error: readError.message || 'Không đọc được dòng cân tự động.',
          db: SUPABASE_WEIGHING_DB_LABEL
        });
      }

      const rows = Array.isArray(existingRows) ? existingRows : [];
      if (rows.length === 0) {
        return res.status(404).json({ error: 'Không tìm thấy dòng cân tự động đã chọn.' });
      }

      let updated = 0;
      for (const row of rows) {
        const record = row as Record<string, unknown>;
        const currentMetadata = asCanTuDongMetadata(record.metadata) || {};
        const metadata = mergeCanTuDongNgayLenhSxMetadata(currentMetadata, { ca });
        let updateError = (
          await supabaseWeighing
            .from(SUPABASE_CAN_TU_DONG_TABLE)
            .update({ metadata, ca })
            .eq('id', record.id)
        ).error;
        if (updateError && (updateError.code === 'PGRST204' || /column|schema cache|ca/i.test(String(updateError.message || '')))) {
          updateError = (
            await supabaseWeighing
              .from(SUPABASE_CAN_TU_DONG_TABLE)
              .update({ metadata })
              .eq('id', record.id)
          ).error;
        }
        if (updateError) {
          return res.status(500).json({
            error: updateError.message || 'Không thể điền ca cho dòng cân tự động.',
            db: SUPABASE_WEIGHING_DB_LABEL,
            updated
          });
        }
        updated += 1;
      }

      return res.json({
        success: true,
        updated,
        requested: ids.length,
        ca,
        db: SUPABASE_WEIGHING_DB_LABEL,
        table: SUPABASE_CAN_TU_DONG_TABLE
      });
    } catch (err: any) {
      return res.status(500).json({
        error: err?.message || 'Lỗi khi điền ca cân tự động.',
        db: SUPABASE_WEIGHING_DB_LABEL
      });
    }
  });

  /** Đổi cột Ngày (SOURCE_DATE / work_date) cho nhiều dòng — không đụng captured_at. */
  app.post('/api/can-tu-dong/bulk-set-ngay', async (req, res) => {
    if (!supabaseWeighing || !SUPABASE_WEIGHING_URL) {
      return res.status(503).json({
        error:
          `Chưa cấu hình DB cân tự động. Cần SUPABASE_WEIGHING_URL / SUPABASE_WEIGHING_SERVICE_KEY (label ${SUPABASE_WEIGHING_DB_LABEL}).`
      });
    }

    try {
      const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
      const idsRaw = Array.isArray(body.ids) ? body.ids : [];
      const ids = [
        ...new Set(
          idsRaw
            .map(id => {
              if (typeof id === 'number' && Number.isFinite(id)) return id;
              const text = String(id ?? '').trim();
              if (!text) return null;
              const asNum = Number(text);
              return Number.isFinite(asNum) && String(asNum) === text ? asNum : text;
            })
            .filter((id): id is string | number => id != null && id !== '')
        )
      ];
      if (ids.length === 0) {
        return res.status(400).json({ error: 'Thiếu danh sách ID cân tự động.' });
      }

      const ngay =
        parseCanTuDongNgayToIso(body.ngay ?? body.work_date ?? body.SOURCE_DATE) ||
        new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });

      const { data: existingRows, error: readError } = await supabaseWeighing
        .from(SUPABASE_CAN_TU_DONG_TABLE)
        .select('id, metadata')
        .in('id', ids);

      if (readError) {
        return res.status(500).json({
          error: readError.message || 'Không đọc được dòng cân tự động.',
          db: SUPABASE_WEIGHING_DB_LABEL
        });
      }

      const rows = Array.isArray(existingRows) ? existingRows : [];
      if (rows.length === 0) {
        return res.status(404).json({ error: 'Không tìm thấy dòng cân tự động đã chọn.' });
      }

      let updated = 0;
      for (const row of rows) {
        const record = row as Record<string, unknown>;
        const currentMetadata = asCanTuDongMetadata(record.metadata) || {};
        const metadata = mergeCanTuDongNgayLenhSxMetadata(currentMetadata, { ngay });
        const payloads: Array<Record<string, unknown>> = [
          { metadata, ngay, work_date: ngay },
          { metadata, ngay },
          { metadata }
        ];
        let updateError: { message?: string; code?: string } | null = null;
        for (const payload of payloads) {
          const result = await supabaseWeighing
            .from(SUPABASE_CAN_TU_DONG_TABLE)
            .update(payload)
            .eq('id', record.id);
          updateError = result.error;
          if (!updateError) break;
          if (
            updateError.code !== 'PGRST204' &&
            !/column|schema cache|ngay|work_date/i.test(String(updateError.message || ''))
          ) {
            break;
          }
        }
        if (updateError) {
          return res.status(500).json({
            error: updateError.message || 'Không thể đổi Ngày cho dòng cân tự động.',
            db: SUPABASE_WEIGHING_DB_LABEL,
            updated
          });
        }
        updated += 1;
      }

      return res.json({
        success: true,
        updated,
        requested: ids.length,
        ngay,
        db: SUPABASE_WEIGHING_DB_LABEL,
        table: SUPABASE_CAN_TU_DONG_TABLE
      });
    } catch (err: any) {
      return res.status(500).json({
        error: err?.message || 'Lỗi khi đổi Ngày cân tự động.',
        db: SUPABASE_WEIGHING_DB_LABEL
      });
    }
  });

  /** Đổi cột Cân lõi (tare_weight) cho nhiều dòng. `net_weight` là generated column — DB tự tính. */
  app.post('/api/can-tu-dong/bulk-set-tare', async (req, res) => {
    if (!supabaseWeighing || !SUPABASE_WEIGHING_URL) {
      return res.status(503).json({
        error:
          `Chưa cấu hình DB cân tự động. Cần SUPABASE_WEIGHING_URL / SUPABASE_WEIGHING_SERVICE_KEY (label ${SUPABASE_WEIGHING_DB_LABEL}).`
      });
    }

    try {
      const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
      const idsRaw = Array.isArray(body.ids) ? body.ids : [];
      const ids = [
        ...new Set(
          idsRaw
            .map(id => {
              if (typeof id === 'number' && Number.isFinite(id)) return id;
              const text = String(id ?? '').trim();
              if (!text) return null;
              const asNum = Number(text);
              return Number.isFinite(asNum) && String(asNum) === text ? asNum : text;
            })
            .filter((id): id is string | number => id != null && id !== '')
        )
      ];
      if (ids.length === 0) {
        return res.status(400).json({ error: 'Thiếu danh sách ID cân tự động.' });
      }

      const tareRaw = body.tare_weight ?? body.can_loi ?? body.tare;
      if (tareRaw === '' || tareRaw == null) {
        return res.status(400).json({ error: 'Thiếu số cân lõi (tare_weight).' });
      }
      const tareWeight = Number(String(tareRaw).replace(',', '.'));
      if (!Number.isFinite(tareWeight) || tareWeight < 0) {
        return res.status(400).json({ error: 'Số cân lõi phải là số ≥ 0.' });
      }
      const tareRounded = Math.round(tareWeight * 1000) / 1000;

      const { data: updatedRows, error: updateError } = await supabaseWeighing
        .from(SUPABASE_CAN_TU_DONG_TABLE)
        .update({ tare_weight: tareRounded })
        .in('id', ids)
        .select('id');

      if (updateError) {
        return res.status(500).json({
          error: updateError.message || 'Không thể đổi cân lõi cho dòng cân tự động.',
          db: SUPABASE_WEIGHING_DB_LABEL,
          updated: 0
        });
      }

      const updated = Array.isArray(updatedRows) ? updatedRows.length : 0;
      if (updated === 0) {
        return res.status(404).json({ error: 'Không tìm thấy dòng cân tự động đã chọn.' });
      }

      return res.json({
        success: true,
        updated,
        requested: ids.length,
        tare_weight: tareRounded,
        db: SUPABASE_WEIGHING_DB_LABEL,
        table: SUPABASE_CAN_TU_DONG_TABLE
      });
    } catch (err: any) {
      return res.status(500).json({
        error: err?.message || 'Lỗi khi đổi cân lõi cân tự động.',
        db: SUPABASE_WEIGHING_DB_LABEL
      });
    }
  });

  /** Đổi cột Mã SP (phần mã trong `qr_code`) cho nhiều dòng — TL tiêu chuẩn / lõi LT tự theo mã mới. */
  app.post('/api/can-tu-dong/bulk-set-ma-sp', async (req, res) => {
    if (!supabaseWeighing || !SUPABASE_WEIGHING_URL) {
      return res.status(503).json({
        error:
          `Chưa cấu hình DB cân tự động. Cần SUPABASE_WEIGHING_URL / SUPABASE_WEIGHING_SERVICE_KEY (label ${SUPABASE_WEIGHING_DB_LABEL}).`
      });
    }

    try {
      const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
      const idsRaw = Array.isArray(body.ids) ? body.ids : [];
      const ids = [
        ...new Set(
          idsRaw
            .map(id => {
              if (typeof id === 'number' && Number.isFinite(id)) return id;
              const text = String(id ?? '').trim();
              if (!text) return null;
              const asNum = Number(text);
              return Number.isFinite(asNum) && String(asNum) === text ? asNum : text;
            })
            .filter((id): id is string | number => id != null && id !== '')
        )
      ];
      if (ids.length === 0) {
        return res.status(400).json({ error: 'Thiếu danh sách ID cân tự động.' });
      }

      const maSp = String(body.ma_sp ?? body.product_code ?? body.qr_code ?? '').trim();
      if (!maSp) {
        return res.status(400).json({ error: 'Thiếu mã SP mới.' });
      }

      const { data: existingRows, error: readError } = await supabaseWeighing
        .from(SUPABASE_CAN_TU_DONG_TABLE)
        .select('id, qr_code')
        .in('id', ids);

      if (readError) {
        return res.status(500).json({
          error: readError.message || 'Không đọc được dòng cân tự động.',
          db: SUPABASE_WEIGHING_DB_LABEL
        });
      }

      const rows = Array.isArray(existingRows) ? (existingRows as Array<Record<string, unknown>>) : [];
      if (rows.length === 0) {
        return res.status(404).json({ error: 'Không tìm thấy dòng cân tự động đã chọn.' });
      }

      let updated = 0;
      for (const record of rows) {
        const nextQr = replaceCanTuDongQrProductCode(
          pickCanTuDongText(record, ['qr_code']),
          maSp
        );
        const { data: updatedRows, error: updateError } = await supabaseWeighing
          .from(SUPABASE_CAN_TU_DONG_TABLE)
          .update({ qr_code: nextQr || null })
          .eq('id', record.id)
          .select('id');
        if (updateError) {
          return res.status(500).json({
            error: updateError.message || 'Không thể đổi Mã SP cho dòng cân tự động.',
            db: SUPABASE_WEIGHING_DB_LABEL,
            updated
          });
        }
        if (Array.isArray(updatedRows) && updatedRows.length > 0) updated += updatedRows.length;
      }

      return res.json({
        success: true,
        updated,
        requested: ids.length,
        ma_sp: maSp,
        db: SUPABASE_WEIGHING_DB_LABEL,
        table: SUPABASE_CAN_TU_DONG_TABLE
      });
    } catch (err: any) {
      return res.status(500).json({
        error: err?.message || 'Lỗi khi đổi Mã SP cân tự động.',
        db: SUPABASE_WEIGHING_DB_LABEL
      });
    }
  });

  app.get('/api/kiem-kho', async (req, res) => {
    const resolved = await resolveSupabaseClientForTable(SUPABASE_KIEM_KHO_TABLE);
    if (!resolved) {
      return res.status(503).json({
        error: `Bảng ${SUPABASE_KIEM_KHO_TABLE} chưa có trên Supabase mới lẫn cũ.`
      });
    }
    const db = resolved.client;
    const dbLabel = resolved.label;

    const limitRaw = Number(req.query.limit ?? 200);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.trunc(limitRaw), 1), 500) : 200;
    const tenKho = String(req.query.tenKho ?? req.query.ten_kho ?? '').trim();
    const dotKiemKho = String(req.query.dotKiemKho ?? req.query.dot_kiem_kho ?? '').trim();
    const maSp = String(req.query.maSp ?? req.query.ma_sp ?? '').trim();
    const maGoc = String(req.query.maGoc ?? req.query.maNvl ?? req.query.ma_nvl ?? '').trim();
    const from = String(req.query.from ?? '').trim();
    const to = String(req.query.to ?? '').trim();

    try {
      let query = db
        .from(SUPABASE_KIEM_KHO_TABLE)
        .select('*')
        .order('created_at', { ascending: false, nullsFirst: false })
        .order('id', { ascending: false })
        .limit(limit);

      if (tenKho) query = query.eq('ten_kho', tenKho);
      if (dotKiemKho) query = query.eq('dot_kiem_kho', dotKiemKho);
      if (maSp) query = query.eq('ma_sp', maSp);
      // Khớp mã gốc SP: ma_nvl (= tiền tố trước _/-) hoặc ma_sp bắt đầu bằng mã gốc.
      if (maGoc) {
        const safe = maGoc.replace(/[,]/g, '');
        query = query.or(
          [`ma_nvl.eq.${safe}`, `ma_sp.eq.${safe}`, `ma_sp.ilike.${safe}_%`, `ma_sp.ilike.${safe}-%`].join(',')
        );
      }
      if (from) query = query.gte('ngay_gio_kiem_kho', `${from}T00:00:00`);
      if (to) query = query.lte('ngay_gio_kiem_kho', `${to}T23:59:59.999`);

      const { data, error } = await query;
      if (error) {
        return res.status(500).json({
          error: error.message || 'Không đọc được bảng kiem_kho.',
          db: dbLabel
        });
      }

      const records = Array.isArray(data) ? data : [];
      return res.json({
        records,
        total: records.length,
        source: 'supabase',
        db: dbLabel,
        table: SUPABASE_KIEM_KHO_TABLE
      });
    } catch (err: any) {
      return res.status(500).json({
        error: err?.message || 'Lỗi khi tải kiểm kho.',
        db: dbLabel
      });
    }
  });

  /**
   * Tồn đầu kỳ theo Bảng tổng hợp kiểm kho (tong_so_luong theo ma_nvl).
   * Ưu tiên đợt đã chốt mới nhất; nếu chưa có / thiếu cột chốt thì đếm dòng chi tiết theo mã.
   * Query: maGoc (bắt buộc), tenKho (tuỳ chọn — ưu tiên đúng kho SP).
   * Không bắt buộc cột thoi_gian_xac_nhan (DB cũ có thể chưa chạy migration).
   */
  app.get('/api/kiem-kho/ton-dau-ky', async (req, res) => {
    const resolved = await resolveSupabaseClientForTable(SUPABASE_KIEM_KHO_TABLE);
    if (!resolved) {
      return res.status(503).json({
        error: `Bảng ${SUPABASE_KIEM_KHO_TABLE} chưa có trên Supabase mới lẫn cũ.`
      });
    }
    const db = resolved.client;
    const dbLabel = resolved.label;

    const maGocRaw = String(req.query.maGoc ?? req.query.maNvl ?? req.query.ma_nvl ?? req.query.maSp ?? '').trim();
    const tenKho = String(req.query.tenKho ?? req.query.ten_kho ?? '').trim();
    if (!maGocRaw) {
      return res.status(400).json({ error: 'Thiếu mã SP gốc (maGoc).' });
    }

    const normalizeCodeKey = (value: unknown) =>
      String(value ?? '')
        .trim()
        .replace(/[\s\u00A0\u1680\u2000-\u200B\u202F\u205F\u3000\uFEFF]+/g, '')
        .toUpperCase();

    const targetKey = normalizeCodeKey(maGocRaw);
    const codeVariants = [
      ...new Set(
        [maGocRaw, maGocRaw.replace(/\s+/g, ''), maGocRaw.replace(/\s+/g, ' ')]
          .map(v => String(v ?? '').trim())
          .filter(Boolean)
      )
    ];

    const matchesMaNvl = (maNvl: unknown) => {
      const raw = String(maNvl ?? '').trim();
      if (!raw) return false;
      const key = normalizeCodeKey(raw);
      if (key === targetKey) return true;
      const us = raw.indexOf('_');
      if (us > 0 && normalizeCodeKey(raw.slice(0, us)) === targetKey) return true;
      return false;
    };

    const maNvlOrFilter = () =>
      codeVariants.flatMap(code => {
        const safe = code.replace(/"/g, '');
        return [`ma_nvl.eq."${safe}"`, `ma_nvl.ilike."${safe}_%"`];
      });

    try {
      type Candidate = {
        tong_so_luong: number;
        ma_nvl: string;
        ten_sp: string;
        loai_sp: string;
        dot_kiem_kho: string;
        chot_luc: string;
        ten_kho: string;
        confirmed: boolean;
        source: string;
      };

      const candidates: Candidate[] = [];

      // 1) Ưu tiên Bảng tổng hợp (không cần cột thoi_gian_xac_nhan).
      {
        let tongHopQuery = db
          .from(SUPABASE_KIEM_KHO_TONG_HOP_TABLE)
          .select('ma_nvl, ten_sp, loai_sp, tong_so_luong, dot_kiem_kho, chot_luc, nguoi_chot')
          .order('chot_luc', { ascending: false, nullsFirst: false })
          .limit(200);

        const orParts = maNvlOrFilter();
        if (orParts.length > 0) {
          tongHopQuery = tongHopQuery.or(orParts.join(','));
        }

        const { data: tongHopRows, error: tongHopError } = await tongHopQuery;
        if (tongHopError) {
          const missingTable = /relation|does not exist|schema cache/i.test(tongHopError.message || '');
          if (!missingTable) {
            console.warn(`[kiem-kho/ton-dau-ky] tong_hop: ${tongHopError.message}`);
          }
        } else {
          const dots = [
            ...new Set(
              (tongHopRows || [])
                .map(row => String((row as { dot_kiem_kho?: string }).dot_kiem_kho ?? '').trim())
                .filter(Boolean)
            )
          ];

          const tenKhoByDot = new Map<string, string>();
          if (dots.length > 0) {
            const { data: dotMeta } = await db
              .from(SUPABASE_KIEM_KHO_TABLE)
              .select('dot_kiem_kho, ten_kho')
              .in('dot_kiem_kho', dots)
              .limit(2000);
            for (const row of dotMeta || []) {
              const dot = String((row as { dot_kiem_kho?: string }).dot_kiem_kho ?? '').trim();
              const kho = String((row as { ten_kho?: string }).ten_kho ?? '').trim();
              if (dot && kho && !tenKhoByDot.has(dot)) tenKhoByDot.set(dot, kho);
            }
          }

          for (const row of tongHopRows || []) {
            const maNvl = String((row as { ma_nvl?: string }).ma_nvl ?? '').trim();
            if (!matchesMaNvl(maNvl)) continue;
            const dot = String((row as { dot_kiem_kho?: string }).dot_kiem_kho ?? '').trim();
            const qty = Number((row as { tong_so_luong?: number }).tong_so_luong);
            candidates.push({
              tong_so_luong: Number.isFinite(qty) ? qty : 0,
              ma_nvl: maNvl,
              ten_sp: String((row as { ten_sp?: string }).ten_sp ?? '').trim(),
              loai_sp: String((row as { loai_sp?: string }).loai_sp ?? '').trim(),
              dot_kiem_kho: dot,
              chot_luc: String((row as { chot_luc?: string }).chot_luc ?? '').trim(),
              ten_kho: tenKhoByDot.get(dot) || '',
              confirmed: true,
              source: 'kiem_kho_tong_hop'
            });
          }
        }
      }

      // 2) Fallback: đếm dòng chi tiết kiem_kho theo mã (không dùng thoi_gian_xac_nhan).
      if (candidates.length === 0) {
        let detailQuery = db
          .from(SUPABASE_KIEM_KHO_TABLE)
          .select('dot_kiem_kho, ten_kho, ngay_gio_kiem_kho, ma_nvl, ten_sp, loai_sp')
          .order('ngay_gio_kiem_kho', { ascending: false, nullsFirst: false })
          .limit(5000);
        if (tenKho) detailQuery = detailQuery.eq('ten_kho', tenKho);
        const orParts = maNvlOrFilter();
        if (orParts.length > 0) {
          detailQuery = detailQuery.or(orParts.join(','));
        }

        const { data: detailRows, error: detailError } = await detailQuery;
        if (detailError) {
          return res.status(500).json({
            error: detailError.message || 'Không đọc được bảng kiểm kho.',
            db: dbLabel
          });
        }

        const byDot = new Map<
          string,
          {
            count: number;
            ma_nvl: string;
            ten_sp: string;
            loai_sp: string;
            ten_kho: string;
            ngay: string;
          }
        >();

        for (const row of detailRows || []) {
          const maNvl = String((row as { ma_nvl?: string }).ma_nvl ?? '').trim();
          if (!matchesMaNvl(maNvl)) continue;
          const dot =
            String((row as { dot_kiem_kho?: string }).dot_kiem_kho ?? '').trim() || '__no_dot__';
          const ngay = String((row as { ngay_gio_kiem_kho?: string }).ngay_gio_kiem_kho ?? '').trim();
          const current = byDot.get(dot) || {
            count: 0,
            ma_nvl: maNvl,
            ten_sp: String((row as { ten_sp?: string }).ten_sp ?? '').trim(),
            loai_sp: String((row as { loai_sp?: string }).loai_sp ?? '').trim(),
            ten_kho: String((row as { ten_kho?: string }).ten_kho ?? '').trim(),
            ngay: ''
          };
          current.count += 1;
          if (ngay && (!current.ngay || ngay > current.ngay)) current.ngay = ngay;
          if (!current.ten_kho) {
            current.ten_kho = String((row as { ten_kho?: string }).ten_kho ?? '').trim();
          }
          byDot.set(dot, current);
        }

        for (const [dot, info] of byDot.entries()) {
          candidates.push({
            tong_so_luong: info.count,
            ma_nvl: info.ma_nvl,
            ten_sp: info.ten_sp,
            loai_sp: info.loai_sp,
            dot_kiem_kho: dot === '__no_dot__' ? '' : dot,
            chot_luc: info.ngay,
            ten_kho: info.ten_kho,
            confirmed: false,
            source: 'kiem_kho_count'
          });
        }
      }

      if (candidates.length === 0) {
        return res.json({
          ton_dau_ky: null,
          tong_so_luong: null,
          ma_nvl: maGocRaw,
          dot_kiem_kho: null,
          chot_luc: null,
          ten_kho: tenKho || null,
          confirmed: false,
          source: 'empty',
          db: dbLabel
        });
      }

      const tenKhoKey = normalizeCodeKey(tenKho);
      const ranked = [...candidates].sort((a, b) => {
        if (tenKhoKey) {
          const aMatch = normalizeCodeKey(a.ten_kho) === tenKhoKey ? 1 : 0;
          const bMatch = normalizeCodeKey(b.ten_kho) === tenKhoKey ? 1 : 0;
          if (aMatch !== bMatch) return bMatch - aMatch;
        }
        if (a.confirmed !== b.confirmed) return a.confirmed ? -1 : 1;
        return String(b.chot_luc || '').localeCompare(String(a.chot_luc || ''));
      });

      const best = ranked[0];
      return res.json({
        ton_dau_ky: best.tong_so_luong,
        tong_so_luong: best.tong_so_luong,
        ma_nvl: best.ma_nvl,
        ten_sp: best.ten_sp,
        loai_sp: best.loai_sp,
        dot_kiem_kho: best.dot_kiem_kho,
        chot_luc: best.chot_luc || null,
        ten_kho: best.ten_kho || null,
        confirmed: best.confirmed,
        source: best.source,
        db: dbLabel
      });
    } catch (err: any) {
      return res.status(500).json({
        error: err?.message || 'Lỗi khi lấy tồn đầu kỳ từ kiểm kho.',
        db: dbLabel
      });
    }
  });

  /** Đợt kiểm kho chưa chốt = còn ít nhất 1 dòng chưa có thoi_gian_xac_nhan, thuộc đúng kho đang chọn. */
  app.get('/api/kiem-kho/dot-mo', async (req, res) => {
    const resolved = await resolveSupabaseClientForTable(SUPABASE_KIEM_KHO_TABLE);
    if (!resolved) {
      return res.status(503).json({
        error: `Bảng ${SUPABASE_KIEM_KHO_TABLE} chưa có trên Supabase mới lẫn cũ.`
      });
    }
    const db = resolved.client;
    const dbLabel = resolved.label;
    const tenKho = String(req.query.tenKho ?? req.query.ten_kho ?? '').trim();

    try {
      const { rows, error } = await loadKiemKhoDotSourceRows(db, { tenKho, limit: 5000 });
      if (error) {
        return res.status(500).json({
          error: error.message || 'Không đọc được danh sách đợt kiểm kho.',
          db: dbLabel
        });
      }

      const groups = computeKiemKhoDotGroups(rows);
      const records = groups
        .filter(g => !g.da_xac_nhan)
        .map(g => ({
          dot_kiem_kho: g.dot_kiem_kho,
          ten_kho: g.ten_kho,
          ngay_bat_dau: g.ngay_bat_dau,
          thu_tu_trong_ngay: g.thu_tu_trong_ngay,
          tong_dot_trong_ngay: g.tong_dot_trong_ngay
        }))
        .sort((a, b) => (a.ngay_bat_dau || '') < (b.ngay_bat_dau || '') ? 1 : -1);

      return res.json({ records, total: records.length, source: 'supabase', db: dbLabel });
    } catch (err: any) {
      return res.status(500).json({
        error: err?.message || 'Lỗi khi tải danh sách đợt kiểm kho.',
        db: dbLabel
      });
    }
  });

  /** Toàn bộ đợt kiểm kho (đã chốt lẫn chưa chốt) — dùng cho combobox tab "Danh sách đợt kiểm kho". */
  app.get('/api/kiem-kho/dot', async (req, res) => {
    const resolved = await resolveSupabaseClientForTable(SUPABASE_KIEM_KHO_TABLE);
    if (!resolved) {
      return res.status(503).json({
        error: `Bảng ${SUPABASE_KIEM_KHO_TABLE} chưa có trên Supabase mới lẫn cũ.`
      });
    }
    const db = resolved.client;
    const dbLabel = resolved.label;
    const tenKho = String(req.query.tenKho ?? req.query.ten_kho ?? '').trim();

    try {
      const { rows, error } = await loadKiemKhoDotSourceRows(db, { tenKho, limit: 20000 });
      if (error) {
        return res.status(500).json({
          error: error.message || 'Không đọc được danh sách đợt kiểm kho.',
          db: dbLabel
        });
      }

      const records = computeKiemKhoDotGroups(rows).sort((a, b) =>
        (a.ngay_bat_dau || '') < (b.ngay_bat_dau || '') ? 1 : -1
      );

      return res.json({ records, total: records.length, source: 'supabase', db: dbLabel });
    } catch (err: any) {
      return res.status(500).json({
        error: err?.message || 'Lỗi khi tải danh sách đợt kiểm kho.',
        db: dbLabel
      });
    }
  });

  /** Xác nhận kiểm kê cho 1 đợt: đánh dấu mọi dòng chi tiết + gộp tổng hợp theo mã NVL. */
  app.post('/api/kiem-kho/dot-xac-nhan', async (req, res) => {
    const resolved = await resolveSupabaseClientForTable(SUPABASE_KIEM_KHO_TABLE);
    if (!resolved) {
      return res.status(503).json({
        error: `Bảng ${SUPABASE_KIEM_KHO_TABLE} chưa có trên Supabase mới lẫn cũ.`
      });
    }
    const db = resolved.client;
    const dbLabel = resolved.label;

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const dotKiemKho = String(body.dot_kiem_kho ?? body.dotKiemKho ?? '').trim();
    const nguoiXacNhan = String(body.nguoi_xac_nhan ?? body.nguoiXacNhan ?? '').trim();
    if (!dotKiemKho) return res.status(400).json({ error: 'Thiếu đợt kiểm kho.' });

    try {
      // Chốt đợt trong 1 round-trip DB: set thoi_gian_xac_nhan + GROUP BY theo
      // mã NVL + upsert kiem_kho_tong_hop, tất cả chạy trong Postgres (xem
      // supabase-kiem-kho-tong-hop-rpc.sql) — không còn giới hạn số dòng đọc về Node.
      const { data, error } = await db.rpc('kiem_kho_chot_dot', {
        p_dot: dotKiemKho,
        p_nguoi: nguoiXacNhan || null
      });

      if (error) {
        const message = String(error.message || '');
        if (/DOT_NOT_FOUND/.test(message)) {
          return res.status(404).json({ error: 'Không tìm thấy đợt kiểm kho này.', db: dbLabel });
        }
        if (/ALREADY_CONFIRMED/.test(message)) {
          return res.status(409).json({ error: 'Đợt này đã được xác nhận kiểm kê.', db: dbLabel });
        }
        return res.status(500).json({
          error: message || 'Không xác nhận được đợt kiểm kho.',
          db: dbLabel
        });
      }

      const summaryRows = Array.isArray(data) ? data : [];
      const confirmedAt =
        summaryRows.find((row: any) => row?.chot_luc)?.chot_luc || new Date().toISOString();
      const soDong = summaryRows.reduce(
        (sum: number, row: any) => sum + (Number(row?.tong_so_luong) || 0),
        0
      );

      return res.json({
        success: true,
        dot_kiem_kho: dotKiemKho,
        thoi_gian_xac_nhan: confirmedAt,
        so_dong: soDong,
        so_ma_nvl: summaryRows.length,
        db: dbLabel
      });
    } catch (err: any) {
      return res.status(500).json({
        error: err?.message || 'Lỗi khi xác nhận kiểm kê.',
        db: dbLabel
      });
    }
  });

  /**
   * Tổng hợp "live" theo mã NVL của 1 đợt CHƯA chốt — gộp trực tiếp trong Postgres
   * (không lưu DB, không giới hạn số dòng ở Node). Dùng cho tab "Bảng tổng hợp"
   * khi đợt đang chọn chưa được xác nhận kiểm kê (nên chưa có trong kiem_kho_tong_hop).
   */
  app.get('/api/kiem-kho/dot-tong-hop-live', async (req, res) => {
    const resolved = await resolveSupabaseClientForTable(SUPABASE_KIEM_KHO_TABLE);
    if (!resolved) {
      return res.status(503).json({
        error: `Bảng ${SUPABASE_KIEM_KHO_TABLE} chưa có trên Supabase mới lẫn cũ.`
      });
    }
    const db = resolved.client;
    const dbLabel = resolved.label;

    const dotKiemKho = String(req.query.dotKiemKho ?? req.query.dot_kiem_kho ?? '').trim();
    if (!dotKiemKho) return res.status(400).json({ error: 'Thiếu đợt kiểm kho.' });

    try {
      const { data, error } = await db.rpc('kiem_kho_gop_theo_ma_nvl', { p_dot: dotKiemKho });
      if (error) {
        return res.status(500).json({
          error: error.message || 'Không tổng hợp được đợt kiểm kho.',
          db: dbLabel
        });
      }

      const records = (Array.isArray(data) ? data : []).map((row: any) => ({
        ...row,
        dot_kiem_kho: dotKiemKho,
        da_chot: false
      }));

      return res.json({ records, total: records.length, source: 'supabase', db: dbLabel });
    } catch (err: any) {
      return res.status(500).json({
        error: err?.message || 'Lỗi khi tổng hợp đợt kiểm kho.',
        db: dbLabel
      });
    }
  });

  app.post('/api/kiem-kho', async (req, res) => {
    const resolved = await resolveSupabaseClientForTable(SUPABASE_KIEM_KHO_TABLE);
    if (!resolved) {
      return res.status(503).json({
        error: `Bảng ${SUPABASE_KIEM_KHO_TABLE} chưa có trên Supabase mới lẫn cũ.`
      });
    }
    const db = resolved.client;
    const dbLabel = resolved.label;

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const tenKho = String(body.ten_kho ?? body.tenKho ?? '').trim();
    const dotKiemKho = String(body.dot_kiem_kho ?? body.dotKiemKho ?? '').trim();
    const nguoiKiemKho = String(body.nguoi_kiem_kho ?? body.nguoiKiemKho ?? '').trim();
    const ngayGio =
      String(body.ngay_gio_kiem_kho ?? body.ngayGioKiemKho ?? '').trim() || new Date().toISOString();

    const rawLines = Array.isArray(body.lines)
      ? body.lines
      : Array.isArray(body.records)
        ? body.records
        : body.ma_sp || body.maSp
          ? [body]
          : [];

    if (!tenKho) {
      return res.status(400).json({ error: 'Thiếu kho kiểm kho.' });
    }
    if (!dotKiemKho) {
      return res.status(400).json({ error: 'Thiếu đợt kiểm kho.' });
    }
    if (!nguoiKiemKho) {
      return res.status(400).json({ error: 'Thiếu người kiểm kho.' });
    }
    if (!rawLines.length) {
      return res.status(400).json({ error: 'Chưa có dòng sản phẩm để lưu.' });
    }

    const rows = rawLines
      .map((item: any) => {
        const maSp = String(item?.ma_sp ?? item?.maSp ?? '').trim();
        if (!maSp) return null;
        const maNvlRaw = String(item?.ma_nvl ?? item?.maNvl ?? '').trim();
        const maNvl =
          maNvlRaw ||
          (maSp.includes('_') ? maSp.slice(0, maSp.indexOf('_')).trim() : maSp);
        return {
          ten_kho: tenKho,
          dot_kiem_kho: dotKiemKho,
          ma_nvl: maNvl || null,
          ma_sp: maSp,
          ten_sp: String(item?.ten_sp ?? item?.tenSp ?? '').trim() || null,
          loai_sp: String(item?.loai_sp ?? item?.loaiSp ?? '').trim() || null,
          ngay_gio_kiem_kho: ngayGio,
          nguoi_kiem_kho: nguoiKiemKho
        };
      })
      .filter(Boolean);

    if (!rows.length) {
      return res.status(400).json({ error: 'Không có mã SP hợp lệ để lưu.' });
    }

    try {
      // Một mã QR chỉ được xuất hiện một lần trong cùng đợt kiểm kho.
      // Lọc cả mã trùng trong payload lẫn mã đã có trong danh sách chi tiết của đợt.
      const normalizeMaSp = (value: unknown) =>
        String(value ?? '')
          .trim()
          .toLocaleLowerCase('vi-VN')
          .replace(/\s+/g, ' ');
      const uniqueRows: any[] = [];
      const incomingKeys = new Set<string>();
      let skippedCount = 0;

      for (const row of rows as any[]) {
        const key = normalizeMaSp(row.ma_sp);
        if (!key || incomingKeys.has(key)) {
          skippedCount += 1;
          continue;
        }
        incomingKeys.add(key);
        uniqueRows.push(row);
      }

      const existingKeys = new Set<string>();
      const PAGE_SIZE = 1000;
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data: page, error: existingError } = await db
          .from(SUPABASE_KIEM_KHO_TABLE)
          .select('ma_sp')
          .eq('dot_kiem_kho', dotKiemKho)
          .order('id', { ascending: true })
          .range(from, from + PAGE_SIZE - 1);

        if (existingError) {
          return res.status(500).json({
            error: existingError.message || 'Không kiểm tra được mã SP đã có trong đợt kiểm kho.',
            db: dbLabel
          });
        }

        const records = Array.isArray(page) ? page : [];
        for (const record of records) {
          const key = normalizeMaSp(record?.ma_sp);
          if (key) existingKeys.add(key);
        }
        if (records.length < PAGE_SIZE) break;
      }

      const rowsToInsert = uniqueRows.filter(row => {
        if (existingKeys.has(normalizeMaSp(row.ma_sp))) {
          skippedCount += 1;
          return false;
        }
        return true;
      });

      if (rowsToInsert.length === 0) {
        return res.status(200).json({
          records: [],
          total: 0,
          saved_count: 0,
          skipped_count: skippedCount,
          source: 'supabase',
          db: dbLabel,
          table: SUPABASE_KIEM_KHO_TABLE
        });
      }

      const { data, error } = await db
        .from(SUPABASE_KIEM_KHO_TABLE)
        .insert(rowsToInsert)
        .select('*');
      if (error) {
        const missingColumn =
          error.code === 'PGRST204' || /dot_kiem_kho/i.test(error.message || '');
        return res.status(500).json({
          error: missingColumn
            ? `Bảng ${SUPABASE_KIEM_KHO_TABLE} thiếu cột dot_kiem_kho. Hãy chạy lại file supabase-kiem-kho.sql.`
            : error.message || 'Không lưu được kiểm kho.',
          db: dbLabel
        });
      }

      const records = Array.isArray(data) ? data : [];
      return res.status(201).json({
        records,
        total: records.length,
        saved_count: records.length,
        skipped_count: skippedCount,
        source: 'supabase',
        db: dbLabel,
        table: SUPABASE_KIEM_KHO_TABLE
      });
    } catch (err: any) {
      return res.status(500).json({
        error: err?.message || 'Lỗi khi lưu kiểm kho.',
        db: dbLabel
      });
    }
  });

  app.delete('/api/kiem-kho/:id', async (req, res) => {
    const resolved = await resolveSupabaseClientForTable(SUPABASE_KIEM_KHO_TABLE);
    if (!resolved) {
      return res.status(503).json({
        error: `Bảng ${SUPABASE_KIEM_KHO_TABLE} chưa có trên Supabase mới lẫn cũ.`
      });
    }

    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ error: 'Thiếu ID kiểm kho.' });

    try {
      const { data, error } = await resolved.client
        .from(SUPABASE_KIEM_KHO_TABLE)
        .delete()
        .eq('id', id)
        .is('thoi_gian_xac_nhan', null)
        .select('id')
        .maybeSingle();
      if (error && isMissingKiemKhoConfirmColumnError(error)) {
        const fallback = await resolved.client
          .from(SUPABASE_KIEM_KHO_TABLE)
          .delete()
          .eq('id', id)
          .select('id')
          .maybeSingle();
        if (fallback.error) {
          return res.status(500).json({
            error: fallback.error.message || 'Không xóa được dòng kiểm kho.',
            db: resolved.label
          });
        }
        if (!fallback.data) {
          return res.status(404).json({ error: 'Không tìm thấy dòng kiểm kho.', db: resolved.label });
        }
        return res.json({ success: true, db: resolved.label, confirmColumn: false });
      }
      if (error) {
        return res.status(500).json({
          error: error.message || 'Không xóa được dòng kiểm kho.',
          db: resolved.label
        });
      }
      if (!data) {
        return res.status(409).json({
          error: 'Chỉ được xóa sản phẩm thuộc đợt kiểm kho chưa chốt.',
          db: resolved.label
        });
      }
      return res.json({ success: true, db: resolved.label });
    } catch (err: any) {
      return res.status(500).json({
        error: err?.message || 'Lỗi khi xóa kiểm kho.',
        db: resolved.label
      });
    }
  });

  app.get('/api/kiem-kho-tong-hop', async (req, res) => {
    const resolved = await resolveSupabaseClientForTable(SUPABASE_KIEM_KHO_TONG_HOP_TABLE);
    if (!resolved) {
      return res.status(503).json({
        error: `Bảng ${SUPABASE_KIEM_KHO_TONG_HOP_TABLE} chưa có trên Supabase mới lẫn cũ.`
      });
    }
    const db = resolved.client;
    const dbLabel = resolved.label;

    const limitRaw = Number(req.query.limit ?? 200);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.trunc(limitRaw), 1), 1000) : 200;
    const dotKiemKho = String(req.query.dotKiemKho ?? req.query.dot_kiem_kho ?? '').trim();

    try {
      let query = db
        .from(SUPABASE_KIEM_KHO_TONG_HOP_TABLE)
        .select('*')
        .order('created_at', { ascending: false, nullsFirst: false })
        .order('id', { ascending: false })
        .limit(limit);

      if (dotKiemKho) query = query.eq('dot_kiem_kho', dotKiemKho);

      const { data, error } = await query;
      if (error) {
        return res.status(500).json({
          error: error.message || 'Không đọc được bảng kiem_kho_tong_hop.',
          db: dbLabel
        });
      }

      const records = Array.isArray(data) ? data : [];
      return res.json({
        records,
        total: records.length,
        source: 'supabase',
        db: dbLabel,
        table: SUPABASE_KIEM_KHO_TONG_HOP_TABLE
      });
    } catch (err: any) {
      return res.status(500).json({
        error: err?.message || 'Lỗi khi tải tổng hợp kiểm kho.',
        db: dbLabel
      });
    }
  });

  app.post('/api/kiem-kho-tong-hop', async (req, res) => {
    const resolved = await resolveSupabaseClientForTable(SUPABASE_KIEM_KHO_TONG_HOP_TABLE);
    if (!resolved) {
      return res.status(503).json({
        error: `Bảng ${SUPABASE_KIEM_KHO_TONG_HOP_TABLE} chưa có trên Supabase mới lẫn cũ.`
      });
    }
    const db = resolved.client;
    const dbLabel = resolved.label;

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const dotKiemKho = String(body.dot_kiem_kho ?? body.dotKiemKho ?? '').trim();
    const nguoiChot = String(body.nguoi_chot ?? body.nguoiChot ?? '').trim();
    const chotLuc = String(body.chot_luc ?? body.chotLuc ?? '').trim() || new Date().toISOString();

    const rawLines = Array.isArray(body.lines) ? body.lines : Array.isArray(body.records) ? body.records : [];

    if (!dotKiemKho) return res.status(400).json({ error: 'Thiếu đợt kiểm kho.' });
    if (!rawLines.length) return res.status(400).json({ error: 'Chưa có dòng tổng hợp để lưu.' });

    const rows = rawLines
      .map((item: any) => {
        const maNvl = String(item?.ma_nvl ?? item?.maNvl ?? '').trim();
        if (!maNvl) return null;
        const tongSoLuong = Number(item?.tong_so_luong ?? item?.tongSoLuong ?? 0);
        return {
          dot_kiem_kho: dotKiemKho,
          ma_nvl: maNvl,
          ten_sp: String(item?.ten_sp ?? item?.tenSp ?? '').trim() || null,
          loai_sp: String(item?.loai_sp ?? item?.loaiSp ?? '').trim() || null,
          tong_so_luong: Number.isFinite(tongSoLuong) ? tongSoLuong : 0,
          chot_luc: chotLuc,
          nguoi_chot: nguoiChot || null
        };
      })
      .filter(Boolean);

    if (!rows.length) return res.status(400).json({ error: 'Không có dòng tổng hợp hợp lệ để lưu.' });

    try {
      const { data, error } = await db
        .from(SUPABASE_KIEM_KHO_TONG_HOP_TABLE)
        .upsert(rows, { onConflict: 'dot_kiem_kho,ma_nvl' })
        .select('*');
      if (error) {
        return res.status(500).json({
          error: error.message || 'Không lưu được tổng hợp kiểm kho.',
          db: dbLabel
        });
      }

      const records = Array.isArray(data) ? data : [];
      return res.status(201).json({
        records,
        total: records.length,
        source: 'supabase',
        db: dbLabel,
        table: SUPABASE_KIEM_KHO_TONG_HOP_TABLE
      });
    } catch (err: any) {
      return res.status(500).json({
        error: err?.message || 'Lỗi khi lưu tổng hợp kiểm kho.',
        db: dbLabel
      });
    }
  });

  app.delete('/api/kiem-kho-tong-hop/:id', async (req, res) => {
    const resolved = await resolveSupabaseClientForTable(SUPABASE_KIEM_KHO_TONG_HOP_TABLE);
    if (!resolved) {
      return res.status(503).json({
        error: `Bảng ${SUPABASE_KIEM_KHO_TONG_HOP_TABLE} chưa có trên Supabase mới lẫn cũ.`
      });
    }

    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ error: 'Thiếu ID tổng hợp kiểm kho.' });

    try {
      const { error } = await resolved.client.from(SUPABASE_KIEM_KHO_TONG_HOP_TABLE).delete().eq('id', id);
      if (error) {
        return res.status(500).json({
          error: error.message || 'Không xóa được dòng tổng hợp kiểm kho.',
          db: resolved.label
        });
      }
      return res.json({ success: true, db: resolved.label });
    } catch (err: any) {
      return res.status(500).json({
        error: err?.message || 'Lỗi khi xóa tổng hợp kiểm kho.',
        db: resolved.label
      });
    }
  });

  // Đối chiếu số lượng kiểm kê (kiem_kho_tong_hop, DB kiem-kho) với tồn cuối kỳ
  // sổ sách (RPC ton_kho_nvl_gop/ton_kho_san_pham_gop, DB chính) cho 1 đợt kiểm
  // kho. Hai nguồn nằm trên 2 Supabase project khác nhau nên phải gộp ở Node,
  // không thể JOIN SQL thẳng — xem docs/ai-tables/kiem_kho_chenh_lech.md.
  app.get('/api/kiem-kho/chenh-lech', async (req, res) => {
    try {
      const dotKiemKho = String(req.query.dotKiemKho ?? req.query.dot_kiem_kho ?? '').trim();
      if (!dotKiemKho) {
        return res.status(400).json({ error: 'Thiếu đợt kiểm kho.' });
      }
      const tenKho = String(req.query.tenKho ?? req.query.ten_kho ?? '').trim() || null;

      const kiemKhoResolved = await resolveSupabaseClientForTable(SUPABASE_KIEM_KHO_TABLE);
      if (!kiemKhoResolved) {
        return res.status(503).json({
          error: `Bảng ${SUPABASE_KIEM_KHO_TABLE} chưa có trên Supabase mới lẫn cũ.`
        });
      }
      if (!supabase) {
        return res.status(503).json({ error: 'Supabase (DB chính) chưa được cấu hình.' });
      }

      let dotRows: Array<Record<string, unknown>> = [];
      {
        const first = await kiemKhoResolved.client
          .from(SUPABASE_KIEM_KHO_TABLE)
          .select('dot_kiem_kho, ngay_gio_kiem_kho, thoi_gian_xac_nhan, ma_nvl, ma_sp, ten_sp, loai_sp, ten_kho')
          .eq('dot_kiem_kho', dotKiemKho);
        if (first.error && isMissingKiemKhoConfirmColumnError(first.error)) {
          const second = await kiemKhoResolved.client
            .from(SUPABASE_KIEM_KHO_TABLE)
            .select('dot_kiem_kho, ngay_gio_kiem_kho, ma_nvl, ma_sp, ten_sp, loai_sp, ten_kho')
            .eq('dot_kiem_kho', dotKiemKho);
          if (second.error) {
            return res.status(500).json({
              error: second.error.message || 'Không tải được thông tin đợt kiểm kho.',
              db: kiemKhoResolved.label
            });
          }
          dotRows = (second.data || []) as Array<Record<string, unknown>>;
        } else if (first.error) {
          return res.status(500).json({
            error: first.error.message || 'Không tải được thông tin đợt kiểm kho.',
            db: kiemKhoResolved.label
          });
        } else {
          dotRows = (first.data || []) as Array<Record<string, unknown>>;
        }
      }
      const dotGroup = computeKiemKhoDotGroups(dotRows)[0];
      if (!dotGroup) {
        return res.status(404).json({ error: 'Không tìm thấy đợt kiểm kho.' });
      }

      let tongHopRows: Array<{ ma_nvl: string; ten_sp: string | null; loai_sp: string | null; tong_so_luong: number }> = [];
      if (dotGroup.da_xac_nhan) {
        const { data, error } = await kiemKhoResolved.client
          .from(SUPABASE_KIEM_KHO_TONG_HOP_TABLE)
          .select('ma_nvl, ten_sp, loai_sp, tong_so_luong')
          .eq('dot_kiem_kho', dotKiemKho);
        if (error) {
          return res.status(500).json({
            error: error.message || 'Không tải được bảng tổng hợp kiểm kho.',
            db: kiemKhoResolved.label
          });
        }
        tongHopRows = data || [];
      } else {
        const { data, error } = await kiemKhoResolved.client.rpc('kiem_kho_gop_theo_ma_nvl', {
          p_dot: dotKiemKho
        });
        if (error) {
          return res.status(500).json({
            error: error.message || 'Không gộp được số lượng kiểm kê (đợt chưa chốt).',
            db: kiemKhoResolved.label
          });
        }
        tongHopRows = data || [];
      }

      // Tồn hệ thống được xem tại thời điểm chốt đợt (hoặc hôm nay nếu chưa chốt).
      const denNgay =
        dotGroup.da_xac_nhan && dotGroup.thoi_gian_xac_nhan
          ? String(dotGroup.thoi_gian_xac_nhan).slice(0, 10)
          : new Date().toISOString().slice(0, 10);
      const tuNgay = dotGroup.ngay_bat_dau ? String(dotGroup.ngay_bat_dau).slice(0, 10) : null;

      // Trang xử lý chênh lệch này chỉ áp dụng cho thành phẩm.
      const spResult = await loadTonKhoGop('san_pham', tenKho, tuNgay, denNgay);
      if (spResult.error) {
        return res.status(500).json({ error: spResult.error.message || 'Không tải được tồn kho thành phẩm.' });
      }
      const spRowsRaw = Array.isArray(spResult.data) ? (spResult.data as TonKhoGopRow[]) : [];
      const spRows = groupTonKhoRowsByPrefix(spRowsRaw);
      const spMap = new Map(spRows.map(row => [row.ma, row]));

      // Chi tiết chưa gộp theo tiền tố (từng lô/hậu tố riêng) — dùng để giải thích một
      // con số chênh lệch đã gộp (VD "97") gồm những lô/kho cụ thể nào bên hệ thống.
      const heThongChiTiet = spRowsRaw.map(row => ({
        ma: row.ma,
        ma_goc: extractTonKhoPrefix(row.ma) || row.ma,
        ten: row.ten,
        loai_kho: 'san_pham' as const,
        don_vi: row.don_vi,
        ten_kho: row.ten_kho,
        ton_cuoi_ky: row.ton_cuoi_ky
      }));

      const xuLyMap = new Map<string, { ma_phieu_dieu_chinh: string; loai_phieu: string | null }>();
      const xuLyResolved = await resolveSupabaseClientForTable(SUPABASE_KIEM_KHO_CHENH_LECH_TABLE);
      if (xuLyResolved) {
        const { data: xuLyRows, error: xuLyError } = await xuLyResolved.client
          .from(SUPABASE_KIEM_KHO_CHENH_LECH_TABLE)
          .select('ma_sp, ma_phieu_dieu_chinh, loai_phieu, xu_ly_luc')
          .eq('dot_kiem_kho', dotKiemKho)
          .order('xu_ly_luc', { ascending: true });
        if (!xuLyError) {
          for (const row of xuLyRows || []) {
            const ma = String((row as any).ma_sp ?? '').trim();
            if (!ma) continue;
            xuLyMap.set(ma, {
              ma_phieu_dieu_chinh: String((row as any).ma_phieu_dieu_chinh ?? ''),
              loai_phieu: (row as any).loai_phieu ?? null
            });
          }
        }
      }

      // Bảng tổng hợp là hợp của mã thành phẩm đã kiểm kê và mọi thành phẩm hệ
      // thống còn tồn dương.
      // Các dòng hệ thống đã được groupTonKhoRowsByPrefix() nên những mã khác hậu tố
      // nhưng cùng tiền tố được cộng về đúng một mã gốc trước khi tính chênh lệch.
      const kiemKeByMa = new Map<string, any>();
      for (const row of tongHopRows || []) {
        const maDayDu = String((row as any).ma_nvl ?? '').trim();
        const ma = extractTonKhoPrefix(maDayDu) || maDayDu;
        if (!ma) continue;
        const existing = kiemKeByMa.get(ma);
        if (existing) {
          existing.tong_so_luong += Number((row as any).tong_so_luong) || 0;
        } else {
          kiemKeByMa.set(ma, {
            ...row,
            ma_nvl: ma,
            tong_so_luong: Number((row as any).tong_so_luong) || 0
          });
        }
      }

      // Tính chênh lệch theo từng mã sản phẩm nguyên bản. Bảng tổng hợp phía dưới
      // vẫn gom theo tiền tố, nhưng trạng thái xử lý của một nhóm chỉ hoàn tất khi
      // mọi mã nguyên bản đang lệch trong nhóm đều đã có lịch sử tạo phiếu.
      const kiemKeTheoMaDayDu = new Map<string, number>();
      for (const row of dotRows || []) {
        const maDayDu = String((row as any).ma_sp ?? '').trim();
        if (!maDayDu) continue;
        kiemKeTheoMaDayDu.set(maDayDu, (kiemKeTheoMaDayDu.get(maDayDu) || 0) + 1);
      }
      const tonTheoMaDayDu = new Map<string, number>();
      for (const row of spRowsRaw) {
        const maDayDu = String(row.ma ?? '').trim();
        if (!maDayDu) continue;
        tonTheoMaDayDu.set(maDayDu, (tonTheoMaDayDu.get(maDayDu) || 0) + Number(row.ton_cuoi_ky || 0));
      }
      const maLechTheoMaGoc = new Map<string, string[]>();
      const maDayDuDoiChieu = new Set<string>([...kiemKeTheoMaDayDu.keys(), ...tonTheoMaDayDu.keys()]);
      for (const maDayDu of maDayDuDoiChieu) {
        const chenhLechChiTiet = (kiemKeTheoMaDayDu.get(maDayDu) || 0) - Math.max(0, tonTheoMaDayDu.get(maDayDu) || 0);
        if (chenhLechChiTiet === 0) continue;
        const maGoc = extractTonKhoPrefix(maDayDu) || maDayDu;
        const codes = maLechTheoMaGoc.get(maGoc) || [];
        codes.push(maDayDu);
        maLechTheoMaGoc.set(maGoc, codes);
      }
      const comparisonCodes = new Set<string>(kiemKeByMa.keys());
      for (const row of spRows) {
        if (row.ton_cuoi_ky > 0) comparisonCodes.add(row.ma);
      }

      const records = Array.from(comparisonCodes)
        .map(ma => {
          const kiemKeRow = kiemKeByMa.get(ma) || null;
          const tonThucTe = Number(kiemKeRow?.tong_so_luong) || 0;
          const spCandidate = spMap.get(ma);
          const spMatch = spCandidate && spCandidate.ton_cuoi_ky > 0 ? spCandidate : undefined;
          const matched = spMatch || spCandidate;
          const loaiKho: 'san_pham' | null = spCandidate ? 'san_pham' : null;
          // Không khớp được danh mục (mã kiểm kê lệch tiền tố so với kho_nvl/san_pham) —
          // KHÔNG được coi tồn hệ thống = 0 (sẽ ra chênh lệch giả). Đánh dấu riêng
          // 'khong_xac_dinh' để người dùng biết cần đối chiếu lại mã, không tính vào thừa/thiếu.
          const tonHeThong = matched ? matched.ton_cuoi_ky : null;
          const chenhLech = matched ? tonThucTe - (tonHeThong as number) : null;
          const trangThai: 'khop' | 'thua' | 'thieu' | 'khong_xac_dinh' = !matched
            ? 'khong_xac_dinh'
            : chenhLech === 0
              ? 'khop'
              : (chenhLech as number) > 0
                ? 'thua'
                : 'thieu';
          const maChiTietCanXuLy = maLechTheoMaGoc.get(ma) || [];
          // Tương thích lịch sử cũ từng lưu mã gộp: nếu có dòng mã gộp thì coi cả
          // nhóm đã xử lý. Dữ liệu mới lưu từng mã nguyên bản.
          const xuLyCuTheoMaGop = xuLyMap.get(ma) || null;
          const soMaChiTietDaXuLy = maChiTietCanXuLy.filter(code => xuLyMap.has(code)).length;
          const daXuLyHet = Boolean(xuLyCuTheoMaGop) || (
            maChiTietCanXuLy.length > 0 && soMaChiTietDaXuLy === maChiTietCanXuLy.length
          );
          const dangXuLy = !daXuLyHet && soMaChiTietDaXuLy > 0;
          const xuLyGanNhat = xuLyCuTheoMaGop || [...maChiTietCanXuLy]
            .reverse()
            .map(code => xuLyMap.get(code))
            .find(Boolean) || null;
          return {
            ma_nvl: ma,
            ten_sp: kiemKeRow?.ten_sp || matched?.ten || ma,
            loai_sp: kiemKeRow?.loai_sp || null,
            loai_kho: loaiKho,
            don_vi: matched?.don_vi || null,
            ten_kho: matched?.ten_kho || null,
            ton_thuc_te: tonThucTe,
            ton_he_thong: tonHeThong,
            chenh_lech: chenhLech,
            trang_thai: trangThai,
            da_xu_ly: daXuLyHet,
            trang_thai_xu_ly: chenhLech === 0
              ? 'khong_can_xu_ly'
              : daXuLyHet
                ? 'da_xu_ly'
                : dangXuLy
                  ? 'dang_xu_ly'
                  : 'chua_xu_ly',
            ma_phieu_dieu_chinh: xuLyGanNhat?.ma_phieu_dieu_chinh || null
          };
        })
        .sort((left, right) => left.ma_nvl.localeCompare(right.ma_nvl, 'vi'));

      return res.json({
        records,
        total: records.length,
        dot_kiem_kho: dotKiemKho,
        da_chot: dotGroup.da_xac_nhan,
        ngay_bat_dau: dotGroup.ngay_bat_dau,
        chot_luc: dotGroup.thoi_gian_xac_nhan,
        he_thong_chi_tiet: heThongChiTiet,
        xu_ly_chi_tiet: Array.from(xuLyMap.entries()).map(([ma_sp, value]) => ({
          ma_sp,
          ma_phieu_dieu_chinh: value.ma_phieu_dieu_chinh,
          loai_phieu: value.loai_phieu
        }))
      });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || 'Lỗi khi đối chiếu chênh lệch kiểm kho.' });
    }
  });

  app.post('/api/kiem-kho/chenh-lech-xu-ly', async (req, res) => {
    const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
    const dotKiemKho = String(body.dot_kiem_kho ?? body.dotKiemKho ?? '').trim();
    const maSp = String(body.ma_sp ?? body.maSp ?? '').trim();
    const maPhieuDieuChinh = String(body.ma_phieu_dieu_chinh ?? body.maPhieuDieuChinh ?? '').trim();

    if (!dotKiemKho) return res.status(400).json({ error: 'Thiếu đợt kiểm kho.' });
    if (!maSp) return res.status(400).json({ error: 'Thiếu mã sản phẩm.' });
    if (!maPhieuDieuChinh) return res.status(400).json({ error: 'Thiếu mã phiếu điều chỉnh.' });

    const kiemKhoResolved = await resolveSupabaseClientForTable(SUPABASE_KIEM_KHO_TABLE);
    if (!kiemKhoResolved) {
      return res.status(503).json({ error: `Bảng ${SUPABASE_KIEM_KHO_TABLE} chưa được cấu hình.` });
    }
    const { data: confirmationRows, error: confirmationError } = await kiemKhoResolved.client
      .from(SUPABASE_KIEM_KHO_TABLE)
      .select('thoi_gian_xac_nhan')
      .eq('dot_kiem_kho', dotKiemKho);
    if (confirmationError && isMissingKiemKhoConfirmColumnError(confirmationError)) {
      const exists = await kiemKhoResolved.client
        .from(SUPABASE_KIEM_KHO_TABLE)
        .select('id')
        .eq('dot_kiem_kho', dotKiemKho)
        .limit(1);
      if (exists.error) {
        return res.status(500).json({
          error: exists.error.message || 'Không kiểm tra được đợt kiểm kho.',
          db: kiemKhoResolved.label
        });
      }
      if (!exists.data?.length) {
        return res.status(404).json({ error: 'Không tìm thấy đợt kiểm kho.' });
      }
      // DB chưa có cột chốt — cho phép xử lý chênh lệch (không chặn).
    } else if (confirmationError) {
      return res.status(500).json({
        error: confirmationError.message || 'Không kiểm tra được trạng thái xác nhận đợt kiểm kho.',
        db: kiemKhoResolved.label
      });
    } else {
      if (!confirmationRows?.length) {
        return res.status(404).json({ error: 'Không tìm thấy đợt kiểm kho.' });
      }
      if (confirmationRows.some(row => !row.thoi_gian_xac_nhan)) {
        return res.status(409).json({ error: 'Đợt kiểm kho chưa xác nhận, chưa thể xử lý chênh lệch.' });
      }
    }

    const resolved = await resolveSupabaseClientForTable(SUPABASE_KIEM_KHO_CHENH_LECH_TABLE);
    if (!resolved) {
      return res.status(503).json({
        error: `Bảng ${SUPABASE_KIEM_KHO_CHENH_LECH_TABLE} chưa có trên Supabase. Hãy chạy supabase-kiem-kho-chenh-lech-xu-ly.sql.`
      });
    }

    const soLuongRaw = Number(body.so_luong_dieu_chinh ?? body.soLuongDieuChinh);
    const record = {
      dot_kiem_kho: dotKiemKho,
      ma_sp: maSp,
      loai_phieu: String(body.loai_phieu ?? body.loaiPhieu ?? '').trim() || null,
      so_luong_dieu_chinh: Number.isFinite(soLuongRaw) ? soLuongRaw : null,
      ma_phieu_dieu_chinh: maPhieuDieuChinh,
      ghi_chu: String(body.ghi_chu ?? body.ghiChu ?? '').trim() || null,
      nguoi_xu_ly: String(body.nguoi_xu_ly ?? body.nguoiXuLy ?? '').trim() || null
    };

    try {
      const { data, error } = await resolved.client
        .from(SUPABASE_KIEM_KHO_CHENH_LECH_TABLE)
        .insert(record)
        .select('*')
        .single();
      if (error) {
        return res.status(500).json({
          error: error.message || 'Không lưu được trạng thái xử lý chênh lệch.',
          db: resolved.label
        });
      }
      return res.status(201).json({ success: true, record: data, db: resolved.label });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || 'Lỗi khi lưu trạng thái xử lý chênh lệch.' });
    }
  });

  app.get('/api/quan-ly-kho', async (_req, res) => {
    const resolved = await resolveSupabaseClientForTable(SUPABASE_QUAN_LY_KHO_TABLE);
    if (!resolved) {
      return res.status(503).json({
        error: `Bảng ${SUPABASE_QUAN_LY_KHO_TABLE} chưa có trên Supabase mới lẫn cũ.`
      });
    }

    try {
      const { data, error } = await resolved.client
        .from(SUPABASE_QUAN_LY_KHO_TABLE)
        .select('*')
        .order('created_at', { ascending: false, nullsFirst: false })
        .order('id', { ascending: false });

      if (error) {
        return res.status(500).json({
          error: error.message || 'Không đọc được bảng quan_ly_kho.',
          db: resolved.label
        });
      }

      const records = Array.isArray(data) ? data : [];
      return res.json({
        records,
        total: records.length,
        source: 'supabase',
        db: resolved.label,
        table: SUPABASE_QUAN_LY_KHO_TABLE
      });
    } catch (err: any) {
      return res.status(500).json({
        error: err?.message || 'Lỗi khi tải quản lý kho.',
        db: resolved.label
      });
    }
  });

  app.post('/api/quan-ly-kho', async (req, res) => {
    if (!supabase) {
      return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const tenKho = String(body.ten_kho ?? body.tenKho ?? '').trim();
    if (!tenKho) {
      return res.status(400).json({ error: 'Thiếu tên kho.' });
    }

    const row = {
      ten_kho: tenKho,
      vi_tri: String(body.vi_tri ?? body.viTri ?? '').trim() || null,
      ten_vi_tri: String(body.ten_vi_tri ?? body.tenViTri ?? '').trim() || null,
      nguoi_phu_trach: String(body.nguoi_phu_trach ?? body.nguoiPhuTrach ?? '').trim() || null
    };

    try {
      const { data, error } = await supabase.from(SUPABASE_QUAN_LY_KHO_TABLE).insert(row).select('*').single();
      if (error) {
        return res.status(500).json({
          error: error.message || 'Không thêm được kho.',
          db: SUPABASE_MAIN_DB_LABEL
        });
      }
      return res.status(201).json({
        record: data,
        source: 'supabase',
        db: SUPABASE_MAIN_DB_LABEL,
        table: SUPABASE_QUAN_LY_KHO_TABLE
      });
    } catch (err: any) {
      return res.status(500).json({
        error: err?.message || 'Lỗi khi thêm kho.',
        db: SUPABASE_MAIN_DB_LABEL
      });
    }
  });

  app.put('/api/quan-ly-kho/:id', async (req, res) => {
    if (!supabase) {
      return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });
    }

    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ error: 'Thiếu ID kho.' });

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const tenKho = String(body.ten_kho ?? body.tenKho ?? '').trim();
    if (!tenKho) {
      return res.status(400).json({ error: 'Thiếu tên kho.' });
    }

    const row = {
      ten_kho: tenKho,
      vi_tri: String(body.vi_tri ?? body.viTri ?? '').trim() || null,
      ten_vi_tri: String(body.ten_vi_tri ?? body.tenViTri ?? '').trim() || null,
      nguoi_phu_trach: String(body.nguoi_phu_trach ?? body.nguoiPhuTrach ?? '').trim() || null
    };

    try {
      const { data, error } = await supabase
        .from(SUPABASE_QUAN_LY_KHO_TABLE)
        .update(row)
        .eq('id', id)
        .select('*')
        .single();
      if (error) {
        return res.status(500).json({
          error: error.message || 'Không cập nhật được kho.',
          db: SUPABASE_MAIN_DB_LABEL
        });
      }
      return res.json({
        record: data,
        source: 'supabase',
        db: SUPABASE_MAIN_DB_LABEL,
        table: SUPABASE_QUAN_LY_KHO_TABLE
      });
    } catch (err: any) {
      return res.status(500).json({
        error: err?.message || 'Lỗi khi cập nhật kho.',
        db: SUPABASE_MAIN_DB_LABEL
      });
    }
  });

  app.delete('/api/quan-ly-kho/:id', async (req, res) => {
    if (!supabase) {
      return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });
    }

    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ error: 'Thiếu ID kho.' });

    try {
      const { error } = await supabase.from(SUPABASE_QUAN_LY_KHO_TABLE).delete().eq('id', id);
      if (error) {
        return res.status(500).json({
          error: error.message || 'Không xóa được kho.',
          db: SUPABASE_MAIN_DB_LABEL
        });
      }
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({
        error: err?.message || 'Lỗi khi xóa kho.',
        db: SUPABASE_MAIN_DB_LABEL
      });
    }
  });

  type TonKhoGopRow = {
    ma: string;
    ma_goc?: string;
    ten: string;
    loai_sp?: string | null;
    don_vi: string | null;
    ten_kho: string | null;
    ton_dau_ky: number;
    nhap_trong_ky: number;
    xuat_trong_ky: number;
    ton_cuoi_ky: number;
  };

  type TonKhoLoaiKho = 'nvl' | 'san_pham' | 'tai_che' | 'hang_hong' | 'hang_hoa' | 'cong_cu_dung_cu' | 'gia_cong';

  async function loadAllTonKhoRows(
    buildQuery: (from: number, to: number) => PromiseLike<{ data: Record<string, unknown>[] | null; error: any }>
  ) {
    const pageSize = 1000;
    const rows: Record<string, unknown>[] = [];

    for (let from = 0; ; from += pageSize) {
      const { data, error } = await buildQuery(from, from + pageSize - 1);
      if (error) throw new Error(error.message || 'Không thể đọc dữ liệu tồn kho từ Supabase.');
      const page = Array.isArray(data) ? data : [];
      rows.push(...page);
      if (page.length < pageSize) return rows;
    }
  }

  async function loadTonKhoGopFallback(
    loaiKho: TonKhoLoaiKho,
    tenKho: string | null,
    tuNgay: string | null,
    denNgay: string | null
  ): Promise<TonKhoGopRow[]> {
    const isProduct = loaiKho === 'san_pham';
    const catalogTable = isProduct ? SUPABASE_PRODUCTS_TABLE : SUPABASE_MATERIALS_TABLE;
    const catalogSelect = isProduct
      ? 'ma_sp, ten_sp, don_vi, ten_kho, ton_dau_ky'
      : 'ma_npl, ten_npl, don_vi, ten_kho, ton_dau_ky';

    const [catalogRows, movementRows] = await Promise.all([
      loadAllTonKhoRows((from, to) => {
        let query = supabase!.from(catalogTable).select(catalogSelect);
        if (tenKho) query = query.eq('ten_kho', tenKho);
        return query.range(from, to);
      }),
      loadAllTonKhoRows((from, to) => {
        let query = supabase!
          .from(SUPABASE_WAREHOUSE_MOVEMENTS_TABLE)
          .select('ma_npl, ten_npl, ma_sp, ten_sp, don_vi, so_luong, ngay_phieu, loai_phieu, loai_kho, ten_kho');
        query = isProduct
          ? query.eq('loai_kho', 'san_pham')
          : loaiKho === 'nvl'
            ? query.or('loai_kho.eq.nvl,loai_kho.is.null')
            : query.eq('loai_kho', loaiKho);
        query = query.eq('treo', false);
        if (tenKho) query = query.eq('ten_kho', tenKho);
        if (denNgay) query = query.lte('ngay_phieu', denNgay);
        return query.range(from, to);
      })
    ]);

    const totals = new Map<string, TonKhoGopRow>();
    for (const row of catalogRows) {
      const code = String(isProduct ? row.ma_sp ?? '' : row.ma_npl ?? '').trim();
      if (!code) continue;
      const name = String(isProduct ? row.ten_sp ?? '' : row.ten_npl ?? '').trim();
      const baseline = Number(row.ton_dau_ky);
      totals.set(code, {
        ma: code,
        ten: name || code,
        don_vi: String(row.don_vi ?? '').trim() || null,
        ten_kho: String(row.ten_kho ?? '').trim() || tenKho,
        ton_dau_ky: Number.isFinite(baseline) ? baseline : 0,
        nhap_trong_ky: 0,
        xuat_trong_ky: 0,
        ton_cuoi_ky: 0
      });
    }

    for (const row of movementRows) {
      const code = String(isProduct ? row.ma_sp ?? '' : row.ma_npl ?? '').trim();
      if (!code) continue;

      // Mã lô/hậu tố (VD "L30cm_3701190208G") thường không có sẵn trong danh mục — mượn tên/đơn vị
      // từ mã gốc (tiền tố) nếu danh mục đã có, để chi tiết không hiển thị tên trống/mã thô.
      const prefix = extractTonKhoPrefix(code);
      const prefixMatch = prefix && prefix !== code ? totals.get(prefix) : undefined;
      const movementName = String(isProduct ? row.ten_sp ?? '' : row.ten_npl ?? '').trim();
      const movementUnit = String(row.don_vi ?? '').trim() || null;
      const current = totals.get(code) ?? {
        ma: code,
        ten: movementName || prefixMatch?.ten || code,
        don_vi: movementUnit || prefixMatch?.don_vi || null,
        ten_kho: prefixMatch?.ten_kho ?? tenKho,
        ton_dau_ky: 0,
        nhap_trong_ky: 0,
        xuat_trong_ky: 0,
        ton_cuoi_ky: 0
      };
      totals.set(code, current);
      if ((!current.ten || current.ten === code) && movementName) current.ten = movementName;
      if (!current.don_vi && movementUnit) current.don_vi = movementUnit;

      const quantityValue = Number(row.so_luong);
      const quantity = Number.isFinite(quantityValue) ? quantityValue : 0;
      const slipType = String(row.loai_phieu ?? '').trim();
      const slipDate = String(row.ngay_phieu ?? '').slice(0, 10);

      if (tuNgay && slipDate && slipDate < tuNgay) {
        if (slipType === 'nhap') current.ton_dau_ky += quantity;
        if (slipType === 'xuat') current.ton_dau_ky -= quantity;
        continue;
      }

      const isInPeriod = (!tuNgay || (slipDate && slipDate >= tuNgay))
        && (!denNgay || (slipDate && slipDate <= denNgay));
      if (!isInPeriod) continue;
      if (slipType === 'nhap') current.nhap_trong_ky += quantity;
      if (slipType === 'xuat') current.xuat_trong_ky += quantity;
    }

    return Array.from(totals.values())
      .map(row => ({
        ...row,
        ton_cuoi_ky: row.ton_dau_ky + row.nhap_trong_ky - row.xuat_trong_ky
      }))
      .sort((left, right) => left.ma.localeCompare(right.ma, 'vi'));
  }

  /** Tiền tố trước `_` (VD: "MT-L30cm 0.1kg_3701190208G" → "MT-L30cm 0.1kg") — mỗi lô/hậu tố là một `ma` riêng ở chi tiết, tổng hợp gộp lại theo tiền tố này. */
  function extractTonKhoPrefix(ma: string): string {
    const trimmed = String(ma ?? '').trim();
    if (!trimmed) return '';
    const underscoreIdx = trimmed.indexOf('_');
    return underscoreIdx > 0 ? trimmed.slice(0, underscoreIdx).trim() : trimmed;
  }

  function groupTonKhoRowsByPrefix(rows: TonKhoGopRow[]): TonKhoGopRow[] {
    const groups = new Map<string, TonKhoGopRow & { hasExactCatalogMatch: boolean }>();

    for (const row of rows) {
      const prefix = extractTonKhoPrefix(row.ma) || row.ma;
      const isExactMatch = row.ma === prefix;
      let group = groups.get(prefix);
      if (!group) {
        group = {
          ma: prefix,
          ten: row.ten,
          don_vi: row.don_vi,
          ten_kho: row.ten_kho,
          ton_dau_ky: 0,
          nhap_trong_ky: 0,
          xuat_trong_ky: 0,
          ton_cuoi_ky: 0,
          hasExactCatalogMatch: isExactMatch
        };
        groups.set(prefix, group);
      }

      group.ton_dau_ky += row.ton_dau_ky;
      group.nhap_trong_ky += row.nhap_trong_ky;
      group.xuat_trong_ky += row.xuat_trong_ky;
      if (!group.ten_kho && row.ten_kho) group.ten_kho = row.ten_kho;

      // Ưu tiên tên/đơn vị từ đúng mã gốc (tiền tố) trong danh mục; các dòng lô/hậu tố chỉ dùng để bổ sung khi chưa có.
      if (isExactMatch) {
        group.ten = row.ten;
        group.don_vi = row.don_vi;
        group.hasExactCatalogMatch = true;
      } else if (!group.hasExactCatalogMatch && row.ten && row.ten !== row.ma) {
        group.ten = row.ten;
        group.don_vi = group.don_vi || row.don_vi;
      }
    }

    return Array.from(groups.values())
      .map(({ hasExactCatalogMatch, ...row }) => ({
        ...row,
        // Sau khi gộp mọi mã cùng tiền tố, luôn tính tồn cuối từ đúng công thức kho.
        ton_cuoi_ky: row.ton_dau_ky + row.nhap_trong_ky - row.xuat_trong_ky
      }))
      .sort((a, b) => a.ma.localeCompare(b.ma, 'vi'));
  }

  function normalizeTonKhoCatalogCode(value: unknown): string {
    return String(value ?? '').trim().replace(/\s+/g, '').toUpperCase();
  }

  /**
   * Mã serial không có dòng riêng trong danh mục san_pham. Luôn mượn tên/ĐVT/kho
   * từ mã gốc trước dấu `_`, kể cả khi RPC cũ chưa xử lý được khoảng trắng/case.
   */
  async function enrichProductTonKhoRows(rows: TonKhoGopRow[]): Promise<TonKhoGopRow[]> {
    if (!supabase || rows.length === 0) return rows;

    const catalogRows = await loadAllTonKhoRows((from, to) =>
      supabase
        .from(SUPABASE_PRODUCTS_TABLE)
        .select('ma_sp, ten_sp, don_vi, ten_kho')
        .range(from, to)
    );
    const catalogByCode = new Map<string, Record<string, unknown>>();
    catalogRows.forEach(record => {
      const key = normalizeTonKhoCatalogCode(record.ma_sp);
      if (key) catalogByCode.set(key, record);
    });

    return rows.map(row => {
      const prefix = extractTonKhoPrefix(row.ma) || row.ma;
      const catalog = catalogByCode.get(normalizeTonKhoCatalogCode(prefix));
      if (!catalog) return row;
      return {
        ...row,
        ten: String(catalog.ten_sp ?? '').trim() || row.ten,
        don_vi: String(catalog.don_vi ?? '').trim() || row.don_vi,
        ten_kho: String(catalog.ten_kho ?? '').trim() || row.ten_kho
      };
    });
  }

  let hasWarnedMissingTonKhoRpc = false;

  async function loadTonKhoGop(
    loaiKho: TonKhoLoaiKho,
    tenKho: string | null,
    tuNgay: string | null,
    denNgay: string | null
  ) {
    if (loaiKho !== 'nvl' && loaiKho !== 'san_pham') {
      return { data: await loadTonKhoGopFallback(loaiKho, tenKho, tuNgay, denNgay), error: null };
    }
    const rpcName = loaiKho === 'san_pham' ? 'ton_kho_san_pham_gop' : 'ton_kho_nvl_gop';
    const result = await supabase!.rpc(rpcName, {
      p_ten_kho: tenKho,
      p_tu_ngay: tuNgay,
      p_den_ngay: denNgay
    });
    if (!result.error) {
      if (loaiKho !== 'san_pham' || !Array.isArray(result.data)) return result;
      return {
        ...result,
        data: await enrichProductTonKhoRows(result.data as TonKhoGopRow[])
      };
    }
    if (result.error.code !== 'PGRST202') return result;

    if (!hasWarnedMissingTonKhoRpc) {
      console.warn(
        `[SUPABASE] Chưa có RPC ${rpcName}; đang dùng cách tính dự phòng từ các bảng. ` +
        'Nên chạy supabase-ton-kho-rpc.sql để tối ưu hiệu năng.'
      );
      hasWarnedMissingTonKhoRpc = true;
    }

    const fallbackData = await loadTonKhoGopFallback(loaiKho, tenKho, tuNgay, denNgay);
    const data = loaiKho === 'san_pham'
      ? await enrichProductTonKhoRows(fallbackData)
      : fallbackData;
    return { data, error: null };
  }

  app.get('/api/ton-kho/chi-tiet', async (req, res) => {
    if (!supabase) {
      return res.json({ records: [], total: 0, source: 'local' });
    }

    try {
      const tenKho = String(req.query.ten_kho ?? req.query.tenKho ?? '').trim() || null;
      const tuNgay = parseWarehouseSlipDate(req.query.from ?? req.query.tu_ngay);
      const denNgay = parseWarehouseSlipDate(req.query.to ?? req.query.den_ngay);
      const requestedKind = String(req.query.loai_kho ?? '').trim();
      const supportedKinds = new Set<TonKhoLoaiKho>([
        'nvl', 'san_pham', 'tai_che', 'hang_hong', 'hang_hoa', 'cong_cu_dung_cu', 'gia_cong'
      ]);
      const loaiKho: TonKhoLoaiKho = supportedKinds.has(requestedKind as TonKhoLoaiKho)
        ? requestedKind as TonKhoLoaiKho
        : 'san_pham';

      // Danh sách chi tiết phải là từng mã lô/serial còn tồn ở cuối khoảng ngày đã chọn,
      // không phải mọi mã từng phát sinh phiếu trong kỳ. Không gọi hàm group theo tiền tố
      // ở đây để `MT-L30cm 0.1kg_3701190208G` vẫn là một dòng độc lập.
      const result = await loadTonKhoGop(loaiKho, tenKho, tuNgay, denNgay);
      if (result.error) {
        console.error('Supabase ton-kho chi-tiet RPC error:', result.error);
        return res.status(500).json({
          error: result.error.message || 'Không thể tải danh sách chi tiết tồn kho.'
        });
      }

      const records = (Array.isArray(result.data) ? (result.data as TonKhoGopRow[]) : [])
        .filter(row => Number(row.ton_cuoi_ky) > 0)
        .map(row => ({
          ...row,
          ma_goc: extractTonKhoPrefix(row.ma),
          loai_sp: loaiKho === 'san_pham' ? 'Thành phẩm' : 'Nguyên vật liệu'
        }))
        .sort((left, right) => left.ma.localeCompare(right.ma, 'vi'));

      return res.json({
        records,
        total: records.length,
        source: 'supabase'
      });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || 'Lỗi khi tải danh sách chi tiết tồn kho.' });
    }
  });

  app.get('/api/ton-kho/tong-hop', async (req, res) => {
    if (!supabase) {
      return res.json({ records: [], total: 0, source: 'local' });
    }

    try {
      const tenKho = String(req.query.ten_kho ?? req.query.tenKho ?? '').trim() || null;
      const tuNgay = parseWarehouseSlipDate(req.query.from ?? req.query.tu_ngay);
      const denNgay = parseWarehouseSlipDate(req.query.to ?? req.query.den_ngay);
      const requestedKind = String(req.query.loai_kho ?? '').trim();
      const supportedKinds = new Set<TonKhoLoaiKho>([
        'nvl', 'san_pham', 'tai_che', 'hang_hong', 'hang_hoa', 'cong_cu_dung_cu', 'gia_cong'
      ]);
      const loaiKho: TonKhoLoaiKho = supportedKinds.has(requestedKind as TonKhoLoaiKho)
        ? requestedKind as TonKhoLoaiKho
        : 'san_pham';

      const results = [await loadTonKhoGop(loaiKho, tenKho, tuNgay, denNgay)];
      const failedResult = results.find(result => result.error);
      const error = failedResult?.error;
      if (error) {
        console.error('Supabase ton-kho tong-hop RPC error:', error);
        return res.status(500).json({
          error: error.message || 'Không thể tải bảng tổng hợp tồn kho. Hãy chạy supabase-ton-kho-rpc.sql.'
        });
      }

      const data = results.flatMap(result => (Array.isArray(result.data) ? (result.data as TonKhoGopRow[]) : []));
      // Trang tồn kho chỉ liệt kê mặt hàng thực sự còn tồn ở cuối khoảng ngày.
      const records = groupTonKhoRowsByPrefix(data).filter(row => Number(row.ton_cuoi_ky) > 0);
      return res.json({ records, total: records.length, source: 'supabase' });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || 'Lỗi khi tải bảng tổng hợp tồn kho.' });
    }
  });

  app.get('/api/bao-cao-hang-hong/cho-nhap-kho', async (_req, res) => {
    if (!supabase) {
      return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });
    }

    try {
      const [{ data: reportRows, error: reportError }, { data: linkedRows, error: linkedError }, { data: materialRows }] =
        await Promise.all([
          supabase
            .from(SUPABASE_DAMAGED_GOODS_TABLE)
            .select(
              'id,created_at,document_no,report_date,ngay_san_xuat,ca_san_xuat,ten_nguoi_can,ten_may_san_xuat,ghi_chu,loai_hang_hong,ma_vat_tu,so_luong_vat_tu,don_vi_vat_tu'
            )
            .order('created_at', { ascending: false, nullsFirst: false })
            .limit(1000),
          supabase
            .from(SUPABASE_WAREHOUSE_MOVEMENTS_TABLE)
            .select('id_bao_cao_hang_hong')
            .not('id_bao_cao_hang_hong', 'is', null),
          supabase.from(SUPABASE_MATERIALS_TABLE).select('ma_npl,ten_npl')
        ]);

      if (reportError) {
        console.error('Supabase pending damaged goods reports query error:', reportError);
        return res.status(500).json({ error: reportError.message || 'Không thể tải báo cáo hàng hỏng chờ nhập kho.' });
      }
      if (linkedError) {
        console.error('Supabase damaged goods report links query error:', linkedError);
        return res.status(500).json({
          error: isMissingColumnError(linkedError)
            ? 'Thiếu cột id_bao_cao_hang_hong. Hãy chạy migration báo cáo hàng hỏng chờ thủ kho duyệt.'
            : linkedError.message || 'Không thể kiểm tra báo cáo hàng hỏng đã nhập kho.'
        });
      }

      const linkedIds = new Set(
        (linkedRows || []).map(row => String(row.id_bao_cao_hang_hong ?? '').trim()).filter(Boolean)
      );
      const materialNames = new Map(
        (materialRows || []).map(row => [String(row.ma_npl ?? '').trim(), String(row.ten_npl ?? '').trim()])
      );
      const materialLabels: Record<string, { code: string; name: string }> = {
        nhua_khong_mang: { code: 'HH-NHUA-KHONG-MANG', name: 'Nhựa không màng' },
        nhua_dau_nong: { code: 'HH-NHUA-DAU-NONG', name: 'Nhựa đầu nòng' },
        nhua_dinh_mang: { code: 'HH-NHUA-DINH-MANG', name: 'Nhựa dính màng' },
        kl_mang: { code: 'HH-MANG', name: 'Màng hỏng' },
        tl_loi_dinh_hh: { code: 'HH-LOI-DINH', name: 'Lõi dính hàng hỏng' }
      };
      const groups = new Map<string, Record<string, any>>();

      for (const row of reportRows || []) {
        const reportRowId = String(row.id ?? '').trim();
        if (!reportRowId || linkedIds.has(reportRowId)) continue;
        const quantityText = String(row.so_luong_vat_tu ?? '').trim().replace(',', '.');
        const quantity = Number(quantityText);
        if (!Number.isFinite(quantity) || quantity <= 0) continue;

        const materialType = String(row.loai_hang_hong ?? '').trim();
        const customCode = String(row.ma_vat_tu ?? '').trim();
        const fixed = materialLabels[materialType];
        const code = fixed?.code || customCode || 'HH-KHAC';
        const name = fixed?.name || materialNames.get(customCode) || customCode || 'Hàng hỏng khác';
        const documentNo = String(row.document_no ?? '').trim();
        const groupKey = documentNo || `BCHH-${reportRowId}`;
        const existing = groups.get(groupKey);
        const item = {
          reportRowId,
          materialType,
          code,
          name,
          unit: String(row.don_vi_vat_tu ?? '').trim() || 'kg',
          quantity
        };

        if (existing) {
          existing.items.push(item);
        } else {
          groups.set(groupKey, {
            key: groupKey,
            documentNo: documentNo || groupKey,
            reportDate: String(row.report_date ?? '').trim(),
            productionDate: String(row.ngay_san_xuat ?? '').trim(),
            shift: String(row.ca_san_xuat ?? '').trim(),
            weigher: String(row.ten_nguoi_can ?? '').trim(),
            machine: String(row.ten_may_san_xuat ?? '').trim(),
            note: String(row.ghi_chu ?? '').trim(),
            createdAt: String(row.created_at ?? '').trim(),
            items: [item]
          });
        }
      }

      const records = [...groups.values()].sort((left, right) =>
        String(right.createdAt).localeCompare(String(left.createdAt))
      );
      return res.json({ records, total: records.length, source: 'supabase' });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || 'Lỗi khi tải báo cáo hàng hỏng chờ nhập kho.' });
    }
  });

  registerWeighingSlipRoutes(app, '/api/bao-cao-hang-hong', {
    localFilePath: DAMAGED_GOODS_DB_FILE_PATH,
    supabaseTable: SUPABASE_DAMAGED_GOODS_TABLE,
    sqlMigrationFile: 'supabase-bao-cao-hang-hong.sql',
    entityLabel: 'báo cáo hàng hỏng',
    localEntryPrefix: 'bchh_',
    requireDamagedMaterialType: true,
    client: supabase,
    dbLabel: SUPABASE_MAIN_DB_LABEL
  });

  app.get('/api/bao-cao-phoi-tron', async (req, res) => {
    if (!supabase) {
      return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });
    }

    try {
      const ngay = typeof req.query.ngay === 'string' ? req.query.ngay.trim() : '';
      const tuNgay = parseWarehouseSlipDate(req.query.tu_ngay ?? req.query.fromDate);
      const denNgay = parseWarehouseSlipDate(req.query.den_ngay ?? req.query.toDate);
      const ca = typeof req.query.ca === 'string' ? req.query.ca.trim() : '';
      const maMay = typeof req.query.ma_may === 'string' ? req.query.ma_may.trim() : '';

      const buildQuery = () => {
        let query = supabase!
          .from(SUPABASE_MIXING_REPORTS_TABLE)
          .select('*')
          .order('created_at', { ascending: false, nullsFirst: false })
          .order('id', { ascending: false });

        if (ngay) {
          query = query.eq('ngay', ngay);
        } else {
          if (tuNgay) query = query.gte('ngay', tuNgay);
          if (denNgay) query = query.lte('ngay', denNgay);
        }
        if (ca) query = query.eq('ca', ca);
        if (maMay) query = query.eq('ma_may', maMay);
        return query;
      };

      // PostgREST giới hạn mặc định 1000 dòng/query -> phân trang để lấy hết dữ liệu.
      const PAGE_SIZE = 1000;
      const data: Record<string, unknown>[] = [];
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data: page, error } = await buildQuery().range(from, from + PAGE_SIZE - 1);
        if (error) {
          console.error('Supabase mixing report query error:', error);
          return res.status(500).json({ error: mixingReportWriteError(error) });
        }
        data.push(...(page || []));
        if (!page || page.length < PAGE_SIZE) break;
      }

      const reports = data.map(row =>
        row && typeof row === 'object'
          ? {
              ...row,
              lan_thu: extractMixingReportLanThu(row as Record<string, unknown>),
              hinh_anh_theo_lan: extractMixingReportPhotos(row as Record<string, unknown>),
              ly_do_theo_lan: extractMixingReportReasons(row as Record<string, unknown>),
              giai_trinh_theo_lan: extractMixingReportExplanations(row as Record<string, unknown>)
            }
          : row
      );

      return res.json({ reports, total: reports.length });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi tải báo cáo phối trộn.' });
    }
  });

  app.get('/api/bao-cao-phoi-tron/ly-do-goi-y', async (_req, res) => {
    if (!supabase) {
      return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });
    }

    try {
      const { data, error } = await supabase
        .from(SUPABASE_MIXING_REPORTS_TABLE)
        .select('ly_do_theo_lan, chi_tiet')
        .order('created_at', { ascending: false })
        .limit(500);

      if (error) {
        if (isMissingColumnError(error) && String(error.message ?? '').toLowerCase().includes('ly_do_theo_lan')) {
          const fallback = await supabase
            .from(SUPABASE_MIXING_REPORTS_TABLE)
            .select('chi_tiet')
            .order('created_at', { ascending: false })
            .limit(500);
          if (fallback.error) {
            return res.status(500).json({ error: mixingReportWriteError(fallback.error) });
          }
          return res.json({
            reasons: collectMixingReasonSuggestions(
              (fallback.data || []).filter(
                (row): row is { chi_tiet: any } => Boolean(row && typeof row === 'object')
              )
            )
          });
        }
        return res.status(500).json({ error: mixingReportWriteError(error) });
      }

      return res.json({
        reasons: collectMixingReasonSuggestions(
          (data || []).filter(
            (row): row is { ly_do_theo_lan: any; chi_tiet: any } => Boolean(row && typeof row === 'object')
          )
        )
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Không thể tải gợi ý lý do.' });
    }
  });

  app.post('/api/bao-cao-phoi-tron', async (req, res) => {
    if (!supabase) {
      return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });
    }

    try {
      const parsed = parseMixingReportBody(req.body);
      if ('error' in parsed) {
        return res.status(400).json({ error: parsed.error });
      }

      const { data, error } = await writeMixingReportRecord(parsed.record, 'insert');

      if (error) {
        console.error('Supabase mixing report insert error:', error);
        return res.status(500).json({ error: mixingReportWriteError(error) });
      }

      return res.status(201).json({
        success: true,
        report: data
          ? {
              ...data,
              lan_thu: extractMixingReportLanThu(data as Record<string, unknown>),
              hinh_anh_theo_lan: extractMixingReportPhotos(data as Record<string, unknown>),
              ly_do_theo_lan: extractMixingReportReasons(data as Record<string, unknown>),
              giai_trinh_theo_lan: extractMixingReportExplanations(data as Record<string, unknown>)
            }
          : data
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi lưu báo cáo phối trộn.' });
    }
  });

  app.patch('/api/bao-cao-phoi-tron/:id', async (req, res) => {
    if (!supabase) {
      return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });
    }

    try {
      const id = String(req.params.id || '').trim();
      if (!id) return res.status(400).json({ error: 'Thiếu ID báo cáo.' });

      const parsed = parseMixingReportBody(req.body);
      if ('error' in parsed) {
        return res.status(400).json({ error: parsed.error });
      }

      const { data, error } = await writeMixingReportRecord(parsed.record, 'update', id);

      if (error) {
        console.error('Supabase mixing report update error:', error);
        return res.status(500).json({ error: mixingReportWriteError(error) });
      }

      if (!data) return res.status(404).json({ error: 'Không tìm thấy báo cáo.' });
      return res.json({
        success: true,
        report: {
          ...data,
          lan_thu: extractMixingReportLanThu(data as Record<string, unknown>),
          hinh_anh_theo_lan: extractMixingReportPhotos(data as Record<string, unknown>),
          ly_do_theo_lan: extractMixingReportReasons(data as Record<string, unknown>),
          giai_trinh_theo_lan: extractMixingReportExplanations(data as Record<string, unknown>)
        }
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi cập nhật báo cáo phối trộn.' });
    }
  });

  app.delete('/api/bao-cao-phoi-tron/:id', async (req, res) => {
    if (!supabase) {
      return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });
    }

    try {
      const id = String(req.params.id || '').trim();
      if (!id) return res.status(400).json({ error: 'Thiếu ID báo cáo.' });

      const { data, error } = await supabase
        .from(SUPABASE_MIXING_REPORTS_TABLE)
        .delete()
        .eq('id', id)
        .select('id')
        .single();

      if (error) {
        console.error('Supabase mixing report delete error:', error);
        return res.status(500).json({ error: mixingReportWriteError(error) });
      }

      if (!data) return res.status(404).json({ error: 'Không tìm thấy báo cáo.' });
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi xóa báo cáo phối trộn.' });
    }
  });

  app.post('/api/bao-cao-phoi-tron/bulk-delete', async (req, res) => {
    if (!supabase) {
      return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });
    }

    try {
      const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
      const idsRaw = Array.isArray(body.ids) ? body.ids : [];
      const ids = [...new Set(idsRaw.map(id => String(id || '').trim()).filter(Boolean))];
      if (ids.length === 0) {
        return res.status(400).json({ error: 'Thiếu danh sách ID báo cáo.' });
      }

      const { data, error } = await supabase
        .from(SUPABASE_MIXING_REPORTS_TABLE)
        .delete()
        .in('id', ids)
        .select('id');

      if (error) {
        console.error('Supabase mixing report bulk delete error:', error);
        return res.status(500).json({ error: mixingReportWriteError(error) });
      }

      const deleted = Array.isArray(data) ? data.length : 0;
      return res.json({ success: true, deleted });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi xóa nhiều báo cáo phối trộn.' });
    }
  });

  app.get('/api/bang-tron-vat-tu-dinh-muc', async (req, res) => {
    if (!supabase) {
      return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });
    }

    try {
      const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
      const ngay =
        typeof req.query.ngay === 'string'
          ? req.query.ngay.trim().slice(0, 10)
          : typeof req.query.tu_ngay === 'string'
            ? req.query.tu_ngay.trim().slice(0, 10)
            : '';
      const ca = typeof req.query.ca === 'string' ? req.query.ca.trim() : '';

      let query = supabase
        .from(SUPABASE_MIXING_NORM_TABLE)
        .select('*')
        .order('created_at', { ascending: false, nullsFirst: false })
        .order('id', { ascending: false });

      if (ngay) query = query.eq('ngay', ngay);

      const { data, error } = await query.limit(2000);
      if (error) {
        console.error('Supabase mixing norm query error:', error);
        return res.status(500).json({ error: mixingNormWriteError(error) });
      }

      let records = Array.isArray(data) ? data : [];
      if (ca) {
        const needle = ca.toLowerCase();
        records = records.filter(row => {
          const value = String((row as Record<string, unknown>).ca ?? '')
            .trim()
            .toLowerCase();
          return value === needle || value.includes(needle) || needle.includes(value);
        });
      }
      if (q) {
        const needle = q.toLowerCase();
        records = records.filter(row => {
          const r = row as Record<string, unknown>;
          return `${r.ngay ?? ''} ${r.ca ?? ''} ${r.ma_lenh_sx ?? ''} ${r.ma_sp ?? ''} ${r.ten_sp ?? ''} ${r.ma_nvl ?? ''} ${r.ten_nvl ?? ''} ${r.ghi_chu ?? ''}`
            .toLowerCase()
            .includes(needle);
        });
      }

      return res.json({ records, total: records.length });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi tải bảng định mức.' });
    }
  });

  app.post('/api/bang-tron-vat-tu-dinh-muc', async (req, res) => {
    if (!supabase) {
      return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });
    }

    try {
      const parsed = parseMixingNormBody(req.body);
      if ('error' in parsed) return res.status(400).json({ error: parsed.error });

      const { data, error } = await supabase
        .from(SUPABASE_MIXING_NORM_TABLE)
        .insert(parsed.record)
        .select('*')
        .single();

      if (error) {
        console.error('Supabase mixing norm insert error:', error);
        return res.status(500).json({ error: mixingNormWriteError(error) });
      }

      return res.status(201).json({ success: true, record: data });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi thêm dòng định mức.' });
    }
  });

  app.patch('/api/bang-tron-vat-tu-dinh-muc/:id', async (req, res) => {
    if (!supabase) {
      return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });
    }

    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ error: 'Thiếu id.' });

    try {
      const parsed = parseMixingNormBody(req.body);
      if ('error' in parsed) return res.status(400).json({ error: parsed.error });

      const { data, error } = await supabase
        .from(SUPABASE_MIXING_NORM_TABLE)
        .update(parsed.record)
        .eq('id', id)
        .select('*')
        .single();

      if (error) {
        console.error('Supabase mixing norm update error:', error);
        return res.status(500).json({ error: mixingNormWriteError(error) });
      }

      return res.json({ success: true, record: data });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi cập nhật dòng định mức.' });
    }
  });

  app.delete('/api/bang-tron-vat-tu-dinh-muc/:id', async (req, res) => {
    if (!supabase) {
      return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });
    }

    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ error: 'Thiếu id.' });

    try {
      const { error } = await supabase.from(SUPABASE_MIXING_NORM_TABLE).delete().eq('id', id);
      if (error) {
        console.error('Supabase mixing norm delete error:', error);
        return res.status(500).json({ error: mixingNormWriteError(error) });
      }
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi xóa dòng định mức.' });
    }
  });

  app.get('/api/phieu-tron-thuc-te', async (req, res) => {
    if (!supabase) return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });
    try {
      const ngay = typeof req.query.ngay === 'string' ? req.query.ngay.trim() : '';
      const ca = typeof req.query.ca === 'string' ? req.query.ca.trim() : '';
      let query = supabase
        .from(SUPABASE_ACTUAL_MIXING_SHEET_TABLE)
        .select('*')
        .order('created_at', { ascending: false, nullsFirst: false })
        .order('id', { ascending: false });
      if (ngay) query = query.eq('ngay', ngay);
      if (ca) query = query.eq('ca', ca);
      const { data, error } = await query.limit(2000);
      if (error) {
        const message = isMissingTableError(error)
          ? `Bảng ${SUPABASE_ACTUAL_MIXING_SHEET_TABLE} chưa tồn tại trên Supabase. Hãy chạy file supabase-phieu-tron-thuc-te.sql trong Supabase SQL Editor.`
          : `Không thể tải phiếu trộn thực tế. ${error.message}`;
        return res.status(500).json({ error: message });
      }
      return res.json({ records: data || [], total: data?.length || 0 });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi tải phiếu trộn thực tế.' });
    }
  });

  app.post('/api/phieu-tron-thuc-te', async (req, res) => {
    if (!supabase) return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });
    try {
      const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
      const ngay = String(body.ngay ?? '').trim();
      const ca = String(body.ca ?? '').trim();
      const normId = String(body.dinh_muc_id ?? '').trim();
      const rawChiTiet = Array.isArray(body.chi_tiet) ? body.chi_tiet : [];
      const chiTiet = rawChiTiet
        .map(item => {
          if (!item || typeof item !== 'object') return null;
          const product = item as Record<string, unknown>;
          const nvlRaw = Array.isArray(product.nvl)
            ? product.nvl
            : Array.isArray(product.chi_tiet)
              ? product.chi_tiet
              : [];
          const nvl = nvlRaw
            .map(line => {
              if (!line || typeof line !== 'object') return null;
              const row = line as Record<string, unknown>;
              const ma_nvl = String(row.ma_nvl ?? '').trim();
              const ten_nvl = String(row.ten_nvl ?? '').trim();
              if (!ma_nvl && !ten_nvl) return null;
              const toNum = (value: unknown) => {
                if (value === null || value === undefined || String(value).trim() === '') return null;
                const parsed = Number(String(value).replace(',', '.'));
                return Number.isFinite(parsed) ? parsed : null;
              };
              return {
                ma_nvl,
                ten_nvl,
                gia_tri: toNum(row.gia_tri ?? row.dinh_muc),
                khoi_luong: toNum(row.khoi_luong),
                phan_tram_thuc_te: toNum(row.phan_tram_thuc_te),
                trong_luong_thuc_te: toNum(row.trong_luong_thuc_te)
              };
            })
            .filter(Boolean);
          return {
            ma_sp: String(product.ma_sp ?? '').trim(),
            ten_sp: String(product.ten_sp ?? '').trim(),
            tong_trong_luong: (() => {
              const value = product.tong_trong_luong;
              if (value === null || value === undefined || String(value).trim() === '') return null;
              const parsed = Number(String(value).replace(',', '.'));
              return Number.isFinite(parsed) ? parsed : null;
            })(),
            nvl
          };
        })
        .filter(Boolean);

      if (!ngay || !ca) return res.status(400).json({ error: 'Vui lòng chọn ngày và ca.' });
      if (!normId) return res.status(400).json({ error: 'Thiếu phiếu trộn định mức.' });
      if (chiTiet.length === 0) return res.status(400).json({ error: 'Phiếu không có chi tiết NVL.' });

      const record = {
        ngay,
        ca,
        dinh_muc_id: normId,
        ma_lenh_sx: String(body.ma_lenh_sx ?? '').trim() || null,
        ghi_chu: String(body.ghi_chu ?? '').trim() || null,
        chi_tiet: chiTiet,
        updated_at: new Date().toISOString()
      };
      const id = String(body.id ?? '').trim();
      const request = id
        ? supabase.from(SUPABASE_ACTUAL_MIXING_SHEET_TABLE).update(record).eq('id', id)
        : supabase.from(SUPABASE_ACTUAL_MIXING_SHEET_TABLE).upsert(record, { onConflict: 'dinh_muc_id' });
      const { data, error } = await request.select('*').single();
      if (error) {
        const message = isMissingTableError(error)
          ? `Bảng ${SUPABASE_ACTUAL_MIXING_SHEET_TABLE} chưa tồn tại trên Supabase. Hãy chạy file supabase-phieu-tron-thuc-te.sql trong Supabase SQL Editor.`
          : `Không thể lưu phiếu trộn thực tế. ${error.message}`;
        return res.status(500).json({ error: message });
      }
      return res.status(id ? 200 : 201).json({ success: true, record: data });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi lưu phiếu trộn thực tế.' });
    }
  });

  app.get('/api/bao-cao-may-nvl-ton', async (req, res) => {
    if (!supabase) {
      return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });
    }

    try {
      const ngay = typeof req.query.ngay === 'string' ? req.query.ngay.trim() : '';
      const tuNgay = parseWarehouseSlipDate(req.query.tu_ngay ?? req.query.fromDate);
      const denNgay = parseWarehouseSlipDate(req.query.den_ngay ?? req.query.toDate);
      const maMay = typeof req.query.ma_may === 'string' ? req.query.ma_may.trim() : '';
      const loaiBaoCaoRaw = typeof req.query.loai_bao_cao === 'string' ? req.query.loai_bao_cao.trim() : '';
      const limitRaw = typeof req.query.limit === 'string' ? Number(req.query.limit) : 100;
      const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 300) : 100;

      let query = supabase
        .from(SUPABASE_MACHINE_NVL_REPORTS_TABLE)
        .select('*')
        .order('created_at', { ascending: false, nullsFirst: false })
        .order('id', { ascending: false })
        .limit(limit);

      if (ngay) {
        query = query.eq('ngay', ngay);
      } else {
        if (tuNgay) query = query.gte('ngay', tuNgay);
        if (denNgay) query = query.lte('ngay', denNgay);
      }
      if (maMay) query = query.eq('ma_may', maMay);
      if (loaiBaoCaoRaw) query = query.eq('loai_bao_cao', parseMachineNvlReportKind(loaiBaoCaoRaw));

      const { data, error } = await query;
      if (error) {
        console.error('Supabase machine NVL report query error:', error);
        return res.status(500).json({ error: machineNvlReportWriteError(error) });
      }

      return res.json({ reports: data || [], total: data?.length || 0 });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi tải báo cáo NVL tồn theo máy.' });
    }
  });

  app.post('/api/bao-cao-may-nvl-ton', async (req, res) => {
    if (!supabase) {
      return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });
    }

    try {
      const parsed = parseMachineNvlReportBody(req.body);
      if ('error' in parsed) {
        return res.status(400).json({ error: parsed.error });
      }

      const duplicate = await findExistingMachineNvlDuplicate({
        ngay: String(parsed.record.ngay || ''),
        ca: String(parsed.record.ca || ''),
        loai_bao_cao: parsed.record.loai_bao_cao as 'dau_ca' | 'cuoi_ca',
        ma_may: parsed.record.ma_may as string | null,
        ten_may: parsed.record.ten_may as string | null
      });
      if (duplicate) {
        const machineLabel =
          String(duplicate.ten_may || duplicate.ma_may || parsed.record.ten_may || parsed.record.ma_may || '').trim();
        return res.status(409).json({
          error: formatMachineNvlDuplicateApiError(
            parsed.record.loai_bao_cao as 'dau_ca' | 'cuoi_ca',
            String(parsed.record.ngay || ''),
            String(parsed.record.ca || ''),
            machineLabel
          ),
          code: 'DUPLICATE_REPORT',
          existingId: duplicate.id
        });
      }

      const { data, error } = await supabase
        .from(SUPABASE_MACHINE_NVL_REPORTS_TABLE)
        .insert(parsed.record)
        .select('*')
        .single();

      if (error) {
        console.error('Supabase machine NVL report insert error:', error);
        return res.status(500).json({ error: machineNvlReportWriteError(error) });
      }

      return res.status(201).json({ success: true, report: data });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi lưu báo cáo NVL tồn theo máy.' });
    }
  });

  app.put('/api/bao-cao-may-nvl-ton/:id', async (req, res) => {
    if (!supabase) {
      return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });
    }

    try {
      const id = String(req.params.id || '').trim();
      if (!id) return res.status(400).json({ error: 'Thiếu ID báo cáo.' });

      const parsed = parseMachineNvlReportBody(req.body);
      if ('error' in parsed) {
        return res.status(400).json({ error: parsed.error });
      }

      const duplicate = await findExistingMachineNvlDuplicate({
        ngay: String(parsed.record.ngay || ''),
        ca: String(parsed.record.ca || ''),
        loai_bao_cao: parsed.record.loai_bao_cao as 'dau_ca' | 'cuoi_ca',
        ma_may: parsed.record.ma_may as string | null,
        ten_may: parsed.record.ten_may as string | null,
        excludeId: id
      });
      if (duplicate) {
        const machineLabel =
          String(duplicate.ten_may || duplicate.ma_may || parsed.record.ten_may || parsed.record.ma_may || '').trim();
        return res.status(409).json({
          error: formatMachineNvlDuplicateApiError(
            parsed.record.loai_bao_cao as 'dau_ca' | 'cuoi_ca',
            String(parsed.record.ngay || ''),
            String(parsed.record.ca || ''),
            machineLabel
          ),
          code: 'DUPLICATE_REPORT',
          existingId: duplicate.id
        });
      }

      const { data, error } = await supabase
        .from(SUPABASE_MACHINE_NVL_REPORTS_TABLE)
        .update(parsed.record)
        .eq('id', id)
        .select('*')
        .single();

      if (error) {
        console.error('Supabase machine NVL report update error:', error);
        return res.status(500).json({ error: machineNvlReportWriteError(error) });
      }

      if (!data) return res.status(404).json({ error: 'Không tìm thấy báo cáo.' });
      return res.json({ success: true, report: data });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi cập nhật báo cáo NVL tồn theo máy.' });
    }
  });

  app.delete('/api/bao-cao-may-nvl-ton/:id', async (req, res) => {
    if (!supabase) {
      return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });
    }

    try {
      const id = String(req.params.id || '').trim();
      if (!id) return res.status(400).json({ error: 'Thiếu ID báo cáo.' });

      const { data, error } = await supabase
        .from(SUPABASE_MACHINE_NVL_REPORTS_TABLE)
        .delete()
        .eq('id', id)
        .select('id')
        .single();

      if (error) {
        console.error('Supabase machine NVL report delete error:', error);
        return res.status(500).json({ error: machineNvlReportWriteError(error) });
      }

      if (!data) return res.status(404).json({ error: 'Không tìm thấy báo cáo.' });
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi xóa báo cáo NVL tồn theo máy.' });
    }
  });

  app.post('/api/bao-cao-may-nvl-ton/bulk-delete', async (req, res) => {
    if (!supabase) {
      return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });
    }

    try {
      const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
      const idsRaw = Array.isArray(body.ids) ? body.ids : [];
      const ids = [...new Set(idsRaw.map(id => String(id || '').trim()).filter(Boolean))];
      if (ids.length === 0) {
        return res.status(400).json({ error: 'Thiếu danh sách ID báo cáo.' });
      }

      const { data, error } = await supabase
        .from(SUPABASE_MACHINE_NVL_REPORTS_TABLE)
        .delete()
        .in('id', ids)
        .select('id');

      if (error) {
        console.error('Supabase machine NVL report bulk delete error:', error);
        return res.status(500).json({ error: machineNvlReportWriteError(error) });
      }

      const deleted = Array.isArray(data) ? data.length : 0;
      return res.json({ success: true, deleted });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi xóa nhiều báo cáo NVL tồn theo máy.' });
    }
  });

  app.get('/api/phieu-bao-dung-may', async (req, res) => {
    if (!supabase) {
      return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });
    }

    try {
      const ngay = typeof req.query.ngay === 'string' ? req.query.ngay.trim() : '';
      const maMay = typeof req.query.ma_may === 'string' ? req.query.ma_may.trim() : '';
      const limitRaw = typeof req.query.limit === 'string' ? Number(req.query.limit) : 100;
      const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 300) : 100;

      let query = supabase
        .from(SUPABASE_MACHINE_DOWNTIME_TABLE)
        .select('*')
        .order('created_at', { ascending: false, nullsFirst: false })
        .order('id', { ascending: false })
        .limit(limit);

      if (ngay) query = query.eq('ngay', ngay);
      if (maMay) query = query.eq('ma_may', maMay);

      const { data, error } = await query;
      if (error) {
        console.error('Supabase machine downtime query error:', error);
        return res.status(500).json({ error: machineDowntimeWriteError(error) });
      }

      return res.json({ slips: data || [], total: data?.length || 0 });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi tải phiếu báo dừng máy.' });
    }
  });

  app.post('/api/phieu-bao-dung-may', async (req, res) => {
    if (!supabase) {
      return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });
    }

    try {
      const parsed = parseMachineDowntimeBody(req.body);
      if ('error' in parsed) {
        return res.status(400).json({ error: parsed.error });
      }

      const { data, error } = await supabase
        .from(SUPABASE_MACHINE_DOWNTIME_TABLE)
        .insert(parsed.record)
        .select('*')
        .single();

      if (error) {
        console.error('Supabase machine downtime insert error:', error);
        return res.status(500).json({ error: machineDowntimeWriteError(error) });
      }

      return res.status(201).json({ success: true, slip: data });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi lưu phiếu báo dừng máy.' });
    }
  });

  app.delete('/api/phieu-bao-dung-may/:id', async (req, res) => {
    if (!supabase) {
      return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });
    }

    try {
      const id = String(req.params.id || '').trim();
      if (!id) return res.status(400).json({ error: 'Thiếu ID phiếu.' });

      const { data, error } = await supabase
        .from(SUPABASE_MACHINE_DOWNTIME_TABLE)
        .delete()
        .eq('id', id)
        .select('id')
        .single();

      if (error) {
        console.error('Supabase machine downtime delete error:', error);
        return res.status(500).json({ error: machineDowntimeWriteError(error) });
      }

      if (!data) return res.status(404).json({ error: 'Không tìm thấy phiếu.' });
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi xóa phiếu báo dừng máy.' });
    }
  });

  app.get('/api/phieu-giao-ca', async (req, res) => {
    if (!supabase) {
      return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });
    }

    try {
      const ngay = typeof req.query.ngay === 'string' ? req.query.ngay.trim() : '';
      const maMay = typeof req.query.ma_may === 'string' ? req.query.ma_may.trim() : '';
      const limitRaw = typeof req.query.limit === 'string' ? Number(req.query.limit) : 100;
      const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 300) : 100;

      let query = supabase
        .from(SUPABASE_SHIFT_HANDOVER_TABLE)
        .select('*')
        .order('created_at', { ascending: false, nullsFirst: false })
        .order('id', { ascending: false })
        .limit(limit);

      if (ngay) query = query.eq('ngay', ngay);
      if (maMay) query = query.eq('ma_may', maMay);

      const { data, error } = await query;
      if (error) {
        console.error('Supabase shift handover query error:', error);
        return res.status(500).json({ error: shiftHandoverWriteError(error) });
      }

      return res.json({ slips: data || [], total: data?.length || 0 });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi tải phiếu giao ca.' });
    }
  });

  app.post('/api/phieu-giao-ca', async (req, res) => {
    if (!supabase) {
      return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });
    }

    try {
      const parsed = parseShiftHandoverBody(req.body);
      if ('error' in parsed) {
        return res.status(400).json({ error: parsed.error });
      }

      const { data, error } = await supabase
        .from(SUPABASE_SHIFT_HANDOVER_TABLE)
        .insert(parsed.record)
        .select('*')
        .single();

      if (error) {
        console.error('Supabase shift handover insert error:', error);
        return res.status(500).json({ error: shiftHandoverWriteError(error) });
      }

      return res.status(201).json({ success: true, slip: data });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi lưu phiếu giao ca.' });
    }
  });

  app.delete('/api/phieu-giao-ca/:id', async (req, res) => {
    if (!supabase) {
      return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });
    }

    try {
      const id = String(req.params.id || '').trim();
      if (!id) return res.status(400).json({ error: 'Thiếu ID phiếu.' });

      const { data, error } = await supabase
        .from(SUPABASE_SHIFT_HANDOVER_TABLE)
        .delete()
        .eq('id', id)
        .select('id')
        .single();

      if (error) {
        console.error('Supabase shift handover delete error:', error);
        return res.status(500).json({ error: shiftHandoverWriteError(error) });
      }

      if (!data) return res.status(404).json({ error: 'Không tìm thấy phiếu.' });
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi xóa phiếu giao ca.' });
    }
  });

  app.get('/api/bb-bao-cao-ly-do', async (req, res) => {
    if (!supabase) {
      return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });
    }

    try {
      const dateFrom = typeof req.query.dateFrom === 'string' ? req.query.dateFrom.trim() : '';
      const dateTo = typeof req.query.dateTo === 'string' ? req.query.dateTo.trim() : '';
      const maLenh = typeof req.query.ma_lenh === 'string' ? req.query.ma_lenh.trim() : '';
      const limitRaw = typeof req.query.limit === 'string' ? Number(req.query.limit) : 2000;
      const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 5000) : 2000;

      let query = supabase
        .from(SUPABASE_BB_BAO_CAO_LY_DO_TABLE)
        .select('*')
        .order('ngay', { ascending: false })
        .order('updated_at', { ascending: false, nullsFirst: false })
        .limit(limit);

      if (dateFrom) query = query.gte('ngay', dateFrom);
      if (dateTo) query = query.lte('ngay', dateTo);
      if (maLenh) query = query.eq('ma_lenh', maLenh);

      const { data, error } = await query;
      if (error) {
        console.error('Supabase bb_bao_cao_ly_do query error:', error);
        return res.status(500).json({ error: bbBaoCaoLyDoWriteError(error), items: [], total: 0 });
      }

      return res.json({ items: data || [], total: (data || []).length, source: 'supabase' });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi tải lý do giải trình BB.' });
    }
  });

  app.put('/api/bb-bao-cao-ly-do', async (req, res) => {
    if (!supabase) {
      return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });
    }

    try {
      const rawItems = Array.isArray(req.body?.items)
        ? req.body.items
        : Array.isArray(req.body)
          ? req.body
          : [];
      const records = rawItems.map(parseBbBaoCaoLyDoItem).filter(Boolean) as Array<{
        khoa_on_dinh: string;
        ngay: string;
        ca: string;
        may: string;
        ma_lenh: string;
        ma_sp: string;
        ten_sp: string | null;
        group_key: string | null;
        line_key: string | null;
        ly_do: string;
        ghi_chu: string;
      }>;

      if (records.length === 0) {
        return res.status(400).json({ error: 'Không có dòng lý do hợp lệ để lưu.' });
      }

      // Gộp theo khoa — dòng sau ghi đè dòng trước.
      const byKey = new Map<string, (typeof records)[number]>();
      for (const row of records) byKey.set(row.khoa_on_dinh, row);
      const payload = [...byKey.values()];

      const { data, error } = await supabase
        .from(SUPABASE_BB_BAO_CAO_LY_DO_TABLE)
        .upsert(payload, { onConflict: 'khoa_on_dinh' })
        .select('*');

      if (error) {
        console.error('Supabase bb_bao_cao_ly_do upsert error:', error);
        return res.status(500).json({ error: bbBaoCaoLyDoWriteError(error) });
      }

      return res.json({
        success: true,
        items: data || [],
        total: (data || []).length
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi lưu lý do giải trình BB.' });
    }
  });

  app.get('/api/bb-phan-tich-danh-gia', async (req, res) => {
    if (!supabase) {
      return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });
    }

    try {
      const dateFrom = typeof req.query.dateFrom === 'string' ? req.query.dateFrom.trim() : '';
      const dateTo = typeof req.query.dateTo === 'string' ? req.query.dateTo.trim() : '';
      const maLenh = typeof req.query.ma_lenh === 'string' ? req.query.ma_lenh.trim() : '';
      const limitRaw = typeof req.query.limit === 'string' ? Number(req.query.limit) : 2000;
      const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 5000) : 2000;

      let query = supabase
        .from(SUPABASE_BB_PHAN_TICH_DANH_GIA_TABLE)
        .select('*')
        .order('ngay', { ascending: false })
        .order('updated_at', { ascending: false, nullsFirst: false })
        .limit(limit);

      if (dateFrom) query = query.gte('ngay', dateFrom);
      if (dateTo) query = query.lte('ngay', dateTo);
      if (maLenh) query = query.eq('ma_lenh', maLenh);

      const { data, error } = await query;
      if (error) {
        console.error('Supabase bb_phan_tich_danh_gia query error:', error);
        return res.status(500).json({ error: bbPhanTichDanhGiaWriteError(error), items: [], total: 0 });
      }

      return res.json({ items: data || [], total: (data || []).length, source: 'supabase' });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi tải phân tích đánh giá BB.' });
    }
  });

  app.put('/api/bb-phan-tich-danh-gia', async (req, res) => {
    if (!supabase) {
      return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });
    }

    try {
      const rawItems = Array.isArray(req.body?.items)
        ? req.body.items
        : Array.isArray(req.body)
          ? req.body
          : [];
      const records = rawItems.map(parseBbPhanTichDanhGiaItem).filter(Boolean) as Array<{
        khoa_on_dinh: string;
        ngay: string;
        ca: string;
        may: string;
        ma_lenh: string;
        group_key: string | null;
        noi_dung: string;
        nguoi_lap: string | null;
      }>;

      if (records.length === 0) {
        return res.status(400).json({ error: 'Không có dòng phân tích hợp lệ để lưu.' });
      }

      const byKey = new Map<string, (typeof records)[number]>();
      for (const row of records) byKey.set(row.khoa_on_dinh, row);
      const payload = [...byKey.values()];

      const { data, error } = await supabase
        .from(SUPABASE_BB_PHAN_TICH_DANH_GIA_TABLE)
        .upsert(payload, { onConflict: 'khoa_on_dinh' })
        .select('*');

      if (error) {
        console.error('Supabase bb_phan_tich_danh_gia upsert error:', error);
        return res.status(500).json({ error: bbPhanTichDanhGiaWriteError(error) });
      }

      return res.json({
        success: true,
        items: data || [],
        total: (data || []).length
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi lưu phân tích đánh giá BB.' });
    }
  });

  app.get('/api/bb-bao-cao-tinh-toan', async (req, res) => {
    if (!supabase) {
      return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });
    }

    try {
      const khoa =
        typeof req.query.khoa_on_dinh === 'string'
          ? req.query.khoa_on_dinh.trim()
          : typeof req.query.key === 'string'
            ? req.query.key.trim()
            : '';
      const dateFrom = typeof req.query.dateFrom === 'string' ? req.query.dateFrom.trim() : '';
      const dateTo = typeof req.query.dateTo === 'string' ? req.query.dateTo.trim() : '';
      const ca = typeof req.query.ca === 'string' ? req.query.ca.trim() : '';
      const may = typeof req.query.may === 'string' ? req.query.may.trim() : '';
      const limitRaw = typeof req.query.limit === 'string' ? Number(req.query.limit) : 20;
      const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 100) : 20;

      let query = supabase
        .from(SUPABASE_BB_BAO_CAO_TINH_TOAN_TABLE)
        .select('*')
        .order('calculated_at', { ascending: false, nullsFirst: false })
        .limit(limit);

      if (khoa) {
        query = query.eq('khoa_on_dinh', khoa).limit(1);
      } else {
        if (dateFrom) query = query.eq('ngay_tu', dateFrom);
        if (dateTo) query = query.eq('ngay_den', dateTo);
        if (ca) query = query.eq('ca', ca);
        if (may) query = query.eq('may', may);
      }

      const { data, error } = await query;
      if (error) {
        console.error('Supabase bb_bao_cao_tinh_toan query error:', error);
        return res.status(500).json({ error: bbBaoCaoTinhToanWriteError(error), items: [], total: 0 });
      }

      const items = data || [];
      return res.json({
        item: items[0] || null,
        items,
        total: items.length,
        source: 'supabase'
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi tải bản tính toán báo cáo BB.' });
    }
  });

  app.put('/api/bb-bao-cao-tinh-toan', async (req, res) => {
    if (!supabase) {
      return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });
    }

    try {
      const record = parseBbBaoCaoTinhToanBody(req.body);
      if (!record) {
        return res.status(400).json({ error: 'Thiếu payload tính toán hợp lệ.' });
      }

      const { data, error } = await supabase
        .from(SUPABASE_BB_BAO_CAO_TINH_TOAN_TABLE)
        .upsert(
          {
            ...record,
            calculated_at: new Date().toISOString()
          },
          { onConflict: 'khoa_on_dinh' }
        )
        .select('*')
        .maybeSingle();

      if (error) {
        console.error('Supabase bb_bao_cao_tinh_toan upsert error:', error);
        return res.status(500).json({ error: bbBaoCaoTinhToanWriteError(error) });
      }

      return res.json({ success: true, item: data || null });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi lưu bản tính toán báo cáo BB.' });
    }
  });

  app.get('/api/nhat-ky-chay-may', async (req, res) => {
    if (!supabase) {
      return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });
    }

    try {
      const ngay = typeof req.query.ngay === 'string' ? req.query.ngay.trim() : '';
      const maMay = typeof req.query.ma_may === 'string' ? req.query.ma_may.trim() : '';
      const limitRaw = typeof req.query.limit === 'string' ? Number(req.query.limit) : 100;
      const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 300) : 100;

      let query = supabase
        .from(SUPABASE_MACHINE_RUN_LOG_TABLE)
        .select('*')
        .order('created_at', { ascending: false, nullsFirst: false })
        .order('id', { ascending: false })
        .limit(limit);

      if (ngay) query = query.eq('ngay', ngay);
      if (maMay) query = query.eq('ma_may', maMay);

      const { data, error } = await query;
      if (error) {
        console.error('Supabase machine run log query error:', error);
        return res.status(500).json({ error: machineRunLogWriteError(error) });
      }

      return res.json({ logs: data || [], total: data?.length || 0 });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi tải nhật ký chạy máy.' });
    }
  });

  app.post('/api/nhat-ky-chay-may', async (req, res) => {
    if (!supabase) {
      return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });
    }

    try {
      const parsed = parseMachineRunLogBody(req.body);
      if ('error' in parsed) {
        return res.status(400).json({ error: parsed.error });
      }

      const { data, error } = await supabase
        .from(SUPABASE_MACHINE_RUN_LOG_TABLE)
        .insert(parsed.record)
        .select('*')
        .single();

      if (error) {
        console.error('Supabase machine run log insert error:', error);
        return res.status(500).json({ error: machineRunLogWriteError(error) });
      }

      return res.status(201).json({ success: true, log: data });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi lưu nhật ký chạy máy.' });
    }
  });

  app.delete('/api/nhat-ky-chay-may/:id', async (req, res) => {
    if (!supabase) {
      return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });
    }

    try {
      const id = String(req.params.id || '').trim();
      if (!id) return res.status(400).json({ error: 'Thiếu ID nhật ký.' });

      const { data, error } = await supabase
        .from(SUPABASE_MACHINE_RUN_LOG_TABLE)
        .delete()
        .eq('id', id)
        .select('id')
        .single();

      if (error) {
        console.error('Supabase machine run log delete error:', error);
        return res.status(500).json({ error: machineRunLogWriteError(error) });
      }

      if (!data) return res.status(404).json({ error: 'Không tìm thấy nhật ký.' });
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi xóa nhật ký chạy máy.' });
    }
  });

  app.post('/api/cloudinary/upload', async (req, res) => {
    try {
      const { imageDataUrl, folder } = req.body;
      if (!imageDataUrl || typeof imageDataUrl !== 'string') {
        return res.status(400).json({ error: 'Thiếu dữ liệu ảnh.' });
      }

      const uploadFolder =
        typeof folder === 'string' && folder.trim() ? folder.trim() : 'phieu_can_dinh_ki';
      const result = await uploadImageToCloudinary(imageDataUrl, uploadFolder);
      return res.status(201).json(result);
    } catch (err: any) {
      console.error('Cloudinary upload error:', err);
      res.status(500).json({ error: err.message || 'Không thể upload ảnh.' });
    }
  });

  app.get('/api/cloudinary/proxy', async (req, res) => {
    const raw = typeof req.query.url === 'string' ? req.query.url.trim() : '';
    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      return res.status(400).json({ error: 'URL ảnh không hợp lệ.' });
    }
    if (parsed.protocol !== 'https:' || parsed.hostname.toLowerCase() !== 'res.cloudinary.com') {
      return res.status(400).json({ error: 'Chỉ cho phép ảnh res.cloudinary.com.' });
    }
    if (parsed.username || parsed.password || !parsed.pathname.includes('/image/upload/')) {
      return res.status(400).json({ error: 'URL Cloudinary không được phép.' });
    }

    try {
      const upstream = await fetch(parsed.toString(), {
        redirect: 'manual',
        headers: { Accept: 'image/*,*/*;q=0.8' }
      });
      if (upstream.status >= 300 && upstream.status < 400) {
        return res.status(502).json({ error: 'Cloudinary chuyển hướng không được phép.' });
      }
      if (!upstream.ok) {
        return res.status(upstream.status === 404 ? 404 : 502).json({
          error: 'Không tải được ảnh Cloudinary.'
        });
      }
      const contentType = String(upstream.headers.get('content-type') || '').split(';')[0].trim();
      if (!contentType.startsWith('image/')) {
        return res.status(502).json({ error: 'Phản hồi Cloudinary không phải ảnh.' });
      }
      const buf = Buffer.from(await upstream.arrayBuffer());
      if (buf.length > 8 * 1024 * 1024) {
        return res.status(413).json({ error: 'Ảnh quá lớn.' });
      }
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.send(buf);
    } catch (err: any) {
      console.error('Cloudinary proxy error:', err);
      return res.status(502).json({ error: err.message || 'Lỗi tải ảnh Cloudinary.' });
    }
  });

  app.get('/api/bao-cao-nghiem-thu', async (req, res) => {
    if (!supabase) {
      return res.json({ reports: [], total: 0, source: 'local' });
    }

    try {
      const ngay = typeof req.query.ngay === 'string' ? req.query.ngay.trim() : '';
      const tuNgay = parseWarehouseSlipDate(req.query.tu_ngay ?? req.query.fromDate);
      const denNgay = parseWarehouseSlipDate(req.query.den_ngay ?? req.query.toDate);
      const limitRaw = typeof req.query.limit === 'string' ? Number(req.query.limit) : 0;
      const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 500) : 0;

      let query = supabase
        .from(SUPABASE_ACCEPTANCE_REPORTS_TABLE)
        .select('*')
        .order('created_at', { ascending: false, nullsFirst: false })
        .order('id', { ascending: false });

      if (ngay) {
        query = query.eq('ngay', ngay);
      } else {
        if (tuNgay) query = query.gte('ngay', tuNgay);
        if (denNgay) query = query.lte('ngay', denNgay);
      }
      if (limit && !ngay && !tuNgay && !denNgay) query = query.limit(limit);

      const { data, error } = await query;
      if (error) {
        return respondSupabaseReadError(res, error, SUPABASE_ACCEPTANCE_REPORTS_TABLE, { reports: [], total: 0 });
      }

      return res.json({ reports: data || [], total: data?.length || 0 });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi tải báo cáo sản lượng.' });
    }
  });

  app.post('/api/bao-cao-nghiem-thu', async (req, res) => {
    if (!supabase) {
      return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });
    }

    try {
      const parsed = parseAcceptanceReportBody(req.body);
      if ('error' in parsed) {
        return res.status(400).json({ error: parsed.error });
      }

      const { data, error } = await supabase
        .from(SUPABASE_ACCEPTANCE_REPORTS_TABLE)
        .insert(parsed.record)
        .select('*')
        .single();

      if (error) {
        console.error('Supabase acceptance report insert error:', error);
        return res.status(500).json({ error: acceptanceReportWriteError(error) });
      }

      return res.status(201).json({ success: true, report: data });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi lưu báo cáo sản lượng.' });
    }
  });

  app.post('/api/bao-cao-nghiem-thu/remap-shift', async (req, res) => {
    if (!supabase) {
      return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });
    }

    try {
      const fromShift = String(req.body?.from ?? req.body?.fromShift ?? 'HC1').trim();
      const toShift = String(req.body?.to ?? req.body?.toShift ?? '12C1').trim();

      if (!fromShift || !toShift) {
        return res.status(400).json({ error: 'Thiếu ca nguồn hoặc ca đích.' });
      }
      if (fromShift === toShift) {
        return res.status(400).json({ error: 'Ca nguồn và ca đích phải khác nhau.' });
      }

      const { data, error } = await supabase
        .from(SUPABASE_ACCEPTANCE_REPORTS_TABLE)
        .update({ ca: toShift })
        .eq('ca', fromShift)
        .select('id');

      if (error) {
        console.error('Supabase acceptance remap-shift error:', error);
        return res.status(500).json({ error: acceptanceReportWriteError(error) });
      }

      return res.json({
        success: true,
        from: fromShift,
        to: toShift,
        updated: Array.isArray(data) ? data.length : 0,
        mode: 'supabase'
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi đổi ca hàng loạt.' });
    }
  });

  app.patch('/api/bao-cao-nghiem-thu/:id', async (req, res) => {
    if (!supabase) {
      return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });
    }

    try {
      const id = String(req.params.id || '').trim();
      if (!id) return res.status(400).json({ error: 'Thiếu ID báo cáo.' });

      const parsed = parseAcceptanceReportBody(req.body);
      if ('error' in parsed) {
        return res.status(400).json({ error: parsed.error });
      }

      const { data, error } = await supabase
        .from(SUPABASE_ACCEPTANCE_REPORTS_TABLE)
        .update(parsed.record)
        .eq('id', id)
        .select('*')
        .single();

      if (error) {
        console.error('Supabase acceptance report update error:', error);
        return res.status(500).json({ error: acceptanceReportWriteError(error) });
      }

      if (!data) return res.status(404).json({ error: 'Không tìm thấy báo cáo.' });
      return res.json({ success: true, report: data });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi cập nhật báo cáo sản lượng.' });
    }
  });

  app.delete('/api/bao-cao-nghiem-thu/:id', async (req, res) => {
    if (!supabase) {
      return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });
    }

    try {
      const id = String(req.params.id || '').trim();
      if (!id) return res.status(400).json({ error: 'Thiếu ID báo cáo.' });

      const { data, error } = await supabase
        .from(SUPABASE_ACCEPTANCE_REPORTS_TABLE)
        .delete()
        .eq('id', id)
        .select('id')
        .single();

      if (error) {
        console.error('Supabase acceptance report delete error:', error);
        return res.status(500).json({ error: acceptanceReportWriteError(error) });
      }

      if (!data) return res.status(404).json({ error: 'Không tìm thấy báo cáo.' });
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi xóa báo cáo sản lượng.' });
    }
  });

  app.post('/api/bao-cao-nghiem-thu/bulk-delete', async (req, res) => {
    if (!supabase) {
      return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });
    }

    try {
      const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
      const idsRaw = Array.isArray(body.ids) ? body.ids : [];
      const ids = [...new Set(idsRaw.map(id => String(id || '').trim()).filter(Boolean))];
      if (ids.length === 0) {
        return res.status(400).json({ error: 'Thiếu danh sách ID báo cáo.' });
      }

      const { data, error } = await supabase
        .from(SUPABASE_ACCEPTANCE_REPORTS_TABLE)
        .delete()
        .in('id', ids)
        .select('id');

      if (error) {
        console.error('Supabase acceptance report bulk delete error:', error);
        return res.status(500).json({ error: acceptanceReportWriteError(error) });
      }

      const deleted = Array.isArray(data) ? data.length : 0;
      return res.json({ success: true, deleted });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi xóa nhiều báo cáo sản lượng.' });
    }
  });

  function acceptanceNvlDinhMucWriteError(error: { code?: string; message?: string }) {
    if (isMissingTableError(error)) {
      return `Bảng ${SUPABASE_ACCEPTANCE_NVL_DINH_MUC_TABLE} chưa tồn tại. Hãy chạy supabase-bao-cao-san-luong-nvl-dinh-muc.sql.`;
    }
    if (isMissingColumnError(error)) {
      return `Bảng ${SUPABASE_ACCEPTANCE_NVL_DINH_MUC_TABLE} đang thiếu cột (${error.message}). Hãy chạy supabase-bao-cao-san-luong-nvl-dinh-muc.sql.`;
    }
    return error.message || 'Lỗi khi ghi NVL định mức báo cáo sản lượng.';
  }

  function parseAcceptanceNvlDinhMucItem(raw: unknown, index: number) {
    if (!raw || typeof raw !== 'object') return null;
    const row = raw as Record<string, unknown>;
    const ma_nvl = String(row.ma_nvl ?? row.materialCode ?? row.code ?? '').trim();
    const ten_nvl = String(row.ten_nvl ?? row.materialName ?? row.name ?? '').trim();
    if (!ma_nvl && !ten_nvl) return null;
    const loaiRaw = String(row.loai_dinh_muc ?? row.amountType ?? 'quantity')
      .trim()
      .toLowerCase();
    const loai_dinh_muc = loaiRaw === 'percent' || loaiRaw === 'phan_tram' || loaiRaw === '%' ? 'percent' : 'quantity';
    const dinh_muc = parseAcceptanceNumber(row.dinh_muc ?? row.rate ?? row.percent ?? row.quantity);
    const so_luong_theo_sl = parseAcceptanceNumber(
      row.so_luong_theo_sl ?? row.quantityBySl ?? row.theo_sl
    );
    return {
      stt: Number.isFinite(Number(row.stt)) ? Number(row.stt) : index,
      ma_nvl,
      ten_nvl: ten_nvl || ma_nvl,
      don_vi: String(row.don_vi ?? row.unit ?? (loai_dinh_muc === 'percent' ? '%' : '')).trim(),
      loai_dinh_muc,
      dinh_muc,
      so_luong_theo_sl
    };
  }

  app.get('/api/bao-cao-san-luong-nvl-dinh-muc', async (req, res) => {
    if (!supabase) {
      return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });
    }
    try {
      const idBaoCao = String(req.query.id_bao_cao ?? req.query.idBaoCao ?? '').trim();
      const idsRaw = String(req.query.ids ?? req.query.id_bao_caos ?? '').trim();
      const ids = [
        ...new Set(
          (idsRaw
            ? idsRaw.split(/[,;\s]+/)
            : idBaoCao
              ? [idBaoCao]
              : []
          )
            .map(value => String(value || '').trim())
            .filter(Boolean)
        )
      ];
      if (ids.length === 0) {
        return res.status(400).json({ error: 'Thiếu id_bao_cao hoặc ids.' });
      }

      const { data, error } = await supabase
        .from(SUPABASE_ACCEPTANCE_NVL_DINH_MUC_TABLE)
        .select('*')
        .in('id_bao_cao_nghiem_thu', ids)
        .order('stt', { ascending: true });
      if (error) {
        console.error('Supabase bao_cao_san_luong_nvl_dinh_muc query error:', error);
        return res.status(500).json({ error: acceptanceNvlDinhMucWriteError(error) });
      }

      const items = data || [];
      if (ids.length === 1) {
        return res.json({ items, total: items.length });
      }

      const byId: Record<string, typeof items> = {};
      for (const id of ids) byId[id] = [];
      for (const row of items) {
        const reportId = String((row as { id_bao_cao_nghiem_thu?: string }).id_bao_cao_nghiem_thu || '').trim();
        if (!reportId) continue;
        if (!byId[reportId]) byId[reportId] = [];
        byId[reportId].push(row);
      }
      return res.json({ by_id: byId, items, total: items.length });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi tải NVL định mức.' });
    }
  });

  app.put('/api/bao-cao-san-luong-nvl-dinh-muc', async (req, res) => {
    if (!supabase) {
      return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });
    }
    try {
      const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
      const idBaoCao = String(body.id_bao_cao ?? body.idBaoCao ?? body.id_bao_cao_nghiem_thu ?? '').trim();
      if (!idBaoCao) {
        return res.status(400).json({ error: 'Thiếu id_bao_cao.' });
      }
      const itemsRaw = Array.isArray(body.items) ? body.items : [];
      const items = itemsRaw
        .map((item, index) => parseAcceptanceNvlDinhMucItem(item, index))
        .filter((item): item is NonNullable<typeof item> => Boolean(item));

      const { data: report, error: reportError } = await supabase
        .from(SUPABASE_ACCEPTANCE_REPORTS_TABLE)
        .select('id')
        .eq('id', idBaoCao)
        .maybeSingle();
      if (reportError) {
        return res.status(500).json({ error: acceptanceReportWriteError(reportError) });
      }
      if (!report) {
        return res.status(404).json({ error: 'Không tìm thấy báo cáo sản lượng.' });
      }

      const { error: deleteError } = await supabase
        .from(SUPABASE_ACCEPTANCE_NVL_DINH_MUC_TABLE)
        .delete()
        .eq('id_bao_cao_nghiem_thu', idBaoCao);
      if (deleteError) {
        console.error('Supabase bao_cao_san_luong_nvl_dinh_muc delete error:', deleteError);
        return res.status(500).json({ error: acceptanceNvlDinhMucWriteError(deleteError) });
      }

      if (items.length === 0) {
        return res.json({ success: true, items: [], total: 0 });
      }

      const ma_sp = String(body.ma_sp ?? body.productCode ?? '').trim();
      const ten_sp = String(body.ten_sp ?? body.productName ?? '').trim();
      const so_luong_sp = parseAcceptanceNumber(body.so_luong_sp ?? body.productQuantity);
      const don_vi_sp = String(body.don_vi_sp ?? body.productUnit ?? '').trim() || null;

      const rows = items.map(item => ({
        id_bao_cao_nghiem_thu: idBaoCao,
        ma_sp,
        ten_sp,
        so_luong_sp,
        don_vi_sp,
        stt: item.stt,
        ma_nvl: item.ma_nvl,
        ten_nvl: item.ten_nvl,
        don_vi: item.don_vi,
        loai_dinh_muc: item.loai_dinh_muc,
        dinh_muc: item.dinh_muc,
        so_luong_theo_sl: item.so_luong_theo_sl
      }));

      const { data, error } = await supabase
        .from(SUPABASE_ACCEPTANCE_NVL_DINH_MUC_TABLE)
        .insert(rows)
        .select('*');
      if (error) {
        console.error('Supabase bao_cao_san_luong_nvl_dinh_muc insert error:', error);
        return res.status(500).json({ error: acceptanceNvlDinhMucWriteError(error) });
      }
      return res.json({ success: true, items: data || [], total: data?.length || 0 });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi khi lưu NVL định mức.' });
    }
  });

  // API Route: Reset database (optional/utility)
  app.post('/api/reports/reset', (req, res) => {
    try {
      if (fs.existsSync(DB_FILE_PATH)) {
        fs.unlinkSync(DB_FILE_PATH);
      }
      const seeded = getReportsFromDb();
      res.json({ message: 'Đã hoàn tác và tạo mới dữ liệu mẫu biên chế!', data: seeded });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Development / Production Environment routing integrations
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[API] Unhandled error:', err);
    if (!res.headersSent) {
      const message = err instanceof Error ? err.message : 'Lỗi server API.';
      res.status(500).json({ error: message });
    }
  });

  app.use('/api', (_req, res) => {
    res.status(404).json({
      error: 'API route không tồn tại. Hãy chạy npm run dev để khởi động lại server.'
    });
  });

  return app;
}

if (!process.env.VERCEL) {
  startServer();
}

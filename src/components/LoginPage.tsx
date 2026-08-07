import React, { useState } from 'react';
import { Eye, EyeOff, Loader2, Lock, User2, ShieldCheck } from 'lucide-react';
import { PRINT_COMPANY_NAME, vietNhatLogoUrl } from './layout/constants';
import { normalizeHrBranches } from '../features/_shared/hr';
import {
  PRIMARY_ADMIN_USERNAME
} from '../features/nhan-su/menuViews';
import { parsePermissionSettings, resolveLoginPermissions } from '../features/cai-dat-thoi-gian/permissionKeys';
import { grantResolvedAccess, type AuthUser } from '../app/authUser';

export type { AuthUser } from '../app/authUser';
export { grantResolvedAccess } from '../app/authUser';

const FALLBACK_ADMIN = {
  username: PRIMARY_ADMIN_USERNAME,
  password: '123456',
  name: 'Quản trị viên',
  role: 'Quản trị'
};

function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

export default function LoginPage({ onLogin }: { onLogin: (user: AuthUser) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const user = normalizeUsername(username);
    const pass = password.trim();

    if (!user || !pass) {
      setError('Vui lòng nhập tên đăng nhập và mật khẩu.');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      if (user === FALLBACK_ADMIN.username && pass === FALLBACK_ADMIN.password) {
        onLogin(grantResolvedAccess({
          id: 'admin',
          name: FALLBACK_ADMIN.name,
          username: FALLBACK_ADMIN.username,
          role: FALLBACK_ADMIN.role,
          viewPermissions: [],
          editPermissions: [],
          deletePermissions: []
        }));
        return;
      }

      const [staffRes, settingsRes] = await Promise.all([
        fetch('/api/nhan-su?format=groups&scope=all'),
        fetch('/api/cai-dat')
      ]);
      const staffData = await staffRes.json().catch(() => ({}));
      const settingsData = await settingsRes.json().catch(() => ({}));
      if (!staffRes.ok) {
        throw new Error(staffData.error || 'Không thể kết nối máy chủ. Vui lòng thử lại.');
      }

      const members = normalizeHrBranches(staffData).flatMap(branch =>
        branch.departments.flatMap(department =>
          department.members.map(member => ({
            member,
            departmentName: department.name
          }))
        )
      );
      const permissionSettings = settingsRes.ok
        ? parsePermissionSettings(
            Array.isArray(settingsData.settings) ? (settingsData.settings as any[]).map(item => ({
              id: String(item?.id ?? ''),
              code: String(item?.ma_cai_dat ?? item?.code ?? ''),
              name: String(item?.ten_cai_dat ?? item?.ten ?? item?.name ?? ''),
              loaiCaiDat: String(item?.loai_cai_dat ?? item?.loai ?? ''),
              group: String(item?.nhom ?? item?.group ?? ''),
              note: String(item?.ghi_chu ?? item?.note ?? '')
            })) : []
          )
        : [];

      const matched = members.find(
        ({ member }) =>
          member.username &&
          member.password &&
          normalizeUsername(member.username) === user &&
          member.password.trim() === pass
      );

      if (!matched) {
        setError('Tên đăng nhập hoặc mật khẩu không đúng.');
        return;
      }

      const resolved = resolveLoginPermissions({
        permissionSettings,
        assignedPositions: matched.member.assignedPositions,
        departmentName: matched.departmentName,
        hrRoleOrPosition: matched.member.role || matched.member.position || '',
        memberViewPermissions: matched.member.viewPermissions || []
      });

      onLogin(grantResolvedAccess({
        id: matched.member.id,
        name: matched.member.name,
        username: matched.member.username || user,
        role: matched.member.role || 'Nhân sự',
        viewPermissions: resolved.viewPermissions,
        editPermissions: resolved.editPermissions,
        deletePermissions: resolved.deletePermissions
      }));
    } catch (err: any) {
      setError(err.message || 'Đăng nhập thất bại. Vui lòng thử lại.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-[100dvh] w-full bg-slate-100 font-sans text-slate-800">
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-gradient-to-br from-[#b30d1c] via-[#ef1b2d] to-[#7f0812] p-12 text-white lg:flex">
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-black/20 blur-3xl" />

        <div className="relative flex items-center gap-3">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/95 p-2 shadow-lg">
            <img src={vietNhatLogoUrl} alt={PRINT_COMPANY_NAME} className="h-full w-full object-contain" />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/70">Hệ thống quản trị</p>
            <p className="text-lg font-black leading-tight">{PRINT_COMPANY_NAME}</p>
          </div>
        </div>

        <div className="relative space-y-4">
          <h1 className="text-4xl font-black leading-tight">
            Quản lý sản xuất<br />thông minh & tập trung
          </h1>
          <p className="max-w-md text-sm font-medium leading-6 text-white/80">
            Theo dõi lệnh sản xuất, kế hoạch, phiếu cân, kho NVL và báo cáo sản lượng trên một nền tảng duy nhất.
          </p>
        </div>

        <div className="relative flex items-center gap-2 text-xs font-semibold text-white/70">
          <ShieldCheck className="h-4 w-4" />
          Kết nối bảo mật · Chỉ dành cho nhân sự nội bộ
        </div>
      </div>

      <div className="flex w-full items-center justify-center p-6 sm:p-10 lg:w-1/2">
        <div className="w-full max-w-md">
          <div className="mb-8 flex flex-col items-center text-center lg:hidden">
            <div className="mb-3 flex h-20 w-20 items-center justify-center rounded-2xl bg-white p-2.5 shadow-md">
              <img src={vietNhatLogoUrl} alt={PRINT_COMPANY_NAME} className="h-full w-full object-contain" />
            </div>
            <p className="text-sm font-black text-[#ef1b2d]">{PRINT_COMPANY_NAME}</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xl sm:p-8">
            <div className="mb-6">
              <h2 className="text-2xl font-black tracking-tight text-slate-900">Đăng nhập</h2>
              <p className="mt-1 text-sm font-medium text-slate-500">
                Nhập thông tin tài khoản để tiếp tục vào hệ thống.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <label className="block space-y-1.5">
                <span className="text-xs font-black uppercase tracking-wider text-slate-500">Tên đăng nhập</span>
                <div className="relative">
                  <User2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={username}
                    onChange={event => setUsername(event.target.value)}
                    autoComplete="username"
                    autoFocus
                    placeholder="Nhập tên đăng nhập"
                    className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-[#ef1b2d] focus:bg-white focus:ring-2 focus:ring-[#ef1b2d]/15"
                  />
                </div>
              </label>

              <label className="block space-y-1.5">
                <span className="text-xs font-black uppercase tracking-wider text-slate-500">Mật khẩu</span>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={password}
                    onChange={event => setPassword(event.target.value)}
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="Nhập mật khẩu"
                    className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-11 text-sm font-semibold text-slate-900 outline-none transition focus:border-[#ef1b2d] focus:bg-white focus:ring-2 focus:ring-[#ef1b2d]/15"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(prev => !prev)}
                    className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                    title={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </label>

              {error && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm font-semibold text-rose-700">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#ef1b2d] text-sm font-extrabold text-white shadow-sm transition hover:bg-[#b30d1c] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Đang đăng nhập...
                  </>
                ) : (
                  'Đăng nhập'
                )}
              </button>
            </form>
          </div>

          <p className="mt-6 text-center text-xs font-medium text-slate-400">
            © {new Date().getFullYear()} {PRINT_COMPANY_NAME}. Bảo lưu mọi quyền.
          </p>
        </div>
      </div>
    </div>
  );
}

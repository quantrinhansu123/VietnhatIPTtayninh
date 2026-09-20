import React, { useEffect, useState } from 'react';
import { ArrowRight, Eye, EyeOff, Loader2, Lock, User2 } from 'lucide-react';
import { normalizeHrBranches } from '../features/_shared/hr';
import {
  PRIMARY_ADMIN_USERNAME
} from '../features/nhan-su/menuViews';
import { parsePermissionSettings, resolveLoginPermissions } from '../features/cai-dat-thoi-gian/permissionKeys';
import { grantResolvedAccess, type AuthUser } from '../app/authUser';
import { PRINT_COMPANY_NAME, vietNhatLogoUrl } from './layout/constants';
import loginHeroUrl from '../assets/Loginimage.png';

export type { AuthUser } from '../app/authUser';
export { grantResolvedAccess } from '../app/authUser';

const FALLBACK_ADMIN = {
  username: PRIMARY_ADMIN_USERNAME,
  password: '123456',
  name: 'Quản trị viên',
  role: 'Quản trị'
};

const REMEMBER_USERNAME_KEY = 'vietnhat_login_remember_username_v1';

function normalizeUsername(value: string) {
  return String(value ?? '').trim().toLowerCase();
}

export default function LoginPage({ onLogin }: { onLogin: (user: AuthUser) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    try {
      const saved = localStorage.getItem(REMEMBER_USERNAME_KEY);
      if (saved) {
        setUsername(saved);
        setRememberMe(true);
      }
    } catch {
      /* ignore */
    }
  }, []);

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
      try {
        if (rememberMe) {
          localStorage.setItem(REMEMBER_USERNAME_KEY, username.trim());
        } else {
          localStorage.removeItem(REMEMBER_USERNAME_KEY);
        }
      } catch {
        /* ignore */
      }

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
    <div className="flex min-h-[100dvh] w-full font-sans text-white">
      {/* Left — brand / factory visual */}
      <section className="relative hidden min-h-[100dvh] w-[58%] overflow-hidden lg:block">
        <img
          src={loginHeroUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/55 via-black/35 to-black/20" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/30" />

        <div className="relative z-10 flex h-full flex-col justify-end p-10 xl:p-14">
          <div className="mb-[18%] ml-auto max-w-xs space-y-5 text-right">
            <p className="text-[11px] font-bold uppercase leading-relaxed tracking-[0.08em] text-zinc-900">
              Chất lượng tạo nên giá trị bền vững
              <span className="mt-1.5 ml-auto block h-0.5 w-28 bg-[#e11d2e]" />
            </p>
            <p className="text-[11px] font-bold uppercase leading-relaxed tracking-[0.08em] text-zinc-900">
              An toàn hiệu quả phát triển
              <span className="mt-1.5 ml-auto block h-0.5 w-28 bg-[#e11d2e]" />
            </p>
          </div>
        </div>
      </section>

      {/* Right — login form */}
      <section className="flex min-h-[100dvh] w-full flex-col justify-center bg-[#121212] px-6 py-10 sm:px-10 lg:w-[42%] lg:px-12 xl:px-16">
        <div className="mx-auto w-full max-w-[380px]">
          <div className="mb-8 flex flex-col items-center text-center">
            <div className="mb-6 flex h-28 w-44 items-center justify-center sm:h-32 sm:w-52">
              <img
                src={vietNhatLogoUrl}
                alt={PRINT_COMPANY_NAME}
                className="h-full w-full object-contain"
              />
            </div>
            <h2 className="text-3xl font-black tracking-tight text-white">Đăng nhập</h2>
            <p className="mt-1.5 text-sm font-medium text-zinc-400">Chào mừng bạn trở lại</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <label className="block space-y-2">
              <span className="text-sm font-semibold text-zinc-300">Tên đăng nhập</span>
              <div className="relative">
                <User2 className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                <input
                  value={username}
                  onChange={event => setUsername(event.target.value)}
                  autoComplete="username"
                  autoFocus
                  placeholder="Nhập tên đăng nhập"
                  className="h-12 w-full rounded-lg border border-zinc-700 bg-[#1a1a1a] pl-11 pr-3 text-sm font-medium text-white outline-none transition placeholder:text-zinc-500 focus:border-[#e11d2e] focus:ring-1 focus:ring-[#e11d2e]/40"
                />
              </div>
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-semibold text-zinc-300">Mật khẩu</span>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                <input
                  value={password}
                  onChange={event => setPassword(event.target.value)}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="Nhập mật khẩu"
                  className="h-12 w-full rounded-lg border border-zinc-700 bg-[#1a1a1a] pl-11 pr-11 text-sm font-medium text-white outline-none transition placeholder:text-zinc-500 focus:border-[#e11d2e] focus:ring-1 focus:ring-[#e11d2e]/40"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(prev => !prev)}
                  className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-zinc-500 transition hover:text-zinc-300"
                  title={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </label>

            <div className="flex items-center justify-between gap-3 pt-0.5">
              <label className="inline-flex cursor-pointer items-center gap-2.5 select-none">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={event => setRememberMe(event.target.checked)}
                  className="peer sr-only"
                />
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition ${
                    rememberMe
                      ? 'border-[#e11d2e] bg-[#e11d2e]'
                      : 'border-zinc-600 bg-transparent'
                  }`}
                >
                  {rememberMe && (
                    <svg viewBox="0 0 12 12" className="h-2.5 w-2.5 text-white" fill="none" aria-hidden>
                      <path d="M2 6.2 4.6 9 10 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
                <span className="text-sm font-medium text-zinc-300">Ghi nhớ đăng nhập</span>
              </label>

              <button
                type="button"
                onClick={() => setError('Liên hệ quản trị viên để đặt lại mật khẩu.')}
                className="text-sm font-semibold text-[#e11d2e] transition hover:text-[#ff4d5a]"
              >
                Quên mật khẩu?
              </button>
            </div>

            {error && (
              <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3.5 py-2.5 text-sm font-semibold text-rose-300">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#e11d2e] text-sm font-extrabold uppercase tracking-wide text-white shadow-[0_8px_24px_rgba(225,29,46,0.35)] transition hover:bg-[#c41020] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Đang đăng nhập...
                </>
              ) : (
                <>
                  Đăng nhập
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          <div className="mt-10 flex items-center gap-4">
            <div className="h-px flex-1 bg-zinc-800" />
            <p className="shrink-0 text-xs font-medium text-zinc-500">Dành cho nhân viên nhà máy</p>
            <div className="h-px flex-1 bg-zinc-800" />
          </div>
        </div>
      </section>
    </div>
  );
}

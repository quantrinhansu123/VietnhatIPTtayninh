import React from 'react';

/** Viền trắng giúp chữ nổi trên nền ảnh Kaizen. */
const kaizenTextOutline: React.CSSProperties = {
  WebkitTextStroke: '2px #fff',
  paintOrder: 'stroke fill',
  textShadow:
    '0 0 3px #fff, 2px 0 0 #fff, -2px 0 0 #fff, 0 2px 0 #fff, 0 -2px 0 #fff, 2px 2px 0 #fff, -2px -2px 0 #fff, 2px -2px 0 #fff, -2px 2px 0 #fff',
};

/** Minh họa Kaizen: trước lộn xộn → sau gọn gàng, chỉnh chu. */
function KaizenIllustration({ className }: { className: string }) {
  return (
    <svg
      role="img"
      aria-label="Trước: lộn xộn — Sau: gọn gàng, chỉnh chu"
      viewBox="0 0 340 180"
      className={className}
    >
      <defs>
        <linearGradient id="kz-neat" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f87171" />
          <stop offset="1" stopColor="#e30613" />
        </linearGradient>
      </defs>
      {/* TRƯỚC — lộn xộn */}
      <rect x="4" y="22" width="148" height="146" rx="14" fill="#f1f5f9" stroke="#cbd5e1" strokeWidth="2" />
      <g fill="#94a3b8" opacity="0.85">
        <rect x="20" y="48" width="34" height="26" rx="3" transform="rotate(-18 37 61)" />
        <rect x="64" y="40" width="28" height="36" rx="3" transform="rotate(24 78 58)" fill="#64748b" />
        <rect x="104" y="62" width="32" height="24" rx="3" transform="rotate(-8 120 74)" />
        <rect x="30" y="92" width="38" height="22" rx="3" transform="rotate(14 49 103)" fill="#64748b" />
        <rect x="82" y="100" width="26" height="34" rx="3" transform="rotate(-30 95 117)" />
        <rect x="116" y="112" width="28" height="28" rx="3" transform="rotate(38 130 126)" fill="#64748b" />
        <rect x="24" y="130" width="30" height="24" rx="3" transform="rotate(-6 39 142)" />
      </g>
      <path
        d="M14 60 C50 20 40 110 80 70 S130 30 140 96 S60 150 100 120 S20 90 70 150 S140 110 120 150"
        stroke="#475569" strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.7"
      />
      <path d="M10 100 C60 130 30 60 90 90 S150 140 144 60" stroke="#e30613" strokeWidth="1.6" fill="none" opacity="0.5" />
      <text x="78" y="14" textAnchor="middle" fontSize="12" fontWeight="800" fill="#64748b" letterSpacing="2">TRƯỚC</text>
      {/* mũi tên cải tiến */}
      <path d="M158 95 L180 95 M172 86 L181 95 L172 104" stroke="#e30613" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      {/* SAU — gọn gàng */}
      <rect x="188" y="22" width="148" height="146" rx="14" fill="#fff" stroke="#e30613" strokeWidth="2.5" />
      <g fill="url(#kz-neat)">
        {[0, 1, 2].map(row =>
          [0, 1, 2].map(col => (
            <rect key={`${row}-${col}`} x={204 + col * 42} y={40 + row * 38} width="34" height="28" rx="4" opacity={0.55 + (row + col) * 0.11} />
          ))
        )}
      </g>
      <path d="M206 158 H322" stroke="#e2e8f0" strokeWidth="2" strokeLinecap="round" />
      <circle cx="320" cy="30" r="11" fill="#16a34a" />
      <path d="M314.5 30.5 L318.5 34.5 L325.5 26" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <text x="262" y="14" textAnchor="middle" fontSize="12" fontWeight="800" fill="#e30613" letterSpacing="2">SAU</text>
    </svg>
  );
}

/** Slogan Kaizen dùng chung: bản đầy đủ ở trang chủ, bản gọn ở chân mọi trang còn lại. */
export function SloganBanner({ variant = 'full' }: { variant?: 'full' | 'compact' }) {
  if (variant === 'compact') {
    return (
      <div
        className="mx-auto mt-8 flex max-w-7xl flex-col items-center gap-4 border-t border-white/30 px-4 pb-5 pt-6 text-center md:flex-row md:justify-center md:gap-8"
        data-no-print
      >
        <KaizenIllustration className="h-28 w-auto shrink-0 sm:h-32 md:h-36" />
        <p
          className="max-w-4xl text-2xl font-extrabold italic leading-snug text-[#0a0a0a] sm:text-3xl md:text-4xl"
          style={{ fontFamily: '"Playfair Display", "Be Vietnam Pro", Georgia, serif', ...kaizenTextOutline }}
        >
          “Cứ bắt đầu để nó tồn tại trước,{' '}
          <span className="text-[#e30613]">rồi bền bỉ hoàn thiện từng ngày.</span>”
        </p>
        <span
          className="text-4xl font-black uppercase tracking-[0.18em] sm:text-5xl md:text-6xl"
          style={kaizenTextOutline}
        >
          <span className="text-[#0a0a0a]">Kai</span>
          <span className="text-[#e30613]">zen</span>
        </span>
      </div>
    );
  }

  return (
    <div data-no-print>
      <figure className="relative mx-auto flex max-w-6xl flex-col items-center gap-6 px-6 pb-6 text-center md:flex-row md:justify-center md:gap-10">
        <KaizenIllustration className="h-48 w-auto shrink-0 drop-shadow-sm sm:h-56 md:h-64" />
        <div className="relative min-w-0">
        <span
          aria-hidden
          className="pointer-events-none absolute -top-6 left-1/2 -translate-x-1/2 select-none font-serif text-8xl leading-none text-[#e30613]/15 md:text-9xl"
        >
          “
        </span>
        <blockquote
          className="relative text-4xl font-extrabold leading-snug tracking-normal text-[#0a0a0a] sm:text-5xl lg:whitespace-nowrap lg:text-6xl"
          style={{ fontFamily: '"Playfair Display", "Be Vietnam Pro", Georgia, serif', ...kaizenTextOutline }}
        >
          <span className="block italic">Cứ bắt đầu để nó tồn tại trước,</span>
          <span className="mt-1 block italic text-[#e30613] md:mt-2">
            rồi bền bỉ hoàn thiện từng ngày.
          </span>
        </blockquote>
        <div aria-hidden className="mx-auto mt-5 flex items-center justify-center gap-3">
          <span className="h-px w-16 bg-gradient-to-r from-transparent to-[#e30613]/60 md:w-28" />
          <span className="h-2 w-2 rotate-45 bg-[#e30613]" />
          <span className="h-px w-16 bg-gradient-to-l from-transparent to-[#e30613]/60 md:w-28" />
        </div>
        </div>
      </figure>
      <div className="mx-auto -mt-2 flex flex-col items-center px-4 pb-4 text-center">
        <p
          className="text-sm font-black uppercase tracking-[0.5em] text-[#0a0a0a] sm:text-base"
          style={kaizenTextOutline}
        >
          改善 · cải tiến liên tục
        </p>
        <h2
          className="mt-1 text-8xl font-black uppercase leading-none tracking-[0.1em] sm:text-9xl md:text-[7.5rem]"
          style={kaizenTextOutline}
        >
          <span className="text-[#0a0a0a]">Kai</span>
          <span className="text-[#e30613]">zen</span>
        </h2>
      </div>
    </div>
  );
}

import React from 'react';
import { vietNhatLogoUrl } from './constants';

export function VietNhatLogo({ className = '' }: { className?: string }) {
  return (
    <img
      src={vietNhatLogoUrl}
      alt="Công ty Việt Nhật - Phú Thọ"
      className={`brand-logo w-auto object-contain ${className}`}
    />
  );
}

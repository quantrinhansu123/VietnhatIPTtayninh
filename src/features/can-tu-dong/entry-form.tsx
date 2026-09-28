import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { DateInput } from '../../components/shared/DateInput';
import { fileToOptimizedImageDataUrl, uploadImage } from '../_shared/recordHelpers';
import { getProductionShiftOptions, normalizeShiftSettings } from '../../utils/shiftSettings';

type MachineOption = { id: string; label: string };

type PickedImage = { file: File; previewUrl: string };

function ScaleDemoImage({ caption }: { caption: string }) {
  return (
    <div className="flex h-44 w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 text-zinc-400">
      <svg viewBox="0 0 160 90" className="h-24 w-40" aria-hidden="true">
        <rect x="18" y="8" width="124" height="74" rx="8" fill="#e4e4e7" stroke="#a1a1aa" />
        <rect x="28" y="18" width="104" height="36" rx="4" fill="#fafafa" stroke="#71717a" />
        <text x="80" y="42" textAnchor="middle" fontSize="16" fontWeight="700" fill="#3f3f46">
          0.00
        </text>
        <rect x="48" y="62" width="64" height="8" rx="2" fill="#d4d4d8" />
      </svg>
      <span className="text-[11px] font-bold uppercase tracking-wide">{caption}</span>
    </div>
  );
}

function ImagePickRow({
  label,
  demoLabel,
  picked,
  onPick
}: {
  label: string;
  demoLabel: string;
  picked: PickedImage | null;
  onPick: (file: File | undefined) => void;
}) {
  return (
    <label className="block sm:col-span-2">
      <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">{label}</span>
      <input
        type="file"
        accept="image/*"
        capture="environment"
        onChange={event => {
          onPick(event.target.files?.[0]);
          event.target.value = '';
        }}
        className="mt-1 block w-full text-sm font-semibold text-zinc-700 file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-100 file:px-3 file:py-2"
      />
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <ScaleDemoImage caption={demoLabel} />
        {picked ? (
          <img src={picked.previewUrl} alt={label} className="h-44 w-full rounded-xl border border-zinc-200 bg-zinc-50 object-contain" />
        ) : (
          <div className="flex h-44 w-full items-center justify-center rounded-xl border border-dashed border-zinc-300 bg-white text-xs font-bold text-zinc-400">
            Ảnh đã chọn
          </div>
        )}
      </div>
    </label>
  );
}

function todayIso() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

export function CanTuDongEntryForm({
  onClose,
  variant = 'page',
  title = 'Trạm cân QR'
}: {
  onClose?: () => void;
  variant?: 'modal' | 'page';
  title?: string;
}) {
  const [ngay, setNgay] = useState(todayIso);
  const [ca, setCa] = useState('');
  const [may, setMay] = useState('');
  const [lenhSx, setLenhSx] = useState('');
  const [coreImage, setCoreImage] = useState<PickedImage | null>(null);
  const [productImage, setProductImage] = useState<PickedImage | null>(null);
  const [shifts, setShifts] = useState<Array<{ value: string; label: string }>>([]);
  const [machines, setMachines] = useState<MachineOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedCount, setSavedCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/cai-dat');
        const data = await res.json().catch(() => ({}));
        if (!res.ok || cancelled) return;
        setShifts(getProductionShiftOptions(normalizeShiftSettings(data)));
      } catch {
        if (!cancelled) setShifts([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/danh-sach-may');
        const data = await res.json().catch(() => ({}));
        const records = Array.isArray(data?.machines) ? data.machines : [];
        if (!res.ok || cancelled) return;
        const options = records
          .map((record: unknown, index: number) => {
            if (!record || typeof record !== 'object') return null;
            const source = record as Record<string, unknown>;
            const name = String(source.ten_may ?? source.name ?? '').trim();
            const code = String(source.ma_may ?? source.code ?? '').trim();
            const label = name || code;
            if (!label) return null;
            return { id: String(source.id ?? code ?? name ?? index), label };
          })
          .filter((item): item is MachineOption => Boolean(item));
        setMachines(options);
      } catch {
        if (!cancelled) setMachines([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const machineLabels = useMemo(() => {
    const set = new Set(machines.map(item => item.label));
    if (may.trim()) set.add(may.trim());
    return [...set];
  }, [machines, may]);

  const pickImage = (file: File | undefined, current: PickedImage | null, setImage: (next: PickedImage | null) => void) => {
    if (current?.previewUrl) URL.revokeObjectURL(current.previewUrl);
    if (!file) {
      setImage(null);
      return;
    }
    setImage({ file, previewUrl: URL.createObjectURL(file) });
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (!coreImage && !productImage) {
      setError('Vui lòng chọn ít nhất một ảnh cân.');
      return;
    }
    setSaving(true);
    try {
      const uploadOne = async (picked: PickedImage | null) => {
        if (!picked) return { imageUrl: '', imagePublicId: '' };
        const dataUrl = await fileToOptimizedImageDataUrl(picked.file);
        return uploadImage(dataUrl, 'can_tu_dong');
      };
      const [core, product] = await Promise.all([uploadOne(coreImage), uploadOne(productImage)]);
      const response = await fetch('/api/can-tu-dong', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ngay,
          ca,
          may,
          lenh_sx: lenhSx.trim(),
          unit: 'kg',
          core_image_url: core.imageUrl,
          core_image_public_id: core.imagePublicId,
          product_image_url: product.imageUrl,
          product_image_public_id: product.imagePublicId
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String(data.error || 'Không ghi được dòng cân.'));
      }
      setSavedCount(count => count + 1);
      if (coreImage?.previewUrl) URL.revokeObjectURL(coreImage.previewUrl);
      if (productImage?.previewUrl) URL.revokeObjectURL(productImage.previewUrl);
      setCoreImage(null);
      setProductImage(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không ghi được dòng cân.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className={variant === 'modal' ? 'fixed inset-0 z-[100] bg-slate-50' : 'min-h-[70vh] bg-slate-50'}
      role={variant === 'modal' ? 'dialog' : undefined}
      aria-modal={variant === 'modal' ? true : undefined}
      aria-labelledby="can-tu-dong-entry-title"
    >
      <div className={variant === 'modal' ? 'flex h-dvh w-screen flex-col' : 'flex min-h-[70vh] w-full flex-col'}>
        <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
          <div>
            <h3 id="can-tu-dong-entry-title" className="font-display text-base font-bold text-slate-950">
              {title}
            </h3>
            <p className="text-xs font-semibold text-slate-500">Ghi thẳng vào danh sách cân AI</p>
          </div>
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="grid h-9 w-9 place-items-center rounded-lg text-slate-600 hover:bg-slate-100"
              aria-label="Đóng"
            >
              <X className="h-5 w-5" />
            </button>
          ) : (
            <span />
          )}
        </div>
        <form onSubmit={event => void submit(event)} className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 overflow-auto p-4">
          <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Ngày</span>
              <DateInput value={ngay} onChange={setNgay} />
            </label>
            <label className="block">
              <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Ca</span>
              <select
                value={ca}
                onChange={event => setCa(event.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-zinc-200 px-3 text-sm font-semibold text-zinc-900"
              >
                <option value="">—</option>
                {shifts.map(item => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Máy</span>
              <select
                value={may}
                onChange={event => setMay(event.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-zinc-200 px-3 text-sm font-semibold text-zinc-900"
              >
                <option value="">—</option>
                {machineLabels.map(label => (
                  <option key={label} value={label}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Lệnh SX</span>
              <input
                value={lenhSx}
                onChange={event => setLenhSx(event.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-zinc-200 px-3 text-sm font-semibold text-zinc-900"
              />
            </label>
            <ImagePickRow
              label="Ảnh cân lõi"
              demoLabel="Ảnh mẫu · cân lõi"
              picked={coreImage}
              onPick={file => pickImage(file, coreImage, setCoreImage)}
            />
            <ImagePickRow
              label="Ảnh cân sản phẩm"
              demoLabel="Ảnh mẫu · cân sản phẩm"
              picked={productImage}
              onPick={file => pickImage(file, productImage, setProductImage)}
            />
          </div>
          {error ? (
            <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{error}</p>
          ) : null}
          {savedCount > 0 ? (
            <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">
              Đã lưu {savedCount} dòng và ảnh lên Cloudinary. Số cân điền sau trên danh sách cân AI.
            </p>
          ) : null}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-zinc-950 px-5 text-sm font-extrabold text-white hover:bg-zinc-800 disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {saving ? 'Đang tải ảnh...' : 'Lưu ảnh và ghi dòng'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

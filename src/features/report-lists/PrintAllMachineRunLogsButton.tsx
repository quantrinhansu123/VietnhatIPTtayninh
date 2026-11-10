import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Printer } from 'lucide-react';
import {
  filterMachineRunLogs,
  groupedPrintSlips,
  normalizeMachineRunLogs,
  type MachineRunLogFilters
} from '../../components/MachineRunLogPanel';
import {
  MachineRunLogPrintBatch,
  type MachineRunLogPrintSlip
} from '../../components/MachineRunLogPrintSheet';
import { waitForPrintImagesReady } from '../../utils/printReady';

/**
 * Nút "In tổng báo cáo" ở thanh đầu hub Xem báo cáo:
 * in toàn bộ nhật ký chạy máy theo bộ lọc chung (ngày · ca · máy · tìm kiếm),
 * gom theo ngày/ca, mỗi nhật ký theo mẫu in nhật ký hiện có.
 */
export default function PrintAllMachineRunLogsButton({ filters }: { filters: MachineRunLogFilters }) {
  const [slips, setSlips] = useState<MachineRunLogPrintSlip[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (slips.length === 0) return;
    document.body.classList.add('production-order-print-active');
    let cancelled = false;
    const timer = window.setTimeout(() => {
      waitForPrintImagesReady().then(() => {
        if (!cancelled) window.print();
      });
    }, 150);
    const handleAfterPrint = () => setSlips([]);
    window.addEventListener('afterprint', handleAfterPrint);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.removeEventListener('afterprint', handleAfterPrint);
      document.body.classList.remove('production-order-print-active');
    };
  }, [slips]);

  const handleClick = async () => {
    setError('');
    setIsLoading(true);
    try {
      const res = await fetch('/api/nhat-ky-chay-may?limit=300');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string })?.error || 'Không tải được nhật ký.');
      const filtered = filterMachineRunLogs(normalizeMachineRunLogs(data), filters);
      if (filtered.length === 0) {
        setError('Không có nhật ký chạy máy nào theo bộ lọc hiện tại.');
        return;
      }
      setSlips(groupedPrintSlips(filtered));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể in tổng báo cáo.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {slips.length > 0 && typeof document !== 'undefined'
        ? createPortal(<MachineRunLogPrintBatch slips={slips} />, document.body)
        : null}
      <button
        type="button"
        onClick={() => void handleClick()}
        disabled={isLoading}
        title={error || 'In tổng báo cáo nhật ký chạy máy theo bộ lọc hiện tại'}
        className={`inline-flex h-7 items-center gap-1 rounded-md border bg-white px-2 text-[10px] font-bold transition hover:bg-zinc-50 disabled:opacity-60 ${
          error ? 'border-red-300 text-red-600' : 'border-zinc-200 text-zinc-700'
        }`}
      >
        {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5" />}
        {error ? 'Không có dữ liệu' : 'In tổng báo cáo'}
      </button>
    </>
  );
}

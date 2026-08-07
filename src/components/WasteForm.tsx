import React from 'react';
import { Trash2, FileText, AlertTriangle, MessageSquareCode } from 'lucide-react';

interface WasteFormProps {
  wasteWeight: number;
  notes: string;
  onChange: (updates: { wasteWeight?: number; notes?: string }) => void;
}

export default function WasteForm({ wasteWeight, notes, onChange }: WasteFormProps) {
  return (
    <div className="space-y-6" id="waste-entry-section">
      <div className="border-b border-slate-100 pb-3">
        <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
          <Trash2 className="w-5 h-5 text-emerald-600" />
          Phế Phẩm & Nhật Ký Ca Trực
        </h3>
        <p className="text-xs text-slate-500 mt-0.5">Khai báo khối lượng phế phẩm phát sinh trong ca và ghi chú bất thường</p>
      </div>

      {/* Khối Lượng Phế Phẩm */}
      <div className="space-y-4 bg-rose-50/20 border border-rose-100/50 p-4 rounded-2xl">
        <div className="space-y-2">
          <label className="block text-sm font-bold text-slate-700 flex items-center gap-1.5" htmlFor="wasteWeight">
            <Trash2 className="w-4 h-4 text-rose-500" />
            Khối Lượng Phế Phẩm <span className="text-rose-500">*</span>
          </label>
          <div className="relative">
            <input
              type="number"
              inputMode="decimal"
              id="wasteWeight"
              min="0"
              step="0.1"
              value={wasteWeight || ''}
              className="w-full h-12 px-3.5 pr-12 bg-white border border-rose-200 focus:border-rose-500 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500/10 text-slate-800 text-base font-bold transition"
              placeholder="0.0"
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                onChange({ wasteWeight: isNaN(val) ? 0 : val });
              }}
              style={{ minHeight: '44px' }}
            />
            <div className="absolute inset-y-0 right-3.5 flex items-center pointer-events-none text-sm font-semibold text-rose-500">
              kg
            </div>
          </div>
          <p className="text-xs text-slate-500 font-medium">
            Bao gồm nhựa cháy đầu đùn, biên cắt bọc hỏng, cuộn bavia thừa, nổ bong bóng khí khi sấy đùi...
          </p>
        </div>

        {wasteWeight > 10 && (
          <div className="p-3 bg-amber-50 rounded-xl border border-amber-200/50 flex gap-2 text-xs text-amber-800 font-medium leading-relaxed">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <span>
              <strong>Cảnh báo phế phẩm cao:</strong> Khối lượng phế phẩm vượt quá 10kg có thể ảnh hưởng lớn đến hiệu suất định mức của phân xưởng Đà Nẵng. Hãy ghi rõ nguyên nhân lỗi ở khung ghi chú bên dưới!
            </span>
          </div>
        )}
      </div>

      {/* Nhật Ký Ca Máy / Ghi Chú */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-slate-700 flex items-center gap-1.5" htmlFor="notes">
          <FileText className="w-4 h-4 text-slate-400" />
          Nhật Ký Ca / Ghi Chú Chi Tiết
        </label>
        <textarea
          id="notes"
          rows={3}
          maxLength={400}
          className="w-full p-3.5 bg-slate-50 focus:bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-800 text-sm font-medium transition placeholder:text-slate-400 leading-relaxed resize-none"
          placeholder="Ví dụ: Thay lưới lọc ở đầu ca trực lúc 10h. Máy chạy êm. Khổ PE mỏng kéo phồng bọc tốt..."
          value={notes}
          onChange={(e) => onChange({ notes: e.target.value })}
        />
        <div className="flex justify-between items-center text-[10px] font-semibold text-slate-400">
          <span className="flex items-center gap-1">
            <MessageSquareCode className="w-3.5 h-3.5" />
            Vận hành viên hỗ trợ ghi tiếng Việt rõ chữ
          </span>
          <span>{notes.length}/400 kí tự</span>
        </div>
      </div>
    </div>
  );
}

import React from 'react';

export const CAN_TU_DONG_PILOT_URL = 'https://tram-can-qr-pilot-0wrt.onrender.com/';
export const CAN_KIEM_KHO_PILOT_URL = 'https://tram-can-qr-pilot-0wrt.onrender.com/kiem-kho';

/** Trạm cân QR / Cân kiểm kho — nhúng trong trang, không mở tab mới. */
export function CanTuDongPilotPanel({
  src = CAN_TU_DONG_PILOT_URL,
  title = 'Trạm cân QR'
}: {
  src?: string;
  title?: string;
}) {
  return (
    <div className="flex h-[calc(100vh-7rem)] min-h-[28rem] w-full min-w-0 flex-col overflow-hidden rounded-2xl border-2 border-zinc-900/10 bg-white shadow-sm">
      <iframe
        title={title}
        src={src}
        className="h-full w-full flex-1 border-0 bg-white"
        referrerPolicy="no-referrer-when-downgrade"
        allow="camera; microphone; clipboard-read; clipboard-write"
      />
    </div>
  );
}

export function CanKiemKhoPilotPanel() {
  return <CanTuDongPilotPanel src={CAN_KIEM_KHO_PILOT_URL} title="Cân kiểm kho" />;
}

export default CanTuDongPilotPanel;

import React from 'react';

export const CAN_TU_DONG_PILOT_URL = 'https://tram-can-qr-pilot.onrender.com/';

/** Trạm cân QR pilot — nhúng trong trang, không mở tab mới. */
export function CanTuDongPilotPanel() {
  return (
    <div className="flex h-[calc(100vh-7rem)] min-h-[28rem] w-full min-w-0 flex-col overflow-hidden rounded-2xl border-2 border-zinc-900/10 bg-white shadow-sm">
      <iframe
        title="Trạm cân QR"
        src={CAN_TU_DONG_PILOT_URL}
        className="h-full w-full flex-1 border-0 bg-white"
        referrerPolicy="no-referrer-when-downgrade"
        allow="camera; microphone; clipboard-read; clipboard-write"
      />
    </div>
  );
}

export default CanTuDongPilotPanel;

import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Html5Qrcode as Html5QrcodeInstance } from 'html5-qrcode';
import { ScanBarcode, X } from 'lucide-react';

/**
 * html5-qrcode là thư viện decode khá nặng (kèm engine zxing). Chỉ tải nó khi thực sự bật
 * camera để giảm dung lượng bundle/RAM lúc khởi động trên máy cấu hình thấp (VD BT-A700).
 */
let html5QrcodeModulePromise: Promise<typeof import('html5-qrcode')> | null = null;
function loadHtml5Qrcode() {
  if (!html5QrcodeModulePromise) {
    html5QrcodeModulePromise = import('html5-qrcode');
  }
  return html5QrcodeModulePromise;
}

type CameraDevice = { id: string; label: string };
type Html5QrcodeStatic = { getCameras: () => Promise<CameraDevice[]> };

const CAMERA_PREF_KEY = 'productQrScanner.cameraEnabled';

function loadCameraPreference(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const stored = window.localStorage.getItem(CAMERA_PREF_KEY);
    return stored === null ? true : stored === '1';
  } catch {
    return true;
  }
}

function saveCameraPreference(enabled: boolean) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CAMERA_PREF_KEY, enabled ? '1' : '0');
  } catch {
    // Bỏ qua (chế độ ẩn danh / storage đầy) — chỉ mất phần nhớ tuỳ chọn, không ảnh hưởng chức năng.
  }
}

interface ProductQrScannerProps {
  open: boolean;
  onClose: () => void;
  onScan: (value: string) => boolean | 'duplicate' | void;
  hardwareOnly?: boolean;
  closeAfterScan?: boolean;
  requireConfirm?: boolean;
  getConfirmMessage?: (code: string) => string;
  /** Tổng số mã đã quét thành công trong danh sách hiện tại; nếu bỏ trống sẽ đếm trong phiên mở scanner. */
  scannedCount?: number;
}

type ScanFeedback = {
  type: 'success' | 'duplicate' | 'error' | 'pending';
  text: string;
};

type PendingScan = {
  raw: string;
  code: string;
};

function isAppleMobile() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/iPhone|iPad|iPod/i.test(ua)) return true;
  // iPadOS 13+ có thể báo MacIntel nhưng có touch
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
}

function sleep(ms: number) {
  return new Promise<void>(resolve => {
    window.setTimeout(resolve, ms);
  });
}

/** Phát tiếng "tích" ngắn khi quét thành công — không cần file audio, dùng thẳng Web Audio API. */
function playScanBeep(ctx: AudioContext | null) {
  if (!ctx) return;
  try {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'square';
    oscillator.frequency.value = 1800;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.13);
  } catch {
    // Bỏ qua nếu trình duyệt chặn audio.
  }
}

/** Trả focus về ô nhập mã sau khi DOM/portal đã gắn xong, để đầu đọc laser (keyboard wedge) có nơi "gõ" mã vào mà không cần chạm tay. */
function hideVirtualKeyboard() {
  try {
    (navigator as Navigator & { virtualKeyboard?: { hide?: () => void } }).virtualKeyboard?.hide?.();
  } catch {
    // Trình duyệt không hỗ trợ VirtualKeyboard API — bỏ qua để không cản InputConnection của BT-A700.
  }
}

function focusManualInput(ref: React.RefObject<HTMLInputElement>) {
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      ref.current?.focus({ preventScroll: true });
      hideVirtualKeyboard();
    });
  });
}

/** iOS cần xin quyền trước rồi mới enumerate được camera ổn định. */
async function ensureCameraPermission() {
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    throw new Error(
      'Camera trên iPhone cần HTTPS (hoặc localhost). Đang mở bằng HTTP LAN nên Safari chặn camera.'
    );
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Trình duyệt không hỗ trợ camera.');
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: { ideal: 'environment' } }
  });
  stream.getTracks().forEach(track => track.stop());
}

/**
 * QUAN TRỌNG: html5-qrcode's `start(cameraIdOrConfig, ...)` chỉ chấp nhận một device id dạng
 * string, HOẶC một object đúng 1 key (`{ facingMode }` hoặc `{ deviceId }`) — object có thêm
 * width/height sẽ bị nó throw "should have exactly 1 key" và camera không mở được. Độ phân giải
 * phải giới hạn SAU khi start() thành công, qua applyVideoConstraints() (xem sau scanner.start()).
 */
async function pickCameraConfig(Html5QrcodeCtor: Html5QrcodeStatic): Promise<string | MediaTrackConstraints> {
  try {
    await ensureCameraPermission();
  } catch (err) {
    // Vẫn thử facingMode — một số máy sẽ hiện prompt khi start().
    if (err instanceof Error && /HTTPS|localhost|không hỗ trợ/i.test(err.message)) {
      throw err;
    }
  }

  // Trên iPhone, facingMode ổn định hơn deviceId (label camera thường trống).
  if (isAppleMobile()) {
    return { facingMode: 'environment' };
  }

  try {
    const cameras = await Html5QrcodeCtor.getCameras();
    if (!cameras?.length) {
      return { facingMode: 'environment' };
    }

    const backCamera = cameras.find(camera => /back|rear|environment|sau/i.test(camera.label));
    if (backCamera) return backCamera.id;

    const frontCamera = cameras.find(camera => /front|user|facetime|trước/i.test(camera.label));
    if (frontCamera && cameras.length > 1) {
      const other = cameras.find(camera => camera.id !== frontCamera.id);
      if (other) return other.id;
    }

    return cameras[cameras.length - 1].id;
  } catch {
    return { facingMode: 'environment' };
  }
}

/** Giới hạn độ phân giải khung hình sau khi stream đã chạy, để đỡ tải CPU decode trên máy cấu hình thấp. */
async function applyLowPowerResolution(scanner: Html5QrcodeInstance) {
  try {
    await scanner.applyVideoConstraints({ width: { ideal: 640 }, height: { ideal: 480 } });
  } catch {
    // Một số camera/trình duyệt không cho đổi constraint sau khi start — bỏ qua, vẫn quét bình thường.
  }
}

function buildScannerConfig() {
  const apple = isAppleMobile();
  return {
    // fps thấp giúp đỡ tải CPU decode — quan trọng với máy cấu hình thấp (VD BT-A700).
    fps: apple ? 8 : 10,
    // aspectRatio 16:9 hay làm camera/portrait iPhone dừng quét
    ...(apple ? {} : { aspectRatio: 16 / 9 }),
    qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
      if (apple) {
        // Khung vuông — QR/barcode trên iPhone nhận tốt hơn
        const size = Math.floor(Math.min(viewfinderWidth, viewfinderHeight) * 0.72);
        const clamped = Math.max(160, Math.min(size, 280));
        return { width: clamped, height: clamped };
      }
      const width = Math.floor(Math.min(viewfinderWidth * 0.9, 420));
      const height = Math.floor(Math.min(viewfinderHeight * 0.62, width, 240));
      return {
        width: Math.max(140, width),
        height: Math.max(120, height)
      };
    }
  };
}

async function stopScannerSafely(scanner: Html5QrcodeInstance | null) {
  if (!scanner) return;
  try {
    await scanner.stop();
  } catch {
    // Scanner có thể chưa khởi động xong hoặc đã dừng.
  }
}

async function improveIosFocus(scanner: Html5QrcodeInstance) {
  if (!isAppleMobile()) return;
  try {
    await sleep(800);
    await scanner.applyVideoConstraints({
      advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet]
    });
  } catch {
    // Một số máy không hỗ trợ focusMode — bỏ qua.
  }
}

function parseQrProductCode(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  // Legacy: MãSP+LSX...
  const plusIdx = trimmed.indexOf('+');
  if (plusIdx > 0) return trimmed.slice(0, plusIdx).trim();
  // Tem thực tế: MãSP-ddmmyy + serial random (vd MT- MN009-3107263087).
  // Vẫn nhận dấu _ để tương thích với các tem đã tạo trước đây.
  const serialMatch = trimmed.match(/^(.+)[_-](\d{6})([0-9A-Za-z]{2,})$/);
  if (serialMatch?.[1]) return serialMatch[1].trim();
  return trimmed;
}

export default function ProductQrScanner({
  open,
  onClose,
  onScan,
  hardwareOnly = false,
  closeAfterScan = false,
  requireConfirm = true,
  getConfirmMessage,
  scannedCount
}: ProductQrScannerProps) {
  const reactId = useId();
  const regionId = `product-qr-${reactId.replace(/:/g, '')}`;
  const scannerRef = useRef<Html5QrcodeInstance | null>(null);
  const manualInputRef = useRef<HTMLInputElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const autoSubmitTimerRef = useRef<number | null>(null);
  const hardwareScanTimerRef = useRef<number | null>(null);
  const hardwareScanBufferRef = useRef('');
  const hardwareScanLastKeyAtRef = useRef(0);
  const onCloseRef = useRef(onClose);
  const onScanRef = useRef(onScan);
  const getConfirmMessageRef = useRef(getConfirmMessage);
  const lastScanRef = useRef({ value: '', time: 0 });
  const [error, setError] = useState('');
  const [manualCode, setManualCode] = useState('');
  const [isStarting, setIsStarting] = useState(false);
  const [feedback, setFeedback] = useState<ScanFeedback | null>(null);
  const [feedbackPulse, setFeedbackPulse] = useState(0);
  const [pendingScan, setPendingScan] = useState<PendingScan | null>(null);
  const [lastScannedValue, setLastScannedValue] = useState('');
  const [sessionScannedCount, setSessionScannedCount] = useState(0);
  const [cameraEnabled, setCameraEnabled] = useState(loadCameraPreference);
  const useCamera = !hardwareOnly && cameraEnabled;
  const displayedScannedCount = Math.max(0, Math.trunc(scannedCount ?? sessionScannedCount));

  const clearAutoSubmitTimer = () => {
    if (autoSubmitTimerRef.current !== null) {
      window.clearTimeout(autoSubmitTimerRef.current);
      autoSubmitTimerRef.current = null;
    }
  };

  /** Khởi tạo/mở khoá AudioContext trong lúc bấm nút mở scanner (user gesture) để phát beep được ngay khi quét. */
  const ensureAudioContext = () => {
    if (typeof window === 'undefined') return null;
    const AudioContextCtor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return null;
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContextCtor();
    }
    if (audioCtxRef.current.state === 'suspended') {
      void audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  };

  const toggleCameraEnabled = () => {
    setCameraEnabled(prev => {
      const next = !prev;
      saveCameraPreference(next);
      return next;
    });
  };

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    getConfirmMessageRef.current = getConfirmMessage;
  }, [getConfirmMessage]);

  useEffect(() => {
    if (!open) return;
    setSessionScannedCount(0);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  // Camera chạy nền tốn pin/CPU/RAM — tắt hẳn khi màn hình ẩn (khoá máy, chuyển app) thay vì
  // để nó tiếp tục decode trong nền, tránh dồn tải khiến máy cấu hình thấp bị treo/sập sau
  // một ca quét dài. Người dùng chỉ cần bấm "Quét QR" lại khi quay lại.
  useEffect(() => {
    if (!open) return;
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        onCloseRef.current();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [open]);

  const commitScanResult = (raw: string) => {
    const code = parseQrProductCode(raw);
    if (!code) {
      setFeedback({ type: 'error', text: 'Mã QR / mã vạch không hợp lệ.' });
      setFeedbackPulse(prev => prev + 1);
      return false;
    }

    const scanResult = onScanRef.current(raw);
    setFeedbackPulse(prev => prev + 1);

    if (scanResult === false) {
      setFeedback({ type: 'error', text: `Không thể thêm mã SP: ${code}` });
      return false;
    }

    if (scanResult === 'duplicate') {
      setFeedback({ type: 'duplicate', text: `Mã SP đã có — không tăng SL: ${code}` });
      return true;
    }

    playScanBeep(audioCtxRef.current);
    setSessionScannedCount(current => current + 1);
    setFeedback({ type: 'success', text: `Đã thêm mã SP: ${code}` });
    if (closeAfterScan) {
      void stopScannerSafely(scannerRef.current);
      onCloseRef.current();
    }
    return true;
  };

  const queueScanResult = (raw: string) => {
    // Hiển thị ngay dữ liệu thô thiết bị vừa gửi, độc lập với kết quả xử lý thành công/thất bại.
    setLastScannedValue(raw.trim() || '(không có dữ liệu)');
    const code = parseQrProductCode(raw);
    if (!code) {
      setFeedback({ type: 'error', text: 'Mã QR / mã vạch không hợp lệ.' });
      setFeedbackPulse(prev => prev + 1);
      return false;
    }

    if (requireConfirm) {
      setPendingScan({ raw, code });
      const hint = getConfirmMessageRef.current?.(code) ?? `Mã SP: ${code}`;
      setFeedback({ type: 'pending', text: hint });
      setFeedbackPulse(prev => prev + 1);
      return true;
    }

    return commitScanResult(raw);
  };

  const confirmPendingScan = () => {
    if (!pendingScan) return;
    const { raw } = pendingScan;
    setPendingScan(null);
    lastScanRef.current = { value: '', time: 0 };
    commitScanResult(raw);
    focusManualInput(manualInputRef);
  };

  const cancelPendingScan = () => {
    setPendingScan(null);
    lastScanRef.current = { value: '', time: 0 };
    setFeedback(null);
    focusManualInput(manualInputRef);
  };

  const applyScanResult = (raw: string) => queueScanResult(raw);

  useEffect(() => {
    if (!open) {
      clearAutoSubmitTimer();
      setManualCode('');
      setError('');
      setFeedback(null);
      setFeedbackPulse(0);
      setPendingScan(null);
      setLastScannedValue('');
      return;
    }

    let cancelled = false;
    lastScanRef.current = { value: '', time: 0 };
    setError('');
    setFeedback(null);
    setFeedbackPulse(0);
    setPendingScan(null);
    setLastScannedValue('');
    ensureAudioContext();
    focusManualInput(manualInputRef);

    if (!useCamera) {
      // Camera tắt (máy cấu hình thấp / chỉ dùng đầu đọc laser): không chạm tới camera/thư
      // viện decode — không tốn CPU/RAM, chỉ chờ dữ liệu bắn ra từ máy quét laser.
      setIsStarting(false);
      return () => {
        cancelled = true;
      };
    }

    setIsStarting(true);

    const handleDecoded = (decodedText: string) => {
      const value = decodedText.trim();
      const now = Date.now();
      const lastScan = lastScanRef.current;
      if (!value) return;
      // Debounce dài hơn trên iOS vì cùng mã có thể fire liên tục
      const debounceMs = isAppleMobile() ? 1200 : 500;
      if (lastScan.value === value && now - lastScan.time < debounceMs) return;

      lastScanRef.current = { value, time: now };
      applyScanResult(value);
    };

    const startScanner = async () => {
      // Đợi DOM region gắn xong (portal + iOS layout)
      await new Promise<void>(resolve => {
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => resolve());
        });
      });
      if (cancelled) return;

      const region = document.getElementById(regionId);
      if (!region) {
        if (!cancelled) {
          setIsStarting(false);
          setError('Không tìm thấy khung camera. Thử đóng và mở lại.');
        }
        return;
      }

      // iOS: chờ region có kích thước thật trước khi start
      if (isAppleMobile()) {
        for (let i = 0; i < 8; i += 1) {
          if (region.clientWidth > 40 && region.clientHeight > 40) break;
          await sleep(50);
        }
      }

      const { Html5Qrcode, Html5QrcodeSupportedFormats } = await loadHtml5Qrcode();
      if (cancelled) return;

      const supportedProductCodeFormats = [
        Html5QrcodeSupportedFormats.QR_CODE,
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.EAN_8,
        Html5QrcodeSupportedFormats.CODE_128,
        Html5QrcodeSupportedFormats.CODE_39,
        Html5QrcodeSupportedFormats.UPC_A,
        Html5QrcodeSupportedFormats.UPC_E
      ];

      const scanner = new Html5Qrcode(regionId, {
        verbose: false,
        formatsToSupport: supportedProductCodeFormats,
        // Safari BarcodeDetector thường experimental / không ổn → tắt trên iPhone
        useBarCodeDetectorIfSupported: !isAppleMobile()
      });
      scannerRef.current = scanner;

      let preferred: string | MediaTrackConstraints;
      try {
        preferred = await pickCameraConfig(Html5Qrcode);
      } catch (err) {
        if (!cancelled) {
          setIsStarting(false);
          setError(
            err instanceof Error
              ? `${err.message} Bạn vẫn có thể dùng máy quét laser để bắn mã.`
              : 'Không mở được camera. Hãy dùng máy quét laser để bắn mã.'
          );
        }
        return;
      }

      const cameraConfigs: Array<string | MediaTrackConstraints> = [
        preferred,
        { facingMode: 'environment' },
        { facingMode: 'user' }
      ];

      const config = buildScannerConfig();
      let lastError = 'Không mở được camera.';
      for (const cameraConfig of cameraConfigs) {
        if (cancelled) return;
        try {
          await scanner.start(cameraConfig, config, handleDecoded, () => {});
          if (cancelled) {
            await stopScannerSafely(scanner);
            return;
          }
          // Đảm bảo video playsInline trên iOS
          const video = region.querySelector('video');
          if (video) {
            video.setAttribute('playsinline', 'true');
            video.setAttribute('webkit-playsinline', 'true');
            video.muted = true;
            void video.play().catch(() => {});
          }
          void applyLowPowerResolution(scanner);
          void improveIosFocus(scanner);
          setIsStarting(false);
          return;
        } catch (err) {
          lastError = err instanceof Error ? err.message : lastError;
          await stopScannerSafely(scanner);
        }
      }

      if (!cancelled) {
        setIsStarting(false);
        setError(`${lastError} Hãy cấp quyền camera trong Cài đặt → Safari, hoặc dùng máy quét laser để bắn mã.`);
      }
    };

    void startScanner();

    return () => {
      cancelled = true;
      setIsStarting(false);
      clearAutoSubmitTimer();
      const scanner = scannerRef.current;
      scannerRef.current = null;
      if (!scanner) return;
      void stopScannerSafely(scanner).finally(() => {
        try {
          scanner.clear();
        } catch {
          // ignore cleanup errors
        }
      });
    };
  }, [open, closeAfterScan, regionId, useCamera]);

  const submitManualCode = (overrideValue?: string) => {
    clearAutoSubmitTimer();
    const value = (overrideValue ?? manualCode).trim();
    if (!value) {
      setLastScannedValue('(không nhận được dữ liệu từ máy)');
      setFeedback({ type: 'error', text: 'Chưa quét được mã hợp lệ.' });
      setFeedbackPulse(prev => prev + 1);
      focusManualInput(manualInputRef);
      return;
    }

    setError('');
    applyScanResult(value);
    // Luôn làm rỗng ô nhận sau mỗi lần quét; mã lỗi vẫn được giữ ở vùng "Mã vừa quét".
    setManualCode('');
    // Giữ focus ở ô nhập để đầu đọc laser (keyboard wedge) bắn liên tục không cần chạm tay.
    focusManualInput(manualInputRef);
  };

  /**
   * Đầu đọc laser xuất mã qua InputConnection.commitText() nên ký tự vào ô rất nhanh,
   * nhưng phím kết thúc (Enter) không phải máy nào cũng phát đúng sự kiện keydown cho
   * trình duyệt bắt được. Debounce theo khoảng dừng gõ để tự xử lý kể cả khi không có Enter.
   */
  const handleManualCodeChange = (value: string) => {
    ensureAudioContext();
    setManualCode(value);
    const receivedValue = value.trim();
    if (receivedValue) setLastScannedValue(receivedValue);
    clearAutoSubmitTimer();
    if (value.trim().length < 3) return;
    autoSubmitTimerRef.current = window.setTimeout(() => {
      autoSubmitTimerRef.current = null;
      submitManualCode(value);
    }, 150);
  };

  /**
   * BT-A700 có thể xuất dữ liệu theo hai kiểu:
   * - INPUT_CONNECTION: chuỗi đi thẳng vào ô input ẩn ở cuối component.
   * - KEY_EVENT: từng ký tự được phát như bàn phím vật lý.
   *
   * Listener này là đường dự phòng cho KEY_EVENT khi người dùng vừa bấm một nút làm ô input ẩn mất focus.
   * Chỉ thu ký tự khi hộp quét đang mở; Enter/Tab hoặc một khoảng dừng ngắn sẽ chốt mã.
   */
  useEffect(() => {
    const clearHardwareScanTimer = () => {
      if (hardwareScanTimerRef.current !== null) {
        window.clearTimeout(hardwareScanTimerRef.current);
        hardwareScanTimerRef.current = null;
      }
    };

    const resetHardwareScan = () => {
      clearHardwareScanTimer();
      hardwareScanBufferRef.current = '';
      hardwareScanLastKeyAtRef.current = 0;
    };

    if (!open) {
      resetHardwareScan();
      return;
    }

    const flushHardwareScan = () => {
      clearHardwareScanTimer();
      const value = hardwareScanBufferRef.current.trim();
      hardwareScanBufferRef.current = '';
      hardwareScanLastKeyAtRef.current = 0;
      if (value.length >= 3) submitManualCode(value);
    };

    const handleHardwareKeyDown = (event: KeyboardEvent) => {
      // Khi input ẩn vẫn có focus, onChange/onKeyDown của chính input đã xử lý để tránh nhận trùng mã.
      if (event.target === manualInputRef.current) return;
      if (event.ctrlKey || event.altKey || event.metaKey) return;
      ensureAudioContext();

      if (event.key === 'Enter' || event.key === 'Tab') {
        if (!hardwareScanBufferRef.current) return;
        event.preventDefault();
        event.stopPropagation();
        flushHardwareScan();
        return;
      }

      if (event.key.length !== 1) return;

      const now = window.performance.now();
      // Máy quét phát ký tự rất nhanh; khoảng nghỉ dài được xem là bắt đầu một mã mới.
      if (now - hardwareScanLastKeyAtRef.current > 120) {
        hardwareScanBufferRef.current = '';
      }
      hardwareScanLastKeyAtRef.current = now;
      hardwareScanBufferRef.current += event.key;
      event.preventDefault();
      event.stopPropagation();

      clearHardwareScanTimer();
      hardwareScanTimerRef.current = window.setTimeout(flushHardwareScan, 180);
    };

    document.addEventListener('keydown', handleHardwareKeyDown, true);
    return () => {
      document.removeEventListener('keydown', handleHardwareKeyDown, true);
      resetHardwareScan();
    };
  }, [open]);

  const feedbackClass =
    feedback?.type === 'success'
      ? 'qr-scan-pulse-success'
      : feedback?.type === 'pending'
        ? 'qr-scan-pulse-duplicate'
        : feedback?.type === 'duplicate'
          ? 'qr-scan-pulse-duplicate'
          : feedback?.type === 'error'
            ? 'qr-scan-pulse-error'
            : '';

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-start justify-center overflow-hidden bg-black/60 p-2 sm:items-center sm:p-4">
      <div className="flex max-h-[calc(100dvh-1rem)] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-xl sm:max-h-[92dvh]">
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 px-3 py-2.5 sm:px-4 sm:py-3">
          <div className="flex items-center gap-2">
            <ScanBarcode className="h-5 w-5 text-[#ef1b2d]" />
            <h3 className="text-sm font-black uppercase tracking-wider text-zinc-900">
              {hardwareOnly ? 'Quét máy BT-A700' : 'Quét QR / mã vạch sản phẩm'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-zinc-500 transition hover:bg-zinc-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
          <div className="mb-2.5 flex items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-2">
            <div className="min-w-0">
              <span className="block text-[11px] font-bold text-zinc-600">
                {hardwareOnly
                  ? 'Đầu đọc laser của máy'
                  : useCamera
                    ? 'Camera đang bật'
                    : 'Camera đang tắt — dùng máy quét laser'}
              </span>
              <span className="mt-0.5 block text-[10px] font-semibold text-emerald-700">
                BT-A700: đã sẵn sàng — hãy bấm cò quét
              </span>
            </div>
            <span
              className="ml-auto shrink-0 text-right text-sm font-black text-[#ef1b2d]"
              data-testid="scanner-total-count"
            >
              Tổng SL: {displayedScannedCount}
            </span>
            {!hardwareOnly && (
              <button
                type="button"
                onClick={toggleCameraEnabled}
                className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-extrabold transition ${
                  cameraEnabled ? 'bg-[#ef1b2d] text-white hover:bg-[#b30d1c]' : 'bg-zinc-200 text-zinc-700 hover:bg-zinc-300'
                }`}
                title="Tắt camera giúp mượt hơn trên máy cấu hình thấp, đặc biệt khi dùng máy quét laser"
              >
                {cameraEnabled ? 'Tắt camera' : 'Bật camera'}
              </button>
            )}
          </div>

          {useCamera ? (
            <div
              id={regionId}
              className="qr-scanner-region min-h-[220px] overflow-hidden rounded-xl bg-zinc-950 sm:min-h-[240px]"
            />
          ) : (
            <div className="flex min-h-[140px] flex-col items-center justify-center rounded-xl border-2 border-dashed border-zinc-200 bg-zinc-50 px-4 text-center">
              <ScanBarcode className="h-8 w-8 text-zinc-300" />
              <p className="mt-2 text-xs font-semibold text-zinc-500">
                {hardwareOnly
                  ? 'Bấm cò trên BT-A700. Máy sẽ dùng laser, phát tiếng báo và điền dữ liệu vào dòng sản phẩm.'
                  : 'Camera đang tắt để đỡ tải máy. Bấm cò máy quét laser để quét mã.'}
              </p>
              {hardwareOnly && (
                <p className="mt-1 text-[11px] font-medium text-zinc-400">
                  Có thể quét liên tục. Mỗi Mã SP chỉ được nhận một lần; quét tem khác cùng Mã SP sẽ được báo trùng.
                </p>
              )}
            </div>
          )}
          {isStarting && (
            <p className="mt-3 text-center text-xs font-semibold text-zinc-500">Đang mở camera...</p>
          )}
          {lastScannedValue && (
            <div
              data-testid="last-scanned-value"
              className="mt-3 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2.5 text-center"
            >
              <p className="text-[10px] font-black uppercase tracking-wider text-sky-700">Mã vừa quét</p>
              <p className="mt-1 break-all font-mono text-base font-black text-zinc-900">{lastScannedValue}</p>
            </div>
          )}
          {feedback && (
            <p
              key={feedbackPulse}
              className={`mt-3 rounded-xl border-2 px-3 py-3 text-center text-sm font-black ${feedbackClass} ${
                feedback.type === 'success'
                  ? 'border-emerald-500 text-emerald-800'
                  : feedback.type === 'pending'
                    ? 'border-[#ef1b2d] text-zinc-900'
                    : feedback.type === 'duplicate'
                      ? 'border-amber-500 text-amber-800'
                      : 'border-rose-500 text-rose-700'
              }`}
            >
              {feedback.text}
            </p>
          )}
          {error && <p className="mt-3 text-xs font-bold text-rose-600">{error}</p>}
          {!pendingScan && useCamera && (
            <>
              <p className="mt-2.5 text-center text-xs font-semibold text-zinc-500 sm:mt-3">
                Đưa trọn mã vào khung, giữ rõ hai đầu vạch — hoặc bấm cò máy quét laser.
              </p>
              <p className="mt-1 text-center text-[11px] font-medium text-zinc-400">
                Hỗ trợ QR, EAN-13, EAN-8, Code 128 và UPC.
                {isAppleMobile() ? ' Trên iPhone: cho phép Camera trong Cài đặt → Safari.' : ''}
              </p>
            </>
          )}
        </div>
        {pendingScan && (
          <div className="shrink-0 border-t border-zinc-200 bg-white p-3 sm:p-4">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={cancelPendingScan}
                className="h-11 flex-1 rounded-lg border border-zinc-200 bg-white text-sm font-bold text-zinc-700 transition hover:bg-zinc-50"
              >
                Quét lại
              </button>
              <button
                type="button"
                onClick={confirmPendingScan}
                className="h-11 flex-1 rounded-lg bg-[#ef1b2d] text-sm font-extrabold text-white transition hover:bg-[#b30d1c]"
              >
                Xác nhận
              </button>
            </div>
          </div>
        )}
        {/* Ô ẩn — không cho gõ tay, chỉ để bắt dữ liệu bàn phím ảo do đầu đọc laser bắn ra. */}
        <input
          ref={manualInputRef}
          value={manualCode}
          onChange={e => handleManualCodeChange(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault();
              // Đọc trực tiếp giá trị DOM: BT-A700 có thể bắn chuỗi + Enter nhanh hơn một nhịp cập nhật state React.
              submitManualCode(e.currentTarget.value);
            }
          }}
          aria-hidden="true"
          tabIndex={-1}
          onFocus={hideVirtualKeyboard}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          data-testid="manual-scan-input"
          className="sr-only"
        />
      </div>
    </div>,
    document.body
  );
}

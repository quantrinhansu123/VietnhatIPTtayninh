import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from 'react';
import { COMPANY_BRANCH_NAME } from '../../components/layout/constants';
import {
  getProductionShiftOptions,
  normalizeShiftSettings,
  shiftNamesMatch,
  type ShiftOption
} from '../../utils/shiftSettings';
import {
  findMachineByRef,
  machineSelectValue,
  normalizeMachines,
  type MachineRow
} from '../danh-sach-may';
import { parseProductionOrderFilterDate, splitProductionOrderStaffNames } from '../cai-dat-thoi-gian';
import {
  normalizeProductionOrders,
  resolveProductionOrderMachine,
  type ProductionOrderRow
} from '../ke-hoach-san-xuat';

function textKey(value: string) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
}

function orderMatchesMachine(orderMachine: string, selectedMachine: MachineRow | null, machineRef: string) {
  const raw = String(orderMachine || '').trim();
  if (!raw || raw === '-') return false;
  const refKey = textKey(machineRef);
  const orderKey = textKey(raw);
  const candidateKeys = [
    selectedMachine?.code || '',
    selectedMachine?.name || '',
    selectedMachine ? `${selectedMachine.code} · ${selectedMachine.name}` : '',
    machineRef
  ]
    .map(textKey)
    .filter(Boolean);
  return candidateKeys.some(
    key => key === orderKey || key.includes(orderKey) || orderKey.includes(key) || key === refKey
  );
}

/** Gom đủ nhân sự LSX: nhân sự + trưởng ca + thợ chính/phụ + học việc. */
function collectProductionOrderStaffNames(order: ProductionOrderRow): string[] {
  return [
    ...splitProductionOrderStaffNames(order.staff),
    ...splitProductionOrderStaffNames(order.shiftLead),
    ...splitProductionOrderStaffNames(order.mainStaff),
    ...splitProductionOrderStaffNames(order.assistantStaff),
    ...splitProductionOrderStaffNames(order.traineeStaff)
  ];
}

export type ReportFormsSharedMachine = {
  id: string;
  code: string;
  name: string;
};

export type ReportFormsSharedState = {
  ngay: string;
  gio: string;
  ca: string;
  chiNhanh: string;
  machineRef: string;
  staffNames: string[];
  ghiChu: string;
};

export type ReportFormsSharedPatch = Partial<ReportFormsSharedState>;

type ReportFormsSharedContextValue = ReportFormsSharedState & {
  machines: MachineRow[];
  shiftOptions: ShiftOption[];
  staffOptions: string[];
  selectedMachine: MachineRow | null;
  isLoadingOptions: boolean;
  setNgay: (value: string) => void;
  setGio: (value: string) => void;
  setCa: (value: string) => void;
  setChiNhanh: (value: string) => void;
  setMachineRef: (value: string) => void;
  setStaffNames: (value: string[] | ((prev: string[]) => string[])) => void;
  toggleStaffName: (name: string) => void;
  setGhiChu: (value: string) => void;
  /** Ghi đè từ form đang sửa phiếu cũ. */
  applyFromForm: (patch: ReportFormsSharedPatch) => void;
  staffText: string;
  machine: ReportFormsSharedMachine | null;
};

const ReportFormsSharedContext = createContext<ReportFormsSharedContextValue | null>(null);

function todayIso() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}

function nowTimeHm() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(11, 16);
}

export function ReportFormsSharedProvider({ children }: { children: ReactNode }) {
  const [ngay, setNgay] = useState(todayIso);
  const [gio, setGio] = useState(nowTimeHm);
  const [ca, setCa] = useState('');
  const [chiNhanh, setChiNhanh] = useState(COMPANY_BRANCH_NAME);
  const [machineRef, setMachineRef] = useState('');
  const [staffNames, setStaffNames] = useState<string[]>([]);
  const [ghiChu, setGhiChu] = useState('');

  const [machines, setMachines] = useState<MachineRow[]>([]);
  const [shiftOptions, setShiftOptions] = useState<ShiftOption[]>([]);
  const [productionOrders, setProductionOrders] = useState<ProductionOrderRow[]>([]);
  const [isLoadingOptions, setIsLoadingOptions] = useState(true);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      setIsLoadingOptions(true);
      try {
        const [machinesRes, settingsRes, productionRes] = await Promise.all([
          fetch('/api/danh-sach-may'),
          fetch('/api/cai-dat'),
          fetch('/api/lenh-sx?light=1')
        ]);
        if (!alive) return;
        if (machinesRes.ok) {
          const data = await machinesRes.json().catch(() => []);
          setMachines(normalizeMachines(data));
        }
        if (settingsRes.ok) {
          const data = await settingsRes.json().catch(() => []);
          setShiftOptions(getProductionShiftOptions(normalizeShiftSettings(data)));
        }
        if (productionRes.ok) {
          const data = await productionRes.json().catch(() => []);
          setProductionOrders(normalizeProductionOrders(data));
        }
      } finally {
        if (alive) setIsLoadingOptions(false);
      }
    };
    void load();
    return () => {
      alive = false;
    };
  }, []);

  const selectedMachine = useMemo(
    () => (machineRef.trim() ? findMachineByRef(machines, machineRef) : null),
    [machineRef, machines]
  );

  const staffOptions = useMemo(() => {
    if (!ngay || !ca || !machineRef.trim()) return [];
    const matchedOrders = productionOrders.filter(order => {
      const orderDate = parseProductionOrderFilterDate(order.startDate);
      if (orderDate && orderDate !== ngay) return false;
      if (!shiftNamesMatch(order.shift, ca)) return false;
      return orderMatchesMachine(
        resolveProductionOrderMachine(order, machines),
        selectedMachine,
        machineRef
      );
    });
    return Array.from(new Set(matchedOrders.flatMap(collectProductionOrderStaffNames))).sort((a, b) =>
      a.localeCompare(b, 'vi')
    );
  }, [ca, machineRef, machines, ngay, productionOrders, selectedMachine]);

  useEffect(() => {
    if (!ngay || !ca || !machineRef.trim()) {
      setStaffNames(prev => (prev.length ? [] : prev));
      return;
    }
    if (staffOptions.length === 1) {
      setStaffNames(prev =>
        prev.length === 1 && prev[0] === staffOptions[0] ? prev : [staffOptions[0]]
      );
      return;
    }
    setStaffNames(prev => {
      const next = prev.filter(name => staffOptions.includes(name));
      return next.length === prev.length ? prev : next;
    });
  }, [ca, machineRef, ngay, staffOptions]);

  const toggleStaffName = useCallback((name: string) => {
    setStaffNames(prev => (prev.includes(name) ? prev.filter(item => item !== name) : [...prev, name]));
  }, []);

  const applyFromForm = useCallback((patch: ReportFormsSharedPatch) => {
    if (patch.ngay !== undefined) setNgay(patch.ngay);
    if (patch.gio !== undefined) setGio(patch.gio);
    if (patch.ca !== undefined) setCa(patch.ca);
    if (patch.chiNhanh !== undefined) setChiNhanh(patch.chiNhanh);
    if (patch.machineRef !== undefined) setMachineRef(patch.machineRef);
    if (patch.staffNames !== undefined) setStaffNames(patch.staffNames);
    if (patch.ghiChu !== undefined) setGhiChu(patch.ghiChu);
  }, []);

  const machine = useMemo<ReportFormsSharedMachine | null>(() => {
    if (selectedMachine) {
      return {
        id: selectedMachine.id,
        code: selectedMachine.code,
        name: selectedMachine.name
      };
    }
    const ref = machineRef.trim();
    return ref ? { id: '', code: ref, name: ref } : null;
  }, [machineRef, selectedMachine]);

  const staffText = useMemo(() => staffNames.join(', '), [staffNames]);

  const value = useMemo<ReportFormsSharedContextValue>(
    () => ({
      ngay,
      gio,
      ca,
      chiNhanh,
      machineRef,
      staffNames,
      ghiChu,
      machines,
      shiftOptions,
      staffOptions,
      selectedMachine,
      isLoadingOptions,
      setNgay,
      setGio,
      setCa,
      setChiNhanh,
      setMachineRef,
      setStaffNames,
      toggleStaffName,
      setGhiChu,
      applyFromForm,
      staffText,
      machine
    }),
    [
      ngay,
      gio,
      ca,
      chiNhanh,
      machineRef,
      staffNames,
      ghiChu,
      machines,
      shiftOptions,
      staffOptions,
      selectedMachine,
      isLoadingOptions,
      toggleStaffName,
      applyFromForm,
      staffText,
      machine
    ]
  );

  return (
    <ReportFormsSharedContext.Provider value={value}>{children}</ReportFormsSharedContext.Provider>
  );
}

/** Trong hub: luôn có giá trị. Ngoài hub / standalone: null. */
export function useReportFormsSharedOptional() {
  return useContext(ReportFormsSharedContext);
}

export function useReportFormsShared() {
  const ctx = useContext(ReportFormsSharedContext);
  if (!ctx) {
    throw new Error('useReportFormsShared phải dùng trong ReportFormsSharedProvider');
  }
  return ctx;
}

export function sharedMachineSelectValue(machine: MachineRow | ReportFormsSharedMachine | null | undefined) {
  if (!machine) return '';
  if ('id' in machine && machine.id) return machineSelectValue(machine as MachineRow);
  return String(machine.code || machine.name || '').trim();
}

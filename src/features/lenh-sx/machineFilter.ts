type MachineIdentity = { id: string; code: string; name: string };

function machineKey(value: string) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLocaleUpperCase('vi');
}

/** Mã, tên và ID phải thuộc cùng máy; không khớp chuỗi con (máy 1 ≠ máy 16). */
export function productionOrderMachineMatches(filter: string, value: string, machines: MachineIdentity[]) {
  const target = machineKey(filter);
  const candidate = machineKey(value);
  if (!target || target === 'ALL') return true;
  if (!candidate || candidate === '-') return false;
  if (target === candidate) return true;
  return machines.some(machine => {
    const aliases = [machine.id, machine.code, machine.name].map(machineKey).filter(key => key && key !== '-');
    return aliases.includes(target) && aliases.includes(candidate);
  });
}

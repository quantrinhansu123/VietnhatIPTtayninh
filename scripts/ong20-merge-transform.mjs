export const TARGET = 'ONG-19.5CM';
const OLD = /ONG-20CM/gi;
const CODE_FIELDS = ['ma_nvl','ma_npl','itemCode','materialCode','sttCode','code'];
const SUM_FIELDS = new Set(`quantity actualQuantity actualQty exportQty finishedQty so_luong so_luong_chung_tu so_luong_ton so_luong_ton_ngoai so_luong_trong_may so_luong_nl_chua_tron so_luong_trong_bon_tron kl_thuc_te weightKg normWeightKg actualWeightKg baseActualWeightKg tonDauKg directTonDauKg tonCuoiKg directTonCuoiKg xuatTrongCaKg trongLuongDaTronKg klThucTeKg loiHongKg klThucTePlusLoiKg chenhLechKg mixingShiftMaterialKg actualUsedKg openingKg closingKg finishedKg damagedKg exportKg actualMixedKg varianceKg finishedAndDamagedKg thucXuatKg dinhMucVatTuKg thanhTien tienLoDoHangLoi loiKg sl_nvl sl_dinh_muc trong_luong_dinh_muc_kg sl_xuat trong_luong_xuat_kg thuc_tron_kg xuat_kho_kg ton_dau_kg nhap_thanh_pham_kg loi_hong_kg ton_cuoi_kg xuat_thuc_te_kg chenh_lech_kg trong_luong_loi_kg ton_dau_ky nhap_trong_ky xuat_trong_ky`.split(' '));
const isOld = v => typeof v === 'string' && /^ONG-20CM$/i.test(v.trim());
const isTarget = v => typeof v === 'string' && v.trim().toUpperCase() === TARGET;
const codeOf = obj => obj && typeof obj === 'object' && CODE_FIELDS.map(k=>obj[k]).find(v=>isOld(v)||isTarget(v));
export function mergeQuantities(target, source) {
  const out = {...target};
  for(const [key,value] of Object.entries(source)) {
    if(SUM_FIELDS.has(key) && typeof value === 'number') out[key] = Math.round(((typeof out[key] === 'number' ? out[key] : 0)+value)*1e10)/1e10;
    else if(out[key] == null) out[key] = value;
  }
  return out;
}
export function transform(value) {
  if(typeof value === 'string') return value.replace(OLD,TARGET);
  if(Array.isArray(value)) {
    const mapped = value.map(transform);
    // Only consolidate collisions between this alias and its canonical code.
    const groups = new Map();
    for(let i=0;i<value.length;i++) {
      const code = codeOf(value[i]);
      if(!code) continue;
      const scopeFields=['ngay','shift','ca','machine','may','orderCode','ma_lenh','productCode','ma_sp','unit','don_vi','amountType','loai','section','nhom','reportId','slipCode','slipLineKey'];
      const scope=JSON.stringify(scopeFields.map(k=>mapped[i][k] ?? null));
      const group=groups.get(scope)||{indices:[],old:false,target:false};
      group.indices.push(i);group.old ||= isOld(code);group.target ||= isTarget(code);groups.set(scope,group);
    }
    const remove=new Set();
    for(const group of groups.values()) if(group.old && group.target) {
      const keeper=group.indices.find(i=>isTarget(codeOf(value[i])));
      for(const i of group.indices) if(i!==keeper){mapped[keeper]=mergeQuantities(mapped[keeper],mapped[i]);remove.add(i);}
    }
    return mapped.filter((_,i)=>!remove.has(i));
  }
  if(value && typeof value === 'object') {
    const old=isOld(codeOf(value));
    return Object.fromEntries(Object.entries(value).map(([k,v])=>[
      k.replace(OLD,TARGET),
      old && /^(ten_nvl|ten_npl|ten_vat_tu|itemName|materialName|name|label)$/.test(k)
        ? 'Ống giấy 76*2ly*19.5CM' : transform(v)
    ]));
  }
  return value;
}

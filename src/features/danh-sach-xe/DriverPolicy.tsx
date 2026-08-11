import React, { useMemo, useState } from 'react';
import { ChevronDown, Printer, Search } from 'lucide-react';
import { BackButton } from '../../components/layout/NavButtons';

/**
 * Quy chế lương, chế độ và phụ cấp lái xe — QĐ số 220222 CN/QĐ (Củ Chi, 22/02/2022).
 * Chỉ đọc: nhân sự / lái xe tra cứu lại nội dung đã ban hành.
 */

const POLICY_META = {
  soQuyetDinh: '220222 CN/QĐ',
  noiBanHanh: 'Củ Chi',
  ngayBanHanh: '22/02/2022',
  apDung: 'Lái xe 1.9 tấn / 2 lái'
};

type SalaryRow = {
  stt: string;
  khoanMuc: string;
  soTien: string;
  ghiChu: string;
};

const SALARY_ROWS: SalaryRow[] = [
  { stt: '1', khoanMuc: 'Lương cơ bản', soTien: '4.730.000', ghiChu: 'đ/tháng / 26 công' },
  { stt: '2', khoanMuc: 'PC chuyên cần', soTien: '200.000', ghiChu: 'đ/tháng (nếu đi làm đủ 26 ngày công)' },
  { stt: '3', khoanMuc: 'PC trách nhiệm', soTien: '500.000', ghiChu: 'đ/lái' },
  {
    stt: '4',
    khoanMuc: 'Thưởng doanh số',
    soTien: '0,2% x doanh số bán tháng / 1 xe',
    ghiChu: 'Nếu 2 tài xế thì chia đôi, có phụ xe cũng chia đôi. Nếu 1 tài xế thì được hưởng đủ.'
  },
  {
    stt: '5',
    khoanMuc: 'Hỗ trợ nhà nghỉ',
    soTien: '250.000 đ/đêm',
    ghiChu:
      'Áp dụng cho lái xe nghỉ qua đêm với trường hợp đi 1 lái và đi 2 chiều > 400 km. Chế độ 2 lái không có nhà nghỉ. Lái xe cùng điều phối sắp xếp thời gian đi giao hàng cho phù hợp.'
  },
  {
    stt: '6',
    khoanMuc: 'Hỗ trợ cước điện thoại',
    soTien: '200.000',
    ghiChu: 'đ/xe. Công ty cấp sim và thuê bao + 3G gói 200.000 đ/tháng. Nếu quá hạn mức thì trừ vào lương.'
  },
  {
    stt: '7',
    khoanMuc: 'Thưởng chuyến, khoán luật + thưởng km, hỗ trợ tiền ăn',
    soTien: '—',
    ghiChu: 'Chi tiết theo bảng định mức km/chuyến bên dưới.'
  }
];

type TripRow = {
  stt: string;
  km: string;
  chamCong: string;
  tienAn: string;
  thuongChuyen: string;
  ghiChu: string;
};

const TRIP_ROWS: TripRow[] = [
  { stt: '01', km: 'Từ 65 km trở xuống', chamCong: '0,5 công', tienAn: '—', thuongChuyen: '—', ghiChu: '' },
  { stt: '02', km: 'Từ 66 – dưới 120 km', chamCong: '1 công', tienAn: '50.000', thuongChuyen: '0', ghiChu: '' },
  { stt: '03', km: 'Từ 120 – dưới 200 km', chamCong: '1 công', tienAn: '50.000', thuongChuyen: '30.000', ghiChu: 'Bản gốc gộp ô tiền ăn với mục 02' },
  { stt: '04', km: 'Từ 200 – dưới 400 km', chamCong: '1 công', tienAn: '80.000', thuongChuyen: '50.000', ghiChu: '' },
  { stt: '05', km: 'Từ 400 – dưới 600 km', chamCong: '1 công', tienAn: '110.000', thuongChuyen: '70.000', ghiChu: '' },
  { stt: '06', km: 'Từ 600 – dưới 700 km', chamCong: '1,5 công', tienAn: '140.000', thuongChuyen: '100.000', ghiChu: 'Ít hoặc không phải đi' },
  { stt: '07', km: 'Từ 700 – dưới 1.000 km', chamCong: '2 công', tienAn: '220.000', thuongChuyen: '140.000', ghiChu: '' },
  { stt: '08', km: 'Từ 1.000 km trở lên', chamCong: '3 công', tienAn: '330.000', thuongChuyen: '200.000', ghiChu: '' }
];

const FUEL_ROWS = [
  { stt: '01', loai: 'Khoán định mức dầu', soKhoan: '12 lít / 100 km', ghiChu: '0,12 lít/km' },
  { stt: '02', loai: 'Khoán luật + thưởng km', soKhoan: '500 đ/km', ghiChu: '' }
];

type PolicySection = {
  id: string;
  title: string;
  intro?: string;
  bullets?: { label?: string; text: string }[];
  notes?: string[];
};

const SECTIONS: PolicySection[] = [
  {
    id: 'dieu-1',
    title: 'Điều 1: Người quản lý, ràng buộc trách nhiệm',
    bullets: [
      { label: 'Bộ phận quản lý', text: 'Trực thuộc phòng kinh doanh.' },
      {
        label: 'Ràng buộc trách nhiệm',
        text:
          'Lái xe phải có giấy tờ xác nhận bảo lãnh của vợ hoặc bố mẹ (có cả số điện thoại liên hệ) và ký biên bản bàn giao xe trước khi nhận xe. Phối hợp cùng Nhân sự để nhận bàn giao xe gồm các dụng cụ đồ nghề theo xe, vỏ xe, kính không vỡ / xước xát.'
      },
      {
        label: 'Sau khi nghỉ việc',
        text:
          'Người lao động đồng ý sẽ được nhận lại hồ sơ sau 1 tháng kể từ ngày chính thức nghỉ việc (nếu không còn vướng mắc gì trong công việc).'
      },
      {
        label: 'Thời gian thử việc',
        text:
          '03 tháng. Tháng đầu hưởng 85% lương cơ bản, tháng thứ 2 hưởng 100% nếu được đánh giá đáp ứng yêu cầu công việc. Công ty có quyền đơn phương chấm dứt hợp đồng và báo trước người lao động từ 1 đến 2 ngày.'
      }
    ]
  },
  {
    id: 'dien-giai',
    title: 'Diễn giải các khoản lương, phụ cấp',
    bullets: [
      { label: 'Lương cơ bản', text: 'Được điều chỉnh theo quy định nhà nước, thâm niên làm việc tại Công ty.' },
      {
        label: 'Phụ cấp chuyên cần',
        text:
          'Trong tháng nếu không đi giao hàng theo lệnh điều động từ 1 lần trở lên, nghỉ quá từ 1 ngày trở lên không được hưởng tiền chuyên cần. Nếu tiếp tục vi phạm lần 2 phạt gấp đôi, lần 3 vi phạm xử cắt thưởng doanh số và xử lý theo quy định của công ty.'
      },
      {
        label: 'Phụ cấp trách nhiệm',
        text:
          'Gồm trách nhiệm báo cáo, trách nhiệm bảo quản xe, trách nhiệm kiểm tra hàng hóa và tiền. Kiểm tra hàng hóa khi giao và nhận: mỗi trường hợp sai sót số tiền từ 50.000 đồng (các trường hợp như thừa thiếu hàng, sai màu, loại sản phẩm, thiếu băng keo, nẹp, thiếu quà khuyến mãi…). Các trường hợp bay sót gây tổn thất, mất mát hàng hóa, lái xe phải bồi thường theo thực tế phát sinh. Trường hợp giao nhầm hàng phải chở hàng về, do lái xe hoặc do bộ phận kho, do điều phối… ai sai người đó chịu trách nhiệm tương đương với thiệt hại thực tế. Nếu lái xe không ghi báo trong hóa đơn bán hàng hoặc không ghi rõ trách nhiệm thì lái xe phải chịu hoàn toàn trách nhiệm.'
      },
      {
        label: 'Phụ cấp điện thoại',
        text:
          'Phụ cấp điện thoại được dùng để lái xe liên hệ khách hàng, nhận thông báo từ công ty. Vì vậy điện thoại lái xe phải luôn mở, khi có cuộc gọi nhỡ hoặc tin nhắn từ công ty, lái xe phải liên hệ lại.'
      },
      {
        label: 'Phụ cấp nhà nghỉ',
        text:
          'Chỉ áp dụng trường hợp phát sinh nghỉ qua đêm và đi đường chế độ với xe có 01 lái. Tùy vào tình hình phát sinh thực tế thì xin ý kiến của người quản lý trực tiếp.'
      },
      {
        label: 'Thời gian làm việc, chấm công, thưởng chuyến, hỗ trợ tiền ăn',
        text:
          'Do tính chất công việc đặc thù, thời gian làm việc của bộ phận lái xe làm việc theo lệnh điều động của phòng kinh doanh, không tính giờ giấc, không tính thêm giờ, không có chế độ ngày chủ nhật. Làm việc nào chấm công ngày đó. Lái xe chủ động sắp xếp thời gian cho hợp lý và kịp tiến độ giao hàng.'
      }
    ]
  },
  {
    id: 'dieu-3',
    title: 'Điều 3: Các quy định làm việc, giao nhận, bảo dưỡng xe',
    intro: 'Nguyên tắc làm việc (kèm mô tả công việc của lái xe).',
    bullets: [
      {
        label: 'Lệnh điều động',
        text:
          'Làm việc theo lệnh điều động của phòng kinh doanh, đi giao hàng theo lệnh và cung đường đã sắp xếp. Đi sai kế hoạch, sai cung đường là vi phạm. Nếu lệnh xuất hàng và cung đường không hợp lý thì phải có ý kiến phản hồi ngay, không được tự ý thay đổi cung đường trước khi đi giao hàng.'
      },
      {
        label: 'Thời gian làm việc',
        text:
          'Đây là bộ phận đặc thù, xe chạy 24/24h, 2 lái thay nhau. Không được nghỉ trên đường, không được đưa xe về nhà, không được chở hàng ngang đường, không đổi lệnh tại các bến bãi, trạm cầu đường khi không được người quản lý cho phép.'
      },
      {
        label: 'Nhận hàng hóa và chứng từ',
        text:
          'Lái xe phải bốc hàng lên xe, xếp hàng trên xe để tối ưu chỗ xếp, kiểm tra đúng số lượng và chủng loại theo yêu cầu xuất hàng, nhận chứng từ xuất hàng đầy đủ kế toán mới ký. Hàng giao sau xếp trong cùng, hàng giao trước xếp ngoài cùng.'
      },
      {
        label: 'Nghỉ phép riêng',
        text:
          'Nếu có việc cần thiết phải xin nghỉ thì lái xe phải báo trước cho phòng kinh doanh để sắp xếp kế hoạch. Không nghỉ quá 3 ngày/tháng (trường hợp đặc biệt phải xin ý kiến Sếp). Xe có 2 lái thì không được nghỉ cùng nhau, để đảm bảo kế hoạch hàng hóa được lưu thông bình ổn.'
      },
      {
        label: 'Giao hàng cho khách và thu tiền',
        text:
          'Giao hàng cho khách hàng trực tiếp, nhiệt tình, nhã nhặn, hỗ trợ khách hàng. Kiểm tra kỹ hàng hóa số lượng, chủng loại với chứng từ, lấy chữ ký của khách hàng. Hàng lỗi, hư hỏng, rách do lái xe phải chịu trách nhiệm. Sau khi giao hàng về tới công ty phải nộp tiền ngay trong ngày về quỹ, chốt số km tại phòng bảo vệ và chốt phiếu km cho kế toán theo mẫu của Công ty cùng với báo cáo đối chiếu.'
      },
      {
        label: 'Đề nghị thanh toán (chi phí)',
        text:
          'Lái xe thanh toán đúng, đủ chi phí. Nếu phát hiện gian lận thì công ty sẽ truy thu lại và phạt gấp 10 lần giá trị số tiền gian lận. Nếu tiếp tục vi phạm lần thứ 2 thì ngoài số phạt trên, công ty sẽ cắt thưởng doanh số, thưởng đơn hàng và chấm dứt hợp đồng lao động.'
      }
    ],
    notes: [
      'Quy định về nguyên tắc giao nhận xe: khi giao nhận xe theo nguyên tắc xăng dầu đầy bình.',
      'Bàn giao hiện trạng xe với thông tin chi tiết đầy đủ (có bảng kiểm tra chi tiết kèm theo).'
    ]
  }
];

const TRIP_NOTES = [
  'Trường hợp tắc đường, phải đi cung đường khác làm phát sinh km thì được tính theo km thực tế phát sinh.',
  'Ví dụ: cung đường đi 64 km (0,5 công) nhưng phải đi đường khác phát sinh lên 66 km thì vẫn chấm 0,5 công và ghi rõ lý do phát sinh.',
  'Các trường hợp gian lận thời gian, quãng đường nếu bị phát hiện sẽ xử phạt theo quy định phía dưới.',
  'Điều xe phải kiểm soát chấm công nghiêm túc, không được cào bằng. Trường hợp báo trễ hoặc kê khai sai đều bị xử lý.',
  'Cuối tháng nhân sự chốt số liệu trừ vào lương và báo cáo công ty. Điều xe báo cáo kết quả làm việc trong tháng của lái xe trong buổi họp với ban giám đốc công ty.'
];

const FUEL_NOTES = [
  'Tính theo số lít trên 1 km nhân với giá dầu tại thời điểm xe lưu hành.',
  'Đường đèo dốc được cộng thêm 0,2 lít/km (Lâm Đồng).',
  'Định kỳ 6 tháng công ty chạy lại định mức một lần, hoặc theo đề nghị từ tài xế.',
  'Lái xe chịu toàn bộ chi phí liên quan đến luật lệ giao thông và các giấy tờ của xe.',
  'Tất cả các trường hợp vi phạm như đi sai luật lệ giao thông, chạy quá tốc độ… nếu bị va chạm, tai nạn gây thiệt hại tài sản, tính mạng con người thì lái xe chịu hoàn toàn trách nhiệm.'
];

function matches(haystack: string, keyword: string) {
  if (!keyword) return true;
  return haystack.toLowerCase().includes(keyword.toLowerCase());
}

export function DriverPolicyView({ onBack }: { onBack?: () => void } = {}) {
  const [keyword, setKeyword] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const visibleSections = useMemo(
    () =>
      SECTIONS.filter(section =>
        matches(
          [section.title, section.intro ?? '', ...(section.bullets ?? []).map(b => `${b.label ?? ''} ${b.text}`), ...(section.notes ?? [])].join(' '),
          keyword
        )
      ),
    [keyword]
  );

  const visibleSalary = useMemo(
    () => SALARY_ROWS.filter(row => matches(`${row.khoanMuc} ${row.soTien} ${row.ghiChu}`, keyword)),
    [keyword]
  );

  const visibleTrips = useMemo(
    () => TRIP_ROWS.filter(row => matches(`${row.km} ${row.chamCong} ${row.tienAn} ${row.thuongChuyen} ${row.ghiChu}`, keyword)),
    [keyword]
  );

  const toggle = (id: string) => setCollapsed(prev => ({ ...prev, [id]: !prev[id] }));

  return (
    <div className={onBack ? 'mx-auto w-full min-w-0 max-w-[1680px] space-y-3' : 'space-y-3'}>
      <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex min-w-0 items-start gap-2">
            {onBack && (
              <span className="mt-0.5 print:hidden">
                <BackButton onClick={onBack} />
              </span>
            )}
            <div className="min-w-0">
            <h3 className="font-display text-sm font-extrabold text-slate-900">
              Quy định làm việc, lương và chế độ, phụ cấp của lái xe
            </h3>
            <p className="mt-0.5 text-[11px] font-medium text-slate-500">
              Quyết định số {POLICY_META.soQuyetDinh} — {POLICY_META.noiBanHanh}, ngày {POLICY_META.ngayBanHanh} · Áp dụng cho{' '}
              {POLICY_META.apDung}
            </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-extrabold text-slate-600 transition hover:bg-slate-50 print:hidden"
          >
            <Printer className="h-4 w-4" />
            In quy chế
          </button>
        </div>
        <label className="mt-3 flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 sm:max-w-md print:hidden">
          <Search className="h-4 w-4 text-slate-400" />
          <input
            value={keyword}
            onChange={event => setKeyword(event.target.value)}
            placeholder="Tìm trong quy chế: nhà nghỉ, chuyên cần, km..."
            className="h-full w-full bg-transparent text-xs font-semibold text-slate-700 outline-none"
          />
        </label>
        <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-800">
          Nội dung dưới đây là bản đánh máy lại từ quyết định giấy có dấu. Khi áp dụng tính lương, thưởng cần đối chiếu với bản gốc
          lưu tại phòng Nhân sự.
        </p>
      </section>

      {visibleSalary.length > 0 && (
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <header className="border-b border-slate-200 bg-slate-50 px-3 py-2">
            <h4 className="text-xs font-extrabold text-slate-700">Điều 2: Chế độ lương, phụ cấp, thưởng tháng</h4>
          </header>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-xs">
              <thead className="bg-[#ef1b2d] text-[11px] uppercase tracking-wide text-white">
                <tr>
                  <th className="px-3 py-2 font-extrabold">Stt</th>
                  <th className="px-3 py-2 font-extrabold">Khoản mục</th>
                  <th className="px-3 py-2 font-extrabold">Số tiền</th>
                  <th className="px-3 py-2 font-extrabold">Ghi chú</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleSalary.map(row => (
                  <tr key={row.stt} className="align-top">
                    <td className="px-3 py-2 font-bold text-slate-500">{row.stt}</td>
                    <td className="px-3 py-2 font-extrabold text-slate-800">{row.khoanMuc}</td>
                    <td className="px-3 py-2 font-extrabold text-brand-700">{row.soTien}</td>
                    <td className="px-3 py-2 text-slate-600">{row.ghiChu}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {visibleTrips.length > 0 && (
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <header className="border-b border-slate-200 bg-slate-50 px-3 py-2">
            <h4 className="text-xs font-extrabold text-slate-700">Chấm công, tiền ăn và thưởng chuyến theo km (2 chiều)</h4>
          </header>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-xs">
              <thead className="bg-[#ef1b2d] text-[11px] uppercase tracking-wide text-white">
                <tr>
                  <th className="px-3 py-2 font-extrabold">Stt</th>
                  <th className="px-3 py-2 font-extrabold">Km / chuyến (2 chiều)</th>
                  <th className="px-3 py-2 font-extrabold">Chấm công</th>
                  <th className="px-3 py-2 font-extrabold">PC tiền ăn / lái</th>
                  <th className="px-3 py-2 font-extrabold">Thưởng chuyến / lái</th>
                  <th className="px-3 py-2 font-extrabold">Ghi chú</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleTrips.map(row => (
                  <tr key={row.stt} className="align-top">
                    <td className="px-3 py-2 font-bold text-slate-500">{row.stt}</td>
                    <td className="px-3 py-2 font-extrabold text-slate-800">{row.km}</td>
                    <td className="px-3 py-2 text-slate-700">{row.chamCong}</td>
                    <td className="px-3 py-2 font-extrabold text-slate-800">{row.tienAn}</td>
                    <td className="px-3 py-2 font-extrabold text-brand-700">{row.thuongChuyen}</td>
                    <td className="px-3 py-2 text-[11px] text-slate-500">{row.ghiChu}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="space-y-1 border-t border-slate-100 bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-600">
            {TRIP_NOTES.map(note => (
              <li key={note}>• {note}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <header className="border-b border-slate-200 bg-slate-50 px-3 py-2">
          <h4 className="text-xs font-extrabold text-slate-700">Khoán định mức dầu và khoán luật</h4>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-xs">
            <thead className="bg-[#ef1b2d] text-[11px] uppercase tracking-wide text-white">
              <tr>
                <th className="px-3 py-2 font-extrabold">Stt</th>
                <th className="px-3 py-2 font-extrabold">Loại khoán</th>
                <th className="px-3 py-2 font-extrabold">Số khoán</th>
                <th className="px-3 py-2 font-extrabold">Ghi chú</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {FUEL_ROWS.map(row => (
                <tr key={row.stt} className="align-top">
                  <td className="px-3 py-2 font-bold text-slate-500">{row.stt}</td>
                  <td className="px-3 py-2 font-extrabold text-slate-800">{row.loai}</td>
                  <td className="px-3 py-2 font-extrabold text-brand-700">{row.soKhoan}</td>
                  <td className="px-3 py-2 text-slate-600">{row.ghiChu}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="space-y-1 border-t border-slate-100 bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-600">
          {FUEL_NOTES.map(note => (
            <li key={note}>• {note}</li>
          ))}
        </ul>
      </section>

      {visibleSections.map(section => {
        const isCollapsed = Boolean(collapsed[section.id]);
        return (
          <section key={section.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <button
              type="button"
              onClick={() => toggle(section.id)}
              className="flex w-full items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 text-left"
            >
              <h4 className="text-xs font-extrabold text-slate-700">{section.title}</h4>
              <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition ${isCollapsed ? '-rotate-90' : ''}`} />
            </button>
            {!isCollapsed && (
              <div className="space-y-2 px-3 py-3">
                {section.intro && <p className="text-xs font-semibold text-slate-600">{section.intro}</p>}
                {section.bullets?.map(bullet => (
                  <p key={bullet.text} className="text-xs leading-relaxed text-slate-700">
                    {bullet.label && <span className="font-extrabold text-slate-900">{bullet.label}: </span>}
                    {bullet.text}
                  </p>
                ))}
                {section.notes && section.notes.length > 0 && (
                  <ul className="space-y-1 rounded-lg bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-600">
                    {section.notes.map(note => (
                      <li key={note}>• {note}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </section>
        );
      })}

      {keyword && visibleSections.length === 0 && visibleSalary.length === 0 && visibleTrips.length === 0 && (
        <p className="rounded-xl border border-slate-200 bg-white px-3 py-6 text-center text-xs font-bold text-slate-400">
          Không tìm thấy nội dung phù hợp trong quy chế.
        </p>
      )}
    </div>
  );
}

export default DriverPolicyView;

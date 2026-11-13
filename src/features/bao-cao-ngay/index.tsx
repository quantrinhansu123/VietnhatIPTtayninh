import { BieuDoThPanel } from '../bieu-do-th';

export default function BaoCaoNgayPanel({ onBack }: { onBack?: () => void }) {
  return <BieuDoThPanel daily onBack={onBack} />;
}

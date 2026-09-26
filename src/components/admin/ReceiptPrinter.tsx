

export interface TransactionItem {
  id: string;
  name: string;
  qty: number;
  price: number;
  subtotal: number;
}

export interface TransactionData {
  id: string;
  timestamp: string;
  items: TransactionItem[];
  total: number;
  payment: number;
  change: number;
  cashierName?: string;
}

interface ReceiptPrinterProps {
  transaction: TransactionData | null;
}

export default function ReceiptPrinter({ transaction }: ReceiptPrinterProps) {
  if (!transaction) return null;

  return (
    <div className="hidden print:block font-mono text-sm text-black bg-white w-full max-w-[80mm] mx-auto p-4">
      {/* Header */}
      <div className="text-center mb-4">
        <h2 className="font-bold text-lg mb-1">SIMKOP</h2>
        <p className="text-xs">Sistem Informasi Koperasi</p>
        <p className="text-xs">Jl. Contoh Alamat No. 123</p>
        <p className="text-xs">Telp: 08123456789</p>
      </div>

      <div className="border-b border-dashed border-black mb-2 pb-2">
        <div className="flex justify-between text-xs mb-1">
          <span>{new Date(transaction.timestamp).toLocaleDateString('id-ID')}</span>
          <span>{new Date(transaction.timestamp).toLocaleTimeString('id-ID')}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span>ID: {transaction.id}</span>
          <span>Kasir: {transaction.cashierName || 'Admin'}</span>
        </div>
      </div>

      {/* Items */}
      <div className="mb-2">
        {transaction.items.map((item, index) => (
          <div key={index} className="mb-1 text-xs">
            <div className="font-bold">{item.name}</div>
            <div className="flex justify-between">
              <span>{item.qty} x {item.price.toLocaleString('id-ID')}</span>
              <span>{item.subtotal.toLocaleString('id-ID')}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-dashed border-black pt-2 mb-4 text-xs">
        <div className="flex justify-between mb-1">
          <span>Total</span>
          <span className="font-bold">{transaction.total.toLocaleString('id-ID')}</span>
        </div>
        <div className="flex justify-between mb-1">
          <span>Tunai</span>
          <span>{transaction.payment.toLocaleString('id-ID')}</span>
        </div>
        <div className="flex justify-between">
          <span>Kembalian</span>
          <span>{transaction.change.toLocaleString('id-ID')}</span>
        </div>
      </div>

      {/* Footer */}
      <div className="text-center text-xs mt-6">
        <p>Terima Kasih Atas Kunjungan Anda</p>
        <p className="mt-1 text-[10px]">Barang yang sudah dibeli tidak dapat ditukar/dikembalikan</p>
      </div>
    </div>
  );
}

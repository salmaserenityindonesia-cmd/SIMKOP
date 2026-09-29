import { useState, useRef, useEffect } from 'react';
import POSHeader from '../../components/pos/POSHeader';
import ProductSearchInput from '../../components/pos/ProductSearchInput';
import CartTable from '../../components/pos/CartTable';
import SummaryPanel from '../../components/pos/SummaryPanel';
import QuantityModal from '../../components/pos/QuantityModal';
import CameraScannerModal from '../../components/pos/CameraScannerModal';
import ReceiptModal from '../../components/pos/ReceiptModal';
import SplitPaymentModal from '../../components/pos/SplitPaymentModal';
import { processCheckout } from '../../services/posCheckoutService';
import { supabase } from '../../lib/supabaseClient';
import { Produk } from '../../services/koperasiService';

export interface CartItem {
  id: string;
  barcode: string;
  name: string;
  unit: string;
  price: number;
  stock: number;
  qty: number;
}

export default function POSPage() {
  const [products, setProducts] = useState<Produk[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [selectedMember, setSelectedMember] = useState<any | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [activeItemForQty, setActiveItemForQty] = useState<Omit<CartItem, 'qty'> | null>(null);
  const [lastPayment, setLastPayment] = useState<any>(null);
  
  useEffect(() => {
    import('../../services/koperasiService').then(s => {
      s.getProduk().then(data => setProducts(data.filter(p => p.is_active && p.stock > 0)));
    });
    supabase.from('anggota').select('id, nrp, nama, take_home_pay').eq('status', 'aktif').then(({ data }) => {
      if (data && data.length > 0) {
        setMembers(data);
        setSelectedMember(data[0]); // default to first member
      }
    });
  }, []);

  const [modals, setModals] = useState({
    qty: false,
    camera: false,
    receipt: false,
    splitPayment: false,
  });

  const searchInputRef = useRef<HTMLInputElement>(null);

  const subtotal = cart.reduce((sum, i) => sum + (i.price * i.qty), 0);
  const discount = selectedMember ? subtotal * 0.05 : 0; 
  const total = subtotal - discount;

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleGlobalKeydown = (e: KeyboardEvent) => {
      // Don't trigger if a modal is open
      if (modals.qty || modals.camera || modals.receipt) return;
      
      if ((e.ctrlKey && e.key === 'k') || e.key === 'F2') {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === 'F9' || (e.key === ' ' && (e.target as HTMLElement).tagName !== 'INPUT')) {
        if (cart.length > 0) {
          e.preventDefault();
          setModals(m => ({ ...m, splitPayment: true }));
        }
      }
    };
    window.addEventListener('keydown', handleGlobalKeydown);
    return () => window.removeEventListener('keydown', handleGlobalKeydown);
  }, [modals, cart]);

  const handleSelectProduct = (product: Omit<CartItem, 'qty'>) => {
    setActiveItemForQty(product);
    setModals(m => ({ ...m, qty: true }));
  };

  const handleConfirmQty = (qty: number) => {
    setModals(m => ({ ...m, qty: false }));
    if (!activeItemForQty) return;
    
    setCart(prev => {
      const existing = prev.findIndex(p => p.barcode === activeItemForQty.barcode);
      if (existing >= 0) {
        const next = [...prev];
        next[existing].qty += qty;
        return next;
      }
      return [...prev, { ...activeItemForQty, qty }];
    });
    
    // focus back to search after small delay
    setTimeout(() => searchInputRef.current?.focus(), 100);
  };

  const handleCheckoutConfirm = async (payload: { paidCash: number; paidDeposit: number; paidCredit: number; scheme: string }) => {
    const cashierId = null; // Normally from auth context
    const res = await processCheckout({
      memberId: selectedMember?.id || null,
      cashierId,
      cart,
      subtotal,
      discount,
      totalAmount: total,
      paidCash: payload.paidCash,
      paidDeposit: payload.paidDeposit,
      paidCredit: payload.paidCredit,
      paymentScheme: payload.scheme
    });

    if (res.success) {
       setLastPayment(payload);
       setModals(m => ({ ...m, splitPayment: false, receipt: true }));
    } else {
       alert('Checkout gagal: ' + res.error);
    }
  };

  return (
    <div className="bg-background text-on-surface antialiased font-body-md select-none min-h-screen flex flex-col">
      <POSHeader 
        onOpenQty={() => { if(cart.length>0) setModals(m => ({...m, qty: true})) }}
        onOpenReceipt={() => { if(cart.length>0) setModals(m => ({...m, receipt: true})) }}
        onOpenCamera={() => setModals(m => ({...m, camera: true}))}
        onReset={() => setCart([])}
      />
      
      <main className="w-full max-w-[1720px] mx-auto p-3 lg:p-4 flex-1 flex flex-col gap-3">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start flex-1">
          <section className="lg:col-span-8 flex flex-col gap-3 h-full">
            <ProductSearchInput 
              products={products}
              searchRef={searchInputRef}
              onSelectProduct={handleSelectProduct}
              onOpenCamera={() => setModals(m => ({...m, camera: true}))}
            />
            <CartTable 
              cart={cart}
              onUpdateQty={(idx: number, q: number) => {
                if (q < 1) return;
                const next = [...cart];
                next[idx].qty = q;
                setCart(next);
              }}
              onRemoveItem={(idx: number) => {
                const next = [...cart];
                next.splice(idx, 1);
                setCart(next);
              }}
              onClear={() => setCart([])}
            />
          </section>
          
          <SummaryPanel 
            cart={cart}
            members={members}
            selectedMember={selectedMember}
            onSelectMember={setSelectedMember}
            onPay={() => { if(cart.length>0) setModals(m => ({...m, splitPayment: true})) }}
            onHold={() => alert('Fitur Tahan Transaksi (Placeholder)')}
            onReset={() => setCart([])}
          />
        </div>
      </main>

      <QuantityModal 
        isOpen={modals.qty}
        item={activeItemForQty}
        onClose={() => {
          setModals(m => ({...m, qty: false}));
          setTimeout(() => searchInputRef.current?.focus(), 100);
        }}
        onConfirm={handleConfirmQty}
      />
      
      <CameraScannerModal 
        isOpen={modals.camera}
        onClose={() => setModals(m => ({...m, camera: false}))}
        onScanSuccess={(text: string) => {
          setModals(m => ({...m, camera: false}));
          const product = products.find(p => p.sku === text);
          if (product) {
            handleSelectProduct({ barcode: product.sku, name: product.name, unit: product.unit, price: product.sell_price, stock: product.stock, id: product.id });
          } else {
            alert('Produk tidak ditemukan!');
          }
        }}
      />
      
      <SplitPaymentModal 
        isOpen={modals.splitPayment}
        onClose={() => setModals(m => ({...m, splitPayment: false}))}
        cart={cart}
        total={total}
        memberId={selectedMember?.id || null}
        onConfirm={handleCheckoutConfirm}
      />
      
      <ReceiptModal 
        isOpen={modals.receipt}
        cart={cart}
        subtotal={subtotal}
        discount={discount}
        total={total}
        payment={lastPayment}
        onClose={() => {
          setModals(m => ({...m, receipt: false}));
          setCart([]);
          setLastPayment(null);
          setTimeout(() => searchInputRef.current?.focus(), 100);
        }}
      />
    </div>
  );
}
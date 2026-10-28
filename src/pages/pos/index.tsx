import { useState, useRef, useEffect, useCallback } from 'react';
import POSHeader from '../../components/pos/POSHeader';
import ProductSearchInput from '../../components/pos/ProductSearchInput';
import CartTable from '../../components/pos/CartTable';
import SummaryPanel from '../../components/pos/SummaryPanel';
import QuantityModal from '../../components/pos/QuantityModal';
import CameraScannerModal from '../../components/pos/CameraScannerModal';
import ReceiptModal from '../../components/pos/ReceiptModal';
import SplitPaymentModal from '../../components/pos/SplitPaymentModal';
import ParkedTransactionsModal from '../../components/pos/ParkedTransactionsModal';
import { processCheckout } from '../../services/posCheckoutService';
import { holdTransaction, getParkedSales } from '../../services/posParkedService';
import { cleanupExpiredParkedSales } from '../../services/posSettingsService';
import { supabase } from '../../lib/supabaseClient';
import { Produk } from '../../services/koperasiService';
import { useFeedback } from '../../context/FeedbackContext';
import { getKoperasiProfile, KoperasiProfile } from '../../services/settingsService';

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
  const { showToast } = useFeedback();
  const [products, setProducts] = useState<Produk[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [selectedMember, setSelectedMember] = useState<any | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [activeItemForQty, setActiveItemForQty] = useState<Omit<CartItem, 'qty'> | null>(null);
  const [lastPayment, setLastPayment] = useState<any>(null);
  const [lastSaleNumber, setLastSaleNumber] = useState<string | null>(null);
  const [koperasiProfile, setKoperasiProfile] = useState<KoperasiProfile | null>(null);
  const [parkedCount, setParkedCount] = useState<number>(0);

  const [modals, setModals] = useState({
    qty: false,
    camera: false,
    receipt: false,
    splitPayment: false,
    parked: false,
  });
  const [initialPaymentMethod, setInitialPaymentMethod] = useState('Tunai');

  const searchInputRef = useRef<HTMLInputElement>(null);

  const loadProductCatalog = useCallback(() => {
    import('../../services/koperasiService').then(s => {
      s.getProduk().then(data => setProducts(data.filter(p => p.is_active && p.stock > 0)));
    });
  }, []);

  const refreshParkedCount = useCallback(async () => {
    try {
      const list = await getParkedSales();
      setParkedCount(list.length);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    getKoperasiProfile().then(setKoperasiProfile);
    loadProductCatalog();
    refreshParkedCount();

    // Auto-cleanup expired parked transactions on POS startup
    cleanupExpiredParkedSales().then(res => {
      if (res.success && res.cleanedCount > 0) {
        showToast(`Auto-restock: ${res.cleanedCount} transaksi kadaluwarsa dibersihkan.`, 'info');
        loadProductCatalog();
        refreshParkedCount();
      }
    });

    supabase.from('anggota').select('id, nrp, nama, take_home_pay').eq('status', 'aktif').then(({ data }) => {
      if (data && data.length > 0) {
        setMembers(data);
        setSelectedMember(data[0]); // default to first member
      }
    });
  }, [loadProductCatalog, refreshParkedCount, showToast]);

  const subtotal = cart.reduce((sum, i) => sum + (i.price * i.qty), 0);
  const discount = selectedMember ? subtotal * 0.05 : 0; 
  const total = subtotal - discount;

  const handleHoldTransaction = useCallback(async () => {
    if (cart.length === 0) {
      showToast('Keranjang masih kosong untuk ditahan.', 'warning');
      return;
    }

    try {
      const res = await holdTransaction({
        cart,
        member: selectedMember,
      });

      if (res.success) {
        const timeFormatted = res.expiresAt
          ? new Date(res.expiresAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
          : '';
        showToast(
          `Transaksi #${res.saleNumber} berhasil ditahan ${timeFormatted ? `(hingga ${timeFormatted} WIB)` : ''}. Stok direservasi.`,
          'success'
        );
        setCart([]);
        await refreshParkedCount();
        loadProductCatalog();
        setTimeout(() => searchInputRef.current?.focus(), 100);
      } else {
        showToast(res.error || 'Gagal menahan transaksi.', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Terjadi kesalahan sistem saat menahan transaksi', 'error');
    }
  }, [cart, selectedMember, showToast, refreshParkedCount, loadProductCatalog]);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleGlobalKeydown = (e: KeyboardEvent) => {
      // Don't trigger if a modal is open
      if (modals.qty || modals.camera || modals.receipt || modals.splitPayment || modals.parked) return;
      
      if ((e.ctrlKey && e.key === 'k') || e.key === 'F2') {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === 'F4') {
        if (cart.length > 0) {
          e.preventDefault();
          setActiveItemForQty(cart[cart.length - 1]);
          setModals(m => ({ ...m, qty: true }));
        }
      } else if (e.key === 'F8') {
        e.preventDefault();
        handleHoldTransaction();
      } else if (e.key === 'F9' || (e.key === ' ' && (e.target as HTMLElement).tagName !== 'INPUT')) {
        if (cart.length > 0) {
          e.preventDefault();
          setModals(m => ({ ...m, splitPayment: true }));
        }
      }
    };
    window.addEventListener('keydown', handleGlobalKeydown);
    return () => window.removeEventListener('keydown', handleGlobalKeydown);
  }, [modals, cart, handleHoldTransaction]);

  const handleSelectProduct = (product: Omit<CartItem, 'qty'>) => {
    setActiveItemForQty(product);
    setModals(m => ({ ...m, qty: true }));
  };

  const handleConfirmQty = (qty: number) => {
    setModals(m => ({ ...m, qty: false }));
    if (!activeItemForQty) return;
    
    setCart(prev => {
      const existing = prev.findIndex(p => p.barcode === activeItemForQty.barcode || p.id === activeItemForQty.id);
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
       setLastSaleNumber(res.saleNumber || null);
       setModals(m => ({ ...m, splitPayment: false, receipt: true }));
       loadProductCatalog();
    } else {
       showToast(res.error || 'Checkout gagal', 'error');
    }
  };

  const handleReloadParked = (items: CartItem[], memberId?: string | null) => {
    setCart(items);
    if (memberId && members.length > 0) {
      const found = members.find(m => m.id === memberId);
      if (found) setSelectedMember(found);
    }
    refreshParkedCount();
    loadProductCatalog();
    setTimeout(() => searchInputRef.current?.focus(), 100);
  };

  return (
    <div className="bg-background text-on-surface antialiased font-body-md select-none min-h-screen flex flex-col">
      <POSHeader 
        onOpenQty={() => { if(cart.length>0) setModals(m => ({...m, qty: true})) }}
        onOpenReceipt={() => { if(cart.length>0) setModals(m => ({...m, splitPayment: true})) }}
        onOpenCamera={() => setModals(m => ({...m, camera: true}))}
        onReset={() => setCart([])}
        onHold={handleHoldTransaction}
        onOpenParked={() => setModals(m => ({...m, parked: true}))}
        parkedCount={parkedCount}
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
            onPay={(method: string) => { 
              if(cart.length>0) {
                setInitialPaymentMethod(method);
                setModals(m => ({...m, splitPayment: true}));
              } 
            }}
            onHold={handleHoldTransaction}
            onReset={() => setCart([])}
            parkedCount={parkedCount}
            onOpenParked={() => setModals(m => ({...m, parked: true}))}
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
            showToast('Produk tidak ditemukan dalam katalog!', 'warning');
          }
        }}
      />
      
      <SplitPaymentModal 
        isOpen={modals.splitPayment}
        onClose={() => setModals(m => ({...m, splitPayment: false}))}
        cart={cart}
        total={total}
        memberId={selectedMember?.id || null}
        initialMethod={initialPaymentMethod}
        onConfirm={handleCheckoutConfirm}
      />
      
      <ReceiptModal 
        isOpen={modals.receipt}
        cart={cart}
        subtotal={subtotal}
        discount={discount}
        total={total}
        payment={lastPayment}
        saleNumber={lastSaleNumber}
        memberName={selectedMember ? `${selectedMember.nama} (${selectedMember.nrp})` : undefined}
        profile={koperasiProfile}
        onClose={() => {
          setModals(m => ({...m, receipt: false}));
          setCart([]);
          setLastPayment(null);
          setLastSaleNumber(null);
          setTimeout(() => searchInputRef.current?.focus(), 100);
        }}
      />

      <ParkedTransactionsModal
        isOpen={modals.parked}
        onClose={() => {
          setModals(m => ({...m, parked: false}));
          refreshParkedCount();
          loadProductCatalog();
          setTimeout(() => searchInputRef.current?.focus(), 100);
        }}
        onReload={handleReloadParked}
      />
    </div>
  );
}

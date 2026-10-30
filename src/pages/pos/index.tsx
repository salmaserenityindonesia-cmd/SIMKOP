import { useState, useRef, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import POSHeader from '../../components/pos/POSHeader';
import ProductSearchInput from '../../components/pos/ProductSearchInput';
import CartTable from '../../components/pos/CartTable';
import SummaryPanel from '../../components/pos/SummaryPanel';
import QuantityModal from '../../components/pos/QuantityModal';
import CameraScannerModal from '../../components/pos/CameraScannerModal';
import ReceiptModal from '../../components/pos/ReceiptModal';
import SplitPaymentModal from '../../components/pos/SplitPaymentModal';
import ParkedTransactionsModal from '../../components/pos/ParkedTransactionsModal';
import BukaKasirModal from '../../components/pos/BukaKasirModal';
import TutupKasirModal from '../../components/pos/TutupKasirModal';
import { processCheckout } from '../../services/posCheckoutService';
import { holdTransaction, getParkedSales } from '../../services/posParkedService';
import { cleanupExpiredParkedSales, getPosSettings } from '../../services/posSettingsService';
import { getActiveShift, CashierShift } from '../../services/cashierShiftService';
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
  const [searchParams] = useSearchParams();
  const { showToast } = useFeedback();
  const [products, setProducts] = useState<Produk[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [selectedMember, setSelectedMember] = useState<any | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [activeItemForQty, setActiveItemForQty] = useState<Omit<CartItem, 'qty'> | null>(null);
  const [qtyModalMode, setQtyModalMode] = useState<'add' | 'edit'>('add');
  const [lastPayment, setLastPayment] = useState<any>(null);
  const [lastSaleNumber, setLastSaleNumber] = useState<string | null>(null);
  const [koperasiProfile, setKoperasiProfile] = useState<KoperasiProfile | null>(null);
  const [parkedCount, setParkedCount] = useState<number>(0);
  const [memberDiscountPercentage, setMemberDiscountPercentage] = useState<number>(5.0);

  // Shift & Cashier State
  const [activeShift, setActiveShift] = useState<CashierShift | null>(null);
  const [currentCashier, setCurrentCashier] = useState<{ id: string; nama?: string } | null>(null);

  const [modals, setModals] = useState({
    qty: false,
    camera: false,
    receipt: false,
    splitPayment: false,
    parked: false,
    bukaKasir: false,
    tutupKasir: false,
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
    async function initSession() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        let cashierInfo = {
          id: user?.id || '00000000-0000-0000-0000-000000000000',
          nama: 'Kasir POS',
        };

        if (user?.id) {
          const { data: pengelola } = await supabase
            .from('pengelola')
            .select('id, nama')
            .eq('id', user.id)
            .single();
          if (pengelola?.nama) {
            cashierInfo = { id: pengelola.id, nama: pengelola.nama };
          }
        }
        setCurrentCashier(cashierInfo);

        const shift = await getActiveShift(cashierInfo.id);
        if (shift) {
          setActiveShift(shift);
        } else {
          setActiveShift(null);
          setModals(m => ({ ...m, bukaKasir: true }));
        }
      } catch (err) {
        console.warn('Gagal memuat active shift:', err);
        const shift = await getActiveShift();
        if (shift) {
          setActiveShift(shift);
        } else {
          setActiveShift(null);
          setModals(m => ({ ...m, bukaKasir: true }));
        }
      }
    }

    initSession();
    getKoperasiProfile().then(setKoperasiProfile);
    getPosSettings().then(s => {
      if (s && typeof s.member_discount_percentage === 'number') {
        setMemberDiscountPercentage(s.member_discount_percentage);
      }
    }).catch(err => {
      console.warn('Gagal memuat pengaturan POS:', err);
    });
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

  useEffect(() => {
    if (searchParams.get('view') === 'parked') {
      setModals(m => ({ ...m, parked: true }));
    }
  }, [searchParams]);

  const subtotal = cart.reduce((sum, i) => sum + (i.price * i.qty), 0);
  const discount = selectedMember ? subtotal * (memberDiscountPercentage / 100) : 0; 
  const total = subtotal - discount;

  const handleHoldTransaction = useCallback(async () => {
    if (!activeShift) {
      showToast('Harap buka shift kasir terlebih dahulu.', 'warning');
      setModals(m => ({ ...m, bukaKasir: true }));
      return;
    }

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
  }, [cart, selectedMember, activeShift, showToast, refreshParkedCount, loadProductCatalog]);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleGlobalKeydown = (e: KeyboardEvent) => {
      // Don't trigger if a modal is open
      if (modals.qty || modals.camera || modals.receipt || modals.splitPayment || modals.parked || modals.bukaKasir || modals.tutupKasir) return;
      
      if (e.key === 'F1') {
        e.preventDefault();
        if (!activeShift) {
          setModals(m => ({ ...m, bukaKasir: true }));
        } else {
          setModals(m => ({ ...m, tutupKasir: true }));
        }
        return;
      }

      if ((e.ctrlKey && e.key === 'k') || e.key === 'F2') {
        e.preventDefault();
        if (!activeShift) {
          showToast('Harap buka shift kasir terlebih dahulu.', 'warning');
          setModals(m => ({ ...m, bukaKasir: true }));
          return;
        }
        searchInputRef.current?.focus();
      } else if (e.key === 'F4') {
        if (!activeShift) {
          e.preventDefault();
          showToast('Harap buka shift kasir terlebih dahulu.', 'warning');
          setModals(m => ({ ...m, bukaKasir: true }));
          return;
        }
        if (cart.length > 0) {
          e.preventDefault();
          setActiveItemForQty(cart[cart.length - 1]);
          setQtyModalMode('edit');
          setModals(m => ({ ...m, qty: true }));
        }
      } else if (e.key === 'F8') {
        e.preventDefault();
        handleHoldTransaction();
      } else if (e.key === 'F9' || (e.key === ' ' && (e.target as HTMLElement).tagName !== 'INPUT')) {
        if (!activeShift) {
          e.preventDefault();
          showToast('Harap buka shift kasir terlebih dahulu.', 'warning');
          setModals(m => ({ ...m, bukaKasir: true }));
          return;
        }
        if (cart.length > 0) {
          e.preventDefault();
          if (!selectedMember) {
            setInitialPaymentMethod('Tunai');
          }
          setModals(m => ({ ...m, splitPayment: true }));
        }
      }
    };
    window.addEventListener('keydown', handleGlobalKeydown);
    return () => window.removeEventListener('keydown', handleGlobalKeydown);
  }, [modals, cart, activeShift, handleHoldTransaction, showToast, selectedMember]);

  const handleSelectProduct = (product: Omit<CartItem, 'qty'>) => {
    if (!activeShift) {
      showToast('Harap buka shift kasir terlebih dahulu.', 'warning');
      setModals(m => ({ ...m, bukaKasir: true }));
      return;
    }
    setActiveItemForQty(product);
    setQtyModalMode('add');
    setModals(m => ({ ...m, qty: true }));
  };

  const handleConfirmQty = (qty: number) => {
    setModals(m => ({ ...m, qty: false }));
    if (!activeItemForQty) return;
    
    const parsedQty = Math.max(1, parseInt(String(qty), 10) || 1);

    setCart(prev => {
      const existing = prev.findIndex(p => p.barcode === activeItemForQty.barcode || p.id === activeItemForQty.id);
      if (existing >= 0) {
        const next = [...prev];
        if (qtyModalMode === 'edit') {
          // Exact replacement when editing via F4
          next[existing].qty = parsedQty;
        } else {
          // Additive when scanning or selecting a product
          next[existing].qty += parsedQty;
        }
        return next;
      }
      return [...prev, { ...activeItemForQty, qty: parsedQty }];
    });
    
    // focus back to search after small delay
    setTimeout(() => searchInputRef.current?.focus(), 100);
  };

  const handleCheckoutConfirm = async (payload: { paidCash: number; paidDeposit: number; paidCredit: number; scheme: string }) => {
    if (!activeShift) {
      showToast('Shift kasir belum aktif! Harap buka shift kasir terlebih dahulu.', 'error');
      setModals(m => ({ ...m, bukaKasir: true }));
      return;
    }

    const cashierId = activeShift.cashier_id || currentCashier?.id || null;
    const res = await processCheckout({
      memberId: selectedMember?.id || null,
      cashierId,
      shiftId: activeShift.id,
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
      if (found) {
        setSelectedMember(found);
      } else {
        setSelectedMember(null);
        setInitialPaymentMethod('Tunai');
      }
    } else {
      setSelectedMember(null);
      setInitialPaymentMethod('Tunai');
    }
    refreshParkedCount();
    loadProductCatalog();
    setTimeout(() => searchInputRef.current?.focus(), 100);
  };

  return (
    <div className="bg-background text-on-surface antialiased font-body-md select-none min-h-screen flex flex-col">
      <POSHeader 
        onOpenQty={() => { 
          if (!activeShift) {
            showToast('Harap buka shift kasir terlebih dahulu.', 'warning');
            setModals(m => ({ ...m, bukaKasir: true }));
            return;
          }
          if (cart.length > 0) {
            setActiveItemForQty(cart[cart.length - 1]);
            setQtyModalMode('edit');
            setModals(m => ({ ...m, qty: true }));
          }
        }}
        onOpenReceipt={() => { 
          if (!activeShift) {
            showToast('Harap buka shift kasir terlebih dahulu.', 'warning');
            setModals(m => ({ ...m, bukaKasir: true }));
            return;
          }
          if(cart.length>0) {
            if (!selectedMember) {
              setInitialPaymentMethod('Tunai');
            }
            setModals(m => ({...m, splitPayment: true}));
          }
        }}
        onOpenCamera={() => {
          if (!activeShift) {
            showToast('Harap buka shift kasir terlebih dahulu.', 'warning');
            setModals(m => ({ ...m, bukaKasir: true }));
            return;
          }
          setModals(m => ({...m, camera: true}));
        }}
        onReset={() => setCart([])}
        onHold={handleHoldTransaction}
        onOpenParked={() => setModals(m => ({...m, parked: true}))}
        parkedCount={parkedCount}
        activeShift={activeShift}
        onOpenBukaKasir={() => setModals(m => ({ ...m, bukaKasir: true }))}
        onOpenTutupKasir={() => setModals(m => ({ ...m, tutupKasir: true }))}
      />
      
      <main className="w-full max-w-[1720px] mx-auto p-3 lg:p-4 flex-1 flex flex-col gap-3">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start flex-1">
          <section className="lg:col-span-8 flex flex-col gap-3 h-full">
            <ProductSearchInput 
              products={products}
              searchRef={searchInputRef}
              disabled={!activeShift}
              onSelectProduct={handleSelectProduct}
              onOpenCamera={() => {
                if (!activeShift) {
                  showToast('Harap buka shift kasir terlebih dahulu.', 'warning');
                  setModals(m => ({ ...m, bukaKasir: true }));
                  return;
                }
                setModals(m => ({...m, camera: true}));
              }}
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
            memberDiscountPercentage={memberDiscountPercentage}
            onSelectMember={(member: any) => {
              setSelectedMember(member);
              if (!member) {
                setInitialPaymentMethod('Tunai');
              }
            }}
            isShiftActive={!!activeShift}
            onPay={(method: string) => { 
              if (!activeShift) {
                showToast('Harap buka shift kasir terlebih dahulu.', 'warning');
                setModals(m => ({ ...m, bukaKasir: true }));
                return;
              }
              if(cart.length>0) {
                const effectiveMethod = !selectedMember ? 'Tunai' : method;
                setInitialPaymentMethod(effectiveMethod);
                setModals(m => ({...m, splitPayment: true}));
              } 
            }}
            onHold={handleHoldTransaction}
            onReset={() => {
              setCart([]);
              setInitialPaymentMethod('Tunai');
            }}
            parkedCount={parkedCount}
            onOpenParked={() => setModals(m => ({...m, parked: true}))}
          />
        </div>
      </main>

      <QuantityModal 
        isOpen={modals.qty}
        item={activeItemForQty}
        mode={qtyModalMode}
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
        selectedMember={selectedMember}
        initialMethod={!selectedMember ? 'Tunai' : initialPaymentMethod}
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
        cashierName={activeShift?.cashier_name || currentCashier?.nama || 'Kasir POS'}
        profile={koperasiProfile}
        discountPercentage={memberDiscountPercentage}
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

      {/* Modal Buka Kasir Baru */}
      <BukaKasirModal
        isOpen={modals.bukaKasir}
        cashierId={currentCashier?.id}
        cashierName={currentCashier?.nama || 'Kasir POS'}
        canCancel={activeShift !== null}
        onClose={() => setModals(m => ({ ...m, bukaKasir: false }))}
        onSuccess={(shift) => {
          setActiveShift(shift);
          setModals(m => ({ ...m, bukaKasir: false }));
          setTimeout(() => searchInputRef.current?.focus(), 150);
        }}
      />

      {/* Modal Tutup Kasir & Rekonsiliasi Z-Report */}
      <TutupKasirModal
        isOpen={modals.tutupKasir}
        shift={activeShift}
        onClose={() => setModals(m => ({ ...m, tutupKasir: false }))}
        onSuccess={(_closedShift) => {
          setActiveShift(null);
          setCart([]);
          setModals(m => ({ ...m, tutupKasir: false, bukaKasir: true }));
        }}
      />
    </div>
  );
}

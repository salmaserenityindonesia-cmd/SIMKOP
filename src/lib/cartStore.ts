import { useState, useMemo } from 'react';

export interface CartItem {
  id: string;
  name: string;
  price: number;
  qty: number;
  subtotal: number;
}

export interface ParkedTransaction {
  id: string;
  note: string;
  timestamp: number;
  items: CartItem[];
}

export function useCart() {
  const [items, setItems] = useState<CartItem[]>([]);
  const [parkedTransactions, setParkedTransactions] = useState<ParkedTransaction[]>([]);

  const addItem = (newItem: Omit<CartItem, 'qty' | 'subtotal'>) => {
    setItems((prev) => {
      const existing = prev.find((item) => item.id === newItem.id);
      if (existing) {
        return prev.map((item) =>
          item.id === newItem.id
            ? { ...item, qty: item.qty + 1, subtotal: (item.qty + 1) * item.price }
            : item
        );
      }
      return [...prev, { ...newItem, qty: 1, subtotal: newItem.price }];
    });
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const updateQty = (id: string, qty: number) => {
    if (qty <= 0) {
      removeItem(id);
      return;
    }
    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, qty, subtotal: qty * item.price } : item
      )
    );
  };

  const clearCart = () => setItems([]);

  const parkCurrentTransaction = (note: string) => {
    if (items.length === 0) return;
    const newParked: ParkedTransaction = {
      id: Date.now().toString(),
      note,
      timestamp: Date.now(),
      items: [...items],
    };
    setParkedTransactions((prev) => [...prev, newParked]);
    clearCart();
  };

  const resumeTransaction = (id: string) => {
    setParkedTransactions((prev) => {
      const tx = prev.find((p) => p.id === id);
      if (tx) {
        setItems(tx.items);
        return prev.filter((p) => p.id !== id);
      }
      return prev;
    });
  };

  const total = useMemo(() => items.reduce((sum, item) => sum + item.subtotal, 0), [items]);

  return {
    items,
    parkedTransactions,
    addItem,
    removeItem,
    updateQty,
    clearCart,
    parkCurrentTransaction,
    resumeTransaction,
    total,
  };
}

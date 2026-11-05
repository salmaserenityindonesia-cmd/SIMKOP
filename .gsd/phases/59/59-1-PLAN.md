---
phase: 59
plan: 1
wave: 1
depends_on: []
gap_closure: false
---

# Plan 59.1: Database RPC for Atomic Balance Deduction & Service Layer Integration

## Objective
Membangun fondasi database berupa RPC aman `process_pos_deposit_payment` untuk validasi dan pemotongan saldo Simpanan Belanja anggota secara atomik saat checkout kasir, serta mengintegrasikan pemanggilan RPC tersebut pada `posCheckoutService.ts`.

## Context
- `supabase/migrations/036_pos_spending_from_savings_function.sql`
- `src/services/posCheckoutService.ts`
- `src/services/posCheckoutService.test.ts`
- `.gsd/phases/59/RESEARCH.md`

## Tasks

<task type="auto">
  <name>Create Database RPC for POS Deposit Spending</name>
  <files>
    supabase/migrations/036_pos_spending_from_savings_function.sql
  </files>
  <action>
    Buat berkas migrasi `supabase/migrations/036_pos_spending_from_savings_function.sql`:
    ```sql
    -- Migration: 036_pos_spending_from_savings_function.sql
    -- Description: Fungsi RPC aman dan atomik untuk validasi serta pemotongan saldo Simpanan Belanja saat checkout kasir POS.

    CREATE OR REPLACE FUNCTION public.process_pos_deposit_payment(
      p_member_id UUID,
      p_amount NUMERIC,
      p_sale_id UUID,
      p_invoice_number TEXT,
      p_cashier_id UUID DEFAULT NULL
    ) RETURNS JSONB AS $$
    DECLARE
      v_deposit_account_id UUID;
      v_current_balance NUMERIC := 0;
    BEGIN
      -- 1. Validasi input nominal
      IF p_amount IS NULL OR p_amount <= 0 THEN
        RETURN jsonb_build_object('success', false, 'message', 'Nominal pemotongan simpanan harus lebih besar dari 0.');
      END IF;

      -- 2. Cari akun rekening simpanan belanja anggota aktif
      SELECT md.id INTO v_deposit_account_id
      FROM public.member_deposits md
      JOIN public.deposit_types dt ON dt.id = md.deposit_type_id
      WHERE md.member_id = p_member_id
        AND (dt.code = 'BELANJA' OR dt.code = 'SB' OR dt.name ILIKE '%belanja%')
        AND md.is_terminated = false
      LIMIT 1;

      IF v_deposit_account_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Anggota tidak memiliki rekening Simpanan Belanja aktif.');
      END IF;

      -- 3. Hitung saldo kas riil belanja saat ini (Setoran - Penarikan/Belanja terdahulu)
      SELECT COALESCE(
        SUM(
          CASE 
            WHEN transaction_type = 'deposit' THEN amount 
            WHEN transaction_type = 'withdrawal' THEN -amount 
            ELSE 0 
          END
        ), 0
      ) INTO v_current_balance
      FROM public.deposit_transactions
      WHERE member_deposit_id = v_deposit_account_id;

      -- 4. Validasi kecukupan saldo (mencegah overdraft)
      IF v_current_balance < p_amount THEN
        RETURN jsonb_build_object(
          'success', false, 
          'message', 'Saldo Simpanan Belanja tidak mencukupi (Saldo: Rp ' || v_current_balance::text || ', Dibutuhkan: Rp ' || p_amount::text || ')'
        );
      END IF;

      -- 5. Sisipkan catatan mutasi pengeluaran belanja kasir
      INSERT INTO public.deposit_transactions (
        member_deposit_id,
        transaction_type,
        amount,
        description,
        reference_no,
        payment_method,
        notes,
        created_by,
        created_at
      ) VALUES (
        v_deposit_account_id,
        'withdrawal',
        p_amount,
        'Belanja Toko di Kasir POS (' || p_invoice_number || ')',
        p_invoice_number,
        'potong_simpanan_belanja',
        'Transaksi penjualan POS ID: ' || COALESCE(p_sale_id::text, '-'),
        p_cashier_id,
        TIMEZONE('utc'::text, NOW())
      );

      RETURN jsonb_build_object(
        'success', true, 
        'remaining_balance', v_current_balance - p_amount,
        'deducted_amount', p_amount
      );
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;

    GRANT EXECUTE ON FUNCTION public.process_pos_deposit_payment(UUID, NUMERIC, UUID, TEXT, UUID) TO authenticated, anon, service_role;
    ```
  </action>
  <verify>
    Periksa sintaks SQL migration secara mandiri dan pastikan idempotensi `CREATE OR REPLACE FUNCTION` serta penanganan tipe data numerik dan UUID aman.
  </verify>
  <done>
    Berkas migrasi RPC `036_pos_spending_from_savings_function.sql` siap digunakan.
  </done>
</task>

<task type="auto">
  <name>Integrate RPC in posCheckoutService</name>
  <files>
    src/services/posCheckoutService.ts
    src/services/posCheckoutService.test.ts
  </files>
  <action>
    1. Buka `src/services/posCheckoutService.ts`:
       - Pada langkah pemotongan simpanan (`payload.paidDeposit > 0 && payload.memberId`):
         - Panggil `supabase.rpc('process_pos_deposit_payment', ...)`:
           ```typescript
           if (payload.paidDeposit > 0 && payload.memberId) {
             let rpcExecuted = false;
             if (supabase.rpc && typeof supabase.rpc === 'function') {
               const { data: rpcRes, error: rpcErr } = await supabase.rpc('process_pos_deposit_payment', {
                 p_member_id: payload.memberId,
                 p_amount: payload.paidDeposit,
                 p_sale_id: saleId,
                 p_invoice_number: saleNumber,
                 p_cashier_id: payload.cashierId
               });
               if (rpcErr) {
                 throw new Error(rpcErr.message || 'Gagal memproses pemotongan Simpanan Belanja');
               }
               if (rpcRes && rpcRes.success === false) {
                 throw new Error(rpcRes.message || 'Saldo Simpanan Belanja tidak mencukupi');
               }
               rpcExecuted = true;
             }

             // Fallback aman untuk mock/environment tanpa RPC
             if (!rpcExecuted) {
               // ... fallback client insert with reference_no & payment_method
             }
           }
           ```
    2. Tambahkan / sesuaikan unit test pada `src/services/posCheckoutService.test.ts` untuk memverifikasi alur pemanggilan RPC pemotongan simpanan belanja dan penanganan error jika saldo tidak mencukupi.
  </action>
  <verify>
    npx vitest run src/services/posCheckoutService.test.ts
  </verify>
  <done>
    `posCheckoutService.ts` terintegrasi dengan RPC database pemotongan simpanan belanja secara atomik.
  </done>
</task>

## Success Criteria
- [ ] Berkas migrasi `036_pos_spending_from_savings_function.sql` terdefinisi dengan validasi saldo dan pencatatan mutasi penarikan.
- [ ] `posCheckoutService.ts` memanggil RPC `process_pos_deposit_payment` saat `paidDeposit > 0`.
- [ ] Rangkaian unit test di `posCheckoutService.test.ts` lulus 100%.

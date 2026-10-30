import { describe, it, expect, vi, beforeEach } from 'vitest';
import { insertAuditLog } from './auditService';
import { supabase } from '../lib/supabaseClient';

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn()
  }
}));

describe('auditService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should insert audit log with mandatory table_name, action, and record_id non-null', async () => {
    const mockInsert = vi.fn().mockResolvedValue({ data: [{ id: 'audit-1' }], error: null });
    (supabase.from as any).mockReturnValue({ insert: mockInsert });

    const payload = {
      table_name: 'purchases',
      action: 'UPDATE',
      record_id: 'purchase-123',
      old_data: { noFaktur: 'INV-001' },
      new_data: { noFaktur: 'INV-001-REV' },
      performed_by: 'user-uuid-1',
      performer_name: 'Budi Santoso',
      notes: 'Koreksi faktur pembelian',
      entity_name: 'purchases',
      entity_id: 'purchase-123'
    };

    const res = await insertAuditLog(payload);

    expect(supabase.from).toHaveBeenCalledWith('audit_logs');
    expect(mockInsert).toHaveBeenCalledWith({
      table_name: 'purchases',
      action: 'UPDATE',
      record_id: 'purchase-123',
      old_data: { noFaktur: 'INV-001' },
      new_data: { noFaktur: 'INV-001-REV' },
      performed_by: 'user-uuid-1',
      performer_name: 'Budi Santoso',
      notes: 'Koreksi faktur pembelian',
      entity_name: 'purchases',
      entity_id: 'purchase-123'
    });
    expect(res).toEqual({ data: [{ id: 'audit-1' }], error: null });
  });

  it('should fallback table_name and action to purchases and UPDATE when empty', async () => {
    const mockInsert = vi.fn().mockResolvedValue({ data: null, error: null });
    (supabase.from as any).mockReturnValue({ insert: mockInsert });

    await insertAuditLog({
      table_name: '',
      action: '',
      record_id: 'purchase-999'
    });

    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
      table_name: 'purchases',
      action: 'UPDATE',
      record_id: 'purchase-999',
      entity_name: 'purchases',
      entity_id: 'purchase-999'
    }));
  });
});

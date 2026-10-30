import { supabase } from '../lib/supabaseClient';

export interface AuditLogInsertPayload {
  table_name: string;
  action: string;
  record_id: string;
  old_data?: any;
  new_data?: any;
  performed_by?: string | null;
  performer_name?: string | null;
  notes?: string | null;
  entity_name?: string;
  entity_id?: string;
}

/**
 * Menyisipkan entri ke public.audit_logs dengan memastikan seluruh kolom wajib
 * (table_name, action, record_id) tidak pernah bernilai null.
 */
export async function insertAuditLog(payload: AuditLogInsertPayload) {
  const finalTableName = payload.table_name || 'purchases';
  const finalAction = payload.action || 'UPDATE';
  const finalRecordId = String(payload.record_id || '');

  return await supabase.from('audit_logs').insert({
    table_name: finalTableName, // WAJIB: kolom NOT NULL
    action: finalAction,         // WAJIB: kolom NOT NULL
    record_id: finalRecordId,    // WAJIB: kolom NOT NULL (text)
    old_data: payload.old_data ?? null,
    new_data: payload.new_data ?? null,
    performed_by: payload.performed_by || null,
    performer_name: payload.performer_name || null,
    notes: payload.notes || null,
    entity_name: payload.entity_name || finalTableName,
    entity_id: payload.entity_id || finalRecordId,
  });
}

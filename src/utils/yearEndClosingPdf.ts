import type jsPDF from 'jspdf';
import {
  exportYearEndRatBeritaAcaraPdf,
  type ExportYearEndRatBeritaAcaraPdfParams,
} from './yearEndClosingPdfExporter';

export type ExportYearEndClosingPdfParams = ExportYearEndRatBeritaAcaraPdfParams;

/**
 * Wrapper kompatibilitas mundur: mendelegasikan pembuatan PDF Berita Acara RAT
 * ke generator multi-lampiran `exportYearEndRatBeritaAcaraPdf`.
 */
export function exportYearEndClosingPdf(
  params: ExportYearEndClosingPdfParams
): jsPDF {
  return exportYearEndRatBeritaAcaraPdf(params);
}

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import SavingsMatrixImportModal, {
  DEPOSIT_TYPE_OPTIONS,
  parseFileWrapper,
  executeImportWrapper
} from './SavingsMatrixImportModal';
import * as savingsMatrixImporter from '../../utils/savingsMatrixImporter';
import * as complianceService from '../../services/complianceService';

describe('SavingsMatrixImportModal Component & Import Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Static UI Structure & Render States', () => {
    it('returns null when isOpen is false', () => {
      const html = renderToStaticMarkup(
        <SavingsMatrixImportModal
          isOpen={false}
          onClose={vi.fn()}
          onSuccess={vi.fn()}
        />
      );
      expect(html).toBe('');
    });

    it('renders modal header, deposit type selector, and upload dropzone when isOpen is true', () => {
      const html = renderToStaticMarkup(
        <SavingsMatrixImportModal
          isOpen={true}
          onClose={vi.fn()}
          onSuccess={vi.fn()}
          defaultType="WAJIB"
        />
      );

      // Header title & subtitle
      expect(html).toContain('Impor Matriks Buku Besar Simpanan (.xlsx)');
      expect(html).toContain('Unggah matriks hasil audit untuk sinkronisasi mutasi bulanan ke buku besar');

      // Deposit type options
      expect(html).toContain('Simpanan Wajib');
      expect(html).toContain('Simpanan Belanja Bulanan');
      expect(html).toContain('Simpanan Hari Raya (Lebaran)');

      // Dropzone
      expect(html).toContain('Tarik &amp; letakkan berkas Excel (.xlsx) di sini');
      expect(html).toContain('Format kolom: NRP, Nama, Saldo Acuan, &amp; Bulan (Jan - Des)');

      // Action buttons
      expect(html).toContain('Batal');
      expect(html).toContain('Mulai Impor &amp; Sinkronkan Buku Besar');
    });

    it('renders with defaultType as BELANJA or LEBARAN', () => {
      const html = renderToStaticMarkup(
        <SavingsMatrixImportModal
          isOpen={true}
          onClose={vi.fn()}
          onSuccess={vi.fn()}
          initialType="LEBARAN"
        />
      );

      // LEBARAN badge 'SL' has active styling
      expect(html).toContain('data-testid="deposit-type-LEBARAN"');
      expect(html).toContain('SL');
    });

    it('renders parse summary panel when parseResult is provided and valid', () => {
      const mockResult: savingsMatrixImporter.ParseSavingsMatrixResult = {
        success: true,
        totalRows: 45,
        totalMutations: 120,
        mutations: [
          { nrp: '1001', year: 2024, month: 1, amount: 150000 },
          { nrp: '1002', year: 2024, month: 2, amount: 150000 }
        ],
        errors: [],
        detectedMonths: [
          { colIndex: 5, year: 2024, month: 1, label: 'Jan 2024' },
          { colIndex: 6, year: 2024, month: 2, label: 'Feb 2024' }
        ]
      };

      const html = renderToStaticMarkup(
        <SavingsMatrixImportModal
          isOpen={true}
          onClose={vi.fn()}
          onSuccess={vi.fn()}
          initialFile={{ name: 'audit_simpanan_wajib.xlsx' }}
          initialParseResult={mockResult}
        />
      );

      expect(html).toContain('audit_simpanan_wajib.xlsx');
      expect(html).toContain('Pratinjau Berkas Terverifikasi');
      expect(html).toContain('45 Baris');
      expect(html).toContain('120 Transaksi');
      expect(html).toContain('2 Bulan');
      expect(html).toContain('Jan 2024');
      expect(html).toContain('Feb 2024');
      expect(html).toContain('mencegah duplikasi data (double-counting)');
    });

    it('renders progress bar and spinner during active import', () => {
      const html = renderToStaticMarkup(
        <SavingsMatrixImportModal
          isOpen={true}
          onClose={vi.fn()}
          onSuccess={vi.fn()}
          initialIsImporting={true}
          initialProgress={{ processed: 50, total: 100, percent: 50 }}
        />
      );

      expect(html).toContain('Sinkronisasi Buku Besar...');
      expect(html).toContain('50%');
      expect(html).toContain('Memproses 50 dari 100 mutasi...');
      expect(html).toContain('Menyinkronkan...');
    });

    it('renders dynamic member progress (Memproses anggota X dari Y...) when memberIndex is provided', () => {
      const html = renderToStaticMarkup(
        <SavingsMatrixImportModal
          isOpen={true}
          onClose={vi.fn()}
          onSuccess={vi.fn()}
          initialIsImporting={true}
          initialProgress={{
            processed: 60,
            total: 120,
            percent: 50,
            memberIndex: 14,
            totalMembers: 28,
            currentMember: 'Oki Sanjaya'
          }}
        />
      );

      expect(html).toContain('Sinkronisasi Buku Besar...');
      expect(html).toContain('50%');
      expect(html).toContain('Memproses anggota 14 dari 28...');
    });
  });

  describe('Wrapper & Service Integration Tests', () => {
    it('parseFileWrapper forwards call to parseSavingsMatrixExcel', async () => {
      const spy = vi.spyOn(savingsMatrixImporter, 'parseSavingsMatrixExcel').mockResolvedValueOnce({
        success: true,
        totalRows: 10,
        totalMutations: 20,
        mutations: [],
        errors: [],
        detectedMonths: []
      });

      const dummyFile = new File(['dummy'], 'test.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });

      const res = await parseFileWrapper(dummyFile);
      expect(spy).toHaveBeenCalledWith(dummyFile);
      expect(res.totalRows).toBe(10);
      expect(res.totalMutations).toBe(20);
    });

    it('executeImportWrapper forwards call to importSavingsMatrixLedger with progress callback', async () => {
      const spy = vi.spyOn(complianceService, 'importSavingsMatrixLedger').mockImplementation(
        async (_type, _mutations, onProgress) => {
          onProgress?.({ processed: 2, total: 2, percent: 100 });
          return {
            success: true,
            totalMembers: 2,
            totalTransactions: 2,
            errors: []
          };
        }
      );

      const progressLogs: complianceService.ImportSavingsMatrixProgress[] = [];
      const res = await executeImportWrapper(
        'WAJIB',
        [
          { nrp: '101', year: 2024, month: 1, amount: 150000 },
          { nrp: '102', year: 2024, month: 1, amount: 150000 }
        ],
        (p) => progressLogs.push(p)
      );

      expect(spy).toHaveBeenCalled();
      expect(res.success).toBe(true);
      expect(res.totalMembers).toBe(2);
      expect(progressLogs.length).toBe(1);
      expect(progressLogs[0].percent).toBe(100);
    });

    it('contains all 3 supported deposit types in DEPOSIT_TYPE_OPTIONS', () => {
      const ids = DEPOSIT_TYPE_OPTIONS.map(o => o.id);
      expect(ids).toEqual(['WAJIB', 'BELANJA', 'LEBARAN']);
      expect(DEPOSIT_TYPE_OPTIONS[0].badge).toBe('SW');
      expect(DEPOSIT_TYPE_OPTIONS[1].badge).toBe('SB');
      expect(DEPOSIT_TYPE_OPTIONS[2].badge).toBe('SL');
    });
  });
});

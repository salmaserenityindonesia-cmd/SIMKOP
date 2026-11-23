import { describe, it, expect, vi } from 'vitest';
import { fetchAllPaginated } from './supabasePagination';

describe('fetchAllPaginated', () => {
  it('mengembalikan semua data dalam satu halaman jika jumlah baris kurang dari pageSize', async () => {
    const rows = [{ id: '1' }, { id: '2' }, { id: '3' }];
    const buildQuery = vi.fn().mockResolvedValue({ data: rows, error: null });

    const result = await fetchAllPaginated<{ id: string }>(buildQuery, 1000);

    expect(result).toEqual(rows);
    expect(buildQuery).toHaveBeenCalledTimes(1);
    expect(buildQuery).toHaveBeenCalledWith(0, 999);
  });

  it('melakukan paginasi berulang hingga seluruh data (> 1.000 baris) terambil tanpa terpotong', async () => {
    const page1 = Array.from({ length: 1000 }, (_, i) => ({ id: `row-${i + 1}` }));
    const page2 = Array.from({ length: 250 }, (_, i) => ({ id: `row-${1000 + i + 1}` }));

    const buildQuery = vi.fn().mockImplementation((from: number) => {
      if (from === 0) return Promise.resolve({ data: page1, error: null });
      if (from === 1000) return Promise.resolve({ data: page2, error: null });
      return Promise.resolve({ data: [], error: null });
    });

    const result = await fetchAllPaginated<{ id: string }>(buildQuery, 1000);

    expect(result).toHaveLength(1250);
    expect(result[0].id).toBe('row-1');
    expect(result[1249].id).toBe('row-1250');
    expect(buildQuery).toHaveBeenCalledTimes(2);
    expect(buildQuery).toHaveBeenNthCalledWith(1, 0, 999);
    expect(buildQuery).toHaveBeenNthCalledWith(2, 1000, 1999);
  });

  it('berhenti dengan bersih ketika halaman tepat sama dengan pageSize dan halaman berikutnya kosong', async () => {
    const page1 = Array.from({ length: 1000 }, (_, i) => ({ id: `exact-${i + 1}` }));

    const buildQuery = vi.fn().mockImplementation((from: number) => {
      if (from === 0) return Promise.resolve({ data: page1, error: null });
      return Promise.resolve({ data: [], error: null });
    });

    const result = await fetchAllPaginated<{ id: string }>(buildQuery, 1000);

    expect(result).toHaveLength(1000);
    expect(buildQuery).toHaveBeenCalledTimes(2);
    expect(buildQuery).toHaveBeenNthCalledWith(1, 0, 999);
    expect(buildQuery).toHaveBeenNthCalledWith(2, 1000, 1999);
  });

  it('melempar error ketika query mengembalikan error', async () => {
    const dbError = { message: 'Database connection failed', code: '500' };
    const buildQuery = vi.fn().mockResolvedValue({ data: null, error: dbError });

    await expect(fetchAllPaginated(buildQuery, 1000)).rejects.toEqual(dbError);
    expect(buildQuery).toHaveBeenCalledTimes(1);
  });
});

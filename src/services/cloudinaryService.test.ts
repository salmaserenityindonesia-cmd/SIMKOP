import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { uploadLogoToCloudinary } from './cloudinaryService';

describe('cloudinaryService', () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...import.meta.env };

  beforeEach(() => {
    vi.clearAllMocks();
    (import.meta.env as any).VITE_CLOUDINARY_CLOUD_NAME = 'test_cloud';
    (import.meta.env as any).VITE_CLOUDINARY_UPLOAD_PRESET = 'test_preset';
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    Object.assign(import.meta.env, originalEnv);
  });

  it('should throw an error if file size exceeds 2MB limit', async () => {
    const largeFile = new File(['x'.repeat(2 * 1024 * 1024 + 1)], 'large_logo.png', {
      type: 'image/png'
    });
    // Override size property if needed
    Object.defineProperty(largeFile, 'size', { value: 2 * 1024 * 1024 + 1 });

    await expect(uploadLogoToCloudinary(largeFile)).rejects.toThrow(
      'Ukuran file logo maksimal 2MB'
    );
  });

  it('should throw an error if file format/mime is not supported', async () => {
    const invalidFile = new File(['dummy content'], 'document.pdf', {
      type: 'application/pdf'
    });

    await expect(uploadLogoToCloudinary(invalidFile)).rejects.toThrow(
      'Format gambar harus berupa PNG, JPG, WEBP, atau SVG'
    );
  });

  it('should throw an error if Cloudinary environment variables are missing', async () => {
    delete (import.meta.env as any).VITE_CLOUDINARY_CLOUD_NAME;

    const validFile = new File(['image-bytes'], 'logo.png', {
      type: 'image/png'
    });

    await expect(uploadLogoToCloudinary(validFile)).rejects.toThrow(
      'Konfigurasi Cloudinary (Cloud Name / Upload Preset) belum disetel di environment'
    );
  });

  it('should upload successfully and return secure_url', async () => {
    const validFile = new File(['image-bytes'], 'logo.webp', {
      type: 'image/webp'
    });

    const mockResponse = {
      secure_url: 'https://res.cloudinary.com/test_cloud/image/upload/v12345/simkop/branding/logo.webp'
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue(mockResponse)
    });

    const result = await uploadLogoToCloudinary(validFile);

    expect(result).toBe(mockResponse.secure_url);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.cloudinary.com/v1_1/test_cloud/image/upload',
      expect.objectContaining({
        method: 'POST'
      })
    );
  });

  it('should throw an error with message from Cloudinary API failure', async () => {
    const validFile = new File(['image-bytes'], 'logo.svg', {
      type: 'image/svg+xml'
    });

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: vi.fn().mockResolvedValue({
        error: { message: 'Invalid upload preset' }
      })
    });

    await expect(uploadLogoToCloudinary(validFile)).rejects.toThrow(
      'Invalid upload preset'
    );
  });
});

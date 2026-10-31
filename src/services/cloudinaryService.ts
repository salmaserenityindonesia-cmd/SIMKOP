/**
 * Cloudinary Media Service for SIMKOP
 * Handles image uploads to Cloudinary (e.g. Koperasi Logo branding)
 */

export const MAX_LOGO_SIZE_BYTES = 2 * 1024 * 1024; // 2MB
export const ALLOWED_LOGO_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/svg+xml'
];

/**
 * Uploads a logo file to Cloudinary under the 'simkop/branding' folder.
 * 
 * @param file File object from file input or drag-and-drop
 * @returns Promise<string> Resolves with the secure_url from Cloudinary
 */
export async function uploadLogoToCloudinary(file: File): Promise<string> {
  // 1. Validasi ukuran file (maksimal 2MB)
  if (file.size > MAX_LOGO_SIZE_BYTES) {
    throw new Error('Ukuran file logo maksimal 2MB');
  }

  // 2. Validasi tipe MIME
  if (!ALLOWED_LOGO_MIME_TYPES.includes(file.type.toLowerCase())) {
    throw new Error('Format gambar harus berupa PNG, JPG, WEBP, atau SVG');
  }

  // 3. Validasi konfigurasi Cloudinary environment
  const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
  const uploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

  if (!cloudName || !uploadPreset) {
    throw new Error('Konfigurasi Cloudinary (Cloud Name / Upload Preset) belum disetel di environment');
  }

  // 4. Siapkan FormData payload
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', uploadPreset);
  formData.append('folder', 'simkop/branding');

  // 5. POST request via fetch ke Cloudinary REST endpoint
  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: 'POST',
    body: formData
  });

  const data = await response.json().catch(() => null);

  if (!response.ok || !data || data.error) {
    const errorMsg = data?.error?.message || `Gagal mengunggah logo ke Cloudinary (status ${response.status})`;
    throw new Error(errorMsg);
  }

  if (!data.secure_url) {
    throw new Error('Respons Cloudinary tidak menyertakan secure_url');
  }

  return data.secure_url;
}

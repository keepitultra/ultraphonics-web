// Unsigned upload to Cloudinary + transformation URL helpers for the shared
// photo gallery. No backend involved — the browser POSTs straight to
// Cloudinary using the unsigned preset from src/cloudinary-config.js, which
// is safe to expose client-side (see that file for why).

import { cloudinaryConfig } from '../cloudinary-config.js';

/**
 * Upload one image file to Cloudinary.
 * @param {File} file
 * @returns {Promise<{publicId: string, url: string, width: number, height: number, format: string, bytes: number}>}
 */
export async function uploadToCloudinary(file) {
  if (!cloudinaryConfig.cloudName || !cloudinaryConfig.uploadPreset) {
    throw new Error('Cloudinary is not configured yet — set cloudName and uploadPreset in src/cloudinary-config.js.');
  }

  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', cloudinaryConfig.uploadPreset);
  if (cloudinaryConfig.folder) formData.append('folder', cloudinaryConfig.folder);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudinaryConfig.cloudName}/image/upload`,
    { method: 'POST', body: formData },
  );

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error?.message || `Upload failed (${response.status}).`);
  }

  const data = await response.json();
  return {
    publicId: data.public_id,
    url: data.secure_url,
    width: data.width,
    height: data.height,
    format: data.format,
    bytes: data.bytes,
  };
}

/**
 * Build a sized, optimised transformation URL for a Cloudinary asset.
 * Always used in place of the raw original — q_auto/f_auto keeps requests
 * small and inside the free-tier bandwidth credit.
 * @param {string} publicId
 * @param {{width?: number, height?: number, crop?: string}} [opts]
 */
export function cloudinaryThumbUrl(publicId, { width = 300, height = 300, crop = 'fill' } = {}) {
  return `https://res.cloudinary.com/${cloudinaryConfig.cloudName}/image/upload/c_${crop},w_${width},h_${height},q_auto,f_auto/${publicId}`;
}

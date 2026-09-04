// Cloudinary configuration for the shared photo gallery.
//
// These values are not secret — an unsigned upload preset is designed to be
// embedded in client code (same trust model as the Firebase apiKey in
// src/firebase-config.js). The preset itself is what limits what an unsigned
// upload can do: pinned folder, allowed formats, max file size, all
// configured in the Cloudinary dashboard.
//
// Fill these in after creating the Cloudinary account + unsigned preset
// (see the plan's "Cloudinary setup" section). Uploads fail with a clear
// error from cloudinaryUpload.js until this is done.
export const cloudinaryConfig = {
  cloudName: 'lrxjzutf',
  uploadPreset: 'ultraphonics-gallery',
  folder: 'ultraphonics/gallery',
};

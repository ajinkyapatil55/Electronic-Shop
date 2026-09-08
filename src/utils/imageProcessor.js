const sharp = require('sharp');

/**
 * Converts an image Buffer or Multer file object into a compressed, optimized WebP Base64 data URI.
 * Ensures zero dependency on local/ephemeral disk files (Render, Heroku, Serverless compatible).
 *
 * @param {Buffer|Object|string} fileOrBuffer - Multer file, raw Buffer, or existing string
 * @param {Object} options - { maxWidth: 1200, maxHeight: 1200, quality: 80 }
 * @returns {Promise<string>} Base64 data URI string
 */
async function toBase64DataUri(fileOrBuffer, options = {}) {
  if (!fileOrBuffer) return null;

  // If it's already a Data URI or HTTP link, return it untouched
  if (typeof fileOrBuffer === 'string') {
    if (
      fileOrBuffer.startsWith('data:') ||
      fileOrBuffer.startsWith('http://') ||
      fileOrBuffer.startsWith('https://')
    ) {
      return fileOrBuffer;
    }
  }

  let buffer = null;
  let originalMime = 'image/jpeg';

  if (Buffer.isBuffer(fileOrBuffer)) {
    buffer = fileOrBuffer;
  } else if (fileOrBuffer.buffer && Buffer.isBuffer(fileOrBuffer.buffer)) {
    buffer = fileOrBuffer.buffer;
    originalMime = fileOrBuffer.mimetype || originalMime;
  } else {
    return null;
  }

  const maxWidth = options.maxWidth || 1200;
  const maxHeight = options.maxHeight || 1200;
  const quality = options.quality || 80;

  try {
    const optimizedBuffer = await sharp(buffer)
      .rotate() // Auto-orient based on EXIF metadata
      .resize(maxWidth, maxHeight, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality })
      .toBuffer();

    return `data:image/webp;base64,${optimizedBuffer.toString('base64')}`;
  } catch (sharpError) {
    console.warn('⚠️ Sharp optimization fallback triggered:', sharpError.message);
    return `data:${originalMime};base64,${buffer.toString('base64')}`;
  }
}

module.exports = {
  toBase64DataUri,
};

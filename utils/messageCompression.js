const zlib = require('zlib');
const { promisify } = require('util');

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

/**
 * Compress message content before encryption
 * Reduces storage by 60-80% for text messages
 * @param {string} text - Message text to compress
 * @returns {Promise<Buffer>} - Compressed buffer
 */
async function compressMessage(text) {
  try {
    // Validate input
    if (text === undefined || text === null) {
      throw new Error('Cannot compress: text is null or undefined');
    }
    
    if (typeof text !== 'string') {
      throw new Error('Cannot compress: text must be a string');
    }
    
    // Check for extremely large text (prevent memory issues)
    const MAX_COMPRESSION_SIZE = 50000; // 50KB
    if (text.length > MAX_COMPRESSION_SIZE) {
      throw new Error(`Text too large for compression: ${text.length} characters (max ${MAX_COMPRESSION_SIZE})`);
    }
    
    const compressed = await Promise.race([
      gzip(text),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Compression timeout')), 5000)
      )
    ]);
    
    // Validate compressed result
    if (!compressed || !Buffer.isBuffer(compressed)) {
      throw new Error('Compression produced invalid result');
    }
    
    return compressed;
  } catch (error) {
    console.error('Compression error:', error);
    // Return original text as Buffer if compression fails
    if (typeof text === 'string') {
      return Buffer.from(text, 'utf8');
    }
    throw error;
  }
}

/**
 * Decompress message content after decryption
 * @param {Buffer} compressedBuffer - Compressed buffer
 * @returns {Promise<string>} - Decompressed text
 */
async function decompressMessage(compressedBuffer) {
  try {
    // Validate input
    if (compressedBuffer === undefined || compressedBuffer === null) {
      throw new Error('Cannot decompress: buffer is null or undefined');
    }
    
    if (!Buffer.isBuffer(compressedBuffer)) {
      // Try to convert to buffer
      if (typeof compressedBuffer === 'string') {
        compressedBuffer = Buffer.from(compressedBuffer, 'utf8');
      } else {
        throw new Error('Cannot decompress: input is not a buffer or string');
      }
    }
    
    // Check for extremely large buffer (prevent memory issues)
    const MAX_DECOMPRESSION_SIZE = 100000; // 100KB
    if (compressedBuffer.length > MAX_DECOMPRESSION_SIZE) {
      throw new Error(`Buffer too large for decompression: ${compressedBuffer.length} bytes (max ${MAX_DECOMPRESSION_SIZE})`);
    }
    
    const decompressed = await Promise.race([
      gunzip(compressedBuffer),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Decompression timeout')), 5000)
      )
    ]);
    
    // Validate decompressed result
    if (!decompressed || !Buffer.isBuffer(decompressed)) {
      throw new Error('Decompression produced invalid result');
    }
    
    const result = decompressed.toString('utf8');
    
    // Validate result is a valid string
    if (typeof result !== 'string') {
      throw new Error('Decompression produced non-string result');
    }
    
    return result;
  } catch (error) {
    console.error('Decompression error:', error);
    // Try to return as string if it's not compressed (backward compatibility)
    if (Buffer.isBuffer(compressedBuffer)) {
      try {
        return compressedBuffer.toString('utf8');
      } catch (stringError) {
        console.error('Failed to convert buffer to string:', stringError);
        throw error; // Re-throw original error
      }
    }
    if (typeof compressedBuffer === 'string') {
      return compressedBuffer;
    }
    throw error;
  }
}

/**
 * Compress and encode to base64 for storage
 * @param {string} text - Message text
 * @returns {Promise<string>} - Base64 encoded compressed data
 */
async function compressAndEncode(text) {
  const compressed = await compressMessage(text);
  return compressed.toString('base64');
}

/**
 * Decode from base64 and decompress
 * @param {string} base64Data - Base64 encoded compressed data
 * @returns {Promise<string>} - Decompressed text
 */
async function decodeAndDecompress(base64Data) {
  try {
    // Validate input
    if (base64Data === undefined || base64Data === null) {
      throw new Error('Cannot decode: base64Data is null or undefined');
    }
    
    if (typeof base64Data !== 'string') {
      throw new Error('Cannot decode: base64Data must be a string');
    }
    
    if (base64Data.length === 0) {
      throw new Error('Cannot decode: base64Data is empty');
    }
    
    // Validate base64 format (basic check)
    if (!/^[A-Za-z0-9+/=]+$/.test(base64Data)) {
      throw new Error('Invalid base64 format');
    }
    
    let buffer;
    try {
      buffer = Buffer.from(base64Data, 'base64');
    } catch (bufferError) {
      throw new Error(`Failed to decode base64: ${bufferError.message}`);
    }
    
    // Validate buffer was created successfully
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      throw new Error('Base64 decoding produced empty or invalid buffer');
    }
    
    return await decompressMessage(buffer);
  } catch (error) {
    // If decompression fails, try direct decode (for backward compatibility)
    try {
      if (typeof base64Data === 'string' && base64Data.length > 0) {
        const directDecode = Buffer.from(base64Data, 'base64').toString('utf8');
        if (directDecode && directDecode.length > 0) {
          return directDecode;
        }
      }
    } catch (e) {
      console.error('Direct decode error:', e);
    }
    
    // If all else fails, log and throw
    console.error('Decode and decompress error:', error);
    throw error;
  }
}

module.exports = {
  compressMessage,
  decompressMessage,
  compressAndEncode,
  decodeAndDecompress
};


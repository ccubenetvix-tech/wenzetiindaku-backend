const crypto = require('crypto');
const { compressAndEncode, decodeAndDecompress } = require('./messageCompression');

// Use a fixed key derivation to ensure consistency
// In production, set CHAT_ENCRYPTION_KEY in environment variables
// For development, use a fixed key based on a constant seed
const getEncryptionKey = () => {
  if (process.env.CHAT_ENCRYPTION_KEY) {
    return process.env.CHAT_ENCRYPTION_KEY;
  }
  
  // For development: use a fixed key derived from a constant seed
  // This ensures the same key is used across server restarts
  // IMPORTANT: In production, always set CHAT_ENCRYPTION_KEY environment variable
  const DEV_SEED = 'wenzetiindaku-chat-encryption-key-seed-2024';
  return crypto.createHash('sha256').update(DEV_SEED).digest('hex');
};

const ENCRYPTION_KEY = getEncryptionKey();
const ALGORITHM = 'aes-256-gcm';

// Enable compression by default (can be disabled via env var)
// Compression reduces storage by 60-80% for text messages
const USE_COMPRESSION = process.env.CHAT_USE_COMPRESSION !== 'false';

async function encrypt(text, useCompression = USE_COMPRESSION) {
  try {
    // Validate input
    if (text === undefined || text === null) {
      throw new Error('Cannot encrypt: text is null or undefined');
    }
    
    if (typeof text !== 'string') {
      throw new Error('Cannot encrypt: text must be a string');
    }
    
    // Check for extremely large messages (prevent memory issues)
    const MAX_MESSAGE_SIZE = 100000; // 100KB
    if (text.length > MAX_MESSAGE_SIZE) {
      throw new Error(`Message too large: ${text.length} characters (max ${MAX_MESSAGE_SIZE})`);
    }
    
    // Validate encryption key exists
    if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length < 32) {
      throw new Error('Encryption key is invalid or too short');
    }
    
    let dataToEncrypt = text;
    let isCompressed = false;

    // Compress before encryption if enabled and text is long enough to benefit
    // Messages shorter than 100 chars don't benefit much from compression
    if (useCompression && text.length > 100) {
      try {
        const compressed = await Promise.race([
          compressAndEncode(text),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Compression timeout')), 5000)
          )
        ]);
        dataToEncrypt = compressed;
        isCompressed = true;
      } catch (compressionError) {
        console.warn('Compression failed, using uncompressed:', compressionError.message);
        // Continue with uncompressed text
        isCompressed = false;
      }
    }

    // Derive a 32-byte key from the encryption key
    let key;
    try {
      key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
    } catch (keyError) {
      console.error('Key derivation error:', keyError);
      throw new Error('Failed to derive encryption key');
    }
    
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    let encrypted = cipher.update(dataToEncrypt, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    // Validate encrypted data
    if (!encrypted || encrypted.length === 0) {
      throw new Error('Encryption produced empty result');
    }
    
    // Return IV + AuthTag + Encrypted data + compression flag
    const encryptedData = iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
    
    // Generate hash from original text (not compressed)
    const hash = crypto.createHash('sha256').update(text).digest('hex');
    
    return {
      encrypted: isCompressed ? 'C' + encryptedData : encryptedData, // 'C' prefix indicates compressed
      hash,
      isCompressed
    };
  } catch (error) {
    console.error('Encryption error:', error);
    if (error.message) {
      throw error; // Re-throw with original message
    }
    throw new Error('Failed to encrypt message');
  }
}

async function decrypt(encryptedData) {
  try {
    // Validate input
    if (encryptedData === undefined || encryptedData === null) {
      throw new Error('Invalid encrypted data: cannot be null or undefined');
    }
    
    if (typeof encryptedData !== 'string') {
      throw new Error('Invalid encrypted data: must be a string');
    }
    
    if (encryptedData.length === 0) {
      throw new Error('Invalid encrypted data: cannot be empty');
    }
    
    // Check for extremely large encrypted data (prevent memory issues)
    const MAX_ENCRYPTED_SIZE = 200000; // 200KB
    if (encryptedData.length > MAX_ENCRYPTED_SIZE) {
      throw new Error(`Encrypted data too large: ${encryptedData.length} characters (max ${MAX_ENCRYPTED_SIZE})`);
    }
    
    // Validate encryption key
    if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length < 32) {
      throw new Error('Encryption key is invalid or too short');
    }
    
    // Check if message is compressed (starts with 'C')
    const isCompressed = encryptedData.startsWith('C');
    const dataToDecrypt = isCompressed ? encryptedData.substring(1) : encryptedData;
    
    // Validate minimum length (IV:AuthTag:Encrypted = at least 48 chars for empty message)
    if (dataToDecrypt.length < 48) {
      throw new Error('Invalid encrypted data: too short to be valid');
    }
    
    // Derive the same 32-byte key from the encryption key
    let key;
    try {
      key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
    } catch (keyError) {
      console.error('Key derivation error:', keyError);
      throw new Error('Failed to derive decryption key');
    }
    
    const parts = dataToDecrypt.split(':');
    
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted data format: expected IV:AuthTag:EncryptedData');
    }
    
    // Validate hex strings
    if (!/^[0-9a-f]+$/i.test(parts[0]) || !/^[0-9a-f]+$/i.test(parts[1]) || !/^[0-9a-f]+$/i.test(parts[2])) {
      throw new Error('Invalid encrypted data format: contains non-hex characters');
    }
    
    let iv, authTag;
    try {
      iv = Buffer.from(parts[0], 'hex');
      authTag = Buffer.from(parts[1], 'hex');
    } catch (bufferError) {
      throw new Error('Invalid encrypted data: failed to parse hex strings');
    }
    
    const encrypted = parts[2];
    
    // Validate buffer sizes
    if (iv.length !== 16) {
      throw new Error(`Invalid IV length: expected 16 bytes, got ${iv.length}`);
    }
    if (authTag.length !== 16) {
      throw new Error(`Invalid auth tag length: expected 16 bytes, got ${authTag.length}`);
    }
    
    if (encrypted.length === 0) {
      throw new Error('Invalid encrypted data: encrypted content is empty');
    }
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted;
    try {
      decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
    } catch (cipherError) {
      // More specific error handling
      if (cipherError.message && (
        cipherError.message.includes('Unable to authenticate') || 
        cipherError.message.includes('Unsupported state') ||
        cipherError.message.includes('bad decrypt')
      )) {
        throw new Error('Decryption authentication failed - message may have been encrypted with a different key or is corrupted');
      }
      throw new Error(`Decryption failed: ${cipherError.message}`);
    }
    
    // Validate decrypted result
    if (decrypted === undefined || decrypted === null) {
      throw new Error('Decryption produced null or undefined result');
    }
    
    // Decompress if needed
    if (isCompressed) {
      try {
        const decompressed = await Promise.race([
          decodeAndDecompress(decrypted),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Decompression timeout')), 5000)
          )
        ]);
        decrypted = decompressed;
      } catch (decompressionError) {
        console.warn('Decompression failed, returning as-is:', decompressionError.message);
        // Return as-is if decompression fails (backward compatibility)
        // This handles cases where data was stored as base64 but not actually compressed
      }
    }
    
    // Final validation
    if (typeof decrypted !== 'string') {
      throw new Error('Decryption produced non-string result');
    }
    
    return decrypted;
  } catch (error) {
    // Log more details for debugging
    if (error.message && (
      error.message.includes('Unable to authenticate') || 
      error.message.includes('Unsupported state') ||
      error.message.includes('authentication failed')
    )) {
      console.error('Decryption authentication failed - message may have been encrypted with a different key');
    } else {
      console.error('Decryption error:', error.message || error);
    }
    
    // Re-throw with original message if it's already descriptive
    if (error.message && error.message.startsWith('Invalid') || error.message.startsWith('Decryption')) {
      throw error;
    }
    
    throw new Error('Failed to decrypt message');
  }
}

module.exports = {
  encrypt,
  decrypt,
  ENCRYPTION_KEY // Export for debugging if needed
};


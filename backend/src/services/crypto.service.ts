import crypto from 'crypto';
import { config } from '../config';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 16 bytes for AES-256-GCM
const AUTH_TAG_LENGTH = 16; // 16 bytes for GCM auth tag
const PBKDF2_ITERATIONS = 100000;
const KEY_LENGTH = 32; // 256 bits for AES-256

/**
 * Crypto Service
 * 
 * Provides encryption and decryption for sensitive data (e.g., Redis connection URLs)
 * using AES-256-GCM with PBKDF2 key derivation.
 */
export class CryptoService {
  private static derivedKey: Buffer | null = null;

  /**
   * Derives encryption key from app secret using PBKDF2
   * Uses a fixed salt derived from the app secret (acceptable for single-secret scenario)
   */
  private static getDerivedKey(): Buffer {
    if (!this.derivedKey) {
      // Use a fixed salt derived from the app secret
      // This is acceptable since we have a single app secret per installation
      const salt = crypto.createHash('sha256').update(config.appSecret).digest();
      
      this.derivedKey = crypto.pbkdf2Sync(
        config.appSecret,
        salt,
        PBKDF2_ITERATIONS,
        KEY_LENGTH,
        'sha256'
      );
    }
    
    return this.derivedKey;
  }

  /**
   * Encrypts plaintext using AES-256-GCM
   * 
   * @param plaintext - The text to encrypt
   * @returns Encrypted data in format: iv:authTag:ciphertext (hex-encoded)
   * @throws Error if encryption fails
   */
  static encrypt(plaintext: string): string {
    try {
      const key = this.getDerivedKey();
      
      // Generate random IV (16 bytes)
      const iv = crypto.randomBytes(IV_LENGTH);
      
      // Create cipher
      const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
      
      // Encrypt the plaintext
      const encrypted = Buffer.concat([
        cipher.update(plaintext, 'utf8'),
        cipher.final()
      ]);
      
      // Get authentication tag
      const authTag = cipher.getAuthTag();
      
      // Format: iv:authTag:ciphertext (all hex-encoded)
      return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
    } catch (error) {
      throw new Error('Encryption failed');
    }
  }

  /**
   * Decrypts ciphertext using AES-256-GCM
   * 
   * @param ciphertext - The encrypted data in format: iv:authTag:ciphertext (hex-encoded)
   * @returns Decrypted plaintext
   * @throws Error if decryption fails or format is invalid
   */
  static decrypt(ciphertext: string): string {
    try {
      const key = this.getDerivedKey();
      
      // Parse the format: iv:authTag:ciphertext
      const parts = ciphertext.split(':');
      
      if (parts.length !== 3) {
        throw new Error('Invalid ciphertext format');
      }
      
      const iv = Buffer.from(parts[0], 'hex');
      const authTag = Buffer.from(parts[1], 'hex');
      const encrypted = Buffer.from(parts[2], 'hex');
      
      // Validate lengths
      if (iv.length !== IV_LENGTH) {
        throw new Error('Invalid IV length');
      }
      
      if (authTag.length !== AUTH_TAG_LENGTH) {
        throw new Error('Invalid auth tag length');
      }
      
      // Create decipher
      const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
      decipher.setAuthTag(authTag);
      
      // Decrypt
      const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final()
      ]);
      
      return decrypted.toString('utf8');
    } catch (error) {
      if (error instanceof Error && error.message.includes('Invalid')) {
        throw error;
      }
      throw new Error('Decryption failed');
    }
  }
}

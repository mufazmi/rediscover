/**
 * Authentication Service
 * 
 * Handles JWT token generation/verification and password hashing/comparison.
 */

import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { getJWTIssuer } from '../config/author';

export interface JWTPayload {
  userId: number;
  username: string;
  role: 'admin' | 'operator';
  iss?: string; // Optional issuer field for backward compatibility
}

export class AuthService {
  /**
   * Hash a password using bcrypt with configurable rounds
   */
  static async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, config.bcryptRounds);
  }

  /**
   * Compare a plain text password with a hashed password
   */
  static async comparePassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  /**
   * Generate a JWT token with HS256 algorithm and 7-day expiration
   */
  static generateToken(payload: JWTPayload): string {
    try {
      return jwt.sign(
        {
          userId: payload.userId,
          username: payload.username,
          role: payload.role,
        },
        config.appSecret,
        {
          expiresIn: config.jwtExpiration as jwt.SignOptions['expiresIn'],
          issuer: getJWTIssuer(),
        }
      );
    } catch (error) {
      console.warn('[Attribution] Failed to set JWT issuer, generating without:', error);
      return jwt.sign(
        {
          userId: payload.userId,
          username: payload.username,
          role: payload.role,
        },
        config.appSecret,
        { expiresIn: config.jwtExpiration as jwt.SignOptions['expiresIn'] }
      );
    }
  }

  /**
   * Verify a JWT token and return the payload
   * 
   * @throws Error if token is invalid or expired
   */
  static verifyToken(token: string): JWTPayload {
    try {
      const decoded = jwt.verify(token, config.appSecret, {
        algorithms: ['HS256'],
        // Don't enforce issuer validation for backward compatibility
        // but preserve issuer field if present
      }) as JWTPayload;

      return {
        userId: decoded.userId,
        username: decoded.username,
        role: decoded.role,
        iss: decoded.iss, // Preserve issuer field if present
      };
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new Error('Token expired');
      }
      if (error instanceof jwt.JsonWebTokenError) {
        throw new Error('Invalid token');
      }
      throw error;
    }
  }
}

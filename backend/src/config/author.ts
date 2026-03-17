/**
 * Professional Author Attribution Constants
 * 
 * This module provides centralized author information for the Rediscover application.
 * All author attribution across the system should reference these constants to ensure
 * consistency and maintainability.
 * 
 * @author Umair Farooqui
 * @github mufazmi
 */

/**
 * Complete author information interface with readonly modifiers for immutability
 */
export interface AuthorInfo {
  /** Full name of the author */
  readonly name: string;
  
  /** GitHub username */
  readonly githubUsername: string;
  
  /** Professional email address */
  readonly email: string;
  
  /** Personal website URL */
  readonly website: string;
  
  /** Professional title and certifications */
  readonly title: string;
  
  /** Contact phone number */
  readonly phone: string;
  
  /** HackerOne security researcher profile */
  readonly hackerOneProfile: string;
  
  /** Social media and professional profiles */
  readonly socialMedia: {
    readonly github: string;
    readonly linkedin: string;
    readonly medium: string;
    readonly instagram: string;
    readonly twitter: string;
    readonly facebook: string;
  };
  
  /** Organizations that have recognized security research contributions */
  readonly securityRecognition: readonly string[];
}

/**
 * Centralized author information constants
 * 
 * This constant serves as the single source of truth for all author attribution
 * throughout the Rediscover application. It includes comprehensive professional
 * information, contact details, social media profiles, and security recognition.
 */
export const AUTHOR: AuthorInfo = {
  name: 'Umair Farooqui',
  githubUsername: 'mufazmi',
  email: 'info.umairfarooqui@gmail.com',
  website: 'https://umairfarooqui.com',
  title: 'Software Engineer & Certified Ethical Hacker (CEH v13)',
  phone: '+91 9867503256',
  hackerOneProfile: 'https://hackerone.com/mufazmi',
  
  socialMedia: {
    github: 'https://github.com/mufazmi',
    linkedin: 'https://linkedin.com/in/mufazmi',
    medium: 'https://medium.com/@mufazmi',
    instagram: 'https://instagram.com/mufazmi',
    twitter: 'https://x.com/mufazmi',
    facebook: 'https://facebook.com/mufazmi'
  },
  
  securityRecognition: [
    'NASA',
    'Dell Technologies',
    'Nokia',
    'Lenovo',
    'WHO (World Health Organization)',
    'Zoom',
    'Accenture',
    'Paytm',
    'U.S. Department of Homeland Security',
    'ABN AMRO Bank',
    'United Airlines',
    'Drexel University',
    'Radboud University',
    'LG'
  ]
} as const;

/**
 * Utility function to get author information with error handling
 * 
 * @returns AuthorInfo object with fallback handling
 */
export function getAuthorInfo(): AuthorInfo {
  try {
    return AUTHOR;
  } catch (error) {
    console.warn('[Attribution] Failed to load author constants, using fallback:', error);
    // Fallback with minimal required information
    return {
      name: 'Umair Farooqui',
      githubUsername: 'mufazmi',
      email: 'info.umairfarooqui@gmail.com',
      website: 'https://umairfarooqui.com',
      title: 'Software Engineer & Certified Ethical Hacker (CEH v13)',
      phone: '+91 9867503256',
      hackerOneProfile: 'https://hackerone.com/mufazmi',
      socialMedia: {
        github: 'https://github.com/mufazmi',
        linkedin: 'https://linkedin.com/in/mufazmi',
        medium: 'https://medium.com/@mufazmi',
        instagram: 'https://instagram.com/mufazmi',
        twitter: 'https://x.com/mufazmi',
        facebook: 'https://facebook.com/mufazmi'
      },
      securityRecognition: [
        'NASA', 'Dell Technologies', 'Nokia', 'Lenovo', 'WHO', 'Zoom',
        'Accenture', 'Paytm', 'U.S. Department of Homeland Security',
        'ABN AMRO Bank', 'United Airlines', 'Drexel University',
        'Radboud University', 'LG'
      ]
    } as const;
  }
}

/**
 * Get formatted author string for package.json format
 * 
 * @returns Formatted string: "Name <email> (website)"
 */
export function getPackageAuthorString(): string {
  const author = getAuthorInfo();
  return `${author.name} <${author.email}> (${author.website})`;
}

/**
 * Get JWT issuer identifier for token attribution
 * 
 * @returns JWT issuer string for token attribution
 */
export function getJWTIssuer(): string {
  const author = getAuthorInfo();
  return `rediscover-${author.githubUsername}`;
}

/**
 * Get HTTP header values for response attribution
 * 
 * @returns Object with X-Powered-By and X-Author header values
 */
export function getAttributionHeaders(): { 'X-Powered-By': string; 'X-Author': string } {
  const author = getAuthorInfo();
  return {
    'X-Powered-By': `Rediscover by ${author.name} (${author.githubUsername})`,
    'X-Author': author.name
  };
}
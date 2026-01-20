import crypto from 'crypto';

/**
 * Generates a cryptographically secure 6-digit OTP
 * @returns {string} 6-digit string (e.g., "123456")
 */
export const generateOTP = (): string => {
  // Generates an integer between 100000 and 999999 (inclusive)
  const otp = crypto.randomInt(100000, 1000000);
  return otp.toString();
};
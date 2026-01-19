import logger from '@/logger/winston.logger';
import axios from 'axios';

// Fast2SMS Helper
export const sendOTPviaSMS = async (phoneNumber: string, otp: string): Promise<boolean> => {
  try {
    const response = await axios.get('https://www.fast2sms.com/dev/bulkV2', {
      params: {
        authorization: process.env.FAST2SMS_API_KEY,
        variables_values: otp,
        route: 'otp',
        numbers: phoneNumber
      }
    });

    return response.data.return === true;
  } catch (error) {
    logger.error('Fast2SMS Error:', error);
    return false;
  }
};
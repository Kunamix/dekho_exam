import dotenvFlow from "dotenv-flow";
dotenvFlow.config();

const _environment = {
  NODE_ENV: process.env.NODE_ENV,
  PORT: process.env.PORT,
  DIRECT_URL:process.env.DIRECT_URL,
  DATABASE_URL:process.env.DATABASE_URL,
  REFRESH_SECRET:process.env.REFRESH_SECRET,
  ACCESS_SECRET:process.env.ACCESS_SECRET,
  OTP_VERIFY_SECRET:process.env.OTP_VERIFY_SECRET
};

export const myEnvironment = Object.freeze(_environment);

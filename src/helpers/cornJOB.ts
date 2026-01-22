import cron from "node-cron";
import axios from "axios";
import { myEnvironment } from "@/configs/env";
import logger from "@/logger/winston.logger";

const HEALTH_CHECK_URL = myEnvironment.HEALTH_CHECK_URL as string;

export const startKeepAliveCron = () => {
  cron.schedule(
    "*/10 * * * *",
    async () => {
      try {
        await axios.get(HEALTH_CHECK_URL, { timeout: 5000 });
        logger.info("[CRON] Health check pinged");
      } catch {
        logger.error("[CRON] Health check failed");
      }
    },
    {
      timezone: "UTC",
    }
  );
};

import { myEnvironment } from "@/configs/env";
import logger from "@/logger/winston.logger";
import morgan from "morgan";

const stream = {
  write: (message: string) => logger.http(message.trim()),
};

const skip = () => {
  const env = myEnvironment.NODE_ENV || "development";
  return env !== "development";
};

const morganMiddleware = morgan(
  ":remote-addr :method :url :status - :response-time ms",
  { stream, skip }
);

export default morganMiddleware;

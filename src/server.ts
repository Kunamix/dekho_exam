import http from "http";

//import
import {myEnvironment} from "@/configs/env";
import app from "./app";
import logger from "./logger/winston.logger";

const server = http.createServer(app);

const startServer = async () => {
  try {
    server.listen(myEnvironment.PORT || 8080, () => {
    logger.info(
      `📑 Visit the health check at: http://localhost:${
        myEnvironment.PORT || 8080
      }/api/v1/health-check`
    );
    logger.info("⚙️  Server is running on port: " + myEnvironment.PORT);
  });
  } catch (error) {
    logger.error("Failed to start server: ",error);
    process.exit(1);
  }
  
};
startServer();
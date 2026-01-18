import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import morganMiddleware from "./logger/morgan.logger";
import { errorHandler, notFoundHandler } from "./middlewares/error.middleware";


const app = express();

app.use(
  cors({
    origin: ["http://localhost:5173", "*"],
    optionsSuccessStatus: 200,
    credentials: true,
    maxAge: 86400,
  })
)

app.use(express.json({limit: "16kb"}));
app.use(express.urlencoded({extended: true,limit: "16kb"}));
app.use(express.static("public"));
app.use(cookieParser());
app.use(morganMiddleware);
app.disable("x-powered-by");



app.use(notFoundHandler);
app.use(errorHandler);
export default app;
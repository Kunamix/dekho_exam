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


// Api Routes
import healthRouter from "@/routes/healthcheck.route";
import adminRouter from "@/routes/admin.auth.route";
import authRouter from "@/routes/auth.route";
import categoryRouter from "@/routes/category.route"
import dashboardRouter from "@/routes/dashboard.route"
import paymentRouter from "@/routes/payment.route"
import questionRouter from "@/routes/question.route";
import subjectRouter from "@/routes/subject.route";
import subscriptionRouter from "@/routes/subscription.route"
import testRouter from "@/routes/test.route"
import topicRouter from "@/routes/topic.route"
import userRouter from "@/routes/user.route";

app.use("/api/v1/health-check",healthRouter);

app.use("/api/v1",adminRouter,authRouter,categoryRouter,dashboardRouter,paymentRouter,questionRouter,subjectRouter,subscriptionRouter,testRouter,topicRouter,userRouter);


app.use(notFoundHandler);
app.use(errorHandler);
export default app;
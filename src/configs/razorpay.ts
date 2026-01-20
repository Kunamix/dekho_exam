import Razorpay from "razorpay";
import { myEnvironment } from "./env";

export const razorpayInstance = new Razorpay({
  key_id: myEnvironment.RAZORPAY_KEY_ID!,
  key_secret: myEnvironment.RAZORPAY_KEY_SECRET,
});

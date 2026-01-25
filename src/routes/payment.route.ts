import { Router } from "express";
import { verifyToken } from "@/middlewares/auth.middleware";
import { 
  createPaymentOrder, 
  verifyPayment, 
  handleRazorpayWebhook 
} from "@/controllers/payment.controller";

const router = Router();

// ==========================================
// 1. INITIATE PAYMENT (Protected)
// ==========================================
// Frontend calls this to get 'orderId'
router.post("/payment/create-order", verifyToken, createPaymentOrder);

// ==========================================
// 2. VERIFY PAYMENT (Protected)
// ==========================================
// Frontend calls this after successful payment on Razorpay SDK
router.post("/payment/verify", verifyToken, verifyPayment);

// ==========================================
// 3. WEBHOOK (Public)
// ==========================================
// Razorpay server calls this automatically (No Token Check)
router.post("/payment/webhook", handleRazorpayWebhook);

export default router;
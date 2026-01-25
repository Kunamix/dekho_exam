import { Router } from "express";
import { verifyAdmin, verifyToken } from "@/middlewares/auth.middleware";
import { 
  createPaymentOrder, 
  verifyPayment, 
  handleRazorpayWebhook, 
  getPayments,
  getPaymentStats,
  exportPayments,
  getPaymentById
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

router.get("/payment/",verifyToken,verifyAdmin, getPayments);                    // GET /api/v1/admin/payments
router.get("/payment/stats",verifyToken,verifyAdmin, getPaymentStats);           // GET /api/v1/admin/payments/stats
router.get("/payment/export",verifyToken,verifyAdmin, exportPayments);           // GET /api/v1/admin/payments/export
router.get("/payment/:id",verifyToken,verifyAdmin, getPaymentById);  

export default router;
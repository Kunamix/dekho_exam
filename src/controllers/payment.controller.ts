import { Request,Response } from "express";
import { razorpayInstance } from "@/configs/razorpay";
import { asyncHandler } from "@/utils/asyncHandler";
import { ApiError } from "@/utils/ApiError";
import { ApiResponse } from "@/utils/ApiResponse";
import { prisma } from "@/database/db";
import { myEnvironment } from "@/configs/env";
import logger from "@/logger/winston.logger";
import crypto from "crypto";

export const createPaymentOrder = asyncHandler(async (req: Request, res:Response) => {
  const userId = (req as any).user.id;
  const {planId} = req.body;

  const plan = await prisma.subscriptionPlan.findUnique({
    where: {id: planId},
  });

  if(!plan || !plan.isActive){
    throw new ApiError(404, "Subscription plan not found or inactive");
  }

  const amountInPaisa = Math.round(Number(plan.price) * 100);

  const options = {
    amount: amountInPaisa,
    currency: "INR",
    receipt: `rcpt_${Date.now()}_${userId.substring(0,4)}`,
    notes: {
      userId: userId,
      planId: planId
    }
  };

  try {
    const order = await razorpayInstance.orders.create(options);

    if(!order){
      throw new ApiError(500, "Failed to create order with payment gateway");
    }

    await prisma.payment.create({
      data: {
        userId,
        amount: plan.price,
        currency: "INR",
        paymentGateway: "RAZORPAY",
        orderId: order.id,
        status: "PENDING",
        metadata: {
          planId: plan.id,
          planName: plan.name,
          durationDays: plan.durationDays,
          planType: plan.type,
          categoryId: plan.categoryId
        }
      }
    });

    return res.status(200).json(
      new ApiResponse(200, {
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        key: myEnvironment.RAZORPAY_KEY_ID,
        planName: plan.name,
        description: plan.description
      },"Payment order created")
    )
  } catch (error) {
    logger.error(`Razorpay Error: ${error}`)
    throw new ApiError(500, "Something went wrong while initializing payment");
  }
});

export const verifyPayment = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const { 
    razorpay_order_id, 
    razorpay_payment_id, 
    razorpay_signature 
  } = req.body;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    throw new ApiError(400, "Payment verification details missing");
  }

  // 1. Fetch the PENDING payment record
  const paymentRecord = await prisma.payment.findFirst({
    where: { orderId: razorpay_order_id }
  });

  if (!paymentRecord) {
    throw new ApiError(404, "Payment record not found");
  }

  // Idempotency Check: If already success, return immediately
  if (paymentRecord.status === "SUCCESS") {
    return res.status(200).json(new ApiResponse(200, {}, "Payment already processed"));
  }

  // 2. CRYPTOGRAPHIC VERIFICATION
  // Formula: HMAC_SHA256(order_id + "|" + payment_id, secret)
  const body = razorpay_order_id + "|" + razorpay_payment_id;
  
  const expectedSignature = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!)
    .update(body.toString())
    .digest("hex");

  const isAuthentic = expectedSignature === razorpay_signature;

  if (!isAuthentic) {
    // Log failure
    await prisma.payment.update({
      where: { id: paymentRecord.id },
      data: { status: "FAILED", metadata: { ...paymentRecord.metadata as object, failureReason: "Signature Mismatch" } }
    });
    throw new ApiError(400, "Payment signature verification failed");
  }

  // 3. SUCCESS: Activate Subscription using Transaction
  const metadata = paymentRecord.metadata as any;
  const durationDays = metadata.durationDays || 30;

  // Calculate End Date
  const startDate = new Date();
  const endDate = new Date();
  endDate.setDate(startDate.getDate() + durationDays);

  await prisma.$transaction(async (tx) => {
    // A. Update Payment Status
    await tx.payment.update({
      where: { id: paymentRecord.id },
      data: {
        status: "SUCCESS",
        transactionId: razorpay_payment_id, // Save the actual Transaction ID
      }
    });

    // B. Create/Update Subscription
    // Logic: If user already has this specific plan active, extend it? Or just create new?
    // Here we create a new entry as per your schema
    await tx.userSubscription.create({
      data: {
        userId: userId,
        planId: metadata.planId,
        type: metadata.planType,
        categoryId: metadata.categoryId || null,
        startDate: startDate,
        endDate: endDate,
        isActive: true,
        autoRenew: false
      }
    });
  });

  return res.status(200).json(
    new ApiResponse(200, { success: true }, "Payment verified and subscription activated")
  );
});

export const handleRazorpayWebhook = async (req: Request, res: Response) => {
  // Webhooks must reply 200 OK quickly, so we don't use typical asyncHandler here usually
  // or we just ensure we return res.json({status: 'ok'}) at the end.

  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

  // 1. Verify Webhook Signature (Security)
  const shasum = crypto.createHmac("sha256", secret!);
  shasum.update(JSON.stringify(req.body));
  const digest = shasum.digest("hex");

  if (digest !== req.headers["x-razorpay-signature"]) {
    console.error("Invalid Webhook Signature");
    return res.status(400).json({ status: "invalid_signature" });
  }

  const event = req.body.event;
  const payload = req.body.payload.payment.entity;

  

  if (event === "payment.captured") {
    const orderId = payload.order_id;
    const paymentId = payload.id;

    // 2. Check if we already handled this in verifyPayment
    const paymentRecord = await prisma.payment.findFirst({
      where: { orderId: orderId }
    });

    if (paymentRecord && paymentRecord.status !== "SUCCESS") {
       // Logic is EXACTLY same as verifyPayment
       // We activate the subscription here because the frontend failed to do so.
       
       const metadata = paymentRecord.metadata as any;
       const endDate = new Date();
       endDate.setDate(endDate.getDate() + (metadata.durationDays || 30));

       try {
         await prisma.$transaction(async (tx) => {
           await tx.payment.update({
             where: { id: paymentRecord.id },
             data: { status: "SUCCESS", transactionId: paymentId }
           });

           await tx.userSubscription.create({
             data: {
               userId: paymentRecord.userId,
               planId: metadata.planId,
               type: metadata.planType,
               categoryId: metadata.categoryId || null,
               startDate: new Date(),
               endDate: endDate,
               isActive: true
             }
           });
         });
         
       } catch (err) {
         console.error("Webhook Transaction Failed", err);
       }
    }
  } else if (event === "payment.failed") {
     // Mark payment as failed
     const orderId = payload.order_id;
     await prisma.payment.updateMany({
       where: { orderId: orderId },
       data: { status: "FAILED" }
     });
  }

  return res.status(200).json({ status: "ok" });
};

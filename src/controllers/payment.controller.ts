import { Request, Response } from "express";
import { razorpayInstance } from "@/configs/razorpay";
import { asyncHandler } from "@/utils/asyncHandler";
import { ApiError } from "@/utils/ApiError";
import { ApiResponse } from "@/utils/ApiResponse";
import { prisma } from "@/database/db";
import { myEnvironment } from "@/configs/env";
import logger from "@/logger/winston.logger";
import crypto from "crypto";

export const createPaymentOrder = asyncHandler(async (req: Request, res: Response) => {
  // 1. Safety Check: Ensure User ID exists
  const userId = (req as any).user.userId;
  if (!userId) {
    throw new ApiError(401, "Unauthorized: User information missing");
  }
  const { planId } = req.body;

  const plan = await prisma.subscriptionPlan.findUnique({
    where: { id: planId },
  });

  if (!plan || !plan.isActive) {
    throw new ApiError(404, "Subscription plan not found or inactive");
  }

  const amountInPaisa = Math.round(Number(plan.price) * 100);

  const options = {
    amount: amountInPaisa,
    currency: "INR",
    receipt: `rcpt_${Date.now()}_${userId.substring(0, 4)}`, // Now safe
    notes: {
      userId: userId,
      planId: planId
    }
  };

  try {
    const order = await razorpayInstance.orders.create(options);

    if (!order) {
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
      }, "Payment order created")
    );
  } catch (error) {
    logger.error(`Razorpay Error: ${error}`);
    throw new ApiError(500, "Something went wrong while initializing payment");
  }
});

export const verifyPayment = asyncHandler(async (req: Request, res: Response) => {
  // 1. Safety Check for User
  const userId = (req as any).user.userId;
  if (!userId) {
    throw new ApiError(401, "Unauthorized: User information missing");
  }
  const {
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature
  } = req.body;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    throw new ApiError(400, "Payment verification details missing");
  }

  // 2. Fetch the PENDING payment record
  const paymentRecord = await prisma.payment.findFirst({
    where: { orderId: razorpay_order_id }
  });

  if (!paymentRecord) {
    throw new ApiError(404, "Payment record not found");
  }

  // Idempotency Check
  if (paymentRecord.status === "SUCCESS") {
    return res.status(200).json(new ApiResponse(200, {}, "Payment already processed"));
  }

  // 3. CRYPTOGRAPHIC VERIFICATION
  const body = razorpay_order_id + "|" + razorpay_payment_id;

  const expectedSignature = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!)
    .update(body.toString())
    .digest("hex");

  const isAuthentic = expectedSignature === razorpay_signature;

  if (!isAuthentic) {
    await prisma.payment.update({
      where: { id: paymentRecord.id },
      data: { status: "FAILED", metadata: { ...paymentRecord.metadata as object, failureReason: "Signature Mismatch" } }
    });
    throw new ApiError(400, "Payment signature verification failed");
  }

  // 4. SUCCESS: Activate Subscription using Transaction
  const metadata = paymentRecord.metadata as any;
  const durationDays = metadata.durationDays || 30;

  const startDate = new Date();
  const endDate = new Date();
  endDate.setDate(startDate.getDate() + durationDays);

  await prisma.$transaction(async (tx) => {
    // A. Update Payment Status
    await tx.payment.update({
      where: { id: paymentRecord.id },
      data: {
        status: "SUCCESS",
        transactionId: razorpay_payment_id,
      }
    });

    // B. Create Subscription
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
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

  // 1. Verify Webhook Signature
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
    const orderId = payload.order_id;
    await prisma.payment.updateMany({
      where: { orderId: orderId },
      data: { status: "FAILED" }
    });
  }

  return res.status(200).json({ status: "ok" });
};

export const getPayments = asyncHandler(async (req: Request, res: Response) => {
  const { startDate, endDate } = req.query;

  // Build date filter
  const dateFilter: any = {};
  if (startDate) {
    dateFilter.gte = new Date(startDate as string);
  }
  if (endDate) {
    dateFilter.lte = new Date(endDate as string);
  }

  // Fetch payments with user info
  const payments = await prisma.payment.findMany({
    where: {
      ...(Object.keys(dateFilter).length > 0 && { createdAt: dateFilter }),
    },
    include: {
      user: {
        select: {
          name: true,
          phoneNumber: true,
          email: true,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  // Transform data
  const transformedPayments = payments.map((payment) => ({
    id: payment.id,
    userId: payment.userId,
    userName: payment.user.name || 'Unknown User',
    phone: payment.user.phoneNumber || payment.user.email || 'N/A',
    amount: Number(payment.amount),
    gateway: payment.paymentGateway,
    status: payment.status,
    transactionId: payment.transactionId || payment.orderId || 'N/A',
    orderId: payment.orderId,
    date: payment.createdAt.toISOString(),
    metadata: payment.metadata,
  }));

  return res.status(200).json(
    new ApiResponse(200, transformedPayments, "Payments fetched successfully")
  );
});

/**
 * @route   GET /api/v1/admin/payments/stats
 * @desc    Get payment statistics and revenue analytics
 * @access  Admin
 */
export const getPaymentStats = asyncHandler(async (req: Request, res: Response) => {
  const now = new Date();
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

  // Total revenue (all successful payments)
  const totalRevenueResult = await prisma.payment.aggregate({
    where: {
      status: { in: ['SUCCESS', 'COMPLETED'] },
    },
    _sum: {
      amount: true,
    },
  });

  // Current month revenue
  const currentMonthResult = await prisma.payment.aggregate({
    where: {
      status: { in: ['SUCCESS', 'COMPLETED'] },
      createdAt: {
        gte: currentMonthStart,
        lte: currentMonthEnd,
      },
    },
    _sum: {
      amount: true,
    },
  });

  // Previous month revenue
  const prevMonthResult = await prisma.payment.aggregate({
    where: {
      status: { in: ['SUCCESS', 'COMPLETED'] },
      createdAt: {
        gte: prevMonthStart,
        lte: prevMonthEnd,
      },
    },
    _sum: {
      amount: true,
    },
  });

  // Transaction counts by status
  const [successCount, failedCount, pendingCount] = await Promise.all([
    prisma.payment.count({ 
      where: { status: { in: ['SUCCESS', 'COMPLETED'] } } 
    }),
    prisma.payment.count({ 
      where: { status: 'FAILED' } 
    }),
    prisma.payment.count({ 
      where: { status: 'PENDING' } 
    }),
  ]);

  // Calculate percentage change
  const currentRevenue = Number(currentMonthResult._sum.amount || 0);
  const prevRevenue = Number(prevMonthResult._sum.amount || 0);
  const revenueChange = prevRevenue > 0 
    ? Number((((currentRevenue - prevRevenue) / prevRevenue) * 100).toFixed(2))
    : 0;

  // Get last 12 months revenue
  const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  
  const monthlyPayments = await prisma.payment.findMany({
    where: {
      status: { in: ['SUCCESS', 'COMPLETED'] },
      createdAt: {
        gte: twelveMonthsAgo,
      },
    },
    select: {
      amount: true,
      createdAt: true,
    },
  });

  // Group by month
  const monthlyRevenue = Array.from({ length: 12 }, (_, i) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
    const monthKey = date.toLocaleString('default', { month: 'short' });
    
    const monthRevenue = monthlyPayments
      .filter(p => {
        const pDate = new Date(p.createdAt);
        return pDate.getMonth() === date.getMonth() && 
               pDate.getFullYear() === date.getFullYear();
      })
      .reduce((sum, p) => sum + Number(p.amount), 0);

    return {
      month: monthKey,
      revenue: monthRevenue,
    };
  });

  const stats = {
    totalRevenue: Number(totalRevenueResult._sum.amount || 0),
    currentMonthRevenue: currentRevenue,
    revenueChange,
    successfulTransactions: successCount,
    failedTransactions: failedCount,
    pendingTransactions: pendingCount,
    monthlyRevenue,
  };

  return res.status(200).json(
    new ApiResponse(200, stats, "Payment statistics fetched successfully")
  );
});

/**
 * @route   GET /api/v1/admin/payments/:id
 * @desc    Get single payment details
 * @access  Admin
 */
export const getPaymentById = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const payment = await prisma.payment.findUnique({
    where: { id:id.toString() },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          phoneNumber: true,
        },
      },
    },
  });

  if (!payment) {
    throw new ApiError(404, "Payment not found");
  }

  const paymentDetails = {
    id: payment.id,
    userId: payment.userId,
    user: payment.user,
    amount: Number(payment.amount),
    currency: payment.currency,
    gateway: payment.paymentGateway,
    status: payment.status,
    transactionId: payment.transactionId,
    orderId: payment.orderId,
    metadata: payment.metadata,
    createdAt: payment.createdAt,
    updatedAt: payment.updatedAt,
  };

  return res.status(200).json(
    new ApiResponse(200, paymentDetails, "Payment details fetched successfully")
  );
});

/**
 * @route   GET /api/v1/admin/payments/export
 * @desc    Export payments as CSV
 * @access  Admin
 */
export const exportPayments = asyncHandler(async (req: Request, res: Response) => {
  const { startDate, endDate } = req.query;

  // Build date filter
  const dateFilter: any = {};
  if (startDate) {
    dateFilter.gte = new Date(startDate as string);
  }
  if (endDate) {
    dateFilter.lte = new Date(endDate as string);
  }

  const payments = await prisma.payment.findMany({
    where: {
      ...(Object.keys(dateFilter).length > 0 && { createdAt: dateFilter }),
    },
    include: {
      user: {
        select: {
          name: true,
          phoneNumber: true,
          email: true,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  // Generate CSV
  const csvHeaders = [
    'Transaction ID',
    'Order ID',
    'User Name',
    'Phone/Email',
    'Amount (INR)',
    'Gateway',
    'Status',
    'Date',
  ].join(',');

  const csvRows = payments.map(p => [
    p.transactionId || 'N/A',
    p.orderId || 'N/A',
    p.user.name || 'Unknown',
    p.user.phoneNumber || p.user.email || 'N/A',
    Number(p.amount),
    p.paymentGateway,
    p.status,
    new Date(p.createdAt).toLocaleString('en-IN'),
  ].join(','));

  const csv = [csvHeaders, ...csvRows].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename=payments-${Date.now()}.csv`);
  
  return res.status(200).send(csv);
});
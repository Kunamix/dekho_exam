import { prisma } from "@/database/db";
import { ApiResponse } from "@/utils/ApiResponse";
import { asyncHandler } from "@/utils/asyncHandler";
import { Request, Response } from "express";

export const getPaymentHistory = asyncHandler(async (req: Request, res: Response) => {
  const { page = 1, limit = 10 } = req.query;
  const skip = (Number(page) - 1) * Number(limit);

  const payments = await prisma.payment.findMany({
    skip,
    take: Number(limit),
    orderBy: { createdAt: 'desc' },
    include: {
      user: {
        select: { name: true, phoneNumber: true }
      }
    }
  });

  const formatted = payments.map(p => ({
    id: p.id,
    userId: p.userId,
    userName: p.user?.name || "Deleted User",
    phone: p.user?.phoneNumber,
    // Note: Assuming metadata contains plan name, or you fetch it via orderId logic
    planName: (p.metadata as any)?.planName || "Subscription", 
    amount: Number(p.amount),
    gateway: p.paymentGateway,
    status: p.status, // 'Success', 'Failed'
    date: p.createdAt
  }));

  return res.status(200).json(new ApiResponse(200, formatted, "Payments fetched"));
});

export const getSubscriptionPlansList = asyncHandler(async (_req: Request, res: Response) => {
  const plans = await prisma.subscriptionPlan.findMany({
    orderBy: { displayOrder: 'asc' },
    include: {
        category: { select: { name: true }} // To show which category it belongs to
    }
  });

  const formatted = plans.map(p => ({
    id: p.id,
    name: p.name,
    description: p.description,
    price: Number(p.price),
    durationDays: p.durationDays,
    type: p.type === 'CATEGORY_SPECIFIC' ? 'Category' : 'All',
    categoryId: p.categoryId,
    categoryName: p.category?.name || "All Categories",
    // Features are usually stored in description or a separate Json field. 
    // Assuming description is text, or you can add a Json field 'features' to your schema later.
    features: p.description?.split(',') || [], 
    isActive: p.isActive
  }));

  return res.status(200).json(new ApiResponse(200, formatted, "Plans fetched"));
});
import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { ApiResponse } from "../utils/ApiResponse";
import {prisma} from "@/database/db";

// Create Subscription Plan
export const createSubscriptionPlan = asyncHandler(
  async (req: Request, res: Response) => {
    const {
      name,
      description,
      price,
      durationDays,
      type,
      categoryId,
      displayOrder,
    } = req.body;

    if (!name || !price || !durationDays || !type) {
      throw new ApiError(
        400,
        "Name, price, duration, and type are required"
      );
    }

    if (type === "CATEGORY_SPECIFIC" && !categoryId) {
      throw new ApiError(
        400,
        "Category ID is required for category-specific plans"
      );
    }

    if (type === "ALL_CATEGORIES" && categoryId) {
      throw new ApiError(
        400,
        "Category ID should not be provided for all-categories plans"
      );
    }

    if (categoryId) {
      const category = await prisma.category.findUnique({
        where: { id: categoryId },
      });

      if (!category) {
        throw new ApiError(404, "Category not found");
      }
    }

    const plan = await prisma.subscriptionPlan.create({
      data: {
        name,
        description,
        price,
        durationDays: Number(durationDays),
        type,
        categoryId,
        displayOrder: displayOrder || 0,
      },
    });

    return res
      .status(201)
      .json(
        new ApiResponse(201, plan, "Subscription plan created successfully")
      );
  }
);

// Get All Subscription Plans
export const getAllSubscriptionPlans = asyncHandler(
  async (req: Request, res: Response) => {
    const { page = 1, limit = 10, isActive, type, categoryId } = req.query;

    const skip = (Number(page) - 1) * Number(limit);

    const where: any = {};

    if (isActive !== undefined) {
      where.isActive = isActive === "true";
    }

    if (type) {
      where.type = type as string;
    }

    if (categoryId) {
      where.categoryId = categoryId as string;
    }

    const [plans, total] = await Promise.all([
      prisma.subscriptionPlan.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: [{ displayOrder: "asc" }, { createdAt: "desc" }],
        include: {
          category: {
            select: {
              id: true,
              name: true,
            },
          },
          _count: {
            select: {
              userSubscriptions: true,
            },
          },
        },
      }),
      prisma.subscriptionPlan.count({ where }),
    ]);

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          plans,
          pagination: {
            total,
            page: Number(page),
            limit: Number(limit),
            totalPages: Math.ceil(total / Number(limit)),
          },
        },
        "Subscription plans fetched successfully"
      )
    );
  }
);

// Get Single Subscription Plan
export const getSubscriptionPlanById = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const plan = await prisma.subscriptionPlan.findUnique({
      where: { id:id.toString() },
      include: {
        category: {
          select: {
            id: true,
            name: true,
          },
        },
        userSubscriptions: {
          where: { isActive: true },
          select: {
            id: true,
            userId: true,
            startDate: true,
            endDate: true,
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
          take: 10,
        },
        _count: {
          select: {
            userSubscriptions: true,
          },
        },
      },
    });

    if (!plan) {
      throw new ApiError(404, "Subscription plan not found");
    }

    return res
      .status(200)
      .json(
        new ApiResponse(200, plan, "Subscription plan fetched successfully")
      );
  }
);

// Update Subscription Plan
export const updateSubscriptionPlan = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const {
      name,
      description,
      price,
      durationDays,
      displayOrder,
      isActive,
    } = req.body;

    const plan = await prisma.subscriptionPlan.findUnique({
      where: { id:id.toString() },
    });

    if (!plan) {
      throw new ApiError(404, "Subscription plan not found");
    }

    const updatedPlan = await prisma.subscriptionPlan.update({
      where: { id:id.toString() },
      data: {
        name,
        description,
        price,
        durationDays: durationDays ? Number(durationDays) : undefined,
        displayOrder,
        isActive,
      },
    });

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          updatedPlan,
          "Subscription plan updated successfully"
        )
      );
  }
);

// Delete Subscription Plan
export const deleteSubscriptionPlan = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const plan = await prisma.subscriptionPlan.findUnique({
      where: { id:id.toString() },
      include: {
        _count: {
          select: {
            userSubscriptions: true,
          },
        },
      },
    });

    if (!plan) {
      throw new ApiError(404, "Subscription plan not found");
    }

    if (plan._count.userSubscriptions > 0) {
      // Soft delete if plan has subscribers
      await prisma.subscriptionPlan.update({
        where: { id:id.toString() },
        data: { isActive: false },
      });

      return res
        .status(200)
        .json(
          new ApiResponse(
            200,
            {},
            "Subscription plan has been deactivated as it has active subscribers"
          )
        );
    }

    // Hard delete if no subscribers
    await prisma.subscriptionPlan.delete({
      where: { id:id.toString() },
    });

    return res
      .status(200)
      .json(
        new ApiResponse(200, {}, "Subscription plan deleted successfully")
      );
  }
);

// Get All User Subscriptions (Admin View)
export const getAllUserSubscriptions = asyncHandler(
  async (req: Request, res: Response) => {
    const {
      page = 1,
      limit = 10,
      isActive,
      userId,
      planId,
      categoryId,
    } = req.query;

    const skip = (Number(page) - 1) * Number(limit);

    const where: any = {};

    if (isActive !== undefined) {
      where.isActive = isActive === "true";
    }

    if (userId) {
      where.userId = userId as string;
    }

    if (planId) {
      where.planId = planId as string;
    }

    if (categoryId) {
      where.categoryId = categoryId as string;
    }

    const [subscriptions, total] = await Promise.all([
      prisma.userSubscription.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { createdAt: "desc" },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              phoneNumber: true,
            },
          },
          plan: {
            select: {
              id: true,
              name: true,
              price: true,
              durationDays: true,
              type: true,
            },
          },
        },
      }),
      prisma.userSubscription.count({ where }),
    ]);

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          subscriptions,
          pagination: {
            total,
            page: Number(page),
            limit: Number(limit),
            totalPages: Math.ceil(total / Number(limit)),
          },
        },
        "User subscriptions fetched successfully"
      )
    );
  }
);

// Manually Create User Subscription
export const createUserSubscription = asyncHandler(
  async (req: Request, res: Response) => {
    const { userId, planId, startDate, durationDays } = req.body;

    if (!userId || !planId) {
      throw new ApiError(400, "User ID and Plan ID are required");
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new ApiError(404, "User not found");
    }

    const plan = await prisma.subscriptionPlan.findUnique({
      where: { id: planId },
    });

    if (!plan) {
      throw new ApiError(404, "Subscription plan not found");
    }

    const start = startDate ? new Date(startDate) : new Date();
    const duration = durationDays || plan.durationDays;
    const end = new Date(start);
    end.setDate(end.getDate() + duration);

    const subscription = await prisma.userSubscription.create({
      data: {
        userId,
        planId,
        type: plan.type,
        categoryId: plan.categoryId,
        startDate: start,
        endDate: end,
      },
    });

    return res
      .status(201)
      .json(
        new ApiResponse(
          201,
          subscription,
          "User subscription created successfully"
        )
      );
  }
);

// Cancel User Subscription
export const cancelUserSubscription = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const subscription = await prisma.userSubscription.findUnique({
      where: { id:id.toString() },
    });

    if (!subscription) {
      throw new ApiError(404, "Subscription not found");
    }

    const updatedSubscription = await prisma.userSubscription.update({
      where: { id:id.toString() },
      data: {
        isActive: false,
        autoRenew: false,
      },
    });

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          updatedSubscription,
          "Subscription cancelled successfully"
        )
      );
  }
);

// Extend User Subscription
export const extendUserSubscription = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { additionalDays } = req.body;

    if (!additionalDays || Number(additionalDays) <= 0) {
      throw new ApiError(400, "Valid additional days are required");
    }

    const subscription = await prisma.userSubscription.findUnique({
      where: { id:id.toString() },
    });

    if (!subscription) {
      throw new ApiError(404, "Subscription not found");
    }

    const newEndDate = new Date(subscription.endDate);
    newEndDate.setDate(newEndDate.getDate() + Number(additionalDays));

    const updatedSubscription = await prisma.userSubscription.update({
      where: { id:id.toString() },
      data: {
        endDate: newEndDate,
      },
    });

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          updatedSubscription,
          `Subscription extended by ${additionalDays} days`
        )
      );
  }
);

// Get Subscription Statistics
export const getSubscriptionStats = asyncHandler(
  async (req: Request, res: Response) => {
    const [
      totalPlans,
      activePlans,
      totalSubscriptions,
      activeSubscriptions,
      expiringSoon,
      revenueData,
    ] = await Promise.all([
      prisma.subscriptionPlan.count(),
      prisma.subscriptionPlan.count({ where: { isActive: true } }),
      prisma.userSubscription.count(),
      prisma.userSubscription.count({
        where: {
          isActive: true,
          endDate: { gte: new Date() },
        },
      }),
      prisma.userSubscription.count({
        where: {
          isActive: true,
          endDate: {
            gte: new Date(),
            lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
          },
        },
      }),
      prisma.payment.aggregate({
        where: { status: "SUCCESS" },
        _sum: { amount: true },
      }),
    ]);

    const stats = {
      plans: {
        total: totalPlans,
        active: activePlans,
      },
      subscriptions: {
        total: totalSubscriptions,
        active: activeSubscriptions,
        expiringSoon,
      },
      revenue: {
        total: revenueData._sum.amount || 0,
      },
    };

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          stats,
          "Subscription statistics fetched successfully"
        )
      );
  }
);
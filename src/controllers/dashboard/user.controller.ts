import { prisma } from "@/database/db";
import { ApiResponse } from "@/utils/ApiResponse";
import { asyncHandler } from "@/utils/asyncHandler";
import { Request, Response } from "express";

export const getAllUsersData = asyncHandler(async (req: Request, res: Response) => {
  const { page = 1, limit = 10 } = req.query;
  const skip = (Number(page) - 1) * Number(limit);

  const users = await prisma.user.findMany({
    skip,
    take: Number(limit),
    orderBy: { createdAt: 'desc' },
    include: {
      _count: {
        select: {
          subscriptions: { where: { isActive: true } } // activeSubscriptions
        }
      }
    }
  });

  const total = await prisma.user.count();

  const formatted = users.map(u => ({
    id: u.id,
    phone: u.phoneNumber,
    email: u.email,
    name: u.name,
    role: u.role === 'ADMIN' ? 'Admin' : 'Student',
    freeTestsUsed: u.freeTestsUsed,
    activeSubscriptions: u._count.subscriptions,
    registeredOn: u.createdAt,
    lastLogin: u.lastLoginAt,
    status: u.isActive ? 'Active' : 'Inactive'
  }));

  return res.status(200).json(
    new ApiResponse(200, { users: formatted, total, page: Number(page) }, "Users list fetched")
  );
});
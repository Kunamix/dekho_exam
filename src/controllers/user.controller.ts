import { prisma } from "@/database/db";
import { ApiError } from "@/utils/ApiError";
import { ApiResponse } from "@/utils/ApiResponse";
import { asyncHandler } from "@/utils/asyncHandler";
import { Request, Response } from "express";

export const updateProfile = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user?.id;
  const { name, email } = req.body;

  if (!userId) {
    throw new ApiError(401, "Unauthorized request");
  }

  // 1. Validation: Ensure at least one field is provided
  if (!name && !email) {
    throw new ApiError(400, "Please provide a name or email to update");
  }

  // 2. Prepare the data object dynamically
  const dataToUpdate: any = {};

  // Handle Name Update
  if (name) {
    dataToUpdate.name = name;
  }

  // Handle Email Update
  if (email) {
    // A. Check if email is valid format (Basic Regex)
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new ApiError(400, "Invalid email format");
    }

    // B. Check if email is already taken by ANOTHER user
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser && existingUser.id !== userId) {
      throw new ApiError(409, "Email is already associated with another account");
    }

    dataToUpdate.email = email;
    // Important: If email changes, it is no longer verified
    dataToUpdate.isEmailVerified = false; 
  }

  // 3. Update User in Database
  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: dataToUpdate,
    select: {
      id: true,
      name: true,
      email: true,
      phoneNumber: true,
      role: true,
      isEmailVerified: true,
      updatedAt: true,
    },
  });

  return res
    .status(200)
    .json(new ApiResponse(200, updatedUser, "Profile updated successfully"));
});

// Get All Users
export const getAllUsers = asyncHandler(
  async (req: Request, res: Response) => {
    const {
      page = 1,
      limit = 10,
      role,
      isActive,
      search,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const skip = (Number(page) - 1) * Number(limit);

    const where: any = {};

    if (role) {
      where.role = role as string;
    }

    if (isActive !== undefined) {
      where.isActive = isActive === "true";
    }

    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: "insensitive" } },
        { email: { contains: search as string, mode: "insensitive" } },
        { phoneNumber: { contains: search as string, mode: "insensitive" } },
      ];
    }

    const orderBy: any = {};
    orderBy[sortBy as string] = sortOrder;

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy,
        select: {
          id: true,
          name: true,
          email: true,
          phoneNumber: true,
          role: true,
          isActive: true,
          isEmailVerified: true,
          isPhoneVerified: true,
          freeTestsUsed: true,
          lastLoginAt: true,
          createdAt: true,
          _count: {
            select: {
              testAttempts: true,
              subscriptions: true,
              payments: true,
            },
          },
        },
      }),
      prisma.user.count({ where }),
    ]);

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          users,
          pagination: {
            total,
            page: Number(page),
            limit: Number(limit),
            totalPages: Math.ceil(total / Number(limit)),
          },
        },
        "Users fetched successfully"
      )
    );
  }
);

// Get Single User Details
export const getUserById = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const user = await prisma.user.findUnique({
      where: { id:id.toString() },
      include: {
        subscriptions: {
          include: {
            plan: {
              select: {
                id: true,
                name: true,
                price: true,
                type: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
        },
        testAttempts: {
          include: {
            test: {
              select: {
                id: true,
                name: true,
                testNumber: true,
                category: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
          },
          orderBy: { createdAt: "desc" },
          take: 10,
        },
        payments: {
          orderBy: { createdAt: "desc" },
          take: 10,
        },
        sessions: {
          where: { isActive: true },
          select: {
            id: true,
            deviceName: true,
            deviceType: true,
            lastActivity: true,
            ipAddress: true,
          },
        },
        _count: {
          select: {
            testAttempts: true,
            subscriptions: true,
            payments: true,
          },
        },
      },
    });

    if (!user) {
      throw new ApiError(404, "User not found");
    }

    // Remove sensitive data
    const { password, ...userWithoutPassword } = user;

    return res
      .status(200)
      .json(
        new ApiResponse(200, userWithoutPassword, "User fetched successfully")
      );
  }
);

// Update User
export const updateUser = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { name, email, phoneNumber, role, isEmailVerified, isPhoneVerified } =
      req.body;

    const user = await prisma.user.findUnique({
      where: { id:id.toString() },
    });

    if (!user) {
      throw new ApiError(404, "User not found");
    }

    // Check for duplicate email
    if (email && email !== user.email) {
      const existingUser = await prisma.user.findUnique({
        where: { email },
      });

      if (existingUser) {
        throw new ApiError(409, "Email already in use");
      }
    }

    // Check for duplicate phone number
    if (phoneNumber && phoneNumber !== user.phoneNumber) {
      const existingUser = await prisma.user.findUnique({
        where: { phoneNumber },
      });

      if (existingUser) {
        throw new ApiError(409, "Phone number already in use");
      }
    }

    const updatedUser = await prisma.user.update({
      where: { id:id.toString() },
      data: {
        name,
        email,
        phoneNumber,
        role,
        isEmailVerified,
        isPhoneVerified,
      },
      select: {
        id: true,
        name: true,
        email: true,
        phoneNumber: true,
        role: true,
        isActive: true,
        isEmailVerified: true,
        isPhoneVerified: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return res
      .status(200)
      .json(new ApiResponse(200, updatedUser, "User updated successfully"));
  }
);

// Ban/Unban User
export const toggleUserBan = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const adminId = (req as any).user?.id;

    const user = await prisma.user.findUnique({
      where: { id:id.toString() },
    });

    if (!user) {
      throw new ApiError(404, "User not found");
    }

    if (user.role === "ADMIN") {
      throw new ApiError(403, "Cannot ban admin users");
    }

    const updatedUser = await prisma.user.update({
      where: { id:id.toString() },
      data: {
        isActive: !user.isActive,
      },
      select: {
        id: true,
        name: true,
        email: true,
        isActive: true,
      },
    });

    // Log the action
    await prisma.auditLog.create({
      data: {
        userId: adminId,
        action: user.isActive ? "USER_BANNED" : "USER_UNBANNED",
        entity: "USER",
        entityId: id.toString(),
        details: {
          targetUser: {
            id: user.id,
            name: user.name,
            email: user.email,
          },
        },
      },
    });

    // If banning, invalidate all sessions
    if (!updatedUser.isActive) {
      await prisma.session.deleteMany({
        where: { userId: id.toString() },
      });
    }

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          updatedUser,
          `User ${updatedUser.isActive ? "unbanned" : "banned"} successfully`
        )
      );
  }
);

// Delete User
export const deleteUser = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const adminId = (req as any).user?.id;

    const user = await prisma.user.findUnique({
      where: { id:id.toString() },
    });

    if (!user) {
      throw new ApiError(404, "User not found");
    }

    if (user.role === "ADMIN") {
      throw new ApiError(403, "Cannot delete admin users");
    }

    // Log the action before deletion
    await prisma.auditLog.create({
      data: {
        userId: adminId,
        action: "USER_DELETED",
        entity: "USER",
        entityId: id.toString(),
        details: {
          deletedUser: {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
          },
        },
      },
    });

    // Delete user (cascading deletes will handle related records)
    await prisma.user.delete({
      where: { id:id.toString() },
    });

    return res
      .status(200)
      .json(new ApiResponse(200, {}, "User deleted successfully"));
  }
);

// Reset User Free Tests
export const resetUserFreeTests = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const adminId = (req as any).user?.id;

    const user = await prisma.user.findUnique({
      where: { id:id.toString() },
    });

    if (!user) {
      throw new ApiError(404, "User not found");
    }

    const updatedUser = await prisma.user.update({
      where: { id:id.toString() },
      data: {
        freeTestsUsed: 0,
      },
      select: {
        id: true,
        name: true,
        email: true,
        freeTestsUsed: true,
      },
    });

    // Log the action
    await prisma.auditLog.create({
      data: {
        userId: adminId,
        action: "FREE_TESTS_RESET",
        entity: "USER",
        entityId: id.toString(),
        details: {
          targetUser: {
            id: user.id,
            name: user.name,
          },
          previousFreeTestsUsed: user.freeTestsUsed,
        },
      },
    });

    return res
      .status(200)
      .json(
        new ApiResponse(200, updatedUser, "Free tests reset successfully")
      );
  }
);

// Invalidate User Sessions
export const invalidateUserSessions = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const adminId = (req as any).user?.id;

    const user = await prisma.user.findUnique({
      where: { id:id.toString() },
    });

    if (!user) {
      throw new ApiError(404, "User not found");
    }

    const deletedSessions = await prisma.session.deleteMany({
      where: { userId: id.toString() },
    });

    // Log the action
    await prisma.auditLog.create({
      data: {
        userId: adminId,
        action: "SESSIONS_INVALIDATED",
        entity: "USER",
        entityId: id.toString(),
        details: {
          targetUser: {
            id: user.id,
            name: user.name,
          },
          sessionsInvalidated: deletedSessions.count,
        },
      },
    });

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          { sessionsInvalidated: deletedSessions.count },
          "User sessions invalidated successfully"
        )
      );
  }
);

// Get User Statistics
export const getUserStats = asyncHandler(
  async (_req: Request, res: Response) => {
    const [
      totalUsers,
      activeUsers,
      bannedUsers,
      studentCount,
      adminCount,
      verifiedEmailCount,
      verifiedPhoneCount,
      recentRegistrations,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { isActive: true } }),
      prisma.user.count({ where: { isActive: false } }),
      prisma.user.count({ where: { role: "STUDENT" } }),
      prisma.user.count({ where: { role: "ADMIN" } }),
      prisma.user.count({ where: { isEmailVerified: true } }),
      prisma.user.count({ where: { isPhoneVerified: true } }),
      prisma.user.count({
        where: {
          createdAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
          },
        },
      }),
    ]);

    const stats = {
      total: totalUsers,
      active: activeUsers,
      banned: bannedUsers,
      byRole: {
        students: studentCount,
        admins: adminCount,
      },
      verification: {
        emailVerified: verifiedEmailCount,
        phoneVerified: verifiedPhoneCount,
      },
      recentRegistrations,
    };

    return res
      .status(200)
      .json(
        new ApiResponse(200, stats, "User statistics fetched successfully")
      );
  }
);

// Search Users
export const searchUsers = asyncHandler(
  async (req: Request, res: Response) => {
    const { query, limit = 10 } = req.query;

    if (!query || (query as string).length < 2) {
      throw new ApiError(400, "Search query must be at least 2 characters");
    }

    const users = await prisma.user.findMany({
      where: {
        OR: [
          { name: { contains: query as string, mode: "insensitive" } },
          { email: { contains: query as string, mode: "insensitive" } },
          { phoneNumber: { contains: query as string, mode: "insensitive" } },
        ],
      },
      take: Number(limit),
      select: {
        id: true,
        name: true,
        email: true,
        phoneNumber: true,
        role: true,
        isActive: true,
      },
    });

    return res
      .status(200)
      .json(new ApiResponse(200, users, "Users search completed"));
  }
);
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
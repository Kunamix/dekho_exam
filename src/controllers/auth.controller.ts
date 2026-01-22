import { myEnvironment } from "@/configs/env";
import { prisma } from "@/database/db";
// import { generateOTP } from "@/helpers/generateOTP";
import { authHelper } from "@/helpers/tokenGenerateAndVerify";
import { ApiError } from "@/utils/ApiError";
import { ApiResponse } from "@/utils/ApiResponse";
import { asyncHandler } from "@/utils/asyncHandler";
import { Request, Response } from "express";

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { phoneNumber } = req.body;

  // 1. Validation
  if (!phoneNumber) {
    throw new ApiError(400, "Please provide phone number");
  }

  // 2. Cleanup: Remove any existing OTPs for this user to keep DB clean
  await prisma.oTP.deleteMany({
    where: { phoneNumber },
  });

  // 3. Generate OTP and Expiry
  // const otp = generateOTP();
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + 5); // 5 Minutes expiration

  await prisma.oTP.deleteMany({
    where: {
      phoneNumber: phoneNumber,
    },
  });

  // 4. Save to Database
  const otpRecord = await prisma.oTP.create({
    data: {
      code: "123456",
      phoneNumber,
      expiresAt,
    },
  });

  const verificationToken = authHelper.signToken(
    {
      phoneNumber,
      otpId: otpRecord.id,
    },
    myEnvironment.OTP_VERIFY_SECRET as string,
    {
      expiresIn: "5m", // Token expires same time as OTP
    },
  );

  res.cookie("verificationToken", verificationToken, {
    httpOnly: true,
    secure: myEnvironment.NODE_ENV === "production",
    maxAge: 15 * 60 * 1000,
    sameSite: myEnvironment.NODE_ENV === "production" ? "none" : "lax",
  });
  // 7. Send Response
  return res.status(200).json(
    new ApiResponse(
      200,
      {
        phoneNumber,
        verificationToken, // Save this in AsyncStorage/SecureStore in React Native
        expiresAt,
      },
      "OTP sent successfully",
    ),
  );
});

export const verifyOTP = asyncHandler(async (req: Request, res: Response) => {
  const { otpCode } = req.body;

  // deviceId (from header or fallback)
  const deviceId =
    req.headers["x-device-id"]?.toString() ??
    req.cookies?.deviceId ??
    "unknown-device";

  // user-agent string
  const userAgent = req.headers["user-agent"] ?? "unknown";

  // derive device info
  const deviceName = userAgent;
  const deviceType = /mobile/i.test(userAgent) ? "MOBILE" : "WEB";

  const token =
    req.headers.authorization?.split(" ")[1] || req.cookies?.verificationToken;

  if (!token) {
    throw new ApiError(401, "Verification token is missing");
  }

  let decoded: any;
  try {
    decoded = authHelper.verifyToken(
      token,
      myEnvironment.OTP_VERIFY_SECRET as string,
    );
  } catch (error) {
    throw new ApiError(401, "Session expired. Please request a new OTP");
  }

  const { otpId, phoneNumber } = decoded;

  const otpRecord = await prisma.oTP.findUnique({
    where: {
      id: otpId,
    },
  });

  if (!otpRecord) {
    throw new ApiError(400, "Invalid request or OTP expired");
  }

  if (new Date() > otpRecord.expiresAt) {
    await prisma.oTP.delete({ where: { id: otpId } });
    throw new ApiError(400, "OTP has expired");
  }

  if (otpRecord.attempts >= 3) {
    await prisma.oTP.delete({ where: { id: otpId } });
    throw new ApiError(
      429,
      "Too many failed attempts. Please request a new OTP.",
    );
  }

  if (otpRecord.code !== otpCode) {
    await prisma.oTP.update({
      where: { id: otpId },
      data: { attempts: { increment: 1 } },
    });
    throw new ApiError(400, "Invalid OTP code");
  }

  const { user, accessToken, refreshToken } = await prisma.$transaction(
    async (tx) => {
      let user = await tx.user.findUnique({
        where: { phoneNumber },
      });

      if (!user) {
        user = await tx.user.create({
          data: {
            phoneNumber,
            isPhoneVerified: true,
            role: "STUDENT",
            isActive: true,
          },
        });
      } else {
        user = await tx.user.update({
          where: { id: user.id },
          data: {
            isPhoneVerified: true,
            lastLoginAt: new Date(),
          },
        });

        if (!user.isActive) {
          throw new ApiError(
            403,
            "Your account has been deactivated. Contact Admin",
          );
        }
      }

      const accessToken = authHelper.signToken(
        {
          id: user.id,
        },
        myEnvironment.ACCESS_SECRET as string,
        {
          expiresIn: "3d",
        },
      );
      const refreshToken = authHelper.signToken(
        {
          id: user.id,
        },
        myEnvironment.REFRESH_SECRET as string,
        {
          expiresIn: "7d",
        },
      );

      const refreshTokenExpiry = new Date();
      refreshTokenExpiry.setDate(refreshTokenExpiry.getDate() + 7);

      await tx.session.create({
        data: {
          userId: user.id,
          token: accessToken,
          refreshToken: refreshToken,
          deviceId: deviceId || "unknown",
          deviceName: deviceName || req.headers["user-agent"] || "unknown",
          deviceType: deviceType || "mobile",
          expiresAt: refreshTokenExpiry,
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"],
          isActive: true,
        },
      });

      await tx.oTP.delete({
        where: { id: otpId },
      });

      return { user, accessToken, refreshToken };
    },
  );

  await prisma.oTP.deleteMany({
    where: {
      phoneNumber: phoneNumber,
    },
  });
  res.cookie("accessToken", accessToken, {
    httpOnly: true,
    secure: myEnvironment.NODE_ENV === "production",
    maxAge: 15 * 60 * 1000,
    sameSite: myEnvironment.NODE_ENV === "production" ? "none" : "lax",
  });

  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    sameSite: myEnvironment.NODE_ENV === "production" ? "none" : "lax",
  });
  return res.status(200).json(
    new ApiResponse(
      200,
      {
        user,
        accessToken,
        refreshToken,
      },
      "User verified and logged in successfully",
    ),
  );
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user?.userId;

  // 1. Get the Refresh Token from cookies or body
  // We need this to identify *which* specific device/session to log out.
  const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;

  if (userId && refreshToken) {
    // 2. Deactivate the session in the database
    // We use updateMany in case there are duplicates, though typically it's unique.
    await prisma.session.updateMany({
      where: {
        userId: userId,
        refreshToken: refreshToken,
      },
      data: {
        isActive: false,
      },
    });
  }

  // 3. Clear Cookies
  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  };

  return res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(new ApiResponse(200, {}, "User logged out successfully"));
});

export const getMe = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user?.userId;

  if (!userId) {
    throw new ApiError(401, "Unauthorized request");
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      phoneNumber: true,
      avatar: true,
      role: true,
      isActive: true,
      isEmailVerified: true,
      isPhoneVerified: true,
      freeTestsUsed: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, user, "User profile fetched successfully"));
});

export const updateProfile = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = (req as any).user?.userId;
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
        throw new ApiError(
          409,
          "Email is already associated with another account",
        );
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
  },
);

export const updatePassword = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = (req as any).user?.userId;
    const { currentPassword, newPassword } = req.body;

    if (!userId) {
      throw new ApiError(401, "Unauthorized request");
    }

    if (!newPassword) {
      throw new ApiError(400, "New password is required");
    }

    // 1️⃣ Get user with password
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        password: true,
      },
    });

    if (!user) {
      throw new ApiError(404, "User not found");
    }

    // 2️⃣ If password EXISTS → verify current password
    if (user.password) {
      if (!currentPassword) {
        throw new ApiError(400, "Current password is required");
      }

      const isMatch = await authHelper.verifyHash(currentPassword, user.password);

      if (!isMatch) {
        throw new ApiError(401, "Current password is incorrect");
      }
    }

    // 3️⃣ Hash new password
    const hashedPassword = await authHelper.signHash(newPassword);

    // 4️⃣ Update password
    await prisma.user.update({
      where: { id: userId },
      data: {
        password: hashedPassword,
      },
    });

    // 5️⃣ OPTIONAL BUT RECOMMENDED: logout all sessions
    await prisma.session.deleteMany({
      where: { userId },
    });

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          null,
          "Password updated successfully. Please login again.",
        ),
      );
  },
);

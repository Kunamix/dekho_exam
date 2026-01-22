import { myEnvironment } from "@/configs/env";
import { prisma } from "@/database/db";
import { sendOTPviaSMS } from "@/helpers/sendOTP";
import { authHelper } from "@/helpers/tokenGenerateAndVerify";
import { ApiError } from "@/utils/ApiError";
import { ApiResponse } from "@/utils/ApiResponse";
import { asyncHandler } from "@/utils/asyncHandler";
import { Request, Response } from "express";

export const admin = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user?.userId;

  if (!userId) {
    throw new ApiError(400, "Your session is expired");
  }

  const admin = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!admin) {
    throw new ApiError(401, "Unauthorized request");
  }

  return res
    .status(201)
    .json(new ApiResponse(201, admin, "user info get successfully"));
});

export const adminLogin = asyncHandler(async (req: Request, res: Response) => {
  const { email, password, phoneNumber } = req.body;
  
  if (!email && !phoneNumber) {
    throw new ApiError(400, "Please provide all filed");
  }

  if (email && password) {
    const admin = await prisma.user.findUnique({
      where: { email },
    });

    if (!admin || admin.role !== "ADMIN") {
      throw new ApiError(401, "Invalid credentials");
    }

    if (!admin.password) {
      throw new ApiError(401, "Please use OTP login");
    }

    const isPasswordValid = await authHelper.verifyHash(
      password,
      admin.password,
    );

    if (!isPasswordValid) {
      throw new ApiError(401, "Invalid credentials");
    }

    await prisma.session.deleteMany({
      where: {
        userId: admin.id,
      },
    });

    const accessToken = authHelper.signToken(
      {
        id: admin.id,
      },
      myEnvironment.ACCESS_SECRET as string,
      {
        expiresIn: "3d",
      },
    );
    const refreshToken = authHelper.signToken(
      {
        id: admin.id,
      },
      myEnvironment.REFRESH_SECRET as string,
      {
        expiresIn: "7d",
      },
    );

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await prisma.session.create({
      data: {
        userId: admin.id,
        deviceId: req.body.deviceId || "web-admin",
        deviceName: req.body.deviceName || "Admin Panel",
        deviceType: req.body.deviceType || "web",
        token: accessToken,
        refreshToken,
        expiresAt,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"] || "",
      },
    });

    await prisma.user.update({
      where: { id: admin.id },
      data: { lastLoginAt: new Date() },
    });

    res.cookie("accessToken", accessToken, {
      httpOnly: true,
      secure: myEnvironment.NODE_ENV === "production",
      maxAge: 3 * 24 * 60 * 60 * 1000,
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
          user: {
            id: admin.id,
            name: admin.name,
            email: admin.email,
            role: admin.role,
          },
          accessToken,
          refreshToken,
        },
        "Login Successful",
      ),
    );
  } else {
    const admin = await prisma.user.findUnique({
      where: { phoneNumber },
    });

    if (!admin || admin.role !== "ADMIN") {
      throw new ApiError(401, "Invalid phone number");
    }

    // const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const otpCode = '123456';
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 10);

    const otpRecord = await prisma.oTP.create({
      data: {
        phoneNumber,
        code: otpCode,
        purpose: "admin-login",
        expiresAt,
      },
    });

    // await sendOTPviaSMS(phoneNumber, otpCode);

    const token = authHelper.signToken(
      {
        id: admin.id,
        otpId: otpRecord.id,
        phoneNumber,
      },
      myEnvironment.OTP_VERIFY_SECRET as string,
      {
        expiresIn: "5m",
      },
    );

    res.cookie("otpVerifyToken", token, {
      httpOnly: true,
      secure: myEnvironment.NODE_ENV === "production",
      maxAge: 5 * 60 * 1000,
      sameSite: myEnvironment.NODE_ENV === "production" ? "none" : "lax",
    });

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          otpId: otpRecord.id,
          expiresAt,
          phoneNumber,
          token,
        },
        "OTP sent successfully",
      ),
    );
  }
});

export const adminVerifyOTP = asyncHandler(
  async (req: Request, res: Response) => {
    const { otpCode } = req.body;

    const token =
      req.headers.authorization?.split(" ")[1] || req.cookies?.otpVerifyToken;

    const decodeToken = authHelper.verifyToken(
      token,
      myEnvironment.OTP_VERIFY_SECRET as string,
    );

    if (!decodeToken) {
      throw new ApiError(404, "OTP is not valid");
    }
   
    const otpRecord = await prisma.oTP.findUnique({
      where: {
        id: decodeToken.otpId,
      },
    });


    if (!otpRecord || otpRecord.phoneNumber?.toString() !== decodeToken.phoneNumber.toString()) {
      throw new ApiError(401, "Invalid OTP");
    }
   
    if (otpRecord.isVerified) {
      throw new ApiError(401, "OTP already used");
    }

    if (new Date() > otpRecord.expiresAt) {
      throw new ApiError(401, "OTP expired");
    }

    if (otpRecord.attempts >= 3) {
      throw new ApiError(401, "Too many attempts");
    }

    
    if (otpRecord.code !== otpCode) {
      await prisma.oTP.update({
        where: { id: decodeToken.otpId },
        data: { attempts: otpRecord.attempts + 1 },
      });

      throw new ApiError(401, "Invalid OTP");
    }

    await prisma.oTP.update({
      where: { id: decodeToken.otpId },
      data: { isVerified: true },
    });

    const admin = await prisma.user.findUnique({
      where: { phoneNumber: decodeToken.phoneNumber },
    });

    if (!admin || admin.role !== "ADMIN") {
      throw new ApiError(401, "Invalid credentials");
    }

    await prisma.session.deleteMany({
      where: { userId: admin.id },
    });

    const accessToken = authHelper.signToken(
      {
        id: admin.id,
      },
      myEnvironment.ACCESS_SECRET as string,
      {
        expiresIn: "3d",
      },
    );
    const refreshToken = authHelper.signToken(
      {
        id: admin.id,
      },
      myEnvironment.REFRESH_SECRET as string,
      {
        expiresIn: "7d",
      },
    );

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await prisma.session.create({
      data: {
        userId: admin.id,
        deviceId: req.body.deviceId || "web-admin",
        deviceName: req.body.deviceName || "Admin Panel",
        deviceType: req.body.deviceType || "web",
        token: accessToken,
        refreshToken,
        expiresAt,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"] || "",
      },
    });

    // Update last login and verify phone
    await prisma.user.update({
      where: { id: admin.id },
      data: {
        lastLoginAt: new Date(),
        isPhoneVerified: true,
      },
    });

    // Set cookies
    res.cookie("accessToken", accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 3 * 24 * 60 * 60 * 1000,
      sameSite: myEnvironment.NODE_ENV === "production" ? "none" : "lax",
    });

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 7 * 24 * 60 * 60 * 1000,
      sameSite: myEnvironment.NODE_ENV === "production" ? "none" : "lax",
    });

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          user: {
            id: admin.id,
            name: admin.name,
            phoneNumber: admin.phoneNumber,
            role: admin.role,
          },
          accessToken,
          refreshToken,
        },
        "Login successful",
      ),
    );
  },
);

export const adminLogout = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user?.userId;

  if (!userId) {
    throw new ApiError(401, "Unauthorized");
  }

  await prisma.session.deleteMany({
    where: { userId },
  });

  res.clearCookie("accessToken");
  res.clearCookie("refreshToken");

  return res.status(200).json(new ApiResponse(200, {}, "Logout successful"));
});

export const adminChangePassword = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = (req as any).user?.userId;
    const { currentPassword, newPassword } = req.body;

    if (!userId) {
      throw new ApiError(401, "Unauthorized");
    }

    if (!currentPassword || !newPassword) {
      throw new ApiError(400, "Current password and new password are required");
    }

    if (newPassword.length < 8) {
      throw new ApiError(400, "New password must be at least 8 characters");
    }

    const admin = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!admin || admin.role !== "ADMIN") {
      throw new ApiError(401, "Unauthorized");
    }

    if (!admin.password) {
      throw new ApiError(400, "No password set for this account");
    }

    const isPasswordValid = await authHelper.verifyHash(
      currentPassword,
      admin.password,
    );

    if (!isPasswordValid) {
      throw new ApiError(401, "Current password is incorrect");
    }

    const hashedPassword = await authHelper.signHash(newPassword);

    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });

    const currentToken =
      req.cookies.accessToken || req.headers.authorization?.split(" ")[1];

    await prisma.session.deleteMany({
      where: {
        userId,
        token: { not: currentToken },
      },
    });

    return res
      .status(200)
      .json(new ApiResponse(200, {}, "Password changed successfully"));
  },
);

export const adminRefreshToken = asyncHandler(
  async (req: Request, res: Response) => {
    const refreshToken = req.cookies.refreshToken;

    if (!refreshToken) {
      throw new ApiError(401, "Refresh token required");
    }

    const decoded = authHelper.verifyToken(
      refreshToken,
      myEnvironment.REFRESH_SECRET as string,
    );

    const session = await prisma.session.findFirst({
      where: {
        refreshToken,
        userId: decoded.id,
      },
    });

    if (!session) {
      throw new ApiError(401, "Invalid refresh token");
    }

    if (new Date() > session.expiresAt) {
      await prisma.session.delete({
        where: { id: session.id },
      });

      throw new ApiError(401, "Session expired");
    }

    const accessToken = authHelper.signToken(
      {
        id: decoded.id,
      },
      myEnvironment.ACCESS_SECRET as string,
      {
        expiresIn: "3d",
      },
    );
    const newRefreshToken = authHelper.signToken(
      {
        id: decoded.id,
      },
      myEnvironment.REFRESH_SECRET as string,
      {
        expiresIn: "7d",
      },
    );

    await prisma.session.update({
      where: { id: session.id },
      data: {
        token: accessToken,
        refreshToken: newRefreshToken,
        lastActivity: new Date(),
      },
    });

    res.cookie("accessToken", accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 3 * 24 * 60 * 60 * 1000,
      sameSite: myEnvironment.NODE_ENV === "production" ? "none" : "lax",
    });

    res.cookie("refreshToken", newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 7 * 24 * 60 * 60 * 1000,
      sameSite: myEnvironment.NODE_ENV === "production" ? "none" : "lax",
    });

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          accessToken,
          refreshToken: newRefreshToken,
        },
        "Token refreshed successfully",
      ),
    );
  },
);

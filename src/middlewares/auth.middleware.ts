import { myEnvironment } from "@/configs/env";
import { prisma } from "@/database/db";
import { authHelper } from "@/helpers/tokenGenerateAndVerify";
import { ApiError } from "@/utils/ApiError";
import { asyncHandler } from "@/utils/asyncHandler";
import { NextFunction, Request, Response } from "express";
// import { decode } from "node:punycode";

export interface AuthRequest extends Request {
  user?: {
    userId: string;
  };
}
export const verifyToken = asyncHandler(
  async (req: Request, _res: Response, next: NextFunction) => {
    const token =
      req.cookies?.accessToken || req.headers.authorization?.split(" ")[1];

    if (!token) {
      throw new ApiError(401, "Access token required");
    }
    const decoded = authHelper.verifyToken(
      token,
      myEnvironment.ACCESS_SECRET as string,
    );

    

    const session = await prisma.session.findFirst({
      where: {
        token,
        userId: decoded.id,
      },
    });
    

    if (!session) {
      throw new ApiError(401, "Invalid or expired session");
    }

    if (new Date() > session.expiresAt) {
      await prisma.session.delete({
        where: { id: session.id },
      });

      throw new ApiError(401, "Session expired");
    }

    (req as AuthRequest).user = {
      userId: decoded.id,
    };

    next();
  },
);

export const verifyAdmin = asyncHandler(
  async (req: Request, _res: Response, next: NextFunction) => {
    const user = (req as AuthRequest).user;

    if(!user){
      throw new ApiError(403,"Admin access required");
    }

    const admin = await prisma.user.findUnique({
      where: {id: user.userId}
    })

    if(!admin || admin.role !== "ADMIN"){
      throw new ApiError(403, "Admin access required");
    }

    next();
  },
);

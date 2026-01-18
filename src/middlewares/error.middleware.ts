import { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { MulterError } from "multer";
import { ApiError } from "@/utils/ApiError";
import logger from "@/logger/winston.logger";
import { ApiResponse } from "@/utils/ApiResponse";
import { myEnvironment } from "@/configs/env";

export const notFoundHandler = (
  request: Request,
  _response: Response,
  next: NextFunction
): void => {
  const error = new ApiError(
    404,
    `Route not found : ${request.method} ${request.originalUrl}`
  );
  return next(error);
};

export const errorHandler = (
  err: any,
  req: Request,
  res: Response,
  _next: NextFunction
) => {
  let error = err;

  if (err instanceof ApiError) {
    error = err;
  } else if (err instanceof ZodError) {
    error = new ApiError(403, err.issues[0].message);
  } else if (err instanceof MulterError) {
    error = new ApiError(400, err.message);
  }  else if (err instanceof Error) {
    error = new ApiError(500, err.message);
  } else {
    error = new ApiError(500, "Unknown error occurred");
  }

  if (
    error.name === "TokenExpiredError" ||
    error.name === "JsonWebTokenError"
  ) {
    error = new ApiError(
      401,
      `Unauthorized | ${error.name === "TokenExpiredError" ? "Token expired" : "Invalid token"}`
    );
  }

  if (error instanceof ZodError) {
    error = new ApiError(403, error.issues[0].message);
  }

  if (error instanceof MulterError) {
    error = new ApiError(400, error.message);
  }


  logger.error(`[${error.statusCode}] ${error.message}`);

  const apiResponse = new ApiResponse<null>(
    error.statusCode,
    null,
    error.message
  );

  if (myEnvironment.NODE_ENV === "development" && error.stack) {
    (apiResponse as any).stack = error.stack;
  }

  return res.status(apiResponse.statusCode).json(apiResponse);
};

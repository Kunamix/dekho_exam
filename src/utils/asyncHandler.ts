import { Request, Response, NextFunction } from "express";

type AsyncHandler = (
  request: Request,
  response: Response,
  next: NextFunction
) => Promise<unknown>;

export const asyncHandler = (function_: AsyncHandler | any) => {
  return (request: Request, response: Response, next: NextFunction) => {
    try {
      const result = function_(request, response, next);
      if (request instanceof Promise) {
        result.catch(next);
      }
    } catch (error) {
      next(error);
    }
  };
};

import { ApiResponse } from "@/utils/ApiResponse";
import { asyncHandler } from "@/utils/asyncHandler";
import { Response, Request } from "express";


const healthcheck = asyncHandler(async (_req: Request, res: Response) => {
  return res
    .status(200)
    .json(new ApiResponse(200, "OK", "Health check passed"));
});

export default healthcheck;
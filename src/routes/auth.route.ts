import { getMe, login, logout, verifyOTP } from "@/controllers/auth.controller";
import { verifyToken } from "@/middlewares/auth.middleware";
import { Router } from "express";

const router = Router();

router.post("/auth/login", login);
router.post("/auth/verify-otp", verifyOTP);
router.post("/auth/logout", verifyToken, logout);
router.get("/auth/me", verifyToken, getMe);

export default router;

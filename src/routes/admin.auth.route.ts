import {
  admin,
  adminChangePassword,
  adminLogin,
  adminRefreshToken,
  adminVerifyOTP,
} from "@/controllers/admin.auth.controller";

import { verifyAdmin, verifyToken } from "@/middlewares/auth.middleware";
import express from "express";

const router = express.Router();

router.get("/admin-auth/me", verifyToken, verifyAdmin, admin);
router.post("/admin-auth/admin-login", adminLogin);
router.post("/admin-auth/admin-verify-otp", adminVerifyOTP);
router.post("/admin-auth/admin-logout", verifyToken, verifyAdmin, adminLogin);
router.post(
  "/admin-auth/admin-password-change",
  verifyToken,
  verifyAdmin,
  adminChangePassword,
);
router.post(
  "/admin-auth/admin-refresh-token",
  verifyToken,
  verifyAdmin,
  adminRefreshToken,
);

export default router;

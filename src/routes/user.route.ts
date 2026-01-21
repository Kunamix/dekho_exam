import {
  deleteUser,
  getAllUsers,
  getUserById,
  getUserStats,
  invalidateUserSessions,
  resetUserFreeTests,
  searchUsers,
  toggleUserBan,
  updateUser,
} from "@/controllers/user.controller";
import { verifyAdmin, verifyToken } from "@/middlewares/auth.middleware";
import { Router } from "express";

const router = Router();

router.get("/user/users", verifyToken, verifyAdmin, getAllUsers);
router.get("/user/users/stats", verifyToken, verifyAdmin, getUserStats);
router.get("/user/users/search", verifyToken, verifyAdmin, searchUsers);
router.get("/user/users/:id", verifyToken, verifyAdmin, getUserById);
router.put("/user/users/:id", verifyToken, verifyAdmin, updateUser);
router.post(
  "/user/users/:id/toggle-ban",
  verifyToken,
  verifyAdmin,
  toggleUserBan,
);
router.delete("/user/users/:id", verifyToken, verifyAdmin, deleteUser);
router.post(
  "/user/users/:id/reset-free-tests",
  verifyToken,
  verifyAdmin,
  resetUserFreeTests,
);
router.post(
  "/user/users/:id/invalidate-sessions",
  verifyToken,
  verifyAdmin,
  invalidateUserSessions,
);

export default router;

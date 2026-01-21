import { updatePassword, updateProfile, uploadAvatar } from "@/controllers/auth.controller";
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
import { upload } from "@/middlewares/multer.midlleware";
import { Router } from "express";

const router = Router();

router.get("/user/get-all-users", verifyToken, verifyAdmin, getAllUsers);
router.get("/user/users/stats", verifyToken, verifyAdmin, getUserStats);
router.get("/user/search", verifyToken, verifyAdmin, searchUsers);
router.get("/user/get-user-by-id/:id", verifyToken, verifyAdmin, getUserById);
router.put("/user/update-user/:id", verifyToken, verifyAdmin, updateUser);
router.post(
  "/user/:id/toggle-ban",
  verifyToken,
  verifyAdmin,
  toggleUserBan,
);
router.delete("/user/delete-user/:id", verifyToken, verifyAdmin, deleteUser);
router.post(
  "/user/:id/reset-free-tests",
  verifyToken,
  verifyAdmin,
  resetUserFreeTests,
);
router.post(
  "/user/:id/invalidate-sessions",
  verifyToken,
  verifyAdmin,
  invalidateUserSessions,
);

router.put("/user/update-profile",verifyToken,updateProfile);
router.put("/user/update-password",verifyToken,verifyAdmin,updatePassword);

export default router;

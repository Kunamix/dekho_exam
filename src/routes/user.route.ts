import { deleteUser, getAllUsers, getUserById, getUserStats, invalidateUserSessions, resetUserFreeTests, searchUsers, toggleUserBan, updateUser } from '@/controllers/user.controller';
import { verifyAdmin, verifyToken } from '@/middlewares/auth.middleware';
import {Router } from 'express'



const router = Router();

router.get("/users", verifyToken, verifyAdmin, getAllUsers);
router.get("/users/stats", verifyToken, verifyAdmin, getUserStats);
router.get("/users/search", verifyToken, verifyAdmin, searchUsers);
router.get("/users/:id", verifyToken, verifyAdmin, getUserById);
router.put("/users/:id", verifyToken, verifyAdmin, updateUser);
router.post("/users/:id/toggle-ban", verifyToken, verifyAdmin, toggleUserBan);
router.delete("/users/:id", verifyToken, verifyAdmin, deleteUser);
router.post("/users/:id/reset-free-tests", verifyToken, verifyAdmin, resetUserFreeTests);
router.post("/users/:id/invalidate-sessions", verifyToken, verifyAdmin, invalidateUserSessions);

export default router
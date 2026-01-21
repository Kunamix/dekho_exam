import { cloneTest, createTest, deleteTest, getAllTests, getTestById, getTestStats, updateTest } from '@/controllers/test.controller';
import { verifyAdmin, verifyToken } from '@/middlewares/auth.middleware';
import {Router } from 'express'



const router = Router();
router.post("/tests", verifyToken, verifyAdmin, createTest);
router.get("/tests", verifyToken, verifyAdmin, getAllTests);
router.get("/tests/stats", verifyToken, verifyAdmin, getTestStats);
router.get("/tests/:id", verifyToken, verifyAdmin, getTestById);
router.put("/tests/:id", verifyToken, verifyAdmin, updateTest);
router.delete("/tests/:id", verifyToken, verifyAdmin, deleteTest);
router.post("/tests/:id/clone", verifyToken, verifyAdmin, cloneTest);

export default router;
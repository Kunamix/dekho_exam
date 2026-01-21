import { cloneTest, createTest, deleteTest, getAllTests, getTestById, getTestStats, updateTest } from '@/controllers/test.controller';
import { verifyAdmin, verifyToken } from '@/middlewares/auth.middleware';
import {Router } from 'express'



const router = Router();
router.post("/test/tests", verifyToken, verifyAdmin, createTest);
router.get("/test/tests", verifyToken, verifyAdmin, getAllTests);
router.get("/test/tests/stats", verifyToken, verifyAdmin, getTestStats);
router.get("/test/tests/:id", verifyToken, verifyAdmin, getTestById);
router.put("/test/tests/:id", verifyToken, verifyAdmin, updateTest);
router.delete("/test/tests/:id", verifyToken, verifyAdmin, deleteTest);
router.post("/test/tests/:id/clone", verifyToken, verifyAdmin, cloneTest);

export default router;
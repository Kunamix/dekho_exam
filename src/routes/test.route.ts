import {
  cloneTest,
  createTest,
  deleteTest,
  getAllTests,
  getAttemptHistory,
  getPopularTests,
  getTestById,
  getTestStats,
  updateTest,
} from "@/controllers/test.controller";
import { verifyAdmin, verifyToken } from "@/middlewares/auth.middleware";
import { Router } from "express";

const router = Router();

// Only app
router.get("/test/get-test-by-category-id/:categoryId", verifyToken);
router.get("/test/get-popular-tests", verifyToken, getPopularTests);
router.get("test/attempt-history", verifyToken, getAttemptHistory);

// app or web
router.post("/test/create", verifyToken, verifyAdmin, createTest);
router.get("/test/get-all-tests", verifyToken, verifyAdmin, getAllTests);
router.get("/test/stats", verifyToken, verifyAdmin, getTestStats);
router.get("/test/get-test-by-id/:id", verifyToken, verifyAdmin, getTestById);
router.put("/test/update-test/:id", verifyToken, verifyAdmin, updateTest);
router.delete("/test/delete-test/:id", verifyToken, verifyAdmin, deleteTest);
router.post("/test/:id/clone", verifyToken, verifyAdmin, cloneTest);

export default router;

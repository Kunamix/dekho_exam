import {
  cloneTest,
  createTest,
  deleteTest,
  getAllTests,
  getAttemptHistory,
  getAttemptQuestions,
  getPopularTests,
  getTestById,
  getTestInstructions,
  getTestResult,
  getTestStats,
  saveAnswer,
  startTestAttempt,
  submitTest,
  updateTest,
} from "@/controllers/test.controller";
import { verifyAdmin, verifyToken } from "@/middlewares/auth.middleware";
import { Router } from "express";

const router = Router();

// Only app
router.get("/test/get-test-by-category-id/:categoryId", verifyToken);
router.get("/test/get-popular-tests", verifyToken, getPopularTests);
router.get("/test/attempt-history", verifyToken, getAttemptHistory);
router.get("/test/get-test-instruction/:testId",verifyToken,getTestInstructions);
router.post("/test/start-test-attempt/:testId",verifyToken,startTestAttempt);
router.get("/test/get-attempt-questions/:attemptId",verifyToken,getAttemptQuestions);
router.post("/test/save-answer/:attemptId",verifyToken,saveAnswer);
router.post("/test/submit-test/:attemptId",verifyToken,submitTest);
router.get("/test/get-test-result/:attemptId",verifyToken,getTestResult);


// app or web
router.post("/test/create", verifyToken, verifyAdmin, createTest);
router.get("/test/get-all-tests", verifyToken, verifyAdmin, getAllTests);
router.get("/test/stats", verifyToken, verifyAdmin, getTestStats);
router.get("/test/get-test-by-id/:id", verifyToken, verifyAdmin, getTestById);
router.put("/test/update-test/:id", verifyToken, verifyAdmin, updateTest);
router.delete("/test/delete-test/:id", verifyToken, verifyAdmin, deleteTest);
router.post("/test/:id/clone", verifyToken, verifyAdmin, cloneTest);

export default router;

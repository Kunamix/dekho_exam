import {
  bulkUploadQuestions,
  createQuestion,
  deleteQuestion,
  getAllQuestions,
  getQuestionById,
  getQuestionStats,
  updateQuestion,
} from "@/controllers/question.controller";
import { verifyAdmin, verifyToken } from "@/middlewares/auth.middleware";
import { upload } from "@/middlewares/multer.midlleware";
import { Router } from "express";

const router = Router();

router.post("/questions", verifyToken, verifyAdmin, createQuestion);
router.get("/questions", verifyToken, verifyAdmin, getAllQuestions);
router.get("/questions/stats", verifyToken, verifyAdmin, getQuestionStats);
router.get("/questions/:id", verifyToken, verifyAdmin, getQuestionById);
router.put("/questions/:id", verifyToken, verifyAdmin, updateQuestion);
router.delete("/questions/:id", verifyToken, verifyAdmin, deleteQuestion);
router.post(
  "/questions/bulk-upload",
  verifyToken,
  verifyAdmin,
  upload.single("file"), // Middleware to handle CSV upload
  bulkUploadQuestions,
);

export default router;

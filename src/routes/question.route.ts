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

router.post("/question/questions", verifyToken, verifyAdmin, createQuestion);
router.get("/question/questions", verifyToken, verifyAdmin, getAllQuestions);
router.get("/question/questions/stats", verifyToken, verifyAdmin, getQuestionStats);
router.get("/question/questions/:id", verifyToken, verifyAdmin, getQuestionById);
router.put("/question/questions/:id", verifyToken, verifyAdmin, updateQuestion);
router.delete("/question/questions/:id", verifyToken, verifyAdmin, deleteQuestion);
router.post(
  "/question/questions/bulk-upload",
  verifyToken,
  verifyAdmin,
  upload.single("file"), // Middleware to handle CSV upload
  bulkUploadQuestions,
);

export default router;

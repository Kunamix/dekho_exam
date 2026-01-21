import {
  createSubject,
  deleteSubject,
  getAllSubjects,
  getSubjectById,
  updateSubject,
} from "@/controllers/subject.controller";
import { verifyAdmin, verifyToken } from "@/middlewares/auth.middleware";
import { Router } from "express";

const router = Router();

router.post("/subjects", verifyToken, verifyAdmin, createSubject);
router.get("/subjects", verifyToken, verifyAdmin, getAllSubjects);
router.get("/subjects/:id", verifyToken, verifyAdmin, getSubjectById);
router.put("/subjects/:id", verifyToken, verifyAdmin, updateSubject);
router.delete("/subjects/:id", verifyToken, verifyAdmin, deleteSubject);

export default router;

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

router.post("/subject/subjects", verifyToken, verifyAdmin, createSubject);
router.get("/subject/subjects", verifyToken, verifyAdmin, getAllSubjects);
router.get("/subject/subjects/:id", verifyToken, verifyAdmin, getSubjectById);
router.put("/subject/subjects/:id", verifyToken, verifyAdmin, updateSubject);
router.delete("/subject/subjects/:id", verifyToken, verifyAdmin, deleteSubject);

export default router;

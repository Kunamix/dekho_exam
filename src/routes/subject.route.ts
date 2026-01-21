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

router.post("/subject/create", verifyToken, verifyAdmin, createSubject);
router.get("/subject/get-all-subjects", verifyToken, verifyAdmin, getAllSubjects);
router.get("/subject/subjects/:id", verifyToken, verifyAdmin, getSubjectById);
router.patch("/subject/update-subject/:id", verifyToken, verifyAdmin, updateSubject);
router.delete("/subject/delete-subject/:id", verifyToken, verifyAdmin, deleteSubject);

export default router;

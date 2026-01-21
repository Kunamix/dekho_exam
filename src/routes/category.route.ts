import {
  assignSubjectsToCategory,
  createCategory,
  deleteCategory,
  getAllCategories,
  getCategoryById,
  updateCategory,
} from "@/controllers/category.controller";
import { verifyAdmin, verifyToken } from "@/middlewares/auth.middleware";
import { Router } from "express";

const router = Router();

router.post("/categories", verifyToken, verifyAdmin, createCategory);
router.get("/categories", verifyToken, verifyAdmin, getAllCategories);
router.get("/categories/:id", verifyToken, verifyAdmin, getCategoryById);
router.put("/categories/:id", verifyToken, verifyAdmin, updateCategory);
router.delete("/categories/:id", verifyToken, verifyAdmin, deleteCategory);
router.post(
  "/categories/:id/assign-subjects",
  verifyToken,
  verifyAdmin,
  assignSubjectsToCategory,
);

export default router;

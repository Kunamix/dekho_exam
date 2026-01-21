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

router.post("category/categories", verifyToken, verifyAdmin, createCategory);
router.get("category/categories", verifyToken, verifyAdmin, getAllCategories);
router.get("category/categories/:id", verifyToken, verifyAdmin, getCategoryById);
router.put("category/categories/:id", verifyToken, verifyAdmin, updateCategory);
router.delete("category/categories/:id", verifyToken, verifyAdmin, deleteCategory);
router.post(
  "category/categories/:id/assign-subjects",
  verifyToken,
  verifyAdmin,
  assignSubjectsToCategory,
);

export default router;

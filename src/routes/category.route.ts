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

router.post("/category/create", verifyToken, verifyAdmin, createCategory);
router.get("/category/categories", verifyToken, getAllCategories);
router.get("/category/category-get-by-id/:id", verifyToken, getCategoryById);
router.patch("/category/update-category/:id", verifyToken, verifyAdmin, updateCategory);
router.delete("/category/delete-category/:id", verifyToken, verifyAdmin, deleteCategory);
router.post(
  "/category/assign-subject/:id/assign-subjects",
  verifyToken,
  verifyAdmin,
  assignSubjectsToCategory,
);

export default router;

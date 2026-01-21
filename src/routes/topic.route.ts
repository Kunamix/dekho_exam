import {
  createTopic,
  deleteTopic,
  getAllTopics,
  getTopicById,
  updateTopic,
} from "@/controllers/topic.controller";
import { verifyAdmin, verifyToken } from "@/middlewares/auth.middleware";
import { Router } from "express";

const router = Router();

router.post("/topics", verifyToken, verifyAdmin, createTopic);
router.get("/topics", verifyToken, verifyAdmin, getAllTopics);
router.get("/topics/:id", verifyToken, verifyAdmin, getTopicById);
router.put("/topics/:id", verifyToken, verifyAdmin, updateTopic);
router.delete("/topics/:id", verifyToken, verifyAdmin, deleteTopic);

export default router;

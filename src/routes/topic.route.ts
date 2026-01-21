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

router.post("/topic/topics", verifyToken, verifyAdmin, createTopic);
router.get("/topic/topics", verifyToken, verifyAdmin, getAllTopics);
router.get("/topic/topics/:id", verifyToken, verifyAdmin, getTopicById);
router.put("/topic/topics/:id", verifyToken, verifyAdmin, updateTopic);
router.delete("/topic/topics/:id", verifyToken, verifyAdmin, deleteTopic);

export default router;

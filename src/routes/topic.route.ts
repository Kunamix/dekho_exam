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

router.post("/topic/create", verifyToken, verifyAdmin, createTopic);
router.get("/topic/get-all-topics", verifyToken, getAllTopics);
router.get("/topic/get-topic-by-id/:id", verifyToken, verifyAdmin, getTopicById);
router.put("/topic/update-topic/:id", verifyToken, verifyAdmin, updateTopic);
router.delete("/topic/delete-topic/:id", verifyToken, verifyAdmin, deleteTopic);

export default router;

import healthcheck from "@/controllers/healthcheck.controller";
import express from "express";

const router = express.Router();

router.get("/", healthcheck);

export default router;

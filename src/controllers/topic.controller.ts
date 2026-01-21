import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { ApiResponse } from "../utils/ApiResponse";
import {prisma} from "@/database/db";

// Create Topic
export const createTopic = asyncHandler(
  async (req: Request, res: Response) => {
    const {
      subjectId,
      name,
      description,
      content,
      videoUrl,
      pdfUrl,
      displayOrder,
    } = req.body;

    if (!subjectId || !name) {
      throw new ApiError(400, "Subject ID and topic name are required");
    }

    const subject = await prisma.subject.findUnique({
      where: { id: subjectId },
    });

    if (!subject) {
      throw new ApiError(404, "Subject not found");
    }

    const topic = await prisma.topic.create({
      data: {
        subjectId,
        name,
        description,
        content,
        videoUrl,
        pdfUrl,
        displayOrder: displayOrder || 0,
      },
    });

    return res
      .status(201)
      .json(new ApiResponse(201, topic, "Topic created successfully"));
  }
);

// Get All Topics
export const getAllTopics = asyncHandler(
  async (req: Request, res: Response) => {
    const { page = 1, limit = 10, isActive, search, subjectId } = req.query;

    const skip = (Number(page) - 1) * Number(limit);

    const where: any = {};

    if (isActive !== undefined) {
      where.isActive = isActive === "true";
    }

    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: "insensitive" } },
        { description: { contains: search as string, mode: "insensitive" } },
      ];
    }

    if (subjectId) {
      where.subjectId = subjectId as string;
    }

    const [topics, total] = await Promise.all([
      prisma.topic.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: [{ displayOrder: "asc" }, { createdAt: "desc" }],
        include: {
          subject: {
            select: {
              id: true,
              name: true,
            },
          },
          _count: {
            select: {
              questions: true,
            },
          },
        },
      }),
      prisma.topic.count({ where }),
    ]);

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          topics,
          pagination: {
            total,
            page: Number(page),
            limit: Number(limit),
            totalPages: Math.ceil(total / Number(limit)),
          },
        },
        "Topics fetched successfully"
      )
    );
  }
);

// Get Single Topic
export const getTopicById = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const topic = await prisma.topic.findUnique({
      where: { id:id.toString() },
      include: {
        subject: {
          select: {
            id: true,
            name: true,
          },
        },
        questions: {
          where: { isActive: true },
          select: {
            id: true,
            questionText: true,
            difficultyLevel: true,
            isActive: true,
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!topic) {
      throw new ApiError(404, "Topic not found");
    }

    return res
      .status(200)
      .json(new ApiResponse(200, topic, "Topic fetched successfully"));
  }
);

// Update Topic
export const updateTopic = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const {
      name,
      description,
      content,
      videoUrl,
      pdfUrl,
      displayOrder,
      isActive,
    } = req.body;

    const topic = await prisma.topic.findUnique({
      where: { id:id.toString() },
    });

    if (!topic) {
      throw new ApiError(404, "Topic not found");
    }

    const updatedTopic = await prisma.topic.update({
      where: { id:id.toString() },
      data: {
        name,
        description,
        content,
        videoUrl,
        pdfUrl,
        displayOrder,
        isActive,
      },
    });

    return res
      .status(200)
      .json(new ApiResponse(200, updatedTopic, "Topic updated successfully"));
  }
);

// Delete Topic
export const deleteTopic = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const topic = await prisma.topic.findUnique({
      where: { id:id.toString() },
      include: {
        _count: {
          select: {
            questions: true,
          },
        },
      },
    });

    if (!topic) {
      throw new ApiError(404, "Topic not found");
    }

    if (topic._count.questions > 0) {
      throw new ApiError(
        400,
        "Cannot delete topic with associated questions. Please delete or reassign questions first."
      );
    }

    await prisma.topic.delete({
      where: { id:id.toString() },
    });

    return res
      .status(200)
      .json(new ApiResponse(200, {}, "Topic deleted successfully"));
  }
);
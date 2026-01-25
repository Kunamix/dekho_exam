import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { ApiResponse } from "../utils/ApiResponse";
import { prisma } from "@/database/db";
import csv from "csv-parser";
import { Readable } from "stream";

const MAX_IMAGE_SIZE_MB = 5;

const validateBase64Image = (base64?: string) => {
  if (!base64) return;

  const sizeInBytes =
    (base64.length * 3) / 4 -
    (base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0);

  const sizeInMB = sizeInBytes / (1024 * 1024);

  if (sizeInMB > MAX_IMAGE_SIZE_MB) {
    throw new ApiError(400, "Image size must be less than 5MB");
  }
};

// Create Question
export const createQuestion = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = (req as any).user?.userId;
    const {
      topicId,
      questionText,
      questionImageUrl,
      subjectId,
      option1,
      option2,
      option3,
      option4,
      correctOption,
      explanation,
      explanationImageUrl,
      difficultyLevel,
    } = req.body;

    if (
      !topicId ||
      !questionText ||
      !option1 ||
      !option2 ||
      !option3 ||
      !option4 ||
      !correctOption
    ) {
      throw new ApiError(400, "All required fields must be provided");
    }

    if (![1, 2, 3, 4].includes(Number(correctOption))) {
      throw new ApiError(400, "Correct option must be between 1 and 4");
    }

    validateBase64Image(questionImageUrl);
    validateBase64Image(explanationImageUrl);

    const topic = await prisma.topic.findUnique({
      where: { id: topicId },
    });

    if (!topic) {
      throw new ApiError(404, "Topic not found");
    }

    const question = await prisma.question.create({
      data: {
        topicId,
        questionText,
        questionImageUrl,
        option1,
        option2,
        option3,
        option4,
        correctOption: Number(correctOption),
        explanation,
        explanationImageUrl,
        difficultyLevel: difficultyLevel || "MEDIUM",
        createdById: userId,
      },
    });

    return res
      .status(201)
      .json(new ApiResponse(201, question, "Question created successfully"));
  },
);

// Get All Questions
export const getAllQuestions = asyncHandler(
  async (req: Request, res: Response) => {
    const {
      page = 1,
      limit = 10,
      isActive,
      search,
      topicId,
      subjectId,
      difficultyLevel,
    } = req.query;

    const skip = (Number(page) - 1) * Number(limit);

    const where: any = {};

    if (isActive !== undefined) {
      where.isActive = isActive === "true";
    }

    if (search) {
      where.questionText = {
        contains: search as string,
        mode: "insensitive",
      };
    }

    if (topicId) {
      where.topicId = topicId as string;
    }

    if (subjectId) {
      where.topic = {
        subjectId: subjectId as string,
      };
    }

    if (difficultyLevel) {
      where.difficultyLevel = difficultyLevel as string;
    }

    const [questions, total] = await Promise.all([
      prisma.question.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { createdAt: "desc" },
        include: {
          topic: {
            select: {
              id: true,
              name: true,
              subject: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
          createdBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      }),
      prisma.question.count({ where }),
    ]);

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          questions,
          pagination: {
            total,
            page: Number(page),
            limit: Number(limit),
            totalPages: Math.ceil(total / Number(limit)),
          },
        },
        "Questions fetched successfully",
      ),
    );
  },
);

// Get Single Question
export const getQuestionById = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const question = await prisma.question.findUnique({
      where: { id: id.toString() },
      include: {
        topic: {
          include: {
            subject: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (!question) {
      throw new ApiError(404, "Question not found");
    }

    return res
      .status(200)
      .json(new ApiResponse(200, question, "Question fetched successfully"));
  },
);

// Update Question
export const updateQuestion = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const {
      questionText,
      questionImageUrl,
      option1,
      option2,
      option3,
      option4,
      correctOption,
      explanation,
      explanationImageUrl,
      difficultyLevel,
      isActive,
    } = req.body;

    const question = await prisma.question.findUnique({
      where: { id: id.toString() },
    });

    if (!question) {
      throw new ApiError(404, "Question not found");
    }

    if (correctOption && ![1, 2, 3, 4].includes(Number(correctOption))) {
      throw new ApiError(400, "Correct option must be between 1 and 4");
    }

    const updatedQuestion = await prisma.question.update({
      where: { id: id.toString() },
      data: {
        questionText,
        questionImageUrl,
        option1,
        option2,
        option3,
        option4,
        correctOption: correctOption ? Number(correctOption) : undefined,
        explanation,
        explanationImageUrl,
        difficultyLevel,
        isActive,
      },
    });

    return res
      .status(200)
      .json(
        new ApiResponse(200, updatedQuestion, "Question updated successfully"),
      );
  },
);

// Delete Question
export const deleteQuestion = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const question = await prisma.question.findUnique({
      where: { id: id.toString() },
      include: {
        _count: {
          select: {
            answer: true,
          },
        },
      },
    });

    if (!question) {
      throw new ApiError(404, "Question not found");
    }

    if (question._count.answer > 0) {
      // Soft delete if question has been attempted
      await prisma.question.update({
        where: { id: id.toString() },
        data: { isActive: false },
      });

      return res
        .status(200)
        .json(
          new ApiResponse(
            200,
            {},
            "Question has been deactivated (soft deleted) as it has associated attempts",
          ),
        );
    }

    // Hard delete if no attempts
    await prisma.question.delete({
      where: { id: id.toString() },
    });

    return res
      .status(200)
      .json(new ApiResponse(200, {}, "Question deleted successfully"));
  },
);

// Convert A/B/C/D or 1/2/3/4 → number
const mapCorrectAnswer = (value: string) => {
  if (!value) return null;

  const v = value.toString().trim().toLowerCase();
  if (v === "a") return 1;
  if (v === "b") return 2;
  if (v === "c") return 3;
  if (v === "d") return 4;

  const num = Number(v);
  return [1, 2, 3, 4].includes(num) ? num : null;
};

export const bulkUploadQuestions = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = (req as any).user?.userId;
    const file = (req as any).file;
    const { topicId } = req.body;

    // 1️⃣ Basic validations
    if (!file) {
      throw new ApiError(400, "CSV file is required");
    }

    if (!topicId) {
      throw new ApiError(400, "Topic ID is required");
    }

    // 2️⃣ Validate topic once
    const topicExists = await prisma.topic.findUnique({
      where: { id: topicId },
    });

    if (!topicExists) {
      throw new ApiError(400, "Topic not found");
    }

    // 3️⃣ Parse CSV
    const results: any[] = [];
    const errors: any[] = [];

    await new Promise((resolve, reject) => {
      Readable.from(file.buffer)
        .pipe(csv())
        .on("data", (row) => results.push(row))
        .on("end", resolve)
        .on("error", reject);
    });

    if (results.length === 0) {
      throw new ApiError(400, "CSV file is empty");
    }

    // 4️⃣ Process rows
    const questionsToCreate: any[] = [];

    for (let i = 0; i < results.length; i++) {
      const row = results[i];
      const rowNum = i + 2; // header + index

      const questionText = row["Question"]?.trim();
      const option1 = row["Option A"]?.trim();
      const option2 = row["Option B"]?.trim();
      const option3 = row["Option C"]?.trim();
      const option4 = row["Option D"]?.trim();
      const explanation = row["Explanation"]?.trim() || null;
      const correctOption = mapCorrectAnswer(row["Correct Answer"]);

      if (
        !questionText ||
        !option1 ||
        !option2 ||
        !option3 ||
        !option4 ||
        !correctOption
      ) {
        errors.push({
          row: rowNum,
          error: "Missing or invalid required fields",
        });
        continue;
      }

      questionsToCreate.push({
        topicId,
        questionText,
        option1,
        option2,
        option3,
        option4,
        correctOption,
        explanation, // ✅ explanation supported
        difficultyLevel: "MEDIUM",
        questionImageUrl: null,
        explanationImageUrl: null,
        isActive: true,
        createdById: userId,
      });
    }

    // 5️⃣ Bulk insert
    const created = await prisma.question.createMany({
      data: questionsToCreate,
      skipDuplicates: true,
    });

    // 6️⃣ Response
    return res.status(200).json(
      new ApiResponse(
        200,
        {
          totalRows: results.length,
          successfullyCreated: created.count,
          failedRows: errors.length,
          errors: errors.length ? errors : undefined,
        },
        `Bulk upload completed. ${created.count} questions created, ${errors.length} failed.`
      )
    );
  }
);


// Get Question Statistics
export const getQuestionStats = asyncHandler(
  async (req: Request, res: Response) => {
    const { topicId, subjectId } = req.query;

    const where: any = {};

    if (topicId) {
      where.topicId = topicId as string;
    }

    if (subjectId) {
      where.topic = {
        subjectId: subjectId as string,
      };
    }

    const [total, activeCount, byDifficulty] = await Promise.all([
      prisma.question.count({ where }),
      prisma.question.count({ where: { ...where, isActive: true } }),
      prisma.question.groupBy({
        by: ["difficultyLevel"],
        where,
        _count: true,
      }),
    ]);

    const stats = {
      total,
      active: activeCount,
      inactive: total - activeCount,
      byDifficulty: byDifficulty.reduce((acc, curr) => {
        acc[curr.difficultyLevel] = curr._count;
        return acc;
      }, {} as any),
    };

    return res
      .status(200)
      .json(
        new ApiResponse(200, stats, "Question statistics fetched successfully"),
      );
  },
);

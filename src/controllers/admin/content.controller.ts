import { prisma } from "@/database/db";
import { ApiResponse } from "@/utils/ApiResponse";
import { asyncHandler } from "@/utils/asyncHandler";
import { Request, Response } from "express";

export const getCategoriesList = asyncHandler(async (_req: Request, res: Response) => {
  const categories = await prisma.category.findMany({
    orderBy: { displayOrder: 'asc' },
    include: {
      _count: {
        select: {
          categorySubjects: true, // subjectsCount
          tests: true,            // testsCount
        }
      }
    }
  });

  const formatted = categories.map(c => ({
    id: c.id,
    name: c.name,
    description: c.description,
    image: c.imageUrl,
    subjectsCount: c._count.categorySubjects,
    testsCount: c._count.tests,
    isActive: c.isActive,
    displayOrder: c.displayOrder
  }));

  return res.status(200).json(new ApiResponse(200, formatted, "Categories fetched"));
});

export const getSubjectsList = asyncHandler(async (_req: Request, res: Response) => {
  const subjects = await prisma.subject.findMany({
    include: {
      _count: {
        select: { categorySubjects: true } // categoriesUsed
      },
      topics: {
        include: {
          _count: {
            select: { questions: true }
          }
        }
      }
    }
  });

  const formatted = subjects.map(s => {
    // Calculate total questions across all topics in this subject
    const totalQuestions = s.topics.reduce((acc, topic) => acc + topic._count.questions, 0);

    return {
      id: s.id,
      name: s.name,
      description: s.description,
      image: s.imageUrl,
      categoriesUsed: s._count.categorySubjects,
      totalQuestions: totalQuestions,
      isActive: s.isActive
    };
  });

  return res.status(200).json(new ApiResponse(200, formatted, "Subjects fetched"));
});

export const getQuestionsList = asyncHandler(async (req: Request, res: Response) => {
  const { page = 1, limit = 50 } = req.query;
  const skip = (Number(page) - 1) * Number(limit);

  const questions = await prisma.question.findMany({
    skip,
    take: Number(limit),
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      topicId: true,
      questionText: true,
      option1: true,
      option2: true,
      option3: true,
      option4: true,
      correctOption: true,
      difficultyLevel: true,
      explanation: true,
      isActive: true,
      createdAt: true,
      topic: {
        select: { subjectId: true }
      }
    }
  });

  const formatted = questions.map(q => ({
    id: q.id,
    subjectId: q.topic.subjectId,
    topicId: q.topicId,
    text: q.questionText,
    options: [q.option1, q.option2, q.option3, q.option4],
    correctOption: q.correctOption - 1, // Frontend expects 0-index usually, DB has 1-4
    difficulty: q.difficultyLevel, // 'EASY', 'MEDIUM', 'HARD'
    explanation: q.explanation,
    isActive: q.isActive,
    createdAt: q.createdAt
  }));

  return res.status(200).json(new ApiResponse(200, formatted, "Questions fetched"));
});

export const getTestsList = asyncHandler(async (_req: Request, res: Response) => {
  const tests = await prisma.test.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      category: { select: { name: true } }
    }
  });

  const formatted = tests.map(t => ({
    id: t.id,
    name: t.name,
    categoryId: t.categoryId,
    categoryName: t.category.name,
    description: t.description,
    duration: t.durationMinutes,
    totalQuestions: t.totalQuestions,
    positiveMarks: Number(t.positiveMarks),
    negativeMarks: Number(t.negativeMarks),
    type: t.isPaid ? 'Paid' : 'Free',
    testNumber: t.testNumber,
    isActive: t.isActive
  }));

  return res.status(200).json(new ApiResponse(200, formatted, "Tests fetched"));
});
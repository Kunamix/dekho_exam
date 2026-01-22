import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { ApiResponse } from "../utils/ApiResponse";
import { prisma } from "@/database/db";

// Create Subject
export const createSubject = asyncHandler(
  async (req: Request, res: Response) => {
    const { name, description, imageUrl, displayOrder } = req.body;

    if (!name) {
      throw new ApiError(400, "Subject name is required");
    }

    // Check if subject with same name already exists
    const existingSubject = await prisma.subject.findFirst({
      where: {
        name: {
          equals: name,
          mode: "insensitive",
        },
      },
    });

    if (existingSubject) {
      throw new ApiError(400, "Subject with this name already exists");
    }

    const subject = await prisma.subject.create({
      data: {
        name,
        description,
        imageUrl,
        displayOrder: displayOrder || 0,
      },
      include: {
        _count: {
          select: {
            topics: true,
            categorySubjects: true,
            tests: true,
          },
        },
      },
    });

    return res
      .status(201)
      .json(new ApiResponse(201, subject, "Subject created successfully"));
  }
);

// Get All Subjects with Categories and Question Count
export const getAllSubjects = asyncHandler(
  async (req: Request, res: Response) => {
    const { page = 1, limit = 10, isActive, search, categoryId } = req.query;

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

    if (categoryId) {
      where.categorySubjects = {
        some: {
          categoryId: categoryId as string,
        },
      };
    }

    const [subjects, total] = await Promise.all([
      prisma.subject.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: [{ displayOrder: "asc" }, { createdAt: "desc" }],
        include: {
          categorySubjects: {
            include: {
              category: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
          topics: {
            where: { isActive: true },
            include: {
              _count: {
                select: {
                  questions: true,
                },
              },
            },
          },
          _count: {
            select: {
              tests: true,
            },
          },
        },
      }),
      prisma.subject.count({ where }),
    ]);

    // Transform data to include total questions and categories
    const transformedSubjects = subjects.map((subject) => {
      const totalQuestions = subject.topics.reduce(
        (sum, topic) => sum + topic._count.questions,
        0
      );

      const categories = subject.categorySubjects.map((cs) => ({
        id: cs.category.id,
        name: cs.category.name,
      }));

      return {
        id: subject.id,
        name: subject.name,
        description: subject.description,
        imageUrl: subject.imageUrl,
        displayOrder: subject.displayOrder,
        isActive: subject.isActive,
        createdAt: subject.createdAt,
        updatedAt: subject.updatedAt,
        categories,
        totalTopics: subject.topics.length,
        totalQuestions,
        totalTests: subject._count.tests,
      };
    });

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          subjects: transformedSubjects,
          pagination: {
            total,
            page: Number(page),
            limit: Number(limit),
            totalPages: Math.ceil(total / Number(limit)),
          },
        },
        "Subjects fetched successfully"
      )
    );
  }
);

// Get Single Subject with Full Details
export const getSubjectById = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const subject = await prisma.subject.findUnique({
      where: { id: id.toString() },
      include: {
        topics: {
          where: { isActive: true },
          orderBy: { displayOrder: "asc" },
          include: {
            _count: {
              select: {
                questions: true,
              },
            },
          },
        },
        categorySubjects: {
          include: {
            category: {
              select: {
                id: true,
                name: true,
                description: true,
              },
            },
          },
        },
        _count: {
          select: {
            tests: true,
          },
        },
      },
    });

    if (!subject) {
      throw new ApiError(404, "Subject not found");
    }

    // Calculate total questions
    const totalQuestions = subject.topics.reduce(
      (sum, topic) => sum + topic._count.questions,
      0
    );

    // Transform category data
    const categories = subject.categorySubjects.map((cs) => cs.category);

    const transformedSubject = {
      ...subject,
      categories,
      totalQuestions,
      totalTopics: subject.topics.length,
      totalTests: subject._count.tests,
    };

    return res
      .status(200)
      .json(
        new ApiResponse(200, transformedSubject, "Subject fetched successfully")
      );
  }
);

// Update Subject
export const updateSubject = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { name, description, imageUrl, displayOrder, isActive } = req.body;

    const subject = await prisma.subject.findUnique({
      where: { id: id.toString() },
    });

    if (!subject) {
      throw new ApiError(404, "Subject not found");
    }

    // Check if name is being changed and if new name already exists
    if (name && name !== subject.name) {
      const existingSubject = await prisma.subject.findFirst({
        where: {
          name: {
            equals: name,
            mode: "insensitive",
          },
          id: {
            not: id.toString(),
          },
        },
      });

      if (existingSubject) {
        throw new ApiError(400, "Subject with this name already exists");
      }
    }

    const updatedSubject = await prisma.subject.update({
      where: { id: id.toString() },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(imageUrl !== undefined && { imageUrl }),
        ...(displayOrder !== undefined && { displayOrder }),
        ...(isActive !== undefined && { isActive }),
      },
      include: {
        categorySubjects: {
          include: {
            category: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        _count: {
          select: {
            topics: true,
            tests: true,
          },
        },
      },
    });

    // Get total questions count
    const topics = await prisma.topic.findMany({
      where: {
        subjectId: id.toString(),
        isActive: true,
      },
      include: {
        _count: {
          select: {
            questions: true,
          },
        },
      },
    });

    const totalQuestions = topics.reduce(
      (sum, topic) => sum + topic._count.questions,
      0
    );

    const categories = updatedSubject.categorySubjects.map((cs) => cs.category);

    const transformedSubject = {
      ...updatedSubject,
      categories,
      totalQuestions,
      totalTopics: updatedSubject._count.topics,
      totalTests: updatedSubject._count.tests,
    };

    return res
      .status(200)
      .json(
        new ApiResponse(200, transformedSubject, "Subject updated successfully")
      );
  }
);

// Delete Subject
export const deleteSubject = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const subject = await prisma.subject.findUnique({
      where: { id: id.toString() },
      include: {
        _count: {
          select: {
            topics: true,
            categorySubjects: true,
            tests: true,
          },
        },
      },
    });

    if (!subject) {
      throw new ApiError(404, "Subject not found");
    }

    // Check for dependencies
    if (
      subject._count.topics > 0 ||
      subject._count.categorySubjects > 0 ||
      subject._count.tests > 0
    ) {
      throw new ApiError(
        400,
        `Cannot delete subject. It has ${subject._count.topics} topic(s), ${subject._count.categorySubjects} category association(s), and ${subject._count.tests} test(s)`
      );
    }

    await prisma.subject.delete({
      where: { id: id.toString() },
    });

    return res
      .status(200)
      .json(new ApiResponse(200, {}, "Subject deleted successfully"));
  }
);

// Toggle Subject Active Status
export const toggleSubjectStatus = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const subject = await prisma.subject.findUnique({
      where: { id: id.toString() },
    });

    if (!subject) {
      throw new ApiError(404, "Subject not found");
    }

    const updatedSubject = await prisma.subject.update({
      where: { id: id.toString() },
      data: {
        isActive: !subject.isActive,
      },
    });

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          updatedSubject,
          `Subject ${updatedSubject.isActive ? "activated" : "deactivated"} successfully`
        )
      );
  }
);

// Get Subject Statistics
export const getSubjectStats = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const subject = await prisma.subject.findUnique({
      where: { id: id.toString() },
      include: {
        topics: {
          include: {
            _count: {
              select: {
                questions: true,
              },
            },
            questions: {
              select: {
                difficultyLevel: true,
              },
            },
          },
        },
        categorySubjects: {
          include: {
            category: true,
          },
        },
        _count: {
          select: {
            tests: true,
          },
        },
      },
    });

    if (!subject) {
      throw new ApiError(404, "Subject not found");
    }

    // Calculate statistics
    const totalTopics = subject.topics.length;
    const activeTopics = subject.topics.filter((t) => t.isActive).length;
    
    let totalQuestions = 0;
    let easyQuestions = 0;
    let mediumQuestions = 0;
    let hardQuestions = 0;

    subject.topics.forEach((topic) => {
      topic.questions.forEach((question) => {
        totalQuestions++;
        if (question.difficultyLevel === "EASY") easyQuestions++;
        if (question.difficultyLevel === "MEDIUM") mediumQuestions++;
        if (question.difficultyLevel === "HARD") hardQuestions++;
      });
    });

    const stats = {
      subjectInfo: {
        id: subject.id,
        name: subject.name,
        description: subject.description,
        isActive: subject.isActive,
      },
      topicStats: {
        total: totalTopics,
        active: activeTopics,
        inactive: totalTopics - activeTopics,
      },
      questionStats: {
        total: totalQuestions,
        easy: easyQuestions,
        medium: mediumQuestions,
        hard: hardQuestions,
      },
      categories: subject.categorySubjects.map((cs) => ({
        id: cs.category.id,
        name: cs.category.name,
      })),
      totalTests: subject._count.tests,
    };

    return res
      .status(200)
      .json(
        new ApiResponse(200, stats, "Subject statistics fetched successfully")
      );
  }
);
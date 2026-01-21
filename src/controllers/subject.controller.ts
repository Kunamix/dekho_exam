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

    const subject = await prisma.subject.create({
      data: {
        name,
        description,
        imageUrl,
        displayOrder: displayOrder || 0,
      },
    });

    return res
      .status(201)
      .json(new ApiResponse(201, subject, "Subject created successfully"));
  },
);

// Get All Subjects
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
          _count: {
            select: {
              topics: true,
              categorySubjects: true,
              tests: true,
            },
          },
        },
      }),
      prisma.subject.count({ where }),
    ]);

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          subjects,
          pagination: {
            total,
            page: Number(page),
            limit: Number(limit),
            totalPages: Math.ceil(total / Number(limit)),
          },
        },
        "Subjects fetched successfully",
      ),
    );
  },
);

// Get Single Subject
export const getSubjectById = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const subject = await prisma.subject.findUnique({
      where: { id:id.toString() },
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

    return res
      .status(200)
      .json(new ApiResponse(200, subject, "Subject fetched successfully"));
  },
);

// Update Subject
export const updateSubject = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { name, description, imageUrl, displayOrder, isActive } = req.body;

    const subject = await prisma.subject.findUnique({
      where: { id:id.toString() },
    });

    if (!subject) {
      throw new ApiError(404, "Subject not found");
    }

    const updatedSubject = await prisma.subject.update({
      where: { id:id.toString() },
      data: {
        name,
        description,
        imageUrl,
        displayOrder,
        isActive,
      },
    });

    return res
      .status(200)
      .json(
        new ApiResponse(200, updatedSubject, "Subject updated successfully"),
      );
  },
);

// Delete Subject
export const deleteSubject = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const subject = await prisma.subject.findUnique({
      where: { id:id.toString() },
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

    if (
      subject._count.topics > 0 ||
      subject._count.categorySubjects > 0 ||
      subject._count.tests > 0
    ) {
      throw new ApiError(
        400,
        "Cannot delete subject with associated topics, categories, or tests",
      );
    }

    await prisma.subject.delete({
      where: { id:id.toString() },
    });

    return res
      .status(200)
      .json(new ApiResponse(200, {}, "Subject deleted successfully"));
  },
);

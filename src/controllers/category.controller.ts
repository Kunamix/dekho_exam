import { prisma } from "@/database/db";
import { ApiError } from "@/utils/ApiError";
import { ApiResponse } from "@/utils/ApiResponse";
import { asyncHandler } from "@/utils/asyncHandler";
import { Request, Response } from "express";

// Create Category
export const createCategory = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = (req as any).user?.id;
    const { name, description, imageUrl, displayOrder } = req.body;

    if (!name) {
      throw new ApiError(400, "Category name is required");
    }

    const existingCategory = await prisma.category.findUnique({
      where: { name },
    });

    if (existingCategory) {
      throw new ApiError(409, "Category with this name already exists");
    }

    const category = await prisma.category.create({
      data: {
        name,
        description,
        imageUrl,
        displayOrder: displayOrder || 0,
        createdById: userId,
      },
    });

    return res
      .status(201)
      .json(new ApiResponse(201, category, "Category created successfully"));
  }
);

// Get All Categories
export const getAllCategories = asyncHandler(
  async (req: Request, res: Response) => {
    const { page = 1, limit = 10, isActive, search } = req.query;

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

    const [categories, total] = await Promise.all([
      prisma.category.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: [{ displayOrder: "asc" }, { createdAt: "desc" }],
        include: {
          categorySubjects: {
            include: {
              subject: true,
            },
          },
          _count: {
            select: {
              tests: true,
              subscriptionPlans: true,
            },
          },
        },
      }),
      prisma.category.count({ where }),
    ]);

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          categories,
          pagination: {
            total,
            page: Number(page),
            limit: Number(limit),
            totalPages: Math.ceil(total / Number(limit)),
          },
        },
        "Categories fetched successfully"
      )
    );
  }
);

// Get Single Category
export const getCategoryById = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const category = await prisma.category.findUnique({
      where: { id:id.toString() },
      include: {
        categorySubjects: {
          include: {
            subject: {
              include: {
                topics: {
                  where: { isActive: true },
                  select: { id: true, name: true },
                },
              },
            },
          },
          orderBy: { displayOrder: "asc" },
        },
        tests: {
          where: { isActive: true },
          select: {
            id: true,
            name: true,
            testNumber: true,
            isPaid: true,
          },
          orderBy: { testNumber: "asc" },
        },
        subscriptionPlans: {
          where: { isActive: true },
          select: {
            id: true,
            name: true,
            price: true,
            durationDays: true,
          },
        },
      },
    });

    if (!category) {
      throw new ApiError(404, "Category not found");
    }

    return res
      .status(200)
      .json(new ApiResponse(200, category, "Category fetched successfully"));
  }
);

// Update Category
export const updateCategory = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { name, description, imageUrl, displayOrder, isActive } = req.body;

    const category = await prisma.category.findUnique({
      where: { id:id.toString() },
    });

    if (!category) {
      throw new ApiError(404, "Category not found");
    }

    if (name && name !== category.name) {
      const existingCategory = await prisma.category.findUnique({
        where: { name },
      });

      if (existingCategory) {
        throw new ApiError(409, "Category with this name already exists");
      }
    }

    const updatedCategory = await prisma.category.update({
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
        new ApiResponse(200, updatedCategory, "Category updated successfully")
      );
  }
);

// Delete Category
export const deleteCategory = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const category = await prisma.category.findUnique({
      where: { id:id.toString() },
      include: {
        _count: {
          select: {
            tests: true,
            categorySubjects: true,
          },
        },
      },
    });

    if (!category) {
      throw new ApiError(404, "Category not found");
    }

    if (category._count.tests > 0 || category._count.categorySubjects > 0) {
      throw new ApiError(
        400,
        "Cannot delete category with associated tests or subjects"
      );
    }

    await prisma.category.delete({
      where: { id:id.toString() },
    });

    return res
      .status(200)
      .json(new ApiResponse(200, {}, "Category deleted successfully"));
  }
);

// Assign Subjects to Category
export const assignSubjectsToCategory = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { subjects } = req.body; // Array of { subjectId, questionsPerTest, displayOrder }

    if (!Array.isArray(subjects) || subjects.length === 0) {
      throw new ApiError(400, "Subjects array is required");
    }

    const category = await prisma.category.findUnique({
      where: { id:id.toString() },
    });

    if (!category) {
      throw new ApiError(404, "Category not found");
    }

    // Delete existing assignments
    await prisma.categorySubject.deleteMany({
      where: { categoryId: id.toString() },
    });

    // Create new assignments
    const categorySubjects = await prisma.categorySubject.createMany({
      data: subjects.map((subject: any) => ({
        categoryId: id.toString(),
        subjectId: subject.subjectId,
        questionsPerTest: subject.questionsPerTest,
        displayOrder: subject.displayOrder || 0,
      })),
    });

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          categorySubjects,
          "Subjects assigned to category successfully"
        )
      );
  }
);
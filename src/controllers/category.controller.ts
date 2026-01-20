import { prisma } from "@/database/db";
import { ApiError } from "@/utils/ApiError";
import { ApiResponse } from "@/utils/ApiResponse";
import { asyncHandler } from "@/utils/asyncHandler";
import { Request, Response } from "express";

export const getAllCategories = asyncHandler(async (_req: Request, res: Response) => {
  // Fetch categories
  const categories = await prisma.category.findMany({
    where: {
      isActive: true, // Only show active categories to students
    },
    orderBy: {
      displayOrder: "asc", // Sort by admin-defined order
    },
    select: {
      id: true,
      name: true,
      description: true,
      imageUrl: true,
      // Get counts for UI badges (e.g., "10 Tests inside")
      _count: {
        select: {
          categorySubjects: true, // Number of subjects
          tests: {
            where: { isActive: true } // Only count active tests
          }, 
        },
      },
    },
  });

  // Optional: Flatten the _count object for cleaner JSON on frontend
  const formattedCategories = categories.map((cat) => ({
    id: cat.id,
    name: cat.name,
    description: cat.description,
    imageUrl: cat.imageUrl,
    subjectsCount: cat._count.categorySubjects,
    testsCount: cat._count.tests,
  }));

  return res
    .status(200)
    .json(
      new ApiResponse(200, formattedCategories, "Categories fetched successfully")
    );
});

export const getCategoryById = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  if (!id) {
    throw new ApiError(400, "Category ID is required");
  }

  // Fetch Category + Linked Subjects
  const category = await prisma.category.findFirst({
    where: {
      id: id.toString(),
      isActive: true, // Ensure we don't show inactive categories
    },
    include: {
      // Get the subjects linked to this category
      categorySubjects: {
        include: {
          subject: true, // Fetch the actual Subject details
        },
        orderBy: {
          displayOrder: "asc", // Order subjects as defined by admin
        },
      },
    },
  });

  if (!category) {
    throw new ApiError(404, "Category not found");
  }

  // Data Transformation: Flatten the structure for the frontend
  // Instead of category.categorySubjects[0].subject.name
  // We make it category.subjects[0].name
  const formattedData = {
    id: category.id,
    name: category.name,
    description: category.description,
    imageUrl: category.imageUrl,
    subjects: category.categorySubjects.map((cs) => ({
      id: cs.subject.id,
      name: cs.subject.name,
      description: cs.subject.description,
      imageUrl: cs.subject.imageUrl,
      questionsPerTest: cs.questionsPerTest, // Specific to this category
      displayOrder: cs.displayOrder,
    })),
  };

  return res
    .status(200)
    .json(new ApiResponse(200, formattedData, "Category details fetched successfully"));
});
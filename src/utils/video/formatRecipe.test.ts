import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  formatRecipeMessage,
  splitMessage,
  formatRecipeWithChunking,
} from "./formatRecipe";
import type { CookingRecipe } from "@/types/video";

// Mock the escapeMarkdown function
vi.mock("@/utils/telegram/escapeMarkdown", () => ({
  escapeMarkdown: vi.fn((text) => text), // Return text as-is for testing
}));

// Mock the logger
vi.mock("@/utils/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe("formatRecipeMessage", () => {
  const mockRecipe: CookingRecipe = {
    title: "Test Recipe",
    servings: 4,
    prepTime: "15 minutes",
    cookTime: "30 minutes",
    totalTime: "45 minutes",
    difficulty: "easy",
    ingredients: [
      { item: "flour", amount: "2 cups" },
      { item: "sugar", amount: "1 cup", preparation: "sifted" },
    ],
    equipment: ["mixing bowl", "whisk"],
    instructions: [
      { step: 1, description: "Mix ingredients", duration: "5 minutes" },
      { step: 2, description: "Stir well", tips: "Don't overmix" },
    ],
    techniques: ["whisking", "folding"],
    tips: ["Serve warm"],
    notes: "Best served with coffee",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should format complete recipe correctly", () => {
    const result = formatRecipeMessage(mockRecipe);

    expect(result).toBeDefined();
    expect(result).toContain("🍳 *Test Recipe*");
    expect(result).toContain("👥 4 servings");
    expect(result).toContain("📝 *Ingredients:*");
    expect(result).toContain("• 2 cups flour");
    expect(result).toContain("• 1 cup sugar (sifted)");
    expect(result).toContain("🔧 *Equipment:*");
    expect(result).toContain("📖 *Instructions:*");
    expect(result).toContain("*Step 1* [5 minutes]");
    expect(result).toContain("*Step 2*");
    expect(result).toContain("🎯 *Techniques Used:*");
    expect(result).toContain("💡 *Tips & Tricks:*");
    expect(result).toContain("📌 *Notes:*");
  });

  it("should handle recipe with minimal fields", () => {
    const minimalRecipe: CookingRecipe = {
      title: "Simple Salad",
      ingredients: [{ item: "lettuce", amount: "3 cups" }],
      equipment: [],
      instructions: [],
    };

    const result = formatRecipeMessage(minimalRecipe);

    expect(result).toContain("🍳 *Simple Salad*");
    expect(result).toContain("📝 *Ingredients:*");
    expect(result).toContain("• 3 cups lettuce");
    expect(result).not.toContain("Equipment");
    expect(result).not.toContain("Instructions");
  });

  it("should handle empty recipe", () => {
    const result = formatRecipeMessage({} as CookingRecipe);

    expect(result).toContain("❌ Unable to format recipe: Invalid recipe data");
  });

  it("should handle recipe with empty fields", () => {
    const partialRecipe: CookingRecipe = {
      title: "Partial Recipe",
      ingredients: [],
      equipment: [],
      instructions: [],
    };

    const result = formatRecipeMessage(partialRecipe);

    expect(result).toContain("🍳 *Partial Recipe*");
    expect(result).not.toContain("📝 *Ingredients:*");
  });

  it("should format long instructions correctly", () => {
    const longRecipe: CookingRecipe = {
      title: "Complex Recipe",
      ingredients: [{ item: "ingredient", amount: "1" }],
      equipment: [],
      instructions: Array.from({ length: 10 }, (_, i) => ({
        step: i + 1,
        description: `Step ${i + 1} description that is quite long and contains multiple sentences to test formatting.`,
      })),
    };

    const result = formatRecipeMessage(longRecipe);

    for (let i = 1; i <= 10; i++) {
      expect(result).toContain(`*Step ${i}*`);
    }
  });
});

describe("splitMessage", () => {
  it("should not split short messages", () => {
    const shortMessage = "Short message";
    const result = splitMessage(shortMessage, 100);

    expect(result).toEqual([shortMessage]);
  });

  it("should split long messages at appropriate boundaries", () => {
    const longMessage = "Section 1\n\nSome content\n\nSection 2\n\nMore content";
    const result = splitMessage(longMessage, 20);

    expect(result.length).toBeGreaterThan(1);
    expect(result[0]).toContain("Section 1");
  });

  it("should handle very long sections by splitting them", () => {
    const messageWithLongSection =
      "Short\n\n" + "Very long section without breaks ".repeat(50) + "\n\nShort";
    const result = splitMessage(messageWithLongSection, 100);

    expect(result.length).toBeGreaterThan(1);
    result.forEach((chunk) => {
      expect(chunk.length).toBeLessThanOrEqual(200); // With ellipsis buffer
    });
  });
});

describe("formatRecipeWithChunking", () => {
  const mockRecipe: CookingRecipe = {
    title: "Chunked Recipe",
    ingredients: [{ item: "rice", amount: "2 lbs" }],
    equipment: [],
    instructions: Array.from({ length: 50 }, (_, i) => ({
      step: i + 1,
      description: `Step ${i + 1}: Do something with the rice and stir for ${i + 1} minutes.`,
    })),
  };

  it("should chunk very long recipes", () => {
    const chunks = formatRecipeWithChunking(mockRecipe);

    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach((chunk) => {
      expect(chunk.length).toBeLessThanOrEqual(3500);
      expect(chunk).toContain("Chunked Recipe");
    });
  });

  it("should not chunk small recipes", () => {
    const smallRecipe: CookingRecipe = {
      title: "Small Recipe",
      ingredients: [{ item: "salt", amount: "1 tsp" }],
      equipment: [],
      instructions: [{ step: 1, description: "Add salt" }],
    };

    const chunks = formatRecipeWithChunking(smallRecipe);

    expect(chunks.length).toBe(1);
  });

  it("should handle empty recipe for chunking", () => {
    const chunks = formatRecipeWithChunking({} as CookingRecipe);

    expect(chunks.length).toBe(1);
    expect(chunks[0]).toContain("Invalid recipe data");
  });
});

describe("edge cases", () => {
  it("should handle malformed ingredient objects", () => {
    const malformedRecipe: CookingRecipe = {
      title: "Test",
      ingredients: [{ item: "", amount: "" }],
      equipment: [],
      instructions: [],
    };

    const result = formatRecipeMessage(malformedRecipe);

    expect(result).toContain("Test");
    // Should not include empty ingredient
    expect(result).not.toContain("•");
  });

  it("should handle recipes with special characters", () => {
    const specialRecipe: CookingRecipe = {
      title: "Tést Récìpê!@#$%^&*()",
      ingredients: [{ item: "tëst ingrëdient", amount: "1½ cups" }],
      equipment: ["spëcial ütensíl"],
      instructions: [{ step: 1, description: "Dö sôméthìng spécïâl" }],
    };

    const result = formatRecipeMessage(specialRecipe);

    expect(result).toContain("Tést Récìpê!@#$%^&*()");
    expect(result).toContain("tëst ingrëdient");
    expect(result).toContain("1½ cups");
  });

  it("should handle recipes with empty title", () => {
    const recipeWithEmptyTitle: CookingRecipe = {
      title: "",
      ingredients: [{ item: "test", amount: "1 cup" }],
      equipment: [],
      instructions: [{ step: 1, description: "Mix" }],
    };

    const result = formatRecipeMessage(recipeWithEmptyTitle);

    expect(result).toContain("🍳 *Recipe from Video*");
  });

  it("should handle very long tip strings", () => {
    const longTip = "a".repeat(1000);
    const recipeWithLongTip: CookingRecipe = {
      title: "Long Tip Recipe",
      ingredients: [{ item: "salt", amount: "1 tsp" }],
      equipment: [],
      instructions: [{ step: 1, description: "Add salt" }],
      tips: [longTip],
    };

    const result = formatRecipeMessage(recipeWithLongTip);

    expect(result).toContain("💡 *Tips & Tricks:*");
    expect(result).toContain("a".repeat(100)); // Should be truncated in practice
  });
});
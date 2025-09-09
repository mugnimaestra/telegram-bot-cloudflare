import { describe, it, expect, vi, beforeEach } from "vitest";
import { parseRecipeResponse } from "./analyzeVideo";

// Mock the logger
vi.mock("@/utils/logger", () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

describe("Techniques Parsing Fix", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should parse the problematic JSON from logs without errors", () => {
    const problematicJson = `{
      "recipe_title": "Honey Lemon Garlic Chicken",
      "cuisine_type": "Asian-inspired",
      "meal_category": "dinner",
      "dietary_info": ["contains gluten (soy sauce, mirin)", "contains chicken"],
      "difficulty_level": "medium",
      "prep_time_minutes": 10,
      "cook_time_minutes": 10,
      "total_time_minutes": 20,
      "servings": "2-4",
      "ingredients": [
        {
          "item": "dada ayam",
          "amount": "4-6",
          "unit": "potong",
          "preparation": "dipotong menjadi potongan besar",
          "notes": "",
          "optional": false
        },
        {
          "item": "garam",
          "amount": "secukupnya",
          "unit": "",
          "preparation": "",
          "notes": "",
          "optional": false
        }
      ],
      "equipment": [
        {
          "item": "wajan",
          "size_or_type": "anti lengket",
          "alternative": ""
        }
      ],
      "instructions": [
        {
          "step_number": 1,
          "action": "Bumbui dada ayam dengan garam dan lada hitam.",
          "duration": "",
          "temperature": "",
          "visual_cues": "ayam dibumbui dengan garam dan lada hitam",
          "tips": ""
        }
      ],
      "techniques": [
        {
          "name": "membumbui dada ayam",
          "description": "menggunakan garam dan lada hitam untuk memberi rasa pada dada ayam",
          "purpose": "memberi rasa dasar pada dada ayam sebelum dimasak"
        },
        {
          "name": "melapisi dengan tepung jagung",
          "description": "mengolesi dada ayam dengan tepung jagung untuk membuat kulit renyah",
          "purpose": "membuat kulit ayam menjadi renyah saat dimasak"
        },
        "membuat saus dengan menggabungkan bahan-bahan cair dan padat",
        {
          "name": "mengental saus",
          "description": "memasak bahan-bahan saus hingga konsistensi menjadi kental",
          "purpose": "membuat saus yang menempel pada ayam saat dioles"
        },
        {
          "name": "membastar ayam dengan saus",
          "description": "mengolesi ayam dengan saus yang telah mengental",
          "purpose": "memberi rasa dan warna pada ayam"
        }
      ],
      "notes_and_tips": [
        "Resep ini dapat disajikan dengan nasi putih yang dikukus panas.",
        "Waktu total memasak adalah sekitar 20 menit."
      ],
      "storage_instructions": "Simpan dalam wadah tertutup dan dinginkan dalam kulkas. Tahan hingga 3 hari.",
      "reheating_instructions": "Panggang kembali dalam wajan atau panaskan dalam microwave selama 1-2 menit.",
      "cultural_context": "Resep ini merupakan variasi dari hidangan ayam yang populer di Asia, menggabungkan rasa manis, asam, dan pedas.",
      "serving_suggestions": ["dengan nasi putih", "dengan sayuran rebus"],
      "variations": ["gunakan daging babi atau ikan sebagai alternatif", "tambahkan sayuran seperti brokoli atau wortel"],
      "_metadata": {
        "extraction_confidence": "high",
        "unclear_elements": [],
        "implied_steps": ["pra-panaskan wajan sebelum memasak ayam"],
        "non_verbal_observations": ["tampilan akhir hidangan dengan saus yang mengkilap dan ayam berwarna keemasan"],
        "frame_count": 24,
        "audio_available": true,
        "processing_time": "5 menit",
        "model_used": "video_recipe_extractor_v1",
        "analysis_timestamp": "2023-11-15T10:30:00Z"
      }
    }`;

    // This should not throw an error
    const result = parseRecipeResponse(problematicJson);
    
    expect(result).not.toBeNull();
    expect(result?.title).toBe("Honey Lemon Garlic Chicken");
    expect(result?.techniques).toBeDefined();
    expect(Array.isArray(result?.techniques)).toBe(true);
    expect(result?.techniques?.length).toBe(5);
    
    // Check that the string technique was properly converted
    const stringTechnique = result?.techniques?.find((t: string) => t.includes("membuat saus dengan menggabungkan"));
    expect(stringTechnique).toBe("membuat saus dengan menggabungkan bahan-bahan cair dan padat");
    
    // Check that object techniques were properly converted to strings
    const objectTechnique1 = result?.techniques?.find((t: string) => t.includes("membumbui dada ayam"));
    expect(objectTechnique1).toBe("membumbui dada ayam");
    
    const objectTechnique2 = result?.techniques?.find((t: string) => t.includes("melapisi dengan tepung jagung"));
    expect(objectTechnique2).toBe("melapisi dengan tepung jagung");
  });

  it("should handle techniques array with only string values", () => {
    const jsonWithOnlyStringTechniques = `{
      "title": "Simple Recipe",
      "ingredients": [{"item": "salt"}],
      "equipment": [],
      "instructions": [{"step": 1, "description": "add salt"}],
      "techniques": ["chopping", "sautéing", "seasoning"]
    }`;

    const result = parseRecipeResponse(jsonWithOnlyStringTechniques);
    
    expect(result).not.toBeNull();
    expect(result?.techniques).toEqual(["chopping", "sautéing", "seasoning"]);
  });

  it("should handle techniques array with only object values", () => {
    const jsonWithOnlyObjectTechniques = `{
      "title": "Complex Recipe",
      "ingredients": [{"item": "chicken"}],
      "equipment": [],
      "instructions": [{"step": 1, "description": "cook chicken"}],
      "techniques": [
        {"name": "grilling", "description": "cooking over direct heat", "purpose": "create charred flavor"},
        {"name": "marinating", "description": "soaking in seasoned liquid", "purpose": "tenderize and flavor"}
      ]
    }`;

    const result = parseRecipeResponse(jsonWithOnlyObjectTechniques);
    
    expect(result).not.toBeNull();
    expect(result?.techniques).toEqual(["grilling", "marinating"]);
  });

  it("should handle empty techniques array", () => {
    const jsonWithEmptyTechniques = `{
      "title": "Basic Recipe",
      "ingredients": [{"item": "water"}],
      "equipment": [],
      "instructions": [{"step": 1, "description": "boil water"}],
      "techniques": []
    }`;

    const result = parseRecipeResponse(jsonWithEmptyTechniques);
    
    expect(result).not.toBeNull();
    expect(result?.techniques).toEqual([]);
  });

  it("should handle missing techniques field", () => {
    const jsonWithoutTechniques = `{
      "title": "No Techniques Recipe",
      "ingredients": [{"item": "rice"}],
      "equipment": [],
      "instructions": [{"step": 1, "description": "cook rice"}]
    }`;

    const result = parseRecipeResponse(jsonWithoutTechniques);
    
    expect(result).not.toBeNull();
    expect(result?.techniques).toBeUndefined();
  });

  it("should handle malformed technique objects", () => {
    const jsonWithMalformedTechniques = `{
      "title": "Malformed Recipe",
      "ingredients": [{"item": "test"}],
      "equipment": [],
      "instructions": [{"step": 1, "description": "test"}],
      "techniques": [
        {"name": "valid technique"},
        {"description": "technique without name"},
        "valid string technique",
        {"name": "", "description": "empty name technique"}
      ]
    }`;

    const result = parseRecipeResponse(jsonWithMalformedTechniques);
    
    expect(result).not.toBeNull();
    expect(result?.techniques).toBeDefined();
    expect(result?.techniques?.length).toBe(2); // Only valid techniques should be included
    expect(result?.techniques).toContain("valid technique");
    expect(result?.techniques).toContain("valid string technique");
  });
});
import { describe, it, expect } from "vitest";
import { parseRecipeResponse } from "./analyzeVideo";

describe("Final Verification - Original Issue Resolution", () => {
  it("should resolve the original Go error: 'json: cannot unmarshal string into Go struct field Recipe.techniques of type types.Technique'", () => {
    // This is the exact JSON from the logs that was causing the error
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

    // Before the fix: This would throw an error or return null due to mixed types in techniques array
    // After the fix: This should parse successfully
    const result = parseRecipeResponse(problematicJson);
    
    // Verify the JSON parses successfully (no more Go struct unmarshalling error)
    expect(result).not.toBeNull();
    expect(result?.title).toBe("Honey Lemon Garlic Chicken");
    
    // Verify the techniques array is properly processed
    expect(result?.techniques).toBeDefined();
    expect(Array.isArray(result?.techniques)).toBe(true);
    expect(result?.techniques?.length).toBe(5);
    
    // CRITICAL VERIFICATION: The string technique is properly preserved
    const stringTechnique = result?.techniques?.find(t => t === "membuat saus dengan menggabungkan bahan-bahan cair dan padat");
    expect(stringTechnique).toBe("membuat saus dengan menggabungkan bahan-bahan cair dan padat");
    
    // Verify object techniques are converted to strings (using name field)
    const objectTechnique1 = result?.techniques?.find(t => t === "membumbui dada ayam");
    expect(objectTechnique1).toBe("membumbui dada ayam");
    
    const objectTechnique2 = result?.techniques?.find(t => t === "melapisi dengan tepung jagung");
    expect(objectTechnique2).toBe("melapisi dengan tepung jagung");
    
    const objectTechnique3 = result?.techniques?.find(t => t === "mengental saus");
    expect(objectTechnique3).toBe("mengental saus");
    
    const objectTechnique4 = result?.techniques?.find(t => t === "membastar ayam dengan saus");
    expect(objectTechnique4).toBe("membastar ayam dengan saus");
    
    // Final verification: All techniques are now strings (no more mixed types)
    result?.techniques?.forEach(technique => {
      expect(typeof technique).toBe('string');
      expect(technique.length).toBeGreaterThan(0);
    });
    
    console.log("✅ SUCCESS: Original Go struct unmarshalling error has been resolved!");
    console.log("✅ The problematic JSON now parses correctly");
    console.log("✅ Mixed techniques array (objects + strings) is properly handled");
    console.log("✅ String technique preserved:", stringTechnique);
    console.log("✅ Object techniques converted to strings:", [objectTechnique1, objectTechnique2, objectTechnique3, objectTechnique4]);
  });

  it("should demonstrate the specific conversion that was requested", () => {
    // Test the exact conversion mentioned in the requirements
    const inputString = "membuat saus dengan menggabungkan bahan-bahan cair dan padat";
    const testJson = `{
      "title": "Test Recipe",
      "ingredients": [{"item": "test"}],
      "equipment": [],
      "instructions": [{"step": 1, "description": "test"}],
      "techniques": ["${inputString}"]
    }`;

    const result = parseRecipeResponse(testJson);
    
    expect(result).not.toBeNull();
    expect(result?.techniques).toBeDefined();
    expect(result?.techniques?.length).toBe(1);
    expect(result?.techniques?.[0]).toBe(inputString);
    
    console.log("✅ String technique preservation verified:", result?.techniques?.[0]);
  });
});
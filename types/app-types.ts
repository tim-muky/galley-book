// Convenience types appended to the generated database.ts by `npm run types`.
// Edit this file — do NOT edit the generated section above.

export type RecipeSeason = Database["public"]["Enums"]["recipe_season"];
export type RecipeType = Database["public"]["Enums"]["recipe_type"];
export type GalleyRole = Database["public"]["Enums"]["galley_role"];
// "tiktok" extends the DB enum — keep in sync with the source_type migration
export type SourceType = Database["public"]["Enums"]["source_type"] | "tiktok";

export type Recipe = Database["public"]["Tables"]["recipes"]["Row"];
export type Ingredient = Database["public"]["Tables"]["ingredients"]["Row"];
export type PreparationStep = Database["public"]["Tables"]["preparation_steps"]["Row"];
export type RecipePhoto = Database["public"]["Tables"]["recipe_photos"]["Row"];
export type Galley = Database["public"]["Tables"]["galleys"]["Row"];
export type GalleyMember = Database["public"]["Tables"]["galley_members"]["Row"];
export type UserProfile = Database["public"]["Tables"]["users"]["Row"];
export type Vote = Database["public"]["Tables"]["votes"]["Row"];
export type SavedSource = Database["public"]["Tables"]["saved_sources"]["Row"];

export interface RecipeWithDetails extends Recipe {
  photos: RecipePhoto[];
  ingredients: Ingredient[];
  steps: PreparationStep[];
  votes: Vote[];
  created_by_user?: UserProfile;
}

// recipe_translations.ingredients/steps are jsonb columns — narrow them here
// from `Json | null` to the structured shape the UI expects.
export type RecipeTranslation = Omit<
  Database["public"]["Tables"]["recipe_translations"]["Row"],
  "ingredients" | "steps"
> & {
  ingredients: { id: string; name: string }[] | null;
  steps: { id: string; instruction: string }[] | null;
};

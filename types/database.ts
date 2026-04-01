export type RecipeSeason = "spring" | "summer" | "autumn" | "winter" | "all_year";
export type RecipeType = "starter" | "main" | "dessert" | "breakfast" | "snack" | "drink" | "side";
export type GalleyRole = "owner" | "member";
export type SourceType = "instagram" | "youtube" | "website";

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          email: string;
          name: string | null;
          username: string | null;
          avatar_url: string | null;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["users"]["Row"], "created_at">;
        Update: Partial<Database["public"]["Tables"]["users"]["Insert"]>;
      };
      galleys: {
        Row: {
          id: string;
          name: string;
          owner_id: string;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["galleys"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["galleys"]["Insert"]>;
      };
      galley_members: {
        Row: {
          id: string;
          galley_id: string;
          user_id: string;
          role: GalleyRole;
          invited_at: string;
          joined_at: string | null;
        };
        Insert: Omit<Database["public"]["Tables"]["galley_members"]["Row"], "id" | "invited_at">;
        Update: Partial<Database["public"]["Tables"]["galley_members"]["Insert"]>;
      };
      recipes: {
        Row: {
          id: string;
          galley_id: string;
          created_by: string;
          name: string;
          description: string | null;
          servings: number | null;
          prep_time: number | null;
          season: RecipeSeason | null;
          type: RecipeType | null;
          source_url: string | null;
          share_token: string;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["recipes"]["Row"], "id" | "share_token" | "created_at" | "updated_at">;
        Update: Partial<Database["public"]["Tables"]["recipes"]["Insert"]>;
      };
      recipe_photos: {
        Row: {
          id: string;
          recipe_id: string;
          storage_path: string;
          is_primary: boolean;
          sort_order: number;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["recipe_photos"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["recipe_photos"]["Insert"]>;
      };
      ingredients: {
        Row: {
          id: string;
          recipe_id: string;
          name: string;
          amount: number | null;
          unit: string | null;
          sort_order: number;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["ingredients"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["ingredients"]["Insert"]>;
      };
      preparation_steps: {
        Row: {
          id: string;
          recipe_id: string;
          step_number: number;
          instruction: string;
          photo_storage_path: string | null;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["preparation_steps"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["preparation_steps"]["Insert"]>;
      };
      votes: {
        Row: {
          id: string;
          recipe_id: string;
          user_id: string;
          value: number;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["votes"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["votes"]["Insert"]>;
      };
      saved_sources: {
        Row: {
          id: string;
          galley_id: string;
          added_by: string;
          url: string;
          source_type: SourceType;
          handle_or_name: string | null;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["saved_sources"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["saved_sources"]["Insert"]>;
      };
    };
  };
}

// Convenience types for joined/enriched data used in the UI
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

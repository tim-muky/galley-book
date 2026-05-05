export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      ai_usage_logs: {
        Row: {
          cost_usd: number | null
          created_at: string
          duration_ms: number | null
          id: string
          input_tokens: number | null
          model: string
          operation: string
          output_tokens: number | null
          success: boolean
          user_id: string | null
        }
        Insert: {
          cost_usd?: number | null
          created_at?: string
          duration_ms?: number | null
          id?: string
          input_tokens?: number | null
          model: string
          operation: string
          output_tokens?: number | null
          success?: boolean
          user_id?: string | null
        }
        Update: {
          cost_usd?: number | null
          created_at?: string
          duration_ms?: number | null
          id?: string
          input_tokens?: number | null
          model?: string
          operation?: string
          output_tokens?: number | null
          success?: boolean
          user_id?: string | null
        }
        Relationships: []
      }
      cook_next_history: {
        Row: {
          galley_id: string | null
          id: string
          recipe_id: string | null
          shown_at: string | null
          vote: number | null
        }
        Insert: {
          galley_id?: string | null
          id?: string
          recipe_id?: string | null
          shown_at?: string | null
          vote?: number | null
        }
        Update: {
          galley_id?: string | null
          id?: string
          recipe_id?: string | null
          shown_at?: string | null
          vote?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cook_next_history_galley_id_fkey"
            columns: ["galley_id"]
            isOneToOne: false
            referencedRelation: "galleys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cook_next_history_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      cook_next_list: {
        Row: {
          added_at: string
          added_by: string
          galley_id: string
          id: string
          recipe_id: string
        }
        Insert: {
          added_at?: string
          added_by: string
          galley_id: string
          id?: string
          recipe_id: string
        }
        Update: {
          added_at?: string
          added_by?: string
          galley_id?: string
          id?: string
          recipe_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cook_next_list_galley_id_fkey"
            columns: ["galley_id"]
            isOneToOne: false
            referencedRelation: "galleys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cook_next_list_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      discover_memory: {
        Row: {
          galley_id: string | null
          id: string
          rejected_at: string | null
          title: string | null
          url: string
        }
        Insert: {
          galley_id?: string | null
          id?: string
          rejected_at?: string | null
          title?: string | null
          url: string
        }
        Update: {
          galley_id?: string | null
          id?: string
          rejected_at?: string | null
          title?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "discover_memory_galley_id_fkey"
            columns: ["galley_id"]
            isOneToOne: false
            referencedRelation: "galleys"
            referencedColumns: ["id"]
          },
        ]
      }
      galley_invites: {
        Row: {
          created_at: string
          created_by: string
          galley_id: string
          id: string
          token: string
        }
        Insert: {
          created_at?: string
          created_by: string
          galley_id: string
          id?: string
          token?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          galley_id?: string
          id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "galley_invites_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "galley_invites_galley_id_fkey"
            columns: ["galley_id"]
            isOneToOne: false
            referencedRelation: "galleys"
            referencedColumns: ["id"]
          },
        ]
      }
      galley_members: {
        Row: {
          galley_id: string
          id: string
          invited_at: string
          is_default: boolean
          joined_at: string | null
          role: Database["public"]["Enums"]["galley_role"]
          user_id: string
        }
        Insert: {
          galley_id: string
          id?: string
          invited_at?: string
          is_default?: boolean
          joined_at?: string | null
          role?: Database["public"]["Enums"]["galley_role"]
          user_id: string
        }
        Update: {
          galley_id?: string
          id?: string
          invited_at?: string
          is_default?: boolean
          joined_at?: string | null
          role?: Database["public"]["Enums"]["galley_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "galley_members_galley_id_fkey"
            columns: ["galley_id"]
            isOneToOne: false
            referencedRelation: "galleys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "galley_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      galleys: {
        Row: {
          created_at: string
          header_image_path: string | null
          id: string
          name: string
          owner_id: string
        }
        Insert: {
          created_at?: string
          header_image_path?: string | null
          id?: string
          name: string
          owner_id: string
        }
        Update: {
          created_at?: string
          header_image_path?: string | null
          id?: string
          name?: string
          owner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "galleys_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      iap_subscriptions: {
        Row: {
          created_at: string
          expires_at: string | null
          galley_id: string
          grant_reason: string | null
          granted_by: string | null
          id: string
          offer_identifier: string | null
          original_transaction_id: string | null
          product_id: string
          raw_payload: Json | null
          revoked_at: string | null
          revoked_by: string | null
          source: Database["public"]["Enums"]["iap_source"]
          starts_at: string
          status: Database["public"]["Enums"]["iap_status"]
          transaction_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          galley_id: string
          grant_reason?: string | null
          granted_by?: string | null
          id?: string
          offer_identifier?: string | null
          original_transaction_id?: string | null
          product_id: string
          raw_payload?: Json | null
          revoked_at?: string | null
          revoked_by?: string | null
          source: Database["public"]["Enums"]["iap_source"]
          starts_at?: string
          status?: Database["public"]["Enums"]["iap_status"]
          transaction_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          galley_id?: string
          grant_reason?: string | null
          granted_by?: string | null
          id?: string
          offer_identifier?: string | null
          original_transaction_id?: string | null
          product_id?: string
          raw_payload?: Json | null
          revoked_at?: string | null
          revoked_by?: string | null
          source?: Database["public"]["Enums"]["iap_source"]
          starts_at?: string
          status?: Database["public"]["Enums"]["iap_status"]
          transaction_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "iap_subscriptions_galley_id_fkey"
            columns: ["galley_id"]
            isOneToOne: false
            referencedRelation: "galleys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "iap_subscriptions_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "iap_subscriptions_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "iap_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      ingredients: {
        Row: {
          amount: number | null
          created_at: string
          group_name: string | null
          id: string
          name: string
          recipe_id: string
          sort_order: number | null
          unit: string | null
        }
        Insert: {
          amount?: number | null
          created_at?: string
          group_name?: string | null
          id?: string
          name: string
          recipe_id: string
          sort_order?: number | null
          unit?: string | null
        }
        Update: {
          amount?: number | null
          created_at?: string
          group_name?: string | null
          id?: string
          name?: string
          recipe_id?: string
          sort_order?: number | null
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ingredients_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      parse_quality_logs: {
        Row: {
          created_at: string
          discarded: boolean
          error_message: string | null
          id: string
          missing_fields: string[]
          parsed_via: string | null
          platform: string
          recipe_name: string | null
          source_url: string | null
          success: boolean
          user_id: string | null
        }
        Insert: {
          created_at?: string
          discarded?: boolean
          error_message?: string | null
          id?: string
          missing_fields?: string[]
          parsed_via?: string | null
          platform: string
          recipe_name?: string | null
          source_url?: string | null
          success?: boolean
          user_id?: string | null
        }
        Update: {
          created_at?: string
          discarded?: boolean
          error_message?: string | null
          id?: string
          missing_fields?: string[]
          parsed_via?: string | null
          platform?: string
          recipe_name?: string | null
          source_url?: string | null
          success?: boolean
          user_id?: string | null
        }
        Relationships: []
      }
      pending_galley_invites: {
        Row: {
          created_at: string
          email: string
          galley_id: string
          id: string
          inviter_id: string | null
        }
        Insert: {
          created_at?: string
          email: string
          galley_id: string
          id?: string
          inviter_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          galley_id?: string
          id?: string
          inviter_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pending_galley_invites_galley_id_fkey"
            columns: ["galley_id"]
            isOneToOne: false
            referencedRelation: "galleys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_galley_invites_inviter_id_fkey"
            columns: ["inviter_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      preparation_steps: {
        Row: {
          created_at: string
          id: string
          instruction: string
          photo_storage_path: string | null
          recipe_id: string
          step_number: number
        }
        Insert: {
          created_at?: string
          id?: string
          instruction: string
          photo_storage_path?: string | null
          recipe_id: string
          step_number: number
        }
        Update: {
          created_at?: string
          id?: string
          instruction?: string
          photo_storage_path?: string | null
          recipe_id?: string
          step_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "preparation_steps_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_comments: {
        Row: {
          author_id: string | null
          body: string
          created_at: string
          id: string
          recipe_id: string
        }
        Insert: {
          author_id?: string | null
          body: string
          created_at?: string
          id?: string
          recipe_id: string
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string
          id?: string
          recipe_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_comments_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_photos: {
        Row: {
          created_at: string
          id: string
          is_primary: boolean | null
          recipe_id: string
          sort_order: number | null
          storage_path: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_primary?: boolean | null
          recipe_id: string
          sort_order?: number | null
          storage_path: string
        }
        Update: {
          created_at?: string
          id?: string
          is_primary?: boolean | null
          recipe_id?: string
          sort_order?: number | null
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_photos_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_tags: {
        Row: {
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["tag_kind"]
          recipe_id: string
          value: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["tag_kind"]
          recipe_id: string
          value: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["tag_kind"]
          recipe_id?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_tags_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_translations: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          ingredients: Json | null
          language: string
          recipe_id: string
          steps: Json | null
          translated_by: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          ingredients?: Json | null
          language: string
          recipe_id: string
          steps?: Json | null
          translated_by?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          ingredients?: Json | null
          language?: string
          recipe_id?: string
          steps?: Json | null
          translated_by?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recipe_translations_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_translations_translated_by_fkey"
            columns: ["translated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      recipes: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          galley_id: string
          id: string
          name: string
          prep_time: number | null
          season: Database["public"]["Enums"]["recipe_season"] | null
          servings: number | null
          share_token: string
          source_url: string | null
          type: Database["public"]["Enums"]["recipe_type"] | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          galley_id: string
          id?: string
          name: string
          prep_time?: number | null
          season?: Database["public"]["Enums"]["recipe_season"] | null
          servings?: number | null
          share_token?: string
          source_url?: string | null
          type?: Database["public"]["Enums"]["recipe_type"] | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          galley_id?: string
          id?: string
          name?: string
          prep_time?: number | null
          season?: Database["public"]["Enums"]["recipe_season"] | null
          servings?: number | null
          share_token?: string
          source_url?: string | null
          type?: Database["public"]["Enums"]["recipe_type"] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipes_galley_id_fkey"
            columns: ["galley_id"]
            isOneToOne: false
            referencedRelation: "galleys"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_sources: {
        Row: {
          added_by: string | null
          created_at: string
          galley_id: string
          handle_or_name: string | null
          id: string
          source_type: Database["public"]["Enums"]["source_type"]
          url: string
        }
        Insert: {
          added_by?: string | null
          created_at?: string
          galley_id: string
          handle_or_name?: string | null
          id?: string
          source_type: Database["public"]["Enums"]["source_type"]
          url: string
        }
        Update: {
          added_by?: string | null
          created_at?: string
          galley_id?: string
          handle_or_name?: string | null
          id?: string
          source_type?: Database["public"]["Enums"]["source_type"]
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_sources_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_sources_galley_id_fkey"
            columns: ["galley_id"]
            isOneToOne: false
            referencedRelation: "galleys"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          id: string
          is_admin: boolean
          name: string | null
          preferred_language: string | null
          translation_language: string | null
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          id: string
          is_admin?: boolean
          name?: string | null
          preferred_language?: string | null
          translation_language?: string | null
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          id?: string
          is_admin?: boolean
          name?: string | null
          preferred_language?: string | null
          translation_language?: string | null
          username?: string | null
        }
        Relationships: []
      }
      votes: {
        Row: {
          created_at: string
          id: string
          recipe_id: string
          user_id: string
          value: number
        }
        Insert: {
          created_at?: string
          id?: string
          recipe_id: string
          user_id: string
          value: number
        }
        Update: {
          created_at?: string
          id?: string
          recipe_id?: string
          user_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "votes_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "votes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      waitlist: {
        Row: {
          created_at: string
          email: string
          id: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
        }
        Relationships: []
      }
    }
    Views: {
      recipe_vote_summary: {
        Row: {
          recipe_id: string | null
          vote_avg: number | null
          vote_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "votes_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      create_galley: {
        Args: { galley_name: string; owner: string }
        Returns: string
      }
      create_recipe_with_children: {
        Args: {
          p_ingredients: Json
          p_recipe: Json
          p_steps: Json
          p_tags?: Json
        }
        Returns: string
      }
      is_galley_member: { Args: { galley_uuid: string }; Returns: boolean }
      is_galley_owner: { Args: { galley_uuid: string }; Returns: boolean }
      is_galley_premium: { Args: { p_galley_id: string }; Returns: boolean }
    }
    Enums: {
      galley_role: "owner" | "member"
      iap_source: "apple_iap" | "apple_offer_code" | "comp"
      iap_status:
        | "active"
        | "expired"
        | "in_billing_retry"
        | "cancelled"
        | "revoked"
      recipe_season: "spring" | "summer" | "autumn" | "winter" | "all_year"
      recipe_type:
        | "starter"
        | "main"
        | "dessert"
        | "breakfast"
        | "snack"
        | "drink"
        | "side"
      source_type: "instagram" | "youtube" | "website" | "tiktok"
      tag_kind: "cuisine" | "type" | "season" | "ingredient"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      galley_role: ["owner", "member"],
      iap_source: ["apple_iap", "apple_offer_code", "comp"],
      iap_status: [
        "active",
        "expired",
        "in_billing_retry",
        "cancelled",
        "revoked",
      ],
      recipe_season: ["spring", "summer", "autumn", "winter", "all_year"],
      recipe_type: [
        "starter",
        "main",
        "dessert",
        "breakfast",
        "snack",
        "drink",
        "side",
      ],
      source_type: ["instagram", "youtube", "website", "tiktok"],
      tag_kind: ["cuisine", "type", "season", "ingredient"],
    },
  },
} as const
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

export type TagKind = Database["public"]["Enums"]["tag_kind"];

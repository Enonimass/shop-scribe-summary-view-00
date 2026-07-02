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
    PostgrestVersion: "12.2.12 (cd3cf9e)"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          actor: string | null
          actor_role: string | null
          after: Json | null
          before: Json | null
          created_at: string
          entity: string
          entity_id: string | null
          id: string
          notes: string | null
          shop_id: string | null
        }
        Insert: {
          action: string
          actor?: string | null
          actor_role?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity: string
          entity_id?: string | null
          id?: string
          notes?: string | null
          shop_id?: string | null
        }
        Update: {
          action?: string
          actor?: string | null
          actor_role?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity?: string
          entity_id?: string | null
          id?: string
          notes?: string | null
          shop_id?: string | null
        }
        Relationships: []
      }
      customers: {
        Row: {
          created_at: string
          email: string | null
          feeds: string | null
          first_purchase_date: string | null
          id: string
          last_purchase_date: string | null
          name: string
          phone: string | null
          place: string | null
          shop_id: string
          status: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          feeds?: string | null
          first_purchase_date?: string | null
          id?: string
          last_purchase_date?: string | null
          name: string
          phone?: string | null
          place?: string | null
          shop_id: string
          status?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          feeds?: string | null
          first_purchase_date?: string | null
          id?: string
          last_purchase_date?: string | null
          name?: string
          phone?: string | null
          place?: string | null
          shop_id?: string
          status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      debt_payments: {
        Row: {
          allocated_amount: number | null
          amount: number
          created_at: string
          customer_name: string
          id: string
          notes: string | null
          payment_date: string
          payment_method_id: string | null
          payment_method_name: string | null
          recorded_by: string | null
          sale_transaction_id: string | null
          shop_id: string
          updated_at: string
        }
        Insert: {
          allocated_amount?: number | null
          amount: number
          created_at?: string
          customer_name: string
          id?: string
          notes?: string | null
          payment_date?: string
          payment_method_id?: string | null
          payment_method_name?: string | null
          recorded_by?: string | null
          sale_transaction_id?: string | null
          shop_id: string
          updated_at?: string
        }
        Update: {
          allocated_amount?: number | null
          amount?: number
          created_at?: string
          customer_name?: string
          id?: string
          notes?: string | null
          payment_date?: string
          payment_method_id?: string | null
          payment_method_name?: string | null
          recorded_by?: string | null
          sale_transaction_id?: string | null
          shop_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      delivery_note_items: {
        Row: {
          created_at: string
          delivery_note_id: string
          id: string
          product: string
          quantity: number
          unit: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          delivery_note_id: string
          id?: string
          product: string
          quantity: number
          unit: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          delivery_note_id?: string
          id?: string
          product?: string
          quantity?: number
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_note_items_delivery_note_id_fkey"
            columns: ["delivery_note_id"]
            isOneToOne: false
            referencedRelation: "delivery_notes"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_notes: {
        Row: {
          added_to_inventory_at: string | null
          created_at: string
          created_by: string | null
          delivered_by: string
          delivery_date: string
          delivery_note_no: string
          id: string
          logistics_confirmed_at: string | null
          logistics_confirmed_by: string | null
          notes: string | null
          seller_confirmed_at: string | null
          seller_confirmed_by: string | null
          shop_id: string
          status: string
          trip_id: string | null
          trip_stop_id: string | null
          updated_at: string
        }
        Insert: {
          added_to_inventory_at?: string | null
          created_at?: string
          created_by?: string | null
          delivered_by: string
          delivery_date?: string
          delivery_note_no: string
          id?: string
          logistics_confirmed_at?: string | null
          logistics_confirmed_by?: string | null
          notes?: string | null
          seller_confirmed_at?: string | null
          seller_confirmed_by?: string | null
          shop_id: string
          status?: string
          trip_id?: string | null
          trip_stop_id?: string | null
          updated_at?: string
        }
        Update: {
          added_to_inventory_at?: string | null
          created_at?: string
          created_by?: string | null
          delivered_by?: string
          delivery_date?: string
          delivery_note_no?: string
          id?: string
          logistics_confirmed_at?: string | null
          logistics_confirmed_by?: string | null
          notes?: string | null
          seller_confirmed_at?: string | null
          seller_confirmed_by?: string | null
          shop_id?: string
          status?: string
          trip_id?: string | null
          trip_stop_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      factory_intake_log: {
        Row: {
          created_at: string
          id: string
          intake_date: string
          note: string | null
          product: string
          quantity: number
          recorded_by: string | null
          unit: string
        }
        Insert: {
          created_at?: string
          id?: string
          intake_date?: string
          note?: string | null
          product: string
          quantity: number
          recorded_by?: string | null
          unit: string
        }
        Update: {
          created_at?: string
          id?: string
          intake_date?: string
          note?: string | null
          product?: string
          quantity?: number
          recorded_by?: string | null
          unit?: string
        }
        Relationships: []
      }
      factory_inventory: {
        Row: {
          created_at: string
          id: string
          product: string
          quantity: number
          threshold: number
          unit: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          product: string
          quantity?: number
          threshold?: number
          unit: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          product?: string
          quantity?: number
          threshold?: number
          unit?: string
          updated_at?: string
        }
        Relationships: []
      }
      inventory: {
        Row: {
          created_at: string
          desired_quantity: number
          id: string
          product: string
          quantity: number
          shop_id: string
          threshold: number
          unit: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          desired_quantity?: number
          id?: string
          product: string
          quantity?: number
          shop_id: string
          threshold?: number
          unit: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          desired_quantity?: number
          id?: string
          product?: string
          quantity?: number
          shop_id?: string
          threshold?: number
          unit?: string
          updated_at?: string
        }
        Relationships: []
      }
      payment_methods: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          kind: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          kind?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          kind?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      product_categories: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      product_category_items: {
        Row: {
          category_id: string
          created_at: string
          id: string
          product_name: string
        }
        Insert: {
          category_id: string
          created_at?: string
          id?: string
          product_name: string
        }
        Update: {
          category_id?: string
          created_at?: string
          id?: string
          product_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_category_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      product_prices: {
        Row: {
          created_at: string
          id: string
          price: number
          product: string
          shop_id: string
          unit: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          price?: number
          product: string
          shop_id: string
          unit: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          price?: number
          product?: string
          shop_id?: string
          unit?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string
          id: string
          password: string
          role: string
          shop_id: string | null
          shop_name: string | null
          updated_at: string
          username: string
        }
        Insert: {
          created_at?: string
          display_name: string
          id?: string
          password: string
          role: string
          shop_id?: string | null
          shop_name?: string | null
          updated_at?: string
          username: string
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
          password?: string
          role?: string
          shop_id?: string | null
          shop_name?: string | null
          updated_at?: string
          username?: string
        }
        Relationships: []
      }
      sales: {
        Row: {
          created_at: string
          customer_name: string | null
          customerName: string | null
          id: string
          product: string
          quantity: number
          sale_date: string
          shop_id: string
          unit: string
        }
        Insert: {
          created_at?: string
          customer_name?: string | null
          customerName?: string | null
          id?: string
          product: string
          quantity: number
          sale_date?: string
          shop_id: string
          unit: string
        }
        Update: {
          created_at?: string
          customer_name?: string | null
          customerName?: string | null
          id?: string
          product?: string
          quantity?: number
          sale_date?: string
          shop_id?: string
          unit?: string
        }
        Relationships: []
      }
      sales_items: {
        Row: {
          created_at: string
          id: string
          line_total: number
          original_price: number | null
          price_overridden: boolean
          product: string
          quantity: number
          transaction_id: string
          unit: string
          unit_price: number
        }
        Insert: {
          created_at?: string
          id?: string
          line_total?: number
          original_price?: number | null
          price_overridden?: boolean
          product: string
          quantity: number
          transaction_id: string
          unit: string
          unit_price?: number
        }
        Update: {
          created_at?: string
          id?: string
          line_total?: number
          original_price?: number | null
          price_overridden?: boolean
          product?: string
          quantity?: number
          transaction_id?: string
          unit?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_items_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "sales_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_transactions: {
        Row: {
          amount_paid: number
          created_at: string
          customer_name: string
          due_date: string | null
          fulfilled_by_shop_id: string | null
          fulfilled_by_shop_name: string | null
          "https://supabase.com/dashboard/project/pmnidfxwqseoynsflnqt/edi":
            | string
            | null
          id: string
          is_credit: boolean
          payment_method_id: string | null
          payment_method_name: string | null
          product: string | null
          sale_date: string
          sale_type: string
          shop_id: string
          total_amount: number
          updated_at: string
        }
        Insert: {
          amount_paid?: number
          created_at?: string
          customer_name: string
          due_date?: string | null
          fulfilled_by_shop_id?: string | null
          fulfilled_by_shop_name?: string | null
          "https://supabase.com/dashboard/project/pmnidfxwqseoynsflnqt/edi"?:
            | string
            | null
          id?: string
          is_credit?: boolean
          payment_method_id?: string | null
          payment_method_name?: string | null
          product?: string | null
          sale_date?: string
          sale_type?: string
          shop_id: string
          total_amount?: number
          updated_at?: string
        }
        Update: {
          amount_paid?: number
          created_at?: string
          customer_name?: string
          due_date?: string | null
          fulfilled_by_shop_id?: string | null
          fulfilled_by_shop_name?: string | null
          "https://supabase.com/dashboard/project/pmnidfxwqseoynsflnqt/edi"?:
            | string
            | null
          id?: string
          is_credit?: boolean
          payment_method_id?: string | null
          payment_method_name?: string | null
          product?: string | null
          sale_date?: string
          sale_type?: string
          shop_id?: string
          total_amount?: number
          updated_at?: string
        }
        Relationships: []
      }
      trip_returns: {
        Row: {
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          id: string
          product: string
          quantity: number
          reason: string | null
          status: string
          trip_id: string
          unit: string
          updated_at: string
        }
        Insert: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          id?: string
          product: string
          quantity?: number
          reason?: string | null
          status?: string
          trip_id: string
          unit: string
          updated_at?: string
        }
        Update: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          id?: string
          product?: string
          quantity?: number
          reason?: string | null
          status?: string
          trip_id?: string
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_returns_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_stop_items: {
        Row: {
          created_at: string
          discrepancy_qty: number | null
          dispatched_qty: number
          id: string
          product: string
          received_qty: number | null
          stop_id: string
          unit: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          discrepancy_qty?: number | null
          dispatched_qty?: number
          id?: string
          product: string
          received_qty?: number | null
          stop_id: string
          unit: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          discrepancy_qty?: number | null
          dispatched_qty?: number
          id?: string
          product?: string
          received_qty?: number | null
          stop_id?: string
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_stop_items_stop_id_fkey"
            columns: ["stop_id"]
            isOneToOne: false
            referencedRelation: "trip_stops"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_stops: {
        Row: {
          billed_sale_id: string | null
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          customer_name: string | null
          id: string
          notes: string | null
          place: string | null
          shop_id: string | null
          shop_name: string | null
          status: string
          stop_type: string
          trip_id: string
          updated_at: string
        }
        Insert: {
          billed_sale_id?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          customer_name?: string | null
          id?: string
          notes?: string | null
          place?: string | null
          shop_id?: string | null
          shop_name?: string | null
          status?: string
          stop_type: string
          trip_id: string
          updated_at?: string
        }
        Update: {
          billed_sale_id?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          customer_name?: string | null
          id?: string
          notes?: string | null
          place?: string | null
          shop_id?: string | null
          shop_name?: string | null
          status?: string
          stop_type?: string
          trip_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_stops_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trips: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string | null
          dispatched_at: string | null
          driver: string | null
          id: string
          notes: string | null
          status: string
          trip_date: string
          trip_no: string
          updated_at: string
          vehicle: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          dispatched_at?: string | null
          driver?: string | null
          id?: string
          notes?: string | null
          status?: string
          trip_date?: string
          trip_no: string
          updated_at?: string
          vehicle?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          dispatched_at?: string | null
          driver?: string | null
          id?: string
          notes?: string | null
          status?: string
          trip_date?: string
          trip_no?: string
          updated_at?: string
          vehicle?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      canonical_customer_name: {
        Args: { p_name: string; p_shop_id: string }
        Returns: string
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      rename_customer: {
        Args: { p_new: string; p_old: string; p_shop_id: string }
        Returns: Json
      }
      sync_customers_from_sales: { Args: { p_shop_id?: string }; Returns: Json }
      verify_password: {
        Args: { _hash: string; _password: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "super_admin"
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
      app_role: ["super_admin"],
    },
  },
} as const

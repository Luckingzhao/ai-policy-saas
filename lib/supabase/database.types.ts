export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          user_id: string;
          agency_id: string | null;
          full_name: string | null;
          phone: string | null;
          company_name: string | null;
          wechat_id: string | null;
          service_code: string | null;
          avatar_url: string | null;
          brand_name: string | null;
          brand_logo_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["profiles"]["Row"]> & { user_id: string };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Row"]>;
        Relationships: [];
      };
      agencies: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          contact_name: string | null;
          phone: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["agencies"]["Row"]> & { user_id: string; name: string };
        Update: Partial<Database["public"]["Tables"]["agencies"]["Row"]>;
        Relationships: [];
      };
      customers: {
        Row: {
          id: string;
          user_id: string;
          agency_id: string | null;
          name: string;
          phone: string | null;
          wechat_id: string | null;
          gender: string | null;
          birth_date: string | null;
          city: string | null;
          family_role: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["customers"]["Row"]> & { user_id: string; name: string };
        Update: Partial<Database["public"]["Tables"]["customers"]["Row"]>;
        Relationships: [];
      };
      report_files: {
        Row: {
          id: string;
          user_id: string;
          customer_id: string | null;
          bucket: string;
          object_path: string;
          original_filename: string;
          mime_type: string | null;
          file_size: number | null;
          parse_status: "pending" | "processing" | "completed" | "failed";
          parse_error: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["report_files"]["Row"]> & {
          user_id: string;
          bucket: string;
          object_path: string;
          original_filename: string;
        };
        Update: Partial<Database["public"]["Tables"]["report_files"]["Row"]>;
        Relationships: [];
      };
      policies: {
        Row: {
          id: string;
          user_id: string;
          customer_id: string | null;
          report_file_id: string | null;
          policy_number: string | null;
          insurer_name: string | null;
          product_name: string | null;
          policy_holder_name: string | null;
          insured_name: string | null;
          premium_amount: number | null;
          premium_period: string | null;
          coverage_amount: number | null;
          effective_date: string | null;
          expiry_date: string | null;
          payment_status: string | null;
          insurance_type: string | null;
          product_info: string | null;
          paid_years: number | null;
          remaining_years: number | null;
          remaining_premium: number | null;
          policy_service: string | null;
          payment_account: string | null;
          raw_payload: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["policies"]["Row"]> & { user_id: string };
        Update: Partial<Database["public"]["Tables"]["policies"]["Row"]>;
        Relationships: [];
      };
      beneficiaries: {
        Row: {
          id: string;
          user_id: string;
          policy_id: string;
          name: string;
          relationship: string | null;
          benefit_ratio: number | null;
          beneficiary_type: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["beneficiaries"]["Row"]> & {
          user_id: string;
          policy_id: string;
          name: string;
        };
        Update: Partial<Database["public"]["Tables"]["beneficiaries"]["Row"]>;
        Relationships: [];
      };
      policy_benefits: {
        Row: {
          id: string;
          user_id: string;
          policy_id: string;
          benefit_name: string;
          benefit_type: string | null;
          coverage_amount: number | null;
          description: string | null;
          waiting_period: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["policy_benefits"]["Row"]> & {
          user_id: string;
          policy_id: string;
          benefit_name: string;
        };
        Update: Partial<Database["public"]["Tables"]["policy_benefits"]["Row"]>;
        Relationships: [];
      };
      h5_reports: {
        Row: {
          id: string;
          user_id: string;
          customer_id: string | null;
          slug: string;
          title: string;
          status: "draft" | "published" | "archived";
          summary: Json;
          theme: Json;
          published_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["h5_reports"]["Row"]> & {
          user_id: string;
          slug: string;
          title: string;
        };
        Update: Partial<Database["public"]["Tables"]["h5_reports"]["Row"]>;
        Relationships: [];
      };
      subscriptions: {
        Row: {
          id: string;
          user_id: string;
          plan_code: "free" | "experience" | "professional" | "zhihui" | "team" | "zhiyou" | string;
          status: "trialing" | "active" | "past_due" | "canceled";
          current_period_start: string | null;
          current_period_end: string | null;
          monthly_report_limit: number;
          monthly_upload_limit: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["subscriptions"]["Row"]> & { user_id: string };
        Update: Partial<Database["public"]["Tables"]["subscriptions"]["Row"]>;
        Relationships: [];
      };
      activation_codes: {
        Row: {
          id: string;
          code: string;
          plan_code: "zhihui" | "zhiyou" | "professional" | "team" | string;
          monthly_report_limit: number;
          status: "unused" | "used" | "expired";
          used_by_user_id: string | null;
          used_at: string | null;
          expires_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["activation_codes"]["Row"]> & {
          code: string;
          plan_code: "zhihui" | "zhiyou" | "professional" | "team" | string;
          monthly_report_limit: number;
        };
        Update: Partial<Database["public"]["Tables"]["activation_codes"]["Row"]>;
        Relationships: [];
      };
      usage_logs: {
        Row: {
          id: string;
          user_id: string;
          subscription_id: string | null;
          action:
            | "upload_policy_pdf"
            | "upload_policy_excel"
            | "generate_h5_report"
            | "parse_policy_pdf"
            | "parse_policy_excel"
            | "publish_h5_report"
            | "activate_subscription_code";
          quantity: number;
          metadata: Json;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["usage_logs"]["Row"]> & {
          user_id: string;
          action:
            | "upload_policy_pdf"
            | "upload_policy_excel"
            | "generate_h5_report"
            | "parse_policy_pdf"
            | "parse_policy_excel"
            | "publish_h5_report"
            | "activate_subscription_code";
        };
        Update: Partial<Database["public"]["Tables"]["usage_logs"]["Row"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      activate_subscription_code: {
        Args: {
          p_code: string;
        };
        Returns: Json;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      accident_activity: {
        Row: {
          accident_id: string
          action_type: string
          actor_id: string | null
          actor_type: string | null
          created_at: string
          customer_id: string | null
          id: string
          metadata: Json
        }
        Insert: {
          accident_id: string
          action_type: string
          actor_id?: string | null
          actor_type?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          metadata?: Json
        }
        Update: {
          accident_id?: string
          action_type?: string
          actor_id?: string | null
          actor_type?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          metadata?: Json
        }
        Relationships: [
          {
            foreignKeyName: "accident_activity_accident_id_fkey"
            columns: ["accident_id"]
            isOneToOne: false
            referencedRelation: "accidents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accident_activity_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      accident_determinations: {
        Row: {
          accident_id: string
          at_fault: boolean | null
          created_at: string
          customer_id: string | null
          determination_status: string
          determined_at: string | null
          determined_by: string | null
          fault_basis: string | null
          final_summary: string | null
          financial_impact_estimate: number | null
          id: string
          insurance_action_required: boolean
          police_report_result: string | null
          score_delta: number
          score_impact: boolean
        }
        Insert: {
          accident_id: string
          at_fault?: boolean | null
          created_at?: string
          customer_id?: string | null
          determination_status?: string
          determined_at?: string | null
          determined_by?: string | null
          fault_basis?: string | null
          final_summary?: string | null
          financial_impact_estimate?: number | null
          id?: string
          insurance_action_required?: boolean
          police_report_result?: string | null
          score_delta?: number
          score_impact?: boolean
        }
        Update: {
          accident_id?: string
          at_fault?: boolean | null
          created_at?: string
          customer_id?: string | null
          determination_status?: string
          determined_at?: string | null
          determined_by?: string | null
          fault_basis?: string | null
          final_summary?: string | null
          financial_impact_estimate?: number | null
          id?: string
          insurance_action_required?: boolean
          police_report_result?: string | null
          score_delta?: number
          score_impact?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "accident_determinations_accident_id_fkey"
            columns: ["accident_id"]
            isOneToOne: true
            referencedRelation: "accidents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accident_determinations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      accident_files: {
        Row: {
          accident_id: string
          checklist_tag: string | null
          created_at: string
          customer_id: string | null
          duration_seconds: number | null
          file_type: string
          file_url: string
          id: string
          mime_type: string | null
          original_filename: string | null
          size_bytes: number | null
          storage_path: string | null
          thumbnail_url: string | null
          transcript: string | null
          transcript_lang: string | null
          transcript_status: string | null
          uploaded_by: string | null
        }
        Insert: {
          accident_id: string
          checklist_tag?: string | null
          created_at?: string
          customer_id?: string | null
          duration_seconds?: number | null
          file_type: string
          file_url: string
          id?: string
          mime_type?: string | null
          original_filename?: string | null
          size_bytes?: number | null
          storage_path?: string | null
          thumbnail_url?: string | null
          transcript?: string | null
          transcript_lang?: string | null
          transcript_status?: string | null
          uploaded_by?: string | null
        }
        Update: {
          accident_id?: string
          checklist_tag?: string | null
          created_at?: string
          customer_id?: string | null
          duration_seconds?: number | null
          file_type?: string
          file_url?: string
          id?: string
          mime_type?: string | null
          original_filename?: string | null
          size_bytes?: number | null
          storage_path?: string | null
          thumbnail_url?: string | null
          transcript?: string | null
          transcript_lang?: string | null
          transcript_status?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "accident_files_accident_id_fkey"
            columns: ["accident_id"]
            isOneToOne: false
            referencedRelation: "accidents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accident_files_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      accident_investigations: {
        Row: {
          accident_id: string
          collision_type: string | null
          corrective_action: string | null
          created_at: string
          customer_id: string | null
          id: string
          incident_category: string | null
          internal_findings: string | null
          road_conditions: string | null
          root_cause: string | null
          updated_at: string
          updated_by: string | null
          weather_conditions: string | null
        }
        Insert: {
          accident_id: string
          collision_type?: string | null
          corrective_action?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          incident_category?: string | null
          internal_findings?: string | null
          road_conditions?: string | null
          root_cause?: string | null
          updated_at?: string
          updated_by?: string | null
          weather_conditions?: string | null
        }
        Update: {
          accident_id?: string
          collision_type?: string | null
          corrective_action?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          incident_category?: string | null
          internal_findings?: string | null
          road_conditions?: string | null
          root_cause?: string | null
          updated_at?: string
          updated_by?: string | null
          weather_conditions?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "accident_investigations_accident_id_fkey"
            columns: ["accident_id"]
            isOneToOne: true
            referencedRelation: "accidents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accident_investigations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      accident_notes: {
        Row: {
          accident_id: string
          body: string
          created_at: string
          created_by: string | null
          customer_id: string | null
          id: string
          visibility: string
        }
        Insert: {
          accident_id: string
          body: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          id?: string
          visibility: string
        }
        Update: {
          accident_id?: string
          body?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          id?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "accident_notes_accident_id_fkey"
            columns: ["accident_id"]
            isOneToOne: false
            referencedRelation: "accidents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accident_notes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      accident_notifications: {
        Row: {
          accident_id: string
          channel: string
          created_at: string
          customer_id: string | null
          delivery_status: string
          error_message: string | null
          id: string
          provider_message_id: string | null
          recipient: string
          sent_at: string | null
        }
        Insert: {
          accident_id: string
          channel: string
          created_at?: string
          customer_id?: string | null
          delivery_status?: string
          error_message?: string | null
          id?: string
          provider_message_id?: string | null
          recipient: string
          sent_at?: string | null
        }
        Update: {
          accident_id?: string
          channel?: string
          created_at?: string
          customer_id?: string | null
          delivery_status?: string
          error_message?: string | null
          id?: string
          provider_message_id?: string | null
          recipient?: string
          sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "accident_notifications_accident_id_fkey"
            columns: ["accident_id"]
            isOneToOne: false
            referencedRelation: "accidents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accident_notifications_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      accident_parties: {
        Row: {
          accident_id: string
          created_at: string
          customer_id: string | null
          id: string
          insurance_policy: string | null
          insurer: string | null
          name: string | null
          notes: string | null
          officer_department: string | null
          party_type: string
          phone: string | null
          plate: string | null
          report_number: string | null
          vehicle_info: string | null
        }
        Insert: {
          accident_id: string
          created_at?: string
          customer_id?: string | null
          id?: string
          insurance_policy?: string | null
          insurer?: string | null
          name?: string | null
          notes?: string | null
          officer_department?: string | null
          party_type: string
          phone?: string | null
          plate?: string | null
          report_number?: string | null
          vehicle_info?: string | null
        }
        Update: {
          accident_id?: string
          created_at?: string
          customer_id?: string | null
          id?: string
          insurance_policy?: string | null
          insurer?: string | null
          name?: string | null
          notes?: string | null
          officer_department?: string | null
          party_type?: string
          phone?: string | null
          plate?: string | null
          report_number?: string | null
          vehicle_info?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "accident_parties_accident_id_fkey"
            columns: ["accident_id"]
            isOneToOne: false
            referencedRelation: "accidents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accident_parties_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      accident_status_history: {
        Row: {
          accident_id: string
          changed_by: string | null
          created_at: string
          customer_id: string | null
          id: string
          new_status: string
          old_status: string | null
          reason: string | null
        }
        Insert: {
          accident_id: string
          changed_by?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          new_status: string
          old_status?: string | null
          reason?: string | null
        }
        Update: {
          accident_id?: string
          changed_by?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          new_status?: string
          old_status?: string | null
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "accident_status_history_accident_id_fkey"
            columns: ["accident_id"]
            isOneToOne: false
            referencedRelation: "accidents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accident_status_history_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      accidents: {
        Row: {
          accident_datetime: string
          assigned_admin_id: string | null
          case_number: string | null
          city: string | null
          closed_at: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          description: string | null
          driver_id: string
          id: string
          incident_type: string | null
          injury_involved: boolean
          location_address: string | null
          location_geohash: string | null
          location_lat: number | null
          location_lng: number | null
          other_party_involved: boolean
          police_involved: boolean
          region: string | null
          rental_id: string | null
          severity: string
          status: string
          submitted_at: string | null
          updated_at: string
          vehicle_id: string | null
          voice_note_storage_path: string | null
          voice_note_url: string | null
        }
        Insert: {
          accident_datetime?: string
          assigned_admin_id?: string | null
          case_number?: string | null
          city?: string | null
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          description?: string | null
          driver_id: string
          id?: string
          incident_type?: string | null
          injury_involved?: boolean
          location_address?: string | null
          location_geohash?: string | null
          location_lat?: number | null
          location_lng?: number | null
          other_party_involved?: boolean
          police_involved?: boolean
          region?: string | null
          rental_id?: string | null
          severity?: string
          status?: string
          submitted_at?: string | null
          updated_at?: string
          vehicle_id?: string | null
          voice_note_storage_path?: string | null
          voice_note_url?: string | null
        }
        Update: {
          accident_datetime?: string
          assigned_admin_id?: string | null
          case_number?: string | null
          city?: string | null
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          description?: string | null
          driver_id?: string
          id?: string
          incident_type?: string | null
          injury_involved?: boolean
          location_address?: string | null
          location_geohash?: string | null
          location_lat?: number | null
          location_lng?: number | null
          other_party_involved?: boolean
          police_involved?: boolean
          region?: string | null
          rental_id?: string | null
          severity?: string
          status?: string
          submitted_at?: string | null
          updated_at?: string
          vehicle_id?: string | null
          voice_note_storage_path?: string | null
          voice_note_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "accidents_assigned_admin_id_fkey"
            columns: ["assigned_admin_id"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accidents_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accidents_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accidents_rental_id_fkey"
            columns: ["rental_id"]
            isOneToOne: false
            referencedRelation: "rentals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accidents_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accidents_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      activation_packages: {
        Row: {
          application_id: string
          created_at: string
          created_by: string | null
          customer_id: string | null
          down_payment_invoice_id: string | null
          idempotency_key: string
          package_id: string
          request_hash: string
          status: string
          status_changed_at: string
          updated_at: string
          updated_by: string | null
          validation_results_json: Json
          validation_status: string
        }
        Insert: {
          application_id: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          down_payment_invoice_id?: string | null
          idempotency_key: string
          package_id?: string
          request_hash: string
          status?: string
          status_changed_at?: string
          updated_at?: string
          updated_by?: string | null
          validation_results_json?: Json
          validation_status?: string
        }
        Update: {
          application_id?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          down_payment_invoice_id?: string | null
          idempotency_key?: string
          package_id?: string
          request_hash?: string
          status?: string
          status_changed_at?: string
          updated_at?: string
          updated_by?: string | null
          validation_results_json?: Json
          validation_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "activation_packages_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: true
            referencedRelation: "credit_applications"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "activation_packages_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activation_packages_down_payment_invoice_id_fkey"
            columns: ["down_payment_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoice"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_audit_logs: {
        Row: {
          action: string
          admin_user_id: string
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_type: string | null
          id: string
          ip_address: string | null
          metadata: Json | null
          new_values: Json | null
          old_values: Json | null
          user_agent: string | null
        }
        Insert: {
          action: string
          admin_user_id: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          new_values?: Json | null
          old_values?: Json | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          admin_user_id?: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          new_values?: Json | null
          old_values?: Json | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_audit_logs_admin_user_id_fkey"
            columns: ["admin_user_id"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_preferences: {
        Row: {
          admin_user_id: string
          created_at: string
          email_notifications: boolean
          id: string
          kyc_alerts: boolean
          new_request_alerts: boolean
          payment_alerts: boolean
          support_alerts: boolean
          updated_at: string
        }
        Insert: {
          admin_user_id: string
          created_at?: string
          email_notifications?: boolean
          id?: string
          kyc_alerts?: boolean
          new_request_alerts?: boolean
          payment_alerts?: boolean
          support_alerts?: boolean
          updated_at?: string
        }
        Update: {
          admin_user_id?: string
          created_at?: string
          email_notifications?: boolean
          id?: string
          kyc_alerts?: boolean
          new_request_alerts?: boolean
          payment_alerts?: boolean
          support_alerts?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_preferences_admin_user_id_fkey"
            columns: ["admin_user_id"]
            isOneToOne: true
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_roles: {
        Row: {
          admin_user_id: string
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          admin_user_id: string
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          admin_user_id?: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: [
          {
            foreignKeyName: "admin_roles_admin_user_id_fkey"
            columns: ["admin_user_id"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_users: {
        Row: {
          created_at: string
          customer_id: string | null
          email: string
          email_verified: boolean
          full_name: string
          id: string
          is_active: boolean
          is_platform_owner: boolean
          last_login_at: string | null
          role_key: string | null
          updated_at: string
          user_id: string | null
          verification_sent_at: string | null
          verification_token: string | null
        }
        Insert: {
          created_at?: string
          customer_id?: string | null
          email: string
          email_verified?: boolean
          full_name: string
          id?: string
          is_active?: boolean
          is_platform_owner?: boolean
          last_login_at?: string | null
          role_key?: string | null
          updated_at?: string
          user_id?: string | null
          verification_sent_at?: string | null
          verification_token?: string | null
        }
        Update: {
          created_at?: string
          customer_id?: string | null
          email?: string
          email_verified?: boolean
          full_name?: string
          id?: string
          is_active?: boolean
          is_platform_owner?: boolean
          last_login_at?: string | null
          role_key?: string | null
          updated_at?: string
          user_id?: string | null
          verification_sent_at?: string | null
          verification_token?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_users_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_explanations: {
        Row: {
          content: string
          created_at: string
          credit_score_id: string | null
          driver_id: string
          explanation_type: string
          facts_used: Json | null
          id: string
        }
        Insert: {
          content: string
          created_at?: string
          credit_score_id?: string | null
          driver_id: string
          explanation_type: string
          facts_used?: Json | null
          id?: string
        }
        Update: {
          content?: string
          created_at?: string
          credit_score_id?: string | null
          driver_id?: string
          explanation_type?: string
          facts_used?: Json | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_explanations_credit_score_id_fkey"
            columns: ["credit_score_id"]
            isOneToOne: false
            referencedRelation: "credit_scores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_explanations_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_usage_logs: {
        Row: {
          admin_user_id: string | null
          created_at: string
          customer_id: string | null
          driver_id: string | null
          error_message: string | null
          feature_key: string
          id: string
          input_tokens: number | null
          latency_ms: number | null
          metadata: Json | null
          model_used: string | null
          output_tokens: number | null
          success: boolean
          total_tokens: number | null
        }
        Insert: {
          admin_user_id?: string | null
          created_at?: string
          customer_id?: string | null
          driver_id?: string | null
          error_message?: string | null
          feature_key: string
          id?: string
          input_tokens?: number | null
          latency_ms?: number | null
          metadata?: Json | null
          model_used?: string | null
          output_tokens?: number | null
          success?: boolean
          total_tokens?: number | null
        }
        Update: {
          admin_user_id?: string | null
          created_at?: string
          customer_id?: string | null
          driver_id?: string | null
          error_message?: string | null
          feature_key?: string
          id?: string
          input_tokens?: number | null
          latency_ms?: number | null
          metadata?: Json | null
          model_used?: string | null
          output_tokens?: number | null
          success?: boolean
          total_tokens?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_logs_admin_user_id_fkey"
            columns: ["admin_user_id"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_usage_logs_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_usage_logs_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      alerts: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          alert_type: string
          created_at: string
          customer_id: string | null
          dedupe_key: string
          driver_id: string | null
          due_date: string | null
          id: string
          message: string | null
          metadata: Json
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          source_id: string | null
          source_table: string | null
          status: string
          title: string
          updated_at: string
          vehicle_id: string | null
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_type: string
          created_at?: string
          customer_id?: string | null
          dedupe_key: string
          driver_id?: string | null
          due_date?: string | null
          id?: string
          message?: string | null
          metadata?: Json
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          source_id?: string | null
          source_table?: string | null
          status?: string
          title: string
          updated_at?: string
          vehicle_id?: string | null
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_type?: string
          created_at?: string
          customer_id?: string | null
          dedupe_key?: string
          driver_id?: string | null
          due_date?: string | null
          id?: string
          message?: string | null
          metadata?: Json
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          source_id?: string | null
          source_table?: string | null
          status?: string
          title?: string
          updated_at?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "alerts_acknowledged_by_fkey"
            columns: ["acknowledged_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_audit_events: {
        Row: {
          actor_id: string | null
          actor_role: string | null
          audit_event_id: string
          created_at: string
          customer_id: string | null
          event_type: string
          export_reference: string | null
          filters_json: Json
          report_type: string | null
          target_id: string | null
          target_type: string
        }
        Insert: {
          actor_id?: string | null
          actor_role?: string | null
          audit_event_id?: string
          created_at?: string
          customer_id?: string | null
          event_type: string
          export_reference?: string | null
          filters_json?: Json
          report_type?: string | null
          target_id?: string | null
          target_type: string
        }
        Update: {
          actor_id?: string | null
          actor_role?: string | null
          audit_event_id?: string
          created_at?: string
          customer_id?: string | null
          event_type?: string
          export_reference?: string | null
          filters_json?: Json
          report_type?: string | null
          target_id?: string | null
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "analytics_audit_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analytics_audit_events_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analytics_audit_events_export_reference_fkey"
            columns: ["export_reference"]
            isOneToOne: false
            referencedRelation: "analytics_exports"
            referencedColumns: ["export_id"]
          },
        ]
      }
      analytics_exports: {
        Row: {
          confidentiality_label: string
          created_at: string
          customer_id: string | null
          export_id: string
          export_type: string
          filters_json: Json
          generated_at: string
          generated_by: string | null
          source_timestamp: string
          storage_reference: string | null
        }
        Insert: {
          confidentiality_label?: string
          created_at?: string
          customer_id?: string | null
          export_id?: string
          export_type: string
          filters_json?: Json
          generated_at?: string
          generated_by?: string | null
          source_timestamp?: string
          storage_reference?: string | null
        }
        Update: {
          confidentiality_label?: string
          created_at?: string
          customer_id?: string | null
          export_id?: string
          export_type?: string
          filters_json?: Json
          generated_at?: string
          generated_by?: string | null
          source_timestamp?: string
          storage_reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analytics_exports_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analytics_exports_generated_by_fkey"
            columns: ["generated_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_metric_definitions: {
        Row: {
          created_at: string
          formula_description: string
          known_limitations: string
          metric_category: string
          metric_id: string
          metric_name: string
          owner_role: string
          refresh_cadence: string
          source_view: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          formula_description: string
          known_limitations?: string
          metric_category: string
          metric_id: string
          metric_name: string
          owner_role: string
          refresh_cadence?: string
          source_view: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          formula_description?: string
          known_limitations?: string
          metric_category?: string
          metric_id?: string
          metric_name?: string
          owner_role?: string
          refresh_cadence?: string
          source_view?: string
          updated_at?: string
        }
        Relationships: []
      }
      analytics_snapshots: {
        Row: {
          created_at: string
          customer_id: string | null
          data_freshness_status: string
          generated_at: string
          metric_payload_json: Json
          snapshot_date: string
          snapshot_id: string
          snapshot_type: string
        }
        Insert: {
          created_at?: string
          customer_id?: string | null
          data_freshness_status?: string
          generated_at?: string
          metric_payload_json?: Json
          snapshot_date?: string
          snapshot_id?: string
          snapshot_type: string
        }
        Update: {
          created_at?: string
          customer_id?: string | null
          data_freshness_status?: string
          generated_at?: string
          metric_payload_json?: Json
          snapshot_date?: string
          snapshot_id?: string
          snapshot_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "analytics_snapshots_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_transfer_records: {
        Row: {
          approved_by: string | null
          asset_id: string
          completed_at: string | null
          created_at: string
          credit_account_id: string
          customer_id: string | null
          decision_id: string | null
          driver_id: string
          idempotency_key: string
          request_hash: string | null
          reversal_reason: string | null
          reversed_at: string | null
          review_id: string
          transfer_id: string
          transfer_metadata_json: Json
          transfer_status: string
          transfer_type: string
          updated_at: string
        }
        Insert: {
          approved_by?: string | null
          asset_id: string
          completed_at?: string | null
          created_at?: string
          credit_account_id: string
          customer_id?: string | null
          decision_id?: string | null
          driver_id: string
          idempotency_key: string
          request_hash?: string | null
          reversal_reason?: string | null
          reversed_at?: string | null
          review_id: string
          transfer_id?: string
          transfer_metadata_json?: Json
          transfer_status?: string
          transfer_type?: string
          updated_at?: string
        }
        Update: {
          approved_by?: string | null
          asset_id?: string
          completed_at?: string | null
          created_at?: string
          credit_account_id?: string
          customer_id?: string | null
          decision_id?: string | null
          driver_id?: string
          idempotency_key?: string
          request_hash?: string | null
          reversal_reason?: string | null
          reversed_at?: string | null
          review_id?: string
          transfer_id?: string
          transfer_metadata_json?: Json
          transfer_status?: string
          transfer_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_transfer_records_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "financed_assets"
            referencedColumns: ["asset_id"]
          },
          {
            foreignKeyName: "asset_transfer_records_credit_account_id_fkey"
            columns: ["credit_account_id"]
            isOneToOne: false
            referencedRelation: "credit_accounts"
            referencedColumns: ["credit_account_id"]
          },
          {
            foreignKeyName: "asset_transfer_records_credit_account_id_fkey"
            columns: ["credit_account_id"]
            isOneToOne: false
            referencedRelation: "v_credit_portfolio_account_facts"
            referencedColumns: ["credit_account_id"]
          },
          {
            foreignKeyName: "asset_transfer_records_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_transfer_records_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "ownership_completion_decisions"
            referencedColumns: ["decision_id"]
          },
          {
            foreignKeyName: "asset_transfer_records_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "v_ownership_completion_queue"
            referencedColumns: ["latest_decision_id"]
          },
          {
            foreignKeyName: "asset_transfer_records_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_transfer_records_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "ownership_completion_reviews"
            referencedColumns: ["review_id"]
          },
          {
            foreignKeyName: "asset_transfer_records_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "v_driver_ownership_completion_status"
            referencedColumns: ["review_id"]
          },
          {
            foreignKeyName: "asset_transfer_records_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "v_ownership_completion_queue"
            referencedColumns: ["completion_review_id"]
          },
          {
            foreignKeyName: "asset_transfer_records_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "v_ownership_completion_queue"
            referencedColumns: ["review_id"]
          },
        ]
      }
      badge_definitions: {
        Row: {
          badge_key: string
          category: string
          created_at: string
          description_fr: string
          icon: string
          id: string
          milestone_type: string
          milestone_value: number
          name_fr: string
          sort_order: number
          tier: string | null
        }
        Insert: {
          badge_key: string
          category?: string
          created_at?: string
          description_fr: string
          icon?: string
          id?: string
          milestone_type: string
          milestone_value?: number
          name_fr: string
          sort_order?: number
          tier?: string | null
        }
        Update: {
          badge_key?: string
          category?: string
          created_at?: string
          description_fr?: string
          icon?: string
          id?: string
          milestone_type?: string
          milestone_value?: number
          name_fr?: string
          sort_order?: number
          tier?: string | null
        }
        Relationships: []
      }
      banks: {
        Row: {
          code: string
          id: string
          is_active: boolean | null
          name: string
        }
        Insert: {
          code: string
          id?: string
          is_active?: boolean | null
          name: string
        }
        Update: {
          code?: string
          id?: string
          is_active?: boolean | null
          name?: string
        }
        Relationships: []
      }
      billing_cron_runs: {
        Row: {
          details: Json | null
          error_message: string | null
          finished_at: string | null
          id: string
          job_name: string
          processed_count: number | null
          started_at: string
          status: string
        }
        Insert: {
          details?: Json | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          job_name: string
          processed_count?: number | null
          started_at?: string
          status?: string
        }
        Update: {
          details?: Json | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          job_name?: string
          processed_count?: number | null
          started_at?: string
          status?: string
        }
        Relationships: []
      }
      billing_outbox: {
        Row: {
          attempts: number
          channel: string
          created_at: string
          customer_id: string
          id: string
          invoice_id: string | null
          last_error: string | null
          payload: Json
          scheduled_at: string
          sent_at: string | null
          status: string
        }
        Insert: {
          attempts?: number
          channel: string
          created_at?: string
          customer_id: string
          id?: string
          invoice_id?: string | null
          last_error?: string | null
          payload?: Json
          scheduled_at?: string
          sent_at?: string | null
          status?: string
        }
        Update: {
          attempts?: number
          channel?: string
          created_at?: string
          customer_id?: string
          id?: string
          invoice_id?: string | null
          last_error?: string | null
          payload?: Json
          scheduled_at?: string
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_outbox_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoice"
            referencedColumns: ["id"]
          },
        ]
      }
      broadcast_deliveries: {
        Row: {
          broadcast_id: string
          delivered_at: string
          driver_id: string
          id: string
          read_at: string | null
        }
        Insert: {
          broadcast_id: string
          delivered_at?: string
          driver_id: string
          id?: string
          read_at?: string | null
        }
        Update: {
          broadcast_id?: string
          delivered_at?: string
          driver_id?: string
          id?: string
          read_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "broadcast_deliveries_broadcast_id_fkey"
            columns: ["broadcast_id"]
            isOneToOne: false
            referencedRelation: "broadcasts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broadcast_deliveries_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      broadcasts: {
        Row: {
          audience: string
          audience_filters: Json
          channel: string
          created_at: string
          created_by: string | null
          customer_id: string | null
          delivered_count: number
          id: string
          message: string
          read_count: number
          recipient_count: number
          scheduled_at: string | null
          sent_at: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          audience?: string
          audience_filters?: Json
          channel?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          delivered_count?: number
          id?: string
          message: string
          read_count?: number
          recipient_count?: number
          scheduled_at?: string | null
          sent_at?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          audience?: string
          audience_filters?: Json
          channel?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          delivered_count?: number
          id?: string
          message?: string
          read_count?: number
          recipient_count?: number
          scheduled_at?: string | null
          sent_at?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "broadcasts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broadcasts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_audit_events: {
        Row: {
          actor_id: string | null
          actor_type: string
          after_json: Json
          audit_event_id: string
          before_json: Json
          contract_id: string | null
          created_at: string
          customer_id: string | null
          event_type: string
          idempotency_key: string | null
          reason: string | null
        }
        Insert: {
          actor_id?: string | null
          actor_type: string
          after_json?: Json
          audit_event_id?: string
          before_json?: Json
          contract_id?: string | null
          created_at?: string
          customer_id?: string | null
          event_type: string
          idempotency_key?: string | null
          reason?: string | null
        }
        Update: {
          actor_id?: string | null
          actor_type?: string
          after_json?: Json
          audit_event_id?: string
          before_json?: Json
          contract_id?: string | null
          created_at?: string
          customer_id?: string | null
          event_type?: string
          idempotency_key?: string | null
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contract_audit_events_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "credit_contracts"
            referencedColumns: ["contract_id"]
          },
          {
            foreignKeyName: "contract_audit_events_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_files: {
        Row: {
          contract_id: string
          created_at: string
          customer_id: string | null
          file_hash: string
          file_id: string
          file_type: string
          generated_at: string
          storage_reference: string
        }
        Insert: {
          contract_id: string
          created_at?: string
          customer_id?: string | null
          file_hash: string
          file_id?: string
          file_type: string
          generated_at?: string
          storage_reference: string
        }
        Update: {
          contract_id?: string
          created_at?: string
          customer_id?: string | null
          file_hash?: string
          file_id?: string
          file_type?: string
          generated_at?: string
          storage_reference?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_files_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "credit_contracts"
            referencedColumns: ["contract_id"]
          },
          {
            foreignKeyName: "contract_files_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_milestones: {
        Row: {
          contract_id: string
          created_at: string
          id: string
          milestone_label: string
          milestone_type: string
          reached_at: string | null
          reward_description: string | null
          target_value: number
        }
        Insert: {
          contract_id: string
          created_at?: string
          id?: string
          milestone_label: string
          milestone_type: string
          reached_at?: string | null
          reward_description?: string | null
          target_value: number
        }
        Update: {
          contract_id?: string
          created_at?: string
          id?: string
          milestone_label?: string
          milestone_type?: string
          reached_at?: string | null
          reward_description?: string | null
          target_value?: number
        }
        Relationships: [
          {
            foreignKeyName: "contract_milestones_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "rent_to_own_contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_payments: {
        Row: {
          amount: number
          contract_id: string
          created_at: string
          id: string
          notes: string | null
          payment_date: string
          status: string
          wave_transaction_id: string | null
          week_number: number
        }
        Insert: {
          amount: number
          contract_id: string
          created_at?: string
          id?: string
          notes?: string | null
          payment_date?: string
          status?: string
          wave_transaction_id?: string | null
          week_number: number
        }
        Update: {
          amount?: number
          contract_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          payment_date?: string
          status?: string
          wave_transaction_id?: string | null
          week_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "contract_payments_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "rent_to_own_contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_signature_events: {
        Row: {
          audit_event_id: string | null
          consent_summary_version: string | null
          consent_text_snapshot: string | null
          contract_id: string
          created_at: string
          customer_id: string | null
          device_metadata_json: Json
          event_at: string
          idempotency_key: string
          ip_address_encrypted: string | null
          language_displayed: string
          signature_event_id: string
          signature_method: string
          signature_provider: string
          signature_status: string
          signed_at: string | null
          signed_contract_hash: string | null
          signer_id: string | null
          signer_sequence: number
          signer_type: string
        }
        Insert: {
          audit_event_id?: string | null
          consent_summary_version?: string | null
          consent_text_snapshot?: string | null
          contract_id: string
          created_at?: string
          customer_id?: string | null
          device_metadata_json?: Json
          event_at?: string
          idempotency_key: string
          ip_address_encrypted?: string | null
          language_displayed?: string
          signature_event_id?: string
          signature_method?: string
          signature_provider?: string
          signature_status: string
          signed_at?: string | null
          signed_contract_hash?: string | null
          signer_id?: string | null
          signer_sequence?: number
          signer_type: string
        }
        Update: {
          audit_event_id?: string | null
          consent_summary_version?: string | null
          consent_text_snapshot?: string | null
          contract_id?: string
          created_at?: string
          customer_id?: string | null
          device_metadata_json?: Json
          event_at?: string
          idempotency_key?: string
          ip_address_encrypted?: string | null
          language_displayed?: string
          signature_event_id?: string
          signature_method?: string
          signature_provider?: string
          signature_status?: string
          signed_at?: string | null
          signed_contract_hash?: string | null
          signer_id?: string | null
          signer_sequence?: number
          signer_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_signature_events_audit_event_id_fkey"
            columns: ["audit_event_id"]
            isOneToOne: false
            referencedRelation: "contract_audit_events"
            referencedColumns: ["audit_event_id"]
          },
          {
            foreignKeyName: "contract_signature_events_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "credit_contracts"
            referencedColumns: ["contract_id"]
          },
          {
            foreignKeyName: "contract_signature_events_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_templates: {
        Row: {
          country: string
          created_at: string
          created_by: string | null
          customer_id: string | null
          effective_from: string
          effective_to: string | null
          language: string
          plain_language_summary: string
          product_id: string
          product_version_id: string | null
          required_fields_json: Json
          required_signers_json: Json
          status: string
          summary_version: string
          template_body: string
          template_id: string
          template_name: string
          template_type: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          country?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          effective_from?: string
          effective_to?: string | null
          language?: string
          plain_language_summary?: string
          product_id: string
          product_version_id?: string | null
          required_fields_json?: Json
          required_signers_json?: Json
          status?: string
          summary_version?: string
          template_body: string
          template_id?: string
          template_name: string
          template_type?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          country?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          effective_from?: string
          effective_to?: string | null
          language?: string
          plain_language_summary?: string
          product_id?: string
          product_version_id?: string | null
          required_fields_json?: Json
          required_signers_json?: Json
          status?: string
          summary_version?: string
          template_body?: string
          template_id?: string
          template_name?: string
          template_type?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "contract_templates_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_templates_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "credit_products"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "contract_templates_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_credit_product_performance"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "contract_templates_product_version_id_fkey"
            columns: ["product_version_id"]
            isOneToOne: false
            referencedRelation: "product_versions"
            referencedColumns: ["version_id"]
          },
        ]
      }
      credit_accounts: {
        Row: {
          activated_at: string
          activation_package_id: string
          asset_id: string | null
          created_at: string
          credit_account_id: string
          customer_id: string | null
          driver_id: string
          idempotency_key: string
          principal_amount: number
          principal_currency_code: string
          product_id: string
          product_version_id: string
          status: string
          status_changed_at: string
          updated_at: string
        }
        Insert: {
          activated_at?: string
          activation_package_id: string
          asset_id?: string | null
          created_at?: string
          credit_account_id?: string
          customer_id?: string | null
          driver_id: string
          idempotency_key: string
          principal_amount?: number
          principal_currency_code?: string
          product_id: string
          product_version_id: string
          status?: string
          status_changed_at?: string
          updated_at?: string
        }
        Update: {
          activated_at?: string
          activation_package_id?: string
          asset_id?: string | null
          created_at?: string
          credit_account_id?: string
          customer_id?: string | null
          driver_id?: string
          idempotency_key?: string
          principal_amount?: number
          principal_currency_code?: string
          product_id?: string
          product_version_id?: string
          status?: string
          status_changed_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_accounts_activation_package_id_fkey"
            columns: ["activation_package_id"]
            isOneToOne: true
            referencedRelation: "activation_packages"
            referencedColumns: ["package_id"]
          },
          {
            foreignKeyName: "credit_accounts_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "financed_assets"
            referencedColumns: ["asset_id"]
          },
          {
            foreignKeyName: "credit_accounts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_accounts_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_accounts_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "credit_products"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "credit_accounts_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_credit_product_performance"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "credit_accounts_product_version_id_fkey"
            columns: ["product_version_id"]
            isOneToOne: false
            referencedRelation: "product_versions"
            referencedColumns: ["version_id"]
          },
        ]
      }
      credit_agreements: {
        Row: {
          agreement_id: string
          agreement_snapshot: Json
          agreement_status: string
          application_id: string
          asset_id: string | null
          contract_hash: string | null
          contract_id: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          decision_id: string | null
          final_pdf_hash: string | null
          product_id: string | null
          product_version_id: string | null
          signature_hash: string | null
          signed_at: string | null
          signed_by_admin_id: string | null
          signed_by_driver_at: string | null
          snapshot_hash: string | null
          template_id: string | null
          template_version: number | null
        }
        Insert: {
          agreement_id?: string
          agreement_snapshot: Json
          agreement_status?: string
          application_id: string
          asset_id?: string | null
          contract_hash?: string | null
          contract_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          decision_id?: string | null
          final_pdf_hash?: string | null
          product_id?: string | null
          product_version_id?: string | null
          signature_hash?: string | null
          signed_at?: string | null
          signed_by_admin_id?: string | null
          signed_by_driver_at?: string | null
          snapshot_hash?: string | null
          template_id?: string | null
          template_version?: number | null
        }
        Update: {
          agreement_id?: string
          agreement_snapshot?: Json
          agreement_status?: string
          application_id?: string
          asset_id?: string | null
          contract_hash?: string | null
          contract_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          decision_id?: string | null
          final_pdf_hash?: string | null
          product_id?: string | null
          product_version_id?: string | null
          signature_hash?: string | null
          signed_at?: string | null
          signed_by_admin_id?: string | null
          signed_by_driver_at?: string | null
          snapshot_hash?: string | null
          template_id?: string | null
          template_version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "credit_agreements_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "credit_applications"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "credit_agreements_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "credit_contracts"
            referencedColumns: ["contract_id"]
          },
          {
            foreignKeyName: "credit_agreements_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_applications: {
        Row: {
          application_id: string
          created_at: string
          created_by: string | null
          customer_id: string | null
          down_payment_amount: number
          down_payment_currency_code: string
          driver_id: string
          eligibility_explanation: string
          eligibility_result: string
          expires_at: string | null
          idempotency_key: string
          kyc_reference_id: string | null
          product_id: string
          product_version_id: string
          requested_asset_id: string | null
          requested_terms_json: Json
          score_snapshot: number | null
          snapshot_id: string | null
          status: string
          status_changed_at: string
          submitted_at: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          application_id?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          down_payment_amount?: number
          down_payment_currency_code?: string
          driver_id: string
          eligibility_explanation?: string
          eligibility_result?: string
          expires_at?: string | null
          idempotency_key: string
          kyc_reference_id?: string | null
          product_id: string
          product_version_id: string
          requested_asset_id?: string | null
          requested_terms_json?: Json
          score_snapshot?: number | null
          snapshot_id?: string | null
          status?: string
          status_changed_at?: string
          submitted_at?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          application_id?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          down_payment_amount?: number
          down_payment_currency_code?: string
          driver_id?: string
          eligibility_explanation?: string
          eligibility_result?: string
          expires_at?: string | null
          idempotency_key?: string
          kyc_reference_id?: string | null
          product_id?: string
          product_version_id?: string
          requested_asset_id?: string | null
          requested_terms_json?: Json
          score_snapshot?: number | null
          snapshot_id?: string | null
          status?: string
          status_changed_at?: string
          submitted_at?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "credit_applications_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_applications_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_applications_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "credit_products"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "credit_applications_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_credit_product_performance"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "credit_applications_product_version_id_fkey"
            columns: ["product_version_id"]
            isOneToOne: false
            referencedRelation: "product_versions"
            referencedColumns: ["version_id"]
          },
          {
            foreignKeyName: "credit_applications_requested_asset_id_fkey"
            columns: ["requested_asset_id"]
            isOneToOne: false
            referencedRelation: "financed_assets"
            referencedColumns: ["asset_id"]
          },
          {
            foreignKeyName: "credit_applications_snapshot_fk"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "credit_snapshots"
            referencedColumns: ["snapshot_id"]
          },
        ]
      }
      credit_asset_assignments: {
        Row: {
          application_id: string | null
          asset_id: string
          assigned_by: string | null
          assignment_id: string
          assignment_status: string
          created_at: string
          credit_account_id: string | null
          customer_id: string | null
          idempotency_key: string
          release_reason: string | null
          released_at: string | null
          updated_at: string
        }
        Insert: {
          application_id?: string | null
          asset_id: string
          assigned_by?: string | null
          assignment_id?: string
          assignment_status?: string
          created_at?: string
          credit_account_id?: string | null
          customer_id?: string | null
          idempotency_key: string
          release_reason?: string | null
          released_at?: string | null
          updated_at?: string
        }
        Update: {
          application_id?: string | null
          asset_id?: string
          assigned_by?: string | null
          assignment_id?: string
          assignment_status?: string
          created_at?: string
          credit_account_id?: string | null
          customer_id?: string | null
          idempotency_key?: string
          release_reason?: string | null
          released_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_asset_assignments_account_fk"
            columns: ["credit_account_id"]
            isOneToOne: false
            referencedRelation: "credit_accounts"
            referencedColumns: ["credit_account_id"]
          },
          {
            foreignKeyName: "credit_asset_assignments_account_fk"
            columns: ["credit_account_id"]
            isOneToOne: false
            referencedRelation: "v_credit_portfolio_account_facts"
            referencedColumns: ["credit_account_id"]
          },
          {
            foreignKeyName: "credit_asset_assignments_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "credit_applications"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "credit_asset_assignments_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "financed_assets"
            referencedColumns: ["asset_id"]
          },
          {
            foreignKeyName: "credit_asset_assignments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_asset_protection_reviews: {
        Row: {
          asset_id: string | null
          asset_review_id: string
          created_at: string
          created_by: string | null
          credit_account_id: string
          customer_id: string | null
          default_review_id: string
          idempotency_key: string
          inspection_due_at: string | null
          inspection_required: boolean
          request_hash: string | null
          status: string
          trigger_reason: string
          updated_at: string
        }
        Insert: {
          asset_id?: string | null
          asset_review_id?: string
          created_at?: string
          created_by?: string | null
          credit_account_id: string
          customer_id?: string | null
          default_review_id: string
          idempotency_key: string
          inspection_due_at?: string | null
          inspection_required?: boolean
          request_hash?: string | null
          status?: string
          trigger_reason: string
          updated_at?: string
        }
        Update: {
          asset_id?: string | null
          asset_review_id?: string
          created_at?: string
          created_by?: string | null
          credit_account_id?: string
          customer_id?: string | null
          default_review_id?: string
          idempotency_key?: string
          inspection_due_at?: string | null
          inspection_required?: boolean
          request_hash?: string | null
          status?: string
          trigger_reason?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_asset_protection_reviews_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "financed_assets"
            referencedColumns: ["asset_id"]
          },
          {
            foreignKeyName: "credit_asset_protection_reviews_credit_account_id_fkey"
            columns: ["credit_account_id"]
            isOneToOne: false
            referencedRelation: "credit_accounts"
            referencedColumns: ["credit_account_id"]
          },
          {
            foreignKeyName: "credit_asset_protection_reviews_credit_account_id_fkey"
            columns: ["credit_account_id"]
            isOneToOne: false
            referencedRelation: "v_credit_portfolio_account_facts"
            referencedColumns: ["credit_account_id"]
          },
          {
            foreignKeyName: "credit_asset_protection_reviews_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_asset_protection_reviews_default_review_id_fkey"
            columns: ["default_review_id"]
            isOneToOne: false
            referencedRelation: "credit_default_reviews"
            referencedColumns: ["default_review_id"]
          },
          {
            foreignKeyName: "credit_asset_protection_reviews_default_review_id_fkey"
            columns: ["default_review_id"]
            isOneToOne: false
            referencedRelation: "v_credit_default_review_queue"
            referencedColumns: ["default_review_id"]
          },
        ]
      }
      credit_audit_events: {
        Row: {
          action: string
          actor_id: string | null
          actor_type: string
          after_state: Json
          audit_id: string
          before_state: Json
          created_at: string
          customer_id: string | null
          entity_id: string | null
          entity_type: string
          idempotency_key: string | null
          metadata: Json
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_type?: string
          after_state?: Json
          audit_id?: string
          before_state?: Json
          created_at?: string
          customer_id?: string | null
          entity_id?: string | null
          entity_type: string
          idempotency_key?: string | null
          metadata?: Json
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_type?: string
          after_state?: Json
          audit_id?: string
          before_state?: Json
          created_at?: string
          customer_id?: string | null
          entity_id?: string | null
          entity_type?: string
          idempotency_key?: string | null
          metadata?: Json
        }
        Relationships: [
          {
            foreignKeyName: "credit_audit_events_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_collection_actions: {
        Row: {
          action_id: string
          action_note: string | null
          action_type: string
          actor_id: string | null
          case_id: string
          created_at: string
          customer_id: string | null
          driver_visible: boolean
          idempotency_key: string | null
        }
        Insert: {
          action_id?: string
          action_note?: string | null
          action_type: string
          actor_id?: string | null
          case_id: string
          created_at?: string
          customer_id?: string | null
          driver_visible?: boolean
          idempotency_key?: string | null
        }
        Update: {
          action_id?: string
          action_note?: string | null
          action_type?: string
          actor_id?: string | null
          case_id?: string
          created_at?: string
          customer_id?: string | null
          driver_visible?: boolean
          idempotency_key?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "credit_collection_actions_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "credit_collections_cases"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "credit_collection_actions_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "v_credit_collections_queue"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "credit_collection_actions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_collections_audit_events: {
        Row: {
          actor_id: string | null
          after_json: Json
          audit_event_id: string
          before_json: Json
          case_id: string | null
          created_at: string
          credit_account_id: string | null
          customer_id: string | null
          event_type: string
          idempotency_key: string | null
          obligation_id: string | null
          reason: string | null
          request_hash: string | null
        }
        Insert: {
          actor_id?: string | null
          after_json?: Json
          audit_event_id?: string
          before_json?: Json
          case_id?: string | null
          created_at?: string
          credit_account_id?: string | null
          customer_id?: string | null
          event_type: string
          idempotency_key?: string | null
          obligation_id?: string | null
          reason?: string | null
          request_hash?: string | null
        }
        Update: {
          actor_id?: string | null
          after_json?: Json
          audit_event_id?: string
          before_json?: Json
          case_id?: string | null
          created_at?: string
          credit_account_id?: string | null
          customer_id?: string | null
          event_type?: string
          idempotency_key?: string | null
          obligation_id?: string | null
          reason?: string | null
          request_hash?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "credit_collections_audit_events_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "credit_collections_cases"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "credit_collections_audit_events_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "v_credit_collections_queue"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "credit_collections_audit_events_credit_account_id_fkey"
            columns: ["credit_account_id"]
            isOneToOne: false
            referencedRelation: "credit_accounts"
            referencedColumns: ["credit_account_id"]
          },
          {
            foreignKeyName: "credit_collections_audit_events_credit_account_id_fkey"
            columns: ["credit_account_id"]
            isOneToOne: false
            referencedRelation: "v_credit_portfolio_account_facts"
            referencedColumns: ["credit_account_id"]
          },
          {
            foreignKeyName: "credit_collections_audit_events_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_collections_audit_events_obligation_id_fkey"
            columns: ["obligation_id"]
            isOneToOne: false
            referencedRelation: "scheduled_obligations"
            referencedColumns: ["obligation_id"]
          },
        ]
      }
      credit_collections_cases: {
        Row: {
          assigned_to: string | null
          case_id: string
          closed_at: string | null
          closure_reason: string | null
          created_at: string
          created_by: string | null
          credit_account_id: string
          currency_code: string
          current_status: string
          customer_id: string | null
          days_past_due: number
          delinquency_status: string
          driver_id: string
          escalation_level: number
          idempotency_key: string
          invoice_id: string | null
          obligation_id: string | null
          opened_at: string
          priority_score: number
          product_id: string
          product_version_id: string | null
          request_hash: string | null
          risk_level: string
          rules_snapshot_json: Json
          schedule_id: string | null
          score_impact: number
          severity: string
          status_changed_at: string
          total_past_due_amount: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          assigned_to?: string | null
          case_id?: string
          closed_at?: string | null
          closure_reason?: string | null
          created_at?: string
          created_by?: string | null
          credit_account_id: string
          currency_code?: string
          current_status?: string
          customer_id?: string | null
          days_past_due?: number
          delinquency_status?: string
          driver_id: string
          escalation_level?: number
          idempotency_key: string
          invoice_id?: string | null
          obligation_id?: string | null
          opened_at?: string
          priority_score?: number
          product_id: string
          product_version_id?: string | null
          request_hash?: string | null
          risk_level?: string
          rules_snapshot_json?: Json
          schedule_id?: string | null
          score_impact?: number
          severity?: string
          status_changed_at?: string
          total_past_due_amount?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          assigned_to?: string | null
          case_id?: string
          closed_at?: string | null
          closure_reason?: string | null
          created_at?: string
          created_by?: string | null
          credit_account_id?: string
          currency_code?: string
          current_status?: string
          customer_id?: string | null
          days_past_due?: number
          delinquency_status?: string
          driver_id?: string
          escalation_level?: number
          idempotency_key?: string
          invoice_id?: string | null
          obligation_id?: string | null
          opened_at?: string
          priority_score?: number
          product_id?: string
          product_version_id?: string | null
          request_hash?: string | null
          risk_level?: string
          rules_snapshot_json?: Json
          schedule_id?: string | null
          score_impact?: number
          severity?: string
          status_changed_at?: string
          total_past_due_amount?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "credit_collections_cases_credit_account_id_fkey"
            columns: ["credit_account_id"]
            isOneToOne: false
            referencedRelation: "credit_accounts"
            referencedColumns: ["credit_account_id"]
          },
          {
            foreignKeyName: "credit_collections_cases_credit_account_id_fkey"
            columns: ["credit_account_id"]
            isOneToOne: false
            referencedRelation: "v_credit_portfolio_account_facts"
            referencedColumns: ["credit_account_id"]
          },
          {
            foreignKeyName: "credit_collections_cases_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_collections_cases_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_collections_cases_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoice"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_collections_cases_obligation_id_fkey"
            columns: ["obligation_id"]
            isOneToOne: false
            referencedRelation: "scheduled_obligations"
            referencedColumns: ["obligation_id"]
          },
          {
            foreignKeyName: "credit_collections_cases_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "credit_products"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "credit_collections_cases_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_credit_product_performance"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "credit_collections_cases_product_version_id_fkey"
            columns: ["product_version_id"]
            isOneToOne: false
            referencedRelation: "product_versions"
            referencedColumns: ["version_id"]
          },
          {
            foreignKeyName: "credit_collections_cases_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "repayment_schedules"
            referencedColumns: ["schedule_id"]
          },
        ]
      }
      credit_contracts: {
        Row: {
          admin_signed_at: string | null
          application_id: string
          asset_id: string | null
          contract_hash: string
          contract_id: string
          contract_snapshot_json: Json
          contract_status: string
          created_at: string
          created_by: string | null
          credit_account_id: string | null
          customer_id: string | null
          decision_id: string
          decline_reason: string | null
          declined_at: string | null
          driver_id: string
          driver_signed_at: string | null
          expires_at: string | null
          final_pdf_hash: string | null
          fully_executed_at: string | null
          idempotency_key: string
          product_id: string
          product_version_id: string
          sent_at: string | null
          signature_hash: string | null
          signature_provider: string
          snapshot_hash: string
          status_changed_at: string
          superseded_by_contract_id: string | null
          template_id: string
          template_version: number
          updated_at: string
          updated_by: string | null
          viewed_at: string | null
          void_reason: string | null
          voided_at: string | null
        }
        Insert: {
          admin_signed_at?: string | null
          application_id: string
          asset_id?: string | null
          contract_hash: string
          contract_id?: string
          contract_snapshot_json: Json
          contract_status?: string
          created_at?: string
          created_by?: string | null
          credit_account_id?: string | null
          customer_id?: string | null
          decision_id: string
          decline_reason?: string | null
          declined_at?: string | null
          driver_id: string
          driver_signed_at?: string | null
          expires_at?: string | null
          final_pdf_hash?: string | null
          fully_executed_at?: string | null
          idempotency_key: string
          product_id: string
          product_version_id: string
          sent_at?: string | null
          signature_hash?: string | null
          signature_provider?: string
          snapshot_hash: string
          status_changed_at?: string
          superseded_by_contract_id?: string | null
          template_id: string
          template_version: number
          updated_at?: string
          updated_by?: string | null
          viewed_at?: string | null
          void_reason?: string | null
          voided_at?: string | null
        }
        Update: {
          admin_signed_at?: string | null
          application_id?: string
          asset_id?: string | null
          contract_hash?: string
          contract_id?: string
          contract_snapshot_json?: Json
          contract_status?: string
          created_at?: string
          created_by?: string | null
          credit_account_id?: string | null
          customer_id?: string | null
          decision_id?: string
          decline_reason?: string | null
          declined_at?: string | null
          driver_id?: string
          driver_signed_at?: string | null
          expires_at?: string | null
          final_pdf_hash?: string | null
          fully_executed_at?: string | null
          idempotency_key?: string
          product_id?: string
          product_version_id?: string
          sent_at?: string | null
          signature_hash?: string | null
          signature_provider?: string
          snapshot_hash?: string
          status_changed_at?: string
          superseded_by_contract_id?: string | null
          template_id?: string
          template_version?: number
          updated_at?: string
          updated_by?: string | null
          viewed_at?: string | null
          void_reason?: string | null
          voided_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "credit_contracts_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "credit_applications"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "credit_contracts_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "financed_assets"
            referencedColumns: ["asset_id"]
          },
          {
            foreignKeyName: "credit_contracts_credit_account_id_fkey"
            columns: ["credit_account_id"]
            isOneToOne: false
            referencedRelation: "credit_accounts"
            referencedColumns: ["credit_account_id"]
          },
          {
            foreignKeyName: "credit_contracts_credit_account_id_fkey"
            columns: ["credit_account_id"]
            isOneToOne: false
            referencedRelation: "v_credit_portfolio_account_facts"
            referencedColumns: ["credit_account_id"]
          },
          {
            foreignKeyName: "credit_contracts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_contracts_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "underwriting_decisions"
            referencedColumns: ["decision_id"]
          },
          {
            foreignKeyName: "credit_contracts_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_contracts_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "credit_products"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "credit_contracts_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_credit_product_performance"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "credit_contracts_product_version_id_fkey"
            columns: ["product_version_id"]
            isOneToOne: false
            referencedRelation: "product_versions"
            referencedColumns: ["version_id"]
          },
          {
            foreignKeyName: "credit_contracts_superseded_by_contract_id_fkey"
            columns: ["superseded_by_contract_id"]
            isOneToOne: false
            referencedRelation: "credit_contracts"
            referencedColumns: ["contract_id"]
          },
          {
            foreignKeyName: "credit_contracts_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "contract_templates"
            referencedColumns: ["template_id"]
          },
        ]
      }
      credit_decisions: {
        Row: {
          application_id: string
          conditions_json: Json
          created_at: string
          customer_id: string | null
          decision: string
          decision_id: string
          decision_reason_code: string
          decision_timestamp: string
          explanation: string
          idempotency_key: string
          reviewer_id: string | null
          updated_at: string
        }
        Insert: {
          application_id: string
          conditions_json?: Json
          created_at?: string
          customer_id?: string | null
          decision: string
          decision_id?: string
          decision_reason_code: string
          decision_timestamp?: string
          explanation: string
          idempotency_key: string
          reviewer_id?: string | null
          updated_at?: string
        }
        Update: {
          application_id?: string
          conditions_json?: Json
          created_at?: string
          customer_id?: string | null
          decision?: string
          decision_id?: string
          decision_reason_code?: string
          decision_timestamp?: string
          explanation?: string
          idempotency_key?: string
          reviewer_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_decisions_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "credit_applications"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "credit_decisions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_default_audit_events: {
        Row: {
          actor_id: string | null
          after_json: Json
          audit_event_id: string
          before_json: Json
          created_at: string
          credit_account_id: string | null
          customer_id: string | null
          default_review_id: string | null
          event_type: string
          idempotency_key: string | null
          reason: string | null
          request_hash: string | null
        }
        Insert: {
          actor_id?: string | null
          after_json?: Json
          audit_event_id?: string
          before_json?: Json
          created_at?: string
          credit_account_id?: string | null
          customer_id?: string | null
          default_review_id?: string | null
          event_type: string
          idempotency_key?: string | null
          reason?: string | null
          request_hash?: string | null
        }
        Update: {
          actor_id?: string | null
          after_json?: Json
          audit_event_id?: string
          before_json?: Json
          created_at?: string
          credit_account_id?: string | null
          customer_id?: string | null
          default_review_id?: string | null
          event_type?: string
          idempotency_key?: string | null
          reason?: string | null
          request_hash?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "credit_default_audit_events_credit_account_id_fkey"
            columns: ["credit_account_id"]
            isOneToOne: false
            referencedRelation: "credit_accounts"
            referencedColumns: ["credit_account_id"]
          },
          {
            foreignKeyName: "credit_default_audit_events_credit_account_id_fkey"
            columns: ["credit_account_id"]
            isOneToOne: false
            referencedRelation: "v_credit_portfolio_account_facts"
            referencedColumns: ["credit_account_id"]
          },
          {
            foreignKeyName: "credit_default_audit_events_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_default_audit_events_default_review_id_fkey"
            columns: ["default_review_id"]
            isOneToOne: false
            referencedRelation: "credit_default_reviews"
            referencedColumns: ["default_review_id"]
          },
          {
            foreignKeyName: "credit_default_audit_events_default_review_id_fkey"
            columns: ["default_review_id"]
            isOneToOne: false
            referencedRelation: "v_credit_default_review_queue"
            referencedColumns: ["default_review_id"]
          },
        ]
      }
      credit_default_decisions: {
        Row: {
          approved_by: string | null
          created_at: string
          credit_account_id: string
          customer_id: string | null
          decision: string
          decision_reason: string
          decision_summary: string | null
          decision_timestamp: string
          default_decision_id: string
          default_review_id: string
          driver_notice_required: boolean
          driver_notice_sent_at: string | null
          idempotency_key: string
          request_hash: string | null
          second_approver_id: string | null
          updated_at: string
        }
        Insert: {
          approved_by?: string | null
          created_at?: string
          credit_account_id: string
          customer_id?: string | null
          decision: string
          decision_reason: string
          decision_summary?: string | null
          decision_timestamp?: string
          default_decision_id?: string
          default_review_id: string
          driver_notice_required?: boolean
          driver_notice_sent_at?: string | null
          idempotency_key: string
          request_hash?: string | null
          second_approver_id?: string | null
          updated_at?: string
        }
        Update: {
          approved_by?: string | null
          created_at?: string
          credit_account_id?: string
          customer_id?: string | null
          decision?: string
          decision_reason?: string
          decision_summary?: string | null
          decision_timestamp?: string
          default_decision_id?: string
          default_review_id?: string
          driver_notice_required?: boolean
          driver_notice_sent_at?: string | null
          idempotency_key?: string
          request_hash?: string | null
          second_approver_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_default_decisions_credit_account_id_fkey"
            columns: ["credit_account_id"]
            isOneToOne: false
            referencedRelation: "credit_accounts"
            referencedColumns: ["credit_account_id"]
          },
          {
            foreignKeyName: "credit_default_decisions_credit_account_id_fkey"
            columns: ["credit_account_id"]
            isOneToOne: false
            referencedRelation: "v_credit_portfolio_account_facts"
            referencedColumns: ["credit_account_id"]
          },
          {
            foreignKeyName: "credit_default_decisions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_default_decisions_default_review_id_fkey"
            columns: ["default_review_id"]
            isOneToOne: false
            referencedRelation: "credit_default_reviews"
            referencedColumns: ["default_review_id"]
          },
          {
            foreignKeyName: "credit_default_decisions_default_review_id_fkey"
            columns: ["default_review_id"]
            isOneToOne: false
            referencedRelation: "v_credit_default_review_queue"
            referencedColumns: ["default_review_id"]
          },
        ]
      }
      credit_default_evidence: {
        Row: {
          created_at: string
          created_by: string | null
          credit_account_id: string
          customer_id: string | null
          default_review_id: string
          evidence_id: string
          evidence_summary: string
          evidence_type: string
          idempotency_key: string
          locked_at: string | null
          request_hash: string | null
          source_reference_id: string | null
          source_reference_type: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          credit_account_id: string
          customer_id?: string | null
          default_review_id: string
          evidence_id?: string
          evidence_summary: string
          evidence_type: string
          idempotency_key: string
          locked_at?: string | null
          request_hash?: string | null
          source_reference_id?: string | null
          source_reference_type?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          credit_account_id?: string
          customer_id?: string | null
          default_review_id?: string
          evidence_id?: string
          evidence_summary?: string
          evidence_type?: string
          idempotency_key?: string
          locked_at?: string | null
          request_hash?: string | null
          source_reference_id?: string | null
          source_reference_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "credit_default_evidence_credit_account_id_fkey"
            columns: ["credit_account_id"]
            isOneToOne: false
            referencedRelation: "credit_accounts"
            referencedColumns: ["credit_account_id"]
          },
          {
            foreignKeyName: "credit_default_evidence_credit_account_id_fkey"
            columns: ["credit_account_id"]
            isOneToOne: false
            referencedRelation: "v_credit_portfolio_account_facts"
            referencedColumns: ["credit_account_id"]
          },
          {
            foreignKeyName: "credit_default_evidence_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_default_evidence_default_review_id_fkey"
            columns: ["default_review_id"]
            isOneToOne: false
            referencedRelation: "credit_default_reviews"
            referencedColumns: ["default_review_id"]
          },
          {
            foreignKeyName: "credit_default_evidence_default_review_id_fkey"
            columns: ["default_review_id"]
            isOneToOne: false
            referencedRelation: "v_credit_default_review_queue"
            referencedColumns: ["default_review_id"]
          },
        ]
      }
      credit_default_notices: {
        Row: {
          amount_affected: number
          channel: string
          created_at: string
          credit_account_id: string
          currency_code: string
          customer_id: string | null
          deadline_at: string | null
          default_review_id: string
          driver_id: string
          idempotency_key: string
          notice_id: string
          notice_status: string
          notice_summary: string
          notice_type: string
          notification_id: string | null
          reason: string
          request_hash: string | null
          required_action: string
          sent_at: string | null
          support_instruction: string
          updated_at: string
        }
        Insert: {
          amount_affected?: number
          channel?: string
          created_at?: string
          credit_account_id: string
          currency_code?: string
          customer_id?: string | null
          deadline_at?: string | null
          default_review_id: string
          driver_id: string
          idempotency_key: string
          notice_id?: string
          notice_status?: string
          notice_summary: string
          notice_type: string
          notification_id?: string | null
          reason: string
          request_hash?: string | null
          required_action: string
          sent_at?: string | null
          support_instruction?: string
          updated_at?: string
        }
        Update: {
          amount_affected?: number
          channel?: string
          created_at?: string
          credit_account_id?: string
          currency_code?: string
          customer_id?: string | null
          deadline_at?: string | null
          default_review_id?: string
          driver_id?: string
          idempotency_key?: string
          notice_id?: string
          notice_status?: string
          notice_summary?: string
          notice_type?: string
          notification_id?: string | null
          reason?: string
          request_hash?: string | null
          required_action?: string
          sent_at?: string | null
          support_instruction?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_default_notices_credit_account_id_fkey"
            columns: ["credit_account_id"]
            isOneToOne: false
            referencedRelation: "credit_accounts"
            referencedColumns: ["credit_account_id"]
          },
          {
            foreignKeyName: "credit_default_notices_credit_account_id_fkey"
            columns: ["credit_account_id"]
            isOneToOne: false
            referencedRelation: "v_credit_portfolio_account_facts"
            referencedColumns: ["credit_account_id"]
          },
          {
            foreignKeyName: "credit_default_notices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_default_notices_default_review_id_fkey"
            columns: ["default_review_id"]
            isOneToOne: false
            referencedRelation: "credit_default_reviews"
            referencedColumns: ["default_review_id"]
          },
          {
            foreignKeyName: "credit_default_notices_default_review_id_fkey"
            columns: ["default_review_id"]
            isOneToOne: false
            referencedRelation: "v_credit_default_review_queue"
            referencedColumns: ["default_review_id"]
          },
          {
            foreignKeyName: "credit_default_notices_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_default_notices_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_default_reviews: {
        Row: {
          assigned_reviewer: string | null
          closed_at: string | null
          closure_reason: string | null
          collections_case_id: string
          created_at: string
          created_by: string | null
          credit_account_id: string
          currency_code: string
          customer_id: string | null
          days_past_due: number
          decision_due_at: string | null
          default_review_id: string
          driver_id: string
          evidence_status: string
          idempotency_key: string
          opened_at: string
          past_due_amount: number
          product_id: string
          request_hash: string | null
          status: string
          status_changed_at: string
          trigger_reason: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          assigned_reviewer?: string | null
          closed_at?: string | null
          closure_reason?: string | null
          collections_case_id: string
          created_at?: string
          created_by?: string | null
          credit_account_id: string
          currency_code?: string
          customer_id?: string | null
          days_past_due?: number
          decision_due_at?: string | null
          default_review_id?: string
          driver_id: string
          evidence_status?: string
          idempotency_key: string
          opened_at?: string
          past_due_amount?: number
          product_id: string
          request_hash?: string | null
          status?: string
          status_changed_at?: string
          trigger_reason: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          assigned_reviewer?: string | null
          closed_at?: string | null
          closure_reason?: string | null
          collections_case_id?: string
          created_at?: string
          created_by?: string | null
          credit_account_id?: string
          currency_code?: string
          customer_id?: string | null
          days_past_due?: number
          decision_due_at?: string | null
          default_review_id?: string
          driver_id?: string
          evidence_status?: string
          idempotency_key?: string
          opened_at?: string
          past_due_amount?: number
          product_id?: string
          request_hash?: string | null
          status?: string
          status_changed_at?: string
          trigger_reason?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "credit_default_reviews_collections_case_id_fkey"
            columns: ["collections_case_id"]
            isOneToOne: false
            referencedRelation: "credit_collections_cases"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "credit_default_reviews_collections_case_id_fkey"
            columns: ["collections_case_id"]
            isOneToOne: false
            referencedRelation: "v_credit_collections_queue"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "credit_default_reviews_credit_account_id_fkey"
            columns: ["credit_account_id"]
            isOneToOne: false
            referencedRelation: "credit_accounts"
            referencedColumns: ["credit_account_id"]
          },
          {
            foreignKeyName: "credit_default_reviews_credit_account_id_fkey"
            columns: ["credit_account_id"]
            isOneToOne: false
            referencedRelation: "v_credit_portfolio_account_facts"
            referencedColumns: ["credit_account_id"]
          },
          {
            foreignKeyName: "credit_default_reviews_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_default_reviews_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_default_reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "credit_products"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "credit_default_reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_credit_product_performance"
            referencedColumns: ["product_id"]
          },
        ]
      }
      credit_exposure_profiles: {
        Row: {
          available_exposure: number
          created_at: string
          currency_code: string
          current_exposure: number
          customer_id: string
          driver_id: string
          last_calculated_at: string | null
          maximum_exposure_limit: number
          updated_at: string
        }
        Insert: {
          available_exposure?: number
          created_at?: string
          currency_code?: string
          current_exposure?: number
          customer_id: string
          driver_id: string
          last_calculated_at?: string | null
          maximum_exposure_limit?: number
          updated_at?: string
        }
        Update: {
          available_exposure?: number
          created_at?: string
          currency_code?: string
          current_exposure?: number
          customer_id?: string
          driver_id?: string
          last_calculated_at?: string | null
          maximum_exposure_limit?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_exposure_profiles_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_exposure_profiles_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_policy_sets: {
        Row: {
          approval_authority_json: Json
          created_at: string
          created_by: string | null
          customer_id: string | null
          decision_matrix_json: Json
          effective_from: string
          effective_to: string | null
          policy_id: string
          policy_json: Json
          policy_name: string
          policy_type: string
          product_id: string | null
          rules_json: Json
          status: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          approval_authority_json?: Json
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          decision_matrix_json?: Json
          effective_from?: string
          effective_to?: string | null
          policy_id?: string
          policy_json?: Json
          policy_name: string
          policy_type: string
          product_id?: string | null
          rules_json?: Json
          status?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          approval_authority_json?: Json
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          decision_matrix_json?: Json
          effective_from?: string
          effective_to?: string | null
          policy_id?: string
          policy_json?: Json
          policy_name?: string
          policy_type?: string
          product_id?: string | null
          rules_json?: Json
          status?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "credit_policy_sets_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_policy_sets_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "credit_products"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "credit_policy_sets_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_credit_product_performance"
            referencedColumns: ["product_id"]
          },
        ]
      }
      credit_products: {
        Row: {
          activation_rules_json: Json
          approval_rules_json: Json
          asset_rules_json: Json
          created_at: string
          created_by: string | null
          customer_id: string | null
          description: string | null
          down_payment_rules_json: Json
          eligibility_rules_json: Json
          name: string
          product_id: string
          product_type: string
          rules_json: Json
          status: string
          term_rules_json: Json
          updated_at: string
          updated_by: string | null
          vendor_id: string | null
          visibility_rules_json: Json
        }
        Insert: {
          activation_rules_json?: Json
          approval_rules_json?: Json
          asset_rules_json?: Json
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          description?: string | null
          down_payment_rules_json?: Json
          eligibility_rules_json?: Json
          name: string
          product_id?: string
          product_type: string
          rules_json?: Json
          status?: string
          term_rules_json?: Json
          updated_at?: string
          updated_by?: string | null
          vendor_id?: string | null
          visibility_rules_json?: Json
        }
        Update: {
          activation_rules_json?: Json
          approval_rules_json?: Json
          asset_rules_json?: Json
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          description?: string | null
          down_payment_rules_json?: Json
          eligibility_rules_json?: Json
          name?: string
          product_id?: string
          product_type?: string
          rules_json?: Json
          status?: string
          term_rules_json?: Json
          updated_at?: string
          updated_by?: string | null
          vendor_id?: string | null
          visibility_rules_json?: Json
        }
        Relationships: [
          {
            foreignKeyName: "credit_products_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_products_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["vendor_id"]
          },
        ]
      }
      credit_promises_to_pay: {
        Row: {
          broken_at: string | null
          case_id: string
          created_at: string
          created_by: string | null
          currency_code: string
          customer_id: string | null
          driver_id: string
          fulfilled_at: string | null
          idempotency_key: string
          promise_id: string
          promise_status: string
          promised_amount: number
          promised_payment_date: string
          request_hash: string | null
          updated_at: string
        }
        Insert: {
          broken_at?: string | null
          case_id: string
          created_at?: string
          created_by?: string | null
          currency_code?: string
          customer_id?: string | null
          driver_id: string
          fulfilled_at?: string | null
          idempotency_key: string
          promise_id?: string
          promise_status?: string
          promised_amount: number
          promised_payment_date: string
          request_hash?: string | null
          updated_at?: string
        }
        Update: {
          broken_at?: string | null
          case_id?: string
          created_at?: string
          created_by?: string | null
          currency_code?: string
          customer_id?: string | null
          driver_id?: string
          fulfilled_at?: string | null
          idempotency_key?: string
          promise_id?: string
          promise_status?: string
          promised_amount?: number
          promised_payment_date?: string
          request_hash?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_promises_to_pay_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "credit_collections_cases"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "credit_promises_to_pay_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "v_credit_collections_queue"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "credit_promises_to_pay_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_promises_to_pay_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_recovery_plans: {
        Row: {
          approved_by: string | null
          created_at: string
          created_by: string | null
          credit_account_id: string
          customer_id: string | null
          default_review_id: string
          driver_id: string
          due_date: string
          idempotency_key: string
          plan_status: string
          recovery_plan_id: string
          request_hash: string | null
          required_action_json: Json
          updated_at: string
        }
        Insert: {
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          credit_account_id: string
          customer_id?: string | null
          default_review_id: string
          driver_id: string
          due_date: string
          idempotency_key: string
          plan_status?: string
          recovery_plan_id?: string
          request_hash?: string | null
          required_action_json?: Json
          updated_at?: string
        }
        Update: {
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          credit_account_id?: string
          customer_id?: string | null
          default_review_id?: string
          driver_id?: string
          due_date?: string
          idempotency_key?: string
          plan_status?: string
          recovery_plan_id?: string
          request_hash?: string | null
          required_action_json?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_recovery_plans_credit_account_id_fkey"
            columns: ["credit_account_id"]
            isOneToOne: false
            referencedRelation: "credit_accounts"
            referencedColumns: ["credit_account_id"]
          },
          {
            foreignKeyName: "credit_recovery_plans_credit_account_id_fkey"
            columns: ["credit_account_id"]
            isOneToOne: false
            referencedRelation: "v_credit_portfolio_account_facts"
            referencedColumns: ["credit_account_id"]
          },
          {
            foreignKeyName: "credit_recovery_plans_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_recovery_plans_default_review_id_fkey"
            columns: ["default_review_id"]
            isOneToOne: false
            referencedRelation: "credit_default_reviews"
            referencedColumns: ["default_review_id"]
          },
          {
            foreignKeyName: "credit_recovery_plans_default_review_id_fkey"
            columns: ["default_review_id"]
            isOneToOne: false
            referencedRelation: "v_credit_default_review_queue"
            referencedColumns: ["default_review_id"]
          },
          {
            foreignKeyName: "credit_recovery_plans_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_reminders: {
        Row: {
          case_id: string | null
          channel: string
          created_at: string
          customer_id: string | null
          driver_id: string
          idempotency_key: string
          notification_id: string | null
          obligation_id: string | null
          reminder_id: string
          reminder_type: string
          request_hash: string | null
          sent_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          case_id?: string | null
          channel?: string
          created_at?: string
          customer_id?: string | null
          driver_id: string
          idempotency_key: string
          notification_id?: string | null
          obligation_id?: string | null
          reminder_id?: string
          reminder_type: string
          request_hash?: string | null
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          case_id?: string | null
          channel?: string
          created_at?: string
          customer_id?: string | null
          driver_id?: string
          idempotency_key?: string
          notification_id?: string | null
          obligation_id?: string | null
          reminder_id?: string
          reminder_type?: string
          request_hash?: string | null
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_reminders_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "credit_collections_cases"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "credit_reminders_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "v_credit_collections_queue"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "credit_reminders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_reminders_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_reminders_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_reminders_obligation_id_fkey"
            columns: ["obligation_id"]
            isOneToOne: false
            referencedRelation: "scheduled_obligations"
            referencedColumns: ["obligation_id"]
          },
        ]
      }
      credit_risk_escalations: {
        Row: {
          case_id: string
          created_at: string
          created_by: string | null
          credit_account_id: string
          customer_id: string | null
          driver_id: string
          escalation_id: string
          escalation_type: string
          idempotency_key: string
          reason: string
          request_hash: string | null
          score_event_id: string | null
          severity: string
          status: string
          updated_at: string
        }
        Insert: {
          case_id: string
          created_at?: string
          created_by?: string | null
          credit_account_id: string
          customer_id?: string | null
          driver_id: string
          escalation_id?: string
          escalation_type: string
          idempotency_key: string
          reason: string
          request_hash?: string | null
          score_event_id?: string | null
          severity?: string
          status?: string
          updated_at?: string
        }
        Update: {
          case_id?: string
          created_at?: string
          created_by?: string | null
          credit_account_id?: string
          customer_id?: string | null
          driver_id?: string
          escalation_id?: string
          escalation_type?: string
          idempotency_key?: string
          reason?: string
          request_hash?: string | null
          score_event_id?: string | null
          severity?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_risk_escalations_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "credit_collections_cases"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "credit_risk_escalations_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "v_credit_collections_queue"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "credit_risk_escalations_credit_account_id_fkey"
            columns: ["credit_account_id"]
            isOneToOne: false
            referencedRelation: "credit_accounts"
            referencedColumns: ["credit_account_id"]
          },
          {
            foreignKeyName: "credit_risk_escalations_credit_account_id_fkey"
            columns: ["credit_account_id"]
            isOneToOne: false
            referencedRelation: "v_credit_portfolio_account_facts"
            referencedColumns: ["credit_account_id"]
          },
          {
            foreignKeyName: "credit_risk_escalations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_risk_escalations_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_risk_escalations_score_event_id_fkey"
            columns: ["score_event_id"]
            isOneToOne: false
            referencedRelation: "driver_score_events"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_score_breakdowns: {
        Row: {
          credit_score_id: string
          data_available: boolean
          factor: string
          id: string
          impact_points: number
          normalized_value: number | null
          notes: string | null
          raw_value: number | null
          weight_applied: number
        }
        Insert: {
          credit_score_id: string
          data_available?: boolean
          factor: string
          id?: string
          impact_points: number
          normalized_value?: number | null
          notes?: string | null
          raw_value?: number | null
          weight_applied: number
        }
        Update: {
          credit_score_id?: string
          data_available?: boolean
          factor?: string
          id?: string
          impact_points?: number
          normalized_value?: number | null
          notes?: string | null
          raw_value?: number | null
          weight_applied?: number
        }
        Relationships: [
          {
            foreignKeyName: "credit_score_breakdowns_credit_score_id_fkey"
            columns: ["credit_score_id"]
            isOneToOne: false
            referencedRelation: "credit_scores"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_scores: {
        Row: {
          calculation_week: string
          created_at: string
          customer_id: string | null
          driver_id: string
          driving_data_available: boolean
          driving_impact: number | null
          id: string
          income_data_available: boolean
          income_impact: number | null
          income_source: string | null
          payment_data_available: boolean
          payment_impact: number | null
          score: number
          status: string
          tier: string
        }
        Insert: {
          calculation_week: string
          created_at?: string
          customer_id?: string | null
          driver_id: string
          driving_data_available?: boolean
          driving_impact?: number | null
          id?: string
          income_data_available?: boolean
          income_impact?: number | null
          income_source?: string | null
          payment_data_available?: boolean
          payment_impact?: number | null
          score: number
          status?: string
          tier: string
        }
        Update: {
          calculation_week?: string
          created_at?: string
          customer_id?: string | null
          driver_id?: string
          driving_data_available?: boolean
          driving_impact?: number | null
          id?: string
          income_data_available?: boolean
          income_impact?: number | null
          income_source?: string | null
          payment_data_available?: boolean
          payment_impact?: number | null
          score?: number
          status?: string
          tier?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_scores_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_scores_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_snapshots: {
        Row: {
          application_id: string
          created_at: string
          created_by: string | null
          customer_id: string | null
          snapshot_id: string
          snapshot_json: Json
        }
        Insert: {
          application_id: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          snapshot_id?: string
          snapshot_json: Json
        }
        Update: {
          application_id?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          snapshot_id?: string
          snapshot_json?: Json
        }
        Relationships: [
          {
            foreignKeyName: "credit_snapshots_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: true
            referencedRelation: "credit_applications"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "credit_snapshots_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_billing_settings: {
        Row: {
          auto_invoicing: boolean
          created_at: string
          customer_id: string
          daily_invoicing_enabled: boolean
          id: string
          invoice_slug: string
          legal_address: string | null
          legal_footer: string | null
          legal_logo_url: string | null
          legal_name: string | null
          legal_nif: string | null
          legal_rccm: string | null
          module_enabled: boolean
          updated_at: string
          vat_enabled: boolean
          vat_rate: number
        }
        Insert: {
          auto_invoicing?: boolean
          created_at?: string
          customer_id: string
          daily_invoicing_enabled?: boolean
          id?: string
          invoice_slug: string
          legal_address?: string | null
          legal_footer?: string | null
          legal_logo_url?: string | null
          legal_name?: string | null
          legal_nif?: string | null
          legal_rccm?: string | null
          module_enabled?: boolean
          updated_at?: string
          vat_enabled?: boolean
          vat_rate?: number
        }
        Update: {
          auto_invoicing?: boolean
          created_at?: string
          customer_id?: string
          daily_invoicing_enabled?: boolean
          id?: string
          invoice_slug?: string
          legal_address?: string | null
          legal_footer?: string | null
          legal_logo_url?: string | null
          legal_name?: string | null
          legal_nif?: string | null
          legal_rccm?: string | null
          module_enabled?: boolean
          updated_at?: string
          vat_enabled?: boolean
          vat_rate?: number
        }
        Relationships: []
      }
      customers: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          logo_url: string | null
          name: string
          primary_color: string | null
          secondary_color: string | null
          settings: Json
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name: string
          primary_color?: string | null
          secondary_color?: string | null
          settings?: Json
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name?: string
          primary_color?: string | null
          secondary_color?: string | null
          settings?: Json
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      device_tokens: {
        Row: {
          created_at: string
          driver_id: string
          id: string
          platform: string
          token: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          driver_id: string
          id?: string
          platform: string
          token: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          driver_id?: string
          id?: string
          platform?: string
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "device_tokens_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_access_codes: {
        Row: {
          code_hash: string
          created_at: string
          created_by: string | null
          customer_id: string
          driver_id: string
          expires_at: string | null
          id: string
          revoked_at: string | null
          status: string
          used_at: string | null
        }
        Insert: {
          code_hash: string
          created_at?: string
          created_by?: string | null
          customer_id: string
          driver_id: string
          expires_at?: string | null
          id?: string
          revoked_at?: string | null
          status?: string
          used_at?: string | null
        }
        Update: {
          code_hash?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string
          driver_id?: string
          expires_at?: string | null
          id?: string
          revoked_at?: string | null
          status?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "driver_access_codes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_access_codes_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_ads: {
        Row: {
          body: string | null
          click_count: number
          created_at: string
          created_by: string | null
          cta_label: string | null
          cta_url: string | null
          customer_id: string | null
          ends_at: string | null
          id: string
          image_url: string | null
          is_active: boolean
          placement: string
          priority: number
          starts_at: string
          title: string
          updated_at: string
          view_count: number
        }
        Insert: {
          body?: string | null
          click_count?: number
          created_at?: string
          created_by?: string | null
          cta_label?: string | null
          cta_url?: string | null
          customer_id?: string | null
          ends_at?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          placement?: string
          priority?: number
          starts_at?: string
          title: string
          updated_at?: string
          view_count?: number
        }
        Update: {
          body?: string | null
          click_count?: number
          created_at?: string
          created_by?: string | null
          cta_label?: string | null
          cta_url?: string | null
          customer_id?: string | null
          ends_at?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          placement?: string
          priority?: number
          starts_at?: string
          title?: string
          updated_at?: string
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "driver_ads_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_ads_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_audit: {
        Row: {
          action: string
          actor_id: string | null
          actor_type: string
          created_at: string
          customer_id: string
          driver_id: string
          id: string
          metadata: Json
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_type?: string
          created_at?: string
          customer_id: string
          driver_id: string
          id?: string
          metadata?: Json
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_type?: string
          created_at?: string
          customer_id?: string
          driver_id?: string
          id?: string
          metadata?: Json
        }
        Relationships: [
          {
            foreignKeyName: "driver_audit_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_audit_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_badges: {
        Row: {
          badge_id: string
          driver_id: string
          earned_at: string
          id: string
          seen: boolean
        }
        Insert: {
          badge_id: string
          driver_id: string
          earned_at?: string
          id?: string
          seen?: boolean
        }
        Update: {
          badge_id?: string
          driver_id?: string
          earned_at?: string
          id?: string
          seen?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "driver_badges_badge_id_fkey"
            columns: ["badge_id"]
            isOneToOne: false
            referencedRelation: "badge_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_badges_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_documents: {
        Row: {
          customer_id: string
          document_type: string
          driver_id: string
          expiry_date: string | null
          file_path: string
          id: string
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          uploaded_at: string
        }
        Insert: {
          customer_id: string
          document_type: string
          driver_id: string
          expiry_date?: string | null
          file_path: string
          id?: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          uploaded_at?: string
        }
        Update: {
          customer_id?: string
          document_type?: string
          driver_id?: string
          expiry_date?: string | null
          file_path?: string
          id?: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          uploaded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_documents_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_documents_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_favorites: {
        Row: {
          created_at: string
          driver_id: string
          id: string
          vehicle_id: string
        }
        Insert: {
          created_at?: string
          driver_id: string
          id?: string
          vehicle_id: string
        }
        Update: {
          created_at?: string
          driver_id?: string
          id?: string
          vehicle_id?: string
        }
        Relationships: []
      }
      driver_notes: {
        Row: {
          author_id: string | null
          created_at: string
          customer_id: string
          driver_id: string
          id: string
          note: string
          visibility: string
        }
        Insert: {
          author_id?: string | null
          created_at?: string
          customer_id: string
          driver_id: string
          id?: string
          note: string
          visibility?: string
        }
        Update: {
          author_id?: string | null
          created_at?: string
          customer_id?: string
          driver_id?: string
          id?: string
          note?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_notes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_notes_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_score_events: {
        Row: {
          accident_id: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          delta: number
          driver_id: string
          id: string
          reason: string
        }
        Insert: {
          accident_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          delta: number
          driver_id: string
          id?: string
          reason: string
        }
        Update: {
          accident_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          delta?: number
          driver_id?: string
          id?: string
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_score_events_accident_id_fkey"
            columns: ["accident_id"]
            isOneToOne: false
            referencedRelation: "accidents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_score_events_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_score_events_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_scores: {
        Row: {
          current_score: number
          customer_id: string | null
          driver_id: string
          id: string
          updated_at: string
        }
        Insert: {
          current_score?: number
          customer_id?: string | null
          driver_id: string
          id?: string
          updated_at?: string
        }
        Update: {
          current_score?: number
          customer_id?: string | null
          driver_id?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_scores_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_scores_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_vehicle_reports: {
        Row: {
          category: string
          created_at: string
          customer_id: string | null
          description: string
          driver_id: string
          id: string
          photo_paths: string[]
          status: string
          support_ticket_id: string | null
          updated_at: string
          urgency: string
          vehicle_id: string
        }
        Insert: {
          category: string
          created_at?: string
          customer_id?: string | null
          description: string
          driver_id: string
          id?: string
          photo_paths?: string[]
          status?: string
          support_ticket_id?: string | null
          updated_at?: string
          urgency?: string
          vehicle_id: string
        }
        Update: {
          category?: string
          created_at?: string
          customer_id?: string | null
          description?: string
          driver_id?: string
          id?: string
          photo_paths?: string[]
          status?: string
          support_ticket_id?: string | null
          updated_at?: string
          urgency?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_vehicle_reports_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_vehicle_reports_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_vehicle_reports_support_ticket_id_fkey"
            columns: ["support_ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_vehicle_reports_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_vehicle_reports_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_wallet_transactions: {
        Row: {
          amount: number
          balance_after: number
          created_at: string
          created_by: string | null
          customer_id: string | null
          direction: string | null
          driver_id: string
          id: string
          invoice_id: string | null
          metadata: Json
          method: string | null
          note: string | null
          payment_id: string | null
          reference: string | null
          rental_id: string | null
          type: string
          wallet_id: string | null
        }
        Insert: {
          amount: number
          balance_after: number
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          direction?: string | null
          driver_id: string
          id?: string
          invoice_id?: string | null
          metadata?: Json
          method?: string | null
          note?: string | null
          payment_id?: string | null
          reference?: string | null
          rental_id?: string | null
          type: string
          wallet_id?: string | null
        }
        Update: {
          amount?: number
          balance_after?: number
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          direction?: string | null
          driver_id?: string
          id?: string
          invoice_id?: string | null
          metadata?: Json
          method?: string | null
          note?: string | null
          payment_id?: string | null
          reference?: string | null
          rental_id?: string | null
          type?: string
          wallet_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "driver_wallet_transactions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_wallet_transactions_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_wallet_transactions_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoice"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_wallet_transactions_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_wallet_transactions_rental_id_fkey"
            columns: ["rental_id"]
            isOneToOne: false
            referencedRelation: "rentals"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_wallets: {
        Row: {
          balance: number
          created_at: string
          currency: string
          customer_id: string | null
          driver_id: string
          id: string
          is_active: boolean
          updated_at: string
        }
        Insert: {
          balance?: number
          created_at?: string
          currency?: string
          customer_id?: string | null
          driver_id: string
          id?: string
          is_active?: boolean
          updated_at?: string
        }
        Update: {
          balance?: number
          created_at?: string
          currency?: string
          customer_id?: string | null
          driver_id?: string
          id?: string
          is_active?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_wallets_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_wallets_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: true
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      drivers: {
        Row: {
          access_enabled: boolean
          active_vehicle_id: string | null
          address: string | null
          auth_user_id: string | null
          city: string | null
          created_at: string
          customer_id: string | null
          date_of_birth: string | null
          display_name: string | null
          driver_status: string
          email: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          first_name: string | null
          full_name: string
          gender: string | null
          id: string
          is_test: boolean
          kyc_status: string
          last_name: string | null
          nationality: string | null
          permit_category: string | null
          permit_expiry_date: string | null
          permit_issue_date: string | null
          permit_number: string | null
          phone_number: string
          phone_secondary: string | null
          profile_image_url: string | null
          reactivation_date: string | null
          suspended_at: string | null
          suspended_by: string | null
          suspension_reason: string | null
          updated_at: string
          user_id: string | null
          yango_driver_id: string
        }
        Insert: {
          access_enabled?: boolean
          active_vehicle_id?: string | null
          address?: string | null
          auth_user_id?: string | null
          city?: string | null
          created_at?: string
          customer_id?: string | null
          date_of_birth?: string | null
          display_name?: string | null
          driver_status?: string
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          first_name?: string | null
          full_name: string
          gender?: string | null
          id?: string
          is_test?: boolean
          kyc_status?: string
          last_name?: string | null
          nationality?: string | null
          permit_category?: string | null
          permit_expiry_date?: string | null
          permit_issue_date?: string | null
          permit_number?: string | null
          phone_number: string
          phone_secondary?: string | null
          profile_image_url?: string | null
          reactivation_date?: string | null
          suspended_at?: string | null
          suspended_by?: string | null
          suspension_reason?: string | null
          updated_at?: string
          user_id?: string | null
          yango_driver_id: string
        }
        Update: {
          access_enabled?: boolean
          active_vehicle_id?: string | null
          address?: string | null
          auth_user_id?: string | null
          city?: string | null
          created_at?: string
          customer_id?: string | null
          date_of_birth?: string | null
          display_name?: string | null
          driver_status?: string
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          first_name?: string | null
          full_name?: string
          gender?: string | null
          id?: string
          is_test?: boolean
          kyc_status?: string
          last_name?: string | null
          nationality?: string | null
          permit_category?: string | null
          permit_expiry_date?: string | null
          permit_issue_date?: string | null
          permit_number?: string | null
          phone_number?: string
          phone_secondary?: string | null
          profile_image_url?: string | null
          reactivation_date?: string | null
          suspended_at?: string | null
          suspended_by?: string | null
          suspension_reason?: string | null
          updated_at?: string
          user_id?: string | null
          yango_driver_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "drivers_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_driver_active_vehicle"
            columns: ["active_vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_driver_active_vehicle"
            columns: ["active_vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      driving_event_weights: {
        Row: {
          active: boolean
          alert_name: string
          alert_type_id: number
          score_delta: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          active?: boolean
          alert_name: string
          alert_type_id: number
          score_delta?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          active?: boolean
          alert_name?: string
          alert_type_id?: number
          score_delta?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      driving_events: {
        Row: {
          alert_info: string | null
          alert_location: string | null
          alert_name: string | null
          alert_type_id: number | null
          customer_id: string | null
          driver_id: string | null
          duration_seconds: number | null
          id: string
          occurred_at: string
          raw: Json | null
          rental_id: string | null
          score_delta_applied: number
          synced_at: string
          uffizio_event_hash: string | null
          vehicle_id: string | null
        }
        Insert: {
          alert_info?: string | null
          alert_location?: string | null
          alert_name?: string | null
          alert_type_id?: number | null
          customer_id?: string | null
          driver_id?: string | null
          duration_seconds?: number | null
          id?: string
          occurred_at: string
          raw?: Json | null
          rental_id?: string | null
          score_delta_applied?: number
          synced_at?: string
          uffizio_event_hash?: string | null
          vehicle_id?: string | null
        }
        Update: {
          alert_info?: string | null
          alert_location?: string | null
          alert_name?: string | null
          alert_type_id?: number | null
          customer_id?: string | null
          driver_id?: string | null
          duration_seconds?: number | null
          id?: string
          occurred_at?: string
          raw?: Json | null
          rental_id?: string | null
          score_delta_applied?: number
          synced_at?: string
          uffizio_event_hash?: string | null
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "driving_events_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driving_events_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driving_events_rental_id_fkey"
            columns: ["rental_id"]
            isOneToOne: false
            referencedRelation: "rentals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driving_events_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driving_events_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      executive_attention_items: {
        Row: {
          assigned_owner_role: string
          attention_item_id: string
          created_at: string
          customer_id: string | null
          description: string
          item_type: string
          recommended_action: string
          severity: string
          source_data_json: Json
          source_reference_id: string | null
          source_reference_type: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_owner_role?: string
          attention_item_id?: string
          created_at?: string
          customer_id?: string | null
          description: string
          item_type: string
          recommended_action: string
          severity?: string
          source_data_json?: Json
          source_reference_id?: string | null
          source_reference_type?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_owner_role?: string
          attention_item_id?: string
          created_at?: string
          customer_id?: string | null
          description?: string
          item_type?: string
          recommended_action?: string
          severity?: string
          source_data_json?: Json
          source_reference_id?: string | null
          source_reference_type?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "executive_attention_items_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flag_audit_log: {
        Row: {
          actor_email: string | null
          actor_id: string
          created_at: string
          customer_id: string | null
          flag_key: string
          id: string
          ip_address: string | null
          new_value: boolean | null
          old_value: boolean | null
          reason: string | null
          user_agent: string | null
        }
        Insert: {
          actor_email?: string | null
          actor_id: string
          created_at?: string
          customer_id?: string | null
          flag_key: string
          id?: string
          ip_address?: string | null
          new_value?: boolean | null
          old_value?: boolean | null
          reason?: string | null
          user_agent?: string | null
        }
        Update: {
          actor_email?: string | null
          actor_id?: string
          created_at?: string
          customer_id?: string | null
          flag_key?: string
          id?: string
          ip_address?: string | null
          new_value?: boolean | null
          old_value?: boolean | null
          reason?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feature_flag_audit_log_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flags: {
        Row: {
          category: string
          created_at: string
          customer_id: string | null
          description: string | null
          flag_key: string
          flag_value: boolean
          id: string
          is_platform_only: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          category?: string
          created_at?: string
          customer_id?: string | null
          description?: string | null
          flag_key: string
          flag_value?: boolean
          id?: string
          is_platform_only?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          customer_id?: string | null
          description?: string | null
          flag_key?: string
          flag_value?: boolean
          id?: string
          is_platform_only?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feature_flags_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feature_flags_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      financed_assets: {
        Row: {
          asset_condition: string
          asset_id: string
          asset_type: string
          created_at: string
          created_by: string | null
          customer_id: string | null
          description: string
          fulfillment_status: string
          imei: string | null
          possession_status: string
          purchase_price: number
          purchase_price_currency_code: string
          residual_value: number
          residual_value_currency_code: string
          serial_number: string | null
          status: string
          updated_at: string
          updated_by: string | null
          vendor_id: string | null
          vin: string | null
        }
        Insert: {
          asset_condition?: string
          asset_id?: string
          asset_type: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          description: string
          fulfillment_status?: string
          imei?: string | null
          possession_status?: string
          purchase_price?: number
          purchase_price_currency_code?: string
          residual_value?: number
          residual_value_currency_code?: string
          serial_number?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
          vendor_id?: string | null
          vin?: string | null
        }
        Update: {
          asset_condition?: string
          asset_id?: string
          asset_type?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          description?: string
          fulfillment_status?: string
          imei?: string | null
          possession_status?: string
          purchase_price?: number
          purchase_price_currency_code?: string
          residual_value?: number
          residual_value_currency_code?: string
          serial_number?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
          vendor_id?: string | null
          vin?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "financed_assets_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financed_assets_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["vendor_id"]
          },
        ]
      }
      fleet_control_audit: {
        Row: {
          action: string
          actor_id: string | null
          actor_type: string
          created_at: string
          customer_id: string | null
          driver_id: string | null
          fleet_control_id: string | null
          id: string
          metadata: Json
          vehicle_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_type: string
          created_at?: string
          customer_id?: string | null
          driver_id?: string | null
          fleet_control_id?: string | null
          id?: string
          metadata?: Json
          vehicle_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_type?: string
          created_at?: string
          customer_id?: string | null
          driver_id?: string | null
          fleet_control_id?: string | null
          id?: string
          metadata?: Json
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fleet_control_audit_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_control_audit_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_control_audit_fleet_control_id_fkey"
            columns: ["fleet_control_id"]
            isOneToOne: false
            referencedRelation: "vehicle_inspections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_control_audit_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_control_audit_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      fulfillment_records: {
        Row: {
          admin_confirmed_by: string | null
          application_id: string | null
          asset_condition_at_handover: string | null
          asset_id: string
          created_at: string
          created_by: string | null
          customer_id: string | null
          fulfillment_id: string
          handover_location: string | null
          handover_photos_json: Json
          possession_confirmed_at: string | null
          possession_confirmed_by: string | null
          status: string
          tracking_reference: string | null
          updated_at: string
          updated_by: string | null
          vendor_id: string | null
        }
        Insert: {
          admin_confirmed_by?: string | null
          application_id?: string | null
          asset_condition_at_handover?: string | null
          asset_id: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          fulfillment_id?: string
          handover_location?: string | null
          handover_photos_json?: Json
          possession_confirmed_at?: string | null
          possession_confirmed_by?: string | null
          status?: string
          tracking_reference?: string | null
          updated_at?: string
          updated_by?: string | null
          vendor_id?: string | null
        }
        Update: {
          admin_confirmed_by?: string | null
          application_id?: string | null
          asset_condition_at_handover?: string | null
          asset_id?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          fulfillment_id?: string
          handover_location?: string | null
          handover_photos_json?: Json
          possession_confirmed_at?: string | null
          possession_confirmed_by?: string | null
          status?: string
          tracking_reference?: string | null
          updated_at?: string
          updated_by?: string | null
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fulfillment_records_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "credit_applications"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "fulfillment_records_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "financed_assets"
            referencedColumns: ["asset_id"]
          },
          {
            foreignKeyName: "fulfillment_records_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fulfillment_records_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["vendor_id"]
          },
        ]
      }
      geofence_alerts: {
        Row: {
          acknowledged: boolean
          alert_type: string
          created_at: string
          driver_id: string | null
          id: string
          lat: number | null
          lng: number | null
          speed: number | null
          vehicle_id: string | null
          vehicle_name: string | null
          zone_id: string | null
          zone_name: string | null
        }
        Insert: {
          acknowledged?: boolean
          alert_type?: string
          created_at?: string
          driver_id?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          speed?: number | null
          vehicle_id?: string | null
          vehicle_name?: string | null
          zone_id?: string | null
          zone_name?: string | null
        }
        Update: {
          acknowledged?: boolean
          alert_type?: string
          created_at?: string
          driver_id?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          speed?: number | null
          vehicle_id?: string | null
          vehicle_name?: string | null
          zone_id?: string | null
          zone_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "geofence_alerts_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "geofence_alerts_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "geofence_alerts_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "geofence_alerts_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "geofence_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      geofence_zones: {
        Row: {
          center_lat: number | null
          center_lng: number | null
          color: string
          created_at: string
          customer_id: string | null
          id: string
          is_active: boolean
          name: string
          radius_meters: number | null
          updated_at: string
          zone_type: string
        }
        Insert: {
          center_lat?: number | null
          center_lng?: number | null
          color?: string
          created_at?: string
          customer_id?: string | null
          id?: string
          is_active?: boolean
          name: string
          radius_meters?: number | null
          updated_at?: string
          zone_type?: string
        }
        Update: {
          center_lat?: number | null
          center_lng?: number | null
          color?: string
          created_at?: string
          customer_id?: string | null
          id?: string
          is_active?: boolean
          name?: string
          radius_meters?: number | null
          updated_at?: string
          zone_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "geofence_zones_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      income_records: {
        Row: {
          customer_id: string | null
          driver_id: string
          gross_income: number
          id: string
          net_income: number
          proof_url: string | null
          raw_data: Json | null
          record_date: string
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          source: string
          status: string | null
          submitted_by: string | null
          synced_at: string
          trip_count: number
          trust_weight: number | null
        }
        Insert: {
          customer_id?: string | null
          driver_id: string
          gross_income?: number
          id?: string
          net_income?: number
          proof_url?: string | null
          raw_data?: Json | null
          record_date: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source: string
          status?: string | null
          submitted_by?: string | null
          synced_at?: string
          trip_count?: number
          trust_weight?: number | null
        }
        Update: {
          customer_id?: string | null
          driver_id?: string
          gross_income?: number
          id?: string
          net_income?: number
          proof_url?: string | null
          raw_data?: Json | null
          record_date?: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source?: string
          status?: string | null
          submitted_by?: string | null
          synced_at?: string
          trip_count?: number
          trust_weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "income_records_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "income_records_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice: {
        Row: {
          amount_paid: number
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          currency_code: string
          customer_id: string
          driver_id: string
          driver_snapshot_name: string | null
          driver_snapshot_nif: string | null
          driver_snapshot_phone: string | null
          due_date: string | null
          id: string
          idempotency_key: string | null
          invoice_kind: string
          invoice_number: string | null
          issued_at: string | null
          legal_address_snapshot: string | null
          legal_footer_snapshot: string | null
          legal_name_snapshot: string | null
          legal_nif_snapshot: string | null
          legal_rccm_snapshot: string | null
          notes: string | null
          obligation_type: string | null
          paid_at: string | null
          period_end: string | null
          period_start: string | null
          public_token: string
          remaining_due: number | null
          rental_id: string | null
          source_application_id: string | null
          source_credit_account_id: string | null
          source_obligation_id: string | null
          source_product_id: string | null
          source_schedule_id: string | null
          status: string
          subtotal_ht: number
          tags: string[]
          token_expires_at: string
          total_ttc: number
          updated_at: string
          vat_amount: number
          vat_enabled_snapshot: boolean | null
          vat_rate_snapshot: number | null
        }
        Insert: {
          amount_paid?: number
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          currency_code?: string
          customer_id: string
          driver_id: string
          driver_snapshot_name?: string | null
          driver_snapshot_nif?: string | null
          driver_snapshot_phone?: string | null
          due_date?: string | null
          id?: string
          idempotency_key?: string | null
          invoice_kind?: string
          invoice_number?: string | null
          issued_at?: string | null
          legal_address_snapshot?: string | null
          legal_footer_snapshot?: string | null
          legal_name_snapshot?: string | null
          legal_nif_snapshot?: string | null
          legal_rccm_snapshot?: string | null
          notes?: string | null
          obligation_type?: string | null
          paid_at?: string | null
          period_end?: string | null
          period_start?: string | null
          public_token?: string
          remaining_due?: number | null
          rental_id?: string | null
          source_application_id?: string | null
          source_credit_account_id?: string | null
          source_obligation_id?: string | null
          source_product_id?: string | null
          source_schedule_id?: string | null
          status?: string
          subtotal_ht?: number
          tags?: string[]
          token_expires_at?: string
          total_ttc?: number
          updated_at?: string
          vat_amount?: number
          vat_enabled_snapshot?: boolean | null
          vat_rate_snapshot?: number | null
        }
        Update: {
          amount_paid?: number
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          currency_code?: string
          customer_id?: string
          driver_id?: string
          driver_snapshot_name?: string | null
          driver_snapshot_nif?: string | null
          driver_snapshot_phone?: string | null
          due_date?: string | null
          id?: string
          idempotency_key?: string | null
          invoice_kind?: string
          invoice_number?: string | null
          issued_at?: string | null
          legal_address_snapshot?: string | null
          legal_footer_snapshot?: string | null
          legal_name_snapshot?: string | null
          legal_nif_snapshot?: string | null
          legal_rccm_snapshot?: string | null
          notes?: string | null
          obligation_type?: string | null
          paid_at?: string | null
          period_end?: string | null
          period_start?: string | null
          public_token?: string
          remaining_due?: number | null
          rental_id?: string | null
          source_application_id?: string | null
          source_credit_account_id?: string | null
          source_obligation_id?: string | null
          source_product_id?: string | null
          source_schedule_id?: string | null
          status?: string
          subtotal_ht?: number
          tags?: string[]
          token_expires_at?: string
          total_ttc?: number
          updated_at?: string
          vat_amount?: number
          vat_enabled_snapshot?: boolean | null
          vat_rate_snapshot?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_rental_id_fkey"
            columns: ["rental_id"]
            isOneToOne: false
            referencedRelation: "rentals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_source_application_id_fkey"
            columns: ["source_application_id"]
            isOneToOne: false
            referencedRelation: "credit_applications"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "invoice_source_credit_account_id_fkey"
            columns: ["source_credit_account_id"]
            isOneToOne: false
            referencedRelation: "credit_accounts"
            referencedColumns: ["credit_account_id"]
          },
          {
            foreignKeyName: "invoice_source_credit_account_id_fkey"
            columns: ["source_credit_account_id"]
            isOneToOne: false
            referencedRelation: "v_credit_portfolio_account_facts"
            referencedColumns: ["credit_account_id"]
          },
          {
            foreignKeyName: "invoice_source_obligation_id_fkey"
            columns: ["source_obligation_id"]
            isOneToOne: false
            referencedRelation: "scheduled_obligations"
            referencedColumns: ["obligation_id"]
          },
          {
            foreignKeyName: "invoice_source_product_id_fkey"
            columns: ["source_product_id"]
            isOneToOne: false
            referencedRelation: "credit_products"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "invoice_source_product_id_fkey"
            columns: ["source_product_id"]
            isOneToOne: false
            referencedRelation: "v_credit_product_performance"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "invoice_source_schedule_id_fkey"
            columns: ["source_schedule_id"]
            isOneToOne: false
            referencedRelation: "repayment_schedules"
            referencedColumns: ["schedule_id"]
          },
        ]
      }
      invoice_audit: {
        Row: {
          action: string
          actor_id: string | null
          actor_type: string
          created_at: string
          customer_id: string
          id: string
          invoice_id: string
          metadata: Json
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_type?: string
          created_at?: string
          customer_id: string
          id?: string
          invoice_id: string
          metadata?: Json
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_type?: string
          created_at?: string
          customer_id?: string
          id?: string
          invoice_id?: string
          metadata?: Json
        }
        Relationships: [
          {
            foreignKeyName: "invoice_audit_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoice"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_line: {
        Row: {
          created_at: string
          customer_id: string
          designation: string
          id: string
          invoice_id: string
          line_total_ht: number
          line_total_ttc: number
          line_vat: number
          metadata: Json
          position: number
          quantity: number
          source_payment_id: string | null
          unit_price: number
          vat_rate: number
        }
        Insert: {
          created_at?: string
          customer_id: string
          designation: string
          id?: string
          invoice_id: string
          line_total_ht: number
          line_total_ttc: number
          line_vat?: number
          metadata?: Json
          position?: number
          quantity?: number
          source_payment_id?: string | null
          unit_price: number
          vat_rate?: number
        }
        Update: {
          created_at?: string
          customer_id?: string
          designation?: string
          id?: string
          invoice_id?: string
          line_total_ht?: number
          line_total_ttc?: number
          line_vat?: number
          metadata?: Json
          position?: number
          quantity?: number
          source_payment_id?: string | null
          unit_price?: number
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_line_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoice"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_payment_link: {
        Row: {
          created_at: string
          customer_id: string
          id: string
          invoice_id: string
          payment_id: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          id?: string
          invoice_id: string
          payment_id: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          id?: string
          invoice_id?: string
          payment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_payment_link_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoice"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_sequence: {
        Row: {
          customer_id: string
          last_number: number
          updated_at: string
          year: number
        }
        Insert: {
          customer_id: string
          last_number?: number
          updated_at?: string
          year: number
        }
        Update: {
          customer_id?: string
          last_number?: number
          updated_at?: string
          year?: number
        }
        Relationships: []
      }
      kyc_submissions: {
        Row: {
          bank_account_number: string
          bank_name: string
          customer_id: string | null
          driver_id: string
          id: string
          id_proof_url: string
          license_url: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          submitted_at: string
        }
        Insert: {
          bank_account_number: string
          bank_name: string
          customer_id?: string | null
          driver_id: string
          id?: string
          id_proof_url: string
          license_url?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string
        }
        Update: {
          bank_account_number?: string
          bank_name?: string
          customer_id?: string | null
          driver_id?: string
          id?: string
          id_proof_url?: string
          license_url?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kyc_submissions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kyc_submissions_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kyc_submissions_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      loans: {
        Row: {
          amount_approved: number | null
          amount_requested: number
          applied_at: string
          approved_at: string | null
          approved_by: string | null
          customer_id: string | null
          disbursed_at: string | null
          driver_id: string
          id: string
          interest_rate: number | null
          loan_type: string
          rejection_reason: string | null
          status: string
        }
        Insert: {
          amount_approved?: number | null
          amount_requested: number
          applied_at?: string
          approved_at?: string | null
          approved_by?: string | null
          customer_id?: string | null
          disbursed_at?: string | null
          driver_id: string
          id?: string
          interest_rate?: number | null
          loan_type: string
          rejection_reason?: string | null
          status?: string
        }
        Update: {
          amount_approved?: number | null
          amount_requested?: number
          applied_at?: string
          approved_at?: string | null
          approved_by?: string | null
          customer_id?: string | null
          disbursed_at?: string | null
          driver_id?: string
          id?: string
          interest_rate?: number | null
          loan_type?: string
          rejection_reason?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "loans_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loans_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loans_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      login_activity: {
        Row: {
          created_at: string
          device_info: string | null
          driver_id: string
          failure_reason: string | null
          id: string
          ip_address: string | null
          location: string | null
          login_method: string
          success: boolean
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          device_info?: string | null
          driver_id: string
          failure_reason?: string | null
          id?: string
          ip_address?: string | null
          location?: string | null
          login_method: string
          success?: boolean
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          device_info?: string | null
          driver_id?: string
          failure_reason?: string | null
          id?: string
          ip_address?: string | null
          location?: string | null
          login_method?: string
          success?: boolean
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "login_activity_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_order_items: {
        Row: {
          created_at: string
          id: string
          item_type: string
          label: string
          order_id: string
          quantity: number
          unit_cost: number
        }
        Insert: {
          created_at?: string
          id?: string
          item_type?: string
          label: string
          order_id: string
          quantity?: number
          unit_cost?: number
        }
        Update: {
          created_at?: string
          id?: string
          item_type?: string
          label?: string
          order_id?: string
          quantity?: number
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "maintenance_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_orders: {
        Row: {
          actual_cost: number
          completed_at: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          description: string | null
          diagnosis: string | null
          estimated_cost: number
          id: string
          mileage_km: number | null
          notes: string | null
          order_number: string | null
          order_type: string
          priority: string
          provider_id: string | null
          scheduled_date: string | null
          started_at: string | null
          status: string
          updated_at: string
          validated_at: string | null
          validated_by: string | null
          vehicle_id: string
        }
        Insert: {
          actual_cost?: number
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          description?: string | null
          diagnosis?: string | null
          estimated_cost?: number
          id?: string
          mileage_km?: number | null
          notes?: string | null
          order_number?: string | null
          order_type?: string
          priority?: string
          provider_id?: string | null
          scheduled_date?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
          validated_at?: string | null
          validated_by?: string | null
          vehicle_id: string
        }
        Update: {
          actual_cost?: number
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          description?: string | null
          diagnosis?: string | null
          estimated_cost?: number
          id?: string
          mileage_km?: number | null
          notes?: string | null
          order_number?: string | null
          order_type?: string
          priority?: string
          provider_id?: string | null
          scheduled_date?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
          validated_at?: string | null
          validated_by?: string | null
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_orders_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "maintenance_providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_orders_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_orders_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_providers: {
        Row: {
          address: string | null
          city: string | null
          created_at: string
          customer_id: string | null
          email: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          phone: string | null
          rating: number | null
          specialty: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          created_at?: string
          customer_id?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          phone?: string | null
          rating?: number | null
          specialty?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          created_at?: string
          customer_id?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          phone?: string | null
          rating?: number | null
          specialty?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          channel: string | null
          created_at: string
          customer_id: string | null
          driver_id: string | null
          id: string
          is_read: boolean
          message: string
          notification_type: string
          recipient_user_id: string | null
          send_status: string | null
          template_id: string | null
          title: string
          variables: Json | null
          whatsapp_sent: boolean
          whatsapp_sent_at: string | null
        }
        Insert: {
          channel?: string | null
          created_at?: string
          customer_id?: string | null
          driver_id?: string | null
          id?: string
          is_read?: boolean
          message: string
          notification_type: string
          recipient_user_id?: string | null
          send_status?: string | null
          template_id?: string | null
          title: string
          variables?: Json | null
          whatsapp_sent?: boolean
          whatsapp_sent_at?: string | null
        }
        Update: {
          channel?: string | null
          created_at?: string
          customer_id?: string | null
          driver_id?: string | null
          id?: string
          is_read?: boolean
          message?: string
          notification_type?: string
          recipient_user_id?: string | null
          send_status?: string | null
          template_id?: string | null
          title?: string
          variables?: Json | null
          whatsapp_sent?: boolean
          whatsapp_sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      other_charges: {
        Row: {
          amount: number
          charge_date: string
          charge_type: string
          created_at: string
          created_by: string | null
          customer_id: string | null
          id: string
          label: string
          notes: string | null
          period_end: string | null
          period_start: string | null
          provider_name: string | null
          reference: string | null
          updated_at: string
          vehicle_id: string | null
        }
        Insert: {
          amount?: number
          charge_date?: string
          charge_type: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          id?: string
          label: string
          notes?: string | null
          period_end?: string | null
          period_start?: string | null
          provider_name?: string | null
          reference?: string | null
          updated_at?: string
          vehicle_id?: string | null
        }
        Update: {
          amount?: number
          charge_date?: string
          charge_type?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          id?: string
          label?: string
          notes?: string | null
          period_end?: string | null
          period_start?: string | null
          provider_name?: string | null
          reference?: string | null
          updated_at?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "other_charges_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "other_charges_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      ownership_certificates: {
        Row: {
          asset_id: string
          certificate_id: string
          certificate_metadata_json: Json
          certificate_number: string
          certificate_status: string
          created_at: string
          credit_account_id: string
          customer_id: string | null
          document_reference: string | null
          driver_id: string
          idempotency_key: string
          issued_at: string
          issued_by: string | null
          request_hash: string | null
          review_id: string
          transfer_id: string
        }
        Insert: {
          asset_id: string
          certificate_id?: string
          certificate_metadata_json?: Json
          certificate_number: string
          certificate_status?: string
          created_at?: string
          credit_account_id: string
          customer_id?: string | null
          document_reference?: string | null
          driver_id: string
          idempotency_key: string
          issued_at?: string
          issued_by?: string | null
          request_hash?: string | null
          review_id: string
          transfer_id: string
        }
        Update: {
          asset_id?: string
          certificate_id?: string
          certificate_metadata_json?: Json
          certificate_number?: string
          certificate_status?: string
          created_at?: string
          credit_account_id?: string
          customer_id?: string | null
          document_reference?: string | null
          driver_id?: string
          idempotency_key?: string
          issued_at?: string
          issued_by?: string | null
          request_hash?: string | null
          review_id?: string
          transfer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ownership_certificates_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "financed_assets"
            referencedColumns: ["asset_id"]
          },
          {
            foreignKeyName: "ownership_certificates_credit_account_id_fkey"
            columns: ["credit_account_id"]
            isOneToOne: false
            referencedRelation: "credit_accounts"
            referencedColumns: ["credit_account_id"]
          },
          {
            foreignKeyName: "ownership_certificates_credit_account_id_fkey"
            columns: ["credit_account_id"]
            isOneToOne: false
            referencedRelation: "v_credit_portfolio_account_facts"
            referencedColumns: ["credit_account_id"]
          },
          {
            foreignKeyName: "ownership_certificates_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ownership_certificates_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ownership_certificates_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "ownership_completion_reviews"
            referencedColumns: ["review_id"]
          },
          {
            foreignKeyName: "ownership_certificates_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "v_driver_ownership_completion_status"
            referencedColumns: ["review_id"]
          },
          {
            foreignKeyName: "ownership_certificates_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "v_ownership_completion_queue"
            referencedColumns: ["completion_review_id"]
          },
          {
            foreignKeyName: "ownership_certificates_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "v_ownership_completion_queue"
            referencedColumns: ["review_id"]
          },
          {
            foreignKeyName: "ownership_certificates_transfer_id_fkey"
            columns: ["transfer_id"]
            isOneToOne: false
            referencedRelation: "asset_transfer_records"
            referencedColumns: ["transfer_id"]
          },
          {
            foreignKeyName: "ownership_certificates_transfer_id_fkey"
            columns: ["transfer_id"]
            isOneToOne: false
            referencedRelation: "v_driver_ownership_completion_status"
            referencedColumns: ["transfer_id"]
          },
          {
            foreignKeyName: "ownership_certificates_transfer_id_fkey"
            columns: ["transfer_id"]
            isOneToOne: false
            referencedRelation: "v_ownership_completion_queue"
            referencedColumns: ["transfer_id"]
          },
        ]
      }
      ownership_completion_audit_events: {
        Row: {
          actor_id: string | null
          after_json: Json
          asset_id: string | null
          audit_event_id: string
          before_json: Json
          created_at: string
          credit_account_id: string | null
          customer_id: string | null
          event_type: string
          idempotency_key: string | null
          reason: string | null
          request_hash: string | null
          review_id: string | null
        }
        Insert: {
          actor_id?: string | null
          after_json?: Json
          asset_id?: string | null
          audit_event_id?: string
          before_json?: Json
          created_at?: string
          credit_account_id?: string | null
          customer_id?: string | null
          event_type: string
          idempotency_key?: string | null
          reason?: string | null
          request_hash?: string | null
          review_id?: string | null
        }
        Update: {
          actor_id?: string | null
          after_json?: Json
          asset_id?: string | null
          audit_event_id?: string
          before_json?: Json
          created_at?: string
          credit_account_id?: string | null
          customer_id?: string | null
          event_type?: string
          idempotency_key?: string | null
          reason?: string | null
          request_hash?: string | null
          review_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ownership_completion_audit_events_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "financed_assets"
            referencedColumns: ["asset_id"]
          },
          {
            foreignKeyName: "ownership_completion_audit_events_credit_account_id_fkey"
            columns: ["credit_account_id"]
            isOneToOne: false
            referencedRelation: "credit_accounts"
            referencedColumns: ["credit_account_id"]
          },
          {
            foreignKeyName: "ownership_completion_audit_events_credit_account_id_fkey"
            columns: ["credit_account_id"]
            isOneToOne: false
            referencedRelation: "v_credit_portfolio_account_facts"
            referencedColumns: ["credit_account_id"]
          },
          {
            foreignKeyName: "ownership_completion_audit_events_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ownership_completion_audit_events_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "ownership_completion_reviews"
            referencedColumns: ["review_id"]
          },
          {
            foreignKeyName: "ownership_completion_audit_events_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "v_driver_ownership_completion_status"
            referencedColumns: ["review_id"]
          },
          {
            foreignKeyName: "ownership_completion_audit_events_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "v_ownership_completion_queue"
            referencedColumns: ["completion_review_id"]
          },
          {
            foreignKeyName: "ownership_completion_audit_events_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "v_ownership_completion_queue"
            referencedColumns: ["review_id"]
          },
        ]
      }
      ownership_completion_decisions: {
        Row: {
          created_at: string
          credit_account_id: string
          customer_id: string | null
          decided_by: string | null
          decision: string
          decision_id: string
          decision_metadata_json: Json
          decision_reason: string
          decision_summary: string | null
          decision_timestamp: string
          idempotency_key: string
          request_hash: string | null
          review_id: string
          second_approver_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          credit_account_id: string
          customer_id?: string | null
          decided_by?: string | null
          decision: string
          decision_id?: string
          decision_metadata_json?: Json
          decision_reason: string
          decision_summary?: string | null
          decision_timestamp?: string
          idempotency_key: string
          request_hash?: string | null
          review_id: string
          second_approver_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          credit_account_id?: string
          customer_id?: string | null
          decided_by?: string | null
          decision?: string
          decision_id?: string
          decision_metadata_json?: Json
          decision_reason?: string
          decision_summary?: string | null
          decision_timestamp?: string
          idempotency_key?: string
          request_hash?: string | null
          review_id?: string
          second_approver_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ownership_completion_decisions_credit_account_id_fkey"
            columns: ["credit_account_id"]
            isOneToOne: false
            referencedRelation: "credit_accounts"
            referencedColumns: ["credit_account_id"]
          },
          {
            foreignKeyName: "ownership_completion_decisions_credit_account_id_fkey"
            columns: ["credit_account_id"]
            isOneToOne: false
            referencedRelation: "v_credit_portfolio_account_facts"
            referencedColumns: ["credit_account_id"]
          },
          {
            foreignKeyName: "ownership_completion_decisions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ownership_completion_decisions_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "ownership_completion_reviews"
            referencedColumns: ["review_id"]
          },
          {
            foreignKeyName: "ownership_completion_decisions_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "v_driver_ownership_completion_status"
            referencedColumns: ["review_id"]
          },
          {
            foreignKeyName: "ownership_completion_decisions_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "v_ownership_completion_queue"
            referencedColumns: ["completion_review_id"]
          },
          {
            foreignKeyName: "ownership_completion_decisions_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "v_ownership_completion_queue"
            referencedColumns: ["review_id"]
          },
        ]
      }
      ownership_completion_reviews: {
        Row: {
          asset_id: string
          assigned_reviewer: string | null
          blocking_reasons_json: Json
          cancelled_at: string | null
          closure_reason: string | null
          completed_at: string | null
          completion_metadata_json: Json
          created_at: string
          created_by: string | null
          credit_account_id: string
          customer_id: string | null
          driver_id: string
          eligibility_checked_at: string
          eligibility_snapshot_json: Json
          idempotency_key: string
          obligation_summary_json: Json
          opened_at: string | null
          product_id: string
          product_rules_snapshot_json: Json
          product_version_id: string
          request_hash: string | null
          reversed_at: string | null
          review_due_at: string | null
          review_id: string
          status: string
          status_changed_at: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          asset_id: string
          assigned_reviewer?: string | null
          blocking_reasons_json?: Json
          cancelled_at?: string | null
          closure_reason?: string | null
          completed_at?: string | null
          completion_metadata_json?: Json
          created_at?: string
          created_by?: string | null
          credit_account_id: string
          customer_id?: string | null
          driver_id: string
          eligibility_checked_at?: string
          eligibility_snapshot_json?: Json
          idempotency_key: string
          obligation_summary_json?: Json
          opened_at?: string | null
          product_id: string
          product_rules_snapshot_json?: Json
          product_version_id: string
          request_hash?: string | null
          reversed_at?: string | null
          review_due_at?: string | null
          review_id?: string
          status?: string
          status_changed_at?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          asset_id?: string
          assigned_reviewer?: string | null
          blocking_reasons_json?: Json
          cancelled_at?: string | null
          closure_reason?: string | null
          completed_at?: string | null
          completion_metadata_json?: Json
          created_at?: string
          created_by?: string | null
          credit_account_id?: string
          customer_id?: string | null
          driver_id?: string
          eligibility_checked_at?: string
          eligibility_snapshot_json?: Json
          idempotency_key?: string
          obligation_summary_json?: Json
          opened_at?: string | null
          product_id?: string
          product_rules_snapshot_json?: Json
          product_version_id?: string
          request_hash?: string | null
          reversed_at?: string | null
          review_due_at?: string | null
          review_id?: string
          status?: string
          status_changed_at?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ownership_completion_reviews_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "financed_assets"
            referencedColumns: ["asset_id"]
          },
          {
            foreignKeyName: "ownership_completion_reviews_credit_account_id_fkey"
            columns: ["credit_account_id"]
            isOneToOne: false
            referencedRelation: "credit_accounts"
            referencedColumns: ["credit_account_id"]
          },
          {
            foreignKeyName: "ownership_completion_reviews_credit_account_id_fkey"
            columns: ["credit_account_id"]
            isOneToOne: false
            referencedRelation: "v_credit_portfolio_account_facts"
            referencedColumns: ["credit_account_id"]
          },
          {
            foreignKeyName: "ownership_completion_reviews_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ownership_completion_reviews_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ownership_completion_reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "credit_products"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "ownership_completion_reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_credit_product_performance"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "ownership_completion_reviews_product_version_id_fkey"
            columns: ["product_version_id"]
            isOneToOne: false
            referencedRelation: "product_versions"
            referencedColumns: ["version_id"]
          },
        ]
      }
      payment_receipts: {
        Row: {
          amount: number
          created_at: string
          customer_id: string | null
          id: string
          method: string
          note: string | null
          payment_id: string
          received_at: string
          recorded_by: string | null
          wave_transaction_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          customer_id?: string | null
          id?: string
          method?: string
          note?: string | null
          payment_id: string
          received_at?: string
          recorded_by?: string | null
          wave_transaction_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          customer_id?: string | null
          id?: string
          method?: string
          note?: string | null
          payment_id?: string
          received_at?: string
          recorded_by?: string | null
          wave_transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_receipts_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          amount_paid: number
          created_at: string
          customer_id: string | null
          driver_id: string
          due_date: string
          id: string
          loan_id: string | null
          paid_at: string | null
          paid_date: string | null
          payment_type: string
          rental_id: string | null
          status: string
          wave_transaction_id: string | null
        }
        Insert: {
          amount: number
          amount_paid?: number
          created_at?: string
          customer_id?: string | null
          driver_id: string
          due_date: string
          id?: string
          loan_id?: string | null
          paid_at?: string | null
          paid_date?: string | null
          payment_type: string
          rental_id?: string | null
          status?: string
          wave_transaction_id?: string | null
        }
        Update: {
          amount?: number
          amount_paid?: number
          created_at?: string
          customer_id?: string | null
          driver_id?: string
          due_date?: string
          id?: string
          loan_id?: string | null
          paid_at?: string | null
          paid_date?: string | null
          payment_type?: string
          rental_id?: string | null
          status?: string
          wave_transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_rental_id_fkey"
            columns: ["rental_id"]
            isOneToOne: false
            referencedRelation: "rentals"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_settings: {
        Row: {
          created_at: string
          description: string | null
          id: string
          setting_key: string
          setting_value: Json
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          setting_key: string
          setting_value?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          setting_key?: string
          setting_value?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      product_underwriting_extensions: {
        Row: {
          created_at: string
          created_by: string | null
          customer_id: string | null
          extension_config_json: Json
          extension_id: string
          extension_key: string
          policy_set_id: string | null
          product_id: string | null
          product_version_id: string | null
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          extension_config_json?: Json
          extension_id?: string
          extension_key: string
          policy_set_id?: string | null
          product_id?: string | null
          product_version_id?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          extension_config_json?: Json
          extension_id?: string
          extension_key?: string
          policy_set_id?: string | null
          product_id?: string | null
          product_version_id?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_underwriting_extensions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_underwriting_extensions_policy_set_id_fkey"
            columns: ["policy_set_id"]
            isOneToOne: false
            referencedRelation: "credit_policy_sets"
            referencedColumns: ["policy_id"]
          },
          {
            foreignKeyName: "product_underwriting_extensions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "credit_products"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_underwriting_extensions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_credit_product_performance"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_underwriting_extensions_product_version_id_fkey"
            columns: ["product_version_id"]
            isOneToOne: false
            referencedRelation: "product_versions"
            referencedColumns: ["version_id"]
          },
        ]
      }
      product_versions: {
        Row: {
          collections_rules_json: Json
          contract_requirements_json: Json
          created_at: string
          created_by: string | null
          customer_id: string | null
          default_rules_json: Json
          effective_from: string
          effective_to: string | null
          ownership_completion_rules_json: Json
          product_id: string
          repayment_terms_json: Json
          rules_snapshot_json: Json
          status: string
          updated_at: string
          updated_by: string | null
          version_id: string
          version_number: number
        }
        Insert: {
          collections_rules_json?: Json
          contract_requirements_json?: Json
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          default_rules_json?: Json
          effective_from?: string
          effective_to?: string | null
          ownership_completion_rules_json?: Json
          product_id: string
          repayment_terms_json?: Json
          rules_snapshot_json?: Json
          status?: string
          updated_at?: string
          updated_by?: string | null
          version_id?: string
          version_number: number
        }
        Update: {
          collections_rules_json?: Json
          contract_requirements_json?: Json
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          default_rules_json?: Json
          effective_from?: string
          effective_to?: string | null
          ownership_completion_rules_json?: Json
          product_id?: string
          repayment_terms_json?: Json
          rules_snapshot_json?: Json
          status?: string
          updated_at?: string
          updated_by?: string | null
          version_id?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_versions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_versions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "credit_products"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_versions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_credit_product_performance"
            referencedColumns: ["product_id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          driver_id: string
          endpoint: string
          id: string
          p256dh: string
          updated_at: string
        }
        Insert: {
          auth: string
          created_at?: string
          driver_id: string
          endpoint: string
          id?: string
          p256dh: string
          updated_at?: string
        }
        Update: {
          auth?: string
          created_at?: string
          driver_id?: string
          endpoint?: string
          id?: string
          p256dh?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      rent_to_own_contracts: {
        Row: {
          completed_at: string | null
          contract_duration_weeks: number
          created_at: string
          customer_id: string | null
          driver_id: string
          expected_end_date: string
          id: string
          notes: string | null
          ownership_percentage: number
          start_date: string
          status: string
          total_paid: number
          total_price: number
          updated_at: string
          vehicle_id: string
          weekly_payment: number
          weeks_completed: number
        }
        Insert: {
          completed_at?: string | null
          contract_duration_weeks?: number
          created_at?: string
          customer_id?: string | null
          driver_id: string
          expected_end_date: string
          id?: string
          notes?: string | null
          ownership_percentage?: number
          start_date: string
          status?: string
          total_paid?: number
          total_price: number
          updated_at?: string
          vehicle_id: string
          weekly_payment: number
          weeks_completed?: number
        }
        Update: {
          completed_at?: string | null
          contract_duration_weeks?: number
          created_at?: string
          customer_id?: string | null
          driver_id?: string
          expected_end_date?: string
          id?: string
          notes?: string | null
          ownership_percentage?: number
          start_date?: string
          status?: string
          total_paid?: number
          total_price?: number
          updated_at?: string
          vehicle_id?: string
          weekly_payment?: number
          weeks_completed?: number
        }
        Relationships: [
          {
            foreignKeyName: "rent_to_own_contracts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rent_to_own_contracts_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rent_to_own_contracts_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rent_to_own_contracts_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_adjustments: {
        Row: {
          adjustment_moment: string
          approval_status: string
          field_changed: string
          id: string
          new_value: number
          old_value: number
          reason: string
          rental_id: string
          requested_at: string
          requested_by: string
          reviewed_at: string | null
          reviewed_by: string | null
          reviewer_note: string | null
        }
        Insert: {
          adjustment_moment: string
          approval_status?: string
          field_changed: string
          id?: string
          new_value: number
          old_value: number
          reason: string
          rental_id: string
          requested_at?: string
          requested_by: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_note?: string | null
        }
        Update: {
          adjustment_moment?: string
          approval_status?: string
          field_changed?: string
          id?: string
          new_value?: number
          old_value?: number
          reason?: string
          rental_id?: string
          requested_at?: string
          requested_by?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rental_adjustments_rental_id_fkey"
            columns: ["rental_id"]
            isOneToOne: false
            referencedRelation: "rentals"
            referencedColumns: ["id"]
          },
        ]
      }
      rentals: {
        Row: {
          approval_date: string | null
          approved_by: string | null
          approved_duration_hours: number | null
          approved_rate: number | null
          created_at: string
          customer_id: string | null
          driver_id: string
          end_date: string | null
          fee_change_reason: string | null
          final_duration_hours: number | null
          final_rate: number | null
          id: string
          payment_due_at: string | null
          payment_due_at_final: string | null
          payment_due_at_initial: string | null
          payment_phase: string | null
          payment_settled_at: string | null
          pickup_confirmed_at: string | null
          pickup_confirmed_by: string | null
          rejection_reason: string | null
          rental_days: number
          requested_rate: number | null
          return_confirmed_at: string | null
          return_due_at: string | null
          return_justification: string | null
          returned_at: string | null
          returned_by: string | null
          start_date: string
          status: string
          total_amount: number | null
          updated_at: string
          vehicle_id: string
        }
        Insert: {
          approval_date?: string | null
          approved_by?: string | null
          approved_duration_hours?: number | null
          approved_rate?: number | null
          created_at?: string
          customer_id?: string | null
          driver_id: string
          end_date?: string | null
          fee_change_reason?: string | null
          final_duration_hours?: number | null
          final_rate?: number | null
          id?: string
          payment_due_at?: string | null
          payment_due_at_final?: string | null
          payment_due_at_initial?: string | null
          payment_phase?: string | null
          payment_settled_at?: string | null
          pickup_confirmed_at?: string | null
          pickup_confirmed_by?: string | null
          rejection_reason?: string | null
          rental_days?: number
          requested_rate?: number | null
          return_confirmed_at?: string | null
          return_due_at?: string | null
          return_justification?: string | null
          returned_at?: string | null
          returned_by?: string | null
          start_date: string
          status?: string
          total_amount?: number | null
          updated_at?: string
          vehicle_id: string
        }
        Update: {
          approval_date?: string | null
          approved_by?: string | null
          approved_duration_hours?: number | null
          approved_rate?: number | null
          created_at?: string
          customer_id?: string | null
          driver_id?: string
          end_date?: string | null
          fee_change_reason?: string | null
          final_duration_hours?: number | null
          final_rate?: number | null
          id?: string
          payment_due_at?: string | null
          payment_due_at_final?: string | null
          payment_due_at_initial?: string | null
          payment_phase?: string | null
          payment_settled_at?: string | null
          pickup_confirmed_at?: string | null
          pickup_confirmed_by?: string | null
          rejection_reason?: string | null
          rental_days?: number
          requested_rate?: number | null
          return_confirmed_at?: string | null
          return_due_at?: string | null
          return_justification?: string | null
          returned_at?: string | null
          returned_by?: string | null
          start_date?: string
          status?: string
          total_amount?: number | null
          updated_at?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rentals_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rentals_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rentals_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rentals_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rentals_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      repayment_audit_events: {
        Row: {
          actor_id: string | null
          actor_type: string
          after_json: Json
          audit_event_id: string
          before_json: Json
          created_at: string
          credit_account_id: string | null
          customer_id: string | null
          event_type: string
          idempotency_key: string | null
          obligation_id: string | null
          reason: string | null
          schedule_id: string | null
        }
        Insert: {
          actor_id?: string | null
          actor_type?: string
          after_json?: Json
          audit_event_id?: string
          before_json?: Json
          created_at?: string
          credit_account_id?: string | null
          customer_id?: string | null
          event_type: string
          idempotency_key?: string | null
          obligation_id?: string | null
          reason?: string | null
          schedule_id?: string | null
        }
        Update: {
          actor_id?: string | null
          actor_type?: string
          after_json?: Json
          audit_event_id?: string
          before_json?: Json
          created_at?: string
          credit_account_id?: string | null
          customer_id?: string | null
          event_type?: string
          idempotency_key?: string | null
          obligation_id?: string | null
          reason?: string | null
          schedule_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "repayment_audit_events_credit_account_id_fkey"
            columns: ["credit_account_id"]
            isOneToOne: false
            referencedRelation: "credit_accounts"
            referencedColumns: ["credit_account_id"]
          },
          {
            foreignKeyName: "repayment_audit_events_credit_account_id_fkey"
            columns: ["credit_account_id"]
            isOneToOne: false
            referencedRelation: "v_credit_portfolio_account_facts"
            referencedColumns: ["credit_account_id"]
          },
          {
            foreignKeyName: "repayment_audit_events_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repayment_audit_events_obligation_id_fkey"
            columns: ["obligation_id"]
            isOneToOne: false
            referencedRelation: "scheduled_obligations"
            referencedColumns: ["obligation_id"]
          },
          {
            foreignKeyName: "repayment_audit_events_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "repayment_schedules"
            referencedColumns: ["schedule_id"]
          },
        ]
      }
      repayment_schedule_amendments: {
        Row: {
          amendment_id: string
          amendment_reason: string
          amendment_type: string
          approved_by: string | null
          created_at: string
          created_by: string | null
          credit_account_id: string
          customer_id: string | null
          new_schedule_id: string | null
          original_schedule_id: string
        }
        Insert: {
          amendment_id?: string
          amendment_reason: string
          amendment_type?: string
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          credit_account_id: string
          customer_id?: string | null
          new_schedule_id?: string | null
          original_schedule_id: string
        }
        Update: {
          amendment_id?: string
          amendment_reason?: string
          amendment_type?: string
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          credit_account_id?: string
          customer_id?: string | null
          new_schedule_id?: string | null
          original_schedule_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "repayment_schedule_amendments_credit_account_id_fkey"
            columns: ["credit_account_id"]
            isOneToOne: false
            referencedRelation: "credit_accounts"
            referencedColumns: ["credit_account_id"]
          },
          {
            foreignKeyName: "repayment_schedule_amendments_credit_account_id_fkey"
            columns: ["credit_account_id"]
            isOneToOne: false
            referencedRelation: "v_credit_portfolio_account_facts"
            referencedColumns: ["credit_account_id"]
          },
          {
            foreignKeyName: "repayment_schedule_amendments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repayment_schedule_amendments_new_schedule_id_fkey"
            columns: ["new_schedule_id"]
            isOneToOne: false
            referencedRelation: "repayment_schedules"
            referencedColumns: ["schedule_id"]
          },
          {
            foreignKeyName: "repayment_schedule_amendments_original_schedule_id_fkey"
            columns: ["original_schedule_id"]
            isOneToOne: false
            referencedRelation: "repayment_schedules"
            referencedColumns: ["schedule_id"]
          },
        ]
      }
      repayment_schedules: {
        Row: {
          allow_prepayment: boolean
          allow_schedule_amendment: boolean
          application_id: string
          contract_id: string
          created_at: string
          created_by: string | null
          credit_account_id: string
          currency_code: string
          customer_id: string | null
          final_due_date: string
          financed_amount: number
          first_due_date: string
          frequency: string
          generated_from_contract_hash: string
          generated_from_policy_snapshot_id: string | null
          grace_period_days: number
          idempotency_key: string
          invoice_generation_days_before_due: number
          product_id: string
          product_version_id: string
          schedule_id: string
          schedule_status: string
          schedule_type: string
          schedule_version: number
          source_snapshot_json: Json
          status_changed_at: string
          superseded_by_schedule_id: string | null
          term_count: number
          terms_snapshot_json: Json
          total_fees_amount: number
          total_interest_amount: number
          total_repayment_amount: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          allow_prepayment?: boolean
          allow_schedule_amendment?: boolean
          application_id: string
          contract_id: string
          created_at?: string
          created_by?: string | null
          credit_account_id: string
          currency_code?: string
          customer_id?: string | null
          final_due_date: string
          financed_amount?: number
          first_due_date: string
          frequency?: string
          generated_from_contract_hash: string
          generated_from_policy_snapshot_id?: string | null
          grace_period_days?: number
          idempotency_key: string
          invoice_generation_days_before_due?: number
          product_id: string
          product_version_id: string
          schedule_id?: string
          schedule_status?: string
          schedule_type: string
          schedule_version?: number
          source_snapshot_json?: Json
          status_changed_at?: string
          superseded_by_schedule_id?: string | null
          term_count?: number
          terms_snapshot_json?: Json
          total_fees_amount?: number
          total_interest_amount?: number
          total_repayment_amount?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          allow_prepayment?: boolean
          allow_schedule_amendment?: boolean
          application_id?: string
          contract_id?: string
          created_at?: string
          created_by?: string | null
          credit_account_id?: string
          currency_code?: string
          customer_id?: string | null
          final_due_date?: string
          financed_amount?: number
          first_due_date?: string
          frequency?: string
          generated_from_contract_hash?: string
          generated_from_policy_snapshot_id?: string | null
          grace_period_days?: number
          idempotency_key?: string
          invoice_generation_days_before_due?: number
          product_id?: string
          product_version_id?: string
          schedule_id?: string
          schedule_status?: string
          schedule_type?: string
          schedule_version?: number
          source_snapshot_json?: Json
          status_changed_at?: string
          superseded_by_schedule_id?: string | null
          term_count?: number
          terms_snapshot_json?: Json
          total_fees_amount?: number
          total_interest_amount?: number
          total_repayment_amount?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "repayment_schedules_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "credit_applications"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "repayment_schedules_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "credit_contracts"
            referencedColumns: ["contract_id"]
          },
          {
            foreignKeyName: "repayment_schedules_credit_account_id_fkey"
            columns: ["credit_account_id"]
            isOneToOne: false
            referencedRelation: "credit_accounts"
            referencedColumns: ["credit_account_id"]
          },
          {
            foreignKeyName: "repayment_schedules_credit_account_id_fkey"
            columns: ["credit_account_id"]
            isOneToOne: false
            referencedRelation: "v_credit_portfolio_account_facts"
            referencedColumns: ["credit_account_id"]
          },
          {
            foreignKeyName: "repayment_schedules_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repayment_schedules_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "credit_products"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "repayment_schedules_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_credit_product_performance"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "repayment_schedules_product_version_id_fkey"
            columns: ["product_version_id"]
            isOneToOne: false
            referencedRelation: "product_versions"
            referencedColumns: ["version_id"]
          },
          {
            foreignKeyName: "repayment_schedules_superseded_by_schedule_id_fkey"
            columns: ["superseded_by_schedule_id"]
            isOneToOne: false
            referencedRelation: "repayment_schedules"
            referencedColumns: ["schedule_id"]
          },
        ]
      }
      reunderwriting_triggers: {
        Row: {
          application_id: string
          created_at: string
          created_by: string | null
          customer_id: string | null
          idempotency_key: string
          prior_decision_id: string | null
          required_snapshot_at: string
          resolution_decision_id: string | null
          status: string
          status_changed_at: string
          trigger_id: string
          trigger_payload_json: Json
          trigger_source: string
          trigger_type: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          application_id: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          idempotency_key: string
          prior_decision_id?: string | null
          required_snapshot_at?: string
          resolution_decision_id?: string | null
          status?: string
          status_changed_at?: string
          trigger_id?: string
          trigger_payload_json?: Json
          trigger_source?: string
          trigger_type: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          application_id?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          idempotency_key?: string
          prior_decision_id?: string | null
          required_snapshot_at?: string
          resolution_decision_id?: string | null
          status?: string
          status_changed_at?: string
          trigger_id?: string
          trigger_payload_json?: Json
          trigger_source?: string
          trigger_type?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reunderwriting_triggers_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "credit_applications"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "reunderwriting_triggers_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reunderwriting_triggers_prior_decision_id_fkey"
            columns: ["prior_decision_id"]
            isOneToOne: false
            referencedRelation: "underwriting_decisions"
            referencedColumns: ["decision_id"]
          },
          {
            foreignKeyName: "reunderwriting_triggers_resolution_decision_id_fkey"
            columns: ["resolution_decision_id"]
            isOneToOne: false
            referencedRelation: "underwriting_decisions"
            referencedColumns: ["decision_id"]
          },
        ]
      }
      review_assignments: {
        Row: {
          application_id: string
          assigned_at: string
          assignment_id: string
          created_at: string
          created_by: string | null
          customer_id: string | null
          due_by: string | null
          idempotency_key: string
          reviewer_id: string | null
          status: string
          status_changed_at: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          application_id: string
          assigned_at?: string
          assignment_id?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          due_by?: string | null
          idempotency_key: string
          reviewer_id?: string | null
          status?: string
          status_changed_at?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          application_id?: string
          assigned_at?: string
          assignment_id?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          due_by?: string | null
          idempotency_key?: string
          reviewer_id?: string | null
          status?: string
          status_changed_at?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "review_assignments_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "credit_applications"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "review_assignments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_assignments_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_obligations: {
        Row: {
          amount: number
          created_at: string
          credit_account_id: string
          currency_code: string
          customer_id: string | null
          due_date: string
          fee_amount: number
          idempotency_key: string
          interest_amount: number
          invoice_generation_status: string
          invoice_id: string | null
          obligation_id: string
          obligation_type: string
          principal_amount: number
          schedule_id: string
          sequence_number: number
          status: string
          updated_at: string
        }
        Insert: {
          amount?: number
          created_at?: string
          credit_account_id: string
          currency_code?: string
          customer_id?: string | null
          due_date: string
          fee_amount?: number
          idempotency_key: string
          interest_amount?: number
          invoice_generation_status?: string
          invoice_id?: string | null
          obligation_id?: string
          obligation_type: string
          principal_amount?: number
          schedule_id: string
          sequence_number: number
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          credit_account_id?: string
          currency_code?: string
          customer_id?: string | null
          due_date?: string
          fee_amount?: number
          idempotency_key?: string
          interest_amount?: number
          invoice_generation_status?: string
          invoice_id?: string | null
          obligation_id?: string
          obligation_type?: string
          principal_amount?: number
          schedule_id?: string
          sequence_number?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_obligations_credit_account_id_fkey"
            columns: ["credit_account_id"]
            isOneToOne: false
            referencedRelation: "credit_accounts"
            referencedColumns: ["credit_account_id"]
          },
          {
            foreignKeyName: "scheduled_obligations_credit_account_id_fkey"
            columns: ["credit_account_id"]
            isOneToOne: false
            referencedRelation: "v_credit_portfolio_account_facts"
            referencedColumns: ["credit_account_id"]
          },
          {
            foreignKeyName: "scheduled_obligations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_obligations_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoice"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_obligations_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "repayment_schedules"
            referencedColumns: ["schedule_id"]
          },
        ]
      }
      score_events: {
        Row: {
          created_at: string
          created_by: string | null
          driver_id: string
          driving_event_id: string | null
          event_type: string | null
          id: string
          reason: string
          rental_id: string | null
          score_delta: number
          source: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          driver_id: string
          driving_event_id?: string | null
          event_type?: string | null
          id?: string
          reason: string
          rental_id?: string | null
          score_delta: number
          source?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          driver_id?: string
          driving_event_id?: string | null
          event_type?: string | null
          id?: string
          reason?: string
          rental_id?: string | null
          score_delta?: number
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "score_events_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "score_events_driving_event_id_fkey"
            columns: ["driving_event_id"]
            isOneToOne: false
            referencedRelation: "driving_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "score_events_rental_id_fkey"
            columns: ["rental_id"]
            isOneToOne: false
            referencedRelation: "rentals"
            referencedColumns: ["id"]
          },
        ]
      }
      scoring_config: {
        Row: {
          config_key: string
          config_value: Json
          description: string | null
          id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          config_key: string
          config_value: Json
          description?: string | null
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          config_key?: string
          config_value?: Json
          description?: string | null
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scoring_config_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      support_ticket_messages: {
        Row: {
          attachment_url: string | null
          created_at: string
          id: string
          message: string
          sender_id: string
          sender_type: string
          ticket_id: string
          transcript: string | null
          transcript_lang: string | null
          transcript_status: string | null
          voice_storage_path: string | null
        }
        Insert: {
          attachment_url?: string | null
          created_at?: string
          id?: string
          message: string
          sender_id: string
          sender_type: string
          ticket_id: string
          transcript?: string | null
          transcript_lang?: string | null
          transcript_status?: string | null
          voice_storage_path?: string | null
        }
        Update: {
          attachment_url?: string | null
          created_at?: string
          id?: string
          message?: string
          sender_id?: string
          sender_type?: string
          ticket_id?: string
          transcript?: string | null
          transcript_lang?: string | null
          transcript_status?: string | null
          voice_storage_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_ticket_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          assigned_to: string | null
          category: string
          created_at: string
          customer_id: string | null
          description: string
          driver_id: string
          id: string
          priority: string
          resolved_at: string | null
          status: string
          subject: string
          ticket_number: string | null
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          category: string
          created_at?: string
          customer_id?: string | null
          description: string
          driver_id: string
          id?: string
          priority?: string
          resolved_at?: string | null
          status?: string
          subject: string
          ticket_number?: string | null
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          category?: string
          created_at?: string
          customer_id?: string | null
          description?: string
          driver_id?: string
          id?: string
          priority?: string
          resolved_at?: string | null
          status?: string
          subject?: string
          ticket_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      telemetry_events: {
        Row: {
          average_speed_kmh: number | null
          customer_id: string | null
          distance_km: number
          driver_id: string
          event_date: string
          fuel_level: number | null
          harsh_braking_count: number
          id: string
          idle_time_minutes: number
          last_location_lat: number | null
          last_location_lng: number | null
          overspeeding_count: number
          raw_data: Json | null
          synced_at: string
          vehicle_id: string
        }
        Insert: {
          average_speed_kmh?: number | null
          customer_id?: string | null
          distance_km?: number
          driver_id: string
          event_date: string
          fuel_level?: number | null
          harsh_braking_count?: number
          id?: string
          idle_time_minutes?: number
          last_location_lat?: number | null
          last_location_lng?: number | null
          overspeeding_count?: number
          raw_data?: Json | null
          synced_at?: string
          vehicle_id: string
        }
        Update: {
          average_speed_kmh?: number | null
          customer_id?: string | null
          distance_km?: number
          driver_id?: string
          event_date?: string
          fuel_level?: number | null
          harsh_braking_count?: number
          id?: string
          idle_time_minutes?: number
          last_location_lat?: number | null
          last_location_lng?: number | null
          overspeeding_count?: number
          raw_data?: Json | null
          synced_at?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "telemetry_events_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telemetry_events_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telemetry_events_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telemetry_events_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      traffic_violations: {
        Row: {
          amount: number
          attribution_method: string | null
          created_at: string
          created_by: string | null
          currency: string
          customer_id: string | null
          driver_id: string | null
          gps_matched: boolean
          id: string
          license_plate: string
          location: string | null
          notes: string | null
          paid_at: string | null
          payment_due_date: string | null
          payment_reference: string | null
          pdf_url: string | null
          pv_number: string | null
          raw_data: Json | null
          rental_id: string | null
          source: string
          status: string
          synced_at: string | null
          updated_at: string
          vehicle_id: string | null
          violation_date: string
          violation_type: string
        }
        Insert: {
          amount?: number
          attribution_method?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_id?: string | null
          driver_id?: string | null
          gps_matched?: boolean
          id?: string
          license_plate: string
          location?: string | null
          notes?: string | null
          paid_at?: string | null
          payment_due_date?: string | null
          payment_reference?: string | null
          pdf_url?: string | null
          pv_number?: string | null
          raw_data?: Json | null
          rental_id?: string | null
          source?: string
          status?: string
          synced_at?: string | null
          updated_at?: string
          vehicle_id?: string | null
          violation_date: string
          violation_type: string
        }
        Update: {
          amount?: number
          attribution_method?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_id?: string | null
          driver_id?: string | null
          gps_matched?: boolean
          id?: string
          license_plate?: string
          location?: string | null
          notes?: string | null
          paid_at?: string | null
          payment_due_date?: string | null
          payment_reference?: string | null
          pdf_url?: string | null
          pv_number?: string | null
          raw_data?: Json | null
          rental_id?: string | null
          source?: string
          status?: string
          synced_at?: string | null
          updated_at?: string
          vehicle_id?: string | null
          violation_date?: string
          violation_type?: string
        }
        Relationships: []
      }
      training_modules: {
        Row: {
          category: string
          content: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          description: string | null
          due_days: number | null
          duration_minutes: number | null
          id: string
          is_mandatory: boolean
          is_published: boolean
          order_index: number | null
          quiz: Json | null
          thumbnail_url: string | null
          title: string
          updated_at: string
          video_url: string | null
        }
        Insert: {
          category?: string
          content?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          description?: string | null
          due_days?: number | null
          duration_minutes?: number | null
          id?: string
          is_mandatory?: boolean
          is_published?: boolean
          order_index?: number | null
          quiz?: Json | null
          thumbnail_url?: string | null
          title: string
          updated_at?: string
          video_url?: string | null
        }
        Update: {
          category?: string
          content?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          description?: string | null
          due_days?: number | null
          duration_minutes?: number | null
          id?: string
          is_mandatory?: boolean
          is_published?: boolean
          order_index?: number | null
          quiz?: Json | null
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "training_modules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_modules_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      training_progress: {
        Row: {
          completed_at: string | null
          created_at: string
          driver_id: string
          id: string
          module_id: string
          progress_percent: number
          score: number | null
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          driver_id: string
          id?: string
          module_id: string
          progress_percent?: number
          score?: number | null
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          driver_id?: string
          id?: string
          module_id?: string
          progress_percent?: number
          score?: number | null
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_progress_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_progress_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "training_modules"
            referencedColumns: ["id"]
          },
        ]
      }
      underwriting_conditions: {
        Row: {
          condition_id: string
          condition_type: string
          created_at: string
          created_by: string | null
          customer_id: string | null
          decision_id: string
          description: string
          fulfilled_at: string | null
          fulfilled_by: string | null
          idempotency_key: string | null
          status: string
          status_changed_at: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          condition_id?: string
          condition_type: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          decision_id: string
          description: string
          fulfilled_at?: string | null
          fulfilled_by?: string | null
          idempotency_key?: string | null
          status?: string
          status_changed_at?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          condition_id?: string
          condition_type?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          decision_id?: string
          description?: string
          fulfilled_at?: string | null
          fulfilled_by?: string | null
          idempotency_key?: string | null
          status?: string
          status_changed_at?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "underwriting_conditions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "underwriting_conditions_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "underwriting_decisions"
            referencedColumns: ["decision_id"]
          },
          {
            foreignKeyName: "underwriting_conditions_fulfilled_by_fkey"
            columns: ["fulfilled_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      underwriting_decisions: {
        Row: {
          admin_explanation: string
          application_id: string
          available_exposure_amount: number
          available_exposure_currency_code: string
          created_at: string
          created_by: string | null
          current_exposure_amount: number
          current_exposure_currency_code: string
          customer_id: string | null
          decision: string
          decision_id: string
          decision_risk_level: string | null
          decision_risk_snapshot_json: Json
          decision_score_grade: string | null
          decision_score_value: number | null
          decision_timestamp: string
          decision_valid_until: string | null
          driver_explanation: string
          evaluated_policy_set_id: string | null
          evaluated_policy_snapshot_json: Json
          evaluated_policy_version: number
          exposure_assessment: string
          extension_results_json: Json
          financial_assessment: string
          idempotency_key: string
          maximum_exposure_amount: number
          maximum_exposure_currency_code: string
          reason_codes_json: Json
          requested_exposure_amount: number
          requested_exposure_currency_code: string
          reviewer_id: string | null
          risk_assessment: string
          status_changed_at: string
          trust_assessment: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          admin_explanation: string
          application_id: string
          available_exposure_amount?: number
          available_exposure_currency_code?: string
          created_at?: string
          created_by?: string | null
          current_exposure_amount?: number
          current_exposure_currency_code?: string
          customer_id?: string | null
          decision: string
          decision_id?: string
          decision_risk_level?: string | null
          decision_risk_snapshot_json?: Json
          decision_score_grade?: string | null
          decision_score_value?: number | null
          decision_timestamp?: string
          decision_valid_until?: string | null
          driver_explanation: string
          evaluated_policy_set_id?: string | null
          evaluated_policy_snapshot_json?: Json
          evaluated_policy_version?: number
          exposure_assessment: string
          extension_results_json?: Json
          financial_assessment: string
          idempotency_key: string
          maximum_exposure_amount?: number
          maximum_exposure_currency_code?: string
          reason_codes_json?: Json
          requested_exposure_amount?: number
          requested_exposure_currency_code?: string
          reviewer_id?: string | null
          risk_assessment: string
          status_changed_at?: string
          trust_assessment: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          admin_explanation?: string
          application_id?: string
          available_exposure_amount?: number
          available_exposure_currency_code?: string
          created_at?: string
          created_by?: string | null
          current_exposure_amount?: number
          current_exposure_currency_code?: string
          customer_id?: string | null
          decision?: string
          decision_id?: string
          decision_risk_level?: string | null
          decision_risk_snapshot_json?: Json
          decision_score_grade?: string | null
          decision_score_value?: number | null
          decision_timestamp?: string
          decision_valid_until?: string | null
          driver_explanation?: string
          evaluated_policy_set_id?: string | null
          evaluated_policy_snapshot_json?: Json
          evaluated_policy_version?: number
          exposure_assessment?: string
          extension_results_json?: Json
          financial_assessment?: string
          idempotency_key?: string
          maximum_exposure_amount?: number
          maximum_exposure_currency_code?: string
          reason_codes_json?: Json
          requested_exposure_amount?: number
          requested_exposure_currency_code?: string
          reviewer_id?: string | null
          risk_assessment?: string
          status_changed_at?: string
          trust_assessment?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "underwriting_decisions_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "credit_applications"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "underwriting_decisions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "underwriting_decisions_evaluated_policy_set_id_fkey"
            columns: ["evaluated_policy_set_id"]
            isOneToOne: false
            referencedRelation: "credit_policy_sets"
            referencedColumns: ["policy_id"]
          },
          {
            foreignKeyName: "underwriting_decisions_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      underwriting_overrides: {
        Row: {
          affected_policies_json: Json
          after_state_json: Json
          before_state_json: Json
          created_at: string
          created_by: string | null
          customer_id: string | null
          decision_id: string
          idempotency_key: string
          override_id: string
          reason: string
          reviewer_id: string | null
          second_approver_id: string | null
          timestamp: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          affected_policies_json?: Json
          after_state_json?: Json
          before_state_json?: Json
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          decision_id: string
          idempotency_key: string
          override_id?: string
          reason: string
          reviewer_id?: string | null
          second_approver_id?: string | null
          timestamp?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          affected_policies_json?: Json
          after_state_json?: Json
          before_state_json?: Json
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          decision_id?: string
          idempotency_key?: string
          override_id?: string
          reason?: string
          reviewer_id?: string | null
          second_approver_id?: string | null
          timestamp?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "underwriting_overrides_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "underwriting_overrides_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "underwriting_decisions"
            referencedColumns: ["decision_id"]
          },
          {
            foreignKeyName: "underwriting_overrides_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "underwriting_overrides_second_approver_id_fkey"
            columns: ["second_approver_id"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_immobilization_commands: {
        Row: {
          acknowledged_at: string | null
          created_at: string
          customer_id: string | null
          error_message: string | null
          id: string
          inspection_id: string | null
          reason: string | null
          requested_by: string | null
          sent_at: string | null
          source: string
          status: string
          updated_at: string
          vehicle_id: string
        }
        Insert: {
          acknowledged_at?: string | null
          created_at?: string
          customer_id?: string | null
          error_message?: string | null
          id?: string
          inspection_id?: string | null
          reason?: string | null
          requested_by?: string | null
          sent_at?: string | null
          source?: string
          status?: string
          updated_at?: string
          vehicle_id: string
        }
        Update: {
          acknowledged_at?: string | null
          created_at?: string
          customer_id?: string | null
          error_message?: string | null
          id?: string
          inspection_id?: string | null
          reason?: string | null
          requested_by?: string | null
          sent_at?: string | null
          source?: string
          status?: string
          updated_at?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_immobilization_commands_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_immobilization_commands_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "vehicle_inspections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_immobilization_commands_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_immobilization_commands_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_inspection_photos: {
        Row: {
          created_at: string
          customer_id: string | null
          driver_id: string | null
          id: string
          inspection_id: string
          item_type: string
          label: string | null
          notes: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          storage_path: string
          submitted_at: string | null
          updated_at: string
          validation_status: string
          vehicle_id: string | null
          zone: string
        }
        Insert: {
          created_at?: string
          customer_id?: string | null
          driver_id?: string | null
          id?: string
          inspection_id: string
          item_type?: string
          label?: string | null
          notes?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          storage_path: string
          submitted_at?: string | null
          updated_at?: string
          validation_status?: string
          vehicle_id?: string | null
          zone: string
        }
        Update: {
          created_at?: string
          customer_id?: string | null
          driver_id?: string | null
          id?: string
          inspection_id?: string
          item_type?: string
          label?: string | null
          notes?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          storage_path?: string
          submitted_at?: string | null
          updated_at?: string
          validation_status?: string
          vehicle_id?: string | null
          zone?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_inspection_photos_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_inspection_photos_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_inspection_photos_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "vehicle_inspections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_inspection_photos_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_inspection_photos_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_inspections: {
        Row: {
          created_at: string
          customer_id: string | null
          cycle_days: number
          driver_id: string | null
          due_at: string
          id: string
          immobilization_cancelled_at: string | null
          immobilization_command_ref: string | null
          immobilization_reason: string | null
          immobilization_requested_at: string | null
          immobilization_requested_by: string | null
          immobilization_state: string
          immobilized_at: string | null
          last_reminder_at: string | null
          last_validated_at: string | null
          notes: string | null
          rejection_reason: string | null
          reminder_count: number
          rental_id: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          submitted_at: string | null
          updated_at: string
          validated_at: string | null
          validated_by: string | null
          vehicle_id: string
        }
        Insert: {
          created_at?: string
          customer_id?: string | null
          cycle_days?: number
          driver_id?: string | null
          due_at?: string
          id?: string
          immobilization_cancelled_at?: string | null
          immobilization_command_ref?: string | null
          immobilization_reason?: string | null
          immobilization_requested_at?: string | null
          immobilization_requested_by?: string | null
          immobilization_state?: string
          immobilized_at?: string | null
          last_reminder_at?: string | null
          last_validated_at?: string | null
          notes?: string | null
          rejection_reason?: string | null
          reminder_count?: number
          rental_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string | null
          updated_at?: string
          validated_at?: string | null
          validated_by?: string | null
          vehicle_id: string
        }
        Update: {
          created_at?: string
          customer_id?: string | null
          cycle_days?: number
          driver_id?: string | null
          due_at?: string
          id?: string
          immobilization_cancelled_at?: string | null
          immobilization_command_ref?: string | null
          immobilization_reason?: string | null
          immobilization_requested_at?: string | null
          immobilization_requested_by?: string | null
          immobilization_state?: string
          immobilized_at?: string | null
          last_reminder_at?: string | null
          last_validated_at?: string | null
          notes?: string | null
          rejection_reason?: string | null
          reminder_count?: number
          rental_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string | null
          updated_at?: string
          validated_at?: string | null
          validated_by?: string | null
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_inspections_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_inspections_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_inspections_rental_id_fkey"
            columns: ["rental_id"]
            isOneToOne: false
            referencedRelation: "rentals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_inspections_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_inspections_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_location_history: {
        Row: {
          customer_id: string | null
          heading: number | null
          id: string
          ignition: string | null
          imei_no: string
          lat: number
          lng: number
          recorded_at: string
          speed: number
          status: string
          synced_at: string
          vehicle_no: string
        }
        Insert: {
          customer_id?: string | null
          heading?: number | null
          id?: string
          ignition?: string | null
          imei_no?: string
          lat: number
          lng: number
          recorded_at?: string
          speed?: number
          status?: string
          synced_at?: string
          vehicle_no: string
        }
        Update: {
          customer_id?: string | null
          heading?: number | null
          id?: string
          ignition?: string | null
          imei_no?: string
          lat?: number
          lng?: number
          recorded_at?: string
          speed?: number
          status?: string
          synced_at?: string
          vehicle_no?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_location_history_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_positions: {
        Row: {
          company: string | null
          customer_id: string | null
          device_name: string | null
          driver_name: string | null
          fuel_level: number | null
          heading: number | null
          id: string
          ignition: string | null
          imei_no: string
          last_update: string | null
          lat: number
          lng: number
          speed: number
          status: string
          synced_at: string
          vehicle_no: string
        }
        Insert: {
          company?: string | null
          customer_id?: string | null
          device_name?: string | null
          driver_name?: string | null
          fuel_level?: number | null
          heading?: number | null
          id?: string
          ignition?: string | null
          imei_no?: string
          last_update?: string | null
          lat?: number
          lng?: number
          speed?: number
          status?: string
          synced_at?: string
          vehicle_no: string
        }
        Update: {
          company?: string | null
          customer_id?: string | null
          device_name?: string | null
          driver_name?: string | null
          fuel_level?: number | null
          heading?: number | null
          id?: string
          ignition?: string | null
          imei_no?: string
          last_update?: string | null
          lat?: number
          lng?: number
          speed?: number
          status?: string
          synced_at?: string
          vehicle_no?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_positions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          created_at: string
          customer_id: string | null
          fleet_group: string | null
          gps_active: boolean | null
          gps_installed_at: string | null
          id: string
          image_url: string | null
          import_notes: string | null
          is_test: boolean
          license_plate: string
          make: string | null
          model_name: string
          model_year: number | null
          rent_per_day: number
          sim_number: string | null
          status: string
          uffizio_device_id: string | null
          uffizio_imei: string | null
          updated_at: string
          vehicle_type: string
        }
        Insert: {
          created_at?: string
          customer_id?: string | null
          fleet_group?: string | null
          gps_active?: boolean | null
          gps_installed_at?: string | null
          id?: string
          image_url?: string | null
          import_notes?: string | null
          is_test?: boolean
          license_plate: string
          make?: string | null
          model_name: string
          model_year?: number | null
          rent_per_day: number
          sim_number?: string | null
          status?: string
          uffizio_device_id?: string | null
          uffizio_imei?: string | null
          updated_at?: string
          vehicle_type: string
        }
        Update: {
          created_at?: string
          customer_id?: string | null
          fleet_group?: string | null
          gps_active?: boolean | null
          gps_installed_at?: string | null
          id?: string
          image_url?: string | null
          import_notes?: string | null
          is_test?: boolean
          license_plate?: string
          make?: string | null
          model_name?: string
          model_year?: number | null
          rent_per_day?: number
          sim_number?: string | null
          status?: string
          uffizio_device_id?: string | null
          uffizio_imei?: string | null
          updated_at?: string
          vehicle_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      vendors: {
        Row: {
          contact_information_json: Json
          country: string
          created_at: string
          customer_id: string | null
          status: string
          updated_at: string
          vendor_id: string
          vendor_name: string
          vendor_type: string
        }
        Insert: {
          contact_information_json?: Json
          country?: string
          created_at?: string
          customer_id?: string | null
          status?: string
          updated_at?: string
          vendor_id?: string
          vendor_name: string
          vendor_type: string
        }
        Update: {
          contact_information_json?: Json
          country?: string
          created_at?: string
          customer_id?: string | null
          status?: string
          updated_at?: string
          vendor_id?: string
          vendor_name?: string
          vendor_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendors_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_credit_analytics_freshness: {
        Row: {
          checked_at: string | null
          customer_id: string | null
          data_freshness_note: string | null
          data_freshness_status: string | null
          last_updated_at: string | null
          source_name: string | null
        }
        Relationships: []
      }
      v_credit_branch_performance: {
        Row: {
          active_accounts: number | null
          branch_name: string | null
          calculation_logic: string | null
          city: string | null
          completed_ownership_count: number | null
          customer_id: string | null
          data_freshness_status: string | null
          default_review_accounts: number | null
          delinquency_rate: number | null
          deployed_exposure: number | null
          last_updated_at: string | null
          outstanding_balance: number | null
          past_due_amount: number | null
          risk_signal: string | null
          source_records_json: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "credit_accounts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      v_credit_collections_queue: {
        Row: {
          active_promise_id: string | null
          assigned_to: string | null
          case_id: string | null
          created_at: string | null
          credit_account_id: string | null
          currency_code: string | null
          current_status: string | null
          current_status_label: string | null
          customer_id: string | null
          days_past_due: number | null
          delinquency_status: string | null
          delinquency_status_label: string | null
          driver_id: string | null
          driver_name: string | null
          driver_phone: string | null
          due_date: string | null
          escalation_level: number | null
          invoice_id: string | null
          invoice_number: string | null
          invoice_status: string | null
          obligation_id: string | null
          open_escalation_id: string | null
          open_escalation_type: string | null
          opened_at: string | null
          priority_score: number | null
          product_id: string | null
          product_name: string | null
          product_type: string | null
          promise_status: string | null
          promised_amount: number | null
          promised_payment_date: string | null
          risk_level: string | null
          schedule_id: string | null
          score_impact: number | null
          sequence_number: number | null
          severity: string | null
          total_past_due_amount: number | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "credit_collections_cases_credit_account_id_fkey"
            columns: ["credit_account_id"]
            isOneToOne: false
            referencedRelation: "credit_accounts"
            referencedColumns: ["credit_account_id"]
          },
          {
            foreignKeyName: "credit_collections_cases_credit_account_id_fkey"
            columns: ["credit_account_id"]
            isOneToOne: false
            referencedRelation: "v_credit_portfolio_account_facts"
            referencedColumns: ["credit_account_id"]
          },
          {
            foreignKeyName: "credit_collections_cases_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_collections_cases_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_collections_cases_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoice"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_collections_cases_obligation_id_fkey"
            columns: ["obligation_id"]
            isOneToOne: false
            referencedRelation: "scheduled_obligations"
            referencedColumns: ["obligation_id"]
          },
          {
            foreignKeyName: "credit_collections_cases_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "credit_products"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "credit_collections_cases_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_credit_product_performance"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "credit_collections_cases_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "repayment_schedules"
            referencedColumns: ["schedule_id"]
          },
        ]
      }
      v_credit_collections_reconciliation_anomalies: {
        Row: {
          anomaly_id: string | null
          anomaly_type: string | null
          case_id: string | null
          credit_account_id: string | null
          customer_id: string | null
          details_json: Json | null
          detected_at: string | null
          invoice_id: string | null
          obligation_id: string | null
          severity: string | null
        }
        Relationships: []
      }
      v_credit_collector_performance: {
        Row: {
          active_promises: number | null
          broken_promises: number | null
          calculation_logic: string | null
          collector_id: string | null
          collector_name: string | null
          customer_id: string | null
          data_freshness_status: string | null
          last_updated_at: string | null
          open_cases: number | null
          recovered_case_amount: number | null
          recovery_rate: number | null
          resolved_cases: number | null
          source_records_json: Json | null
          total_case_amount: number | null
        }
        Relationships: [
          {
            foreignKeyName: "credit_collections_cases_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      v_credit_default_reconciliation_anomalies: {
        Row: {
          anomaly_id: string | null
          anomaly_type: string | null
          credit_account_id: string | null
          customer_id: string | null
          default_review_id: string | null
          details_json: Json | null
          detected_at: string | null
          severity: string | null
        }
        Relationships: []
      }
      v_credit_default_review_queue: {
        Row: {
          active_recovery_plan_id: string | null
          assigned_reviewer: string | null
          closed_at: string | null
          closure_reason: string | null
          collections_case_id: string | null
          created_at: string | null
          credit_account_id: string | null
          currency_code: string | null
          customer_id: string | null
          days_past_due: number | null
          decision_due_at: string | null
          decision_timestamp: string | null
          default_decision_id: string | null
          default_review_id: string | null
          driver_id: string | null
          driver_name: string | null
          driver_phone: string | null
          evidence_count: number | null
          evidence_status: string | null
          formal_default_notice_sent: boolean | null
          latest_decision: string | null
          open_asset_review_id: string | null
          opened_at: string | null
          past_due_amount: number | null
          product_id: string | null
          product_name: string | null
          product_type: string | null
          sent_notice_count: number | null
          status: string | null
          status_changed_at: string | null
          status_label: string | null
          trigger_reason: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "credit_default_reviews_collections_case_id_fkey"
            columns: ["collections_case_id"]
            isOneToOne: false
            referencedRelation: "credit_collections_cases"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "credit_default_reviews_collections_case_id_fkey"
            columns: ["collections_case_id"]
            isOneToOne: false
            referencedRelation: "v_credit_collections_queue"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "credit_default_reviews_credit_account_id_fkey"
            columns: ["credit_account_id"]
            isOneToOne: false
            referencedRelation: "credit_accounts"
            referencedColumns: ["credit_account_id"]
          },
          {
            foreignKeyName: "credit_default_reviews_credit_account_id_fkey"
            columns: ["credit_account_id"]
            isOneToOne: false
            referencedRelation: "v_credit_portfolio_account_facts"
            referencedColumns: ["credit_account_id"]
          },
          {
            foreignKeyName: "credit_default_reviews_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_default_reviews_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_default_reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "credit_products"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "credit_default_reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_credit_product_performance"
            referencedColumns: ["product_id"]
          },
        ]
      }
      v_credit_executive_attention_items: {
        Row: {
          assigned_owner_role: string | null
          attention_item_id: string | null
          created_at: string | null
          customer_id: string | null
          description: string | null
          item_type: string | null
          recommended_action: string | null
          record_link: string | null
          severity: string | null
          source_data_json: Json | null
          source_reference_id: string | null
          source_reference_type: string | null
          status: string | null
          title: string | null
          updated_at: string | null
        }
        Relationships: []
      }
      v_credit_growth_ownership_funnel: {
        Row: {
          calculation_logic: string | null
          conversion_rate: number | null
          customer_id: string | null
          data_freshness_status: string | null
          last_updated_at: string | null
          record_count: number | null
          source_records_json: Json | null
          source_tables: string | null
          stage_key: string | null
          stage_label: string | null
          stage_order: number | null
        }
        Relationships: []
      }
      v_credit_portfolio_account_facts: {
        Row: {
          account_status: string | null
          activated_at: string | null
          asset_transferred: boolean | null
          branch_name: string | null
          certificate_issued: boolean | null
          city: string | null
          created_at: string | null
          credit_account_id: string | null
          currency_code: string | null
          customer_id: string | null
          data_freshness_status: string | null
          days_past_due: number | null
          default_review_amount: number | null
          default_reviews_open: number | null
          driver_id: string | null
          driver_name: string | null
          driver_phone: string | null
          driver_score: number | null
          driver_tier: string | null
          formal_default_amount: number | null
          formula_description: string | null
          last_refreshed_at: string | null
          obligation_count: number | null
          open_collections_cases: number | null
          outstanding_balance: number | null
          ownership_completed_at: string | null
          ownership_status: string | null
          paid_amount: number | null
          past_due_amount: number | null
          principal_amount: number | null
          product_id: string | null
          product_name: string | null
          product_status: string | null
          product_type: string | null
          product_version_id: string | null
          risk_segment: string | null
          source_records_json: Json | null
          source_tables: string | null
          source_updated_at: string | null
          total_scheduled_amount: number | null
        }
        Relationships: [
          {
            foreignKeyName: "credit_accounts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_accounts_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_accounts_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "credit_products"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "credit_accounts_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_credit_product_performance"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "credit_accounts_product_version_id_fkey"
            columns: ["product_version_id"]
            isOneToOne: false
            referencedRelation: "product_versions"
            referencedColumns: ["version_id"]
          },
        ]
      }
      v_credit_portfolio_health: {
        Row: {
          active_credit_accounts: number | null
          active_product_count: number | null
          calculation_logic: string | null
          completed_ownership_count: number | null
          current_outstanding_balance: number | null
          customer_id: string | null
          data_freshness_note: string | null
          data_freshness_status: string | null
          default_review_amount: number | null
          filters_applied: string | null
          formally_defaulted_amount: number | null
          last_updated_at: string | null
          portfolio_at_risk_amount: number | null
          portfolio_at_risk_rate: number | null
          source_records_json: Json | null
          source_view: string | null
          total_deployed_exposure: number | null
          total_paid_to_date: number | null
          total_past_due_amount: number | null
        }
        Relationships: [
          {
            foreignKeyName: "credit_accounts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      v_credit_product_performance: {
        Row: {
          activated_accounts: number | null
          activation_rate: number | null
          applications_submitted: number | null
          approval_rate: number | null
          average_down_payment: number | null
          average_financed_amount: number | null
          average_repayment_performance: number | null
          calculation_logic: string | null
          completion_rate: number | null
          contracts_signed: number | null
          conversion_from_eligibility_to_activation: number | null
          customer_id: string | null
          data_freshness_status: string | null
          default_review_rate: number | null
          delinquency_rate: number | null
          exposure_outstanding: number | null
          last_updated_at: string | null
          performance_trend: string | null
          product_id: string | null
          product_name: string | null
          product_status: string | null
          product_type: string | null
          recommended_action: string | null
          revenue_collected: number | null
          risk_signal: string | null
          source_records_json: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "credit_products_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      v_credit_reconciliation_summary: {
        Row: {
          anomaly_id: string | null
          anomaly_type: string | null
          calculation_logic: string | null
          customer_id: string | null
          data_freshness_status: string | null
          details_json: Json | null
          detected_at: string | null
          severity: string | null
          source_reference_id: string | null
        }
        Relationships: []
      }
      v_credit_risk_delinquency_summary: {
        Row: {
          account_count: number | null
          asset_protection_reviews: number | null
          calculation_logic: string | null
          collections_cases_open: number | null
          customer_id: string | null
          data_freshness_status: string | null
          default_reviews_open: number | null
          last_updated_at: string | null
          max_days_past_due: number | null
          outstanding_amount: number | null
          past_due_amount: number | null
          segment_key: string | null
          segment_label: string | null
          segment_order: number | null
          source_records_json: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "credit_accounts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      v_credit_schedule_reconciliation_anomalies: {
        Row: {
          anomaly_id: string | null
          anomaly_type: string | null
          credit_account_id: string | null
          customer_id: string | null
          details_json: Json | null
          detected_at: string | null
          invoice_id: string | null
          obligation_id: string | null
          schedule_id: string | null
          severity: string | null
        }
        Relationships: []
      }
      v_driver_ownership_completion_status: {
        Row: {
          asset_description: string | null
          asset_id: string | null
          asset_type: string | null
          blocking_reasons_json: Json | null
          certificate_document_reference: string | null
          certificate_id: string | null
          certificate_number: string | null
          created_at: string | null
          credit_account_id: string | null
          eligibility_checked_at: string | null
          obligation_summary_json: Json | null
          opened_at: string | null
          ownership_date: string | null
          product_name: string | null
          review_id: string | null
          status: string | null
          status_label: string | null
          status_tone: string | null
          transfer_id: string | null
          transfer_status: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ownership_completion_reviews_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "financed_assets"
            referencedColumns: ["asset_id"]
          },
          {
            foreignKeyName: "ownership_completion_reviews_credit_account_id_fkey"
            columns: ["credit_account_id"]
            isOneToOne: false
            referencedRelation: "credit_accounts"
            referencedColumns: ["credit_account_id"]
          },
          {
            foreignKeyName: "ownership_completion_reviews_credit_account_id_fkey"
            columns: ["credit_account_id"]
            isOneToOne: false
            referencedRelation: "v_credit_portfolio_account_facts"
            referencedColumns: ["credit_account_id"]
          },
        ]
      }
      v_ownership_completion_exceptions: {
        Row: {
          asset_id: string | null
          credit_account_id: string | null
          customer_id: string | null
          details_json: Json | null
          detected_at: string | null
          exception_id: string | null
          exception_type: string | null
          review_id: string | null
          severity: string | null
        }
        Relationships: []
      }
      v_ownership_completion_queue: {
        Row: {
          asset_description: string | null
          asset_id: string | null
          asset_type: string | null
          assigned_reviewer: string | null
          blocked_reasons_json: Json | null
          blocker_count: number | null
          blocking_reasons_json: Json | null
          cancelled_at: string | null
          certificate_id: string | null
          certificate_issued_at: string | null
          certificate_number: string | null
          closure_reason: string | null
          completed_at: string | null
          completion_review_id: string | null
          completion_status: string | null
          created_at: string | null
          credit_account_id: string | null
          currency_code: string | null
          customer_id: string | null
          decision_timestamp: string | null
          default_review_status: string | null
          documentation_status: string | null
          driver_id: string | null
          driver_name: string | null
          driver_phone: string | null
          eligibility_checked_at: string | null
          fraud_review_status: string | null
          imei: string | null
          is_eligible: boolean | null
          latest_decision: string | null
          latest_decision_id: string | null
          legal_hold_status: string | null
          obligation_summary_json: Json | null
          opened_at: string | null
          outstanding_balance: number | null
          paid_obligations_count: number | null
          priority_score: number | null
          product_id: string | null
          product_name: string | null
          product_rules_status: string | null
          product_type: string | null
          product_version_id: string | null
          recovery_plan_status: string | null
          reversed_at: string | null
          review_due_at: string | null
          review_id: string | null
          serial_number: string | null
          status: string | null
          status_changed_at: string | null
          status_label: string | null
          total_obligations_count: number | null
          transfer_id: string | null
          transfer_status: string | null
          transfer_type: string | null
          updated_at: string | null
          vin: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ownership_completion_reviews_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "financed_assets"
            referencedColumns: ["asset_id"]
          },
          {
            foreignKeyName: "ownership_completion_reviews_credit_account_id_fkey"
            columns: ["credit_account_id"]
            isOneToOne: false
            referencedRelation: "credit_accounts"
            referencedColumns: ["credit_account_id"]
          },
          {
            foreignKeyName: "ownership_completion_reviews_credit_account_id_fkey"
            columns: ["credit_account_id"]
            isOneToOne: false
            referencedRelation: "v_credit_portfolio_account_facts"
            referencedColumns: ["credit_account_id"]
          },
          {
            foreignKeyName: "ownership_completion_reviews_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ownership_completion_reviews_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ownership_completion_reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "credit_products"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "ownership_completion_reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_credit_product_performance"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "ownership_completion_reviews_product_version_id_fkey"
            columns: ["product_version_id"]
            isOneToOne: false
            referencedRelation: "product_versions"
            referencedColumns: ["version_id"]
          },
        ]
      }
      v_wallet_settlement_anomalies: {
        Row: {
          created_at: string | null
          customer_id: string | null
          debited_amount: number | null
          driver_id: string | null
          invoice_amount_paid: number | null
          invoice_id: string | null
          invoice_number: string | null
          invoice_status: string | null
          invoice_total: number | null
          message: string | null
          payment_id: string | null
          recommended_action: string | null
          severity: string | null
          wallet_txn_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "driver_wallet_transactions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_wallet_transactions_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_wallet_transactions_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoice"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_wallet_transactions_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles_public: {
        Row: {
          created_at: string | null
          customer_id: string | null
          fleet_group: string | null
          id: string | null
          image_url: string | null
          license_plate: string | null
          make: string | null
          model_name: string | null
          model_year: number | null
          rent_per_day: number | null
          status: string | null
          updated_at: string | null
          vehicle_type: string | null
        }
        Insert: {
          created_at?: string | null
          customer_id?: string | null
          fleet_group?: string | null
          id?: string | null
          image_url?: string | null
          license_plate?: string | null
          make?: string | null
          model_name?: string | null
          model_year?: number | null
          rent_per_day?: number | null
          status?: string | null
          updated_at?: string | null
          vehicle_type?: string | null
        }
        Update: {
          created_at?: string | null
          customer_id?: string | null
          fleet_group?: string | null
          id?: string | null
          image_url?: string | null
          license_plate?: string | null
          make?: string | null
          model_name?: string | null
          model_year?: number | null
          rent_per_day?: number | null
          status?: string | null
          updated_at?: string | null
          vehicle_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_balance_view: {
        Row: {
          available_balance: number | null
          customer_id: string | null
          driver_id: string | null
          last_transaction_at: string | null
          total_credits: number | null
          total_debits: number | null
          transaction_count: number | null
          wallet_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "driver_wallets_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_wallets_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: true
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _settle_wallet_to_payment: {
        Args: {
          p_amount: number
          p_driver_id: string
          p_invoice_id: string
          p_payment_id: string
          p_source?: string
        }
        Returns: number
      }
      abidjan_noon_after: {
        Args: { base_ts: string; days_offset?: number }
        Returns: string
      }
      activate_credit_account: {
        Args: {
          p_application_id: string
          p_idempotency_key?: string
          p_request_hash?: string
        }
        Returns: {
          activated_at: string
          activation_package_id: string
          asset_id: string | null
          created_at: string
          credit_account_id: string
          customer_id: string | null
          driver_id: string
          idempotency_key: string
          principal_amount: number
          principal_currency_code: string
          product_id: string
          product_version_id: string
          status: string
          status_changed_at: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "credit_accounts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      activate_credit_account_3a_core: {
        Args: {
          p_application_id: string
          p_idempotency_key?: string
          p_request_hash?: string
        }
        Returns: {
          activated_at: string
          activation_package_id: string
          asset_id: string | null
          created_at: string
          credit_account_id: string
          customer_id: string | null
          driver_id: string
          idempotency_key: string
          principal_amount: number
          principal_currency_code: string
          product_id: string
          product_version_id: string
          status: string
          status_changed_at: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "credit_accounts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      adjust_rental_deadlines: {
        Args: {
          p_new_final_deadline?: string
          p_new_init_deadline?: string
          p_new_rate?: number
          p_new_return_due_at?: string
          p_reason?: string
          p_rental_id: string
        }
        Returns: {
          approval_date: string | null
          approved_by: string | null
          approved_duration_hours: number | null
          approved_rate: number | null
          created_at: string
          customer_id: string | null
          driver_id: string
          end_date: string | null
          fee_change_reason: string | null
          final_duration_hours: number | null
          final_rate: number | null
          id: string
          payment_due_at: string | null
          payment_due_at_final: string | null
          payment_due_at_initial: string | null
          payment_phase: string | null
          payment_settled_at: string | null
          pickup_confirmed_at: string | null
          pickup_confirmed_by: string | null
          rejection_reason: string | null
          rental_days: number
          requested_rate: number | null
          return_confirmed_at: string | null
          return_due_at: string | null
          return_justification: string | null
          returned_at: string | null
          returned_by: string | null
          start_date: string
          status: string
          total_amount: number | null
          updated_at: string
          vehicle_id: string
        }
        SetofOptions: {
          from: "*"
          to: "rentals"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_can_write_customer_storage_path: {
        Args: { p_name: string }
        Returns: boolean
      }
      admin_create_rental: {
        Args: { p_driver_id: string; p_rate: number; p_vehicle_id: string }
        Returns: string
      }
      admin_sign_credit_contract: {
        Args: {
          p_contract_id: string
          p_idempotency_key?: string
          p_reason?: string
          p_signer_type?: string
        }
        Returns: {
          admin_signed_at: string | null
          application_id: string
          asset_id: string | null
          contract_hash: string
          contract_id: string
          contract_snapshot_json: Json
          contract_status: string
          created_at: string
          created_by: string | null
          credit_account_id: string | null
          customer_id: string | null
          decision_id: string
          decline_reason: string | null
          declined_at: string | null
          driver_id: string
          driver_signed_at: string | null
          expires_at: string | null
          final_pdf_hash: string | null
          fully_executed_at: string | null
          idempotency_key: string
          product_id: string
          product_version_id: string
          sent_at: string | null
          signature_hash: string | null
          signature_provider: string
          snapshot_hash: string
          status_changed_at: string
          superseded_by_contract_id: string | null
          template_id: string
          template_version: number
          updated_at: string
          updated_by: string | null
          viewed_at: string | null
          void_reason: string | null
          voided_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "credit_contracts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      amend_repayment_schedule: {
        Args: {
          p_amendment_type: string
          p_idempotency_key?: string
          p_new_terms_json?: Json
          p_reason: string
          p_schedule_id: string
        }
        Returns: {
          allow_prepayment: boolean
          allow_schedule_amendment: boolean
          application_id: string
          contract_id: string
          created_at: string
          created_by: string | null
          credit_account_id: string
          currency_code: string
          customer_id: string | null
          final_due_date: string
          financed_amount: number
          first_due_date: string
          frequency: string
          generated_from_contract_hash: string
          generated_from_policy_snapshot_id: string | null
          grace_period_days: number
          idempotency_key: string
          invoice_generation_days_before_due: number
          product_id: string
          product_version_id: string
          schedule_id: string
          schedule_status: string
          schedule_type: string
          schedule_version: number
          source_snapshot_json: Json
          status_changed_at: string
          superseded_by_schedule_id: string | null
          term_count: number
          terms_snapshot_json: Json
          total_fees_amount: number
          total_interest_amount: number
          total_repayment_amount: number
          updated_at: string
          updated_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "repayment_schedules"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      apply_rental_adjustment: {
        Args: {
          p_action: string
          p_adjustment_id: string
          p_reviewer_note?: string
        }
        Returns: {
          adjustment_moment: string
          approval_status: string
          field_changed: string
          id: string
          new_value: number
          old_value: number
          reason: string
          rental_id: string
          requested_at: string
          requested_by: string
          reviewed_at: string | null
          reviewed_by: string | null
          reviewer_note: string | null
        }
        SetofOptions: {
          from: "*"
          to: "rental_adjustments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      apply_wallet_credit_to_open_invoices: {
        Args: { p_driver_id: string }
        Returns: Json
      }
      apply_wallet_to_invoice: {
        Args: {
          p_amount_due: number
          p_driver_id: string
          p_invoice_id: string
          p_payment_id: string
          p_rental_id: string
        }
        Returns: number
      }
      approve_and_activate_rental: {
        Args: { p_rate: number; p_rental_id: string }
        Returns: {
          approval_date: string | null
          approved_by: string | null
          approved_duration_hours: number | null
          approved_rate: number | null
          created_at: string
          customer_id: string | null
          driver_id: string
          end_date: string | null
          fee_change_reason: string | null
          final_duration_hours: number | null
          final_rate: number | null
          id: string
          payment_due_at: string | null
          payment_due_at_final: string | null
          payment_due_at_initial: string | null
          payment_phase: string | null
          payment_settled_at: string | null
          pickup_confirmed_at: string | null
          pickup_confirmed_by: string | null
          rejection_reason: string | null
          rental_days: number
          requested_rate: number | null
          return_confirmed_at: string | null
          return_due_at: string | null
          return_justification: string | null
          returned_at: string | null
          returned_by: string | null
          start_date: string
          status: string
          total_amount: number | null
          updated_at: string
          vehicle_id: string
        }
        SetofOptions: {
          from: "*"
          to: "rentals"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      approve_rental: {
        Args: {
          p_new_duration_hours?: number
          p_new_rate?: number
          p_reason?: string
          p_rental_id: string
        }
        Returns: {
          approval_date: string | null
          approved_by: string | null
          approved_duration_hours: number | null
          approved_rate: number | null
          created_at: string
          customer_id: string | null
          driver_id: string
          end_date: string | null
          fee_change_reason: string | null
          final_duration_hours: number | null
          final_rate: number | null
          id: string
          payment_due_at: string | null
          payment_due_at_final: string | null
          payment_due_at_initial: string | null
          payment_phase: string | null
          payment_settled_at: string | null
          pickup_confirmed_at: string | null
          pickup_confirmed_by: string | null
          rejection_reason: string | null
          rental_days: number
          requested_rate: number | null
          return_confirmed_at: string | null
          return_due_at: string | null
          return_justification: string | null
          returned_at: string | null
          returned_by: string | null
          start_date: string
          status: string
          total_amount: number | null
          updated_at: string
          vehicle_id: string
        }
        SetofOptions: {
          from: "*"
          to: "rentals"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      assign_credit_collections_case: {
        Args: {
          p_assigned_to: string
          p_case_id: string
          p_idempotency_key?: string
          p_note?: string
          p_request_hash?: string
        }
        Returns: {
          assigned_to: string | null
          case_id: string
          closed_at: string | null
          closure_reason: string | null
          created_at: string
          created_by: string | null
          credit_account_id: string
          currency_code: string
          current_status: string
          customer_id: string | null
          days_past_due: number
          delinquency_status: string
          driver_id: string
          escalation_level: number
          idempotency_key: string
          invoice_id: string | null
          obligation_id: string | null
          opened_at: string
          priority_score: number
          product_id: string
          product_version_id: string | null
          request_hash: string | null
          risk_level: string
          rules_snapshot_json: Json
          schedule_id: string | null
          score_impact: number
          severity: string
          status_changed_at: string
          total_past_due_amount: number
          updated_at: string
          updated_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "credit_collections_cases"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      assign_credit_default_review: {
        Args: {
          p_assigned_to?: string
          p_default_review_id: string
          p_idempotency_key?: string
          p_note?: string
          p_request_hash?: string
        }
        Returns: {
          assigned_reviewer: string | null
          closed_at: string | null
          closure_reason: string | null
          collections_case_id: string
          created_at: string
          created_by: string | null
          credit_account_id: string
          currency_code: string
          customer_id: string | null
          days_past_due: number
          decision_due_at: string | null
          default_review_id: string
          driver_id: string
          evidence_status: string
          idempotency_key: string
          opened_at: string
          past_due_amount: number
          product_id: string
          request_hash: string | null
          status: string
          status_changed_at: string
          trigger_reason: string
          updated_at: string
          updated_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "credit_default_reviews"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      assign_ownership_completion_review: {
        Args: {
          p_assigned_to?: string
          p_idempotency_key?: string
          p_note?: string
          p_request_hash?: string
          p_review_id: string
        }
        Returns: {
          asset_id: string
          assigned_reviewer: string | null
          blocking_reasons_json: Json
          cancelled_at: string | null
          closure_reason: string | null
          completed_at: string | null
          completion_metadata_json: Json
          created_at: string
          created_by: string | null
          credit_account_id: string
          customer_id: string | null
          driver_id: string
          eligibility_checked_at: string
          eligibility_snapshot_json: Json
          idempotency_key: string
          obligation_summary_json: Json
          opened_at: string | null
          product_id: string
          product_rules_snapshot_json: Json
          product_version_id: string
          request_hash: string | null
          reversed_at: string | null
          review_due_at: string | null
          review_id: string
          status: string
          status_changed_at: string
          updated_at: string
          updated_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "ownership_completion_reviews"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      attach_credit_default_evidence: {
        Args: {
          p_default_review_id: string
          p_evidence_summary: string
          p_evidence_type: string
          p_idempotency_key?: string
          p_request_hash?: string
          p_source_reference_id?: string
          p_source_reference_type?: string
        }
        Returns: {
          created_at: string
          created_by: string | null
          credit_account_id: string
          customer_id: string | null
          default_review_id: string
          evidence_id: string
          evidence_summary: string
          evidence_type: string
          idempotency_key: string
          locked_at: string | null
          request_hash: string | null
          source_reference_id: string | null
          source_reference_type: string | null
        }
        SetofOptions: {
          from: "*"
          to: "credit_default_evidence"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      break_promise_to_pay: {
        Args: {
          p_idempotency_key?: string
          p_promise_id: string
          p_reason?: string
          p_request_hash?: string
        }
        Returns: {
          broken_at: string | null
          case_id: string
          created_at: string
          created_by: string | null
          currency_code: string
          customer_id: string | null
          driver_id: string
          fulfilled_at: string | null
          idempotency_key: string
          promise_id: string
          promise_status: string
          promised_amount: number
          promised_payment_date: string
          request_hash: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "credit_promises_to_pay"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      classify_adjustment: { Args: { actor_id: string }; Returns: string }
      cleanup_vehicle_history: { Args: never; Returns: undefined }
      close_credit_collections_case: {
        Args: {
          p_case_id: string
          p_closure_reason: string
          p_idempotency_key?: string
          p_request_hash?: string
        }
        Returns: {
          assigned_to: string | null
          case_id: string
          closed_at: string | null
          closure_reason: string | null
          created_at: string
          created_by: string | null
          credit_account_id: string
          currency_code: string
          current_status: string
          customer_id: string | null
          days_past_due: number
          delinquency_status: string
          driver_id: string
          escalation_level: number
          idempotency_key: string
          invoice_id: string | null
          obligation_id: string | null
          opened_at: string
          priority_score: number
          product_id: string
          product_version_id: string | null
          request_hash: string | null
          risk_level: string
          rules_snapshot_json: Json
          schedule_id: string | null
          score_impact: number
          severity: string
          status_changed_at: string
          total_past_due_amount: number
          updated_at: string
          updated_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "credit_collections_cases"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      close_credit_default_review: {
        Args: {
          p_closure_reason: string
          p_default_review_id: string
          p_final_status?: string
          p_idempotency_key?: string
          p_request_hash?: string
        }
        Returns: {
          assigned_reviewer: string | null
          closed_at: string | null
          closure_reason: string | null
          collections_case_id: string
          created_at: string
          created_by: string | null
          credit_account_id: string
          currency_code: string
          customer_id: string | null
          days_past_due: number
          decision_due_at: string | null
          default_review_id: string
          driver_id: string
          evidence_status: string
          idempotency_key: string
          opened_at: string
          past_due_amount: number
          product_id: string
          request_hash: string | null
          status: string
          status_changed_at: string
          trigger_reason: string
          updated_at: string
          updated_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "credit_default_reviews"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      collections_audit: {
        Args: {
          p_after?: Json
          p_before?: Json
          p_case_id: string
          p_credit_account_id: string
          p_customer_id: string
          p_event_type: string
          p_idempotency_key?: string
          p_obligation_id: string
          p_reason?: string
          p_request_hash?: string
        }
        Returns: string
      }
      collections_case_status_label: {
        Args: { p_status: string }
        Returns: string
      }
      collections_days_past_due: {
        Args: { p_due_date: string }
        Returns: number
      }
      collections_delinquency_status: {
        Args: {
          p_amount_paid: number
          p_due_date: string
          p_invoice_status: string
          p_remaining_due: number
          p_rules: Json
        }
        Returns: string
      }
      collections_emit_score_event: {
        Args: {
          p_customer_id: string
          p_delta: number
          p_driver_id: string
          p_entity_id: string
          p_event_type: string
        }
        Returns: string
      }
      collections_priority_score: {
        Args: {
          p_active_asset?: boolean
          p_amount: number
          p_broken_promise?: boolean
          p_days_past_due: number
          p_multiple_overdue?: boolean
          p_severity: string
        }
        Returns: number
      }
      collections_rules_for_account: {
        Args: { p_credit_account_id: string }
        Returns: Json
      }
      collections_severity: {
        Args: { p_amount: number; p_days_past_due: number; p_status: string }
        Returns: string
      }
      collections_status_label: { Args: { p_status: string }; Returns: string }
      confirm_rental_pickup:
        | {
            Args: {
              p_new_duration_hours?: number
              p_new_rate?: number
              p_pickup_at: string
              p_reason?: string
              p_rental_id: string
            }
            Returns: {
              approval_date: string | null
              approved_by: string | null
              approved_duration_hours: number | null
              approved_rate: number | null
              created_at: string
              customer_id: string | null
              driver_id: string
              end_date: string | null
              fee_change_reason: string | null
              final_duration_hours: number | null
              final_rate: number | null
              id: string
              payment_due_at: string | null
              payment_due_at_final: string | null
              payment_due_at_initial: string | null
              payment_phase: string | null
              payment_settled_at: string | null
              pickup_confirmed_at: string | null
              pickup_confirmed_by: string | null
              rejection_reason: string | null
              rental_days: number
              requested_rate: number | null
              return_confirmed_at: string | null
              return_due_at: string | null
              return_justification: string | null
              returned_at: string | null
              returned_by: string | null
              start_date: string
              status: string
              total_amount: number | null
              updated_at: string
              vehicle_id: string
            }
            SetofOptions: {
              from: "*"
              to: "rentals"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: {
              p_new_duration_hours?: number
              p_new_rate?: number
              p_override_final_deadline?: string
              p_override_initial_deadline?: string
              p_pickup_at: string
              p_reason?: string
              p_rental_id: string
            }
            Returns: {
              approval_date: string | null
              approved_by: string | null
              approved_duration_hours: number | null
              approved_rate: number | null
              created_at: string
              customer_id: string | null
              driver_id: string
              end_date: string | null
              fee_change_reason: string | null
              final_duration_hours: number | null
              final_rate: number | null
              id: string
              payment_due_at: string | null
              payment_due_at_final: string | null
              payment_due_at_initial: string | null
              payment_phase: string | null
              payment_settled_at: string | null
              pickup_confirmed_at: string | null
              pickup_confirmed_by: string | null
              rejection_reason: string | null
              rental_days: number
              requested_rate: number | null
              return_confirmed_at: string | null
              return_due_at: string | null
              return_justification: string | null
              returned_at: string | null
              returned_by: string | null
              start_date: string
              status: string
              total_amount: number | null
              updated_at: string
              vehicle_id: string
            }
            SetofOptions: {
              from: "*"
              to: "rentals"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      confirm_rental_return: {
        Args: {
          p_direct?: boolean
          p_justification?: string
          p_rental_id: string
        }
        Returns: {
          approval_date: string | null
          approved_by: string | null
          approved_duration_hours: number | null
          approved_rate: number | null
          created_at: string
          customer_id: string | null
          driver_id: string
          end_date: string | null
          fee_change_reason: string | null
          final_duration_hours: number | null
          final_rate: number | null
          id: string
          payment_due_at: string | null
          payment_due_at_final: string | null
          payment_due_at_initial: string | null
          payment_phase: string | null
          payment_settled_at: string | null
          pickup_confirmed_at: string | null
          pickup_confirmed_by: string | null
          rejection_reason: string | null
          rental_days: number
          requested_rate: number | null
          return_confirmed_at: string | null
          return_due_at: string | null
          return_justification: string | null
          returned_at: string | null
          returned_by: string | null
          start_date: string
          status: string
          total_amount: number | null
          updated_at: string
          vehicle_id: string
        }
        SetofOptions: {
          from: "*"
          to: "rentals"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      contract_apply_signature_progress: {
        Args: { p_contract_id: string; p_idempotency_key?: string }
        Returns: {
          admin_signed_at: string | null
          application_id: string
          asset_id: string | null
          contract_hash: string
          contract_id: string
          contract_snapshot_json: Json
          contract_status: string
          created_at: string
          created_by: string | null
          credit_account_id: string | null
          customer_id: string | null
          decision_id: string
          decline_reason: string | null
          declined_at: string | null
          driver_id: string
          driver_signed_at: string | null
          expires_at: string | null
          final_pdf_hash: string | null
          fully_executed_at: string | null
          idempotency_key: string
          product_id: string
          product_version_id: string
          sent_at: string | null
          signature_hash: string | null
          signature_provider: string
          snapshot_hash: string
          status_changed_at: string
          superseded_by_contract_id: string | null
          template_id: string
          template_version: number
          updated_at: string
          updated_by: string | null
          viewed_at: string | null
          void_reason: string | null
          voided_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "credit_contracts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      contract_audit: {
        Args: {
          p_actor_id: string
          p_actor_type: string
          p_after?: Json
          p_before?: Json
          p_contract_id: string
          p_event_type: string
          p_idempotency_key?: string
          p_reason?: string
        }
        Returns: string
      }
      contract_decrypt_signature_ip: {
        Args: { p_idempotency_key?: string; p_signature_event_id: string }
        Returns: string
      }
      contract_encrypt_ip: { Args: { p_ip: string }; Returns: string }
      contract_normalize_required_signers: {
        Args: { p_required: Json }
        Returns: Json
      }
      contract_signer_sequence: {
        Args: { p_contract_id: string; p_signer_type: string }
        Returns: number
      }
      contract_status_label: { Args: { p_status: string }; Returns: string }
      create_activation_package: {
        Args: {
          p_application_id: string
          p_idempotency_key?: string
          p_request_hash?: string
        }
        Returns: {
          application_id: string
          created_at: string
          created_by: string | null
          customer_id: string | null
          down_payment_invoice_id: string | null
          idempotency_key: string
          package_id: string
          request_hash: string
          status: string
          status_changed_at: string
          updated_at: string
          updated_by: string | null
          validation_results_json: Json
          validation_status: string
        }
        SetofOptions: {
          from: "*"
          to: "activation_packages"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_credit_default_decision: {
        Args: {
          p_decision: string
          p_decision_reason: string
          p_decision_summary?: string
          p_default_review_id: string
          p_driver_notice_required?: boolean
          p_idempotency_key?: string
          p_request_hash?: string
          p_second_approver_id?: string
        }
        Returns: {
          approved_by: string | null
          created_at: string
          credit_account_id: string
          customer_id: string | null
          decision: string
          decision_reason: string
          decision_summary: string | null
          decision_timestamp: string
          default_decision_id: string
          default_review_id: string
          driver_notice_required: boolean
          driver_notice_sent_at: string | null
          idempotency_key: string
          request_hash: string | null
          second_approver_id: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "credit_default_decisions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_credit_down_payment_invoice: {
        Args: { p_application_id: string; p_idempotency_key?: string }
        Returns: {
          amount_paid: number
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          currency_code: string
          customer_id: string
          driver_id: string
          driver_snapshot_name: string | null
          driver_snapshot_nif: string | null
          driver_snapshot_phone: string | null
          due_date: string | null
          id: string
          idempotency_key: string | null
          invoice_kind: string
          invoice_number: string | null
          issued_at: string | null
          legal_address_snapshot: string | null
          legal_footer_snapshot: string | null
          legal_name_snapshot: string | null
          legal_nif_snapshot: string | null
          legal_rccm_snapshot: string | null
          notes: string | null
          obligation_type: string | null
          paid_at: string | null
          period_end: string | null
          period_start: string | null
          public_token: string
          remaining_due: number | null
          rental_id: string | null
          source_application_id: string | null
          source_credit_account_id: string | null
          source_obligation_id: string | null
          source_product_id: string | null
          source_schedule_id: string | null
          status: string
          subtotal_ht: number
          tags: string[]
          token_expires_at: string
          total_ttc: number
          updated_at: string
          vat_amount: number
          vat_enabled_snapshot: boolean | null
          vat_rate_snapshot: number | null
        }
        SetofOptions: {
          from: "*"
          to: "invoice"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_credit_recovery_plan: {
        Args: {
          p_approved_by?: string
          p_default_review_id: string
          p_due_date: string
          p_idempotency_key?: string
          p_request_hash?: string
          p_required_action_json: Json
        }
        Returns: {
          approved_by: string | null
          created_at: string
          created_by: string | null
          credit_account_id: string
          customer_id: string | null
          default_review_id: string
          driver_id: string
          due_date: string
          idempotency_key: string
          plan_status: string
          recovery_plan_id: string
          request_hash: string | null
          required_action_json: Json
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "credit_recovery_plans"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_ownership_completion_decision: {
        Args: {
          p_decision: string
          p_decision_metadata_json?: Json
          p_decision_reason: string
          p_decision_summary?: string
          p_idempotency_key?: string
          p_request_hash?: string
          p_review_id: string
          p_second_approver_id?: string
        }
        Returns: {
          created_at: string
          credit_account_id: string
          customer_id: string | null
          decided_by: string | null
          decision: string
          decision_id: string
          decision_metadata_json: Json
          decision_reason: string
          decision_summary: string | null
          decision_timestamp: string
          idempotency_key: string
          request_hash: string | null
          review_id: string
          second_approver_id: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "ownership_completion_decisions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_promise_to_pay: {
        Args: {
          p_case_id: string
          p_idempotency_key?: string
          p_promised_amount: number
          p_promised_payment_date: string
          p_request_hash?: string
        }
        Returns: {
          broken_at: string | null
          case_id: string
          created_at: string
          created_by: string | null
          currency_code: string
          customer_id: string | null
          driver_id: string
          fulfilled_at: string | null
          idempotency_key: string
          promise_id: string
          promise_status: string
          promised_amount: number
          promised_payment_date: string
          request_hash: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "credit_promises_to_pay"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      credit_driver_wallet: {
        Args: {
          p_amount: number
          p_created_by?: string
          p_driver_id: string
          p_invoice_id?: string
          p_method?: string
          p_note?: string
          p_payment_id?: string
          p_reference?: string
          p_rental_id?: string
          p_type?: string
        }
        Returns: number
      }
      credit_log_event: {
        Args: {
          p_action: string
          p_after?: Json
          p_before?: Json
          p_customer_id: string
          p_entity_id: string
          p_entity_type: string
          p_idempotency_key?: string
          p_metadata?: Json
        }
        Returns: string
      }
      credit_recompute_exposure: {
        Args: {
          p_currency_code?: string
          p_customer_id: string
          p_driver_id: string
        }
        Returns: {
          available_exposure: number
          created_at: string
          currency_code: string
          current_exposure: number
          customer_id: string
          driver_id: string
          last_calculated_at: string | null
          maximum_exposure_limit: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "credit_exposure_profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      current_customer_id: { Args: never; Returns: string }
      current_driver_customer_id: { Args: never; Returns: string }
      current_driver_id: { Args: never; Returns: string }
      current_driver_is_active: { Args: never; Returns: boolean }
      declare_credit_formal_default: {
        Args: {
          p_default_review_id: string
          p_idempotency_key?: string
          p_reason: string
          p_request_hash?: string
        }
        Returns: {
          assigned_reviewer: string | null
          closed_at: string | null
          closure_reason: string | null
          collections_case_id: string
          created_at: string
          created_by: string | null
          credit_account_id: string
          currency_code: string
          customer_id: string | null
          days_past_due: number
          decision_due_at: string | null
          default_review_id: string
          driver_id: string
          evidence_status: string
          idempotency_key: string
          opened_at: string
          past_due_amount: number
          product_id: string
          request_hash: string | null
          status: string
          status_changed_at: string
          trigger_reason: string
          updated_at: string
          updated_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "credit_default_reviews"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      default_audit: {
        Args: {
          p_after?: Json
          p_before?: Json
          p_credit_account_id: string
          p_customer_id: string
          p_default_review_id: string
          p_event_type: string
          p_idempotency_key?: string
          p_reason?: string
          p_request_hash?: string
        }
        Returns: string
      }
      default_collections_rules: { Args: never; Returns: Json }
      default_notice_type_label: {
        Args: { p_notice_type: string }
        Returns: string
      }
      default_ownership_completion_rules: { Args: never; Returns: Json }
      default_rules_for_account: {
        Args: { p_credit_account_id: string }
        Returns: Json
      }
      default_status_label: { Args: { p_status: string }; Returns: string }
      disable_rental_vehicle: {
        Args: { p_reason: string; p_rental_id: string }
        Returns: {
          approval_date: string | null
          approved_by: string | null
          approved_duration_hours: number | null
          approved_rate: number | null
          created_at: string
          customer_id: string | null
          driver_id: string
          end_date: string | null
          fee_change_reason: string | null
          final_duration_hours: number | null
          final_rate: number | null
          id: string
          payment_due_at: string | null
          payment_due_at_final: string | null
          payment_due_at_initial: string | null
          payment_phase: string | null
          payment_settled_at: string | null
          pickup_confirmed_at: string | null
          pickup_confirmed_by: string | null
          rejection_reason: string | null
          rental_days: number
          requested_rate: number | null
          return_confirmed_at: string | null
          return_due_at: string | null
          return_justification: string | null
          returned_at: string | null
          returned_by: string | null
          start_date: string
          status: string
          total_amount: number | null
          updated_at: string
          vehicle_id: string
        }
        SetofOptions: {
          from: "*"
          to: "rentals"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      driver_360: { Args: { p_driver: string }; Returns: Json }
      driver_acknowledge_alert: {
        Args: { p_alert: string; p_status?: string }
        Returns: undefined
      }
      driver_decline_credit_contract: {
        Args: {
          p_contract_id: string
          p_idempotency_key?: string
          p_reason?: string
        }
        Returns: {
          admin_signed_at: string | null
          application_id: string
          asset_id: string | null
          contract_hash: string
          contract_id: string
          contract_snapshot_json: Json
          contract_status: string
          created_at: string
          created_by: string | null
          credit_account_id: string | null
          customer_id: string | null
          decision_id: string
          decline_reason: string | null
          declined_at: string | null
          driver_id: string
          driver_signed_at: string | null
          expires_at: string | null
          final_pdf_hash: string | null
          fully_executed_at: string | null
          idempotency_key: string
          product_id: string
          product_version_id: string
          sent_at: string | null
          signature_hash: string | null
          signature_provider: string
          snapshot_hash: string
          status_changed_at: string
          superseded_by_contract_id: string | null
          template_id: string
          template_version: number
          updated_at: string
          updated_by: string | null
          viewed_at: string | null
          void_reason: string | null
          voided_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "credit_contracts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      driver_generate_access_code: {
        Args: { p_driver: string }
        Returns: {
          code: string
          expires_at: string
        }[]
      }
      driver_has_active_rental: {
        Args: { p_driver_id: string }
        Returns: boolean
      }
      driver_log: {
        Args: {
          p_action: string
          p_actor_type?: string
          p_driver: string
          p_metadata?: Json
        }
        Returns: string
      }
      driver_reactivate: { Args: { p_driver: string }; Returns: undefined }
      driver_revoke_access: { Args: { p_driver: string }; Returns: undefined }
      driver_risk: { Args: { p_driver: string }; Returns: Json }
      driver_risk_from_factors: {
        Args: {
          p_control_late: boolean
          p_kyc_verified: boolean
          p_open_accidents: number
          p_overdue_invoices: number
          p_score: number
          p_unpaid_violations: number
        }
        Returns: Json
      }
      driver_sign_credit_contract: {
        Args: {
          p_consent_confirmed?: boolean
          p_contract_id: string
          p_device_metadata_json?: Json
          p_idempotency_key?: string
        }
        Returns: {
          admin_signed_at: string | null
          application_id: string
          asset_id: string | null
          contract_hash: string
          contract_id: string
          contract_snapshot_json: Json
          contract_status: string
          created_at: string
          created_by: string | null
          credit_account_id: string | null
          customer_id: string | null
          decision_id: string
          decline_reason: string | null
          declined_at: string | null
          driver_id: string
          driver_signed_at: string | null
          expires_at: string | null
          final_pdf_hash: string | null
          fully_executed_at: string | null
          idempotency_key: string
          product_id: string
          product_version_id: string
          sent_at: string | null
          signature_hash: string | null
          signature_provider: string
          snapshot_hash: string
          status_changed_at: string
          superseded_by_contract_id: string | null
          template_id: string
          template_version: number
          updated_at: string
          updated_by: string | null
          viewed_at: string | null
          void_reason: string | null
          voided_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "credit_contracts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      driver_suspend: {
        Args: { p_driver: string; p_reason: string }
        Returns: undefined
      }
      driver_view_credit_contract: {
        Args: { p_contract_id: string; p_idempotency_key?: string }
        Returns: {
          admin_signed_at: string | null
          application_id: string
          asset_id: string | null
          contract_hash: string
          contract_id: string
          contract_snapshot_json: Json
          contract_status: string
          created_at: string
          created_by: string | null
          credit_account_id: string | null
          customer_id: string | null
          decision_id: string
          decline_reason: string | null
          declined_at: string | null
          driver_id: string
          driver_signed_at: string | null
          expires_at: string | null
          final_pdf_hash: string | null
          fully_executed_at: string | null
          idempotency_key: string
          product_id: string
          product_version_id: string
          sent_at: string | null
          signature_hash: string | null
          signature_provider: string
          snapshot_hash: string
          status_changed_at: string
          superseded_by_contract_id: string | null
          template_id: string
          template_version: number
          updated_at: string
          updated_by: string | null
          viewed_at: string | null
          void_reason: string | null
          voided_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "credit_contracts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      drivers_risk_summary: {
        Args: never
        Returns: {
          driver_id: string
          level: string
          overdue_payments: number
          reasons: string[]
        }[]
      }
      escalate_credit_risk: {
        Args: {
          p_case_id: string
          p_escalation_type: string
          p_idempotency_key?: string
          p_reason: string
          p_request_hash?: string
        }
        Returns: {
          case_id: string
          created_at: string
          created_by: string | null
          credit_account_id: string
          customer_id: string | null
          driver_id: string
          escalation_id: string
          escalation_type: string
          idempotency_key: string
          reason: string
          request_hash: string | null
          score_event_id: string | null
          severity: string
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "credit_risk_escalations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      evaluate_underwriting_decision: {
        Args: { p_application_id: string; p_idempotency_key?: string }
        Returns: {
          admin_explanation: string
          application_id: string
          available_exposure_amount: number
          available_exposure_currency_code: string
          created_at: string
          created_by: string | null
          current_exposure_amount: number
          current_exposure_currency_code: string
          customer_id: string | null
          decision: string
          decision_id: string
          decision_risk_level: string | null
          decision_risk_snapshot_json: Json
          decision_score_grade: string | null
          decision_score_value: number | null
          decision_timestamp: string
          decision_valid_until: string | null
          driver_explanation: string
          evaluated_policy_set_id: string | null
          evaluated_policy_snapshot_json: Json
          evaluated_policy_version: number
          exposure_assessment: string
          extension_results_json: Json
          financial_assessment: string
          idempotency_key: string
          maximum_exposure_amount: number
          maximum_exposure_currency_code: string
          reason_codes_json: Json
          requested_exposure_amount: number
          requested_exposure_currency_code: string
          reviewer_id: string | null
          risk_assessment: string
          status_changed_at: string
          trust_assessment: string
          updated_at: string
          updated_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "underwriting_decisions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fc_require_admin: { Args: { p_customer: string }; Returns: undefined }
      fleet_control_approve: { Args: { p_control: string }; Returns: undefined }
      fleet_control_create_manual: {
        Args: { p_driver?: string; p_reason?: string; p_vehicle: string }
        Returns: Json
      }
      fleet_control_immobilize_cancel: {
        Args: { p_control: string }
        Returns: undefined
      }
      fleet_control_immobilize_request: {
        Args: { p_control: string; p_reason?: string }
        Returns: undefined
      }
      fleet_control_item_review: {
        Args: { p_item: string; p_reason?: string; p_status: string }
        Returns: undefined
      }
      fleet_control_log: {
        Args: {
          p_action: string
          p_actor_type?: string
          p_control: string
          p_metadata?: Json
        }
        Returns: string
      }
      fleet_control_reject: {
        Args: { p_control: string; p_reason: string }
        Returns: undefined
      }
      fleet_control_remind: { Args: { p_control: string }; Returns: Json }
      fleet_control_required_zones: { Args: never; Returns: string[] }
      fleet_control_settings: { Args: never; Returns: Json }
      fleet_control_submit: { Args: { p_control: string }; Returns: undefined }
      fleet_control_unblock: { Args: { p_control: string }; Returns: undefined }
      format_invoice_number: {
        Args: { p_customer_id: string; p_n: number; p_year: number }
        Returns: string
      }
      fulfill_underwriting_condition: {
        Args: {
          p_condition_id: string
          p_idempotency_key?: string
          p_status?: string
        }
        Returns: {
          condition_id: string
          condition_type: string
          created_at: string
          created_by: string | null
          customer_id: string | null
          decision_id: string
          description: string
          fulfilled_at: string | null
          fulfilled_by: string | null
          idempotency_key: string | null
          status: string
          status_changed_at: string
          updated_at: string
          updated_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "underwriting_conditions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      generate_accident_case_number: { Args: never; Returns: string }
      generate_credit_contract: {
        Args: { p_application_id: string; p_idempotency_key?: string }
        Returns: {
          admin_signed_at: string | null
          application_id: string
          asset_id: string | null
          contract_hash: string
          contract_id: string
          contract_snapshot_json: Json
          contract_status: string
          created_at: string
          created_by: string | null
          credit_account_id: string | null
          customer_id: string | null
          decision_id: string
          decline_reason: string | null
          declined_at: string | null
          driver_id: string
          driver_signed_at: string | null
          expires_at: string | null
          final_pdf_hash: string | null
          fully_executed_at: string | null
          idempotency_key: string
          product_id: string
          product_version_id: string
          sent_at: string | null
          signature_hash: string | null
          signature_provider: string
          snapshot_hash: string
          status_changed_at: string
          superseded_by_contract_id: string | null
          template_id: string
          template_version: number
          updated_at: string
          updated_by: string | null
          viewed_at: string | null
          void_reason: string | null
          voided_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "credit_contracts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      generate_due_repayment_invoices: {
        Args: { p_idempotency_key?: string; p_schedule_id: string }
        Returns: {
          invoice_id: string
          invoice_status: string
          obligation_id: string
        }[]
      }
      generate_fleet_alerts: { Args: never; Returns: number }
      generate_repayment_invoice: {
        Args: { p_idempotency_key?: string; p_obligation_id: string }
        Returns: {
          amount_paid: number
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          currency_code: string
          customer_id: string
          driver_id: string
          driver_snapshot_name: string | null
          driver_snapshot_nif: string | null
          driver_snapshot_phone: string | null
          due_date: string | null
          id: string
          idempotency_key: string | null
          invoice_kind: string
          invoice_number: string | null
          issued_at: string | null
          legal_address_snapshot: string | null
          legal_footer_snapshot: string | null
          legal_name_snapshot: string | null
          legal_nif_snapshot: string | null
          legal_rccm_snapshot: string | null
          notes: string | null
          obligation_type: string | null
          paid_at: string | null
          period_end: string | null
          period_start: string | null
          public_token: string
          remaining_due: number | null
          rental_id: string | null
          source_application_id: string | null
          source_credit_account_id: string | null
          source_obligation_id: string | null
          source_product_id: string | null
          source_schedule_id: string | null
          status: string
          subtotal_ht: number
          tags: string[]
          token_expires_at: string
          total_ttc: number
          updated_at: string
          vat_amount: number
          vat_enabled_snapshot: boolean | null
          vat_rate_snapshot: number | null
        }
        SetofOptions: {
          from: "*"
          to: "invoice"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      generate_repayment_schedule: {
        Args: { p_credit_account_id: string; p_idempotency_key?: string }
        Returns: {
          allow_prepayment: boolean
          allow_schedule_amendment: boolean
          application_id: string
          contract_id: string
          created_at: string
          created_by: string | null
          credit_account_id: string
          currency_code: string
          customer_id: string | null
          final_due_date: string
          financed_amount: number
          first_due_date: string
          frequency: string
          generated_from_contract_hash: string
          generated_from_policy_snapshot_id: string | null
          grace_period_days: number
          idempotency_key: string
          invoice_generation_days_before_due: number
          product_id: string
          product_version_id: string
          schedule_id: string
          schedule_status: string
          schedule_type: string
          schedule_version: number
          source_snapshot_json: Json
          status_changed_at: string
          superseded_by_schedule_id: string | null
          term_count: number
          terms_snapshot_json: Json
          total_fees_amount: number
          total_interest_amount: number
          total_repayment_amount: number
          updated_at: string
          updated_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "repayment_schedules"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_driver_360_summary: { Args: { p_driver_id: string }; Returns: Json }
      get_driver_activity_timeline: {
        Args: { p_driver_id: string; p_limit?: number }
        Returns: {
          action: string
          metadata: Json
          occurred_at: string
          reference_id: string
          source: string
          summary: string
        }[]
      }
      get_driver_auth_mode: { Args: never; Returns: string }
      get_driver_collections_status: {
        Args: never
        Returns: {
          active_promise_json: Json
          can_request_promise: boolean
          case_id: string
          consequence_text: string
          credit_account_id: string
          days_late: number
          driver_message: string
          grace_period_days: number
          invoice_id: string
          late_amount: number
          next_due_amount: number
          next_due_date: string
          payment_action_label: string
          product_name: string
          recovery_progress_pct: number
          status_label: string
          status_tone: string
        }[]
      }
      get_driver_contract_statuses: {
        Args: never
        Returns: {
          application_id: string
          asset_label: string
          can_decline: boolean
          can_sign: boolean
          can_view: boolean
          contract_id: string
          expires_at: string
          primary_action_label: string
          product_name: string
          required_actions_json: Json
          signed_at: string
          status_label: string
          status_tone: string
          summary_json: Json
        }[]
      }
      get_driver_default_status: {
        Args: never
        Returns: {
          amount_affected: number
          credit_account_id: string
          currency_code: string
          days_past_due: number
          deadline_at: string
          default_review_id: string
          driver_message: string
          latest_notice_json: Json
          primary_action_label: string
          product_name: string
          recovery_plan_json: Json
          status_label: string
          status_tone: string
        }[]
      }
      get_driver_displayed_score: {
        Args: { p_driver_id: string }
        Returns: number
      }
      get_driver_id: { Args: { _user_id: string }; Returns: string }
      get_driver_leaderboard: {
        Args: { p_limit?: number }
        Returns: {
          driver_id: string
          driver_name: string
          profile_image_url: string
          rank: number
          score: number
          score_change: number
          tier: string
        }[]
      }
      get_driver_ownership_completion_status: {
        Args: never
        Returns: {
          asset_id: string
          asset_type: string
          blocking_reasons_json: Json
          certificate_document_reference: string
          certificate_id: string
          certificate_number: string
          credit_account_id: string
          driver_message: string
          ownership_date: string
          product_name: string
          progress_json: Json
          review_id: string
          status: string
          status_label: string
          status_tone: string
          transfer_id: string
        }[]
      }
      get_driver_repayment_schedules: {
        Args: never
        Returns: {
          allow_prepayment: boolean
          credit_account_id: string
          currency_code: string
          next_due_amount: number
          next_due_date: string
          obligations_json: Json
          paid_installments: number
          product_name: string
          remaining_balance: number
          remaining_installments: number
          schedule_id: string
          schedule_label: string
          schedule_status_label: string
          status_tone: string
        }[]
      }
      get_driver_underwriting_decisions: {
        Args: never
        Returns: {
          application_id: string
          decision_id: string
          decision_label: string
          decision_timestamp: string
          decision_valid_until: string
          driver_explanation: string
          is_reunderwriting_required: boolean
          pending_conditions: number
          required_actions_json: Json
        }[]
      }
      get_module_completion_stats: {
        Args: { p_module_id: string }
        Returns: {
          avg_score: number
          completed: number
          completion_rate: number
          in_progress: number
          not_started: number
          total_drivers: number
        }[]
      }
      get_platform_setting: { Args: { p_setting_key: string }; Returns: Json }
      get_scoring_qa_report: {
        Args: { p_end: string; p_start: string }
        Returns: Json
      }
      get_visible_feature_flags: {
        Args: never
        Returns: {
          category: string
          created_at: string
          customer_id: string
          description: string
          flag_key: string
          flag_value: boolean
          id: string
          is_platform_only: boolean
          updated_at: string
        }[]
      }
      has_admin_role:
        | {
            Args: {
              _role: Database["public"]["Enums"]["app_role"]
              _user_id: string
            }
            Returns: boolean
          }
        | { Args: { role: string }; Returns: boolean }
      has_admin_role_in: { Args: { roles: string[] }; Returns: boolean }
      has_analytics_permission: {
        Args: { permission: string }
        Returns: boolean
      }
      has_collections_permission: {
        Args: { permission: string }
        Returns: boolean
      }
      has_contract_permission: {
        Args: { permission: string }
        Returns: boolean
      }
      has_credit_permission: { Args: { permission: string }; Returns: boolean }
      has_default_permission: { Args: { permission: string }; Returns: boolean }
      has_ownership_completion_permission: {
        Args: { permission: string }
        Returns: boolean
      }
      has_repayment_permission: {
        Args: { permission: string }
        Returns: boolean
      }
      has_underwriting_permission: {
        Args: { permission: string }
        Returns: boolean
      }
      is_admin:
        | { Args: never; Returns: boolean }
        | { Args: { _user_id: string }; Returns: boolean }
      is_driver: { Args: never; Returns: boolean }
      is_feature_enabled: { Args: { p_flag_key: string }; Returns: boolean }
      is_platform_owner: { Args: never; Returns: boolean }
      issue_daily_rental_invoices: { Args: never; Returns: number }
      issue_ownership_certificate: {
        Args: {
          p_certificate_metadata_json?: Json
          p_document_reference?: string
          p_idempotency_key?: string
          p_request_hash?: string
          p_review_id: string
          p_transfer_type?: string
        }
        Returns: {
          asset_id: string
          certificate_id: string
          certificate_metadata_json: Json
          certificate_number: string
          certificate_status: string
          created_at: string
          credit_account_id: string
          customer_id: string | null
          document_reference: string | null
          driver_id: string
          idempotency_key: string
          issued_at: string
          issued_by: string | null
          request_hash: string | null
          review_id: string
          transfer_id: string
        }
        SetofOptions: {
          from: "*"
          to: "ownership_certificates"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      log_credit_collection_contact: {
        Args: {
          p_action_note: string
          p_action_type?: string
          p_case_id: string
          p_driver_visible?: boolean
          p_idempotency_key?: string
          p_request_hash?: string
        }
        Returns: {
          action_id: string
          action_note: string | null
          action_type: string
          actor_id: string | null
          case_id: string
          created_at: string
          customer_id: string | null
          driver_visible: boolean
          idempotency_key: string | null
        }
        SetofOptions: {
          from: "*"
          to: "credit_collection_actions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      mark_overdue_rentals: { Args: never; Returns: number }
      mark_rental_paid: {
        Args: { p_rental_id: string }
        Returns: {
          approval_date: string | null
          approved_by: string | null
          approved_duration_hours: number | null
          approved_rate: number | null
          created_at: string
          customer_id: string | null
          driver_id: string
          end_date: string | null
          fee_change_reason: string | null
          final_duration_hours: number | null
          final_rate: number | null
          id: string
          payment_due_at: string | null
          payment_due_at_final: string | null
          payment_due_at_initial: string | null
          payment_phase: string | null
          payment_settled_at: string | null
          pickup_confirmed_at: string | null
          pickup_confirmed_by: string | null
          rejection_reason: string | null
          rental_days: number
          requested_rate: number | null
          return_confirmed_at: string | null
          return_due_at: string | null
          return_justification: string | null
          returned_at: string | null
          returned_by: string | null
          start_date: string
          status: string
          total_amount: number | null
          updated_at: string
          vehicle_id: string
        }
        SetofOptions: {
          from: "*"
          to: "rentals"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      next_invoice_number: {
        Args: { p_customer_id: string; p_year: number }
        Returns: number
      }
      normalize_license_plate: { Args: { p: string }; Returns: string }
      open_credit_asset_protection_review: {
        Args: {
          p_asset_id?: string
          p_default_review_id: string
          p_idempotency_key?: string
          p_inspection_due_at?: string
          p_inspection_required?: boolean
          p_request_hash?: string
          p_trigger_reason: string
        }
        Returns: {
          asset_id: string | null
          asset_review_id: string
          created_at: string
          created_by: string | null
          credit_account_id: string
          customer_id: string | null
          default_review_id: string
          idempotency_key: string
          inspection_due_at: string | null
          inspection_required: boolean
          request_hash: string | null
          status: string
          trigger_reason: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "credit_asset_protection_reviews"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      open_credit_collections_case: {
        Args: {
          p_credit_account_id: string
          p_idempotency_key?: string
          p_obligation_id?: string
          p_reason?: string
          p_request_hash?: string
        }
        Returns: {
          assigned_to: string | null
          case_id: string
          closed_at: string | null
          closure_reason: string | null
          created_at: string
          created_by: string | null
          credit_account_id: string
          currency_code: string
          current_status: string
          customer_id: string | null
          days_past_due: number
          delinquency_status: string
          driver_id: string
          escalation_level: number
          idempotency_key: string
          invoice_id: string | null
          obligation_id: string | null
          opened_at: string
          priority_score: number
          product_id: string
          product_version_id: string | null
          request_hash: string | null
          risk_level: string
          rules_snapshot_json: Json
          schedule_id: string | null
          score_impact: number
          severity: string
          status_changed_at: string
          total_past_due_amount: number
          updated_at: string
          updated_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "credit_collections_cases"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      open_credit_default_review: {
        Args: {
          p_collections_case_id?: string
          p_credit_account_id: string
          p_decision_due_at?: string
          p_idempotency_key?: string
          p_request_hash?: string
          p_trigger_reason?: string
        }
        Returns: {
          assigned_reviewer: string | null
          closed_at: string | null
          closure_reason: string | null
          collections_case_id: string
          created_at: string
          created_by: string | null
          credit_account_id: string
          currency_code: string
          customer_id: string | null
          days_past_due: number
          decision_due_at: string | null
          default_review_id: string
          driver_id: string
          evidence_status: string
          idempotency_key: string
          opened_at: string
          past_due_amount: number
          product_id: string
          request_hash: string | null
          status: string
          status_changed_at: string
          trigger_reason: string
          updated_at: string
          updated_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "credit_default_reviews"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      open_default_review: {
        Args: {
          p_case_id: string
          p_idempotency_key?: string
          p_reason: string
          p_request_hash?: string
        }
        Returns: {
          assigned_to: string | null
          case_id: string
          closed_at: string | null
          closure_reason: string | null
          created_at: string
          created_by: string | null
          credit_account_id: string
          currency_code: string
          current_status: string
          customer_id: string | null
          days_past_due: number
          delinquency_status: string
          driver_id: string
          escalation_level: number
          idempotency_key: string
          invoice_id: string | null
          obligation_id: string | null
          opened_at: string
          priority_score: number
          product_id: string
          product_version_id: string | null
          request_hash: string | null
          risk_level: string
          rules_snapshot_json: Json
          schedule_id: string | null
          score_impact: number
          severity: string
          status_changed_at: string
          total_past_due_amount: number
          updated_at: string
          updated_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "credit_collections_cases"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      open_ownership_completion_review: {
        Args: {
          p_completion_metadata_json?: Json
          p_credit_account_id: string
          p_idempotency_key?: string
          p_request_hash?: string
          p_review_due_at?: string
          p_trigger_reason?: string
        }
        Returns: {
          asset_id: string
          assigned_reviewer: string | null
          blocking_reasons_json: Json
          cancelled_at: string | null
          closure_reason: string | null
          completed_at: string | null
          completion_metadata_json: Json
          created_at: string
          created_by: string | null
          credit_account_id: string
          customer_id: string | null
          driver_id: string
          eligibility_checked_at: string
          eligibility_snapshot_json: Json
          idempotency_key: string
          obligation_summary_json: Json
          opened_at: string | null
          product_id: string
          product_rules_snapshot_json: Json
          product_version_id: string
          request_hash: string | null
          reversed_at: string | null
          review_due_at: string | null
          review_id: string
          status: string
          status_changed_at: string
          updated_at: string
          updated_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "ownership_completion_reviews"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      ownership_certificate_number: {
        Args: {
          p_asset_id: string
          p_credit_account_id: string
          p_customer_id: string
        }
        Returns: string
      }
      ownership_completion_audit: {
        Args: {
          p_after?: Json
          p_asset_id: string
          p_before?: Json
          p_credit_account_id: string
          p_customer_id: string
          p_event_type: string
          p_idempotency_key?: string
          p_reason?: string
          p_request_hash?: string
          p_review_id: string
        }
        Returns: string
      }
      ownership_completion_eligibility_snapshot: {
        Args: { p_completion_metadata_json?: Json; p_credit_account_id: string }
        Returns: Json
      }
      ownership_completion_rules_for_account: {
        Args: { p_credit_account_id: string }
        Returns: Json
      }
      ownership_completion_status_label: {
        Args: { p_status: string }
        Returns: string
      }
      ownership_jsonb_bool: {
        Args: {
          p_default: boolean
          p_fallback: Json
          p_key: string
          p_primary: Json
        }
        Returns: boolean
      }
      pause_repayment_schedule: {
        Args: {
          p_idempotency_key?: string
          p_reason: string
          p_schedule_id: string
        }
        Returns: {
          allow_prepayment: boolean
          allow_schedule_amendment: boolean
          application_id: string
          contract_id: string
          created_at: string
          created_by: string | null
          credit_account_id: string
          currency_code: string
          customer_id: string | null
          final_due_date: string
          financed_amount: number
          first_due_date: string
          frequency: string
          generated_from_contract_hash: string
          generated_from_policy_snapshot_id: string | null
          grace_period_days: number
          idempotency_key: string
          invoice_generation_days_before_due: number
          product_id: string
          product_version_id: string
          schedule_id: string
          schedule_status: string
          schedule_type: string
          schedule_version: number
          source_snapshot_json: Json
          status_changed_at: string
          superseded_by_schedule_id: string | null
          term_count: number
          terms_snapshot_json: Json
          total_fees_amount: number
          total_interest_amount: number
          total_repayment_amount: number
          updated_at: string
          updated_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "repayment_schedules"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      pending_adjustments_count: { Args: never; Returns: number }
      recompute_driver_current_score: {
        Args: { p_customer_id?: string; p_driver_id: string }
        Returns: number
      }
      reconcile_invoice_status: {
        Args: { p_invoice_id: string }
        Returns: {
          invoice_id: string
          new_status: string
          paid_at: string
        }[]
      }
      record_analytics_audit_event: {
        Args: {
          p_event_type: string
          p_export_reference?: string
          p_filters_json?: Json
          p_report_type?: string
          p_target_id?: string
          p_target_type: string
        }
        Returns: string
      }
      record_analytics_export: {
        Args: {
          p_confidentiality_label?: string
          p_export_type: string
          p_filters_json?: Json
        }
        Returns: string
      }
      record_driver_deposit: {
        Args: {
          p_amount: number
          p_driver_id: string
          p_method: string
          p_note?: string
          p_reference?: string
        }
        Returns: {
          amount: number
          balance_after: number
          created_at: string
          created_by: string | null
          customer_id: string | null
          direction: string | null
          driver_id: string
          id: string
          invoice_id: string | null
          metadata: Json
          method: string | null
          note: string | null
          payment_id: string | null
          reference: string | null
          rental_id: string | null
          type: string
          wallet_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "driver_wallet_transactions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_manual_contract_file: {
        Args: {
          p_contract_id: string
          p_file_hash: string
          p_idempotency_key?: string
          p_reason: string
          p_storage_reference: string
        }
        Returns: {
          contract_id: string
          created_at: string
          customer_id: string | null
          file_hash: string
          file_id: string
          file_type: string
          generated_at: string
          storage_reference: string
        }
        SetofOptions: {
          from: "*"
          to: "contract_files"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reissue_credit_contract: {
        Args: {
          p_contract_id: string
          p_idempotency_key?: string
          p_reason: string
        }
        Returns: {
          admin_signed_at: string | null
          application_id: string
          asset_id: string | null
          contract_hash: string
          contract_id: string
          contract_snapshot_json: Json
          contract_status: string
          created_at: string
          created_by: string | null
          credit_account_id: string | null
          customer_id: string | null
          decision_id: string
          decline_reason: string | null
          declined_at: string | null
          driver_id: string
          driver_signed_at: string | null
          expires_at: string | null
          final_pdf_hash: string | null
          fully_executed_at: string | null
          idempotency_key: string
          product_id: string
          product_version_id: string
          sent_at: string | null
          signature_hash: string | null
          signature_provider: string
          snapshot_hash: string
          status_changed_at: string
          superseded_by_contract_id: string | null
          template_id: string
          template_version: number
          updated_at: string
          updated_by: string | null
          viewed_at: string | null
          void_reason: string | null
          voided_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "credit_contracts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reject_rental: {
        Args: { p_reason: string; p_rental_id: string }
        Returns: {
          approval_date: string | null
          approved_by: string | null
          approved_duration_hours: number | null
          approved_rate: number | null
          created_at: string
          customer_id: string | null
          driver_id: string
          end_date: string | null
          fee_change_reason: string | null
          final_duration_hours: number | null
          final_rate: number | null
          id: string
          payment_due_at: string | null
          payment_due_at_final: string | null
          payment_due_at_initial: string | null
          payment_phase: string | null
          payment_settled_at: string | null
          pickup_confirmed_at: string | null
          pickup_confirmed_by: string | null
          rejection_reason: string | null
          rental_days: number
          requested_rate: number | null
          return_confirmed_at: string | null
          return_due_at: string | null
          return_justification: string | null
          returned_at: string | null
          returned_by: string | null
          start_date: string
          status: string
          total_amount: number | null
          updated_at: string
          vehicle_id: string
        }
        SetofOptions: {
          from: "*"
          to: "rentals"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rental_amount_owed: { Args: { p_rental_id: string }; Returns: number }
      repayment_audit: {
        Args: {
          p_after?: Json
          p_before?: Json
          p_credit_account_id: string
          p_customer_id: string
          p_event_type: string
          p_idempotency_key?: string
          p_obligation_id: string
          p_reason?: string
          p_schedule_id: string
        }
        Returns: string
      }
      repayment_due_date: {
        Args: {
          p_first_due_date: string
          p_frequency: string
          p_sequence: number
        }
        Returns: string
      }
      repayment_invoice_obligation_type: {
        Args: {
          p_obligation_type: string
          p_product_type: string
          p_sequence: number
          p_term_count: number
        }
        Returns: string
      }
      repayment_status_label: { Args: { p_status: string }; Returns: string }
      return_rental: {
        Args: { p_rental_id: string }
        Returns: {
          approval_date: string | null
          approved_by: string | null
          approved_duration_hours: number | null
          approved_rate: number | null
          created_at: string
          customer_id: string | null
          driver_id: string
          end_date: string | null
          fee_change_reason: string | null
          final_duration_hours: number | null
          final_rate: number | null
          id: string
          payment_due_at: string | null
          payment_due_at_final: string | null
          payment_due_at_initial: string | null
          payment_phase: string | null
          payment_settled_at: string | null
          pickup_confirmed_at: string | null
          pickup_confirmed_by: string | null
          rejection_reason: string | null
          rental_days: number
          requested_rate: number | null
          return_confirmed_at: string | null
          return_due_at: string | null
          return_justification: string | null
          returned_at: string | null
          returned_by: string | null
          start_date: string
          status: string
          total_amount: number | null
          updated_at: string
          vehicle_id: string
        }
        SetofOptions: {
          from: "*"
          to: "rentals"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reverse_cancelled_invoice_payments: {
        Args: { p_invoice_id: string }
        Returns: Json
      }
      reverse_credit_formal_default: {
        Args: {
          p_default_review_id: string
          p_idempotency_key?: string
          p_new_account_status?: string
          p_reason: string
          p_request_hash?: string
        }
        Returns: {
          assigned_reviewer: string | null
          closed_at: string | null
          closure_reason: string | null
          collections_case_id: string
          created_at: string
          created_by: string | null
          credit_account_id: string
          currency_code: string
          customer_id: string | null
          days_past_due: number
          decision_due_at: string | null
          default_review_id: string
          driver_id: string
          evidence_status: string
          idempotency_key: string
          opened_at: string
          past_due_amount: number
          product_id: string
          request_hash: string | null
          status: string
          status_changed_at: string
          trigger_reason: string
          updated_at: string
          updated_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "credit_default_reviews"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reverse_ownership_completion: {
        Args: {
          p_idempotency_key?: string
          p_reason: string
          p_reopened_account_status?: string
          p_request_hash?: string
          p_review_id: string
          p_second_approver_id: string
        }
        Returns: {
          asset_id: string
          assigned_reviewer: string | null
          blocking_reasons_json: Json
          cancelled_at: string | null
          closure_reason: string | null
          completed_at: string | null
          completion_metadata_json: Json
          created_at: string
          created_by: string | null
          credit_account_id: string
          customer_id: string | null
          driver_id: string
          eligibility_checked_at: string
          eligibility_snapshot_json: Json
          idempotency_key: string
          obligation_summary_json: Json
          opened_at: string | null
          product_id: string
          product_rules_snapshot_json: Json
          product_version_id: string
          request_hash: string | null
          reversed_at: string | null
          review_due_at: string | null
          review_id: string
          status: string
          status_changed_at: string
          updated_at: string
          updated_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "ownership_completion_reviews"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      review_credit_application: {
        Args: {
          p_application_id: string
          p_conditions_json?: Json
          p_decision: string
          p_decision_reason_code: string
          p_explanation: string
          p_idempotency_key?: string
        }
        Returns: {
          application_id: string
          conditions_json: Json
          created_at: string
          customer_id: string | null
          decision: string
          decision_id: string
          decision_reason_code: string
          decision_timestamp: string
          explanation: string
          idempotency_key: string
          reviewer_id: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "credit_decisions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      review_underwriting_application: {
        Args: {
          p_admin_explanation: string
          p_application_id: string
          p_conditions_json?: Json
          p_decision: string
          p_driver_explanation: string
          p_idempotency_key?: string
        }
        Returns: {
          admin_explanation: string
          application_id: string
          available_exposure_amount: number
          available_exposure_currency_code: string
          created_at: string
          created_by: string | null
          current_exposure_amount: number
          current_exposure_currency_code: string
          customer_id: string | null
          decision: string
          decision_id: string
          decision_risk_level: string | null
          decision_risk_snapshot_json: Json
          decision_score_grade: string | null
          decision_score_value: number | null
          decision_timestamp: string
          decision_valid_until: string | null
          driver_explanation: string
          evaluated_policy_set_id: string | null
          evaluated_policy_snapshot_json: Json
          evaluated_policy_version: number
          exposure_assessment: string
          extension_results_json: Json
          financial_assessment: string
          idempotency_key: string
          maximum_exposure_amount: number
          maximum_exposure_currency_code: string
          reason_codes_json: Json
          requested_exposure_amount: number
          requested_exposure_currency_code: string
          reviewer_id: string | null
          risk_assessment: string
          status_changed_at: string
          trust_assessment: string
          updated_at: string
          updated_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "underwriting_decisions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      send_credit_collection_reminder: {
        Args: {
          p_case_id: string
          p_channel?: string
          p_idempotency_key?: string
          p_reminder_type: string
          p_request_hash?: string
        }
        Returns: {
          case_id: string | null
          channel: string
          created_at: string
          customer_id: string | null
          driver_id: string
          idempotency_key: string
          notification_id: string | null
          obligation_id: string | null
          reminder_id: string
          reminder_type: string
          request_hash: string | null
          sent_at: string | null
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "credit_reminders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      send_credit_contract: {
        Args: { p_contract_id: string; p_idempotency_key?: string }
        Returns: {
          admin_signed_at: string | null
          application_id: string
          asset_id: string | null
          contract_hash: string
          contract_id: string
          contract_snapshot_json: Json
          contract_status: string
          created_at: string
          created_by: string | null
          credit_account_id: string | null
          customer_id: string | null
          decision_id: string
          decline_reason: string | null
          declined_at: string | null
          driver_id: string
          driver_signed_at: string | null
          expires_at: string | null
          final_pdf_hash: string | null
          fully_executed_at: string | null
          idempotency_key: string
          product_id: string
          product_version_id: string
          sent_at: string | null
          signature_hash: string | null
          signature_provider: string
          snapshot_hash: string
          status_changed_at: string
          superseded_by_contract_id: string | null
          template_id: string
          template_version: number
          updated_at: string
          updated_by: string | null
          viewed_at: string | null
          void_reason: string | null
          voided_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "credit_contracts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      send_credit_default_notice: {
        Args: {
          p_channel?: string
          p_deadline_at?: string
          p_default_review_id: string
          p_idempotency_key?: string
          p_notice_summary: string
          p_notice_type: string
          p_reason: string
          p_request_hash?: string
          p_required_action: string
        }
        Returns: {
          amount_affected: number
          channel: string
          created_at: string
          credit_account_id: string
          currency_code: string
          customer_id: string | null
          deadline_at: string | null
          default_review_id: string
          driver_id: string
          idempotency_key: string
          notice_id: string
          notice_status: string
          notice_summary: string
          notice_type: string
          notification_id: string | null
          reason: string
          request_hash: string | null
          required_action: string
          sent_at: string | null
          support_instruction: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "credit_default_notices"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      settle_rental_payment: {
        Args: {
          p_amount: number
          p_payment_method: string
          p_rental_id: string
        }
        Returns: {
          approval_date: string | null
          approved_by: string | null
          approved_duration_hours: number | null
          approved_rate: number | null
          created_at: string
          customer_id: string | null
          driver_id: string
          end_date: string | null
          fee_change_reason: string | null
          final_duration_hours: number | null
          final_rate: number | null
          id: string
          payment_due_at: string | null
          payment_due_at_final: string | null
          payment_due_at_initial: string | null
          payment_phase: string | null
          payment_settled_at: string | null
          pickup_confirmed_at: string | null
          pickup_confirmed_by: string | null
          rejection_reason: string | null
          rental_days: number
          requested_rate: number | null
          return_confirmed_at: string | null
          return_due_at: string | null
          return_justification: string | null
          returned_at: string | null
          returned_by: string | null
          start_date: string
          status: string
          total_amount: number | null
          updated_at: string
          vehicle_id: string
        }
        SetofOptions: {
          from: "*"
          to: "rentals"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      storage_first_path_customer_id: {
        Args: { p_name: string }
        Returns: string
      }
      submit_credit_application: {
        Args: {
          p_idempotency_key?: string
          p_kyc_reference_id?: string
          p_product_id: string
          p_requested_asset_id?: string
          p_requested_terms_json?: Json
        }
        Returns: {
          application_id: string
          created_at: string
          created_by: string | null
          customer_id: string | null
          down_payment_amount: number
          down_payment_currency_code: string
          driver_id: string
          eligibility_explanation: string
          eligibility_result: string
          expires_at: string | null
          idempotency_key: string
          kyc_reference_id: string | null
          product_id: string
          product_version_id: string
          requested_asset_id: string | null
          requested_terms_json: Json
          score_snapshot: number | null
          snapshot_id: string | null
          status: string
          status_changed_at: string
          submitted_at: string | null
          updated_at: string
          updated_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "credit_applications"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      sweep_wallet_auto_apply: { Args: never; Returns: Json }
      sync_credit_collections: {
        Args: { p_credit_account_id?: string; p_idempotency_key?: string }
        Returns: {
          case_id: string
          case_status: string
          delinquency_status: string
          obligation_id: string
        }[]
      }
      sync_ownership_completion_candidates: {
        Args: {
          p_credit_account_id?: string
          p_idempotency_key?: string
          p_limit?: number
          p_request_hash?: string
        }
        Returns: {
          blocking_reasons_json: Json
          credit_account_id: string
          is_eligible: boolean
          review_id: string
          status: string
        }[]
      }
      sync_repayment_obligation_statuses: {
        Args: { p_idempotency_key?: string; p_schedule_id: string }
        Returns: {
          invoice_id: string
          new_status: string
          obligation_id: string
          old_status: string
        }[]
      }
      test_wallet_settlement_paths: { Args: never; Returns: Json }
      trigger_apply_wallet_credit: {
        Args: { p_driver_id: string }
        Returns: undefined
      }
      trigger_reunderwriting: {
        Args: {
          p_application_id: string
          p_idempotency_key?: string
          p_prior_decision_id: string
          p_trigger_payload_json?: Json
          p_trigger_source?: string
          p_trigger_type: string
        }
        Returns: {
          application_id: string
          created_at: string
          created_by: string | null
          customer_id: string | null
          idempotency_key: string
          prior_decision_id: string | null
          required_snapshot_at: string
          resolution_decision_id: string | null
          status: string
          status_changed_at: string
          trigger_id: string
          trigger_payload_json: Json
          trigger_source: string
          trigger_type: string
          updated_at: string
          updated_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "reunderwriting_triggers"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      underwriting_application_status: {
        Args: { p_decision: string }
        Returns: string
      }
      underwriting_apply_product_extensions: {
        Args: { p_application_id: string; p_policy_set_id: string }
        Returns: Json
      }
      underwriting_financial_assessment: {
        Args: { p_application_id: string }
        Returns: string
      }
      underwriting_latest_decision: {
        Args: { p_application_id: string }
        Returns: {
          admin_explanation: string
          application_id: string
          available_exposure_amount: number
          available_exposure_currency_code: string
          created_at: string
          created_by: string | null
          current_exposure_amount: number
          current_exposure_currency_code: string
          customer_id: string | null
          decision: string
          decision_id: string
          decision_risk_level: string | null
          decision_risk_snapshot_json: Json
          decision_score_grade: string | null
          decision_score_value: number | null
          decision_timestamp: string
          decision_valid_until: string | null
          driver_explanation: string
          evaluated_policy_set_id: string | null
          evaluated_policy_snapshot_json: Json
          evaluated_policy_version: number
          exposure_assessment: string
          extension_results_json: Json
          financial_assessment: string
          idempotency_key: string
          maximum_exposure_amount: number
          maximum_exposure_currency_code: string
          reason_codes_json: Json
          requested_exposure_amount: number
          requested_exposure_currency_code: string
          reviewer_id: string | null
          risk_assessment: string
          status_changed_at: string
          trust_assessment: string
          updated_at: string
          updated_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "underwriting_decisions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      underwriting_matrix_outcome: {
        Args: {
          p_exposure: string
          p_financial: string
          p_matrix: Json
          p_risk: string
          p_trust: string
        }
        Returns: string
      }
      underwriting_risk_assessment: {
        Args: { p_risk_level: string }
        Returns: string
      }
      underwriting_trust_assessment: {
        Args: { p_grade: string }
        Returns: string
      }
      update_rental_fee: {
        Args: { p_new_rate: number; p_reason: string; p_rental_id: string }
        Returns: {
          approval_date: string | null
          approved_by: string | null
          approved_duration_hours: number | null
          approved_rate: number | null
          created_at: string
          customer_id: string | null
          driver_id: string
          end_date: string | null
          fee_change_reason: string | null
          final_duration_hours: number | null
          final_rate: number | null
          id: string
          payment_due_at: string | null
          payment_due_at_final: string | null
          payment_due_at_initial: string | null
          payment_phase: string | null
          payment_settled_at: string | null
          pickup_confirmed_at: string | null
          pickup_confirmed_by: string | null
          rejection_reason: string | null
          rental_days: number
          requested_rate: number | null
          return_confirmed_at: string | null
          return_due_at: string | null
          return_justification: string | null
          returned_at: string | null
          returned_by: string | null
          start_date: string
          status: string
          total_amount: number | null
          updated_at: string
          vehicle_id: string
        }
        SetofOptions: {
          from: "*"
          to: "rentals"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      void_credit_contract: {
        Args: {
          p_contract_id: string
          p_idempotency_key?: string
          p_reason: string
        }
        Returns: {
          admin_signed_at: string | null
          application_id: string
          asset_id: string | null
          contract_hash: string
          contract_id: string
          contract_snapshot_json: Json
          contract_status: string
          created_at: string
          created_by: string | null
          credit_account_id: string | null
          customer_id: string | null
          decision_id: string
          decline_reason: string | null
          declined_at: string | null
          driver_id: string
          driver_signed_at: string | null
          expires_at: string | null
          final_pdf_hash: string | null
          fully_executed_at: string | null
          idempotency_key: string
          product_id: string
          product_version_id: string
          sent_at: string | null
          signature_hash: string | null
          signature_provider: string
          snapshot_hash: string
          status_changed_at: string
          superseded_by_contract_id: string | null
          template_id: string
          template_version: number
          updated_at: string
          updated_by: string | null
          viewed_at: string | null
          void_reason: string | null
          voided_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "credit_contracts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      void_payment_receipt: {
        Args: { p_reason?: string; p_receipt_id: string }
        Returns: Json
      }
    }
    Enums: {
      app_role: "super_admin" | "manager" | "loan_officer" | "support_agent"
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
      app_role: ["super_admin", "manager", "loan_officer", "support_agent"],
    },
  },
} as const

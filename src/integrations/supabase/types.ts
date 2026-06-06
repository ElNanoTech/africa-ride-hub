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
          file_type: string
          file_url: string
          id: string
          mime_type: string | null
          original_filename: string | null
          size_bytes: number | null
          storage_path: string | null
          thumbnail_url: string | null
          uploaded_by: string | null
        }
        Insert: {
          accident_id: string
          checklist_tag?: string | null
          created_at?: string
          customer_id?: string | null
          file_type: string
          file_url: string
          id?: string
          mime_type?: string | null
          original_filename?: string | null
          size_bytes?: number | null
          storage_path?: string | null
          thumbnail_url?: string | null
          uploaded_by?: string | null
        }
        Update: {
          accident_id?: string
          checklist_tag?: string | null
          created_at?: string
          customer_id?: string | null
          file_type?: string
          file_url?: string
          id?: string
          mime_type?: string | null
          original_filename?: string | null
          size_bytes?: number | null
          storage_path?: string | null
          thumbnail_url?: string | null
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
            foreignKeyName: "accidents_assigned_admin_id_fkey"
            columns: ["assigned_admin_id"]
            isOneToOne: false
            referencedRelation: "admin_users_with_tokens"
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
          {
            foreignKeyName: "admin_audit_logs_admin_user_id_fkey"
            columns: ["admin_user_id"]
            isOneToOne: false
            referencedRelation: "admin_users_with_tokens"
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
          {
            foreignKeyName: "admin_preferences_admin_user_id_fkey"
            columns: ["admin_user_id"]
            isOneToOne: true
            referencedRelation: "admin_users_with_tokens"
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
          {
            foreignKeyName: "admin_roles_admin_user_id_fkey"
            columns: ["admin_user_id"]
            isOneToOne: false
            referencedRelation: "admin_users_with_tokens"
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
            foreignKeyName: "ai_usage_logs_admin_user_id_fkey"
            columns: ["admin_user_id"]
            isOneToOne: false
            referencedRelation: "admin_users_with_tokens"
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
            foreignKeyName: "alerts_acknowledged_by_fkey"
            columns: ["acknowledged_by"]
            isOneToOne: false
            referencedRelation: "admin_users_with_tokens"
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
            foreignKeyName: "alerts_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "admin_users_with_tokens"
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
            foreignKeyName: "broadcasts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "admin_users_with_tokens"
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
            foreignKeyName: "driver_ads_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "admin_users_with_tokens"
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
          active_vehicle_id: string | null
          auth_user_id: string | null
          created_at: string
          customer_id: string | null
          driver_status: string
          email: string | null
          full_name: string
          id: string
          is_test: boolean
          kyc_status: string
          phone_number: string
          profile_image_url: string | null
          updated_at: string
          user_id: string | null
          yango_driver_id: string
        }
        Insert: {
          active_vehicle_id?: string | null
          auth_user_id?: string | null
          created_at?: string
          customer_id?: string | null
          driver_status?: string
          email?: string | null
          full_name: string
          id?: string
          is_test?: boolean
          kyc_status?: string
          phone_number: string
          profile_image_url?: string | null
          updated_at?: string
          user_id?: string | null
          yango_driver_id: string
        }
        Update: {
          active_vehicle_id?: string | null
          auth_user_id?: string | null
          created_at?: string
          customer_id?: string | null
          driver_status?: string
          email?: string | null
          full_name?: string
          id?: string
          is_test?: boolean
          kyc_status?: string
          phone_number?: string
          profile_image_url?: string | null
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
          {
            foreignKeyName: "feature_flags_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "admin_users_with_tokens"
            referencedColumns: ["id"]
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
          customer_id: string
          driver_id: string
          driver_snapshot_name: string | null
          driver_snapshot_nif: string | null
          driver_snapshot_phone: string | null
          id: string
          invoice_kind: string
          invoice_number: string | null
          issued_at: string | null
          legal_address_snapshot: string | null
          legal_footer_snapshot: string | null
          legal_name_snapshot: string | null
          legal_nif_snapshot: string | null
          legal_rccm_snapshot: string | null
          notes: string | null
          paid_at: string | null
          period_end: string | null
          period_start: string | null
          public_token: string
          remaining_due: number | null
          rental_id: string | null
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
          customer_id: string
          driver_id: string
          driver_snapshot_name?: string | null
          driver_snapshot_nif?: string | null
          driver_snapshot_phone?: string | null
          id?: string
          invoice_kind?: string
          invoice_number?: string | null
          issued_at?: string | null
          legal_address_snapshot?: string | null
          legal_footer_snapshot?: string | null
          legal_name_snapshot?: string | null
          legal_nif_snapshot?: string | null
          legal_rccm_snapshot?: string | null
          notes?: string | null
          paid_at?: string | null
          period_end?: string | null
          period_start?: string | null
          public_token?: string
          remaining_due?: number | null
          rental_id?: string | null
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
          customer_id?: string
          driver_id?: string
          driver_snapshot_name?: string | null
          driver_snapshot_nif?: string | null
          driver_snapshot_phone?: string | null
          id?: string
          invoice_kind?: string
          invoice_number?: string | null
          issued_at?: string | null
          legal_address_snapshot?: string | null
          legal_footer_snapshot?: string | null
          legal_name_snapshot?: string | null
          legal_nif_snapshot?: string | null
          legal_rccm_snapshot?: string | null
          notes?: string | null
          paid_at?: string | null
          period_end?: string | null
          period_start?: string | null
          public_token?: string
          remaining_due?: number | null
          rental_id?: string | null
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
          {
            foreignKeyName: "kyc_submissions_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "admin_users_with_tokens"
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
            foreignKeyName: "loans_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "admin_users_with_tokens"
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
        Relationships: []
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
          {
            foreignKeyName: "platform_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "admin_users_with_tokens"
            referencedColumns: ["id"]
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
            foreignKeyName: "rentals_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "admin_users_with_tokens"
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
          {
            foreignKeyName: "scoring_config_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "admin_users_with_tokens"
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
        }
        Insert: {
          attachment_url?: string | null
          created_at?: string
          id?: string
          message: string
          sender_id: string
          sender_type: string
          ticket_id: string
        }
        Update: {
          attachment_url?: string | null
          created_at?: string
          id?: string
          message?: string
          sender_id?: string
          sender_type?: string
          ticket_id?: string
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
            foreignKeyName: "support_tickets_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "admin_users_with_tokens"
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
          duration_minutes: number | null
          id: string
          is_mandatory: boolean
          is_published: boolean
          order_index: number | null
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
          duration_minutes?: number | null
          id?: string
          is_mandatory?: boolean
          is_published?: boolean
          order_index?: number | null
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
          duration_minutes?: number | null
          id?: string
          is_mandatory?: boolean
          is_published?: boolean
          order_index?: number | null
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
            foreignKeyName: "training_modules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "admin_users_with_tokens"
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
          id: string
          inspection_id: string
          notes: string | null
          storage_path: string
          updated_at: string
          zone: string
        }
        Insert: {
          created_at?: string
          id?: string
          inspection_id: string
          notes?: string | null
          storage_path: string
          updated_at?: string
          zone: string
        }
        Update: {
          created_at?: string
          id?: string
          inspection_id?: string
          notes?: string | null
          storage_path?: string
          updated_at?: string
          zone?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_inspection_photos_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "vehicle_inspections"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_inspections: {
        Row: {
          created_at: string
          customer_id: string | null
          driver_id: string | null
          due_at: string
          id: string
          immobilization_reason: string | null
          immobilized_at: string | null
          last_reminder_at: string | null
          notes: string | null
          rejection_reason: string | null
          reminder_count: number
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
          driver_id?: string | null
          due_at?: string
          id?: string
          immobilization_reason?: string | null
          immobilized_at?: string | null
          last_reminder_at?: string | null
          notes?: string | null
          rejection_reason?: string | null
          reminder_count?: number
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
          driver_id?: string | null
          due_at?: string
          id?: string
          immobilization_reason?: string | null
          immobilized_at?: string | null
          last_reminder_at?: string | null
          notes?: string | null
          rejection_reason?: string | null
          reminder_count?: number
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
    }
    Views: {
      admin_users_with_tokens: {
        Row: {
          created_at: string | null
          customer_id: string | null
          email: string | null
          email_verified: boolean | null
          full_name: string | null
          id: string | null
          is_active: boolean | null
          is_platform_owner: boolean | null
          last_login_at: string | null
          role_key: string | null
          updated_at: string | null
          user_id: string | null
          verification_sent_at: string | null
          verification_token: string | null
        }
        Insert: {
          created_at?: string | null
          customer_id?: string | null
          email?: string | null
          email_verified?: boolean | null
          full_name?: string | null
          id?: string | null
          is_active?: boolean | null
          is_platform_owner?: boolean | null
          last_login_at?: string | null
          role_key?: string | null
          updated_at?: string | null
          user_id?: string | null
          verification_sent_at?: string | null
          verification_token?: string | null
        }
        Update: {
          created_at?: string | null
          customer_id?: string | null
          email?: string | null
          email_verified?: boolean | null
          full_name?: string | null
          id?: string | null
          is_active?: boolean | null
          is_platform_owner?: boolean | null
          last_login_at?: string | null
          role_key?: string | null
          updated_at?: string | null
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
      admin_create_rental: {
        Args: { p_driver_id: string; p_rate: number; p_vehicle_id: string }
        Returns: string
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
      classify_adjustment: { Args: { actor_id: string }; Returns: string }
      cleanup_vehicle_history: { Args: never; Returns: undefined }
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
      current_customer_id: { Args: never; Returns: string }
      current_driver_id: { Args: never; Returns: string }
      current_driver_is_active: { Args: never; Returns: boolean }
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
      driver_has_active_rental: {
        Args: { p_driver_id: string }
        Returns: boolean
      }
      format_invoice_number: {
        Args: { p_customer_id: string; p_n: number; p_year: number }
        Returns: string
      }
      generate_accident_case_number: { Args: never; Returns: string }
      generate_fleet_alerts: { Args: never; Returns: number }
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
      is_admin:
        | { Args: never; Returns: boolean }
        | { Args: { _user_id: string }; Returns: boolean }
      is_driver: { Args: never; Returns: boolean }
      is_feature_enabled: { Args: { p_flag_key: string }; Returns: boolean }
      is_platform_owner: { Args: never; Returns: boolean }
      issue_daily_rental_invoices: { Args: never; Returns: number }
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
      sweep_wallet_auto_apply: { Args: never; Returns: Json }
      test_wallet_settlement_paths: { Args: never; Returns: Json }
      trigger_apply_wallet_credit: {
        Args: { p_driver_id: string }
        Returns: undefined
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

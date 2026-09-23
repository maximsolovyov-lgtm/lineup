export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      app_user_profile: {
        Row: {
          created_at: string
          email: string
          full_name: string | null
          role: Database["public"]["Enums"]["app_role"]
          status: Database["public"]["Enums"]["record_status"]
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          status?: Database["public"]["Enums"]["record_status"]
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          status?: Database["public"]["Enums"]["record_status"]
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      artist: {
        Row: {
          artist_id: string
          artist_type: Database["public"]["Enums"]["artist_type"] | null
          country: string | null
          created_at: string
          instagram_url: string | null
          is_placeholder: boolean
          name: string
          normalized_name: string | null
          placeholder_type:
            | Database["public"]["Enums"]["placeholder_type"]
            | null
          status: Database["public"]["Enums"]["record_status"]
          updated_at: string | null
        }
        Insert: {
          artist_id?: string
          artist_type?: Database["public"]["Enums"]["artist_type"] | null
          country?: string | null
          created_at?: string
          instagram_url?: string | null
          is_placeholder?: boolean
          name: string
          normalized_name?: string | null
          placeholder_type?:
            | Database["public"]["Enums"]["placeholder_type"]
            | null
          status?: Database["public"]["Enums"]["record_status"]
          updated_at?: string | null
        }
        Update: {
          artist_id?: string
          artist_type?: Database["public"]["Enums"]["artist_type"] | null
          country?: string | null
          created_at?: string
          instagram_url?: string | null
          is_placeholder?: boolean
          name?: string
          normalized_name?: string | null
          placeholder_type?:
            | Database["public"]["Enums"]["placeholder_type"]
            | null
          status?: Database["public"]["Enums"]["record_status"]
          updated_at?: string | null
        }
        Relationships: []
      }
      artist_membership: {
        Row: {
          artist_id: string
          created_at: string
          display_order: number | null
          ended_at: string | null
          is_primary: boolean
          membership_id: string
          membership_role: Database["public"]["Enums"]["membership_role"] | null
          person_id: string
          started_at: string | null
          status: Database["public"]["Enums"]["record_status"]
          updated_at: string | null
        }
        Insert: {
          artist_id: string
          created_at?: string
          display_order?: number | null
          ended_at?: string | null
          is_primary?: boolean
          membership_id?: string
          membership_role?:
            | Database["public"]["Enums"]["membership_role"]
            | null
          person_id: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["record_status"]
          updated_at?: string | null
        }
        Update: {
          artist_id?: string
          created_at?: string
          display_order?: number | null
          ended_at?: string | null
          is_primary?: boolean
          membership_id?: string
          membership_role?:
            | Database["public"]["Enums"]["membership_role"]
            | null
          person_id?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["record_status"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "artist_membership_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artist"
            referencedColumns: ["artist_id"]
          },
          {
            foreignKeyName: "artist_membership_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["person_id"]
          },
        ]
      }
      event: {
        Row: {
          created_at: string
          description: string | null
          event_id: string
          event_type: Database["public"]["Enums"]["event_type"]
          name: string
          normalized_name: string | null
          status: Database["public"]["Enums"]["record_status"]
          updated_at: string | null
          website_url: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          event_id?: string
          event_type?: Database["public"]["Enums"]["event_type"]
          name: string
          normalized_name?: string | null
          status?: Database["public"]["Enums"]["record_status"]
          updated_at?: string | null
          website_url?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          event_id?: string
          event_type?: Database["public"]["Enums"]["event_type"]
          name?: string
          normalized_name?: string | null
          status?: Database["public"]["Enums"]["record_status"]
          updated_at?: string | null
          website_url?: string | null
        }
        Relationships: []
      }
      event_occurrence: {
        Row: {
          created_at: string
          ends_at: string
          event_date: string
          event_id: string
          occurrence_id: string
          occurrence_name: string | null
          part_of_occurrence_id: string | null
          primary_place_id: string | null
          starts_at: string
          status: Database["public"]["Enums"]["record_status"]
          timezone: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          ends_at: string
          event_date: string
          event_id: string
          occurrence_id?: string
          occurrence_name?: string | null
          part_of_occurrence_id?: string | null
          primary_place_id?: string | null
          starts_at: string
          status?: Database["public"]["Enums"]["record_status"]
          timezone?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          ends_at?: string
          event_date?: string
          event_id?: string
          occurrence_id?: string
          occurrence_name?: string | null
          part_of_occurrence_id?: string | null
          primary_place_id?: string | null
          starts_at?: string
          status?: Database["public"]["Enums"]["record_status"]
          timezone?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_occurrence_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "event_occurrence_part_of_occurrence_id_fkey"
            columns: ["part_of_occurrence_id"]
            isOneToOne: false
            referencedRelation: "event_occurrence"
            referencedColumns: ["occurrence_id"]
          },
          {
            foreignKeyName: "event_occurrence_primary_place_id_fkey"
            columns: ["primary_place_id"]
            isOneToOne: false
            referencedRelation: "place"
            referencedColumns: ["place_id"]
          },
        ]
      }
      evidence_source: {
        Row: {
          captured_at: string | null
          content_hash: string | null
          created_at: string
          source_id: string
          source_title: string | null
          source_type: string | null
          source_url: string | null
          status: Database["public"]["Enums"]["record_status"]
          updated_at: string | null
        }
        Insert: {
          captured_at?: string | null
          content_hash?: string | null
          created_at?: string
          source_id?: string
          source_title?: string | null
          source_type?: string | null
          source_url?: string | null
          status?: Database["public"]["Enums"]["record_status"]
          updated_at?: string | null
        }
        Update: {
          captured_at?: string | null
          content_hash?: string | null
          created_at?: string
          source_id?: string
          source_title?: string | null
          source_type?: string | null
          source_url?: string | null
          status?: Database["public"]["Enums"]["record_status"]
          updated_at?: string | null
        }
        Relationships: []
      }
      lineup: {
        Row: {
          created_at: string
          lineup_id: string
          notes: string | null
          occurrence_id: string
          place_id: string | null
          published_at: string | null
          source_id: string | null
          status: Database["public"]["Enums"]["record_status"]
          updated_at: string | null
          version: number
        }
        Insert: {
          created_at?: string
          lineup_id?: string
          notes?: string | null
          occurrence_id: string
          place_id?: string | null
          published_at?: string | null
          source_id?: string | null
          status?: Database["public"]["Enums"]["record_status"]
          updated_at?: string | null
          version?: number
        }
        Update: {
          created_at?: string
          lineup_id?: string
          notes?: string | null
          occurrence_id?: string
          place_id?: string | null
          published_at?: string | null
          source_id?: string | null
          status?: Database["public"]["Enums"]["record_status"]
          updated_at?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "lineup_occurrence_id_fkey"
            columns: ["occurrence_id"]
            isOneToOne: false
            referencedRelation: "event_occurrence"
            referencedColumns: ["occurrence_id"]
          },
          {
            foreignKeyName: "lineup_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "place"
            referencedColumns: ["place_id"]
          },
          {
            foreignKeyName: "lineup_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "evidence_source"
            referencedColumns: ["source_id"]
          },
        ]
      }
      lineup_artist: {
        Row: {
          billing_order: number | null
          created_at: string
          display_name_override: string | null
          is_headliner: boolean
          kind: Database["public"]["Enums"]["lineup_slot_kind"]
          lineup_artist_id: string
          lineup_id: string
          performance_format: Database["public"]["Enums"]["performance_format"]
          placeholder_type:
            | Database["public"]["Enums"]["placeholder_type"]
            | null
          status: Database["public"]["Enums"]["record_status"]
          tags: Database["public"]["Enums"]["lineup_slot_tag"][]
          updated_at: string | null
        }
        Insert: {
          billing_order?: number | null
          created_at?: string
          display_name_override?: string | null
          is_headliner?: boolean
          kind?: Database["public"]["Enums"]["lineup_slot_kind"]
          lineup_artist_id?: string
          lineup_id: string
          performance_format?: Database["public"]["Enums"]["performance_format"]
          placeholder_type?:
            | Database["public"]["Enums"]["placeholder_type"]
            | null
          status?: Database["public"]["Enums"]["record_status"]
          tags?: Database["public"]["Enums"]["lineup_slot_tag"][]
          updated_at?: string | null
        }
        Update: {
          billing_order?: number | null
          created_at?: string
          display_name_override?: string | null
          is_headliner?: boolean
          kind?: Database["public"]["Enums"]["lineup_slot_kind"]
          lineup_artist_id?: string
          lineup_id?: string
          performance_format?: Database["public"]["Enums"]["performance_format"]
          placeholder_type?:
            | Database["public"]["Enums"]["placeholder_type"]
            | null
          status?: Database["public"]["Enums"]["record_status"]
          tags?: Database["public"]["Enums"]["lineup_slot_tag"][]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lineup_artist_lineup_id_fkey"
            columns: ["lineup_id"]
            isOneToOne: false
            referencedRelation: "lineup"
            referencedColumns: ["lineup_id"]
          },
        ]
      }
      lineup_artist_participant: {
        Row: {
          artist_id: string
          lineup_artist_id: string
          participant_order: number
        }
        Insert: {
          artist_id: string
          lineup_artist_id: string
          participant_order: number
        }
        Update: {
          artist_id?: string
          lineup_artist_id?: string
          participant_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "lineup_artist_participant_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artist"
            referencedColumns: ["artist_id"]
          },
          {
            foreignKeyName: "lineup_artist_participant_lineup_artist_id_fkey"
            columns: ["lineup_artist_id"]
            isOneToOne: false
            referencedRelation: "lineup_artist"
            referencedColumns: ["lineup_artist_id"]
          },
        ]
      }
      performance_set: {
        Row: {
          artist_count: number | null
          artist_list_json: Json | null
          completeness: Database["public"]["Enums"]["set_completeness"]
          confidence_score: number | null
          confirmation_status: Database["public"]["Enums"]["confirmation_status"]
          created_at: string
          display_name: string | null
          event_day: string | null
          information_origin:
            | Database["public"]["Enums"]["information_origin"]
            | null
          lineup_complete: boolean
          lineup_id: string | null
          notes: string | null
          occurrence_id: string
          performance_set_id: string
          place_id: string | null
          place_role: Database["public"]["Enums"]["place_role"] | null
          place_space_id: string | null
          scenario_type: Database["public"]["Enums"]["set_scenario_type"]
          scenario_version: number
          scheduled_end_at: string | null
          scheduled_start_at: string | null
          sequence_number: number | null
          set_type: Database["public"]["Enums"]["performance_set_type"]
          source_id: string | null
          source_performance_set_id: string | null
          status: Database["public"]["Enums"]["record_status"]
          supersedes_performance_set_id: string | null
          updated_at: string | null
        }
        Insert: {
          artist_count?: number | null
          artist_list_json?: Json | null
          completeness?: Database["public"]["Enums"]["set_completeness"]
          confidence_score?: number | null
          confirmation_status?: Database["public"]["Enums"]["confirmation_status"]
          created_at?: string
          display_name?: string | null
          event_day?: string | null
          information_origin?:
            | Database["public"]["Enums"]["information_origin"]
            | null
          lineup_complete?: boolean
          lineup_id?: string | null
          notes?: string | null
          occurrence_id: string
          performance_set_id?: string
          place_id?: string | null
          place_role?: Database["public"]["Enums"]["place_role"] | null
          place_space_id?: string | null
          scenario_type: Database["public"]["Enums"]["set_scenario_type"]
          scenario_version: number
          scheduled_end_at?: string | null
          scheduled_start_at?: string | null
          sequence_number?: number | null
          set_type: Database["public"]["Enums"]["performance_set_type"]
          source_id?: string | null
          source_performance_set_id?: string | null
          status?: Database["public"]["Enums"]["record_status"]
          supersedes_performance_set_id?: string | null
          updated_at?: string | null
        }
        Update: {
          artist_count?: number | null
          artist_list_json?: Json | null
          completeness?: Database["public"]["Enums"]["set_completeness"]
          confidence_score?: number | null
          confirmation_status?: Database["public"]["Enums"]["confirmation_status"]
          created_at?: string
          display_name?: string | null
          event_day?: string | null
          information_origin?:
            | Database["public"]["Enums"]["information_origin"]
            | null
          lineup_complete?: boolean
          lineup_id?: string | null
          notes?: string | null
          occurrence_id?: string
          performance_set_id?: string
          place_id?: string | null
          place_role?: Database["public"]["Enums"]["place_role"] | null
          place_space_id?: string | null
          scenario_type?: Database["public"]["Enums"]["set_scenario_type"]
          scenario_version?: number
          scheduled_end_at?: string | null
          scheduled_start_at?: string | null
          sequence_number?: number | null
          set_type?: Database["public"]["Enums"]["performance_set_type"]
          source_id?: string | null
          source_performance_set_id?: string | null
          status?: Database["public"]["Enums"]["record_status"]
          supersedes_performance_set_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "performance_set_lineup_id_fkey"
            columns: ["lineup_id"]
            isOneToOne: false
            referencedRelation: "lineup"
            referencedColumns: ["lineup_id"]
          },
          {
            foreignKeyName: "performance_set_occurrence_id_fkey"
            columns: ["occurrence_id"]
            isOneToOne: false
            referencedRelation: "event_occurrence"
            referencedColumns: ["occurrence_id"]
          },
          {
            foreignKeyName: "performance_set_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "place"
            referencedColumns: ["place_id"]
          },
          {
            foreignKeyName: "performance_set_place_space_id_fkey"
            columns: ["place_space_id"]
            isOneToOne: false
            referencedRelation: "place_space"
            referencedColumns: ["space_id"]
          },
          {
            foreignKeyName: "performance_set_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "evidence_source"
            referencedColumns: ["source_id"]
          },
          {
            foreignKeyName: "performance_set_source_performance_set_id_fkey"
            columns: ["source_performance_set_id"]
            isOneToOne: false
            referencedRelation: "performance_set"
            referencedColumns: ["performance_set_id"]
          },
          {
            foreignKeyName: "performance_set_supersedes_performance_set_id_fkey"
            columns: ["supersedes_performance_set_id"]
            isOneToOne: false
            referencedRelation: "performance_set"
            referencedColumns: ["performance_set_id"]
          },
        ]
      }
      performance_set_participant: {
        Row: {
          artist_id: string | null
          billing_order: number | null
          created_at: string
          display_name_override: string | null
          display_order: number | null
          is_headliner: boolean | null
          is_primary: boolean | null
          participant_id: string
          participant_role: Database["public"]["Enums"]["participant_role"]
          performance_set_id: string
          placeholder_type:
            | Database["public"]["Enums"]["placeholder_type"]
            | null
          status: Database["public"]["Enums"]["record_status"]
          updated_at: string | null
        }
        Insert: {
          artist_id?: string | null
          billing_order?: number | null
          created_at?: string
          display_name_override?: string | null
          display_order?: number | null
          is_headliner?: boolean | null
          is_primary?: boolean | null
          participant_id?: string
          participant_role?: Database["public"]["Enums"]["participant_role"]
          performance_set_id: string
          placeholder_type?:
            | Database["public"]["Enums"]["placeholder_type"]
            | null
          status?: Database["public"]["Enums"]["record_status"]
          updated_at?: string | null
        }
        Update: {
          artist_id?: string | null
          billing_order?: number | null
          created_at?: string
          display_name_override?: string | null
          display_order?: number | null
          is_headliner?: boolean | null
          is_primary?: boolean | null
          participant_id?: string
          participant_role?: Database["public"]["Enums"]["participant_role"]
          performance_set_id?: string
          placeholder_type?:
            | Database["public"]["Enums"]["placeholder_type"]
            | null
          status?: Database["public"]["Enums"]["record_status"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "performance_set_participant_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artist"
            referencedColumns: ["artist_id"]
          },
          {
            foreignKeyName: "performance_set_participant_performance_set_id_fkey"
            columns: ["performance_set_id"]
            isOneToOne: false
            referencedRelation: "performance_set"
            referencedColumns: ["performance_set_id"]
          },
        ]
      }
      performance_set_participant_person: {
        Row: {
          created_at: string
          participant_id: string
          participant_person_id: string
          person_id: string
          source_id: string | null
        }
        Insert: {
          created_at?: string
          participant_id: string
          participant_person_id?: string
          person_id: string
          source_id?: string | null
        }
        Update: {
          created_at?: string
          participant_id?: string
          participant_person_id?: string
          person_id?: string
          source_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "performance_set_participant_person_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "performance_set_participant"
            referencedColumns: ["participant_id"]
          },
          {
            foreignKeyName: "performance_set_participant_person_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "performance_set_participant_person_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "evidence_source"
            referencedColumns: ["source_id"]
          },
        ]
      }
      person: {
        Row: {
          country: string | null
          created_at: string
          display_name: string
          normalized_name: string | null
          notes: string | null
          person_id: string
          status: Database["public"]["Enums"]["record_status"]
          updated_at: string | null
        }
        Insert: {
          country?: string | null
          created_at?: string
          display_name: string
          normalized_name?: string | null
          notes?: string | null
          person_id?: string
          status?: Database["public"]["Enums"]["record_status"]
          updated_at?: string | null
        }
        Update: {
          country?: string | null
          created_at?: string
          display_name?: string
          normalized_name?: string | null
          notes?: string | null
          person_id?: string
          status?: Database["public"]["Enums"]["record_status"]
          updated_at?: string | null
        }
        Relationships: []
      }
      place: {
        Row: {
          address: string | null
          capacity: number | null
          city: string | null
          country: string | null
          created_at: string
          created_by_user_id: string | null
          facebook_account: string | null
          facebook_url: string | null
          instagram_account: string | null
          instagram_url: string | null
          latitude: number | null
          lifecycle_type: Database["public"]["Enums"]["place_lifecycle_type"]
          lineup_pattern: string | null
          lineup_pattern_confidence_score: number | null
          lineup_pattern_notes: string | null
          lineup_pattern_sample_size: number | null
          longitude: number | null
          name: string
          news_pattern: string | null
          normalized_name: string | null
          parent_place_id: string | null
          place_id: string
          region: string | null
          status: Database["public"]["Enums"]["record_status"]
          tags: string[]
          timezone: string | null
          typical_headliner_end_day_offset: number | null
          typical_headliner_end_time: string | null
          typical_headliner_room_name: string | null
          typical_headliner_start_day_offset: number | null
          typical_headliner_start_time: string | null
          typical_party_end_day_offset: number | null
          typical_party_end_time: string | null
          typical_party_start_day_offset: number | null
          typical_party_start_time: string | null
          typical_room_count: number | null
          typical_rooms_json: Json | null
          updated_at: string | null
          updated_by_user_id: string | null
          website_url: string | null
        }
        Insert: {
          address?: string | null
          capacity?: number | null
          city?: string | null
          country?: string | null
          created_at?: string
          created_by_user_id?: string | null
          facebook_account?: string | null
          facebook_url?: string | null
          instagram_account?: string | null
          instagram_url?: string | null
          latitude?: number | null
          lifecycle_type?: Database["public"]["Enums"]["place_lifecycle_type"]
          lineup_pattern?: string | null
          lineup_pattern_confidence_score?: number | null
          lineup_pattern_notes?: string | null
          lineup_pattern_sample_size?: number | null
          longitude?: number | null
          name: string
          news_pattern?: string | null
          normalized_name?: string | null
          parent_place_id?: string | null
          place_id?: string
          region?: string | null
          status?: Database["public"]["Enums"]["record_status"]
          tags?: string[]
          timezone?: string | null
          typical_headliner_end_day_offset?: number | null
          typical_headliner_end_time?: string | null
          typical_headliner_room_name?: string | null
          typical_headliner_start_day_offset?: number | null
          typical_headliner_start_time?: string | null
          typical_party_end_day_offset?: number | null
          typical_party_end_time?: string | null
          typical_party_start_day_offset?: number | null
          typical_party_start_time?: string | null
          typical_room_count?: number | null
          typical_rooms_json?: Json | null
          updated_at?: string | null
          updated_by_user_id?: string | null
          website_url?: string | null
        }
        Update: {
          address?: string | null
          capacity?: number | null
          city?: string | null
          country?: string | null
          created_at?: string
          created_by_user_id?: string | null
          facebook_account?: string | null
          facebook_url?: string | null
          instagram_account?: string | null
          instagram_url?: string | null
          latitude?: number | null
          lifecycle_type?: Database["public"]["Enums"]["place_lifecycle_type"]
          lineup_pattern?: string | null
          lineup_pattern_confidence_score?: number | null
          lineup_pattern_notes?: string | null
          lineup_pattern_sample_size?: number | null
          longitude?: number | null
          name?: string
          news_pattern?: string | null
          normalized_name?: string | null
          parent_place_id?: string | null
          place_id?: string
          region?: string | null
          status?: Database["public"]["Enums"]["record_status"]
          tags?: string[]
          timezone?: string | null
          typical_headliner_end_day_offset?: number | null
          typical_headliner_end_time?: string | null
          typical_headliner_room_name?: string | null
          typical_headliner_start_day_offset?: number | null
          typical_headliner_start_time?: string | null
          typical_party_end_day_offset?: number | null
          typical_party_end_time?: string | null
          typical_party_start_day_offset?: number | null
          typical_party_start_time?: string | null
          typical_room_count?: number | null
          typical_rooms_json?: Json | null
          updated_at?: string | null
          updated_by_user_id?: string | null
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "place_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "app_user_profile"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "place_parent_place_id_fkey"
            columns: ["parent_place_id"]
            isOneToOne: false
            referencedRelation: "place"
            referencedColumns: ["place_id"]
          },
          {
            foreignKeyName: "place_updated_by_user_id_fkey"
            columns: ["updated_by_user_id"]
            isOneToOne: false
            referencedRelation: "app_user_profile"
            referencedColumns: ["user_id"]
          },
        ]
      }
      place_space: {
        Row: {
          capacity: number | null
          created_at: string
          display_order: number | null
          is_primary: boolean
          name: string
          normalized_name: string | null
          notes: string | null
          place_id: string
          space_id: string
          space_type: string | null
          status: Database["public"]["Enums"]["record_status"]
          updated_at: string | null
        }
        Insert: {
          capacity?: number | null
          created_at?: string
          display_order?: number | null
          is_primary?: boolean
          name: string
          normalized_name?: string | null
          notes?: string | null
          place_id: string
          space_id?: string
          space_type?: string | null
          status?: Database["public"]["Enums"]["record_status"]
          updated_at?: string | null
        }
        Update: {
          capacity?: number | null
          created_at?: string
          display_order?: number | null
          is_primary?: boolean
          name?: string
          normalized_name?: string | null
          notes?: string | null
          place_id?: string
          space_id?: string
          space_type?: string | null
          status?: Database["public"]["Enums"]["record_status"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "place_space_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "place"
            referencedColumns: ["place_id"]
          },
        ]
      }
      review_task: {
        Row: {
          created_at: string
          entity_id: string
          entity_type: string
          kind: string
          message: string
          review_task_id: string
          status: Database["public"]["Enums"]["record_status"]
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          entity_id: string
          entity_type: string
          kind: string
          message: string
          review_task_id?: string
          status?: Database["public"]["Enums"]["record_status"]
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          entity_id?: string
          entity_type?: string
          kind?: string
          message?: string
          review_task_id?: string
          status?: Database["public"]["Enums"]["record_status"]
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_app_role: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"]
      }
      find_lineups: {
        Args: {
          p_artist_id?: string
          p_date?: string
          p_days?: number
          p_event_id?: string
          p_occurrence_id?: string
          p_place_id?: string
        }
        Returns: {
          event_date: string
          event_id: string
          event_name: string
          lineups: Json
          occurrence_id: string
          occurrence_name: string
          occurrence_status: Database["public"]["Enums"]["record_status"]
          part_of_name: string
          part_of_occurrence_id: string
          primary_place_id: string
          primary_place_name: string
        }[]
      }
      is_admin: { Args: never; Returns: boolean }
      is_operator_or_admin: { Args: never; Returns: boolean }
      is_valid_rooms_json: { Args: { j: Json }; Returns: boolean }
      is_valid_tags: { Args: { t: string[] }; Returns: boolean }
      lineup_slot_label: {
        Args: {
          p_kind: Database["public"]["Enums"]["lineup_slot_kind"]
          p_names: string[]
          p_printed: string
        }
        Returns: string
      }
      normalize_name: { Args: { p_name: string }; Returns: string }
      place_tag_counts: {
        Args: never
        Returns: {
          place_count: number
          tag: string
        }[]
      }
      save_artist_with_members: {
        Args: { p_artist: Json; p_members?: Json }
        Returns: string
      }
      save_event_with_occurrences: {
        Args: { p_event: Json; p_occurrences?: Json }
        Returns: string
      }
      save_lineup: {
        Args: { p_artists?: Json; p_lineup: Json }
        Returns: string
      }
      save_performance_set: {
        Args: { p_participants?: Json; p_set: Json }
        Returns: string
      }
      save_place_with_spaces: {
        Args: { p_place: Json; p_spaces?: Json }
        Returns: string
      }
    }
    Enums: {
      app_role: "admin" | "operator"
      artist_type: "solo" | "duo" | "group" | "collective" | "alias" | "unknown"
      confirmation_status:
        | "unconfirmed"
        | "confirmed"
        | "disputed"
        | "retracted"
      event_type:
        | "party"
        | "festival"
        | "concert"
        | "afterparty"
        | "label_night"
        | "other"
        | "unknown"
      information_origin:
        | "venue_announced"
        | "artist_announced"
        | "ticketing"
        | "press"
        | "user_submitted"
        | "predicted"
        | "observed"
        | "manual"
      lineup_slot_kind:
        | "solo"
        | "b2b"
        | "b3b"
        | "b4b"
        | "collaboration"
        | "featuring"
        | "multiple_guests"
        | "label_only"
        | "unknown"
      lineup_slot_tag:
        | "standard"
        | "all_night_long"
        | "open_to_close"
        | "opening"
        | "closing"
        | "sunrise"
        | "sunset"
        | "afterhours"
        | "peak_time"
      membership_role:
        | "dj"
        | "producer"
        | "live"
        | "vocalist"
        | "mc"
        | "visual"
        | "other"
      participant_role:
        | "primary"
        | "b2b"
        | "featured"
        | "guest"
        | "host"
        | "mc"
        | "support"
        | "headliner"
        | "placeholder"
        | "unknown"
      performance_format:
        | "dj_set"
        | "live"
        | "live_pa"
        | "hybrid"
        | "dj_live_pa"
        | "av"
        | "acoustic"
        | "other"
        | "unknown"
      performance_set_type:
        | "group"
        | "single_artist_set"
        | "b2b"
        | "multi_b2b"
        | "featuring"
        | "hosted_set"
        | "placeholder"
        | "service_block"
        | "unknown"
      place_lifecycle_type: "permanent" | "temporary" | "mobile" | "virtual"
      place_role: "main" | "afterparty" | "satellite"
      placeholder_type: "tbd" | "secret_guest" | "unknown"
      record_status:
        | "draft"
        | "active"
        | "inactive"
        | "closed"
        | "cancelled"
        | "superseded"
        | "archived"
        | "deleted"
      release_kind:
        | "lineup"
        | "stage_split"
        | "partial_schedule"
        | "full_timetable"
        | "cancellation"
        | "replacement"
        | "other"
      set_completeness: "full" | "partial"
      set_scenario_type: "official" | "predicted" | "actual" | "manual"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["admin", "operator"],
      artist_type: ["solo", "duo", "group", "collective", "alias", "unknown"],
      confirmation_status: [
        "unconfirmed",
        "confirmed",
        "disputed",
        "retracted",
      ],
      event_type: [
        "party",
        "festival",
        "concert",
        "afterparty",
        "label_night",
        "other",
        "unknown",
      ],
      information_origin: [
        "venue_announced",
        "artist_announced",
        "ticketing",
        "press",
        "user_submitted",
        "predicted",
        "observed",
        "manual",
      ],
      lineup_slot_kind: [
        "solo",
        "b2b",
        "b3b",
        "b4b",
        "collaboration",
        "featuring",
        "multiple_guests",
        "label_only",
        "unknown",
      ],
      lineup_slot_tag: [
        "standard",
        "all_night_long",
        "open_to_close",
        "opening",
        "closing",
        "sunrise",
        "sunset",
        "afterhours",
        "peak_time",
      ],
      membership_role: [
        "dj",
        "producer",
        "live",
        "vocalist",
        "mc",
        "visual",
        "other",
      ],
      participant_role: [
        "primary",
        "b2b",
        "featured",
        "guest",
        "host",
        "mc",
        "support",
        "headliner",
        "placeholder",
        "unknown",
      ],
      performance_format: [
        "dj_set",
        "live",
        "live_pa",
        "hybrid",
        "dj_live_pa",
        "av",
        "acoustic",
        "other",
        "unknown",
      ],
      performance_set_type: [
        "group",
        "single_artist_set",
        "b2b",
        "multi_b2b",
        "featuring",
        "hosted_set",
        "placeholder",
        "service_block",
        "unknown",
      ],
      place_lifecycle_type: ["permanent", "temporary", "mobile", "virtual"],
      place_role: ["main", "afterparty", "satellite"],
      placeholder_type: ["tbd", "secret_guest", "unknown"],
      record_status: [
        "draft",
        "active",
        "inactive",
        "closed",
        "cancelled",
        "superseded",
        "archived",
        "deleted",
      ],
      release_kind: [
        "lineup",
        "stage_split",
        "partial_schedule",
        "full_timetable",
        "cancellation",
        "replacement",
        "other",
      ],
      set_completeness: ["full", "partial"],
      set_scenario_type: ["official", "predicted", "actual", "manual"],
    },
  },
} as const


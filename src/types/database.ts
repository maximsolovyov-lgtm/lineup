// Supabase Database types for LineApp MVP v1.
//
// Hand-written against supabase/migrations (verified by scripts/verify-schema.sh)
// because `supabase gen types` needs Docker, which the authoring environment
// lacked. Regenerate with `npm run db:types` when the local stack is available;
// the shape below matches the generator's output for supabase-js v2.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type Timestamp = string;

export type Database = {
  public: {
    Tables: {
      app_user_profile: {
        Row: {
          user_id: string;
          email: string;
          full_name: string | null;
          role: Database['public']['Enums']['app_role'];
          status: Database['public']['Enums']['record_status'];
          created_at: Timestamp;
          updated_at: Timestamp | null;
        };
        Insert: {
          user_id: string;
          email: string;
          full_name?: string | null;
          role?: Database['public']['Enums']['app_role'];
          status?: Database['public']['Enums']['record_status'];
          created_at?: Timestamp;
          updated_at?: Timestamp | null;
        };
        Update: {
          user_id?: string;
          email?: string;
          full_name?: string | null;
          role?: Database['public']['Enums']['app_role'];
          status?: Database['public']['Enums']['record_status'];
          created_at?: Timestamp;
          updated_at?: Timestamp | null;
        };
        Relationships: [];
      };
      place: {
        Row: {
          place_id: string;
          parent_place_id: string | null;
          name: string;
          normalized_name: string | null;
          lifecycle_type: Database['public']['Enums']['place_lifecycle_type'];
          address: string | null;
          city: string | null;
          region: string | null;
          country: string | null;
          latitude: number | null;
          longitude: number | null;
          timezone: string | null;
          capacity: number | null;
          website_url: string | null;
          instagram_account: string | null;
          instagram_url: string | null;
          facebook_account: string | null;
          facebook_url: string | null;
          news_pattern: string | null;
          lineup_pattern: string | null;
          typical_party_start_time: string | null;
          typical_party_end_time: string | null;
          typical_party_start_day_offset: number | null;
          typical_party_end_day_offset: number | null;
          typical_room_count: number | null;
          typical_rooms_json: Json | null;
          typical_headliner_room_name: string | null;
          typical_headliner_start_time: string | null;
          typical_headliner_start_day_offset: number | null;
          typical_headliner_end_time: string | null;
          typical_headliner_end_day_offset: number | null;
          lineup_pattern_confidence_score: number | null;
          lineup_pattern_sample_size: number | null;
          lineup_pattern_notes: string | null;
          status: Database['public']['Enums']['record_status'];
          created_by_user_id: string | null;
          updated_by_user_id: string | null;
          created_at: Timestamp;
          updated_at: Timestamp | null;
        };
        Insert: {
          place_id?: string;
          parent_place_id?: string | null;
          name: string;
          normalized_name?: string | null;
          lifecycle_type?: Database['public']['Enums']['place_lifecycle_type'];
          address?: string | null;
          city?: string | null;
          region?: string | null;
          country?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          timezone?: string | null;
          capacity?: number | null;
          website_url?: string | null;
          instagram_account?: string | null;
          instagram_url?: string | null;
          facebook_account?: string | null;
          facebook_url?: string | null;
          news_pattern?: string | null;
          lineup_pattern?: string | null;
          typical_party_start_time?: string | null;
          typical_party_end_time?: string | null;
          typical_party_start_day_offset?: number | null;
          typical_party_end_day_offset?: number | null;
          typical_room_count?: number | null;
          typical_rooms_json?: Json | null;
          typical_headliner_room_name?: string | null;
          typical_headliner_start_time?: string | null;
          typical_headliner_start_day_offset?: number | null;
          typical_headliner_end_time?: string | null;
          typical_headliner_end_day_offset?: number | null;
          lineup_pattern_confidence_score?: number | null;
          lineup_pattern_sample_size?: number | null;
          lineup_pattern_notes?: string | null;
          status?: Database['public']['Enums']['record_status'];
          created_by_user_id?: string | null;
          updated_by_user_id?: string | null;
          created_at?: Timestamp;
          updated_at?: Timestamp | null;
        };
        Update: {
          place_id?: string;
          parent_place_id?: string | null;
          name?: string;
          normalized_name?: string | null;
          lifecycle_type?: Database['public']['Enums']['place_lifecycle_type'];
          address?: string | null;
          city?: string | null;
          region?: string | null;
          country?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          timezone?: string | null;
          capacity?: number | null;
          website_url?: string | null;
          instagram_account?: string | null;
          instagram_url?: string | null;
          facebook_account?: string | null;
          facebook_url?: string | null;
          news_pattern?: string | null;
          lineup_pattern?: string | null;
          typical_party_start_time?: string | null;
          typical_party_end_time?: string | null;
          typical_party_start_day_offset?: number | null;
          typical_party_end_day_offset?: number | null;
          typical_room_count?: number | null;
          typical_rooms_json?: Json | null;
          typical_headliner_room_name?: string | null;
          typical_headliner_start_time?: string | null;
          typical_headliner_start_day_offset?: number | null;
          typical_headliner_end_time?: string | null;
          typical_headliner_end_day_offset?: number | null;
          lineup_pattern_confidence_score?: number | null;
          lineup_pattern_sample_size?: number | null;
          lineup_pattern_notes?: string | null;
          status?: Database['public']['Enums']['record_status'];
          created_by_user_id?: string | null;
          updated_by_user_id?: string | null;
          created_at?: Timestamp;
          updated_at?: Timestamp | null;
        };
        Relationships: [];
      };
      event: {
        Row: {
          event_id: string;
          name: string;
          normalized_name: string | null;
          event_type: Database['public']['Enums']['event_type'];
          status: Database['public']['Enums']['record_status'];
          created_at: Timestamp;
          updated_at: Timestamp | null;
        };
        Insert: {
          event_id?: string;
          name: string;
          normalized_name?: string | null;
          event_type?: Database['public']['Enums']['event_type'];
          status?: Database['public']['Enums']['record_status'];
          created_at?: Timestamp;
          updated_at?: Timestamp | null;
        };
        Update: {
          event_id?: string;
          name?: string;
          normalized_name?: string | null;
          event_type?: Database['public']['Enums']['event_type'];
          status?: Database['public']['Enums']['record_status'];
          created_at?: Timestamp;
          updated_at?: Timestamp | null;
        };
        Relationships: [];
      };
      event_occurrence: {
        Row: {
          occurrence_id: string;
          event_id: string;
          primary_place_id: string | null;
          occurrence_name: string | null;
          starts_at: Timestamp;
          ends_at: Timestamp;
          timezone: string | null;
          status: Database['public']['Enums']['record_status'];
          created_at: Timestamp;
          updated_at: Timestamp | null;
        };
        Insert: {
          occurrence_id?: string;
          event_id: string;
          primary_place_id?: string | null;
          occurrence_name?: string | null;
          starts_at: Timestamp;
          ends_at: Timestamp;
          timezone?: string | null;
          status?: Database['public']['Enums']['record_status'];
          created_at?: Timestamp;
          updated_at?: Timestamp | null;
        };
        Update: {
          occurrence_id?: string;
          event_id?: string;
          primary_place_id?: string | null;
          occurrence_name?: string | null;
          starts_at?: Timestamp;
          ends_at?: Timestamp;
          timezone?: string | null;
          status?: Database['public']['Enums']['record_status'];
          created_at?: Timestamp;
          updated_at?: Timestamp | null;
        };
        Relationships: [];
      };
      place_space: {
        Row: {
          space_id: string;
          place_id: string;
          name: string;
          normalized_name: string | null;
          space_type: string | null;
          capacity: number | null;
          status: Database['public']['Enums']['record_status'];
          created_at: Timestamp;
          updated_at: Timestamp | null;
        };
        Insert: {
          space_id?: string;
          place_id: string;
          name: string;
          normalized_name?: string | null;
          space_type?: string | null;
          capacity?: number | null;
          status?: Database['public']['Enums']['record_status'];
          created_at?: Timestamp;
          updated_at?: Timestamp | null;
        };
        Update: {
          space_id?: string;
          place_id?: string;
          name?: string;
          normalized_name?: string | null;
          space_type?: string | null;
          capacity?: number | null;
          status?: Database['public']['Enums']['record_status'];
          created_at?: Timestamp;
          updated_at?: Timestamp | null;
        };
        Relationships: [];
      };
      artist: {
        Row: {
          artist_id: string;
          name: string;
          normalized_name: string | null;
          artist_type: string | null;
          status: Database['public']['Enums']['record_status'];
          created_at: Timestamp;
          updated_at: Timestamp | null;
        };
        Insert: {
          artist_id?: string;
          name: string;
          normalized_name?: string | null;
          artist_type?: string | null;
          status?: Database['public']['Enums']['record_status'];
          created_at?: Timestamp;
          updated_at?: Timestamp | null;
        };
        Update: {
          artist_id?: string;
          name?: string;
          normalized_name?: string | null;
          artist_type?: string | null;
          status?: Database['public']['Enums']['record_status'];
          created_at?: Timestamp;
          updated_at?: Timestamp | null;
        };
        Relationships: [];
      };
      evidence_source: {
        Row: {
          source_id: string;
          source_type: string | null;
          source_url: string | null;
          source_title: string | null;
          captured_at: Timestamp | null;
          status: Database['public']['Enums']['record_status'];
          created_at: Timestamp;
          updated_at: Timestamp | null;
        };
        Insert: {
          source_id?: string;
          source_type?: string | null;
          source_url?: string | null;
          source_title?: string | null;
          captured_at?: Timestamp | null;
          status?: Database['public']['Enums']['record_status'];
          created_at?: Timestamp;
          updated_at?: Timestamp | null;
        };
        Update: {
          source_id?: string;
          source_type?: string | null;
          source_url?: string | null;
          source_title?: string | null;
          captured_at?: Timestamp | null;
          status?: Database['public']['Enums']['record_status'];
          created_at?: Timestamp;
          updated_at?: Timestamp | null;
        };
        Relationships: [];
      };
      performance_set: {
        Row: {
          performance_set_id: string;
          occurrence_id: string;
          place_id: string | null;
          place_space_id: string | null;
          scenario_type: Database['public']['Enums']['set_scenario_type'];
          scenario_version: number;
          set_type: Database['public']['Enums']['performance_set_type'];
          display_name: string | null;
          scheduled_start_at: Timestamp;
          scheduled_end_at: Timestamp;
          sequence_number: number | null;
          artist_list_json: Json | null;
          artist_count: number | null;
          information_origin: string | null;
          confirmation_status: string | null;
          confidence_score: number | null;
          source_performance_set_id: string | null;
          supersedes_performance_set_id: string | null;
          source_id: string | null;
          notes: string | null;
          status: Database['public']['Enums']['record_status'];
          created_at: Timestamp;
          updated_at: Timestamp | null;
        };
        Insert: {
          performance_set_id?: string;
          occurrence_id: string;
          place_id?: string | null;
          place_space_id?: string | null;
          scenario_type: Database['public']['Enums']['set_scenario_type'];
          scenario_version: number;
          set_type: Database['public']['Enums']['performance_set_type'];
          display_name?: string | null;
          scheduled_start_at: Timestamp;
          scheduled_end_at: Timestamp;
          sequence_number?: number | null;
          artist_list_json?: Json | null;
          artist_count?: number | null;
          information_origin?: string | null;
          confirmation_status?: string | null;
          confidence_score?: number | null;
          source_performance_set_id?: string | null;
          supersedes_performance_set_id?: string | null;
          source_id?: string | null;
          notes?: string | null;
          status?: Database['public']['Enums']['record_status'];
          created_at?: Timestamp;
          updated_at?: Timestamp | null;
        };
        Update: {
          performance_set_id?: string;
          occurrence_id?: string;
          place_id?: string | null;
          place_space_id?: string | null;
          scenario_type?: Database['public']['Enums']['set_scenario_type'];
          scenario_version?: number;
          set_type?: Database['public']['Enums']['performance_set_type'];
          display_name?: string | null;
          scheduled_start_at?: Timestamp;
          scheduled_end_at?: Timestamp;
          sequence_number?: number | null;
          artist_list_json?: Json | null;
          artist_count?: number | null;
          information_origin?: string | null;
          confirmation_status?: string | null;
          confidence_score?: number | null;
          source_performance_set_id?: string | null;
          supersedes_performance_set_id?: string | null;
          source_id?: string | null;
          notes?: string | null;
          status?: Database['public']['Enums']['record_status'];
          created_at?: Timestamp;
          updated_at?: Timestamp | null;
        };
        Relationships: [];
      };
      performance_set_participant: {
        Row: {
          participant_id: string;
          performance_set_id: string;
          artist_id: string | null;
          participant_role: Database['public']['Enums']['participant_role'];
          billing_order: number | null;
          display_order: number | null;
          is_headliner: boolean | null;
          is_primary: boolean | null;
          display_name_override: string | null;
          status: Database['public']['Enums']['record_status'];
          created_at: Timestamp;
          updated_at: Timestamp | null;
        };
        Insert: {
          participant_id?: string;
          performance_set_id: string;
          artist_id?: string | null;
          participant_role?: Database['public']['Enums']['participant_role'];
          billing_order?: number | null;
          display_order?: number | null;
          is_headliner?: boolean | null;
          is_primary?: boolean | null;
          display_name_override?: string | null;
          status?: Database['public']['Enums']['record_status'];
          created_at?: Timestamp;
          updated_at?: Timestamp | null;
        };
        Update: {
          participant_id?: string;
          performance_set_id?: string;
          artist_id?: string | null;
          participant_role?: Database['public']['Enums']['participant_role'];
          billing_order?: number | null;
          display_order?: number | null;
          is_headliner?: boolean | null;
          is_primary?: boolean | null;
          display_name_override?: string | null;
          status?: Database['public']['Enums']['record_status'];
          created_at?: Timestamp;
          updated_at?: Timestamp | null;
        };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      current_app_role: { Args: Record<PropertyKey, never>; Returns: Database['public']['Enums']['app_role'] | null };
      is_admin: { Args: Record<PropertyKey, never>; Returns: boolean };
      is_operator_or_admin: { Args: Record<PropertyKey, never>; Returns: boolean };
      normalize_name: { Args: { p_name: string }; Returns: string | null };
      is_valid_rooms_json: { Args: { j: Json }; Returns: boolean };
    };
    Enums: {
      app_role: 'admin' | 'operator';
      record_status: 'draft' | 'active' | 'inactive' | 'closed' | 'superseded' | 'archived' | 'deleted';
      place_lifecycle_type: 'permanent' | 'temporary' | 'mobile' | 'virtual';
      event_type: 'party' | 'festival' | 'concert' | 'afterparty' | 'label_night' | 'other' | 'unknown';
      set_scenario_type: 'official' | 'predicted' | 'actual' | 'manual';
      performance_set_type:
        | 'group' | 'single_artist_set' | 'b2b' | 'multi_b2b' | 'featuring'
        | 'hosted_set' | 'placeholder' | 'service_block' | 'unknown';
      participant_role:
        | 'primary' | 'b2b' | 'featured' | 'guest' | 'host' | 'mc' | 'support'
        | 'headliner' | 'placeholder' | 'unknown';
    };
    CompositeTypes: { [_ in never]: never };
  };
};

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];
export type TablesInsert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert'];
export type TablesUpdate<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update'];
export type Enums<T extends keyof Database['public']['Enums']> =
  Database['public']['Enums'][T];

// Enum value lists for dropdowns — the database is the source of truth.
export const APP_ROLES: Enums<'app_role'>[] = ['admin', 'operator'];
export const RECORD_STATUSES: Enums<'record_status'>[] = [
  'draft', 'active', 'inactive', 'closed', 'superseded', 'archived', 'deleted',
];
export const PLACE_LIFECYCLE_TYPES: Enums<'place_lifecycle_type'>[] = [
  'permanent', 'temporary', 'mobile', 'virtual',
];

export type Database = {
  public: {
    Tables: {
      documents: {
        Row: {
          id: string;
          title: string;
          source: string | null;
          content_hash: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          source?: string | null;
          content_hash: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          source?: string | null;
          content_hash?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      chunks: {
        Row: {
          id: number;
          document_id: string;
          chunk_index: number;
          content: string;
          embedding: number[];
          fts: unknown;
        };
        Insert: {
          id?: number;
          document_id: string;
          chunk_index: number;
          content: string;
          embedding: number[];
          fts?: unknown;
        };
        Update: {
          id?: number;
          document_id?: string;
          chunk_index?: number;
          content?: string;
          embedding?: number[];
          fts?: unknown;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          first_name: string | null;
          last_name: string | null;
          full_name: string | null;
          mobile_number: string | null;
          updated_at: string;
        };
        Insert: {
          id: string;
          first_name?: string | null;
          last_name?: string | null;
          full_name?: string | null;
          mobile_number?: string | null;
          updated_at?: string;
        };
        Update: {
          id?: string;
          first_name?: string | null;
          last_name?: string | null;
          full_name?: string | null;
          mobile_number?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      match_chunks: {
        Args: {
          query_embedding: string;
          query_text: string;
          match_count?: number;
          candidate_count?: number;
          rrf_k?: number;
        };
        Returns: {
          chunk_id: number;
          document_id: string;
          title: string;
          source: string | null;
          content: string;
          similarity: number;
          score: number;
        }[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

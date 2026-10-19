export type Visibility = "public" | "private";

export type Database = {
  public: {
    Tables: {
      documents: {
        Row: {
          id: string;
          title: string;
          source: string | null;
          visibility: Visibility;
          content_hash: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          source?: string | null;
          visibility?: Visibility;
          content_hash: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          source?: string | null;
          visibility?: Visibility;
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
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: { visibility: Visibility };
    CompositeTypes: Record<string, never>;
  };
};

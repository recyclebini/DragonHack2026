import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(url, key, {
  auth: {
    storage: typeof localStorage !== "undefined" ? localStorage : undefined,
    persistSession: true,
  },
});

export type Database = {
  voices: {
    id: string;
    user_id: string | null;
    name: string;
    hex: string;
    color_name: string;
    poem: string;
    created_at: string;
  };
};

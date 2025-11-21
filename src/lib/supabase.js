import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

export const api = {
  fetchLeads: async () => {
    const { data, error } = await supabase
      .from("leads")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data;
  },

  fetchLeadById: async (id) => {
    const { data } = await supabase.from("leads").select("*").eq("id", id).single();
    return data;
  },

  fetchActivities: async (lead_id) => {
    const { data } = await supabase
      .from("lead_activities")
      .select("*")
      .eq("lead_id", lead_id)
      .order("created_at", { ascending: false });
    return data;
  },

  fetchStatusHistory: async (lead_id) => {
    const { data } = await supabase
      .from("lead_status_history")
      .select("*")
      .eq("lead_id", lead_id)
      .order("changed_at", { ascending: false });
    return data;
  },
};

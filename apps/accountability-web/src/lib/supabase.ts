import { createClient } from "@supabase/supabase-js";

// Client-visible by design: the publishable key gates nothing sensitive and
// RLS protects the database. Auth only — all data flows through the platform API.
export const SUPABASE_URL = "https://hkxerogzvowkyvdifbpn.supabase.co";
const PUBLISHABLE_KEY = "sb_publishable_sbveeakVhnJ2gyOY2P9xNQ_qTMZ8J4y";

export const supabase = createClient(SUPABASE_URL, PUBLISHABLE_KEY);

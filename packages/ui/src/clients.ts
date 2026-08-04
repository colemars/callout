import { type ApiClient, createApiClient } from "@platform/api-client";
import { type SupabaseClient, createClient } from "@supabase/supabase-js";

// Platform-wide, client-visible endpoints. Products may override, but the
// defaults ARE the platform (Cole's UX rule: bake config in, prompt only for secrets).
const DEFAULT_SUPABASE_URL = "https://hkxerogzvowkyvdifbpn.supabase.co";
const DEFAULT_PUBLISHABLE_KEY = "sb_publishable_sbveeakVhnJ2gyOY2P9xNQ_qTMZ8J4y";
const DEFAULT_API_URL = "https://ohf5w7ank0.execute-api.us-west-2.amazonaws.com";

export interface ProductClients {
  supabase: SupabaseClient;
  api: ApiClient;
}

export function createProductClients(options?: {
  supabaseUrl?: string;
  publishableKey?: string;
  apiUrl?: string;
}): ProductClients {
  const supabase = createClient(
    options?.supabaseUrl ?? DEFAULT_SUPABASE_URL,
    options?.publishableKey ?? DEFAULT_PUBLISHABLE_KEY,
  );
  const api = createApiClient({
    baseUrl: options?.apiUrl ?? DEFAULT_API_URL,
    getToken: async () => (await supabase.auth.getSession()).data.session?.access_token ?? null,
  });
  return { supabase, api };
}

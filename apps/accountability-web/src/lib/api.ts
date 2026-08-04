import { createApiClient } from "@platform/api-client";
import { supabase } from "./supabase";

export const API_URL = "https://ohf5w7ank0.execute-api.us-west-2.amazonaws.com";

export const api = createApiClient({
  baseUrl: API_URL,
  getToken: async () => (await supabase.auth.getSession()).data.session?.access_token ?? null,
});

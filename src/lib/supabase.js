import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://nnvgdwccaqmqguxfmwpp.supabase.co";
const supabaseKey = "sb_publishable_uiIe-82_wJbq5B67K6DMxw_At-bVCUP";

export const supabase = createClient(supabaseUrl, supabaseKey);
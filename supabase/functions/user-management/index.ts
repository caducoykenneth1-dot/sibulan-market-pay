// File: supabase/functions/user-management/index.ts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// These headers will be sent with every response.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*', // For production, you should replace '*' with your specific domain, e.g., 'https://your-app.com'
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // A preflight request is sent by the browser before the actual request
  // to check if the server understands and allows the request method and headers.
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Create a Supabase client with the Auth context of the user making the request.
    const supabaseAdmin = createClient(
      // Supabase API URL - env var is automatically set by Supabase
      Deno.env.get('SUPABASE_URL') ?? '',
      // Supabase API ANON KEY - env var is automatically set by Supabase
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      // Create client with Auth context of the user that called the function.
      // This way your row-level-security (RLS) policies are applied.
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    )

    // Verify the user's role.
    const { data: { user } } = await supabaseAdmin.auth.getUser();
    if (!user || user.user_metadata?.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'User is not authorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Now, create a client with the service_role key to perform admin actions
    const supabaseService = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Handle different request methods
    if (req.method === 'GET') {
      // Your logic to get all users
      const { data: { users }, error } = await supabaseService.auth.admin.listUsers();
      if (error) throw error;
      return new Response(JSON.stringify({ users }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    } else if (req.method === 'POST') {
      // Your logic to create a user
      const { email, password, full_name, role } = await req.json();
      if (role === 'admin') {
        return new Response(JSON.stringify({ error: 'Cannot create admin users.' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      const { data, error } = await supabaseService.auth.admin.createUser({
        email,
        password,
        email_confirm: true, // Or false if you don't want to require email confirmation
        user_metadata: { full_name, role: 'collector' },
      });
      if (error) throw error;
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 201,
      });
    } else if (req.method === 'PATCH') {
        // Your logic to update a user role
        const { user_id, role } = await req.json();
        const { data: { user: targetUser }, error: getUserError } = await supabaseService.auth.admin.getUserById(user_id);
        if (getUserError) throw getUserError;

        if (targetUser.user_metadata?.role === 'admin') {
            return new Response(JSON.stringify({ error: 'Cannot modify admin users.' }), {
                status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }
        const { data, error } = await supabaseService.auth.admin.updateUserById(user_id, {
            user_metadata: { role },
        });
        if (error) throw error;
        return new Response(JSON.stringify(data), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        });
    } else if (req.method === 'DELETE') {
        // Your logic to delete a user
        const url = new URL(req.url);
        const userId = url.pathname.split('/').pop();
        if (!userId) {
            return new Response(JSON.stringify({ error: 'User ID is required' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }
        const { data: { user: targetUserToDelete }, error: getUserToDeleteError } = await supabaseService.auth.admin.getUserById(userId);
        if (getUserToDeleteError) throw getUserToDeleteError;

        if (targetUserToDelete.user_metadata?.role === 'admin') {
            return new Response(JSON.stringify({ error: 'Cannot delete admin users.' }), {
                status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }
        const { data, error } = await supabaseService.auth.admin.deleteUser(userId);
        if (error) throw error;
        return new Response(JSON.stringify(data), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        });
    }

    // Fallback for unsupported methods
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    // This will catch any other errors and ensure CORS headers are still sent.
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

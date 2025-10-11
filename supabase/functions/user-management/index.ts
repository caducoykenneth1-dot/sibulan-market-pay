// File: supabase/functions/user-management/index.ts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ✅ CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // ✅ Validate caller (must be logged-in admin)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: { headers: { Authorization: req.headers.get('Authorization')! } },
        auth: { autoRefreshToken: false, persistSession: false },
      }
    )

    const { data: { user } } = await supabaseAdmin.auth.getUser()
    if (!user || user.user_metadata?.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ✅ Admin client with service role
    const supabaseService = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // ✅ LIST USERS (HIDE ADMINS)
    if (req.method === 'GET') {
      const { data: { users }, error } = await supabaseService.auth.admin.listUsers()
      if (error) throw error

      // ✅ Filter out all admins
      const collectorsOnly = users.filter(u => {
        const role =
          u.user_metadata?.role ||
          u.raw_user_meta_data?.role ||
          'collector'
        return role !== 'admin'
      })

      return new Response(JSON.stringify({ users: collectorsOnly }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    // ✅ CREATE USER (Collector only)
    if (req.method === 'POST') {
      const { email, password, full_name, role } = await req.json()

      if (role === 'admin') {
        return new Response(JSON.stringify({ error: 'Cannot create admin users.' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const { data, error } = await supabaseService.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name, role: 'collector' },
      })
      if (error) throw error

      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 201,
      })
    }

    // ✅ UPDATE USER ROLE
    if (req.method === 'PATCH') {
      const { user_id, role } = await req.json()
      const { data: { user: target } } = await supabaseService.auth.admin.getUserById(user_id)

      if (target.user_metadata?.role === 'admin') {
        return new Response(JSON.stringify({ error: 'Cannot modify admin users.' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const { data, error } = await supabaseService.auth.admin.updateUserById(user_id, {
        user_metadata: { role },
      })
      if (error) throw error

      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    // ✅ DELETE USER
    if (req.method === 'DELETE') {
      const url = new URL(req.url)
      const userId = url.pathname.split('/').pop()

      const { data: { user: target } } = await supabaseService.auth.admin.getUserById(userId!)
      if (target.user_metadata?.role === 'admin') {
        return new Response(JSON.stringify({ error: 'Cannot delete admin users.' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      await supabaseService.auth.admin.deleteUser(userId!)
      return new Response(JSON.stringify({ message: 'User deleted' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

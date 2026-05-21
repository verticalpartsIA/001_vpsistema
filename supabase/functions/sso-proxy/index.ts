import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const APPS: Record<string, { url: string; serviceKeyEnv: string; redirectTo: string }> = {
  vprequisicoes: {
    url: 'https://vvgcrhtmzvssfdazkkzk.supabase.co',
    serviceKeyEnv: 'VPREQ_SERVICE_KEY',
    redirectTo: 'https://vprequisicoes.vpsistema.com',
  },
  posvenda360: {
    url: 'https://jkbklzlbhhfnamaeislb.supabase.co',
    serviceKeyEnv: 'PV360_SERVICE_KEY',
    redirectTo: 'https://posvenda360.vpsistema.com',
  },
  vpclick: {
    url: 'https://sfpnjwllcmentoocylow.supabase.co',
    serviceKeyEnv: 'VPCLICK_SERVICE_KEY',
    redirectTo: 'https://vpclick.vpsistema.com',
  },
  propostas: {
    url: 'https://wfwraicrwazjblyvtzfu.supabase.co',
    serviceKeyEnv: 'PROPOSTAS_SERVICE_KEY',
    redirectTo: 'https://propostas.vpsistema.com',
  },
  visitas: {
    url: 'https://bvvnoapdclxhuygptbza.supabase.co',
    serviceKeyEnv: 'VISITAS_SERVICE_KEY',
    redirectTo: 'https://visitas.vpsistema.com',
  },
  catraca: {
    url: 'https://ipqtbqstasirxlcoapns.supabase.co',
    serviceKeyEnv: 'CATRACA_SERVICE_KEY',
    redirectTo: 'https://catraca.vpsistema.com',
  },
  'cotacao-importacao': {
    url: 'https://jbwgjegelhoueygcvafq.supabase.co',
    serviceKeyEnv: 'COTACAO_SERVICE_KEY',
    redirectTo: 'https://cotacao-importacao.vpsistema.com',
  },
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return json({ error: 'Unauthorized' }, 401)
    }

    // Verify caller is authenticated in vpsistema
    const vpsistema = createClient(
      'https://ubdkoqxfwcraftesgmbw.supabase.co',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user }, error: authErr } = await vpsistema.auth.getUser()
    if (authErr || !user?.email) return json({ error: 'Invalid session' }, 401)

    const { targetApp } = await req.json()
    const app = APPS[targetApp]
    if (!app) return json({ error: 'Unknown app' }, 400)

    const serviceKey = Deno.env.get(app.serviceKeyEnv)
    if (!serviceKey) return json({ error: 'App not configured' }, 500)

    const admin = createClient(app.url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // Create user in target app if they don't exist
    const { data: existing } = await admin.auth.admin.listUsers({ perPage: 1000 })
    const exists = existing?.users?.some(u => u.email === user.email)
    if (!exists) {
      await admin.auth.admin.createUser({ email: user.email, email_confirm: true })
    }

    // Generate magic link → user is auto-logged in on the target app
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: user.email,
      options: { redirectTo: app.redirectTo },
    })

    if (linkErr || !linkData?.properties?.action_link) {
      console.error('generateLink error:', linkErr)
      return json({ error: 'Failed to generate SSO link' }, 500)
    }

    return json({ actionLink: linkData.properties.action_link })
  } catch (err) {
    console.error('sso-proxy error:', err)
    return json({ error: 'Internal error' }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

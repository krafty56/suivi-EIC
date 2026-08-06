// Lit une photo de selle de chien et en suggère le score fécal (échelle de
// Purina, 1 à 7) via Claude (vision). Ne touche jamais la base : renvoie une
// proposition que le propriétaire garde la main de corriger avant tout
// enregistrement — l'intensité reste éditable dans la feuille de saisie.
//
// Contrairement à extract-lab-values, aucune photo n'est lue depuis le
// stockage : l'image est envoyée directement en base64 dans la requête,
// avant même que la selle soit enregistrée (le propriétaire peut analyser
// puis renoncer sans laisser de fichier orphelin dans stool-photos).
//
// Secrets requis : ANTHROPIC_API_KEY. SUPABASE_URL et SUPABASE_ANON_KEY sont
// déjà fournis automatiquement. ANTHROPIC_LAB_MODEL est optionnel (modèle
// par défaut ci-dessous, partagé avec extract-lab-values).
//
// Appelée par l'app authentifiée : laisser « Verify JWT » activé sur cette
// fonction, à l'inverse de stripe-webhook.

import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!
const MODEL = Deno.env.get('ANTHROPIC_LAB_MODEL') ?? 'claude-sonnet-4-5-20250929'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const TOOL = {
  name: 'noter_selle',
  description: "Enregistre le score fécal (échelle de Purina, 1 à 7) lu sur la photo d'une selle de chien.",
  input_schema: {
    type: 'object',
    properties: {
      score: {
        type: ['integer', 'null'],
        description: '1 à 7 sur l’échelle de Purina, ou null si la photo ne permet pas de juger.',
      },
      confiance: { type: 'string', enum: ['haute', 'moyenne', 'faible'] },
      justification: { type: 'string', description: 'Une phrase courte expliquant le score, en français.' },
    },
    required: ['score', 'confiance', 'justification'],
  },
}

// Mêmes libellés que FECAL_SCORES côté app (data/catalogs.ts), pour que le
// score proposé par l'IA corresponde exactement à ce que l'utilisateur
// verrait en le choisissant lui-même.
const SYSTEM_PROMPT = `Tu notes une photo de selle de chien selon l'échelle de Purina (1 à 7), pour aider un propriétaire à suivre une entéropathie chronique.

Échelle :
1. Très dure et sèche, en petites boulettes, ne laisse aucune trace.
2. Ferme, bien formée, segmentée, ne laisse pas de trace au ramassage.
3. Bien formée mais plus humide, laisse une légère trace.
4. Très humide, encore formée mais molle, laisse une trace nette.
5. Très molle, perd sa forme, se dépose en tas.
6. Texture de purée, sans forme définie.
7. Liquide, aqueuse, aucune consistance.

Juge uniquement la consistance (forme, tenue, texture), jamais la couleur ni la présence de sang ou de mucus — ce sont d'autres champs de l'app, saisis séparément par le propriétaire.

confiance : "haute" si la photo est nette et sans ambiguïté, "moyenne" si l'angle, la lumière ou l'environnement (herbe, litière) compliquent le jugement, "faible" si tu hésites fortement entre deux scores adjacents.

Si la photo ne montre pas clairement une selle de chien (angle impossible, sujet flou, tout autre chose), renvoie score null et explique pourquoi dans justification plutôt que d'inventer un score.`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return new Response('Unauthorized', { status: 401, headers: CORS_HEADERS })

  const supabase = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData.user) {
    return new Response('Unauthorized', { status: 401, headers: CORS_HEADERS })
  }

  const { image, mediaType } = (await req.json()) as { image: string; mediaType: string | null }
  if (!image) return new Response('image est requis', { status: 400, headers: CORS_HEADERS })

  const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: image } },
            { type: 'text', text: 'Note cette photo de selle selon l’échelle de Purina.' },
          ],
        },
      ],
      tools: [TOOL],
      tool_choice: { type: 'tool', name: TOOL.name },
    }),
  })

  if (!aiRes.ok) {
    const detail = await aiRes.text()
    return new Response(`Échec de la lecture par l'IA : ${detail}`, { status: 502, headers: CORS_HEADERS })
  }

  const aiData = (await aiRes.json()) as {
    content: { type: string; input?: { score: number | null; confiance: string; justification: string } }[]
  }
  const toolUse = aiData.content.find((c) => c.type === 'tool_use')
  if (!toolUse?.input) {
    return new Response("Réponse inattendue de l'IA", { status: 502, headers: CORS_HEADERS })
  }

  return new Response(JSON.stringify(toolUse.input), {
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
})

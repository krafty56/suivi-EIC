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

// Libellés courts alignés sur FECAL_SCORES côté app (data/catalogs.ts), pour
// que le score proposé par l'IA corresponde à ce que l'utilisateur verrait
// en le choisissant lui-même — mais avec des critères visuels plus détaillés
// que ce libellé court, pour trancher entre scores adjacents (notamment 1 vs
// 2, confondus lors d'un premier test réel : un boudin segmenté mais encore
// souple et légèrement luisant est un 2, pas un 1).
const SYSTEM_PROMPT = `Tu notes une photo de selle de chien selon l'échelle de Purina (1 à 7), pour aider un propriétaire à suivre une entéropathie chronique.

Échelle, avec les critères qui distinguent chaque score de ses voisins :

1. Très dure et sèche. Boulettes individuelles et bien séparées les unes des autres (comme des crottes de lapin), surface mate et craquelée, cassante. Aucune trace, aucun brillant.
2. Ferme mais souple (pas cassante), pas sèche à l'œil. Un seul boudin continu mais visiblement segmenté (segments encore reliés entre eux, pas des boulettes séparées). La surface peut être légèrement luisante ou humide sans que ça change le score, tant que la forme reste nette et qu'aucune trace ne serait laissée au ramassage.
3. Bien formée, un seul boudin lisse (segmentation à peine visible ou absente), surface visiblement humide, laisserait une légère trace au ramassage.
4. Encore un boudin identifiable mais mou, s'affaisse sous son propre poids, surface très humide, laisserait une trace nette.
5. Perd sa forme de boudin, s'étale en tas ou en amas, aucune tenue.
6. Texture de purée ou de bouillie, aucune forme, ne se tient pas du tout.
7. Liquide, flaque, aucune texture solide.

La distinction 1 vs 2 est la plus souvent manquée : un boudin segmenté mais encore souple et d'un seul tenant est un 2 ; seules des boulettes vraiment séparées les unes des autres, sèches et cassantes, sont un 1.

Une même selle est souvent hétérogène : une base plus ferme et une partie plus molle posée dessus, un début bien formé qui se dégrade sur la longueur, etc. Regarde l'ensemble de la selle visible sur la photo, pas seulement le premier morceau net. Quand la consistance varie sur la même selle, penche vers la portion la moins formée plutôt que vers une moyenne ou la portion majoritaire, mais de façon mesurée : ne monte le score que d'un cran ou deux au-delà de ce que donnerait la portion la plus ferme, sauf si une partie clairement liquide ou totalement sans forme est visible sur une portion notable de la selle — dans ce cas seulement, va jusqu'au score que cette partie justifie réellement. Ne classe une portion comme « molle » que sur des signes visuels nets et sans ambiguïté (affaissement visible, absence de bord net, matière qui s'étale) — pas à partir d'une simple variation de brillance, de couleur ou d'ombre, qui ne change pas la consistance. Ignore tout ce qui n'est pas la matière fécale elle-même (feuilles, brindilles, terre, herbe, ombres du décor) : n'en tiens jamais compte pour juger la texture. Dans un cas hétérogène, la justification doit décrire les deux textures et dire explicitement pourquoi ce score précis a été retenu (ex. « base ferme et segmentée proche d'un 2, extrémité plus molle et moins nette : retenu 3 pour cette portion la moins formée »).

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

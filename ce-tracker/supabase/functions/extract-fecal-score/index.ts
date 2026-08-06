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

// score_ferme et score_mou plutôt qu'un score unique : demander à l'IA de
// combiner elle-même deux textures en un seul chiffre borné ("monte d'un
// cran ou deux, pas plus") s'est montré peu fiable en pratique (elle a
// justifié un bond de 2 à 5 sur une consigne censée le limiter à 3-4). La
// pondération entre les deux lectures est donc calculée ici, en code,
// jamais laissée à l'appréciation du modèle.
const TOOL = {
  name: 'noter_selle',
  description:
    "Enregistre la lecture du score fécal (échelle de Purina, 1 à 7) sur la photo d'une selle de chien, en distinguant la portion la plus ferme et la portion la moins formée si la selle n'est pas uniforme.",
  input_schema: {
    type: 'object',
    properties: {
      score_ferme: {
        type: ['integer', 'null'],
        description:
          'Score 1 à 7 de la portion la plus ferme et la mieux formée visible sur la photo (ou de la selle entière si elle est uniforme). Null si la photo ne permet pas de juger.',
      },
      score_mou: {
        type: ['integer', 'null'],
        description:
          "Score 1 à 7 de la portion la moins formée visible sur la photo, uniquement si la texture varie clairement d'un endroit à l'autre de la même selle. Laisse null si la selle est uniforme — ne force jamais une seconde lecture.",
      },
      confiance: { type: 'string', enum: ['haute', 'moyenne', 'faible'] },
      justification: {
        type: 'string',
        description:
          'Une phrase courte en français, décrivant ce qui a été observé (et les deux textures si score_mou est renseigné).',
      },
    },
    required: ['score_ferme', 'confiance', 'justification'],
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

D'abord, identifie clairement les limites de la selle elle-même sur la photo, avant de juger sa texture. Le décor autour (feuilles mortes, brindilles, terre, cailloux, herbe, ombres) peut avoir des couleurs et des reliefs proches de la matière fécale et te tromper — ne l'inclus jamais dans ton évaluation, même partiellement, et ne le confonds jamais avec une texture molle, étalée ou liquide. Si une zone de la photo est ambiguë (peut-être du décor, peut-être de la selle), traite-la comme du décor : ignore-la plutôt que de l'interpréter comme une partie molle.

La plupart des selles sont uniformes sur toute leur longueur : laisse score_mou à null par défaut. Ne le remplis que si tu observes, sur une portion clairement identifiée comme de la selle, un changement de texture net et sans ambiguïté (affaissement visible, perte de bord net, matière qui s'étale) — pas une simple variation de brillance, de couleur ou d'ombre, et pas une incertitude sur ce qui appartient au décor. Dans le doute, laisse score_mou à null plutôt que d'en inventer un.

Ignore tout ce qui n'est pas la matière fécale elle-même. Juge uniquement la consistance (forme, tenue, texture), jamais la couleur ni la présence de sang ou de mucus — ce sont d'autres champs de l'app, saisis séparément par le propriétaire.

confiance : "haute" si la selle se détache nettement du décor et que sa texture est sans ambiguïté, "moyenne" si l'angle, la lumière ou un décor chargé (feuilles, litière, terre) rendent la distinction selle/décor difficile, "faible" si tu hésites fortement entre deux scores adjacents ou si le décor pourrait avoir influencé ta lecture.

Si la photo ne montre pas clairement une selle de chien (angle impossible, sujet flou, tout autre chose), renvoie score_ferme null et explique pourquoi dans justification plutôt que d'inventer un score.`

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
    content: {
      type: string
      input?: {
        score_ferme: number | null
        score_mou: number | null
        confiance: string
        justification: string
      }
    }[]
  }
  const toolUse = aiData.content.find((c) => c.type === 'tool_use')
  if (!toolUse?.input) {
    return new Response("Réponse inattendue de l'IA", { status: 502, headers: CORS_HEADERS })
  }

  const { score_ferme, score_mou, confiance, justification } = toolUse.input

  // La portion molle ne tire le score final vers le haut que d'un cran au
  // maximum, et seulement si elle est réellement plus haute que la portion
  // ferme : c'est ce plafond, pas l'IA, qui évite un bond disproportionné
  // (2 → 5 constaté en pratique quand cette pondération lui était confiée).
  const score =
    score_ferme === null
      ? null
      : score_mou !== null && score_mou > score_ferme
        ? Math.min(score_mou, score_ferme + 1)
        : score_ferme

  return new Response(JSON.stringify({ score, confiance, justification }), {
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
})

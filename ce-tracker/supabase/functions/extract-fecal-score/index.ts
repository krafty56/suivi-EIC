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

// Deux régions décrites puis notées séparément, plutôt qu'un score unique
// ou une paire ferme/mou laissée au choix du modèle : en pratique, face à
// une selle hétérogène, le modèle a répété la même impression globale (celle
// de la portion la plus visible) dans les deux champs au lieu de vraiment
// regarder les deux zones — labelliser les champs "ferme"/"mou" lui permet
// de conclure avant d'avoir regardé. observation_bas/observation_haut
// forcent une description en mots de chaque zone AVANT tout chiffre, ce qui
// ancre l'attention sur des coordonnées spatiales plutôt que sur un jugement
// déjà fait. La pondération entre les deux lectures est calculée en code,
// jamais laissée à l'appréciation du modèle (un bond de 2 à 5 a déjà été
// observé quand cette pondération lui était confiée).
const TOOL = {
  name: 'noter_selle',
  description:
    "Enregistre la lecture du score fécal (échelle de Purina, 1 à 7) sur la photo d'une selle de chien, en décrivant séparément la partie basse et la partie haute de la selle visible.",
  input_schema: {
    type: 'object',
    properties: {
      observation_bas: {
        type: 'string',
        description:
          "Décris la texture de la partie basse (la plus proche du sol / la plus proche de l'appareil photo) de la selle visible sur la photo : forme, fermeté, segments, aspect de la surface. Ignore tout ce qui n'est pas la selle elle-même.",
      },
      score_bas: {
        type: ['integer', 'null'],
        description: 'Score 1 à 7 correspondant à observation_bas. Null seulement si cette partie est invisible ou illisible.',
      },
      observation_haut: {
        type: 'string',
        description:
          "Décris la texture de la partie haute / la plus éloignée de la selle visible sur la photo, même si elle te paraît a priori similaire à la partie basse. Ignore tout ce qui n'est pas la selle elle-même.",
      },
      score_haut: {
        type: ['integer', 'null'],
        description: 'Score 1 à 7 correspondant à observation_haut. Null seulement si cette partie est invisible, illisible, ou si la selle entière tient dans une seule zone sans partie haute distincte.',
      },
      confiance: { type: 'string', enum: ['haute', 'moyenne', 'faible'] },
      justification: {
        type: 'string',
        description: 'Une phrase courte en français résumant les deux observations.',
      },
    },
    required: ['observation_bas', 'score_bas', 'observation_haut', 'confiance', 'justification'],
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

Une selle est souvent plus longue que ce qu'une première impression globale capte, et sa texture peut varier sur sa longueur (base ferme, extrémité qui s'affaisse, ou l'inverse). Pour ne pas juger uniquement la zone la plus frappante au premier regard, décris et note la partie basse (observation_bas / score_bas) et la partie haute (observation_haut / score_haut) comme deux zones séparées de la photo, même si tu penses au premier abord qu'elles sont identiques — regarde chacune indépendamment avant de conclure. Si la selle entière tient dans une seule zone compacte sans partie haute distincte, dis-le dans observation_haut et laisse score_haut à null.

Ignore tout ce qui n'est pas la matière fécale elle-même. Juge uniquement la consistance (forme, tenue, texture), jamais la couleur ni la présence de sang ou de mucus — ce sont d'autres champs de l'app, saisis séparément par le propriétaire.

confiance : "haute" si la selle se détache nettement du décor et que sa texture est sans ambiguïté, "moyenne" si l'angle, la lumière ou un décor chargé (feuilles, litière, terre) rendent la distinction selle/décor difficile, "faible" si tu hésites fortement entre deux scores adjacents ou si le décor pourrait avoir influencé ta lecture.

Si la photo ne montre pas clairement une selle de chien (angle impossible, sujet flou, tout autre chose), renvoie score_bas null et explique pourquoi dans justification plutôt que d'inventer un score.`

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
        score_bas: number | null
        score_haut: number | null
        confiance: string
        justification: string
      }
    }[]
  }
  const toolUse = aiData.content.find((c) => c.type === 'tool_use')
  if (!toolUse?.input) {
    return new Response("Réponse inattendue de l'IA", { status: 502, headers: CORS_HEADERS })
  }

  const { score_bas, score_haut, confiance, justification } = toolUse.input

  // La zone la moins bonne ne tire le score final vers le haut que d'un
  // cran au maximum par rapport à la meilleure des deux : c'est ce plafond,
  // pas l'IA, qui évite un bond disproportionné (2 → 5 constaté en pratique
  // quand cette pondération lui était confiée).
  function combiner(a: number | null, b: number | null): number | null {
    if (a === null) return b
    if (b === null) return a
    const meilleur = Math.min(a, b)
    const pire = Math.max(a, b)
    return Math.min(pire, meilleur + 1)
  }

  const score = combiner(score_bas, score_haut)

  return new Response(JSON.stringify({ score, confiance, justification }), {
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
})

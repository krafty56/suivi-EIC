// Lit la photo d'une analyse de laboratoire vétérinaire et en extrait les
// paramètres (valeur, unité, intervalle de référence) via Claude (vision).
// Ne touche jamais la base : renvoie une proposition que l'utilisateur relit,
// corrige et confirme côté client avant tout enregistrement dans lab_values.
//
// Secrets requis : ANTHROPIC_API_KEY. SUPABASE_URL et SUPABASE_ANON_KEY sont
// déjà fournis automatiquement. ANTHROPIC_LAB_MODEL est optionnel (modèle par
// défaut ci-dessous).
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

const CATEGORIES = [
  'digestive',
  'hematology',
  'liver',
  'proteins',
  'kidney',
  'metabolic',
  'electrolytes',
  'endocrine',
  'inflammation',
  'other',
]

// Identifiants connus, pour que le même paramètre garde la même clé d'un
// import à l'autre : c'est ce qui permet de le suivre dans le temps (graphe,
// tendance). L'IA peut en inventer d'autres pour ce qu'elle ne reconnaît pas.
const PARAMETRES_CONNUS = `
- cpl : cPL, lipase pancréatique canine (digestive)
- tli : TLI, trypsine immunoréactive (digestive)
- folates : folates sériques (digestive)
- cobalamine : cobalamine / vitamine B12 (digestive)
- proteines_totales : protéines totales (proteins)
- albumine : albumine (proteins)
- globulines : globulines (proteins)
- ratio_ag : ratio albumine/globulines (proteins)
- alat : ALAT / ALT (liver)
- asat : ASAT / AST (liver)
- pal : phosphatases alcalines / PAL (liver)
- ggt : GGT (liver)
- bilirubine : bilirubine totale (liver)
- acides_biliaires : acides biliaires (liver)
- uree : urée (kidney)
- creatinine : créatinine (kidney)
- sdma : SDMA (kidney)
- hematocrite : hématocrite (hematology)
- hemoglobine : hémoglobine (hematology)
- leucocytes : leucocytes (hematology)
- neutrophiles : neutrophiles (hematology)
- lymphocytes : lymphocytes (hematology)
- plaquettes : plaquettes (hematology)
- sodium : sodium (electrolytes)
- potassium : potassium (electrolytes)
- chlore : chlore (electrolytes)
- calcium : calcium (electrolytes)
- phosphore : phosphore (electrolytes)
- glucose : glucose (metabolic)
- cholesterol : cholestérol (metabolic)
- triglycerides : triglycérides (metabolic)
- crp : protéine C-réactive / CRP (inflammation)
- t4 : T4 (endocrine)
`.trim()

const TOOL = {
  name: 'extraire_parametres',
  description: "Enregistre les paramètres lus sur la photo d'une analyse de laboratoire vétérinaire.",
  input_schema: {
    type: 'object',
    properties: {
      date_prelevement: {
        type: ['string', 'null'],
        description: 'Date du prélèvement au format YYYY-MM-DD si elle apparaît sur le document, sinon null.',
      },
      laboratoire: {
        type: ['string', 'null'],
        description: 'Nom du laboratoire si visible, sinon null.',
      },
      parametres: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            parameter_key: { type: 'string' },
            parameter_label: { type: 'string' },
            category: { type: ['string', 'null'], enum: [...CATEGORIES, null] },
            value: { type: ['number', 'null'] },
            value_text: { type: ['string', 'null'] },
            unit: { type: ['string', 'null'] },
            ref_low: { type: ['number', 'null'] },
            ref_high: { type: ['number', 'null'] },
          },
          required: ['parameter_key', 'parameter_label'],
        },
      },
    },
    required: ['parametres'],
  },
}

const SYSTEM_PROMPT = `Tu lis la photo d'une analyse de laboratoire vétérinaire (sang ou urine) pour un chien.

Extrait uniquement les paramètres mesurés, un par ligne du tableau de résultats — pas les titres de section, pas les logos, pas les informations du chien ou du vétérinaire.

Pour parameter_key : identifiant court, en minuscules, sans accents ni espaces. Réutilise ces identifiants connus quand le paramètre correspond :
${PARAMETRES_CONNUS}
Sinon, invente un identifiant court et cohérent sur le même modèle.

category : classe chaque paramètre parmi ${CATEGORIES.filter((c) => c !== 'other').join(', ')} ou other. Null si incertain.

value : la valeur numérique si le résultat en est un. value_text : le texte du résultat sinon (ex. "positif", "trace", "hémolysé"). Ne remplis jamais les deux à la fois.

ref_low / ref_high : bornes de l'intervalle de référence si indiquées sur le document, sinon null.

Si la photo est illisible ou ne contient pas d'analyse de laboratoire, renvoie une liste de paramètres vide plutôt que d'inventer des valeurs.`

type ExtractionResult = {
  date_prelevement: string | null
  laboratoire: string | null
  parametres: {
    parameter_key: string
    parameter_label: string
    category: string | null
    value: number | null
    value_text: string | null
    unit: string | null
    ref_low: number | null
    ref_high: number | null
  }[]
}

function calculerFlag(
  value: number | null,
  refLow: number | null,
  refHigh: number | null,
): 'low' | 'normal' | 'high' | null {
  if (value === null || refLow === null || refHigh === null) return null
  if (value < refLow) return 'low'
  if (value > refHigh) return 'high'
  return 'normal'
}

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

  const { dogId, storagePath } = (await req.json()) as { dogId: string; storagePath: string }
  if (!dogId || !storagePath) {
    return new Response('dogId et storagePath sont requis', { status: 400, headers: CORS_HEADERS })
  }

  // RLS scopée à l'appelant : ne renvoie ce chien que s'il lui appartient.
  const { data: dog } = await supabase.from('dogs').select('id').eq('id', dogId).maybeSingle()
  if (!dog) return new Response('Chien introuvable', { status: 404, headers: CORS_HEADERS })

  const photoUrl = `${SUPABASE_URL}/storage/v1/object/public/lab-reports/${storagePath}`
  const photoRes = await fetch(photoUrl)
  if (!photoRes.ok) {
    return new Response('Photo introuvable dans le stockage', { status: 404, headers: CORS_HEADERS })
  }
  const mediaType = photoRes.headers.get('content-type') || 'image/jpeg'
  const bytes = new Uint8Array(await photoRes.arrayBuffer())
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  const base64 = btoa(binary)

  const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
            { type: 'text', text: 'Extrait les paramètres de cette analyse de laboratoire vétérinaire.' },
          ],
        },
      ],
      tools: [TOOL],
      tool_choice: { type: 'tool', name: TOOL.name },
    }),
  })

  if (!aiRes.ok) {
    const detail = await aiRes.text()
    return new Response(`Échec de la lecture par l'IA : ${detail}`, {
      status: 502,
      headers: CORS_HEADERS,
    })
  }

  const aiData = (await aiRes.json()) as {
    content: { type: string; input?: ExtractionResult }[]
  }
  const toolUse = aiData.content.find((c) => c.type === 'tool_use')
  if (!toolUse?.input) {
    return new Response("Réponse inattendue de l'IA", { status: 502, headers: CORS_HEADERS })
  }

  const resultat = toolUse.input
  const parametres = resultat.parametres.map((p) => ({
    ...p,
    flag: calculerFlag(p.value, p.ref_low, p.ref_high),
  }))

  return new Response(
    JSON.stringify({
      date: resultat.date_prelevement,
      labName: resultat.laboratoire,
      parametres,
    }),
    { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
  )
})

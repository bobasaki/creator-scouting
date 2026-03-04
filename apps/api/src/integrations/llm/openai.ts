import {
  normalizeCountryCode,
  normalizeLanguageCode,
  normalizeLocaleConfidence,
  type LocaleConfidence
} from "../../domain/locale";

type EnrichmentResult = {
  estimated_category: string;
  estimated_type: string;
  niche_labels: string[];
  language_detected: string;
  language_code: string | null;
  language_confidence: LocaleConfidence | null;
  country_inferred: string | null;
  country_confidence: LocaleConfidence | null;
  fit_summary: string;
  brand_safety_notes: string;
  red_flags: string[];
};

const CATEGORY_OPTIONS = [
  "Abandoned Places",
  "Adventure",
  "Animals",
  "Animations",
  "Anime",
  "Art",
  "ASMR",
  "Astrology",
  "Aviation",
  "Books",
  "Budgeting",
  "Cars",
  "Chess",
  "Commentary",
  "Conspiracy",
  "Construction",
  "Cosplay",
  "Crimes",
  "Cybersecurity",
  "Cycling",
  "Dance",
  "DIY",
  "Documentary",
  "Editing",
  "Education",
  "Engineering",
  "Entertainment",
  "Environment",
  "Family",
  "Fashion",
  "Finance",
  "Fishing",
  "Fitness",
  "Food",
  "Football",
  "Gaming",
  "Guitars",
  "Health",
  "History",
  "Home Decor",
  "Home Renovation",
  "Humor",
  "Hunting",
  "Infotainment",
  "Interview",
  "Journalism",
  "Just Chatting",
  "Kids",
  "Lego",
  "Lifestyle",
  "Minecraft",
  "Motivation",
  "Movies",
  "Music",
  "Mystery",
  "News",
  "Outdoor",
  "Painting",
  "Parenting",
  "Pets",
  "Photography",
  "Plants",
  "Podcast",
  "Pokemon Cards",
  "Politics",
  "Pop Culture",
  "Reviews",
  "Science",
  "Society",
  "Sport",
  "TCG",
  "Tech",
  "Travel",
  "Variety",
  "Vlog",
  "Yoga"
] as const;

const CATEGORY_OPTION_SET = new Set<string>(CATEGORY_OPTIONS);

const TYPE_OPTIONS = [
  "Male",
  "Female",
  "Couple",
  "Family",
  "Team",
  "Animation",
  "Kids",
  "Faceless"
] as const;

const TYPE_OPTION_SET = new Set<string>(TYPE_OPTIONS);

export async function enrichChannel(args: {
  apiKey: string;
  model: string; // e.g. "gpt-5-nano"
  inputText: string;
}): Promise<EnrichmentResult> {
  const { apiKey, model, inputText } = args;

  const body = {
    model,
    // Responses API expects content parts like input_text / input_image etc.
    input: [
      {
        role: "system",
        content: [
          {
            type: "input_text",
            text:
              "You are enriching YouTube channels for influencer scouting. " +
              "Return ONLY a JSON object that matches the provided schema. " +
              "Choose exactly one best-fit primary category from the allowed category list. " +
              "If several categories could apply, choose the single strongest fit. " +
              "Use Variety only when no single category is clearly primary. " +
              "Also choose exactly one best-guess channel type from the allowed type list. " +
              "Infer the primary language code and inferred audience country when possible. " +
              "Return confidence for language and country using only low, medium, or high."
          }
        ]
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text:
              `${inputText}\n\n` +
              `Allowed categories:\n${CATEGORY_OPTIONS.map((item) => `- ${item}`).join("\n")}\n\n` +
              `Allowed types:\n${TYPE_OPTIONS.map((item) => `- ${item}`).join("\n")}`
          }
        ]
      }
    ],
    // Structured outputs (Responses API): name is REQUIRED
    text: {
      format: {
        type: "json_schema",
        name: "channel_enrichment",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            estimated_category: { type: "string", enum: [...CATEGORY_OPTIONS] },
            estimated_type: { type: "string", enum: [...TYPE_OPTIONS] },
            niche_labels: { type: "array", items: { type: "string" } },
            language_detected: { type: "string" },
            language_code: { type: "string" },
            language_confidence: { type: "string", enum: ["low", "medium", "high"] },
            country_inferred: { type: "string" },
            country_confidence: { type: "string", enum: ["low", "medium", "high"] },
            fit_summary: { type: "string" },
            brand_safety_notes: { type: "string" },
            red_flags: { type: "array", items: { type: "string" } }
          },
          required: [
            "estimated_category",
            "estimated_type",
            "niche_labels",
            "language_detected",
            "language_code",
            "language_confidence",
            "country_inferred",
            "country_confidence",
            "fit_summary",
            "brand_safety_notes",
            "red_flags"
          ]
        }
      }
    }
  };

  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const rawText = await res.text();
  let json: {
    output?: Array<{
      content?: Array<{
        type?: string;
        text?: string;
      }>;
    }>;
    output_text?: string;
    [key: string]: unknown;
  };
  try {
    json = rawText ? JSON.parse(rawText) : {};
  } catch {
    json = { raw: rawText };
  }

  if (!res.ok) {
    throw new Error(`OpenAI error ${res.status}: ${JSON.stringify(json, null, 2)}`);
  }

  // Responses output is typically in json.output[*].content[*] with type "output_text"
  const outputText =
    json?.output
      ?.flatMap((o: { content?: { type?: string; text?: string }[] }) => o?.content ?? [])
      ?.find((c: { type?: string; text?: string }) => c?.type === "output_text")
      ?.text ??
    json?.output_text ??
    "";

  // Must be strict JSON per schema; parse it.
  try {
    const parsed = JSON.parse(outputText);

    // Minimal runtime validation (avoid silent undefineds)
    return {
      estimated_category: CATEGORY_OPTION_SET.has(parsed.estimated_category)
        ? parsed.estimated_category
        : "Variety",
      estimated_type: TYPE_OPTION_SET.has(parsed.estimated_type)
        ? parsed.estimated_type
        : "Faceless",
      niche_labels: Array.isArray(parsed.niche_labels) ? parsed.niche_labels : [],
      language_detected: String(parsed.language_detected ?? "unknown"),
      language_code: normalizeLanguageCode(parsed.language_code),
      language_confidence: normalizeLocaleConfidence(parsed.language_confidence),
      country_inferred: normalizeCountryCode(parsed.country_inferred),
      country_confidence: normalizeLocaleConfidence(parsed.country_confidence),
      fit_summary: String(parsed.fit_summary ?? ""),
      brand_safety_notes: String(parsed.brand_safety_notes ?? ""),
      red_flags: Array.isArray(parsed.red_flags) ? parsed.red_flags : []
    };
  } catch {
    throw new Error(
      `OpenAI response was not valid JSON. outputText=${outputText.slice(0, 500)}`
    );
  }
}

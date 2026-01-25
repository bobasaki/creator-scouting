type EnrichmentResult = {
  niche_labels: string[];
  language_detected: string;
  fit_summary: string;
  brand_safety_notes: string;
  red_flags: string[];
};

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
              "Return ONLY a JSON object that matches the provided schema."
          }
        ]
      },
      {
        role: "user",
        content: [{ type: "input_text", text: inputText }]
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
            niche_labels: { type: "array", items: { type: "string" } },
            language_detected: { type: "string" },
            fit_summary: { type: "string" },
            brand_safety_notes: { type: "string" },
            red_flags: { type: "array", items: { type: "string" } }
          },
          required: [
            "niche_labels",
            "language_detected",
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
  let json: any;
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
      ?.flatMap((o: any) => o?.content ?? [])
      ?.find((c: any) => c?.type === "output_text")
      ?.text ??
    json?.output_text ??
    "";

  // Must be strict JSON per schema; parse it.
  try {
    const parsed = JSON.parse(outputText);

    // Minimal runtime validation (avoid silent undefineds)
    return {
      niche_labels: Array.isArray(parsed.niche_labels) ? parsed.niche_labels : [],
      language_detected: String(parsed.language_detected ?? "unknown"),
      fit_summary: String(parsed.fit_summary ?? ""),
      brand_safety_notes: String(parsed.brand_safety_notes ?? ""),
      red_flags: Array.isArray(parsed.red_flags) ? parsed.red_flags : []
    };
  } catch (e: any) {
    throw new Error(
      `OpenAI response was not valid JSON. outputText=${outputText.slice(0, 500)}`
    );
  }
}
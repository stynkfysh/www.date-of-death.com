// --- Rate limiter (per worker instance) ---
const rateLimitMap = new Map();
const RATE_LIMIT_MAX = 5;       // max lookups per window
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes

function isRateLimited(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  // Clean old entries periodically
  if (Math.random() < 0.01) {
    for (const [key, val] of rateLimitMap) {
      if (now - val.windowStart > RATE_LIMIT_WINDOW) rateLimitMap.delete(key);
    }
  }

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW) {
    rateLimitMap.set(ip, { windowStart: now, count: 1 });
    return false;
  }

  entry.count++;
  if (entry.count > RATE_LIMIT_MAX) return true;
  return false;
}

// --- Allowed origins ---
const ALLOWED_ORIGINS = [
  'https://date-of-death.com',
  'https://www.date-of-death.com',
];

function getCorsHeaders(requestOrigin) {
  const origin = ALLOWED_ORIGINS.includes(requestOrigin) ? requestOrigin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

export async function onRequestPost(context) {
  const requestOrigin = context.request.headers.get('Origin') || '';
  const corsHeaders = getCorsHeaders(requestOrigin);

  try {
    // --- Security Layer 1: Origin check ---
    if (!ALLOWED_ORIGINS.includes(requestOrigin)) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // --- Security Layer 2: Rate limiting by IP ---
    const clientIP = context.request.headers.get('CF-Connecting-IP') || 'unknown';
    if (isRateLimited(clientIP)) {
      return new Response(JSON.stringify({ error: 'Too many requests. Please try again later.' }), {
        status: 429,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Retry-After': '900',
        },
      });
    }

    const body = await context.request.json();

    // --- Security Layer 3: Honeypot ---
    if (body.website || body.company_url) {
      return new Response(JSON.stringify({
        isComplex: false,
        reason: 'Unable to determine.',
        propertyType: null,
        address: body.address || '',
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // --- Security Layer 4: Timestamp check (min 3 seconds on page) ---
    if (body._ts) {
      const elapsed = Date.now() - Number(body._ts);
      if (elapsed < 3000 || elapsed > 3600000) {
        return new Response(JSON.stringify({ error: 'Invalid request. Please reload and try again.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    } else {
      return new Response(JSON.stringify({ error: 'Invalid request format.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // --- Validate address ---
    const { address } = body;
    if (!address || typeof address !== 'string' || address.trim().length < 10 || address.trim().length > 200) {
      return new Response(JSON.stringify({ error: 'A valid property address is required.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const cleanAddress = address.trim();

    if (!/\d/.test(cleanAddress) || !/[a-zA-Z]/.test(cleanAddress)) {
      return new Response(JSON.stringify({ error: 'Please enter a valid street address.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const apiKey = context.env.GEMINI_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'Service not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ================================================================
    // Gemini Prompt — Complexity Triage
    // ================================================================
    const prompt = `Evaluate the following subject property address against recent market data (6-month look-back) to determine if the residential appraisal assignment is "NON-COMPLEX" or "COMPLEX."

SUBJECT PROPERTY ADDRESS: ${cleanAddress}

# Evaluation Criteria (The "Complexity Test")

For a property to be "SIMPLE," you must find at least 3 comparable sales that meet ALL of the following:
1. **Recency:** Sold within the last 6 months.
2. **Distance:** Located within 1 mile of the subject.
3. **GLA (Size):** Living area must be within ±20% of the subject's living area.
4. **Age:** Built within ±10 years of the subject's year built.

# Bracketing Requirements

Even if 3 sales are found, you must confirm the following bracketing exists within those 3+ sales:
- **Size Bracketing:** At least 1 sale with EQUAL living area, OR 1 sale that is LARGER and 1 sale that is SMALLER.
- **Age Bracketing:** At least 1 sale with the SAME year built, OR 1 sale that is NEWER and 1 sale that is OLDER.
- **Bedrooms:** At least 1 sale with the SAME number of bedrooms.
- **Bathrooms:** At least 1 sale with the SAME number of bathrooms, OR 1 sale with MORE and 1 sale with FEWER bathrooms.

# Response Format

Respond with ONLY a JSON code block in this exact format:

\`\`\`json
{
  "address": "the full address as identified",
  "propertyType": "SFR" or "Condo" or "Townhouse" or "Other",
  "isComplex": true or false,
  "subjectProfile": {
    "livingArea": number or null,
    "livingAreaRange": { "min": number, "max": number },
    "yearBuilt": number or null,
    "yearBuiltRange": { "min": number, "max": number },
    "bedrooms": number or null,
    "bathrooms": number or null
  },
  "comparableSales": [
    {
      "address": "string",
      "saleDate": "YYYY-MM-DD",
      "gla": number,
      "yearBuilt": number,
      "bedrooms": number,
      "bathrooms": number,
      "distance": "string (e.g. 0.4 mi)"
    }
  ],
  "bracketingCheck": {
    "size": { "met": true or false, "detail": "string" },
    "age": { "met": true or false, "detail": "string" },
    "bedrooms": { "met": true or false, "detail": "string" },
    "bathrooms": { "met": true or false, "detail": "string" }
  },
  "reason": "Brief explanation of why it passed or failed. If non-complex: 'All complexity criteria satisfied — 3+ comps found within tolerances with full bracketing.' If complex: explain which criterion or bracketing requirement failed."
}
\`\`\`

# Important Rules
- Do NOT fabricate comparable sales. If data is unavailable or unreliable, state "Data Unavailable" for that field and mark the criteria as failed.
- Always search first — never guess from training data alone.
- If you cannot find sufficient data, default to COMPLEX with reason explaining what was inconclusive.
- Return ONLY the JSON code block, nothing else.`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{
              text: 'You are the Real Estate Appraiser Assistant. Your specific purpose is to triage property addresses to determine if a residential appraisal assignment is "Non-Complex" or "Complex" based on a strict set of data constraints. Be professional, analytical, and concise. You MUST use Google Search to look up actual property data and recent comparable sales from public records, Zillow, Redfin, Realtor.com, county assessor sites, or any other reliable source. Never guess or use training data alone. Always search first for the subject property, then search for comparable sales nearby. Report only real data you found via search. If you cannot find sufficient data, default to complex. Return ONLY the JSON output — no prose, no explanation outside the JSON block.'
            }]
          },
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0,
          },
          tools: [{ google_search: {} }],
        }),
      }
    );

    if (!response.ok) {
      const err = await response.text();
      console.error('Gemini API error:', err);
      return new Response(JSON.stringify({ error: 'Property lookup failed' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const result = await response.json();

    // Gemini with tools returns multiple parts — find and combine text parts
    const parts = result.candidates?.[0]?.content?.parts || [];
    let fullText = '';
    for (const part of parts) {
      if (part.text) {
        fullText += part.text;
      }
    }
    fullText = fullText.trim();

    if (!fullText) {
      console.error('Empty Gemini response:', JSON.stringify(result));
      return new Response(JSON.stringify({ error: 'No data returned' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let propertyData;
    try {
      // Extract JSON from markdown code block or raw JSON
      const jsonMatch = fullText.match(/```json\s*([\s\S]*?)\s*```/);
      let jsonStr;
      if (jsonMatch) {
        jsonStr = jsonMatch[1];
      } else {
        const braceMatch = fullText.match(/\{[\s\S]*\}/);
        jsonStr = braceMatch ? braceMatch[0] : fullText;
      }
      propertyData = JSON.parse(jsonStr);
    } catch (e) {
      console.error('Failed to parse Gemini response:', fullText.substring(0, 500));
      // Default to complex if we can't parse
      propertyData = {
        address: cleanAddress,
        propertyType: null,
        isComplex: true,
        reason: 'Unable to verify property data. Please contact us for a manual review.',
      };
    }

    // Ensure required fields exist
    if (typeof propertyData.isComplex !== 'boolean') {
      propertyData.isComplex = true;
      propertyData.reason = propertyData.reason || 'Unable to determine complexity. Please contact us for a manual review.';
    }

    return new Response(JSON.stringify(propertyData), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('Function error:', err);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { ...getCorsHeaders(''), 'Content-Type': 'application/json' },
    });
  }
}

export async function onRequestOptions(context) {
  const requestOrigin = context.request.headers.get('Origin') || '';
  return new Response(null, {
    headers: getCorsHeaders(requestOrigin),
  });
}

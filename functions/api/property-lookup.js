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
    // Gemini Prompt — Complexity Check Only
    // ================================================================
    const prompt = `Determine whether the following residential property is Complex or Non-Complex based on specific paired sales criteria.

PROPERTY ADDRESS: ${cleanAddress}

WORKFLOW:

STEP 1 — IDENTIFY SUBJECT ATTRIBUTES
Search Zillow, Redfin, Realtor.com, or county assessor records to find:
- Property Type (SFR, Condo, Townhouse, Duplex, Triplex, Fourplex, Manufactured/Mobile, Commercial, Apartment, Vacant Land, Agricultural, etc.)
- Living Area (square feet)
- Year Built
- Site Size / Lot Size (square feet) — SFR only; skip for condos and townhouses
- Number of Bedrooms
- Number of Bathrooms

STEP 2 — FILTER PROPERTY TYPE (AUTOMATICALLY COMPLEX)
If the property is any of the following, classify immediately as COMPLEX and skip Steps 3–4:
- Small income property (2–4 units: duplex, triplex, fourplex)
- Commercial property
- Manufactured home or mobile home
- Apartment building (5+ units)
- Agricultural, industrial, mixed-use, vacant land, co-op
- ANY property type that is NOT single-family residence, condominium, or townhouse
- Any SFR with a site size >= 15,000 square feet

STEP 3 — SEARCH & COMPARE (only for SFR, Condo, or Townhouse with lot < 15,000 SF)
Search for at least 3 comparable sales of the same property type within 1 mile that closed in the last 6 months.

STEP 4 — VALIDATE BRACKETS
Check if the 3+ comps collectively satisfy ALL of these:

1. Living Area: Each comp within ±25% of subject. Must bracket (one larger, one smaller) or have one equal.
2. Site Size (SFR only): Each comp between 50% and 200% of subject lot. Must bracket or have one equal.
3. Age: Calculate the range:
   Age (A) = 2026 − Year Built
   Age Spread (S) = (0.1786 × A) + 8.214
   Range = Year Built ± S (rounded to nearest whole year)
   Each comp must fall within this range. Must bracket (one older, one newer) or have one equal.
4. Bedrooms: At least one comp must match the subject exactly.
5. Bathrooms: Must bracket (one with more, one with fewer) or have one equal.

If ANY bracket criterion is not met, or if fewer than 3 qualifying comps exist within 1 mile and 6 months, the property is COMPLEX.

STEP 5 — OUTPUT
Return ONLY a JSON code block with this exact format:

\`\`\`json
{
  "address": "the full address as identified",
  "propertyType": "SFR" or "Condo" or "Townhouse" or "Duplex" or "Manufactured" or "Commercial" or "Other",
  "isComplex": true or false,
  "reason": "One-sentence explanation. If non-complex: 'All paired sales criteria satisfied.' If complex: explain which criterion failed (e.g., 'Insufficient comparable sales to satisfy bathroom bracketing.' or 'Property type is duplex — automatically complex.' or 'SFR lot size is 18,500 SF (>= 15,000 SF) — automatically complex.')"
}
\`\`\`

IMPORTANT:
- Do NOT fabricate comparable sales. If data is unavailable or unreliable, default to COMPLEX with reason "Unable to verify sufficient comparable sales data."
- Always search first — never guess from training data alone.
- Return ONLY the JSON code block, nothing else.`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{
              text: 'You are a California real estate appraisal complexity analyst. You MUST use Google Search to look up actual property data and recent comparable sales from public records, Zillow, Redfin, Realtor.com, county assessor sites, or any other reliable source. Never guess or use training data alone. Always search first. Report only real data you found via search. If you cannot find sufficient data, default to complex. Return ONLY the JSON output — no prose, no explanation outside the JSON block.'
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

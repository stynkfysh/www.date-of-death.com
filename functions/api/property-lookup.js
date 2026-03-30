// --- Rate limiter (per worker instance) ---
const rateLimitMap = new Map();
const RATE_LIMIT_MAX = 5;       // max lookups per window
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes

function isRateLimited(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  // Clean old entries periodically (every 100 checks)
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
      // Bot filled the hidden field — silently return a fake success
      return new Response(JSON.stringify({
        sqft: null, lotSize: null, yearBuilt: null, bedrooms: null, bathrooms: null,
        propertyType: null, confidence: 'low',
        complexity: { isComplex: false, reason: 'Unable to determine', compsFound: 0 }
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // --- Security Layer 4: Timestamp check (min 3 seconds on page) ---
    if (body._ts) {
      const elapsed = Date.now() - Number(body._ts);
      if (elapsed < 3000 || elapsed > 3600000) {
        // Too fast (bot) or token older than 1 hour (replay)
        return new Response(JSON.stringify({ error: 'Invalid request. Please reload and try again.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    } else {
      // No timestamp — reject
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

    // Basic format check — should contain at least one digit and one letter
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

    const prompt = `Search for property details and perform a complexity analysis for: ${cleanAddress}

STEP 1: LOOK UP THE SUBJECT PROPERTY
Search Zillow, Redfin, Realtor.com, or county assessor records to find:
- Property type (single-family residence, condominium, townhouse, duplex, etc.)
- Living area (square feet)
- Year built
- Site size (lot size in square feet) — SFR only; skip for condos and townhouses
- Number of bedrooms
- Number of bathrooms

STEP 2: CHECK IF AUTOMATICALLY COMPLEX
The following are AUTOMATICALLY COMPLEX — skip paired sales analysis entirely:
- Small income property (2–4 units, duplex, triplex, fourplex)
- Commercial property
- Manufactured home or mobile home
- Apartment building (5+ units)
- Any property type that is NOT single-family residence, condominium, or townhouse (e.g., agricultural, industrial, mixed-use, vacant land, co-op)
- Any SFR with a site size of 15,000 square feet or greater

If automatically complex, return a JSON code block with the result immediately.

STEP 3: PAIRED SALES ANALYSIS (only for SFR, condo, or townhouse with lot < 15,000 SF)
Search for comparable sales within 1 mile of the subject that closed within the last 12 months. Same property type only (SFR comps for SFR subject, condo comps for condo subject, townhouse comps for townhouse subject).

You need at least 3 comps that COLLECTIVELY satisfy ALL of these brackets:

1. Living Area (±25%): Each comp must have living area within ±25% of the subject. Among the 3 comps, at least one must equal the subject's living area (within ±1-2%), OR there must be at least one larger AND at least one smaller.

2. Site Size (±100%) — SFR only, skip for condos/townhouses: Each comp must have site size between 50% and 200% of the subject's lot. Among the 3 comps, at least one must equal the subject's site size (within ±1-2%), OR there must be at least one larger AND at least one smaller.

3. Year Built: Calculate the range using this formula:
   Age (A) = 2026 − Year Built
   Age Spread (S) = (0.1786 × A) + 8.214
   Search Range = Year Built ± S (rounded to nearest whole year)
   Each comp must fall within this range. Among the 3 comps, at least one must have the same year built as the subject, OR there must be at least one older AND at least one newer.

4. Bedrooms: Among the 3 comps, at least one must have the same number of bedrooms as the subject.

5. Bathrooms: Among the 3 comps, at least one must have the same number of bathrooms as the subject, OR there must be at least one with fewer AND at least one with more bathrooms.

If you cannot find 3 qualifying comps within 1 mile, the property is COMPLEX.

STEP 4: RETURN RESULTS
After completing your analysis, provide the results as a JSON code block with this exact format:

\`\`\`json
{
  "sqft": number or null,
  "lotSize": number or null,
  "yearBuilt": number or null,
  "bedrooms": number or null,
  "bathrooms": number or null,
  "propertyType": "sfr" or "condo" or "townhouse" or "duplex" or "triplex" or "fourplex" or "manufactured" or "mobile" or "commercial" or "other" or null,
  "confidence": "high" or "medium" or "low",
  "complexity": {
    "isComplex": true or false,
    "reason": "string explaining why complex or non-complex",
    "autoComplex": true or false,
    "autoComplexReason": "string or null — only if auto-complex",
    "compsFound": number,
    "comps": [
      {
        "address": "string",
        "sqft": number,
        "lotSize": number or null,
        "yearBuilt": number,
        "bedrooms": number,
        "bathrooms": number,
        "saleDate": "YYYY-MM-DD",
        "salePrice": number
      }
    ],
    "bracketAnalysis": {
      "livingArea": { "met": true or false, "detail": "string" },
      "siteSize": { "met": true or false or "N/A", "detail": "string" },
      "yearBuilt": { "met": true or false, "detail": "string" },
      "bedrooms": { "met": true or false, "detail": "string" },
      "bathrooms": { "met": true or false, "detail": "string" }
    }
  }
}
\`\`\`

For confidence: use "high" if you found the exact property data from a reliable source, "medium" if data is from a less direct source, "low" if you could not find this specific property.

IMPORTANT: Do not fabricate comparable sales. If data is unavailable or unreliable, say so and default to complex. Always show real comps you actually found via search.`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{
              text: 'You are a California real estate appraisal complexity analyst. You MUST use Google Search to look up actual property data and recent comparable sales from public records, Zillow, Redfin, Realtor.com, county assessor sites, or any other reliable source. Never guess or use training data alone. Always search first for the subject property, then search for comparable sales nearby. Report only real data you found via search. If you cannot find sufficient data, default to complex.'
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

    // Gemini with tools returns multiple parts - find the text parts and combine them
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
        // Try to find raw JSON object
        const braceMatch = fullText.match(/\{[\s\S]*\}/);
        jsonStr = braceMatch ? braceMatch[0] : fullText;
      }
      propertyData = JSON.parse(jsonStr);
    } catch (e) {
      console.error('Failed to parse Gemini response:', fullText.substring(0, 500));
      return new Response(JSON.stringify({ error: 'Could not parse property data' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
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

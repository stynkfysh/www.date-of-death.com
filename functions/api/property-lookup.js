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

    // Parse address components for better search targeting
    const addressParts = cleanAddress.split(',').map(s => s.trim());
    const streetAddr = addressParts[0] || cleanAddress;
    const cityState = addressParts.slice(1).join(', ').trim() || 'California';

    const prompt = `I need you to look up a specific property and analyze it. The property is:

ADDRESS: ${cleanAddress}

YOUR FIRST AND MOST IMPORTANT TASK: Search for this property's details.

Try these searches IN ORDER until you find the property:
1. Search: "${streetAddr} ${cityState} zillow"
2. Search: "${streetAddr} ${cityState} redfin"
3. Search: "${streetAddr} ${cityState} realtor.com"
4. Search: "${streetAddr} ${cityState} county assessor property details"
5. Search: "${cleanAddress} property records bedrooms bathrooms square feet"

From the search results, find these details for the SUBJECT PROPERTY at ${cleanAddress}:
- Property type (single-family residence, condominium, townhouse, duplex, etc.)
- Living area in square feet
- Year built
- Lot size in square feet (SFR only; skip for condos/townhouses)
- Number of bedrooms
- Number of bathrooms

This is the most critical step. You MUST search for and find the actual property data before proceeding. Do not guess or estimate — use real data from your search results.

STEP 2: CHECK IF AUTOMATICALLY COMPLEX
After finding the property details, check if any of these apply:
- Small income property (2–4 units, duplex, triplex, fourplex)
- Commercial, manufactured, mobile home, apartment building (5+ units)
- Any type that is NOT single-family residence, condominium, or townhouse
- Any SFR with a lot size of 15,000 square feet or greater

If any apply, mark as complex and skip to the JSON output.

STEP 3: PAIRED SALES ANALYSIS (only for SFR, condo, or townhouse with lot < 15,000 SF)
Search for comparable sales within 1 mile that closed within the last 12 months. Same property type only.

You need at least 3 comps that COLLECTIVELY satisfy ALL of these brackets:

1. Living Area (±25%): Each comp within ±25% of subject. Among 3 comps, need at least one larger AND one smaller (or one equal within ±1-2%).

2. Site Size (±100%) — SFR only: Each comp between 50% and 200% of subject lot. Need at least one larger AND one smaller (or one equal within ±1-2%).

3. Year Built: Age (A) = 2026 − Year Built. Age Spread (S) = (0.1786 × A) + 8.214. Range = Year Built ± S (rounded). Each comp within range. Need one older AND one newer (or one equal).

4. Bedrooms: At least one comp with same bedroom count.

5. Bathrooms: At least one comp with same count, OR one with fewer AND one with more.

If you cannot find 3 qualifying comps within 1 mile, the property is COMPLEX.

STEP 4: RETURN JSON
Return ONLY a JSON code block with this format:

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

confidence: "high" = found exact property on Zillow/Redfin/assessor, "medium" = less direct source, "low" = could not find this specific property.

IMPORTANT: Do not fabricate data. If you cannot find the property or comps, say so and default to complex.`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{
              text: 'You are a California real estate property data researcher. Your PRIMARY job is to search Google for specific property details (square footage, bedrooms, bathrooms, year built, lot size, property type) using real estate websites like Zillow, Redfin, Realtor.com, and county assessor/tax records. You MUST use Google Search for EVERY property lookup — never guess or rely on training data. Search multiple times with different queries if the first search does not return the property page. When you find a property page on Zillow, Redfin, or a county assessor site, extract the exact property characteristics from that page. If you truly cannot find the property after multiple searches, set confidence to "low" and return nulls for the fields you could not find. After finding the subject property, search for nearby comparable sales. Report only real data from search results.'
            }]
          },
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
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

    // If all core property fields are null, mark confidence as low so the UI
    // tells the user to fill in details manually rather than showing empty fields
    if (!propertyData.sqft && !propertyData.yearBuilt && !propertyData.bedrooms && !propertyData.bathrooms) {
      propertyData.confidence = 'low';
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

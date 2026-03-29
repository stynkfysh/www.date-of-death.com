export async function onRequestPost(context) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  try {
    const { address } = await context.request.json();
    if (!address || address.trim().length < 5) {
      return new Response(JSON.stringify({ error: 'Address is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const apiKey = context.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'Service not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const prompt = `You are a California real estate data assistant. Given a residential property address, provide your best estimate of the property details based on public records and your knowledge.

Address: ${address}

Return ONLY a valid JSON object with these fields:
{
  "sqft": number or null (living area square footage),
  "lotSize": number or null (lot size in square feet),
  "yearBuilt": number or null (year the home was built),
  "bedrooms": number or null,
  "bathrooms": number or null (e.g. 2, 2.5),
  "propertyType": "sfr" or "condo" or "pud" or null,
  "confidence": "high" or "medium" or "low" (how confident you are in the data),
  "complexity": {
    "isComplex": boolean (true if this would be a complex appraisal),
    "reason": string or null (brief explanation if complex),
    "estimatedComps": "abundant" or "adequate" or "limited" or "very limited" (estimated availability of comparable sales within a reasonable radius),
    "factors": [string] (list of factors: e.g. "rural location", "luxury price range", "unique architecture", "large acreage", "waterfront", "mixed use", "very old construction")
  }
}

For the complexity assessment, consider:
- Location: rural or remote areas have fewer comps
- Value: homes over $2M in most markets, or over $5M in luxury markets, have fewer comps
- Size: homes over 4000 sqft or under 800 sqft have fewer comps
- Lot: lots over 1 acre in suburban areas or over 5 acres anywhere
- Age: pre-1900 construction can be harder to comp
- Type: unique architectural styles, mixed-use, or unusual property types
- Market: some California markets (e.g., dense urban areas) have abundant comps while rural mountain or desert areas may not

Return ONLY the JSON object, no other text.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Anthropic API error:', err);
      return new Response(JSON.stringify({ error: 'Property lookup failed' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const result = await response.json();
    const text = result.content[0].text.trim();

    let propertyData;
    try {
      const jsonStr = text.replace(/^```json\n?/, '').replace(/\n?```$/, '');
      propertyData = JSON.parse(jsonStr);
    } catch (e) {
      console.error('Failed to parse AI response:', text);
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
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

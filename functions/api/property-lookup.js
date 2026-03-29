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

    const apiKey = context.env.GEMINI_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'Service not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const prompt = `Search for property details for: ${address}

Look up this property on Zillow, Redfin, Realtor.com, or county assessor records. Find the actual square footage, lot size, year built, bedrooms, bathrooms, and property type from public records.

After searching, provide the results as a JSON code block with this exact format:
\`\`\`json
{
  "sqft": number or null,
  "lotSize": number or null,
  "yearBuilt": number or null,
  "bedrooms": number or null,
  "bathrooms": number or null,
  "propertyType": "sfr" or "condo" or "pud" or null,
  "confidence": "high" or "medium" or "low",
  "complexity": {
    "isComplex": false,
    "reason": null,
    "estimatedComps": "abundant" or "adequate" or "limited" or "very limited",
    "factors": []
  }
}
\`\`\`

For confidence: use "high" if you found the exact property data from a reliable source, "medium" if data is from a less direct source, "low" if you could not find this specific property.

For complexity, consider whether this would be a complex appraisal based on: rural location, luxury price range (over $2M), large size (over 4000 sqft), large lot (over 1 acre suburban, 5 acres rural), pre-1900 construction, unique architecture, or limited comparable sales availability.`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{
              text: 'You are a California real estate data assistant. You MUST use Google Search to look up actual property data from public records, Zillow, Redfin, county assessor sites, or any other reliable source. Never guess or use training data alone. Always search first, then report what you found.'
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

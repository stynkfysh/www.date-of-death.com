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

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildOrderEmail(data) {
  const tierLabels = {
    standard: 'Standard Desktop — $449',
    basic: 'Basic Desktop — $299',
  };
  const purposeLabels = {
    'step-up': 'Step-Up in Basis (Date of Death)',
    trust: 'Trust Valuation',
    'gift-tax': 'Gift Tax',
    'estate-tax': 'Estate Tax',
    other: 'Other',
  };
  const roleLabels = {
    heir: 'Heir / Beneficiary',
    trustee: 'Trustee',
    executor: 'Executor / Administrator',
    attorney: 'Attorney',
    cpa: 'CPA / Tax Professional',
    other: 'Other',
  };
  const conditionLabels = {
    excellent: 'Excellent — Fully updated',
    good: 'Good — Well maintained',
    average: 'Average — Normal wear',
    fair: 'Fair — Needs some work',
    poor: 'Poor — Significant deferred maintenance',
  };
  const propertyTypeLabels = {
    sfr: 'Single-Family Residence',
    condo: 'Condominium',
    pud: 'PUD',
  };

  const tier = tierLabels[data.tier] || data.tier || 'Not selected';
  const purpose = purposeLabels[data.purpose] || data.purpose || 'Not selected';
  const role = roleLabels[data.client_role] || data.client_role || 'Not specified';
  const condition = conditionLabels[data.condition] || data.condition || 'Not specified';
  const propertyType = propertyTypeLabels[data.property_type] || data.property_type || 'Not specified';

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
  <h2 style="color: #1a5276; border-bottom: 2px solid #1a5276; padding-bottom: 10px;">New Appraisal Order</h2>

  <h3 style="color: #555; margin-top: 24px;">Contact Information</h3>
  <table style="width: 100%; border-collapse: collapse;">
    <tr><td style="padding: 6px 12px; font-weight: 600; width: 140px;">Name</td><td style="padding: 6px 12px;">${escapeHtml(data.client_name)}</td></tr>
    <tr><td style="padding: 6px 12px; font-weight: 600;">Email</td><td style="padding: 6px 12px;"><a href="mailto:${escapeHtml(data.client_email)}">${escapeHtml(data.client_email)}</a></td></tr>
    <tr><td style="padding: 6px 12px; font-weight: 600;">Phone</td><td style="padding: 6px 12px;">${escapeHtml(data.client_phone) || '—'}</td></tr>
    <tr><td style="padding: 6px 12px; font-weight: 600;">Role</td><td style="padding: 6px 12px;">${escapeHtml(role)}</td></tr>
  </table>

  <h3 style="color: #555; margin-top: 24px;">Property Information</h3>
  <table style="width: 100%; border-collapse: collapse;">
    <tr><td style="padding: 6px 12px; font-weight: 600; width: 140px;">Address</td><td style="padding: 6px 12px;">${escapeHtml(data.property_address)}</td></tr>
    <tr><td style="padding: 6px 12px; font-weight: 600;">Type</td><td style="padding: 6px 12px;">${escapeHtml(propertyType)}</td></tr>
    <tr><td style="padding: 6px 12px; font-weight: 600;">Sq Ft</td><td style="padding: 6px 12px;">${escapeHtml(data.sqft) || '—'}</td></tr>
    <tr><td style="padding: 6px 12px; font-weight: 600;">Lot Size</td><td style="padding: 6px 12px;">${escapeHtml(data.lot_size) || '—'}</td></tr>
    <tr><td style="padding: 6px 12px; font-weight: 600;">Year Built</td><td style="padding: 6px 12px;">${escapeHtml(data.year_built) || '—'}</td></tr>
    <tr><td style="padding: 6px 12px; font-weight: 600;">Bedrooms</td><td style="padding: 6px 12px;">${escapeHtml(data.bedrooms) || '—'}</td></tr>
    <tr><td style="padding: 6px 12px; font-weight: 600;">Bathrooms</td><td style="padding: 6px 12px;">${escapeHtml(data.bathrooms) || '—'}</td></tr>
    <tr><td style="padding: 6px 12px; font-weight: 600;">Condition</td><td style="padding: 6px 12px;">${escapeHtml(condition)}</td></tr>
  </table>

  <h3 style="color: #555; margin-top: 24px;">Appraisal Details</h3>
  <table style="width: 100%; border-collapse: collapse;">
    <tr><td style="padding: 6px 12px; font-weight: 600; width: 140px;">Purpose</td><td style="padding: 6px 12px;">${escapeHtml(purpose)}</td></tr>
    ${data.purpose === 'other' && data.other_purpose ? `<tr><td style="padding: 6px 12px; font-weight: 600;">Other Purpose</td><td style="padding: 6px 12px;">${escapeHtml(data.other_purpose)}</td></tr>` : ''}
    <tr><td style="padding: 6px 12px; font-weight: 600;">Date of Death</td><td style="padding: 6px 12px;">${escapeHtml(data.date_of_death) || '—'}</td></tr>
    <tr><td style="padding: 6px 12px; font-weight: 600;">Tier</td><td style="padding: 6px 12px; font-weight: 700; color: #1a5276;">${escapeHtml(tier)}</td></tr>
    <tr><td style="padding: 6px 12px; font-weight: 600;">Notes</td><td style="padding: 6px 12px;">${escapeHtml(data.notes) || '—'}</td></tr>
  </table>

  <p style="margin-top: 30px; padding-top: 16px; border-top: 1px solid #ddd; font-size: 13px; color: #888;">
    Submitted from date-of-death.com order form — customer redirected to Square for payment.
  </p>
</body>
</html>`;
}

function buildContactEmail(data) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
  <h2 style="color: #b8860b; border-bottom: 2px solid #f0d060; padding-bottom: 10px;">Complex Property — Custom Quote Request</h2>

  <h3 style="color: #555; margin-top: 24px;">Contact Information</h3>
  <table style="width: 100%; border-collapse: collapse;">
    <tr><td style="padding: 6px 12px; font-weight: 600; width: 140px;">Name</td><td style="padding: 6px 12px;">${escapeHtml(data.contact_name)}</td></tr>
    <tr><td style="padding: 6px 12px; font-weight: 600;">Email</td><td style="padding: 6px 12px;"><a href="mailto:${escapeHtml(data.contact_email)}">${escapeHtml(data.contact_email)}</a></td></tr>
    <tr><td style="padding: 6px 12px; font-weight: 600;">Phone</td><td style="padding: 6px 12px;">${escapeHtml(data.contact_phone) || '—'}</td></tr>
  </table>

  <h3 style="color: #555; margin-top: 24px;">Property Information</h3>
  <table style="width: 100%; border-collapse: collapse;">
    <tr><td style="padding: 6px 12px; font-weight: 600; width: 140px;">Address</td><td style="padding: 6px 12px;">${escapeHtml(data.property_address)}</td></tr>
    <tr><td style="padding: 6px 12px; font-weight: 600;">Complexity</td><td style="padding: 6px 12px; color: #b8860b;">${escapeHtml(data.complexity_reason) || 'Identified as complex'}</td></tr>
    <tr><td style="padding: 6px 12px; font-weight: 600;">Sq Ft</td><td style="padding: 6px 12px;">${escapeHtml(data.sqft) || '—'}</td></tr>
    <tr><td style="padding: 6px 12px; font-weight: 600;">Lot Size</td><td style="padding: 6px 12px;">${escapeHtml(data.lot_size) || '—'}</td></tr>
    <tr><td style="padding: 6px 12px; font-weight: 600;">Year Built</td><td style="padding: 6px 12px;">${escapeHtml(data.year_built) || '—'}</td></tr>
    <tr><td style="padding: 6px 12px; font-weight: 600;">Bedrooms</td><td style="padding: 6px 12px;">${escapeHtml(data.bedrooms) || '—'}</td></tr>
    <tr><td style="padding: 6px 12px; font-weight: 600;">Bathrooms</td><td style="padding: 6px 12px;">${escapeHtml(data.bathrooms) || '—'}</td></tr>
    <tr><td style="padding: 6px 12px; font-weight: 600;">Notes</td><td style="padding: 6px 12px;">${escapeHtml(data.contact_notes) || '—'}</td></tr>
  </table>

  <p style="margin-top: 30px; padding-top: 16px; border-top: 1px solid #ddd; font-size: 13px; color: #888;">
    Submitted from date-of-death.com — complex property contact form
  </p>
</body>
</html>`;
}

function buildGeneralContactEmail(data) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
  <h2 style="color: #1a5276; border-bottom: 2px solid #1a5276; padding-bottom: 10px;">New Contact Form Inquiry</h2>

  <h3 style="color: #555; margin-top: 24px;">Contact Information</h3>
  <table style="width: 100%; border-collapse: collapse;">
    <tr><td style="padding: 6px 12px; font-weight: 600; width: 140px;">Name</td><td style="padding: 6px 12px;">${escapeHtml(data.contact_name)}</td></tr>
    <tr><td style="padding: 6px 12px; font-weight: 600;">Email</td><td style="padding: 6px 12px;"><a href="mailto:${escapeHtml(data.contact_email)}">${escapeHtml(data.contact_email)}</a></td></tr>
    <tr><td style="padding: 6px 12px; font-weight: 600;">Phone</td><td style="padding: 6px 12px;">${escapeHtml(data.contact_phone) || '—'}</td></tr>
    <tr><td style="padding: 6px 12px; font-weight: 600;">Texting OK</td><td style="padding: 6px 12px;">${data.texting_ok ? 'Yes' : 'No'}</td></tr>
  </table>

  <h3 style="color: #555; margin-top: 24px;">Appraisal Address</h3>
  <table style="width: 100%; border-collapse: collapse;">
    <tr><td style="padding: 6px 12px;">${escapeHtml(data.appraisal_address) || '—'}</td></tr>
  </table>

  <h3 style="color: #555; margin-top: 24px;">Question</h3>
  <div style="padding: 12px; background: #f9f9f9; border-radius: 6px; white-space: pre-wrap;">${escapeHtml(data.question) || '—'}</div>

  <p style="margin-top: 30px; padding-top: 16px; border-top: 1px solid #ddd; font-size: 13px; color: #888;">
    Submitted from date-of-death.com — general contact form
  </p>
</body>
</html>`;
}

function buildPhotoSubmissionEmail(data) {
  const photos = data.photos || [];
  const photoRows = photos.map(function(p) {
    const sizeMB = p.size ? (p.size / 1024 / 1024).toFixed(1) + ' MB' : '—';
    const cdnLink = p.cdnUrl ? `<a href="${escapeHtml(p.cdnUrl)}" style="color: #1a5276;">${escapeHtml(p.name || 'Photo')}</a>` : escapeHtml(p.name || 'Photo');
    return `<tr><td style="padding: 6px 12px;">${cdnLink}</td><td style="padding: 6px 12px; color: #888;">${sizeMB}</td></tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
  <h2 style="color: #27ae60; border-bottom: 2px solid #27ae60; padding-bottom: 10px;">Property Photos Submitted</h2>
  <h3 style="color: #555; margin-top: 24px;">Order Reference</h3>
  <table style="width: 100%; border-collapse: collapse;">
    <tr><td style="padding: 6px 12px; font-weight: 600; width: 140px;">Email</td><td style="padding: 6px 12px;"><a href="mailto:${escapeHtml(data.email)}">${escapeHtml(data.email)}</a></td></tr>
    <tr><td style="padding: 6px 12px; font-weight: 600;">Property</td><td style="padding: 6px 12px;">${escapeHtml(data.property_address)}</td></tr>
  </table>
  <h3 style="color: #555; margin-top: 24px;">Photos (${photos.length})</h3>
  <table style="width: 100%; border-collapse: collapse;">
    <tr><td style="padding: 6px 12px; font-weight: 600;">File</td><td style="padding: 6px 12px; font-weight: 600;">Size</td></tr>
    ${photoRows}
  </table>
  ${data.notes ? `<h3 style="color: #555; margin-top: 24px;">Notes</h3><div style="padding: 12px; background: #f9f9f9; border-radius: 6px; white-space: pre-wrap;">${escapeHtml(data.notes)}</div>` : ''}
  <p style="margin-top: 30px; padding-top: 16px; border-top: 1px solid #ddd; font-size: 13px; color: #888;">
    Submitted from date-of-death.com — photo upload form
  </p>
</body>
</html>`;
}

// --- Create Square payment link ---
async function createSquareCheckout(data, env) {
  const accessToken = env.SQUARE_ACCESS_TOKEN;
  const locationId = env.SQUARE_LOCATION_ID;

  if (!accessToken || !locationId) {
    throw new Error('Square not configured');
  }

  const priceMap = { standard: 44900, basic: 29900 }; // cents
  const nameMap = { standard: 'Standard Desktop Appraisal', basic: 'Basic Desktop Appraisal' };
  const amount = priceMap[data.tier];
  const itemName = nameMap[data.tier];

  if (!amount) throw new Error('Invalid tier');

  const idempotencyKey = crypto.randomUUID();

  const squareHeaders = {
    'Square-Version': '2024-12-18',
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };
  const requestBody = {
    idempotency_key: idempotencyKey,
    quick_pay: {
      name: `${itemName} — ${data.property_address}`,
      price_money: {
        amount: amount,
        currency: 'USD',
      },
      location_id: locationId,
    },
    checkout_options: {
      redirect_url: 'https://date-of-death.com/order/thank-you',
      ask_for_shipping_address: false,
    },
    pre_populated_data: {
      buyer_email: data.client_email || undefined,
      buyer_phone_number: data.client_phone || undefined,
    },
  };

  let resp = await fetch('https://connect.squareup.com/v2/online-checkout/payment-links', {
    method: 'POST',
    headers: squareHeaders,
    body: JSON.stringify(requestBody),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    if (errText.includes('pre_populated_data')) {
      delete requestBody.pre_populated_data;
      requestBody.idempotency_key = crypto.randomUUID();
      resp = await fetch('https://connect.squareup.com/v2/online-checkout/payment-links', {
        method: 'POST',
        headers: squareHeaders,
        body: JSON.stringify(requestBody),
      });
    }
    if (!resp.ok) {
      const retryErr = await resp.text();
      console.error('Square API error:', retryErr);
      throw new Error('Failed to create payment link');
    }
  }

  const result = await resp.json();
  return result.payment_link.url;
}

// --- Send email via Resend ---
async function sendEmail(to, subject, html, replyTo, env) {
  const resendKey = env.RESEND_API_KEY;
  if (!resendKey) throw new Error('Email service not configured');

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Date-of-Death Appraisals <orders@date-of-death.com>',
      to: [to],
      reply_to: replyTo,
      subject: subject,
      html: html,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    console.error('Resend API error:', errText);
    throw new Error('Failed to send email');
  }
}

export async function onRequestPost(context) {
  const requestOrigin = context.request.headers.get('Origin') || '';
  const corsHeaders = getCorsHeaders(requestOrigin);

  try {
    // Origin check
    if (!ALLOWED_ORIGINS.includes(requestOrigin)) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await context.request.json();
    const formType = body._formType; // 'order', 'contact', 'general-contact', or 'photo-submission'

    // Honeypot check
    if (body.website || body.company_url) {
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Timestamp check
    if (body._ts) {
      const elapsed = Date.now() - Number(body._ts);
      if (elapsed < 5000 || elapsed > 7200000) {
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

    if (formType === 'photo-submission') {
      if (!body.email || !body.property_address) {
        return new Response(JSON.stringify({ error: 'Email and property address are required.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const photoCount = body.photo_count || (body.photos ? body.photos.length : 0);
      const subject = `Photos Received (${photoCount}) — ${body.property_address}`;
      const html = buildPhotoSubmissionEmail(body);
      await sendEmail('orders@date-of-death.com', subject, html, body.email, context.env);
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } else if (formType === 'general-contact') {
      // --- GENERAL CONTACT PAGE: email only ---
      if (!body.contact_name || !body.contact_email) {
        return new Response(JSON.stringify({ error: 'Name and email are required.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const subject = `Contact Inquiry — ${body.contact_name}`;
      const html = buildGeneralContactEmail(body);

      await sendEmail('orders@date-of-death.com', subject, html, body.contact_email, context.env);

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } else if (formType === 'contact') {
      // --- COMPLEX: email only, no payment ---
      if (!body.contact_name || !body.contact_email || !body.property_address) {
        return new Response(JSON.stringify({ error: 'Name, email, and property address are required.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const subject = `Complex Quote Request — ${body.property_address}`;
      const html = buildContactEmail(body);

      await sendEmail('orders@date-of-death.com', subject, html, body.contact_email, context.env);

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } else {
      // --- STANDARD ORDER: email + Square payment link ---
      if (!body.client_name || !body.client_email || !body.property_address || !body.tier) {
        return new Response(JSON.stringify({ error: 'Required fields are missing.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Create Square payment link and send email in parallel
      const tierPrice = body.tier === 'standard' ? '$449' : body.tier === 'basic' ? '$299' : '';
      const subject = `New Order ${tierPrice} — ${body.property_address}`;
      const html = buildOrderEmail(body);

      const [checkoutUrl] = await Promise.all([
        createSquareCheckout(body, context.env),
        sendEmail('orders@date-of-death.com', subject, html, body.client_email, context.env),
      ]);

      return new Response(JSON.stringify({ success: true, checkoutUrl: checkoutUrl }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

  } catch (err) {
    console.error('Submit error:', err);
    return new Response(JSON.stringify({ error: 'Something went wrong. Please email us directly at orders@date-of-death.com.', debug: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

export async function onRequestOptions(context) {
  const requestOrigin = context.request.headers.get('Origin') || '';
  return new Response(null, {
    headers: getCorsHeaders(requestOrigin),
  });
}

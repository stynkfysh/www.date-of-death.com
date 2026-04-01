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
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// --- Base64url encoding for JWT ---
function b64url(input) {
  let str;
  if (typeof input === 'string') {
    str = btoa(input);
  } else {
    str = btoa(String.fromCharCode(...new Uint8Array(input)));
  }
  return str.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

// --- Get Google Drive access token via service account JWT ---
async function getAccessToken(env) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    sub: 'b@appraiser.llc',
    scope: 'https://www.googleapis.com/auth/drive',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };

  const headerB64 = b64url(JSON.stringify(header));
  const claimB64 = b64url(JSON.stringify(claim));
  const signInput = headerB64 + '.' + claimB64;

  // Import RSA private key from PEM
  const pem = env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n');
  const pemBody = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/[\r\n\s]/g, '');
  const keyBytes = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    keyBytes.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(signInput)
  );
  const jwt = signInput + '.' + b64url(sig);

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error('Google auth failed: ' + errText);
  }

  const data = await resp.json();
  return data.access_token;
}

// --- Find or create a subfolder in Google Drive ---
async function findOrCreateFolder(accessToken, parentId, folderName) {
  const q = encodeURIComponent(
    `name='${folderName.replace(/'/g, "\\'")}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
  );
  const searchResp = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const searchData = await searchResp.json();

  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0].id;
  }

  const createResp = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    }),
  });

  if (!createResp.ok) {
    const errText = await createResp.text();
    throw new Error('Failed to create Drive folder: ' + errText);
  }

  const createData = await createResp.json();
  return createData.id;
}

// --- Upload a single file to Google Drive ---
async function uploadFileToDrive(accessToken, folderId, fileName, fileBuffer, mimeType) {
  const metadata = JSON.stringify({ name: fileName, parents: [folderId] });
  const boundary = '----UploadBoundary' + Date.now();

  const enc = new TextEncoder();
  const metaHeader = enc.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`);
  const metaBody = enc.encode(metadata);
  const fileHeader = enc.encode(`\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`);
  const fileBody = new Uint8Array(fileBuffer);
  const closing = enc.encode(`\r\n--${boundary}--`);

  const totalLen = metaHeader.length + metaBody.length + fileHeader.length + fileBody.length + closing.length;
  const body = new Uint8Array(totalLen);
  let offset = 0;
  for (const part of [metaHeader, metaBody, fileHeader, fileBody, closing]) {
    body.set(part, offset);
    offset += part.length;
  }

  const resp = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: body,
    }
  );

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error('Drive upload failed: ' + errText);
  }

  return await resp.json();
}

// --- Send notification email via Resend ---
async function sendNotificationEmail(env, clientEmail, propertyAddress, photoCount, notes, folderUrl) {
  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
  <h2 style="color: #27ae60; border-bottom: 2px solid #27ae60; padding-bottom: 10px;">Property Photos Submitted</h2>
  <table style="width: 100%; border-collapse: collapse; margin-top: 16px;">
    <tr><td style="padding: 8px 12px; font-weight: 600; width: 140px;">Client Email</td><td style="padding: 8px 12px;"><a href="mailto:${escapeHtml(clientEmail)}">${escapeHtml(clientEmail)}</a></td></tr>
    <tr><td style="padding: 8px 12px; font-weight: 600;">Property</td><td style="padding: 8px 12px;">${escapeHtml(propertyAddress)}</td></tr>
    <tr><td style="padding: 8px 12px; font-weight: 600;">Photos</td><td style="padding: 8px 12px;">${photoCount} file${photoCount !== 1 ? 's' : ''}</td></tr>
    <tr><td style="padding: 8px 12px; font-weight: 600;">Drive Folder</td><td style="padding: 8px 12px;"><a href="${escapeHtml(folderUrl)}" style="color: #1a5276;">Open in Google Drive</a></td></tr>
  </table>
  ${notes ? `<h3 style="color: #555; margin-top: 24px;">Notes</h3><div style="padding: 12px; background: #f9f9f9; border-radius: 6px; white-space: pre-wrap;">${escapeHtml(notes)}</div>` : ''}
  <p style="margin-top: 30px; padding-top: 16px; border-top: 1px solid #ddd; font-size: 13px; color: #888;">
    Submitted from date-of-death.com — photo upload form
  </p>
</body>
</html>`;

  const subject = `Photos Received (${photoCount}) — ${propertyAddress}`;

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Date-of-Death Appraisals <orders@date-of-death.com>',
      to: ['orders@date-of-death.com'],
      reply_to: clientEmail,
      subject: subject,
      html: html,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    console.error('Resend API error:', errText);
    // Don't throw — photos are already uploaded, email failure shouldn't block success
  }
}

// --- Main handler ---
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

    const formData = await context.request.formData();
    const file = formData.get('file');
    const email = formData.get('email');
    const propertyAddress = formData.get('property_address');
    let folderId = formData.get('folder_id') || '';
    const isLast = formData.get('is_last') === 'true';
    const notes = formData.get('notes') || '';
    const totalCount = parseInt(formData.get('total_count') || '0', 10);

    if (!file || !email || !propertyAddress) {
      return new Response(JSON.stringify({ error: 'Missing required fields (file, email, property_address).' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Authenticate with Google Drive
    const accessToken = await getAccessToken(context.env);

    // Find or create address subfolder under _Client Photos
    if (!folderId) {
      folderId = await findOrCreateFolder(
        accessToken,
        context.env.GOOGLE_DRIVE_PHOTOS_FOLDER_ID,
        propertyAddress
      );
    }

    // Upload file to Drive
    const fileBuffer = await file.arrayBuffer();
    const uploadResult = await uploadFileToDrive(
      accessToken,
      folderId,
      file.name,
      fileBuffer,
      file.type || 'image/jpeg'
    );

    // Send notification email on last file
    if (isLast) {
      const folderUrl = `https://drive.google.com/drive/folders/${folderId}`;
      await sendNotificationEmail(context.env, email, propertyAddress, totalCount, notes, folderUrl);
    }

    const folderUrl = `https://drive.google.com/drive/folders/${folderId}`;
    return new Response(JSON.stringify({ success: true, folderId, folderUrl, fileId: uploadResult.id }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Upload error:', err);
    return new Response(
      JSON.stringify({ error: 'Upload failed. Please try again or email photos to orders@date-of-death.com.', debug: err.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
}

export async function onRequestOptions(context) {
  const requestOrigin = context.request.headers.get('Origin') || '';
  return new Response(null, { headers: getCorsHeaders(requestOrigin) });
}

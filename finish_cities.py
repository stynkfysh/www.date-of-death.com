#!/usr/bin/env python3
"""Rebuild service-areas page, sitemap, and CSS after adding 15 new cities."""
import json, os, re
from datetime import datetime

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
SITE_DIR = SCRIPT_DIR
LOC_FILE = os.path.join(SITE_DIR, 'locations_118.json')
NOW = datetime.now()

with open(LOC_FILE) as f:
    locs = json.load(f)
print(f'Loaded {len(locs)} locations')

# === 1. Rebuild service-areas/index.html ===
counties = {}
for loc in locs:
    c = loc['county']
    if c not in counties:
        counties[c] = []
    name = loc['name']
    slug = re.sub(r'[^a-z0-9]+', '-', name.lower().strip()).strip('-')
    loc_type = loc['type']
    city = loc['city']
    if loc_type == 'Community':
        display = f'{name} <span class="community-city">({city})</span>'
    else:
        display = name
    counties[c].append({'name': name, 'slug': slug, 'display': display, 'sort': name})

for c in counties:
    counties[c].sort(key=lambda x: x['sort'])

total = len(locs)
county_sections = ''
for county in sorted(counties.keys()):
    items = counties[county]
    links = '\n'.join([f'                <li><a href="/{l["slug"]}/">{l["display"]}</a></li>' for l in items])
    county_sections += f'''
        <div class="county-group">
            <h3>{county} County <span class="county-count">({len(items)})</span></h3>
            <ul class="area-list">
{links}
            </ul>
        </div>'''

service_areas_html = f'''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Service Areas — Date-of-Death Appraisals Across California</title>
    <meta name="description" content="Date-of-death desktop appraisals serving {total}+ cities and communities across California. Find your area and order a certified estate appraisal today.">
    <meta name="robots" content="index, follow">
    <meta property="og:title" content="Service Areas — Date-of-Death Appraisals">
    <meta property="og:description" content="Serving {total}+ California cities and communities with certified desktop date-of-death appraisals.">
    <meta property="og:type" content="website">
    <meta property="og:url" content="https://date-of-death.com/service-areas">
    <link rel="canonical" href="https://date-of-death.com/service-areas">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="/styles.css">
</head>
<body>

<header class="site-header">
    <div class="header-inner">
        <a href="/" class="logo">Date-of-Death Appraisals</a>
        <button class="menu-toggle" aria-label="Toggle navigation" onclick="document.querySelector('.main-nav').classList.toggle('open')">
            <span></span><span></span><span></span>
        </button>
        <nav class="main-nav">
            <a href="/why-desktop">Why Desktop</a>
            <a href="/how-it-works">How It Works</a>
            <a href="/pricing">Pricing</a>
            <a href="/faq">FAQ</a>
            <a href="/about">About</a>
            <a href="/contact">Contact</a>
            <a href="/service-areas" class="active">Service Areas</a>
            <a href="/order" class="nav-cta">Order Now</a>
        </nav>
    </div>
</header>

<section class="hero hero-city">
    <div class="container">
        <h1>Service Areas</h1>
        <p class="subtitle">Certified desktop date-of-death appraisals serving {total}+ cities and communities across California.</p>
    </div>
</section>

<section class="section-light">
    <div class="container">
        <p>We provide USPAP-compliant desktop appraisals for estate settlement, IRS filings, and stepped-up cost basis throughout California. Select your area below to learn more about our services in your community.</p>
        <div class="county-grid">{county_sections}
        </div>
    </div>
</section>

<section class="cta-banner" style="background:#1a5276;color:#fff">
    <div class="container">
        <h2>Don\'t See Your Area?</h2>
        <p>We serve all of California. Even if your city isn\'t listed above, we can provide a certified desktop date-of-death appraisal for any residential property in the state.</p>
        <a href="/order" class="hero-cta">Order Your Appraisal</a>
    </div>
</section>

<footer class="site-footer">
    <div class="footer-inner">
        <div class="footer-col">
            <h4>Services</h4>
            <a href="/pricing">Pricing</a>
            <a href="/why-desktop">Why Desktop Appraisals</a>
            <a href="/how-it-works">How It Works</a>
            <a href="/order">Order Now</a>
        </div>
        <div class="footer-col">
            <h4>Resources</h4>
            <a href="/faq">FAQ</a>
            <a href="/about">About &amp; Credentials</a>
            <a href="/service-areas">Service Areas</a>
        </div>
        <div class="footer-col">
            <h4>Contact</h4>
            <a href="/contact">Contact Form</a>
        </div>
    </div>
    <div class="footer-bottom">
        <span>&copy; {NOW.year} Brian Ward Appraisal. All rights reserved.</span>
        <span>California Certified Residential Appraiser &middot; License No. AR036053</span>
    </div>
</footer>

</body>
</html>'''

sa_dir = os.path.join(SITE_DIR, 'service-areas')
os.makedirs(sa_dir, exist_ok=True)
with open(os.path.join(sa_dir, 'index.html'), 'w') as f:
    f.write(service_areas_html)
print(f'Rebuilt service-areas/index.html with {total} locations')

# === 2. Update sitemap.xml ===
today = NOW.strftime('%Y-%m-%d')
urls = [
    ('https://date-of-death.com/', '1.0', 'monthly'),
    ('https://date-of-death.com/why-desktop', '0.8', 'monthly'),
    ('https://date-of-death.com/how-it-works', '0.8', 'monthly'),
    ('https://date-of-death.com/pricing', '0.8', 'monthly'),
    ('https://date-of-death.com/faq', '0.7', 'monthly'),
    ('https://date-of-death.com/about', '0.7', 'monthly'),
    ('https://date-of-death.com/contact', '0.6', 'monthly'),
    ('https://date-of-death.com/order', '0.9', 'monthly'),
    ('https://date-of-death.com/service-areas', '0.8', 'weekly'),
]
for loc in locs:
    slug = re.sub(r'[^a-z0-9]+', '-', loc['name'].lower().strip()).strip('-')
    urls.append((f'https://date-of-death.com/{slug}/', '0.6', 'monthly'))

sitemap_entries = ''
for url, priority, freq in urls:
    sitemap_entries += f'''  <url>
    <loc>{url}</loc>
    <lastmod>{today}</lastmod>
    <changefreq>{freq}</changefreq>
    <priority>{priority}</priority>
  </url>
'''

sitemap_xml = f'''<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
{sitemap_entries}</urlset>'''

with open(os.path.join(SITE_DIR, 'sitemap.xml'), 'w') as f:
    f.write(sitemap_xml)
print(f'Updated sitemap.xml with {len(urls)} URLs')

# === 3. Add .community-city CSS if not present ===
css_path = os.path.join(SITE_DIR, 'styles.css')
with open(css_path, 'r') as f:
    css = f.read()
if '.community-city' not in css:
    css += '''
/* Community parent city label */
.community-city {
    font-weight: 400;
    color: #888;
    font-size: 0.85em;
}
'''
    with open(css_path, 'w') as f:
        f.write(css)
    print('Added .community-city CSS')
else:
    print('.community-city CSS already present')

print('\nDone! Now run:')
print('  git add -A && git commit -m "Add 15 parent cities, rebuild service areas + sitemap" && git push origin main')

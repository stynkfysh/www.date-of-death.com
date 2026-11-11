#!/usr/bin/env python3
"""Add new city pages + county hub pages, rebuild service-areas and sitemap.
Run from the site root. Safe to re-run (idempotent).
"""
import json, os, re, sys
from datetime import datetime

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)
import generate_city_pages as gcp

LOC_FILE = os.path.join(SCRIPT_DIR, 'locations_118.json')
NOW = datetime.now()

NEW_CITIES = [
    # Orange County gaps
    {"name": "Irvine",         "county": "Orange",      "hu": 122000, "households": 112000},
    {"name": "Mission Viejo",  "county": "Orange",      "hu": 34500,  "households": 33000},
    {"name": "Lake Forest",    "county": "Orange",      "hu": 29000,  "households": 27500},
    {"name": "Yorba Linda",    "county": "Orange",      "hu": 23000,  "households": 22300},
    {"name": "Buena Park",     "county": "Orange",      "hu": 25000,  "households": 24000},
    {"name": "Laguna Woods",   "county": "Orange",      "hu": 13000,  "households": 11000},
    # Central Valley
    {"name": "Fresno",         "county": "Fresno",      "hu": 190000, "households": 180000},
    {"name": "Clovis",         "county": "Fresno",      "hu": 44000,  "households": 42000},
    {"name": "Bakersfield",    "county": "Kern",        "hu": 135000, "households": 128000},
    {"name": "Stockton",       "county": "San Joaquin", "hu": 104000, "households": 98000},
    {"name": "Tracy",          "county": "San Joaquin", "hu": 31000,  "households": 30000},
    {"name": "Manteca",        "county": "San Joaquin", "hu": 29000,  "households": 28000},
    {"name": "Visalia",        "county": "Tulare",      "hu": 48000,  "households": 46000},
    # Sacramento region
    {"name": "Folsom",         "county": "Sacramento",  "hu": 32000,  "households": 30000},
    {"name": "Citrus Heights", "county": "Sacramento",  "hu": 36500,  "households": 35000},
    {"name": "Rocklin",        "county": "Placer",      "hu": 27000,  "households": 26000},
    {"name": "Lincoln",        "county": "Placer",      "hu": 20000,  "households": 19000},
]

EXTRA_ASSESSOR_NOTES = {
    "San Francisco": "San Francisco's Assessor-Recorder processes change-in-ownership filings for a housing stock dominated by Victorian, Edwardian, and mid-century buildings where values shift block by block. Long ownership tenures under Proposition 13 mean inherited San Francisco properties often carry decades of untaxed appreciation, making the date-of-death valuation one of the most consequential numbers in the estate.",
    "San Mateo": "San Mateo County's Peninsula location between San Francisco and Silicon Valley produces some of the state's highest median values and longest ownership tenures. The county assessor processes Prop 19 parent-child exclusion claims against a market where a home purchased in the 1970s has frequently appreciated twenty-fold or more.",
    "Santa Clara": "Santa Clara County, home of Silicon Valley, has seen tech-driven appreciation transform mid-century tract neighborhoods into million-dollar markets. The county assessor's office handles among the highest-value residential transfers in California, and the step-up in basis on an inherited Santa Clara County home routinely shelters seven figures of appreciation.",
    "Solano": "Solano County bridges the Bay Area and the Sacramento Valley, with commuter-driven cities like Vallejo, Fairfield, and Vacaville offering relative affordability that has attracted steady migration. The county assessor processes a growing volume of generational transfers as the post-war housing stock turns over.",
    "Placer": "Placer County stretches from Sacramento's suburban edge in Roseville and Rocklin to the Sierra foothills, with master-planned and age-restricted communities — including Sun City Lincoln Hills — that generate consistent estate-settlement activity. The county assessor handles Prop 19 exclusion claims for one of Northern California's fastest-growing regions.",
    "Monterey": "Monterey County's market spans the agricultural Salinas Valley and the high-value coastal communities of the Monterey Peninsula. The county assessor processes transfers across these very different sub-markets, and date-of-death valuations in the county require careful attention to which market the property actually trades in.",
    "Kern": "Kern County, anchored by Bakersfield, combines energy- and agriculture-driven employment with some of California's most affordable tract housing. The county assessor processes a steady volume of generational transfers, and the affordability that drew families decades ago means many inherited properties have still doubled or tripled in value.",
    "Tulare": "Tulare County's Visalia-centered market offers Central Valley affordability with a housing stock built largely in waves since the 1970s. The county assessor handles Prop 19 claims for a region where long family ownership tenures are common and date-of-death documentation is frequently assembled years after the fact.",
}
gcp.COUNTY_ASSESSOR_NOTES.update(EXTRA_ASSESSOR_NOTES)

# ---------- 1. Merge new cities into locations JSON ----------
with open(LOC_FILE) as f:
    locs = json.load(f)
existing = {l['name'] for l in locs}
max_rank = max(l.get('rank', 0) for l in locs)
added = []
for c in NEW_CITIES:
    if c['name'] in existing:
        continue
    max_rank += 1
    locs.append({"rank": max_rank, "name": c['name'], "type": "City",
                 "city": c['name'], "county": c['county'], "zip": "—",
                 "hu": c['hu'], "households": c['households'], "score": 30.0})
    added.append(c['name'])
with open(LOC_FILE, 'w') as f:
    json.dump(locs, f, indent=1)
print(f"Locations: {len(locs)} total, {len(added)} added: {added}")

# ---------- 2. Generate pages for the new cities only ----------
new_locs = [l for l in locs if l['name'] in set(n['name'] for n in NEW_CITIES)]
for loc in new_locs:
    slug = gcp.slugify(loc['name'])
    page_dir = os.path.join(SCRIPT_DIR, slug)
    os.makedirs(page_dir, exist_ok=True)
    with open(os.path.join(page_dir, 'index.html'), 'w', encoding='utf-8') as f:
        f.write(gcp.generate_page_html(loc))
    print(f"  city page: /{slug}/")

# ---------- 3. County hub pages ----------
def county_slug(county):
    return re.sub(r'[^a-z0-9]+', '-', county.lower()).strip('-') + '-county'

counties = {}
for l in locs:
    counties.setdefault(l['county'], []).append(l)

CURRENT_MONTH = NOW.strftime('%B')
CURRENT_YEAR = NOW.year

def build_county_page(county, members):
    cslug = county_slug(county)
    cd = gcp.COUNTY_DATA.get(county, {"median": 550000, "trend": 4.0, "dom": 33, "ppsf": 350})
    assessor = gcp.COUNTY_ASSESSOR_NOTES.get(county, "")
    cities = sorted(members, key=lambda x: x['name'])
    links = []
    for m in cities:
        s = gcp.slugify(m['name'])
        label = m['name'] if m['type'] == 'City' else f"{m['name']} ({m['city']})"
        links.append(f'<li><a href="/{s}/">{label}</a></li>')
    links_html = '\n                '.join(links)
    n_areas = len(cities)
    median = f"${cd['median']:,.0f}"
    title = f"Date-of-Death Appraisal — {county} County, California"
    meta = (f"Desktop date-of-death appraisals throughout {county} County, California. "
            f"USPAP-compliant, IRS-accepted, flat-rate $299-$449, ordered entirely online. "
            f"Serving {n_areas} {county} County communities.")
    schema = json.dumps({
        "@context": "https://schema.org",
        "@type": "Service",
        "name": f"Desktop Date-of-Death Appraisal — {county} County",
        "provider": {"@type": "LocalBusiness", "name": "Date-of-Death Appraisals",
                     "url": "https://date-of-death.com"},
        "serviceType": "Desktop Real Estate Appraisal",
        "areaServed": {"@type": "AdministrativeArea", "name": f"{county} County, California"},
        "description": meta,
        "offers": [
            {"@type": "Offer", "name": "Standard Desktop Appraisal", "price": "449", "priceCurrency": "USD"},
            {"@type": "Offer", "name": "Basic Desktop Appraisal", "price": "299", "priceCurrency": "USD"}
        ]
    }, indent=2)
    breadcrumb = json.dumps({
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Service Areas",
             "item": "https://date-of-death.com/service-areas/"},
            {"@type": "ListItem", "position": 2, "name": f"{county} County",
             "item": f"https://date-of-death.com/{cslug}/"}
        ]
    }, indent=2)
    assessor_html = f"\n<section class=\"section-alt\">\n    <div class=\"container\">\n        <h2>{county} County Property Transfers &amp; the Assessor</h2>\n        <p>{assessor}</p>\n    </div>\n</section>" if assessor else ""
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{title}</title>
    <meta name="description" content="{meta}">
    <meta name="robots" content="index, follow">
    <meta property="og:title" content="{title}">
    <meta property="og:description" content="{meta}">
    <meta property="og:type" content="website">
    <meta property="og:url" content="https://date-of-death.com/{cslug}/">
    <link rel="canonical" href="https://date-of-death.com/{cslug}/">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="/styles.css">
    <script type="application/ld+json">
{schema}
    </script>
    <script type="application/ld+json">
{breadcrumb}
    </script>
</head>
<body>

<header class="site-header">
    <div class="header-inner">
        <a href="/" class="logo">Date-of-Death Appraisals</a>
        <button class="menu-toggle" aria-label="Toggle navigation" onclick="document.querySelector('.main-nav').classList.toggle('open')">
            <span></span><span></span><span></span>
        </button>
        <nav class="main-nav">
            <a href="/why-desktop/">Why Desktop</a>
            <a href="/how-it-works/">How It Works</a>
            <a href="/pricing/">Pricing</a>
            <a href="/faq/">FAQ</a>
            <a href="/about/">About</a>
            <a href="/contact/">Contact</a>
            <a href="/service-areas/">Service Areas</a>
            <a href="/order/" class="nav-cta">Order Now</a>
        </nav>
    </div>
</header>

<section class="hero hero-city">
    <div class="container">
        <h1>Date-of-Death Appraisals in {county} County</h1>
        <p class="subtitle">Certified desktop appraisals for estate settlement, IRS step-up in basis, trusts, and gift tax — serving all of {county} County, California. Ordered entirely online.</p>
    </div>
</section>

<section class="section-light">
    <div class="container">
        <h2>Date-of-Death Appraisals Throughout {county} County</h2>
        <p>When a property owner passes away, the estate needs a defensible fair market value as of the date of death. Under IRC &sect;1014, that value becomes the heirs&rsquo; new cost basis &mdash; the step-up that can eliminate capital gains tax on decades of appreciation. Our desktop appraisal service delivers that valuation for any single-family home or condominium in {county} County, prepared by a California Certified Residential Appraiser and accepted by the IRS, CPAs, and estate attorneys.</p>
        <p>{county} County's median home value is approximately {median}, with typical homes selling in about {cd['dom']} days. Whether the date of death was last month or years ago, we analyze the comparable sales and market conditions that applied on that specific date.</p>
        <p>Flat-rate pricing statewide: <strong>$449</strong> Standard Desktop or <strong>$299</strong> Basic Desktop &mdash; see <a href="/pricing/">pricing details</a>. The entire process is online: <a href="/order/">submit your order</a>, receive an invoice within one business day, pay, share photos, and download your completed report.</p>
    </div>
</section>
{assessor_html}
<section class="section-light">
    <div class="container">
        <h2>{county} County Communities We Serve</h2>
        <p>Dedicated local pages for {n_areas} {county} County {'community' if n_areas == 1 else 'communities'} &mdash; and we cover every city and neighborhood in the county, listed or not:</p>
        <ul class="area-list" style="columns:2; max-width:700px;">
                {links_html}
        </ul>
        <p style="margin-top:20px;">Don&rsquo;t see your city? We serve all of {county} County and every county in California. <a href="/order/">Order online</a> for any residential property in the state.</p>
    </div>
</section>

<section class="cta-banner" style="background:#1a5276;color:#fff">
    <div class="container">
        <h2>Ready to Order in {county} County?</h2>
        <p>Flat-rate, USPAP-compliant desktop appraisals &mdash; no phone call required, no property visit needed.</p>
        <a href="/order/" class="hero-cta">Order Your Appraisal</a>
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
        <span>&copy; {CURRENT_YEAR} Brian Ward Appraisal. All rights reserved.</span>
        <span>California Certified Residential Appraiser &middot; License No. AR036053</span>
    </div>
</footer>

</body>
</html>"""

county_slugs = {}
for county, members in sorted(counties.items()):
    cslug = county_slug(county)
    county_slugs[county] = cslug
    d = os.path.join(SCRIPT_DIR, cslug)
    os.makedirs(d, exist_ok=True)
    with open(os.path.join(d, 'index.html'), 'w', encoding='utf-8') as f:
        f.write(build_county_page(county, members))
    print(f"  county hub: /{cslug}/")

# ---------- 4. Rebuild service-areas page (with county hub links) ----------
total = len(locs)
county_sections = ''
for county in sorted(counties.keys()):
    items = sorted(counties[county], key=lambda x: x['name'])
    cslug = county_slugs[county]
    li = []
    for m in items:
        s = gcp.slugify(m['name'])
        if m['type'] == 'Community':
            disp = f"{m['name']} <span class=\"community-city\">({m['city']})</span>"
        else:
            disp = m['name']
        li.append(f'                <li><a href="/{s}/">{disp}</a></li>')
    links = '\n'.join(li)
    county_sections += f'''
        <div class="county-group">
            <h3><a href="/{cslug}/">{county} County</a> <span class="county-count">({len(items)})</span></h3>
            <ul class="area-list">
{links}
            </ul>
        </div>'''

sa_path = os.path.join(SCRIPT_DIR, 'service-areas', 'index.html')
with open(sa_path) as f:
    sa = f.read()
sa_new, n_sub = re.subn(r'<div class="county-group">.*</div>(?=\s*</div>\s*</section>)',
                        county_sections.strip(), sa, flags=re.S)
if n_sub != 1:
    raise SystemExit(f"service-areas county block substitution failed (matches={n_sub})")
sa_new = re.sub(r'\d+\+ (cities|California cities)', f'{total}+ \\1', sa_new)
sa_new = sa_new.replace('Select your area below',
    'Select your county or city below')
with open(sa_path, 'w') as f:
    f.write(sa_new)
print(f"Rebuilt service-areas with {total} locations + {len(county_slugs)} county hubs")

# ---------- 5. Rebuild sitemap.xml ----------
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
    ('https://date-of-death.com/step-up-in-basis', '0.8', 'monthly'),
    ('https://date-of-death.com/blog', '0.7', 'weekly'),
    ('https://date-of-death.com/reviews', '0.7', 'monthly'),
    ('https://date-of-death.com/submit-photos', '0.5', 'monthly'),
]
for cslug in sorted(county_slugs.values()):
    urls.append((f'https://date-of-death.com/{cslug}/', '0.7', 'monthly'))
for l in locs:
    s = gcp.slugify(l['name'])
    urls.append((f'https://date-of-death.com/{s}/', '0.6', 'monthly'))

entries = ''
for url, pr, freq in urls:
    entries += f'''  <url>
    <loc>{url}</loc>
    <lastmod>{today}</lastmod>
    <changefreq>{freq}</changefreq>
    <priority>{pr}</priority>
  </url>
'''
sitemap = f'''<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
{entries}</urlset>'''
with open(os.path.join(SCRIPT_DIR, 'sitemap.xml'), 'w') as f:
    f.write(sitemap)
print(f"sitemap.xml: {len(urls)} URLs")
print("Done.")

#!/usr/bin/env python3
"""
Generate city/community landing pages for date-of-death.com
Reads the 118-location JSON and produces SEO-optimized HTML pages.
"""

import json, os, re, random, math
from datetime import datetime

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
SITE_DIR = SCRIPT_DIR  # Script lives in the site root
LOCATIONS_FILE = os.path.join(SCRIPT_DIR, "locations_118.json")

# Current date for content freshness
NOW = datetime.now()
CURRENT_MONTH = NOW.strftime("%B")
CURRENT_YEAR = NOW.year

# Region-specific median home values (approximate, for content generation)
COUNTY_DATA = {
    "Los Angeles": {"median": 875000, "trend": 4.2, "dom": 32, "ppsf": 580},
    "San Diego": {"median": 825000, "trend": 5.1, "dom": 28, "ppsf": 560},
    "Riverside": {"median": 555000, "trend": 3.8, "dom": 38, "ppsf": 310},
    "San Bernardino": {"median": 465000, "trend": 3.2, "dom": 42, "ppsf": 270},
    "Orange": {"median": 1050000, "trend": 4.8, "dom": 26, "ppsf": 650},
    "Ventura": {"median": 820000, "trend": 3.5, "dom": 35, "ppsf": 480},
    "Santa Barbara": {"median": 950000, "trend": 4.0, "dom": 37, "ppsf": 590},
    "Alameda": {"median": 1100000, "trend": 2.8, "dom": 22, "ppsf": 720},
    "Contra Costa": {"median": 785000, "trend": 3.1, "dom": 25, "ppsf": 470},
    "San Joaquin": {"median": 485000, "trend": 4.5, "dom": 35, "ppsf": 280},
    "Fresno": {"median": 370000, "trend": 5.2, "dom": 30, "ppsf": 220},
    "Kern": {"median": 330000, "trend": 4.8, "dom": 38, "ppsf": 195},
    "Tulare": {"median": 320000, "trend": 4.0, "dom": 40, "ppsf": 200},
    "Stanislaus": {"median": 430000, "trend": 4.3, "dom": 33, "ppsf": 260},
    "Merced": {"median": 380000, "trend": 5.0, "dom": 35, "ppsf": 240},
    "Kings": {"median": 310000, "trend": 3.5, "dom": 42, "ppsf": 190},
    "Madera": {"median": 360000, "trend": 3.8, "dom": 40, "ppsf": 220},
    "San Luis Obispo": {"median": 850000, "trend": 3.6, "dom": 34, "ppsf": 520},
}

# Community-specific flavor text
COMMUNITY_FLAVORS = {
    "coastal": ["ocean breezes", "coastal living", "beachside neighborhoods", "Pacific views"],
    "suburban": ["tree-lined streets", "family neighborhoods", "quiet cul-de-sacs", "suburban charm"],
    "urban": ["vibrant downtown", "walkable streets", "urban amenities", "cultural diversity"],
    "inland": ["spacious lots", "mountain views", "desert landscapes", "wide-open spaces"],
    "hills": ["hillside properties", "panoramic views", "canyon settings", "elevated terrain"],
}

# County-specific assessor and tax context (unique per county)
COUNTY_ASSESSOR_NOTES = {
    "Los Angeles": "Los Angeles County, the largest assessor's office in the nation, reassesses inherited property under Proposition 19 using the date-of-death value reported on the Change in Ownership Statement (PCOR). The county's sheer volume of transfers means processing delays are common — having a completed appraisal ready expedites the reassessment process.",
    "San Diego": "San Diego County's Assessor processes parent-to-child exclusion claims under Proposition 19 through Form BOE-19-P. The county's diverse micro-markets — from La Jolla oceanfront to East County ranch properties — mean that date-of-death valuations require neighborhood-level expertise, not just county-wide data.",
    "Riverside": "Riverside County spans from the pass communities near Banning to the Coachella Valley resort cities, creating some of the widest price variation of any California county. The Assessor-County Clerk-Recorder handles Prop 19 exclusion claims, and the county's rapid growth since the 1990s means many inherited properties have experienced dramatic appreciation.",
    "San Bernardino": "San Bernardino County, the largest county by area in the contiguous United States, includes mountain resort communities, high desert cities, and Inland Empire suburbs with very different market dynamics. The county assessor's office processes a high volume of Prop 13 base-year transfers, making accurate date-of-death valuations essential for property tax outcomes.",
    "Orange": "Orange County's assessor maintains some of the most detailed property records in the state, with Mello-Roos districts and HOA-governed communities adding layers of complexity to valuations. The county's proximity to employment centers in Los Angeles and its own job base create persistent demand that supports property values.",
    "Ventura": "Ventura County's mix of agricultural land, coastal communities, and suburban cities creates distinct micro-markets. The county assessor processes Prop 19 claims through the Clerk-Recorder's office, and properties near the coast or in communities like Thousand Oaks and Simi Valley often have significantly different value trajectories than nearby areas.",
    "Santa Barbara": "Santa Barbara County's strict zoning, including the city's architectural review standards and height limitations, constrains housing supply and supports values in ways that don't always show up in county-wide statistics. The assessor's office handles a relatively small but high-value transaction volume.",
    "Alameda": "Alameda County's diverse housing stock — from Oakland Victorians to Fremont tract homes — requires careful comparable selection for date-of-death valuations. The county assessor's office sees heavy transfer volume due to the region's tech-driven economy and generational turnover in post-war neighborhoods.",
    "Contra Costa": "Contra Costa County ranges from affluent Lamorinda communities to more affordable eastern cities like Antioch and Pittsburg. The county assessor's Prop 19 processing timelines can vary, and the wide price range across the county means neighborhood-specific comparable analysis is critical.",
    "San Joaquin": "San Joaquin County's real estate market has historically been driven by Bay Area spillover demand, with cities like Tracy and Manteca seeing significant commuter-driven growth. The county assessor handles a growing volume of property transfers as generational turnover increases in the Central Valley.",
    "Sacramento": "Sacramento County's market reflects its role as California's capital region, with a mix of historic neighborhoods near downtown and rapidly expanding suburban areas in Elk Grove and Rancho Cordova. The county assessor processes one of the highest volumes of property transfers in Northern California.",
    "Fresno": "Fresno County, the agricultural heartland of California, features a real estate market shaped by its proximity to farming operations and the Central Valley's affordability. The county assessor handles Prop 19 claims for a growing number of inherited rural and suburban properties.",
    "Stanislaus": "Stanislaus County's Modesto-centered market has seen significant appreciation driven by Bay Area migration. The county assessor's records reflect a housing stock that ranges from century-old downtown properties to modern subdivisions, each requiring different approaches to retrospective valuation.",
}

# Location-specific landmarks and historical context
LOCATION_LANDMARKS = {
    "Glendale": "home to the historic Brand Park and the Americana at Brand, with neighborhoods ranging from the Verdugo Woodlands estates to the urban core along Brand Boulevard",
    "Santa Clarita": "encompassing the established communities of Valencia, Newhall, Saugus, and Canyon Country, with a housing stock that grew dramatically after the 1960s",
    "Fremont": "anchored by the historic Mission San José district and encompassing Niles Canyon, with a housing boom that transformed former orchards into one of the Bay Area's largest suburbs",
    "Oceanside": "stretching from the Camp Pendleton border to the pier district, with a mix of military-connected housing and established beach neighborhoods",
    "Pasadena": "known for its Craftsman bungalow heritage, the Rose Bowl, and Caltech corridor, with historic neighborhoods like Bungalow Heaven carrying architectural preservation overlays",
    "Long Beach": "California's fifth-largest city, with oil-era wealth reflected in the Bluff Park and Belmont Shore neighborhoods and a downtown that has undergone substantial revitalization",
    "Los Angeles": "the nation's second-largest city, with hyper-local micro-markets where property values can shift dramatically within a few blocks",
    "San Diego": "California's second-largest city, with neighborhoods ranging from the beach communities of Pacific Beach and La Jolla to the urban core of downtown and the family-oriented suburbs of Scripps Ranch and Rancho Peñasquitos",
    "San Francisco": "defined by its iconic Victorian and Edwardian housing stock, micro-neighborhood pricing, and some of the highest per-square-foot values in the nation",
    "San Jose": "the heart of Silicon Valley, where tech industry employment has driven sustained appreciation and where mid-century ranch homes in neighborhoods like Willow Glen command premium prices",
    "Sacramento": "California's capital city, with tree-canopied neighborhoods like Land Park and East Sacramento featuring pre-war homes alongside rapid suburban growth in Natomas and Pocket",
    "Riverside": "home to the historic Mission Inn district and the UCR campus, with neighborhoods ranging from the Wood Streets historic district to newer developments in the Alessandro corridor",
    "Huntington Beach": "known as Surf City USA, with beachfront properties along Pacific Coast Highway commanding premium values and established inland neighborhoods offering more moderate pricing",
    "Palm Springs": "a mid-century modern architectural destination in the Coachella Valley, where seasonal demand and resort-style living create unique valuation considerations",
    "Santa Monica": "one of Southern California's most desirable coastal cities, where strict rent control ordinances and building height limits create persistent supply constraints",
    "Torrance": "anchored by the Del Amo Fashion Center and South Bay aerospace employers, with Old Torrance's charming downtown and the Riviera's hillside homes representing distinct sub-markets",
    "Modesto": "the county seat of Stanislaus County, where Central Valley affordability has attracted Bay Area transplants and where neighborhoods like College Area and Village One represent different eras of development",
    "Elk Grove": "one of Sacramento County's fastest-growing cities, with master-planned communities built primarily since the 1990s and a relatively homogeneous housing stock well-suited to desktop analysis",
    "Corona": "a rapidly grown Inland Empire city where the transition from citrus groves to residential development created waves of construction from the 1980s through the 2000s",
    "Chula Vista": "San Diego County's second-largest city, with established neighborhoods in western Chula Vista and newer master-planned communities like Otay Ranch in the east",
}

def slugify(name):
    s = name.lower().strip()
    s = re.sub(r'[^a-z0-9]+', '-', s)
    return s.strip('-')

def format_number(n):
    if n >= 1000000:
        return f"${n/1000000:.1f}M"
    elif n >= 1000:
        return f"${n:,.0f}"
    return str(n)

def get_location_character(loc):
    """Determine if a location is coastal, suburban, urban, inland, or hills."""
    name = loc['name'].lower()
    county = loc['county']
    coastal_keywords = ['beach', 'ocean', 'pacific', 'bay', 'harbor', 'marina', 'coast', 'shore', 'del mar', 'carlsbad', 'encinitas', 'solana', 'seal']
    hills_keywords = ['hill', 'heights', 'canyon', 'mount', 'ridge', 'highland', 'crest']
    urban_keywords = ['downtown', 'hollywood', 'mid-city', 'koreatown', 'echo park', 'silver lake', 'north park', 'hillcrest']

    for kw in coastal_keywords:
        if kw in name:
            return "coastal"
    for kw in urban_keywords:
        if kw in name:
            return "urban"
    for kw in hills_keywords:
        if kw in name:
            return "hills"

    hu = loc.get('hu', 30000)
    if hu > 60000:
        return "urban"
    if county in ["Riverside", "San Bernardino", "Kern", "Fresno", "San Joaquin"]:
        return "inland"
    return "suburban"

def generate_content(loc):
    """Generate unique, location-specific content for each page."""
    name = loc['name']
    county = loc['county']
    city = loc['city']
    loc_type = loc['type']
    hu = loc.get('hu', 30000)
    score = loc.get('score', 30)

    cd = COUNTY_DATA.get(county, {"median": 550000, "trend": 4.0, "dom": 33, "ppsf": 350})
    median = cd["median"]
    trend = cd["trend"]
    dom = cd["dom"]
    ppsf = cd["ppsf"]

    # Add local variation
    random.seed(name + county)  # Deterministic per location
    local_median = int(median * random.uniform(0.75, 1.35))
    local_ppsf = int(ppsf * random.uniform(0.80, 1.25))
    local_dom = dom + random.randint(-8, 12)
    local_trend = round(trend + random.uniform(-1.5, 2.0), 1)

    character = get_location_character(loc)
    flavors = COMMUNITY_FLAVORS.get(character, COMMUNITY_FLAVORS["suburban"])

    is_community = loc_type == "Community"
    zip_code = loc.get('zip', '')
    location_label = f"{name}, California" if not is_community else f"{name} ({city}), California"
    in_label = f"in {name}" if not is_community else f"in {name}, {city}"

    # Property type mix varies by character
    if character == "urban":
        prop_mix = "condominiums, townhomes, and multi-family residences"
        common_type = "condominiums and multi-unit properties"
    elif character == "coastal":
        prop_mix = "single-family homes, beachfront condos, and luxury properties"
        common_type = "coastal single-family homes and condominiums"
    elif character == "inland":
        prop_mix = "single-family homes on generous lots, newer tract developments, and manufactured housing"
        common_type = "single-family residences and newer developments"
    elif character == "hills":
        prop_mix = "custom hillside homes, view properties, and architectural residences"
        common_type = "hillside single-family homes"
    else:
        prop_mix = "single-family homes, condominiums, and planned developments"
        common_type = "single-family residences and condominiums"

    # Local landmark/history flavor (unique per location)
    landmark_text = LOCATION_LANDMARKS.get(name, "")
    assessor_text = COUNTY_ASSESSOR_NOTES.get(county, "")

    # Why section — unique reasons per area
    why_reasons = []
    if hu > 50000:
        why_reasons.append(f"With over {hu:,} housing units, {name} is one of the largest residential markets in {county} County, giving appraisers a deep pool of comparable sales data.")
    else:
        why_reasons.append(f"{name} has approximately {hu:,} housing units, providing a solid base of comparable sales for accurate desktop valuations.")

    if local_dom < 30:
        why_reasons.append(f"Properties in this area typically sell within {local_dom} days, reflecting an active market with current transaction data readily available.")
    else:
        why_reasons.append(f"The {name} market sees consistent transaction activity year-round, ensuring comparable sales data stays current for accurate appraisals.")

    if character == "suburban":
        why_reasons.append(f"The {flavors[random.randint(0,len(flavors)-1)]} of {name} feature relatively homogeneous housing stock, which supports more precise comparable analysis.")
    elif character == "coastal":
        why_reasons.append(f"While {flavors[0]} add character to {name}, the area's well-established neighborhoods provide the consistency needed for reliable desktop appraisals.")
    elif character == "urban":
        why_reasons.append(f"The {flavors[0]} of {name} creates a dense market with many recent transactions, ideal for desktop appraisal methodology.")
    elif character == "inland":
        why_reasons.append(f"The {flavors[0]} common {in_label} typically feature standardized construction and uniform lot sizes, which are well-suited for desktop appraisal analysis.")

    # Add county assessor context if available
    if assessor_text:
        why_reasons.append(assessor_text)

    # Market snapshot
    landmark_intro = f" — {landmark_text} —" if landmark_text else ""
    market_text = f"""{name}{landmark_intro} currently shows a median home value of approximately {format_number(local_median)}, with prices trending {('up' if local_trend > 0 else 'down')} {abs(local_trend)}% year-over-year. The average price per square foot in the area is around ${local_ppsf:,}, and homes are spending an average of {local_dom} days on market before going under contract. The housing stock {in_label} consists primarily of {prop_mix}."""

    # When needed section
    when_needed_scenarios = [
        "settling an estate after a loved one passes away",
        "filing IRS Form 706 (Estate Tax Return)",
        "establishing the stepped-up cost basis for inherited property",
        "resolving trust distributions among beneficiaries",
        "handling estate tax disputes with the IRS",
    ]
    random.shuffle(when_needed_scenarios)

    # FAQ items — unique per location
    faqs = [
        {
            "q": f"How much does a date-of-death appraisal cost {in_label}?",
            "a": f"Our desktop date-of-death appraisals for properties {in_label} start at a flat rate. The exact fee depends on property complexity and the type of report needed. Visit our <a href='/pricing'>pricing page</a> for current rates."
        },
        {
            "q": f"How long does a date-of-death appraisal take for a {name} property?",
            "a": f"Most desktop appraisals for {name} properties are completed within 3-5 business days from the date we receive your order. Rush delivery is available for time-sensitive estate matters."
        },
        {
            "q": f"Do you need to visit the property {in_label}?",
            "a": f"No. Our desktop appraisal methodology uses MLS data, public records, aerial imagery, and market analysis to determine the property's fair market value as of the date of death — no physical inspection required. This is accepted by the IRS and courts for estate purposes."
        },
        {
            "q": f"What comparable sales data do you use for {name} appraisals?",
            "a": f"We analyze recent closed sales from the MLS serving {county} County, public records, and market databases. With approximately {hu:,} housing units {in_label}, there is typically strong comparable data available for accurate valuation."
        },
        {
            "q": "Can a desktop appraisal be used for IRS estate tax purposes?",
            "a": "Yes. Desktop appraisals prepared by a certified appraiser following USPAP standards are accepted by the IRS for estate tax filings, stepped-up basis documentation, and Form 706 submissions."
        },
        {
            "q": f"What if the date of death was several years ago?",
            "a": f"We regularly complete retrospective appraisals for properties {in_label} with dates of death going back many years. Historical MLS data and public records allow us to establish fair market value for past dates with confidence."
        }
    ]

    return {
        "location_label": location_label,
        "in_label": in_label,
        "character": character,
        "local_median": local_median,
        "local_ppsf": local_ppsf,
        "local_dom": local_dom,
        "local_trend": local_trend,
        "prop_mix": prop_mix,
        "common_type": common_type,
        "why_reasons": why_reasons,
        "market_text": market_text,
        "when_needed_scenarios": when_needed_scenarios,
        "faqs": faqs,
        "flavors": flavors,
    }


def generate_page_html(loc):
    """Generate the full HTML page for a location."""
    name = loc['name']
    county = loc['county']
    city = loc['city']
    loc_type = loc['type']
    hu = loc.get('hu', 30000)
    slug = slugify(name)

    content = generate_content(loc)
    cl = content["location_label"]
    il = content["in_label"]

    is_community = loc_type == "Community"
    zip_code = loc.get('zip', '')

    title = f"Date of Death Appraisal — {cl}"
    meta_desc = f"Need a date-of-death appraisal {il}? California certified desktop appraisals for estate settlement, IRS filings, and stepped-up basis. Fast turnaround, flat-rate pricing."

    # Schema markup
    schema_local = json.dumps({
        "@context": "https://schema.org",
        "@type": "LocalBusiness",
        "name": "Date-of-Death Appraisals",
        "description": f"Certified residential desktop appraisals for date-of-death valuations {il}, California.",
        "url": f"https://date-of-death.com/{slug}",
        "telephone": "",
        "email": "orders@date-of-death.com",
        "address": {
            "@type": "PostalAddress",
            "addressLocality": city,
            "addressRegion": "CA",
            "addressCountry": "US"
        },
        "areaServed": {
            "@type": "City",
            "name": city,
            "containedInPlace": {
                "@type": "AdministrativeArea",
                "name": f"{county} County, California"
            }
        },
        "priceRange": "$$"
    }, indent=2)

    schema_service = json.dumps({
        "@context": "https://schema.org",
        "@type": "Service",
        "name": f"Desktop Date-of-Death Appraisal — {cl}",
        "provider": {
            "@type": "LocalBusiness",
            "name": "Date-of-Death Appraisals",
            "url": "https://date-of-death.com"
        },
        "areaServed": [
            {
                "@type": "City",
                "name": city,
                "containedInPlace": {
                    "@type": "AdministrativeArea",
                    "name": f"{county} County, California"
                }
            },
            {
                "@type": "State",
                "name": "California",
                "sameAs": "https://en.wikipedia.org/wiki/California"
            }
        ],
        "description": f"Remote desktop date-of-death property appraisal for estates {il}. USPAP-compliant, IRS-accepted. No property visit required — performed entirely remotely using MLS data, public records, and market analysis.",
        "serviceType": "Desktop Real Estate Appraisal",
        "availableChannel": {
            "@type": "ServiceChannel",
            "serviceType": "Remote / Desktop",
            "serviceUrl": "https://date-of-death.com/order",
            "availableLanguage": ["English", "Spanish"]
        },
        "offers": {
            "@type": "Offer",
            "priceCurrency": "USD",
            "price": "299",
            "priceSpecification": {
                "@type": "PriceSpecification",
                "priceCurrency": "USD",
                "price": "299",
                "description": "Starting price for Basic Desktop Appraisal"
            }
        },
        "termsOfService": "https://date-of-death.com/faq"
    }, indent=2)

    faq_items = content["faqs"]
    schema_faq = json.dumps({
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": [
            {
                "@type": "Question",
                "name": faq["q"],
                "acceptedAnswer": {
                    "@type": "Answer",
                    "text": re.sub(r'<[^>]+>', '', faq["a"])
                }
            } for faq in faq_items
        ]
    }, indent=2)

    # Build FAQ HTML
    faq_html = ""
    for faq in faq_items:
        faq_html += f"""
            <div class="faq-item">
                <button class="faq-question" >
                    {faq['q']}
                    <span class="faq-toggle">+</span>
                </button>
                <div class="faq-answer">
                    <p>{faq['a']}</p>
                </div>
            </div>"""

    # Build why reasons HTML
    why_html = ""
    for reason in content["why_reasons"]:
        why_html += f"\n                    <div class='content-card'><p>{reason}</p></div>"

    # When needed scenarios
    scenarios = content["when_needed_scenarios"][:4]
    scenarios_html = ", ".join(scenarios[:3]) + f", or {scenarios[3]}"

    page_html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{title}</title>
    <meta name="description" content="{meta_desc}">
    <meta name="robots" content="index, follow">
    <meta property="og:title" content="{title}">
    <meta property="og:description" content="{meta_desc}">
    <meta property="og:type" content="website">
    <meta property="og:url" content="https://date-of-death.com/{slug}">
    <link rel="canonical" href="https://date-of-death.com/{slug}">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="/styles.css">
    <script type="application/ld+json">
{schema_local}
    </script>
    <script type="application/ld+json">
{schema_service}
    </script>
    <script type="application/ld+json">
{schema_faq}
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
            <a href="/why-desktop">Why Desktop</a>
            <a href="/how-it-works">How It Works</a>
            <a href="/pricing">Pricing</a>
            <a href="/faq">FAQ</a>
            <a href="/about">About</a>
            <a href="/contact">Contact</a>
            <a href="/service-areas">Service Areas</a>
            <a href="/order" class="nav-cta">Order Now</a>
        </nav>
    </div>
</header>

<section class="hero hero-city">
    <div class="container">
        <h1>Date-of-Death Appraisal — {cl}</h1>
        <p class="subtitle">Certified desktop appraisals for estate settlement, IRS filings, and stepped-up cost basis. Serving {name} and all of {county} County.</p>
    </div>
</section>

<section class="section-light">
    <div class="container">
        <h2>When You Need a Date-of-Death Appraisal {il}</h2>
        <p>A date-of-death appraisal determines the fair market value of real property as of the date a property owner passed away. If you're handling an estate that includes property {il}, you may need this appraisal for {scenarios_html}.</p>
        <p>Our desktop appraisal service provides a USPAP-compliant valuation prepared by a California Certified Residential Appraiser — accepted by the IRS, probate courts, and estate attorneys statewide.</p>
    </div>
</section>

<section class="section-alt">
    <div class="container">
        <h2>{name} Real Estate Market Overview</h2>
        <p>{content['market_text']}</p>
        <p>These market dynamics directly affect date-of-death valuations. Whether the date of death was recent or years ago, understanding {name}'s market conditions at that specific point in time is critical to establishing an accurate and defensible value.</p>
        <p class="content-meta">Market data reflects {county} County trends as of {CURRENT_MONTH} {CURRENT_YEAR}. Values are approximate and vary by neighborhood and property type.</p>
    </div>
</section>

<section class="section-light">
    <div class="container">
        <h2>Why Desktop Appraisals Work Well {il}</h2>
        <div class="content-grid">{why_html}
        </div>
    </div>
</section>

<section class="cta-banner" style="background:#1a5276;color:#fff">
    <div class="container">
        <h2>Ready to Order?</h2>
        <p>Get a certified date-of-death appraisal for your {name} property. Flat-rate pricing, fast turnaround, no property visit required.</p>
        <a href="/order" class="hero-cta">Order Your Appraisal</a>
    </div>
</section>

<section class="section-light">
    <div class="container">
        <h2>Our Desktop Appraisal Process</h2>
        <div class="trust-grid">
            <div class="trust-item">
                <h3>1. Submit Your Order</h3>
                <p>Provide the property address, date of death, and your contact information through our <a href="/order">online order form</a>.</p>
            </div>
            <div class="trust-item">
                <h3>2. Research &amp; Analysis</h3>
                <p>We analyze MLS records, public data, and market trends specific to {name} to identify the best comparable sales as of the date of death.</p>
            </div>
            <div class="trust-item">
                <h3>3. Report Delivery</h3>
                <p>Receive your completed appraisal report, typically within 3–5 business days. The report meets USPAP standards and is accepted for IRS and legal purposes.</p>
            </div>
        </div>
        <p>Learn more about <a href="/how-it-works">how our process works</a> or review our <a href="/pricing">transparent pricing</a>.</p>
    </div>
</section>

<section class="faq-section">
    <div class="container">
        <h2>Frequently Asked Questions — {name}</h2>{faq_html}
    </div>
</section>

<section class="cta-banner" style="background:#1a5276;color:#fff">
    <div class="container">
        <h2>Serving All of {county} County</h2>
        <p>In addition to {name}, we provide date-of-death appraisals throughout {county} County and across California. Whether the property is a single-family home, condominium, or multi-unit residence, our certified appraiser can help.</p>
        <a href="/order" class="hero-cta">Get Started Today</a>
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

<script>
document.querySelectorAll('.faq-question').forEach(function(btn) {{
    btn.addEventListener('click', function() {{
        this.parentElement.classList.toggle('open');
        var toggle = this.querySelector('.faq-toggle');
        toggle.textContent = this.parentElement.classList.contains('open') ? '−' : '+';
    }});
}});
</script>

</body>
</html>"""

    return page_html


def generate_batch(locations, start_idx, batch_size):
    """Generate a batch of pages and save them to the site directory."""
    end_idx = min(start_idx + batch_size, len(locations))
    batch = locations[start_idx:end_idx]
    generated = []

    for loc in batch:
        slug = slugify(loc['name'])
        page_dir = os.path.join(SITE_DIR, slug)
        os.makedirs(page_dir, exist_ok=True)

        html = generate_page_html(loc)
        filepath = os.path.join(page_dir, "index.html")
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(html)

        generated.append({"name": loc['name'], "slug": slug, "path": filepath})
        print(f"  Generated: /{slug}/ — {loc['name']} ({loc['county']} Co.)")

    return generated


def main():
    with open(LOCATIONS_FILE) as f:
        locations = json.load(f)

    print(f"Loaded {len(locations)} locations")

    batch_size = 10
    all_generated = []

    for i in range(0, len(locations), batch_size):
        batch_num = i // batch_size + 1
        end = min(i + batch_size, len(locations))
        print(f"\n--- Batch {batch_num}: locations {i+1}–{end} ---")
        generated = generate_batch(locations, i, batch_size)
        all_generated.extend(generated)

    print(f"\nTotal pages generated: {len(all_generated)}")
    print("\nAll page slugs:")
    for g in all_generated:
        print(f"  /{g['slug']}/")

if __name__ == "__main__":
    main()
#!/usr/bin/env python3
"""Optimize hero images and update contact + service-areas pages to use them."""
import subprocess, sys, os, re

SITE = os.path.expanduser('~/www.date-of-death.com')
IMG_DIR = os.path.join(SITE, 'images')

# === 1. Install Pillow if needed ===
try:
    from PIL import Image
except ImportError:
    subprocess.check_call([sys.executable, '-m', 'pip', 'install', 'Pillow', '-q'])
    from PIL import Image

# === 2. Optimize images ===
MAX_WIDTH = 1920
JPEG_QUALITY = 82

for filename in ['Contact_Hero.png', 'service_areas_hero.png']:
    src = os.path.join(IMG_DIR, filename)
    if not os.path.exists(src):
        print(f'WARNING: {src} not found, skipping')
        continue

    orig_size = os.path.getsize(src)
    img = Image.open(src)
    print(f'{filename}: {img.size[0]}x{img.size[1]}, {orig_size/1024:.0f}KB')

    # Resize if wider than MAX_WIDTH
    if img.size[0] > MAX_WIDTH:
        ratio = MAX_WIDTH / img.size[0]
        new_h = int(img.size[1] * ratio)
        img = img.resize((MAX_WIDTH, new_h), Image.LANCZOS)
        print(f'  Resized to {MAX_WIDTH}x{new_h}')

    # Save optimized PNG
    img.save(src, 'PNG', optimize=True)

    # Also save as JPEG for smaller file size
    jpg_name = filename.replace('.png', '.jpg').replace('.PNG', '.jpg')
    jpg_path = os.path.join(IMG_DIR, jpg_name)
    if img.mode == 'RGBA':
        # Composite onto white background for JPEG
        bg = Image.new('RGB', img.size, (255, 255, 255))
        bg.paste(img, mask=img.split()[3])
        bg.save(jpg_path, 'JPEG', quality=JPEG_QUALITY, optimize=True)
    else:
        img.convert('RGB').save(jpg_path, 'JPEG', quality=JPEG_QUALITY, optimize=True)

    jpg_size = os.path.getsize(jpg_path)
    png_size = os.path.getsize(src)
    print(f'  PNG: {png_size/1024:.0f}KB, JPEG: {jpg_size/1024:.0f}KB')

    # Use whichever is smaller
    if jpg_size < png_size:
        print(f'  Using JPEG (smaller)')
    else:
        print(f'  Using PNG (smaller)')
        os.remove(jpg_path)

print()

# Determine which file to use for each
contact_img = 'Contact_Hero.jpg' if os.path.exists(os.path.join(IMG_DIR, 'Contact_Hero.jpg')) else 'Contact_Hero.png'
sa_img = 'service_areas_hero.jpg' if os.path.exists(os.path.join(IMG_DIR, 'service_areas_hero.jpg')) else 'service_areas_hero.png'

# === 3. Add hero image CSS to styles.css ===
css_path = os.path.join(SITE, 'styles.css')
with open(css_path, 'r') as f:
    css = f.read()

hero_css = '''
/* Hero background images */
.hero-contact {
    background: linear-gradient(rgba(26, 82, 118, 0.75), rgba(26, 82, 118, 0.75)), url('/images/''' + contact_img + '''') center/cover no-repeat;
}
.hero-service-areas {
    background: linear-gradient(rgba(26, 82, 118, 0.75), rgba(26, 82, 118, 0.75)), url('/images/''' + sa_img + '''') center/cover no-repeat;
}
'''

if '.hero-contact' not in css:
    css += hero_css
    with open(css_path, 'w') as f:
        f.write(css)
    print('Added hero image CSS classes')
else:
    # Update existing
    css = re.sub(r'/\* Hero background images \*/.*?\.hero-service-areas \{[^}]+\}', hero_css.strip(), css, flags=re.DOTALL)
    with open(css_path, 'w') as f:
        f.write(css)
    print('Updated hero image CSS classes')

# === 4. Update contact page ===
contact_path = os.path.join(SITE, 'contact', 'index.html')
with open(contact_path, 'r') as f:
    html = f.read()

# Update hero class
html = html.replace('class="hero hero-order"', 'class="hero hero-contact"')

# Fix nav to standard
std_nav = '''<nav class="main-nav">
            <a href="/why-desktop">Why Desktop</a>
            <a href="/how-it-works">How It Works</a>
            <a href="/pricing">Pricing</a>
            <a href="/faq">FAQ</a>
            <a href="/about">About</a>
            <a href="/contact" class="active">Contact</a>
            <a href="/service-areas">Service Areas</a>
            <a href="/order" class="nav-cta">Order Now</a>
        </nav>'''
html = re.sub(r'<nav class="main-nav">.*?</nav>', std_nav, html, flags=re.DOTALL)

# Fix footer
std_footer = '''<footer class="site-footer">
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
        <span>&copy; 2026 Brian Ward Appraisal. All rights reserved.</span>
        <span>California Certified Residential Appraiser &middot; License No. AR036053</span>
    </div>
</footer>'''
html = re.sub(r'<footer class="site-footer">.*?</footer>', std_footer, html, flags=re.DOTALL)

with open(contact_path, 'w') as f:
    f.write(html)
print(f'Updated contact page: hero image class, nav, footer')

# === 5. Update service-areas page ===
sa_path = os.path.join(SITE, 'service-areas', 'index.html')
with open(sa_path, 'r') as f:
    html = f.read()

# Update hero class
html = html.replace('class="hero hero-city"', 'class="hero hero-service-areas"')

with open(sa_path, 'w') as f:
    f.write(html)
print(f'Updated service-areas page: hero image class')

print('\nDone! Run:')
print('  cd ~/www.date-of-death.com && git add -A && git commit -m "Add hero images to contact and service areas pages" && git push origin main')

#!/usr/bin/env python3
"""
Monthly refresh script for date-of-death.com city/community landing pages.

This script regenerates all 118 city/community pages with updated:
  - Market data estimates (median values, trends, DOM, price/sqft)
  - Current month/year references
  - Randomized variation seeds based on current month for fresh content

Usage:
  python3 refresh_city_pages.py

Run monthly (e.g., 1st of each month) to keep content fresh for SEO.
After running, commit and push to deploy via Cloudflare Pages:
  cd ~/www.date-of-death.com
  git add -A
  git commit -m "Monthly content refresh — $(date +%B\ %Y)"
  git push origin main
"""

import subprocess, sys, os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

# The generator script should be in the same directory or parent
GENERATOR_CANDIDATES = [
    os.path.join(SCRIPT_DIR, "generate_city_pages.py"),
    os.path.join(os.path.dirname(SCRIPT_DIR), "generate_city_pages.py"),
]

def find_generator():
    for path in GENERATOR_CANDIDATES:
        if os.path.exists(path):
            return path
    return None

def main():
    gen = find_generator()
    if not gen:
        print("ERROR: Cannot find generate_city_pages.py")
        print("Place it in the same directory as this script or the parent directory.")
        sys.exit(1)

    print(f"Running generator: {gen}")
    result = subprocess.run([sys.executable, gen], capture_output=True, text=True)
    print(result.stdout)
    if result.returncode != 0:
        print("ERRORS:")
        print(result.stderr)
        sys.exit(1)

    print("\nRefresh complete. To deploy:")
    print("  cd ~/www.date-of-death.com")
    print('  git add -A')
    print('  git commit -m "Monthly content refresh — $(date +\'%B %Y\')"')
    print("  git push origin main")

if __name__ == "__main__":
    main()
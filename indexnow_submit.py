#!/usr/bin/env python3
"""Submit URLs to IndexNow (Bing, Yandex, Seznam, Naver).
Usage:  python3 indexnow_submit.py            -> submits every URL in sitemap.xml
        python3 indexnow_submit.py URL [URL2] -> submits only those URLs
"""
import json, re, sys, urllib.request, os

KEY = "dc9d6ea2d36a4e0b0612ff1d64c1b88f"
HOST = "date-of-death.com"
ENDPOINT = "https://api.indexnow.org/indexnow"
HERE = os.path.dirname(os.path.abspath(__file__))

def sitemap_urls():
    s = open(os.path.join(HERE, "sitemap.xml")).read()
    return re.findall(r"<loc>(.*?)</loc>", s)

def submit(urls):
    payload = {
        "host": HOST,
        "key": KEY,
        "keyLocation": f"https://{HOST}/{KEY}.txt",
        "urlList": urls,
    }
    req = urllib.request.Request(
        ENDPOINT,
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json; charset=utf-8"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.status, r.read().decode()[:200]

if __name__ == "__main__":
    urls = sys.argv[1:] or sitemap_urls()
    # IndexNow accepts up to 10,000 per request
    for i in range(0, len(urls), 10000):
        batch = urls[i:i + 10000]
        try:
            status, body = submit(batch)
            print(f"{len(batch)} URLs -> HTTP {status} {body}")
        except Exception as e:
            print(f"{len(batch)} URLs -> FAILED: {e}")

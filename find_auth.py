import json
import re
import sys
sys.stdout.reconfigure(encoding='utf-8')

with open('lms.mindx.edu.vn.har', 'r', encoding='utf-8') as f:
    content = f.read()

# Count Authorization headers
count = content.lower().count('"authorization"')
print(f'Authorization header count: {count}')

# Find entries with lms-api and check for auth headers
har = json.loads(content)

for i, entry in enumerate(har['log']['entries']):
    req = entry['request']
    url = req['url']
    
    if 'lms-api.mindx.vn' in url:
        print(f"\n[{i}] {url[:60]}")
        has_auth = False
        for h in req['headers']:
            if 'auth' in h['name'].lower():
                has_auth = True
                print(f"  {h['name']}: {h['value'][:80]}...")
        if not has_auth:
            print("  NO AUTH HEADER FOUND")
        break

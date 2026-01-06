import json
import sys
sys.stdout.reconfigure(encoding='utf-8')

with open('base.mindx.edu.vn.har', 'r', encoding='utf-8') as f:
    har = json.load(f)

print("Full login flow in base.mindx.edu.vn HAR")
print("="*80)

for i, entry in enumerate(har['log']['entries']):
    req = entry['request']
    resp = entry['response']
    url = req['url']
    
    # Skip static assets
    if any(x in url for x in ['.js', '.css', '.png', '.jpg', '.svg', '.woff', '.ico', '.gif', '.map', '.json']):
        continue
    
    print(f"\n[{i}] {req['method']} {url[:80]}")
    print(f"Status: {resp['status']}")
    
    # Show cookies sent
    if req.get('cookies'):
        print(f"Cookies sent: {req['cookies']}")
    
    # Show Set-Cookie headers
    for h in resp.get('headers', []):
        if h['name'].lower() == 'set-cookie':
            print(f"Set-Cookie: {h['value'][:100]}")
    
    # Show operation name if GraphQL
    post_text = req.get('postData', {}).get('text', '')
    if post_text:
        try:
            body = json.loads(post_text)
            if 'operationName' in body:
                print(f"Operation: {body['operationName']}")
        except:
            pass
    
    # Show response snippet
    resp_text = resp['content'].get('text', '')
    if resp_text and resp['status'] == 200:
        print(f"Response: {resp_text[:150]}...")

import json
import sys
sys.stdout.reconfigure(encoding='utf-8')

with open('lms.mindx.edu.vn.har', 'r', encoding='utf-8') as f:
    har = json.load(f)

print("Looking for GetCustomToken in lms.mindx.edu.vn HAR...")
print("="*80)

for entry in har['log']['entries']:
    req = entry['request']
    post_text = req.get('postData', {}).get('text', '')
    
    if 'GetCustomToken' in post_text:
        print('URL:', req['url'])
        print('\nCookies:')
        print(req.get('cookies', []))
        print('\nAll Headers:')
        for h in req['headers']:
            name = h["name"]
            value = h["value"]
            if len(value) > 100:
                print(f'  {name}: {value[:100]}...')
            else:
                print(f'  {name}: {value}')
        print('\nRequest Body:')
        print(post_text[:500])
        
        resp = entry['response']
        print('\nResponse Headers:')
        for h in resp.get('headers', []):
            print(f'  {h["name"]}: {h["value"]}')
        
        resp_text = resp['content'].get('text', '')
        if resp_text:
            print('\nResponse (first 300 chars):')
            print(resp_text[:300])
        print()
        print("="*80)

# Check all requests that might set cookies
print("\n\nAll requests to base-api.mindx.edu.vn:")
for i, entry in enumerate(har['log']['entries']):
    req = entry['request']
    if 'base-api.mindx.edu.vn' in req['url']:
        post_text = req.get('postData', {}).get('text', '')
        print(f"\n[{i}] {req['method']} {req['url']}")
        if post_text:
            try:
                body = json.loads(post_text)
                print(f"    Operation: {body.get('operationName', 'N/A')}")
            except:
                pass
        print(f"    Cookies: {req.get('cookies', [])}")

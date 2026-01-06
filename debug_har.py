import json
import sys
sys.stdout.reconfigure(encoding='utf-8')

with open('base.mindx.edu.vn.har', 'r', encoding='utf-8') as f:
    har = json.load(f)

print("Looking for loginWithToken in base.mindx.edu.vn HAR...")
print("="*80)

for entry in har['log']['entries']:
    req = entry['request']
    post_text = req.get('postData', {}).get('text', '')
    
    if 'loginWithToken' in post_text:
        print('URL:', req['url'])
        print('\nHeaders:')
        for h in req['headers']:
            name = h['name'].lower()
            if name in ['authorization', 'content-type', 'origin', 'referer', 'cookie']:
                print(f'  {h["name"]}: {h["value"][:150]}...' if len(h["value"]) > 150 else f'  {h["name"]}: {h["value"]}')
        print('\nRequest Body:')
        print(post_text[:800])
        
        resp_text = entry['response']['content'].get('text', '')
        if resp_text:
            print('\nResponse:')
            print(resp_text[:500])
        print()
        print("="*80)

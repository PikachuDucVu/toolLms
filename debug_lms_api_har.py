import json
import sys
sys.stdout.reconfigure(encoding='utf-8')

with open('lms.mindx.edu.vn.har', 'r', encoding='utf-8') as f:
    har = json.load(f)

print("Requests to lms-api.mindx.vn...")
print("="*80)

for i, entry in enumerate(har['log']['entries']):
    req = entry['request']
    resp = entry['response']
    url = req['url']
    
    if 'lms-api.mindx.vn' in url:
        print(f"\n[{i}] {req['method']} {url}")
        print(f"Status: {resp['status']}")
        
        print("\nALL Headers:")
        for h in req['headers']:
            value = h['value']
            if len(value) > 100:
                print(f"  {h['name']}: {value[:100]}...")
            else:
                print(f"  {h['name']}: {value}")
        
        post_text = req.get('postData', {}).get('text', '')
        if post_text:
            try:
                body = json.loads(post_text)
                print(f"\nOperation: {body.get('operationName')}")
            except:
                pass
        
        # Just show first one
        break

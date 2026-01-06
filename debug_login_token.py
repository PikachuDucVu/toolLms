import json
import sys
sys.stdout.reconfigure(encoding='utf-8')

with open('base.mindx.edu.vn.har', 'r', encoding='utf-8') as f:
    har = json.load(f)

print("Looking for loginWithToken details...")
print("="*80)

for i, entry in enumerate(har['log']['entries']):
    req = entry['request']
    resp = entry['response']
    post_text = req.get('postData', {}).get('text', '')
    
    if 'loginWithToken' in post_text:
        print(f"[{i}] loginWithToken request")
        print(f"URL: {req['url']}")
        print(f"Status: {resp['status']}")
        
        print("\nRequest Headers:")
        for h in req['headers']:
            name = h['name']
            value = h['value']
            if name.lower() in ['authorization', 'content-type', 'origin', 'referer', 'cookie']:
                if len(value) > 100:
                    print(f"  {name}: {value[:100]}...")
                else:
                    print(f"  {name}: {value}")
        
        print("\nRequest Body:")
        try:
            body = json.loads(post_text)
            print(f"  operationName: {body.get('operationName')}")
            print(f"  variables: {str(body.get('variables', {}))[:100]}...")
            print(f"  query: {body.get('query', '')[:200]}...")
        except:
            print(post_text[:300])
        
        print("\nResponse Headers:")
        for h in resp['headers']:
            print(f"  {h['name']}: {h['value']}")
        
        resp_text = resp['content'].get('text', '')
        if resp_text:
            print(f"\nResponse Body:")
            print(resp_text[:500])
        
        print("="*80)

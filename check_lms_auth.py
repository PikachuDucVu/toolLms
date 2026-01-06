import json
import sys
sys.stdout.reconfigure(encoding='utf-8')

with open('lms.mindx.edu.vn.har', 'r', encoding='utf-8') as f:
    har = json.load(f)

print("Checking ALL lms-api.mindx.vn requests for auth...")
print("="*80)

for i, entry in enumerate(har['log']['entries']):
    req = entry['request']
    resp = entry['response']
    url = req['url']
    
    if 'lms-api.mindx.vn' in url:
        print(f"\n[{i}] {req['method']} {url[:60]}")
        print(f"Response status: {resp['status']}")
        
        print("\nALL request headers:")
        for h in req['headers']:
            name = h['name']
            value = h['value']
            # Show full value for potential auth headers
            if len(value) > 150:
                print(f"  {name}: {value[:150]}...")
            else:
                print(f"  {name}: {value}")
        
        print("\nCookies:", req.get('cookies', []))
        
        post_text = req.get('postData', {}).get('text', '')
        if post_text:
            try:
                body = json.loads(post_text)
                print(f"\nOperation: {body.get('operationName')}")
            except:
                pass
        
        resp_text = resp['content'].get('text', '')
        if resp_text:
            print(f"\nResponse preview: {resp_text[:150]}...")
        
        # Only show first 2 for brevity
        if i > 20:
            break

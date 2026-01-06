import json
import sys
sys.stdout.reconfigure(encoding='utf-8')

with open('base.mindx.edu.vn.har', 'r', encoding='utf-8') as f:
    har = json.load(f)

entries = har['log']['entries']
print(f'Total entries: {len(entries)}')
print('='*80)
print('LOGIN FLOW ANALYSIS - base.mindx.edu.vn')
print('='*80)

for i, entry in enumerate(entries):
    req = entry['request']
    res = entry['response']
    url = req['url']
    method = req['method']
    status = res['status']
    
    # Skip static assets
    if any(x in url for x in ['.js', '.css', '.png', '.jpg', '.svg', '.woff', '.ico', '.gif', '.map', '.json']):
        continue
    
    print(f'\n[Step {i+1}] {method} {url[:100]}')
    print(f'Status: {status}')
    
    if 'postData' in req:
        post_text = req['postData'].get('text', '')
        try:
            post = json.loads(post_text)
            if 'operationName' in post:
                print(f'Operation: {post.get("operationName")}')
                print(f'Variables: {json.dumps(post.get("variables", {}), ensure_ascii=False)[:200]}')
            elif 'email' in post:
                print(f'Login: {post.get("email")} (password hidden)')
            elif 'idToken' in post:
                print('Body: idToken verification')
            else:
                print(f'Body: {post_text[:150]}...')
        except:
            if 'refresh_token' in post_text:
                print('Body: refresh_token request')
            else:
                print(f'Body: {post_text[:150]}')
    
    content = res.get('content', {})
    text = content.get('text', '')
    if text:
        try:
            resp = json.loads(text)
            resp_str = json.dumps(resp, ensure_ascii=False)
            if len(resp_str) > 400:
                print(f'Response: {resp_str[:400]}...')
            else:
                print(f'Response: {resp_str}')
        except:
            print(f'Response: {text[:200]}...' if len(text) > 200 else f'Response: {text}')

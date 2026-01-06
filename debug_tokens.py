import requests
import json
import base64
import sys
sys.stdout.reconfigure(encoding='utf-8')

FIREBASE_API_KEY = "AIzaSyAh2Au-mk5ci-hN83RUBqj1fsAmCMdvJx4"
EMAIL = "ducvubn1@mindx.net.vn"
PASSWORD = "Mindx@2019"

session = requests.Session()

# Step 1: Firebase login
print("Step 1: Firebase login...")
resp = session.post(
    f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={FIREBASE_API_KEY}",
    json={"returnSecureToken": True, "email": EMAIL, "password": PASSWORD, "clientType": "CLIENT_TYPE_WEB"}
)
firebase_token = resp.json().get("idToken")
print(f"Firebase token obtained")

# Decode Firebase token
parts = firebase_token.split('.')
payload = parts[1] + '=' * (4 - len(parts[1]) % 4)
firebase_claims = json.loads(base64.b64decode(payload))
print(f"\nFirebase token claims:")
print(json.dumps(firebase_claims, indent=2, ensure_ascii=False))

# Step 2: loginWithToken
print("\n" + "="*60)
print("Step 2: loginWithToken...")
headers = {
    "Content-Type": "application/json",
    "Origin": "https://base.mindx.edu.vn",
    "Referer": "https://base.mindx.edu.vn/",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
}
resp = session.post(
    "https://base-api.mindx.edu.vn/",
    headers=headers,
    json={
        "operationName": "loginWithToken",
        "variables": {"idToken": firebase_token},
        "query": "mutation loginWithToken($idToken: String!) {\n  loginWithToken(idToken: $idToken)\n}\n"
    }
)
print(f"loginWithToken response: {resp.text}")

# Step 3: GetCustomToken
print("\n" + "="*60)
print("Step 3: GetCustomToken...")
headers["Authorization"] = f"Bearer {firebase_token}"
headers["Origin"] = "https://lms.mindx.edu.vn"
headers["Referer"] = "https://lms.mindx.edu.vn/"
resp = session.post(
    "https://base-api.mindx.edu.vn/",
    headers=headers,
    json={
        "operationName": "GetCustomToken",
        "variables": {},
        "query": "mutation GetCustomToken{users{getCustomToken{customToken}}}"
    }
)
result = resp.json()
custom_token = result.get("data", {}).get("users", {}).get("getCustomToken", {}).get("customToken")
print(f"Custom token obtained")

# Decode custom token
parts = custom_token.split('.')
payload = parts[1] + '=' * (4 - len(parts[1]) % 4)
custom_claims = json.loads(base64.b64decode(payload))
print(f"\nCustom token claims:")
print(json.dumps(custom_claims, indent=2, ensure_ascii=False))

# Step 4: Exchange custom token
print("\n" + "="*60)
print("Step 4: Exchange custom token...")
resp = session.post(
    f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key={FIREBASE_API_KEY}",
    json={"token": custom_token, "returnSecureToken": True}
)
exchanged_token = resp.json().get("idToken")
print(f"Exchanged token obtained")

# Decode exchanged token
parts = exchanged_token.split('.')
payload = parts[1] + '=' * (4 - len(parts[1]) % 4)
exchanged_claims = json.loads(base64.b64decode(payload))
print(f"\nExchanged token claims:")
print(json.dumps(exchanged_claims, indent=2, ensure_ascii=False))

# Step 5: Test with each token on lms-api
print("\n" + "="*60)
print("Step 5: Testing tokens with lms-api...")

# Full browser-like headers from HAR
full_headers = {
    "Accept": "*/*",
    "Accept-Encoding": "gzip, deflate, br, zstd",
    "Accept-Language": "en-US,en;q=0.9,vi;q=0.8,fr-FR;q=0.7,fr;q=0.6",
    "Content-Language": "vi",
    "Content-Type": "application/json",
    "Origin": "https://lms.mindx.edu.vn",
    "Referer": "https://lms.mindx.edu.vn/",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
    "sec-ch-ua": '"Google Chrome";v="143", "Chromium";v="143", "Not A(Brand);v="24"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "cross-site"
}
test_query = {
    "operationName": "GetClassById",
    "variables": {"id": "6901ba9fb1c78219a23f0c34"},
    "query": "query GetClassById($id: ID!) { classesById(id: $id) { id name } }"
}

# Test D: Exchanged token with full headers
print("\nTest D: Exchanged token with full headers")
full_headers["Authorization"] = f"Bearer {exchanged_token}"
resp = session.post("https://lms-api.mindx.vn/", headers=full_headers, json=test_query)
print(f"Status: {resp.status_code}, Response: {resp.text[:200]}")

# Test E: Without Bearer prefix
print("\nTest E: Token without Bearer prefix")
full_headers["Authorization"] = exchanged_token
resp = session.post("https://lms-api.mindx.vn/", headers=full_headers, json=test_query)
print(f"Status: {resp.status_code}, Response: {resp.text[:200]}")

# Test F: No Authorization, rely on session
print("\nTest F: No Authorization header (session only)")
del full_headers["Authorization"]
resp = session.post("https://lms-api.mindx.vn/", headers=full_headers, json=test_query)
print(f"Status: {resp.status_code}, Response: {resp.text[:200]}")

# Test G: x-access-token header instead
print("\nTest G: x-access-token header")
full_headers["x-access-token"] = exchanged_token
resp = session.post("https://lms-api.mindx.vn/", headers=full_headers, json=test_query)
print(f"Status: {resp.status_code}, Response: {resp.text[:200]}")

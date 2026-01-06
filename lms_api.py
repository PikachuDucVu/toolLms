import requests
import json
import sys
import time
import base64
import os

sys.stdout.reconfigure(encoding='utf-8')

# Firebase config
FIREBASE_API_KEY = "AIzaSyAh2Au-mk5ci-hN83RUBqj1fsAmCMdvJx4"
EMAIL = "ducvubn1@mindx.net.vn"
PASSWORD = "Mindx@2019"

# API endpoints
FIREBASE_AUTH_URL = f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={FIREBASE_API_KEY}"
FIREBASE_CUSTOM_TOKEN_URL = f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key={FIREBASE_API_KEY}"
BASE_API_URL = "https://base-api.mindx.edu.vn/"
LMS_API_URL = "https://lms-api.mindx.vn/"

# Token cache file
TOKEN_CACHE_FILE = "token_cache.json"

# Browser headers
BROWSER_HEADERS = {
    "Accept": "*/*",
    "Accept-Language": "en-US,en;q=0.9,vi;q=0.8",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
    "sec-ch-ua": '"Google Chrome";v="143", "Chromium";v="143", "Not A(Brand";v="24"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-site"
}

class LMSClient:
    def __init__(self):
        self.session = requests.Session()
        self.firebase_token = None
        self.lms_token = None
        self.token_expiry = 0
        self.load_cached_token()
    
    def load_cached_token(self):
        """Load token from cache file if exists and not expired"""
        if os.path.exists(TOKEN_CACHE_FILE):
            try:
                with open(TOKEN_CACHE_FILE, 'r') as f:
                    cache = json.load(f)
                
                exp = cache.get('expiry', 0)
                now = int(time.time())
                
                # Check if token is still valid (with 5 min buffer)
                if now < exp - 300:
                    self.lms_token = cache.get('lms_token')
                    self.firebase_token = cache.get('firebase_token')
                    self.token_expiry = exp
                    print(f"Loaded cached token, expires at: {time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(exp))}")
                    return True
                else:
                    print("Cached token expired, will refresh...")
            except Exception as e:
                print(f"Error loading cache: {e}")
        return False
    
    def save_token_cache(self):
        """Save token to cache file"""
        try:
            cache = {
                'lms_token': self.lms_token,
                'firebase_token': self.firebase_token,
                'expiry': self.token_expiry
            }
            with open(TOKEN_CACHE_FILE, 'w') as f:
                json.dump(cache, f)
            print("Token cached to file")
        except Exception as e:
            print(f"Error saving cache: {e}")
    
    def is_token_valid(self):
        """Check if current token is still valid"""
        if not self.lms_token:
            return False
        now = int(time.time())
        return now < self.token_expiry - 60  # 1 min buffer
    
    def login(self, email=None, password=None, firebase_key=None):
        """Login to Firebase and get LMS token"""
        # Use passed params or defaults
        login_email = email or EMAIL
        login_password = password or PASSWORD
        api_key = firebase_key or FIREBASE_API_KEY
        
        firebase_auth_url = f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={api_key}"
        
        # Step 1: Firebase login
        print("Step 1: Logging in to Firebase...")
        payload = {
            "returnSecureToken": True,
            "email": login_email,
            "password": login_password,
            "clientType": "CLIENT_TYPE_WEB"
        }
        
        resp = self.session.post(firebase_auth_url, json=payload)
        if resp.status_code != 200:
            print(f"Firebase login failed: {resp.text}")
            return False, f"Firebase login failed: {resp.text[:100]}"
        
        data = resp.json()
        self.firebase_token = data.get("idToken")
        print(f"Firebase login OK")
        
        # Step 2: Login with token on base-api (establishes session)
        print("Step 2: Calling loginWithToken...")
        headers = {
            **BROWSER_HEADERS,
            "Content-Type": "application/json",
            "Origin": "https://base.mindx.edu.vn",
            "Referer": "https://base.mindx.edu.vn/"
        }
        
        login_query = {
            "operationName": "loginWithToken",
            "variables": {"idToken": self.firebase_token},
            "query": "mutation loginWithToken($idToken: String!) {\n  loginWithToken(idToken: $idToken)\n}\n"
        }
        
        resp = self.session.post(BASE_API_URL, headers=headers, json=login_query)
        if resp.status_code != 200:
            print(f"loginWithToken failed: {resp.text[:100]}")
        
        # Step 3: Get custom token from base-api  
        print("Step 3: Getting custom token from base-api...")
        headers["Origin"] = "https://lms.mindx.edu.vn"
        headers["Referer"] = "https://lms.mindx.edu.vn/"
        headers["Authorization"] = f"Bearer {self.firebase_token}"
        
        custom_token_query = {
            "operationName": "GetCustomToken",
            "variables": {},
            "query": "mutation GetCustomToken{users{getCustomToken{customToken}}}"
        }
        
        resp = self.session.post(BASE_API_URL, headers=headers, json=custom_token_query)
        print(f"GetCustomToken status: {resp.status_code}")
        
        if resp.status_code != 200:
            print(f"GetCustomToken failed: {resp.text}")
            return False, "GetCustomToken failed"
        
        result = resp.json()
        
        # Check for errors
        if "errors" in result:
            print(f"GetCustomToken error: {result['errors']}")
            return False, f"GetCustomToken error: {result['errors'][0].get('message', 'Unknown error')}"
        
        # Extract custom token
        custom_token = result.get("data", {}).get("users", {}).get("getCustomToken", {}).get("customToken")
        
        if not custom_token:
            print(f"No custom token in response: {json.dumps(result)[:200]}")
            return False, "No custom token in response"
        
        print(f"Got custom token, exchanging...")
        
        # Exchange custom token for ID token
        exchange_url = f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key={api_key}"
        resp = self.session.post(exchange_url, json={"token": custom_token, "returnSecureToken": True})
        if resp.status_code != 200:
            print(f"Token exchange failed: {resp.text}")
            return False, "Token exchange failed"
        
        self.lms_token = resp.json().get("idToken")
        
        # Parse token to get expiry
        payload_part = self.lms_token.split('.')[1]
        payload_part += '=' * (4 - len(payload_part) % 4)
        token_data = json.loads(base64.b64decode(payload_part))
        self.token_expiry = token_data.get('exp', 0)
        
        print(f"Login successful! Token expires at: {time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(self.token_expiry))}")
        
        # Save to cache
        self.save_token_cache()
        return True, "Đăng nhập thành công!"
    
    def ensure_token(self):
        """Ensure we have a valid token, refresh if needed"""
        if self.is_token_valid():
            return True
        print("Token invalid or expired, refreshing...")
        success, _ = self.login()
        return success
    
    def call_api(self, operation_name, query, variables=None):
        """Call LMS GraphQL API with auto token refresh"""
        if not self.ensure_token():
            return {"error": "Failed to get token"}
        
        headers = {
            **BROWSER_HEADERS,
            "Content-Type": "application/json",
            "Authorization": self.lms_token,  # NO "Bearer " prefix!
            "Origin": "https://lms.mindx.edu.vn",
            "Referer": "https://lms.mindx.edu.vn/"
        }
        
        payload = {
            "operationName": operation_name,
            "variables": variables or {},
            "query": query
        }
        
        resp = self.session.post(LMS_API_URL, headers=headers, json=payload)
        
        # If error, try refresh token once
        if resp.status_code == 403 or (resp.status_code == 200 and "INVALID_TOKEN" in resp.text):
            print("Token rejected, refreshing...")
            self.lms_token = None
            if self.login():
                headers["Authorization"] = self.lms_token
                resp = self.session.post(LMS_API_URL, headers=headers, json=payload)
        
        try:
            return resp.json()
        except:
            return {"error": resp.text, "status": resp.status_code}


# Pre-defined queries
QUERIES = {
    "FindAllWithClass": """query FindAllWithClass($payload: StudentMakeupCommentFilterWithClassInput) {
  findAllWithClass(payload: $payload) {
    id classId sessionId classSiteId classMakeupId sessionMakeupId classSiteMakeupId
    status studentId content sendCommentStatus
    commentStatus { status version feedback }
    attendance { attendanceId status }
    commentByAreas { commentAreaId grade content }
  }
}""",
    
    "findAllStudentWorks": """query findAllStudentWorks($classSessionId: String, $classId: String, $classIds: [String]) {
  findAllStudentWorks(classSessionId: $classSessionId, classId: $classId, classIds: $classIds) {
    data {
      id studentId classId classSessionId studentMakeupId classMakeupSessionId displayOrder
      latestData { title thumbnail videoUrls imageUrl attachmentUrls comment rejectReason }
      createdBy { displayName }
    }
  }
}""",
    
    "GetClasses": """query GetClasses($search: String, $pageIndex: Int!, $itemsPerPage: Int!, $orderBy: String) {
  classes(payload: {filter_textSearch: $search, pageIndex: $pageIndex, itemsPerPage: $itemsPerPage, orderBy: $orderBy}) {
    data { id name level course { id name shortName } status }
    pagination { type total }
  }
}""",

    "GetClassById": """query GetClassById($id: ID!) {
  classesById(id: $id) {
    id name level rejectNote
    course { id name shortName isActive numberOfSession sessionHour }
    slots { _id classRole { id name shortName } teacher { fullName } quantity }
    sessions { _id sessionIndex startTime endTime status }
    students { _id student { id fullName code phoneNumber email } }
  }
}"""
}


if __name__ == "__main__":
    client = LMSClient()
    
    print("="*80)
    print("Testing LMS API")
    print("="*80)
    
    # Simple test query - just get basic class info
    print("\n[Test 1] Simple GetClassById")
    simple_query = """query GetClassById($id: ID!) {
  classesById(id: $id) {
    id
    name
    level
  }
}"""
    result = client.call_api("GetClassById", simple_query, {"id": "6901ba9fb1c78219a23f0c34"})
    print(json.dumps(result, indent=2, ensure_ascii=False))
    
    # Test 2: FindAllWithClass
    print("\n[Test 2] FindAllWithClass")
    result = client.call_api("FindAllWithClass", QUERIES["FindAllWithClass"], {
        "payload": {
            "sessionId": "6901bad23b4cfc001202517d",
            "classId": "6901ba9fb1c78219a23f0c34"
        }
    })
    print(json.dumps(result, indent=2, ensure_ascii=False))

import requests
import json
import sys
import time
import base64
sys.stdout.reconfigure(encoding='utf-8')

TOKEN = "eyJhbGciOiJSUzI1NiIsImtpZCI6Ijk4OGQ1YTM3OWI3OGJkZjFlNTBhNDA5MTEzZjJiMGM3NWU0NTJlNDciLCJ0eXAiOiJKV1QifQ.eyJuYW1lIjoiVHLhuqduIMSQ4bupYyBWxakiLCJpZCI6IjYzMjNmYjc5ODE2YmZmMjVhYmZlYWYxZSIsInVzZXJuYW1lIjoiZHVjdnVibjEiLCJpc3MiOiJodHRwczovL3NlY3VyZXRva2VuLmdvb2dsZS5jb20vbWluZHgtZWR1LXByb2QiLCJhdWQiOiJtaW5keC1lZHUtcHJvZCIsImF1dGhfdGltZSI6MTc2NjM5ODg5MCwidXNlcl9pZCI6IlJ4dzdHVjBObWZRa3FVWFVNb2tJQlM0NU90MDIiLCJzdWIiOiJSeHc3R1YwTm1mUWtxVVhVTW9rSUJTNDVPdDAyIiwiaWF0IjoxNzY2Mzk4ODkwLCJleHAiOjE3NjY0MDI0OTAsImVtYWlsIjoiZHVjdnVibjFAbWluZHgubmV0LnZuIiwiZW1haWxfdmVyaWZpZWQiOnRydWUsInBob25lX251bWJlciI6Iis4NDk3MTQ3MDY2MCIsImZpcmViYXNlIjp7ImlkZW50aXRpZXMiOnsiZW1haWwiOlsiZHVjdnVibjFAbWluZHgubmV0LnZuIl0sInBob25lIjpbIis4NDk3MTQ3MDY2MCJdfSwic2lnbl9pbl9wcm92aWRlciI6ImN1c3RvbSJ9fQ.cyk8PeUuhvgzqWEa6VC1C86cDshYaFmzjlxEZFtYBx5O2pKKeZxUsMwxOopS6Dc_S1mSA_FSxTwMv01G6U1wLEF4vUnr21zKw6O3_miHKTry95HSytob8rnptHbWO7CDvJ-jXamuP6aifNTKqCBna68IIhbPELweuzHkxSPEwLy9srIaxwftsH_NWUWMujUCppxmReh0rLDXbqSHyC8NAWu7-KFr6bpoXjOLKBRhdUyFqMFYUX5KjqHy42QfI69otUcHYKG1wUrmaLHelfWuTNsz4VIexetc2l0oZRb-QFgw0Phq3Gtf9bulJLfDotAX6Qq4EojFj8Wfo6WmRztFzQ"

# Check token expiry
payload_part = TOKEN.split('.')[1]
payload_part += '=' * (4 - len(payload_part) % 4)
token_data = json.loads(base64.b64decode(payload_part))
exp = token_data.get('exp', 0)
now = int(time.time())
print(f"Token exp: {exp}, Now: {now}, Expired: {now > exp}")

URL = "https://lms-api.mindx.vn/"

headers = {
    "Content-Type": "application/json",
    "Authorization": f"Bearer {TOKEN}"
}

# Test 1: FindAllWithClass
print("=" * 80)
print("API 1: FindAllWithClass")
print("=" * 80)

payload1 = {
    "operationName": "FindAllWithClass",
    "variables": {
        "payload": {
            "sessionId": "6901bad23b4cfc001202517d",
            "classId": "6901ba9fb1c78219a23f0c34"
        }
    },
    "query": """query FindAllWithClass($payload: StudentMakeupCommentFilterWithClassInput) {
  findAllWithClass(payload: $payload) {
    id
    classId
    sessionId
    classSiteId
    classMakeupId
    sessionMakeupId
    classSiteMakeupId
    status
    studentId
    content
    sendCommentStatus
    commentStatus {
      status
      version
      feedback
    }
    attendance {
      attendanceId
      status
    }
    commentByAreas {
      commentAreaId
      grade
      content
    }
  }
}"""
}

resp1 = requests.post(URL, headers=headers, json=payload1)
print(f"Status: {resp1.status_code}")
try:
    print(f"Response:\n{json.dumps(resp1.json(), indent=2, ensure_ascii=False)}")
except:
    print(f"Raw Response: {resp1.text}")

# Test 2: findAllStudentWorks
print("\n" + "=" * 80)
print("API 2: findAllStudentWorks")
print("=" * 80)

payload2 = {
    "operationName": "findAllStudentWorks",
    "variables": {
        "classSessionId": "6901bad23b4cfc001202517d",
        "classId": "6901ba9fb1c78219a23f0c34"
    },
    "query": """query findAllStudentWorks($studentId: String, $classSessionId: String, $classId: String, $classIds: [String]) {
  findAllStudentWorks(studentId: $studentId, classSessionId: $classSessionId, classId: $classId, classIds: $classIds) {
    data {
      id
      studentId
      classId
      classSessionId
      studentMakeupId
      classMakeupSessionId
      displayOrder
      latestData {
        title
        thumbnail
        videoUrls
        imageUrl
        attachmentUrls
        comment
        rejectReason
        relatedUrls {
          name
          url
        }
      }
      createdBy {
        displayName
      }
    }
  }
}"""
}

resp2 = requests.post(URL, headers=headers, json=payload2)
print(f"Status: {resp2.status_code}")
try:
    print(f"Response:\n{json.dumps(resp2.json(), indent=2, ensure_ascii=False)}")
except:
    print(f"Raw Response: {resp2.text}")

import requests
url = "http://127.0.0.1:8000/api/extract-pos-data"
files = {'files': ('dummy.pdf', b'dummy content', 'application/pdf')}
headers = {'Authorization': 'Bearer local_bypass_token'}
try:
    response = requests.post(url, files=files, headers=headers)
    print(response.status_code)
    print(response.text)
except Exception as e:
    print("Error:", e)

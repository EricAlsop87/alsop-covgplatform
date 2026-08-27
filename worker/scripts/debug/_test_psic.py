import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from dotenv import load_dotenv
load_dotenv()
from src.supabase_client import get_supabase
sb = get_supabase()

# Download the MARK ADAMS PDF
doc = sb.table('platform_documents').select('storage_path, bucket').eq('id', 'b118b5ef-fe8e-4dff-a7b3-8ce5c62c5e5d').single().execute()
d = doc.data
print(f"Downloading from {d['bucket']}/{d['storage_path']}")
pdf_bytes = sb.storage.from_(d['bucket']).download(d['storage_path'])
print(f"Downloaded {len(pdf_bytes)} bytes")

# Test pdfplumber
import pdfplumber
with pdfplumber.open_from_bytes(pdf_bytes) as pdf:
    print(f"Pages: {len(pdf.pages)}")
    for i, page in enumerate(pdf.pages):
        text = page.extract_text() or ""
        print(f"  Page {i+1}: {len(text)} chars")
        if text:
            print(f"    First 200 chars: {text[:200]}")

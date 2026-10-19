"""Generate and decode-check the QR for the verified deployment URL.
Tool-only dependencies: qrcode, pillow, zxing-cpp (not used by the web app).
"""
from pathlib import Path
import sys
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / '.deploy' / 'qr-deps'))
import qrcode
from PIL import Image
import zxingcpp

url = (ROOT / 'presentation' / 'url.txt').read_text(encoding='utf-8').strip()
if not url.startswith('https://'):
    raise ValueError('Use a verified public HTTPS deployment URL')
qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=24, border=4)
qr.add_data(url)
qr.make(fit=True)
output = ROOT / 'presentation' / 'your-type-qr.png'
qr.make_image(fill_color='black', back_color='white').save(output)
decoded = zxingcpp.read_barcode(Image.open(output))
if decoded is None or decoded.text != url:
    raise ValueError('QR decode does not match the deployment URL')
print(f'PASS QR PNG decoded to {decoded.text} / {Image.open(output).size}')

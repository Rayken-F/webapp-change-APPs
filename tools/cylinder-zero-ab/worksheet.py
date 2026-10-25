"""Produce a three-page paired handwriting worksheet; never an OCR sample."""
import argparse
import json
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

parser = argparse.ArgumentParser()
parser.add_argument('--font', required=True)
parser.add_argument('--output', required=True)
args = parser.parse_args()
cases = json.loads(Path(__file__).with_name('cases.json').read_text(encoding='utf-8'))
target = Path(args.output)
if target.exists():
    raise SystemExit('Output already exists; choose a new path.')
target.parent.mkdir(parents=True, exist_ok=True)
pdfmetrics.registerFont(TTFont('TC', args.font, subfontIndex=0))
doc = canvas.Canvas(str(target), pagesize=A4)
doc.setTitle('普通 0 與斜線 0 手寫對照測試')
doc.setAuthor('CG')
width, height = A4


def text(x, y, value, size=11):
    doc.setFont('TC', size)
    doc.drawString(x * mm, height - y * mm, value)


def footer(page):
    text(15, 284, cases['id'] + '  |  ' + str(page) + ' / 3', 8)
    doc.showPage()


text(15, 19, '普通 0 / 斜線 0：手寫對照測試', 19)
text(15, 29, '同一組編號寫兩次，只改數字 0 的寫法。', 11)
instructions = [
    '1. 參照下表，在後面 A、B 兩頁各填 16 組完整 CTN 與鋼號。',
    '2. A 頁：數字 0 不畫線。B 頁：數字 0 畫穿線；字母 O 不畫線。',
    '3. 同一人、同一支筆、相近字體大小；其他字保持原來寫法。',
    '4. 第 1-8 列先寫 A 再 B；第 9-16 列先寫 B 再 A。',
    '5. 各拍一張正面、清楚、完整原圖。回傳照片即可，CG 負責辨識。',
]
for i, line in enumerate(instructions):
    text(15, 40 + 6 * i, line, 10)
text(15, 77, '參照表（這一頁不用拍攝；全部為測試用文字）', 11)
left, top, row_h = 15, 82, 8.8
columns = [15, 28, 83, 143, 195]
for x in columns:
    doc.line(x * mm, height - top * mm, x * mm, height - (top + 17 * row_h) * mm)
for i in range(18):
    y = height - (top + i * row_h) * mm
    doc.line(left * mm, y, 195 * mm, y)
for x, value in zip(columns, ['列', '完整 CTN', '完整鋼號', 'CTN 字母 O 的位置']):
    text(x + 2, top + 6, value, 9)
for i, row in enumerate(cases['rows']):
    y = top + (i + 1) * row_h + 6
    text(17, y, str(i + 1), 10)
    for x, field in [(30, 'ctn'), (85, 'steel')]:
        doc.setFont('Courier', 12)
        doc.drawString(x * mm, height - y * mm, row[field])
    letters = [str(j + 1) for j, char in enumerate(row['ctn']) if char == 'O']
    text(145, y, '第 ' + '、'.join(letters) + ' 碼' if letters else '無', 9)
text(15, 241, 'CTN 第 3、4 碼都是數字。表格最後一欄僅協助區分字母 O。', 10)
text(15, 249, '拍前確認抄寫正確；保留整張紙與四邊，勿加濾鏡或截圖。', 10)
text(15, 257, '只測辨識，不輸入正式註冊系統。沒有改用雲端辨識。', 10)
text(15, 265, '列印 A4、實際大小。無法列印時，可使用相同 16 列的現場空白表。', 9)
footer(1)

for page, style in [(2, 'A'), (3, 'B')]:
    text(15, 18, '鋼瓶註冊辨識測試 - ' + style, 19)
    text(15, 28, '數字 0 不畫線；字母 O 不畫線。' if style == 'A' else '數字 0 畫穿線；字母 O 不畫線。', 12)
    text(15, 37, '書寫人代號：________   日期：________   依第 1 頁參照表填寫', 10)
    columns = [15, 37, 99, 173, 195]
    top, header_h, row_h = 44, 20, 12
    bottom = top + header_h + 16 * row_h
    for x in columns:
        doc.line(x * mm, height - top * mm, x * mm, height - bottom * mm)
    for y in [top] + [top + header_h + i * row_h for i in range(17)]:
        doc.line(15 * mm, height - y * mm, 195 * mm, height - y * mm)
    for x, value in zip(columns, ['RT / 列', 'CTN', '鋼瓶鋼號', '其他']):
        text(x + 2, top + 8, value, 10)
    for i in range(16):
        text(18, top + header_h + i * row_h + 8, str(i + 1), 10)
    text(15, 266, '完整填寫 CTN / 鋼號；RT 與其他欄不用填。不要只寫尾碼。', 10)
    text(15, 274, '拍這一頁完整原圖，標示 ' + style + '。不需先上傳 DEMO 或人工修改候選。', 9)
    footer(page)
doc.save()

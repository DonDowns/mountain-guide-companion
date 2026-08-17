#!/usr/bin/env python3
import json
import sys
from pathlib import Path

from reportlab.lib.colors import Color, HexColor, white
from reportlab.lib.pagesizes import letter
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas


PAGE_WIDTH, PAGE_HEIGHT = letter
MARGIN = 38
FOOTER_TOP = 52
INK = HexColor('#18222b')
TEAL = HexColor('#163d46')
GOLD = HexColor('#a96f12')
EARTH = HexColor('#66503c')
BORDER = HexColor('#60706f')
STONE = HexColor('#e8dfcf')
PALE = HexColor('#f7f5ef')
EMERGENCY = HexColor('#8b281f')


def wrap_lines(text, font, size, width):
    output = []
    for paragraph in str(text).split('\n'):
        words = paragraph.split()
        if not words:
            output.append('')
            continue
        line = words[0]
        for word in words[1:]:
            candidate = line + ' ' + word
            if stringWidth(candidate, font, size) <= width:
                line = candidate
            else:
                output.append(line)
                line = word
        output.append(line)
    return output


def draw_text(pdf, text, x, y, width, font='Helvetica', size=10.2, leading=None, color=INK, max_lines=None):
    leading = leading or size * 1.24
    lines = wrap_lines(text, font, size, width)
    if max_lines is not None and len(lines) > max_lines:
        raise ValueError(f'Text exceeds designed line count ({len(lines)} > {max_lines}): {text}')
    pdf.setFillColor(color)
    pdf.setFont(font, size)
    for line in lines:
        pdf.drawString(x, y, line)
        y -= leading
    return y


def draw_centered(pdf, text, x, y, width, font='Helvetica-Bold', size=10, color=INK):
    pdf.setFont(font, size)
    pdf.setFillColor(color)
    pdf.drawCentredString(x + width / 2, y, text)


def box(pdf, x, y_top, width, height, fill=white, stroke=BORDER, line_width=1.1, radius=4):
    pdf.setLineWidth(line_width)
    pdf.setStrokeColor(stroke)
    pdf.setFillColor(fill)
    pdf.roundRect(x, y_top - height, width, height, radius, stroke=1, fill=1)


def section_heading(pdf, text, x, y, size=16):
    pdf.setFillColor(TEAL)
    pdf.setFont('Helvetica-Bold', size)
    pdf.drawString(x, y, text)
    return y - size * 1.2


def draw_header(pdf, model, page_number, title, subtitle):
    pdf.setFillColor(EARTH)
    pdf.setFont('Helvetica-Bold', 9)
    pdf.drawString(MARGIN, PAGE_HEIGHT - 35, f'PRINTABLE FIELD GUIDE | PAGE {page_number}')
    pdf.setFillColor(TEAL)
    pdf.setFont('Helvetica-Bold', 18)
    pdf.drawString(MARGIN, PAGE_HEIGHT - 57, title)
    pdf.setFillColor(INK)
    pdf.setFont('Helvetica-Bold', 10.5)
    pdf.drawString(MARGIN, PAGE_HEIGHT - 75, subtitle)
    pdf.setStrokeColor(TEAL)
    pdf.setLineWidth(2.5)
    pdf.line(MARGIN, PAGE_HEIGHT - 84, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 84)
    pdf.setStrokeColor(GOLD)
    pdf.line(MARGIN, PAGE_HEIGHT - 84, MARGIN + 72, PAGE_HEIGHT - 84)


def draw_footer(pdf, model, page_number):
    p = model['provenance']
    pdf.setStrokeColor(BORDER)
    pdf.setLineWidth(0.7)
    pdf.line(MARGIN, FOOTER_TOP, PAGE_WIDTH - MARGIN, FOOTER_TOP)
    pdf.setFillColor(TEAL)
    pdf.setFont('Helvetica-Bold', 7.4)
    pdf.drawString(MARGIN, 40, f"{p['product']} | Trip Data v{p['dataVersion']} | Based on Mountain Guide {p['sourceRelease']}")
    pdf.setFillColor(INK)
    pdf.setFont('Helvetica', 7.2)
    pdf.drawString(MARGIN, 29, f"Generated: {p['generatedDate']} | Last verified: {p['verifiedDate']} | Manifest: {p['manifestShort']}... | DRAFT | Page {page_number} of 3")


def draw_timeline_card(pdf, item, x, y_top, width, height):
    box(pdf, x, y_top, width, height, fill=PALE)
    pdf.setStrokeColor(GOLD)
    pdf.setLineWidth(2)
    pdf.line(x + 4, y_top, x + 54, y_top)
    y = y_top - 16
    y = draw_text(pdf, f"{item['role'].upper()} | {item['plannedDate']}", x + 10, y, width - 20, 'Helvetica-Bold', 9.0, color=EARTH, max_lines=1)
    y -= 2
    y = draw_text(pdf, item['name'], x + 10, y, width - 20, 'Helvetica-Bold', 12, 14, color=TEAL, max_lines=2)
    for entry in item['times']:
        y -= 2
        pdf.setFont('Helvetica-Bold', 11.5)
        pdf.setFillColor(INK)
        pdf.drawString(x + 10, y, entry['value'])
        y = draw_text(pdf, entry['label'], x + 88, y, width - 98, 'Helvetica-Bold', 9.4, 11.2, max_lines=2)
        y -= 1
        y = draw_text(pdf, entry['note'], x + 10, y, width - 20, 'Helvetica', 9.2, 11.0, color=INK, max_lines=3)
    if y < y_top - height + 8:
        raise ValueError(f"Timeline card overflow: {item['name']}")


def page_one(pdf, model):
    draw_header(pdf, model, 1, model['trip']['name'], model['trip']['dateRange'])
    box(pdf, MARGIN, 696, PAGE_WIDTH - 2 * MARGIN, 30, fill=STONE, stroke=TEAL, line_width=1.8)
    draw_centered(pdf, f"{model['weatherRule']} {model['actualConditionsRule']}", MARGIN + 6, 677, PAGE_WIDTH - 2 * MARGIN - 12, size=10.4, color=TEAL)

    left_x = MARGIN
    left_w = 334
    right_x = left_x + left_w + 14
    right_w = PAGE_WIDTH - MARGIN - right_x
    section_heading(pdf, 'Operational Timeline', left_x, 645)
    card_top = 620
    heights = [142, 148, 142]
    for item, height in zip(model['timeline'], heights):
        draw_timeline_card(pdf, item, left_x, card_top, left_w, height)
        card_top -= height + 8
    box(pdf, left_x, card_top, left_w, 72, fill=STONE, stroke=TEAL, line_width=1.5)
    draw_text(pdf, model['planningRule'], left_x + 10, card_top - 16, left_w - 20, 'Helvetica-Bold', 9.6, 12, color=TEAL, max_lines=5)

    section_heading(pdf, 'Decision Gates', right_x, 645)
    box(pdf, right_x, 620, right_w, 348, fill=PALE)
    y = 602
    for prompt in model['decisionGates']:
        pdf.setFillColor(GOLD)
        pdf.circle(right_x + 10, y + 2, 2.2, stroke=0, fill=1)
        y = draw_text(pdf, prompt, right_x + 18, y, right_w - 28, 'Helvetica', 9.2, 11.3, max_lines=8)
        y -= 7
    if y < 281:
        raise ValueError('Decision Gates overflow')

    box(pdf, right_x, 260, right_w, 174, fill=STONE, stroke=TEAL, line_width=1.4)
    y = section_heading(pdf, 'Field weather record', right_x + 10, 241, size=11.5)
    y = draw_text(pdf, model['weatherLog']['refreshLabel'], right_x + 10, y, right_w - 20, 'Helvetica-Bold', 9.3, max_lines=2)
    pdf.setStrokeColor(INK)
    pdf.line(right_x + 10, y - 2, right_x + right_w - 10, y - 2)
    y -= 17
    y = draw_text(pdf, model['weatherLog']['observationLabel'], right_x + 10, y, right_w - 20, 'Helvetica-Bold', 9.3, max_lines=2)
    pdf.line(right_x + 10, y - 2, right_x + right_w - 10, y - 2)
    y -= 18
    draw_text(pdf, model['weatherLog']['warning'], right_x + 10, y, right_w - 20, 'Helvetica-Bold', 9.1, 11, color=TEAL, max_lines=5)
    draw_footer(pdf, model, 1)
    pdf.showPage()


def draw_route_card(pdf, route, x, y_top, width, height):
    box(pdf, x, y_top, width, height, fill=PALE)
    pdf.setStrokeColor(TEAL)
    pdf.setLineWidth(2)
    pdf.line(x + 4, y_top, x + 54, y_top)
    y = y_top - 15
    y = draw_text(pdf, route['objective'].upper(), x + 10, y, width - 20, 'Helvetica-Bold', 9.0, color=EARTH, max_lines=1)
    y = draw_text(pdf, route['name'], x + 10, y - 1, width - 20, 'Helvetica-Bold', 11, 13, color=TEAL, max_lines=2)
    y -= 2
    metrics = f"{route['distance']} {route['distanceScope']} | {route['gain']} gain"
    y = draw_text(pdf, metrics, x + 10, y, width - 20, 'Helvetica-Bold', 10.2, 12, max_lines=2)
    y = draw_text(pdf, f"{route['difficulty']} | {route['exposure']} exposure", x + 10, y, width - 20, 'Helvetica-Bold', 9.7, 11.5, max_lines=2)
    y -= 2
    if route['fieldNote']:
        y = draw_text(pdf, route['fieldNote'], x + 10, y, width - 20, 'Helvetica-Bold', 9.0, 10.5, color=TEAL, max_lines=3)
        y -= 1
    y = draw_text(pdf, 'Return consideration: ' + route['returnConsiderations'], x + 10, y, width - 20, 'Helvetica', 9.0, 10.7, max_lines=4)
    if y < y_top - height + 7:
        raise ValueError(f"Route card overflow: {route['name']}")


def page_two(pdf, model):
    draw_header(pdf, model, 2, 'Route Profile Summary', 'Schematic comparison - not navigation-grade geometry')
    card_width = (PAGE_WIDTH - 2 * MARGIN - 12) / 2
    positions = [
        (MARGIN, 694), (MARGIN + card_width + 12, 694),
        (MARGIN, 542), (MARGIN + card_width + 12, 542)
    ]
    for route, (x, y) in zip(model['routes'], positions):
        draw_route_card(pdf, route, x, y, card_width, 140)

    left_x = MARGIN
    left_w = 300
    right_x = left_x + left_w + 14
    right_w = PAGE_WIDTH - MARGIN - right_x
    box(pdf, left_x, 394, left_w, 112, fill=STONE)
    y = section_heading(pdf, 'Cumulative gain comparison', left_x + 10, 376, size=11.5)
    maximum = max(route['gainValue'] for route in model['routes'])
    for route in model['routes']:
        label = f"{route['name']} - {route['gain']}"
        y = draw_text(pdf, label, left_x + 10, y, left_w - 20, 'Helvetica-Bold', 9.0, 10.2, max_lines=1)
        bar_width = (left_w - 20) * route['gainValue'] / maximum
        pdf.setFillColor(EARTH)
        pdf.rect(left_x + 10, y - 1, bar_width, 6, stroke=0, fill=1)
        pdf.setStrokeColor(BORDER)
        pdf.rect(left_x + 10, y - 1, left_w - 20, 6, stroke=1, fill=0)
        y -= 13

    box(pdf, left_x, 272, left_w, 202, fill=white)
    y = section_heading(pdf, 'Canonical reference points', left_x + 10, 254, size=11.5)
    for point in model['referencePoints']:
        y = draw_text(pdf, f"{point['name']} | {point['coordinate']} | {point['elevation']}", left_x + 10, y, left_w - 20, 'Helvetica-Bold', 9.1, 10.6, max_lines=2)
        if point['name'] == 'Lake Como area':
            y = draw_text(pdf, point['context'], left_x + 10, y, left_w - 20, 'Helvetica', 9.0, 10.2, color=EARTH, max_lines=3)
        y -= 3
    y = draw_text(pdf, f"{model['lilyLake']['name']}: {model['lilyLake']['holdText']}", left_x + 10, y, left_w - 20, 'Helvetica-Bold', 9.1, 10.7, color=TEAL, max_lines=3)
    if y < 78:
        raise ValueError('Reference point box overflow')

    box(pdf, right_x, 394, right_w, 220, fill=STONE, stroke=TEAL, line_width=1.5)
    y = section_heading(pdf, 'Mount Lindsey access', right_x + 10, 376, size=12)
    y = draw_text(pdf, model['access']['fact'], right_x + 10, y, right_w - 20, 'Helvetica-Bold', 9.1, 11, color=TEAL, max_lines=5)
    y -= 4
    y = draw_text(pdf, model['access']['restrictions'], right_x + 10, y, right_w - 20, 'Helvetica', 9.0, 10.7, max_lines=9)
    y -= 4
    y = draw_text(pdf, model['access']['recheck'], right_x + 10, y, right_w - 20, 'Helvetica-Bold', 9.0, 10.7, max_lines=6)
    y -= 4
    y = draw_text(pdf, model['access']['noGrant'], right_x + 10, y, right_w - 20, 'Helvetica-Bold', 9, 10.8, color=TEAL, max_lines=3)
    if y < 183:
        raise ValueError('Mount Lindsey access box overflow')

    box(pdf, right_x, 162, right_w, 92, fill=PALE)
    y = section_heading(pdf, 'Return considerations', right_x + 10, 144, size=11.5)
    draw_text(pdf, 'Use the known route return represented in each canonical route profile. Do not infer shortcuts, alternate descents, water sources, shelters, or undocumented return options from this summary.', right_x + 10, y, right_w - 20, 'Helvetica', 9.0, 10.8, max_lines=7)
    draw_footer(pdf, model, 2)
    pdf.showPage()


def draw_contact_card(pdf, contact, x, y_top, width, height):
    box(pdf, x, y_top, width, height, fill=PALE)
    y = y_top - 16
    y = draw_text(pdf, contact['shortName'], x + 8, y, width - 16, 'Helvetica-Bold', 11.5, 13, color=TEAL, max_lines=2)
    for phone in contact['phones']:
        y = draw_text(pdf, f"{phone['label']}: {phone['value']}", x + 8, y - 1, width - 16, 'Helvetica-Bold', 9.2, 10.8, max_lines=2)
    y -= 2
    y = draw_text(pdf, contact['context'], x + 8, y, width - 16, 'Helvetica', 9.0, 10.2, max_lines=6)
    y = draw_text(pdf, 'Verified: ' + contact['verified'], x + 8, y - 1, width - 16, 'Helvetica-Bold', 9.0, 10.2, color=EARTH, max_lines=2)
    if y < y_top - height + 6:
        raise ValueError(f"Contact card overflow: {contact['shortName']}")


def page_three(pdf, model):
    draw_header(pdf, model, 3, 'Emergency + Communication', model['trip']['name'])
    box(pdf, MARGIN, 696, PAGE_WIDTH - 2 * MARGIN, 44, fill=EMERGENCY, stroke=INK, line_width=3, radius=2)
    draw_centered(pdf, model['emergency']['headline'], MARGIN, 668, PAGE_WIDTH - 2 * MARGIN, size=24, color=white)

    box(pdf, MARGIN, 642, PAGE_WIDTH - 2 * MARGIN, 92, fill=STONE, stroke=TEAL, line_width=1.5)
    y = 625
    y = draw_text(pdf, 'Give:', MARGIN + 10, y, 38, 'Helvetica-Bold', 10.5, 12, color=TEAL, max_lines=1)
    give_text = ' '.join(model['emergency']['sequence'][1:3])
    y = draw_text(pdf, give_text, MARGIN + 50, 625, PAGE_WIDTH - 2 * MARGIN - 60, 'Helvetica-Bold', 9.5, 11.8, max_lines=4)
    y -= 2
    y = draw_text(pdf, model['emergency']['jurisdiction'], MARGIN + 10, y, PAGE_WIDTH - 2 * MARGIN - 20, 'Helvetica-Bold', 9.4, 11.5, color=TEAL, max_lines=2)
    draw_text(pdf, model['emergency']['countyChoice'], MARGIN + 10, y, PAGE_WIDTH - 2 * MARGIN - 20, 'Helvetica', 9.3, 11.2, max_lines=2)

    contact_gap = 8
    contact_width = (PAGE_WIDTH - 2 * MARGIN - 2 * contact_gap) / 3
    for index, contact in enumerate(model['contacts']):
        draw_contact_card(pdf, contact, MARGIN + index * (contact_width + contact_gap), 536, contact_width, 142)

    left_x = MARGIN
    left_w = 320
    right_x = left_x + left_w + 14
    right_w = PAGE_WIDTH - MARGIN - right_x
    y = section_heading(pdf, 'Communication field log', left_x, 374, size=13)
    table_top = y + 2
    row_height = 19
    col1 = 188
    col2 = 58
    col3 = left_w - col1 - col2
    pdf.setFillColor(STONE)
    pdf.rect(left_x, table_top - row_height, left_w, row_height, stroke=1, fill=1)
    pdf.setFillColor(INK)
    pdf.setFont('Helvetica-Bold', 9.0)
    pdf.drawString(left_x + 5, table_top - 13, 'Milestone')
    pdf.drawString(left_x + col1 + 5, table_top - 13, 'Time')
    pdf.drawString(left_x + col1 + col2 + 5, table_top - 13, 'Status / initials')
    pdf.setLineWidth(0.6)
    for index, milestone in enumerate(model['communication']['milestones']):
        top = table_top - row_height * (index + 1)
        bottom = top - row_height
        pdf.setFillColor(white)
        pdf.rect(left_x, bottom, left_w, row_height, stroke=1, fill=1)
        pdf.rect(left_x + 5, bottom + 5, 9, 9, stroke=1, fill=0)
        pdf.setFillColor(INK)
        pdf.setFont('Helvetica', 9.0)
        pdf.drawString(left_x + 19, bottom + 6, milestone)
        pdf.line(left_x + col1, bottom, left_x + col1, top)
        pdf.line(left_x + col1 + col2, bottom, left_x + col1 + col2, top)
    table_bottom = table_top - row_height * 10
    draw_text(pdf, model['communication']['draftBehavior'], left_x, table_bottom - 13, left_w, 'Helvetica-Bold', 9.0, 10.5, color=TEAL, max_lines=5)

    personal_box_bottom = 210
    box(pdf, right_x, 374, right_w, 374 - personal_box_bottom, fill=PALE)
    y = section_heading(pdf, 'Personal contact', right_x + 10, 356, size=11.5)
    for label in ['Name:', 'Phone:', 'Alternate:']:
        y = draw_text(pdf, label, right_x + 10, y, right_w - 20, 'Helvetica-Bold', 9.2, max_lines=1)
        pdf.setStrokeColor(INK)
        pdf.line(right_x + 10, y - 2, right_x + right_w - 10, y - 2)
        y -= 14
    y = draw_text(pdf, 'Optional medical / personal notes', right_x + 10, y, right_w - 20, 'Helvetica-Bold', 9.1, 10.8, max_lines=2)
    for _ in range(2):
        pdf.line(right_x + 10, y - 2, right_x + right_w - 10, y - 2)
        y -= 16
    y = draw_text(pdf, model['personal']['completion'], right_x + 10, y, right_w - 20, 'Helvetica-Bold', 9.0, 10.4, color=TEAL, max_lines=2)
    if y + 10.4 < personal_box_bottom + 2:
        raise ValueError('Personal contact box overflow')

    weather_box_top = 198
    weather_box_bottom = 96
    box(pdf, right_x, weather_box_top, right_w, weather_box_top - weather_box_bottom, fill=STONE)
    y = section_heading(pdf, 'Weather / staleness', right_x + 10, 181, size=11.2)
    for label in [model['weatherLog']['refreshLabel'], model['weatherLog']['observationLabel']]:
        y = draw_text(pdf, label, right_x + 10, y, right_w - 20, 'Helvetica-Bold', 9.0, 10.4, max_lines=2)
        pdf.line(right_x + 10, y - 2, right_x + right_w - 10, y - 2)
        y -= 12
    y = draw_text(pdf, model['weatherLog']['warning'], right_x + 10, y, right_w - 20, 'Helvetica-Bold', 9.0, 10.2, color=TEAL, max_lines=4)
    if y + 10.2 < weather_box_bottom + 2:
        raise ValueError('Weather / staleness box overflow')

    box(pdf, MARGIN, 88, PAGE_WIDTH - 2 * MARGIN, 32, fill=STONE, stroke=TEAL, line_width=1.4)
    draw_text(pdf, model['finalSafety'], MARGIN + 10, 73, PAGE_WIDTH - 2 * MARGIN - 20, 'Helvetica-Bold', 9.0, 10.5, color=TEAL, max_lines=3)
    draw_footer(pdf, model, 3)
    pdf.showPage()


def main():
    if len(sys.argv) < 3 or len(sys.argv) > 4:
        raise SystemExit('Usage: render_field_guide.py MODEL_JSON OUTPUT_PDF [--skip-images|--images-only]')
    model_path = Path(sys.argv[1])
    output_path = Path(sys.argv[2])
    
    if '--images-only' in sys.argv:
        import pypdfium2 as pdfium
        doc = pdfium.PdfDocument(str(output_path))
        for i in range(len(doc)):
            page = doc[i]
            image = page.render(scale=2).to_pil()
            page_path = output_path.parent / f"{output_path.stem}-p{i+1}.png"
            image.save(str(page_path), format="PNG", optimize=True)
        return
    model = json.loads(model_path.read_text())
    output_path.parent.mkdir(parents=True, exist_ok=True)

    pdf = canvas.Canvas(str(output_path), pagesize=letter, pageCompression=1, invariant=1)
    p = model['provenance']
    pdf.setTitle(f"{model['trip']['name']} - Printable Field Guide")
    pdf.setAuthor(p['product'])
    pdf.setSubject('Draft three-page field guide generated from the canonical trip manifest')
    pdf.setKeywords('; '.join([
        f"ManifestSHA256={p['manifestSha256']}",
        f"DataVersion={p['dataVersion']}",
        f"SourceRelease={p['sourceRelease']}",
        f"SourceCommit={p['sourceCommit']}",
        f"GeneratedAt={p['generatedAt']}",
        'ArtifactStatus=draft_not_field_release'
    ]))
    page_one(pdf, model)
    page_two(pdf, model)
    page_three(pdf, model)
    pdf.save()

    if '--skip-images' not in sys.argv:
        import pypdfium2 as pdfium
        doc = pdfium.PdfDocument(str(output_path))
        for i, page in enumerate(doc):
            image = page.render(scale=2).to_pil()
            page_path = output_path.parent / f"field-guide-p{i+1}.png"
            image.save(str(page_path), format="PNG", optimize=True)


if __name__ == '__main__':
    main()

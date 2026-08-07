#!/usr/bin/env python3
import json
import sys
from pathlib import Path

from reportlab.lib.colors import HexColor, white
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas


PAGE_WIDTH = 252
PAGE_HEIGHT = 360
MARGIN = 10
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


def draw_text(pdf, text, x, y, width, font='Helvetica', size=9.5, leading=None, color=INK, max_lines=None):
    leading = leading or size * 1.12
    lines = wrap_lines(text, font, size, width)
    if max_lines is not None and len(lines) > max_lines:
        raise ValueError(f'Text exceeds designed line count ({len(lines)} > {max_lines}): {text}')
    pdf.setFillColor(color)
    pdf.setFont(font, size)
    for line in lines:
        pdf.drawString(x, y, line)
        y -= leading
    return y


def box(pdf, x, y_top, width, height, fill=white, stroke=BORDER, line_width=1.1, radius=2):
    pdf.setLineWidth(line_width)
    pdf.setStrokeColor(stroke)
    pdf.setFillColor(fill)
    pdf.roundRect(x, y_top - height, width, height, radius, stroke=1, fill=1)


def footer(pdf, model, side):
    p = model['provenance']
    pdf.setFillColor(EARTH)
    pdf.setFont('Helvetica', 5.3)
    pdf.drawString(MARGIN, 9, f"{p['product']} | Trip Data v{p['dataVersion']} | Based on Mountain Guide {p['sourceRelease']}")
    pdf.drawString(MARGIN, 3, f"Generated: {p['generatedDate']} | Verified: {p['verifiedDate']} | Manifest: {p['manifestShort']}... | DRAFT | {side}")


def side_label(pdf, left, right):
    pdf.setFillColor(EARTH)
    pdf.setFont('Helvetica-Bold', 9.5)
    pdf.drawString(MARGIN, 349, left)
    if right:
        pdf.drawRightString(PAGE_WIDTH - MARGIN, 349, right)
    pdf.setStrokeColor(GOLD)
    pdf.setLineWidth(1.5)
    pdf.line(MARGIN, 345, MARGIN + 34, 345)


def page_front(pdf, model):
    side_label(pdf, 'FRONT | EMERGENCY', '')
    box(pdf, MARGIN, 343, PAGE_WIDTH - 2 * MARGIN, 31, fill=EMERGENCY, stroke=INK, line_width=2.2, radius=1.5)
    pdf.setFillColor(white)
    pdf.setFont('Helvetica-Bold', 20)
    pdf.drawCentredString(PAGE_WIDTH / 2, 321, model['emergency']['headline'])

    box(pdf, MARGIN, 307, PAGE_WIDTH - 2 * MARGIN, 45, fill=STONE, stroke=TEAL, line_width=1.2)
    pdf.setFillColor(TEAL)
    pdf.setFont('Helvetica-Bold', 10.5)
    pdf.drawString(MARGIN + 6, 294, 'GIVE:')
    draw_text(pdf, model['emergency']['give'], MARGIN + 39, 294, PAGE_WIDTH - 2 * MARGIN - 45,
              'Helvetica-Bold', 9.5, 10.5, max_lines=3)

    box(pdf, MARGIN, 257, PAGE_WIDTH - 2 * MARGIN, 38, fill=PALE, stroke=TEAL, line_width=1.1)
    y = draw_text(pdf, model['emergency']['jurisdiction'], MARGIN + 6, 247, PAGE_WIDTH - 2 * MARGIN - 12,
                  'Helvetica-Bold', 9.5, 10.5, color=TEAL, max_lines=2)
    draw_text(pdf, model['emergency']['countyChoice'], MARGIN + 6, y, PAGE_WIDTH - 2 * MARGIN - 12,
              'Helvetica', 9.5, 10.5, max_lines=2)

    gap = 3
    contact_width = (PAGE_WIDTH - 2 * MARGIN - gap * 2) / 3
    for index, contact in enumerate(model['contacts']):
        x = MARGIN + index * (contact_width + gap)
        box(pdf, x, 214, contact_width, 60, fill=white, stroke=BORDER, line_width=1.1)
        pdf.setFillColor(TEAL)
        pdf.setFont('Helvetica-Bold', 10.5)
        pdf.drawString(x + 3, 202, contact['shortName'])
        y = 190
        for phone in contact['phones']:
            pdf.setFillColor(INK)
            pdf.setFont('Helvetica-Bold', 9.5)
            pdf.drawString(x + 3, y, phone['label'])
            pdf.setFont('Helvetica-Bold', 10.5)
            pdf.drawString(x + 3, y - 10.7, phone['value'])
            y -= 22

    context_text = '. '.join(contact['contextPrimary'] for contact in model['contacts']) + '; exact incident location controls.'
    y = draw_text(pdf, context_text, MARGIN, 145, PAGE_WIDTH - 2 * MARGIN,
                  'Helvetica', 9.5, 10.0, max_lines=7)
    if y < 78:
        raise ValueError('Front contact context overflow')

    pdf.setFillColor(TEAL)
    pdf.setFont('Helvetica-Bold', 11.5)
    pdf.drawString(MARGIN, 73, 'CURRENT LOCATION')
    y = 60
    for label in model['locationFields']:
        pdf.setFillColor(INK)
        pdf.setFont('Helvetica-Bold', 9.5)
        pdf.drawString(MARGIN, y, label)
        label_width = stringWidth(label, 'Helvetica-Bold', 9.5)
        pdf.setStrokeColor(INK)
        pdf.setLineWidth(0.8)
        pdf.line(MARGIN + label_width + 4, y - 2, PAGE_WIDTH - MARGIN, y - 2)
        y -= 12
    footer(pdf, model, 'FRONT')
    pdf.showPage()


def page_back(pdf, model):
    side_label(pdf, 'BACK | COMMUNICATION', 'TIME / INITIALS')
    table_top = 339
    row_height = 13
    label_width = 153
    for index, milestone in enumerate(model['communication']['milestones']):
        top = table_top - index * row_height
        bottom = top - row_height
        pdf.setFillColor(PALE if index % 2 == 0 else white)
        pdf.setStrokeColor(BORDER)
        pdf.setLineWidth(0.6)
        pdf.rect(MARGIN, bottom, PAGE_WIDTH - 2 * MARGIN, row_height, stroke=1, fill=1)
        pdf.rect(MARGIN + 4, bottom + 3, 7, 7, stroke=1, fill=0)
        pdf.setFillColor(INK)
        pdf.setFont('Helvetica-Bold', 9.5)
        pdf.drawString(MARGIN + 15, bottom + 3, milestone)
        pdf.line(MARGIN + label_width, bottom, MARGIN + label_width, top)
        pdf.line(MARGIN + label_width + 45, bottom, MARGIN + label_width + 45, top)

    box(pdf, MARGIN, 215, PAGE_WIDTH - 2 * MARGIN, 22, fill=STONE, stroke=TEAL, line_width=1.1)
    draw_text(pdf, model['communication']['draftBehavior'], MARGIN + 6, 205,
              PAGE_WIDTH - 2 * MARGIN - 12, 'Helvetica-Bold', 9.5, 10.4, color=TEAL, max_lines=2)

    box(pdf, MARGIN, 188, PAGE_WIDTH - 2 * MARGIN, 78, fill=PALE, stroke=BORDER, line_width=1.1)
    pdf.setFillColor(TEAL)
    pdf.setFont('Helvetica-Bold', 11.0)
    pdf.drawString(MARGIN + 6, 175, 'PERSONAL CONTACT')
    draw_text(pdf, model['personal']['completion'], MARGIN + 136, 178, PAGE_WIDTH - MARGIN - (MARGIN + 136),
              'Helvetica-Bold', 9.5, 10.0, color=TEAL, max_lines=2)
    field_width = (PAGE_WIDTH - 2 * MARGIN - 12) / 3
    for index, label in enumerate(model['personal']['fields']):
        x = MARGIN + 6 + index * (field_width + 3)
        pdf.setFillColor(INK)
        pdf.setFont('Helvetica-Bold', 9.5)
        pdf.drawString(x, 150, label)
        pdf.setStrokeColor(INK)
        pdf.line(x, 140, x + field_width - 3, 140)
    pdf.setFont('Helvetica-Bold', 9.5)
    pdf.drawString(MARGIN + 6, 128, model['personal']['notesLabel'])
    pdf.setLineWidth(0.8)
    pdf.line(MARGIN + 6, 119, PAGE_WIDTH - MARGIN - 6, 119)
    pdf.line(MARGIN + 6, 112, PAGE_WIDTH - MARGIN - 6, 112)

    box(pdf, MARGIN, 107, PAGE_WIDTH - 2 * MARGIN, 47, fill=STONE, stroke=BORDER, line_width=1.1)
    half_width = (PAGE_WIDTH - 2 * MARGIN - 18) / 2
    labels = [model['weather']['refreshLabel'], model['weather']['observationLabel']]
    for index, label in enumerate(labels):
        x = MARGIN + 6 + index * (half_width + 6)
        pdf.setFillColor(INK)
        pdf.setFont('Helvetica', 9.5)
        pdf.drawString(x, 94, label)
        pdf.setStrokeColor(INK)
        pdf.line(x, 83, x + half_width, 83)
    weather_text = model['weather']['warning'] + ' ' + model['weather']['evidence']
    draw_text(pdf, weather_text, MARGIN + 6, 73, PAGE_WIDTH - 2 * MARGIN - 12,
              'Helvetica-Bold', 9.5, 10.0, color=TEAL, max_lines=2)

    box(pdf, MARGIN, 56, PAGE_WIDTH - 2 * MARGIN, 33, fill=PALE, stroke=TEAL, line_width=1.2)
    draw_text(pdf, model['safety'], MARGIN + 6, 46, PAGE_WIDTH - 2 * MARGIN - 12,
              'Helvetica', 9.5, 10.0, color=TEAL, max_lines=3)
    footer(pdf, model, 'BACK')
    pdf.showPage()


def main():
    if len(sys.argv) != 3:
        raise SystemExit('Usage: render_pocket_card.py MODEL_JSON OUTPUT_PDF')
    model = json.loads(Path(sys.argv[1]).read_text())
    output_path = Path(sys.argv[2])
    output_path.parent.mkdir(parents=True, exist_ok=True)
    pdf = canvas.Canvas(str(output_path), pagesize=(PAGE_WIDTH, PAGE_HEIGHT), pageCompression=1, invariant=1)
    p = model['provenance']
    pdf.setTitle('Emergency & Communication Pocket Card')
    pdf.setAuthor(p['product'])
    pdf.setSubject('Draft two-sided pocket card generated from the canonical trip manifest')
    pdf.setKeywords('; '.join([
        f"ManifestSHA256={p['manifestSha256']}",
        f"DataVersion={p['dataVersion']}",
        f"SourceRelease={p['sourceRelease']}",
        f"SourceCommit={p['sourceCommit']}",
        f"GeneratedAt={p['generatedAt']}",
        'ArtifactStatus=draft_not_field_release'
    ]))
    page_front(pdf, model)
    page_back(pdf, model)
    pdf.save()


if __name__ == '__main__':
    main()

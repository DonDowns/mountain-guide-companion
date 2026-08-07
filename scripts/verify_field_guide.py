#!/usr/bin/env python3
import json
import re
import sys
from pathlib import Path

import pdfplumber
from PIL import Image, ImageStat
from pypdf import PdfReader


def normalized(value):
    return re.sub(r'\s+', ' ', value or '').strip()


def require_text(content, value, errors):
    if normalized(value) not in content:
        errors.append(f'PDF text is missing {value!r}')


def reject_text(content, value, errors):
    if value.lower() in content.lower():
        errors.append(f'PDF text contains prohibited {value!r}')


def image_checks(render_directory, errors):
    render_path = Path(render_directory)
    color_images = sorted(render_path.glob('field-guide-*.png'))
    gray_images = sorted(render_path.glob('field-guide-gray-*.png'))
    color_images = [path for path in color_images if 'gray' not in path.name]
    if len(color_images) != 3 or len(gray_images) != 3:
        errors.append(f'expected 3 color and 3 grayscale renders, found {len(color_images)} and {len(gray_images)}')
        return {}
    metrics = {}
    for label, paths in [('color', color_images), ('gray', gray_images)]:
        for index, path in enumerate(paths, start=1):
            image = Image.open(path).convert('L')
            if image.size != (1224, 1584):
                errors.append(f'{label} page {index} has unexpected render dimensions {image.size}')
            stats = ImageStat.Stat(image)
            extrema = image.getextrema()
            pixels = image.get_flattened_data() if hasattr(image, 'get_flattened_data') else image.getdata()
            nonwhite = sum(1 for pixel in pixels if pixel < 248) / (image.width * image.height)
            if extrema[0] > 80 or stats.stddev[0] < 12 or nonwhite < 0.015:
                errors.append(f'{label} page {index} appears blank or lacks usable contrast')
            metrics[f'{label}_page_{index}_nonwhite'] = round(nonwhite, 4)
            metrics[f'{label}_page_{index}_luma_stddev'] = round(stats.stddev[0], 2)
    return metrics


def main():
    if len(sys.argv) != 5:
        raise SystemExit('Usage: verify_field_guide.py MODEL_JSON PDF ARTIFACT_JSON RENDER_DIRECTORY_OR_EMPTY')
    model = json.loads(Path(sys.argv[1]).read_text())
    pdf_path = Path(sys.argv[2])
    artifact = json.loads(Path(sys.argv[3]).read_text())
    render_directory = sys.argv[4]
    errors = []

    reader = PdfReader(str(pdf_path))
    if len(reader.pages) != 3:
        errors.append(f'PDF page count is {len(reader.pages)}, expected 3')
    metadata = reader.metadata or {}
    keywords = str(metadata.get('/Keywords', ''))
    for value in [
        model['provenance']['manifestSha256'],
        model['provenance']['dataVersion'],
        model['provenance']['sourceRelease'],
        model['provenance']['sourceCommit'],
        model['provenance']['generatedAt'],
        'draft_not_field_release'
    ]:
        if value not in keywords:
            errors.append(f'PDF metadata is missing {value!r}')

    page_texts = []
    body_font_sizes = []
    region_texts = []
    with pdfplumber.open(str(pdf_path)) as pdf:
        if len(pdf.pages) != 3:
            errors.append('pdfplumber page count mismatch')
        for index, page in enumerate(pdf.pages, start=1):
            if abs(page.width - 612) > 0.1 or abs(page.height - 792) > 0.1:
                errors.append(f'page {index} is not US Letter portrait: {page.width} x {page.height}')
            text = normalized(page.extract_text() or '')
            page_texts.append(text)
            if len(text) < 250:
                errors.append(f'page {index} appears blank or materially incomplete')
            for word in page.extract_words():
                if word['x0'] < 18 or word['x1'] > page.width - 18 or word['top'] < 18 or word['bottom'] > page.height - 18:
                    errors.append(f'page {index} has text outside printable safety bounds: {word["text"]!r}')
            for character in page.chars:
                if character.get('top', 0) < 730:
                    body_font_sizes.append(round(float(character.get('size', 0)), 2))
        route_card_regions = [
            (30, 90, 306, 245),
            (306, 90, 582, 245),
            (30, 242, 306, 400),
            (306, 242, 582, 400)
        ]
        region_texts.extend(normalized(pdf.pages[1].crop(box).extract_text() or '') for box in route_card_regions)
        region_texts.append(normalized(pdf.pages[1].crop((340, 380, 590, 630)).extract_text() or ''))

    full_text = normalized(' '.join(page_texts + region_texts))
    required = [
        model['trip']['name'],
        model['trip']['dateRange'],
        *[entry['value'] for item in model['timeline'] for entry in item['times']],
        *[value for route in model['routes'] for value in [route['name'], route['distance'], route['gain'], route['difficulty'], route['exposure'], route['fieldNote']] if value],
        model['emergency']['headline'],
        *[phone['value'] for contact in model['contacts'] for phone in contact['phones']],
        model['weatherRule'],
        model['provenance']['manifestShort'],
        model['lilyLake']['holdText'],
        model['access']['fact'],
        *model['communication']['milestones']
    ]
    for value in required:
        require_text(full_text, value, errors)

    prohibited = [
        'Go/No-Go', 'safe bailout', 'emergency escape route', 'safe descent',
        'safe to proceed', 'all clear', 'route is safe', 'weather permits',
        'approved to continue', 'rescue requested', 'rescue activated',
        'help is on the way', 'message sent', 'phone intent', 'does not prove',
        'drafted/copied', 'frozen-source', '37.62361', '-105.47278',
        '37.623486', '-105.472903', '\ufffd', '\u25a0'
    ]
    for value in prohibited:
        reject_text(full_text, value, errors)

    email_pattern = re.compile(r'\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b', re.I)
    if email_pattern.search(full_text):
        errors.append('PDF contains an email address')
    phone_pattern = re.compile(r'\b\d{3}-\d{3}-\d{4}\b')
    allowed_phones = {phone['value'] for contact in model['contacts'] for phone in contact['phones']}
    found_phones = set(phone_pattern.findall(full_text))
    if found_phones != allowed_phones:
        errors.append(f'PDF public phone set mismatch: {sorted(found_phones)}')

    if not body_font_sizes or min(body_font_sizes) < 8.9:
        errors.append(f'body font minimum is too small: {min(body_font_sizes) if body_font_sizes else "none"}')

    render_metrics = image_checks(render_directory, errors) if render_directory else {}
    if artifact.get('page_count') != 3:
        errors.append('artifact record page count is not 3')
    if errors:
        raise SystemExit('PDF verification failed:\n- ' + '\n- '.join(errors))

    result = {
        'pdf_integrity': 'pass',
        'page_count': 3,
        'page_size_points': [612, 792],
        'minimum_nonfooter_font_pt': min(body_font_sizes),
        'public_phone_count': len(found_phones),
        'lily_secondary_coordinates_found': 0,
        'render_metrics': render_metrics
    }
    print(json.dumps(result, sort_keys=True))


if __name__ == '__main__':
    main()

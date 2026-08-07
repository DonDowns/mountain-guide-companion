#!/usr/bin/env python3
import json
import re
import sys
from pathlib import Path

import pdfplumber
from PIL import Image, ImageEnhance, ImageStat
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
    color_images = sorted(path for path in render_path.glob('pocket-card-*.png') if 'gray' not in path.name and 'lowlight' not in path.name)
    gray_images = sorted(render_path.glob('pocket-card-gray-*.png'))
    if len(color_images) != 2 or len(gray_images) != 2:
        errors.append(f'expected 2 color and 2 grayscale renders, found {len(color_images)} and {len(gray_images)}')
        return {}
    lowlight_images = []
    for index, source in enumerate(gray_images, start=1):
        image = Image.open(source).convert('L')
        lowlight = ImageEnhance.Brightness(image).enhance(0.32)
        lowlight = ImageEnhance.Contrast(lowlight).enhance(0.92)
        path = render_path / f'pocket-card-lowlight-{index}.png'
        lowlight.save(path)
        lowlight_images.append(path)

    metrics = {}
    for label, paths in [('color', color_images), ('gray', gray_images), ('lowlight', lowlight_images)]:
        for index, path in enumerate(paths, start=1):
            image = Image.open(path).convert('L')
            if image.size != (1008, 1440):
                errors.append(f'{label} side {index} has unexpected render dimensions {image.size}')
            stats = ImageStat.Stat(image)
            pixels = image.get_flattened_data() if hasattr(image, 'get_flattened_data') else image.getdata()
            if label == 'lowlight':
                if not 20 <= stats.mean[0] <= 100 or stats.stddev[0] < 8:
                    errors.append(f'lowlight side {index} lacks useful simulated contrast')
            else:
                nonwhite = sum(1 for pixel in pixels if pixel < 248) / (image.width * image.height)
                if image.getextrema()[0] > 80 or stats.stddev[0] < 20 or nonwhite < 0.04:
                    errors.append(f'{label} side {index} appears blank or lacks usable contrast')
                metrics[f'{label}_side_{index}_nonwhite'] = round(nonwhite, 4)
            metrics[f'{label}_side_{index}_luma_mean'] = round(stats.mean[0], 2)
            metrics[f'{label}_side_{index}_luma_stddev'] = round(stats.stddev[0], 2)
    return metrics


def main():
    if len(sys.argv) != 5:
        raise SystemExit('Usage: verify_pocket_card.py MODEL_JSON PDF ARTIFACT_JSON RENDER_DIRECTORY_OR_EMPTY')
    model = json.loads(Path(sys.argv[1]).read_text())
    pdf_path = Path(sys.argv[2])
    artifact = json.loads(Path(sys.argv[3]).read_text())
    render_directory = sys.argv[4]
    errors = []

    reader = PdfReader(str(pdf_path))
    if len(reader.pages) != 2:
        errors.append(f'PDF page count is {len(reader.pages)}, expected 2')
    keywords = str((reader.metadata or {}).get('/Keywords', ''))
    for value in [
        model['provenance']['manifestSha256'], model['provenance']['dataVersion'],
        model['provenance']['sourceRelease'], model['provenance']['sourceCommit'],
        model['provenance']['generatedAt'], 'draft_not_field_release'
    ]:
        if value not in keywords:
            errors.append(f'PDF metadata is missing {value!r}')

    page_texts = []
    essential_font_sizes = []
    with pdfplumber.open(str(pdf_path)) as pdf:
        if len(pdf.pages) != 2:
            errors.append('pdfplumber page count mismatch')
        for index, page in enumerate(pdf.pages, start=1):
            if abs(page.width - 252) > 0.1 or abs(page.height - 360) > 0.1:
                errors.append(f'side {index} is not 3.5 x 5 inches: {page.width} x {page.height}')
            text = normalized(page.extract_text() or '')
            page_texts.append(text)
            if len(text) < 250:
                errors.append(f'side {index} appears blank or materially incomplete')
            for word in page.extract_words():
                if word['x0'] < 1 or word['x1'] > page.width - 1 or word['top'] < 1 or word['bottom'] > page.height - 1:
                    errors.append(f'side {index} has text outside page bounds: {word["text"]!r}')
            for character in page.chars:
                if character.get('top', 0) < 335 and character.get('text', '').strip():
                    essential_font_sizes.append(round(float(character.get('size', 0)), 2))

    front_text, back_text = page_texts if len(page_texts) == 2 else ('', '')
    require_text(front_text, 'FRONT | EMERGENCY', errors)
    require_text(back_text, 'BACK | COMMUNICATION', errors)
    full_text = normalized(' '.join(page_texts))
    required = [
        model['emergency']['headline'], 'Exact location', model['emergency']['jurisdiction'],
        *[phone['value'] for contact in model['contacts'] for phone in contact['phones']],
        *model['communication']['milestones'], model['communication']['draftBehavior'],
        'PERSONAL CONTACT', model['personal']['completion'], model['weather']['warning'],
        model['weather']['evidence'], model['provenance']['manifestShort']
    ]
    for value in required:
        require_text(full_text, value, errors)
    prohibited = [
        'all clear', 'safe to proceed', 'route is safe', 'weather permits', 'approved to continue',
        'go/no-go', 'rescue requested', 'rescue activated', 'help is on the way', 'message sent',
        'phone intent', 'does not prove', 'drafted/copied',
        '37.62361', '-105.47278', '37.623486', '-105.472903', '\ufffd', '\u25a0'
    ]
    for value in prohibited:
        reject_text(full_text, value, errors)
    if re.search(r'\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b', full_text, re.I):
        errors.append('PDF contains an email address')
    allowed_phones = {phone['value'] for contact in model['contacts'] for phone in contact['phones']}
    found_phones = set(re.findall(r'\b\d{3}-\d{3}-\d{4}\b', full_text))
    if found_phones != allowed_phones:
        errors.append(f'PDF public phone set mismatch: {sorted(found_phones)}')
    if len(model['communication']['milestones']) != 9:
        errors.append('model communication milestone count is not 9')
    if not essential_font_sizes or min(essential_font_sizes) < 9.5:
        errors.append(f'essential font minimum is too small: {min(essential_font_sizes) if essential_font_sizes else "none"}')
    if artifact.get('page_count') != 2 or artifact.get('page_size_points') != [252, 360]:
        errors.append('artifact record page geometry mismatch')
    render_metrics = image_checks(render_directory, errors) if render_directory else {}
    if errors:
        raise SystemExit('Pocket Card PDF verification failed:\n- ' + '\n- '.join(errors))
    print(json.dumps({
        'pdf_integrity': 'pass', 'page_count': 2, 'page_size_points': [252, 360],
        'minimum_essential_font_pt': min(essential_font_sizes), 'public_phone_count': len(found_phones),
        'communication_milestone_count': len(model['communication']['milestones']),
        'lily_secondary_coordinates_found': 0, 'render_metrics': render_metrics
    }, sort_keys=True))


if __name__ == '__main__':
    main()

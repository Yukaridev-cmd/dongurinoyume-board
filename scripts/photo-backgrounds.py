"""Rebuild/check reviewed background derivatives; never rewrite a source JPEG.

Optional artwork tooling: Python, Pillow and NumPy. It is not used by the app.
Run without arguments to verify, or --write to rebuild the two approved outputs.
"""
from pathlib import Path
import argparse
import hashlib
import json
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
SPEC = ROOT / 'artwork/photo-backgrounds.json'


def digest(data):
    return hashlib.sha256(data).hexdigest()


def build(source, polygon):
    # The polygon was checked against the source silhouette. A 20px guard
    # retains yarn wisps and avoids fading the product's edge pixels.
    hard = Image.new('L', source.size)
    ImageDraw.Draw(hard).polygon([tuple(p) for p in polygon], fill=255)
    for _ in range(10):
        hard = hard.filter(ImageFilter.MaxFilter(5))
    alpha = np.array(hard).copy()
    expanded = hard
    # Only the exterior background fades. A continuous outward ramp prevents
    # the 50% alpha jump caused by blurring then clamping an interior mask.
    for radius in range(2, 62, 2):
        expanded = expanded.filter(ImageFilter.MaxFilter(5))
        value = round(255 * (1 - radius / 62) ** 2)
        alpha = np.maximum(alpha, np.where(np.array(expanded) > 0, value, 0).astype('uint8'))
    mask = Image.fromarray(alpha)
    result = Image.composite(source, Image.new('RGB', source.size, (250, 248, 242)), mask)
    return result, mask


def run(write=False):
    rows = json.loads(SPEC.read_text(encoding='utf-8'))
    for row in rows:
        source_path = ROOT / row['source']
        assert digest(source_path.read_bytes()) == row['sourceSha256'], 'Source changed: ' + row['id']
        source = Image.open(source_path).convert('RGB')
        assert list(source.size) == row['size']
        expected, mask = build(source, row['silhouette'])
        output_path = ROOT / row['output']
        mask_path = ROOT / row['mask']
        if write:
            output_path.parent.mkdir(parents=True, exist_ok=True)
            mask_path.parent.mkdir(parents=True, exist_ok=True)
            expected.save(output_path)
            mask.save(mask_path)
        actual = Image.open(output_path).convert('RGB')
        actual_mask = Image.open(mask_path).convert('L')
        assert np.array_equal(np.array(actual_mask), np.array(mask)), 'Mask changed: ' + row['id']
        assert actual.size == source.size
        assert np.array_equal(np.array(actual), np.array(expected)), 'Composite changed: ' + row['id']
        protected = np.array(mask) == 255
        before, after = np.array(source)[protected], np.array(actual)[protected]
        assert np.array_equal(before, after), 'Protected source pixels changed: ' + row['id']
        protected_hash = digest(before.tobytes())
        if write:
            row['protectedPixels'] = int(protected.sum())
            row['protectedPixelsSha256'] = protected_hash
            row['outputSha256'] = digest(output_path.read_bytes())
            row['maskSha256'] = digest(mask_path.read_bytes())
        else:
            assert row['protectedPixels'] == int(protected.sum())
            assert row['protectedPixelsSha256'] == protected_hash
            assert row['outputSha256'] == digest(output_path.read_bytes())
            assert row['maskSha256'] == digest(mask_path.read_bytes())
        print('PASS ' + row['id'] + ': ' + str(protected.sum()) + ' protected pixels unchanged; source retained')
    if write:
        SPEC.write_text(json.dumps(rows, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--write', action='store_true')
    run(parser.parse_args().write)

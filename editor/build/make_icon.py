#!/usr/bin/env python3
"""build/icon.ico 를 생성한다 (외부 라이브러리 없이 표준 라이브러리만 사용).

사용법:  python3 build/make_icon.py
결과물:  build/icon.ico  (16/24/32/48/64/128/256 px, PNG 압축 엔트리)
"""
import math
import os
import struct
import zlib

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "icon.ico")
SS = 1024  # 수퍼샘플링 해상도. 여기서 그린 뒤 각 크기로 축소한다.
SIZES = [16, 24, 32, 48, 64, 128, 256]


def lerp(a, b, t):
    return a + (b - a) * t


def clamp01(v):
    return 0.0 if v < 0.0 else (1.0 if v > 1.0 else v)


def rounded_rect_sdf(x, y, half_w, half_h, radius):
    """중심이 (0,0)인 둥근 사각형의 부호 있는 거리(음수=내부)."""
    qx = abs(x) - (half_w - radius)
    qy = abs(y) - (half_h - radius)
    ox, oy = max(qx, 0.0), max(qy, 0.0)
    return math.hypot(ox, oy) + min(max(qx, qy), 0.0) - radius


def segment_sdf(px, py, ax, ay, bx, by):
    """선분 AB 까지의 거리."""
    vx, vy = bx - ax, by - ay
    wx, wy = px - ax, py - ay
    denom = vx * vx + vy * vy
    t = 0.0 if denom == 0 else clamp01((wx * vx + wy * vy) / denom)
    return math.hypot(wx - vx * t, wy - vy * t)


def render_supersampled():
    """1024x1024 RGBA 픽셀(바이트배열)을 그린다."""
    px = bytearray(SS * SS * 4)

    # 색상 팔레트 (친절한 보라 -> 파랑 그라데이션)
    c_top = (0x6C, 0x5C, 0xE7)
    c_bot = (0x2E, 0x86, 0xF0)

    # 유닛 좌표계(-1..1) 기준 도형 정의
    plate_half = 0.94
    plate_radius = 0.34
    stroke = 0.075          # 글리프 선 두께(반지름)
    # "</>" 모양 꼭지점
    left = [(-0.30, -0.34), (-0.60, 0.0), (-0.30, 0.34)]
    right = [(0.30, -0.34), (0.60, 0.0), (0.30, 0.34)]
    slash = [(-0.10, 0.44), (0.10, -0.44)]

    inv = 2.0 / SS
    for j in range(SS):
        y = (j + 0.5) * inv - 1.0
        row = j * SS * 4
        # 세로 그라데이션은 행 단위로 한 번만 계산
        t = clamp01((y + 1.0) * 0.5)
        br = int(lerp(c_top[0], c_bot[0], t))
        bg = int(lerp(c_top[1], c_bot[1], t))
        bb = int(lerp(c_top[2], c_bot[2], t))
        for i in range(SS):
            x = (i + 0.5) * inv - 1.0

            d_plate = rounded_rect_sdf(x, y, plate_half, plate_half, plate_radius)
            if d_plate > 0.02:          # 판 바깥은 완전 투명
                continue
            a_plate = clamp01((0.006 - d_plate) / 0.012)

            r, g, b = br, bg, bb

            # 좌상단 하이라이트로 살짝 입체감
            hl = clamp01(1.0 - math.hypot(x + 0.55, y + 0.62) / 1.25)
            if hl > 0:
                h = hl * hl * 38
                r = min(255, int(r + h))
                g = min(255, int(g + h))
                b = min(255, int(b + h))

            # 글리프: "< / >"
            d_glyph = 9.0
            for pts in (left, right):
                for k in range(len(pts) - 1):
                    d_glyph = min(d_glyph, segment_sdf(x, y, pts[k][0], pts[k][1],
                                                      pts[k + 1][0], pts[k + 1][1]))
            d_glyph = min(d_glyph, segment_sdf(x, y, slash[0][0], slash[0][1],
                                               slash[1][0], slash[1][1]))
            a_glyph = clamp01((stroke - d_glyph) / 0.010)
            if a_glyph > 0:
                r = int(lerp(r, 255, a_glyph))
                g = int(lerp(g, 255, a_glyph))
                b = int(lerp(b, 255, a_glyph))

            o = row + i * 4
            px[o] = r
            px[o + 1] = g
            px[o + 2] = b
            px[o + 3] = int(a_plate * 255)
    return px


def downsample(src, size):
    """박스 필터로 SS -> size 축소 (알파 프리멀티플라이 적용)."""
    out = bytearray(size * size * 4)
    step = SS // size
    area = step * step
    for j in range(size):
        for i in range(size):
            ar = ag = ab = aa = 0
            for sy in range(j * step, j * step + step):
                base = sy * SS * 4
                for sx in range(i * step, i * step + step):
                    o = base + sx * 4
                    a = src[o + 3]
                    ar += src[o] * a
                    ag += src[o + 1] * a
                    ab += src[o + 2] * a
                    aa += a
            o = (j * size + i) * 4
            if aa == 0:
                continue
            out[o] = min(255, ar // aa)
            out[o + 1] = min(255, ag // aa)
            out[o + 2] = min(255, ab // aa)
            out[o + 3] = aa // area
    return out


def png_bytes(rgba, size):
    raw = bytearray()
    stride = size * 4
    for j in range(size):
        raw.append(0)  # filter type 0
        raw += rgba[j * stride:(j + 1) * stride]

    def chunk(tag, data):
        return (struct.pack(">I", len(data)) + tag + data
                + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF))

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    return (b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", ihdr)
            + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
            + chunk(b"IEND", b""))


def main():
    print("아이콘 렌더링 중... (수퍼샘플 %dx%d)" % (SS, SS))
    src = render_supersampled()

    images = []
    for size in SIZES:
        print("  -> %dx%d" % (size, size))
        images.append((size, png_bytes(downsample(src, size), size)))

    header = struct.pack("<HHH", 0, 1, len(images))
    offset = 6 + 16 * len(images)
    entries, blobs = b"", b""
    for size, data in images:
        w = 0 if size >= 256 else size
        entries += struct.pack("<BBBBHHII", w, w, 0, 0, 1, 32, len(data), offset)
        blobs += data
        offset += len(data)

    with open(OUT, "wb") as f:
        f.write(header + entries + blobs)
    print("완료: %s (%.1f KB)" % (OUT, os.path.getsize(OUT) / 1024.0))


if __name__ == "__main__":
    main()

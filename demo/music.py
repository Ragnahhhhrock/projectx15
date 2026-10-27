#!/usr/bin/env python3
"""Synthesises an original ~29 s soundtrack timed to the demo edit. Usage: music.py out.wav"""
import sys, numpy as np
from scipy.signal import butter, sosfilt
from scipy.io import wavfile
SR = 48000; DUR = 29.0
n = int(SR * DUR); t = np.arange(n) / SR
rng = np.random.default_rng(15)
def lp(x, f): return sosfilt(butter(2, f, 'low', fs=SR, output='sos'), x)
def hp(x, f): return sosfilt(butter(2, f, 'high', fs=SR, output='sos'), x)
def env(pts):  # piecewise-linear envelope from (time, value) points
    return np.interp(t, [p[0] for p in pts], [p[1] for p in pts])
def saw(f, ph=0): return 2 * ((f * t + ph) % 1) - 1
def pad(freqs, gain):
    x = sum(saw(f * d, ph) for f in freqs for d, ph in ((1.0, 0), (1.006, .3), (0.994, .6)))
    return x * gain / (3 * len(freqs))
N = lambda m: 440 * 2 ** ((m - 69) / 12)
# chord progression, ~7.25 s each: Am - F - C - G, then A major resolve for the landing
chords = [(0, [45, 52, 57, 60]), (7.25, [41, 48, 53, 57]), (14.5, [48, 55, 60, 64]), (19.5, [43, 50, 55, 59]), (23.5, [45, 52, 57, 61, 64])]
bed = np.zeros(n)
for i, (t0, notes) in enumerate(chords):
    t1 = chords[i + 1][0] if i + 1 < len(chords) else DUR + 1
    g = np.clip((t - t0) / 1.5, 0, 1) * np.clip((t1 + 1.5 - t) / 1.5, 0, 1)
    bed += lp(pad([N(m) for m in notes], 1.0), 1400) * g
master_swell = env([(0, .25), (2, .4), (9, .8), (14, .45), (19, .85), (23.5, 1.0), (26, .8), (29, 0)])
bed *= master_swell
# pulsing eighth-note arpeggio that enters at the drop (video t=3.6) and thins out at the apex
arp = np.zeros(n); step = 0.5
for i, (t0, notes) in enumerate(chords):
    t1 = chords[i + 1][0] if i + 1 < len(chords) else DUR
    k = 0; s = max(t0, 3.6)
    while s < t1 - 0.05:
        f = N(notes[k % len(notes)] + 24); k += 1
        a = int(s * SR); L = int(0.6 * SR)
        seg = (np.sin(2 * np.pi * f * t[:L]) + .35 * np.sin(2 * np.pi * f * 2.76 * t[:L])) * np.exp(-t[:L] * 5)
        if a + L <= n: arp[a:a + L] += seg * 0.16
        s += step
arp *= env([(0, 0), (3.5, 0), (4.5, 1), (12.5, 1), (14, .15), (18, .15), (19.5, .8), (26, .8), (29, 0)])
# sub drone + rocket rumble swell during boost (video 6.5-13), re-entry roar (17-20)
sub = np.sin(2 * np.pi * N(33) * t) * .35 + np.sin(2 * np.pi * N(45) * t) * .12
sub *= env([(0, .3), (3.5, .3), (6.5, 1), (13, .9), (14.5, .2), (29, .1)])
noise = rng.standard_normal(n)
rumble = lp(noise, 180) * 2.2 * env([(0, 0), (3.4, 0), (3.7, .9), (5, .25), (6.2, .5), (11, 1.0), (13, .9), (14.2, 0), (16.5, 0), (18.5, .8), (20, .5), (21.5, 0), (22.8, 0), (23.1, .5), (25, 0), (29, 0)])
wind = hp(lp(noise, 5000), 800) * .22 * env([(0, 0), (16, 0), (18.5, 1), (20.5, 0), (29, 0)])
# impact at the drop and a soft touchdown thump
def hit(t0, amp):
    a = int(t0 * SR); L = int(1.2 * SR); x = np.zeros(n)
    if a + L <= n: x[a:a + L] = np.sin(2 * np.pi * (70 * np.exp(-t[:L] * 3) + 28) * t[:L]) * np.exp(-t[:L] * 3.2) * amp
    return x
imp = hit(3.55, 1.0) + hit(20.5, .7)
# soft radio comm pings (two-tone) at the drop, apex and touchdown
def ping(t0, f, amp=.12):
    a = int(t0 * SR); L = int(.18 * SR); x = np.zeros(n)
    if a + L <= n: x[a:a + L] = np.sin(2 * np.pi * f * t[:L]) * np.sin(np.pi * t[:L] / .18) * amp
    return x
pings = sum(ping(t0, f) for t0, f in [(1.2, 1320), (1.45, 1760), (13.6, 1320), (13.85, 1760), (23.0, 1760), (23.25, 1320)])
# bright shimmer at the apex
shim = (np.sin(2 * np.pi * N(93) * t) + np.sin(2 * np.pi * N(100) * t) * .7) * .05 * env([(0, 0), (12, 0), (14, 1), (17, .6), (18.5, 0), (29, 0)])
def echo(x, d, fb, wet):
    k = int(d * SR); y = x.copy()
    for i in range(k, n):
        y[i] += fb * y[i - k]
    return x + wet * (y - x)
airy = echo(arp + pings, 0.375, .55, .9)
mix = bed * .6 + airy + sub * .6 + rumble * .5 + wind + imp * .8 + shim
mix = mix * np.clip(t / 0.4, 0, 1) * np.clip((DUR - t) / 2.0, 0, 1)
mix = np.tanh(mix * 1.2) / 1.2
mix = mix / np.max(np.abs(mix)) * 0.8
st = np.stack([mix, np.roll(mix, int(0.012 * SR))], 1)  # slight stereo widening
wavfile.write(sys.argv[1], SR, (st * 32767).astype(np.int16))

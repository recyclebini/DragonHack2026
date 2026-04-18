from __future__ import annotations

from pathlib import Path

import librosa
import matplotlib.pyplot as plt
import numpy as np
from matplotlib.colors import to_hex
from skimage.color import lab2rgb

# Normalization bounds (tune for your corpus)
NORM_F0_MIN_HZ, NORM_F0_MAX_HZ = 80.0, 300.0
NORM_HNR_MIN_DB, NORM_HNR_MAX_DB = 1.0, 10.0
NORM_CENTROID_MIN_HZ, NORM_CENTROID_MAX_HZ = 500.0, 4000.0
NORM_F2_MIN_HZ, NORM_F2_MAX_HZ = 800.0, 2800.0
NORM_PITCH_RANGE_SEM_MIN, NORM_PITCH_RANGE_SEM_MAX = 2.0, 18.0
NORM_TILT_SLOPE_MIN, NORM_TILT_SLOPE_MAX = -12.0, 4.0

# CIELAB output ranges
LAB_L_OUT_MIN, LAB_L_OUT_MAX = 20.0, 90.0
LAB_A_OUT_MIN, LAB_A_OUT_MAX = -60.0, 80.0
LAB_B_OUT_MIN, LAB_B_OUT_MAX = -60.0, 60.0
MAPPING_DEFAULT = "A"

# Analysis params
SR = 22050
N_FFT = 2048
HOP_LENGTH = 512
TRIM_TOP_DB = 30
LPC_ORDER = 14
F2_BAND_LO_HZ, F2_BAND_HI_HZ = 800.0, 2800.0
POLE_ANG_MIN_HZ, POLE_ANG_MAX_HZ = 200.0, 4000.0
PYIN_FMIN_HZ, PYIN_FMAX_HZ = 80.0, 300.0
TILT_FREQ_LO_HZ, TILT_FREQ_HI_HZ = 300.0, 3400.0


def clamp01(t: float) -> float:
    return float(np.clip(t, 0.0, 1.0))


def normalize_to_unit(value: float, vmin: float, vmax: float) -> float:
    if not np.isfinite(value) or vmax <= vmin:
        return 0.5
    return clamp01((value - vmin) / (vmax - vmin))


def linear_map(n: float, out_min: float, out_max: float) -> float:
    return out_min + n * (out_max - out_min)


def lab_to_display_rgb(lab: np.ndarray) -> np.ndarray:
    rgb = lab2rgb(lab.reshape(1, 1, 3), illuminant="D65", observer="2")
    return np.clip(rgb.reshape(3), 0.0, 1.0)


def hnr_proxy_db_stft(y: np.ndarray) -> np.ndarray:
    D = librosa.stft(y, n_fft=N_FFT, hop_length=HOP_LENGTH, center=False)
    H, P = librosa.decompose.hpss(D, margin=3.0)
    h_e = np.mean(np.abs(H) ** 2, axis=0)
    p_e = np.mean(np.abs(P) ** 2, axis=0) + 1e-12
    return 10.0 * np.log10(h_e / p_e)


def lpc_roots_formant_freqs(a: np.ndarray, sr: float) -> np.ndarray:
    roots = np.roots(a)
    sel = (np.abs(roots) < 0.995) & (np.imag(roots) > 0)
    ang = np.angle(roots[sel])
    freqs = np.sort(np.abs(ang) / (2 * np.pi) * sr)
    return freqs[(freqs > POLE_ANG_MIN_HZ) & (freqs < POLE_ANG_MAX_HZ)]


def f2_hz_from_frame(frame: np.ndarray, sr: float) -> float:
    win = frame * np.hanning(len(frame))
    if np.max(np.abs(win)) < 1e-8:
        return float("nan")
    a = librosa.lpc(win + 1e-8, order=LPC_ORDER)
    freqs = lpc_roots_formant_freqs(a, sr)
    in_band = freqs[(freqs >= F2_BAND_LO_HZ) & (freqs <= F2_BAND_HI_HZ)]
    return float(in_band[0]) if in_band.size > 0 else float("nan")


def f2_series(y: np.ndarray, sr: float) -> np.ndarray:
    n_frames = 1 + (len(y) - N_FFT) // HOP_LENGTH
    if n_frames <= 0:
        return np.array([])
    out = np.empty(n_frames, dtype=np.float64)
    for i in range(n_frames):
        sl = slice(i * HOP_LENGTH, i * HOP_LENGTH + N_FFT)
        out[i] = f2_hz_from_frame(y[sl], sr)
    return out


def pitch_range_semitones(f0_hz: np.ndarray, voiced_flag: np.ndarray) -> float:
    vals = f0_hz[voiced_flag & np.isfinite(f0_hz)]
    if vals.size < 2:
        return float("nan")
    fmin = float(np.nanmin(vals))
    fmax = float(np.nanmax(vals))
    if fmin <= 0.0 or fmax <= 0.0 or fmax <= fmin * 1.001:
        return 0.0
    return float(12.0 * np.log2(fmax / fmin))


def spectral_tilt_slope_series(S: np.ndarray, sr: float) -> np.ndarray:
    freqs = librosa.fft_frequencies(sr=sr, n_fft=N_FFT)
    mask = (freqs >= TILT_FREQ_LO_HZ) & (freqs <= TILT_FREQ_HI_HZ)
    f = freqs[mask]
    logf = np.log10(np.maximum(f, 1.0))
    lf_mean = float(np.mean(logf))
    den = float(np.mean((logf - lf_mean) ** 2))
    if den < 1e-18:
        return np.full(S.shape[1], np.nan, dtype=np.float64)
    Sband = np.maximum(S[mask, :], 1e-20)
    yv = 20.0 * np.log10(Sband)
    y_mean = np.mean(yv, axis=0, keepdims=True)
    num = np.mean((logf[:, None] - lf_mean) * (yv - y_mean), axis=0)
    return (num / den).astype(np.float64)


def n_f0_for_lightness(f0_hz: float, centroid_hz: float) -> float:
    if np.isfinite(f0_hz):
        return normalize_to_unit(f0_hz, NORM_F0_MIN_HZ, NORM_F0_MAX_HZ)
    c = normalize_to_unit(centroid_hz, NORM_CENTROID_MIN_HZ, NORM_CENTROID_MAX_HZ)
    return clamp01(0.12 + 0.45 * (1.0 - c))


def features_to_lab(
    f0_hz: float,
    hnr_db: float,
    centroid_hz: float,
    f2_hz: float,
    tilt_slope: float,
    variant: str,
) -> tuple[float, float, float]:
    n_l = n_f0_for_lightness(f0_hz, centroid_hz)
    l_star = linear_map(n_l, LAB_L_OUT_MIN, LAB_L_OUT_MAX)
    n_hnr = normalize_to_unit(hnr_db, NORM_HNR_MIN_DB, NORM_HNR_MAX_DB)
    a_star = linear_map(n_hnr, LAB_A_OUT_MIN, LAB_A_OUT_MAX)

    n_cent = normalize_to_unit(centroid_hz, NORM_CENTROID_MIN_HZ, NORM_CENTROID_MAX_HZ)
    n_f2 = normalize_to_unit(f2_hz, NORM_F2_MIN_HZ, NORM_F2_MAX_HZ)

    v = variant.strip().upper()
    if v == "B":
        b_in = normalize_to_unit(tilt_slope, NORM_TILT_SLOPE_MIN, NORM_TILT_SLOPE_MAX)
    elif v == "C":
        b_in = n_f2
    else:
        b_in = n_cent
    b_star = linear_map(b_in, LAB_B_OUT_MIN, LAB_B_OUT_MAX)
    return l_star, a_star, b_star


def format_float(value: float, digits: int = 1) -> str:
    return f"{value:.{digits}f}" if np.isfinite(value) else "nan"


def process_clip(path: Path) -> tuple[str, np.ndarray] | None:
    y, sr = librosa.load(path, sr=SR, mono=True)
    if TRIM_TOP_DB is not None:
        y, _ = librosa.effects.trim(y, top_db=TRIM_TOP_DB)
    if len(y) < N_FFT:
        print(f"\n=== {path.name} ===")
        print(f"Skipped: too short after trim ({len(y)} samples, need {N_FFT}).")
        return None

    f0, voiced_flag, _ = librosa.pyin(
        y, fmin=PYIN_FMIN_HZ, fmax=PYIN_FMAX_HZ, sr=sr, hop_length=HOP_LENGTH
    )
    f0_hz = float(np.nanmedian(f0[voiced_flag])) if np.any(voiced_flag) else float("nan")
    pitch_range_sem = pitch_range_semitones(f0, voiced_flag)

    S_mag = np.abs(librosa.stft(y, n_fft=N_FFT, hop_length=HOP_LENGTH, center=False))
    tilt_frames = spectral_tilt_slope_series(S_mag, sr)
    tilt_finite = tilt_frames[np.isfinite(tilt_frames)]
    tilt_med = float(np.median(tilt_finite)) if tilt_finite.size else float("nan")
    tilt_for_lab = (
        tilt_med
        if np.isfinite(tilt_med)
        else (NORM_TILT_SLOPE_MIN + NORM_TILT_SLOPE_MAX) / 2.0
    )

    rms = librosa.feature.rms(y=y, frame_length=N_FFT, hop_length=HOP_LENGTH, center=False)
    centroid = librosa.feature.spectral_centroid(
        y=y, sr=sr, n_fft=N_FFT, hop_length=HOP_LENGTH, center=False
    )
    flatness = librosa.feature.spectral_flatness(
        y=y, n_fft=N_FFT, hop_length=HOP_LENGTH, center=False
    )

    hnr_db_frames = hnr_proxy_db_stft(y)
    f2_frames = f2_series(y, sr)

    rms_mean = float(np.mean(rms))
    hnr_finite = hnr_db_frames[np.isfinite(hnr_db_frames)]
    hnr_db = float(np.median(hnr_finite)) if hnr_finite.size else 0.0
    centroid_hz = float(np.median(centroid))
    f2_hz = float(np.nanmedian(f2_frames))
    if not np.isfinite(f2_hz):
        f2_hz = (NORM_F2_MIN_HZ + NORM_F2_MAX_HZ) / 2.0
    flat_med = float(np.median(flatness))

    def lab_hex_from_variant(variant: str) -> tuple[np.ndarray, str, float, float, float]:
        L, A, B = features_to_lab(f0_hz, hnr_db, centroid_hz, f2_hz, tilt_for_lab, variant)
        lab = np.array([L, A, B], dtype=np.float64)
        rgb = lab_to_display_rgb(lab)
        return rgb, to_hex(rgb), L, A, B

    rgb_a, hex_a, La, Aa, Ba = lab_hex_from_variant("A")
    rgb_b, hex_b, Lb, Ab, Bb = lab_hex_from_variant("B")
    rgb_c, hex_c, Lc, Ac, Bc = lab_hex_from_variant("C")

    print(f"\n=== {path.name} ===")
    print(
        f"Clip-level features:\n"
        f"  RMS mean: {rms_mean:.4f}\n"
        f"  HNR proxy (median dB): {hnr_db:.2f}\n"
        f"  Spectral centroid median (Hz): {centroid_hz:.1f}\n"
        f"  F2 median (Hz): {f2_hz:.1f}\n"
        f"  F0 median voiced (Hz): {format_float(f0_hz, 1)}\n"
        f"  Pitch range (semitones): {format_float(pitch_range_sem, 2)}\n"
        f"  Spectral tilt proxy (median slope dB / log10 Hz): {format_float(tilt_med, 3)}\n"
        f"  --- not mapped to color ---\n"
        f"  Spectral flatness median: {flat_med:.4f}\n"
    )
    print(
        f"Mapping A (b*←centroid): CIELAB L*={La:.2f}, a*={Aa:.2f}, b*={Ba:.2f}  Hex: {hex_a}\n"
        f"Mapping B (b*←tilt):     CIELAB L*={Lb:.2f}, a*={Ab:.2f}, b*={Bb:.2f}  Hex: {hex_b}\n"
        f"Mapping C (b*←F2):      CIELAB L*={Lc:.2f}, a*={Ac:.2f}, b*={Bc:.2f}  Hex: {hex_c}"
    )

    use = MAPPING_DEFAULT.strip().upper()
    if use == "B":
        return path.stem, rgb_b
    if use == "C":
        return path.stem, rgb_c
    return path.stem, rgb_a


def save_concatenated_colors(swatches: list[tuple[str, np.ndarray]], output_path: Path) -> None:
    tile_h = 120
    tile_w = 120
    strip = np.zeros((tile_h, tile_w * len(swatches), 3), dtype=np.float64)
    for i, (_, rgb) in enumerate(swatches):
        strip[:, i * tile_w : (i + 1) * tile_w, :] = rgb
    plt.imsave(output_path, np.clip(strip, 0.0, 1.0))


def main() -> None:
    recordings_dir = Path(__file__).resolve().parent / "recordings"
    clips = sorted(recordings_dir.glob("*.m4a"))

    if not recordings_dir.exists():
        print(f"Recordings folder not found: {recordings_dir}")
        return
    if not clips:
        print(f"No .m4a files found in: {recordings_dir}")
        return

    print(f"Found {len(clips)} clip(s) in {recordings_dir}")
    swatches: list[tuple[str, np.ndarray]] = []
    for clip_path in clips:
        swatch = process_clip(clip_path)
        if swatch is not None:
            swatches.append(swatch)

    if not swatches:
        print("No valid clips produced colors.")
        return

    out_path = Path(__file__).resolve().parent / "voice_colors_concat.png"
    save_concatenated_colors(swatches, out_path)
    print(f"\nSaved concatenated voice-color image ({MAPPING_DEFAULT} mapping): {out_path}")


if __name__ == "__main__":
    main()

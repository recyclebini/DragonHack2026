# How to run the voice → color demo

This folder contains the **standalone script** `voice_to_color_demo.py`. There is no separate notebook in this repo; you run the script with Python from the command line.

## Prerequisites

- **Python 3.10 or newer**
- Audio clips as **`.m4a`** files placed in `scripts/recordings/` (the script scans that folder only).
- Dependencies are listed in `requirements-notebook.txt` (librosa, numpy, scipy, matplotlib, scikit-image, soundfile, etc.).

On **macOS**, if installing `soundfile` fails with a missing `libsndfile` error, install the system library first:

```bash
brew install libsndfile
```

## Setup (recommended: virtual environment)

From the **project root** (the folder that contains `scripts/`):

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r scripts/requirements-notebook.txt
```

On Windows, activate the venv with `.venv\Scripts\activate` instead of `source .venv/bin/activate`.

## Prepare audio

1. Create `scripts/recordings/` if it does not exist.
2. Copy your speech clips into that folder as **`.m4a`** files (mono or stereo; the script loads mono at a fixed sample rate).

## Run the script

With the venv activated, from the **project root**:

```bash
python scripts/voice_to_color_demo.py
```

Or from inside `scripts/`:

```bash
cd scripts
python voice_to_color_demo.py
```

### What you get

- **Standard output:** For each clip, printed features (RMS, HNR proxy, centroid, F2, F0, etc.) and three CIELAB / hex color variants (**A** = centroid → b\*, **B** = spectral tilt → b\*, **C** = F2 → b\*).
- **Image file:** `scripts/voice_colors_concat.png` — a horizontal strip of color swatches, one per successfully processed clip, using the mapping chosen by `MAPPING_DEFAULT` at the top of `voice_to_color_demo.py` (`"A"`, `"B"`, or `"C"`).

### Save the printed text to a file

To capture everything the script **prints** to the terminal into a text file, redirect **standard output** with `>`:

```bash
python scripts/voice_to_color_demo.py > output.txt
```

That writes the log lines to `output.txt` in your **current working directory** (not necessarily `scripts/`). The PNG is still written to `scripts/voice_colors_concat.png` next to the script.

**Note:** `>` only redirects **stdout**. Warnings or errors on **stderr** (for example from libraries) may still appear in the terminal. To send both streams to the same file:

```bash
python scripts/voice_to_color_demo.py > output.txt 2>&1
```

### IDE / interpreter

If you use **Cursor / VS Code**, select the Python interpreter that has this venv’s packages, then you can run `voice_to_color_demo.py` from the editor’s run button if you prefer.

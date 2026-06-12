"""Convert facebook/wav2vec2-xlsr-53-espeak-cv-ft to quantized ONNX
chunks the Lettertjes leren app can load in the browser.

Runs in the convert-model GitHub Action. Steps:
  1. export the CTC model with torch.onnx.export (no tokenizer — it
     needs espeak, and the app maps IPA tokens to letters itself)
  2. fetch vocab.json/config.json as plain files
  3. quantize to int8
  4. smoke-test the quantized model
  5. split into <100MB chunks + manifest under model/
"""
import json
import math
import os
import sys
import traceback

MODEL_ID = "facebook/wav2vec2-xlsr-53-espeak-cv-ft"
CHUNK = 90 * 1024 * 1024


def strip_weight_norm(model):
    """torch.onnx.export can't trace weight-norm parametrizations (the
    positional conv in wav2vec2 uses one); bake them into plain weights."""
    import torch
    from torch.nn.utils import parametrize

    for mod in model.modules():
        if getattr(mod, "parametrizations", None):
            for name in list(mod.parametrizations.keys()):
                parametrize.remove_parametrizations(mod, name)
        elif hasattr(mod, "weight_g") and hasattr(mod, "weight_v"):
            try:
                torch.nn.utils.remove_weight_norm(mod)
            except Exception:
                pass


def main():
    import torch
    from transformers import Wav2Vec2ForCTC

    os.makedirs("export", exist_ok=True)
    os.makedirs("model", exist_ok=True)

    print("== loading model ==", flush=True)
    model = Wav2Vec2ForCTC.from_pretrained(MODEL_ID, return_dict=False)
    model.eval()
    strip_weight_norm(model)

    print("== exporting to ONNX ==", flush=True)
    x = torch.zeros(1, 16000)
    torch.onnx.export(
        model, x, "export/model.onnx",
        input_names=["input_values"], output_names=["logits"],
        dynamic_axes={"input_values": {0: "batch", 1: "samples"},
                      "logits": {0: "batch", 1: "frames"}},
        opset_version=14)
    print("export OK:", os.path.getsize("export/model.onnx") / 1e6, "MB")

    print("== fetching vocab/config ==", flush=True)
    import shutil
    from huggingface_hub import hf_hub_download
    for f in ["vocab.json", "config.json"]:
        shutil.copy(hf_hub_download(MODEL_ID, f), "export/" + f)

    print("== quantizing ==", flush=True)
    # MatMul only: quantizing Conv produces ConvInteger nodes, which
    # neither onnxruntime CPU nor onnxruntime-web WASM implements. The
    # conv feature extractor is ~1.5% of the weights, so fp32 is fine.
    from onnxruntime.quantization import quantize_dynamic, QuantType
    quantize_dynamic("export/model.onnx", "model_q8.onnx",
                     weight_type=QuantType.QInt8,
                     op_types_to_quantize=["MatMul"])
    print("quantized:", os.path.getsize("model_q8.onnx") / 1e6, "MB")

    print("== smoke test ==", flush=True)
    import numpy as np
    import onnxruntime as ort
    s = ort.InferenceSession("model_q8.onnx")
    out = s.run(None, {"input_values": np.zeros((1, 16000), np.float32)})[0]
    vocab = json.load(open("export/vocab.json"))
    print("logits shape:", out.shape, "vocab size:", len(vocab))
    assert out.ndim == 3 and out.shape[1] > 0, out.shape
    assert out.shape[2] >= len(vocab), (out.shape, len(vocab))

    print("== splitting ==", flush=True)
    tok2id = vocab
    id2tok = [None] * (max(tok2id.values()) + 1)
    for tok, i in tok2id.items():
        id2tok[i] = tok
    blank_id = json.load(open("export/config.json")).get("pad_token_id", 0)

    size = os.path.getsize("model_q8.onnx")
    parts = []
    with open("model_q8.onnx", "rb") as f:
        for n in range(math.ceil(size / CHUNK)):
            name = f"model.onnx.part{n:02d}"
            with open(f"model/{name}", "wb") as outf:
                outf.write(f.read(CHUNK))
            parts.append(name)

    with open("model/manifest.json", "w") as f:
        json.dump({"parts": parts, "totalBytes": size,
                   "vocab": id2tok, "blankId": blank_id}, f)
    print(f"done: {size/1e6:.0f} MB in {len(parts)} parts")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        traceback.print_exc()
        sys.exit(1)

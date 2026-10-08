"""Testes do pré-processamento (magic bytes, DICOM, letterbox, sha256)."""

from __future__ import annotations

import hashlib
import io
import warnings

import numpy as np
import pydicom
import pytest
from PIL import Image
from pydicom.dataset import Dataset, FileMetaDataset
from pydicom.uid import ExplicitVRLittleEndian, generate_uid

from app.application.analyze import ImageDecodeError
from app.infrastructure.imaging.preprocess import PillowImageCodec, detect_format


def make_raster(fmt: str, width: int = 2880, height: int = 1440) -> bytes:
    image = Image.new("RGB", (width, height), (120, 130, 140))
    buffer = io.BytesIO()
    image.save(buffer, format=fmt)
    return buffer.getvalue()


def make_dicom(rows: int = 64, cols: int = 64, frames: int = 1) -> bytes:
    shape = (frames, rows, cols) if frames > 1 else (rows, cols)
    pixels = np.linspace(0, 4095, rows * cols * frames, dtype=np.uint16).reshape(shape)

    file_meta = FileMetaDataset()
    file_meta.MediaStorageSOPClassUID = "1.2.840.10008.5.1.4.1.1.7"
    file_meta.MediaStorageSOPInstanceUID = generate_uid()
    file_meta.TransferSyntaxUID = ExplicitVRLittleEndian

    dataset = Dataset()
    dataset.file_meta = file_meta
    dataset.SOPClassUID = file_meta.MediaStorageSOPClassUID
    dataset.SOPInstanceUID = file_meta.MediaStorageSOPInstanceUID
    dataset.Rows = rows
    dataset.Columns = cols
    dataset.SamplesPerPixel = 1
    dataset.PhotometricInterpretation = "MONOCHROME2"
    dataset.BitsAllocated = 16
    dataset.BitsStored = 16
    dataset.HighBit = 15
    dataset.PixelRepresentation = 0
    dataset.WindowCenter = 2048
    dataset.WindowWidth = 4096
    if frames > 1:
        dataset.NumberOfFrames = frames
    dataset.PixelData = pixels.tobytes()

    buffer = io.BytesIO()
    pydicom.dcmwrite(buffer, dataset, write_like_original=False)
    return buffer.getvalue()


def make_color_dicom(rows: int = 32, cols: int = 32) -> bytes:
    pixels = np.zeros((rows, cols, 3), dtype=np.uint8)
    pixels[..., 0] = 200
    pixels[..., 1] = 100

    file_meta = FileMetaDataset()
    file_meta.MediaStorageSOPClassUID = "1.2.840.10008.5.1.4.1.1.7"
    file_meta.MediaStorageSOPInstanceUID = generate_uid()
    file_meta.TransferSyntaxUID = ExplicitVRLittleEndian

    dataset = Dataset()
    dataset.file_meta = file_meta
    dataset.SOPClassUID = file_meta.MediaStorageSOPClassUID
    dataset.SOPInstanceUID = file_meta.MediaStorageSOPInstanceUID
    dataset.Rows = rows
    dataset.Columns = cols
    dataset.SamplesPerPixel = 3
    dataset.PhotometricInterpretation = "YBR_FULL"
    dataset.PlanarConfiguration = 0
    dataset.BitsAllocated = 8
    dataset.BitsStored = 8
    dataset.HighBit = 7
    dataset.PixelRepresentation = 0
    dataset.PixelData = pixels.tobytes()

    buffer = io.BytesIO()
    pydicom.dcmwrite(buffer, dataset, write_like_original=False)
    return buffer.getvalue()


@pytest.fixture
def codec() -> PillowImageCodec:
    return PillowImageCodec(max_dimension=10_000, image_size=640)


@pytest.mark.parametrize("fmt", ["PNG", "JPEG"])
def test_preprocess_raster_gera_tensor_640(codec, fmt):
    raw = make_raster(fmt)
    result = codec.preprocess(raw, size=640)

    assert result.tensor.shape == (1, 3, 640, 640)
    assert result.tensor.dtype == np.float32
    assert float(result.tensor.min()) >= 0.0
    assert float(result.tensor.max()) <= 1.0

    assert result.original_size == (2880, 1440)
    assert result.scale == pytest.approx(640 / 2880)
    assert result.pad_x == pytest.approx(0.0)
    assert result.pad_y == pytest.approx(160.0)
    assert result.image.sha256 == hashlib.sha256(raw).hexdigest()
    expected_format = "png" if fmt == "PNG" else "jpeg"
    assert result.image.original_format == expected_format


def test_preprocess_dicom_aplica_windowing(codec):
    raw = make_dicom(rows=64, cols=64)
    result = codec.preprocess(raw, size=640)

    assert result.tensor.shape == (1, 3, 640, 640)
    assert result.image.original_format == "dicom"
    assert result.original_size == (64, 64)


def test_sniff_format_por_magic_bytes():
    assert detect_format(make_raster("PNG")) == "png"
    assert detect_format(make_raster("JPEG")) == "jpeg"
    assert detect_format(make_dicom()) == "dicom"
    assert detect_format(b"not-an-image") is None
    assert detect_format(b"") is None


def test_magic_bytes_invalidos_levanta_image_decode_error(codec):
    with pytest.raises(ImageDecodeError):
        codec.decode(b"GIF89a-not-supported")


def test_png_corrompido_levanta_image_decode_error(codec):
    corrupt = b"\x89PNG\r\n\x1a\n" + b"garbage-bytes"
    with pytest.raises(ImageDecodeError):
        codec.decode(corrupt)


def test_dimensao_acima_do_limite_levanta_erro():
    small_codec = PillowImageCodec(max_dimension=100, image_size=640)
    with pytest.raises(ImageDecodeError):
        small_codec.decode(make_raster("PNG", width=200, height=50))


def test_dicom_color_ybr_gera_rgb(codec):
    result = codec.decode(make_color_dicom(rows=32, cols=32))

    assert result.rgb.shape == (32, 32, 3)
    assert result.rgb.dtype == np.uint8
    assert result.original_format == "dicom"


def test_dicom_multiframe_rejeitado(codec):
    raw = make_dicom(rows=16, cols=16, frames=2)

    with pytest.raises(ImageDecodeError, match="multi-frame"):
        codec.decode(raw)


def test_dicom_acima_do_limite_rejeitado_sem_materializar_pixels():
    codec = PillowImageCodec(max_dimension=100, image_size=640)
    raw = make_dicom(rows=200, cols=200)

    with pytest.raises(ImageDecodeError, match="limite"):
        codec.decode(raw)


def test_letterbox_nao_altera_dimensoes_do_dicom():
    raw = make_dicom(rows=128, cols=32)
    codec = PillowImageCodec(max_dimension=10_000, image_size=640)
    result = codec.preprocess(raw)
    assert result.image.width == 32
    assert result.image.height == 128


def test_decompression_bomb_warning_vira_erro():
    codec = PillowImageCodec(max_dimension=100_000, image_size=640)
    raw = make_raster("PNG", width=100, height=100)

    original_limit = Image.MAX_IMAGE_PIXELS
    Image.MAX_IMAGE_PIXELS = 1_000
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            with pytest.raises(ImageDecodeError):
                codec.decode(raw)
    finally:
        Image.MAX_IMAGE_PIXELS = original_limit

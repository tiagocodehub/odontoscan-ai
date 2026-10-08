"""Decodificação de PNG/JPEG (Pillow) e DICOM (pydicom) + letterbox 640x640.

Segurança/robustez: validação por magic bytes, limite de pixels do Pillow e
dimensão máxima configurável, evitando decompression bombs.
"""

from __future__ import annotations

import hashlib
import io
import warnings
from pathlib import Path

import cv2
import numpy as np
import pydicom
from PIL import Image, UnidentifiedImageError
from pydicom.pixels import pixel_array as pydicom_pixel_array

from app.application.analyze import ImageDecodeError
from app.application.ports import DecodedImage, PreprocessResult

PNG_MAGIC = b"\x89PNG\r\n\x1a\n"
JPEG_MAGIC = b"\xff\xd8\xff"
DICOM_MAGIC = b"DICM"
LETTERBOX_FILL = 114

COLOR_PHOTOMETRICS = frozenset(
    {
        "RGB",
        "YBR_FULL",
        "YBR_FULL_422",
        "YBR_PARTIAL_422",
        "YBR_PARTIAL_420",
        "YBR_ICT",
        "YBR_RCT",
        "PALETTE COLOR",
    }
)


def detect_panorama_crop(
    rgb: np.ndarray,
    bright_threshold: int = 60,
    row_fraction: float = 0.85,
    row_mean_threshold: float = 55.0,
    col_fraction: float = 0.6,
) -> tuple[int, int, int, int] | None:
    """Localiza a faixa da radiografia panorâmica (remove cabeçalho/rodapé/insets).

    Heurística por projeções: as linhas do exame cobrem quase toda a largura e têm
    brilho médio alto; o cabeçalho (texto esparso sobre fundo escuro) e os recortes
    intraorais do rodapé não satisfazem as duas condições ao mesmo tempo.

    Retorna `(x, y, width, height)` ou `None` quando não há recorte confiável.
    """

    if rgb.ndim != 3 or rgb.shape[0] < 8 or rgb.shape[1] < 8:
        return None

    gray = rgb.astype(np.float32).mean(axis=2)
    bright = gray > bright_threshold

    row_fraction_values = bright.mean(axis=1)
    row_mean_values = gray.mean(axis=1)
    rows = np.where(
        (row_fraction_values > row_fraction) & (row_mean_values > row_mean_threshold)
    )[0]
    if rows.size == 0:
        return None

    y0, y1 = int(rows.min()), int(rows.max())
    band = bright[y0 : y1 + 1]
    col_fraction_values = band.mean(axis=0)
    cols = np.where(col_fraction_values > col_fraction)[0]
    if cols.size == 0:
        return None

    x0, x1 = int(cols.min()), int(cols.max())
    return x0, y0, x1 - x0 + 1, y1 - y0 + 1


def detect_format(data: bytes) -> str | None:
    """Sniff de formato por magic bytes (não confia em extensão/content-type)."""

    if not data:
        return None
    if data.startswith(PNG_MAGIC):
        return "png"
    if data.startswith(JPEG_MAGIC):
        return "jpeg"
    if len(data) >= 132 and data[128:132] == DICOM_MAGIC:
        return "dicom"
    return None


class PillowImageCodec:
    """Implementa ImageCodecPort."""

    def __init__(
        self,
        max_dimension: int = 10_000,
        image_size: int = 640,
        max_frames: int = 1,
        max_image_pixels: int | None = None,
        auto_crop: bool = True,
        crop_min_gain: float = 0.05,
    ) -> None:
        self._max_dimension = max_dimension
        self._image_size = image_size
        self._max_frames = max_frames
        self._max_image_pixels = max_image_pixels
        self._auto_crop = auto_crop
        self._crop_min_gain = crop_min_gain

    def sniff_format(self, data: bytes) -> str | None:
        return detect_format(data)

    def decode(self, data: bytes) -> DecodedImage:
        fmt = detect_format(data)
        if fmt is None:
            raise ImageDecodeError("Magic bytes inválidos: formato não reconhecido.")

        if fmt == "dicom":
            rgb = self._decode_dicom(data)
        else:
            rgb = self._decode_raster(data)

        height, width = rgb.shape[:2]
        if width <= 0 or height <= 0:
            raise ImageDecodeError("Imagem com dimensões inválidas.")
        if width > self._max_dimension or height > self._max_dimension:
            raise ImageDecodeError(
                f"Dimensões acima do limite de {self._max_dimension}px."
            )

        return DecodedImage(
            rgb=rgb,
            width=width,
            height=height,
            format=fmt,
            original_format=fmt,
            raw=data,
            sha256=hashlib.sha256(data).hexdigest(),
        )

    def preprocess(self, data: bytes, size: int = 640) -> PreprocessResult:
        decoded = self.decode(data)

        rgb = decoded.rgb
        crop_offset = (0, 0)
        crop_size: tuple[int, int] | None = None

        if self._auto_crop:
            box = detect_panorama_crop(rgb)
            if box is not None:
                x, y, crop_w, crop_h = box
                area_ratio = (crop_w * crop_h) / (decoded.width * decoded.height)
                # Só recorta se remover uma fração relevante (evita recorte inútil).
                if area_ratio <= 1.0 - self._crop_min_gain:
                    rgb = rgb[y : y + crop_h, x : x + crop_w]
                    crop_offset = (x, y)
                    crop_size = (crop_w, crop_h)

        tensor, scale, pad_x, pad_y = self._letterbox(rgb, size)
        return PreprocessResult(
            tensor=tensor,
            scale=scale,
            pad_x=pad_x,
            pad_y=pad_y,
            original_size=(decoded.width, decoded.height),
            image=decoded,
            crop_offset=crop_offset,
            crop_size=crop_size,
        )

    def _decode_raster(self, data: bytes) -> np.ndarray:
        if self._max_image_pixels is not None:
            Image.MAX_IMAGE_PIXELS = self._max_image_pixels

        try:
            with warnings.catch_warnings():
                warnings.simplefilter("error", Image.DecompressionBombWarning)
                with Image.open(io.BytesIO(data)) as img:
                    img.load()
                    rgb = img.convert("RGB")
                    array = np.asarray(rgb)
        except (Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
            raise ImageDecodeError("Imagem excede o limite de pixels permitido.") from exc
        except (UnidentifiedImageError, OSError, ValueError) as exc:
            raise ImageDecodeError("Arquivo de imagem corrompido ou ilegível.") from exc

        if array.ndim != 3 or array.shape[2] < 3:
            raise ImageDecodeError("Imagem RGB inválida após decodificação.")
        return np.ascontiguousarray(array[:, :, :3].astype(np.uint8))

    def _decode_dicom(self, data: bytes) -> np.ndarray:
        try:
            dataset = pydicom.dcmread(io.BytesIO(data), force=True)
        except Exception as exc:  # noqa: BLE001 - pydicom lança variados tipos
            raise ImageDecodeError("Arquivo DICOM corrompido ou ilegível.") from exc

        rows = self._read_int(dataset, "Rows")
        columns = self._read_int(dataset, "Columns")
        frames = self._read_int(dataset, "NumberOfFrames", default=1)
        samples = self._read_int(dataset, "SamplesPerPixel", default=1)
        bits = self._read_int(dataset, "BitsAllocated")

        if (
            rows is None
            or columns is None
            or frames is None
            or samples is None
            or bits is None
            or rows <= 0
            or columns <= 0
            or frames < 1
            or samples < 1
            or bits <= 0
        ):
            raise ImageDecodeError("DICOM com dimensões de pixel inválidas.")

        if frames > self._max_frames:
            raise ImageDecodeError(
                f"DICOM multi-frame ({frames} frames) não suportado na v1."
            )

        if rows * columns * frames > self._max_dimension**2:
            raise ImageDecodeError(
                f"DICOM excede o limite de {self._max_dimension}px por dimensão."
            )

        photometric = str(getattr(dataset, "PhotometricInterpretation", "")).upper()

        try:
            if samples == 1 and photometric not in COLOR_PHOTOMETRICS:
                return self._decode_dicom_monochrome(dataset, photometric)
            return self._decode_dicom_color(dataset, samples, photometric)
        except ImageDecodeError:
            raise
        except Exception as exc:  # noqa: BLE001 - normaliza falhas da pydicom
            raise ImageDecodeError("Arquivo DICOM corrompido ou ilegível.") from exc

    def _decode_dicom_monochrome(
        self,
        dataset: pydicom.Dataset,
        photometric: str,
    ) -> np.ndarray:
        pixels = np.asarray(dataset.pixel_array).astype(np.float32)
        if pixels.ndim != 2:
            raise ImageDecodeError("DICOM monocromático com formato inesperado.")

        pixels = self._apply_windowing(dataset, pixels)
        if photometric == "MONOCHROME1":
            pixels = 255.0 - pixels

        gray = np.clip(pixels, 0.0, 255.0).astype(np.uint8)
        return np.ascontiguousarray(np.stack([gray, gray, gray], axis=-1))

    def _decode_dicom_color(
        self,
        dataset: pydicom.Dataset,
        samples: int,
        photometric: str,
    ) -> np.ndarray:
        try:
            pixels = pydicom_pixel_array(dataset)
        except Exception as exc:  # noqa: BLE001 - decodificadores variados
            raise ImageDecodeError(
                f"DICOM com fotometria '{photometric}' não suportada."
            ) from exc

        array = np.asarray(pixels)
        if array.ndim != 3:
            raise ImageDecodeError(
                f"DICOM com {samples} canais não suportado (fotometria '{photometric}')."
            )

        array = array[:, :, :3].astype(np.float32)
        max_value = float(array.max()) if array.size else 0.0
        if max_value > 255.0:
            array = array * (255.0 / max_value)
        return np.ascontiguousarray(np.clip(array, 0.0, 255.0).astype(np.uint8))

    @staticmethod
    def _read_int(
        dataset: pydicom.Dataset,
        keyword: str,
        default: int | None = None,
    ) -> int | None:
        value = getattr(dataset, keyword, None)
        if value is None:
            return default
        try:
            return int(np.atleast_1d(value)[0])
        except (TypeError, ValueError):
            return default

    @staticmethod
    def _apply_windowing(dataset: pydicom.Dataset, array: np.ndarray) -> np.ndarray:
        center = getattr(dataset, "WindowCenter", None)
        width = getattr(dataset, "WindowWidth", None)

        if center is not None and width is not None:
            center = float(np.atleast_1d(center)[0])
            width = float(np.atleast_1d(width)[0])
            low = center - width / 2.0
            high = center + width / 2.0
        else:
            low = float(array.min())
            high = float(array.max())

        if high <= low:
            high = low + 1.0

        scaled = (array - low) / (high - low) * 255.0
        return np.clip(scaled, 0.0, 255.0)

    @staticmethod
    def _letterbox(rgb: np.ndarray, size: int) -> tuple[np.ndarray, float, float, float]:
        height, width = rgb.shape[:2]
        scale = min(size / width, size / height)
        new_width = int(round(width * scale))
        new_height = int(round(height * scale))

        resized = cv2.resize(
            rgb,
            (new_width, new_height),
            interpolation=cv2.INTER_LINEAR,
        )

        canvas = np.full((size, size, 3), LETTERBOX_FILL, dtype=np.uint8)
        pad_x = (size - new_width) // 2
        pad_y = (size - new_height) // 2
        canvas[pad_y : pad_y + new_height, pad_x : pad_x + new_width] = resized

        tensor = canvas.astype(np.float32) / 255.0
        tensor = np.transpose(tensor, (2, 0, 1))[None, ...]
        return np.ascontiguousarray(tensor), float(scale), float(pad_x), float(pad_y)

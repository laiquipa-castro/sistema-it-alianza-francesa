# ---------------------------------------------------------------------------
# Imagen de producción para el backend FastAPI (Render / Railway).
# ---------------------------------------------------------------------------
FROM python:3.11-slim

# Variables de entorno de Python
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Instalar dependencias (capa cacheable)
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

# Copiar el código de la aplicación
COPY . .

# Exponer el puerto dinámico de Render/Railway ($PORT)
EXPOSE 8000

# Arrancar uvicorn en el puerto indicado por la plataforma
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]

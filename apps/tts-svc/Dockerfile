FROM python:3.11-slim
WORKDIR /app
RUN apt-get update && apt-get install -y espeak-ng curl && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app.py .
ENV PORT=4030
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "4030"]

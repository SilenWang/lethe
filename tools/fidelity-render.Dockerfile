FROM ubuntu:24.04

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        fonts-dejavu-core \
        fonts-liberation \
        libreoffice-calc \
        libreoffice-impress \
        libreoffice-writer \
        poppler-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /work

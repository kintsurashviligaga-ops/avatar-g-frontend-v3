#!/usr/bin/env bash
# A certificate for the Video Core E2E job's TLS front (tls-front.mjs), from a CA made here for this run only.
# The CA's key is deleted as soon as the leaf is signed, so nothing else can ever be issued under it; both expire in a
# day. Writes <dir>/ca.pem (to trust), <dir>/leaf.pem and <dir>/leaf.key (for the front). Prints no key material.
# usage: make-tls.sh <host> <dir>
set -euo pipefail
host="${1:?usage: make-tls.sh <host> <dir>}"
dir="${2:?usage: make-tls.sh <host> <dir>}"
mkdir -p "$dir"
chmod 700 "$dir"
cd "$dir"
umask 077
openssl req -x509 -newkey rsa:2048 -sha256 -nodes -days 1 -subj "/CN=video-core-e2e run CA" \
  -addext "basicConstraints=critical,CA:TRUE,pathlen:0" -addext "keyUsage=critical,keyCertSign,cRLSign" \
  -keyout ca.key -out ca.pem 2>/dev/null
openssl req -newkey rsa:2048 -sha256 -nodes -subj "/CN=$host" -keyout leaf.key -out leaf.csr 2>/dev/null
printf 'subjectAltName=DNS:%s\nbasicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n' "$host" >leaf.ext
openssl x509 -req -sha256 -in leaf.csr -CA ca.pem -CAkey ca.key -CAcreateserial -days 1 -extfile leaf.ext -out leaf.pem 2>/dev/null
rm -f ca.key ca.srl leaf.csr leaf.ext
chmod 644 ca.pem leaf.pem
openssl verify -CAfile ca.pem leaf.pem >/dev/null
echo "tls: leaf for $host signed by a CA made for this run (CA key deleted)"

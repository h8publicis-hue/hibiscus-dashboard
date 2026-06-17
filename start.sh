#!/bin/bash
cd "$(dirname "$0")"
source .env.local

pkill -f "node server.js" 2>/dev/null
sleep 1

IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "localhost")

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║   🌴  HIBISCUS BEACH CLUB DASHBOARD          ║"
echo "╠══════════════════════════════════════════════╣"
echo "║   Acesse em qualquer dispositivo na rede:    ║"
echo "║"
echo "║   👉  http://$IP:3001"
echo "║"
echo "╚══════════════════════════════════════════════╝"
echo ""

PORT=3001 \
VITE_PAYTOUR_APP_KEY=$VITE_PAYTOUR_APP_KEY \
VITE_PAYTOUR_APP_SECRET=$VITE_PAYTOUR_APP_SECRET \
GOOGLE_PLACES_API_KEY=$GOOGLE_PLACES_API_KEY \
GOOGLE_PLACE_ID=$GOOGLE_PLACE_ID \
node server.js

TEST-ONLY (branch claude/test-personas-live, never merged). Language probe for the Live call, 2026-10-25.
Each variant JSON is the setup frame the mint route builds for persona "sarcastic", UI locale ka (model rewritten to
the Vertex resource by run.mjs). v0 = what production sends today; v1 = English persona; v2 = v1 + language rule on top;
v3 = minimal (persona + language rule only); v4 = v0 + a short Georgian chat thread.
Turns: en1 "Can you tell me how to spend the night today in Tbilisi?", ru1 "Как я могу попасть в Батуми из Тбилиси?",
ru2 "А сколько стоит билет на поезд?".

# Product extraction API

API w Express i TypeScript, które wysyła tekst do modelu przez OpenRouter. Model zwraca wynik przez narzędzie Model Context Protocol `return_products`.

## Uruchomienie

```bash
npm install
export OPENROUTER_API_KEY='twój-klucz'
npm run dev
```

Opcjonalnie model można zmienić przez `OPENROUTER_MODEL` (domyślnie `openai/gpt-4o-mini`).

Domyślnie serwer działa pod `http://localhost:3000`.

## Docker

Uruchom aplikację w kontenerze, przekazując klucz OpenRouter:

```bash
export OPENROUTER_API_KEY='twój-klucz'
docker compose up --build
```

API będzie dostępne pod `http://localhost:3000`. Port hosta można zmienić przez `PORT`, a model przez `OPENROUTER_MODEL`.

## REST

```bash
curl -X POST http://localhost:3000/extract \
	-H 'Content-Type: application/json' \
	-d '{"text":"2 kg jabłek, mleko 1 l, 3 szt. jajek"}'
```

Odpowiedź:

```json
{"products":[
	{"name":"jabłek","quantity":2,"unit":"kg","category":"owoce"},
	{"name":"mleko","quantity":1,"unit":"l","category":"nabiał"},
	{"name":"jajek","quantity":3,"unit":"szt","category":"nabiał"}
]}
```

Dozwolone kategorie to: `owoce`, `warzywa`, `nabiał`, `mięso i ryby`, `pieczywo`, `produkty sypkie`, `napoje`, `słodycze i przekąski`, `mrożonki`, `konserwy`, `przyprawy i sosy`, `śniadaniowe` oraz `inne`.

## MCP

Endpoint MCP znajduje się pod `POST /mcp`. Narzędzie nazywa się `return_products` i przyjmuje argument `{ "products": [...] }`. Transport używa stateless Streamable HTTP, więc endpoint może być używany przez klientów MCP bez utrzymywania sesji.
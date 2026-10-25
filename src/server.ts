import cors from "cors";
import express, { type Request, type Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { createServer } from "node:https";
import { readFileSync } from "node:fs";

const port = Number(process.env.PORT ?? 3000);
const openRouterApiKey = process.env.OPENROUTER_API_KEY;
const openRouterModel = process.env.OPENROUTER_MODEL ?? "openai/gpt-4o-mini";
const app = express();
const mcpServer = new McpServer({ name: "product-extractor", version: "1.0.0" });

app.use(cors());
app.use(express.json());

const productCategories = [
  "owoce",
  "warzywa",
  "nabiał",
  "mięso i ryby",
  "pieczywo",
  "produkty sypkie",
  "napoje",
  "słodycze i przekąski",
  "mrożonki",
  "konserwy",
  "przyprawy i sosy",
  "śniadaniowe",
  "inne",
] as const;
const categorySchema = z.enum(productCategories);
const productSchema = z.object({
  name: z.string().min(1),
  quantity: z.number().positive(),
  unit: z.string().min(1),
  category: categorySchema,
});
const productsResultSchema = z.object({ products: z.array(productSchema) });
const productTool = {
  type: "function" as const,
  function: {
    name: "return_products",
    description: "Return the products found in the user's text with quantity and unit.",
    parameters: {
      type: "object",
      properties: {
        products: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              quantity: { type: "number" },
              unit: { type: "string" },
              category: { type: "string", enum: productCategories },
            },
            required: ["name", "quantity", "unit", "category"],
            additionalProperties: false,
          },
        },
      },
      required: ["products"],
      additionalProperties: false,
    },
  },
};

mcpServer.registerTool(
  "return_products",
  {
    title: "Return products",
    description: "Return product names, quantities, units and food categories extracted by an LLM.",
    inputSchema: { products: z.array(productSchema) },
  },
  async ({ products }) => {
    const result = { products };
    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
      structuredContent: result,
    };
  },
);

app.get("/health", (_request, response) => {
  response.json({ status: "ok" });
});

app.post("/extract", async (request: Request, response: Response) => {
  const text = request.body?.text;
  if (typeof text !== "string" || text.trim().length === 0) {
    response.status(400).json({ error: "Pole 'text' jest wymaganym, niepustym stringiem." });
    return;
  }

  if (!openRouterApiKey) {
    response.status(503).json({ error: "Brak zmiennej środowiskowej OPENROUTER_API_KEY." });
    return;
  }

  try {
    const openRouterResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openRouterApiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "Product extraction API",
      },
      body: JSON.stringify({
        model: openRouterModel,
        messages: [
          {
            role: "system",
            content:
              `Extract every product from the user's text. Always call return_products. Preserve the original product language. Use a numeric quantity and a concise unit such as kg, g, l, ml or szt. Assign exactly one category from this list: ${productCategories.join(", ")}. Use "inne" when no category fits.`,
          },
          { role: "user", content: text },
        ],
        tools: [productTool],
        tool_choice: { type: "function", function: { name: "return_products" } },
        temperature: 0,
      }),
    });

    if (!openRouterResponse.ok) {
      const details = await openRouterResponse.text();
      console.error("OpenRouter request failed", details);
      response.status(502).json({ error: "OpenRouter zwrócił błąd." });
      return;
    }

    const completion = (await openRouterResponse.json()) as {
      choices?: Array<{ message?: { tool_calls?: Array<{ function?: { name?: string; arguments?: string } }> } }>;
    };
    const toolCall = completion.choices?.[0]?.message?.tool_calls?.find(
      (call) => call.function?.name === "return_products",
    );
    if (!toolCall?.function?.arguments) {
      response.status(502).json({ error: "Model nie wywołał narzędzia MCP return_products." });
      return;
    }

    const result = productsResultSchema.parse(JSON.parse(toolCall.function.arguments));
    response.json(result);
  } catch (error) {
    console.error("Product extraction failed", error);
    response.status(502).json({ error: "Nie udało się przetworzyć odpowiedzi OpenRouter." });
  }
});

app.all("/mcp", async (request: Request, response: Response) => {
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  response.on("close", () => transport.close());

  try {
    await mcpServer.connect(transport);
    await transport.handleRequest(request, response, request.body);
  } catch (error) {
    console.error("MCP request failed", error);
    if (!response.headersSent) response.status(500).json({ error: "Błąd serwera MCP." });
  }
});

const httpsServer = createServer(
  {
    key: readFileSync("/certs/privkey.pem"),
    cert: readFileSync("/certs/fullchain.pem"),
    minVersion: "TLSv1.2",
  },
  app,
);

httpsServer.listen(port, "0.0.0.0", () => {
  console.log(`Product API listening on HTTPS port ${port}`);
});